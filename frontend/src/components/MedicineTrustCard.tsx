"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface SafetyCheck {
  name: string;
  passed: boolean;
  detail: string;
  icon: string;
}

interface SideEffect {
  effect: string;
  severity: string;
}

interface Alternative {
  name: string;
  brand: string;
  drug_class: string;
  note: string;
  is_otc: boolean;
}

interface Evidence {
  source: string;
  drug_class: string | null;
  mechanism: string | null;
  is_otc: boolean | null;
  guidelines: string | null;
}

export interface TrustCardData {
  medicine_name: string;
  generic_name: string;
  dosage: string | null;
  duration: string | null;
  instructions: string | null;
  verified: boolean;
  safety_status: "safe" | "caution" | "danger";
  safety_checks: SafetyCheck[];
  checks_passed: number;
  checks_total: number;
  evidence: Evidence;
  side_effects: SideEffect[];
  alternatives: Alternative[];
  drug_class: string | null;
  is_otc: boolean | null;
  brand_names: string[];
}

const CHECK_ICONS: Record<string, string> = {
  shield: "🛡️",
  layers: "🔗",
  user: "👤",
  heart: "❤️",
  baby: "🤰",
};

const STATUS_STYLES = {
  safe: {
    bg: "from-emerald-50 to-green-50",
    border: "border-emerald-200/60",
    badge: "bg-emerald-100 text-emerald-700",
    badgeText: "All Checks Passed",
    icon: "✓",
    glow: "shadow-emerald-100/60",
  },
  caution: {
    bg: "from-amber-50 to-orange-50",
    border: "border-amber-200/60",
    badge: "bg-amber-100 text-amber-700",
    badgeText: "Review Needed",
    icon: "!",
    glow: "shadow-amber-100/60",
  },
  danger: {
    bg: "from-red-50 to-rose-50",
    border: "border-red-200/60",
    badge: "bg-red-100 text-red-700",
    badgeText: "Safety Warning",
    icon: "⚠",
    glow: "shadow-red-100/60",
  },
};

const SEVERITY_COLORS: Record<string, string> = {
  mild: "bg-gray-100 text-gray-600",
  moderate: "bg-amber-100 text-amber-700",
  severe: "bg-red-100 text-red-700",
};

function AddToTrackerButton({ card, memberId }: { card: TrustCardData; memberId?: string }) {
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    setAdding(true);
    try {
      const body: Record<string, unknown> = {
        name: card.medicine_name,
        dosage: card.dosage || "",
        frequency: "as_needed",
        times: ["08:00"],
        meal_relation: "after",
        notes: card.instructions || "",
        is_active: true,
      };
      if (memberId) body.family_member_id = memberId;

      await apiFetch("/api/v1/medicines", { method: "POST", body: JSON.stringify(body) });
      setAdded(true);
    } catch {
      // silently fail — user can add manually
    } finally {
      setAdding(false);
    }
  }

  if (added) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Added to Tracker
      </span>
    );
  }

  return (
    <button
      onClick={handleAdd}
      disabled={adding}
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-purple-600 hover:text-purple-800 bg-purple-50 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition-all disabled:opacity-50"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      {adding ? "Adding..." : "Add to Tracker"}
    </button>
  );
}

