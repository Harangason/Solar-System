import json
import tempfile
import unittest
from pathlib import Path

from ai.evaluation import (
    FEATURE_NAMES,
    evaluate_candidate_ranker,
    normalize_candidate_dataset,
    score_candidate,
    train_and_evaluate,
    train_candidate_ranker,
)


def write_jsonl(path: Path, records: list[dict]):
    path.write_text(
        "\n".join(json.dumps(record, ensure_ascii=False) for record in records) + "\n",
        encoding="utf-8",
    )


class MLPhaseFiveTests(unittest.TestCase):
    def test_normalizes_activity_log_candidates_into_features_and_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            log_path = Path(directory) / "activities.jsonl"
            write_jsonl(log_path, [{
                "id": "a1",
                "category": "calculation",
                "action": "constellation-candidate",
                "status": "success",
                "values": {
                    "geometricScore": 42,
                    "quality": 900,
                    "feasible": True,
                    "targetAlignmentDeg": 1.5,
                },
                "details": {"searchRunId": "search-1"},
            }])

            examples = normalize_candidate_dataset([log_path])

        self.assertEqual(len(examples), 1)
        self.assertEqual(set(examples[0].features), set(FEATURE_NAMES))
        self.assertTrue(examples[0].success)
        self.assertEqual(examples[0].target_score, 900)

    def test_trains_ranker_and_beats_bad_geometric_baseline(self):
        examples = []
        with tempfile.TemporaryDirectory() as directory:
            log_path = Path(directory) / "activities.jsonl"
            records = []
            for group in range(4):
                records.extend([
                    {
                        "id": f"bad-{group}",
                        "category": "calculation",
                        "action": "constellation-candidate",
                        "status": "rejected",
                        "values": {
                            "geometricScore": 100,
                            "quality": 10,
                            "feasible": False,
                            "collisionFree": False,
                            "corridorSatisfied": False,
                            "deltaVDeficitKmS": 7,
                            "targetAlignmentDeg": 30,
                        },
                        "details": {"searchRunId": f"search-{group}"},
                    },
                    {
                        "id": f"good-{group}",
                        "category": "calculation",
                        "action": "constellation-candidate",
                        "status": "success",
                        "values": {
                            "geometricScore": 10,
                            "quality": 1200,
                            "feasible": True,
                            "collisionFree": True,
                            "corridorSatisfied": True,
                            "deltaVDeficitKmS": 0,
                            "targetAlignmentDeg": 1,
                        },
                        "details": {"searchRunId": f"search-{group}"},
                    },
                ])
            write_jsonl(log_path, records)
            examples = normalize_candidate_dataset([log_path])

        model = train_candidate_ranker(examples)
        evaluation = evaluate_candidate_ranker(examples, model)

        self.assertTrue(model["useOnlyForPrioritization"])
        self.assertGreater(score_candidate(model, examples[1].features), score_candidate(model, examples[0].features))
        self.assertGreater(evaluation["top1SuccessRateModel"], evaluation["top1SuccessRateBaseline"])
        self.assertEqual(evaluation["pairwiseAccuracy"], 1.0)

    def test_train_and_evaluate_reports_more_data_needed_for_empty_logs(self):
        with tempfile.TemporaryDirectory() as directory:
            report = train_and_evaluate([Path(directory) / "missing.jsonl"])

        self.assertEqual(report["dataset"]["rows"], 0)
        self.assertEqual(report["verdict"], "needs-more-data")
        self.assertTrue(report["model"]["useOnlyForPrioritization"])

    def test_train_and_evaluate_requires_positive_and_negative_examples(self):
        with tempfile.TemporaryDirectory() as directory:
            log_path = Path(directory) / "activities.jsonl"
            write_jsonl(log_path, [{
                "id": "bad-only",
                "category": "calculation",
                "action": "constellation-candidate",
                "status": "rejected",
                "values": {"geometricScore": 100, "feasible": False},
                "details": {"searchRunId": "search-1"},
            } for _ in range(10)])

            report = train_and_evaluate([log_path])

        self.assertEqual(report["dataset"]["positiveRows"], 0)
        self.assertEqual(report["verdict"], "needs-more-data")


if __name__ == "__main__":
    unittest.main()
