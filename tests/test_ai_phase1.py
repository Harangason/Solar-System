import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ai import audit_log
from ai.schemas import AI_SCHEMAS, validate_ai_payload


class AISchemaTests(unittest.TestCase):
    def test_all_contracts_are_versioned_json_schemas(self):
        self.assertEqual(
            set(AI_SCHEMAS),
            {
                "mission-state",
                "solver-result",
                "ai-suggestion",
                "plausibility-report",
            },
        )
        for schema in AI_SCHEMAS.values():
            self.assertEqual(
                schema["$schema"],
                "https://json-schema.org/draft/2020-12/schema",
            )
            self.assertIn("schemaVersion", schema["properties"])

    def test_mission_state_contract_accepts_structured_values(self):
        errors = validate_ai_payload("mission-state", {
            "schemaVersion": "1.0",
            "startDate": "2026-07-30",
            "originId": "earth",
            "targetId": "proxima-centauri",
            "constraints": {
                "maxDeltaVKmS": 12.5,
                "maxDurationDays": 7300,
                "minimumConfidencePct": 95,
            },
        })

        self.assertEqual(errors, [])

    def test_contract_rejects_missing_and_invented_machine_values(self):
        errors = validate_ai_payload("plausibility-report", {
            "schemaVersion": "1.0",
            "status": "approved-by-model",
            "inventedFlightTime": 12,
        })

        self.assertTrue(any("solverRunId" in error for error in errors))
        self.assertTrue(any("allowed enum" in error for error in errors))
        self.assertTrue(any("additional property" in error for error in errors))


class AIAuditTests(unittest.TestCase):
    def test_role_log_contains_required_trace_and_redacts_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            logs = {
                role: root / f"ai_{role}.jsonl"
                for role in audit_log.AI_AUDIT_LOGS
            }
            with (
                patch.object(audit_log, "PROJECT_ROOT", root),
                patch.object(audit_log, "AI_AUDIT_LOGS", logs),
            ):
                metadata = audit_log.write_ai_audit(
                    role="calculation",
                    model_name="test-model",
                    input_payload={"targetId": "jupiter", "api_key": "not-for-log"},
                    output_payload={"searchWindowDays": 500},
                    status="success",
                    prompt_version="calculation-v1",
                    solver_run_ids=["optimizer-123"],
                )
                latest = audit_log.read_latest_ai_audit("calculation")

            self.assertEqual(metadata["role"], "calculation")
            self.assertEqual(latest["modelName"], "test-model")
            self.assertEqual(latest["solverRunIds"], ["optimizer-123"])
            self.assertFalse(latest["solverAuthority"])
            self.assertEqual(latest["input"]["api_key"], "[REDACTED]")

    def test_audit_rejects_unregistered_role(self):
        with self.assertRaisesRegex(ValueError, "role"):
            audit_log.write_ai_audit(
                role="central",
                model_name="test-model",
                input_payload={},
                output_payload={},
                status="success",
                prompt_version="v1",
            )


if __name__ == "__main__":
    unittest.main()
