"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import { apiFetch } from "@/lib/api";
import ProfileSwitcher from "@/components/ProfileSwitcher";
import { useFamily } from "@/lib/family-context";
import BrandLogo from "@/components/BrandLogo";

// ── Types ───────────────────────────────────────────────────────────────────

interface ConditionEntry {
  name: string;
  probability: number | null;
  first_seen: string;
  last_seen: string;
  occurrences: number;
  risk_level: string | null;
}

interface TimelineEvent {
  date: string;
  type: string;
  title: string;
  risk_level: string | null;
  detail: string | null;
}

interface LabTrend {
  test_name: string;
  category: string | null;
  readings: { date: string; value: string; unit: string | null; is_abnormal: boolean | null }[];
}

interface RiskFactor {
  factor: string;
  severity: string;
  source: string;
  recommendation: string;
}

interface BodySystemDetail {
  text: string;
  source: string;
  severity: string;
}

interface BodySystemScore {
  system: string;
  score: number;
  issues: number;
  trend: string;
  details: BodySystemDetail[];
}

type PreventiveSignalSeverity = "info" | "attention" | "high";

interface PreventiveSignal {
  title: string;
  severity: PreventiveSignalSeverity;
  detail: string;
  recommendation: string;
  source: string;
}

interface LongevityDataCoverage {
  assessment_count: number;
  lab_report_count: number;
  abnormal_lab_value_count: number;
  symptom_count: number;
  image_analysis_count: number;
  face_scan_count: number;
  summary: string;
}

interface LongevityOutlook {
  title: string;
  status: "informational_only";
  personal_estimate_available: false;
  preventive_signals: PreventiveSignal[];
  data_coverage: LongevityDataCoverage;
  methodology: string;
  source_label: string;
  source_version: string;
  reference_source_label: string;
  reference_source_version: string;
  reference_url: string;
  reference_note: string;
  disclaimer: string;
}

interface DoctorEntry {
  name: string;
  reports_count: number;
  labs: string[];
  last_visited: string;
}

interface LabEntry {
  name: string;
  address: string | null;
  reports_count: number;
  last_visited: string;
}

interface FaceScanScoreEntry {
  date: string;
  overall: number | null;
  hair_health: number | null;
  skin_quality: number | null;
  stress_level: number | null;
  sleep_quality: number | null;
}

type FaceScanMetricKey = "overall" | "hair_health" | "skin_quality" | "stress_level" | "sleep_quality";

const FACE_SCAN_METRICS: { key: FaceScanMetricKey; label: string; shortLabel: string; color: string }[] = [
  { key: "overall", label: "Overall", shortLabel: "Overall", color: "#EC4899" },
  { key: "hair_health", label: "Hair health", shortLabel: "Hair", color: "#8B5CF6" },
  { key: "skin_quality", label: "Skin quality", shortLabel: "Skin", color: "#10B981" },
  { key: "sleep_quality", label: "Sleep quality", shortLabel: "Sleep", color: "#3B82F6" },
  { key: "stress_level", label: "Stress level", shortLabel: "Stress", color: "#F59E0B" },
];

interface HealthInsights {
  health_score: number;
  total_assessments: number;
  total_conditions: number;
  total_symptoms_reported: number;
  total_lab_reports: number;
  total_abnormal_values: number;
  total_image_analyses: number;
  image_severity_distribution: Record<string, number>;
  total_face_scans: number;
  face_scan_scores: FaceScanScoreEntry[];
  face_scan_avg_score: number | null;
  face_scan_streak: number;
  risk_distribution: Record<string, number>;
  conditions: ConditionEntry[];
  timeline: TimelineEvent[];
  lab_trends: LabTrend[];
  risk_factors: RiskFactor[];
  body_systems: BodySystemScore[];
  // Optional during the frontend-first rollout: the card remains hidden until
  // the API is serving the non-predictive replacement.
  longevity_outlook?: LongevityOutlook;
  monthly_activity: { month: string; assessments: number; lab_reports: number; image_analyses: number; face_scans: number }[];
  doctors: DoctorEntry[];
  labs: LabEntry[];
}

// ── Colors ──────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  low: "#10B981",
  medium: "#F59E0B",
  high: "#EF4444",
  critical: "#7C3AED",
};

const PIE_COLORS = ["#10B981", "#F59E0B", "#EF4444", "#7C3AED"];

type InsightRange = "30d" | "90d" | "all";

const INSIGHT_RANGES: { value: InsightRange; label: string }[] = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "Available" },
];

