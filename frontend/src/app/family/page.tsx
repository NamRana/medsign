"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useFamily } from "@/lib/family-context";

interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  date_of_birth: string | null;
  gender: string | null;
  blood_group: string | null;
  avatar_color: string;
  is_primary: boolean;
  patient_id: string | null;
  created_at: string;
}

interface MemberProfile {
  healthScore: number;
  totalAssessments: number;
  recentConversations: { id: string; chief_complaint: string | null; created_at: string; status: string }[];
  loading: boolean;
}

const RELATIONSHIPS = [
  { value: "self", label: "Self" },
  { value: "mother", label: "Mother" },
  { value: "father", label: "Father" },
  { value: "spouse", label: "Spouse" },
  { value: "child", label: "Child" },
  { value: "sibling", label: "Sibling" },
  { value: "grandparent", label: "Grandparent" },
  { value: "other", label: "Other" },
];

const AVATAR_COLORS: Record<string, { bg: string; text: string; gradient: string }> = {
  emerald: { bg: "bg-emerald-100", text: "text-emerald-700", gradient: "from-emerald-500 to-teal-600" },
  blue: { bg: "bg-blue-100", text: "text-blue-700", gradient: "from-blue-500 to-indigo-600" },
  purple: { bg: "bg-purple-100", text: "text-purple-700", gradient: "from-purple-500 to-indigo-600" },
  rose: { bg: "bg-rose-100", text: "text-rose-700", gradient: "from-rose-500 to-pink-600" },
  amber: { bg: "bg-amber-100", text: "text-amber-700", gradient: "from-amber-500 to-orange-600" },
  teal: { bg: "bg-teal-100", text: "text-teal-700", gradient: "from-teal-500 to-cyan-600" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-700", gradient: "from-indigo-500 to-violet-600" },
  orange: { bg: "bg-orange-100", text: "text-orange-700", gradient: "from-orange-500 to-red-600" },
};

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function getRelationshipIcon(rel: string) {
  switch (rel) {
    case "self": return "🙋";
    case "mother": return "👩";
    case "father": return "👨";
    case "spouse": return "💑";
    case "child": return "👶";
    case "sibling": return "👫";
    case "grandparent": return "👴";
    default: return "👤";
  }
}

function getAge(dob: string): string {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
    years--;
  }
  return `${years} yrs`;
}

