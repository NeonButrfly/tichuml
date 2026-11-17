import { describe, expect, it } from "vitest";
import {
  makeNorthHandAnchors,
  makeSideHandAnchors,
  makePassingAnchors,
  resolveFreshPassAnchorId
} from "../../apps/web/src/luxury-table/freshTableMath";
import {
  getTableFit,
  designToScreen
} from "../../apps/web/src/luxury-table/tableFit";

describe("luxury seat alignment (#138)", () => {
  it("turns each opponent card toward the center without squeezing its width", () => {
    for (const [cards, angle] of [
      [makeNorthHandAnchors(), 180],
      [makeSideHandAnchors("east"), -90],
      [makeSideHandAnchors("west"), 90]
    ] as const) {
      expect(cards).toHaveLength(14);
      for (const card of cards) {
        expect(card.rotationDeg).toBe(angle);
        expect(card.cardBackFaces).toBe("table_center");
        expect(card.scaleX).toBe(1);
      }
    }
  });
  it("maps all twelve source/recipient pairs to arrows toward their actual recipient", () => {
    const seats = {
      top: { x: 768, y: 0 },
      right: { x: 1536, y: 480 },
      bottom: { x: 768, y: 1024 },
      left: { x: 0, y: 480 }
    } as const;
    const lanes = makePassingAnchors();
    expect(new Set(lanes.map((l) => l.id)).size).toBe(12);
    const directions = {
      north: { x: 0, y: -1 },
      south: { x: 0, y: 1 },
      east: { x: 1, y: 0 },
      west: { x: -1, y: 0 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 }
    };
    for (const source of Object.keys(seats) as Array<keyof typeof seats>) {
      for (const target of Object.keys(seats) as Array<keyof typeof seats>) {
        if (source === target) continue;
        const lane = lanes.find(
          (l) =>
            l.id ===
            resolveFreshPassAnchorId({
              sourcePosition: source,
              targetPosition: target
            })
        )!;
        expect(lane).toBeDefined();
        const delta = {
          x: seats[target].x - seats[source].x,
          y: seats[target].y - seats[source].y
        };
        const arrow = directions[lane.arrowDirection];
        expect(delta.x * arrow.x + delta.y * arrow.y).toBeGreaterThan(0);
      }
    }
  });
  it("keeps aligned lanes inside the felt, separate from hands and each other at desktop and narrow sizes", () => {
    const lanes = makePassingAnchors();
    for (const lane of lanes) {
      expect(lane.centerPx.x - lane.wPx / 2).toBeGreaterThan(220);
      expect(lane.centerPx.x + lane.wPx / 2).toBeLessThan(1316);
      expect(lane.centerPx.y - lane.hPx / 2).toBeGreaterThan(150);
      expect(lane.centerPx.y + lane.hPx / 2).toBeLessThan(720);
      for (const other of lanes) {
        if (lane.id === other.id) continue;
        expect(
          Math.abs(lane.centerPx.x - other.centerPx.x) >=
            (lane.wPx + other.wPx) / 2 ||
            Math.abs(lane.centerPx.y - other.centerPx.y) >=
              (lane.hPx + other.hPx) / 2
        ).toBe(true);
      }
      for (const [w, h] of [
        [1536, 1024],
        [1280, 720],
        [768, 1024]
      ]) {
        const fit = getTableFit(w!, h!);
        const p = designToScreen(lane.centerPx.x, lane.centerPx.y, fit);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(w!);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(h!);
      }
    }
  });
});
