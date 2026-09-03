-- Link family members to patient records so each member has full health data

-- 1. Allow multiple patient records per user (one per family member)
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_user_id_key;

-- 2. Add patient_id column to family_members
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE SET NULL;

-- 3. Add optional family_member_id to conversations for scoping
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS family_member_id UUID REFERENCES family_members(id) ON DELETE SET NULL;

-- 4. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_family_members_patient_id ON family_members(patient_id);
CREATE INDEX IF NOT EXISTS idx_conversations_family_member_id ON conversations(family_member_id);
CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);
