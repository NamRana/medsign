"""Request logging middleware.

Logs every API request with method, path, status, duration, and user ID.
Useful for debugging, performance monitoring, and audit trails.
"""

from __future__ import annotations

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("medsign.requests")


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start = time.monotonic()
        method = request.method
        path = request.url.path

        if path in ("/health", "/docs", "/openapi.json", "/favicon.ico"):
            return await call_next(request)

        user_id = "anon"
        try:
            auth = request.headers.get("authorization", "")
            if auth.startswith("Bearer "):
                from app.dependencies import supabase
                resp = supabase.auth.get_user(auth.removeprefix("Bearer "))
                if resp.user:
                    user_id = str(resp.user.id)[:8]
        except Exception:
            pass

        try:
            response = await call_next(request)
            duration_ms = round((time.monotonic() - start) * 1000)
            status = response.status_code

            if status >= 500:
                logger.error(
                    "%s %s → %d (%dms) user=%s",
                    method, path, status, duration_ms, user_id,
                )
            elif status >= 400:
                logger.warning(
                    "%s %s → %d (%dms) user=%s",
                    method, path, status, duration_ms, user_id,
                )
            else:
                logger.info(
                    "%s %s → %d (%dms) user=%s",
                    method, path, status, duration_ms, user_id,
                )

            return response
        except Exception as exc:
            duration_ms = round((time.monotonic() - start) * 1000)
            logger.error(
                "%s %s → EXCEPTION (%dms) user=%s | %s",
                method, path, duration_ms, user_id, exc,
            )
            raise
