import { describe, expect, it } from "vitest";
import { createAlternatePassSelectPreviewSession } from "../../apps/web/src/alternate-table/preview-session";

describe("alternate table pass preview session", () => {
  it("boots a real pass-select state with south still owning the exchange", () => {
    const session = createAlternatePassSelectPreviewSession({ roundIndex: 7 });

    expect(session.roundIndex).toBe(7);
    expect(session.round.nextState.phase).toBe("pass_select");
    expect(session.round.legalActions["seat-0"]?.some((action) => action.type === "select_pass")).toBe(
      true
    );
    expect(session.round.legalActions["seat-1"]?.some((action) => action.type === "select_pass")).toBe(
      false
    );
    expect(session.round.nextState.passSelections["seat-0"]).toBeUndefined();
    expect(session.round.nextState.passSelections["seat-1"]).toBeDefined();
    expect(session.round.nextState.passSelections["seat-2"]).toBeDefined();
    expect(session.round.nextState.passSelections["seat-3"]).toBeDefined();
  });
});
