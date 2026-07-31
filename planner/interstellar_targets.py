"""Catalog directions for hypothetical interstellar route visualizations."""

from __future__ import annotations

from math import cos, pi, sin

from solver.trajectory import _normalize


HYPOTHETICAL_ASYMPTOTE_DISTANCE_AU = 50.0

# J2000 equatorial catalog directions offered by the route wizard.  These are
# directions only: none of these records is treated as a local ephemeris body.
INTERSTELLAR_ROUTE_TARGETS = {
    "proxima-centauri": ("Proxima Centauri", 217.43, -62.68),
    "alpha-centauri": ("Alpha Centauri A/B", 219.90, -60.83),
    "epsilon-eridani": ("Epsilon Eridani", 53.23, -9.46),
    "ross-128": ("Ross 128", 176.94, 0.80),
    "trappist-1": ("TRAPPIST-1", 346.62, -5.04),
    "55-cancri": ("55 Cancri", 133.15, 28.33),
}


def interstellar_direction(target_id: str) -> tuple | None:
    """Return the ECLIPJ2000 unit direction for a catalog target."""
    record = INTERSTELLAR_ROUTE_TARGETS.get(target_id)
    if record is None:
        return None
    _, right_ascension_deg, declination_deg = record
    right_ascension = right_ascension_deg * pi / 180
    declination = declination_deg * pi / 180
    obliquity = 23.43928 * pi / 180
    equatorial_x = cos(declination) * cos(right_ascension)
    equatorial_y = cos(declination) * sin(right_ascension)
    equatorial_z = sin(declination)
    return _normalize((
        equatorial_x,
        equatorial_y * cos(obliquity) + equatorial_z * sin(obliquity),
        -equatorial_y * sin(obliquity) + equatorial_z * cos(obliquity),
    ))
