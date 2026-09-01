"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getFaceScanSummary } from "@/lib/api";
import type { FaceScanSummary, FaceScanAnalysis } from "@/lib/api";
import DigitalTwin from "@/components/DigitalTwin";

type ZoneId = "hair" | "face" | "temples" | "chest";

interface ZoneDetail {
  name: string;
  score: number | null;
  displayScore: number | null;
  observations: string[];
  tips: string[];
  scoreNote?: string;
}

function getZoneDetail(
  zone: ZoneId,
  analysis: FaceScanAnalysis | null
): ZoneDetail {
  if (!analysis) {
    const names: Record<ZoneId, string> = {
      hair: "Hair Health",
      face: "Skin Quality",
      temples: "Stress Level",
      chest: "Sleep Quality",
    };
    return {
      name: names[zone],
      score: null,
      displayScore: null,
      observations: [],
      tips: [],
    };
  }

  switch (zone) {
    case "hair":
      return {
        name: "Hair Health",
        score: analysis.hair_health.score,
        displayScore: analysis.hair_health.score,
        observations: analysis.hair_health.observations,
        tips: analysis.hair_health.tips,
      };
    case "face":
      return {
        name: "Skin Quality",
        score: analysis.skin_quality.score,
        displayScore: analysis.skin_quality.score,
        observations: analysis.skin_quality.observations,
        tips: analysis.skin_quality.tips,
      };
    case "temples":
      return {
        name: "Stress Level",
        score: analysis.stress_level.score,
        displayScore: 100 - analysis.stress_level.score,
        observations: analysis.stress_level.observations,
        tips: analysis.stress_level.tips,
        scoreNote: "Wellness score (inverted: lower stress = higher score)",
      };
    case "chest":
      return {
        name: "Sleep Quality",
        score: analysis.sleep_quality.score,
        displayScore: analysis.sleep_quality.score,
        observations: analysis.sleep_quality.observations,
        tips: analysis.sleep_quality.tips,
      };
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#3b82f6";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Needs Attention";
}

export default function DigitalTwinPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<FaceScanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<ZoneId | null>(null);

  useEffect(() => {
    getFaceScanSummary()
      .then((data) => setSummary(data))
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to load data";
        setError(message);
      })
      .finally(() => setLoading(false));
  }, []);

  const latestScan = summary?.latest_scan;
  const analysis = latestScan?.analysis ?? null;

  const detail = selectedZone ? getZoneDetail(selectedZone, analysis) : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950">
        <header className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 sticky top-0 z-20">
          <div className="max-w-4xl mx-auto px-5 sm:px-8 py-3.5 flex items-center gap-3">
            <div className="w-5 h-5 bg-slate-800 rounded animate-pulse" />
            <div className="w-9 h-9 bg-slate-800 rounded-xl animate-pulse" />
            <div className="flex-1">
              <div className="h-4 bg-slate-800 rounded w-32 mb-1 animate-pulse" />
              <div className="h-2.5 bg-slate-800/50 rounded w-40 animate-pulse" />
            </div>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-5 sm:px-8 py-8">
          <div className="bg-slate-900 rounded-3xl p-8 animate-pulse border border-slate-800">
            <div className="h-[300px] bg-slate-800 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-3.5 flex items-center gap-3">
          <button
            onClick={() => router.push("/face-scan")}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-sm shadow-cyan-500/20">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold text-slate-100">
              Digital Twin
            </h1>
            <p className="text-[10px] text-slate-500 font-medium">
              Interactive body health map
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        {error && (
          <div className="px-4 py-3 bg-red-950/50 text-red-400 text-sm rounded-xl border border-red-900/50 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-xs font-medium text-red-500 hover:text-red-300"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* No scans state */}
        {!latestScan && !error && (
          <div className="bg-slate-900 rounded-3xl p-10 text-center border border-slate-800">
            <div className="w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-5">
              <svg
                className="w-10 h-10 text-cyan-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-2">
              Activate Your Digital Twin
            </h3>
            <p className="text-sm text-slate-400 max-w-xs mx-auto mb-6">
              Take your first face scan to bring your digital body map to life.
              Each zone will glow based on your health metrics.
            </p>
            <button
              onClick={() => router.push("/face-scan")}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-3 rounded-2xl text-sm font-bold hover:from-cyan-600 hover:to-blue-700 transition-all shadow-lg shadow-cyan-500/20"
            >
              Take Your First Scan
            </button>
          </div>
        )}

        {/* Digital Twin visualization */}
        {latestScan && (
          <>
            <div className="flex justify-center">
              <div className="w-full max-w-sm">
                <DigitalTwin
                  hairHealth={latestScan.hair_health_score}
                  skinQuality={latestScan.skin_quality_score}
                  stressLevel={latestScan.stress_level_score}
                  sleepQuality={latestScan.sleep_quality_score}
                  onZoneTap={(zone) => setSelectedZone(zone as ZoneId)}
                  size="full"
                />
              </div>
            </div>

            {/* Instruction hint */}
            {!selectedZone && (
              <p className="text-center text-xs text-slate-500 animate-pulse">
                Tap a zone on the body map to see details
              </p>
            )}

            {/* Detail panel */}
            {detail && (
              <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor:
                        detail.displayScore !== null
                          ? `${getScoreColor(detail.displayScore)}20`
                          : "#374151",
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor:
                          detail.displayScore !== null
                            ? getScoreColor(detail.displayScore)
                            : "#9ca3af",
                        boxShadow:
                          detail.displayScore !== null
                            ? `0 0 8px ${getScoreColor(detail.displayScore)}`
                            : "none",
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-slate-100">
                      {detail.name}
                    </h3>
                    {detail.scoreNote && (
                      <p className="text-[10px] text-slate-500">
                        {detail.scoreNote}
                      </p>
                    )}
                  </div>
                  {detail.displayScore !== null && (
                    <div className="text-right">
                      <span
                        className="text-2xl font-bold"
                        style={{
                          color: getScoreColor(detail.displayScore),
                        }}
                      >
                        {detail.displayScore}
                      </span>
                      <span className="text-xs text-slate-500 ml-1">
                        /100
                      </span>
                      <p
                        className="text-[10px] font-medium mt-0.5"
                        style={{
                          color: getScoreColor(detail.displayScore),
                        }}
                      >
                        {getScoreLabel(detail.displayScore)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Observations */}
                {detail.observations.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Observations
                    </h4>
                    <div className="space-y-1.5">
                      {detail.observations.map((obs, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                          <p className="text-sm text-slate-300">{obs}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tips */}
                {detail.tips.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      AI Recommendations
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {detail.tips.map((tip, i) => (
                        <div
                          key={i}
                          className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50"
                        >
                          <p className="text-xs text-slate-300">{tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Last updated */}
                {latestScan.scan_date && (
                  <p className="text-[10px] text-slate-600 text-right">
                    Last updated:{" "}
                    {new Date(latestScan.scan_date).toLocaleDateString(
                      "en-IN",
                      {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }
                    )}
                  </p>
                )}
              </div>
            )}

            {/* Overall summary card */}
            {analysis && (
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl p-5 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                    <svg
                      className="w-3.5 h-3.5 text-cyan-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Overall Assessment
                  </h4>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {analysis.overall_summary}
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
