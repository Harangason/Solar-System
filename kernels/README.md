# SPICE-Kernels

Dieses Verzeichnis ist für lokale NAIF-SPICE-Kernels vorgesehen. Die großen
Binärdateien werden nicht in Git gespeichert.

Die Standard-Kernels und der lokale Meta-Kernel werden mit folgendem Befehl
erzeugt:

```powershell
python scripts/download_spice_kernels.py
```

Standardmäßig werden `naif0012.tls` für die UTC/ET-Zeitumrechnung und die
kompakte planetare Ephemeride `de440s.bsp` von NAIF geladen.
