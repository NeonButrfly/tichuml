// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import {
  cardsFromIds,
  createScenarioState,
  type Card,
  type PublicDerivedState
} from "@tichuml/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendReachability } from "../../apps/web/src/backend/settings";
import {
  AlternateGameTableView
} from "../../apps/web/src/alternate-game-table-view";
import {
  DEFAULT_NORMAL_TABLE_LAYOUT,
  DEFAULT_NORMAL_TABLE_LAYOUT_TOKENS,
  type GameTableViewProps
} from "../../apps/web/src/game-table-views";
import { createNormalActionRail } from "../../apps/web/src/game-table-view-model";
import type { MasterControlSnapshot } from "../../apps/web/src/master-control-model";

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
    },
    currentTrick: {
      leader: "seat-1",
      currentWinner: "seat-0",
      currentCombination: {
        kind: "single",
        key: "single:dragon",
        cardCount: 1,
        primaryRank: 15,
        highCardRank: 15,
        isBomb: false
      },
      entries: [
        {
          type: "play",
          seat: "seat-1",
          combination: {
            kind: "single",
            key: "single:jade-10",
            cardCount: 1,
            primaryRank: 10,
            highCardRank: 10,
            isBomb: false
          }
        },
        {
          type: "play",
          seat: "seat-0",
          combination: {
            kind: "single",
            key: "single:dragon",
            cardCount: 1,
            primaryRank: 15,
            highCardRank: 15,
            isBomb: false
          }
        }
      ],
      passingSeats: []
    }
  });
  const allCards = Object.values(state.hands).flat();
  const onLocalCardClick = vi.fn();
  const onNormalAction = vi.fn();
  const onClearLocalSelection = vi.fn();
  const onSortModeChange = vi.fn();
  const onWishRankSelect = vi.fn();
  const onWishConfirm = vi.fn();
  const onWishCancel = vi.fn();
  const onPlayerTableVariantChange = vi.fn();

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
        callState: {
          grandTichu: false,
          smallTichu: true,
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
        title: "WEST",
        relation: "Opponent",
        handCount: state.hands["seat-3"].length,
        cards: state.hands["seat-3"],
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
        seat: "seat-1",
        position: "right",
        title: "EAST",
        relation: "Opponent",
        handCount: state.hands["seat-1"].length,
        cards: state.hands["seat-1"],
        callState: {
          grandTichu: true,
          smallTichu: false,
          hasPlayedFirstCard: true
        },
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
      }
    ],
    seatRelativePlays: [],
    displayedTrick: state.currentTrick,
    trickIsResolving: false,
    pickupStageViews: [],
    dogLeadAnimation: null,
    tablePassGroups: [],
    passRouteViews: [],
    passLaneViews: [
      {
        target: "left",
        targetSeat: "seat-3",
        assignedCardId: "jade-3"
      },
      {
        target: "partner",
        targetSeat: "seat-2",
        assignedCardId: null
      },
      {
        target: "right",
        targetSeat: "seat-1",
        assignedCardId: null
      }
    ],
    sortedLocalHand: state.hands["seat-0"],
    localCanInteract: true,
    localPassInteractionEnabled: false,
    localLegalCardIds: new Set(["jade-3", "sword-3", "phoenix"]),
    selectedCardIds: ["jade-3", "sword-3"],
    selectedPassTarget: "partner",
    passSelectionReady: false,
    matchingPlayActions: [],
    activePlayVariant: null,
    resolvedWishRank: 9,
    wishDialogOpen: false,
    wishSelectionOptions: [],
    wishConfirmDisabled: false,
    wishSubmissionPending: false,
    normalActionRail: createNormalActionRail({
      phase: "trick_play",
      nextEnabled: false,
      nextDealEnabled: false,
      grandTichuEnabled: false,
      tichuEnabled: true,
      passEnabled: true,
      exchangeEnabled: false,
      pickupEnabled: false,
      playEnabled: true,
      matchComplete: false
    }),
    sortMode: "rank",
    autoplayLocal: false,
    lastAiDecision: null,
    recentEvents: ["East played Single.", "South played Dragon."],
    localActionSummary: ["Selected Pair"],
    localSummaryText: "Ready to play",
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
      checkedAt: "2026-05-22T15:30:00Z"
    } as BackendReachability,
    masterControlSnapshot: {} as MasterControlSnapshot,
    hotkeyDefinitions: [],
    cardLookup: buildCardLookup(allCards),
    playerTableVariant: "alternate",
    onAutoplayChange: vi.fn(),
    onContinueAi: vi.fn(),
    onSortModeChange,
    onLocalCardClick,
    onPassTargetSelect: vi.fn(),
    onPassLaneDrop: vi.fn(),
    onPassLaneCardClick: vi.fn(),
    onPassLaneCardDragStart: vi.fn(),
    onPassLaneCardDragEnd: vi.fn(),
    onVariantSelect: vi.fn(),
    onWishRankSelect,
    onWishConfirm,
    onWishCancel,
    onDragonRecipientSelect: vi.fn(),
    onNormalAction,
    onClearLocalSelection,
    onPlayerTableVariantChange,
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

