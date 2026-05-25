// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import {
  cardsFromIds,
  createScenarioState,
  type Card,
  type PublicDerivedState
} from "@tichuml/engine";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { BackendReachability } from "../../apps/web/src/backend/settings";
import {
  DEFAULT_NORMAL_TABLE_LAYOUT,
  DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS,
  type GameTableViewProps
} from "../../apps/web/src/game-table-views";
import { createNormalActionRail } from "../../apps/web/src/game-table-view-model";
import type { MasterControlSnapshot } from "../../apps/web/src/master-control-model";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("../../apps/web/src/alt-table-3d/AltTichuTable3D", () => ({
  AltTichuTable3D: () =>
    createElement(
      "div",
      { "data-alt-table-shell": "true" },
      createElement(
        "div",
        { "data-alt-table-3d-scene": "true" },
        createElement("span", { "data-scene-node": "TableRoot" }),
        createElement("span", { "data-scene-node": "felt-inset" }),
        createElement("span", { "data-scene-node": "seat-rail", "data-seat-position": "top" }),
        createElement("span", { "data-scene-node": "seat-rail", "data-seat-position": "bottom" }),
        createElement("span", { "data-scene-node": "seat-rail", "data-seat-position": "left" }),
        createElement("span", { "data-scene-node": "seat-rail", "data-seat-position": "right" }),
        createElement("span", { "data-scene-node": "seat-label", "data-seat-position": "top" }),
        createElement("span", { "data-scene-node": "seat-label", "data-seat-position": "bottom" }),
        createElement("span", { "data-scene-node": "seat-label", "data-seat-position": "left" }),
        createElement("span", { "data-scene-node": "seat-label", "data-seat-position": "right" })
      )
    )
}));

const { AltTable3DRoute } = await import("../../apps/web/src/alt-table-3d/AltTable3DRoute");

beforeAll(() => {
  Object.defineProperty(window.navigator, "userAgent", {
    value: "Mozilla/5.0 Chrome/148.0.0.0 Safari/537.36",
    configurable: true
  });
});

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

function createProps(
  overrides: Partial<GameTableViewProps> = {}
): GameTableViewProps {
  const state = createScenarioState({
    phase: "trick_play",
    activeSeat: "seat-0",
    currentWish: 9,
    hands: {
      "seat-0": cardsFromIds(["jade-3", "sword-3", "phoenix", "dragon"]),
      "seat-1": cardsFromIds(["jade-10", "sword-10", "star-10"]),
      "seat-2": cardsFromIds(["pagoda-9", "pagoda-11", "dog"]),
      "seat-3": cardsFromIds(["star-4", "star-5", "mahjong"])
    }
  });
  const allCards = Object.values(state.hands).flat();

  return {
    roundSeed: "alternate-view-seed",
    decisionCount: 2,
    state,
    derived: createDerived(state),
    controlHint: "Your turn",
    seatViews: [
      {
        seat: "seat-2",
        position: "top",
        title: "NORTH",
        relation: "Partner",
        handCount: state.hands["seat-2"].length,
        cards: state.hands["seat-2"],
        callState: { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        passReady: false,
        finishIndex: -1,
        isLocalSeat: false,
        isPrimarySeat: false,
        isThinkingSeat: false
      },
      {
        seat: "seat-3",
        position: "left",
        title: "WEST",
        relation: "Opponent",
        handCount: state.hands["seat-3"].length,
        cards: state.hands["seat-3"],
        callState: { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        passReady: false,
        finishIndex: -1,
        isLocalSeat: false,
        isPrimarySeat: false,
        isThinkingSeat: false
      },
      {
        seat: "seat-1",
        position: "right",
        title: "EAST",
        relation: "Opponent",
        handCount: state.hands["seat-1"].length,
        cards: state.hands["seat-1"],
        callState: { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        passReady: false,
        finishIndex: -1,
        isLocalSeat: false,
        isPrimarySeat: false,
        isThinkingSeat: false
      },
      {
        seat: "seat-0",
        position: "bottom",
        title: "SOUTH",
        relation: "You",
        handCount: state.hands["seat-0"].length,
        cards: state.hands["seat-0"],
        callState: { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
        passReady: false,
        finishIndex: -1,
        isLocalSeat: true,
        isPrimarySeat: true,
        isThinkingSeat: false
      }
    ],
    seatRelativePlays: [],
    displayedTrick: null,
    trickIsResolving: false,
    pickupStageViews: [],
    dogLeadAnimation: null,
    tablePassGroups: [],
    passRouteViews: [],
    passLaneViews: [],
    sortedLocalHand: state.hands["seat-0"],
    localCanInteract: true,
    localPassInteractionEnabled: false,
    localLegalCardIds: new Set(["jade-3"]),
    selectedCardIds: [],
    selectedPassTarget: "partner",
    passSelectionReady: false,
    matchingPlayActions: [],
    activePlayVariant: null,
    resolvedWishRank: null,
    wishDialogOpen: false,
    wishSelectionOptions: [],
    wishConfirmDisabled: false,
    wishSubmissionPending: false,
    normalActionRail: createNormalActionRail({
      phase: "trick_play",
      nextEnabled: false,
      nextDealEnabled: false,
      grandTichuEnabled: false,
      tichuEnabled: false,
      passEnabled: false,
      exchangeEnabled: false,
      pickupEnabled: false,
      playEnabled: false,
      matchComplete: false
    }),
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
    backendSettings: {
      decisionMode: "local",
      backendBaseUrl: "http://127.0.0.1:4310",
      telemetryEnabled: false,
      serverFallbackEnabled: false
    },
    backendStatus: {
      state: "reachable",
      detail: "Health endpoint responded successfully.",
      checkedAt: "2026-05-24T00:00:00Z"
    } as BackendReachability,
    masterControlSnapshot: {} as MasterControlSnapshot,
    hotkeyDefinitions: [],
    cardLookup: buildCardLookup(allCards),
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
    onMainMenuOpenChange: vi.fn(),
    ...overrides
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("AltTable3DRoute", () => {
  it("renders the isolated empty 3D shell markers and no gameplay chrome", () => {
    const view = render(createElement(AltTable3DRoute, createProps()));

    expect(view.container.querySelector("[data-alt-table-shell='true']")).not.toBeNull();
    expect(view.container.querySelector("[data-alt-table-3d-scene='true']")).not.toBeNull();
    expect(view.container.querySelectorAll("[data-scene-node='seat-rail']")).toHaveLength(4);
    expect(view.container.querySelectorAll("[data-scene-node='seat-label']")).toHaveLength(4);
    expect(view.container.querySelector("[data-scene-node='felt-inset']")).not.toBeNull();
    expect(view.container.querySelectorAll("[data-scene-card]")).toHaveLength(0);
    expect(view.container.querySelectorAll("button")).toHaveLength(0);
    expect(view.container.querySelector(".alternate-three-surface")).toBeNull();
    expect(view.container.querySelector(".alternate-tabletop")).toBeNull();
    expect(view.container.querySelector(".alternate-hitbox-card")).toBeNull();
    expect(view.container.querySelector(".alternate-hitbox-route")).toBeNull();

    view.unmount();
  });
});
