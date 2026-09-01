"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface Medicine {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string;
  times: string[];
  meal_relation: string;
  family_member_id: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface MedicineLog {
  id: string;
  medicine_id: string;
  scheduled_time: string | null;
  status: string;
  taken_at: string | null;
  logged_date: string;
}

interface TodaySchedule {
  medicine: Medicine;
  logs: MedicineLog[];
  family_member_name: string | null;
}

interface Adherence {
  total_scheduled: number;
  taken: number;
  missed: number;
  skipped: number;
  adherence_percent: number;
  days: number;
}

const FREQUENCIES = [
  { value: "once_daily", label: "Once daily", times: ["09:00"] },
  { value: "twice_daily", label: "Twice daily", times: ["08:00", "20:00"] },
  { value: "thrice_daily", label: "Three times", times: ["08:00", "14:00", "20:00"] },
  { value: "as_needed", label: "As needed", times: [] },
];

const MEAL_OPTIONS = [
  { value: "before", label: "Before meal", icon: "🍽️" },
  { value: "after", label: "After meal", icon: "✅" },
  { value: "with", label: "With meal", icon: "🥄" },
  { value: "anytime", label: "Anytime", icon: "⏰" },
];

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function getTimeOfDay(time: string): string {
  const hour = parseInt(time.split(":")[0]);
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

function getTimeIcon(time: string): string {
  const hour = parseInt(time.split(":")[0]);
  if (hour < 12) return "🌅";
  if (hour < 17) return "☀️";
  return "🌙";
}

export default function MedicinesPage() {
  const router = useRouter();
  const [schedule, setSchedule] = useState<TodaySchedule[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [adherence, setAdherence] = useState<Adherence | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"today" | "all">("today");

  // Form state
  const [formName, setFormName] = useState("");
  const [formDosage, setFormDosage] = useState("");
  const [formFrequency, setFormFrequency] = useState("twice_daily");
  const [formTimes, setFormTimes] = useState<string[]>(["08:00", "20:00"]);
  const [formMeal, setFormMeal] = useState("after");
  const [formNotes, setFormNotes] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [scheduleData, medsData, adherenceData] = await Promise.all([
        apiFetch<TodaySchedule[]>("/api/v1/medicines/today"),
        apiFetch<Medicine[]>("/api/v1/medicines?active_only=false"),
        apiFetch<Adherence>("/api/v1/medicines/adherence?days=7"),
      ]);
      setSchedule(scheduleData);
      setMedicines(medsData);
      setAdherence(adherenceData);
    } catch { setError("Could not load medicines."); }
    finally { setIsLoading(false); }
  }

  function resetForm() {
    setFormName(""); setFormDosage(""); setFormFrequency("twice_daily");
    setFormTimes(["08:00", "20:00"]); setFormMeal("after"); setFormNotes("");
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/v1/medicines", {
        method: "POST",
        body: JSON.stringify({
          name: formName,
          dosage: formDosage || null,
          frequency: formFrequency,
          times: formTimes,
          meal_relation: formMeal,
          notes: formNotes || null,
        }),
      });
      resetForm();
      await loadData();
    } catch (err: any) { setError(err.message || "Failed to add medicine."); }
    finally { setSaving(false); }
  }

  async function handleLogMedicine(medicineId: string, scheduledTime: string, status: "taken" | "skipped") {
    try {
      await apiFetch(`/api/v1/medicines/${medicineId}/log`, {
        method: "POST",
        body: JSON.stringify({ status, scheduled_time: scheduledTime }),
      });
      await loadData();
    } catch { setError("Could not log medicine."); }
  }

  async function handleToggleActive(medicineId: string, currentlyActive: boolean) {
    try {
      await apiFetch(`/api/v1/medicines/${medicineId}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !currentlyActive }),
      });
      await loadData();
    } catch { setError("Could not update medicine."); }
  }

  async function handleDelete(medicineId: string) {
    if (!confirm("Delete this medicine permanently?")) return;
    try {
      await apiFetch(`/api/v1/medicines/${medicineId}`, { method: "DELETE" });
      await loadData();
    } catch { setError("Could not delete medicine."); }
  }

  // Group schedule by time of day
  const groupedSchedule = schedule.reduce<Record<string, { time: string; items: TodaySchedule[] }>>((acc, item) => {
    const times = item.medicine.times.length > 0 ? item.medicine.times : ["anytime"];
    times.forEach((t) => {
      const period = t === "anytime" ? "Anytime" : getTimeOfDay(t);
      if (!acc[period]) acc[period] = { time: t, items: [] };
      acc[period].items.push(item);
    });
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/20">
      <style>{`
        @keyframes mdFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .md-fade-1 { animation: mdFadeUp 0.5s ease-out both; }
        .md-fade-2 { animation: mdFadeUp 0.5s ease-out 0.08s both; }
        .md-fade-3 { animation: mdFadeUp 0.5s ease-out 0.16s both; }
      `}</style>
      {/* Header */}
      <header className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #2563EB 0%, #0891B2 40%, #06B6D4 100%)" }}>
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 25% 75%, white 1px, transparent 1px), radial-gradient(circle at 75% 25%, white 1px, transparent 1px)", backgroundSize: "50px 50px" }} />
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.04] rounded-full -translate-y-1/3 translate-x-1/4" />
        <div className="relative z-10 max-w-4xl mx-auto px-5 sm:px-8 py-6 sm:py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push("/dashboard")} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white">Medicines</h1>
                <p className="text-sm text-white/60 mt-0.5">Track your daily medications</p>
              </div>
            </div>
            <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-white px-4 py-2.5 rounded-xl hover:bg-blue-50 transition-all shadow-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Medicine
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 sm:px-8 py-8">
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-medium text-red-400">Dismiss</button>
          </div>
        )}

        {/* Adherence Stats */}
        {adherence && adherence.total_scheduled > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6 md-fade-1">
            <div className="group cursor-pointer relative rounded-2xl p-5 overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-200/30 text-center">
              <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="text-3xl font-black text-white">
                {adherence.adherence_percent}%
              </div>
              <p className="text-xs text-white/70 font-semibold mt-1">Adherence (7d)</p>
            </div>
            <div className="group cursor-pointer relative rounded-2xl p-5 overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-200/30 text-center">
              <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="text-3xl font-black text-white">{adherence.taken}</div>
              <p className="text-xs text-white/70 font-semibold mt-1">Taken</p>
            </div>
            <div className="group cursor-pointer relative rounded-2xl p-5 overflow-hidden bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-200/30 text-center">
              <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="text-3xl font-black text-white">{adherence.missed}</div>
              <p className="text-xs text-white/70 font-semibold mt-1">Missed</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100/80 rounded-2xl p-1 mb-6 md-fade-2">
          <button
            onClick={() => setActiveTab("today")}
            className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "today" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            Today&apos;s Schedule
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            All Medicines ({medicines.length})
          </button>
        </div>

        <div className="md-fade-3">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-5 animate-pulse border border-gray-100">
                <div className="flex items-center gap-3"><div className="w-10 h-10 bg-gray-100 rounded-xl" /><div className="flex-1"><div className="h-4 bg-gray-100 rounded w-1/3 mb-2" /><div className="h-3 bg-gray-50 rounded w-1/4" /></div></div>
              </div>
            ))}
          </div>
        ) : activeTab === "today" ? (
          /* Today's Schedule */
          <div className="space-y-6">
            {Object.keys(groupedSchedule).length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center border border-gray-100">
                <div className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">💊</span>
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-2">No medicines added yet</h3>
                <p className="text-sm text-gray-400 max-w-xs mx-auto mb-6">Add your daily medications and we&apos;ll remind you when to take them.</p>
                <button onClick={() => setShowForm(true)} className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white px-6 py-3 rounded-2xl text-sm font-bold hover:from-blue-600 hover:to-cyan-700 transition-all shadow-lg shadow-blue-200/50">
                  Add First Medicine
                </button>
              </div>
            ) : (
              Object.entries(groupedSchedule).map(([period, { time, items }]) => (
                <div key={period}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">{time === "anytime" ? "⏰" : getTimeIcon(time)}</span>
                    <h3 className="text-sm font-bold text-gray-700">{period}</h3>
                    {time !== "anytime" && <span className="text-[11px] text-gray-400">{formatTime(time)}</span>}
                  </div>
                  <div className="space-y-2.5">
                    {items.map((item) => {
                      const isLogged = item.logs.some(l => l.scheduled_time === time || (!l.scheduled_time && item.medicine.times.length === 0));
                      const logStatus = item.logs.find(l => l.scheduled_time === time)?.status;

                      return (
                        <div
                          key={`${item.medicine.id}-${time}`}
                          className={`bg-white rounded-2xl p-4 border transition-all ${
                            logStatus === "taken" ? "border-emerald-200 bg-emerald-50/30" :
                            logStatus === "skipped" ? "border-gray-200 bg-gray-50/50 opacity-60" :
                            "border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                              logStatus === "taken" ? "bg-emerald-100" : "bg-blue-50"
                            }`}>
                              {logStatus === "taken" ? (
                                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <span className="text-lg">💊</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold ${logStatus === "taken" ? "text-emerald-700 line-through" : "text-gray-900"}`}>
                                {item.medicine.name}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {item.medicine.dosage && <span className="text-[11px] text-gray-500">{item.medicine.dosage}</span>}
                                <span className="text-[11px] text-gray-400">• {item.medicine.meal_relation} meal</span>
                                {item.family_member_name && <span className="text-[11px] text-purple-500 font-medium">• {item.family_member_name}</span>}
                              </div>
                            </div>
                            {!isLogged && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => handleLogMedicine(item.medicine.id, time, "taken")}
                                  className="w-9 h-9 bg-emerald-100 hover:bg-emerald-200 rounded-xl flex items-center justify-center transition-colors"
                                  title="Mark as taken"
                                >
                                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleLogMedicine(item.medicine.id, time, "skipped")}
                                  className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center transition-colors"
                                  title="Skip"
                                >
                                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            )}
                            {logStatus === "taken" && (
                              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-2 py-1 rounded-lg">Done</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* All Medicines List */
          <div className="space-y-3">
            {medicines.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center border border-gray-100">
                <p className="text-sm text-gray-400">No medicines added yet.</p>
              </div>
            ) : (
              medicines.map((med) => (
                <div key={med.id} className={`bg-white rounded-2xl p-5 border shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5 ${med.is_active ? "border-gray-100" : "border-gray-100 opacity-50"}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                      <span className="text-lg">💊</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{med.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {med.dosage && <span className="text-[11px] text-gray-500">{med.dosage}</span>}
                        <span className="text-[11px] text-gray-400">• {med.frequency.replace("_", " ")}</span>
                        {med.times.length > 0 && <span className="text-[11px] text-gray-400">• {med.times.map(formatTime).join(", ")}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggleActive(med.id, med.is_active)}
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                          med.is_active ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" : "text-gray-400 bg-gray-50 hover:bg-gray-100"
                        }`}
                      >
                        {med.is_active ? "Active" : "Paused"}
                      </button>
                      <button
                        onClick={() => handleDelete(med.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        </div>

        {/* Add Medicine Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900">Add Medicine</h2>
                <button onClick={resetForm} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Medicine Name *</label>
                  <input
                    type="text" required value={formName} onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Metformin, Paracetamol" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Dosage</label>
                  <input
                    type="text" value={formDosage} onChange={(e) => setFormDosage(e.target.value)}
                    placeholder="e.g., 500mg, 1 tablet, 5ml" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">How often? *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {FREQUENCIES.map((freq) => (
                      <button
                        key={freq.value} type="button"
                        onClick={() => { setFormFrequency(freq.value); setFormTimes(freq.times); }}
                        className={`py-3 px-3 rounded-xl text-xs font-medium transition-all text-center ${
                          formFrequency === freq.value
                            ? "bg-blue-50 border-2 border-blue-300 text-blue-700 shadow-sm"
                            : "bg-gray-50 border-2 border-transparent text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {freq.label}
                      </button>
                    ))}
                  </div>
                </div>

                {formTimes.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Times</label>
                    <div className="flex gap-2 flex-wrap">
                      {formTimes.map((t, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                          <span className="text-sm">{getTimeIcon(t)}</span>
                          <input
                            type="time" value={t}
                            onChange={(e) => { const newTimes = [...formTimes]; newTimes[idx] = e.target.value; setFormTimes(newTimes); }}
                            className="text-xs font-medium text-gray-700 bg-transparent outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">When to take?</label>
                  <div className="grid grid-cols-2 gap-2">
                    {MEAL_OPTIONS.map((opt) => (
                      <button
                        key={opt.value} type="button"
                        onClick={() => setFormMeal(opt.value)}
                        className={`flex items-center gap-2 py-2.5 px-3 rounded-xl text-xs font-medium transition-all ${
                          formMeal === opt.value
                            ? "bg-blue-50 border-2 border-blue-300 text-blue-700"
                            : "bg-gray-50 border-2 border-transparent text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        <span>{opt.icon}</span> {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
                  <input
                    type="text" value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="e.g., Take with warm water" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                </div>

                <button
                  type="submit" disabled={saving || !formName}
                  className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 text-white py-3 rounded-xl font-semibold hover:from-blue-600 hover:to-cyan-700 disabled:opacity-50 transition-all shadow-sm"
                >
                  {saving ? "Adding..." : "Add Medicine"}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
