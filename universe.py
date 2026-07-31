"""Compatibility alias for :mod:`models.universe`."""

import sys
from models import universe as _implementation

sys.modules[__name__] = _implementation
