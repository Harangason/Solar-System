# Models

Zurueck zum [Dokumentationsindex](README.md).

`models/` enthaelt zustandsarme Fachobjekte und Antriebsmodelle, die von Solver
und Darstellung gemeinsam genutzt werden.

| Modul | Inhalt |
| --- | --- |
| `models/universe.py` | `CelestialBody`, `Planet`, `Moon` und `Star` |
| `models/satellite.py` | Raumfahrzeugkomponenten, Missionsphasen, Tether und Satellitenzustand |
| `models/propulsion.py` | Antriebstypen, Module, Bereitschaftsgrade und `PropulsionSystem` |

Antriebsmodelle liefern Kraft-, Massen- und Delta-v-Beitraege. Konzepte mit
niedrigem Technology-Readiness-Level bleiben als solche gekennzeichnet und
duerfen nicht automatisch als flugfaehige Loesung bewertet werden.

Neue Modelle sollen keine Flask-, Persistenz- oder Planner-Abhaengigkeiten
einfuehren. Ihre Einheiten und Parametergrenzen muessen im Modell und in
[CALCULATION_METHODS.md](CALCULATION_METHODS.md) nachvollziehbar bleiben.
