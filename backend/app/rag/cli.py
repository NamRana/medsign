"""CLI script to ingest medical knowledge into the vector database.

Usage:
    cd backend
    python -m app.rag.cli              # ingest JSON conditions + drugs
    python -m app.rag.cli --nfi PATH   # ingest NFI PDF
    python -m app.rag.cli --all PATH   # ingest both JSON and NFI PDF
"""

import asyncio
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


async def main():
    args = sys.argv[1:]

    if "--nfi" in args:
        idx = args.index("--nfi")
        pdf_path = args[idx + 1] if idx + 1 < len(args) else None
        if not pdf_path:
            logger.error("Usage: python -m app.rag.cli --nfi <path-to-nfi-pdf>")
            sys.exit(1)
        from app.rag.nfi_ingestion import ingest_nfi_pdf
        logger.info("Starting NFI PDF ingestion...")
        result = await ingest_nfi_pdf(pdf_path)
        logger.info("NFI ingestion complete: %s", result)

    elif "--all" in args:
        idx = args.index("--all")
        pdf_path = args[idx + 1] if idx + 1 < len(args) else None

        from app.rag.ingestion import ingest_all
        logger.info("Starting JSON knowledge ingestion...")
        result = await ingest_all()
        logger.info("JSON: %d conditions, %d drugs", result["conditions"], result["drugs"])

        if pdf_path:
            from app.rag.nfi_ingestion import ingest_nfi_pdf
            logger.info("Starting NFI PDF ingestion...")
            nfi_result = await ingest_nfi_pdf(pdf_path)
            logger.info("NFI: %s", nfi_result)

    else:
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
