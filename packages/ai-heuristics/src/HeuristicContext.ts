import {
  getLegalActions,
  getOpponentSeats,
  getPartnerSeat,
  getTeamForSeat,
  type GameState,
  type SeatId
} from "@tichuml/engine";
import type { HeadlessDecisionContext, TeamplaySnapshot, UrgencyProfile } from "./types.js";
import { isPlayLegalAction } from "./utils.js";

export function cloneState(state: GameState): GameState {
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

export function currentWinnerIsPartner(state: GameState, seat: SeatId): boolean {
  const winner = state.currentTrick?.currentWinner;
  return winner !== undefined && winner !== null && winner !== seat && getPartnerSeat(seat) === winner;
}

export function partnerHasCalledTichu(state: GameState, seat: SeatId): boolean {
  const partner = getPartnerSeat(seat);
  return state.calls[partner].smallTichu || state.calls[partner].grandTichu;
}

export function partnerStillLiveForTichu(state: GameState, seat: SeatId): boolean {
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

export function hasOpponentCalledTichu(state: GameState, seat: SeatId): boolean {
  return getOpponentSeats(seat).some(
    (opponent) => state.calls[opponent].smallTichu || state.calls[opponent].grandTichu
  );
}

export function minOpponentCards(state: GameState, seat: SeatId): number {
  return Math.min(...getOpponentSeats(seat).map((opponent) => state.hands[opponent].length));
}

export function hasOpponentImmediateWinRisk(state: GameState, seat: SeatId): boolean {
  return getOpponentSeats(seat).some((opponent) => state.hands[opponent].length <= 1);
}

export function buildUrgencyProfile(state: GameState, seat: SeatId): UrgencyProfile {
  const minOppCards = minOpponentCards(state, seat);
  const partnerCardCount = state.hands[getPartnerSeat(seat)].length;
  const selfCardCount = state.hands[seat].length;
  const opponentImmediateWinRisk = hasOpponentImmediateWinRisk(state, seat);
  const opponentOutUrgent = minOppCards <= 2;
  const selfNearOut = selfCardCount <= 3;
  const partnerNearOut = partnerCardCount <= 2;
  const yieldToPartner = partnerNearOut && minOppCards > 2;

  return {
    minOpponentCards: minOppCards,
    partnerCardCount,
    opponentImmediateWinRisk,
    opponentOutUrgent,
    selfNearOut,
    partnerNearOut,
    yieldToPartner,
    highUrgency: opponentOutUrgent || selfNearOut
  };
}

export function activeOpponentHasLiveBeat(
  ctx: HeadlessDecisionContext,
  seat: SeatId
): boolean {
  const activeSeat = ctx.state.activeSeat;
  if (!activeSeat || getTeamForSeat(activeSeat) === getTeamForSeat(seat)) {
    return false;
  }

  return (ctx.legalActions[activeSeat] ?? []).some(isPlayLegalAction);
}

export function canOpponentBeatCombination(
  state: GameState,
  opponent: SeatId,
  currentWinner: SeatId
): boolean {
  if (!state.currentTrick || state.hands[opponent].length === 0 || opponent === currentWinner) {
    return false;
  }

  const shadowState = cloneState(state);
  shadowState.currentTrick = {
    ...state.currentTrick,
    currentWinner
  };
  shadowState.activeSeat = opponent;

  return (getLegalActions(shadowState)[opponent] ?? []).some(isPlayLegalAction);
}

export function buildTeamplaySnapshot(
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
