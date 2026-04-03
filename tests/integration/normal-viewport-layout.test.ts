import { describe, expect, it } from "vitest";
import {
  computeNormalViewportLayoutMetrics,
  DEFAULT_NORMAL_TABLE_LAYOUT,
  NORMAL_LAYOUT_ELEMENT_SPECS,
  NORMAL_PASS_LANE_LAYOUT_IDS,
  NORMAL_PASS_STAGE_MAP,
  resolveNormalPassLaneGeometry
} from "../../apps/web/src/game-table-views";

describe("normal viewport table layout", () => {
  it.each([
    { width: 1920, height: 1080 },
    { width: 1600, height: 900 },
    { width: 1366, height: 768 }
  ])(
    "fits the full table inside %sx%s without shrinking cards into the broken range",
    ({ width, height }) => {
      const metrics = computeNormalViewportLayoutMetrics({
        viewportWidth: width,
        viewportHeight: height,
        topCount: 14,
        bottomCount: 14,
        leftCount: 14,
        rightCount: 14,
        hasVariantPicker: true,
        hasWishPicker: true
      });

      const availableWidth = metrics.viewportWidth - metrics.shellPaddingX * 2;
      const availableHeight =
        metrics.viewportHeight - metrics.shellPaddingY * 2;
      const requiredMiddleWidth =
        metrics.sideColumnWidth * 2 +
        metrics.minimumMiddleWidth +
        metrics.bandGap * 2;

      expect(metrics.totalRequiredHeight).toBeLessThanOrEqual(availableHeight);
      expect(requiredMiddleWidth).toBeLessThanOrEqual(availableWidth);
      expect(metrics.cardWidth).toBeGreaterThan(58);
      expect(metrics.centerBandHeight).toBeGreaterThanOrEqual(
        metrics.minimumMiddleHeight
      );
    }
  );

  it.each([
    { width: 1920, height: 1080 },
    { width: 1600, height: 900 },
    { width: 1366, height: 768 }
  ])(
    "keeps a 5:7 card ratio with compact opponent fans and a wider south fan at %sx%s",
    ({ width, height }) => {
      const metrics = computeNormalViewportLayoutMetrics({
        viewportWidth: width,
        viewportHeight: height,
        topCount: 8,
        bottomCount: 8,
        leftCount: 8,
        rightCount: 8,
        hasVariantPicker: false,
        hasWishPicker: false
      });

      expect(metrics.cardHeight).toBe(Math.round((metrics.cardWidth * 7) / 5));
      expect(metrics.cardWidth).toBeLessThan(96);
      expect(metrics.topCardStep).toBeLessThan(metrics.cardWidth);
      expect(metrics.sideCardStep).toBeLessThan(metrics.cardWidth);
      expect(metrics.bottomCardStep).toBeGreaterThan(metrics.topCardStep);
      expect(metrics.bottomCardStep).toBeGreaterThan(metrics.sideCardStep);
    }
  );

  it("uses the required seat-relative pass direction mapping", () => {
    expect(NORMAL_PASS_STAGE_MAP.top).toEqual([
      { targetPosition: "left", direction: "left" },
      { targetPosition: "bottom", direction: "down" },
      { targetPosition: "right", direction: "right" }
    ]);
    expect(NORMAL_PASS_STAGE_MAP.left).toEqual([
      { targetPosition: "top", direction: "up" },
      { targetPosition: "bottom", direction: "down" },
      { targetPosition: "right", direction: "right" }
    ]);
    expect(NORMAL_PASS_STAGE_MAP.right).toEqual([
      { targetPosition: "top", direction: "up" },
      { targetPosition: "bottom", direction: "down" },
      { targetPosition: "left", direction: "left" }
    ]);
    expect(NORMAL_PASS_STAGE_MAP.bottom).toEqual([
      { targetPosition: "left", direction: "left" },
      { targetPosition: "top", direction: "up" },
      { targetPosition: "right", direction: "right" }
    ]);
  });

  it.each([
    { width: 1920, height: 1080 },
    { width: 1600, height: 900 },
    { width: 1366, height: 768 }
  ])(
    "keeps pass lanes smaller than hand cards at %sx%s",
    ({ width, height }) => {
      const metrics = computeNormalViewportLayoutMetrics({
        viewportWidth: width,
        viewportHeight: height,
        topCount: 8,
        bottomCount: 8,
        leftCount: 8,
        rightCount: 8,
        hasVariantPicker: false,
        hasWishPicker: false
      });

      expect(metrics.routeCardWidth).toBeLessThan(metrics.cardWidth);
      expect(metrics.routeCardHeight).toBeLessThan(metrics.cardHeight);
    }
  );

  it("derives live pass lane geometry from the editor layout definitions", () => {
    const metrics = computeNormalViewportLayoutMetrics({
      viewportWidth: 1600,
      viewportHeight: 900,
      topCount: 8,
      bottomCount: 8,
      leftCount: 8,
      rightCount: 8,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const routeScale = metrics.routeCardWidth / 60;

    (["top", "right", "bottom", "left"] as const).forEach((sourcePosition) => {
      NORMAL_PASS_STAGE_MAP[sourcePosition].forEach((laneSpec) => {
        const elementId =
          NORMAL_PASS_LANE_LAYOUT_IDS[sourcePosition][laneSpec.targetPosition];

        expect(elementId).toBeTruthy();

        const geometry = resolveNormalPassLaneGeometry({
          normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
          layoutMetrics: metrics,
          sourcePosition,
          targetPosition: laneSpec.targetPosition,
          direction: laneSpec.direction
        });

        expect(geometry).not.toBeNull();
        expect(geometry?.elementId).toBe(elementId);
        expect(geometry?.rotation).toBe(
          DEFAULT_NORMAL_TABLE_LAYOUT[elementId!].rotation
        );
        expect(geometry?.style.left).toBe(
          `${DEFAULT_NORMAL_TABLE_LAYOUT[elementId!].x * 100}%`
        );
        expect(geometry?.style.top).toBe(
          `${DEFAULT_NORMAL_TABLE_LAYOUT[elementId!].y * 100}%`
        );
        expect(geometry?.width).toBe(
          Math.round(NORMAL_LAYOUT_ELEMENT_SPECS[elementId!].width * routeScale)
        );
        expect(geometry?.height).toBe(
          Math.round(NORMAL_LAYOUT_ELEMENT_SPECS[elementId!].height * routeScale)
        );
      });
    });
  });
});
