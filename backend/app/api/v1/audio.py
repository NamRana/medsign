"""Audio upload and transcription endpoint.

Accepts audio file uploads, transcribes them using Gemini's native audio
understanding, and feeds the transcript into the conversation loop.

Audio messages are scoped to the authenticated Supabase user.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.agents.transcriber import TranscriptionResult, transcribe_audio
from app.middleware.auth import get_current_user
from app.schemas.conversations import MessageCreate, MessageResponse
from app.services import conversation_service

router = APIRouter()

# ── Constants ────────────────────────────────────────────────────────────────
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB
ALLOWED_MIME_TYPES = {
    "audio/webm",
    "audio/mp4",
    "audio/wav",
    "audio/ogg",
    "audio/mpeg",
}


class AudioTranscriptionResponse(BaseModel):
    """Response returned after audio transcription and conversation processing."""

    transcript: str
    language_detected: str
    user_message: MessageResponse
    assistant_message: MessageResponse


@router.post(
    "/conversations/{conversation_id}/audio",
    response_model=AudioTranscriptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload audio and get AI response",
)
async def upload_audio(
    conversation_id: UUID,
    file: UploadFile,
    user=Depends(get_current_user),
) -> AudioTranscriptionResponse:
    """Accept an audio file, transcribe it, and feed into the conversation.

    Steps:
      1. Validate file type and size
      2. Transcribe audio using Gemini
      3. Feed transcript into conversation_service.add_message()
      4. Return transcript + both messages (user and assistant)

    Supported formats: audio/webm, audio/mp4, audio/wav, audio/ogg, audio/mpeg.
    Max file size: 25 MB.
    """
    # ── 1. Validate MIME type ────────────────────────────────────────────────
    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported audio format: {content_type}. "
                f"Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES))}"
            ),
        )

    # ── 2. Read and validate file size ───────────────────────────────────────
    audio_data = await file.read()
    if len(audio_data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is 25 MB, got {len(audio_data) / (1024 * 1024):.1f} MB.",
        )

    if len(audio_data) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    # ── 3. Transcribe audio ──────────────────────────────────────────────────
    try:
        transcription: TranscriptionResult = await transcribe_audio(
            audio_data=audio_data,
            mime_type=content_type,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Transcription failed: {exc}",
        ) from exc

    if not transcription.transcript.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract any speech from the audio. Please try again with clearer audio.",
        )

    # ── 4. Feed transcript into conversation ─────────────────────────────────
    message_data = MessageCreate(
        role="user",
        content=transcription.transcript,
        content_type="audio",
        metadata={
            "source": "voice_input",
            "language_detected": transcription.language_detected,
            "transcription_confidence": transcription.confidence,
            "original_mime_type": content_type,
            "original_file_size": len(audio_data),
        },
    )

    user_msg, assistant_msg = await conversation_service.add_message(
        conversation_id, UUID(str(user.id)), message_data
    )

    return AudioTranscriptionResponse(
        transcript=transcription.transcript,
        language_detected=transcription.language_detected,
        user_message=user_msg,
        assistant_message=assistant_msg,
    )
