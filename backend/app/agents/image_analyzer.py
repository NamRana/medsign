"""Image Analyzer Agent.

Uses MedGemma (if enabled) or Gemini vision model to produce structured
visual observations from user-uploaded medical images.
MedGemma provides significantly better medical image understanding
(dermatology, radiology, ophthalmology) vs generic vision models.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import BaseModel, Field

from app.ai.gemini import get_gemini_provider
from app.ai.medgemma import MedGemmaProvider
from app.config import settings

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "image_analysis_v1.txt"


class BoundingRegion(BaseModel):
    """A region of interest on the image, using Gemini's normalized 0-1000 coordinate system."""

    label: str = Field(description="Short name for this region")
    y_min: int = Field(ge=0, le=1000)
    x_min: int = Field(ge=0, le=1000)
    y_max: int = Field(ge=0, le=1000)
    x_max: int = Field(ge=0, le=1000)


class ObservationDetail(BaseModel):
    """A single observation with optional region and severity."""

    observation: str = Field(description="The textual observation")
    severity: str = Field(default="info", description="info, mild, moderate, or severe")
    region: BoundingRegion | None = Field(default=None)


class ImageAnalysis(BaseModel):
    """Structured result from the image analysis agent."""

    visual_observations: list[str] = Field(
        description="List of specific visual observations from the image"
    )
    possible_relevance: str = Field(
        description="How these observations might relate to the patient's symptoms"
    )
    confidence: str = Field(
        description="Confidence level: low, medium, or high"
    )
    limitations: list[str] = Field(
        default_factory=list,
        description="Limitations of this analysis (image quality, angle, etc.)",
    )
    recommendation: str = Field(
        description="Suggested next step (e.g., 'Consider showing this to a dermatologist')"
    )
    observations_detailed: list[ObservationDetail] = Field(
        default_factory=list,
        description="Detailed observations with severity and bounding regions",
    )
    overall_severity: str = Field(
        default="unknown",
        description="Overall severity: normal, mild, moderate, severe, unknown",
    )
    confidence_score: float = Field(
        default=0.5,
        description="Numeric confidence 0.0-1.0",
    )
    suggested_specialist: str = Field(
        default="",
        description="Recommended specialist type",
    )
    report_title: str = Field(
        default="Image Analysis Report",
        description="Descriptive title for the report",
    )


