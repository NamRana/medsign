"""Notification and follow-up service."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.dependencies import supabase

FOLLOW_UP_SCHEDULE = [
    {"hours": 24, "number": 1, "title": "How are you feeling?", "template": "You reported \"{complaint}\" yesterday. Are you feeling better? If symptoms persist, start a new assessment."},
    {"hours": 72, "number": 2, "title": "Health check-in", "template": "It's been 3 days since your \"{complaint}\" assessment. Still experiencing issues? Let us help."},
    {"hours": 168, "number": 3, "title": "Weekly follow-up", "template": "A week has passed since your \"{complaint}\" concern. We hope you're doing better! Tap to update us."},
]


async def schedule_follow_ups(user_id: UUID, conversation_id: UUID, chief_complaint: str | None) -> None:
    complaint = chief_complaint or "health concern"
    now = datetime.now(timezone.utc)

    rows = []
    for schedule in FOLLOW_UP_SCHEDULE:
        rows.append({
            "user_id": str(user_id),
            "conversation_id": str(conversation_id),
            "chief_complaint": complaint,
            "scheduled_at": (now + timedelta(hours=schedule["hours"])).isoformat(),
            "follow_up_number": schedule["number"],
            "status": "pending",
        })

    try:
        supabase.table("follow_ups").insert(rows).execute()
    except Exception:
        pass


async def process_due_follow_ups(user_id: UUID) -> int:
    """Check for due follow-ups and create notifications. Returns count created."""
    now = datetime.now(timezone.utc).isoformat()

    try:
        resp = (
            supabase.table("follow_ups")
            .select("*")
            .eq("user_id", str(user_id))
            .eq("status", "pending")
            .lte("scheduled_at", now)
            .order("scheduled_at")
            .execute()
        )
    except Exception:
        return 0

    if not resp.data:
        return 0

    count = 0
    for fu in resp.data:
        complaint = fu.get("chief_complaint", "health concern")
        number = fu.get("follow_up_number", 1)
        convo_id = fu.get("conversation_id")

        schedule = FOLLOW_UP_SCHEDULE[min(number - 1, len(FOLLOW_UP_SCHEDULE) - 1)]
        title = schedule["title"]
        body = schedule["template"].format(complaint=complaint)
        icon = "heart" if number == 1 else "bell" if number == 2 else "check"

        try:
            supabase.table("notifications").insert({
                "user_id": str(user_id),
                "title": title,
                "body": body,
                "type": "follow_up",
                "icon": icon,
                "action_url": f"/chat?id={convo_id}" if convo_id else "/chat",
                "metadata": {"conversation_id": convo_id, "follow_up_number": number, "chief_complaint": complaint},
            }).execute()

            supabase.table("follow_ups").update({"status": "sent"}).eq("id", fu["id"]).execute()
            count += 1
        except Exception:
            continue

    return count


async def get_notifications(user_id: UUID, limit: int = 20, unread_only: bool = False) -> list[dict]:
    try:
        query = (
            supabase.table("notifications")
            .select("*")
            .eq("user_id", str(user_id))
            .order("created_at", desc=True)
            .limit(limit)
        )
        if unread_only:
            query = query.eq("read", False)
        resp = query.execute()
        return resp.data or []
    except Exception:
        return []


async def get_unread_count(user_id: UUID) -> int:
    try:
        resp = (
            supabase.table("notifications")
            .select("id", count="exact")
            .eq("user_id", str(user_id))
            .eq("read", False)
            .execute()
        )
        return resp.count or 0
    except Exception:
        return 0


async def mark_read(user_id: UUID, notification_id: UUID) -> None:
    try:
        supabase.table("notifications").update({"read": True}).eq("id", str(notification_id)).eq("user_id", str(user_id)).execute()
    except Exception:
        pass


async def mark_all_read(user_id: UUID) -> int:
    try:
        resp = supabase.table("notifications").update({"read": True}).eq("user_id", str(user_id)).eq("read", False).execute()
        return len(resp.data) if resp.data else 0
    except Exception:
        return 0


async def create_notification(
    user_id: UUID,
    title: str,
    body: str,
    notification_type: str = "system",
    icon: str = "bell",
    action_url: str | None = None,
    metadata: dict | None = None,
) -> dict | None:
    try:
        resp = supabase.table("notifications").insert({
            "user_id": str(user_id),
            "title": title,
            "body": body,
            "type": notification_type,
            "icon": icon,
            "action_url": action_url,
            "metadata": metadata or {},
        }).execute()
        return resp.data[0] if resp.data else None
    except Exception:
        return None
