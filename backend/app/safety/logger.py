"""Safety event logging — persists triggered safety rules to the database."""

from __future__ import annotations

import logging
from uuid import UUID

from app.dependencies import supabase
from app.safety.engine import SafetyResult

logger = logging.getLogger(__name__)

SAFETY_EVENTS_TABLE = "safety_events"


def log_safety_event(
    conversation_id: UUID,
    safety_result: SafetyResult,
) -> None:
    """Write all triggered rules to the safety_events table.

    Non-fatal: logs errors but never raises.
    """
    if not safety_result.triggered_rules:
        return

    rows = [
        {
            "conversation_id": str(conversation_id),
            "rule": rule.rule_id,
            "severity": rule.action,
            "action": rule.message[:500],
        }
        for rule in safety_result.triggered_rules
    ]

    try:
        supabase.table(SAFETY_EVENTS_TABLE).insert(rows).execute()
        logger.info(
            "Logged %d safety event(s) for conversation %s",
            len(rows),
            conversation_id,
        )
    except Exception as exc:
        logger.error("Failed to log safety events: %s", exc)
