"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { apiFetch, closeConversation, createConversation, getConversation, getImageBlobUrl, sendMessage, type ImageAnalysis, type LabReport, type Message } from "@/lib/api";
import MarkdownMessage from "@/components/MarkdownMessage";
import { type TrustCardData } from "@/components/MedicineTrustCard";

const ImageUpload = dynamic(() => import("@/components/ImageUpload"), { ssr: false });
const ImageAnalysisReport = dynamic(() => import("@/components/ImageAnalysisReport"), { ssr: false });
const VoiceInput = dynamic(() => import("@/components/VoiceInput"), { ssr: false });
const LabReportUpload = dynamic(() => import("@/components/LabReportUpload"), { ssr: false });
const LabReportView = dynamic(() => import("@/components/LabReportView"), { ssr: false });
const MedicineTrustCards = dynamic(() => import("@/components/MedicineTrustCard").then(mod => ({ default: mod.MedicineTrustCards })), { ssr: false });
const UpgradeModal = dynamic(() => import("@/components/UpgradeModal"), { ssr: false });
const ShareReport = dynamic(() => import("@/components/ShareReport"), { ssr: false });

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

function speakText(text: string, lang: "en" | "hi" = "en", onEnd?: () => void): SpeechSynthesisUtterance | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  window.speechSynthesis.cancel();
  const plain = stripMarkdown(text);
  if (!plain) return null;
  const utterance = new SpeechSynthesisUtterance(plain);
  utterance.lang = lang === "hi" ? "hi-IN" : "en-IN";
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const langPrefix = lang === "hi" ? "hi" : "en";
  const preferred = voices.find(
    (v) => v.lang.startsWith(langPrefix) && v.name.toLowerCase().includes("female")
  ) || voices.find((v) => v.lang.startsWith(`${langPrefix}-IN`)) || voices.find((v) => v.lang.startsWith(langPrefix));
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
  trustCards?: TrustCardData[];
}

