"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart,
  Area,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
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
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(148, 163, 184, 0.18)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={getColor(score)} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={circumference - progress}
          strokeLinecap="round" className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{score}</span>
        {label && <span className="text-[9px] text-slate-400 font-medium mt-0.5">{label}</span>}
      </div>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-300";
  if (score >= 60) return "text-cyan-300";
  return "text-rose-300";
}

function getScoreBg(score: number): string {
  if (score >= 80) return "bg-emerald-400/10";
  if (score >= 60) return "bg-cyan-400/10";
  return "bg-rose-400/10";
}

function ScanAtmosphere() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="scan-os-grid absolute inset-0 opacity-40" />
      <div className="scan-os-orb scan-os-orb-one absolute -top-40 right-[-8rem] h-[28rem] w-[28rem] rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="scan-os-orb scan-os-orb-two absolute top-[32rem] -left-40 h-[26rem] w-[26rem] rounded-full bg-violet-500/10 blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-cyan-400/[0.04] to-transparent" />
    </div>
  );
}

function ScanOsStyles() {
  return (
    <style jsx global>{`
      .scan-os-shell {
        background: #060b16;
        color: #e2e8f0;
      }
      .scan-os-grid {
        background-image: linear-gradient(rgba(125, 211, 252, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(125, 211, 252, 0.06) 1px, transparent 1px);
        background-size: 32px 32px;
        mask-image: linear-gradient(to bottom, black, transparent 72%);
      }
      .scan-os-header {
        background: rgba(6, 11, 22, 0.76);
        border-color: rgba(148, 163, 184, 0.14);
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03);
      }
      .scan-os-panel {
        background: linear-gradient(145deg, rgba(15, 23, 42, 0.94), rgba(10, 17, 31, 0.9));
        border-color: rgba(148, 163, 184, 0.16);
        box-shadow: 0 20px 70px rgba(0, 0, 0, 0.2);
      }
      .scan-os-card {
        background: rgba(15, 23, 42, 0.68);
        border-color: rgba(148, 163, 184, 0.14);
      }
      .scan-os-capture {
        background: radial-gradient(circle at 82% 0%, rgba(34, 211, 238, 0.24), transparent 27%), linear-gradient(135deg, #0d3650 0%, #0b1b35 47%, #17123d 100%);
        border: 1px solid rgba(125, 211, 252, 0.25);
        box-shadow: 0 28px 80px rgba(8, 145, 178, 0.16);
      }
      .scan-os-orb-one { animation: scan-os-drift 13s ease-in-out infinite; }
      .scan-os-orb-two { animation: scan-os-drift 17s ease-in-out -6s infinite reverse; }
      .scan-os-live-dot { animation: scan-os-pulse 2.2s ease-in-out infinite; }
      @keyframes scan-os-drift {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
        50% { transform: translate3d(-1.5rem, 1rem, 0) scale(1.08); }
      }
      @keyframes scan-os-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(45, 212, 191, 0.45); }
        50% { box-shadow: 0 0 0 7px rgba(45, 212, 191, 0); }
      }
      @media (prefers-reduced-motion: reduce) {
        .scan-os-orb-one, .scan-os-orb-two, .scan-os-live-dot { animation: none; }
      }
    `}</style>
  );
}

