# Web

Zurueck zum [Dokumentationsindex](README.md).

`web/` ist ein Vite-Projekt mit React, TypeScript, Three.js,
`@react-three/fiber` und `@react-three/drei`.

## Wichtige Bereiche

| Pfad | Aufgabe |
| --- | --- |
| `src/App.tsx` | Oberflaechenkomposition und zentraler Zustand |
| `src/components/` | 2D-/3D-Ansichten, Wizards, Editoren und Dialoge |
| `src/components/RouteCalculationDialog.tsx` | Live-Analyse von Solvervarianten, Suchtrichter und Routenprojektion |
| `src/missionSimulation.ts` | Backendaufrufe und Missionsdaten |
| `src/orbitalMath.ts` | Darstellungsbezogene Orbitalmathematik |
| `src/targetAlignedProjection.ts` | Basiswechsel und Rueckprojektion fuer die Sonne-Ziel-Querebene |
| `src/components/SunwardCorridorView.tsx` | Interaktive Frontansicht eines lokalen Zielkorridors |
| `src/routeSections.ts` | Definition und Normalisierung von Routenabschnitten |
| `src/routeGeometryValidation.ts` | Zieltreffer-, Reihenfolge-, Zeit- und Kontinuitaetspruefung vor der Leistungsbewertung |
| `src/constellationGraph.ts` | Adaptives Suchfenster, Suchbudgets und zeitlich diverse Kandidatenauswahl |
| `public/` | Mondkatalog und statische Assets |
| `dist/` | vom Flask-Server ausgelieferter Produktionsbuild |

## Befehle

```powershell
cd web
npm run dev
npm run build
npm run test:constellation-graph
npm run test:route-geometry
npm run test:route-sketch
npm run test:target-projection
```

Der Produktionsbuild fuehrt zuerst `tsc -b` und danach Vite aus. Physikalische
Solverergebnisse kommen per HTTP/JSON aus `main.py`; Frontendmathematik dient
der Darstellung und Konsistenzpruefung.

Das Analyse-Popup unterscheidet `geometry-valid` und `performance-valid`.
Verworfene Diagnosebahnen werden gekennzeichnet und koennen weder automatisch
noch ueber die Variantenauswahl als geplante Loesung uebernommen werden.

Der Zielkorridor bietet Seite, Draufsicht und `Von der Sonne` als Ansichten
desselben raeumlichen Vektors. Der Schalter `3D - raeumliche Kontrolle`
wechselt mit unveraendertem Routen- und Korridorzustand in die Three.js-Szene.
