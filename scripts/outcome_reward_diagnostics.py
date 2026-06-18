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

from train_lightgbm import (  # noqa: E402
    compare_model_to_baselines,
    evaluate_regression_predictions,
    load_frame,
    normalize_feature_frame,
    regression_baselines,
    safe_spearman,
    spearman_interpretation,
    split_frame,
    target_distribution_summary,
)
from json_utils import dumps_json_safe, make_json_safe  # noqa: E402


GROUPING_CHECK_COLUMNS = {
    "game_id": ["game_id"],
    "round_id": ["round_id"],
    "trick_id": ["trick_id"],
    "decision_id": ["decision_id"],
    "seat": ["seat", "actor_seat"],
    "team": ["team", "actor_team"],
    "action_type": ["action_type", "chosen_action_type", "candidate_action_type"],
}


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


def locate_dataset_path(meta: dict[str, Any], run_root: Path) -> Path:
    resolved = resolve_existing_path(meta.get("source_dataset_path"), run_root)
    if resolved:
        return resolved
    for name in ["train.parquet", "train.jsonl", "train.csv.gz", "train.csv"]:
        probe = run_root / "ml" / name
        if probe.exists():
            return probe.resolve()
    raise FileNotFoundError("Could not locate the training dataset for the requested run.")


def resolve_meta_path(run_root: Path, explicit_meta: str | None) -> Path:
    resolved = resolve_existing_path(explicit_meta, run_root)
    if resolved:
        return resolved
    default_meta = run_root / "ml" / "lightgbm_action_model.meta.json"
    if not default_meta.exists():
        raise FileNotFoundError(f"Meta file was not found at {default_meta}.")
    return default_meta.resolve()


def resolve_model_path(run_root: Path, explicit_model: str | None) -> Path | None:
    resolved = resolve_existing_path(explicit_model, run_root)
    if resolved:
        return resolved
    default_model = run_root / "ml" / "lightgbm_action_model.txt"
    return default_model.resolve() if default_model.exists() else None


def apply_phase_filter(frame: pd.DataFrame, phase: str | None) -> pd.DataFrame:
    if not phase or "phase" not in frame.columns:
        return frame
    return frame[frame["phase"] == phase].copy()


def summarize_group_values(frame: pd.DataFrame, group_column: str, target_column: str) -> list[dict[str, Any]]:
    grouped = (
        frame.groupby(group_column, dropna=False)[target_column]
        .agg(["count", "mean", "std", "min", "max"])
        .reset_index()
    )
    grouped["p25"] = frame.groupby(group_column, dropna=False)[target_column].quantile(0.25).values
    grouped["p50"] = frame.groupby(group_column, dropna=False)[target_column].quantile(0.5).values
    grouped["p75"] = frame.groupby(group_column, dropna=False)[target_column].quantile(0.75).values
    grouped["zero_count"] = frame.groupby(group_column, dropna=False)[target_column].apply(lambda values: int((values == 0).sum())).values
    grouped = grouped.sort_values(["mean", "count"], ascending=[False, False]).reset_index(drop=True)
    rows = grouped.to_dict("records")
    for row in rows:
        value = row.get(group_column)
        row["group"] = "__MISSING__" if pd.isna(value) else str(value)
        del row[group_column]
    return rows


def summarize_game_groups(frame: pd.DataFrame, target_column: str) -> dict[str, Any]:
    if "game_id" not in frame.columns:
        return {"present": False}
    grouped = (
        frame.groupby("game_id", dropna=False)[target_column]
        .agg(["count", "mean", "std", "min", "max", "nunique"])
        .reset_index()
    )
    grouped = grouped.sort_values(["mean", "count"], ascending=[False, False]).reset_index(drop=True)
    count_distribution = target_distribution_summary(grouped["count"])
    unique_distribution = target_distribution_summary(grouped["nunique"])
    top_positive = grouped.head(20).to_dict("records")
    top_negative = grouped.sort_values(["mean", "count"], ascending=[True, False]).head(20).to_dict("records")
    return {
        "present": True,
        "group_count": int(len(grouped.index)),
        "rows_per_game_distribution": count_distribution,
        "unique_target_values_per_game_distribution": unique_distribution,
        "top_positive_mean_games": top_positive,
        "top_negative_mean_games": top_negative,
    }


