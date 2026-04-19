from __future__ import annotations

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


def get_partner_seat(seat: str) -> str:
    seat_index = int(seat.split("-")[-1])
    return f"seat-{(seat_index + 2) % 4}"


def get_left_opponent_seat(seat: str) -> str:
    seat_index = int(seat.split("-")[-1])
    return f"seat-{(seat_index + 3) % 4}"


def get_right_opponent_seat(seat: str) -> str:
    seat_index = int(seat.split("-")[-1])
    return f"seat-{(seat_index + 1) % 4}"


def feature_order() -> list[str]:
    ordered = [
        "actor_hand_size",
        "partner_hand_size",
        "left_opponent_hand_size",
        "right_opponent_hand_size",
        "actor_near_out",
        "partner_near_out",
        "left_opponent_near_out",
        "right_opponent_near_out",
        "wish_active",
        "wish_rank",
        "top_combo_rank",
        "actor_called_tichu",
        "actor_called_grand_tichu",
        "partner_called_tichu",
        "partner_called_grand_tichu",
        "left_opponent_called_tichu",
        "left_opponent_called_grand_tichu",
        "right_opponent_called_tichu",
        "right_opponent_called_grand_tichu",
        "action_rank",
        "action_length",
        "cards_used",
        "uses_bomb",
        "uses_dragon",
        "uses_phoenix",
        "uses_dog",
        "uses_mahjong",
        "satisfies_wish",
        "overtakes_partner",
        "select_pass_card_count",
    ]

    ordered.extend([f"phase_{phase}" for phase in PHASES])
    ordered.extend([f"actor_is_{seat}" for seat in SEATS])
    ordered.extend([f"top_combo_kind_{kind}" for kind in COMBO_TYPES])
    ordered.extend([f"action_type_{action_type}" for action_type in ACTION_TYPES])
    ordered.extend([f"action_combo_{combo_type}" for combo_type in COMBO_TYPES])
    return ordered


FEATURE_ORDER = feature_order()


def _empty_features() -> dict[str, float]:
    return {key: 0.0 for key in FEATURE_ORDER}


def _hand_size(state: dict[str, Any], seat: str) -> int:
    hands = state.get("hands", {})
    cards = hands.get(seat, [])
    return len(cards) if isinstance(cards, list) else 0


def _calls_for_seat(state: dict[str, Any], seat: str) -> dict[str, Any]:
    calls = state.get("calls", {})
    candidate = calls.get(seat, {})
    return candidate if isinstance(candidate, dict) else {}


def _current_combination(state: dict[str, Any]) -> dict[str, Any]:
    trick = state.get("currentTrick")
    if not isinstance(trick, dict):
        return {}
    combo = trick.get("currentCombination", {})
    return combo if isinstance(combo, dict) else {}


def _combo_kind(combo: dict[str, Any]) -> str:
    candidate = combo.get("kind")
    if isinstance(candidate, str) and candidate in COMBO_TYPES:
        return candidate
    return "unknown"


def _combo_rank(combo: dict[str, Any]) -> float:
    candidate = combo.get("primaryRank")
    return float(candidate) if isinstance(candidate, (int, float)) else 0.0


def _action_combo(action: dict[str, Any]) -> dict[str, Any]:
    combo = action.get("combination", {})
    return combo if isinstance(combo, dict) else {}


def _action_type(action: dict[str, Any]) -> str:
    candidate = action.get("type")
    if isinstance(candidate, str) and candidate in ACTION_TYPES:
      return candidate
    return "play_cards" if action.get("cardIds") else "advance_phase"


def _action_card_ids(action: dict[str, Any]) -> list[str]:
    card_ids = action.get("cardIds", [])
    return [str(card_id) for card_id in card_ids] if isinstance(card_ids, list) else []


def _satisfies_wish(state: dict[str, Any], action: dict[str, Any], combo: dict[str, Any]) -> float:
    wish_rank = state.get("currentWish")
    if not isinstance(wish_rank, (int, float)):
        return 0.0

    actual_ranks = combo.get("actualRanks")
    if isinstance(actual_ranks, list):
        return 1.0 if wish_rank in actual_ranks else 0.0

    primary_rank = combo.get("primaryRank")
    if isinstance(primary_rank, (int, float)):
        return 1.0 if float(primary_rank) == float(wish_rank) else 0.0

    return 0.0


