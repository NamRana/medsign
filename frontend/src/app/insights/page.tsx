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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  AreaChart,
  Area,
} from "recharts";
import { apiFetch } from "@/lib/api";

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
  readings: { date: string; value: string; unit: string | null; is_abnormal: boolean }[];
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

interface LifeExpectancy {
  estimated_years: number;
  national_average: number;
  factors_positive: string[];
  factors_negative: string[];
  confidence: string;
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

interface HealthInsights {
  health_score: number;
  total_assessments: number;
  total_conditions: number;
  total_symptoms_reported: number;
  total_lab_reports: number;
  total_abnormal_values: number;
  total_image_analyses: number;
  image_severity_distribution: Record<string, number>;
  risk_distribution: Record<string, number>;
  conditions: ConditionEntry[];
  timeline: TimelineEvent[];
  lab_trends: LabTrend[];
  risk_factors: RiskFactor[];
  body_systems: BodySystemScore[];
  life_expectancy: LifeExpectancy;
  monthly_activity: { month: string; assessments: number; lab_reports: number; image_analyses: number }[];
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

const SYSTEM_COLORS: Record<string, string> = {
  improving: "#10B981",
  stable: "#6366F1",
  declining: "#EF4444",
};

// ── Body System Bubbles (Orbital Nucleus) ───────────────────────────────────

const INNER_RING_SIZE = 5;

function getScoreColor(score: number): { primary: string; dark: string; light: string } {
  if (score >= 75) return { primary: "#22C55E", dark: "#16A34A", light: "#DCFCE7" };
  if (score >= 60) return { primary: "#4ADE80", dark: "#22C55E", light: "#F0FDF4" };
  if (score >= 45) return { primary: "#FACC15", dark: "#EAB308", light: "#FEF9C3" };
  if (score >= 30) return { primary: "#F97316", dark: "#EA580C", light: "#FFF7ED" };
  return { primary: "#EF4444", dark: "#DC2626", light: "#FEF2F2" };
}

function BodySystemBubbles({ systems, healthScore }: { systems: BodySystemScore[]; healthScore: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 120);
    return () => clearTimeout(t);
  }, []);

  const sorted = [...systems].sort((a, b) => b.issues - a.issues || a.score - b.score);
  const maxIssues = Math.max(...sorted.map((s) => s.issues), 1);

  const getScoreStatus = (score: number) => {
    if (score >= 70) return { ring: "#10B981", badge: "Healthy" };
    if (score >= 50) return { ring: "#F59E0B", badge: "Attention" };
    return { ring: "#EF4444", badge: "At Risk" };
  };

  const nucleusColor = healthScore >= 80 ? "#6366F1" : healthScore >= 60 ? "#8B5CF6" : healthScore >= 40 ? "#E07840" : "#E8466A";

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

  const trendIcon = (trend: string) => trend === "improving" ? "↗" : trend === "declining" ? "↘" : "→";

