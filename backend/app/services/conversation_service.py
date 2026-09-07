"""Conversation and Message CRUD using the Supabase Python client.

Phase 3: add_message now orchestrates the full AI interview loop:
  1. Save the user message
  2. Extract symptoms (lite model)
  3. Update patient_state in conversation metadata
  4. Get next question from the interviewer agent (flash model)
  5. Save the assistant message
  6. Return both messages to the caller
"""

from __future__ import annotations

import logging
import re
from uuid import UUID

from fastapi import HTTPException, status
from postgrest import APIError

from app.dependencies import supabase
from app.schemas.conversations import (
    ConversationCreate,
    ConversationDetailResponse,
    ConversationResponse,
    MessageCreate,
    MessageResponse,
)
from app.services import patient_service
from app.services.patient_state import PatientState

logger = logging.getLogger(__name__)

CONV_TABLE = "conversations"
MSG_TABLE = "messages"


def _urgency_level(urgency: str) -> int:
    """Return numeric level for urgency comparison."""
    return {"SELF_CARE": 0, "ROUTINE": 1, "URGENT": 2, "EMERGENCY": 3}.get(urgency, 0)


# ─── CONVERSATIONS ────────────────────────────────────────────────────────────

async def get_conversation_by_id(
    conversation_id: UUID,
    user_id: UUID,
) -> ConversationDetailResponse:
    """Fetch a conversation with all its messages.  Raises 404 if not found."""
    try:
        conv_resp = (
            supabase.table(CONV_TABLE)
            .select("*")
            .eq("id", str(conversation_id))
            .eq("user_id", str(user_id))
            .maybe_single()
            .execute()
        )
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {exc.message}",
        ) from exc

    if conv_resp.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    messages = await list_messages(conversation_id)
    return ConversationDetailResponse(**conv_resp.data, messages=messages)


async def list_conversations(
    user_id: UUID,
    limit: int = 100,
    offset: int = 0,
    family_member_id: str | None = None,
) -> list[ConversationResponse]:
    """Return conversations for a user, most recent first. Optionally filter by family member."""
    try:
        query = (
            supabase.table(CONV_TABLE)
            .select("*")
            .eq("user_id", str(user_id))
        )
        if family_member_id:
            query = query.eq("family_member_id", family_member_id)
        else:
            query = query.is_("family_member_id", "null")
        response = (
            query
            .order("started_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {exc.message}",
        ) from exc

    return [ConversationResponse(**row) for row in (response.data or [])]


async def create_conversation(
    user_id: UUID,
    patient_id: UUID,
    data: ConversationCreate,
) -> ConversationResponse:
    """Start a new conversation for the given patient."""
    payload = {
        "user_id": str(user_id),
        "patient_id": str(patient_id),
        **data.model_dump(exclude_none=True),
    }
    try:
        response = supabase.table(CONV_TABLE).insert(payload).execute()
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {exc.message}",
        ) from exc

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create conversation",
        )
    return ConversationResponse(**response.data[0])


# ─── MESSAGES ─────────────────────────────────────────────────────────────────

async def list_messages(conversation_id: UUID) -> list[MessageResponse]:
    """Return all messages in a conversation, chronological order."""
    try:
        response = (
            supabase.table(MSG_TABLE)
            .select("*")
            .eq("conversation_id", str(conversation_id))
            .order("created_at", desc=False)
            .execute()
        )
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {exc.message}",
        ) from exc

    return [MessageResponse(**row) for row in (response.data or [])]