const QUICK_SYMPTOMS = [
  { icon: "🤕", label: "Headache", desc: "Head pain or pressure" },
  { icon: "🤒", label: "Fever", desc: "High temperature" },
  { icon: "🤢", label: "Stomach pain", desc: "Nausea or cramps" },
  { icon: "😮‍💨", label: "Breathing issue", desc: "Shortness of breath" },
  { icon: "🦴", label: "Joint pain", desc: "Stiffness or swelling" },
  { icon: "😴", label: "Fatigue", desc: "Tiredness or weakness" },
];

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idFromUrl = searchParams.get("id");
  const memberFromUrl = searchParams.get("member");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(idFromUrl);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [chatLang, setChatLang] = useState<"en" | "hi">("en");
  const [labReport, setLabReport] = useState<LabReport | null>(null);
  const [expandedReport, setExpandedReport] = useState<{
    analysis: ImageAnalysis;
    imageUrl: string;
    imageId?: string;
  } | null>(null);
  const [isClosed, setIsClosed] = useState(false);
  const [showTools, setShowTools] = useState(false);

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
              const entry: ChatMessage = { id: m.id, role: m.role, content: m.content };
              if (meta?.trust_cards && Array.isArray(meta.trust_cards)) {
                entry.trustCards = meta.trust_cards as TrustCardData[];
              }
              restored.push(entry);
            }
          }
          setMessages(restored);

          // Fetch trust cards for assessment messages that don't have them yet
          const hasAssessmentWithoutCards = restored.some(
            (m) => m.role === "assistant" && !m.trustCards && m.content.includes("| Medicine |")
          );
          if (hasAssessmentWithoutCards && data.id) {
            apiFetch<{ trust_cards: TrustCardData[] }>(`/api/v1/conversations/${data.id}/trust-cards`)
              .then((resp) => {
                if (resp.trust_cards && resp.trust_cards.length > 0) {
                  setMessages((prev) =>
                    prev.map((msg) => {
                      if (msg.role === "assistant" && !msg.trustCards && msg.content.includes("| Medicine |")) {
                        return { ...msg, trustCards: resp.trust_cards };
                      }
                      return msg;
                    })
                  );
                }
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => setError("Could not load conversation. The backend may be offline."))
      .finally(() => setIsLoadingHistory(false));
  }, [idFromUrl]);

  async function handleSend(text?: string) {
    const content = (text || inputValue).trim();
    if (!content || isSending) return;

    setInputValue("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setIsSending(true);
    setError(null);

    const tempUserMsg: ChatMessage = { id: `temp-user-${Date.now()}`, role: "user", content };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      let convId = activeConversationId;
      if (!convId) {
        const convo = await createConversation(memberFromUrl || undefined);
        convId = convo.id;
        setActiveConversationId(convId);
        const memberQ = memberFromUrl ? `&member=${memberFromUrl}` : "";
        window.history.replaceState({}, "", `/chat?id=${convId}${memberQ}`);
      }

      const [savedUser, assistant] = await sendMessage(convId, content, { language: chatLang });
      const assistantEntry: ChatMessage = { id: assistant.id, role: "assistant" as const, content: assistant.content };
      const meta = assistant.metadata as Record<string, unknown> | undefined;
      if (meta?.trust_cards && Array.isArray(meta.trust_cards)) {
        assistantEntry.trustCards = meta.trust_cards as TrustCardData[];
      }
      if (meta?.has_assessment) {
        setIsClosed(true);
      }
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        { id: savedUser.id, role: "user" as const, content: savedUser.content },
        assistantEntry,
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Free limit reached") || msg.includes("Upgrade to Pro")) {
        setShowUpgrade(true);
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
      } else {
        setError("Could not send message. The backend may be offline.");
      }
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
    speakText(content, chatLang, () => setSpeakingMsgId(null));
  }, [speakingMsgId, chatLang]);

  function handleVoiceTranscription(transcript: string, userMsg: Message, assistantMsg: Message) {
    setIsRecording(false);
    setMessages((prev) => [
      ...prev,
      { id: userMsg.id, role: "user" as const, content: userMsg.content, isVoice: true },
      { id: assistantMsg.id, role: "assistant" as const, content: assistantMsg.content },
    ]);
    setSpeakingMsgId(assistantMsg.id);
    speakText(assistantMsg.content, chatLang, () => setSpeakingMsgId(null));
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
    <div className="flex flex-col h-screen" style={{ background: "var(--warm-cream)" }}>
      <style>{`
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse-ring { 0% { transform: scale(0.9); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
        .msg-enter { animation: fadeSlideUp 0.3s ease-out both; }
        .pulse-ring { animation: pulse-ring 1.5s ease-out infinite; }
      `}</style>

      {showUpgrade && <UpgradeModal feature="assessments" used={3} limit={3} onClose={() => setShowUpgrade(false)} />}

      {/* Premium Header */}
      <header className="flex-shrink-0 relative z-20">
        <div className="warm-header shadow-sm">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="flex items-center h-16 gap-3">
              {/* Back */}
              <button
                onClick={() => router.push("/dashboard")}
                className="p-2 -ml-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* AI Avatar */}
              <div className="relative">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200/50">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                {isSending && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white">
                    <span className="absolute inset-0 bg-emerald-400 rounded-full pulse-ring" />
                  </span>
                )}
                {!isSending && !isClosed && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white" />
                )}
              </div>

              {/* Title */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold text-gray-900">MedSign AI</h1>
                  {isSending && (
                    <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      Analyzing...
                    </span>
                  )}
                  {isClosed && (
                    <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      Completed
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {isClosed ? "Assessment finished" : "Health Assessment"}
                </p>
              </div>

              {/* Lang Toggle */}
              <div className="flex items-center bg-gray-100 rounded-xl p-0.5">
                <button
                  onClick={() => setChatLang("en")}
                  className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all ${chatLang === "en" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                >
                  EN
                </button>
                <button
                  onClick={() => setChatLang("hi")}
                  className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all ${chatLang === "hi" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                >
                  HI
                </button>
              </div>

              {/* End Button */}
              {activeConversationId && !isClosed && messages.length > 0 && (
                <button
                  onClick={() => handleEndAssessment(false)}
                  className="text-[11px] font-semibold text-red-500 hover:text-white px-3.5 py-2 rounded-xl border border-red-200 hover:bg-red-500 hover:border-red-500 transition-all"
                >
                  End
                </button>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          {/* Loading */}
          {isLoadingHistory && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 bg-white rounded-2xl shadow-lg flex items-center justify-center mb-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
              <p className="text-xs text-gray-400">Loading conversation...</p>
            </div>
          )}

          {/* Welcome Screen */}
          {!isLoadingHistory && messages.length === 0 && (
            <div className="flex flex-col items-center text-center pt-8 pb-4 px-2">
              {/* AI Avatar Large */}
              <div className="relative mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 rounded-3xl flex items-center justify-center shadow-xl shadow-emerald-200/50 rotate-3">
                  <svg className="w-10 h-10 text-white -rotate-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <span className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-400 rounded-full border-3 border-gray-50 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                  </svg>
                </span>
              </div>

              <h2 className="text-xl font-bold text-gray-900 mb-2">Hello! I&apos;m your Health Assistant</h2>
              <p className="text-sm text-gray-500 max-w-sm mb-2">
                I&apos;ll ask you focused questions to understand your health concern and provide personalized guidance.
              </p>

              {/* Trust Badges */}
              <div className="flex items-center gap-4 mb-8 mt-1">
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <svg className="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  Private &amp; Secure
                </span>
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" /></svg>
                  Medical-grade AI
                </span>
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <svg className="w-3 h-3 text-purple-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                  24/7 Available
                </span>
              </div>

              {/* Quick Symptom Cards */}
              <div className="w-full max-w-md">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Common symptoms</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {QUICK_SYMPTOMS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => handleSend(`I have ${s.label.toLowerCase()}`)}
                      className="group flex items-center gap-2.5 px-3.5 py-3 bg-white border border-gray-100 rounded-2xl hover:border-emerald-200 hover:bg-emerald-50/50 hover:shadow-md transition-all text-left"
                    >
                      <span className="text-xl shrink-0">{s.icon}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 group-hover:text-emerald-700 transition-colors">{s.label}</p>
                        <p className="text-[10px] text-gray-400 truncate">{s.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-400 mt-6">Or type your concern below</p>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <div key={msg.id} className="msg-enter mb-4" style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}>
              {msg.imageAnalysis ? (
                <div className="flex justify-start gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-sm">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <div className="max-w-[85%] sm:max-w-[80%]">
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
                </div>
              ) : msg.role === "user" ? (
                <div className="flex justify-end gap-3">
                  <div className="max-w-[80%] sm:max-w-[70%]">
                    {msg.isVoice && (
                      <div className="flex justify-end mb-1">
                        <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2H3v2a9 9 0 004 7.46V22H8a1 1 0 000 2h8a1 1 0 000-2h-3v-2.54A9 9 0 0021 12v-2h-2z" />
                          </svg>
                          Voice message
                        </span>
                      </div>
                    )}
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl rounded-tr-md px-4 py-3 shadow-lg shadow-emerald-200/30">
                      {msg.imageUrl && (
                        <img src={msg.imageUrl} alt="Uploaded" className="w-full max-w-[200px] rounded-xl mb-2 border border-white/20" />
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <p className="text-[9px] text-gray-300 text-right mt-1 mr-1">You</p>
                  </div>
                  <div className="w-8 h-8 bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-sm">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="flex justify-start gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-sm">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <div className="max-w-[85%] sm:max-w-[80%]">
                    <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-gray-100/80">
                      <MarkdownMessage content={msg.content} />
                      {msg.trustCards && msg.trustCards.length > 0 && (
                        <MedicineTrustCards cards={msg.trustCards} memberId={memberFromUrl || undefined} />
                      )}
                      {/* Action bar — share only on prescription messages */}
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-50">
                        <button
                          onClick={() => toggleSpeak(msg.id, msg.content)}
                          className={`p-1.5 rounded-lg transition-all ${
                            speakingMsgId === msg.id
                              ? "text-emerald-600 bg-emerald-50"
                              : "text-gray-300 hover:text-gray-500 hover:bg-gray-50"
                          }`}
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
                        {msg.trustCards && msg.trustCards.length > 0 && (
                          <ShareReport content={msg.content} variant="inline" />
                        )}
                      </div>
                    </div>
                    <p className="text-[9px] text-gray-300 mt-1 ml-1">MedSign AI</p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Typing Indicator */}
          {isSending && (
            <div className="flex justify-start gap-3 msg-enter mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-sm">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <div className="bg-white rounded-2xl rounded-tl-md px-5 py-4 shadow-sm border border-gray-100/80">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-emerald-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-emerald-200 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-[11px] text-gray-400 ml-1">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex-shrink-0 bg-red-50 border-t border-red-100">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-red-600">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-[11px] text-red-400 hover:text-red-600 font-semibold transition-colors shrink-0">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="flex-shrink-0 bg-white/80 backdrop-blur-xl border-t border-gray-200/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
          {isClosed ? (
            <div className="flex flex-col items-center gap-3 py-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Assessment completed
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => router.push("/insights")}
                  className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
                >
                  View Insights
                </button>
                <button
                  onClick={() => { window.location.href = "/chat"; }}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all shadow-lg shadow-emerald-200/40"
                >
                  New Assessment
                </button>
              </div>
              {(() => {
                const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
                return lastAssistant ? (
                  <div className="w-full max-w-md mt-2">
                    <ShareReport content={lastAssistant.content} conversationId={activeConversationId} variant="full" />
                  </div>
                ) : null;
              })()}
            </div>
          ) : (
            <>
              {/* Tool Buttons Row */}
              {showTools && (
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
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
                    language={chatLang}
                  />
                  <span className="text-[10px] text-gray-400 ml-1">Upload images, reports, or use voice</span>
                </div>
              )}

              <div className="flex items-end gap-2">
                {/* Attachment toggle */}
                <button
                  onClick={() => setShowTools(!showTools)}
                  className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border transition-all ${
                    showTools
                      ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                      : "bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  }`}
                  title="Attach files"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showTools ? "M6 18L18 6M6 6l12 12" : "M12 4v16m8-8H4"} />
                  </svg>
                </button>

                {/* Text Input */}
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onInput={handleInput}
                    placeholder={isRecording ? "Recording..." : "Describe your symptoms or ask a question..."}
                    rows={1}
                    disabled={isSending || isLoadingHistory || isRecording}
                    className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pr-12 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 focus:bg-white disabled:opacity-50 disabled:bg-gray-100 overflow-y-auto transition-all"
                    style={{ minHeight: "48px", maxHeight: "128px" }}
                  />
                </div>

                {/* Send Button */}
                <button
                  onClick={() => handleSend()}
                  disabled={!inputValue.trim() || isSending || isLoadingHistory || isRecording}
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-200/40 disabled:shadow-none"
                >
                  <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center justify-between mt-2 px-1">
                <p className="text-[10px] text-gray-300">
                  Enter to send &middot; Shift+Enter for new line
                </p>
                <p className="text-[10px] text-gray-300">
                  Powered by MedSign AI
                </p>
              </div>
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
        <div className="flex flex-col h-screen bg-gray-50 items-center justify-center">
          <div className="w-12 h-12 bg-white rounded-2xl shadow-lg flex items-center justify-center mb-3">
            <div className="flex gap-1">
              <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}
