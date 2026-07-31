# Projektstruktur

Der Python-Backendcode ist nach Verantwortlichkeiten gegliedert:

| Verzeichnis | Verantwortung |
| --- | --- |
| `planner/` | Routenplanung, mehrteilige Routen und Startfensteroptimierung |
| `solver/` | Trajektorien, N-Body-Propagation und Ephemeriden |
| `models/` | Fachmodelle für Antrieb, Satellit und Himmelskörper |
| `services/` | Persistenz, Aktivitätsprotokoll und Berechnungsaudits |
| `visualization/` | Serverseitige 2D-Darstellung und Daten für die 3D-Ansicht |
| `ai/` | AI-Agenten, Schemas, Evaluation und Audit |
| `web/` | React-/Three.js-Frontend |
| `tests/` | Automatisierte Python-Tests |
| `scripts/` | Wartungs- und Auswertungsskripte |

`main.py` bleibt der Einstiegspunkt des Flask-Backends. Die früheren
Top-Level-Modulnamen bestehen als Kompatibilitäts-Aliase weiter, damit externe
Aufrufer nicht unmittelbar migriert werden müssen. Neuer Code soll die
qualifizierten Importpfade wie `planner.route_planner` oder
`solver.trajectory` verwenden.

Die beabsichtigte Abhängigkeitsrichtung lautet:

```text
models -> visualization -> solver -> planner
                         services -> planner
                                  -> main
```

`data/`, `logs/`, `kernels/` und `web/public/` werden weiterhin relativ zum
Projektstamm aufgelöst.
