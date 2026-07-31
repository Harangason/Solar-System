from io import BytesIO
from math import log10

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from visualization.view_3d_celestials import get_solar_system_objects


def render_2d_view():
    sun, planets = get_solar_system_objects()
    figure, axis = plt.subplots(figsize=(16, 7), facecolor="#050b16")
    axis.set_facecolor("#050b16")

    sun_size = 2600
    axis.scatter(0, 0, s=sun_size, color="#ffcc45", edgecolor="#fff2b3", zorder=3)
    axis.annotate(sun.name, (0, 0), xytext=(0, -42), textcoords="offset points", ha="center", color="white")

    for planet in planets:
        x_position = 2.3 + log10(planet.orbital_distance_au + 1) * 10
        marker_size = 90 + log10(planet.radius_in_meters / 1000) * 45
        axis.plot([0, x_position], [0, 0], color="white", alpha=0.08, linewidth=1)
        axis.scatter(
            x_position,
            0,
            s=marker_size,
            color=planet.color,
            edgecolor="white",
            linewidth=0.8,
            zorder=3,
        )
        axis.annotate(
            f"{planet.name}\n{planet.orbital_distance_au:g} AE",
            (x_position, 0),
            xytext=(0, 28),
            textcoords="offset points",
            ha="center",
            color="white",
            fontsize=9,
        )

    axis.set_title("Unser Sonnensystem · Matplotlib 2D", color="white", fontsize=18, pad=24)
    axis.text(
        0.5,
        0.04,
        "Entfernungen und Körpergrößen logarithmisch skaliert",
        transform=axis.transAxes,
        ha="center",
        color="#9eb1c9",
    )
    axis.set_xlim(-2, 18)
    axis.set_ylim(-2.7, 2.7)
    axis.axis("off")
    figure.tight_layout()

    image = BytesIO()
    figure.savefig(image, format="png", dpi=140, facecolor=figure.get_facecolor(), bbox_inches="tight")
    plt.close(figure)
    image.seek(0)
    return image
