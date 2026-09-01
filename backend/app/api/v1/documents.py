"""Document upload and management endpoints."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.middleware.auth import get_current_user

from app.dependencies import supabase

router = APIRouter()
logger = logging.getLogger(__name__)


class DocumentResponse(BaseModel):
    document_id: str
    chunk_count: int
    message: str


class DocumentListItem(BaseModel):
    id: str
    title: str
    source: str
    source_type: str
    topic: str | None = None
    country: str | None = None
    language: str | None = None
    chunk_count: int = 0
    created_at: str | None = None


class DocumentListResponse(BaseModel):
    documents: list[DocumentListItem]
    total: int


class DeleteResponse(BaseModel):
    message: str


ALLOWED_EXTENSIONS = {".pdf", ".txt"}


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    source: str = Form(...),
    topic: str = Form(default=""),
    source_type: str = Form(default="guideline"),
    user=Depends(get_current_user),
) -> DocumentResponse:
    """Upload a PDF or text file and ingest it into the knowledge base.

    The file is chunked, embedded, and stored in the medical_chunks table.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must have a filename.",
        )

    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{suffix}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Write uploaded file to a temporary location
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = Path(tmp.name)
    except Exception as exc:
        logger.error("Failed to save uploaded file: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process uploaded file.",
        ) from exc

    # Run ingestion pipeline
    try:
        from app.rag.document_ingestion import ingest_document

        result = await ingest_document(
            file_path=tmp_path,
            title=title,
            source=source,
            source_type=source_type,
            topic=topic or None,
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error("Document ingestion failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion failed: {exc}",
        ) from exc
    finally:
        # Clean up temp file
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass

    return DocumentResponse(
        document_id=result["document_id"],
        chunk_count=result["chunk_count"],
        message=f"Successfully ingested '{title}' with {result['chunk_count']} chunks.",
    )


@router.get("", response_model=DocumentListResponse)
async def list_documents(user=Depends(get_current_user)) -> DocumentListResponse:
    """List all ingested documents with their chunk counts."""
    try:
        # Fetch all documents
        doc_response = supabase.table("medical_documents").select("*").order(
            "created_at", desc=True
        ).execute()
    except Exception as exc:
        logger.error("Failed to fetch documents: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch documents.",
        ) from exc

    if not doc_response.data:
        return DocumentListResponse(documents=[], total=0)

    # Fetch chunk counts per document
    documents: list[DocumentListItem] = []
    for doc in doc_response.data:
        doc_id = doc["id"]
        try:
            chunk_response = (
                supabase.table("medical_chunks")
                .select("id", count="exact")
                .eq("document_id", doc_id)
                .execute()
            )
            chunk_count = chunk_response.count or 0
        except Exception:
            chunk_count = 0

        documents.append(
            DocumentListItem(
                id=doc_id,
                title=doc["title"],
                source=doc["source"],
                source_type=doc["source_type"],
                topic=doc.get("topic"),
                country=doc.get("country"),
                language=doc.get("language"),
                chunk_count=chunk_count,
                created_at=doc.get("created_at"),
            )
        )

    return DocumentListResponse(documents=documents, total=len(documents))


@router.delete("/{document_id}", response_model=DeleteResponse)
async def delete_document(document_id: str, user=Depends(get_current_user)) -> DeleteResponse:
    """Delete a document and all its associated chunks.

    Chunks are deleted automatically via ON DELETE CASCADE.
    """
    # Verify document exists
    try:
        response = (
            supabase.table("medical_documents")
            .select("id, title")
            .eq("id", document_id)
            .execute()
        )
    except Exception as exc:
        logger.error("Failed to look up document %s: %s", document_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to look up document.",
        ) from exc

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document not found: {document_id}",
        )

    title = response.data[0]["title"]

    # Delete (chunks cascade automatically)
    try:
        supabase.table("medical_documents").delete().eq("id", document_id).execute()
    except Exception as exc:
        logger.error("Failed to delete document %s: %s", document_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete document.",
        ) from exc

    logger.info("Deleted document '%s' (%s)", title, document_id)
    return DeleteResponse(message=f"Document '{title}' and its chunks have been deleted.")
