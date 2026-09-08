"""Billing service — Razorpay subscription management and usage tracking."""

from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone

from app.config import settings
from app.dependencies import supabase

logger = logging.getLogger("medsign.billing")

FREE_LIMITS = {
    "assessments": 3,
    "lab_reports": 1,
    "face_scans": 3,
    "image_analyses": 1,
}

_rz_client = None


def _quota_usage_column(feature: str) -> str:
    """Return the counter used for enforceable paid-plan quotas."""
    return f"{feature}_quota_used"


def _get_razorpay_client():
    global _rz_client
    if _rz_client is None:
        import razorpay
        _rz_client = razorpay.Client(
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret)
        )
    return _rz_client


def get_current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


# ── Subscription helpers ─────────────────────────────────────────────────────


def get_subscription(user_id: str) -> dict | None:
    resp = (
        supabase.table("subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def is_pro(user_id: str) -> bool:
    sub = get_subscription(user_id)
    return sub is not None and sub["plan"] == "pro" and sub["status"] == "active"


def has_premium_access(user_id: str) -> bool:
    """Return whether a user can access Pro-only product features.

    During the acquisition period, premium entitlements are open to everyone.
    Keep ``is_pro`` separate so subscription records and billing analytics stay
    truthful.
    """
    return not settings.monetization_enabled or is_pro(user_id)


def create_razorpay_subscription(user_id: str, email: str) -> dict:
    """Create a Razorpay subscription and store it in DB. Returns data for frontend checkout."""
    client = _get_razorpay_client()

    rz_sub = client.subscription.create(
        {
            "plan_id": settings.razorpay_plan_id,
            "total_count": 120,  # max billing cycles
            "notes": {"user_id": user_id, "email": email},
        }
    )

    supabase.table("subscriptions").insert(
        {
            "user_id": user_id,
            "razorpay_subscription_id": rz_sub["id"],
            "plan": "pro",
            "status": "pending",
            "amount": rz_sub.get("plan", {}).get("item", {}).get("amount", 19900),
            "currency": rz_sub.get("plan", {}).get("item", {}).get("currency", "INR"),
        }
    ).execute()

    return {
        "subscription_id": rz_sub["id"],
        "razorpay_key_id": settings.razorpay_key_id,
        "amount": rz_sub.get("plan", {}).get("item", {}).get("amount", 19900),
        "currency": "INR",
        "name": "MedSign Pro",
        "description": "Unlimited health assessments, lab reports & more",
    }


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    expected = hmac.HMAC(
        settings.razorpay_webhook_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def activate_subscription(razorpay_subscription_id: str, payment_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("subscriptions").update(
        {
            "status": "active",
            "razorpay_payment_id": payment_id,
            "current_period_start": now,
            "updated_at": now,
        }
    ).eq("razorpay_subscription_id", razorpay_subscription_id).execute()
    logger.info("Subscription %s activated", razorpay_subscription_id)


def cancel_subscription_db(razorpay_subscription_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("subscriptions").update(
        {
            "status": "cancelled",
            "cancelled_at": now,
            "updated_at": now,
        }
    ).eq("razorpay_subscription_id", razorpay_subscription_id).execute()
    logger.info("Subscription %s cancelled", razorpay_subscription_id)


def cancel_razorpay_subscription(user_id: str) -> bool:
    sub = get_subscription(user_id)
    if not sub or sub["status"] != "active" or not sub.get("razorpay_subscription_id"):
        return False
    client = _get_razorpay_client()
    client.subscription.cancel(sub["razorpay_subscription_id"])
    cancel_subscription_db(sub["razorpay_subscription_id"])
    return True


# ── Usage tracking ────────────────────────────────────────────────────────────


def get_usage(user_id: str) -> dict:
    month = get_current_month()
    resp = (
        supabase.table("usage_tracking")
        .select("*")
        .eq("user_id", user_id)
        .eq("month", month)
        .execute()
    )
    if resp.data:
        return resp.data[0]
    return {
        "assessments_used": 0,
        "lab_reports_used": 0,
        "face_scans_used": 0,
        "image_analyses_used": 0,
        "assessments_quota_used": 0,
        "lab_reports_quota_used": 0,
        "face_scans_quota_used": 0,
        "image_analyses_quota_used": 0,
    }


def increment_usage(user_id: str, feature: str) -> None:
    month = get_current_month()
    col = f"{feature}_used"
    quota_col = _quota_usage_column(feature)
    fields = "id, " + col
    if settings.monetization_enabled:
        fields += ", " + quota_col
    resp = (
        supabase.table("usage_tracking")
        .select(fields)
        .eq("user_id", user_id)
        .eq("month", month)
        .execute()
    )
    if resp.data:
        row = resp.data[0]
        update = {col: row[col] + 1, "updated_at": datetime.now(timezone.utc).isoformat()}
        if settings.monetization_enabled:
            update[quota_col] = row.get(quota_col, 0) + 1
        supabase.table("usage_tracking").update(update).eq("id", row["id"]).execute()
    else:
        usage_record = {"user_id": user_id, "month": month, col: 1}
        if settings.monetization_enabled:
            usage_record[quota_col] = 1
        supabase.table("usage_tracking").insert(usage_record).execute()


def check_limit(user_id: str, feature: str) -> dict:
    """Check if user can use a feature. Returns {allowed, used, limit, is_pro}."""
    if not settings.monetization_enabled:
        # Preserve the underlying limits and usage tracking for when paid
        # access returns, but do not make access depend on a billing lookup.
        return {"allowed": True, "used": 0, "limit": -1, "is_pro": False}

    pro = is_pro(user_id)
    if pro:
        return {"allowed": True, "used": 0, "limit": -1, "is_pro": True}

    usage = get_usage(user_id)
    col = _quota_usage_column(feature)
    used = usage.get(col, 0)
    limit = FREE_LIMITS.get(feature, 0)
    return {
        "allowed": used < limit,
        "used": used,
        "limit": limit,
        "is_pro": False,
    }


def get_billing_status(user_id: str) -> dict:
    """Full billing status for the user — plan, usage, limits."""
    sub = get_subscription(user_id)
    pro = sub is not None and sub["plan"] == "pro" and sub["status"] == "active"
    usage = get_usage(user_id)
    unlimited_access = not settings.monetization_enabled or pro

    def usage_entry(feature: str) -> dict:
        usage_col = _quota_usage_column(feature) if settings.monetization_enabled else f"{feature}_used"
        return {
            "used": usage.get(usage_col, 0),
            "limit": -1 if unlimited_access else FREE_LIMITS[feature],
        }

    return {
        "plan": "pro" if pro else "free",
        "status": sub["status"] if sub else "none",
        "current_period_end": sub.get("current_period_end") if sub else None,
        "monetization_enabled": settings.monetization_enabled,
        "usage": {
            "assessments": usage_entry("assessments"),
            "lab_reports": usage_entry("lab_reports"),
            "face_scans": usage_entry("face_scans"),
            "image_analyses": usage_entry("image_analyses"),
        },
        "free_limits": FREE_LIMITS,
    }
