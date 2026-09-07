"""Knowledge retrieval service.

Performs vector similarity search + keyword-based fallback to find
relevant medical conditions and drug information for a given patient query.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from app.dependencies import supabase
from app.rag.embeddings import generate_embedding
from app.services.patient_state import PatientState

logger = logging.getLogger(__name__)


@dataclass
class RetrievedCondition:
    condition_name: str
    icd_code: str | None
    symptoms: list[str]
    first_line_treatment: list[dict]
    second_line_treatment: list[dict]
    contraindications: list[str]
    red_flags: list[str]
    when_to_refer: str | None
    source: str
    similarity: float = 0.0


@dataclass
class RetrievedDrug:
    generic_name: str
    brand_names: list[str]
    drug_class: str
    indications: list[str]
    adult_dosage: str
    frequency: str
    duration_typical: str | None
    contraindications: list[str]
    side_effects: list[str]
    pregnancy_category: str | None
    otc: bool
    source: str
    similarity: float = 0.0


@dataclass
class RetrievedHomeopathyRemedy:
    generic_name: str
    abbreviation: str | None
    common_name: str | None
    description: str | None
    indications: list[str]
    adult_dosage: str | None
    organ_system_symptoms: dict
    modalities: dict | None
    relationships: str | None
    source: str
    similarity: float = 0.0


@dataclass
class RetrievedChunk:
    id: str
    document_id: str
    content: str
    chunk_index: int
    metadata: dict
    similarity: float = 0.0


@dataclass
class RetrievalResult:
    conditions: list[RetrievedCondition] = field(default_factory=list)
    drugs: list[RetrievedDrug] = field(default_factory=list)
    homeopathy_remedies: list[RetrievedHomeopathyRemedy] = field(default_factory=list)
    chunks: list[RetrievedChunk] = field(default_factory=list)
    query_used: str = ""


def _build_query_from_state(patient_state: PatientState, latest_message: str) -> str:
    """Build a semantic search query from patient state and latest message."""
    parts = []

    if patient_state.chief_complaint:
        parts.append(f"Chief complaint: {patient_state.chief_complaint}")

    if patient_state.symptoms:
        symptom_names = [s.name for s in patient_state.symptoms]
        parts.append(f"Symptoms: {', '.join(symptom_names)}")

    if patient_state.symptoms:
        for s in patient_state.symptoms:
            if s.duration_days:
                parts.append(f"Duration: {s.duration_days} days")
                break
        for s in patient_state.symptoms:
            if s.severity is not None:
                parts.append(f"Severity: {s.severity}/10")
                break

    # Always include the latest message for additional context
    parts.append(f"Patient says: {latest_message}")

    return "\n".join(parts)


async def retrieve_conditions(
    query: str,
    top_k: int = 3,
) -> list[RetrievedCondition]:
    """Find the most relevant medical conditions using vector similarity."""
    try:
        query_embedding = await generate_embedding(query)
    except Exception as exc:
        logger.error("Failed to generate query embedding: %s", exc)
        return []

    # Use Supabase RPC for vector similarity search
    try:
        response = supabase.rpc(
            "match_conditions",
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.3,
                "match_count": top_k,
            },
        ).execute()
    except Exception as exc:
        logger.warning("Vector search failed, falling back to keyword search: %s", exc)
        return await _keyword_search_conditions(query, top_k)

    if not response.data:
        return await _keyword_search_conditions(query, top_k)

    results = []
    for row in response.data:
        results.append(
            RetrievedCondition(
                condition_name=row["condition_name"],
                icd_code=row.get("icd_code"),
                symptoms=row.get("symptoms", []),
                first_line_treatment=row.get("first_line_treatment", []),
                second_line_treatment=row.get("second_line_treatment", []),
                contraindications=row.get("contraindications", []),
                red_flags=row.get("red_flags", []),
                when_to_refer=row.get("when_to_refer"),
                source=row.get("source", ""),
                similarity=row.get("similarity", 0.0),
            )
        )
    return results


async def retrieve_drugs(
    query: str,
    top_k: int = 5,
) -> list[RetrievedDrug]:
    """Find the most relevant drugs using vector similarity."""
    try:
        query_embedding = await generate_embedding(query)
    except Exception as exc:
        logger.error("Failed to generate query embedding: %s", exc)
        return []

    try:
        response = supabase.rpc(
            "match_drugs",
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.3,
                "match_count": top_k,
            },
        ).execute()
    except Exception as exc:
        logger.warning("Drug vector search failed: %s", exc)
        return []

    if not response.data:
        return []

    results = []
    for row in response.data:
        results.append(
            RetrievedDrug(
                generic_name=row["generic_name"],
                brand_names=row.get("brand_names", []),
                drug_class=row.get("drug_class", ""),
                indications=row.get("indications", []),
                adult_dosage=row.get("adult_dosage", ""),
                frequency=row.get("frequency", ""),
                duration_typical=row.get("duration_typical"),
                contraindications=row.get("contraindications", []),
                side_effects=row.get("side_effects", []),
                pregnancy_category=row.get("pregnancy_category"),
                otc=row.get("otc", False),
                source=row.get("source", ""),
                similarity=row.get("similarity", 0.0),
            )
        )
    return results


async def retrieve_homeopathy(
    query: str,
    top_k: int = 5,
) -> list[RetrievedHomeopathyRemedy]:
    """Find the most relevant homeopathy remedies using vector similarity."""
    try:
        query_embedding = await generate_embedding(query)
    except Exception as exc:
        logger.error("Failed to generate query embedding for homeopathy: %s", exc)
        return []

    try:
        response = supabase.rpc(
            "match_homeopathy",
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.3,
                "match_count": top_k,
            },
        ).execute()
    except Exception as exc:
        logger.warning("Homeopathy vector search failed: %s", exc)
        return []

    if not response.data:
        return []

    results = []
    for row in response.data:
        results.append(
            RetrievedHomeopathyRemedy(
                generic_name=row["generic_name"],
                abbreviation=row.get("abbreviation"),
                common_name=row.get("common_name"),
                description=row.get("description"),
                indications=row.get("indications", []),
                adult_dosage=row.get("adult_dosage"),
                organ_system_symptoms=row.get("organ_system_symptoms", {}),
                modalities=row.get("modalities"),
                relationships=row.get("relationships"),
                source=row.get("source", ""),
                similarity=row.get("similarity", 0.0),
            )
        )
    return results


async def _keyword_search_conditions(query: str, top_k: int) -> list[RetrievedCondition]:
    """Fallback: search conditions by keyword matching on symptoms."""
    keywords = [w.lower().strip() for w in query.split() if len(w) > 3]
    if not keywords:
        return []

    try:
        # Search all conditions and filter client-side
        response = supabase.table("medical_knowledge").select("*").execute()
        if not response.data:
            return []

        scored = []
        for row in response.data:
            score = 0
            symptoms_text = " ".join(row.get("symptoms", [])).lower()
            condition_text = row.get("condition_name", "").lower()
            for kw in keywords:
                if kw in symptoms_text:
                    score += 2
                if kw in condition_text:
                    score += 3
            if score > 0:
                scored.append((score, row))

        scored.sort(key=lambda x: x[0], reverse=True)
        results = []
        for _, row in scored[:top_k]:
            results.append(
                RetrievedCondition(
                    condition_name=row["condition_name"],
                    icd_code=row.get("icd_code"),
                    symptoms=row.get("symptoms", []),
                    first_line_treatment=row.get("first_line_treatment", []),
                    second_line_treatment=row.get("second_line_treatment", []),
                    contraindications=row.get("contraindications", []),
                    red_flags=row.get("red_flags", []),
                    when_to_refer=row.get("when_to_refer"),
                    source=row.get("source", ""),
                    similarity=0.0,
                )
            )
        return results
    except Exception as exc:
        logger.error("Keyword search failed: %s", exc)
        return []


async def retrieve_chunks(
    query: str,
    top_k: int = 5,
) -> list[RetrievedChunk]:
    """Find the most relevant document chunks using vector similarity."""
    try:
        query_embedding = await generate_embedding(query)
    except Exception as exc:
        logger.error("Failed to generate query embedding for chunks: %s", exc)
        return []

    try:
        response = supabase.rpc(
            "match_chunks",
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.3,
                "match_count": top_k,
            },
        ).execute()
    except Exception as exc:
        logger.warning("Chunk vector search failed: %s", exc)
        return []

    if not response.data:
        return []

    results = []
    for row in response.data:
        results.append(
            RetrievedChunk(
                id=row["id"],
                document_id=row["document_id"],
                content=row["content"],
                chunk_index=row.get("chunk_index", 0),
                metadata=row.get("metadata", {}),
                similarity=row.get("similarity", 0.0),
            )
        )
    return results


async def retrieve_for_patient(
    patient_state: PatientState,
    latest_message: str,
    condition_count: int = 3,
    drug_count: int = 5,
    chunk_count: int = 5,
) -> RetrievalResult:
    """Main retrieval entry point: find relevant conditions, drugs/remedies, and chunks for a patient."""
    query = _build_query_from_state(patient_state, latest_message)

    conditions = await retrieve_conditions(query, top_k=condition_count)
    chunks = await retrieve_chunks(query, top_k=chunk_count)

    drugs: list[RetrievedDrug] = []
    homeopathy_remedies: list[RetrievedHomeopathyRemedy] = []

    if patient_state.medicine_system and patient_state.medicine_system == "homeopathy":
        homeopathy_remedies = await retrieve_homeopathy(query, top_k=drug_count)
    else:
        drugs = await retrieve_drugs(query, top_k=drug_count)

    return RetrievalResult(
        conditions=conditions,
        drugs=drugs,
        homeopathy_remedies=homeopathy_remedies,
        chunks=chunks,
        query_used=query,
    )


def format_knowledge_for_prompt(result: RetrievalResult) -> str:
    """Format retrieved knowledge into a string suitable for the AI prompt."""
    if not result.conditions and not result.drugs and not result.homeopathy_remedies and not result.chunks:
        return ""

    sections = []

    if result.conditions:
        sections.append("## Retrieved Medical Knowledge\n")
        for i, cond in enumerate(result.conditions, 1):
            sections.append(f"### Possible Condition {i}: {cond.condition_name}")
            sections.append(f"- **Matching symptoms**: {', '.join(cond.symptoms)}")

            if cond.first_line_treatment:
                treatments = []
                for t in cond.first_line_treatment:
                    treatments.append(
                        f"  - {t['drug']} {t['dose']} {t['frequency']} "
                        f"for {t.get('duration', 'as needed')} ({t.get('note', '')})"
                    )
                sections.append("- **First-line treatment**:")
                sections.extend(treatments)

            if cond.contraindications:
                sections.append(f"- **Contraindications**: {', '.join(cond.contraindications)}")

            if cond.red_flags:
                sections.append(f"- **Red flags to watch**: {', '.join(cond.red_flags)}")

            if cond.when_to_refer:
                sections.append(f"- **When to refer**: {cond.when_to_refer}")

            sections.append(f"- **Source**: {cond.source}")
            sections.append("")

    if result.drugs:
        sections.append("## Relevant Drug Information\n")
        for drug in result.drugs:
            brands = ", ".join(drug.brand_names) if drug.brand_names else "N/A"
            sections.append(
                f"- **{drug.generic_name}** ({brands}): "
                f"{drug.adult_dosage} {drug.frequency}. "
                f"Class: {drug.drug_class}. "
                f"{'OTC' if drug.otc else 'Prescription required'}."
            )
            if drug.contraindications:
                sections.append(f"  Contraindications: {', '.join(drug.contraindications[:3])}")

    if result.homeopathy_remedies:
        sections.append("## Relevant Homeopathy Remedies\n")
        sections.append("**Treatment system: Homeopathy (Boericke's Materia Medica)**\n")
        for remedy in result.homeopathy_remedies:
            common = f" ({remedy.common_name})" if remedy.common_name else ""
            abbr = f" [{remedy.abbreviation}]" if remedy.abbreviation else ""
            sections.append(f"### {remedy.generic_name}{common}{abbr}")
            if remedy.description:
                sections.append(f"- **Key indications**: {remedy.description[:300]}")
            if remedy.indications:
                sections.append(f"- **Organ systems**: {', '.join(remedy.indications[:6])}")
            if remedy.adult_dosage:
                sections.append(f"- **Potency/Dosage**: {remedy.adult_dosage}")
            if remedy.modalities:
                if remedy.modalities.get("better"):
                    sections.append(f"- **Better from**: {', '.join(remedy.modalities['better'][:4])}")
                if remedy.modalities.get("worse"):
                    sections.append(f"- **Worse from**: {', '.join(remedy.modalities['worse'][:4])}")
            if remedy.relationships:
                sections.append(f"- **Relationships**: {remedy.relationships[:200]}")
            sections.append(f"- **Source**: {remedy.source}")
            sections.append("")

    if result.chunks:
        sections.append("\n## Retrieved Document Excerpts\n")
        for i, chunk in enumerate(result.chunks, 1):
            sections.append(f"### Excerpt {i} (similarity: {chunk.similarity:.2f})")
            sections.append(chunk.content)
            sections.append("")

    return "\n".join(sections)
