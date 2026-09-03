"""Face Scan API — daily selfie wellness tracking."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from postgrest import APIError
from pydantic import BaseModel, Field

from app.agents.face_analyzer import FaceAnalysis, FaceAnalyzer
from app.ai.gemini import get_ai_provider
from app.dependencies import supabase
from app.middleware.auth import get_current_user
from app.middleware.rate_limit import rate_limit_uploads
from app.services import billing_service

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
STORAGE_BUCKET = "medical-uploads"
TABLE = "face_scans"


# ── Response schemas ─────────────────────────────────────────────────────────


class FaceScanResponse(BaseModel):
    id: str
    user_id: str
    family_member_id: str | None = None
    storage_path: str
    mime_type: str
    hair_health_score: int | None = None
    skin_quality_score: int | None = None
    stress_level_score: int | None = None
    sleep_quality_score: int | None = None
    overall_score: int | None = None
    analysis: FaceAnalysis | None = None
    scan_date: str
    notes: str | None = None
    created_at: str | None = None


class StreakInfo(BaseModel):
    current_streak: int = 0
    longest_streak: int = 0
    total_scans: int = 0


class TrendPoint(BaseModel):
    scan_date: str
    hair_health_score: int | None = None
    skin_quality_score: int | None = None
    stress_level_score: int | None = None
    sleep_quality_score: int | None = None
    overall_score: int | None = None


class FaceScanSummary(BaseModel):
    latest_scan: FaceScanResponse | None = None
    streak: StreakInfo
    trend: list[TrendPoint] = Field(default_factory=list)


class ProjectionMetric(BaseModel):
    current: int
    projected_positive: int
    projected_negative: int
    trend: str  # "improving", "stable", "declining"
    insight: str


class FutureProjection(BaseModel):
    hair_health: ProjectionMetric
    skin_quality: ProjectionMetric
    stress_level: ProjectionMetric
    sleep_quality: ProjectionMetric
    overall_current: int
    overall_projected_positive: int
    overall_projected_negative: int
    positive_narrative: str
    negative_narrative: str
    top_recommendation: str
    days_of_data: int
    generated_at: str


class ProjectionNarrative(BaseModel):
    """Schema for Gemini narrative generation."""
    positive_narrative: str
    negative_narrative: str
    top_recommendation: str


# ── Helpers ──────────────────────────────────────────────────────────────────


def _ext_from_mime(mime_type: str) -> str:
    return {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[mime_type]


def _compute_streaks(scan_dates: list[str]) -> StreakInfo:
    """Compute streak info from a sorted list of scan date strings (ascending)."""
    if not scan_dates:
        return StreakInfo()

    dates = sorted({date.fromisoformat(d) for d in scan_dates})
    total_scans = len(dates)

    # Calculate consecutive streaks
    streaks: list[int] = []
    current = 1
    for i in range(1, len(dates)):
        if (dates[i] - dates[i - 1]).days == 1:
            current += 1
        else:
            streaks.append(current)
            current = 1
    streaks.append(current)

    longest_streak = max(streaks)

    # Current streak: must include today or yesterday
    today = date.today()
    if dates[-1] < today - timedelta(days=1):
        current_streak = 0
    else:
        current_streak = 1
        for i in range(len(dates) - 2, -1, -1):
            if (dates[i + 1] - dates[i]).days == 1:
                current_streak += 1
            else:
                break

    return StreakInfo(
        current_streak=current_streak,
        longest_streak=longest_streak,
        total_scans=total_scans,
    )


def _get_previous_scan_summary(scans: list[dict]) -> str | None:
    """Build a summary string from the most recent previous scan."""
    if not scans:
        return None
    latest = scans[0]
    parts = [f"Previous scan ({latest['scan_date']}):"]
    if latest.get("hair_health_score") is not None:
        parts.append(f"  Hair: {latest['hair_health_score']}/100")
    if latest.get("skin_quality_score") is not None:
        parts.append(f"  Skin: {latest['skin_quality_score']}/100")
    if latest.get("stress_level_score") is not None:
        parts.append(f"  Stress: {latest['stress_level_score']}/100")
    if latest.get("sleep_quality_score") is not None:
        parts.append(f"  Sleep: {latest['sleep_quality_score']}/100")
    return "\n".join(parts)


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("", response_model=FaceScanResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit_uploads)])
async def upload_face_scan(
    file: UploadFile,
    notes: str | None = Query(default=None),
    family_member_id: str | None = Query(default=None),
    user=Depends(get_current_user),
) -> FaceScanResponse:
    """Upload a selfie for daily wellness face scan analysis."""
    limit_check = billing_service.check_limit(str(user.id), "face_scans")
    if not limit_check["allowed"]:
        raise HTTPException(
            status_code=402,
            detail=f"Free limit reached ({limit_check['limit']} face scans/month). Upgrade to Pro for unlimited access.",
        )

    user_id = str(user.id)
    today = date.today().isoformat()

    # Validate MIME type
    mime_type = file.content_type or ""
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {mime_type}. Allowed: jpeg, png, webp",
        )

    # Read and validate file size
    file_data = await file.read()
    if len(file_data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)} MB",
        )

    # Check for existing scan today — delete if exists (upsert behavior)
    try:
        existing = (
            supabase.table(TABLE)
            .select("id, storage_path")
            .eq("user_id", user_id)
            .eq("scan_date", today)
            .maybe_single()
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database error: {exc.message}") from exc

    if existing.data:
        # Remove old storage file and DB record
        old_path = existing.data["storage_path"]
        try:
            supabase.storage.from_(STORAGE_BUCKET).remove([old_path])
        except Exception as exc:
            logger.warning("Failed to remove old scan file: %s", exc)
        try:
            supabase.table(TABLE).delete().eq("id", existing.data["id"]).execute()
        except APIError as exc:
            logger.warning("Failed to delete old scan record: %s", exc)

    # Get previous scans for comparison context
    try:
        prev_resp = (
            supabase.table(TABLE)
            .select("scan_date, hair_health_score, skin_quality_score, stress_level_score, sleep_quality_score")
            .eq("user_id", user_id)
            .order("scan_date", desc=True)
            .limit(1)
            .execute()
        )
    except APIError:
        prev_resp = None

    previous_summary = _get_previous_scan_summary(prev_resp.data if prev_resp else [])

    # Upload to storage
    scan_id = uuid4()
    ext = _ext_from_mime(mime_type)
    storage_path = f"{user_id}/face-scans/{scan_id}.{ext}"

    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=file_data,
            file_options={"content-type": mime_type},
        )
    except Exception as exc:
        logger.error("Storage upload failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to upload image to storage") from exc

    # Run AI analysis
    analysis: FaceAnalysis | None = None
    try:
        analyzer = FaceAnalyzer()
        analysis = await analyzer.analyze(
            image_data=file_data,
            mime_type=mime_type,
            previous_scan_summary=previous_summary,
        )
    except Exception as exc:
        logger.error("Face analysis failed (non-fatal): %s", exc)

    # Build record
    record: dict = {
        "id": str(scan_id),
        "user_id": user_id,
        "storage_path": storage_path,
        "mime_type": mime_type,
        "scan_date": today,
        "notes": notes,
    }
    if family_member_id:
        record["family_member_id"] = family_member_id

    if analysis:
        record["hair_health_score"] = analysis.hair_health.score
        record["skin_quality_score"] = analysis.skin_quality.score
        record["stress_level_score"] = analysis.stress_level.score
        record["sleep_quality_score"] = analysis.sleep_quality.score
        record["overall_score"] = round(
            (analysis.hair_health.score + analysis.skin_quality.score
             + (100 - analysis.stress_level.score) + analysis.sleep_quality.score) / 4
        )
        record["analysis"] = analysis.model_dump(mode="json")

    # Insert to DB
    try:
        insert_resp = supabase.table(TABLE).insert(record).execute()
    except APIError as exc:
        logger.error("Failed to save face scan: %s", exc)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database error: {exc.message}") from exc

    if not insert_resp.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save face scan")

    saved = insert_resp.data[0]
    billing_service.increment_usage(user_id, "face_scans")
    return FaceScanResponse(**saved)


@router.get("", response_model=list[FaceScanResponse])
async def list_face_scans(
    days: int = Query(default=30, ge=1, le=365),
    user=Depends(get_current_user),
) -> list[FaceScanResponse]:
    """List face scans for the current user within the given day range."""
    user_id = str(user.id)
    since = (date.today() - timedelta(days=days)).isoformat()

    try:
        resp = (
            supabase.table(TABLE)
            .select("*")
            .eq("user_id", user_id)
            .gte("scan_date", since)
            .order("scan_date", desc=True)
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database error: {exc.message}") from exc

    return [FaceScanResponse(**row) for row in resp.data]


@router.get("/summary", response_model=FaceScanSummary)
async def get_face_scan_summary(user=Depends(get_current_user)) -> FaceScanSummary:
    """Return latest scan, streak info, and 30-day trend."""
    user_id = str(user.id)

    # Fetch all scan dates for streak calculation
    try:
        all_dates_resp = (
            supabase.table(TABLE)
            .select("scan_date")
            .eq("user_id", user_id)
            .order("scan_date", desc=False)
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database error: {exc.message}") from exc

    scan_dates = [row["scan_date"] for row in all_dates_resp.data]
    streak = _compute_streaks(scan_dates)

    # Fetch last 30 days for trend + latest
    since = (date.today() - timedelta(days=30)).isoformat()
    try:
        recent_resp = (
            supabase.table(TABLE)
            .select("*")
            .eq("user_id", user_id)
            .gte("scan_date", since)
            .order("scan_date", desc=True)
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database error: {exc.message}") from exc

    latest_scan = None
    trend: list[TrendPoint] = []

    if recent_resp.data:
        latest_scan = FaceScanResponse(**recent_resp.data[0])
        trend = [
            TrendPoint(
                scan_date=row["scan_date"],
                hair_health_score=row.get("hair_health_score"),
                skin_quality_score=row.get("skin_quality_score"),
                stress_level_score=row.get("stress_level_score"),
                sleep_quality_score=row.get("sleep_quality_score"),
                overall_score=row.get("overall_score"),
            )
            for row in reversed(recent_resp.data)
        ]

    return FaceScanSummary(latest_scan=latest_scan, streak=streak, trend=trend)


@router.get("/projection", response_model=FutureProjection)
async def get_future_projection(user=Depends(get_current_user)) -> FutureProjection:
    """Generate a 30-day future projection based on face scan trends."""
    user_id = str(user.id)

    # Fetch last 30 days of scans
    since = (date.today() - timedelta(days=30)).isoformat()
    try:
        resp = (
            supabase.table(TABLE)
            .select("scan_date, hair_health_score, skin_quality_score, stress_level_score, sleep_quality_score, overall_score")
            .eq("user_id", user_id)
            .gte("scan_date", since)
            .order("scan_date", desc=False)
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database error: {exc.message}") from exc

    scans = [row for row in resp.data if row.get("overall_score") is not None]
    days_of_data = len(scans)

    # Need at least 3 data points for meaningful projection
    if days_of_data < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Need at least 3 days of scan data for projection. Currently have {days_of_data}.",
        )

    # Calculate trends and projections for each metric
    def _calc_metric(scores: list[int | None], metric_name: str) -> ProjectionMetric:
        """Calculate trend and projections for a single metric."""
        valid = [s for s in scores if s is not None]
        if not valid:
            return ProjectionMetric(
                current=50, projected_positive=60, projected_negative=40,
                trend="stable", insight=f"Not enough {metric_name} data yet."
            )

        current = valid[-1]
        n = len(valid)

        # Simple linear regression slope
        if n >= 2:
            x_mean = (n - 1) / 2
            y_mean = sum(valid) / n
            numerator = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(valid))
            denominator = sum((i - x_mean) ** 2 for i in range(n))
            slope = numerator / denominator if denominator != 0 else 0
        else:
            slope = 0

        # Determine trend
        if slope > 1.0:
            trend = "improving"
        elif slope < -1.0:
            trend = "declining"
        else:
            trend = "stable"

        # Project 30 days forward
        # Positive path: extrapolate improvement or maintain current + boost
        positive_delta = max(abs(slope) * 15, 5)  # At least 5-point improvement
        projected_positive = min(95, int(current + positive_delta))

        # Negative path: extrapolate decline or current - drop
        negative_delta = max(abs(slope) * 10, 8)  # At least 8-point decline
        projected_negative = max(15, int(current - negative_delta))

        # Generate simple insight
        if trend == "improving":
            insight = f"Your {metric_name.replace('_', ' ')} has been trending up — great momentum!"
        elif trend == "declining":
            insight = f"Your {metric_name.replace('_', ' ')} could use some attention this week."
        else:
            insight = f"Your {metric_name.replace('_', ' ')} is holding steady."

        return ProjectionMetric(
            current=current,
            projected_positive=projected_positive,
            projected_negative=projected_negative,
            trend=trend,
            insight=insight,
        )

    hair_scores = [s.get("hair_health_score") for s in scans]
    skin_scores = [s.get("skin_quality_score") for s in scans]
    stress_scores = [s.get("stress_level_score") for s in scans]
    sleep_scores = [s.get("sleep_quality_score") for s in scans]

    hair = _calc_metric(hair_scores, "hair_health")
    skin = _calc_metric(skin_scores, "skin_quality")
    stress = _calc_metric(stress_scores, "stress_level")
    sleep = _calc_metric(sleep_scores, "sleep_quality")

    # Overall projections
    overall_scores = [s.get("overall_score") for s in scans]
    valid_overall = [s for s in overall_scores if s is not None]
    overall_current = valid_overall[-1] if valid_overall else 50
    overall_positive = min(95, round((hair.projected_positive + skin.projected_positive + (100 - stress.projected_negative) + sleep.projected_positive) / 4))
    overall_negative = max(15, round((hair.projected_negative + skin.projected_negative + (100 - stress.projected_positive) + sleep.projected_negative) / 4))

    # Generate narratives using Gemini
    prompt_path = Path(__file__).resolve().parent.parent.parent / "prompts" / "future_projection_v1.txt"
    system_prompt = prompt_path.read_text()

    user_context = (
        f"User's scan data ({days_of_data} days):\n"
        f"- Hair Health: current={hair.current}, trend={hair.trend}\n"
        f"- Skin Quality: current={skin.current}, trend={skin.trend}\n"
        f"- Stress Level: current={stress.current}, trend={stress.trend} (higher=more stressed)\n"
        f"- Sleep Quality: current={sleep.current}, trend={sleep.trend}\n"
        f"- Overall: current={overall_current}\n"
        f"\nProjected positive scores: hair={hair.projected_positive}, skin={skin.projected_positive}, "
        f"stress={stress.projected_positive}, sleep={sleep.projected_positive}\n"
        f"Projected negative scores: hair={hair.projected_negative}, skin={skin.projected_negative}, "
        f"stress={stress.projected_negative}, sleep={sleep.projected_negative}\n"
    )

    try:
        gemini = get_ai_provider()
        narrative = await gemini.generate_structured(
            system_prompt=system_prompt,
            user_message=user_context,
            response_schema=ProjectionNarrative,
            temperature=0.7,
            max_tokens=512,
        )
        positive_narrative = narrative.positive_narrative
        negative_narrative = narrative.negative_narrative
        top_recommendation = narrative.top_recommendation
    except Exception as exc:
        logger.error("Failed to generate projection narratives: %s", exc)
        # Fallback narratives
        positive_narrative = "You're building great momentum. Keep showing up for yourself daily — your consistency is already paying off in visible ways."
        negative_narrative = "Life gets busy, but your recent progress is worth protecting. A few missed days won't undo everything, but staying consistent keeps your glow going."
        top_recommendation = "Take 5 minutes today for a mindful skincare routine — it's a small act that reinforces your daily wellness habit."

    return FutureProjection(
        hair_health=hair,
        skin_quality=skin,
        stress_level=stress,
        sleep_quality=sleep,
        overall_current=overall_current,
        overall_projected_positive=overall_positive,
        overall_projected_negative=overall_negative,
        positive_narrative=positive_narrative,
        negative_narrative=negative_narrative,
        top_recommendation=top_recommendation,
        days_of_data=days_of_data,
        generated_at=datetime.utcnow().isoformat(),
    )


@router.get("/{scan_id}", response_model=FaceScanResponse)
async def get_face_scan(scan_id: str, user=Depends(get_current_user)) -> FaceScanResponse:
    """Get a specific face scan by ID."""
    user_id = str(user.id)

    try:
        resp = (
            supabase.table(TABLE)
            .select("*")
            .eq("id", scan_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database error: {exc.message}") from exc

    if not resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Face scan not found")

    return FaceScanResponse(**resp.data)


@router.get("/{scan_id}/file")
async def get_face_scan_file(scan_id: str, user=Depends(get_current_user)) -> Response:
    """Download the face scan photo. Verifies ownership."""
    user_id = str(user.id)
    try:
        resp = (
            supabase.table(TABLE)
            .select("storage_path, mime_type")
            .eq("id", scan_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status_code=503, detail=f"Database error: {exc.message}") from exc

    if not resp.data:
        raise HTTPException(status_code=404, detail="Face scan not found")

    try:
        file_bytes = supabase.storage.from_(STORAGE_BUCKET).download(resp.data["storage_path"])
    except Exception as exc:
        logger.error("Storage download failed for face scan %s: %s", scan_id, exc)
        raise HTTPException(status_code=502, detail="Failed to retrieve image") from exc

    return Response(
        content=file_bytes,
        media_type=resp.data.get("mime_type", "image/jpeg"),
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.delete("/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_face_scan(scan_id: str, user=Depends(get_current_user)):
    """Delete a face scan and its storage file."""
    user_id = str(user.id)

    try:
        resp = (
            supabase.table(TABLE)
            .select("id, storage_path")
            .eq("id", scan_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database error: {exc.message}") from exc

    if not resp.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Face scan not found")

    # Remove storage file
    try:
        supabase.storage.from_(STORAGE_BUCKET).remove([resp.data["storage_path"]])
    except Exception as exc:
        logger.warning("Failed to remove scan file from storage: %s", exc)

    # Delete DB record
    try:
        supabase.table(TABLE).delete().eq("id", scan_id).eq("user_id", str(user.id)).execute()
    except APIError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database error: {exc.message}") from exc
