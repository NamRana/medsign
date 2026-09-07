"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";

// ── Types ──

interface OverviewStats {
  total_conversations: number;
  conversations_today: number;
  conversations_this_week: number;
  total_assessments: number;
  total_messages: number;
  avg_messages_per_conversation: number;
  total_users: number;
}

interface UrgencyBreakdown {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

interface SafetyStats {
  total_events: number;
  events_today: number;
  events_this_week: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  recent_events: Array<{
    event_type: string;
    severity: string;
    description: string;
    created_at: string;
  }>;
}

interface FeedbackStats {
  total_feedback: number;
  avg_rating: number | null;
  helpful_percent: number | null;
  accurate_percent: number | null;
  recent_comments: Array<{
    comment: string;
    rating: number | null;
    created_at: string;
  }>;
}

interface ModelStats {
  total_ai_messages: number;
  avg_latency_ms: number | null;
  models_used: Record<string, number>;
}

interface Dashboard {
  overview: OverviewStats;
  urgency: UrgencyBreakdown;
  safety: SafetyStats;
  feedback: FeedbackStats;
  model: ModelStats;
}

interface ReviewCase {
  id: string;
  conversation_id: string;
  risk_level: string;
  possible_conditions: Array<{ name?: string }>;
  red_flags: string[];
  confidence_score: number | null;
  created_at: string;
  chief_complaint: string | null;
  review_status: string;
}

// ── Components ──

function StatCard({
  label,
  value,
  subtext,
  color = "text-gray-900",
}: {
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {subtext && <p className="text-[11px] text-gray-400 mt-0.5">{subtext}</p>}
    </div>
  );
}

function UrgencyBar({ urgency }: { urgency: UrgencyBreakdown }) {
  const total = urgency.low + urgency.medium + urgency.high + urgency.critical;
  if (total === 0) return <p className="text-sm text-gray-400">No assessments yet</p>;

  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-3">
        {urgency.low > 0 && (
          <div className="bg-green-400" style={{ width: `${pct(urgency.low)}%` }} />
        )}
        {urgency.medium > 0 && (
          <div className="bg-yellow-400" style={{ width: `${pct(urgency.medium)}%` }} />
        )}
        {urgency.high > 0 && (
          <div className="bg-orange-400" style={{ width: `${pct(urgency.high)}%` }} />
        )}
        {urgency.critical > 0 && (
          <div className="bg-red-500" style={{ width: `${pct(urgency.critical)}%` }} />
        )}
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400" /> Low: {urgency.low}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-400" /> Medium: {urgency.medium}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-orange-400" /> High: {urgency.high}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Critical: {urgency.critical}
        </span>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    low: "bg-green-50 text-green-700",
    medium: "bg-yellow-50 text-yellow-700",
    high: "bg-orange-50 text-orange-700",
    critical: "bg-red-50 text-red-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[severity] || "bg-gray-100 text-gray-600"}`}>
      {severity}
    </span>
  );
}

function RiskBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    low: "bg-green-50 text-green-700",
    medium: "bg-yellow-50 text-yellow-700",
    high: "bg-orange-50 text-orange-700",
    critical: "bg-red-50 text-red-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[level] || "bg-gray-100 text-gray-600"}`}>
      {level}
    </span>
  );
}

// ── Main Page ──

