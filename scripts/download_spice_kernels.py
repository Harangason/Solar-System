"""Download the compact generic NAIF kernels used by the simulator."""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import sys
from urllib.request import urlopen


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_KERNEL_DIR = PROJECT_ROOT / "kernels"
KERNELS = (
    (
        "naif0012.tls",
        "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls",
        None,
    ),
    (
        "de440s.bsp",
        "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp",
        "3917ee56769db332790c751e2168843d",
    ),
)


def _md5(path: Path) -> str:
    digest = hashlib.md5()  # noqa: S324 - NAIF publishes MD5 for corruption checks.
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _download(url: str, destination: Path) -> None:
    temporary = destination.with_suffix(destination.suffix + ".part")
    try:
        with urlopen(url) as response, temporary.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def _write_meta_kernel(kernel_dir: Path) -> Path:
    kernel_path = kernel_dir.resolve().as_posix().replace("'", "''")
    meta_kernel = kernel_dir / "solar_system.tm"
    meta_kernel.write_text(
        "KPL/MK\n\n"
        "\\begindata\n\n"
        f"PATH_VALUES = ( '{kernel_path}' )\n"
        "PATH_SYMBOLS = ( 'KERNELS' )\n\n"
        "KERNELS_TO_LOAD = (\n"
        "    '$KERNELS/naif0012.tls'\n"
        "    '$KERNELS/de440s.bsp'\n"
        ")\n\n"
        "\\begintext\n\n"
        "Generic kernels for the Solar-System simulator.\n",
        encoding="utf-8",
    )
    return meta_kernel


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Offizielle generische NAIF-SPICE-Kernels herunterladen."
    )
    parser.add_argument(
        "--kernel-dir",
        type=Path,
        default=DEFAULT_KERNEL_DIR,
        help="Zielverzeichnis (Standard: %(default)s)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Vorhandene Kernel erneut herunterladen.",
    )
    arguments = parser.parse_args()
    kernel_dir = arguments.kernel_dir.resolve()
    kernel_dir.mkdir(parents=True, exist_ok=True)

    for filename, url, expected_md5 in KERNELS:
        destination = kernel_dir / filename
        if destination.exists() and not arguments.force:
            if expected_md5 and _md5(destination) != expected_md5:
                print(
                    f"Prüfsumme von {destination} stimmt nicht; mit --force neu laden.",
                    file=sys.stderr,
                )
                return 1
            print(f"Vorhanden: {destination}")
            continue

        print(f"Lade {url}")
        _download(url, destination)
        if expected_md5 and _md5(destination) != expected_md5:
            destination.unlink(missing_ok=True)
            print(f"Prüfsumme für {filename} stimmt nicht.", file=sys.stderr)
            return 1
        print(f"Gespeichert: {destination}")

    meta_kernel = _write_meta_kernel(kernel_dir)
    print(f"Meta-Kernel geschrieben: {meta_kernel}")
    print("SPICE wird beim nächsten Start des Python-Servers automatisch aktiviert.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
