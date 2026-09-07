"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getFaceScans, deleteFaceScan } from "@/lib/api";
import type { FaceScan } from "@/lib/api";

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-300";
  if (score >= 60) return "text-cyan-300";
  return "text-rose-300";
}

function HistoryAtmosphere() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="history-os-grid absolute inset-0" />
      <div className="history-os-orb absolute -top-32 -right-28 h-[28rem] w-[28rem] rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-cyan-300/[0.045] to-transparent" />
    </div>
  );
}

function HistoryOsStyles() {
  return (
    <style jsx global>{`
      .history-os-shell { background: #060b16; color: #e2e8f0; }
      .history-os-grid {
        opacity: 0.34;
        background-image: linear-gradient(rgba(56, 189, 248, 0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 189, 248, 0.055) 1px, transparent 1px);
        background-size: 34px 34px;
        mask-image: linear-gradient(to bottom, black, transparent 72%);
      }
      .history-os-header { background: rgba(6, 11, 22, 0.76); border-color: rgba(148, 163, 184, 0.14); }
      .history-os-panel { background: linear-gradient(145deg, rgba(15, 23, 42, 0.94), rgba(8, 15, 29, 0.9)); border-color: rgba(148, 163, 184, 0.15); box-shadow: 0 22px 68px rgba(0, 0, 0, 0.2); }
      .history-os-orb { animation: history-os-drift 16s ease-in-out infinite; }
      @keyframes history-os-drift { 0%, 100% { transform: translate3d(0, 0, 0) scale(1); } 50% { transform: translate3d(-1rem, 1.25rem, 0) scale(1.08); } }
      @media (prefers-reduced-motion: reduce) { .history-os-orb { animation: none; } }
    `}</style>
  );
}

