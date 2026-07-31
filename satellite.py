"""Compatibility alias for :mod:`models.satellite`."""

import sys
from models import satellite as _implementation

sys.modules[__name__] = _implementation
