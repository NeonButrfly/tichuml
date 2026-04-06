// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScenarioState, type PublicDerivedState } from "@tichuml/engine";
import {
  MatchScoreboard,
  ScoreHistoryDialogContent
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

function createStateWithHistory() {
  return createScenarioState({
    phase: "finished",
    matchScore: { "team-0": 1000, "team-1": 820 },
    matchComplete: true,
    matchWinner: "team-0",
    matchHistory: [
      {
        handNumber: 1,
        roundSeed: "seed-1",
        teamScores: { "team-0": 300, "team-1": 0 },
        cumulativeScores: { "team-0": 300, "team-1": 0 },
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
      },
      {
        handNumber: 2,
        roundSeed: "seed-2",
        teamScores: { "team-0": 700, "team-1": 820 },
        cumulativeScores: { "team-0": 1000, "team-1": 820 },
        finishOrder: ["seat-2", "seat-0", "seat-1", "seat-3"],
        doubleVictory: null,
        tichuBonuses: [
          {
            seat: "seat-2",
            team: "team-0",
            label: "grand",
            amount: 200
          },
          {
            seat: "seat-1",
            team: "team-1",
            label: "small",
            amount: -100
          }
        ]
      }
    ]
  });
}

function createDerived(state: ReturnType<typeof createStateWithHistory>): PublicDerivedState {
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

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Score history UI", () => {
  it("opens from the clickable score display", () => {
    const state = createStateWithHistory();
    const onOpenHistory = vi.fn();
    const view = render(
      createElement(MatchScoreboard, {
        state,
        derived: createDerived(state),
        onOpenHistory
      })
    );

    const button = view.container.querySelector("button");
    expect(button?.textContent).toContain("NS 1000");
    expect(button?.textContent).toContain("820 EW");

    act(() => {
      button?.click();
    });

    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("renders an empty state before any hands are complete", () => {
    const emptyState = createScenarioState({
      phase: "trick_play"
    });
    const view = render(
      createElement(ScoreHistoryDialogContent, {
        state: emptyState
      })
    );

    expect(view.container.textContent).toContain(
      "No completed hands yet. Finish a hand to populate score history."
    );

    view.unmount();
  });

  it("renders hand history rows with T, GT, and double-out markers", () => {
    const state = createStateWithHistory();
    const view = render(
      createElement(ScoreHistoryDialogContent, {
        state
      })
    );

    expect(view.container.textContent).toContain("Hand 1");
    expect(view.container.textContent).toContain("Hand 2");
    expect(view.container.textContent).toContain("Cumulative 300");
    expect(view.container.textContent).toContain("Cumulative 1000");
    expect(view.container.textContent).toContain("T");
    expect(view.container.textContent).toContain("GT");
    expect(view.container.textContent).toContain("DO");
    expect(view.container.textContent).toContain("NS won the match");

    view.unmount();
  });
});
