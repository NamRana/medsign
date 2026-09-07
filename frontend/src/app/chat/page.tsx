"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { apiFetch, closeConversation, createConversation, getConversation, getImageBlobUrl, sendMessage, type ImageAnalysis, type LabReport, type Message } from "@/lib/api";
import MarkdownMessage from "@/components/MarkdownMessage";
import { type TrustCardData } from "@/components/MedicineTrustCard";
import BrandLogo from "@/components/BrandLogo";

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
  const browserLanguage = window.navigator.language;
  utterance.lang = lang === "hi" ? "hi-IN" : browserLanguage.startsWith("en") ? browserLanguage : "en-US";
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const langPrefix = lang === "hi" ? "hi" : "en";
  const preferred = voices.find((v) => v.lang === utterance.lang)
    || voices.find((v) => v.lang.startsWith(langPrefix) && v.name.toLowerCase().includes("female"))
    || voices.find((v) => v.lang.startsWith(langPrefix));
  if (preferred) utterance.voice = preferred;
  if (onEnd) utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
  return utterance;
}

interface SafetySignal {
  isEmergency: boolean;
  safetyTriggered: boolean;
  triageLevel?: string;
  questionType?: string;
}

function getSafetySignal(metadata?: Record<string, unknown>): SafetySignal | undefined {
  if (!metadata) return undefined;
  const triageLevel = typeof metadata.triage_level === "string" ? metadata.triage_level : undefined;
  const questionType = typeof metadata.question_type === "string" ? metadata.question_type : undefined;
  const normalizedTriage = triageLevel?.toLowerCase();
  const isEmergency = metadata.is_emergency === true || normalizedTriage === "critical" || normalizedTriage === "emergency";
  const safetyTriggered = metadata.safety_triggered === true || isEmergency || normalizedTriage === "high" || normalizedTriage === "urgent";

  return isEmergency || safetyTriggered
    ? { isEmergency, safetyTriggered, triageLevel, questionType }
    : undefined;
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
  safetySignal?: SafetySignal;
  questionType?: string;
  sendState?: "failed";
}

function toAssistantChatMessage(message: Message): ChatMessage {
  const metadata = message.metadata as Record<string, unknown> | undefined;
  const entry: ChatMessage = {
    id: message.id,
    role: "assistant",
    content: message.content,
    safetySignal: getSafetySignal(metadata),
    questionType: typeof metadata?.question_type === "string" ? metadata.question_type : undefined,
  };

  if (metadata?.trust_cards && Array.isArray(metadata.trust_cards)) {
    entry.trustCards = metadata.trust_cards as TrustCardData[];
  }

  return entry;
}

const QUICK_REPLIES: Record<string, string[]> = {
  duration: ["It started today", "2–3 days ago", "More than a week ago"],
  severity: ["Mild (1–3/10)", "Moderate (4–6/10)", "Severe (7–10/10)"],
  associated_symptoms: ["No other symptoms", "I also have fever", "I also have nausea"],
  history: ["No relevant history", "I take regular medicines", "I have a chronic condition"],
  vitals: ["I do not have readings", "I can share readings", "My readings are abnormal"],
  lifestyle: ["No recent changes", "There was a recent change", "I would rather describe it"],
  clarification: ["I can share more detail", "Let me explain the timeline", "I have a related question"],
};

const QUICK_SYMPTOMS = [
  { icon: "🤕", label: "Headache", desc: "Head pain or pressure" },
  { icon: "🤒", label: "Fever", desc: "High temperature" },
  { icon: "🤢", label: "Stomach pain", desc: "Nausea or cramps" },
  { icon: "😮‍💨", label: "Breathing issue", desc: "Shortness of breath" },
  { icon: "🦴", label: "Joint pain", desc: "Stiffness or swelling" },
  { icon: "😴", label: "Fatigue", desc: "Tiredness or weakness" },
];

const ASSESSMENT_STARTS = [
  {
    id: "symptoms",
    icon: "✦",
    label: "New symptom",
    title: "Understand what changed",
    description: "Describe how you feel in your own words. Care AI will help organize the timeline and follow-up questions.",
    action: "Start symptom check",
  },
  {
    id: "medicines",
    icon: "◈",
    label: "Medicine context",
    title: "Bring medication context together",
    description: "Ask about a medicine or add an existing prescription so the right details are ready for a clinician review.",
    action: "Ask about a medicine",
  },
  {
    id: "report",
    icon: "⌁",
    label: "Lab report",
    title: "Make a report easier to discuss",
    description: "Upload a report to organize the extracted values and questions worth taking into your care conversation.",
    action: "Add a lab report",
  },
  {
    id: "visual",
    icon: "◌",
    label: "Photo context",
    title: "Add a visual record",
    description: "Attach an image alongside your description to give the assessment more context.",
    action: "Add an image",
  },
] as const;

