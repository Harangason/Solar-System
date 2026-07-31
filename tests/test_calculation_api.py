import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import UUID

import main
from services.calculation_store import CalculationStore
from services.project_store import ProjectStore
from tests.test_calculation_store import calculation_result
from tests.test_project_store import project_values


class CalculationApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        database_path = Path(self.temporary_directory.name) / "api.db"
        self.project_store = ProjectStore(database_path)
        self.calculation_store = CalculationStore(database_path)
        self.project = self.project_store.create_project(project_values())
        self.project_patch = patch.object(main, "project_store", self.project_store)
        self.calculation_patch = patch.object(
            main, "calculation_store", self.calculation_store
        )
        self.project_patch.start()
        self.calculation_patch.start()
        self.client = main.app.test_client()

    def tearDown(self):
        self.calculation_patch.stop()
        self.project_patch.stop()
        self.temporary_directory.cleanup()

    def test_run_variant_and_normalized_result_api_round_trip(self):
        started = self.client.post(
            "/api/calculations/runs",
            headers={"X-Project-Id": self.project["id"]},
            json={
                "routeLabel": "sun → jupiter",
                "baseDate": "2026-07-31",
                "searchStartDate": "2024-07-31",
                "searchEndDate": "2052-01-28",
                "preflightBudget": 22,
                "fullValidationBudget": 5,
            },
        )
        self.assertEqual(started.status_code, 201)
        run_id = started.get_json()["id"]
        UUID(run_id)

        with patch.object(main, "simulate_route_sections", return_value=calculation_result()):
            solved = self.client.post(
                "/api/route/simulate",
                headers={"X-Project-Id": self.project["id"]},
                json={
                    "mission": {"startDate": "2033-12-31"},
                    "routeSections": [
                        {
                            "id": "sun-jupiter",
                            "originId": "sun",
                            "targetId": "jupiter",
                            "deltaVPlusKmS": 1.0,
                        }
                    ],
                    "calculationPersistence": {
                        "runId": run_id,
                        "iteration": 1,
                        "startDate": "2033-12-31",
                        "stage": "corridor-full-validation",
                        "fullCorridorCheck": True,
                        "geometricScore": -256.38,
                    },
                },
            )
        self.assertEqual(solved.status_code, 200)
        variant_id = solved.get_json()["calculationPersistence"]["variantId"]
        UUID(variant_id)

        updated_variant = self.client.patch(
            f"/api/calculations/runs/{run_id}/variants/{variant_id}",
            json={
                "status": "rejected",
                "quality": -1172.99,
                "rank": 1,
                "selected": True,
                "geometryValid": True,
                "sectionOrderValid": True,
                "stateContinuous": True,
                "endpointsReached": True,
                "maximumEndpointResidualKm": 0.25,
                "performanceEvaluated": True,
                "feasible": False,
                "corridorSatisfied": False,
                "collisionFree": True,
                "deltaVDeficitKmS": 4.5,
            },
        )
        self.assertEqual(updated_variant.status_code, 200)

        completed = self.client.patch(
            f"/api/calculations/runs/{run_id}",
            json={
                "status": "rejected",
                "graphNodes": 1005,
                "graphEdges": 2007,
                "shortlistCount": 8,
                "resultCount": 1,
                "bestVariantId": variant_id,
            },
        )
        self.assertEqual(completed.status_code, 200)

        restored = self.client.get(f"/api/calculations/runs/{run_id}")
        detail = self.client.get(f"/api/calculations/variants/{variant_id}")
        history = self.client.get(
            f"/api/calculations/runs?projectId={self.project['id']}"
        )

        self.assertEqual(restored.status_code, 200)
        self.assertTrue(restored.get_json()["candidates"][0]["geometryValid"])
        self.assertTrue(restored.get_json()["candidates"][0]["performanceEvaluated"])
        self.assertEqual(restored.get_json()["candidates"][0]["routePoints"][-1], [13.0, 14.0, 15.0])
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(len(detail.get_json()["sections"]), 1)
        self.assertEqual(history.get_json()["runs"][0]["runId"], run_id)

    def test_invalid_uuid_and_unknown_project_are_rejected(self):
        invalid = self.client.get("/api/calculations/runs/not-a-uuid")
        missing_project = self.client.post(
            "/api/calculations/runs",
            headers={"X-Project-Id": "00000000-0000-4000-8000-000000000000"},
            json={"routeLabel": "test"},
        )

        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(missing_project.status_code, 404)


if __name__ == "__main__":
    unittest.main()
