import { describe, expect, it } from "vitest";
import {
  type LegalAction,
  cardsFromIds,
  createScenarioState,
  getLegalActions,
  listCombinationInterpretations
} from "@tichuml/engine";
import {
  findMatchingPlayActions,
  getPrimaryActor,
  shouldAllowAiEndgameContinuation,
  sortCardsForHand,
  type PlayLegalAction
} from "../../apps/web/src/table-model";

function isPlayLegalAction(action: LegalAction): action is PlayLegalAction {
  return action.type === "play_cards";
}

describe("milestone 4 table model helpers", () => {
  it("keeps the active seat as the primary actor even when a local bomb is available", () => {
    const currentCombination = listCombinationInterpretations(cardsFromIds(["jade-9"]), null)[0]!;
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-1",
      hands: {
        "seat-0": cardsFromIds(["jade-5", "sword-5", "pagoda-5", "star-5"]),
        "seat-1": cardsFromIds(["jade-10"]),
        "seat-2": cardsFromIds(["jade-2"]),
        "seat-3": cardsFromIds(["sword-3"])
      },
      currentTrick: {
        leader: "seat-3",
        currentWinner: "seat-3",
        currentCombination,
        entries: [
          {
            type: "play",
            seat: "seat-3",
            combination: currentCombination
          }
        ],
        passingSeats: []
      }
    });

    expect(getPrimaryActor(state, getLegalActions(state))).toBe("seat-1");
  });

  it("advances pass selection to the next unresolved seat", () => {
    const state = createScenarioState({
      phase: "pass_select",
      activeSeat: null,
      hands: {
        "seat-0": cardsFromIds(["jade-2", "jade-3", "jade-4"]),
        "seat-1": cardsFromIds(["sword-2", "sword-3", "sword-4"]),
        "seat-2": cardsFromIds(["pagoda-2", "pagoda-3", "pagoda-4"]),
        "seat-3": cardsFromIds(["star-2", "star-3", "star-4"])
      },
      passSelections: {
        "seat-0": {
          left: "jade-2",
          partner: "jade-3",
          right: "jade-4"
        }
      }
    });

    expect(getPrimaryActor(state, getLegalActions(state))).toBe("seat-1");
  });

  it("matches selected play actions regardless of the selected card order", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-0",
      hands: {
        "seat-0": cardsFromIds(["jade-7", "sword-7", "star-9"]),
        "seat-1": [],
        "seat-2": [],
        "seat-3": []
      },
      currentTrick: null
    });

    const playActions = (getLegalActions(state)["seat-0"] ?? []).filter(isPlayLegalAction);

    const matches = findMatchingPlayActions(playActions, ["sword-7", "jade-7"]);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.combination.kind).toBe("pair");
  });

  it("sorts combo mode toward cards that participate in more legal combinations", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-0",
      hands: {
        "seat-0": cardsFromIds(["jade-7", "sword-7", "star-9"]),
        "seat-1": [],
        "seat-2": [],
        "seat-3": []
      },
      currentTrick: null
    });

    const playActions = (getLegalActions(state)["seat-0"] ?? []).filter(isPlayLegalAction);
    const sorted = sortCardsForHand(state.hands["seat-0"], "combo", playActions);

    expect(sorted.slice(0, 2).map((card) => card.id).sort()).toEqual(["jade-7", "sword-7"]);
  });

  it("keeps AI continuation live when a non-local seat reaches one card", () => {
    const currentCombination = listCombinationInterpretations(cardsFromIds(["jade-9"]), null)[0]!;
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-1",
      hands: {
        "seat-0": cardsFromIds(["jade-11", "sword-11", "pagoda-11", "star-11"]),
        "seat-1": cardsFromIds(["jade-10"]),
        "seat-2": cardsFromIds(["jade-6", "sword-6"]),
        "seat-3": cardsFromIds(["jade-4", "sword-4"])
      },
      currentTrick: {
        leader: "seat-3",
        currentWinner: "seat-3",
        currentCombination,
        entries: [
          {
            type: "play",
            seat: "seat-3",
            combination: currentCombination
          }
        ],
        passingSeats: []
      }
    });

    const legalActions = getLegalActions(state);
    const primaryActor = getPrimaryActor(state, legalActions);

    expect(primaryActor).toBe("seat-1");
    expect((legalActions["seat-0"] ?? []).some((action) => action.type === "play_cards")).toBe(true);
    expect(shouldAllowAiEndgameContinuation(state, primaryActor)).toBe(true);
  });
});
