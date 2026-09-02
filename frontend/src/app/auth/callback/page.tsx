"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: string) => {
      if (event === "SIGNED_IN") {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.user_metadata?.full_name) {
            await apiFetch("/api/v1/patients", {
              method: "POST",
              body: JSON.stringify({
                full_name: user.user_metadata.full_name,
              }),
            }).catch(() => {});
          }
        } catch {}
        router.replace("/dashboard");
      }
    });

    // Fallback: if already signed in or if auth state doesn't change within 5s
    const timeout = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace("/dashboard");
      } else {
        router.replace("/login?error=auth_timeout");
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
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
