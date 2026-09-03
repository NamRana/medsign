"use client";

import { useRequireAuth } from "@/lib/useRequireAuth";

export default function AvatarLayout({ children }: { children: React.ReactNode }) {
  const checking = useRequireAuth();
  if (checking) return <div className="min-h-screen" style={{ background: "var(--warm-cream, #FDFBF7)" }} />;
  return <>{children}</>;
}
