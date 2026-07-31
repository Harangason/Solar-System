"""Compatibility alias for :mod:`services.project_store`."""

import sys
from services import project_store as _implementation

sys.modules[__name__] = _implementation
