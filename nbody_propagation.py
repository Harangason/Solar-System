"""Compatibility alias for :mod:`solver.nbody_propagation`."""

import sys
from solver import nbody_propagation as _implementation

sys.modules[__name__] = _implementation
