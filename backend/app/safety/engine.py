"""Deterministic Safety Engine.

Evaluates PatientState against all safety rules. This engine:
  - Runs WITHOUT any AI/LLM calls (pure deterministic logic)
  - Cannot be overridden by AI output
  - AI can escalate urgency but never downgrade it
  - Logs all triggered rules to the safety_events table
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from uuid import UUID

from app.services.patient_state import PatientState
from app.safety.rules import (
    EMERGENCY_RULES,
    URGENT_KEYWORD_RULES,
    URGENT_CONDITION_RULES,
    KeywordRule,
    ConditionRule,
)

logger = logging.getLogger(__name__)

URGENCY_LEVELS = {
    "SELF_CARE": 0,
    "ROUTINE": 1,
    "URGENT": 2,
    "EMERGENCY": 3,
}


@dataclass
class TriggeredRule:
    rule_id: str
    action: str
    description: str
    message: str


@dataclass
class SafetyResult:
    urgency: str = "ROUTINE"
    triggered_rules: list[TriggeredRule] = field(default_factory=list)
    emergency_message: str | None = None
    urgent_message: str | None = None

    @property
    def is_emergency(self) -> bool:
        return self.urgency == "EMERGENCY"

    @property
    def is_urgent(self) -> bool:
        return self.urgency in ("URGENT", "EMERGENCY")


class SafetyEngine:
    """Evaluates patient state against deterministic safety rules."""

    def evaluate(self, patient_state: PatientState) -> SafetyResult:
        """Run all safety rules against the current patient state.

        Returns a SafetyResult with the highest urgency found and all triggered rules.
        """
        result = SafetyResult()

        all_text = self._build_searchable_text(patient_state)

        # Check emergency keyword rules
        for rule in EMERGENCY_RULES:
            if self._keyword_matches(rule, all_text):
                triggered = TriggeredRule(
                    rule_id=rule.id,
                    action=rule.action,
                    description=rule.description,
                    message=rule.message,
                )
                result.triggered_rules.append(triggered)
                self._escalate(result, "EMERGENCY", rule.message)

        # Check urgent keyword rules
        for rule in URGENT_KEYWORD_RULES:
            if self._keyword_matches(rule, all_text):
                triggered = TriggeredRule(
                    rule_id=rule.id,
                    action=rule.action,
                    description=rule.description,
                    message=rule.message,
                )
                result.triggered_rules.append(triggered)
                self._escalate(result, "URGENT", rule.message)

        # Check urgent condition rules
        for rule in URGENT_CONDITION_RULES:
            if self._condition_matches(rule, patient_state):
                triggered = TriggeredRule(
                    rule_id=rule.id,
                    action=rule.action,
                    description=rule.description,
                    message=rule.message,
                )
                result.triggered_rules.append(triggered)
                self._escalate(result, "URGENT", rule.message)

        if result.triggered_rules:
            logger.info(
                "Safety engine triggered %d rule(s): urgency=%s, rules=%s",
                len(result.triggered_rules),
                result.urgency,
                [r.rule_id for r in result.triggered_rules],
            )

        return result

    def validate_ai_response(self, ai_urgency: str, safety_result: SafetyResult) -> str:
        """Ensure AI cannot downgrade a safety-determined urgency.

        AI can escalate (e.g., ROUTINE → URGENT) but never downgrade
        (e.g., EMERGENCY → ROUTINE).
        """
        ai_level = URGENCY_LEVELS.get(ai_urgency, 0)
        safety_level = URGENCY_LEVELS.get(safety_result.urgency, 0)

        if safety_level > ai_level:
            logger.warning(
                "AI tried to downgrade urgency from %s to %s — overriding to %s",
                safety_result.urgency,
                ai_urgency,
                safety_result.urgency,
            )
            return safety_result.urgency
        return ai_urgency

    # ── Private helpers ──────────────────────────────────────────────────────

    def _build_searchable_text(self, state: PatientState) -> str:
        """Combine all patient text into a single searchable string."""
        parts: list[str] = []

        if state.chief_complaint:
            parts.append(state.chief_complaint)

        for symptom in state.symptoms:
            parts.append(symptom.name)
            if symptom.description:
                parts.append(symptom.description)

        parts.extend(state.red_flags)
        parts.extend(state.chronic_conditions)

        return " ".join(parts).lower()

    def _keyword_matches(self, rule: KeywordRule, text: str) -> bool:
        """Check if any keyword from the rule appears in the text."""
        keyword_found = any(kw in text for kw in rule.keywords)

        if not keyword_found:
            return False

        if rule.require_modifier and rule.modifiers:
            return any(mod in text for mod in rule.modifiers)

        return True

    def _condition_matches(self, rule: ConditionRule, state: PatientState) -> bool:
        """Evaluate a condition-based rule against patient state."""
        try:
            return rule.check(state)
        except Exception as exc:
            logger.warning("Condition rule %s raised an error: %s", rule.id, exc)
            return False

    def _escalate(self, result: SafetyResult, level: str, message: str) -> None:
        """Escalate the result urgency if the new level is higher."""
        current = URGENCY_LEVELS.get(result.urgency, 0)
        new = URGENCY_LEVELS.get(level, 0)

        if new > current:
            result.urgency = level

        if level == "EMERGENCY" and result.emergency_message is None:
            result.emergency_message = message
        elif level == "URGENT" and result.urgent_message is None:
            result.urgent_message = message


# Module-level singleton
_engine: SafetyEngine | None = None


def get_safety_engine() -> SafetyEngine:
    global _engine
    if _engine is None:
        _engine = SafetyEngine()
    return _engine
