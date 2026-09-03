"""Billing service — Razorpay subscription management and usage tracking."""

from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone

import razorpay

from app.config import settings
from app.dependencies import supabase

logger = logging.getLogger("medsign.billing")

FREE_LIMITS = {
    "assessments": 3,
    "lab_reports": 1,
    "face_scans": 3,
    "image_analyses": 1,
}

_rz_client: razorpay.Client | None = None


def _get_razorpay_client() -> razorpay.Client:
    global _rz_client
    if _rz_client is None:
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
    }


def increment_usage(user_id: str, feature: str) -> None:
    month = get_current_month()
    col = f"{feature}_used"
    resp = (
        supabase.table("usage_tracking")
        .select("id, " + col)
        .eq("user_id", user_id)
        .eq("month", month)
        .execute()
    )
    if resp.data:
        row = resp.data[0]
        supabase.table("usage_tracking").update(
            {col: row[col] + 1, "updated_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", row["id"]).execute()
    else:
        supabase.table("usage_tracking").insert(
            {"user_id": user_id, "month": month, col: 1}
        ).execute()


def check_limit(user_id: str, feature: str) -> dict:
    """Check if user can use a feature. Returns {allowed, used, limit, is_pro}."""
    pro = is_pro(user_id)
    if pro:
        return {"allowed": True, "used": 0, "limit": -1, "is_pro": True}

    usage = get_usage(user_id)
    col = f"{feature}_used"
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

    return {
        "plan": "pro" if pro else "free",
        "status": sub["status"] if sub else "none",
        "current_period_end": sub.get("current_period_end") if sub else None,
        "usage": {
            "assessments": {"used": usage.get("assessments_used", 0), "limit": -1 if pro else FREE_LIMITS["assessments"]},
            "lab_reports": {"used": usage.get("lab_reports_used", 0), "limit": -1 if pro else FREE_LIMITS["lab_reports"]},
            "face_scans": {"used": usage.get("face_scans_used", 0), "limit": -1 if pro else FREE_LIMITS["face_scans"]},
            "image_analyses": {"used": usage.get("image_analyses_used", 0), "limit": -1 if pro else FREE_LIMITS["image_analyses"]},
        },
        "free_limits": FREE_LIMITS,
    }
