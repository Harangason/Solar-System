"""Compatibility alias for :mod:`planner.route_planner`."""

import sys
from planner import route_planner as _implementation

sys.modules[__name__] = _implementation
