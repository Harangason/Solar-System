# SPICE-Kernels

Siehe auch die [Solver-Dokumentation](../docs/README_SOLVER.md) und den
[Dokumentationsindex](../docs/README.md).

Dieses Verzeichnis ist für lokale NAIF-SPICE-Kernels vorgesehen. Die großen
Binärdateien werden nicht in Git gespeichert.

Die Standard-Kernels und der lokale Meta-Kernel werden mit folgendem Befehl
erzeugt:

```powershell
python scripts/download_spice_kernels.py
```

Standardmäßig werden `naif0012.tls` für die UTC/ET-Zeitumrechnung und die
kompakte planetare Ephemeride `de440s.bsp` von NAIF geladen.

Die Laufzeitkonfiguration und der Kepler-Fallback befinden sich in
`solver/ephemeris.py`. Kerneldateien bleiben lokal und werden durch
`kernels/.gitignore` von Git ausgeschlossen.
