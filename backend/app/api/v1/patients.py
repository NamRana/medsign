"""Patient API endpoints.

Patient profiles are scoped to the authenticated Supabase user.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.middleware.auth import get_current_user
from app.schemas.patients import PatientCreate, PatientResponse, PatientUpdate
from app.services import patient_service

router = APIRouter()


@router.post(
    "",
    response_model=PatientResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create patient profile",
)
async def create_patient(body: PatientCreate, user=Depends(get_current_user)) -> PatientResponse:
    """Create a new patient profile for the current user.

    Returns 409 if a profile already exists.
    """
    return await patient_service.create_patient(UUID(str(user.id)), body)


@router.get(
    "/me",
    response_model=PatientResponse,
    summary="Get current user's patient profile",
)
async def get_my_patient(user=Depends(get_current_user)) -> PatientResponse:
    """Return the patient profile linked to the current user."""
    patient = await patient_service.get_patient_by_user_id(UUID(str(user.id)))
    if patient is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Patient profile not found")
    return patient


@router.patch(
    "/me",
    response_model=PatientResponse,
    summary="Update current user's patient profile",
)
async def update_my_patient(body: PatientUpdate, user=Depends(get_current_user)) -> PatientResponse:
    """Partially update the patient profile for the current user."""
    return await patient_service.update_patient(UUID(str(user.id)), body)
