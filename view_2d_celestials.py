"""Compatibility alias for :mod:`visualization.view_2d_celestials`."""

import sys
from visualization import view_2d_celestials as _implementation

sys.modules[__name__] = _implementation
