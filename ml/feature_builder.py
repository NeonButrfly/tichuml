from __future__ import annotations

import json
from pathlib import Path
from typing import Any

PHASES = [
    "grand_tichu_window",
    "pass_select",
    "pass_reveal",
    "exchange_complete",
    "trick_play",
    "finished",
]

ACTION_TYPES = [
    "call_grand_tichu",
    "decline_grand_tichu",
    "call_tichu",
    "select_pass",
    "pass_turn",
    "play_cards",
    "assign_dragon_trick",
    "advance_phase",
]

COMBO_TYPES = [
    "single",
    "pair",
    "triple",
    "straight",
    "pair-sequence",
    "full-house",
    "bomb-four-kind",
    "bomb-straight",
    "dog",
    "unknown",
]

SEATS = ["seat-0", "seat-1", "seat-2", "seat-3"]
RELATIONS = ["self", "partner", "left_opponent", "right_opponent", "none"]
URGENCY_MODES = [
    "normal",
    "opponent_near_out",
    "self_near_out",
    "partner_support",
    "endgame",
]


def get_partner_seat(seat: str) -> str:
    seat_index = int(seat.split("-")[-1])
    return f"seat-{(seat_index + 2) % 4}"


def get_left_opponent_seat(seat: str) -> str:
    seat_index = int(seat.split("-")[-1])
    return f"seat-{(seat_index + 3) % 4}"


def get_right_opponent_seat(seat: str) -> str:
    seat_index = int(seat.split("-")[-1])
    return f"seat-{(seat_index + 1) % 4}"


def phase_alias(phase: str) -> str:
    return "trick_play" if phase == "play" else phase


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


def feature_order() -> list[str]:
    ordered = [
        "self_hand_size",
        "partner_hand_size",
        "left_opponent_hand_size",
        "right_opponent_hand_size",
        "cards_remaining_self",
        "cards_remaining_partner",
        "cards_remaining_left_opponent",
        "cards_remaining_right_opponent",
        "self_near_out_flag",
        "partner_near_out_flag",
        "left_opponent_near_out_flag",
        "right_opponent_near_out_flag",
        "any_opponent_near_out_flag",
        "opponent_near_out_count",
        "wish_active_flag",
        "wished_rank",
        "current_top_combo_rank",
        "current_top_combo_length",
        "current_trick_size",
        "pass_select_phase_flag",
        "exchange_phase_flag",
        "pickup_phase_flag",
        "actor_called_tichu",
        "actor_called_grand_tichu",
        "partner_called_tichu",
        "partner_called_grand_tichu",
        "left_opponent_called_tichu",
        "left_opponent_called_grand_tichu",
        "right_opponent_called_tichu",
        "right_opponent_called_grand_tichu",
        "all_opponents_called_tichu_count",
        "all_opponents_called_grand_tichu_count",
        "action_rank",
        "action_length",
        "cards_used_count",
        "uses_bomb_flag",
        "uses_dragon_flag",
        "uses_phoenix_flag",
        "uses_dog_flag",
        "uses_mahjong_flag",
        "satisfies_wish_flag",
        "overtakes_partner_flag",
        "likely_wins_current_trick_flag",
        "pass_action_flag",
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
    ]

    ordered.extend([f"phase_{phase}" for phase in PHASES])
    ordered.extend([f"actor_is_{seat}" for seat in SEATS])
    ordered.extend([f"active_seat_relation_{relation}" for relation in RELATIONS])
    ordered.extend([f"current_leader_relation_{relation}" for relation in RELATIONS])
    ordered.extend([f"current_top_combo_kind_{kind}" for kind in COMBO_TYPES])
    ordered.extend([f"action_type_{action_type}" for action_type in ACTION_TYPES])
    ordered.extend([f"action_combo_{combo_type}" for combo_type in COMBO_TYPES])
    ordered.extend([f"urgency_mode_{mode}" for mode in URGENCY_MODES])
    return ordered


FEATURE_ORDER = feature_order()


def write_feature_schema(path: str | Path) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps({"feature_columns": FEATURE_ORDER}, indent=2),
        encoding="utf-8",
    )


def _empty_features() -> dict[str, float]:
    return {key: 0.0 for key in FEATURE_ORDER}


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _hand_size(state: dict[str, Any], seat: str) -> int:
    hands = _as_dict(state.get("hands"))
    cards = hands.get(seat, [])
    if isinstance(cards, list):
        return len(cards)

    players = _as_dict(state.get("players"))
    player = _as_dict(players.get(seat))
    player_hand = player.get("hand", [])
    return len(player_hand) if isinstance(player_hand, list) else 0


