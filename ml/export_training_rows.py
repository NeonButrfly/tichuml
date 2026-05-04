from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import sys
import tracemalloc
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable

import pandas as pd
import psycopg
import pyarrow as pa
import pyarrow.parquet as pq
from psycopg.rows import dict_row

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from feature_builder import (
    FEATURE_ORDER,
    action_signature,
    build_feature_row,
    extract_actor_legal_actions,
    get_left_opponent_seat,
    get_partner_seat,
    get_right_opponent_seat,
    phase_alias,
    write_feature_schema,
)

SCHEMA_VERSION = 2
DEFAULT_OUTPUT = Path("ml/data/action_rows.parquet")
DEFAULT_SCHEMA_OUTPUT = Path("ml/data/action_rows.schema.json")
DEFAULT_QUALITY_OUTPUT = Path("ml/data/action_rows.quality.json")
DEFAULT_MANIFEST_OUTPUT = Path("artifacts/ml/export-manifest.json")
DEFAULT_FEATURE_SCHEMA_OUTPUT = Path("ml/feature_schema.json")
DEFAULT_FEATURE_COLUMNS_OUTPUT = Path("artifacts/ml/feature-columns.json")
DEFAULT_LABEL_COLUMNS_OUTPUT = Path("artifacts/ml/label-columns.json")
DEFAULT_LOCAL_TRAINING_DATABASE_URL = (
    "postgres://tichu:tichu_dev_password@127.0.0.1:54329/tichu"
)
ROLLOUT_COLUMNS = [
    "rollout_available",
    "rollout_samples",
    "rollout_failures",
    "rollout_mean_actor_team_delta",
    "rollout_median_actor_team_delta",
    "rollout_std_actor_team_delta",
    "rollout_win_rate",
    "rollout_hand_win_rate",
    "rollout_tichu_success_rate",
    "rollout_grand_tichu_success_rate",
    "rollout_mean_finish_rank_actor",
    "rollout_mean_finish_rank_partner",
    "rollout_continuation_provider",
    "rollout_seed",
    "rollout_engine_version",
    "rollout_failure_reason",
]
OBSERVED_OUTCOME_COLUMNS = [
    "observed_outcome_available",
    "observed_hand_outcome_available",
    "observed_match_outcome_available",
    "observed_actor_team_hand_score",
    "observed_opponent_team_hand_score",
    "observed_actor_team_hand_delta",
    "observed_actor_team_won_hand",
    "observed_actor_finish_rank",
    "observed_partner_finish_rank",
    "observed_finish_order",
    "observed_double_victory_team",
    "observed_double_victory_for_actor_team",
    "observed_tichu_bonus_actor_team",
    "observed_tichu_bonus_opponent_team",
    "observed_tichu_success_actor",
    "observed_grand_tichu_success_actor",
    "observed_actor_team_final_score",
    "observed_opponent_team_final_score",
    "observed_actor_team_final_delta",
    "observed_actor_team_won_match",
    "observed_final_winner_team",
    "observed_final_team_0_score",
    "observed_final_team_1_score",
    "missing_outcome_reason",
]
IDENTITY_COLUMNS = [
    "decision_id",
    "game_id",
    "hand_id",
    "phase",
    "actor_seat",
    "actor_team",
    "opponent_team",
    "decision_index",
    "event_index",
    "candidate_action_index",
    "candidate_action_type",
    "candidate_action_key",
    "candidate_action_canonical_json",
    "candidate_was_chosen",
    "label",
]
CONTEXT_COLUMNS = [
    "provider_used",
    "requested_provider",
    "policy_source",
    "policy_name",
    "fallback_used",
    "chosen_action_is_legal",
    "legal_action_count",
    "state_hash",
    "legal_actions_hash",
    "chosen_action_hash",
    "schema_version",
    "engine_version",
    "sim_version",
]
EXPORT_ALIAS_FEATURE_COLUMNS = [
    "actor_hand_count",
    "partner_hand_count",
    "left_opponent_hand_count",
    "right_opponent_hand_count",
    "actor_team_score",
    "opponent_team_score",
    "score_delta",
    "current_phase",
    "current_trick_size",
    "current_top_combo_type",
    "current_top_combo_rank",
    "current_winner_relation",
    "active_seat_relation",
    "wish_active",
    "wished_rank",
    "candidate_satisfies_wish",
    "opponents_called_tichu_count",
    "opponents_called_grand_tichu_count",
    "candidate_card_count",
    "candidate_combo_type",
    "candidate_rank_strength",
    "candidate_uses_bomb",
    "candidate_uses_dragon",
    "candidate_uses_phoenix",
    "candidate_uses_dog",
    "candidate_uses_mahjong",
    "candidate_action_semantics",
]
LEAKAGE_EXCLUDED_COLUMNS = [
    "ts",
    "decision_id",
    "game_id",
    "hand_id",
    "event_index",
    "candidate_action_key",
    "candidate_action_canonical_json",
    "candidate_was_chosen",
    "label",
    "provider_used",
    "requested_provider",
    "policy_source",
    "policy_name",
    "state_hash",
    "legal_actions_hash",
    "chosen_action_hash",
    "chosen_action_is_legal",
    *OBSERVED_OUTCOME_COLUMNS,
    *ROLLOUT_COLUMNS,
]
NULLABLE_INT_COLUMNS = {
    "decision_id",
    "decision_index",
    "event_index",
    "candidate_action_index",
    "label",
    "legal_action_count",
    "schema_version",
    "rollout_samples",
    "rollout_failures",
}
NULLABLE_BOOL_COLUMNS = {
    "candidate_was_chosen",
    "fallback_used",
    "chosen_action_is_legal",
    "wish_active",
    "candidate_satisfies_wish",
    "candidate_uses_bomb",
    "candidate_uses_dragon",
    "candidate_uses_phoenix",
    "candidate_uses_dog",
    "candidate_uses_mahjong",
    "observed_outcome_available",
    "observed_hand_outcome_available",
    "observed_match_outcome_available",
    "observed_actor_team_won_hand",
    "observed_double_victory_for_actor_team",
    "observed_tichu_success_actor",
    "observed_grand_tichu_success_actor",
    "observed_actor_team_won_match",
    "rollout_available",
}
STRING_COLUMNS = {
    "ts",
    "game_id",
    "hand_id",
    "phase",
    "actor_seat",
    "actor_team",
    "opponent_team",
    "candidate_action_type",
    "candidate_action_key",
    "candidate_action_canonical_json",
    "provider_used",
    "requested_provider",
    "policy_source",
    "policy_name",
    "state_hash",
    "legal_actions_hash",
    "chosen_action_hash",
    "engine_version",
    "sim_version",
    "current_phase",
    "current_top_combo_type",
    "current_winner_relation",
    "active_seat_relation",
    "candidate_combo_type",
    "candidate_action_semantics",
    "observed_finish_order",
    "observed_double_victory_team",
    "observed_final_winner_team",
    "missing_outcome_reason",
    "rollout_continuation_provider",
    "rollout_seed",
    "rollout_engine_version",
    "rollout_failure_reason",
}


def default_database_url() -> str:
    return (
        os.environ.get("TRAINING_DATABASE_URL")
        or os.environ.get("TICHU_TRAINING_DATABASE_URL")
        or os.environ.get("DATABASE_URL")
        or DEFAULT_LOCAL_TRAINING_DATABASE_URL
    )


