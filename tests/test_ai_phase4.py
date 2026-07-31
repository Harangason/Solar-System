import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ai import audit_log
from ai.calculation_agent import generate_calculation_suggestion


MISSION_STATE = {
    "schemaVersion": "1.0",
    "startDate": "2026-07-30",
    "originId": "earth",
    "targetId": "jupiter",
    "waypointIds": ["venus", "jupiter"],
    "routeSections": [
        {"id": "earth-venus", "originId": "earth", "targetId": "venus"},
        {"id": "venus-jupiter", "originId": "venus", "targetId": "jupiter"},
    ],
    "constraints": {"maxDeltaVKmS": 8.0, "maxDurationDays": 2200, "minimumConfidencePct": None},
    "solverRunId": None,
}


def response_for(structured):
    return {
        "id": "resp_phase4",
        "model": "test-model",
        "output": [{
            "type": "message",
            "content": [{"type": "output_text", "text": json.dumps(structured)}],
        }],
    }


class CalculationAgentTests(unittest.TestCase):
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

    def test_returns_search_spaces_and_candidate_seeds_for_solver(self):
        result = generate_calculation_suggestion({
            "missionState": MISSION_STATE,
            "uiState": {"projection": "top"},
            "recentSolverHistory": [{
                "id": "activity-1",
                "searchRunId": "search-1",
                "status": "rejected",
                "deltaVDeficitKmS": 2.5,
            }],
        }, api_caller=lambda _: response_for({
            "strategy": "gravity-assist",
            "searchWindows": [{
                "label": "Venus-Jupiter Synode",
                "startDate": "2027-01-01",
                "endDate": "2027-05-01",
                "priority": 0.9,
                "reason": "Historische Fehlschlaege lagen spaeter im Fenster.",
            }],
            "candidateSeeds": [{
                "startDate": "2027-03-01",
                "encounterDay": 460,
                "routeMode": "gravity-assist",
                "priority": 0.85,
                "rationale": "Frueher Venus-Assist als Solver-Seed.",
                "routeSectionIds": ["earth-venus", "venus-jupiter"],
            }],
            "rejectionHints": ["Delta-v Defizit aus frueheren Kandidaten vermeiden."],
            "expectedImprovement": "Priorisiert Solver-Laeufe um historische bessere Bereiche.",
            "basedOnHistoricalRunIds": ["search-1"],
            "requiresSolverValidation": True,
        }))

        self.assertEqual(result["role"], "calculation")
        self.assertTrue(result["requiresUserConfirmation"])
        self.assertEqual(result["proposal"]["strategy"], "gravity-assist")
        self.assertEqual(result["proposal"]["candidateSeeds"][0]["startDate"], "2027-03-01")
        self.assertEqual(audit_log.read_latest_ai_audit("calculation")["status"], "success")

    def test_rejects_attempt_to_return_solver_outcome_fields(self):
        with self.assertRaisesRegex(ValueError, "verbotenes Ergebnisfeld"):
            generate_calculation_suggestion({
                "missionState": MISSION_STATE,
                "recentSolverHistory": [],
            }, api_caller=lambda _: response_for({
                "strategy": "hybrid",
                "searchWindows": [],
                "candidateSeeds": [{
                    "startDate": "2027-03-01",
                    "encounterDay": 460,
                    "routeMode": "hybrid",
                    "priority": 0.8,
                    "rationale": "Unsafe.",
                    "routeSectionIds": ["earth-venus"],
                    "feasible": True,
                }],
                "rejectionHints": [],
                "expectedImprovement": "Unsafe.",
                "basedOnHistoricalRunIds": [],
                "requiresSolverValidation": True,
            }))
        self.assertEqual(audit_log.read_latest_ai_audit("calculation")["status"], "rejected")

    def test_rejects_unknown_route_section_reference(self):
        with self.assertRaisesRegex(ValueError, "unbekannten Routenabschnitt"):
            generate_calculation_suggestion({
                "missionState": MISSION_STATE,
                "recentSolverHistory": [],
            }, api_caller=lambda _: response_for({
                "strategy": "solar-oberth",
                "searchWindows": [],
                "candidateSeeds": [{
                    "startDate": "2027-03-01",
                    "encounterDay": None,
                    "routeMode": "solar-oberth",
                    "priority": 0.7,
                    "rationale": "Seed.",
                    "routeSectionIds": ["mars-saturn"],
                }],
                "rejectionHints": [],
                "expectedImprovement": "Seed.",
                "basedOnHistoricalRunIds": [],
                "requiresSolverValidation": True,
            }))


if __name__ == "__main__":
    unittest.main()
