"""Persistent, machine-readable audit trail for trajectory calculations."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from uuid import uuid4

from ephemeris import get_ephemeris_status


PROJECT_ROOT = Path(__file__).resolve().parent
AUDIT_DIRECTORY = PROJECT_ROOT / "logs"
ROUTE_AUDIT_LOG = AUDIT_DIRECTORY / "route_calculations.jsonl"
OPTIMIZER_AUDIT_LOG = AUDIT_DIRECTORY / "mission_optimizer.jsonl"
METHOD_DOCUMENTATION = PROJECT_ROOT / "CALCULATION_METHODS.md"
_WRITE_LOCK = Lock()


def write_route_audit(calculation: dict) -> dict:
    """Append one complete calculation record and return its public metadata."""
    run_id = f"route-{datetime.now(timezone.utc):%Y%m%dT%H%M%S.%fZ}-{uuid4().hex[:8]}"
    record = {
        "schemaVersion": "1.0",
        "runId": run_id,
        "createdAtUtc": datetime.now(timezone.utc).isoformat(),
        "calculationType": "segmented-waypoint-route",
        "ephemeris": get_ephemeris_status(),
        **calculation,
    }
    serialized = json.dumps(record, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    with _WRITE_LOCK:
        AUDIT_DIRECTORY.mkdir(parents=True, exist_ok=True)
        with ROUTE_AUDIT_LOG.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(serialized + "\n")
    return {
        "runId": run_id,
        "createdAtUtc": record["createdAtUtc"],
        "logFile": str(ROUTE_AUDIT_LOG.relative_to(PROJECT_ROOT)),
        "documentation": str(METHOD_DOCUMENTATION.relative_to(PROJECT_ROOT)),
    }


def write_optimizer_audit(calculation: dict) -> dict:
    """Append one navigator search including candidates and rejection reasons."""
    run_id = f"optimizer-{datetime.now(timezone.utc):%Y%m%dT%H%M%S.%fZ}-{uuid4().hex[:8]}"
    record = {
        "schemaVersion": "1.0",
        "runId": run_id,
        "createdAtUtc": datetime.now(timezone.utc).isoformat(),
        "calculationType": "iterative-mission-navigation",
        "ephemeris": get_ephemeris_status(),
        **calculation,
    }
    serialized = json.dumps(record, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    with _WRITE_LOCK:
        AUDIT_DIRECTORY.mkdir(parents=True, exist_ok=True)
        with OPTIMIZER_AUDIT_LOG.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(serialized + "\n")
    return {
        "runId": run_id,
        "createdAtUtc": record["createdAtUtc"],
        "logFile": str(OPTIMIZER_AUDIT_LOG.relative_to(PROJECT_ROOT)),
        "documentation": str(METHOD_DOCUMENTATION.relative_to(PROJECT_ROOT)),
    }


def read_latest_route_audit() -> dict | None:
    if not ROUTE_AUDIT_LOG.exists():
        return None
    with _WRITE_LOCK:
        lines = ROUTE_AUDIT_LOG.read_text(encoding="utf-8").splitlines()
    return json.loads(lines[-1]) if lines else None


def read_latest_optimizer_audit() -> dict | None:
    if not OPTIMIZER_AUDIT_LOG.exists():
        return None
    with _WRITE_LOCK:
        lines = OPTIMIZER_AUDIT_LOG.read_text(encoding="utf-8").splitlines()
    return json.loads(lines[-1]) if lines else None
