-- ============================================================
-- RLS Security Hardening
-- Fixes overly permissive policies and adds RLS to unprotected tables
-- ============================================================

-- ── CRITICAL: Fix subscriptions & usage_tracking ─────────────────────
-- The old policies had no TO clause, granting ALL access to every role.
-- Drop them and re-create scoped to service_role only.

DROP POLICY IF EXISTS subscriptions_service_all ON subscriptions;
DROP POLICY IF EXISTS usage_tracking_service_all ON usage_tracking;

CREATE POLICY subscriptions_service_all ON subscriptions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY usage_tracking_service_all ON usage_tracking
    FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── HIGH: Tighten safety_events INSERT policy ────────────────────────
-- Old policy allowed any authenticated user to insert events for any patient.

DROP POLICY IF EXISTS safety_events_insert ON safety_events;

CREATE POLICY safety_events_insert ON safety_events
    FOR INSERT TO authenticated
    WITH CHECK (
        patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    );


-- ── HIGH: Add RLS to reference tables ────────────────────────────────
-- These tables hold medical knowledge — read-only for users, full access for backend.

ALTER TABLE medical_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE drug_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE homeopathy_reference ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users
CREATE POLICY medical_documents_read ON medical_documents
    FOR SELECT TO authenticated USING (true);

CREATE POLICY medical_chunks_read ON medical_chunks
    FOR SELECT TO authenticated USING (true);

CREATE POLICY medical_knowledge_read ON medical_knowledge
    FOR SELECT TO authenticated USING (true);

CREATE POLICY drug_reference_read ON drug_reference
    FOR SELECT TO authenticated USING (true);

CREATE POLICY homeopathy_reference_read ON homeopathy_reference
    FOR SELECT TO authenticated USING (true);

-- Full access for service_role (backend)
CREATE POLICY medical_documents_service ON medical_documents
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY medical_chunks_service ON medical_chunks
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY medical_knowledge_service ON medical_knowledge
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY drug_reference_service ON drug_reference
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY homeopathy_reference_service ON homeopathy_reference
    FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── LOW: Add service_role policies to notifications & follow_ups ─────
-- Only apply if tables exist (migration 019 may not have been run yet)

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        EXECUTE 'CREATE POLICY notifications_service ON notifications FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'follow_ups') THEN
        EXECUTE 'CREATE POLICY follow_ups_service ON follow_ups FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;
