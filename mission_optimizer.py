"""Compatibility alias for :mod:`planner.mission_optimizer`."""

import sys
from planner import mission_optimizer as _implementation

sys.modules[__name__] = _implementation
