"""Unit tests for the reversible monetization switch.

These tests intentionally exercise only the billing service's decision logic.
All database-facing helpers are replaced so the test remains deterministic and
also proves that disabled monetization does not trigger usage/subscription
lookups.
"""

from __future__ import annotations

import os

import pytest


# Keep this test importable in a clean test environment, before app.config's
# module-level Settings instance is constructed.
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://localhost/test")

from app.services import billing_service


def _unexpected_database_lookup(*args, **kwargs):
    raise AssertionError("a disabled monetization check must not query the database")


@pytest.fixture
def set_monetization_enabled(monkeypatch):
    def _set(enabled: bool) -> None:
        monkeypatch.setattr(billing_service.settings, "monetization_enabled", enabled)

    return _set


def test_disabled_monetization_allows_usage_without_database_lookups(
    monkeypatch, set_monetization_enabled
):
    set_monetization_enabled(False)
    monkeypatch.setattr(billing_service, "is_pro", _unexpected_database_lookup)
    monkeypatch.setattr(billing_service, "get_usage", _unexpected_database_lookup)
    monkeypatch.setattr(billing_service, "get_subscription", _unexpected_database_lookup)

    result = billing_service.check_limit("free-user", "assessments")

    assert result["allowed"] is True
    assert result["limit"] == -1
    assert result["used"] == 0


def test_disabled_monetization_reports_unlimited_access_in_billing_status(
    monkeypatch, set_monetization_enabled
):
    set_monetization_enabled(False)
    monkeypatch.setattr(billing_service, "get_subscription", lambda _user_id: None)
    monkeypatch.setattr(
        billing_service,
        "get_usage",
        lambda _user_id: {
            "assessments_used": 7,
            "lab_reports_used": 2,
            "face_scans_used": 4,
            "image_analyses_used": 3,
            "assessments_quota_used": 0,
            "lab_reports_quota_used": 0,
            "face_scans_quota_used": 0,
            "image_analyses_quota_used": 0,
        },
    )

    status = billing_service.get_billing_status("free-user")

    assert status["monetization_enabled"] is False
    assert {entry["limit"] for entry in status["usage"].values()} == {-1}
    assert status["usage"]["assessments"]["used"] == 7


def test_enabled_monetization_enforces_an_ordinary_users_limit(
    monkeypatch, set_monetization_enabled
):
    set_monetization_enabled(True)
    limit = billing_service.FREE_LIMITS["assessments"]
    monkeypatch.setattr(billing_service, "is_pro", lambda _user_id: False)
    monkeypatch.setattr(
        billing_service,
        "get_usage",
        lambda _user_id: {
            "assessments_used": 100,
            "assessments_quota_used": limit,
        },
    )

    result = billing_service.check_limit("free-user", "assessments")

    assert result == {
        "allowed": False,
        "used": limit,
        "limit": limit,
        "is_pro": False,
    }


def test_enabled_monetization_ignores_acquisition_period_usage(
    monkeypatch, set_monetization_enabled
):
    set_monetization_enabled(True)
    monkeypatch.setattr(billing_service, "is_pro", lambda _user_id: False)
    monkeypatch.setattr(
        billing_service,
        "get_usage",
        lambda _user_id: {
            "assessments_used": 100,
            "assessments_quota_used": 0,
        },
    )

    result = billing_service.check_limit("free-user", "assessments")

    assert result == {
        "allowed": True,
        "used": 0,
        "limit": billing_service.FREE_LIMITS["assessments"],
        "is_pro": False,
    }


def test_enabled_monetization_allows_a_pro_user_without_usage_lookup(
    monkeypatch, set_monetization_enabled
):
    set_monetization_enabled(True)
    monkeypatch.setattr(billing_service, "is_pro", lambda _user_id: True)
    monkeypatch.setattr(billing_service, "get_usage", _unexpected_database_lookup)

    result = billing_service.check_limit("pro-user", "assessments")

    assert result == {
        "allowed": True,
        "used": 0,
        "limit": -1,
        "is_pro": True,
    }


def test_has_premium_access_skips_subscription_lookup_when_monetization_disabled(
    monkeypatch, set_monetization_enabled
):
    set_monetization_enabled(False)
    monkeypatch.setattr(billing_service, "is_pro", _unexpected_database_lookup)

    assert billing_service.has_premium_access("free-user") is True


@pytest.mark.parametrize(
    ("is_pro", "expected"),
    [(True, True), (False, False)],
)
def test_has_premium_access_follows_subscription_status_when_monetization_enabled(
    monkeypatch, set_monetization_enabled, is_pro, expected
):
    set_monetization_enabled(True)
    monkeypatch.setattr(billing_service, "is_pro", lambda _user_id: is_pro)

    assert billing_service.has_premium_access("user") is expected
