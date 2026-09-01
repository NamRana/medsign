"""Knowledge ingestion pipeline.

Loads structured medical knowledge (conditions + drugs) from JSON files,
generates embeddings, and stores them in Supabase for vector retrieval.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from uuid import uuid4

from app.dependencies import supabase
from app.rag.embeddings import generate_embedding

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"


def _build_condition_text(condition: dict) -> str:
    """Build a searchable text representation of a condition for embedding."""
    symptoms = ", ".join(condition["symptoms"])
    first_line = "; ".join(
        f"{t['drug']} {t['dose']} {t['frequency']}"
        for t in condition.get("first_line_treatment", [])
    )
    return (
        f"Condition: {condition['condition_name']}\n"
        f"ICD: {condition.get('icd_code', 'N/A')}\n"
        f"Symptoms: {symptoms}\n"
        f"First-line treatment: {first_line}\n"
        f"Red flags: {', '.join(condition.get('red_flags', []))}\n"
        f"When to refer: {condition.get('when_to_refer', 'N/A')}"
    )


def _build_drug_text(drug: dict) -> str:
    """Build a searchable text representation of a drug for embedding."""
    indications = ", ".join(drug["indications"])
    brands = ", ".join(drug.get("brand_names", []))
    return (
        f"Drug: {drug['generic_name']}\n"
        f"Class: {drug['drug_class']}\n"
        f"Brands (India): {brands}\n"
        f"Indications: {indications}\n"
        f"Dosage: {drug['adult_dosage']} {drug['frequency']}\n"
        f"Contraindications: {', '.join(drug.get('contraindications', []))}"
    )


async def ingest_conditions() -> int:
    """Load conditions from all JSON files and store with embeddings in Supabase."""
    conditions = []
    for filename in ("conditions.json", "conditions_extended.json"):
        filepath = DATA_DIR / filename
        if filepath.exists():
            conditions.extend(json.loads(filepath.read_text(encoding="utf-8")))
            logger.info("Loaded %s", filename)

    if not conditions:
        logger.error("No conditions files found in %s", DATA_DIR)
        return 0
    count = 0

    for condition in conditions:
        text = _build_condition_text(condition)
        try:
            embedding = await generate_embedding(text)
        except Exception as exc:
            logger.error("Failed to generate embedding for %s: %s", condition["condition_name"], exc)
            continue

        payload = {
            "id": str(uuid4()),
            "condition_name": condition["condition_name"],
            "icd_code": condition.get("icd_code"),
            "symptoms": condition["symptoms"],
            "differential_diagnosis": condition.get("differential_diagnosis", []),
            "first_line_treatment": condition.get("first_line_treatment", []),
            "second_line_treatment": condition.get("second_line_treatment", []),
            "contraindications": condition.get("contraindications", []),
            "red_flags": condition.get("red_flags", []),
            "when_to_refer": condition.get("when_to_refer"),
            "source": condition.get("source", "Open medical guidelines"),
            "embedding": embedding,
        }

        try:
            supabase.table("medical_knowledge").insert(payload).execute()
            count += 1
            logger.info("Ingested condition: %s", condition["condition_name"])
        except Exception as exc:
            logger.error("Failed to insert condition %s: %s", condition["condition_name"], exc)

    return count


async def ingest_drugs() -> int:
    """Load drugs from all JSON files and store with embeddings in Supabase."""
    drugs = []
    for filename in ("drugs.json", "drugs_extended.json"):
        filepath = DATA_DIR / filename
        if filepath.exists():
            drugs.extend(json.loads(filepath.read_text(encoding="utf-8")))
            logger.info("Loaded %s", filename)

    if not drugs:
        logger.error("No drugs files found in %s", DATA_DIR)
        return 0
    count = 0

    for drug in drugs:
        text = _build_drug_text(drug)
        try:
            embedding = await generate_embedding(text)
        except Exception as exc:
            logger.error("Failed to generate embedding for %s: %s", drug["generic_name"], exc)
            continue

        payload = {
            "id": str(uuid4()),
            "generic_name": drug["generic_name"],
            "brand_names": drug.get("brand_names", []),
            "drug_class": drug["drug_class"],
            "indications": drug["indications"],
            "adult_dosage": drug["adult_dosage"],
            "pediatric_dosage": drug.get("pediatric_dosage"),
            "frequency": drug["frequency"],
            "duration_typical": drug.get("duration_typical"),
            "route": drug.get("route", "oral"),
            "contraindications": drug.get("contraindications", []),
            "side_effects": drug.get("side_effects", []),
            "interactions": drug.get("interactions", []),
            "pregnancy_category": drug.get("pregnancy_category"),
            "available_in_india": drug.get("available_in_india", True),
            "otc": drug.get("otc", False),
            "source": drug.get("source", "WHO Essential Medicines"),
            "embedding": embedding,
        }

        try:
            supabase.table("drug_reference").insert(payload).execute()
            count += 1
            logger.info("Ingested drug: %s", drug["generic_name"])
        except Exception as exc:
            logger.error("Failed to insert drug %s: %s", drug["generic_name"], exc)

    return count


async def ingest_all() -> dict[str, int]:
    """Run full ingestion pipeline."""
    conditions_count = await ingest_conditions()
    drugs_count = await ingest_drugs()
    return {"conditions": conditions_count, "drugs": drugs_count}
