"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLabReports, getLabReport, deleteLabReport, uploadLabReport, type LabReport, type LabReportListItem } from "@/lib/api";
import LabReportView from "@/components/LabReportView";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<LabReportListItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<LabReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadReports(); }, []);

  async function loadReports() {
    try { setReports(await getLabReports()); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : "Could not load reports."); }
    finally { setIsLoading(false); }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      const report = await uploadLabReport(file);
      setSelectedReport(report);
      await loadReports();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Upload failed."); }
    finally { setIsUploading(false); e.target.value = ""; }
  }

  async function handleSelectReport(reportId: string) {
    try { setSelectedReport(await getLabReport(reportId)); }
    catch { setError("Could not load report details."); }
  }

  async function handleDelete(reportId: string) {
    if (!confirm("Delete this lab report? This cannot be undone.")) return;
    try { await deleteLabReport(reportId); setSelectedReport(null); await loadReports(); }
    catch { setError("Could not delete report."); }
  }

  if (selectedReport) {
    return (
      <div className="min-h-screen warm-bg">
        <header className="bg-gradient-to-r from-amber-600 to-orange-600 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 flex items-center gap-3">
            <button onClick={() => setSelectedReport(null)} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">Report Details</p>
              <p className="text-[11px] text-white/60">{selectedReport.original_filename}</p>
            </div>
            <button onClick={() => handleDelete(selectedReport.id)} className="text-xs text-white/80 hover:text-white font-semibold px-3 py-1.5 rounded-xl border border-white/20 hover:bg-white/10 transition-colors">
              Delete
            </button>
          </div>
        </header>
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8">
          <LabReportView report={selectedReport} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen warm-bg">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes rpFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .rp-fade-1 { animation: rpFadeUp 0.5s ease-out both; }
        .rp-fade-2 { animation: rpFadeUp 0.5s ease-out 0.08s both; }
        .rp-fade-3 { animation: rpFadeUp 0.5s ease-out 0.16s both; }
      ` }} />
      <header className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #D97706 0%, #EA580C 40%, #DC2626 100%)" }}>
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle at 25% 75%, white 1px, transparent 1px), radial-gradient(circle at 75% 25%, white 1px, transparent 1px)", backgroundSize: "50px 50px" }} />
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.04] rounded-full -translate-y-1/3 translate-x-1/4" />
        <div className="relative z-10 max-w-3xl mx-auto px-5 sm:px-8 py-6 sm:py-8">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/dashboard")} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Lab Reports</h1>
              <p className="text-sm text-white/60 mt-0.5">Upload and analyze your medical reports</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        {/* Upload area */}
        <div className="rp-fade-1 bg-white rounded-3xl border-2 border-dashed border-amber-200 p-10 text-center hover:border-amber-400 transition-all hover:shadow-lg bg-gradient-to-br from-amber-50/30 to-orange-50/30">
          <input
            type="file"
            id="lab-upload"
            accept=".pdf,image/jpeg,image/png,image/webp"
            onChange={handleFileUpload}
            className="hidden"
            disabled={isUploading}
          />
          <label htmlFor="lab-upload" className={`cursor-pointer flex flex-col items-center gap-3 ${isUploading ? "opacity-50 cursor-wait" : ""}`}>
            {isUploading ? (
              <>
                <div className="w-10 h-10 border-3 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
                <p className="text-sm text-amber-600 font-medium">Processing report...</p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-200/50 rounded-2xl flex items-center justify-center">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-700 font-medium">Upload a lab report</p>
                  <p className="text-xs text-gray-400 mt-0.5">PDF or image (JPEG, PNG, WebP) up to 20 MB</p>
                </div>
              </>
            )}
          </label>
        </div>

        {error && (
          <div className="px-4 py-2.5 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-medium text-red-400 hover:text-red-600">Dismiss</button>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-10">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "-0.3s" }} />
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "-0.15s" }} />
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" />
            </div>
          </div>
        )}

        {!isLoading && reports.length === 0 && (
          <div className="rp-fade-2 text-center py-10 bg-white rounded-3xl shadow-md border border-gray-100">
            <div className="w-14 h-14 bg-gradient-to-br from-amber-100 to-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">No lab reports yet. Upload one to get started.</p>
          </div>
        )}

        {reports.length > 0 && (
          <div className="rp-fade-2 space-y-3">
            {reports.map((report) => (
              <button
                key={report.id}
                onClick={() => handleSelectReport(report.id)}
                className="w-full text-left bg-white rounded-2xl px-5 py-4 border border-gray-100 hover:border-amber-200 hover:shadow-lg hover:-translate-y-0.5 transition-all shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-200/40 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{report.original_filename}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {report.lab_name && <span className="text-[11px] text-gray-500">{report.lab_name}</span>}
                      {report.doctor_name && <span className="text-[11px] text-sky-600 font-medium">{report.doctor_name}</span>}
                      <span className="text-[11px] text-gray-400">{formatDate(report.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {report.abnormal_count > 0 && (
                      <span className="px-2 py-0.5 text-[11px] font-medium text-red-700 bg-red-50 rounded-full border border-red-100">
                        {report.abnormal_count} abnormal
                      </span>
                    )}
                    {report.status === "processing" && (
                      <span className="px-2 py-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-full">Processing</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
