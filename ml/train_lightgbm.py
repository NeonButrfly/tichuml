from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd
from lightgbm import LGBMClassifier, LGBMRanker, LGBMRegressor
from sklearn.metrics import accuracy_score, mean_absolute_error, mean_squared_error, roc_auc_score
from sklearn.model_selection import train_test_split

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from feature_builder import phase_alias
from json_utils import dumps_json_safe, make_json_safe

DEFAULT_MANIFEST = Path("artifacts/ml/export-manifest.json")
DEFAULT_REPORT_JSON = Path("artifacts/ml/training-report.json")
DEFAULT_FEATURE_IMPORTANCE = Path("artifacts/ml/feature-importance.csv")
DEFAULT_RANKER_MAX_RELEVANCE = 4
RUNTIME_TACTICAL_FEATURES = {
    "likely_wins_current_trick_flag",
    "hand_quality_score",
    "future_hand_quality_delta",
    "control_retention_estimate",
    "structure_preservation_score",
    "dead_singles_count_before",
    "dead_singles_count_after",
    "dead_singles_reduction",
    "combo_count_before",
    "combo_count_after",
    "finishability_score",
    "endgame_pressure",
    "partner_advantage_estimate",
    "opponent_threat_estimate",
    "resource_cost_score",
    "shed_value_score",
    "control_value_score",
    "bomb_count_in_hand",
    "dragon_in_hand",
    "phoenix_in_hand",
    "dog_in_hand",
    "mahjong_in_hand",
    "control_cards_count",
    "premium_resource_pressure",
    "singles_count",
    "pairs_count",
    "triples_count",
    "straights_count",
    "pair_runs_count",
    "bombs_count",
    "isolated_high_singles_count",
    "isolated_low_singles_count",
}
RUNTIME_TACTICAL_PREFIXES = ("urgency_mode_",)
GROUPING_COLUMN_ALIASES = {
    "seat": ["seat", "actor_seat"],
    "team": ["team", "actor_team"],
    "action_type": ["action_type", "chosen_action_type", "candidate_action_type"],
}
SPEARMAN_GUIDANCE = [
    (0.20, "useful"),
    (0.10, "promising"),
    (0.03, "weak"),
]


def emit_training_trace(event: str, payload: dict[str, Any]) -> None:
    print(
        dumps_json_safe(
            {
                "ts": datetime.now(UTC).isoformat(),
                "event": event,
                **payload,
            }
        ),
        flush=True,
    )


def make_training_progress_callback(config: dict[str, Any]):
    total_iterations = int(config.get("total_iterations") or 0)
    report_every = max(1, int(config.get("report_every") or 25))

    def _callback(env) -> None:
        iteration = int(env.iteration) + 1
        if (
            iteration == 1
            or iteration == total_iterations
            or iteration % report_every == 0
        ):
            emit_training_trace(
                "lightgbm_training_progress",
                {
                    "iteration": iteration,
                    "total_iterations": total_iterations,
                    "iteration_progress": float(
                        round((iteration / max(1, total_iterations)) * 100.0, 2)
                    ),
                    "row_count": int(config.get("row_count") or 0),
                    "train_row_count": int(config.get("train_row_count") or 0),
                    "validation_row_count": int(config.get("validation_row_count") or 0),
                    "objective": config.get("objective"),
                    "label_mode": config.get("label_mode"),
                },
            )

    _callback.order = 10  # type: ignore[attr-defined]
    _callback.before_iteration = False  # type: ignore[attr-defined]
    return _callback


def load_frame(path: str) -> pd.DataFrame:
    source = Path(path)
    if source.suffix == ".jsonl":
        return pd.read_json(source, lines=True)
    if source.suffix == ".gz":
        return pd.read_csv(source)
    return pd.read_parquet(source)


def load_manifest(path: str | None) -> dict[str, Any]:
    if not path:
        return {}
    source = Path(path)
    if not source.exists():
        return {}
    return json.loads(source.read_text(encoding="utf-8"))


def merge_rollout_input(frame: pd.DataFrame, rollout_input: str | None) -> pd.DataFrame:
    if not rollout_input:
        return frame
    rollout_frame = load_frame(rollout_input)
    join_keys = [key for key in ["decision_id", "candidate_action_key"] if key in frame.columns and key in rollout_frame.columns]
    if len(join_keys) != 2:
        raise ValueError(
            "Rollout input must contain decision_id and candidate_action_key to merge with export rows."
        )
    rollout_columns = [
        column
        for column in rollout_frame.columns
        if column not in join_keys
    ]
    merged = frame.merge(
        rollout_frame[join_keys + rollout_columns],
        on=join_keys,
        how="left",
        suffixes=("", "_rollout"),
    )
    for column in rollout_columns:
        merged_column = f"{column}_rollout"
        if merged_column not in merged.columns:
            continue
        if column in merged.columns:
            merged[column] = merged[merged_column].combine_first(merged[column])
            merged = merged.drop(columns=[merged_column])
            continue
        merged = merged.rename(columns={merged_column: column})
    return merged


