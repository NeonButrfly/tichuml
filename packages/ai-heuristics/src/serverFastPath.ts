import {
  getCanonicalCardIdsKey,
  getOpponentSeats,
  getPartnerSeat,
  getTeamForSeat,
  type CallState,
  type Card,
  type DragonGiftState,
  type EngineAction,
  type GameState,
  type LegalAction,
  type PassSelection,
  type SeatId,
  type StandardCard,
  type StandardRank,
  type TrickState
} from "@tichuml/engine";
import {
  cardStrength,
  getConcreteActionSortKey,
  isPassLegalAction,
  isPlayLegalAction,
  isPointCard,
  isStandardCard
} from "./utils.js";

export const SERVER_HEURISTIC_FAST_PATH_LIMITS = {
  pass_select_candidate_cap: 20,
  trick_play_candidate_cap: 20,
  target_latency_ms: 100,
  hard_cap_ms: 200
} as const;

export const SERVER_HEURISTIC_FAST_PATH_WEIGHTS = {
  preserve_bomb_weight: 180,
  preserve_phoenix_weight: 95,
  preserve_dragon_weight: 120,
  preserve_dog_weight: 55,
  preserve_mahjong_weight: 42,
  straight_break_penalty: 18,
  pair_break_penalty: 16,
  triple_break_penalty: 26,
  combo_preservation_weight: 10,
  control_preservation_weight: 8,
  clutter_reduction_weight: 12,
  isolated_low_card_bonus: 18,
  opponent_help_penalty: 15,
  hand_shape_balance_bonus: 14,
  lowest_winning_bonus: 52,
  overkill_penalty: 10,
  pass_conservation_bonus: 34,
  opponent_escape_prevention_bonus: 78,
  endgame_closeout_bonus: 120,
  cheap_wish_satisfaction_bonus: 58,
  bomb_conservation_bonus: 135,
  phoenix_conservation_bonus: 72
} as const;

type FastPathCurrentTrick = Pick<
  TrickState,
  "leader" | "currentWinner" | "currentCombination"
>;
type FastPathDragonGift = Pick<
  DragonGiftState,
  "winner" | "nextLeader" | "roundEndsAfterGift"
>;

export type ServerFastPathState = {
  phase: GameState["phase"];
  activeSeat: SeatId | null;
  passSelections: Partial<Record<SeatId, PassSelection>>;
  handCounts: Record<SeatId, number>;
  actorHand: Card[];
  currentWish: StandardRank | null;
  calls: Record<SeatId, CallState>;
  finishedOrder: SeatId[];
  currentTrick: FastPathCurrentTrick | null;
  pendingDragonGift: FastPathDragonGift | null;
};

export type ServerFastPathCandidate = {
  action: EngineAction;
  score: number;
  reasons: string[];
};

export type ServerFastPathDecision = {
  actor: SeatId;
  action: EngineAction;
  candidateCount: number;
  candidates: ServerFastPathCandidate[];
};

type HandContext = {
  byId: Map<string, Card>;
  rankCounts: Map<number, number>;
  rankPresence: Set<number>;
  neighborCounts: Map<string, number>;
  bombCardIds: Set<string>;
  controlCardIds: Set<string>;
  isolatedLowCardIds: Set<string>;
  pairLikeCount: number;
  tripleLikeCount: number;
  straightLinkCount: number;
  deadSingleCount: number;
  handStrength: number;
};

type RemainingHandMetrics = {
  pairLikeCount: number;
  tripleLikeCount: number;
  straightLinkCount: number;
  deadSingleCount: number;
  removedIsolatedLowCount: number;
};

const FAST_TICHU_CALL_THRESHOLD = 165;
const FAST_GRAND_TICHU_CALL_THRESHOLD = 235;

function countPairs(rankCounts: Map<number, number>): number {
  return [...rankCounts.values()].filter((count) => count >= 2).length;
}

function countTriples(rankCounts: Map<number, number>): number {
  return [...rankCounts.values()].filter((count) => count >= 3).length;
}

function countStraightLinks(rankPresence: Set<number>): number {
  let links = 0;
  for (const rank of rankPresence) {
    if (rankPresence.has(rank + 1)) {
      links += 1;
    }
  }
  return links;
}

function isSpecialCard(
  card: Card,
  special: "mahjong" | "dog" | "phoenix" | "dragon"
): boolean {
  return card.kind === "special" && card.id === special;
}

