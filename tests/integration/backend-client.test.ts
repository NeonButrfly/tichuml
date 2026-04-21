import { describe, expect, it, vi } from "vitest";
import {
  BackendRequestError,
  postDecisionRequest,
  postTelemetryEvent
} from "../../apps/web/src/backend/client";

describe("backend client error classification", () => {
  it("treats local decision payload validation as a client validation error", async () => {
    await expect(
      postDecisionRequest("http://localhost:4310", {
        game_id: "game-1",
        hand_id: "hand-1",
        phase: "trick_play",
        actor_seat: "seat-0",
        schema_version: 2,
        engine_version: "engine",
        sim_version: "sim",
        state_raw: null,
        state_norm: null,
        legal_actions: [],
        requested_provider: "server_heuristic",
        metadata: {}
      })
    ).rejects.toMatchObject<Partial<BackendRequestError>>({
      name: "BackendRequestError",
      kind: "client_validation",
      endpoint: "/api/decision/request",
      reachable: null
    });
  });

  it("treats structured telemetry validation responses as reachable endpoint failures", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          accepted: false,
          error: "Invalid telemetry event payload.",
          validation_errors: [{ path: "ts", message: "Expected a timestamp." }]
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    });

    await expect(
      postTelemetryEvent(
        "http://localhost:4310",
        {
          ts: "2026-04-18T00:00:00.000Z",
          game_id: "game-1",
          hand_id: "hand-1",
          phase: "exchange_complete",
          event_type: "pickup_complete",
          actor_seat: "seat-0",
          event_index: 1,
          schema_version: 2,
          engine_version: "engine",
          sim_version: "sim",
          requested_provider: "server_heuristic",
          provider_used: "server_heuristic",
          fallback_used: false,
          state_norm: { phase: "exchange_complete" },
          payload: { selected_cards: ["star-2"] },
          metadata: {}
        },
        fetchImpl as typeof fetch
      )
    ).rejects.toMatchObject<Partial<BackendRequestError>>({
      name: "BackendRequestError",
      kind: "validation",
      endpoint: "/api/telemetry/event",
      reachable: true,
      statusCode: 400
    });
  });
});
