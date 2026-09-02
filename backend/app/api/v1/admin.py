"""Admin Dashboard API endpoints.

Provides analytics, safety event monitoring, doctor review interface,
and system health metrics. Protected by admin role check.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.dependencies import supabase
from app.middleware.auth import require_admin

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(require_admin)])


# ── Response Models ──────────────────────────────────────────────────────────


class OverviewStats(BaseModel):
    total_conversations: int
    conversations_today: int
    conversations_this_week: int
    total_assessments: int
    total_messages: int
    avg_messages_per_conversation: float
    total_users: int


class UrgencyBreakdown(BaseModel):
    low: int
    medium: int
    high: int
    critical: int


class SafetyStats(BaseModel):
    total_events: int
    events_today: int
    events_this_week: int
    by_type: dict[str, int]
    by_severity: dict[str, int]
    recent_events: list[dict]


class FeedbackStats(BaseModel):
    total_feedback: int
    avg_rating: float | None
    helpful_percent: float | None
    accurate_percent: float | None
    recent_comments: list[dict]


class ModelStats(BaseModel):
    total_ai_messages: int
    avg_latency_ms: float | None
    models_used: dict[str, int]


class DashboardResponse(BaseModel):
    overview: OverviewStats
    urgency: UrgencyBreakdown
    safety: SafetyStats
    feedback: FeedbackStats
    model: ModelStats


class ReviewCase(BaseModel):
    id: str
    conversation_id: str
    risk_level: str
    possible_conditions: list
    recommended_actions: list
    red_flags: list[str]
    confidence_score: float | None
    created_at: str
    chief_complaint: str | None
    review_status: str


class ReviewSubmission(BaseModel):
    verdict: str  # correct, needs_improvement, unsafe, missing_red_flag
    notes: str | None = None


# ── Dashboard Endpoints ──────────────────────────────────────────────────────


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard():
    """Get full admin dashboard with all analytics."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())

    overview = await _get_overview_stats(today_start, week_start)
    urgency = await _get_urgency_breakdown()
    safety = await _get_safety_stats(today_start, week_start)
    feedback = await _get_feedback_stats()
    model = await _get_model_stats()

    return DashboardResponse(
        overview=overview,
        urgency=urgency,
        safety=safety,
        feedback=feedback,
        model=model,
    )


@router.get("/reviews", response_model=list[ReviewCase])
async def list_review_cases(
    status: str = Query("pending", pattern="^(pending|reviewed|all)$"),
    limit: int = Query(20, le=100),
    offset: int = Query(0, ge=0),
):
    """List assessment cases for doctor review."""
    query = supabase.table("assessments").select(
        "id, conversation_id, risk_level, possible_conditions, "
        "recommended_actions, red_flags, confidence_score, created_at, "
        "reviewed_by, reviewed_at"
    ).order("created_at", desc=True).range(offset, offset + limit - 1)

    if status == "pending":
        query = query.is_("reviewed_by", "null")
    elif status == "reviewed":
        query = query.not_.is_("reviewed_by", "null")

    response = query.execute()

    cases = []
    for row in response.data or []:
        # Get chief complaint from conversation
        conv_resp = supabase.table("conversations").select(
            "chief_complaint"
        ).eq("id", row["conversation_id"]).execute()
        chief_complaint = None
        if conv_resp.data:
            chief_complaint = conv_resp.data[0].get("chief_complaint")

        review_status = "reviewed" if row.get("reviewed_by") else "pending"

        cases.append(ReviewCase(
            id=row["id"],
            conversation_id=row["conversation_id"],
            risk_level=row["risk_level"],
            possible_conditions=row.get("possible_conditions") or [],
            recommended_actions=row.get("recommended_actions") or [],
            red_flags=row.get("red_flags") or [],
            confidence_score=row.get("confidence_score"),
            created_at=row["created_at"],
            chief_complaint=chief_complaint,
            review_status=review_status,
        ))

    return cases