export default function FaceScanPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<FaceScanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [latestResult, setLatestResult] = useState<FaceScan | null>(null);

  const autoOpenedRef = useRef(false);

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSummary();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (loading || autoOpenedRef.current || uploading) return;
    const today = new Date().toISOString().split("T")[0];
    const scannedToday = summary?.latest_scan?.scan_date === today;
    if (!scannedToday) {
      autoOpenedRef.current = true;
      const timer = window.setTimeout(() => fileInputRef.current?.click(), 400);
      return () => window.clearTimeout(timer);
    }
  }, [loading, summary, uploading]);

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
        hair: summary.trends.hair_health[i],
        skin: summary.trends.skin_quality[i],
        stress: summary.trends.stress_level[i],
        sleep: summary.trends.sleep_quality[i],
      }))
    : [];

  if (loading) {
    return (
      <div className="scan-os-shell relative isolate min-h-screen overflow-hidden">
        <ScanAtmosphere />
        <ScanOsStyles />
        <header className="scan-os-header sticky top-0 z-20 border-b backdrop-blur-xl">
          <div className="max-w-4xl mx-auto px-5 sm:px-8 py-3.5 flex items-center gap-3">
            <div className="w-5 h-5 bg-slate-800 rounded animate-pulse" />
            <div className="w-9 h-9 bg-slate-800 rounded-xl animate-pulse" />
            <div className="flex-1">
              <div className="h-4 bg-slate-800 rounded w-24 mb-1 animate-pulse" />
              <div className="h-2.5 bg-slate-900 rounded w-32 animate-pulse" />
            </div>
          </div>
        </header>
        <main className="relative z-10 max-w-4xl mx-auto px-5 sm:px-8 py-8 space-y-6">
          <div className="scan-os-panel rounded-3xl p-8 animate-pulse border">
            <div className="h-40 bg-slate-800/80 rounded-2xl" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="scan-os-card rounded-2xl p-6 animate-pulse border">
                <div className="h-20 bg-slate-800/80 rounded-xl" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  const analysis = latestResult?.analysis;
  const streak = summary?.streak;

  const radarData = analysis ? [
    { metric: "Hair", score: analysis.hair_health.score, fullMark: 100 },
    { metric: "Skin", score: analysis.skin_quality.score, fullMark: 100 },
    { metric: "Sleep", score: analysis.sleep_quality.score, fullMark: 100 },
    { metric: "Stress", score: 100 - analysis.stress_level.score, fullMark: 100 },
  ] : [];

  return (
    <div className="scan-os-shell relative isolate min-h-screen overflow-hidden">
      <ScanAtmosphere />
      <ScanOsStyles />
      <header className="scan-os-header sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-3.5 flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="p-1.5 text-slate-500 hover:text-white rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-9 h-9 bg-gradient-to-br from-cyan-400 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold text-white">Face Intelligence</h1>
            <p className="text-[10px] text-slate-400 font-medium">Private facial wellness signal lab</p>
          </div>
          {streak && streak.current_streak > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-amber-200 font-semibold bg-amber-400/10 px-2.5 py-1 rounded-full border border-amber-300/15">
              <span className="scan-os-live-dot h-1.5 w-1.5 rounded-full bg-amber-300" /> {streak.current_streak} day{streak.current_streak > 1 ? "s" : ""}
            </div>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        {error && (
          <div className="px-4 py-3 bg-rose-500/10 text-rose-200 text-sm rounded-xl border border-rose-300/15 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-medium text-rose-300 hover:text-white">Dismiss</button>
          </div>
        )}

        {/* Camera Capture Section */}
        <div className="scan-os-capture rounded-3xl p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 border border-cyan-200/10 rounded-full -translate-y-1/2 translate-x-1/4" />
          <div className="absolute top-6 right-10 h-24 w-24 rounded-full border border-cyan-200/10" />
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-teal-300/5 rounded-full translate-y-1/2 -translate-x-1/4" />
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(rgba(125, 211, 252, 0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(125, 211, 252, 0.10) 1px, transparent 1px)", backgroundSize: "24px 24px", maskImage: "linear-gradient(to right, black, transparent 70%)" }} />

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
                  <div className="w-8 h-8 bg-cyan-300/10 border border-cyan-200/20 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <p className="text-[11px] text-cyan-100/65 font-semibold uppercase tracking-[0.16em]">Neural scan check-in</p>
                </div>
                <p className="text-white text-base sm:text-lg font-medium leading-relaxed">
                  {latestResult ? "Take another selfie to track your progress" : "Take your first selfie to start tracking wellness"}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-cyan-100/55">Designed for a quick private check-in. This is a wellness signal, not a diagnosis.</p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-white text-slate-950 px-6 py-3.5 rounded-2xl text-sm font-bold hover:bg-cyan-50 transition-colors shadow-lg shadow-cyan-950/30 whitespace-nowrap"
              >
                Take Today&apos;s Selfie
              </button>
            </div>
          )}
        </div>

        {/* No scans empty state */}
        {!latestResult && !uploading && (
          <div className="scan-os-panel rounded-3xl p-10 text-center border">
            <div className="w-20 h-20 bg-cyan-400/10 border border-cyan-300/15 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-cyan-950/20">
              <svg className="w-10 h-10 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80 mb-2">Signal dormant</p>
            <h3 className="text-lg font-bold text-white mb-2">Activate your wellness mirror</h3>
            <p className="text-sm text-slate-400 max-w-xs mx-auto mb-6">
              Take a daily selfie and our AI will analyze your hair, skin, stress levels, and sleep quality over time.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-gradient-to-r from-cyan-400 to-teal-400 text-slate-950 px-6 py-3 rounded-2xl text-sm font-bold hover:from-cyan-300 hover:to-teal-300 transition-all shadow-lg shadow-cyan-950/40"
            >
              Take Your First Selfie
            </button>
          </div>
        )}

        {/* Results Display */}
        {analysis && latestResult && (
          <>
            {/* Overall Score */}
            <div className="scan-os-panel rounded-3xl p-6 border text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="scan-os-live-dot h-1.5 w-1.5 rounded-full bg-teal-300" />
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.16em]">Overall wellness signal</h3>
              </div>
              <div className="flex justify-center mb-4">
                <ScoreRing score={analysis.overall_score} size={140} label="out of 100" />
              </div>
              <p className="text-sm text-slate-300 leading-relaxed max-w-md mx-auto">{analysis.overall_summary}</p>
              {analysis.comparison_to_previous && (
                <div className="mt-4 inline-flex items-center gap-2 bg-emerald-400/10 text-emerald-200 text-xs font-medium px-4 py-2 rounded-full border border-emerald-300/15">
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
              <div className="scan-os-card rounded-2xl p-5 border transition-transform duration-300 hover:-translate-y-0.5">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getScoreBg(analysis.hair_health.score)}`}>
                    <svg className={`w-4 h-4 ${getScoreColor(analysis.hair_health.score)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-slate-200">Hair Health</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className={`text-3xl font-bold ${getScoreColor(analysis.hair_health.score)}`}>{analysis.hair_health.score}</span>
                  <span className="text-xs text-slate-500 mb-1">/100</span>
                </div>
              </div>

              {/* Skin Quality */}
              <div className="scan-os-card rounded-2xl p-5 border transition-transform duration-300 hover:-translate-y-0.5">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getScoreBg(analysis.skin_quality.score)}`}>
                    <svg className={`w-4 h-4 ${getScoreColor(analysis.skin_quality.score)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-slate-200">Skin Quality</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className={`text-3xl font-bold ${getScoreColor(analysis.skin_quality.score)}`}>{analysis.skin_quality.score}</span>
                  <span className="text-xs text-slate-500 mb-1">/100</span>
                </div>
                {analysis.skin_quality.estimated_skin_age && (
                  <p className="text-[10px] text-slate-500 mt-1">Skin age: ~{analysis.skin_quality.estimated_skin_age} yrs</p>
                )}
              </div>

              {/* Stress Level */}
              <div className="scan-os-card rounded-2xl p-5 border transition-transform duration-300 hover:-translate-y-0.5">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getScoreBg(100 - analysis.stress_level.score)}`}>
                    <svg className={`w-4 h-4 ${getScoreColor(100 - analysis.stress_level.score)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-slate-200">Stress Level</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className={`text-3xl font-bold ${getScoreColor(100 - analysis.stress_level.score)}`}>{analysis.stress_level.score}</span>
                  <span className="text-xs text-slate-500 mb-1">/100</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Lower is better</p>
              </div>

              {/* Sleep Quality */}
              <div className="scan-os-card rounded-2xl p-5 border transition-transform duration-300 hover:-translate-y-0.5">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getScoreBg(analysis.sleep_quality.score)}`}>
                    <svg className={`w-4 h-4 ${getScoreColor(analysis.sleep_quality.score)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-slate-200">Sleep Quality</span>
                </div>
                <div className="flex items-end gap-2">
                  <span className={`text-3xl font-bold ${getScoreColor(analysis.sleep_quality.score)}`}>{analysis.sleep_quality.score}</span>
                  <span className="text-xs text-slate-500 mb-1">/100</span>
                </div>
              </div>
            </div>

            {/* Age Tracker */}
            <div className="scan-os-feature-frame">
              <AgeTracker currentScan={latestResult} />
            </div>

            {/* Daily Challenge */}
            <div className="scan-os-feature-frame">
              <DailyChallenge currentScan={latestResult} />
            </div>

            {/* Before/After Comparison */}
            <div className="scan-os-feature-frame">
              <BeforeAfterComparison currentScan={latestResult} />
            </div>

            {/* Observations */}
            <div className="scan-os-panel rounded-2xl p-6 border">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.16em] mb-4">Observed signals</h3>
              <div className="space-y-2">
                {[
                  ...analysis.hair_health.observations,
                  ...analysis.skin_quality.observations,
                  ...analysis.stress_level.observations,
                  ...analysis.sleep_quality.observations,
                ].map((obs, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-300 mt-1.5 shrink-0 shadow-[0_0_10px_rgba(103,232,249,0.8)]" />
                    <p className="text-sm text-slate-300">{obs}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div className="rounded-2xl p-6 border border-teal-300/15 bg-gradient-to-br from-teal-400/10 to-cyan-400/[0.04]">
              <h3 className="text-xs font-semibold text-teal-200 uppercase tracking-[0.16em] mb-4">Suggested care moves</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  ...analysis.hair_health.tips,
                  ...analysis.skin_quality.tips,
                  ...analysis.stress_level.tips,
                  ...analysis.sleep_quality.tips,
                ].slice(0, 6).map((tip, i) => (
                  <div key={i} className="bg-slate-950/30 rounded-xl p-3 border border-white/5">
                    <p className="text-sm text-slate-200">{tip}</p>
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
          <div className="scan-os-panel rounded-2xl p-6 border">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.16em] mb-4">Scan cadence</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-amber-200">{streak.current_streak}</div>
                <p className="text-xs text-slate-500 mt-1">Current Streak</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-violet-200">{streak.longest_streak}</div>
                <p className="text-xs text-slate-500 mt-1">Longest Streak</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-cyan-200">{streak.total_scans}</div>
                <p className="text-xs text-slate-500 mt-1">Total Scans</p>
              </div>
            </div>
          </div>
        )}

        {/* Radar Chart — Current Snapshot */}
        {analysis && radarData.length > 0 && (
          <div className="scan-os-panel rounded-2xl p-6 border">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.16em] mb-2">Wellness profile</h3>
            <p className="text-[10px] text-slate-500 mb-4">Your current health balance at a glance</p>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData} outerRadius="75%">
                <PolarGrid stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="3 3" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fontSize: 11, fontWeight: 600, fill: "#94a3b8" }}
                />
                <Radar
                  dataKey="score"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  fill="url(#radarGradient)"
                  fillOpacity={0.35}
                  dot={{ r: 4, fill: "#22d3ee", strokeWidth: 0 }}
                />
                <defs>
                  <radialGradient id="radarGradient" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.72} />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.12} />
                  </radialGradient>
                </defs>
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Wellness Evolution Chart */}
        {trendData.length > 1 && (
          <div className="scan-os-panel rounded-2xl border overflow-hidden">
            <div className="px-6 pt-6 pb-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.16em]">Wellness evolution</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Track how each metric changes over time</p>
            </div>
            <div className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradOverall" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradHair" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradSkin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradSleep" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, 100]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    tickCount={5}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "1px solid rgba(148, 163, 184, 0.2)",
                      fontSize: "11px",
                      boxShadow: "0 16px 30px rgba(0,0,0,0.35)",
                      padding: "10px 14px",
                      background: "#0f172a",
                      color: "#e2e8f0",
                    }}
                    formatter={((value: number, name: string) => {
                      const labels: Record<string, string> = {
                        overall: "Overall",
                        hair: "Hair",
                        skin: "Skin",
                        sleep: "Sleep",
                        stress: "Stress",
                      };
                      return [`${value}/100`, labels[name] || name];
                    }) as never}
                  />
                  <Area type="monotone" dataKey="overall" stroke="#22d3ee" strokeWidth={2.5} fill="url(#gradOverall)" connectNulls dot={{ r: 3, fill: "#22d3ee", strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="hair" stroke="#8b5cf6" strokeWidth={1.5} fill="url(#gradHair)" connectNulls dot={false} strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="skin" stroke="#f59e0b" strokeWidth={1.5} fill="url(#gradSkin)" connectNulls dot={false} strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="sleep" stroke="#3b82f6" strokeWidth={1.5} fill="url(#gradSleep)" connectNulls dot={false} strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="stress" stroke="#ef4444" strokeWidth={1.5} fill="none" connectNulls dot={false} strokeDasharray="2 2" opacity={0.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="px-6 pb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-cyan-400" /><span className="text-[10px] text-slate-500 font-medium">Overall</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-violet-400 rounded" style={{ borderTop: "2px dashed #a78bfa" }} /><span className="text-[10px] text-slate-500 font-medium">Hair</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-amber-400 rounded" style={{ borderTop: "2px dashed #fbbf24" }} /><span className="text-[10px] text-slate-500 font-medium">Skin</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-blue-400 rounded" style={{ borderTop: "2px dashed #60a5fa" }} /><span className="text-[10px] text-slate-500 font-medium">Sleep</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-rose-400 rounded opacity-50" style={{ borderTop: "2px dashed #fb7185" }} /><span className="text-[10px] text-slate-500 font-medium">Stress</span></div>
            </div>
          </div>
        )}

        {/* View Digital Twin */}
        {latestResult && (
          <button
            onClick={() => router.push("/face-scan/digital-twin")}
            className="w-full bg-gradient-to-br from-cyan-400/15 via-slate-900 to-slate-950 rounded-2xl p-5 border border-cyan-300/15 shadow-lg shadow-cyan-950/20 hover:shadow-xl hover:border-cyan-300/35 transition-all flex items-center justify-between group overflow-hidden relative"
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
            className="w-full relative overflow-hidden rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all group border border-violet-300/15"
            style={{ background: "linear-gradient(135deg, #111b38 0%, #251957 48%, #10182d 100%)" }}
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
            className="scan-os-panel w-full rounded-2xl p-5 border hover:shadow-md hover:border-cyan-300/30 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cyan-400/10 border border-cyan-300/15 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-100">View Full History</p>
                <p className="text-[11px] text-slate-500">See trends, photos, and detailed analytics</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-slate-600 group-hover:text-cyan-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </main>
    </div>
  );
}
