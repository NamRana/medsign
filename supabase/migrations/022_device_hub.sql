-- Device Hub: consented health-device connections and append-only readings.
--
-- This schema deliberately stores connection metadata only. OAuth tokens and
-- hardware credentials belong in a dedicated secrets vault, never this table.

CREATE TABLE IF NOT EXISTS device_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    provider TEXT NOT NULL CHECK (provider IN (
        'apple_health', 'health_connect', 'fitbit', 'garmin', 'oura',
        'withings', 'bluetooth', 'manual', 'other'
    )),
    display_name TEXT,
    device_identifier TEXT,
    external_account_id TEXT,
    granted_metric_types TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN (
        'connected', 'disconnected', 'revoked', 'error'
    )),
    last_synced_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    disconnected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A user can have only one currently active connection for the same source
-- identity, while preserving disconnected connection history for auditability.
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_connections_active_identity
    ON device_connections (
        user_id,
        provider,
        COALESCE(external_account_id, ''),
        COALESCE(device_identifier, '')
    )
    WHERE status = 'connected';

CREATE INDEX IF NOT EXISTS idx_device_connections_user_status
    ON device_connections(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_connections_patient
    ON device_connections(patient_id);

CREATE TRIGGER update_device_connections_updated_at
    BEFORE UPDATE ON device_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS vital_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    device_connection_id UUID REFERENCES device_connections(id) ON DELETE SET NULL,
    provider TEXT NOT NULL CHECK (provider IN (
        'apple_health', 'health_connect', 'fitbit', 'garmin', 'oura',
        'withings', 'bluetooth', 'manual', 'other'
    )),
    source TEXT NOT NULL DEFAULT 'device' CHECK (source IN (
        'device', 'health_store', 'provider_api', 'bluetooth', 'manual', 'import'
    )),
    metric_type TEXT NOT NULL CHECK (char_length(metric_type) BETWEEN 1 AND 80),
    value NUMERIC NOT NULL CHECK (value <> 'NaN'::numeric),
    unit TEXT NOT NULL CHECK (char_length(unit) BETWEEN 1 AND 32),
    observed_at TIMESTAMPTZ NOT NULL,
    source_record_id TEXT,
    quality TEXT CHECK (quality IS NULL OR char_length(quality) <= 64),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A Health Connect source record can legitimately contain a series of
    -- heart-rate samples or both blood-pressure components. Deduplicate an
    -- individual event, not the entire source record.
    CONSTRAINT vital_observations_user_provider_source_observation_key
        UNIQUE (user_id, provider, source_record_id, metric_type, observed_at)
);

-- Dedupe is enforced by the source record plus its metric and event timestamp
-- when a provider supplies an ID. PostgreSQL allows multiple NULLs in a unique
-- constraint, so manual/legacy records remain append-only without a forced
-- synthetic identifier.
CREATE INDEX IF NOT EXISTS idx_vital_observations_user_metric_time
    ON vital_observations(user_id, metric_type, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_vital_observations_connection_time
    ON vital_observations(device_connection_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_vital_observations_patient_time
    ON vital_observations(patient_id, observed_at DESC);

ALTER TABLE device_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE vital_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY device_connections_select_own ON device_connections
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY device_connections_insert_own ON device_connections
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY device_connections_update_own ON device_connections
    FOR UPDATE TO authenticated USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY device_connections_delete_own ON device_connections
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY device_connections_service_all ON device_connections
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Observations are intentionally append-only: there are no authenticated UPDATE
-- or DELETE policies. Corrections should be represented by a new source record.
CREATE POLICY vital_observations_select_own ON vital_observations
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY vital_observations_insert_own ON vital_observations
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY vital_observations_service_all ON vital_observations
    FOR ALL TO service_role USING (true) WITH CHECK (true);
