// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import {
  cardsFromIds,
  createScenarioState,
  listCombinationInterpretations,
  type Card,
  type PublicDerivedState,
  type TrickEntry
} from "@tichuml/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NORMAL_TABLE_LAYOUT,
  TableSurface,
  getDisplayedTrickPoints,
  getNormalCenterZoneClassName,
  type SeatPlayView
} from "../../apps/web/src/game-table-views";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

function createDerived(
  state: ReturnType<typeof createScenarioState>
): PublicDerivedState {
  return {
    phase: state.phase,
    activeSeat: state.activeSeat,
    handCounts: {
      "seat-0": state.hands["seat-0"].length,
      "seat-1": state.hands["seat-1"].length,
      "seat-2": state.hands["seat-2"].length,
      "seat-3": state.hands["seat-3"].length
    },
    currentWish: state.currentWish,
    calls: state.calls,
    finishedOrder: state.finishedOrder,
    currentTrick: state.currentTrick,
    matchScore: state.matchScore,
    matchComplete: state.matchComplete,
    matchWinner: state.matchWinner,
    pendingDragonGift: state.pendingDragonGift,
    roundSummary: state.roundSummary
  };
}

function buildCardLookup(cards: readonly Card[]) {
  return new Map(cards.map((card) => [card.id, card] as const));
}

function createSeatRelativePlays(
  entries: readonly TrickEntry[]
): SeatPlayView[] {
  return [
    { seat: "seat-0", position: "bottom", label: "South", plays: [] },
    { seat: "seat-1", position: "right", label: "East", plays: [] },
    { seat: "seat-2", position: "top", label: "North", plays: [] },
    { seat: "seat-3", position: "left", label: "West", plays: [] }
  ].map((view) => ({
    ...view,
    plays: entries.filter(
      (entry): entry is Extract<TrickEntry, { type: "play" }> =>
        entry.type === "play" && entry.seat === view.seat
    )
  }));
}

function combo(cardIds: string[]) {
  const result = listCombinationInterpretations(cardsFromIds(cardIds), null)[0];
  if (!result) {
    throw new Error(`No combination found for ${cardIds.join(",")}`);
  }

  return result;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("trick UI cleanup", () => {
  it("computes trick points from the displayed play cards", () => {
    const entries: TrickEntry[] = [
      {
        type: "play",
        seat: "seat-1",
        combination: combo(["jade-5"])
      },
      {
        type: "play",
        seat: "seat-2",
        combination: combo(["jade-10"])
      },
      {
        type: "play",
        seat: "seat-3",
        combination: combo(["jade-13"])
      },
      {
        type: "play",
        seat: "seat-0",
        combination: combo(["dragon"])
      },
      {
        type: "play",
        seat: "seat-1",
        combination: combo(["phoenix"])
      }
    ];

    expect(getDisplayedTrickPoints(createSeatRelativePlays(entries))).toBe(25);
  });

  it("renders center trick points and no directional trick labels", () => {
    const lead = combo(["jade-10"]);
    const response = combo(["dragon"]);
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-0",
      currentTrick: {
        leader: "seat-1",
        currentWinner: "seat-0",
        currentCombination: response,
        entries: [
          { type: "play", seat: "seat-1", combination: lead },
          { type: "play", seat: "seat-0", combination: response }
        ],
        passingSeats: []
      }
    });
    const seatRelativePlays = createSeatRelativePlays(state.currentTrick?.entries ?? []);
    const trickCards = cardsFromIds(["jade-10", "dragon"]);
    const view = render(
      createElement(TableSurface, {
        variant: "normal",
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        state,
        derived: createDerived(state),
        controlHint: "Play a card",
        displayedTrick: state.currentTrick,
        trickIsResolving: false,
        seatRelativePlays,
        tablePassGroups: [],
        cardLookup: buildCardLookup(trickCards)
      })
    );

    expect(view.container.textContent).toContain("Trick: 35 pts");
    expect(
      view.container.querySelectorAll(".normal-trick-lane__label")
    ).toHaveLength(0);
    expect(
      view.container.querySelectorAll(".table-trick__seat-label")
    ).toHaveLength(0);

    view.unmount();
  });

  it("hides the trick-points badge when no trick is active", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-0",
      currentTrick: null
    });
    const view = render(
      createElement(TableSurface, {
        variant: "normal",
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        state,
        derived: createDerived(state),
        controlHint: "Lead the next trick",
        displayedTrick: null,
        trickIsResolving: false,
        seatRelativePlays: [],
        tablePassGroups: [],
        cardLookup: new Map()
      })
    );

    expect(view.container.textContent).not.toContain("Trick:");
    view.unmount();
  });

  it("keeps play-area shadow editor-only", () => {
    expect(getNormalCenterZoneClassName(false)).toBe("normal-center-zone");
    expect(getNormalCenterZoneClassName(true)).toBe(
      "normal-center-zone normal-center-zone--editor"
    );
  });
});
