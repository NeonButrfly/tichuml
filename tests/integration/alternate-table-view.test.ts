// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Card } from "@tichuml/engine";
import type { GameTableViewProps, SeatPlayView, SeatView } from "../../apps/web/src/game-table-views";
import {
  DEFAULT_NORMAL_TABLE_LAYOUT,
  DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS
} from "../../apps/web/src/game-table-views";

type SnapshotWindow = Window & {
  __freshAltTableSnapshot?: () => {
    tableSrc: string;
    design: { w: number; h: number };
    oldMathRemoved: boolean;
    cards: {
      north: Array<{ renderMode: string; hiddenBottomPx?: number }>;
      east: Array<{ renderMode: string; rotationDeg: number }>;
      west: Array<{ renderMode: string; rotationDeg: number }>;
      south: Array<{ renderMode: string }>;
    };
    passing: Array<{ id: string; arrowDirection: string }>;
    passingVisible: boolean;
    phase: string;
  };
};

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

class MockResizeObserver {
  #callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
  }

  observe() {
    this.#callback(
      [
        {
          contentRect: {
            width: 1536,
            height: 1024,
            top: 0,
            left: 0,
            right: 1536,
            bottom: 1024,
            x: 0,
            y: 0,
            toJSON: () => ({})
          }
        } as ResizeObserverEntry
      ],
      this as unknown as ResizeObserver
    );
  }

  disconnect() {}

  unobserve() {}
}

function standard(id: string, suit: "jade" | "sword" | "pagoda" | "star", rank: number): Card {
  return {
    id,
    kind: "standard",
    suit,
    rank: rank as Extract<Card, { kind: "standard" }>["rank"]
  };
}

const localHand: Card[] = [
  standard("star-3", "star", 3),
  standard("star-5", "star", 5),
  standard("star-8", "star", 8),
  standard("sword-J", "sword", 11),
  standard("sword-Q", "sword", 12),
  standard("sword-K", "sword", 13),
  standard("jade-A", "jade", 14),
  standard("jade-2", "jade", 2),
  standard("jade-10", "jade", 10),
  standard("pagoda-K", "pagoda", 13),
  standard("pagoda-A", "pagoda", 14),
  { id: "phoenix", kind: "special", special: "phoenix" },
  { id: "dragon", kind: "special", special: "dragon" },
  { id: "mahjong", kind: "special", special: "mahjong" }
];

function makeRemoteHand(prefix: string): Card[] {
  return Array.from({ length: 14 }, (_, index) =>
    standard(`${prefix}-${index + 2}`, "jade", ((index % 13) + 2) as number)
  );
}

function makeSeatViews(): SeatView[] {
  return [
    {
      seat: "seat-0",
      position: "bottom",
      title: "South",
      relation: "You",
      handCount: localHand.length,
      cards: localHand,
      callState: {
        grandTichu: false,
        smallTichu: false,
        hasPlayedFirstCard: false
      },
      passReady: false,
      finishIndex: -1,
      isLocalSeat: true,
      isPrimarySeat: true,
      isThinkingSeat: false
    },
    {
      seat: "seat-1",
      position: "right",
      title: "East",
      relation: "Opponent",
      handCount: 14,
      cards: makeRemoteHand("east"),
      callState: {
        grandTichu: false,
        smallTichu: false,
        hasPlayedFirstCard: false
      },
      passReady: false,
      finishIndex: -1,
      isLocalSeat: false,
      isPrimarySeat: false,
      isThinkingSeat: false
    },
    {
      seat: "seat-2",
      position: "top",
      title: "North",
      relation: "Partner",
      handCount: 14,
      cards: makeRemoteHand("north"),
      callState: {
        grandTichu: false,
        smallTichu: false,
        hasPlayedFirstCard: false
      },
      passReady: false,
      finishIndex: -1,
      isLocalSeat: false,
      isPrimarySeat: false,
      isThinkingSeat: false
    },
    {
      seat: "seat-3",
      position: "left",
      title: "West",
      relation: "Opponent",
      handCount: 14,
      cards: makeRemoteHand("west"),
      callState: {
        grandTichu: false,
        smallTichu: false,
        hasPlayedFirstCard: false
      },
      passReady: false,
      finishIndex: -1,
      isLocalSeat: false,
      isPrimarySeat: false,
      isThinkingSeat: false
    }
  ];
}

