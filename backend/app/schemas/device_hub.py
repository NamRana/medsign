"""Schemas and validation helpers for consented health-device data.

The API accepts only normalized, non-diagnostic measurements. Raw provider
credentials are deliberately rejected: connection metadata and observation
payloads may contain device context, but never OAuth tokens or passwords.
"""

from __future__ import annotations

import json
import math
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import BaseSchema

DeviceProvider = Literal[
    "apple_health",
    "health_connect",
    "fitbit",
    "garmin",
    "oura",
    "withings",
    "bluetooth",
    "manual",
    "other",
]
ConnectionStatus = Literal["connected", "disconnected", "revoked", "error"]
ObservationSource = Literal[
    "device",
    "health_store",
    "provider_api",
    "bluetooth",
    "manual",
    "import",
]
ObservationQuality = Literal[
    "good",
    "estimated",
    "low",
    "unknown",
    "manual",
    "device_reported",
]

# Canonical names keep data interoperable across Apple Health, Health Connect,
# Bluetooth devices, and provider APIs. More can be added through a migration and
# API release rather than accepting arbitrary metric keys.
MetricType = Literal[
    "heart_rate",
    "resting_heart_rate",
    "spo2",
    "temperature",
    "systolic_bp",
    "diastolic_bp",
    "weight",
    "steps",
    "sleep_duration",
    "respiratory_rate",
    "blood_glucose",
    "hrv",
    "active_energy",
    "height",
]

SUPPORTED_PROVIDERS: tuple[DeviceProvider, ...] = (
    "apple_health",
    "health_connect",
    "fitbit",
    "garmin",
    "oura",
    "withings",
    "bluetooth",
    "manual",
    "other",
)

CONSENT_NOTE = (
    "Only measurements explicitly permitted by the person are stored. "
    "Device readings are context for care and are not a diagnosis, emergency "
    "monitoring service, or autonomous treatment decision."
)

_SENSITIVE_KEY_PARTS = {
    "token",
    "accesstoken",
    "refreshtoken",
    "secret",
    "password",
    "authorization",
    "apikey",
    "credential",
    "cookie",
}


def _validate_json_without_credentials(value: dict[str, Any], field_name: str) -> dict[str, Any]:
    """Allow compact JSON context but reject likely credentials at the boundary."""

    def walk(item: Any, path: str = "") -> None:
        if isinstance(item, dict):
            for key, child in item.items():
                normalized_key = re.sub(r"[^a-z]", "", str(key).lower())
                if any(part in normalized_key for part in _SENSITIVE_KEY_PARTS):
                    raise ValueError(
                        f"{field_name} must not contain credentials or access tokens"
                    )
                walk(child, f"{path}.{key}" if path else str(key))
        elif isinstance(item, list):
            for index, child in enumerate(item):
                walk(child, f"{path}[{index}]")

    walk(value)
    try:
        encoded = json.dumps(value, separators=(",", ":"))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be JSON serializable") from exc
    if len(encoded.encode("utf-8")) > 16 * 1024:
        raise ValueError(f"{field_name} must be 16 KB or smaller")
    return value


