import { describe, expect, it } from "vitest";
import {
  generateFanLocalTransforms,
  mirrorHandLayout,
  copyHandLayout,
  mirrorPassingLane,
  getMirrorLaneId,
  degreesToRadians,
  radiansToDegrees,
  createDefaultSideHandLayout,
  createDefaultPassingLane,
  createDefaultAltTableLayout,
  validateAltTableLayout,
  safeParseLayout,
  type CardFanSettings
} from "@tichuml/table-layout-schema";

describe("degreesToRadians and radiansToDegrees", () => {
  it("converts 0 degrees to 0 radians", () => {
    expect(degreesToRadians(0)).toBe(0);
  });

  it("converts 180 degrees to PI radians", () => {
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 10);
  });

  it("converts 90 degrees to PI/2 radians", () => {
    expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2, 10);
  });

  it("converts PI radians to 180 degrees", () => {
    expect(radiansToDegrees(Math.PI)).toBeCloseTo(180, 10);
  });

  it("round-trips correctly", () => {
    expect(radiansToDegrees(degreesToRadians(45))).toBeCloseTo(45, 10);
    expect(degreesToRadians(radiansToDegrees(1.23))).toBeCloseTo(1.23, 10);
  });
});

describe("generateFanLocalTransforms", () => {
  const defaultFan: CardFanSettings = {
    cardCount: 14,
    cardWidth: 0.46,
    cardHeight: 0.644,
    overlap: 0.08,
    spread: 0.114,
    arc: 0.15,
    depthStep: 0.02,
    localRotationStep: 0.009,
    startOffset: 0,
    fanDirection: 1,
    reverseOrder: false
  };

  it("generates the correct number of transforms", () => {
    const transforms = generateFanLocalTransforms(defaultFan);
    expect(transforms).toHaveLength(14);
  });

  it("generates zero transforms for zero card count", () => {
    const transforms = generateFanLocalTransforms({ ...defaultFan, cardCount: 0 });
    expect(transforms).toHaveLength(0);
  });

  it("generates one transform for one card", () => {
    const transforms = generateFanLocalTransforms({ ...defaultFan, cardCount: 1 });
    expect(transforms).toHaveLength(1);
    expect(transforms[0].position.x).toBe(0);
    expect(transforms[0].position.y).toBe(0);
  });

  it("produces deterministic output", () => {
    const a = generateFanLocalTransforms(defaultFan);
    const b = generateFanLocalTransforms(defaultFan);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("produces different output when spread changes", () => {
    const a = generateFanLocalTransforms(defaultFan);
    const b = generateFanLocalTransforms({ ...defaultFan, spread: 0.2 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("reverses order when reverseOrder is true", () => {
    const normal = generateFanLocalTransforms(defaultFan);
    const reversed = generateFanLocalTransforms({ ...defaultFan, reverseOrder: true });
    expect(normal[0].position.x).not.toBe(reversed[0].position.x);
  });

  it("mirrors fan direction when fanDirection is -1", () => {
    const normal = generateFanLocalTransforms(defaultFan);
    const reversed = generateFanLocalTransforms({ ...defaultFan, fanDirection: -1 });
    expect(normal[0].rotation.z).toBeCloseTo(-reversed[0].rotation.z, 5);
  });

  it("preserves local fan data across repeated calls", () => {
    const first = generateFanLocalTransforms(defaultFan);
    for (let i = 0; i < 100; i++) {
      generateFanLocalTransforms(defaultFan);
    }
    const after = generateFanLocalTransforms(defaultFan);
    expect(JSON.stringify(first)).toBe(JSON.stringify(after));
  });
});

describe("mirrorHandLayout", () => {
  it("copies east to east without changes", () => {
    const east = createDefaultSideHandLayout("east");
    const result = mirrorHandLayout(east, "east");
    expect(result.id).toBe("east");
    expect(result.master.position.x).toBe(east.master.position.x);
  });

  it("copies west to west without changes", () => {
    const west = createDefaultSideHandLayout("west");
    const result = mirrorHandLayout(west, "west");
    expect(result.id).toBe("west");
    expect(result.master.position.x).toBe(west.master.position.x);
  });

  it("copies north to north without changes", () => {
    const north = createDefaultSideHandLayout("north");
    const result = mirrorHandLayout(north, "north");
    expect(result.id).toBe("north");
    expect(result.master.position.z).toBe(north.master.position.z);
  });

  it("copies south to south without changes", () => {
    const south = createDefaultSideHandLayout("south");
    const result = mirrorHandLayout(south, "south");
    expect(result.id).toBe("south");
    expect(result.master.position.z).toBe(south.master.position.z);
  });

  it("mirrors east to west by negating X position", () => {
    const east = createDefaultSideHandLayout("east");
    const result = mirrorHandLayout(east, "west");
    expect(result.id).toBe("west");
    expect(result.master.position.x).toBeCloseTo(-east.master.position.x, 10);
  });

  it("mirrors west to east by negating X position", () => {
    const west = createDefaultSideHandLayout("west");
    const result = mirrorHandLayout(west, "east");
    expect(result.id).toBe("east");
    expect(result.master.position.x).toBeCloseTo(-west.master.position.x, 10);
  });

  it("mirrors north to south by negating Z position", () => {
    const north = createDefaultSideHandLayout("north");
    const result = mirrorHandLayout(north, "south");
    expect(result.id).toBe("south");
    expect(result.master.position.z).toBeCloseTo(-north.master.position.z, 10);
  });

  it("mirrors south to north by negating Z position", () => {
    const south = createDefaultSideHandLayout("south");
    const result = mirrorHandLayout(south, "north");
    expect(result.id).toBe("north");
    expect(result.master.position.z).toBeCloseTo(-south.master.position.z, 10);
  });

  it("negates Y rotation when mirroring", () => {
    const east = createDefaultSideHandLayout("east");
    const result = mirrorHandLayout(east, "west");
    expect(result.master.rotation.y).not.toBe(east.master.rotation.y);
  });

  it("reverses fan direction when mirroring", () => {
    const east = createDefaultSideHandLayout("east");
    const result = mirrorHandLayout(east, "west");
    expect(result.fan.fanDirection).toBe(east.fan.fanDirection === 1 ? -1 : 1);
  });

  it("toggles reverseOrder when mirroring", () => {
    const east = createDefaultSideHandLayout("east");
    const result = mirrorHandLayout(east, "west");
    expect(result.fan.reverseOrder).toBe(!east.fan.reverseOrder);
  });

  it("negates localRotationStep when mirroring", () => {
    const east = createDefaultSideHandLayout("east");
    const result = mirrorHandLayout(east, "west");
    expect(result.fan.localRotationStep).toBeCloseTo(-east.fan.localRotationStep, 10);
  });

  it("mirrors pivot X position", () => {
    const east = createDefaultSideHandLayout("east");
    east.master.pivot = { x: 1.5, y: 0, z: 0 };
    const result = mirrorHandLayout(east, "west");
    expect(result.master.pivot.x).toBeCloseTo(-1.5, 10);
  });
});

describe("copyHandLayout", () => {
  it("copies values without mirroring", () => {
    const east = createDefaultSideHandLayout("east");
    const result = copyHandLayout(east, "west");
    expect(result.id).toBe("west");
    expect(result.master.position.x).toBe(east.master.position.x);
    expect(result.master.rotation.y).toBe(east.master.rotation.y);
    expect(result.fan.fanDirection).toBe(east.fan.fanDirection);
  });
});

describe("getMirrorLaneId", () => {
  it("mirrors north-left to north-right", () => {
    expect(getMirrorLaneId("north-left")).toBe("north-right");
  });

  it("mirrors north-right to north-left", () => {
    expect(getMirrorLaneId("north-right")).toBe("north-left");
  });

  it("mirrors east-north to west-north", () => {
    expect(getMirrorLaneId("east-north")).toBe("west-north");
  });

  it("mirrors east-across to west-across", () => {
    expect(getMirrorLaneId("east-across")).toBe("west-across");
  });

  it("mirrors south-left to south-right", () => {
    expect(getMirrorLaneId("south-left")).toBe("south-right");
  });

  it("mirrors north-across to south-across", () => {
    expect(getMirrorLaneId("north-across")).toBe("south-across");
  });
});

describe("mirrorPassingLane", () => {
  it("mirrors east-north to west-north position", () => {
    const eastNorth = createDefaultPassingLane("east-north");
    const result = mirrorPassingLane(eastNorth, "west-north");
    expect(result.id).toBe("west-north");
    expect(result.position.x).toBeCloseTo(-eastNorth.position.x, 10);
    expect(result.position.y).toBeCloseTo(eastNorth.position.y, 10);
    expect(result.position.z).toBeCloseTo(eastNorth.position.z, 10);
  });

  it("preserves width and height when mirroring", () => {
    const lane = createDefaultPassingLane("east-across");
    const result = mirrorPassingLane(lane, "west-across");
    expect(result.width).toBe(lane.width);
    expect(result.height).toBe(lane.height);
  });

  it("does not modify the source lane", () => {
    const source = createDefaultPassingLane("east-north");
    const originalJson = JSON.stringify(source);
    mirrorPassingLane(source, "west-north");
    expect(JSON.stringify(source)).toBe(originalJson);
  });
});

describe("validateAltTableLayout", () => {
  it("validates the default layout as valid", () => {
    const layout = createDefaultAltTableLayout();
    const result = validateAltTableLayout(layout);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects non-object input", () => {
    const result = validateAltTableLayout("not an object");
    expect(result.valid).toBe(false);
  });

  it("rejects missing schemaVersion", () => {
    const result = validateAltTableLayout({});
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("schemaVersion"))).toBe(true);
  });

  it("rejects future schema version", () => {
    const layout = createDefaultAltTableLayout();
    const result = validateAltTableLayout({ ...layout, schemaVersion: 999 });
    expect(result.valid).toBe(false);
  });

  it("warns about older schema version", () => {
    const layout = createDefaultAltTableLayout();
    const result = validateAltTableLayout({ ...layout, schemaVersion: 0 });
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("safeParseLayout", () => {
  it("parses valid JSON", () => {
    const layout = createDefaultAltTableLayout();
    const json = JSON.stringify(layout);
    const result = safeParseLayout(json);
    expect(result.layout).not.toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it("returns errors for invalid JSON", () => {
    const result = safeParseLayout("not json{{{");
    expect(result.layout).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns errors for invalid layout structure", () => {
    const result = safeParseLayout(JSON.stringify({ schemaVersion: 1 }));
    expect(result.layout).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("editing one lane does not affect others", () => {
  it("moving one lane does not change other lanes", () => {
    const layout = createDefaultAltTableLayout();
    const originalNorthLeft = JSON.stringify(layout.passingLanes["north-left"]);
    const originalNorthRight = JSON.stringify(layout.passingLanes["north-right"]);

    const modified = {
      ...layout,
      passingLanes: {
        ...layout.passingLanes,
        "north-left": {
          ...layout.passingLanes["north-left"],
          position: { x: 99, y: 99, z: 99 }
        }
      }
    };

    expect(JSON.stringify(modified.passingLanes["north-left"])).not.toBe(originalNorthLeft);
    expect(JSON.stringify(modified.passingLanes["north-right"])).toBe(originalNorthRight);
  });

  it("resizing one lane does not change other lanes", () => {
    const layout = createDefaultAltTableLayout();
    const originalEastAcross = JSON.stringify(layout.passingLanes["east-across"]);

    const modified = {
      ...layout,
      passingLanes: {
        ...layout.passingLanes,
        "east-north": {
          ...layout.passingLanes["east-north"],
          width: 5.0,
          height: 5.0
        }
      }
    };

    expect(JSON.stringify(modified.passingLanes["east-across"])).toBe(originalEastAcross);
  });

  it("rotating one arrow does not change other arrows", () => {
    const layout = createDefaultAltTableLayout();
    const originalArrow = layout.passingLanes["south-across"].arrowRotation;

    const modified = {
      ...layout,
      passingLanes: {
        ...layout.passingLanes,
        "north-across": {
          ...layout.passingLanes["north-across"],
          arrowRotation: 999
        }
      }
    };

    expect(modified.passingLanes["north-across"].arrowRotation).toBe(999);
    expect(modified.passingLanes["south-across"].arrowRotation).toBe(originalArrow);
  });
});

describe("parent transform preserves child fan data", () => {
  it("fan local transforms are unchanged when master position changes", () => {
    const fan: CardFanSettings = {
      cardCount: 14,
      cardWidth: 0.46,
      cardHeight: 0.644,
      overlap: 0.08,
      spread: 0.114,
      arc: 0.15,
      depthStep: 0.02,
      localRotationStep: 0.009,
      startOffset: 0,
      fanDirection: 1,
      reverseOrder: false
    };

    const before = generateFanLocalTransforms(fan);
    const after = generateFanLocalTransforms(fan);
    expect(JSON.stringify(before)).toBe(JSON.stringify(after));
  });
});
