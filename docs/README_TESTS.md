# Tests

Zurueck zum [Dokumentationsindex](README.md).

Die Python-Suite liegt in `tests/` und verwendet `unittest`.

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Der aktuelle Umfang umfasst 71 Tests fuer:

- Planner und Eintrittskorridore,
- Trajektorien, N-Body-Propagation und SPICE/Kepler-Ephemeriden,
- Projekte, Aktivitaeten und Playback-Audits,
- AI-Schemas, Aktionen, Plausibilitaet, Kandidatenranking und Audio.

Frontend-Konsistenztests:

```powershell
cd web
npm run test:constellation-graph
npm run test:route-sketch
npm run build
```

Neue Fehlerbehebungen sollen einen Regressionstest erhalten. Tests duerfen
lokale Datenpfade mit temporaeren Verzeichnissen oder Mocks isolieren und
sollen keine produktiven Laufzeitdaten veraendern.