def _overtakes_partner(state: dict[str, Any], actor_seat: str, action_type: str) -> float:
    if action_type != "play_cards":
        return 0.0

    trick = state.get("currentTrick")
    if not isinstance(trick, dict):
        return 0.0

    current_winner = trick.get("currentWinner")
    return 1.0 if current_winner == get_partner_seat(actor_seat) else 0.0


def build_feature_row(
    state_raw: dict[str, Any] | None,
    phase: str,
    actor_seat: str,
    action: dict[str, Any],
) -> dict[str, float]:
    state = state_raw if isinstance(state_raw, dict) else {}
    combo = _action_combo(action)
    current_combo = _current_combination(state)
    action_type = _action_type(action)
    card_ids = _action_card_ids(action)
    combo_kind = _combo_kind(combo)

    partner = get_partner_seat(actor_seat)
    left_opponent = get_left_opponent_seat(actor_seat)
    right_opponent = get_right_opponent_seat(actor_seat)

    features = _empty_features()

    actor_hand_size = _hand_size(state, actor_seat)
    partner_hand_size = _hand_size(state, partner)
    left_hand_size = _hand_size(state, left_opponent)
    right_hand_size = _hand_size(state, right_opponent)

    features["actor_hand_size"] = float(actor_hand_size)
    features["partner_hand_size"] = float(partner_hand_size)
    features["left_opponent_hand_size"] = float(left_hand_size)
    features["right_opponent_hand_size"] = float(right_hand_size)
    features["actor_near_out"] = 1.0 if actor_hand_size <= 2 else 0.0
    features["partner_near_out"] = 1.0 if partner_hand_size <= 2 else 0.0
    features["left_opponent_near_out"] = 1.0 if left_hand_size <= 2 else 0.0
    features["right_opponent_near_out"] = 1.0 if right_hand_size <= 2 else 0.0

    current_wish = state.get("currentWish")
    if isinstance(current_wish, (int, float)):
        features["wish_active"] = 1.0
        features["wish_rank"] = float(current_wish)

    top_combo_kind = _combo_kind(current_combo)
    features[f"top_combo_kind_{top_combo_kind}"] = 1.0
    features["top_combo_rank"] = _combo_rank(current_combo)

    for seat_name, prefix in [
        (actor_seat, "actor"),
        (partner, "partner"),
        (left_opponent, "left_opponent"),
        (right_opponent, "right_opponent"),
    ]:
        calls = _calls_for_seat(state, seat_name)
        features[f"{prefix}_called_tichu"] = 1.0 if calls.get("smallTichu") else 0.0
        features[f"{prefix}_called_grand_tichu"] = (
            1.0 if calls.get("grandTichu") else 0.0
        )

    if phase in PHASES:
        features[f"phase_{phase}"] = 1.0

    if actor_seat in SEATS:
        features[f"actor_is_{actor_seat}"] = 1.0

    features[f"action_type_{action_type}"] = 1.0
    features[f"action_combo_{combo_kind}"] = 1.0
    features["action_rank"] = _combo_rank(combo)
    features["action_length"] = float(combo.get("cardCount", len(card_ids)) or 0)
    features["cards_used"] = float(len(card_ids))
    features["uses_bomb"] = (
        1.0 if combo.get("isBomb") or combo_kind.startswith("bomb-") else 0.0
    )
    features["uses_dragon"] = 1.0 if "dragon" in card_ids else 0.0
    features["uses_phoenix"] = 1.0 if "phoenix" in card_ids else 0.0
    features["uses_dog"] = 1.0 if "dog" in card_ids or combo_kind == "dog" else 0.0
    features["uses_mahjong"] = 1.0 if "mahjong" in card_ids else 0.0
    features["satisfies_wish"] = _satisfies_wish(state, action, combo)
    features["overtakes_partner"] = _overtakes_partner(state, actor_seat, action_type)

    if action_type == "select_pass":
        selected = [action.get("left"), action.get("partner"), action.get("right")]
        features["select_pass_card_count"] = float(
            len([card_id for card_id in selected if isinstance(card_id, str)])
        )
        features["cards_used"] = features["select_pass_card_count"]

    return features


def action_signature(action: dict[str, Any]) -> tuple[Any, ...]:
    action_type = _action_type(action)
    if action_type == "play_cards":
        return (
            action_type,
            action.get("seat"),
            tuple(sorted(_action_card_ids(action))),
            action.get("phoenixAsRank"),
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
        return (action_type, action.get("seat"), action.get("recipient"))
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
