import {
  SEAT_IDS,
  SYSTEM_ACTOR,
  getLegalActions,
  getOpponentSeats,
  getPartnerSeat,
  getTeamForSeat,
  type Card,
  type EngineAction,
  type GameState,
  type LegalAction,
  type LegalActionMap,
  type SeatId,
  type StandardRank
} from "@tichuml/engine";
import { engineFoundation } from "@tichuml/engine";

export type PolicyTag =
  | "partner_called_tichu"
  | "partner_still_live_for_tichu"
  | "partner_tichu_interference_candidate"
  | "unjustified_partner_bomb"
  | "justified_partner_bomb"
  | "partner_tempo_preserved"
  | "partner_control_preserved"
  | "opponent_immediate_win_risk"
  | "partner_cannot_retain_lead"
  | "team_control_would_be_lost_without_intervention"
  | "team_salvage_intervention";

export type TeamplaySnapshot = {
  partnerCalledTichu: boolean;
  partnerStillLiveForTichu: boolean;
  partnerCardCount: number;
  partnerCurrentControl: boolean;
  opponentImmediateWinRisk: boolean;
  partnerCannotRetainLead: boolean;
  teamControlWouldBeLostWithoutIntervention: boolean;
  teamSalvageIntervention: boolean;
  partnerInterferenceCandidate: boolean;
  justifiedPartnerBomb: boolean;
  unjustifiedPartnerBomb: boolean;
};

export type PolicyExplanation = {
  policy: string;
  actor: SeatId | typeof SYSTEM_ACTOR;
  candidateScores: Array<{
    action: EngineAction;
    score: number;
    reasons: string[];
    tags: PolicyTag[];
    teamplay?: TeamplaySnapshot;
  }>;
  selectedReasonSummary: string[];
  selectedTags: PolicyTag[];
  selectedTeamplay?: TeamplaySnapshot;
};

export type HeadlessDecisionContext = {
  state: GameState;
  legalActions: LegalActionMap;
};

export type ChosenDecision = {
  actor: SeatId | typeof SYSTEM_ACTOR;
  action: EngineAction;
  explanation: PolicyExplanation;
};

export type HeuristicPolicy = {
  name: string;
  chooseAction(ctx: HeadlessDecisionContext): ChosenDecision;
};

type CandidateDecision = {
  actor: SeatId | typeof SYSTEM_ACTOR;
  action: EngineAction;
  score: number;
  reasons: string[];
  tags: PolicyTag[];
  teamplay?: TeamplaySnapshot;
};

type PlayLegalAction = Extract<LegalAction, { type: "play_cards" }>;
type PassLegalAction = Extract<LegalAction, { type: "pass_turn" }>;
type CardPassMetrics = {
  card: Card;
  comboCount: number;
  maxComboSize: number;
  supportScore: number;
  pairLikeCount: number;
  straightLikeCount: number;
  bombCount: number;
  neighborCount: number;
  rankCount: number;
  isControl: boolean;
  isDog: boolean;
  isAce: boolean;
  isHighRank: boolean;
};
type HandEvaluation = {
  strength: number;
  leadPlayActions: PlayLegalAction[];
  cardMetrics: Map<string, CardPassMetrics>;
  controlCount: number;
  bombCount: number;
  highRankCount: number;
  highClusterCount: number;
  synergyScore: number;
  fragmentation: number;
  expectedTrickWins: number;
  handSpeed: number;
  tichuViable: boolean;
  protectedCardIds: Set<string>;
};

function isPlayLegalAction(action: LegalAction): action is PlayLegalAction {
  return action.type === "play_cards";
}

function isPassLegalAction(action: LegalAction): action is PassLegalAction {
  return action.type === "pass_turn";
}

function isStandardCard(card: Card): card is Extract<Card, { kind: "standard" }> {
  return card.kind === "standard";
}

function cardStrength(card: Card): number {
  if (card.kind === "standard") {
    return card.rank + (card.rank >= 12 ? 4 : 0);
  }

  switch (card.id) {
    case "dog":
      return 1;
    case "mahjong":
      return 6;
    case "phoenix":
      return 18;
    case "dragon":
      return 20;
  }
}

function handStrength(cards: Card[]): number {
  const standardCards = cards.filter(isStandardCard);
  const rankCounts = new Map<number, number>();

  for (const card of standardCards) {
    rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
  }

  let strength = 0;

  for (const card of cards) {
    strength += cardStrength(card);
    if (card.kind === "standard" && card.rank <= 5) {
      strength -= 2;
    }
  }

  for (const [rank, count] of rankCounts) {
    if (count === 2) {
      strength += rank >= 10 ? 7 : 4;
    } else if (count === 3) {
      strength += rank >= 10 ? 16 : 12;
    } else if (count >= 4) {
      strength += 28;
    }
  }

  const sortedRanks = [...rankCounts.keys()].sort((left, right) => left - right);
  let currentRun = 1;

  for (let index = 1; index < sortedRanks.length; index += 1) {
    if (sortedRanks[index] === sortedRanks[index - 1]! + 1) {
      currentRun += 1;
      strength += currentRun >= 4 ? 2 : 0;
    } else {
      currentRun = 1;
    }
  }

  return strength;
}

