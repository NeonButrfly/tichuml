import { describe, expect, it } from "vitest";

import {
  getAltTableCameraConfig,
  getRackShellBasePosition
} from "../../apps/web/src/alt-table-3d/AltTableScene";

describe("ALT scene framing", () => {
  it("keeps the ALT perspective camera in a higher, wider 3/4 view so more of the authored board and racks read like the reference", () => {
    const camera = getAltTableCameraConfig();

    expect(camera.position[1]).toBeGreaterThan(6.9);
    expect(camera.position[2]).toBeGreaterThan(6.7);
    expect(camera.fov).toBeGreaterThanOrEqual(39);
    expect(camera.fov).toBeLessThanOrEqual(43);
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
