"use client";

import { useRef, useState } from "react";
import { uploadImage, type ImageAnalysis } from "@/lib/api";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface ImageUploadProps {
  conversationId: string | null;
  onAnalysisComplete: (analysis: ImageAnalysis, imageUrl?: string, imageId?: string) => void;
  disabled: boolean;
}

type UploadState = "idle" | "uploading" | "analyzing" | "done" | "error";

export default function ImageUpload({
  conversationId,
  onAnalysisComplete,
  disabled,
}: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleButtonClick() {
    if (disabled || !conversationId) return;
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be selected again
    e.target.value = "";

    // Validate type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setErrorMessage("Please select a JPEG, PNG, or WebP image.");
      setState("error");
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage("Image must be under 10 MB.");
      setState("error");
      return;
    }

    setSelectedFile(file);
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
    setState("uploading");

    if (!conversationId) return;
    try {
      setState("analyzing");
      const response = await uploadImage(conversationId, file, true);
      setState("done");
      onAnalysisComplete(response.analysis, preview, response.id);
      setTimeout(() => reset(), 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setErrorMessage(`Upload failed: ${msg}`);
      setState("error");
    }
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setErrorMessage(null);
    setState("idle");
  }

  return (
    <div className="relative">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Camera button */}
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={disabled || !conversationId}
        className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl text-gray-500 hover:text-blue-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Upload image"
        title={!conversationId ? "Send a message first to start a conversation" : "Upload image"}
      >
        <CameraIcon />
      </button>

      {/* Uploading/Analyzing overlay */}
      {(state === "uploading" || state === "analyzing") && (
        <div className="absolute bottom-14 left-0 z-50 w-64 bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Uploading"
                className="w-10 h-10 rounded-lg object-cover border border-gray-100"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">
                {state === "uploading" ? "Uploading..." : "Analyzing image..."}
              </p>
              <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full animate-pulse"
                  style={{ width: state === "uploading" ? "40%" : "75%" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {state === "error" && (
        <div className="absolute bottom-14 left-0 z-50 w-64 bg-white rounded-2xl shadow-lg border border-red-100 p-4">
          <p className="text-xs text-red-600 mb-2">{errorMessage}</p>
          <button
            onClick={reset}
            className="text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// --- Camera icon SVG ---

function CameraIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}
