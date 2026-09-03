"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getFamilyMembers } from "@/lib/api";
import type { FamilyMember } from "@/lib/api";

interface FamilyContextValue {
  members: FamilyMember[];
  activeMember: FamilyMember | null; // null = self (primary user)
  setActiveMember: (member: FamilyMember | null) => void;
  memberParam: string; // query string to append: "" or "&member=xxx"
  loading: boolean;
  refresh: () => void;
}

const FamilyContext = createContext<FamilyContextValue>({
  members: [],
  activeMember: null,
  setActiveMember: () => {},
  memberParam: "",
  loading: true,
  refresh: () => {},
});

export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [activeMember, setActiveMember] = useState<FamilyMember | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    getFamilyMembers()
      .then((data) => {
        setMembers(data);
        if (activeMember && !data.find((m) => m.id === activeMember.id)) {
          setActiveMember(null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeMember]);

  useEffect(() => { refresh(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const memberParam = activeMember ? `member=${activeMember.id}` : "";

  return (
    <FamilyContext.Provider value={{ members, activeMember, setActiveMember, memberParam, loading, refresh }}>
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamily() {
  return useContext(FamilyContext);
}
