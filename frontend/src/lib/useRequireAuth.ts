"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

export function useRequireAuth() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
      if (!data.session) {
        window.location.replace("/login");
        return;
      }
      setChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: unknown) => {
      if (!session) {
        window.location.replace("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return checking;
}
