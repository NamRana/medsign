"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isCheckingRole, setIsCheckingRole] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    async function checkRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.app_metadata?.role !== "admin") {
        router.replace("/dashboard");
        return;
      }

      setIsCheckingRole(false);
    }

    void checkRole();
  }, [router]);

  if (isCheckingRole) {
    return <div className="care-route-loader"><div className="care-route-loader-orbit" /></div>;
  }

  return <>{children}</>;
}
