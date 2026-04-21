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
    phase_alias,
    write_feature_schema,
)


def default_database_url() -> str:
    return os.environ.get(
        "DATABASE_URL",
        "postgres://tichu:tichu_dev_password@localhost:54329/tichu",
    )


def resolve_phase_filter(phase: str | None) -> str | None:
    if phase is None or phase.strip() == "":
        return None
    return phase_alias(phase.strip())


def build_query(phase: str | None, provider: str | None, limit: int | None) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []

    if phase:
        clauses.append("phase = %s")
        params.append(phase)

    if provider:
        clauses.append("policy_source = %s")
        params.append(provider)

    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    limit_clause = "LIMIT %s" if isinstance(limit, int) and limit > 0 else ""
    if limit_clause:
        params.append(limit)

    query = f"""
        SELECT
            id,
            ts,
            game_id,
            hand_id,
            phase,
            actor_seat,
            decision_index,
            policy_source,
            provider_used,
            requested_provider,
            fallback_used,
            legal_action_count,
            chosen_action_is_legal,
            has_explanation,
            has_candidate_scores,
            has_state_features,
            explanation_quality_level,
            chosen_action_type,
            state_hash,
            legal_actions_hash,
            chosen_action_hash,
            state_raw,
            state_norm,
            legal_actions,
            chosen_action,
            explanation,
            candidate_scores,
            state_features,
            metadata
        FROM decisions
        {where_clause}
        ORDER BY ts ASC, id ASC
        {limit_clause}
    """
    return query, params


def read_decisions(
    database_url: str,
    *,
    phase: str | None,
    provider: str | None,
    limit: int | None,
) -> list[dict[str, Any]]:
    query, params = build_query(phase, provider, limit)
    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            return list(cursor.fetchall())


def extract_explanation_metadata(decision: dict[str, Any]) -> dict[str, Any]:
    explanation = decision.get("explanation")
    if isinstance(explanation, dict):
        return explanation

    metadata = decision.get("metadata")
    if not isinstance(metadata, dict):
        return {}

    explanation = metadata.get("explanation")
    if isinstance(explanation, dict):
        return explanation

    policy_explanation = metadata.get("policy_explanation")
    if isinstance(policy_explanation, dict):
        return policy_explanation

    return {}


def build_candidate_feature_map(
    explanation: dict[str, Any],
    decision: dict[str, Any]
) -> tuple[dict[str, Any], dict[tuple[Any, ...], dict[str, Any]]]:
    state_features = decision.get("state_features")
    if not isinstance(state_features, dict):
        state_features = explanation.get("stateFeatures")

    candidate_scores = decision.get("candidate_scores")
    if not isinstance(candidate_scores, list):
        candidate_scores = explanation.get("candidateScores")
    feature_map: dict[tuple[Any, ...], dict[str, Any]] = {}

    if not isinstance(candidate_scores, list):
        return (
            state_features if isinstance(state_features, dict) else {},
            feature_map,
        )

    for candidate in candidate_scores:
        if not isinstance(candidate, dict):
            continue
        action = candidate.get("action")
        features = candidate.get("features")
        if not isinstance(action, dict) or not isinstance(features, dict):
            continue
        feature_map[action_signature(action)] = features

    return (
        state_features if isinstance(state_features, dict) else {},
        feature_map,
    )


