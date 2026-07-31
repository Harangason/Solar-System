import sqlite3
import tempfile
import unittest
from pathlib import Path
from uuid import UUID

from services.calculation_store import CalculationStore
from services.project_store import ProjectStore
from tests.test_project_store import project_values


def calculation_result():
    return {
        "startDate": "2033-12-31",
        "totalFlightDays": 840.5,
        "trajectory": [
            {
                "elapsedDays": 0.0,
                "positionKm": [1.0, 2.0, 3.0],
                "velocityKmS": [4.0, 5.0, 6.0],
                "phase": "departure",
            },
            {
                "elapsedDays": 420.0,
                "positionKm": [7.0, 8.0, 9.0],
                "velocityKmS": [10.0, 11.0, 12.0],
            },
            {
                "elapsedDays": 840.5,
                "positionKm": [13.0, 14.0, 15.0],
                "velocityKmS": [16.0, 17.0, 18.0],
            },
        ],
        "routeSections": [
            {
                "id": "sun-jupiter",
                "originId": "sun",
                "targetId": "jupiter",
                "targetName": "Jupiter",
                "sectionType": "heliozentrischer Transfer",
                "entryIndex": 0,
                "periapsisIndex": 1,
                "exitIndex": 2,
                "entryDay": 0.0,
                "periapsisDay": 420.0,
                "exitDay": 840.5,
                "entryPositionKm": [1.0, 2.0, 3.0],
                "entryDirection": [0.1, 0.2, 0.3],
                "minimumAltitudeKm": 100_000.0,
                "requiredTransitionDeltaVKmS": 12.0,
                "availableTransitionDeltaVKmS": 8.0,
                "transitionDeltaVDeficitKmS": 4.0,
                "corridorInsertionDeltaVKmS": 1.5,
                "departureRadialSpeedKmS": 6.5,
                "lookaheadAlignmentDeg": 49.4,
                "corridor": {
                    "enabled": True,
                    "entryInsideCorridor": False,
                },
            }
        ],
        "validation": {"collisionFree": True},
        "summary": {
            "requiredInjectionDeltaVKmS": 12.0,
            "availableInjectionDeltaVKmS": 8.0,
            "solarDepartureInjectionApplied": False,
            "targetCorrectionDeltaVKmS": 0.0,
            "targetInjectionApplied": False,
            "incomingExcessSpeedKmS": 11.5,
            "heliocentricSpeedBeforeKmS": 22.0,
            "heliocentricSpeedAfterKmS": 28.0,
            "periapsisSpeedKmS": 31.0,
            "targetAlignmentDeg": 49.4,
            "actualTargetAlignmentDeg": 49.4,
            "feasibleWithConfiguredBurn": False,
            "warnings": ["Korridor wurde verfehlt."],
        },
        "warnings": ["Best-effort-Route."],
    }


class CalculationStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temporary_directory.name) / "calculations.db"
        self.project_store = ProjectStore(self.database_path)
        self.store = CalculationStore(self.database_path)
        self.project = self.project_store.create_project(project_values())

    def tearDown(self):
        self.temporary_directory.cleanup()

    def start_run(self):
        return self.store.start_run(
            {
                "routeLabel": "earth → sun · sun → jupiter",
                "baseDate": "2026-07-31",
                "searchStartDate": "2024-07-31",
                "searchEndDate": "2052-01-28",
                "broadStepDays": 10,
                "preflightBudget": 22,
                "fullValidationBudget": 5,
            },
            project_id=self.project["id"],
        )

    def record_variant(self, run_id):
        return self.store.record_variant(
            run_id,
            {
                "iteration": 1,
                "startDate": "2033-12-31",
                "stage": "corridor-full-validation",
                "fullCorridorCheck": True,
                "geometricScore": -256.38,
            },
            {
                "mission": {"startDate": "2033-12-31"},
                "routeSections": [{"deltaVPlusKmS": 1.0}],
            },
            result=calculation_result(),
            status="solver-completed",
        )

    def test_schema_uses_uuid_primary_keys_and_foreign_keys(self):
        run = self.start_run()
        variant_id = self.record_variant(run["id"])

        UUID(run["id"])
        UUID(variant_id)
        connection = sqlite3.connect(self.database_path)
        try:
            connection.row_factory = sqlite3.Row
            tables = [
                "calculation_runs",
                "calculation_variants",
                "calculation_route_sections",
                "calculation_delta_v",
                "calculation_velocities",
                "calculation_trajectory_points",
                "calculation_warnings",
            ]
            for table in tables:
                row = connection.execute(f"SELECT id FROM {table} LIMIT 1").fetchone()
                self.assertIsNotNone(row, table)
                UUID(row["id"])
            foreign_keys = connection.execute(
                "PRAGMA foreign_key_list(calculation_variants)"
            ).fetchall()
            self.assertTrue(any(row["table"] == "calculation_runs" for row in foreign_keys))
        finally:
            connection.close()

    def test_round_trip_restores_normalized_result(self):
        run = self.start_run()
        variant_id = self.record_variant(run["id"])
        self.store.update_variant(
            run["id"],
            variant_id,
            {
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
                "hypotheticalInterstellarAsymptote": True,
                "feasible": False,
                "corridorSatisfied": False,
                "collisionFree": True,
                "corridorInsertionDeficitKmS": 0.5,
                "deltaVDeficitKmS": 4.5,
            },
        )
        self.store.update_run(
            run["id"],
            {
                "status": "rejected",
                "graphNodes": 1005,
                "graphEdges": 2007,
                "shortlistCount": 8,
                "resultCount": 1,
                "flightReadyCount": 0,
                "bestVariantId": variant_id,
            },
        )

        restored = self.store.get_run(run["id"])
        detail = self.store.get_variant(variant_id)

        self.assertEqual(restored["graphNodes"], 1005)
        self.assertEqual(restored["bestVariantId"], variant_id)
        self.assertEqual(restored["candidates"][0]["deltaVDeficitKmS"], 4.5)
        self.assertTrue(restored["candidates"][0]["geometryValid"])
        self.assertTrue(restored["candidates"][0]["performanceEvaluated"])
        self.assertTrue(
            restored["candidates"][0]["hypotheticalInterstellarAsymptote"]
        )
        self.assertEqual(
            restored["candidates"][0]["maximumEndpointResidualKm"], 0.25
        )
        self.assertEqual(restored["candidates"][0]["routePoints"][-1], [13.0, 14.0, 15.0])
        self.assertEqual(len(detail["sections"]), 1)
        self.assertEqual(len(detail["routePoints"]), 3)
        self.assertGreaterEqual(len(detail["deltaV"]), 3)
        self.assertGreaterEqual(len(detail["velocities"]), 5)
        self.assertEqual(len(detail["warnings"]), 2)

    def test_project_delete_keeps_run_and_clears_project_reference(self):
        run = self.start_run()

        self.project_store.delete_project(self.project["id"])

        restored = self.store.get_run(run["id"], include_trajectories=False)
        self.assertEqual(restored["projectId"], "")

    def test_delete_run_cascades_to_all_result_tables(self):
        run = self.start_run()
        self.record_variant(run["id"])

        self.store.delete_run(run["id"])

        connection = sqlite3.connect(self.database_path)
        try:
            for table in (
                "calculation_variants",
                "calculation_route_sections",
                "calculation_delta_v",
                "calculation_velocities",
                "calculation_trajectory_points",
                "calculation_warnings",
            ):
                count = connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                self.assertEqual(count, 0, table)
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
