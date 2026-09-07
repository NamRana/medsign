"""PatientState — an in-memory model that accumulates collected information
during a single AI health-assessment conversation.

This is intentionally a plain dataclass/Pydantic model, not a DB model.
The AI agent builds and mutates a PatientState instance as the user responds
to questions, and persists the final snapshot to the DB when the conversation
ends.
"""

from __future__ import annotations

from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class SymptomSeverity(int, Enum):
    MILD = 1
    MODERATE = 5
    SEVERE = 8
    CRITICAL = 10


class CollectedSymptom(BaseModel):
    name: str
    severity: int | None = None          # 1–10
    duration_days: int | None = None
    description: str | None = None
    body_location: str | None = None
    onset_type: str | None = None        # sudden | gradual | unknown
    aggravating_factors: list[str] = Field(default_factory=list)
    relieving_factors: list[str] = Field(default_factory=list)


class CollectedVitals(BaseModel):
    temperature_c: float | None = None
    systolic_bp: int | None = None
    diastolic_bp: int | None = None
    heart_rate: int | None = None
    respiratory_rate: int | None = None
    spo2_percent: float | None = None
    weight_kg: float | None = None
    height_cm: float | None = None


class PatientState(BaseModel):
    """Tracks everything the AI has learned about the patient so far."""

    # Identifiers (set when a conversation is loaded)
    conversation_id: UUID | None = None
    patient_id: UUID | None = None
    user_id: UUID | None = None

    # ── Demographics (may already exist in patients table) ──────────────────
    age: int | None = None
    gender: str | None = None
    location: str | None = None
    country: str = "India"
    language: str = "en"

    # ── Chief complaint ──────────────────────────────────────────────────────
    chief_complaint: str | None = None

    # ── Collected symptoms ───────────────────────────────────────────────────
    symptoms: list[CollectedSymptom] = Field(default_factory=list)

    # ── Vitals (self-reported) ───────────────────────────────────────────────
    vitals: CollectedVitals = Field(default_factory=CollectedVitals)

    # ── Medical history ──────────────────────────────────────────────────────
    allergies: list[str] = Field(default_factory=list)
    chronic_conditions: list[str] = Field(default_factory=list)
    current_medications: list[str] = Field(default_factory=list)
    family_history: list[str] = Field(default_factory=list)

    # ── Treatment preference ────────────────────────────────────────────────
    medicine_system: str | None = None  # allopathy | homeopathy (None = not yet asked)

    # ── Risk flags ───────────────────────────────────────────────────────────
    red_flags: list[str] = Field(default_factory=list)
    risk_level: str | None = None  # low | medium | high | critical

    # ── Conversation progress ────────────────────────────────────────────────
    questions_asked: list[str] = Field(default_factory=list)
    info_gaps: list[str] = Field(default_factory=list)   # still-needed info
    is_complete: bool = False

    # ── Arbitrary extra state the AI wants to track ──────────────────────────
    extra: dict[str, Any] = Field(default_factory=dict)

    # ── Helpers ──────────────────────────────────────────────────────────────

    def add_symptom(self, symptom: CollectedSymptom) -> None:
        """Add or update a symptom (deduplicates by name, case-insensitive)."""
        name_lower = symptom.name.lower()
        for i, s in enumerate(self.symptoms):
            if s.name.lower() == name_lower:
                self.symptoms[i] = symptom
                return
        self.symptoms.append(symptom)

    def mark_complete(self) -> None:
        self.is_complete = True

    def enrich_from_profile(
        self,
        date_of_birth: Any | None = None,
        gender: str | None = None,
        allergies: list[str] | None = None,
        chronic_conditions: list[str] | None = None,
        current_medications: list[str] | None = None,
        location_city: str | None = None,
        location_state: str | None = None,
        location_country: str | None = None,
    ) -> None:
        """Merge patient profile data without overwriting chat-extracted values."""
        if self.age is None and date_of_birth is not None:
            from datetime import date
            if isinstance(date_of_birth, str):
                date_of_birth = date.fromisoformat(date_of_birth)
            today = date.today()
            age = today.year - date_of_birth.year
            if (today.month, today.day) < (date_of_birth.month, date_of_birth.day):
                age -= 1
            self.age = age
        if self.gender is None and gender and gender != "prefer_not_to_say":
            self.gender = gender
        if not self.allergies and allergies:
            self.allergies = allergies
        if not self.chronic_conditions and chronic_conditions:
            self.chronic_conditions = chronic_conditions
        if not self.current_medications and current_medications:
            self.current_medications = current_medications
        if self.location is None and (location_city or location_state):
            parts = [p for p in (location_city, location_state) if p]
            self.location = ", ".join(parts)
        if location_country:
            self.country = location_country

    def to_summary_dict(self) -> dict[str, Any]:
        """Return a concise dict suitable for the AI prompt context."""
        return {
            "chief_complaint": self.chief_complaint,
            "age": self.age,
            "gender": self.gender,
            "language": self.language,
            "country": self.country,
            "location": self.location,
            "symptoms": [s.model_dump(exclude_none=True) for s in self.symptoms],
            "vitals": self.vitals.model_dump(exclude_none=True),
            "allergies": self.allergies,
            "chronic_conditions": self.chronic_conditions,
            "current_medications": self.current_medications,
            "medicine_system": self.medicine_system,
            "red_flags": self.red_flags,
            "risk_level": self.risk_level,
            "info_gaps": self.info_gaps,
        }
