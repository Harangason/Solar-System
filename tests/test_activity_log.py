import csv
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import activity_log


class ActivityLogTests(unittest.TestCase):
    def test_write_query_and_filter_activity(self):
        with tempfile.TemporaryDirectory() as directory:
            log_path = Path(directory) / "activities.jsonl"
            with patch.object(activity_log, "ACTIVITY_LOG", log_path):
                activity_log.write_activity(
                    source="backend",
                    category="calculation",
                    action="route-simulate",
                    project_id="project-1",
                    values={"deltaVKmS": 4.25},
                )
                activity_log.write_activity(
                    source="frontend",
                    category="ui",
                    action="button-click",
                    project_id="project-1",
                )
                records = activity_log.read_activities(category="calculation")

            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["values"]["deltaVKmS"], 4.25)
            self.assertEqual(len(log_path.read_text(encoding="utf-8").splitlines()), 2)

    def test_csv_contains_utf8_bom_and_dynamic_value_columns(self):
        records = [{
            "id": "activity-1",
            "timestampUtc": "2026-07-30T12:00:00+00:00",
            "source": "backend",
            "category": "calculation",
            "action": "route-simulate",
            "status": "success",
            "projectId": "project-1",
            "durationMs": 12.5,
            "message": "Mögliche Route",
            "values": {"deltaVKmS": 4.25},
            "details": {"target": "Jupiter"},
        }]

        exported = activity_log.activities_csv(records)
        decoded = exported.decode("utf-8")

        self.assertTrue(decoded.startswith("\ufeff"))
        self.assertIn("value.deltaVKmS", decoded)
        self.assertIn("Mögliche Route", decoded)
        rows = list(csv.DictReader(io.StringIO(decoded.removeprefix("\ufeff"))))
        self.assertEqual(
            json.loads(rows[0]["detailsJson"]),
            {"target": "Jupiter"},
        )

    def test_flatten_scalar_values_is_bounded(self):
        flattened = activity_log.flatten_scalar_values(
            {"summary": {"deltaV": 3.2, "reachable": True}, "positions": [1, 2, 3]},
            "result",
            limit=3,
        )

        self.assertEqual(len(flattened), 3)
        self.assertEqual(flattened["result.summary.deltaV"], 3.2)


if __name__ == "__main__":
    unittest.main()