def _calls_for_seat(state: dict[str, Any], seat: str) -> dict[str, Any]:
    calls = _as_dict(state.get("calls"))
    explicit = _as_dict(calls.get(seat))
    if explicit:
        return explicit

    called_tichu = state.get("calledTichu", [])
    called_grand_tichu = state.get("calledGrandTichu", [])
    return {
        "smallTichu": isinstance(called_tichu, list) and seat in called_tichu,
        "grandTichu": isinstance(called_grand_tichu, list)
        and seat in called_grand_tichu,
    }


def _current_trick(state: dict[str, Any]) -> dict[str, Any]:
    return _as_dict(state.get("currentTrick"))


def _current_combination(state: dict[str, Any]) -> dict[str, Any]:
    trick = _current_trick(state)
    current = _as_dict(trick.get("currentCombination"))
    if current:
        return current

    plays = trick.get("plays")
    if isinstance(plays, list) and plays:
        last_play = _as_dict(plays[-1])
        return _as_dict(last_play.get("combo"))

    return {}


def _combo_kind(combo: dict[str, Any]) -> str:
    candidate = combo.get("kind")
    if isinstance(candidate, str):
        normalized = {"trio": "triple"}.get(candidate, candidate)
        if normalized in COMBO_TYPES:
            return normalized
    return "unknown"


def _combo_rank(combo: dict[str, Any]) -> float:
    candidate = combo.get("primaryRank")
    if not isinstance(candidate, (int, float)):
        candidate = combo.get("rank")
    return float(candidate) if isinstance(candidate, (int, float)) else 0.0


def _combo_length(combo: dict[str, Any], fallback_length: int = 0) -> float:
    candidate = combo.get("cardCount")
    if isinstance(candidate, (int, float)):
        return float(candidate)
    candidate = combo.get("length")
    if isinstance(candidate, (int, float)):
        return float(candidate)
    combo_card_ids = combo.get("cardIds")
    if isinstance(combo_card_ids, list):
        return float(len(combo_card_ids))
    combo_cards = combo.get("cards")
    if isinstance(combo_cards, list):
        return float(len(combo_cards))
    return float(fallback_length)


def _action_combo(action: dict[str, Any]) -> dict[str, Any]:
    combination = _as_dict(action.get("combination"))
    if combination:
        return combination
    return _as_dict(action.get("combo"))


def _action_type(action: dict[str, Any]) -> str:
    candidate = action.get("type")
    if isinstance(candidate, str) and candidate in ACTION_TYPES:
        return candidate
    if candidate == "play":
        return "play_cards"
    if candidate == "pass":
        return "pass_turn"
    if candidate == "assign_dragon_gift":
        return "assign_dragon_trick"
    if action.get("cardIds") or action.get("cards") or action.get("combo"):
        return "play_cards"
    return "advance_phase"


def _action_card_ids(action: dict[str, Any]) -> list[str]:
    card_ids = action.get("cardIds")
    if isinstance(card_ids, list):
        return [str(card_id) for card_id in card_ids]

    cards = action.get("cards")
    if isinstance(cards, list):
        return [str(card_id) for card_id in cards]

    combo = _action_combo(action)
    combo_card_ids = combo.get("cardIds")
    if isinstance(combo_card_ids, list):
        return [str(card_id) for card_id in combo_card_ids]
    combo_cards = combo.get("cards")
    if isinstance(combo_cards, list):
        return [str(card_id) for card_id in combo_cards]

    return []


def _bool_number(value: Any) -> float:
    return 1.0 if value else 0.0


def _feature_value(snapshot: dict[str, Any], key: str, fallback: float = 0.0) -> float:
    candidate = snapshot.get(key)
    if isinstance(candidate, bool):
        return 1.0 if candidate else 0.0
    if isinstance(candidate, (int, float)):
        return float(candidate)
    return fallback


def _state_snapshot(candidate_features: dict[str, Any], state_features: dict[str, Any]) -> dict[str, Any]:
    nested = _as_dict(candidate_features.get("state"))
    return nested if nested else state_features


def _projected_snapshot(candidate_features: dict[str, Any]) -> dict[str, Any]:
    return _as_dict(candidate_features.get("projected_state"))


