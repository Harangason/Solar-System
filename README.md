# Inheritance & Polymorphism (Deutsch)

Raumfahrt-Simulations- und -Optimierungsprojekt mit Flask-Web-Interface zur Demonstration
von objektorientierten Programmierkonzepten.

## Hinweis zur Entwicklung

**Deutsch:** Dieses Projekt befindet sich in aktiver Entwicklung; die Kernfunktionalität für die
Simulation von Missionen ist nutzbar, während Fehlerbehandlung, Stabilität und UX weiter verfeinert werden.

**English:** The project is under active development; the mission simulation core is already usable,
while error handling, stability, and UX are actively being improved.

## Wer sollte das Projekt nutzen?

Dieses Projekt richtet sich an Lernende und Entwickler, die OOP-Konzepte anhand eines praxisnahen Beispiels
für Raumfahrt-Missionsimulation und -Optimierung praktisch anwenden wollen.

## Zielsetzung

Ziel des Projekts ist die didaktische Demonstration von Vererbung, Polymorphismus und
Abstraktion in einer webbasierten **Simulation von Missionen** von der Datenerfassung bis zur Visualisierung.

## Überblick

Die App bildet eine lokale Umgebung zur Simulation von Missionen mit Bahn- und Routenberechnung sowie 2D/3D-Visualisierung auf.

## Voraussetzungen

- Python 3.8+
- pip
- Virtuelle Umgebung (empfohlen)

## Installation

```bash
# Linux/macOS
python -m venv .venv
source .venv/bin/activate

# Windows (PowerShell)
python -m venv .venv
.\\.venv\\Scripts\\Activate.ps1
```

```bash
pip install -r requirements.txt
```

## Start

```bash
python main.py
```

Öffne danach `http://localhost:30000` im Browser.

## Screenshots / Visuals

Lege bei Bedarf Bilder in `screenshots/` ab und binde sie mit `![Alt-Text](screenshots/datei.png)` ein.

## Projektstruktur

```text
.
├── main.py                # Flask-Web-Server, Routen und Startlogik
├── universe.py            # Simulationslogik der Himmelskörper
├── satellite.py           # Satelliten-Klassen
├── trajectory.py          # Trajektorien- und Bahnberechnungen
├── route_planner.py       # Missions-Routenplanung
├── mission_optimizer.py   # Optimierung von Missionsparametern
├── calculation_audit.py   # Audit-Logging für Berechnungen
├── propulsion.py          # Antriebsmodelle
├── view_2d_celestials.py  # 2D-Visualisierung
├── view_3d_celestials.py  # 3D-Visualisierung
├── web/                   # Frontend-Dateien
├── scripts/               # Hilfsskripte
├── requirements.txt       # Python-Abhängigkeiten
└── README.md              # Projektdokumentation
```

## Features

- Simulation von Missionen in 2D/3D
- Routenplanung und Missionsfenster-Optimierung
- Bahn- und Trajektorienberechnung
- Interaktive Flask-Web-UI
- Berechnungsaudit für Nachvollziehbarkeit

## OOP-Konzepte

- Vererbung: Basisklassen für Himmelskörper, spezialisierte Unterklassen für spezifische Verhaltensweisen.
- Polymorphismus: Methodenverhalten passt sich zur Laufzeit an den konkreten Objekttyp an.
- Abstraktion: Komplexe Berechnungen sind über klare Methoden-Schnittstellen zugänglich.

## Projekt-Roadmap

- [ ] Stabilere Berechnungen bei Randfällen in der Missionssimulation.
- [ ] Einheitliche Eingabevalidierung für Missions- und Simulationsdaten.
- [ ] Bessere, konsistente Fehleranzeigen in der Web-Oberfläche.
- [ ] Unit-Tests für `trajectory`, `route_planner`, `mission_optimizer`.
- [ ] Theme-Umschaltung und bessere Navigationsstruktur.
- [ ] Exportfunktionen für Missionsberichte (CSV/JSON).

## Troubleshooting

- **Port bereits belegt:** Alten Prozess stoppen oder Port in `main.py` wechseln.
- **`ModuleNotFoundError`:** Virtuelle Umgebung prüfen und `pip install -r requirements.txt` erneut ausführen.
- **Unerwartete Simulationswerte:** Eingaben auf Sinnwerte prüfen und mit kleineren Testfällen starten.

## Konfiguration

- Standard-Port: `30000`.
- Zentrale Parameter im jeweiligen Modul (insbesondere in `main.py`).
- Unterstützte Kernabhängigkeiten: `Flask`, `SciPy`, `Matplotlib`.

## Mitwirken (Contributing)

Kurze, klare Änderungen sind willkommen; bitte Funktionsänderungen mit kurzer Testanweisung dokumentieren.

## MIT-Style Nutzungshinweis

Die Nutzung ist frei möglich; bei Weitergabe bitte auf das Projekt als Ursprung verweisen.
