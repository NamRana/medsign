"""MedGemma AI provider — self-hosted via Hugging Face Transformers.

MedGemma is Google's medical AI model fine-tuned for:
  - Medical image analysis (dermatology, radiology, ophthalmology)
  - Clinical text understanding and reasoning
  - Medical Q&A with evidence-based responses

Requires:
  - GPU with ≥16GB VRAM (A100/L4/RTX 4090) for the 4B multimodal model
  - HF_TOKEN environment variable with access to google/medgemma-4b-it
  - ~10GB disk for model weights on first download
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from io import BytesIO
from typing import Any

from pydantic import BaseModel, ValidationError

from app.ai.provider import AIProvider
from app.config import settings

logger = logging.getLogger(__name__)

_model_loaded = False
_pipeline = None
_processor = None
_model = None


def _load_model():
    """Lazy-load MedGemma model on first call. Keeps startup fast."""
    global _model_loaded, _pipeline, _processor, _model

    if _model_loaded:
        return

    import torch
    from transformers import AutoModelForImageTextToText, AutoProcessor

    model_id = settings.medgemma_model_id

    logger.info("Loading MedGemma model: %s (this may take 30-60s on first run)", model_id)

    _processor = AutoProcessor.from_pretrained(
        model_id,
        token=settings.hf_token,
    )

    _model = AutoModelForImageTextToText.from_pretrained(
        model_id,
        token=settings.hf_token,
        torch_dtype=torch.bfloat16,
        device_map="auto",
    )

    _model_loaded = True
    logger.info("MedGemma model loaded successfully on device: %s", _model.device)


class MedGemmaProvider(AIProvider):
    """Medical AI provider using self-hosted MedGemma via HuggingFace Transformers."""

    def __init__(self) -> None:
        pass

    def _generate_text(
        self,
        messages: list[dict],
        max_new_tokens: int = 1024,
        temperature: float = 0.4,
    ) -> str:
        """Run inference through MedGemma."""
        import torch

        _load_model()

        inputs = _processor.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
        ).to(_model.device)

        with torch.inference_mode():
            output_ids = _model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=temperature > 0,
                temperature=temperature if temperature > 0 else None,
            )

        input_len = inputs["input_ids"].shape[-1]
        generated_ids = output_ids[0][input_len:]
        return _processor.decode(generated_ids, skip_special_tokens=True)

    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        conversation_history: list[dict[str, str]] | None = None,
        temperature: float = 0.4,
        max_tokens: int = 1024,
    ) -> str:
        messages = []

        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        for turn in conversation_history or []:
            messages.append({
                "role": turn.get("role", "user"),
                "content": turn["content"],
            })

        messages.append({"role": "user", "content": user_message})

        return await asyncio.to_thread(self._generate_text, messages, max_new_tokens, temperature)

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
            f"\n\nRespond ONLY with valid JSON matching this schema:\n"
            f"{json.dumps(response_schema.model_json_schema(), indent=2)}"
        )

        raw = await self.generate(
            system_prompt=system_prompt + json_instruction,
            user_message=user_message,
            conversation_history=conversation_history,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            text = text.rsplit("```", 1)[0]

        data = json.loads(text)
        return response_schema.model_validate(data)

    async def analyze_image(
        self,
        system_prompt: str,
        user_message: str,
        image_data: bytes,
        mime_type: str = "image/jpeg",
    ) -> str:
        """Analyze a medical image using MedGemma's multimodal capabilities."""
        from PIL import Image

        _load_model()

        image = Image.open(BytesIO(image_data)).convert("RGB")

        messages = [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": user_message},
                ],
            },
        ]

        return await asyncio.to_thread(self._generate_text, messages, 1024, 0.3)


_provider: MedGemmaProvider | None = None


def get_medgemma_provider() -> MedGemmaProvider:
    """Return (or lazily create) the module-level MedGemmaProvider singleton."""
    global _provider
    if _provider is None:
        _provider = MedGemmaProvider()
    return _provider
