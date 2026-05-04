import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyEngineAction,
  cardsFromIds,
  createInitialGameState,
  createScenarioState,
  getCanonicalActiveSeatFromState,
  getLegalActions,
  listCombinationInterpretations,
  type EngineAction,
  type EngineResult,
  type LegalAction,
  type SeatId
} from "@tichuml/engine";
import {
  resolveAutomatedContinuationActor,
} from "../../apps/sim-runner/src/self-play-batch";

function buildSingleCardCombination(cardId: string) {
  const cards = cardsFromIds([cardId]);
  const combination = listCombinationInterpretations(cards, null).find(
    (candidate) => candidate.kind === "single"
  );
  if (!combination) {
    throw new Error(`Unable to build single-card combination for ${cardId}.`);
  }
  return combination;
}

function buildSelectPassAction(result: EngineResult, seat: SeatId): EngineAction {
  const selectPass = (result.legalActions[seat] ?? []).find(
    (action): action is Extract<LegalAction, { type: "select_pass" }> =>
      action.type === "select_pass"
  );
  if (!selectPass || selectPass.availableCardIds.length < 3) {
    throw new Error(`Expected select_pass action for ${seat}.`);
  }

  return {
    type: "select_pass",
    seat,
    left: selectPass.availableCardIds[0]!,
    partner: selectPass.availableCardIds[1]!,
    right: selectPass.availableCardIds[2]!
  };
}

function advanceToPassSelect(seed = "selfplay-pass-select"): EngineResult {
  let result = createInitialGameState({ seed });
  while (result.nextState.phase === "grand_tichu_window") {
    const actor = getCanonicalActiveSeatFromState(result.nextState);
    result = applyEngineAction(result.nextState, {
      type: "decline_grand_tichu",
      seat: actor
    });
  }
  expect(result.nextState.phase).toBe("pass_select");
  return result;
}

