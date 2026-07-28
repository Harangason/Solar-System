from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import unittest

from ephemeris import DEFAULT_META_KERNEL, SpiceEphemeris


class SpiceEphemerisTests(unittest.TestCase):
    def test_kepler_mode_never_requires_kernels(self) -> None:
        backend = SpiceEphemeris(
            mode="kepler", meta_kernel=Path("does-not-exist.tm")
        )

        status = backend.status()

        self.assertFalse(status["active"])
        self.assertEqual(status["backend"], "kepler")
        self.assertIsNone(backend.utc_to_et(datetime.now(timezone.utc)))
        self.assertIsNone(backend.state("earth", 0.0))

    def test_strict_spice_mode_rejects_missing_meta_kernel(self) -> None:
        backend = SpiceEphemeris(
            mode="spice", meta_kernel=Path("does-not-exist.tm")
        )

        with self.assertRaisesRegex(RuntimeError, "Meta-Kernel"):
            backend.ensure_loaded()

    @unittest.skipUnless(
        DEFAULT_META_KERNEL.is_file(),
        "Lokale SPICE-Kernels wurden nicht heruntergeladen.",
    )
    def test_default_kernels_return_earth_state(self) -> None:
        backend = SpiceEphemeris(mode="spice", meta_kernel=DEFAULT_META_KERNEL)
        et = backend.utc_to_et(datetime(2026, 7, 27, tzinfo=timezone.utc))

        self.assertIsNotNone(et)
        result = backend.state("earth", et)

        self.assertIsNotNone(result)
        state, target = result
        self.assertEqual(len(state), 6)
        self.assertIn(target, {"EARTH", "EARTH BARYCENTER"})
        self.assertGreater(sum(value * value for value in state[:3]), 1.0e16)
        self.assertGreater(sum(value * value for value in state[3:]), 100.0)


if __name__ == "__main__":
    unittest.main()
