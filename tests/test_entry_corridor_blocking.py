import unittest

from route_planner import _parse_entry_corridor


class EntryCorridorBlockingTests(unittest.TestCase):
    def test_enabled_blocked_corridor_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Zielkorridor ist gesperrt"):
            _parse_entry_corridor({
                "enabled": True,
                "blocked": True,
                "blockReasons": ["Mindestabstand unterschritten."],
            })

    def test_disabled_blocked_corridor_is_not_used(self):
        parsed = _parse_entry_corridor({
            "enabled": False,
            "blocked": True,
        })

        self.assertFalse(parsed["enabled"])


if __name__ == "__main__":
    unittest.main()
