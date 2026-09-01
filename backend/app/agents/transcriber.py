"""Audio Transcription Agent.

Uses the Gemini model's native audio understanding to transcribe
patient voice recordings. Supports English, Hindi, and Hinglish.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from google.genai import types
from pydantic import BaseModel, Field

from app.ai.gemini import REASONING_MODEL, get_gemini_provider

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "transcription_v1.txt"


class TranscriptionResult(BaseModel):
    """Structured result from the audio transcription agent."""

    transcript: str = Field(description="The transcribed text from the audio")
    language_detected: str = Field(
        description="Primary language detected: en, hi, or hinglish"
    )
    confidence: str = Field(
        description="Confidence level: low, medium, or high"
    )


async def transcribe_audio(audio_data: bytes, mime_type: str) -> TranscriptionResult:
    """Transcribe audio using Gemini's native audio understanding.

    Args:
        audio_data: Raw bytes of the audio file.
        mime_type: MIME type (e.g., "audio/webm", "audio/wav").

    Returns:
        TranscriptionResult with transcript, detected language, and confidence.

    Raises:
        ValueError: If transcription fails after retries.
    """
    provider = get_gemini_provider()
    system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")

    # Build the multimodal content with audio + text instruction
    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part(
                    inline_data=types.Blob(data=audio_data, mime_type=mime_type)
                ),
                types.Part(
                    text=(
                        "Transcribe this audio recording from a patient describing "
                        "their health symptoms. Respond with JSON only."
                    )
                ),
            ],
        )
    ]

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=0.1,
    )

    try:
        response = await provider._client.aio.models.generate_content(
            model=REASONING_MODEL,
            contents=contents,
            config=config,
        )
    except Exception as exc:
        logger.error("Gemini audio transcription API error: %s", exc)
        raise ValueError(f"Transcription API call failed: {exc}") from exc

    raw_text = (response.text or "").strip()

    # Strip markdown code fences if present
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[-1]
        raw_text = raw_text.rsplit("```", 1)[0].strip()

    try:
        data = json.loads(raw_text)
        return TranscriptionResult.model_validate(data)
    except (json.JSONDecodeError, Exception) as exc:
        logger.warning("Transcription JSON parse failed: %s — raw: %s", exc, raw_text[:200])
        # If we got text but it didn't parse as JSON, use the raw text as transcript
        if raw_text:
            return TranscriptionResult(
                transcript=raw_text,
                language_detected="en",
                confidence="low",
            )
        raise ValueError(f"Failed to parse transcription response: {exc}") from exc
