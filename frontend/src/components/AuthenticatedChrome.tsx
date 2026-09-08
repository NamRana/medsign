"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import TopHeader from "@/components/TopHeader";
import BottomNav from "@/components/BottomNav";
import { FamilyProvider } from "@/lib/family-context";

const GlobalChatWidget = dynamic(() => import("@/components/GlobalChatWidget"), {
  ssr: false,
});

function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}

export default function AuthenticatedChrome({ children }: { children: ReactNode }) {
  return (
    <FamilyProvider>
      <TopHeader />
      {children}
      <BottomNav />
      <GlobalChatWidget />
      <ServiceWorkerRegistration />
    </FamilyProvider>
  );
}
