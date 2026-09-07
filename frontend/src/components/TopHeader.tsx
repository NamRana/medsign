"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import NotificationBell from "@/components/NotificationBell";
import BrandLogo from "@/components/BrandLogo";

const HIDDEN_PATHS = ["/login", "/signup", "/auth"];
const SELF_HEADED_PATHS = [
  "/chat",
  "/insights",
  "/history",
  "/reports",
  "/family",
  "/medicines",
  "/settings",
  "/pricing",
  "/face-scan",
  "/avatar",
  "/admin",
];

interface UserInfo {
  name: string;
  email: string;
  avatarUrl: string | null;
}

export default function TopHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch user session
  useEffect(() => {
    const supabase = createClient();
    function syncUser(session: Session | null) {
      if (session?.user) {
        const meta = session.user.user_metadata;
        setUser({
          name: meta?.full_name || "User",
          email: session.user.email || "",
          avatarUrl: meta?.avatar_url || null,
        });
      } else {
        setUser(null);
      }
    }

    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      syncUser(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      syncUser(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  if (!user || pathname === "/") return null;
  if (HIDDEN_PATHS.some((p) => pathname.startsWith(p)) || SELF_HEADED_PATHS.some((p) => pathname.startsWith(p))) {
    return null;
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  function navigateTo(path: string) {
    setDropdownOpen(false);
    router.push(path);
  }

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <header className="care-top-header sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
      <div className="max-w-[1440px] mx-auto flex items-center justify-between h-14 px-4">
        {/* Left: Logo */}
        <button
          onClick={() => navigateTo("/dashboard")}
          className="flex items-center gap-2 active:scale-95 transition-transform"
        >
          <BrandLogo iconClassName="w-8 h-8" wordmarkClassName="text-base hidden min-[360px]:inline" compact />
          <span className="care-header-status hidden md:inline-flex">Care OS</span>
        </button>

        {/* Right: Notification bell + Avatar */}
        <div className="flex items-center gap-1">
          <NotificationBell />

          {/* Avatar + Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="ml-1 active:scale-95 transition-transform"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-transparent hover:ring-teal-300 transition-all"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 via-cyan-600 to-blue-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-transparent hover:ring-teal-300 transition-all">
                  {initials}
                </div>
              )}
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && (
              <div
                className="care-header-dropdown absolute top-full right-0 mt-2 w-[220px] rounded-2xl shadow-2xl shadow-black/15 overflow-hidden"
                style={{
                  animation: "headerDropdownIn 0.18s ease-out both",
                }}
              >
                <style>{`
                  @keyframes headerDropdownIn {
                    from { opacity: 0; transform: translateY(-8px); }
                    to   { opacity: 1; transform: translateY(0); }
                  }
                `}</style>

                {/* User info */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {user?.name || "User"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {user?.email || ""}
                  </p>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <button
                    onClick={() => navigateTo("/settings")}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    My Profile
                  </button>
                  <button
                    onClick={() => navigateTo("/family")}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    Family Members
                  </button>
                  <button
                    onClick={() => navigateTo("/pricing")}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                      />
                    </svg>
                    Subscription
                  </button>
                </div>

                {/* Divider + Logout */}
                <div className="border-t border-gray-100 py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 active:scale-95 transition-all"
                  >
                    <svg
                      className="w-4 h-4 text-red-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
