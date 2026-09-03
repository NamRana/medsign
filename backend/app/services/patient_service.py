"""Patient CRUD operations using the Supabase Python client."""

from uuid import UUID

from fastapi import HTTPException, status
from postgrest import APIError

from app.dependencies import supabase
from app.schemas.patients import PatientCreate, PatientResponse, PatientUpdate


TABLE = "patients"


async def get_patient_by_user_id(user_id: UUID) -> PatientResponse | None:
    """Return the user's own (primary) patient record, or None.

    After migration 018 removed the unique constraint on user_id,
    multiple patient rows can exist per user (one per family member).
    We pick the oldest row which is always the user's own profile.
    """
    try:
        response = (
            supabase.table(TABLE)
            .select("*")
            .eq("user_id", str(user_id))
            .order("created_at")
            .limit(1)
            .execute()
        )
        if response is None or not response.data:
            return None
        return PatientResponse(**response.data[0])
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {exc.message}",
        ) from exc


async def get_patient_by_id(patient_id: UUID) -> PatientResponse:
    """Return a patient by primary key, raising 404 if absent."""
    try:
        response = (
            supabase.table(TABLE)
            .select("*")
            .eq("id", str(patient_id))
            .maybe_single()
            .execute()
        )
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {exc.message}",
        ) from exc

    if response is None or response.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found",
        )
    return PatientResponse(**response.data)


async def create_patient(user_id: UUID, data: PatientCreate) -> PatientResponse:
    """Create a new patient profile; raises 409 if one already exists for this user (self profile)."""
    existing = await get_patient_by_user_id(user_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Patient profile already exists for this user",
        )
    return await _insert_patient(user_id, data)


async def create_patient_for_family(user_id: UUID, data: PatientCreate) -> PatientResponse:
    """Create a patient record for a family member (allows multiple per user)."""
    return await _insert_patient(user_id, data)


async def _insert_patient(user_id: UUID, data: PatientCreate) -> PatientResponse:
    payload = {
        "user_id": str(user_id),
        **data.model_dump(exclude_none=True, mode="json"),
    }
    try:
        response = supabase.table(TABLE).insert(payload).execute()
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {exc.message}",
        ) from exc

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create patient",
        )
    return PatientResponse(**response.data[0])


async def update_patient(user_id: UUID, data: PatientUpdate) -> PatientResponse:
    """Update an existing patient profile."""
    existing = await get_patient_by_user_id(user_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile not found",
        )

    payload = data.model_dump(exclude_none=True, exclude_unset=True)
    if not payload:
        return existing  # nothing to update

    try:
        response = (
            supabase.table(TABLE)
            .update(payload)
            .eq("user_id", str(user_id))
            .execute()
        )
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {exc.message}",
        ) from exc

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update patient",
        )
    return PatientResponse(**response.data[0])
