"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";

const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  "Asia/Kolkata": "India",
  "Asia/Calcutta": "India",
  "Asia/Mumbai": "India",
  "America/New_York": "United States",
  "America/Chicago": "United States",
  "America/Denver": "United States",
  "America/Los_Angeles": "United States",
  "America/Phoenix": "United States",
  "America/Anchorage": "United States",
  "Pacific/Honolulu": "United States",
  "Europe/London": "United Kingdom",
  "Asia/Dubai": "UAE",
  "America/Toronto": "Canada",
  "America/Vancouver": "Canada",
  "Australia/Sydney": "Australia",
  "Australia/Melbourne": "Australia",
  "Australia/Perth": "Australia",
  "Europe/Berlin": "Germany",
  "Asia/Riyadh": "Saudi Arabia",
  "Asia/Singapore": "Singapore",
  "Asia/Dhaka": "Bangladesh",
  "Asia/Kathmandu": "Nepal",
  "Asia/Colombo": "Sri Lanka",
  "Asia/Karachi": "Pakistan",
  "Africa/Lagos": "Nigeria",
  "Africa/Johannesburg": "South Africa",
  "Asia/Manila": "Philippines",
  "Asia/Jakarta": "Indonesia",
  "Asia/Kuala_Lumpur": "Malaysia",
  "Africa/Nairobi": "Kenya",
};

function detectCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONE_TO_COUNTRY[tz] || "Other";
  } catch {
    return "Other";
  }
}

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: string) => {
      if (event === "SIGNED_IN") {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.user_metadata?.full_name) {
            const country = detectCountry();
            await apiFetch("/api/v1/patients", {
              method: "POST",
              body: JSON.stringify({
                full_name: user.user_metadata.full_name,
                location_country: country !== "Other" ? country : null,
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
