import {
  SEAT_IDS,
  STANDARD_RANKS,
  SYSTEM_ACTOR,
  type ActorId,
  type Card,
  type EngineAction,
  type EngineEvent,
  type EngineResult,
  type GameState,
  type InitialGameSeedConfig,
  type LegalAction,
  type LegalActionMap,
  type MatchHandHistoryEntry,
  type PassSelection,
  type PlayCardsAction,
  type PublicDerivedState,
  type RoundScoreSummary,
  type SeatId,
  type TeamId,
  type TrickState
} from "./types.js";
import {
  cardsFromIds,
  getCanonicalCardIdsKey,
  getCardById,
  getCardsPoints,
  getLeftSeat,
  getNextSeat,
  getOpponentSeats,
  getPartnerSeat,
  getRightSeat,
  getTeamForSeat,
  isMahjong,
  sameTeam,
  shuffleDeck,
  sortHand
} from "./cards.js";
import {
  beatsCombination,
  fulfillsWish,
  listCombinationInterpretations
} from "./combination.js";
import { createThrottledStructuredLogger } from "./logging.js";

const EMPTY_MATCH_SCORE: Record<TeamId, number> = {
  "team-0": 0,
  "team-1": 0
};

const logEngineDiagnostic = createThrottledStructuredLogger();

function createEmptyHandMap(): Record<SeatId, Card[]> {
  return {
    "seat-0": [],
    "seat-1": [],
    "seat-2": [],
    "seat-3": []
  };
}

function createDefaultCalls() {
  return {
    "seat-0": {
      grandTichu: false,
      smallTichu: false,
      hasPlayedFirstCard: false
    },
    "seat-1": {
      grandTichu: false,
      smallTichu: false,
      hasPlayedFirstCard: false
    },
    "seat-2": {
      grandTichu: false,
      smallTichu: false,
      hasPlayedFirstCard: false
    },
    "seat-3": {
      grandTichu: false,
      smallTichu: false,
      hasPlayedFirstCard: false
    }
  };
}

function cloneState(state: GameState): GameState {
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
    currentTrick: state.currentTrick
      ? {
          leader: state.currentTrick.leader,
          currentWinner: state.currentTrick.currentWinner,
          currentCombination: state.currentTrick.currentCombination,
          entries: [...state.currentTrick.entries],
          passingSeats: [...state.currentTrick.passingSeats]
        }
      : null,
    collectedCards: {
      "seat-0": [...state.collectedCards["seat-0"]],
      "seat-1": [...state.collectedCards["seat-1"]],
      "seat-2": [...state.collectedCards["seat-2"]],
      "seat-3": [...state.collectedCards["seat-3"]]
    },
    finishedOrder: [...state.finishedOrder],
    pendingDragonGift: state.pendingDragonGift
      ? {
          winner: state.pendingDragonGift.winner,
          trickCards: [...state.pendingDragonGift.trickCards],
          nextLeader: state.pendingDragonGift.nextLeader,
          roundEndsAfterGift: state.pendingDragonGift.roundEndsAfterGift
        }
      : null,
    roundSummary: state.roundSummary
      ? {
          teamScores: { ...state.roundSummary.teamScores },
          finishOrder: [...state.roundSummary.finishOrder],
          doubleVictory: state.roundSummary.doubleVictory,
          tichuBonuses: state.roundSummary.tichuBonuses.map((bonus) => ({
            ...bonus
          }))
        }
      : null,
    matchScore: { ...state.matchScore },
    matchHistory: state.matchHistory.map((entry) => ({
      handNumber: entry.handNumber,
      roundSeed: entry.roundSeed,
      teamScores: { ...entry.teamScores },
      cumulativeScores: { ...entry.cumulativeScores },
      finishOrder: [...entry.finishOrder],
      doubleVictory: entry.doubleVictory,
      tichuBonuses: entry.tichuBonuses.map((bonus) => ({ ...bonus }))
    })),
    matchComplete: state.matchComplete,
    matchWinner: state.matchWinner
  };
}

function handHasCardIds(hand: Card[], cardIds: string[]): boolean {
  const counts = new Map<string, number>();

  for (const card of hand) {
    counts.set(card.id, (counts.get(card.id) ?? 0) + 1);
  }

  for (const cardId of cardIds) {
    const current = counts.get(cardId) ?? 0;
    if (current === 0) {
      return false;
    }

    counts.set(cardId, current - 1);
  }

  return true;
}

function removeCardIds(hand: Card[], cardIds: string[]): Card[] {
  const remaining = [...hand];

  for (const cardId of cardIds) {
    const index = remaining.findIndex((card) => card.id === cardId);
    if (index >= 0) {
      remaining.splice(index, 1);
    }
  }

  return sortHand(remaining);
}

function activeSeatsWithCards(state: GameState): SeatId[] {
  return SEAT_IDS.filter((seat) => state.hands[seat].length > 0);
}

function getNextActiveSeat(state: GameState, fromSeat: SeatId): SeatId | null {
  const alive = activeSeatsWithCards(state);
  if (alive.length === 0) {
    return null;
  }

  let candidate = getNextSeat(fromSeat);
  for (let index = 0; index < SEAT_IDS.length; index += 1) {
    if (state.hands[candidate].length > 0) {
      return candidate;
    }

    candidate = getNextSeat(candidate);
  }

  return null;
}