def _build_medical_history(past_conversations: list[dict]) -> list[dict]:
    """Extract structured medical history from past completed conversations."""
    history: list[dict] = []
    for conv in past_conversations:
        entry: dict = {
            "date": (conv.get("created_at") or "")[:10],
            "complaint": conv.get("chief_complaint", "Unknown"),
            "risk_level": conv.get("risk_level"),
        }
        metadata = conv.get("metadata") or {}
        ps = metadata.get("patient_state")
        if ps:
            symptoms = ps.get("symptoms", [])
            if symptoms:
                entry["symptoms"] = [s.get("name", "") for s in symptoms if s.get("name")]
            if ps.get("red_flags"):
                entry["red_flags"] = ps["red_flags"]
            if ps.get("chronic_conditions"):
                entry["chronic_conditions_mentioned"] = ps["chronic_conditions"]
            if ps.get("current_medications"):
                entry["medications_at_time"] = ps["current_medications"]
        history.append(entry)
    return history


def _load_patient_state(conv_data: dict) -> PatientState:
    """Reconstruct PatientState from conversation metadata, or return a fresh one."""
    metadata = conv_data.get("metadata") or {}
    state_data = metadata.get("patient_state")
    if state_data:
        try:
            return PatientState.model_validate(state_data)
        except Exception as exc:
            logger.warning("Could not parse patient_state from metadata: %s", exc)
    return PatientState(
        conversation_id=conv_data.get("id"),
        patient_id=conv_data.get("patient_id"),
        user_id=conv_data.get("user_id"),
    )


def _persist_patient_state(
    conversation_id: UUID,
    patient_state: PatientState,
    current_metadata: dict,
) -> None:
    """Write updated patient_state back to the conversation's metadata column."""
    updated_metadata = {
        **current_metadata,
        "patient_state": patient_state.model_dump(mode="json"),
    }
    try:
        supabase.table(CONV_TABLE).update(
            {"metadata": updated_metadata}
        ).eq("id", str(conversation_id)).execute()
    except APIError as exc:
        # Non-fatal: log and continue — don't blow up the response
        logger.error("Failed to persist patient_state: %s", exc)


