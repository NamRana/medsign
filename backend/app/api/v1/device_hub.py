"""Device Hub API for consented, source-labelled health-device readings.

This is intentionally a data-capture API. It stores user-approved measurements
for review and trend display; it does not diagnose, monitor emergencies, or make
treatment decisions.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Literal, get_args
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from postgrest import APIError

from app.dependencies import supabase
from app.middleware.auth import get_current_user
from app.middleware.family_scope import resolve_patient_id
from app.schemas.device_hub import (
    CONSENT_NOTE,
    DeviceConnectionCreate,
    DeviceConnectionResponse,
    DeviceConnectionUpdate,
    DeviceHubSummary,
    MetricType,
    ObservationBatchResponse,
    VitalObservationBatchCreate,
    VitalObservationResponse,
    VitalTrendPoint,
    VitalTrendResponse,
)

router = APIRouter()

CONNECTIONS_TABLE = "device_connections"
OBSERVATIONS_TABLE = "vital_observations"
VALID_METRIC_TYPES = set(get_args(MetricType))


def _database_unavailable(exc: APIError) -> HTTPException:
    """Keep database implementation details out of API responses."""
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Device Hub data is temporarily unavailable",
    )


async def _self_patient_id(user) -> str:
    """Ensure device readings belong to the authenticated user's primary profile."""
    patient_id = await resolve_patient_id(family_member_id=None, user=user)
    return str(patient_id)


def _connection_response(row: dict) -> DeviceConnectionResponse:
    """Expose connection state without returning hardware/account identifiers."""
    return DeviceConnectionResponse.model_validate(row)


def _observation_response(row: dict) -> VitalObservationResponse:
    return VitalObservationResponse.model_validate(row)


def _parse_metric_types(metric_types: str | None) -> list[str] | None:
    if metric_types is None:
        return None
    values = list(dict.fromkeys(part.strip() for part in metric_types.split(",") if part.strip()))
    invalid = sorted(set(values) - VALID_METRIC_TYPES)
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported metric_type: {', '.join(invalid)}",
        )
    return values or None


def _latest_observation_rows(
    user_id: str,
    *,
    metric_types: list[str] | None,
    limit: int,
) -> list[dict]:
    """Return one newest reading per metric type without mixing data sources."""
    query = (
        supabase.table(OBSERVATIONS_TABLE)
        .select("*")
        .eq("user_id", user_id)
        .order("observed_at", desc=True)
        .limit(min(max(limit * 20, 100), 1000))
    )
    if metric_types:
        query = query.in_("metric_type", metric_types)
    rows = query.execute().data or []

    latest_by_metric: dict[str, dict] = {}
    for row in rows:
        metric_type = row.get("metric_type")
        if metric_type and metric_type not in latest_by_metric:
            latest_by_metric[metric_type] = row
        if len(latest_by_metric) >= limit:
            break
    return list(latest_by_metric.values())


def _identity_matches(row: dict, body: DeviceConnectionCreate) -> bool:
    """Compare nullable provider identities without exposing them to clients."""
    return (
        row.get("provider") == body.provider
        and (row.get("external_account_id") or None) == body.external_account_id
        and (row.get("device_identifier") or None) == body.device_identifier
    )


