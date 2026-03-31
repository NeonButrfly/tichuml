import { type Card, type Combination, type StandardRank } from "./types.js";
import { getStraightRank, isDog, isDragon, isMahjong, isPhoenix } from "./cards.js";

type EvaluationContext = {
  currentSingleValue: number | null;
  phoenixAsRank?: StandardRank;
};

function buildCombination(
  kind: Combination["kind"],
  cards: Card[],
  primaryRank: number,
  phoenixAsRank: StandardRank | null,
  pairCount: number | null
): Combination {
  const sortedCardIds = [...cards].map((card) => card.id).sort();
  const actualRanks = cards
    .filter((card) => !isPhoenix(card))
    .map((card) => getStraightRank(card))
    .filter((rank): rank is NonNullable<typeof rank> => rank !== null);

  return {
    key: `${kind}:${sortedCardIds.join(",")}:${phoenixAsRank ?? "none"}`,
    kind,
    cardIds: sortedCardIds,
    primaryRank,
    cardCount: cards.length,
    phoenixAsRank,
    containsMahjong: cards.some((card) => isMahjong(card)),
    containsDragon: cards.some((card) => isDragon(card)),
    containsPhoenix: cards.some((card) => isPhoenix(card)),
    containsDog: cards.some((card) => isDog(card)),
    actualRanks,
    pairCount,
    isBomb: kind === "bomb-four-kind" || kind === "bomb-straight"
  };
}

function isConsecutive(ranks: number[]): boolean {
  const sorted = [...ranks].sort((left, right) => left - right);

  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] !== sorted[index - 1]! + 1) {
      return false;
    }
  }

  return true;
}

function createCountMap(ranks: number[]): Map<number, number> {
  const counts = new Map<number, number>();

  for (const rank of ranks) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }

  return counts;
}

function isStandardCard(card: Card): card is Extract<Card, { kind: "standard" }> {
  return card.kind === "standard";
}

function evaluateSingle(cards: Card[], context: EvaluationContext): Combination | null {
  const [card] = cards;
  if (!card) {
    return null;
  }

  if (isDog(card)) {
    return buildCombination("dog", cards, 0, null, null);
  }

  if (isDragon(card)) {
    return buildCombination("single", cards, 15, null, null);
  }

  if (isPhoenix(card)) {
    if (context.currentSingleValue === 15) {
      return null;
    }

    return buildCombination(
      "single",
      cards,
      context.currentSingleValue === null ? 1.5 : context.currentSingleValue + 0.5,
      null,
      null
    );
  }

  if (isMahjong(card)) {
    return buildCombination("single", cards, 1, null, null);
  }

  if (card.kind !== "standard") {
    return null;
  }

  return buildCombination("single", cards, card.rank, null, null);
}

function evaluateFourKindBomb(cards: Card[]): Combination | null {
  if (cards.length !== 4 || cards.some((card) => card.kind !== "standard")) {
    return null;
  }

  const standardCards = cards.filter(isStandardCard);
  const ranks = standardCards.map((card) => card.rank);
  return ranks.every((rank) => rank === ranks[0])
    ? buildCombination("bomb-four-kind", cards, ranks[0]!, null, null)
    : null;
}

function evaluateStraightBomb(cards: Card[]): Combination | null {
  if (cards.length < 5 || cards.some((card) => card.kind !== "standard")) {
    return null;
  }

  const standardCards = cards.filter(isStandardCard);
  const suit = standardCards[0]?.suit;
  if (!suit || standardCards.some((card) => card.suit !== suit)) {
    return null;
  }

  const ranks = standardCards.map((card) => card.rank);
  if (new Set(ranks).size !== ranks.length || !isConsecutive(ranks)) {
    return null;
  }

  return buildCombination("bomb-straight", cards, Math.max(...ranks), null, null);
}

function evaluatePair(cards: Card[], phoenixAsRank: StandardRank | null): Combination | null {
  if (cards.length !== 2) {
    return null;
  }

  if (cards.some((card) => card.kind === "special" && !isPhoenix(card))) {
    return null;
  }

  const ranks = cards
    .filter((card) => !isPhoenix(card))
    .map((card) => (card.kind === "standard" ? card.rank : null))
    .filter((rank): rank is StandardRank => rank !== null);

  if (cards.some((card) => isPhoenix(card))) {
    if (ranks.length !== 1 || !phoenixAsRank || ranks[0] !== phoenixAsRank) {
      return null;
    }

    return buildCombination("pair", cards, phoenixAsRank, phoenixAsRank, null);
  }

  return ranks.length === 2 && ranks[0] === ranks[1]
    ? buildCombination("pair", cards, ranks[0]!, null, null)
    : null;
}

function evaluateTrio(cards: Card[], phoenixAsRank: StandardRank | null): Combination | null {
  if (cards.length !== 3) {
    return null;
  }

  if (cards.some((card) => card.kind === "special" && !isPhoenix(card))) {
    return null;
  }

  const ranks = cards
    .filter((card) => !isPhoenix(card))
    .map((card) => (card.kind === "standard" ? card.rank : null))
    .filter((rank): rank is StandardRank => rank !== null);

  if (cards.some((card) => isPhoenix(card))) {
    if (ranks.length !== 2 || !phoenixAsRank || !ranks.every((rank) => rank === phoenixAsRank)) {
      return null;
    }

    return buildCombination("trio", cards, phoenixAsRank, phoenixAsRank, null);
  }

  return ranks.length === 3 && ranks.every((rank) => rank === ranks[0])
    ? buildCombination("trio", cards, ranks[0]!, null, null)
    : null;
}

