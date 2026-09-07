import { Capacitor, registerPlugin } from "@capacitor/core";

/** Metric identifiers used by the native HealthHub bridge. */
export type NativeHealthMetric =
  | "heartRate"
  | "restingHeartRate"
  | "oxygenSaturation"
  | "bloodPressure"
  | "bodyTemperature"
  | "weight"
  | "steps"
  | "sleep";

export type NativeHealthPermissionState =
  | "granted"
  | "partial"
  | "denied"
  | "review_in_health"
  | "unknown";

export interface NativeHealthHubStatus {
  platform: "ios" | "android" | "web" | string;
  available: boolean;
  /** Android Health Connect installation state; not applicable on iOS. */
  installed?: boolean;
  /** Android detected Health Connect but requires a provider update. */
  needsProviderUpdate?: boolean;
  grantedMetrics: NativeHealthMetric[];
  requestedMetrics: NativeHealthMetric[];
  /**
   * HealthKit can confirm that its authorization sheet completed, but Apple
   * deliberately does not reveal per-type read grants. `review_in_health`
   * must therefore never be presented as a confirmed grant.
   */
  permissionState?: NativeHealthPermissionState;
  authorizationRequestCompleted?: boolean;
  readOnly?: boolean;
}

export interface NativeVitalReading {
  metric_type:
    | "heart_rate"
    | "resting_heart_rate"
    | "spo2"
    | "temperature"
    | "systolic_bp"
    | "diastolic_bp"
    | "weight"
    | "steps"
    | "sleep_duration";
  value: number;
  unit: "bpm" | "percent" | "celsius" | "mmHg" | "kg" | "count" | "minutes" | string;
  /** ISO timestamp, already normalized to the API field convention. */
  observed_at: string;
  /** A non-diagnostic source category, e.g. health_store. */
  source?: "health_store" | "bluetooth" | "device";
  source_record_id?: string;
}

interface NativeHealthHubRawStatus {
  platform: "ios" | "android" | "web" | string;
  available: boolean;
  installed?: boolean;
  needsProviderUpdate?: boolean;
  readOnly?: boolean;
  grantedMetrics?: string[];
  requestedMetrics?: string[];
  permissionState?: NativeHealthPermissionState;
  authorizationRequestCompleted?: boolean;
}

interface NativeHealthHubPlugin {
  getStatus(): Promise<NativeHealthHubRawStatus>;
  requestReadPermissions(options: { metrics: NativeHealthMetric[] }): Promise<NativeHealthHubRawStatus>;
  readVitals(options: {
    metrics: NativeHealthMetric[];
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<{ readings: NativeVitalReading[] }>;
}

const HealthHub = registerPlugin<NativeHealthHubPlugin>("HealthHub");

function browserStatus(): NativeHealthHubStatus {
  return {
    platform: "web",
    available: false,
    grantedMetrics: [],
    requestedMetrics: [],
  };
}

function normalizeMetric(metric: string): NativeHealthMetric | null {
  switch (metric) {
    case "heartRate":
    case "heart_rate":
      return "heartRate";
    case "restingHeartRate":
    case "resting_heart_rate":
      return "restingHeartRate";
    case "oxygenSaturation":
    case "oxygen_saturation":
    case "spo2":
      return "oxygenSaturation";
    case "bloodPressure":
    case "blood_pressure":
    case "systolic_bp":
    case "diastolic_bp":
      return "bloodPressure";
    case "bodyTemperature":
    case "body_temperature":
    case "temperature":
      return "bodyTemperature";
    case "weight":
      return "weight";
    case "steps":
      return "steps";
    case "sleep":
    case "sleep_duration":
      return "sleep";
    default:
      return null;
  }
}

function normalizeMetrics(metrics: string[] | undefined): NativeHealthMetric[] {
  return [...new Set((metrics || []).flatMap((metric) => {
    const normalized = normalizeMetric(metric);
    return normalized ? [normalized] : [];
  }))];
}

function normalizeStatus(status: NativeHealthHubRawStatus): NativeHealthHubStatus {
  return {
    platform: status.platform,
    available: status.available,
    installed: status.installed,
    needsProviderUpdate: status.needsProviderUpdate,
    readOnly: status.readOnly,
    // Do not fall back to requestedMetrics here. In HealthKit, a completed
    // permission sheet is deliberately not evidence that each read type was
    // granted; Apple returns no per-type grant status for reads.
    grantedMetrics: normalizeMetrics(status.grantedMetrics),
    requestedMetrics: normalizeMetrics(status.requestedMetrics),
    permissionState: status.permissionState,
    authorizationRequestCompleted: status.authorizationRequestCompleted,
  };
}

/**
 * Native HealthKit / Health Connect is intentionally unavailable in browsers.
 * The Device Hub uses this graceful status rather than pretending that browser
 * visitors have connected health data.
 */
export async function getNativeHealthHubStatus(): Promise<NativeHealthHubStatus> {
  if (!Capacitor.isNativePlatform()) return browserStatus();
  try {
    return normalizeStatus(await HealthHub.getStatus());
  } catch {
    return {
      platform: Capacitor.getPlatform(),
      available: false,
      grantedMetrics: [],
      requestedMetrics: [],
    };
  }
}

export async function requestNativeHealthPermissions(
  metrics: NativeHealthMetric[]
): Promise<NativeHealthHubStatus> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Health-device permissions are available in the MedSign mobile app.");
  }
  return normalizeStatus(await HealthHub.requestReadPermissions({ metrics }));
}

export async function readNativeHealthVitals(input: {
  metrics: NativeHealthMetric[];
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<NativeVitalReading[]> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Health-device readings are available in the MedSign mobile app.");
  }
  const result = await HealthHub.readVitals(input);
  return result.readings || [];
}