function getMahjongHolder(state: GameState): SeatId {
  const holder = SEAT_IDS.find((seat) =>
    state.hands[seat].some((card) => isMahjong(card))
  );
  if (!holder) {
    throw new Error("Mahjong holder not found.");
  }

  return holder;
}

function isSmallTichuWindow(phase: GameState["phase"]): boolean {
  return (
    phase === "pass_select" ||
    phase === "pass_reveal" ||
    phase === "exchange_complete" ||
    phase === "trick_play"
  );
}

function dealCards(state: GameState, cardsPerSeat: number): void {
  for (let round = 0; round < cardsPerSeat; round += 1) {
    for (const seat of SEAT_IDS) {
      const nextCard = state.shuffledDeck[state.deckIndex];
      if (!nextCard) {
        throw new Error("Deck exhausted during deal.");
      }

      state.hands[seat] = sortHand([...state.hands[seat], nextCard]);
      state.deckIndex += 1;
    }
  }
}

function createBaseState(
  seed: string,
  seedProvenance: GameState["seedProvenance"] = null,
  matchScore: Record<TeamId, number> = { ...EMPTY_MATCH_SCORE },
  matchHistory: MatchHandHistoryEntry[] = []
): GameState {
  if (matchScore["team-0"] >= 1000 || matchScore["team-1"] >= 1000) {
    throw new Error("Cannot start another deal after the match is complete.");
  }

  const shuffledDeck = shuffleDeck(seed);
  const state: GameState = {
    seed,
    seedProvenance,
    phase: "grand_tichu_window",
    shuffledDeck,
    deckIndex: 0,
    hands: createEmptyHandMap(),
    activeSeat: "seat-0",
    currentWish: null,
    calls: createDefaultCalls(),
    grandTichuQueue: [...SEAT_IDS],
    passSelections: {},
    revealedPasses: {},
    currentTrick: null,
    collectedCards: createEmptyHandMap(),
    finishedOrder: [],
    pendingDragonGift: null,
    roundSummary: null,
    matchScore: { ...matchScore },
    matchHistory: matchHistory.map((entry) => ({
      handNumber: entry.handNumber,
      roundSeed: entry.roundSeed,
      teamScores: { ...entry.teamScores },
      cumulativeScores: { ...entry.cumulativeScores },
      finishOrder: [...entry.finishOrder],
      doubleVictory: entry.doubleVictory,
      tichuBonuses: entry.tichuBonuses.map((bonus) => ({ ...bonus }))
    })),
    matchComplete: false,
    matchWinner: null
  };

  dealCards(state, 8);
  return state;
}

function createDerivedView(state: GameState): PublicDerivedState {
  return {
    phase: state.phase,
    activeSeat: state.activeSeat,
    handCounts: {
      "seat-0": state.hands["seat-0"].length,
      "seat-1": state.hands["seat-1"].length,
      "seat-2": state.hands["seat-2"].length,
      "seat-3": state.hands["seat-3"].length
    },
    currentWish: state.currentWish,
    calls: state.calls,
    finishedOrder: state.finishedOrder,
    currentTrick: state.currentTrick
      ? {
          leader: state.currentTrick.leader,
          currentWinner: state.currentTrick.currentWinner,
          currentCombination: state.currentTrick.currentCombination,
          entries: state.currentTrick.entries
        }
      : null,
    matchScore: state.matchScore,
    matchComplete: state.matchComplete,
    matchWinner: state.matchWinner,
    pendingDragonGift: state.pendingDragonGift,
    roundSummary: state.roundSummary
  };
}

function createResult(state: GameState, events: EngineEvent[]): EngineResult {
  return {
    nextState: state,
    events,
    legalActions: getLegalActions(state),
    derivedView: createDerivedView(state)
  };
}

function compareLegalActions(left: LegalAction, right: LegalAction): number {
  if (left.type !== "play_cards" || right.type !== "play_cards") {
    return left.type.localeCompare(right.type);
  }

  const rankDifference =
    left.combination.primaryRank - right.combination.primaryRank;
  if (rankDifference !== 0) {
    return rankDifference;
  }

  const countDifference =
    left.combination.cardCount - right.combination.cardCount;
  if (countDifference !== 0) {
    return countDifference;
  }

  return getCanonicalCardIdsKey(left.cardIds).localeCompare(
    getCanonicalCardIdsKey(right.cardIds)
  );
}

function enumerateHandSubsets(hand: Card[]): Card[][] {
  const subsets: Card[][] = [];
  const limit = 1 << hand.length;

  for (let mask = 1; mask < limit; mask += 1) {
    const selection: Card[] = [];

    for (let bit = 0; bit < hand.length; bit += 1) {
      if ((mask & (1 << bit)) !== 0) {
        selection.push(hand[bit]!);
      }
    }

    subsets.push(selection);
  }

  return subsets;
}

