-- Vector similarity search function for homeopathy remedies
CREATE OR REPLACE FUNCTION match_homeopathy(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.3,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    generic_name TEXT,
    abbreviation TEXT,
    common_name TEXT,
    description TEXT,
    indications JSONB,
    adult_dosage TEXT,
    organ_system_symptoms JSONB,
    modalities JSONB,
    relationships TEXT,
    source TEXT,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        hr.id,
        hr.generic_name,
        hr.abbreviation,
        hr.common_name,
        hr.description,
        hr.indications,
        hr.adult_dosage,
        hr.organ_system_symptoms,
        hr.modalities,
        hr.relationships,
        hr.source,
        1 - (hr.embedding <=> query_embedding) AS similarity
    FROM homeopathy_reference hr
    WHERE hr.embedding IS NOT NULL
      AND 1 - (hr.embedding <=> query_embedding) > match_threshold
    ORDER BY hr.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