def resolve_database_url_candidates(explicit_url: str | None) -> list[tuple[str, str]]:
    candidates: list[tuple[str, str]] = []
    seen: set[str] = set()

    def add_candidate(url: str | None, source: str) -> None:
        normalized = (url or "").strip()
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        candidates.append((normalized, source))

    add_candidate(explicit_url, "explicit")
    add_candidate(os.environ.get("TRAINING_DATABASE_URL"), "env:TRAINING_DATABASE_URL")
    add_candidate(
        os.environ.get("TICHU_TRAINING_DATABASE_URL"),
        "env:TICHU_TRAINING_DATABASE_URL",
    )
    add_candidate(os.environ.get("DATABASE_URL"), "env:DATABASE_URL")
    add_candidate(DEFAULT_LOCAL_TRAINING_DATABASE_URL, "default_local_training_db")
    return candidates


def connect_with_fallback(
    explicit_url: str | None,
) -> tuple[psycopg.Connection[Any], str, str, bool]:
    attempts: list[str] = []
    candidates = resolve_database_url_candidates(explicit_url)
    last_error: Exception | None = None

    for index, (candidate, source) in enumerate(candidates):
        try:
            connection = psycopg.connect(candidate, row_factory=dict_row)
            fallback_used = index > 0
            if fallback_used:
                print(
                    json.dumps(
                        {
                            "accepted": True,
                            "warning": "database_url_fallback_used",
                            "database_url_source": source,
                        }
                    ),
                    file=sys.stderr,
                )
            return connection, candidate, source, fallback_used
        except psycopg.OperationalError as error:
            last_error = error
            attempts.append(f"{source}: {error}")

    if last_error is not None:
        raise psycopg.OperationalError(
            "Unable to connect to Postgres for ml:export. Attempts: "
            + " | ".join(attempts)
        ) from last_error
    raise psycopg.OperationalError("No Postgres connection candidates were available.")


def resolve_phase_filter(phase: str | None) -> str | None:
    if phase is None or phase.strip() == "":
        return None
    return phase_alias(phase.strip())


def truthy(value: str | None) -> bool:
    return value is not None and value.strip().lower() in {"1", "true", "yes", "on"}


def escape_like_prefix(prefix: str) -> str:
    return prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def team_for_seat(seat: str) -> str:
    return "team-0" if seat in {"seat-0", "seat-2"} else "team-1"


def opponent_team_for_seat(seat: str) -> str:
    return "team-1" if team_for_seat(seat) == "team-0" else "team-0"


def is_player_actor_seat(seat: str) -> bool:
    return seat in {"seat-0", "seat-1", "seat-2", "seat-3"}


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def safe_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def safe_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def safe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def safe_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)):
        return float(value)
    return None


def relation_for_seat(reference_seat: str, candidate_seat: str | None) -> str:
    if not candidate_seat:
        return "none"
    if candidate_seat == reference_seat:
        return "self"
    if candidate_seat == get_partner_seat(reference_seat):
        return "partner"
    if candidate_seat == get_left_opponent_seat(reference_seat):
        return "left_opponent"
    if candidate_seat == get_right_opponent_seat(reference_seat):
        return "right_opponent"
    return "none"


def read_team_scores(container: dict[str, Any] | None) -> tuple[float | None, float | None]:
    payload = safe_dict(container)
    return safe_float(payload.get("team-0")), safe_float(payload.get("team-1"))


def read_bonus_sum(bonuses: list[Any], team: str) -> float:
    total = 0.0
    for bonus in bonuses:
        bonus_dict = safe_dict(bonus)
        if bonus_dict.get("team") == team:
            amount = safe_float(bonus_dict.get("amount"))
            total += amount if amount is not None else 0.0
    return total


def read_seat_bonus_success(
    bonuses: list[Any], seat: str, label: str
) -> bool | None:
    matching = [
        safe_dict(bonus)
        for bonus in bonuses
        if safe_dict(bonus).get("seat") == seat and safe_dict(bonus).get("label") == label
    ]
    if not matching:
        return None
    return any((safe_float(bonus.get("amount")) or 0.0) > 0 for bonus in matching)


def derive_hand_outcome_from_state(state_norm: Any) -> dict[str, Any]:
    state = safe_dict(state_norm)
    round_summary = safe_dict(state.get("roundSummary"))
    if not round_summary:
        return {
            "observed_hand_outcome_available": False,
            "missing_outcome_reason": "no_round_summary",
        }

    team_scores = safe_dict(round_summary.get("teamScores"))
    finish_order = [str(entry) for entry in safe_list(round_summary.get("finishOrder"))]
    double_victory = round_summary.get("doubleVictory")
    tichu_bonuses = safe_list(round_summary.get("tichuBonuses"))
    return {
        "observed_hand_outcome_available": True,
        "hand_team_scores": team_scores,
        "finish_order": finish_order,
        "double_victory_team": double_victory if isinstance(double_victory, str) else None,
        "tichu_bonuses": tichu_bonuses,
        "missing_outcome_reason": None,
    }


def derive_match_outcome_from_state(
    state_norm: Any, match_row: dict[str, Any] | None
) -> dict[str, Any]:
    state = safe_dict(state_norm)
    match_payload = safe_dict(match_row)
    team_scores = safe_dict(state.get("matchScore"))
    match_complete = bool(state.get("matchComplete")) if "matchComplete" in state else None
    match_winner = state.get("matchWinner") if isinstance(state.get("matchWinner"), str) else None

    final_team_0_score = safe_float(match_payload.get("final_team_0_score"))
    final_team_1_score = safe_float(match_payload.get("final_team_1_score"))
    if final_team_0_score is None or final_team_1_score is None:
        final_team_0_score = safe_float(team_scores.get("team-0"))
        final_team_1_score = safe_float(team_scores.get("team-1"))

    winner_team = match_payload.get("winner_team") if isinstance(match_payload.get("winner_team"), str) else match_winner
    status = match_payload.get("status")
    completed = bool(match_complete) or status == "completed" or winner_team is not None
    return {
        "observed_match_outcome_available": completed and final_team_0_score is not None and final_team_1_score is not None,
        "final_team_0_score": final_team_0_score,
        "final_team_1_score": final_team_1_score,
        "final_winner_team": winner_team if completed else None,
        "match_complete": completed,
    }


