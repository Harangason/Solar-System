# Solver

Zurueck zum [Dokumentationsindex](README.md).

Das Paket `solver/` enthaelt die numerische Dynamik. Planner duerfen Solver
aufrufen; Solver importieren keine Planner-Module.

## Module

| Modul | Aufgabe | Oeffentlicher Einstieg |
| --- | --- | --- |
| `solver/trajectory.py` | Missionskonfiguration, RK4-Bahn, Navigation und Ergebnisobjekte | `simulate_mission()`, `get_default_mission_config()` |
| `solver/nbody_propagation.py` | Kontinuierliche N-Body-Propagation und differentielle Korrektur | `propagate_continuous_n_body()`, `validate_continuous_waypoint_route()` |
| `solver/ephemeris.py` | SPICE-Zustaende, Zeitumrechnung und Kepler-Fallback | `planet_state()`, `get_ephemeris_status()` |

Ephemeriden werden ueber `SOLAR_SIM_EPHEMERIS_MODE` als `auto`, `spice` oder
`kepler` konfiguriert. Lokale Kernel und der Download sind in
[kernels/README.md](../kernels/README.md) beschrieben.

## Numerische Regeln

- Physikalische Positionen werden in Kilometern und Geschwindigkeiten in
  `km/s` verarbeitet.
- Zeitintegrationen verwenden Sekunden; API-Ergebnisse duerfen Tage ausweisen.
- Solver-Ergebnisse werden nicht durch manuelle Visualisierungspunkte ersetzt.
- Hochgenaue Propagation muss an Abschnittsgrenzen stetige Zustaende behalten.

Tests liegen in `tests/test_nbody_propagation.py`, `tests/test_ephemeris.py` und
den Planner-Integrationstests.
