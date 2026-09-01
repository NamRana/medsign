"""CLI script to ingest medical knowledge into the vector database.

Usage:
    cd backend
    python -m app.rag.cli
"""

import asyncio
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


async def main():
    from app.rag.ingestion import ingest_all

    logger.info("Starting medical knowledge ingestion...")
    result = await ingest_all()
    logger.info(
        "Done! Ingested %d conditions and %d drugs.",
        result["conditions"],
        result["drugs"],
    )


if __name__ == "__main__":
    asyncio.run(main())
