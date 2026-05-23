import { describe, expect, it } from "vitest";
import { resolveAlternateTableLayout } from "../../apps/web/src/alternate-table/layout";
import type { PassRouteView, SeatView } from "../../apps/web/src/game-table-views";
import { DEFAULT_NORMAL_TABLE_LAYOUT } from "../../apps/web/src/table-layout";

const seatViews: SeatView[] = [
  {
    seat: "seat-2",
    position: "top",
    title: "NORTH",
    relation: "Partner",
    handCount: 14,
    cards: [],
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
    handCount: 14,
    cards: [],
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
    handCount: 14,
    cards: [],
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
    handCount: 14,
    cards: [],
    callState: { grandTichu: false, smallTichu: false, hasPlayedFirstCard: false },
    passReady: false,
    finishIndex: -1,
    isLocalSeat: true,
    isPrimarySeat: true,
    isThinkingSeat: false
  }
];

const passRoutes: PassRouteView[] = [
  {
    key: "south-left",
    sourceSeat: "seat-0",
    sourcePosition: "bottom",
    target: "left",
    targetSeat: "seat-3",
    displayMode: "passing",
    occupied: false,
    visibleCardId: null,
    faceDown: false,
    interactive: true
  },
  {
    key: "south-partner",
    sourceSeat: "seat-0",
    sourcePosition: "bottom",
    target: "partner",
    targetSeat: "seat-2",
    displayMode: "passing",
    occupied: false,
    visibleCardId: null,
    faceDown: false,
    interactive: true
  },
  {
    key: "south-right",
    sourceSeat: "seat-0",
    sourcePosition: "bottom",
    target: "right",
    targetSeat: "seat-1",
    displayMode: "passing",
    occupied: false,
    visibleCardId: null,
    faceDown: false,
    interactive: true
  }
];

