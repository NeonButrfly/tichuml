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
  NormalPassStagingRegions,
  NormalTrickStagingRegions,
  TableSurface,
  computeNormalViewportLayoutMetrics,
  getDisplayedTrickPoints,
  getNormalCenterZoneClassName,
  shouldRenderNormalCenterZoneFelt,
  type SeatPlayView
} from "../../apps/web/src/game-table-views";
import {
  getBoardBounds,
  getNormalSeatLayout,
  resolveNormalActionRowRegionStyle
} from "../../apps/web/src/table-layout";

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

  it("keeps the normal play-surface core centered inside its shared play-area container", () => {
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
    const customLayout = {
      ...DEFAULT_NORMAL_TABLE_LAYOUT,
      playSurface: { x: 0.41, y: 0.37, rotation: 0 }
    };
    const view = render(
      createElement(TableSurface, {
        variant: "normal",
        normalTableLayout: customLayout,
        state,
        derived: createDerived(state),
        controlHint: "Play a card",
        displayedTrick: state.currentTrick,
        trickIsResolving: false,
        seatRelativePlays: createSeatRelativePlays(state.currentTrick?.entries ?? []),
        tablePassGroups: [],
        cardLookup: buildCardLookup(cardsFromIds(["jade-10", "dragon"]))
      })
    );

    const core = view.container.querySelector<HTMLElement>(".normal-play-surface__core");
    expect(core?.style.left).toBe("");
    expect(core?.style.top).toBe("");

    view.unmount();
  });

  it("renders played cards in seat-local trick stages instead of the center surface", () => {
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
    const layoutMetrics = computeNormalViewportLayoutMetrics({
      viewportWidth: 1366,
      viewportHeight: 768,
      topCount: 8,
      bottomCount: 8,
      leftCount: 8,
      rightCount: 8,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const view = render(
      createElement("div", { style: { position: "relative", width: "1366px", height: "768px" } }, [
        createElement(TableSurface, {
          key: "surface",
          variant: "normal",
          normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
          state,
          derived: createDerived(state),
          controlHint: "Play a card",
          displayedTrick: state.currentTrick,
          trickIsResolving: false,
          seatRelativePlays,
          pickupStageViews: [],
          dogLeadAnimation: null,
          tablePassGroups: [],
          cardLookup: buildCardLookup(trickCards)
        }),
        createElement(NormalTrickStagingRegions, {
          key: "staging",
          normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
          layoutMetrics,
          displayedTrick: state.currentTrick,
          seatRelativePlays,
          pickupStageViews: [],
          dogLeadAnimation: null,
          cardLookup: buildCardLookup(trickCards)
        })
      ])
    );

    expect(view.container.querySelectorAll(".normal-trick-lane")).toHaveLength(0);
    expect(view.container.querySelector('[data-trick-stage="right"]')).not.toBeNull();
    expect(view.container.querySelector('[data-trick-stage="bottom"]')).not.toBeNull();
    expect(
      view.container.querySelectorAll('[data-trick-stage] .normal-card--trick')
    ).toHaveLength(2);
    expect(
      view.container.querySelectorAll(
        '[data-trick-stage="right"] .normal-card--trick-right'
      )
    ).toHaveLength(1);
    expect(
      view.container.querySelectorAll(
        '[data-trick-stage="left"] .normal-card--trick-left'
      )
    ).toHaveLength(0);
    const stagedCardTransforms = Array.from(
      view.container.querySelectorAll<HTMLElement>(
        "[data-trick-stage] .normal-trick-stage__card"
      )
    ).map((card) => card.style.transform);

    expect(stagedCardTransforms.every((transform) => transform.includes("translate("))).toBe(
      true
    );
    expect(stagedCardTransforms.every((transform) => transform.includes("rotate("))).toBe(
      false
    );

    view.unmount();
  });

  it("renders received cards in directional pass lanes until Pickup", () => {
    const pickupCards = cardsFromIds(["dragon", "jade-10", "sword-5"]);
    const layoutMetrics = computeNormalViewportLayoutMetrics({
      viewportWidth: 1366,
      viewportHeight: 768,
      topCount: 8,
      bottomCount: 8,
      leftCount: 8,
      rightCount: 8,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const view = render(
      createElement("div", { style: { position: "relative", width: "1366px", height: "768px" } },
        createElement(NormalPassStagingRegions, {
          normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
          layoutMetrics,
          passRouteViews: [
            {
              key: "pickup-seat-0-left",
              sourceSeat: "seat-0",
              sourcePosition: "bottom",
              target: "left",
              targetSeat: "seat-3",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[0]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "pickup-seat-0-partner",
              sourceSeat: "seat-0",
              sourcePosition: "bottom",
              target: "partner",
              targetSeat: "seat-2",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[1]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "pickup-seat-0-right",
              sourceSeat: "seat-0",
              sourcePosition: "bottom",
              target: "right",
              targetSeat: "seat-1",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[2]!.id,
              faceDown: false,
              interactive: false
            }
          ],
          selectedPassTarget: null,
          cardLookup: buildCardLookup(pickupCards),
          onPassTargetSelect: () => {},
          onPassLaneDrop: () => {},
          onPassLaneCardClick: () => {},
          onPassLaneCardDragStart: () => {},
          onPassLaneCardDragEnd: () => {}
        })
      )
    );

    expect(
      view.container.querySelector('[data-pass-lane="pickup-seat-0-left"]')
    ).not.toBeNull();
    expect(
      view.container.querySelector('[data-pass-lane="pickup-seat-0-partner"]')
    ).not.toBeNull();
    expect(
      view.container.querySelector('[data-pass-lane="pickup-seat-0-right"]')
    ).not.toBeNull();
    expect(view.container.querySelector('[data-pickup-stage="seat-0"]')).toBeNull();
    expect(view.container.querySelectorAll(".normal-card--route")).toHaveLength(3);

    view.unmount();
  });

  it("uses arrow-based east and west card orientation for filled pickup lanes", () => {
    const pickupCards = cardsFromIds([
      "dragon",
      "jade-10",
      "sword-5",
      "star-9",
      "pagoda-8",
      "jade-2",
      "star-4",
      "sword-7",
      "pagoda-3"
    ]);
    const layoutMetrics = computeNormalViewportLayoutMetrics({
      viewportWidth: 1366,
      viewportHeight: 768,
      topCount: 8,
      bottomCount: 8,
      leftCount: 8,
      rightCount: 8,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const view = render(
      createElement("div", { style: { position: "relative", width: "1366px", height: "768px" } },
        createElement(NormalPassStagingRegions, {
          normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
          layoutMetrics,
          passRouteViews: [
            {
              key: "pickup-seat-3-top",
              sourceSeat: "seat-3",
              sourcePosition: "left",
              target: "right",
              targetSeat: "seat-2",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[0]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "pickup-seat-3-partner",
              sourceSeat: "seat-3",
              sourcePosition: "left",
              target: "partner",
              targetSeat: "seat-1",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[1]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "pickup-seat-3-left",
              sourceSeat: "seat-3",
              sourcePosition: "left",
              target: "left",
              targetSeat: "seat-0",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[2]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "pickup-seat-1-right",
              sourceSeat: "seat-1",
              sourcePosition: "right",
              target: "right",
              targetSeat: "seat-0",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[3]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "pickup-seat-1-partner",
              sourceSeat: "seat-1",
              sourcePosition: "right",
              target: "partner",
              targetSeat: "seat-3",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[4]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "pickup-seat-1-left",
              sourceSeat: "seat-1",
              sourcePosition: "right",
              target: "left",
              targetSeat: "seat-2",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[5]!.id,
              faceDown: false,
              interactive: false
            }
          ],
          selectedPassTarget: null,
          cardLookup: buildCardLookup(pickupCards),
          onPassTargetSelect: () => {},
          onPassLaneDrop: () => {},
          onPassLaneCardClick: () => {},
          onPassLaneCardDragStart: () => {},
          onPassLaneCardDragEnd: () => {}
        })
      )
    );

    const westLaneRotations = [
      "pickup-seat-3-top",
      "pickup-seat-3-partner",
      "pickup-seat-3-left"
    ].map(
      (laneId) =>
        view.container
          .querySelector<HTMLElement>(`[data-pass-lane="${laneId}"]`)
          ?.style.getPropertyValue("--normal-pass-visible-rotation") ?? null
    );
    const eastLaneRotations = [
      "pickup-seat-1-left",
      "pickup-seat-1-partner",
      "pickup-seat-1-right"
    ].map(
      (laneId) =>
        view.container
          .querySelector<HTMLElement>(`[data-pass-lane="${laneId}"]`)
          ?.style.getPropertyValue("--normal-pass-visible-rotation") ?? null
    );
    const westCardClasses = [
      "pickup-seat-3-top",
      "pickup-seat-3-partner",
      "pickup-seat-3-left"
    ].map(
      (laneId) =>
        view.container
          .querySelector<HTMLElement>(
            `[data-pass-lane="${laneId}"] .normal-card--route`
          )
          ?.className ?? null
    );
    const westPickupSlotClasses = [
      "pickup-seat-3-top",
      "pickup-seat-3-partner",
      "pickup-seat-3-left"
    ].map(
      (laneId) =>
        view.container
          .querySelector<HTMLElement>(
            `[data-pass-lane="${laneId}"] .normal-pass-lane__slot`
          )
          ?.className ?? null
    );
    const eastPickupSlotClasses = [
      "pickup-seat-1-left",
      "pickup-seat-1-partner",
      "pickup-seat-1-right"
    ].map(
      (laneId) =>
        view.container
          .querySelector<HTMLElement>(
            `[data-pass-lane="${laneId}"] .normal-pass-lane__slot`
          )
          ?.className ?? null
    );
    const eastCardClasses = [
      "pickup-seat-1-left",
      "pickup-seat-1-partner",
      "pickup-seat-1-right"
    ].map(
      (laneId) =>
        view.container
          .querySelector<HTMLElement>(
            `[data-pass-lane="${laneId}"] .normal-card--route`
          )
          ?.className ?? null
    );

    expect(westLaneRotations).toEqual(["-90deg", "0deg", "90deg"]);
    expect(eastLaneRotations).toEqual(["-90deg", "0deg", "90deg"]);
    expect(
      westCardClasses[0]?.includes("normal-card--route-pickup-up") ?? false
    ).toBe(true);
    expect(
      westCardClasses[1]?.includes("normal-card--route-pickup-right") ?? false
    ).toBe(true);
    expect(
      westCardClasses[2]?.includes("normal-card--route-pickup-down") ?? false
    ).toBe(true);
    expect(
      eastCardClasses[0]?.includes("normal-card--route-pickup-up") ?? false
    ).toBe(true);
    expect(
      eastCardClasses[1]?.includes("normal-card--route-pickup-left") ?? false
    ).toBe(true);
    expect(
      eastCardClasses[2]?.includes("normal-card--route-pickup-down") ?? false
    ).toBe(true);
    expect(
      westPickupSlotClasses.every(
        (className) =>
          className?.includes("normal-pass-lane__slot--pickup-filled") ?? false
      )
    ).toBe(true);
    expect(
      eastPickupSlotClasses.every(
        (className) =>
          className?.includes("normal-pass-lane__slot--pickup-filled") ?? false
      )
    ).toBe(true);

    view.unmount();
  });

  it("uses arrow-based north and south pickup card orientation while passing lanes keep route rotation", () => {
    const pickupCards = cardsFromIds([
      "dragon",
      "jade-10",
      "sword-5",
      "star-9",
      "pagoda-8",
      "jade-2",
      "star-4",
      "sword-7",
      "pagoda-3"
    ]);
    const layoutMetrics = computeNormalViewportLayoutMetrics({
      viewportWidth: 1366,
      viewportHeight: 768,
      topCount: 8,
      bottomCount: 8,
      leftCount: 8,
      rightCount: 8,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const view = render(
      createElement("div", { style: { position: "relative", width: "1366px", height: "768px" } },
        createElement(NormalPassStagingRegions, {
          normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
          layoutMetrics,
          passRouteViews: [
            {
              key: "pickup-seat-2-left",
              sourceSeat: "seat-2",
              sourcePosition: "top",
              target: "left",
              targetSeat: "seat-1",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[0]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "pickup-seat-2-partner",
              sourceSeat: "seat-2",
              sourcePosition: "top",
              target: "partner",
              targetSeat: "seat-0",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[1]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "pickup-seat-2-right",
              sourceSeat: "seat-2",
              sourcePosition: "top",
              target: "right",
              targetSeat: "seat-3",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[2]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "pickup-seat-0-left",
              sourceSeat: "seat-0",
              sourcePosition: "bottom",
              target: "left",
              targetSeat: "seat-3",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[6]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "pickup-seat-0-partner",
              sourceSeat: "seat-0",
              sourcePosition: "bottom",
              target: "partner",
              targetSeat: "seat-2",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[7]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "pickup-seat-0-right",
              sourceSeat: "seat-0",
              sourcePosition: "bottom",
              target: "right",
              targetSeat: "seat-1",
              displayMode: "pickup",
              occupied: true,
              visibleCardId: pickupCards[8]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "passing-seat-3-left",
              sourceSeat: "seat-3",
              sourcePosition: "left",
              target: "left",
              targetSeat: "seat-0",
              displayMode: "passing",
              occupied: true,
              visibleCardId: pickupCards[3]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "passing-seat-3-partner",
              sourceSeat: "seat-3",
              sourcePosition: "left",
              target: "partner",
              targetSeat: "seat-1",
              displayMode: "passing",
              occupied: true,
              visibleCardId: pickupCards[4]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "passing-seat-3-right",
              sourceSeat: "seat-3",
              sourcePosition: "left",
              target: "right",
              targetSeat: "seat-2",
              displayMode: "passing",
              occupied: true,
              visibleCardId: pickupCards[5]!.id,
              faceDown: false,
              interactive: false
            }
          ],
          selectedPassTarget: null,
          cardLookup: buildCardLookup(pickupCards),
          onPassTargetSelect: () => {},
          onPassLaneDrop: () => {},
          onPassLaneCardClick: () => {},
          onPassLaneCardDragStart: () => {},
          onPassLaneCardDragEnd: () => {}
        })
      )
    );

    const northPickupClasses = Array.from(
      view.container.querySelectorAll<HTMLElement>(
        '[data-pass-lane^="pickup-seat-2-"] .normal-card--route'
      )
    ).map((element) => element.className);
    const southPickupClasses = Array.from(
      view.container.querySelectorAll<HTMLElement>(
        '[data-pass-lane^="pickup-seat-0-"] .normal-card--route'
      )
    ).map((element) => element.className);
    const passingLaneRotations = [
      "passing-seat-3-left",
      "passing-seat-3-partner",
      "passing-seat-3-right"
    ].map(
      (laneId) =>
        view.container
          .querySelector<HTMLElement>(`[data-pass-lane="${laneId}"]`)
          ?.style.getPropertyValue("--normal-pass-visible-rotation") ?? null
    );
    const passingCardClasses = [
      "passing-seat-3-left",
      "passing-seat-3-partner",
      "passing-seat-3-right"
    ].map(
      (laneId) =>
        view.container
          .querySelector<HTMLElement>(
            `[data-pass-lane="${laneId}"] .normal-card--route`
          )
          ?.className ?? null
    );
    const passingSlotClasses = [
      "passing-seat-3-left",
      "passing-seat-3-partner",
      "passing-seat-3-right"
    ].map(
      (laneId) =>
        view.container
          .querySelector<HTMLElement>(
            `[data-pass-lane="${laneId}"] .normal-pass-lane__slot`
          )
          ?.className ?? null
    );

    expect(
      northPickupClasses.filter((className) =>
        className.includes("normal-card--route-pickup-left")
      )
    ).toHaveLength(1);
    expect(
      northPickupClasses.filter((className) =>
        className.includes("normal-card--route-pickup-upright")
      )
    ).toHaveLength(1);
    expect(
      northPickupClasses.filter((className) =>
        className.includes("normal-card--route-pickup-right")
      )
    ).toHaveLength(1);
    expect(
      southPickupClasses.filter((className) =>
        className.includes("normal-card--route-pickup-left")
      )
    ).toHaveLength(1);
    expect(
      southPickupClasses.filter((className) =>
        className.includes("normal-card--route-pickup-upright")
      )
    ).toHaveLength(1);
    expect(
      southPickupClasses.filter((className) =>
        className.includes("normal-card--route-pickup-right")
      )
    ).toHaveLength(1);
    expect(passingLaneRotations).toEqual(["90deg", "0deg", "-90deg"]);
    expect(
      passingCardClasses.some((className) =>
        className?.includes("normal-card--route-pickup")
      )
    ).toBe(false);
    expect(
      passingSlotClasses.some((className) =>
        className?.includes("normal-pass-lane__slot--pickup-filled")
      )
    ).toBe(false);

    view.unmount();
  });

  it("keeps rendered trick stages slightly relaxed away from the owning seat", () => {
    const north = combo(["jade-4"]);
    const east = combo(["sword-6"]);
    const south = combo(["pagoda-8"]);
    const west = combo(["star-10"]);
    const trickCards = cardsFromIds(["jade-4", "sword-6", "pagoda-8", "star-10"]);
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-0",
      currentTrick: {
        leader: "seat-2",
        currentWinner: "seat-3",
        currentCombination: west,
        entries: [
          { type: "play", seat: "seat-2", combination: north },
          { type: "play", seat: "seat-1", combination: east },
          { type: "play", seat: "seat-0", combination: south },
          { type: "play", seat: "seat-3", combination: west }
        ],
        passingSeats: []
      }
    });
    const seatRelativePlays = createSeatRelativePlays(state.currentTrick?.entries ?? []);
    const layoutMetrics = computeNormalViewportLayoutMetrics({
      viewportWidth: 1366,
      viewportHeight: 768,
      topCount: 8,
      bottomCount: 8,
      leftCount: 8,
      rightCount: 8,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const view = render(
      createElement(
        "div",
        { style: { position: "relative", width: "1366px", height: "768px" } },
        createElement(NormalTrickStagingRegions, {
          normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
          layoutMetrics,
          displayedTrick: state.currentTrick,
          seatRelativePlays,
          pickupStageViews: [],
          dogLeadAnimation: null,
          cardLookup: buildCardLookup(trickCards)
        })
      )
    );

    expect(
      view.container.querySelector<HTMLElement>('[data-trick-stage="top"]')?.style.transform
    ).toContain("translateY(");
    expect(
      view.container.querySelectorAll(
        '[data-trick-stage="left"] .normal-card--trick-left'
      )
    ).toHaveLength(1);
    expect(
      view.container.querySelectorAll(
        '[data-trick-stage="right"] .normal-card--trick-right'
      )
    ).toHaveLength(1);
    expect(
      view.container.querySelector<HTMLElement>('[data-trick-stage="bottom"]')?.style.transform
    ).toContain("translateY(-");
    expect(
      view.container.querySelector<HTMLElement>('[data-trick-stage="left"]')?.style.transform
    ).toContain("translateX(");
    expect(
      view.container.querySelector<HTMLElement>('[data-trick-stage="right"]')?.style.transform
    ).toContain("translateX(-");

    view.unmount();
  });

  it("derives seat-local pickup and south label anchors from the shared layout schema", () => {
    const metrics = computeNormalViewportLayoutMetrics({
      viewportWidth: 1366,
      viewportHeight: 768,
      topCount: 8,
      bottomCount: 14,
      leftCount: 8,
      rightCount: 8,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const board = getBoardBounds(metrics);
    const bottomLayout = getNormalSeatLayout({
      position: "bottom",
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics,
      handCardCount: 14
    });

    const southHandY = board.top + board.height * DEFAULT_NORMAL_TABLE_LAYOUT.southHand.y;
    const trickY = parseFloat(String(bottomLayout.trickZone.top));
    const pickupY = parseFloat(String(bottomLayout.pickupZone.top));
    const nameY = parseFloat(String(bottomLayout.nameLabel.top));
    const actionTop = parseFloat(
      String(
        resolveNormalActionRowRegionStyle({
          normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
          layoutMetrics: metrics
        }).top
      )
    );

    expect(trickY).toBeGreaterThan(pickupY);
    expect(pickupY).toBeLessThan(southHandY);
    expect(trickY).toBeLessThan(southHandY);
    expect(nameY).toBeGreaterThan(southHandY);
    expect(actionTop).toBeGreaterThan(nameY);
  });

  it("renders Dog lead transfer using the engine-resolved target seat", () => {
    const layoutMetrics = computeNormalViewportLayoutMetrics({
      viewportWidth: 1366,
      viewportHeight: 768,
      topCount: 8,
      bottomCount: 8,
      leftCount: 8,
      rightCount: 8,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const view = render(
      createElement(
        "div",
        { style: { position: "relative", width: "1366px", height: "768px" } },
        createElement(NormalTrickStagingRegions, {
          normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
          layoutMetrics,
          displayedTrick: null,
          seatRelativePlays: [],
          pickupStageViews: [],
          dogLeadAnimation: { sourceSeat: "seat-0", targetSeat: "seat-2" },
          cardLookup: new Map()
        })
      )
    );

    expect(
      view.container.querySelector('[data-dog-transfer="seat-0->seat-2"]')
    ).not.toBeNull();

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
    expect(shouldRenderNormalCenterZoneFelt(false)).toBe(false);
    expect(shouldRenderNormalCenterZoneFelt(true)).toBe(true);
  });
});
