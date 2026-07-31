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

Frontenddetails und Konsistenzpruefungen sind in
[README_WEB.md](README_WEB.md) beschrieben.
