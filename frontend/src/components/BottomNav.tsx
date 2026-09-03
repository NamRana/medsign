"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

interface Tab {
  label: string;
  path: string;
  isCenter?: boolean;
}

const TABS: Tab[] = [
  { label: "Home", path: "/dashboard" },
  { label: "Assessment", path: "/chat" },
  { label: "Face Scan", path: "/face-scan", isCenter: true },
  { label: "Reports", path: "/reports" },
  { label: "More", path: "/settings" },
];

const HIDDEN_PREFIXES = ["/login", "/signup", "/auth", "/admin"];

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={active ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      {!active && <path d="M9 21V12h6v9" />}
      {active && <rect x="9" y="12" width="6" height="9" fill="white" />}
    </svg>
  );
}

function AssessmentIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={active ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {active ? (
        <>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" />
          <circle cx="9" cy="10" r="1" fill="white" />
          <circle cx="12" cy="10" r="1" fill="white" />
          <circle cx="15" cy="10" r="1" fill="white" />
        </>
      ) : (
        <>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z" />
          <circle cx="9" cy="10" r="1" fill="currentColor" />
          <circle cx="12" cy="10" r="1" fill="currentColor" />
          <circle cx="15" cy="10" r="1" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

function FaceScanIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 3H5a2 2 0 0 0-2 2v2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M17 21h2a2 2 0 0 0 2-2v-2" />
      <circle cx="12" cy="10" r="3" fill={active ? "currentColor" : "none"} />
      <path d="M12 13c-2.5 0-4.5 1.5-5 3.5" />
      <path d="M12 13c2.5 0 4.5 1.5 5 3.5" />
    </svg>
  );
}

function ReportsIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={active ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {active ? (
        <>
          <path d="M9 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8l-6-6H9z" />
          <path d="M14 2v5a1 1 0 0 0 1 1h5" fill="white" stroke="white" strokeWidth="1" />
          <line x1="8" y1="13" x2="16" y2="13" stroke="white" strokeWidth="1.5" />
          <line x1="8" y1="17" x2="13" y2="17" stroke="white" strokeWidth="1.5" />
        </>
      ) : (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
          <path d="M14 2v6h6" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </>
      )}
    </svg>
  );
}

function MoreIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke={active ? "currentColor" : "none"}
      strokeWidth={active ? 0.5 : 0}
    >
      <circle cx="4" cy="12" r={active ? 2.5 : 2} />
      <circle cx="12" cy="12" r={active ? 2.5 : 2} />
      <circle cx="20" cy="12" r={active ? 2.5 : 2} />
    </svg>
  );
}

function TabIcon({ tab, active }: { tab: Tab; active: boolean }) {
  switch (tab.path) {
    case "/dashboard":
      return <HomeIcon active={active} />;
    case "/chat":
      return <AssessmentIcon active={active} />;
    case "/face-scan":
      return <FaceScanIcon active={active} />;
    case "/reports":
      return <ReportsIcon active={active} />;
    case "/settings":
      return <MoreIcon active={active} />;
    default:
      return null;
  }
}

function isActive(pathname: string, tabPath: string): boolean {
  if (tabPath === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  return pathname.startsWith(tabPath);
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
      setAuthed(!!data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: unknown) => {
      setAuthed(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!authed) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[40] bg-white border-t border-gray-200 sm:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        boxShadow: "0 -1px 6px rgba(0, 0, 0, 0.06)",
      }}
    >
      <div className="flex items-end justify-around h-[60px]">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.path);

          if (tab.isCenter) {
            return (
              <button
                key={tab.path}
                type="button"
                onClick={() => router.push(tab.path)}
                className="flex flex-col items-center justify-center flex-1 -mt-3 transition-transform duration-150 active:scale-95"
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={`flex items-center justify-center w-12 h-12 rounded-full transition-colors duration-200 ${
                    active
                      ? "bg-purple-600 text-white shadow-lg shadow-purple-200"
                      : "bg-purple-100 text-purple-600"
                  }`}
                >
                  <TabIcon tab={tab} active={active} />
                </span>
                <span
                  className={`mt-0.5 transition-colors duration-200 ${
                    active
                      ? "text-purple-600 font-bold"
                      : "text-gray-400 font-normal"
                  }`}
                  style={{ fontSize: "10px", lineHeight: "14px" }}
                >
                  {tab.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => router.push(tab.path)}
              className="flex flex-col items-center justify-center flex-1 pt-1.5 pb-1 transition-transform duration-150 active:scale-95"
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
            >
              <span
                className={`transition-colors duration-200 ${
                  active ? "text-emerald-600" : "text-gray-400"
                }`}
              >
                <TabIcon tab={tab} active={active} />
              </span>
              <span
                className={`mt-0.5 transition-colors duration-200 ${
                  active
                    ? "text-emerald-600 font-bold"
                    : "text-gray-400 font-normal"
                }`}
                style={{ fontSize: "10px", lineHeight: "14px" }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
