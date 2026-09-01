"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function FaceScanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      setIsCheckingSession(false);
    }

    void checkSession();
  }, [router]);

  if (isCheckingSession) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return <>{children}</>;
}
