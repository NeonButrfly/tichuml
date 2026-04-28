import { describe, expect, it } from "vitest";
import {
  applyEngineAction,
  cardsFromIds,
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

describe("wish state enforcement", () => {
  it("keeps an active Mahjong wish through an actor who cannot fulfill it", () => {
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
  });

  it("forces a later actor who can fulfill the wish and disallows pass", () => {
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

    const afterSeat1Pass = applyEngineAction(state, {
      type: "pass_turn",
      seat: "seat-1"
    });
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
});
