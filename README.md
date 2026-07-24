# Inheritance & Polymorphism (Deutsch)

Raumfahrt-Simulations- und -Optimierungsprojekt mit Flask-Web-Interface zur Demonstration von Objektorientierten Konzepten.

## Beschreibung

Ein umfassendes Projekt zur Demonstration von OOP-Konzepten:
- **Vererbung**: Klassen-Hierarchien für Himmelskörper und Raumschiffe
- **Polymorphismus**: Verschiedene Implementierungen von Simulationsmethoden
- **Abstraktion**: Komplexe Raumfahrt-Berechnungen hinter eleganten APIs

Das Projekt simuliert Raumfahrt-Missionen, optimiert Startfenster und zeigt 2D/3D-Visualisierungen.

## Projektstruktur

```
.
├── main.py                    # Flask-Web-Server
├── satellite.py               # Satelliten-Klassen
├── trajectory.py              # Bahnberechnung
├── route_planner.py           # Wegplanung
├── mission_optimizer.py       # Missions-Optimierung
├── calculation_audit.py       # Audit-Logging
├── propulsion.py              # Antriebssysteme
├── universe.py                # Universum-Simulation
├── view_2d_celestials.py      # 2D-Visualisierung
├── view_3d_celestials.py      # 3D-Visualisierung
├── web/                       # Frontend
├── scripts/                   # Hilfsskripte
└── requirements.txt           # Dependencies
```

## Technologien

- **Flask**: Web-Framework
- **Python 3.8+**: Hauptsprache
- **OOP**: Klassen, Vererbung, Polymorphismus
- **Matplotlib/Plotly**: Visualisierung

## Features

- 🚀 Missionsplanung und -optimierung
- 🌍 Bahnberechnung und Trajektorie-Simulation
- 📍 Wegplanung mit Navigationspunkten
- 📊 2D und 3D Visualisierungen
- 📝 Audit-Logging für alle Berechnungen
- 🎮 Interaktive Web-UI

## Installation

```bash
# Virtual Environment aktivieren
source .venv/bin/activate  # Linux/Mac
# oder
.venv\Scripts\activate  # Windows

# Dependencies installieren
pip install -r requirements.txt
```

## Verwendung

```bash
python main.py
```

Öffne dann `http://localhost:30000` im Browser.

## OOP-Konzepte

### Vererbung
Basis-Klasse für Himmelskörper mit spezialisierten Unterklassen (Planeten, Satelliten, etc.)

### Polymorphismus
Verschiedene Simulationsmethoden je nach Objekttyp, überschriebene Methoden für spezifische Verhalten

### Abstraktion
Komplexe Physik-Berechnungen versteckt hinter einfachen Methoden

---

**Term 4 | Masterschool - Object-Oriented Programming**
# Solar-System
