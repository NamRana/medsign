"""Health Insights API — aggregates all assessments, lab reports, and symptoms
into a unified analytics view with health score and life expectancy estimate."""

from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.dependencies import supabase
from app.middleware.auth import get_current_user

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


class LifeExpectancy(BaseModel):
    estimated_years: float
    national_average: float
    factors_positive: list[str]
    factors_negative: list[str]
    confidence: str  # low | medium | high
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


class HealthInsights(BaseModel):
    health_score: int  # 0-100
    total_assessments: int
    total_conditions: int
    total_symptoms_reported: int
    total_lab_reports: int
    total_abnormal_values: int
    total_image_analyses: int
    image_severity_distribution: dict[str, int]
    risk_distribution: dict[str, int]  # {low: N, medium: N, high: N, critical: N}
    conditions: list[ConditionEntry]
    timeline: list[TimelineEvent]
    lab_trends: list[LabTrend]
    risk_factors: list[RiskFactor]
    body_systems: list[BodySystemScore]
    life_expectancy: LifeExpectancy
    monthly_activity: list[dict]  # [{month, assessments, lab_reports, image_analyses}]
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

# India average life expectancy (WHO 2023)
INDIA_LIFE_EXPECTANCY = 73.7


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
        return 85  # Default healthy score

    score = 100
    score -= risk_dist.get("critical", 0) * 15
    score -= risk_dist.get("high", 0) * 10
    score -= risk_dist.get("medium", 0) * 5
    score -= risk_dist.get("low", 0) * 1
    score -= min(total_abnormal * 2, 20)

    if image_severity:
        score -= image_severity.get("severe", 0) * 8
        score -= image_severity.get("moderate", 0) * 4

    return max(20, min(100, score))


def estimate_life_expectancy(
    health_score: int,
    risk_factors: list[RiskFactor],
    conditions: list[ConditionEntry],
) -> LifeExpectancy:
    base = INDIA_LIFE_EXPECTANCY
    adjustment = 0.0
    positives = []
    negatives = []

    if health_score >= 80:
        adjustment += 4.0
        positives.append("Overall good health profile")
    elif health_score >= 60:
        adjustment += 1.5
        positives.append("Moderate health status")
    elif health_score < 40:
        adjustment -= 3.0
        negatives.append("Multiple health concerns detected")

    chronic_count = sum(1 for c in conditions if c.occurrences >= 3)
    if chronic_count == 0:
        adjustment += 2.0
        positives.append("No chronic recurring conditions")
    elif chronic_count <= 2:
        adjustment -= 1.5
        negatives.append(f"{chronic_count} recurring condition(s)")
    else:
        adjustment -= 3.0
        negatives.append(f"{chronic_count} chronic conditions present")

    high_risk_count = sum(1 for r in risk_factors if r.severity == "high")
    if high_risk_count == 0:
        adjustment += 1.5
        positives.append("No high-severity risk factors")
    else:
        adjustment -= high_risk_count * 1.0
        negatives.append(f"{high_risk_count} high-severity risk factor(s)")

    if not negatives:
        positives.append("Proactive health monitoring")
        adjustment += 1.0

    confidence = "low"
    if len(conditions) >= 3:
        confidence = "medium"
    if len(conditions) >= 6:
        confidence = "high"

    return LifeExpectancy(
        estimated_years=round(base + adjustment, 1),
        national_average=base,
        factors_positive=positives or ["Regular health check-ups"],
        factors_negative=negatives or ["Insufficient data for detailed analysis"],
        confidence=confidence,
        disclaimer=(
            "This is a simplified statistical estimate based on your health data. "
            "It is NOT a medical diagnosis or prediction. Many lifestyle factors "
            "(diet, exercise, genetics) are not captured here. Consult your doctor "
            "for personalized health guidance."
        ),
    )


# ── Main Endpoint ────────────────────────────────────────────────────────────


@router.get("", response_model=HealthInsights)
async def get_health_insights(user=Depends(get_current_user)):
    """Aggregate all health data into a unified insights view."""
    user_id = str(user.id)

    # Fetch all conversations
    convos_resp = supabase.table("conversations").select(
        "id, chief_complaint, status, risk_level, session_type, created_at"
    ).eq("user_id", user_id).order("created_at", desc=True).execute()
    conversations = convos_resp.data or []

    # Fetch all assessments
    assess_resp = supabase.table("assessments").select(
        "id, conversation_id, risk_level, possible_conditions, "
        "recommended_actions, red_flags, urgency_score, created_at"
    ).eq("patient_id", _get_patient_id(user_id)).order("created_at", desc=True).execute()
    assessments = assess_resp.data or []

    # Fetch all symptoms
    symptoms_resp = supabase.table("symptoms").select(
        "name, severity, duration_days, body_location, description, recorded_at"
    ).eq("patient_id", _get_patient_id(user_id)).order("recorded_at", desc=True).execute()
    symptoms = symptoms_resp.data or []

    # Fetch lab reports with details
    reports_resp = supabase.table("lab_reports").select(
        "id, report_date, lab_name, lab_address, doctor_name, created_at, status"
    ).eq("user_id", user_id).order("created_at", desc=True).execute()
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
    patient_id = _get_patient_id(user_id)
    images_resp = supabase.table("images").select(
        "id, analysis, created_at, conversation_id"
    ).eq("patient_id", patient_id).not_.is_("analysis", "null").order(
        "created_at", desc=True
    ).execute()
    image_analyses = images_resp.data or []

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
        score = max(40, 100 - issues * 12)
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
    for conv in conversations:
        month = conv["created_at"][:7]
        if month not in monthly:
            monthly[month] = {"assessments": 0, "lab_reports": 0, "image_analyses": 0}
        monthly[month]["assessments"] += 1
    for report in lab_reports:
        month = (report.get("report_date") or report["created_at"])[:7]
        if month not in monthly:
            monthly[month] = {"assessments": 0, "lab_reports": 0, "image_analyses": 0}
        monthly[month]["lab_reports"] += 1
    for img in image_analyses:
        month = img["created_at"][:7]
        if month not in monthly:
            monthly[month] = {"assessments": 0, "lab_reports": 0, "image_analyses": 0}
        monthly[month]["image_analyses"] += 1

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
    life_exp = estimate_life_expectancy(health_score, risk_factors, conditions_list)

    return HealthInsights(
        health_score=health_score,
        total_assessments=len(conversations),
        total_conditions=len(conditions_list),
        total_symptoms_reported=len(symptoms),
        total_lab_reports=len(lab_reports),
        total_abnormal_values=total_abnormal,
        total_image_analyses=len(image_analyses),
        image_severity_distribution=image_severity_dist,
        risk_distribution=risk_distribution,
        conditions=conditions_list[:20],
        timeline=timeline[:50],
        lab_trends=lab_trends,
        risk_factors=risk_factors[:15],
        body_systems=body_systems,
        life_expectancy=life_exp,
        monthly_activity=monthly_activity,
        doctors=doctors_list,
        labs=labs_list,
    )


def _get_patient_id(user_id: str) -> str:
    resp = supabase.table("patients").select("id").eq("user_id", user_id).execute()
    if resp.data:
        return resp.data[0]["id"]
    return "00000000-0000-0000-0000-000000000000"
