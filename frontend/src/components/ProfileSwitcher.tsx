"use client";

import { useState, useRef, useEffect } from "react";
import { useFamily } from "@/lib/family-context";
import { useRouter } from "next/navigation";

const RELATIONSHIP_ICONS: Record<string, string> = {
  self: "👤",
  mother: "👩",
  father: "👨",
  spouse: "💑",
  child: "👶",
  sibling: "👫",
  other: "👥",
};

export default function ProfileSwitcher() {
  const { members, activeMember, setActiveMember } = useFamily();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeName = activeMember ? activeMember.name : "You";
  const activeIcon = activeMember ? RELATIONSHIP_ICONS[activeMember.relationship] || "👥" : "👤";

  if (members.length <= 1) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition text-sm font-medium text-emerald-800"
      >
        <span>{activeIcon}</span>
        <span className="max-w-[80px] truncate">{activeName}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Switch Profile</div>

          {/* Self option */}
          <button
            onClick={() => { setActiveMember(null); setOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition ${!activeMember ? "bg-emerald-50" : ""}`}
          >
            <span className="text-lg">👤</span>
            <div className="text-left">
              <p className={`text-sm font-medium ${!activeMember ? "text-emerald-700" : "text-gray-800"}`}>You</p>
              <p className="text-[10px] text-gray-400">Primary profile</p>
            </div>
            {!activeMember && <svg className="w-4 h-4 text-emerald-500 ml-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>}
          </button>

          {members.filter((m) => !m.is_primary).map((m) => (
            <button
              key={m.id}
              onClick={() => { setActiveMember(m); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition ${activeMember?.id === m.id ? "bg-emerald-50" : ""}`}
            >
              <span className="text-lg">{RELATIONSHIP_ICONS[m.relationship] || "👥"}</span>
              <div className="text-left">
                <p className={`text-sm font-medium ${activeMember?.id === m.id ? "text-emerald-700" : "text-gray-800"}`}>{m.name}</p>
                <p className="text-[10px] text-gray-400 capitalize">{m.relationship}{m.gender ? ` · ${m.gender}` : ""}</p>
              </div>
              {activeMember?.id === m.id && <svg className="w-4 h-4 text-emerald-500 ml-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>}
            </button>
          ))}

          <div className="border-t border-gray-100 mt-1.5 pt-1.5">
            <button
              onClick={() => { router.push("/family"); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-500 hover:text-emerald-600 hover:bg-gray-50 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
              Manage Family
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
