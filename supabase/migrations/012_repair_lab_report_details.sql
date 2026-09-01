-- Add the lab-report detail tables missing from older deployments.

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

CREATE INDEX IF NOT EXISTS idx_lab_values_report_id ON lab_values(report_id);
CREATE INDEX IF NOT EXISTS idx_lab_interpretations_report_id ON lab_interpretations(report_id);
