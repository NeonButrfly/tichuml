import { describe, expect, it } from "vitest";
import {
  SOUTH_PERSPECTIVE_LAYOUT,
  createSouthPerspectiveProjector,
  resolvePassRouteWorldPose,
  resolveRemoteHandWorldPose,
  resolveSouthHandWorldPose,
  resolveSouthPerspectiveDebugLayout,
  resolveTrickCardWorldPose
} from "../../apps/web/src/alternate-table/south-perspective-projection";

describe("south perspective projection", () => {
  it("keeps the table ellipse inside the viewport while filling most of it", () => {
    const projector = createSouthPerspectiveProjector({
      viewportWidth: 1536,
      viewportHeight: 1024,
      yaw: 0
    });

    expect(projector.geometry.tableRect.left).toBeGreaterThanOrEqual(0);
    expect(projector.geometry.tableRect.top).toBeGreaterThanOrEqual(0);
    expect(projector.geometry.tableRect.width).toBeGreaterThan(
      projector.geometry.viewportWidth * 0.9
    );
    expect(projector.geometry.tableRect.height).toBeGreaterThan(
      projector.geometry.viewportHeight * 0.64
    );
  });

  it("projects south lower than center and center lower than north", () => {
    const projector = createSouthPerspectiveProjector({
      viewportWidth: 1920,
      viewportHeight: 1080,
      yaw: 0
    });

    const south = projector.projectPoint({ x: 0, y: 0.24, z: 0 });
    const center = projector.projectPoint({ x: 0, y: 0.56, z: 0 });
    const north = projector.projectPoint({ x: 0, y: 0.94, z: 0 });

    expect(south.screenY).toBeGreaterThan(center.screenY);
    expect(center.screenY).toBeGreaterThan(north.screenY);
    expect(south.scale).toBeGreaterThan(center.scale);
    expect(center.scale).toBeGreaterThan(north.scale);
  });

  it("keeps east and west hands separated and inside the viewport", () => {
    const projector = createSouthPerspectiveProjector({
      viewportWidth: 1366,
      viewportHeight: 768,
      yaw: 0
    });

    const west = projector.projectPoint(
      resolveRemoteHandWorldPose({ position: "left", index: 1, count: 5 })
    );
    const east = projector.projectPoint(
      resolveRemoteHandWorldPose({ position: "right", index: 1, count: 5 })
    );

    expect(west.screenX).toBeGreaterThan(0);
    expect(east.screenX).toBeLessThan(projector.geometry.viewportWidth);
    expect(west.screenX).toBeLessThan(projector.geometry.centerX);
    expect(east.screenX).toBeGreaterThan(projector.geometry.centerX);
    expect(east.screenX - west.screenX).toBeGreaterThan(
      projector.geometry.viewportWidth * 0.42
    );
  });

  it("keeps primary anchors on screen and leaves the near rim below the south hand", () => {
    const projector = createSouthPerspectiveProjector({
      viewportWidth: 1536,
      viewportHeight: 1024,
      yaw: 0
    });
    const debugLayout = resolveSouthPerspectiveDebugLayout(projector);

    for (const anchor of debugLayout.anchors) {
      expect(anchor.x).toBeGreaterThanOrEqual(0);
      expect(anchor.x).toBeLessThanOrEqual(projector.geometry.viewportWidth);
      expect(anchor.y).toBeGreaterThanOrEqual(0);
      expect(anchor.y).toBeLessThanOrEqual(projector.geometry.viewportHeight);
    }

    const southHand = debugLayout.anchors.find((entry) => entry.key === "south-hand");
    expect(southHand).toBeDefined();
    expect(projector.geometry.frontY).toBeGreaterThan((southHand?.y ?? 0) + 80);
    expect(projector.geometry.frontY).toBeLessThan(projector.geometry.viewportHeight);
  });

  it("fans the south hand along a shallow near arc", () => {
    const left = resolveSouthHandWorldPose({
      index: 0,
      count: 7,
      selected: false
    });
    const middle = resolveSouthHandWorldPose({
      index: 3,
      count: 7,
      selected: false
    });

    expect(left.y).toBeGreaterThan(middle.y);
    expect(left.y - middle.y).toBeLessThan(0.05);
    expect(Math.abs(left.rotation)).toBeLessThan(7);
  });

  it("keeps trick cards and pass routes on the tabletop band", () => {
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

    expect(passWorld.y).toBeGreaterThan(0.3);
    expect(passWorld.y).toBeLessThan(0.8);
    expect(trickWorld.y).toBeGreaterThan(0.48);
    expect(trickWorld.y).toBeLessThan(0.68);
  });

  it("keeps the normalized layout aligned with the intended reference frame", () => {
    expect(SOUTH_PERSPECTIVE_LAYOUT.tableCenterY).toBeCloseTo(0.56, 2);
    expect(SOUTH_PERSPECTIVE_LAYOUT.tableRadiusX).toBeCloseTo(0.47, 2);
    expect(SOUTH_PERSPECTIVE_LAYOUT.tableRadiusY).toBeCloseTo(0.34, 2);
    expect(SOUTH_PERSPECTIVE_LAYOUT.nearEdgeY).toBeCloseTo(0.94, 2);
    expect(SOUTH_PERSPECTIVE_LAYOUT.farEdgeY).toBeCloseTo(0.22, 2);
  });
});
