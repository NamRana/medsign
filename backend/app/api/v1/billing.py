"""Billing API — subscription management and usage tracking."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.middleware.auth import get_current_user
from app.services import billing_service

logger = logging.getLogger("medsign.billing")
router = APIRouter()


class SubscribeResponse(BaseModel):
    subscription_id: str
    razorpay_key_id: str
    amount: int
    currency: str
    name: str
    description: str


class BillingStatus(BaseModel):
    plan: str
    status: str
    current_period_end: str | None
    monetization_enabled: bool
    usage: dict
    free_limits: dict


class UsageLimitResponse(BaseModel):
    allowed: bool
    used: int
    limit: int
    is_pro: bool


# ── Subscribe ─────────────────────────────────────────────────────────────────


@router.post("/subscribe", response_model=SubscribeResponse, summary="Create a subscription")
async def subscribe(user=Depends(get_current_user)) -> SubscribeResponse:
    """Create a Razorpay subscription for the current user."""
    if not billing_service.settings.monetization_enabled:
        raise HTTPException(
            status_code=409,
            detail="Subscriptions are temporarily paused while all features are free.",
        )
    if billing_service.is_pro(str(user.id)):
        raise HTTPException(status_code=400, detail="Already subscribed to Pro")
    try:
        data = billing_service.create_razorpay_subscription(
            str(user.id), user.email or ""
        )
        return SubscribeResponse(**data)
    except Exception as exc:
        logger.error("Failed to create subscription: %s", exc)
        raise HTTPException(status_code=502, detail="Payment service error") from exc


# ── Verify payment (frontend callback) ───────────────────────────────────────


class VerifyPaymentRequest(BaseModel):
    razorpay_subscription_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/verify", summary="Verify payment after Razorpay checkout")
async def verify_payment(body: VerifyPaymentRequest, user=Depends(get_current_user)):
    """Verify a payment that may have begun before checkout was paused.

    New checkout is blocked in ``subscribe`` while acquisition mode is active.
    This endpoint deliberately remains available for an in-flight payment so an
    already-initiated Razorpay charge is not left without a matching record.
    """
    import hmac
    import hashlib

    expected_sig = hmac.HMAC(
        billing_service.settings.razorpay_key_secret.encode(),
        f"{body.razorpay_payment_id}|{body.razorpay_subscription_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_sig, body.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    billing_service.activate_subscription(
        body.razorpay_subscription_id, body.razorpay_payment_id
    )
    return {"status": "active", "message": "Subscription activated successfully"}


# ── Webhook (Razorpay server-to-server) ──────────────────────────────────────


@router.post("/webhook", summary="Razorpay webhook handler")
async def razorpay_webhook(request: Request):
    """Handle Razorpay subscription lifecycle events."""
    body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")

    if billing_service.settings.razorpay_webhook_secret:
        if not billing_service.verify_webhook_signature(body, signature):
            logger.warning("Webhook signature verification failed")
            raise HTTPException(status_code=400, detail="Invalid signature")

    payload = json.loads(body)
    event = payload.get("event", "")
    entity = payload.get("payload", {}).get("subscription", {}).get("entity", {})
    sub_id = entity.get("id", "")

    logger.info("Webhook event=%s subscription=%s", event, sub_id)

    if event == "subscription.activated":
        payment_id = payload.get("payload", {}).get("payment", {}).get("entity", {}).get("id", "")
        billing_service.activate_subscription(sub_id, payment_id)
    elif event in ("subscription.cancelled", "subscription.expired"):
        billing_service.cancel_subscription_db(sub_id)
    elif event == "subscription.charged":
        billing_service.activate_subscription(sub_id, entity.get("payment_id", ""))

    return {"status": "ok"}


# ── Cancel ────────────────────────────────────────────────────────────────────


@router.post("/cancel", summary="Cancel subscription")
async def cancel_subscription(user=Depends(get_current_user)):
    """Cancel the user's active subscription."""
    success = billing_service.cancel_razorpay_subscription(str(user.id))
    if not success:
        raise HTTPException(status_code=400, detail="No active subscription to cancel")
    return {"status": "cancelled", "message": "Subscription cancelled"}


# ── Status ────────────────────────────────────────────────────────────────────


@router.get("/status", response_model=BillingStatus, summary="Get billing status")
async def get_billing_status(user=Depends(get_current_user)) -> BillingStatus:
    """Return current plan, usage, and limits."""
    data = billing_service.get_billing_status(str(user.id))
    return BillingStatus(**data)


# ── Usage check (called by frontend before gated actions) ─────────────────


@router.get("/check/{feature}", response_model=UsageLimitResponse, summary="Check usage limit")
async def check_usage_limit(feature: str, user=Depends(get_current_user)) -> UsageLimitResponse:
    """Check if user can use a feature (assessments, lab_reports, face_scans, image_analyses)."""
    valid = {"assessments", "lab_reports", "face_scans", "image_analyses"}
    if feature not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid feature. Must be one of: {', '.join(valid)}")
    data = billing_service.check_limit(str(user.id), feature)
    return UsageLimitResponse(**data)
