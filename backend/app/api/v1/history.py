"""History & Doctor Summary API endpoints.

Provides assessment history with search/filter, doctor-ready summary generation,
shareable links, and data deletion.
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.agents.summarizer import DoctorSummarizer, DoctorSummary
from app.dependencies import supabase
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory store for shareable links (use Redis in production)
_share_links: dict[str, dict] = {}


# ── Response Models ──────────────────────────────────────────────────────────


class HistoryItem(BaseModel):
    id: str
    chief_complaint: str | None
    status: str
    risk_level: str | None
    session_type: str
    message_count: int
    image_count: int = 0
    lab_report_count: int = 0
    created_at: str
    ended_at: str | None


class HistoryDetail(BaseModel):
    id: str
    chief_complaint: str | None
    status: str
    risk_level: str | None
    session_type: str
    created_at: str
    messages: list[dict]
    symptoms: list[dict]
    assessment: dict | None
    images: list[dict] = Field(default_factory=list)
    lab_reports: list[dict] = Field(default_factory=list)


class ShareLinkResponse(BaseModel):
    share_url: str
    expires_at: str


# ── History Endpoints ────────────────────────────────────────────────────────


@router.get("", response_model=list[HistoryItem])
async def list_history(
    search: str | None = Query(None, description="Search by chief complaint"),
    date_from: str | None = Query(None, description="Filter from date (YYYY-MM-DD)"),
    date_to: str | None = Query(None, description="Filter to date (YYYY-MM-DD)"),
    risk_level: str | None = Query(None, pattern="^(low|medium|high|critical)$"),
    limit: int = Query(30, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
):
    """List past conversations/assessments with search and filters."""
    query = supabase.table("conversations").select(
        "id, chief_complaint, status, risk_level, session_type, created_at, ended_at"
    ).eq("user_id", str(user.id)).order("created_at", desc=True)

    if search:
        query = query.ilike("chief_complaint", f"%{search}%")

    if date_from:
        query = query.gte("created_at", f"{date_from}T00:00:00Z")

    if date_to:
        query = query.lte("created_at", f"{date_to}T23:59:59Z")

    if risk_level:
        query = query.eq("risk_level", risk_level)

    query = query.range(offset, offset + limit - 1)
    response = query.execute()

    items = []
    for row in response.data or []:
        msg_resp = supabase.table("messages").select(
            "id", count="exact"
        ).eq("conversation_id", row["id"]).execute()

        img_resp = supabase.table("images").select(
            "id", count="exact"
        ).eq("conversation_id", row["id"]).execute()

        lab_resp = supabase.table("lab_reports").select(
            "id", count="exact"
        ).eq("conversation_id", row["id"]).execute()

        items.append(HistoryItem(
            id=row["id"],
            chief_complaint=row.get("chief_complaint"),
            status=row["status"],
            risk_level=row.get("risk_level"),
            session_type=row.get("session_type", "symptom_check"),
            message_count=msg_resp.count or 0,
            image_count=img_resp.count or 0,
            lab_report_count=lab_resp.count or 0,
            created_at=row["created_at"],
            ended_at=row.get("ended_at"),
        ))

    return items


@router.get("/{conversation_id}", response_model=HistoryDetail)
async def get_history_detail(conversation_id: str, user=Depends(get_current_user)):
    """Get full detail for a past conversation."""
    conv_resp = supabase.table("conversations").select("*").eq(
        "id", conversation_id
    ).eq("user_id", str(user.id)).execute()

    if not conv_resp.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv = conv_resp.data[0]

    # Messages
    msgs_resp = supabase.table("messages").select(
        "role, content, content_type, created_at"
    ).eq("conversation_id", conversation_id).order("created_at").execute()

    # Symptoms
    symptoms_resp = supabase.table("symptoms").select(
        "name, severity, duration_days, body_location, description"
    ).eq("conversation_id", conversation_id).execute()

    # Assessment
    assess_resp = supabase.table("assessments").select("*").eq(
        "conversation_id", conversation_id
    ).execute()

    # Images with analysis
    images_resp = supabase.table("images").select(
        "id, storage_path, mime_type, analysis, created_at"
    ).eq("conversation_id", conversation_id).order("created_at").execute()

    # Lab reports with values and interpretations
    labs_resp = supabase.table("lab_reports").select(
        "id, original_filename, storage_path, mime_type, status, report_date, lab_name, created_at"
    ).eq("conversation_id", conversation_id).order("created_at").execute()

    lab_reports_enriched = []
    for lab in labs_resp.data or []:
        values_resp = supabase.table("lab_values").select(
            "test_name, value, unit, reference_range, is_abnormal, abnormality_direction, category"
        ).eq("report_id", lab["id"]).execute()

        interp_resp = supabase.table("lab_interpretations").select(
            "summary, abnormal_findings, patient_friendly_explanation, recommendations"
        ).eq("report_id", lab["id"]).maybe_single().execute()

        lab["values"] = values_resp.data or []
        lab["interpretation"] = interp_resp.data if interp_resp.data else None
        lab_reports_enriched.append(lab)

    return HistoryDetail(
        id=conv["id"],
        chief_complaint=conv.get("chief_complaint"),
        status=conv["status"],
        risk_level=conv.get("risk_level"),
        session_type=conv.get("session_type", "symptom_check"),
        created_at=conv["created_at"],
        messages=msgs_resp.data or [],
        symptoms=symptoms_resp.data or [],
        assessment=assess_resp.data[0] if assess_resp.data else None,
        images=images_resp.data or [],
        lab_reports=lab_reports_enriched,
    )


# ── Doctor Summary ───────────────────────────────────────────────────────────


@router.get("/{conversation_id}/summary", response_model=DoctorSummary)
async def get_doctor_summary(conversation_id: str, user=Depends(get_current_user)):
    """Generate a doctor-ready clinical summary for a conversation."""
    # Verify ownership
    conv_resp = supabase.table("conversations").select("id").eq(
        "id", conversation_id
    ).eq("user_id", str(user.id)).execute()

    if not conv_resp.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    summarizer = DoctorSummarizer()
    return await summarizer.generate(conversation_id)


@router.post("/{conversation_id}/share", response_model=ShareLinkResponse)
async def create_share_link(
    conversation_id: str,
    hours: int = Query(24, ge=1, le=168, description="Link validity in hours"),
    user=Depends(get_current_user),
):
    """Create a time-limited shareable link for a doctor summary."""
    # Verify ownership
    conv_resp = supabase.table("conversations").select("id").eq(
        "id", conversation_id
    ).eq("user_id", str(user.id)).execute()

    if not conv_resp.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=hours)

    _share_links[token] = {
        "conversation_id": conversation_id,
        "expires_at": expires_at.isoformat(),
    }

    share_url = f"/api/v1/history/shared/{token}"

    return ShareLinkResponse(share_url=share_url, expires_at=expires_at.isoformat())


@router.get("/shared/{token}")
async def get_shared_summary(token: str):
    """Access a shared doctor summary via token. No auth required."""
    link = _share_links.get(token)
    if not link:
        raise HTTPException(status_code=404, detail="Link not found or expired")

    expires_at = datetime.fromisoformat(link["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        del _share_links[token]
        raise HTTPException(status_code=410, detail="This link has expired")

    summarizer = DoctorSummarizer()
    return await summarizer.generate(link["conversation_id"])


# ── Data Deletion ────────────────────────────────────────────────────────────


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str, user=Depends(get_current_user)):
    """Delete a conversation and all associated data (messages, symptoms, etc.)."""
    conv_resp = supabase.table("conversations").select("id").eq(
        "id", conversation_id
    ).eq("user_id", str(user.id)).execute()

    if not conv_resp.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Cascade handles messages, symptoms via FK
    supabase.table("conversations").delete().eq("id", conversation_id).eq("user_id", str(user.id)).execute()

    return {"status": "deleted", "id": conversation_id}


@router.delete("/account/all")
async def delete_all_user_data(user=Depends(get_current_user)):
    """Delete all data for the current user. Irreversible."""
    # Delete all conversations (cascades to messages, symptoms)
    user_id = str(user.id)
    supabase.table("conversations").delete().eq("user_id", user_id).execute()

    # Delete lab reports
    supabase.table("lab_reports").delete().eq(
        "user_id", user_id
    ).execute()

    # Delete patient profile
    supabase.table("patients").delete().eq("user_id", user_id).execute()

    return {"status": "all_data_deleted"}
