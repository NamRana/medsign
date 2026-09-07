"""Homeopathy knowledge ingestion pipeline.

Loads homeopathy remedy data from JSON (Boericke's Materia Medica),
generates embeddings, and stores them in the homeopathy_reference table.
Rate-limited to stay within Gemini free-tier quota (100 req/min).
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from uuid import uuid4

from app.dependencies import supabase
from app.rag.embeddings import generate_embedding

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"

BATCH_SIZE = 50
BATCH_PAUSE_SECONDS = 65
MAX_RETRIES = 5
RETRY_DELAY_SECONDS = 60


def _build_remedy_text(remedy: dict) -> str:
    """Build a searchable text representation of a homeopathy remedy for embedding."""
    indications = ", ".join(remedy.get("indications", []))
    organ_keys = ", ".join(remedy.get("organ_system_symptoms", {}).keys())
    description = remedy.get("description", "")[:500]

    parts = [
        f"Homeopathy Remedy: {remedy['generic_name']}",
        f"Common name: {remedy.get('common_name', 'N/A')}",
        f"Abbreviation: {remedy.get('abbreviation', 'N/A')}",
    ]
    if indications:
        parts.append(f"Indications: {indications}")
    if organ_keys:
        parts.append(f"Organ systems: {organ_keys}")
    if description:
        parts.append(f"Description: {description}")
    if remedy.get("adult_dosage"):
        parts.append(f"Dosage: {remedy['adult_dosage']}")

    return "\n".join(parts)


def _get_existing_names() -> set[str]:
    """Fetch names already in the table to skip duplicates."""
    resp = supabase.table("homeopathy_reference").select("generic_name").execute()
    return {r["generic_name"] for r in resp.data}


async def _embed_with_retry(text: str) -> list[float]:
    """Generate embedding with retry on rate-limit errors."""
    for attempt in range(MAX_RETRIES):
        try:
            return await generate_embedding(text)
        except Exception as exc:
            if "429" in str(exc) or "RESOURCE_EXHAUSTED" in str(exc):
                wait = RETRY_DELAY_SECONDS * (attempt + 1)
                logger.warning("Rate limited, waiting %ds before retry %d/%d", wait, attempt + 1, MAX_RETRIES)
                await asyncio.sleep(wait)
            else:
                raise
    raise RuntimeError("Max retries exceeded for embedding generation")


async def ingest_homeopathy(skip_embeddings: bool = False) -> int:
    """Load homeopathy remedies from JSON and store in Supabase.

    Args:
        skip_embeddings: If True, insert data without embeddings (fast).
                         Embeddings can be backfilled later.
    """
    filepath = DATA_DIR / "homeopathy_drugs.json"
    if not filepath.exists():
        logger.error("homeopathy_drugs.json not found in %s", DATA_DIR)
        return 0

    remedies = json.loads(filepath.read_text(encoding="utf-8"))
    logger.info("Loaded %d homeopathy remedies", len(remedies))

    existing = _get_existing_names()
    remaining = [r for r in remedies if r["generic_name"] not in existing]
    logger.info("Skipping %d already ingested, %d remaining", len(existing), len(remaining))

    count = 0
    for i, remedy in enumerate(remaining):
        embedding = None
        if not skip_embeddings:
            if i > 0 and i % BATCH_SIZE == 0:
                logger.info("Pausing %ds for rate limit (processed %d/%d)...", BATCH_PAUSE_SECONDS, i, len(remaining))
                await asyncio.sleep(BATCH_PAUSE_SECONDS)

            text = _build_remedy_text(remedy)
            try:
                embedding = await _embed_with_retry(text)
            except Exception as exc:
                logger.error(
                    "Failed to generate embedding for %s: %s",
                    remedy["generic_name"],
                    exc,
                )

        payload = {
            "id": str(uuid4()),
            "generic_name": remedy["generic_name"],
            "abbreviation": remedy.get("abbreviation"),
            "common_name": remedy.get("common_name"),
            "description": remedy.get("description"),
            "indications": remedy.get("indications", []),
            "adult_dosage": remedy.get("adult_dosage"),
            "frequency": remedy.get("frequency", "As directed by practitioner"),
            "duration_typical": remedy.get("duration_typical"),
            "route": remedy.get("route", "oral (sublingual)"),
            "organ_system_symptoms": remedy.get("organ_system_symptoms", {}),
            "modalities": remedy.get("modalities"),
            "relationships": remedy.get("relationships"),
            "available_in_india": remedy.get("available_in_india", True),
            "otc": remedy.get("otc", True),
            "source": remedy.get("source", "Boericke's Materia Medica"),
        }
        if embedding:
            payload["embedding"] = embedding

        try:
            supabase.table("homeopathy_reference").insert(payload).execute()
            count += 1
            if count % 100 == 0:
                logger.info("Progress: ingested %d/%d remedies", count, len(remaining))
        except Exception as exc:
            logger.error(
                "Failed to insert remedy %s: %s",
                remedy["generic_name"],
                exc,
            )

    logger.info("Ingestion complete: %d new remedies added", count)
    return count
