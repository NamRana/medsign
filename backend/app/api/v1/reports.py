"""Lab Reports API endpoints.

Upload lab report PDFs/images, trigger extraction, and retrieve results.
"""

from __future__ import annotations

import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.agents.lab_extractor import LabReportExtractor
from app.dependencies import supabase
from app.middleware.auth import get_current_user
from app.middleware.rate_limit import rate_limit_uploads
from app.services import billing_service, patient_service

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


async def _require_patient(user_id: UUID) -> UUID:
    """Return the user's patient profile, creating the default profile if needed."""
    patient = await patient_service.get_patient_by_user_id(user_id)
    if patient is None:
        from app.schemas.patients import PatientCreate

        patient = await patient_service.create_patient(user_id, PatientCreate())
    return patient.id


class LabValueResponse(BaseModel):
    id: str
    test_name: str
    value: str
    unit: str | None
    reference_range: str | None
    is_abnormal: bool | None
    abnormality_direction: str | None
    category: str | None


class LabInterpretationResponse(BaseModel):
    summary: str
    abnormal_findings: list[str]
    patient_friendly_explanation: str
    recommendations: list[str]


class LabReportResponse(BaseModel):
    id: str
    original_filename: str
    mime_type: str
    status: str
    report_date: str | None
    lab_name: str | None
    lab_address: str | None = None
    doctor_name: str | None = None
    created_at: str
    values: list[LabValueResponse]
    interpretation: LabInterpretationResponse | None


class LabReportListItem(BaseModel):
    id: str
    original_filename: str
    status: str
    report_date: str | None
    lab_name: str | None
    lab_address: str | None = None
    doctor_name: str | None = None
    created_at: str
    abnormal_count: int


@router.post("/upload", response_model=LabReportResponse, dependencies=[Depends(rate_limit_uploads)])
async def upload_lab_report(
    file: UploadFile = File(...),
    conversation_id: str | None = Form(None),
    user=Depends(get_current_user),
):
    """Upload a lab report PDF or image for extraction and interpretation."""
    limit_check = billing_service.check_limit(str(user.id), "lab_reports")
    if not limit_check["allowed"]:
        raise HTTPException(
            status_code=402,
            detail=f"Free limit reached ({limit_check['limit']} lab report/month). Upgrade to Pro for unlimited access.",
        )

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. "
                   f"Allowed: PDF, JPEG, PNG, WebP",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum 20 MB.")

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    report_id = str(uuid4())
    user_uuid = UUID(str(user.id))
    user_id = str(user_uuid)
    patient_id = await _require_patient(user_uuid)

    # Store original file in Supabase Storage
    storage_path = f"lab-reports/{user_id}/{report_id}/{file.filename}"
    try:
        supabase.storage.from_("medical-uploads").upload(
            storage_path,
            file_bytes,
            {"content-type": file.content_type},
        )
    except Exception as exc:
        logger.error("Failed to upload to storage: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to store file")

    # Create report record
    report_payload = {
        "id": report_id,
        "user_id": user_id,
        "patient_id": str(patient_id),
        "conversation_id": conversation_id,
        "original_filename": file.filename or "unknown",
        "storage_path": storage_path,
        "mime_type": file.content_type,
        "file_size_bytes": len(file_bytes),
        "status": "processing",
    }
    supabase.table("lab_reports").insert(report_payload).execute()

    # Run extraction pipeline
    extractor = LabReportExtractor()
    try:
        await extractor.process_report(
            report_id=report_id,
            file_bytes=file_bytes,
            mime_type=file.content_type,
            user_id=user_id,
        )
    except Exception as exc:
        logger.error("Extraction failed: %s", exc)
        # Report is already marked as failed in process_report

    # Record one usage event per upload. This remains active while
    # monetization is paused so we retain acquisition and capacity data.
    billing_service.increment_usage(user_id, "lab_reports")

    # Fetch the completed report with values and interpretation
    return await _get_report_response(report_id, user_id)


