-- Add doctor name and lab address to lab_reports for richer report metadata

ALTER TABLE lab_reports ADD COLUMN IF NOT EXISTS doctor_name TEXT;
ALTER TABLE lab_reports ADD COLUMN IF NOT EXISTS lab_address TEXT;

CREATE INDEX IF NOT EXISTS idx_lab_reports_doctor_name ON lab_reports(doctor_name);
