"""Triage classification module.

Determines the appropriate care level based on safety evaluation and patient state.
This is deterministic — no AI calls.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from app.safety.engine import SafetyResult
from app.services.patient_state import PatientState


class TriageLevel(str, Enum):
    EMERGENCY = "EMERGENCY"
    URGENT = "URGENT"
    ROUTINE = "ROUTINE"
    SELF_CARE = "SELF_CARE"


@dataclass
class TriageResult:
    level: TriageLevel
    reasoning: str
    recommended_action: str
    timeframe: str


class TriageEngine:
    """Classifies patients into triage levels based on safety evaluation."""

    def classify(
        self,
        patient_state: PatientState,
        safety_result: SafetyResult,
    ) -> TriageResult:
        """Determine triage level from safety result and patient context."""

        if safety_result.is_emergency:
            return TriageResult(
                level=TriageLevel.EMERGENCY,
                reasoning=self._summarize_triggers(safety_result, "EMERGENCY"),
                recommended_action="Call emergency services (112) or visit nearest emergency room",
                timeframe="Immediately",
            )

        if safety_result.is_urgent:
            return TriageResult(
                level=TriageLevel.URGENT,
                reasoning=self._summarize_triggers(safety_result, "URGENT"),
                recommended_action="Visit a doctor or clinic",
                timeframe="Within 24 hours",
            )

        # Heuristic: if multiple symptoms with moderate severity, suggest routine visit
        moderate_symptoms = [
            s for s in patient_state.symptoms
            if s.severity is not None and s.severity >= 5
        ]
        if len(moderate_symptoms) >= 2:
            return TriageResult(
                level=TriageLevel.ROUTINE,
                reasoning="Multiple moderate symptoms reported",
                recommended_action="Schedule a doctor's appointment",
                timeframe="Within a few days",
            )

        # Single symptom with duration > 7 days
        long_symptoms = [
            s for s in patient_state.symptoms
            if s.duration_days is not None and s.duration_days > 7
        ]
        if long_symptoms:
            return TriageResult(
                level=TriageLevel.ROUTINE,
                reasoning="Symptoms persisting beyond one week",
                recommended_action="Schedule a doctor's appointment",
                timeframe="Within a week",
            )

        # Default: self-care
        return TriageResult(
            level=TriageLevel.SELF_CARE,
            reasoning="Symptoms appear manageable with self-care",
            recommended_action="Monitor symptoms and practice self-care",
            timeframe="See a doctor if symptoms worsen or persist beyond 7 days",
        )

    def _summarize_triggers(self, safety_result: SafetyResult, level: str) -> str:
        matching = [r for r in safety_result.triggered_rules if r.action == level]
        if not matching:
            return f"{level} level triggered"
        descriptions = [r.description for r in matching]
        return "; ".join(descriptions)


_triage: TriageEngine | None = None


def get_triage_engine() -> TriageEngine:
    global _triage
    if _triage is None:
        _triage = TriageEngine()
    return _triage
