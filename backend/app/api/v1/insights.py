"""Health Insights API — aggregates health records into a unified analytics view.

The longevity section deliberately provides preventive-health signals rather
than an individual life-expectancy or mortality prediction.  The data collected
by this endpoint has not been clinically validated for that use.
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.dependencies import supabase
from app.middleware.auth import get_current_user
from app.middleware.family_scope import resolve_patient_id

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Response Models ──────────────────────────────────────────────────────────


class ConditionEntry(BaseModel):
    name: str
    probability: float | None = None
    first_seen: str
    last_seen: str
    occurrences: int
    risk_level: str | None = None


class TimelineEvent(BaseModel):
    date: str
    type: str  # assessment | lab_report | symptom
    title: str
    risk_level: str | None = None
    detail: str | None = None


class LabTrend(BaseModel):
    test_name: str
    category: str | None = None
    readings: list[dict]  # [{date, value, unit, is_abnormal}]


class RiskFactor(BaseModel):
    factor: str
    severity: str  # low | medium | high
    source: str
    recommendation: str


class BodySystemDetail(BaseModel):
    text: str
    source: str  # symptom | condition | image
    severity: str = "info"

class BodySystemScore(BaseModel):
    system: str
    score: int  # 0-100
    issues: int
    trend: str  # improving | stable | declining
    details: list[BodySystemDetail] = []


class PreventiveHealthSignal(BaseModel):
    """A factual, record-derived prompt for preventive follow-up.

    This model intentionally does not make a diagnostic, prognostic, or
    life-expectancy claim.
    """

    title: str
    severity: Literal["info", "attention", "high"]
    detail: str
    recommendation: str
    source: str


class LongevityDataCoverage(BaseModel):
    """Record counts shown for transparency in the non-predictive overview.

    Wellness face scans are reported separately and are not used to produce
    preventive-health signals.
    """

    assessment_count: int
    lab_report_count: int
    abnormal_lab_value_count: int
    symptom_count: int
    image_analysis_count: int
    face_scan_count: int
    summary: str


class LongevityOutlook(BaseModel):
    """Non-predictive longevity and preventive-health context for the UI."""

    title: str
    status: Literal["informational_only"]
    personal_estimate_available: Literal[False]
    preventive_signals: list[PreventiveHealthSignal]
    data_coverage: LongevityDataCoverage
    methodology: str
    source_label: str
    source_version: str
    reference_source_label: str
    reference_source_version: str
    reference_url: str
    reference_note: str
    disclaimer: str


class DoctorEntry(BaseModel):
    name: str
    reports_count: int
    labs: list[str]
    last_visited: str


class LabEntry(BaseModel):
    name: str
    address: str | None = None
    reports_count: int
    last_visited: str


class FaceScanScoreEntry(BaseModel):
    date: str
    overall: float | None = None
    hair_health: float | None = None
    skin_quality: float | None = None
    stress_level: float | None = None
    sleep_quality: float | None = None


class HealthInsights(BaseModel):
    health_score: int  # 0-100
    total_assessments: int
    total_conditions: int
    total_symptoms_reported: int
    total_lab_reports: int
    total_abnormal_values: int
    total_image_analyses: int
    image_severity_distribution: dict[str, int]
    total_face_scans: int
    face_scan_scores: list[FaceScanScoreEntry]
    face_scan_avg_score: float | None
    face_scan_streak: int
    risk_distribution: dict[str, int]  # {low: N, medium: N, high: N, critical: N}
    conditions: list[ConditionEntry]
    timeline: list[TimelineEvent]
    lab_trends: list[LabTrend]
    risk_factors: list[RiskFactor]
    body_systems: list[BodySystemScore]
    longevity_outlook: LongevityOutlook
    monthly_activity: list[dict]  # [{month, assessments, lab_reports, image_analyses, face_scans}]
    doctors: list[DoctorEntry]
    labs: list[LabEntry]


# ── Helper Functions ─────────────────────────────────────────────────────────

BODY_SYSTEM_MAPPING = {
    "headache": "Neurological",
    "migraine": "Neurological",
    "dizziness": "Neurological",
    "chest pain": "Cardiovascular",
    "hypertension": "Cardiovascular",
    "heart": "Cardiovascular",
    "palpitation": "Cardiovascular",
    "cough": "Respiratory",
    "breathing": "Respiratory",
    "asthma": "Respiratory",
    "cold": "Respiratory",
    "stomach": "Digestive",
    "nausea": "Digestive",
    "diarrhea": "Digestive",
    "acid reflux": "Digestive",
    "diabetes": "Endocrine",
    "thyroid": "Endocrine",
    "joint": "Musculoskeletal",
    "back pain": "Musculoskeletal",
    "arthritis": "Musculoskeletal",
    "skin": "Dermatological",
    "rash": "Dermatological",
    "anxiety": "Mental Health",
    "depression": "Mental Health",
    "stress": "Mental Health",
    "insomnia": "Mental Health",
    "fever": "Immune System",
    "infection": "Immune System",
    "allergy": "Immune System",
    "kidney": "Renal",
    "urinary": "Renal",
    "liver": "Hepatic",
    "eye": "Ophthalmological",
    "ear": "ENT",
    "throat": "ENT",
}

def classify_body_system(text: str) -> str:
    text_lower = text.lower()
    for keyword, system in BODY_SYSTEM_MAPPING.items():
        if keyword in text_lower:
            return system
    return "General"


def calculate_health_score(
    risk_dist: dict[str, int],
    total_abnormal: int,
    total_assessments: int,
    image_severity: dict[str, int] | None = None,
) -> int:
    if total_assessments == 0 and not image_severity:
        return 92

    score = 95.0
    total_rated = sum(risk_dist.values()) or 1

    critical_pct = risk_dist.get("critical", 0) / total_rated
    high_pct = risk_dist.get("high", 0) / total_rated
    medium_pct = risk_dist.get("medium", 0) / total_rated

    score -= critical_pct * 25
    score -= high_pct * 15
    score -= medium_pct * 8

    score -= min(total_abnormal * 0.5, 5)

    if image_severity:
        score -= min(image_severity.get("severe", 0) * 3, 8)
        score -= min(image_severity.get("moderate", 0) * 1.5, 5)

    return max(75, min(98, int(score)))


def _scope_face_scans_query(query, *, user_id: str, member_id: str | None):
    """Keep wellness-face-scan records within the active profile.

    A null ``family_member_id`` represents the account holder's own scan.
    Older scans have no family member attached, so they remain visible only on
    the account holder's profile instead of being included in every family
    member's Insights view.
    """

    query = query.eq("user_id", user_id)
    if member_id:
        return query.eq("family_member_id", member_id)
    return query.is_("family_member_id", "null")


def build_longevity_outlook(
    risk_factors: list[RiskFactor],
    conditions: list[ConditionEntry],
    *,
    assessment_count: int,
    lab_report_count: int,
    abnormal_lab_value_count: int,
    symptom_count: int,
    image_analysis_count: int,
    face_scan_count: int,
) -> LongevityOutlook:
    """Build a non-predictive preventive-health overview from recorded data.

    There is deliberately no score-to-years conversion here.  The application
    does not have an India-validated survival model or sufficient inputs to make
    an individual longevity prediction.
    """

    signals: list[PreventiveHealthSignal] = []
    high_priority_count = sum(1 for factor in risk_factors if factor.severity == "high")
    attention_count = sum(1 for factor in risk_factors if factor.severity == "medium")
    recurring_findings_count = sum(1 for condition in conditions if condition.occurrences >= 3)

    if high_priority_count:
        signals.append(PreventiveHealthSignal(
            title="Prompt clinical follow-up may be needed",
            severity="high",
            detail=(
                f"{high_priority_count} high-priority item(s) are recorded in your "
                "health history. This is a follow-up prompt, not a prognosis."
            ),
            recommendation=(
                "Review these items with a qualified clinician, especially if symptoms "
                "are new, worsening, severe, or persistent."
            ),
            source="Recorded assessments and health records",
        ))

    if abnormal_lab_value_count:
        signals.append(PreventiveHealthSignal(
            title="Review out-of-range lab values",
            severity="attention" if abnormal_lab_value_count <= 5 else "high",
            detail=(
                f"{abnormal_lab_value_count} lab value(s) were marked outside the "
                "reported reference range. A lab flag alone does not establish a diagnosis."
            ),
            recommendation=(
                "Discuss the report and its reference ranges with the clinician who knows "
                "your history; ask whether repeat testing or follow-up is appropriate."
            ),
            source="Uploaded lab reports",
        ))

    if recurring_findings_count:
        signals.append(PreventiveHealthSignal(
            title="Track recurring assessment findings",
            severity="attention",
            detail=(
                f"{recurring_findings_count} finding(s) have appeared in three or more "
                "recorded assessments. These are not confirmed diagnoses."
            ),
            recommendation=(
                "Bring a timeline of recurring symptoms or findings to a qualified clinician "
                "for assessment."
            ),
            source="Recorded assessments",
        ))

    if attention_count and not abnormal_lab_value_count and not recurring_findings_count:
        signals.append(PreventiveHealthSignal(
            title="Review health items needing attention",
            severity="attention",
            detail=(
                f"{attention_count} item(s) in your records were marked as needing attention. "
                "This is a record summary, not a prediction."
            ),
            recommendation="Review these items at your next appropriate clinical visit.",
            source="Recorded assessments and health records",
        ))

    if not signals:
        if assessment_count or lab_report_count or symptom_count:
            signals.append(PreventiveHealthSignal(
                title="Continue routine health tracking",
                severity="info",
                detail=(
                    "No preventive follow-up signal was identified from the limited records "
                    "summarized here. This does not rule out a health concern."
                ),
                recommendation=(
                    "Keep records up to date and seek clinical advice for new, concerning, "
                    "or persistent symptoms."
                ),
                source="Available MedSign records",
            ))
        else:
            signals.append(PreventiveHealthSignal(
                title="Add health records for practical next steps",
                severity="info",
                detail=(
                    "There are no recorded assessments, lab reports, or symptoms to summarize yet. "
                    "Wellness face scans are not used to create preventive-health signals."
                ),
                recommendation=(
                    "Add information only when you want help organizing it for a conversation "
                    "with a qualified clinician."
                ),
                source="Available MedSign records",
            ))

    coverage_parts = []
    if assessment_count:
        coverage_parts.append(f"{assessment_count} assessment(s)")
    if lab_report_count:
        coverage_parts.append(f"{lab_report_count} lab report(s)")
    if symptom_count:
        coverage_parts.append(f"{symptom_count} reported symptom(s)")
    if coverage_parts:
        coverage_summary = "Preventive signals use: " + ", ".join(coverage_parts) + "."
    else:
        coverage_summary = "No assessments, lab reports, or reported symptoms are available for this overview yet."

    return LongevityOutlook(
        title="Longevity & preventive-health outlook",
        status="informational_only",
        personal_estimate_available=False,
        preventive_signals=signals,
        data_coverage=LongevityDataCoverage(
            assessment_count=assessment_count,
            lab_report_count=lab_report_count,
            abnormal_lab_value_count=abnormal_lab_value_count,
            symptom_count=symptom_count,
            image_analysis_count=image_analysis_count,
            face_scan_count=face_scan_count,
            summary=coverage_summary,
        ),
        methodology=(
            "This non-predictive overview summarizes health information recorded in MedSign. "
            "It does not estimate life expectancy, mortality risk, or add or subtract years "
            "based on your records."
        ),
        source_label="MedSign preventive-health signal review",
        source_version="v1.0 (non-predictive)",
        reference_source_label="India Sample Registration System (SRS) Abridged Life Tables",
        reference_source_version="2020–2024",
        reference_url="https://censusindia.gov.in/nada/index.php/catalog/47148/study-description",
        reference_note=(
            "Listed for population-health context only. MedSign does not currently calculate "
            "or display an SRS-based personal or population life-expectancy result."
        ),
        disclaimer=(
            "This screen is for health-information organization and preventive follow-up. It is "
            "not medical advice, a diagnosis, a mortality-risk assessment, or a personal life-"
            "expectancy prediction. Seek urgent care for emergency symptoms and consult a "
            "qualified clinician for medical decisions."
        ),
    )


# ── Main Endpoint ────────────────────────────────────────────────────────────


@router.get("", response_model=HealthInsights)
async def get_health_insights(
    member: str | None = Query(None),
    user=Depends(get_current_user),
):
    """Aggregate all health data into a unified insights view."""
    user_id = str(user.id)
    patient_id = str(await resolve_patient_id(family_member_id=member, user=user))

    # Fetch all conversations (scoped to family member if provided)
    convos_query = supabase.table("conversations").select(
        "id, chief_complaint, status, risk_level, session_type, metadata, created_at"
    ).eq("user_id", user_id)
    if member:
        convos_query = convos_query.eq("family_member_id", member)
    else:
        convos_query = convos_query.is_("family_member_id", "null")
    convos_resp = convos_query.order("created_at", desc=True).execute()
    conversations = convos_resp.data or []

    # Extract symptoms from conversation metadata (patient_state)
    conv_symptoms: list[dict] = []
    for conv in conversations:
        ps = (conv.get("metadata") or {}).get("patient_state")
        if not ps:
            continue
        for s in ps.get("symptoms", []):
            name = s.get("name", "").strip()
            if not name:
                continue
            sev = s.get("severity")
            sev_label = "mild" if not sev or sev <= 3 else "moderate" if sev <= 6 else "severe"
            conv_symptoms.append({
                "name": name,
                "severity": sev,
                "severity_label": sev_label,
                "duration_days": s.get("duration_days"),
                "body_location": s.get("body_location"),
                "description": s.get("description"),
                "recorded_at": conv.get("created_at"),
            })

    # Fetch all assessments
    assess_resp = supabase.table("assessments").select(
        "id, conversation_id, risk_level, possible_conditions, "
        "recommended_actions, red_flags, urgency_score, created_at"
    ).eq("patient_id", patient_id).order("created_at", desc=True).execute()
    assessments = assess_resp.data or []

    # Fetch all symptoms from symptoms table
    symptoms_resp = supabase.table("symptoms").select(
        "name, severity, duration_days, body_location, description, recorded_at"
    ).eq("patient_id", patient_id).order("recorded_at", desc=True).execute()
    db_symptoms = symptoms_resp.data or []

    # Merge: conversation symptoms + DB symptoms, deduplicate by name (case-insensitive)
    seen_symptoms: set[str] = set()
    symptoms: list[dict] = []
    for s in db_symptoms:
        key = s.get("name", "").lower()
        if key and key not in seen_symptoms:
            seen_symptoms.add(key)
            symptoms.append(s)
    for s in conv_symptoms:
        key = s.get("name", "").lower()
        if key and key not in seen_symptoms:
            seen_symptoms.add(key)
            symptoms.append(s)

    # Fetch lab reports for the selected profile.  Reports have both owner and
    # patient IDs; the patient scope prevents a family member's records from
    # influencing another family member's preventive-health overview.
    reports_resp = supabase.table("lab_reports").select(
        "id, report_date, lab_name, lab_address, doctor_name, created_at, status"
    ).eq("user_id", user_id).eq("patient_id", patient_id).order("created_at", desc=True).execute()
    lab_reports = reports_resp.data or []

    # Fetch lab values (only for this user's reports)
    report_ids = [r["id"] for r in lab_reports]
    all_lab_values: list[dict] = []
    if report_ids:
        lab_values_resp = supabase.table("lab_values").select(
            "report_id, test_name, value, unit, reference_range, is_abnormal, "
            "abnormality_direction, category, created_at"
        ).in_("report_id", report_ids).execute()
        all_lab_values = lab_values_resp.data or []

    # Fetch image analyses
    images_resp = supabase.table("images").select(
        "id, analysis, created_at, conversation_id"
    ).eq("patient_id", patient_id).not_.is_("analysis", "null").order(
        "created_at", desc=True
    ).execute()
    image_analyses = images_resp.data or []

    # Fetch face scans
    face_scans_query = supabase.table("face_scans").select(
        "id, scan_date, overall_score, hair_health_score, skin_quality_score, "
        "stress_level_score, sleep_quality_score, created_at"
    )
    face_scans_resp = _scope_face_scans_query(
        face_scans_query,
        user_id=user_id,
        member_id=member,
    ).order("scan_date", desc=False).execute()
    face_scans = face_scans_resp.data or []

    face_scan_scores: list[dict] = []
    face_scan_overall_sum = 0.0
    face_scan_overall_count = 0
    for fs in face_scans:
        entry: dict = {"date": (fs.get("scan_date") or fs["created_at"][:10])}
        for key in ("overall", "hair_health", "skin_quality", "stress_level", "sleep_quality"):
            db_key = f"{key}_score" if key != "overall" else "overall_score"
            entry[key] = fs.get(db_key)
        face_scan_scores.append(entry)
        if fs.get("overall_score") is not None:
            face_scan_overall_sum += fs["overall_score"]
            face_scan_overall_count += 1

    face_scan_avg = round(face_scan_overall_sum / face_scan_overall_count, 1) if face_scan_overall_count else None

    # Calculate face scan streak (consecutive days with scans, counting back from most recent)
    face_scan_streak = 0
    if face_scans:
        scan_dates = sorted(set(
            (fs.get("scan_date") or fs["created_at"][:10]) for fs in face_scans
        ), reverse=True)
        from datetime import timedelta
        prev = datetime.strptime(scan_dates[0], "%Y-%m-%d").date()
        face_scan_streak = 1
        for d_str in scan_dates[1:]:
            d = datetime.strptime(d_str, "%Y-%m-%d").date()
            if (prev - d).days == 1:
                face_scan_streak += 1
                prev = d
            else:
                break

    # Parse image severity distribution
    image_severity_dist: dict[str, int] = {"info": 0, "mild": 0, "moderate": 0, "severe": 0}
    for img in image_analyses:
        analysis = img.get("analysis") or {}
        severity = analysis.get("overall_severity", "unknown")
        if severity in image_severity_dist:
            image_severity_dist[severity] += 1

    # ── Build risk distribution
    risk_distribution = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    for conv in conversations:
        rl = conv.get("risk_level")
        if rl in risk_distribution:
            risk_distribution[rl] += 1

    # ── Extract conditions from assessments
    condition_tracker: dict[str, dict] = {}
    for assess in assessments:
        conditions_json = assess.get("possible_conditions") or []
        if isinstance(conditions_json, list):
            for cond in conditions_json:
                if isinstance(cond, dict):
                    name = cond.get("name", "Unknown")
                    prob = cond.get("probability")
                    date_str = assess["created_at"][:10]
                    if name not in condition_tracker:
                        condition_tracker[name] = {
                            "probability": prob,
                            "first_seen": date_str,
                            "last_seen": date_str,
                            "occurrences": 1,
                            "risk_level": assess.get("risk_level"),
                        }
                    else:
                        condition_tracker[name]["occurrences"] += 1
                        condition_tracker[name]["last_seen"] = date_str
                        if prob and (condition_tracker[name]["probability"] or 0) < prob:
                            condition_tracker[name]["probability"] = prob

    conditions_list = [
        ConditionEntry(name=name, **data)
        for name, data in sorted(
            condition_tracker.items(), key=lambda x: x[1]["occurrences"], reverse=True
        )
    ]

    # ── Build timeline
    timeline: list[TimelineEvent] = []

    for conv in conversations[:50]:
        timeline.append(TimelineEvent(
            date=conv["created_at"][:10],
            type="assessment",
            title=conv.get("chief_complaint") or "Health check",
            risk_level=conv.get("risk_level"),
            detail=f"Status: {conv['status']}",
        ))

    for report in lab_reports[:20]:
        date = report.get("report_date") or report["created_at"][:10]
        timeline.append(TimelineEvent(
            date=date,
            type="lab_report",
            title=f"Lab Report — {report.get('lab_name') or 'Unknown lab'}",
            detail=f"Status: {report['status']}",
        ))

    for symptom in symptoms[:30]:
        timeline.append(TimelineEvent(
            date=(symptom.get("recorded_at") or "")[:10],
            type="symptom",
            title=symptom["name"],
            detail=f"Severity: {symptom.get('severity', '?')}/10",
        ))

    for img in image_analyses[:20]:
        analysis = img.get("analysis") or {}
        timeline.append(TimelineEvent(
            date=img["created_at"][:10],
            type="image_analysis",
            title=analysis.get("report_title", "Image Analysis"),
            risk_level=analysis.get("overall_severity"),
            detail=f"Severity: {analysis.get('overall_severity', 'unknown')}",
        ))

    for fs in face_scans[-30:]:
        score = fs.get("overall_score")
        date = fs.get("scan_date") or fs["created_at"][:10]
        timeline.append(TimelineEvent(
            date=date,
            type="face_scan",
            title="Face Scan",
            risk_level=None,
            detail=f"Overall score: {score}/100" if score else "Scan completed",
        ))

    timeline.sort(key=lambda x: x.date, reverse=True)

    # ── Lab trends
    lab_by_test: dict[str, list[dict]] = {}
    report_dates = {r["id"]: r.get("report_date") or r["created_at"][:10] for r in lab_reports}
    lab_categories: dict[str, str] = {}

    for lv in all_lab_values:
        test_name = lv["test_name"]
        report_id = lv["report_id"]
        date = report_dates.get(report_id, lv.get("created_at", "")[:10])

        if test_name not in lab_by_test:
            lab_by_test[test_name] = []
        lab_by_test[test_name].append({
            "date": date,
            "value": lv.get("value"),
            "unit": lv.get("unit"),
            "is_abnormal": lv.get("is_abnormal", False),
        })
        if lv.get("category"):
            lab_categories[test_name] = lv["category"]

    lab_trends = [
        LabTrend(
            test_name=test_name,
            category=lab_categories.get(test_name),
            readings=sorted(readings, key=lambda r: r["date"]),
        )
        for test_name, readings in lab_by_test.items()
        if len(readings) >= 1
    ][:20]

    # ── Risk factors from red flags and symptoms
    risk_factors: list[RiskFactor] = []
    seen_factors: set[str] = set()

    for assess in assessments:
        red_flags = assess.get("red_flags") or []
        for flag in red_flags:
            if flag not in seen_factors:
                seen_factors.add(flag)
                risk_factors.append(RiskFactor(
                    factor=flag,
                    severity="high",
                    source="Clinical assessment",
                    recommendation="Discuss with your healthcare provider",
                ))

    total_abnormal = sum(
        1 for lv in all_lab_values if lv.get("is_abnormal")
    )
    if total_abnormal > 5:
        risk_factors.append(RiskFactor(
            factor=f"{total_abnormal} abnormal lab values detected",
            severity="medium",
            source="Lab reports",
            recommendation="Review with doctor and consider follow-up tests",
        ))

    high_severity_symptoms = [s for s in symptoms if (s.get("severity") or 0) >= 7]
    if high_severity_symptoms:
        risk_factors.append(RiskFactor(
            factor=f"{len(high_severity_symptoms)} high-severity symptom(s) reported",
            severity="medium",
            source="Self-reported symptoms",
            recommendation="Monitor closely and seek medical attention if persisting",
        ))

    severe_images = image_severity_dist.get("severe", 0)
    moderate_images = image_severity_dist.get("moderate", 0)
    if severe_images > 0:
        risk_factors.append(RiskFactor(
            factor=f"{severe_images} severe finding(s) from image analysis",
            severity="high",
            source="Medical image analysis",
            recommendation="Seek prompt evaluation from a specialist",
        ))
    elif moderate_images > 0:
        risk_factors.append(RiskFactor(
            factor=f"{moderate_images} moderate finding(s) from image analysis",
            severity="medium",
            source="Medical image analysis",
            recommendation="Schedule a specialist consultation",
        ))

    # ── Body system scores
    system_issues: Counter[str] = Counter()
    system_details: dict[str, list[BodySystemDetail]] = {}
    # Include chief complaints from conversations
    for conv in conversations:
        cc = (conv.get("chief_complaint") or "").strip()
        if cc:
            system = classify_body_system(cc)
            risk = conv.get("risk_level", "low")
            sev = "severe" if risk in ("high", "critical") else "moderate" if risk == "medium" else "mild"
            system_issues[system] += 1
            system_details.setdefault(system, []).append(
                BodySystemDetail(text=cc, source="assessment", severity=sev)
            )
    for symptom in symptoms:
        name = symptom.get("name", "")
        system = classify_body_system(name)
        system_issues[system] += 1
        system_details.setdefault(system, []).append(
            BodySystemDetail(text=name, source="symptom", severity=symptom.get("severity_label", "info"))
        )
    for cond in conditions_list:
        system = classify_body_system(cond.name)
        system_issues[system] += 1
        system_details.setdefault(system, []).append(
            BodySystemDetail(text=cond.name, source="condition", severity="moderate")
        )
    for img in image_analyses:
        analysis = img.get("analysis") or {}
        for obs in analysis.get("observations_detailed", []):
            obs_text = obs.get("observation", "") if isinstance(obs, dict) else str(obs)
            obs_sev = obs.get("severity", "info") if isinstance(obs, dict) else "info"
            system = classify_body_system(obs_text)
            if system != "General":
                system_issues[system] += 1
                system_details.setdefault(system, []).append(
                    BodySystemDetail(text=obs_text, source="image", severity=obs_sev)
                )
        for obs_text in analysis.get("visual_observations", []):
            system = classify_body_system(obs_text)
            if system != "General":
                already = any(d.text == obs_text for d in system_details.get(system, []))
                if not already:
                    system_issues[system] += 1
                    system_details.setdefault(system, []).append(
                        BodySystemDetail(text=obs_text, source="image", severity="info")
                    )

    all_systems = [
        "Cardiovascular", "Respiratory", "Digestive", "Neurological",
        "Musculoskeletal", "Endocrine", "Mental Health", "Immune System",
        "Dermatological", "Renal", "Hepatic", "ENT",
    ]
    body_systems = []
    for sys_name in all_systems:
        issues = system_issues.get(sys_name, 0)
        score = max(70, 95 - issues * 5)
        trend = "stable"
        if issues == 0:
            trend = "stable"
        elif issues <= 2:
            trend = "stable"
        else:
            trend = "declining"
        details = system_details.get(sys_name, [])[:10]
        body_systems.append(BodySystemScore(
            system=sys_name, score=score, issues=issues, trend=trend, details=details
        ))
    body_systems.sort(key=lambda x: x.score)

    # ── Monthly activity
    monthly: dict[str, dict[str, int]] = {}
    def _ensure_month(m: str) -> None:
        if m not in monthly:
            monthly[m] = {"assessments": 0, "lab_reports": 0, "image_analyses": 0, "face_scans": 0}

    for conv in conversations:
        month = conv["created_at"][:7]
        _ensure_month(month)
        monthly[month]["assessments"] += 1
    for report in lab_reports:
        month = (report.get("report_date") or report["created_at"])[:7]
        _ensure_month(month)
        monthly[month]["lab_reports"] += 1
    for img in image_analyses:
        month = img["created_at"][:7]
        _ensure_month(month)
        monthly[month]["image_analyses"] += 1
    for fs in face_scans:
        month = (fs.get("scan_date") or fs["created_at"][:10])[:7]
        _ensure_month(month)
        monthly[month]["face_scans"] += 1

    monthly_activity = [
        {"month": m, **counts}
        for m, counts in sorted(monthly.items())
    ][-12:]

    # ── Aggregate doctors and labs from reports
    doctor_tracker: dict[str, dict] = {}
    lab_tracker: dict[str, dict] = {}
    for report in lab_reports:
        doc = report.get("doctor_name")
        if doc:
            date = report.get("report_date") or report["created_at"][:10]
            if doc not in doctor_tracker:
                doctor_tracker[doc] = {"reports_count": 0, "labs": set(), "last_visited": date}
            doctor_tracker[doc]["reports_count"] += 1
            if report.get("lab_name"):
                doctor_tracker[doc]["labs"].add(report["lab_name"])
            if date > doctor_tracker[doc]["last_visited"]:
                doctor_tracker[doc]["last_visited"] = date

        lab = report.get("lab_name")
        if lab:
            date = report.get("report_date") or report["created_at"][:10]
            if lab not in lab_tracker:
                lab_tracker[lab] = {"address": report.get("lab_address"), "reports_count": 0, "last_visited": date}
            lab_tracker[lab]["reports_count"] += 1
            if not lab_tracker[lab]["address"] and report.get("lab_address"):
                lab_tracker[lab]["address"] = report["lab_address"]
            if date > lab_tracker[lab]["last_visited"]:
                lab_tracker[lab]["last_visited"] = date

    doctors_list = [
        DoctorEntry(name=name, reports_count=d["reports_count"], labs=sorted(d["labs"]), last_visited=d["last_visited"])
        for name, d in sorted(doctor_tracker.items(), key=lambda x: x[1]["reports_count"], reverse=True)
    ]
    labs_list = [
        LabEntry(name=name, address=d["address"], reports_count=d["reports_count"], last_visited=d["last_visited"])
        for name, d in sorted(lab_tracker.items(), key=lambda x: x[1]["reports_count"], reverse=True)
    ]

    # ── Calculate scores
    health_score = calculate_health_score(
        risk_distribution, total_abnormal, len(conversations), image_severity_dist
    )
    if face_scan_avg is not None and face_scan_avg >= 70:
        health_score = min(98, health_score + 2)
    longevity_outlook = build_longevity_outlook(
        risk_factors,
        conditions_list,
        assessment_count=len(conversations),
        lab_report_count=len(lab_reports),
        abnormal_lab_value_count=total_abnormal,
        symptom_count=len(symptoms),
        image_analysis_count=len(image_analyses),
        face_scan_count=len(face_scans),
    )

    return HealthInsights(
        health_score=health_score,
        total_assessments=len(conversations),
        total_conditions=len(conditions_list),
        total_symptoms_reported=len(symptoms),
        total_lab_reports=len(lab_reports),
        total_abnormal_values=total_abnormal,
        total_image_analyses=len(image_analyses),
        image_severity_distribution=image_severity_dist,
        total_face_scans=len(face_scans),
        face_scan_scores=[FaceScanScoreEntry(**s) for s in face_scan_scores],
        face_scan_avg_score=face_scan_avg,
        face_scan_streak=face_scan_streak,
        risk_distribution=risk_distribution,
        conditions=conditions_list[:20],
        timeline=timeline[:50],
        lab_trends=lab_trends,
        risk_factors=risk_factors[:15],
        body_systems=body_systems,
        longevity_outlook=longevity_outlook,
        monthly_activity=monthly_activity,
        doctors=doctors_list,
        labs=labs_list,
    )


def _get_patient_id(user_id: str) -> str:
    resp = supabase.table("patients").select("id").eq("user_id", user_id).execute()
    if resp.data:
        return resp.data[0]["id"]
    return "00000000-0000-0000-0000-000000000000"
