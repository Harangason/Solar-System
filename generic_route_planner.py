"""Compatibility alias for :mod:`planner.generic_route_planner`."""

import sys
from planner import generic_route_planner as _implementation

sys.modules[__name__] = _implementation
