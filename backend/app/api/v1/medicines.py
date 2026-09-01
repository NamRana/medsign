"""Medicine Reminders API — track medications and daily adherence."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.dependencies import supabase
from app.middleware.auth import get_current_user

router = APIRouter()


class MedicineCreate(BaseModel):
    name: str
    dosage: str | None = None
    frequency: str = "daily"
    times: list[str] = []
    meal_relation: str = "after"
    family_member_id: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    notes: str | None = None


class MedicineUpdate(BaseModel):
    name: str | None = None
    dosage: str | None = None
    frequency: str | None = None
    times: list[str] | None = None
    meal_relation: str | None = None
    end_date: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class MedicineResponse(BaseModel):
    id: str
    name: str
    dosage: str | None = None
    frequency: str
    times: list[str]
    meal_relation: str
    family_member_id: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    notes: str | None = None
    is_active: bool
    created_at: str


class LogCreate(BaseModel):
    status: str = "taken"  # taken, skipped
    scheduled_time: str | None = None


class LogResponse(BaseModel):
    id: str
    medicine_id: str
    scheduled_time: str | None = None
    status: str
    taken_at: str | None = None
    logged_date: str
    created_at: str


class TodaySchedule(BaseModel):
    medicine: MedicineResponse
    logs: list[LogResponse]
    family_member_name: str | None = None


@router.get("", response_model=list[MedicineResponse])
async def list_medicines(active_only: bool = True, user=Depends(get_current_user)):
    user_id = str(user.id)
    query = supabase.table("medicines").select("*").eq("user_id", user_id)
    if active_only:
        query = query.eq("is_active", True)
    resp = query.order("created_at", desc=True).execute()
    return resp.data


@router.post("", response_model=MedicineResponse, status_code=status.HTTP_201_CREATED)
async def add_medicine(body: MedicineCreate, user=Depends(get_current_user)):
    user_id = str(user.id)
    data = body.model_dump(exclude_none=True)
    data["user_id"] = user_id
    resp = supabase.table("medicines").insert(data).execute()
    return resp.data[0]


@router.put("/{medicine_id}", response_model=MedicineResponse)
async def update_medicine(medicine_id: str, body: MedicineUpdate, user=Depends(get_current_user)):
    user_id = str(user.id)
    existing = supabase.table("medicines").select("id").eq("id", medicine_id).eq("user_id", user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Medicine not found")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    resp = supabase.table("medicines").update(updates).eq("id", medicine_id).eq("user_id", str(user.id)).execute()
    return resp.data[0]


@router.delete("/{medicine_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_medicine(medicine_id: str, user=Depends(get_current_user)):
    user_id = str(user.id)
    existing = supabase.table("medicines").select("id").eq("id", medicine_id).eq("user_id", user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Medicine not found")
    supabase.table("medicines").delete().eq("id", medicine_id).eq("user_id", str(user.id)).execute()


@router.get("/today", response_model=list[TodaySchedule])
async def get_today_schedule(user=Depends(get_current_user)):
    user_id = str(user.id)
    today = date.today().isoformat()

    # Get active medicines
    meds_resp = supabase.table("medicines").select("*").eq("user_id", user_id).eq("is_active", True).execute()
    medicines = meds_resp.data

    # Get today's logs
    logs_resp = supabase.table("medicine_logs").select("*").eq("user_id", user_id).eq("logged_date", today).execute()
    logs = logs_resp.data

    # Get family member names
    family_resp = supabase.table("family_members").select("id, name").eq("user_id", user_id).execute()
    family_map = {m["id"]: m["name"] for m in family_resp.data}

    # Build schedule
    schedule = []
    for med in medicines:
        med_logs = [l for l in logs if l["medicine_id"] == med["id"]]
        schedule.append(TodaySchedule(
            medicine=med,
            logs=med_logs,
            family_member_name=family_map.get(med.get("family_member_id")),
        ))

    return schedule


@router.post("/{medicine_id}/log", response_model=LogResponse, status_code=status.HTTP_201_CREATED)
async def log_medicine(medicine_id: str, body: LogCreate, user=Depends(get_current_user)):
    user_id = str(user.id)
    today = date.today().isoformat()

    # Verify ownership
    existing = supabase.table("medicines").select("id").eq("id", medicine_id).eq("user_id", user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Medicine not found")

    data = {
        "medicine_id": medicine_id,
        "user_id": user_id,
        "status": body.status,
        "scheduled_time": body.scheduled_time,
        "logged_date": today,
    }
    if body.status == "taken":
        from datetime import datetime, timezone
        data["taken_at"] = datetime.now(timezone.utc).isoformat()

    resp = supabase.table("medicine_logs").insert(data).execute()
    return resp.data[0]


@router.get("/adherence")
async def get_adherence(days: int = 7, user=Depends(get_current_user)):
    """Get adherence stats for the last N days."""
    user_id = str(user.id)
    from datetime import timedelta
    start_date = (date.today() - timedelta(days=days)).isoformat()

    logs_resp = (
        supabase.table("medicine_logs").select("*")
        .eq("user_id", user_id)
        .gte("logged_date", start_date)
        .execute()
    )
    logs = logs_resp.data

    total = len(logs)
    taken = sum(1 for l in logs if l["status"] == "taken")
    missed = sum(1 for l in logs if l["status"] == "missed")
    skipped = sum(1 for l in logs if l["status"] == "skipped")

    return {
        "total_scheduled": total,
        "taken": taken,
        "missed": missed,
        "skipped": skipped,
        "adherence_percent": round((taken / total) * 100, 1) if total > 0 else 100,
        "days": days,
    }
