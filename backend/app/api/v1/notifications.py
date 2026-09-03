"""Notification endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from app.middleware.auth import get_current_user
from app.services import notification_service

router = APIRouter()


@router.get("", summary="List notifications")
async def list_notifications(
    limit: int = 20,
    unread_only: bool = False,
    user=Depends(get_current_user),
):
    user_id = UUID(str(user.id))
    # Process any due follow-ups first
    await notification_service.process_due_follow_ups(user_id)
    notifications = await notification_service.get_notifications(user_id, limit, unread_only)
    unread_count = await notification_service.get_unread_count(user_id)
    return {"notifications": notifications, "unread_count": unread_count}


@router.get("/count", summary="Get unread count")
async def unread_count(user=Depends(get_current_user)):
    user_id = UUID(str(user.id))
    await notification_service.process_due_follow_ups(user_id)
    count = await notification_service.get_unread_count(user_id)
    return {"unread_count": count}


@router.patch("/{notification_id}/read", summary="Mark notification as read")
async def mark_notification_read(notification_id: UUID, user=Depends(get_current_user)):
    user_id = UUID(str(user.id))
    await notification_service.mark_read(user_id, notification_id)
    return {"status": "ok"}


@router.post("/read-all", summary="Mark all as read")
async def mark_all_notifications_read(user=Depends(get_current_user)):
    user_id = UUID(str(user.id))
    count = await notification_service.mark_all_read(user_id)
    return {"status": "ok", "marked": count}
