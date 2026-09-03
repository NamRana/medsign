"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ChatWidget from "./ChatWidget";

const HIDDEN_PATHS = ["/login", "/signup", "/chat", "/auth"];

export default function GlobalChatWidget() {
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    import("@/lib/supabase").then(({ createClient }) => {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
        setAuthed(!!data.session);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: unknown) => {
        setAuthed(!!session);
      });
      unsub = () => subscription.unsubscribe();
    });
    return () => unsub?.();
  }, []);

  if (!authed) return null;
  if (HIDDEN_PATHS.some((p) => pathname.startsWith(p))) return null;

  return <ChatWidget />;
}