function buildHandContext(hand: Card[]): HandContext {
  const byId = new Map(hand.map((card) => [card.id, card]));
  const rankCounts = new Map<number, number>();
  const rankPresence = new Set<number>();
  const suitRankMap = new Map<StandardCard["suit"], number[]>();
  const bombCardIds = new Set<string>();
  const controlCardIds = new Set<string>();
  const isolatedLowCardIds = new Set<string>();

  for (const card of hand) {
    if (isStandardCard(card)) {
      rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
      rankPresence.add(card.rank);
      const suitRanks = suitRankMap.get(card.suit) ?? [];
      suitRanks.push(card.rank);
      suitRankMap.set(card.suit, suitRanks);
      if (card.rank >= 12) {
        controlCardIds.add(card.id);
      }
      continue;
    }

    if (card.id === "dragon" || card.id === "phoenix") {
      controlCardIds.add(card.id);
    }
  }

  for (const [rank, count] of rankCounts) {
    if (count === 4) {
      for (const card of hand) {
        if (isStandardCard(card) && card.rank === rank) {
          bombCardIds.add(card.id);
        }
      }
    }
  }

  for (const [suit, ranks] of suitRankMap.entries()) {
    const ordered = [...new Set(ranks)].sort((left, right) => left - right);
    let run: number[] = [];
    for (const rank of ordered) {
      if (run.length === 0 || rank === run[run.length - 1]! + 1) {
        run.push(rank);
      } else {
        if (run.length >= 5) {
          for (const card of hand) {
            if (
              isStandardCard(card) &&
              card.suit === suit &&
              run.includes(card.rank)
            ) {
              bombCardIds.add(card.id);
            }
          }
        }
        run = [rank];
      }
    }
    if (run.length >= 5) {
      for (const card of hand) {
        if (
          isStandardCard(card) &&
          card.suit === suit &&
          run.includes(card.rank)
        ) {
          bombCardIds.add(card.id);
        }
      }
    }
  }

  const neighborCounts = new Map<string, number>();
  for (const card of hand) {
    if (!isStandardCard(card)) {
      neighborCounts.set(card.id, 0);
      continue;
    }
    let neighbors = 0;
    if (rankPresence.has(card.rank - 1)) {
      neighbors += 1;
    }
    if (rankPresence.has(card.rank + 1)) {
      neighbors += 1;
    }
    neighborCounts.set(card.id, neighbors);
    if (
      card.rank <= 8 &&
      (rankCounts.get(card.rank) ?? 0) === 1 &&
      neighbors === 0
    ) {
      isolatedLowCardIds.add(card.id);
    }
  }

  const pairLikeCount = countPairs(rankCounts);
  const tripleLikeCount = countTriples(rankCounts);
  const straightLinkCount = countStraightLinks(rankPresence);
  const deadSingleCount = hand.filter(
    (card) =>
      isStandardCard(card) &&
      (rankCounts.get(card.rank) ?? 0) === 1 &&
      (neighborCounts.get(card.id) ?? 0) === 0
  ).length;
  const highRankCount = hand.filter(
    (card) => isStandardCard(card) && card.rank >= 12
  ).length;
  const specialValue =
    hand.filter((card) => isSpecialCard(card, "dragon")).length * 35 +
    hand.filter((card) => isSpecialCard(card, "phoenix")).length * 30 +
    hand.filter((card) => isSpecialCard(card, "dog")).length * 14 +
    hand.filter((card) => isSpecialCard(card, "mahjong")).length * 10;
  const handStrength =
    bombCardIds.size * 20 +
    pairLikeCount * 18 +
    tripleLikeCount * 24 +
    straightLinkCount * 8 +
    highRankCount * 12 +
    controlCardIds.size * 14 +
    specialValue -
    deadSingleCount * 9;

  return {
    byId,
    rankCounts,
    rankPresence,
    neighborCounts,
    bombCardIds,
    controlCardIds,
    isolatedLowCardIds,
    pairLikeCount,
    tripleLikeCount,
    straightLinkCount,
    deadSingleCount,
    handStrength
  };
}

function buildRemainingHandMetrics(
  handContext: HandContext,
  removedCardIds: Iterable<string>
): RemainingHandMetrics {
  const removed = new Set(removedCardIds);
  const rankCounts = new Map<number, number>();
  const rankPresence = new Set<number>();
  let removedIsolatedLowCount = 0;

  for (const [cardId, card] of handContext.byId) {
    if (removed.has(cardId)) {
      if (handContext.isolatedLowCardIds.has(cardId)) {
        removedIsolatedLowCount += 1;
      }
      continue;
    }
    if (isStandardCard(card)) {
      rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
      rankPresence.add(card.rank);
    }
  }

  const pairLikeCount = countPairs(rankCounts);
  const tripleLikeCount = countTriples(rankCounts);
  const straightLinkCount = countStraightLinks(rankPresence);
  let deadSingleCount = 0;

  for (const [cardId, card] of handContext.byId) {
    if (removed.has(cardId) || !isStandardCard(card)) {
      continue;
    }
    const rankCount = rankCounts.get(card.rank) ?? 0;
    const neighbors =
      (rankPresence.has(card.rank - 1) ? 1 : 0) +
      (rankPresence.has(card.rank + 1) ? 1 : 0);
    if (rankCount === 1 && neighbors === 0) {
      deadSingleCount += 1;
    }
  }

  return {
    pairLikeCount,
    tripleLikeCount,
    straightLinkCount,
    deadSingleCount,
    removedIsolatedLowCount
  };
}

