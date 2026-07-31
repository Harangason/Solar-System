from models.universe import Planet, Star


# J2000-Elemente nach JPL, geeignet für eine näherungsweise Echtzeitdarstellung.
PLANET_DATA = (
    ("mercury", "Merkur", 3.3011e23, 2.4397e6, 440, 0.38709927, 88.0, "#a8a39d", False, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593),
    ("venus", "Venus", 4.8675e24, 6.0518e6, 737, 0.72333566, 224.7, "#d9a45b", False, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255),
    ("earth", "Erde", 5.97237e24, 6.371e6, 288, 1.00000261, 365.25, "#2b82d9", False, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0),
    ("mars", "Mars", 6.4171e23, 3.3895e6, 210, 1.52371034, 687.0, "#c65f3c", False, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891),
    ("jupiter", "Jupiter", 1.8982e27, 6.9911e7, 165, 5.20288700, 4331.0, "#d6a36f", False, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909),
    ("saturn", "Saturn", 5.6834e26, 5.8232e7, 134, 9.53667594, 10747.0, "#e8cf8b", True, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448),
    ("uranus", "Uranus", 8.6810e25, 2.5362e7, 76, 19.18916464, 30589.0, "#79d4dc", False, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503),
    ("neptune", "Neptun", 1.02413e26, 2.4622e7, 72, 30.06992276, 59800.0, "#3156c8", False, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574),
)


def get_solar_system_objects():
    sun = Star(
        name="Sonne",
        mass=1.9885e30,
        radius=6.9634e8,
        luminosity=3.828e26,
        age_in_years=4.6e9,
    )
    planets = []
    for (
        planet_id, name, mass, radius, temperature, distance, period, color, rings,
        eccentricity, inclination, mean_longitude, perihelion_longitude, ascending_node,
    ) in PLANET_DATA:
        planet = Planet(
            name=name,
            mass=mass,
            radius=radius,
            mean_temperature=temperature,
            host_star=sun,
            orbital_distance_au=distance,
            orbital_period_days=period,
            color=color,
            has_rings=rings,
            planet_id=planet_id,
        )
        planet.eccentricity = eccentricity
        planet.inclination_deg = inclination
        planet.mean_longitude_j2000_deg = mean_longitude
        planet.perihelion_longitude_deg = perihelion_longitude
        planet.ascending_node_longitude_deg = ascending_node
        planets.append(planet)
    sun.surrounding_planets.extend(planets)
    return sun, planets


def get_solar_system_data():
    sun, planets = get_solar_system_objects()
    return {
        "sun": {
            "id": "sun",
            "name": sun.name,
            "radiusKm": sun.radius_in_meters / 1000,
            "color": "#ffcc45",
            "surfaceGravity": sun.surface_gravity(),
        },
        "planets": [
            {
                "id": planet.planet_id,
                "name": planet.name,
                "massKg": planet.mass_in_kg,
                "radiusKm": planet.radius_in_meters / 1000,
                "temperatureK": planet.mean_temperature_in_kelvin,
                "distanceAu": planet.orbital_distance_au,
                "orbitalPeriodDays": planet.orbital_period_days,
                "surfaceGravity": planet.surface_gravity(),
                "color": planet.color,
                "hasRings": planet.has_rings,
                "eccentricity": planet.eccentricity,
                "inclinationDeg": planet.inclination_deg,
                "meanLongitudeJ2000Deg": planet.mean_longitude_j2000_deg,
                "perihelionLongitudeDeg": planet.perihelion_longitude_deg,
                "ascendingNodeLongitudeDeg": planet.ascending_node_longitude_deg,
            }
            for planet in planets
        ],
        "scaleNotice": "Alle Bahnen und Positionen verwenden dieselbe Wurzelskala 5 × √AE. Kleine Planeten sind ×10, Gas- und Eisriesen ×3 vergrößert.",
    }
