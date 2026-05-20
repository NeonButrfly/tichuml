// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Card } from "@tichuml/engine";
import { describe, expect, it, vi } from "vitest";
import { CardFace } from "../../apps/web/src/card-face";

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

describe("player surface card face", () => {
  it("marks Dragon with the premium special-card treatment", () => {
    const dragonCard: Card = {
      id: "dragon",
      kind: "special",
      special: "dragon"
    };

    const view = render(createElement(CardFace, { card: dragonCard }));

    try {
      const card = view.container.querySelector(".playing-card");

      expect(card).not.toBeNull();
      expect(card?.classList.contains("playing-card--dragon")).toBe(true);
      expect(card?.classList.contains("playing-card--special")).toBe(true);
      expect(view.container.textContent).toContain("Dragon");
    } finally {
      view.unmount();
    }
  });

  it("renders a standard suit card through the standard art branch", () => {
    const jadeFive: Card = {
      id: "jade-5",
      kind: "standard",
      suit: "jade",
      rank: 5
    };

    const view = render(
      createElement(CardFace, { card: jadeFive, tone: "legal" })
    );

    try {
      const card = view.container.querySelector(".playing-card");

      expect(card).not.toBeNull();
      expect(card?.classList.contains("playing-card--jade")).toBe(true);
      expect(card?.classList.contains("playing-card--legal")).toBe(true);
      expect(card?.classList.contains("playing-card--special")).toBe(false);
      expect(view.container.textContent).toContain("5");
      expect(view.container.textContent).toContain("Jade");
    } finally {
      view.unmount();
    }
  });

  it("renders a button and fires clicks when interactive is true", () => {
    const onClick = vi.fn();
    const swordAce: Card = {
      id: "sword-14",
      kind: "standard",
      suit: "sword",
      rank: 14
    };

    const view = render(
      createElement(CardFace, {
        card: swordAce,
        interactive: true,
        onClick
      })
    );

    try {
      const button = view.container.querySelector("button.playing-card");

      expect(button).not.toBeNull();
      expect(button?.getAttribute("type")).toBe("button");

      act(() => {
        button?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        );
      });

      expect(onClick).toHaveBeenCalledTimes(1);
    } finally {
      view.unmount();
    }
  });
});
