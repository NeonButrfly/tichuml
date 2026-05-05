import {
  SEAT_IDS,
  SYSTEM_ACTOR,
  type EngineAction,
  type LegalAction,
  type SeatId,
  type StandardRank
} from "@tichuml/engine";
import { engineFoundation } from "@tichuml/engine";
import {
  parseExplorationProfile,
  readRuntimeEnv,
  type ExplorationProfile
} from "@tichuml/shared";
import {
  buildAggressionContextV1,
  computeGrandTichuAggressionV1,
  computePassReductionV1,
  computeTichuAggressionV1
} from "./aggression-tuning.js";
import { createHeuristicFeatureAnalyzer } from "./HeuristicFeatureAnalyzer.js";
import { chooseMahjongWishRank } from "./HandAnalysis.js";
import { createPassSelectionAction, scorePassSelection } from "./PassHeuristicEngine.js";
import { scorePlayAction, scorePassTurn } from "./PlayHeuristicEngine.js";
import { deepenTacticalCandidates } from "./TacticalLookahead.js";
import { scoreDragonGift, scoreGrandTichu, scoreTichu } from "./TichuDecisionEngine.js";
import type {
  CandidateDecision,
  ChosenDecision,
  ExplorationSelectionMetadata,
  HeadlessDecisionContext,
  HeuristicDecisionOptions,
  HeuristicPolicy,
  PassLegalAction,
  PlayLegalAction,
  TacticalFeatureSnapshot
} from "./types.js";
import { getConcreteActionSortKey, isPassLegalAction, isPlayLegalAction } from "./utils.js";

export type {
  ChosenDecision,
  HeadlessDecisionContext,
  HeuristicPolicy,
  HandEvaluation,
  TacticalFeatureSnapshot,
  CandidateActionFeatureSnapshot,
  HeuristicDecisionOptions,
  PassSelectionMetadata,
  PolicyExplanation,
  PolicyTag,
  UrgencyProfile,
  TeamplaySnapshot
} from "./types.js";
export {
  buildHandEvaluation,
  buildHandEvaluationAfterRemovingCards,
  chooseMahjongWishRank,
  chooseWishRank,
  describeMahjongWishSkip
} from "./HandAnalysis.js";
export { buildUrgencyProfile } from "./HeuristicContext.js";
export { createHeuristicFeatureAnalyzer } from "./HeuristicFeatureAnalyzer.js";
export {
  evaluateGrandTichuCall,
  evaluateTichuCall,
  type TichuCallEvaluation
} from "./tichu-call-evaluator.js";
export {
  SERVER_HEURISTIC_FAST_PATH_LIMITS,
  SERVER_HEURISTIC_FAST_PATH_WEIGHTS,
  buildServerFastPathState,
  chooseServerFastPathDecision,
  generateFastPassSelectCandidates,
  generateFastTrickPlayCandidates,
  type ServerFastPathCandidate,
  type ServerFastPathDecision,
  type ServerFastPathState
} from "./serverFastPath.js";
export { createPassSelectionAction, scorePassSelection } from "./PassHeuristicEngine.js";
export {
  buildCanonicalDecisionRequest,
  createCanonicalDecisionLegalActions,
  type CanonicalDecisionRequestBuildResult
} from "./decision-contract.js";

function traceStraightResponsesEnabled(): boolean {
  const rawValue = readRuntimeEnv("TICHU_TRACE_STRAIGHT_RESPONSES")
    ?.trim()
    .toLowerCase();
  return rawValue === "1" || rawValue === "true" || rawValue === "yes";
}

