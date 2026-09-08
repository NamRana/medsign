"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const AuthenticatedChrome = dynamic(() => import("@/components/AuthenticatedChrome"), {
  ssr: false,
});

const MARKETING_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/auth/callback",
  "/ai-lab-report-analyzer",
  "/ai-symptom-checker",
  "/online-prescription",
  "/how-it-works",
  "/medical-safety",
]);

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (MARKETING_PATHS.has(pathname)) {
    return <>{children}</>;
  }

  return <AuthenticatedChrome>{children}</AuthenticatedChrome>;
}