def observed_outcomes_for_actor(
    actor_seat: str,
    hand_outcome: dict[str, Any],
    match_outcome: dict[str, Any],
) -> dict[str, Any]:
    actor_team = team_for_seat(actor_seat)
    opponent_team = opponent_team_for_seat(actor_seat)
    actor_team_hand_score = None
    opponent_team_hand_score = None
    actor_team_hand_delta = None
    actor_finish_rank = None
    partner_finish_rank = None
    finish_order = hand_outcome.get("finish_order")
    if hand_outcome.get("observed_hand_outcome_available"):
        team_scores = safe_dict(hand_outcome.get("hand_team_scores"))
        actor_team_hand_score = safe_float(team_scores.get(actor_team))
        opponent_team_hand_score = safe_float(team_scores.get(opponent_team))
        if actor_team_hand_score is not None and opponent_team_hand_score is not None:
            actor_team_hand_delta = actor_team_hand_score - opponent_team_hand_score
        if isinstance(finish_order, list):
            try:
                actor_finish_rank = finish_order.index(actor_seat) + 1
            except ValueError:
                actor_finish_rank = None
            partner = get_partner_seat(actor_seat)
            try:
                partner_finish_rank = finish_order.index(partner) + 1
            except ValueError:
                partner_finish_rank = None

    bonuses = safe_list(hand_outcome.get("tichu_bonuses"))
    actor_team_final_score = None
    opponent_team_final_score = None
    actor_team_final_delta = None
    if match_outcome.get("final_team_0_score") is not None and match_outcome.get("final_team_1_score") is not None:
        team0 = float(match_outcome["final_team_0_score"])
        team1 = float(match_outcome["final_team_1_score"])
        actor_team_final_score = team0 if actor_team == "team-0" else team1
        opponent_team_final_score = team1 if actor_team == "team-0" else team0
        actor_team_final_delta = actor_team_final_score - opponent_team_final_score

    missing_reason = hand_outcome.get("missing_outcome_reason")
    if not hand_outcome.get("observed_hand_outcome_available") and not match_outcome.get("observed_match_outcome_available"):
        missing_reason = missing_reason or "no_hand_or_match_outcome"
    elif not hand_outcome.get("observed_hand_outcome_available"):
        missing_reason = missing_reason or "no_hand_outcome"
    elif not match_outcome.get("observed_match_outcome_available"):
        missing_reason = "no_match_outcome"
    else:
        missing_reason = None

    return {
        "observed_outcome_available": bool(
            hand_outcome.get("observed_hand_outcome_available")
            or match_outcome.get("observed_match_outcome_available")
        ),
        "observed_hand_outcome_available": bool(hand_outcome.get("observed_hand_outcome_available")),
        "observed_match_outcome_available": bool(match_outcome.get("observed_match_outcome_available")),
        "observed_actor_team_hand_score": actor_team_hand_score,
        "observed_opponent_team_hand_score": opponent_team_hand_score,
        "observed_actor_team_hand_delta": actor_team_hand_delta,
        "observed_actor_team_won_hand": (
            actor_team_hand_delta > 0 if actor_team_hand_delta is not None else None
        ),
        "observed_actor_finish_rank": actor_finish_rank,
        "observed_partner_finish_rank": partner_finish_rank,
        "observed_finish_order": stable_json(finish_order) if isinstance(finish_order, list) else None,
        "observed_double_victory_team": hand_outcome.get("double_victory_team"),
        "observed_double_victory_for_actor_team": (
            hand_outcome.get("double_victory_team") == actor_team
            if hand_outcome.get("double_victory_team") is not None
            else None
        ),
        "observed_tichu_bonus_actor_team": read_bonus_sum(bonuses, actor_team) if bonuses else None,
        "observed_tichu_bonus_opponent_team": read_bonus_sum(bonuses, opponent_team) if bonuses else None,
        "observed_tichu_success_actor": read_seat_bonus_success(bonuses, actor_seat, "small"),
        "observed_grand_tichu_success_actor": read_seat_bonus_success(bonuses, actor_seat, "grand"),
        "observed_actor_team_final_score": actor_team_final_score,
        "observed_opponent_team_final_score": opponent_team_final_score,
        "observed_actor_team_final_delta": actor_team_final_delta,
        "observed_actor_team_won_match": (
            match_outcome.get("final_winner_team") == actor_team
            if match_outcome.get("final_winner_team") is not None
            else None
        ),
        "observed_final_winner_team": match_outcome.get("final_winner_team"),
        "observed_final_team_0_score": match_outcome.get("final_team_0_score"),
        "observed_final_team_1_score": match_outcome.get("final_team_1_score"),
        "missing_outcome_reason": missing_reason,
    }