class ImageAnalyzer:
    """Analyzes medical images using Gemini vision capabilities."""

    def __init__(self) -> None:
        self._system_prompt_template = _PROMPT_PATH.read_text(encoding="utf-8")

    def _get_provider(self):
        """Return MedGemma provider if enabled, otherwise Gemini."""
        if settings.medgemma_enabled:
            from app.ai.medgemma import get_medgemma_provider
            return get_medgemma_provider()
        return get_gemini_provider()

    async def analyze(
        self,
        image_data: bytes,
        mime_type: str,
        patient_state_summary: str,
    ) -> ImageAnalysis:
        """Analyze an image and return structured observations.

        Args:
            image_data: Raw bytes of the image file.
            mime_type: MIME type (e.g., "image/jpeg").
            patient_state_summary: JSON string summarizing patient context.

        Returns:
            ImageAnalysis with observations, relevance, confidence, and recommendations.
        """
        provider = self._get_provider()
        is_medgemma = isinstance(provider, MedGemmaProvider)

        system_prompt = self._system_prompt_template.replace(
            "{patient_state_summary}", patient_state_summary
        )

        if is_medgemma:
            user_message = (
                "Analyze this medical image. Provide:\n"
                "1. OBSERVATIONS: List each visual observation on its own line, prefixed with a dash.\n"
                "2. RELEVANCE: One sentence on how these observations might relate to the patient.\n"
                "3. CONFIDENCE: low, medium, or high.\n"
                "4. LIMITATIONS: Any limitations of this analysis.\n"
                "5. RECOMMENDATION: Suggested next step.\n"
            )
        else:
            user_message = (
                "Analyze this image and respond ONLY with valid JSON matching this schema:\n"
                f"{json.dumps(ImageAnalysis.model_json_schema(), indent=2)}\n\n"
                "IMPORTANT:\n"
                "1. First identify the IMAGE TYPE (X-ray, skin, urine, eye, oral, wound, stool, "
                "nail/hair, etc.) and apply the type-specific observation guidelines from your "
                "instructions.\n"
                "2. For each visual observation, create a corresponding entry in "
                "observations_detailed with severity (info/mild/moderate/severe) and a bounding "
                "box region (y_min, x_min, y_max, x_max in 0-1000 normalized coordinates) if "
                "the observation can be localized.\n"
                "3. Fill visual_observations with the same text for backward compatibility.\n"
                "4. Set report_title to include the detected image type "
                "(e.g. 'Chest X-ray Analysis', 'Urine Color Assessment').\n"
                "5. Set suggested_specialist based on the image type and findings.\n"
                "6. Provide overall_severity and confidence_score (0.0-1.0)."
            )

        raw_response = await provider.analyze_image(
            system_prompt=system_prompt,
            user_message=user_message,
            image_data=image_data,
            mime_type=mime_type,
        )

        text = raw_response.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            text = text.rsplit("```", 1)[0]

        if is_medgemma:
            return self._parse_plain_text(text)

        try:
            data = json.loads(text)
            result = ImageAnalysis.model_validate(data)
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning("Image analysis JSON parse failed: %s", exc)
            result = self._parse_plain_text(text)
        return self._deduplicate(result)

    @staticmethod
    def _deduplicate(analysis: ImageAnalysis) -> ImageAnalysis:
        """Remove duplicate or near-duplicate observations."""
        from difflib import SequenceMatcher

        def _similar(a: str, b: str) -> bool:
            a_lower, b_lower = a.lower(), b.lower()
            if a_lower in b_lower or b_lower in a_lower:
                return True
            return SequenceMatcher(None, a_lower, b_lower).ratio() > 0.6

        seen_detailed: list[ObservationDetail] = []
        for obs in analysis.observations_detailed:
            if not any(_similar(obs.observation, s.observation) for s in seen_detailed):
                seen_detailed.append(obs)

        seen_text: list[str] = []
        for obs in analysis.visual_observations:
            if not any(_similar(obs, s) for s in seen_text):
                seen_text.append(obs)

        analysis.observations_detailed = seen_detailed
        analysis.visual_observations = seen_text
        return analysis

    @staticmethod
    def _parse_plain_text(text: str) -> ImageAnalysis:
        """Parse plain-text MedGemma output into structured ImageAnalysis."""
        lines = [l.strip() for l in text.splitlines() if l.strip()]

        observations = []
        relevance = ""
        confidence = "medium"
        limitations: list[str] = []
        recommendation = "Please consult a healthcare provider for proper evaluation"

        section = ""
        for line in lines:
            lower = line.lower()
            if lower.startswith("observation") or lower.startswith("1."):
                section = "obs"
                continue
            elif lower.startswith("relevance") or lower.startswith("2."):
                section = "rel"
                continue
            elif lower.startswith("confidence") or lower.startswith("3."):
                section = "conf"
                if "high" in lower:
                    confidence = "high"
                elif "low" in lower:
                    confidence = "low"
                else:
                    confidence = "medium"
                continue
            elif lower.startswith("limitation") or lower.startswith("4."):
                section = "lim"
                continue
            elif lower.startswith("recommendation") or lower.startswith("5."):
                section = "rec"
                continue

            cleaned = line.lstrip("-•* ").strip()
            if not cleaned:
                continue

            if section == "obs":
                observations.append(cleaned)
            elif section == "rel":
                relevance = (relevance + " " + cleaned).strip()
            elif section == "conf":
                if "high" in lower:
                    confidence = "high"
                elif "low" in lower:
                    confidence = "low"
            elif section == "lim":
                limitations.append(cleaned)
            elif section == "rec":
                recommendation = cleaned
            else:
                observations.append(cleaned)

        if not observations:
            observations = [text[:500]] if text else ["No observations produced"]
        if not relevance:
            relevance = "See observations above for details"

        confidence_map = {"low": 0.3, "medium": 0.55, "high": 0.8}
        detailed = [
            ObservationDetail(observation=obs, severity="info")
            for obs in observations
        ]

        return ImageAnalysis(
            visual_observations=observations,
            possible_relevance=relevance,
            confidence=confidence,
            limitations=limitations or ["AI-based analysis; not a substitute for professional evaluation"],
            recommendation=recommendation,
            observations_detailed=detailed,
            overall_severity="unknown",
            confidence_score=confidence_map.get(confidence, 0.5),
            suggested_specialist="",
            report_title="Image Analysis Report",
        )
