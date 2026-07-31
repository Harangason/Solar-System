import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ai import audit_log
from ai.plausibility_agent import generate_plausibility_check


MISSION_STATE = {
    "schemaVersion": "1.0",
    "startDate": "2026-07-30",
    "originId": "earth",
    "targetId": "mars",
    "waypointIds": ["mars"],
    "routeSections": [{"id": "earth-mars", "originId": "earth", "targetId": "mars"}],
    "constraints": {"maxDeltaVKmS": 4.0, "maxDurationDays": 900, "minimumConfidencePct": None},
    "solverRunId": "solver-123",
}

SOLVER_RESULT = {
    "schemaVersion": "1.0",
    "runId": "solver-123",
    "solverType": "segmented-route",
    "status": "success",
    "missionStateRef": None,
    "result": {
        "startDate": "2026-07-30",
        "totalFlightDays": 240.0,
        "waypoint": {
            "id": "mars",
            "encounterDay": 240.0,
            "encounterDate": "2027-03-27",
        },
        "summary": {"feasibleWithConfiguredBurn": True},
        "routeSections": [{
            "id": "earth-mars",
            "originId": "earth",
            "targetId": "mars",
            "entryInsideCorridor": True,
            "requiredTransitionDeltaVKmS": 1.2,
            "corridorInsertionDeltaVKmS": 0.4,
        }],
    },
    "validation": {
        "solverValid": True,
        "nBodyValid": True,
        "errors": [],
        "warnings": [],
    },
}


def response_for(structured):
    return {
        "id": "resp_phase3",
        "model": "test-model",
        "output": [{
            "type": "message",
            "content": [{"type": "output_text", "text": json.dumps(structured)}],
        }],
    }


class PlausibilityAgentTests(unittest.TestCase):
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

    def test_consistent_solver_and_ui_can_pass(self):
        result = generate_plausibility_check({
            "missionState": MISSION_STATE,
            "solverResult": SOLVER_RESULT,
            "uiState": {
                "displayedSolverRunId": "solver-123",
                "routeSectionIds": ["earth-mars"],
                "activeRouteSectionId": "earth-mars",
                "displayedFlightReady": True,
                "displayedStartDate": "2026-07-30",
                "displayedTotalFlightDays": 240.0,
            },
        }, api_caller=lambda _: response_for({
            "status": "pass",
            "findings": [{
                "code": "model-pass",
                "message": "Keine Widersprueche erkannt.",
                "severity": "info",
                "sourceRefs": ["solver-123"],
            }],
            "requiredFixes": [],
            "displaySafe": True,
        }))

        self.assertEqual(result["status"], "pass")
        self.assertTrue(result["displaySafe"])
        self.assertEqual(audit_log.read_latest_ai_audit("plausibility")["status"], "success")

    def test_solver_failure_overrides_overly_positive_model_report(self):
        failed_solver = {
            **SOLVER_RESULT,
            "status": "best-effort",
            "validation": {
                "solverValid": False,
                "nBodyValid": False,
                "errors": ["Kollision erkannt."],
                "warnings": ["Nur best-effort."],
            },
        }

        result = generate_plausibility_check({
            "missionState": MISSION_STATE,
            "solverResult": failed_solver,
            "uiState": {
                "displayedSolverRunId": "solver-123",
                "routeSectionIds": ["earth-mars"],
                "activeRouteSectionId": "earth-mars",
                "displayedFlightReady": True,
            },
        }, api_caller=lambda _: response_for({
            "status": "pass",
            "findings": [],
            "requiredFixes": [],
            "displaySafe": True,
        }))

        self.assertEqual(result["status"], "fail")
        self.assertFalse(result["displaySafe"])
        self.assertIn("solver-not-flight-ready", {item["code"] for item in result["findings"]})
        self.assertIn("unsafe-flight-ready-label", {item["code"] for item in result["findings"]})

    def test_rejects_unknown_solver_reference_shape(self):
        with self.assertRaisesRegex(ValueError, "Solver-Ergebnis"):
            generate_plausibility_check({
                "missionState": MISSION_STATE,
                "solverResult": {"runId": "solver-123"},
                "uiState": {},
            }, api_caller=lambda _: self.fail("API must not be called"))

    def test_detects_encounter_day_and_date_mismatch(self):
        result = generate_plausibility_check({
            "missionState": MISSION_STATE,
            "solverResult": SOLVER_RESULT,
            "uiState": {
                "displayedSolverRunId": "solver-123",
                "routeSectionIds": ["earth-mars"],
                "activeRouteSectionId": "earth-mars",
                "displayedFlightReady": True,
                "displayedStartDate": "2026-07-30",
                "displayedOptimizedStartDate": "2026-07-30",
                "displayedTotalFlightDays": 240.0,
                "displayedEncounterDay": 241.0,
                "displayedEncounterDate": "2027-03-28",
            },
        }, api_caller=lambda _: response_for({
            "status": "pass",
            "findings": [],
            "requiredFixes": [],
            "displaySafe": True,
        }))

        codes = {item["code"] for item in result["findings"]}
        self.assertEqual(result["status"], "warning")
        self.assertTrue(result["displaySafe"])
        self.assertIn("encounter-day-mismatch", codes)
        self.assertIn("encounter-date-mismatch", codes)


if __name__ == "__main__":
    unittest.main()
