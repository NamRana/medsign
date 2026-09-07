"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createConversation, getFaceScanSummary, apiFetch } from "@/lib/api";
import type { Conversation, FaceScan } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { useFamily } from "@/lib/family-context";
import { ClinicalStatusChip } from "@/components/ClinicalSignal";

const DigitalTwin = dynamic(() => import("@/components/DigitalTwin"), { ssr: false });
const HealthAura = dynamic(() => import("@/components/HealthAura"), { ssr: false });
const HealthAvatar = dynamic(() => import("@/components/HealthAvatar"), { ssr: false });
const SmartAlerts = dynamic(() => import("@/components/SmartAlerts"), { ssr: false });
const MedicineReminder = dynamic(() => import("@/components/MedicineReminder"), { ssr: false });

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatRelativeDate(dateStr: string): string {
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDate(dateStr);
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getMotivationalMessage(score: number): string {
  if (score >= 80) return "Excellent! You're doing great — keep up the healthy habits.";
  if (score >= 60) return "You're on the right track. Small consistent steps make a big difference.";
  if (score >= 40) return "Let's work together on improving your wellness. You've got this.";
  return "Every journey starts with one step. We're here to support you.";
}

function getDayOfWeek(daysAgo: number): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return days[d.getDay()];
}

// ── Health Score Ring ─────────────────────────────────────────────────────────
function HealthScoreRing({ score, size = 160 }: { score: number; size?: number }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (animatedScore / 100) * circumference;

  useEffect(() => {
    const steps = 60;
    const increment = score / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= score) { setAnimatedScore(score); clearInterval(timer); }
      else setAnimatedScore(Math.floor(current));
    }, 1500 / steps);
    return () => clearInterval(timer);
  }, [score]);

  const getColor = (s: number) => {
    if (s >= 80) return "#10b981";
    if (s >= 60) return "#3b82f6";
    if (s >= 40) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={getColor(score)} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={circumference - progress}
          strokeLinecap="round" className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-white">{animatedScore}</span>
        <span className="text-xs text-white/50 font-medium mt-1">health signal</span>
      </div>
    </div>
  );
}