function canSeatCallSmallTichu(state: GameState, seat: SeatId): boolean {
  if (
    !isSmallTichuWindow(state.phase) ||
    state.pendingDragonGift ||
    state.hands[seat].length === 0
  ) {
    return false;
  }

  if (
    state.calls[seat].hasPlayedFirstCard ||
    state.calls[seat].smallTichu ||
    state.calls[seat].grandTichu
  ) {
    return false;
  }

  return !(
    state.calls[getPartnerSeat(seat)].smallTichu ||
    state.calls[getPartnerSeat(seat)].grandTichu
  );
}

function createPassTurnLegalAction(
  seat: SeatId
): Extract<LegalAction, { type: "pass_turn" }> {
  return {
    type: "pass_turn",
    seat
  };
}

function isPlayLegalAction(
  action: LegalAction
): action is Extract<LegalAction, { type: "play_cards" }> {
  return action.type === "play_cards";
}

function summarizeLegalPlayActions(actions: LegalAction[]): string[] {
  return actions.filter(isPlayLegalAction).map((action) => action.combination.key);
}

function logActiveStraightResponseActions(
  state: GameState,
  activeActions: LegalAction[]
): void {
  if (
    state.phase !== "trick_play" ||
    !state.activeSeat ||
    !state.currentTrick ||
    state.currentTrick.currentCombination.kind !== "straight"
  ) {
    return;
  }

  logEngineDiagnostic({
    level: "info",
    message: "[engine] Straight response availability",
    payload: {
      activeSeat: state.activeSeat,
      leadCombo: state.currentTrick.currentCombination.key,
      legalResponseCount: activeActions.filter(isPlayLegalAction).length,
      normalizedResponseList: summarizeLegalPlayActions(activeActions),
      canPass: activeActions.some((action) => action.type === "pass_turn"),
      wishState: state.currentWish
    }
  });
}

function assertInvariant(condition: boolean, message: string): asserts condition {
  console.assert(condition, message);
  if (!condition) {
    throw new Error(message);
  }
}

function applyWishConstraintToPlayActions(
  state: GameState,
  seat: SeatId,
  legalMoves: LegalAction[]
): LegalAction[] {
  if (state.activeSeat !== seat || state.currentWish === null) {
    return legalMoves;
  }

  const wishedRank = state.currentWish;
  const wishMoves = legalMoves.filter(
    (move) =>
      move.type === "play_cards" && fulfillsWish(move.combination, wishedRank)
  );

  if (wishMoves.length > 0) {
    return wishMoves;
  }

  const holdsWishRank = state.hands[seat].some(
    (card) => card.kind === "standard" && card.rank === wishedRank
  );
  logEngineDiagnostic({
    level: "warn",
    message:
      "[engine] Active wish had no legal fulfilling moves; using unfiltered legal moves.",
    payload: {
      seat,
      wishedRank,
      legalMoveCount: legalMoves.length,
      holdsWishRank,
      currentCombination: state.currentTrick?.currentCombination.key ?? null
    }
  });
  return legalMoves;
}

function generatePlayActions(state: GameState, seat: SeatId): LegalAction[] {
  if (
    state.phase !== "trick_play" ||
    state.pendingDragonGift ||
    state.hands[seat].length === 0
  ) {
    return [];
  }

  const hand = state.hands[seat];
  const currentCombination = state.currentTrick?.currentCombination ?? null;
  const isActiveSeat = state.activeSeat === seat;

  if (!state.currentTrick && !isActiveSeat) {
    return [];
  }

  const actions = new Map<string, LegalAction>();

  for (const subset of enumerateHandSubsets(hand)) {
    const combinations = listCombinationInterpretations(
      subset,
      currentCombination
    );

    for (const combination of combinations) {
      const legalAsBomb =
        currentCombination !== null &&
        combination.isBomb &&
        beatsCombination(combination, currentCombination);
      const legalOnTurn =
        isActiveSeat &&
        (currentCombination === null
          ? true
          : !combination.isBomb &&
            beatsCombination(combination, currentCombination));

      if (!legalAsBomb && !legalOnTurn) {
        continue;
      }

      const action: LegalAction = {
        type: "play_cards",
        seat,
        cardIds: combination.cardIds,
        ...(combination.phoenixAsRank
          ? { phoenixAsRank: combination.phoenixAsRank }
          : {}),
        ...(combination.containsMahjong
          ? { availableWishRanks: [...STANDARD_RANKS] }
          : {}),
        combination
      };

      actions.set(
        `${getCanonicalCardIdsKey(action.cardIds)}:${action.phoenixAsRank ?? "none"}`,
        action
      );
    }
  }

  const results = [...actions.values()].sort(compareLegalActions);
  return applyWishConstraintToPlayActions(state, seat, results);
}

