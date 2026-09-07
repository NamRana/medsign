"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getFaceScanSummary } from "@/lib/api";
import type { FaceScan } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import HealthAvatar from "@/components/HealthAvatar";

function getScoreColor(score: number | null): string {
  if (score === null) return "bg-slate-700";
  if (score >= 80) return "bg-emerald-300";
  if (score >= 60) return "bg-cyan-300";
  if (score >= 40) return "bg-amber-300";
  return "bg-rose-300";
}

function getScoreTrack(_score: number | null): string {
  void _score;
  return "bg-slate-800";
}

function AvatarAtmosphere() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="avatar-os-grid absolute inset-0" />
      <div className="avatar-os-orb absolute -top-36 left-[45%] h-[30rem] w-[30rem] rounded-full bg-teal-400/10 blur-3xl" />
      <div className="absolute -bottom-40 -left-28 h-[24rem] w-[24rem] rounded-full bg-violet-500/10 blur-3xl" />
    </div>
  );
}

function AvatarOsStyles() {
  return (
    <style jsx global>{`
      .avatar-os-shell { background: #060b16; color: #e2e8f0; }
      .avatar-os-grid {
        opacity: 0.32;
        background-image: linear-gradient(rgba(45, 212, 191, 0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(45, 212, 191, 0.055) 1px, transparent 1px);
        background-size: 34px 34px;
        mask-image: linear-gradient(to bottom, black, transparent 75%);
      }
      .avatar-os-header { background: rgba(6, 11, 22, 0.76); border-color: rgba(148, 163, 184, 0.14); }
      .avatar-os-panel { background: linear-gradient(145deg, rgba(15, 23, 42, 0.94), rgba(8, 15, 29, 0.9)); border-color: rgba(148, 163, 184, 0.15); box-shadow: 0 22px 68px rgba(0, 0, 0, 0.2); }
      .avatar-os-stage { background: radial-gradient(circle at 50% 42%, rgba(45, 212, 191, 0.18), transparent 34%), linear-gradient(145deg, rgba(13, 42, 53, 0.86), rgba(15, 23, 42, 0.9)); border-color: rgba(94, 234, 212, 0.16); box-shadow: inset 0 1px rgba(255, 255, 255, 0.05), 0 28px 80px rgba(13, 148, 136, 0.12); }
      .avatar-os-orb { animation: avatar-os-drift 16s ease-in-out infinite; }
      .avatar-os-live { animation: avatar-os-pulse 2.2s ease-in-out infinite; }
      @keyframes avatar-os-drift { 0%, 100% { transform: translate3d(0, 0, 0) scale(1); } 50% { transform: translate3d(-1.25rem, 1rem, 0) scale(1.08); } }
      @keyframes avatar-os-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(45, 212, 191, 0.42); } 50% { box-shadow: 0 0 0 6px rgba(45, 212, 191, 0); } }
      @media (prefers-reduced-motion: reduce) { .avatar-os-orb, .avatar-os-live { animation: none; } }
    `}</style>
  );
}

function getLowestMetricTips(scan: FaceScan): { metric: string; tips: string[] } {
  const scores: { name: string; score: number | null; tips: string[] }[] = [
    { name: "Hair Health", score: scan.hair_health_score, tips: [
      "Massage your scalp for 5 minutes daily to boost circulation",
      "Include biotin-rich foods: eggs, nuts, sweet potatoes",
      "Avoid heat styling and tight hairstyles",
      "Stay hydrated - aim for 8 glasses of water daily",
    ]},
    { name: "Skin Quality", score: scan.skin_quality_score, tips: [
      "Apply sunscreen daily, even on cloudy days",
      "Eat antioxidant-rich fruits: berries, oranges, papaya",
      "Get 7-8 hours of sleep for skin repair",
      "Cleanse gently and moisturize twice daily",
    ]},
    { name: "Stress Level", score: 100 - (scan.stress_level_score ?? 50), tips: [
      "Practice 5 minutes of deep breathing or meditation",
      "Take a 20-minute walk in nature",
      "Limit screen time before bed",
      "Talk to a friend or journal your thoughts",
    ]},
    { name: "Sleep Quality", score: scan.sleep_quality_score, tips: [
      "Keep a consistent sleep schedule, even on weekends",
      "Avoid caffeine after 2 PM",
      "Make your room dark and cool for better sleep",
      "Put away screens 30 minutes before bed",
    ]},
  ];

  const lowest = scores.reduce((prev, curr) =>
    (curr.score ?? 50) < (prev.score ?? 50) ? curr : prev
  );

  return { metric: lowest.name, tips: lowest.tips };
}

