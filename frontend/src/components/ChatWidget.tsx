"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createConversation, sendMessage, checkUsageLimit } from "@/lib/api";
import type { Message } from "@/lib/api";
import MarkdownMessage from "@/components/MarkdownMessage";
import UpgradeModal from "@/components/UpgradeModal";

const QUICK_PROMPTS = [
  { icon: "💊", label: "Medicine info", prompt: "Tell me about a medicine I'm taking" },
  { icon: "⚠️", label: "Side effects", prompt: "What are the side effects of" },
  { icon: "💡", label: "Health tip", prompt: "Give me a quick health tip for today" },
  { icon: "🩺", label: "Symptom check", prompt: "I have a symptom I want to check" },
  { icon: "🧪", label: "Lab results", prompt: "Help me understand my lab results" },
  { icon: "🥗", label: "Diet advice", prompt: "Suggest a healthy diet plan for me" },
];

interface WidgetMessage extends Message {
  imageUrl?: string;
  isImage?: boolean;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
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
      id: `temp-${Date.now()}`,
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
            id: `err-${Date.now()}`,
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
      id: `img-${Date.now()}`,
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
        id: `img-resp-${Date.now()}`,
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
            id: `img-err-${Date.now()}`,
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleImageUpload(file);
  }

  function handleNewChat() {
    setMessages([]);
    setConversationId(null);
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
          0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4); }
          50% { box-shadow: 0 0 0 12px rgba(139, 92, 246, 0); }
        }
        .cw-panel-mobile { animation: cw-slideUp 0.35s cubic-bezier(0.32, 0.72, 0, 1) both; }
        .cw-panel-desktop { animation: cw-slideUpDesktop 0.3s ease-out both; }
        .cw-fab { animation: cw-fabIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        .cw-msg { animation: cw-msgIn 0.25s ease-out both; }
        .cw-fab-pulse { animation: cw-pulse 2.5s ease-in-out infinite; }
      `}</style>

      {/* ─── Backdrop (mobile only) ─── */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-[59] sm:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ─── Chat Panel ─── */}
      {open && (
        <div
          className={`fixed z-[60] ${dragOver ? "ring-2 ring-purple-400" : ""}
            inset-0 sm:inset-auto sm:bottom-28 sm:right-5
          `}
        >
          <div
            className={`
              w-full h-full flex flex-col overflow-hidden
              cw-panel-mobile sm:cw-panel-desktop
              sm:w-[420px] sm:max-w-[calc(100vw-40px)] sm:h-[600px] sm:max-h-[calc(100vh-160px)] sm:rounded-3xl
              sm:shadow-2xl sm:shadow-black/15
            `}
            style={{
              background: "rgba(253,251,247,0.98)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {/* ── Header ── */}
            <div
              className="relative px-4 sm:px-5 pt-[max(env(safe-area-inset-top),12px)] pb-3 sm:py-4 shrink-0"
              style={{ background: "linear-gradient(135deg, #7C3AED 0%, #6366F1 40%, #4F46E5 100%)" }}
            >
              <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
              <div className="relative flex items-center gap-3">
                {/* Back/close button (mobile) + Avatar */}
                <button
                  onClick={() => setOpen(false)}
                  className="sm:hidden p-2 -ml-1 text-white/70 active:text-white active:bg-white/10 rounded-xl transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="relative hidden sm:block">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] sm:text-sm font-bold text-white">MedSign Assistant</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-[11px] sm:text-[10px] text-white/70 font-medium">
                      {sending || uploading ? "Processing..." : "Online"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleNewChat}
                    className="p-2.5 sm:p-2 text-white/50 hover:text-white active:bg-white/10 rounded-xl transition-all"
                    title="New conversation"
                  >
                    <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="hidden sm:flex p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* ── Messages Area ── */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-3 sm:space-y-4 bg-gradient-to-b from-gray-50/80 to-white overscroll-contain">
              {/* Empty State */}
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-2">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-3xl flex items-center justify-center mb-4 shadow-sm">
                    <svg className="w-7 h-7 sm:w-8 sm:h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-base font-bold text-gray-800 mb-1">How can I help?</p>
                  <p className="text-xs text-gray-400 mb-5 max-w-[280px]">
                    Ask about medicines, symptoms, health tips, or upload an image for analysis.
                  </p>

                  {/* Quick prompts — horizontal scroll on mobile, grid on desktop */}
                  <div className="w-full sm:hidden">
                    <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 snap-x snap-mandatory no-scrollbar">
                      {QUICK_PROMPTS.map((qp) => (
                        <button
                          key={qp.label}
                          onClick={() => handleSend(qp.prompt)}
                          className="flex items-center gap-2 whitespace-nowrap px-4 py-3 bg-white border border-gray-100 rounded-2xl active:bg-purple-50 active:border-purple-200 transition-all snap-start shrink-0"
                        >
                          <span className="text-lg">{qp.icon}</span>
                          <span className="text-xs font-semibold text-gray-600">{qp.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="hidden sm:grid grid-cols-2 gap-2 w-full">
                    {QUICK_PROMPTS.map((qp) => (
                      <button
                        key={qp.label}
                        onClick={() => handleSend(qp.prompt)}
                        className="group flex items-center gap-2 text-left px-3 py-2.5 bg-white border border-gray-100 rounded-2xl hover:border-purple-200 hover:bg-purple-50/40 hover:shadow-md transition-all"
                      >
                        <span className="text-base shrink-0">{qp.icon}</span>
                        <span className="text-[11px] font-semibold text-gray-600 group-hover:text-purple-700 transition-colors">{qp.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Drag Overlay (desktop) */}
              {dragOver && (
                <div className="absolute inset-0 z-10 bg-purple-50/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-3xl">
                  <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mb-3">
                    <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-purple-700">Drop image here</p>
                  <p className="text-xs text-purple-400 mt-1">We&apos;ll analyze it for you</p>
                </div>
              )}

              {/* Message List */}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 sm:gap-2.5 cw-msg ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 sm:w-7 sm:h-7 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-sm">
                      <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </div>
                  )}
                  <div className={`max-w-[82%] sm:max-w-[78%]`}>
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
                          ? "bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-2xl rounded-tr-md px-4 py-3 shadow-md shadow-purple-200/30"
                          : "bg-white text-gray-700 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-gray-100/80"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <MarkdownMessage content={msg.content} />
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.isImage ? "Sent an image for analysis" : msg.content}</p>
                      )}
                    </div>
                    <p className={`text-[9px] mt-1 ${msg.role === "user" ? "text-right mr-1 text-gray-300" : "ml-1 text-gray-300"}`}>
                      {msg.role === "user" ? "You" : "MedSign"} &middot; {new Date(msg.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
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
              ))}

              {/* Typing indicator */}
              {(sending || uploading) && (
                <div className="flex gap-2 sm:gap-2.5 justify-start cw-msg">
                  <div className="w-6 h-6 sm:w-7 sm:h-7 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-sm">
                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-gray-100/80">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-purple-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-purple-200 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                      <span className="text-xs sm:text-[11px] text-gray-400">{uploading ? "Analyzing image..." : "Thinking..."}</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ── Input Area ── */}
            <div className="shrink-0 px-3 sm:px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:pb-3 border-t border-gray-100 bg-white/95 backdrop-blur-sm">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <div className="flex items-end gap-2">
                {/* Image Upload */}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={sending || uploading}
                  className="flex-shrink-0 w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl bg-gray-50 border border-gray-200 text-gray-400 active:text-purple-600 active:bg-purple-50 hover:text-purple-600 hover:bg-purple-50 hover:border-purple-200 disabled:opacity-40 transition-all"
                  title="Upload image"
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
                  placeholder="Ask about medicines, symptoms..."
                  rows={1}
                  disabled={sending || uploading}
                  className="flex-1 resize-none bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 sm:py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 focus:bg-white transition-all disabled:opacity-50 overflow-y-auto"
                  style={{ minHeight: "44px", maxHeight: "120px" }}
                />

                {/* Send */}
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || sending || uploading}
                  className="flex-shrink-0 w-11 h-11 sm:w-10 sm:h-10 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-xl flex items-center justify-center active:from-purple-600 active:to-indigo-700 hover:from-purple-600 hover:to-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-200/40 disabled:shadow-none"
                >
                  <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </div>
              <p className="hidden sm:block text-[9px] text-gray-300 text-center mt-2">
                Enter to send &middot; Drop or click + to upload images &middot; Powered by MedSign AI
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Floating Action Button ─── */}
      <button
        onClick={handleOpen}
        className={`fixed bottom-20 sm:bottom-6 right-4 sm:right-5 z-50 transition-all duration-300 ${
          open ? "scale-0 opacity-0 pointer-events-none" : "scale-100 opacity-100"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="relative group cw-fab">
          <div className="absolute inset-0 bg-purple-500 rounded-full opacity-20 blur-lg group-hover:opacity-40 transition-opacity" />
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-purple-500 via-indigo-600 to-blue-600 rounded-full flex items-center justify-center shadow-2xl shadow-purple-400/40 active:scale-95 hover:scale-105 transition-all duration-200 cw-fab-pulse">
            <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          {showBadge && (
            <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 w-5 h-5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-lg animate-bounce">
              1
            </span>
          )}
          {/* Tooltip (desktop only) */}
          <div className="hidden sm:block absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-4 py-2 bg-gray-900/90 backdrop-blur text-white text-xs font-medium rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl">
            Ask Health Assistant
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-gray-900/90 rotate-45 -mt-1.5" />
          </div>
        </div>
      </button>
    </>
  );
}
