import { getOpponentSeats, type EngineAction, type GameState, type SeatId } from "@tichuml/engine";
import type { HeuristicFeatureAnalyzer } from "./HeuristicFeatureAnalyzer.js";
import { HEURISTIC_WEIGHTS } from "./HeuristicScorer.js";
import { buildHandEvaluation } from "./HandAnalysis.js";
import type { CandidateDecision, TichuCallMetadata } from "./types.js";
import {
  evaluateGrandTichuCall,
  evaluateTichuCall,
  type TichuCallEvaluation
} from "./tichu-call-evaluator.js";
import { appendUniqueTags } from "./utils.js";

function roundScore(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  return Number(value.toFixed(2));
}

function buildTichuCallMetadata(config: {
  kind: "regular" | "grand";
  evaluation: TichuCallEvaluation;
}): TichuCallMetadata {
  return {
    tichu_call_score: roundScore(config.evaluation.score),
    tichu_call_threshold: roundScore(config.evaluation.threshold),
    tichu_call_reason: config.evaluation.reason,
    tichu_call_risk_flags: config.evaluation.risk_flags,
    tichu_call_confidence: config.evaluation.confidence,
    tichu_call_decision: config.evaluation.decision,
    tichu_call_type: config.evaluation.call_type,
    hand_quality_score: config.evaluation.feature_scores.hand_quality,
    control_score: config.evaluation.feature_scores.control,
    exit_path_score: config.evaluation.feature_scores.exit_path,
    fragmentation_penalty: config.evaluation.feature_scores.fragmentation,
    premium_card_score: config.evaluation.feature_scores.premium_cards,
    bomb_score: config.evaluation.feature_scores.bomb_value,
    low_card_burden: config.evaluation.feature_scores.low_card_burden,
    combo_coherence_score: config.evaluation.feature_scores.combo_coherence,
    lead_recovery_score: config.evaluation.feature_scores.lead_recovery,
    partner_context_score: config.evaluation.feature_scores.partner_context,
    opponent_pressure_score: config.evaluation.feature_scores.opponent_pressure,
    score_context_score: config.evaluation.feature_scores.score_context,
    predicted_exit_steps: config.evaluation.predicted.estimated_exit_steps,
    predicted_control_recoveries: config.evaluation.predicted.control_recoveries,
    predicted_loser_groups: config.evaluation.predicted.loser_groups,
    predicted_winner_groups: config.evaluation.predicted.winner_groups,
    predicted_deadwood_count: config.evaluation.predicted.deadwood_count,
    predicted_needs_partner_help: config.evaluation.predicted.needs_partner_help,
    first_out_probability_proxy:
      config.evaluation.predicted.first_out_probability_proxy,
    grand_tichu_call_score:
      config.evaluation.call_type === "grand_tichu" ? config.evaluation.score : null,
    grand_tichu_call_threshold:
      config.evaluation.call_type === "grand_tichu"
        ? config.evaluation.threshold
        : null,
    grand_tichu_call_reason:
      config.evaluation.call_type === "grand_tichu"
        ? config.evaluation.reason
        : null,
    grand_tichu_risk_flags:
      config.evaluation.call_type === "grand_tichu"
        ? config.evaluation.risk_flags
        : [],
    grand_tichu_premium_count:
      config.evaluation.call_type === "grand_tichu"
        ? config.evaluation.premium_count
        : null,
    grand_tichu_unknown_card_risk: config.evaluation.unknown_card_risk,
    grand_tichu_first8_exit_proxy: config.evaluation.first8_exit_proxy,
    tichu_context_notes: config.evaluation.context_notes,
    tichu_call_selected: config.evaluation.decision === "call",
    tichu_call_kind: config.kind
  };
}

export function scoreGrandTichu(
  state: GameState,
  seat: SeatId,
  action: EngineAction,
  analyzer?: HeuristicFeatureAnalyzer
): CandidateDecision {
  const analysis = analyzer?.getHandEvaluation(seat) ?? buildHandEvaluation(state, seat);
  const evaluation = evaluateGrandTichuCall({
    state,
    seat,
    analysis
  });
  const metadata = buildTichuCallMetadata({
    kind: "grand",
    evaluation
  });
  const shouldCall = evaluation.decision === "call";

  if (action.type === "call_grand_tichu") {
    return {
      actor: seat,
      action,
      score: shouldCall ? 820 + evaluation.score : -100_000,
      tags: [],
      reasons: shouldCall
        ? [
            "opening hand has enough premium control and exit structure for Grand Tichu",
            "predictive first-8-card formula clears the Grand Tichu threshold"
          ]
        : ["opening hand does not justify a Grand Tichu commitment"],
      tichuCall: metadata
    };
  }

  return {
    actor: seat,
    action,
    score: shouldCall ? 120 : 700,
    tags: [],
    reasons: shouldCall
      ? ["declining leaves value on the table despite a strong hand"]
      : ["declining Grand Tichu avoids a high-variance overcall"],
    tichuCall: {
      ...metadata,
      tichu_call_selected: !shouldCall,
      tichu_call_reason: shouldCall
        ? "decline_premium_hand_not_preferred"
        : evaluation.reason
    }
  };
}

export function scoreTichu(
  state: GameState,
  seat: SeatId,
  action: EngineAction,
  analyzer?: HeuristicFeatureAnalyzer
): CandidateDecision {
  const analysis = analyzer?.getHandEvaluation(seat) ?? buildHandEvaluation(state, seat);
  const evaluation = evaluateTichuCall({
    state,
    seat,
    analysis
  });
  const metadata = buildTichuCallMetadata({
    kind: "regular",
    evaluation
  });
  const shouldCall = evaluation.decision === "call";

  return {
    actor: seat,
    action,
    score: shouldCall ? 760 + evaluation.score : -100_000,
    tags: [],
    reasons: shouldCall
      ? [
          "predictive formula sees a realistic first-out path",
          "control recovery and exit structure clear the Tichu threshold"
        ]
      : [
          evaluation.reason === "decline_partner_called"
            ? "partner already holds the team Tichu call slot"
            : "predictive formula declines this Tichu call"
        ],
    tichuCall: metadata
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
