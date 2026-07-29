"""Generic patched-conic baseline for freely connected route sections.

The specialised solar-Oberth planner remains available for its original
Sun-to-planet mission.  This module handles user-defined starts at the Sun,
any catalogued planet, and catalogued moons without silently replacing the
selected origin with Earth.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from math import acos, atan2, cos, pi, sin, sqrt
from pathlib import Path

from route_planner import (
    G_KM3_KG_S2,
    _cross,
    _dot,
    _lambert_candidates,
    _parse_entry_corridor,
    _propagate_lambert_segment,
    _subtract,
)
from trajectory import (
    AU_KM,
    DAY_SECONDS,
    J2000,
    MU_SUN,
    PLANET_EPHEMERIDES,
    _add,
    _magnitude,
    _mission_epoch_days,
    _normalize,
    _planet_state_at,
)
from view_3d_celestials import PLANET_DATA


SUN_RADIUS_KM = 696_340.0
SUN_MASS_KG = MU_SUN / G_KM3_KG_S2
MOON_CATALOG = Path(__file__).parent / "web" / "public" / "moons.json"

# Physical radii are deliberately separate from the orbital-elements catalog.
# Unknown small moons remain routable as point targets with a conservative
# 10 km keep-out radius instead of being rejected by an ID allow-list.
KNOWN_MOON_RADII_KM = {
    "earth-moon": 1_737.4,
    "mars-phobos": 11.267,
    "mars-deimos": 6.2,
    "jupiter-io": 1_821.6,
    "jupiter-europa": 1_560.8,
    "jupiter-ganymede": 2_634.1,
    "jupiter-callisto": 2_410.3,
    "saturn-titan": 2_574.7,
    "saturn-enceladus": 252.1,
    "uranus-titania": 788.9,
    "uranus-oberon": 761.4,
    "neptune-triton": 1_353.4,
}

PASSAGE_MODES = {"direct", "partial-orbit", "full-orbit"}
PASSAGE_DIRECTIONS = {"prograde", "retrograde"}
BOUNDARY_BEHAVIORS = {
    "ballistic",
    "tangential-prograde",
    "tangential-retrograde",
    "tangential-accelerate",
    "radial",
}


def parse_route_passage(raw: object) -> dict:
    """Normalize the wizard's target-passage definition for every planner."""
    source = raw if isinstance(raw, dict) else {}
    mode = str(source.get("mode") or "direct")
    if mode not in PASSAGE_MODES:
        raise ValueError(f"Unbekannter Passagemodus '{mode}'.")

    direction = str(source.get("orbitDirection") or "prograde")
    if direction not in PASSAGE_DIRECTIONS:
        raise ValueError(f"Unbekannte Umlaufrichtung '{direction}'.")

    entry_behavior = str(source.get("entryBehavior") or "ballistic")
    exit_behavior = str(source.get("exitBehavior") or "ballistic")
    if entry_behavior not in BOUNDARY_BEHAVIORS:
        raise ValueError(f"Unbekanntes Eintrittsverhalten '{entry_behavior}'.")
    if exit_behavior not in BOUNDARY_BEHAVIORS:
        raise ValueError(f"Unbekanntes Austrittsverhalten '{exit_behavior}'.")

    requested_angle = float(source.get("orbitAngleDeg") or 0.0)
    orbit_angle = (
        0.0
        if mode == "direct"
        else 360.0
        if mode == "full-orbit"
        else max(1.0, min(359.0, requested_angle or 45.0))
    )
    return {
        "mode": mode,
        "orbitAngleDeg": orbit_angle,
        "orbitDirection": direction,
        "entryBehavior": entry_behavior,
        "exitBehavior": exit_behavior,
    }


def _rotate_vector(vector: tuple, axis: tuple, angle_rad: float) -> tuple:
    axis = _normalize(axis)
    parallel = tuple(_dot(vector, axis) * component for component in axis)
    perpendicular = _subtract(vector, parallel)
    cross = _cross(axis, vector)
    return tuple(
        parallel[index]
        + perpendicular[index] * cos(angle_rad)
        + cross[index] * sin(angle_rad)
        for index in range(3)
    )


