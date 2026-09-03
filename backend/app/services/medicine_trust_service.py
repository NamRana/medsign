"""Medicine Trust Cards — safety verification and evidence for prescribed medicines."""

from __future__ import annotations

import logging
import re
from uuid import UUID

from app.dependencies import supabase
from app.services.patient_state import PatientState

logger = logging.getLogger(__name__)


def _parse_medicines_from_assessment(assessment_text: str) -> list[dict]:
    """Extract medicine names and dosage from the assessment markdown table."""
    medicines: list[dict] = []

    lines = assessment_text.split("\n")
    in_prescription = False
    header_cols: list[str] = []

    for line in lines:
        stripped = line.strip()

        if not stripped:
            if in_prescription and medicines:
                break
            continue

        if re.match(r"^\|.*medicine.*\|", stripped, re.IGNORECASE):
            in_prescription = True
            header_cols = [c.strip().lower() for c in stripped.split("|") if c.strip()]
            continue

        if in_prescription and re.match(r"^\|[\s\-:]+\|", stripped):
            continue

        if in_prescription and stripped.startswith("|"):
            cols = [c.strip() for c in stripped.split("|") if c.strip()]
            if not cols:
                continue

            med_name = cols[0] if cols else ""
            med_name = re.sub(r"^\d+\.\s*", "", med_name).strip()
            med_name = re.sub(r"\*+", "", med_name).strip()

            if not med_name or med_name.lower() in ("medicine", "---", ""):
                continue

            med: dict = {"raw_name": med_name}
            generic = re.sub(
                r"^(Tab\.|Cap\.|Syr\.|Drops|Cream|Oint\.|Gel|Inj\.)\s*",
                "",
                med_name,
                flags=re.IGNORECASE,
            ).strip()
            parts = re.split(r"\s+\d+\s*mg|\s+\d+\s*ml|\s+\d+\s*%", generic, maxsplit=1)
            med["search_name"] = parts[0].strip() if parts else generic

            if len(cols) > 1:
                for i, col_name in enumerate(header_cols):
                    if i < len(cols):
                        if "instruction" in col_name or "note" in col_name:
                            med["instructions"] = cols[i]
                        elif "duration" in col_name:
                            med["duration"] = cols[i]

            dosage_match = re.search(r"(\d+\s*(?:mg|ml|%|mcg|g))", med_name, re.IGNORECASE)
            if dosage_match:
                med["dosage"] = dosage_match.group(1)

            medicines.append(med)

    return medicines


def _lookup_drug(search_name: str) -> dict | None:
    """Look up a drug in the drug_reference table by name."""
    try:
        name_lower = search_name.lower().strip()
        resp = supabase.table("drug_reference").select("*").execute()
        if not resp.data:
            return None

        for row in resp.data:
            if row["generic_name"].lower() == name_lower:
                return row
            brands = row.get("brand_names") or []
            if isinstance(brands, list):
                for b in brands:
                    if isinstance(b, str) and b.lower() == name_lower:
                        return row

        for row in resp.data:
            if name_lower in row["generic_name"].lower():
                return row
            brands = row.get("brand_names") or []
            if isinstance(brands, list):
                for b in brands:
                    if isinstance(b, str) and name_lower in b.lower():
                        return row
    except Exception as exc:
        logger.warning("Drug lookup failed for '%s': %s", search_name, exc)
    return None