function cloneStateForLeadAnalysis(state: GameState): GameState {
  return {
    ...state,
    hands: {
      "seat-0": [...state.hands["seat-0"]],
      "seat-1": [...state.hands["seat-1"]],
      "seat-2": [...state.hands["seat-2"]],
      "seat-3": [...state.hands["seat-3"]]
    },
    calls: {
      "seat-0": { ...state.calls["seat-0"] },
      "seat-1": { ...state.calls["seat-1"] },
      "seat-2": { ...state.calls["seat-2"] },
      "seat-3": { ...state.calls["seat-3"] }
    },
    grandTichuQueue: [...state.grandTichuQueue],
    passSelections: { ...state.passSelections },
    revealedPasses: { ...state.revealedPasses },
    collectedCards: {
      "seat-0": [...state.collectedCards["seat-0"]],
      "seat-1": [...state.collectedCards["seat-1"]],
      "seat-2": [...state.collectedCards["seat-2"]],
      "seat-3": [...state.collectedCards["seat-3"]]
    },
    finishedOrder: [...state.finishedOrder],
    currentTrick: state.currentTrick
      ? {
          ...state.currentTrick,
          entries: [...state.currentTrick.entries],
          passingSeats: [...state.currentTrick.passingSeats]
        }
      : null
  };
}

function getLeadPlayActions(state: GameState, seat: SeatId): PlayLegalAction[] {
  const shadowState = cloneStateForLeadAnalysis(state);
  shadowState.phase = "trick_play";
  shadowState.activeSeat = seat;
  shadowState.currentTrick = null;
  shadowState.currentWish = null;
  shadowState.pendingDragonGift = null;

  return (getLegalActions(shadowState)[seat] ?? []).filter(isPlayLegalAction);
}

function getRankCounts(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    if (card.kind !== "standard") {
      continue;
    }

    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}

function countNeighborRanks(card: Card, rankCounts: Map<number, number>): number {
  if (card.kind !== "standard") {
    return 0;
  }

  let neighborCount = 0;
  if (rankCounts.has(card.rank - 1)) {
    neighborCount += 1;
  }
  if (rankCounts.has(card.rank + 1)) {
    neighborCount += 1;
  }
  return neighborCount;
}

function buildHandEvaluation(state: GameState, seat: SeatId): HandEvaluation {
  const cards = [...state.hands[seat]];
  const leadPlayActions = getLeadPlayActions(state, seat);
  const rankCounts = getRankCounts(cards);
  const highRankCount = cards.filter(
    (card) => card.kind === "standard" && card.rank >= 13
  ).length;
  const controlCount = cards.filter(
    (card) =>
      (card.kind === "special" &&
        (card.special === "dragon" || card.special === "phoenix")) ||
      (card.kind === "standard" && card.rank === 14)
  ).length;
  const bombCount = new Set(
    leadPlayActions
      .filter((action) => action.combination.isBomb)
      .map((action) => action.combination.key)
  ).size;
  const highClusterCount = [...rankCounts.entries()].filter(
    ([rank, count]) => rank >= 13 && count >= 2
  ).length;
  const cardMetrics = new Map<string, CardPassMetrics>();

  for (const card of cards) {
    const actionsWithCard = leadPlayActions.filter((action) =>
      action.cardIds.includes(card.id)
    );
    const comboCount = actionsWithCard.length;
    const maxComboSize = actionsWithCard.reduce(
      (best, action) => Math.max(best, action.combination.cardCount),
      1
    );
    const supportScore = actionsWithCard.reduce((score, action) => {
      const comboValue = action.combination.cardCount * 5;
      const bombValue = action.combination.isBomb ? 18 : 0;
      const structuredValue =
        action.combination.kind === "straight" ||
        action.combination.kind === "pair-sequence" ||
        action.combination.kind === "full-house"
          ? 8
          : 0;
      return score + comboValue + bombValue + structuredValue;
    }, 0);
    const pairLikeCount = actionsWithCard.filter(
      (action) =>
        action.combination.kind === "pair" ||
        action.combination.kind === "trio" ||
        action.combination.kind === "full-house" ||
        action.combination.kind === "pair-sequence" ||
        action.combination.kind === "bomb-four-kind"
    ).length;
    const straightLikeCount = actionsWithCard.filter(
      (action) =>
        action.combination.kind === "straight" ||
        action.combination.kind === "pair-sequence" ||
        action.combination.kind === "bomb-straight"
    ).length;
    const cardBombCount = actionsWithCard.filter(
      (action) => action.combination.isBomb
    ).length;
    const rankCount = card.kind === "standard" ? rankCounts.get(card.rank) ?? 1 : 1;
    const neighborCount = countNeighborRanks(card, rankCounts);
    const isAce = card.kind === "standard" && card.rank === 14;

    cardMetrics.set(card.id, {
      card,
      comboCount,
      maxComboSize,
      supportScore,
      pairLikeCount,
      straightLikeCount,
      bombCount: cardBombCount,
      neighborCount,
      rankCount,
      isControl:
        (card.kind === "special" &&
          (card.special === "dragon" || card.special === "phoenix")) ||
        isAce,
      isDog: card.kind === "special" && card.special === "dog",
      isAce,
      isHighRank: card.kind === "standard" && card.rank >= 13
    });
  }

  const synergyScore =
    [...cardMetrics.values()].reduce(
      (score, metric) => score + metric.supportScore,
      0
    ) / Math.max(1, cards.length);
  const fragmentation = [...cardMetrics.values()].filter(
    (metric) =>
      metric.comboCount <= 1 &&
      metric.rankCount === 1 &&
      !metric.isControl &&
      !metric.isDog
  ).length;
  const handSpeed =
    [...cardMetrics.values()].reduce(
      (score, metric) => score + metric.maxComboSize,
      0
    ) / Math.max(1, cards.length);
  const expectedTrickWins =
    controlCount * 1.9 +
    bombCount * 2.4 +
    highRankCount * 0.65 +
    highClusterCount * 1.25 +
    handSpeed * 0.95 -
    fragmentation * 0.3;
  const tichuViable =
    controlCount > 0 ||
    bombCount > 0 ||
    highClusterCount >= 2 ||
    (highRankCount >= 4 && synergyScore >= 16) ||
    synergyScore >= 24;
  const protectedCardIds = new Set<string>();

  for (const [cardId, metric] of cardMetrics.entries()) {
    if (metric.bombCount > 0) {
      protectedCardIds.add(cardId);
      continue;
    }

    if (tichuViable && (metric.isControl || metric.isAce)) {
      protectedCardIds.add(cardId);
      continue;
    }

    if (
      metric.rankCount >= 3 &&
      metric.card.kind === "standard" &&
      metric.card.rank >= 10
    ) {
      protectedCardIds.add(cardId);
      continue;
    }

    if (
      tichuViable &&
      metric.maxComboSize >= 5 &&
      (metric.straightLikeCount > 0 || metric.supportScore >= 26)
    ) {
      protectedCardIds.add(cardId);
      continue;
    }

    if (tichuViable && metric.comboCount >= 4 && metric.isHighRank) {
      protectedCardIds.add(cardId);
    }
  }

  return {
    strength: handStrength(cards),
    leadPlayActions,
    cardMetrics,
    controlCount,
    bombCount,
    highRankCount,
    highClusterCount,
    synergyScore,
    fragmentation,
    expectedTrickWins,
    handSpeed,
    tichuViable,
    protectedCardIds
  };
}

