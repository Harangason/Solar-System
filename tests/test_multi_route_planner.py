import unittest

from multi_route_planner import (
    _corridor_candidates,
    _interstellar_direction,
    _predicted_passive_exit,
    classify_route_sections,
    simulate_route_sections,
)
from route_planner import _parse_entry_corridor


class MultiRoutePlannerTests(unittest.TestCase):
    def test_north_pole_is_sampled_as_true_3d_corridor_direction(self):
        corridor = _parse_entry_corridor({
            "enabled": True,
            "centerDirection": [0.0, 0.0, 1.0],
            "horizontalHalfAngleDeg": 8.0,
            "verticalHalfAngleDeg": 5.0,
        })

        candidates = _corridor_candidates(corridor)

        self.assertEqual(len(candidates), 25)
        self.assertIn(((0.0, 0.0, 1.0), 0.0, 0.0), candidates)

    def test_disconnected_section_chain_is_rejected_before_propagation(self):
        corridor = {
            "enabled": True,
            "centerDirection": [1.0, 0.0, 0.0],
            "horizontalHalfAngleDeg": 8.0,
            "verticalHalfAngleDeg": 5.0,
        }
        with self.assertRaisesRegex(ValueError, "Endpunkt"):
            simulate_route_sections({
                "routeSections": [
                    {
                        "originId": "sun",
                        "targetId": "jupiter",
                        "corridor": corridor,
                    },
                    {
                        "originId": "earth",
                        "targetId": "saturn",
                        "corridor": corridor,
                    },
                ],
            })

    def test_interstellar_target_is_a_true_three_dimensional_direction(self):
        direction = _interstellar_direction("alpha-centauri")

        self.assertIsNotNone(direction)
        self.assertAlmostEqual(sum(component**2 for component in direction), 1.0)
        self.assertGreater(abs(direction[2]), 0.1)

    def test_terminal_interstellar_asymptote_uses_coupled_solver_with_passage(self):
        classification = classify_route_sections([
            {
                "originId": "sun",
                "targetId": "jupiter",
                "passage": {"mode": "partial-orbit", "orbitAngleDeg": 200},
            },
            {
                "originId": "jupiter",
                "targetId": "proxima-centauri",
                "passage": {"mode": "direct"},
            },
        ])

        self.assertEqual(classification["solver"], "coupled-interstellar")
        self.assertEqual(
            classification["reason"],
            "solar-planet-chain-with-terminal-asymptote",
        )

    def test_non_interstellar_explicit_passage_still_uses_generic_solver(self):
        classification = classify_route_sections([
            {
                "originId": "sun",
                "targetId": "jupiter",
                "passage": {"mode": "partial-orbit", "orbitAngleDeg": 200},
            },
        ])

        self.assertEqual(classification["solver"], "generic")

    def test_malformed_route_section_is_classified_without_crashing(self):
        classification = classify_route_sections([None])

        self.assertEqual(classification["solver"], "invalid")
        self.assertEqual(classification["reason"], "malformed-route-section")

    def test_passive_exit_prediction_does_not_add_speed(self):
        direction, turn_deg = _predicted_passive_exit(
            relative_position=(1_000_000.0, 0.0, 0.0),
            relative_velocity=(-20.0, 12.0, 0.0),
            planet_velocity=(0.0, 12.0, 0.0),
            planet_mu=126_686_534.0,
        )

        self.assertAlmostEqual(sum(component**2 for component in direction), 1.0)
        self.assertGreater(turn_deg, 0.0)
        self.assertLess(turn_deg, 180.0)


if __name__ == "__main__":
    unittest.main()
