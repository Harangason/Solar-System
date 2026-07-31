"""Compatibility alias for :mod:`solver.trajectory`."""

import sys
from solver import trajectory as _implementation

sys.modules[__name__] = _implementation
