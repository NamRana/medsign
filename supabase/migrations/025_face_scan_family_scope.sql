-- Prepare face-scan records for profile scoping in Insights. A NULL member ID
-- represents the account holder. This migration does not enable family face
-- scan uploads; those endpoints need their own validated profile scope first.

ALTER TABLE face_scans
    ADD COLUMN IF NOT EXISTS family_member_id UUID
    REFERENCES family_members(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_face_scans_user_family_created_at
    ON face_scans(user_id, family_member_id, created_at DESC);
