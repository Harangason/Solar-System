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
| `planner/mission_optimizer.py` | Startfenstersuche und solare Energiebewertung | `optimize_launch_window()`, `assess_solar_energy()` |

Neue Aufrufer verwenden qualifizierte Imports, zum Beispiel:

```python
from planner.multi_route_planner import simulate_route_sections
```

Die gleichnamigen Module am Projektstamm sind nur Kompatibilitaets-Aliase.
Physikalische Nachweise und Grenzfaelle stehen in
[CALCULATION_METHODS.md](CALCULATION_METHODS.md).

## Tests

Planner-Verhalten wird insbesondere durch `tests/test_generic_route_planner.py`,
`tests/test_multi_route_planner.py`, `tests/test_entry_corridor_blocking.py`
und `tests/test_mission_optimizer_energy.py` geprueft.
