import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyEngineAction,
  beatsCombination,
  cardsFromIds,
  createInitialGameState,
  createScenarioState,
  getCanonicalCardIdsKey,
  getLegalActions,
  listCombinationInterpretations,
  STANDARD_RANKS,
  type Combination,
  type GameState,
  type LegalAction
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

function enumerateCardSubsets(cardIds: string[]): string[][] {
  const subsets: string[][] = [];
  const limit = 1 << cardIds.length;

  for (let mask = 1; mask < limit; mask += 1) {
    const selection: string[] = [];
    for (let bit = 0; bit < cardIds.length; bit += 1) {
      if ((mask & (1 << bit)) !== 0) {
        selection.push(cardIds[bit]!);
      }
    }
    subsets.push(selection);
  }

  return subsets;
}

function toPlayKey(action: Extract<LegalAction, { type: "play_cards" }>): string {
  return [
    action.combination.kind,
    getCanonicalCardIdsKey(action.cardIds),
    action.phoenixAsRank ?? "none"
  ].join(":");
}

function buildExhaustiveResponseKeys(
  state: GameState,
  seat: "seat-0" | "seat-1" | "seat-2" | "seat-3"
): string[] {
  const currentCombination = state.currentTrick?.currentCombination ?? null;
  if (!currentCombination) {
    return [];
  }

  const actions = new Map<string, string>();
  const handCardIds = state.hands[seat].map((card) => card.id);

  for (const subset of enumerateCardSubsets(handCardIds)) {
    for (const combination of listCombinationInterpretations(
      cardsFromIds(subset),
      currentCombination
    )) {
      if (!beatsCombination(combination, currentCombination)) {
        continue;
      }

      const key = [
        combination.kind,
        getCanonicalCardIdsKey(combination.cardIds),
        combination.phoenixAsRank ?? "none"
      ].join(":");
      actions.set(key, key);
    }
  }

  return [...actions.values()].sort();
}

