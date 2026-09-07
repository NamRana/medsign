"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getFutureProjection } from "@/lib/api";
import type { FutureProjection, ProjectionMetric } from "@/lib/api";

/* ─── Animated Background Stars (CSS-only) ─────────────────────────────────── */

function StarField() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Static stars via radial-gradient layers */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `
            radial-gradient(1px 1px at 10% 20%, rgba(255,255,255,0.8) 0%, transparent 100%),
            radial-gradient(1px 1px at 30% 60%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 50% 10%, rgba(255,255,255,0.9) 0%, transparent 100%),
            radial-gradient(1px 1px at 70% 80%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 90% 30%, rgba(255,255,255,0.7) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 15% 85%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1px 1px at 85% 55%, rgba(255,255,255,0.8) 0%, transparent 100%),
            radial-gradient(1px 1px at 45% 45%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 65% 25%, rgba(255,255,255,0.7) 0%, transparent 100%),
            radial-gradient(1px 1px at 25% 40%, rgba(255,255,255,0.6) 0%, transparent 100%),
            radial-gradient(1px 1px at 55% 75%, rgba(255,255,255,0.8) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 80% 15%, rgba(255,255,255,0.5) 0%, transparent 100%)
          `,
        }}
      />
      {/* Twinkling layer */}
      <div className="absolute inset-0 animate-[twinkle_4s_ease-in-out_infinite]"
        style={{
          backgroundImage: `
            radial-gradient(1.5px 1.5px at 20% 70%, rgba(167,139,250,0.9) 0%, transparent 100%),
            radial-gradient(1px 1px at 60% 40%, rgba(129,140,248,0.8) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 40% 90%, rgba(196,181,253,0.7) 0%, transparent 100%),
            radial-gradient(1px 1px at 75% 65%, rgba(167,139,250,0.6) 0%, transparent 100%)
          `,
        }}
      />
    </div>
  );
}

/* ─── Timeline SVG ──────────────────────────────────────────────────────────── */

function TimelineVisual({
  overallCurrent,
  overallPositive,
  overallNegative,
}: {
  overallCurrent: number;
  overallPositive: number;
  overallNegative: number;
}) {
  return (
    <div className="relative w-full max-w-lg mx-auto py-8 animate-[fadeInUp_0.8s_ease-out_both]">
      <svg viewBox="0 0 500 180" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* Positive path (top) */}
        <path
          d="M 80 90 C 180 90, 220 40, 420 40"
          fill="none"
          stroke="url(#positiveGradient)"
          strokeWidth="3"
          strokeLinecap="round"
          className="animate-[drawLine_1.5s_ease-out_0.3s_both]"
          strokeDasharray="400"
          strokeDashoffset="400"
          style={{ animation: "drawLine 1.5s ease-out 0.3s forwards" }}
        />
        {/* Negative path (bottom) */}
        <path
          d="M 80 90 C 180 90, 220 140, 420 140"
          fill="none"
          stroke="url(#negativeGradient)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.7"
          strokeDasharray="400"
          strokeDashoffset="400"
          style={{ animation: "drawLine 1.5s ease-out 0.6s forwards" }}
        />

        {/* Gradients */}
        <defs>
          <linearGradient id="positiveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
          <linearGradient id="negativeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          {/* Glow filters */}
          <filter id="glowGreen">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glowAmber">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Today node */}
        <circle cx="80" cy="90" r="8" fill="#a78bfa" filter="url(#glowGreen)" opacity="0" style={{ animation: "popIn 0.4s ease-out 1s forwards" }} />
        <text x="80" y="120" textAnchor="middle" className="fill-gray-400 text-[11px]" style={{ fontSize: "11px" }}>Today</text>
        <text x="80" y="75" textAnchor="middle" className="fill-white font-bold text-[14px]" style={{ fontSize: "14px" }}>{overallCurrent}</text>

        {/* Positive end node */}
        <circle cx="420" cy="40" r="10" fill="#34d399" filter="url(#glowGreen)" opacity="0" style={{ animation: "popIn 0.4s ease-out 1.5s forwards" }} />
        <text x="420" y="25" textAnchor="middle" className="fill-emerald-400 font-bold text-[15px]" style={{ fontSize: "15px" }}>{overallPositive}</text>

        {/* Negative end node */}
        <circle cx="420" cy="140" r="8" fill="#f59e0b" filter="url(#glowAmber)" opacity="0" style={{ animation: "popIn 0.4s ease-out 1.8s forwards" }} />
        <text x="420" y="162" textAnchor="middle" className="fill-amber-400 font-bold text-[14px]" style={{ fontSize: "14px" }}>{overallNegative}</text>

        {/* Labels */}
        <text x="460" y="44" className="fill-emerald-300 text-[10px]" style={{ fontSize: "10px" }}>Best You</text>
        <text x="460" y="144" className="fill-amber-300 text-[10px]" style={{ fontSize: "10px" }}>If You Stop</text>
        <text x="250" y="170" textAnchor="middle" className="fill-gray-500 text-[10px]" style={{ fontSize: "10px" }}>30 days from now</text>
      </svg>
    </div>
  );
}

