import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  createRailCamera,
  getRailCardPlacement,
  RAIL_CARD_THICKNESS
} from "../../apps/web/src/luxury-table/rail-card-geometry";
import { getTableFit } from "../../apps/web/src/luxury-table/tableFit";

describe("upright luxury rail card geometry (#125)", () => {
  const targets = {
    north: new Vector3(0, 0, 1),
    east: new Vector3(-1, 0, 0),
    west: new Vector3(1, 0, 0)
  };
  it("points the physical back normals south/west/east, never up from the felt", () => {
    for (const seat of ["north", "east", "west"] as const) {
      for (let i = 0; i < 14; i++) {
        const card = getRailCardPlacement(seat, i);
        expect(card.backNormal.dot(targets[seat])).toBeCloseTo(1, 10);
        expect(card.backNormal.y).toBeCloseTo(0, 10);
        expect(card.position[1] - card.height / 2).toBe(0);
        expect(RAIL_CARD_THICKNESS).toBeGreaterThan(0);
      }
    }
  });
  it("projects every mesh foot onto its artwork rail at desktop and narrow viewport sizes", () => {
    const camera = createRailCamera();
    for (const seat of ["north", "east", "west"] as const) {
      for (let i = 0; i < 14; i++) {
        const card = getRailCardPlacement(seat, i);
        const p = card.foot.clone().project(camera);
        for (const [w, h] of [
          [1536, 1024],
          [1280, 720],
          [768, 1024]
        ]) {
          const fit = getTableFit(w!, h!);
          expect(fit.offsetX + ((p.x + 1) / 2) * fit.renderedW).toBeCloseTo(
            fit.offsetX + card.base.x * fit.scale,
            6
          );
          expect(fit.offsetY + ((1 - p.y) / 2) * fit.renderedH).toBeCloseTo(
            fit.offsetY + card.base.y * fit.scale,
            6
          );
        }
      }
    }
  });
  it("gives the side racks depth along Z and keeps their cards standing vertically", () => {
    for (const seat of ["east", "west"] as const) {
      const first = getRailCardPlacement(seat, 0);
      const last = getRailCardPlacement(seat, 13);
      expect(last.foot.z - first.foot.z).toBeGreaterThan(100);
      expect(last.position[1]).toBe(first.position[1]);
    }
  });
  it("keeps north cards readable above the plaque with nonintersecting bodies and enough face-depth precision", () => {
    const camera = createRailCamera();
    for (let i = 0; i < 14; i++) {
      const card = getRailCardPlacement("north", i);
      const top = new Vector3(card.foot.x, card.height, card.foot.z).project(
        camera
      );
      const screenTop = (1 - top.y) * 512;
      expect(screenTop).toBeGreaterThan(5);
      expect(card.base.y - screenTop).toBeGreaterThan(65);
      expect(card.base.y).toBeLessThan(100);
      if (i > 0)
        expect(
          card.foot.z - getRailCardPlacement("north", i - 1).foot.z
        ).toBeGreaterThan(RAIL_CARD_THICKNESS);
      const body = new Vector3(...card.position)
        .addScaledVector(card.backNormal, RAIL_CARD_THICKNESS / 2)
        .project(camera);
      const print = new Vector3(...card.position)
        .addScaledVector(card.backNormal, RAIL_CARD_THICKNESS / 2 + 0.1)
        .project(camera);
      expect((Math.abs(body.z - print.z) / 2) * 2 ** 24).toBeGreaterThan(4);
    }
  });
});
