"""Deterministic safety rules for MedSign.

These rules CANNOT be overridden by AI. They run on PatientState using
simple keyword/condition matching — no LLM calls involved.

CLINICAL_REVIEW_REQUIRED: These rules need review by a qualified clinician
before production use.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from app.services.patient_state import PatientState


@dataclass(frozen=True)
class SafetyRule:
    id: str
    description: str
    action: str  # EMERGENCY | URGENT | ROUTINE
    message: str


@dataclass(frozen=True)
class KeywordRule(SafetyRule):
    keywords: tuple[str, ...]
    modifiers: tuple[str, ...] = ()
    require_modifier: bool = False


@dataclass(frozen=True)
class ConditionRule(SafetyRule):
    check: Callable[[PatientState], bool] = lambda _: False


# ─── EMERGENCY RED FLAGS ─────────────────────────────────────────────────────

EMERGENCY_RULES: list[KeywordRule] = [
    KeywordRule(
        id="chest_pain_acute",
        keywords=("chest pain", "chest tightness", "chest pressure", "chest heaviness"),
        modifiers=("sudden", "severe", "crushing", "squeezing", "radiating"),
        require_modifier=False,
        action="EMERGENCY",
        description="Acute chest pain — possible cardiac event",
        message=(
            "Based on what you've described, this could be a medical emergency. "
            "Please call emergency services (112) or go to the nearest hospital immediately. "
            "Do not wait."
        ),
    ),
    KeywordRule(
        id="breathing_severe",
        keywords=("can't breathe", "cannot breathe", "difficulty breathing", "severe breathlessness", "gasping"),
        modifiers=("sudden", "severe", "worsening", "at rest"),
        require_modifier=False,
        action="EMERGENCY",
        description="Severe breathing difficulty",
        message=(
            "Severe breathing difficulty requires immediate medical attention. "
            "Please call emergency services (112) or go to the nearest hospital now."
        ),
    ),
    KeywordRule(
        id="unconsciousness",
        keywords=("fainted", "lost consciousness", "blackout", "collapsed", "unresponsive"),
        action="EMERGENCY",
        description="Loss of consciousness",
        message=(
            "Loss of consciousness can indicate a serious condition. "
            "Please seek emergency medical care (112) immediately."
        ),
    ),
    KeywordRule(
        id="stroke_signs",
        keywords=("face drooping", "arm weakness", "speech difficulty", "sudden numbness", "slurred speech"),
        action="EMERGENCY",
        description="Possible stroke signs (FAST)",
        message=(
            "These symptoms may indicate a stroke. Time is critical. "
            "Please call emergency services (112) immediately. Remember FAST: "
            "Face drooping, Arm weakness, Speech difficulty, Time to call."
        ),
    ),
    KeywordRule(
        id="severe_bleeding",
        keywords=("bleeding heavily", "won't stop bleeding", "blood gushing", "hemorrhage"),
        action="EMERGENCY",
        description="Uncontrolled bleeding",
        message=(
            "Uncontrolled bleeding needs emergency care. Apply pressure to the wound "
            "and call emergency services (112) or go to the nearest hospital."
        ),
    ),
    KeywordRule(
        id="suicidal_ideation",
        keywords=("want to die", "kill myself", "end my life", "suicidal", "suicide"),
        action="EMERGENCY",
        description="Suicidal ideation detected",
        message=(
            "I hear that you're going through a very difficult time. Please reach out "
            "to a crisis helpline immediately:\n"
            "- Vandrevala Foundation: 1860-2662-345 (24/7)\n"
            "- iCall: 9152987821\n"
            "- AASRA: 9820466726\n\n"
            "You don't have to face this alone. Please talk to someone now."
        ),
    ),
    KeywordRule(
        id="seizure",
        keywords=("seizure", "convulsion", "fitting", "epileptic fit"),
        modifiers=("first time", "ongoing", "won't stop"),
        require_modifier=False,
        action="EMERGENCY",
        description="Seizure activity",
        message=(
            "A seizure requires immediate medical attention. "
            "Please call emergency services (112) or go to the nearest hospital."
        ),
    ),
    KeywordRule(
        id="severe_allergic_reaction",
        keywords=("throat swelling", "tongue swelling", "anaphylaxis", "can't swallow"),
        action="EMERGENCY",
        description="Possible anaphylaxis",
        message=(
            "A severe allergic reaction (anaphylaxis) is life-threatening. "
            "If you have an EpiPen, use it now. Call emergency services (112) immediately."
        ),
    ),
    KeywordRule(
        id="poisoning",
        keywords=("swallowed poison", "overdose", "took too many pills", "drank bleach", "poisoned"),
        action="EMERGENCY",
        description="Suspected poisoning or overdose",
        message=(
            "If you or someone has ingested a harmful substance, "
            "call the National Poison Information Centre: 1800-116-117 or "
            "go to the nearest hospital emergency immediately. "
            "Do not induce vomiting unless directed by a medical professional."
        ),
    ),
]

# ─── URGENT FLAGS ────────────────────────────────────────────────────────────

URGENT_KEYWORD_RULES: list[KeywordRule] = [
    KeywordRule(
        id="high_fever_reported",
        keywords=("very high fever", "104 fever", "105 fever", "fever won't come down"),
        action="URGENT",
        description="Very high fever reported verbally",
        message=(
            "A very high fever needs prompt medical attention. "
            "Please see a doctor within the next few hours."
        ),
    ),
    KeywordRule(
        id="blood_in_stool",
        keywords=("blood in stool", "bloody stool", "rectal bleeding", "black stool", "tarry stool"),
        action="URGENT",
        description="Blood in stool",
        message=(
            "Blood in stool should be evaluated by a doctor soon. "
            "Please schedule an appointment within 24 hours."
        ),
    ),
    KeywordRule(
        id="blood_in_urine",
        keywords=("blood in urine", "pink urine", "red urine", "hematuria"),
        action="URGENT",
        description="Blood in urine",
        message=(
            "Blood in urine should be evaluated by a doctor. "
            "Please see a healthcare provider within 24 hours."
        ),
    ),
    KeywordRule(
        id="severe_abdominal_pain",
        keywords=("severe abdominal pain", "severe stomach pain", "worst stomach pain"),
        modifiers=("sudden", "unbearable", "worst ever"),
        require_modifier=False,
        action="URGENT",
        description="Severe abdominal pain",
        message=(
            "Severe abdominal pain needs medical evaluation. "
            "Please see a doctor as soon as possible today."
        ),
    ),
    KeywordRule(
        id="head_injury",
        keywords=("hit my head", "head injury", "fell on head", "concussion"),
        action="URGENT",
        description="Recent head injury",
        message=(
            "Head injuries should be evaluated by a doctor, especially if you have "
            "headache, dizziness, nausea, or confusion. Please seek medical care today."
        ),
    ),
]

URGENT_CONDITION_RULES: list[ConditionRule] = [
    ConditionRule(
        id="high_fever_vitals",
        check=lambda state: (
            state.vitals.temperature_c is not None
            and state.vitals.temperature_c >= 39.5
        ),
        action="URGENT",
        description="Temperature >= 39.5°C (103°F)",
        message=(
            "A temperature of 39.5°C (103°F) or higher needs prompt medical attention. "
            "Please see a doctor today."
        ),
    ),
    ConditionRule(
        id="very_low_spo2",
        check=lambda state: (
            state.vitals.spo2_percent is not None
            and state.vitals.spo2_percent < 92
        ),
        action="URGENT",
        description="SpO2 below 92%",
        message=(
            "An oxygen saturation below 92% is concerning. "
            "Please seek medical attention promptly."
        ),
    ),
    ConditionRule(
        id="very_high_bp",
        check=lambda state: (
            state.vitals.systolic_bp is not None
            and state.vitals.systolic_bp >= 180
        ),
        action="URGENT",
        description="Systolic BP >= 180 mmHg",
        message=(
            "A blood pressure reading this high needs prompt medical evaluation. "
            "Please see a doctor today."
        ),
    ),
    ConditionRule(
        id="persistent_symptoms_14_days",
        check=lambda state: any(
            s.duration_days is not None and s.duration_days > 14
            for s in state.symptoms
        ),
        action="URGENT",
        description="Symptoms persisting beyond 14 days",
        message=(
            "Symptoms lasting more than two weeks should be evaluated by a doctor. "
            "Please schedule an appointment soon."
        ),
    ),
    ConditionRule(
        id="multiple_red_flags",
        check=lambda state: len(state.red_flags) >= 3,
        action="URGENT",
        description="Multiple red flags accumulated",
        message=(
            "Based on the combination of symptoms you've described, "
            "please see a doctor as soon as possible."
        ),
    ),
]
