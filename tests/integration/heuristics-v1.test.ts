import { describe, expect, it } from "vitest";
import {
  cardsFromIds,
  createScenarioState,
  getLegalActions,
  listCombinationInterpretations,
  type Combination,
  type GameState
} from "@tichuml/engine";
import { heuristicsV1Policy } from "@tichuml/ai-heuristics";

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

describe("milestone 3 heuristics", () => {
  it("calls Grand Tichu with a clearly strong opening hand", () => {
    const state = scenario({
      phase: "grand_tichu_window",
      activeSeat: "seat-0",
      grandTichuQueue: ["seat-0"],
      hands: {
        "seat-0": cardsFromIds([
          "dragon",
          "phoenix",
          "star-14",
          "jade-14",
          "sword-13",
          "pagoda-13",
          "star-12",
          "jade-12"
        ])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({ type: "call_grand_tichu", seat: "seat-0" });
  });

  it("declines Grand Tichu with a weak opening hand", () => {
    const state = scenario({
      phase: "grand_tichu_window",
      activeSeat: "seat-0",
      grandTichuQueue: ["seat-0"],
      hands: {
        "seat-0": cardsFromIds([
          "jade-2",
          "sword-3",
          "pagoda-4",
          "star-5",
          "jade-6",
          "sword-7",
          "pagoda-8",
          "star-9"
        ])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({ type: "decline_grand_tichu", seat: "seat-0" });
  });

  it("avoids overtaking partner when the trick is already safe", () => {
    const partnerLead = combo(["jade-9"]);
    const state = scenario({
      activeSeat: "seat-0",
      currentTrick: {
        leader: "seat-2",
        currentWinner: "seat-2",
        currentCombination: partnerLead,
        entries: [{ type: "play", seat: "seat-2", combination: partnerLead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["jade-10", "sword-4"]),
        "seat-1": cardsFromIds(["jade-3", "jade-5", "jade-7"]),
        "seat-3": cardsFromIds(["sword-6", "pagoda-7", "star-8"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({ type: "pass_turn", seat: "seat-0" });
    expect(chosen.explanation.selectedReasonSummary.some((reason) => reason.includes("partner"))).toBe(true);
  });

  it("still overtakes partner when the play goes out immediately", () => {
    const partnerLead = combo(["jade-9"]);
    const state = scenario({
      activeSeat: "seat-0",
      currentTrick: {
        leader: "seat-2",
        currentWinner: "seat-2",
        currentCombination: partnerLead,
        entries: [{ type: "play", seat: "seat-2", combination: partnerLead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["jade-10"]),
        "seat-1": cardsFromIds(["jade-3", "jade-5", "jade-7"]),
        "seat-3": cardsFromIds(["sword-6", "pagoda-7", "star-8"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({ type: "play_cards", seat: "seat-0", cardIds: ["jade-10"] });
    expect(chosen.explanation.selectedReasonSummary.some((reason) => reason.includes("goes out"))).toBe(true);
  });
});