def _load_owned_connection(connection_id: UUID, user_id: str) -> dict:
    try:
        response = (
            supabase.table(CONNECTIONS_TABLE)
            .select("*")
            .eq("id", str(connection_id))
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
    except APIError as exc:
        raise _database_unavailable(exc) from exc
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device connection not found")
    return response.data


SourceObservationKey = tuple[str, str, str, str]


def _existing_source_keys(
    user_id: str,
    source_keys: set[SourceObservationKey],
) -> set[SourceObservationKey]:
    """Look up already ingested, individual source observations for this user.

    A single Health Connect record can contain many heart-rate samples or both
    blood-pressure components, so a provider record ID alone is not a unique
    observation identity. The metric and event timestamp complete the key.
    """
    keys_by_provider: dict[str, list[str]] = defaultdict(list)
    for provider, source_record_id, _, _ in source_keys:
        keys_by_provider[provider].append(source_record_id)

    existing: set[SourceObservationKey] = set()
    try:
        for provider, source_record_ids in keys_by_provider.items():
            response = (
                supabase.table(OBSERVATIONS_TABLE)
                .select("provider, source_record_id, metric_type, observed_at")
                .eq("user_id", user_id)
                .eq("provider", provider)
                .in_("source_record_id", source_record_ids)
                .execute()
            )
            for row in response.data or []:
                if not row.get("source_record_id"):
                    continue
                try:
                    existing.add(
                        _source_observation_key(
                            row["provider"],
                            row["source_record_id"],
                            row["metric_type"],
                            row["observed_at"],
                        )
                    )
                except (KeyError, TypeError, ValueError):
                    continue
    except APIError as exc:
        raise _database_unavailable(exc) from exc
    return existing


def _insert_observations_with_retry(
    rows: list[dict],
    user_id: str,
) -> tuple[list[dict], int]:
    """Insert append-only rows, treating a concurrent source-key collision as a retryable duplicate."""
    if not rows:
        return [], 0
    try:
        response = supabase.table(OBSERVATIONS_TABLE).insert(rows).execute()
        return response.data or [], 0
    except APIError as first_error:
        source_keys = {
            _source_observation_key(
                row["provider"],
                row["source_record_id"],
                row["metric_type"],
                row["observed_at"],
            )
            for row in rows
            if row.get("source_record_id")
        }
        if not source_keys:
            raise _database_unavailable(first_error) from first_error

        # A source event may have landed between our initial existence check and
        # INSERT. Remove only newly duplicated rows, then retry the rest once.
        now_existing = _existing_source_keys(user_id, source_keys)
        retry_rows = [
            row
            for row in rows
            if not row.get("source_record_id")
            or _source_observation_key(
                row["provider"],
                row["source_record_id"],
                row["metric_type"],
                row["observed_at"],
            ) not in now_existing
        ]
        duplicates = len(rows) - len(retry_rows)
        if not retry_rows:
            return [], duplicates
        try:
            response = supabase.table(OBSERVATIONS_TABLE).insert(retry_rows).execute()
            return response.data or [], duplicates
        except APIError as retry_error:
            raise _database_unavailable(retry_error) from retry_error


def _as_utc(value: datetime | str) -> datetime:
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _source_observation_key(
    provider: str,
    source_record_id: str,
    metric_type: str,
    observed_at: datetime | str,
) -> SourceObservationKey:
    """Normalize an individual provider observation identity for deduplication."""
    return (provider, source_record_id, metric_type, _as_utc(observed_at).isoformat())


def _bucket_start(observed_at: datetime, bucket: Literal["hour", "day"]) -> datetime:
    if bucket == "hour":
        return observed_at.replace(minute=0, second=0, microsecond=0)
    return observed_at.replace(hour=0, minute=0, second=0, microsecond=0)


@router.get("/connections", response_model=DeviceHubSummary, summary="Get Device Hub state")
async def get_device_hub(
    latest_limit: int = Query(8, ge=1, le=50),
    user=Depends(get_current_user),
) -> DeviceHubSummary:
    """List the user's device connections plus their newest readings by metric."""
    user_id = str(user.id)
    try:
        connection_response = (
            supabase.table(CONNECTIONS_TABLE)
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        latest_rows = _latest_observation_rows(user_id, metric_types=None, limit=latest_limit)
    except APIError as exc:
        raise _database_unavailable(exc) from exc

    return DeviceHubSummary(
        connections=[_connection_response(row) for row in (connection_response.data or [])],
        latest_observations=[_observation_response(row) for row in latest_rows],
        consent_note=CONSENT_NOTE,
    )


@router.post(
    "/connections",
    response_model=DeviceConnectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a consented device data source",
)
async def create_device_connection(
    body: DeviceConnectionCreate,
    user=Depends(get_current_user),
) -> DeviceConnectionResponse:
    """Create or reactivate a source connection without persisting OAuth credentials."""
    user_id = str(user.id)
    try:
        existing_response = (
            supabase.table(CONNECTIONS_TABLE)
            .select("*")
            .eq("user_id", user_id)
            .eq("provider", body.provider)
            .order("created_at", desc=True)
            .execute()
        )
    except APIError as exc:
        raise _database_unavailable(exc) from exc

    existing = next(
        (row for row in (existing_response.data or []) if _identity_matches(row, body)),
        None,
    )
    if existing:
        updates = {
            "status": "connected",
            "disconnected_at": None,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }
        if "display_name" in body.model_fields_set:
            updates["display_name"] = body.display_name
        if "granted_metric_types" in body.model_fields_set:
            updates["granted_metric_types"] = body.granted_metric_types
        if "metadata" in body.model_fields_set:
            updates["metadata"] = body.metadata
        try:
            response = (
                supabase.table(CONNECTIONS_TABLE)
                .update(updates)
                .eq("id", existing["id"])
                .eq("user_id", user_id)
                .execute()
            )
        except APIError as exc:
            raise _database_unavailable(exc) from exc
        if not response.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device connection not found")
        return _connection_response(response.data[0])

    patient_id = await _self_patient_id(user)
    data = body.model_dump(mode="json")
    data.update({"user_id": user_id, "patient_id": patient_id})
    try:
        response = supabase.table(CONNECTIONS_TABLE).insert(data).execute()
    except APIError as exc:
        raise _database_unavailable(exc) from exc
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create device connection",
        )
    return _connection_response(response.data[0])


@router.patch(
    "/connections/{connection_id}",
    response_model=DeviceConnectionResponse,
    summary="Update consented device connection settings",
)
async def update_device_connection(
    connection_id: UUID,
    body: DeviceConnectionUpdate,
    user=Depends(get_current_user),
) -> DeviceConnectionResponse:
    """Change the local display label or explicitly granted metric categories."""
    user_id = str(user.id)
    _load_owned_connection(connection_id, user_id)
    updates = body.model_dump(exclude_unset=True, mode="json")
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    try:
        response = (
            supabase.table(CONNECTIONS_TABLE)
            .update(updates)
            .eq("id", str(connection_id))
            .eq("user_id", user_id)
            .execute()
        )
    except APIError as exc:
        raise _database_unavailable(exc) from exc
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device connection not found")
    return _connection_response(response.data[0])


@router.delete(
    "/connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT,
    summary="Disconnect a device data source",
)
async def disconnect_device_connection(
    connection_id: UUID,
    user=Depends(get_current_user),
) -> Response:
    """Soft-disconnect a source while retaining its existing append-only history."""
    user_id = str(user.id)
    _load_owned_connection(connection_id, user_id)
    try:
        response = (
            supabase.table(CONNECTIONS_TABLE)
            .update(
                {
                    "status": "disconnected",
                    "disconnected_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", str(connection_id))
            .eq("user_id", user_id)
            .execute()
        )
    except APIError as exc:
        raise _database_unavailable(exc) from exc
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device connection not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/observations/batch",
    response_model=ObservationBatchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest consented device readings",
)
async def ingest_observations(
    body: VitalObservationBatchCreate,
    user=Depends(get_current_user),
) -> ObservationBatchResponse:
    """Append a bounded batch of measurements; source-record IDs make retries idempotent."""
    user_id = str(user.id)
    connection: dict | None = None
    patient_id: str
    if body.connection_id:
        connection = _load_owned_connection(body.connection_id, user_id)
        if connection.get("status") != "connected":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Reconnect this device before syncing new readings",
            )
        patient_id = str(connection.get("patient_id") or await _self_patient_id(user))
        granted_metric_types = set(connection.get("granted_metric_types") or [])
    else:
        patient_id = await _self_patient_id(user)
        granted_metric_types = set()

    rows: list[dict] = []
    incoming_source_keys: set[SourceObservationKey] = set()
    duplicate_count = 0
    for observation in body.observations:
        if connection:
            provider = observation.provider or connection["provider"]
            if provider != connection["provider"]:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Observation provider must match its device connection",
                )
            if observation.metric_type not in granted_metric_types:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        f"No consent to sync '{observation.metric_type}' from this device. "
                        "Update the connection's granted_metric_types first."
                    ),
                )
        else:
            provider = observation.provider
            if provider != "manual" or observation.source != "manual":
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="A connected source is required for non-manual observations",
                )

        source_key = (
            _source_observation_key(
                provider,
                observation.source_record_id,
                observation.metric_type,
                observation.observed_at,
            )
            if observation.source_record_id
            else None
        )
        if source_key and source_key in incoming_source_keys:
            duplicate_count += 1
            continue
        if source_key:
            incoming_source_keys.add(source_key)

        rows.append(
            {
                "user_id": user_id,
                "patient_id": patient_id,
                "device_connection_id": str(body.connection_id) if body.connection_id else None,
                "provider": provider,
                "source": observation.source,
                "metric_type": observation.metric_type,
                "value": observation.value,
                "unit": observation.unit,
                "observed_at": observation.observed_at.isoformat(),
                "source_record_id": observation.source_record_id,
                "quality": observation.quality,
                "payload": observation.payload,
            }
        )

    existing_source_keys = _existing_source_keys(user_id, incoming_source_keys)
    rows_to_insert: list[dict] = []
    for row in rows:
        source_key = (
            _source_observation_key(
                row["provider"],
                row["source_record_id"],
                row["metric_type"],
                row["observed_at"],
            )
            if row.get("source_record_id")
            else None
        )
        if source_key and source_key in existing_source_keys:
            duplicate_count += 1
            continue
        rows_to_insert.append(row)

    inserted_rows, concurrent_duplicates = _insert_observations_with_retry(rows_to_insert, user_id)
    duplicate_count += concurrent_duplicates

    # This is a convenience timestamp only; an inability to refresh it should
    # not invalidate successfully persisted, append-only health observations.
    if connection and inserted_rows:
        try:
            (
                supabase.table(CONNECTIONS_TABLE)
                .update({"last_synced_at": datetime.now(timezone.utc).isoformat()})
                .eq("id", str(body.connection_id))
                .eq("user_id", user_id)
                .execute()
            )
        except APIError:
            pass

    return ObservationBatchResponse(
        accepted=len(inserted_rows),
        duplicates=duplicate_count,
        observations=[_observation_response(row) for row in inserted_rows],
    )


