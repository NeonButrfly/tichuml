import { describe, expect, it, vi } from "vitest";
import {
  computeOutcomeReward,
  getOutcomeActorTeamForSeat,
  type TelemetryDecisionPayload,
  type TelemetryEventPayload
} from "@tichuml/shared";
import {
  applyOutcomeAttributionForDecisionEvent,
  deriveDecisionOutcomeContext,
  finalizeTelemetryResults
} from "../../apps/server/src/services/telemetry-outcome-finalizer";

type SqlCall = {
  text: string;
  values: unknown[];
};

function createMockSql(config: {
  events?: TelemetryEventPayload[];
  summary?: Record<string, number | null>;
}) {
  const calls: SqlCall[] = [];
  const unsafe = vi.fn(async () => []);
  const sql = (async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> => {
    const text = strings.join("__VALUE__");
    calls.push({ text, values });
    if (text.includes("SELECT jsonb_build_object(")) {
      return (config.events ?? []).map((payload) => ({ payload }));
    }
    if (text.includes("SELECT") && text.includes("reward_attributed")) {
      return [
        {
          decisions: 4,
          trick_attributed: 3,
          hand_attributed: 4,
          game_attributed: 4,
          reward_attributed: 4,
          exact_attribution: 3,
          range_attribution: 1,
          unknown_attribution: 0,
          reward_min: -120,
          reward_avg: 17.5,
          reward_max: 280,
          ...(config.summary ?? {})
        }
      ];
    }
    return [];
  }) as unknown as {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
    unsafe: typeof unsafe;
    json: <T>(value: T) => T;
  };
  sql.unsafe = unsafe;
  sql.json = <T>(value: T) => value;
  return { sql, calls, unsafe };
}

function buildDecisionPayload(
  metadata: Record<string, unknown>
): TelemetryDecisionPayload {
  return {
    ts: new Date().toISOString(),
    game_id: "game-outcome",
    hand_id: "game-outcome-hand-1",
    phase: "trick_play",
    actor_seat: "seat-0",
    decision_index: 2,
    schema_version: 2,
    engine_version: "test-engine",
    sim_version: "test-sim",
    requested_provider: "local",
    provider_used: "local_heuristic",
    fallback_used: false,
    policy_name: "test-policy",
    policy_source: "local_heuristic",
    state_raw: {
      phase: "trick_play",
      activeSeat: "seat-0",
      matchHistory: []
    },
    state_norm: {
      phase: "trick_play"
    },
    legal_actions: {
      "seat-0": [{ type: "pass_turn", seat: "seat-0" }]
    },
    chosen_action: { type: "pass_turn", seat: "seat-0" },
    explanation: null,
    candidateScores: null,
    stateFeatures: null,
    metadata: metadata as never,
    antipattern_tags: []
  };
}

describe("outcome telemetry helpers", () => {
  it("maps seats to outcome teams consistently", () => {
    expect(getOutcomeActorTeamForSeat("seat-0")).toBe("NS");
    expect(getOutcomeActorTeamForSeat("seat-2")).toBe("NS");
    expect(getOutcomeActorTeamForSeat("seat-1")).toBe("EW");
    expect(getOutcomeActorTeamForSeat("seat-3")).toBe("EW");
  });

  it("computes reward components from actual outcomes", () => {
    const computed = computeOutcomeReward({
      actorTeam: "NS",
      handScoreDelta: 35,
      trickPoints: 10,
      actorTeamWonTrick: true,
      tichuComponent: 100,
      actorTeamWonHand: true,
      actorTeamWonGame: false,
      attributionQuality: "exact"
    });

    expect(computed.reward).toBe(195);
    expect(computed.components).toMatchObject({
      actor_team: "NS",
      hand_score_delta: 35,
      trick_component: 10,
      tichu_component: 100,
      hand_bonus: 50,
      game_bonus: 0,
      attribution_quality: "exact"
    });
  });

  it("derives trick and hand context from decision metadata", () => {
    const context = deriveDecisionOutcomeContext(
      buildDecisionPayload({
        trick_index: 3,
        trick_id: "game-outcome-hand-1:trick:3",
        hand_index: 1,
        game_index: 1
      })
    );

    expect(context).toEqual({
      actorTeam: "NS",
      trickId: "game-outcome-hand-1:trick:3",
      trickIndex: 3,
      handIndex: 1,
      gameIndex: 1
    });
  });

  it("updates trick attribution using the credited team when Dragon gifts points away", async () => {
    const { sql, calls, unsafe } = createMockSql({});
    const payload: TelemetryEventPayload = {
      ts: new Date().toISOString(),
      game_id: "game-outcome",
      hand_id: "game-outcome-hand-1",
      phase: "trick_play",
      event_type: "dragon_trick_assigned",
      actor_seat: "seat-0",
      event_index: 9,
      schema_version: 2,
      engine_version: "test-engine",
      sim_version: "test-sim",
      requested_provider: "system_local",
      provider_used: "system_local",
      fallback_used: false,
      state_norm: null,
      payload: { event_type: "dragon_trick_assigned" },
      metadata: {
        trick_id: "game-outcome-hand-1:trick:4",
        trick_index: 4,
        trick_winner_seat: "seat-0",
        trick_winner_team: "NS",
        trick_point_recipient_seat: "seat-1",
        trick_point_recipient_team: "EW",
        trick_points: 25,
        attribution_quality: "exact"
      }
    };

    await applyOutcomeAttributionForDecisionEvent(sql as never, payload);

    expect(
      calls.some(
        (call) =>
          call.text.includes("UPDATE decisions") &&
          call.text.includes("actor_team_won_trick")
      )
    ).toBe(true);
    expect(unsafe).toHaveBeenCalledTimes(1);
  });

  it("keeps finalize-results idempotent for the same event stream", async () => {
    const eventPayload: TelemetryEventPayload = {
      ts: new Date().toISOString(),
      game_id: "game-outcome",
      hand_id: "game-outcome-hand-1",
      phase: "finished",
      event_type: "hand_completed",
      actor_seat: "system",
      event_index: 10,
      schema_version: 2,
      engine_version: "test-engine",
      sim_version: "test-sim",
      requested_provider: "system_local",
      provider_used: "system_local",
      fallback_used: false,
      state_norm: null,
      payload: { event_type: "hand_completed" },
      metadata: {
        hand_index: 1,
        hand_ns_score_delta: 35,
        hand_ew_score_delta: -35,
        final_hand_winner_team: "NS",
        hand_result: {
          version: "outcome_hand_v1",
          hand_index: 1,
          out_order: ["seat-0", "seat-2", "seat-1", "seat-3"],
          tichu_bonuses: []
        }
      }
    };
    const mock = createMockSql({ events: [eventPayload] });

    const first = await finalizeTelemetryResults(mock.sql as never);
    const second = await finalizeTelemetryResults(mock.sql as never);

    expect(second).toEqual(first);
    expect(mock.unsafe).toHaveBeenCalled();
  });
});