def build_rows(decisions: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    rows: list[dict[str, Any]] = []
    malformed_decisions = 0

    for decision in decisions:
        actor_seat = str(decision.get("actor_seat", ""))
        phase = str(decision.get("phase", ""))
        legal_actions = extract_actor_legal_actions(
            decision.get("legal_actions"),
            actor_seat,
        )
        if decision.get("chosen_action_is_legal") is False or not legal_actions:
            malformed_decisions += 1
            continue

        chosen_signature = action_signature(decision.get("chosen_action", {}))
        explanation = extract_explanation_metadata(decision)
        state_features, candidate_feature_map = build_candidate_feature_map(
            explanation,
            decision,
        )

        for index, legal_action in enumerate(legal_actions):
            candidate_features = candidate_feature_map.get(action_signature(legal_action))
            features = build_feature_row(
                decision.get("state_raw"),
                phase,
                actor_seat,
                legal_action,
                state_features=state_features,
                candidate_features=candidate_features,
            )
            row = {
                "decision_id": int(decision.get("id", 0)),
                "ts": str(decision.get("ts", "")),
                "game_id": str(decision.get("game_id", "")),
                "hand_id": str(decision.get("hand_id", "")),
                "phase": phase,
                "actor_seat": actor_seat,
                "policy_source": str(
                    decision.get("provider_used") or decision.get("policy_source", "")
                ),
                "requested_provider": str(decision.get("requested_provider", "")),
                "fallback_used": bool(decision.get("fallback_used", False)),
                "chosen_action_type": str(decision.get("chosen_action_type", "")),
                "state_hash": str(decision.get("state_hash", "")),
                "legal_actions_hash": str(decision.get("legal_actions_hash", "")),
                "chosen_action_hash": str(decision.get("chosen_action_hash", "")),
                "decision_index": int(decision.get("decision_index", 0)),
                "action_index": index,
                "action_key": json.dumps(action_signature(legal_action)),
                "label": 1 if action_signature(legal_action) == chosen_signature else 0,
            }
            row.update({feature_name: features.get(feature_name, 0.0) for feature_name in FEATURE_ORDER})
            rows.append(row)

    return rows, malformed_decisions


def summarize_decisions(
    decisions: list[dict[str, Any]],
    rows_written: int,
    malformed_decisions: int,
) -> dict[str, Any]:
    def has_column_flag(decision: dict[str, Any], flag: str, fallback_key: str) -> bool:
        if isinstance(decision.get(flag), bool):
            return bool(decision[flag])
        value = decision.get(fallback_key)
        return value is not None

    return {
        "decisions_read": len(decisions),
        "rows_written": rows_written,
        "rows_with_explanation": sum(
            1 for decision in decisions if has_column_flag(decision, "has_explanation", "explanation")
        ),
        "rows_with_candidateScores": sum(
            1
            for decision in decisions
            if has_column_flag(decision, "has_candidate_scores", "candidate_scores")
        ),
        "rows_with_stateFeatures": sum(
            1
            for decision in decisions
            if has_column_flag(decision, "has_state_features", "state_features")
        ),
        "rows_with_chosen_action_is_legal_true": sum(
            1
            for decision in decisions
            if decision.get("chosen_action_is_legal") is not False
        ),
        "rows_filtered_or_rejected_malformed": malformed_decisions,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=default_database_url())
    parser.add_argument("--phase", default="play")
    parser.add_argument("--provider", default=None)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--output", default=str(Path("ml/data/action_rows.parquet")))
    parser.add_argument(
        "--schema-output",
        default=str(Path("ml/feature_schema.json")),
    )
    parser.add_argument(
        "--diagnostics",
        action="store_true",
        help="Print telemetry training-readiness counts with the export summary.",
    )
    args = parser.parse_args()

    phase = resolve_phase_filter(args.phase)
    decisions = read_decisions(
        args.database_url,
        phase=phase,
        provider=args.provider,
        limit=args.limit,
    )
    rows, malformed_decisions = build_rows(decisions)
    frame = pd.DataFrame(rows)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(output_path, index=False)
    write_feature_schema(args.schema_output)
    diagnostics = summarize_decisions(
        decisions,
        int(len(frame.index)),
        malformed_decisions,
    )
    print(
        json.dumps(
            {
                "accepted": True,
                "rows": int(len(frame.index)),
                "decisions": len(decisions),
                **diagnostics,
                "phase": phase,
                "provider": args.provider,
                "output": str(output_path),
                "feature_schema": str(Path(args.schema_output)),
                "diagnostics_enabled": bool(args.diagnostics),
            }
        )
    )


if __name__ == "__main__":
    main()
