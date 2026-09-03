"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

interface ScheduleItem {
  medicine: { id: string; name: string; dosage: string | null; times: string[]; frequency: string };
  logs: Array<{ scheduled_time: string | null; status: string }>;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function formatTime12(t: string): string {
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

export default function MedicineReminder() {
  const [permissionState, setPermissionState] = useState<"default" | "granted" | "denied">("default");
  const [enabled, setEnabled] = useState(false);
  const checkedTimesRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermissionState(Notification.permission as "default" | "granted" | "denied");
    const stored = localStorage.getItem("medsign_reminders");
    if (stored === "true" && Notification.permission === "granted") {
      setEnabled(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    function checkSchedule() {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      apiFetch<ScheduleItem[]>("/api/v1/medicines/today")
        .then((schedule) => {
          for (const item of schedule) {
            if (item.medicine.frequency === "as_needed") continue;
            for (const time of item.medicine.times) {
              const schedMinutes = timeToMinutes(time);
              const diff = nowMinutes - schedMinutes;
              const key = `${item.medicine.id}_${time}_${now.toDateString()}`;

              if (diff >= 0 && diff <= 5 && !checkedTimesRef.current.has(key)) {
                const alreadyLogged = item.logs.some(
                  (l) => l.scheduled_time === time && (l.status === "taken" || l.status === "skipped")
                );
                if (!alreadyLogged) {
                  checkedTimesRef.current.add(key);
                  new Notification("Medicine Reminder", {
                    body: `Time to take ${item.medicine.name}${item.medicine.dosage ? ` (${item.medicine.dosage})` : ""} — ${formatTime12(time)}`,
                    icon: "/icon-192x192.png",
                    tag: key,
                  });
                }
              }
            }
          }
        })
        .catch(() => {});
    }

    checkSchedule();
    intervalRef.current = setInterval(checkSchedule, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled]);

  async function handleEnable() {
    if (!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setPermissionState(perm as "default" | "granted" | "denied");
    if (perm === "granted") {
      setEnabled(true);
      localStorage.setItem("medsign_reminders", "true");
    }
  }

  function handleDisable() {
    setEnabled(false);
    localStorage.removeItem("medsign_reminders");
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  if (typeof window === "undefined" || !("Notification" in window)) return null;

  if (permissionState === "denied") {
    return (
      <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
        <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <p className="text-xs text-gray-500">Notifications blocked. Enable them in browser settings to get medicine reminders.</p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <button
        onClick={handleEnable}
        className="w-full flex items-center gap-3 bg-blue-50 rounded-xl px-4 py-3 border border-blue-100 hover:bg-blue-100 transition-all"
      >
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <div className="text-left">
          <p className="text-xs font-bold text-blue-800">Enable Reminders</p>
          <p className="text-[10px] text-blue-600">Get notified when it's time to take your medicine</p>
        </div>
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-100">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-bold text-emerald-800">Reminders Active</p>
          <p className="text-[10px] text-emerald-600">You'll be notified at each scheduled time</p>
        </div>
      </div>
      <button onClick={handleDisable} className="text-[11px] text-emerald-600 hover:text-emerald-800 font-medium">
        Turn off
      </button>
    </div>
  );
}
