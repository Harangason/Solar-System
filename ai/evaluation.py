"""Offline ML evaluation for solver candidate prioritization.

The model in this module is intentionally small and transparent. It learns a
ranking score from historical solver log rows and is only suitable for
prioritizing future candidate order; it never certifies physical validity.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ACTIVITY_LOG = PROJECT_ROOT / "logs" / "activities.jsonl"
DEFAULT_MODEL_PATH = PROJECT_ROOT / "data" / "ml_candidate_ranker.json"
FEATURE_NAMES = [
    "geometricScore",
    "targetAlignmentDeg",
    "deltaVDeficitKmS",
    "requiredInjectionDeltaVKmS",
    "availableInjectionDeltaVKmS",
    "targetCorrectionDeltaVKmS",
    "corridorInsertionDeficitKmS",
    "corridorSatisfied",
    "collisionFree",
    "fullCorridorCheck",
]


@dataclass(frozen=True)
class CandidateExample:
    source_id: str
    search_run_id: str
    action: str
    status: str
    features: dict[str, float]
    success: bool
    target_score: float


def _finite_number(value: object, default: float = 0.0) -> float:
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    return default


def _jsonl_records(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(record, dict):
            records.append(record)
    return records


def _features_from_values(values: dict[str, Any]) -> dict[str, float]:
    return {
        name: _finite_number(values.get(name))
        for name in FEATURE_NAMES
    }


def normalize_candidate_dataset(paths: list[Path] | None = None) -> list[CandidateExample]:
    """Read JSONL activity logs and return normalized candidate examples."""
    paths = paths or [DEFAULT_ACTIVITY_LOG]
    examples: list[CandidateExample] = []
    for path in paths:
        for record in _jsonl_records(path):
            if record.get("category") != "calculation":
                continue
            action = str(record.get("action") or "")
            if action not in {"constellation-candidate", "constellation-search-completed"}:
                continue
            values = record.get("values") if isinstance(record.get("values"), dict) else {}
            details = record.get("details") if isinstance(record.get("details"), dict) else {}
            features = _features_from_values(values)
            success = (
                record.get("status") == "success"
                or values.get("feasible") is True
                or values.get("flightReady") is True
            )
            target_score = _finite_number(values.get("quality"))
            if target_score == 0.0:
                target_score = (
                    (1_000.0 if success else 0.0)
                    + (250.0 if values.get("corridorSatisfied") is True else 0.0)
                    + (200.0 if values.get("collisionFree") is True else -500.0)
                    - _finite_number(values.get("deltaVDeficitKmS")) * 50.0
                    - _finite_number(values.get("targetAlignmentDeg")) * 8.0
                )
            examples.append(CandidateExample(
                source_id=str(record.get("id") or f"{path.name}:{len(examples)}"),
                search_run_id=str(details.get("searchRunId") or values.get("searchRunId") or ""),
                action=action,
                status=str(record.get("status") or ""),
                features=features,
                success=success,
                target_score=target_score,
            ))
    return examples


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def train_candidate_ranker(examples: list[CandidateExample]) -> dict[str, Any]:
    if not examples:
        return {
            "schemaVersion": "1.0",
            "modelType": "centroid-linear-ranker",
            "featureNames": FEATURE_NAMES,
            "weights": {name: 0.0 for name in FEATURE_NAMES},
            "intercept": 0.0,
            "trainingRows": 0,
            "positiveRows": 0,
            "useOnlyForPrioritization": True,
        }
    positives = [example for example in examples if example.success]
    negatives = [example for example in examples if not example.success]
    if not positives or not negatives:
        return {
            "schemaVersion": "1.0",
            "modelType": "centroid-linear-ranker",
            "featureNames": FEATURE_NAMES,
            "weights": {name: 0.0 for name in FEATURE_NAMES},
            "intercept": 0.0,
            "trainingRows": len(examples),
            "positiveRows": len(positives),
            "useOnlyForPrioritization": True,
        }
    weights: dict[str, float] = {}
    for name in FEATURE_NAMES:
        all_values = [example.features.get(name, 0.0) for example in examples]
        variance = _mean([(value - _mean(all_values)) ** 2 for value in all_values])
        scale = math.sqrt(variance) or 1.0
        pos_mean = _mean([example.features.get(name, 0.0) for example in positives])
        neg_mean = _mean([example.features.get(name, 0.0) for example in negatives])
        weights[name] = (pos_mean - neg_mean) / scale
    midpoint = _mean([
        sum(example.features.get(name, 0.0) * weights[name] for name in FEATURE_NAMES)
        for example in examples
    ])
    return {
        "schemaVersion": "1.0",
        "modelType": "centroid-linear-ranker",
        "featureNames": FEATURE_NAMES,
        "weights": weights,
        "intercept": -midpoint,
        "trainingRows": len(examples),
        "positiveRows": len(positives),
        "useOnlyForPrioritization": True,
    }


def score_candidate(model: dict[str, Any], features: dict[str, float]) -> float:
    weights = model.get("weights") if isinstance(model.get("weights"), dict) else {}
    score = _finite_number(model.get("intercept"))
    for name in model.get("featureNames") or FEATURE_NAMES:
        score += _finite_number(features.get(str(name))) * _finite_number(weights.get(str(name)))
    return score


def _grouped(examples: list[CandidateExample]) -> dict[str, list[CandidateExample]]:
    groups: dict[str, list[CandidateExample]] = {}
    for index, example in enumerate(examples):
        key = example.search_run_id or f"ungrouped-{index}"
        groups.setdefault(key, []).append(example)
    return groups


def evaluate_candidate_ranker(examples: list[CandidateExample], model: dict[str, Any]) -> dict[str, Any]:
    groups = [items for items in _grouped(examples).values() if items]
    if not groups:
        return {
            "schemaVersion": "1.0",
            "evaluationRows": 0,
            "groups": 0,
            "top1SuccessRateModel": 0.0,
            "top1SuccessRateBaseline": 0.0,
            "pairwiseAccuracy": 0.0,
            "useOnlyForPrioritization": True,
        }
    model_top_success = 0
    baseline_top_success = 0
    pairwise_total = 0
    pairwise_correct = 0
    for group in groups:
        model_top = max(group, key=lambda item: score_candidate(model, item.features))
        baseline_top = max(group, key=lambda item: item.features.get("geometricScore", 0.0))
        model_top_success += int(model_top.success)
        baseline_top_success += int(baseline_top.success)
        for left_index, left in enumerate(group):
            for right in group[left_index + 1:]:
                if left.success == right.success:
                    continue
                pairwise_total += 1
                left_score = score_candidate(model, left.features)
                right_score = score_candidate(model, right.features)
                better_left = left.success and not right.success
                if (left_score >= right_score) == better_left:
                    pairwise_correct += 1
    return {
        "schemaVersion": "1.0",
        "evaluationRows": len(examples),
        "groups": len(groups),
        "top1SuccessRateModel": model_top_success / len(groups),
        "top1SuccessRateBaseline": baseline_top_success / len(groups),
        "pairwiseAccuracy": pairwise_correct / pairwise_total if pairwise_total else 0.0,
        "useOnlyForPrioritization": True,
    }


def train_and_evaluate(paths: list[Path] | None = None) -> dict[str, Any]:
    examples = normalize_candidate_dataset(paths)
    model = train_candidate_ranker(examples)
    evaluation = evaluate_candidate_ranker(examples, model)
    positive_rows = sum(1 for example in examples if example.success)
    negative_rows = len(examples) - positive_rows
    verdict = (
        "ready"
        if len(examples) >= 8 and evaluation["groups"] >= 2 and positive_rows > 0 and negative_rows > 0
        else "needs-more-data"
    )
    return {
        "schemaVersion": "1.0",
        "dataset": {
            "rows": len(examples),
            "positiveRows": positive_rows,
            "negativeRows": negative_rows,
            "featureNames": FEATURE_NAMES,
        },
        "model": model,
        "evaluation": evaluation,
        "verdict": verdict,
    }


def save_model(model: dict[str, Any], path: Path = DEFAULT_MODEL_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(model, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Train and evaluate the offline candidate ranker.")
    parser.add_argument("--log", action="append", default=[], help="JSONL activity log path.")
    parser.add_argument("--save-model", default="", help="Optional output model JSON path.")
    args = parser.parse_args(argv)
    paths = [Path(item) for item in args.log] if args.log else [DEFAULT_ACTIVITY_LOG]
    report = train_and_evaluate(paths)
    if args.save_model:
        save_model(report["model"], Path(args.save_model))
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
