import unittest

from mission_optimizer import assess_solar_energy


class SolarEnergyAssessmentTests(unittest.TestCase):
    def test_rejects_speed_above_configured_oberth_budget(self):
        result = assess_solar_energy({
            "mission": {"oberthDeltaVKmS": 8.0},
            "desiredSolarExitSpeedKmS": 100.0,
        })

        self.assertFalse(result["energeticallyReachable"])
        self.assertLess(result["maximumExitSpeedWithAvailableBurnKmS"], 100.0)
        self.assertGreater(result["minimumOberthDeltaVForDesiredSpeedKmS"], 8.0)

    def test_accepts_speed_inside_configured_oberth_budget(self):
        result = assess_solar_energy({
            "mission": {"oberthDeltaVKmS": 8.0},
            "desiredSolarExitSpeedKmS": 40.0,
        })

        self.assertTrue(result["energeticallyReachable"])
        self.assertGreaterEqual(
            result["maximumExitSpeedWithAvailableBurnKmS"] + 0.25,
            40.0,
        )

    def test_rejects_invalid_speed_without_starting_search(self):
        with self.assertRaisesRegex(ValueError, "zwischen 1 und 1.000"):
            assess_solar_energy({"desiredSolarExitSpeedKmS": 0.0})


if __name__ == "__main__":
    unittest.main()
