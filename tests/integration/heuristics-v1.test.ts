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

function playCandidateByCards(
  chosen: ReturnType<typeof heuristicsV1Policy.chooseAction>,
  cardIds: string[]
) {
  const target = [...cardIds].sort().join(",");
  return chosen.explanation.candidateScores.find(
    (candidate) =>
      candidate.action.type === "play_cards" && [...candidate.action.cardIds].sort().join(",") === target
  );
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
      cardIds: ["jade-10", "pagoda-10", "star-10", "sword-10"]
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
      cardIds: ["jade-11", "pagoda-11", "star-11", "sword-11"]
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
});