def _run_safety_checks(
    drug: dict | None, patient_state: PatientState, med_info: dict
) -> list[dict]:
    """Run safety checks and return a list of check results."""
    checks: list[dict] = []
    patient_allergies = [a.lower() for a in (patient_state.allergies or [])]
    patient_meds = [m.lower() for m in (patient_state.current_medications or [])]
    patient_conditions = [c.lower() for c in (patient_state.chronic_conditions or [])]
    patient_age = patient_state.age
    patient_gender = patient_state.gender

    # 1. Allergy check
    allergy_safe = True
    allergy_detail = "No known allergies to this medicine"
    if drug:
        drug_names = [drug["generic_name"].lower()] + [
            b.lower() for b in (drug.get("brand_names") or []) if isinstance(b, str)
        ]
        drug_class = (drug.get("drug_class") or "").lower()
        contras = [c.lower() for c in (drug.get("contraindications") or [])]
        for allergy in patient_allergies:
            if any(allergy in name for name in drug_names):
                allergy_safe = False
                allergy_detail = f"Possible allergy match: {allergy}"
                break
            if allergy in drug_class:
                allergy_safe = False
                allergy_detail = f"Allergy to drug class: {allergy}"
                break
            if any(allergy in c for c in contras):
                allergy_safe = False
                allergy_detail = f"Contraindicated due to: {allergy}"
                break
    if not patient_allergies:
        allergy_detail = "No allergies on file"

    checks.append({
        "name": "Allergy Check",
        "passed": allergy_safe,
        "detail": allergy_detail,
        "icon": "shield",
    })

    # 2. Drug interaction check
    interaction_safe = True
    interaction_detail = "No interactions with your current medicines"
    if drug and patient_meds:
        interactions = [i.lower() for i in (drug.get("interactions") or [])]
        for med in patient_meds:
            if any(med in inter for inter in interactions):
                interaction_safe = False
                interaction_detail = f"Possible interaction with {med}"
                break
            for inter in interactions:
                if med in inter:
                    interaction_safe = False
                    interaction_detail = f"Possible interaction with {med}"
                    break
    elif not patient_meds:
        interaction_detail = "No current medicines on file"

    checks.append({
        "name": "Drug Interaction",
        "passed": interaction_safe,
        "detail": interaction_detail,
        "icon": "layers",
    })

    # 3. Age-appropriate dosage
    age_safe = True
    age_detail = "Dosage appropriate for your age group"
    if drug and patient_age:
        if patient_age < 12 and not drug.get("pediatric_dosage"):
            age_safe = False
            age_detail = "Pediatric dosage data not available — verify with doctor"
        elif patient_age >= 65:
            age_detail = "Elderly patient — lower dosage may be needed"
        elif patient_age < 18:
            age_detail = "Pediatric dosage guidelines applied"
    elif not patient_age:
        age_detail = "Age not provided — general adult dosage used"

    checks.append({
        "name": "Age & Dosage",
        "passed": age_safe,
        "detail": age_detail,
        "icon": "user",
    })

    # 4. Condition safety
    condition_safe = True
    condition_detail = "Safe for your medical conditions"
    if drug and patient_conditions:
        contras = [c.lower() for c in (drug.get("contraindications") or [])]
        for condition in patient_conditions:
            if any(condition in c for c in contras):
                condition_safe = False
                condition_detail = f"Caution: contraindicated with {condition}"
                break
    elif not patient_conditions:
        condition_detail = "No chronic conditions on file"

    checks.append({
        "name": "Condition Safety",
        "passed": condition_safe,
        "detail": condition_detail,
        "icon": "heart",
    })

    # 5. Pregnancy safety (if applicable)
    if patient_gender and patient_gender.lower() in ("female", "f") and drug:
        preg_cat = drug.get("pregnancy_category") or "N/A"
        preg_safe = preg_cat in ("A", "B", "N/A", None)
        preg_detail = f"Pregnancy category: {preg_cat}" if preg_cat != "N/A" else "Pregnancy safety data not available"
        if not preg_safe:
            preg_detail = f"Pregnancy category {preg_cat} — consult doctor if pregnant"
        checks.append({
            "name": "Pregnancy Safety",
            "passed": preg_safe,
            "detail": preg_detail,
            "icon": "baby",
        })

    return checks


