-- Phase 9: Lab Reports
-- Store uploaded lab reports, extracted values, and interpretations

CREATE TABLE IF NOT EXISTS lab_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    error_message TEXT,
    report_date DATE,
    lab_name TEXT,
    patient_name_on_report TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES lab_reports(id) ON DELETE CASCADE,
    test_name TEXT NOT NULL,
    value TEXT NOT NULL,
    unit TEXT,
    reference_range TEXT,
    is_abnormal BOOLEAN,
    abnormality_direction TEXT CHECK (abnormality_direction IN ('high', 'low', NULL)),
    category TEXT,
    source_page INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_interpretations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES lab_reports(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    abnormal_findings TEXT[],
    patient_friendly_explanation TEXT NOT NULL,
    recommendations TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_lab_reports_user_id ON lab_reports(user_id);
CREATE INDEX idx_lab_reports_conversation_id ON lab_reports(conversation_id);
CREATE INDEX idx_lab_reports_created_at ON lab_reports(created_at DESC);
CREATE INDEX idx_lab_values_report_id ON lab_values(report_id);
CREATE INDEX idx_lab_values_is_abnormal ON lab_values(is_abnormal) WHERE is_abnormal = true;

-- RLS
ALTER TABLE lab_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_interpretations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lab reports"
    ON lab_reports FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own lab reports"
    ON lab_reports FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own lab reports"
    ON lab_reports FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own lab values"
    ON lab_values FOR SELECT
    USING (EXISTS (SELECT 1 FROM lab_reports WHERE lab_reports.id = lab_values.report_id AND lab_reports.user_id = auth.uid()));

CREATE POLICY "Users can view own interpretations"
    ON lab_interpretations FOR SELECT
    USING (EXISTS (SELECT 1 FROM lab_reports WHERE lab_reports.id = lab_interpretations.report_id AND lab_reports.user_id = auth.uid()));

-- Service role policies for backend processing
CREATE POLICY "Service role full access lab_reports"
    ON lab_reports FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access lab_values"
    ON lab_values FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access lab_interpretations"
    ON lab_interpretations FOR ALL USING (auth.role() = 'service_role');
