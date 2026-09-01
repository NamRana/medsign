"use client";

import { useRef, useState } from "react";
import type { ImageAnalysis, ObservationDetail } from "@/lib/api";
import AnnotatedImage from "@/components/AnnotatedImage";

const SEVERITY_STRIPE: Record<string, string> = {
  info: "bg-emerald-500",
  mild: "bg-amber-500",
  moderate: "bg-orange-500",
  severe: "bg-red-500",
};

const SEVERITY_BADGE: Record<string, string> = {
  normal: "bg-emerald-50 text-emerald-700",
  mild: "bg-amber-50 text-amber-700",
  moderate: "bg-orange-50 text-orange-700",
  severe: "bg-red-50 text-red-700",
  unknown: "bg-gray-50 text-gray-600",
  info: "bg-emerald-50 text-emerald-700",
};

function SeverityBadge({ severity }: { severity: string }) {
  const color = SEVERITY_BADGE[severity] || SEVERITY_BADGE.unknown;
  return (
    <span className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full capitalize ${color}`}>
      {severity}
    </span>
  );
}

function ConfidenceGauge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    score >= 0.7
      ? "bg-emerald-500"
      : score >= 0.4
        ? "bg-amber-500"
        : "bg-red-500";
  const label = score >= 0.7 ? "High" : score >= 0.4 ? "Medium" : "Low";

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-600">Analysis Confidence</span>
        <span className="text-xs font-semibold text-gray-900">{label} ({pct}%)</span>
      </div>
      <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>Low</span>
        <span>Medium</span>
        <span>High</span>
      </div>
    </div>
  );
}

function PrintIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

interface ImageAnalysisReportProps {
  analysis: ImageAnalysis;
  imageUrl: string;
  imageId?: string;
  mode: "inline" | "full";
  onExpand?: () => void;
  onClose?: () => void;
}

export default function ImageAnalysisReport({
  analysis,
  imageUrl,
  imageId,
  mode,
  onExpand,
  onClose,
}: ImageAnalysisReportProps) {
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const obsRefs = useRef<(HTMLDivElement | null)[]>([]);

  const observations: ObservationDetail[] =
    analysis.observations_detailed && analysis.observations_detailed.length > 0
      ? analysis.observations_detailed
      : analysis.visual_observations.map((obs) => ({
          observation: obs,
          severity: "info" as const,
          region: null,
        }));

  const confidenceScore = analysis.confidence_score ?? 0.5;
  const overallSeverity = analysis.overall_severity ?? "unknown";
  const title = analysis.report_title ?? "Image Analysis Report";
  const specialist = analysis.suggested_specialist ?? "";

  function handleMarkerClick(index: number) {
    setHighlightedIndex(index);
    obsRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setTimeout(() => setHighlightedIndex(null), 2500);
  }

  function handlePrint() {
    window.print();
  }

  const dateStr = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // ── Inline Mode ──────────────────────────────────────────────────────
  if (mode === "inline") {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden max-w-sm">
        {/* Accent bar */}
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />

        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
              <p className="text-[11px] text-gray-400 mt-0.5">{dateStr}</p>
            </div>
            <SeverityBadge severity={overallSeverity} />
          </div>

          {/* Image thumbnail with annotations */}
          {imageUrl && (
            <div className="mb-3">
              <AnnotatedImage
                imageUrl={imageUrl}
                observations={observations}
                highlightedIndex={highlightedIndex}
                onMarkerClick={handleMarkerClick}
              />
            </div>
          )}

          {/* Top 2 observations preview */}
          <div className="space-y-1.5 mb-3">
            {observations.slice(0, 2).map((obs, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white ${SEVERITY_STRIPE[obs.severity] || SEVERITY_STRIPE.info}`}>
                  {i + 1}
                </div>
                <p className="text-xs text-gray-700 leading-snug line-clamp-2">{obs.observation}</p>
              </div>
            ))}
            {observations.length > 2 && (
              <p className="text-[11px] text-gray-400 pl-7">+{observations.length - 2} more observations</p>
            )}
          </div>

          {/* Expand button */}
          <button
            onClick={onExpand}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors"
          >
            <ExpandIcon />
            View Full Report
          </button>
        </div>
      </div>
    );
  }

  // ── Full Mode ────────────────────────────────────────────────────────
  return (
    <div ref={reportRef} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden print:shadow-none print:border-0 print:rounded-none">
      {/* Accent bar */}
      <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 print:bg-emerald-600" />

      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 print:border-gray-300">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 ml-10">
              <span>{dateStr}</span>
              <span>&middot;</span>
              <SeverityBadge severity={overallSeverity} />
            </div>
          </div>
          <div className="flex items-center gap-1 print:hidden">
            <button
              onClick={handlePrint}
              className="p-2 text-gray-400 hover:text-gray-700 rounded-lg transition-colors"
              title="Print report"
            >
              <PrintIcon />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-700 rounded-lg transition-colors"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Annotated Image */}
      {imageUrl && (
        <div className="px-5 py-4 border-b border-gray-100">
          <AnnotatedImage
            imageUrl={imageUrl}
            observations={observations}
            highlightedIndex={highlightedIndex}
            onMarkerClick={handleMarkerClick}
          />
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3">
            {[
              { label: "Info", color: "bg-emerald-500" },
              { label: "Mild", color: "bg-amber-500" },
              { label: "Moderate", color: "bg-orange-500" },
              { label: "Severe", color: "bg-red-500" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                <span className="text-[11px] text-gray-500">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Observations */}
      <div className="px-5 py-4 border-b border-gray-100">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">
          Observations ({observations.length})
        </h4>
        <div className="space-y-2">
          {observations.map((obs, i) => {
            const isActive = highlightedIndex === i;
            return (
              <div
                key={i}
                ref={(el) => { obsRefs.current[i] = el; }}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all duration-300 print:break-inside-avoid ${
                  isActive
                    ? "border-emerald-200 bg-emerald-50/50 shadow-sm"
                    : "border-gray-100 bg-gray-50/50"
                }`}
                onMouseEnter={() => setHighlightedIndex(i)}
                onMouseLeave={() => setHighlightedIndex(null)}
              >
                {/* Severity stripe + number */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${SEVERITY_STRIPE[obs.severity] || SEVERITY_STRIPE.info}`}>
                    {i + 1}
                  </div>
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-relaxed">{obs.observation}</p>
                  <div className="mt-1.5">
                    <SeverityBadge severity={obs.severity} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Relevance & Recommendation */}
      <div className="px-5 py-4 border-b border-gray-100 space-y-3">
        <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
          <h5 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
            Clinical Relevance
          </h5>
          <p className="text-sm text-gray-700 leading-relaxed">{analysis.possible_relevance}</p>
        </div>

        <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
          <h5 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">
            Recommended Action
          </h5>
          <p className="text-sm text-gray-700 leading-relaxed">{analysis.recommendation}</p>
          {specialist && (
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Suggested specialist: {specialist}
              </p>
              <a
                href={`https://www.google.com/maps/search/${encodeURIComponent(specialist + " doctor near me")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors print:hidden"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Find Nearby
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          This is an AI-generated visual observation report, not a medical diagnosis. Image analysis
          is for informational purposes only. Always consult a qualified healthcare professional for
          proper evaluation and treatment decisions.
        </p>
      </div>
    </div>
  );
}
