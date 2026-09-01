-- Create face_scans table with proper schema and RLS
-- This table was referenced by the API but never created in migrations

CREATE TABLE IF NOT EXISTS face_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    scan_type TEXT NOT NULL DEFAULT 'general',
    analysis JSONB,
    health_indicators JSONB,
    skin_analysis JSONB,
    stress_indicators JSONB,
    fatigue_score REAL,
    overall_score REAL,
    recommendations TEXT[],
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_face_scans_user_id ON face_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_face_scans_created_at ON face_scans(created_at DESC);

-- Enable RLS
ALTER TABLE face_scans ENABLE ROW LEVEL SECURITY;

-- RLS Policies: strict per-user isolation
CREATE POLICY "face_scans_select_own" ON face_scans
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "face_scans_insert_own" ON face_scans
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "face_scans_update_own" ON face_scans
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "face_scans_delete_own" ON face_scans
    FOR DELETE USING (auth.uid() = user_id);

-- Service role bypass for backend
CREATE POLICY "face_scans_service_role" ON face_scans
    FOR ALL TO service_role USING (true) WITH CHECK (true);
