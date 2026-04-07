import {
  SEAT_IDS,
  SYSTEM_ACTOR,
  compareCardsForHand,
  getCanonicalCardIdsKey,
  type ActorId,
  type Card,
  type EngineResult,
  type GameState,
  type LegalAction,
  type LegalActionMap,
  type RoundPhase,
  type SeatId
} from "@tichuml/engine";

export const LOCAL_SEAT: SeatId = "seat-0";
export const PASS_TARGETS = ["left", "partner", "right"] as const;
export const EXCHANGE_PHASES = [
  "pass_select",
  "pass_reveal",
  "exchange_complete"
] as const;

export type PassTarget = (typeof PASS_TARGETS)[number];
export type HandSortMode = "rank" | "suit" | "combo";
export type ExchangeFlowState =
  | "inactive"
  | "exchange_init"
  | "exchange_selecting"
  | "exchange_waiting_for_ai"
  | "exchange_ready_to_resolve"
  | "exchange_resolving"
  | "exchange_complete";
export type ExchangeDraftValidation = {
  isValid: boolean;
  isComplete: boolean;
  missingTargets: PassTarget[];
  selectedCardIds: string[];
  duplicateCardIds: string[];
  invalidCardIds: string[];
};

export type PlayLegalAction = Extract<LegalAction, { type: "play_cards" }>;
export type TurnActionAvailability = {
  seat: SeatId;
  isActiveTurnSeat: boolean;
  hasActiveTrick: boolean;
  leadCombinationKind: string | null;
  leadCombinationKey: string | null;
  selectedCardIds: string[];
  legalPlayCount: number;
  hasAnyLegalPlay: boolean;
  matchingPlayActions: PlayLegalAction[];
  canPlay: boolean;
  canPass: boolean;
  canCallTichu: boolean;
  isTichuOnlyDeadlock: boolean;
};

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

export function getPassTargetSeat(sourceSeat: SeatId, target: PassTarget): SeatId {
  switch (target) {
    case "left":
      return SEAT_IDS[(SEAT_IDS.indexOf(sourceSeat) + 3) % SEAT_IDS.length]!;
    case "partner":
      return SEAT_IDS[(SEAT_IDS.indexOf(sourceSeat) + 2) % SEAT_IDS.length]!;
    case "right":
      return SEAT_IDS[(SEAT_IDS.indexOf(sourceSeat) + 1) % SEAT_IDS.length]!;
  }
}

export function isExchangePhase(phase: RoundPhase): boolean {
  return EXCHANGE_PHASES.includes(phase as (typeof EXCHANGE_PHASES)[number]);
}

export function countSubmittedExchangeSeats(
  state: Pick<GameState, "passSelections">
): number {
  return SEAT_IDS.filter((seat) => Boolean(state.passSelections[seat])).length;
}

export function areAllExchangeSelectionsSubmitted(
  state: Pick<GameState, "passSelections">
): boolean {
  return countSubmittedExchangeSeats(state) === SEAT_IDS.length;
}

export function validateExchangeDraft(
  draft: Partial<Record<PassTarget, string>>,
  availableCardIds: readonly string[] = [],
  requiredTargets: readonly PassTarget[] = PASS_TARGETS
): ExchangeDraftValidation {
  const selectedCardIds = requiredTargets
    .map((target) => draft[target])
    .filter((value): value is string => Boolean(value));
  const missingTargets = requiredTargets.filter((target) => !draft[target]);
  const duplicateCardIds = selectedCardIds.filter(
    (cardId, index) => selectedCardIds.indexOf(cardId) !== index
  );
  const availableCardIdSet = new Set(availableCardIds);
  const invalidCardIds = selectedCardIds.filter(
    (cardId) => !availableCardIdSet.has(cardId)
  );

  return {
    isValid:
      missingTargets.length === 0 &&
      duplicateCardIds.length === 0 &&
      invalidCardIds.length === 0,
    isComplete: missingTargets.length === 0,
    missingTargets,
    selectedCardIds,
    duplicateCardIds,
    invalidCardIds
  };
}

export function removePassCardFromDraft(
  draft: Partial<Record<PassTarget, string>>,
  target: PassTarget
): Partial<Record<PassTarget, string>> {
  if (!draft[target]) {
    return draft;
  }

  const nextDraft = { ...draft };
  delete nextDraft[target];
  return nextDraft;
}

