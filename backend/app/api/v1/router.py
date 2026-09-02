from fastapi import APIRouter

from app.api.v1.admin import router as admin_router
from app.api.v1.drug_reference import router as drug_reference_router
from app.api.v1.audio import router as audio_router
from app.api.v1.face_scans import router as face_scans_router
from app.api.v1.family import router as family_router
from app.api.v1.history import router as history_router
from app.api.v1.auth import router as auth_router
from app.api.v1.conversations import router as conversations_router
from app.api.v1.documents import router as documents_router
from app.api.v1.images import router as images_router
from app.api.v1.insights import router as insights_router
from app.api.v1.knowledge import router as knowledge_router
from app.api.v1.medgemma import router as medgemma_router
from app.api.v1.medicines import router as medicines_router
from app.api.v1.patients import router as patients_router
from app.api.v1.reports import router as reports_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(patients_router, prefix="/patients", tags=["patients"])
api_router.include_router(
    conversations_router, prefix="/conversations", tags=["conversations"]
)
api_router.include_router(face_scans_router, prefix="/face-scans", tags=["face-scans"])
api_router.include_router(family_router, prefix="/family", tags=["family"])
api_router.include_router(medicines_router, prefix="/medicines", tags=["medicines"])
api_router.include_router(knowledge_router, prefix="/knowledge", tags=["knowledge"])
api_router.include_router(documents_router, prefix="/documents", tags=["documents"])
api_router.include_router(images_router, prefix="/images", tags=["images"])
api_router.include_router(audio_router, prefix="/audio", tags=["audio"])
api_router.include_router(medgemma_router, prefix="/medgemma", tags=["medgemma"])
api_router.include_router(reports_router, prefix="/reports", tags=["reports"])
api_router.include_router(admin_router, prefix="/admin", tags=["admin"])
api_router.include_router(drug_reference_router, prefix="/drug-reference", tags=["drug-reference"])
api_router.include_router(history_router, prefix="/history", tags=["history"])
api_router.include_router(insights_router, prefix="/insights", tags=["insights"])