def _normalise_optional_string(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


class DeviceHubRequest(BaseModel):
    """Strict request base model for the Device Hub."""

    model_config = ConfigDict(extra="forbid")


class DeviceConnectionCreate(DeviceHubRequest):
    provider: DeviceProvider
    display_name: str | None = Field(default=None, max_length=120)
    device_identifier: str | None = Field(default=None, max_length=255)
    external_account_id: str | None = Field(default=None, max_length=255)
    granted_metric_types: list[MetricType] = Field(default_factory=list, max_length=20)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("display_name", "device_identifier", "external_account_id")
    @classmethod
    def clean_optional_identifiers(cls, value: str | None) -> str | None:
        return _normalise_optional_string(value)

    @field_validator("granted_metric_types")
    @classmethod
    def deduplicate_metric_types(cls, values: list[MetricType]) -> list[MetricType]:
        return list(dict.fromkeys(values))

    @field_validator("metadata")
    @classmethod
    def validate_metadata(cls, value: dict[str, Any]) -> dict[str, Any]:
        return _validate_json_without_credentials(value, "metadata")


class DeviceConnectionUpdate(DeviceHubRequest):
    display_name: str | None = Field(default=None, max_length=120)
    granted_metric_types: list[MetricType] | None = Field(default=None, max_length=20)
    metadata: dict[str, Any] | None = None
    last_synced_at: datetime | None = None

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: str | None) -> str | None:
        return _normalise_optional_string(value)

    @field_validator("granted_metric_types")
    @classmethod
    def deduplicate_updated_metric_types(
        cls, values: list[MetricType] | None
    ) -> list[MetricType] | None:
        return list(dict.fromkeys(values)) if values is not None else values

    @field_validator("metadata")
    @classmethod
    def validate_updated_metadata(
        cls, value: dict[str, Any] | None
    ) -> dict[str, Any] | None:
        return _validate_json_without_credentials(value, "metadata") if value is not None else value

    @field_validator("last_synced_at")
    @classmethod
    def require_aware_sync_timestamp(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("last_synced_at must include a timezone offset")
        return value.astimezone(timezone.utc)


class DeviceConnectionResponse(BaseSchema):
    id: UUID
    provider: DeviceProvider
    display_name: str | None = None
    granted_metric_types: list[MetricType] = Field(default_factory=list)
    status: ConnectionStatus
    last_synced_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    connected_at: datetime
    disconnected_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class VitalObservationInput(DeviceHubRequest):
    metric_type: MetricType
    value: float
    unit: str = Field(min_length=1, max_length=32)
    observed_at: datetime
    source: ObservationSource = "device"
    provider: DeviceProvider | None = None
    source_record_id: str | None = Field(default=None, max_length=255)
    quality: ObservationQuality | None = None
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("value")
    @classmethod
    def require_finite_value(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("value must be a finite number")
        return value

    @field_validator("unit")
    @classmethod
    def clean_unit(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("unit cannot be blank")
        return cleaned

    @field_validator("source_record_id")
    @classmethod
    def clean_source_record_id(cls, value: str | None) -> str | None:
        return _normalise_optional_string(value)

    @field_validator("source", mode="before")
    @classmethod
    def normalize_common_health_store_labels(cls, value: str) -> str:
        """Convert native display labels to a stable source enum before storage."""
        normalized = re.sub(r"[^a-z]", "", str(value).lower())
        aliases = {
            "applehealth": "health_store",
            "healthkit": "health_store",
            "healthconnect": "health_store",
            "bluetooth": "bluetooth",
            "providerapi": "provider_api",
            "manual": "manual",
            "import": "import",
            "device": "device",
        }
        return aliases.get(normalized, value)

    @field_validator("quality", mode="before")
    @classmethod
    def normalize_quality(cls, value: str | None) -> str | None:
        # Accept the earlier display-style spelling while storing one canonical
        # value for queries and trends.
        return "device_reported" if value == "device-reported" else value

    @field_validator("observed_at")
    @classmethod
    def require_aware_reasonable_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("observed_at must include a timezone offset")
        normalized = value.astimezone(timezone.utc)
        if normalized > datetime.now(timezone.utc) + timedelta(minutes=15):
            raise ValueError("observed_at cannot be more than 15 minutes in the future")
        return normalized

    @field_validator("payload")
    @classmethod
    def validate_payload(cls, value: dict[str, Any]) -> dict[str, Any]:
        return _validate_json_without_credentials(value, "payload")


class VitalObservationBatchCreate(DeviceHubRequest):
    connection_id: UUID | None = None
    observations: list[VitalObservationInput] = Field(min_length=1, max_length=100)


class VitalObservationResponse(BaseSchema):
    id: UUID
    connection_id: UUID | None = Field(default=None, validation_alias="device_connection_id")
    metric_type: MetricType
    value: float
    unit: str
    observed_at: datetime
    provider: DeviceProvider
    source: ObservationSource
    source_record_id: str | None = None
    quality: ObservationQuality | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class ObservationBatchResponse(BaseSchema):
    accepted: int
    duplicates: int
    observations: list[VitalObservationResponse] = Field(default_factory=list)


class VitalTrendPoint(BaseSchema):
    observed_at: datetime
    value: float
    min_value: float
    max_value: float
    count: int
    unit: str


class VitalTrendResponse(BaseSchema):
    metric_type: MetricType
    unit: str | None = None
    bucket: Literal["hour", "day"]
    points: list[VitalTrendPoint] = Field(default_factory=list)


class DeviceHubSummary(BaseSchema):
    connections: list[DeviceConnectionResponse] = Field(default_factory=list)
    latest_observations: list[VitalObservationResponse] = Field(default_factory=list)
    supported_providers: list[DeviceProvider] = Field(default_factory=lambda: list(SUPPORTED_PROVIDERS))
    consent_note: str = CONSENT_NOTE
