from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import pandas as pd
from lightgbm import Booster

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
ML_DIR = REPO_ROOT / "ml"

import sys

if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from json_utils import dumps_json_safe, make_json_safe  # noqa: E402
from train_lightgbm import (  # noqa: E402
    compare_ranker_to_baselines,
    evaluate_ranker_predictions,
    load_frame,
    normalize_feature_frame,
    ranker_baselines,
    split_frame,
)


def resolve_existing_path(candidate: str | None, run_root: Path) -> Path | None:
    if not candidate:
        return None
    source = Path(candidate)
    probes = [source]
    if not source.is_absolute():
        probes.extend(
            [
                REPO_ROOT / source,
                run_root / source,
                run_root / "ml" / source.name,
            ]
        )
    for probe in probes:
        if probe.exists():
            return probe.resolve()
    return None


def resolve_path(run_root: Path, explicit: str | None, default_relative: str) -> Path:
    resolved = resolve_existing_path(explicit, run_root)
    if resolved:
        return resolved
    default_path = run_root / default_relative
    if not default_path.exists():
        raise FileNotFoundError(f"Expected file at {default_path}.")
    return default_path.resolve()


def locate_dataset_path(meta: dict[str, Any], run_root: Path) -> Path:
    resolved = resolve_existing_path(meta.get("source_dataset_path"), run_root)
    if resolved:
        return resolved
    for name in ["train.jsonl", "train.parquet", "train.csv.gz", "train.csv"]:
        probe = run_root / "ml" / name
        if probe.exists():
            return probe.resolve()
    raise FileNotFoundError("Could not locate the training dataset for the requested run.")


def apply_phase_filter(frame: pd.DataFrame, phase: str | None) -> pd.DataFrame:
    if not phase or "phase" not in frame.columns:
        return frame
    return frame[frame["phase"] == phase].copy()


def evaluation_summary(report: dict[str, Any] | None) -> dict[str, Any]:
    if not report:
        return {
            "present": False,
            "gate_passed": None,
            "contaminated_by_fallbacks": None,
            "challenger_fallbacks": None,
            "baseline_fallbacks": None,
            "average_score_delta": None,
        }

    comparison_run = report.get("comparison_run") or {}
    baseline_run = report.get("baseline_run") or {}
    combined = report.get("combined_comparison") or {}
    challenger_fallbacks = int(comparison_run.get("fallback_count") or 0)
    baseline_fallbacks = int(baseline_run.get("fallback_count") or 0)
    return {
        "present": True,
        "gate_passed": bool((report.get("gate") or {}).get("passed")),
        "contaminated_by_fallbacks": challenger_fallbacks > baseline_fallbacks,
        "challenger_fallbacks": challenger_fallbacks,
        "baseline_fallbacks": baseline_fallbacks,
        "average_score_delta": combined.get("average_score_delta_provider_a_minus_b"),
        "provider_a_match_wins": combined.get("provider_a_match_wins"),
        "provider_b_match_wins": combined.get("provider_b_match_wins"),
    }


def bad_decision_summary(
    validation_frame: pd.DataFrame,
    predictions: pd.Series,
    target_column: str,
) -> list[dict[str, Any]]:
    if validation_frame.empty or "decision_id" not in validation_frame.columns:
        return []

    scored = validation_frame.copy().reset_index(drop=True)
    scored["prediction"] = predictions.reset_index(drop=True)
    summaries: list[dict[str, Any]] = []
    for decision_id, group in scored.groupby("decision_id", sort=False):
        if len(group.index) <= 1:
            continue
        predicted_best = group.sort_values(["prediction"], ascending=False).iloc[0]
        oracle_best = group.sort_values([target_column], ascending=False).iloc[0]
        regret = float(oracle_best[target_column] - predicted_best[target_column])
        summaries.append(
            {
                "decision_id": str(decision_id),
                "row_count": int(len(group.index)),
                "predicted_action_type": str(
                    predicted_best.get("chosen_action_type")
                    or predicted_best.get("candidate_action_type")
                    or "__UNKNOWN__"
                ),
                "oracle_action_type": str(
                    oracle_best.get("chosen_action_type")
                    or oracle_best.get("candidate_action_type")
                    or "__UNKNOWN__"
                ),
                "predicted_value": float(predicted_best[target_column]),
                "oracle_value": float(oracle_best[target_column]),
                "regret": regret,
                "prediction_margin": float(
                    predicted_best["prediction"] - group["prediction"].mean()
                ),
            }
        )
    return sorted(
        summaries,
        key=lambda row: (row["regret"], row["oracle_value"]),
        reverse=True,
    )[:25]


def classify_failure(
    validation_metrics: dict[str, Any],
    baselines: dict[str, Any],
    evaluation: dict[str, Any],
    bad_decisions: list[dict[str, Any]],
) -> dict[str, Any]:
    model_vs_baseline = compare_ranker_to_baselines(validation_metrics, baselines)
    best_baseline = model_vs_baseline.get("best_baseline")
    rationale: list[str] = []
    contributors: list[str] = []
    primary = "E"
    label = "normal expected weakness of the current rollout-ranker signal"

    if (
        best_baseline
        and model_vs_baseline.get("improvement") is not None
        and float(model_vs_baseline["improvement"]) <= 0
    ):
        primary = "C"
        label = "missing features issue"
        rationale.append("The model is not beating simple ranker baselines on validation.")
    if evaluation.get("contaminated_by_fallbacks"):
        contributors.append("D")
        rationale.append("Head-to-head evaluation was contaminated by challenger fallbacks.")
    if bad_decisions and bad_decisions[0]["regret"] >= 100:
        contributors.append("A")
        rationale.append(
            "Large decision-level regret suggests the current target signal is still noisy or weakly aligned."
        )

    return {
        "primary": primary,
        "label": label,
        "contributors": sorted(set(contributors)),
        "rationale": rationale,
    }


