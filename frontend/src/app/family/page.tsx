"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  date_of_birth: string | null;
  gender: string | null;
  blood_group: string | null;
  avatar_color: string;
  is_primary: boolean;
  created_at: string;
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

const AVATAR_COLORS: Record<string, { bg: string; text: string }> = {
  emerald: { bg: "bg-emerald-100", text: "text-emerald-700" },
  blue: { bg: "bg-blue-100", text: "text-blue-700" },
  purple: { bg: "bg-purple-100", text: "text-purple-700" },
  rose: { bg: "bg-rose-100", text: "text-rose-700" },
  amber: { bg: "bg-amber-100", text: "text-amber-700" },
  teal: { bg: "bg-teal-100", text: "text-teal-700" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-700" },
  orange: { bg: "bg-orange-100", text: "text-orange-700" },
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

export default function FamilyPage() {
  const router = useRouter();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formRelationship, setFormRelationship] = useState("mother");
  const [formDob, setFormDob] = useState("");
  const [formGender, setFormGender] = useState("");
  const [formBloodGroup, setFormBloodGroup] = useState("");
  const [formColor, setFormColor] = useState("blue");

  useEffect(() => { loadMembers(); }, []);

  async function loadMembers() {
    try {
      const data = await apiFetch<FamilyMember[]>("/api/v1/family");
      setMembers(data);
    } catch (err: any) {
      setError(err?.message || "Could not load family members.");
    } finally { setIsLoading(false); }
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

    const payload: any = {
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
    } catch (err: any) {
      setError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this family member?")) return;
    try {
      await apiFetch(`/api/v1/family/${id}`, { method: "DELETE" });
      await loadMembers();
    } catch (err: any) {
      setError(err.message || "Could not delete.");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-purple-50/20">
      <style>{`
        @keyframes fmFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .fm-fade-1 { animation: fmFadeUp 0.5s ease-out both; }
        .fm-fade-2 { animation: fmFadeUp 0.5s ease-out 0.08s both; }
        .fm-fade-3 { animation: fmFadeUp 0.5s ease-out 0.16s both; }
      `}</style>
      {/* Header */}
      <header className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #7C3AED 0%, #6366F1 40%, #4F46E5 100%)" }}>
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 25% 75%, white 1px, transparent 1px), radial-gradient(circle at 75% 25%, white 1px, transparent 1px)", backgroundSize: "50px 50px" }} />
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.04] rounded-full -translate-y-1/3 translate-x-1/4" />
        <div className="relative z-10 max-w-4xl mx-auto px-5 sm:px-8 py-6 sm:py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push("/dashboard")} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white">Family Health</h1>
                <p className="text-sm text-white/60 mt-0.5">Manage your family&apos;s health profiles</p>
              </div>
            </div>
            <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-1.5 text-xs font-bold text-purple-700 bg-white px-4 py-2.5 rounded-xl hover:bg-purple-50 transition-all shadow-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Member
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 sm:px-8 py-8">
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-medium text-red-400 hover:text-red-600">Dismiss</button>
          </div>
        )}

        {/* Add/Edit Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
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
              <div key={i} className="bg-white rounded-2xl p-6 animate-pulse border border-gray-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-full" />
                  <div><div className="h-4 bg-gray-100 rounded-lg w-24 mb-2" /><div className="h-3 bg-gray-50 rounded-lg w-16" /></div>
                </div>
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="fm-fade-1 bg-white rounded-3xl p-14 shadow-md shadow-gray-100/40 text-center border border-gray-100">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-5">
              <span className="text-4xl">👨‍👩‍👧‍👦</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Add Your Family</h3>
            <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6">
              Manage health for your entire family. Track assessments, medicines, and reports for each member separately.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-6 py-3 rounded-2xl text-sm font-bold hover:from-purple-600 hover:to-indigo-700 transition-all shadow-lg shadow-purple-200/50"
            >
              Add First Member
            </button>
          </div>
        ) : (
          <div className="fm-fade-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map((member) => {
              const colors = AVATAR_COLORS[member.avatar_color] || AVATAR_COLORS.emerald;
              return (
                <div key={member.id} className="group bg-white rounded-3xl p-6 border border-gray-100 shadow-md shadow-gray-100/40 hover:shadow-xl hover:-translate-y-0.5 hover:border-purple-200 transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-14 h-14 shadow-md ${colors.bg} ${colors.text} rounded-full flex items-center justify-center text-lg font-bold`}>
                        {member.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{member.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs">{getRelationshipIcon(member.relationship)}</span>
                          <span className="text-[11px] text-gray-400 capitalize">{member.relationship}</span>
                        </div>
                      </div>
                    </div>
                    {member.is_primary && (
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Primary</span>
                    )}
                  </div>

                  <div className="space-y-2 mb-4">
                    {member.gender && (
                      <div className="flex items-center gap-2 text-[11px] text-gray-500">
                        <span className="w-4 h-4 bg-gray-50 rounded flex items-center justify-center text-[10px]">
                          {member.gender === "male" ? "♂" : member.gender === "female" ? "♀" : "⚧"}
                        </span>
                        <span className="capitalize">{member.gender}</span>
                      </div>
                    )}
                    {member.blood_group && (
                      <div className="flex items-center gap-2 text-[11px] text-gray-500">
                        <span className="w-4 h-4 bg-red-50 rounded flex items-center justify-center text-[10px] text-red-500">🩸</span>
                        {member.blood_group}
                      </div>
                    )}
                    {member.date_of_birth && (
                      <div className="flex items-center gap-2 text-[11px] text-gray-500">
                        <span className="w-4 h-4 bg-blue-50 rounded flex items-center justify-center text-[10px]">🎂</span>
                        {new Date(member.date_of_birth).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-gray-50">
                    <button
                      onClick={() => startEdit(member)}
                      className="flex-1 text-[11px] font-medium text-gray-500 py-2 rounded-lg hover:bg-gray-50 hover:text-gray-700 transition-colors"
                    >
                      Edit
                    </button>
                    {!member.is_primary && (
                      <button
                        onClick={() => handleDelete(member.id)}
                        className="flex-1 text-[11px] font-medium text-red-400 py-2 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add new card */}
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="flex flex-col items-center justify-center gap-3 p-8 rounded-3xl border-2 border-dashed border-gray-200 hover:border-purple-300 hover:bg-purple-50/30 hover:shadow-lg transition-all group"
            >
              <div className="w-12 h-12 bg-gray-100 group-hover:bg-purple-100 rounded-full flex items-center justify-center transition-colors">
                <svg className="w-6 h-6 text-gray-400 group-hover:text-purple-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-xs font-medium text-gray-400 group-hover:text-purple-600 transition-colors">Add Member</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
