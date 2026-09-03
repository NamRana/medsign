"""Continue NFI ingestion for remaining chunks + new drugs.
Skips already-stored chunks, uses slower rate to avoid 429s.

Usage (from backend/):
    source .venv/bin/activate
    python -m app.rag.run_nfi_remaining "../data/NFI_2011 (1).pdf"
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
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
}

EMBEDDING_MODEL = "gemini-embedding-001"
DELAY = 1.0  # 1 second between requests to avoid rate limits


async def embed(client: httpx.AsyncClient, text: str) -> list[float] | None:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBEDDING_MODEL}:embedContent"
    payload = {
        "model": f"models/{EMBEDDING_MODEL}",
        "content": {"parts": [{"text": text[:2000]}]},
        "outputDimensionality": 768,
    }
    for attempt in range(5):
        try:
            r = await client.post(url, json=payload, params={"key": GEMINI_API_KEY}, timeout=30)
            if r.status_code == 429:
                wait = 60 * (attempt + 1)
                logger.warning("Rate limited, waiting %ds (attempt %d/5)...", wait, attempt + 1)
                await asyncio.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()["embedding"]["values"]
        except Exception as e:
            logger.warning("Embed error (attempt %d): %s", attempt + 1, e)
            await asyncio.sleep(10)
    return None


async def sb_insert(client: httpx.AsyncClient, table: str, payload: dict) -> bool:
    try:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=HEADERS,
            json=payload,
            timeout=15,
        )
        return r.status_code in (200, 201, 409)
    except Exception as e:
        logger.error("Insert %s error: %s", table, e)
        return False


async def get_existing_drugs(client: httpx.AsyncClient) -> set[str]:
    r = await client.get(
        f"{SUPABASE_URL}/rest/v1/drug_reference?select=generic_name",
        headers=HEADERS,
        timeout=15,
    )
    if r.status_code == 200:
        return {d["generic_name"].lower().strip() for d in r.json()}
    return set()


async def get_stored_chunk_count(client: httpx.AsyncClient) -> int:
    r = await client.get(
        f"{SUPABASE_URL}/rest/v1/medical_chunks?select=id&limit=0",
        headers={**HEADERS, "Prefer": "count=exact"},
        timeout=15,
    )
    content_range = r.headers.get("content-range", "*/0")
    return int(content_range.split("/")[-1])


async def get_doc_id(client: httpx.AsyncClient) -> str | None:
    r = await client.get(
        f"{SUPABASE_URL}/rest/v1/medical_documents?select=id&title=eq.National Formulary of India 2011&limit=1",
        headers=HEADERS,
        timeout=15,
    )
    if r.status_code == 200 and r.json():
        return r.json()[0]["id"]
    return None


async def ingest(pdf_path: str):
    from app.rag.nfi_ingestion import (
        extract_full_text,
        split_into_sections,
        chunk_section,
        extract_drug_entries,
    )

    logger.info("=== NFI 2011 Remaining Ingestion ===")
    full_text, pages = extract_full_text(pdf_path)
    logger.info("Pages: %d | Characters: %d", len(pages), len(full_text))

    sections = split_into_sections(full_text)
    all_chunks = []
    for s in sections:
        all_chunks.extend(chunk_section(s))

    drug_entries = extract_drug_entries(pages)
    logger.info("Total chunks: %d | Total drugs: %d", len(all_chunks), len(drug_entries))

    async with httpx.AsyncClient(verify=False) as client:
        stored_count = await get_stored_chunk_count(client)
        existing_drugs = await get_existing_drugs(client)
        doc_id = await get_doc_id(client)

        logger.info("Already stored: %d chunks, %d drugs", stored_count, len(existing_drugs))
        logger.info("Document ID: %s", doc_id)

        if not doc_id:
            doc_id = str(uuid4())
            await sb_insert(client, "medical_documents", {
                "id": doc_id,
                "title": "National Formulary of India 2011",
                "source": "Indian Pharmacopoeia Commission",
                "source_type": "formulary",
                "country": "IN",
                "language": "en",
            })

        # --- Remaining chunks ---
        skip = stored_count
        remaining_chunks = all_chunks[skip:]
        logger.info("Skipping first %d chunks, processing %d remaining...", skip, len(remaining_chunks))

        chunk_ok = 0
        chunk_fail = 0
        for i, chunk in enumerate(remaining_chunks):
            idx = skip + i
            embedding = await embed(client, chunk["content"])
            if not embedding:
                chunk_fail += 1
                logger.warning("Chunk %d failed permanently, skipping", idx)
                continue

            await asyncio.sleep(DELAY)

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

            if (i + 1) % 25 == 0:
                logger.info("Chunks: %d/%d done (%d ok, %d fail)", i + 1, len(remaining_chunks), chunk_ok, chunk_fail)

        logger.info("=== Chunks: %d new ok, %d fail (total in DB: %d) ===", chunk_ok, chunk_fail, stored_count + chunk_ok)

        # --- New drugs ---
        new_drugs = [d for d in drug_entries if d["generic_name"].lower().strip() not in existing_drugs]
        logger.info("Processing %d new drugs (skipping %d existing)...", len(new_drugs), len(drug_entries) - len(new_drugs))

        drug_ok = 0
        drug_fail = 0
        for i, drug in enumerate(new_drugs):
            drug_text = f"Drug: {drug['generic_name']}\nIndications: {drug['indications_text']}\nDosage: {drug['dose_text']}"
            embedding = await embed(client, drug_text)
            await asyncio.sleep(DELAY)

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
                existing_drugs.add(drug["generic_name"].lower().strip())
            else:
                drug_fail += 1

            if (i + 1) % 20 == 0:
                logger.info("Drugs: %d/%d done (%d ok, %d fail)", i + 1, len(new_drugs), drug_ok, drug_fail)

        logger.info("=== Drugs: %d new ok, %d fail (total in DB: %d) ===", drug_ok, drug_fail, len(existing_drugs))

    print(json.dumps({
        "chunks_already": stored_count,
        "chunks_new_ok": chunk_ok,
        "chunks_new_fail": chunk_fail,
        "drugs_new_ok": drug_ok,
        "drugs_new_fail": drug_fail,
        "total_chunks": stored_count + chunk_ok,
        "total_drugs": len(existing_drugs),
    }, indent=2))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m app.rag.run_nfi_remaining <path-to-nfi-pdf>")
        sys.exit(1)
    asyncio.run(ingest(sys.argv[1]))
