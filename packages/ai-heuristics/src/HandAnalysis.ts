import {
  SEAT_IDS,
  cardsFromIds,
  getLegalActions,
  type Card,
  type GameState,
  type SeatId,
  type StandardRank
} from "@tichuml/engine";
import { cloneState, hasOpponentCalledTichu, partnerHasCalledTichu } from "./HeuristicContext.js";
import type { CardPassMetrics, HandEvaluation, PlayLegalAction } from "./types.js";
import { cardStrength, isPlayLegalAction, isStandardCard } from "./utils.js";

function suitOf(card: Card): number {
  if (card.kind !== "standard") {
    return -1;
  }

  const suit = card.id.split("-")[0];
  switch (suit) {
    case "jade":
      return 0;
    case "sword":
      return 1;
    case "pagoda":
      return 2;
    case "star":
      return 3;
    default:
      return -1;
  }
}

function cardPointValue(card: Card): number {
  if (card.kind === "special") {
    return card.special === "dragon" ? 25 : 0;
  }

  if (card.rank === 5) {
    return 5;
  }
  if (card.rank === 10 || card.rank === 13) {
    return 10;
  }
  return 0;
}

export function handStrength(cards: Card[]): number {
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

export function legacyHandStrengthScore(cards: Card[]): number {
  let score = 0;
  const rankCounts = new Map<number, number>();

  for (const card of cards) {
    if (card.kind === "special") {
      if (card.special === "dragon") {
        score += 40;
      } else if (card.special === "phoenix") {
        score += 30;
      } else if (card.special === "mahjong") {
        score += 10;
      } else if (card.special === "dog") {
        score -= 3;
      }
      continue;
    }

    rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
    if (card.rank >= 11 && card.rank <= 14) {
      score += (card.rank - 10) * 2.5;
    } else if (card.rank >= 2 && card.rank <= 10) {
      score += (card.rank - 1) * 0.4;
    }
  }

  for (const [, count] of rankCounts) {
    if (count === 4) {
      score += 60;
    } else if (count === 3) {
      score += 12;
    } else if (count === 2) {
      score += 6;
    }
  }

  const uniqueRanks = [...rankCounts.keys()].sort((left, right) => left - right);
  let runLength = 0;
  let longestRun = 0;
  let previous: number | null = null;
  for (const rank of uniqueRanks) {
    if (previous === null || rank === previous + 1) {
      runLength += 1;
    } else {
      runLength = 1;
    }
    previous = rank;
    longestRun = Math.max(longestRun, runLength);
  }
  if (longestRun >= 5) {
    score += (longestRun - 4) * 10;
  }

  for (let suit = 0; suit < 4; suit += 1) {
    const suitedRanks = cards
      .filter((card) => suitOf(card) === suit)
      .map((card) => (card.kind === "standard" ? card.rank : -1))
      .filter((rank) => rank >= 2 && rank <= 14);
    const uniqueSuitedRanks = [...new Set(suitedRanks)].sort((left, right) => left - right);
    let suitedRun = 0;
    let longestSuitedRun = 0;
    let previousRank: number | null = null;

    for (const rank of uniqueSuitedRanks) {
      if (previousRank === null || rank === previousRank + 1) {
        suitedRun += 1;
      } else {
        suitedRun = 1;
      }
      previousRank = rank;
      longestSuitedRun = Math.max(longestSuitedRun, suitedRun);
    }

    if (longestSuitedRun >= 5) {
      score += 80 + (longestSuitedRun - 5) * 10;
    }
  }

  const suitCounts = [0, 0, 0, 0];
  for (const card of cards) {
    const suit = suitOf(card);
    if (suit >= 0) {
      suitCounts[suit] = (suitCounts[suit] ?? 0) + 1;
    }
  }
  score += Math.max(...suitCounts) * 1.2;
  score += cards.reduce((sum, card) => sum + Math.max(0, cardPointValue(card)), 0) * 0.3;

  return score;
}

export function getRankCounts(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    if (card.kind !== "standard") {
      continue;
    }

    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}

export function getStraightProtectedRanks(cards: Card[]): Set<number> {
  const rankCounts = getRankCounts(cards);
  const ranks = [...rankCounts.keys()].sort((left, right) => left - right);
  const protectedRanks = new Set<number>();

  for (let index = 0; index < ranks.length; index += 1) {
    const start = ranks[index];
    if (
      start === undefined ||
      !rankCounts.has(start + 1) ||
      !rankCounts.has(start + 2)
    ) {
      continue;
    }

    protectedRanks.add(start);
    protectedRanks.add(start + 1);
    protectedRanks.add(start + 2);
  }

  return protectedRanks;
}

export function getSeenRankCounts(state: GameState): Map<StandardRank, number> {
  const counts = new Map<StandardRank, number>();
  const appendCard = (card: Card) => {
    if (card.kind !== "standard") {
      return;
    }

    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  };

  for (const seat of SEAT_IDS) {
    for (const card of state.collectedCards[seat]) {
      appendCard(card);
    }
  }

  for (const entry of state.currentTrick?.entries ?? []) {
    if (entry.type !== "play") {
      continue;
    }

    for (const card of cardsFromIds(entry.combination.cardIds)) {
      appendCard(card);
    }
  }

  return counts;
}

export function getLeadPlayActions(state: GameState, seat: SeatId): PlayLegalAction[] {
  if (state.hands[seat].length === 0) {
    return [];
  }

  const shadowState = cloneState(state);
  shadowState.phase = "trick_play";
  shadowState.activeSeat = seat;
  shadowState.currentTrick = null;
  shadowState.currentWish = null;
  shadowState.pendingDragonGift = null;

  return (getLegalActions(shadowState)[seat] ?? []).filter(isPlayLegalAction);
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

export function buildHandEvaluation(state: GameState, seat: SeatId): HandEvaluation {
  const cards = [...state.hands[seat]];
  const leadPlayActions = getLeadPlayActions(state, seat);
  const rankCounts = getRankCounts(cards);
  const straightProtectedRanks = getStraightProtectedRanks(cards);
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
  const pairCount = [...rankCounts.values()].filter((count) => count === 2).length;
  const trioCount = [...rankCounts.values()].filter((count) => count === 3).length;
  const nearBombCount = [...rankCounts.values()].filter((count) => count === 3).length;
  const longestStraightLength = leadPlayActions
    .filter(
      (action) =>
        action.combination.kind === "straight" &&
        !action.combination.isBomb
    )
    .reduce((best, action) => Math.max(best, action.combination.cardCount), 0);
  const longestPairSequenceLength = leadPlayActions
    .filter((action) => action.combination.kind === "pair-sequence")
    .reduce((best, action) => Math.max(best, action.combination.cardCount), 0);
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
  const loserCount = [...cardMetrics.values()].filter(
    (metric) =>
      metric.card.kind === "standard" &&
      metric.card.rank <= 9 &&
      metric.rankCount === 1 &&
      metric.neighborCount === 0 &&
      metric.comboCount <= 1
  ).length;
  const deadSingleCount = [...cardMetrics.values()].filter(
    (metric) =>
      metric.rankCount === 1 &&
      metric.neighborCount === 0 &&
      metric.comboCount <= 1 &&
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
  const phoenixAvailable = cards.some(
    (card) => card.kind === "special" && card.special === "phoenix"
  );
  const dragonAvailable = cards.some(
    (card) => card.kind === "special" && card.special === "dragon"
  );
  const dogAvailable = cards.some(
    (card) => card.kind === "special" && card.special === "dog"
  );
  const mahjongAvailable = cards.some(
    (card) => card.kind === "special" && card.special === "mahjong"
  );
  const finishPlanScore =
    synergyScore * 11 +
    handSpeed * 24 +
    expectedTrickWins * 18 +
    longestStraightLength * 9 +
    longestPairSequenceLength * 8 +
    pairCount * 10 +
    trioCount * 16 +
    bombCount * 36 +
    controlCount * 24 -
    deadSingleCount * 18 -
    fragmentation * 11 -
    loserCount * 10;
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
    legacyCallStrength: legacyHandStrengthScore(cards),
    leadPlayActions,
    cardMetrics,
    rankCounts,
    straightProtectedRanks,
    controlCount,
    bombCount,
    highRankCount,
    highClusterCount,
    synergyScore,
    fragmentation,
    loserCount,
    deadSingleCount,
    expectedTrickWins,
    handSpeed,
    pairCount,
    trioCount,
    nearBombCount,
    longestStraightLength,
    longestPairSequenceLength,
    finishPlanScore,
    phoenixAvailable,
    dragonAvailable,
    dogAvailable,
    mahjongAvailable,
    tichuViable,
    protectedCardIds
  };
}

export function buildHandEvaluationAfterRemovingCards(
  state: GameState,
  seat: SeatId,
  removedCardIds: string[]
): HandEvaluation {
  const projectedState = cloneState(state);
  projectedState.hands[seat] = projectedState.hands[seat].filter(
    (card) => !removedCardIds.includes(card.id)
  );
  return buildHandEvaluation(projectedState, seat);
}

export function getStructurePenaltyForPlay(
  hand: Card[],
  legalAction: PlayLegalAction,
  handCountAfter: number
): number {
  const rankCounts = getRankCounts(hand);
  const straightProtectedRanks = getStraightProtectedRanks(hand);
  const endgameScalar =
    handCountAfter <= 3 ? 0.22 : handCountAfter <= 5 ? 0.48 : 1;
  const isSingle = legalAction.cardIds.length === 1;
  let penalty = 0;

  for (const cardId of legalAction.cardIds) {
    const card = hand.find((candidate) => candidate.id === cardId);
    if (!card) {
      continue;
    }

    const inProtectedStraight =
      card.kind === "standard" && straightProtectedRanks.has(card.rank);
    const rankCount =
      card.kind === "standard" ? rankCounts.get(card.rank) ?? 1 : 1;

    if (isSingle) {
      if (rankCount >= 3) {
        penalty += 28;
      } else if (rankCount === 2) {
        penalty += 18;
      }

      if (inProtectedStraight) {
        penalty += 20;
      }
      if (
        card.kind === "standard" &&
        (rankCounts.has(card.rank - 1) || rankCounts.has(card.rank + 1))
      ) {
        penalty += 10;
      }
      if (card.kind === "special" && card.special === "mahjong") {
        penalty += 6;
      }
    } else {
      if (rankCount >= 2) {
        penalty += 3;
      }

      if (inProtectedStraight) {
        penalty += 2.5;
      }
    }
  }

  return penalty * endgameScalar;
}

export function combinationKindBonus(action: PlayLegalAction): number {
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

export function chooseWishRank(
  state: GameState,
  seat: SeatId,
  selectedCardIds: string[]
): StandardRank {
  const remainingRanks = state.hands[seat].filter(
    (
      card
    ): card is Extract<(typeof state.hands)[SeatId][number], { kind: "standard" }> =>
      !selectedCardIds.includes(card.id) && card.kind === "standard"
  );
  const remainingCounts = new Map<StandardRank, number>();
  const seenCounts = getSeenRankCounts(state);
  const partnerCalled = partnerHasCalledTichu(state, seat);
  const opponentCalled = hasOpponentCalledTichu(state, seat);

  if (partnerCalled && !opponentCalled) {
    return 2;
  }

  if (opponentCalled && !partnerCalled) {
    return 14;
  }

  for (const card of remainingRanks) {
    remainingCounts.set(card.rank, (remainingCounts.get(card.rank) ?? 0) + 1);
  }

  const ranked = [...Array.from({ length: 13 }, (_, index) => (index + 2) as StandardRank)]
    .map((rank) => {
      const seen = seenCounts.get(rank) ?? 0;
      const held = remainingCounts.get(rank) ?? 0;
      const remaining = Math.max(0, 4 - seen - held);
      let score = remaining * 12;

      if (held >= 2) {
        score -= 12;
      } else if (held === 1) {
        score += 3;
      }

      if (rank >= 6 && rank <= 12) {
        score += 1;
      }

      if (opponentCalled && !partnerCalled && rank >= 11) {
        score += 8;
      }

      if (partnerCalled && rank <= 5) {
        score += 7;
      }

      return { rank, score, held, remaining };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.remaining !== left.remaining) {
        return right.remaining - left.remaining;
      }

      if (partnerCalled && !opponentCalled) {
        return left.rank - right.rank;
      }

      return right.rank - left.rank;
    });

  return ranked[0]?.rank ?? 14;
}

export function hasWishSatisfiedOption(actions: PlayLegalAction[], wish: StandardRank | null): boolean {
  if (wish === null) {
    return false;
  }

  return actions.some((action) => action.combination.actualRanks.includes(wish));
}
