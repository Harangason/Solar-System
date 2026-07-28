import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import calculation_audit


class PlaybackAuditTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.project_root = Path(self.temporary_directory.name)
        self.log_file = self.project_root / "logs" / "mission_playback.jsonl"
        self.patches = [
            patch.object(calculation_audit, "PROJECT_ROOT", self.project_root),
            patch.object(calculation_audit, "PLAYBACK_AUDIT_LOG", self.log_file),
        ]
        for active_patch in self.patches:
            active_patch.start()

    def tearDown(self):
        for active_patch in reversed(self.patches):
            active_patch.stop()
        self.temporary_directory.cleanup()

    def test_reconstructs_complete_playback_stream(self):
        started = calculation_audit.start_playback_audit({
            "startDate": "2026-07-28",
            "playbackEndDay": 12.5,
            "originId": "earth",
            "targetId": "jupiter",
            "routeSectionIds": ["earth-jupiter"],
            "missionConfig": {"startDate": "2026-07-28"},
            "routeSections": [{"id": "earth-jupiter"}],
            "state": {"positionKm": [1.0, 2.0, 3.0]},
        })
        calculation_audit.write_playback_event({
            "playbackId": started["playbackId"],
            "sequence": 1,
            "eventType": "checkpoint",
            "missionDay": 5.0,
            "state": {"positionKm": [4.0, 5.0, 6.0]},
        })
        calculation_audit.write_playback_event({
            "playbackId": started["playbackId"],
            "sequence": 2,
            "eventType": "target-reached",
            "missionDay": 12.5,
            "state": {"positionKm": [7.0, 8.0, 9.0]},
        })

        latest = calculation_audit.read_latest_playback_audit()

        self.assertEqual(latest["playbackId"], started["playbackId"])
        self.assertEqual(latest["status"], "target-reached")
        self.assertEqual(latest["eventCount"], 2)
        self.assertEqual(latest["start"]["routeSections"][0]["id"], "earth-jupiter")
        self.assertEqual(latest["events"][-1]["missionDay"], 12.5)

    def test_rejects_unknown_playback_identifier(self):
        with self.assertRaisesRegex(ValueError, "Kennung"):
            calculation_audit.write_playback_event({
                "playbackId": "../outside",
                "sequence": 1,
                "eventType": "checkpoint",
                "missionDay": 1.0,
            })


if __name__ == "__main__":
    unittest.main()
