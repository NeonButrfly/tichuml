import { describe, expect, it } from "vitest";
import {
  applyEngineAction,
  cardsFromIds,
  createInitialGameState,
  createScenarioState,
  getLegalActions,
  listCombinationInterpretations,
  type Combination,
  type GameState
} from "@tichuml/engine";

function combo(cardIds: string[], current: Combination | null = null): Combination {
  const result = listCombinationInterpretations(cardsFromIds(cardIds), current)[0];
  if (!result) {
    throw new Error(`No combination found for ${cardIds.join(",")}`);
  }

  return result;
}

function scenario(config: Partial<GameState> = {}): GameState {
  return createScenarioState({
    ...config,
    hands: {
      "seat-0": [],
      "seat-1": [],
      "seat-2": [],
      "seat-3": [],
      ...(config.hands ?? {})
    }
  });
}

describe("milestone 1 engine core", () => {
  it("deals deterministically from a seed", () => {
    const first = createInitialGameState("alpha-seed");
    const second = createInitialGameState("alpha-seed");
    const third = createInitialGameState("beta-seed");

    expect(first.nextState.hands).toEqual(second.nextState.hands);
    expect(first.nextState.hands).not.toEqual(third.nextState.hands);
    expect(first.nextState.phase).toBe("grand_tichu_window");
  });

  it("suppresses duplicate partner Grand Tichu calls", () => {
    const opened = createInitialGameState("grand-window");
    const afterSeat0 = applyEngineAction(opened.nextState, {
      type: "call_grand_tichu",
      seat: "seat-0"
    });
    const afterSeat1 = applyEngineAction(afterSeat0.nextState, {
      type: "decline_grand_tichu",
      seat: "seat-1"
    });

    const legalActions = getLegalActions(afterSeat1.nextState)["seat-2"] ?? [];

    expect(legalActions).toEqual([{ type: "decline_grand_tichu", seat: "seat-2" }]);
  });

  it("forces wish fulfillment only when the player holds the wished rank", () => {
    const mahjongLead = combo(["mahjong"]);
    const mustFulfill = scenario({
      currentWish: 8,
      activeSeat: "seat-1",
      currentTrick: {
        leader: "seat-0",
        currentWinner: "seat-0",
        currentCombination: mahjongLead,
        entries: [{ type: "play", seat: "seat-0", combination: mahjongLead }],
        passingSeats: []
      },
      hands: {
        "seat-1": cardsFromIds(["jade-8", "dragon"])
      }
    });

    const mustFulfillActions = getLegalActions(mustFulfill)["seat-1"] ?? [];
    expect(mustFulfillActions.filter((action) => action.type === "play_cards")).toHaveLength(1);
    expect(mustFulfillActions.some((action) => action.type === "play_cards" && action.cardIds[0] === "jade-8")).toBe(
      true
    );
    expect(mustFulfillActions.some((action) => action.type === "pass_turn")).toBe(false);

    const phoenixDoesNotCount = scenario({
      currentWish: 8,
      activeSeat: "seat-1",
      currentTrick: {
        leader: "seat-0",
        currentWinner: "seat-0",
        currentCombination: mahjongLead,
        entries: [{ type: "play", seat: "seat-0", combination: mahjongLead }],
        passingSeats: []
      },
      hands: {
        "seat-1": cardsFromIds(["phoenix", "dragon"])
      }
    });

    const phoenixActions = getLegalActions(phoenixDoesNotCount)["seat-1"] ?? [];
    expect(phoenixActions.some((action) => action.type === "pass_turn")).toBe(true);
    expect(phoenixActions.some((action) => action.type === "play_cards" && action.cardIds[0] === "dragon")).toBe(true);
  });

  it("handles Phoenix single-card legality against Ace and Dragon", () => {
    const aceLead = combo(["jade-14"]);
    const againstAce = scenario({
      activeSeat: "seat-1",
      currentTrick: {
        leader: "seat-0",
        currentWinner: "seat-0",
        currentCombination: aceLead,
        entries: [{ type: "play", seat: "seat-0", combination: aceLead }],
        passingSeats: []
      },
      hands: {
        "seat-1": cardsFromIds(["phoenix"])
      }
    });

    const aceActions = getLegalActions(againstAce)["seat-1"] ?? [];
    expect(aceActions.some((action) => action.type === "play_cards" && action.cardIds[0] === "phoenix")).toBe(true);

    const dragonLead = combo(["dragon"]);
    const againstDragon = scenario({
      activeSeat: "seat-1",
      currentTrick: {
        leader: "seat-0",
        currentWinner: "seat-0",
        currentCombination: dragonLead,
        entries: [{ type: "play", seat: "seat-0", combination: dragonLead }],
        passingSeats: []
      },
      hands: {
        "seat-1": cardsFromIds(["phoenix"])
      }
    });

    const dragonActions = getLegalActions(againstDragon)["seat-1"] ?? [];
    expect(dragonActions.some((action) => action.type === "play_cards" && action.cardIds[0] === "phoenix")).toBe(false);
  });

  it("transfers the lead to the partner when Dog is led", () => {
    const state = scenario({
      hands: {
        "seat-0": cardsFromIds(["dog"]),
        "seat-1": cardsFromIds(["jade-6"]),
        "seat-2": cardsFromIds(["jade-9"])
      }
    });

    const result = applyEngineAction(state, {
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["dog"]
    });

    expect(result.nextState.activeSeat).toBe("seat-2");
    expect(result.nextState.currentTrick).toBeNull();
  });

  it("allows out-of-turn bombs and requires Dragon trick assignment", () => {
    const pairLead = combo(["jade-7", "sword-7"]);
    const bombState = scenario({
      activeSeat: "seat-1",
      currentTrick: {
        leader: "seat-0",
        currentWinner: "seat-0",
        currentCombination: pairLead,
        entries: [{ type: "play", seat: "seat-0", combination: pairLead }],
        passingSeats: []
      },
      hands: {
        "seat-2": cardsFromIds(["jade-9", "sword-9", "pagoda-9", "star-9"])
      }
    });

    const bombActions = getLegalActions(bombState)["seat-2"] ?? [];
    expect(
      bombActions.some(
        (action) =>
          action.type === "play_cards" &&
          action.combination.kind === "bomb-four-kind" &&
          action.cardIds.length === 4
      )
    ).toBe(true);

    const dragonLead = combo(["dragon"]);
    const dragonState = scenario({
      activeSeat: "seat-1",
      currentTrick: {
        leader: "seat-0",
        currentWinner: "seat-0",
        currentCombination: dragonLead,
        entries: [{ type: "play", seat: "seat-0", combination: dragonLead }],
        passingSeats: []
      },
      hands: {
        "seat-1": cardsFromIds(["jade-3"]),
        "seat-2": cardsFromIds(["jade-4"]),
        "seat-3": cardsFromIds(["jade-5"])
      }
    });

    const afterPass1 = applyEngineAction(dragonState, { type: "pass_turn", seat: "seat-1" });
    const afterPass2 = applyEngineAction(afterPass1.nextState, { type: "pass_turn", seat: "seat-2" });
    const afterPass3 = applyEngineAction(afterPass2.nextState, { type: "pass_turn", seat: "seat-3" });
    const dragonActions = getLegalActions(afterPass3.nextState)["seat-0"] ?? [];

    expect(afterPass3.nextState.pendingDragonGift?.winner).toBe("seat-0");
    expect(dragonActions).toEqual([
      { type: "assign_dragon_trick", seat: "seat-0", recipient: "seat-1" },
      { type: "assign_dragon_trick", seat: "seat-0", recipient: "seat-3" }
    ]);
  });

  it("continues the round after a player goes out on a final single", () => {
    const openingSingle = combo(["jade-3"]);
    const state = scenario({
      activeSeat: "seat-1",
      currentTrick: {
        leader: "seat-0",
        currentWinner: "seat-0",
        currentCombination: openingSingle,
        entries: [{ type: "play", seat: "seat-0", combination: openingSingle }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["jade-9"]),
        "seat-1": cardsFromIds(["jade-4"]),
        "seat-2": cardsFromIds(["jade-5"]),
        "seat-3": cardsFromIds(["jade-6"])
      }
    });

    const afterWinningSingle = applyEngineAction(state, {
      type: "play_cards",
      seat: "seat-1",
      cardIds: ["jade-4"]
    });

    expect(afterWinningSingle.nextState.finishedOrder).toEqual(["seat-1"]);
    expect(afterWinningSingle.nextState.currentTrick?.currentCombination.kind).toBe("single");
    expect(afterWinningSingle.nextState.currentTrick?.currentWinner).toBe("seat-1");
    expect(afterWinningSingle.nextState.activeSeat).toBe("seat-2");

    const seat2Actions = getLegalActions(afterWinningSingle.nextState)["seat-2"] ?? [];
    expect(seat2Actions.some((action) => action.type === "play_cards" && action.cardIds[0] === "jade-5")).toBe(true);

    const afterPass1 = applyEngineAction(afterWinningSingle.nextState, { type: "pass_turn", seat: "seat-2" });
    const afterPass2 = applyEngineAction(afterPass1.nextState, { type: "pass_turn", seat: "seat-3" });
    const afterPass3 = applyEngineAction(afterPass2.nextState, { type: "pass_turn", seat: "seat-0" });

    expect(afterPass3.nextState.phase).toBe("trick_play");
    expect(afterPass3.nextState.currentTrick).toBeNull();
    expect(afterPass3.nextState.activeSeat).toBe("seat-2");
    expect(afterPass3.events.some((event) => event.type === "trick_resolved")).toBe(true);
  });

  it("scores double victories and tailender transfers correctly", () => {
    const doubleVictory = scenario({
      phase: "round_scoring",
      finishedOrder: ["seat-0", "seat-2"],
      calls: {
        "seat-0": { grandTichu: false, smallTichu: true, hasPlayedFirstCard: true },
        "seat-1": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: true },
        "seat-2": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: true },
        "seat-3": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: true }
      }
    });

    const doubleResult = applyEngineAction(doubleVictory, {
      type: "advance_phase",
      actor: "system"
    });

    expect(doubleResult.nextState.phase).toBe("finished");
    expect(doubleResult.nextState.roundSummary?.teamScores["team-0"]).toBe(300);
    expect(doubleResult.nextState.roundSummary?.teamScores["team-1"]).toBe(0);

    const transferState = scenario({
      phase: "round_scoring",
      finishedOrder: ["seat-0", "seat-1", "seat-2"],
      hands: {
        "seat-3": cardsFromIds(["dragon"])
      },
      collectedCards: {
        "seat-0": cardsFromIds(["jade-10"]),
        "seat-1": [],
        "seat-2": [],
        "seat-3": cardsFromIds(["jade-5"])
      },
      calls: {
        "seat-0": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: true },
        "seat-1": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: true },
        "seat-2": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: true },
        "seat-3": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: true }
      }
    });

    const transferResult = applyEngineAction(transferState, {
      type: "advance_phase",
      actor: "system"
    });

    expect(transferResult.nextState.roundSummary?.teamScores["team-0"]).toBe(40);
    expect(transferResult.nextState.roundSummary?.teamScores["team-1"]).toBe(0);
  });
});