function compareScoredCards(
  left: { card: Card; score: number },
  right: { card: Card; score: number }
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  const strengthDelta = cardStrength(left.card) - cardStrength(right.card);
  if (strengthDelta !== 0) {
    return strengthDelta;
  }
  return left.card.id.localeCompare(right.card.id);
}

function scoreOpponentPassCard(
  card: Card,
  handContext: HandContext
): number {
  const weights = SERVER_HEURISTIC_FAST_PATH_WEIGHTS;
  let score = 0;

  if (isStandardCard(card)) {
    score += (15 - card.rank) * 7;
    if (card.rank <= 6) {
      score += 24;
    }
    if (isPointCard(card)) {
      score -= 18;
    }
    if ((handContext.rankCounts.get(card.rank) ?? 0) > 1) {
      score -= weights.pair_break_penalty;
    }
    if ((handContext.neighborCounts.get(card.id) ?? 0) > 0) {
      score -=
        (handContext.neighborCounts.get(card.id) ?? 0) *
        weights.straight_break_penalty;
    }
    if (handContext.isolatedLowCardIds.has(card.id)) {
      score += weights.isolated_low_card_bonus;
    }
  } else {
    if (card.id === "dog") {
      score -= weights.preserve_dog_weight;
    } else if (card.id === "mahjong") {
      score -= weights.preserve_mahjong_weight;
    } else if (card.id === "phoenix") {
      score -= weights.preserve_phoenix_weight;
    } else {
      score -= weights.preserve_dragon_weight;
    }
  }

  if (handContext.bombCardIds.has(card.id)) {
    score -= weights.preserve_bomb_weight;
  }
  if (handContext.controlCardIds.has(card.id)) {
    score -= weights.control_preservation_weight * 4;
  }

  return score;
}

function scorePartnerPassCard(
  card: Card,
  handContext: HandContext,
  partnerNearOut: boolean,
  partnerCalledTichu: boolean
): number {
  const weights = SERVER_HEURISTIC_FAST_PATH_WEIGHTS;
  let score = 0;

  if (isStandardCard(card)) {
    if (card.rank >= 7 && card.rank <= 11) {
      score += 18;
    } else if (card.rank <= 4) {
      score -= 10;
    }
    score += (handContext.neighborCounts.get(card.id) ?? 0) * 9;
    if ((handContext.rankCounts.get(card.rank) ?? 0) === 2) {
      score += 16;
    }
    if (isPointCard(card)) {
      score -= 12;
    }
    if (card.rank >= 12) {
      score -= weights.opponent_help_penalty;
    }
  } else if (card.id === "dog" && (partnerNearOut || partnerCalledTichu)) {
    score += 12;
  } else {
    score -= 24;
  }

  if (handContext.bombCardIds.has(card.id)) {
    score -= weights.preserve_bomb_weight;
  }
  if (handContext.controlCardIds.has(card.id)) {
    score -= weights.control_preservation_weight * 3;
  }

  return score;
}

function scorePassSelectionAction(config: {
  state: ServerFastPathState;
  actor: SeatId;
  action: Extract<EngineAction, { type: "select_pass" }>;
  handContext: HandContext;
  leftScore: number;
  partnerScore: number;
  rightScore: number;
}): ServerFastPathCandidate {
  const weights = SERVER_HEURISTIC_FAST_PATH_WEIGHTS;
  const removedCardIds = [config.action.left, config.action.partner, config.action.right];
  const removedMetrics = buildRemainingHandMetrics(
    config.handContext,
    removedCardIds
  );
  let score = config.leftScore + config.partnerScore + config.rightScore;

  score +=
    (config.handContext.deadSingleCount - removedMetrics.deadSingleCount) *
      weights.clutter_reduction_weight +
    removedMetrics.removedIsolatedLowCount * weights.isolated_low_card_bonus;
  score +=
    (removedMetrics.pairLikeCount - config.handContext.pairLikeCount) *
    weights.hand_shape_balance_bonus;
  score +=
    (removedMetrics.tripleLikeCount - config.handContext.tripleLikeCount) *
    weights.combo_preservation_weight;
  score +=
    (removedMetrics.straightLinkCount - config.handContext.straightLinkCount) *
    weights.combo_preservation_weight;

  const selectedCards = removedCardIds
    .map((cardId) => config.handContext.byId.get(cardId))
    .filter((card): card is Card => Boolean(card));
  const reasons: string[] = [
    "bounded pass search prefers low-impact singles and keeps structural resources intact"
  ];

  for (const card of selectedCards) {
    if (config.handContext.bombCardIds.has(card.id)) {
      score -= weights.preserve_bomb_weight;
      reasons.push("avoids passing bomb pieces unless the hand is already collapsing");
    }
    if (isSpecialCard(card, "phoenix")) {
      score -= weights.preserve_phoenix_weight;
    } else if (isSpecialCard(card, "dragon")) {
      score -= weights.preserve_dragon_weight;
    } else if (isSpecialCard(card, "dog")) {
      const partner = getPartnerSeat(config.actor);
      const partnerCards = config.state.handCounts[partner];
      const partnerCalled =
        config.state.calls[partner].smallTichu ||
        config.state.calls[partner].grandTichu;
      score -=
        partnerCards <= 3 || partnerCalled ? 0 : weights.preserve_dog_weight;
    } else if (isSpecialCard(card, "mahjong") && config.handContext.handStrength >= 140) {
      score -= weights.preserve_mahjong_weight;
    }
  }

  return {
    action: config.action,
    score,
    reasons
  };
}

