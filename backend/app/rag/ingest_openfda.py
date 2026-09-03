"""Ingest drug data from OpenFDA Drug Label API into drug_reference table.

Usage:
    cd backend
    python -m app.rag.ingest_openfda

Pulls commonly prescribed drugs from the FDA drug labeling endpoint,
extracts structured fields (indications, contraindications, interactions,
side effects, pregnancy info), and upserts into the Supabase drug_reference table.

No API key needed. Rate limit: 240 requests/min without a key.
"""

from __future__ import annotations

import json
import logging
import re
import sys
import time

import httpx

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

OPENFDA_BASE = "https://api.fda.gov/drug/label.json"

COMMON_DRUGS = [
    "acetaminophen", "ibuprofen", "aspirin", "naproxen", "amoxicillin",
    "azithromycin", "ciprofloxacin", "metformin", "atorvastatin", "lisinopril",
    "amlodipine", "omeprazole", "pantoprazole", "losartan", "metoprolol",
    "levothyroxine", "gabapentin", "sertraline", "fluoxetine", "escitalopram",
    "tramadol", "prednisone", "prednisolone", "montelukast", "cetirizine",
    "loratadine", "fexofenadine", "ranitidine", "famotidine", "domperidone",
    "ondansetron", "diclofenac", "meloxicam", "celecoxib", "clopidogrel",
    "warfarin", "enoxaparin", "insulin", "glimepiride", "gliclazide",
    "pioglitazone", "sitagliptin", "empagliflozin", "dapagliflozin", "rosuvastatin",
    "simvastatin", "pravastatin", "ramipril", "enalapril", "telmisartan",
    "valsartan", "hydrochlorothiazide", "furosemide", "spironolactone", "atenolol",
    "propranolol", "carvedilol", "diltiazem", "verapamil", "nifedipine",
    "salbutamol", "albuterol", "budesonide", "fluticasone", "beclomethasone",
    "ipratropium", "tiotropium", "doxycycline", "clindamycin", "metronidazole",
    "cephalexin", "cefuroxime", "ceftriaxone", "levofloxacin", "moxifloxacin",
    "clarithromycin", "erythromycin", "trimethoprim", "nitrofurantoin", "fluconazole",
    "ketoconazole", "acyclovir", "valacyclovir", "oseltamivir", "hydroxychloroquine",
    "chloroquine", "ivermectin", "albendazole", "mebendazole", "dexamethasone",
    "methylprednisolone", "hydrocortisone", "betamethasone", "clobetasol",
    "mupirocin", "clotrimazole", "terbinafine", "permethrin",
    "diazepam", "lorazepam", "alprazolam", "clonazepam", "zolpidem",
    "amitriptyline", "duloxetine", "venlafaxine", "mirtazapine", "bupropion",
    "olanzapine", "quetiapine", "risperidone", "aripiprazole", "haloperidol",
    "lithium", "valproic acid", "carbamazepine", "phenytoin", "levetiracetam",
    "lamotrigine", "topiramate", "sumatriptan", "rizatriptan",
    "sildenafil", "tadalafil", "tamsulosin", "finasteride", "dutasteride",
    "methotrexate", "sulfasalazine", "colchicine", "allopurinol", "febuxostat",
    "iron", "folic acid", "vitamin d", "calcium carbonate", "vitamin b12",
    "zinc", "magnesium", "potassium chloride",
    "morphine", "codeine", "oxycodone", "fentanyl",
    "lidocaine", "bupivacaine", "atropine", "adrenaline",
    "dopamine", "dobutamine", "noradrenaline",
    "heparin", "rivaroxaban", "apixaban", "dabigatran",
    "digoxin", "amiodarone", "adenosine",
    "tacrolimus", "cyclosporine", "mycophenolate",
    "tamoxifen", "letrozole", "anastrozole",
    "mesalamine", "loperamide", "bisacodyl", "lactulose",
    "metoclopramide", "hyoscine", "dicyclomine",
]


def _clean_text(text_list: list[str] | str | None, max_len: int = 2000) -> str | None:
    if not text_list:
        return None
    if isinstance(text_list, list):
        text = " ".join(text_list)
    else:
        text = text_list
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_len] if text else None


def _extract_list_items(text: str | None, max_items: int = 10) -> list[str]:
    if not text:
        return []
    items = re.split(r"[•\n;]|\d+\.\s", text)
    result = []
    for item in items:
        cleaned = item.strip().rstrip(".")
        if cleaned and len(cleaned) > 3 and len(cleaned) < 200:
            result.append(cleaned)
        if len(result) >= max_items:
            break
    return result