def objective_defaults(objective: str) -> tuple[str, str]:
    if objective == "imitation_binary":
        return ("imitation", "label")
    if objective == "observed_outcome_regression":
        return ("observed_outcome", "observed_actor_team_hand_delta")
    if objective in {"rollout_regression", "rollout_ranker"}:
        return ("rollout", "rollout_mean_actor_team_delta")
    raise ValueError(f"Unsupported objective: {objective}")


def filter_phase(frame: pd.DataFrame, phase: str | None) -> pd.DataFrame:
    if phase is None or "phase" not in frame.columns:
        return frame
    resolved = phase_alias(phase)
    return frame[frame["phase"] == resolved]


def default_feature_columns(frame: pd.DataFrame, manifest: dict[str, Any]) -> list[str]:
    manifest_features = manifest.get("feature_columns")
    if isinstance(manifest_features, list) and manifest_features:
        return [column for column in manifest_features if column in frame.columns]
    return [
        column
        for column in frame.columns
        if column.startswith("phase_")
        or column.startswith("actor_is_")
        or column.startswith("action_type_")
        or column.startswith("action_combo_")
        or column.startswith("self_")
        or column.startswith("partner_")
        or column.startswith("left_opponent_")
        or column.startswith("right_opponent_")
        or column.startswith("cards_remaining_")
        or column.endswith("_flag")
        or column.endswith("_score")
        or column.endswith("_count")
        or column in {
            "wish_rank",
            "current_top_combo_rank",
            "current_top_combo_length",
            "current_trick_size",
            "action_rank",
            "action_length",
            "cards_used_count",
            "opponent_near_out_count",
        }
    ]


def apply_feature_profile(
    feature_columns: list[str], feature_profile: str
) -> list[str]:
    if feature_profile == "full":
        return feature_columns
    if feature_profile != "runtime_raw":
        raise ValueError(f"Unsupported feature profile: {feature_profile}")

    return [
        column
        for column in feature_columns
        if column not in RUNTIME_TACTICAL_FEATURES
        and not column.startswith(RUNTIME_TACTICAL_PREFIXES)
    ]


def normalize_feature_frame(frame: pd.DataFrame) -> pd.DataFrame:
    normalized = frame.copy()
    invalid_columns: list[str] = []
    for column in normalized.columns:
        series = normalized[column]
        if pd.api.types.is_bool_dtype(series.dtype) or pd.api.types.is_numeric_dtype(
            series.dtype
        ):
            continue
        numeric = pd.to_numeric(series, errors="coerce")
        if numeric.isna().sum() > series.isna().sum():
            invalid_columns.append(column)
            continue
        normalized[column] = numeric.astype("float64")

    if invalid_columns:
        raise ValueError(
            "Feature columns must be numeric after normalization. "
            f"Non-numeric columns: {', '.join(invalid_columns)}"
        )

    return normalized


def excluded_columns(
    frame: pd.DataFrame,
    manifest: dict[str, Any],
    feature_columns: list[str],
    target_column: str,
    objective: str,
) -> list[str]:
    manifest_excluded = manifest.get("leakage_excluded_columns")
    base = list(manifest_excluded) if isinstance(manifest_excluded, list) else []
    base.extend(
        [
            "decision_id",
            "game_id",
            "hand_id",
            "ts",
            "candidate_was_chosen",
            "candidate_action_key",
            "candidate_action_canonical_json",
            "observed_actor_team_hand_delta",
            "observed_actor_team_final_delta",
            "rollout_mean_actor_team_delta",
            "rollout_median_actor_team_delta",
            "rollout_std_actor_team_delta",
            "rollout_win_rate",
            "rollout_hand_win_rate",
            "provider_used",
            "requested_provider",
            "policy_name",
            "policy_source",
        ]
    )
    if objective == "imitation_binary":
        base.append("candidate_was_chosen")
    base = [column for column in dict.fromkeys(base) if column in frame.columns and column not in feature_columns and column != target_column]
    return base


def group_split_ids(frame: pd.DataFrame, objective: str) -> list[Any]:
    if objective == "rollout_ranker" and "decision_id" in frame.columns:
        return frame["decision_id"].drop_duplicates().tolist()
    if "game_id" in frame.columns:
        return frame["game_id"].drop_duplicates().tolist()
    if "decision_id" in frame.columns:
        return frame["decision_id"].drop_duplicates().tolist()
    return list(range(len(frame.index)))


def split_frame(
    frame: pd.DataFrame,
    objective: str,
    validation_fraction: float,
    random_state: int,
) -> tuple[pd.DataFrame, pd.DataFrame, str]:
    group_key = "decision_id" if objective == "rollout_ranker" and "decision_id" in frame.columns else "game_id" if "game_id" in frame.columns else "decision_id" if "decision_id" in frame.columns else None
    if not group_key or validation_fraction <= 0:
        return frame, frame.iloc[0:0], "none"
    group_ids = frame[group_key].drop_duplicates().tolist()
    if len(group_ids) < 2:
        return frame, frame.iloc[0:0], f"{group_key}_group_holdout_unavailable"
    train_ids, validation_ids = train_test_split(
        group_ids,
        test_size=validation_fraction,
        random_state=random_state,
        shuffle=True,
    )
    return (
        frame[frame[group_key].isin(train_ids)],
        frame[frame[group_key].isin(validation_ids)],
        f"{group_key}_group_holdout",
    )