export default function AvatarPage() {
  const router = useRouter();
  const [latestScan, setLatestScan] = useState<FaceScan | null>(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [scannedToday, setScannedToday] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: { user_metadata?: Record<string, string>; email?: string } | null } }) => {
      if (data.user) {
        setUserName(data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "");
      }
    });

    getFaceScanSummary()
      .then((summary) => {
        if (summary.latest_scan) {
          setLatestScan(summary.latest_scan);
          const today = new Date().toISOString().split("T")[0];
          setScannedToday(summary.latest_scan.scan_date === today);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const overallScore = latestScan?.overall_score ?? null;
  const lowestTips = latestScan ? getLowestMetricTips(latestScan) : null;

  const metrics = [
    { label: "Hair Health", score: latestScan?.hair_health_score ?? null, icon: "M" },
    { label: "Skin Quality", score: latestScan?.skin_quality_score ?? null, icon: "S" },
    { label: "Stress Level", score: latestScan?.stress_level_score ?? null, icon: "T", inverted: true },
    { label: "Sleep Quality", score: latestScan?.sleep_quality_score ?? null, icon: "Z" },
  ];

  if (loading) {
    return (
      <div className="avatar-os-shell relative isolate min-h-screen overflow-hidden flex items-center justify-center">
        <AvatarAtmosphere />
        <AvatarOsStyles />
        <div className="relative z-10 w-12 h-12 rounded-full border-4 border-teal-300/15 border-t-teal-300 animate-spin" />
      </div>
    );
  }

  return (
    <div className="avatar-os-shell relative isolate min-h-screen overflow-hidden">
      <AvatarAtmosphere />
      <AvatarOsStyles />
      {/* Header */}
      <header className="avatar-os-header backdrop-blur-xl border-b sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-5 py-3.5 flex items-center justify-between">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </button>
          <h1 className="text-sm font-bold text-white">Care Companion</h1>
          <div className="w-16" /> {/* spacer */}
        </div>
      </header>

      <main className="relative z-10 max-w-lg mx-auto px-5 py-8 flex flex-col items-center">
        {/* Avatar - Large centered */}
        <div className="avatar-os-stage relative mb-6 flex w-full justify-center overflow-hidden rounded-[2rem] border py-8">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 50% 40%, rgba(153,246,228,0.22) 0, transparent 1px)", backgroundSize: "18px 18px", maskImage: "radial-gradient(circle at center, black, transparent 72%)" }} />
          <div className="relative">
            <HealthAvatar
              hairHealth={latestScan?.hair_health_score ?? null}
              skinQuality={latestScan?.skin_quality_score ?? null}
              stressLevel={latestScan?.stress_level_score ?? null}
              sleepQuality={latestScan?.sleep_quality_score ?? null}
              overallScore={overallScore}
              size="lg"
              showMood={true}
              userName={userName}
            />
          </div>
          <div className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full border border-teal-300/15 bg-slate-950/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-200">
            <span className="avatar-os-live h-1.5 w-1.5 rounded-full bg-teal-300" />
            Scan responsive
          </div>
        </div>

        {/* Greeting */}
        {userName && (
          <p className="mb-6 text-center text-sm text-slate-400">
            {latestScan
              ? `${userName}'s care companion`
              : `Hi ${userName}! Your care companion is ready`
            }
          </p>
        )}

        {/* No data state */}
        {!latestScan && (
          <div className="avatar-os-panel w-full rounded-3xl p-8 text-center border mb-6">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-200">Companion offline</p>
            <p className="text-lg font-semibold text-white mb-2">Take your first scan to bring me to life</p>
            <p className="text-sm text-slate-400 mb-5">
              I&apos;ll reflect your health state — my hair, skin, expression, and energy all change based on your scan results.
            </p>
            <button
              onClick={() => router.push("/face-scan")}
              className="bg-gradient-to-r from-teal-300 to-cyan-300 text-slate-950 px-6 py-3 rounded-2xl text-sm font-bold hover:from-teal-200 hover:to-cyan-200 transition-all shadow-lg shadow-teal-950/30"
            >
              Take Your First Scan
            </button>
          </div>
        )}

        {/* Metric bars */}
        {latestScan && (
          <div className="avatar-os-panel w-full rounded-3xl p-5 border mb-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">Vital signals</p>
                <h3 className="mt-1 text-sm font-bold text-white">Companion readout</h3>
              </div>
              <span className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-200">Latest scan</span>
            </div>
            <div className="space-y-4">
              {metrics.map((m) => (
                <div key={m.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-300">{m.label}</span>
                    <span className="text-xs font-bold text-slate-100">
                      {m.score !== null ? (m.inverted ? `${100 - m.score}/100` : `${m.score}/100`) : "—"}
                    </span>
                  </div>
                  <div className={`h-2 rounded-full ${getScoreTrack(m.score)} overflow-hidden`}>
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${getScoreColor(m.inverted && m.score !== null ? 100 - m.score : m.score)}`}
                      style={{ width: m.score !== null ? `${m.inverted ? 100 - m.score : m.score}%` : "0%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {overallScore !== null && (
              <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-200">Overall Signal</span>
                <span className="text-lg font-bold text-teal-200">{overallScore}/100</span>
              </div>
            )}
          </div>
        )}

        {/* Tips based on lowest metric */}
        {lowestTips && (
          <div className="avatar-os-panel w-full rounded-3xl p-5 border mb-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-teal-300/15 bg-teal-400/10 text-sm">✦</span>
              <h3 className="text-sm font-bold text-white">Care moves for your companion</h3>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Focus your next steps on <span className="font-semibold text-slate-200">{lowestTips.metric}</span>:
            </p>
            <ul className="space-y-2">
              {lowestTips.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-teal-400/10 border border-teal-300/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-teal-200">{i + 1}</span>
                  </div>
                  <span className="text-sm text-slate-300 leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTA */}
        {latestScan && (
          <button
            onClick={() => router.push(scannedToday ? "/face-scan" : "/face-scan")}
            className="w-full bg-gradient-to-r from-teal-300 to-cyan-300 text-slate-950 px-6 py-4 rounded-2xl text-sm font-bold hover:from-teal-200 hover:to-cyan-200 transition-all shadow-lg shadow-teal-950/30"
          >
            {scannedToday ? "View Scan Details" : "Take Today's Scan"}
          </button>
        )}
      </main>
    </div>
  );
}