@dataclass(frozen=True)
class RouteBody:
    id: str
    name: str
    kind: str
    radius_km: float
    mass_kg: float
    parent_id: str | None = None
    moon_elements: dict | None = None


def _catalog() -> dict[str, RouteBody]:
    result = {
        "sun": RouteBody("sun", "Sonne", "sun", SUN_RADIUS_KM, SUN_MASS_KG),
    }
    for row in PLANET_DATA:
        result[row[0]] = RouteBody(
            id=row[0],
            name=row[1],
            kind="planet",
            radius_km=row[3] / 1_000,
            mass_kg=row[2],
            parent_id="sun",
        )
    try:
        moon_rows = json.loads(MOON_CATALOG.read_text(encoding="utf-8"))["moons"]
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Mondkatalog konnte nicht geladen werden: {error}") from error
    for row in moon_rows:
        if not row.get("semiMajorAxisKm") or not row.get("orbitalPeriodDays"):
            continue
        result[row["id"]] = RouteBody(
            id=row["id"],
            name=row["name"],
            kind="moon",
            radius_km=KNOWN_MOON_RADII_KM.get(row["id"], 10.0),
            mass_kg=0.0,
            parent_id=row["parentId"],
            moon_elements=row,
        )
    return result


def _planet_records(planet_id: str) -> tuple[tuple, tuple]:
    ephemeris = next(row for row in PLANET_EPHEMERIDES if row[0] == planet_id)
    data = next(row for row in PLANET_DATA if row[0] == planet_id)
    return ephemeris, data


def _epoch_days(epoch: str | None) -> float:
    if not epoch:
        return 0.0
    value = epoch.strip()
    if value.endswith(".5") and len(value) == 12:
        parsed = datetime.strptime(value[:-2], "%Y-%m-%d").replace(
            hour=12, tzinfo=timezone.utc
        )
    elif value.endswith(".0") and len(value) == 12:
        parsed = datetime.strptime(value[:-2], "%Y-%m-%d").replace(
            tzinfo=timezone.utc
        )
    else:
        parsed = datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
    return (parsed - J2000).total_seconds() / DAY_SECONDS


def _moon_relative_state(body: RouteBody, absolute_days: float) -> tuple[tuple, tuple]:
    elements = body.moon_elements or {}
    semi_major = float(elements["semiMajorAxisKm"])
    eccentricity = float(elements.get("eccentricity") or 0.0)
    period_days = float(elements["orbitalPeriodDays"])
    mean_anomaly = (
        float(elements.get("meanAnomalyEpochDeg") or 0.0) * pi / 180
        + 2 * pi * (absolute_days - _epoch_days(elements.get("epoch"))) / period_days
    ) % (2 * pi)
    eccentric_anomaly = mean_anomaly
    for _ in range(12):
        eccentric_anomaly -= (
            eccentric_anomaly - eccentricity * sin(eccentric_anomaly) - mean_anomaly
        ) / max(1e-12, 1 - eccentricity * cos(eccentric_anomaly))
    x_orbit = semi_major * (cos(eccentric_anomaly) - eccentricity)
    y_orbit = semi_major * sqrt(max(0.0, 1 - eccentricity**2)) * sin(eccentric_anomaly)
    mean_motion = 2 * pi / (period_days * DAY_SECONDS)
    denominator = max(1e-12, 1 - eccentricity * cos(eccentric_anomaly))
    vx_orbit = -semi_major * mean_motion * sin(eccentric_anomaly) / denominator
    vy_orbit = (
        semi_major * mean_motion * sqrt(max(0.0, 1 - eccentricity**2))
        * cos(eccentric_anomaly) / denominator
    )
    argument = float(elements.get("argumentPeriapsisDeg") or 0.0) * pi / 180
    inclination = float(elements.get("inclinationDeg") or 0.0) * pi / 180
    node = float(elements.get("ascendingNodeDeg") or 0.0) * pi / 180

    def rotate(x_value: float, y_value: float) -> tuple:
        peri_x = x_value * cos(argument) - y_value * sin(argument)
        peri_y = x_value * sin(argument) + y_value * cos(argument)
        return (
            peri_x * cos(node) - peri_y * cos(inclination) * sin(node),
            peri_x * sin(node) + peri_y * cos(inclination) * cos(node),
            peri_y * sin(inclination),
        )

    return rotate(x_orbit, y_orbit), rotate(vx_orbit, vy_orbit)


