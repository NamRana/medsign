"""Adaptive Interviewer Agent.

Takes the current PatientState and conversation history, then returns
an InterviewerResponse with the single best next question to ask.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from app.ai.gemini import get_ai_provider
from app.schemas.ai_responses import InterviewerResponse
from app.services.patient_state import PatientState

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "interviewer_v2.txt"
_PROMPT_TEMPLATE: str | None = None


def _load_prompt() -> str:
    global _PROMPT_TEMPLATE
    if _PROMPT_TEMPLATE is None:
        _PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")
    return _PROMPT_TEMPLATE


_FALLBACK_QUESTION = (
    "I'd like to understand your health concern better. "
    "Could you please describe what's bothering you today?"
)

_AI_NOT_CONFIGURED = (
    "AI is not configured. Please add your GEMINI_API_KEY to the backend .env file."
)


async def get_next_question(
    patient_state: PatientState,
    conversation_history: list[dict[str, str]],
    latest_user_message: str,
    medical_history: list[dict] | None = None,
) -> InterviewerResponse:
    """Return the next interviewer question for this patient.

    Args:
        patient_state: Accumulated state built up over the conversation.
        conversation_history: List of ``{"role": ..., "content": ...}`` dicts
            representing all prior turns (NOT including the latest message).
        latest_user_message: The user's most recent message text.
        medical_history: Structured history from past completed conversations
            (symptoms, complaints, medications, risk levels).

    Returns:
        An ``InterviewerResponse`` with the next question and metadata.
    """
    from app.config import settings

    # Gracefully handle missing API key
    if not settings.gemini_api_key or settings.gemini_api_key.lower() in ("test", ""):
        logger.warning("GEMINI_API_KEY not configured — returning placeholder response")
        return InterviewerResponse(
            next_question=_AI_NOT_CONFIGURED,
            question_type="clarification",
            priority=1,
        )

    provider = get_ai_provider()
    prompt_template = _load_prompt()

    # Build context strings for the prompt
    state_summary = json.dumps(patient_state.to_summary_dict(), indent=2, ensure_ascii=False)
    exchange_count = sum(1 for t in conversation_history if t.get("role") == "user")
    conv_summary = (
        f"Number of patient responses so far: {exchange_count}\n"
        f"Questions already asked: {json.dumps(patient_state.questions_asked, ensure_ascii=False)}"
    )
    if medical_history:
        conv_summary += "\n\nPATIENT MEDICAL HISTORY (from past visits):\n"
        for entry in medical_history:
            line = f"- [{entry.get('date', '?')}] {entry.get('complaint', 'Unknown')} (risk: {entry.get('risk_level', '?')})"
            if entry.get("symptoms"):
                line += f" | Symptoms: {', '.join(entry['symptoms'])}"
            if entry.get("medications_at_time"):
                line += f" | Meds given: {', '.join(entry['medications_at_time'])}"
            if entry.get("red_flags"):
                line += f" | Red flags: {', '.join(entry['red_flags'])}"
            conv_summary += line + "\n"

    system_prompt = prompt_template.format(
        patient_state_json=state_summary,
        conversation_summary=conv_summary,
    )

    try:
        result: InterviewerResponse = await provider.generate_structured(
            system_prompt=system_prompt,
            user_message=latest_user_message,
            response_schema=InterviewerResponse,
            conversation_history=conversation_history,
            temperature=0.4,
            max_tokens=2048,
            use_lite_model=False,  # use Flash for reasoning
        )
        return result
    except Exception as exc:
        logger.error("Interviewer agent failed: %s", exc)
        # Graceful fallback — never crash the conversation
        return InterviewerResponse(
            next_question=_FALLBACK_QUESTION,
            question_type="clarification",
            priority=5,
        )
