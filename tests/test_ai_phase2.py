import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ai import audit_log
from ai.interaction_agent import generate_mission_chat


def mission_state():
    return {
        "schemaVersion": "1.0",
        "startDate": "2026-07-31",
        "originId": "earth",
        "targetId": "jupiter",
        "waypointIds": ["jupiter"],
        "routeSections": [{"id": "section-1", "originId": "earth", "targetId": "jupiter"}],
        "constraints": {"maxDeltaVKmS": 2.0, "maxDurationDays": 3650},
        "solverRunId": "route-123",
    }


def solver_result():
    return {
        "schemaVersion": "1.0",
        "runId": "route-123",
        "solverType": "segmented-route",
        "status": "best-effort",
        "result": {"totalFlightDays": 900, "targetCorrectionDeltaVKmS": 0.4},
        "validation": {
            "solverValid": False,
            "nBodyValid": None,
            "errors": [],
            "warnings": ["Keine Flugfreigabe."],
        },
    }


def api_response(structured):
    import json
    return {
        "id": "resp-123",
        "model": "test-model",
        "output": [{
            "type": "message",
            "content": [{"type": "output_text", "text": json.dumps(structured)}],
        }],
    }


class InteractionAgentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        self.logs = {role: root / f"{role}.jsonl" for role in audit_log.AI_AUDIT_LOGS}
        self.patches = [
            patch.object(audit_log, "PROJECT_ROOT", root),
            patch.object(audit_log, "AI_AUDIT_LOGS", self.logs),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.directory.cleanup()

    def test_solver_context_and_allowlisted_action_are_forwarded(self):
        captured = {}

        def fake_api(request_payload):
            captured.update(request_payload)
            return api_response({
                "reply": "Der Lauf route-123 hat keine Flugfreigabe.",
                "basedOnSolverRunIds": ["route-123"],
                "proposedActions": [{
                    "type": "focus-route-section",
                    "sectionId": "section-1",
                    "projection": None,
                    "requiresConfirmation": True,
                }],
            })

        result = generate_mission_chat({
            "message": "Erklaere die Route.",
            "missionState": mission_state(),
            "solverResult": solver_result(),
            "viewState": {"projection": "top", "activeRouteSectionId": "section-1"},
        }, api_caller=fake_api)

        self.assertEqual(result["basedOnSolverRunIds"], ["route-123"])
        self.assertEqual(result["proposedActions"][0]["type"], "focus-route-section")
        self.assertIn("route-123", captured["input"][0]["content"])
        self.assertFalse(captured["store"])
        self.assertEqual(audit_log.read_latest_ai_audit("interaction")["status"], "success")

    def test_unknown_action_is_rejected_and_audited(self):
        def fake_api(_request_payload):
            return api_response({
                "reply": "Ich starte etwas.",
                "basedOnSolverRunIds": [],
                "proposedActions": [{
                    "type": "delete-project",
                    "sectionId": None,
                    "projection": None,
                    "requiresConfirmation": True,
                }],
            })

        with self.assertRaisesRegex(ValueError, "Nicht erlaubte"):
            generate_mission_chat({
                "message": "Loesche das Projekt.",
                "missionState": mission_state(),
            }, api_caller=fake_api)
        self.assertEqual(audit_log.read_latest_ai_audit("interaction")["status"], "rejected")

    def test_unprovided_solver_reference_is_rejected(self):
        def fake_api(_request_payload):
            return api_response({
                "reply": "Lauf erfunden-1 sagt 12 Tage.",
                "basedOnSolverRunIds": ["erfunden-1"],
                "proposedActions": [],
            })

        with self.assertRaisesRegex(ValueError, "nicht uebergebenen Solver-Lauf"):
            generate_mission_chat({
                "message": "Wie lange dauert es?",
                "missionState": mission_state(),
            }, api_caller=fake_api)


if __name__ == "__main__":
    unittest.main()
