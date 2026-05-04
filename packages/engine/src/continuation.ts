import type { JsonObject } from "@tichuml/shared";
import {
  SEAT_IDS,
  SYSTEM_ACTOR,
  type ActorId,
  type GameState,
  type InitialGameSeedConfig,
  type LegalAction,
  type LegalActionMap,
  type SeatId,
  type TeamId
} from "./types.js";
import { getCanonicalActiveSeatFromState } from "./seat-identity.js";

export type ContinuationStopReason =
  | "terminal_game_finished"
  | "invalid_state"
  | "no_legal_actions";

export type ContinuationActorResolution =
  | {
      ok: true;
      actor: ActorId;
      derivation: string;
      derivedFromLegalActions: boolean;
    }
  | {
      ok: false;
      stopReason: Exclude<ContinuationStopReason, "terminal_game_finished">;
      details: JsonObject;
    };

export type MatchContinuationPlan =
  | {
      kind: "continue";
      actor: ActorId;
      derivation: string;
      derivedFromLegalActions: boolean;
    }
  | {
      kind: "next_hand";
      nextHandNumber: number;
      carryState: Pick<InitialGameSeedConfig, "matchScore" | "matchHistory">;
    }
  | {
      kind: "stop";
      stopReason: ContinuationStopReason;
      details: JsonObject;
    };

function cloneMatchHistory(
  source: GameState["matchHistory"]
): GameState["matchHistory"] {
  return source.map((entry) => ({
    handNumber: entry.handNumber,
    roundSeed: entry.roundSeed,
    teamScores: { ...entry.teamScores },
    cumulativeScores: { ...entry.cumulativeScores },
    finishOrder: [...entry.finishOrder],
    doubleVictory: entry.doubleVictory,
    tichuBonuses: entry.tichuBonuses.map((bonus) => ({ ...bonus }))
  }));
}

export function createNextDealCarryState(
  state: Pick<GameState, "matchComplete" | "matchHistory" | "matchScore">
): Pick<InitialGameSeedConfig, "matchScore" | "matchHistory"> {
  if (state.matchComplete) {
    throw new Error("Cannot create another deal after the match is complete.");
  }

  return {
    matchScore: { ...state.matchScore },
    matchHistory: cloneMatchHistory(state.matchHistory)
  };
}

function getActorLegalActions(
  legalActions: LegalActionMap,
  actor: ActorId
): LegalAction[] {
  return Array.isArray(legalActions[actor]) ? (legalActions[actor] as LegalAction[]) : [];
}

function hasActorLegalActions(
  legalActions: LegalActionMap,
  actor: ActorId
): boolean {
  return getActorLegalActions(legalActions, actor).length > 0;
}

function actorHasLegalActionTypes(
  legalActions: LegalActionMap,
  actor: SeatId,
  actionTypes: LegalAction["type"][]
): boolean {
  return getActorLegalActions(legalActions, actor).some((action) =>
    actionTypes.includes(action.type)
  );
}

function listSeatActorsWithLegalActionTypes(
  legalActions: LegalActionMap,
  actionTypes: LegalAction["type"][]
): SeatId[] {
  return SEAT_IDS.filter((seat) =>
    actorHasLegalActionTypes(legalActions, seat, actionTypes)
  );
}

function summarizeLegalActors(legalActions: LegalActionMap): JsonObject {
  return {
    legal_actors: Object.fromEntries(
      [SYSTEM_ACTOR, ...SEAT_IDS].map((actor) => [
        actor,
        getActorLegalActions(legalActions, actor).map((action) => action.type)
      ])
    ) as JsonObject
  };
}

function isSeatId(value: unknown): value is SeatId {
  return typeof value === "string" && SEAT_IDS.includes(value as SeatId);
}

