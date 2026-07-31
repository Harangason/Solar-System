"""Compatibility alias for :mod:`models.propulsion`."""

import sys
from models import propulsion as _implementation

sys.modules[__name__] = _implementation
