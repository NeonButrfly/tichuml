import { describe, expect, it } from "vitest";
import {
  computeNormalViewportLayoutMetrics,
  DEFAULT_NORMAL_TABLE_LAYOUT,
  getBoardBounds,
  getNormalSeatLayout,
  getNormalTableSpacing,
  getNormalTrickFanMetrics,
  NORMAL_BOARD_INSET,
  NORMAL_LAYOUT_ELEMENT_SPECS,
  NORMAL_PASS_LANE_LAYOUT_IDS,
  NORMAL_PASS_STAGE_MAP,
  resolveNormalActionRowRegionStyle,
  resolveNormalBoardAnchorPoint,
  resolveNormalSeatAnchorGeometry,
  resolveNormalSeatRegionStyle,
  resolveNormalPassLaneGeometry
} from "../../apps/web/src/game-table-views";

type TestRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function isQuarterTurn(rotation: number) {
  return Math.abs(rotation % 180) === 90;
}

function getVisualRectSize(size: {
  width: number;
  height: number;
  rotation: number;
}) {
  return isQuarterTurn(size.rotation)
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}

function centeredRect(config: {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}): TestRect {
  return {
    left: config.centerX - config.width / 2,
    top: config.centerY - config.height / 2,
    right: config.centerX + config.width / 2,
    bottom: config.centerY + config.height / 2,
    width: config.width,
    height: config.height
  };
}

function styleCenter(style: { left?: unknown; top?: unknown }) {
  return {
    x: parseFloat(String(style.left)),
    y: parseFloat(String(style.top))
  };
}

function laneVisualRect(geometry: NonNullable<ReturnType<typeof resolveNormalPassLaneGeometry>>) {
  const center = styleCenter(geometry.style);
  const visualSize = getVisualRectSize({
    width: geometry.width,
    height: geometry.height,
    rotation: geometry.rotation
  });

  return centeredRect({
    centerX: center.x,
    centerY: center.y,
    width: visualSize.width,
    height: visualSize.height
  });
}

