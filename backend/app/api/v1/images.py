"""Image Upload & Analysis API endpoints.

Images are scoped to the authenticated Supabase user.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from postgrest import APIError
from pydantic import BaseModel, Field

from app.agents.image_analyzer import ImageAnalysis, ImageAnalyzer
from app.dependencies import supabase
from app.middleware.auth import get_current_user
from app.middleware.rate_limit import rate_limit_uploads
from app.services import billing_service, conversation_service, patient_service
from app.services.patient_state import PatientState

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Constants ────────────────────────────────────────────────────────────────
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
STORAGE_BUCKET = "medical-uploads"
IMAGES_TABLE = "images"
MSG_TABLE = "messages"


# ── Response schemas ─────────────────────────────────────────────────────────


class ImageResponse(BaseModel):
    """Response model for an uploaded image with analysis."""

    id: UUID
    patient_id: UUID
    conversation_id: UUID
    storage_path: str
    mime_type: str
    analysis: ImageAnalysis | None = None
    consent: bool
    created_at: datetime | None = None


class ImageListResponse(BaseModel):
    """Response model for listing images."""

    id: UUID
    patient_id: UUID
    conversation_id: UUID
    storage_path: str
    mime_type: str
    analysis: ImageAnalysis | None = None
    consent: bool
    created_at: datetime | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _require_patient(user_id: UUID) -> UUID:
    """Return patient_id for user, raising 404 if no profile exists."""
    patient = await patient_service.get_patient_by_user_id(user_id)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile not found — create one first via POST /patients",
        )
    return patient.id


async def _verify_conversation_ownership(conversation_id: UUID, user_id: UUID) -> dict:
    """Verify the conversation belongs to the user and return its data."""
    try:
        conv_resp = (
            supabase.table("conversations")
            .select("*")
            .eq("id", str(conversation_id))
            .eq("user_id", str(user_id))
            .maybe_single()
            .execute()
        )
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {exc.message}",
        ) from exc

    if conv_resp.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    return conv_resp.data


def _get_patient_state_summary(conv_data: dict) -> str:
    """Extract patient state summary from conversation metadata."""
    metadata = conv_data.get("metadata") or {}
    state_data = metadata.get("patient_state")
    if state_data:
        try:
            state = PatientState.model_validate(state_data)
            return json.dumps(state.to_summary_dict(), indent=2)
        except Exception:
            pass
    return json.dumps({"note": "No patient context available yet"})


def _ext_from_mime(mime_type: str) -> str:
    """Return file extension for a given MIME type."""
    return {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }[mime_type]


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post(
    "/conversations/{conversation_id}/images",
    response_model=ImageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an image for analysis",
    dependencies=[Depends(rate_limit_uploads)],
)
async def upload_image(
    conversation_id: UUID,
    file: UploadFile,
    consent: bool = Form(...),
    user=Depends(get_current_user),
) -> ImageResponse:
    """Upload a medical image to a conversation for AI-powered visual analysis.

    Requires explicit consent. Accepts JPEG, PNG, or WebP images up to 10 MB.
    The image is stored securely and analyzed for visual observations (not diagnoses).
    """
    limit_check = billing_service.check_limit(str(user.id), "image_analyses")
    if not limit_check["allowed"]:
        raise HTTPException(
            status_code=402,
            detail=f"Free limit reached ({limit_check['limit']} image analysis/month). Upgrade to Pro for unlimited access.",
        )

    # ── Validate consent ─────────────────────────────────────────────────────
    if not consent:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Consent is required to upload medical images",
        )

    # ── Validate MIME type ───────────────────────────────────────────────────
    mime_type = file.content_type or ""
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {mime_type}. Allowed: jpeg, png, webp",
        )

    # ── Read and validate file size ──────────────────────────────────────────
    file_data = await file.read()
    if len(file_data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)} MB",
        )

    # ── Verify ownership ─────────────────────────────────────────────────────
    user_id = UUID(str(user.id))
    patient_id = await _require_patient(user_id)
    conv_data = await _verify_conversation_ownership(conversation_id, user_id)

    # ── Upload to Supabase Storage ───────────────────────────────────────────
    file_id = uuid4()
    ext = _ext_from_mime(mime_type)
    storage_path = f"{user_id}/{conversation_id}/{file_id}.{ext}"

    try:
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path=storage_path,
            file=file_data,
            file_options={"content-type": mime_type},
        )
    except Exception as exc:
        logger.error("Storage upload failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to upload image to storage",
        ) from exc

    # ── Save metadata to images table ────────────────────────────────────────
    image_record = {
        "id": str(file_id),
        "patient_id": str(patient_id),
        "conversation_id": str(conversation_id),
        "storage_path": storage_path,
        "mime_type": mime_type,
        "consent": consent,
    }

    try:
        insert_resp = supabase.table(IMAGES_TABLE).insert(image_record).execute()
    except APIError as exc:
        logger.error("Failed to save image metadata: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {exc.message}",
        ) from exc

    if not insert_resp.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save image metadata",
        )

    # ── Run image analysis ───────────────────────────────────────────────────
    analysis: ImageAnalysis | None = None
    try:
        patient_state_summary = _get_patient_state_summary(conv_data)
        analyzer = ImageAnalyzer()
        analysis = await analyzer.analyze(
            image_data=file_data,
            mime_type=mime_type,
            patient_state_summary=patient_state_summary,
        )

        # Save analysis result to images table
        supabase.table(IMAGES_TABLE).update(
            {"analysis": analysis.model_dump(mode="json")}
        ).eq("id", str(file_id)).execute()

    except Exception as exc:
        logger.error("Image analysis failed (non-fatal): %s", exc)
        # Analysis failure is non-fatal — the image is still saved

    # ── Save analysis as assistant message in conversation ────────────────────
    if analysis:
        analysis_text = _format_analysis_message(analysis)
        assistant_payload = {
            "conversation_id": str(conversation_id),
            "role": "assistant",
            "content": analysis_text,
            "content_type": "text",
            "metadata": {
                "source": "image_analysis",
                "image_id": str(file_id),
                "confidence": analysis.confidence,
                "analysis": analysis.model_dump(mode="json"),
                "image_storage_path": storage_path,
            },
        }
        try:
            supabase.table(MSG_TABLE).insert(assistant_payload).execute()
        except APIError as exc:
            logger.error("Failed to save analysis message: %s", exc)
            # Non-fatal — the analysis is still in the images table

    # ── Return response ──────────────────────────────────────────────────────
    billing_service.increment_usage(str(user.id), "image_analyses")
    saved_record = insert_resp.data[0]
    return ImageResponse(
        id=UUID(saved_record["id"]),
        patient_id=UUID(saved_record["patient_id"]),
        conversation_id=UUID(saved_record["conversation_id"]),
        storage_path=saved_record["storage_path"],
        mime_type=saved_record["mime_type"],
        analysis=analysis,
        consent=saved_record["consent"],
        created_at=saved_record.get("created_at"),
    )


@router.get(
    "/conversations/{conversation_id}/images",
    response_model=list[ImageListResponse],
    summary="List images in a conversation",
)
async def list_images(
    conversation_id: UUID, user=Depends(get_current_user)
) -> list[ImageListResponse]:
    """Return all images uploaded to a conversation, in chronological order."""
    # Verify ownership
    await _verify_conversation_ownership(conversation_id, UUID(str(user.id)))

    try:
        response = (
            supabase.table(IMAGES_TABLE)
            .select("*")
            .eq("conversation_id", str(conversation_id))
            .order("created_at", desc=False)
            .execute()
        )
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {exc.message}",
        ) from exc

    results: list[ImageListResponse] = []
    for row in response.data or []:
        analysis = None
        if row.get("analysis"):
            try:
                analysis = ImageAnalysis.model_validate(row["analysis"])
            except Exception:
                pass

        results.append(
            ImageListResponse(
                id=UUID(row["id"]),
                patient_id=UUID(row["patient_id"]),
                conversation_id=UUID(row["conversation_id"]),
                storage_path=row["storage_path"],
                mime_type=row["mime_type"],
                analysis=analysis,
                consent=row["consent"],
                created_at=row.get("created_at"),
            )
        )

    return results


@router.get(
    "/{image_id}/file",
    summary="Serve an uploaded image file",
)
async def get_image_file(
    image_id: UUID, user=Depends(get_current_user)
) -> Response:
    """Download an image file from storage. Verifies ownership via the images table."""
    try:
        img_resp = (
            supabase.table(IMAGES_TABLE)
            .select("storage_path, mime_type, conversation_id")
            .eq("id", str(image_id))
            .execute()
        )
    except APIError as exc:
        raise HTTPException(status_code=503, detail=f"Database error: {exc.message}") from exc

    if not img_resp.data:
        raise HTTPException(status_code=404, detail="Image not found")

    row = img_resp.data[0]
    await _verify_conversation_ownership(UUID(row["conversation_id"]), UUID(str(user.id)))

    try:
        file_bytes = supabase.storage.from_(STORAGE_BUCKET).download(row["storage_path"])
    except Exception as exc:
        logger.error("Storage download failed: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to retrieve image") from exc

    return Response(
        content=file_bytes,
        media_type=row["mime_type"],
        headers={"Cache-Control": "private, max-age=3600"},
    )


# ── Formatting helpers ───────────────────────────────────────────────────────


def _format_analysis_message(analysis: ImageAnalysis) -> str:
    """Format an ImageAnalysis into a readable assistant message."""
    lines: list[str] = []
    lines.append("**Image Analysis Results**\n")

    lines.append("**Visual Observations:**")
    for obs in analysis.visual_observations:
        lines.append(f"- {obs}")

    lines.append(f"\n**Possible Relevance:** {analysis.possible_relevance}")
    lines.append(f"\n**Confidence:** {analysis.confidence}")

    if analysis.limitations:
        lines.append("\n**Limitations:**")
        for lim in analysis.limitations:
            lines.append(f"- {lim}")

    lines.append(f"\n**Recommendation:** {analysis.recommendation}")

    lines.append(
        "\n---\n*Note: This is an automated visual observation, not a medical diagnosis. "
        "Please consult a healthcare professional for proper evaluation.*"
    )

    return "\n".join(lines)
