"""Safety boundaries for user-selected connected-device context."""

from app.services.conversation_service import _apply_selected_device_observations
from app.services.patient_state import PatientState


def test_selected_device_vitals_are_available_to_safety_flow():
    state = PatientState()

    _apply_selected_device_observations(
        state,
        [
            {
                "metric_type": "spo2",
                "value": 89,
                "unit": "percent",
                "observed_at": "2026-09-07T10:00:00Z",
                "provider": "health_connect",
            },
            {
                "metric_type": "sleep_duration",
                "value": 420,
                "unit": "minutes",
                "observed_at": "2026-09-07T07:00:00Z",
                "provider": "health_connect",
            },
        ],
    )

    assert state.vitals.spo2_percent == 89
    assert state.extra["selected_device_observations"][0]["source"] == "device"
    assert state.extra["selected_device_observations"][0]["selection"] == "user_selected_device_data"
    assert state.extra["selected_device_observations"][1]["metric_type"] == "sleep_duration"


def test_implausible_device_values_are_not_used_for_triage():
    state = PatientState()

    _apply_selected_device_observations(
        state,
        [
            {"metric_type": "temperature", "value": 99_999, "unit": "celsius"},
            {"metric_type": "spo2", "value": "not-a-number", "unit": "percent"},
        ],
    )

    assert state.vitals.temperature_c is None
    assert state.vitals.spo2_percent is None
    assert "selected_device_observations" not in state.extra
