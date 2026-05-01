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

DEFAULT_MANIFEST = Path("artifacts/ml/export-manifest.json")
DEFAULT_REPORT_JSON = Path("artifacts/ml/training-report.json")
DEFAULT_FEATURE_IMPORTANCE = Path("artifacts/ml/feature-importance.csv")


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
    return frame.merge(
        rollout_frame[join_keys + rollout_columns],
        on=join_keys,
        how="left",
        suffixes=("", "_rollout"),
    )


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
    metrics = report["validation_metrics"]
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
        default="imitation_binary",
    )
    parser.add_argument("--target-column", default=None)
    parser.add_argument("--report-output", default=str(DEFAULT_REPORT_JSON))
    parser.add_argument(
        "--feature-importance-output",
        default=str(DEFAULT_FEATURE_IMPORTANCE),
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

    feature_columns = default_feature_columns(frame, manifest)
    if not feature_columns:
        raise ValueError("No runtime-safe feature columns were available for training.")

    excluded = excluded_columns(frame, manifest, feature_columns, target_column, args.objective)
    train_frame, validation_frame, split_method = split_frame(
        frame,
        args.objective,
        args.validation_fraction,
        args.random_state,
    )

    validation_metrics: dict[str, Any] = {}
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
        model.fit(train_frame[feature_columns], labels)
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
        if "decision_id" not in train_frame.columns:
            raise ValueError("Ranking objective requires decision_id groups.")
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
            train_frame[target_column].astype(float),
            group=group_sizes,
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
        )
        if not validation_frame.empty:
            validation_scores = pd.Series(model.predict(validation_frame[feature_columns]))
            truth = validation_frame[target_column].astype(float)
            validation_metrics = {
                "rmse": float(
                    math.sqrt(mean_squared_error(truth, validation_scores))
                ),
                "mae": float(mean_absolute_error(truth, validation_scores)),
                "spearman": float(pd.Series(truth).corr(validation_scores, method="spearman"))
                if len(validation_scores.index) > 1
                else None,
            }

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
        "excluded_columns": excluded,
        "row_count": int(len(frame.index)),
        "decision_count": int(frame["decision_id"].nunique()) if "decision_id" in frame.columns else int(len(frame.index)),
        "game_count": int(frame["game_id"].nunique()) if "game_id" in frame.columns else None,
        "train_row_count": int(len(train_frame.index)),
        "validation_row_count": int(len(validation_frame.index)),
        "train_validation_split_method": split_method,
        "validation_metrics": validation_metrics,
        "model_type": "lightgbm_action_model",
        "phase": phase_alias(args.phase),
        "source_dataset_path": str(Path(args.input)),
        "rollout_dataset_path": str(Path(args.rollout_input)) if args.rollout_input else None,
        "model_id": model_id,
        "model_version": model_id,
    }
    meta_path = Path(args.meta_output)
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    report = {
        "created_at": meta["created_at"],
        "objective": args.objective,
        "label_mode": label_mode,
        "target_column": target_column,
        "row_count": meta["row_count"],
        "decision_count": meta["decision_count"],
        "game_count": meta["game_count"],
        "feature_columns": feature_columns,
        "excluded_columns": excluded,
        "train_validation_split_method": split_method,
        "validation_metrics": validation_metrics,
        "source_dataset_path": str(Path(args.input)),
        "rollout_dataset_path": str(Path(args.rollout_input)) if args.rollout_input else None,
        "model_output_path": str(model_path),
        "meta_output_path": str(meta_path),
        "feature_importance_output_path": str(feature_importance_output),
        "model_id": model_id,
        "model_version": model_id,
    }
    report_output = Path(args.report_output)
    report_output.parent.mkdir(parents=True, exist_ok=True)
    report_output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    report_output.with_suffix(".md").write_text(report_markdown(report), encoding="utf-8")

    print(
        json.dumps(
            {
                "accepted": True,
                "objective": args.objective,
                "target_column": target_column,
                "model": str(model_path),
                "meta": str(meta_path),
                "row_count": meta["row_count"],
                "feature_count": len(feature_columns),
                "validation_metrics": validation_metrics,
            }
        )
    )


if __name__ == "__main__":
    main()
