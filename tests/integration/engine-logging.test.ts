import { afterEach, describe, expect, it, vi } from "vitest";
import { createThrottledStructuredLogger } from "@tichuml/engine";

describe("engine hot-loop diagnostic throttling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("throttles repeated identical structured logs and reports suppressed duplicates", () => {
    vi.useFakeTimers();
    const logger = createThrottledStructuredLogger(1_000);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logger({
      level: "info",
      message: "[engine] Straight response availability",
      payload: {
        activeSeat: "seat-0",
        leadCombo: "straight-5",
        legalResponseCount: 2
      }
    });
    logger({
      level: "info",
      message: "[engine] Straight response availability",
      payload: {
        activeSeat: "seat-0",
        leadCombo: "straight-5",
        legalResponseCount: 2
      }
    });
    logger({
      level: "info",
      message: "[engine] Straight response availability",
      payload: {
        activeSeat: "seat-0",
        leadCombo: "straight-5",
        legalResponseCount: 2
      }
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);

    logger({
      level: "info",
      message: "[engine] Straight response availability",
      payload: {
        activeSeat: "seat-0",
        leadCombo: "straight-5",
        legalResponseCount: 2
      }
    });

    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(infoSpy.mock.calls[1]?.[1]).toMatchObject({
      suppressed_duplicates: 2
    });
  });
});
