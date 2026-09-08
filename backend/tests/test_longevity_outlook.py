"""Tests for the non-predictive longevity and preventive-health overview."""

from app.api.v1.insights import (
    ConditionEntry,
    HealthInsights,
    RiskFactor,
    build_longevity_outlook,
)


def _build_outlook(
    risk_factors: list[RiskFactor] | None = None,
    conditions: list[ConditionEntry] | None = None,
    **counts: int,
):
    return build_longevity_outlook(
        risk_factors or [],
        conditions or [],
        assessment_count=counts.get("assessment_count", 0),
        lab_report_count=counts.get("lab_report_count", 0),
        abnormal_lab_value_count=counts.get("abnormal_lab_value_count", 0),
        symptom_count=counts.get("symptom_count", 0),
        image_analysis_count=counts.get("image_analysis_count", 0),
        face_scan_count=counts.get("face_scan_count", 0),
    )


def test_longevity_outlook_is_non_predictive_when_no_records_exist():
    outlook = _build_outlook()
    payload = outlook.model_dump()

    assert outlook.status == "informational_only"
    assert outlook.personal_estimate_available is False
    assert outlook.data_coverage.summary == (
        "No assessments, lab reports, or reported symptoms are available for this overview yet."
    )
    assert outlook.preventive_signals[0].title == "Add health records for practical next steps"
    assert outlook.source_label == "MedSign preventive-health signal review"
    assert outlook.source_version == "v1.0 (non-predictive)"
    assert outlook.reference_source_version == "2020–2024"
    assert outlook.reference_url == "https://censusindia.gov.in/nada/index.php/catalog/47148/study-description"
    assert "estimated_years" not in payload
    assert "national_average" not in payload


def test_insights_contract_exposes_longevity_outlook_not_life_expectancy():
    response_fields = HealthInsights.model_json_schema()["properties"]

    assert "longevity_outlook" in response_fields
    assert "life_expectancy" not in response_fields


def test_wellness_face_scans_do_not_create_a_preventive_health_signal():
    outlook = _build_outlook(face_scan_count=3)

    assert outlook.preventive_signals[0].title == "Add health records for practical next steps"
    assert "not used to create preventive-health signals" in outlook.preventive_signals[0].detail
    assert outlook.data_coverage.summary == (
        "No assessments, lab reports, or reported symptoms are available for this overview yet."
    )


def test_longevity_outlook_surfaces_record_based_follow_up_without_a_prognosis():
    outlook = _build_outlook(
        risk_factors=[
            RiskFactor(
                factor="Concerning symptom pattern",
                severity="high",
                source="Clinical assessment",
                recommendation="Discuss with a clinician",
            ),
        ],
        conditions=[
            ConditionEntry(
                name="Recurring assessment finding",
                first_seen="2026-01-01",
                last_seen="2026-03-01",
                occurrences=3,
            ),
        ],
        assessment_count=4,
        lab_report_count=2,
        abnormal_lab_value_count=2,
        symptom_count=3,
        image_analysis_count=1,
        face_scan_count=1,
    )

    signals_by_title = {signal.title: signal for signal in outlook.preventive_signals}

    assert signals_by_title["Prompt clinical follow-up may be needed"].severity == "high"
    assert signals_by_title["Review out-of-range lab values"].severity == "attention"
    assert signals_by_title["Track recurring assessment findings"].severity == "attention"
    assert outlook.data_coverage.assessment_count == 4
    assert outlook.data_coverage.lab_report_count == 2
    assert outlook.data_coverage.abnormal_lab_value_count == 2
    assert outlook.data_coverage.summary.startswith("Preventive signals use:")
    assert "does not estimate life expectancy" in outlook.methodology
    assert "not currently calculate" in outlook.reference_note