function parseFiniteEnvNumber(name: string): number | null {
  const rawValue = readRuntimeEnv(name)?.trim();
  if (!rawValue) {
    return null;
  }
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveExplorationConfig(
  options?: HeuristicDecisionOptions
): {
  profile: ExplorationProfile;
  rate: number | null;
  topN: number | null;
  maxScoreGap: number | null;
} {
  const profile =
    options?.exploration?.profile ??
    parseExplorationProfile(readRuntimeEnv("TICHU_EXPLORATION_PROFILE"), "off");
  const rate =
    options?.exploration?.rate ??
    parseFiniteEnvNumber("TICHU_EXPLORATION_RATE");
  const topN =
    options?.exploration?.topN ??
    parseFiniteEnvNumber("TICHU_EXPLORATION_TOP_N");
  const maxScoreGap =
    options?.exploration?.maxScoreGap ??
    parseFiniteEnvNumber("TICHU_EXPLORATION_MAX_SCORE_GAP");
  return {
    profile,
    rate: rate !== null && rate > 0 ? rate : null,
    topN: topN !== null && topN > 0 ? Math.floor(topN) : null,
    maxScoreGap: maxScoreGap !== null && maxScoreGap >= 0 ? maxScoreGap : null
  };
}

function hashSelectionKey(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function deterministicUnitInterval(seed: string): number {
  return hashSelectionKey(seed) / 0xffffffff;
}

function buildExplorationSelection(config: {
  candidates: CandidateDecision[];
  selectedByScore: CandidateDecision;
  selectionKey?: string;
  options?: HeuristicDecisionOptions;
}): {
  selected: CandidateDecision;
  metadata: ExplorationSelectionMetadata;
} {
  const exploration = resolveExplorationConfig(config.options);
  const topCandidate = config.candidates[0] ?? config.selectedByScore;
  const baseMetadata: ExplorationSelectionMetadata = {
    exploration_enabled: exploration.profile !== "off",
    exploration_profile: exploration.profile,
    exploration_selected: false,
    exploration_reason: null,
    original_top_action_type: topCandidate?.action.type ?? null,
    original_top_score: topCandidate?.score ?? null,
    selected_rank_in_candidates: 0,
    selected_score: config.selectedByScore.score,
    score_gap_from_top:
      topCandidate ? Number((topCandidate.score - config.selectedByScore.score).toFixed(4)) : null,
    exploration_config: {
      rate: exploration.rate,
      top_n: exploration.topN,
      max_score_gap: exploration.maxScoreGap
    }
  };

  if (exploration.profile === "off" || config.candidates.length <= 1) {
    return {
      selected: config.selectedByScore,
      metadata: baseMetadata
    };
  }

  const defaultRate =
    exploration.profile === "training_diversity" ? 0.2 : 0.08;
  const defaultTopN =
    exploration.profile === "training_diversity" ? 4 : 2;
  const defaultMaxScoreGap =
    exploration.profile === "training_diversity" ? 20 : 8;
  const explorationRate = exploration.rate ?? defaultRate;
  const topN = exploration.topN ?? defaultTopN;
  const maxScoreGap = exploration.maxScoreGap ?? defaultMaxScoreGap;
  const eligiblePool = config.candidates
    .slice(0, Math.max(1, topN))
    .filter((candidate, index) => {
      if (index === 0) {
        return true;
      }
      if (topCandidate.actor !== candidate.actor) {
        return false;
      }
      if (topCandidate.score - candidate.score > maxScoreGap) {
        return false;
      }
      if (candidate.tags.includes("unjustified_partner_bomb")) {
        return false;
      }
      return true;
    });

  if (eligiblePool.length <= 1) {
    return {
      selected: config.selectedByScore,
      metadata: baseMetadata
    };
  }

  const selectionKey =
    config.options?.selectionKey ??
    config.selectionKey ??
    [
      topCandidate.actor,
      topCandidate.action.type,
      topCandidate.score,
      ...eligiblePool.map((candidate) => `${candidate.action.type}:${candidate.score}`)
    ].join("|");
  const shouldExplore =
    deterministicUnitInterval(`${selectionKey}|explore`) < explorationRate;
  if (!shouldExplore) {
    return {
      selected: config.selectedByScore,
      metadata: baseMetadata
    };
  }

  const alternatePool = eligiblePool.slice(1);
  const chosenOffset = Math.min(
    alternatePool.length - 1,
    Math.floor(
      deterministicUnitInterval(`${selectionKey}|pick`) * alternatePool.length
    )
  );
  const selected = alternatePool[Math.max(0, chosenOffset)] ?? config.selectedByScore;
  const selectedRank = Math.max(
    0,
    config.candidates.findIndex((candidate) => candidate === selected)
  );

  return {
    selected,
    metadata: {
      exploration_enabled: true,
      exploration_profile: exploration.profile,
      exploration_selected: selected !== config.selectedByScore,
      exploration_reason:
        selected !== config.selectedByScore
          ? `near_policy_${exploration.profile}`
          : null,
      original_top_action_type: topCandidate.action.type,
      original_top_score: topCandidate.score,
      selected_rank_in_candidates: selectedRank,
      selected_score: selected.score,
      score_gap_from_top: Number((topCandidate.score - selected.score).toFixed(4)),
      exploration_config: {
        rate: explorationRate,
        top_n: topN,
        max_score_gap: maxScoreGap
      }
    }
  };
}

function filterWishLockedActions(
  actions: LegalAction[],
  currentWish: StandardRank | null
): LegalAction[] {
  if (currentWish === null) {
    return actions;
  }

  const wishPlayActions = actions.filter(
    (action): action is PlayLegalAction =>
      isPlayLegalAction(action) && action.combination.actualRanks.includes(currentWish)
  );

  return wishPlayActions.length > 0 ? wishPlayActions : actions;
}

function toConcreteAction(
  state: HeadlessDecisionContext["state"],
  actor: SeatId | typeof SYSTEM_ACTOR,
  legalAction: LegalAction
): EngineAction {
  if (legalAction.type === "select_pass") {
    return createPassSelectionAction(state, legalAction.seat);
  }

  if (
    legalAction.type === "play_cards" &&
    legalAction.availableWishRanks &&
    legalAction.combination.containsMahjong
  ) {
    const wishSelection = chooseMahjongWishRank({
      state,
      seat: legalAction.seat,
      selectedCardIds: legalAction.cardIds,
      availableWishRanks: legalAction.availableWishRanks
    });
    return {
      type: "play_cards",
      seat: legalAction.seat,
      cardIds: legalAction.cardIds,
      ...(legalAction.phoenixAsRank !== undefined ? { phoenixAsRank: legalAction.phoenixAsRank } : {}),
      wishRank: wishSelection.rank
    };
  }

  if (legalAction.type === "assign_dragon_trick") {
    return {
      type: "assign_dragon_trick",
      seat: legalAction.seat,
      recipient: legalAction.recipient
    };
  }

  if (
    actor === SYSTEM_ACTOR ||
    legalAction.type === "call_grand_tichu" ||
    legalAction.type === "decline_grand_tichu" ||
    legalAction.type === "call_tichu" ||
    legalAction.type === "pass_turn" ||
    legalAction.type === "advance_phase"
  ) {
    return legalAction;
  }

  return {
    type: "play_cards",
    seat: legalAction.seat,
    cardIds: legalAction.cardIds,
    ...(legalAction.phoenixAsRank !== undefined ? { phoenixAsRank: legalAction.phoenixAsRank } : {})
  };
}

function scoreConcreteAction(
  ctx: HeadlessDecisionContext,
  analyzer: ReturnType<typeof createHeuristicFeatureAnalyzer>,
  actor: SeatId | typeof SYSTEM_ACTOR,
  legalAction: LegalAction,
  action: EngineAction
): CandidateDecision {
  const withSharedFeatures = (candidate: CandidateDecision): CandidateDecision => {
    if (candidate.actor === SYSTEM_ACTOR || candidate.features) {
      return candidate;
    }

    const features = analyzer.getCandidateFeatures(candidate.actor, candidate.action, legalAction);
    return features ? { ...candidate, features } : candidate;
  };

  if (actor === SYSTEM_ACTOR || action.type === "advance_phase") {
    return {
      actor,
      action,
      score: 5000,
      reasons: ["required system phase advancement"],
      tags: []
    };
  }

  if (action.type === "call_grand_tichu" || action.type === "decline_grand_tichu") {
    return withSharedFeatures(scoreGrandTichu(ctx.state, actor, action, analyzer));
  }

  if (action.type === "call_tichu") {
    return withSharedFeatures(scoreTichu(ctx.state, actor, action, analyzer));
  }

  if (action.type === "assign_dragon_trick") {
    return withSharedFeatures(scoreDragonGift(ctx.state, actor, action));
  }

  if (action.type === "select_pass") {
    return withSharedFeatures(scorePassSelection(ctx.state, actor, action, analyzer));
  }

  if (action.type === "pass_turn") {
    return withSharedFeatures(scorePassTurn(ctx, actor, action, analyzer));
  }

  if (isPlayLegalAction(legalAction) && action.type === "play_cards") {
    const candidate = scorePlayAction(ctx, actor, legalAction, action, analyzer);
    if (legalAction.availableWishRanks && legalAction.combination.containsMahjong) {
      return withSharedFeatures({
        ...candidate,
        mahjongWish: chooseMahjongWishRank({
          state: ctx.state,
          seat: actor,
          selectedCardIds: legalAction.cardIds,
          availableWishRanks: legalAction.availableWishRanks
        }).metadata
      });
    }
    return withSharedFeatures(candidate);
  }

  return withSharedFeatures({
    actor,
    action,
    score: 0,
    reasons: ["fallback candidate"],
    tags: []
  });
}

function collectCandidates(ctx: HeadlessDecisionContext): CandidateDecision[] {
  const actors: Array<SeatId | typeof SYSTEM_ACTOR> = [SYSTEM_ACTOR, ...SEAT_IDS];
  const candidates: CandidateDecision[] = [];
  const analyzer = createHeuristicFeatureAnalyzer(ctx);

  for (const actor of actors) {
    const rawLegalActions = ctx.legalActions[actor] ?? [];
    const legalActions =
      actor === ctx.state.activeSeat
        ? filterWishLockedActions(rawLegalActions, ctx.state.currentWish)
        : rawLegalActions;

    for (const legalAction of legalActions) {
      const action = toConcreteAction(ctx.state, actor, legalAction);
      candidates.push(scoreConcreteAction(ctx, analyzer, actor, legalAction, action));
    }
  }

  const deepened = deepenTacticalCandidates(ctx, candidates, analyzer);
  const tuned = applyControlledAggressionToCandidates(
    deepened,
    analyzer
  );

  return tuned.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return getConcreteActionSortKey(left.action).localeCompare(
      getConcreteActionSortKey(right.action)
    );
  });
}

