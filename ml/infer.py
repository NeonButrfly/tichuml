from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import lightgbm as lgb
import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from feature_builder import (
    FEATURE_ORDER,
    build_feature_row,
    extract_actor_legal_actions,
)


class ModelRuntime:
    def __init__(self, model_path: str, meta_path: str | None) -> None:
        self.booster = lgb.Booster(model_file=model_path)
        self.model_metadata = self._load_meta(meta_path)
        self.feature_names = self.model_metadata.get("feature_names") or list(
            self.booster.feature_name()
        )
        if not self.feature_names:
            self.feature_names = FEATURE_ORDER

    @staticmethod
    def _load_meta(meta_path: str | None) -> dict[str, Any]:
        if not meta_path:
            return {}
        path = Path(meta_path)
        if not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8"))

    def score_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor_seat = str(payload.get("actor_seat", ""))
        phase = str(payload.get("phase", ""))
        legal_actions = extract_actor_legal_actions(payload.get("legal_actions"), actor_seat)
        state_features = payload.get("state_features")
        candidate_features = payload.get("candidate_features")
        candidate_feature_rows = (
            candidate_features if isinstance(candidate_features, list) else []
        )
        rows = []

        for index, action in enumerate(legal_actions):
            rows.append(
                build_feature_row(
                    payload.get("state_raw"),
                    phase,
                    actor_seat,
                    action,
                    state_features=state_features if isinstance(state_features, dict) else None,
                    candidate_features=(
                        candidate_feature_rows[index]
                        if index < len(candidate_feature_rows)
                        and isinstance(candidate_feature_rows[index], dict)
                        else None
                    ),
                )
            )

        frame = pd.DataFrame(rows)
        runtime_feature_count = len(frame.columns)
        missing_feature_count = 0
        for feature_name in self.feature_names:
            if feature_name not in frame.columns:
                frame[feature_name] = 0.0
                missing_feature_count += 1
        scores = self.booster.predict(frame[self.feature_names]) if len(frame.index) > 0 else []
        return {
            "scores": [float(score) for score in scores],
            "model_metadata": self.model_metadata,
            "runtime_metadata": {
                "runtime_feature_count": int(runtime_feature_count),
                "missing_feature_count": int(missing_feature_count),
                "model_feature_count": int(len(self.feature_names)),
            },
        }


def emit_response(request_id: str | None, payload: dict[str, Any]) -> None:
    response = payload if request_id is None else {"id": request_id, **payload}
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()


def serve(runtime: ModelRuntime) -> None:
    for line in sys.stdin:
        text = line.strip()
        if not text:
            continue
        request = json.loads(text)
        request_id = request.get("id")
        try:
            response = runtime.score_request(request)
            emit_response(str(request_id) if request_id is not None else None, response)
        except Exception as error:  # pragma: no cover
            emit_response(
                str(request_id) if request_id is not None else None,
                {"error": str(error)},
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="ml/model_registry/lightgbm_action_model.txt")
    parser.add_argument(
        "--meta",
        default="ml/model_registry/lightgbm_action_model.meta.json",
    )
    parser.add_argument("--serve", action="store_true")
    args = parser.parse_args()

    runtime = ModelRuntime(str(Path(args.model).resolve()), str(Path(args.meta).resolve()))
    if args.serve:
        serve(runtime)
        return

    request = json.load(sys.stdin)
    emit_response(None, runtime.score_request(request))


if __name__ == "__main__":
    main()
