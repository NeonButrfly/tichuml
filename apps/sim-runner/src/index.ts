import {
  deterministicBaselinePolicy,
  type HeuristicPolicy
} from "@tichuml/ai-heuristics";
import {
  createInitialGameState,
  applyEngineAction,
  SYSTEM_ACTOR,
  type EngineAction,
  type EngineResult,
  type GameState
} from "@tichuml/engine";
import {
  TELEMETRY_ENGINE_VERSION,
  TELEMETRY_SCHEMA_VERSION,
  TELEMETRY_SIM_VERSION,
  createTelemetrySession,
  serializeLegalAction,
  telemetryFoundation,
  type TelemetrySession
} from "@tichuml/telemetry";
import { heuristicFoundation } from "@tichuml/ai-heuristics";

export type HeadlessRoundOptions = {
  seed: string | number;
  matchId?: string;
  roundIndex?: number;
  maxDecisions?: number;
  policy?: HeuristicPolicy;
};

export type HeadlessRoundResult = {
  matchId: string;
  roundIndex: number;
  state: GameState;
  telemetry: TelemetrySession;
  decisions: number;
  events: number;
  completed: boolean;
  policyName: string;
};

export type HeadlessBatchOptions = {
  seeds: Array<string | number>;
  maxDecisionsPerRound?: number;
  policy?: HeuristicPolicy;
};

export type {
  SelfPlayBatchOptions,
  SelfPlayBatchDetailedResult,
  SelfPlayBatchSummary,
  SelfPlayGameResult,
  SelfPlayStopReason,
  SeatProviderOverrides
} from "./self-play-batch.js";
export { runSelfPlayBatch, runSelfPlayBatchDetailed } from "./self-play-batch.js";
export {
  buildDiagnosticsComparison,
  createDiagnosticsAccumulator,
  detectRuntimeAnomalies,
  finalizeDiagnosticsSummary,
  processDiagnosticsLine,
  recordRuntimeSnapshot,
  renderDiagnosticsReport,
  tryParseSummaryFromOutput,
  writeDiagnosticsSessionArtifacts
} from "./sim-diagnostics.js";
export type {
  DiagnosticsComparison,
  DiagnosticsAccumulator,
  DiagnosticsFlag,
  DiagnosticsRunDescriptor,
  DiagnosticsRunTarget,
  DiagnosticsStream,
  DiagnosticsSummary
} from "./sim-diagnostics.js";

function appendEngineEvents(
  telemetry: TelemetrySession,
  result: EngineResult,
  matchId: string,
  roundIndex: number,
  eventIndexRef: { current: number }
): void {
  telemetry.appendEvents(
    result.events.map((engineEvent) => ({
      schema_version: TELEMETRY_SCHEMA_VERSION,
      engine_version: TELEMETRY_ENGINE_VERSION,
      sim_version: TELEMETRY_SIM_VERSION,
      match_id: matchId,
      round_index: roundIndex,
      event_index: eventIndexRef.current++,
      phase: result.nextState.phase,
      type: engineEvent.type,
      engine_event: engineEvent,
      state_norm: result.derivedView,
      created_at: new Date().toISOString()
    }))
  );
}

export function runHeadlessRound(options: HeadlessRoundOptions): HeadlessRoundResult {
  const policy = options.policy ?? deterministicBaselinePolicy;
  const matchId = options.matchId ?? `match-${String(options.seed)}`;
  const roundIndex = options.roundIndex ?? 0;
  const maxDecisions = options.maxDecisions ?? 2000;
  const telemetry = createTelemetrySession();
  const eventIndexRef = { current: 0 };

  let result = createInitialGameState(options.seed);
  appendEngineEvents(telemetry, result, matchId, roundIndex, eventIndexRef);

  let decisionIndex = 0;

  while (result.nextState.phase !== "finished") {
    if (decisionIndex >= maxDecisions) {
      throw new Error(`Soft lock protection tripped after ${maxDecisions} decisions for ${matchId}.`);
    }

    const chosen = policy.chooseAction({
      state: result.nextState,
      legalActions: result.legalActions
    });
    const actorLegalActions = result.legalActions[chosen.actor] ?? [];

    if (actorLegalActions.length === 0) {
      throw new Error(`Actor ${chosen.actor} had no legal actions at decision ${decisionIndex}.`);
    }

    const startedAt = Date.now();
    const nextResult = applyEngineAction(result.nextState, chosen.action as EngineAction);
    const latency = Date.now() - startedAt;

    telemetry.appendDecision({
      schema_version: TELEMETRY_SCHEMA_VERSION,
      engine_version: TELEMETRY_ENGINE_VERSION,
      sim_version: TELEMETRY_SIM_VERSION,
      match_id: matchId,
      round_index: roundIndex,
      decision_index: decisionIndex,
      phase: result.nextState.phase,
      seat: chosen.actor,
      actor_type: chosen.actor === SYSTEM_ACTOR ? "system" : "ai",
      legal_actions: actorLegalActions.map(serializeLegalAction),
      selected_action: chosen.action,
      state_raw: result.nextState,
      state_norm: result.derivedView,
      policy_name: policy.name,
      policy_explanation: chosen.explanation,
      latency_ms: latency,
      created_at: new Date().toISOString()
    });

    appendEngineEvents(telemetry, nextResult, matchId, roundIndex, eventIndexRef);
    result = nextResult;
    decisionIndex += 1;
  }

  return {
    matchId,
    roundIndex,
    state: result.nextState,
    telemetry,
    decisions: telemetry.decisions.length,
    events: telemetry.events.length,
    completed: result.nextState.phase === "finished",
    policyName: policy.name
  };
}

export function runHeadlessBatch(options: HeadlessBatchOptions): HeadlessRoundResult[] {
  return options.seeds.map((seed, index) =>
    runHeadlessRound({
      seed,
      matchId: `match-${String(seed)}`,
      roundIndex: index,
      ...(options.maxDecisionsPerRound !== undefined
        ? { maxDecisions: options.maxDecisionsPerRound }
        : {}),
      ...(options.policy ? { policy: options.policy } : {})
    })
  );
}

export function createSimulationManifest() {
  return {
    runner: "sim-runner",
    policyFamily: heuristicFoundation.policyFamily,
    baselinePolicy: deterministicBaselinePolicy.name,
    headlessReady: true,
    telemetrySchemaVersion: telemetryFoundation.schemaVersion
  };
}
