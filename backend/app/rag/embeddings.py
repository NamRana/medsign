"""Embedding generation using Gemini's text-embedding model."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSION = 768


def _make_client() -> genai.Client:
    http_options: dict[str, Any] = {}
    if settings.environment == "development":
        http_options = {
            "httpx_client": httpx.Client(verify=False),
            "httpx_async_client": httpx.AsyncClient(verify=False),
        }
    return genai.Client(
        api_key=settings.gemini_api_key,
        http_options=types.HttpOptions(**http_options) if http_options else None,
    )


_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = _make_client()
    return _client


async def generate_embedding(text: str) -> list[float]:
    """Generate a 768-dimension embedding for the given text."""
    from google.genai import types as gtypes

    client = _get_client()
    result = await client.aio.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
        config=gtypes.EmbedContentConfig(output_dimensionality=EMBEDDING_DIMENSION),
    )
    return result.embeddings[0].values


async def generate_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a batch of texts."""
    client = _get_client()
    embeddings = []
    # Gemini embedding API supports batching
    for text in texts:
        result = await client.aio.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text,
        )
        embeddings.append(result.embeddings[0].values)
    return embeddings