export default function FaceScanHistoryPage() {
  const router = useRouter();
  const [scans, setScans] = useState<FaceScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScan, setSelectedScan] = useState<FaceScan | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadScans() {
    try {
      const data = await getFaceScans(30);
      setScans(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load history";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadScans();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this scan? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteFaceScan(id);
      setScans(scans.filter((s) => s.id !== id));
      setSelectedScan(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Delete failed";
      setError(message);
    } finally {
      setDeleting(false);
    }
  }

  // Build calendar grid for last 30 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const scansByDate = new Map<string, FaceScan>();
  scans.forEach((scan) => {
    const d = new Date(scan.scan_date).toISOString().split("T")[0];
    if (!scansByDate.has(d)) scansByDate.set(d, scan);
  });

  const calendarDays: { date: Date; dateStr: string; scan: FaceScan | null; isToday: boolean }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    calendarDays.push({
      date: d,
      dateStr,
      scan: scansByDate.get(dateStr) || null,
      isToday: i === 0,
    });
  }

  // Trend chart data
  const trendData = scans
    .slice()
    .sort((a, b) => new Date(a.scan_date).getTime() - new Date(b.scan_date).getTime())
    .map((scan) => ({
      date: new Date(scan.scan_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      hair: scan.hair_health_score,
      skin: scan.skin_quality_score,
      stress: scan.stress_level_score,
      sleep: scan.sleep_quality_score,
    }));

  if (loading) {
    return (
      <div className="history-os-shell relative isolate min-h-screen overflow-hidden flex items-center justify-center">
        <HistoryAtmosphere />
        <HistoryOsStyles />
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-300/15 border-t-cyan-300 rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-sm text-slate-400">Loading scan history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="history-os-shell relative isolate min-h-screen overflow-hidden">
      <HistoryAtmosphere />
      <HistoryOsStyles />
      <header className="history-os-header sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-3.5 flex items-center gap-3">
          <button onClick={() => router.push("/face-scan")} className="p-1.5 text-slate-500 hover:text-white rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-9 h-9 bg-gradient-to-br from-cyan-400 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold text-white">Signal Archive</h1>
            <p className="text-[10px] text-slate-400 font-medium">Last 30 days of scan activity</p>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        {error && (
          <div className="px-4 py-3 bg-rose-500/10 text-rose-200 text-sm rounded-xl border border-rose-300/15 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-medium text-rose-300 hover:text-white">Dismiss</button>
          </div>
        )}

        {/* Calendar Grid */}
        <div className="history-os-panel rounded-3xl p-6 border">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">Scan cadence</p>
              <h3 className="mt-1 text-sm font-bold text-slate-100">30-day signal archive</h3>
            </div>
            <span className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold text-cyan-200">{scans.length} logged</span>
          </div>
          <div className="grid grid-cols-7 gap-2 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="text-center text-[10px] text-slate-500 font-medium">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {/* Pad start to align with day of week */}
            {Array.from({ length: calendarDays[0]?.date.getDay() || 0 }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {calendarDays.map((day) => (
              <button
                key={day.dateStr}
                onClick={() => day.scan && setSelectedScan(day.scan)}
                disabled={!day.scan}
                className={`aspect-square rounded-xl flex items-center justify-center text-[11px] font-medium transition-all ${
                  day.isToday
                    ? day.scan
                      ? "bg-cyan-300 text-slate-950 shadow-sm shadow-cyan-950/30"
                      : "bg-cyan-400/10 text-cyan-200 border-2 border-dashed border-cyan-300/30"
                    : day.scan
                      ? "bg-teal-400/10 text-teal-200 hover:bg-teal-400/20 cursor-pointer border border-teal-300/10"
                      : "bg-slate-900/60 text-slate-700 border border-white/[0.03]"
                }`}
              >
                {day.date.getDate()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-4 text-[10px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-teal-400/30 border border-teal-300/20" />
              <span>Scanned</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-slate-900 border border-slate-700" />
              <span>No scan</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-cyan-300" />
              <span>Today</span>
            </div>
          </div>
        </div>

        {/* Trend Charts */}
        {trendData.length > 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.85)]" />
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.16em]">Signal trajectories</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Hair Health */}
              <div className="history-os-panel rounded-2xl p-5 border">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium text-slate-200">Hair Health</span>
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.12)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748B" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#64748B" }} />
                    <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid rgba(148, 163, 184, 0.2)", fontSize: "11px", background: "#0f172a", color: "#e2e8f0" }} />
                    <Line type="monotone" dataKey="hair" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Hair" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Skin Quality */}
              <div className="history-os-panel rounded-2xl p-5 border">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm font-medium text-slate-200">Skin Quality</span>
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.12)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748B" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#64748B" }} />
                    <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid rgba(148, 163, 184, 0.2)", fontSize: "11px", background: "#0f172a", color: "#e2e8f0" }} />
                    <Line type="monotone" dataKey="skin" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Skin" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Stress Level */}
              <div className="history-os-panel rounded-2xl p-5 border">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span className="text-sm font-medium text-slate-200">Stress Level</span>
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.12)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748B" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#64748B" }} />
                    <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid rgba(148, 163, 184, 0.2)", fontSize: "11px", background: "#0f172a", color: "#e2e8f0" }} />
                    <Line type="monotone" dataKey="stress" stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Stress" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Sleep Quality */}
              <div className="history-os-panel rounded-2xl p-5 border">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  <span className="text-sm font-medium text-slate-200">Sleep Quality</span>
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.12)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748B" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#64748B" }} />
                    <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid rgba(148, 163, 184, 0.2)", fontSize: "11px", background: "#0f172a", color: "#e2e8f0" }} />
                    <Line type="monotone" dataKey="sleep" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Sleep" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {scans.length === 0 && (
          <div className="history-os-panel rounded-3xl p-10 text-center border">
            <div className="w-16 h-16 bg-cyan-400/10 border border-cyan-300/15 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h4 className="text-base font-bold text-white mb-1">No scan signals yet</h4>
            <p className="text-sm text-slate-400 max-w-xs mx-auto">
              Take your first face scan to start building your wellness history.
            </p>
            <button
              onClick={() => router.push("/face-scan")}
              className="mt-5 bg-gradient-to-r from-cyan-300 to-teal-300 text-slate-950 px-5 py-2.5 rounded-xl text-sm font-semibold hover:from-cyan-200 hover:to-teal-200 transition-all"
            >
              Take First Scan
            </button>
          </div>
        )}

        {/* Selected Scan Detail Modal */}
        {selectedScan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
            <div className="history-os-panel rounded-3xl p-6 sm:p-8 w-full max-w-md border shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">Archived signal</p>
                  <h2 className="mt-1 text-lg font-bold text-white">Scan details</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(selectedScan.scan_date).toLocaleDateString("en-IN", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <button onClick={() => setSelectedScan(null)} className="p-2 text-slate-500 hover:text-white rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Scores */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-emerald-400/10 rounded-xl p-3 text-center border border-emerald-300/10">
                  <p className={`text-2xl font-bold ${getScoreColor(selectedScan.hair_health_score ?? 0)}`}>
                    {selectedScan.hair_health_score ?? "--"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Hair Health</p>
                </div>
                <div className="bg-cyan-400/10 rounded-xl p-3 text-center border border-cyan-300/10">
                  <p className={`text-2xl font-bold ${getScoreColor(selectedScan.skin_quality_score ?? 0)}`}>
                    {selectedScan.skin_quality_score ?? "--"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Skin Quality</p>
                </div>
                <div className="bg-amber-400/10 rounded-xl p-3 text-center border border-amber-300/10">
                  <p className={`text-2xl font-bold ${getScoreColor(100 - (selectedScan.stress_level_score ?? 0))}`}>
                    {selectedScan.stress_level_score ?? "--"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Stress Level</p>
                </div>
                <div className="bg-violet-400/10 rounded-xl p-3 text-center border border-violet-300/10">
                  <p className={`text-2xl font-bold ${getScoreColor(selectedScan.sleep_quality_score ?? 0)}`}>
                    {selectedScan.sleep_quality_score ?? "--"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Sleep Quality</p>
                </div>
              </div>

              {/* Overall */}
              {selectedScan.overall_score !== null && (
                <div className="bg-slate-950/35 rounded-xl p-4 text-center mb-6 border border-white/[0.05]">
                  <p className="text-3xl font-bold text-white">{selectedScan.overall_score}</p>
                  <p className="text-xs text-slate-500 mt-1">Overall Score</p>
                </div>
              )}

              {/* Analysis details */}
              {selectedScan.analysis && (
                <div className="space-y-4 mb-6">
                  <p className="text-sm text-slate-300">{selectedScan.analysis.overall_summary}</p>
                  {selectedScan.analysis.comparison_to_previous && (
                    <div className="bg-emerald-400/10 rounded-xl p-3 text-sm text-emerald-200 border border-emerald-300/15">
                      {selectedScan.analysis.comparison_to_previous}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-slate-400 mb-2">Suggested care moves</p>
                    <div className="space-y-1.5">
                      {[
                        ...selectedScan.analysis.hair_health.tips,
                        ...selectedScan.analysis.skin_quality.tips,
                        ...selectedScan.analysis.stress_level.tips,
                        ...selectedScan.analysis.sleep_quality.tips,
                      ].slice(0, 4).map((tip, i) => (
                        <p key={i} className="text-sm text-slate-300 flex items-start gap-2">
                          <span className="text-cyan-300 mt-0.5">&#8226;</span>
                          {tip}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedScan.notes && (
                <div className="bg-slate-950/35 rounded-xl p-3 mb-6 border border-white/[0.05]">
                  <p className="text-xs font-medium text-slate-400 mb-1">Notes</p>
                  <p className="text-sm text-slate-200">{selectedScan.notes}</p>
                </div>
              )}

              {/* Delete Button */}
              <button
                onClick={() => handleDelete(selectedScan.id)}
                disabled={deleting}
                className="w-full text-sm font-medium text-rose-300 py-3 rounded-xl hover:bg-rose-400/10 transition-colors disabled:opacity-50 border border-rose-300/15"
              >
                {deleting ? "Deleting..." : "Delete This Scan"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