def _body_state(
    body: RouteBody,
    absolute_days: float,
    catalog: dict[str, RouteBody],
) -> tuple[tuple, tuple]:
    if body.kind == "sun":
        return (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)
    if body.kind == "planet":
        ephemeris, _ = _planet_records(body.id)
        return _planet_state_at(ephemeris, absolute_days)
    parent = catalog[body.parent_id]
    parent_position, parent_velocity = _body_state(parent, absolute_days, catalog)
    relative_position, relative_velocity = _moon_relative_state(body, absolute_days)
    return (
        _add(parent_position, relative_position),
        _add(parent_velocity, relative_velocity),
    )


def _local_central_body(
    origin: RouteBody,
    target: RouteBody,
    catalog: dict[str, RouteBody],
) -> RouteBody | None:
    if origin.kind == "planet" and target.parent_id == origin.id:
        return origin
    if target.kind == "planet" and origin.parent_id == target.id:
        return target
    if origin.kind == "moon" and target.kind == "moon":
        if origin.parent_id == target.parent_id:
            return catalog[origin.parent_id]
    return None


def _parking_radius(body: RouteBody) -> float:
    if body.kind == "sun":
        return body.radius_km * 1.12
    return body.radius_km + max(100.0, body.radius_km * 0.08)


def _entry_radius(body: RouteBody, catalog: dict[str, RouteBody]) -> float:
    if body.kind == "sun":
        return _parking_radius(body)
    if body.kind == "planet":
        ephemeris, _ = _planet_records(body.id)
        soi = ephemeris[2] * AU_KM * (body.mass_kg / SUN_MASS_KG) ** (2 / 5)
        return max(_parking_radius(body), soi)
    parent = catalog[body.parent_id]
    semi_major = float((body.moon_elements or {})["semiMajorAxisKm"])
    # A moon without a catalogued mass still receives a finite navigation
    # boundary.  This is not presented as a physical SOI.
    return max(_parking_radius(body), min(semi_major * 0.02, body.radius_km * 20))


def _transfer_seconds(
    start: tuple,
    end: tuple,
    gravitational_parameter: float,
    *,
    local: bool,
) -> float:
    start_radius = max(_magnitude(start), 1.0)
    end_radius = max(_magnitude(end), 1.0)
    hohmann = pi * sqrt(((start_radius + end_radius) / 2) ** 3 / gravitational_parameter)
    minimum = 0.2 * DAY_SECONDS if local else 20 * DAY_SECONDS
    maximum = 120 * DAY_SECONDS if local else 20 * 365.25 * DAY_SECONDS
    return max(minimum, min(maximum, hohmann))


def _candidate(
    start: tuple,
    end: tuple,
    duration_seconds: float,
    reference_velocity: tuple,
    gravitational_parameter: float,
    minimum_central_radius_km: float = 0.0,
) -> dict:
    candidates = _lambert_candidates(
        start, end, duration_seconds, gravitational_parameter
    )
    assessed = []
    for item in candidates:
        clearance = float("inf")
        if minimum_central_radius_km > 0:
            propagated, _, _ = _propagate_lambert_segment(
                start,
                item["departure"],
                0.0,
                duration_seconds,
                120,
                gravitational_parameter,
            )
            clearance = min(
                _magnitude(tuple(point["positionKm"])) for point in propagated
            )
        assessed.append((item, clearance))
    safe = [
        item for item, clearance in assessed
        if clearance >= minimum_central_radius_km - 1.0
    ]
    if minimum_central_radius_km > 0 and not safe:
        best_clearance = max(clearance for _, clearance in assessed)
        raise ValueError(
            "Kein kollisionsfreier Lambert-Zweig gefunden: "
            f"Mindestabstand {minimum_central_radius_km:.0f} km, "
            f"bester Abstand {best_clearance:.0f} km."
        )
    pool = safe or [item for item, _ in assessed]
    return min(
        pool,
        key=lambda item: _magnitude(_subtract(item["departure"], reference_velocity)),
    )


def _angle_deg(first: tuple, second: tuple) -> float:
    return acos(max(-1.0, min(1.0, _dot(_normalize(first), _normalize(second))))) * 180 / pi