function makePassRoutes(phase: "pass_select" | "trick_play"): GameTableViewProps["passRouteViews"] {
  const localIds = [localHand[0]!.id, localHand[1]!.id, localHand[2]!.id];

  return [
    {
      key: "north-left",
      sourceSeat: "seat-2",
      sourcePosition: "top",
      target: "left",
      targetSeat: "seat-3",
      displayMode: "passing",
      occupied: phase === "pass_select",
      visibleCardId: null,
      faceDown: true,
      interactive: false
    },
    {
      key: "north-partner",
      sourceSeat: "seat-2",
      sourcePosition: "top",
      target: "partner",
      targetSeat: "seat-0",
      displayMode: "passing",
      occupied: phase === "pass_select",
      visibleCardId: null,
      faceDown: true,
      interactive: false
    },
    {
      key: "north-right",
      sourceSeat: "seat-2",
      sourcePosition: "top",
      target: "right",
      targetSeat: "seat-1",
      displayMode: "passing",
      occupied: phase === "pass_select",
      visibleCardId: null,
      faceDown: true,
      interactive: false
    },
    {
      key: "east-left",
      sourceSeat: "seat-1",
      sourcePosition: "right",
      target: "left",
      targetSeat: "seat-2",
      displayMode: "passing",
      occupied: phase === "pass_select",
      visibleCardId: null,
      faceDown: true,
      interactive: false
    },
    {
      key: "east-partner",
      sourceSeat: "seat-1",
      sourcePosition: "right",
      target: "partner",
      targetSeat: "seat-3",
      displayMode: "passing",
      occupied: phase === "pass_select",
      visibleCardId: null,
      faceDown: true,
      interactive: false
    },
    {
      key: "east-right",
      sourceSeat: "seat-1",
      sourcePosition: "right",
      target: "right",
      targetSeat: "seat-0",
      displayMode: "passing",
      occupied: phase === "pass_select",
      visibleCardId: null,
      faceDown: true,
      interactive: false
    },
    {
      key: "south-left",
      sourceSeat: "seat-0",
      sourcePosition: "bottom",
      target: "left",
      targetSeat: "seat-1",
      displayMode: "passing",
      occupied: phase === "pass_select",
      visibleCardId: phase === "pass_select" ? localIds[0]! : null,
      faceDown: false,
      interactive: phase === "pass_select"
    },
    {
      key: "south-partner",
      sourceSeat: "seat-0",
      sourcePosition: "bottom",
      target: "partner",
      targetSeat: "seat-2",
      displayMode: "passing",
      occupied: phase === "pass_select",
      visibleCardId: phase === "pass_select" ? localIds[1]! : null,
      faceDown: false,
      interactive: phase === "pass_select"
    },
    {
      key: "south-right",
      sourceSeat: "seat-0",
      sourcePosition: "bottom",
      target: "right",
      targetSeat: "seat-3",
      displayMode: "passing",
      occupied: phase === "pass_select",
      visibleCardId: phase === "pass_select" ? localIds[2]! : null,
      faceDown: false,
      interactive: phase === "pass_select"
    },
    {
      key: "west-left",
      sourceSeat: "seat-3",
      sourcePosition: "left",
      target: "left",
      targetSeat: "seat-0",
      displayMode: "passing",
      occupied: phase === "pass_select",
      visibleCardId: null,
      faceDown: true,
      interactive: false
    },
    {
      key: "west-partner",
      sourceSeat: "seat-3",
      sourcePosition: "left",
      target: "partner",
      targetSeat: "seat-1",
      displayMode: "passing",
      occupied: phase === "pass_select",
      visibleCardId: null,
      faceDown: true,
      interactive: false
    },
    {
      key: "west-right",
      sourceSeat: "seat-3",
      sourcePosition: "left",
      target: "right",
      targetSeat: "seat-2",
      displayMode: "passing",
      occupied: phase === "pass_select",
      visibleCardId: null,
      faceDown: true,
      interactive: false
    }
  ];
}

