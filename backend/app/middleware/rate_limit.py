"""Simple in-memory rate limiter for upload endpoints.

Uses a sliding-window counter per user. Not shared across workers —
for multi-process deployments, replace with Redis.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from fastapi import Depends, HTTPException

from app.middleware.auth import get_current_user

logger = logging.getLogger("medsign.ratelimit")

_buckets: dict[str, list[float]] = defaultdict(list)


def _rate_limit(user_id: str, max_requests: int, window_seconds: int) -> None:
    now = time.monotonic()
    bucket = _buckets[user_id]
    _buckets[user_id] = [t for t in bucket if now - t < window_seconds]
    if len(_buckets[user_id]) >= max_requests:
        logger.warning(
            "Rate limit hit: user=%s (%d/%d in %ds)",
            user_id[:8], len(_buckets[user_id]), max_requests, window_seconds,
        )
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Limit: {max_requests} per {window_seconds}s.",
        )
    _buckets[user_id].append(now)


def rate_limit_uploads(user=Depends(get_current_user)) -> None:
    _rate_limit(str(user.id), max_requests=10, window_seconds=60)


def rate_limit_ai(user=Depends(get_current_user)) -> None:
    _rate_limit(str(user.id), max_requests=30, window_seconds=60)