function evaluateFullHouse(cards: Card[], phoenixAsRank: StandardRank | null): Combination | null {
  if (cards.length !== 5) {
    return null;
  }

  if (cards.some((card) => card.kind === "special" && !isPhoenix(card))) {
    return null;
  }

  const ranks = cards
    .filter((card) => !isPhoenix(card))
    .map((card) => (card.kind === "standard" ? card.rank : null))
    .filter((rank): rank is StandardRank => rank !== null);
  const counts = createCountMap(ranks);

  if (cards.some((card) => isPhoenix(card))) {
    if (!phoenixAsRank) {
      return null;
    }

    counts.set(phoenixAsRank, (counts.get(phoenixAsRank) ?? 0) + 1);
  }

  const grouped = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  if (grouped.length !== 2 || grouped[0]?.[1] !== 3 || grouped[1]?.[1] !== 2) {
    return null;
  }

  const [trioEntry] = grouped;
  if (!trioEntry) {
    return null;
  }

  return buildCombination("full-house", cards, trioEntry[0], phoenixAsRank, null);
}

function evaluateStraight(cards: Card[], phoenixAsRank: StandardRank | null): Combination | null {
  if (cards.length < 5 || cards.some((card) => isDog(card) || isDragon(card))) {
    return null;
  }

  const ranks = cards
    .filter((card) => !isPhoenix(card))
    .map((card) => getStraightRank(card))
    .filter((rank): rank is NonNullable<typeof rank> => rank !== null);

  if (new Set(ranks).size !== ranks.length) {
    return null;
  }

  if (cards.some((card) => isPhoenix(card))) {
    if (!phoenixAsRank || ranks.includes(phoenixAsRank)) {
      return null;
    }

    ranks.push(phoenixAsRank);
  }

  if (!isConsecutive(ranks)) {
    return null;
  }

  return buildCombination("straight", cards, Math.max(...ranks), phoenixAsRank, null);
}

function evaluatePairSequence(cards: Card[], phoenixAsRank: StandardRank | null): Combination | null {
  if (cards.length < 4 || cards.length % 2 !== 0) {
    return null;
  }

  if (cards.some((card) => card.kind === "special" && !isPhoenix(card))) {
    return null;
  }

  const ranks = cards
    .filter((card) => !isPhoenix(card))
    .map((card) => (card.kind === "standard" ? card.rank : null))
    .filter((rank): rank is StandardRank => rank !== null);
  const counts = createCountMap(ranks);

  if (cards.some((card) => isPhoenix(card))) {
    if (!phoenixAsRank) {
      return null;
    }

    counts.set(phoenixAsRank, (counts.get(phoenixAsRank) ?? 0) + 1);
  }

  const sortedRanks = [...counts.keys()].sort((left, right) => left - right);
  if (sortedRanks.length < 2 || !isConsecutive(sortedRanks)) {
    return null;
  }

  if ([...counts.values()].some((count) => count !== 2)) {
    return null;
  }

  return buildCombination(
    "pair-sequence",
    cards,
    Math.max(...sortedRanks),
    phoenixAsRank,
    sortedRanks.length
  );
}

function evaluateWithAssignment(cards: Card[], context: EvaluationContext): Combination | null {
  if (cards.length === 1) {
    return evaluateSingle(cards, context);
  }

  const straightBomb = evaluateStraightBomb(cards);
  if (straightBomb) {
    return straightBomb;
  }

  const fourKindBomb = evaluateFourKindBomb(cards);
  if (fourKindBomb) {
    return fourKindBomb;
  }

  const phoenixAsRank = context.phoenixAsRank ?? null;

  return (
    evaluatePair(cards, phoenixAsRank) ??
    evaluateTrio(cards, phoenixAsRank) ??
    evaluateFullHouse(cards, phoenixAsRank) ??
    evaluateStraight(cards, phoenixAsRank) ??
    evaluatePairSequence(cards, phoenixAsRank)
  );
}

export function listCombinationInterpretations(
  cards: Card[],
  currentCombination: Combination | null
): Combination[] {
  if (cards.length === 0) {
    return [];
  }

  const hasPhoenix = cards.some((card) => isPhoenix(card));
  if (!hasPhoenix || cards.length === 1) {
    const direct = evaluateWithAssignment(cards, {
      currentSingleValue:
        currentCombination?.kind === "single" ? currentCombination.primaryRank : null
    });
    return direct ? [direct] : [];
  }

  const combinations = new Map<string, Combination>();

  for (const candidate of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const) {
    const evaluation = evaluateWithAssignment(cards, {
      currentSingleValue:
        currentCombination?.kind === "single" ? currentCombination.primaryRank : null,
      phoenixAsRank: candidate
    });

    if (evaluation) {
      combinations.set(evaluation.key, evaluation);
    }
  }

  return [...combinations.values()];
}

export function beatsCombination(candidate: Combination, current: Combination): boolean {
  if (current.kind === "dog") {
    return false;
  }

  if (candidate.isBomb) {
    if (!current.isBomb) {
      return true;
    }

    if (candidate.cardCount !== current.cardCount) {
      return candidate.cardCount > current.cardCount;
    }

    return candidate.primaryRank > current.primaryRank;
  }

  if (current.isBomb || candidate.kind !== current.kind) {
    return false;
  }

  if (
    (candidate.kind === "straight" || candidate.kind === "pair-sequence") &&
    candidate.cardCount !== current.cardCount
  ) {
    return false;
  }

  return candidate.primaryRank > current.primaryRank;
}

export function fulfillsWish(combination: Combination, wishedRank: StandardRank): boolean {
  return combination.actualRanks.includes(wishedRank);
}
