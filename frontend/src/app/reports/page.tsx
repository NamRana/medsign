"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLabReports, getLabReport, deleteLabReport, uploadLabReport, type LabReport, type LabReportListItem } from "@/lib/api";
import LabReportView from "@/components/LabReportView";
import BrandLogo from "@/components/BrandLogo";

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
      <div className="care-os care-grid min-h-screen">
        <header className="care-hero relative sticky top-0 z-20 border-b border-white/10">
          <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 flex items-center gap-3">
            <button onClick={() => setSelectedReport(null)} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <BrandLogo iconClassName="w-9 h-9" showWordmark={false} />
            <div className="flex-1">
              <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-teal-100/60">Clinical signal</p>
              <p className="text-sm font-bold text-white">Report Details</p>
              <p className="text-[11px] text-white/60 truncate max-w-[12rem] sm:max-w-sm">{selectedReport.original_filename}</p>
            </div>
            <button onClick={() => handleDelete(selectedReport.id)} className="text-xs text-rose-100 hover:text-white font-semibold px-3 py-1.5 rounded-xl border border-rose-200/30 hover:bg-rose-400/20 transition-colors">
              Delete
            </button>
          </div>
        </header>
        <div className="care-content max-w-3xl mx-auto px-5 sm:px-8 py-8">
          <div className="care-panel rounded-3xl p-1 sm:p-2">
            <LabReportView report={selectedReport} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="care-os care-grid min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes rpFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .rp-fade-1 { animation: rpFadeUp 0.5s ease-out both; }
        .rp-fade-2 { animation: rpFadeUp 0.5s ease-out 0.08s both; }
        .rp-fade-3 { animation: rpFadeUp 0.5s ease-out 0.16s both; }
      ` }} />
      <header className="care-hero relative border-b border-white/10">
        <div className="relative z-10 max-w-3xl mx-auto px-5 sm:px-8 py-6 sm:py-8">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/dashboard")} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <BrandLogo iconClassName="w-11 h-11" showWordmark={false} />
            <div>
              <p className="care-eyebrow mb-1">Care OS / Document Intelligence</p>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Lab Reports</h1>
              <p className="text-sm text-teal-100/60 mt-0.5">Upload, extract, and track your clinical signals.</p>
            </div>
            <div className="ml-auto hidden sm:flex care-live"><span className="care-live-dot" />secure vault</div>
          </div>
        </div>
      </header>

      <div className="care-content max-w-3xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        {/* Upload area */}
        <div className="rp-fade-1 care-panel rounded-3xl border-teal-200 p-10 text-center hover:border-teal-400 transition-all hover:shadow-lg" style={{ borderStyle: "dashed", borderWidth: 2 }}>
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
                <div className="w-10 h-10 border-3 border-teal-100 border-t-teal-600 rounded-full animate-spin" />
                <p className="text-sm text-teal-700 font-medium">Extracting clinical signals...</p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-gradient-to-br from-teal-400 to-cyan-500 shadow-lg shadow-teal-200/50 rounded-2xl flex items-center justify-center">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-slate-800 font-semibold">Upload a lab report</p>
                  <p className="text-xs text-slate-400 mt-0.5">PDF or image (JPEG, PNG, WebP) up to 20 MB</p>
                </div>
              </>
            )}
          </label>
        </div>

        {error && (
          <div className="care-panel px-4 py-2.5 text-red-600 text-sm rounded-xl border-red-100 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-medium text-red-400 hover:text-red-600">Dismiss</button>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-10">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: "-0.3s" }} />
              <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: "-0.15s" }} />
              <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" />
            </div>
          </div>
        )}

        {!isLoading && reports.length === 0 && (
          <div className="rp-fade-2 care-panel text-center py-10 rounded-3xl">
            <div className="w-14 h-14 bg-gradient-to-br from-teal-100 to-sky-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">No lab reports yet. Upload one to start your signal record.</p>
          </div>
        )}

        {reports.length > 0 && (
          <div className="rp-fade-2 space-y-3">
            {reports.map((report) => (
              <button
                key={report.id}
                onClick={() => handleSelectReport(report.id)}
                className="care-module w-full text-left rounded-2xl px-5 py-4 hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3">
                  <div className="care-module-icon flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-teal-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
