"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useFamily } from "@/lib/family-context";

interface SmartAlert {
  id: string;
  type: string;
  severity: string;
  icon: string;
  title: string;
  body: string;
  recommendation: string;
  data_points: number;
  locked: boolean;
}

interface AlertsResponse {
  alerts: SmartAlert[];
  total: number;
  locked_count: number;
}

const ICON_MAP: Record<string, { emoji: string; bg: string; border: string }> = {
  repeat: { emoji: "🔄", bg: "bg-amber-50", border: "border-amber-200" },
  activity: { emoji: "📊", bg: "bg-blue-50", border: "border-blue-200" },
  "trending-down": { emoji: "📉", bg: "bg-red-50", border: "border-red-200" },
  moon: { emoji: "🌙", bg: "bg-indigo-50", border: "border-indigo-200" },
  heart: { emoji: "❤️", bg: "bg-rose-50", border: "border-rose-200" },
  lab: { emoji: "🧪", bg: "bg-purple-50", border: "border-purple-200" },
  zap: { emoji: "⚡", bg: "bg-orange-50", border: "border-orange-200" },
  star: { emoji: "⭐", bg: "bg-emerald-50", border: "border-emerald-200" },
  clock: { emoji: "⏰", bg: "bg-gray-50", border: "border-gray-200" },
};

const SEVERITY_STYLES: Record<string, { badge: string; glow: string }> = {
  alert: { badge: "bg-red-100 text-red-700", glow: "shadow-red-100/60" },
  warning: { badge: "bg-amber-100 text-amber-700", glow: "shadow-amber-100/60" },
  success: { badge: "bg-emerald-100 text-emerald-700", glow: "shadow-emerald-100/60" },
  info: { badge: "bg-blue-100 text-blue-700", glow: "shadow-blue-100/60" },
};

export default function SmartAlerts() {
  const router = useRouter();
  const { memberParam } = useFamily();
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [lockedCount, setLockedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const sep = memberParam ? `?${memberParam}` : "";
    apiFetch<AlertsResponse>(`/api/v1/smart-alerts${sep}`)
      .then((data) => {
        setAlerts(data.alerts);
        setLockedCount(data.locked_count);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [memberParam]);

  if (loading) {
    return (
      <div className="rounded-[1.35rem] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gray-100 rounded-xl animate-pulse" />
          <div>
            <div className="h-4 bg-gray-100 rounded-lg w-40 mb-2 animate-pulse" />
            <div className="h-3 bg-gray-50 rounded-lg w-56 animate-pulse" />
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-gray-50 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (alerts.length === 0) return null;

  return (
    <div className="rounded-[1.35rem] overflow-hidden">
      <style>{`
        @keyframes alertSlide { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        .alert-item { animation: alertSlide 0.3s ease-out both; }
      `}</style>

      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="care-module-icon w-10 h-10 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <p className="care-eyebrow !text-teal-600">Signal queue</p>
              <h3 className="text-sm font-bold text-slate-900 mt-0.5">AI-detected health patterns</h3>
            </div>
          </div>
          {lockedCount > 0 && (
            <button
              onClick={() => router.push("/pricing")}
              className="flex items-center gap-1.5 text-[10px] font-bold text-teal-700 bg-teal-50 px-3 py-1.5 rounded-full hover:bg-teal-100 transition-colors"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              {lockedCount} Pro insights
            </button>
          )}
        </div>
      </div>

      {/* Alert Cards */}
      <div className="px-6 pb-6 space-y-3">
        {alerts.map((alert, i) => {
          const iconInfo = ICON_MAP[alert.icon] || ICON_MAP.clock;
          const severity = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
          const isExpanded = expanded === alert.id;

          if (alert.locked) {
            return (
              <div
                key={alert.id}
                className="alert-item relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/70 p-4 cursor-pointer hover:border-teal-200 transition-all"
                style={{ animationDelay: `${i * 80}ms` }}
                onClick={() => router.push("/pricing")}
              >
                {/* Blur overlay */}
                <div className="absolute inset-0 bg-white/70 backdrop-blur-[6px] z-10 flex flex-col items-center justify-center">
                  <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center mb-2">
                    <svg className="w-4 h-4 text-teal-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-xs font-bold text-teal-700">Upgrade to Pro</p>
                  <p className="text-[10px] text-teal-500 mt-0.5">Unlock this AI insight</p>
                </div>

                {/* Blurred content behind */}
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 ${iconInfo.bg} rounded-xl flex items-center justify-center shrink-0`}>
                    <span className="text-base">{iconInfo.emoji}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{alert.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{alert.body}</p>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={alert.id}
              className={`alert-item rounded-2xl border ${iconInfo.border} ${iconInfo.bg} p-4 cursor-pointer hover:shadow-lg ${severity.glow} transition-all`}
              style={{ animationDelay: `${i * 80}ms` }}
              onClick={() => setExpanded(isExpanded ? null : alert.id)}
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 bg-white/80 rounded-xl flex items-center justify-center shrink-0 shadow-sm`}>
                  <span className="text-lg">{iconInfo.emoji}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900">{alert.title}</p>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${severity.badge}`}>
                      {alert.severity === "alert" ? "Action needed" : alert.severity === "warning" ? "Watch" : alert.severity === "success" ? "Good news" : "Info"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">{alert.body}</p>

                  {/* Expanded recommendation */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-black/5">
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div>
                          <p className="text-[11px] font-semibold text-gray-700 mb-0.5">Recommendation</p>
                          <p className="text-xs text-gray-600 leading-relaxed">{alert.recommendation}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-[10px] text-gray-400">Based on {alert.data_points} data points</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push("/chat"); }}
                          className="ml-auto text-[11px] font-semibold text-teal-600 hover:text-teal-800 transition-colors"
                        >
                          Start Assessment &rarr;
                        </button>
                      </div>
                    </div>
                  )}

                  {!isExpanded && (
                    <p className="text-[10px] text-gray-400 mt-2">Tap for recommendation</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
