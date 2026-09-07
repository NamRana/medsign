"""Unit tests for Device Hub input/output safety boundaries."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.v1.device_hub import _source_observation_key
from app.schemas.device_hub import (
    DeviceConnectionCreate,
    DeviceConnectionUpdate,
    VitalObservationBatchCreate,
    VitalObservationResponse,
)


def test_connection_deduplicates_granted_metrics_and_normalizes_labels():
    connection = DeviceConnectionCreate.model_validate(
        {
            "provider": "health_connect",
            "display_name": "  Pixel Watch  ",
            "granted_metric_types": ["heart_rate", "spo2", "heart_rate"],
            "metadata": {"device_model": "Pixel Watch 3"},
        }
    )

    assert connection.display_name == "Pixel Watch"
    assert connection.granted_metric_types == ["heart_rate", "spo2"]


def test_connection_rejects_credentials_in_metadata():
    with pytest.raises(ValidationError, match="credentials or access tokens"):
        DeviceConnectionCreate.model_validate(
            {
                "provider": "apple_health",
                "metadata": {"access_token": "must-not-be-persisted"},
            }
        )


def test_observation_requires_timezone_and_finite_value():
    base = {
        "metric_type": "heart_rate",
        "value": 72,
        "unit": "bpm",
        "provider": "manual",
        "source": "manual",
    }

    with pytest.raises(ValidationError, match="timezone offset"):
        VitalObservationBatchCreate.model_validate(
            {"observations": [{**base, "observed_at": "2026-09-07T10:00:00"}]}
        )
    with pytest.raises(ValidationError, match="finite number"):
        VitalObservationBatchCreate.model_validate(
            {"observations": [{**base, "value": "NaN", "observed_at": "2026-09-07T10:00:00Z"}]}
        )


def test_observation_normalizes_native_health_store_display_label():
    batch = VitalObservationBatchCreate.model_validate(
        {
            "observations": [
                {
                    "metric_type": "heart_rate",
                    "value": 72,
                    "unit": "bpm",
                    "observed_at": "2026-09-07T10:00:00Z",
                    "source": "Apple Health",
                }
            ]
        }
    )

    assert batch.observations[0].source == "health_store"


def test_observation_response_maps_database_connection_column_to_api_name():
    observation_id = uuid4()
    connection_id = uuid4()
    response = VitalObservationResponse.model_validate(
        {
            "id": str(observation_id),
            "device_connection_id": str(connection_id),
            "metric_type": "spo2",
            "value": "98.0",
            "unit": "percent",
            "observed_at": "2026-09-07T10:00:00Z",
            "provider": "health_connect",
            "source": "health_store",
            "created_at": "2026-09-07T10:01:00Z",
        }
    )

    assert response.id == observation_id
    assert response.connection_id == connection_id
    assert response.value == 98.0


def test_connection_update_accepts_an_aware_sync_timestamp():
    update = DeviceConnectionUpdate.model_validate(
        {"last_synced_at": "2026-09-07T10:00:00Z"}
    )

    assert update.last_synced_at is not None
    assert update.last_synced_at.tzinfo is not None

    with pytest.raises(ValidationError, match="timezone offset"):
        DeviceConnectionUpdate.model_validate(
            {"last_synced_at": "2026-09-07T10:00:00"}
        )


def test_source_observation_identity_keeps_series_and_bp_components_distinct():
    """One Health Connect record can contain multiple individual observations."""
    common = ("health_connect", "provider-record-42")

    systolic = _source_observation_key(
        *common, "systolic_bp", "2026-09-07T10:00:00Z"
    )
    diastolic = _source_observation_key(
        *common, "diastolic_bp", "2026-09-07T10:00:00Z"
    )
    later_heart_rate = _source_observation_key(
        *common, "heart_rate", "2026-09-07T10:01:00Z"
    )
    earlier_heart_rate = _source_observation_key(
        *common, "heart_rate", "2026-09-07T10:00:00+00:00"
    )

    assert systolic != diastolic
    assert later_heart_rate != earlier_heart_rate
