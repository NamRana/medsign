"""Drug Reference API — browse and search the NFI drug knowledge base."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.dependencies import supabase
from app.middleware.auth import get_current_user

router = APIRouter()


class DrugReferenceItem(BaseModel):
    id: str
    generic_name: str
    brand_names: list[str] = []
    drug_class: str = ""
    indications: list[str] = []
    adult_dosage: str = ""
    pediatric_dosage: str | None = None
    frequency: str = ""
    duration_typical: str | None = None
    route: str = "oral"
    contraindications: list[str] = []
    side_effects: list[str] = []
    interactions: list[str] = []
    pregnancy_category: str | None = None
    otc: bool = False
    source: str = ""


class DrugSearchResult(BaseModel):
    drugs: list[DrugReferenceItem]
    total: int


class DrugSuggestion(BaseModel):
    drug: DrugReferenceItem
    relevance: str


class ConditionMedicines(BaseModel):
    condition: str
    suggestions: list[DrugSuggestion]
    disclaimer: str = (
        "This information is from the National Formulary of India and is for "
        "educational purposes only. Always consult a qualified healthcare "
        "professional before taking any medication."
    )


@router.get("", response_model=DrugSearchResult)
async def list_drugs(
    q: str | None = Query(None, description="Search by name, class, or indication"),
    category: str | None = Query(None, description="Filter by drug class"),
    otc_only: bool = False,
    limit: int = Query(20, le=100),
    offset: int = 0,
    user=Depends(get_current_user),
):
    """Browse and search the drug reference database."""
    query = supabase.table("drug_reference").select(
        "id, generic_name, brand_names, drug_class, indications, "
        "adult_dosage, pediatric_dosage, frequency, duration_typical, "
        "route, contraindications, side_effects, interactions, "
        "pregnancy_category, otc, source",
        count="exact",
    )

    if q:
        query = query.or_(
            f"generic_name.ilike.%{q}%,"
            f"drug_class.ilike.%{q}%"
        )

    if category:
        query = query.ilike("drug_class", f"%{category}%")

    if otc_only:
        query = query.eq("otc", True)

    resp = query.order("generic_name").range(offset, offset + limit - 1).execute()

    return DrugSearchResult(drugs=resp.data, total=resp.count or len(resp.data))


@router.get("/categories", response_model=list[str])
async def list_categories(user=Depends(get_current_user)):
    """Get all unique drug classes for filtering."""
    resp = supabase.table("drug_reference").select("drug_class").execute()
    classes = sorted({r["drug_class"] for r in resp.data if r["drug_class"]})
    return classes


@router.get("/suggest")
async def suggest_for_condition(
    condition: str = Query(..., description="Condition or symptoms to match"),
    user=Depends(get_current_user),
) -> ConditionMedicines:
    """Suggest medicines from NFI for a given condition using AI matching."""
    from app.ai.gemini import get_gemini_provider

    resp = supabase.table("drug_reference").select(
        "id, generic_name, brand_names, drug_class, indications, "
        "adult_dosage, frequency, contraindications, side_effects, "
        "pregnancy_category, otc, source"
    ).execute()

    if not resp.data:
        raise HTTPException(status_code=404, detail="No drugs in reference database")

    drug_list = "\n".join(
        f"- {d['generic_name']} ({d['drug_class']}): {', '.join(d['indications'][:5])}"
        for d in resp.data
    )

    provider = get_gemini_provider()
    prompt = (
        f"From this drug list, identify the top 5 most relevant medicines for "
        f"the condition: \"{condition}\"\n\n"
        f"Drug list:\n{drug_list}\n\n"
        f"Return ONLY a JSON array of objects with fields: "
        f"\"generic_name\" (exact match from list) and \"relevance\" "
        f"(one sentence explaining why this drug is used for this condition).\n"
        f"Example: [{{\"generic_name\": \"Paracetamol\", \"relevance\": \"First-line for fever and mild pain\"}}]"
    )

    try:
        ai_response = await provider.generate(
            system_prompt="You are a pharmacology reference assistant. Return only valid JSON.",
            user_message=prompt,
            temperature=0.1,
            max_tokens=1024,
        )

        import json
        import re
        json_match = re.search(r"\[.*\]", ai_response, re.DOTALL)
        if not json_match:
            raise ValueError("No JSON array in response")

        matches = json.loads(json_match.group())
        drug_map = {d["generic_name"]: d for d in resp.data}

        suggestions = []
        for m in matches[:5]:
            name = m.get("generic_name", "")
            drug_data = drug_map.get(name)
            if drug_data:
                suggestions.append(DrugSuggestion(
                    drug=drug_data,
                    relevance=m.get("relevance", "Relevant for this condition"),
                ))

    except Exception:
        suggestions = []
        for d in resp.data:
            ind_text = " ".join(d["indications"]).lower()
            if condition.lower() in ind_text:
                suggestions.append(DrugSuggestion(
                    drug=d,
                    relevance=f"Listed for: {', '.join(d['indications'][:3])}",
                ))
                if len(suggestions) >= 5:
                    break

    return ConditionMedicines(condition=condition, suggestions=suggestions)


@router.get("/{drug_id}", response_model=DrugReferenceItem)
async def get_drug(drug_id: str, user=Depends(get_current_user)):
    """Get detailed info for a single drug."""
    resp = (
        supabase.table("drug_reference")
        .select(
            "id, generic_name, brand_names, drug_class, indications, "
            "adult_dosage, pediatric_dosage, frequency, duration_typical, "
            "route, contraindications, side_effects, interactions, "
            "pregnancy_category, otc, source"
        )
        .eq("id", drug_id)
        .execute()
    )

    if not resp.data:
        raise HTTPException(status_code=404, detail="Drug not found")

    return resp.data[0]