describe("alternate table layout geometry", () => {
  it("keeps the felt dominant and the top edge meaningfully narrower than the south edge", () => {
    const layout = resolveAlternateTableLayout({
      width: 1600,
      height: 900,
      seatViews,
      passRouteViews: passRoutes,
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const topWidth = layout.outerFelt[1]!.x - layout.outerFelt[0]!.x;
    const bottomWidth = layout.outerFelt[2]!.x - layout.outerFelt[3]!.x;

    expect(layout.boardRect.width / layout.width).toBeGreaterThan(0.95);
    expect(topWidth).toBeLessThan(bottomWidth * 0.7);
  });

  it("keeps the north rail compact and the south shelf inside the board", () => {
    const layout = resolveAlternateTableLayout({
      width: 1600,
      height: 900,
      seatViews,
      passRouteViews: passRoutes,
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      hasVariantPicker: false,
      hasWishPicker: false
    });

    expect(layout.seats.top.rack.y).toBeLessThan(layout.trickRect.y);
    expect(layout.southControlRect.y).toBeGreaterThan(layout.seats.bottom.plaque.y);
    expect(layout.southControlRect.y + layout.southControlRect.height).toBeLessThanOrEqual(
      layout.boardRect.y + layout.boardRect.height
    );
  });

  it("keeps pass slots out of the core trick bowl", () => {
    const layout = resolveAlternateTableLayout({
      width: 1600,
      height: 900,
      seatViews,
      passRouteViews: [
        ...passRoutes,
        {
          key: "north-left",
          sourceSeat: "seat-2",
          sourcePosition: "top",
          target: "left",
          targetSeat: "seat-3",
          displayMode: "passing",
          occupied: false,
          visibleCardId: null,
          faceDown: true,
          interactive: false
        },
        {
          key: "east-up",
          sourceSeat: "seat-1",
          sourcePosition: "right",
          target: "partner",
          targetSeat: "seat-3",
          displayMode: "passing",
          occupied: false,
          visibleCardId: null,
          faceDown: true,
          interactive: false
        },
        {
          key: "west-up",
          sourceSeat: "seat-3",
          sourcePosition: "left",
          target: "partner",
          targetSeat: "seat-1",
          displayMode: "passing",
          occupied: false,
          visibleCardId: null,
          faceDown: true,
          interactive: false
        }
      ],
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const protectedCore = {
      left: layout.trickRect.x - 40,
      right: layout.trickRect.x + layout.trickRect.width + 40,
      top: layout.trickRect.y - 34,
      bottom: layout.trickRect.y + layout.trickRect.height + 34
    };

    for (const route of layout.passRoutes) {
      const centerX = route.rect.x + route.rect.width / 2;
      const centerY = route.rect.y + route.rect.height / 2;
      const insideCore =
        centerX >= protectedCore.left &&
        centerX <= protectedCore.right &&
        centerY >= protectedCore.top &&
        centerY <= protectedCore.bottom;

      expect(insideCore).toBe(false);
    }
  });

  it("keeps pass routes adjacent to their source rails instead of drifting into the center", () => {
    const layout = resolveAlternateTableLayout({
      width: 1600,
      height: 900,
      seatViews,
      passRouteViews: [
        ...passRoutes,
        {
          key: "north-left",
          sourceSeat: "seat-2",
          sourcePosition: "top",
          target: "left",
          targetSeat: "seat-3",
          displayMode: "passing",
          occupied: false,
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
          occupied: false,
          visibleCardId: null,
          faceDown: true,
          interactive: false
        },
        {
          key: "west-up",
          sourceSeat: "seat-3",
          sourcePosition: "left",
          target: "partner",
          targetSeat: "seat-1",
          displayMode: "passing",
          occupied: false,
          visibleCardId: null,
          faceDown: true,
          interactive: false
        },
        {
          key: "west-down",
          sourceSeat: "seat-3",
          sourcePosition: "left",
          target: "left",
          targetSeat: "seat-2",
          displayMode: "passing",
          occupied: false,
          visibleCardId: null,
          faceDown: true,
          interactive: false
        },
        {
          key: "east-up",
          sourceSeat: "seat-1",
          sourcePosition: "right",
          target: "partner",
          targetSeat: "seat-3",
          displayMode: "passing",
          occupied: false,
          visibleCardId: null,
          faceDown: true,
          interactive: false
        },
        {
          key: "east-down",
          sourceSeat: "seat-1",
          sourcePosition: "right",
          target: "right",
          targetSeat: "seat-2",
          displayMode: "passing",
          occupied: false,
          visibleCardId: null,
          faceDown: true,
          interactive: false
        }
      ],
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      hasVariantPicker: false,
      hasWishPicker: false
    });

    const southRoutes = layout.passRoutes.filter((route) => route.sourcePosition === "bottom");
    const northRoutes = layout.passRoutes.filter((route) => route.sourcePosition === "top");
    const westRoutes = layout.passRoutes.filter((route) => route.sourcePosition === "left");
    const eastRoutes = layout.passRoutes.filter((route) => route.sourcePosition === "right");

    for (const route of southRoutes) {
      const centerY = route.rect.y + route.rect.height / 2;
      expect(centerY).toBeGreaterThan(layout.trickRect.y + layout.trickRect.height);
      expect(centerY).toBeLessThan(layout.seats.bottom.rack.y);
    }

    for (const route of northRoutes) {
      const centerY = route.rect.y + route.rect.height / 2;
      expect(centerY).toBeGreaterThan(layout.seats.top.rack.y + layout.seats.top.rack.height);
      expect(centerY).toBeLessThan(layout.trickRect.y);
    }

    for (const route of westRoutes) {
      const centerX = route.rect.x + route.rect.width / 2;
      expect(centerX).toBeGreaterThan(layout.seats.left.rack.x + layout.seats.left.rack.width);
      expect(centerX).toBeLessThan(layout.trickRect.x);
    }

    for (const route of eastRoutes) {
      const centerX = route.rect.x + route.rect.width / 2;
      expect(centerX).toBeLessThan(layout.seats.right.rack.x);
      expect(centerX).toBeGreaterThan(layout.trickRect.x + layout.trickRect.width);
    }
  });
});
