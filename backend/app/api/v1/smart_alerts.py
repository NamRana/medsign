"""Smart Health Alerts endpoint."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.middleware.auth import get_current_user
from app.middleware.family_scope import resolve_patient_id
from app.services.smart_alerts_service import generate_smart_alerts

router = APIRouter()


@router.get("", summary="Get smart health alerts")
async def get_alerts(
    member: str | None = Query(None),
    patient_id: UUID = Depends(resolve_patient_id),
    user=Depends(get_current_user),
):
    user_id = UUID(str(user.id))
    alerts = await generate_smart_alerts(user_id, patient_id)
    return {"alerts": alerts, "total": len(alerts), "locked_count": sum(1 for a in alerts if a.get("locked"))}