@router.get("/reviews/{assessment_id}")
async def get_review_detail(assessment_id: str):
    """Get full case detail for review, including messages and symptoms."""
    # Get assessment
    assess_resp = supabase.table("assessments").select("*").eq(
        "id", assessment_id
    ).execute()
    if not assess_resp.data:
        raise HTTPException(status_code=404, detail="Assessment not found")

    assessment = assess_resp.data[0]
    conversation_id = assessment["conversation_id"]

    # Get conversation
    conv_resp = supabase.table("conversations").select("*").eq(
        "id", conversation_id
    ).execute()
    conversation = conv_resp.data[0] if conv_resp.data else {}

    # Get messages
    msgs_resp = supabase.table("messages").select(
        "role, content, created_at"
    ).eq("conversation_id", conversation_id).order("created_at").execute()

    # Get symptoms
    symptoms_resp = supabase.table("symptoms").select("*").eq(
        "conversation_id", conversation_id
    ).execute()

    # Get safety events for this conversation
    safety_resp = supabase.table("safety_events").select("*").eq(
        "conversation_id", conversation_id
    ).execute()

    return {
        "assessment": assessment,
        "conversation": conversation,
        "messages": msgs_resp.data or [],
        "symptoms": symptoms_resp.data or [],
        "safety_events": safety_resp.data or [],
    }


@router.post("/reviews/{assessment_id}")
async def submit_review(assessment_id: str, body: ReviewSubmission):
    """Submit a doctor review for an assessment."""
    reviewer_id = "00000000-0000-0000-0000-000000000000"

    # Update assessment with review
    update_data = {
        "reviewed_by": reviewer_id,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "metadata": {
            "review_verdict": body.verdict,
            "review_notes": body.notes,
        },
    }

    supabase.table("assessments").update(update_data).eq(
        "id", assessment_id
    ).execute()

    return {"status": "reviewed", "verdict": body.verdict}


@router.post("/evaluate")
async def run_evaluation_suite(
    category: str | None = Query(None, description="Run only this category"),
    limit: int = Query(0, description="Limit number of cases (0 = all)"),
):
    """Run the evaluation test suite against the AI system."""
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))
    from tests.evaluation.evaluator import load_test_cases, run_evaluation

    from app.ai.gemini import get_gemini_provider

    cases = load_test_cases()

    if category:
        cases = [c for c in cases if c["category"] == category]

    if limit > 0:
        cases = cases[:limit]

    if not cases:
        raise HTTPException(status_code=400, detail="No test cases match the criteria")

    provider = get_gemini_provider()

    async def send_message(message: str) -> str:
        return await provider.generate(
            system_prompt=(
                "You are a medical triage assistant. Based on the patient's symptoms, "
                "determine the urgency level and whether they need immediate medical attention. "
                "If it's an emergency, clearly say so. If it's self-care, say so."
            ),
            user_message=message,
            temperature=0.3,
            max_tokens=512,
        )

    report = await run_evaluation(send_message, cases)

    return {
        "total_cases": report.total_cases,
        "passed": report.passed,
        "failed": report.failed,
        "pass_rate": report.pass_rate,
        "emergency_recall": report.emergency_recall,
        "false_reassurance_rate": report.false_reassurance_rate,
        "escalation_accuracy": report.escalation_accuracy,
        "forbidden_violation_rate": report.forbidden_violation_rate,
        "avg_latency_ms": report.avg_latency_ms,
        "results_by_category": report.results_by_category,
    }


@router.post("/ingest-nfi")
async def ingest_nfi(
    pdf_path: str = Query(
        default="data/NFI_2011 (1).pdf",
        description="Path to NFI PDF file relative to project root",
    ),
):
    """Ingest the National Formulary of India PDF into the knowledge base."""
    from pathlib import Path

    from app.rag.nfi_ingestion import ingest_nfi_pdf

    full_path = Path(__file__).resolve().parent.parent.parent.parent / pdf_path
    if not full_path.exists():
        raise HTTPException(status_code=404, detail=f"PDF not found at: {full_path}")

    result = await ingest_nfi_pdf(str(full_path))
    return result


@router.get("/safety-events")
async def list_safety_events(
    limit: int = Query(50, le=200),
    severity: str | None = Query(None),
):
    """List recent safety events with optional filtering."""
    query = supabase.table("safety_events").select("*").order(
        "created_at", desc=True
    ).limit(limit)

    if severity:
        query = query.eq("severity", severity)

    response = query.execute()
    return response.data or []


# ── Helper Functions ─────────────────────────────────────────────────────────


