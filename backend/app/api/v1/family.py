"""Family Members API — manage family health profiles."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.dependencies import supabase
from app.middleware.auth import get_current_user
from app.schemas.patients import PatientCreate
from app.services import patient_service

router = APIRouter()


class FamilyMemberCreate(BaseModel):
    name: str
    relationship: str
    date_of_birth: str | None = None
    gender: str | None = None
    blood_group: str | None = None
    avatar_color: str = "emerald"


class FamilyMemberUpdate(BaseModel):
    name: str | None = None
    relationship: str | None = None
    date_of_birth: str | None = None
    gender: str | None = None
    blood_group: str | None = None
    avatar_color: str | None = None


class FamilyMemberResponse(BaseModel):
    id: str
    name: str
    relationship: str
    date_of_birth: str | None = None
    gender: str | None = None
    blood_group: str | None = None
    avatar_color: str
    is_primary: bool
    patient_id: str | None = None
    created_at: str


@router.get("", response_model=list[FamilyMemberResponse])
async def list_family_members(user=Depends(get_current_user)):
    user_id = str(user.id)
    resp = supabase.table("family_members").select("*").eq("user_id", user_id).order("created_at").execute()
    return resp.data


@router.post("", response_model=FamilyMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_family_member(body: FamilyMemberCreate, user=Depends(get_current_user)):
    user_id = str(user.id)
    user_uuid = UUID(user_id)
    data = body.model_dump(exclude_none=True)
    data["user_id"] = user_id

    existing = supabase.table("family_members").select("id").eq("user_id", user_id).execute()
    if not existing.data or body.relationship == "self":
        data["is_primary"] = True

    # Auto-create a patient record for this family member
    dob = None
    if body.date_of_birth:
        from datetime import date as date_type
        try:
            dob = date_type.fromisoformat(body.date_of_birth)
        except ValueError:
            pass

    if body.relationship == "self":
        patient = await patient_service.get_patient_by_user_id(user_uuid)
        if not patient:
            patient = await patient_service.create_patient(
                user_uuid, PatientCreate(full_name=body.name, date_of_birth=dob, gender=body.gender)
            )
    else:
        patient = await patient_service.create_patient_for_family(
            user_uuid, PatientCreate(full_name=body.name, date_of_birth=dob, gender=body.gender)
        )
    data["patient_id"] = str(patient.id)

    resp = supabase.table("family_members").insert(data).execute()
    return resp.data[0]


@router.put("/{member_id}", response_model=FamilyMemberResponse)
async def update_family_member(member_id: str, body: FamilyMemberUpdate, user=Depends(get_current_user)):
    user_id = str(user.id)
    # Verify ownership
    existing = supabase.table("family_members").select("id").eq("id", member_id).eq("user_id", user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Family member not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    resp = supabase.table("family_members").update(updates).eq("id", member_id).eq("user_id", str(user.id)).execute()
    return resp.data[0]


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_family_member(member_id: str, user=Depends(get_current_user)):
    user_id = str(user.id)
    existing = supabase.table("family_members").select("id, is_primary").eq("id", member_id).eq("user_id", user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Family member not found")
    if existing.data[0].get("is_primary"):
        raise HTTPException(status_code=400, detail="Cannot delete primary profile")

    supabase.table("family_members").delete().eq("id", member_id).eq("user_id", str(user.id)).execute()
