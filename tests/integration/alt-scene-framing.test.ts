import { describe, expect, it } from "vitest";

import {
  getAltTableCameraConfig,
  getRackShellBasePosition
} from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT scene framing", () => {
  it("keeps the ALT perspective camera close enough to let the table fill the authored board", () => {
    const camera = getAltTableCameraConfig();

    expect(camera.position[1]).toBeLessThan(6.5);
    expect(camera.position[1]).toBeGreaterThan(6.2);
    expect(camera.position[2]).toBeLessThan(5.9);
    expect(camera.position[2]).toBeGreaterThan(5.6);
    expect(camera.fov).toBeLessThanOrEqual(40);
    expect(camera.fov).toBeGreaterThanOrEqual(37);
  });

  it("pulls hidden-hand trays inward from the outer edges so the racks read larger in-frame", () => {
    const sampleSize = { width: 0.46, height: 0.644 } as const;

    const north = getRackShellBasePosition({
      seat: "north",
      minX: -2.6,
      maxX: 2.6,
      minZ: -3.2,
      maxZ: -3.0,
      sampleSize
    });
    const east = getRackShellBasePosition({
      seat: "east",
      minX: 3.4,
      maxX: 3.6,
      minZ: -1.9,
      maxZ: 1.9,
      sampleSize
    });
    const west = getRackShellBasePosition({
      seat: "west",
      minX: -3.6,
      maxX: -3.4,
      minZ: -1.9,
      maxZ: 1.9,
      sampleSize
    });

    expect(north[2]).toBeGreaterThan(-3.28);
    expect(east[0]).toBeLessThan(3.68);
    expect(west[0]).toBeGreaterThan(-3.68);
  });
});
