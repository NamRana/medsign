"""Insert NFI drug entries into drug_reference WITHOUT embeddings.
Drugs are searched by name/indication columns, not by vector search.

Usage: python -m app.rag.insert_drugs_only "../data/NFI_2011 (1).pdf"
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
logger = logging.getLogger("nfi_drugs")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


async def ingest_drugs(pdf_path: str):
    from app.rag.nfi_ingestion import extract_full_text, extract_drug_entries

    logger.info("Extracting drugs from NFI PDF...")
    full_text, pages = extract_full_text(pdf_path)
    drug_entries = extract_drug_entries(pages)
    logger.info("Extracted %d drug entries from %d pages", len(drug_entries), len(pages))

    async with httpx.AsyncClient(verify=False) as client:
        # Get existing drugs
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/drug_reference?select=generic_name",
            headers=HEADERS,
            timeout=15,
        )
        existing = {d["generic_name"].lower().strip() for d in r.json()} if r.status_code == 200 else set()
        logger.info("Existing drugs in DB: %d", len(existing))

        ok = 0
        skip = 0
        fail = 0

        for drug in drug_entries:
            name_lower = drug["generic_name"].lower().strip()
            if name_lower in existing:
                skip += 1
                continue

            # Clean up name (some have chapter titles mixed in)
            name = drug["generic_name"].strip()
            if len(name) > 100 or "\n" in name:
                skip += 1
                continue

            indications = [s.strip() for s in drug["indications_text"].split(";") if s.strip()]
            if not indications:
                indications = [s.strip() for s in drug["indications_text"].split(",") if s.strip()]

            contraindications = [s.strip() for s in drug["contraindications_text"].split(";") if s.strip()]
            side_effects = [s.strip() for s in drug["adverse_effects_text"].split(";") if s.strip()]

            payload = {
                "id": str(uuid4()),
                "generic_name": name,
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
            }

            try:
                r = await client.post(
                    f"{SUPABASE_URL}/rest/v1/drug_reference",
                    headers=HEADERS,
                    json=payload,
                    timeout=15,
                )
                if r.status_code in (200, 201):
                    ok += 1
                    existing.add(name_lower)
                    logger.info("Added: %s (Cat %s)", name, drug.get("pregnancy_category", "?"))
                else:
                    fail += 1
                    logger.warning("Failed %s: %d %s", name, r.status_code, r.text[:100])
            except Exception as e:
                fail += 1
                logger.error("Error inserting %s: %s", name, e)

        logger.info("=== Done: %d new, %d skipped, %d failed | Total in DB: %d ===", ok, skip, fail, len(existing))

    print(json.dumps({"new": ok, "skipped": skip, "failed": fail, "total": len(existing)}, indent=2))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m app.rag.insert_drugs_only <path-to-nfi-pdf>")
        sys.exit(1)
    asyncio.run(ingest_drugs(sys.argv[1]))
