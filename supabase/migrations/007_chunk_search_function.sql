CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.3,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    content TEXT,
    chunk_index INTEGER,
    metadata JSONB,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        mc.id,
        mc.document_id,
        mc.content,
        mc.chunk_index,
        mc.metadata,
        1 - (mc.embedding <=> query_embedding) AS similarity
    FROM medical_chunks mc
    WHERE 1 - (mc.embedding <=> query_embedding) > match_threshold
    ORDER BY mc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
