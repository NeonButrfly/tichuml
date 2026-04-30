import { describe, expect, it } from "vitest";
import {
  cardsFromIds,
  createScenarioState,
  getCanonicalCardIdsKey,
  getLegalActions,
  listCombinationInterpretations,
  STANDARD_RANKS,
  type GameState
} from "@tichuml/engine";
import {
  buildServerFastPathState,
  chooseServerFastPathDecision,
  generateFastPassSelectCandidates,
  generateFastTrickPlayCandidates,
  SERVER_HEURISTIC_FAST_PATH_LIMITS
} from "@tichuml/ai-heuristics";

function combo(cardIds: string[]) {
  const result = listCombinationInterpretations(cardsFromIds(cardIds), null)[0];
  if (!result) {
    throw new Error(`No combination found for ${cardIds.join(",")}.`);
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

describe("server heuristic fast path", () => {
  it("keeps pass_select candidate generation bounded and preserves specials and bomb anchors by default", () => {
    const state = scenario({
      phase: "pass_select",
      hands: {
        "seat-0": cardsFromIds([
          "dragon",
          "phoenix",
          "dog",
          "mahjong",
          "star-14",
          "jade-14",
          "sword-14",
          "pagoda-14",
          "jade-2",
          "sword-3",
          "pagoda-5",
          "star-7",
          "jade-8",
          "sword-9"
        ]),
        "seat-1": cardsFromIds(["jade-4", "sword-4", "pagoda-4", "star-4"]),
        "seat-2": cardsFromIds(["jade-6", "sword-6", "pagoda-6", "star-6"]),
        "seat-3": cardsFromIds(["jade-10", "sword-10", "pagoda-10", "star-10"])
      }
    });
    const fastState = buildServerFastPathState(state, "seat-0");
    const actorActions = getLegalActions(state)["seat-0"] ?? [];
    const candidates = generateFastPassSelectCandidates({
      state: fastState,
      actor: "seat-0",
      legalActions: actorActions
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(
      SERVER_HEURISTIC_FAST_PATH_LIMITS.pass_select_candidate_cap
    );

    const selected = candidates[0]?.action;
    expect(selected?.type).toBe("select_pass");
    if (!selected || selected.type !== "select_pass") {
      throw new Error("Expected a select_pass fast-path candidate.");
    }

    const passedCardIds = [selected.left, selected.partner, selected.right];
    expect(passedCardIds).not.toEqual(
      expect.arrayContaining([
        "dragon",
        "phoenix",
        "mahjong",
        "star-14",
        "jade-14",
        "sword-14",
        "pagoda-14"
      ])
    );
  });

  it("keeps trick_play candidate generation bounded and prefers the lowest winning response when appropriate", () => {
    const lead = combo(["jade-7"]);
    const state = scenario({
      phase: "trick_play",
      activeSeat: "seat-0",
      currentTrick: {
        leader: "seat-1",
        currentWinner: "seat-1",
        currentCombination: lead,
        entries: [{ type: "play", seat: "seat-1", combination: lead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds(["jade-8", "sword-9", "pagoda-12", "dragon"]),
        "seat-1": cardsFromIds(["jade-3", "sword-4", "pagoda-5"]),
        "seat-2": cardsFromIds(["jade-6", "sword-6", "pagoda-6", "star-6"]),
        "seat-3": cardsFromIds(["jade-10", "sword-10", "pagoda-10"])
      }
    });
    const actorActions = getLegalActions(state)["seat-0"] ?? [];
    const fastState = buildServerFastPathState(state, "seat-0");
    const candidates = generateFastTrickPlayCandidates({
      state: fastState,
      actor: "seat-0",
      legalActions: actorActions
    });
    const chosen = chooseServerFastPathDecision({
      state: fastState,
      actor: "seat-0",
      legalActions: actorActions
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(
      SERVER_HEURISTIC_FAST_PATH_LIMITS.trick_play_candidate_cap
    );
    expect(chosen.action).toEqual({
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["jade-8"]
    });
  });

  it("selects a Mahjong wish rank and strategy metadata on the fast path", () => {
    const state = scenario({
      phase: "trick_play",
      activeSeat: "seat-0",
      hands: {
        "seat-0": cardsFromIds(["mahjong", "jade-7", "sword-11"])
      }
    });
    const fastState = buildServerFastPathState(state, "seat-0");
    const legalActions = [
      {
        type: "play_cards" as const,
        seat: "seat-0" as const,
        cardIds: ["mahjong"],
        combination: combo(["mahjong"]),
        availableWishRanks: [...STANDARD_RANKS]
      }
    ];

    const chosen = chooseServerFastPathDecision({
      state: fastState,
      actor: "seat-0",
      legalActions
    });

    expect(chosen.action.type).toBe("play_cards");
    if (chosen.action.type !== "play_cards") {
      throw new Error("Expected a play_cards fast-path decision.");
    }
    expect(chosen.action.wishRank).toBeDefined();
    expect(chosen.candidates[0]?.mahjongWish).toMatchObject({
      mahjong_played: true,
      mahjong_wish_available: true,
      mahjong_wish_selected: true,
      mahjong_wish_skipped_reason: null
    });
  });

  it("avoids wasteful bombs when a cheap legal win exists", () => {
    const lead = combo(["jade-7"]);
    const state = scenario({
      phase: "trick_play",
      activeSeat: "seat-0",
      currentTrick: {
        leader: "seat-1",
        currentWinner: "seat-1",
        currentCombination: lead,
        entries: [{ type: "play", seat: "seat-1", combination: lead }],
        passingSeats: []
      },
      hands: {
        "seat-0": cardsFromIds([
          "star-8",
          "jade-11",
          "sword-11",
          "pagoda-11",
          "star-11"
        ]),
        "seat-1": cardsFromIds(["jade-3", "sword-4", "pagoda-5"]),
        "seat-2": cardsFromIds(["jade-6", "sword-6", "pagoda-6"]),
        "seat-3": cardsFromIds(["jade-10", "sword-10", "pagoda-10"])
      }
    });
    const actorActions = getLegalActions(state)["seat-0"] ?? [];
    const fastState = buildServerFastPathState(state, "seat-0");
    const chosen = chooseServerFastPathDecision({
      state: fastState,
      actor: "seat-0",
      legalActions: actorActions
    });

    expect(chosen.candidateCount).toBeLessThanOrEqual(
      SERVER_HEURISTIC_FAST_PATH_LIMITS.trick_play_candidate_cap
    );
    expect(chosen.action.type).toBe("play_cards");
    if (chosen.action.type !== "play_cards") {
      throw new Error("Expected a play_cards fast-path decision.");
    }
    expect(getCanonicalCardIdsKey(chosen.action.cardIds)).toBe(
      getCanonicalCardIdsKey(["star-8"])
    );
  });
});
