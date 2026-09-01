-- Enable pgvector extension for embedding storage
CREATE EXTENSION IF NOT EXISTS vector;

-- Stores metadata about ingested medical documents/sources
CREATE TABLE medical_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('guideline', 'formulary', 'protocol', 'dataset')),
    version TEXT,
    publication_date DATE,
    topic TEXT,
    country TEXT DEFAULT 'IN',
    language TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores chunked content with vector embeddings
CREATE TABLE medical_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES medical_documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(768),
    chunk_index INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Structured symptom → condition → medicine mapping table
CREATE TABLE medical_knowledge (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    condition_name TEXT NOT NULL,
    icd_code TEXT,
    symptoms JSONB NOT NULL DEFAULT '[]',
    differential_diagnosis JSONB DEFAULT '[]',
    first_line_treatment JSONB DEFAULT '[]',
    second_line_treatment JSONB DEFAULT '[]',
    contraindications JSONB DEFAULT '[]',
    red_flags JSONB DEFAULT '[]',
    when_to_refer TEXT,
    source TEXT NOT NULL,
    embedding vector(768),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drug reference table (Indian formulary style)
CREATE TABLE drug_reference (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    generic_name TEXT NOT NULL,
    brand_names JSONB DEFAULT '[]',
    drug_class TEXT NOT NULL,
    indications JSONB NOT NULL DEFAULT '[]',
    adult_dosage TEXT NOT NULL,
    pediatric_dosage TEXT,
    frequency TEXT NOT NULL,
    duration_typical TEXT,
    route TEXT DEFAULT 'oral',
    contraindications JSONB DEFAULT '[]',
    side_effects JSONB DEFAULT '[]',
    interactions JSONB DEFAULT '[]',
    pregnancy_category TEXT,
    available_in_india BOOLEAN DEFAULT TRUE,
    otc BOOLEAN DEFAULT FALSE,
    source TEXT NOT NULL,
    embedding vector(768),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for vector similarity search
CREATE INDEX idx_medical_chunks_embedding
    ON medical_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX idx_medical_knowledge_embedding
    ON medical_knowledge USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

CREATE INDEX idx_drug_reference_embedding
    ON drug_reference USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

-- Text search indexes for hybrid retrieval
CREATE INDEX idx_medical_knowledge_condition ON medical_knowledge(condition_name);
CREATE INDEX idx_drug_reference_generic_name ON drug_reference(generic_name);
CREATE INDEX idx_drug_reference_drug_class ON drug_reference(drug_class);
