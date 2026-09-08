-- ============================================================
-- RLS for lab_values & lab_interpretations
-- These tables were created without RLS enabled
-- ============================================================

ALTER TABLE lab_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_interpretations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lab_values' AND policyname = 'Users read own lab_values') THEN
        EXECUTE 'CREATE POLICY "Users read own lab_values" ON lab_values FOR SELECT USING (EXISTS (SELECT 1 FROM lab_reports WHERE lab_reports.id = lab_values.report_id AND lab_reports.user_id = auth.uid()))';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lab_interpretations' AND policyname = 'Users read own lab_interpretations') THEN
        EXECUTE 'CREATE POLICY "Users read own lab_interpretations" ON lab_interpretations FOR SELECT USING (EXISTS (SELECT 1 FROM lab_reports WHERE lab_reports.id = lab_interpretations.report_id AND lab_reports.user_id = auth.uid()))';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lab_values' AND policyname = 'Service role full access lab_values') THEN
        EXECUTE 'CREATE POLICY "Service role full access lab_values" ON lab_values FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lab_interpretations' AND policyname = 'Service role full access lab_interpretations') THEN
        EXECUTE 'CREATE POLICY "Service role full access lab_interpretations" ON lab_interpretations FOR ALL TO service_role USING (true) WITH CHECK (true)';
    END IF;
END $$;