export function buildServerFastPathState(
  state: GameState,
  actor: SeatId
): ServerFastPathState {
  return {
    phase: state.phase,
    activeSeat: state.activeSeat,
    passSelections: state.passSelections,
    handCounts: {
      "seat-0": state.hands["seat-0"].length,
      "seat-1": state.hands["seat-1"].length,
      "seat-2": state.hands["seat-2"].length,
      "seat-3": state.hands["seat-3"].length
    },
    actorHand: [...state.hands[actor]],
    currentWish: state.currentWish,
    calls: state.calls,
    finishedOrder: [...state.finishedOrder],
    currentTrick: state.currentTrick
      ? {
          leader: state.currentTrick.leader,
          currentWinner: state.currentTrick.currentWinner,
          currentCombination: state.currentTrick.currentCombination
        }
      : null,
    pendingDragonGift: state.pendingDragonGift
      ? {
          winner: state.pendingDragonGift.winner,
          nextLeader: state.pendingDragonGift.nextLeader,
          roundEndsAfterGift: state.pendingDragonGift.roundEndsAfterGift
        }
      : null
  };
}

function scoreCallTichuAction(
  handContext: HandContext,
  action: Extract<LegalAction, { type: "call_tichu" }>
): ServerFastPathCandidate {
  const strongEnough = handContext.handStrength >= FAST_TICHU_CALL_THRESHOLD;
  return {
    action,
    score: strongEnough ? 220 + handContext.handStrength : -40,
    reasons: [
      strongEnough
        ? "fast-path call keeps strong closeout hands aggressive"
        : "fast-path declines speculative Tichu calls from medium-strength hands"
    ]
  };
}

function scoreGrandTichuActions(
  handContext: HandContext,
  actions: Array<
    Extract<LegalAction, { type: "call_grand_tichu" }> |
      Extract<LegalAction, { type: "decline_grand_tichu" }>
  >
): ServerFastPathCandidate[] {
  const strongEnough = handContext.handStrength >= FAST_GRAND_TICHU_CALL_THRESHOLD;
  return actions.map((action) => {
    if (action.type === "call_grand_tichu") {
      return {
        action,
        score: strongEnough ? 260 + handContext.handStrength : -60,
        reasons: [
          strongEnough
            ? "fast-path grand Tichu calls require a clearly premium opening hand"
            : "fast-path declines marginal grand Tichu openings"
        ]
      };
    }
    return {
      action,
      score: strongEnough ? 0 : 180,
      reasons: [
        strongEnough
          ? "decline is kept available, but a premium hand should press the grand Tichu edge"
          : "decline preserves stability when the opening hand is not premium enough"
      ]
    };
  });
}

function toFallbackConcreteAction(
  actor: SeatId,
  action: LegalAction
): EngineAction {
  switch (action.type) {
    case "call_grand_tichu":
    case "decline_grand_tichu":
    case "call_tichu":
    case "pass_turn":
      return action;
    case "advance_phase":
      return action;
    case "assign_dragon_trick":
      return {
        type: "assign_dragon_trick",
        seat: actor,
        recipient: action.recipient
      };
    case "play_cards":
      return {
        type: "play_cards",
        seat: actor,
        cardIds: action.cardIds,
        ...(action.phoenixAsRank !== undefined
          ? { phoenixAsRank: action.phoenixAsRank }
          : {})
      };
    case "select_pass":
      return {
        type: "select_pass",
        seat: actor,
        left: action.availableCardIds[0] ?? "",
        partner: action.availableCardIds[1] ?? action.availableCardIds[0] ?? "",
        right: action.availableCardIds[2] ?? action.availableCardIds[1] ?? ""
      };
  }
}

