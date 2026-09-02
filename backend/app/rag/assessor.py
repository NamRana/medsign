"""RAG-powered assessment engine.

Uses retrieved medical knowledge to generate grounded assessments
with specific medicine recommendations.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from app.ai.gemini import get_ai_provider
from app.rag.retrieval import RetrievalResult, format_knowledge_for_prompt, retrieve_for_patient
from app.services.patient_state import PatientState

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "assessor_v1.txt"
_PROMPT_TEMPLATE: str | None = None


def _load_prompt() -> str:
    global _PROMPT_TEMPLATE
    if _PROMPT_TEMPLATE is None:
        _PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")
    return _PROMPT_TEMPLATE


async def generate_assessment(
    patient_state: PatientState,
    latest_message: str,
    conversation_history: list[dict[str, str]],
) -> str:
    """Generate a RAG-grounded clinical assessment.

    1. Retrieves relevant conditions and drugs from the knowledge base
    2. Formats them into context for the LLM
    3. Generates a structured assessment with specific medicine recommendations

    Returns the assessment as formatted text.
    """
    from app.config import settings

    if not settings.gemini_api_key or settings.gemini_api_key.lower() in ("test", ""):
        return (
            "Assessment not available — AI is not configured. "
            "Please add your GEMINI_API_KEY to the backend .env file."
        )

    # Step 1: Retrieve relevant medical knowledge
    retrieval_result = await retrieve_for_patient(
        patient_state=patient_state,
        latest_message=latest_message,
        condition_count=3,
        drug_count=5,
    )

    # Step 2: Format knowledge for the prompt
    knowledge_text = format_knowledge_for_prompt(retrieval_result)
    if not knowledge_text:
        knowledge_text = (
            "No specific medical knowledge retrieved for this query. "
            "Provide general guidance and strongly recommend consulting a doctor."
        )

    # Step 3: Build the full prompt
    prompt_template = _load_prompt()
    state_summary = json.dumps(patient_state.to_summary_dict(), indent=2, ensure_ascii=False)

    system_prompt = prompt_template.format(
        patient_state_json=state_summary,
        retrieved_knowledge=knowledge_text,
    )

    # Step 4: Generate assessment using the reasoning model
    provider = get_ai_provider()
    try:
        assessment = await provider.generate(
            system_prompt=system_prompt,
            user_message=(
                "Based on all the information gathered and the medical knowledge provided, "
                "generate a complete assessment with specific medicine recommendations."
            ),
            conversation_history=conversation_history,
            temperature=0.3,
            max_tokens=4096,
        )
        return assessment
    except Exception as exc:
        logger.error("Assessment generation failed: %s", exc)
        return (
            "I apologize, but I'm unable to generate an assessment right now. "
            "Please consult a healthcare professional for your symptoms."
        )
