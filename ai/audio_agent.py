"""Audited OpenAI Audio API adapter for interaction speech features."""

from __future__ import annotations

import json
import os
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from .audit_log import write_ai_audit
from .interaction_agent import _load_local_key


TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions"
SPEECH_URL = "https://api.openai.com/v1/audio/speech"
DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe"
DEFAULT_SPEECH_MODEL = "gpt-4o-mini-tts"
DEFAULT_SPEECH_VOICE = "alloy"
PROMPT_VERSION = "interaction-audio-v1"
MAX_AUDIO_BYTES = 12 * 1024 * 1024
MAX_SPEECH_TEXT_LENGTH = 4_096
ALLOWED_AUDIO_MIME_PREFIXES = {
    "audio/flac",
    "audio/mp3",
    "audio/mp4",
    "audio/mpeg",
    "audio/mpga",
    "audio/m4a",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
}


def _clean_mime_type(value: str) -> str:
    return value.split(";", 1)[0].strip().lower()


def _validate_audio_upload(file_bytes: bytes, mime_type: str) -> str:
    clean_mime = _clean_mime_type(mime_type)
    if not file_bytes:
        raise ValueError("Die Audioaufnahme ist leer.")
    if len(file_bytes) > MAX_AUDIO_BYTES:
        raise ValueError("Die Audioaufnahme ist zu gross.")
    if clean_mime not in ALLOWED_AUDIO_MIME_PREFIXES:
        raise ValueError("Dieses Audioformat wird fuer Spracheingabe nicht unterstuetzt.")
    return clean_mime


def _openai_error_message(error: HTTPError, api_name: str) -> RuntimeError:
    try:
        details = json.loads(error.read().decode("utf-8"))
        message = str((details.get("error") or {}).get("message") or "")
    except (UnicodeDecodeError, json.JSONDecodeError):
        message = ""
    return RuntimeError(
        f"OpenAI {api_name} API antwortet mit HTTP {error.code}"
        + (f": {message}" if message else ".")
    )


def _call_transcriptions_api(
    *,
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    model: str,
) -> dict[str, Any]:
    api_key = _load_local_key()
    boundary = f"----solar-system-audio-{uuid4().hex}"
    fields = {
        "model": model,
        "response_format": "json",
    }
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend([
            f"--{boundary}\r\n".encode("utf-8"),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
            str(value).encode("utf-8"),
            b"\r\n",
        ])
    safe_filename = filename.replace('"', "") or "recording.webm"
    chunks.extend([
        f"--{boundary}\r\n".encode("utf-8"),
        (
            'Content-Disposition: form-data; name="file"; '
            f'filename="{safe_filename}"\r\n'
        ).encode("utf-8"),
        f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"),
        file_bytes,
        b"\r\n",
        f"--{boundary}--\r\n".encode("utf-8"),
    ])
    api_request = Request(
        os.getenv("OPENAI_TRANSCRIPTIONS_URL", TRANSCRIPTIONS_URL),
        data=b"".join(chunks),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urlopen(api_request, timeout=90) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise _openai_error_message(error, "Transcriptions") from error
    except (URLError, TimeoutError) as error:
        raise RuntimeError("OpenAI Transcriptions API ist derzeit nicht erreichbar.") from error


def _call_speech_api(request_payload: dict[str, Any]) -> tuple[bytes, str]:
    api_key = _load_local_key()
    api_request = Request(
        os.getenv("OPENAI_SPEECH_URL", SPEECH_URL),
        data=json.dumps(request_payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(api_request, timeout=90) as response:
            return response.read(), response.headers.get_content_type()
    except HTTPError as error:
        raise _openai_error_message(error, "Speech") from error
    except (URLError, TimeoutError) as error:
        raise RuntimeError("OpenAI Speech API ist derzeit nicht erreichbar.") from error


def transcribe_mission_audio(
    *,
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    api_caller: Callable[..., dict[str, Any]] = _call_transcriptions_api,
) -> dict[str, Any]:
    clean_mime = _validate_audio_upload(file_bytes, mime_type)
    model = os.getenv("OPENAI_TRANSCRIPTION_MODEL", DEFAULT_TRANSCRIPTION_MODEL).strip()
    model = model or DEFAULT_TRANSCRIPTION_MODEL
    audit_input = {
        "filename": filename,
        "mimeType": clean_mime,
        "byteLength": len(file_bytes),
    }
    try:
        response = api_caller(
            file_bytes=file_bytes,
            filename=filename,
            mime_type=clean_mime,
            model=model,
        )
        transcript = str(response.get("text") or "").strip()
        if not transcript:
            raise ValueError("OpenAI hat kein Transkript geliefert.")
        output = {"transcript": transcript, "model": str(response.get("model") or model)}
        audit = write_ai_audit(
            role="interaction",
            model_name=output["model"],
            input_payload=audit_input,
            output_payload={"transcriptLength": len(transcript)},
            status="success",
            prompt_version=PROMPT_VERSION,
        )
        return {**output, "auditRunId": audit["runId"]}
    except Exception as error:
        write_ai_audit(
            role="interaction",
            model_name=model,
            input_payload=audit_input,
            output_payload=None,
            status="rejected" if isinstance(error, ValueError) else "error",
            prompt_version=PROMPT_VERSION,
            error=str(error),
        )
        raise


def synthesize_mission_speech(
    *,
    text: str,
    api_caller: Callable[[dict[str, Any]], tuple[bytes, str]] = _call_speech_api,
) -> tuple[bytes, str, dict[str, Any]]:
    clean_text = text.strip() if isinstance(text, str) else ""
    if not clean_text:
        raise ValueError("Der vorzulesende Text ist leer.")
    if len(clean_text) > MAX_SPEECH_TEXT_LENGTH:
        raise ValueError("Der vorzulesende Text ist zu lang.")
    model = os.getenv("OPENAI_SPEECH_MODEL", DEFAULT_SPEECH_MODEL).strip()
    model = model or DEFAULT_SPEECH_MODEL
    voice = os.getenv("OPENAI_SPEECH_VOICE", DEFAULT_SPEECH_VOICE).strip()
    voice = voice or DEFAULT_SPEECH_VOICE
    request_payload = {
        "model": model,
        "input": clean_text,
        "voice": voice,
        "response_format": "mp3",
    }
    audit_input = {"textLength": len(clean_text), "voice": voice}
    try:
        audio_bytes, content_type = api_caller(request_payload)
        if not audio_bytes:
            raise RuntimeError("OpenAI hat keine Audiodaten geliefert.")
        audit = write_ai_audit(
            role="interaction",
            model_name=model,
            input_payload=audit_input,
            output_payload={
                "byteLength": len(audio_bytes),
                "contentType": content_type,
            },
            status="success",
            prompt_version=PROMPT_VERSION,
        )
        return audio_bytes, content_type or "audio/mpeg", audit
    except Exception as error:
        write_ai_audit(
            role="interaction",
            model_name=model,
            input_payload=audit_input,
            output_payload=None,
            status="rejected" if isinstance(error, ValueError) else "error",
            prompt_version=PROMPT_VERSION,
            error=str(error),
        )
        raise
