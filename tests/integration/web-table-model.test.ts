import { describe, expect, it } from "vitest";
import {
  type LegalAction,
  cardsFromIds,
  createScenarioState,
  getLegalActions,
  listCombinationInterpretations
} from "@tichuml/engine";
import {
  assignPassCardToDraft,
  areAllExchangeSelectionsSubmitted,
  findMatchingPlayActions,
  getExchangeFlowState,
  getPassTargetSeat,
  getPrimaryActor,
  getTurnActions,
  isExchangePhase,
  LOCAL_SEAT,
  removePassCardFromDraft,
  shouldAllowAiEndgameContinuation,
  sortCardsForHand,
  validateExchangeDraft,
  type PlayLegalAction
} from "../../apps/web/src/table-model";
import {
  createNextDealCarryState,
  isMandatoryOpeningLead,
  shouldPauseForLocalOptionalAction
} from "../../apps/web/src/App";

function isPlayLegalAction(action: LegalAction): action is PlayLegalAction {
  return action.type === "play_cards";
}

function combo(cardIds: string[], current: ReturnType<typeof listCombinationInterpretations>[number] | null = null) {
  const result = listCombinationInterpretations(cardsFromIds(cardIds), current ?? null)[0];
  if (!result) {
    throw new Error(`No combination found for ${cardIds.join(",")}`);
  }

  return result;
}