export default function FamilyPage() {
  const router = useRouter();
  const { setActiveMember } = useFamily();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null);
  const [profile, setProfile] = useState<MemberProfile>({ healthScore: 0, totalAssessments: 0, recentConversations: [], loading: false });
  const [scores, setScores] = useState<Record<string, number | null>>({});

  // Form state
  const [formName, setFormName] = useState("");
  const [formRelationship, setFormRelationship] = useState("mother");
  const [formDob, setFormDob] = useState("");
  const [formGender, setFormGender] = useState("");
  const [formBloodGroup, setFormBloodGroup] = useState("");
  const [formColor, setFormColor] = useState("blue");

  const loadAllScores = useCallback(async (membersList: FamilyMember[]) => {
    const results: Record<string, number | null> = {};
    await Promise.all(
      membersList.map(async (m) => {
        try {
          const q = m.is_primary ? "" : `?member=${m.id}`;
          const data = await apiFetch<{ health_score: number }>(`/api/v1/insights${q}`);
          results[m.id] = data.health_score;
        } catch {
          results[m.id] = null;
        }
      })
    );
    setScores(results);
  }, []);

  const loadMembers = useCallback(async () => {
    try {
      const data = await apiFetch<FamilyMember[]>("/api/v1/family");
      setMembers(data);
      void loadAllScores(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not load family members.";
      setError(msg);
    } finally { setIsLoading(false); }
  }, [loadAllScores]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => { void loadMembers(); }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadMembers]);

  const loadProfile = useCallback(async (member: FamilyMember) => {
    setProfile(p => ({ ...p, loading: true }));
    const memberQ = member.is_primary ? "" : `?member=${member.id}`;
    const sep = memberQ ? "&" : "?";
    try {
      const [insights, convos] = await Promise.all([
        apiFetch<{ health_score: number; total_assessments: number }>(`/api/v1/insights${memberQ}`).catch(() => ({ health_score: 92, total_assessments: 0 })),
        apiFetch<{ id: string; chief_complaint: string | null; created_at: string; status: string }[]>(`/api/v1/conversations${memberQ ? memberQ : "?"}${memberQ ? sep : ""}limit=5`.replace("??", "?")).catch(() => []),
      ]);
      setProfile({
        healthScore: insights.health_score,
        totalAssessments: insights.total_assessments,
        recentConversations: convos.slice(0, 5),
        loading: false,
      });
    } catch {
      setProfile(p => ({ ...p, loading: false }));
    }
  }, []);

  function openMemberProfile(member: FamilyMember) {
    setSelectedMember(member);
    loadProfile(member);
  }

  function navigateAs(member: FamilyMember, path: string) {
    setActiveMember(member.is_primary ? null : member);
    router.push(path);
  }

  function resetForm() {
    setFormName(""); setFormRelationship("mother"); setFormDob("");
    setFormGender(""); setFormBloodGroup(""); setFormColor("blue");
    setShowForm(false); setEditingId(null);
  }

  function startEdit(member: FamilyMember) {
    setFormName(member.name);
    setFormRelationship(member.relationship);
    setFormDob(member.date_of_birth || "");
    setFormGender(member.gender || "");
    setFormBloodGroup(member.blood_group || "");
    setFormColor(member.avatar_color);
    setEditingId(member.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload: Record<string, string> = {
      name: formName,
      relationship: formRelationship,
      avatar_color: formColor,
    };
    if (formDob) payload.date_of_birth = formDob;
    if (formGender) payload.gender = formGender;
    if (formBloodGroup) payload.blood_group = formBloodGroup;

    try {
      if (editingId) {
        await apiFetch(`/api/v1/family/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/v1/family", { method: "POST", body: JSON.stringify(payload) });
      }
      resetForm();
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this family member?")) return;
    try {
      await apiFetch(`/api/v1/family/${id}`, { method: "DELETE" });
      if (selectedMember?.id === id) setSelectedMember(null);
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not delete.";
      setError(msg);
    }
  }

  function getScoreColor(score: number) {
    if (score >= 85) return "text-emerald-600";
    if (score >= 70) return "text-amber-600";
    return "text-red-600";
  }

  function getScoreBg(score: number) {
    if (score >= 85) return "bg-emerald-50";
    if (score >= 70) return "bg-amber-50";
    return "bg-red-50";
  }

  return (
    <div className="min-h-screen care-os care-grid care-family-page">
      <style>{`
        @keyframes careFamilyRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes careFamilyPanel { from { opacity: 0; transform: translateY(22px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .care-family-page .fm-fade-1 { animation: careFamilyRise .5s ease-out both; }
        .care-family-page .profile-panel { animation: careFamilyPanel .38s cubic-bezier(.16,1,.3,1) both; }
        .care-family-page .care-family-header { min-height: 158px; }
        .care-family-page .care-family-header::after { right: -7rem; top: -15rem; }
        .care-family-page .care-family-card,
        .care-family-page .care-family-empty,
        .care-family-page .care-family-profile {
          background: rgba(255,255,255,.78); border: 1px solid rgba(207,231,230,.92);
          box-shadow: 0 16px 42px rgba(8,47,73,.08); backdrop-filter: blur(18px) saturate(1.08);
        }
        .care-family-page .care-family-card:hover { border-color: rgba(45,212,191,.68); box-shadow: 0 24px 48px rgba(8,47,73,.12); }
        .care-family-page .care-family-card-selected { border-color: rgba(20,184,166,.72); box-shadow: 0 0 0 2px rgba(45,212,191,.14), 0 24px 48px rgba(8,47,73,.12); }
        .care-family-page .care-family-empty { border-style: dashed; }
        .care-family-page .care-family-add { border-color: rgba(45,212,191,.34); background: rgba(255,255,255,.46); }
        .care-family-page .care-family-add:hover { border-color: rgba(45,212,191,.85); background: rgba(240,253,250,.72); box-shadow: 0 18px 36px rgba(8,47,73,.09); }
        .care-family-page .care-family-modal { background: rgba(248,253,252,.97); border: 1px solid rgba(207,231,230,.92); }
        .care-family-page .care-family-modal input:focus,
        .care-family-page .care-family-modal select:focus { border-color: #2dd4bf; box-shadow: 0 0 0 3px rgba(45,212,191,.14); }
        .care-family-page .care-family-action { background: rgba(248,253,252,.78); border: 1px solid rgba(207,231,230,.82); }
        .care-family-page .care-family-action:hover { border-color: rgba(45,212,191,.65); background: #fff; transform: translateY(-2px); box-shadow: 0 12px 24px rgba(8,47,73,.08); }
        @media (max-width: 640px) { .care-family-page .care-family-status { display: none; } }
        @media (prefers-reduced-motion: reduce) { .care-family-page .fm-fade-1, .care-family-page .profile-panel { animation: none; } }
      `}</style>

      {/* Header */}
      <header className="care-hero care-family-header relative overflow-hidden">
        <div className="relative z-10 max-w-4xl mx-auto px-5 sm:px-8 py-6 sm:py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push("/dashboard")} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <p className="care-eyebrow mb-1">Family care network</p>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Family Health Network</h1>
                <p className="text-sm text-white/65 mt-0.5">A shared view of the people you care for.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="care-live care-family-status"><span className="care-live-dot" />Profiles connected</span>
              <button onClick={() => { resetForm(); setShowForm(true); }} className="care-button flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Member
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="care-content max-w-4xl mx-auto px-5 sm:px-8 py-8">
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-medium text-red-400 hover:text-red-600">Dismiss</button>
          </div>
        )}

        {/* Add/Edit Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="care-family-modal rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900">{editingId ? "Edit Member" : "Add Family Member"}</h2>
                <button onClick={resetForm} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Name *</label>
                  <input
                    type="text" required value={formName} onChange={(e) => setFormName(e.target.value)}
                    placeholder="Enter name" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Relationship *</label>
                  <div className="grid grid-cols-4 gap-2">
                    {RELATIONSHIPS.map((rel) => (
                      <button
                        key={rel.value} type="button"
                        onClick={() => setFormRelationship(rel.value)}
                        className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl text-center transition-all ${
                          formRelationship === rel.value
                            ? "bg-purple-50 border-2 border-purple-300 shadow-sm"
                            : "bg-gray-50 border-2 border-transparent hover:bg-gray-100"
                        }`}
                      >
                        <span className="text-lg">{getRelationshipIcon(rel.value)}</span>
                        <span className="text-[10px] font-medium text-gray-600">{rel.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Date of Birth</label>
                    <input
                      type="date" value={formDob} onChange={(e) => setFormDob(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Gender</label>
                    <select
                      value={formGender} onChange={(e) => setFormGender(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all bg-white"
                    >
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Blood Group</label>
                  <div className="flex flex-wrap gap-2">
                    {BLOOD_GROUPS.map((bg) => (
                      <button
                        key={bg} type="button"
                        onClick={() => setFormBloodGroup(formBloodGroup === bg ? "" : bg)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          formBloodGroup === bg
                            ? "bg-red-50 text-red-700 border-2 border-red-300"
                            : "bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100"
                        }`}
                      >
                        {bg}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Avatar Color</label>
                  <div className="flex gap-2">
                    {Object.entries(AVATAR_COLORS).map(([color, classes]) => (
                      <button
                        key={color} type="button"
                        onClick={() => setFormColor(color)}
                        className={`w-8 h-8 rounded-full ${classes.bg} transition-all ${
                          formColor === color ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-110"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit" disabled={saving || !formName}
                  className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white py-3 rounded-xl font-semibold hover:from-purple-600 hover:to-indigo-700 disabled:opacity-50 transition-all shadow-sm"
                >
                  {saving ? "Saving..." : editingId ? "Update Member" : "Add Member"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Members Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="care-family-card rounded-2xl p-6 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-full" />
                  <div><div className="h-4 bg-gray-100 rounded-lg w-24 mb-2" /><div className="h-3 bg-gray-50 rounded-lg w-16" /></div>
                </div>
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="care-family-empty fm-fade-1 rounded-3xl p-14 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-5">
              <span className="text-4xl">👨‍👩‍👧‍👦</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Add Your Family</h3>
            <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6">
              Manage health for your entire family. Track assessments, medicines, and reports for each member separately.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="care-button px-6 py-3 rounded-2xl text-sm font-bold transition-all"
            >
              Add First Member
            </button>
          </div>
        ) : (
          <>
            <div className="fm-fade-1 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {members.map((member) => {
                const colors = AVATAR_COLORS[member.avatar_color] || AVATAR_COLORS.emerald;
                const isSelected = selectedMember?.id === member.id;
                const score = scores[member.id];
                const scoreReady = score != null;
                const scoreRing = scoreReady ? Math.round((score! / 100) * 251) : 0;
                const ringStroke = scoreReady ? (score! >= 85 ? "#10b981" : score! >= 70 ? "#f59e0b" : "#ef4444") : "#e5e7eb";

                return (
                  <div
                    key={member.id}
                    onClick={() => openMemberProfile(member)}
                    className={`care-family-card group rounded-3xl p-6 border hover:-translate-y-1 transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? "care-family-card-selected"
                        : "border-gray-100"
                    }`}
                  >
                    {/* Top: Avatar + Info + Score */}
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 shadow-lg ${colors.bg} ${colors.text} rounded-2xl flex items-center justify-center text-xl font-bold shrink-0`}>
                        {member.name[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-base font-bold text-gray-900 truncate">{member.name}</p>
                          {member.is_primary && (
                            <span className="text-[9px] font-bold text-white bg-emerald-500 px-2 py-0.5 rounded-full shrink-0">YOU</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm">{getRelationshipIcon(member.relationship)}</span>
                          <span className="text-xs text-gray-500 capitalize">{member.relationship}</span>
                          {member.date_of_birth && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span className="text-xs text-gray-400">{getAge(member.date_of_birth)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Score Ring */}
                      <div className="shrink-0 relative">
                        {scoreReady ? (
                          <div className="relative w-14 h-14">
                            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 88 88">
                              <circle cx="44" cy="44" r="40" fill="none" stroke="#f3f4f6" strokeWidth="5" />
                              <circle cx="44" cy="44" r="40" fill="none" stroke={ringStroke} strokeWidth="5" strokeLinecap="round"
                                strokeDasharray="251" strokeDashoffset={251 - scoreRing}
                                className="transition-all duration-700"
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className={`text-base font-extrabold leading-none ${getScoreColor(score!)}`}>{score}</span>
                            </div>
                          </div>
                        ) : score === null ? (
                          <div className="w-14 h-14 rounded-full border-[3px] border-gray-100 flex items-center justify-center">
                            <span className="text-xs font-semibold text-gray-300">N/A</span>
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-full border-[3px] border-gray-100 animate-pulse" />
                        )}
                      </div>
                    </div>

                    {/* Bottom: Detail chips */}
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">
                      {member.gender && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 text-gray-500 text-[11px] rounded-lg font-medium">
                          {member.gender === "male" ? "♂" : member.gender === "female" ? "♀" : "⚧"} <span className="capitalize">{member.gender}</span>
                        </span>
                      )}
                      {member.blood_group && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-500 text-[11px] rounded-lg font-medium">
                          🩸 {member.blood_group}
                        </span>
                      )}
                      {member.date_of_birth && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-500 text-[11px] rounded-lg font-medium">
                          🎂 {new Date(member.date_of_birth).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                      )}
                      <span className={`ml-auto text-[11px] font-semibold ${isSelected ? "text-teal-600" : "text-gray-300 group-hover:text-teal-600"} transition-colors`}>
                        View Profile &rarr;
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Add new card */}
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="care-family-add flex flex-col items-center justify-center gap-3 p-10 rounded-3xl border-2 border-dashed transition-all group min-h-[140px]"
              >
                <div className="care-module-icon w-12 h-12 rounded-2xl flex items-center justify-center transition-colors">
                  <svg className="w-6 h-6 text-teal-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-slate-500 group-hover:text-teal-700 transition-colors">Add Member</span>
              </button>
            </div>

            {/* Member Profile Panel */}
            {selectedMember && (
              <div className="profile-panel mt-6">
                {(() => {
                  const m = selectedMember;
                  const colors = AVATAR_COLORS[m.avatar_color] || AVATAR_COLORS.emerald;
                  return (
                    <div className="care-family-profile rounded-3xl overflow-hidden">
                      {/* Profile Header */}
                      <div className={`bg-gradient-to-r ${colors.gradient} p-6 relative`}>
                        <button
                          onClick={() => setSelectedMember(null)}
                          className="absolute top-4 right-4 p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg">
                            {m.name[0].toUpperCase()}
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-white">{m.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-white/80 text-sm capitalize">{getRelationshipIcon(m.relationship)} {m.relationship}</span>
                              {m.date_of_birth && (
                                <span className="text-white/60 text-xs">{getAge(m.date_of_birth)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Profile Body */}
                      <div className="p-6">
                        {/* Info chips */}
                        <div className="flex flex-wrap gap-2 mb-6">
                          {m.gender && (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-50 text-gray-600 text-xs rounded-full">
                              {m.gender === "male" ? "♂" : m.gender === "female" ? "♀" : "⚧"} <span className="capitalize">{m.gender}</span>
                            </span>
                          )}
                          {m.blood_group && (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-full">
                              🩸 {m.blood_group}
                            </span>
                          )}
                          {m.date_of_birth && (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 text-xs rounded-full">
                              🎂 {new Date(m.date_of_birth).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          )}
                        </div>

                        {/* Health Stats */}
                        {profile.loading ? (
                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-gray-50 rounded-2xl p-4 animate-pulse"><div className="h-8 bg-gray-100 rounded-lg w-16 mb-2" /><div className="h-3 bg-gray-100 rounded-lg w-20" /></div>
                            <div className="bg-gray-50 rounded-2xl p-4 animate-pulse"><div className="h-8 bg-gray-100 rounded-lg w-16 mb-2" /><div className="h-3 bg-gray-100 rounded-lg w-20" /></div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className={`${getScoreBg(profile.healthScore)} rounded-2xl p-4`}>
                              <p className={`text-2xl font-bold ${getScoreColor(profile.healthScore)}`}>{profile.healthScore}</p>
                              <p className="text-[11px] text-gray-500 mt-0.5">Health Score</p>
                            </div>
                            <div className="bg-purple-50 rounded-2xl p-4">
                              <p className="text-2xl font-bold text-purple-600">{profile.totalAssessments}</p>
                              <p className="text-[11px] text-gray-500 mt-0.5">Assessments</p>
                            </div>
                          </div>
                        )}

                        {/* Recent Activity */}
                        {!profile.loading && profile.recentConversations.length > 0 && (
                          <div className="mb-6">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Recent Activity</p>
                            <div className="space-y-2">
                              {profile.recentConversations.map((c) => (
                                <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl">
                                  <div className={`w-2 h-2 rounded-full shrink-0 ${c.status === "active" ? "bg-emerald-400" : "bg-gray-300"}`} />
                                  <p className="text-xs text-gray-700 truncate flex-1">{c.chief_complaint || "Health Assessment"}</p>
                                  <span className="text-[10px] text-gray-400 shrink-0">
                                    {new Date(c.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <button
                            onClick={() => navigateAs(m, "/chat")}
                            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md shadow-teal-200/40"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                            <span className="text-[11px] font-semibold">Assessment</span>
                          </button>
                          <button
                            onClick={() => navigateAs(m, "/insights")}
                            className="care-family-action flex flex-col items-center gap-2 p-4 rounded-2xl transition-all"
                          >
                            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            <span className="text-[11px] font-semibold text-gray-700">Insights</span>
                          </button>
                          <button
                            onClick={() => navigateAs(m, "/history")}
                            className="care-family-action flex flex-col items-center gap-2 p-4 rounded-2xl transition-all"
                          >
                            <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span className="text-[11px] font-semibold text-gray-700">History</span>
                          </button>
                          <button
                            onClick={() => navigateAs(m, "/dashboard")}
                            className="care-family-action flex flex-col items-center gap-2 p-4 rounded-2xl transition-all"
                          >
                            <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                            <span className="text-[11px] font-semibold text-gray-700">Dashboard</span>
                          </button>
                        </div>

                        {/* Edit / Remove */}
                        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                          <button
                            onClick={() => startEdit(m)}
                            className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            Edit Profile
                          </button>
                          {!m.is_primary && (
                            <button
                              onClick={() => handleDelete(m.id)}
                              className="text-xs font-medium text-red-300 hover:text-red-500 transition-colors"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
