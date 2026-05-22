// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { Card } from "@tichuml/engine";
import {
  DEFAULT_NORMAL_TABLE_LAYOUT,
  DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS,
  type GameTableViewProps,
  type SeatView,
  NormalGameTableView
} from "../../apps/web/src/game-table-views";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

class ResizeObserverStub {
  static instances = new Set<ResizeObserverStub>();

  private readonly callback: ResizeObserverCallback;

  private readonly observedElements = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverStub.instances.add(this);
  }

  observe(element: Element) {
    this.observedElements.add(element);
  }

  disconnect() {
    this.observedElements.clear();
    ResizeObserverStub.instances.delete(this);
  }

  unobserve(element: Element) {
    this.observedElements.delete(element);
  }

  static notify(element: Element, rect: Partial<DOMRectReadOnly> = {}) {
    for (const instance of ResizeObserverStub.instances) {
      if (!instance.observedElements.has(element)) {
        continue;
      }

      instance.callback(
        [
          {
            target: element,
            contentRect: {
              x: 0,
              y: 0,
              top: 0,
              right: rect.width ?? 0,
              bottom: rect.height ?? 0,
              left: 0,
              width: rect.width ?? 0,
              height: rect.height ?? 0,
              toJSON: () => ({})
            } as DOMRectReadOnly
          } as ResizeObserverEntry
        ],
        instance as unknown as ResizeObserver
      );
    }
  }
}

globalThis.ResizeObserver =
  ResizeObserverStub as unknown as typeof globalThis.ResizeObserver;

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

function standardCard(id: string, suit: Card["suit"], rank: number): Card {
  return {
    id,
    kind: "standard",
    suit,
    rank
  };
}

function buildSeatView(overrides: Partial<SeatView>): SeatView {
  return {
    seat: "seat-0",
    position: "bottom",
    title: "South",
    relation: "You",
    handCount: 0,
    cards: [],
    callState: {
      grandTichu: false,
      smallTichu: false,
      hasPlayedFirstCard: false
    },
    passReady: false,
    finishIndex: -1,
    isLocalSeat: false,
    isPrimarySeat: false,
    isThinkingSeat: false,
    ...overrides
  };
}

function createWaitingProps(): GameTableViewProps {
  const localCard = standardCard("jade-5", "jade", 5);
  const topCard = standardCard("sword-9", "sword", 9);
  const leftCard = standardCard("pagoda-11", "pagoda", 11);
  const rightCard = standardCard("star-14", "star", 14);
  const seatViews: SeatView[] = [
    buildSeatView({
      seat: "seat-2",
      position: "top",
      title: "North",
      relation: "Partner",
      handCount: 1,
      cards: [topCard]
    }),
    buildSeatView({
      seat: "seat-3",
      position: "left",
      title: "West",
      relation: "Opponent",
      handCount: 1,
      cards: [leftCard]
    }),
    buildSeatView({
      seat: "seat-1",
      position: "right",
      title: "East",
      relation: "Opponent",
      handCount: 1,
      cards: [rightCard],
      isPrimarySeat: true,
      isThinkingSeat: true
    }),
    buildSeatView({
      seat: "seat-0",
      position: "bottom",
      title: "South",
      relation: "You",
      handCount: 1,
      cards: [localCard],
      isLocalSeat: true
    })
  ];

  return {
    roundSeed: "test-seed",
    decisionCount: 0,
    state: {
      phase: "play",
      pendingDragonGift: null,
      roundSummary: null,
      matchComplete: false,
      matchWinner: null,
      matchScore: {
        "team-0": 0,
        "team-1": 0
      },
      matchHistory: []
    } as GameTableViewProps["state"],
    derived: {
      phase: "play",
      currentWish: null,
      matchScore: {
        "team-0": 0,
        "team-1": 0
      },
      currentTrick: null
    } as GameTableViewProps["derived"],
    controlHint: "Waiting for East to act.",
    surfacePresentation: {
      tableMode: "calm",
      handMode: "immersive",
      controlsVisible: false,
      dramaticTurnCue: false
    },
    seatViews,
    seatRelativePlays: [],
    displayedTrick: null,
    trickIsResolving: false,
    pickupStageViews: [],
    dogLeadAnimation: null,
    tablePassGroups: [],
    passRouteViews: [],
    passLaneViews: [],
    sortedLocalHand: [localCard],
    localCanInteract: false,
    localPassInteractionEnabled: false,
    localLegalCardIds: new Set<string>(),
    selectedCardIds: [],
    selectedPassTarget: "left",
    passSelectionReady: false,
    matchingPlayActions: [],
    activePlayVariant: null,
    resolvedWishRank: null,
    wishDialogOpen: false,
    wishSelectionOptions: [],
    wishConfirmDisabled: true,
    wishSubmissionPending: false,
    normalActionRail: [
      {
        id: "pass",
        label: "Pass",
        tone: "secondary",
        enabled: true
      }
    ],
    sortMode: "rank",
    autoplayLocal: false,
    lastAiDecision: null,
    recentEvents: [],
    localActionSummary: [],
    localSummaryText: "Waiting",
    canContinueAi: false,
    localDragonRecipients: [],
    uiMode: "normal",
    normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
    normalTableLayoutTokens: DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS,
    layoutEditorActive: false,
    mainMenuOpen: false,
    activeDialog: null,
    latestEntropyDebug: null,
    backendSettings: {} as GameTableViewProps["backendSettings"],
    backendStatus: {} as GameTableViewProps["backendStatus"],
    masterControlSnapshot: {} as GameTableViewProps["masterControlSnapshot"],
    hotkeyDefinitions: [],
    cardLookup: new Map([
      [localCard.id, localCard],
      [topCard.id, topCard],
      [leftCard.id, leftCard],
      [rightCard.id, rightCard]
    ]),
    onAutoplayChange: () => undefined,
    onContinueAi: () => undefined,
    onSortModeChange: () => undefined,
    onLocalCardClick: () => undefined,
    onPassTargetSelect: () => undefined,
    onPassLaneDrop: () => undefined,
    onPassLaneCardClick: () => undefined,
    onPassLaneCardDragStart: () => undefined,
    onPassLaneCardDragEnd: () => undefined,
    onVariantSelect: () => undefined,
    onWishRankSelect: () => undefined,
    onWishConfirm: () => undefined,
    onWishCancel: () => undefined,
    onDragonRecipientSelect: () => undefined,
    onNormalAction: () => undefined,
    onNormalTableLayoutChange: () => undefined,
    onNormalTableLayoutImport: () => undefined,
    onExportNormalTableLayout: () => undefined,
    onBackendSettingsChange: () => undefined,
    onTestBackend: () => undefined,
    onTestMl: () => undefined,
    onToggleDashboardVerboseMode: () => undefined,
    onToggleDashboardRawJson: () => undefined,
    onToggleFrozenSnapshot: () => undefined,
    onUiCommand: () => undefined,
    onMainMenuOpenChange: () => undefined
  };
}

