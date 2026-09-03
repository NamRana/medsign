"use client";

import { useEffect, useState } from "react";
import { getFaceScans, getFaceScanImageUrl } from "@/lib/api";
import type { FaceScan } from "@/lib/api";

// ── Before/After Comparison ─────────────────────────────────────────────────

function ScoreDelta({ current, previous, label }: { current: number; previous: number; label: string }) {
  const diff = current - previous;
  const color = diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : "text-gray-400";
  const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-gray-400">{previous}</span>
        <span className={`font-bold ${color}`}>{arrow}</span>
        <span className="font-bold text-gray-800">{current}</span>
        <span className={`text-[10px] font-bold ${color}`}>
          {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "—"}
        </span>
      </div>
    </div>
  );
}

export function BeforeAfterComparison({ currentScan }: { currentScan: FaceScan }) {
  const [comparisonScan, setComparisonScan] = useState<FaceScan | null>(null);
  const [currentImg, setCurrentImg] = useState<string | null>(null);
  const [comparisonImg, setComparisonImg] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<"7days" | "first">("7days");
  const [allScans, setAllScans] = useState<FaceScan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFaceScans(365).then((scans) => {
      setAllScans(scans);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (allScans.length < 2) return;

    const sorted = [...allScans].sort((a, b) => a.scan_date.localeCompare(b.scan_date));
    const today = currentScan.scan_date;

    let target: FaceScan | null = null;
    if (compareMode === "7days") {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() - 7);
      const targetStr = targetDate.toISOString().split("T")[0];
      const candidates = sorted.filter((s) => s.scan_date <= targetStr && s.id !== currentScan.id);
      target = candidates.length > 0 ? candidates[candidates.length - 1] : null;
      if (!target) {
        const older = sorted.filter((s) => s.id !== currentScan.id && s.scan_date < today);
        target = older.length > 0 ? older[0] : null;
      }
    } else {
      target = sorted[0].id !== currentScan.id ? sorted[0] : (sorted.length > 1 ? sorted[1] : null);
    }

    setComparisonScan(target);

    getFaceScanImageUrl(currentScan.id).then(setCurrentImg).catch(() => {});
    if (target) {
      getFaceScanImageUrl(target.id).then(setComparisonImg).catch(() => {});
    }
  }, [allScans, compareMode, currentScan]);

  if (loading || allScans.length < 2 || !comparisonScan) return null;

  const curr = currentScan.analysis;
  const prev = comparisonScan.analysis;
  if (!curr || !prev) return null;

  const overallDiff = curr.overall_score - prev.overall_score;
  const daysApart = Math.round(
    (new Date(currentScan.scan_date).getTime() - new Date(comparisonScan.scan_date).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Before & After</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">{daysApart} days of progress</p>
          </div>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setCompareMode("7days")}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${
                compareMode === "7days" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
              }`}
            >
              vs 7 days
            </button>
            <button
              onClick={() => setCompareMode("first")}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${
                compareMode === "first" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
              }`}
            >
              vs First
            </button>
          </div>
        </div>
      </div>

      {/* Photos side by side */}
      <div className="grid grid-cols-2 gap-0.5 bg-gray-100">
        <div className="bg-gray-50 aspect-square relative overflow-hidden">
          {comparisonImg ? (
            <img src={comparisonImg} alt="Before" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 bg-gray-200 rounded-full mx-auto mb-2 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3">
            <p className="text-white text-[10px] font-semibold">Before</p>
            <p className="text-white/70 text-[9px]">{new Date(comparisonScan.scan_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
            <div className="text-white text-lg font-black mt-0.5">{prev.overall_score}</div>
          </div>
        </div>
        <div className="bg-gray-50 aspect-square relative overflow-hidden">
          {currentImg ? (
            <img src={currentImg} alt="After" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-12 h-12 bg-gray-200 rounded-full mx-auto flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3">
            <p className="text-white text-[10px] font-semibold">After</p>
            <p className="text-white/70 text-[9px]">Today</p>
            <div className="text-white text-lg font-black mt-0.5">{curr.overall_score}</div>
          </div>
        </div>
      </div>

      {/* Overall change banner */}
      <div className={`px-5 py-3 text-center ${
        overallDiff > 0 ? "bg-emerald-50" : overallDiff < 0 ? "bg-red-50" : "bg-gray-50"
      }`}>
        <span className={`text-sm font-black ${
          overallDiff > 0 ? "text-emerald-600" : overallDiff < 0 ? "text-red-500" : "text-gray-500"
        }`}>
          {overallDiff > 0 ? `+${overallDiff} points` : overallDiff < 0 ? `${overallDiff} points` : "No change"}
        </span>
        <span className="text-xs text-gray-400 ml-2">overall</span>
      </div>

      {/* Score breakdown */}
      <div className="px-5 py-4 space-y-2.5">
        <ScoreDelta label="Hair Health" current={curr.hair_health.score} previous={prev.hair_health.score} />
        <ScoreDelta label="Skin Quality" current={curr.skin_quality.score} previous={prev.skin_quality.score} />
        <ScoreDelta label="Stress Level" current={curr.stress_level.score} previous={prev.stress_level.score} />
        <ScoreDelta label="Sleep Quality" current={curr.sleep_quality.score} previous={prev.sleep_quality.score} />
      </div>
    </div>
  );
}


// ── Age Tracker ─────────────────────────────────────────────────────────────

export function AgeTracker({ currentScan }: { currentScan: FaceScan }) {
  const [allScans, setAllScans] = useState<FaceScan[]>([]);

  useEffect(() => {
    getFaceScans(365).then(setAllScans).catch(() => {});
  }, []);

  const skinAge = currentScan.analysis?.skin_quality?.estimated_skin_age;
  if (!skinAge) return null;

  const sorted = [...allScans]
    .filter((s) => s.analysis?.skin_quality?.estimated_skin_age != null)
    .sort((a, b) => a.scan_date.localeCompare(b.scan_date));

  const firstSkinAge = sorted.length > 0 ? sorted[0].analysis!.skin_quality.estimated_skin_age! : skinAge;
  const ageChange = firstSkinAge - skinAge;

  const ageHistory = sorted.slice(-7).map((s) => ({
    date: new Date(s.scan_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    age: s.analysis!.skin_quality.estimated_skin_age!,
  }));

  return (
    <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 rounded-2xl p-5 shadow-lg shadow-purple-200/30 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-violet-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-violet-200 uppercase tracking-wider">Skin Age Tracker</h3>
          </div>
        </div>

        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="text-5xl font-black text-white">{skinAge}</div>
            <p className="text-xs text-violet-300 mt-1">Estimated Skin Age</p>
          </div>
          {ageChange !== 0 && sorted.length > 1 && (
            <div className={`text-right px-3 py-2 rounded-xl ${
              ageChange > 0 ? "bg-emerald-500/20" : "bg-red-500/20"
            }`}>
              <div className={`text-lg font-black ${ageChange > 0 ? "text-emerald-300" : "text-red-300"}`}>
                {ageChange > 0 ? `-${ageChange}` : `+${Math.abs(ageChange)}`} yrs
              </div>
              <p className="text-[10px] text-violet-300">
                {ageChange > 0 ? "younger since start" : "aged since start"}
              </p>
            </div>
          )}
        </div>

        {/* Mini age timeline */}
        {ageHistory.length > 1 && (
          <div className="bg-white/10 rounded-xl p-3">
            <div className="flex items-end justify-between gap-1" style={{ height: "48px" }}>
              {ageHistory.map((point, i) => {
                const minAge = Math.min(...ageHistory.map((p) => p.age));
                const maxAge = Math.max(...ageHistory.map((p) => p.age));
                const range = maxAge - minAge || 1;
                const height = ((point.age - minAge) / range) * 32 + 16;
                const isLatest = i === ageHistory.length - 1;
                return (
                  <div key={i} className="flex flex-col items-center gap-1 flex-1">
                    <span className={`text-[8px] font-bold ${isLatest ? "text-white" : "text-violet-300"}`}>
                      {point.age}
                    </span>
                    <div
                      className={`w-full max-w-[20px] rounded-t-md ${isLatest ? "bg-violet-300" : "bg-white/20"}`}
                      style={{ height: `${height}px` }}
                    />
                    <span className="text-[7px] text-violet-400">{point.date.split(" ")[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sorted.length <= 1 && (
          <p className="text-[11px] text-violet-300/60 mt-2">Keep scanning daily to track your skin age reversal</p>
        )}
      </div>
    </div>
  );
}


// ── Daily Wellness Challenge ────────────────────────────────────────────────

interface Challenge {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
}

const CHALLENGE_POOL: Record<string, Challenge[]> = {
  hair_health: [
    { id: "hair_oil", title: "Oil Your Hair", description: "Apply natural hair oil and massage scalp for 5 minutes", icon: "💆", category: "Hair", difficulty: "easy" },
    { id: "hair_water", title: "Hydrate for Hair", description: "Drink at least 8 glasses of water today", icon: "💧", category: "Hair", difficulty: "easy" },
    { id: "hair_protein", title: "Protein Boost", description: "Include eggs, nuts, or legumes in today's meals", icon: "🥚", category: "Hair", difficulty: "easy" },
    { id: "hair_wash", title: "Gentle Wash", description: "Wash hair with lukewarm water, avoid hot water", icon: "🚿", category: "Hair", difficulty: "easy" },
  ],
  skin_quality: [
    { id: "skin_sunscreen", title: "SPF Shield", description: "Apply sunscreen before stepping outside today", icon: "🧴", category: "Skin", difficulty: "easy" },
    { id: "skin_water", title: "Glow Up Hydration", description: "Drink 10 glasses of water for radiant skin", icon: "✨", category: "Skin", difficulty: "medium" },
    { id: "skin_fruit", title: "Vitamin C Boost", description: "Eat an orange, kiwi, or amla today", icon: "🍊", category: "Skin", difficulty: "easy" },
    { id: "skin_screen", title: "Screen Break", description: "Take a 5-min break from screens every hour", icon: "📱", category: "Skin", difficulty: "medium" },
  ],
  stress_level: [
    { id: "stress_breathe", title: "Box Breathing", description: "Do 4-4-4-4 box breathing for 5 minutes", icon: "🧘", category: "Stress", difficulty: "easy" },
    { id: "stress_walk", title: "Stress-Free Walk", description: "Take a 15-minute walk without your phone", icon: "🚶", category: "Stress", difficulty: "medium" },
    { id: "stress_music", title: "Sound Therapy", description: "Listen to calming music for 10 minutes", icon: "🎵", category: "Stress", difficulty: "easy" },
    { id: "stress_journal", title: "Quick Journal", description: "Write down 3 things you're grateful for", icon: "📝", category: "Stress", difficulty: "easy" },
  ],
  sleep_quality: [
    { id: "sleep_screen", title: "Digital Sunset", description: "No screens 30 minutes before bed tonight", icon: "🌙", category: "Sleep", difficulty: "medium" },
    { id: "sleep_time", title: "Early Night", description: "Be in bed by 10:30 PM tonight", icon: "🛏️", category: "Sleep", difficulty: "medium" },
    { id: "sleep_caffeine", title: "Caffeine Cutoff", description: "No coffee or tea after 4 PM today", icon: "☕", category: "Sleep", difficulty: "easy" },
    { id: "sleep_routine", title: "Wind Down Ritual", description: "Read a book or stretch for 10 mins before bed", icon: "📖", category: "Sleep", difficulty: "easy" },
  ],
};

export function DailyChallenge({ currentScan }: { currentScan: FaceScan }) {
  const [accepted, setAccepted] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const stored = localStorage.getItem(`medsign_challenge_${today}`);
    if (stored === "accepted") setAccepted(true);
    if (stored === "completed") { setAccepted(true); setCompleted(true); }
  }, []);

  const analysis = currentScan.analysis;
  if (!analysis) return null;

  const scores = [
    { key: "hair_health", score: analysis.hair_health.score },
    { key: "skin_quality", score: analysis.skin_quality.score },
    { key: "stress_level", score: analysis.stress_level.score },
    { key: "sleep_quality", score: analysis.sleep_quality.score },
  ];

  const weakest = scores.reduce((min, s) => s.score < min.score ? s : min, scores[0]);
  const pool = CHALLENGE_POOL[weakest.key] || CHALLENGE_POOL.skin_quality;

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const challenge = pool[dayOfYear % pool.length];

  function handleAccept() {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(`medsign_challenge_${today}`, "accepted");
    setAccepted(true);
  }

  function handleComplete() {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(`medsign_challenge_${today}`, "completed");
    setCompleted(true);
  }

  const diffColors = { easy: "text-emerald-400 bg-emerald-400/10", medium: "text-amber-400 bg-amber-400/10", hard: "text-red-400 bg-red-400/10" };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Daily Challenge</h3>
              <p className="text-[10px] text-gray-400">Based on your {weakest.key.replace("_", " ")} score ({weakest.score})</p>
            </div>
          </div>
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${diffColors[challenge.difficulty]}`}>
            {challenge.difficulty}
          </span>
        </div>

        <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-4">
          <span className="text-2xl">{challenge.icon}</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900">{challenge.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">{challenge.description}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          {!accepted ? (
            <button
              onClick={handleAccept}
              className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all shadow-md shadow-amber-200/30"
            >
              Accept Challenge
            </button>
          ) : !completed ? (
            <>
              <div className="flex-1 flex items-center gap-2 text-xs text-amber-600 font-semibold bg-amber-50 px-3 py-2.5 rounded-xl">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                In Progress
              </div>
              <button
                onClick={handleComplete}
                className="px-4 py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 transition-all"
              >
                Done!
              </button>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center gap-2 text-xs text-emerald-600 font-bold bg-emerald-50 px-3 py-2.5 rounded-xl border border-emerald-100">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Challenge Complete! Scan again tomorrow to see the difference.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