def _extract_pregnancy_category(text: str | None) -> str | None:
    if not text:
        return None
    match = re.search(r"(?:pregnancy\s+)?category\s+([ABCDX])", text, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    if re.search(r"contraindicated.*pregnan|not.*(?:use|take).*pregnan", text, re.IGNORECASE):
        return "X"
    if re.search(r"no adequate.*(?:studies|data).*pregnan", text, re.IGNORECASE):
        return "C"
    return None


def _fetch_drug(client: httpx.Client, generic_name: str) -> dict | None:
    """Fetch a single drug label from OpenFDA."""
    params = {
        "search": f'openfda.generic_name:"{generic_name}"',
        "limit": "1",
    }
    try:
        resp = client.get(OPENFDA_BASE, params=params, timeout=15)
        if resp.status_code == 404:
            return None
        if resp.status_code == 429:
            logger.warning("Rate limited, sleeping 10s...")
            time.sleep(10)
            resp = client.get(OPENFDA_BASE, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        return results[0] if results else None
    except Exception as exc:
        logger.warning("Failed to fetch %s: %s", generic_name, exc)
        return None


def _parse_label(label: dict, search_name: str) -> dict | None:
    """Parse an OpenFDA label into our drug_reference schema."""
    openfda = label.get("openfda", {})

    generic_names = openfda.get("generic_name", [])
    generic_name = generic_names[0].title() if generic_names else search_name.title()

    brand_names = openfda.get("brand_name", [])
    brand_names = [b.title() for b in brand_names[:5]]

    product_type = openfda.get("product_type", [])
    is_otc = any("OTC" in pt.upper() for pt in product_type)

    pharm_classes = openfda.get("pharm_class_epc", [])
    drug_class = pharm_classes[0] if pharm_classes else None

    indications_raw = _clean_text(label.get("indications_and_usage"))
    indications = _extract_list_items(indications_raw, 5) if indications_raw else []
    if not indications and indications_raw:
        indications = [indications_raw[:300]]

    contraindications_raw = _clean_text(label.get("contraindications"))
    contraindications = _extract_list_items(contraindications_raw, 5)
    if not contraindications and contraindications_raw:
        contraindications = [contraindications_raw[:300]]

    interactions_raw = _clean_text(label.get("drug_interactions"))
    interactions = _extract_list_items(interactions_raw, 8)
    if not interactions and interactions_raw:
        interactions = [interactions_raw[:300]]

    side_effects_raw = _clean_text(label.get("adverse_reactions"))
    side_effects = _extract_list_items(side_effects_raw, 10)
    if not side_effects and side_effects_raw:
        side_effects = [side_effects_raw[:300]]

    warnings_raw = _clean_text(label.get("warnings") or label.get("warnings_and_cautions"))

    pregnancy_raw = _clean_text(label.get("pregnancy") or label.get("pregnancy_or_breast_feeding"))
    pregnancy_category = _extract_pregnancy_category(pregnancy_raw)
    if not pregnancy_category and warnings_raw:
        pregnancy_category = _extract_pregnancy_category(warnings_raw)

    dosage_raw = _clean_text(label.get("dosage_and_administration"))
    routes = openfda.get("route", [])

    return {
        "generic_name": generic_name,
        "brand_names": brand_names,
        "drug_class": drug_class,
        "indications": indications,
        "contraindications": contraindications,
        "side_effects": side_effects,
        "interactions": interactions,
        "pregnancy_category": pregnancy_category,
        "otc": is_otc,
        "source": "OpenFDA",
        "dosage_forms": routes[:3] if routes else [],
        "warnings": warnings_raw[:500] if warnings_raw else None,
    }


def _upsert_drug(supabase_client, drug_data: dict) -> bool:
    """Insert or update a drug in drug_reference. Returns True if inserted/updated."""
    generic_lower = drug_data["generic_name"].lower()

    existing = (
        supabase_client.table("drug_reference")
        .select("id, source")
        .ilike("generic_name", generic_lower)
        .execute()
    )

    if existing.data:
        row = existing.data[0]
        existing_source = (row.get("source") or "").lower()
        if "nfi" in existing_source or "national formulary" in existing_source:
            update_fields = {}
            if drug_data.get("interactions"):
                update_fields["interactions"] = drug_data["interactions"]
            if drug_data.get("pregnancy_category"):
                update_fields["pregnancy_category"] = drug_data["pregnancy_category"]
            if drug_data.get("side_effects") and len(drug_data["side_effects"]) > 0:
                update_fields["side_effects"] = drug_data["side_effects"]
            if update_fields:
                supabase_client.table("drug_reference").update(update_fields).eq("id", row["id"]).execute()
                return True
            return False
        else:
            supabase_client.table("drug_reference").update(drug_data).eq("id", row["id"]).execute()
            return True
    else:
        supabase_client.table("drug_reference").insert(drug_data).execute()
        return True


def main():
    from app.dependencies import supabase as supabase_client

    logger.info("Starting OpenFDA drug ingestion — %d drugs to process", len(COMMON_DRUGS))

    inserted = 0
    skipped = 0
    failed = 0

    with httpx.Client(verify=False) as client:
        for i, drug_name in enumerate(COMMON_DRUGS):
            logger.info("[%d/%d] Fetching: %s", i + 1, len(COMMON_DRUGS), drug_name)

            label = _fetch_drug(client, drug_name)
            if not label:
                logger.warning("  No label found for %s", drug_name)
                skipped += 1
                continue

            parsed = _parse_label(label, drug_name)
            if not parsed:
                skipped += 1
                continue

            try:
                if _upsert_drug(supabase_client, parsed):
                    inserted += 1
                    logger.info("  ✓ %s (%s)", parsed["generic_name"], parsed.get("drug_class") or "no class")
                else:
                    skipped += 1
            except Exception as exc:
                logger.error("  ✗ Failed to upsert %s: %s", drug_name, exc)
                failed += 1

            if (i + 1) % 30 == 0:
                logger.info("  [Rate limit pause — 2s]")
                time.sleep(2)
            else:
                time.sleep(0.3)

    logger.info("Done! Inserted/updated: %d | Skipped: %d | Failed: %d", inserted, skipped, failed)


if __name__ == "__main__":
    main()
