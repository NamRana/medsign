"""Symptom Extractor Agent.

Uses the lite Gemini model to quickly extract structured medical information
from a patient's free-text message and merge it into the PatientState.
"""

from __future__ import annotations

import logging

from app.ai.gemini import get_ai_provider
from app.schemas.ai_responses import ExtractionResult
from app.services.patient_state import CollectedSymptom, PatientState

logger = logging.getLogger(__name__)

_EXTRACTOR_SYSTEM_PROMPT = """You are a medical information extractor. Given a patient's message, extract all medical information and return it as structured JSON.

Extract:
- symptoms (name, severity 1-10, duration_days, body_location, onset_type, description)
- chief_complaint (primary concern if this appears to be an opening message)
- age and gender if mentioned
- chronic_conditions (diabetes, hypertension, asthma, etc.)
- current_medications
- allergies
- red_flags (any emergency symptoms like chest pain, difficulty breathing, etc.)

Be conservative — only extract what is clearly stated. Do not infer or assume.
If nothing relevant is mentioned for a field, leave it empty/null.
"""


async def extract_from_message(
    message: str,
    patient_state: PatientState,
) -> PatientState:
    """Extract medical information from a user message and update PatientState.

    Args:
        message: The raw user message text.
        patient_state: The current PatientState to update in-place.

    Returns:
        The updated PatientState (same object, mutated).
    """
    from app.config import settings

    if not settings.gemini_api_key or settings.gemini_api_key.lower() in ("test", ""):
        logger.warning("GEMINI_API_KEY not configured — skipping extraction")
        return patient_state

    provider = get_ai_provider()

    try:
        result: ExtractionResult = await provider.generate_structured(
            system_prompt=_EXTRACTOR_SYSTEM_PROMPT,
            user_message=message,
            response_schema=ExtractionResult,
            temperature=0.1,
            max_tokens=1024,
            use_lite_model=True,  # use lite model for cheap extraction
        )
    except Exception as exc:
        logger.warning("Extraction failed (non-fatal): %s", exc)
        return patient_state

    # Merge extracted data into patient_state
    if result.chief_complaint and not patient_state.chief_complaint:
        patient_state.chief_complaint = result.chief_complaint

    if result.age and not patient_state.age:
        patient_state.age = result.age

    if result.gender and not patient_state.gender:
        patient_state.gender = result.gender

    for symptom_data in result.symptoms:
        collected = CollectedSymptom(
            name=symptom_data.name,
            severity=symptom_data.severity,
            duration_days=symptom_data.duration_days,
            body_location=symptom_data.body_location,
            onset_type=symptom_data.onset_type,
            description=symptom_data.description,
        )
        patient_state.add_symptom(collected)

    for condition in result.chronic_conditions:
        if condition not in patient_state.chronic_conditions:
            patient_state.chronic_conditions.append(condition)

    for med in result.current_medications:
        if med not in patient_state.current_medications:
            patient_state.current_medications.append(med)

    for allergy in result.allergies:
        if allergy not in patient_state.allergies:
            patient_state.allergies.append(allergy)

    for flag in result.red_flags:
        if flag not in patient_state.red_flags:
            patient_state.red_flags.append(flag)

    # Bump risk level if red flags found
    if result.red_flags and patient_state.risk_level not in ("critical",):
        patient_state.risk_level = "high"

    return patient_state
