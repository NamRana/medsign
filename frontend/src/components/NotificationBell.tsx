"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/api";
import type { Notification } from "@/lib/api";

const ICON_MAP: Record<string, { emoji: string; bg: string }> = {
  heart: { emoji: "❤️", bg: "bg-red-50" },
  bell: { emoji: "🔔", bg: "bg-amber-50" },
  check: { emoji: "✅", bg: "bg-emerald-50" },
  alert: { emoji: "⚠️", bg: "bg-orange-50" },
  pill: { emoji: "💊", bg: "bg-purple-50" },
  tip: { emoji: "💡", bg: "bg-blue-50" },
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await getNotifications(30);
      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleOpen() {
    setOpen(!open);
    if (!open) {
      setLoading(true);
      await fetchNotifications();
      setLoading(false);
    }
  }

  async function handleClick(n: Notification) {
    if (!n.read) {
      await markNotificationRead(n.id);
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.action_url) router.push(n.action_url);
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
  }

  return (
    <div className="relative" ref={ref}>
      {/* Bell Button */}
      <button
        onClick={handleOpen}
        className="relative p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 shadow-lg animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute top-full right-0 mt-2 w-[360px] max-w-[calc(100vw-32px)] rounded-2xl shadow-2xl shadow-black/15 z-50 overflow-hidden" style={{ background: "rgba(253,251,247,0.95)", backdropFilter: "blur(20px)", border: "1px solid rgba(0,0,0,0.06)" }}>
          <style>{`
            @keyframes notifSlide { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
            .notif-panel { animation: notifSlide 0.2s ease-out both; }
          `}</style>
          <div className="notif-panel">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[11px] font-medium text-purple-500 hover:text-purple-700 transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Notification List */}
            <div className="max-h-[400px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-purple-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-purple-200 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center py-10 px-4">
                  <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mb-3">
                    <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-400">No notifications yet</p>
                  <p className="text-xs text-gray-300 mt-1">We&apos;ll notify you about health follow-ups</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const iconInfo = ICON_MAP[n.icon] || ICON_MAP.bell;
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={`w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${
                        !n.read ? "bg-purple-50/30" : ""
                      }`}
                    >
                      {/* Icon */}
                      <div className={`w-10 h-10 ${iconInfo.bg} rounded-xl flex items-center justify-center shrink-0 mt-0.5`}>
                        <span className="text-base">{iconInfo.emoji}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm leading-tight ${!n.read ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                            {n.title}
                          </p>
                          {!n.read && (
                            <span className="w-2 h-2 bg-purple-500 rounded-full shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-gray-400">{timeAgo(n.created_at)}</span>
                          {n.action_url && (
                            <span className="text-[10px] font-medium text-purple-500">Tap to respond &rarr;</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
