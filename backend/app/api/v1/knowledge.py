"""Knowledge management endpoints — ingestion and search."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.middleware.auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


class IngestResponse(BaseModel):
    conditions_ingested: int
    drugs_ingested: int
    message: str


class SearchRequest(BaseModel):
    query: str
    condition_count: int = 3
    drug_count: int = 5


class SearchResponse(BaseModel):
    conditions: list[dict]
    drugs: list[dict]
    query_used: str


@router.post("/ingest", response_model=IngestResponse)
async def ingest_knowledge(user=Depends(get_current_user)):
    """Ingest all medical knowledge from JSON files into the vector database.

    This is an admin-only endpoint that should be run once to seed the knowledge base,
    and again whenever the source data is updated.
    """
    from app.rag.ingestion import ingest_all

    try:
        result = await ingest_all()
        return IngestResponse(
            conditions_ingested=result["conditions"],
            drugs_ingested=result["drugs"],
            message=f"Successfully ingested {result['conditions']} conditions and {result['drugs']} drugs.",
        )
    except Exception as exc:
        logger.error("Ingestion failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion failed: {exc}",
        ) from exc


@router.post("/search", response_model=SearchResponse)
async def search_knowledge(request: SearchRequest, user=Depends(get_current_user)):
    """Search the medical knowledge base for conditions and drugs matching a query.

    Useful for testing retrieval quality.
    """
    from app.rag.retrieval import retrieve_conditions, retrieve_drugs

    conditions = await retrieve_conditions(request.query, top_k=request.condition_count)
    drugs = await retrieve_drugs(request.query, top_k=request.drug_count)

    return SearchResponse(
        conditions=[
            {
                "condition_name": c.condition_name,
                "symptoms": c.symptoms,
                "first_line_treatment": c.first_line_treatment,
                "red_flags": c.red_flags,
                "similarity": c.similarity,
            }
            for c in conditions
        ],
        drugs=[
            {
                "generic_name": d.generic_name,
                "brand_names": d.brand_names,
                "drug_class": d.drug_class,
                "adult_dosage": d.adult_dosage,
                "frequency": d.frequency,
                "similarity": d.similarity,
            }
            for d in drugs
        ],
        query_used=request.query,
    )
