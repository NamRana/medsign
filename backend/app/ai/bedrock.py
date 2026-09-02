"""AWS Bedrock Mantle AI provider (OpenAI-compatible API)."""

from __future__ import annotations

import base64
import json
import logging
from typing import Any

import httpx
from pydantic import ValidationError

from app.ai.provider import AIProvider
from app.config import settings

logger = logging.getLogger(__name__)

_MAX_RETRIES = 2


def _make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.bedrock_endpoint,
        headers={
            "Authorization": f"Bearer {settings.bedrock_api_token}",
            "Content-Type": "application/json",
        },
        verify=settings.environment != "development",
        timeout=60,
    )


class BedrockProvider(AIProvider):

    def __init__(self) -> None:
        self._client = _make_client()
        self._model = settings.bedrock_model

    def _build_messages(
        self,
        system_prompt: str,
        user_message: str,
        conversation_history: list[dict[str, str]] | None,
    ) -> list[dict]:
        messages: list[dict] = [{"role": "system", "content": system_prompt}]
        for turn in conversation_history or []:
            role = turn.get("role", "user")
            if role == "model":
                role = "assistant"
            messages.append({"role": role, "content": turn["content"]})
        messages.append({"role": "user", "content": user_message})
        return messages

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        conversation_history: list[dict[str, str]] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        messages = self._build_messages(system_prompt, user_message, conversation_history)
        resp = await self._client.post(
            "/v1/chat/completions",
            json={
                "model": self._model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

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
        json_instruction = (
            f"\n\nRespond ONLY with valid JSON that matches this schema:\n"
            f"{json.dumps(response_schema.model_json_schema(), indent=2)}"
        )
        messages = self._build_messages(
            system_prompt + json_instruction, user_message, conversation_history
        )

        last_error: Exception | None = None
        for attempt in range(_MAX_RETRIES + 1):
            try:
                resp = await self._client.post(
                    "/v1/chat/completions",
                    json={
                        "model": self._model,
                        "messages": messages,
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                    },
                )
                resp.raise_for_status()
                raw_text = resp.json()["choices"][0]["message"]["content"].strip()
                if raw_text.startswith("```"):
                    raw_text = raw_text.split("\n", 1)[-1]
                    raw_text = raw_text.rsplit("```", 1)[0]

                data = json.loads(raw_text)
                return response_schema.model_validate(data)
            except (json.JSONDecodeError, ValidationError) as exc:
                last_error = exc
                logger.warning(
                    "Structured output parse failed (attempt %d/%d): %s",
                    attempt + 1, _MAX_RETRIES + 1, exc,
                )
            except Exception as exc:
                logger.error("Bedrock Mantle API error: %s", exc)
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
        b64_image = base64.standard_b64encode(image_data).decode("utf-8")
        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{b64_image}",
                        },
                    },
                    {"type": "text", "text": user_message},
                ],
            },
        ]
        resp = await self._client.post(
            "/v1/chat/completions",
            json={
                "model": self._model,
                "messages": messages,
                "max_tokens": 2048,
                "temperature": 0.4,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


_provider: BedrockProvider | None = None


def get_bedrock_provider() -> BedrockProvider:
    global _provider
    if _provider is None:
        _provider = BedrockProvider()
    return _provider
