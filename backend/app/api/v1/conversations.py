"""Conversation and Message API endpoints.

Conversations are scoped to the authenticated Supabase user.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import supabase
from app.middleware.auth import get_current_user
from app.middleware.family_scope import resolve_patient_id

from app.schemas.conversations import (
    ConversationCreate,
    ConversationDetailResponse,
    ConversationResponse,
    MessageCreate,
    MessageResponse,
)
from app.services import billing_service, conversation_service, patient_service

router = APIRouter()


async def _require_patient(user_id: UUID) -> UUID:
    """Return patient_id for user, auto-creating a profile if needed."""
    patient = await patient_service.get_patient_by_user_id(user_id)
    if patient is None:
        from app.schemas.patients import PatientCreate
        patient = await patient_service.create_patient(
            user_id, PatientCreate()
        )
    return patient.id


# ─── CONVERSATIONS ────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start a new conversation",
)
async def start_conversation(
    body: ConversationCreate,
    member: str | None = Query(None),
    user=Depends(get_current_user),
) -> ConversationResponse:
    """Create a new health-assessment conversation for the current user or a family member."""
    user_id = UUID(str(user.id))
    limit_check = billing_service.check_limit(str(user.id), "assessments")
    if not limit_check["allowed"]:
        raise HTTPException(
            status_code=402,
            detail=f"Free limit reached ({limit_check['limit']} assessments/month). Upgrade to Pro for unlimited access.",
        )
    patient_id = await resolve_patient_id(family_member_id=member, user=user)
    result = await conversation_service.create_conversation(user_id, patient_id, body)
    if member:
        supabase.table("conversations").update(
            {"family_member_id": member}
        ).eq("id", str(result.id)).execute()
    billing_service.increment_usage(str(user.id), "assessments")
    return result


@router.get(
    "",
    response_model=list[ConversationResponse],
    summary="List conversations",
)
async def list_my_conversations(
    limit: int = 100,
    offset: int = 0,
    member: str | None = Query(None),
    user=Depends(get_current_user),
) -> list[ConversationResponse]:
    """Return the current user's conversations, optionally filtered by family member."""
    return await conversation_service.list_conversations(
        UUID(str(user.id)), limit, offset, family_member_id=member
    )


@router.get(
    "/{conversation_id}",
    response_model=ConversationDetailResponse,
    summary="Get conversation with messages",
)
async def get_conversation(
    conversation_id: UUID, user=Depends(get_current_user)
) -> ConversationDetailResponse:
    """Return a single conversation including its full message history."""
    return await conversation_service.get_conversation_by_id(
        conversation_id, UUID(str(user.id))
    )


# ─── MESSAGES ─────────────────────────────────────────────────────────────────

@router.post(
    "/{conversation_id}/messages",
    response_model=list[MessageResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Send a message and get AI response",
)
async def send_message(
    conversation_id: UUID,
    body: MessageCreate,
    user=Depends(get_current_user),
) -> list[MessageResponse]:
    """Append a user message to an existing conversation.

    Returns a list containing two messages:
      - [0] the saved user message
      - [1] the AI interviewer's response

    The AI will ask ONE focused follow-up question based on the
    conversation context and what information is still needed.
    """
    user_msg, assistant_msg = await conversation_service.add_message(
        conversation_id, UUID(str(user.id)), body
    )
    return [user_msg, assistant_msg]


@router.post(
    "/{conversation_id}/close",
    response_model=ConversationResponse,
    summary="Close/end an assessment",
)
async def close_conversation(
    conversation_id: UUID, user=Depends(get_current_user)
) -> ConversationResponse:
    """Mark a conversation as completed."""
    user_id = UUID(str(user.id))
    await conversation_service.get_conversation_by_id(conversation_id, user_id)
    from datetime import datetime, timezone
    from postgrest import APIError
    try:
        resp = supabase.table("conversations").update(
            {"status": "completed", "ended_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", str(conversation_id)).eq("user_id", str(user_id)).execute()
    except APIError as exc:
        raise HTTPException(status_code=503, detail=f"Database error: {exc.message}") from exc
    if not resp.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Schedule follow-up notifications
    from app.services import notification_service
    convo_data = resp.data[0]
    try:
        await notification_service.schedule_follow_ups(
            user_id, conversation_id, convo_data.get("chief_complaint"),
        )
    except Exception:
        pass

    return ConversationResponse(**convo_data)


@router.get(
    "/{conversation_id}/messages",
    response_model=list[MessageResponse],
    summary="List messages in a conversation",
)
async def list_messages(
    conversation_id: UUID, user=Depends(get_current_user)
) -> list[MessageResponse]:
    """Return all messages in a conversation, in chronological order."""
    # Verify ownership first
    await conversation_service.get_conversation_by_id(conversation_id, UUID(str(user.id)))
    return await conversation_service.list_messages(conversation_id)


@router.get(
    "/{conversation_id}/trust-cards",
    summary="Generate medicine trust cards for an assessment",
)
async def get_trust_cards(
    conversation_id: UUID, user=Depends(get_current_user)
):
    """Generate trust cards for the assessment in this conversation.

    Parses the last assistant assessment message, looks up each prescribed
    medicine in the drug reference database, runs safety checks against
    the patient's profile, and returns structured trust card data.
    """
    user_id = UUID(str(user.id))
    convo = await conversation_service.get_conversation_by_id(conversation_id, user_id)

    assessment_msg = None
    for m in reversed(convo.messages):
        meta = m.metadata or {}
        if m.role == "assistant" and (meta.get("has_assessment") or "| Medicine |" in m.content):
            assessment_msg = m
            break

    if not assessment_msg:
        return {"trust_cards": []}

    from app.services.patient_state import PatientState
    convo_meta = convo.metadata or {}
    patient_state = PatientState(**(convo_meta.get("patient_state") or {}))

    from app.services.medicine_trust_service import generate_trust_cards
    try:
        cards = await generate_trust_cards(assessment_msg.content, patient_state)
    except Exception:
        cards = []
    return {"trust_cards": cards}
