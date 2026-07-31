"""Contracts and audit infrastructure for the optional AI integration."""

from .audit_log import read_latest_ai_audit, write_ai_audit
from .audio_agent import synthesize_mission_speech, transcribe_mission_audio
from .calculation_agent import generate_calculation_suggestion
from .interaction_agent import generate_mission_chat
from .plausibility_agent import generate_plausibility_check
from .schemas import AI_SCHEMAS, validate_ai_payload

__all__ = [
    "AI_SCHEMAS",
    "generate_calculation_suggestion",
    "generate_mission_chat",
    "generate_plausibility_check",
    "read_latest_ai_audit",
    "synthesize_mission_speech",
    "transcribe_mission_audio",
    "validate_ai_payload",
    "write_ai_audit",
]