function applyControlledAggressionToCandidates(
  candidates: CandidateDecision[],
  analyzer: ReturnType<typeof createHeuristicFeatureAnalyzer>
): CandidateDecision[] {
  const grouped = new Map<
    CandidateDecision["actor"],
    CandidateDecision[]
  >();
  for (const candidate of candidates) {
    const existing = grouped.get(candidate.actor) ?? [];
    existing.push(candidate);
    grouped.set(candidate.actor, existing);
  }

  return candidates.map((candidate) => {
    if (candidate.actor === SYSTEM_ACTOR) {
      return candidate;
    }
    const actorCandidates = grouped.get(candidate.actor) ?? [];
    const playCandidates = actorCandidates.filter(
      (entry) => entry.action.type === "play_cards"
    );
    const legalPlayCount = playCandidates.length;
    const bestPlayScore =
      playCandidates.reduce<number | null>(
        (best, entry) =>
          best === null || entry.score > best ? entry.score : best,
        null
      );
    const stateFeatures = analyzer.getStateFeatures(candidate.actor);
    const clearlyWeakHand =
      stateFeatures.hand_quality_score < 95 &&
      stateFeatures.control_value_score < 75 &&
      stateFeatures.bombs_count === 0 &&
      !stateFeatures.dragon_in_hand &&
      !stateFeatures.phoenix_in_hand &&
      stateFeatures.hand_size >= 8;
    const passReduction =
      candidate.action.type === "pass_turn"
        ? computePassReductionV1({
            legalPlayCount,
            bestPlayScore,
            passScore: candidate.score,
            clearlyWeakHand,
            forcedPass: legalPlayCount === 0
          })
        : null;
    const tichuAggression =
      candidate.action.type === "call_tichu" && candidate.tichuCall
        ? computeTichuAggressionV1({
            shouldCall: candidate.tichuCall.tichu_call_selected,
            confidence: candidate.tichuCall.tichu_call_confidence,
            riskFlags: candidate.tichuCall.tichu_call_risk_flags
          })
        : null;
    const grandTichuAggression =
      candidate.action.type === "call_grand_tichu" && candidate.tichuCall
        ? computeGrandTichuAggressionV1({
            shouldCall: candidate.tichuCall.tichu_call_selected,
            confidence: candidate.tichuCall.tichu_call_confidence,
            riskFlags:
              candidate.tichuCall.grand_tichu_risk_flags.length > 0
                ? candidate.tichuCall.grand_tichu_risk_flags
                : candidate.tichuCall.tichu_call_risk_flags
          })
        : null;
    const aggressionContext =
      passReduction || tichuAggression || grandTichuAggression
        ? buildAggressionContextV1({
            action: candidate.action,
            legalPlayCount,
            passReduction,
            tichuAggression,
            grandTichuAggression
          })
        : undefined;

    return {
      ...candidate,
      score:
        candidate.score +
        (passReduction?.penalty ?? 0) +
        (tichuAggression?.bonus ?? 0) +
        (grandTichuAggression?.bonus ?? 0),
      ...(passReduction ? { pass_reduction_v1: passReduction } : {}),
      ...(tichuAggression
        ? { tichu_aggression_v1: tichuAggression }
        : {}),
      ...(grandTichuAggression
        ? { grand_tichu_aggression_v1: grandTichuAggression }
        : {}),
      ...(aggressionContext
        ? { aggression_context_v1: aggressionContext }
        : {})
    };
  });
}

