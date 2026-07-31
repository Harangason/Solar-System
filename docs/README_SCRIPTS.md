# Scripts

Zurueck zum [Dokumentationsindex](README.md).

`scripts/` enthaelt explizit gestartete Wartungs- und Auswertungswerkzeuge.

| Skript | Aufgabe |
| --- | --- |
| `download_spice_kernels.py` | Generische NAIF-Kernels pruefen und herunterladen |
| `update_moons.py` | Mondkatalog fuer `web/public/moons.json` aktualisieren |
| `evaluate_ml_ranker.py` | AI-Kandidatenranker trainieren und evaluieren |

Beispiele:

```powershell
python scripts/download_spice_kernels.py
python scripts/update_moons.py
python scripts/evaluate_ml_ranker.py
```

Downloadskripte benoetigen Netzwerkzugriff. Generierte Kernel,
Laufzeitdaten und trainierte lokale Artefakte sollen nur dann versioniert
werden, wenn ihre Provenienz und Reproduzierbarkeit dokumentiert sind.