def _satisfies_wish(state: dict[str, Any], action: dict[str, Any], combo: dict[str, Any]) -> float:
    wish_rank = state.get("currentWish")
    if not isinstance(wish_rank, (int, float)):
        return 0.0

    actual_ranks = combo.get("actualRanks")
    if isinstance(actual_ranks, list):
        return 1.0 if wish_rank in actual_ranks else 0.0

    primary_rank = combo.get("primaryRank")
    if not isinstance(primary_rank, (int, float)):
        primary_rank = combo.get("rank")
    if isinstance(primary_rank, (int, float)):
        return 1.0 if float(primary_rank) == float(wish_rank) else 0.0

    return 0.0


def _overtakes_partner(state: dict[str, Any], actor_seat: str, action_type: str) -> float:
    if action_type != "play_cards":
        return 0.0

    trick = _current_trick(state)
    current_winner = trick.get("currentWinner")
    return 1.0 if current_winner == get_partner_seat(actor_seat) else 0.0


def build_feature_row(
    state_raw: dict[str, Any] | None,
    phase: str,
    actor_seat: str,
    action: dict[str, Any],
    *,
    state_features: dict[str, Any] | None = None,
    candidate_features: dict[str, Any] | None = None,
) -> dict[str, float]:
    state = state_raw if isinstance(state_raw, dict) else {}
    state_snapshot = _state_snapshot(
        _as_dict(candidate_features),
        _as_dict(state_features),
    )
    projected_snapshot = _projected_snapshot(_as_dict(candidate_features))
    combo = _action_combo(action)
    current_combo = _current_combination(state)
    action_type = _action_type(action)
    card_ids = _action_card_ids(action)
    combo_kind = _combo_kind(combo)
    current_phase = phase_alias(phase)

    partner = get_partner_seat(actor_seat)
    left_opponent = get_left_opponent_seat(actor_seat)
    right_opponent = get_right_opponent_seat(actor_seat)

    features = _empty_features()

    self_hand_size = _hand_size(state, actor_seat)
    partner_hand_size = _hand_size(state, partner)
    left_hand_size = _hand_size(state, left_opponent)
    right_hand_size = _hand_size(state, right_opponent)
    opponent_near_out_count = int(left_hand_size <= 2) + int(right_hand_size <= 2)

    features["self_hand_size"] = float(self_hand_size)
    features["partner_hand_size"] = float(partner_hand_size)
    features["left_opponent_hand_size"] = float(left_hand_size)
    features["right_opponent_hand_size"] = float(right_hand_size)
    features["cards_remaining_self"] = float(self_hand_size)
    features["cards_remaining_partner"] = float(partner_hand_size)
    features["cards_remaining_left_opponent"] = float(left_hand_size)
    features["cards_remaining_right_opponent"] = float(right_hand_size)
    features["self_near_out_flag"] = _bool_number(self_hand_size <= 2)
    features["partner_near_out_flag"] = _bool_number(partner_hand_size <= 2)
    features["left_opponent_near_out_flag"] = _bool_number(left_hand_size <= 2)
    features["right_opponent_near_out_flag"] = _bool_number(right_hand_size <= 2)
    features["any_opponent_near_out_flag"] = _bool_number(opponent_near_out_count > 0)
    features["opponent_near_out_count"] = float(opponent_near_out_count)

    current_wish = state.get("currentWish")
    if isinstance(current_wish, (int, float)):
        features["wish_active_flag"] = 1.0
        features["wished_rank"] = float(current_wish)

    current_top_combo_kind = _combo_kind(current_combo)
    features["current_top_combo_rank"] = _combo_rank(current_combo)
    features["current_top_combo_length"] = _combo_length(current_combo)
    features[f"current_top_combo_kind_{current_top_combo_kind}"] = 1.0

    trick = _current_trick(state)
    plays = trick.get("plays")
    if not isinstance(plays, list):
        plays = trick.get("entries")
    features["current_trick_size"] = (
        float(len(plays))
        if isinstance(plays, list)
        else _combo_length(current_combo)
    )

    features["pass_select_phase_flag"] = _bool_number(current_phase == "pass_select")
    features["exchange_phase_flag"] = _bool_number(current_phase == "pass_reveal")
    features["pickup_phase_flag"] = _bool_number(current_phase == "exchange_complete")

    for seat_name, prefix in [
        (actor_seat, "actor"),
        (partner, "partner"),
        (left_opponent, "left_opponent"),
        (right_opponent, "right_opponent"),
    ]:
        calls = _calls_for_seat(state, seat_name)
        features[f"{prefix}_called_tichu"] = _bool_number(calls.get("smallTichu"))
        features[f"{prefix}_called_grand_tichu"] = _bool_number(calls.get("grandTichu"))

    features["all_opponents_called_tichu_count"] = float(
        features["left_opponent_called_tichu"] + features["right_opponent_called_tichu"]
    )
    features["all_opponents_called_grand_tichu_count"] = float(
        features["left_opponent_called_grand_tichu"]
        + features["right_opponent_called_grand_tichu"]
    )

    if current_phase in PHASES:
        features[f"phase_{current_phase}"] = 1.0

    if actor_seat in SEATS:
        features[f"actor_is_{actor_seat}"] = 1.0

    active_seat = state.get("activeSeat")
    active_relation = relation_for_seat(actor_seat, active_seat if isinstance(active_seat, str) else None)
    features[f"active_seat_relation_{active_relation}"] = 1.0

    current_leader = trick.get("currentWinner")
    leader_relation = relation_for_seat(
        actor_seat,
        current_leader if isinstance(current_leader, str) else None,
    )
    features[f"current_leader_relation_{leader_relation}"] = 1.0

    features[f"action_type_{action_type}"] = 1.0
    features[f"action_combo_{combo_kind}"] = 1.0
    features["action_rank"] = _combo_rank(combo)
    features["action_length"] = _combo_length(combo, len(card_ids))
    features["cards_used_count"] = float(len(card_ids))
    features["uses_bomb_flag"] = _feature_value(_as_dict(candidate_features), "uses_bomb")
    if features["uses_bomb_flag"] == 0:
        features["uses_bomb_flag"] = _bool_number(
            combo.get("isBomb") or combo_kind.startswith("bomb-")
        )
    features["uses_dragon_flag"] = _feature_value(_as_dict(candidate_features), "uses_dragon")
    if features["uses_dragon_flag"] == 0:
        features["uses_dragon_flag"] = _bool_number("dragon" in card_ids)
    features["uses_phoenix_flag"] = _feature_value(_as_dict(candidate_features), "uses_phoenix")
    if features["uses_phoenix_flag"] == 0:
        features["uses_phoenix_flag"] = _bool_number("phoenix" in card_ids)
    features["uses_dog_flag"] = _feature_value(_as_dict(candidate_features), "uses_dog")
    if features["uses_dog_flag"] == 0:
        features["uses_dog_flag"] = _bool_number("dog" in card_ids or combo_kind == "dog")
    features["uses_mahjong_flag"] = _feature_value(_as_dict(candidate_features), "uses_mahjong")
    if features["uses_mahjong_flag"] == 0:
        features["uses_mahjong_flag"] = _bool_number("mahjong" in card_ids)
    features["satisfies_wish_flag"] = _feature_value(_as_dict(candidate_features), "satisfies_wish")
    if features["satisfies_wish_flag"] == 0:
        features["satisfies_wish_flag"] = _satisfies_wish(state, action, combo)
    features["overtakes_partner_flag"] = _feature_value(_as_dict(candidate_features), "overtakes_partner")
    if features["overtakes_partner_flag"] == 0:
        features["overtakes_partner_flag"] = _overtakes_partner(state, actor_seat, action_type)
    features["likely_wins_current_trick_flag"] = _feature_value(
        _as_dict(candidate_features),
        "likely_wins_current_trick",
    )
    features["pass_action_flag"] = _bool_number(action_type == "pass_turn")

    features["hand_quality_score"] = _feature_value(state_snapshot, "hand_quality_score")
    features["future_hand_quality_delta"] = _feature_value(
        _as_dict(candidate_features),
        "future_hand_quality_delta",
    )
    features["control_retention_estimate"] = _feature_value(
        _as_dict(candidate_features),
        "control_retention_estimate",
    )
    features["structure_preservation_score"] = _feature_value(
        _as_dict(candidate_features),
        "structure_preservation_score",
    )
    features["dead_singles_count_before"] = _feature_value(
        _as_dict(candidate_features),
        "dead_singles_count_before",
        _feature_value(state_snapshot, "dead_singles_count"),
    )
    features["dead_singles_count_after"] = _feature_value(
        _as_dict(candidate_features),
        "dead_singles_count_after",
        _feature_value(projected_snapshot, "dead_singles_count"),
    )
    features["dead_singles_reduction"] = _feature_value(
        _as_dict(candidate_features),
        "dead_singles_reduction",
    )
    features["combo_count_before"] = _feature_value(
        _as_dict(candidate_features),
        "combo_count_before",
        _feature_value(state_snapshot, "combo_count"),
    )
    features["combo_count_after"] = _feature_value(
        _as_dict(candidate_features),
        "combo_count_after",
        _feature_value(projected_snapshot, "combo_count"),
    )
    features["finishability_score"] = _feature_value(state_snapshot, "finishability_score")
    features["endgame_pressure"] = _feature_value(
        _as_dict(candidate_features),
        "endgame_pressure",
        _feature_value(state_snapshot, "endgame_pressure"),
    )
    features["partner_advantage_estimate"] = _feature_value(
        _as_dict(candidate_features),
        "partner_advantage_estimate",
        _feature_value(state_snapshot, "partner_advantage_estimate"),
    )
    features["opponent_threat_estimate"] = _feature_value(
        _as_dict(candidate_features),
        "opponent_threat_estimate",
        _feature_value(state_snapshot, "opponent_threat_estimate"),
    )
    features["resource_cost_score"] = _feature_value(
        _as_dict(candidate_features),
        "resource_cost_score",
    )
    features["shed_value_score"] = _feature_value(
        _as_dict(candidate_features),
        "shed_value_score",
    )
    features["control_value_score"] = _feature_value(
        _as_dict(candidate_features),
        "control_value_score",
        _feature_value(state_snapshot, "control_value_score"),
    )
    features["bomb_count_in_hand"] = _feature_value(state_snapshot, "bomb_count_in_hand")
    features["dragon_in_hand"] = _feature_value(state_snapshot, "dragon_in_hand")
    features["phoenix_in_hand"] = _feature_value(state_snapshot, "phoenix_in_hand")
    features["dog_in_hand"] = _feature_value(state_snapshot, "dog_in_hand")
    features["mahjong_in_hand"] = _feature_value(state_snapshot, "mahjong_in_hand")
    features["control_cards_count"] = _feature_value(state_snapshot, "control_cards_count")
    features["premium_resource_pressure"] = _feature_value(
        _as_dict(candidate_features),
        "premium_resource_pressure",
        _feature_value(state_snapshot, "premium_resource_pressure"),
    )
    features["singles_count"] = _feature_value(state_snapshot, "singles_count")
    features["pairs_count"] = _feature_value(state_snapshot, "pairs_count")
    features["triples_count"] = _feature_value(state_snapshot, "triples_count")
    features["straights_count"] = _feature_value(state_snapshot, "straights_count")
    features["pair_runs_count"] = _feature_value(state_snapshot, "pair_runs_count")
    features["bombs_count"] = _feature_value(state_snapshot, "bombs_count")
    features["isolated_high_singles_count"] = _feature_value(
        state_snapshot,
        "isolated_high_singles_count",
    )
    features["isolated_low_singles_count"] = _feature_value(
        state_snapshot,
        "isolated_low_singles_count",
    )

    urgency_mode = _as_dict(candidate_features).get("urgency_mode") or state_snapshot.get("urgency_mode")
    if isinstance(urgency_mode, str) and urgency_mode in URGENCY_MODES:
        features[f"urgency_mode_{urgency_mode}"] = 1.0

    if action_type == "select_pass":
        selected = [action.get("left"), action.get("partner"), action.get("right")]
        features["cards_used_count"] = float(
            len([card_id for card_id in selected if isinstance(card_id, str)])
        )

    return features


def action_signature(action: dict[str, Any]) -> tuple[Any, ...]:
    action_type = _action_type(action)
    if action_type == "play_cards":
        return (
            action_type,
            action.get("seat"),
            tuple(sorted(_action_card_ids(action))),
            action.get("phoenixAsRank"),
            action.get("wishRank"),
        )
    if action_type == "select_pass":
        return (
            action_type,
            action.get("seat"),
            action.get("left"),
            action.get("partner"),
            action.get("right"),
        )
    if action_type == "assign_dragon_trick":
        return (
            action_type,
            action.get("seat"),
            action.get("recipient") or action.get("target"),
        )
    if action_type == "advance_phase":
        return (action_type, action.get("actor"))
    return (action_type, action.get("seat") or action.get("actor"))


def extract_actor_legal_actions(legal_actions: Any, actor_seat: str) -> list[dict[str, Any]]:
    if isinstance(legal_actions, list):
        return [entry for entry in legal_actions if isinstance(entry, dict)]

    if isinstance(legal_actions, dict):
        actor_actions = legal_actions.get(actor_seat, [])
        if isinstance(actor_actions, list):
            return [entry for entry in actor_actions if isinstance(entry, dict)]

    return []
