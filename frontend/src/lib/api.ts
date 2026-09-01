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

  let response: Response;
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutMs = attempt === 1 ? 30000 : 60000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      break;
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

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// --- Typed API functions ---

export async function getConversations(): Promise<Conversation[]> {
  return apiFetch<Conversation[]>("/api/v1/conversations");
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

export async function createConversation(): Promise<Conversation> {
  return apiFetch<Conversation>("/api/v1/conversations", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function sendMessage(
  conversationId: string,
  content: string
): Promise<Message[]> {
  return apiFetch<Message[]>(
    `/api/v1/conversations/${conversationId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
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
