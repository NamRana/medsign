"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendAudio, type Message } from "@/lib/api";

interface VoiceInputProps {
  conversationId: string | null;
  onTranscriptionComplete: (
    transcript: string,
    userMsg: Message,
    assistantMsg: Message
  ) => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
  onEnsureConversation?: () => Promise<string>;
  disabled: boolean;
}

type RecordingState = "idle" | "recording" | "transcribing" | "error";

export default function VoiceInput({
  conversationId,
  onTranscriptionComplete,
  onRecordingStateChange,
  onEnsureConversation,
  disabled,
}: VoiceInputProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Check browser support on mount
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setIsSupported(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const getPreferredMimeType = useCallback((): string => {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "";
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getPreferredMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start(100); // collect data every 100ms
      setState("recording");
      setDuration(0);
      onRecordingStateChange?.(true);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      const error = err as Error;
      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        setErrorMessage(
          "Microphone access denied. Please allow microphone access in your browser settings."
        );
      } else if (
        error.name === "NotFoundError" ||
        error.name === "DevicesNotFoundError"
      ) {
        setErrorMessage("No microphone found. Please connect a microphone.");
      } else {
        setErrorMessage("Could not start recording. Please try again.");
      }
      setState("error");
    }
  }, [getPreferredMimeType]);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current) return;

    // Stop the timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    onRecordingStateChange?.(false);

    const recorder = mediaRecorderRef.current;

    // Wait for recorder to finish
    const audioBlob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        resolve(blob);
      };
      recorder.stop();
    });

    // Stop the stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Don't send empty recordings
    if (audioBlob.size < 100) {
      setState("idle");
      return;
    }

    setState("transcribing");

    try {
      // Ensure we have a conversation ID (create one if needed)
      let convId = conversationId;
      if (!convId && onEnsureConversation) {
        convId = await onEnsureConversation();
      }
      if (!convId) {
        setErrorMessage("No conversation available. Please send a text message first.");
        setState("error");
        return;
      }

      const response = await sendAudio(convId, audioBlob);
      onTranscriptionComplete(
        response.transcript,
        response.user_message,
        response.assistant_message
      );
      setState("idle");
    } catch {
      setErrorMessage("Could not transcribe audio. Please try again.");
      setState("error");
    }

    setDuration(0);
  }, [conversationId, onTranscriptionComplete, onRecordingStateChange, onEnsureConversation]);

  const handleClick = useCallback(() => {
    if (disabled) return;

    if (state === "recording") {
      stopRecording();
    } else if (state === "idle") {
      startRecording();
    }
  }, [disabled, state, startRecording, stopRecording]);

  const dismissError = useCallback(() => {
    setErrorMessage(null);
    setState("idle");
  }, []);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Hide entirely if browser doesn't support MediaRecorder
  if (!isSupported) return null;

  return (
    <div className="relative">
      {/* Recording / Idle button */}
      {state === "idle" && (
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl text-gray-500 hover:text-blue-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Start voice recording"
          title="Record voice message"
        >
          <MicIcon />
        </button>
      )}

      {state === "recording" && (
        <button
          type="button"
          onClick={handleClick}
          className="flex-shrink-0 h-11 flex items-center gap-2 px-3 rounded-xl bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
          aria-label="Stop recording"
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <span className="text-xs font-medium tabular-nums">
            {formatDuration(duration)}
          </span>
        </button>
      )}

      {state === "transcribing" && (
        <div className="flex-shrink-0 h-11 flex items-center gap-2 px-3 rounded-xl bg-blue-50 border border-blue-200">
          <svg
            className="w-4 h-4 text-blue-500 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
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
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-xs font-medium text-blue-600">
            Transcribing...
          </span>
        </div>
      )}

      {/* Error overlay */}
      {state === "error" && errorMessage && (
        <div className="absolute bottom-14 left-0 z-50 w-64 bg-white rounded-2xl shadow-lg border border-red-100 p-4">
          <p className="text-xs text-red-600 mb-2">{errorMessage}</p>
          <button
            onClick={dismissError}
            className="text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// --- Mic icon SVG ---

function MicIcon() {
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
        d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M19 10v2a7 7 0 01-14 0v-2"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M12 19v4M8 23h8"
      />
    </svg>
  );
}