function scoreCardForOpponentPass(
  analysis: HandEvaluation,
  metric: CardPassMetrics
): number {
  let score = 0;

  if (metric.isDog && analysis.tichuViable) {
    score += 500;
  }

  if (metric.card.kind === "standard") {
    score += (15 - metric.card.rank) * 14;
    if (metric.card.rank <= 6) {
      score += 120;
    } else if (metric.card.rank <= 9) {
      score += 36;
    }
  } else if (!metric.isDog) {
    score -= 220;
  }

  if (metric.comboCount <= 1) {
    score += 90;
  }
  if (metric.rankCount === 1) {
    score += 48;
  }
  if (metric.neighborCount === 0) {
    score += 42;
  }
  if (metric.pairLikeCount === 0 && metric.straightLikeCount === 0) {
    score += 56;
  }

  if (analysis.protectedCardIds.has(metric.card.id)) {
    score -= 2000;
  }
  if (metric.isControl) {
    score -= 440;
  }
  if (metric.isHighRank) {
    score -= 120;
  }

  return score;
}

function scoreCardForPartnerPass(
  analysis: HandEvaluation,
  metric: CardPassMetrics
): number {
  let score = 0;

  if (metric.card.kind === "standard") {
    if (metric.card.rank >= 7 && metric.card.rank <= 10) {
      score += 90;
    } else if (metric.card.rank >= 11 && !analysis.tichuViable) {
      score += 34;
    } else if (metric.card.rank <= 4) {
      score -= 44;
    }
  }

  score += metric.neighborCount * 28;
  if (metric.rankCount === 2 && metric.card.kind === "standard" && metric.card.rank <= 10) {
    score += 58;
  }
  if (metric.straightLikeCount > 0 && metric.maxComboSize >= 5) {
    score += 48;
  }
  if (metric.comboCount <= 1) {
    score -= 32;
  }

  if (analysis.protectedCardIds.has(metric.card.id)) {
    score -= 1800;
  }
  if (metric.isControl) {
    score -= 380;
  }
  if (metric.isDog && analysis.tichuViable) {
    score -= 460;
  }

  return score;
}

function chooseWishRank(state: GameState, seat: SeatId, selectedCardIds: string[]): StandardRank {
  const remainingRanks = state.hands[seat]
    .filter(
      (card): card is Extract<(typeof state.hands)[SeatId][number], { kind: "standard" }> =>
        !selectedCardIds.includes(card.id) && card.kind === "standard"
    )
    .map((card) => card.rank);

  if (remainingRanks.length === 0) {
    return 14;
  }

  const counts = new Map<StandardRank, number>();
  for (const rank of remainingRanks) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return right[0] - left[0];
  })[0]![0];
}