function scoreDragonGiftAction(config: {
  state: ServerFastPathState;
  actor: SeatId;
  action: Extract<LegalAction, { type: "assign_dragon_trick" }>;
}): ServerFastPathCandidate {
  const recipientCards = config.state.handCounts[config.action.recipient];
  const recipientCalled =
    config.state.calls[config.action.recipient].smallTichu ||
    config.state.calls[config.action.recipient].grandTichu;
  return {
    action: {
      type: "assign_dragon_trick",
      seat: config.actor,
      recipient: config.action.recipient
    },
    score:
      recipientCards * 18 -
      (recipientCards <= 2 ? 90 : 0) -
      (recipientCalled ? 120 : 0),
    reasons: [
      "dragon is gifted to the safer opponent lane with the lower immediate race threat"
    ]
  };
}

export function generateFastPassSelectCandidates(config: {
  state: ServerFastPathState;
  actor: SeatId;
  legalActions: LegalAction[];
  deadlineMs?: number;
}): ServerFastPathCandidate[] {
  const template = config.legalActions.find(
    (action): action is Extract<LegalAction, { type: "select_pass" }> =>
      action.type === "select_pass"
  );
  if (!template) {
    return [];
  }

  const partner = getPartnerSeat(config.actor);
  const partnerNearOut = config.state.handCounts[partner] <= 3;
  const partnerCalled =
    config.state.calls[partner].smallTichu || config.state.calls[partner].grandTichu;
  const handContext = buildHandContext(config.state.actorHand);
  const cards = template.availableCardIds
    .map((cardId) => handContext.byId.get(cardId))
    .filter((card): card is Card => Boolean(card));
  const opponentRanked = cards
    .map((card) => ({
      card,
      score: scoreOpponentPassCard(card, handContext)
    }))
    .sort(compareScoredCards)
    .slice(0, 6);
  const partnerRanked = cards
    .map((card) => ({
      card,
      score: scorePartnerPassCard(card, handContext, partnerNearOut, partnerCalled)
    }))
    .sort(compareScoredCards)
    .slice(0, 4);
  const uniqueCandidates = new Map<string, ServerFastPathCandidate>();
  const deadlineMs = config.deadlineMs ?? Number.POSITIVE_INFINITY;

  for (const partnerEntry of partnerRanked) {
    if (Date.now() > deadlineMs) {
      break;
    }
    for (const leftEntry of opponentRanked) {
      if (Date.now() > deadlineMs) {
        break;
      }
      if (leftEntry.card.id === partnerEntry.card.id) {
        continue;
      }
      for (const rightEntry of opponentRanked) {
        if (Date.now() > deadlineMs) {
          break;
        }
        if (
          rightEntry.card.id === partnerEntry.card.id ||
          rightEntry.card.id === leftEntry.card.id
        ) {
          continue;
        }
        const action: Extract<EngineAction, { type: "select_pass" }> = {
          type: "select_pass",
          seat: config.actor,
          left: leftEntry.card.id,
          partner: partnerEntry.card.id,
          right: rightEntry.card.id
        };
        const key = getConcreteActionSortKey(action);
        if (!uniqueCandidates.has(key)) {
          uniqueCandidates.set(
            key,
            scorePassSelectionAction({
              state: config.state,
              actor: config.actor,
              action,
              handContext,
              leftScore: leftEntry.score,
              partnerScore: partnerEntry.score,
              rightScore: rightEntry.score
            })
          );
        }
      }
    }
  }

  return [...uniqueCandidates.values()]
    .sort((left, right) =>
      right.score !== left.score
        ? right.score - left.score
        : getConcreteActionSortKey(left.action).localeCompare(
            getConcreteActionSortKey(right.action)
          )
    )
    .slice(0, SERVER_HEURISTIC_FAST_PATH_LIMITS.pass_select_candidate_cap);
}

function actionUsesCard(action: Extract<LegalAction, { type: "play_cards" }>, cardId: string): boolean {
  return action.cardIds.includes(cardId);
}

function scorePassTurnAction(config: {
  state: ServerFastPathState;
  actor: SeatId;
  legalActions: LegalAction[];
  passAction: Extract<LegalAction, { type: "pass_turn" }>;
}): ServerFastPathCandidate {
  const weights = SERVER_HEURISTIC_FAST_PATH_WEIGHTS;
  const partner = getPartnerSeat(config.actor);
  const partnerWinning =
    config.state.currentTrick !== null &&
    getTeamForSeat(config.state.currentTrick.currentWinner) ===
      getTeamForSeat(config.actor);
  const minOpponentCards = Math.min(
    ...getOpponentSeats(config.actor).map(
      (seat) => config.state.handCounts[seat]
    )
  );
  const wishSatisfyingOption = config.legalActions.some(
    (action) =>
      isPlayLegalAction(action) &&
      config.state.currentWish !== null &&
      action.combination.actualRanks.includes(config.state.currentWish)
  );
  let score = weights.pass_conservation_bonus;
  if (partnerWinning) {
    score += 76;
  }
  if (minOpponentCards <= 2) {
    score -= weights.opponent_escape_prevention_bonus;
  }
  if (config.state.handCounts[config.actor] <= 2) {
    score -= 48;
  }
  if (wishSatisfyingOption) {
    score -= weights.cheap_wish_satisfaction_bonus;
  }
  if (
    config.state.currentTrick !== null &&
    getTeamForSeat(config.state.currentTrick.currentWinner) !==
      getTeamForSeat(config.actor)
  ) {
    score -= 24;
  }

  return {
    action: config.passAction,
    score,
    reasons: [
      partnerWinning
        ? "pass conserves resources while partner already controls the trick"
        : "pass is available, but urgency and wish pressure can still outweigh it"
    ]
  };
}

