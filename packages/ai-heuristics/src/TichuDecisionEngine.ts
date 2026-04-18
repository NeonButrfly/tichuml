import { getOpponentSeats, type EngineAction, type GameState, type SeatId } from "@tichuml/engine";
import { HEURISTIC_WEIGHTS } from "./HeuristicScorer.js";
import { buildHandEvaluation } from "./HandAnalysis.js";
import { partnerHasCalledTichu } from "./HeuristicContext.js";
import type { CandidateDecision } from "./types.js";
import { appendUniqueTags } from "./utils.js";

export function scoreGrandTichu(
  state: GameState,
  seat: SeatId,
  action: EngineAction
): CandidateDecision {
  const analysis = buildHandEvaluation(state, seat);
  const hasMahjong = state.hands[seat].some(
    (card) => card.kind === "special" && card.special === "mahjong"
  );
  const confidence =
    analysis.legacyCallStrength * 2.6 +
    analysis.expectedTrickWins * 92 +
    analysis.synergyScore * 8 +
    analysis.controlCount * 78 +
    analysis.bombCount * 118 -
    analysis.fragmentation * 42 -
    analysis.loserCount * 16 +
    analysis.finishPlanScore * 1.6 -
    analysis.deadSingleCount * 22 +
    (hasMahjong ? 18 : 0);
  const shouldCall =
    state.hands[seat].length === 8 &&
    analysis.legacyCallStrength >= HEURISTIC_WEIGHTS.calls.legacyGrandThreshold &&
    analysis.tichuViable &&
    (analysis.controlCount > 0 ||
      analysis.bombCount > 0 ||
      analysis.highClusterCount >= 2 ||
      analysis.highRankCount >= 5) &&
    analysis.loserCount <= 2 &&
    confidence >= HEURISTIC_WEIGHTS.calls.grandThreshold;

  if (action.type === "call_grand_tichu") {
    return {
      actor: seat,
      action,
      score: shouldCall ? 820 + confidence : -120,
      tags: [],
      reasons: shouldCall
        ? [
            "opening hand has enough control and combo density for Grand Tichu",
            "legacy call strength and current structure both clear the Grand Tichu threshold"
          ]
        : ["opening hand does not justify a Grand Tichu commitment"]
    };
  }

  return {
    actor: seat,
    action,
    score: shouldCall ? 120 : 700,
    tags: [],
    reasons: shouldCall
      ? ["declining leaves value on the table despite a strong hand"]
      : ["declining Grand Tichu avoids a high-variance overcall"]
  };
}

export function scoreTichu(
  state: GameState,
  seat: SeatId,
  action: EngineAction
): CandidateDecision {
  if (partnerHasCalledTichu(state, seat)) {
    return {
      actor: seat,
      action,
      score: -1000,
      tags: [],
      reasons: ["partner already holds the team Tichu call slot"]
    };
  }

  const analysis = buildHandEvaluation(state, seat);
  const hasMahjong = state.hands[seat].some(
    (card) => card.kind === "special" && card.special === "mahjong"
  );
  const confidence =
    analysis.legacyCallStrength * 1.8 +
    analysis.expectedTrickWins * 78 +
    analysis.synergyScore * 6 +
    analysis.controlCount * 64 +
    analysis.bombCount * 96 -
    analysis.fragmentation * 34 -
    state.hands[seat].length * 2 -
    analysis.loserCount * 14 +
    analysis.finishPlanScore * 1.35 -
    analysis.deadSingleCount * 18 +
    (hasMahjong ? 12 : 0);
  const callThreshold =
    state.hands[seat].length <= 6
      ? HEURISTIC_WEIGHTS.calls.tichuThreshold6
      : state.hands[seat].length <= 10
        ? HEURISTIC_WEIGHTS.calls.tichuThreshold10
        : HEURISTIC_WEIGHTS.calls.tichuThreshold14;
  const shouldCall =
    analysis.legacyCallStrength >= HEURISTIC_WEIGHTS.calls.legacyTichuThreshold &&
    analysis.tichuViable &&
    analysis.loserCount <= 4 &&
    confidence >= callThreshold;

  return {
    actor: seat,
    action,
    score: shouldCall ? 760 + confidence : -60,
    tags: [],
    reasons: shouldCall
      ? [
          "control cards and combo density support a Tichu line",
          "legacy call strength agrees with the current structural evaluation"
        ]
      : ["hand quality is not strong enough to justify a Tichu call"]
  };
}

export function scoreDragonGift(
  state: GameState,
  seat: SeatId,
  action: EngineAction
): CandidateDecision {
  const recipient = action.type === "assign_dragon_trick" ? action.recipient : getOpponentSeats(seat)[0]!;
  const nextLeader = state.pendingDragonGift?.nextLeader ?? null;
  const calledTichu = state.calls[recipient].smallTichu || state.calls[recipient].grandTichu;
  const threatScore =
    (state.hands[recipient].length <= 1
      ? 300
      : state.hands[recipient].length <= 2
        ? 180
        : state.hands[recipient].length <= 4
          ? 60
          : -state.hands[recipient].length * 32) +
    (calledTichu ? 90 : 0) +
    (recipient === nextLeader ? 70 : 0);
  const tags: CandidateDecision["tags"] = [];
  appendUniqueTags(tags, "DRAGON_SAFE_TARGET", "DRAGON_GIFT_LOWEST_THREAT");

  return {
    actor: seat,
    action,
    score:
      HEURISTIC_WEIGHTS.dragonGift.base - threatScore,
    tags,
    reasons: [
      state.hands[recipient].length >= 3
        ? "prefer giving Dragon points to the lower-threat opponent with more cards remaining"
        : "recipient pressure is already high, so this is the least threatening legal opponent",
      ...(recipient === nextLeader
        ? ["avoid giving the Dragon trick to the opponent who would convert initiative most efficiently"]
        : []),
      ...(calledTichu ? ["avoid feeding bonus points to a Tichu caller"] : [])
    ]
  };
}
