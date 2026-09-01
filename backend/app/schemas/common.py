"""Shared base schemas used across the application."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    """Base schema with common config for all response models."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class TimestampMixin(BaseModel):
    """Adds created_at / updated_at fields to response schemas."""

    created_at: datetime | None = None
    updated_at: datetime | None = None


class IDMixin(BaseModel):
    """Adds an id field to response schemas."""

    id: UUID


class PaginatedResponse(BaseSchema):
    """Generic paginated wrapper."""

    items: list[Any]
    total: int
    page: int
    page_size: int
    has_more: bool