describe("AlternateGameTableView", () => {
  it("keeps opponent hands hidden while leaving the south hand interactive", () => {
    const view = render(createElement(AlternateGameTableView, createProps()));

    expect(
      view.container.querySelector("[data-alt-seat='south'] .playing-card")
    ).not.toBeNull();
    expect(
      view.container.querySelector("[data-alt-seat='north'] .playing-card")
    ).toBeNull();
    expect(
      view.container.querySelectorAll("[data-alt-card-back='true']").length
    ).toBeGreaterThan(0);
    expect(view.container.textContent).toContain("WE");
    expect(view.container.textContent).toContain("THEY");

    view.unmount();
  });

  it("dispatches through the existing card and action handlers", () => {
    const props = createProps();
    const view = render(createElement(AlternateGameTableView, props));

    const localCard = view.container.querySelector<HTMLButtonElement>(
      "[data-alt-seat='south'] .playing-card"
    );
    const playButton = Array.from(
      view.container.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent?.includes("Play"));
    const clearButton = Array.from(
      view.container.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent?.includes("Clear Selection"));

    expect(localCard).not.toBeNull();
    expect(playButton).not.toBeUndefined();
    expect(clearButton).not.toBeUndefined();

    act(() => {
      localCard?.click();
      playButton?.click();
      clearButton?.click();
    });

    expect(props.onLocalCardClick).toHaveBeenCalledWith("jade-3");
    expect(props.onNormalAction).toHaveBeenCalledWith("play");
    expect(props.onClearLocalSelection).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  it("reuses the existing wish-selection handlers when a play requires Mahjong resolution", () => {
    const props = createProps({
      wishDialogOpen: true,
      wishSelectionOptions: [null, 5, 9],
      activePlayVariant: {
        type: "play_cards",
        seat: "seat-0",
        cardIds: ["mahjong"],
        combination: {
          kind: "single",
          key: "single:mahjong",
          cardCount: 1,
          primaryRank: 1,
          highCardRank: 1,
          isBomb: false
        },
        availableWishRanks: [5, 9]
      }
    });
    const view = render(createElement(AlternateGameTableView, props));

    const chooseNine = Array.from(
      view.container.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent?.trim() === "9");
    const confirm = Array.from(
      view.container.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent?.includes("Confirm Wish"));

    expect(chooseNine).not.toBeUndefined();
    expect(confirm).not.toBeUndefined();

    act(() => {
      chooseNine?.click();
      confirm?.click();
    });

    expect(props.onWishRankSelect).toHaveBeenCalledWith(9);
    expect(props.onWishConfirm).toHaveBeenCalledTimes(1);

    view.unmount();
  });
});
