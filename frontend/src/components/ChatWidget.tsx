"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createConversation, sendMessage, checkUsageLimit } from "@/lib/api";
import type { Message } from "@/lib/api";
import MarkdownMessage from "@/components/MarkdownMessage";
import UpgradeModal from "@/components/UpgradeModal";
import BrandLogo from "@/components/BrandLogo";

const ASSESSMENT_PATHS = [
  {
    id: "symptom",
    icon: "✦",
    label: "Symptom review",
    detail: "Share what changed and when it began",
    prompt: "I have a symptom I want to understand",
    inputHint: "Describe the symptom, timing, and anything that makes it better or worse…",
  },
  {
    id: "medicine",
    icon: "◈",
    label: "Medicine guide",
    detail: "Understand a medicine you already take",
    prompt: "Tell me about a medicine I'm taking",
    inputHint: "Enter a medicine name or what you would like to understand…",
  },
  {
    id: "side-effects",
    icon: "!",
    label: "Side-effect check",
    detail: "Explore a possible medicine reaction",
    prompt: "What are the possible side effects of a medicine I am taking?",
    inputHint: "Describe the medicine and what you are noticing…",
  },
  {
    id: "lab-results",
    icon: "⌁",
    label: "Report explainer",
    detail: "Turn lab values into clear questions",
    prompt: "Help me understand my lab results",
    inputHint: "Share a result or upload a clear report image…",
  },
  {
    id: "wellness",
    icon: "○",
    label: "Daily wellbeing",
    detail: "Get practical, general health guidance",
    prompt: "Give me a quick health tip for today",
    inputHint: "What part of your routine would you like to improve?",
  },
  {
    id: "nutrition",
    icon: "↗",
    label: "Nutrition ideas",
    detail: "Build a healthier everyday routine",
    prompt: "Suggest a healthy diet plan for me",
    inputHint: "Tell me about your goal, preferences, or routine…",
  },
] as const;

const FOLLOW_UP_PROMPTS = [
  "Help me organize what to mention to a clinician",
  "What details would be useful to track?",
  "Explain that in simpler language",
] as const;

interface WidgetMessage extends Message {
  imageUrl?: string;
  isImage?: boolean;
}

function getSafetyNotice(message: Message) {
  if (message.role !== "assistant" || !message.metadata) return null;

  const emergency = message.metadata.is_emergency === true || message.metadata.is_emergency === "true";
  const safetyTriggered = message.metadata.safety_triggered === true || message.metadata.safety_triggered === "true";
  const triageLevel = String(message.metadata.triage_level ?? "").toLowerCase();

  if (emergency || triageLevel.includes("emergency")) {
    return {
      label: "Urgent support",
      message: "If this may be an emergency, contact local emergency services or seek urgent in-person care now.",
    };
  }

  if (safetyTriggered || ["urgent", "same_day", "priority"].some((level) => triageLevel.includes(level))) {
    return {
      label: "Care timing note",
      message: "This may need timely clinical attention. If symptoms are worsening or severe, seek in-person care promptly.",
    };
  }

  return null;
}