function makeSeatRelativePlays(): SeatPlayView[] {
  return [
    {
      seat: "seat-0",
      position: "bottom",
      label: "South",
      plays: []
    },
    {
      seat: "seat-1",
      position: "right",
      label: "East",
      plays: []
    },
    {
      seat: "seat-2",
      position: "top",
      label: "North",
      plays: [
        {
          type: "play",
          seat: "seat-2",
          combination: {
            kind: "single",
            key: "north-single",
            cardIds: ["jade-9"],
            cardCount: 1,
            isBomb: false
          }
        }
      ]
    },
    {
      seat: "seat-3",
      position: "left",
      label: "West",
      plays: []
    }
  ];
}

function makeViewProps(phase: "pass_select" | "trick_play"): GameTableViewProps {
  const cardLookup = new Map<string, Card>();
  [...localHand, ...makeRemoteHand("east"), ...makeRemoteHand("north"), ...makeRemoteHand("west"), standard("jade-9", "jade", 9)].forEach(
    (card) => cardLookup.set(card.id, card)
  );

  return {
    roundSeed: "fresh-alt-test",
    decisionCount: 0,
    state: {
      phase,
      matchHistory: [],
      passSelections: {
        "seat-0": {
          left: localHand[0]!.id,
          partner: localHand[1]!.id,
          right: localHand[2]!.id
        }
      },
      revealedPasses: {}
    } as unknown as GameTableViewProps["state"],
    derived: {
      matchScore: {
        "team-0": 0,
        "team-1": 0
      }
    } as unknown as GameTableViewProps["derived"],
    controlHint: phase === "pass_select" ? "Choose three pass lanes." : "North leads the trick.",
    seatViews: makeSeatViews(),
    seatRelativePlays: phase === "trick_play" ? makeSeatRelativePlays() : makeSeatRelativePlays().map((entry) => ({ ...entry, plays: [] })),
    displayedTrick: phase === "trick_play" ? ({ currentWinner: "seat-2" } as GameTableViewProps["displayedTrick"]) : null,
    trickIsResolving: false,
    pickupStageViews: [],
    dogLeadAnimation: null,
    tablePassGroups: [],
    passRouteViews: makePassRoutes(phase),
    passLaneViews: [],
    sortedLocalHand: localHand,
    localCanInteract: true,
    localPassInteractionEnabled: true,
    localLegalCardIds: new Set(localHand.map((card) => card.id)),
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
        id: phase === "pass_select" ? "exchange" : "play",
        label: phase === "pass_select" ? "Exchange" : "Play",
        enabled: true,
        tone: "primary"
      }
    ],
    sortMode: "rank",
    autoplayLocal: false,
    lastAiDecision: null,
    recentEvents: [],
    localActionSummary: [],
    localSummaryText: "",
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
    cardLookup,
    playerTableVariant: "alternate",
    onAutoplayChange: vi.fn(),
    onContinueAi: vi.fn(),
    onSortModeChange: vi.fn(),
    onLocalCardClick: vi.fn(),
    onPassTargetSelect: vi.fn(),
    onPassLaneDrop: vi.fn(),
    onPassLaneCardClick: vi.fn(),
    onPassLaneCardDragStart: vi.fn(),
    onPassLaneCardDragEnd: vi.fn(),
    onVariantSelect: vi.fn(),
    onWishRankSelect: vi.fn(),
    onWishConfirm: vi.fn(),
    onWishCancel: vi.fn(),
    onDragonRecipientSelect: vi.fn(),
    onNormalAction: vi.fn(),
    onClearLocalSelection: vi.fn(),
    onPlayerTableVariantChange: vi.fn(),
    onNormalTableLayoutChange: vi.fn(),
    onNormalTableLayoutImport: vi.fn(),
    onExportNormalTableLayout: vi.fn(),
    onBackendSettingsChange: vi.fn(),
    onTestBackend: vi.fn(),
    onTestMl: vi.fn(),
    onToggleDashboardVerboseMode: vi.fn(),
    onToggleDashboardRawJson: vi.fn(),
    onToggleFrozenSnapshot: vi.fn(),
    onUiCommand: vi.fn(),
    onMainMenuOpenChange: vi.fn()
  };
}

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

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  Object.defineProperty(window, "__freshAltTableSnapshot", {
    configurable: true,
    writable: true,
    value: null
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("AltTable3DRoute", () => {
  it("renders the fresh passing layout against /table/table.png with readable rack fans", async () => {
    const { AltTable3DRoute } = await import(
      "../../apps/web/src/alt-table-3d/AltTable3DRoute"
    );
    const view = render(createElement(AltTable3DRoute, makeViewProps("pass_select")));

    const base = view.container.querySelector(
      "img[data-testid='fresh-alt-table-base']"
    ) as HTMLImageElement | null;
    expect(base?.getAttribute("src")).toBe("/table/table.png");

    const allSources = Array.from(view.container.querySelectorAll("img")).map((img) =>
      img.getAttribute("src")
    );
    expect(allSources).not.toContain("/tv_ed/t/plate.png");
    expect(allSources.every((src) => !/(tv14|tv15|tv16|tv17|tv18|plate\.png)/.test(src ?? ""))).toBe(true);

    expect(
      view.container.querySelectorAll(
        "[data-seat='east'][data-render-mode='side_rack_readable_fan']"
      )
    ).toHaveLength(14);
    expect(
      view.container.querySelectorAll(
        "[data-seat='west'][data-render-mode='side_rack_readable_fan']"
      )
    ).toHaveLength(14);
    expect(
      view.container.querySelectorAll(
        "[data-seat='north'][data-render-mode='north_rack_back_mostly_visible']"
      )
    ).toHaveLength(14);
    expect(
      view.container.querySelectorAll("[data-pass-id][data-arrow-direction]")
    ).toHaveLength(12);

    expect(view.container.textContent).not.toContain("Passing Lanes (12)");
    expect(view.container.textContent).not.toContain("Anchor Rules");
    expect(view.container.textContent).not.toContain("Trick Anchor Preview");

    const snapshot = (window as SnapshotWindow).__freshAltTableSnapshot?.();
    expect(snapshot?.tableSrc).toBe("/table/table.png");
    expect(snapshot?.design).toEqual({ w: 1536, h: 1024 });
    expect(snapshot?.oldMathRemoved).toBe(true);
    expect(snapshot?.passingVisible).toBe(true);
    expect(snapshot?.phase).toBe("pass_select");
    expect(snapshot?.passing).toHaveLength(12);
    expect(
      snapshot?.cards.east.every(
        (anchor) =>
          anchor.renderMode === "side_rack_readable_fan" &&
          Math.abs(anchor.rotationDeg) < 30
      )
    ).toBe(true);
    expect(
      snapshot?.cards.north.every((anchor) => (anchor.hiddenBottomPx ?? 0) <= 16)
    ).toBe(true);

    view.unmount();
  });

  it("hides the passing overlay outside the exchange phases while keeping the fresh table active", async () => {
    const { AltTable3DRoute } = await import(
      "../../apps/web/src/alt-table-3d/AltTable3DRoute"
    );
    const view = render(createElement(AltTable3DRoute, makeViewProps("trick_play")));

    expect(
      view.container.querySelectorAll("[data-pass-id][data-arrow-direction]")
    ).toHaveLength(0);
    expect(view.container.querySelectorAll("img[src='/table/table.png']")).toHaveLength(1);
    expect(view.container.querySelectorAll("img[src='/tv_ed/c/std/jd_9.png']")).toHaveLength(1);

    const snapshot = (window as SnapshotWindow).__freshAltTableSnapshot?.();
    expect(snapshot?.passingVisible).toBe(false);
    expect(snapshot?.phase).toBe("trick_play");

    view.unmount();
  });
});