function createPassSelectionAction(state: GameState, seat: SeatId): EngineAction {
  const available = [...state.hands[seat]];
  const analysis = buildHandEvaluation(state, seat);
  const byOpponentPriority = [...available].sort((left, right) => {
    const leftScore = scoreCardForOpponentPass(
      analysis,
      analysis.cardMetrics.get(left.id)!
    );
    const rightScore = scoreCardForOpponentPass(
      analysis,
      analysis.cardMetrics.get(right.id)!
    );
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    const strengthDifference = cardStrength(left) - cardStrength(right);
    if (strengthDifference !== 0) {
      return strengthDifference;
    }

    return left.id.localeCompare(right.id);
  });
  const left = byOpponentPriority[0];
  const right = byOpponentPriority.find((card) => card.id !== left?.id);
  const remainingForPartner = available.filter(
    (card) => card.id !== left?.id && card.id !== right?.id
  );
  const partner = [...remainingForPartner].sort((leftCard, rightCard) => {
    const leftScore = scoreCardForPartnerPass(
      analysis,
      analysis.cardMetrics.get(leftCard.id)!
    );
    const rightScore = scoreCardForPartnerPass(
      analysis,
      analysis.cardMetrics.get(rightCard.id)!
    );
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    const strengthDifference = cardStrength(leftCard) - cardStrength(rightCard);
    if (strengthDifference !== 0) {
      return strengthDifference;
    }

    return leftCard.id.localeCompare(rightCard.id);
  })[0];

  if (!left || !right || !partner) {
    throw new Error(`Seat ${seat} cannot choose a full pass selection.`);
  }

  return {
    type: "select_pass",
    seat,
    left: left.id,
    partner: partner.id,
    right: right.id
  };
}

