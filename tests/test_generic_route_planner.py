import unittest

from generic_route_planner import SUN_RADIUS_KM, _candidate, parse_route_passage
from multi_route_planner import simulate_route_sections
from trajectory import _magnitude


CORRIDOR = {
    "enabled": True,
    "centerDirection": [0.0, 0.0, 1.0],
    "horizontalHalfAngleDeg": 8.0,
    "verticalHalfAngleDeg": 5.0,
    "rotationDeg": 0.0,
}


def section(origin_id, target_id, section_id="section"):
    return {
        "id": section_id,
        "originId": origin_id,
        "targetId": target_id,
        "corridor": CORRIDOR,
        "deltaVPlusKmS": 100.0,
    }


class GenericRoutePlannerTests(unittest.TestCase):
    def calculate(self, sections):
        return simulate_route_sections({
            "mission": {"startDate": "2026-07-28"},
            "routeSections": sections,
        })

    def test_planet_to_sun_uses_selected_origin(self):
        result = self.calculate([section("venus", "sun")])

        calculated = result["routeSections"][0]
        self.assertEqual(calculated["originId"], "venus")
        self.assertEqual(calculated["targetId"], "sun")
        self.assertEqual(calculated["sectionType"], "heliozentrischer Transfer")
        self.assertLess(calculated["lambertEndpointResidualKm"], 1.0)

    def test_passage_definition_is_normalized_and_preserved(self):
        requested = section("venus", "sun")
        requested["passage"] = {
            "mode": "partial-orbit",
            "orbitAngleDeg": 135,
            "orbitDirection": "retrograde",
            "entryBehavior": "tangential-retrograde",
            "exitBehavior": "tangential-prograde",
        }

        calculated = self.calculate([requested])["routeSections"][0]

        self.assertEqual(calculated["passage"], requested["passage"])

    def test_full_orbit_always_uses_360_degrees(self):
        passage = parse_route_passage({
            "mode": "full-orbit",
            "orbitAngleDeg": 12,
        })

        self.assertEqual(passage["orbitAngleDeg"], 360.0)

    def test_partial_orbit_defaults_to_45_degrees(self):
        passage = parse_route_passage({
            "mode": "partial-orbit",
        })

        self.assertEqual(passage["orbitAngleDeg"], 45.0)

    def test_partial_orbit_accepts_one_and_a_half_orbits(self):
        passage = parse_route_passage({
            "mode": "partial-orbit",
            "orbitAngleDeg": 540,
        })

        self.assertEqual(passage["orbitAngleDeg"], 540.0)

    def test_partial_orbit_is_limited_to_three_orbits(self):
        passage = parse_route_passage({
            "mode": "partial-orbit",
            "orbitAngleDeg": 2000,
        })

        self.assertEqual(passage["orbitAngleDeg"], 1080.0)

    def test_acceleration_boundary_behavior_is_accepted(self):
        passage = parse_route_passage({
            "entryBehavior": "tangential-accelerate",
            "exitBehavior": "tangential-accelerate",
        })

        self.assertEqual(passage["entryBehavior"], "tangential-accelerate")
        self.assertEqual(passage["exitBehavior"], "tangential-accelerate")

    def test_planet_to_its_moon_uses_planet_centric_dynamics(self):
        result = self.calculate([section("earth", "earth-moon")])

        calculated = result["routeSections"][0]
        self.assertEqual(calculated["targetId"], "earth-moon")
        self.assertEqual(calculated["sectionType"], "Erde-zentrierter Transfer")
        self.assertLess(calculated["lambertEndpointResidualKm"], 1.0)

    def test_planet_to_planet_is_supported_without_solar_oberth_prefix(self):
        result = self.calculate([section("earth", "mars")])

        self.assertEqual(result["segments"][0]["label"], "Erde → Mars")
        self.assertEqual(result["trajectory"][0]["elapsedDays"], 0.0)
        self.assertLess(
            result["routeSections"][0]["lambertEndpointResidualKm"], 1.0
        )

    def test_mixed_reference_frame_chain_remains_ordered(self):
        result = self.calculate([
            section("earth", "earth-moon", "local"),
            section("earth-moon", "mars", "interplanetary"),
            section("mars", "sun", "solar"),
        ])

        self.assertEqual(
            [(item["originId"], item["targetId"]) for item in result["routeSections"]],
            [
                ("earth", "earth-moon"),
                ("earth-moon", "mars"),
                ("mars", "sun"),
            ],
        )
        self.assertTrue(result["stateChain"]["continuousPosition"])
        self.assertTrue(result["stateChain"]["referenceFramesSelectedPerSection"])
        self.assertEqual(len(result["trajectory"]), 541)

    def test_solar_passage_is_collision_free_and_route_continues_to_jupiter(self):
        result = simulate_route_sections({
            "mission": {"startDate": "2026-07-28"},
            "waypointId": "jupiter",
            "routeSections": [
                section("earth", "sun", "solar-entry"),
                section("sun", "jupiter", "jupiter-transfer"),
            ],
        })

        minimum_solar_radius = min(
            _magnitude(tuple(point["positionKm"]))
            for point in result["trajectory"]
        )
        self.assertGreater(minimum_solar_radius, SUN_RADIUS_KM)
        self.assertEqual(result["waypoint"]["id"], "jupiter")
        self.assertEqual(
            result["waypoint"]["trajectoryIndex"],
            result["routeSections"][1]["entryIndex"],
        )
        self.assertTrue(result["validation"]["collisionFree"])
        self.assertGreater(
            result["validation"]["minimumSolarAltitudeKm"], 0.0
        )

    def test_unsafe_lambert_fallback_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Kein kollisionsfreier"):
            _candidate(
                (100.0, 0.0, 0.0),
                (0.0, 200.0, 0.0),
                1_000.0,
                (0.0, 0.0, 0.0),
                1_000.0,
                minimum_central_radius_km=1_000.0,
            )

    def test_infeasible_ideal_route_is_not_reported_as_applied(self):
        inbound = section("earth", "sun", "in")
        outbound = section("sun", "earth", "out")
        inbound["deltaVPlusKmS"] = 0.5
        outbound["deltaVPlusKmS"] = 0.5

        result = self.calculate([inbound, outbound])

        self.assertFalse(result["summary"]["feasibleWithConfiguredBurn"])
        self.assertFalse(result["summary"]["targetInjectionApplied"])
        self.assertFalse(result["summary"]["passiveTargeting"])

    def test_full_jupiter_orbit_exit_angle_targets_earth_return(self):
        jupiter = section("sun", "jupiter", "jupiter-orbit")
        jupiter["passage"] = {
            "mode": "full-orbit",
            "orbitAngleDeg": 360,
            "orbitDirection": "prograde",
            "entryBehavior": "ballistic",
            "exitBehavior": "ballistic",
        }

        result = self.calculate([
            section("earth", "sun", "earth-sun"),
            jupiter,
            section("jupiter", "earth", "jupiter-earth"),
        ])

        jupiter_section = result["routeSections"][1]
        earth_return = result["routeSections"][2]
        selection = jupiter_section["corridor"]["exitAngleSelection"]
        self.assertEqual(selection["lookaheadTargetId"], "earth")
        self.assertGreater(selection["selectedAngleDeg"], 360.0)
        self.assertAlmostEqual(
            jupiter_section["corridor"]["passageSignedAngleDeg"],
            selection["selectedAngleDeg"],
        )
        self.assertEqual(earth_return["targetId"], "earth")
        self.assertLess(earth_return["lambertEndpointResidualKm"], 1.0)

    def test_partial_multi_orbit_keeps_complete_turns_when_targeting_exit(self):
        jupiter = section("sun", "jupiter", "jupiter-orbit")
        jupiter["passage"] = {
            "mode": "partial-orbit",
            "orbitAngleDeg": 540,
            "orbitDirection": "prograde",
            "entryBehavior": "ballistic",
            "exitBehavior": "ballistic",
        }

        result = self.calculate([
            section("earth", "sun", "earth-sun"),
            jupiter,
            section("jupiter", "earth", "jupiter-earth"),
        ])

        selection = result["routeSections"][1]["corridor"]["exitAngleSelection"]
        self.assertEqual(selection["requestedAngleDeg"], 540.0)
        self.assertGreaterEqual(selection["selectedAngleDeg"], 360.0)
        self.assertLess(selection["selectedAngleDeg"], 720.0)


if __name__ == "__main__":
    unittest.main()
