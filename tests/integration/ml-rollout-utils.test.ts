import { describe, expect, it } from "vitest";
import { exportCompatibleActionKey } from "../../apps/sim-runner/src/ml-rollout-utils";

describe("exportCompatibleActionKey", () => {
  it("matches export_training_rows play_cards signatures", () => {
    const key = exportCompatibleActionKey({
      type: "play_cards",
      seat: "seat-0",
      cardIds: ["sword-10", "mahjong"],
      wishRank: 9,
      phoenixAsRank: null
    });

    expect(key).toBe('["play_cards","seat-0",["mahjong","sword-10"],null,9]');
  });

  it("matches export_training_rows simple action signatures", () => {
    expect(
      exportCompatibleActionKey({
        type: "call_tichu",
        seat: "seat-1"
      })
    ).toBe('["call_tichu","seat-1"]');
  });
});
