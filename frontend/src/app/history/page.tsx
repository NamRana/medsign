"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, getImageBlobUrl } from "@/lib/api";

interface HistoryItem {
  id: string;
  chief_complaint: string | null;
  status: string;
  risk_level: string | null;
  session_type: string;
  message_count: number;
  image_count: number;
  lab_report_count: number;
  created_at: string;
  ended_at: string | null;
}

interface ImageData {
  id: string;
  storage_path: string;
  mime_type: string;
  analysis: {
    report_title?: string;
    overall_severity?: string;
    visual_observations: string[];
    observations_detailed?: Array<{
      observation: string;
      severity: string;
      region: { label: string; y_min: number; x_min: number; y_max: number; x_max: number } | null;
    }>;
    possible_relevance: string;
    recommendation: string;
    limitations: string[];
    suggested_specialist?: string;
  } | null;
  created_at: string;
}

interface LabValue {
  test_name: string;
  value: string;
  unit: string | null;
  reference_range: string | null;
  is_abnormal: boolean | null;
  abnormality_direction: string | null;
  category: string | null;
}

interface LabInterpretation {
  summary: string;
  abnormal_findings: string[] | null;
  patient_friendly_explanation: string;
  recommendations: string[] | null;
}

interface LabReportData {
  id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  status: string;
  report_date: string | null;
  lab_name: string | null;
  created_at: string;
  values: LabValue[];
  interpretation: LabInterpretation | null;
}

interface HistoryDetail {
  id: string;
  chief_complaint: string | null;
  status: string;
  risk_level: string | null;
  messages: Array<{ role: string; content: string; created_at: string }>;
  symptoms: Array<{ name: string; severity: number | null; duration_days: number | null }>;
  assessment: {
    risk_level: string;
    possible_conditions: Array<{ name?: string }>;
    recommended_actions: Array<{ action?: string; description?: string }>;
    red_flags: string[];
  } | null;
  images: ImageData[];
  lab_reports: LabReportData[];
}

