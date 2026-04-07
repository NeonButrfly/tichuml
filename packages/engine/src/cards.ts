import {
  SEAT_IDS,
  STANDARD_RANKS,
  SUITS,
  type Card,
  type SeatId,
  type SpecialCard,
  type StandardCard,
  type StandardRank,
  type StraightRank,
  type TeamId
} from "./types.js";

const TEAM_BY_SEAT: Record<SeatId, TeamId> = {
  "seat-0": "team-0",
  "seat-1": "team-1",
  "seat-2": "team-0",
  "seat-3": "team-1"
};

const PARTNER_BY_SEAT: Record<SeatId, SeatId> = {
  "seat-0": "seat-2",
  "seat-1": "seat-3",
  "seat-2": "seat-0",
  "seat-3": "seat-1"
};

const LEFT_BY_SEAT: Record<SeatId, SeatId> = {
  "seat-0": "seat-3",
  "seat-1": "seat-0",
  "seat-2": "seat-1",
  "seat-3": "seat-2"
};

const RIGHT_BY_SEAT: Record<SeatId, SeatId> = {
  "seat-0": "seat-1",
  "seat-1": "seat-2",
  "seat-2": "seat-3",
  "seat-3": "seat-0"
};

const TURN_ORDER = [...SEAT_IDS];

function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed;

  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDeck(): Card[] {
  const standardCards: StandardCard[] = SUITS.flatMap((suit) =>
    STANDARD_RANKS.map((rank) => ({
      id: `${suit}-${rank}`,
      kind: "standard" as const,
      suit,
      rank
    }))
  );

  return [
    ...standardCards,
    { id: "mahjong", kind: "special", special: "mahjong" },
    { id: "dog", kind: "special", special: "dog" },
    { id: "phoenix", kind: "special", special: "phoenix" },
    { id: "dragon", kind: "special", special: "dragon" }
  ];
}

export function shuffleDeck(seed: string): Card[] {
  const deck = [...createDeck()];
  const random = mulberry32(hashSeed(seed));

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = deck[index];
    deck[index] = deck[swapIndex]!;
    deck[swapIndex] = current!;
  }

  return deck;
}

export function getTeamForSeat(seat: SeatId): TeamId {
  return TEAM_BY_SEAT[seat];
}

export function getPartnerSeat(seat: SeatId): SeatId {
  return PARTNER_BY_SEAT[seat];
}

export function getLeftSeat(seat: SeatId): SeatId {
  return LEFT_BY_SEAT[seat];
}

export function getRightSeat(seat: SeatId): SeatId {
  return RIGHT_BY_SEAT[seat];
}

export function getOpponentSeats(seat: SeatId): SeatId[] {
  return SEAT_IDS.filter((candidate) => getTeamForSeat(candidate) !== getTeamForSeat(seat));
}

export function getNextSeat(seat: SeatId): SeatId {
  const currentIndex = TURN_ORDER.indexOf(seat);
  return TURN_ORDER[(currentIndex + 1) % TURN_ORDER.length]!;
}

export function getCardById(id: string): Card {
  if (id === "mahjong" || id === "dog" || id === "phoenix" || id === "dragon") {
    return {
      id,
      kind: "special",
      special: id
    };
  }

  const [suitToken, rankToken] = id.split("-");
  const rankValue = Number(rankToken);

  if (!SUITS.includes(suitToken as (typeof SUITS)[number])) {
    throw new Error(`Unknown suit in card id: ${id}`);
  }

  if (!STANDARD_RANKS.includes(rankValue as StandardRank)) {
    throw new Error(`Unknown rank in card id: ${id}`);
  }

  return {
    id,
    kind: "standard",
    suit: suitToken as (typeof SUITS)[number],
    rank: rankValue as StandardRank
  };
}

export function cardsFromIds(cardIds: string[]): Card[] {
  return cardIds.map((cardId) => getCardById(cardId));
}

function getCardRankWeight(card: Card): number {
  if (card.kind === "standard") {
    return card.rank;
  }

  switch (card.special) {
    case "dog":
      return 0;
    case "mahjong":
      return 1;
    case "phoenix":
      return 14.5;
    case "dragon":
      return 15;
  }
}

function getCardSuitWeight(card: Card): number {
  if (card.kind !== "standard") {
    return -1;
  }

  switch (card.suit) {
    case "jade":
      return 0;
    case "sword":
      return 1;
    case "pagoda":
      return 2;
    case "star":
      return 3;
  }
}

export function compareCardsForHand(left: Card, right: Card): number {
  const rankDifference = getCardRankWeight(left) - getCardRankWeight(right);
  if (rankDifference !== 0) {
    return rankDifference;
  }

  return left.id.localeCompare(right.id);
}

export function sortHand(cards: Card[]): Card[] {
  return [...cards].sort(compareCardsForHand);
}

export function compareCardsForCombination(left: Card, right: Card): number {
  const rankDifference = getCardRankWeight(left) - getCardRankWeight(right);
  if (rankDifference !== 0) {
    return rankDifference;
  }

  const suitDifference = getCardSuitWeight(left) - getCardSuitWeight(right);
  if (suitDifference !== 0) {
    return suitDifference;
  }

  return left.id.localeCompare(right.id);
}

export function sortCardsForCombination(cards: readonly Card[]): Card[] {
  return [...cards].sort(compareCardsForCombination);
}

export function sortCardIdsForCombination(cardIds: readonly string[]): string[] {
  return sortCardsForCombination(cardsFromIds([...cardIds])).map((card) => card.id);
}

export function getCanonicalCardIdsKey(cardIds: readonly string[]): string {
  return sortCardIdsForCombination(cardIds).join(",");
}

export function isPhoenix(card: Card): boolean {
  return card.kind === "special" && card.special === "phoenix";
}

export function isMahjong(card: Card): boolean {
  return card.kind === "special" && card.special === "mahjong";
}

export function isDragon(card: Card): boolean {
  return card.kind === "special" && card.special === "dragon";
}

export function isDog(card: Card): boolean {
  return card.kind === "special" && card.special === "dog";
}

export function isSpecial(card: Card, special: SpecialCard): boolean {
  return card.kind === "special" && card.special === special;
}

export function getStraightRank(card: Card): StraightRank | null {
  if (card.kind === "standard") {
    return card.rank;
  }

  if (card.special === "mahjong") {
    return 1;
  }

  return null;
}

export function getCardPoints(card: Card): number {
  if (card.kind === "standard") {
    if (card.rank === 5) {
      return 5;
    }

    if (card.rank === 10 || card.rank === 13) {
      return 10;
    }

    return 0;
  }

  if (card.special === "dragon") {
    return 25;
  }

  if (card.special === "phoenix") {
    return -25;
  }

  return 0;
}

export function getCardsPoints(cards: Card[]): number {
  return cards.reduce((total, card) => total + getCardPoints(card), 0);
}

export function isStandardRank(value: number): value is StandardRank {
  return STANDARD_RANKS.includes(value as StandardRank);
}

export function sameTeam(left: SeatId, right: SeatId): boolean {
  return getTeamForSeat(left) === getTeamForSeat(right);
}
