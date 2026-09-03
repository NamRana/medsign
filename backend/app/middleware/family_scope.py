"""Resolve the active patient based on optional family_member_id query param.

Usage in endpoints:
    from app.middleware.family_scope import resolve_patient_id

    @router.get("/something")
    async def my_endpoint(
        patient_id: UUID = Depends(resolve_patient_id),
        user=Depends(get_current_user),
    ):
        ...
"""

from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException, Query

from app.dependencies import supabase
from app.middleware.auth import get_current_user
from app.services import patient_service


async def resolve_patient_id(
    family_member_id: str | None = Query(None, alias="member"),
    user=Depends(get_current_user),
) -> UUID:
    """Return the patient_id for the selected family member, or the user's own patient."""
    user_id = UUID(str(user.id))

    if family_member_id:
        member = (
            supabase.table("family_members")
            .select("patient_id, user_id")
            .eq("id", family_member_id)
            .maybe_single()
            .execute()
        )
        if not member or not member.data:
            raise HTTPException(status_code=404, detail="Family member not found")
        if member.data["user_id"] != str(user_id):
            raise HTTPException(status_code=403, detail="Not your family member")
        pid = member.data.get("patient_id")
        if not pid:
            raise HTTPException(status_code=400, detail="Family member has no patient profile")
        return UUID(pid)

    patient = await patient_service.get_patient_by_user_id(user_id)
    if patient:
        return patient.id

    from app.schemas.patients import PatientCreate
    patient = await patient_service.create_patient(user_id, PatientCreate())
    return patient.id