def diagnostics_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Rollout Ranker Postmortem",
        "",
        f"- run_root: {report['run_root']}",
        f"- objective: {report['objective']}",
        f"- target_column: {report['target_column']}",
        f"- row_count: {report['row_count']}",
        f"- feature_count: {report['feature_count']}",
        "",
        "## Validation Metrics",
        "",
    ]
    lines.extend(f"- {key}: {value}" for key, value in report["validation_metrics"].items())
    lines.extend(["", "## Baselines", ""])
    for name, payload in report["baselines"].items():
        metrics = payload.get("validation", {})
        lines.append(
            "- "
            + name
            + ": "
            + ", ".join(f"{metric}={value}" for metric, value in metrics.items())
        )
    if not report["baselines"]:
        lines.append("- none")
    lines.extend(["", "## Model Vs Baseline", ""])
    lines.extend(f"- {key}: {value}" for key, value in report["model_vs_baseline"].items())
    lines.extend(["", "## Evaluation Contamination", ""])
    lines.extend(f"- {key}: {value}" for key, value in report["evaluation"].items())
    lines.extend(["", "## Bad Decisions", ""])
    if report["bad_decisions"]:
        for row in report["bad_decisions"]:
            lines.append(
                f"- {row['decision_id']}: regret={row['regret']}, "
                f"predicted={row['predicted_action_type']}({row['predicted_value']}), "
                f"oracle={row['oracle_action_type']}({row['oracle_value']})"
            )
    else:
        lines.append("- none")
    lines.extend(["", "## Failure Classification", ""])
    lines.extend(
        f"- {key}: {value}" for key, value in report["failure_classification"].items()
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-root", required=True)
    parser.add_argument("--meta-path", default=None)
    parser.add_argument("--model-path", default=None)
    parser.add_argument("--evaluation-path", default=None)
    args = parser.parse_args()

    run_root = Path(args.run_root)
    meta_path = resolve_path(run_root, args.meta_path, "ml/lightgbm_action_model.meta.json")
    model_path = resolve_path(run_root, args.model_path, "ml/lightgbm_action_model.txt")
    evaluation_path = resolve_existing_path(args.evaluation_path, run_root) or (
        run_root / "evaluation-report.json"
    )
    evaluation_report = (
        json.loads(evaluation_path.read_text(encoding="utf-8"))
        if evaluation_path.exists()
        else None
    )

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    dataset_path = locate_dataset_path(meta, run_root)
    target_column = str(meta.get("target_column", "rollout_mean_actor_team_delta"))

    frame = load_frame(str(dataset_path))
    frame = apply_phase_filter(frame, meta.get("phase"))
    frame = frame[frame[target_column].notna()].copy()
    if frame.empty:
        raise ValueError("No non-null rollout target rows remain after filtering.")

    train_frame, validation_frame, split_method = split_frame(
        frame,
        str(meta.get("objective", "rollout_ranker")),
        float(meta.get("validation_fraction", 0.2)),
        int(meta.get("random_state", 7)),
    )

    feature_columns = [
        column
        for column in (meta.get("feature_columns") or meta.get("feature_names") or [])
        if column in frame.columns
    ]
    normalized = (
        normalize_feature_frame(frame[feature_columns])
        if feature_columns
        else pd.DataFrame(index=frame.index)
    )
    frame = frame.assign(**normalized)
    train_frame = frame.loc[train_frame.index].copy()
    validation_frame = frame.loc[validation_frame.index].copy()

    booster = Booster(model_file=str(model_path))
    predictions = pd.Series(
        booster.predict(validation_frame[feature_columns]),
        index=validation_frame.index,
        dtype="float64",
    )
    validation_metrics = evaluate_ranker_predictions(
        validation_frame,
        predictions.reset_index(drop=True),
        target_column,
    )
    baselines = ranker_baselines(train_frame, validation_frame, target_column)
    model_vs_baseline = compare_ranker_to_baselines(validation_metrics, baselines)
    bad_decisions = bad_decision_summary(validation_frame, predictions, target_column)
    evaluation = evaluation_summary(evaluation_report)
    failure_classification = classify_failure(
        validation_metrics,
        baselines,
        evaluation,
        bad_decisions,
    )

    diagnostics_dir = run_root / "diagnostics"
    diagnostics_dir.mkdir(parents=True, exist_ok=True)
    json_output = diagnostics_dir / "rollout_ranker_postmortem.json"
    markdown_output = diagnostics_dir / "rollout_ranker_postmortem.md"

    report = make_json_safe(
        {
            "accepted": True,
            "run_root": str(run_root),
            "objective": meta.get("objective"),
            "target_column": target_column,
            "row_count": int(len(frame.index)),
            "feature_count": int(len(feature_columns)),
            "feature_profile": meta.get("feature_profile"),
            "meta_path": str(meta_path),
            "model_path": str(model_path),
            "evaluation_path": str(evaluation_path) if evaluation_path.exists() else None,
            "source_dataset_path": str(dataset_path),
            "split_method": split_method,
            "validation_metrics": validation_metrics,
            "baselines": baselines,
            "model_vs_baseline": model_vs_baseline,
            "evaluation": evaluation,
            "bad_decisions": bad_decisions,
            "failure_classification": failure_classification,
        }
    )
    json_output.write_text(dumps_json_safe(report, indent=2), encoding="utf-8")
    markdown_output.write_text(diagnostics_markdown(report), encoding="utf-8")
    print(dumps_json_safe(report))


if __name__ == "__main__":
    main()
