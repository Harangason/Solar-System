"""Compatibility alias for :mod:`services.activity_log`."""

import sys
from services import activity_log as _implementation

sys.modules[__name__] = _implementation