describe("engine core", () => {
  afterEach(() => {
    delete process.env.TICHU_TRACE_STRAIGHT_RESPONSES;
    vi.restoreAllMocks();
  });

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

  it("suppresses a small Tichu call when the partner already called Grand Tichu", () => {
    const state = scenario({
      phase: "pass_select",
      activeSeat: "seat-2",
      calls: {
        "seat-0": {
          grandTichu: true,
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
      },
      hands: {
        "seat-2": cardsFromIds(["jade-2", "sword-3", "pagoda-4"])
      }
    });

    const legalActions = getLegalActions(state)["seat-2"] ?? [];

    expect(
      legalActions.some((action) => action.type === "call_tichu")
    ).toBe(false);
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

  it("keeps an active Mahjong wish through an actor who cannot fulfill it and forces a later actor who can", () => {
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
        "seat-1": cardsFromIds(["dragon"]),
        "seat-2": cardsFromIds(["jade-8", "jade-9"]),
        "seat-3": cardsFromIds(["jade-10"])
      }
    });

    const seat1Actions = getLegalActions(state)["seat-1"] ?? [];
    expect(seat1Actions.some((action) => action.type === "pass_turn")).toBe(true);

    const afterSeat1Pass = applyEngineAction(state, {
      type: "pass_turn",
      seat: "seat-1"
    });

    expect(afterSeat1Pass.nextState.currentWish).toBe(8);

    const seat2Actions = getLegalActions(afterSeat1Pass.nextState)["seat-2"] ?? [];
    expect(
      seat2Actions.filter((action) => action.type === "play_cards")
    ).toHaveLength(1);
    expect(
      seat2Actions.some(
        (action) =>
          action.type === "play_cards" && action.cardIds[0] === "jade-8"
      )
    ).toBe(true);
    expect(seat2Actions.some((action) => action.type === "pass_turn")).toBe(false);
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

  it("exposes available Mahjong wish ranks on legal Mahjong plays", () => {
    const state = scenario({
      currentWish: null,
      activeSeat: "seat-0",
      currentTrick: null,
      hands: {
        "seat-0": cardsFromIds(["mahjong", "jade-7", "sword-9"])
      }
    });

    const mahjongAction = (getLegalActions(state)["seat-0"] ?? []).find(
      (action) =>
        action.type === "play_cards" && action.cardIds.includes("mahjong")
    );

    expect(mahjongAction).toBeDefined();
    if (!mahjongAction || mahjongAction.type !== "play_cards") {
      throw new Error("Expected a legal Mahjong play.");
    }
    expect(mahjongAction.availableWishRanks).toEqual([...STANDARD_RANKS]);
  });

  it("treats an explicit null Mahjong wish as no active wish", () => {
    const initial = scenario({
      currentWish: null,
      activeSeat: "seat-0",
      currentTrick: null,
      hands: {
        "seat-0": cardsFromIds(["mahjong"]),
        "seat-1": cardsFromIds(["jade-8", "jade-9"]),
        "seat-2": cardsFromIds(["dragon"]),
        "seat-3": cardsFromIds(["jade-10"])
      }
    });

    const afterMahjong = applyEngineAction(initial, {
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["mahjong"],
      wishRank: null
    });
    const nextSeat = afterMahjong.nextState.activeSeat;
    const seat1Actions = (getLegalActions(afterMahjong.nextState)[nextSeat!] ?? []).filter(
      (action): action is Extract<LegalAction, { type: "play_cards" }> =>
        action.type === "play_cards"
    );

    expect(afterMahjong.nextState.currentWish).toBeNull();
    expect(nextSeat).toBe("seat-1");
    expect(
      seat1Actions.some((action) => action.cardIds[0] === "jade-8")
    ).toBe(true);
    expect(
      seat1Actions.some((action) => action.cardIds[0] === "jade-9")
    ).toBe(true);
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

  it("keeps the active wish visible in straight-response diagnostics when tracing is enabled", () => {
    process.env.TICHU_TRACE_STRAIGHT_RESPONSES = "1";
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const straightLead = combo([
      "jade-3",
      "sword-4",
      "pagoda-5",
      "star-6",
      "jade-7"
    ]);
    const state = scenario({
      currentWish: 9,
      activeSeat: "seat-3",
      currentTrick: {
        leader: "seat-2",
        currentWinner: "seat-2",
        currentCombination: straightLead,
        entries: [{ type: "play", seat: "seat-2", combination: straightLead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["jade-2"]),
        "seat-1": cardsFromIds(["sword-2"]),
        "seat-2": cardsFromIds(["star-2"]),
        "seat-3": cardsFromIds([
          "jade-8",
          "sword-9",
          "pagoda-10",
          "star-11",
          "jade-12"
        ])
      }
    });

    getLegalActions(state);

    const straightLog = infoSpy.mock.calls.find(
      (call) => call[0] === "[engine] Straight response availability"
    );

    expect(straightLog?.[1]).toMatchObject({
      activeSeat: "seat-3",
      wishState: 9
    });
  });

  it("preserves the exhaustive Phoenix straight-response legal set while deduping generation", () => {
    const straightLead = combo([
      "pagoda-4",
      "star-5",
      "pagoda-6",
      "pagoda-7",
      "pagoda-8"
    ]);
    const state = scenario({
      activeSeat: "seat-1",
      currentTrick: {
        leader: "seat-0",
        currentWinner: "seat-0",
        currentCombination: straightLead,
        entries: [{ type: "play", seat: "seat-0", combination: straightLead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["jade-2"]),
        "seat-1": cardsFromIds([
          "jade-7",
          "star-7",
          "jade-8",
          "star-9",
          "jade-10",
          "sword-10",
          "star-11",
          "phoenix"
        ]),
        "seat-2": cardsFromIds(["sword-2"]),
        "seat-3": cardsFromIds(["star-2"])
      }
    });

    const optimizedKeys = (getLegalActions(state)["seat-1"] ?? [])
      .filter(
        (action): action is Extract<LegalAction, { type: "play_cards" }> =>
          action.type === "play_cards"
      )
      .map((action) => toPlayKey(action))
      .sort();

    const exhaustiveKeys = buildExhaustiveResponseKeys(state, "seat-1");

    expect(optimizedKeys).toEqual(exhaustiveKeys);
    expect(new Set(optimizedKeys).size).toBe(optimizedKeys.length);
  });

  it("normalizes combination card ids in canonical rank-first order", () => {
    const straight = combo([
      "star-7",
      "jade-5",
      "jade-9",
      "pagoda-8",
      "sword-6"
    ]);
    const trio = combo(["star-8", "jade-8", "sword-8"]);

    expect(straight.cardIds).toEqual([
      "jade-5",
      "sword-6",
      "star-7",
      "pagoda-8",
      "jade-9"
    ]);
    expect(straight.actualRanks).toEqual([5, 6, 7, 8, 9]);
    expect(trio.cardIds).toEqual(["jade-8", "sword-8", "star-8"]);
  });

  it("generates legal responses or pass fallbacks across all combo families without deadlocking", () => {
    const playableCases = [
      {
        label: "single",
        lead: ["jade-9"],
        response: ["sword-10"],
        kind: "single"
      },
      {
        label: "pair",
        lead: ["jade-7", "sword-7"],
        response: ["pagoda-8", "star-8"],
        kind: "pair"
      },
      {
        label: "trio",
        lead: ["jade-7", "sword-7", "pagoda-7"],
        response: ["jade-8", "sword-8", "star-8"],
        kind: "trio"
      },
      {
        label: "full house",
        lead: ["jade-7", "sword-7", "pagoda-7", "jade-5", "sword-5"],
        response: ["jade-8", "sword-8", "star-8", "jade-6", "sword-6"],
        kind: "full-house"
      },
      {
        label: "straight",
        lead: ["jade-4", "sword-5", "pagoda-6", "star-7", "jade-8"],
        response: ["jade-5", "sword-6", "pagoda-7", "star-8", "jade-9"],
        kind: "straight"
      },
      {
        label: "pair sequence",
        lead: ["jade-4", "sword-4", "jade-5", "sword-5"],
        response: ["pagoda-5", "star-5", "pagoda-6", "star-6"],
        kind: "pair-sequence"
      },
      {
        label: "four-kind bomb",
        lead: ["jade-7", "sword-7", "pagoda-7", "star-7"],
        response: ["jade-8", "sword-8", "pagoda-8", "star-8"],
        kind: "bomb-four-kind"
      },
      {
        label: "straight bomb",
        lead: ["jade-4", "jade-5", "jade-6", "jade-7", "jade-8"],
        response: ["sword-5", "sword-6", "sword-7", "sword-8", "sword-9"],
        kind: "bomb-straight"
      }
    ] as const;

    for (const testCase of playableCases) {
      const leadCombination = combo(testCase.lead);
      const state = scenario({
        activeSeat: "seat-1",
        currentTrick: {
          leader: "seat-0",
          currentWinner: "seat-0",
          currentCombination: leadCombination,
          entries: [{ type: "play", seat: "seat-0", combination: leadCombination }],
          passingSeats: []
        },
        hands: {
          "seat-1": cardsFromIds(testCase.response)
        }
      });

      const actions = getLegalActions(state)["seat-1"] ?? [];
      const playAction = actions.find(
        (action) =>
          action.type === "play_cards" &&
          action.combination.kind === testCase.kind &&
          action.cardIds.every((cardId) => testCase.response.includes(cardId)) &&
          action.cardIds.length === testCase.response.length
      );

      expect(actions.length, `${testCase.label} should have legal actions`).toBeGreaterThan(0);
      expect(playAction, `${testCase.label} should produce a legal beating response`).toBeTruthy();
    }

    const passCases = [
      {
        label: "single",
        lead: ["jade-10"],
        hand: ["sword-9"]
      },
      {
        label: "pair",
        lead: ["jade-10", "sword-10"],
        hand: ["pagoda-9", "star-9"]
      },
      {
        label: "trio",
        lead: ["jade-10", "sword-10", "pagoda-10"],
        hand: ["jade-9", "sword-9", "pagoda-9"]
      },
      {
        label: "full house",
        lead: ["jade-10", "sword-10", "pagoda-10", "jade-5", "sword-5"],
        hand: ["jade-9", "sword-9", "pagoda-9", "jade-4", "sword-4"]
      },
      {
        label: "straight",
        lead: ["jade-6", "sword-7", "pagoda-8", "star-9", "jade-10"],
        hand: ["jade-2", "sword-3", "pagoda-4", "star-5", "jade-6"]
      },
      {
        label: "pair sequence",
        lead: ["jade-7", "sword-7", "jade-8", "sword-8"],
        hand: ["pagoda-4", "star-4", "pagoda-5", "star-5"]
      },
      {
        label: "four-kind bomb",
        lead: ["jade-8", "sword-8", "pagoda-8", "star-8"],
        hand: ["jade-7", "sword-7", "pagoda-7", "star-7"]
      },
      {
        label: "straight bomb",
        lead: ["jade-5", "jade-6", "jade-7", "jade-8", "jade-9"],
        hand: ["sword-4", "sword-5", "sword-6", "sword-7", "sword-8"]
      }
    ] as const;

    for (const testCase of passCases) {
      const leadCombination = combo(testCase.lead);
      const state = scenario({
        activeSeat: "seat-1",
        currentTrick: {
          leader: "seat-0",
          currentWinner: "seat-0",
          currentCombination: leadCombination,
          entries: [{ type: "play", seat: "seat-0", combination: leadCombination }],
          passingSeats: []
        },
        hands: {
          "seat-1": cardsFromIds(testCase.hand)
        }
      });

      const actions = getLegalActions(state)["seat-1"] ?? [];

      expect(actions.length, `${testCase.label} should never deadlock`).toBeGreaterThan(0);
      expect(
        actions.some((action) => action.type === "pass_turn"),
        `${testCase.label} should keep pass legal when no beat exists`
      ).toBe(true);
      expect(
        actions.some((action) => action.type === "play_cards"),
        `${testCase.label} should not invent a beating play`
      ).toBe(false);
    }
  });

  it("advances to the next seat when a straight responder has no legal beat and must pass", () => {
    const straightLead = combo([
      "jade-4",
      "sword-5",
      "pagoda-6",
      "star-7",
      "jade-8"
    ]);
    const state = scenario({
      activeSeat: "seat-3",
      currentTrick: {
        leader: "seat-2",
        currentWinner: "seat-2",
        currentCombination: straightLead,
        entries: [{ type: "play", seat: "seat-2", combination: straightLead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["jade-2"]),
        "seat-1": cardsFromIds(["sword-2"]),
        "seat-2": cardsFromIds(["star-2"]),
        "seat-3": cardsFromIds([
          "jade-8",
          "sword-9",
          "pagoda-10",
          "star-11",
          "jade-13"
        ])
      }
    });

    const actions = getLegalActions(state)["seat-3"] ?? [];
    expect(actions.some((action) => action.type === "pass_turn")).toBe(true);
    expect(actions.some((action) => action.type === "play_cards")).toBe(false);

    const result = applyEngineAction(state, { type: "pass_turn", seat: "seat-3" });
    expect(result.nextState.activeSeat).toBe("seat-0");
    expect(result.nextState.currentTrick?.entries.at(-1)).toEqual({
      type: "pass",
      seat: "seat-3"
    });
  });

  it("keeps a higher straight response legal and advances turn order after the play", () => {
    const straightLead = combo([
      "jade-3",
      "sword-4",
      "pagoda-5",
      "star-6",
      "jade-7"
    ]);
    const state = scenario({
      activeSeat: "seat-3",
      currentTrick: {
        leader: "seat-2",
        currentWinner: "seat-2",
        currentCombination: straightLead,
        entries: [{ type: "play", seat: "seat-2", combination: straightLead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["jade-2"]),
        "seat-1": cardsFromIds(["sword-2"]),
        "seat-2": cardsFromIds(["star-2"]),
        "seat-3": cardsFromIds([
          "jade-8",
          "sword-9",
          "pagoda-10",
          "star-11",
          "jade-12"
        ])
      }
    });

    const actions = getLegalActions(state)["seat-3"] ?? [];
    const response = actions.find(
      (action) =>
        action.type === "play_cards" &&
        action.combination.kind === "straight"
    );
    expect(response).toBeTruthy();

    const result = applyEngineAction(state, {
      type: "play_cards",
      seat: "seat-3",
      cardIds: ["jade-8", "sword-9", "pagoda-10", "star-11", "jade-12"]
    });
    expect(result.nextState.activeSeat).toBe("seat-0");
    expect(result.nextState.currentTrick?.currentWinner).toBe("seat-3");
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

  it("falls back to the next active seat when the Dog partner is unavailable", () => {
    const state = scenario({
      hands: {
        "seat-0": cardsFromIds(["dog", "jade-4"]),
        "seat-1": cardsFromIds(["jade-6"]),
        "seat-2": [],
        "seat-3": cardsFromIds(["jade-9"])
      },
      finishedOrder: ["seat-2"]
    });

    const result = applyEngineAction(state, {
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["dog"]
    });

    expect(result.nextState.activeSeat).toBe("seat-3");
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