type AssessmentStartId = (typeof ASSESSMENT_STARTS)[number]["id"];

function AssessmentProgress({ messages, isClosed }: { messages: ChatMessage[]; isClosed: boolean }) {
  const userEntries = messages.filter((message) => message.role === "user").length;
  const currentStage = isClosed ? 3 : userEntries >= 2 ? 2 : userEntries >= 1 ? 1 : 0;
  const stages = ["Start", "Context", "Guidance", "Complete"];
  const helper = isClosed
    ? "Care record complete"
    : currentStage === 0
      ? "Choose a starting point"
      : currentStage === 1
        ? "Building your care context"
        : "Preparing next-step guidance";

  return (
    <div className="care-assessment-progress" aria-label={helper}>
      <div className="care-assessment-progress-meta">
        <span className="care-assessment-progress-live" />
        <span>{helper}</span>
      </div>
      <div className="care-assessment-stages" aria-hidden="true">
        {stages.map((stage, index) => (
          <div key={stage} className={"care-assessment-stage " + (index < currentStage ? "care-assessment-stage-done" : index === currentStage ? "care-assessment-stage-active" : "") }>
            <i />
            <span>{stage}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const [isPreparingTools, setIsPreparingTools] = useState(false);
  const [assessmentStart, setAssessmentStart] = useState<AssessmentStartId>("symptoms");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localMessageSequenceRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const conversationLoadRef = useRef(0);

  function createLocalMessageId(prefix: string) {
    localMessageSequenceRef.current += 1;
    return `${prefix}-${localMessageSequenceRef.current}`;
  }

  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isSending]);

  function handleMessageScroll(event: React.UIEvent<HTMLDivElement>) {
    const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 112;
  }

  useEffect(() => {
    if (!idFromUrl) return;
    const requestId = ++conversationLoadRef.current;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setIsLoadingHistory(true);
    });
    getConversation(idFromUrl)
      .then(async (data) => {
        if (cancelled || requestId !== conversationLoadRef.current) return;
        setActiveConversationId(data.id);
        if (data.status === "completed" || data.status === "archived") {
          setIsClosed(true);
        }
        if (data.messages?.some((message) => (message.metadata as Record<string, unknown> | undefined)?.has_assessment === true)) {
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
                safetySignal: getSafetySignal(meta),
                questionType: typeof meta.question_type === "string" ? meta.question_type : undefined,
              });
            } else {
              const entry: ChatMessage = m.role === "assistant"
                ? toAssistantChatMessage(m)
                : { id: m.id, role: m.role, content: m.content };
              restored.push(entry);
            }
          }
          if (cancelled || requestId !== conversationLoadRef.current) return;
          setMessages(restored);

          // Fetch trust cards for assessment messages that don't have them yet
          const hasAssessmentWithoutCards = restored.some(
            (m) => m.role === "assistant" && !m.trustCards && m.content.includes("| Medicine |")
          );
          if (hasAssessmentWithoutCards && data.id) {
            apiFetch<{ trust_cards: TrustCardData[] }>(`/api/v1/conversations/${data.id}/trust-cards`)
              .then((resp) => {
                if (!cancelled && requestId === conversationLoadRef.current && resp.trust_cards && resp.trust_cards.length > 0) {
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
      .catch(() => {
        if (!cancelled && requestId === conversationLoadRef.current) setError("Could not load conversation. The backend may be offline.");
      })
      .finally(() => {
        if (!cancelled && requestId === conversationLoadRef.current) setIsLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idFromUrl]);

  async function handleSend(text?: string) {
    const content = (text || inputValue).trim();
    if (!content || isSending) return;

    setInputValue("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setIsSending(true);
    setError(null);

    const tempUserMsg: ChatMessage = { id: createLocalMessageId("temp-user"), role: "user", content };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      let convId = activeConversationId;
      if (!convId) {
        convId = await ensureConversation();
      }

      const [savedUser, assistant] = await sendMessage(convId, content, { language: chatLang });
      const assistantEntry = toAssistantChatMessage(assistant);
      const meta = assistant.metadata as Record<string, unknown> | undefined;
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
        setMessages((prev) => prev.map((message) => (
          message.id === tempUserMsg.id ? { ...message, sendState: "failed" } : message
        )));
        setError("Could not send message. Your message is kept below so you can retry it.");
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
      id: createLocalMessageId("img-analysis"),
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
    const meta = assistantMsg.metadata as Record<string, unknown> | undefined;
    if (meta?.has_assessment) {
      setIsClosed(true);
    }
    setMessages((prev) => [
      ...prev,
      { id: userMsg.id, role: "user" as const, content: userMsg.content, isVoice: true },
      toAssistantChatMessage(assistantMsg),
    ]);
  }

  function handleRetryFailedMessage(message: ChatMessage) {
    if (isSending) return;
    setMessages((prev) => prev.filter((entry) => entry.id !== message.id));
    void handleSend(message.content);
  }

  function handleLabReportComplete(report: LabReport) {
    setLabReport(report);
    const abnormalCount = report.values.filter((v) => v.is_abnormal).length;
    const summary = report.interpretation?.summary || "Lab report processed.";
    const userMsg: ChatMessage = { id: createLocalMessageId("lab-user"), role: "user", content: `[Lab report uploaded: ${report.original_filename}]` };
    const assistantMsg: ChatMessage = { id: createLocalMessageId("lab-analysis"), role: "assistant", content: `Lab Report Analysis (${report.values.length} tests, ${abnormalCount} abnormal):\n\n${summary}\n\nTap "View Full Report" below to see all extracted values.` };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
  }

  const handleEndAssessment = useCallback(async (auto = false) => {
    if (!activeConversationId || isClosed) return;
    try {
      await closeConversation(activeConversationId);
      setIsClosed(true);
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      if (auto) {
        setMessages((prev) => [
          ...prev,
          { id: createLocalMessageId("system-close"), role: "assistant", content: "This assessment was automatically closed after 10 minutes of inactivity. You can start a new one below." },
        ]);
      }
    } catch {
      setError("Could not close assessment.");
    }
  }, [activeConversationId, isClosed, setError]);

  const resetAutoCloseTimer = useCallback(() => {
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    if (!activeConversationId || isClosed) return;
    autoCloseTimerRef.current = setTimeout(() => {
      void handleEndAssessment(true);
    }, 10 * 60 * 1000);
  }, [activeConversationId, handleEndAssessment, isClosed]);

  useEffect(() => {
    resetAutoCloseTimer();
    return () => { if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current); };
  }, [messages, resetAutoCloseTimer]);

  useEffect(() => {
    if (!labReport && !expandedReport) return;
    const closeOverlayOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setLabReport(null);
      setExpandedReport(null);
    };
    window.addEventListener("keydown", closeOverlayOnEscape);
    return () => window.removeEventListener("keydown", closeOverlayOnEscape);
  }, [labReport, expandedReport]);

  async function ensureConversation(): Promise<string> {
    if (activeConversationId) return activeConversationId;
    const convo = await createConversation(memberFromUrl || undefined);
    setActiveConversationId(convo.id);
    const memberQ = memberFromUrl ? `&member=${memberFromUrl}` : "";
    window.history.replaceState({}, "", `/chat?id=${convo.id}${memberQ}`);
    return convo.id;
  }

  const selectedAssessmentStart = ASSESSMENT_STARTS.find((item) => item.id === assessmentStart) ?? ASSESSMENT_STARTS[0];

  function handleAssessmentStart() {
    if (assessmentStart === "symptoms") {
      void handleSend("I would like a symptom assessment.");
      return;
    }
    if (assessmentStart === "medicines") {
      void handleSend("I have a question about a medicine or an existing prescription.");
      return;
    }
    void ensureConversation().then(() => setShowTools(true)).catch(() => {
      setError("Could not start a care conversation. Please try again.");
    });
  }

  async function handleToolsToggle() {
    if (showTools) {
      setShowTools(false);
      return;
    }
    setIsPreparingTools(true);
    setError(null);
    try {
      await ensureConversation();
      setShowTools(true);
    } catch {
      setError("Could not prepare a secure care conversation. Please try again.");
    } finally {
      setIsPreparingTools(false);
    }
  }

  function handleNewAssessment() {
    conversationLoadRef.current += 1;
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    window.speechSynthesis?.cancel();
    setMessages([]);
    setInputValue("");
    setActiveConversationId(null);
    setIsClosed(false);
    setIsLoadingHistory(false);
    setIsRecording(false);
    setError(null);
    setLabReport(null);
    setExpandedReport(null);
    setShowTools(false);
    setIsPreparingTools(false);
    setAssessmentStart("symptoms");
    setSpeakingMsgId(null);
    isNearBottomRef.current = true;
    router.replace(memberFromUrl ? `/chat?member=${memberFromUrl}` : "/chat");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  const quickReplies = !isClosed && latestAssistantMessage?.questionType
    ? QUICK_REPLIES[latestAssistantMessage.questionType] ?? []
    : [];

  return (
    <div className="care-os care-grid flex flex-col h-screen">
      <style>{`
        @keyframes careChatSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes careChatPulse { 0% { transform: scale(0.9); opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
        .care-chat-enter { animation: careChatSlideUp 0.3s ease-out both; }
        .care-chat-pulse { animation: careChatPulse 1.5s ease-out infinite; }
        .care-assessment-progress { display: flex; align-items: center; justify-content: space-between; gap: 1rem; border-top: 1px solid rgba(153,246,228,.11); padding: .55rem 0; }
        .care-assessment-progress-meta { display: inline-flex; align-items: center; gap: .45rem; color: rgba(204,251,241,.72); font-size: .57rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
        .care-assessment-progress-live { width: .38rem; height: .38rem; border-radius: 9999px; background: #5eead4; box-shadow: 0 0 0 4px rgba(94,234,212,.1); animation: careChatPulse 1.7s ease-out infinite; }
        .care-assessment-stages { display: flex; align-items: center; min-width: 16rem; }
        .care-assessment-stage { position: relative; display: flex; flex: 1; align-items: center; gap: .32rem; color: rgba(204,251,241,.35); font-size: .55rem; font-weight: 760; letter-spacing: .04em; }
        .care-assessment-stage:not(:last-child)::after { content: ''; position: absolute; left: .7rem; right: -.15rem; top: .25rem; height: 1px; background: rgba(153,246,228,.16); }
        .care-assessment-stage i { position: relative; z-index: 1; width: .52rem; height: .52rem; border: 1px solid rgba(153,246,228,.3); border-radius: 9999px; background: #0a3943; }
        .care-assessment-stage-active { color: #ccfbf1; }.care-assessment-stage-active i { border-color: #5eead4; background: #5eead4; box-shadow: 0 0 0 4px rgba(94,234,212,.1); }.care-assessment-stage-done { color: rgba(204,251,241,.65); }.care-assessment-stage-done i { border-color: #2dd4bf; background: #2dd4bf; }
        .care-intake-console { position: relative; overflow: hidden; border: 1px solid rgba(153,246,228,.45); border-radius: 1.35rem; background: linear-gradient(145deg, rgba(255,255,255,.94), rgba(239,253,250,.82)); box-shadow: 0 20px 42px rgba(8,47,73,.08); }
        .care-intake-console::before { content: ''; position: absolute; inset: 0; opacity: .36; pointer-events: none; background-image: linear-gradient(rgba(13,148,136,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(13,148,136,.08) 1px, transparent 1px); background-size: 24px 24px; mask-image: linear-gradient(135deg, black, transparent 75%); }
        .care-intake-mode { position: relative; min-height: 3.15rem; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: .12rem; padding: .62rem .7rem; border: 1px solid transparent; border-radius: .8rem; color: #6b858a; text-align: left; transition: background .22s ease, border-color .22s ease, transform .22s ease, color .22s ease; }
        .care-intake-mode:hover { background: rgba(240,253,250,.8); color: #0f766e; }.care-intake-mode-active { border-color: rgba(45,212,191,.52); background: white; color: #0f766e; box-shadow: 0 8px 18px rgba(8,47,73,.06); transform: translateY(-1px); }.care-intake-mode strong { font-size: .66rem; }.care-intake-mode small { font-size: .53rem; color: #8ca2a5; }
        .care-intake-detail { position: relative; border-top: 1px solid rgba(153,246,228,.34); background: rgba(255,255,255,.52); padding: .9rem; }.care-intake-detail-icon { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: .66rem; background: linear-gradient(135deg, #d8faf4, #dff1ff); color: #0f766e; font-size: .85rem; font-weight: 850; }.care-intake-detail-title { color: #173b44; font-size: .78rem; font-weight: 820; }.care-intake-detail-copy { color: #6b858a; font-size: .66rem; line-height: 1.45; }.care-intake-action { display: inline-flex; align-items: center; gap: .35rem; border-radius: .65rem; background: linear-gradient(135deg, #0f766e, #0891b2); color: white; padding: .58rem .75rem; font-size: .65rem; font-weight: 780; box-shadow: 0 9px 18px rgba(8,145,178,.17); transition: transform .2s ease, box-shadow .2s ease; }.care-intake-action:hover { transform: translateY(-1px); box-shadow: 0 13px 23px rgba(8,145,178,.25); }
        .care-thinking-detail { display: flex; flex-wrap: wrap; gap: .32rem; margin-top: .55rem; }.care-thinking-detail span { border: 1px solid rgba(153,246,228,.5); border-radius: 9999px; background: rgba(240,253,250,.65); color: #0f766e; padding: .24rem .45rem; font-size: .55rem; font-weight: 720; }
        .care-safety-signal { margin-bottom: .8rem; padding: .72rem; border: 1px solid rgba(245,158,11,.35); border-radius: .8rem; background: linear-gradient(135deg, rgba(255,251,235,.96), rgba(255,247,237,.8)); color: #92400e; }.care-safety-signal-emergency { border-color: rgba(244,63,94,.42); background: linear-gradient(135deg, rgba(255,241,242,.98), rgba(255,247,237,.85)); color: #9f1239; }.care-safety-signal-icon { display: grid; place-items: center; width: 1.2rem; height: 1.2rem; flex: 0 0 auto; border-radius: 9999px; background: currentColor; color: white; font-size: .72rem; font-weight: 900; line-height: 1; }.care-safety-signal-title { font-size: .68rem; font-weight: 850; }.care-safety-signal-copy { margin-top: .16rem; font-size: .63rem; line-height: 1.45; }.care-safety-signal-meta { display: inline-flex; margin-top: .38rem; border: 1px solid currentColor; border-radius: 9999px; padding: .13rem .35rem; font-size: .49rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; opacity: .82; }
        .care-quick-replies { margin: .2rem 0 1rem 2.7rem; padding: .72rem; border: 1px solid rgba(153,246,228,.34); border-radius: 1rem; background: rgba(255,255,255,.68); box-shadow: 0 9px 22px rgba(8,47,73,.04); }.care-quick-replies-label { display: block; margin-bottom: .45rem; color: #82999d; font-size: .52rem; font-weight: 820; letter-spacing: .12em; text-transform: uppercase; }.care-quick-reply { border: 1px solid rgba(45,212,191,.35); border-radius: 9999px; background: rgba(240,253,250,.8); color: #0f766e; padding: .36rem .58rem; font-size: .62rem; font-weight: 730; transition: background .2s ease, border-color .2s ease, transform .2s ease; }.care-quick-reply:hover { border-color: rgba(13,148,136,.55); background: white; transform: translateY(-1px); }.care-quick-reply:disabled { opacity: .55; cursor: not-allowed; }
        @media (max-width: 640px) { .care-assessment-progress { align-items: flex-start; }.care-assessment-progress-meta { white-space: normal; max-width: 9rem; line-height: 1.4; }.care-assessment-stages { min-width: 11.5rem; }.care-assessment-stage span { display: none; }.care-assessment-stage { gap: 0; }.care-assessment-stage:not(:last-child)::after { left: .5rem; }.care-intake-mode { min-height: 3.45rem; }.care-intake-mode small { display: none; } }
        @media (max-width: 640px) { .care-quick-replies { margin-left: 0; }.care-safety-signal { padding: .65rem; } }
        @media (prefers-reduced-motion: reduce) { .care-chat-enter, .care-chat-pulse, .care-assessment-progress-live { animation: none; }.care-intake-mode-active, .care-intake-action:hover, .care-quick-reply:hover { transform: none; } }
      `}</style>

      {showUpgrade && <UpgradeModal feature="assessments" used={3} limit={3} onClose={() => setShowUpgrade(false)} />}

      {/* Premium Header */}
      <header className="flex-shrink-0 relative z-20">
        <div className="care-hero border-b border-white/10 shadow-none">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="flex items-center h-16 gap-3">
              {/* Back */}
              <button
                onClick={() => router.push("/dashboard")}
                className="p-2 -ml-2 text-white/55 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                aria-label="Back to dashboard"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* AI Avatar */}
              <div className="relative">
                <BrandLogo iconClassName="w-10 h-10" showWordmark={false} />
                {isSending && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-teal-300 rounded-full border-2 border-[#0a3540]">
                    <span className="absolute inset-0 bg-teal-300 rounded-full care-chat-pulse" />
                  </span>
                )}
                {!isSending && !isClosed && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-teal-300 rounded-full border-2 border-[#0a3540]" />
                )}
              </div>

              {/* Title */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold text-white">MedSign Care AI</h1>
                  {isSending && (
                    <span className="text-[10px] font-semibold text-teal-100 bg-teal-300/15 border border-teal-200/15 px-2 py-0.5 rounded-full">
                      Analyzing...
                    </span>
                  )}
                  {isClosed && (
                    <span className="text-[10px] font-medium text-white/60 bg-white/10 px-2 py-0.5 rounded-full">
                      Completed
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-teal-100/55 mt-0.5 uppercase tracking-[0.14em] font-semibold">
                  {isClosed ? "Care record complete" : "Secure clinical guidance"}
                </p>
              </div>

              {/* Lang Toggle */}
              <div className="flex items-center bg-black/15 border border-white/10 rounded-xl p-0.5">
                <button
                  onClick={() => setChatLang("en")}
                  className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all ${chatLang === "en" ? "bg-white text-[#0b3540] shadow-sm" : "text-white/50 hover:text-white"}`}
                  aria-pressed={chatLang === "en"}
                >
                  EN
                </button>
                <button
                  onClick={() => setChatLang("hi")}
                  className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all ${chatLang === "hi" ? "bg-white text-[#0b3540] shadow-sm" : "text-white/50 hover:text-white"}`}
                  aria-pressed={chatLang === "hi"}
                >
                  HI
                </button>
              </div>

              {/* End Button */}
              {activeConversationId && !isClosed && messages.length > 0 && (
                <button
                  onClick={() => handleEndAssessment(false)}
                  className="text-[11px] font-semibold text-rose-100 hover:text-white px-3.5 py-2 rounded-xl border border-rose-300/30 hover:bg-rose-400/25 hover:border-rose-200/50 transition-all"
                >
                  End
                </button>
              )}
            </div>
            <AssessmentProgress messages={messages} isClosed={isClosed} />
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div ref={messageScrollRef} onScroll={handleMessageScroll} className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          {/* Loading */}
          {isLoadingHistory && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="care-panel w-12 h-12 rounded-2xl flex items-center justify-center mb-3">
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
            <div className="flex flex-col items-center text-center pt-10 pb-5 px-2">
              {/* AI Avatar Large */}
              <div className="relative mb-7 rounded-[2rem] p-1 bg-gradient-to-br from-teal-200/70 via-white to-sky-200/70 shadow-[0_18px_45px_rgba(8,47,73,0.16)]">
                <BrandLogo iconClassName="w-20 h-20 -rotate-3" showWordmark={false} className="rotate-3" />
                <span className="absolute -bottom-1 -right-1 w-6 h-6 bg-teal-500 rounded-full border-3 border-[#f6fbfb] flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                  </svg>
                </span>
              </div>

              <p className="care-eyebrow !text-teal-700 mb-2">Care OS / Clinical Conversation</p>
              <h2 className="text-2xl font-bold care-section-title mb-2">Your AI care companion is ready.</h2>
              <p className="text-sm text-slate-500 max-w-sm mb-3 leading-relaxed">
                I&apos;ll ask you focused questions to understand your health concern and provide personalized guidance.
              </p>

              {/* Trust Badges */}
              <div className="flex items-center justify-center gap-2 flex-wrap mb-8 mt-1">
                <span className="flex items-center gap-1 text-[10px] text-teal-700 bg-white/70 border border-teal-100 rounded-full px-2.5 py-1">
                  <svg className="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  Private &amp; Secure
                </span>
                <span className="flex items-center gap-1 text-[10px] text-sky-700 bg-white/70 border border-sky-100 rounded-full px-2.5 py-1">
                  <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" /></svg>
                  Guided health context
                </span>
                <span className="flex items-center gap-1 text-[10px] text-violet-700 bg-white/70 border border-violet-100 rounded-full px-2.5 py-1">
                  <svg className="w-3 h-3 text-purple-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                  24/7 Available
                </span>
              </div>

              {/* Guided intake console */}
              <div className="w-full max-w-lg text-left">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.16em] mb-3 text-center">Choose your starting signal</p>
                <div className="care-intake-console">
                  <div className="relative grid grid-cols-2 gap-1 p-1.5">
                    {ASSESSMENT_STARTS.map((start) => (
                      <button
                        key={start.id}
                        type="button"
                        onClick={() => setAssessmentStart(start.id)}
                        className={"care-intake-mode " + (assessmentStart === start.id ? "care-intake-mode-active" : "")}
                        aria-pressed={assessmentStart === start.id}
                      >
                        <strong><span className="mr-1.5 text-teal-500">{start.icon}</span>{start.label}</strong>
                        <small>{start.title}</small>
                      </button>
                    ))}
                  </div>
                  <div className="care-intake-detail">
                    <div className="flex gap-3 items-start">
                      <div className="care-intake-detail-icon">{selectedAssessmentStart.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="care-intake-detail-title">{selectedAssessmentStart.title}</p>
                        <p className="care-intake-detail-copy mt-1">{selectedAssessmentStart.description}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                      <div className="care-thinking-detail" aria-label="Information the assistant can organize">
                        <span>Timeline</span><span>Relevant details</span><span>Next questions</span>
                      </div>
                      <button type="button" onClick={handleAssessmentStart} className="care-intake-action">
                        {selectedAssessmentStart.action}<span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {assessmentStart === "symptoms" && (
                <div className="w-full max-w-lg mt-5">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.16em] mb-3">Or select a common concern</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {QUICK_SYMPTOMS.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => handleSend(`I have ${s.label.toLowerCase()}`)}
                        className="care-module group flex items-center gap-2.5 px-3.5 py-3 rounded-2xl text-left"
                      >
                        <span className="text-xl shrink-0">{s.icon}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 group-hover:text-teal-700 transition-colors">{s.label}</p>
                          <p className="text-[10px] text-slate-400 truncate">{s.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400 mt-6">Or type your concern below. If this feels like an emergency, contact local emergency services now.</p>
            </div>
          )}

          {/* Messages */}
          <div role="log" aria-live="polite" aria-relevant="additions text" aria-label="Care conversation">
          {messages.map((msg, i) => (
            <div key={msg.id} className="care-chat-enter mb-4" style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}>
              {msg.imageAnalysis ? (
                <div className="flex justify-start gap-3">
                  <BrandLogo iconClassName="w-8 h-8" showWordmark={false} className="shrink-0 mt-1" />
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
                    <div className={`bg-gradient-to-br from-[#08716e] to-[#0d5668] text-white rounded-2xl rounded-tr-md px-4 py-3 shadow-lg shadow-teal-900/15 border border-white/10 ${msg.sendState === "failed" ? "ring-1 ring-rose-300" : ""}`}>
                      {msg.imageUrl && (
                        <img src={msg.imageUrl} alt="Uploaded" className="w-full max-w-[200px] rounded-xl mb-2 border border-white/20" />
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-1 mr-1">
                      {msg.sendState === "failed" && (
                        <button
                          type="button"
                          onClick={() => handleRetryFailedMessage(msg)}
                          className="text-[10px] font-semibold text-rose-600 hover:text-rose-700"
                        >
                          Retry
                        </button>
                      )}
                      <p className={`text-[9px] ${msg.sendState === "failed" ? "text-rose-400" : "text-gray-300"}`}>
                        {msg.sendState === "failed" ? "Not sent" : "You"}
                      </p>
                    </div>
                  </div>
                  <div className="w-8 h-8 bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-sm">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="flex justify-start gap-3">
                  <BrandLogo iconClassName="w-8 h-8" showWordmark={false} className="shrink-0 mt-1" />
                  <div className="max-w-[85%] sm:max-w-[80%]">
                    <div className="care-panel rounded-2xl rounded-tl-md px-4 py-3">
                      {msg.safetySignal && (
                        <div className={`care-safety-signal ${msg.safetySignal.isEmergency ? "care-safety-signal-emergency" : ""}`} role="alert">
                          <div className="flex items-start gap-2">
                            <span className="care-safety-signal-icon" aria-hidden="true">!</span>
                            <div>
                              <p className="care-safety-signal-title">
                                {msg.safetySignal.isEmergency ? "Urgent care signal" : "Prompt care may be needed"}
                              </p>
                              <p className="care-safety-signal-copy">
                                {msg.safetySignal.isEmergency
                                  ? "Do not wait for another chat reply. Contact your local emergency service or seek immediate in-person care now."
                                  : "This concern may need prompt in-person medical attention. If symptoms worsen or you feel unsafe, seek urgent care."
                                }
                              </p>
                              {msg.safetySignal.triageLevel && (
                                <span className="care-safety-signal-meta">Clinical priority · {msg.safetySignal.triageLevel}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      <MarkdownMessage content={msg.content} />
                      {msg.trustCards && msg.trustCards.length > 0 && (
                        <MedicineTrustCards cards={msg.trustCards} memberId={memberFromUrl || undefined} />
                      )}
                      {/* Action bar — share only on prescription messages */}
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-teal-50">
                        <button
                          onClick={() => toggleSpeak(msg.id, msg.content)}
                          className={`p-1.5 rounded-lg transition-all ${
                            speakingMsgId === msg.id
                              ? "text-teal-700 bg-teal-50"
                              : "text-slate-300 hover:text-slate-500 hover:bg-slate-50"
                          }`}
                          title={speakingMsgId === msg.id ? "Stop" : "Read aloud"}
                          aria-label={speakingMsgId === msg.id ? "Stop reading message aloud" : "Read message aloud"}
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
          </div>

          {quickReplies.length > 0 && latestAssistantMessage && (
            <div className="care-quick-replies" aria-label="Suggested responses">
              <span className="care-quick-replies-label">Quick reply</span>
              <div className="flex flex-wrap gap-2">
                {quickReplies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => handleSend(reply)}
                    disabled={isSending}
                    className="care-quick-reply"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Typing Indicator */}
          {isSending && (
            <div className="flex justify-start gap-3 care-chat-enter mb-4">
              <BrandLogo iconClassName="w-8 h-8" showWordmark={false} className="shrink-0 mt-1" />
              <div className="care-panel rounded-2xl rounded-tl-md px-5 py-4">
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
      <div className="relative z-10 flex-shrink-0 care-panel border-x-0 border-b-0 rounded-none bg-white/88">
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
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-200 transition-colors"
                >
                  View Insights
                </button>
                <button
                  onClick={handleNewAssessment}
                  className="px-5 py-2.5 bg-gradient-to-r from-[#0b716d] to-[#0b5f73] text-white text-sm font-semibold rounded-xl hover:from-[#095e5b] hover:to-[#094b60] transition-all shadow-lg shadow-teal-900/15"
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
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-teal-100/70">
                  <ImageUpload
                    conversationId={activeConversationId}
                    onAnalysisComplete={handleImageAnalysis}
                    disabled={isSending || isLoadingHistory || isRecording || isPreparingTools}
                  />
                  <LabReportUpload
                    conversationId={activeConversationId}
                    onUploadComplete={handleLabReportComplete}
                    disabled={isSending || isLoadingHistory || isRecording || isPreparingTools || !activeConversationId}
                  />
                  <VoiceInput
                    conversationId={activeConversationId}
                    onTranscriptionComplete={handleVoiceTranscription}
                    onRecordingStateChange={setIsRecording}
                    onEnsureConversation={ensureConversation}
                    disabled={isSending || isLoadingHistory || isPreparingTools}
                    language={chatLang}
                  />
                  <span className="text-[10px] text-slate-400 ml-1">Add images, reports, or a voice note</span>
                </div>
              )}

              <div className="flex items-end gap-2">
                {/* Attachment toggle */}
                <button
                  onClick={() => { void handleToolsToggle(); }}
                  disabled={isPreparingTools}
                  className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                    showTools
                      ? "bg-teal-50 border-teal-200 text-teal-700"
                      : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-white"
                  }`}
                  title="Attach files"
                  aria-label={isPreparingTools ? "Preparing secure attachment tools" : showTools ? "Hide attachment tools" : "Show attachment tools"}
                  aria-expanded={showTools}
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
                    className="w-full resize-none rounded-2xl border border-teal-100 bg-white px-4 py-3 pr-12 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-300 disabled:opacity-50 disabled:bg-slate-100 overflow-y-auto transition-all"
                    style={{ minHeight: "48px", maxHeight: "128px" }}
                  />
                </div>

                {/* Send Button */}
                <button
                  onClick={() => handleSend()}
                  disabled={!inputValue.trim() || isSending || isLoadingHistory || isRecording}
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-[#0b716d] to-[#0b5f73] text-white hover:from-[#095e5b] hover:to-[#094b60] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-teal-900/15 disabled:shadow-none"
                  aria-label="Send message"
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
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Lab report details">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <LabReportView report={labReport} onClose={() => setLabReport(null)} />
          </div>
        </div>
      )}

      {/* Image Analysis Report Overlay */}
      {expandedReport && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 print:bg-white print:static print:p-0" role="dialog" aria-modal="true" aria-label="Image analysis details">
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
        <div className="care-os care-grid flex flex-col h-screen items-center justify-center">
          <div className="care-panel w-12 h-12 rounded-2xl flex items-center justify-center mb-3">
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