export default function ChatWidget({ memberId }: { memberId?: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showBadge, setShowBadge] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [usageInfo, setUsageInfo] = useState<{ used: number; limit: number } | null>(null);
  const [activePathId, setActivePathId] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [showCareNote, setShowCareNote] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [showImageConsent, setShowImageConsent] = useState(false);
  const [imageConsentAcknowledged, setImageConsentAcknowledged] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const localMessageSequence = useRef(0);
  const activePath = ASSESSMENT_PATHS.find((path) => path.id === activePathId);
  const userMessageCount = messages.filter((message) => message.role === "user").length;

  function createLocalMessageId(prefix: string) {
    localMessageSequence.current += 1;
    return `${prefix}-${localMessageSequence.current}`;
  }

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") handleClose();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);

  // Lock body scroll on mobile when chat is open
  useEffect(() => {
    if (open) {
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      return () => {
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [open]);

  function handleOpen() {
    setOpen(true);
    setShowBadge(false);
  }

  function handleClose() {
    setOpen(false);
    setShowImageConsent(false);
    setPendingImage(null);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function handlePathSelect(path: (typeof ASSESSMENT_PATHS)[number]) {
    setActivePathId(path.id);
    void handleSend(path.prompt);
  }

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const usage = await checkUsageLimit("assessments");
    if (!usage.allowed) {
      setUsageInfo({ used: usage.used, limit: usage.limit });
      setShowUpgrade(true);
      throw new Error("FREE_LIMIT");
    }
    const convo = await createConversation(memberId);
    setConversationId(convo.id);
    return convo.id;
  }

  async function handleSend(text?: string) {
    const msg = (text || input).trim();
    if (!msg || sending) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setSending(true);

    const userMsg: WidgetMessage = {
      id: createLocalMessageId("temp"),
      conversation_id: conversationId || "",
      role: "user",
      content: msg,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const convoId = await ensureConversation();
      const response = await sendMessage(convoId, msg);
      const assistantMsgs = response.filter((m) => m.role === "assistant");
      setMessages((prev) => [...prev, ...assistantMsgs]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "";
      if (errMsg === "FREE_LIMIT" || errMsg.includes("Free limit reached") || errMsg.includes("Upgrade to Pro")) {
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        if (!showUpgrade) {
          setUsageInfo({ used: 3, limit: 3 });
          setShowUpgrade(true);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: createLocalMessageId("error"),
            conversation_id: conversationId || "",
            role: "assistant",
            content: "Sorry, something went wrong. Please try again.",
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleImageUpload(file: File) {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);

    const previewUrl = URL.createObjectURL(file);
    const userMsg: WidgetMessage = {
      id: createLocalMessageId("image"),
      conversation_id: conversationId || "",
      role: "user",
      content: "Uploaded an image for analysis",
      imageUrl: previewUrl,
      isImage: true,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const convoId = await ensureConversation();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("consent", "true");

      const headers: Record<string, string> = {};
      const { createClient } = await import("@/lib/supabase");
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) headers["Authorization"] = `Bearer ${session.access_token}`;

      const res = await fetch(`/api/v1/images/conversations/${convoId}/images`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const analysis = data.analysis;

      const assistantMsg: WidgetMessage = {
        id: createLocalMessageId("image-response"),
        conversation_id: convoId,
        role: "assistant",
        content: `**Image Analysis**\n\n${analysis.recommendation}\n\n**Observations:** ${analysis.visual_observations?.join(", ") || "None"}\n\n**Possible relevance:** ${analysis.possible_relevance || "N/A"}`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "";
      if (errMsg === "FREE_LIMIT" || errMsg.includes("Free limit reached")) {
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        if (!showUpgrade) {
          setUsageInfo({ used: 3, limit: 3 });
          setShowUpgrade(true);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: createLocalMessageId("image-error"),
            conversation_id: conversationId || "",
            role: "assistant",
            content: "Could not analyze the image. Please try again.",
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setUploading(false);
    }
  }

  function requestImageFile() {
    if (sending || uploading) return;
    fileRef.current?.click();
  }

  function requestImageConsent(file: File) {
    if (!file.type.startsWith("image/")) return;
    setPendingImage(file);
    setImageConsentAcknowledged(false);
    setShowImageConsent(true);
  }

  function confirmImageConsent() {
    if (!pendingImage || !imageConsentAcknowledged) return;
    const image = pendingImage;
    setPendingImage(null);
    setShowImageConsent(false);
    void handleImageUpload(image);
  }

  function cancelImageConsent() {
    setPendingImage(null);
    setShowImageConsent(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) requestImageConsent(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) requestImageConsent(file);
  }

  function handleNewChat() {
    setMessages([]);
    setConversationId(null);
    setActivePathId(null);
    setShowCareNote(false);
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
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  return (
    <>
      {showUpgrade && (
        <UpgradeModal
          feature="assessments"
          used={usageInfo?.used ?? 3}
          limit={usageInfo?.limit ?? 3}
          onClose={() => setShowUpgrade(false)}
        />
      )}
      <style>{`
        @keyframes cw-slideUp {
          from { opacity: 0; transform: translateY(100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cw-slideUpDesktop {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cw-fabIn {
          from { transform: scale(0) rotate(-180deg); }
          to { transform: scale(1) rotate(0); }
        }
        @keyframes cw-msgIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cw-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(20, 184, 166, 0.36); }
          50% { box-shadow: 0 0 0 12px rgba(20, 184, 166, 0); }
        }
        @keyframes cw-orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes cw-gridShift {
          from { background-position: 0 0, 0 0; }
          to { background-position: 36px 36px, -36px -36px; }
        }
        @keyframes cw-scan {
          0%, 100% { transform: translateY(-120%); opacity: 0; }
          16%, 72% { opacity: 0.9; }
          100% { transform: translateY(320%); }
        }
        @keyframes cw-cardIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cw-signal {
          0%, 100% { opacity: 0.45; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.12); }
        }
        .cw-panel-mobile { animation: cw-slideUp 0.35s cubic-bezier(0.32, 0.72, 0, 1) both; }
        .cw-panel-desktop { animation: cw-slideUpDesktop 0.3s ease-out both; }
        .cw-fab { animation: cw-fabIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        .cw-msg { animation: cw-msgIn 0.25s ease-out both; }
        .cw-fab-pulse { animation: cw-pulse 2.5s ease-in-out infinite; }
        .cw-console { isolation: isolate; }
        .cw-header-grid {
          background-image: linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px);
          background-size: 18px 18px;
          mask-image: linear-gradient(to bottom, black, transparent);
          animation: cw-gridShift 12s linear infinite;
        }
        .cw-orbital-core {
          background: radial-gradient(circle at 35% 28%, rgba(255,255,255,0.94) 0 6%, rgba(125, 211, 252, 0.98) 7% 23%, rgba(20, 184, 166, 0.72) 24% 45%, transparent 46%);
          filter: drop-shadow(0 0 12px rgba(103, 232, 249, 0.45));
        }
        .cw-orbit-ring { animation: cw-orbit 11s linear infinite; }
        .cw-orbit-ring-reverse { animation: cw-orbit 16s linear infinite reverse; }
        .cw-signal-dot { animation: cw-signal 1.8s ease-in-out infinite; }
        .cw-empty-orbit { animation: cw-orbit 17s linear infinite; }
        .cw-empty-orbit-reverse { animation: cw-orbit 12s linear infinite reverse; }
        .cw-scan-line { animation: cw-scan 4.6s ease-in-out infinite; }
        .cw-path {
          position: relative;
          overflow: hidden;
          animation: cw-cardIn 0.42s cubic-bezier(0.2, 0.75, 0.25, 1) both;
        }
        .cw-path::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(118deg, transparent 32%, rgba(255,255,255,0.72) 50%, transparent 66%);
          transform: translateX(-135%);
          transition: transform 0.7s ease;
          pointer-events: none;
        }
        .cw-path:hover::after, .cw-path:focus-visible::after { transform: translateX(135%); }
        .cw-path[data-selected="true"] {
          border-color: rgba(13, 148, 136, 0.68);
          background: linear-gradient(135deg, rgba(240, 253, 250, 0.98), rgba(240, 249, 255, 0.98));
          box-shadow: 0 10px 28px rgba(13, 148, 136, 0.14);
        }
        .cw-path-icon {
          background: linear-gradient(135deg, rgba(20, 184, 166, 0.14), rgba(14, 165, 233, 0.16));
          border: 1px solid rgba(45, 212, 191, 0.28);
        }
        .cw-rail {
          background: linear-gradient(112deg, rgba(236, 253, 245, 0.92), rgba(240, 249, 255, 0.94));
          border: 1px solid rgba(45, 212, 191, 0.25);
        }
        .cw-compose {
          box-shadow: 0 -16px 36px rgba(15, 118, 110, 0.035);
        }
        .cw-compose-active {
          border-color: rgba(45, 212, 191, 0.62) !important;
          box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.12), 0 12px 30px rgba(14, 165, 233, 0.08);
        }
        .cw-urgent {
          border: 1px solid rgba(251, 146, 60, 0.35);
          background: linear-gradient(135deg, rgba(255, 247, 237, 0.98), rgba(254, 242, 242, 0.98));
        }
        .cw-scroll::-webkit-scrollbar { width: 6px; }
        .cw-scroll::-webkit-scrollbar-thumb { background: rgba(13, 148, 136, 0.24); border-radius: 999px; }
        @media (prefers-reduced-motion: reduce) {
          .cw-panel-mobile, .cw-panel-desktop, .cw-fab, .cw-msg, .cw-fab-pulse, .cw-header-grid, .cw-orbit-ring, .cw-orbit-ring-reverse, .cw-signal-dot, .cw-empty-orbit, .cw-empty-orbit-reverse, .cw-scan-line, .cw-path { animation: none !important; }
          .cw-path::after { transition: none; }
        }
      `}</style>

      {/* ─── Backdrop (mobile only) ─── */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-[59] sm:hidden"
          onClick={handleClose}
        />
      )}

      {/* ─── Chat Panel ─── */}
      {open && (
        <div
          className={`fixed z-[60] ${dragOver ? "ring-2 ring-teal-400" : ""}
            inset-0 sm:inset-auto sm:bottom-28 sm:right-5
          `}
          role="dialog"
          aria-modal="true"
          aria-label="Care OS assessment assistant"
        >
          <div
            className={`
              cw-console w-full h-full flex flex-col overflow-hidden
              cw-panel-mobile sm:cw-panel-desktop
              sm:w-[448px] sm:max-w-[calc(100vw-40px)] sm:h-[680px] sm:max-h-[calc(100vh-132px)] sm:rounded-[28px]
              sm:shadow-2xl sm:shadow-black/15
            `}
            style={{
              background: "rgba(247, 254, 254, 0.98)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(153, 246, 228, 0.48)",
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {/* ── Header ── */}
            <div
              className="relative overflow-hidden px-4 sm:px-5 pt-[max(env(safe-area-inset-top),12px)] pb-3 sm:py-4 shrink-0"
              style={{ background: "linear-gradient(135deg, #021d26 0%, #075b60 48%, #0a6f97 100%)" }}
            >
              <div aria-hidden="true" className="cw-header-grid absolute inset-0 opacity-70" />
              <div aria-hidden="true" className="absolute -right-14 -top-16 h-40 w-40 rounded-full bg-cyan-300/15 blur-3xl" />
              <div className="relative flex items-center gap-3">
                <button
                  onClick={handleClose}
                  className="sm:hidden p-2 -ml-1 text-white/70 active:text-white active:bg-white/10 rounded-xl transition-colors"
                  aria-label="Close assessment assistant"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="relative h-10 w-10 shrink-0 rounded-2xl border border-white/20 bg-white/10 p-1.5 backdrop-blur-sm">
                  <div aria-hidden="true" className="cw-orbital-core absolute inset-0 rounded-2xl opacity-90" />
                  <div aria-hidden="true" className="cw-orbit-ring absolute -inset-1 rounded-[1.05rem] border border-cyan-200/30 border-t-transparent" />
                  <BrandLogo iconClassName="relative z-10 h-full w-full" showWordmark={false} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] uppercase tracking-[0.18em] text-cyan-100/65 font-semibold">Care OS · guided health intake</p>
                  <h3 className="mt-0.5 text-[15px] sm:text-base font-bold tracking-tight text-white">Assessment Navigator</h3>
                  <div className="flex items-center gap-1.5 mt-1" aria-live="polite">
                    <span className="cw-signal-dot w-1.5 h-1.5 bg-emerald-300 rounded-full" />
                    <span className="text-[10px] text-white/72 font-medium">
                      {sending || uploading ? "Reviewing your context" : activePath ? activePath.label : "Ready when you are"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleNewChat}
                    className="p-2.5 sm:p-2 text-white/50 hover:text-white active:bg-white/10 rounded-xl transition-all"
                    title="New conversation"
                    aria-label="Start a new assessment"
                  >
                    <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <button
                    onClick={handleClose}
                    className="hidden sm:flex p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                    aria-label="Close assessment assistant"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="relative mt-3 flex items-center gap-2" aria-label="Assessment flow">
                {[
                  { label: "Context", active: messages.length === 0 },
                  { label: "Guidance", active: messages.length > 0 },
                  { label: "Next step", active: userMessageCount > 1 },
                ].map((step, index) => (
                  <div key={step.label} className="flex flex-1 items-center gap-1.5 min-w-0">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[8px] font-bold ${step.active ? "border-cyan-100 bg-white text-teal-700" : "border-white/25 text-white/55"}`}>
                      {index + 1}
                    </span>
                    <span className={`truncate text-[9px] font-medium ${step.active ? "text-white" : "text-white/50"}`}>{step.label}</span>
                    {index < 2 && <span className="h-px flex-1 bg-white/15" />}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Messages Area ── */}
            <div className="cw-scroll relative flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-3 sm:space-y-4 bg-gradient-to-b from-teal-50/60 via-slate-50 to-white overscroll-contain">
              {/* Empty State */}
              {messages.length === 0 && (
                <div className="flex min-h-full flex-col px-0.5 pb-1">
                  <div className="relative overflow-hidden rounded-[26px] border border-teal-100 bg-gradient-to-br from-white via-teal-50/70 to-sky-50/80 px-4 pb-4 pt-5 text-center shadow-[0_16px_38px_rgba(13,148,136,0.08)] sm:px-5">
                    <div aria-hidden="true" className="absolute inset-0 opacity-70" style={{ backgroundImage: "radial-gradient(rgba(20,184,166,0.16) 0.75px, transparent 0.75px)", backgroundSize: "12px 12px", maskImage: "linear-gradient(to bottom, black, transparent)" }} />
                    <div aria-hidden="true" className="cw-scan-line absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
                    <div className="relative mx-auto mb-3 flex h-16 w-16 items-center justify-center">
                      <div aria-hidden="true" className="cw-empty-orbit absolute inset-0 rounded-full border border-dashed border-teal-300/70" />
                      <div aria-hidden="true" className="cw-empty-orbit-reverse absolute inset-1.5 rounded-full border border-sky-300/65 border-l-transparent" />
                      <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white bg-white/90 shadow-lg shadow-teal-200/45">
                        <BrandLogo iconClassName="h-8 w-8" showWordmark={false} />
                      </div>
                    </div>
                    <div className="relative mb-2 inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-white/80 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-teal-700">
                      <span className="cw-signal-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Clinical context workspace
                    </div>
                    <h4 className="relative text-lg font-bold tracking-tight text-slate-900">Begin with what you know</h4>
                    <p className="relative mx-auto mt-1.5 max-w-[330px] text-xs leading-relaxed text-slate-500">
                      Choose a guided pathway, share your question, or add a clear photo or report for easier understanding.
                    </p>
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-3 px-1">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal-700">Guided pathways</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">A useful first prompt, tailored by you.</p>
                    </div>
                    <span className="rounded-full bg-teal-100/70 px-2 py-1 text-[9px] font-bold text-teal-700">01 / context</span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    {ASSESSMENT_PATHS.map((path, index) => (
                      <button
                        key={path.id}
                        type="button"
                        data-selected={activePath?.id === path.id}
                        onClick={() => handlePathSelect(path)}
                        className="cw-path group min-h-[84px] rounded-2xl border border-slate-200/80 bg-white p-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-lg hover:shadow-teal-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                        style={{ animationDelay: `${index * 45}ms` }}
                      >
                        <div className="relative flex items-start justify-between gap-2">
                          <span className="cw-path-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold text-teal-700">{path.icon}</span>
                          <svg className="h-3.5 w-3.5 text-slate-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <p className="relative mt-2 text-[11px] font-bold text-slate-700 transition-colors group-hover:text-teal-800">{path.label}</p>
                        <p className="relative mt-0.5 text-[9px] leading-snug text-slate-400">{path.detail}</p>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={requestImageFile}
                    disabled={sending || uploading}
                    className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-cyan-300/85 bg-cyan-50/55 px-3.5 py-3 text-left transition-all hover:border-teal-400 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-cyan-700 shadow-sm">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-bold text-slate-700">Share a photo</span>
                      <span className="mt-0.5 block text-[9px] text-slate-400">Add a clear image to give your question more context.</span>
                    </span>
                    <span className="text-xs font-bold text-teal-600">+</span>
                  </button>

                  <div className="mt-3 rounded-2xl border border-slate-200/75 bg-white/70 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold text-slate-500">Care OS helps you understand and prepare.</p>
                      <button
                        type="button"
                        onClick={() => setShowCareNote((current) => !current)}
                        aria-expanded={showCareNote}
                        className="shrink-0 text-[10px] font-bold text-teal-700 hover:text-teal-800"
                      >
                        {showCareNote ? "Hide note" : "How it works"}
                      </button>
                    </div>
                    {showCareNote && (
                      <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] leading-relaxed text-slate-500">
                        It can explain health information and help you prepare for clinician review. It does not diagnose conditions or make prescription decisions. For urgent symptoms, contact local emergency services.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {messages.length > 0 && (
                <section className="cw-rail rounded-2xl px-3 py-3 shadow-sm" aria-label="Assessment next steps">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-[10px] font-bold text-teal-700 shadow-sm">{String(Math.min(userMessageCount + 1, 9)).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-bold text-slate-700">{activePath?.label || "Open health question"}</p>
                        <p className="text-[9px] text-slate-400">Continue with a clearer next step</p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-teal-200 bg-white/80 px-2 py-1 text-[8px] font-bold uppercase tracking-[0.11em] text-teal-700">Session active</span>
                  </div>
                  <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                    {FOLLOW_UP_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        disabled={sending || uploading}
                        onClick={() => { void handleSend(prompt); }}
                        className="shrink-0 rounded-xl border border-teal-100 bg-white/85 px-2.5 py-2 text-left text-[9px] font-semibold leading-snug text-slate-600 transition-colors hover:border-teal-300 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Drag Overlay (desktop) */}
              {dragOver && (
                <div className="absolute inset-0 z-10 bg-teal-50/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-3xl">
                  <div className="w-16 h-16 bg-teal-100 rounded-2xl flex items-center justify-center mb-3">
                    <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-teal-700">Drop image here</p>
                  <p className="text-xs text-teal-500 mt-1">We&apos;ll analyze it for you</p>
                </div>
              )}

              {/* Message List */}
              {messages.map((msg) => {
                const safetyNotice = getSafetyNotice(msg);

                return (
                <div key={msg.id} className={`flex gap-2 sm:gap-2.5 cw-msg ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <BrandLogo iconClassName="w-6 h-6 sm:w-7 sm:h-7" showWordmark={false} className="shrink-0 mt-1" />
                  )}
                  <div className={`max-w-[82%] sm:max-w-[78%]`}>
                    {safetyNotice && (
                      <div role="status" className="cw-urgent mb-2 rounded-2xl px-3 py-2.5 text-[10px] leading-relaxed text-amber-900 shadow-sm">
                        <div className="flex items-center gap-1.5 font-bold text-amber-800">
                          <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 3c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
                          </svg>
                          {safetyNotice.label}
                        </div>
                        <p className="mt-1">{safetyNotice.message}</p>
                      </div>
                    )}
                    {msg.isImage && msg.imageUrl && (
                      <div className="mb-1.5">
                        <img
                          src={msg.imageUrl}
                          alt="Uploaded"
                          className="w-full max-w-[200px] sm:max-w-[180px] rounded-2xl shadow-md border border-white/20 ml-auto"
                        />
                      </div>
                    )}
                    <div
                      className={`text-sm sm:text-[13px] leading-relaxed ${
                        msg.role === "user"
                          ? "bg-gradient-to-br from-teal-600 to-sky-600 text-white rounded-2xl rounded-tr-md px-4 py-3 shadow-md shadow-teal-200/40"
                          : "bg-white text-gray-700 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-gray-100/80"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <MarkdownMessage content={msg.content} />
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.isImage ? "Shared an image for review" : msg.content}</p>
                      )}
                    </div>
                    <p className={`text-[9px] mt-1 ${msg.role === "user" ? "text-right mr-1 text-gray-300" : "ml-1 text-gray-300"}`}>
                      {msg.role === "user" ? "You" : "Care OS"} &middot; {new Date(msg.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {msg.role === "user" && (
                    <div className="w-6 h-6 sm:w-7 sm:h-7 bg-gradient-to-br from-gray-200 to-gray-300 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-sm">
                      <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
                );
              })}

              {/* Typing indicator */}
              {(sending || uploading) && (
                <div className="flex gap-2 sm:gap-2.5 justify-start cw-msg">
                  <BrandLogo iconClassName="w-6 h-6 sm:w-7 sm:h-7" showWordmark={false} className="shrink-0 mt-1" />
                  <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-gray-100/80" role="status" aria-live="polite">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-sky-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                      <span className="text-xs sm:text-[11px] text-gray-400">{uploading ? "Reviewing image context..." : "Preparing guidance..."}</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Input Area ── */}
            <div className="cw-compose shrink-0 px-3 sm:px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:pb-3 border-t border-gray-100 bg-white/95 backdrop-blur-sm">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <span className="flex min-w-0 items-center gap-1.5 text-[9px] font-semibold text-slate-400">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                  <span className="truncate">{activePath?.label || "Open health question"}</span>
                </span>
                <span className="hidden sm:block text-[9px] text-slate-300">Shift + Enter for a new line</span>
              </div>
              <div className={`flex items-end gap-2 rounded-[18px] border border-transparent p-0.5 transition-all ${inputFocused ? "cw-compose-active" : ""}`}>
                {/* Image Upload */}
                <button
                  onClick={requestImageFile}
                  disabled={sending || uploading}
                  className="flex-shrink-0 w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-400 active:text-teal-600 active:bg-teal-50 hover:text-teal-600 hover:bg-teal-50 hover:border-teal-200 disabled:opacity-40 transition-all"
                  title="Share a photo"
                  aria-label="Share a photo"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>

                {/* Textarea */}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onInput={handleInput}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder={activePath?.inputHint || "Describe what you would like help understanding…"}
                  rows={1}
                  disabled={sending || uploading}
                  aria-label="Ask the Care OS assessment assistant"
                  className="flex-1 resize-none bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 sm:py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-teal-300 focus:bg-white transition-all disabled:opacity-50 overflow-y-auto"
                  style={{ minHeight: "44px", maxHeight: "120px" }}
                />

                {/* Send */}
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || sending || uploading}
                  className="flex-shrink-0 w-11 h-11 sm:w-10 sm:h-10 bg-gradient-to-br from-teal-600 to-sky-600 text-white rounded-xl flex items-center justify-center active:from-teal-700 active:to-sky-700 hover:from-teal-700 hover:to-sky-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-teal-200/40 disabled:shadow-none"
                  aria-label="Send message"
                >
                  <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </div>
              <p className="hidden sm:block text-[9px] text-slate-300 text-center mt-2">
                Health information support, not a diagnosis or prescription decision &middot; For emergencies, contact local services
              </p>
            </div>
          </div>
        </div>
      )}

      {open && showImageConsent && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="widget-image-consent-title" aria-describedby="widget-image-consent-description">
          <div className="w-full max-w-sm rounded-[24px] border border-cyan-100 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 3c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
                </svg>
              </span>
              <div>
                <p id="widget-image-consent-title" className="text-sm font-bold text-slate-900">Before you share a photo</p>
                <p id="widget-image-consent-description" className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  Confirm you have permission to share it. It may contain sensitive health information, and image analysis provides context only—it does not replace a clinician&apos;s assessment.
                </p>
              </div>
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
              <input
                type="checkbox"
                checked={imageConsentAcknowledged}
                onChange={(event) => setImageConsentAcknowledged(event.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              />
              <span>I understand and want to analyze this image.</span>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={cancelImageConsent} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100">
                Cancel
              </button>
              <button type="button" onClick={confirmImageConsent} disabled={!imageConsentAcknowledged} className="rounded-xl bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40">
                Analyze image
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Floating Action Button ─── */}
      <button
        onClick={handleOpen}
        ref={triggerRef}
        className={`fixed bottom-20 sm:bottom-6 right-4 sm:right-5 z-50 transition-all duration-300 ${
          open ? "scale-0 opacity-0 pointer-events-none" : "scale-100 opacity-100"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Open Care OS assessment assistant"
      >
        <div className="relative group cw-fab">
          <div aria-hidden="true" className="absolute -inset-2 rounded-full border border-cyan-300/35 border-l-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 cw-orbit-ring" />
          <div aria-hidden="true" className="absolute inset-0 bg-teal-500 rounded-full opacity-20 blur-lg group-hover:opacity-45 transition-opacity" />
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-teal-500 via-cyan-600 to-blue-600 rounded-full flex items-center justify-center border border-white/30 shadow-2xl shadow-teal-400/40 active:scale-95 hover:scale-105 transition-all duration-200 cw-fab-pulse">
            <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span aria-hidden="true" className="absolute bottom-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-cyan-100 bg-slate-950 text-[8px] font-bold text-cyan-200">✦</span>
          </div>
          {showBadge && (
            <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/70 bg-cyan-50 text-[10px] font-bold text-teal-700 shadow-lg animate-bounce">
              AI
            </span>
          )}
          {/* Tooltip (desktop only) */}
          <div className="hidden sm:block absolute bottom-full left-1/2 -translate-x-1/2 mb-4 px-4 py-2 bg-slate-950/92 backdrop-blur text-white text-xs font-medium rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl">
            Start a guided check-in
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-gray-900/90 rotate-45 -mt-1.5" />
          </div>
        </div>
      </button>
    </>
  );
}
