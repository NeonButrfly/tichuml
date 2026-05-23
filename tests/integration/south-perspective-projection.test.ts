import { describe, expect, it } from "vitest";
import {
  createSouthPerspectiveProjector,
  resolvePassRouteWorldPose,
  resolveRemoteHandWorldPose,
  resolveSouthHandWorldPose,
  resolveTrickCardWorldPose
} from "../../apps/web/src/alternate-table/south-perspective-projection";

describe("south perspective projection", () => {
  it("reserves visible room around the table ellipse", () => {
    const projector = createSouthPerspectiveProjector({
      viewportWidth: 1600,
      viewportHeight: 900,
      yaw: 0
    });

    expect(projector.geometry.tableRect.left).toBeGreaterThan(55);
    expect(
      projector.geometry.viewportWidth -
        (projector.geometry.tableRect.left + projector.geometry.tableRect.width)
    ).toBeGreaterThan(55);
    expect(projector.geometry.tableRect.top).toBeGreaterThan(130);
    expect(projector.geometry.tableRect.width).toBeLessThan(1500);
  });

  it("projects near cards larger and lower than far cards", () => {
    const projector = createSouthPerspectiveProjector({
      viewportWidth: 1600,
      viewportHeight: 900,
      yaw: 0
    });

    const nearPose = projector.projectPoint({ x: 0, y: 0.1, z: 0 });
    const farPose = projector.projectPoint({ x: 0, y: 0.9, z: 0 });

    expect(nearPose.scale).toBeGreaterThan(farPose.scale);
    expect(nearPose.screenY).toBeGreaterThan(farPose.screenY);
  });

  it("compresses horizontal travel with depth", () => {
    const projector = createSouthPerspectiveProjector({
      viewportWidth: 1600,
      viewportHeight: 900,
      yaw: 0
    });

    const nearLeft = projector.projectPoint({ x: -0.6, y: 0.16, z: 0 });
    const farLeft = projector.projectPoint({ x: -0.6, y: 0.86, z: 0 });

    expect(Math.abs(nearLeft.screenX - projector.geometry.centerX)).toBeGreaterThan(
      Math.abs(farLeft.screenX - projector.geometry.centerX)
    );
  });

  it("fans south hand along the near arc while keeping remote hands farther away", () => {
    const southLeft = resolveSouthHandWorldPose({
      index: 0,
      count: 7,
      selected: false
    });
    const southMid = resolveSouthHandWorldPose({
      index: 3,
      count: 7,
      selected: false
    });
    const northMid = resolveRemoteHandWorldPose({
      position: "top",
      index: 2,
      count: 5
    });

    expect(southLeft.y).toBeGreaterThan(southMid.y);
    expect(southLeft.y - southMid.y).toBeLessThan(0.05);
    expect(Math.abs(southLeft.rotation)).toBeLessThan(7);
    expect(northMid.y).toBeGreaterThan(southMid.y);
  });

  it("keeps pass routes and trick cards on the central table band", () => {
    const passWorld = resolvePassRouteWorldPose({
      sourcePosition: "bottom",
      targetPosition: "top",
      direction: "up",
      displayMode: "passing"
    });
    const trickWorld = resolveTrickCardWorldPose({
      position: "right",
      index: 0,
      count: 1,
      winning: false
    });

    expect(passWorld.y).toBeGreaterThan(0.2);
    expect(passWorld.y).toBeLessThan(0.75);
    expect(trickWorld.y).toBeGreaterThan(0.4);
    expect(trickWorld.y).toBeLessThan(0.7);
  });
});