/* ─── Metric Card ───────────────────────────────────────────────────────────── */

const METRIC_CONFIG: Record<string, { label: string; icon: string; glowColor: string; bgGlow: string }> = {
  hair_health: { label: "Hair Health", icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", glowColor: "shadow-emerald-500/20", bgGlow: "from-emerald-500/10 to-emerald-900/5" },
  skin_quality: { label: "Skin Quality", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z", glowColor: "shadow-blue-500/20", bgGlow: "from-blue-500/10 to-blue-900/5" },
  stress_level: { label: "Stress Level", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", glowColor: "shadow-orange-500/20", bgGlow: "from-orange-500/10 to-orange-900/5" },
  sleep_quality: { label: "Sleep Quality", icon: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z", glowColor: "shadow-violet-500/20", bgGlow: "from-violet-500/10 to-violet-900/5" },
};

function MetricCard({ metricKey, metric, delay }: { metricKey: string; metric: ProjectionMetric; delay: number }) {
  const config = METRIC_CONFIG[metricKey];
  const range = metric.projected_positive - metric.projected_negative;
  const progress = range > 0 ? ((metric.current - metric.projected_negative) / range) * 100 : 50;

  const trendBadge = {
    improving: { text: "Improving", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
    stable: { text: "Stable", color: "text-gray-400 bg-gray-400/10 border-gray-400/20" },
    declining: { text: "Declining", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  }[metric.trend];

  return (
    <div
      className={`relative rounded-2xl border border-white/10 bg-gradient-to-br ${config.bgGlow} backdrop-blur-sm p-5 shadow-lg ${config.glowColor} opacity-0`}
      style={{ animation: `fadeInUp 0.6s ease-out ${delay}s forwards` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
            </svg>
          </div>
          <span className="text-xs font-semibold text-white/80">{config.label}</span>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${trendBadge.color}`}>
          {trendBadge.text} {metric.trend === "improving" ? "↗" : metric.trend === "declining" ? "↘" : "→"}
        </span>
      </div>

      {/* Score display */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-emerald-400">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
          <span className="text-sm font-bold">{metric.projected_positive}</span>
        </div>
        <div className="text-center">
          <span className="text-2xl font-bold text-white">{metric.current}</span>
        </div>
        <div className="flex items-center gap-1.5 text-amber-400">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className="text-sm font-bold">{metric.projected_negative}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400 via-white to-emerald-400 rounded-full opacity-60" style={{ width: "100%" }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-lg shadow-white/50 transition-all duration-700"
          style={{ left: `calc(${Math.min(100, Math.max(0, progress))}% - 5px)` }}
        />
      </div>
    </div>
  );
}

/* ─── Loading Skeleton ──────────────────────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="future-os-shell min-h-screen bg-[#060b16] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8 animate-pulse">
        {/* Timeline skeleton */}
        <div className="h-40 rounded-2xl bg-white/5 border border-white/10" />
        {/* Metric cards skeleton */}
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-white/5 border border-white/10" />
          ))}
        </div>
        {/* Narrative skeleton */}
        <div className="flex gap-4">
          <div className="flex-1 h-36 rounded-2xl bg-white/5 border border-white/10" />
          <div className="flex-1 h-36 rounded-2xl bg-white/5 border border-white/10" />
        </div>
      </div>
    </div>
  );
}

/* ─── Not Enough Data State ─────────────────────────────────────────────────── */

function NotEnoughData({ daysScanned }: { daysScanned: number }) {
  return (
    <div className="future-os-shell min-h-screen bg-[#060b16] flex flex-col items-center justify-center p-6 animate-[fadeInUp_0.6s_ease-out_both]">
      <StarField />
      <div className="relative z-10 text-center max-w-sm">
        {/* Crystal ball icon */}
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-400/30 flex items-center justify-center">
          <svg className="w-12 h-12 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4" />
          </svg>
        </div>

        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">Trajectory model</p>
        <h2 className="text-xl font-bold text-white mb-2">Unlock your future signal</h2>
        <p className="text-sm text-gray-400 mb-8">
          Scan for 3+ days to see where you&apos;re headed. Our AI needs a few data points to project your trajectory.
        </p>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {[1, 2, 3].map((day) => (
            <div key={day} className="flex flex-col items-center gap-1.5">
              <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
                day <= daysScanned
                  ? "border-emerald-400 bg-emerald-400/20"
                  : "border-white/20 bg-white/5"
              }`}>
                {day <= daysScanned ? (
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-xs text-white/40">{day}</span>
                )}
              </div>
              <span className="text-[10px] text-gray-500">Day {day}</span>
            </div>
          ))}
        </div>

        <p className="text-sm text-violet-300 font-medium mb-6">{daysScanned}/3 days scanned</p>

        <a
          href="/face-scan"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-6 py-3 rounded-2xl text-sm font-bold hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/25"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          </svg>
          Take Today&apos;s Scan
        </a>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────────── */

export default function FutureProjectionPage() {
  const router = useRouter();
  const [projection, setProjection] = useState<FutureProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notEnoughData, setNotEnoughData] = useState<number | null>(null);

  useEffect(() => {
    async function loadProjection() {
      try {
        const data = await getFutureProjection();
        setProjection(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load projection";
        // Check if it's a "not enough data" error
        if (message.includes("Need at least 3 days")) {
          const match = message.match(/Currently have (\d+)/);
          setNotEnoughData(match ? parseInt(match[1]) : 0);
        } else {
          setError(message);
        }
      } finally {
        setLoading(false);
      }
    }
    loadProjection();
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (notEnoughData !== null) return <NotEnoughData daysScanned={notEnoughData} />;

  if (error) {
    return (
      <div className="future-os-shell min-h-screen bg-[#060b16] flex flex-col items-center justify-center p-6">
        <StarField />
        <div className="relative z-10 text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-400/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-white/10 border border-white/20 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-white/20 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!projection) return null;

  return (
    <div className="future-os-shell min-h-screen relative">
      <StarField />

      {/* Custom keyframe styles */}
      <style jsx>{`
        .future-os-shell {
          background: radial-gradient(circle at 82% -4%, rgba(34, 211, 238, 0.13), transparent 26%), radial-gradient(circle at 0% 70%, rgba(139, 92, 246, 0.14), transparent 31%), #060b16;
        }
        .future-os-header {
          background: rgba(6, 11, 22, 0.68);
          border-color: rgba(148, 163, 184, 0.12);
          backdrop-filter: blur(20px);
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes drawLine {
          to { stroke-dashoffset: 0; }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Header */}
      <header className="future-os-header relative z-10 border-b sticky top-0">
        <div className="max-w-2xl mx-auto px-5 py-3.5 flex items-center gap-3">
          <button
            onClick={() => router.push("/face-scan")}
            className="p-1.5 text-gray-500 hover:text-white rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-9 h-9 bg-gradient-to-br from-cyan-400 to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold text-white">Future Signal</h1>
            <p className="text-[10px] text-slate-500 font-medium">30-day projection based on {projection.days_of_data} days of scan data</p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.85)]" />
            Model ready
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 max-w-2xl mx-auto px-5 py-6 space-y-8">

        {/* Timeline Visual */}
        <TimelineVisual
          overallCurrent={projection.overall_current}
          overallPositive={projection.overall_projected_positive}
          overallNegative={projection.overall_projected_negative}
        />

        <p className="mx-auto max-w-md text-center text-[11px] leading-relaxed text-slate-500">This projection maps possible wellbeing trends from recent scan signals. It is not a medical forecast or diagnosis.</p>

        {/* Metric Cards - 2x2 grid */}
        <div className="grid grid-cols-2 gap-4">
          <MetricCard metricKey="hair_health" metric={projection.hair_health} delay={1.2} />
          <MetricCard metricKey="skin_quality" metric={projection.skin_quality} delay={1.4} />
          <MetricCard metricKey="stress_level" metric={projection.stress_level} delay={1.6} />
          <MetricCard metricKey="sleep_quality" metric={projection.sleep_quality} delay={1.8} />
        </div>

        {/* Narrative Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Positive narrative */}
          <div
            className="rounded-2xl p-5 border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 to-emerald-900/5 backdrop-blur-sm opacity-0"
            style={{ animation: "slideInLeft 0.6s ease-out 2.0s forwards" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-400/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-emerald-300">Keep Going</h3>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{projection.positive_narrative}</p>
          </div>

          {/* Negative narrative */}
          <div
            className="rounded-2xl p-5 border border-amber-400/20 bg-gradient-to-br from-amber-500/10 to-amber-900/5 backdrop-blur-sm opacity-0"
            style={{ animation: "slideInRight 0.6s ease-out 2.2s forwards" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-400/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-amber-300">Watch Out</h3>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{projection.negative_narrative}</p>
          </div>
        </div>

        {/* Top Recommendation */}
        <div
          className="rounded-2xl p-5 border border-violet-400/20 bg-gradient-to-br from-violet-500/10 to-indigo-900/10 backdrop-blur-sm opacity-0"
          style={{ animation: "fadeInUp 0.6s ease-out 2.4s forwards" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-violet-400/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-violet-300">Today&apos;s #1 Move</h3>
          </div>
          <p className="text-sm text-gray-200 leading-relaxed font-medium">{projection.top_recommendation}</p>
        </div>

        {/* Bottom CTAs */}
        <div
          className="flex flex-col sm:flex-row gap-3 pt-4 opacity-0"
          style={{ animation: "fadeInUp 0.6s ease-out 2.6s forwards" }}
        >
          <a
            href="/face-scan"
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-5 py-3.5 rounded-2xl text-sm font-bold hover:from-violet-500 hover:to-indigo-500 transition-all shadow-lg shadow-violet-500/20"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            </svg>
            Take Today&apos;s Scan
          </a>
          <button
            disabled
            className="flex-1 flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-gray-500 px-5 py-3.5 rounded-2xl text-sm font-medium cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share Journey (Coming Soon)
          </button>
        </div>

        {/* Spacer */}
        <div className="h-8" />
      </main>
    </div>
  );
}
