"use client";

import { useState } from "react";
import {
  getLatestVitalObservations,
  type VitalObservation,
} from "@/lib/api";

const METRIC_LABELS: Record<string, string> = {
  heart_rate: "Heart rate",
  resting_heart_rate: "Resting heart rate",
  spo2: "Blood oxygen",
  temperature: "Temperature",
  systolic_bp: "Systolic BP",
  diastolic_bp: "Diastolic BP",
  weight: "Weight",
  steps: "Steps",
  sleep_duration: "Sleep",
  respiratory_rate: "Respiratory rate",
  blood_glucose: "Blood glucose",
  hrv: "HRV",
};

function formatObservedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded time unavailable";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayProvider(reading: VitalObservation) {
  const provider = reading.source || reading.provider || "connected device";
  return provider.replace(/_/g, " ");
}

export default function DeviceAssessmentContext({
  disabled,
  onAttach,
}: {
  disabled?: boolean;
  onAttach: (readings: VitalObservation[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [readings, setReadings] = useState<VitalObservation[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function openPicker() {
    if (disabled) return;
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (!nextOpen || readings.length > 0 || isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      const latest = await getLatestVitalObservations(undefined, 12);
      setReadings(latest);
      setSelectedIds(new Set());
    } catch {
      setError("Could not load connected readings right now.");
    } finally {
      setIsLoading(false);
    }
  }

  function toggleReading(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function attachSelectedReadings() {
    const selected = readings.filter((reading) => selectedIds.has(reading.id));
    if (!selected.length) return;
    onAttach(selected);
    setIsOpen(false);
    setSelectedIds(new Set());
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { void openPicker(); }}
        disabled={disabled}
        aria-label="Choose connected device readings for this assessment"
        aria-expanded={isOpen}
        className="flex h-11 items-center gap-2 rounded-xl border border-cyan-100 bg-cyan-50/70 px-3 text-xs font-semibold text-cyan-800 transition-colors hover:border-cyan-200 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 12h3l2-6 4 12 2-6h5" />
        </svg>
        <span className="hidden sm:inline">Device readings</span>
        <span className="sm:hidden">Vitals</span>
      </button>

      {isOpen && (
        <section className="absolute bottom-14 left-0 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-cyan-100 bg-white shadow-2xl shadow-slate-900/15" aria-label="Select device readings">
          <div className="border-b border-cyan-50 bg-gradient-to-r from-cyan-50 to-teal-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-800">Add device context</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">Choose only readings you want to share in this assessment.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Close device readings">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-2">
            {isLoading && (
              <div className="flex items-center gap-2 px-2 py-6 text-xs text-slate-500">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-600" />
                Loading your approved readings…
              </div>
            )}
            {!isLoading && error && (
              <div className="px-2 py-4">
                <p className="text-xs text-rose-600">{error}</p>
                <a href="/devices" className="mt-2 inline-block text-xs font-semibold text-cyan-700 hover:text-cyan-900">Open Device Hub →</a>
              </div>
            )}
            {!isLoading && !error && readings.length === 0 && (
              <div className="px-2 py-4">
                <p className="text-xs leading-relaxed text-slate-500">No approved device readings are available yet.</p>
                <a href="/devices" className="mt-2 inline-block text-xs font-semibold text-cyan-700 hover:text-cyan-900">Connect health data →</a>
              </div>
            )}
            {!isLoading && !error && readings.map((reading) => {
              const selected = selectedIds.has(reading.id);
              return (
                <label key={reading.id} className={`flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors ${selected ? "bg-cyan-50" : "hover:bg-slate-50"}`}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleReading(reading.id)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold capitalize text-slate-700">{METRIC_LABELS[reading.metric_type] || reading.metric_type.replace(/_/g, " ")}</span>
                    <span className="block truncate text-[10px] text-slate-400">{formatObservedAt(reading.observed_at)} · {displayProvider(reading)}</span>
                  </span>
                  <span className="text-[11px] font-bold text-cyan-800">{reading.value}{reading.unit ? ` ${reading.unit}` : ""}</span>
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <span className="text-[10px] text-slate-400">{selectedIds.size} selected</span>
            <button
              type="button"
              onClick={attachSelectedReadings}
              disabled={selectedIds.size === 0}
              className="rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 px-3 py-2 text-[11px] font-semibold text-white shadow-sm transition-colors hover:from-cyan-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add to assessment
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
