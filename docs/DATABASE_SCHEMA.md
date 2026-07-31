# Datenbankschema fuer Berechnungsergebnisse

Zurueck zum [Dokumentationsindex](README.md).

Berechnungsergebnisse werden gemeinsam mit Projekten in
`data/solar_simulator.db` gespeichert. Alle fachlichen Tabellen verwenden eine
kanonische UUID als `TEXT PRIMARY KEY`. Foreign Keys sind aktiviert und
Suchspalten indiziert.

## Beziehungen

```text
projects
  └─ calculation_runs
       └─ calculation_variants
            ├─ calculation_route_sections
            │    ├─ calculation_delta_v
            │    └─ calculation_velocities
            ├─ calculation_trajectory_points
            └─ calculation_warnings
```

Beim Loeschen eines Projekts bleiben seine Berechnungslaufdaten erhalten und
`calculation_runs.project_id` wird auf `NULL` gesetzt. Beim Loeschen eines
Berechnungslaufs werden alle untergeordneten Ergebniszeilen kaskadiert
entfernt.

## Tabellen

### `calculation_runs`

Ein Datensatz pro Konstellationssuche. Er enthaelt Solver, Route, Status,
Suchzeitraum, Rasterweite, Graphgroesse, Shortlist- und Solverbudgets,
Ergebnisanzahl sowie die beste Variante.

### `calculation_variants`

Ein Datensatz pro dynamischem Solverlauf. Wichtige Spalten:

- `iteration_number`, `start_date`, `search_stage`, `status`
- `geometric_score`, `quality_score`, `result_rank`
- `geometry_valid`, `section_order_valid`, `state_continuous`
- `endpoints_reached`, `maximum_endpoint_residual_km`
- `performance_evaluated`
- `is_hypothetical_interstellar`
- `is_feasible`, `corridor_satisfied`, `collision_free`
- `required_delta_v_km_s`, `available_delta_v_km_s`
- `target_correction_delta_v_km_s`
- `corridor_insertion_deficit_km_s`, `delta_v_deficit_km_s`
- `target_alignment_deg`, `total_flight_days`

`is_feasible` ist waehrend der Geometriestufe `NULL`. Erst wenn
`performance_evaluated = 1` gesetzt ist, beschreibt es die physikalische
Flugfaehigkeit. Dadurch werden geometrischer Zieltreffer und verfuegbares
Delta-v nicht mehr als derselbe Status gespeichert.

### `calculation_route_sections`

Normalisierte Reihenfolge der Routenabschnitte mit Ursprung, Ziel,
Referenzsystem, Eintritt, Periapsis, Austritt, Passagewinkel und
Korridorstatus.

### `calculation_delta_v`

Delta-v ist eine Geschwindigkeitsaenderung und wird separat nach Typ
gespeichert:

- `delta_v_type`
- `required_delta_v_km_s`
- `available_delta_v_km_s`
- `applied_delta_v_km_s`
- `delta_v_deficit_km_s`
- `is_applied`

Verwendete Typen sind unter anderem `injection`, `target_correction`,
`transition` und `corridor_insertion`.

### `calculation_velocities`

Tatsaechliche Geschwindigkeitszustaende beziehungsweise skalare
Geschwindigkeiten:

- `velocity_event`, `reference_frame`
- `velocity_x_km_s`, `velocity_y_km_s`, `velocity_z_km_s`
- `speed_km_s`, `elapsed_days`

Damit wird eine Geschwindigkeit nicht als Delta-v ausgegeben.

### `calculation_trajectory_points`

Jeder nominale, hochgenaue oder planetenrelative Trajektorienpunkt wird mit
Punktindex, Zeit, Position X/Y/Z und optionalem Geschwindigkeitsvektor
gespeichert. `trajectory_kind` unterscheidet `nominal`,
`high_fidelity_n_body` und `flyby_relative`.

### `calculation_warnings`

Geordnete Warnungen mit Code, Schweregrad, Nachricht und Quellenreferenz.

### `calculation_schema_migrations`

Versioniert die automatisch und transaktional angewendeten
Datenbankmigrationen.

## API

```text
GET    /api/calculations/runs
POST   /api/calculations/runs
GET    /api/calculations/runs/<run-id>
PATCH  /api/calculations/runs/<run-id>
DELETE /api/calculations/runs/<run-id>
GET    /api/calculations/variants/<variant-id>
PATCH  /api/calculations/runs/<run-id>/variants/<variant-id>
```

Die API erzeugt Lauf- und Varianten-UUIDs serverseitig. Das Analyse-Popup
verwendet die Lauf-API zum Wiederherstellen und Vergleichen historischer
Berechnungen.
