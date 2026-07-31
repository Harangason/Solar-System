"""Compatibility alias for :mod:`visualization.view_3d_celestials`."""

import sys
from visualization import view_3d_celestials as _implementation

sys.modules[__name__] = _implementation