def grouping_column_report(frame: pd.DataFrame) -> dict[str, Any]:
    report: dict[str, Any] = {}
    for logical_name, candidates in GROUPING_CHECK_COLUMNS.items():
        actual = next((column for column in candidates if column in frame.columns), None)
        report[logical_name] = {
            "present": actual is not None,
            "column": actual,
            "unique_count": int(frame[actual].nunique(dropna=True)) if actual else 0,
        }
    return report


def split_strategy_report(
    frame: pd.DataFrame,
    meta: dict[str, Any],
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    validation_fraction = float(meta.get("validation_fraction", 0.2))
    random_state = int(meta.get("random_state", 7))
    train_frame, validation_frame, inferred_method = split_frame(
        frame,
        str(meta.get("objective", "observed_outcome_regression")),
        validation_fraction,
        random_state,
    )
    recorded_method = meta.get("train_validation_split_method")
    method = str(recorded_method or inferred_method)
    problem = "row" in method
    grouped_by = "game_id" if "game_id" in method else "decision_id" if "decision_id" in method else None
    return train_frame, validation_frame, {
        "recorded_method": recorded_method,
        "resolved_method": method,
        "validation_fraction": validation_fraction,
        "random_state": random_state,
        "used_default_validation_fraction": "validation_fraction" not in meta,
        "used_default_random_state": "random_state" not in meta,
        "grouped_by": grouped_by,
        "problem": problem,
        "recommendation": (
            "Use grouped validation by game_id or run_id instead of random-row holdout."
            if problem
            else "Grouped validation is in use; keep game_id/run_id holdout for future runs."
        ),
        "validation_row_count": int(len(validation_frame.index)),
        "train_row_count": int(len(train_frame.index)),
    }


def decision_group_rank_diagnostics(
    validation_frame: pd.DataFrame,
    predictions: pd.Series | None,
    target_column: str,
) -> dict[str, Any]:
    if "decision_id" not in validation_frame.columns:
        return {
            "present": False,
            "groups_with_enough_alternatives": 0,
            "average_group_spearman": None,
            "per_group_spearman": [],
            "note": "decision_id is not present in the dataset.",
        }

    multi_action_groups: list[dict[str, Any]] = []
    if predictions is not None and not validation_frame.empty:
        scored = validation_frame[["decision_id", target_column]].copy().reset_index(drop=True)
        scored["prediction"] = predictions.reset_index(drop=True)
        for decision_id, group in scored.groupby("decision_id", sort=False):
            if len(group.index) <= 1:
                continue
            score = safe_spearman(group[target_column], group["prediction"])
            if score is None:
                continue
            multi_action_groups.append(
                {
                    "decision_id": str(decision_id),
                    "row_count": int(len(group.index)),
                    "target_range": float(group[target_column].max() - group[target_column].min()),
                    "spearman": score,
                }
            )

    average = (
        float(pd.Series([row["spearman"] for row in multi_action_groups]).mean())
        if multi_action_groups
        else None
    )
    return {
        "present": True,
        "groups_with_enough_alternatives": int(len(multi_action_groups)),
        "average_group_spearman": average,
        "per_group_spearman": multi_action_groups,
        "note": (
            "No decision groups with multiple candidate actions were available."
            if not multi_action_groups
            else None
        ),
    }


def target_issue_checks(frame: pd.DataFrame, target_column: str, distribution: dict[str, Any]) -> dict[str, Any]:
    non_null = frame[target_column].dropna().astype(float)
    checks: dict[str, Any] = {}
    std = distribution.get("std") or 0.0
    p1 = distribution.get("p1") or 0.0
    p99 = distribution.get("p99") or 0.0
    p95 = distribution.get("p95") or 0.0
    p50 = distribution.get("p50") or 0.0
    zero_fraction = (distribution.get("zero_count") or 0) / distribution["count"] if distribution.get("count") else 0.0

    checks["constant_or_near_constant_target"] = {
        "flag": bool(non_null.nunique() <= 3 or abs(std) < 1e-6 or abs(p99 - p1) < 1.0),
        "details": {
            "unique_non_null_values": int(non_null.nunique()),
            "std": std,
            "p99_minus_p1": float(p99 - p1),
        },
    }

    if "game_id" in frame.columns:
        unique_targets = frame.groupby("game_id", dropna=False)[target_column].nunique(dropna=True)
        rows_per_game = frame.groupby("game_id", dropna=False).size()
        constant_fraction = float((unique_targets <= 1).mean()) if not unique_targets.empty else 0.0
        checks["target_mostly_copied_per_game"] = {
            "flag": bool(constant_fraction >= 0.5 and float(rows_per_game.median()) >= 3),
            "details": {
                "games_with_single_target_fraction": constant_fraction,
                "median_rows_per_game": float(rows_per_game.median()) if not rows_per_game.empty else 0.0,
                "median_unique_targets_per_game": float(unique_targets.median()) if not unique_targets.empty else 0.0,
            },
        }
    else:
        checks["target_mostly_copied_per_game"] = {
            "flag": False,
            "details": {"reason": "game_id unavailable"},
        }

    checks["target_distribution_too_wide_for_raw_regression"] = {
        "flag": bool(abs(p99 - p1) >= 350 or std >= 150),
        "details": {
            "p99_minus_p1": float(p99 - p1),
            "std": std,
        },
    }

    checks["sparse_non_zero_target"] = {
        "flag": bool(zero_fraction >= 0.7),
        "details": {
            "zero_fraction": zero_fraction,
            "non_zero_fraction": 1.0 - zero_fraction,
        },
    }

    abs_values = non_null.abs()
    abs_p95 = float(abs_values.quantile(0.95)) if not abs_values.empty else 0.0
    abs_max = float(abs_values.max()) if not abs_values.empty else 0.0
    checks["extreme_outliers_dominate_rmse"] = {
        "flag": bool(abs_p95 > 0 and abs_max >= abs_p95 * 3),
        "details": {
            "abs_max": abs_max,
            "abs_p95": abs_p95,
            "p95_minus_p50": float(p95 - p50),
        },
    }

    return checks


def classify_failure(
    *,
    meta: dict[str, Any],
    split_strategy: dict[str, Any],
    target_checks: dict[str, Any],
    rank_diagnostics: dict[str, Any],
    validation_metrics: dict[str, Any],
    baselines: dict[str, Any],
    missing_feature_columns: list[str],
    dataset_warnings: list[str],
) -> dict[str, Any]:
    rationale: list[str] = []
    contributors: list[str] = []
    primary = "E"
    label = "normal expected weakness of raw observed-outcome regression"

    if dataset_warnings or missing_feature_columns:
        primary = "D"
        label = "dataset corruption/export issue"
        rationale.append("The diagnostic found missing files, mismatched paths, or missing feature columns.")
    elif split_strategy["problem"]:
        primary = "B"
        label = "validation split issue"
        rationale.append("Validation appears to use random-row holdout, which can leak within-game structure.")
    elif (
        target_checks["constant_or_near_constant_target"]["flag"]
        or target_checks["target_mostly_copied_per_game"]["flag"]
    ):
        primary = "A"
        label = "target construction issue"
        rationale.append("The target shows low within-game variation or is effectively copied across many rows in the same game.")
    else:
        model_rmse = validation_metrics.get("rmse")
        best_baseline = compare_model_to_baselines(validation_metrics, baselines).get("best_baseline")
        model_spearman = validation_metrics.get("spearman")
        if (
            str(meta.get("objective")) == "observed_outcome_regression"
            and rank_diagnostics["groups_with_enough_alternatives"] == 0
            and model_spearman is not None
            and model_spearman <= 0.03
        ):
            primary = "E"
            label = "normal expected weakness of raw observed-outcome regression"
            rationale.append("This dataset does not contain multi-action decision groups, so raw observed-outcome regression is a weak ranking signal.")
        elif best_baseline and model_rmse is not None and float(model_rmse) >= float(best_baseline["rmse"]):
            primary = "C"
            label = "missing features issue"
            rationale.append("The model is not beating simple grouped baselines, which points to insufficient predictive features.")

    if target_checks["target_distribution_too_wide_for_raw_regression"]["flag"]:
        contributors.append("A")
        rationale.append("The target range is wide, which makes direct raw regression harder to fit cleanly.")
    if target_checks["extreme_outliers_dominate_rmse"]["flag"]:
        contributors.append("A")
        rationale.append("Extreme target outliers are likely dominating error metrics.")
    if rank_diagnostics["groups_with_enough_alternatives"] == 0:
        contributors.append("E")
        rationale.append("No decision groups with multiple candidate actions were available for within-decision ranking diagnostics.")

    return {
        "primary": primary,
        "label": label,
        "contributors": sorted(set(contributors)),
        "rationale": rationale,
    }


def diagnostics_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Outcome Reward Diagnostics",
        "",
        f"- run_root: {report['run_root']}",
        f"- objective: {report['objective']}",
        f"- target_column: {report['target_column']}",
        f"- row_count: {report['row_count']}",
        f"- feature_count: {report['feature_count']}",
        f"- feature_profile: {report['feature_profile']}",
        f"- source_dataset_path: {report['source_dataset_path']}",
        "",
        "## Target Distribution",
        "",
    ]
    lines.extend(
        f"- {key}: {value}" for key, value in report["target_distribution"].items()
    )
    lines.extend(
        [
            "",
            "## Split Strategy",
            "",
        ]
    )
    lines.extend(
        f"- {key}: {value}" for key, value in report["split_strategy"].items()
    )
    lines.extend(
        [
            "",
            "## Validation Metrics",
            "",
        ]
    )
    lines.extend(
        f"- {key}: {value}" for key, value in report["validation_metrics"].items()
    )
    lines.extend(
        [
            "",
            "## Recorded Vs Recomputed Metrics",
            "",
        ]
    )
    lines.extend(
        f"- {key}: {value}" for key, value in report["validation_metric_drift"].items()
    )
    lines.extend(
        [
            "",
            "## Baselines",
            "",
        ]
    )
    for name, payload in report["baselines"].items():
        metrics = payload.get("validation", {})
        lines.append(f"- {name}: rmse={metrics.get('rmse')}, mae={metrics.get('mae')}, spearman={metrics.get('spearman')}")
    if not report["baselines"]:
        lines.append("- none")
    lines.extend(
        [
            "",
            "## Model Vs Baseline",
            "",
        ]
    )
    lines.extend(
        f"- {key}: {value}" for key, value in report["model_vs_baseline"].items()
    )
    lines.extend(
        [
            "",
            "## Spearman Interpretation",
            "",
        ]
    )
    lines.extend(
        f"- {key}: {value}" for key, value in report["spearman_interpretation"].items()
    )
    lines.extend(
        [
            "",
            "## Target Issue Checks",
            "",
        ]
    )
    for name, payload in report["target_issue_checks"].items():
        lines.append(f"- {name}: flag={payload.get('flag')} details={payload.get('details')}")
    lines.extend(
        [
            "",
            "## Failure Classification",
            "",
        ]
    )
    lines.extend(
        f"- {key}: {value}" for key, value in report["failure_classification"].items()
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-root", required=True)
    parser.add_argument("--meta-path", default=None)
    parser.add_argument("--model-path", default=None)
    args = parser.parse_args()

    run_root = Path(args.run_root)
    meta_path = resolve_meta_path(run_root, args.meta_path)
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    dataset_path = locate_dataset_path(meta, run_root)
    model_path = resolve_model_path(run_root, args.model_path)

    raw_frame = load_frame(str(dataset_path))
    raw_frame = apply_phase_filter(raw_frame, meta.get("phase"))

    target_column = str(meta.get("target_column", "outcome_reward"))
    if target_column not in raw_frame.columns:
        raise ValueError(f"Target column '{target_column}' is not present in {dataset_path}.")

    target_distribution = target_distribution_summary(raw_frame[target_column])
    frame = raw_frame[raw_frame[target_column].notna()].copy()
    if frame.empty:
        raise ValueError("No non-null target rows remain after filtering.")

    grouping_report = grouping_column_report(frame)
    grouped_summaries: dict[str, Any] = {}
    for logical_name in ["seat", "team", "action_type"]:
        actual = grouping_report[logical_name]["column"]
        if actual:
            grouped_summaries[logical_name] = summarize_group_values(frame, actual, target_column)
    grouped_summaries["game_id"] = summarize_game_groups(frame, target_column)

    split_train, split_validation, split_strategy = split_strategy_report(frame, meta)

    feature_columns = meta.get("feature_columns") or meta.get("feature_names") or []
    feature_columns = [column for column in feature_columns if column in frame.columns]
    missing_feature_columns = [
        column
        for column in (meta.get("feature_columns") or meta.get("feature_names") or [])
        if column not in frame.columns
    ]
    feature_frame = normalize_feature_frame(frame[feature_columns]) if feature_columns else pd.DataFrame(index=frame.index)
    frame = frame.assign(**feature_frame)
    split_train = frame.loc[split_train.index].copy()
    split_validation = frame.loc[split_validation.index].copy()

    model_predictions: pd.Series | None = None
    validation_metrics: dict[str, Any] = {}
    dataset_warnings: list[str] = []
    if split_validation.empty:
        dataset_warnings.append("Validation split produced zero rows.")
    if not feature_columns:
        dataset_warnings.append("No feature columns were available from model metadata.")

    if model_path and feature_columns and not split_validation.empty:
        booster = Booster(model_file=str(model_path))
        model_predictions = pd.Series(
            booster.predict(split_validation[feature_columns]),
            index=split_validation.index,
            dtype="float64",
        )
        validation_metrics = evaluate_regression_predictions(
            split_validation[target_column].astype(float).reset_index(drop=True),
            model_predictions.reset_index(drop=True),
        )
    else:
        dataset_warnings.append("Model predictions could not be computed from the saved artifact.")

    baselines = (
        regression_baselines(split_train, split_validation, target_column)
        if not split_validation.empty
        else {}
    )
    recorded_validation_metrics = make_json_safe(meta.get("validation_metrics", {}))
    validation_metric_drift = {
        "recorded_validation_metrics": recorded_validation_metrics,
        "recomputed_validation_metrics": validation_metrics,
        "rmse_delta": (
            None
            if recorded_validation_metrics.get("rmse") is None or validation_metrics.get("rmse") is None
            else float(validation_metrics["rmse"] - recorded_validation_metrics["rmse"])
        ),
        "mae_delta": (
            None
            if recorded_validation_metrics.get("mae") is None or validation_metrics.get("mae") is None
            else float(validation_metrics["mae"] - recorded_validation_metrics["mae"])
        ),
        "spearman_delta": (
            None
            if recorded_validation_metrics.get("spearman") is None or validation_metrics.get("spearman") is None
            else float(validation_metrics["spearman"] - recorded_validation_metrics["spearman"])
        ),
        "metric_mismatch_problem": bool(
            recorded_validation_metrics.get("spearman") is not None
            and validation_metrics.get("spearman") is not None
            and abs(float(validation_metrics["spearman"] - recorded_validation_metrics["spearman"])) >= 0.05
        ),
    }
    model_vs_baseline = compare_model_to_baselines(validation_metrics, baselines)
    rank_diagnostics = decision_group_rank_diagnostics(
        split_validation,
        model_predictions.reset_index(drop=True) if model_predictions is not None else None,
        target_column,
    )
    target_checks = target_issue_checks(frame, target_column, target_distribution)
    spearman_summary = spearman_interpretation(validation_metrics.get("spearman"))
    failure_classification = classify_failure(
        meta=meta,
        split_strategy=split_strategy,
        target_checks=target_checks,
        rank_diagnostics=rank_diagnostics,
        validation_metrics=validation_metrics,
        baselines=baselines,
        missing_feature_columns=missing_feature_columns,
        dataset_warnings=dataset_warnings,
    )

    diagnostics_dir = run_root / "diagnostics"
    diagnostics_dir.mkdir(parents=True, exist_ok=True)
    json_output = diagnostics_dir / "outcome_reward_diagnostics.json"
    markdown_output = diagnostics_dir / "outcome_reward_diagnostics.md"

    report = make_json_safe({
        "accepted": True,
        "run_root": str(run_root),
        "objective": meta.get("objective"),
        "target_column": target_column,
        "row_count": int(len(frame.index)),
        "feature_count": int(len(feature_columns)),
        "feature_profile": meta.get("feature_profile"),
        "meta_path": str(meta_path),
        "model_path": str(model_path) if model_path else None,
        "source_dataset_path": str(dataset_path),
        "grouping_columns": grouping_report,
        "grouped_target_summaries": grouped_summaries,
        "target_distribution": target_distribution,
        "split_strategy": split_strategy,
        "validation_metrics": validation_metrics,
        "validation_metric_drift": validation_metric_drift,
        "baselines": baselines,
        "model_vs_baseline": model_vs_baseline,
        "rank_diagnostics": rank_diagnostics,
        "target_issue_checks": target_checks,
        "spearman_interpretation": spearman_summary,
        "missing_feature_columns": missing_feature_columns,
        "dataset_warnings": dataset_warnings,
        "failure_classification": failure_classification,
    })
    json_output.write_text(dumps_json_safe(report, indent=2), encoding="utf-8")
    markdown_output.write_text(diagnostics_markdown(report), encoding="utf-8")
    print(dumps_json_safe(report))


if __name__ == "__main__":
    main()