export function getLegalActions(state: GameState): LegalActionMap {
  const legalActions: LegalActionMap = {};

  const pushAction = (actor: ActorId, action: LegalAction) => {
    const actions = legalActions[actor] ?? [];
    actions.push(action);
    legalActions[actor] = actions.sort(compareLegalActions);
  };

  const pushOptionalSmallTichuActions = () => {
    for (const seat of SEAT_IDS) {
      if (canSeatCallSmallTichu(state, seat)) {
        pushAction(seat, { type: "call_tichu", seat });
      }
    }
  };

  switch (state.phase) {
    case "grand_tichu_window": {
      const seat = state.grandTichuQueue[0];
      if (!seat) {
        break;
      }

      pushAction(seat, { type: "decline_grand_tichu", seat });
      if (!state.calls[getPartnerSeat(seat)].grandTichu) {
        pushAction(seat, { type: "call_grand_tichu", seat });
      }
      break;
    }
    case "pass_select": {
      pushOptionalSmallTichuActions();
      for (const seat of SEAT_IDS) {
        if (state.passSelections[seat]) {
          continue;
        }

        pushAction(seat, {
          type: "select_pass",
          seat,
          availableCardIds: state.hands[seat].map((card) => card.id),
          requiredTargets: ["left", "partner", "right"]
        });
      }
      break;
    }
    case "pass_reveal":
    case "exchange_complete":
      pushOptionalSmallTichuActions();
      pushAction(SYSTEM_ACTOR, { type: "advance_phase", actor: SYSTEM_ACTOR });
      break;
    case "round_scoring":
      pushAction(SYSTEM_ACTOR, { type: "advance_phase", actor: SYSTEM_ACTOR });
      break;
    case "trick_play": {
      if (state.pendingDragonGift) {
        for (const recipient of getOpponentSeats(
          state.pendingDragonGift.winner
        )) {
          pushAction(state.pendingDragonGift.winner, {
            type: "assign_dragon_trick",
            seat: state.pendingDragonGift.winner,
            recipient
          });
        }
        break;
      }

      pushOptionalSmallTichuActions();
      for (const seat of SEAT_IDS) {
        for (const playAction of generatePlayActions(state, seat)) {
          pushAction(seat, playAction);
        }
      }

      if (state.currentTrick && state.activeSeat) {
        const activeActions = legalActions[state.activeSeat] ?? [];
        const wishedRank = state.currentWish;
        const wishLocked =
          wishedRank !== null &&
          activeActions.some(
            (action) =>
              action.type === "play_cards" &&
              fulfillsWish(action.combination, wishedRank)
          );

        if (!wishLocked) {
          pushAction(state.activeSeat, createPassTurnLegalAction(state.activeSeat));
        }
      }
      break;
    }
    default:
      break;
  }

  if (state.phase === "trick_play" && state.activeSeat) {
    const activeSeatActions = legalActions[state.activeSeat] ?? [];

    if (activeSeatActions.length === 0 && state.currentTrick) {
      logEngineDiagnostic({
        level: "error",
        message:
          "[engine] Active seat had no legal trick actions; forcing pass fallback.",
        payload: {
          seat: state.activeSeat,
          wishedRank: state.currentWish,
          currentCombination: state.currentTrick.currentCombination.key
        }
      });
      pushAction(state.activeSeat, createPassTurnLegalAction(state.activeSeat));
    }

    assertInvariant(
      (legalActions[state.activeSeat] ?? []).length > 0,
      `[engine] Active seat ${state.activeSeat} must always have at least one legal action during trick_play.`
    );

    logActiveStraightResponseActions(
      state,
      legalActions[state.activeSeat] ?? []
    );
  }

  return legalActions;
}

function matchConcretePlayAction(
  legalAction: LegalAction,
  action: PlayCardsAction
): boolean {
  if (legalAction.type !== "play_cards") {
    return false;
  }

  if (
    legalAction.seat !== action.seat ||
    getCanonicalCardIdsKey(legalAction.cardIds) !==
      getCanonicalCardIdsKey(action.cardIds) ||
    (legalAction.phoenixAsRank ?? null) !== (action.phoenixAsRank ?? null)
  ) {
    return false;
  }

  if (action.wishRank === undefined) {
    return true;
  }

  if (!legalAction.availableWishRanks) {
    return false;
  }

  return (
    action.wishRank === null ||
    legalAction.availableWishRanks.includes(action.wishRank)
  );
}

function assertConcreteActionIsLegal(
  state: GameState,
  action: EngineAction
): void {
  const legalActions = getLegalActions(state);

  switch (action.type) {
    case "call_grand_tichu":
    case "decline_grand_tichu":
    case "call_tichu":
    case "pass_turn":
    case "assign_dragon_trick": {
      const actorActions = legalActions[action.seat] ?? [];
      if (
        !actorActions.some(
          (legalAction) =>
            JSON.stringify(legalAction) === JSON.stringify(action)
        )
      ) {
        throw new Error(`Illegal action: ${action.type}`);
      }
      return;
    }
    case "advance_phase": {
      const actorActions = legalActions[action.actor] ?? [];
      if (
        !actorActions.some(
          (legalAction) => legalAction.type === "advance_phase"
        )
      ) {
        throw new Error("Illegal action: advance_phase");
      }
      return;
    }
    case "play_cards": {
      const actorActions = legalActions[action.seat] ?? [];
      if (
        !actorActions.some((legalAction) =>
          matchConcretePlayAction(legalAction, action)
        )
      ) {
        throw new Error("Illegal action: play_cards");
      }
      return;
    }
    case "select_pass":
      return;
  }
}

function addFinishedSeat(state: GameState, seat: SeatId): void {
  if (!state.finishedOrder.includes(seat) && state.hands[seat].length === 0) {
    state.finishedOrder.push(seat);
  }
}

