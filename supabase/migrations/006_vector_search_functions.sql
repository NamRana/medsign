-- Vector similarity search function for medical conditions
CREATE OR REPLACE FUNCTION match_conditions(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.3,
    match_count int DEFAULT 3
)
RETURNS TABLE (
    id UUID,
    condition_name TEXT,
    icd_code TEXT,
    symptoms JSONB,
    differential_diagnosis JSONB,
    first_line_treatment JSONB,
    second_line_treatment JSONB,
    contraindications JSONB,
    red_flags JSONB,
    when_to_refer TEXT,
    source TEXT,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        mk.id,
        mk.condition_name,
        mk.icd_code,
        mk.symptoms,
        mk.differential_diagnosis,
        mk.first_line_treatment,
        mk.second_line_treatment,
        mk.contraindications,
        mk.red_flags,
        mk.when_to_refer,
        mk.source,
        1 - (mk.embedding <=> query_embedding) AS similarity
    FROM medical_knowledge mk
    WHERE 1 - (mk.embedding <=> query_embedding) > match_threshold
    ORDER BY mk.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Vector similarity search function for drugs
CREATE OR REPLACE FUNCTION match_drugs(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.3,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    generic_name TEXT,
    brand_names JSONB,
    drug_class TEXT,
    indications JSONB,
    adult_dosage TEXT,
    pediatric_dosage TEXT,
    frequency TEXT,
    duration_typical TEXT,
    route TEXT,
    contraindications JSONB,
    side_effects JSONB,
    interactions JSONB,
    pregnancy_category TEXT,
    available_in_india BOOLEAN,
    otc BOOLEAN,
    source TEXT,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dr.id,
        dr.generic_name,
        dr.brand_names,
        dr.drug_class,
        dr.indications,
        dr.adult_dosage,
        dr.pediatric_dosage,
        dr.frequency,
        dr.duration_typical,
        dr.route,
        dr.contraindications,
        dr.side_effects,
        dr.interactions,
        dr.pregnancy_category,
        dr.available_in_india,
        dr.otc,
        dr.source,
        1 - (dr.embedding <=> query_embedding) AS similarity
    FROM drug_reference dr
    WHERE 1 - (dr.embedding <=> query_embedding) > match_threshold
    ORDER BY dr.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
