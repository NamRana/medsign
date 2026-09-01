import logging

from fastapi import Depends, HTTPException, Header

from app.dependencies import supabase

logger = logging.getLogger("medsign.auth")


async def get_current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        logger.warning("Auth failed: missing or malformed Authorization header")
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = authorization.removeprefix("Bearer ")
    try:
        response = supabase.auth.get_user(token)
        if not response.user:
            logger.warning("Auth failed: token valid but no user returned")
            raise HTTPException(status_code=401, detail="Invalid token")
        logger.debug("Authenticated user=%s email=%s", str(response.user.id)[:8], response.user.email)
        return response.user
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Auth failed: %s", exc)
        raise HTTPException(status_code=401, detail="Authentication failed")


async def require_admin(user=Depends(get_current_user)):
    """Allow admin endpoints only for roles assigned in trusted app metadata."""
    app_metadata = getattr(user, "app_metadata", None) or {}
    if app_metadata.get("role") != "admin":
        logger.warning("Admin access denied for user=%s", str(user.id)[:8])
        raise HTTPException(status_code=403, detail="Admin access required")
    logger.info("Admin access granted for user=%s", str(user.id)[:8])
    return user