function resolveDoubleVictory(state: GameState): boolean {
  if (state.finishedOrder.length < 2) {
    return false;
  }

  const [first, second] = state.finishedOrder;
  if (!first || !second || !sameTeam(first, second)) {
    return false;
  }

  state.phase = "round_scoring";
  state.activeSeat = null;
  state.currentTrick = null;
  state.pendingDragonGift = null;
  return true;
}

function collectTrickCards(
  state: GameState,
  seat: SeatId,
  trickCards: Card[]
): void {
  state.collectedCards[seat] = [...state.collectedCards[seat], ...trickCards];
}

function getTrickCards(trick: TrickState): Card[] {
  return trick.entries.flatMap((entry) =>
    entry.type === "play" ? entry.combination.cardIds.map(getCardById) : []
  );
}

function transitionToNextLead(state: GameState, winner: SeatId): void {
  state.currentTrick = null;
  state.activeSeat =
    state.hands[winner].length > 0 ? winner : getNextActiveSeat(state, winner);
}

function resolveRoundEndIfNeeded(
  state: GameState,
  winner: SeatId,
  trickCards: Card[]
): boolean {
  if (activeSeatsWithCards(state).length > 1) {
    return false;
  }

  if (trickCards.length > 0) {
    collectTrickCards(state, winner, trickCards);
  }

  state.currentTrick = null;
  state.pendingDragonGift = null;
  state.activeSeat = null;
  state.phase = "round_scoring";
  return true;
}

function resolveCompletedTrick(
  state: GameState,
  roundEndsAfterResolution: boolean
): void {
  const trick = state.currentTrick;
  if (!trick) {
    return;
  }

  const trickCards = getTrickCards(trick);
  const winner = trick.currentWinner;
  const dragonWins = trick.currentCombination.containsDragon;

  if (dragonWins) {
    state.pendingDragonGift = {
      winner,
      trickCards,
      nextLeader:
        state.hands[winner].length > 0
          ? winner
          : getNextActiveSeat(state, winner),
      roundEndsAfterGift: roundEndsAfterResolution
    };
    state.currentTrick = null;
    state.activeSeat = null;
    return;
  }

  collectTrickCards(state, winner, trickCards);

  if (roundEndsAfterResolution && resolveRoundEndIfNeeded(state, winner, [])) {
    return;
  }

  transitionToNextLead(state, winner);
}

function scoreRound(state: GameState): RoundScoreSummary {
  const teamScores: Record<TeamId, number> = {
    "team-0": 0,
    "team-1": 0
  };
  const finishOrder = [...state.finishedOrder];
  const [firstSeat, secondSeat] = finishOrder;
  const doubleVictory =
    firstSeat && secondSeat && sameTeam(firstSeat, secondSeat)
      ? getTeamForSeat(firstSeat)
      : null;

  if (doubleVictory) {
    teamScores[doubleVictory] = 200;
  } else {
    const tailender =
      SEAT_IDS.find((seat) => state.hands[seat].length > 0) ?? null;
    const trickPointsBySeat: Record<SeatId, number> = {
      "seat-0": getCardsPoints(state.collectedCards["seat-0"]),
      "seat-1": getCardsPoints(state.collectedCards["seat-1"]),
      "seat-2": getCardsPoints(state.collectedCards["seat-2"]),
      "seat-3": getCardsPoints(state.collectedCards["seat-3"])
    };

    if (tailender && firstSeat) {
      trickPointsBySeat[firstSeat] += trickPointsBySeat[tailender];
      trickPointsBySeat[tailender] = 0;
      const opposingTeam = getTeamForSeat(getOpponentSeats(tailender)[0]!);
      teamScores[opposingTeam] += getCardsPoints(state.hands[tailender]);
    }

    for (const seat of SEAT_IDS) {
      teamScores[getTeamForSeat(seat)] += trickPointsBySeat[seat];
    }
  }

  const tichuBonuses: RoundScoreSummary["tichuBonuses"] = [];
  for (const seat of SEAT_IDS) {
    if (state.calls[seat].grandTichu) {
      const amount = finishOrder[0] === seat ? 200 : -200;
      tichuBonuses.push({
        seat,
        team: getTeamForSeat(seat),
        label: "grand",
        amount
      });
      teamScores[getTeamForSeat(seat)] += amount;
    }

    if (state.calls[seat].smallTichu) {
      const amount = finishOrder[0] === seat ? 100 : -100;
      tichuBonuses.push({
        seat,
        team: getTeamForSeat(seat),
        label: "small",
        amount
      });
      teamScores[getTeamForSeat(seat)] += amount;
    }
  }

  return {
    teamScores,
    finishOrder,
    doubleVictory,
    tichuBonuses
  };
}

function hasReachedMatchTarget(matchScore: Record<TeamId, number>): boolean {
  return matchScore["team-0"] >= 1000 || matchScore["team-1"] >= 1000;
}

function resolveMatchWinner(
  matchScore: Record<TeamId, number>
): TeamId | null {
  if (!hasReachedMatchTarget(matchScore)) {
    return null;
  }

  if (matchScore["team-0"] === matchScore["team-1"]) {
    return null;
  }

  return matchScore["team-0"] > matchScore["team-1"] ? "team-0" : "team-1";
}

