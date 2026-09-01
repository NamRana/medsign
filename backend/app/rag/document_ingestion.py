"""Document ingestion pipeline.

Accepts PDF or text files, chunks them into ~500 token segments with
50 token overlap, generates embeddings, and stores them in the
medical_chunks table alongside a parent medical_documents record.
"""

from __future__ import annotations

import logging
from pathlib import Path
from uuid import uuid4

from app.dependencies import supabase
from app.rag.embeddings import generate_embedding

logger = logging.getLogger(__name__)

# Approximate characters per token (conservative estimate for English text)
CHARS_PER_TOKEN = 4
CHUNK_SIZE_TOKENS = 500
CHUNK_OVERLAP_TOKENS = 50
CHUNK_SIZE_CHARS = CHUNK_SIZE_TOKENS * CHARS_PER_TOKEN
CHUNK_OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * CHARS_PER_TOKEN


def _extract_text_from_pdf(file_path: Path) -> str:
    """Extract all text from a PDF file."""
    from pypdf import PdfReader

    reader = PdfReader(str(file_path))
    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    return "\n\n".join(pages)


def _extract_text_from_file(file_path: Path) -> str:
    """Extract text from a supported file (PDF or plain text)."""
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        return _extract_text_from_pdf(file_path)
    # Default: treat as plain text
    return file_path.read_text(encoding="utf-8")


def _chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks of approximately 500 tokens.

    Uses a simple character-based splitting strategy with sentence-boundary
    awareness when possible.
    """
    if not text.strip():
        return []

    chunks: list[str] = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = start + CHUNK_SIZE_CHARS

        if end >= text_len:
            # Last chunk — take whatever remains
            chunk = text[start:].strip()
            if chunk:
                chunks.append(chunk)
            break

        # Try to break at a sentence boundary (period, newline) within the
        # last 20% of the chunk to avoid cutting mid-sentence.
        boundary_search_start = end - (CHUNK_SIZE_CHARS // 5)
        best_break = -1

        for sep in ("\n\n", "\n", ". ", "? ", "! "):
            idx = text.rfind(sep, boundary_search_start, end)
            if idx != -1:
                best_break = idx + len(sep)
                break

        if best_break > start:
            end = best_break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # Move forward by (chunk_size - overlap) characters
        start = end - CHUNK_OVERLAP_CHARS
        if start <= (end - CHUNK_SIZE_CHARS):
            # Safety: always advance
            start = end

    return chunks


async def create_document_record(
    title: str,
    source: str,
    source_type: str = "guideline",
    version: str | None = None,
    publication_date: str | None = None,
    topic: str | None = None,
    country: str = "IN",
    language: str = "en",
) -> str:
    """Create a record in the medical_documents table and return its ID."""
    doc_id = str(uuid4())
    payload: dict = {
        "id": doc_id,
        "title": title,
        "source": source,
        "source_type": source_type,
        "country": country,
        "language": language,
    }
    if version is not None:
        payload["version"] = version
    if publication_date is not None:
        payload["publication_date"] = publication_date
    if topic is not None:
        payload["topic"] = topic

    supabase.table("medical_documents").insert(payload).execute()
    logger.info("Created document record: %s (%s)", title, doc_id)
    return doc_id


async def ingest_document(
    file_path: str | Path,
    title: str,
    source: str,
    source_type: str = "guideline",
    version: str | None = None,
    publication_date: str | None = None,
    topic: str | None = None,
    country: str = "IN",
    language: str = "en",
) -> dict[str, str | int]:
    """Ingest a PDF or text document into the medical_chunks table.

    Steps:
        1. Extract text from the file.
        2. Chunk the text into ~500 token segments with 50 token overlap.
        3. Create a record in medical_documents.
        4. Generate embeddings and store each chunk in medical_chunks.

    Returns:
        dict with "document_id" and "chunk_count".
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    # Step 1: Extract text
    text = _extract_text_from_file(path)
    if not text.strip():
        raise ValueError(f"No text content extracted from: {file_path}")

    # Step 2: Chunk
    chunks = _chunk_text(text)
    if not chunks:
        raise ValueError(f"Text chunking produced no chunks from: {file_path}")

    logger.info("Extracted %d chunks from %s", len(chunks), path.name)

    # Step 3: Create document record
    doc_id = await create_document_record(
        title=title,
        source=source,
        source_type=source_type,
        version=version,
        publication_date=publication_date,
        topic=topic,
        country=country,
        language=language,
    )

    # Step 4: Generate embeddings and store chunks
    stored_count = 0
    for idx, chunk_content in enumerate(chunks):
        try:
            embedding = await generate_embedding(chunk_content)
        except Exception as exc:
            logger.error(
                "Failed to generate embedding for chunk %d of %s: %s",
                idx,
                title,
                exc,
            )
            continue

        chunk_payload = {
            "id": str(uuid4()),
            "document_id": doc_id,
            "content": chunk_content,
            "embedding": embedding,
            "chunk_index": idx,
            "metadata": {
                "source_file": path.name,
                "chunk_tokens_approx": len(chunk_content) // CHARS_PER_TOKEN,
            },
        }

        try:
            supabase.table("medical_chunks").insert(chunk_payload).execute()
            stored_count += 1
        except Exception as exc:
            logger.error(
                "Failed to insert chunk %d for document %s: %s",
                idx,
                doc_id,
                exc,
            )

    logger.info(
        "Ingested document '%s': %d/%d chunks stored (doc_id=%s)",
        title,
        stored_count,
        len(chunks),
        doc_id,
    )

    return {"document_id": doc_id, "chunk_count": stored_count}
