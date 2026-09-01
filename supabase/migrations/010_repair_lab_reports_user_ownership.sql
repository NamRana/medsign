-- Upgrade installations created with the original patient-based lab_reports table.
-- Later migrations used CREATE TABLE IF NOT EXISTS, which does not add these
-- columns when the older table is already present.

ALTER TABLE lab_reports
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS original_filename TEXT,
    ADD COLUMN IF NOT EXISTS mime_type TEXT,
    ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'
        CHECK (status IN ('processing', 'completed', 'failed')),
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS patient_name_on_report TEXT;

-- Preserve existing reports by deriving their owner from the associated patient.
UPDATE lab_reports AS report
SET user_id = patient.user_id
FROM patients AS patient
WHERE report.patient_id = patient.id
  AND report.user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lab_reports_user_id ON lab_reports(user_id);
