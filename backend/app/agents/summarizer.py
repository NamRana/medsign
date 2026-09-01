"""Doctor Summary Generator.

Produces structured, clinical summaries from conversation data.
Designed for healthcare professionals — factual, no AI opinions.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import BaseModel, Field

from app.ai.gemini import get_gemini_provider
from app.dependencies import supabase

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "doctor_summary_v1.txt"


class DoctorSummary(BaseModel):
    patient_demographics: str = ""
    chief_complaint: str = ""
    history_of_present_illness: str = ""
    symptoms: list[str] = Field(default_factory=list)
    relevant_history: str = ""
    vitals: str = ""
    lab_findings: str = ""
    image_observations: str = ""
    safety_flags: list[str] = Field(default_factory=list)
    assessment_summary: str = ""


class DoctorSummarizer:
    """Generates doctor-ready clinical summaries."""

    def __init__(self) -> None:
        self._prompt_template = _PROMPT_PATH.read_text(encoding="utf-8")

    async def generate(self, conversation_id: str) -> DoctorSummary:
        """Generate a doctor-ready summary for a conversation."""
        data = await self._gather_data(conversation_id)
        provider = get_gemini_provider()

        system_prompt = self._prompt_template.replace(
            "{conversation_data}", json.dumps(data, indent=2, default=str)
        )

        user_message = (
            "Generate a structured clinical summary. Respond with JSON matching:\n"
            f"{json.dumps(DoctorSummary.model_json_schema(), indent=2)}"
        )

        result = await provider.generate_structured(
            system_prompt=system_prompt,
            user_message=user_message,
            response_schema=DoctorSummary,
            temperature=0.2,
            max_tokens=2048,
        )
        return result

    async def _gather_data(self, conversation_id: str) -> dict:
        """Collect all relevant data for the summary."""
        # Conversation metadata
        conv_resp = supabase.table("conversations").select("*").eq(
            "id", conversation_id
        ).execute()
        conversation = conv_resp.data[0] if conv_resp.data else {}

        # Messages
        msgs_resp = supabase.table("messages").select(
            "role, content, created_at"
        ).eq("conversation_id", conversation_id).order("created_at").execute()

        # Patient info
        patient_id = conversation.get("patient_id")
        patient = {}
        if patient_id:
            pat_resp = supabase.table("patients").select(
                "full_name, date_of_birth, gender, location_city, location_state, "
                "allergies, chronic_conditions, current_medications"
            ).eq("id", patient_id).execute()
            patient = pat_resp.data[0] if pat_resp.data else {}

        # Symptoms
        symptoms_resp = supabase.table("symptoms").select("*").eq(
            "conversation_id", conversation_id
        ).execute()

        # Vitals
        vitals_resp = supabase.table("vitals").select("*").eq(
            "conversation_id", conversation_id
        ).execute()

        # Assessment
        assess_resp = supabase.table("assessments").select("*").eq(
            "conversation_id", conversation_id
        ).execute()

        # Safety events
        safety_resp = supabase.table("safety_events").select("*").eq(
            "conversation_id", conversation_id
        ).execute()

        # Lab reports linked to this conversation
        labs_resp = supabase.table("lab_reports").select("*").eq(
            "conversation_id", conversation_id
        ).execute()

        lab_values = []
        for lab in labs_resp.data or []:
            vals_resp = supabase.table("lab_values").select("*").eq(
                "report_id", lab["id"]
            ).execute()
            lab_values.extend(vals_resp.data or [])

        return {
            "conversation": conversation,
            "patient": patient,
            "messages": msgs_resp.data or [],
            "symptoms": symptoms_resp.data or [],
            "vitals": vitals_resp.data or [],
            "assessment": assess_resp.data[0] if assess_resp.data else None,
            "safety_events": safety_resp.data or [],
            "lab_values": lab_values,
        }
