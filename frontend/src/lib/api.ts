// Web mode: empty string (Next.js proxy handles /api/* forwarding)
// Mobile mode (Capacitor): call backend directly since proxy isn't available
const isCapacitor =
  typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).Capacitor;
const API_URL = isCapacitor
  ? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
  : "";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { createClient } = await import("@/lib/supabase");
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// --- Types ---

export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
  status: "active" | "completed" | "archived";
  chief_complaint: string | null;
  user_id: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  content_type?: "text" | "image" | "audio" | "structured";
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

// --- Base fetch (auth bypassed for dev) ---

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await getAuthHeaders()),
    ...(options.headers as Record<string, string>),
  };

  const response = await (async () => {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutMs = attempt === 1 ? 30000 : 60000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${API_URL}${path}`, {
          ...options,
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        return res;
      } catch (err: unknown) {
        clearTimeout(timeout);
        if (attempt < maxAttempts) continue;
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("Request timed out — the backend may be starting up. Please try again.");
        }
        const message = err instanceof Error ? err.message : "unknown error";
        throw new Error(`Network error — backend may be offline (${message})`);
      }
    }
    throw new Error("Network error — backend may be offline");
  })();

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `API error: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// --- Typed API functions ---

export async function getConversations(limit = 100, memberId?: string): Promise<Conversation[]> {
  const memberQ = memberId ? `&member=${memberId}` : "";
  return apiFetch<Conversation[]>(`/api/v1/conversations?limit=${limit}${memberQ}`);
}

export async function getConversation(
  id: string
): Promise<ConversationWithMessages> {
  return apiFetch<ConversationWithMessages>(`/api/v1/conversations/${id}`);
}

export async function closeConversation(id: string): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/v1/conversations/${id}/close`, {
    method: "POST",
  });
}

export async function createConversation(memberId?: string): Promise<Conversation> {
  const query = memberId ? `?member=${memberId}` : "";
  return apiFetch<Conversation>(`/api/v1/conversations${query}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function sendMessage(
  conversationId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<Message[]> {
  return apiFetch<Message[]>(
    `/api/v1/conversations/${conversationId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ content, ...(metadata ? { metadata } : {}) }),
    }
  );
}

// --- Audio Transcription Types ---

export interface AudioTranscriptionResponse {
  transcript: string;
  language_detected: string;
  user_message: Message;
  assistant_message: Message;
}

// --- Audio Upload ---

export async function sendAudio(
  conversationId: string,
  audioBlob: Blob
): Promise<AudioTranscriptionResponse> {
  const formData = new FormData();
  formData.append("file", audioBlob, "recording.webm");

  const response = await fetch(
    `${API_URL}/api/v1/audio/conversations/${conversationId}/audio`,
    {
      method: "POST",
      headers: await getAuthHeaders(),
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json() as Promise<AudioTranscriptionResponse>;
}

// --- Image Upload Types ---

export interface BoundingRegion {
  label: string;
  y_min: number;
  x_min: number;
  y_max: number;
  x_max: number;
}

export interface ObservationDetail {
  observation: string;
  severity: "info" | "mild" | "moderate" | "severe";
  region: BoundingRegion | null;
}

export interface ImageAnalysis {
  visual_observations: string[];
  possible_relevance: string;
  confidence: string;
  limitations: string[];
  recommendation: string;
  observations_detailed?: ObservationDetail[];
  overall_severity?: string;
  confidence_score?: number;
  suggested_specialist?: string;
  report_title?: string;
}

export interface ImageUploadResponse {
  id: string;
  storage_path: string;
  mime_type: string;
  analysis: ImageAnalysis;
  created_at: string;
}

// --- Image File URL ---

export async function getImageBlobUrl(imageId: string): Promise<string | null> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/api/v1/images/${imageId}/file`, { headers });
    if (!response.ok) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// --- Lab Report Types ---

export interface LabValue {
  id: string;
  test_name: string;
  value: string;
  unit: string | null;
  reference_range: string | null;
  is_abnormal: boolean | null;
  abnormality_direction: string | null;
  category: string | null;
}

export interface LabInterpretation {
  summary: string;
  abnormal_findings: string[];
  patient_friendly_explanation: string;
  recommendations: string[];
}

export interface LabReport {
  id: string;
  original_filename: string;
  mime_type: string;
  status: string;
  report_date: string | null;
  lab_name: string | null;
  lab_address: string | null;
  doctor_name: string | null;
  created_at: string;
  values: LabValue[];
  interpretation: LabInterpretation | null;
}

export interface LabReportListItem {
  id: string;
  original_filename: string;
  status: string;
  report_date: string | null;
  lab_name: string | null;
  lab_address: string | null;
  doctor_name: string | null;
  created_at: string;
  abnormal_count: number;
}

// --- Lab Report API ---

export async function uploadLabReport(
  file: File,
  conversationId?: string
): Promise<LabReport> {
  const formData = new FormData();
  formData.append("file", file);
  if (conversationId) {
    formData.append("conversation_id", conversationId);
  }

  const response = await fetch(`${API_URL}/api/v1/reports/upload`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `API error: ${response.status}`);
  }

  return response.json() as Promise<LabReport>;
}

export async function getLabReports(): Promise<LabReportListItem[]> {
  return apiFetch<LabReportListItem[]>("/api/v1/reports/");
}

export async function getLabReport(reportId: string): Promise<LabReport> {
  return apiFetch<LabReport>(`/api/v1/reports/${reportId}`);
}

export async function deleteLabReport(reportId: string): Promise<void> {
  await apiFetch(`/api/v1/reports/${reportId}`, { method: "DELETE" });
}

export async function getLabReportFileUrl(reportId: string): Promise<string | null> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/api/v1/reports/${reportId}/file`, { headers });
    if (!response.ok) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// --- Image Upload ---

export async function uploadImage(
  conversationId: string,
  file: File,
  consent: boolean
): Promise<ImageUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("consent", String(consent));

  const response = await fetch(
    `${API_URL}/api/v1/images/conversations/${conversationId}/images`,
    {
      method: "POST",
      headers: await getAuthHeaders(),
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json() as Promise<ImageUploadResponse>;
}

// --- Face Scan Types ---

export interface FaceScanAnalysis {
  hair_health: { score: number; observations: string[]; tips: string[] };
  skin_quality: { score: number; estimated_skin_age?: number; observations: string[]; tips: string[] };
  stress_level: { score: number; indicators?: string[]; observations: string[]; tips: string[] };
  sleep_quality: { score: number; indicators?: string[]; observations: string[]; tips: string[] };
  overall_score: number;
  overall_summary: string;
  comparison_to_previous?: string;
}

export interface FaceScan {
  id: string;
  scan_date: string;
  hair_health_score: number | null;
  skin_quality_score: number | null;
  stress_level_score: number | null;
  sleep_quality_score: number | null;
  overall_score: number | null;
  analysis: FaceScanAnalysis | null;
  storage_path: string;
  notes: string | null;
  created_at: string;
}

export interface FaceScanTrend {
  dates: string[];
  hair_health: (number | null)[];
  skin_quality: (number | null)[];
  stress_level: (number | null)[];
  sleep_quality: (number | null)[];
  overall: (number | null)[];
}

export interface StreakInfo {
  current_streak: number;
  longest_streak: number;
  total_scans: number;
  last_scan_date: string | null;
}

export interface FaceScanSummary {
  latest_scan: FaceScan | null;
  streak: StreakInfo;
  trends: FaceScanTrend;
}

// --- Face Scan API ---

export async function uploadFaceScan(file: File, notes?: string): Promise<FaceScan> {
  const formData = new FormData();
  formData.append("file", file);
  if (notes) formData.append("notes", notes);

  const response = await fetch(`${API_URL}/api/v1/face-scans`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `API error: ${response.status}`);
  }
  return response.json();
}

export async function getFaceScanSummary(): Promise<FaceScanSummary> {
  return apiFetch<FaceScanSummary>("/api/v1/face-scans/summary");
}

export async function getFaceScans(days: number = 30): Promise<FaceScan[]> {
  return apiFetch<FaceScan[]>(`/api/v1/face-scans?days=${days}`);
}

export async function deleteFaceScan(id: string): Promise<void> {
  await apiFetch(`/api/v1/face-scans/${id}`, { method: "DELETE" });
}

export async function getFaceScanImageUrl(scanId: string): Promise<string | null> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/api/v1/face-scans/${scanId}/file`, { headers });
    if (!response.ok) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// --- Future Projection Types ---

export interface ProjectionMetric {
  current: number;
  projected_positive: number;
  projected_negative: number;
  trend: "improving" | "stable" | "declining";
  insight: string;
}

export interface FutureProjection {
  hair_health: ProjectionMetric;
  skin_quality: ProjectionMetric;
  stress_level: ProjectionMetric;
  sleep_quality: ProjectionMetric;
  overall_current: number;
  overall_projected_positive: number;
  overall_projected_negative: number;
  positive_narrative: string;
  negative_narrative: string;
  top_recommendation: string;
  days_of_data: number;
  generated_at: string;
}

// --- Future Projection API ---

export async function getFutureProjection(): Promise<FutureProjection> {
  return apiFetch<FutureProjection>("/api/v1/face-scans/projection");
}

// --- Family Types ---

export interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  date_of_birth: string | null;
  gender: string | null;
  blood_group: string | null;
  avatar_color: string;
  is_primary: boolean;
  patient_id: string | null;
  created_at: string;
}

export async function getFamilyMembers(): Promise<FamilyMember[]> {
  return apiFetch<FamilyMember[]>("/api/v1/family");
}

// --- Billing Types ---

export interface UsageEntry {
  used: number;
  limit: number; // -1 = unlimited access
}

export interface BillingStatus {
  plan: "free" | "pro";
  status: string;
  current_period_end: string | null;
  monetization_enabled: boolean;
  usage: {
    assessments: UsageEntry;
    lab_reports: UsageEntry;
    face_scans: UsageEntry;
    image_analyses: UsageEntry;
  };
  free_limits: Record<string, number>;
}

export interface SubscribeResponse {
  subscription_id: string;
  razorpay_key_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
}

export interface UsageLimitCheck {
  allowed: boolean;
  used: number;
  limit: number;
  is_pro: boolean;
}

// --- Billing API ---

export async function getBillingStatus(): Promise<BillingStatus> {
  return apiFetch<BillingStatus>("/api/v1/billing/status");
}

export async function createSubscription(): Promise<SubscribeResponse> {
  return apiFetch<SubscribeResponse>("/api/v1/billing/subscribe", { method: "POST" });
}

export async function verifyPayment(data: {
  razorpay_subscription_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<{ status: string; message: string }> {
  return apiFetch("/api/v1/billing/verify", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function cancelSubscription(): Promise<{ status: string; message: string }> {
  return apiFetch("/api/v1/billing/cancel", { method: "POST" });
}

export async function checkUsageLimit(feature: string): Promise<UsageLimitCheck> {
  return apiFetch<UsageLimitCheck>(`/api/v1/billing/check/${feature}`);
}

// --- Notification Types ---

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  icon: string;
  read: boolean;
  action_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unread_count: number;
}

// --- Notification API ---

export async function getNotifications(limit = 20, unreadOnly = false): Promise<NotificationsResponse> {
  return apiFetch<NotificationsResponse>(`/api/v1/notifications?limit=${limit}&unread_only=${unreadOnly}`);
}

export async function getUnreadCount(): Promise<{ unread_count: number }> {
  return apiFetch<{ unread_count: number }>("/api/v1/notifications/count");
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch("/api/v1/notifications/read-all", { method: "POST" });
}

// --- Health Device Hub Types ---

/**
 * Providers are stored by the API in snake_case. The UI deliberately keeps the
 * provider list open-ended so a newly approved integration does not require a
 * client release before its existing connection can be displayed.
 */
export type DeviceProvider =
  | "apple_health"
  | "health_connect"
  | "fitbit"
  | "garmin"
  | "oura"
  | "withings"
  | "bluetooth"
  | "manual"
  | "other";

export type DeviceMetricType =
  | "heart_rate"
  | "resting_heart_rate"
  | "spo2"
  | "temperature"
  | "systolic_bp"
  | "diastolic_bp"
  | "weight"
  | "steps"
  | "sleep_duration"
  | "respiratory_rate"
  | "blood_glucose"
  | "hrv"
  | "active_energy"
  | "height";

export interface DeviceConnection {
  id: string;
  provider: DeviceProvider;
  display_name: string | null;
  device_identifier?: string | null;
  external_account_id?: string | null;
  granted_metric_types: DeviceMetricType[];
  metadata: Record<string, unknown>;
  status?: "connected" | "disconnected" | "pending" | string;
  last_synced_at: string | null;
  connected_at?: string;
  disconnected_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface VitalObservation {
  id: string;
  connection_id: string | null;
  metric_type: DeviceMetricType;
  value: number;
  unit: string | null;
  observed_at: string;
  source: string;
  provider: DeviceProvider;
  source_record_id?: string | null;
  quality?: string | null;
  payload?: Record<string, unknown> | null;
  created_at?: string;
}

export interface VitalObservationInput {
  metric_type: DeviceMetricType;
  value: number;
  unit?: string | null;
  observed_at: string;
  source?: string;
  provider?: DeviceProvider;
  source_record_id?: string;
  quality?: string;
  payload?: Record<string, unknown>;
}

export interface DeviceHubSnapshot {
  connections: DeviceConnection[];
  latest_observations: VitalObservation[];
  supported_providers: DeviceProvider[];
  consent_note: string;
}

export interface VitalObservationBatchResponse {
  accepted: number;
  duplicates: number;
  observations: VitalObservation[];
}

export interface VitalTrendPoint {
  observed_at: string;
  value: number;
  min_value: number | null;
  max_value: number | null;
  count: number;
  unit: string | null;
}

export interface VitalTrend {
  metric_type: DeviceMetricType;
  unit: string | null;
  bucket: "hour" | "day" | string;
  points: VitalTrendPoint[];
}

export interface CreateDeviceConnectionInput {
  provider: DeviceProvider;
  display_name?: string;
  device_identifier?: string;
  external_account_id?: string;
  granted_metric_types?: DeviceMetricType[];
  metadata?: Record<string, unknown>;
}

export interface UpdateDeviceConnectionInput {
  display_name?: string;
  granted_metric_types?: DeviceMetricType[];
  metadata?: Record<string, unknown>;
}

// --- Health Device Hub API ---

export async function getDeviceHub(): Promise<DeviceHubSnapshot> {
  return apiFetch<DeviceHubSnapshot>("/api/v1/device-hub/connections");
}

export async function createDeviceConnection(
  input: CreateDeviceConnectionInput
): Promise<DeviceConnection> {
  return apiFetch<DeviceConnection>("/api/v1/device-hub/connections", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateDeviceConnection(
  id: string,
  input: UpdateDeviceConnectionInput
): Promise<DeviceConnection> {
  return apiFetch<DeviceConnection>(`/api/v1/device-hub/connections/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function disconnectDeviceConnection(id: string): Promise<void> {
  await apiFetch(`/api/v1/device-hub/connections/${id}`, { method: "DELETE" });
}

export async function submitVitalObservations(input: {
  connection_id?: string;
  observations: VitalObservationInput[];
}): Promise<VitalObservationBatchResponse> {
  return apiFetch<VitalObservationBatchResponse>("/api/v1/device-hub/observations/batch", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getLatestVitalObservations(
  metricTypes?: DeviceMetricType[],
  limit = 24
): Promise<VitalObservation[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (metricTypes?.length) query.set("metric_types", metricTypes.join(","));
  return apiFetch<VitalObservation[]>(`/api/v1/device-hub/observations/latest?${query.toString()}`);
}

export async function getVitalTrend(input: {
  metric_type: DeviceMetricType;
  from_at?: string;
  to_at?: string;
  bucket?: "hour" | "day";
  limit?: number;
}): Promise<VitalTrend> {
  const query = new URLSearchParams({ metric_type: input.metric_type });
  if (input.from_at) query.set("from_at", input.from_at);
  if (input.to_at) query.set("to_at", input.to_at);
  if (input.bucket) query.set("bucket", input.bucket);
  if (input.limit) query.set("limit", String(input.limit));
  return apiFetch<VitalTrend>(`/api/v1/device-hub/observations/trends?${query.toString()}`);
}

/**
 * Device signals never enter an assessment silently. This creates a new
 * conversation only after the caller has obtained an explicit user choice and
 * sends the selected readings as source-labelled context.
 */
export async function startAssessmentWithDeviceReadings(
  readings: VitalObservation[],
  memberId?: string
): Promise<Conversation> {
  if (!readings.length) {
    throw new Error("Choose at least one reading to add to an assessment.");
  }

  // Assessment metadata gets only the user-reviewed values needed for
  // context—not connection identifiers, source payloads, or other timeline
  // fields. This keeps the consented handoff intentionally small.
  const selectedObservations = readings.slice(0, 12).map((reading) => ({
    metric_type: reading.metric_type,
    value: reading.value,
    unit: reading.unit || "",
    observed_at: reading.observed_at,
    provider: reading.provider,
    source: reading.source,
  }));

  const conversation = await createConversation(memberId);
  const formattedReadings = selectedObservations
    .map((reading) => {
      const label = reading.metric_type.replace(/_/g, " ");
      const value = `${reading.value}${reading.unit ? ` ${reading.unit}` : ""}`;
      const time = new Date(reading.observed_at).toLocaleString();
      const source = reading.source || reading.provider || "connected device";
      return `- ${label}: ${value} (${time}; ${source})`;
    })
    .join("\n");

  await sendMessage(
    conversation.id,
    `I choose to include these device readings in my assessment:\n${formattedReadings}\n\nPlease use them as context only. They may be incomplete or inaccurate and should not be used alone to diagnose or prescribe.`,
    {
      device_observations: selectedObservations,
      device_observations_consent_at: new Date().toISOString(),
    }
  );

  return conversation;
}
