-- Add missing 'consent' column and rename 'analysis_result' to 'analysis'
-- to match the backend API expectations.

ALTER TABLE images ADD COLUMN IF NOT EXISTS consent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE images ADD COLUMN IF NOT EXISTS analysis JSONB;

-- Migrate any existing data from the old column
UPDATE images SET analysis = analysis_result WHERE analysis_result IS NOT NULL AND analysis_result != '{}';
