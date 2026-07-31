# Services

Zurueck zum [Dokumentationsindex](README.md).

`services/` kapselt lokale Persistenz und append-only Protokolle.

| Modul | Verantwortung | Laufzeitdaten |
| --- | --- | --- |
| `services/project_store.py` | Versionierte Projektsnapshots mit `ProjectStore` | `data/solar_simulator.db` |
| `services/activity_log.py` | Aktivitaeten, Filterung und CSV-Export | `logs/activities.jsonl` |
| `services/calculation_audit.py` | Routen-, Optimizer- und Playback-Nachweise | `logs/*.jsonl` |
| `services/calculation_store.py` | Normalisierte UUID-Persistenz aller Solvervarianten | `data/solar_simulator.db` |

Die Pfade werden relativ zum Projektstamm aufgeloest. Datenbanken, JSONL-Logs
und lokale Serverlogs gehoeren nicht in Git. Tabellen, Beziehungen und
Einheiten beschreibt [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

Services validieren Eingaben an ihrer Grenze. Audit- und Aktivitaetsprotokolle
sind Nachweise, keine alternative Quelle fuer physikalische Solver-Ergebnisse.
Berechnungsvarianten speichern Geometrievalidierung und spaetere
Leistungsbewertung getrennt; `is_feasible` bleibt bis zur Leistungsstufe
unbestimmt.
Die zugehoerigen Tests sind `tests/test_project_store.py`,
`tests/test_calculation_store.py`, `tests/test_calculation_api.py`,
`tests/test_activity_log.py` und `tests/test_playback_audit.py`.
