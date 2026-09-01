"""Abstract AI provider interface.

All AI providers must implement this interface so the rest of the app
remains decoupled from any specific model vendor.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class AIProvider(ABC):
    """Base class for AI model providers."""

    # ── Text generation ───────────────────────────────────────────────────────

    @abstractmethod
    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        conversation_history: list[dict[str, str]] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        """Generate a free-text response.

        Args:
            system_prompt: Instructions for the model.
            user_message: The latest user turn.
            conversation_history: Prior turns as list of
                ``{"role": "user"|"assistant", "content": "..."}``.
            temperature: Sampling temperature (0.0–1.0).
            max_tokens: Maximum tokens in the response.

        Returns:
            The generated text.
        """

    @abstractmethod
    async def generate_structured(
        self,
        system_prompt: str,
        user_message: str,
        response_schema: type,
        conversation_history: list[dict[str, str]] | None = None,
        temperature: float = 0.2,
        max_tokens: int = 1024,
    ) -> Any:
        """Generate a structured response validated against a Pydantic model.

        Args:
            system_prompt: Instructions for the model.
            user_message: The latest user turn.
            response_schema: A Pydantic ``BaseModel`` subclass; the returned
                object will be an instance of this class.
            conversation_history: Prior turns.
            temperature: Sampling temperature.
            max_tokens: Maximum tokens in the response.

        Returns:
            An instance of ``response_schema``.
        """

    @abstractmethod
    async def analyze_image(
        self,
        system_prompt: str,
        user_message: str,
        image_data: bytes,
        mime_type: str = "image/jpeg",
    ) -> str:
        """Analyze an image and return a text description.

        Args:
            system_prompt: Instructions for the model.
            user_message: Prompt/question about the image.
            image_data: Raw image bytes.
            mime_type: MIME type of the image.

        Returns:
            The model's analysis as text.
        """
