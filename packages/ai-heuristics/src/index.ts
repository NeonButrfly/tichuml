import {
  SEAT_IDS,
  SYSTEM_ACTOR,
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

export type PolicyExplanation = {
  policy: string;
  actor: SeatId | typeof SYSTEM_ACTOR;
  candidateScores: Array<{
    action: EngineAction;
    score: number;
    reasons: string[];
  }>;
  selectedReasonSummary: string[];
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
};

type PlayLegalAction = Extract<LegalAction, { type: "play_cards" }>;

function isPlayLegalAction(action: LegalAction): action is PlayLegalAction {
  return action.type === "play_cards";
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
  const byDangerAscending = [...available].sort((left, right) => {
    const difference = cardStrength(left) - cardStrength(right);
    if (difference !== 0) {
      return difference;
    }

    return left.id.localeCompare(right.id);
  });
  const byPartnerValueDescending = [...available].sort((left, right) => {
    const difference = cardStrength(right) - cardStrength(left);
    if (difference !== 0) {
      return difference;
    }

    return left.id.localeCompare(right.id);
  });

  const left = byDangerAscending[0];
  const right = byDangerAscending.find((card) => card.id !== left?.id);
  const partner =
    byPartnerValueDescending.find((card) => card.id !== left?.id && card.id !== right?.id) ??
    byDangerAscending.find((card) => card.id !== left?.id && card.id !== right?.id);

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
  const strength = handStrength(state.hands[seat]);
  const lowCards = state.hands[seat].filter((card) => card.kind === "standard" && card.rank <= 6).length;
  const shouldCall = strength >= 112 && lowCards <= 2;

  if (action.type === "call_grand_tichu") {
    return {
      actor: seat,
      action,
      score: shouldCall ? 820 + strength : -120,
      reasons: shouldCall
        ? ["strong opening eight-card hand", "high-card density supports a Grand Tichu call"]
        : ["hand strength is too volatile for Grand Tichu"]
    };
  }

  return {
    actor: seat,
    action,
    score: shouldCall ? 120 : 700,
    reasons: shouldCall
      ? ["declining leaves value on the table despite a strong hand"]
      : ["declining Grand Tichu avoids a high-variance overcall"]
  };
}

function scoreTichu(state: GameState, seat: SeatId, action: EngineAction): CandidateDecision {
  const strength = handStrength(state.hands[seat]);
  const shouldCall =
    (state.hands[seat].length <= 6 && strength >= 95) ||
    (state.hands[seat].length <= 4 && strength >= 70);

  return {
    actor: seat,
    action,
    score: shouldCall ? 760 + strength / 10 : -60,
    reasons: shouldCall
      ? ["compact, high-quality hand supports a Tichu call", "calling now preserves value before the first play"]
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
      reasons: ["not a pass-selection action"]
    };
  }

  const leftCard = state.hands[seat].find((card) => card.id === action.left);
  const partnerCard = state.hands[seat].find((card) => card.id === action.partner);
  const rightCard = state.hands[seat].find((card) => card.id === action.right);

  if (!leftCard || !partnerCard || !rightCard) {
    throw new Error("Selected pass cards must come from the acting seat hand.");
  }

  const score =
    320 +
    cardStrength(partnerCard) * 6 -
    (cardStrength(leftCard) + cardStrength(rightCard)) * 4;

  return {
    actor: seat,
    action,
    score,
    reasons: [
      "sends the strongest spare card to partner support",
      "bleeds the lowest-value cards to the opponents"
    ]
  };
}

