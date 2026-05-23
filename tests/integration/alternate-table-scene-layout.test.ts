import { describe, expect, it } from "vitest";
import { resolveAlternateTableLayout } from "../../apps/web/src/alternate-table/layout";
import { resolveAlternateTableSceneLayout } from "../../apps/web/src/alternate-table/scene-layout";
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

describe("alternate table scene layout", () => {
  it("keeps the south shelf closest to the camera and side trays on their correct rails", () => {
    const tableLayout = resolveAlternateTableLayout({
      width: 1600,
      height: 900,
      seatViews,
      passRouteViews: passRoutes,
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const sceneLayout = resolveAlternateTableSceneLayout(tableLayout);

    expect(sceneLayout.southShelf.center.z).toBeGreaterThan(sceneLayout.trickBowl.center.z);
    expect(sceneLayout.trickBowl.center.z).toBeGreaterThan(sceneLayout.northTray.center.z);
    expect(sceneLayout.westTray.center.x).toBeLessThan(0);
    expect(sceneLayout.eastTray.center.x).toBeGreaterThan(0);
    expect(sceneLayout.southShelf.size.x).toBeGreaterThan(sceneLayout.northTray.size.x);
  });

  it("derives pass cups from the same directional lane anchors", () => {
    const tableLayout = resolveAlternateTableLayout({
      width: 1600,
      height: 900,
      seatViews,
      passRouteViews: passRoutes,
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const sceneLayout = resolveAlternateTableSceneLayout(tableLayout);
    const leftCup = sceneLayout.passCups.find((cup) => cup.key === "south-left");
    const partnerCup = sceneLayout.passCups.find((cup) => cup.key === "south-partner");
    const rightCup = sceneLayout.passCups.find((cup) => cup.key === "south-right");

    expect(leftCup?.center.x).toBeLessThan(partnerCup?.center.x ?? 0);
    expect(rightCup?.center.x).toBeGreaterThan(partnerCup?.center.x ?? 0);
    expect(partnerCup?.center.z).toBeLessThan(sceneLayout.southShelf.center.z);
  });

  it("keeps rack trays and the south shelf close to their matching rails", () => {
    const tableLayout = resolveAlternateTableLayout({
      width: 1600,
      height: 900,
      seatViews,
      passRouteViews: passRoutes,
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const sceneLayout = resolveAlternateTableSceneLayout(tableLayout);
    const northEdgeZ = -11.8 / 2;
    const southEdgeZ = 11.8 / 2;
    const westEdgeX = -14.8 / 2;
    const eastEdgeX = 14.8 / 2;

    expect(Math.abs(sceneLayout.northTray.center.z - northEdgeZ)).toBeLessThan(1.9);
    expect(Math.abs(sceneLayout.southShelf.center.z - southEdgeZ)).toBeLessThan(1.9);
    expect(Math.abs(sceneLayout.westTray.center.x - westEdgeX)).toBeLessThan(2.1);
    expect(Math.abs(sceneLayout.eastTray.center.x - eastEdgeX)).toBeLessThan(2.1);
  });
});