describe("table model helpers", () => {
  it("keeps the active seat as the primary actor even when a local bomb is available", () => {
    const currentCombination = listCombinationInterpretations(
      cardsFromIds(["jade-9"]),
      null
    )[0]!;
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

    const playActions = (getLegalActions(state)["seat-0"] ?? []).filter(
      isPlayLegalAction
    );

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

    const playActions = (getLegalActions(state)["seat-0"] ?? []).filter(
      isPlayLegalAction
    );
    const sorted = sortCardsForHand(
      state.hands["seat-0"],
      "combo",
      playActions
    );

    expect(
      sorted
        .slice(0, 2)
        .map((card) => card.id)
        .sort()
    ).toEqual(["jade-7", "sword-7"]);
  });

  it("keeps AI continuation live when a non-local seat reaches one card", () => {
    const currentCombination = listCombinationInterpretations(
      cardsFromIds(["jade-9"]),
      null
    )[0]!;
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
    expect(
      (legalActions["seat-0"] ?? []).some(
        (action) => action.type === "play_cards"
      )
    ).toBe(true);
    expect(shouldAllowAiEndgameContinuation(state, primaryActor)).toBe(true);
  });

  it("does not pause an opening AI lead just because local Tichu is still optional", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-2",
      hands: {
        "seat-0": cardsFromIds(["jade-7", "sword-9"]),
        "seat-1": cardsFromIds(["jade-3"]),
        "seat-2": cardsFromIds(["mahjong", "jade-10"]),
        "seat-3": cardsFromIds(["sword-4"])
      },
      currentTrick: null
    });

    const legalActions = getLegalActions(state);
    const primaryActor = getPrimaryActor(state, legalActions);
    const localHasOptionalAction = (legalActions[LOCAL_SEAT] ?? []).some(
      (action) => action.type === "call_tichu"
    );

    expect(primaryActor).toBe("seat-2");
    expect(localHasOptionalAction).toBe(true);
    expect(isMandatoryOpeningLead(state, primaryActor)).toBe(true);
    expect(
      shouldPauseForLocalOptionalAction({
        autoplayLocal: false,
        localHasOptionalAction,
        forceAiEndgameContinuation: false,
        openingLeadPending: true
      })
    ).toBe(false);
  });

  it("keeps exchange helpers aligned with the lane and phase rules", () => {
    const state = createScenarioState({
      phase: "pass_select",
      hands: {
        "seat-0": cardsFromIds(["jade-2", "jade-3", "jade-4", "mahjong"]),
        "seat-1": cardsFromIds(["sword-2", "sword-3", "sword-4", "dragon"]),
        "seat-2": cardsFromIds(["pagoda-2", "pagoda-3", "pagoda-4", "phoenix"]),
        "seat-3": cardsFromIds(["star-2", "star-3", "star-4", "jade-14"])
      },
      passSelections: {
        "seat-0": {
          left: "jade-2",
          partner: "jade-3",
          right: "jade-4"
        }
      }
    });

    expect(isExchangePhase(state.phase)).toBe(true);
    expect(getExchangeFlowState(state)).toBe("exchange_waiting_for_ai");
    expect(areAllExchangeSelectionsSubmitted(state)).toBe(false);
    expect(getPassTargetSeat("seat-0", "left")).toBe("seat-3");
    expect(getPassTargetSeat("seat-0", "partner")).toBe("seat-2");
    expect(getPassTargetSeat("seat-0", "right")).toBe("seat-1");
    expect(
      validateExchangeDraft(
        {
          left: "jade-2",
          partner: "jade-3",
          right: "jade-2"
        },
        ["jade-2", "jade-3", "jade-4"]
      ).isValid
    ).toBe(false);
  });

  it("does not pause AI exchange automation just because local Tichu remains optional", () => {
    expect(
      shouldPauseForLocalOptionalAction({
        autoplayLocal: false,
        localHasOptionalAction: true,
        forceAiEndgameContinuation: false,
        openingLeadPending: false,
        exchangePhaseActive: true
      })
    ).toBe(false);
  });

  it("enables Pass when the local seat cannot beat an active straight", () => {
    const straightLead = combo([
      "jade-4",
      "sword-5",
      "pagoda-6",
      "star-7",
      "jade-8"
    ]);
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: LOCAL_SEAT,
      currentTrick: {
        leader: "seat-3",
        currentWinner: "seat-3",
        currentCombination: straightLead,
        entries: [{ type: "play", seat: "seat-3", combination: straightLead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["jade-3", "sword-3", "pagoda-10", "dragon"]),
        "seat-1": cardsFromIds(["jade-11"]),
        "seat-2": cardsFromIds(["sword-12"]),
        "seat-3": cardsFromIds(["star-13"])
      }
    });

    const turnActions = getTurnActions({
      state,
      legalActions: getLegalActions(state),
      seat: LOCAL_SEAT,
      selectedCardIds: []
    });

    expect(turnActions.hasActiveTrick).toBe(true);
    expect(turnActions.leadCombinationKind).toBe("straight");
    expect(turnActions.canPlay).toBe(false);
    expect(turnActions.canPass).toBe(true);
    expect(turnActions.isTichuOnlyDeadlock).toBe(false);
  });

  it("enables Play when the local seat selects a legal straight response", () => {
    const straightLead = combo([
      "jade-4",
      "sword-5",
      "pagoda-6",
      "star-7",
      "jade-8"
    ]);
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: LOCAL_SEAT,
      currentTrick: {
        leader: "seat-3",
        currentWinner: "seat-3",
        currentCombination: straightLead,
        entries: [{ type: "play", seat: "seat-3", combination: straightLead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds([
          "jade-5",
          "sword-6",
          "pagoda-7",
          "star-8",
          "jade-9",
          "dragon"
        ]),
        "seat-1": cardsFromIds(["jade-11"]),
        "seat-2": cardsFromIds(["sword-12"]),
        "seat-3": cardsFromIds(["star-13"])
      }
    });

    const turnActions = getTurnActions({
      state,
      legalActions: getLegalActions(state),
      seat: LOCAL_SEAT,
      selectedCardIds: [
        "jade-5",
        "sword-6",
        "pagoda-7",
        "star-8",
        "jade-9"
      ]
    });

    expect(turnActions.leadCombinationKind).toBe("straight");
    expect(turnActions.canPlay).toBe(true);
    expect(turnActions.canPass).toBe(true);
  });

  it("never makes Tichu the only progression action during an active response turn", () => {
    const straightLead = combo([
      "jade-4",
      "sword-5",
      "pagoda-6",
      "star-7",
      "jade-8"
    ]);
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: LOCAL_SEAT,
      currentTrick: {
        leader: "seat-3",
        currentWinner: "seat-3",
        currentCombination: straightLead,
        entries: [{ type: "play", seat: "seat-3", combination: straightLead }],
        passingSeats: []
      },
      calls: {
        "seat-0": {
          grandTichu: false,
          smallTichu: false,
          hasPlayedFirstCard: false
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
      },
      hands: {
        "seat-0": cardsFromIds(["jade-3", "sword-3", "pagoda-10", "dragon"]),
        "seat-1": cardsFromIds(["jade-11"]),
        "seat-2": cardsFromIds(["sword-12"]),
        "seat-3": cardsFromIds(["star-13"])
      }
    });

    const turnActions = getTurnActions({
      state,
      legalActions: getLegalActions(state),
      seat: LOCAL_SEAT,
      selectedCardIds: []
    });

    expect(turnActions.canCallTichu).toBe(true);
    expect(turnActions.canPlay).toBe(false);
    expect(turnActions.canPass).toBe(true);
    expect(turnActions.isTichuOnlyDeadlock).toBe(false);
  });

  it("matches legal responses across all combo families regardless of selection order", () => {
    const cases = [
      {
        label: "single",
        lead: ["jade-9"],
        response: ["sword-10"],
        kind: "single"
      },
      {
        label: "pair",
        lead: ["jade-7", "sword-7"],
        response: ["star-8", "pagoda-8"],
        kind: "pair"
      },
      {
        label: "trio",
        lead: ["jade-7", "sword-7", "pagoda-7"],
        response: ["star-8", "jade-8", "sword-8"],
        kind: "trio"
      },
      {
        label: "full house",
        lead: ["jade-7", "sword-7", "pagoda-7", "jade-5", "sword-5"],
        response: ["star-8", "jade-8", "sword-8", "jade-6", "sword-6"],
        kind: "full-house"
      },
      {
        label: "straight",
        lead: ["jade-4", "sword-5", "pagoda-6", "star-7", "jade-8"],
        response: ["jade-9", "star-8", "pagoda-7", "sword-6", "jade-5"],
        kind: "straight"
      },
      {
        label: "pair sequence",
        lead: ["jade-4", "sword-4", "jade-5", "sword-5"],
        response: ["star-6", "pagoda-6", "star-5", "pagoda-5"],
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
        response: ["sword-9", "sword-8", "sword-7", "sword-6", "sword-5"],
        kind: "bomb-straight"
      }
    ] as const;

    for (const testCase of cases) {
      const leadCombination = combo(testCase.lead);
      const selectedCardIds = [...testCase.response].reverse();
      const state = createScenarioState({
        phase: "trick_play",
        activeSeat: LOCAL_SEAT,
        currentTrick: {
          leader: "seat-3",
          currentWinner: "seat-3",
          currentCombination: leadCombination,
          entries: [
            { type: "play", seat: "seat-3", combination: leadCombination }
          ],
          passingSeats: []
        },
        hands: {
          "seat-0": cardsFromIds(testCase.response),
          "seat-1": cardsFromIds(["jade-11"]),
          "seat-2": cardsFromIds(["sword-12"]),
          "seat-3": cardsFromIds(["star-13"])
        }
      });

      const legalActions = getLegalActions(state);
      const playActions = (legalActions[LOCAL_SEAT] ?? []).filter(isPlayLegalAction);
      const matches = findMatchingPlayActions(playActions, selectedCardIds);
      const turnActions = getTurnActions({
        state,
        legalActions,
        seat: LOCAL_SEAT,
        selectedCardIds
      });

      expect(matches, `${testCase.label} should match a legal response`).toHaveLength(1);
      expect(matches[0]?.combination.kind).toBe(testCase.kind);
      expect(turnActions.canPlay, `${testCase.label} should enable Play`).toBe(true);
      expect(turnActions.isTichuOnlyDeadlock).toBe(false);
    }
  });

  it("keeps Pass available when no legal response exists across all combo families", () => {
    const cases = [
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

    for (const testCase of cases) {
      const leadCombination = combo(testCase.lead);
      const state = createScenarioState({
        phase: "trick_play",
        activeSeat: LOCAL_SEAT,
        currentTrick: {
          leader: "seat-3",
          currentWinner: "seat-3",
          currentCombination: leadCombination,
          entries: [
            { type: "play", seat: "seat-3", combination: leadCombination }
          ],
          passingSeats: []
        },
        hands: {
          "seat-0": cardsFromIds(testCase.hand),
          "seat-1": cardsFromIds(["jade-11"]),
          "seat-2": cardsFromIds(["sword-12"]),
          "seat-3": cardsFromIds(["star-13"])
        }
      });

      const turnActions = getTurnActions({
        state,
        legalActions: getLegalActions(state),
        seat: LOCAL_SEAT,
        selectedCardIds: []
      });

      expect(turnActions.canPlay, `${testCase.label} should not enable Play`).toBe(false);
      expect(turnActions.canPass, `${testCase.label} should keep Pass available`).toBe(true);
      expect(turnActions.isTichuOnlyDeadlock).toBe(false);
    }
  });

  it("falls back to normal legality when a wish cannot be satisfied and still enables Pass", () => {
    const straightLead = combo([
      "jade-4",
      "sword-5",
      "pagoda-6",
      "star-7",
      "jade-8"
    ]);
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: LOCAL_SEAT,
      currentWish: 10,
      currentTrick: {
        leader: "seat-3",
        currentWinner: "seat-3",
        currentCombination: straightLead,
        entries: [{ type: "play", seat: "seat-3", combination: straightLead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["jade-3", "sword-3", "pagoda-9", "dragon"]),
        "seat-1": cardsFromIds(["jade-11"]),
        "seat-2": cardsFromIds(["sword-12"]),
        "seat-3": cardsFromIds(["star-13"])
      }
    });

    const turnActions = getTurnActions({
      state,
      legalActions: getLegalActions(state),
      seat: LOCAL_SEAT,
      selectedCardIds: []
    });

    expect(turnActions.canPlay).toBe(false);
    expect(turnActions.canPass).toBe(true);
    expect(turnActions.isTichuOnlyDeadlock).toBe(false);
  });

  it("pauses at exchange completion until the local pickup step is acknowledged", () => {
    expect(
      shouldPauseForLocalOptionalAction({
        autoplayLocal: false,
        localHasOptionalAction: false,
        forceAiEndgameContinuation: false,
        openingLeadPending: false,
        pickupPending: true
      })
    ).toBe(true);
  });

  it("supports removing and reassigning staged local pass cards without duplication", () => {
    const initialDraft = {
      left: "jade-2",
      partner: "jade-3",
      right: "jade-4"
    } as const;

    expect(removePassCardFromDraft(initialDraft, "partner")).toEqual({
      left: "jade-2",
      right: "jade-4"
    });

    expect(assignPassCardToDraft(initialDraft, "partner", "jade-4")).toEqual({
      left: "jade-2",
      partner: "jade-4",
      right: "jade-3"
    });
  });

  it("builds next-deal carry state from the finished hand without resetting the match score", () => {
    const carryState = createNextDealCarryState({
      matchComplete: false,
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

    expect(carryState.matchScore).toEqual({
      "team-0": 340,
      "team-1": 220
    });
    expect(carryState.matchHistory).toHaveLength(1);
  });

  it("refuses to create another deal after the match has completed", () => {
    expect(() =>
      createNextDealCarryState({
        matchComplete: true,
        matchScore: { "team-0": 1000, "team-1": 840 },
        matchHistory: []
      })
    ).toThrow("Cannot create another deal after the match is complete.");
  });
});
