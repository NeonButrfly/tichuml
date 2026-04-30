import { describe, expect, it } from "vitest";
import {
  applyEngineAction,
  cardsFromIds,
  createScenarioState,
  getCanonicalCardIdsKey,
  getLegalActions,
  listCombinationInterpretations,
  STANDARD_RANKS,
  type Combination,
  type GameState,
  type LegalActionMap,
  type SeatId,
  type StandardRank
} from "@tichuml/engine";
import { describeMahjongWishSkip, heuristicsV1Policy } from "@tichuml/ai-heuristics";

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

function playCandidateByCards(
  chosen: ReturnType<typeof heuristicsV1Policy.chooseAction>,
  cardIds: string[]
) {
  const target = getCanonicalCardIdsKey(cardIds);
  return chosen.explanation.candidateScores.find(
    (candidate) =>
      candidate.action.type === "play_cards" &&
      getCanonicalCardIdsKey(candidate.action.cardIds) === target
  );
}

function mahjongOnlyLegalActions(
  seat: SeatId = "seat-0",
  availableWishRanks: StandardRank[] = [...STANDARD_RANKS]
): LegalActionMap {
  return {
    [seat]: [
      {
        type: "play_cards",
        seat,
        cardIds: ["mahjong"],
        combination: combo(["mahjong"]),
        availableWishRanks
      }
    ]
  } as LegalActionMap;
}

function expectSelectedFeatures(
  chosen: ReturnType<typeof heuristicsV1Policy.chooseAction>
) {
  expect(chosen.explanation.stateFeatures).toBeDefined();
  expect(chosen.explanation.selectedFeatures).toBeDefined();
  return chosen.explanation.selectedFeatures!;
}

