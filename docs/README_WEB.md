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
| `src/routeSections.ts` | Definition und Normalisierung von Routenabschnitten |
| `public/` | Mondkatalog und statische Assets |
| `dist/` | vom Flask-Server ausgelieferter Produktionsbuild |

## Befehle

```powershell
cd web
npm run dev
npm run build
npm run test:constellation-graph
npm run test:route-sketch
```

Der Produktionsbuild fuehrt zuerst `tsc -b` und danach Vite aus. Physikalische
Solverergebnisse kommen per HTTP/JSON aus `main.py`; Frontendmathematik dient
der Darstellung und Konsistenzpruefung.