function scorePlayAction(config: {
  state: ServerFastPathState;
  actor: SeatId;
  action: Extract<LegalAction, { type: "play_cards" }>;
  handContext: HandContext;
}): ServerFastPathCandidate {
  const weights = SERVER_HEURISTIC_FAST_PATH_WEIGHTS;
  const removedMetrics = buildRemainingHandMetrics(
    config.handContext,
    config.action.cardIds
  );
  const remainingHandCount =
    config.state.handCounts[config.actor] - config.action.cardIds.length;
  const minOpponentCards = Math.min(
    ...getOpponentSeats(config.actor).map(
      (seat) => config.state.handCounts[seat]
    )
  );
  const partner = getPartnerSeat(config.actor);
  const partnerWinning =
    config.state.currentTrick !== null &&
    getTeamForSeat(config.state.currentTrick.currentWinner) ===
      getTeamForSeat(config.actor);
  const opponentWinning =
    config.state.currentTrick !== null &&
    getTeamForSeat(config.state.currentTrick.currentWinner) !==
      getTeamForSeat(config.actor);
  const efficiencyDelta = config.state.currentTrick
    ? config.action.combination.primaryRank -
      config.state.currentTrick.currentCombination.primaryRank
    : config.action.combination.primaryRank;
  const satisfiesWish =
    config.state.currentWish !== null &&
    config.action.combination.actualRanks.includes(config.state.currentWish);
  const usesBomb = config.action.combination.isBomb;
  const usesDragon = config.action.combination.containsDragon;
  const usesPhoenix = config.action.combination.containsPhoenix;
  const usesDog = config.action.combination.containsDog;
  const usesMahjong = config.action.combination.containsMahjong;
  const selfNearOut = config.state.handCounts[config.actor] <= 3;
  const partnerNearOut = config.state.handCounts[partner] <= 2;
  const partnerCalled =
    config.state.calls[partner].smallTichu || config.state.calls[partner].grandTichu;
  let score =
    weights.lowest_winning_bonus -
    Math.max(0, efficiencyDelta) * weights.overkill_penalty;

  score += removedMetrics.removedIsolatedLowCount * weights.isolated_low_card_bonus;
  score +=
    (config.handContext.deadSingleCount - removedMetrics.deadSingleCount) *
    weights.clutter_reduction_weight;
  score +=
    (removedMetrics.pairLikeCount - config.handContext.pairLikeCount) *
      weights.hand_shape_balance_bonus +
    (removedMetrics.tripleLikeCount - config.handContext.tripleLikeCount) *
      weights.combo_preservation_weight +
    (removedMetrics.straightLinkCount - config.handContext.straightLinkCount) *
      weights.combo_preservation_weight;

  if (config.state.currentTrick === null) {
    score += Math.max(0, 20 - config.action.combination.primaryRank);
    score += config.action.cardIds.length * 26;
    if (config.action.cardIds.length >= 2 && !usesBomb) {
      score += weights.combo_preservation_weight * 3;
    }
    if (
      config.action.combination.kind === "straight" ||
      config.action.combination.kind === "pair-sequence"
    ) {
      score += 38;
    } else if (config.action.combination.kind === "full-house") {
      score += 30;
    } else if (config.action.combination.kind === "trio") {
      score += 20;
    }
  } else if (partnerWinning) {
    score -= 72;
  } else if (opponentWinning) {
    score += 24;
  }

  if (remainingHandCount === 0) {
    score += weights.endgame_closeout_bonus;
  } else if (remainingHandCount <= 2) {
    score += Math.round(weights.endgame_closeout_bonus / 2);
  }

  if (minOpponentCards <= 2) {
    score += weights.opponent_escape_prevention_bonus;
  }
  if (selfNearOut) {
    score += 24;
  }

  if (satisfiesWish) {
    score += weights.cheap_wish_satisfaction_bonus;
    score -= Math.max(0, efficiencyDelta) * 4;
  }

  if (usesBomb) {
    if (remainingHandCount > 0 && minOpponentCards > 1 && !selfNearOut) {
      score -= weights.bomb_conservation_bonus;
    }
  }
  if (usesPhoenix && remainingHandCount > 0) {
    score -= weights.phoenix_conservation_bonus;
  }
  if (usesDragon && remainingHandCount > 0) {
    score -= weights.preserve_dragon_weight;
  }
  if (usesMahjong && remainingHandCount > 0 && !satisfiesWish) {
    score -= weights.preserve_mahjong_weight;
  }
  if (usesDog) {
    score += partnerNearOut || partnerCalled ? 90 : -weights.preserve_dog_weight;
  }
  if (config.action.combination.cardIds.some((cardId) => config.handContext.controlCardIds.has(cardId))) {
    score -= weights.control_preservation_weight * 3;
  }

  return {
    action: {
      type: "play_cards",
      seat: config.actor,
      cardIds: config.action.cardIds,
      ...(config.action.phoenixAsRank !== undefined
        ? { phoenixAsRank: config.action.phoenixAsRank }
        : {}),
      ...(satisfiesWish && config.state.currentWish !== null
        ? { wishRank: config.state.currentWish }
        : {})
    },
    score,
    reasons: [
      "bounded trick-play search favors cheap winning lines that preserve bombs, Phoenix flexibility, and future shape"
    ]
  };
}

