-- MedSign Initial Schema
-- Migration: 001_initial_schema.sql

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── PATIENTS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL UNIQUE,           -- references auth.users(id)
    full_name       TEXT,
    date_of_birth   DATE,
    gender          TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
    phone           TEXT,
    language        TEXT DEFAULT 'en',
    location_city   TEXT,
    location_state  TEXT,
    location_country TEXT DEFAULT 'India',
    emergency_contact_name  TEXT,
    emergency_contact_phone TEXT,
    allergies       TEXT[],
    chronic_conditions TEXT[],
    current_medications TEXT[],
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CONVERSATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    title           TEXT,
    status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    session_type    TEXT DEFAULT 'symptom_check' CHECK (
                        session_type IN ('symptom_check', 'follow_up', 'general', 'emergency')
                    ),
    chief_complaint TEXT,
    summary         TEXT,
    risk_level      TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    metadata        JSONB DEFAULT '{}',
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── MESSAGES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content         TEXT NOT NULL,
    content_type    TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'audio', 'structured')),
    tokens_used     INTEGER,
    model_used      TEXT,
    latency_ms      INTEGER,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SYMPTOMS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS symptoms (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    severity        INTEGER CHECK (severity BETWEEN 1 AND 10),
    duration_days   INTEGER,
    description     TEXT,
    body_location   TEXT,
    onset_type      TEXT CHECK (onset_type IN ('sudden', 'gradual', 'unknown')),
    aggravating_factors TEXT[],
    relieving_factors   TEXT[],
    associated_symptoms TEXT[],
    metadata        JSONB DEFAULT '{}',
    recorded_at     TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── VITALS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vitals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    temperature_c   NUMERIC(4,1),
    systolic_bp     INTEGER,
    diastolic_bp    INTEGER,
    heart_rate      INTEGER,
    respiratory_rate INTEGER,
    spo2_percent    NUMERIC(4,1),
    weight_kg       NUMERIC(6,2),
    height_cm       NUMERIC(5,1),
    bmi             NUMERIC(5,2),
    blood_glucose   NUMERIC(6,2),
    notes           TEXT,
    recorded_at     TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ASSESSMENTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assessments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    assessment_type TEXT DEFAULT 'ai_triage',
    risk_level      TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    urgency_score   NUMERIC(4,2),
    possible_conditions JSONB DEFAULT '[]',   -- [{name, probability, icd10}]
    recommended_actions JSONB DEFAULT '[]',   -- [{action, priority, description}]
    red_flags       TEXT[],
    follow_up_days  INTEGER,
    disclaimer      TEXT,
    raw_ai_output   TEXT,
    model_used      TEXT,
    confidence_score NUMERIC(4,3),
    reviewed_by     UUID,                     -- doctor user_id if reviewed
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── IMAGES ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS images (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    storage_path    TEXT NOT NULL,
    file_name       TEXT,
    mime_type       TEXT,
    file_size_bytes BIGINT,
    image_type      TEXT CHECK (image_type IN ('skin', 'wound', 'eye', 'throat', 'xray', 'other')),
    analysis_result JSONB DEFAULT '{}',
    analyzed_at     TIMESTAMPTZ,
    uploaded_at     TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── LAB REPORTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    report_type     TEXT,
    report_date     DATE,
    lab_name        TEXT,
    storage_path    TEXT,
    extracted_values JSONB DEFAULT '{}',     -- {marker: {value, unit, reference_range, flag}}
    summary         TEXT,
    abnormal_flags  TEXT[],
    analyzed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SAFETY EVENTS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    patient_id      UUID REFERENCES patients(id) ON DELETE SET NULL,
    event_type      TEXT NOT NULL CHECK (
                        event_type IN (
                            'crisis_detected', 'emergency_escalation',
                            'harmful_content_blocked', 'unsafe_recommendation',
                            'data_breach_attempt', 'other'
                        )
                    ),
    severity        TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description     TEXT,
    triggered_by    TEXT,
    resolution      TEXT,
    escalated_to    TEXT,
    resolved_at     TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FEEDBACK ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    rating          INTEGER CHECK (rating BETWEEN 1 AND 5),
    helpful         BOOLEAN,
    accurate        BOOLEAN,
    comment         TEXT,
    tags            TEXT[],
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID,
    patient_id      UUID,
    action          TEXT NOT NULL,
    resource_type   TEXT,
    resource_id     UUID,
    ip_address      INET,
    user_agent      TEXT,
    request_path    TEXT,
    status_code     INTEGER,
    details         JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── AUTO-UPDATE updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assessments_updated_at
    BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lab_reports_updated_at
    BEFORE UPDATE ON lab_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