function scorePlayAction(state: GameState, actor: SeatId, legalAction: PlayLegalAction, action: EngineAction): CandidateDecision {
  const handCountAfter = state.hands[actor].length - legalAction.cardIds.length;
  const opponentThreat = minOpponentCards(state, actor);
  const partnerWinning = currentWinnerIsPartner(state, actor);
  const opponentWinning =
    state.currentTrick !== null && getTeamForSeat(state.currentTrick.currentWinner) !== getTeamForSeat(actor);
  const reasons: string[] = [];
  let score = 260;

  score += legalAction.cardIds.length * 36;
  score += combinationKindBonus(legalAction);

  if (handCountAfter === 0) {
    score += 1000;
    reasons.push("this line goes out immediately");
  }

  if (legalAction.combination.isBomb) {
    score -= 220;
    reasons.push("bombs are expensive and should be conserved when possible");

    if (opponentThreat <= 2 || handCountAfter === 0) {
      score += 260;
      reasons.push("bomb value is justified by the immediate threat");
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

  if (legalAction.cardIds.includes("dragon") && handCountAfter > 0) {
    score -= 130;
    reasons.push("holding Dragon back keeps a premium single-card stopper available");
  }

  if (
    legalAction.cardIds.includes("phoenix") &&
    legalAction.combination.kind === "single" &&
    handCountAfter > 0
  ) {
    score -= 90;
    reasons.push("preserve Phoenix flexibility when a simpler line exists");
  }

  return {
    actor,
    action,
    score,
    reasons
  };
}

function scorePassTurn(state: GameState, seat: SeatId, action: EngineAction): CandidateDecision {
  const partnerWinning = currentWinnerIsPartner(state, seat);
  const opponentThreat = minOpponentCards(state, seat);
  let score = 120;
  const reasons: string[] = ["passing keeps stronger cards available for later decisions"];

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

  return {
    actor: seat,
    action,
    score,
    reasons
  };
}

function scoreConcreteAction(
  state: GameState,
  actor: SeatId | typeof SYSTEM_ACTOR,
  legalAction: LegalAction,
  action: EngineAction
): CandidateDecision {
  if (actor === SYSTEM_ACTOR || action.type === "advance_phase") {
    return {
      actor,
      action,
      score: 5000,
      reasons: ["required system phase advancement"]
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
    return scorePassTurn(state, actor, action);
  }

  if (isPlayLegalAction(legalAction) && action.type === "play_cards") {
    return scorePlayAction(state, actor, legalAction, action);
  }

  return {
    actor,
    action,
    score: 0,
    reasons: ["fallback candidate"]
  };
}

function collectCandidates(ctx: HeadlessDecisionContext): CandidateDecision[] {
  const actors: Array<SeatId | typeof SYSTEM_ACTOR> = [SYSTEM_ACTOR, ...SEAT_IDS];
  const candidates: CandidateDecision[] = [];

  for (const actor of actors) {
    const legalActions = ctx.legalActions[actor] ?? [];
    for (const legalAction of legalActions) {
      const action = toConcreteAction(ctx.state, actor, legalAction);
      candidates.push(scoreConcreteAction(ctx.state, actor, legalAction, action));
    }
  }

  return candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return JSON.stringify(left.action).localeCompare(JSON.stringify(right.action));
  });
}

export const heuristicsV1Policy: HeuristicPolicy = {
  name: "heuristics-v1",
  chooseAction(ctx) {
    const candidates = collectCandidates(ctx);
    const selected = candidates[0];

    if (!selected) {
      throw new Error("No legal action candidates available for heuristics-v1.");
    }

    return {
      actor: selected.actor,
      action: selected.action,
      explanation: {
        policy: "heuristics-v1",
        actor: selected.actor,
        candidateScores: candidates.map((candidate) => ({
          action: candidate.action,
          score: candidate.score,
          reasons: candidate.reasons
        })),
        selectedReasonSummary: selected.reasons
      }
    };
  }
};

export const deterministicBaselinePolicy = heuristicsV1Policy;

export const heuristicFoundation = {
  policyFamily: "team-aware-heuristics",
  dependsOn: engineFoundation.name,
  readyForHeadlessFlow: true,
  baselinePolicy: heuristicsV1Policy.name
};
