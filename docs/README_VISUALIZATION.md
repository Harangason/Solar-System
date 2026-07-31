# Visualization

Zurueck zum [Dokumentationsindex](README.md).

Die Darstellung besteht aus einem kleinen Python-Paket und dem Web-Frontend:

- `visualization/view_3d_celestials.py` liefert Himmelskoerper- und
  Orbitparameter fuer API und Solver.
- `visualization/view_2d_celestials.py` erzeugt eine serverseitige
  Matplotlib-Ansicht.
- `web/src/` implementiert die interaktive React-/Three.js-Oberflaeche.

Visuelle Skalierungen veraendern keine physikalischen Daten. Die Three.js-Szene
bildet das physikalische Koordinatensystem nur fuer die Anzeige ab.
Planeten-Texturen sind reine Darstellungsassets; ihre Herkunft steht in
[SOURCES.md](../web/public/assets/planets/SOURCES.md).

## Zielkoerperbezogene Ansichten

Ein lokaler Zielkorridor besitzt drei konsistente Projektionen:

- Draufsicht in der globalen `x-y`-Ebene,
- Seitenansicht in der globalen `x-z`-Ebene,
- Querebene aus Sicht der Sonne in Richtung des lokalen Zielkoerpers.

Die Querebene verwendet eine orthonormale Basis aus der Blickachse
`Sonne -> Ziel`, einer Querachse und einer Hochachse. Sie zeigt dadurch den aus
allen drei Vektorkomponenten resultierenden Eintrittspunkt. Ihr Tiefenwert
kennzeichnet die sonnenzugewandte oder sonnenabgewandte Koerperseite. Dieselbe
Geometrie ist in der 3D-Ansicht mit der Kamera `Von Sonne zum Ziel`
kontrollierbar.

Interstellare Katalogziele besitzen keine lokale Ephemeride und deshalb weder
einen lokalen Zielkoerper noch eine solche Korridorebene. Sie bleiben
hypothetische Richtungsstrahlen mit 50 AE Darstellungslaenge.

Frontenddetails und Konsistenzpruefungen sind in
[README_WEB.md](README_WEB.md) beschrieben.
