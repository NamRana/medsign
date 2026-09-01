"""Conversation and Message API endpoints.

Conversations are scoped to the authenticated Supabase user.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import supabase
from app.middleware.auth import get_current_user

from app.schemas.conversations import (
    ConversationCreate,
    ConversationDetailResponse,
    ConversationResponse,
    MessageCreate,
    MessageResponse,
)
from app.services import conversation_service, patient_service

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
    body: ConversationCreate, user=Depends(get_current_user)
) -> ConversationResponse:
    """Create a new health-assessment conversation for the current user.

    Requires a patient profile to exist (POST /patients first).
    """
    user_id = UUID(str(user.id))
    patient_id = await _require_patient(user_id)
    return await conversation_service.create_conversation(user_id, patient_id, body)


@router.get(
    "",
    response_model=list[ConversationResponse],
    summary="List conversations",
)
async def list_my_conversations(
    limit: int = 20,
    offset: int = 0,
    user=Depends(get_current_user),
) -> list[ConversationResponse]:
    """Return the current user's conversations, most-recent first."""
    return await conversation_service.list_conversations(UUID(str(user.id)), limit, offset)


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
    return ConversationResponse(**resp.data[0])


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