export function resolveContinuationActor(config: {
  legalActions: LegalActionMap;
  state: GameState;
}): ContinuationActorResolution {
  const { legalActions, state } = config;
  const systemHasActions = hasActorLegalActions(legalActions, SYSTEM_ACTOR);
  const seatActionCount = SEAT_IDS.reduce(
    (count, seat) => count + getActorLegalActions(legalActions, seat).length,
    0
  );

  if (!systemHasActions && seatActionCount === 0) {
    return {
      ok: false,
      stopReason: "no_legal_actions",
      details: {
        phase: state.phase,
        activeSeat: state.activeSeat,
        ...summarizeLegalActors(legalActions)
      }
    };
  }

  if (
    state.phase === "pass_reveal" ||
    state.phase === "exchange_complete" ||
    state.phase === "round_scoring"
  ) {
    if (systemHasActions) {
      return {
        ok: true,
        actor: SYSTEM_ACTOR,
        derivation: `${state.phase}_system_actor`,
        derivedFromLegalActions: false
      };
    }
    return {
      ok: false,
      stopReason: "invalid_state",
      details: {
        phase: state.phase,
        activeSeat: state.activeSeat,
        ...summarizeLegalActors(legalActions)
      }
    };
  }

  try {
    const canonicalActor = getCanonicalActiveSeatFromState(state);
    if (hasActorLegalActions(legalActions, canonicalActor)) {
      const derivation =
        state.phase === "grand_tichu_window"
          ? "grand_tichu_queue"
          : state.phase === "pass_select"
            ? "next_pending_pass_selection"
            : state.pendingDragonGift
              ? "pending_dragon_gift_winner"
              : "active_seat";
      return {
        ok: true,
        actor: canonicalActor,
        derivation,
        derivedFromLegalActions: false
      };
    }
  } catch {
    // Fall through to the legal-action-derived recovery paths below.
  }

  if (state.phase === "grand_tichu_window") {
    const gtActors = listSeatActorsWithLegalActionTypes(legalActions, [
      "call_grand_tichu",
      "decline_grand_tichu"
    ]);
    if (gtActors.length === 1) {
      return {
        ok: true,
        actor: gtActors[0]!,
        derivation: "derived_grand_tichu_actor",
        derivedFromLegalActions: true
      };
    }
  }

  if (state.phase === "pass_select") {
    const passActors = listSeatActorsWithLegalActionTypes(legalActions, [
      "select_pass"
    ]);
    if (passActors.length === 1) {
      return {
        ok: true,
        actor: passActors[0]!,
        derivation: "derived_pass_select_actor",
        derivedFromLegalActions: true
      };
    }
    return {
      ok: false,
      stopReason: "invalid_state",
      details: {
        phase: state.phase,
        activeSeat: state.activeSeat,
        passSelections: state.passSelections as unknown as JsonObject,
        selectPassActors: passActors,
        ...summarizeLegalActors(legalActions)
      }
    };
  }

  if (state.phase === "trick_play") {
    const trickActors = SEAT_IDS.filter((seat) =>
      hasActorLegalActions(legalActions, seat)
    );
    if (state.pendingDragonGift) {
      const dragonActors = listSeatActorsWithLegalActionTypes(legalActions, [
        "assign_dragon_trick"
      ]);
      if (dragonActors.length === 1) {
        return {
          ok: true,
          actor: dragonActors[0]!,
          derivation: "derived_dragon_gift_actor",
          derivedFromLegalActions: true
        };
      }
      return {
        ok: false,
        stopReason: "invalid_state",
        details: {
          phase: state.phase,
          activeSeat: state.activeSeat,
          pendingDragonGift: {
            winner: state.pendingDragonGift.winner,
            nextLeader: state.pendingDragonGift.nextLeader,
            roundEndsAfterGift: state.pendingDragonGift.roundEndsAfterGift
          } as unknown as JsonObject,
          dragonActors,
          ...summarizeLegalActors(legalActions)
        }
      };
    }

    if (trickActors.length === 1) {
      return {
        ok: true,
        actor: trickActors[0]!,
        derivation: "derived_trick_actor_from_legal_actions",
        derivedFromLegalActions: true
      };
    }

    return {
      ok: false,
      stopReason: "invalid_state",
      details: {
        phase: state.phase,
        activeSeat: state.activeSeat,
        trickActors,
        ...summarizeLegalActors(legalActions)
      }
    };
  }

  if (systemHasActions) {
    return {
      ok: true,
      actor: SYSTEM_ACTOR,
      derivation: "system_actor_fallback",
      derivedFromLegalActions: false
    };
  }

  const seatActors = SEAT_IDS.filter((seat) =>
    hasActorLegalActions(legalActions, seat)
  );
  if (seatActors.length === 1 && isSeatId(seatActors[0])) {
    return {
      ok: true,
      actor: seatActors[0],
      derivation: "single_legal_actor_fallback",
      derivedFromLegalActions: true
    };
  }

  return {
    ok: false,
    stopReason: "invalid_state",
    details: {
      phase: state.phase,
      activeSeat: state.activeSeat,
      ...summarizeLegalActors(legalActions)
    }
  };
}

export function planMatchContinuation(config: {
  legalActions: LegalActionMap;
  state: GameState;
}): MatchContinuationPlan {
  const { state, legalActions } = config;
  if (state.phase === "finished") {
    if (state.matchComplete) {
      return {
        kind: "stop",
        stopReason: "terminal_game_finished",
        details: {
          phase: state.phase,
          handNumber: state.matchHistory.length,
          matchComplete: true,
          matchWinner: state.matchWinner,
          matchScore: { ...state.matchScore } as unknown as JsonObject
        }
      };
    }

    return {
      kind: "next_hand",
      nextHandNumber: state.matchHistory.length + 1,
      carryState: createNextDealCarryState(state)
    };
  }

  const resolution = resolveContinuationActor({ state, legalActions });
  if (resolution.ok) {
    return {
      kind: "continue",
      actor: resolution.actor,
      derivation: resolution.derivation,
      derivedFromLegalActions: resolution.derivedFromLegalActions
    };
  }

  return {
    kind: "stop",
    stopReason: resolution.stopReason,
    details: resolution.details
  };
}

export const continuationFoundation = {
  nextHandCarry: "authoritative_engine_helper",
  actorResolution: "shared_engine_contract"
} as const;
