import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beatsCombination,
  cardsFromIds,
  createScenarioState,
  getCanonicalCardIdsKey,
  getLegalActions,
  listCombinationInterpretations,
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

describe("straight response generation", () => {
  afterEach(() => {
    delete process.env.TICHU_TRACE_STRAIGHT_RESPONSES;
    vi.restoreAllMocks();
  });

  it("keeps the active wish visible in straight-response diagnostics", () => {
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

  it("preserves the exhaustive Phoenix straight-response legal set while deduping", () => {
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

    expect(optimizedKeys).toEqual(buildExhaustiveResponseKeys(state, "seat-1"));
    expect(new Set(optimizedKeys).size).toBe(optimizedKeys.length);
  });
});
