import logging
import sys

import truststore
truststore.inject_into_ssl()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

# Configure logging BEFORE importing anything else
logging.basicConfig(
    level=logging.DEBUG if settings.environment == "development" else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
    force=True,
)

logger = logging.getLogger("medsign")
logger.info("Starting MedSign (env=%s)", settings.environment)

from app.api.v1.router import api_router  # noqa: E402
from app.middleware.request_logger import RequestLoggerMiddleware  # noqa: E402

app = FastAPI(
    title="MedSign",
    description="AI-powered health assessment API",
    version="0.1.0",
    docs_url="/docs" if settings.environment == "development" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggerMiddleware)

app.include_router(api_router, prefix="/api/v1")


@app.on_event("startup")
async def startup():
    logger.info("=" * 50)
    logger.info("MedSign starting up...")
    logger.info("  Environment: %s", settings.environment)
    logger.info("  Supabase URL: %s", settings.supabase_url[:40] + "...")
    logger.info("  Gemini API key: %s", "set" if settings.gemini_api_key else "MISSING")
    logger.info("  MedGemma enabled: %s", settings.medgemma_enabled)
    logger.info("  CORS origins: %s", settings.cors_origins)

    # Test Supabase connection
    try:
        from app.dependencies import supabase
        supabase.table("conversations").select("id").limit(1).execute()
        logger.info("  Supabase connection: OK")
    except Exception as exc:
        logger.error("  Supabase connection: FAILED - %s", exc)

    logger.info("=" * 50)
    logger.info("MedSign ready at http://localhost:8000")
    logger.info("  Docs: http://localhost:8000/docs")


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
