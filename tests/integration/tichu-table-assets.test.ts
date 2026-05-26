import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AUTHORED_PASS_DIRECTIONS,
  DESIGN_H,
  DESIGN_W,
  EAST_WEST_ACROSS_ANCHOR_IDS,
  EAST_WEST_VERTICAL_ANCHOR_IDS,
  PASSING_ANCHOR_JSON_SOURCE_PATH,
  PASSING_ANCHORS,
  PRODUCTION_PASSING_OVERLAY_SOURCE_PATH,
  TABLE_PLATE_SOURCE_PATH,
  TICHU_TABLE_SOURCE_ROOT_URL,
  createDesignFitTransform,
  createPassingAnchorHitProjection,
  createPassingAnchorVisualProjection,
  getPassingAnchorCardOrientation,
  resolveSpecialCardSourcePath,
  resolveStandardCardSourcePath
} from "../../apps/web/src/tichu-table-assets";

const STANDARD_SUITS = ["swords", "pagodas", "jades", "stars"] as const;
const STANDARD_RANKS = [
  "A",
  "K",
  "Q",
  "J",
  "10",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2"
] as const;
const SPECIAL_CARDS = ["mahjong", "dog", "phoenix", "dragon"] as const;
const STYLESHEET_PATH = fileURLToPath(
  new URL("../../apps/web/src/styles.css", import.meta.url)
);

describe("tichu table authored assets", () => {
  it("keeps the authored design space fixed at 1536x1024", () => {
    expect(DESIGN_W).toBe(1536);
    expect(DESIGN_H).toBe(1024);
  });

  it("uses the locked v5 direction map with exactly 12 anchors", () => {
    expect(PASSING_ANCHORS).toHaveLength(12);

    for (const [id, direction] of Object.entries(AUTHORED_PASS_DIRECTIONS)) {
      const anchor = PASSING_ANCHORS.find((candidate) => candidate.id === id);
      expect(anchor).toBeTruthy();
      expect(anchor?.arrow_direction).toBe(direction);
    }
  });

  it("keeps the east and west north/south cards vertical and across cards horizontal", () => {
    expect(EAST_WEST_VERTICAL_ANCHOR_IDS).toEqual([
      "west_pass_north",
      "west_pass_south",
      "east_pass_north",
      "east_pass_south"
    ]);
    expect(EAST_WEST_ACROSS_ANCHOR_IDS).toEqual([
      "west_pass_across",
      "east_pass_across"
    ]);

    for (const anchorId of EAST_WEST_VERTICAL_ANCHOR_IDS) {
      expect(getPassingAnchorCardOrientation(anchorId)).toBe("vertical");
    }

    for (const anchorId of EAST_WEST_ACROSS_ANCHOR_IDS) {
      expect(getPassingAnchorCardOrientation(anchorId)).toBe("horizontal");
    }
  });

  it("does not flatten pass-card orientation after the anchor mapping is applied", () => {
    const stylesheet = readFileSync(STYLESHEET_PATH, "utf8");

    expect(stylesheet).not.toContain(
      ".normal-pass-lane__slot:not(.normal-pass-lane__slot--pickup-filled) .normal-card--route"
    );
  });

  it("keeps production overlay paths free of debug/red/sample/guide words", () => {
    expect(PRODUCTION_PASSING_OVERLAY_SOURCE_PATH.toLowerCase()).not.toContain(
      "debug"
    );
    expect(PRODUCTION_PASSING_OVERLAY_SOURCE_PATH.toLowerCase()).not.toContain(
      "red"
    );
    expect(PRODUCTION_PASSING_OVERLAY_SOURCE_PATH.toLowerCase()).not.toContain(
      "sample"
    );
    expect(PRODUCTION_PASSING_OVERLAY_SOURCE_PATH.toLowerCase()).not.toContain(
      "guide"
    );
  });

  it("pins the production table plate to the no-red plate asset", () => {
    expect(TABLE_PLATE_SOURCE_PATH).toContain(
      "table_plate_no_red_sample_guides_1536x1024.png"
    );
  });

  it("resolves existing card files for the full wuxia deck", () => {
    for (const suit of STANDARD_SUITS) {
      for (const rank of STANDARD_RANKS) {
        const path = resolveStandardCardSourcePath(suit, rank);
        expect(
          existsSync(fileURLToPath(new URL(path, TICHU_TABLE_SOURCE_ROOT_URL)))
        ).toBe(true);
      }
    }

    for (const special of SPECIAL_CARDS) {
      const path = resolveSpecialCardSourcePath(special);
      expect(
        existsSync(fileURLToPath(new URL(path, TICHU_TABLE_SOURCE_ROOT_URL)))
      ).toBe(true);
    }
  });

  it("keeps the anchor JSON in the authored asset pack", () => {
    expect(
      existsSync(
        fileURLToPath(
          new URL(PASSING_ANCHOR_JSON_SOURCE_PATH, TICHU_TABLE_SOURCE_ROOT_URL)
        )
      )
    ).toBe(true);
  });

  it("uses one uniform contain-fit scale", () => {
    const transform = createDesignFitTransform(1366, 768);

    expect(transform.scaleX).toBe(transform.scaleY);
    expect(transform.scale).toBe(transform.scaleX);
  });

  it("uses the same projection transform for pass visuals and hit regions", () => {
    const anchor = PASSING_ANCHORS.find(
      (candidate) => candidate.id === "north_pass_across"
    );
    expect(anchor).toBeTruthy();

    const visual = createPassingAnchorVisualProjection(anchor!, 1366, 768);
    const hit = createPassingAnchorHitProjection(anchor!, 1366, 768);

    expect(hit.transform).toEqual(visual.transform);
    expect(hit.polygon_px).toEqual(visual.polygon_px);
  });
});