def resolve_grouping_column(frame: pd.DataFrame, logical_name: str) -> str | None:
    for column in GROUPING_COLUMN_ALIASES.get(logical_name, []):
        if column in frame.columns:
            return column
    return None


def safe_spearman(truth: pd.Series, predictions: pd.Series) -> float | None:
    if len(truth.index) <= 1 or len(predictions.index) <= 1:
        return None
    aligned_truth = pd.Series(truth, copy=False).reset_index(drop=True)
    aligned_predictions = pd.Series(predictions, copy=False).reset_index(drop=True)
    score = aligned_truth.corr(aligned_predictions, method="spearman")
    if pd.isna(score):
        return None
    return float(score)


def target_distribution_summary(series: pd.Series) -> dict[str, Any]:
    numeric = pd.to_numeric(series, errors="coerce")
    non_null = numeric.dropna()
    quantiles = (
        non_null.quantile([0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99])
        if not non_null.empty
        else pd.Series(dtype="float64")
    )

    def quantile_value(key: float) -> float | None:
        value = quantiles.get(key)
        if value is None or pd.isna(value):
            return None
        return float(value)

    p1 = quantile_value(0.01)
    p99 = quantile_value(0.99)
    return {
        "count": int(len(series.index)),
        "null_count": int(numeric.isna().sum()),
        "zero_count": int((non_null == 0).sum()),
        "min": float(non_null.min()) if not non_null.empty else None,
        "max": float(non_null.max()) if not non_null.empty else None,
        "mean": float(non_null.mean()) if not non_null.empty else None,
        "std": float(non_null.std(ddof=0)) if not non_null.empty else None,
        "p1": p1,
        "p5": quantile_value(0.05),
        "p25": quantile_value(0.25),
        "p50": quantile_value(0.5),
        "p75": quantile_value(0.75),
        "p95": quantile_value(0.95),
        "p99": p99,
        "extreme_negative_count": int((non_null <= p1).sum()) if p1 is not None else 0,
        "extreme_positive_count": int((non_null >= p99).sum()) if p99 is not None else 0,
        "extreme_thresholds": {
            "negative_at_or_below": p1,
            "positive_at_or_above": p99,
        },
    }


def evaluate_regression_predictions(
    truth: pd.Series,
    predictions: pd.Series,
) -> dict[str, Any]:
    return {
        "rmse": float(math.sqrt(mean_squared_error(truth, predictions))),
        "mae": float(mean_absolute_error(truth, predictions)),
        "spearman": safe_spearman(truth, predictions),
    }


def grouped_mean_predictions(
    train_frame: pd.DataFrame,
    validation_frame: pd.DataFrame,
    target_column: str,
    group_columns: list[str],
    fallback: pd.Series,
) -> pd.Series:
    if validation_frame.empty:
        return pd.Series(dtype="float64")

    def normalize_keys(frame: pd.DataFrame) -> pd.DataFrame:
        normalized = frame[group_columns].copy()
        for column in group_columns:
            normalized[column] = normalized[column].astype("string").fillna("__MISSING__")
        return normalized

    grouped_targets = train_frame[[*group_columns, target_column]].copy()
    grouped_targets[group_columns] = normalize_keys(grouped_targets)
    lookup = (
        grouped_targets.groupby(group_columns, dropna=False)[target_column]
        .mean()
        .reset_index(name="prediction")
    )
    validation_keys = normalize_keys(validation_frame).reset_index(drop=True)
    validation_keys["row_order"] = list(range(len(validation_keys.index)))
    merged = (
        validation_keys.merge(lookup, on=group_columns, how="left")
        .sort_values("row_order")
        .reset_index(drop=True)
    )
    predictions = pd.to_numeric(merged["prediction"], errors="coerce")
    fallback_series = fallback.reset_index(drop=True)
    return predictions.combine_first(fallback_series)


def regression_baselines(
    train_frame: pd.DataFrame,
    validation_frame: pd.DataFrame,
    target_column: str,
) -> dict[str, Any]:
    baselines: dict[str, Any] = {}
    if validation_frame.empty:
        return baselines

    truth = validation_frame[target_column].astype(float).reset_index(drop=True)
    global_mean_value = float(train_frame[target_column].astype(float).mean())
    global_predictions = pd.Series(global_mean_value, index=range(len(truth.index)), dtype="float64")
    baselines["global_mean"] = {
        "strategy": "global_mean",
        "train_value": global_mean_value,
        "validation": evaluate_regression_predictions(truth, global_predictions),
    }

    action_type_column = resolve_grouping_column(train_frame, "action_type")
    if action_type_column and action_type_column in validation_frame.columns:
        grouped_predictions = grouped_mean_predictions(
            train_frame,
            validation_frame,
            target_column,
            [action_type_column],
            global_predictions,
        )
        baselines["grouped_by_action_type"] = {
            "strategy": "grouped_mean",
            "group_columns": [action_type_column],
            "validation": evaluate_regression_predictions(truth, grouped_predictions),
        }

    seat_column = resolve_grouping_column(train_frame, "seat")
    if (
        seat_column
        and seat_column in validation_frame.columns
        and action_type_column
        and action_type_column in validation_frame.columns
    ):
        fallback_predictions = grouped_mean_predictions(
            train_frame,
            validation_frame,
            target_column,
            [action_type_column],
            global_predictions,
        )
        grouped_predictions = grouped_mean_predictions(
            train_frame,
            validation_frame,
            target_column,
            [seat_column, action_type_column],
            fallback_predictions,
        )
        baselines["grouped_by_seat_action_type"] = {
            "strategy": "grouped_mean",
            "group_columns": [seat_column, action_type_column],
            "validation": evaluate_regression_predictions(truth, grouped_predictions),
        }

    return baselines


