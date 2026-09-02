"""NFI (National Formulary of India) PDF ingestion.

Parses the NFI PDF into:
1. Structured drug entries → drug_reference table
2. Section-aware chunks → medical_chunks table (for RAG)

Usage:
    python -m app.rag.nfi_ingestion /path/to/NFI_2011.pdf
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import sys
from pathlib import Path
from uuid import uuid4

from pypdf import PdfReader

logger = logging.getLogger("medsign.nfi_ingestion")

DRUG_MONOGRAPH_PATTERN = re.compile(
    r"^([A-Z][a-zA-Z\s\-\(\)/,]+)\s*\n"
    r"(?:Pregnancy Category[- ]*([A-DX])\s*\n)?"
    r"(?:Schedule [A-Z]\s*\n)?",
    re.MULTILINE,
)

SECTION_HEADERS = [
    "Indications", "Availability", "Dose", "Contraindications",
    "Precautions", "Adverse Effects", "Storage", "Drug Interactions",
    "Patient Counselling", "Dosage Forms",
]


def extract_full_text(pdf_path: str) -> tuple[str, list[tuple[int, str]]]:
    """Extract text from PDF, returning full text and per-page list."""
    reader = PdfReader(pdf_path)
    pages: list[tuple[int, str]] = []
    full_parts: list[str] = []

    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        pages.append((i + 1, text))
        if text.strip():
            full_parts.append(f"[PAGE {i + 1}]\n{text}")

    return "\n\n".join(full_parts), pages


def split_into_sections(full_text: str) -> list[dict]:
    """Split NFI text into chapter-level sections with metadata."""
    chapter_pattern = re.compile(
        r"\n(\d{1,2})\.\s+([A-Z][A-Za-z,\s\-&]+(?:Drugs?|Agents?|Preparations?|Vitamins?|Minerals?|Solutions?|Hormones?)[A-Za-z,\s\-&]*)\n",
    )

    chapters: list[dict] = []
    matches = list(chapter_pattern.finditer(full_text))

    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
        chapter_text = full_text[start:end].strip()

        chapters.append({
            "chapter_number": match.group(1),
            "chapter_title": match.group(2).strip(),
            "content": chapter_text,
        })

    if not chapters:
        chapters.append({
            "chapter_number": "0",
            "chapter_title": "National Formulary of India",
            "content": full_text,
        })

    return chapters


def chunk_section(section: dict, chunk_size: int = 1500, overlap: int = 200) -> list[dict]:
    """Split a section into overlapping chunks preserving drug boundaries."""
    content = section["content"]
    if len(content) <= chunk_size:
        return [{"content": content, **{k: v for k, v in section.items() if k != "content"}}]

    chunks: list[dict] = []
    start = 0

    while start < len(content):
        end = start + chunk_size

        if end >= len(content):
            chunk_text = content[start:].strip()
            if chunk_text:
                chunks.append({
                    "content": chunk_text,
                    "chapter_number": section["chapter_number"],
                    "chapter_title": section["chapter_title"],
                })
            break

        boundary_start = end - chunk_size // 4
        best_break = -1
        for sep in ("\n\n", "\nIndications", "\nDose", "\nContraindications", "\n"):
            idx = content.rfind(sep, boundary_start, end)
            if idx != -1 and idx > start:
                best_break = idx
                break

        if best_break > start:
            end = best_break

        chunk_text = content[start:end].strip()
        if chunk_text:
            chunks.append({
                "content": chunk_text,
                "chapter_number": section["chapter_number"],
                "chapter_title": section["chapter_title"],
            })

        start = end - overlap
        if start <= (end - chunk_size):
            start = end

    return chunks


def extract_drug_entries(pages: list[tuple[int, str]]) -> list[dict]:
    """Try to extract structured drug entries from the PDF pages."""
    drugs: list[dict] = []
    drug_start_pattern = re.compile(
        r"^([A-Z][a-z]+(?:\s[A-Z]?[a-z]+)*(?:\s*\([^)]+\))?)\s*\*?\s*\n"
        r"Pregnancy\s+Category[- ]*([A-DX])",
        re.MULTILINE,
    )

    full_drug_text = "\n".join(text for _, text in pages if text.strip())
    matches = list(drug_start_pattern.finditer(full_drug_text))

    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else start + 3000
        end = min(end, len(full_drug_text))
        block = full_drug_text[start:end]

        drug_name = match.group(1).strip().rstrip("*")
        pregnancy_cat = match.group(2).strip()

        indications = _extract_field(block, "Indications")
        dose_text = _extract_field(block, "Dose")
        contraindications = _extract_field(block, "Contraindications")
        adverse_effects = _extract_field(block, "Adverse Effects")
        precautions = _extract_field(block, "Precautions")

        if indications:
            drugs.append({
                "generic_name": drug_name,
                "pregnancy_category": pregnancy_cat,
                "indications_text": indications,
                "dose_text": dose_text or "",
                "contraindications_text": contraindications or "",
                "adverse_effects_text": adverse_effects or "",
                "precautions_text": precautions or "",
                "source": "National Formulary of India 2011",
            })

    return drugs


def _extract_field(block: str, field_name: str) -> str | None:
    """Extract text between a field header and the next field header."""
    pattern = re.compile(
        rf"{field_name}\s*\n(.*?)(?=\n(?:{'|'.join(SECTION_HEADERS)})\s*\n|\Z)",
        re.DOTALL,
    )
    match = pattern.search(block)
    if match:
        text = match.group(1).strip()
        text = re.sub(r"\s+", " ", text)
        return text[:500]
    return None


async def ingest_nfi_pdf(pdf_path: str) -> dict:
    """Main entry point: ingest the NFI PDF into both chunks and drug_reference."""
    from app.dependencies import supabase
    from app.rag.document_ingestion import create_document_record
    from app.rag.embeddings import generate_embedding

    logger.info("Starting NFI PDF ingestion from: %s", pdf_path)

    # Extract text
    full_text, pages = extract_full_text(pdf_path)
    logger.info("Extracted %d pages, %d total characters", len(pages), len(full_text))

    # --- Part 1: Section-aware chunking for RAG ---
    doc_id = await create_document_record(
        title="National Formulary of India 2011",
        source="Indian Pharmacopoeia Commission",
        source_type="formulary",
        version="4th Edition",
        publication_date="2011-01-01",
        topic="Drug formulary and prescribing guidelines",
        country="IN",
    )

    sections = split_into_sections(full_text)
    logger.info("Split into %d chapter sections", len(sections))

    all_chunks: list[dict] = []
    for section in sections:
        all_chunks.extend(chunk_section(section))

    logger.info("Created %d total chunks", len(all_chunks))

    stored_chunks = 0
    for idx, chunk in enumerate(all_chunks):
        try:
            embedding = await generate_embedding(chunk["content"][:2000])
        except Exception as exc:
            logger.error("Embedding failed for chunk %d: %s", idx, exc)
            continue

        payload = {
            "id": str(uuid4()),
            "document_id": doc_id,
            "content": chunk["content"],
            "embedding": embedding,
            "chunk_index": idx,
            "metadata": {
                "source_file": "NFI_2011.pdf",
                "chapter_number": chunk.get("chapter_number"),
                "chapter_title": chunk.get("chapter_title"),
                "type": "nfi_formulary",
            },
        }

        try:
            supabase.table("medical_chunks").insert(payload).execute()
            stored_chunks += 1
            if stored_chunks % 50 == 0:
                logger.info("Stored %d/%d chunks...", stored_chunks, len(all_chunks))
        except Exception as exc:
            logger.error("Failed to store chunk %d: %s", idx, exc)

    logger.info("Stored %d/%d chunks for RAG", stored_chunks, len(all_chunks))

    # --- Part 2: Extract structured drug entries ---
    drug_entries = extract_drug_entries(pages)
    logger.info("Extracted %d structured drug entries", len(drug_entries))

    stored_drugs = 0
    for drug in drug_entries:
        drug_text = (
            f"Drug: {drug['generic_name']}\n"
            f"Indications: {drug['indications_text']}\n"
            f"Dosage: {drug['dose_text']}\n"
            f"Contraindications: {drug['contraindications_text']}\n"
        )

        try:
            embedding = await generate_embedding(drug_text[:2000])
        except Exception as exc:
            logger.error("Embedding failed for drug %s: %s", drug["generic_name"], exc)
            continue

        indications = [s.strip() for s in drug["indications_text"].split(";") if s.strip()]
        contraindications = [s.strip() for s in drug["contraindications_text"].split(";") if s.strip()]
        side_effects = [s.strip() for s in drug["adverse_effects_text"].split(";") if s.strip()]

        payload = {
            "id": str(uuid4()),
            "generic_name": drug["generic_name"],
            "brand_names": [],
            "drug_class": "",
            "indications": indications[:10],
            "adult_dosage": drug["dose_text"][:300],
            "frequency": "",
            "contraindications": contraindications[:10],
            "side_effects": side_effects[:10],
            "interactions": [],
            "pregnancy_category": drug.get("pregnancy_category"),
            "available_in_india": True,
            "otc": False,
            "source": "National Formulary of India 2011",
            "embedding": embedding,
        }

        try:
            supabase.table("drug_reference").insert(payload).execute()
            stored_drugs += 1
        except Exception as exc:
            logger.error("Failed to store drug %s: %s", drug["generic_name"], exc)

    logger.info("Stored %d/%d structured drugs", stored_drugs, len(drug_entries))

    return {
        "document_id": doc_id,
        "pages": len(pages),
        "chunks_stored": stored_chunks,
        "chunks_total": len(all_chunks),
        "drugs_extracted": len(drug_entries),
        "drugs_stored": stored_drugs,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")

    if len(sys.argv) < 2:
        print("Usage: python -m app.rag.nfi_ingestion <path-to-nfi-pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    result = asyncio.run(ingest_nfi_pdf(pdf_path))
    print(json.dumps(result, indent=2))
