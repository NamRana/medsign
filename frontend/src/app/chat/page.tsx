"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { closeConversation, createConversation, getConversation, getImageBlobUrl, sendMessage, type ImageAnalysis, type LabReport, type Message } from "@/lib/api";
import ImageUpload from "@/components/ImageUpload";
import ImageAnalysisReport from "@/components/ImageAnalysisReport";
import VoiceInput from "@/components/VoiceInput";
import LabReportUpload from "@/components/LabReportUpload";
import LabReportView from "@/components/LabReportView";
import MarkdownMessage from "@/components/MarkdownMessage";

function stripMarkdown(text: string): string {
  return text
    .replace(/\|[^\n]+\|/g, "")
    .replace(/[-─]{3,}/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/[>•℞🏥📝⚠️📅🟢🟡🔴⚖️]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function speakText(text: string, onEnd?: () => void): SpeechSynthesisUtterance | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  window.speechSynthesis.cancel();
  const plain = stripMarkdown(text);
  if (!plain) return null;
  const utterance = new SpeechSynthesisUtterance(plain);
  utterance.lang = "en-IN";
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(
    (v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("female")
  ) || voices.find((v) => v.lang.startsWith("en-IN")) || voices.find((v) => v.lang.startsWith("en"));
  if (preferred) utterance.voice = preferred;
  if (onEnd) utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
  return utterance;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  isVoice?: boolean;
  imageAnalysis?: ImageAnalysis;
  analysisImageUrl?: string;
  imageId?: string;
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 items-center py-0.5">
      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "-0.3s" }} />
      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "-0.15s" }} />
      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
    </div>
  );
}

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idFromUrl = searchParams.get("id");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(idFromUrl);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [labReport, setLabReport] = useState<LabReport | null>(null);
  const [expandedReport, setExpandedReport] = useState<{
    analysis: ImageAnalysis;
    imageUrl: string;
    imageId?: string;
  } | null>(null);
  const [isClosed, setIsClosed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  function resetAutoCloseTimer() {
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    if (!activeConversationId || isClosed) return;
    autoCloseTimerRef.current = setTimeout(() => {
      handleEndAssessment(true);
    }, 10 * 60 * 1000);
  }

  useEffect(() => {
    resetAutoCloseTimer();
    return () => { if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current); };
  }, [messages, activeConversationId, isClosed]);

  useEffect(() => {
    if (!idFromUrl) return;
    setIsLoadingHistory(true);
    getConversation(idFromUrl)
      .then(async (data) => {
        setActiveConversationId(data.id);
        if (data.status === "completed" || data.status === "archived") {
          setIsClosed(true);
        }
        if (data.messages && data.messages.length > 0) {
          const restored: ChatMessage[] = [];
          for (const m of data.messages) {
            const meta = m.metadata as Record<string, unknown> | undefined;
            if (meta?.source === "image_analysis" && meta.analysis) {
              const imageId = meta.image_id as string | undefined;
              const imageUrl = imageId ? await getImageBlobUrl(imageId) : undefined;
              restored.push({
                id: m.id,
                role: "assistant",
                content: m.content,
                imageAnalysis: meta.analysis as ImageAnalysis,
                analysisImageUrl: imageUrl ?? undefined,
                imageId: meta.image_id as string | undefined,
              });
            } else {
              restored.push({ id: m.id, role: m.role, content: m.content });
            }
          }
          setMessages(restored);
        }
      })
      .catch(() => setError("Could not load conversation. The backend may be offline."))
      .finally(() => setIsLoadingHistory(false));
  }, [idFromUrl]);

  async function handleSend() {
    const text = inputValue.trim();
    if (!text || isSending) return;

    setInputValue("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setIsSending(true);
    setError(null);

    const tempUserMsg: ChatMessage = { id: `temp-user-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      let convId = activeConversationId;
      if (!convId) {
        const convo = await createConversation();
        convId = convo.id;
        setActiveConversationId(convId);
        window.history.replaceState({}, "", `/chat?id=${convId}`);
      }

      const [savedUser, assistant] = await sendMessage(convId, text);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        { id: savedUser.id, role: "user" as const, content: savedUser.content },
        { id: assistant.id, role: "assistant" as const, content: assistant.content },
      ]);
    } catch {
      setError("Could not send message. The backend may be offline.");
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  function handleImageAnalysis(analysis: ImageAnalysis, imageUrl?: string, imageId?: string) {
    const assistantMsg: ChatMessage = {
      id: `img-analysis-${Date.now()}`,
      role: "assistant",
      content: analysis.recommendation,
      imageAnalysis: analysis,
      analysisImageUrl: imageUrl,
      imageId,
    };
    setMessages((prev) => [...prev, assistantMsg]);
  }

  const toggleSpeak = useCallback((msgId: string, content: string) => {
    if (speakingMsgId === msgId) {
      window.speechSynthesis?.cancel();
      setSpeakingMsgId(null);
      return;
    }
    setSpeakingMsgId(msgId);
    speakText(content, () => setSpeakingMsgId(null));
  }, [speakingMsgId]);

  function handleVoiceTranscription(transcript: string, userMsg: Message, assistantMsg: Message) {
    setIsRecording(false);
    setMessages((prev) => [
      ...prev,
      { id: userMsg.id, role: "user" as const, content: userMsg.content, isVoice: true },
      { id: assistantMsg.id, role: "assistant" as const, content: assistantMsg.content },
    ]);
    setSpeakingMsgId(assistantMsg.id);
    speakText(assistantMsg.content, () => setSpeakingMsgId(null));
  }

  function handleLabReportComplete(report: LabReport) {
    setLabReport(report);
    const abnormalCount = report.values.filter((v) => v.is_abnormal).length;
    const summary = report.interpretation?.summary || "Lab report processed.";
    const userMsg: ChatMessage = { id: `lab-user-${Date.now()}`, role: "user", content: `[Lab report uploaded: ${report.original_filename}]` };
    const assistantMsg: ChatMessage = { id: `lab-analysis-${Date.now()}`, role: "assistant", content: `Lab Report Analysis (${report.values.length} tests, ${abnormalCount} abnormal):\n\n${summary}\n\nTap "View Full Report" below to see all extracted values.` };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
  }

  async function handleEndAssessment(auto = false) {
    if (!activeConversationId || isClosed) return;
    try {
      await closeConversation(activeConversationId);
      setIsClosed(true);
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      if (auto) {
        setMessages((prev) => [
          ...prev,
          { id: `system-close-${Date.now()}`, role: "assistant", content: "This assessment was automatically closed after 10 minutes of inactivity. You can start a new one below." },
        ]);
      }
    } catch {
      setError("Could not close assessment.");
    }
  }

  async function ensureConversation(): Promise<string> {
    if (activeConversationId) return activeConversationId;
    const convo = await createConversation();
    setActiveConversationId(convo.id);
    window.history.replaceState({}, "", `/chat?id=${convo.id}`);
    return convo.id;
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="flex-shrink-0 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-1.5 -ml-1 text-gray-400 hover:text-gray-700 rounded-lg transition-colors"
            aria-label="Back to dashboard"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Health Assessment</p>
            <p className="text-[11px] text-gray-400">AI-powered consultation</p>
          </div>
          {isSending && (
            <span className="text-xs text-emerald-600 font-medium flex-shrink-0 flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Thinking
            </span>
          )}
          {activeConversationId && !isClosed && messages.length > 0 && (
            <button
              onClick={() => handleEndAssessment(false)}
              className="text-xs font-medium text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 transition-colors flex-shrink-0"
            >
              End Assessment
            </button>
          )}
          {isClosed && (
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg flex-shrink-0">
              Completed
            </span>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
          {isLoadingHistory && (
            <div className="flex justify-center py-10">
              <ThinkingDots />
            </div>
          )}

          {!isLoadingHistory && messages.length === 0 && (
            <div className="flex flex-col items-center text-center py-16 px-4">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl flex items-center justify-center mb-5 border border-emerald-100">
                <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-gray-900 mb-1">Start your assessment</h2>
              <p className="text-sm text-gray-500 max-w-xs">
                Describe your symptoms or health concern. I&apos;ll ask focused questions to understand your condition.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {["Headache", "Fever", "Stomach pain", "Skin rash"].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setInputValue(s); inputRef.current?.focus(); }}
                    className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-100 hover:bg-emerald-100 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.imageAnalysis ? (
                <div className="max-w-[90%] sm:max-w-[80%]">
                  <ImageAnalysisReport
                    analysis={msg.imageAnalysis}
                    imageUrl={msg.analysisImageUrl || ""}
                    imageId={msg.imageId}
                    mode="inline"
                    onExpand={() => setExpandedReport({
                      analysis: msg.imageAnalysis!,
                      imageUrl: msg.analysisImageUrl || "",
                      imageId: msg.imageId,
                    })}
                  />
                </div>
              ) : (
                <div className={`rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "max-w-[80%] sm:max-w-[70%] bg-emerald-600 text-white rounded-br-md px-4 py-2.5"
                    : "max-w-[90%] sm:max-w-[85%] bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-md px-4 py-3"
                }`}>
                  {msg.imageUrl && (
                    <img src={msg.imageUrl} alt="Uploaded" className="w-full max-w-[200px] rounded-lg mb-2 border border-white/20" />
                  )}
                  {msg.isVoice && (
                    <span className="inline-flex items-center gap-1 text-xs opacity-75 mb-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2H3v2a9 9 0 004 7.46V22H8a1 1 0 000 2h8a1 1 0 000-2h-3v-2.54A9 9 0 0021 12v-2h-2z" />
                      </svg>
                      Voice
                    </span>
                  )}
                  {msg.role === "assistant" ? (
                    <>
                      <MarkdownMessage content={msg.content} />
                      <div className="flex justify-end mt-1.5 -mb-1">
                        <button
                          onClick={() => toggleSpeak(msg.id, msg.content)}
                          className={`p-1 rounded-md transition-colors ${
                            speakingMsgId === msg.id
                              ? "text-emerald-600 bg-emerald-50"
                              : "text-gray-300 hover:text-gray-500 hover:bg-gray-50"
                          }`}
                          aria-label={speakingMsgId === msg.id ? "Stop speaking" : "Read aloud"}
                          title={speakingMsgId === msg.id ? "Stop" : "Read aloud"}
                        >
                          {speakingMsgId === msg.id ? (
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                              <rect x="6" y="6" width="12" height="12" rx="2" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {isSending && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-gray-100">
                <ThinkingDots />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex-shrink-0 bg-red-50 border-t border-red-100">
          <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-between gap-2">
            <p className="text-xs text-red-600 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="flex-shrink-0 bg-white border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3">
          {isClosed ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <p className="text-sm text-gray-500">This assessment has been completed.</p>
              <button
                onClick={() => { router.push("/chat"); }}
                className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
              >
                Start New Assessment
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <ImageUpload
                  conversationId={activeConversationId}
                  onAnalysisComplete={handleImageAnalysis}
                  disabled={isSending || isLoadingHistory || isRecording}
                />
                <LabReportUpload
                  conversationId={activeConversationId}
                  onUploadComplete={handleLabReportComplete}
                  disabled={isSending || isLoadingHistory || isRecording}
                />
                <VoiceInput
                  conversationId={activeConversationId}
                  onTranscriptionComplete={handleVoiceTranscription}
                  onRecordingStateChange={setIsRecording}
                  onEnsureConversation={ensureConversation}
                  disabled={isSending || isLoadingHistory}
                />
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onInput={handleInput}
                  placeholder={isRecording ? "Recording..." : "Describe your symptoms..."}
                  rows={1}
                  disabled={isSending || isLoadingHistory || isRecording}
                  className="flex-1 resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 disabled:opacity-60 disabled:bg-gray-50 overflow-y-auto transition-all"
                  style={{ minHeight: "44px", maxHeight: "128px" }}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isSending || isLoadingHistory || isRecording}
                  className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  aria-label="Send message"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </div>
              <p className="mt-1.5 text-center text-[11px] text-gray-400">
                Enter to send &middot; Shift+Enter for new line
              </p>
            </>
          )}
        </div>
      </div>

      {/* Lab Report Overlay */}
      {labReport && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <LabReportView report={labReport} onClose={() => setLabReport(null)} />
          </div>
        </div>
      )}

      {/* Image Analysis Report Overlay */}
      {expandedReport && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 print:bg-white print:static print:p-0">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto print:max-h-none print:overflow-visible">
            <ImageAnalysisReport
              analysis={expandedReport.analysis}
              imageUrl={expandedReport.imageUrl}
              imageId={expandedReport.imageId}
              mode="full"
              onClose={() => setExpandedReport(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatContent />
    </Suspense>
  );
}

function ChatContent() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-screen bg-gradient-to-b from-gray-50 to-white items-center justify-center">
          <div className="flex gap-1">
            <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "-0.3s" }} />
            <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "-0.15s" }} />
            <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-bounce" />
          </div>
        </div>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}
