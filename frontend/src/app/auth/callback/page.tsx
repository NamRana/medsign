"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.onAuthStateChange((event: string) => {
      if (event === "SIGNED_IN") {
        router.replace("/dashboard");
      }
    });

    // Handle the OAuth code exchange automatically
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }: { error: unknown }) => {
        if (error) {
          router.replace("/login?error=auth_failed");
        } else {
          router.replace("/dashboard");
        }
      });
    } else if (!hash) {
      // No code and no hash — something went wrong
      router.replace("/login?error=auth_failed");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <div className="text-center">
        <div className="flex gap-1 justify-center mb-4">
          <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "-0.3s" }} />
          <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "-0.15s" }} />
          <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-bounce" />
        </div>
        <p className="text-sm text-gray-500">Signing you in...</p>
      </div>
    </div>
  );
}