function toConcreteAction(
  state: GameState,
  actor: SeatId | typeof SYSTEM_ACTOR,
  legalAction: LegalAction
): EngineAction {
  if (legalAction.type === "select_pass") {
    return createPassSelectionAction(state, legalAction.seat);
  }

  if (legalAction.type === "play_cards" && legalAction.availableWishRanks) {
    return {
      type: "play_cards",
      seat: legalAction.seat,
      cardIds: legalAction.cardIds,
      ...(legalAction.phoenixAsRank !== undefined ? { phoenixAsRank: legalAction.phoenixAsRank } : {}),
      wishRank: chooseWishRank(state, legalAction.seat, legalAction.cardIds)
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

function currentWinnerIsPartner(state: GameState, seat: SeatId): boolean {
  const winner = state.currentTrick?.currentWinner;
  return winner !== undefined && winner !== null && winner !== seat && getPartnerSeat(seat) === winner;
}

function partnerHasCalledTichu(state: GameState, seat: SeatId): boolean {
  const partner = getPartnerSeat(seat);
  return state.calls[partner].smallTichu || state.calls[partner].grandTichu;
}

function partnerStillLiveForTichu(state: GameState, seat: SeatId): boolean {
  const partner = getPartnerSeat(seat);
  if (!partnerHasCalledTichu(state, seat)) {
    return false;
  }

  const firstFinished = state.finishedOrder[0];
  if (firstFinished && firstFinished !== partner) {
    return false;
  }

  return state.hands[partner].length > 0;
}

function hasOpponentImmediateWinRisk(state: GameState, seat: SeatId): boolean {
  return getOpponentSeats(seat).some((opponent) => state.hands[opponent].length <= 1);
}

function activeOpponentHasLiveBeat(ctx: HeadlessDecisionContext, seat: SeatId): boolean {
  const activeSeat = ctx.state.activeSeat;
  if (!activeSeat || getTeamForSeat(activeSeat) === getTeamForSeat(seat)) {
    return false;
  }

  return (ctx.legalActions[activeSeat] ?? []).some(isPlayLegalAction);
}

function canOpponentBeatCombination(state: GameState, opponent: SeatId, currentWinner: SeatId): boolean {
  if (!state.currentTrick || state.hands[opponent].length === 0 || opponent === currentWinner) {
    return false;
  }

  const shadowState: GameState = {
    ...state,
    hands: {
      "seat-0": [...state.hands["seat-0"]],
      "seat-1": [...state.hands["seat-1"]],
      "seat-2": [...state.hands["seat-2"]],
      "seat-3": [...state.hands["seat-3"]]
    },
    calls: {
      "seat-0": { ...state.calls["seat-0"] },
      "seat-1": { ...state.calls["seat-1"] },
      "seat-2": { ...state.calls["seat-2"] },
      "seat-3": { ...state.calls["seat-3"] }
    },
    grandTichuQueue: [...state.grandTichuQueue],
    passSelections: { ...state.passSelections },
    revealedPasses: { ...state.revealedPasses },
    collectedCards: {
      "seat-0": [...state.collectedCards["seat-0"]],
      "seat-1": [...state.collectedCards["seat-1"]],
      "seat-2": [...state.collectedCards["seat-2"]],
      "seat-3": [...state.collectedCards["seat-3"]]
    },
    finishedOrder: [...state.finishedOrder],
    currentTrick: {
      ...state.currentTrick,
      currentWinner
    },
    activeSeat: opponent
  };

  return (getLegalActions(shadowState)[opponent] ?? []).some(isPlayLegalAction);
}

function appendUniqueTags(target: PolicyTag[], ...tags: PolicyTag[]): void {
  for (const tag of tags) {
    if (!target.includes(tag)) {
      target.push(tag);
    }
  }
}

function buildTeamplaySnapshot(
  state: GameState,
  seat: SeatId,
  overrides: Partial<TeamplaySnapshot> = {}
): TeamplaySnapshot {
  const partner = getPartnerSeat(seat);
  return {
    partnerCalledTichu: partnerHasCalledTichu(state, seat),
    partnerStillLiveForTichu: partnerStillLiveForTichu(state, seat),
    partnerCardCount: state.hands[partner].length,
    partnerCurrentControl: currentWinnerIsPartner(state, seat),
    opponentImmediateWinRisk: hasOpponentImmediateWinRisk(state, seat),
    partnerCannotRetainLead: false,
    teamControlWouldBeLostWithoutIntervention: false,
    teamSalvageIntervention: false,
    partnerInterferenceCandidate: false,
    justifiedPartnerBomb: false,
    unjustifiedPartnerBomb: false,
    ...overrides
  };
}

function minOpponentCards(state: GameState, seat: SeatId): number {
  return Math.min(...getOpponentSeats(seat).map((opponent) => state.hands[opponent].length));
}

function combinationKindBonus(action: PlayLegalAction): number {
  switch (action.combination.kind) {
    case "dog":
      return 80;
    case "single":
      return 0;
    case "pair":
      return 12;
    case "trio":
      return 24;
    case "full-house":
      return 48;
    case "straight":
      return 56;
    case "pair-sequence":
      return 52;
    case "bomb-four-kind":
      return -25;
    case "bomb-straight":
      return -10;
  }
}

function scoreGrandTichu(state: GameState, seat: SeatId, action: EngineAction): CandidateDecision {
  const analysis = buildHandEvaluation(state, seat);
  const confidence =
    analysis.expectedTrickWins * 92 +
    analysis.synergyScore * 8 +
    analysis.controlCount * 78 +
    analysis.bombCount * 118 -
    analysis.fragmentation * 42;
  const shouldCall =
    state.hands[seat].length === 8 &&
    analysis.tichuViable &&
    (analysis.controlCount > 0 ||
      analysis.bombCount > 0 ||
      analysis.highClusterCount >= 2 ||
      analysis.highRankCount >= 5) &&
    confidence >= 620;

  if (action.type === "call_grand_tichu") {
    return {
      actor: seat,
      action,
      score: shouldCall ? 820 + confidence : -120,
      tags: [],
      reasons: shouldCall
        ? [
            "opening hand has enough control and combo density for Grand Tichu",
            "call confidence clears the Grand Tichu threshold"
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

function scoreTichu(state: GameState, seat: SeatId, action: EngineAction): CandidateDecision {
  const analysis = buildHandEvaluation(state, seat);
  const confidence =
    analysis.expectedTrickWins * 78 +
    analysis.synergyScore * 6 +
    analysis.controlCount * 64 +
    analysis.bombCount * 96 -
    analysis.fragmentation * 34 -
    state.hands[seat].length * 2;
  const shouldCall =
    analysis.tichuViable &&
    ((state.hands[seat].length <= 14 && confidence >= 520) ||
      (state.hands[seat].length <= 10 && confidence >= 440) ||
      (state.hands[seat].length <= 6 && confidence >= 340));

  return {
    actor: seat,
    action,
    score: shouldCall ? 760 + confidence : -60,
    tags: [],
    reasons: shouldCall
      ? [
          "control cards and combo density support a Tichu line",
          "calling now preserves value before the first play"
        ]
      : ["hand quality is not strong enough to justify a Tichu call"]
  };
}

function scoreDragonGift(state: GameState, seat: SeatId, action: EngineAction): CandidateDecision {
  const recipient = action.type === "assign_dragon_trick" ? action.recipient : getOpponentSeats(seat)[0]!;
  const recipientCards = state.hands[recipient].length;
  const calledTichu = state.calls[recipient].smallTichu || state.calls[recipient].grandTichu;

  return {
    actor: seat,
    action,
    score: 500 + recipientCards * 40 - (calledTichu ? 80 : 0),
    tags: [],
    reasons: [
      recipientCards >= 3
        ? "prefer giving Dragon points to the slower opponent"
        : "recipient pressure is already high, so this is the least bad opponent",
      ...(calledTichu ? ["avoid feeding bonus points to a Tichu caller"] : [])
    ]
  };
}

function scorePassSelection(state: GameState, seat: SeatId, action: EngineAction): CandidateDecision {
  if (action.type !== "select_pass") {
    return {
      actor: seat,
      action,
      score: 0,
      tags: [],
      reasons: ["not a pass-selection action"]
    };
  }

  const leftCard = state.hands[seat].find((card) => card.id === action.left);
  const partnerCard = state.hands[seat].find((card) => card.id === action.partner);
  const rightCard = state.hands[seat].find((card) => card.id === action.right);

  if (!leftCard || !partnerCard || !rightCard) {
    throw new Error("Selected pass cards must come from the acting seat hand.");
  }

  const analysis = buildHandEvaluation(state, seat);
  const score =
    320 +
    scoreCardForPartnerPass(analysis, analysis.cardMetrics.get(partnerCard.id)!) +
    scoreCardForOpponentPass(analysis, analysis.cardMetrics.get(leftCard.id)!) +
    scoreCardForOpponentPass(analysis, analysis.cardMetrics.get(rightCard.id)!);

  return {
    actor: seat,
    action,
    score,
    tags: [],
    reasons: [
      analysis.tichuViable
        ? "protects Tichu-grade control and combo pieces while bleeding weak cards away"
        : "keeps higher-value combo pieces while distributing weaker cards",
      "partner lane prioritizes useful connectors over premium control cards"
    ]
  };
}

function scorePlayAction(
  ctx: HeadlessDecisionContext,
  actor: SeatId,
  legalAction: PlayLegalAction,
  action: EngineAction
): CandidateDecision {
  const state = ctx.state;
  const handCountAfter = state.hands[actor].length - legalAction.cardIds.length;
  const opponentThreat = minOpponentCards(state, actor);
  const partnerWinning = currentWinnerIsPartner(state, actor);
  const opponentWinning =
    state.currentTrick !== null && getTeamForSeat(state.currentTrick.currentWinner) !== getTeamForSeat(actor);
  const selfTichuCalled =
    state.calls[actor].smallTichu || state.calls[actor].grandTichu;
  const reasons: string[] = [];
  const tags: PolicyTag[] = [];
  let score = 260;

  score += legalAction.cardIds.length * 36;
  score += combinationKindBonus(legalAction);

  if (handCountAfter === 0) {
    score += 1000;
    reasons.push("this line goes out immediately");
  }

  if (selfTichuCalled) {
    score += legalAction.cardIds.length * 22;
    reasons.push("called Tichu lines favor faster hand reduction");

    if (handCountAfter <= 2) {
      score += 180;
      reasons.push("low remaining card counts increase the value of pushing a called Tichu line");
    }
  }

  if (legalAction.combination.isBomb) {
    score -= 220;
    reasons.push("bombs are expensive and should be conserved when possible");

    if (opponentThreat <= 2 || handCountAfter === 0) {
      score += 260;
      reasons.push("bomb value is justified by the immediate threat");
    }

    if (selfTichuCalled && handCountAfter > 0 && opponentThreat > 2) {
      score -= 180;
      reasons.push("called Tichu lines should avoid cashing bombs too early");
    }
  }

  if (state.currentTrick === null) {
    if (legalAction.combination.containsMahjong) {
      score += 40;
      reasons.push("Mahjong lead preserves initiative and sets a wish");
    }

    if (legalAction.combination.kind === "dog" && state.hands[getPartnerSeat(actor)].length > 0) {
      score += 140;
      reasons.push("Dog safely hands the lead to partner");
    }

    score += Math.max(0, 15 - legalAction.combination.primaryRank);
    reasons.push("leading with a cheaper legal combination preserves higher control cards");
  } else {
    if (partnerWinning) {
      score -= 520;
      reasons.push("avoid overtaking partner when the team is already winning the trick");

      if (opponentThreat <= 2) {
        score += 220;
        reasons.push("opponent hand pressure justifies a more aggressive overtake");
      }
    }

    if (opponentWinning) {
      score += 140;
      reasons.push("taking the trick away from the opponents improves team tempo");

      if (opponentThreat <= 2) {
        score += 180;
        reasons.push("an opponent is close to going out, so denying control matters more");
      }
    }

    const efficiencyDelta = legalAction.combination.primaryRank - state.currentTrick.currentCombination.primaryRank;
    score += Math.max(0, 18 - efficiencyDelta * 4);
    reasons.push("prefers efficient beats over unnecessarily expensive overtakes");
  }

  const partnerTichuActive = partnerHasCalledTichu(state, actor);
  const partnerTichuStillLive = partnerStillLiveForTichu(state, actor);
  const partnerCardCount = state.hands[getPartnerSeat(actor)].length;
  const opponentImmediateWinRisk = hasOpponentImmediateWinRisk(state, actor);
  const partnerCurrentControl = partnerWinning;
  const partnerCannotRetainLead =
    partnerCurrentControl &&
    (activeOpponentHasLiveBeat(ctx, actor) ||
      (state.activeSeat === actor &&
        getOpponentSeats(actor).some((opponent) => canOpponentBeatCombination(state, opponent, getPartnerSeat(actor)))));
  const teamControlWouldBeLostWithoutIntervention = partnerCannotRetainLead;
  const partnerInterferenceCandidate = partnerCurrentControl && partnerTichuActive && partnerTichuStillLive;
  const bombsPartner = partnerInterferenceCandidate && legalAction.combination.isBomb;
  const teamSalvageIntervention =
    partnerInterferenceCandidate &&
    legalAction.combination.isBomb &&
    (opponentImmediateWinRisk || teamControlWouldBeLostWithoutIntervention);

  if (partnerTichuActive) {
    appendUniqueTags(tags, "partner_called_tichu");
  }

  if (partnerTichuStillLive) {
    appendUniqueTags(tags, "partner_still_live_for_tichu");
  }

  if (opponentImmediateWinRisk) {
    appendUniqueTags(tags, "opponent_immediate_win_risk");
  }

  if (partnerInterferenceCandidate) {
    appendUniqueTags(tags, "partner_tichu_interference_candidate");
    score -= 1480;
    reasons.push("partner has an active Tichu line, so tempo theft is heavily penalized");

    if (partnerCardCount > 1) {
      score -= 180;
      reasons.push("partner still has a plausible path to finish first without team interference");
    }

    if (bombsPartner) {
      score -= 1320;
      reasons.push("bombing a Tichu-calling partner is an extreme last resort");
    } else {
      score -= 220;
      reasons.push("overtaking a Tichu-calling partner is disfavored unless it saves the team");
    }

    if (teamControlWouldBeLostWithoutIntervention) {
      appendUniqueTags(tags, "partner_cannot_retain_lead", "team_control_would_be_lost_without_intervention");
      reasons.push("partner is under live opponent pressure and may lose the trick without help");
    }

    if (teamSalvageIntervention) {
      appendUniqueTags(tags, "team_salvage_intervention");
      score += 3380;
      reasons.push("allowed intervention: bomb preserves team survival against an immediate collapse risk");
    } else if (bombsPartner) {
      appendUniqueTags(tags, "unjustified_partner_bomb");
      reasons.push("rejected bomb: partner has active Tichu and remains live");
    }

    if (bombsPartner && teamSalvageIntervention) {
      appendUniqueTags(tags, "justified_partner_bomb");
      reasons.push("allowed bomb: opponent pressure made partner support secondary to team survival");
    }
  }

  const teamplay =
    partnerTichuActive || partnerInterferenceCandidate
      ? buildTeamplaySnapshot(state, actor, {
          partnerCurrentControl,
          opponentImmediateWinRisk,
          partnerCannotRetainLead,
          teamControlWouldBeLostWithoutIntervention,
          teamSalvageIntervention,
          partnerInterferenceCandidate,
          justifiedPartnerBomb: bombsPartner && teamSalvageIntervention,
          unjustifiedPartnerBomb: bombsPartner && !teamSalvageIntervention
        })
      : undefined;

  if (legalAction.cardIds.includes("dragon") && handCountAfter > 0) {
    score -= 130;
    reasons.push("holding Dragon back keeps a premium single-card stopper available");

    if (selfTichuCalled && handCountAfter > 2) {
      score -= 70;
      reasons.push("called Tichu lines should preserve Dragon until it closes or stabilizes the race");
    }
  }

  if (
    legalAction.cardIds.includes("phoenix") &&
    legalAction.combination.kind === "single" &&
    handCountAfter > 0
  ) {
    score -= 90;
    reasons.push("preserve Phoenix flexibility when a simpler line exists");

    if (selfTichuCalled && handCountAfter > 2) {
      score -= 60;
      reasons.push("called Tichu lines should keep Phoenix flexible until the endgame");
    }
  }

  return {
    actor,
    action,
    score,
    reasons,
    tags,
    ...(teamplay ? { teamplay } : {})
  };
}

function scorePassTurn(ctx: HeadlessDecisionContext, seat: SeatId, action: EngineAction): CandidateDecision {
  const state = ctx.state;
  const partnerWinning = currentWinnerIsPartner(state, seat);
  const opponentThreat = minOpponentCards(state, seat);
  let score = 120;
  const reasons: string[] = ["passing keeps stronger cards available for later decisions"];
  const tags: PolicyTag[] = [];

  if (partnerWinning) {
    score += 340;
    reasons.push("partner is already winning the trick");

    if (opponentThreat > 2) {
      score += 80;
      reasons.push("there is no immediate opponent escape threat");
    }
  }

  if (!partnerWinning && state.currentTrick !== null) {
    score -= 80;
    reasons.push("passing leaves the current trick with the opponents");
  }

  if (opponentThreat <= 2) {
    score -= 120;
    reasons.push("low opponent card counts make passive play riskier");
  }

  const partnerTichuActive = partnerHasCalledTichu(state, seat);
  const partnerTichuStillLive = partnerStillLiveForTichu(state, seat);
  const opponentImmediateWinRisk = hasOpponentImmediateWinRisk(state, seat);
  const teamplay =
    partnerTichuActive || partnerWinning
      ? buildTeamplaySnapshot(state, seat, {
          partnerCurrentControl: partnerWinning,
          opponentImmediateWinRisk,
          partnerInterferenceCandidate: false,
          teamSalvageIntervention: false
        })
      : undefined;

  if (partnerTichuActive) {
    appendUniqueTags(tags, "partner_called_tichu");
  }

  if (partnerTichuStillLive) {
    appendUniqueTags(tags, "partner_still_live_for_tichu");
  }

  if (opponentImmediateWinRisk) {
    appendUniqueTags(tags, "opponent_immediate_win_risk");
  }

  if (partnerWinning && partnerTichuStillLive) {
    appendUniqueTags(tags, "partner_tempo_preserved", "partner_control_preserved");

    if (opponentImmediateWinRisk) {
      score += 180;
      reasons.push("partner control is valuable, but immediate opponent pressure limits passive support value");
    } else {
      score += 860;
      reasons.push("preserved partner control because the active Tichu line is still alive");
    }
  }

  return {
    actor: seat,
    action,
    score,
    reasons,
    tags,
    ...(teamplay ? { teamplay } : {})
  };
}

function scoreConcreteAction(
  ctx: HeadlessDecisionContext,
  actor: SeatId | typeof SYSTEM_ACTOR,
  legalAction: LegalAction,
  action: EngineAction
): CandidateDecision {
  const state = ctx.state;
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
    return scoreGrandTichu(state, actor, action);
  }

  if (action.type === "call_tichu") {
    return scoreTichu(state, actor, action);
  }

  if (action.type === "assign_dragon_trick") {
    return scoreDragonGift(state, actor, action);
  }

  if (action.type === "select_pass") {
    return scorePassSelection(state, actor, action);
  }

  if (action.type === "pass_turn") {
    return scorePassTurn(ctx, actor, action);
  }

  if (isPlayLegalAction(legalAction) && action.type === "play_cards") {
    return scorePlayAction(ctx, actor, legalAction, action);
  }

  return {
    actor,
    action,
    score: 0,
    reasons: ["fallback candidate"],
    tags: []
  };
}

function collectCandidates(ctx: HeadlessDecisionContext): CandidateDecision[] {
  const actors: Array<SeatId | typeof SYSTEM_ACTOR> = [SYSTEM_ACTOR, ...SEAT_IDS];
  const candidates: CandidateDecision[] = [];

  for (const actor of actors) {
    const legalActions = ctx.legalActions[actor] ?? [];
    for (const legalAction of legalActions) {
      const action = toConcreteAction(ctx.state, actor, legalAction);
      candidates.push(scoreConcreteAction(ctx, actor, legalAction, action));
    }
  }

  return candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return JSON.stringify(left.action).localeCompare(JSON.stringify(right.action));
  });
}

function summarizePlayCandidates(actions: LegalAction[]): string[] {
  return actions.filter(isPlayLegalAction).map((action) => action.combination.key);
}

function selectSeatEmergencyPassCandidate(
  ctx: HeadlessDecisionContext,
  actor: SeatId
): CandidateDecision | null {
  const passAction = (ctx.legalActions[actor] ?? []).find(isPassLegalAction);
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

  console.info("[ai] Straight response options", {
    activeSeat: actor,
    leadCombo: ctx.state.currentTrick.currentCombination.key,
    legalResponseCount: actorActions.filter(isPlayLegalAction).length,
    normalizedResponseList: summarizePlayCandidates(actorActions),
    canPass: actorActions.some(isPassLegalAction),
    wishState: ctx.state.currentWish
  });

  const leadingCandidate = candidates[0] ?? null;
  if (
    leadingCandidate &&
    (leadingCandidate.action.type === "play_cards" ||
      leadingCandidate.action.type === "pass_turn")
  ) {
    console.info("[ai] Straight response selected", {
      activeSeat: actor,
      chosenAction: leadingCandidate.action,
      fallbackUsed: false
    });
    return leadingCandidate;
  }

  const selected = progressionCandidates[0] ?? null;
  if (selected) {
    console.info("[ai] Straight response selected", {
      activeSeat: actor,
      chosenAction: selected.action,
      fallbackUsed: false
    });
    return selected;
  }

  const fallbackPass = selectSeatEmergencyPassCandidate(ctx, actor);
  if (fallbackPass) {
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
  candidates: CandidateDecision[]
): ChosenDecision {
  return {
    actor: selected.actor,
    action: selected.action,
    explanation: {
      policy: "heuristics-v1",
      actor: selected.actor,
      candidateScores: candidates.map((candidate) => ({
        action: candidate.action,
        score: candidate.score,
        reasons: candidate.reasons,
        tags: candidate.tags,
        ...(candidate.teamplay ? { teamplay: candidate.teamplay } : {})
      })),
      selectedReasonSummary: selected.reasons,
      selectedTags: selected.tags,
      ...(selected.teamplay ? { selectedTeamplay: selected.teamplay } : {})
    }
  };
}

export const heuristicsV1Policy: HeuristicPolicy = {
  name: "heuristics-v1",
  chooseAction(ctx) {
    try {
      const candidates = collectCandidates(ctx);
      const progressionSelected =
        selectProgressionCandidateForActiveTurn(ctx, candidates);
      const selected =
        progressionSelected ?? candidates[0] ?? selectEmergencyPassCandidate(ctx);

      if (!selected) {
        throw new Error("No legal action candidates available for heuristics-v1.");
      }

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

      return toChosenDecision(selected, candidates);
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
        console.info("[ai] Straight response selected", {
          activeSeat: fallback.actor,
          chosenAction: fallback.action,
          fallbackUsed: true
        });
      }

      return toChosenDecision(fallback, []);
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