function createMatchHandHistoryEntry(
  state: GameState,
  roundSummary: RoundScoreSummary,
  cumulativeScores: Record<TeamId, number>
): MatchHandHistoryEntry {
  return {
    handNumber: state.matchHistory.length + 1,
    roundSeed: state.seed,
    teamScores: { ...roundSummary.teamScores },
    cumulativeScores: { ...cumulativeScores },
    finishOrder: [...roundSummary.finishOrder],
    doubleVictory: roundSummary.doubleVictory,
    tichuBonuses: roundSummary.tichuBonuses.map((bonus) => ({ ...bonus }))
  };
}

function applyPassExchange(state: GameState): void {
  const incoming: Record<SeatId, Card[]> = createEmptyHandMap();

  for (const seat of SEAT_IDS) {
    const selection = state.passSelections[seat];
    if (!selection) {
      throw new Error(
        "Cannot reveal passes before all seats have selected cards."
      );
    }

    state.hands[seat] = removeCardIds(state.hands[seat], [
      selection.left,
      selection.partner,
      selection.right
    ]);
    incoming[getLeftSeat(seat)] = [
      ...incoming[getLeftSeat(seat)],
      getCardById(selection.left)
    ];
    incoming[getPartnerSeat(seat)] = [
      ...incoming[getPartnerSeat(seat)],
      getCardById(selection.partner)
    ];
    incoming[getRightSeat(seat)] = [
      ...incoming[getRightSeat(seat)],
      getCardById(selection.right)
    ];
  }

  for (const seat of SEAT_IDS) {
    state.hands[seat] = sortHand([...state.hands[seat], ...incoming[seat]]);
  }

  state.revealedPasses = { ...state.passSelections };
}

function clearExchangeArtifacts(state: GameState): void {
  state.activeSeat = null;
  state.currentWish = null;
  state.currentTrick = null;
  state.pendingDragonGift = null;
}

function hasAllPassSelections(state: Pick<GameState, "passSelections">): boolean {
  return SEAT_IDS.every((seat) => Boolean(state.passSelections[seat]));
}

function validatePassSelection(
  state: GameState,
  action: Extract<EngineAction, { type: "select_pass" }>
): PassSelection {
  const hand = state.hands[action.seat];
  const chosen = [action.left, action.partner, action.right];

  if (new Set(chosen).size !== chosen.length || !handHasCardIds(hand, chosen)) {
    throw new Error("Illegal pass selection.");
  }

  return {
    left: action.left,
    partner: action.partner,
    right: action.right
  };
}

function submitPassSelection(
  state: GameState,
  action: Extract<EngineAction, { type: "select_pass" }>
): EngineEvent[] {
  state.passSelections[action.seat] = validatePassSelection(state, action);

  const events: EngineEvent[] = [
    { type: "pass_selected", detail: action.seat }
  ];

  if (hasAllPassSelections(state)) {
    clearExchangeArtifacts(state);
    state.phase = "pass_reveal";
    events.push({ type: "phase_changed", detail: state.phase });
  }

  return events;
}

function resolvePassExchange(state: GameState): EngineEvent[] {
  clearExchangeArtifacts(state);
  applyPassExchange(state);
  state.phase = "exchange_complete";

  return [
    { type: "passes_revealed" },
    { type: "phase_changed", detail: state.phase }
  ];
}

function applyGrandTichuDecision(
  state: GameState,
  seat: SeatId,
  grandTichu: boolean
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const actingSeat = state.grandTichuQueue.shift();

  if (actingSeat !== seat) {
    throw new Error(
      "Grand Tichu decisions must follow the deterministic seat queue."
    );
  }

  if (grandTichu) {
    state.calls[seat].grandTichu = true;
    events.push({ type: "grand_tichu_called", detail: seat });
  } else {
    events.push({ type: "grand_tichu_declined", detail: seat });
  }

  if (state.grandTichuQueue.length === 0) {
    state.phase = "pass_select";
    state.activeSeat = null;
    clearExchangeArtifacts(state);
    dealCards(state, 6);
    events.push({ type: "complete_deal" });
    events.push({ type: "phase_changed", detail: state.phase });
  } else {
    state.activeSeat = state.grandTichuQueue[0]!;
  }

  return events;
}

function applySelectPass(
  state: GameState,
  action: Extract<EngineAction, { type: "select_pass" }>
): EngineEvent[] {
  return submitPassSelection(state, action);
}

