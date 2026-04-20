from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from feature_builder import FEATURE_ORDER, phase_alias, write_feature_schema


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
    parser.add_argument("--schema-output", default="ml/feature_schema.json")
    args = parser.parse_args()

    frame = pd.read_parquet(args.input)
    phase = phase_alias(args.phase)
    if "phase" in frame.columns:
        frame = frame[frame["phase"] == phase]
    if frame.empty:
        raise ValueError("No training rows were found for the requested phase.")

    feature_columns = [column for column in FEATURE_ORDER if column in frame.columns]
    labels = frame["label"].astype(int)
    if labels.nunique() < 2:
        raise ValueError("Training rows must contain both positive and negative labels.")

    decision_ids = (
        frame["decision_id"].drop_duplicates().tolist()
        if "decision_id" in frame.columns
        else list(range(len(frame.index)))
    )
    validation_auc: float | None = None
    if len(decision_ids) >= 2 and args.validation_fraction > 0:
        train_ids, validation_ids = train_test_split(
            decision_ids,
            test_size=args.validation_fraction,
            random_state=args.random_state,
            shuffle=True,
        )
        train_frame = frame[frame["decision_id"].isin(train_ids)]
        validation_frame = frame[frame["decision_id"].isin(validation_ids)]
    else:
        train_frame = frame
        validation_frame = frame.iloc[0:0]

    model = LGBMClassifier(
        objective="binary",
        n_estimators=300,
        learning_rate=0.05,
        num_leaves=63,
        subsample=1.0,
        colsample_bytree=1.0,
        random_state=args.random_state,
        verbose=-1,
    )
    model.fit(train_frame[feature_columns], train_frame["label"].astype(int))

    if not validation_frame.empty and validation_frame["label"].nunique() >= 2:
        validation_scores = model.predict_proba(validation_frame[feature_columns])[:, 1]
        validation_auc = float(
            roc_auc_score(validation_frame["label"].astype(int), validation_scores)
        )

    model_path = Path(args.output)
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model.booster_.save_model(str(model_path))

    meta = {
        "created_at": datetime.now(UTC).isoformat(),
        "feature_names": feature_columns,
        "feature_count": len(feature_columns),
        "row_count": int(len(frame.index)),
        "train_row_count": int(len(train_frame.index)),
        "validation_row_count": int(len(validation_frame.index)),
        "positive_rows": int(labels.sum()),
        "negative_rows": int(len(frame.index) - labels.sum()),
        "validation_auc": validation_auc,
        "model_type": "lightgbm_action_model",
        "phase": phase,
    }
    meta_path = Path(args.meta_output)
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    write_feature_schema(args.schema_output)
    print(
        json.dumps(
            {
                "accepted": True,
                "model": str(model_path),
                "meta": str(meta_path),
                "row_count": meta["row_count"],
                "feature_count": meta["feature_count"],
                "validation_auc": validation_auc,
                "phase": phase,
            }
        )
    )


if __name__ == "__main__":
    main()