async def add_message(
    conversation_id: UUID,
    user_id: UUID,
    data: MessageCreate,
) -> tuple[MessageResponse, MessageResponse]:
    """Append a user message, run the AI interviewer, and return both messages.

    Orchestration steps:
      1. Verify conversation ownership
      2. Save the user message
      3. Extract symptoms from the message (lite model)
      4. Persist updated patient_state to conversation metadata
      5. Get the next interview question (flash model)
      6. Save the assistant message
      7. Return (user_message, assistant_message)

    Returns:
        A tuple of (user_message, assistant_message).
    """
    # ── 1. Ownership + status check ───────────────────────────────────────────
    try:
        conv_resp = (
            supabase.table(CONV_TABLE)
            .select("*")
            .eq("id", str(conversation_id))
            .eq("user_id", str(user_id))
            .maybe_single()
            .execute()
        )
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {exc.message}",
        ) from exc

    if conv_resp.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    conv_data = conv_resp.data
    if conv_data.get("status") == "archived":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add messages to an archived conversation",
        )

    # ── 2. Save user message ──────────────────────────────────────────────────
    user_payload = {
        "conversation_id": str(conversation_id),
        **data.model_dump(exclude_none=True),
        "role": "user",
    }
    try:
        user_insert = supabase.table(MSG_TABLE).insert(user_payload).execute()
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {exc.message}",
        ) from exc

    if not user_insert.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save message",
        )
    user_message = MessageResponse(**user_insert.data[0])

    # ── 3. Extract symptoms and update patient state ──────────────────────────
    patient_state = _load_patient_state(conv_data)

    # Set language from message metadata
    msg_lang = (data.metadata or {}).get("language")
    if msg_lang in ("en", "hi"):
        patient_state.language = msg_lang

    # Enrich with profile data (age, gender, allergies, medications, etc.)
    try:
        patient_profile = await patient_service.get_patient_by_user_id(user_id)
        if patient_profile:
            patient_state.enrich_from_profile(
                date_of_birth=patient_profile.date_of_birth,
                gender=patient_profile.gender,
                allergies=patient_profile.allergies,
                chronic_conditions=patient_profile.chronic_conditions,
                current_medications=patient_profile.current_medications,
                location_city=patient_profile.location_city,
                location_state=patient_profile.location_state,
                location_country=patient_profile.location_country,
            )
    except Exception as exc:
        logger.warning("Profile enrichment failed (non-fatal): %s", exc)

    try:
        from app.agents.extractor import extract_from_message
        patient_state = await extract_from_message(data.content, patient_state)
    except Exception as exc:
        logger.warning("Symptom extraction failed (non-fatal): %s", exc)

    # ── 3b. Run deterministic safety engine ──────────────────────────────────
    from app.safety.engine import get_safety_engine
    from app.safety.triage import get_triage_engine
    from app.safety.logger import log_safety_event

    safety_engine = get_safety_engine()
    safety_result = safety_engine.evaluate(patient_state)

    # Also evaluate latest user message directly for keyword triggers
    from app.safety.engine import SafetyResult
    msg_state = PatientState(chief_complaint=data.content)
    msg_safety = safety_engine.evaluate(msg_state)
    # Merge: take the higher urgency
    if (
        msg_safety.triggered_rules
        and _urgency_level(msg_safety.urgency) > _urgency_level(safety_result.urgency)
    ):
        safety_result = msg_safety

    # Log safety events to DB
    if safety_result.triggered_rules:
        log_safety_event(conversation_id, safety_result)
        # Update patient state risk level
        if safety_result.is_emergency:
            patient_state.risk_level = "critical"
        elif safety_result.is_urgent and patient_state.risk_level != "critical":
            patient_state.risk_level = "high"

    # Compute triage
    triage_engine = get_triage_engine()
    triage_result = triage_engine.classify(patient_state, safety_result)

    # ── 4. Persist patient state ──────────────────────────────────────────────
    current_metadata = conv_data.get("metadata") or {}
    _persist_patient_state(conversation_id, patient_state, current_metadata)

    # ── 4b. Auto-name and sync risk level to conversation row ──────────────
    conv_updates: dict = {}
    if patient_state.chief_complaint and not conv_data.get("chief_complaint"):
        conv_updates["chief_complaint"] = patient_state.chief_complaint
    triage_to_risk = {"SELF_CARE": "low", "ROUTINE": "medium", "URGENT": "high", "EMERGENCY": "critical"}
    mapped_risk = triage_to_risk.get(triage_result.level.value)
    if mapped_risk:
        current_risk = conv_data.get("risk_level")
        risk_order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
        if not current_risk or risk_order.get(mapped_risk, 0) > risk_order.get(current_risk, 0):
            conv_updates["risk_level"] = mapped_risk
    if conv_updates:
        try:
            supabase.table(CONV_TABLE).update(conv_updates).eq(
                "id", str(conversation_id)
            ).execute()
        except APIError:
            pass

    # ── 5. Fetch conversation history for the interviewer ─────────────────────
    prior_messages = await list_messages(conversation_id)
    # Build history list (all messages BEFORE the one we just saved)
    conversation_history: list[dict[str, str]] = []
    for msg in prior_messages:
        if str(msg.id) == str(user_message.id):
            # Don't include the message we just saved — it's the latest_user_message
            continue
        role = "assistant" if msg.role == "assistant" else "user"
        conversation_history.append({"role": role, "content": msg.content})

    # ── 6. Get next question from interviewer ─────────────────────────────────
    assistant_content: str
    assistant_metadata: dict = {}

    # Count user exchanges so far
    user_exchange_count = sum(
        1 for m in conversation_history if m.get("role") == "user"
    ) + 1  # +1 for the current message

    # Detect explicit assessment/medicine requests
    _lower_msg = data.content.lower()
    explicit_assess_request = any(
        phrase in _lower_msg
        for phrase in [
            "suggest medicine", "suggest me medicine", "give medicine",
            "recommend medicine", "give assessment", "please assess",
            "what medicine", "kya dawai", "dawai do", "medicine do",
            "treatment suggest", "suggest treatment",
        ]
    )

    # Smart assessment trigger — assess based on info completeness, not just count
    has_complaint = bool(patient_state.chief_complaint)
    has_duration = any(s.duration_days is not None for s in patient_state.symptoms)
    has_severity = any(s.severity is not None for s in patient_state.symptoms)
    has_profile = patient_state.age is not None or patient_state.gender is not None
    info_score = sum([has_complaint, has_duration, has_severity, has_profile])

    medicine_system_set = patient_state.medicine_system is not None
    force_assess = has_complaint and medicine_system_set and (
        user_exchange_count >= 4
        or explicit_assess_request
        or (info_score >= 3 and user_exchange_count >= 2)
    )

    # If safety engine detected an emergency, the safety message takes priority
    if safety_result.is_emergency and safety_result.emergency_message:
        assistant_content = safety_result.emergency_message
        assistant_metadata = {
            "question_type": "emergency_check",
            "priority": 10,
            "should_assess": False,
            "is_emergency": True,
            "safety_triggered": True,
            "triggered_rules": [r.rule_id for r in safety_result.triggered_rules],
            "triage_level": triage_result.level.value,
        }
        # Mark conversation as needing immediate attention
        try:
            supabase.table(CONV_TABLE).update(
                {"risk_level": "critical"}
            ).eq("id", str(conversation_id)).execute()
        except APIError:
            pass

    else:
        # Fetch past conversations with full patient state for medical history
        past_conversations: list[dict] = []
        try:
            past_resp = (
                supabase.table(CONV_TABLE)
                .select("chief_complaint, risk_level, status, metadata, created_at")
                .eq("user_id", str(user_id))
                .neq("id", str(conversation_id))
                .eq("status", "completed")
                .not_.is_("chief_complaint", "null")
                .order("created_at", desc=True)
                .limit(5)
                .execute()
            )
            past_conversations = past_resp.data or []
        except Exception as exc:
            logger.debug("Could not fetch past conversations: %s", exc)

        medical_history = _build_medical_history(past_conversations)

        # Normal flow: get next question from AI interviewer
        try:
            from app.agents.interviewer import get_next_question
            interviewer_response = await get_next_question(
                patient_state=patient_state,
                conversation_history=conversation_history,
                latest_user_message=data.content,
                medical_history=medical_history,
            )

            assistant_content = interviewer_response.next_question

            # Pick up medicine_system from interviewer extracted_info
            med_sys = interviewer_response.extracted_info.get("medicine_system")
            if med_sys in ("allopathy", "homeopathy"):
                patient_state.medicine_system = med_sys
                _persist_patient_state(conversation_id, patient_state, current_metadata)

            # AI detected emergency — validate against safety engine
            if interviewer_response.is_emergency and interviewer_response.emergency_message:
                assistant_content = interviewer_response.emergency_message

            # Prepend urgent safety message if applicable (non-emergency)
            if (
                safety_result.is_urgent
                and not safety_result.is_emergency
                and safety_result.urgent_message
            ):
                assistant_content = (
                    f"**Important:** {safety_result.urgent_message}\n\n"
                    f"{interviewer_response.next_question}"
                )

            assistant_metadata = {
                "question_type": interviewer_response.question_type,
                "priority": interviewer_response.priority,
                "should_assess": interviewer_response.should_assess,
                "is_emergency": interviewer_response.is_emergency or safety_result.is_emergency,
                "extracted_symptoms": interviewer_response.extracted_symptoms,
                "triage_level": triage_result.level.value,
            }
            if safety_result.triggered_rules:
                assistant_metadata["safety_triggered"] = True
                assistant_metadata["triggered_rules"] = [
                    r.rule_id for r in safety_result.triggered_rules
                ]

            # Record question in patient state and re-persist
            if assistant_content not in patient_state.questions_asked:
                patient_state.questions_asked.append(assistant_content)
                _persist_patient_state(conversation_id, patient_state, current_metadata)

            # If should_assess → generate RAG-powered assessment with medicine recommendations
            # Block assessment if medicine_system preference hasn't been collected yet
            if (interviewer_response.should_assess or force_assess) and patient_state.medicine_system is not None:
                try:
                    from app.rag.assessor import generate_assessment
                    assessment_text = await generate_assessment(
                        patient_state=patient_state,
                        latest_message=data.content,
                        conversation_history=conversation_history,
                        medical_history=medical_history,
                    )

                    has_prescription = bool(
                        re.search(r"^\|.*medicine.*\|", assessment_text, re.IGNORECASE | re.MULTILINE)
                    )

                    if has_prescription:
                        assistant_content = assessment_text
                        assistant_metadata["has_assessment"] = True

                        try:
                            from app.services.medicine_trust_service import generate_trust_cards
                            trust_cards = await generate_trust_cards(assessment_text, patient_state)
                            if trust_cards:
                                assistant_metadata["trust_cards"] = trust_cards
                        except Exception as trust_exc:
                            logger.warning("Trust card generation failed: %s", trust_exc)

                        try:
                            supabase.table(CONV_TABLE).update(
                                {"status": "completed"}
                            ).eq("id", str(conversation_id)).execute()
                        except APIError:
                            pass  # non-fatal
                    else:
                        logger.warning("Assessment generated without prescription — keeping interview open")

                except Exception as assess_exc:
                    logger.error("RAG assessment failed: %s", assess_exc)

        except Exception as exc:
            logger.error("Interviewer failed: %s", exc)
            if force_assess:
                try:
                    from app.rag.assessor import generate_assessment
                    assessment_text = await generate_assessment(
                        patient_state=patient_state,
                        latest_message=data.content,
                        conversation_history=conversation_history,
                        medical_history=medical_history,
                    )

                    has_prescription = bool(
                        re.search(r"^\|.*medicine.*\|", assessment_text, re.IGNORECASE | re.MULTILINE)
                    )

                    if has_prescription:
                        assistant_content = assessment_text
                        assistant_metadata = {"has_assessment": True}

                        try:
                            from app.services.medicine_trust_service import generate_trust_cards
                            trust_cards = await generate_trust_cards(assessment_text, patient_state)
                            if trust_cards:
                                assistant_metadata["trust_cards"] = trust_cards
                        except Exception as trust_exc:
                            logger.warning("Trust card generation failed (fallback): %s", trust_exc)

                        try:
                            supabase.table(CONV_TABLE).update(
                                {"status": "completed"}
                            ).eq("id", str(conversation_id)).execute()
                        except APIError:
                            pass
                    else:
                        logger.warning("Fallback assessment without prescription — keeping interview open")
                        assistant_content = (
                            "I need a bit more information before I can recommend anything. "
                            "Could you please describe your main symptom in more detail?"
                        )
                except Exception as assess_exc:
                    logger.error("Fallback RAG assessment also failed: %s", assess_exc)
                    assistant_content = (
                        "I'm having trouble processing your message right now. "
                        "Could you please describe your main symptom in a bit more detail?"
                    )
            else:
                assistant_content = (
                    "I'm having trouble processing your message right now. "
                    "Could you please describe your main symptom in a bit more detail?"
                )

    # ── 7. Save assistant message ─────────────────────────────────────────────
    assistant_payload = {
        "conversation_id": str(conversation_id),
        "role": "assistant",
        "content": assistant_content,
        "content_type": "text",
        "metadata": assistant_metadata,
    }
    try:
        assistant_insert = supabase.table(MSG_TABLE).insert(assistant_payload).execute()
    except APIError as exc:
        logger.error("Failed to save assistant message: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save assistant response",
        ) from exc

    if not assistant_insert.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save assistant response",
        )
    assistant_message = MessageResponse(**assistant_insert.data[0])

    return user_message, assistant_message