  return (
    <div ref={containerRef} onMouseMove={handleMouseMove} className="relative w-full overflow-hidden rounded-3xl" style={{ minHeight: HEIGHT, background: "linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 40%, #EEF2FF 100%)" }}>
      <style>{`
        @keyframes bsPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes bsEntryFade { from { opacity: 0; transform: scale(0.2) translateY(30px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes bsFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes nucleusPulse { 0%, 100% { transform: scale(1); filter: drop-shadow(0 0 20px rgba(99,102,241,0.3)); } 50% { transform: scale(1.02); filter: drop-shadow(0 0 35px rgba(99,102,241,0.5)); } }
        .bs-enter { animation: bsEntryFade 0.7s cubic-bezier(0.34,1.56,0.64,1) both; }
        .bs-pulse { animation: bsPulse 2.8s ease-in-out infinite; }
        .bs-float { animation: bsFloat 6s ease-in-out infinite; }
        .nucleus-pulse { animation: nucleusPulse 4s ease-in-out infinite; }
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
            const pal = getScoreColor(b.score);
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
          const pal = getScoreColor(b.score);
          const p = parallax(b.cx, b.cy, b.depth);
          const isActive = hovered === b.system;
          return (
            <line key={`line-${b.system}`} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke={pal.primary} strokeWidth={isActive ? 1.5 : 0.8} opacity={isActive ? 0.35 : 0.1} strokeDasharray={isActive ? "none" : "4 8"} filter={isActive ? "url(#line-glow)" : undefined} style={{ transition: "opacity 0.3s, stroke-width 0.3s" }} />
          );
        })}

        {/* Nucleus breathing glow */}
        <circle cx={CX} cy={CY} r={NUCLEUS_R + 30} fill={nucleusColor} opacity="0.04">
          <animate attributeName="r" values={`${NUCLEUS_R + 20};${NUCLEUS_R + 38};${NUCLEUS_R + 20}`} dur="5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.03;0.08;0.03" dur="5s" repeatCount="indefinite" />
        </circle>
        <circle cx={CX} cy={CY} r={NUCLEUS_R + 14} fill={nucleusColor} opacity="0.06">
          <animate attributeName="r" values={`${NUCLEUS_R + 10};${NUCLEUS_R + 20};${NUCLEUS_R + 10}`} dur="4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.04;0.1;0.04" dur="4s" repeatCount="indefinite" />
        </circle>

        {/* Nucleus */}
        <g filter="url(#nucleus-glow)" className={`${entered ? "bs-enter" : ""} nucleus-pulse`} style={{ animationDelay: "0s", transformOrigin: `${CX}px ${CY}px` }}>
          <circle cx={CX} cy={CY} r={NUCLEUS_R} fill="url(#nucleus-grad)" />
          <circle cx={CX} cy={CY} r={NUCLEUS_R} fill="none" stroke="white" strokeWidth="2" opacity="0.15" />
          <ellipse cx={CX - NUCLEUS_R * 0.14} cy={CY - NUCLEUS_R * 0.24} rx={NUCLEUS_R * 0.3} ry={NUCLEUS_R * 0.1} fill="white" opacity="0.2" transform={`rotate(-18 ${CX - NUCLEUS_R * 0.14} ${CY - NUCLEUS_R * 0.24})`} />
          <text x={CX} y={CY - 10} textAnchor="middle" fill="white" fontWeight="900" fontSize="34" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.3)" }}>{healthScore}</text>
          <text x={CX} y={CY + 10} textAnchor="middle" fill="white" fontWeight="700" fontSize="10" opacity="0.95" style={{ letterSpacing: "3px" }}>HEALTH</text>
          <text x={CX} y={CY + 23} textAnchor="middle" fill="white" fontWeight="500" fontSize="8" opacity="0.6" style={{ letterSpacing: "2px" }}>SCORE</text>
        </g>

        {/* Nucleus score ring */}
        {(() => {
          const rr = NUCLEUS_R + 7;
          const c = 2 * Math.PI * rr;
          const p = (healthScore / 100) * c;
          return (
            <>
              <circle cx={CX} cy={CY} r={rr} fill="none" stroke="white" strokeWidth="3" opacity="0.08" />
              <circle cx={CX} cy={CY} r={rr} fill="none" stroke={getScoreStatus(healthScore).ring} strokeWidth="3.5" strokeDasharray={`${p} ${c}`} strokeLinecap="round" opacity="0.6" transform={`rotate(-90 ${CX} ${CY})`} />
            </>
          );
        })()}

        {/* Body system bubbles */}
        {bubbles.map((b, idx) => {
          const pal = getScoreColor(b.score);
          const status = getScoreStatus(b.score);
          const id = b.system.replace(/[^a-zA-Z0-9]/g, "");
          const p = parallax(b.cx, b.cy, b.depth);
          const isActive = hovered === b.system;
          const isSel = selected === b.system;
          const scale = isActive || isSel ? 1.14 : 1;
          const atRisk = b.score < 50;
          const displayName = b.system.length > 14 ? b.system.slice(0, 13) + "…" : b.system;

          const ringR = b.r + 5;
          const ringCirc = 2 * Math.PI * ringR;
          const ringProgress = (b.score / 100) * ringCirc;

          return (
            <g
              key={b.system}
              onMouseEnter={() => setHovered(b.system)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setSelected(selected === b.system ? null : b.system)}
              style={{ cursor: "pointer" }}
            >
              <g className={entered ? "bs-enter" : ""} style={{ animationDelay: `${b.entryDelay}s`, opacity: entered ? undefined : 0 }}>
                <g className={`${atRisk ? "bs-pulse" : "bs-float"}`} style={{ transformOrigin: `${p.x}px ${p.y}px`, animationDelay: `${idx * 0.4}s` }}>
                  <g style={{ transformOrigin: `${p.x}px ${p.y}px`, transform: `scale(${scale})`, transition: "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)" }} filter={isActive || isSel ? "url(#bs-glow)" : "url(#bs-shadow)"}>
                    {/* Outer ambient glow */}
                    <circle cx={p.x} cy={p.y} r={b.r + 14} fill={pal.primary} opacity={isActive ? 0.22 : 0.06} style={{ transition: "opacity 0.3s" }} />

                    {/* Score progress ring */}
                    <circle cx={p.x} cy={p.y} r={ringR} fill="none" stroke="#E2E8F0" strokeWidth="3" opacity="0.15" />
                    <circle cx={p.x} cy={p.y} r={ringR} fill="none" stroke={status.ring} strokeWidth="3.5" strokeDasharray={`${ringProgress} ${ringCirc}`} strokeLinecap="round" opacity={isActive ? 0.9 : 0.5} transform={`rotate(-90 ${p.x} ${p.y})`} style={{ transition: "opacity 0.3s" }} />

                    {/* Main bubble */}
                    <circle cx={p.x} cy={p.y} r={b.r} fill={`url(#orb-${id})`} stroke={isSel ? pal.dark : "white"} strokeWidth={isSel ? 3 : 1.5} strokeOpacity={isSel ? 1 : 0.3} />

                    {/* Glass highlight */}
                    <ellipse cx={p.x - b.r * 0.12} cy={p.y - b.r * 0.2} rx={b.r * 0.3} ry={b.r * 0.1} fill="white" opacity="0.35" transform={`rotate(-15 ${p.x - b.r * 0.12} ${p.y - b.r * 0.2})`} />

                    {/* Score number */}
                    <text x={p.x} y={p.y - 8} textAnchor="middle" fill={pal.dark} fontWeight="900" fontSize="22" style={{ textShadow: "0 1px 3px rgba(255,255,255,0.6)" }}>{b.score}</text>
                    {/* System name */}
                    <text x={p.x} y={p.y + 8} textAnchor="middle" fill="#1E293B" fontWeight="700" fontSize="9.5" style={{ textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{displayName}</text>
                    {/* Trend + issues */}
                    <text x={p.x} y={p.y + 21} textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="600">{trendIcon(b.trend)} {b.issues > 0 ? `${b.issues} issue${b.issues > 1 ? "s" : ""}` : "OK"}</text>
                  </g>
                </g>
              </g>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hovered && !selected && (() => {
        const b = bubbles.find((x) => x.system === hovered);
        if (!b) return null;
        const pal = getScoreColor(b.score);
        const status = getScoreStatus(b.score);
        const trendColors: Record<string, string> = { improving: "text-emerald-600 bg-emerald-50", declining: "text-red-600 bg-red-50", stable: "text-gray-500 bg-gray-100" };

        return (
          <div className="absolute z-20 pointer-events-none left-1/2 top-5" style={{ transform: "translateX(-50%)" }}>
            <div className="bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-gray-200/60 px-6 py-5 min-w-[240px]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-5 h-5 rounded-full shadow-sm ring-2 ring-white" style={{ backgroundColor: pal.primary }} />
                <p className="text-base font-bold text-gray-900">{b.system}</p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black" style={{ color: pal.dark }}>{b.score}</span>
                <span className="text-sm text-gray-300 font-medium">/ 100</span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold ml-1" style={{ backgroundColor: `${status.ring}15`, color: status.ring }}>{status.badge}</span>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${trendColors[b.trend] || trendColors.stable}`}>{trendIcon(b.trend)} {b.trend}</span>
                {b.issues > 0 && <span className="text-xs text-gray-400">{b.issues} issue{b.issues > 1 ? "s" : ""}</span>}
              </div>
              {b.issues > 0 && <p className="text-[11px] text-gray-300 mt-2">Click for details</p>}
            </div>
          </div>
        );
      })()}

      {/* Selected detail panel */}
      {selected && (() => {
        const b = bubbles.find((x) => x.system === selected);
        if (!b) return null;
        const pal = getScoreColor(b.score);
        const status = getScoreStatus(b.score);
        const trendColors: Record<string, string> = { improving: "text-emerald-600 bg-emerald-50", declining: "text-red-600 bg-red-50", stable: "text-gray-500 bg-gray-100" };
        const sourceLabels: Record<string, string> = { symptom: "Symptom", condition: "Condition", image: "Image Analysis" };
        const severityColors: Record<string, string> = { info: "bg-gray-100 text-gray-600", mild: "bg-amber-50 text-amber-700", moderate: "bg-orange-50 text-orange-700", severe: "bg-red-50 text-red-700" };

        return (
          <div className="mt-5 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-xl border border-gray-200/60 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${pal.light}, white)` }}>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md" style={{ backgroundColor: pal.primary }}>
                  <span className="text-xl font-black text-white">{b.score}</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">{b.system}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold capitalize ${trendColors[b.trend] || trendColors.stable}`}>{trendIcon(b.trend)} {b.trend}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${status.ring}15`, color: status.ring }}>{status.badge}</span>
                    <span className="text-[11px] text-gray-400">{b.issues} issue{b.issues !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setSelected(null); }} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
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
                <p className="text-xs text-gray-400">No specific findings reported for this system.</p>
                <p className="text-[11px] font-medium mt-1" style={{ color: pal.primary }}>System appears healthy</p>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── Life Expectancy Gauge ────────────────────────────────────────────────────

function LifeExpectancyGauge({ data }: { data: LifeExpectancy }) {
  const diff = data.estimated_years - data.national_average;
  const isPositive = diff >= 0;

  return (
    <div className="relative rounded-3xl overflow-hidden p-6 sm:p-7 border border-indigo-100 shadow-md shadow-indigo-100/40" style={{ background: "linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 40%, #C7D2FE 100%)" }}>
      <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-400/10 rounded-full -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 left-0 w-28 h-28 bg-purple-400/10 rounded-full translate-y-1/3 -translate-x-1/4" />
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-300/50">
            <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-indigo-900">Life Expectancy Estimate</h3>
            <p className="text-[11px] text-indigo-500">Based on your health data analysis</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-center bg-white/60 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-sm border border-white/80">
            <div className="text-4xl font-black text-indigo-700">{data.estimated_years}</div>
            <div className="text-xs text-indigo-500 font-semibold mt-1">years</div>
          </div>
          <div className="flex-1 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-indigo-600/70 font-medium">National Average</span>
              <span className="font-bold text-indigo-800">{data.national_average} yrs</span>
            </div>
            <div className="w-full bg-white/50 rounded-full h-3 shadow-inner">
              <div className="h-3 rounded-full transition-all duration-700 shadow-sm" style={{ width: `${Math.min(100, (data.estimated_years / 100) * 100)}%`, background: isPositive ? "linear-gradient(90deg, #10B981, #34D399)" : "linear-gradient(90deg, #F59E0B, #FBBF24)" }} />
            </div>
            <div className={`inline-flex items-center text-xs font-bold px-3 py-1 rounded-full ${isPositive ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {isPositive ? "+" : ""}{diff.toFixed(1)} years vs average
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-4 border border-white/80">
            <p className="text-xs font-bold text-green-700 mb-2">Positive Factors</p>
            {data.factors_positive.map((f, i) => (
              <p key={i} className="text-xs text-green-600 flex items-start gap-1.5 mb-1 last:mb-0">
                <span className="mt-0.5 shrink-0 text-green-500">+</span> {f}
              </p>
            ))}
          </div>
          <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-4 border border-white/80">
            <p className="text-xs font-bold text-red-700 mb-2">Risk Factors</p>
            {data.factors_negative.map((f, i) => (
              <p key={i} className="text-xs text-red-600 flex items-start gap-1.5 mb-1 last:mb-0">
                <span className="mt-0.5 shrink-0 text-red-500">-</span> {f}
              </p>
            ))}
          </div>
        </div>

        <p className="mt-4 text-[10px] text-indigo-400 leading-relaxed">{data.disclaimer}</p>
      </div>
    </div>
  );
}

// ── Timeline Component ───────────────────────────────────────────────────────

function Timeline({ events }: { events: TimelineEvent[] }) {
  const typeIcons: Record<string, string> = {
    assessment: "🩺",
    lab_report: "🧪",
    symptom: "💊",
    image_analysis: "📷",
  };
  const typeDots: Record<string, string> = {
    assessment: "bg-blue-400",
    lab_report: "bg-purple-400",
    symptom: "bg-amber-400",
    image_analysis: "bg-teal-400",
  };
  const typeColors: Record<string, string> = {
    assessment: "border-blue-200/60 bg-blue-50/50",
    lab_report: "border-purple-200/60 bg-purple-50/50",
    symptom: "border-amber-200/60 bg-amber-50/50",
    image_analysis: "border-teal-200/60 bg-teal-50/50",
  };

  return (
    <div className="relative max-h-80 overflow-y-auto pr-2">
      <div className="absolute left-[71px] top-0 bottom-0 w-px bg-gray-100" />
      <div className="space-y-2.5">
        {events.slice(0, 15).map((event, i) => (
          <div key={i} className="flex items-start gap-3 relative">
            <div className="text-[11px] text-gray-400 w-14 shrink-0 pt-2 text-right font-medium">
              {new Date(event.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </div>
            <div className={`w-2.5 h-2.5 rounded-full ${typeDots[event.type] || "bg-gray-300"} shrink-0 mt-2.5 ring-2 ring-white z-10`} />
            <div className={`flex-1 rounded-xl px-3.5 py-2.5 border ${typeColors[event.type] || "border-gray-200 bg-gray-50"} hover:shadow-sm transition-shadow`}>
              <div className="flex items-center gap-2">
                <span className="text-sm">{typeIcons[event.type] || "📋"}</span>
                <span className="text-sm font-semibold text-gray-800">{event.title}</span>
                {event.risk_level && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: `${RISK_COLORS[event.risk_level]}15`, color: RISK_COLORS[event.risk_level] }}>{event.risk_level}</span>
                )}
              </div>
              {event.detail && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{event.detail}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const router = useRouter();
  const [insights, setInsights] = useState<HealthInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<HealthInsights>("/api/v1/insights")
      .then(setInsights)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          <p className="mt-5 text-sm text-gray-500 font-medium">Analyzing your health data...</p>
          <p className="mt-1 text-xs text-gray-300">This may take a moment</p>
        </div>
      </div>
    );
  }

  if (error || !insights) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm bg-white rounded-3xl p-8 shadow-lg border border-gray-100">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          </div>
          <p className="text-sm font-semibold text-gray-800">{error || "Failed to load insights"}</p>
          <button onClick={() => router.push("/dashboard")} className="mt-4 text-sm text-indigo-600 font-semibold hover:text-indigo-700 transition-colors">
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const riskPieData = Object.entries(insights.risk_distribution)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  const radarData = insights.body_systems.slice(0, 8).map((bs) => ({
    system: bs.system.replace(" ", "\n"),
    score: bs.score,
    fullMark: 100,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-emerald-50/20">
      <style>{`
        @keyframes insFadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .ins-fade-1 { animation: insFadeUp 0.5s ease-out both; }
        .ins-fade-2 { animation: insFadeUp 0.5s ease-out 0.08s both; }
        .ins-fade-3 { animation: insFadeUp 0.5s ease-out 0.16s both; }
        .ins-fade-4 { animation: insFadeUp 0.5s ease-out 0.24s both; }
        .ins-fade-5 { animation: insFadeUp 0.5s ease-out 0.32s both; }
        .ins-fade-6 { animation: insFadeUp 0.5s ease-out 0.40s both; }
        .ins-fade-7 { animation: insFadeUp 0.5s ease-out 0.48s both; }
        .ins-fade-8 { animation: insFadeUp 0.5s ease-out 0.56s both; }
      `}</style>

      {/* ─── Hero Header ─────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 40%, #8B5CF6 100%)" }}>
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 25% 75%, white 1px, transparent 1px), radial-gradient(circle at 75% 25%, white 1px, transparent 1px)", backgroundSize: "50px 50px" }} />
        <div className="absolute top-0 right-0 w-72 h-72 bg-white/[0.04] rounded-full -translate-y-1/3 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/[0.04] rounded-full translate-y-1/3 -translate-x-1/4" />
        <div className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-6 sm:py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push("/dashboard")} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white">Health Insights</h1>
                <p className="text-sm text-white/60 mt-0.5">Comprehensive analytics powered by AI</p>
              </div>
            </div>
            <span className="text-xs bg-white/15 text-white/90 px-3 py-1.5 rounded-full font-semibold backdrop-blur-sm border border-white/10">
              AI-Powered
            </span>
          </div>

          {/* Mini stats row inside header */}
          <div className="grid grid-cols-5 gap-3 mt-6">
            {[
              { val: insights.total_assessments, label: "Assessments", color: "from-white/15 to-white/5", href: "/history" },
              { val: insights.total_conditions, label: "Conditions", color: "from-white/15 to-white/5", href: "/history" },
              { val: insights.total_symptoms_reported, label: "Symptoms", color: "from-white/15 to-white/5", href: "/history" },
              { val: insights.total_lab_reports, label: "Lab Reports", color: "from-white/15 to-white/5", href: "/reports" },
              { val: insights.total_abnormal_values, label: "Abnormal", color: "from-red-500/20 to-red-500/5", href: "/reports" },
            ].map((s) => (
              <button key={s.label} onClick={() => router.push(s.href)} className={`bg-gradient-to-br ${s.color} backdrop-blur-sm rounded-2xl p-3.5 border border-white/10 text-center hover:border-white/30 hover:scale-[1.04] active:scale-100 transition-all cursor-pointer`}>
                <p className="text-2xl sm:text-3xl font-black text-white">{s.val}</p>
                <p className="text-[10px] text-white/60 font-semibold mt-0.5">{s.label}</p>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 sm:px-8 py-8 space-y-7">

        {/* ─── Body Systems Health Nucleus — Hero ─────────────────────────── */}
        <div className="ins-fade-1 bg-white rounded-3xl p-6 sm:p-8 shadow-lg shadow-gray-200/40 border border-gray-100 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200/50">
                <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Body Systems Health Map</h3>
                <p className="text-[11px] text-gray-400">Interactive visualization of your body systems</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-4">
              <div className="flex items-center gap-3">
                {[
                  { label: "Healthy", color: "#10B981" },
                  { label: "Attention", color: "#F59E0B" },
                  { label: "At Risk", color: "#EF4444" },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "white", border: `2.5px solid ${l.color}`, boxShadow: `0 0 6px ${l.color}30` }} />
                    <span className="text-[10px] text-gray-500 font-medium">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <BodySystemBubbles systems={insights.body_systems} healthScore={insights.health_score} />
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

        {/* ─── Risk Distribution + Radar ─────────────────────────────────── */}
        <div className="ins-fade-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Risk Distribution Pie */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-md shadow-gray-100/60 border border-gray-100 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-md shadow-amber-200/50">
                <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Risk Distribution</h3>
                <p className="text-[11px] text-gray-400">Breakdown across severity levels</p>
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
                  <Tooltip formatter={(value: unknown, name: unknown) => [String(value), String(name).charAt(0).toUpperCase() + String(name).slice(1)]} contentStyle={{ borderRadius: "12px", border: "1px solid #E5E7EB", fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-gray-400">No assessments yet</div>
            )}
            <div className="flex justify-center gap-4 mt-2">
              {Object.entries(RISK_COLORS).map(([level, color]) => (
                <div key={level} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-gray-500 capitalize font-medium">{level}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Body Systems Radar */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-md shadow-gray-100/60 border border-gray-100 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200/50">
                <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Body Systems Radar</h3>
                <p className="text-[11px] text-gray-400">System-by-system health scores</p>
              </div>
            </div>
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                  <PolarAngleAxis dataKey="system" tick={{ fontSize: 10, fill: "#6B7280" }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar name="Score" dataKey="score" stroke="#6366F1" fill="#6366F1" fillOpacity={0.15} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-sm text-gray-400">Not enough data</div>
            )}
          </div>
        </div>

        {/* ─── Monthly Activity ──────────────────────────────────────────── */}
        <div className="ins-fade-3 bg-white rounded-3xl p-6 sm:p-7 shadow-md shadow-gray-100/60 border border-gray-100 hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-md shadow-emerald-200/50">
              <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Monthly Activity</h3>
              <p className="text-[11px] text-gray-400">Your health engagement over time</p>
            </div>
          </div>
          {insights.monthly_activity.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={insights.monthly_activity}>
                <defs>
                  <linearGradient id="areaGrad1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} /><stop offset="100%" stopColor="#6366F1" stopOpacity={0.02} /></linearGradient>
                  <linearGradient id="areaGrad2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.3} /><stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.02} /></linearGradient>
                  <linearGradient id="areaGrad3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14B8A6" stopOpacity={0.3} /><stop offset="100%" stopColor="#14B8A6" stopOpacity={0.02} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={(m) => m.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                <Tooltip contentStyle={{ borderRadius: "14px", border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }} />
                <Area type="monotone" dataKey="assessments" stackId="1" stroke="#6366F1" fill="url(#areaGrad1)" strokeWidth={2} name="Assessments" />
                <Area type="monotone" dataKey="lab_reports" stackId="1" stroke="#8B5CF6" fill="url(#areaGrad2)" strokeWidth={2} name="Lab Reports" />
                <Area type="monotone" dataKey="image_analyses" stackId="1" stroke="#14B8A6" fill="url(#areaGrad3)" strokeWidth={2} name="Image Analyses" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-sm text-gray-400">No activity recorded</div>
          )}
        </div>

        {/* ─── Conditions + Timeline ─────────────────────────────────────── */}
        <div className="ins-fade-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Conditions Chart */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-md shadow-gray-100/60 border border-gray-100 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-gradient-to-br from-purple-400 to-pink-500 rounded-xl flex items-center justify-center shadow-md shadow-purple-200/50">
                <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Conditions Detected</h3>
                <p className="text-[11px] text-gray-400">Frequency of identified conditions</p>
              </div>
            </div>
            {insights.conditions.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={insights.conditions.slice(0, 8)} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#4B5563" }} width={120} />
                  <Tooltip contentStyle={{ borderRadius: "14px", border: "1px solid #E5E7EB", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }} formatter={(value: unknown) => [`${value} occurrence(s)`, "Frequency"]} />
                  <Bar dataKey="occurrences" fill="#8B5CF6" radius={[0, 8, 8, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
                <div className="text-center">
                  <p>No conditions detected yet</p>
                  <p className="text-xs mt-1">Complete assessments to see data here</p>
                </div>
              </div>
            )}
          </div>

          {/* Health Timeline */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-md shadow-gray-100/60 border border-gray-100 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-xl flex items-center justify-center shadow-md shadow-blue-200/50">
                <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Health Timeline</h3>
                <p className="text-[11px] text-gray-400">Chronological health events</p>
              </div>
            </div>
            {insights.timeline.length > 0 ? (
              <Timeline events={insights.timeline} />
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-400 text-sm">No events recorded</div>
            )}
          </div>
        </div>

        {/* ─── Lab Trends ────────────────────────────────────────────────── */}
        {insights.lab_trends.length > 0 && (
          <div className="ins-fade-5 bg-white rounded-3xl p-6 sm:p-7 shadow-md shadow-gray-100/60 border border-gray-100 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-gradient-to-br from-rose-400 to-red-500 rounded-xl flex items-center justify-center shadow-md shadow-rose-200/50">
                <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Lab Value Trends</h3>
                <p className="text-[11px] text-gray-400">Track your lab results over time</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insights.lab_trends.slice(0, 6).map((trend) => (
                <div key={trend.test_name} className="border border-gray-100 rounded-2xl p-4 bg-gray-50/30 hover:bg-gray-50/60 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-gray-800">{trend.test_name}</span>
                    {trend.category && (
                      <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full font-semibold">{trend.category}</span>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={80}>
                    <LineChart data={trend.readings}>
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#6366F1"
                        strokeWidth={2}
                        dot={(props: Record<string, unknown>) => {
                          const { cx, cy, payload } = props as { cx: number; cy: number; payload: { is_abnormal: boolean } };
                          return (
                            <circle cx={cx} cy={cy} r={4} fill={payload.is_abnormal ? "#EF4444" : "#6366F1"} stroke="white" strokeWidth={2} />
                          );
                        }}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: "10px", fontSize: "11px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                        formatter={(value: unknown, _: unknown, entry: unknown) => {
                          const e = entry as { payload?: { unit?: string; is_abnormal?: boolean } };
                          return [
                            `${value} ${e.payload?.unit || ""}`,
                            e.payload?.is_abnormal ? "ABNORMAL" : "Normal",
                          ];
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Risk Factors ──────────────────────────────────────────────── */}
        {insights.risk_factors.length > 0 && (
          <div className="ins-fade-6 bg-white rounded-3xl p-6 sm:p-7 shadow-md shadow-gray-100/60 border border-gray-100 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-gradient-to-br from-red-400 to-rose-500 rounded-xl flex items-center justify-center shadow-md shadow-red-200/50">
                <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Risk Factors</h3>
                <p className="text-[11px] text-gray-400">Areas requiring attention</p>
              </div>
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
            <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-md shadow-gray-100/60 border border-gray-100 hover:shadow-lg transition-shadow">
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
            <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-md shadow-gray-100/60 border border-gray-100 hover:shadow-lg transition-shadow">
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

        {/* ─── Life Expectancy ───────────────────────────────────────────── */}
        <div className="ins-fade-8">
          <LifeExpectancyGauge data={insights.life_expectancy} />
        </div>

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
