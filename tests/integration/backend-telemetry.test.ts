import { describe, expect, it, vi } from "vitest";
import { emitDecisionTelemetry } from "../../apps/web/src/backend/telemetry";
import type { BackendRuntimeSettings, TelemetryDecisionPayload } from "@tichuml/shared";
import type { EngineAction, EngineResult } from "@tichuml/engine";

const SETTINGS: BackendRuntimeSettings = {
  decisionMode: "server_heuristic",
  backendBaseUrl: "http://localhost:4310",
  serverFallbackEnabled: true,
  telemetryEnabled: true
};

const BASE_STATE = {
  phase: "pass_select",
  matchHistory: [],
  hands: {},
  activeSeat: "seat-0"
} as unknown as EngineResult["nextState"];

const BASE_DERIVED = {
  phase: "pass_select"
} as unknown as EngineResult["derivedView"];

async function flushTelemetry(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("backend telemetry decision tracking", () => {
  it("captures pass selection and exchange pickup phase decisions", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      async text() {
        return JSON.stringify({ accepted: true, telemetry_id: 1 });
      }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const actions: Array<{ action: EngineAction; phase: string }> = [
      {
        phase: "pass_select",
        action: {
          type: "select_pass",
          seat: "seat-0",
          left: "star-2",
          partner: "jade-3",
          right: "sword-4"
        }
      },
      {
        phase: "pass_reveal",
        action: {
          type: "advance_phase",
          actor: "system"
        }
      },
      {
        phase: "exchange_complete",
        action: {
          type: "advance_phase",
          actor: "system"
        }
      }
    ];

    for (const { action, phase } of actions) {
      const actor = "seat" in action ? action.seat : "actor" in action ? action.actor : "system";
      emitDecisionTelemetry({
        settings: SETTINGS,
        action,
        phase,
        gameId: "game-1",
        handId: "hand-1",
        decisionIndex: 1,
        stateRaw: { ...BASE_STATE, phase } as EngineResult["nextState"],
        stateNorm: BASE_DERIVED,
        legalActions: { [actor]: [action] } as unknown as EngineResult["legalActions"],
        policyName: "test-policy",
        policySource: "local_heuristic",
        metadata: {
          requested_provider: "local",
          provider_used: "local_heuristic",
          fallback_used: false
        }
      });
    }

    await flushTelemetry();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const payloads = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)) as TelemetryDecisionPayload
    );
    expect(payloads.map((payload) => payload.phase)).toEqual([
      "pass_select",
      "pass_reveal",
      "exchange_complete"
    ]);
  });
});
