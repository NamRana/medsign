"use client";

import { useRef, useState } from "react";
import { uploadLabReport, type LabReport } from "@/lib/api";

interface LabReportUploadProps {
  conversationId?: string | null;
  onUploadComplete: (report: LabReport) => void;
  disabled?: boolean;
}

export default function LabReportUpload({
  conversationId,
  onUploadComplete,
  disabled = false,
}: LabReportUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!allowed.includes(file.type)) {
      setError("Please upload a PDF or image file (JPEG, PNG, WebP)");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError("File too large. Maximum 20 MB.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const report = await uploadLabReport(file, conversationId || undefined);
      onUploadComplete(report);
    } catch (err: any) {
      setError(err.message || "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled || isUploading}
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || isUploading}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Upload lab report"
      >
        {isUploading ? (
          <>
            <svg
              className="w-4 h-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Processing...</span>
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span>Lab Report</span>
          </>
        )}
      </button>

      {error && (
        <div className="absolute top-full left-0 mt-1 px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100 whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
}
