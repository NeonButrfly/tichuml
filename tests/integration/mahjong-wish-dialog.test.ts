// @vitest-environment jsdom

import {
  act,
  createElement,
  useState,
  type ReactElement
} from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAHJONG_WISH_RANKS,
  MahjongWishDialog,
  type WishSelectionValue
} from "../../apps/web/src/game-table-views";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn()
});

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

function WishDialogHarness({
  onConfirm = vi.fn()
}: {
  onConfirm?: (rank: WishSelectionValue) => void;
}) {
  const [selectedWishRank, setSelectedWishRank] =
    useState<WishSelectionValue>(null);
  const [open, setOpen] = useState(true);

  if (!open) {
    return createElement("div", { "data-wish-state": "closed" }, "closed");
  }

  return createElement(MahjongWishDialog, {
    resolvedWishRank: selectedWishRank,
    wishSelectionOptions: [null, ...MAHJONG_WISH_RANKS],
    wishConfirmDisabled: false,
    wishSubmissionPending: false,
    onWishRankSelect: setSelectedWishRank,
    onWishConfirm: () => {
      onConfirm(selectedWishRank);
      setOpen(false);
    },
    onWishCancel: () => setOpen(false)
  });
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Mahjong wish dialog", () => {
  it("renders only the legal wish ranks and no text entry controls", () => {
    const view = render(createElement(WishDialogHarness));
    const optionLabels = Array.from(
      view.container.querySelectorAll<HTMLElement>(".mahjong-wish-option")
    ).map((element) => element.textContent?.trim());

    expect(optionLabels).toEqual([
      "No Wish",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "J",
      "Q",
      "K",
      "A"
    ]);
    expect(
      view.container.querySelectorAll("input, textarea, select")
    ).toHaveLength(0);
    expect(
      view.container.querySelector<HTMLButtonElement>(
        ".mahjong-wish-dialog__confirm"
      )?.disabled
    ).toBe(false);
    expect(
      view.container.querySelector<HTMLElement>(".mahjong-wish-option.is-selected")
        ?.textContent
    ).toContain("No Wish");

    view.unmount();
  });

  it("confirms the default No Wish selection immediately", () => {
    const onConfirm = vi.fn();
    const view = render(createElement(WishDialogHarness, { onConfirm }));
    const selector = view.container.querySelector<HTMLElement>(
      '[role="listbox"]'
    );

    expect(selector).not.toBeNull();

    act(() => {
      selector?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true
        })
      );
    });

    expect(onConfirm).toHaveBeenCalledWith(null);
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(
      view.container.querySelector('[data-wish-state="closed"]')
    ).not.toBeNull();

    view.unmount();
  });

  it("supports wheel and arrow selection, then confirms a rank with Enter", () => {
    const onConfirm = vi.fn();
    const view = render(createElement(WishDialogHarness, { onConfirm }));
    const selector = view.container.querySelector<HTMLElement>(
      '[role="listbox"]'
    );

    expect(selector).not.toBeNull();

    act(() => {
      selector?.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 120,
          bubbles: true,
          cancelable: true
        })
      );
    });

    expect(
      view.container.querySelector<HTMLElement>(".mahjong-wish-option.is-selected")
        ?.textContent
    ).toContain("2");

    act(() => {
      selector?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true
        })
      );
    });

    expect(
      view.container.querySelector<HTMLElement>(".mahjong-wish-option.is-selected")
        ?.textContent
    ).toContain("3");

    act(() => {
      selector?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true
        })
      );
    });

    expect(onConfirm).toHaveBeenCalledWith(3);
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(
      view.container.querySelector('[data-wish-state="closed"]')
    ).not.toBeNull();

    view.unmount();
  });
});