export default function MedicineTrustCard({
  card,
  memberId,
}: {
  card: TrustCardData;
  memberId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_STYLES[card.safety_status];

  return (
    <div className={`rounded-2xl border ${status.border} bg-gradient-to-br ${status.bg} overflow-hidden shadow-md ${status.glow} transition-all hover:shadow-lg`}>
      {/* Header */}
      <div
        className="px-4 py-3.5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Verified badge */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
              card.verified ? "bg-emerald-500 text-white" : "bg-gray-300 text-white"
            }`}>
              {card.verified ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{card.medicine_name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {card.drug_class && (
                  <span className="text-[10px] font-medium text-gray-500 bg-white/60 px-2 py-0.5 rounded-full">{card.drug_class}</span>
                )}
                {card.is_otc !== null && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${card.is_otc ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                    {card.is_otc ? "OTC" : "Rx"}
                  </span>
                )}
                {card.dosage && (
                  <span className="text-[10px] text-gray-500">{card.dosage}</span>
                )}
              </div>
            </div>
          </div>

          {/* Safety badge */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${status.badge}`}>
              {status.icon} {card.checks_passed}/{card.checks_total} Passed
            </span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Safety check strip — always visible */}
        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          {card.safety_checks.map((check, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                check.passed
                  ? "bg-emerald-100/80 text-emerald-700"
                  : "bg-red-100/80 text-red-700"
              }`}
            >
              {check.passed ? "✓" : "✗"} {check.name}
            </span>
          ))}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-black/5 px-4 py-4 space-y-4 bg-white/40">
          {/* Safety checks detail */}
          <div>
            <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-2">Safety Verification</h4>
            <div className="space-y-2">
              {card.safety_checks.map((check, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs ${
                    check.passed ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                  }`}>
                    {CHECK_ICONS[check.icon] || (check.passed ? "✓" : "✗")}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{check.name}</p>
                    <p className="text-[11px] text-gray-500 leading-relaxed">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Evidence & reasoning */}
          {card.evidence.guidelines && (
            <div>
              <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-2">Why This Medicine</h4>
              <div className="bg-white/60 rounded-xl p-3 border border-white/80">
                <p className="text-xs text-gray-700 leading-relaxed">{card.evidence.guidelines}</p>
                {card.evidence.source && card.evidence.source !== "unknown" && (
                  <p className="text-[10px] text-gray-400 mt-1.5">Source: {card.evidence.source}</p>
                )}
              </div>
            </div>
          )}

          {/* Side effects */}
          {(card.side_effects ?? []).length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-2">Possible Side Effects</h4>
              <div className="flex flex-wrap gap-1.5">
                {card.side_effects.map((effect, i) => (
                  <span key={i} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${SEVERITY_COLORS[effect.severity] || SEVERITY_COLORS.mild}`}>
                    {effect.effect}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Alternatives */}
          {(card.alternatives ?? []).length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-2">Alternatives</h4>
              <div className="space-y-1.5">
                {card.alternatives.map((alt, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/60 rounded-xl px-3 py-2 border border-white/80">
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{alt.name} <span className="text-gray-400 font-normal">({alt.brand})</span></p>
                      <p className="text-[10px] text-gray-500">{alt.note}</p>
                    </div>
                    {alt.is_otc && (
                      <span className="text-[9px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full shrink-0">OTC</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Instructions & duration */}
          {(card.instructions || card.duration) && (
            <div className="flex items-center gap-3 flex-wrap">
              {card.instructions && (
                <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                  <span className="text-sm">📋</span> {card.instructions}
                </div>
              )}
              {card.duration && (
                <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                  <span className="text-sm">⏱️</span> {card.duration}
                </div>
              )}
            </div>
          )}

          {/* Add to tracker */}
          <div className="pt-2 border-t border-black/5 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">
              {card.verified ? "✓ Verified in medical database" : "⚠ Not found in database — verify with pharmacist"}
            </span>
            <AddToTrackerButton card={card} memberId={memberId} />
          </div>
        </div>
      )}
    </div>
  );
}

export function MedicineTrustCards({
  cards,
  memberId,
}: {
  cards: TrustCardData[];
  memberId?: string;
}) {
  if (!cards || cards.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-lg flex items-center justify-center shadow-sm">
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-bold text-gray-800">Medicine Safety Report</p>
          <p className="text-[10px] text-gray-400">Each medicine verified against your profile</p>
        </div>
      </div>
      {cards.map((card, i) => (
        <MedicineTrustCard key={i} card={card} memberId={memberId} />
      ))}
    </div>
  );
}