@router.get("", response_model=list[LabReportListItem])
async def list_lab_reports(user=Depends(get_current_user)):
    """List all lab reports for the current user."""
    user_id = str(user.id)

    response = supabase.table("lab_reports").select("*").eq(
        "user_id", user_id
    ).order("created_at", desc=True).execute()

    items = []
    for row in response.data or []:
        # Count abnormal values
        values_resp = supabase.table("lab_values").select("is_abnormal").eq(
            "report_id", row["id"]
        ).execute()
        abnormal_count = sum(1 for v in (values_resp.data or []) if v.get("is_abnormal"))

        items.append(LabReportListItem(
            id=row["id"],
            original_filename=row["original_filename"],
            status=row["status"],
            report_date=row.get("report_date"),
            lab_name=row.get("lab_name"),
            lab_address=row.get("lab_address"),
            doctor_name=row.get("doctor_name"),
            created_at=row["created_at"],
            abnormal_count=abnormal_count,
        ))

    return items


@router.get("/{report_id}", response_model=LabReportResponse)
async def get_lab_report(report_id: str, user=Depends(get_current_user)):
    """Get a specific lab report with extracted values and interpretation."""
    return await _get_report_response(report_id, str(user.id))


@router.delete("/{report_id}")
async def delete_lab_report(report_id: str, user=Depends(get_current_user)):
    """Delete a lab report and all associated data."""
    user_id = str(user.id)

    # Verify ownership
    response = supabase.table("lab_reports").select("storage_path").eq(
        "id", report_id
    ).eq("user_id", user_id).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Report not found")

    storage_path = response.data[0]["storage_path"]

    # Delete from storage
    try:
        supabase.storage.from_("medical-uploads").remove([storage_path])
    except Exception as exc:
        logger.warning("Failed to delete from storage: %s", exc)

    # Cascade delete handles lab_values and lab_interpretations
    supabase.table("lab_reports").delete().eq("id", report_id).eq("user_id", str(user.id)).execute()

    return {"status": "deleted", "id": report_id}


@router.get("/{report_id}/file", summary="Serve the original uploaded report file")
async def get_report_file(report_id: str, user=Depends(get_current_user)) -> Response:
    """Download the original lab report file (PDF/image) from storage."""
    user_id = str(user.id)

    resp = supabase.table("lab_reports").select(
        "storage_path, mime_type"
    ).eq("id", report_id).eq("user_id", user_id).execute()

    if not resp.data:
        raise HTTPException(status_code=404, detail="Report not found")

    row = resp.data[0]
    try:
        file_bytes = supabase.storage.from_("medical-uploads").download(row["storage_path"])
    except Exception as exc:
        logger.error("Storage download failed for report %s: %s", report_id, exc)
        raise HTTPException(status_code=502, detail="Failed to retrieve report file") from exc

    return Response(
        content=file_bytes,
        media_type=row["mime_type"],
        headers={"Cache-Control": "private, max-age=3600"},
    )


async def _get_report_response(report_id: str, user_id: str) -> LabReportResponse:
    """Build a full report response with values and interpretation."""
    report_resp = supabase.table("lab_reports").select("*").eq(
        "id", report_id
    ).eq("user_id", user_id).execute()
    if not report_resp.data:
        raise HTTPException(status_code=404, detail="Report not found")

    report = report_resp.data[0]

    # Fetch lab values
    values_resp = supabase.table("lab_values").select("*").eq(
        "report_id", report_id
    ).order("category").execute()

    values = [
        LabValueResponse(
            id=v["id"],
            test_name=v["test_name"],
            value=v["value"],
            unit=v.get("unit"),
            reference_range=v.get("reference_range"),
            is_abnormal=v.get("is_abnormal"),
            abnormality_direction=v.get("abnormality_direction"),
            category=v.get("category"),
        )
        for v in (values_resp.data or [])
    ]

    # Fetch interpretation
    interp_resp = supabase.table("lab_interpretations").select("*").eq(
        "report_id", report_id
    ).execute()

    interpretation = None
    if interp_resp.data:
        i = interp_resp.data[0]
        interpretation = LabInterpretationResponse(
            summary=i["summary"],
            abnormal_findings=i.get("abnormal_findings", []),
            patient_friendly_explanation=i["patient_friendly_explanation"],
            recommendations=i.get("recommendations", []),
        )

    return LabReportResponse(
        id=report["id"],
        original_filename=report["original_filename"],
        mime_type=report["mime_type"],
        status=report["status"],
        report_date=report.get("report_date"),
        lab_name=report.get("lab_name"),
        lab_address=report.get("lab_address"),
        doctor_name=report.get("doctor_name"),
        created_at=report["created_at"],
        values=values,
        interpretation=interpretation,
    )
