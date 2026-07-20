import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTelemetryHealth } from "../../scripts/sim-doctor.js";

describe("sim doctor telemetry health", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries aborted telemetry health fetches before failing persistence checks", async () => {
    const abortError = new Error("This operation was aborted");
    abortError.name = "AbortError";

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce({
        ok: true,
        async text() {
          return JSON.stringify({
            queue_pending: 0,
            queue_in_flight: 0,
            db_decisions_count: 12,
            db_events_count: 34,
            db_matches_count: 1
          });
        }
      });

    vi.stubGlobal("fetch", fetchMock);

    const payload = await loadTelemetryHealth("http://127.0.0.1:4310", {
      timeoutMs: 1,
      retries: 1
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(payload).toMatchObject({
      db_decisions_count: 12,
      db_events_count: 34,
      db_matches_count: 1
    });
  });
});