function rectsOverlap(first: TestRect, second: TestRect) {
  return !(
    first.right <= second.left ||
    first.left >= second.right ||
    first.bottom <= second.top ||
    first.top >= second.bottom
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

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
      { targetPosition: "right", direction: "right" },
      { targetPosition: "bottom", direction: "down" }
    ]);
    expect(NORMAL_PASS_STAGE_MAP.right).toEqual([
      { targetPosition: "top", direction: "up" },
      { targetPosition: "left", direction: "left" },
      { targetPosition: "bottom", direction: "down" }
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

  it("derives live pass lane geometry from canonical seat anchors", () => {
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
    const spacing = getNormalTableSpacing(metrics);
    const sourceHandCardCount = 8;
    const playSurfaceCenter = resolveNormalBoardAnchorPoint(
      DEFAULT_NORMAL_TABLE_LAYOUT.playSurface,
      metrics
    );
    const laneGapMin = clamp(
      Math.round(metrics.routeCardWidth * 0.12),
      4,
      8
    );
    const topAcrossLaneNudge = clamp(
      Math.round(metrics.routeCardHeight * 0.1),
      6,
      10
    );
    const bottomAcrossLaneNudge = clamp(
      Math.round(metrics.routeCardHeight * 0.06),
      0,
      6
    );

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
          direction: laneSpec.direction,
          sourceHandCardCount
        });

        expect(geometry).not.toBeNull();
        expect(geometry?.elementId).toBe(elementId);
        expect(
          String(geometry?.style["--normal-pass-token-rotation" as keyof typeof geometry.style])
        ).toBe("undefined");
        const expectedVisibleRotation =
          laneSpec.targetPosition ===
          (sourcePosition === "top"
            ? "bottom"
            : sourcePosition === "bottom"
              ? "top"
              : sourcePosition === "left"
                ? "right"
                : "left")
            ? "0deg"
            : sourcePosition === "top"
              ? laneSpec.targetPosition === "right"
                ? "-90deg"
                : "90deg"
              : sourcePosition === "bottom"
                ? laneSpec.targetPosition === "right"
                  ? "90deg"
                  : "-90deg"
                : sourcePosition === "left"
                  ? laneSpec.targetPosition === "top"
                    ? "-90deg"
                    : "90deg"
                  : laneSpec.targetPosition === "bottom"
                    ? "90deg"
                    : "-90deg";
        expect(`${geometry?.rotation}deg`).toBe(expectedVisibleRotation);
        expect(
          String(geometry?.style["--normal-pass-visible-rotation" as keyof typeof geometry.style])
        ).toBe(expectedVisibleRotation);
        const size = {
          width: Math.round(NORMAL_LAYOUT_ELEMENT_SPECS[elementId!].width * routeScale),
          height: Math.round(NORMAL_LAYOUT_ELEMENT_SPECS[elementId!].height * routeScale)
        };
        const laneRotation = parseFloat(expectedVisibleRotation);
        const visualSize = getVisualRectSize({
          ...size,
          rotation: laneRotation
        });
        const sourceAnchor = resolveNormalSeatAnchorGeometry({
          position: sourcePosition,
          normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
          layoutMetrics: metrics,
          handCardCount: sourceHandCardCount
        });
        const laneOrder = NORMAL_PASS_STAGE_MAP[sourcePosition].map(
          (candidateLane) => candidateLane.targetPosition
        );
        const partnerTargetPosition =
          sourcePosition === "top"
            ? "bottom"
            : sourcePosition === "bottom"
              ? "top"
              : sourcePosition === "left"
                ? "right"
                : "left";
        const partnerLaneIndex = laneOrder.indexOf(partnerTargetPosition);
        const laneIndex = laneOrder.indexOf(laneSpec.targetPosition);
        const partnerRelativeIndex =
          laneSpec.targetPosition === partnerTargetPosition
            ? 0
            : laneIndex < partnerLaneIndex
              ? -1
              : 1;
        const partnerElementId =
          NORMAL_PASS_LANE_LAYOUT_IDS[sourcePosition][partnerTargetPosition];
        const partnerSize = {
          width: Math.round(
            NORMAL_LAYOUT_ELEMENT_SPECS[partnerElementId!].width * routeScale
          ),
          height: Math.round(
            NORMAL_LAYOUT_ELEMENT_SPECS[partnerElementId!].height * routeScale
          )
        };
        const partnerVisualSize = getVisualRectSize({
          ...partnerSize,
          rotation: 0
        });
        const laneClusterStep =
          sourcePosition === "top" || sourcePosition === "bottom"
            ? partnerVisualSize.width / 2 +
              laneGapMin +
              visualSize.width / 2
            : partnerVisualSize.height / 2 +
              laneGapMin +
              visualSize.height / 2;
        const expectedLeft =
          sourcePosition === "left"
            ? sourceAnchor.handBounds.right +
              spacing.handToLaneGap +
              partnerVisualSize.width / 2
            : sourcePosition === "right"
              ? sourceAnchor.handBounds.left -
                spacing.handToLaneGap -
                partnerVisualSize.width / 2
              : playSurfaceCenter.x + partnerRelativeIndex * laneClusterStep;
        const expectedTop =
          sourcePosition === "top"
            ? sourceAnchor.handBounds.bottom +
              spacing.handToLaneGap +
              partnerVisualSize.height / 2 -
              topAcrossLaneNudge
            : sourcePosition === "bottom"
              ? sourceAnchor.handBounds.top -
                spacing.handToLaneGap -
                partnerVisualSize.height / 2 +
                bottomAcrossLaneNudge
              : playSurfaceCenter.y + partnerRelativeIndex * laneClusterStep;
        expect(geometry?.style.left).toBe(
          `${expectedLeft}px`
        );
        expect(geometry?.style.top).toBe(
          `${expectedTop}px`
        );
        expect(geometry?.width).toBe(size.width);
        expect(geometry?.height).toBe(size.height);
      });
    });
  });

  it.each([
    { width: 1920, height: 1080 },
    { width: 1600, height: 900 },
    { width: 1366, height: 768 }
  ])(
    "keeps pass lanes hand-clear while trick anchors reuse the same seat-local region at %sx%s",
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
      const spacing = getNormalTableSpacing(metrics);
      const playSurfaceCenter = resolveNormalBoardAnchorPoint(
        DEFAULT_NORMAL_TABLE_LAYOUT.playSurface,
        metrics
      );
      const sourcePositions = ["top", "right", "bottom", "left"] as const;

      sourcePositions.forEach((sourcePosition) => {
        const sourceAnchor = resolveNormalSeatAnchorGeometry({
          position: sourcePosition,
          normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
          layoutMetrics: metrics,
          handCardCount: 8
        });
        const seatLayout = getNormalSeatLayout({
          position: sourcePosition,
          normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
          layoutMetrics: metrics,
          handCardCount: 8
        });
        const stageCenter = styleCenter(seatLayout.trickZone);
        const laneGeometries = NORMAL_PASS_STAGE_MAP[sourcePosition].map((laneSpec) => {
          const laneGeometry = resolveNormalPassLaneGeometry({
            normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
            layoutMetrics: metrics,
            sourcePosition,
            targetPosition: laneSpec.targetPosition,
            direction: laneSpec.direction,
            sourceHandCardCount: 8
          });

          expect(laneGeometry).not.toBeNull();
          return laneGeometry!;
        });
        const laneRects = laneGeometries.map((laneGeometry) =>
          laneVisualRect(laneGeometry)
        );
        const leftOrTopLane = styleCenter(laneGeometries[0]!.style);
        const centerLane = styleCenter(laneGeometries[1]!.style);
        const rightOrBottomLane = styleCenter(laneGeometries[2]!.style);

        laneRects.forEach((laneRect, laneIndex) => {
          expect(rectsOverlap(laneRect, sourceAnchor.handBounds)).toBe(false);

          laneRects.slice(laneIndex + 1).forEach((otherLaneRect) => {
            expect(rectsOverlap(laneRect, otherLaneRect)).toBe(false);
          });
        });

        if (sourcePosition === "top") {
          const alignedCenterY = centerLane.y;
          laneRects.forEach((laneRect) => {
            expect(laneRect.top + laneRect.height / 2).toBeCloseTo(
              alignedCenterY,
              5
            );
            expect(laneRect.top).toBeGreaterThanOrEqual(
              sourceAnchor.handBounds.bottom + spacing.handToLaneGap - 12
            );
          });
          expect(centerLane.x).toBeCloseTo(playSurfaceCenter.x, 5);
          expect(centerLane.x - leftOrTopLane.x).toBeCloseTo(
            rightOrBottomLane.x - centerLane.x,
            5
          );
          expect(Math.abs(stageCenter.x - centerLane.x)).toBeLessThanOrEqual(6);
          expect(Math.abs(stageCenter.y - centerLane.y)).toBeLessThanOrEqual(6);
        }

        if (sourcePosition === "bottom") {
          const alignedCenterY = centerLane.y;
          laneRects.forEach((laneRect) => {
            expect(laneRect.top + laneRect.height / 2).toBeCloseTo(
              alignedCenterY,
              5
            );
            expect(laneRect.bottom).toBeLessThanOrEqual(
              sourceAnchor.handBounds.top - spacing.handToLaneGap + 8
            );
          });
          expect(centerLane.x).toBeCloseTo(playSurfaceCenter.x, 5);
          expect(centerLane.x - leftOrTopLane.x).toBeCloseTo(
            rightOrBottomLane.x - centerLane.x,
            5
          );
          expect(Math.abs(stageCenter.x - centerLane.x)).toBeLessThanOrEqual(6);
          expect(Math.abs(stageCenter.y - centerLane.y)).toBeLessThanOrEqual(6);
        }

        if (sourcePosition === "left") {
          const alignedCenterX = centerLane.x;
          laneRects.forEach((laneRect) => {
            expect(laneRect.left + laneRect.width / 2).toBeCloseTo(
              alignedCenterX,
              5
            );
            expect(laneRect.left).toBeGreaterThanOrEqual(
              sourceAnchor.handBounds.right + spacing.handToLaneGap
            );
          });
          expect(centerLane.y).toBeCloseTo(playSurfaceCenter.y, 5);
          expect(centerLane.y - leftOrTopLane.y).toBeCloseTo(
            rightOrBottomLane.y - centerLane.y,
            5
          );
          expect(Math.abs(stageCenter.x - centerLane.x)).toBeLessThanOrEqual(6);
          expect(Math.abs(stageCenter.y - centerLane.y)).toBeLessThanOrEqual(6);
        }

        if (sourcePosition === "right") {
          const alignedCenterX = centerLane.x;
          laneRects.forEach((laneRect) => {
            expect(laneRect.left + laneRect.width / 2).toBeCloseTo(
              alignedCenterX,
              5
            );
            expect(laneRect.right).toBeLessThanOrEqual(
              sourceAnchor.handBounds.left - spacing.handToLaneGap
            );
          });
          expect(centerLane.y).toBeCloseTo(playSurfaceCenter.y, 5);
          expect(centerLane.y - leftOrTopLane.y).toBeCloseTo(
            rightOrBottomLane.y - centerLane.y,
            5
          );
          expect(Math.abs(stageCenter.x - centerLane.x)).toBeLessThanOrEqual(6);
          expect(Math.abs(stageCenter.y - centerLane.y)).toBeLessThanOrEqual(6);
        }
      });
    }
  );

  it("keeps east and west labels outside their hands and centers both side seat regions on the hand anchors", () => {
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
    const board = getBoardBounds(metrics);
    const westSeatLayout = getNormalSeatLayout({
      position: "left",
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics,
      handCardCount: 8
    });
    const eastSeatLayout = getNormalSeatLayout({
      position: "right",
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics,
      handCardCount: 8
    });
    const westAnchor = resolveNormalSeatAnchorGeometry({
      position: "left",
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics,
      handCardCount: 8
    });
    const eastAnchor = resolveNormalSeatAnchorGeometry({
      position: "right",
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics,
      handCardCount: 8
    });
    const westLabelX = parseFloat(String(westSeatLayout.nameLabel.left));
    const eastLabelX = parseFloat(String(eastSeatLayout.nameLabel.left));
    const sideLabelBorderLeft = board.left - NORMAL_BOARD_INSET.left;
    const sideLabelBorderRight = board.right + NORMAL_BOARD_INSET.right;

    expect(westLabelX).toBe(
      (sideLabelBorderLeft + westAnchor.handBounds.left) / 2
    );
    expect(parseFloat(String(westSeatLayout.nameLabel.top))).toBe(
      westAnchor.hand.y
    );
    expect(eastLabelX).toBe(
      (eastAnchor.handBounds.right + sideLabelBorderRight) / 2
    );
    expect(parseFloat(String(eastSeatLayout.nameLabel.top))).toBe(
      eastAnchor.hand.y
    );
    expect(westLabelX).toBeGreaterThan(board.left + 20);
    expect(eastLabelX).toBeLessThan(board.right - 20);

    const westRegion = resolveNormalSeatRegionStyle({
      position: "left",
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics,
      handCardCount: 8
    });
    const eastRegion = resolveNormalSeatRegionStyle({
      position: "right",
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics,
      handCardCount: 8
    });
    const westRegionCenterX =
      parseFloat(String(westRegion.left)) +
      parseFloat(String(westRegion.width)) / 2;
    const eastRegionCenterX =
      parseFloat(String(eastRegion.left)) +
      parseFloat(String(eastRegion.width)) / 2;
    const westRegionCenterY =
      parseFloat(String(westRegion.top)) +
      parseFloat(String(westRegion.height)) / 2;
    const eastRegionCenterY =
      parseFloat(String(eastRegion.top)) +
      parseFloat(String(eastRegion.height)) / 2;

    expect(westRegionCenterX).toBeCloseTo(westAnchor.hand.x, 5);
    expect(eastRegionCenterX).toBeCloseTo(eastAnchor.hand.x, 5);
    expect(westRegionCenterY).toBeCloseTo(westAnchor.hand.y, 5);
    expect(eastRegionCenterY).toBeCloseTo(eastAnchor.hand.y, 5);
    expect(westAnchor.hand.y).toBeCloseTo(eastAnchor.hand.y, 5);
    expect(westAnchor.hand.y).toBeCloseTo(
      resolveNormalBoardAnchorPoint(
        DEFAULT_NORMAL_TABLE_LAYOUT.playSurface,
        metrics
      ).y,
      5
    );
  });

  it("keeps north and south labels attached to hand bounds and puts actions below south", () => {
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
    const spacing = getNormalTableSpacing(metrics);
    const northAnchor = resolveNormalSeatAnchorGeometry({
      position: "top",
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics,
      handCardCount: 8
    });
    const southAnchor = resolveNormalSeatAnchorGeometry({
      position: "bottom",
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics,
      handCardCount: 8
    });
    const northLayout = getNormalSeatLayout({
      position: "top",
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics,
      handCardCount: 8
    });
    const southLayout = getNormalSeatLayout({
      position: "bottom",
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics,
      handCardCount: 8
    });
    const actionRow = resolveNormalActionRowRegionStyle({
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics
    });
    const actionTop = parseFloat(String(actionRow.top));
    const scoreAnchor = resolveNormalBoardAnchorPoint(
      DEFAULT_NORMAL_TABLE_LAYOUT.scoreBadge,
      metrics
    );
    const northLabelCenterY = parseFloat(String(northLayout.nameLabel.top));
    const northHandGap =
      northAnchor.handBounds.top -
      (northLabelCenterY + NORMAL_LAYOUT_ELEMENT_SPECS.northLabel.height / 2);

    expect(northLabelCenterY).toBeCloseTo(
      scoreAnchor.y +
        NORMAL_LAYOUT_ELEMENT_SPECS.scoreBadge.height / 2 +
        spacing.northToScoreGap +
        NORMAL_LAYOUT_ELEMENT_SPECS.northLabel.height / 2,
      5
    );
    expect(
      northAnchor.handBounds.top -
        (northLabelCenterY + NORMAL_LAYOUT_ELEMENT_SPECS.northLabel.height / 2)
    ).toBeGreaterThanOrEqual(spacing.handToLabelGap - 8);
    expect(northLabelCenterY).toBeGreaterThan(
      scoreAnchor.y + NORMAL_LAYOUT_ELEMENT_SPECS.scoreBadge.height / 2
    );
    expect(northHandGap).toBeLessThanOrEqual(spacing.handToLabelGap);
    expect(parseFloat(String(southLayout.nameLabel.top))).toBeCloseTo(
      southAnchor.handBounds.bottom +
        spacing.handToLabelGap +
        NORMAL_LAYOUT_ELEMENT_SPECS.southLabel.height / 2,
      5
    );
    expect(actionTop).toBeGreaterThan(
      parseFloat(String(southLayout.nameLabel.top)) +
        NORMAL_LAYOUT_ELEMENT_SPECS.southLabel.height / 2
    );
  });

  it("keeps side anchors mirrored and uses straight stage and identity axes", () => {
    expect(DEFAULT_NORMAL_TABLE_LAYOUT.westHand.x).toBeCloseTo(
      1 - DEFAULT_NORMAL_TABLE_LAYOUT.eastHand.x,
      6
    );

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

    const layouts = {
      top: getNormalSeatLayout({
        position: "top",
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        layoutMetrics: metrics,
        handCardCount: 8
      }),
      right: getNormalSeatLayout({
        position: "right",
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        layoutMetrics: metrics,
        handCardCount: 8
      }),
      bottom: getNormalSeatLayout({
        position: "bottom",
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        layoutMetrics: metrics,
        handCardCount: 8
      }),
      left: getNormalSeatLayout({
        position: "left",
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        layoutMetrics: metrics,
        handCardCount: 8
      })
    };
    const anchors = {
      top: resolveNormalSeatAnchorGeometry({
        position: "top",
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        layoutMetrics: metrics,
        handCardCount: 8
      }),
      right: resolveNormalSeatAnchorGeometry({
        position: "right",
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        layoutMetrics: metrics,
        handCardCount: 8
      }),
      bottom: resolveNormalSeatAnchorGeometry({
        position: "bottom",
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        layoutMetrics: metrics,
        handCardCount: 8
      }),
      left: resolveNormalSeatAnchorGeometry({
        position: "left",
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        layoutMetrics: metrics,
        handCardCount: 8
      })
    };

    expect(parseFloat(String(layouts.top.trickZone.top))).toBeGreaterThan(
      anchors.top.handBounds.bottom
    );
    expect(parseFloat(String(layouts.bottom.trickZone.top))).toBeLessThan(
      anchors.bottom.handBounds.top
    );
    expect(parseFloat(String(layouts.left.trickZone.left))).toBeGreaterThan(
      anchors.left.handBounds.right
    );
    expect(parseFloat(String(layouts.right.trickZone.left))).toBeLessThan(
      anchors.right.handBounds.left
    );

    expect(parseFloat(String(layouts.top.callBadge.left))).toBeGreaterThan(
      parseFloat(String(layouts.top.nameLabel.left))
    );
    expect(parseFloat(String(layouts.bottom.callBadge.left))).toBeLessThan(
      parseFloat(String(layouts.bottom.nameLabel.left))
    );
    expect(parseFloat(String(layouts.left.callBadge.top))).toBeLessThan(
      anchors.left.handBounds.top
    );
    expect(parseFloat(String(layouts.left.callBadge.left))).toBeLessThan(
      anchors.left.hand.x
    );
    expect(parseFloat(String(layouts.left.outBadge.left))).toBeGreaterThan(
      anchors.left.hand.x
    );
    expect(parseFloat(String(layouts.right.callBadge.top))).toBeLessThan(
      anchors.right.handBounds.top
    );
    expect(parseFloat(String(layouts.right.callBadge.left))).toBeLessThan(
      anchors.right.hand.x
    );
    expect(parseFloat(String(layouts.right.outBadge.left))).toBeGreaterThan(
      anchors.right.hand.x
    );

    expect(layouts.left.axis).toBe("vertical");
    expect(layouts.right.axis).toBe("vertical");
    expect(layouts.left.handFanDirection).toBe("vertical");
    expect(layouts.right.handFanDirection).toBe("vertical");

    expect(getNormalTrickFanMetrics("top", 60)).toMatchObject({
      cardDy: 0,
      rotationStep: 0
    });
    expect(getNormalTrickFanMetrics("bottom", 60)).toMatchObject({
      cardDy: 0,
      rotationStep: 0
    });
    expect(getNormalTrickFanMetrics("left", 60)).toMatchObject({
      cardDx: 0,
      rotationStep: 0
    });
    expect(getNormalTrickFanMetrics("right", 60)).toMatchObject({
      cardDx: 0,
      rotationStep: 0
    });
  });
});
