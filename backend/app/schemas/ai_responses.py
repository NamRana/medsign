"""Pydantic schemas for structured AI responses.

These are used by the interviewer and extractor agents to parse
model outputs into well-typed Python objects.
"""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


# ── Interviewer output ────────────────────────────────────────────────────────

class InterviewerResponse(BaseModel):
    """Structured response returned by the adaptive interviewer agent."""

    next_question: str = Field(
        description="The single follow-up question to ask the patient."
    )
    question_type: Literal[
        "chief_complaint",
        "duration",
        "severity",
        "associated_symptoms",
        "history",
        "vitals",
        "lifestyle",
        "emergency_check",
        "clarification",
    ] = Field(description="Category of the question being asked.")
    priority: int = Field(
        ge=1, le=10,
        description="Priority of this question (10 = must ask immediately, 1 = nice-to-have).",
    )
    information_needed: list[str] = Field(
        default_factory=list,
        description="List of information gaps this question addresses.",
    )
    extracted_symptoms: list[str] = Field(
        default_factory=list,
        description="Any symptoms identified from the most recent user message.",
    )
    extracted_info: dict[str, str] = Field(
        default_factory=dict,
        description="Key/value pairs of other information extracted from the user message.",
    )
    should_assess: bool = Field(
        default=False,
        description=(
            "True when enough information has been collected (typically after "
            "4–6 exchanges) and the session should move to the assessment phase."
        ),
    )
    is_emergency: bool = Field(
        default=False,
        description="True when emergency symptoms (chest pain, stroke signs, etc.) are detected.",
    )
    emergency_message: str | None = Field(
        default=None,
        description="Urgent safety message if is_emergency is True.",
    )


# ── Extractor output ──────────────────────────────────────────────────────────

class ExtractedSymptom(BaseModel):
    """A single symptom extracted from a user message."""

    name: str = Field(description="Canonical symptom name (e.g. 'headache').")
    severity: int | None = Field(
        default=None, ge=1, le=10,
        description="Self-reported severity on a 1–10 scale.",
    )
    duration_days: int | None = Field(
        default=None,
        description="How many days the symptom has been present.",
    )
    body_location: str | None = Field(
        default=None,
        description="Body part or region, if mentioned.",
    )
    onset_type: Literal["sudden", "gradual", "unknown"] | None = Field(
        default=None,
        description="How the symptom started.",
    )
    description: str | None = Field(
        default=None,
        description="Any additional descriptors the patient used.",
    )


class ExtractionResult(BaseModel):
    """All information extracted from a single user message."""

    symptoms: list[ExtractedSymptom] = Field(
        default_factory=list,
        description="Symptoms mentioned in the message.",
    )
    chief_complaint: str | None = Field(
        default=None,
        description="The patient's primary concern, if this is the first real message.",
    )
    age: int | None = Field(default=None, description="Patient's age if mentioned.")
    gender: str | None = Field(default=None, description="Patient's gender if mentioned.")
    chronic_conditions: list[str] = Field(
        default_factory=list,
        description="Chronic conditions mentioned (e.g. 'diabetes', 'hypertension').",
    )
    current_medications: list[str] = Field(
        default_factory=list,
        description="Medications mentioned.",
    )
    allergies: list[str] = Field(
        default_factory=list,
        description="Allergies mentioned.",
    )
    red_flags: list[str] = Field(
        default_factory=list,
        description=(
            "Any concerning symptoms that may indicate emergencies "
            "(e.g. 'chest pain', 'difficulty breathing', 'sudden vision loss')."
        ),
    )
    medicine_system: str | None = Field(
        default=None,
        description="Patient's preferred treatment system: 'allopathy' or 'homeopathy'.",
    )