def compare_model_to_baselines(
    validation_metrics: dict[str, Any],
    baseline_metrics: dict[str, Any],
) -> dict[str, Any]:
    model_rmse = validation_metrics.get("rmse")
    model_mae = validation_metrics.get("mae")
    candidates: list[tuple[str, dict[str, Any]]] = []
    for name, payload in baseline_metrics.items():
        metrics = payload.get("validation")
        if not isinstance(metrics, dict) or metrics.get("rmse") is None:
            continue
        candidates.append((name, metrics))

    if model_rmse is None or model_mae is None or not candidates:
        return {
            "best_baseline": None,
            "rmse_improvement": None,
            "rmse_improvement_pct": None,
            "mae_improvement": None,
            "mae_improvement_pct": None,
        }

    best_name, best_metrics = min(candidates, key=lambda item: item[1]["rmse"])
    baseline_rmse = float(best_metrics["rmse"])
    baseline_mae = float(best_metrics["mae"])
    rmse_improvement = baseline_rmse - float(model_rmse)
    mae_improvement = baseline_mae - float(model_mae)
    return {
        "best_baseline": {
            "name": best_name,
            "rmse": baseline_rmse,
            "mae": baseline_mae,
        },
        "rmse_improvement": rmse_improvement,
        "rmse_improvement_pct": (rmse_improvement / baseline_rmse) if baseline_rmse else None,
        "mae_improvement": mae_improvement,
        "mae_improvement_pct": (mae_improvement / baseline_mae) if baseline_mae else None,
    }


def spearman_interpretation(score: float | None) -> dict[str, Any]:
    guidance = (
        "> 0.20 useful; > 0.10 promising; 0.03-0.10 weak; "
        "near 0 not useful; negative likely broken/mismatched target"
    )
    if score is None:
        return {
            "label": "unavailable",
            "interpretation": "No validation Spearman was available.",
            "guidance": guidance,
            "score": None,
        }
    if score < 0:
        label = "negative likely broken/mismatched target"
    else:
        label = "near 0 not useful"
        for threshold, candidate_label in SPEARMAN_GUIDANCE:
            if score >= threshold:
                label = candidate_label
                break
    return {
        "label": label,
        "interpretation": label,
        "guidance": guidance,
        "score": float(score),
    }


def build_ranker_relevance_labels(
    frame: pd.DataFrame,
    target_column: str,
    *,
    max_relevance: int = DEFAULT_RANKER_MAX_RELEVANCE,
) -> pd.Series:
    if "decision_id" not in frame.columns:
        raise ValueError("Ranking objective requires decision_id groups.")
    if max_relevance < 1:
        raise ValueError("ranker_max_relevance must be at least 1.")

    labels = pd.Series(0, index=frame.index, dtype="int32")
    for _, group in frame.groupby("decision_id", sort=False):
        values = group[target_column].astype(float)
        if len(group.index) <= 1 or values.nunique() <= 1:
            labels.loc[group.index] = 0
            continue

        dense_ranks = values.rank(method="dense", ascending=True) - 1
        max_rank = float(dense_ranks.max())
        if max_rank <= 0:
            labels.loc[group.index] = 0
            continue

        scaled = ((dense_ranks / max_rank) * max_relevance).round().astype("int32")
        labels.loc[group.index] = scaled

    return labels


def filter_rollout_decisions_by_spread(
    frame: pd.DataFrame,
    target_column: str,
    min_spread: float,
) -> tuple[pd.DataFrame, int, int]:
    if min_spread <= 0:
        return frame, 0, 0
    if "decision_id" not in frame.columns:
        raise ValueError(
            "Rollout decision spread filtering requires decision_id groups."
        )

    grouped_spread = frame.groupby("decision_id", sort=False)[target_column].agg(
        lambda values: float(values.max()) - float(values.min())
    )
    kept_decision_ids = grouped_spread[grouped_spread >= float(min_spread)].index
    filtered = frame[frame["decision_id"].isin(kept_decision_ids)].copy()
    filtered_out_decision_count = int(len(grouped_spread.index) - len(kept_decision_ids))
    filtered_out_row_count = int(len(frame.index) - len(filtered.index))
    return filtered, filtered_out_decision_count, filtered_out_row_count


