"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";


interface ReviewDetail {
  assessment: {
    id: string;
    risk_level: string;
    possible_conditions: Array<{ name?: string; probability?: number }>;
    recommended_actions: Array<{ action?: string; description?: string }>;
    red_flags: string[];
    confidence_score: number | null;
    raw_ai_output: string | null;
    model_used: string | null;
    reviewed_by: string | null;
    metadata: Record<string, any> | null;
    created_at: string;
  };
  conversation: {
    chief_complaint: string | null;
    status: string;
    metadata: Record<string, any>;
  };
  messages: Array<{
    role: string;
    content: string;
    created_at: string;
  }>;
  symptoms: Array<{
    name: string;
    severity: number | null;
    duration_days: number | null;
    body_location: string | null;
  }>;
  safety_events: Array<{
    event_type: string;
    severity: string;
    description: string;
    created_at: string;
  }>;
}

type Verdict = "correct" | "needs_improvement" | "unsafe" | "missing_red_flag";

export default function ReviewDetailPage() {
  const router = useRouter();
  const params = useParams();
  const assessmentId = params.id as string;

  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVerdict, setSelectedVerdict] = useState<Verdict | null>(null);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!assessmentId) return;
    apiFetch<ReviewDetail>(`/api/v1/admin/reviews/${assessmentId}`)
      .then(setDetail)
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [assessmentId]);

  async function handleSubmitReview() {
    if (!selectedVerdict) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/admin/reviews/${assessmentId}`, {
        method: "POST",
        body: JSON.stringify({ verdict: selectedVerdict, notes: notes || null }),
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex gap-1">
          <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "-0.3s" }} />
          <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "-0.15s" }} />
          <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce" />
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-6 rounded-xl text-center">
          <p className="text-red-600 text-sm">{error || "Not found"}</p>
          <button onClick={() => router.push("/admin")} className="mt-3 text-sm text-blue-600 font-medium">
            Back to Admin
          </button>
        </div>
      </div>
    );
  }

  const { assessment, conversation, messages, symptoms, safety_events } = detail;
  const existingReview = assessment.metadata?.review_verdict;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/admin")}
            className="p-1 text-gray-500 hover:text-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-gray-900">Case Review</h1>
            <p className="text-xs text-gray-400">
              {conversation.chief_complaint || "General Assessment"}
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            assessment.risk_level === "critical" ? "bg-red-50 text-red-700" :
            assessment.risk_level === "high" ? "bg-orange-50 text-orange-700" :
            assessment.risk_level === "medium" ? "bg-yellow-50 text-yellow-700" :
            "bg-green-50 text-green-700"
          }`}>
            {assessment.risk_level}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Assessment Summary */}
        <section className="bg-white rounded-xl p-5 border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">AI Assessment</h2>

          {assessment.possible_conditions.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Possible Conditions</p>
              <div className="flex flex-wrap gap-2">
                {assessment.possible_conditions.map((c, i) => (
                  <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-lg">
                    {c.name}{c.probability ? ` (${Math.round(c.probability * 100)}%)` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {assessment.red_flags.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-red-600 mb-1">Red Flags</p>
              <ul className="space-y-1">
                {assessment.red_flags.map((flag, i) => (
                  <li key={i} className="text-sm text-red-700 flex items-start gap-1.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {assessment.confidence_score && (
            <p className="text-xs text-gray-500">
              Confidence: {Math.round(assessment.confidence_score * 100)}%
              {assessment.model_used && ` | Model: ${assessment.model_used}`}
            </p>
          )}
        </section>

        {/* Symptoms */}
        {symptoms.length > 0 && (
          <section className="bg-white rounded-xl p-5 border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              Extracted Symptoms ({symptoms.length})
            </h2>
            <div className="space-y-2">
              {symptoms.map((s, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="font-medium text-gray-900">{s.name}</span>
                  {s.severity && (
                    <span className="text-xs text-gray-500">Severity: {s.severity}/10</span>
                  )}
                  {s.duration_days && (
                    <span className="text-xs text-gray-500">{s.duration_days} days</span>
                  )}
                  {s.body_location && (
                    <span className="text-xs text-gray-400">{s.body_location}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Conversation Transcript */}
        <section className="bg-white rounded-xl p-5 border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Conversation ({messages.length} messages)
          </h2>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-blue-50 text-blue-900"
                    : "bg-gray-50 text-gray-800"
                }`}>
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Safety Events */}
        {safety_events.length > 0 && (
          <section className="bg-red-50 rounded-xl p-5 border border-red-100">
            <h2 className="text-sm font-semibold text-red-900 mb-3">
              Safety Events ({safety_events.length})
            </h2>
            <div className="space-y-2">
              {safety_events.map((event, i) => (
                <div key={i} className="text-sm text-red-800">
                  <span className="font-medium">{event.event_type.replace(/_/g, " ")}</span>
                  {event.description && <span> — {event.description}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Review Form */}
        <section className="bg-white rounded-xl p-5 border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Doctor Review</h2>

          {existingReview && !submitted ? (
            <div className="px-4 py-3 bg-green-50 rounded-lg text-sm text-green-800">
              Previously reviewed as: <span className="font-semibold">{existingReview}</span>
              {assessment.metadata?.review_notes && (
                <p className="mt-1 text-xs text-green-600">{assessment.metadata.review_notes}</p>
              )}
            </div>
          ) : submitted ? (
            <div className="px-4 py-3 bg-green-50 rounded-lg text-sm text-green-800 text-center">
              Review submitted successfully.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                {(
                  [
                    { value: "correct", label: "Correct", color: "border-green-300 bg-green-50 text-green-700" },
                    { value: "needs_improvement", label: "Needs Improvement", color: "border-yellow-300 bg-yellow-50 text-yellow-700" },
                    { value: "unsafe", label: "Unsafe", color: "border-red-300 bg-red-50 text-red-700" },
                    { value: "missing_red_flag", label: "Missing Red Flag", color: "border-orange-300 bg-orange-50 text-orange-700" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedVerdict(opt.value)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                      selectedVerdict === opt.value
                        ? opt.color + " ring-2 ring-offset-1 ring-blue-400"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this case..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />

              <button
                onClick={handleSubmitReview}
                disabled={!selectedVerdict || isSubmitting}
                className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? "Submitting..." : "Submit Review"}
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
