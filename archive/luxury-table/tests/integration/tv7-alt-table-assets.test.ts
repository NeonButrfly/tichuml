import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DESIGN_H,
  DESIGN_W,
  LOCKED_PASS_ANCHORS,
  LOCKED_PASS_IDS,
  TV7_CARD_ANCHOR_JSON_SRC,
  TV7_PASSING_ANCHOR_JSON_SRC,
  TV7_PASSING_OVERLAY_SRC,
  TV7_TABLE_PLATE_SRC,
  designToScreen,
  getTableTransform,
  projectDesignBBox
} from "../../apps/web/src/alt-table-3d/tv7-runtime";

const passPayload = JSON.parse(
  readFileSync(resolve("apps/web/public/tv7/p/a.json"), "utf8")
) as {
  anchors: Array<{
    id: keyof typeof LOCKED_PASS_ANCHORS;
    arrow_direction: string;
    slot_orientation: string;
    slot_rotation_deg: number;
    bbox_px: { x: number; y: number; w: number; h: number };
  }>;
};

const cardPayload = JSON.parse(
  readFileSync(resolve("apps/web/public/tv7/h/a.json"), "utf8")
) as {
  anchors: Array<{
    id: string;
    zone: string;
    layout_source: string;
  }>;
};

describe("tv7 alt table assets", () => {
  it("passes the committed tv7 asset guard", () => {
    const result = spawnSync(
      "node",
      ["apps/web/public/tv7/x/check.mjs", "apps/web/public/tv7"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        shell: process.platform === "win32"
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("OK tichu_v7");
  });

  it("matches the locked 12-anchor passing direction, orientation, and rotation map", () => {
    expect(passPayload.anchors).toHaveLength(12);

    for (const anchorId of LOCKED_PASS_IDS) {
      const actual = passPayload.anchors.find((anchor) => anchor.id === anchorId);
      const expected = LOCKED_PASS_ANCHORS[anchorId];
      expect(actual).toBeTruthy();
      expect(actual?.arrow_direction).toBe(expected.dir);
      expect(actual?.slot_orientation).toBe(expected.orientation);
      expect(actual?.slot_rotation_deg).toBe(expected.rot);
    }
  });

  it("uses the committed 58-card prototype anchor layer with the expected zone counts", () => {
    expect(cardPayload.anchors).toHaveLength(58);

    const zoneCounts = cardPayload.anchors.reduce<Record<string, number>>(
      (counts, anchor) => {
        counts[anchor.zone] = (counts[anchor.zone] ?? 0) + 1;
        return counts;
      },
      {}
    );

    expect(zoneCounts.south_hand).toBe(14);
    expect(zoneCounts.north_hand).toBe(14);
    expect(zoneCounts.east_hand).toBe(14);
    expect(zoneCounts.west_hand).toBe(14);
    expect(zoneCounts.deck).toBe(1);
    expect(zoneCounts.discard).toBe(1);
    expect(
      cardPayload.anchors.every(
        (anchor) => anchor.layout_source === "prototype_layer"
      )
    ).toBe(true);
  });

  it("keeps the production paths pinned to /tv7 without older or debug asset roots", () => {
    expect(TV7_TABLE_PLATE_SRC).toBe("/tv7/t/plate.png");
    expect(TV7_PASSING_OVERLAY_SRC).toBe("/tv7/p/o.png");
    expect(TV7_PASSING_ANCHOR_JSON_SRC).toBe("/tv7/p/a.json");
    expect(TV7_CARD_ANCHOR_JSON_SRC).toBe("/tv7/h/a.json");

    for (const assetPath of [
      TV7_TABLE_PLATE_SRC,
      TV7_PASSING_OVERLAY_SRC,
      TV7_PASSING_ANCHOR_JSON_SRC,
      TV7_CARD_ANCHOR_JSON_SRC
    ]) {
      expect(assetPath).not.toMatch(/tv6|v3|v4|v5|debug|sample|red/i);
    }
  });

  it("uses one uniform contain-fit transform for points, pass anchors, and card anchors", () => {
    const transform = getTableTransform(1280, 720);
    const point = designToScreen(768, 512, 1280, 720);
    const passBox = projectDesignBBox(
      passPayload.anchors[0]!.bbox_px,
      1280,
      720
    );
    const cardBox = projectDesignBBox(
      {
        x: 167.149,
        y: 703.105,
        w: 155.702,
        h: 223.79
      },
      1280,
      720
    );

    expect(DESIGN_W).toBe(1536);
    expect(DESIGN_H).toBe(1024);
    expect(transform.scale).toBeCloseTo(Math.min(1280 / 1536, 720 / 1024), 8);
    expect(point.scale).toBeCloseTo(transform.scale, 8);
    expect(passBox.width / passPayload.anchors[0]!.bbox_px.w).toBeCloseTo(
      transform.scale,
      8
    );
    expect(cardBox.height / 223.79).toBeCloseTo(transform.scale, 8);
  });
});
