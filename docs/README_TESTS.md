# Tests

Zurueck zum [Dokumentationsindex](README.md).

Die Python-Suite liegt in `tests/` und verwendet `unittest`.

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Der aktuelle Umfang umfasst 79 Tests fuer:

- Planner und Eintrittskorridore,
- Trajektorien, N-Body-Propagation und SPICE/Kepler-Ephemeriden,
- Projekte, Aktivitaeten und Playback-Audits,
- UUID-Migration, normalisierte Solvervarianten und Persistenz-API,
- AI-Schemas, Aktionen, Plausibilitaet, Kandidatenranking und Audio.

Frontend-Konsistenztests:

```powershell
cd web
npm run test:constellation-graph
npm run test:route-geometry
npm run test:route-sketch
npm run test:target-projection
npm run build
```

`test:target-projection` prueft die Orthogonalitaet der zielorientierten Basis,
die Erhaltung der Einheitslaenge und die verlustfreie Rueckprojektion eines
geneigten `(x,y,z)`-Eintrittsvektors.

Neue Fehlerbehebungen sollen einen Regressionstest erhalten. Tests duerfen
lokale Datenpfade mit temporaeren Verzeichnissen oder Mocks isolieren und
sollen keine produktiven Laufzeitdaten veraendern.
