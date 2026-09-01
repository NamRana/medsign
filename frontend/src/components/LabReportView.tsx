"use client";

import { useEffect, useState } from "react";
import type { LabReport, LabValue } from "@/lib/api";
import { getLabReportFileUrl } from "@/lib/api";

interface LabReportViewProps {
  report: LabReport;
  onClose?: () => void;
}

function CategoryBadge({ category }: { category: string | null }) {
  const colors: Record<string, string> = {
    Hematology: "bg-red-50 text-red-700",
    "Liver Function": "bg-yellow-50 text-yellow-700",
    "Renal Function": "bg-purple-50 text-purple-700",
    Thyroid: "bg-blue-50 text-blue-700",
    "Lipid Profile": "bg-orange-50 text-orange-700",
    Diabetes: "bg-pink-50 text-pink-700",
    "Urine Analysis": "bg-teal-50 text-teal-700",
  };

  const color = colors[category || ""] || "bg-gray-50 text-gray-700";

  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${color}`}>
      {category || "General"}
    </span>
  );
}

function ValueRow({ value }: { value: LabValue }) {
  const isHigh = value.abnormality_direction === "high";
  const isLow = value.abnormality_direction === "low";

  return (
    <tr className={value.is_abnormal ? "bg-red-50/50" : ""}>
      <td className="px-3 py-2 text-sm text-gray-900 font-medium">
        {value.test_name}
      </td>
      <td className="px-3 py-2 text-sm">
        <span
          className={`font-semibold ${
            value.is_abnormal
              ? isHigh
                ? "text-red-600"
                : "text-blue-600"
              : "text-gray-900"
          }`}
        >
          {value.value}
          {value.is_abnormal && (
            <span className="ml-1 text-xs">
              {isHigh ? "↑" : isLow ? "↓" : "!"}
            </span>
          )}
        </span>
        {value.unit && (
          <span className="ml-1 text-xs text-gray-500">{value.unit}</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-gray-500">
        {value.reference_range || "-"}
      </td>
      <td className="px-3 py-2">
        <CategoryBadge category={value.category} />
      </td>
    </tr>
  );
}

export default function LabReportView({ report, onClose }: LabReportViewProps) {
  const abnormalValues = report.values.filter((v) => v.is_abnormal);
  const normalValues = report.values.filter((v) => !v.is_abnormal);
  const [tab, setTab] = useState<"original" | "analysis">("original");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const isPdf = report.mime_type === "application/pdf";
  const isImage = report.mime_type.startsWith("image/");

  useEffect(() => {
    let revoke: string | null = null;
    setFileLoading(true);
    getLabReportFileUrl(report.id).then((url) => {
      setFileUrl(url);
      revoke = url;
      setFileLoading(false);
    });
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [report.id]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            Lab Report Analysis
          </h3>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
            <span>{report.original_filename}</span>
            {report.lab_name && (
              <>
                <span>&middot;</span>
                <span>{report.lab_name}</span>
              </>
            )}
            {report.report_date && (
              <>
                <span>&middot;</span>
                <span>{report.report_date}</span>
              </>
            )}
            {report.doctor_name && (
              <>
                <span>&middot;</span>
                <span className="text-sky-600 font-medium">{report.doctor_name}</span>
              </>
            )}
          </div>
          {report.lab_address && (
            <p className="text-[11px] text-gray-400 mt-0.5">{report.lab_address}</p>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Tab Toggle */}
      <div className="px-5 pt-3 pb-0 border-b border-gray-100">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab("original")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === "original"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Original Report
            </span>
          </button>
          <button
            onClick={() => setTab("analysis")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === "analysis"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
              AI Analysis
            </span>
          </button>
        </div>
      </div>

      {/* Status */}
      {report.status === "processing" && (
        <div className="px-5 py-3 bg-blue-50 text-blue-700 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Processing your lab report...
        </div>
      )}

      {report.status === "failed" && (
        <div className="px-5 py-3 bg-red-50 text-red-700 text-sm">
          Failed to process this report. Please try uploading again.
        </div>
      )}

      {/* ── Original Report Tab ──────────────────────────────────────────── */}
      {tab === "original" && (
        <div className="p-4">
          {fileLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-10 h-10 border-3 border-gray-200 border-t-amber-500 rounded-full animate-spin mx-auto" />
                <p className="mt-3 text-sm text-gray-400">Loading report...</p>
              </div>
            </div>
          )}
          {!fileLoading && !fileUrl && (
            <div className="flex items-center justify-center py-20 text-center">
              <div>
                <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                </div>
                <p className="text-sm text-gray-500">Could not load the original file</p>
                <p className="text-xs text-gray-400 mt-1">The file may have been removed from storage</p>
              </div>
            </div>
          )}
          {!fileLoading && fileUrl && isPdf && (
            <iframe
              src={fileUrl}
              className="w-full rounded-xl border border-gray-200"
              style={{ height: "80vh", minHeight: 500 }}
              title="Lab Report PDF"
            />
          )}
          {!fileLoading && fileUrl && isImage && (
            <div className="flex justify-center bg-gray-50 rounded-xl p-4 border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl}
                alt="Lab Report"
                className="max-w-full max-h-[80vh] rounded-lg shadow-sm object-contain"
              />
            </div>
          )}
          {!fileLoading && fileUrl && !isPdf && !isImage && (
            <div className="text-center py-16">
              <p className="text-sm text-gray-500">Preview not available for this file type</p>
              <a href={fileUrl} download={report.original_filename} className="mt-3 inline-block text-sm font-semibold text-amber-600 hover:text-amber-700">
                Download File
              </a>
            </div>
          )}
        </div>
      )}

      {/* ── AI Analysis Tab ──────────────────────────────────────────────── */}
      {tab === "analysis" && (
        <>
          {/* Interpretation */}
          {report.interpretation && (
            <div className="px-5 py-4 border-b border-gray-100">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Summary</h4>
              <p className="text-sm text-gray-700 leading-relaxed">
                {report.interpretation.summary}
              </p>

              {report.interpretation.abnormal_findings.length > 0 && (
                <div className="mt-3">
                  <h5 className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">
                    Abnormal Findings
                  </h5>
                  <ul className="space-y-1">
                    {report.interpretation.abnormal_findings.map((finding, i) => (
                      <li key={i} className="text-sm text-red-700 flex items-start gap-1.5">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                        {finding}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3">
                <h5 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  What This Means
                </h5>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {report.interpretation.patient_friendly_explanation}
                </p>
              </div>

              {report.interpretation.recommendations.length > 0 && (
                <div className="mt-3">
                  <h5 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">
                    Recommendations
                  </h5>
                  <ul className="space-y-1">
                    {report.interpretation.recommendations.map((rec, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Values Table */}
          {report.values.length > 0 && (
            <div className="px-5 py-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">
                Extracted Values ({report.values.length} tests)
                {abnormalValues.length > 0 && (
                  <span className="ml-2 text-xs font-medium text-red-600">
                    {abnormalValues.length} abnormal
                  </span>
                )}
              </h4>

              <div className="overflow-x-auto -mx-5">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Test
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Result
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Reference
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Category
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {abnormalValues.map((v) => (
                      <ValueRow key={v.id} value={v} />
                    ))}
                    {normalValues.map((v) => (
                      <ValueRow key={v.id} value={v} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!report.interpretation && report.values.length === 0 && report.status === "completed" && (
            <div className="px-5 py-12 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <p className="text-sm text-gray-500 font-medium">No test values could be extracted</p>
              <button onClick={() => setTab("original")} className="mt-3 text-sm text-amber-600 font-semibold hover:text-amber-700 transition-colors">
                View Original Report
              </button>
            </div>
          )}
        </>
      )}

      {/* Disclaimer */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
        <p className="text-xs text-gray-500">
          This analysis is AI-generated and for informational purposes only.
          Always consult a qualified healthcare professional for medical advice.
        </p>
      </div>
    </div>
  );
}
