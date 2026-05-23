import { describe, expect, it } from "vitest";
import { resolveAlternateTableLayout } from "../../apps/web/src/alternate-table/layout";
import type { PassRouteView, SeatView } from "../../apps/web/src/game-table-views";

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
    const layout = resolveAlternateTableLayout(1600, 900, seatViews, passRoutes);
    const topWidth = layout.outerFelt[1]!.x - layout.outerFelt[0]!.x;
    const bottomWidth = layout.outerFelt[2]!.x - layout.outerFelt[3]!.x;

    expect(layout.boardRect.width / layout.width).toBeGreaterThan(0.95);
    expect(topWidth).toBeLessThan(bottomWidth * 0.7);
  });

  it("keeps the north rail compact and the south shelf inside the board", () => {
    const layout = resolveAlternateTableLayout(1600, 900, seatViews, passRoutes);

    expect(layout.seats.top.rack.y).toBeLessThan(layout.trickRect.y);
    expect(layout.southControlRect.y).toBeGreaterThan(layout.seats.bottom.plaque.y);
    expect(layout.southControlRect.y + layout.southControlRect.height).toBeLessThanOrEqual(
      layout.boardRect.y + layout.boardRect.height
    );
  });
});
