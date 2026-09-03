"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

interface UserProfile {
  name: string;
  email: string;
  avatarUrl: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }: { data: { session: { user: { user_metadata: Record<string, string>; email?: string } } | null } }) => {
      if (data.session?.user) {
        const u = data.session.user;
        setUser({
          name:
            u.user_metadata?.full_name ||
            u.email?.split("@")[0] ||
            "User",
          email: u.email || "",
          avatarUrl:
            u.user_metadata?.avatar_url ||
            u.user_metadata?.picture ||
            "",
        });
      }
      setLoading(false);
    });
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  const userInitial = (user?.name || user?.email || "U")[0].toUpperCase();

  // Menu section definitions
  const accountItems = [
    {
      label: "Family Members",
      path: "/family",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: "Subscription & Billing",
      path: "/pricing",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
  ];

  const healthDataItems = [
    {
      label: "Health Insights",
      path: "/insights",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      label: "Assessment History",
      path: "/history",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: "Lab Reports",
      path: "/reports",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      label: "Face Scan History",
      path: "/face-scan/history",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: "Medicines",
      path: "/medicines",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className={`min-h-screen warm-bg transition-opacity duration-500 ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Header */}
      <header className="warm-header sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-5 py-3.5 flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/80 border border-gray-100 hover:bg-white hover:shadow-sm transition-all"
          >
            <svg
              className="w-4.5 h-4.5 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-gray-900">Settings</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 py-6 pb-12">
        {/* Loading state */}
        {loading && (
          <div className="space-y-6 animate-pulse">
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-20 h-20 rounded-full bg-gray-200" />
              <div className="h-4 w-32 bg-gray-200 rounded-lg" />
              <div className="h-3 w-48 bg-gray-100 rounded-lg" />
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-white/60 p-4 space-y-3">
                <div className="h-3 w-20 bg-gray-100 rounded" />
                <div className="h-12 bg-gray-50 rounded-xl" />
                <div className="h-12 bg-gray-50 rounded-xl" />
              </div>
            ))}
          </div>
        )}

        {/* Loaded content */}
        {!loading && (
          <div className="space-y-6">
            {/* Profile Section */}
            <div className="flex flex-col items-center gap-3 py-4">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-20 h-20 rounded-full object-cover ring-4 ring-white shadow-lg"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center ring-4 ring-white shadow-lg">
                  <span className="text-2xl font-bold text-white">
                    {userInitial}
                  </span>
                </div>
              )}
              <div className="text-center">
                <h2 className="text-lg font-bold text-gray-900">
                  {user?.name || "User"}
                </h2>
                <p className="text-sm text-gray-500">{user?.email}</p>
              </div>
              <button className="mt-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 hover:bg-emerald-100 transition-colors">
                Edit Profile
              </button>
            </div>

            {/* Account Section */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                Account
              </p>
              <div className="warm-card rounded-2xl divide-y divide-gray-100/80 shadow-sm">
                {accountItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => router.push(item.path)}
                    className="w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[48px] hover:bg-gray-50/60 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                  >
                    <span className="text-gray-500">{item.icon}</span>
                    <span className="flex-1 text-sm font-medium text-gray-800 text-left">
                      {item.label}
                    </span>
                    <svg
                      className="w-4 h-4 text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            </div>

            {/* Health Data Section */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                Health Data
              </p>
              <div className="warm-card rounded-2xl divide-y divide-gray-100/80 shadow-sm">
                {healthDataItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => router.push(item.path)}
                    className="w-full flex items-center gap-3.5 px-4 py-3.5 min-h-[48px] hover:bg-gray-50/60 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                  >
                    <span className="text-gray-500">{item.icon}</span>
                    <span className="flex-1 text-sm font-medium text-gray-800 text-left">
                      {item.label}
                    </span>
                    <svg
                      className="w-4 h-4 text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            </div>

            {/* App Section */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                App
              </p>
              <div className="warm-card rounded-2xl divide-y divide-gray-100/80 shadow-sm">
                {/* Notifications toggle */}
                <div className="flex items-center gap-3.5 px-4 py-3.5 min-h-[48px]">
                  <span className="text-gray-500">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.8}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                      />
                    </svg>
                  </span>
                  <span className="flex-1 text-sm font-medium text-gray-800">
                    Notifications
                  </span>
                  <button
                    onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                      notificationsEnabled ? "bg-emerald-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                        notificationsEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* About */}
                <div className="flex items-center gap-3.5 px-4 py-3.5 min-h-[48px]">
                  <span className="text-gray-500">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.8}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </span>
                  <span className="flex-1 text-sm font-medium text-gray-800">
                    About MedSign
                  </span>
                  <span className="text-xs text-gray-400 font-medium">
                    v1.0.0
                  </span>
                </div>
              </div>
            </div>

            <div className="warm-card rounded-2xl shadow-sm overflow-hidden">
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 min-h-[48px] text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span className="text-sm font-semibold">
                  {loggingOut ? "Logging out..." : "Logout"}
                </span>
              </button>
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-gray-400 pt-4 pb-2">
              MedSign v1.0.0 — Made with love in India
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