export function assignPassCardToDraft(
  draft: Partial<Record<PassTarget, string>>,
  target: PassTarget,
  cardId: string
): Partial<Record<PassTarget, string>> {
  if (draft[target] === cardId) {
    return draft;
  }

  const nextDraft: Partial<Record<PassTarget, string>> = {};

  for (const draftTarget of PASS_TARGETS) {
    const existingCardId = draft[draftTarget];
    if (!existingCardId || existingCardId === cardId || draftTarget === target) {
      continue;
    }

    nextDraft[draftTarget] = existingCardId;
  }

  const displacedCardId = draft[target];
  if (displacedCardId && displacedCardId !== cardId) {
    const previousTarget = PASS_TARGETS.find(
      (draftTarget) => draft[draftTarget] === cardId
    );

    if (previousTarget && previousTarget !== target) {
      nextDraft[previousTarget] = displacedCardId;
    }
  }

  nextDraft[target] = cardId;
  return nextDraft;
}

export function getExchangeFlowState(
  state: Pick<GameState, "phase" | "passSelections">,
  localSeat: SeatId = LOCAL_SEAT
): ExchangeFlowState {
  if (!isExchangePhase(state.phase)) {
    return "inactive";
  }

  if (state.phase === "pass_reveal") {
    return "exchange_resolving";
  }

  if (state.phase === "exchange_complete") {
    return "exchange_complete";
  }

  const submittedCount = countSubmittedExchangeSeats(state);
  if (submittedCount === 0) {
    return "exchange_init";
  }

  if (areAllExchangeSelectionsSubmitted(state)) {
    return "exchange_ready_to_resolve";
  }

  if (!state.passSelections[localSeat]) {
    return "exchange_selecting";
  }

  return "exchange_waiting_for_ai";
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

export function shouldAllowAiEndgameContinuation(
  state: GameState,
  primaryActor: ActorId | null,
  localSeat: SeatId = LOCAL_SEAT
): boolean {
  if (!primaryActor || primaryActor === SYSTEM_ACTOR || primaryActor === localSeat) {
    return false;
  }

  return SEAT_IDS.some((seat) => seat !== localSeat && state.hands[seat].length === 1);
}

export function buildPlayVariantKey(action: PlayLegalAction): string {
  return [
    getCanonicalCardIdsKey(action.cardIds),
    String(action.phoenixAsRank ?? "none"),
    action.combination.kind,
    String(action.combination.primaryRank)
  ].join("|");
}

export function findMatchingPlayActions(
  actions: PlayLegalAction[],
  selectedCardIds: string[]
): PlayLegalAction[] {
  const normalizedSelection = getCanonicalCardIdsKey(selectedCardIds);

  if (normalizedSelection.length === 0) {
    return [];
  }

  return actions.filter(
    (action) => getCanonicalCardIdsKey(action.cardIds) === normalizedSelection
  );
}

export function getTurnActions(config: {
  state: Pick<GameState, "phase" | "activeSeat" | "currentTrick" | "pendingDragonGift">;
  legalActions: LegalActionMap;
  seat: SeatId;
  selectedCardIds: string[];
}): TurnActionAvailability {
  const seatActions = config.legalActions[config.seat] ?? [];
  const legalPlayActions = seatActions.filter(isPlayLegalAction);
  const matchingPlayActions = findMatchingPlayActions(
    legalPlayActions,
    config.selectedCardIds
  );
  const canPass = seatActions.some((action) => action.type === "pass_turn");
  const canCallTichu = seatActions.some((action) => action.type === "call_tichu");
  const hasActiveTrick =
    config.state.phase === "trick_play" && config.state.currentTrick !== null;
  const isActiveTurnSeat =
    config.state.phase === "trick_play" &&
    !config.state.pendingDragonGift &&
    config.state.activeSeat === config.seat;

  return {
    seat: config.seat,
    isActiveTurnSeat,
    hasActiveTrick,
    leadCombinationKind:
      config.state.currentTrick?.currentCombination.kind ?? null,
    leadCombinationKey:
      config.state.currentTrick?.currentCombination.key ?? null,
    selectedCardIds: [...config.selectedCardIds],
    legalPlayCount: legalPlayActions.length,
    hasAnyLegalPlay: legalPlayActions.length > 0,
    matchingPlayActions,
    canPlay: matchingPlayActions.length > 0,
    canPass,
    canCallTichu,
    isTichuOnlyDeadlock:
      isActiveTurnSeat && hasActiveTrick && !canPass && matchingPlayActions.length === 0 && canCallTichu
  };
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
