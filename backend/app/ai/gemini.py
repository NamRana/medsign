"""Gemini AI provider implementation using the google-genai library.

Models used:
  - gemini-2.5-flash       → reasoning / interview questions
  - gemini-2.5-flash-lite  → cheap extraction tasks

SSL verification is disabled in development to work around Python 3.14 cert
issues on this machine (matches the pattern in dependencies.py).
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from app.ai.provider import AIProvider
from app.config import settings

logger = logging.getLogger(__name__)

REASONING_MODEL = "gemini-3.5-flash"
LITE_MODEL = "gemini-3.5-flash-lite"
_MAX_RETRIES = 2


def _make_client() -> genai.Client:
    """Build a Gemini client with SSL verification disabled in development."""
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


class GeminiProvider(AIProvider):
    """Implements AIProvider using the google-genai SDK."""

    def __init__(self) -> None:
        self._client = _make_client()

    # ── helpers ───────────────────────────────────────────────────────────────

    def _build_contents(
        self,
        user_message: str,
        conversation_history: list[dict[str, str]] | None,
    ) -> list[types.Content]:
        """Convert history + current message into genai Content objects."""
        contents: list[types.Content] = []
        for turn in conversation_history or []:
            role = turn.get("role", "user")
            # genai uses "model" not "assistant"
            if role == "assistant":
                role = "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part(text=turn["content"])],
                )
            )
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part(text=user_message)],
            )
        )
        return contents

    # ── AIProvider implementation ─────────────────────────────────────────────

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        conversation_history: list[dict[str, str]] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        contents = self._build_contents(user_message, conversation_history)
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
            max_output_tokens=max_tokens,
        )
        response = await self._client.aio.models.generate_content(
            model=REASONING_MODEL,
            contents=contents,
            config=config,
        )
        return response.text or ""

    async def generate_structured(
        self,
        system_prompt: str,
        user_message: str,
        response_schema: type,
        conversation_history: list[dict[str, str]] | None = None,
        temperature: float = 0.2,
        max_tokens: int = 1024,
        use_lite_model: bool = False,
    ) -> Any:
        """Generate a response validated against a Pydantic model.

        Uses JSON mode + Pydantic parsing with up to ``_MAX_RETRIES`` retries
        on malformed output.
        """
        model = LITE_MODEL if use_lite_model else REASONING_MODEL
        contents = self._build_contents(user_message, conversation_history)

        json_instruction = (
            f"\n\nRespond ONLY with valid JSON that matches this schema:\n"
            f"{json.dumps(response_schema.model_json_schema(), indent=2)}"
        )
        config = types.GenerateContentConfig(
            system_instruction=system_prompt + json_instruction,
            temperature=temperature,
            max_output_tokens=max_tokens,
        )

        last_error: Exception | None = None
        for attempt in range(_MAX_RETRIES + 1):
            try:
                response = await self._client.aio.models.generate_content(
                    model=model,
                    contents=contents,
                    config=config,
                )
                raw_text = (response.text or "").strip()
                # Strip markdown code fences if present
                if raw_text.startswith("```"):
                    raw_text = raw_text.split("\n", 1)[-1]
                    raw_text = raw_text.rsplit("```", 1)[0]

                data = json.loads(raw_text)
                return response_schema.model_validate(data)
            except (json.JSONDecodeError, ValidationError) as exc:
                last_error = exc
                logger.warning(
                    "Structured output parse failed (attempt %d/%d): %s",
                    attempt + 1,
                    _MAX_RETRIES + 1,
                    exc,
                )
            except Exception as exc:
                logger.error("Gemini API error: %s", exc)
                raise

        raise ValueError(
            f"Failed to parse structured response after {_MAX_RETRIES + 1} attempts: {last_error}"
        )

    async def analyze_image(
        self,
        system_prompt: str,
        user_message: str,
        image_data: bytes,
        mime_type: str = "image/jpeg",
    ) -> str:
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.4,
        )
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part(
                        inline_data=types.Blob(data=image_data, mime_type=mime_type)
                    ),
                    types.Part(text=user_message),
                ],
            )
        ]
        response = await self._client.aio.models.generate_content(
            model=REASONING_MODEL,
            contents=contents,
            config=config,
        )
        return response.text or ""


# ── Module-level singleton ────────────────────────────────────────────────────

_provider: GeminiProvider | None = None


def get_gemini_provider() -> GeminiProvider:
    """Return (or lazily create) the module-level GeminiProvider singleton."""
    global _provider
    if _provider is None:
        _provider = GeminiProvider()
    return _provider


def get_ai_provider() -> AIProvider:
    """Return the configured AI provider (Gemini or Bedrock)."""
    if settings.ai_provider == "bedrock":
        from app.ai.bedrock import get_bedrock_provider
        return get_bedrock_provider()
    return get_gemini_provider()
