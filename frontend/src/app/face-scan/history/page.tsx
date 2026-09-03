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
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

export default function FaceScanHistoryPage() {
  const router = useRouter();
  const [scans, setScans] = useState<FaceScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScan, setSelectedScan] = useState<FaceScan | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadScans();
  }, []);

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
      <div className="min-h-screen warm-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-sm text-gray-500">Loading scan history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen warm-bg">
      <header className="warm-header sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-3.5 flex items-center gap-3">
          <button onClick={() => router.push("/face-scan")} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-9 h-9 bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-900">Scan History</h1>
            <p className="text-[10px] text-gray-400 font-medium">Last 30 days of face scans</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        {error && (
          <div className="px-4 py-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-medium text-red-400 hover:text-red-600">Dismiss</button>
          </div>
        )}

        {/* Calendar Grid */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">30-Day Overview</h3>
          <div className="grid grid-cols-7 gap-2 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="text-center text-[10px] text-gray-400 font-medium">{day}</div>
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
                      ? "bg-rose-500 text-white shadow-sm shadow-rose-200"
                      : "bg-rose-100 text-rose-600 border-2 border-dashed border-rose-300"
                    : day.scan
                      ? "bg-rose-100 text-rose-700 hover:bg-rose-200 cursor-pointer"
                      : "bg-gray-50 text-gray-300"
                }`}
              >
                {day.date.getDate()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-4 text-[10px] text-gray-400">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-rose-100" />
              <span>Scanned</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-gray-50 border border-gray-200" />
              <span>No scan</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-rose-500" />
              <span>Today</span>
            </div>
          </div>
        </div>

        {/* Trend Charts */}
        {trendData.length > 1 && (
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Trend Charts</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Hair Health */}
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium text-gray-700">Hair Health</span>
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#9CA3AF" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#9CA3AF" }} />
                    <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "11px" }} />
                    <Line type="monotone" dataKey="hair" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Hair" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Skin Quality */}
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm font-medium text-gray-700">Skin Quality</span>
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#9CA3AF" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#9CA3AF" }} />
                    <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "11px" }} />
                    <Line type="monotone" dataKey="skin" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Skin" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Stress Level */}
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span className="text-sm font-medium text-gray-700">Stress Level</span>
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#9CA3AF" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#9CA3AF" }} />
                    <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "11px" }} />
                    <Line type="monotone" dataKey="stress" stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Stress" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Sleep Quality */}
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  <span className="text-sm font-medium text-gray-700">Sleep Quality</span>
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#9CA3AF" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#9CA3AF" }} />
                    <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "11px" }} />
                    <Line type="monotone" dataKey="sleep" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Sleep" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {scans.length === 0 && (
          <div className="bg-white rounded-3xl p-10 text-center border border-gray-100">
            <div className="w-16 h-16 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h4 className="text-base font-bold text-gray-800 mb-1">No scans yet</h4>
            <p className="text-sm text-gray-400 max-w-xs mx-auto">
              Take your first face scan to start building your wellness history.
            </p>
            <button
              onClick={() => router.push("/face-scan")}
              className="mt-5 bg-gradient-to-r from-rose-500 to-pink-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:from-rose-600 hover:to-pink-700 transition-all"
            >
              Take First Scan
            </button>
          </div>
        )}

        {/* Selected Scan Detail Modal */}
        {selectedScan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Scan Details</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(selectedScan.scan_date).toLocaleDateString("en-IN", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <button onClick={() => setSelectedScan(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Scores */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold ${getScoreColor(selectedScan.hair_health_score ?? 0)}`}>
                    {selectedScan.hair_health_score ?? "--"}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Hair Health</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold ${getScoreColor(selectedScan.skin_quality_score ?? 0)}`}>
                    {selectedScan.skin_quality_score ?? "--"}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Skin Quality</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold ${getScoreColor(100 - (selectedScan.stress_level_score ?? 0))}`}>
                    {selectedScan.stress_level_score ?? "--"}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Stress Level</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold ${getScoreColor(selectedScan.sleep_quality_score ?? 0)}`}>
                    {selectedScan.sleep_quality_score ?? "--"}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Sleep Quality</p>
                </div>
              </div>

              {/* Overall */}
              {selectedScan.overall_score !== null && (
                <div className="bg-gray-50 rounded-xl p-4 text-center mb-6">
                  <p className="text-3xl font-bold text-gray-900">{selectedScan.overall_score}</p>
                  <p className="text-xs text-gray-500 mt-1">Overall Score</p>
                </div>
              )}

              {/* Analysis details */}
              {selectedScan.analysis && (
                <div className="space-y-4 mb-6">
                  <p className="text-sm text-gray-600">{selectedScan.analysis.overall_summary}</p>
                  {selectedScan.analysis.comparison_to_previous && (
                    <div className="bg-emerald-50 rounded-xl p-3 text-sm text-emerald-700 border border-emerald-100">
                      {selectedScan.analysis.comparison_to_previous}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">Tips</p>
                    <div className="space-y-1.5">
                      {[
                        ...selectedScan.analysis.hair_health.tips,
                        ...selectedScan.analysis.skin_quality.tips,
                        ...selectedScan.analysis.stress_level.tips,
                        ...selectedScan.analysis.sleep_quality.tips,
                      ].slice(0, 4).map((tip, i) => (
                        <p key={i} className="text-sm text-gray-600 flex items-start gap-2">
                          <span className="text-rose-400 mt-0.5">&#8226;</span>
                          {tip}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedScan.notes && (
                <div className="bg-gray-50 rounded-xl p-3 mb-6">
                  <p className="text-xs font-medium text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-700">{selectedScan.notes}</p>
                </div>
              )}

              {/* Delete Button */}
              <button
                onClick={() => handleDelete(selectedScan.id)}
                disabled={deleting}
                className="w-full text-sm font-medium text-red-500 py-3 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50 border border-red-100"
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
