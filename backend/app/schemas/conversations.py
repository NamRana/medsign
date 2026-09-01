"""Pydantic schemas for Conversation and Message resources."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import BaseSchema, IDMixin


ConversationStatus = Literal["active", "completed", "archived"]
SessionType = Literal["symptom_check", "follow_up", "general", "emergency"]
RiskLevel = Literal["low", "medium", "high", "critical"]
MessageRole = Literal["user", "assistant", "system"]
ContentType = Literal["text", "image", "audio", "structured"]


# ─── MESSAGE SCHEMAS ──────────────────────────────────────────────────────────

class MessageCreate(BaseModel):
    """Request body for POST /conversations/{id}/messages."""

    role: MessageRole = "user"
    content: str
    content_type: ContentType = "text"
    metadata: dict = Field(default_factory=dict)


class MessageResponse(BaseSchema, IDMixin):
    """Single message returned to clients."""

    conversation_id: UUID
    role: MessageRole
    content: str
    content_type: ContentType
    tokens_used: int | None = None
    model_used: str | None = None
    latency_ms: int | None = None
    metadata: dict = Field(default_factory=dict)
    created_at: datetime | None = None


# ─── CONVERSATION SCHEMAS ─────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    """Request body for POST /conversations."""

    title: str | None = None
    session_type: SessionType = "symptom_check"
    chief_complaint: str | None = None
    metadata: dict = Field(default_factory=dict)


class ConversationUpdate(BaseModel):
    """Request body for PATCH /conversations/{id}."""

    title: str | None = None
    status: ConversationStatus | None = None
    chief_complaint: str | None = None
    summary: str | None = None
    risk_level: RiskLevel | None = None


class ConversationResponse(BaseSchema, IDMixin):
    """Conversation without messages (list view)."""

    patient_id: UUID
    user_id: UUID
    title: str | None = None
    status: ConversationStatus
    session_type: SessionType
    chief_complaint: str | None = None
    summary: str | None = None
    risk_level: RiskLevel | None = None
    metadata: dict = Field(default_factory=dict)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ConversationDetailResponse(ConversationResponse):
    """Conversation with its messages (detail view)."""

    messages: list[MessageResponse] = Field(default_factory=list)
