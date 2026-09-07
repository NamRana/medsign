"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createDeviceConnection,
  disconnectDeviceConnection,
  getDeviceHub,
  startAssessmentWithDeviceReadings,
  submitVitalObservations,
  updateDeviceConnection,
  type DeviceConnection,
  type DeviceMetricType,
  type DeviceProvider,
  type DeviceHubSnapshot,
  type VitalObservationInput,
} from "@/lib/api";
import {
  getNativeHealthHubStatus,
  readNativeHealthVitals,
  requestNativeHealthPermissions,
  type NativeHealthHubStatus,
  type NativeHealthMetric,
  type NativeVitalReading,
} from "@/lib/health-hub";

type MetricDefinition = {
  id: NativeHealthMetric;
  apiTypes: readonly DeviceMetricType[];
  label: string;
  description: string;
  icon: string;
  unit: string;
};

type PendingNativeImport = {
  connection: DeviceConnection;
  metrics: NativeHealthMetric[];
  readings: NativeVitalReading[];
  displayName: string;
  healthKitReview: boolean;
};

const METRICS: MetricDefinition[] = [
  {
    id: "heartRate",
    apiTypes: ["heart_rate"],
    label: "Heart rate",
    description: "Beats per minute",
    icon: "♡",
    unit: "bpm",
  },
  {
    id: "restingHeartRate",
    apiTypes: ["resting_heart_rate"],
    label: "Resting heart rate",
    description: "Your at-rest baseline",
    icon: "◌",
    unit: "bpm",
  },
  {
    id: "oxygenSaturation",
    apiTypes: ["spo2"],
    label: "Oxygen saturation",
    description: "Percent from a compatible device",
    icon: "◒",
    unit: "%",
  },
  {
    id: "bloodPressure",
    apiTypes: ["systolic_bp", "diastolic_bp"],
    label: "Blood pressure",
    description: "Systolic and diastolic readings",
    icon: "↯",
    unit: "mmHg",
  },
  {
    id: "bodyTemperature",
    apiTypes: ["temperature"],
    label: "Temperature",
    description: "From compatible sensors",
    icon: "∿",
    unit: "°C",
  },
  {
    id: "weight",
    apiTypes: ["weight"],
    label: "Weight",
    description: "From a connected scale",
    icon: "◇",
    unit: "kg",
  },
  {
    id: "steps",
    apiTypes: ["steps"],
    label: "Activity",
    description: "Daily steps only",
    icon: "⌁",
    unit: "steps",
  },
  {
    id: "sleep",
    apiTypes: ["sleep_duration"],
    label: "Sleep duration",
    description: "Minutes of recorded sleep",
    icon: "☾",
    unit: "min",
  },
];

const ESSENTIAL_METRICS: NativeHealthMetric[] = [
  "heartRate",
  "oxygenSaturation",
  "bloodPressure",
  "sleep",
];

const EMPTY_HUB: DeviceHubSnapshot = {
  connections: [],
  latest_observations: [],
  supported_providers: [],
  consent_note: "Choose exactly which health readings you want to share. You can disconnect at any time.",
};

function DeviceGlyph({ kind, className = "w-5 h-5" }: { kind: "apple" | "android" | "fitbit" | "garmin" | "device" | "shield" | "spark"; className?: string }) {
  if (kind === "apple") {
    return <span className={`${className} inline-grid place-items-center text-lg leading-none`} aria-hidden="true">●</span>;
  }
  if (kind === "android") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" d="M8 8.2 6.5 5.8M16 8.2l1.5-2.4M7 10.5h10v7A2.5 2.5 0 0 1 14.5 20h-5A2.5 2.5 0 0 1 7 17.5v-7Z" />
        <path strokeLinecap="round" d="M5.4 11.5v5M18.6 11.5v5" />
        <circle cx="10" cy="12.7" r=".55" fill="currentColor" stroke="none" />
        <circle cx="14" cy="12.7" r=".55" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (kind === "garmin") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m5 17 5.4-10 2.25 4.8L19 9l-5.4 10-2.25-4.8L5 17Z" />
      </svg>
    );
  }
  if (kind === "fitbit") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="8" cy="7" r="1.25" /><circle cx="12" cy="5" r="1.25" /><circle cx="16" cy="7" r="1.25" />
        <circle cx="6" cy="11" r="1.25" /><circle cx="10" cy="9" r="1.25" /><circle cx="14" cy="9" r="1.25" /><circle cx="18" cy="11" r="1.25" />
        <circle cx="8" cy="15" r="1.25" /><circle cx="12" cy="13" r="1.25" /><circle cx="16" cy="15" r="1.25" /><circle cx="12" cy="17" r="1.25" />
      </svg>
    );
  }
  if (kind === "shield") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 20 6.5V12c0 4.85-3.37 7.85-8 9-4.63-1.15-8-4.15-8-9V6.5L12 3Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.5 12 2.2 2.2 4.8-4.9" />
      </svg>
    );
  }
  if (kind === "spark") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7L12 3Z" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="6" y="3" width="12" height="18" rx="3" />
      <path strokeLinecap="round" d="M9 8h6M9 12h4" />
    </svg>
  );
}