def delegated_runtime_action_columns(
    *, objective: str, feature_profile: str, phase: str | None
) -> list[str]:
    normalized_phase = phase_alias(phase) if phase else None
    if (
        objective in {"rollout_regression", "rollout_ranker"}
        and feature_profile == "runtime_raw"
        and normalized_phase == "trick_play"
    ):
        return ["action_type_call_tichu"]
    return []


def filter_delegated_runtime_actions(
    frame: pd.DataFrame,
    *,
    objective: str,
    feature_profile: str,
    phase: str | None,
    include_delegated_runtime_actions: bool,
) -> tuple[pd.DataFrame, list[str], int]:
    if include_delegated_runtime_actions:
        return frame, [], 0

    delegated_columns = delegated_runtime_action_columns(
        objective=objective, feature_profile=feature_profile, phase=phase
    )
    if not delegated_columns:
        return frame, [], 0

    filtered = frame
    filtered_out_row_count = 0
    applied_columns: list[str] = []
    for column in delegated_columns:
        if column not in filtered.columns:
            continue
        before_count = int(len(filtered.index))
        filtered = filtered[filtered[column] != 1].copy()
        removed = before_count - int(len(filtered.index))
        filtered_out_row_count += removed
        if removed > 0:
            applied_columns.append(column)

    return filtered, applied_columns, filtered_out_row_count


def top1_recall_by_decision(frame: pd.DataFrame, scores: pd.Series) -> float | None:
    if "decision_id" not in frame.columns or frame.empty:
        return None
    temp = frame[["decision_id", "label"]].copy()
    temp["score"] = scores.values
    hits = 0
    total = 0
    for _, group in temp.groupby("decision_id", sort=False):
        if group.empty:
            continue
        total += 1
        best = group.sort_values(["score"], ascending=False).iloc[0]
        if int(best["label"]) == 1:
            hits += 1
    return hits / total if total > 0 else None


def ndcg_at_k(frame: pd.DataFrame, scores: pd.Series, target_column: str, k: int) -> float | None:
    if "decision_id" not in frame.columns or frame.empty:
        return None
    temp = frame[["decision_id", target_column]].copy()
    temp["score"] = scores.values
    values: list[float] = []
    for _, group in temp.groupby("decision_id", sort=False):
        if group.empty:
            continue
        predicted = group.sort_values(["score"], ascending=False).head(k)
        ideal = group.sort_values([target_column], ascending=False).head(k)
        dcg = 0.0
        idcg = 0.0
        for index, value in enumerate(predicted[target_column].tolist(), start=1):
            dcg += float(value) / math.log2(index + 1)
        for index, value in enumerate(ideal[target_column].tolist(), start=1):
            idcg += float(value) / math.log2(index + 1)
        values.append(dcg / idcg if idcg > 0 else 0.0)
    return sum(values) / len(values) if values else None


def pairwise_accuracy(frame: pd.DataFrame, scores: pd.Series, target_column: str) -> float | None:
    if "decision_id" not in frame.columns or frame.empty:
        return None
    temp = frame[["decision_id", target_column]].copy()
    temp["score"] = scores.values
    correct = 0
    total = 0
    for _, group in temp.groupby("decision_id", sort=False):
        rows = group.to_dict("records")
        for left_index, left in enumerate(rows):
            for right in rows[left_index + 1 :]:
                target_diff = float(left[target_column]) - float(right[target_column])
                if target_diff == 0:
                    continue
                score_diff = float(left["score"]) - float(right["score"])
                total += 1
                if (target_diff > 0 and score_diff > 0) or (target_diff < 0 and score_diff < 0):
                    correct += 1
    return correct / total if total > 0 else None


def top_action_average_value(frame: pd.DataFrame, scores: pd.Series, target_column: str) -> float | None:
    if "decision_id" not in frame.columns or frame.empty:
        return None
    temp = frame[["decision_id", target_column]].copy()
    temp["score"] = scores.values
    values: list[float] = []
    for _, group in temp.groupby("decision_id", sort=False):
        best = group.sort_values(["score"], ascending=False).iloc[0]
        values.append(float(best[target_column]))
    return sum(values) / len(values) if values else None