export function generateFastTrickPlayCandidates(config: {
  state: ServerFastPathState;
  actor: SeatId;
  legalActions: LegalAction[];
}): ServerFastPathCandidate[] {
  const handContext = buildHandContext(config.state.actorHand);
  const passAction = config.legalActions.find(
    (action): action is Extract<LegalAction, { type: "pass_turn" }> =>
      isPassLegalAction(action)
  );
  const playActions = config.legalActions.filter(isPlayLegalAction);
  const sortedPlayActions = [...playActions].sort((left, right) => {
    const leftCost =
      left.combination.primaryRank +
      (left.combination.isBomb ? 200 : 0) +
      (left.combination.containsDragon ? 120 : 0) +
      (left.combination.containsPhoenix ? 45 : 0);
    const rightCost =
      right.combination.primaryRank +
      (right.combination.isBomb ? 200 : 0) +
      (right.combination.containsDragon ? 120 : 0) +
      (right.combination.containsPhoenix ? 45 : 0);
    if (leftCost !== rightCost) {
      return leftCost - rightCost;
    }
    if (left.cardIds.length !== right.cardIds.length) {
      return left.cardIds.length - right.cardIds.length;
    }
    return getCanonicalCardIdsKey(left.cardIds).localeCompare(
      getCanonicalCardIdsKey(right.cardIds)
    );
  });
  const uniqueCandidates = new Map<string, ServerFastPathCandidate>();
  const addCandidate = (candidate: ServerFastPathCandidate | null): void => {
    if (!candidate) {
      return;
    }
    uniqueCandidates.set(getConcreteActionSortKey(candidate.action), candidate);
  };

  if (passAction) {
    addCandidate(
      scorePassTurnAction({
        state: config.state,
        actor: config.actor,
        legalActions: config.legalActions,
        passAction
      })
    );
  }

  addCandidate(
    sortedPlayActions[0]
      ? scorePlayAction({
          state: config.state,
          actor: config.actor,
          action: sortedPlayActions[0],
          handContext
        })
      : null
  );
  addCandidate(
    sortedPlayActions.find((action) => !action.combination.isBomb)
      ? scorePlayAction({
          state: config.state,
          actor: config.actor,
          action: sortedPlayActions.find((action) => !action.combination.isBomb)!,
          handContext
        })
      : null
  );
  addCandidate(
    sortedPlayActions.find(
      (action) =>
        config.state.currentWish !== null &&
        action.combination.actualRanks.includes(config.state.currentWish)
    )
      ? scorePlayAction({
          state: config.state,
          actor: config.actor,
          action: sortedPlayActions.find(
            (action) =>
              config.state.currentWish !== null &&
              action.combination.actualRanks.includes(config.state.currentWish)
          )!,
          handContext
        })
      : null
  );
  addCandidate(
    sortedPlayActions.find(
      (action) => action.cardIds.length >= 2 && !action.combination.isBomb
    )
      ? scorePlayAction({
          state: config.state,
          actor: config.actor,
          action: sortedPlayActions.find(
            (action) => action.cardIds.length >= 2 && !action.combination.isBomb
          )!,
          handContext
        })
      : null
  );
  addCandidate(
    sortedPlayActions.find(
      (action) =>
        config.state.handCounts[config.actor] - action.cardIds.length <= 2
    )
      ? scorePlayAction({
          state: config.state,
          actor: config.actor,
          action: sortedPlayActions.find(
            (action) =>
              config.state.handCounts[config.actor] - action.cardIds.length <= 2
          )!,
          handContext
        })
      : null
  );
  for (const action of [...sortedPlayActions]
    .sort((left, right) => {
      if (right.cardIds.length !== left.cardIds.length) {
        return right.cardIds.length - left.cardIds.length;
      }
      return right.combination.primaryRank - left.combination.primaryRank;
    })
    .slice(0, 3)) {
    addCandidate(
      scorePlayAction({
        state: config.state,
        actor: config.actor,
        action,
        handContext
      })
    );
  }
  for (const action of sortedPlayActions
    .filter(
      (candidate) =>
        candidate.combination.kind === "straight" ||
        candidate.combination.kind === "pair-sequence" ||
        candidate.combination.kind === "full-house"
    )
    .slice(0, 3)) {
    addCandidate(
      scorePlayAction({
        state: config.state,
        actor: config.actor,
        action,
        handContext
      })
    );
  }
  addCandidate(
    sortedPlayActions.find(
      (action) =>
        action.combination.isBomb ||
        action.combination.containsDragon ||
        action.combination.containsPhoenix
    )
      ? scorePlayAction({
          state: config.state,
          actor: config.actor,
          action: sortedPlayActions.find(
            (action) =>
              action.combination.isBomb ||
              action.combination.containsDragon ||
              action.combination.containsPhoenix
          )!,
          handContext
        })
      : null
  );

  for (const action of sortedPlayActions.slice(1, 8)) {
    addCandidate(
      scorePlayAction({
        state: config.state,
        actor: config.actor,
        action,
        handContext
      })
    );
  }

  return [...uniqueCandidates.values()]
    .sort((left, right) =>
      right.score !== left.score
        ? right.score - left.score
        : getConcreteActionSortKey(left.action).localeCompare(
            getConcreteActionSortKey(right.action)
          )
    )
    .slice(0, SERVER_HEURISTIC_FAST_PATH_LIMITS.trick_play_candidate_cap);
}

