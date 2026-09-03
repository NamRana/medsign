"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  uploadFaceScan,
  getFaceScanSummary,
} from "@/lib/api";
import type { FaceScan, FaceScanSummary } from "@/lib/api";
import ShareReport from "@/components/ShareReport";
import { BeforeAfterComparison, AgeTracker, DailyChallenge } from "@/components/FaceScanFeatures";

function ScoreRing({ score, size = 120, label }: { score: number; size?: number; label?: string }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 80) return "#10b981";
    if (s >= 60) return "#f59e0b";
    if (s >= 40) return "#ef4444";
    return "#7c3aed";
  };

  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={getColor(score)} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={circumference - progress}
          strokeLinecap="round" className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-gray-900">{score}</span>
        {label && <span className="text-[9px] text-gray-400 font-medium mt-0.5">{label}</span>}
      </div>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function getScoreBg(score: number): string {
  if (score >= 80) return "bg-emerald-50";
  if (score >= 60) return "bg-amber-50";
  return "bg-red-50";
}

export default function FaceScanPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<FaceScanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [latestResult, setLatestResult] = useState<FaceScan | null>(null);

  const [autoOpened, setAutoOpened] = useState(false);

  useEffect(() => {
    loadSummary();
  }, []);

  useEffect(() => {
    if (loading || autoOpened || uploading) return;
    const today = new Date().toISOString().split("T")[0];
    const scannedToday = summary?.latest_scan?.scan_date === today;
    if (!scannedToday) {
      setAutoOpened(true);
      setTimeout(() => fileInputRef.current?.click(), 400);
    }
  }, [loading, summary]);

  async function loadSummary() {
    try {
      const data = await getFaceScanSummary();
      setSummary(data);
      if (data.latest_scan) {
        setLatestResult(data.latest_scan);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const result = await uploadFaceScan(file);
      setLatestResult(result);
      await loadSummary();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const trendData = summary?.trends
    ? summary.trends.dates.map((date, i) => ({
        date: new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        overall: summary.trends.overall[i],
      }))
    : [];

  if (loading) {
    return (
      <div className="min-h-screen warm-bg">
        <header className="warm-header sticky top-0 z-20">
          <div className="max-w-4xl mx-auto px-5 sm:px-8 py-3.5 flex items-center gap-3">
            <div className="w-5 h-5 bg-gray-100 rounded animate-pulse" />
            <div className="w-9 h-9 bg-gray-100 rounded-xl animate-pulse" />
            <div className="flex-1">
              <div className="h-4 bg-gray-100 rounded w-24 mb-1 animate-pulse" />
              <div className="h-2.5 bg-gray-50 rounded w-32 animate-pulse" />
            </div>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-5 sm:px-8 py-8 space-y-6">
          <div className="bg-white rounded-3xl p-8 animate-pulse border border-gray-100">
            <div className="h-40 bg-gray-100 rounded-2xl" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-6 animate-pulse border border-gray-100">
                <div className="h-20 bg-gray-100 rounded-xl" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  const analysis = latestResult?.analysis;
  const streak = summary?.streak;

  return (
    <div className="min-h-screen warm-bg">
      <header className="warm-header sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-3.5 flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-9 h-9 bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-900">Face Scan</h1>
            <p className="text-[10px] text-gray-400 font-medium">AI-powered facial wellness analysis</p>
          </div>
          {streak && streak.current_streak > 0 && (
            <div className="flex items-center gap-1 text-xs text-orange-600 font-semibold bg-orange-50 px-2.5 py-1 rounded-full border border-orange-100">
              <span>&#128293;</span> {streak.current_streak} day{streak.current_streak > 1 ? "s" : ""}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        {error && (
          <div className="px-4 py-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-medium text-red-400 hover:text-red-600">Dismiss</button>
          </div>
        )}

        {/* Camera Capture Section */}
        <div className="bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-600 rounded-3xl p-6 sm:p-8 shadow-xl shadow-rose-200/30 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={handleFileSelect}
          />

          {uploading ? (
            <div className="relative z-10 flex flex-col items-center gap-4 py-6">
              <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-white text-lg font-semibold">Analyzing your face...</p>
                <p className="text-white/60 text-sm mt-1">Our AI is examining hair, skin, stress and sleep indicators</p>
              </div>
            </div>
          ) : (
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <p className="text-[11px] text-white/60 font-semibold uppercase tracking-wider">Daily Check-in</p>
                </div>
                <p className="text-white text-base sm:text-lg font-medium leading-relaxed">
                  {latestResult ? "Take another selfie to track your progress" : "Take your first selfie to start tracking wellness"}
                </p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-white text-rose-600 px-6 py-3.5 rounded-2xl text-sm font-bold hover:bg-rose-50 transition-colors shadow-lg whitespace-nowrap"
              >
                Take Today&apos;s Selfie
              </button>
            </div>
          )}
        </div>

        {/* No scans empty state */}
        {!latestResult && !uploading && (
          <div className="bg-white rounded-3xl p-10 text-center border border-gray-100">
            <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-10 h-10 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Your Wellness Mirror</h3>
            <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6">
              Take a daily selfie and our AI will analyze your hair, skin, stress levels, and sleep quality over time.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-gradient-to-r from-rose-500 to-pink-600 text-white px-6 py-3 rounded-2xl text-sm font-bold hover:from-rose-600 hover:to-pink-700 transition-all shadow-lg shadow-rose-200/50"
            >
              Take Your First Selfie
            </button>
          </div>
        )}

        {/* Results Display */}
        {analysis && latestResult && (
          <>
            {/* Overall Score */}
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm text-center">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Overall Wellness</h3>
              <div className="flex justify-center mb-4">
                <ScoreRing score={analysis.overall_score} size={140} label="out of 100" />
              </div>
              <p className="text-sm text-gray-600 leading-relaxed max-w-md mx-auto">{analysis.overall_summary}</p>
              {analysis.comparison_to_previous && (
                <div className="mt-4 inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs font-medium px-4 py-2 rounded-full border border-emerald-100">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  {analysis.comparison_to_previous}
                </div>
              )}
            </div>

            {/* 4 Score Cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* Hair Health */}
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getScoreBg(analysis.hair_health.score)}`}>
                    <svg className={`w-4 h-4 ${getScoreColor(analysis.hair_health.score)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">Hair Health</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className={`text-3xl font-bold ${getScoreColor(analysis.hair_health.score)}`}>{analysis.hair_health.score}</span>
                  <span className="text-xs text-gray-400 mb-1">/100</span>
                </div>
              </div>

              {/* Skin Quality */}
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getScoreBg(analysis.skin_quality.score)}`}>
                    <svg className={`w-4 h-4 ${getScoreColor(analysis.skin_quality.score)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">Skin Quality</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className={`text-3xl font-bold ${getScoreColor(analysis.skin_quality.score)}`}>{analysis.skin_quality.score}</span>
                  <span className="text-xs text-gray-400 mb-1">/100</span>
                </div>
                {analysis.skin_quality.estimated_skin_age && (
                  <p className="text-[10px] text-gray-400 mt-1">Skin age: ~{analysis.skin_quality.estimated_skin_age} yrs</p>
                )}
              </div>

              {/* Stress Level */}
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getScoreBg(100 - analysis.stress_level.score)}`}>
                    <svg className={`w-4 h-4 ${getScoreColor(100 - analysis.stress_level.score)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">Stress Level</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className={`text-3xl font-bold ${getScoreColor(100 - analysis.stress_level.score)}`}>{analysis.stress_level.score}</span>
                  <span className="text-xs text-gray-400 mb-1">/100</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Lower is better</p>
              </div>

              {/* Sleep Quality */}
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getScoreBg(analysis.sleep_quality.score)}`}>
                    <svg className={`w-4 h-4 ${getScoreColor(analysis.sleep_quality.score)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">Sleep Quality</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className={`text-3xl font-bold ${getScoreColor(analysis.sleep_quality.score)}`}>{analysis.sleep_quality.score}</span>
                  <span className="text-xs text-gray-400 mb-1">/100</span>
                </div>
              </div>
            </div>

            {/* Age Tracker */}
            <AgeTracker currentScan={latestResult} />

            {/* Daily Challenge */}
            <DailyChallenge currentScan={latestResult} />

            {/* Before/After Comparison */}
            <BeforeAfterComparison currentScan={latestResult} />

            {/* Observations */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Observations</h3>
              <div className="space-y-2">
                {[
                  ...analysis.hair_health.observations,
                  ...analysis.skin_quality.observations,
                  ...analysis.stress_level.observations,
                  ...analysis.sleep_quality.observations,
                ].map((obs, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                    <p className="text-sm text-gray-600">{obs}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-2xl p-6 border border-rose-100/60">
              <h3 className="text-xs font-semibold text-rose-700 uppercase tracking-wider mb-4">Personalized Tips</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  ...analysis.hair_health.tips,
                  ...analysis.skin_quality.tips,
                  ...analysis.stress_level.tips,
                  ...analysis.sleep_quality.tips,
                ].slice(0, 6).map((tip, i) => (
                  <div key={i} className="bg-white/80 rounded-xl p-3 border border-rose-100/40">
                    <p className="text-sm text-gray-700">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Share Results */}
            <ShareReport
              content={[
                `Face Scan Results — Overall Score: ${analysis.overall_score}/100`,
                analysis.overall_summary,
                `\nHair Health: ${analysis.hair_health.score}/100`,
                ...analysis.hair_health.observations,
                `\nSkin Quality: ${analysis.skin_quality.score}/100`,
                ...analysis.skin_quality.observations,
                analysis.skin_quality.estimated_skin_age ? `Estimated skin age: ~${analysis.skin_quality.estimated_skin_age} years` : "",
                `\nStress Level: ${analysis.stress_level.score}/100`,
                ...analysis.stress_level.observations,
                `\nSleep Quality: ${analysis.sleep_quality.score}/100`,
                ...analysis.sleep_quality.observations,
                `\nTips:`,
                ...[...analysis.hair_health.tips, ...analysis.skin_quality.tips, ...analysis.stress_level.tips, ...analysis.sleep_quality.tips].slice(0, 4),
              ].filter(Boolean).join("\n")}
              variant="compact"
            />
          </>
        )}

        {/* Streak Section */}
        {streak && streak.total_scans > 0 && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Your Streak</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-orange-600">{streak.current_streak}</div>
                <p className="text-xs text-gray-400 mt-1">Current Streak</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">{streak.longest_streak}</div>
                <p className="text-xs text-gray-400 mt-1">Longest Streak</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-rose-600">{streak.total_scans}</div>
                <p className="text-xs text-gray-400 mt-1">Total Scans</p>
              </div>
            </div>
          </div>
        )}

        {/* Trend Sparkline */}
        {trendData.length > 1 && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">7-Day Trend</h3>
            <ResponsiveContainer width="100%" height={80}>
              <LineChart data={trendData}>
                <Line
                  type="monotone"
                  dataKey="overall"
                  stroke="#e11d48"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB", fontSize: "12px" }}
                  formatter={(value) => [`${value}/100`, "Score"]}
                  labelFormatter={(label) => `${label}`}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* View Digital Twin */}
        {latestResult && (
          <button
            onClick={() => router.push("/face-scan/digital-twin")}
            className="w-full bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 border border-slate-700 shadow-lg hover:shadow-xl hover:border-cyan-700 transition-all flex items-center justify-between group overflow-hidden relative"
          >
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle, #475569 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-100">View Digital Twin</p>
                <p className="text-[11px] text-slate-400">See your body map with glowing health zones</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-slate-500 group-hover:text-cyan-400 transition-colors relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Future You — Flagship Feature Card */}
        {streak && streak.total_scans > 0 && (
          <button
            onClick={() => router.push("/face-scan/future")}
            className="w-full relative overflow-hidden rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all group border border-indigo-200/60"
            style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #1e1b4b 100%)" }}
          >
            {/* Subtle glow effect */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/4" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-500/15 rounded-full blur-xl translate-y-1/2 -translate-x-1/4" />

            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-gradient-to-br from-violet-400/30 to-indigo-500/30 rounded-xl flex items-center justify-center border border-violet-400/20 group-hover:scale-110 transition-transform">
                  <svg className="w-5 h-5 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-white">See Your Future</p>
                  <p className="text-[11px] text-violet-300/80">
                    {streak.total_scans >= 3
                      ? "Where are you headed in 30 days?"
                      : `Unlock after ${3 - streak.total_scans} more scan${3 - streak.total_scans > 1 ? "s" : ""}`
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {streak.total_scans >= 3 && (
                  <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">
                    NEW
                  </span>
                )}
                <svg className="w-5 h-5 text-violet-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </button>
        )}

        {/* View Full History */}
        {streak && streak.total_scans > 0 && (
          <button
            onClick={() => router.push("/face-scan/history")}
            className="w-full bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md hover:border-rose-200 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-800">View Full History</p>
                <p className="text-[11px] text-gray-400">See trends, photos, and detailed analytics</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-300 group-hover:text-rose-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </main>
    </div>
  );
}
