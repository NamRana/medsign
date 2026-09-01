"""Lab Report Extractor Agent.

Extracts structured lab values from uploaded PDF/image lab reports
using Gemini vision (for images/scanned PDFs) or text extraction (for text PDFs).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, Field
from pypdf import PdfReader
from io import BytesIO

from app.ai.gemini import get_gemini_provider
from app.dependencies import supabase

logger = logging.getLogger(__name__)

_EXTRACTION_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "lab_extraction_v1.txt"
_INTERPRETATION_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "lab_interpretation_v1.txt"


class LabValue(BaseModel):
    test_name: str
    value: str
    unit: str | None = None
    reference_range: str | None = None
    is_abnormal: bool | None = None
    abnormality_direction: str | None = Field(None, pattern="^(high|low)$")
    category: str | None = None
    source_page: int | None = None


class LabExtractionResult(BaseModel):
    values: list[LabValue]
    report_date: str | None = None
    lab_name: str | None = None
    lab_address: str | None = None
    doctor_name: str | None = None
    patient_name_on_report: str | None = None


class LabInterpretation(BaseModel):
    summary: str
    abnormal_findings: list[str]
    patient_friendly_explanation: str
    recommendations: list[str]


class LabReportExtractor:
    """Extracts and interprets lab report values."""

    def __init__(self) -> None:
        self._extraction_prompt = _EXTRACTION_PROMPT_PATH.read_text(encoding="utf-8")
        self._interpretation_prompt = _INTERPRETATION_PROMPT_PATH.read_text(encoding="utf-8")

    async def extract(self, file_bytes: bytes, mime_type: str) -> LabExtractionResult:
        """Extract structured lab values from a report file."""
        provider = get_gemini_provider()

        if mime_type == "application/pdf":
            return await self._extract_from_pdf(file_bytes, provider)
        else:
            return await self._extract_from_image(file_bytes, mime_type, provider)

    async def _extract_from_pdf(self, file_bytes: bytes, provider) -> LabExtractionResult:
        """Extract from PDF — try text first, fall back to vision on each page."""
        reader = PdfReader(BytesIO(file_bytes))
        text_content = ""

        for i, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            if page_text.strip():
                text_content += f"\n--- Page {i + 1} ---\n{page_text}"

        if len(text_content.strip()) > 100:
            return await self._extract_from_text(text_content, provider)

        # Scanned PDF — use vision on first page image (simplified)
        # For production, render each page to image
        return await self._extract_from_image(file_bytes, "application/pdf", provider)

    async def _extract_from_text(self, text: str, provider) -> LabExtractionResult:
        """Extract lab values from text content using structured generation."""
        user_message = (
            f"Extract all lab values from this report:\n\n{text}\n\n"
            f"Respond with JSON matching this schema:\n"
            f"{json.dumps(LabExtractionResult.model_json_schema(), indent=2)}"
        )

        result = await provider.generate_structured(
            system_prompt=self._extraction_prompt,
            user_message=user_message,
            response_schema=LabExtractionResult,
            temperature=0.1,
            max_tokens=4096,
        )
        return result

    async def _extract_from_image(self, file_bytes: bytes, mime_type: str, provider) -> LabExtractionResult:
        """Extract lab values from an image using Gemini vision."""
        user_message = (
            f"Extract all lab values from this lab report image.\n\n"
            f"Respond ONLY with valid JSON matching this schema:\n"
            f"{json.dumps(LabExtractionResult.model_json_schema(), indent=2)}"
        )

        raw_response = await provider.analyze_image(
            system_prompt=self._extraction_prompt,
            user_message=user_message,
            image_data=file_bytes,
            mime_type=mime_type,
        )

        text = raw_response.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            text = text.rsplit("```", 1)[0]

        data = json.loads(text)
        return LabExtractionResult.model_validate(data)

    async def interpret(
        self,
        lab_values: list[LabValue],
        patient_context: str = "No additional patient context available.",
    ) -> LabInterpretation:
        """Generate a patient-friendly interpretation of lab values."""
        provider = get_gemini_provider()

        values_json = json.dumps([v.model_dump() for v in lab_values], indent=2)

        system_prompt = self._interpretation_prompt.replace(
            "{patient_context}", patient_context
        ).replace("{lab_values_json}", values_json)

        user_message = (
            f"Interpret these lab values and respond with JSON:\n"
            f"{json.dumps(LabInterpretation.model_json_schema(), indent=2)}"
        )

        result = await provider.generate_structured(
            system_prompt=system_prompt,
            user_message=user_message,
            response_schema=LabInterpretation,
            temperature=0.3,
            max_tokens=2048,
        )
        return result

    async def process_report(
        self,
        report_id: str,
        file_bytes: bytes,
        mime_type: str,
        user_id: str,
    ) -> dict:
        """Full pipeline: extract values, interpret, store in database."""
        try:
            extraction = await self.extract(file_bytes, mime_type)

            # Store extracted values
            for val in extraction.values:
                payload = {
                    "id": str(uuid4()),
                    "report_id": report_id,
                    "test_name": val.test_name,
                    "value": val.value,
                    "unit": val.unit,
                    "reference_range": val.reference_range,
                    "is_abnormal": val.is_abnormal,
                    "abnormality_direction": val.abnormality_direction,
                    "category": val.category,
                    "source_page": val.source_page,
                }
                supabase.table("lab_values").insert(payload).execute()

            # Generate interpretation only if values were extracted
            if extraction.values:
                interpretation = await self.interpret(extraction.values)

                interp_payload = {
                    "id": str(uuid4()),
                    "report_id": report_id,
                    "summary": interpretation.summary,
                    "abnormal_findings": interpretation.abnormal_findings,
                    "patient_friendly_explanation": interpretation.patient_friendly_explanation,
                    "recommendations": interpretation.recommendations,
                }
                supabase.table("lab_interpretations").insert(interp_payload).execute()

            # Update report metadata and status
            update_data: dict = {"status": "completed"}
            if extraction.report_date:
                update_data["report_date"] = extraction.report_date
            if extraction.lab_name:
                update_data["lab_name"] = extraction.lab_name
            if extraction.patient_name_on_report:
                update_data["patient_name_on_report"] = extraction.patient_name_on_report
            if extraction.doctor_name:
                update_data["doctor_name"] = extraction.doctor_name
            if extraction.lab_address:
                update_data["lab_address"] = extraction.lab_address

            supabase.table("lab_reports").update(update_data).eq("id", report_id).execute()

            return {
                "status": "completed",
                "values_extracted": len(extraction.values),
                "abnormal_count": sum(1 for v in extraction.values if v.is_abnormal),
            }

        except Exception as exc:
            logger.error("Lab report processing failed for %s: %s", report_id, exc)
            supabase.table("lab_reports").update({
                "status": "failed",
                "error_message": str(exc)[:500],
            }).eq("id", report_id).execute()
            raise
