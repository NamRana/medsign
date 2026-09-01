"""Pydantic schemas for Patient resources."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import BaseSchema, IDMixin, TimestampMixin


GenderType = Literal["male", "female", "other", "prefer_not_to_say"]


class PatientBase(BaseModel):
    """Fields shared between create and update."""

    full_name: str | None = None
    date_of_birth: date | None = None
    gender: GenderType | None = None
    phone: str | None = None
    language: str = "en"
    location_city: str | None = None
    location_state: str | None = None
    location_country: str = "India"
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    allergies: list[str] | None = Field(default_factory=list)
    chronic_conditions: list[str] | None = Field(default_factory=list)
    current_medications: list[str] | None = Field(default_factory=list)


class PatientCreate(PatientBase):
    """Request body for POST /patients."""

    # user_id is injected server-side from the auth context
    pass


class PatientUpdate(PatientBase):
    """Request body for PATCH /patients/me — all fields optional."""

    pass


class PatientResponse(BaseSchema, IDMixin, TimestampMixin, PatientBase):
    """Response shape returned to clients."""

    user_id: UUID
    metadata: dict = Field(default_factory=dict)

    # Override updated_at to be optional (DB column)
    updated_at: datetime | None = None
    created_at: datetime | None = None