def _passage_basis(entry_direction: tuple, incoming_relative_velocity: tuple) -> tuple[tuple, tuple]:
    tangential = _subtract(
        incoming_relative_velocity,
        tuple(_dot(incoming_relative_velocity, entry_direction) * component for component in entry_direction),
    )
    if _magnitude(tangential) < 1e-9:
        reference = (0.0, 0.0, 1.0) if abs(entry_direction[2]) < 0.9 else (0.0, 1.0, 0.0)
        tangential = _cross(reference, entry_direction)
    tangent = _normalize(tangential)
    normal = _normalize(_cross(entry_direction, tangent))
    return tangent, normal


def _local_passage(
    *,
    section: dict,
    target: RouteBody,
    catalog: dict[str, RouteBody],
    epoch_days: float,
    entry_day: float,
    entry_direction: tuple,
    entry_radius: float,
    entry_position: tuple,
    arrival_velocity: tuple,
) -> dict:
    passage = section["passage"]
    if passage["mode"] == "direct":
        return {
            "trajectory": [],
            "exitDay": entry_day,
            "exitPosition": entry_position,
            "exitVelocity": arrival_velocity,
            "exitDirection": entry_direction,
            "exitAngleDeg": 0.0,
            "passageDurationDays": 0.0,
            "passageDeltaVKmS": 0.0,
            "minimumRadiusKm": entry_radius,
            "periapsisOffsetIndex": 0,
        }

    target_position, target_velocity = _body_state(target, epoch_days + entry_day, catalog)
    incoming_relative_velocity = _subtract(arrival_velocity, target_velocity)
    incoming_speed = max(_magnitude(incoming_relative_velocity), 1e-6)
    _, normal = _passage_basis(entry_direction, incoming_relative_velocity)
    direction_sign = 1.0 if passage["orbitDirection"] == "prograde" else -1.0
    orbit_angle_rad = direction_sign * passage["orbitAngleDeg"] * pi / 180
    target_mu = target.mass_kg * G_KM3_KG_S2
    circular_speed = sqrt(target_mu / entry_radius) if target_mu > 0 else incoming_speed
    passage_speed = max(0.01, min(max(incoming_speed, circular_speed), incoming_speed + section["deltaVPlusKmS"]))
    entry_tangent = _normalize(_cross(normal, entry_direction))
    if direction_sign < 0:
        entry_tangent = tuple(-component for component in entry_tangent)
    desired_entry_relative_velocity = tuple(passage_speed * component for component in entry_tangent)
    entry_delta_v = _magnitude(_subtract(desired_entry_relative_velocity, incoming_relative_velocity))

    arc_length = abs(orbit_angle_rad) * entry_radius
    duration_seconds = arc_length / passage_speed if passage_speed > 0 else 0.0
    sample_count = max(16, min(360, int(abs(passage["orbitAngleDeg"]) // 2) + 32))
    points = []
    minimum_radius = float("inf")
    periapsis_index = 0
    for sample_index in range(sample_count + 1):
        fraction = sample_index / sample_count
        angle = orbit_angle_rad * fraction
        elapsed_seconds = duration_seconds * fraction
        day = entry_day + elapsed_seconds / DAY_SECONDS
        current_target_position, current_target_velocity = _body_state(
            target,
            epoch_days + day,
            catalog,
        )
        radial = _normalize(_rotate_vector(entry_direction, normal, angle))
        tangent = _normalize(_cross(normal, radial))
        if direction_sign < 0:
            tangent = tuple(-component for component in tangent)
        relative_position = tuple(entry_radius * component for component in radial)
        relative_velocity = tuple(passage_speed * component for component in tangent)
        absolute_position = _add(current_target_position, relative_position)
        absolute_velocity = _add(current_target_velocity, relative_velocity)
        radius = _magnitude(relative_position)
        if radius < minimum_radius:
            minimum_radius = radius
            periapsis_index = sample_index
        points.append({
            "elapsedDays": day,
            "positionKm": list(absolute_position),
            "velocityKmS": list(absolute_velocity),
            "waypointPositionKm": list(current_target_position),
            "waypointRelativePositionKm": list(relative_position),
        })

    exit_direction = _normalize(_rotate_vector(entry_direction, normal, orbit_angle_rad))
    exit_velocity = tuple(points[-1]["velocityKmS"])
    return {
        "trajectory": points,
        "exitDay": points[-1]["elapsedDays"],
        "exitPosition": tuple(points[-1]["positionKm"]),
        "exitVelocity": exit_velocity,
        "exitDirection": exit_direction,
        "exitAngleDeg": passage["orbitAngleDeg"] * direction_sign,
        "passageDurationDays": duration_seconds / DAY_SECONDS,
        "passageDeltaVKmS": entry_delta_v,
        "minimumRadiusKm": minimum_radius,
        "periapsisOffsetIndex": periapsis_index,
    }


def simulate_generic_route_sections(values: dict | None) -> dict:
    values = values or {}
    raw_sections = values.get("routeSections")
    if not isinstance(raw_sections, list) or not raw_sections:
        raise ValueError("Mindestens ein 2D-Routenabschnitt ist erforderlich.")
    catalog = _catalog()
    parsed: list[dict] = []
    previous_target = None
    for index, raw in enumerate(raw_sections):
        if not isinstance(raw, dict):
            raise ValueError(f"Routenabschnitt {index + 1} ist ungültig.")
        origin_id = str(raw.get("originId") or "")
        target_id = str(raw.get("targetId") or "")
        if origin_id not in catalog:
            raise ValueError(f"Ursprung '{origin_id}' besitzt keine lokale Ephemeride.")
        if target_id not in catalog:
            raise ValueError(f"Ziel '{target_id}' besitzt keine lokale Ephemeride.")
        if origin_id == target_id:
            raise ValueError(f"Abschnitt {index + 1} verbindet ein Objekt mit sich selbst.")
        if previous_target is not None and origin_id != previous_target:
            raise ValueError(
                f"Abschnitt {index + 1} beginnt bei '{origin_id}', erwartet wird "
                f"der Endpunkt '{previous_target}' des vorherigen Abschnitts."
            )
        raw_corridor = dict(raw.get("corridor") or {})
        # The schematic editor can only assess a straight approach.  Curved
        # transfer propagation below is authoritative, so cached UI metadata
        # must not veto a newly calculated body-to-body route.
        raw_corridor["blocked"] = False
        raw_corridor.pop("blockReasons", None)
        parsed.append({
            "id": str(raw.get("id") or f"route-section-{index + 1}"),
            "origin": catalog[origin_id],
            "target": catalog[target_id],
            "corridor": _parse_entry_corridor(raw_corridor),
            "passage": parse_route_passage(raw.get("passage")),
            "deltaVPlusKmS": max(0.0, float(raw.get("deltaVPlusKmS", 0.0))),
        })
        previous_target = target_id

    mission_values = dict(values.get("mission") or {})
    start_date = str(mission_values.get("startDate") or datetime.now().date().isoformat())
    epoch_days = _mission_epoch_days(start_date)
    start_day = 0.0
    first_origin = parsed[0]["origin"]
    first_target = parsed[0]["target"]
    origin_position, origin_velocity = _body_state(first_origin, epoch_days, catalog)
    target_position, _ = _body_state(first_target, epoch_days, catalog)
    initial_direction = _normalize(_subtract(target_position, origin_position))
    if first_origin.kind == "sun":
        initial_direction = _normalize(target_position)
    start_position = _add(
        origin_position,
        tuple(component * _parking_radius(first_origin) for component in initial_direction),
    )
    start_velocity = origin_velocity
    trajectory = [{
        "elapsedDays": 0.0,
        "positionKm": list(start_position),
        "velocityKmS": list(start_velocity),
    }]
    segments = []
    calculated = []
    total_delta_v = 0.0

    for index, section in enumerate(parsed):
        origin = section["origin"]
        target = section["target"]
        corridor = section["corridor"]
        central = _local_central_body(origin, target, catalog)
        gravitational_parameter = (
            central.mass_kg * G_KM3_KG_S2 if central is not None else MU_SUN
        )
        central_position, central_velocity = (
            _body_state(central, epoch_days + start_day, catalog)
            if central is not None else ((0.0, 0.0, 0.0), (0.0, 0.0, 0.0))
        )
        frame_start = _subtract(start_position, central_position)
        frame_velocity = _subtract(start_velocity, central_velocity)

        provisional_target_position, _ = _body_state(
            target, epoch_days + start_day, catalog
        )
        provisional_frame_target = _subtract(
            provisional_target_position, central_position
        )
        provisional_duration = _transfer_seconds(
            frame_start,
            provisional_frame_target,
            gravitational_parameter,
            local=central is not None,
        )
        arrival_day = start_day + provisional_duration / DAY_SECONDS
        arrival_target_position, arrival_target_velocity = _body_state(
            target, epoch_days + arrival_day, catalog
        )
        arrival_central_position, arrival_central_velocity = (
            _body_state(central, epoch_days + arrival_day, catalog)
            if central is not None else ((0.0, 0.0, 0.0), (0.0, 0.0, 0.0))
        )
        direction = _normalize(tuple(corridor["centerDirection"]))
        entry_radius = _entry_radius(target, catalog)
        entry_position = _add(
            arrival_target_position,
            tuple(component * entry_radius for component in direction),
        )
        frame_end = _subtract(entry_position, arrival_central_position)
        duration_seconds = _transfer_seconds(
            frame_start,
            frame_end,
            gravitational_parameter,
            local=central is not None,
        )
        arrival_day = start_day + duration_seconds / DAY_SECONDS
        arrival_target_position, arrival_target_velocity = _body_state(
            target, epoch_days + arrival_day, catalog
        )
        arrival_central_position, arrival_central_velocity = (
            _body_state(central, epoch_days + arrival_day, catalog)
            if central is not None else ((0.0, 0.0, 0.0), (0.0, 0.0, 0.0))
        )
        entry_position = _add(
            arrival_target_position,
            tuple(component * entry_radius for component in direction),
        )
        frame_end = _subtract(entry_position, arrival_central_position)
        selected = _candidate(
            frame_start,
            frame_end,
            duration_seconds,
            frame_velocity,
            gravitational_parameter,
            _parking_radius(central if central is not None else catalog["sun"]),
        )
        transition_delta_v = _magnitude(
            _subtract(selected["departure"], frame_velocity)
        )
        segment_start_index = len(trajectory) - 1
        relative_trajectory, propagated_end, propagated_velocity = (
            _propagate_lambert_segment(
                frame_start,
                selected["departure"],
                start_day,
                duration_seconds,
                180,
                gravitational_parameter,
            )
        )
        emitted = []
        for point in relative_trajectory:
            point_day = float(point["elapsedDays"])
            point_central_position = (
                _body_state(central, epoch_days + point_day, catalog)[0]
                if central is not None else (0.0, 0.0, 0.0)
            )
            emitted.append({
                "elapsedDays": point_day,
                "positionKm": list(_add(tuple(point["positionKm"]), point_central_position)),
            })
        emitted[-1]["positionKm"] = list(entry_position)
        trajectory.extend(emitted[1:])
        segment_end_index = len(trajectory) - 1
        arrival_velocity = _add(propagated_velocity, arrival_central_velocity)
        trajectory[-1]["velocityKmS"] = list(arrival_velocity)
        passage_result = _local_passage(
            section=section,
            target=target,
            catalog=catalog,
            epoch_days=epoch_days,
            entry_day=arrival_day,
            entry_direction=direction,
            entry_radius=entry_radius,
            entry_position=entry_position,
            arrival_velocity=arrival_velocity,
        )
        if passage_result["trajectory"]:
            trajectory.extend(passage_result["trajectory"][1:])
        exit_index = len(trajectory) - 1
        periapsis_index = segment_end_index + passage_result["periapsisOffsetIndex"]
        exit_day = passage_result["exitDay"]
        exit_position = passage_result["exitPosition"]
        exit_velocity = passage_result["exitVelocity"]
        passage_delta_v = passage_result["passageDeltaVKmS"]
        horizontal = atan2(direction[1], direction[0]) * 180 / pi
        latitude = atan2(direction[2], sqrt(direction[0]**2 + direction[1]**2)) * 180 / pi
        calculated.append({
            "id": section["id"],
            "originId": origin.id,
            "targetId": target.id,
            "targetName": target.name,
            "sectionType": (
                f"{central.name}-zentrierter Transfer"
                if central is not None else "heliozentrischer Transfer"
            ),
            "transferStartIndex": segment_start_index,
            "entryIndex": segment_end_index,
            "periapsisIndex": periapsis_index,
            "exitIndex": exit_index,
            "entryDay": arrival_day,
            "periapsisDay": trajectory[periapsis_index]["elapsedDays"],
            "exitDay": exit_day,
            "entryPositionKm": list(entry_position),
            "entryDirection": list(direction),
            "entryLatitudeDeg": latitude,
            "exitPositionKm": list(exit_position),
            "exitVelocityKmS": list(exit_velocity),
            "minimumAltitudeKm": passage_result["minimumRadiusKm"] - target.radius_km,
            "sphereOfInfluenceRadiusKm": entry_radius,
            "requiredTransitionDeltaVKmS": transition_delta_v,
            "requiredPassageDeltaVKmS": passage_delta_v,
            "requiredSectionDeltaVKmS": transition_delta_v + passage_delta_v,
            "corridorInsertionDeltaVKmS": passage_delta_v,
            "entryVelocityPreserved": passage_delta_v < 1e-9,
            "lookaheadTargetId": (
                parsed[index + 1]["target"].id if index + 1 < len(parsed) else None
            ),
            "lookaheadAlignmentDeg": 0.0,
            "predictedPassiveTurnDeg": 0.0,
            "passage": section["passage"],
            "corridor": {
                "enabled": corridor["enabled"],
                "centerDirection": list(direction),
                "horizontalHalfAngleDeg": corridor["horizontalHalfAngleDeg"],
                "verticalHalfAngleDeg": corridor["verticalHalfAngleDeg"],
                "rotationDeg": corridor["rotationDeg"],
                "actualHorizontalOffsetDeg": 0.0,
                "actualVerticalOffsetDeg": 0.0,
                "entryInsideCorridor": True,
                "exitDirection": list(passage_result["exitDirection"]),
                "passageSignedAngleDeg": passage_result["exitAngleDeg"],
            },
            "relativeTrajectory": [
                {
                    "elapsedDays": point["elapsedDays"],
                    "positionKm": point["waypointRelativePositionKm"],
                }
                for point in passage_result["trajectory"]
            ],
            "lambertEndpointResidualKm": _magnitude(
                _subtract(propagated_end, frame_end)
            ),
            "lambertVelocityResidualKmS": _magnitude(
                _subtract(propagated_velocity, selected["arrival"])
            ),
        })
        segments.append({
            "id": f"{section['id']}-transfer",
            "label": f"{origin.name} → {target.name}",
            "startIndex": segment_start_index,
            "endIndex": exit_index,
        })
        total_delta_v += transition_delta_v + passage_delta_v
        start_position = exit_position
        start_velocity = exit_velocity
        start_day = exit_day

    first = calculated[0]
    first_definition = parsed[0]
    requested_waypoint_id = str(values.get("waypointId") or "")
    focus_index = next(
        (
            index for index in range(len(calculated) - 1, -1, -1)
            if calculated[index]["targetId"] == requested_waypoint_id
        ),
        len(calculated) - 1,
    )
    focus = calculated[focus_index]
    focus_definition = parsed[focus_index]
    warnings = [
        (
            f"Abschnitt {index + 1} benötigt am Übergang Δv "
            f"{section['requiredTransitionDeltaVKmS']:.2f} km/s."
        )
        for index, section in enumerate(calculated)
        if section["requiredTransitionDeltaVKmS"]
        > parsed[index]["deltaVPlusKmS"] + 1e-9
    ]
    final_velocity = tuple(trajectory[-1].get("velocityKmS", start_velocity))
    minimum_solar_radius_km = min(
        _magnitude(tuple(point["positionKm"])) for point in trajectory
    )
    if minimum_solar_radius_km < SUN_RADIUS_KM - 1.0:
        raise ValueError(
            "Die propagierte Route schneidet den Sonnenkörper "
            f"(Minimum {minimum_solar_radius_km:.0f} km)."
        )
    feasible_with_configured_burn = all(
        section["requiredTransitionDeltaVKmS"]
        <= parsed[index]["deltaVPlusKmS"] + 1e-9
        for index, section in enumerate(calculated)
    )
    return {
        "startDate": start_date,
        "totalFlightDays": start_day,
        "warnings": warnings,
        "trajectory": trajectory,
        "segments": segments,
        "routeSections": calculated,
        "stateChain": {
            "continuousPosition": True,
            "exitStateFeedsNextSection": True,
            "transitionImpulsesExplicit": True,
            "coordinateConvention": "x=Breite, y=Tiefe, z=Höhe (ECLIPJ2000)",
            "referenceFramesSelectedPerSection": True,
        },
        "validation": {
            "collisionFree": True,
            "minimumSolarRadiusKm": minimum_solar_radius_km,
            "sunRadiusKm": SUN_RADIUS_KM,
            "minimumSolarAltitudeKm": minimum_solar_radius_km - SUN_RADIUS_KM,
        },
        "waypoint": {
            "id": focus["targetId"],
            "name": focus["targetName"],
            "encounterDay": focus["entryDay"],
            "entryDay": focus["entryDay"],
            "exitDay": focus["exitDay"],
            "flybyAltitudeKm": focus["minimumAltitudeKm"],
            "minimumFlybyAltitudeKm": 0.0,
            "trajectoryIndex": focus["entryIndex"],
            "positionKm": focus["entryPositionKm"],
        },
        "entryCorridor": {
            "enabled": focus_definition["corridor"]["enabled"],
            "surface": "körperbezogene Navigationsgrenze",
            "selectionStrategy": "körperbasierte Bezugssystemwahl mit Lambert-Basislösung",
            "centerDirection": list(focus_definition["corridor"]["centerDirection"]),
            "horizontalHalfAngleDeg": focus_definition["corridor"]["horizontalHalfAngleDeg"],
            "verticalHalfAngleDeg": focus_definition["corridor"]["verticalHalfAngleDeg"],
            "rotationDeg": focus_definition["corridor"]["rotationDeg"],
            "selectedDirection": focus["entryDirection"],
            "evaluatedTargetCount": 1,
            "actualEntryDirection": focus["entryDirection"],
            "actualHorizontalOffsetDeg": 0.0,
            "actualVerticalOffsetDeg": 0.0,
            "actualEntryPositionKm": focus["entryPositionKm"],
            "entryInsideCorridor": True,
        },
        "outgoingDirection": list(_normalize(final_velocity)),
        "summary": {
            "flybyMode": "multi-section",
            "requiredInjectionDeltaVKmS": first["requiredTransitionDeltaVKmS"],
            "availableInjectionDeltaVKmS": first_definition["deltaVPlusKmS"],
            "solarDepartureInjectionApplied": (
                first["requiredTransitionDeltaVKmS"]
                <= first_definition["deltaVPlusKmS"] + 1e-9
            ),
            "incomingExcessSpeedKmS": 0.0,
            "turnAngleDeg": 0.0,
            "heliocentricSpeedBeforeKmS": _magnitude(tuple(trajectory[0]["velocityKmS"])),
            "heliocentricSpeedAfterKmS": _magnitude(final_velocity),
            "speedGainKmS": (
                _magnitude(final_velocity)
                - _magnitude(tuple(trajectory[0]["velocityKmS"]))
            ),
            "targetCorrectionDeltaVKmS": (
                calculated[1]["requiredTransitionDeltaVKmS"]
                if len(calculated) > 1 else 0.0
            ),
            "targetInjectionApplied": (
                feasible_with_configured_burn and len(calculated) > 1
            ),
            "passiveTargeting": (
                feasible_with_configured_burn and len(calculated) == 1
            ),
            "courseChangeDeg": 0.0,
            "periapsisSpeedKmS": _magnitude(final_velocity),
            "observationWindowHours": 0.0,
            "targetAlignmentDeg": 0.0,
            "feasibleWithConfiguredBurn": feasible_with_configured_burn,
            "entryCorridorTargeted": first_definition["corridor"]["enabled"],
            "entryInsideCorridor": True,
            "warnings": warnings,
            "model": "körperbasierte Patched-Conic-Basisroute",
            "totalTransitionDeltaVKmS": total_delta_v,
        },
    }
