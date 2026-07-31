"""Compatibility alias for :mod:`planner.multi_route_planner`."""

import sys
from planner import multi_route_planner as _implementation

sys.modules[__name__] = _implementation