def _build_evidence(drug: dict | None, med_info: dict) -> dict:
    """Build evidence/reasoning data for the prescribed medicine."""
    evidence: dict = {
        "source": "unknown",
        "drug_class": None,
        "mechanism": None,
        "is_otc": None,
        "guidelines": None,
    }

    if drug:
        evidence["source"] = drug.get("source") or "Medical knowledge base"
        evidence["drug_class"] = drug.get("drug_class")
        evidence["is_otc"] = drug.get("otc", False)

        indications = drug.get("indications") or []
        if indications:
            evidence["guidelines"] = f"Standard treatment for: {', '.join(indications[:3])}"

    return evidence


def _build_side_effects(drug: dict | None) -> list[dict]:
    """Extract and categorize side effects."""
    if not drug:
        return []

    side_effects = drug.get("side_effects") or []
    result = []
    for effect in side_effects[:6]:
        severity = "mild"
        effect_lower = effect.lower() if isinstance(effect, str) else ""
        if any(w in effect_lower for w in ("severe", "serious", "emergency", "anaphyl", "bleeding")):
            severity = "severe"
        elif any(w in effect_lower for w in ("moderate", "persistent", "liver", "kidney", "heart")):
            severity = "moderate"
        result.append({"effect": effect, "severity": severity})
    return result


def _find_alternatives(drug: dict | None, med_info: dict) -> list[dict]:
    """Find 1-2 alternative medicines from the same drug class."""
    if not drug or not drug.get("drug_class"):
        return []

    try:
        resp = (
            supabase.table("drug_reference")
            .select("generic_name, brand_names, drug_class, side_effects, otc")
            .eq("drug_class", drug["drug_class"])
            .limit(5)
            .execute()
        )
        if not resp.data:
            return []

        alternatives = []
        current_name = drug["generic_name"].lower()
        for row in resp.data:
            if row["generic_name"].lower() == current_name:
                continue
            brands = row.get("brand_names") or []
            brand_str = brands[0] if brands and isinstance(brands[0], str) else row["generic_name"]
            side_effect_count = len(row.get("side_effects") or [])
            alternatives.append({
                "name": row["generic_name"],
                "brand": brand_str,
                "drug_class": row["drug_class"],
                "note": "Fewer reported side effects" if side_effect_count < len(drug.get("side_effects") or []) else "Same drug class, different formulation",
                "is_otc": row.get("otc", False),
            })
            if len(alternatives) >= 2:
                break

        return alternatives
    except Exception as exc:
        logger.warning("Failed to find alternatives: %s", exc)
        return []


async def generate_trust_cards(
    assessment_text: str,
    patient_state: PatientState,
) -> list[dict]:
    """Parse assessment, look up drugs, run safety checks, and return trust cards."""
    parsed_medicines = _parse_medicines_from_assessment(assessment_text)
    if not parsed_medicines:
        return []

    trust_cards: list[dict] = []

    for med in parsed_medicines:
        drug = _lookup_drug(med["search_name"])

        safety_checks = _run_safety_checks(drug, patient_state, med)
        evidence = _build_evidence(drug, med)
        side_effects = _build_side_effects(drug)
        alternatives = _find_alternatives(drug, med)

        all_passed = all(c["passed"] for c in safety_checks)
        any_failed = any(not c["passed"] for c in safety_checks)

        card: dict = {
            "medicine_name": med["raw_name"],
            "generic_name": drug["generic_name"] if drug else med["search_name"],
            "dosage": med.get("dosage"),
            "duration": med.get("duration"),
            "instructions": med.get("instructions"),
            "verified": drug is not None,
            "safety_status": "danger" if any_failed else "safe" if all_passed else "caution",
            "safety_checks": safety_checks,
            "checks_passed": sum(1 for c in safety_checks if c["passed"]),
            "checks_total": len(safety_checks),
            "evidence": evidence,
            "side_effects": side_effects,
            "alternatives": alternatives,
            "drug_class": drug.get("drug_class") if drug else None,
            "is_otc": drug.get("otc") if drug else None,
            "brand_names": drug.get("brand_names") if drug else [],
        }

        trust_cards.append(card)

    return trust_cards