function parseInsightDate(value: string): Date | null {
  const normalized = /^\d{4}-\d{2}$/.test(value)
    ? `${value}-01T12:00:00`
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T12:00:00`
      : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isInInsightRange(value: string, range: InsightRange): boolean {
  if (range === "all") return true;
  const date = parseInsightDate(value);
  if (!date) return false;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (range === "30d" ? 30 : 90));
  // Monthly activity buckets represent the whole month. Include the active
  // month when it overlaps the selected period rather than comparing only its
  // first day to the cutoff.
  if (/^\d{4}-\d{2}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    return monthEnd >= cutoff;
  }
  return date >= cutoff;
}

function formatInsightDate(value: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  const date = parseInsightDate(value);
  return date ? date.toLocaleDateString("en-IN", options) : value;
}

function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function getReadingDelta(readings: LabTrend["readings"]): { value: number; direction: "up" | "down" | "steady" } | null {
  if (readings.length < 2) return null;
  const latest = readings[readings.length - 1];
  const previous = readings[readings.length - 2];
  const latestUnit = latest.unit?.trim();
  const previousUnit = previous.unit?.trim();
  if (!latestUnit || !previousUnit || latestUnit !== previousUnit) return null;
  const latestValue = toFiniteNumber(latest.value);
  const previousValue = toFiniteNumber(previous.value);
  if (latestValue === null || previousValue === null) return null;
  const value = latestValue - previousValue;
  return {
    value: Math.abs(value),
    direction: value > 0 ? "up" : value < 0 ? "down" : "steady",
  };
}

function getBriefState(insights: HealthInsights, includeWellnessScans: boolean) {
  const criticalCount = insights.risk_distribution.critical || 0;
  const highCount = insights.risk_distribution.high || 0;
  const priorityCount = criticalCount + highCount;
  const sourceCount = insights.total_assessments + insights.total_lab_reports + insights.total_symptoms_reported + insights.total_image_analyses;

  if (priorityCount > 0) {
    return {
      eyebrow: "Follow-up focus",
      title: "Some recorded signals deserve timely attention.",
      description: `${priorityCount} item${priorityCount === 1 ? " is" : "s are"} marked high priority in your saved health records. This is a prompt to review the source information, not a diagnosis or prognosis.`,
      action: "Prepare questions for a clinician",
      tone: "attention" as const,
    };
  }

  if (insights.total_abnormal_values > 0) {
    return {
      eyebrow: "Lab review focus",
      title: "Your lab history has values worth discussing.",
      description: `${insights.total_abnormal_values} value${insights.total_abnormal_values === 1 ? " was" : "s were"} marked outside the printed reference range. A flag alone does not establish a diagnosis.`,
      action: "Explore lab trends",
      tone: "lab" as const,
    };
  }

  if (sourceCount > 0) {
    return {
      eyebrow: "Your health brief",
      title: "Your health story is becoming easier to follow.",
      description: "MedSign has organized the signals in your saved records into one clearer view. Keep tracking meaningful changes and bring questions to a qualified clinician.",
      action: "Ask MedSign a question",
      tone: "calm" as const,
    };
  }

  if (includeWellnessScans && insights.total_face_scans > 0) {
    return {
      eyebrow: "Wellness record",
      title: "Your wellness scans are kept separate.",
      description: `${insights.total_face_scans} saved face scan${insights.total_face_scans === 1 ? " is" : "s are"} available for personal wellness tracking. They are not used to diagnose a condition, calculate health risk, or make predictions.`,
      action: "View wellness trends",
      tone: "wellness" as const,
    };
  }

  return {
    eyebrow: "Start your health brief",
    title: "Add a first health record when you are ready.",
    description: "An assessment, symptom note, or lab report can make this view more useful for organizing questions ahead of a clinician conversation.",
    action: "Start an assessment",
    tone: "calm" as const,
  };
}

// ── Body System Bubbles (Orbital Nucleus) ───────────────────────────────────

const INNER_RING_SIZE = 5;

const SYSTEM_SIGNAL_PALETTES = [
  { primary: "#6366F1", dark: "#4338CA", light: "#E0E7FF" },
  { primary: "#0EA5E9", dark: "#0369A1", light: "#E0F2FE" },
  { primary: "#14B8A6", dark: "#0F766E", light: "#CCFBF1" },
  { primary: "#A855F7", dark: "#7E22CE", light: "#F3E8FF" },
  { primary: "#F97316", dark: "#C2410C", light: "#FFEDD5" },
  { primary: "#EC4899", dark: "#BE185D", light: "#FCE7F3" },
];

function getSystemSignalPalette(system: string): { primary: string; dark: string; light: string } {
  const hash = [...system].reduce((total, char) => total + char.charCodeAt(0), 0);
  return SYSTEM_SIGNAL_PALETTES[hash % SYSTEM_SIGNAL_PALETTES.length];
}

function BodySystemBubbles({ systems }: { systems: BodySystemScore[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 120);
    return () => clearTimeout(t);
  }, []);

  const sorted = [...systems].sort((a, b) => b.issues - a.issues || a.system.localeCompare(b.system));
  const maxIssues = Math.max(...sorted.map((s) => s.issues), 1);
  const nucleusColor = "#6366F1";

  const WIDTH = 960;
  const HEIGHT = 720;
  const CX = WIDTH / 2;
  const CY = HEIGHT / 2;
  const NUCLEUS_R = 62;
  const INNER_R = 190;
  const OUTER_R = 310;

  const getRadius = (issues: number) => 42 + (issues / maxIssues) * 14;

  const inner = sorted.slice(0, INNER_RING_SIZE);
  const outer = sorted.slice(INNER_RING_SIZE);

  const bubbles = [
    ...inner.map((sys, i) => {
      const r = getRadius(sys.issues);
      const angle = (i / inner.length) * 2 * Math.PI - Math.PI / 2;
      const cx = CX + Math.cos(angle) * INNER_R;
      const cy = CY + Math.sin(angle) * INNER_R;
      return { ...sys, r, cx, cy, depth: 0.7, entryDelay: i * 0.12, ring: "inner" };
    }),
    ...outer.map((sys, i) => {
      const r = getRadius(sys.issues);
      const angle = (i / outer.length) * 2 * Math.PI - Math.PI / 2 + Math.PI / outer.length;
      const cx = CX + Math.cos(angle) * OUTER_R;
      const cy = CY + Math.sin(angle) * OUTER_R;
      return { ...sys, r, cx, cy, depth: 0.45, entryDelay: (inner.length + i) * 0.12, ring: "outer" };
    }),
  ];

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMouse({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  };

  const parallax = (bx: number, by: number, depth: number) => ({
    x: bx + (mouse.x - 0.5) * depth * 18,
    y: by + (mouse.y - 0.5) * depth * 18,
  });

  return (
    <div ref={containerRef} onMouseMove={handleMouseMove} className="relative min-h-[420px] w-full overflow-hidden rounded-3xl sm:min-h-[540px] lg:min-h-[720px]" style={{ background: "linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 40%, #EEF2FF 100%)" }}>
      <style>{`
        @keyframes bsPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes bsEntryFade { from { opacity: 0; transform: scale(0.2) translateY(30px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes bsFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes nucleusPulse { 0%, 100% { transform: scale(1); filter: drop-shadow(0 0 20px rgba(99,102,241,0.3)); } 50% { transform: scale(1.02); filter: drop-shadow(0 0 35px rgba(99,102,241,0.5)); } }
        .bs-enter { animation: bsEntryFade 0.7s cubic-bezier(0.34,1.56,0.64,1) both; }
        .bs-pulse { animation: bsPulse 2.8s ease-in-out infinite; }
        .bs-float { animation: bsFloat 6s ease-in-out infinite; }
        .nucleus-pulse { animation: nucleusPulse 4s ease-in-out infinite; }
        .bs-control:focus { outline: none; }
        .bs-focus-ring { opacity: 0; transition: opacity 0.2s ease; }
        .bs-control:focus .bs-focus-ring { opacity: 1; }
        @media (prefers-reduced-motion: reduce) {
          .bs-enter, .bs-pulse, .bs-float, .nucleus-pulse { animation: none !important; }
        }
      `}</style>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" style={{ maxHeight: HEIGHT }}>
        <defs>
          <filter id="bs-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.12" />
          </filter>
          <filter id="bs-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="nucleus-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="18" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="line-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="nucleus-grad" cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="white" stopOpacity="0.6" />
            <stop offset="30%" stopColor={nucleusColor} stopOpacity="0.75" />
            <stop offset="100%" stopColor={nucleusColor} stopOpacity="1" />
          </radialGradient>
          <radialGradient id="bg-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={nucleusColor} stopOpacity="0.06" />
            <stop offset="100%" stopColor={nucleusColor} stopOpacity="0" />
          </radialGradient>
          {bubbles.map((b) => {
            const pal = getSystemSignalPalette(b.system);
            const id = b.system.replace(/[^a-zA-Z0-9]/g, "");
            return (
              <radialGradient key={`g-${id}`} id={`orb-${id}`} cx="38%" cy="32%" r="62%">
                <stop offset="0%" stopColor="white" stopOpacity="0.85" />
                <stop offset="35%" stopColor={pal.light} stopOpacity="0.95" />
                <stop offset="100%" stopColor={pal.primary} stopOpacity="0.75" />
              </radialGradient>
            );
          })}
        </defs>

        {/* Soft background glow */}
        <circle cx={CX} cy={CY} r={320} fill="url(#bg-glow)" />

        {/* Orbit track rings */}
        <circle cx={CX} cy={CY} r={INNER_R} fill="none" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="4 12" opacity="0.25" />
        <circle cx={CX} cy={CY} r={OUTER_R} fill="none" stroke="#CBD5E1" strokeWidth="0.7" strokeDasharray="3 16" opacity="0.18" />

        {/* Connecting lines from nucleus to each bubble */}
        {bubbles.map((b) => {
          const pal = getSystemSignalPalette(b.system);
          const p = parallax(b.cx, b.cy, b.depth);
          const isActive = hovered === b.system;
          return (
            <line key={`line-${b.system}`} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke={pal.primary} strokeWidth={isActive ? 1.5 : 0.8} opacity={isActive ? 0.35 : 0.1} strokeDasharray={isActive ? "none" : "4 8"} filter={isActive ? "url(#line-glow)" : undefined} style={{ transition: "opacity 0.3s, stroke-width 0.3s" }} />
          );
        })}

        {/* Static ambient rings preserve visual hierarchy without SMIL motion. */}
        <circle cx={CX} cy={CY} r={NUCLEUS_R + 30} fill={nucleusColor} opacity="0.04" />
        <circle cx={CX} cy={CY} r={NUCLEUS_R + 14} fill={nucleusColor} opacity="0.06" />

        {/* Nucleus */}
        <g filter="url(#nucleus-glow)" className={`${entered ? "bs-enter" : ""} nucleus-pulse`} style={{ animationDelay: "0s", transformOrigin: `${CX}px ${CY}px` }}>
          <circle cx={CX} cy={CY} r={NUCLEUS_R} fill="url(#nucleus-grad)" />
          <circle cx={CX} cy={CY} r={NUCLEUS_R} fill="none" stroke="white" strokeWidth="2" opacity="0.15" />
          <ellipse cx={CX - NUCLEUS_R * 0.14} cy={CY - NUCLEUS_R * 0.24} rx={NUCLEUS_R * 0.3} ry={NUCLEUS_R * 0.1} fill="white" opacity="0.2" transform={`rotate(-18 ${CX - NUCLEUS_R * 0.14} ${CY - NUCLEUS_R * 0.24})`} />
          <text x={CX} y={CY - 8} textAnchor="middle" fill="white" fontWeight="900" fontSize="30" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.3)" }}>{systems.length}</text>
          <text x={CX} y={CY + 10} textAnchor="middle" fill="white" fontWeight="700" fontSize="9" opacity="0.95" style={{ letterSpacing: "2.5px" }}>BODY SYSTEMS</text>
          <text x={CX} y={CY + 23} textAnchor="middle" fill="white" fontWeight="500" fontSize="8" opacity="0.6" style={{ letterSpacing: "1.5px" }}>SAVED SIGNALS</text>
        </g>

        {/* Decorative data ring — not a health score */}
        <circle cx={CX} cy={CY} r={NUCLEUS_R + 7} fill="none" stroke="#A5B4FC" strokeWidth="3" strokeDasharray="3 7" opacity="0.7" />

        {/* Body system bubbles */}
        {bubbles.map((b, idx) => {
          const pal = getSystemSignalPalette(b.system);
          const id = b.system.replace(/[^a-zA-Z0-9]/g, "");
          const p = parallax(b.cx, b.cy, b.depth);
          const isActive = hovered === b.system;
          const isSel = selected === b.system;
          const scale = isActive || isSel ? 1.14 : 1;
          const hasSignals = b.issues > 0;
          const displayName = b.system.length > 14 ? b.system.slice(0, 13) + "…" : b.system;

          return (
            <g
              key={b.system}
              className="bs-control"
              onMouseEnter={() => setHovered(b.system)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setSelected(selected === b.system ? null : b.system)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(selected === b.system ? null : b.system);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`${b.system}: ${b.issues} saved signal${b.issues === 1 ? "" : "s"}. Show source details.`}
              aria-pressed={isSel}
              style={{ cursor: "pointer" }}
            >
              <g className={entered ? "bs-enter" : ""} style={{ animationDelay: `${b.entryDelay}s`, opacity: entered ? undefined : 0 }}>
                <g className={`${hasSignals ? "bs-pulse" : "bs-float"}`} style={{ transformOrigin: `${p.x}px ${p.y}px`, animationDelay: `${idx * 0.4}s` }}>
                  <g style={{ transformOrigin: `${p.x}px ${p.y}px`, transform: `scale(${scale})`, transition: "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)" }} filter={isActive || isSel ? "url(#bs-glow)" : "url(#bs-shadow)"}>
                    <circle className="bs-focus-ring" cx={p.x} cy={p.y} r={b.r + 11} fill="none" stroke={pal.dark} strokeWidth="3" />
                    {/* Outer ambient glow */}
                    <circle cx={p.x} cy={p.y} r={b.r + 14} fill={pal.primary} opacity={isActive ? 0.22 : 0.06} style={{ transition: "opacity 0.3s" }} />

                    {/* Decorative system ring — the colour identifies a system, not severity */}
                    <circle cx={p.x} cy={p.y} r={b.r + 5} fill="none" stroke={pal.primary} strokeWidth="2.5" strokeDasharray="3 7" opacity={isActive ? 0.85 : 0.38} style={{ transition: "opacity 0.3s" }} />

                    {/* Main bubble */}
                    <circle cx={p.x} cy={p.y} r={b.r} fill={`url(#orb-${id})`} stroke={isSel ? pal.dark : "white"} strokeWidth={isSel ? 3 : 1.5} strokeOpacity={isSel ? 1 : 0.3} />

                    {/* Glass highlight */}
                    <ellipse cx={p.x - b.r * 0.12} cy={p.y - b.r * 0.2} rx={b.r * 0.3} ry={b.r * 0.1} fill="white" opacity="0.35" transform={`rotate(-15 ${p.x - b.r * 0.12} ${p.y - b.r * 0.2})`} />

                    {/* Record-derived signal count */}
                    <text x={p.x} y={p.y - 9} textAnchor="middle" fill={pal.dark} fontWeight="900" fontSize="22" style={{ textShadow: "0 1px 3px rgba(255,255,255,0.6)" }}>{b.issues}</text>
                    {/* System name */}
                    <text x={p.x} y={p.y + 6} textAnchor="middle" fill="#1E293B" fontWeight="700" fontSize="9.5" style={{ textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{displayName}</text>
                    <text x={p.x} y={p.y + 19} textAnchor="middle" fill="#64748B" fontSize="8.5" fontWeight="600">{b.issues === 1 ? "saved signal" : "saved signals"}</text>
                  </g>
                </g>
              </g>
            </g>
          );
        })}
      </svg>

      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:hidden" aria-label="Recorded health signals by body system">
        {bubbles.map((bubble) => {
          const palette = getSystemSignalPalette(bubble.system);
          const isSelected = selected === bubble.system;
          return (
            <button
              key={`signal-list-${bubble.system}`}
              type="button"
              onClick={() => setSelected(isSelected ? null : bubble.system)}
              aria-pressed={isSelected}
              className={`rounded-xl border px-3 py-2 text-left transition ${isSelected ? "border-indigo-300 bg-indigo-50 shadow-sm" : "border-slate-200 bg-white/75 hover:border-indigo-200 hover:bg-indigo-50/40"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-bold text-slate-800">{bubble.system}</span>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white" style={{ backgroundColor: palette.primary }}>{bubble.issues}</span>
              </span>
              <span className="mt-1 block text-[9px] text-slate-400">saved signal{bubble.issues === 1 ? "" : "s"}</span>
            </button>
          );
        })}
      </div>

      {/* Hover tooltip */}
      {hovered && !selected && (() => {
        const b = bubbles.find((x) => x.system === hovered);
        if (!b) return null;
        const pal = getSystemSignalPalette(b.system);

        return (
          <div className="absolute z-20 pointer-events-none left-1/2 top-5" style={{ transform: "translateX(-50%)" }}>
            <div className="bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-gray-200/60 px-6 py-5 min-w-[240px]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-5 h-5 rounded-full shadow-sm ring-2 ring-white" style={{ backgroundColor: pal.primary }} />
                <p className="text-base font-bold text-gray-900">{b.system}</p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black" style={{ color: pal.dark }}>{b.issues}</span>
                <span className="text-sm text-gray-400 font-medium">saved signal{b.issues === 1 ? "" : "s"}</span>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">Saved assessments, symptoms, and image-analysis details linked to this system.</span>
              </div>
              <p className="text-[11px] text-gray-300 mt-2">Click for source details</p>
            </div>
          </div>
        );
      })()}

      {/* Selected detail panel */}
      {selected && (() => {
        const b = bubbles.find((x) => x.system === selected);
        if (!b) return null;
        const pal = getSystemSignalPalette(b.system);
        const sourceLabels: Record<string, string> = { symptom: "Symptom", condition: "Condition", image: "Image Analysis" };
        const severityColors: Record<string, string> = { info: "bg-gray-100 text-gray-600", mild: "bg-amber-50 text-amber-700", moderate: "bg-orange-50 text-orange-700", severe: "bg-red-50 text-red-700" };

        return (
          <div className="mt-5 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-xl border border-gray-200/60 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${pal.light}, white)` }}>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md" style={{ backgroundColor: pal.primary }}>
                  <span className="text-xl font-black text-white">{b.issues}</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{b.system}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${pal.primary}15`, color: pal.dark }}>Record summary</span>
                    <span className="text-[11px] text-gray-400">{b.issues} linked signal{b.issues !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </div>
              <button type="button" aria-label={`Close ${b.system} source details`} onClick={(e) => { e.stopPropagation(); setSelected(null); }} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {b.details && b.details.length > 0 ? (
              <div className="px-5 py-3 space-y-2 max-h-56 overflow-y-auto">
                {b.details.map((d, i) => (
                  <div key={i} className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
                    <div className="flex-shrink-0 mt-0.5">
                      {d.source === "symptom" && <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                      {d.source === "condition" && <svg className="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                      {d.source === "image" && <svg className="w-3.5 h-3.5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-800 leading-relaxed">{d.text}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-400">{sourceLabels[d.source] || d.source}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${severityColors[d.severity] || severityColors.info}`}>{d.severity}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-6 text-center">
                <p className="text-xs text-gray-400">No linked details are recorded for this system yet.</p>
                <p className="text-[11px] font-medium mt-1" style={{ color: pal.primary }}>This is a record view, not a clinical score.</p>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── Longevity & Preventive Health Outlook ────────────────────────────────────

function LongevityOutlookCard({ data }: { data: LongevityOutlook }) {
  const signalStyles: Record<PreventiveSignalSeverity, { badge: string; icon: string; label: string }> = {
    high: { badge: "bg-rose-100 text-rose-700", icon: "bg-rose-100 text-rose-600", label: "Needs attention" },
    attention: { badge: "bg-amber-100 text-amber-700", icon: "bg-amber-100 text-amber-600", label: "Keep an eye on this" },
    info: { badge: "bg-sky-100 text-sky-700", icon: "bg-sky-100 text-sky-600", label: "Helpful next step" },
  };
  const coverage = [
    { label: "Assessments", count: data.data_coverage.assessment_count },
    { label: "Lab reports", count: data.data_coverage.lab_report_count },
    { label: "Symptoms", count: data.data_coverage.symptom_count },
  ].filter((item) => item.count > 0);

  return (
    <section
      aria-labelledby="longevity-outlook-title"
      className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-violet-50 to-sky-50 p-6 shadow-md shadow-indigo-100/40 sm:p-7"
    >
      <div aria-hidden="true" className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-indigo-300/15" />
      <div aria-hidden="true" className="absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-sky-300/15" />

      <div className="relative z-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-200/60">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 21a8.5 8.5 0 008.5-8.5c0-5.2-3.66-8.87-8.5-10.5C7.16 3.63 3.5 7.3 3.5 12.5A8.5 8.5 0 0012 21z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8.5 12.5h2l1.1-2.2 1.8 4.2 1.1-2h1.9" />
              </svg>
            </div>
            <div>
              <h3 id="longevity-outlook-title" className="text-sm font-bold text-indigo-950">{data.title}</h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-indigo-700/70">Prevention-focused signals from the health information you have recorded.</p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-indigo-200 bg-white/70 px-3 py-1.5 text-[10px] font-bold text-indigo-700 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            No personal lifespan prediction
          </span>
        </div>

        <div className="mt-5 rounded-2xl border border-white/90 bg-white/65 p-4 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-950">What this card can tell you</p>
              <p className="mt-1 text-xs leading-relaxed text-indigo-800/75">{data.methodology}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {data.preventive_signals.map((signal, index) => {
            const style = signalStyles[signal.severity];
            return (
              <article key={`${signal.title}-${index}`} className="rounded-2xl border border-white/90 bg-white/65 p-4 shadow-sm backdrop-blur-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${style.icon}`}>
                      {signal.severity === "high" ? (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-2.5L13.73 4c-.77-.83-1.96-.83-2.73 0L3.34 16.5C2.57 17.33 3.53 19 5.07 19z" /></svg>
                      ) : signal.severity === "attention" ? (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900">{signal.title}</h4>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{signal.detail}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${style.badge}`}>{style.label}</span>
                </div>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="text-[11px] font-medium leading-relaxed text-slate-700">{signal.recommendation}</p>
                  <p className="mt-1.5 text-[10px] text-slate-400">From: {signal.source}</p>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="rounded-2xl border border-white/90 bg-white/55 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-600">Records reviewed</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{data.data_coverage.summary}</p>
          </div>
          {coverage.length > 0 && (
            <div className="flex flex-wrap gap-2 md:justify-end">
              {coverage.map((item) => (
                <span key={item.label} className="rounded-xl border border-indigo-100 bg-white/75 px-2.5 py-2 text-[10px] font-semibold text-indigo-700">
                  {item.count} {item.label.toLowerCase()}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-indigo-100/80 pt-3">
          <p className="text-[10px] leading-relaxed text-indigo-700/70">{data.reference_note}</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-indigo-600/60">{data.source_label} · {data.source_version} · {data.reference_source_label} {data.reference_source_version}</p>
          <a href={data.reference_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-[10px] font-semibold text-indigo-600 underline decoration-indigo-200 underline-offset-2 transition hover:text-indigo-800">View the population reference ↗</a>
          <p className="mt-2 text-[10px] leading-relaxed text-indigo-700/70">{data.disclaimer}</p>
        </div>
      </div>
    </section>
  );
}

// ── Health Intelligence Controls & Brief ────────────────────────────────────

function InsightRangeSelector({ range, onChange }: { range: InsightRange; onChange: (range: InsightRange) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white/70 p-1 shadow-sm backdrop-blur-sm" role="group" aria-label="Time range for timeline, activity, lab, and wellness charts">
      {INSIGHT_RANGES.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          aria-pressed={range === item.value}
          className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all sm:px-3 ${range === item.value ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function HealthIntelligenceBrief({
  insights,
  profileName,
  range,
  showWellnessScans,
  onRangeChange,
  onPrimaryAction,
  onAsk,
}: {
  insights: HealthInsights;
  profileName: string;
  range: InsightRange;
  showWellnessScans: boolean;
  onRangeChange: (range: InsightRange) => void;
  onPrimaryAction: () => void;
  onAsk: () => void;
}) {
  const brief = getBriefState(insights, showWellnessScans);
  const latestEvents = insights.timeline.slice(0, 3);
  const tone = brief.tone === "attention"
    ? "from-rose-600 via-fuchsia-700 to-indigo-900"
    : brief.tone === "lab"
      ? "from-violet-700 via-indigo-700 to-sky-900"
      : "from-slate-900 via-indigo-900 to-violet-900";
  const sourceItems = [
    { label: "Assessments", value: insights.total_assessments },
    { label: "Lab reports", value: insights.total_lab_reports },
    { label: "Symptoms", value: insights.total_symptoms_reported },
    { label: "Image analyses", value: insights.total_image_analyses },
    ...(showWellnessScans ? [{ label: "Wellness scans", value: insights.total_face_scans }] : []),
  ].filter((item) => item.value > 0);

  return (
    <section aria-labelledby="intelligence-brief-title" className={`insight-brief relative overflow-hidden rounded-[2rem] border border-slate-700/60 bg-gradient-to-br ${tone} p-5 text-white shadow-2xl shadow-indigo-950/20 sm:p-7`}>
      <div aria-hidden="true" className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(255,255,255,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div aria-hidden="true" className="insight-aurora absolute -right-24 -top-28 h-72 w-72 rounded-full bg-cyan-300/25 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-fuchsia-400/20 blur-3xl" />

      <div className="relative z-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-lg shadow-black/10 backdrop-blur-md">
              <svg className="h-5 w-5 text-cyan-100" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v3m0 12v3m9-9h-3M6 12H3m15.36-6.36-2.12 2.12M7.76 16.24l-2.12 2.12m12.72 0-2.12-2.12M7.76 7.76 5.64 5.64M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-cyan-100/75">MedSign intelligence brief</p>
              <h2 id="intelligence-brief-title" className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl">A clearer view for {profileName}.</h2>
              <p className="mt-1 text-xs text-indigo-100/70">Signals are organized from saved records; they are not a diagnosis or prediction.</p>
            </div>
          </div>
          <InsightRangeSelector range={range} onChange={onRangeChange} />
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,.85fr)]">
          <div className="rounded-3xl border border-white/15 bg-white/[0.09] p-5 backdrop-blur-xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100/70">{brief.eyebrow}</p>
            <h3 className="mt-2 max-w-xl text-xl font-bold leading-tight tracking-tight text-white sm:text-2xl">{brief.title}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-indigo-50/80">{brief.description}</p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <button type="button" onClick={onPrimaryAction} className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-xs font-bold text-indigo-900 shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-indigo-900">
                {brief.action}
                <span aria-hidden="true">→</span>
              </button>
              <button type="button" onClick={onAsk} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-indigo-900">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 3.866-4.03 7-9 7a9.76 9.76 0 01-4.255-.949L3 19l1.469-3.673A6.32 6.32 0 013 12c0-3.866 4.03-7 9-7s9 3.134 9 7z" /></svg>
                Ask MedSign
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/15 bg-slate-950/20 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-100/65">Recent signal stream</p>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-cyan-100"><span className="insight-live-dot h-1.5 w-1.5 rounded-full bg-cyan-300" />Saved records</span>
            </div>
            {latestEvents.length > 0 ? (
              <ol className="mt-3 space-y-2.5">
                {latestEvents.map((event, index) => (
                  <li key={`${event.type}-${event.date}-${index}`} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(165,243,252,.9)]" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white">{event.title}</p>
                      <p className="mt-0.5 text-[10px] text-indigo-100/65">{formatInsightDate(event.date)} · {event.type.replace("_", " ")}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-xs leading-relaxed text-indigo-100/70">Your newest assessment, report, or symptom note will appear here.</p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
          <span className="mr-1 text-[10px] font-semibold text-indigo-100/60">Grounded in</span>
          {sourceItems.length > 0 ? sourceItems.map((item) => (
            <span key={item.label} className="rounded-full border border-white/15 bg-white/[0.08] px-2.5 py-1 text-[10px] font-semibold text-indigo-50">{item.value} {item.label.toLowerCase()}</span>
          )) : (
            <span className="text-[10px] text-indigo-100/70">no saved records yet</span>
          )}
          <span className="ml-auto text-[10px] text-indigo-100/55">Brief and summary charts: all saved records · {range === "all" ? "available history in timeline, activity, lab, and wellness views" : `last ${range === "30d" ? "30" : "90"} days where available in timeline, activity, lab, and wellness views`}</span>
        </div>
      </div>
    </section>
  );
}

// ── Lab Trend Explorer ──────────────────────────────────────────────────────

function LabTrendExplorer({ trends, onAsk }: { trends: LabTrend[]; onAsk: (testName: string) => void }) {
  const [selectedTest, setSelectedTest] = useState<string | null>(null);
  // The selected tab is derived from the currently visible trend list. This
  // keeps a time-range change from pointing the UI at a test that is no longer
  // represented, without an extra state-sync render.
  const selectedTrend = trends.find((trend) => trend.test_name === selectedTest) || trends[0];
  if (!selectedTrend) return null;

  const plottedReadings = selectedTrend.readings.map((reading) => ({
    ...reading,
    numericValue: toFiniteNumber(reading.value),
  }));
  const numericReadings = plottedReadings.filter((reading) => reading.numericValue !== null);
  const reportedUnits = Array.from(new Set(
    numericReadings
      .map((reading) => reading.unit?.trim())
      .filter((unit): unit is string => Boolean(unit)),
  ));
  const hasMissingUnit = numericReadings.some((reading) => !reading.unit?.trim());
  const hasIncompatibleUnits = hasMissingUnit || reportedUnits.length > 1;
  const canPlotTrend = !hasIncompatibleUnits && numericReadings.length >= 2;
  const latest = selectedTrend.readings[selectedTrend.readings.length - 1];
  const delta = getReadingDelta(selectedTrend.readings);
  const latestStatus = latest?.is_abnormal === true
    ? { label: "Outside reported range", tone: "bg-rose-100 text-rose-700" }
    : latest?.is_abnormal === false
      ? { label: "Within reported range", tone: "bg-emerald-100 text-emerald-700" }
      : { label: "Range status unavailable", tone: "bg-slate-100 text-slate-600" };

  return (
    <section id="lab-trends" aria-labelledby="lab-trends-title" className="care-panel scroll-mt-6 rounded-3xl p-6 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-red-500 shadow-md shadow-rose-200/50">
            <svg className="h-[18px] w-[18px] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
          </div>
          <div>
            <h3 id="lab-trends-title" className="text-sm font-bold text-slate-900">Lab Trend Explorer</h3>
            <p className="text-[11px] text-slate-400">Select a test to see its saved values and report-range status.</p>
          </div>
        </div>
        <button type="button" onClick={() => onAsk(selectedTrend.test_name)} className="inline-flex w-fit items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-700 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-400">
          Ask MedSign about this trend <span aria-hidden="true">↗</span>
        </button>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Choose a lab test">
        {trends.slice(0, 12).map((trend) => (
          <button
            key={trend.test_name}
            type="button"
            aria-pressed={selectedTrend.test_name === trend.test_name}
            onClick={() => setSelectedTest(trend.test_name)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${selectedTrend.test_name === trend.test_name ? "border-indigo-200 bg-indigo-50 text-indigo-800 shadow-sm" : "border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50"}`}
          >
            <span className="block text-[10px] font-bold">{trend.test_name}</span>
            <span className="mt-0.5 block text-[9px] opacity-65">{trend.readings.length} reading{trend.readings.length === 1 ? "" : "s"}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_13rem]">
        <div className="relative min-h-[250px] rounded-3xl border border-slate-100 bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 p-4 sm:p-5">
          <div aria-hidden="true" className="absolute right-4 top-3 text-6xl font-black text-indigo-100/45">{selectedTrend.test_name.slice(0, 1).toUpperCase()}</div>
          <div className="relative flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-slate-900">{selectedTrend.test_name}</p>
            {selectedTrend.category && <span className="rounded-full bg-indigo-100 px-2 py-1 text-[9px] font-bold text-indigo-700">{selectedTrend.category}</span>}
            <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${latestStatus.tone}`}>{latestStatus.label}</span>
          </div>
          <div className="relative mt-4 h-44 sm:h-48">
            {canPlotTrend ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={numericReadings} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
                  <CartesianGrid strokeDasharray="3 4" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} tickFormatter={(value) => formatInsightDate(String(value))} />
                  <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} width={38} />
                  <Tooltip
                    cursor={{ stroke: "#A5B4FC", strokeDasharray: "4 4" }}
                    contentStyle={{ borderRadius: "14px", border: "1px solid #E0E7FF", boxShadow: "0 12px 30px rgba(79,70,229,0.12)", fontSize: "11px" }}
                    labelFormatter={(value) => formatInsightDate(String(value), { day: "numeric", month: "long", year: "numeric" })}
                    formatter={(value: unknown, _: unknown, entry: unknown) => {
                      const payload = (entry as { payload?: { unit?: string | null; is_abnormal?: boolean | null } }).payload;
                      const status = payload?.is_abnormal === true
                        ? "Outside reported range"
                        : payload?.is_abnormal === false
                          ? "Within reported range"
                          : "Range status unavailable";
                      return [`${String(value)} ${payload?.unit || ""}`, status];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="numericValue"
                    stroke="#6366F1"
                    strokeWidth={3}
                    activeDot={{ r: 6, fill: "#4F46E5", stroke: "#fff", strokeWidth: 3 }}
                    dot={(props: Record<string, unknown>) => {
                      const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: { is_abnormal?: boolean | null } };
                      if (typeof cx !== "number" || typeof cy !== "number") return null;
                      const fill = payload?.is_abnormal === true ? "#E11D48" : payload?.is_abnormal === false ? "#4F46E5" : "#94A3B8";
                      return <circle cx={cx} cy={cy} r={4.5} fill={fill} stroke="white" strokeWidth={2} />;
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-indigo-100 bg-white/55 px-5 text-center">
                <div>
                  <p className="text-xs font-semibold text-slate-700">{hasIncompatibleUnits ? "Trend paused for incompatible units" : "Need another comparable numeric value"}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{hasIncompatibleUnits ? "This test has numeric readings with different or missing units, so MedSign will not draw a potentially misleading line." : "Add another numeric reading with the same recorded unit to view a trend."}</p>
                </div>
              </div>
            )}
          </div>
          <p className="relative mt-3 text-[10px] leading-relaxed text-slate-400">Values are shown exactly as captured from your report. A trend is drawn only when two or more numeric readings use one recorded unit.</p>
        </div>

        <aside className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-600">Latest saved value</p>
          <p className="mt-2 break-words text-2xl font-black tracking-tight text-indigo-950">{latest?.value || "—"}</p>
          <p className="mt-1 text-xs font-medium text-indigo-700/70">{latest?.unit || "Unit not recorded"}</p>
          <p className="mt-3 text-[10px] text-indigo-600/65">{latest ? formatInsightDate(latest.date, { day: "numeric", month: "short", year: "numeric" }) : "No dated reading"}</p>
          <div className="mt-5 border-t border-indigo-100 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-600">Change from prior</p>
            {delta ? (
              <>
                <p className="mt-2 text-sm font-bold text-indigo-950">
                  <span className="text-slate-500">{delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "→"}</span> {delta.value.toLocaleString("en-IN")} {latest?.unit || ""}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-indigo-700/70">{delta.direction === "up" ? "Higher" : delta.direction === "down" ? "Lower" : "Unchanged"} than the prior saved value; direction alone is not a health judgment.</p>
              </>
            ) : (
              <p className="mt-2 text-[11px] leading-relaxed text-indigo-700/70">Need two comparable numeric readings to show a change.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

// ── Timeline Component ───────────────────────────────────────────────────────

function Timeline({ events }: { events: TimelineEvent[] }) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const eventTypes = [
    { value: "all", label: "All" },
    { value: "assessment", label: "Assessments" },
    { value: "lab_report", label: "Lab reports" },
    { value: "symptom", label: "Symptoms" },
  ].filter((item) => item.value === "all" || events.some((event) => event.type === item.value));
  // If a range change removes the selected source type, fall back to All in
  // the rendered state rather than leaving an empty stream with no selected
  // filter available to reset it.
  const activeFilter = eventTypes.some((item) => item.value === typeFilter) ? typeFilter : "all";
  const visibleEvents = events.filter((event) => activeFilter === "all" || event.type === activeFilter).slice(0, 18);
  const typeIcons: Record<string, string> = {
    assessment: "✦",
    lab_report: "◈",
    symptom: "◉",
    image_analysis: "◌",
    face_scan: "◇",
  };
  const typeDots: Record<string, string> = {
    assessment: "bg-blue-500",
    lab_report: "bg-violet-500",
    symptom: "bg-amber-500",
    image_analysis: "bg-teal-500",
    face_scan: "bg-pink-500",
  };
  const typeColors: Record<string, string> = {
    assessment: "border-blue-100 bg-blue-50/50",
    lab_report: "border-violet-100 bg-violet-50/50",
    symptom: "border-amber-100 bg-amber-50/50",
    image_analysis: "border-teal-100 bg-teal-50/50",
    face_scan: "border-pink-100 bg-pink-50/50",
  };

  return (
    <div>
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter health timeline">
        {eventTypes.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={activeFilter === item.value}
            onClick={() => setTypeFilter(item.value)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold transition ${activeFilter === item.value ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {visibleEvents.length > 0 ? (
        <div className="relative max-h-80 overflow-y-auto pr-1">
          <div aria-hidden="true" className="absolute bottom-1 left-[70px] top-1 w-px bg-gradient-to-b from-indigo-200 via-slate-200 to-transparent" />
          <ol className="space-y-2.5">
            {visibleEvents.map((event, index) => (
              <li key={`${event.type}-${event.date}-${event.title}-${index}`} className="relative flex items-start gap-3">
                <time dateTime={event.date} className="w-14 shrink-0 pt-2 text-right text-[10px] font-semibold text-slate-400">
                  {formatInsightDate(event.date)}
                </time>
                <span className={`z-10 mt-2.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-full ${typeDots[event.type] || "bg-slate-300"} ring-4 ring-white`} />
                <article className={`group flex-1 rounded-2xl border px-3.5 py-3 ${typeColors[event.type] || "border-slate-100 bg-slate-50/50"} transition hover:-translate-y-0.5 hover:shadow-md`}>
                  <div className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-0.5 text-sm text-slate-400">{typeIcons[event.type] || "•"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-bold text-slate-800">{event.title}</p>
                        <span className="rounded-full bg-white/75 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">{event.type.replace("_", " ")}</span>
                        {event.risk_level && (
                          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold capitalize" style={{ backgroundColor: `${RISK_COLORS[event.risk_level] || "#94A3B8"}18`, color: RISK_COLORS[event.risk_level] || "#64748B" }}>
                            assessment label: {event.risk_level}
                          </span>
                        )}
                      </div>
                      {event.detail && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{event.detail}</p>}
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-400">No matching events in this view.</div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const router = useRouter();
  const { activeMember, memberParam } = useFamily();
  const [insights, setInsights] = useState<HealthInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timelineRange, setTimelineRange] = useState<InsightRange>("90d");
  const [faceScanMetric, setFaceScanMetric] = useState<FaceScanMetricKey>("overall");

  useEffect(() => {
    let isCurrent = true;
    queueMicrotask(() => {
      if (!isCurrent) return;
      setLoading(true);
      setError(null);
    });
    const mp = memberParam ? `?${memberParam}` : "";
    apiFetch<HealthInsights>(`/api/v1/insights${mp}`)
      .then((data) => {
        if (isCurrent) setInsights(data);
      })
      .catch((err: unknown) => {
        if (isCurrent) setError(err instanceof Error ? err.message : "Could not load health insights.");
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [activeMember, memberParam]);

  if (loading) {
    return (
      <div className="care-os care-grid min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-teal-100 border-t-teal-600 rounded-full animate-spin mx-auto" />
          <p className="mt-5 text-sm text-slate-600 font-medium">Mapping your health signals...</p>
          <p className="mt-1 text-xs text-gray-300">This may take a moment</p>
        </div>
      </div>
    );
  }

  if (error || !insights) {
    return (
      <div className="care-os care-grid min-h-screen flex items-center justify-center p-4">
        <div className="care-panel text-center max-w-sm rounded-3xl p-8">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          </div>
          <p className="text-sm font-semibold text-gray-800">{error || "Failed to load insights"}</p>
          <button onClick={() => router.push("/dashboard")} className="mt-4 text-sm text-teal-700 font-semibold hover:text-teal-800 transition-colors">
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const filteredTimeline = insights.timeline.filter((event) => isInInsightRange(event.date, timelineRange));
  const filteredMonthlyActivity = insights.monthly_activity.filter((entry) => isInInsightRange(entry.month, timelineRange));
  const filteredLabTrends = insights.lab_trends
    .map((trend) => ({ ...trend, readings: trend.readings.filter((reading) => isInInsightRange(reading.date, timelineRange)) }))
    .filter((trend) => trend.readings.length > 0);
  const filteredFaceScanScores = insights.face_scan_scores.filter((entry) => isInInsightRange(entry.date, timelineRange));
  const faceScanOverallValues = filteredFaceScanScores.map((entry) => entry.overall).filter((value): value is number => value !== null);
  const faceScanAverage = faceScanOverallValues.length > 0
    ? Math.round((faceScanOverallValues.reduce((sum, value) => sum + value, 0) / faceScanOverallValues.length) * 10) / 10
    : null;
  const latestFaceScan = filteredFaceScanScores[filteredFaceScanScores.length - 1] || null;
  const selectedFaceScanMetric = FACE_SCAN_METRICS.find((metric) => metric.key === faceScanMetric) || FACE_SCAN_METRICS[0];
  const faceScanMetricReadings = filteredFaceScanScores.filter((entry) => entry[selectedFaceScanMetric.key] !== null);
  const showFaceScanInsights = !activeMember;
  const profileName = activeMember?.name || "you";

  const openInsightChat = (prompt: string) => {
    try {
      window.sessionStorage.setItem("medsign:insight-question", prompt);
    } catch {
      // The chat route still works if browser storage is unavailable.
    }
    router.push(memberParam ? `/chat?${memberParam}` : "/chat");
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const revealLabTrends = () => {
    if (filteredLabTrends.length > 0) {
      scrollToSection("lab-trends");
      return;
    }
    if (timelineRange !== "all") {
      setTimelineRange("all");
      // Wait for the available-history lab card to render before moving focus to it.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => scrollToSection("lab-trends"));
      });
      return;
    }
    openInsightChat("Help me prepare questions for a qualified clinician about the lab values saved in my MedSign history.");
  };

  const briefState = getBriefState(insights, showFaceScanInsights);
  const handleBriefPrimaryAction = () => {
    if (briefState.tone === "lab") {
      revealLabTrends();
      return;
    }
    if (briefState.tone === "wellness") {
      scrollToSection("wellness-trends");
      return;
    }
    if (briefState.tone === "calm" && insights.total_assessments + insights.total_lab_reports + insights.total_symptoms_reported === 0) {
      router.push(memberParam ? `/chat?${memberParam}` : "/chat");
      return;
    }
    openInsightChat("Help me prepare clear questions for a qualified clinician about the health information in my MedSign history.");
  };

  const riskPieData = Object.entries(insights.risk_distribution)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  const systemSignalData = insights.body_systems
    .filter((system) => system.issues > 0)
    .slice(0, 8)
    .map((system) => ({ system: system.system, signals: system.issues }));

  return (
    <div className="care-os care-grid min-h-screen">
      <style>{`
        @keyframes insFadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes insightAurora { 0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: .36; } 50% { transform: translate3d(-22px, 18px, 0) scale(1.12); opacity: .72; } }
        @keyframes insightLive { 0%, 100% { opacity: .55; box-shadow: 0 0 0 0 rgba(103,232,249,.4); } 50% { opacity: 1; box-shadow: 0 0 0 5px rgba(103,232,249,0); } }
        .ins-fade-1 { animation: insFadeUp 0.5s ease-out both; }
        .ins-fade-2 { animation: insFadeUp 0.5s ease-out 0.08s both; }
        .ins-fade-3 { animation: insFadeUp 0.5s ease-out 0.16s both; }
        .ins-fade-4 { animation: insFadeUp 0.5s ease-out 0.24s both; }
        .ins-fade-5 { animation: insFadeUp 0.5s ease-out 0.32s both; }
        .ins-fade-6 { animation: insFadeUp 0.5s ease-out 0.40s both; }
        .ins-fade-7 { animation: insFadeUp 0.5s ease-out 0.48s both; }
        .ins-fade-8 { animation: insFadeUp 0.5s ease-out 0.56s both; }
        .insight-aurora { animation: insightAurora 10s ease-in-out infinite; }
        .insight-live-dot { animation: insightLive 2.3s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ins-fade-1, .ins-fade-2, .ins-fade-3, .ins-fade-4, .ins-fade-5, .ins-fade-6, .ins-fade-7, .ins-fade-8, .insight-aurora, .insight-live-dot { animation: none !important; }
        }
      `}</style>

      {/* ─── Hero Header ─────────────────────────────────────────────────── */}
      <header className="care-hero relative border-b border-white/10">
        <div className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-6 sm:py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push("/dashboard")} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <BrandLogo iconClassName="w-11 h-11" showWordmark={false} />
              <div>
                <p className="care-eyebrow mb-1">Care OS / intelligence layer</p>
                <h1 className="text-xl sm:text-2xl font-bold text-white">Health Insights</h1>
                <p className="text-sm text-teal-100/60 mt-0.5">A connected view of your health signals and trends.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ProfileSwitcher />
              <span className="care-live hidden sm:inline-flex"><span className="care-live-dot" />live intelligence</span>
            </div>
          </div>

          {/* Mini stats row inside header */}
          <div className="grid grid-cols-3 gap-3 mt-6 sm:grid-cols-6">
            {[
              { val: insights.total_assessments, label: "Assessments", color: "from-white/15 to-white/5", href: "/history" },
              { val: insights.total_conditions, label: "Findings", color: "from-white/15 to-white/5", href: "/history" },
              { val: insights.total_symptoms_reported, label: "Symptoms", color: "from-white/15 to-white/5", href: "/history" },
              { val: insights.total_lab_reports, label: "Lab Reports", color: "from-white/15 to-white/5", href: "/reports" },
              ...(showFaceScanInsights ? [{ val: insights.total_face_scans, label: "Face Scans", color: "from-pink-500/20 to-pink-500/5", href: "/face-scan" }] : []),
              { val: insights.total_abnormal_values, label: "Lab Flags", color: "from-red-500/20 to-red-500/5", href: "/reports" },
            ].map((s) => (
              <button key={s.label} onClick={() => router.push(s.href)} className={`bg-gradient-to-br ${s.color} backdrop-blur-sm rounded-2xl p-3.5 border border-white/10 text-center hover:border-teal-100/45 hover:scale-[1.04] active:scale-100 transition-all cursor-pointer`}>
                <p className="text-2xl sm:text-3xl font-black text-white">{s.val}</p>
                <p className="text-[10px] text-white/60 font-semibold mt-0.5">{s.label}</p>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="care-content max-w-6xl mx-auto px-5 sm:px-8 py-8 space-y-7">

        <div className="ins-fade-1">
          <HealthIntelligenceBrief
            insights={insights}
            profileName={profileName}
            range={timelineRange}
            showWellnessScans={showFaceScanInsights}
            onRangeChange={setTimelineRange}
            onPrimaryAction={handleBriefPrimaryAction}
            onAsk={() => openInsightChat("Help me understand the health information I have saved in MedSign and prepare questions for a qualified clinician.")}
          />
        </div>

        {/* ─── Body Systems Health Nucleus — Hero ─────────────────────────── */}
        <div className="ins-fade-2 care-panel rounded-3xl p-6 sm:p-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <BrandLogo iconClassName="w-9 h-9" showWordmark={false} />
              <div>
                <h3 className="text-sm font-bold text-gray-900">Recorded Health Signals by System</h3>
                <p className="text-[11px] text-gray-400">Explore linked saved details—this is not a clinical health score.</p>
              </div>
            </div>
            <div className="hidden rounded-xl bg-slate-50 px-3 py-2 md:block">
              <p className="text-[10px] font-semibold text-slate-500">Tap a system to see source details</p>
            </div>
          </div>
          <BodySystemBubbles systems={insights.body_systems} />
        </div>

        {/* ─── Image Analysis Stats (if any) ─────────────────────────────── */}
        {insights.total_image_analyses > 0 && (
          <div className="ins-fade-2 relative rounded-3xl overflow-hidden p-5 sm:p-6 border border-teal-100" style={{ background: "linear-gradient(135deg, #F0FDFA 0%, #CCFBF1 50%, #99F6E4 100%)" }}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-teal-400/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10 flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-200/50 shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-teal-900">{insights.total_image_analyses} Image Analyses</p>
                <div className="flex items-center gap-2 mt-1">
                  {insights.image_severity_distribution.severe > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">{insights.image_severity_distribution.severe} severe</span>}
                  {insights.image_severity_distribution.moderate > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">{insights.image_severity_distribution.moderate} moderate</span>}
                  {insights.image_severity_distribution.mild > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">{insights.image_severity_distribution.mild} mild</span>}
                  {insights.image_severity_distribution.info > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">{insights.image_severity_distribution.info} info</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Face Scan Progress ─────────────────────────────────────────── */}
        {showFaceScanInsights && insights.total_face_scans > 0 && (
          <div id="wellness-trends" className="ins-fade-3 scroll-mt-6 care-panel rounded-3xl p-6 sm:p-7">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-pink-400 to-rose-500 rounded-xl flex items-center justify-center shadow-md shadow-pink-200/50">
                  <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Face Scan Progress</h3>
                  <p className="text-[11px] text-gray-400">Wellness tracking only—kept separate from clinical health signals.</p>
                </div>
              </div>
              <button onClick={() => router.push("/face-scan")} className="text-[11px] text-pink-500 font-semibold hover:text-pink-600 transition-colors">View Scans →</button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-2xl p-3.5 border border-pink-100/60 text-center">
                <p className="text-2xl font-black text-pink-600">{faceScanAverage ?? "—"}</p>
                <p className="text-[10px] text-pink-400 font-semibold mt-0.5">Avg in view</p>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-2xl p-3.5 border border-purple-100/60 text-center">
                <p className="text-2xl font-black text-purple-600">{filteredFaceScanScores.length}</p>
                <p className="text-[10px] text-purple-400 font-semibold mt-0.5">Scans in view</p>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-3.5 border border-amber-100/60 text-center">
                <p className="text-sm font-black text-amber-600">{latestFaceScan ? formatInsightDate(latestFaceScan.date) : "—"}</p>
                <p className="text-[10px] text-amber-400 font-semibold mt-1">Latest in view</p>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Choose a wellness scan metric">
              {FACE_SCAN_METRICS.map((metric) => {
                const isSelected = selectedFaceScanMetric.key === metric.key;
                return (
                  <button
                    key={metric.key}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setFaceScanMetric(metric.key)}
                    className={`rounded-xl border px-2.5 py-1.5 text-[10px] font-bold transition focus:outline-none focus:ring-2 focus:ring-pink-400 ${isSelected ? "border-pink-200 bg-pink-50 text-pink-700 shadow-sm" : "border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50"}`}
                  >
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: metric.color }} />
                    {metric.shortLabel}
                  </button>
                );
              })}
            </div>

            {/* One wellness metric at a time keeps the trend readable. */}
            {faceScanMetricReadings.length >= 2 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={faceScanMetricReadings}>
                  <defs>
                    <linearGradient id="faceScanMetricGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={selectedFaceScanMetric.color} stopOpacity={0.35} /><stop offset="100%" stopColor={selectedFaceScanMetric.color} stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={(d) => formatInsightDate(String(d))} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                  <Tooltip contentStyle={{ borderRadius: "14px", border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }} labelFormatter={(d) => formatInsightDate(String(d), { day: "numeric", month: "long", year: "numeric" })} formatter={(value: unknown) => [`${String(value)}/100`, selectedFaceScanMetric.label]} />
                  <Area type="monotone" dataKey={selectedFaceScanMetric.key} stroke={selectedFaceScanMetric.color} fill="url(#faceScanMetricGradient)" strokeWidth={2.5} name={selectedFaceScanMetric.label} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-gray-400">
                <div className="text-center">
                  <p>{faceScanMetricReadings.length === 0 ? `No ${selectedFaceScanMetric.label.toLowerCase()} readings in this time range` : `Need one more ${selectedFaceScanMetric.label.toLowerCase()} reading in this time range for a trend`}</p>
                  <p className="text-xs mt-1">Wellness scans are not medical measurements.</p>
                </div>
              </div>
            )}

            <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-400">Showing {selectedFaceScanMetric.label.toLowerCase()} only to keep the wellness trend readable. These scores are not clinical measurements.</p>
          </div>
        )}

        {/* ─── Assessment labels + recorded signal density ───────────────── */}
        <div className="ins-fade-4 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Saved assessment priority labels */}
          <div className="care-panel rounded-3xl p-6 sm:p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-md shadow-amber-200/50">
                <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Saved Assessment Priority Labels</h3>
                <p className="text-[11px] text-gray-400">Labels from saved assessments—not a disease-risk calculation.</p>
              </div>
            </div>
            {riskPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={riskPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={62} paddingAngle={3} dataKey="value" strokeWidth={3} stroke="#fff">
                    {riskPieData.map((entry, i) => (
                      <Cell key={i} fill={RISK_COLORS[entry.name] || PIE_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: unknown, name: unknown) => [`${String(value)} assessment${Number(value) === 1 ? "" : "s"}`, `${String(name).charAt(0).toUpperCase()}${String(name).slice(1)} label`]} contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB", fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-gray-400">No assessments yet</div>
            )}
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              {riskPieData.map(({ name, value }, index) => (
                <div key={name} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full shadow-sm" style={{ backgroundColor: RISK_COLORS[name] || PIE_COLORS[index] }} />
                  <span className="text-[10px] font-medium capitalize text-gray-500">{name} · {value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recorded signal density */}
          <div className="care-panel rounded-3xl p-6 sm:p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200/50">
                <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Signal Density by System</h3>
                <p className="text-[11px] text-gray-400">How many saved signals are linked to each system.</p>
              </div>
            </div>
            {systemSignalData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={systemSignalData} layout="vertical" margin={{ left: 12, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                  <YAxis type="category" dataKey="system" tick={{ fontSize: 10, fill: "#4B5563" }} width={112} />
                  <Tooltip formatter={(value: unknown) => [`${value} saved signal${Number(value) === 1 ? "" : "s"}`, "Linked records"]} contentStyle={{ borderRadius: "14px", border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }} />
                  <Bar dataKey="signals" fill="#6366F1" radius={[0, 8, 8, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-gray-400">No linked system signals yet</div>
            )}
          </div>
        </div>

        {/* ─── Record activity ───────────────────────────────────────────── */}
        <div className="ins-fade-5 care-panel rounded-3xl p-6 sm:p-7">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-md shadow-emerald-200/50">
              <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Record Activity Over Time</h3>
              <p className="text-[11px] text-gray-400">Saved records in the selected chart period—not a health trend.</p>
            </div>
          </div>
          {filteredMonthlyActivity.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={filteredMonthlyActivity} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={(m) => formatInsightDate(String(m), { month: "short" })} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                <Tooltip contentStyle={{ borderRadius: "14px", border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }} />
                <Bar dataKey="assessments" stackId="records" fill="#6366F1" radius={[4, 4, 0, 0]} name="Assessments" />
                <Bar dataKey="lab_reports" stackId="records" fill="#8B5CF6" name="Lab Reports" />
                <Bar dataKey="image_analyses" stackId="records" fill="#14B8A6" name="Image Analyses" />
                {showFaceScanInsights && <Bar dataKey="face_scans" stackId="records" fill="#EC4899" radius={[4, 4, 0, 0]} name="Face Scans" />}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-gray-400">No saved activity in this chart period</div>
          )}
        </div>

        {/* ─── Repeated assessment findings + timeline ───────────────────── */}
        <div className="ins-fade-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Repeated assessment findings */}
          <div className="care-panel rounded-3xl p-6 sm:p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-gradient-to-br from-purple-400 to-pink-500 rounded-xl flex items-center justify-center shadow-md shadow-purple-200/50">
                <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Repeated AI Assessment Findings</h3>
                <p className="text-[11px] text-gray-400">Saved AI-suggested findings—not confirmed diagnoses.</p>
              </div>
            </div>
            {insights.conditions.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={insights.conditions.slice(0, 8)} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#4B5563" }} width={120} />
                  <Tooltip contentStyle={{ borderRadius: "14px", border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }} formatter={(value: unknown) => [`${value} saved assessment${Number(value) === 1 ? "" : "s"}`, "Recorded in"]} />
                  <Bar dataKey="occurrences" fill="#8B5CF6" radius={[0, 8, 8, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
                <div className="text-center">
                  <p>No repeated assessment findings yet</p>
                  <p className="text-xs mt-1">Saved assessment patterns will appear here, with source context.</p>
                </div>
              </div>
            )}
          </div>

          {/* Health Timeline */}
          <div className="care-panel rounded-3xl p-6 sm:p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-xl flex items-center justify-center shadow-md shadow-blue-200/50">
                <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Health Event Stream</h3>
                <p className="text-[11px] text-gray-400">Saved events from the selected chart period.</p>
              </div>
            </div>
            {filteredTimeline.length > 0 ? (
              <Timeline events={filteredTimeline} />
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-gray-400">No saved events in this chart period</div>
            )}
          </div>
        </div>

        {/* ─── Lab Trends ────────────────────────────────────────────────── */}
        {filteredLabTrends.length > 0 && (
          <div className="ins-fade-7">
            <LabTrendExplorer
              trends={filteredLabTrends}
              onAsk={(testName) => openInsightChat(`What questions should I ask a qualified clinician about the trend in my ${testName} lab result?`)}
            />
          </div>
        )}

        {/* ─── Risk Factors ──────────────────────────────────────────────── */}
        {insights.risk_factors.length > 0 && (
          <div id="follow-up-signals" className="ins-fade-8 scroll-mt-6 care-panel rounded-3xl p-6 sm:p-7">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-red-400 to-rose-500 rounded-xl flex items-center justify-center shadow-md shadow-red-200/50">
                <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Follow-up Signals</h3>
                  <p className="text-[11px] text-gray-400">Items from saved records to review—not diagnoses or predictions.</p>
                </div>
              </div>
              <button type="button" onClick={() => openInsightChat("Help me prepare clear questions for a qualified clinician about the follow-up signals in my MedSign history.")} className="w-fit rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-400">Prepare questions</button>
            </div>
            <div className="space-y-3">
              {insights.risk_factors.map((rf, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-2xl border border-gray-100 bg-gray-50/40 hover:bg-gray-50/80 transition-colors">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{ backgroundColor: `${RISK_COLORS[rf.severity]}15` }}>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: RISK_COLORS[rf.severity] || "#9CA3AF" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800">{rf.factor}</p>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{rf.recommendation}</p>
                    <span className="text-[10px] text-gray-400 mt-1 inline-block">{rf.source}</span>
                  </div>
                  <span className="text-[10px] px-2.5 py-1 rounded-full font-bold capitalize shrink-0" style={{ backgroundColor: `${RISK_COLORS[rf.severity]}15`, color: RISK_COLORS[rf.severity] }}>{rf.severity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Doctors & Labs Consulted ───────────────────────────────────── */}
        {(insights.doctors.length > 0 || insights.labs.length > 0) && (
          <div className="ins-fade-7 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Doctors */}
            <div className="care-panel rounded-3xl p-6 sm:p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-gradient-to-br from-sky-400 to-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-sky-200/50">
                  <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-gray-900">Doctors Consulted</h3>
                  <p className="text-[11px] text-gray-400">{insights.doctors.length} doctor{insights.doctors.length !== 1 ? "s" : ""} from your lab reports</p>
                </div>
                <button onClick={() => router.push("/reports")} className="text-[11px] text-sky-500 font-semibold hover:text-sky-600 transition-colors whitespace-nowrap">View Reports →</button>
              </div>
              {insights.doctors.length > 0 ? (
                <div className="space-y-3">
                  {insights.doctors.map((doc, i) => (
                    <button key={i} onClick={() => router.push("/reports")} className="w-full text-left flex items-start gap-3 p-3.5 rounded-2xl border border-gray-100 bg-gray-50/40 hover:bg-sky-50/40 hover:border-sky-200 hover:-translate-y-0.5 hover:shadow-md transition-all group cursor-pointer">
                      <div className="w-10 h-10 bg-gradient-to-br from-sky-100 to-blue-100 rounded-xl flex items-center justify-center shrink-0 group-hover:from-sky-200 group-hover:to-blue-200 transition-colors">
                        <span className="text-sm font-bold text-sky-600">{doc.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">{doc.name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 font-semibold">{doc.reports_count} report{doc.reports_count !== 1 ? "s" : ""}</span>
                          {doc.labs.length > 0 && (
                            <span className="text-[10px] text-gray-400 truncate">{doc.labs.join(", ")}</span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">Last visited: {doc.last_visited}</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-sky-400 shrink-0 mt-3 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-sm text-gray-400">
                  <div className="text-center">
                    <p>No doctor info extracted yet</p>
                    <p className="text-xs mt-1">Upload lab reports to see data here</p>
                  </div>
                </div>
              )}
            </div>

            {/* Labs */}
            <div className="care-panel rounded-3xl p-6 sm:p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-gradient-to-br from-violet-400 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-violet-200/50">
                  <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-gray-900">Labs Visited</h3>
                  <p className="text-[11px] text-gray-400">{insights.labs.length} lab{insights.labs.length !== 1 ? "s" : ""} from your reports</p>
                </div>
                <button onClick={() => router.push("/reports")} className="text-[11px] text-violet-500 font-semibold hover:text-violet-600 transition-colors whitespace-nowrap">View Reports →</button>
              </div>
              {insights.labs.length > 0 ? (
                <div className="space-y-3">
                  {insights.labs.map((lab, i) => (
                    <button key={i} onClick={() => router.push("/reports")} className="w-full text-left flex items-start gap-3 p-3.5 rounded-2xl border border-gray-100 bg-gray-50/40 hover:bg-violet-50/40 hover:border-violet-200 hover:-translate-y-0.5 hover:shadow-md transition-all group cursor-pointer">
                      <div className="w-10 h-10 bg-gradient-to-br from-violet-100 to-purple-100 rounded-xl flex items-center justify-center shrink-0 group-hover:from-violet-200 group-hover:to-purple-200 transition-colors">
                        <svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">{lab.name}</p>
                        {lab.address && (
                          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed truncate">{lab.address}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-semibold">{lab.reports_count} report{lab.reports_count !== 1 ? "s" : ""}</span>
                          <span className="text-[10px] text-gray-400">Last: {lab.last_visited}</span>
                        </div>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-violet-400 shrink-0 mt-3 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-sm text-gray-400">
                  <div className="text-center">
                    <p>No lab info extracted yet</p>
                    <p className="text-xs mt-1">Upload lab reports to see data here</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Longevity & preventive health outlook ─────────────────────── */}
        {insights.longevity_outlook && (
          <div className="ins-fade-8">
            <LongevityOutlookCard data={insights.longevity_outlook} />
          </div>
        )}

        {/* Footer disclaimer */}
        <div className="text-center pb-8 pt-2">
          <p className="text-xs text-gray-400 max-w-lg mx-auto leading-relaxed">
            These insights are generated from your health data and are for informational purposes only.
            They do not constitute medical advice, diagnosis, or treatment. Always consult a qualified
            healthcare professional for medical decisions.
          </p>
        </div>
      </main>
    </div>
  );
}
