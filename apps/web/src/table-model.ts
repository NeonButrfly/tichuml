import {
  SEAT_IDS,
  SYSTEM_ACTOR,
  compareCardsForHand,
  type ActorId,
  type Card,
  type EngineResult,
  type GameState,
  type LegalAction,
  type LegalActionMap,
  type SeatId
} from "@tichuml/engine";

export const LOCAL_SEAT: SeatId = "seat-0";
export const PASS_TARGETS = ["left", "partner", "right"] as const;

export type PassTarget = (typeof PASS_TARGETS)[number];
export type HandSortMode = "rank" | "suit" | "combo";

export type PlayLegalAction = Extract<LegalAction, { type: "play_cards" }>;

function isPlayLegalAction(action: LegalAction): action is PlayLegalAction {
  return action.type === "play_cards";
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

function getComboParticipationScore(cardId: string, playActions: PlayLegalAction[]): number {
  return playActions.reduce((score, action) => {
    if (!action.cardIds.includes(cardId)) {
      return score;
    }

    const sizeValue = action.combination.cardCount * 12;
    const bombValue = action.combination.isBomb ? 40 : 0;
    return score + sizeValue + bombValue;
  }, 0);
}

export function createRoundSeed(index: number): string {
  return `milestone-4-round-${index}`;
}

export function getPrimaryActor(state: GameState, legalActions: LegalActionMap): ActorId | null {
  if ((legalActions[SYSTEM_ACTOR] ?? []).length > 0) {
    return SYSTEM_ACTOR;
  }

  if (
    state.phase === "grand_tichu_window" &&
    state.activeSeat &&
    (legalActions[state.activeSeat] ?? []).length > 0
  ) {
    return state.activeSeat;
  }

  if (state.phase === "pass_select") {
    return SEAT_IDS.find((seat) => (legalActions[seat] ?? []).some((action) => action.type === "select_pass")) ?? null;
  }

  if (
    state.phase === "trick_play" &&
    state.pendingDragonGift &&
    (legalActions[state.pendingDragonGift.winner] ?? []).length > 0
  ) {
    return state.pendingDragonGift.winner;
  }

  if (state.phase === "trick_play" && state.activeSeat && (legalActions[state.activeSeat] ?? []).length > 0) {
    return state.activeSeat;
  }

  return [SYSTEM_ACTOR, ...SEAT_IDS].find((actor) => (legalActions[actor] ?? []).length > 0) ?? null;
}

export function getPrimaryActorFromResult(result: EngineResult): ActorId | null {
  return getPrimaryActor(result.nextState, result.legalActions);
}

export function buildPlayVariantKey(action: PlayLegalAction): string {
  return [
    action.cardIds.join(","),
    String(action.phoenixAsRank ?? "none"),
    action.combination.kind,
    String(action.combination.primaryRank)
  ].join("|");
}

export function findMatchingPlayActions(
  actions: PlayLegalAction[],
  selectedCardIds: string[]
): PlayLegalAction[] {
  const normalizedSelection = [...selectedCardIds].sort().join(",");

  if (normalizedSelection.length === 0) {
    return [];
  }

  return actions.filter((action) => action.cardIds.join(",") === normalizedSelection);
}

export function collectLocalLegalCardIds(actions: LegalAction[]): Set<string> {
  const legalCardIds = new Set<string>();

  for (const action of actions) {
    if (action.type === "select_pass") {
      for (const cardId of action.availableCardIds) {
        legalCardIds.add(cardId);
      }
      continue;
    }

    if (!isPlayLegalAction(action)) {
      continue;
    }

    for (const cardId of action.cardIds) {
      legalCardIds.add(cardId);
    }
  }

  return legalCardIds;
}

export function sortCardsForHand(cards: Card[], mode: HandSortMode, playActions: PlayLegalAction[]): Card[] {
  if (mode === "rank") {
    return [...cards];
  }

  if (mode === "suit") {
    return [...cards].sort((left, right) => {
      const suitDifference = getCardSuitWeight(left) - getCardSuitWeight(right);
      if (suitDifference !== 0) {
        return suitDifference;
      }

      const rankDifference = getCardRankWeight(left) - getCardRankWeight(right);
      if (rankDifference !== 0) {
        return rankDifference;
      }

      return left.id.localeCompare(right.id);
    });
  }

  return [...cards].sort((left, right) => {
    const rightScore = getComboParticipationScore(right.id, playActions);
    const leftScore = getComboParticipationScore(left.id, playActions);

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return compareCardsForHand(left, right);
  });
}