function applyPlayCards(
  state: GameState,
  action: PlayCardsAction
): EngineEvent[] {
  assertConcreteActionIsLegal(state, action);

  const events: EngineEvent[] = [];
  const normalizedActionCardIds = getCanonicalCardIdsKey(action.cardIds);
  const cards = cardsFromIds(action.cardIds);
  const currentCombination = state.currentTrick?.currentCombination ?? null;
  const combination = listCombinationInterpretations(
    cards,
    currentCombination
  ).find(
    (candidate) =>
      getCanonicalCardIdsKey(candidate.cardIds) === normalizedActionCardIds &&
      (candidate.phoenixAsRank ?? null) === (action.phoenixAsRank ?? null)
  );

  if (!combination) {
    throw new Error("Unable to evaluate played cards.");
  }

  state.hands[action.seat] = removeCardIds(
    state.hands[action.seat],
    action.cardIds
  );
  state.calls[action.seat].hasPlayedFirstCard = true;

  if (combination.containsMahjong) {
    state.currentWish = action.wishRank ?? null;
  } else if (
    state.currentWish !== null &&
    fulfillsWish(combination, state.currentWish)
  ) {
    state.currentWish = null;
  }

  if (combination.kind === "dog") {
    addFinishedSeat(state, action.seat);
    state.currentTrick = null;
    const partner = getPartnerSeat(action.seat);
    state.activeSeat =
      state.hands[partner].length > 0
        ? partner
        : getNextActiveSeat(state, partner);
    events.push({ type: "dog_led", detail: action.seat });

    if (resolveDoubleVictory(state)) {
      events.push({ type: "phase_changed", detail: state.phase });
    } else if (activeSeatsWithCards(state).length === 1) {
      state.phase = "round_scoring";
      state.activeSeat = null;
      events.push({ type: "phase_changed", detail: state.phase });
    }

    return events;
  }

  if (!state.currentTrick) {
    state.currentTrick = {
      leader: action.seat,
      currentWinner: action.seat,
      currentCombination: combination,
      entries: [{ type: "play", seat: action.seat, combination }],
      passingSeats: []
    };
  } else {
    state.currentTrick = {
      ...state.currentTrick,
      currentWinner: action.seat,
      currentCombination: combination,
      entries: [
        ...state.currentTrick.entries,
        { type: "play", seat: action.seat, combination }
      ],
      passingSeats: []
    };
  }

  addFinishedSeat(state, action.seat);
  events.push({
    type: "cards_played",
    detail: `${action.seat}:${combination.kind}`
  });

  if (resolveDoubleVictory(state)) {
    events.push({ type: "phase_changed", detail: state.phase });
    return events;
  }

  const roundEndsImmediately = activeSeatsWithCards(state).length === 1;
  if (roundEndsImmediately) {
    resolveCompletedTrick(state, true);
    if (state.pendingDragonGift) {
      events.push({
        type: "dragon_gift_pending",
        detail: state.pendingDragonGift.winner
      });
    } else {
      events.push({ type: "phase_changed", detail: state.phase });
    }
    return events;
  }

  state.activeSeat = getNextActiveSeat(state, action.seat);
  return events;
}

function applyPassTurn(state: GameState, seat: SeatId): EngineEvent[] {
  assertConcreteActionIsLegal(state, { type: "pass_turn", seat });

  const trick = state.currentTrick;
  if (!trick) {
    throw new Error("Cannot pass without an active trick.");
  }

  state.currentTrick = {
    ...trick,
    entries: [...trick.entries, { type: "pass", seat }],
    passingSeats: [...trick.passingSeats, seat]
  };

  const requiredPasses = activeSeatsWithCards(state).filter(
    (activeSeat) => activeSeat !== state.currentTrick!.currentWinner
  ).length;

  const events: EngineEvent[] = [{ type: "seat_passed", detail: seat }];

  if (state.currentTrick.passingSeats.length >= requiredPasses) {
    resolveCompletedTrick(state, activeSeatsWithCards(state).length === 1);
    if (state.pendingDragonGift) {
      events.push({
        type: "dragon_gift_pending",
        detail: state.pendingDragonGift.winner
      });
    } else {
      events.push({ type: "trick_resolved" });
    }
    return events;
  }

  state.activeSeat = getNextActiveSeat(state, seat);
  return events;
}

function applyDragonGift(
  state: GameState,
  action: Extract<EngineAction, { type: "assign_dragon_trick" }>
): EngineEvent[] {
  assertConcreteActionIsLegal(state, action);

  const pending = state.pendingDragonGift;
  if (!pending) {
    throw new Error("No pending Dragon gift to assign.");
  }

  collectTrickCards(state, action.recipient, pending.trickCards);
  state.pendingDragonGift = null;

  if (pending.roundEndsAfterGift) {
    state.phase = "round_scoring";
    state.activeSeat = null;
  } else {
    state.phase = "trick_play";
    state.activeSeat = pending.nextLeader;
  }

  return [
    {
      type: "dragon_trick_assigned",
      detail: `${action.seat}->${action.recipient}`
    }
  ];
}

function applyAdvancePhase(state: GameState): EngineEvent[] {
  switch (state.phase) {
    case "pass_reveal":
      return resolvePassExchange(state);
    case "exchange_complete":
      state.phase = "trick_play";
      state.activeSeat = getMahjongHolder(state);
      return [
        { type: "exchange_completed" },
        { type: "phase_changed", detail: state.phase }
      ];
    case "round_scoring": {
      const roundSummary = scoreRound(state);
      const nextMatchScore = {
        "team-0":
          state.matchScore["team-0"] + roundSummary.teamScores["team-0"],
        "team-1": state.matchScore["team-1"] + roundSummary.teamScores["team-1"]
      } satisfies Record<TeamId, number>;
      state.roundSummary = roundSummary;
      state.matchScore = nextMatchScore;
      state.matchHistory = [
        ...state.matchHistory,
        createMatchHandHistoryEntry(state, roundSummary, nextMatchScore)
      ];
      state.matchComplete = hasReachedMatchTarget(nextMatchScore);
      state.matchWinner = resolveMatchWinner(nextMatchScore);
      state.phase = "finished";
      return [
        { type: "round_scored" },
        ...(state.matchComplete
          ? [
              {
                type: "match_completed",
                detail: state.matchWinner ?? "tie"
              }
            ]
          : []),
        { type: "phase_changed", detail: state.phase }
      ];
    }
    default:
      throw new Error(`Phase ${state.phase} does not support advance_phase.`);
  }
}

