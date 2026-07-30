"""Versioned JSON Schema contracts between AI roles and the solver."""

from __future__ import annotations

from typing import Any


SCHEMA_VERSION = "1.0"
SCHEMA_BASE_URI = "https://solar-system.local/schemas/ai"

MISSION_STATE_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": f"{SCHEMA_BASE_URI}/mission-state-1.0.schema.json",
    "title": "MissionState",
    "type": "object",
    "additionalProperties": False,
    "required": ["schemaVersion", "startDate", "originId", "targetId", "constraints"],
    "properties": {
        "schemaVersion": {"const": SCHEMA_VERSION},
        "missionId": {"type": ["string", "null"]},
        "projectId": {"type": ["string", "null"]},
        "startDate": {"type": "string", "format": "date"},
        "originId": {"type": "string", "minLength": 1},
        "targetId": {"type": "string", "minLength": 1},
        "waypointIds": {"type": "array", "items": {"type": "string"}},
        "routeSections": {"type": "array", "items": {"type": "object"}},
        "constraints": {
            "type": "object",
            "additionalProperties": False,
            "required": ["maxDeltaVKmS", "maxDurationDays"],
            "properties": {
                "maxDeltaVKmS": {"type": ["number", "null"], "minimum": 0},
                "maxDurationDays": {"type": ["number", "null"], "minimum": 0},
                "minimumConfidencePct": {
                    "type": ["number", "null"],
                    "minimum": 0,
                    "maximum": 100,
                },
            },
        },
        "solverRunId": {"type": ["string", "null"]},
    },
}

SOLVER_RESULT_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": f"{SCHEMA_BASE_URI}/solver-result-1.0.schema.json",
    "title": "SolverResult",
    "type": "object",
    "additionalProperties": False,
    "required": [
        "schemaVersion",
        "runId",
        "solverType",
        "status",
        "result",
        "validation",
    ],
    "properties": {
        "schemaVersion": {"const": SCHEMA_VERSION},
        "runId": {"type": "string", "minLength": 1},
        "solverType": {
            "type": "string",
            "enum": ["mission", "segmented-route", "launch-window-optimizer"],
        },
        "status": {"type": "string", "enum": ["success", "best-effort", "failed"]},
        "missionStateRef": {"type": ["string", "null"]},
        "result": {"type": "object"},
        "validation": {
            "type": "object",
            "additionalProperties": False,
            "required": ["solverValid", "nBodyValid", "errors", "warnings"],
            "properties": {
                "solverValid": {"type": "boolean"},
                "nBodyValid": {"type": ["boolean", "null"]},
                "errors": {"type": "array", "items": {"type": "string"}},
                "warnings": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
}

AI_SUGGESTION_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": f"{SCHEMA_BASE_URI}/ai-suggestion-1.0.schema.json",
    "title": "AISuggestion",
    "type": "object",
    "additionalProperties": False,
    "required": [
        "schemaVersion",
        "suggestionId",
        "role",
        "modelName",
        "basedOnSolverRunIds",
        "proposal",
        "rationale",
        "requiresUserConfirmation",
    ],
    "properties": {
        "schemaVersion": {"const": SCHEMA_VERSION},
        "suggestionId": {"type": "string", "minLength": 1},
        "role": {
            "type": "string",
            "enum": ["calculation", "interaction", "plausibility"],
        },
        "modelName": {"type": "string", "minLength": 1},
        "basedOnSolverRunIds": {
            "type": "array",
            "items": {"type": "string", "minLength": 1},
        },
        "proposal": {
            "type": "object",
            "description": "Suggested search ranges or UI actions, never solver results.",
        },
        "rationale": {"type": "string"},
        "requiresUserConfirmation": {"type": "boolean"},
    },
}

PLAUSIBILITY_REPORT_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": f"{SCHEMA_BASE_URI}/plausibility-report-1.0.schema.json",
    "title": "PlausibilityReport",
    "type": "object",
    "additionalProperties": False,
    "required": [
        "schemaVersion",
        "reportId",
        "solverRunId",
        "status",
        "findings",
        "requiredFixes",
        "displaySafe",
    ],
    "properties": {
        "schemaVersion": {"const": SCHEMA_VERSION},
        "reportId": {"type": "string", "minLength": 1},
        "solverRunId": {"type": "string", "minLength": 1},
        "status": {"type": "string", "enum": ["pass", "warning", "fail"]},
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["code", "message", "severity"],
                "properties": {
                    "code": {"type": "string", "minLength": 1},
                    "message": {"type": "string"},
                    "severity": {"type": "string", "enum": ["info", "warning", "error"]},
                    "sourceRefs": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "requiredFixes": {"type": "array", "items": {"type": "string"}},
        "displaySafe": {"type": "boolean"},
    },
}

AI_SCHEMAS = {
    "mission-state": MISSION_STATE_SCHEMA,
    "solver-result": SOLVER_RESULT_SCHEMA,
    "ai-suggestion": AI_SUGGESTION_SCHEMA,
    "plausibility-report": PLAUSIBILITY_REPORT_SCHEMA,
}


def _matches_type(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "null":
        return value is None
    return True


def _validate(value: Any, schema: dict, path: str, errors: list[str]) -> None:
    expected_types = schema.get("type")
    if expected_types:
        allowed = [expected_types] if isinstance(expected_types, str) else expected_types
        if not any(_matches_type(value, expected) for expected in allowed):
            errors.append(f"{path}: expected {' or '.join(allowed)}")
            return
    if "const" in schema and value != schema["const"]:
        errors.append(f"{path}: expected constant {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: value is not in the allowed enum")
    if isinstance(value, str) and len(value) < schema.get("minLength", 0):
        errors.append(f"{path}: string is too short")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: value is below minimum")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: value is above maximum")
    if isinstance(value, dict):
        properties = schema.get("properties", {})
        for required in schema.get("required", []):
            if required not in value:
                errors.append(f"{path}.{required}: required property is missing")
        if schema.get("additionalProperties") is False:
            for key in value.keys() - properties.keys():
                errors.append(f"{path}.{key}: additional property is not allowed")
        for key, child in value.items():
            if key in properties:
                _validate(child, properties[key], f"{path}.{key}", errors)
    if isinstance(value, list) and "items" in schema:
        for index, child in enumerate(value):
            _validate(child, schema["items"], f"{path}[{index}]", errors)


def validate_ai_payload(schema_name: str, payload: dict) -> list[str]:
    """Validate the JSON Schema subset used by the phase-one contracts."""
    if schema_name not in AI_SCHEMAS:
        raise ValueError(f"Unknown AI schema: {schema_name}")
    errors: list[str] = []
    _validate(payload, AI_SCHEMAS[schema_name], "$", errors)
    return errors
