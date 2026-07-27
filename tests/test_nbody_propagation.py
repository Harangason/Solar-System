from __future__ import annotations

from math import isfinite, sqrt
import unittest

from nbody_propagation import (
    continuous_n_body_acceleration,
    propagate_continuous_n_body,
)
from route_planner import (
    _align_hyperbola_entry_velocity,
    _corridor_coordinates_deg,
    _corridor_direction,
)
from trajectory import AU_KM, DAY_SECONDS, MU_SUN


class ContinuousNBodyPropagationTests(unittest.TestCase):
    def test_acceleration_is_finite_away_from_mass_centers(self) -> None:
        acceleration = continuous_n_body_acceleration(
            (AU_KM, 0.0, 0.0),
            0.0,
        )

        self.assertEqual(len(acceleration), 3)
        self.assertTrue(all(isfinite(value) for value in acceleration))
        self.assertLess(acceleration[0], 0.0)

    def test_short_propagation_returns_dense_continuous_state(self) -> None:
        circular_speed = sqrt(MU_SUN / AU_KM)
        propagation = propagate_continuous_n_body(
            ((AU_KM, 0.0, 0.0), (0.0, circular_speed, 0.0)),
            0.0,
            0.01,
            0.0,
            maximum_step_seconds=300.0,
        )

        midpoint = propagation.state_at(0.005 * DAY_SECONDS)
        final = propagation.final_state

        self.assertTrue(propagation.successful)
        self.assertGreater(midpoint[0][1], 0.0)
        self.assertGreater(final[0][1], midpoint[0][1])

    def test_hyperbola_frame_alignment_returns_rotated_axes(self) -> None:
        axis_x, axis_y = _align_hyperbola_entry_velocity(
            (1.0, 0.0, 0.0),
            (0.0, 1.0, 0.0),
            1.0,
            100_000.0,
            2.0,
            100_000_000.0,
            (0.0, 0.0, 1.0),
        )

        self.assertAlmostEqual(sum(value * value for value in axis_x), 1.0)
        self.assertAlmostEqual(sum(value * value for value in axis_y), 1.0)
        self.assertAlmostEqual(
            sum(left * right for left, right in zip(axis_x, axis_y)),
            0.0,
        )

    def test_corridor_offsets_round_trip_on_sphere(self) -> None:
        direction = _corridor_direction(
            (1.0, 0.0, 0.0),
            12.0,
            -7.0,
            31.0,
        )
        horizontal, vertical = _corridor_coordinates_deg(
            direction,
            (1.0, 0.0, 0.0),
            31.0,
        )

        self.assertAlmostEqual(horizontal, 12.0, places=10)
        self.assertAlmostEqual(vertical, -7.0, places=10)


if __name__ == "__main__":
    unittest.main()