interface DoctorSummary {
  patient_demographics: string;
  chief_complaint: string;
  history_of_present_illness: string;
  symptoms: string[];
  relevant_history: string;
  vitals: string;
  lab_findings: string;
  image_observations: string;
  safety_flags: string[];
  assessment_summary: string;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const styles: Record<string, string> = {
    low: "bg-emerald-50 text-emerald-700 border-emerald-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    high: "bg-orange-50 text-orange-700 border-orange-200",
    critical: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${styles[level] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
      {level}
    </span>
  );
}

export default function HistoryPage() {
  return (
    <Suspense>
      <HistoryContent />
    </Suspense>
  );
}

function HistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<HistoryDetail | null>(null);
  const [doctorSummary, setDoctorSummary] = useState<DoctorSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") || "");
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    setIsLoading(true);
    try {
      let path = "/api/v1/history/?limit=50";
      if (searchQuery) path += `&search=${encodeURIComponent(searchQuery)}`;
      if (riskFilter) path += `&risk_level=${riskFilter}`;
      const data = await apiFetch<HistoryItem[]>(path);
      setItems(data);
    } catch (err: any) { setError(err.message); }
    finally { setIsLoading(false); }
  }

  async function handleSelectItem(id: string) {
    setIsLoadingDetail(true);
    setDoctorSummary(null);
    setShareUrl(null);
    try {
      const detail = await apiFetch<HistoryDetail>(`/api/v1/history/${id}`);
      setSelectedDetail(detail);
      if (detail.images?.length) {
        const urls: Record<string, string> = {};
        await Promise.all(detail.images.map(async (img) => {
          const url = await getImageBlobUrl(img.id);
          if (url) urls[img.id] = url;
        }));
        setImageUrls(urls);
      }
    } catch (err: any) { setError(err.message); }
    finally { setIsLoadingDetail(false); }
  }

  async function handleGenerateSummary() {
    if (!selectedDetail) return;
    setIsLoadingSummary(true);
    try {
      const summary = await apiFetch<DoctorSummary>(`/api/v1/history/${selectedDetail.id}/summary`);
      setDoctorSummary(summary);
    } catch (err: any) { setError(err.message); }
    finally { setIsLoadingSummary(false); }
  }

  async function handleShare() {
    if (!selectedDetail) return;
    try {
      const resp = await apiFetch<{ share_url: string; expires_at: string }>(`/api/v1/history/${selectedDetail.id}/share?hours=48`, { method: "POST" });
      setShareUrl(resp.share_url);
    } catch (err: any) { setError(err.message); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this assessment? This cannot be undone.")) return;
    try {
      await apiFetch(`/api/v1/history/${id}`, { method: "DELETE" });
      setSelectedDetail(null);
      await loadHistory();
    } catch (err: any) { setError(err.message); }
  }

  function handleSearch(e: React.FormEvent) { e.preventDefault(); loadHistory(); }

  const filteredItems = statusFilter ? items.filter((item) => item.status === statusFilter) : items;

  // Detail view
  if (selectedDetail) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        <style>{`
          @keyframes hsFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
          .hs-fade-1 { animation: hsFadeUp 0.5s ease-out both; }
          .hs-fade-2 { animation: hsFadeUp 0.5s ease-out 0.08s both; }
          .hs-fade-3 { animation: hsFadeUp 0.5s ease-out 0.16s both; }
        `}</style>
        <header className="bg-gradient-to-r from-emerald-600 to-teal-600 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 flex items-center gap-3">
            <button onClick={() => setSelectedDetail(null)} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{selectedDetail.chief_complaint || "Assessment"}</p>
              <p className="text-[11px] text-white/60">{formatDate(selectedDetail.messages[0]?.created_at || "")}</p>
            </div>
            <RiskBadge level={selectedDetail.risk_level} />
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-5 sm:px-8 py-8 space-y-6">
          <div className="hs-fade-1 flex gap-2 flex-wrap">
            <button onClick={handleGenerateSummary} disabled={isLoadingSummary} className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-md shadow-emerald-200/40">
              {isLoadingSummary ? "Generating..." : "Doctor Summary"}
            </button>
            <button onClick={handleShare} className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors shadow-sm">
              Share with Doctor
            </button>
            <button onClick={() => handleDelete(selectedDetail.id)} className="px-4 py-2 text-red-600 text-sm font-medium rounded-xl border border-red-200 hover:bg-red-50 transition-colors ml-auto">
              Delete
            </button>
          </div>

          {shareUrl && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
              <p className="text-xs text-emerald-700 font-medium mb-1">Shareable link (48h):</p>
              <code className="text-xs text-emerald-800 break-all">{window.location.origin}{shareUrl}</code>
            </div>
          )}

          {doctorSummary && (
            <div className="bg-white rounded-3xl border border-gray-100 p-7 space-y-5 shadow-md shadow-gray-100/40">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide border-b border-gray-100 pb-2">Clinical Summary</h3>
              {doctorSummary.chief_complaint && <div><p className="text-[11px] font-semibold text-gray-400 uppercase">Chief Complaint</p><p className="text-sm text-gray-800 mt-0.5">{doctorSummary.chief_complaint}</p></div>}
              {doctorSummary.history_of_present_illness && <div><p className="text-[11px] font-semibold text-gray-400 uppercase">History of Present Illness</p><p className="text-sm text-gray-800 mt-0.5">{doctorSummary.history_of_present_illness}</p></div>}
              {doctorSummary.symptoms.length > 0 && <div><p className="text-[11px] font-semibold text-gray-400 uppercase">Symptoms</p><ul className="list-disc list-inside text-sm text-gray-800 mt-0.5">{doctorSummary.symptoms.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
              {doctorSummary.safety_flags.length > 0 && (
                <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                  <p className="text-[11px] font-semibold text-red-600 uppercase">Safety Flags</p>
                  <ul className="list-disc list-inside text-sm text-red-700 mt-1">{doctorSummary.safety_flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
              )}
              {doctorSummary.assessment_summary && (
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                  <p className="text-[11px] font-semibold text-emerald-700 uppercase">AI Assessment</p>
                  <p className="text-sm text-emerald-800 mt-1">{doctorSummary.assessment_summary}</p>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-md shadow-gray-100/40 hover:shadow-lg transition-shadow">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Conversation ({selectedDetail.messages.length} messages)</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {selectedDetail.messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${msg.role === "user" ? "bg-emerald-50 text-emerald-900 border border-emerald-100" : "bg-gray-50 text-gray-800 border border-gray-100"}`}>
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selectedDetail.images && selectedDetail.images.length > 0 && (
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-md shadow-gray-100/40 hover:shadow-lg transition-shadow">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Image Analyses ({selectedDetail.images.length})
              </h3>
              <div className="space-y-3">
                {selectedDetail.images.map((img) => {
                  const severity = img.analysis?.overall_severity || "info";
                  const title = img.analysis?.report_title || "Image Analysis";
                  const observations = img.analysis?.observations_detailed || img.analysis?.visual_observations.map((o) => ({ observation: o, severity: "info" })) || [];
                  const severityStyles: Record<string, string> = {
                    info: "border-l-emerald-400 bg-emerald-50/30",
                    mild: "border-l-amber-400 bg-amber-50/30",
                    moderate: "border-l-orange-400 bg-orange-50/30",
                    severe: "border-l-red-400 bg-red-50/30",
                  };
                  const badgeStyles: Record<string, string> = {
                    info: "bg-emerald-50 text-emerald-700",
                    mild: "bg-amber-50 text-amber-700",
                    moderate: "bg-orange-50 text-orange-700",
                    severe: "bg-red-50 text-red-700",
                  };
                  return (
                    <div key={img.id} className={`border-l-4 rounded-xl p-4 ${severityStyles[severity] || severityStyles.info}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{title}</p>
                          <p className="text-[11px] text-gray-400">{formatDate(img.created_at)}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${badgeStyles[severity] || badgeStyles.info}`}>{severity}</span>
                      </div>
                      {imageUrls[img.id] && (
                        <div className="mb-3 rounded-lg overflow-hidden border border-gray-200">
                          <img src={imageUrls[img.id]} alt="Uploaded medical image" className="w-full max-h-48 object-contain bg-gray-50" />
                        </div>
                      )}
                      <ul className="space-y-1 mb-2">
                        {observations.slice(0, 3).map((obs, i) => (
                          <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                            <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                            {typeof obs === "string" ? obs : obs.observation}
                          </li>
                        ))}
                        {observations.length > 3 && (
                          <li className="text-[11px] text-gray-400 pl-3">+{observations.length - 3} more</li>
                        )}
                      </ul>
                      {img.analysis?.recommendation && (
                        <p className="text-xs text-gray-600 bg-white/60 rounded-lg px-3 py-2">
                          <span className="font-medium text-gray-700">Recommendation:</span> {img.analysis.recommendation}
                        </p>
                      )}
                      {img.analysis?.suggested_specialist && (
                        <div className="flex items-center justify-between mt-1.5">
                          <p className="text-[11px] text-teal-600 font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            Suggested: {img.analysis.suggested_specialist}
                          </p>
                          <a
                            href={`https://www.google.com/maps/search/${encodeURIComponent(img.analysis.suggested_specialist + " doctor near me")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            Find Nearby
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selectedDetail.lab_reports && selectedDetail.lab_reports.length > 0 && (
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-md shadow-gray-100/40 hover:shadow-lg transition-shadow">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Lab Reports ({selectedDetail.lab_reports.length})
              </h3>
              <div className="space-y-3">
                {selectedDetail.lab_reports.map((lab) => {
                  const abnormalCount = lab.values.filter((v) => v.is_abnormal).length;
                  const borderColor = abnormalCount > 2 ? "border-l-red-400 bg-red-50/30" : abnormalCount > 0 ? "border-l-amber-400 bg-amber-50/30" : "border-l-emerald-400 bg-emerald-50/30";
                  return (
                    <div key={lab.id} className={`border-l-4 rounded-xl p-4 ${borderColor}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{lab.original_filename}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {lab.lab_name && <span className="text-[11px] text-gray-500">{lab.lab_name}</span>}
                            <span className="text-[11px] text-gray-400">{formatDate(lab.report_date || lab.created_at)}</span>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${lab.status === "completed" ? "bg-emerald-50 text-emerald-700" : lab.status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                          {lab.status}
                        </span>
                      </div>

                      {lab.values.length > 0 && (
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-400 uppercase text-[10px]">
                                <th className="text-left py-1 pr-3">Test</th>
                                <th className="text-left py-1 pr-3">Value</th>
                                <th className="text-left py-1 pr-3">Reference</th>
                                <th className="text-left py-1">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lab.values.slice(0, 8).map((v, i) => (
                                <tr key={i} className={v.is_abnormal ? "text-amber-800" : "text-gray-700"}>
                                  <td className="py-0.5 pr-3 font-medium">{v.test_name}</td>
                                  <td className="py-0.5 pr-3">{v.value}{v.unit ? ` ${v.unit}` : ""}</td>
                                  <td className="py-0.5 pr-3 text-gray-400">{v.reference_range || "—"}</td>
                                  <td className="py-0.5">
                                    {v.is_abnormal ? (
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${v.abnormality_direction === "high" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                                        {v.abnormality_direction === "high" ? "High" : v.abnormality_direction === "low" ? "Low" : "Abnormal"}
                                      </span>
                                    ) : (
                                      <span className="text-emerald-500 text-[10px]">Normal</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {lab.values.length > 8 && (
                            <p className="text-[11px] text-gray-400 mt-1">+{lab.values.length - 8} more values</p>
                          )}
                        </div>
                      )}

                      {lab.interpretation && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs text-gray-700 bg-white/60 rounded-lg px-3 py-2">
                            {lab.interpretation.patient_friendly_explanation}
                          </p>
                          {lab.interpretation.abnormal_findings && lab.interpretation.abnormal_findings.length > 0 && (
                            <div className="px-3">
                              <p className="text-[11px] font-medium text-amber-700 mb-0.5">Abnormal Findings:</p>
                              <ul className="space-y-0.5">
                                {lab.interpretation.abnormal_findings.map((f, i) => (
                                  <li key={i} className="text-[11px] text-amber-600 flex items-start gap-1">
                                    <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                                    {f}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {lab.interpretation.recommendations && lab.interpretation.recommendations.length > 0 && (
                            <div className="px-3">
                              <p className="text-[11px] font-medium text-gray-600 mb-0.5">Recommendations:</p>
                              <ul className="space-y-0.5">
                                {lab.interpretation.recommendations.map((r, i) => (
                                  <li key={i} className="text-[11px] text-gray-600 flex items-start gap-1">
                                    <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                    {r}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selectedDetail.assessment && (
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-md shadow-gray-100/40 hover:shadow-lg transition-shadow">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Assessment Result</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2"><span className="text-xs text-gray-500">Risk Level:</span><RiskBadge level={selectedDetail.assessment.risk_level} /></div>
                {selectedDetail.assessment.possible_conditions.length > 0 && <div><span className="text-xs text-gray-500">Conditions: </span><span className="text-sm">{selectedDetail.assessment.possible_conditions.map(c => c.name).join(", ")}</span></div>}
                {selectedDetail.assessment.red_flags.length > 0 && <div><span className="text-xs text-red-500">Red flags: </span><span className="text-sm text-red-700">{selectedDetail.assessment.red_flags.join(", ")}</span></div>}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // List view
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <style>{`
        @keyframes hsFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .hs-fade-1 { animation: hsFadeUp 0.5s ease-out both; }
        .hs-fade-2 { animation: hsFadeUp 0.5s ease-out 0.08s both; }
        .hs-fade-3 { animation: hsFadeUp 0.5s ease-out 0.16s both; }
      `}</style>
      <header className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #059669 0%, #0D9488 40%, #0891B2 100%)" }}>
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 25% 75%, white 1px, transparent 1px), radial-gradient(circle at 75% 25%, white 1px, transparent 1px)", backgroundSize: "50px 50px" }} />
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.04] rounded-full -translate-y-1/3 translate-x-1/4" />
        <div className="relative z-10 max-w-3xl mx-auto px-5 sm:px-8 py-6 sm:py-8">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/dashboard")} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Assessment History</h1>
              <p className="text-sm text-white/60 mt-0.5">Past conversations and results</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        <form onSubmit={handleSearch} className="hs-fade-1 flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by complaint..."
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
          >
            <option value="">All status</option>
            <option value="active">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
          >
            <option value="">All risks</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <button type="submit" className="px-4 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-200/40">
            Search
          </button>
        </form>

        {error && (
          <div className="px-4 py-2 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-medium text-red-400 hover:text-red-600">Dismiss</button>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-10">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "-0.3s" }} />
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "-0.15s" }} />
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
            </div>
          </div>
        )}

        {!isLoading && filteredItems.length === 0 && (
          <div className="text-center py-10 bg-white rounded-2xl border border-gray-100">
            <p className="text-sm text-gray-500">No assessments found.</p>
          </div>
        )}

        {filteredItems.length > 0 && (
          <div className="hs-fade-2 space-y-3">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelectItem(item.id)}
                className="w-full text-left bg-white rounded-2xl px-5 py-4 border border-gray-100 hover:border-emerald-200 hover:shadow-lg hover:-translate-y-0.5 transition-all shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.chief_complaint || "General assessment"}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-gray-400">{formatDate(item.created_at)}</span>
                      <span className="text-[11px] text-gray-300">&middot;</span>
                      <span className="text-[11px] text-gray-400">{item.message_count} messages</span>
                      {item.image_count > 0 && (
                        <>
                          <span className="text-[11px] text-gray-300">&middot;</span>
                          <span className="text-[11px] text-teal-500 flex items-center gap-0.5">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            {item.image_count}
                          </span>
                        </>
                      )}
                      {item.lab_report_count > 0 && (
                        <>
                          <span className="text-[11px] text-gray-300">&middot;</span>
                          <span className="text-[11px] text-indigo-500 flex items-center gap-0.5">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            {item.lab_report_count}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <RiskBadge level={item.risk_level} />
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      item.status === "completed" ? "bg-blue-50 text-blue-700" :
                      item.status === "active" ? "bg-emerald-50 text-emerald-700" :
                      "bg-gray-50 text-gray-600"
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
