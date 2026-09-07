"use client";

import { useId, useState } from "react";
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

function parseFrequencyFromCard(card: TrustCardData): { frequency: string; times: string[]; meal_relation: string } {
  const instr = (card.instructions || "").toLowerCase();
  const duration = (card.duration || "").toLowerCase();
  const combined = `${instr} ${duration}`;

  let frequency = "once_daily";
  let times = ["09:00"];
  let meal_relation = "after";

  if (/three\s*times|thrice|tds|tid|3\s*times/i.test(combined)) {
    frequency = "thrice_daily";
    times = ["08:00", "14:00", "20:00"];
  } else if (/twice|bd|bid|2\s*times|two\s*times/i.test(combined)) {
    frequency = "twice_daily";
    times = ["08:00", "20:00"];
  } else if (/once|od|qd|1\s*time|one\s*time/i.test(combined)) {
    frequency = "once_daily";
    times = ["09:00"];
  } else if (/as\s*needed|prn|sos|when\s*required/i.test(combined)) {
    frequency = "as_needed";
    times = [];
  } else if (/four\s*times|qid|qds|4\s*times/i.test(combined)) {
    frequency = "thrice_daily";
    times = ["08:00", "13:00", "18:00", "22:00"];
  }

  if (/morning|breakfast|am\b/i.test(combined) && times.length <= 1) {
    times = ["08:00"];
  } else if (/night|bedtime|hs\b|before\s*sleep/i.test(combined) && times.length <= 1) {
    times = ["21:00"];
  }

  if (/before\s*(meal|food|eating|breakfast|lunch|dinner)/i.test(combined)) {
    meal_relation = "before";
  } else if (/after\s*(meal|food|eating|breakfast|lunch|dinner)/i.test(combined)) {
    meal_relation = "after";
  } else if (/with\s*(meal|food|eating|breakfast|lunch|dinner)/i.test(combined)) {
    meal_relation = "with";
  } else if (/empty\s*stomach/i.test(combined)) {
    meal_relation = "before";
  }

  return { frequency, times, meal_relation };
}

function AddToTrackerButton({ card, memberId }: { card: TrustCardData; memberId?: string }) {
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startConfirmation() {
    setError(null);
    setReviewConfirmed(false);
    setConfirming(true);
  }

  async function handleAdd() {
    if (!reviewConfirmed) return;
    setAdding(true);
    setError(null);
    try {
      const parsed = parseFrequencyFromCard(card);
      const body: Record<string, unknown> = {
        name: card.medicine_name,
        dosage: card.dosage || "",
        frequency: parsed.frequency,
        times: parsed.times,
        meal_relation: parsed.meal_relation,
        notes: card.instructions || "",
        is_active: true,
      };
      if (memberId) body.family_member_id = memberId;

      await apiFetch("/api/v1/medicines", { method: "POST", body: JSON.stringify(body) });
      setAdded(true);
    } catch {
      setError("Could not save this medicine. You can add it manually from Medicines.");
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
        Saved for review
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {confirming ? (
        <div className="w-64 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left shadow-sm" role="alert">
          <p className="text-[11px] font-semibold text-amber-900">Confirm medication record</p>
          <p className="mt-1 text-[10px] leading-relaxed text-amber-800">
            Only save this if it matches advice from a licensed clinician or pharmacist. Saving a record does not prescribe, authorize, or validate a medicine.
          </p>
          <label className="mt-2.5 flex cursor-pointer items-start gap-1.5 text-[10px] leading-relaxed text-amber-900">
            <input
              type="checkbox"
              checked={reviewConfirmed}
              onChange={(event) => setReviewConfirmed(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
            />
            <span>I confirm this matches existing clinician or pharmacist guidance.</span>
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={adding}
              className="rounded-lg px-2 py-1 text-[10px] font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!reviewConfirmed || adding}
              className="rounded-lg bg-amber-700 px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {adding ? "Saving..." : "Save confirmed"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={startConfirmation}
          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-3 py-1.5 text-[11px] font-semibold text-purple-700 transition-all hover:bg-purple-100 hover:text-purple-900"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Save for review
        </button>
      )}
      {error && <p className="max-w-64 text-right text-[10px] text-red-600">{error}</p>}
    </div>
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
  const detailsId = useId();

  return (
    <div className={`rounded-2xl border ${status.border} bg-gradient-to-br ${status.bg} overflow-hidden shadow-md ${status.glow} transition-all hover:shadow-lg`}>
      {/* Header */}
      <div className="relative px-4 py-3.5">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${expanded ? "Collapse" : "Expand"} medication details for ${card.medicine_name}`}
          className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-500"
        />
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
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
        <div id={detailsId} className="space-y-4 border-t border-black/5 bg-white/40 px-4 py-4">
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
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-700">Evidence context</h4>
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
          <div className="flex flex-wrap items-start justify-between gap-3 border-t border-black/5 pt-2">
            <span className="text-[10px] text-gray-400">
              {card.verified ? "Database match found — confirm suitability with a clinician or pharmacist" : "No database match — verify with a pharmacist"}
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
          <p className="text-xs font-bold text-gray-800">Medication context &amp; safety checks</p>
          <p className="text-[10px] text-gray-400">Use this information with clinician or pharmacist guidance</p>
        </div>
      </div>
      {cards.map((card, i) => (
        <MedicineTrustCard key={i} card={card} memberId={memberId} />
      ))}
    </div>
  );
}