function formatValue(value: number, unit: string | null): string {
  const formatted = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
  if (!unit) return formatted;
  return unit === "percent" || unit === "%" ? `${formatted}%` : `${formatted} ${unit}`;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "Not synced yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function metricDefinition(metricType: string): MetricDefinition | undefined {
  return METRICS.find((metric) => metric.apiTypes.some((apiType) => apiType === metricType));
}

function metricLabel(metricType: string): string {
  const definition = metricDefinition(metricType);
  return definition?.label || metricType.replace(/_/g, " ");
}

function nativeMetricsForConnection(connection: DeviceConnection): NativeHealthMetric[] {
  const granted = new Set(connection.granted_metric_types);
  return METRICS
    .filter((metric) => metric.apiTypes.some((apiType) => granted.has(apiType)))
    .map((metric) => metric.id);
}

function providerName(provider: DeviceProvider): string {
  const names: Record<string, string> = {
    apple_health: "Apple Health",
    health_connect: "Health Connect",
    fitbit: "Fitbit",
    garmin: "Garmin",
    oura: "Oura",
    withings: "Withings",
    bluetooth: "Bluetooth device",
  };
  return names[provider] || provider.replace(/_/g, " ");
}

function friendlyError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something interrupted this action. Please try again.";
}

export default function DeviceHubPage() {
  const router = useRouter();
  const [hub, setHub] = useState<DeviceHubSnapshot>(EMPTY_HUB);
  const [nativeStatus, setNativeStatus] = useState<NativeHealthHubStatus | null>(null);
  const [requestedMetrics, setRequestedMetrics] = useState<NativeHealthMetric[]>([]);
  const [selectedObservationIds, setSelectedObservationIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [startingAssessment, setStartingAssessment] = useState(false);
  const [showAssessmentConfirm, setShowAssessmentConfirm] = useState(false);
  const [pendingNativeImport, setPendingNativeImport] = useState<PendingNativeImport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshHub = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    setError(null);
    try {
      const [snapshot, status] = await Promise.all([getDeviceHub(), getNativeHealthHubStatus()]);
      setHub({
        connections: snapshot.connections || [],
        latest_observations: snapshot.latest_observations || [],
        supported_providers: snapshot.supported_providers || [],
        consent_note: snapshot.consent_note || EMPTY_HUB.consent_note,
      });
      setNativeStatus(status);

      // Returning to Device Hub should not make an existing consent look like
      // it vanished. Restore the already-approved metric choices, while never
      // overwriting a selection the person is actively changing this visit.
      const nativeProvider = status.platform === "ios"
        ? "apple_health"
        : status.platform === "android"
          ? "health_connect"
          : null;
      const existingNativeConnection = nativeProvider
        ? (snapshot.connections || []).find(
          (connection) => connection.provider === nativeProvider && connection.status !== "disconnected"
        )
        : undefined;
      if (existingNativeConnection) {
        const restoredMetrics = nativeMetricsForConnection(existingNativeConnection);
        setRequestedMetrics((current) => current.length ? current : restoredMetrics);
      }
    } catch (loadError) {
      setError("Device Hub could not reach the secure data service. Your device data has not been changed.");
      setNativeStatus(await getNativeHealthHubStatus());
      // Keep a detailed error out of the primary UI; it can contain network implementation details.
      void loadError;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void refreshHub(), 0);
    return () => window.clearTimeout(loadTimer);
  }, [refreshHub]);

  const activeNativeProvider: DeviceProvider | null = nativeStatus?.platform === "ios"
    ? "apple_health"
    : nativeStatus?.platform === "android"
      ? "health_connect"
      : null;

  const nativeConnection = hub.connections.find(
    (connection) => connection.provider === activeNativeProvider && connection.status !== "disconnected"
  );

  const visibleObservations = useMemo(
    () => [...hub.latest_observations].sort((a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime()).slice(0, 12),
    [hub.latest_observations]
  );

  const selectedReadings = useMemo(
    () => visibleObservations.filter((observation) => selectedObservationIds.has(observation.id)),
    [selectedObservationIds, visibleObservations]
  );

  function toggleMetric(metric: NativeHealthMetric) {
    setRequestedMetrics((current) => current.includes(metric)
      ? current.filter((item) => item !== metric)
      : [...current, metric]);
  }

  function toggleObservation(id: string) {
    setSelectedObservationIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function readNativeData(metrics: NativeHealthMetric[]) {
    const endDate = new Date().toISOString();
    const startDate = new Date(new Date(endDate).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    return readNativeHealthVitals({ metrics, startDate, endDate, limit: 80 });
  }

  async function importReviewedNativeData(pending: PendingNativeImport) {
    const observations: VitalObservationInput[] = pending.readings.map((reading) => ({
      metric_type: reading.metric_type,
      value: reading.value,
      unit: reading.unit,
      observed_at: reading.observed_at,
      source: "health_store",
      // Native platforms do not always expose a source record ID. This stable
      // fallback makes repeated syncs idempotent without storing credentials.
      source_record_id: reading.source_record_id || `${reading.metric_type}:${reading.observed_at}:${reading.value}`,
      quality: "device_reported",
    }));

    // This runs only after the person reviews the returned readings and
    // presses "Import". Native data stays in memory until this point.
    const result = await submitVitalObservations({
      connection_id: pending.connection.id,
      observations,
    });

    const syncedApiMetrics = pending.metrics.flatMap(
      (metricId) => METRICS.find((metric) => metric.id === metricId)?.apiTypes || []
    );
    await updateDeviceConnection(pending.connection.id, {
      granted_metric_types: syncedApiMetrics,
      metadata: {
        platform: nativeStatus?.platform || "native",
        last_reading_count: pending.readings.length,
        last_imported_count: result.accepted,
      },
    });

    return result;
  }

  async function stageNativeImport(
    connection: DeviceConnection,
    metrics: NativeHealthMetric[],
    displayName: string,
    healthKitReview = false,
  ) {
    const readings = await readNativeData(metrics);
    if (!readings.length) {
      await refreshHub();
      setNotice(
        healthKitReview
          ? "Apple Health access was reviewed. No selected readings were returned; you can adjust access in Apple Health and try again."
          : `${displayName} is connected. No recent selected readings were available to review.`
      );
      return;
    }
    setPendingNativeImport({ connection, metrics, readings, displayName, healthKitReview });
  }

  async function handleNativeConnect() {
    setNotice(null);
    setError(null);
    if (!nativeStatus?.available || !activeNativeProvider) {
      if (nativeStatus?.platform === "android" && nativeStatus.needsProviderUpdate) {
        setNotice("Update Health Connect, then return here to choose the readings you want to share.");
      } else if (nativeStatus?.platform === "android" && nativeStatus.installed === false) {
        setNotice("Install Health Connect, then return here to choose the readings you want to share.");
      } else {
        setNotice("Apple Health and Health Connect are available in the MedSign mobile app. No browser health data is read.");
      }
      return;
    }
    if (!requestedMetrics.length) {
      setNotice("Choose at least one metric before requesting read access.");
      return;
    }

    setConnecting(true);
    try {
      const permission = await requestNativeHealthPermissions(requestedMetrics);
      const healthKitReview = permission.platform === "ios" && permission.permissionState === "review_in_health";
      if (healthKitReview && permission.authorizationRequestCompleted === false) {
        setNotice("Apple Health access was not completed. You can review the selected data types and try again.");
        return;
      }

      // HealthKit intentionally withholds per-type read grant state. A person
      // has still explicitly chosen these metrics, but only values HealthKit
      // actually returns are imported; this is never represented as a grant.
      const metricsToSync = healthKitReview
        ? requestedMetrics
        : permission.grantedMetrics.filter((metric) => requestedMetrics.includes(metric));
      if (!metricsToSync.length) {
        setNotice("No selected readings were approved. You can update the selection and try again at any time.");
        return;
      }

      const permittedApiMetrics = metricsToSync.flatMap(
        (metricId) => METRICS.find((metric) => metric.id === metricId)?.apiTypes || []
      );
      const displayName = activeNativeProvider === "apple_health" ? "Apple Health" : "Health Connect";
      const existing = hub.connections.find(
        (connection) => connection.provider === activeNativeProvider && connection.status !== "disconnected"
      );
      const connection = existing
        ? await updateDeviceConnection(existing.id, {
          granted_metric_types: permittedApiMetrics,
          metadata: {
            platform: permission.platform,
            permission_scope: "read_only",
            permission_state: permission.permissionState || "unknown",
          },
        })
        : await createDeviceConnection({
          provider: activeNativeProvider,
          display_name: displayName,
          granted_metric_types: permittedApiMetrics,
          metadata: {
            platform: permission.platform,
            permission_scope: "read_only",
            permission_state: permission.permissionState || "unknown",
          },
        });

      setRequestedMetrics(metricsToSync);
      await stageNativeImport(connection, metricsToSync, displayName, healthKitReview);
    } catch (connectError) {
      setError(friendlyError(connectError));
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    if (!nativeConnection || !requestedMetrics.length) {
      setNotice("Choose the readings you want to refresh, then use Connect & sync.");
      return;
    }
    setConnecting(true);
    setNotice(null);
    setError(null);
    try {
      await stageNativeImport(
        nativeConnection,
        requestedMetrics,
        providerName(nativeConnection.provider),
        nativeStatus?.platform === "ios",
      );
    } catch (syncError) {
      setError(friendlyError(syncError));
    } finally {
      setConnecting(false);
    }
  }

  async function handleNativeImportConfirm() {
    if (!pendingNativeImport) return;
    const pending = pendingNativeImport;
    setConnecting(true);
    setError(null);
    try {
      const result = await importReviewedNativeData(pending);
      setPendingNativeImport(null);
      await refreshHub();
      const imported = result.accepted;
      const duplicateNote = result.duplicates
        ? ` ${result.duplicates} already-imported reading${result.duplicates === 1 ? " was" : "s were"} skipped.`
        : "";
      setNotice(
        imported
          ? `${imported} reviewed reading${imported === 1 ? " was" : "s were"} added to your private timeline.${duplicateNote}`
          : `No new readings were added to your private timeline.${duplicateNote}`
      );
    } catch (importError) {
      setError(friendlyError(importError));
    } finally {
      setConnecting(false);
    }
  }

  function handleNativeImportCancel() {
    setPendingNativeImport(null);
    setNotice("Those device readings stayed on your phone and were not imported.");
  }

  async function handleDisconnect(connection: DeviceConnection) {
    const confirmed = window.confirm(`Disconnect ${connection.display_name || providerName(connection.provider)}? This stops future imports; readings already added to your private timeline are retained as part of your care record.`);
    if (!confirmed) return;
    setDisconnectingId(connection.id);
    setError(null);
    try {
      await disconnectDeviceConnection(connection.id);
      await refreshHub();
      setNotice(`${connection.display_name || providerName(connection.provider)} was disconnected. No future readings will be imported.`);
    } catch (disconnectError) {
      setError(friendlyError(disconnectError));
    } finally {
      setDisconnectingId(null);
    }
  }

  async function handleAssessmentConfirm() {
    setStartingAssessment(true);
    setError(null);
    try {
      const conversation = await startAssessmentWithDeviceReadings(selectedReadings);
      router.push(`/chat?id=${conversation.id}`);
    } catch (assessmentError) {
      setError(friendlyError(assessmentError));
      setShowAssessmentConfirm(false);
    } finally {
      setStartingAssessment(false);
    }
  }

  const mobileSource = nativeStatus?.platform === "ios" ? "Apple Health" : "Health Connect";
  const mobileSourceIcon: "apple" | "android" = nativeStatus?.platform === "ios" ? "apple" : "android";
  const isWeb = nativeStatus?.platform === "web" || !nativeStatus;

  return (
    <div className="care-os care-grid min-h-screen pb-24 sm:pb-12">
      <style>{`
        @keyframes deviceHubEnter { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes deviceHubOrbit { 0%, 100% { transform: rotate(0deg) scale(1); } 50% { transform: rotate(180deg) scale(1.08); } }
        .device-hub-enter { animation: deviceHubEnter .55s cubic-bezier(.16,1,.3,1) both; }
        .device-hub-enter-delay { animation-delay: .1s; }
        .device-hub-enter-delay-2 { animation-delay: .2s; }
        .device-hub-orbit { animation: deviceHubOrbit 12s ease-in-out infinite; }
        .device-source-card { transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease; }
        .device-source-card:hover { transform: translateY(-2px); border-color: rgba(45,212,191,.62); box-shadow: 0 20px 42px rgba(8,47,73,.11); }
        .device-metric-toggle { transition: background .2s ease, border-color .2s ease, transform .2s ease; }
        .device-metric-toggle:hover { transform: translateY(-1px); }
        .device-selection-ring { box-shadow: 0 0 0 4px rgba(45,212,191,.14); }
        @media (prefers-reduced-motion: reduce) { .device-hub-enter, .device-hub-orbit { animation: none; } .device-source-card, .device-metric-toggle { transition: none; } .device-source-card:hover, .device-metric-toggle:hover { transform: none; } }
      `}</style>

      <header className="care-hero relative border-b border-white/10">
        <div className="care-content max-w-6xl mx-auto px-5 sm:px-8 py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="w-10 h-10 grid place-items-center rounded-xl bg-white/10 text-white/80 border border-white/10 hover:bg-white/15 hover:text-white transition-colors"
            aria-label="Back to settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m15 18-6-6 6-6" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="care-eyebrow mb-1">Care OS / connected health</p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Device Hub</h1>
          </div>
          <span className="care-live hidden min-[380px]:inline-flex"><span className="care-live-dot" />Read-only</span>
        </div>
      </header>

      <main className="care-content max-w-6xl mx-auto px-5 sm:px-8 py-6 sm:py-9">
        <section className="device-hub-enter care-hero relative rounded-[2rem] overflow-hidden px-6 py-7 sm:px-9 sm:py-10 mb-6">
          <div className="absolute -right-9 -bottom-14 w-56 h-56 rounded-full border border-cyan-200/20 device-hub-orbit" />
          <div className="absolute right-14 top-9 w-20 h-20 rounded-full border border-teal-200/20 device-hub-orbit [animation-delay:-5s]" />
          <div className="relative z-10 max-w-2xl">
            <span className="care-live mb-5"><span className="care-live-dot" />Your permission, every time</span>
            <h2 className="text-3xl sm:text-4xl font-bold leading-[1.06] tracking-tight text-white">Your body&apos;s signals, <span className="text-teal-200">on your terms.</span></h2>
            <p className="mt-4 max-w-xl text-sm sm:text-base leading-relaxed text-teal-50/74">
              Connect readings from your phone&apos;s health store. Choose each metric, review each reading, and decide exactly what enters an assessment.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2.5 text-xs text-teal-50/78">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/10 px-3 py-1.5"><DeviceGlyph kind="shield" className="w-3.5 h-3.5" />Read-only access</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/10 px-3 py-1.5"><DeviceGlyph kind="spark" className="w-3.5 h-3.5" />Source-labelled context</span>
            </div>
          </div>
        </section>

        {(notice || error) && (
          <div className={`device-hub-enter mb-6 rounded-2xl px-4 py-3 flex items-start gap-3 border ${error ? "bg-rose-50/90 border-rose-200 text-rose-800" : "bg-teal-50/90 border-teal-200 text-teal-900"}`} role={error ? "alert" : "status"}>
            <span className={`mt-0.5 grid place-items-center w-5 h-5 rounded-full text-[11px] font-bold ${error ? "bg-rose-500 text-white" : "bg-teal-600 text-white"}`}>{error ? "!" : "✓"}</span>
            <p className="flex-1 text-sm leading-relaxed">{error || notice}</p>
            <button type="button" onClick={() => { setNotice(null); setError(null); }} className="text-current/60 hover:text-current p-1" aria-label="Dismiss message">×</button>
          </div>
        )}

        <section className="device-hub-enter device-hub-enter-delay grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <div className="space-y-6">
            <div className="care-panel rounded-3xl p-5 sm:p-6">
              <div className="flex flex-wrap justify-between gap-4 mb-5">
                <div>
                  <p className="text-[10px] uppercase tracking-[.16em] font-extrabold text-teal-700">01 / choose data access</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">Select the signals you want to read</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">Nothing is imported until you approve your phone&apos;s system permission prompt.</p>
                </div>
                <div className="flex h-fit items-center gap-2 text-xs font-semibold">
                  <button type="button" onClick={() => setRequestedMetrics(ESSENTIAL_METRICS)} className="rounded-xl px-3 py-2 text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-100 transition-colors">Essentials</button>
                  <button type="button" onClick={() => setRequestedMetrics([])} className="rounded-xl px-3 py-2 text-slate-500 hover:bg-slate-50 border border-slate-200 transition-colors">Clear</button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {METRICS.map((metric) => {
                  const selected = requestedMetrics.includes(metric.id);
                  return (
                    <button
                      key={metric.id}
                      type="button"
                      onClick={() => toggleMetric(metric.id)}
                      aria-pressed={selected}
                      className={`device-metric-toggle group min-h-[74px] flex items-center gap-3 text-left rounded-2xl border px-3.5 py-3 ${selected ? "bg-teal-50/90 border-teal-400 device-selection-ring" : "bg-white/55 border-slate-200 hover:border-teal-300"}`}
                    >
                      <span className={`grid place-items-center w-9 h-9 rounded-xl text-lg font-bold ${selected ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500"}`}>{metric.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-slate-800">{metric.label}</span>
                        <span className="block mt-0.5 text-[11px] leading-snug text-slate-500">{metric.description}</span>
                      </span>
                      <span className={`grid place-items-center shrink-0 w-5 h-5 rounded-full border ${selected ? "bg-teal-600 border-teal-600 text-white" : "border-slate-300 text-transparent"}`} aria-hidden="true">✓</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 rounded-2xl bg-slate-950 px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 flex items-start gap-2.5">
                  <span className="mt-0.5 text-teal-300"><DeviceGlyph kind="shield" className="w-4 h-4" /></span>
                  <p className="text-xs leading-relaxed text-slate-300">{hub.consent_note || EMPTY_HUB.consent_note}</p>
                </div>
                <span className="inline-flex shrink-0 items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold tracking-wide uppercase text-teal-200">{requestedMetrics.length} selected</span>
              </div>
            </div>

            <div className="care-panel rounded-3xl p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3 mb-5">
                <div>
                  <p className="text-[10px] uppercase tracking-[.16em] font-extrabold text-teal-700">02 / connect a source</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">Your phone&apos;s health store</h2>
                </div>
                {nativeStatus?.available && <span className="text-[10px] font-bold uppercase tracking-[.12em] text-teal-700 bg-teal-50 border border-teal-100 px-2.5 py-1.5 rounded-full">Mobile ready</span>}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className={`device-source-card rounded-2xl border p-4 ${nativeStatus?.platform === "ios" ? "bg-gradient-to-br from-slate-950 to-slate-800 border-slate-700 text-white" : "bg-white/60 border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className={`grid place-items-center w-10 h-10 rounded-xl ${nativeStatus?.platform === "ios" ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}><DeviceGlyph kind="apple" /></span>
                    {hub.connections.some((connection) => connection.provider === "apple_health" && connection.status !== "disconnected") && <span className="text-[10px] font-bold uppercase tracking-wide text-teal-300">Connected</span>}
                  </div>
                  <h3 className={`mt-4 font-bold ${nativeStatus?.platform === "ios" ? "text-white" : "text-slate-800"}`}>Apple Health</h3>
                  <p className={`mt-1 min-h-10 text-xs leading-relaxed ${nativeStatus?.platform === "ios" ? "text-slate-300" : "text-slate-500"}`}>Apple Watch and compatible health-device readings via HealthKit.</p>
                  <button type="button" onClick={handleNativeConnect} disabled={connecting || (nativeStatus?.platform === "android")} className={`mt-4 w-full rounded-xl px-3 py-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${nativeStatus?.platform === "ios" ? "bg-teal-300 hover:bg-teal-200 text-teal-950" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}>
                    {nativeStatus?.platform === "ios" ? (connecting ? "Connecting…" : nativeConnection ? "Update access" : "Connect Apple Health") : "Use on iPhone"}
                  </button>
                </div>

                <div className={`device-source-card rounded-2xl border p-4 ${nativeStatus?.platform === "android" ? "bg-gradient-to-br from-cyan-950 to-teal-900 border-teal-800 text-white" : "bg-white/60 border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className={`grid place-items-center w-10 h-10 rounded-xl ${nativeStatus?.platform === "android" ? "bg-white/10 text-teal-100" : "bg-emerald-50 text-emerald-600"}`}><DeviceGlyph kind="android" /></span>
                    {hub.connections.some((connection) => connection.provider === "health_connect" && connection.status !== "disconnected") && <span className="text-[10px] font-bold uppercase tracking-wide text-teal-200">Connected</span>}
                  </div>
                  <h3 className={`mt-4 font-bold ${nativeStatus?.platform === "android" ? "text-white" : "text-slate-800"}`}>Health Connect</h3>
                  <p className={`mt-1 min-h-10 text-xs leading-relaxed ${nativeStatus?.platform === "android" ? "text-teal-100/75" : "text-slate-500"}`}>Android&apos;s private health-data store for compatible apps and devices.</p>
                  <button type="button" onClick={handleNativeConnect} disabled={connecting || (nativeStatus?.platform === "ios")} className={`mt-4 w-full rounded-xl px-3 py-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${nativeStatus?.platform === "android" ? "bg-teal-200 hover:bg-teal-100 text-teal-950" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}>
                    {nativeStatus?.platform === "android" ? (connecting ? "Connecting…" : nativeStatus.needsProviderUpdate ? "Update Health Connect" : nativeStatus.installed === false ? "Install Health Connect" : nativeConnection ? "Update access" : "Connect Health Connect") : "Use on Android"}
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/65 p-3.5 flex gap-3">
                <span className="grid place-items-center shrink-0 w-8 h-8 rounded-xl bg-white text-cyan-700 border border-cyan-100"><DeviceGlyph kind="device" className="w-4 h-4" /></span>
                <p className="text-xs leading-relaxed text-slate-600">
                  {isWeb
                    ? "You are viewing Device Hub on the web. Use the MedSign iOS or Android app to approve Apple Health or Health Connect access."
                    : `${mobileSource} only exposes the readings selected above. MedSign requests read-only access and cannot change your device data.`}
                </p>
              </div>

              {nativeConnection && (
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-teal-950">{nativeConnection.display_name || providerName(nativeConnection.provider)} is connected</p>
                    <p className="mt-0.5 text-xs text-teal-800/75">Last sync: {formatTime(nativeConnection.last_synced_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleSync} disabled={connecting} className="rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 px-3 py-2 text-xs font-bold text-white transition-colors">{connecting ? "Syncing…" : "Refresh"}</button>
                    <button type="button" onClick={() => void handleDisconnect(nativeConnection)} disabled={disconnectingId === nativeConnection.id} className="rounded-xl border border-teal-200 hover:bg-white disabled:opacity-60 px-3 py-2 text-xs font-bold text-teal-800 transition-colors">{disconnectingId === nativeConnection.id ? "Disconnecting…" : "Disconnect"}</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-6">
            <section className="care-signal-panel relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white">
              <div className="relative z-10 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[.16em] font-extrabold text-teal-200/70">Signal status</p>
                  <h2 className="mt-1.5 text-2xl font-bold">{hub.connections.filter((connection) => connection.status !== "disconnected").length} source{hub.connections.filter((connection) => connection.status !== "disconnected").length === 1 ? "" : "s"} active</h2>
                </div>
                <span className="grid place-items-center w-11 h-11 rounded-2xl bg-white/10 border border-white/10 text-teal-200"><DeviceGlyph kind={mobileSourceIcon} className="w-5 h-5" /></span>
              </div>
              <div className="relative z-10 mt-6 grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl bg-white/[.07] border border-white/[.08] p-3">
                  <span className="block text-xl font-bold text-white">{visibleObservations.length}</span>
                  <span className="mt-1 block text-[10px] uppercase tracking-wide font-bold text-teal-100/65">Recent readings</span>
                </div>
                <div className="rounded-2xl bg-white/[.07] border border-white/[.08] p-3">
                  <span className="block text-xl font-bold text-white">{requestedMetrics.length}</span>
                  <span className="mt-1 block text-[10px] uppercase tracking-wide font-bold text-teal-100/65">Access choices</span>
                </div>
              </div>
              <p className="relative z-10 mt-5 text-xs leading-relaxed text-teal-50/70">Device information can help provide context, but it does not diagnose a condition or replace care from a licensed clinician.</p>
            </section>

            <section className="care-panel rounded-3xl p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[.16em] font-extrabold text-teal-700">Future sources</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">More connections, responsibly</h2>
                </div>
                <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">In design</span>
              </div>
              <div className="space-y-2.5">
                {[
                  { provider: "fitbit", label: "Fitbit", description: "Account connection", icon: "fitbit" as const },
                  { provider: "garmin", label: "Garmin", description: "Account connection", icon: "garmin" as const },
                  { provider: "bluetooth", label: "Clinical Bluetooth", description: "BP cuffs, scales & more", icon: "device" as const },
                ].map((source) => (
                  <div key={source.provider} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white/55 px-3.5 py-3">
                    <span className="grid place-items-center shrink-0 w-9 h-9 rounded-xl bg-slate-100 text-slate-600"><DeviceGlyph kind={source.icon} className="w-4 h-4" /></span>
                    <span className="flex-1 min-w-0"><span className="block text-sm font-bold text-slate-800">{source.label}</span><span className="block text-[11px] text-slate-500">{source.description}</span></span>
                    <button type="button" onClick={() => setNotice(`${source.label} account linking is being prepared. No account or health data was shared.`)} className="shrink-0 rounded-xl px-2.5 py-2 text-[11px] font-bold text-teal-700 hover:bg-teal-50 transition-colors">Details</button>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>

        <section className="device-hub-enter device-hub-enter-delay-2 mt-6 care-panel rounded-3xl overflow-hidden">
          <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-teal-50/90">
            <div>
              <p className="text-[10px] uppercase tracking-[.16em] font-extrabold text-teal-700">03 / review before sharing</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">Recent device readings</h2>
              <p className="mt-1 text-sm text-slate-500">Select individual entries to include in a new assessment. Nothing is sent to Care AI until you confirm.</p>
            </div>
            <button type="button" onClick={() => void refreshHub(true)} disabled={refreshing} className="rounded-xl border border-teal-200 bg-white hover:bg-teal-50 disabled:opacity-60 px-3.5 py-2.5 text-xs font-bold text-teal-800 transition-colors">{refreshing ? "Refreshing…" : "Refresh timeline"}</button>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-5 sm:p-6 animate-pulse">
              {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-24 rounded-2xl bg-slate-100" />)}
            </div>
          ) : visibleObservations.length ? (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-5 sm:p-6">
                {visibleObservations.map((observation) => {
                  const definition = metricDefinition(observation.metric_type);
                  const selected = selectedObservationIds.has(observation.id);
                  return (
                    <button key={observation.id} type="button" onClick={() => toggleObservation(observation.id)} aria-pressed={selected} className={`device-metric-toggle relative text-left rounded-2xl border px-4 py-3.5 ${selected ? "border-teal-400 bg-teal-50 device-selection-ring" : "border-slate-200 bg-white/65 hover:border-teal-300"}`}>
                      <span className={`absolute right-3 top-3 grid place-items-center w-5 h-5 rounded-full border text-[10px] ${selected ? "bg-teal-600 border-teal-600 text-white" : "border-slate-300 text-transparent"}`} aria-hidden="true">✓</span>
                      <div className="flex items-center gap-2.5 pr-6">
                        <span className={`grid place-items-center w-9 h-9 rounded-xl text-base ${selected ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500"}`}>{definition?.icon || "✦"}</span>
                        <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 truncate">{metricLabel(observation.metric_type)}</p><p className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{formatValue(observation.value, observation.unit)}</p></div>
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px] font-medium text-slate-500"><span className="truncate">{observation.source || providerName(observation.provider || "connected_device")}</span><span className="shrink-0">{formatTime(observation.observed_at)}</span></div>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-teal-50/90 bg-slate-950 px-5 py-4 sm:px-6 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1"><p className="text-sm font-bold text-white">{selectedReadings.length ? `${selectedReadings.length} reading${selectedReadings.length === 1 ? "" : "s"} selected` : "Choose readings to add"}</p><p className="mt-0.5 text-xs text-slate-400">Only these selected, source-labelled entries will be added to a new assessment.</p></div>
                <button type="button" onClick={() => setShowAssessmentConfirm(true)} disabled={!selectedReadings.length || startingAssessment} className="rounded-xl bg-teal-300 hover:bg-teal-200 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed px-4 py-3 text-sm font-extrabold text-teal-950 transition-colors">Add to new assessment <span aria-hidden="true">→</span></button>
              </div>
            </>
          ) : (
            <div className="p-8 sm:p-12 text-center">
              <span className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-teal-50 text-teal-700 border border-teal-100"><DeviceGlyph kind="device" className="w-6 h-6" /></span>
              <h3 className="mt-4 text-lg font-bold text-slate-900">No readings in your timeline yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">Choose the metrics you want, then connect through the MedSign mobile app. You&apos;ll review imported readings here before using them in an assessment.</p>
            </div>
          )}
        </section>

        {hub.connections.filter((connection) => connection.status !== "disconnected" && connection.id !== nativeConnection?.id).length > 0 && (
          <section className="mt-6 care-panel rounded-3xl p-5 sm:p-6">
            <p className="text-[10px] uppercase tracking-[.16em] font-extrabold text-teal-700">Connected sources</p>
            <div className="mt-3 grid sm:grid-cols-2 gap-3">
              {hub.connections.filter((connection) => connection.status !== "disconnected" && connection.id !== nativeConnection?.id).map((connection) => (
                <div key={connection.id} className="rounded-2xl border border-slate-100 bg-white/55 p-4 flex items-center gap-3">
                  <span className="grid place-items-center w-10 h-10 rounded-xl bg-teal-50 text-teal-700"><DeviceGlyph kind="device" className="w-5 h-5" /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{connection.display_name || providerName(connection.provider)}</p><p className="mt-0.5 text-[11px] text-slate-500">Last sync: {formatTime(connection.last_synced_at)}</p></div>
                  <button type="button" onClick={() => void handleDisconnect(connection)} disabled={disconnectingId === connection.id} className="rounded-xl px-2.5 py-2 text-xs font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-60">{disconnectingId === connection.id ? "…" : "Disconnect"}</button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {pendingNativeImport && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/55 p-3 sm:p-6" role="presentation">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/30 bg-white p-6 shadow-2xl shadow-slate-950/30" role="dialog" aria-modal="true" aria-labelledby="device-import-title">
            <div className="flex items-start gap-3">
              <span className="grid place-items-center w-11 h-11 rounded-2xl bg-cyan-50 text-cyan-700 border border-cyan-100"><DeviceGlyph kind="shield" className="w-5 h-5" /></span>
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-[.15em] font-extrabold text-cyan-700">Review before import</p>
                <h2 id="device-import-title" className="mt-1 text-xl font-bold text-slate-900">Import {pendingNativeImport.readings.length} reading{pendingNativeImport.readings.length === 1 ? "" : "s"}?</h2>
              </div>
            </div>
            <div className="mt-5 rounded-2xl bg-cyan-50/80 border border-cyan-100 px-4 py-3">
              <p className="text-sm leading-relaxed text-cyan-950">These readings were returned by {pendingNativeImport.displayName}. They are still only on your phone. Confirm to add them to your private timeline; sharing any of them with Care AI remains a separate choice.</p>
            </div>
            {pendingNativeImport.healthKitReview && (
              <p className="mt-3 text-xs leading-relaxed text-slate-500">Apple Health does not reveal which individual read permissions were granted. This list contains only values HealthKit returned.</p>
            )}
            <div className="mt-5 max-h-52 overflow-y-auto divide-y divide-slate-100 rounded-2xl border border-slate-100">
              {pendingNativeImport.readings.map((reading, index) => (
                <div key={`${reading.source_record_id || reading.metric_type}-${reading.observed_at}-${index}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                  <span className="min-w-0"><span className="block font-bold capitalize text-slate-700">{metricLabel(reading.metric_type)}</span><span className="mt-0.5 block text-[10px] text-slate-500">{formatTime(reading.observed_at)}</span></span>
                  <span className="shrink-0 font-semibold text-slate-600">{formatValue(reading.value, reading.unit)}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
              <button type="button" onClick={handleNativeImportCancel} disabled={connecting} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60">Keep on my phone</button>
              <button type="button" onClick={() => void handleNativeImportConfirm()} disabled={connecting} className="rounded-xl bg-cyan-700 hover:bg-cyan-800 disabled:opacity-60 px-4 py-3 text-sm font-bold text-white">{connecting ? "Importing…" : "Confirm private import"}</button>
            </div>
          </div>
        </div>
      )}

      {showAssessmentConfirm && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/55 p-3 sm:p-6" role="presentation">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/30 bg-white p-6 shadow-2xl shadow-slate-950/30" role="dialog" aria-modal="true" aria-labelledby="device-assessment-title">
            <div className="flex items-start gap-3">
              <span className="grid place-items-center w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 border border-teal-100"><DeviceGlyph kind="shield" className="w-5 h-5" /></span>
              <div className="flex-1"><p className="text-[10px] uppercase tracking-[.15em] font-extrabold text-teal-700">Confirm context sharing</p><h2 id="device-assessment-title" className="mt-1 text-xl font-bold text-slate-900">Add {selectedReadings.length} reading{selectedReadings.length === 1 ? "" : "s"} to a new assessment?</h2></div>
            </div>
            <div className="mt-5 rounded-2xl bg-teal-50/80 border border-teal-100 px-4 py-3"><p className="text-sm leading-relaxed text-teal-950">The selected readings will appear as source-labelled context in your new Care AI conversation. They are not a diagnosis, prescription, or emergency-service substitute.</p></div>
            <div className="mt-5 max-h-36 overflow-y-auto divide-y divide-slate-100 rounded-2xl border border-slate-100">
              {selectedReadings.map((reading) => <div key={reading.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"><span className="font-bold capitalize text-slate-700">{metricLabel(reading.metric_type)}</span><span className="text-slate-500">{formatValue(reading.value, reading.unit)} · {formatTime(reading.observed_at)}</span></div>)}
            </div>
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
              <button type="button" onClick={() => setShowAssessmentConfirm(false)} disabled={startingAssessment} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60">Go back</button>
              <button type="button" onClick={() => void handleAssessmentConfirm()} disabled={startingAssessment} className="rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 px-4 py-3 text-sm font-bold text-white">{startingAssessment ? "Opening assessment…" : "Confirm and start"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