describe("heuristics v1", () => {
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

  it("calls Tichu with a high-control pre-play hand", () => {
    const state = scenario({
      phase: "pass_select",
      hands: {
        "seat-0": cardsFromIds([
          "dragon",
          "phoenix",
          "star-14",
          "jade-14",
          "sword-13",
          "pagoda-13",
          "star-12",
          "jade-11",
          "sword-10",
          "pagoda-9",
          "jade-8",
          "sword-7",
          "pagoda-6",
          "star-5"
        ]),
        "seat-1": cardsFromIds(["jade-2", "sword-3", "pagoda-4"]),
        "seat-2": cardsFromIds(["star-2", "jade-3", "sword-4"]),
        "seat-3": cardsFromIds(["pagoda-2", "star-3", "jade-4"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({ type: "call_tichu", seat: "seat-0" });
  });

  it("declines Tichu with a weak fragmented hand", () => {
    const state = scenario({
      phase: "trick_play",
      activeSeat: "seat-0",
      hands: {
        "seat-0": cardsFromIds([
          "jade-2",
          "sword-4",
          "pagoda-6",
          "star-8",
          "jade-10",
          "sword-12",
          "pagoda-3",
          "star-5",
          "jade-7",
          "sword-9",
          "pagoda-11",
          "star-13",
          "jade-4",
          "sword-6"
        ])
      }
    });
    const legalActions: LegalActionMap = {
      "seat-0": [
        { type: "call_tichu", seat: "seat-0" },
        { type: "pass_turn", seat: "seat-0" }
      ],
      "seat-1": [],
      "seat-2": [],
      "seat-3": []
    };

    const chosen = heuristicsV1Policy.chooseAction({ state, legalActions });
    const callCandidate = chosen.explanation.candidateScores.find(
      (candidate) => candidate.action.type === "call_tichu"
    );

    expect(chosen.action).toEqual({ type: "pass_turn", seat: "seat-0" });
    expect(callCandidate?.tichuCall).toMatchObject({
      tichu_call_selected: false
    });
    expect(callCandidate?.tichuCall?.tichu_call_risk_flags).toContain(
      "low_control"
    );
  });

  it("declines Tichu with a medium hand that lacks enough exit certainty", () => {
    const state = scenario({
      phase: "trick_play",
      activeSeat: "seat-0",
      hands: {
        "seat-0": cardsFromIds([
          "dragon",
          "star-14",
          "jade-13",
          "sword-11",
          "pagoda-10",
          "jade-9",
          "sword-8",
          "pagoda-7",
          "star-6",
          "jade-5",
          "sword-4",
          "pagoda-3",
          "star-2",
          "dog"
        ])
      }
    });
    const legalActions: LegalActionMap = {
      "seat-0": [
        { type: "call_tichu", seat: "seat-0" },
        { type: "pass_turn", seat: "seat-0" }
      ],
      "seat-1": [],
      "seat-2": [],
      "seat-3": []
    };

    const chosen = heuristicsV1Policy.chooseAction({ state, legalActions });
    const callCandidate = chosen.explanation.candidateScores.find(
      (candidate) => candidate.action.type === "call_tichu"
    );

    expect(chosen.action).toEqual({ type: "pass_turn", seat: "seat-0" });
    expect(callCandidate?.tichuCall).toMatchObject({
      tichu_call_selected: false,
      tichu_call_kind: "regular"
    });
  });

  it("records Tichu score metadata when a strong hand calls", () => {
    const state = scenario({
      phase: "trick_play",
      activeSeat: "seat-0",
      hands: {
        "seat-0": cardsFromIds([
          "dragon",
          "phoenix",
          "star-14",
          "jade-14",
          "sword-13",
          "pagoda-13",
          "star-12",
          "jade-11",
          "sword-10",
          "pagoda-9",
          "jade-8",
          "sword-7",
          "pagoda-6",
          "star-5"
        ])
      }
    });
    const legalActions: LegalActionMap = {
      "seat-0": [
        { type: "call_tichu", seat: "seat-0" },
        { type: "pass_turn", seat: "seat-0" }
      ],
      "seat-1": [],
      "seat-2": [],
      "seat-3": []
    };

    const chosen = heuristicsV1Policy.chooseAction({ state, legalActions });

    expect(chosen.action).toEqual({ type: "call_tichu", seat: "seat-0" });
    expect(chosen.explanation.selectedTichuCall).toMatchObject({
      tichu_call_kind: "regular",
      tichu_call_selected: true
    });
    expect(chosen.explanation.selectedTichuCall?.tichu_call_score).toBeGreaterThan(
      chosen.explanation.selectedTichuCall?.tichu_call_threshold ?? Number.POSITIVE_INFINITY
    );
    expect(chosen.explanation.selectedTichuCall?.tichu_call_risk_flags).toEqual(
      expect.any(Array)
    );
    expect(chosen.explanation.selectedTichuCall?.hand_quality_score).toEqual(
      expect.any(Number)
    );
  });

  it("refuses to call Tichu when the partner already called Grand Tichu", () => {
    const state = scenario({
      phase: "trick_play",
      activeSeat: "seat-0",
      calls: {
        "seat-0": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-1": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-2": { grandTichu: true, smallTichu: false, hasPlayedFirstCard: false },
        "seat-3": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false }
      },
      hands: {
        "seat-0": cardsFromIds(["dragon", "phoenix", "star-14"])
      }
    });
    const legalActions: LegalActionMap = {
      "seat-0": [
        { type: "call_tichu", seat: "seat-0" },
        { type: "pass_turn", seat: "seat-0" }
      ],
      "seat-1": [],
      "seat-2": [],
      "seat-3": []
    };

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions
    });
    const blockedCall = chosen.explanation.candidateScores.find(
      (candidate) => candidate.action.type === "call_tichu"
    );

    expect(chosen.action).toEqual({ type: "pass_turn", seat: "seat-0" });
    expect(blockedCall?.reasons).toContain(
      "partner already holds the team Tichu call slot"
    );
  });

  it("chooses a deterministic Mahjong wish when available ranks exist", () => {
    const state = scenario({
      phase: "trick_play",
      activeSeat: "seat-0",
      hands: {
        "seat-0": cardsFromIds(["mahjong", "jade-6", "sword-10"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: mahjongOnlyLegalActions()
    });

    expect(chosen.action).toMatchObject({
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["mahjong"]
    });
    if (chosen.action.type !== "play_cards") {
      throw new Error("Expected Mahjong play.");
    }
    expect(chosen.action.wishRank).toBeDefined();
    expect(STANDARD_RANKS).toContain(chosen.action.wishRank);
    expect(chosen.explanation.selectedMahjongWish).toMatchObject({
      mahjong_played: true,
      mahjong_wish_available: true,
      mahjong_wish_selected: true,
      mahjong_wish_skipped_reason: null
    });
  });

  it("reports a stable reason if a no-wish Mahjong variant is selected", () => {
    const state = scenario({
      phase: "trick_play",
      activeSeat: "seat-0",
      hands: {
        "seat-0": cardsFromIds(["mahjong"])
      }
    });

    expect(describeMahjongWishSkip(state, "seat-0", [8])).toMatchObject({
      mahjong_played: true,
      mahjong_wish_available: true,
      mahjong_wish_selected: false,
      mahjong_wish_skipped_reason: "rules_variant_allows_no_wish",
      wish_reason: "skipped"
    });
  });

  it("uses pass memory to wish a known rank passed to an opponent", () => {
    const state = scenario({
      phase: "trick_play",
      activeSeat: "seat-0",
      revealedPasses: {
        "seat-0": {
          left: "jade-9",
          partner: "sword-4",
          right: "pagoda-5"
        }
      },
      hands: {
        "seat-0": cardsFromIds(["mahjong", "jade-6", "sword-10"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: mahjongOnlyLegalActions()
    });

    expect(chosen.action.type).toBe("play_cards");
    if (chosen.action.type !== "play_cards") {
      throw new Error("Expected Mahjong play.");
    }
    expect(chosen.action.wishRank).toBe(9);
    expect(chosen.explanation.selectedMahjongWish).toMatchObject({
      wish_reason: "passed_to_left",
      wish_target_seat: "seat-3",
      wish_rank_source_card_id: "jade-9",
      wish_rank_source_target: "left"
    });
  });

  it("can support partner tempo with a rank passed to a Tichu partner", () => {
    const state = scenario({
      phase: "trick_play",
      activeSeat: "seat-0",
      calls: {
        "seat-0": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-1": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-2": { grandTichu: false, smallTichu: true, hasPlayedFirstCard: false },
        "seat-3": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false }
      },
      revealedPasses: {
        "seat-0": {
          left: "jade-3",
          partner: "sword-6",
          right: "pagoda-4"
        }
      },
      hands: {
        "seat-0": cardsFromIds(["mahjong", "jade-12", "sword-13"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: mahjongOnlyLegalActions()
    });

    expect(chosen.action.type).toBe("play_cards");
    if (chosen.action.type !== "play_cards") {
      throw new Error("Expected Mahjong play.");
    }
    expect(chosen.action.wishRank).toBe(6);
    expect(chosen.explanation.selectedMahjongWish).toMatchObject({
      wish_reason: "support_partner_tichu",
      wish_target_seat: "seat-2",
      wish_rank_source_card_id: "sword-6",
      wish_rank_source_target: "partner",
      wish_considered_tichu_pressure: true
    });
  });

  it("prioritizes passed ranks held by opponent Tichu and Grand Tichu callers", () => {
    const tichuState = scenario({
      phase: "trick_play",
      activeSeat: "seat-0",
      calls: {
        "seat-0": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-1": { grandTichu: false, smallTichu: true, hasPlayedFirstCard: false },
        "seat-2": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-3": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false }
      },
      revealedPasses: {
        "seat-0": {
          left: "jade-3",
          partner: "sword-4",
          right: "jade-10"
        }
      },
      hands: {
        "seat-0": cardsFromIds(["mahjong", "jade-12", "sword-13"])
      }
    });
    const grandState = scenario({
      ...tichuState,
      calls: {
        ...tichuState.calls,
        "seat-1": { grandTichu: true, smallTichu: false, hasPlayedFirstCard: false }
      }
    });

    const tichuChosen = heuristicsV1Policy.chooseAction({
      state: tichuState,
      legalActions: mahjongOnlyLegalActions()
    });
    const grandChosen = heuristicsV1Policy.chooseAction({
      state: grandState,
      legalActions: mahjongOnlyLegalActions()
    });

    expect(tichuChosen.action.type).toBe("play_cards");
    expect(grandChosen.action.type).toBe("play_cards");
    if (
      tichuChosen.action.type !== "play_cards" ||
      grandChosen.action.type !== "play_cards"
    ) {
      throw new Error("Expected Mahjong plays.");
    }
    expect(tichuChosen.action.wishRank).toBe(10);
    expect(grandChosen.action.wishRank).toBe(10);
    expect(tichuChosen.explanation.selectedMahjongWish?.wish_reason).toBe(
      "passed_to_tichu_caller"
    );
    expect(grandChosen.explanation.selectedMahjongWish?.wish_reason).toBe(
      "passed_to_grand_tichu_caller"
    );
    expect(
      grandChosen.explanation.selectedMahjongWish
        ?.wish_considered_grand_tichu_pressure
    ).toBe(true);
  });

  it("penalizes low wishes that would feed an opponent Tichu caller", () => {
    const state = scenario({
      phase: "trick_play",
      activeSeat: "seat-0",
      calls: {
        "seat-0": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-1": { grandTichu: false, smallTichu: true, hasPlayedFirstCard: false },
        "seat-2": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-3": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false }
      },
      revealedPasses: {
        "seat-0": {
          left: "jade-3",
          partner: "sword-4",
          right: "jade-2"
        }
      },
      hands: {
        "seat-0": cardsFromIds(["mahjong", "jade-12", "sword-13"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: mahjongOnlyLegalActions()
    });

    expect(chosen.action.type).toBe("play_cards");
    if (chosen.action.type !== "play_cards") {
      throw new Error("Expected Mahjong play.");
    }
    expect(chosen.action.wishRank).not.toBe(2);
    expect(chosen.explanation.selectedMahjongWish?.wish_reason).toBe(
      "sabotage_tichu_caller"
    );
  });

  it("does not pass Dragon, Phoenix, or Aces out of a Tichu-viable hand", () => {
    const state = scenario({
      phase: "pass_select",
      calls: {
        "seat-0": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-1": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-2": { grandTichu: false, smallTichu: true, hasPlayedFirstCard: false },
        "seat-3": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false }
      },
      hands: {
        "seat-0": cardsFromIds([
          "dragon",
          "phoenix",
          "star-14",
          "jade-14",
          "sword-13",
          "pagoda-13",
          "dog",
          "jade-2",
          "sword-3",
          "pagoda-6",
          "star-9",
          "jade-10",
          "sword-11",
          "pagoda-12"
        ]),
        "seat-1": cardsFromIds(["jade-5", "sword-5", "pagoda-5"]),
        "seat-2": cardsFromIds(["star-6", "jade-6", "sword-6"]),
        "seat-3": cardsFromIds(["pagoda-7", "star-7", "jade-7"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action.type).toBe("select_pass");
    if (chosen.action.type !== "select_pass") {
      throw new Error("Expected a pass-selection action.");
    }

    const passedCardIds = [
      chosen.action.left,
      chosen.action.partner,
      chosen.action.right
    ];

    expect(passedCardIds).toContain("dog");
    expect(passedCardIds).not.toEqual(
      expect.arrayContaining(["dragon", "phoenix", "star-14", "jade-14"])
    );
    expect(chosen.explanation.selectedTags).toEqual(
      expect.arrayContaining(["GIFT_PARTNER", "DUMP_LOW_IMPACT"])
    );
  });

  it("avoids passing point cards to opponents when junk exists", () => {
    const state = scenario({
      phase: "pass_select",
      calls: {
        "seat-0": { grandTichu: false, smallTichu: true, hasPlayedFirstCard: false },
        "seat-1": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-2": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-3": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false }
      },
      hands: {
        "seat-0": cardsFromIds([
          "jade-2",
          "sword-3",
          "pagoda-4",
          "star-6",
          "jade-5",
          "sword-10",
          "pagoda-13",
          "star-8",
          "jade-9",
          "sword-11",
          "pagoda-12",
          "star-14",
          "dragon",
          "dog"
        ]),
        "seat-1": cardsFromIds(["jade-7", "sword-8", "pagoda-9"]),
        "seat-2": cardsFromIds(["star-7", "jade-8", "sword-9"]),
        "seat-3": cardsFromIds(["pagoda-7", "star-8", "jade-9"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action.type).toBe("select_pass");
    if (chosen.action.type !== "select_pass") {
      throw new Error("Expected a pass-selection action.");
    }

    expect([chosen.action.left, chosen.action.right]).not.toEqual(
      expect.arrayContaining(["jade-5", "sword-10", "pagoda-13"])
    );
  });

  it("returns the same decision for identical states", () => {
    const state = scenario({
      activeSeat: "seat-0",
      currentTrick: {
        leader: "seat-1",
        currentWinner: "seat-1",
        currentCombination: combo(["jade-8"]),
        entries: [{ type: "play", seat: "seat-1", combination: combo(["jade-8"]) }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["jade-9", "sword-12", "pagoda-5", "star-5"]),
        "seat-1": cardsFromIds(["jade-2"]),
        "seat-2": cardsFromIds(["sword-2"]),
        "seat-3": cardsFromIds(["star-2"])
      }
    });
    const legalActions = getLegalActions(state);

    const first = heuristicsV1Policy.chooseAction({ state, legalActions });
    const second = heuristicsV1Policy.chooseAction({ state, legalActions });

    expect(first.action).toEqual(second.action);
    expect(first.explanation.selectedReasonSummary).toEqual(
      second.explanation.selectedReasonSummary
    );
  });

  it("protects a pair from being broken by a weak single lead when an isolated single exists", () => {
    const state = scenario({
      currentTrick: null,
      hands: {
        "seat-0": cardsFromIds(["jade-3", "sword-3", "pagoda-5", "star-11"]),
        "seat-1": cardsFromIds(["jade-2"]),
        "seat-2": cardsFromIds(["sword-2"]),
        "seat-3": cardsFromIds(["star-2"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action.type).toBe("play_cards");
    if (chosen.action.type !== "play_cards") {
      throw new Error("Expected a play action.");
    }

    expect(chosen.action.cardIds).not.toEqual(["jade-3"]);
    expect(chosen.action.cardIds).not.toEqual(["sword-3"]);
    const selectedFeatures = expectSelectedFeatures(chosen);
    expect(selectedFeatures.structure_preservation_score).toBeGreaterThanOrEqual(0);
  });

  it("protects straight potential when a higher isolated single can win instead", () => {
    const lead = combo(["jade-8"]);
    const state = scenario({
      activeSeat: "seat-0",
      calls: {
        "seat-0": { grandTichu: false, smallTichu: true, hasPlayedFirstCard: false },
        "seat-1": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-2": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-3": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false }
      },
      currentTrick: {
        leader: "seat-1",
        currentWinner: "seat-1",
        currentCombination: lead,
        entries: [{ type: "play", seat: "seat-1", combination: lead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds([
          "jade-5",
          "sword-6",
          "pagoda-7",
          "star-8",
          "star-9",
          "jade-12"
        ]),
        "seat-1": cardsFromIds(["sword-2"]),
        "seat-2": cardsFromIds(["pagoda-2"]),
        "seat-3": cardsFromIds(["star-2"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["jade-12"]
    });

    const selectedFeatures = expectSelectedFeatures(chosen);
    const straightBreakCandidate = playCandidateByCards(chosen, ["star-9"]);
    expect(selectedFeatures.future_hand_quality_delta).toBeGreaterThan(0);
    expect(straightBreakCandidate?.features?.structure_preservation_score).toBeLessThan(
      selectedFeatures.structure_preservation_score
    );
  });

  it("chooses a low wish to help a partner Tichu line", () => {
    const state = scenario({
      activeSeat: "seat-0",
      calls: {
        "seat-0": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-1": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-2": { grandTichu: false, smallTichu: true, hasPlayedFirstCard: false },
        "seat-3": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false }
      },
      hands: {
        "seat-0": cardsFromIds(["mahjong", "jade-9", "sword-11", "pagoda-13"]),
        "seat-1": cardsFromIds(["jade-2"]),
        "seat-2": cardsFromIds(["sword-2"]),
        "seat-3": cardsFromIds(["star-2"])
      }
    });
    const legalActions = {
      system: [],
      "seat-0": [
        {
          type: "play_cards",
          seat: "seat-0",
          cardIds: ["mahjong"],
          combination: combo(["mahjong"]),
          availableWishRanks: [...STANDARD_RANKS]
        }
      ],
      "seat-1": [],
      "seat-2": [],
      "seat-3": []
    } satisfies LegalActionMap;

    const chosen = heuristicsV1Policy.chooseAction({ state, legalActions });

    expect(chosen.action).toEqual({
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["mahjong"],
      wishRank: 6
    });
    expect(chosen.explanation.selectedMahjongWish?.wish_reason).toBe(
      "support_partner_tichu"
    );
  });

  it("chooses a high disruptive wish against an opponent Tichu call", () => {
    const state = scenario({
      activeSeat: "seat-0",
      calls: {
        "seat-0": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-1": { grandTichu: false, smallTichu: true, hasPlayedFirstCard: false },
        "seat-2": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-3": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false }
      },
      hands: {
        "seat-0": cardsFromIds(["mahjong", "jade-5", "sword-7", "pagoda-9"]),
        "seat-1": cardsFromIds(["jade-2"]),
        "seat-2": cardsFromIds(["sword-2"]),
        "seat-3": cardsFromIds(["star-2"])
      }
    });
    const legalActions = {
      system: [],
      "seat-0": [
        {
          type: "play_cards",
          seat: "seat-0",
          cardIds: ["mahjong"],
          combination: combo(["mahjong"]),
          availableWishRanks: [...STANDARD_RANKS]
        }
      ],
      "seat-1": [],
      "seat-2": [],
      "seat-3": []
    } satisfies LegalActionMap;

    const chosen = heuristicsV1Policy.chooseAction({ state, legalActions });

    expect(chosen.action).toEqual({
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["mahjong"],
      wishRank: 14
    });
  });

  it("chooses the slower opponent for Dragon gift deterministically", () => {
    const state = scenario({
      activeSeat: "seat-0",
      pendingDragonGift: {
        winner: "seat-0",
        trickCards: cardsFromIds(["dragon"]),
        nextLeader: "seat-2",
        roundEndsAfterGift: false
      },
      hands: {
        "seat-0": cardsFromIds(["jade-2"]),
        "seat-1": cardsFromIds(["sword-3", "pagoda-4", "star-5", "jade-6", "sword-7"]),
        "seat-2": cardsFromIds(["pagoda-8"]),
        "seat-3": cardsFromIds(["star-9", "jade-10"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({
      type: "assign_dragon_trick",
      seat: "seat-0",
      recipient: "seat-1"
    });
    expect(chosen.explanation.selectedTags).toContain("DRAGON_SAFE_TARGET");
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
    expect(chosen.explanation.selectedTags).toContain("YIELD_TO_PARTNER");
    const selectedFeatures = expectSelectedFeatures(chosen);
    expect(selectedFeatures.partner_advantage_estimate).toBeGreaterThan(0);
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

  it("avoids bombing a live Tichu-calling partner when there is no real threat", () => {
    const partnerLead = combo(["jade-9"]);
    const state = scenario({
      activeSeat: "seat-0",
      calls: {
        "seat-0": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-1": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-2": { grandTichu: false, smallTichu: true, hasPlayedFirstCard: true },
        "seat-3": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false }
      },
      currentTrick: {
        leader: "seat-2",
        currentWinner: "seat-2",
        currentCombination: partnerLead,
        entries: [
          { type: "play", seat: "seat-2", combination: partnerLead },
          { type: "pass", seat: "seat-3" }
        ],
        passingSeats: ["seat-3"]
      },
      hands: {
        "seat-0": cardsFromIds(["jade-10", "sword-10", "pagoda-10", "star-10", "jade-3"]),
        "seat-1": cardsFromIds(["jade-8", "sword-5", "pagoda-6", "star-7"]),
        "seat-2": cardsFromIds(["jade-14", "sword-13", "star-12"]),
        "seat-3": cardsFromIds(["sword-4", "pagoda-5"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    const partnerBomb = playCandidateByCards(chosen, ["jade-10", "sword-10", "pagoda-10", "star-10"]);

    expect(chosen.action).toEqual({ type: "pass_turn", seat: "seat-0" });
    expect(chosen.explanation.selectedTags).toEqual(
      expect.arrayContaining(["partner_called_tichu", "partner_tempo_preserved", "partner_control_preserved"])
    );
    expect(partnerBomb?.tags).toEqual(
      expect.arrayContaining(["partner_tichu_interference_candidate", "unjustified_partner_bomb"])
    );
    expect(partnerBomb?.reasons.some((reason) => reason.includes("rejected bomb"))).toBe(true);
  });

  it("allows a justified partner bomb when an opponent is about to go out", () => {
    const partnerLead = combo(["jade-9"]);
    const state = scenario({
      activeSeat: "seat-0",
      calls: {
        "seat-0": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-1": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-2": { grandTichu: false, smallTichu: true, hasPlayedFirstCard: true },
        "seat-3": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false }
      },
      currentTrick: {
        leader: "seat-2",
        currentWinner: "seat-2",
        currentCombination: partnerLead,
        entries: [
          { type: "play", seat: "seat-2", combination: partnerLead },
          { type: "pass", seat: "seat-3" }
        ],
        passingSeats: ["seat-3"]
      },
      hands: {
        "seat-0": cardsFromIds(["jade-10", "sword-10", "pagoda-10", "star-10", "jade-3"]),
        "seat-1": cardsFromIds(["jade-11"]),
        "seat-2": cardsFromIds(["jade-14", "sword-13", "star-12"]),
        "seat-3": cardsFromIds(["sword-4", "pagoda-5"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["jade-10", "sword-10", "pagoda-10", "star-10"]
    });
    expect(chosen.explanation.selectedTags).toEqual(
      expect.arrayContaining([
        "partner_called_tichu",
        "partner_tichu_interference_candidate",
        "opponent_immediate_win_risk",
        "team_salvage_intervention",
        "justified_partner_bomb"
      ])
    );
    expect(chosen.explanation.selectedReasonSummary.some((reason) => reason.includes("allowed bomb"))).toBe(true);
    expect(chosen.explanation.selectedTeamplay?.justifiedPartnerBomb).toBe(true);
  });

  it("allows a team-salvage bomb when partner would lose control anyway", () => {
    const partnerLead = combo(["jade-9"]);
    const state = scenario({
      activeSeat: "seat-3",
      calls: {
        "seat-0": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-1": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        "seat-2": { grandTichu: false, smallTichu: true, hasPlayedFirstCard: true },
        "seat-3": { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false }
      },
      currentTrick: {
        leader: "seat-2",
        currentWinner: "seat-2",
        currentCombination: partnerLead,
        entries: [{ type: "play", seat: "seat-2", combination: partnerLead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["jade-11", "sword-11", "pagoda-11", "star-11", "jade-3"]),
        "seat-1": cardsFromIds(["jade-4", "sword-5", "pagoda-6"]),
        "seat-2": cardsFromIds(["jade-14", "sword-13", "star-12"]),
        "seat-3": cardsFromIds(["jade-10", "pagoda-4"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["jade-11", "sword-11", "pagoda-11", "star-11"]
    });
    expect(chosen.explanation.selectedTags).toEqual(
      expect.arrayContaining([
        "partner_called_tichu",
        "partner_tichu_interference_candidate",
        "partner_cannot_retain_lead",
        "team_control_would_be_lost_without_intervention",
        "team_salvage_intervention",
        "justified_partner_bomb"
      ])
    );
    expect(chosen.explanation.selectedTeamplay?.teamControlWouldBeLostWithoutIntervention).toBe(true);
  });

  it("passes on an active straight when no legal higher straight exists", () => {
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
        "seat-3": cardsFromIds(["jade-8", "sword-9", "pagoda-10", "star-11", "jade-13"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({ type: "pass_turn", seat: "seat-3" });

    const afterPass = applyEngineAction(state, chosen.action);
    expect(afterPass.nextState.activeSeat).toBe("seat-0");
  });

  it("plays a legal higher straight on an active straight response turn", () => {
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
        "seat-3": cardsFromIds(["jade-8", "sword-9", "pagoda-10", "star-11", "jade-12"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({
      type: "play_cards",
      seat: "seat-3",
      cardIds: ["jade-8", "sword-9", "pagoda-10", "star-11", "jade-12"]
    });

    const afterPlay = applyEngineAction(state, chosen.action);
    expect(afterPlay.nextState.activeSeat).toBe("seat-0");
    expect(afterPlay.nextState.currentTrick?.currentWinner).toBe("seat-3");
  });

  it("always resolves an active straight response turn to play or pass", () => {
    const straightLead = combo([
      "jade-5",
      "sword-6",
      "pagoda-7",
      "star-8",
      "jade-9"
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
        "seat-3": cardsFromIds(["jade-11", "sword-12", "pagoda-13", "star-14", "dragon"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(["play_cards", "pass_turn"]).toContain(chosen.action.type);
  });

  it("tags forced wish decisions when a satisfying play exists", () => {
    const lead = combo(["jade-8"]);
    const state = scenario({
      activeSeat: "seat-0",
      currentWish: 12,
      currentTrick: {
        leader: "seat-1",
        currentWinner: "seat-1",
        currentCombination: lead,
        entries: [{ type: "play", seat: "seat-1", combination: lead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["jade-12", "sword-13"]),
        "seat-1": cardsFromIds(["jade-2"]),
        "seat-2": cardsFromIds(["sword-2"]),
        "seat-3": cardsFromIds(["star-2"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["jade-12"]
    });
    expect(chosen.explanation.selectedTags).toEqual(
      expect.arrayContaining(["FORCED_WISH", "CHEAPEST_WIN"])
    );
  });

  it("uses an endgame shedding lead that leaves a cleaner finish", () => {
    const state = scenario({
      currentTrick: null,
      hands: {
        "seat-0": cardsFromIds(["jade-9", "sword-9", "pagoda-5"]),
        "seat-1": cardsFromIds(["jade-2"]),
        "seat-2": cardsFromIds(["sword-2"]),
        "seat-3": cardsFromIds(["star-2"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["jade-9", "sword-9"]
    });
    expect(chosen.explanation.selectedTags).toEqual(
      expect.arrayContaining(["SHED_FOR_FINISH", "ENDGAME_COMMIT"])
    );
    const selectedFeatures = expectSelectedFeatures(chosen);
    expect(selectedFeatures.urgency_mode).toBe("endgame");
    expect(selectedFeatures.dead_singles_reduction).toBeGreaterThanOrEqual(0);
  });

  it("marks opponent near-out urgency in the shared tactical snapshot", () => {
    const lead = combo(["jade-9"]);
    const state = scenario({
      activeSeat: "seat-0",
      currentTrick: {
        leader: "seat-1",
        currentWinner: "seat-1",
        currentCombination: lead,
        entries: [{ type: "play", seat: "seat-1", combination: lead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["jade-10", "sword-12", "pagoda-4", "star-6"]),
        "seat-1": cardsFromIds(["jade-2"]),
        "seat-2": cardsFromIds(["sword-14"]),
        "seat-3": cardsFromIds(["star-2", "star-3"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    const selectedFeatures = expectSelectedFeatures(chosen);
    expect(selectedFeatures.state.urgency_mode).toBe("opponent_near_out");
    expect(selectedFeatures.opponent_threat_estimate).toBeGreaterThan(70);
  });

  it("leads Dog when partner is best positioned to convert initiative", () => {
    const state = scenario({
      currentTrick: null,
      hands: {
        "seat-0": cardsFromIds(["dog", "jade-4", "sword-11"]),
        "seat-1": cardsFromIds(["jade-2", "sword-3", "pagoda-4", "star-5", "jade-6"]),
        "seat-2": cardsFromIds(["sword-12"]),
        "seat-3": cardsFromIds(["star-2", "pagoda-3", "jade-8", "sword-9", "star-10"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["dog"]
    });
    expect(chosen.explanation.selectedTags).toEqual(
      expect.arrayContaining(["DOG_TO_PARTNER", "PARTNER_SUPPORT"])
    );
  });

  it("preserves Phoenix when a standard card can win cleanly", () => {
    const lead = combo(["jade-9"]);
    const state = scenario({
      activeSeat: "seat-0",
      currentTrick: {
        leader: "seat-1",
        currentWinner: "seat-1",
        currentCombination: lead,
        entries: [{ type: "play", seat: "seat-1", combination: lead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["phoenix", "jade-10", "sword-4"]),
        "seat-1": cardsFromIds(["jade-2"]),
        "seat-2": cardsFromIds(["sword-2"]),
        "seat-3": cardsFromIds(["star-2"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["jade-10"]
    });
    expect(chosen.explanation.selectedTags).toContain("PHOENIX_FLEX_PRESERVE");
  });

  it("avoids gifting Dragon to the opponent with the strongest conversion lane", () => {
    const state = scenario({
      activeSeat: "seat-0",
      pendingDragonGift: {
        winner: "seat-0",
        trickCards: cardsFromIds(["dragon"]),
        nextLeader: "seat-1",
        roundEndsAfterGift: false
      },
      hands: {
        "seat-0": cardsFromIds(["jade-2"]),
        "seat-1": cardsFromIds(["sword-3", "pagoda-4", "star-5", "jade-6"]),
        "seat-2": cardsFromIds(["pagoda-8"]),
        "seat-3": cardsFromIds(["star-9", "jade-10", "sword-11"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action).toEqual({
      type: "assign_dragon_trick",
      seat: "seat-0",
      recipient: "seat-3"
    });
    expect(chosen.explanation.selectedTags).toEqual(
      expect.arrayContaining(["DRAGON_GIFT_LOWEST_THREAT", "DRAGON_SAFE_TARGET"])
    );
  });

  it("preserves a straight core during passing when clean dumps exist", () => {
    const state = scenario({
      phase: "pass_select",
      hands: {
        "seat-0": cardsFromIds([
          "jade-3",
          "sword-4",
          "pagoda-5",
          "star-6",
          "jade-7",
          "sword-11",
          "pagoda-12",
          "dog",
          "star-14",
          "jade-9",
          "sword-9",
          "pagoda-10",
          "star-13",
          "jade-2"
        ]),
        "seat-1": cardsFromIds(["jade-8", "sword-8", "pagoda-8"]),
        "seat-2": cardsFromIds(["star-3", "jade-4", "sword-5"]),
        "seat-3": cardsFromIds(["pagoda-6", "star-7", "jade-11"])
      }
    });

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: getLegalActions(state)
    });

    expect(chosen.action.type).toBe("select_pass");
    if (chosen.action.type !== "select_pass") {
      throw new Error("Expected a pass-selection action.");
    }

    expect([chosen.action.left, chosen.action.partner, chosen.action.right]).not.toEqual(
      expect.arrayContaining(["jade-3", "sword-4", "pagoda-5", "star-6", "jade-7"])
    );
    expect(chosen.explanation.selectedTags).toEqual(
      expect.arrayContaining(["PASS_GIFT_PARTNER", "PASS_DUMP_LOW_IMPACT"])
    );
  });
});
