"""Generate the browser moon catalogue from JPL's public satellite tables."""

from __future__ import annotations

import html
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


DISCOVERY_URL = "https://ssd.jpl.nasa.gov/sats/discovery.html"
ELEMENTS_URL = "https://ssd.jpl.nasa.gov/sats/elem/"
OUTPUT = Path(__file__).parents[1] / "web" / "public" / "moons.json"
PLANETS = {"Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"}


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "solar-system-education/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def text_content(value: str) -> str:
    value = re.sub(r"<br\s*/?>", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"<[^>]+>", "", value)
    return " ".join(html.unescape(value).replace("\xa0", " ").split())


def rows(document: str):
    for row_match in re.finditer(r"<tr(?P<attrs>[^>]*)>(?P<body>.*?)</tr>", document, re.I | re.S):
        cells = [
            text_content(cell)
            for cell in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_match.group("body"), re.I | re.S)
        ]
        if cells:
            yield row_match.group("attrs"), cells


def parse_discoveries(document: str) -> list[dict]:
    moons: list[dict] = [{
        "id": "earth-moon",
        "name": "Moon",
        "parentId": "earth",
        "provisionalDesignation": None,
    }]
    parent = None
    for attrs, cells in rows(document):
        planet_match = re.search(
            r"Satellites of (?:Dwarf Planet )?([A-Za-z]+):\s*\d+",
            " ".join(cells),
        )
        if planet_match:
            candidate = planet_match.group(1)
            parent = candidate if candidate in PLANETS - {"Earth"} else None
            continue
        if not parent or len(cells) < 3 or cells[0] in {"Number", "No."}:
            continue
        name = cells[1] or cells[2]
        if not name:
            continue
        provisional = cells[2] or None
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        moons.append({
            "id": f"{parent.lower()}-{slug}",
            "name": name,
            "parentId": parent.lower(),
            "provisionalDesignation": provisional,
        })
    return moons


def number(value: str) -> float | None:
    cleaned = value.replace(",", "").replace("−", "-").strip()
    cleaned = re.sub(r"[^0-9.eE+\-]", "", cleaned)
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_elements(document: str) -> dict[tuple[str, str], dict]:
    result: dict[tuple[str, str], dict] = {}
    for _, cells in rows(document):
        # ID, planet, satellite, code, ephemeris, frame, epoch,
        # a, e, argument of periapsis, mean anomaly, inclination, node, period, ...
        if len(cells) < 14 or cells[1] not in PLANETS:
            continue
        semi_major_axis = number(cells[7])
        period = number(cells[13])
        if semi_major_axis is None or period is None:
            continue
        values = {
            "semiMajorAxisKm": semi_major_axis,
            "eccentricity": number(cells[8]) or 0.0,
            "argumentPeriapsisDeg": number(cells[9]) or 0.0,
            "meanAnomalyEpochDeg": number(cells[10]) or 0.0,
            "inclinationDeg": number(cells[11]) or 0.0,
            "ascendingNodeDeg": number(cells[12]) or 0.0,
            "orbitalPeriodDays": abs(period),
            "epoch": cells[6],
            "orbitSource": "jpl-mean-elements",
        }
        for key in {cells[2], cells[3]}:
            if key:
                result[(cells[1].lower(), key.casefold())] = values
    return result


def main() -> None:
    moons = parse_discoveries(fetch(DISCOVERY_URL))
    elements = parse_elements(fetch(ELEMENTS_URL))
    matched = 0
    for moon in moons:
        candidates = [moon["name"], moon.get("provisionalDesignation")]
        orbit = next(
            (elements[(moon["parentId"], candidate.casefold())]
             for candidate in candidates
             if candidate and (moon["parentId"], candidate.casefold()) in elements),
            None,
        )
        if orbit:
            moon.update(orbit)
            matched += 1

    counts = {
        planet: sum(moon["parentId"] == planet for moon in moons)
        for planet in ("mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune")
    }
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"catalogue": DISCOVERY_URL, "meanElements": ELEMENTS_URL},
        "total": len(moons),
        "withJplElements": matched,
        "counts": counts,
        "moons": moons,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(moons)} moons ({matched} with orbital elements) to {OUTPUT}")
    print(counts)


if __name__ == "__main__":
    main()