export default function AdminPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [reviews, setReviews] = useState<ReviewCase[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "reviews" | "safety">("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: { app_metadata?: Record<string, string> } | null } }) => {
      if (data.user?.app_metadata?.role === "admin") {
        setAuthorized(true);
        loadDashboard();
        loadReviews();
      } else {
        router.replace("/dashboard");
      }
    });
  }, [router]);

  async function loadDashboard() {
    try {
      const data = await apiFetch<Dashboard>("/api/v1/admin/dashboard");
      setDashboard(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadReviews() {
    try {
      const data = await apiFetch<ReviewCase[]>("/api/v1/admin/reviews?status=all&limit=20");
      setReviews(data);
    } catch {
      // Non-critical
    }
  }

  if (!authorized || isLoading) {
    return (
      <div className="care-route-loader">
        <div className="care-route-loader-orbit" />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="care-route-loader">
        <div className="warm-card p-6 rounded-2xl text-center max-w-sm">
          <p className="text-red-600 text-sm">{error || "Failed to load"}</p>
          <button
            onClick={() => { setIsLoading(true); setError(null); loadDashboard(); }}
            className="mt-3 text-sm text-teal-700 font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="care-admin-shell">
      {/* Header */}
      <header className="care-admin-header sticky top-0 z-10 border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center ring-1 ring-teal-100">
              <svg className="w-4 h-4 text-teal-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="care-eyebrow !text-teal-700">Clinical operations</p>
              <h1 className="text-sm font-semibold text-gray-900">Admin Command Center</h1>
            </div>
          </div>
          <span className="care-header-status">
            Admin live
          </span>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit border border-teal-100/80">
          {(["overview", "reviews", "safety"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab
                  ? "care-admin-tab-active"
                  : "text-gray-500 hover:text-teal-700"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="Total Users"
                value={dashboard.overview.total_users}
              />
              <StatCard
                label="Conversations"
                value={dashboard.overview.total_conversations}
                subtext={`${dashboard.overview.conversations_today} today`}
              />
              <StatCard
                label="Assessments"
                value={dashboard.overview.total_assessments}
              />
              <StatCard
                label="Avg Messages"
                value={dashboard.overview.avg_messages_per_conversation}
                subtext="per conversation"
              />
            </div>

            {/* Activity Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatCard
                label="Today"
                value={dashboard.overview.conversations_today}
                subtext="conversations"
                color="text-blue-600"
              />
              <StatCard
                label="This Week"
                value={dashboard.overview.conversations_this_week}
                subtext="conversations"
                color="text-blue-600"
              />
              <StatCard
                label="Total Messages"
                value={dashboard.overview.total_messages}
              />
            </div>

            {/* Urgency Breakdown */}
            <div className="bg-white rounded-xl p-5 border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Assessment Urgency Breakdown
              </h3>
              <UrgencyBar urgency={dashboard.urgency} />
            </div>

            {/* Model & Feedback Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Model Performance */}
              <div className="bg-white rounded-xl p-5 border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  AI Model Performance
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total AI responses</span>
                    <span className="font-medium">{dashboard.model.total_ai_messages}</span>
                  </div>
                  {dashboard.model.avg_latency_ms && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Avg latency</span>
                      <span className="font-medium">{dashboard.model.avg_latency_ms}ms</span>
                    </div>
                  )}
                  {Object.entries(dashboard.model.models_used).map(([model, count]) => (
                    <div key={model} className="flex justify-between text-sm">
                      <span className="text-gray-500 truncate">{model}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Feedback */}
              <div className="bg-white rounded-xl p-5 border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  User Feedback
                </h3>
                {dashboard.feedback.total_feedback === 0 ? (
                  <p className="text-sm text-gray-400">No feedback yet</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total feedback</span>
                      <span className="font-medium">{dashboard.feedback.total_feedback}</span>
                    </div>
                    {dashboard.feedback.avg_rating && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Avg rating</span>
                        <span className="font-medium">{dashboard.feedback.avg_rating} / 5</span>
                      </div>
                    )}
                    {dashboard.feedback.helpful_percent !== null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Found helpful</span>
                        <span className="font-medium">{dashboard.feedback.helpful_percent}%</span>
                      </div>
                    )}
                    {dashboard.feedback.accurate_percent !== null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Rated accurate</span>
                        <span className="font-medium">{dashboard.feedback.accurate_percent}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "reviews" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                Cases for Review ({reviews.length})
              </h2>
            </div>

            {reviews.length === 0 ? (
              <div className="bg-white rounded-xl p-10 text-center border border-gray-100">
                <p className="text-sm text-gray-500">No assessments to review yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {reviews.map((review) => (
                  <button
                    key={review.id}
                    onClick={() => router.push(`/admin/review/${review.id}`)}
                    className="w-full text-left bg-white rounded-xl px-4 py-3 border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/20 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {review.chief_complaint || "General Assessment"}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <RiskBadge level={review.risk_level} />
                          {review.possible_conditions.length > 0 && (
                            <span className="text-xs text-gray-500">
                              {review.possible_conditions
                                .slice(0, 2)
                                .map((c) => c.name || "Unknown")
                                .join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {review.red_flags.length > 0 && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700 rounded-full">
                            {review.red_flags.length} red flags
                          </span>
                        )}
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          review.review_status === "reviewed"
                            ? "bg-green-50 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {review.review_status}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "safety" && (
          <div className="space-y-4">
            {/* Safety Summary */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Total Events"
                value={dashboard.safety.total_events}
                color={dashboard.safety.total_events > 0 ? "text-red-600" : "text-gray-900"}
              />
              <StatCard
                label="Today"
                value={dashboard.safety.events_today}
                color={dashboard.safety.events_today > 0 ? "text-red-600" : "text-green-600"}
              />
              <StatCard
                label="This Week"
                value={dashboard.safety.events_this_week}
              />
            </div>

            {/* By Severity */}
            {Object.keys(dashboard.safety.by_severity).length > 0 && (
              <div className="bg-white rounded-xl p-5 border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">By Severity</h3>
                <div className="flex gap-3 flex-wrap">
                  {Object.entries(dashboard.safety.by_severity).map(([sev, count]) => (
                    <div key={sev} className="flex items-center gap-2">
                      <SeverityBadge severity={sev} />
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* By Type */}
            {Object.keys(dashboard.safety.by_type).length > 0 && (
              <div className="bg-white rounded-xl p-5 border border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">By Type</h3>
                <div className="space-y-2">
                  {Object.entries(dashboard.safety.by_type).map(([type, count]) => (
                    <div key={type} className="flex justify-between text-sm">
                      <span className="text-gray-600">{type.replace(/_/g, " ")}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Events */}
            <div className="bg-white rounded-xl p-5 border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Safety Events</h3>
              {dashboard.safety.recent_events.length === 0 ? (
                <p className="text-sm text-gray-400">No safety events recorded.</p>
              ) : (
                <div className="space-y-3">
                  {dashboard.safety.recent_events.map((event, i) => (
                    <div key={i} className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0">
                      <SeverityBadge severity={event.severity} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">
                          {event.description || event.event_type.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(event.created_at).toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
