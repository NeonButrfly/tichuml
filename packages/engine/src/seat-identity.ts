import {
  SEAT_IDS,
  SYSTEM_ACTOR,
  type ActorId,
  type GameState,
  type LegalAction,
  type LegalActionMap,
  type SeatId
} from "./types.js";

export const COMPASS_SEATS = ["south", "west", "north", "east"] as const;

export type CompassSeat = (typeof COMPASS_SEATS)[number];

const SEAT_TO_COMPASS: Record<SeatId, CompassSeat> = {
  "seat-0": "south",
  "seat-1": "west",
  "seat-2": "north",
  "seat-3": "east"
};

const COMPASS_TO_SEAT: Record<CompassSeat, SeatId> = {
  south: "seat-0",
  west: "seat-1",
  north: "seat-2",
  east: "seat-3"
};

export function isSeatId(value: unknown): value is SeatId {
  return typeof value === "string" && SEAT_IDS.includes(value as SeatId);
}

export function seatIdFromIndex(index: number): SeatId {
  if (!Number.isInteger(index) || index < 0 || index >= SEAT_IDS.length) {
    throw new Error(`Seat index ${index} is outside the stable 0..3 range.`);
  }

  return SEAT_IDS[index]!;
}

export function seatIndexFromId(seat: SeatId): number {
  return SEAT_IDS.indexOf(seat);
}

export function seatIdToCompass(seat: SeatId): CompassSeat {
  return SEAT_TO_COMPASS[seat];
}

export function compassToSeatId(compass: CompassSeat): SeatId {
  return COMPASS_TO_SEAT[compass];
}

function isStateLike(value: unknown): value is Pick<GameState, "phase" | "activeSeat" | "passSelections"> {
  return typeof value === "object" && value !== null && "phase" in value;
}

function getNextPendingPassSelectionSeat(
  state: Pick<GameState, "passSelections">
): SeatId | null {
  return SEAT_IDS.find((seat) => !state.passSelections[seat]) ?? null;
}

export function getCanonicalActiveSeatFromState(state: unknown): SeatId {
  if (!isStateLike(state)) {
    throw new Error("[turn] Cannot derive canonical actor from a non-state payload.");
  }

  if (isSeatId(state.activeSeat)) {
    return state.activeSeat;
  }

  if (state.phase === "pass_select" && "passSelections" in state) {
    const passActor = getNextPendingPassSelectionSeat(
      state as Pick<GameState, "passSelections">
    );
    if (passActor) {
      return passActor;
    }
  }

  throw new Error(
    `[turn] Cannot derive canonical active seat from state: phase=${String(
      state.phase
    )}, activeSeat=${String(state.activeSeat ?? "null")}.`
  );
}

export function getLegalActionOwner(action: LegalAction): ActorId | null {
  if ("seat" in action && isSeatId(action.seat)) {
    return action.seat;
  }

  if ("actor" in action && action.actor === SYSTEM_ACTOR) {
    return SYSTEM_ACTOR;
  }

  return null;
}

export function getActorScopedLegalActions(
  legalActions: LegalActionMap,
  actor: ActorId
): LegalActionMap {
  return {
    [actor]: legalActions[actor] ?? []
  };
}

export function validateLegalActionsForCanonicalActor(config: {
  legalActions: LegalActionMap;
  actor: SeatId;
}): string[] {
  const issues: string[] = [];

  for (const [key, actions] of Object.entries(config.legalActions)) {
    if (!Array.isArray(actions) || actions.length === 0) {
      continue;
    }

    if (key !== config.actor) {
      issues.push(
        `legal_actions contains ${actions.length} action(s) for ${key}; expected only ${config.actor}.`
      );
    }

    for (const action of actions) {
      const owner = getLegalActionOwner(action);
      if (owner !== null && owner !== config.actor) {
        issues.push(
          `legal action ${action.type} belongs to ${owner}; expected ${config.actor}.`
        );
      }
    }
  }

  return issues;
}
