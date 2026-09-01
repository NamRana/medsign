"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getFaceScanSummary } from "@/lib/api";
import type { FaceScan } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import HealthAvatar from "@/components/HealthAvatar";

function getBackgroundGradient(score: number | null): string {
  if (score === null) return "from-gray-100 via-slate-50 to-gray-100";
  if (score >= 80) return "from-emerald-50 via-teal-50 to-cyan-50";
  if (score >= 60) return "from-blue-50 via-indigo-50 to-sky-50";
  if (score >= 40) return "from-amber-50 via-yellow-50 to-orange-50";
  return "from-purple-50 via-slate-50 to-violet-50";
}

function getScoreColor(score: number | null): string {
  if (score === null) return "bg-gray-200";
  if (score >= 80) return "bg-emerald-400";
  if (score >= 60) return "bg-blue-400";
  if (score >= 40) return "bg-amber-400";
  return "bg-red-400";
}

function getScoreTrack(score: number | null): string {
  if (score === null) return "bg-gray-100";
  return "bg-gray-100";
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
  const bgGradient = getBackgroundGradient(overallScore);
  const lowestTips = latestScan ? getLowestMetricTips(latestScan) : null;

  const metrics = [
    { label: "Hair Health", score: latestScan?.hair_health_score ?? null, icon: "M" },
    { label: "Skin Quality", score: latestScan?.skin_quality_score ?? null, icon: "S" },
    { label: "Stress Level", score: latestScan?.stress_level_score ?? null, icon: "T", inverted: true },
    { label: "Sleep Quality", score: latestScan?.sleep_quality_score ?? null, icon: "Z" },
  ];

  if (loading) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${bgGradient} flex items-center justify-center`}>
        <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${bgGradient}`}>
      {/* Header */}
      <header className="bg-white/60 backdrop-blur-xl border-b border-gray-100/60 sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-5 py-3.5 flex items-center justify-between">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </button>
          <h1 className="text-sm font-bold text-gray-700">Your Health Avatar</h1>
          <div className="w-16" /> {/* spacer */}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 py-8 flex flex-col items-center">
        {/* Avatar - Large centered */}
        <div className="mb-8">
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

        {/* Greeting */}
        {userName && (
          <p className="text-sm text-gray-500 mb-6 text-center">
            {latestScan
              ? `${userName}'s Health Companion`
              : `Hi ${userName}! I'm your Health Avatar`
            }
          </p>
        )}

        {/* No data state */}
        {!latestScan && (
          <div className="w-full bg-white rounded-3xl p-8 text-center border border-gray-100 shadow-sm mb-6">
            <p className="text-lg font-semibold text-gray-800 mb-2">Take your first scan to bring me to life!</p>
            <p className="text-sm text-gray-500 mb-5">
              I&apos;ll reflect your health state — my hair, skin, expression, and energy all change based on your scan results.
            </p>
            <button
              onClick={() => router.push("/face-scan")}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-6 py-3 rounded-2xl text-sm font-bold hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg shadow-emerald-200/40"
            >
              Take Your First Scan
            </button>
          </div>
        )}

        {/* Metric bars */}
        {latestScan && (
          <div className="w-full bg-white rounded-3xl p-5 border border-gray-100 shadow-sm mb-5">
            <h3 className="text-sm font-bold text-gray-700 mb-4">Avatar Vitals</h3>
            <div className="space-y-4">
              {metrics.map((m) => (
                <div key={m.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-600">{m.label}</span>
                    <span className="text-xs font-bold text-gray-800">
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
              <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-700">Overall Score</span>
                <span className="text-lg font-bold text-emerald-600">{overallScore}/100</span>
              </div>
            )}
          </div>
        )}

        {/* Tips based on lowest metric */}
        {lowestTips && (
          <div className="w-full bg-white rounded-3xl p-5 border border-gray-100 shadow-sm mb-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">💡</span>
              <h3 className="text-sm font-bold text-gray-700">How to help your avatar</h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Improve your <span className="font-semibold text-gray-700">{lowestTips.metric}</span> score:
            </p>
            <ul className="space-y-2">
              {lowestTips.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-emerald-600">{i + 1}</span>
                  </div>
                  <span className="text-sm text-gray-600 leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTA */}
        {latestScan && (
          <button
            onClick={() => router.push(scannedToday ? "/face-scan" : "/face-scan")}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-6 py-4 rounded-2xl text-sm font-bold hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg shadow-emerald-200/40"
          >
            {scannedToday ? "View Scan Details" : "Take Today's Scan"}
          </button>
        )}
      </main>
    </div>
  );
}