def build_scope_where(
    run_id: str | None, game_id_prefix: str | None
) -> tuple[list[str], list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []

    if game_id_prefix and game_id_prefix.strip():
        clauses.append("game_id LIKE %s ESCAPE '\\'")
        params.append(f"{escape_like_prefix(game_id_prefix.strip())}%")
    elif run_id and run_id.strip():
        clauses.append("metadata->>'run_id' = %s")
        params.append(run_id.strip())

    return clauses, params


def build_query(
    phase: str | None,
    provider: str | None,
    limit: int | None,
    run_id: str | None = None,
    game_id_prefix: str | None = None,
) -> tuple[str, list[Any]]:
    clauses, params = build_scope_where(run_id, game_id_prefix)

    if phase:
        clauses.append("phase = %s")
        params.append(phase)

    if provider:
        clauses.append("COALESCE(provider_used, policy_source) = %s")
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
            policy_name,
            policy_source,
            provider_used,
            requested_provider,
            fallback_used,
            worker_id,
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
            schema_version,
            engine_version,
            sim_version,
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
        ORDER BY game_id ASC, hand_id ASC, decision_index ASC, ts ASC, id ASC
        {limit_clause}
    """
    return query, params


def load_events_for_games(
    connection: psycopg.Connection[Any], game_ids: list[str]
) -> list[dict[str, Any]]:
    if not game_ids:
        return []
    query = """
        SELECT
            game_id,
            hand_id,
            event_type,
            phase,
            event_index,
            ts,
            state_norm,
            payload
        FROM events
        WHERE game_id = ANY(%s)
        ORDER BY game_id ASC, hand_id ASC, event_index ASC, ts ASC
    """
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(query, (game_ids,))
        return list(cursor.fetchall())


def load_matches_for_games(
    connection: psycopg.Connection[Any], game_ids: list[str]
) -> dict[str, dict[str, Any]]:
    if not game_ids:
        return {}
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            """
            SELECT *
            FROM matches
            WHERE game_id = ANY(%s)
            """,
            (game_ids,),
        )
        rows = list(cursor.fetchall())
    return {
        str(row["game_id"]): row
        for row in rows
        if row.get("game_id") is not None
    }


def count_rows_for_scope(
    connection: psycopg.Connection[Any],
    table: str,
    run_id: str | None,
    game_id_prefix: str | None,
) -> int:
    clauses, params = build_scope_where(run_id, game_id_prefix)
    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    query = f"SELECT count(*) AS row_count FROM {table} {where_clause}"
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(query, params)
        row = cursor.fetchone() or {}
    return int(row.get("row_count") or 0)


def count_matches_for_scope(
    connection: psycopg.Connection[Any], game_id_prefix: str | None
) -> int:
    if not game_id_prefix or not game_id_prefix.strip():
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute("SELECT count(*) AS row_count FROM matches")
            row = cursor.fetchone() or {}
        return int(row.get("row_count") or 0)
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            "SELECT count(*) AS row_count FROM matches WHERE game_id LIKE %s ESCAPE '\\'",
            (f"{escape_like_prefix(game_id_prefix.strip())}%",),
        )
        row = cursor.fetchone() or {}
    return int(row.get("row_count") or 0)


def expected_training_row_count(
    connection: psycopg.Connection[Any],
    run_id: str | None,
    game_id_prefix: str | None,
) -> int:
    clauses, params = build_scope_where(run_id, game_id_prefix)
    clauses.insert(0, "actor_seat LIKE %s")
    params.insert(0, "seat-%")
    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    query = f"""
        SELECT
            COALESCE(SUM(CASE
              WHEN legal_action_count IS NOT NULL AND legal_action_count > 0 THEN legal_action_count
              ELSE 0
            END), 0) AS row_count
        FROM decisions
        {where_clause}
    """
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(query, params)
        row = cursor.fetchone() or {}
    return int(row.get("row_count") or 0)


def build_outcome_maps(
    events: list[dict[str, Any]],
    matches_by_game: dict[str, dict[str, Any]],
) -> tuple[dict[tuple[str, str], dict[str, Any]], dict[str, dict[str, Any]]]:
    hand_states: dict[tuple[str, str], dict[str, Any]] = {}
    match_states: dict[str, dict[str, Any]] = {}
    for event in events:
        game_id = str(event.get("game_id", ""))
        hand_id = str(event.get("hand_id", ""))
        state_norm = safe_dict(event.get("state_norm"))
        if safe_dict(state_norm.get("roundSummary")):
            hand_states[(game_id, hand_id)] = derive_hand_outcome_from_state(state_norm)
        match_outcome = derive_match_outcome_from_state(state_norm, matches_by_game.get(game_id))
        if match_outcome.get("observed_match_outcome_available"):
            match_states[game_id] = match_outcome
        elif game_id not in match_states and game_id in matches_by_game:
            match_states[game_id] = derive_match_outcome_from_state({}, matches_by_game[game_id])
    for game_id, match_row in matches_by_game.items():
        match_states.setdefault(game_id, derive_match_outcome_from_state({}, match_row))
    return hand_states, match_states


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
    explanation: dict[str, Any], decision: dict[str, Any]
) -> tuple[dict[str, Any], dict[tuple[Any, ...], dict[str, Any]]]:
    state_features = decision.get("state_features")
    if not isinstance(state_features, dict):
        state_features = explanation.get("stateFeatures")

    candidate_scores = decision.get("candidate_scores")
    if not isinstance(candidate_scores, list):
        candidate_scores = explanation.get("candidateScores")

    feature_map: dict[tuple[Any, ...], dict[str, Any]] = {}
    if not isinstance(candidate_scores, list):
        return (state_features if isinstance(state_features, dict) else {}, feature_map)

    for candidate in candidate_scores:
        if not isinstance(candidate, dict):
            continue
        action = candidate.get("action")
        features = candidate.get("features")
        if not isinstance(action, dict) or not isinstance(features, dict):
            continue
        feature_map[action_signature(action)] = features

    return (state_features if isinstance(state_features, dict) else {}, feature_map)


def choose_label(
    label_mode: str,
    candidate_was_chosen: bool,
    observed_outcomes: dict[str, Any],
    rollout_outcomes: dict[str, Any] | None,
) -> float | int | None:
    if label_mode == "imitation":
        return 1 if candidate_was_chosen else 0
    if label_mode == "observed_outcome":
        return observed_outcomes.get("observed_actor_team_hand_delta")
    if label_mode == "rollout":
        if rollout_outcomes:
            return rollout_outcomes.get("rollout_mean_actor_team_delta")
        return None
    raise ValueError(f"Unsupported label mode: {label_mode}")


def parse_rollout_file(path: str | None) -> dict[tuple[int, str], dict[str, Any]]:
    if not path:
        return {}
    source = Path(path)
    if not source.exists():
        return {}
    mapping: dict[tuple[int, str], dict[str, Any]] = {}
    if source.suffix == ".jsonl":
        with source.open("r", encoding="utf-8") as handle:
            for line in handle:
                text = line.strip()
                if not text:
                    continue
                row = json.loads(text)
                decision_id = safe_int(row.get("decision_id"))
                action_key = row.get("candidate_action_key")
                if decision_id is None or not isinstance(action_key, str):
                    continue
                mapping[(decision_id, action_key)] = row
    else:
        frame = pd.read_csv(source)
        for row in frame.to_dict("records"):
            decision_id = safe_int(row.get("decision_id"))
            action_key = row.get("candidate_action_key")
            if decision_id is None or not isinstance(action_key, str):
                continue
            mapping[(decision_id, action_key)] = row
    return mapping


def normalize_frame_for_output(frame: pd.DataFrame) -> pd.DataFrame:
    for column in frame.columns:
        if column in NULLABLE_INT_COLUMNS:
            frame[column] = pd.Series(frame[column], dtype="Int64")
            continue
        if column in NULLABLE_BOOL_COLUMNS:
            frame[column] = pd.Series(frame[column], dtype="boolean")
            continue
        if column in STRING_COLUMNS:
            frame[column] = pd.Series(frame[column], dtype="string")
            continue
        if pd.api.types.is_object_dtype(frame[column].dtype):
            numeric = pd.to_numeric(frame[column], errors="coerce")
            if numeric.notna().any():
                frame[column] = numeric.astype("float64")
    return frame


class DatasetWriter:
    def __init__(self, output: Path, output_format: str) -> None:
        self.output = output
        self.output_format = output_format
        self.output.parent.mkdir(parents=True, exist_ok=True)
        if self.output.exists():
            self.output.unlink()
        self.parquet_writer: pq.ParquetWriter | None = None
        self.csv_header_written = False
        self.json_handle = None

    def write_rows(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        frame = normalize_frame_for_output(pd.DataFrame(rows))
        if self.output_format == "parquet":
            table = pa.Table.from_pandas(frame, preserve_index=False)
            if self.parquet_writer is None:
                self.parquet_writer = pq.ParquetWriter(str(self.output), table.schema)
            else:
                table = table.cast(self.parquet_writer.schema, safe=False)
            self.parquet_writer.write_table(table)
            return
        if self.output_format == "csv.gz":
            with gzip.open(
                self.output,
                "at",
                encoding="utf-8",
                newline="",
            ) as handle:
                frame.to_csv(
                    handle,
                    index=False,
                    header=not self.csv_header_written,
                    quoting=csv.QUOTE_MINIMAL,
                )
            self.csv_header_written = True
            return
        if self.output_format == "jsonl":
            if self.json_handle is None:
                self.json_handle = self.output.open("a", encoding="utf-8")
            for row in rows:
                self.json_handle.write(json.dumps(row, ensure_ascii=True) + "\n")
            return
        raise ValueError(f"Unsupported output format: {self.output_format}")

    def close(self) -> None:
        if self.parquet_writer is not None:
            self.parquet_writer.close()
            self.parquet_writer = None
        if self.json_handle is not None:
            self.json_handle.close()
            self.json_handle = None


@dataclass
class ExportStats:
    decisions_read: int = 0
    decisions_processed: int = 0
    candidate_rows_written: int = 0
    malformed_decisions: int = 0
    missing_state_raw_count: int = 0
    missing_state_norm_count: int = 0
    missing_legal_actions_count: int = 0
    non_player_actor_decisions_skipped: int = 0
    chosen_action_match_count: int = 0
    fallback_rows: int = 0
    observed_outcome_available_rows: int = 0
    observed_hand_outcome_available_rows: int = 0
    observed_match_outcome_available_rows: int = 0
    games_with_outcomes: int = 0
    hands_with_outcomes: int = 0
    rows_by_phase: Counter[str] = field(default_factory=Counter)
    rows_by_provider: Counter[str] = field(default_factory=Counter)
    rows_by_actor_seat: Counter[str] = field(default_factory=Counter)
    missing_outcome_reason_counts: Counter[str] = field(default_factory=Counter)
    games_with_outcomes_seen: set[str] = field(default_factory=set)
    hands_with_outcomes_seen: set[tuple[str, str]] = field(default_factory=set)

    def to_quality_payload(
        self,
        *,
        label_mode: str,
        output_format: str,
        chunk_size: int,
        peak_memory_bytes: int,
        feature_count: int,
    ) -> dict[str, Any]:
        decisions_with_rows = max(self.decisions_processed, 1)
        chosen_action_match_rate = (
            self.chosen_action_match_count / decisions_with_rows
            if self.decisions_processed > 0
            else 0.0
        )
        return {
            "decisions_read": self.decisions_read,
            "decisions_processed": self.decisions_processed,
            "candidate_rows_written": self.candidate_rows_written,
            "rows_by_phase": dict(self.rows_by_phase),
            "rows_by_provider": dict(self.rows_by_provider),
            "rows_by_actor_seat": dict(self.rows_by_actor_seat),
            "fallback_rows": self.fallback_rows,
            "malformed_decisions": self.malformed_decisions,
            "missing_state_raw_count": self.missing_state_raw_count,
            "missing_state_norm_count": self.missing_state_norm_count,
            "missing_legal_actions_count": self.missing_legal_actions_count,
            "non_player_actor_decisions_skipped": self.non_player_actor_decisions_skipped,
            "chosen_action_match_count": self.chosen_action_match_count,
            "chosen_action_match_rate": round(chosen_action_match_rate, 6),
            "observed_outcome_available_rows": self.observed_outcome_available_rows,
            "observed_hand_outcome_available_rows": self.observed_hand_outcome_available_rows,
            "observed_match_outcome_available_rows": self.observed_match_outcome_available_rows,
            "games_with_outcomes": len(self.games_with_outcomes_seen),
            "hands_with_outcomes": len(self.hands_with_outcomes_seen),
            "missing_outcome_reason_counts": dict(self.missing_outcome_reason_counts),
            "label_mode": label_mode,
            "feature_count": feature_count,
            "output_format": output_format,
            "chunk_size": chunk_size,
            "peak_memory_bytes": peak_memory_bytes,
            "schema_version": SCHEMA_VERSION,
        }


def build_alias_feature_columns(
    decision: dict[str, Any], features: dict[str, float], legal_action: dict[str, Any]
) -> dict[str, Any]:
    state_raw = safe_dict(decision.get("state_raw"))
    actor_seat = str(decision.get("actor_seat", ""))
    actor_team = team_for_seat(actor_seat)
    opponent_team = opponent_team_for_seat(actor_seat)
    match_score = safe_dict(state_raw.get("matchScore"))
    actor_score = safe_float(match_score.get(actor_team))
    opponent_score = safe_float(match_score.get(opponent_team))
    current_trick = safe_dict(state_raw.get("currentTrick"))
    current_combo = safe_dict(current_trick.get("currentCombination"))
    return {
        "actor_hand_count": features.get("self_hand_size", 0.0),
        "partner_hand_count": features.get("partner_hand_size", 0.0),
        "left_opponent_hand_count": features.get("left_opponent_hand_size", 0.0),
        "right_opponent_hand_count": features.get("right_opponent_hand_size", 0.0),
        "actor_team_score": actor_score,
        "opponent_team_score": opponent_score,
        "score_delta": (
            actor_score - opponent_score
            if actor_score is not None and opponent_score is not None
            else None
        ),
        "current_phase": decision.get("phase"),
        "current_trick_size": features.get("current_trick_size", 0.0),
        "current_top_combo_type": current_combo.get("kind"),
        "current_top_combo_rank": features.get("current_top_combo_rank", 0.0),
        "current_winner_relation": relation_for_seat(
            actor_seat,
            current_trick.get("currentWinner") if isinstance(current_trick.get("currentWinner"), str) else None,
        ),
        "active_seat_relation": relation_for_seat(
            actor_seat,
            state_raw.get("activeSeat") if isinstance(state_raw.get("activeSeat"), str) else None,
        ),
        "wish_active": bool(features.get("wish_active_flag", 0.0)),
        "wished_rank": features.get("wished_rank", features.get("wish_rank", 0.0)),
        "candidate_satisfies_wish": bool(features.get("satisfies_wish_flag", 0.0)),
        "opponents_called_tichu_count": features.get("all_opponents_called_tichu_count", 0.0),
        "opponents_called_grand_tichu_count": features.get(
            "all_opponents_called_grand_tichu_count", 0.0
        ),
        "candidate_card_count": features.get("cards_used_count", 0.0),
        "candidate_combo_type": safe_dict(legal_action.get("combination")).get("kind")
        if isinstance(legal_action, dict)
        else None,
        "candidate_rank_strength": features.get("action_rank", 0.0),
        "candidate_uses_bomb": bool(features.get("uses_bomb_flag", 0.0)),
        "candidate_uses_dragon": bool(features.get("uses_dragon_flag", 0.0)),
        "candidate_uses_phoenix": bool(features.get("uses_phoenix_flag", 0.0)),
        "candidate_uses_dog": bool(features.get("uses_dog_flag", 0.0)),
        "candidate_uses_mahjong": bool(features.get("uses_mahjong_flag", 0.0)),
        "candidate_action_semantics": "assign_dragon_trick"
        if legal_action.get("type") == "assign_dragon_trick"
        else "select_pass"
        if legal_action.get("type") == "select_pass"
        else "pass"
        if legal_action.get("type") == "pass_turn"
        else "play",
    }


def build_rows_for_chunk(
    decisions: list[dict[str, Any]],
    *,
    hand_outcomes: dict[tuple[str, str], dict[str, Any]],
    match_outcomes: dict[str, dict[str, Any]],
    rollout_rows: dict[tuple[int, str], dict[str, Any]],
    label_mode: str,
    include_outcomes: bool,
    include_rollouts: bool,
    stats: ExportStats,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for decision in decisions:
        stats.decisions_read += 1
        actor_seat = str(decision.get("actor_seat", ""))
        if not is_player_actor_seat(actor_seat):
            stats.non_player_actor_decisions_skipped += 1
            continue
        phase = str(decision.get("phase", ""))
        legal_actions = extract_actor_legal_actions(decision.get("legal_actions"), actor_seat)
        if not legal_actions:
            stats.missing_legal_actions_count += 1
            stats.malformed_decisions += 1
            continue
        if not safe_dict(decision.get("state_raw")):
            stats.missing_state_raw_count += 1
        if decision.get("state_norm") is None:
            stats.missing_state_norm_count += 1
        chosen_signature = action_signature(decision.get("chosen_action", {}))
        explanation = extract_explanation_metadata(decision)
        state_features, candidate_feature_map = build_candidate_feature_map(explanation, decision)
        hand_outcome = hand_outcomes.get((str(decision.get("game_id", "")), str(decision.get("hand_id", ""))), {})
        match_outcome = match_outcomes.get(str(decision.get("game_id", "")), {})
        observed = observed_outcomes_for_actor(actor_seat, hand_outcome, match_outcome)
        if observed.get("observed_outcome_available"):
            stats.games_with_outcomes_seen.add(str(decision.get("game_id", "")))
        if observed.get("observed_hand_outcome_available"):
            stats.hands_with_outcomes_seen.add(
                (str(decision.get("game_id", "")), str(decision.get("hand_id", "")))
            )

        matched_any = False
        for index, legal_action in enumerate(legal_actions):
            candidate_signature = action_signature(legal_action)
            candidate_was_chosen = candidate_signature == chosen_signature
            matched_any = matched_any or candidate_was_chosen
            candidate_action_key = stable_json(candidate_signature)
            candidate_features = candidate_feature_map.get(candidate_signature)
            features = build_feature_row(
                decision.get("state_raw"),
                phase,
                actor_seat,
                legal_action,
                state_features=state_features,
                candidate_features=candidate_features,
            )
            rollout = rollout_rows.get((int(decision.get("id", 0)), candidate_action_key))
            row = {
                "decision_id": int(decision.get("id", 0)),
                "ts": str(decision.get("ts", "")),
                "game_id": str(decision.get("game_id", "")),
                "hand_id": str(decision.get("hand_id", "")),
                "phase": phase,
                "actor_seat": actor_seat,
                "actor_team": team_for_seat(actor_seat),
                "opponent_team": opponent_team_for_seat(actor_seat),
                "decision_index": int(decision.get("decision_index", 0)),
                "event_index": safe_int(safe_dict(decision.get("metadata")).get("event_index")),
                "candidate_action_index": index,
                "candidate_action_type": str(legal_action.get("type", "")),
                "candidate_action_key": candidate_action_key,
                "candidate_action_canonical_json": stable_json(legal_action),
                "candidate_was_chosen": candidate_was_chosen,
                "label": choose_label(label_mode, candidate_was_chosen, observed, rollout),
                "provider_used": str(decision.get("provider_used") or decision.get("policy_source", "")),
                "requested_provider": str(decision.get("requested_provider") or ""),
                "policy_source": str(decision.get("policy_source") or ""),
                "policy_name": str(decision.get("policy_name") or ""),
                "fallback_used": bool(decision.get("fallback_used", False)),
                "chosen_action_is_legal": bool(decision.get("chosen_action_is_legal", False)),
                "legal_action_count": int(decision.get("legal_action_count", len(legal_actions))),
                "state_hash": str(decision.get("state_hash") or ""),
                "legal_actions_hash": str(decision.get("legal_actions_hash") or ""),
                "chosen_action_hash": str(decision.get("chosen_action_hash") or ""),
                "schema_version": int(decision.get("schema_version", 0)),
                "engine_version": str(decision.get("engine_version") or ""),
                "sim_version": str(decision.get("sim_version") or ""),
            }
            row.update({feature_name: features.get(feature_name, 0.0) for feature_name in FEATURE_ORDER})
            row.update(build_alias_feature_columns(decision, features, legal_action))

            if include_outcomes:
                row.update(observed)
            else:
                row.update({column: None for column in OBSERVED_OUTCOME_COLUMNS})

            if include_rollouts:
                if rollout:
                    row.update({column: rollout.get(column) for column in ROLLOUT_COLUMNS})
                else:
                    row.update({column: None for column in ROLLOUT_COLUMNS})

            rows.append(row)
            stats.candidate_rows_written += 1
            stats.rows_by_phase[phase] += 1
            stats.rows_by_provider[row["provider_used"]] += 1
            stats.rows_by_actor_seat[actor_seat] += 1
            if row["fallback_used"]:
                stats.fallback_rows += 1
            if row.get("observed_outcome_available"):
                stats.observed_outcome_available_rows += 1
            if row.get("observed_hand_outcome_available"):
                stats.observed_hand_outcome_available_rows += 1
            if row.get("observed_match_outcome_available"):
                stats.observed_match_outcome_available_rows += 1
            reason = row.get("missing_outcome_reason")
            if isinstance(reason, str) and reason:
                stats.missing_outcome_reason_counts[reason] += 1

        if matched_any:
            stats.chosen_action_match_count += 1
        else:
            stats.malformed_decisions += 1
        stats.decisions_processed += 1

    return rows


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def write_markdown(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def build_manifest(
    frame_columns: list[str],
    created_at: str,
    label_mode: str,
    *,
    run_id: str | None = None,
    game_id_prefix: str | None = None,
    source_row_counts: dict[str, int] | None = None,
    exported_training_row_count: int | None = None,
    validation_status: str | None = None,
    filtering_strategy: str | None = None,
    ml_export_command: str | None = None,
) -> dict[str, Any]:
    feature_columns = [column for column in FEATURE_ORDER if column in frame_columns]
    label_columns = [
        column for column in ["label", *OBSERVED_OUTCOME_COLUMNS, *ROLLOUT_COLUMNS]
        if column in frame_columns
    ]
    diagnostic_columns = [
        column
        for column in (
            ["ts", *CONTEXT_COLUMNS, *EXPORT_ALIAS_FEATURE_COLUMNS]
        )
        if column in frame_columns and column not in feature_columns
    ]
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "telemetry_schema_version": 2,
        "created_at": created_at,
        "label_mode": label_mode,
        "feature_columns": feature_columns,
        "identity_columns": [column for column in IDENTITY_COLUMNS if column in frame_columns],
        "diagnostic_columns": diagnostic_columns,
        "imitation_label_column": "label",
        "observed_outcome_label_columns": [
            column for column in OBSERVED_OUTCOME_COLUMNS if column in frame_columns
        ],
        "rollout_label_columns": [
            column for column in ROLLOUT_COLUMNS if column in frame_columns
        ],
        "leakage_excluded_columns": [
            column for column in LEAKAGE_EXCLUDED_COLUMNS if column in frame_columns
        ],
        "categorical_columns": [
            column
            for column in [
                "phase",
                "actor_seat",
                "actor_team",
                "opponent_team",
                "candidate_action_type",
                "current_phase",
                "current_top_combo_type",
                "current_winner_relation",
                "active_seat_relation",
                "candidate_combo_type",
                "candidate_action_semantics",
            ]
            if column in frame_columns
        ],
        "label_columns": label_columns,
        "feature_count": len(feature_columns),
        "supported_output_formats": ["parquet", "csv.gz", "jsonl"],
        "supports_lightgbm_output": True,
        "scope": {
            "run_id": run_id,
            "game_id_prefix": game_id_prefix,
            "scoped_to_current_run": bool(run_id or game_id_prefix),
            "filtering_strategy": filtering_strategy or "phase_provider_scope",
        },
        "source_tables": ["decisions", "events", "matches"],
        "source_row_counts": source_row_counts or {},
        "exported_training_row_count": exported_training_row_count,
        "validation_status": validation_status or "accepted",
        "ml_export_command": ml_export_command,
    }
    return manifest


def build_schema(frame_columns: list[str], sample_row: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "columns": {
            column: type(sample_row.get(column)).__name__
            for column in frame_columns
        },
    }


def quality_markdown(payload: dict[str, Any]) -> str:
    return "\n".join(
        [
            "# Export Quality Report",
            "",
            f"- decisions_read: {payload['decisions_read']}",
            f"- decisions_processed: {payload['decisions_processed']}",
            f"- candidate_rows_written: {payload['candidate_rows_written']}",
            f"- malformed_decisions: {payload['malformed_decisions']}",
            f"- missing_state_raw_count: {payload['missing_state_raw_count']}",
            f"- missing_state_norm_count: {payload['missing_state_norm_count']}",
            f"- missing_legal_actions_count: {payload['missing_legal_actions_count']}",
            f"- chosen_action_match_rate: {payload['chosen_action_match_rate']}",
            f"- observed_outcome_available_rows: {payload['observed_outcome_available_rows']}",
            f"- observed_hand_outcome_available_rows: {payload['observed_hand_outcome_available_rows']}",
            f"- observed_match_outcome_available_rows: {payload['observed_match_outcome_available_rows']}",
            f"- label_mode: {payload['label_mode']}",
            f"- feature_count: {payload['feature_count']}",
            f"- output_format: {payload['output_format']}",
            f"- chunk_size: {payload['chunk_size']}",
            f"- peak_memory_bytes: {payload['peak_memory_bytes']}",
            "",
            "## Rows By Phase",
            "",
            *[f"- {key}: {value}" for key, value in sorted(payload["rows_by_phase"].items())],
            "",
            "## Rows By Provider",
            "",
            *[f"- {key}: {value}" for key, value in sorted(payload["rows_by_provider"].items())],
            "",
            "## Missing Outcome Reasons",
            "",
            *[
                f"- {key}: {value}"
                for key, value in sorted(payload["missing_outcome_reason_counts"].items())
            ],
        ]
    )


def infer_output_format(explicit: str | None, output: Path) -> str:
    if explicit:
        return explicit
    if output.suffix == ".gz":
        return "csv.gz"
    if output.suffix == ".jsonl":
        return "jsonl"
    return "parquet"


def default_output_name_for_format(output_format: str) -> str:
    if output_format == "csv.gz":
        return "train.csv.gz"
    if output_format == "jsonl":
        return "train.jsonl"
    return "train.parquet"


def resolve_output_paths(args: argparse.Namespace) -> dict[str, Path | None]:
    output_dir = Path(args.output_dir) if args.output_dir else None
    explicit_output = args.output != str(DEFAULT_OUTPUT)
    explicit_schema = args.schema_output != str(DEFAULT_SCHEMA_OUTPUT)
    explicit_quality = args.quality_output != str(DEFAULT_QUALITY_OUTPUT)
    explicit_manifest = args.manifest_output != str(DEFAULT_MANIFEST_OUTPUT)
    explicit_feature_schema = (
        args.feature_schema_output != str(DEFAULT_FEATURE_SCHEMA_OUTPUT)
    )
    explicit_feature_columns = (
        args.feature_columns_output != str(DEFAULT_FEATURE_COLUMNS_OUTPUT)
    )
    explicit_label_columns = (
        args.label_columns_output != str(DEFAULT_LABEL_COLUMNS_OUTPUT)
    )
    inferred_output = Path(args.output)
    output_format = infer_output_format(args.format, inferred_output)

    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = (
            inferred_output
            if explicit_output
            else output_dir / default_output_name_for_format(output_format)
        )
        schema_output = (
            Path(args.schema_output)
            if explicit_schema
            else output_dir / "train.schema.json"
        )
        quality_output = (
            Path(args.quality_output)
            if explicit_quality
            else output_dir / "train.quality.json"
        )
        manifest_output = (
            Path(args.manifest_output)
            if explicit_manifest
            else output_dir / "dataset_metadata.json"
        )
        feature_schema_output = (
            Path(args.feature_schema_output)
            if explicit_feature_schema
            else output_dir / "feature_schema.json"
        )
        feature_columns_output = (
            Path(args.feature_columns_output)
            if explicit_feature_columns
            else output_dir / "feature_columns.json"
        )
        label_columns_output = (
            Path(args.label_columns_output)
            if explicit_label_columns
            else output_dir / "label_columns.json"
        )
    else:
        output_path = inferred_output
        schema_output = Path(args.schema_output)
        quality_output = Path(args.quality_output)
        manifest_output = Path(args.manifest_output)
        feature_schema_output = Path(args.feature_schema_output)
        feature_columns_output = Path(args.feature_columns_output)
        label_columns_output = Path(args.label_columns_output)

    return {
        "output_path": output_path,
        "schema_output": schema_output,
        "quality_output": quality_output,
        "manifest_output": manifest_output,
        "feature_schema_output": feature_schema_output,
        "feature_columns_output": feature_columns_output,
        "label_columns_output": label_columns_output,
        "output_dir": output_dir,
        "output_format": output_format,
    }


def validate_lightgbm_columns(
    rows: list[dict[str, Any]],
    feature_columns: list[str],
    label_columns: list[str],
) -> list[str]:
    issues: list[str] = []
    if not feature_columns:
        issues.append("No feature columns were detected for LightGBM export.")
    if not label_columns:
        issues.append("No label columns were detected for LightGBM export.")
    if not rows:
        return issues
    sample = rows[0]
    for column in feature_columns:
        value = sample.get(column)
        if value is not None and not isinstance(value, (int, float, bool)):
            issues.append(
                f"Feature column {column} is not numeric in the sampled training rows."
            )
            break
    return issues


def build_validation_summary(
    *,
    accepted: bool,
    args: argparse.Namespace,
    output_format: str,
    database_url_source: str,
    database_url_fallback_used: bool,
    source_row_counts: dict[str, int],
    expected_rows: int,
    sample_rows: list[dict[str, Any]],
    manifest: dict[str, Any],
    validation_errors: list[str],
    validation_warnings: list[str],
    validation_mode_used: str,
) -> dict[str, Any]:
    return {
        "accepted": accepted,
        "validation_only": True,
        "validation_mode_used": validation_mode_used,
        "supports_validate_only": True,
        "supports_run_id_filter": True,
        "supports_game_id_prefix_filter": True,
        "run_id": args.run_id,
        "game_id_prefix": args.game_id_prefix,
        "database_url_source": database_url_source,
        "database_url_fallback_used": database_url_fallback_used,
        "source_tables_expected": ["matches", "decisions", "events"],
        "current_run_matches_count": source_row_counts["matches"],
        "current_run_events_count": source_row_counts["events"],
        "current_run_decisions_count": source_row_counts["decisions"],
        "expected_training_row_count": expected_rows,
        "sample_training_row_count": len(sample_rows),
        "detected_feature_schema_version": manifest.get("schema_version"),
        "detected_label_schema_version": manifest.get("schema_version"),
        "supports_lightgbm_output": len(validation_errors) == 0,
        "supported_output_formats": ["parquet", "csv.gz", "jsonl"],
        "expected_lightgbm_files": [
            default_output_name_for_format(output_format),
            "dataset_metadata.json",
            "feature_schema.json",
            "feature_columns.json",
            "label_columns.json",
        ],
        "feature_columns": manifest.get("feature_columns", []),
        "label_columns": manifest.get("label_columns", []),
        "validation_status": "accepted" if accepted else "failed",
        "validation_errors": validation_errors,
        "validation_warnings": validation_warnings,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=None)
    parser.add_argument("--phase", default="play")
    parser.add_argument("--provider", default=None)
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--game-id-prefix", default=None)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--chunk-size", type=int, default=500)
    parser.add_argument("--label-mode", choices=["imitation", "observed_outcome", "rollout"], default="imitation")
    parser.add_argument("--include-outcomes", dest="include_outcomes", action="store_true", default=True)
    parser.add_argument("--no-include-outcomes", dest="include_outcomes", action="store_false")
    parser.add_argument("--include-rollouts", dest="include_rollouts", action="store_true", default=False)
    parser.add_argument("--no-include-rollouts", dest="include_rollouts", action="store_false")
    parser.add_argument("--rollout-input", default=None)
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--schema-output", default=str(DEFAULT_SCHEMA_OUTPUT))
    parser.add_argument("--quality-output", default=str(DEFAULT_QUALITY_OUTPUT))
    parser.add_argument("--manifest-output", default=str(DEFAULT_MANIFEST_OUTPUT))
    parser.add_argument(
        "--feature-schema-output",
        default=str(DEFAULT_FEATURE_SCHEMA_OUTPUT),
    )
    parser.add_argument(
        "--feature-columns-output",
        default=str(DEFAULT_FEATURE_COLUMNS_OUTPUT),
    )
    parser.add_argument(
        "--label-columns-output",
        default=str(DEFAULT_LABEL_COLUMNS_OUTPUT),
    )
    parser.add_argument("--format", choices=["parquet", "csv.gz", "jsonl"], default=None)
    parser.add_argument("--validate-only", action="store_true", default=False)
    parser.add_argument("--dry-run", action="store_true", default=False)
    args = parser.parse_args()

    validation_only = args.validate_only or args.dry_run
    resolved_paths = resolve_output_paths(args)
    output_path = resolved_paths["output_path"]
    schema_output = resolved_paths["schema_output"]
    quality_output = resolved_paths["quality_output"]
    quality_md_output = quality_output.with_suffix(".md")
    manifest_output = resolved_paths["manifest_output"]
    feature_schema_output = resolved_paths["feature_schema_output"]
    feature_columns_output = resolved_paths["feature_columns_output"]
    label_columns_output = resolved_paths["label_columns_output"]
    phase = resolve_phase_filter(args.phase)
    output_format = str(resolved_paths["output_format"])

    tracemalloc.start()
    stats = ExportStats()
    created_at = datetime.now(UTC).isoformat()
    rollout_rows = parse_rollout_file(args.rollout_input) if args.include_rollouts else {}
    writer = DatasetWriter(output_path, output_format)
    first_row: dict[str, Any] | None = None
    written_columns: list[str] = []
    database_url_used = default_database_url()
    database_url_source = "default"
    database_url_fallback_used = False
    try:
        query, params = build_query(
            phase,
            args.provider,
            args.limit,
            args.run_id,
            args.game_id_prefix,
        )
        connection = None
        try:
            (
                connection,
                database_url_used,
                database_url_source,
                database_url_fallback_used,
            ) = connect_with_fallback(args.database_url)
            source_row_counts = {
                "decisions": count_rows_for_scope(
                    connection, "decisions", args.run_id, args.game_id_prefix
                ),
                "events": count_rows_for_scope(
                    connection, "events", args.run_id, args.game_id_prefix
                ),
                "matches": count_matches_for_scope(connection, args.game_id_prefix),
            }
            potential_row_count = expected_training_row_count(
                connection, args.run_id, args.game_id_prefix
            )
            with connection.cursor(
                name="decision_export_cursor",
                row_factory=dict_row,
            ) as cursor:
                cursor.execute(query, params)
                while True:
                    decisions = list(cursor.fetchmany(args.chunk_size))
                    if not decisions:
                        break
                    game_ids = sorted(
                        {
                            str(decision.get("game_id", ""))
                            for decision in decisions
                            if decision.get("game_id")
                        }
                    )
                    events = load_events_for_games(connection, game_ids)
                    matches = load_matches_for_games(connection, game_ids)
                    hand_outcomes, match_outcomes = build_outcome_maps(events, matches)
                    rows = build_rows_for_chunk(
                        decisions,
                        hand_outcomes=hand_outcomes,
                        match_outcomes=match_outcomes,
                        rollout_rows=rollout_rows,
                        label_mode=args.label_mode,
                        include_outcomes=args.include_outcomes,
                        include_rollouts=args.include_rollouts,
                        stats=stats,
                    )
                    if rows and first_row is None:
                        first_row = rows[0]
                        written_columns = list(rows[0].keys())
                    if validation_only:
                        break
                    writer.write_rows(rows)
        finally:
            if connection is not None:
                connection.close()
    finally:
        if not validation_only:
            writer.close()

    current, peak = tracemalloc.get_traced_memory()
    _ = current
    tracemalloc.stop()

    if first_row is None:
        first_row = {}
    manifest = build_manifest(
        written_columns,
        created_at,
        args.label_mode,
        run_id=args.run_id,
        game_id_prefix=args.game_id_prefix,
        source_row_counts=source_row_counts,
        exported_training_row_count=stats.candidate_rows_written
        if not validation_only
        else potential_row_count,
        validation_status="validated" if validation_only else "accepted",
        filtering_strategy="game_id_prefix" if args.game_id_prefix else "run_id_metadata"
        if args.run_id
        else "unscoped",
        ml_export_command=" ".join(sys.argv),
    )
    manifest["database_url_source"] = database_url_source
    manifest["database_url_fallback_used"] = database_url_fallback_used
    feature_columns = manifest.get("feature_columns", [])
    label_columns = manifest.get("label_columns", [])
    validation_errors = validate_lightgbm_columns(
        [first_row] if first_row else [],
        feature_columns,
        label_columns,
    )
    validation_warnings: list[str] = []

    if validation_only:
        if source_row_counts["decisions"] == 0:
            validation_errors.append("No scoped decisions were found for the requested run.")
        if source_row_counts["events"] == 0:
            validation_errors.append("No scoped events were found for the requested run.")
        if potential_row_count == 0 and source_row_counts["decisions"] > 0:
            validation_errors.append(
                "Scoped decisions were found, but no legal-action training rows could be inferred."
            )
        if source_row_counts["matches"] == 0:
            validation_warnings.append(
                "No scoped matches were found; match lifecycle completion may still be pending."
            )
        summary = build_validation_summary(
            accepted=len(validation_errors) == 0,
            args=args,
            output_format=output_format,
            database_url_source=database_url_source,
            database_url_fallback_used=database_url_fallback_used,
            source_row_counts=source_row_counts,
            expected_rows=potential_row_count,
            sample_rows=[first_row] if first_row else [],
            manifest=manifest,
            validation_errors=validation_errors,
            validation_warnings=validation_warnings,
            validation_mode_used="validate_only" if args.validate_only else "dry_run",
        )
        print(json.dumps(summary))
        if not summary["accepted"]:
            sys.exit(1)
        return

    if stats.candidate_rows_written == 0:
        raise ValueError(
            "ml:export produced zero training rows. Verify scoped telemetry includes decisions with legal actions and full state."
        )

    write_feature_schema(feature_schema_output)
    schema = build_schema(written_columns, first_row)
    write_json(manifest_output, manifest)
    write_json(schema_output, schema)
    write_json(feature_columns_output, {"feature_columns": feature_columns})
    write_json(label_columns_output, {"label_columns": label_columns})

    quality_payload = stats.to_quality_payload(
        label_mode=args.label_mode,
        output_format=output_format,
        chunk_size=args.chunk_size,
        peak_memory_bytes=peak,
        feature_count=len(manifest["feature_columns"]),
    )
    write_json(quality_output, quality_payload)
    write_markdown(quality_md_output, quality_markdown(quality_payload))

    print(
        json.dumps(
            {
                "accepted": True,
                "rows": stats.candidate_rows_written,
                "decisions": stats.decisions_processed,
                "phase": phase,
                "provider": args.provider,
                "output": str(output_path),
                "format": output_format,
                "label_mode": args.label_mode,
                "include_outcomes": args.include_outcomes,
                "include_rollouts": args.include_rollouts,
                "feature_schema": str(feature_schema_output),
                "schema_output": str(schema_output),
                "quality_output": str(quality_output),
                "manifest_output": str(manifest_output),
                "feature_columns_output": str(feature_columns_output),
                "label_columns_output": str(label_columns_output),
            }
        )
    )


if __name__ == "__main__":
    main()
