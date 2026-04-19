from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, UTC
from pathlib import Path

import pandas as pd
from lightgbm import LGBMClassifier

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from feature_builder import FEATURE_ORDER


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="ml/data/action_rows.parquet")
    parser.add_argument(
        "--model-output", default="ml/model_registry/lightgbm_action_model.txt"
    )
    parser.add_argument(
        "--meta-output",
        default="ml/model_registry/lightgbm_action_model.meta.json",
    )
    args = parser.parse_args()

    frame = pd.read_parquet(args.input)
    if frame.empty:
        raise ValueError("No training rows were found. Export telemetry first.")

    feature_columns = [column for column in FEATURE_ORDER if column in frame.columns]
    labels = frame["label"].astype(int)

    model = LGBMClassifier(
        objective="binary",
        n_estimators=200,
        learning_rate=0.05,
        num_leaves=31,
        subsample=1.0,
        colsample_bytree=1.0,
        random_state=7,
        verbose=-1,
    )
    model.fit(frame[feature_columns], labels)

    model_path = Path(args.model_output)
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model.booster_.save_model(str(model_path))

    meta = {
        "created_at": datetime.now(UTC).isoformat(),
        "feature_names": feature_columns,
        "row_count": int(len(frame.index)),
        "positive_rows": int(labels.sum()),
        "negative_rows": int(len(frame.index) - labels.sum()),
        "train_score": float(model.score(frame[feature_columns], labels)),
        "model_type": "lightgbm_action_model",
    }
    meta_path = Path(args.meta_output)
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps({"accepted": True, "model": str(model_path), "meta": str(meta_path)}))


if __name__ == "__main__":
    main()
