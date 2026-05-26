// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { cardsFromIds, type Card } from "@tichuml/engine";
import {
  DEFAULT_NORMAL_TABLE_LAYOUT,
  NormalPassStagingRegions,
  computeNormalViewportLayoutMetrics
} from "../../apps/web/src/game-table-views";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
  });

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

function buildCardLookup(cards: readonly Card[]) {
  return new Map(cards.map((card) => [card.id, card] as const));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("normal pass anchor rendering", () => {
  it("binds rendered lanes to authoritative v5 anchor ids and per-anchor card orientation", () => {
    const cards = cardsFromIds([
      "dragon",
      "jade-10",
      "sword-5",
      "star-9",
      "pagoda-8",
      "jade-2"
    ]);
    const layoutMetrics = computeNormalViewportLayoutMetrics({
      viewportWidth: 1366,
      viewportHeight: 768,
      topCount: 8,
      bottomCount: 8,
      leftCount: 8,
      rightCount: 8,
      hasVariantPicker: false,
      hasWishPicker: false
    });
    const view = render(
      createElement(
        "div",
        { style: { position: "relative", width: "1366px", height: "768px" } },
        createElement(NormalPassStagingRegions, {
          normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
          layoutMetrics,
          seatViews: [
            {
              seat: "seat-2",
              position: "top",
              title: "NORTH",
              relation: "Partner",
              handCount: 8,
              cards: [],
              callState: {
                grandTichu: false,
                smallTichu: false,
                hasPlayedFirstCard: false
              },
              passReady: false,
              finishIndex: -1,
              isLocalSeat: false,
              isPrimarySeat: false,
              isThinkingSeat: false
            },
            {
              seat: "seat-1",
              position: "right",
              title: "EAST",
              relation: "Right Opponent",
              handCount: 8,
              cards: [],
              callState: {
                grandTichu: false,
                smallTichu: false,
                hasPlayedFirstCard: false
              },
              passReady: false,
              finishIndex: -1,
              isLocalSeat: false,
              isPrimarySeat: false,
              isThinkingSeat: false
            },
            {
              seat: "seat-0",
              position: "bottom",
              title: "SOUTH",
              relation: "You",
              handCount: 8,
              cards,
              callState: {
                grandTichu: false,
                smallTichu: false,
                hasPlayedFirstCard: false
              },
              passReady: false,
              finishIndex: -1,
              isLocalSeat: true,
              isPrimarySeat: false,
              isThinkingSeat: false
            },
            {
              seat: "seat-3",
              position: "left",
              title: "WEST",
              relation: "Left Opponent",
              handCount: 8,
              cards: [],
              callState: {
                grandTichu: false,
                smallTichu: false,
                hasPlayedFirstCard: false
              },
              passReady: false,
              finishIndex: -1,
              isLocalSeat: false,
              isPrimarySeat: false,
              isThinkingSeat: false
            }
          ],
          sortedLocalHand: cards,
          passRouteViews: [
            {
              key: "west-north",
              sourceSeat: "seat-3",
              sourcePosition: "left",
              target: "right",
              targetSeat: "seat-2",
              displayMode: "passing",
              occupied: true,
              visibleCardId: cards[0]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "west-across",
              sourceSeat: "seat-3",
              sourcePosition: "left",
              target: "partner",
              targetSeat: "seat-1",
              displayMode: "passing",
              occupied: true,
              visibleCardId: cards[1]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "west-south",
              sourceSeat: "seat-3",
              sourcePosition: "left",
              target: "left",
              targetSeat: "seat-0",
              displayMode: "passing",
              occupied: true,
              visibleCardId: cards[2]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "east-north",
              sourceSeat: "seat-1",
              sourcePosition: "right",
              target: "left",
              targetSeat: "seat-2",
              displayMode: "passing",
              occupied: true,
              visibleCardId: cards[3]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "east-across",
              sourceSeat: "seat-1",
              sourcePosition: "right",
              target: "partner",
              targetSeat: "seat-3",
              displayMode: "passing",
              occupied: true,
              visibleCardId: cards[4]!.id,
              faceDown: false,
              interactive: false
            },
            {
              key: "east-south",
              sourceSeat: "seat-1",
              sourcePosition: "right",
              target: "right",
              targetSeat: "seat-0",
              displayMode: "passing",
              occupied: true,
              visibleCardId: cards[5]!.id,
              faceDown: false,
              interactive: false
            }
          ],
          selectedPassTarget: null,
          cardLookup: buildCardLookup(cards),
          onPassTargetSelect: () => {},
          onPassLaneDrop: () => {},
          onPassLaneCardClick: () => {},
          onPassLaneCardDragStart: () => {},
          onPassLaneCardDragEnd: () => {}
        })
      )
    );

    expect(
      view.container
        .querySelector('[data-pass-lane="west-north"]')
        ?.getAttribute("data-pass-anchor-id")
    ).toBe("west_pass_north");
    expect(
      view.container
        .querySelector('[data-pass-lane="west-across"]')
        ?.getAttribute("data-pass-anchor-id")
    ).toBe("west_pass_across");
    expect(
      view.container
        .querySelector('[data-pass-lane="east-across"]')
        ?.getAttribute("data-pass-anchor-id")
    ).toBe("east_pass_across");

    expect(
      view.container
        .querySelector<HTMLElement>('[data-pass-lane="west-north"] .normal-pass-lane__slot')
        ?.style.clipPath
    ).not.toBe("");
    expect(
      view.container
        .querySelector<HTMLElement>('[data-pass-lane="east-across"] .normal-pass-lane__slot')
        ?.style.clipPath
    ).not.toBe("");

    expect(
      view.container
        .querySelector('[data-pass-lane="west-north"] .normal-card--route')
        ?.getAttribute("data-pass-card-orientation")
    ).toBe("vertical");
    expect(
      view.container
        .querySelector('[data-pass-lane="west-across"] .normal-card--route')
        ?.getAttribute("data-pass-card-orientation")
    ).toBe("horizontal");
    expect(
      view.container
        .querySelector('[data-pass-lane="east-south"] .normal-card--route')
        ?.getAttribute("data-pass-card-orientation")
    ).toBe("vertical");

    view.unmount();
  });
});