// ── Mood Check-in ─────────────────────────────────────────────────────────────
function MoodCheckIn({ onSelect }: { onSelect: (mood: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const moods = [
    { emoji: "😊", label: "Great", value: "great" },
    { emoji: "🙂", label: "Good", value: "good" },
    { emoji: "😐", label: "Okay", value: "okay" },
    { emoji: "😟", label: "Low", value: "low" },
    { emoji: "😣", label: "Bad", value: "bad" },
  ];

  return (
    <div className="flex items-center justify-between gap-1.5 sm:gap-3">
      {moods.map((mood) => (
        <button
          key={mood.value}
          onClick={() => { setSelected(mood.value); onSelect(mood.value); }}
          className={`flex flex-col items-center gap-1.5 px-2 sm:px-4 py-3 rounded-2xl transition-all flex-1 min-w-0 ${
            selected === mood.value
              ? "bg-emerald-50 border-2 border-emerald-300 scale-105 shadow-sm"
              : "bg-gray-50/80 border-2 border-transparent hover:bg-gray-100 hover:scale-105"
          }`}
        >
          <span className="text-2xl sm:text-3xl">{mood.emoji}</span>
          <span className="text-[10px] sm:text-[11px] font-medium text-gray-500">{mood.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Weekly Activity ───────────────────────────────────────────────────────────
function WeeklyActivity({ conversations }: { conversations: Conversation[] }) {
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(0, 0, 0, 0);
    const nextD = new Date(d); nextD.setDate(nextD.getDate() + 1);
    const hasActivity = conversations.some((c) => { const cd = new Date(c.created_at); return cd >= d && cd < nextD; });
    return { day: getDayOfWeek(6 - i), active: hasActivity, isToday: i === 6 };
  });

  const streak = (() => { let count = 0; for (let i = last7Days.length - 1; i >= 0; i--) { if (last7Days[i].active) count++; else break; } return count; })();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-gray-700">Weekly Activity</p>
        {streak > 0 && (
          <div className="flex items-center gap-1 text-xs text-orange-600 font-semibold bg-orange-50 px-2.5 py-1 rounded-full">
            🔥 {streak} day streak
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
        {last7Days.map((day, idx) => (
          <div key={idx} className="flex flex-col items-center gap-2 flex-1">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all ${
              day.active ? "bg-emerald-500 shadow-sm shadow-emerald-200"
                : day.isToday ? "bg-emerald-100 border-2 border-dashed border-emerald-300"
                : "bg-gray-100"
            }`}>
              {day.active && <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </div>
            <span className={`text-[10px] font-medium ${day.isToday ? "text-emerald-600" : "text-gray-400"}`}>
              {day.isToday ? "Today" : day.day}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [healthScore, setHealthScore] = useState(92);
  const [moodLogged, setMoodLogged] = useState(false);
  const [faceScanScore, setFaceScanScore] = useState<number | null>(null);
  const [latestFaceScan, setLatestFaceScan] = useState<FaceScan | null>(null);
  const [scannedToday, setScannedToday] = useState(false);
  const [now] = useState(() => Date.now());
  const { activeMember, memberParam } = useFamily();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: { email?: string; user_metadata?: Record<string, string>; app_metadata?: Record<string, string> } | null } }) => {
      if (data.user) {
        setUserName(data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "");
      }
    });
    const mp = memberParam ? `&${memberParam}` : "";
    apiFetch<Conversation[]>(`/api/v1/conversations?limit=100${mp}`)
      .then((convos) => setConversations(convos))
      .catch(() => setListError("Could not load past assessments."))
      .finally(() => setIsLoadingList(false));

    apiFetch<{ health_score: number }>(`/api/v1/insights${memberParam ? `?${memberParam}` : ""}`)
      .then((data) => setHealthScore(data.health_score))
      .catch(() => {});

    getFaceScanSummary()
      .then((summary) => {
        if (summary.latest_scan) {
          setFaceScanScore(summary.latest_scan.overall_score);
          setLatestFaceScan(summary.latest_scan);
          const today = new Date().toISOString().split("T")[0];
          setScannedToday(summary.latest_scan.scan_date === today);
        }
      })
      .catch(() => {});
  }, [activeMember, memberParam]);

  async function handleStartNew() {
    setIsStarting(true);
    try {
      const convo = await createConversation(activeMember?.id);
      const memberQ = activeMember ? `&member=${activeMember.id}` : "";
      router.push(`/chat?id=${convo.id}${memberQ}`);
    } catch { router.push("/chat"); }
  }
  const greeting = getGreeting();
  const lastAssessment = conversations[0];
  const totalAssessments = conversations.length;
  const activeAssessments = conversations.filter(c => c.status === "active").length;
  const completedAssessments = conversations.filter(c => c.status === "completed").length;

  const smartSuggestion = (() => {
    if (!lastAssessment) return { text: "Start your first health assessment to get personalized insights", action: "begin", cta: "Get Started" };
    const daysSince = Math.floor((now - new Date(lastAssessment.created_at).getTime()) / (1000 * 60 * 60 * 24));
    if (lastAssessment.status === "active") return { text: `You have an ongoing assessment about "${lastAssessment.chief_complaint || "symptoms"}". Continue to get your results.`, action: "continue", cta: "Continue Assessment" };
    if (daysSince >= 7) return { text: `It's been ${daysSince} days since your last check-in. A quick follow-up can help track your recovery.`, action: "new", cta: "Check In Now" };
    if (daysSince >= 3) return { text: "A follow-up assessment helps us monitor your progress and catch anything early.", action: "new", cta: "Follow Up" };
    return { text: "Your recent assessment is up to date. Check your insights for a full picture.", action: "view", cta: "View Insights" };
  })();

  return (
    <div className="care-os care-grid min-h-screen pb-20 sm:pb-0">
      <main className="care-content max-w-7xl mx-auto px-5 sm:px-8 py-6">
        <style>{`
          @keyframes dashFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes dashScaleIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
          .dash-fade-1 { animation: dashFadeUp 0.5s ease-out both; }
          .dash-fade-2 { animation: dashFadeUp 0.5s ease-out 0.08s both; }
          .dash-fade-3 { animation: dashFadeUp 0.5s ease-out 0.16s both; }
          .dash-fade-4 { animation: dashFadeUp 0.5s ease-out 0.24s both; }
          .dash-fade-5 { animation: dashFadeUp 0.5s ease-out 0.32s both; }
          .dash-scale { animation: dashScaleIn 0.4s ease-out both; }
          @media (prefers-reduced-motion: reduce) { .dash-fade-1, .dash-fade-2, .dash-fade-3, .dash-fade-4, .dash-fade-5, .dash-scale { animation: none; } }
        `}</style>

        {/* ─── Hero: Greeting + Smart Suggestion ──────────────────────────────── */}
        <div className="care-hero dash-fade-1 relative rounded-[2rem] overflow-hidden mb-7">
          <div className="absolute bottom-0 left-0 w-52 h-52 bg-cyan-300/[0.05] rounded-full translate-y-1/3 -translate-x-1/4" />

          <div className="relative z-10 px-7 sm:px-10 py-8 sm:py-10">
            <div className="flex items-center justify-between gap-3 mb-7">
              <p className="care-eyebrow">MedSign Care OS / personal command</p>
              <span className="care-live"><span className="care-live-dot" />Secure session</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-8">
              {/* Avatar + Greeting */}
              <div className="flex items-center gap-4 flex-1">
                <button onClick={() => router.push("/avatar")} className="shrink-0 hover:scale-105 transition-transform focus:outline-none rounded-full ring-3 ring-white/20">
                  <HealthAvatar hairHealth={latestFaceScan?.hair_health_score ?? null} skinQuality={latestFaceScan?.skin_quality_score ?? null} stressLevel={latestFaceScan?.stress_level_score ?? null} sleepQuality={latestFaceScan?.sleep_quality_score ?? null} overallScore={faceScanScore ?? null} size="sm" />
                </button>
                <div>
                  <p className="text-sm text-cyan-50/60 font-medium">{greeting}</p>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.04em] text-white mt-0.5">{userName || "there"}</h2>
                  <p className="text-sm text-cyan-50/70 mt-1.5 max-w-sm leading-relaxed">{smartSuggestion.text}</p>
                </div>
              </div>
              {/* CTA */}
              <button
                onClick={() => {
                  if (smartSuggestion.action === "continue" && lastAssessment) router.push(`/chat?id=${lastAssessment.id}`);
                  else if (smartSuggestion.action === "view") router.push("/insights");
                  else handleStartNew();
                }}
                disabled={isStarting}
                className="care-button px-7 py-4 rounded-2xl text-sm font-extrabold transition-all disabled:opacity-60 whitespace-nowrap self-start sm:self-center"
              >
                {isStarting ? "Starting..." : smartSuggestion.cta}
              </button>
            </div>
          </div>
        </div>

        {/* ─── Smart Health Alerts ───────────────────────────────────────── */}
        <div className="dash-fade-2 care-panel rounded-3xl p-1 mb-7">
          <SmartAlerts />
        </div>

        {/* ─── Two Column Layout (Desktop) ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">

          {/* ─── LEFT COLUMN (2/3 width on desktop) ─────────────────────────── */}
          <div className="lg:col-span-2 space-y-7">

            {/* Care telemetry */}
            <div className="dash-fade-2 grid grid-cols-3 gap-4">
              <div onClick={() => router.push("/history")} className="care-metric group cursor-pointer relative rounded-2xl p-5 hover:-translate-y-0.5 transition-transform">
                <div className="relative z-10">
                  <div className="care-module-icon w-9 h-9 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  </div>
                  <p className="text-3xl sm:text-4xl font-black tracking-[-0.06em] text-slate-900">{totalAssessments}</p>
                  <p className="text-xs text-slate-500 font-semibold mt-1">Health records</p>
                </div>
              </div>
              <div onClick={() => router.push("/history?status=active")} className="care-metric group cursor-pointer relative rounded-2xl p-5 hover:-translate-y-0.5 transition-transform" style={{ "--metric-color": "#38bdf8" } as React.CSSProperties}>
                <div className="relative z-10">
                  <div className="w-9 h-9 bg-sky-50 text-sky-600 border border-sky-100 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                  <p className="text-3xl sm:text-4xl font-black tracking-[-0.06em] text-slate-900">{activeAssessments}</p>
                  <p className="text-xs text-slate-500 font-semibold mt-1">Care in progress</p>
                </div>
              </div>
              <div onClick={() => router.push("/history?status=completed")} className="care-metric group cursor-pointer relative rounded-2xl p-5 hover:-translate-y-0.5 transition-transform" style={{ "--metric-color": "#818cf8" } as React.CSSProperties}>
                <div className="relative z-10">
                  <div className="w-9 h-9 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p className="text-3xl sm:text-4xl font-black tracking-[-0.06em] text-slate-900">{completedAssessments}</p>
                  <p className="text-xs text-slate-500 font-semibold mt-1">Completed plans</p>
                </div>
              </div>
            </div>

            {/* Medicine Reminders */}
            <div className="dash-fade-3 care-panel rounded-3xl p-1 mb-4">
              <MedicineReminder />
            </div>

            {/* Quick Actions — Bento Grid */}
            <div className="dash-fade-3 care-panel rounded-3xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="care-eyebrow !text-teal-600">Clinical modules</p>
                  <h3 className="care-section-title text-base mt-1">What would you like to do?</h3>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">Select a module</span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-4 gap-3 auto-rows-[100px]">
                {/* New Assessment — spans 2 cols, first position */}
                <button
                  onClick={handleStartNew}
                  disabled={isStarting}
                  className="care-module group relative col-span-2 rounded-2xl overflow-hidden"
                >
                  <div className="h-full flex items-center gap-4 px-5">
                    <div className="care-module-icon w-14 h-14 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-gray-900">New Assessment</p>
                      <p className="text-xs text-gray-500 mt-0.5">{conversations.length > 0 ? `${conversations.length} completed` : "Start your first"}</p>
                    </div>
                  </div>
                </button>

                {/* Reports — spans 2 cols, second position */}
                <button
                  onClick={() => router.push("/reports")}
                  className="care-module group relative col-span-2 rounded-2xl overflow-hidden"
                >
                  <div className="h-full flex items-center gap-4 px-5">
                    <div className="w-14 h-14 bg-amber-50 text-amber-600 border border-amber-100 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-gray-900">Reports</p>
                      <p className="text-xs text-gray-500 mt-0.5">Lab results</p>
                    </div>
                  </div>
                </button>

                {/* Single-cell actions */}
                {[
                  { label: "Medicines", sub: "Track doses", path: "/medicines", gradient: "from-blue-400 to-cyan-500", shadow: "shadow-blue-200/50", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /> },
                  { label: "Family", sub: "Profiles", path: "/family", gradient: "from-purple-400 to-indigo-500", shadow: "shadow-purple-200/50", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /> },
                  { label: "Insights", sub: "Trends", path: "/insights", gradient: "from-indigo-400 to-violet-500", shadow: "shadow-indigo-200/50", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
                  { label: "Face Scan", sub: !scannedToday ? "Scan now" : "Done today", path: "/face-scan", gradient: "from-rose-400 to-pink-500", shadow: "shadow-rose-200/50", icon: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></> },
                ].map((item) => (
                  <button key={item.label} onClick={() => router.push(item.path)} className="care-module group rounded-2xl flex flex-col items-center justify-center gap-2 p-3">
                    <div className="care-module-icon w-11 h-11 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{item.icon}</svg>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] font-bold text-gray-800">{item.label}</p>
                      <p className="text-[9px] text-gray-400">{item.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="dash-fade-4 care-panel rounded-3xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="care-eyebrow !text-teal-600">Care timeline</p>
                  <h3 className="care-section-title text-base mt-1">Recent activity</h3>
                </div>
                {conversations.length > 4 && (
                  <button onClick={() => router.push("/history")} className="text-xs text-emerald-600 font-semibold hover:text-emerald-700 transition-colors">
                    View all →
                  </button>
                )}
              </div>

              {isLoadingList && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="warm-card rounded-2xl p-4 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-xl" />
                        <div className="flex-1"><div className="h-3.5 bg-gray-100 rounded-lg w-3/5 mb-2" /><div className="h-2.5 bg-gray-50 rounded-lg w-2/5" /></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isLoadingList && listError && (
                <div className="warm-card rounded-2xl p-8 text-center">
                  <p className="text-sm text-gray-400">{listError}</p>
                  <button onClick={handleStartNew} disabled={isStarting} className="mt-4 bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                    {isStarting ? "Starting..." : "Start Assessment"}
                  </button>
                </div>
              )}

              {!isLoadingList && !listError && conversations.length === 0 && (
                <div className="warm-card rounded-3xl p-10 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <h4 className="text-base font-bold text-gray-800 mb-1">No assessments yet</h4>
                  <p className="text-sm text-gray-400 max-w-xs mx-auto">Start your first AI health check-in and we&apos;ll track your progress here.</p>
                </div>
              )}

              {!isLoadingList && !listError && conversations.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {conversations.slice(0, 4).map((convo, i) => (
                    <button
                      key={convo.id}
                      onClick={() => router.push(`/chat?id=${convo.id}`)}
                      className="w-full group warm-card rounded-2xl p-4 text-left hover:border-emerald-200 hover:shadow-lg hover:-translate-y-0.5 transition-all focus:outline-none"
                      style={{ animationDelay: `${0.3 + i * 0.06}s` }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          convo.status === "active" ? "bg-emerald-50" : convo.status === "completed" ? "bg-blue-50" : "bg-gray-50"
                        }`}>
                          {convo.status === "active" ? (
                            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                          ) : (
                            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate group-hover:text-emerald-700 transition-colors">
                            {convo.chief_complaint ?? "General check-in"}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{formatRelativeDate(convo.created_at)}</p>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ─── RIGHT COLUMN (1/3 width on desktop) ────────────────────────── */}
          <div className="space-y-7">

            {/* Health Signal */}
            <div className="care-signal-panel dark dash-fade-2 relative rounded-3xl p-7 text-center overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="text-left">
                    <p className="care-eyebrow">Health signal</p>
                    <h3 className="text-base font-bold tracking-[-0.03em] text-white mt-1">Your current baseline</h3>
                  </div>
                  <ClinicalStatusChip status={healthScore >= 80 ? "optimal" : healthScore >= 60 ? "stable" : healthScore >= 40 ? "monitor" : "attention"} label={healthScore >= 80 ? "In range" : "Monitor"} />
                </div>
                <div className="flex justify-center mb-5">
                  <HealthAura score={healthScore}>
                    <HealthScoreRing score={healthScore} size={180} />
                  </HealthAura>
                </div>
                <p className="text-sm text-cyan-50/65 leading-relaxed px-2 mb-4">{getMotivationalMessage(healthScore)}</p>
                <button
                  onClick={() => router.push("/insights")}
                  className="text-xs bg-white/10 text-cyan-50 border border-white/15 font-bold px-5 py-2.5 rounded-xl hover:bg-white/15 transition-colors inline-flex items-center gap-1.5"
                >
                  View Insights
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Mood Check-in */}
            <div className="dash-fade-3 care-panel rounded-3xl p-5">
              {!moodLogged ? (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-base">💭</span>
                    <div><p className="care-eyebrow !text-teal-600">Daily signal</p><h3 className="text-sm font-bold text-slate-700 mt-0.5">How are you feeling?</h3></div>
                  </div>
                  <MoodCheckIn onSelect={() => setMoodLogged(true)} />
                </>
              ) : (
                <div className="flex items-center gap-3 py-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Thanks for checking in</p>
                    <p className="text-[11px] text-gray-400">Your care dashboard is up to date</p>
                  </div>
                </div>
              )}
            </div>

            {/* Weekly Activity */}
            <div className="dash-fade-4 care-panel rounded-3xl p-5">
              <WeeklyActivity conversations={conversations} />
            </div>

            {/* Digital Twin Preview */}
            {latestFaceScan && faceScanScore && (
              <button
                onClick={() => router.push("/face-scan/digital-twin")}
                className="dash-fade-5 w-full text-left group"
              >
                <div className="rounded-3xl overflow-hidden border border-slate-700 shadow-lg hover:shadow-xl hover:border-cyan-700 transition-all">
                  <DigitalTwin
                    hairHealth={latestFaceScan.hair_health_score}
                    skinQuality={latestFaceScan.skin_quality_score}
                    stressLevel={latestFaceScan.stress_level_score}
                    sleepQuality={latestFaceScan.sleep_quality_score}
                    size="mini"
                  />
                  <div className="bg-slate-900 px-4 pb-3 -mt-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-200">Your Digital Twin</p>
                        <p className="text-[10px] text-slate-500">Overall: {faceScanScore}/100</p>
                      </div>
                      <span className="text-[10px] font-semibold text-cyan-400 group-hover:text-cyan-300 transition-colors flex items-center gap-0.5">
                        View Full Map
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            )}

            {/* Health Tip — premium card */}
            <div className="dash-fade-5 care-panel relative rounded-3xl p-5 overflow-hidden border-amber-100/80" style={{ background: "linear-gradient(135deg, rgba(255,251,235,.92) 0%, rgba(255,247,237,.84) 100%)" }}>
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-300/10 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-amber-400/20 rounded-lg flex items-center justify-center">
                    <span className="text-base">💡</span>
                  </div>
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Daily Tip</p>
                </div>
                <p className="text-sm text-amber-900 leading-relaxed font-medium">
                  {(() => {
                    const tips = [
                      "Drink at least 8 glasses of water today to stay hydrated and energized.",
                      "Take a 10-minute walk after meals — it improves digestion and blood sugar.",
                      "Practice deep breathing for 5 minutes. It lowers cortisol and calms your mind.",
                      "Include a handful of almonds or walnuts for healthy fats and brain function.",
                      "Aim for 7-8 hours of sleep tonight. Recovery happens when you rest.",
                      "Stretch every hour if sitting at a desk — your spine will thank you later.",
                      "Eat one seasonal Indian fruit today — papaya, guava, or pomegranate.",
                    ];
                    return tips[new Date().getDate() % tips.length];
                  })()}
                </p>
              </div>
            </div>

            {/* Emergency + SOS Card */}
            <div className="dash-fade-5 care-panel rounded-3xl p-5 !border-red-100/60">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-gradient-to-br from-red-400 to-rose-500 rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-red-200/40">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-gray-800">Emergency?</p>
                  <p className="text-[11px] text-gray-400">Call ambulance immediately</p>
                </div>
                <a href="tel:108" className="text-xs font-bold text-white bg-red-500 px-4 py-2 rounded-xl hover:bg-red-600 transition-colors shadow-md shadow-red-200/40">
                  Call 108
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
