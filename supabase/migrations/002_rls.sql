-- MedSign Row Level Security Policies
-- Migration: 002_rls.sql

-- ─── ENABLE RLS ON ALL TABLES ────────────────────────────────────────────────
ALTER TABLE patients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE symptoms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE images           ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs       ENABLE ROW LEVEL SECURITY;

-- ─── PATIENTS ─────────────────────────────────────────────────────────────────
-- Users can only see and modify their own patient record
CREATE POLICY patients_select_own ON patients
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY patients_insert_own ON patients
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY patients_update_own ON patients
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY patients_delete_own ON patients
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- Service role bypasses RLS (used by backend with service_role key)
CREATE POLICY patients_service_all ON patients
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ─── CONVERSATIONS ────────────────────────────────────────────────────────────
CREATE POLICY conversations_select_own ON conversations
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY conversations_insert_own ON conversations
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY conversations_update_own ON conversations
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY conversations_delete_own ON conversations
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY conversations_service_all ON conversations
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ─── MESSAGES ─────────────────────────────────────────────────────────────────
-- Users can access messages in their own conversations
CREATE POLICY messages_select_own ON messages
    FOR SELECT TO authenticated
    USING (
        conversation_id IN (
            SELECT id FROM conversations WHERE user_id = auth.uid()
        )
    );

CREATE POLICY messages_insert_own ON messages
    FOR INSERT TO authenticated
    WITH CHECK (
        conversation_id IN (
            SELECT id FROM conversations WHERE user_id = auth.uid()
        )
    );

CREATE POLICY messages_service_all ON messages
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ─── SYMPTOMS ─────────────────────────────────────────────────────────────────
CREATE POLICY symptoms_select_own ON symptoms
    FOR SELECT TO authenticated
    USING (
        patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    );

CREATE POLICY symptoms_insert_own ON symptoms
    FOR INSERT TO authenticated
    WITH CHECK (
        patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    );

CREATE POLICY symptoms_service_all ON symptoms
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ─── VITALS ───────────────────────────────────────────────────────────────────
CREATE POLICY vitals_select_own ON vitals
    FOR SELECT TO authenticated
    USING (
        patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    );

CREATE POLICY vitals_insert_own ON vitals
    FOR INSERT TO authenticated
    WITH CHECK (
        patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    );

CREATE POLICY vitals_service_all ON vitals
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ─── ASSESSMENTS ──────────────────────────────────────────────────────────────
CREATE POLICY assessments_select_own ON assessments
    FOR SELECT TO authenticated
    USING (
        patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    );

CREATE POLICY assessments_service_all ON assessments
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ─── IMAGES ───────────────────────────────────────────────────────────────────
CREATE POLICY images_select_own ON images
    FOR SELECT TO authenticated
    USING (
        patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    );

CREATE POLICY images_insert_own ON images
    FOR INSERT TO authenticated
    WITH CHECK (
        patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    );

CREATE POLICY images_service_all ON images
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ─── LAB REPORTS ──────────────────────────────────────────────────────────────
CREATE POLICY lab_reports_select_own ON lab_reports
    FOR SELECT TO authenticated
    USING (
        patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    );

CREATE POLICY lab_reports_insert_own ON lab_reports
    FOR INSERT TO authenticated
    WITH CHECK (
        patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    );

CREATE POLICY lab_reports_service_all ON lab_reports
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ─── SAFETY EVENTS ────────────────────────────────────────────────────────────
-- Safety events are write-only for users; reads only for service role
CREATE POLICY safety_events_insert ON safety_events
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY safety_events_service_all ON safety_events
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ─── FEEDBACK ─────────────────────────────────────────────────────────────────
CREATE POLICY feedback_select_own ON feedback
    FOR SELECT TO authenticated
    USING (
        patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    );

CREATE POLICY feedback_insert_own ON feedback
    FOR INSERT TO authenticated
    WITH CHECK (
        patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    );

CREATE POLICY feedback_service_all ON feedback
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
-- Audit logs are append-only for users; full access for service role
CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY audit_logs_select_own ON audit_logs
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY audit_logs_service_all ON audit_logs
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
