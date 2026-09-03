"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/api";
import { sendMessage } from "@/lib/api";

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
  language?: "en" | "hi";
}

type RecordingState = "idle" | "recording" | "transcribing" | "error";

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export default function VoiceInput({
  conversationId,
  onTranscriptionComplete,
  onRecordingStateChange,
  onEnsureConversation,
  disabled,
  language = "en",
}: VoiceInputProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [liveTranscript, setLiveTranscript] = useState("");

  const recognitionRef = useRef<unknown>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalTranscriptRef = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsSupported(false);
      return;
    }
    const SR =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) setIsSupported(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    finalTranscriptRef.current = "";
    setLiveTranscript("");

    const SR =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) {
      setErrorMessage("Speech recognition not supported in this browser.");
      setState("error");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SR as any)();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language === "hi" ? "hi-IN" : "en-IN";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscriptRef.current += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      setLiveTranscript(finalTranscriptRef.current + interim);
    };

    recognition.onerror = (event: { error: string }) => {
      if (event.error === "not-allowed") {
        setErrorMessage("Microphone access denied. Please allow microphone in browser settings.");
      } else if (event.error === "no-speech") {
        setErrorMessage("No speech detected. Please try again.");
      } else {
        setErrorMessage("Voice recognition error. Please try again.");
      }
      setState("error");
      onRecordingStateChange?.(false);
      if (timerRef.current) clearInterval(timerRef.current);
    };

    recognition.onend = () => {
      // Will be handled by stopRecording
    };

    recognitionRef.current = recognition;
    recognition.start();

    setState("recording");
    setDuration(0);
    onRecordingStateChange?.(true);

    timerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  }, [onRecordingStateChange, language]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    onRecordingStateChange?.(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = recognitionRef.current as any;
    if (recognition) {
      recognition.stop();
      recognitionRef.current = null;
    }

    // Wait a tick for final results
    await new Promise((r) => setTimeout(r, 300));

    const transcript = finalTranscriptRef.current.trim() || liveTranscript.trim();
    if (!transcript) {
      setErrorMessage("No speech detected. Please try again.");
      setState("error");
      setDuration(0);
      return;
    }

    setState("transcribing");

    try {
      let convId = conversationId;
      if (!convId && onEnsureConversation) {
        convId = await onEnsureConversation();
      }
      if (!convId) {
        setErrorMessage("No conversation available.");
        setState("error");
        return;
      }

      const [userMsg, assistantMsg] = await sendMessage(convId, transcript, { language });
      onTranscriptionComplete(transcript, userMsg, assistantMsg);
      setState("idle");
    } catch {
      setErrorMessage("Could not send message. Please try again.");
      setState("error");
    }

    setDuration(0);
    setLiveTranscript("");
  }, [conversationId, onTranscriptionComplete, onRecordingStateChange, onEnsureConversation, liveTranscript]);

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

  if (!isSupported) return null;

  return (
    <div className="relative">
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
        <div className="flex items-center gap-2">
          {liveTranscript && (
            <div className="max-w-[160px] text-xs text-gray-500 truncate">
              {liveTranscript}
            </div>
          )}
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
        </div>
      )}

      {state === "transcribing" && (
        <div className="flex-shrink-0 h-11 flex items-center gap-2 px-3 rounded-xl bg-blue-50 border border-blue-200">
          <svg
            className="w-4 h-4 text-blue-500 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-xs font-medium text-blue-600">Sending...</span>
        </div>
      )}

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