def report_markdown(report: dict[str, Any]) -> str:
    metrics = make_json_safe(report["validation_metrics"])
    target_distribution = make_json_safe(report.get("target_distribution", {}))
    baselines = make_json_safe(report.get("baseline_metrics", {}))
    model_vs_baseline = make_json_safe(report.get("model_vs_baseline", {}))
    spearman_summary = make_json_safe(report.get("spearman_interpretation", {}))
    return "\n".join(
        [
            "# Training Report",
            "",
            f"- objective: {report['objective']}",
            f"- label_mode: {report['label_mode']}",
            f"- target_column: {report['target_column']}",
            f"- row_count: {report['row_count']}",
            f"- decision_count: {report['decision_count']}",
            f"- game_count: {report['game_count']}",
            f"- split_method: {report['train_validation_split_method']}",
            f"- feature_count: {len(report['feature_columns'])}",
            "",
            "## Validation Metrics",
            "",
            *[f"- {key}: {value}" for key, value in metrics.items()],
            "",
            "## Target Distribution",
            "",
            *[f"- {key}: {value}" for key, value in target_distribution.items()],
            "",
            "## Baselines",
            "",
            *(
                [
                    f"- {name}: rmse={payload.get('validation', {}).get('rmse')}, "
                    f"mae={payload.get('validation', {}).get('mae')}"
                    for name, payload in baselines.items()
                ]
                if baselines
                else ["- none"]
            ),
            "",
            "## Model Vs Baseline",
            "",
            *[f"- {key}: {value}" for key, value in model_vs_baseline.items()],
            "",
            "## Spearman Interpretation",
            "",
            *[f"- {key}: {value}" for key, value in spearman_summary.items()],
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="ml/data/action_rows.parquet")
    parser.add_argument(
        "--output", default="ml/model_registry/lightgbm_action_model.txt"
    )
    parser.add_argument(
        "--meta-output",
        default="ml/model_registry/lightgbm_action_model.meta.json",
    )
    parser.add_argument("--phase", default="play")
    parser.add_argument("--validation-fraction", type=float, default=0.2)
    parser.add_argument("--random-state", type=int, default=7)
    parser.add_argument("--manifest-input", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--rollout-input", default=None)
    parser.add_argument(
        "--objective",
        choices=[
            "imitation_binary",
            "observed_outcome_regression",
            "rollout_regression",
            "rollout_ranker",
        ],
        default="observed_outcome_regression",
    )
    parser.add_argument("--target-column", default=None)
    parser.add_argument("--report-output", default=str(DEFAULT_REPORT_JSON))
    parser.add_argument(
        "--feature-importance-output",
        default=str(DEFAULT_FEATURE_IMPORTANCE),
    )
    parser.add_argument(
        "--feature-profile",
        choices=["runtime_raw", "full"],
        default="runtime_raw",
    )
    parser.add_argument(
        "--ranker-max-relevance",
        type=int,
        default=DEFAULT_RANKER_MAX_RELEVANCE,
    )
    parser.add_argument(
        "--min-rollout-decision-spread",
        type=float,
        default=0.0,
    )
    parser.add_argument(
        "--include-delegated-runtime-actions",
        action="store_true",
    )
    args = parser.parse_args()

    label_mode, default_target = objective_defaults(args.objective)
    target_column = args.target_column or default_target
    manifest = load_manifest(args.manifest_input)
    frame = load_frame(args.input)
    frame = merge_rollout_input(frame, args.rollout_input)
    frame = filter_phase(frame, args.phase)
    if frame.empty:
        raise ValueError("No training rows were found for the requested phase.")

    if target_column not in frame.columns:
        raise ValueError(
            f"Target column '{target_column}' is not present in the training dataset."
        )

    frame = frame[frame[target_column].notna()].copy()
    if frame.empty:
        raise ValueError(f"Target column '{target_column}' has no non-null rows after filtering.")

    frame, excluded_delegated_action_types, filtered_out_delegated_action_row_count = (
        filter_delegated_runtime_actions(
            frame,
            objective=args.objective,
            feature_profile=args.feature_profile,
            phase=args.phase,
            include_delegated_runtime_actions=args.include_delegated_runtime_actions,
        )
    )
    if frame.empty:
        raise ValueError(
            "No training rows remain after excluding delegated runtime action types."
        )

    filtered_out_decision_count = 0
    filtered_out_row_count = 0
    if args.min_rollout_decision_spread > 0:
        if args.objective not in {"rollout_regression", "rollout_ranker"}:
            raise ValueError(
                "--min-rollout-decision-spread is only supported for rollout objectives."
            )
        frame, filtered_out_decision_count, filtered_out_row_count = (
            filter_rollout_decisions_by_spread(
                frame, target_column, args.min_rollout_decision_spread
            )
        )
        if frame.empty:
            raise ValueError(
                "No rollout training rows remain after applying the decision spread filter."
            )

    feature_columns = apply_feature_profile(
        default_feature_columns(frame, manifest), args.feature_profile
    )
    if not feature_columns:
        raise ValueError(
            f"No feature columns were available for training profile '{args.feature_profile}'."
        )
    feature_frame = normalize_feature_frame(frame[feature_columns])

    excluded = excluded_columns(frame, manifest, feature_columns, target_column, args.objective)
    train_frame, validation_frame, split_method = split_frame(
        frame.assign(**feature_frame),
        args.objective,
        args.validation_fraction,
        args.random_state,
    )
    ranker_label_strategy = None
    ranker_train_labels: pd.Series | None = None
    ranker_validation_labels: pd.Series | None = None

    validation_metrics: dict[str, Any] = {}
    baseline_metrics: dict[str, Any] = {}
    total_row_count = int(len(frame.index))
    train_row_count = int(len(train_frame.index))
    validation_row_count = int(len(validation_frame.index))
    emit_training_trace(
        "lightgbm_training_start",
        {
            "objective": args.objective,
            "label_mode": label_mode,
            "row_count": total_row_count,
            "train_row_count": train_row_count,
            "validation_row_count": validation_row_count,
            "feature_count": len(feature_columns),
        },
    )
    if args.objective == "imitation_binary":
        labels = train_frame[target_column].astype(int)
        if labels.nunique() < 2:
            raise ValueError("Imitation training rows must contain both positive and negative labels.")
        model = LGBMClassifier(
            objective="binary",
            n_estimators=400,
            learning_rate=0.05,
            num_leaves=63,
            random_state=args.random_state,
            verbose=-1,
        )
        model.fit(
            train_frame[feature_columns],
            labels,
            callbacks=[
                make_training_progress_callback(
                    {
                        "objective": args.objective,
                        "label_mode": label_mode,
                        "row_count": total_row_count,
                        "train_row_count": train_row_count,
                        "validation_row_count": validation_row_count,
                        "total_iterations": 400,
                        "report_every": 25,
                    }
                )
            ],
        )
        if not validation_frame.empty and validation_frame[target_column].nunique() >= 2:
            validation_scores = pd.Series(
                model.predict_proba(validation_frame[feature_columns])[:, 1]
            )
            validation_labels = validation_frame[target_column].astype(int)
            validation_metrics = {
                "auc": float(roc_auc_score(validation_labels, validation_scores)),
                "accuracy": float(
                    accuracy_score(validation_labels, validation_scores >= 0.5)
                ),
                "top1_chosen_action_recall": top1_recall_by_decision(
                    validation_frame, validation_scores
                ),
            }
    elif args.objective == "rollout_ranker":
        ranker_label_strategy = "per_decision_dense_rank_scaled"
        ranker_train_labels = build_ranker_relevance_labels(
            train_frame,
            target_column,
            max_relevance=args.ranker_max_relevance,
        )
        ranker_validation_labels = build_ranker_relevance_labels(
            validation_frame,
            target_column,
            max_relevance=args.ranker_max_relevance,
        )
        grouped = train_frame.groupby("decision_id", sort=False)
        group_sizes = grouped.size().tolist()
        model = LGBMRanker(
            objective="lambdarank",
            n_estimators=300,
            learning_rate=0.05,
            num_leaves=63,
            random_state=args.random_state,
            verbose=-1,
        )
        model.fit(
            train_frame[feature_columns],
            ranker_train_labels,
            group=group_sizes,
            callbacks=[
                make_training_progress_callback(
                    {
                        "objective": args.objective,
                        "label_mode": label_mode,
                        "row_count": total_row_count,
                        "train_row_count": train_row_count,
                        "validation_row_count": validation_row_count,
                        "total_iterations": 300,
                        "report_every": 25,
                    }
                )
            ],
        )
        if not validation_frame.empty:
            validation_scores = pd.Series(model.predict(validation_frame[feature_columns]))
            validation_metrics = {
                "ndcg_at_1": ndcg_at_k(validation_frame, validation_scores, target_column, 1),
                "ndcg_at_3": ndcg_at_k(validation_frame, validation_scores, target_column, 3),
                "pairwise_accuracy": pairwise_accuracy(validation_frame, validation_scores, target_column),
                "top_action_average_rollout_value": top_action_average_value(
                    validation_frame, validation_scores, target_column
                ),
            }
    else:
        model = LGBMRegressor(
            objective="regression",
            n_estimators=400,
            learning_rate=0.05,
            num_leaves=63,
            random_state=args.random_state,
            verbose=-1,
        )
        model.fit(
            train_frame[feature_columns],
            train_frame[target_column].astype(float),
            callbacks=[
                make_training_progress_callback(
                    {
                        "objective": args.objective,
                        "label_mode": label_mode,
                        "row_count": total_row_count,
                        "train_row_count": train_row_count,
                        "validation_row_count": validation_row_count,
                        "total_iterations": 400,
                        "report_every": 25,
                    }
                )
            ],
        )
        if not validation_frame.empty:
            validation_scores = pd.Series(model.predict(validation_frame[feature_columns]))
            truth = validation_frame[target_column].astype(float)
            validation_metrics = {
                "rmse": float(
                    math.sqrt(mean_squared_error(truth, validation_scores))
                ),
                "mae": float(mean_absolute_error(truth, validation_scores)),
                "spearman": safe_spearman(truth, validation_scores),
            }
            baseline_metrics = regression_baselines(
                train_frame,
                validation_frame,
                target_column,
            )

    target_distribution = target_distribution_summary(frame[target_column])
    model_vs_baseline = compare_model_to_baselines(validation_metrics, baseline_metrics)
    spearman_summary = spearman_interpretation(validation_metrics.get("spearman"))

    model_path = Path(args.output)
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model.booster_.save_model(str(model_path))

    feature_importance_output = Path(args.feature_importance_output)
    feature_importance_output.parent.mkdir(parents=True, exist_ok=True)
    importance_rows = pd.DataFrame(
        {
            "feature": feature_columns,
            "importance_gain": model.booster_.feature_importance(importance_type="gain"),
            "importance_split": model.booster_.feature_importance(importance_type="split"),
        }
    ).sort_values(["importance_gain", "importance_split"], ascending=False)
    importance_rows.to_csv(feature_importance_output, index=False)

    model_id = f"lightgbm-action-model-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}"
    meta = {
        "created_at": datetime.now(UTC).isoformat(),
        "objective": args.objective,
        "label_mode": label_mode,
        "target_column": target_column,
        "feature_schema_version": manifest.get("schema_version"),
        "telemetry_schema_version": manifest.get("telemetry_schema_version"),
        "feature_columns": feature_columns,
        "feature_names": feature_columns,
        "feature_profile": args.feature_profile,
        "excluded_columns": excluded,
        "row_count": int(len(frame.index)),
        "decision_count": int(frame["decision_id"].nunique()) if "decision_id" in frame.columns else int(len(frame.index)),
        "game_count": int(frame["game_id"].nunique()) if "game_id" in frame.columns else None,
        "train_row_count": int(len(train_frame.index)),
        "validation_row_count": int(len(validation_frame.index)),
        "train_validation_split_method": split_method,
        "validation_fraction": args.validation_fraction,
        "random_state": args.random_state,
        "target_distribution": target_distribution,
        "validation_metrics": validation_metrics,
        "baseline_metrics": baseline_metrics,
        "model_vs_baseline": model_vs_baseline,
        "spearman_interpretation": spearman_summary,
        "model_type": "lightgbm_action_model",
        "phase": phase_alias(args.phase),
        "source_dataset_path": str(Path(args.input)),
        "rollout_dataset_path": str(Path(args.rollout_input)) if args.rollout_input else None,
        "ranking_label_strategy": ranker_label_strategy,
        "ranker_max_relevance": args.ranker_max_relevance if args.objective == "rollout_ranker" else None,
        "min_rollout_decision_spread": args.min_rollout_decision_spread,
        "excluded_delegated_action_types": excluded_delegated_action_types,
        "filtered_out_delegated_action_row_count": filtered_out_delegated_action_row_count,
        "filtered_out_decision_count": filtered_out_decision_count,
        "filtered_out_row_count": filtered_out_row_count,
        "model_id": model_id,
        "model_version": model_id,
    }
    meta_path = Path(args.meta_output)
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(dumps_json_safe(meta, indent=2), encoding="utf-8")

    report = {
        "created_at": meta["created_at"],
        "objective": args.objective,
        "label_mode": label_mode,
        "target_column": target_column,
        "row_count": meta["row_count"],
        "decision_count": meta["decision_count"],
        "game_count": meta["game_count"],
        "feature_columns": feature_columns,
        "feature_profile": args.feature_profile,
        "excluded_columns": excluded,
        "train_validation_split_method": split_method,
        "validation_fraction": args.validation_fraction,
        "random_state": args.random_state,
        "target_distribution": target_distribution,
        "validation_metrics": validation_metrics,
        "baseline_metrics": baseline_metrics,
        "model_vs_baseline": model_vs_baseline,
        "spearman_interpretation": spearman_summary,
        "source_dataset_path": str(Path(args.input)),
        "rollout_dataset_path": str(Path(args.rollout_input)) if args.rollout_input else None,
        "ranking_label_strategy": ranker_label_strategy,
        "ranker_max_relevance": args.ranker_max_relevance if args.objective == "rollout_ranker" else None,
        "min_rollout_decision_spread": args.min_rollout_decision_spread,
        "excluded_delegated_action_types": excluded_delegated_action_types,
        "filtered_out_delegated_action_row_count": filtered_out_delegated_action_row_count,
        "filtered_out_decision_count": filtered_out_decision_count,
        "filtered_out_row_count": filtered_out_row_count,
        "model_output_path": str(model_path),
        "meta_output_path": str(meta_path),
        "feature_importance_output_path": str(feature_importance_output),
        "model_id": model_id,
        "model_version": model_id,
    }
    report_output = Path(args.report_output)
    report_output.parent.mkdir(parents=True, exist_ok=True)
    report_output.write_text(dumps_json_safe(report, indent=2) + "\n", encoding="utf-8")
    report_output.with_suffix(".md").write_text(report_markdown(report), encoding="utf-8")
    emit_training_trace(
        "lightgbm_training_complete",
        {
            "row_count": meta["row_count"],
            "train_row_count": meta["train_row_count"],
            "validation_row_count": meta["validation_row_count"],
            "objective": args.objective,
            "model_output_path": str(model_path),
            "meta_output_path": str(meta_path),
        },
    )

    print(
        dumps_json_safe(
            {
                "accepted": True,
                "objective": args.objective,
                "target_column": target_column,
                "model": str(model_path),
                "meta": str(meta_path),
                "row_count": meta["row_count"],
                "feature_count": len(feature_columns),
                "feature_profile": args.feature_profile,
                "target_distribution": target_distribution,
                "validation_metrics": validation_metrics,
                "baseline_metrics": baseline_metrics,
                "model_vs_baseline": model_vs_baseline,
                "spearman_interpretation": spearman_summary,
            }
        )
    )


if __name__ == "__main__":
    main()
