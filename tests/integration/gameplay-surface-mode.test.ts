// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { createScenarioState } from "@tichuml/engine";
import { describe, expect, it } from "vitest";
import {
  deriveLocalMustAct,
  deriveSurfacePresentation,
  type SurfacePresentation
} from "../../apps/web/src/gameplay-surface-mode";
import {
  DEFAULT_NORMAL_TABLE_LAYOUT,
  TableSurface
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

function createDerived(state: ReturnType<typeof createScenarioState>) {
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

describe("gameplay surface mode", () => {
  it("marks the local primary actor as must act", () => {
    expect(
      deriveLocalMustAct({
        roundGenerationPending: false,
        autoplayLocal: false,
        localIsPrimaryActor: true,
        pickupPending: false,
        hasLocalPassSelection: false,
        hasLocalDragonRecipientChoice: false
      })
    ).toBe(true);
  });

  it("marks pickup review as must act", () => {
    expect(
      deriveLocalMustAct({
        roundGenerationPending: false,
        autoplayLocal: false,
        localIsPrimaryActor: false,
        pickupPending: true,
        hasLocalPassSelection: false,
        hasLocalDragonRecipientChoice: false
      })
    ).toBe(true);
  });

  it("marks a present pass selection as must act", () => {
    expect(
      deriveLocalMustAct({
        roundGenerationPending: false,
        autoplayLocal: false,
        localIsPrimaryActor: false,
        pickupPending: false,
        hasLocalPassSelection: true,
        hasLocalDragonRecipientChoice: false
      })
    ).toBe(true);
  });

  it("marks a dragon recipient choice as must act", () => {
    expect(
      deriveLocalMustAct({
        roundGenerationPending: false,
        autoplayLocal: false,
        localIsPrimaryActor: false,
        pickupPending: false,
        hasLocalPassSelection: false,
        hasLocalDragonRecipientChoice: true
      })
    ).toBe(true);
  });

  it("suppresses must-act mode during autoplay", () => {
    expect(
      deriveLocalMustAct({
        roundGenerationPending: false,
        autoplayLocal: true,
        localIsPrimaryActor: true,
        pickupPending: true,
        hasLocalPassSelection: true,
        hasLocalDragonRecipientChoice: true
      })
    ).toBe(false);
  });

  it("suppresses must-act mode while round generation is pending", () => {
    expect(
      deriveLocalMustAct({
        roundGenerationPending: true,
        autoplayLocal: false,
        localIsPrimaryActor: true,
        pickupPending: true,
        hasLocalPassSelection: true,
        hasLocalDragonRecipientChoice: true
      })
    ).toBe(false);
  });

  it("uses calm mode when waiting on another seat", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-1"
    });

    expect(
      deriveSurfacePresentation({
        state,
        localMustAct: false,
        wishDialogOpen: false,
        trickIsResolving: false,
        hasResolutionAnimation: false
      })
    ).toMatchObject<Partial<SurfacePresentation>>({
      tableMode: "calm",
      handMode: "immersive",
      controlsVisible: false
    });
  });

  it("switches to decision mode when the local seat must act", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-0"
    });

    expect(
      deriveSurfacePresentation({
        state,
        localMustAct: true,
        wishDialogOpen: false,
        trickIsResolving: false,
        hasResolutionAnimation: false
      })
    ).toMatchObject<Partial<SurfacePresentation>>({
      tableMode: "decision",
      handMode: "simplified",
      controlsVisible: true
    });
  });

  it("stays calm when local state does not become a must-act turn", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-0"
    });

    expect(
      deriveSurfacePresentation({
        state,
        localMustAct: false,
        wishDialogOpen: false,
        trickIsResolving: false,
        hasResolutionAnimation: false
      })
    ).toMatchObject<Partial<SurfacePresentation>>({
      tableMode: "calm",
      handMode: "immersive",
      controlsVisible: false,
      dramaticTurnCue: false
    });
  });

  it("treats pickup review as decision mode because pickup is a required local action", () => {
    const state = createScenarioState({
      phase: "exchange_complete",
      activeSeat: "seat-1"
    });

    expect(
      deriveSurfacePresentation({
        state,
        localMustAct: true,
        wishDialogOpen: false,
        trickIsResolving: false,
        hasResolutionAnimation: false
      })
    ).toMatchObject<Partial<SurfacePresentation>>({
      tableMode: "decision",
      handMode: "simplified",
      controlsVisible: true,
      dramaticTurnCue: true
    });
  });

  it("switches to decision mode when only the wish dialog is open", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-1"
    });

    expect(
      deriveSurfacePresentation({
        state,
        localMustAct: false,
        wishDialogOpen: true,
        trickIsResolving: false,
        hasResolutionAnimation: false
      })
    ).toMatchObject<Partial<SurfacePresentation>>({
      tableMode: "decision",
      handMode: "simplified",
      controlsVisible: true,
      dramaticTurnCue: true
    });
  });

  it("switches to resolution mode from a pending dragon gift alone", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-1",
      pendingDragonGift: {
        winner: "seat-0",
        nextLeader: "seat-1",
        roundEndsAfterGift: false
      }
    });

    expect(
      deriveSurfacePresentation({
        state,
        localMustAct: false,
        wishDialogOpen: false,
        trickIsResolving: false,
        hasResolutionAnimation: false
      })
    ).toMatchObject<Partial<SurfacePresentation>>({
      tableMode: "resolution",
      handMode: "simplified",
      controlsVisible: false,
      dramaticTurnCue: true
    });
  });

  it("switches to resolution mode when trick resolution alone is active", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-1"
    });

    expect(
      deriveSurfacePresentation({
        state,
        localMustAct: false,
        wishDialogOpen: false,
        trickIsResolving: true,
        hasResolutionAnimation: false
      })
    ).toMatchObject<Partial<SurfacePresentation>>({
      tableMode: "resolution",
      handMode: "simplified",
      controlsVisible: false,
      dramaticTurnCue: true
    });
  });

  it("switches to resolution mode when a resolution animation alone is active", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-1"
    });

    expect(
      deriveSurfacePresentation({
        state,
        localMustAct: false,
        wishDialogOpen: false,
        trickIsResolving: false,
        hasResolutionAnimation: true
      })
    ).toMatchObject<Partial<SurfacePresentation>>({
      tableMode: "resolution",
      handMode: "simplified",
      controlsVisible: false,
      dramaticTurnCue: true
    });
  });

  it("keeps resolution precedence over decision mode", () => {
    const state = createScenarioState({
      phase: "exchange_complete",
      activeSeat: "seat-0"
    });

    expect(
      deriveSurfacePresentation({
        state,
        localMustAct: true,
        wishDialogOpen: false,
        trickIsResolving: true,
        hasResolutionAnimation: true
      }).tableMode
    ).toBe("resolution");
  });

  it("uses surfacePresentation to drive normal surface state classes", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-1"
    });
    const derived = createDerived(state);
    const calmView = render(
      createElement(TableSurface, {
        variant: "normal",
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        state,
        derived,
        controlHint: "Waiting",
        surfacePresentation: {
          tableMode: "calm",
          handMode: "immersive",
          controlsVisible: false,
          dramaticTurnCue: false
        },
        displayedTrick: null,
        trickIsResolving: false,
        seatRelativePlays: [],
        tablePassGroups: [],
        cardLookup: new Map()
      })
    );
    const decisionView = render(
      createElement(TableSurface, {
        variant: "normal",
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        state,
        derived,
        controlHint: "Your turn",
        surfacePresentation: {
          tableMode: "decision",
          handMode: "simplified",
          controlsVisible: true,
          dramaticTurnCue: true
        },
        displayedTrick: null,
        trickIsResolving: false,
        seatRelativePlays: [],
        tablePassGroups: [],
        cardLookup: new Map()
      })
    );
    const resolvingView = render(
      createElement(TableSurface, {
        variant: "normal",
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        state,
        derived,
        controlHint: "Resolving",
        surfacePresentation: {
          tableMode: "resolution",
          handMode: "simplified",
          controlsVisible: false,
          dramaticTurnCue: true
        },
        displayedTrick: null,
        trickIsResolving: false,
        seatRelativePlays: [],
        tablePassGroups: [],
        cardLookup: new Map()
      })
    );
    const calmSurface = calmView.container.querySelector(".normal-play-surface");
    const decisionSurface = decisionView.container.querySelector(".normal-play-surface");
    const resolvingSurface =
      resolvingView.container.querySelector(".normal-play-surface");

    expect(calmSurface?.classList.contains("normal-play-surface--mode-calm")).toBe(true);
    expect(
      calmSurface?.classList.contains("normal-play-surface--hand-immersive")
    ).toBe(true);
    expect(
      calmSurface?.classList.contains("normal-play-surface--controls-hidden")
    ).toBe(true);
    expect(
      calmSurface?.classList.contains("normal-play-surface--dramatic-turn")
    ).toBe(false);
    expect(
      calmSurface?.classList.contains("normal-play-surface--resolving")
    ).toBe(false);

    expect(
      decisionSurface?.classList.contains("normal-play-surface--mode-decision")
    ).toBe(true);
    expect(
      decisionSurface?.classList.contains("normal-play-surface--hand-simplified")
    ).toBe(true);
    expect(
      decisionSurface?.classList.contains("normal-play-surface--controls-visible")
    ).toBe(true);
    expect(
      decisionSurface?.classList.contains("normal-play-surface--dramatic-turn")
    ).toBe(true);
    expect(
      decisionSurface?.classList.contains("normal-play-surface--resolving")
    ).toBe(false);

    expect(
      resolvingSurface?.classList.contains("normal-play-surface--mode-resolution")
    ).toBe(true);
    expect(
      resolvingSurface?.classList.contains("normal-play-surface--hand-simplified")
    ).toBe(true);
    expect(
      resolvingSurface?.classList.contains("normal-play-surface--controls-hidden")
    ).toBe(true);
    expect(
      resolvingSurface?.classList.contains("normal-play-surface--dramatic-turn")
    ).toBe(true);
    expect(
      resolvingSurface?.classList.contains("normal-play-surface--resolving")
    ).toBe(true);

    calmView.unmount();
    decisionView.unmount();
    resolvingView.unmount();
  });
});
