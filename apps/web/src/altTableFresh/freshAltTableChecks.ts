import { DESIGN_H, DESIGN_W } from "./tableFit";
import {
  makeNorthHandAnchors,
  makePassingAnchors,
  makeSideHandAnchors,
  makeSouthHandAnchors
} from "./freshTableMath";

export const FRESH_ALT_TABLE_SRC = "/table/table.png";
export const FRESH_ALT_CARD_BACK_SRC = "/tv_ed/c/back/green.png";

export function getFreshAltTableSnapshotModel() {
  return {
    tableSrc: FRESH_ALT_TABLE_SRC,
    design: { w: DESIGN_W, h: DESIGN_H },
    oldMathRemoved: true,
    cards: {
      north: makeNorthHandAnchors(),
      west: makeSideHandAnchors("west"),
      east: makeSideHandAnchors("east"),
      south: makeSouthHandAnchors()
    },
    passing: makePassingAnchors()
  };
}

export function runFreshAltTableChecks() {
  const north = makeNorthHandAnchors();
  const west = makeSideHandAnchors("west");
  const east = makeSideHandAnchors("east");
  const passing = makePassingAnchors();

  return {
    tableSrc: FRESH_ALT_TABLE_SRC,
    cardBackSrc: FRESH_ALT_CARD_BACK_SRC,
    designW: DESIGN_W,
    designH: DESIGN_H,
    legacyBaseRefRemoved:
      !/(tv14|tv15|tv16|tv17|tv18|plate\.png)/.test(FRESH_ALT_TABLE_SRC),
    cardAssetsUseTvEd: FRESH_ALT_CARD_BACK_SRC.startsWith("/tv_ed/"),
    passingAnchorCount: passing.length,
    northRenderModeValid: north.every(
      (anchor) => anchor.renderMode === "north_rack"
    ),
    northHiddenBottomValid: north.every(
      (anchor) => (anchor.hiddenBottomPx ?? 0) <= 24
    ),
    eastRenderModeValid: east.every(
      (anchor) => anchor.renderMode === "side_rack_portrait_fan"
    ),
    westRenderModeValid: west.every(
      (anchor) => anchor.renderMode === "side_rack_portrait_fan"
    ),
    eastRotationValid: east.every(
      (anchor) => anchor.rotationDeg <= -10 && anchor.rotationDeg >= -18
    ),
    westRotationValid: west.every(
      (anchor) => anchor.rotationDeg >= 10 && anchor.rotationDeg <= 18
    ),
    passingDirections: passing.reduce<Record<string, string>>((acc, anchor) => {
      acc[anchor.id] = anchor.arrowDirection;
      return acc;
    }, {})
  };
}

export function assertFreshAltTableChecks() {
  const result = runFreshAltTableChecks();
  const failures: string[] = [];

  if (result.designW !== 1536) {
    failures.push(`DESIGN_W must be 1536, received ${result.designW}.`);
  }
  if (result.designH !== 1024) {
    failures.push(`DESIGN_H must be 1024, received ${result.designH}.`);
  }
  if (result.tableSrc !== "/table/table.png") {
    failures.push(`Fresh alt table must use /table/table.png, received ${result.tableSrc}.`);
  }
  if (!result.legacyBaseRefRemoved) {
    failures.push("Fresh alt table still references a legacy plate or tv14-tv18 base path.");
  }
  if (!result.cardAssetsUseTvEd) {
    failures.push(`Fresh alt table card assets must come from /tv_ed, received ${result.cardBackSrc}.`);
  }
  if (result.passingAnchorCount !== 12) {
    failures.push(`Fresh alt table must expose 12 passing anchors, received ${result.passingAnchorCount}.`);
  }
  if (!result.northRenderModeValid || !result.northHiddenBottomValid) {
    failures.push("North rack cards must stay mostly visible with a shallow hidden-bottom crop.");
  }
  if (!result.eastRenderModeValid || !result.westRenderModeValid) {
    failures.push("East and west rack cards must use side_rack_portrait_fan.");
  }
  if (!result.eastRotationValid || !result.westRotationValid) {
    failures.push("East/west rack cards must use a small portrait lean around +/-14 degrees, not +/-72 or +/-90.");
  }

  if (failures.length > 0) {
    throw new Error(`Fresh alt table invariant failure: ${failures.join(" ")}`);
  }

  return result;
}