function createDecisionProps(): GameTableViewProps {
  const props = createWaitingProps();

  return {
    ...props,
    controlHint: "Choose an action.",
    surfacePresentation: {
      tableMode: "decision",
      handMode: "simplified",
      controlsVisible: true,
      dramaticTurnCue: true
    },
    seatViews: props.seatViews.map((seatView) =>
      seatView.seat === "seat-2"
        ? {
            ...seatView,
            callState: {
              ...seatView.callState,
              grandTichu: true
            }
          }
        : seatView
    ),
    localCanInteract: true,
    localLegalCardIds: new Set(props.sortedLocalHand.map((card) => card.id))
  };
}

function createResolutionProps(): GameTableViewProps {
  const props = createWaitingProps();

  return {
    ...props,
    controlHint: "Resolving trick.",
    surfacePresentation: {
      tableMode: "resolution",
      handMode: "simplified",
      controlsVisible: false,
      dramaticTurnCue: true
    }
  };
}

describe("NormalGameTableView", () => {
  it("keeps the local hand positioned on the seat ring and renders calm immersive density while waiting", () => {
    const view = render(
      createElement(NormalGameTableView, createWaitingProps())
    );

    try {
      const table = view.container.querySelector(".player-surface__table");
      expect(table).not.toBeNull();
      expect(table?.classList.contains("player-surface__table--calm")).toBe(true);
      expect(table?.classList.contains("player-surface__hand--immersive")).toBe(true);
      expect(table?.classList.contains("player-surface__table--dramatic-turn")).toBe(false);
      expect(view.container.querySelector(".player-surface__action-band")).toBeNull();
      expect(
        view.container.querySelector(".player-surface__seat-ring > [data-seat-region='bottom']")
      ).not.toBeNull();
      expect(view.container.querySelector(".player-surface__local-hand")).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it("switches to decision density and reveals the action band when controls are exposed", () => {
    const view = render(
      createElement(NormalGameTableView, createDecisionProps())
    );

    try {
      const table = view.container.querySelector(".player-surface__table");
      expect(table).not.toBeNull();
      expect(table?.classList.contains("player-surface__table--decision")).toBe(true);
      expect(table?.classList.contains("player-surface__hand--simplified")).toBe(true);
      expect(table?.classList.contains("player-surface__table--dramatic-turn")).toBe(true);
      expect(view.container.querySelector(".player-surface__action-band")).not.toBeNull();

      const southSafeZone = view.container.querySelector(
        ".player-surface__south-safe-zone[data-south-safe-zone='reserved']"
      );
      expect(southSafeZone).not.toBeNull();
      expect(southSafeZone?.querySelector("[data-seat-region='bottom']")).not.toBeNull();
      expect(
        southSafeZone?.querySelector(".player-surface__action-band")
      ).not.toBeNull();
      expect(
        southSafeZone?.style.getPropertyValue("--player-surface-action-band-footprint")
      ).toBe("");

      const actionBand = southSafeZone?.querySelector(
        ".player-surface__action-band"
      );
      expect(actionBand).not.toBeNull();

      act(() => {
        ResizeObserverStub.notify(actionBand as Element, {
          width: 320,
          height: 96
        });
      });

      expect(
        southSafeZone?.style.getPropertyValue("--player-surface-action-band-footprint")
      ).toBe("96px");
    } finally {
      view.unmount();
    }
  });

  it("mounts the graphics layer behind the live seat ring without replacing the action band or seat overlays", () => {
    const view = render(
      createElement(NormalGameTableView, createDecisionProps())
    );

    try {
      expect(
        view.container.querySelector("[data-table-graphics-layer='true']")
      ).not.toBeNull();
      expect(
        view.container.querySelector(".player-surface__action-band")
      ).not.toBeNull();
      expect(
        view.container.querySelector("[data-seat-identity='seat-0']")
      ).not.toBeNull();
    } finally {
      view.unmount();
    }
  });

  it("renders consistent seat identity badges and seat-associated state markers", () => {
    const view = render(
      createElement(NormalGameTableView, createDecisionProps())
    );

    try {
      const overlayLayer = view.container.querySelector(".normal-seat-overlays");
      expect(overlayLayer?.getAttribute("aria-hidden")).not.toBe("true");

      const seatBadges = Array.from(
        view.container.querySelectorAll<HTMLElement>("[data-seat-identity]")
      );
      expect(seatBadges).toHaveLength(4);

      expect(
        view.container.querySelector(
          "[data-seat-identity='seat-0'] .normal-seat-overlay__identity-name"
        )?.textContent
      ).toBe("South");
      expect(
        view.container.querySelector(
          "[data-seat-identity='seat-0'] .normal-seat-overlay__identity-relation"
        )?.textContent
      ).toBe("You");
      expect(
        view.container.querySelector("[data-seat-identity='seat-0']")?.getAttribute("aria-label")
      ).toBe("South, You");
      expect(
        view.container.querySelector(
          "[data-seat-identity='seat-2'] .normal-seat-overlay__identity-name"
        )?.textContent
      ).toBe("North");
      expect(
        view.container.querySelector(
          "[data-seat-identity='seat-2'] .normal-seat-overlay__identity-relation"
        )?.textContent
      ).toBe("Partner");

      const turnMarker = view.container.querySelector(
        "[data-seat-marker='turn'][data-seat='seat-1']"
      );
      expect(turnMarker?.getAttribute("aria-label")).toBe("East turn");
      expect(turnMarker?.textContent).toContain("East");
      expect(turnMarker?.textContent).toContain("Turn");

      const callMarker = view.container.querySelector(
        "[data-seat-marker='call'][data-seat='seat-2']"
      );
      expect(callMarker?.getAttribute("aria-label")).toBe(
        "North called Grand Tichu"
      );
      expect(callMarker?.textContent).toContain("North");
      expect(callMarker?.textContent).toContain("GT");
    } finally {
      view.unmount();
    }
  });

  it("keeps only the south hand face-up in normal mode while debug mode can reveal all hands with asset-backed cards", () => {
    const normalView = render(
      createElement(NormalGameTableView, createDecisionProps())
    );
    const debugView = render(
      createElement(NormalGameTableView, {
        ...createDecisionProps(),
        uiMode: "debug"
      })
    );

    try {
      const normalBacks = normalView.container.querySelectorAll(
        ".playing-card--back"
      );
      const debugBacks = debugView.container.querySelectorAll(
        ".playing-card--back"
      );

      expect(normalBacks).toHaveLength(3);
      expect(
        normalView.container.querySelector(
          "[data-seat-region='bottom'] .playing-card--back"
        )
      ).toBeNull();
      expect(
        normalView.container.querySelector(
          "[data-seat-region='top'] .playing-card--back"
        )
      ).not.toBeNull();
      expect(
        normalView.container.querySelector(
          "[data-seat-region='left'] .playing-card--back"
        )
      ).not.toBeNull();
      expect(
        normalView.container.querySelector(
          "[data-seat-region='right'] .playing-card--back"
        )
      ).not.toBeNull();
      expect(
        normalView.container.querySelector(
          "[data-seat-region='bottom'] .playing-card__asset--frame"
        )
      ).not.toBeNull();

      expect(debugBacks).toHaveLength(0);
      expect(
        debugView.container.querySelectorAll(".playing-card__asset--frame")
          .length
      ).toBeGreaterThanOrEqual(4);
    } finally {
      normalView.unmount();
      debugView.unmount();
    }
  });

  it("renders the resolution shell and felt treatment during transient drama", () => {
    const view = render(
      createElement(NormalGameTableView, createResolutionProps())
    );

    try {
      const table = view.container.querySelector(".player-surface__table");
      expect(table).not.toBeNull();
      expect(table?.classList.contains("player-surface__table--resolution")).toBe(
        true
      );
      expect(table?.classList.contains("player-surface__hand--simplified")).toBe(
        true
      );
      expect(table?.classList.contains("player-surface__table--dramatic-turn")).toBe(
        true
      );
      expect(view.container.querySelector(".player-surface__felt")).not.toBeNull();
      expect(view.container.querySelector(".player-surface__action-band")).toBeNull();
    } finally {
      view.unmount();
    }
  });
});
