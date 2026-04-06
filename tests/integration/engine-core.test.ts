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

function combo(
  cardIds: string[],
  current: Combination | null = null
): Combination {
  const result = listCombinationInterpretations(
    cardsFromIds(cardIds),
    current
  )[0];
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

describe("engine core", () => {
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

    expect(legalActions).toEqual([
      { type: "decline_grand_tichu", seat: "seat-2" }
    ]);
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
    expect(
      mustFulfillActions.filter((action) => action.type === "play_cards")
    ).toHaveLength(1);
    expect(
      mustFulfillActions.some(
        (action) =>
          action.type === "play_cards" && action.cardIds[0] === "jade-8"
      )
    ).toBe(true);
    expect(
      mustFulfillActions.some((action) => action.type === "pass_turn")
    ).toBe(false);

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
    expect(phoenixActions.some((action) => action.type === "pass_turn")).toBe(
      true
    );
    expect(
      phoenixActions.some(
        (action) =>
          action.type === "play_cards" && action.cardIds[0] === "dragon"
      )
    ).toBe(true);
  });

  it("allows normal legal moves when the wished rank is held but cannot legally beat the trick", () => {
    const elevatedLead = combo(["jade-9"]);
    const state = scenario({
      currentWish: 8,
      activeSeat: "seat-1",
      currentTrick: {
        leader: "seat-0",
        currentWinner: "seat-0",
        currentCombination: elevatedLead,
        entries: [{ type: "play", seat: "seat-0", combination: elevatedLead }],
        passingSeats: []
      },
      hands: {
        "seat-1": cardsFromIds(["jade-8", "dragon"])
      }
    });

    const actions = getLegalActions(state)["seat-1"] ?? [];

    expect(actions.some((action) => action.type === "pass_turn")).toBe(true);
    expect(
      actions.some(
        (action) =>
          action.type === "play_cards" && action.cardIds[0] === "dragon"
      )
    ).toBe(true);
    expect(
      actions.some(
        (action) =>
          action.type === "play_cards" && action.cardIds[0] === "jade-8"
      )
    ).toBe(false);
  });

  it("keeps the game moving when no player can satisfy an active wish", () => {
    const mahjongLead = combo(["mahjong"]);
    const seat1State = scenario({
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
        "seat-1": cardsFromIds(["dragon"]),
        "seat-2": cardsFromIds(["jade-9"]),
        "seat-3": cardsFromIds(["jade-10"])
      }
    });

    const seat1Actions = getLegalActions(seat1State)["seat-1"] ?? [];
    expect(seat1Actions.length).toBeGreaterThan(0);
    expect(seat1Actions.some((action) => action.type === "pass_turn")).toBe(
      true
    );

    const afterSeat1Pass = applyEngineAction(seat1State, {
      type: "pass_turn",
      seat: "seat-1"
    });
    const seat2Actions = getLegalActions(afterSeat1Pass.nextState)["seat-2"] ?? [];

    expect(afterSeat1Pass.nextState.activeSeat).toBe("seat-2");
    expect(seat2Actions.length).toBeGreaterThan(0);
    expect(
      seat2Actions.some(
        (action) =>
          action.type === "play_cards" && action.cardIds[0] === "jade-9"
      )
    ).toBe(true);
  });

  it("never returns zero legal actions after Mahjong creates a wish", () => {
    const initial = scenario({
      currentWish: null,
      activeSeat: "seat-0",
      currentTrick: null,
      hands: {
        "seat-0": cardsFromIds(["mahjong"]),
        "seat-1": cardsFromIds(["dragon"]),
        "seat-2": cardsFromIds(["jade-9"]),
        "seat-3": cardsFromIds(["jade-10"])
      }
    });

    const afterMahjong = applyEngineAction(initial, {
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["mahjong"],
      wishRank: 8
    });
    const nextSeat = afterMahjong.nextState.activeSeat;

    expect(afterMahjong.nextState.currentWish).toBe(8);
    expect(nextSeat).toBe("seat-1");
    expect((getLegalActions(afterMahjong.nextState)[nextSeat!] ?? []).length).toBeGreaterThan(0);
  });

  it("clears the active wish immediately after a legal fulfilling play", () => {
    const mahjongLead = combo(["mahjong"]);
    const state = scenario({
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

    const result = applyEngineAction(state, {
      type: "play_cards",
      seat: "seat-1",
      cardIds: ["jade-8"]
    });

    expect(result.nextState.currentWish).toBeNull();
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
    expect(
      aceActions.some(
        (action) =>
          action.type === "play_cards" && action.cardIds[0] === "phoenix"
      )
    ).toBe(true);

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
    expect(
      dragonActions.some(
        (action) =>
          action.type === "play_cards" && action.cardIds[0] === "phoenix"
      )
    ).toBe(false);
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

  it("keeps Small Tichu available until a seat actually plays", () => {
    const liveHand = cardsFromIds(["mahjong", "jade-7", "sword-9"]);
    const supportHand = cardsFromIds(["jade-3"]);
    const passSelectState = scenario({
      phase: "pass_select",
      hands: {
        "seat-0": liveHand,
        "seat-1": supportHand,
        "seat-2": supportHand,
        "seat-3": supportHand
      }
    });

    expect(getLegalActions(passSelectState)["seat-0"]).toEqual(
      expect.arrayContaining([{ type: "call_tichu", seat: "seat-0" }])
    );

    const passRevealState = scenario({
      phase: "pass_reveal",
      hands: {
        "seat-0": liveHand,
        "seat-1": supportHand,
        "seat-2": supportHand,
        "seat-3": supportHand
      }
    });

    expect(getLegalActions(passRevealState)["seat-0"]).toEqual(
      expect.arrayContaining([{ type: "call_tichu", seat: "seat-0" }])
    );

    const exchangeCompleteState = scenario({
      phase: "exchange_complete",
      hands: {
        "seat-0": liveHand,
        "seat-1": supportHand,
        "seat-2": supportHand,
        "seat-3": supportHand
      }
    });

    expect(getLegalActions(exchangeCompleteState)["seat-0"]).toEqual(
      expect.arrayContaining([{ type: "call_tichu", seat: "seat-0" }])
    );

    const openingLeadState = scenario({
      phase: "trick_play",
      activeSeat: "seat-0",
      hands: {
        "seat-0": liveHand,
        "seat-1": supportHand,
        "seat-2": supportHand,
        "seat-3": supportHand
      },
      currentTrick: null
    });

    expect(getLegalActions(openingLeadState)["seat-0"]).toEqual(
      expect.arrayContaining([{ type: "call_tichu", seat: "seat-0" }])
    );

    const afterFirstPlay = applyEngineAction(openingLeadState, {
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["mahjong"]
    });

    expect(afterFirstPlay.nextState.calls["seat-0"].hasPlayedFirstCard).toBe(
      true
    );
    expect(
      (getLegalActions(afterFirstPlay.nextState)["seat-0"] ?? []).some(
        (action) => action.type === "call_tichu"
      )
    ).toBe(false);
    expect(
      (getLegalActions(afterFirstPlay.nextState)["seat-1"] ?? []).some(
        (action) => action.type === "call_tichu"
      )
    ).toBe(true);
  });

  it("resolves the full exchange exactly once and delivers cards to the correct recipients", () => {
    const initial = scenario({
      phase: "pass_select",
      activeSeat: null,
      hands: {
        "seat-0": cardsFromIds(["mahjong", "jade-2", "jade-3", "jade-4"]),
        "seat-1": cardsFromIds(["dragon", "sword-2", "sword-3", "sword-4"]),
        "seat-2": cardsFromIds(["phoenix", "pagoda-2", "pagoda-3", "pagoda-4"]),
        "seat-3": cardsFromIds(["jade-14", "star-2", "star-3", "star-4"])
      }
    });

    const afterSeat0 = applyEngineAction(initial, {
      type: "select_pass",
      seat: "seat-0",
      left: "jade-2",
      partner: "jade-3",
      right: "jade-4"
    });
    const afterSeat1 = applyEngineAction(afterSeat0.nextState, {
      type: "select_pass",
      seat: "seat-1",
      left: "sword-2",
      partner: "sword-3",
      right: "sword-4"
    });
    const afterSeat2 = applyEngineAction(afterSeat1.nextState, {
      type: "select_pass",
      seat: "seat-2",
      left: "pagoda-2",
      partner: "pagoda-3",
      right: "pagoda-4"
    });
    const afterSeat3 = applyEngineAction(afterSeat2.nextState, {
      type: "select_pass",
      seat: "seat-3",
      left: "star-2",
      partner: "star-3",
      right: "star-4"
    });

    expect(afterSeat3.nextState.phase).toBe("pass_reveal");

    const revealed = applyEngineAction(afterSeat3.nextState, {
      type: "advance_phase",
      actor: "system"
    });

    expect(revealed.nextState.phase).toBe("exchange_complete");
    expect(revealed.nextState.currentTrick).toBeNull();
    expect(
      [...revealed.nextState.hands["seat-0"].map((card) => card.id)].sort()
    ).toEqual(["mahjong", "sword-2", "pagoda-3", "star-4"].sort());
    expect(
      [...revealed.nextState.hands["seat-1"].map((card) => card.id)].sort()
    ).toEqual(["jade-4", "pagoda-2", "dragon", "star-3"].sort());
    expect(
      [...revealed.nextState.hands["seat-2"].map((card) => card.id)].sort()
    ).toEqual(["jade-3", "sword-4", "phoenix", "star-2"].sort());
    expect(
      [...revealed.nextState.hands["seat-3"].map((card) => card.id)].sort()
    ).toEqual(["jade-2", "sword-3", "pagoda-4", "jade-14"].sort());

    const afterExchangeComplete = applyEngineAction(revealed.nextState, {
      type: "advance_phase",
      actor: "system"
    });

    expect(afterExchangeComplete.nextState.phase).toBe("trick_play");
    expect(afterExchangeComplete.nextState.currentTrick).toBeNull();
    expect(afterExchangeComplete.nextState.hands["seat-0"].map((card) => card.id)).toEqual(
      revealed.nextState.hands["seat-0"].map((card) => card.id)
    );
    expect(afterExchangeComplete.events.map((event) => event.type)).toContain(
      "exchange_completed"
    );
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

    const afterPass1 = applyEngineAction(dragonState, {
      type: "pass_turn",
      seat: "seat-1"
    });
    const afterPass2 = applyEngineAction(afterPass1.nextState, {
      type: "pass_turn",
      seat: "seat-2"
    });
    const afterPass3 = applyEngineAction(afterPass2.nextState, {
      type: "pass_turn",
      seat: "seat-3"
    });
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
    expect(
      afterWinningSingle.nextState.currentTrick?.currentCombination.kind
    ).toBe("single");
    expect(afterWinningSingle.nextState.currentTrick?.currentWinner).toBe(
      "seat-1"
    );
    expect(afterWinningSingle.nextState.activeSeat).toBe("seat-2");

    const seat2Actions =
      getLegalActions(afterWinningSingle.nextState)["seat-2"] ?? [];
    expect(
      seat2Actions.some(
        (action) =>
          action.type === "play_cards" && action.cardIds[0] === "jade-5"
      )
    ).toBe(true);

    const afterPass1 = applyEngineAction(afterWinningSingle.nextState, {
      type: "pass_turn",
      seat: "seat-2"
    });
    const afterPass2 = applyEngineAction(afterPass1.nextState, {
      type: "pass_turn",
      seat: "seat-3"
    });
    const afterPass3 = applyEngineAction(afterPass2.nextState, {
      type: "pass_turn",
      seat: "seat-0"
    });

    expect(afterPass3.nextState.phase).toBe("trick_play");
    expect(afterPass3.nextState.currentTrick).toBeNull();
    expect(afterPass3.nextState.activeSeat).toBe("seat-2");
    expect(
      afterPass3.events.some((event) => event.type === "trick_resolved")
    ).toBe(true);
  });

  it("scores double victories and tailender transfers correctly", () => {
    const doubleVictory = scenario({
      phase: "round_scoring",
      finishedOrder: ["seat-0", "seat-2"],
      calls: {
        "seat-0": {
          grandTichu: false,
          smallTichu: true,
          hasPlayedFirstCard: true
        },
        "seat-1": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: true
        },
        "seat-2": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: true
        },
        "seat-3": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: true
        }
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
        "seat-0": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: true
        },
        "seat-1": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: true
        },
        "seat-2": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: true
        },
        "seat-3": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: true
        }
      }
    });

    const transferResult = applyEngineAction(transferState, {
      type: "advance_phase",
      actor: "system"
    });

    expect(transferResult.nextState.roundSummary?.teamScores["team-0"]).toBe(
      40
    );
    expect(transferResult.nextState.roundSummary?.teamScores["team-1"]).toBe(0);
  });

  it("preserves cumulative match state across deals when the next hand is created", () => {
    const carriedState = createInitialGameState({
      seed: "carry-forward-seed",
      matchScore: { "team-0": 340, "team-1": 220 },
      matchHistory: [
        {
          handNumber: 1,
          roundSeed: "seed-1",
          teamScores: { "team-0": 120, "team-1": -20 },
          cumulativeScores: { "team-0": 120, "team-1": -20 },
          finishOrder: ["seat-0", "seat-2", "seat-1", "seat-3"],
          doubleVictory: "team-0",
          tichuBonuses: [
            {
              seat: "seat-0",
              team: "team-0",
              label: "small",
              amount: 100
            }
          ]
        }
      ]
    });

    expect(carriedState.nextState.matchScore).toEqual({
      "team-0": 340,
      "team-1": 220
    });
    expect(carriedState.nextState.matchHistory).toHaveLength(1);
  });

  it("marks the match complete when a team reaches exactly 1000", () => {
    const scoringState = scenario({
      phase: "round_scoring",
      matchScore: { "team-0": 900, "team-1": 840 },
      finishedOrder: ["seat-0", "seat-1", "seat-2"],
      collectedCards: {
        "seat-0": cardsFromIds([
          "dragon",
          "phoenix",
          "jade-10",
          "sword-10",
          "pagoda-10",
          "star-10",
          "jade-13",
          "sword-13",
          "pagoda-13",
          "star-13",
          "jade-5",
          "sword-5",
          "pagoda-5",
          "star-5"
        ]),
        "seat-1": [],
        "seat-2": [],
        "seat-3": []
      },
      calls: {
        "seat-0": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: true
        },
        "seat-1": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: true
        },
        "seat-2": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: true
        },
        "seat-3": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: true
        }
      }
    });

    const result = applyEngineAction(scoringState, {
      type: "advance_phase",
      actor: "system"
    });

    expect(result.nextState.matchScore["team-0"]).toBe(1000);
    expect(result.nextState.matchComplete).toBe(true);
    expect(result.nextState.matchWinner).toBe("team-0");
    expect(result.nextState.matchHistory.at(-1)?.cumulativeScores["team-0"]).toBe(
      1000
    );
    expect(result.events.map((event) => event.type)).toContain("match_completed");
  });

  it("marks the match complete when a team exceeds 1000 and blocks another carried deal", () => {
    const scoringState = scenario({
      phase: "round_scoring",
      matchScore: { "team-0": 880, "team-1": 760 },
      finishedOrder: ["seat-0", "seat-2"],
      calls: {
        "seat-0": {
          grandTichu: false,
          smallTichu: true,
          hasPlayedFirstCard: true
        },
        "seat-1": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: true
        },
        "seat-2": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: true
        },
        "seat-3": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: true
        }
      }
    });

    const result = applyEngineAction(scoringState, {
      type: "advance_phase",
      actor: "system"
    });

    expect(result.nextState.matchScore["team-0"]).toBe(1180);
    expect(result.nextState.matchComplete).toBe(true);
    expect(result.nextState.matchWinner).toBe("team-0");
    expect(() =>
      createInitialGameState({
        seed: "should-not-start",
        matchScore: result.nextState.matchScore,
        matchHistory: result.nextState.matchHistory
      })
    ).toThrow("Cannot start another deal after the match is complete.");
  });
});
