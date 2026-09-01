-- MedSign Performance Indexes
-- Migration: 004_indexes.sql

-- ─── PATIENTS ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_patients_user_id
    ON patients (user_id);

CREATE INDEX IF NOT EXISTS idx_patients_created_at
    ON patients (created_at DESC);

-- ─── CONVERSATIONS ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_patient_id
    ON conversations (patient_id);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
    ON conversations (user_id);

CREATE INDEX IF NOT EXISTS idx_conversations_status
    ON conversations (status);

CREATE INDEX IF NOT EXISTS idx_conversations_started_at
    ON conversations (started_at DESC);

-- Composite: most common query pattern – user's active conversations
CREATE INDEX IF NOT EXISTS idx_conversations_user_status
    ON conversations (user_id, status, started_at DESC);

-- ─── MESSAGES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
    ON messages (conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_created_at
    ON messages (conversation_id, created_at ASC);

-- ─── SYMPTOMS ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_symptoms_patient_id
    ON symptoms (patient_id);

CREATE INDEX IF NOT EXISTS idx_symptoms_conversation_id
    ON symptoms (conversation_id);

CREATE INDEX IF NOT EXISTS idx_symptoms_recorded_at
    ON symptoms (patient_id, recorded_at DESC);

-- ─── VITALS ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vitals_patient_id
    ON vitals (patient_id);

CREATE INDEX IF NOT EXISTS idx_vitals_recorded_at
    ON vitals (patient_id, recorded_at DESC);

-- ─── ASSESSMENTS ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assessments_conversation_id
    ON assessments (conversation_id);

CREATE INDEX IF NOT EXISTS idx_assessments_patient_id
    ON assessments (patient_id);

CREATE INDEX IF NOT EXISTS idx_assessments_risk_level
    ON assessments (risk_level);

CREATE INDEX IF NOT EXISTS idx_assessments_created_at
    ON assessments (patient_id, created_at DESC);

-- ─── IMAGES ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_images_patient_id
    ON images (patient_id);

CREATE INDEX IF NOT EXISTS idx_images_conversation_id
    ON images (conversation_id);

-- ─── LAB REPORTS ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lab_reports_patient_id
    ON lab_reports (patient_id);

CREATE INDEX IF NOT EXISTS idx_lab_reports_report_date
    ON lab_reports (patient_id, report_date DESC);

-- ─── SAFETY EVENTS ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_safety_events_patient_id
    ON safety_events (patient_id);

CREATE INDEX IF NOT EXISTS idx_safety_events_severity
    ON safety_events (severity, created_at DESC);

-- ─── FEEDBACK ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_feedback_patient_id
    ON feedback (patient_id);

CREATE INDEX IF NOT EXISTS idx_feedback_conversation_id
    ON feedback (conversation_id);

-- ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
    ON audit_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_patient_id
    ON audit_logs (patient_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
    ON audit_logs (resource_type, resource_id);