@router.get(
    "/observations/latest",
    response_model=list[VitalObservationResponse],
    summary="Get latest device reading for each requested metric",
)
async def get_latest_observations(
    metric_types: str | None = Query(
        default=None,
        description="Comma-separated canonical metric types, for example heart_rate,spo2",
    ),
    limit: int = Query(20, ge=1, le=50),
    user=Depends(get_current_user),
) -> list[VitalObservationResponse]:
    """Return newest source-labelled readings, scoped to the current user."""
    parsed_metric_types = _parse_metric_types(metric_types)
    try:
        rows = _latest_observation_rows(
            str(user.id), metric_types=parsed_metric_types, limit=limit
        )
    except APIError as exc:
        raise _database_unavailable(exc) from exc
    return [_observation_response(row) for row in rows]


@router.get(
    "/observations/trends",
    response_model=VitalTrendResponse,
    summary="Get a user-scoped vital trend",
)
async def get_observation_trend(
    metric_type: MetricType,
    bucket: Literal["hour", "day"] = Query("day"),
    from_at: datetime | None = Query(default=None),
    to_at: datetime | None = Query(default=None),
    limit: int = Query(90, ge=1, le=366),
    user=Depends(get_current_user),
) -> VitalTrendResponse:
    """Aggregate one metric by hour or day without mixing different measurement units."""
    end_at = _as_utc(to_at) if to_at else datetime.now(timezone.utc)
    start_at = _as_utc(from_at) if from_at else end_at - timedelta(days=30)
    if start_at > end_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="from_at must be before to_at",
        )

    # Fetch enough raw readings to fill the requested number of aggregate
    # buckets while bounding work for a mobile-facing endpoint.
    fetch_limit = min(max(limit * 50, 1000), 5000)
    try:
        response = (
            supabase.table(OBSERVATIONS_TABLE)
            .select("metric_type, value, unit, observed_at")
            .eq("user_id", str(user.id))
            .eq("metric_type", metric_type)
            .gte("observed_at", start_at.isoformat())
            .lte("observed_at", end_at.isoformat())
            # Read the most recent bounded window first, then sort aggregate
            # points chronologically below. This keeps a high-frequency device
            # timeline useful instead of returning only the oldest readings.
            .order("observed_at", desc=True)
            .limit(fetch_limit)
            .execute()
        )
    except APIError as exc:
        raise _database_unavailable(exc) from exc

    grouped: dict[tuple[datetime, str], list[float]] = defaultdict(list)
    for row in response.data or []:
        observed_at = _bucket_start(_as_utc(row["observed_at"]), bucket)
        grouped[(observed_at, row["unit"])].append(float(row["value"]))

    points = [
        VitalTrendPoint(
            observed_at=observed_at,
            value=sum(values) / len(values),
            min_value=min(values),
            max_value=max(values),
            count=len(values),
            unit=unit,
        )
        for (observed_at, unit), values in sorted(grouped.items())
    ]
    if len(points) > limit:
        points = points[-limit:]
    units = {point.unit for point in points}

    return VitalTrendResponse(
        metric_type=metric_type,
        unit=next(iter(units)) if len(units) == 1 else None,
        bucket=bucket,
        points=points,
    )
