from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import pandas as pd
import psycopg
from psycopg.rows import dict_row

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from feature_builder import (
    FEATURE_ORDER,
    action_signature,
    build_feature_row,
    extract_actor_legal_actions,
)


def default_database_url() -> str:
    return os.environ.get(
        "DATABASE_URL",
        "postgres://tichu:tichu_dev_password@localhost:54329/tichu",
    )


def read_decisions(database_url: str) -> list[dict[str, Any]]:
    query = """
        SELECT
            id,
            game_id,
            hand_id,
            phase,
            actor_seat,
            state_raw,
            legal_actions,
            chosen_action
        FROM decisions
        ORDER BY ts ASC, id ASC
    """
    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(query)
            return list(cursor.fetchall())


def build_rows(decisions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for decision in decisions:
        actor_seat = str(decision.get("actor_seat", ""))
        legal_actions = extract_actor_legal_actions(
            decision.get("legal_actions"),
            actor_seat,
        )
        chosen_signature = action_signature(decision.get("chosen_action", {}))

        for index, legal_action in enumerate(legal_actions):
            features = build_feature_row(
                decision.get("state_raw"),
                str(decision.get("phase", "")),
                actor_seat,
                legal_action,
            )
            row = {
                "decision_id": int(decision.get("id", 0)),
                "game_id": str(decision.get("game_id", "")),
                "hand_id": str(decision.get("hand_id", "")),
                "phase": str(decision.get("phase", "")),
                "actor_seat": actor_seat,
                "action_index": index,
                "action_key": json.dumps(action_signature(legal_action)),
                "label": 1 if action_signature(legal_action) == chosen_signature else 0,
            }
            row.update({feature_name: features.get(feature_name, 0.0) for feature_name in FEATURE_ORDER})
            rows.append(row)

    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=default_database_url())
    parser.add_argument(
        "--output",
        default=str(Path("ml/data/action_rows.parquet")),
    )
    args = parser.parse_args()

    decisions = read_decisions(args.database_url)
    rows = build_rows(decisions)
    frame = pd.DataFrame(rows)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(output_path, index=False)
    print(
        json.dumps(
            {
                "accepted": True,
                "rows": len(frame.index),
                "output": str(output_path),
            }
        )
    )


if __name__ == "__main__":
    main()
