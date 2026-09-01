"""Face Analyzer Agent.

Uses Gemini vision model to produce structured wellness scores
from user-uploaded selfie photos for the daily face scan feature.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import BaseModel, Field

from app.ai.gemini import get_gemini_provider

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "face_analysis_v1.txt"


class MetricResult(BaseModel):
    """Score and observations for a single wellness dimension."""

    score: int = Field(ge=0, le=100)
    observations: list[str] = Field(default_factory=list)
    tips: list[str] = Field(default_factory=list)


class SkinMetricResult(MetricResult):
    """Skin quality metric with estimated skin age."""

    estimated_skin_age: int | None = None


class FaceAnalysis(BaseModel):
    """Structured result from the face scan analysis."""

    hair_health: MetricResult = Field(description="Hair health assessment")
    skin_quality: SkinMetricResult = Field(description="Skin quality assessment")
    stress_level: MetricResult = Field(description="Stress level assessment (higher=more stressed)")
    sleep_quality: MetricResult = Field(description="Sleep quality assessment (higher=better rested)")
    overall_summary: str = Field(description="1-2 encouraging sentences")
    top_recommendation: str = Field(description="Single most impactful tip")


class FaceAnalyzer:
    """Analyzes selfie photos for wellness metrics using Gemini vision."""

    def __init__(self) -> None:
        self._system_prompt_template = _PROMPT_PATH.read_text(encoding="utf-8")

    async def analyze(
        self,
        image_data: bytes,
        mime_type: str,
        previous_scan_summary: str | None = None,
    ) -> FaceAnalysis:
        """Analyze a selfie and return structured wellness scores.

        Args:
            image_data: Raw bytes of the selfie image.
            mime_type: MIME type (e.g., "image/jpeg").
            previous_scan_summary: Optional summary of previous scan for comparison.

        Returns:
            FaceAnalysis with scores, observations, and tips.
        """
        provider = get_gemini_provider()

        context = previous_scan_summary or "No previous scan data available — this is the first scan."
        system_prompt = self._system_prompt_template.replace(
            "{previous_scan_context}", context
        )

        user_message = (
            "Analyze this selfie and respond ONLY with valid JSON matching this schema:\n"
            f"{json.dumps(FaceAnalysis.model_json_schema(), indent=2)}\n\n"
            "Provide your structured wellness assessment."
        )

        raw_response = await provider.analyze_image(
            system_prompt=system_prompt,
            user_message=user_message,
            image_data=image_data,
            mime_type=mime_type,
        )

        text = raw_response.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            text = text.rsplit("```", 1)[0]

        try:
            data = json.loads(text)
            return FaceAnalysis.model_validate(data)
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning("Face analysis JSON parse failed: %s", exc)
            return FaceAnalysis(
                hair_health=MetricResult(score=50, observations=["Unable to parse detailed results"], tips=["Try again with better lighting"]),
                skin_quality=SkinMetricResult(score=50, observations=["Unable to parse detailed results"], tips=["Try again with better lighting"]),
                stress_level=MetricResult(score=50, observations=["Unable to parse detailed results"], tips=["Take a deep breath"]),
                sleep_quality=MetricResult(score=50, observations=["Unable to parse detailed results"], tips=["Aim for 7-8 hours tonight"]),
                overall_summary="We had trouble analyzing your photo. Try again with good lighting and a clear face shot.",
                top_recommendation="Retake with natural lighting facing a window.",
            )
