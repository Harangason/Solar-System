"""Compatibility alias for :mod:`solver.ephemeris`."""

import sys
from solver import ephemeris as _implementation

sys.modules[__name__] = _implementation
