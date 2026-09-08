-- Keep acquisition analytics separate from enforceable plan quotas.
-- Existing *_used values are retained as monthly activity metrics;
-- the new counters start at zero so free-period activity is never charged
-- against a user when monetization is re-enabled.
ALTER TABLE usage_tracking
    ADD COLUMN IF NOT EXISTS assessments_quota_used INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lab_reports_quota_used INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS face_scans_quota_used INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS image_analyses_quota_used INTEGER NOT NULL DEFAULT 0;
