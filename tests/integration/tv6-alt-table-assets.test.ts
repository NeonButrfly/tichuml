import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DESIGN_H,
  DESIGN_W,
  LOCKED_PASS_ANCHORS,
  LOCKED_PASS_IDS,
  TV6_PASSING_ANCHOR_JSON_SRC,
  TV6_PASSING_OVERLAY_SRC,
  TV6_TABLE_PLATE_SRC,
  designToScreen,
  getTableTransform,
  projectDesignBBox
} from "../../apps/web/src/alt-table-3d/tv6-runtime";

const anchorPayload = JSON.parse(
  readFileSync(resolve("apps/web/public/tv6/p/a.json"), "utf8")
) as {
  anchors: Array<{
    id: keyof typeof LOCKED_PASS_ANCHORS;
    arrow_direction: string;
    slot_orientation: string;
    slot_rotation_deg: number;
    bbox_px: { x: number; y: number; w: number; h: number };
  }>;
};

describe("tv6 alt table assets", () => {
  it("passes the committed tv6 asset guard", () => {
    const result = spawnSync(
      "node",
      [
        "tools/tv6/check.mjs",
        "apps/web/public/tv6",
        "--lock",
        "tools/tv6/lock.json"
      ],
      {
        cwd: resolve("."),
        encoding: "utf8",
        shell: process.platform === "win32"
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("OK: tichu_v6 assets and lock validated");
  });

  it("matches the locked 12-anchor direction, orientation, and rotation map", () => {
    expect(anchorPayload.anchors).toHaveLength(12);

    for (const anchorId of LOCKED_PASS_IDS) {
      const actual = anchorPayload.anchors.find((anchor) => anchor.id === anchorId);
      const expected = LOCKED_PASS_ANCHORS[anchorId];
      expect(actual).toBeTruthy();
      expect(actual?.arrow_direction).toBe(expected.dir);
      expect(actual?.slot_orientation).toBe(expected.orientation);
      expect(actual?.slot_rotation_deg).toBe(expected.rot);
    }
  });

  it("keeps the production table and overlay paths pinned to /tv6 without old or debug variants", () => {
    expect(TV6_TABLE_PLATE_SRC).toBe("/tv6/t/plate.png");
    expect(TV6_PASSING_OVERLAY_SRC).toBe("/tv6/p/o.png");
    expect(TV6_PASSING_ANCHOR_JSON_SRC).toBe("/tv6/p/a.json");

    for (const assetPath of [
      TV6_TABLE_PLATE_SRC,
      TV6_PASSING_OVERLAY_SRC,
      TV6_PASSING_ANCHOR_JSON_SRC
    ]) {
      expect(assetPath).not.toMatch(/v3|v4|v5|debug|sample|red/i);
    }
  });

  it("uses one uniform contain-fit transform for both points and anchor boxes", () => {
    const transform = getTableTransform(1280, 720);
    const point = designToScreen(768, 512, 1280, 720);
    const bbox = projectDesignBBox({ x: 729, y: 170, w: 78, h: 122 }, 1280, 720);

    expect(DESIGN_W).toBe(1536);
    expect(DESIGN_H).toBe(1024);
    expect(transform.scale).toBeCloseTo(Math.min(1280 / 1536, 720 / 1024), 8);
    expect(point.scale).toBeCloseTo(transform.scale, 8);
    expect(bbox.width / 78).toBeCloseTo(transform.scale, 8);
    expect(bbox.height / 122).toBeCloseTo(transform.scale, 8);
  });
});
