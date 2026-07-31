"""Compatibility alias for :mod:`services.calculation_audit`."""

import sys
from services import calculation_audit as _implementation

sys.modules[__name__] = _implementation
