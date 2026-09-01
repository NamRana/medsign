"""MedGemma status and test endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter()


class MedGemmaStatus(BaseModel):
    enabled: bool
    model_id: str
    loaded: bool
    device: str | None = None


@router.get("/status", response_model=MedGemmaStatus)
async def get_status():
    """Check if MedGemma is enabled and loaded."""
    if not settings.medgemma_enabled:
        return MedGemmaStatus(
            enabled=False,
            model_id=settings.medgemma_model_id,
            loaded=False,
        )

    from app.ai.medgemma import _model_loaded, _model

    device = None
    if _model is not None:
        device = str(_model.device)

    return MedGemmaStatus(
        enabled=True,
        model_id=settings.medgemma_model_id,
        loaded=_model_loaded,
        device=device,
    )


@router.post("/warmup")
async def warmup():
    """Pre-load the MedGemma model into GPU memory."""
    if not settings.medgemma_enabled:
        raise HTTPException(status_code=400, detail="MedGemma is not enabled. Set MEDGEMMA_ENABLED=true")

    from app.ai.medgemma import _load_model

    try:
        _load_model()
        return {"status": "ok", "message": "MedGemma model loaded successfully"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load MedGemma: {exc}")