describe("self-play continuation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("@tichuml/engine");
  });

  it("continues grand tichu decline flow through the full queue", () => {
    let result = createInitialGameState({ seed: "gt-queue-continuation" });
    const actors: string[] = [];

    while (result.nextState.phase === "grand_tichu_window") {
      const continuation = resolveAutomatedContinuationActor({
        legalActions: result.legalActions,
        state: result.nextState
      });
      expect(continuation.ok).toBe(true);
      if (!continuation.ok) {
        return;
      }
      actors.push(String(continuation.actor));
      result = applyEngineAction(result.nextState, {
        type: "decline_grand_tichu",
        seat: continuation.actor as SeatId
      });
    }

    expect(actors).toEqual(["seat-0", "seat-1", "seat-2", "seat-3"]);
    expect(result.nextState.phase).toBe("pass_select");
  });

  it("keeps pass selection moving after optional call_tichu and reaches pass_reveal", () => {
    let result = advanceToPassSelect("pass-select-optional-tichu");

    const firstContinuation = resolveAutomatedContinuationActor({
      legalActions: result.legalActions,
      state: result.nextState
    });
    expect(firstContinuation.ok).toBe(true);
    if (!firstContinuation.ok) {
      return;
    }
    expect(firstContinuation.actor).toBe("seat-0");

    const firstActorActions = result.legalActions[firstContinuation.actor as SeatId] ?? [];
    const optionalTichu = firstActorActions.find(
      (action): action is Extract<LegalAction, { type: "call_tichu" }> =>
        action.type === "call_tichu"
    );
    expect(optionalTichu).toBeDefined();
    result = applyEngineAction(result.nextState, optionalTichu!);

    const afterOptionalTichu = resolveAutomatedContinuationActor({
      legalActions: result.legalActions,
      state: result.nextState
    });
    expect(afterOptionalTichu.ok).toBe(true);
    if (!afterOptionalTichu.ok) {
      return;
    }
    expect(afterOptionalTichu.actor).toBe("seat-0");

    while (result.nextState.phase === "pass_select") {
      const continuation = resolveAutomatedContinuationActor({
        legalActions: result.legalActions,
        state: result.nextState
      });
      expect(continuation.ok).toBe(true);
      if (!continuation.ok) {
        return;
      }
      result = applyEngineAction(
        result.nextState,
        buildSelectPassAction(result, continuation.actor as SeatId)
      );
    }

    expect(result.nextState.phase).toBe("pass_reveal");
    expect(Object.keys(result.nextState.passSelections)).toHaveLength(4);
  });

  it("continues trick_play after an ordinary play_cards action", () => {
    const lead = buildSingleCardCombination("jade-7");
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-1",
      hands: {
        "seat-0": cardsFromIds(["jade-7"]),
        "seat-1": cardsFromIds(["jade-8"]),
        "seat-2": cardsFromIds(["jade-4"]),
        "seat-3": cardsFromIds(["jade-3"])
      },
      currentTrick: {
        leader: "seat-0",
        currentWinner: "seat-0",
        currentCombination: lead,
        entries: [{ type: "play", seat: "seat-0", combination: lead }],
        passingSeats: []
      }
    });
    const afterPlay = applyEngineAction(state, {
      type: "play_cards",
      seat: "seat-1",
      cardIds: ["jade-8"]
    });

    const continuation = resolveAutomatedContinuationActor({
      legalActions: afterPlay.legalActions,
      state: afterPlay.nextState
    });
    expect(continuation.ok).toBe(true);
  });

  it("continues trick_play after pass_turn", () => {
    const lead = buildSingleCardCombination("jade-7");
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-1",
      hands: {
        "seat-0": cardsFromIds(["jade-7"]),
        "seat-1": cardsFromIds(["jade-5"]),
        "seat-2": cardsFromIds(["jade-4"]),
        "seat-3": cardsFromIds(["jade-3"])
      },
      currentTrick: {
        leader: "seat-0",
        currentWinner: "seat-0",
        currentCombination: lead,
        entries: [{ type: "play", seat: "seat-0", combination: lead }],
        passingSeats: []
      }
    });

    const afterPass = applyEngineAction(state, {
      type: "pass_turn",
      seat: "seat-1"
    });
    const continuation = resolveAutomatedContinuationActor({
      legalActions: afterPass.legalActions,
      state: afterPass.nextState
    });
    expect(continuation.ok).toBe(true);
  });

  it("auto-resolves dragon gift for AI continuation", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-0",
      hands: {
        "seat-0": cardsFromIds(["dragon"]),
        "seat-1": cardsFromIds(["jade-7"]),
        "seat-2": cardsFromIds(["jade-6"]),
        "seat-3": cardsFromIds(["jade-5"])
      },
      pendingDragonGift: {
        winner: "seat-0",
        trickCards: cardsFromIds(["dragon"]),
        nextLeader: "seat-1",
        roundEndsAfterGift: false
      }
    });
    const actorBeforeGift = resolveAutomatedContinuationActor({
      legalActions: getLegalActions(state),
      state
    });
    expect(actorBeforeGift.ok).toBe(true);
    if (!actorBeforeGift.ok) {
      return;
    }
    expect(actorBeforeGift.actor).toBe("seat-0");

    const afterGift = applyEngineAction(state, {
      type: "assign_dragon_trick",
      seat: "seat-0",
      recipient: "seat-1"
    });
    const continuation = resolveAutomatedContinuationActor({
      legalActions: afterGift.legalActions,
      state: afterGift.nextState
    });

    expect(afterGift.events.map((event) => event.type)).toContain(
      "dragon_trick_assigned"
    );
    expect(afterGift.nextState.phase).toBe("trick_play");
    expect(afterGift.nextState.activeSeat).toBe("seat-1");
    expect(continuation.ok).toBe(true);
  });

  it("produces zero silent short games across 10 local matches", async () => {
    vi.doMock("@tichuml/engine", async () => {
      const actual =
        await vi.importActual<typeof import("@tichuml/engine")>(
          "@tichuml/engine"
        );

      return {
        ...actual,
        createInitialGameState: (
          seedOrConfig: Parameters<typeof actual.createInitialGameState>[0]
        ) =>
          actual.createInitialGameState(
            typeof seedOrConfig === "object" && seedOrConfig !== null
              ? seedOrConfig
              : {
                  seed: seedOrConfig,
                  matchScore: {
                    "team-0": 900,
                    "team-1": 900
                  }
                }
          )
      };
    });

    const { runSelfPlayBatchDetailed } = await import(
      "../../apps/sim-runner/src/self-play-batch"
    );
    const result = await runSelfPlayBatchDetailed({
      games: 10,
      baseSeed: "selfplay-short-games-regression",
      defaultProvider: "local",
      telemetryEnabled: false,
      quiet: true,
      progress: false
    });

    expect(result.games).toHaveLength(10);
    expect(
      result.games.every((game) => typeof game.stopReason === "string")
    ).toBe(true);
    expect(
      result.games.filter(
        (game) =>
          game.decisions < 50 && game.stopReason !== "terminal_game_finished"
      )
    ).toHaveLength(0);
  }, 180000);
});
