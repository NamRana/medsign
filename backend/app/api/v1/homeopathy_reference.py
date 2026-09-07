"""Homeopathy Reference API — browse and search homeopathy remedies from Boericke's Materia Medica."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.dependencies import supabase
from app.middleware.auth import get_current_user

router = APIRouter()


class HomeopathyRemedyItem(BaseModel):
    id: str
    generic_name: str
    abbreviation: str | None = None
    common_name: str | None = None
    description: str | None = None
    indications: list[str] = []
    adult_dosage: str | None = None
    frequency: str = "As directed by practitioner"
    duration_typical: str | None = None
    route: str = "oral (sublingual)"
    organ_system_symptoms: dict = {}
    modalities: dict | None = None
    relationships: str | None = None
    otc: bool = True
    source: str = "Boericke's Materia Medica"


class HomeopathySearchResult(BaseModel):
    remedies: list[HomeopathyRemedyItem]
    total: int


@router.get("", response_model=HomeopathySearchResult)
async def list_remedies(
    q: str | None = Query(None, description="Search by name, abbreviation, or indication"),
    indication: str | None = Query(None, description="Filter by indication/organ system"),
    limit: int = Query(20, le=100),
    offset: int = 0,
    user=Depends(get_current_user),
):
    """Browse and search the homeopathy reference database."""
    query = supabase.table("homeopathy_reference").select(
        "id, generic_name, abbreviation, common_name, description, "
        "indications, adult_dosage, frequency, duration_typical, route, "
        "organ_system_symptoms, modalities, relationships, otc, source",
        count="exact",
    )

    if q:
        query = query.or_(
            f"generic_name.ilike.%{q}%,"
            f"abbreviation.ilike.%{q}%,"
            f"common_name.ilike.%{q}%"
        )

    if indication:
        query = query.contains("indications", f'["{indication}"]')

    resp = query.order("generic_name").range(offset, offset + limit - 1).execute()

    return HomeopathySearchResult(
        remedies=resp.data, total=resp.count or len(resp.data)
    )


@router.get("/indications", response_model=list[str])
async def list_indications(user=Depends(get_current_user)):
    """Get all unique indications for filtering."""
    resp = supabase.table("homeopathy_reference").select("indications").execute()
    all_indications: set[str] = set()
    for row in resp.data:
        for ind in row.get("indications") or []:
            all_indications.add(ind)
    return sorted(all_indications)


@router.get("/suggest")
async def suggest_for_symptoms(
    symptoms: str = Query(..., description="Symptoms to match remedies for"),
    user=Depends(get_current_user),
) -> dict:
    """Suggest homeopathy remedies for given symptoms using AI matching."""
    from app.ai.gemini import get_ai_provider

    resp = supabase.table("homeopathy_reference").select(
        "id, generic_name, abbreviation, common_name, indications, "
        "adult_dosage, description, organ_system_symptoms, source"
    ).execute()

    if not resp.data:
        raise HTTPException(status_code=404, detail="No remedies in reference database")

    remedy_list = "\n".join(
        f"- {r['generic_name']} ({r.get('abbreviation', '')}): "
        f"{', '.join(r['indications'][:5])}. {(r.get('description') or '')[:150]}"
        for r in resp.data[:200]
    )

    provider = get_ai_provider()
    prompt = (
        f"From this homeopathy remedy list, identify the top 5 most relevant "
        f"remedies for the symptoms: \"{symptoms}\"\n\n"
        f"Remedy list:\n{remedy_list}\n\n"
        f"Return ONLY a JSON array of objects with fields: "
        f"\"generic_name\" (exact match from list) and \"relevance\" "
        f"(one sentence explaining why this remedy matches these symptoms).\n"
        f"Example: [{{\"generic_name\": \"Arnica Montana\", "
        f"\"relevance\": \"Primary remedy for trauma, bruising, and soreness\"}}]"
    )

    try:
        ai_response = await provider.generate(
            system_prompt="You are a homeopathy reference assistant. Return only valid JSON.",
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
        remedy_map = {r["generic_name"]: r for r in resp.data}

        suggestions = []
        for m in matches[:5]:
            name = m.get("generic_name", "")
            remedy_data = remedy_map.get(name)
            if remedy_data:
                suggestions.append({
                    "remedy": HomeopathyRemedyItem(**remedy_data),
                    "relevance": m.get("relevance", "Relevant for these symptoms"),
                })

    except Exception:
        suggestions = []
        symptoms_lower = symptoms.lower()
        for r in resp.data:
            desc = (r.get("description") or "").lower()
            ind_text = " ".join(r.get("indications", [])).lower()
            if symptoms_lower in desc or symptoms_lower in ind_text:
                suggestions.append({
                    "remedy": HomeopathyRemedyItem(**r),
                    "relevance": f"Matches: {', '.join(r['indications'][:3])}",
                })
                if len(suggestions) >= 5:
                    break

    return {
        "symptoms": symptoms,
        "suggestions": suggestions,
        "disclaimer": (
            "This information is from Boericke's Materia Medica and is for "
            "educational purposes only. Always consult a qualified homeopathic "
            "practitioner before taking any remedy."
        ),
    }


@router.get("/{remedy_id}", response_model=HomeopathyRemedyItem)
async def get_remedy(remedy_id: str, user=Depends(get_current_user)):
    """Get detailed info for a single homeopathy remedy."""
    resp = (
        supabase.table("homeopathy_reference")
        .select(
            "id, generic_name, abbreviation, common_name, description, "
            "indications, adult_dosage, frequency, duration_typical, route, "
            "organ_system_symptoms, modalities, relationships, otc, source"
        )
        .eq("id", remedy_id)
        .execute()
    )

    if not resp.data:
        raise HTTPException(status_code=404, detail="Remedy not found")

    return resp.data[0]