export function createInitialGameState(
  seedOrConfig: string | number | InitialGameSeedConfig
): EngineResult {
  const config =
    typeof seedOrConfig === "object" && seedOrConfig !== null
      ? seedOrConfig
      : { seed: seedOrConfig };
  const state = createBaseState(
    String(config.seed),
    config.seedProvenance ?? null,
    config.matchScore ?? { ...EMPTY_MATCH_SCORE },
    config.matchHistory ?? []
  );
  return createResult(state, [
    { type: "shuffle_completed" },
    { type: "deal8_completed" },
    { type: "phase_changed", detail: state.phase }
  ]);
}

export function applyEngineAction(
  state: GameState,
  action: EngineAction
): EngineResult {
  const nextState = cloneState(state);
  let events: EngineEvent[] = [];

  switch (action.type) {
    case "call_grand_tichu":
      assertConcreteActionIsLegal(nextState, action);
      events = applyGrandTichuDecision(nextState, action.seat, true);
      break;
    case "decline_grand_tichu":
      assertConcreteActionIsLegal(nextState, action);
      events = applyGrandTichuDecision(nextState, action.seat, false);
      break;
    case "call_tichu":
      assertConcreteActionIsLegal(nextState, action);
      nextState.calls[action.seat].smallTichu = true;
      events = [{ type: "tichu_called", detail: action.seat }];
      break;
    case "select_pass":
      if (nextState.phase !== "pass_select") {
        throw new Error("Pass selection is only legal during pass_select.");
      }
      events = applySelectPass(nextState, action);
      break;
    case "advance_phase":
      assertConcreteActionIsLegal(nextState, action);
      events = applyAdvancePhase(nextState);
      break;
    case "play_cards":
      events = applyPlayCards(nextState, action);
      break;
    case "pass_turn":
      events = applyPassTurn(nextState, action.seat);
      break;
    case "assign_dragon_trick":
      events = applyDragonGift(nextState, action);
      break;
  }

  return createResult(nextState, events);
}

export function createScenarioState(
  config: Partial<GameState> = {}
): GameState {
  return {
    seed: config.seed ?? "scenario",
    seedProvenance: config.seedProvenance ?? null,
    phase: config.phase ?? "trick_play",
    shuffledDeck: config.shuffledDeck ?? [],
    deckIndex: config.deckIndex ?? 0,
    hands: {
      "seat-0": sortHand(config.hands?.["seat-0"] ?? []),
      "seat-1": sortHand(config.hands?.["seat-1"] ?? []),
      "seat-2": sortHand(config.hands?.["seat-2"] ?? []),
      "seat-3": sortHand(config.hands?.["seat-3"] ?? [])
    },
    activeSeat: config.activeSeat ?? "seat-0",
    currentWish: config.currentWish ?? null,
    calls: config.calls ?? createDefaultCalls(),
    grandTichuQueue: config.grandTichuQueue ?? [],
    passSelections: config.passSelections ?? {},
    revealedPasses: config.revealedPasses ?? {},
    currentTrick: config.currentTrick ?? null,
    collectedCards: {
      "seat-0": config.collectedCards?.["seat-0"] ?? [],
      "seat-1": config.collectedCards?.["seat-1"] ?? [],
      "seat-2": config.collectedCards?.["seat-2"] ?? [],
      "seat-3": config.collectedCards?.["seat-3"] ?? []
    },
    finishedOrder: config.finishedOrder ?? [],
    pendingDragonGift: config.pendingDragonGift ?? null,
    roundSummary: config.roundSummary ?? null,
    matchScore: config.matchScore ?? { ...EMPTY_MATCH_SCORE },
    matchHistory:
      config.matchHistory?.map((entry) => ({
        handNumber: entry.handNumber,
        roundSeed: entry.roundSeed,
        teamScores: { ...entry.teamScores },
        cumulativeScores: { ...entry.cumulativeScores },
        finishOrder: [...entry.finishOrder],
        doubleVictory: entry.doubleVictory,
        tichuBonuses: entry.tichuBonuses.map((bonus) => ({ ...bonus }))
      })) ?? [],
    matchComplete: config.matchComplete ?? false,
    matchWinner: config.matchWinner ?? null
  };
}

export const engineFoundation = {
  name: "authoritative-engine",
  milestone: "milestone-1",
  deterministicCoreReady: true,
  supportedPhases: [
    "grand_tichu_window",
    "pass_select",
    "pass_reveal",
    "exchange_complete",
    "trick_play",
    "round_scoring",
    "finished"
  ] as const
};
