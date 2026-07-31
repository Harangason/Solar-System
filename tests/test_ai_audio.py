import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ai import audit_log
from ai.audio_agent import (
    MAX_SPEECH_TEXT_LENGTH,
    synthesize_mission_speech,
    transcribe_mission_audio,
)


class AIAudioTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        root = Path(self.tempdir.name)
        self.logs = {role: root / f"{role}.jsonl" for role in audit_log.AI_AUDIT_LOGS}
        self.patches = [
            patch.object(audit_log, "PROJECT_ROOT", root),
            patch.object(audit_log, "AI_AUDIT_LOGS", self.logs),
            patch.dict(
                "os.environ",
                {
                    "OPENAI_TRANSCRIPTION_MODEL": "gpt-4o-transcribe",
                    "OPENAI_SPEECH_MODEL": "gpt-4o-mini-tts",
                    "OPENAI_SPEECH_VOICE": "alloy",
                },
                clear=False,
            ),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.tempdir.cleanup()

    def _latest_interaction_record(self):
        return json.loads(self.logs["interaction"].read_text(encoding="utf-8").splitlines()[-1])

    def test_transcribes_supported_audio_and_audits_metadata_only(self):
        calls = []

        def fake_api(**kwargs):
            calls.append(kwargs)
            return {"text": " Zielkorridor pruefen. ", "model": kwargs["model"]}

        result = transcribe_mission_audio(
            file_bytes=b"webm-data",
            filename="mission.webm",
            mime_type="audio/webm;codecs=opus",
            api_caller=fake_api,
        )

        self.assertEqual(result["transcript"], "Zielkorridor pruefen.")
        self.assertEqual(calls[0]["mime_type"], "audio/webm")
        record = self._latest_interaction_record()
        self.assertEqual(record["status"], "success")
        self.assertEqual(record["input"]["byteLength"], len(b"webm-data"))
        self.assertEqual(record["output"], {"transcriptLength": len("Zielkorridor pruefen.")})
        self.assertNotIn("webm-data", self.logs["interaction"].read_text(encoding="utf-8"))

    def test_rejects_unsupported_audio_format_before_api_call(self):
        with self.assertRaisesRegex(ValueError, "Audioformat"):
            transcribe_mission_audio(
                file_bytes=b"data",
                filename="clip.txt",
                mime_type="text/plain",
                api_caller=lambda **_: self.fail("API must not be called"),
            )

    def test_synthesizes_speech_with_limited_text_payload(self):
        calls = []

        def fake_api(payload):
            calls.append(payload)
            return b"mp3", "audio/mpeg"

        audio_bytes, content_type, audit = synthesize_mission_speech(
            text="Bitte Route erklaeren.",
            api_caller=fake_api,
        )

        self.assertEqual(audio_bytes, b"mp3")
        self.assertEqual(content_type, "audio/mpeg")
        self.assertTrue(audit["runId"].startswith("ai-interaction-"))
        self.assertEqual(calls[0]["model"], "gpt-4o-mini-tts")
        self.assertEqual(calls[0]["voice"], "alloy")
        self.assertEqual(calls[0]["response_format"], "mp3")

    def test_rejects_overlong_speech_text_before_api_call(self):
        with self.assertRaisesRegex(ValueError, "zu lang"):
            synthesize_mission_speech(
                text="x" * (MAX_SPEECH_TEXT_LENGTH + 1),
                api_caller=lambda _: self.fail("API must not be called"),
            )


if __name__ == "__main__":
    unittest.main()