export function chooseServerFastPathDecision(config: {
  state: ServerFastPathState;
  actor: SeatId;
  legalActions: LegalAction[];
}): ServerFastPathDecision {
  const handContext = buildHandContext(config.state.actorHand);
  const candidates: ServerFastPathCandidate[] = [];

  if (config.legalActions.some((action) => action.type === "call_grand_tichu")) {
    candidates.push(
      ...scoreGrandTichuActions(
        handContext,
        config.legalActions.filter(
          (
            action
          ): action is
            | Extract<LegalAction, { type: "call_grand_tichu" }>
            | Extract<LegalAction, { type: "decline_grand_tichu" }> =>
            action.type === "call_grand_tichu" ||
            action.type === "decline_grand_tichu"
        )
      )
    );
  } else if (config.legalActions.some((action) => action.type === "select_pass")) {
    const passCandidates = generateFastPassSelectCandidates({
      state: config.state,
      actor: config.actor,
      legalActions: config.legalActions,
      deadlineMs:
        Date.now() + SERVER_HEURISTIC_FAST_PATH_LIMITS.target_latency_ms
    });
    candidates.push(...passCandidates);
    const callTichu = config.legalActions.find(
      (action): action is Extract<LegalAction, { type: "call_tichu" }> =>
        action.type === "call_tichu"
    );
    if (callTichu) {
      candidates.push(scoreCallTichuAction(handContext, callTichu));
    }
  } else if (
    config.legalActions.some(
      (action) => isPlayLegalAction(action) || isPassLegalAction(action)
    )
  ) {
    candidates.push(
      ...generateFastTrickPlayCandidates({
        state: config.state,
        actor: config.actor,
        legalActions: config.legalActions
      })
    );
    const callTichu = config.legalActions.find(
      (action): action is Extract<LegalAction, { type: "call_tichu" }> =>
        action.type === "call_tichu"
    );
    if (callTichu) {
      candidates.push(scoreCallTichuAction(handContext, callTichu));
    }
  } else if (
    config.legalActions.some((action) => action.type === "assign_dragon_trick")
  ) {
    candidates.push(
      ...config.legalActions
        .filter(
          (action): action is Extract<LegalAction, { type: "assign_dragon_trick" }> =>
            action.type === "assign_dragon_trick"
        )
        .map((action) =>
          scoreDragonGiftAction({
            state: config.state,
            actor: config.actor,
            action
          })
        )
    );
  } else if (config.legalActions.some((action) => action.type === "call_tichu")) {
    candidates.push(
      ...config.legalActions
        .filter((action) => action.type === "call_tichu")
        .map((action) => scoreCallTichuAction(handContext, action))
    );
  } else {
    candidates.push(
      ...config.legalActions.map((action, index) => ({
        action: toFallbackConcreteAction(config.actor, action),
        score: 100 - index,
        reasons: ["deterministic fallback preserves a legal action even outside the hot path buckets"]
      }))
    );
  }

  const ordered = [...candidates].sort((left, right) =>
    right.score !== left.score
      ? right.score - left.score
      : getConcreteActionSortKey(left.action).localeCompare(
          getConcreteActionSortKey(right.action)
        )
  );
  const selected = ordered[0];
  if (!selected) {
    throw new Error("No bounded fast-path candidate was available for the actor.");
  }

  return {
    actor: config.actor,
    action: selected.action,
    candidateCount: ordered.length,
    candidates: ordered
  };
}
