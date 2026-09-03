"""Standalone NFI ingestion script with rate-limit handling.

Usage (from backend/):
    python -m app.rag.run_nfi_ingestion "../data/NFI_2011 (1).pdf"
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from uuid import uuid4

import httpx
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger("nfi")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_RPM = 1500
DELAY_BETWEEN_EMBEDS = 60.0 / EMBEDDING_RPM


async def generate_embedding(client: httpx.AsyncClient, text: str) -> list[float] | None:
    """Call Gemini embedding API with retry."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBEDDING_MODEL}:embedContent"
    payload = {
        "model": f"models/{EMBEDDING_MODEL}",
        "content": {"parts": [{"text": text[:2000]}]},
        "outputDimensionality": 768,
    }
    for attempt in range(3):
        try:
            r = await client.post(url, json=payload, params={"key": GEMINI_API_KEY}, timeout=30)
            if r.status_code == 429:
                wait = 30 * (attempt + 1)
                logger.warning("Embedding rate limited, waiting %ds...", wait)
                await asyncio.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()["embedding"]["values"]
        except Exception as e:
            logger.warning("Embedding attempt %d failed: %s", attempt + 1, e)
            await asyncio.sleep(5)
    return None


async def sb_insert(client: httpx.AsyncClient, table: str, payload: dict) -> bool:
    """Insert a row into Supabase."""
    try:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=HEADERS,
            json=payload,
            timeout=15,
        )
        if r.status_code in (200, 201):
            return True
        if r.status_code == 409:
            return True
        logger.warning("Insert to %s failed (%d): %s", table, r.status_code, r.text[:200])
        return False
    except Exception as e:
        logger.error("Insert error for %s: %s", table, e)
        return False


async def sb_upsert(client: httpx.AsyncClient, table: str, payload: dict) -> bool:
    """Upsert a row into Supabase."""
    try:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers={**HEADERS, "Prefer": "resolution=merge-duplicates"},
            json=payload,
            timeout=15,
        )
        return r.status_code in (200, 201)
    except Exception as e:
        logger.error("Upsert error for %s: %s", table, e)
        return False


async def get_existing_drugs(client: httpx.AsyncClient) -> set[str]:
    """Get names of drugs already in the database."""
    r = await client.get(
        f"{SUPABASE_URL}/rest/v1/drug_reference?select=generic_name",
        headers=HEADERS,
        timeout=15,
    )
    if r.status_code == 200:
        return {d["generic_name"].lower().strip() for d in r.json()}
    return set()


async def ingest(pdf_path: str):
    from app.rag.nfi_ingestion import (
        extract_full_text,
        split_into_sections,
        chunk_section,
        extract_drug_entries,
    )

    logger.info("=== NFI 2011 Full Ingestion ===")
    logger.info("Extracting text from: %s", pdf_path)
    full_text, pages = extract_full_text(pdf_path)
    logger.info("Pages: %d | Characters: %d", len(pages), len(full_text))

    sections = split_into_sections(full_text)
    all_chunks = []
    for s in sections:
        all_chunks.extend(chunk_section(s))
    logger.info("Chapters: %d | Chunks: %d", len(sections), len(all_chunks))

    drug_entries = extract_drug_entries(pages)
    logger.info("Drug entries extracted: %d", len(drug_entries))

    async with httpx.AsyncClient(verify=False) as client:
        existing_drugs = await get_existing_drugs(client)
        logger.info("Existing drugs in DB: %d", len(existing_drugs))

        # --- Step 1: Create document record ---
        doc_id = str(uuid4())
        await sb_insert(client, "medical_documents", {
            "id": doc_id,
            "title": "National Formulary of India 2011",
            "source": "Indian Pharmacopoeia Commission",
            "source_type": "formulary",
            "version": "4th Edition",
            "publication_date": "2011-01-01",
            "topic": "Drug formulary and prescribing guidelines",
            "country": "IN",
            "language": "en",
        })
        logger.info("Document record created: %s", doc_id)

        # --- Step 2: Ingest chunks with embeddings ---
        chunk_ok = 0
        chunk_fail = 0
        for idx, chunk in enumerate(all_chunks):
            embedding = await generate_embedding(client, chunk["content"])
            if not embedding:
                chunk_fail += 1
                continue
            await asyncio.sleep(DELAY_BETWEEN_EMBEDS)

            success = await sb_insert(client, "medical_chunks", {
                "id": str(uuid4()),
                "document_id": doc_id,
                "content": chunk["content"],
                "embedding": embedding,
                "chunk_index": idx,
                "metadata": {
                    "source_file": "NFI_2011.pdf",
                    "chapter_number": chunk.get("chapter_number"),
                    "chapter_title": chunk.get("chapter_title"),
                    "type": "nfi_formulary",
                },
            })
            if success:
                chunk_ok += 1
            else:
                chunk_fail += 1

            if (idx + 1) % 25 == 0:
                logger.info("Chunks: %d/%d done (%d ok, %d fail)", idx + 1, len(all_chunks), chunk_ok, chunk_fail)

        logger.info("=== Chunks done: %d ok, %d fail out of %d ===", chunk_ok, chunk_fail, len(all_chunks))

        # --- Step 3: Ingest new drug entries ---
        drug_ok = 0
        drug_skip = 0
        drug_fail = 0
        for drug in drug_entries:
            name_lower = drug["generic_name"].lower().strip()
            if name_lower in existing_drugs:
                drug_skip += 1
                continue

            drug_text = f"Drug: {drug['generic_name']}\nIndications: {drug['indications_text']}\nDosage: {drug['dose_text']}"
            embedding = await generate_embedding(client, drug_text)
            await asyncio.sleep(DELAY_BETWEEN_EMBEDS)

            indications = [s.strip() for s in drug["indications_text"].split(";") if s.strip()]
            contraindications = [s.strip() for s in drug["contraindications_text"].split(";") if s.strip()]
            side_effects = [s.strip() for s in drug["adverse_effects_text"].split(";") if s.strip()]

            success = await sb_insert(client, "drug_reference", {
                "id": str(uuid4()),
                "generic_name": drug["generic_name"],
                "brand_names": [],
                "drug_class": "",
                "indications": indications[:10],
                "adult_dosage": drug["dose_text"][:300] if drug["dose_text"] else "",
                "frequency": "",
                "contraindications": contraindications[:10],
                "side_effects": side_effects[:10],
                "interactions": [],
                "pregnancy_category": drug.get("pregnancy_category"),
                "available_in_india": True,
                "otc": False,
                "source": "National Formulary of India 2011",
                "embedding": embedding,
            })
            if success:
                drug_ok += 1
                existing_drugs.add(name_lower)
            else:
                drug_fail += 1

            if (drug_ok + drug_fail) % 20 == 0 and (drug_ok + drug_fail) > 0:
                logger.info("Drugs: %d ok, %d skip, %d fail so far", drug_ok, drug_skip, drug_fail)

        logger.info("=== Drugs done: %d new, %d skipped (already exist), %d failed ===", drug_ok, drug_skip, drug_fail)

    print(json.dumps({
        "document_id": doc_id,
        "pages": len(pages),
        "chunks_ok": chunk_ok,
        "chunks_fail": chunk_fail,
        "drugs_new": drug_ok,
        "drugs_skipped": drug_skip,
        "drugs_failed": drug_fail,
    }, indent=2))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m app.rag.run_nfi_ingestion <path-to-nfi-pdf>")
        sys.exit(1)
    asyncio.run(ingest(sys.argv[1]))