async def _get_overview_stats(today_start: datetime, week_start: datetime) -> OverviewStats:
    """Get basic conversation/assessment counts."""
    # Total conversations
    total_conv = supabase.table("conversations").select(
        "id", count="exact"
    ).execute()

    # Today's conversations
    today_conv = supabase.table("conversations").select(
        "id", count="exact"
    ).gte("created_at", today_start.isoformat()).execute()

    # This week's conversations
    week_conv = supabase.table("conversations").select(
        "id", count="exact"
    ).gte("created_at", week_start.isoformat()).execute()

    # Total assessments
    total_assess = supabase.table("assessments").select(
        "id", count="exact"
    ).execute()

    # Total messages
    total_msgs = supabase.table("messages").select(
        "id", count="exact"
    ).execute()

    # Total users
    total_users = supabase.table("patients").select(
        "id", count="exact"
    ).execute()

    total_c = total_conv.count or 0
    total_m = total_msgs.count or 0
    avg_msgs = round(total_m / total_c, 1) if total_c > 0 else 0.0

    return OverviewStats(
        total_conversations=total_c,
        conversations_today=today_conv.count or 0,
        conversations_this_week=week_conv.count or 0,
        total_assessments=total_assess.count or 0,
        total_messages=total_m,
        avg_messages_per_conversation=avg_msgs,
        total_users=total_users.count or 0,
    )


async def _get_urgency_breakdown() -> UrgencyBreakdown:
    """Count assessments by risk level."""
    counts = {"low": 0, "medium": 0, "high": 0, "critical": 0}

    for level in counts:
        resp = supabase.table("assessments").select(
            "id", count="exact"
        ).eq("risk_level", level).execute()
        counts[level] = resp.count or 0

    return UrgencyBreakdown(**counts)


async def _get_safety_stats(today_start: datetime, week_start: datetime) -> SafetyStats:
    """Get safety event statistics."""
    total_resp = supabase.table("safety_events").select(
        "id", count="exact"
    ).execute()

    today_resp = supabase.table("safety_events").select(
        "id", count="exact"
    ).gte("created_at", today_start.isoformat()).execute()

    week_resp = supabase.table("safety_events").select(
        "id", count="exact"
    ).gte("created_at", week_start.isoformat()).execute()

    # Get all events for type/severity breakdown
    all_events = supabase.table("safety_events").select(
        "event_type, severity, description, created_at"
    ).order("created_at", desc=True).limit(100).execute()

    by_type: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    for event in all_events.data or []:
        et = event.get("event_type", "other")
        sev = event.get("severity", "low")
        by_type[et] = by_type.get(et, 0) + 1
        by_severity[sev] = by_severity.get(sev, 0) + 1

    recent = (all_events.data or [])[:10]

    return SafetyStats(
        total_events=total_resp.count or 0,
        events_today=today_resp.count or 0,
        events_this_week=week_resp.count or 0,
        by_type=by_type,
        by_severity=by_severity,
        recent_events=recent,
    )


async def _get_feedback_stats() -> FeedbackStats:
    """Get aggregated feedback statistics."""
    all_feedback = supabase.table("feedback").select("*").order(
        "created_at", desc=True
    ).limit(200).execute()

    data = all_feedback.data or []
    total = len(data)

    if total == 0:
        return FeedbackStats(
            total_feedback=0,
            avg_rating=None,
            helpful_percent=None,
            accurate_percent=None,
            recent_comments=[],
        )

    ratings = [f["rating"] for f in data if f.get("rating") is not None]
    helpful = [f["helpful"] for f in data if f.get("helpful") is not None]
    accurate = [f["accurate"] for f in data if f.get("accurate") is not None]

    avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else None
    helpful_pct = round(sum(helpful) / len(helpful) * 100, 1) if helpful else None
    accurate_pct = round(sum(accurate) / len(accurate) * 100, 1) if accurate else None

    recent_comments = [
        {"comment": f["comment"], "rating": f.get("rating"), "created_at": f["created_at"]}
        for f in data
        if f.get("comment")
    ][:10]

    return FeedbackStats(
        total_feedback=total,
        avg_rating=avg_rating,
        helpful_percent=helpful_pct,
        accurate_percent=accurate_pct,
        recent_comments=recent_comments,
    )


async def _get_model_stats() -> ModelStats:
    """Get AI model usage statistics."""
    ai_msgs = supabase.table("messages").select(
        "model_used, latency_ms", count="exact"
    ).eq("role", "assistant").not_.is_("model_used", "null").limit(500).execute()

    data = ai_msgs.data or []
    total = ai_msgs.count or 0

    latencies = [m["latency_ms"] for m in data if m.get("latency_ms")]
    avg_latency = round(sum(latencies) / len(latencies), 0) if latencies else None

    models_used: dict[str, int] = {}
    for m in data:
        model = m.get("model_used", "unknown")
        models_used[model] = models_used.get(model, 0) + 1

    return ModelStats(
        total_ai_messages=total,
        avg_latency_ms=avg_latency,
        models_used=models_used,
    )
