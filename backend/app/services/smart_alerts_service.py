"""Smart Health Alerts — AI pattern detection across assessments, labs, and scans."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.dependencies import supabase
from app.services.billing_service import is_pro


def _days_ago(n: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=n)).isoformat()


async def generate_smart_alerts(user_id: UUID, patient_id: UUID | None = None) -> list[dict]:
    """Analyze user's health data and return smart alerts.

    For free users we generate all alerts but mark most as locked.
    """
    uid = str(user_id)
    pid = str(patient_id) if patient_id else None
    user_is_pro = is_pro(uid)

    alerts: list[dict] = []

    # --- 1. Recurring symptom detection ---
    try:
        q = supabase.table("conversations").select("chief_complaint, created_at, status").eq("user_id", uid).eq("status", "completed").order("created_at", desc=True).limit(50)
        if pid:
            q = q.or_(f"family_member_id.is.null,family_member_id.eq.{pid}")
        convos = q.execute().data or []
    except Exception:
        convos = []

    if convos:
        complaints = [c["chief_complaint"].lower().strip() for c in convos if c.get("chief_complaint")]
        complaint_counts = Counter(complaints)
        for complaint, count in complaint_counts.most_common(3):
            if count >= 2:
                recent = [c for c in convos if c.get("chief_complaint", "").lower().strip() == complaint]
                dates = sorted([c["created_at"][:10] for c in recent])
                alerts.append({
                    "id": f"recurring-{complaint[:20]}",
                    "type": "pattern",
                    "severity": "warning" if count >= 3 else "info",
                    "icon": "repeat",
                    "title": f"Recurring: {complaint.title()}",
                    "body": f"You've reported \"{complaint}\" {count} times (last: {dates[-1]}). Recurring symptoms may need professional attention.",
                    "recommendation": f"Consider consulting a doctor about your recurring {complaint}. Bring your MedSign assessment history.",
                    "data_points": count,
                    "locked": False,
                })

    # --- 2. Assessment frequency insight ---
    if len(convos) >= 3:
        dates = sorted([datetime.fromisoformat(c["created_at"].replace("Z", "+00:00")) for c in convos])
        gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        avg_gap = sum(gaps) / len(gaps) if gaps else 0

        if avg_gap < 3 and len(convos) >= 5:
            alerts.append({
                "id": "high-frequency",
                "type": "insight",
                "severity": "warning",
                "icon": "activity",
                "title": "Frequent Health Concerns",
                "body": f"You've had {len(convos)} assessments with an average gap of {avg_gap:.0f} days. This pattern suggests ongoing health issues that may benefit from a comprehensive check-up.",
                "recommendation": "Schedule a general health check-up to address multiple concerns at once.",
                "data_points": len(convos),
                "locked": not user_is_pro,
            })

    # --- 3. Face scan trend analysis ---
    try:
        scans_q = supabase.table("face_scans").select("overall_score, stress_level_score, sleep_quality_score, skin_quality_score, scan_date").eq("user_id", uid).order("scan_date", desc=True).limit(10)
        scans = scans_q.execute().data or []
    except Exception:
        scans = []

    if len(scans) >= 3:
        stress_scores = [s["stress_level_score"] for s in scans if s.get("stress_level_score") is not None]
        sleep_scores = [s["sleep_quality_score"] for s in scans if s.get("sleep_quality_score") is not None]
        overall_scores = [s["overall_score"] for s in scans if s.get("overall_score") is not None]

        # Stress trending up (lower = worse for stress in some systems, higher = worse in others)
        if len(stress_scores) >= 3:
            recent_avg = sum(stress_scores[:3]) / 3
            older_avg = sum(stress_scores[3:min(6, len(stress_scores))]) / max(1, min(3, len(stress_scores) - 3))
            if older_avg > 0 and recent_avg < older_avg * 0.85:
                alerts.append({
                    "id": "stress-rising",
                    "type": "trend",
                    "severity": "warning",
                    "icon": "trending-down",
                    "title": "Stress Levels Increasing",
                    "body": f"Your stress score dropped from {older_avg:.0f} to {recent_avg:.0f} over recent scans. This {((older_avg - recent_avg) / older_avg * 100):.0f}% decline suggests rising stress.",
                    "recommendation": "Try deep breathing, regular walks, or meditation. Persistent stress affects immunity and sleep.",
                    "data_points": len(stress_scores),
                    "locked": not user_is_pro,
                })

        # Sleep quality declining
        if len(sleep_scores) >= 3:
            recent_sleep = sum(sleep_scores[:3]) / 3
            if recent_sleep < 60:
                alerts.append({
                    "id": "poor-sleep",
                    "type": "trend",
                    "severity": "alert",
                    "icon": "moon",
                    "title": "Poor Sleep Quality Detected",
                    "body": f"Your average sleep score is {recent_sleep:.0f}/100 over recent scans. Poor sleep impacts recovery, immunity, and mental health.",
                    "recommendation": "Maintain a consistent sleep schedule. Avoid screens 1 hour before bed. Consider discussing with a doctor if persistent.",
                    "data_points": len(sleep_scores),
                    "locked": not user_is_pro,
                })

        # Overall wellness declining
        if len(overall_scores) >= 4:
            first_half = overall_scores[len(overall_scores) // 2:]
            second_half = overall_scores[:len(overall_scores) // 2]
            first_avg = sum(first_half) / len(first_half)
            second_avg = sum(second_half) / len(second_half)
            if first_avg > 0 and second_avg < first_avg * 0.9:
                alerts.append({
                    "id": "wellness-decline",
                    "type": "trend",
                    "severity": "warning",
                    "icon": "heart",
                    "title": "Overall Wellness Declining",
                    "body": f"Your wellness score has dropped from ~{first_avg:.0f} to ~{second_avg:.0f}. A downward trend over multiple scans deserves attention.",
                    "recommendation": "Review your recent lifestyle changes. Regular exercise, balanced diet, and adequate sleep can reverse this trend.",
                    "data_points": len(overall_scores),
                    "locked": not user_is_pro,
                })

    # --- 4. Lab value trend analysis ---
    try:
        labs_q = supabase.table("lab_reports").select("id, status, created_at").eq("user_id", uid).eq("status", "processed").order("created_at", desc=True).limit(5)
        labs = labs_q.execute().data or []
    except Exception:
        labs = []

    if len(labs) >= 2:
        abnormal_by_report: list[int] = []
        for lab in labs[:3]:
            try:
                vals = supabase.table("lab_values").select("is_abnormal").eq("report_id", lab["id"]).execute().data or []
                abnormal_by_report.append(sum(1 for v in vals if v.get("is_abnormal")))
            except Exception:
                pass

        if len(abnormal_by_report) >= 2 and abnormal_by_report[0] > abnormal_by_report[-1]:
            alerts.append({
                "id": "lab-abnormals-rising",
                "type": "trend",
                "severity": "alert",
                "icon": "lab",
                "title": "More Abnormal Lab Values",
                "body": f"Your latest report has {abnormal_by_report[0]} abnormal values, up from {abnormal_by_report[-1]} previously. This trend warrants medical review.",
                "recommendation": "Share your lab reports with your doctor. Increasing abnormal values may indicate a developing condition.",
                "data_points": sum(abnormal_by_report),
                "locked": not user_is_pro,
            })

    # --- 5. Cross-correlation: stress + frequent assessments ---
    if scans and convos:
        recent_stress = [s["stress_level_score"] for s in scans[:3] if s.get("stress_level_score") is not None]
        recent_convos_30d = [c for c in convos if c["created_at"] >= _days_ago(30)]
        if recent_stress and sum(recent_stress) / len(recent_stress) < 50 and len(recent_convos_30d) >= 3:
            alerts.append({
                "id": "burnout-risk",
                "type": "correlation",
                "severity": "alert",
                "icon": "zap",
                "title": "Possible Burnout Risk",
                "body": f"High stress scores combined with {len(recent_convos_30d)} health concerns in the past month. This pattern is often associated with burnout.",
                "recommendation": "Prioritize rest and recovery. Consider reducing workload if possible. Talk to someone you trust about how you're feeling.",
                "data_points": len(recent_stress) + len(recent_convos_30d),
                "locked": not user_is_pro,
            })

    # --- 6. Positive reinforcement (always unlocked) ---
    if scans and len(scans) >= 2:
        latest = scans[0].get("overall_score", 0) or 0
        previous = scans[1].get("overall_score", 0) or 0
        if latest > previous and latest >= 70:
            alerts.append({
                "id": "improving",
                "type": "positive",
                "severity": "success",
                "icon": "star",
                "title": "You're Improving!",
                "body": f"Your wellness score improved from {previous} to {latest}. Whatever you're doing is working — keep it up!",
                "recommendation": "Maintain your current healthy habits. Consistency is key.",
                "data_points": 2,
                "locked": False,
            })

    # --- 7. Inactivity alert (always unlocked) ---
    if convos:
        last_date = datetime.fromisoformat(convos[0]["created_at"].replace("Z", "+00:00"))
        days_since = (datetime.now(timezone.utc) - last_date).days
        if days_since >= 14:
            alerts.append({
                "id": "inactive",
                "type": "reminder",
                "severity": "info",
                "icon": "clock",
                "title": "Time for a Check-in",
                "body": f"It's been {days_since} days since your last assessment. Regular check-ins help catch issues early.",
                "recommendation": "Start a quick health assessment to keep your health profile up to date.",
                "data_points": days_since,
                "locked": False,
            })

    # Sort: unlocked first, then by severity
    severity_order = {"alert": 0, "warning": 1, "success": 2, "info": 3}
    alerts.sort(key=lambda a: (a.get("locked", False), severity_order.get(a["severity"], 9)))

    return alerts
