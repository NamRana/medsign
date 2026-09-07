-- Separate table for homeopathy remedies (Boericke's Materia Medica)
CREATE TABLE homeopathy_reference (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    generic_name TEXT NOT NULL,
    abbreviation TEXT,
    common_name TEXT,
    description TEXT,
    indications JSONB NOT NULL DEFAULT '[]',
    adult_dosage TEXT,
    frequency TEXT DEFAULT 'As directed by practitioner',
    duration_typical TEXT DEFAULT 'As directed by practitioner',
    route TEXT DEFAULT 'oral (sublingual)',
    organ_system_symptoms JSONB DEFAULT '{}',
    modalities JSONB,
    relationships TEXT,
    available_in_india BOOLEAN DEFAULT TRUE,
    otc BOOLEAN DEFAULT TRUE,
    source TEXT NOT NULL DEFAULT 'Boericke''s Materia Medica',
    embedding vector(768),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homeopathy_reference_name ON homeopathy_reference(generic_name);
CREATE INDEX IF NOT EXISTS idx_homeopathy_reference_abbr ON homeopathy_reference(abbreviation);

CREATE INDEX idx_homeopathy_reference_embedding
    ON homeopathy_reference USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);