function summarizePlayCandidates(actions: LegalAction[]): string[] {
  return actions.filter(isPlayLegalAction).map((action) => action.combination.key);
}

function selectSeatEmergencyPassCandidate(
  ctx: HeadlessDecisionContext,
  actor: SeatId
): CandidateDecision | null {
  const passAction = (ctx.legalActions[actor] ?? []).find(
    (action): action is PassLegalAction => isPassLegalAction(action)
  );
  if (!passAction) {
    return null;
  }

  return {
    actor,
    action: passAction,
    score: Number.NEGATIVE_INFINITY,
    reasons: [
      "emergency fallback: forcing pass because the active turn could not resolve a progression action"
    ],
    tags: []
  };
}

function selectEmergencyPassCandidate(
  ctx: HeadlessDecisionContext
): CandidateDecision | null {
  for (const actor of SEAT_IDS) {
    const candidate = selectSeatEmergencyPassCandidate(ctx, actor);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function selectProgressionCandidateForActiveTurn(
  ctx: HeadlessDecisionContext,
  candidates: CandidateDecision[]
): CandidateDecision | null {
  const actor = ctx.state.activeSeat;
  if (
    !actor ||
    ctx.state.phase !== "trick_play" ||
    ctx.state.pendingDragonGift ||
    ctx.state.currentTrick === null ||
    ctx.state.currentTrick.currentCombination.kind !== "straight"
  ) {
    return null;
  }

  const actorActions = ctx.legalActions[actor] ?? [];
  const progressionCandidates = candidates.filter(
    (candidate) =>
      candidate.actor === actor &&
      (candidate.action.type === "play_cards" || candidate.action.type === "pass_turn")
  );

  const traceEnabled = traceStraightResponsesEnabled();
  if (traceEnabled) {
    console.info("[ai] Straight response options", {
      activeSeat: actor,
      leadCombo: ctx.state.currentTrick.currentCombination.key,
      legalResponseCount: actorActions.filter(isPlayLegalAction).length,
      normalizedResponseList: summarizePlayCandidates(actorActions),
      canPass: actorActions.some(isPassLegalAction),
      wishState: ctx.state.currentWish
    });
  }

  const leadingCandidate = candidates[0] ?? null;
  if (
    leadingCandidate &&
    (leadingCandidate.action.type === "play_cards" ||
      leadingCandidate.action.type === "pass_turn")
  ) {
    if (traceEnabled) {
      console.info("[ai] Straight response selected", {
        activeSeat: actor,
        chosenAction: leadingCandidate.action,
        fallbackUsed: false
      });
    }
    return leadingCandidate;
  }

  const selected = progressionCandidates[0] ?? null;
  if (selected) {
    if (traceEnabled) {
      console.info("[ai] Straight response selected", {
        activeSeat: actor,
        chosenAction: selected.action,
        fallbackUsed: false
      });
    }
    return selected;
  }

  const fallbackPass = selectSeatEmergencyPassCandidate(ctx, actor);
  if (fallbackPass && traceEnabled) {
    console.info("[ai] Straight response selected", {
      activeSeat: actor,
      chosenAction: fallbackPass.action,
      fallbackUsed: true
    });
  }

  return fallbackPass;
}

function toChosenDecision(
  selected: CandidateDecision,
  candidates: CandidateDecision[],
  stateFeatures?: TacticalFeatureSnapshot | null,
  exploration?: ExplorationSelectionMetadata
): ChosenDecision {
  return {
    actor: selected.actor,
    action: selected.action,
    explanation: {
      policy: "heuristics-v1",
      actor: selected.actor,
      ...(stateFeatures ? { stateFeatures } : {}),
      candidateScores: candidates.map((candidate) => ({
        action: candidate.action,
        score: candidate.score,
        reasons: candidate.reasons,
        tags: candidate.tags,
        ...(candidate.teamplay ? { teamplay: candidate.teamplay } : {}),
        ...(candidate.features ? { features: candidate.features } : {}),
        ...(candidate.mahjongWish ? { mahjongWish: candidate.mahjongWish } : {}),
        ...(candidate.tichuCall ? { tichuCall: candidate.tichuCall } : {}),
        ...(candidate.passBundle ? { passBundle: candidate.passBundle } : {}),
        ...(candidate.pass_reduction_v1
          ? { pass_reduction_v1: candidate.pass_reduction_v1 }
          : {}),
        ...(candidate.tichu_aggression_v1
          ? { tichu_aggression_v1: candidate.tichu_aggression_v1 }
          : {}),
        ...(candidate.grand_tichu_aggression_v1
          ? {
              grand_tichu_aggression_v1:
                candidate.grand_tichu_aggression_v1
            }
          : {}),
        ...(candidate.aggression_context_v1
          ? { aggression_context_v1: candidate.aggression_context_v1 }
          : {})
      })),
      selectedReasonSummary: selected.reasons,
      selectedTags: selected.tags,
      ...(selected.teamplay ? { selectedTeamplay: selected.teamplay } : {}),
      ...(selected.features ? { selectedFeatures: selected.features } : {}),
      ...(selected.mahjongWish ? { selectedMahjongWish: selected.mahjongWish } : {}),
      ...(selected.tichuCall ? { selectedTichuCall: selected.tichuCall } : {}),
      ...(selected.passBundle ? { selectedPassBundle: selected.passBundle } : {}),
      ...(selected.pass_reduction_v1
        ? { selectedPassReductionV1: selected.pass_reduction_v1 }
        : {}),
      ...(selected.tichu_aggression_v1
        ? { selectedTichuAggressionV1: selected.tichu_aggression_v1 }
        : {}),
      ...(selected.grand_tichu_aggression_v1
        ? {
            selectedGrandTichuAggressionV1:
              selected.grand_tichu_aggression_v1
          }
        : {}),
      ...(selected.aggression_context_v1
        ? { selectedAggressionContextV1: selected.aggression_context_v1 }
        : {}),
      ...(exploration ? { exploration } : {})
    }
  };
}

export const heuristicsV1Policy: HeuristicPolicy = {
  name: "heuristics-v1",
  chooseAction(ctx, options) {
    try {
      const candidates = collectCandidates(ctx);
      const progressionSelected = selectProgressionCandidateForActiveTurn(ctx, candidates);
      const selectedByScore =
        progressionSelected ?? candidates[0] ?? selectEmergencyPassCandidate(ctx);
      const analyzer = createHeuristicFeatureAnalyzer(ctx);
      const selectedStateFeatures =
        selectedByScore && selectedByScore.actor !== SYSTEM_ACTOR
          ? analyzer.getStateFeatures(selectedByScore.actor)
          : null;

      if (!selectedByScore) {
        throw new Error("No legal action candidates available for heuristics-v1.");
      }

      const { selected, metadata: exploration } = buildExplorationSelection({
        candidates,
        selectedByScore,
        ...(options ? { options } : {})
      });

      if (candidates.length === 0) {
        console.error(
          "[ai] No scored legal candidates were available; using emergency pass fallback.",
          {
            actor: selected.actor,
            action: selected.action,
            phase: ctx.state.phase,
            activeSeat: ctx.state.activeSeat,
            currentWish: ctx.state.currentWish
          }
        );
      }

      return toChosenDecision(selected, candidates, selectedStateFeatures, exploration);
    } catch (error) {
      const activeSeatFallback =
        ctx.state.activeSeat && ctx.state.phase === "trick_play"
          ? selectSeatEmergencyPassCandidate(ctx, ctx.state.activeSeat)
          : null;
      const fallback = activeSeatFallback ?? selectEmergencyPassCandidate(ctx);

      console.error(
        "[ai] Failed to resolve legal action candidates; attempting emergency pass fallback.",
        {
          error: error instanceof Error ? error.message : String(error),
          phase: ctx.state.phase,
          activeSeat: ctx.state.activeSeat,
          currentCombination: ctx.state.currentTrick?.currentCombination.key ?? null,
          currentWish: ctx.state.currentWish
        }
      );

      if (!fallback) {
        throw error;
      }

      if (
        ctx.state.phase === "trick_play" &&
        ctx.state.currentTrick?.currentCombination.kind === "straight"
      ) {
        if (traceStraightResponsesEnabled()) {
          console.info("[ai] Straight response selected", {
            activeSeat: fallback.actor,
            chosenAction: fallback.action,
            fallbackUsed: true
          });
        }
      }

      const analyzer = createHeuristicFeatureAnalyzer(ctx);
      const fallbackStateFeatures =
        fallback.actor !== SYSTEM_ACTOR ? analyzer.getStateFeatures(fallback.actor) : null;
      return toChosenDecision(fallback, [], fallbackStateFeatures, {
        exploration_enabled: false,
        exploration_profile: "off",
        exploration_selected: false,
        exploration_reason: null,
        original_top_action_type: fallback.action.type,
        original_top_score: fallback.score,
        selected_rank_in_candidates: 0,
        selected_score: fallback.score,
        score_gap_from_top: 0,
        exploration_config: {
          rate: null,
          top_n: null,
          max_score_gap: null
        }
      });
    }
  }
};

export const deterministicBaselinePolicy = heuristicsV1Policy;

export const heuristicFoundation = {
  policyFamily: "team-aware-heuristics",
  dependsOn: engineFoundation.name,
  readyForHeadlessFlow: true,
  baselinePolicy: heuristicsV1Policy.name
};
