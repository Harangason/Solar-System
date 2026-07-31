# Planner

Zurueck zum [Dokumentationsindex](README.md).

Das Paket `planner/` erzeugt und bewertet Missionsrouten. Es konsumiert
Zustaende aus `solver/`, Geometriedaten aus `visualization/` und schreibt
Rechennachweise ueber `services/`.

## Module

| Modul | Aufgabe | Oeffentlicher Einstieg |
| --- | --- | --- |
| `planner/route_planner.py` | Solar-Oberth-, Lambert-, Swing-by- und Direktrouten | `simulate_waypoint_route()`, `simulate_direct_solar_route()` |
| `planner/generic_route_planner.py` | Freie Abschnitte zwischen Sonne, Planeten und Monden | `simulate_generic_route_sections()` |
| `planner/multi_route_planner.py` | Klassifikation und Kopplung geordneter Abschnitte | `classify_route_sections()`, `simulate_route_sections()` |
| `planner/interstellar_targets.py` | J2000-Katalogrichtungen und hypothetische 50-AE-Asymptoten | `interstellar_direction()` |
| `planner/mission_optimizer.py` | Startfenstersuche und solare Energiebewertung | `optimize_launch_window()`, `assess_solar_energy()` |

Neue Aufrufer verwenden qualifizierte Imports, zum Beispiel:

```python
from planner.multi_route_planner import simulate_route_sections
```

Die gleichnamigen Module am Projektstamm sind nur Kompatibilitaets-Aliase.
Physikalische Nachweise und Grenzfaelle stehen in
[CALCULATION_METHODS.md](CALCULATION_METHODS.md).

## Planungsreihenfolge

`simulate_route_sections()` erhaelt immer die vollstaendige, vom Nutzer
geordnete Abschnittsliste. Die Konstellationssuche verwendet zunaechst das
Linienmodell, anschliessend validiert die Geometriestufe Zielresiduen,
Zeitmonotonie, Abschnittsindizes, Zustandskontinuitaet, Kollisionen und
Wegpunktkorridore. Delta-v und Antriebsgrenzen duerfen erst die abschliessende
Leistungsbewertung beeinflussen.

Suchraster, geometrische Shortlist, Vorpruefungsbudget und Vollpruefungsbudget
werden aus Suchraum und Anzahl der Routenabschnitte abgeleitet. Es gibt keine
fachlich festgeschriebene Trichtergroesse `1005 -> 8 -> 22 -> 5`.

Ein terminales interstellares Ziel wird immer durch den generischen Planner
verarbeitet. Es ist kein lokaler Ephemeridenkoerper, sondern eine gerade,
hypothetische 50-AE-Richtungsdarstellung ab dem letzten realen Zustand.

## Tests

Planner-Verhalten wird insbesondere durch `tests/test_generic_route_planner.py`,
`tests/test_multi_route_planner.py`, `tests/test_entry_corridor_blocking.py`
und `tests/test_mission_optimizer_energy.py` geprueft.
