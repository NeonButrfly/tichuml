import type {
  EngineAction,
  EngineEvent,
  GameState,
  LegalAction,
  PublicDerivedState,
  RoundPhase,
  SeatId
} from "@tichuml/engine";
import {
  extractActorScopedLegalActions,
  type JsonObject,
  type SeedJsonValue
} from "@tichuml/shared";
import {
  TELEMETRY_ENGINE_VERSION,
  TELEMETRY_SCHEMA_VERSION,
  TELEMETRY_SIM_VERSION,
  type TelemetryDecisionBuildResult,
  type TelemetryEventBuildResult,
  type TelemetryMode,
  type TelemetrySource
} from "./types.js";

export type ActorType = "ai" | "system";

export type SerializableLegalAction = {
  type: LegalAction["type"];
  seat?: SeatId;
  actor?: "system";
  recipient?: SeatId;
  cardIds?: string[];
  phoenixAsRank?: number;
  availableWishRanks?: number[];
  availableCardIds?: string[];
  requiredTargets?: string[];
  combination?: {
    kind: string;
    primaryRank: number;
    cardCount: number;
    isBomb: boolean;
  };
};

export type DecisionRecord = {
  schema_version: number;
  engine_version: string;
  sim_version: string;
  match_id: string;
  round_index: number;
  decision_index: number;
  phase: RoundPhase;
  seat: SeatId | "system";
  actor_type: ActorType;
  legal_actions: SerializableLegalAction[];
  selected_action: EngineAction;
  state_raw: GameState;
  state_norm: PublicDerivedState;
  policy_name: string;
  policy_explanation: {
    policy: string;
    actor: SeatId | "system";
    candidateScores: Array<{
      action: EngineAction;
      score: number;
      reasons: string[];
      tags: string[];
      teamplay?: {
        partnerCalledTichu: boolean;
        partnerStillLiveForTichu: boolean;
        partnerCardCount: number;
        partnerCurrentControl: boolean;
        opponentImmediateWinRisk: boolean;
        partnerCannotRetainLead: boolean;
        teamControlWouldBeLostWithoutIntervention: boolean;
        teamSalvageIntervention: boolean;
        partnerInterferenceCandidate: boolean;
        justifiedPartnerBomb: boolean;
        unjustifiedPartnerBomb: boolean;
      };
    }>;
    selectedReasonSummary: string[];
    selectedTags: string[];
    selectedTeamplay?: {
      partnerCalledTichu: boolean;
      partnerStillLiveForTichu: boolean;
      partnerCardCount: number;
      partnerCurrentControl: boolean;
      opponentImmediateWinRisk: boolean;
      partnerCannotRetainLead: boolean;
      teamControlWouldBeLostWithoutIntervention: boolean;
      teamSalvageIntervention: boolean;
      partnerInterferenceCandidate: boolean;
      justifiedPartnerBomb: boolean;
      unjustifiedPartnerBomb: boolean;
    };
  };
  latency_ms: number;
  created_at: string;
};

export type EventRecord = {
  schema_version: number;
  engine_version: string;
  sim_version: string;
  match_id: string;
  round_index: number;
  event_index: number;
  phase: RoundPhase;
  type: string;
  engine_event: EngineEvent;
  state_norm: PublicDerivedState;
  created_at: string;
};

export type TelemetrySession = {
  decisions: DecisionRecord[];
  events: EventRecord[];
  appendDecision(record: DecisionRecord): void;
  appendEvents(records: EventRecord[]): void;
};

export function serializeLegalAction(
  action: LegalAction
): SerializableLegalAction {
  if (action.type !== "play_cards") {
    return action;
  }

  return {
    type: action.type,
    seat: action.seat,
    cardIds: action.cardIds,
    ...(action.phoenixAsRank !== undefined
      ? { phoenixAsRank: action.phoenixAsRank }
      : {}),
    ...(action.availableWishRanks
      ? { availableWishRanks: action.availableWishRanks }
      : {}),
    combination: {
      kind: action.combination.kind,
      primaryRank: action.combination.primaryRank,
      cardCount: action.combination.cardCount,
      isBomb: action.combination.isBomb
    }
  };
}

export function createTelemetrySession(): TelemetrySession {
  const decisions: DecisionRecord[] = [];
  const events: EventRecord[] = [];

  return {
    decisions,
    events,
    appendDecision(record) {
      decisions.push(record);
    },
    appendEvents(records) {
      events.push(...records);
    }
  };
}

function readExplanationField(
  explanation: SeedJsonValue | null | undefined,
  key: "candidateScores" | "stateFeatures"
): SeedJsonValue | null {
  if (
    typeof explanation !== "object" ||
    explanation === null ||
    Array.isArray(explanation)
  ) {
    return null;
  }
  const value = explanation[key];
  return value === undefined ? null : (value as SeedJsonValue);
}

function summarizeCurrentCombination(state: JsonObject): JsonObject | null {
  const currentTrick = state.currentTrick;
  if (
    typeof currentTrick !== "object" ||
    currentTrick === null ||
    Array.isArray(currentTrick)
  ) {
    return null;
  }
  const combination = currentTrick.currentCombination;
  if (
    typeof combination !== "object" ||
    combination === null ||
    Array.isArray(combination)
  ) {
    return null;
  }
  return {
    kind: combination.kind ?? "unknown",
    primaryRank:
      typeof combination.primaryRank === "number" ? combination.primaryRank : 0,
    cardCount:
      typeof combination.cardCount === "number" ? combination.cardCount : 0,
    isBomb: combination.isBomb === true
  };
}

export function buildDecisionContextMetadata(config: {
  stateRaw: JsonObject;
  actorLegalActions: SeedJsonValue[];
  latencyMs?: number | undefined;
}): JsonObject {
  const currentWish = config.stateRaw.currentWish ?? null;
  const wishActive = currentWish !== null;
  const wishSatisfiable =
    wishActive &&
    config.actorLegalActions.some((action) => {
      if (
        typeof action !== "object" ||
        action === null ||
        !("combination" in action)
      ) {
        return false;
      }
      const combination = (action as JsonObject).combination;
      if (
        typeof combination !== "object" ||
        combination === null ||
        Array.isArray(combination)
      ) {
        return false;
      }
      return (
        (combination as JsonObject).primaryRank === currentWish ||
        (Array.isArray((combination as JsonObject).actualRanks) &&
          ((combination as JsonObject).actualRanks as SeedJsonValue[]).includes(
            currentWish
          ))
      );
    });

  return {
    seed: config.stateRaw.seed ?? null,
    latency_ms: config.latencyMs ?? null,
    current_lead_seat:
      typeof config.stateRaw.currentTrick === "object" &&
      config.stateRaw.currentTrick !== null &&
      !Array.isArray(config.stateRaw.currentTrick)
        ? ((config.stateRaw.currentTrick as JsonObject).currentWinner ?? null)
        : null,
    current_combination: summarizeCurrentCombination(config.stateRaw),
    wish_active: wishActive,
    current_wish: currentWish,
    wish_satisfiable: wishSatisfiable,
    active_wish_no_legal_fulfilling_move: wishActive && !wishSatisfiable
  };
}

export function buildCompactDecisionMetadata(config: {
  stateRaw: JsonObject;
  actorLegalActions: SeedJsonValue[];
  latencyMs?: number | undefined;
  telemetryMode: TelemetryMode;
}): JsonObject {
  const detail = buildDecisionContextMetadata(config);
  return {
    telemetry_mode: config.telemetryMode,
    latency_ms: detail.latency_ms ?? null,
    current_lead_seat: detail.current_lead_seat ?? null,
    current_combination: detail.current_combination ?? null,
    wish_active: detail.wish_active ?? false,
    current_wish: detail.current_wish ?? null,
    wish_satisfiable: detail.wish_satisfiable ?? false,
    legal_action_count: config.actorLegalActions.length
  };
}

function withSourceMetadata(config: {
  source: TelemetrySource;
  mode: TelemetryMode;
  metadata?: JsonObject | undefined;
  workerId?: string | undefined;
  controllerMode?: boolean | undefined;
}): JsonObject {
  return {
    ...(config.metadata ?? {}),
    source: config.source,
    telemetry_source: config.source,
    telemetry_mode: config.mode,
    ...(config.workerId ? { worker_id: config.workerId } : {}),
    ...(config.controllerMode ? { controller_mode: true } : {})
  };
}

function isJsonObjectValue(value: SeedJsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").sort()
    : [];
}

function stableJsonString(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonString(entry)).join(",")}]`;
  }

  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${stableJsonString(objectValue[key])}`
    )
    .join(",")}}`;
}

function readStringField(value: JsonObject, key: string): string | null {
  const field = value[key];
  return typeof field === "string" ? field : null;
}

function actionsEquivalent(candidate: JsonObject, chosen: JsonObject): boolean {
  if (stableJsonString(candidate) === stableJsonString(chosen)) {
    return true;
  }

  const candidateType = readStringField(candidate, "type");
  if (
    candidateType === null ||
    candidateType !== readStringField(chosen, "type")
  ) {
    return false;
  }

  const candidateSeat = readStringField(candidate, "seat");
  const chosenSeat = readStringField(chosen, "seat");
  if (
    candidateSeat !== null &&
    chosenSeat !== null &&
    candidateSeat !== chosenSeat
  ) {
    return false;
  }

  if (candidateType === "play_cards") {
    return (
      sortedStringList(candidate.cardIds).join("|") ===
        sortedStringList(chosen.cardIds).join("|") &&
      candidate.phoenixAsRank === chosen.phoenixAsRank
    );
  }

  if (candidateType === "select_pass") {
    return (
      candidate.seat === chosen.seat &&
      candidate.left === chosen.left &&
      candidate.partner === chosen.partner &&
      candidate.right === chosen.right
    );
  }

  if (candidateType === "assign_dragon_trick") {
    return candidate.recipient === chosen.recipient;
  }

  if (candidateType === "advance_phase") {
    return candidate.actor === chosen.actor;
  }

  return true;
}

export function selectTelemetryChosenAction(config: {
  actorLegalActions: SeedJsonValue[];
  chosenAction: JsonObject;
}): JsonObject {
  const exactMatch = config.actorLegalActions.find(
    (candidate): candidate is JsonObject =>
      isJsonObjectValue(candidate) &&
      stableJsonString(candidate) === stableJsonString(config.chosenAction)
  );
  if (exactMatch) {
    return exactMatch;
  }

  const structuralMatch = config.actorLegalActions.find(
    (candidate): candidate is JsonObject =>
      isJsonObjectValue(candidate) &&
      actionsEquivalent(candidate, config.chosenAction)
  );

  return structuralMatch ?? config.chosenAction;
}

export function buildTelemetryDecisionPayloads(config: {
  source: TelemetrySource;
  mode: TelemetryMode;
  gameId: string;
  handId: string;
  phase: string;
  actorSeat: string;
  decisionIndex: number;
  stateRaw: JsonObject;
  stateNorm: JsonObject | null;
  legalActions: SeedJsonValue;
  chosenAction: JsonObject;
  policyName: string;
  policySource: string;
  requestedProvider: string;
  providerUsed: string;
  fallbackUsed: boolean;
  explanation?: SeedJsonValue | null;
  candidateScores?: SeedJsonValue | null;
  stateFeatures?: JsonObject | null;
  antipatternTags?: SeedJsonValue;
  metadata?: JsonObject | undefined;
  latencyMs?: number | undefined;
  workerId?: string | undefined;
  controllerMode?: boolean | undefined;
}): TelemetryDecisionBuildResult {
  const actorLegalActions = extractActorScopedLegalActions(
    config.legalActions,
    config.actorSeat
  );
  const chosenAction = selectTelemetryChosenAction({
    actorLegalActions,
    chosenAction: config.chosenAction
  });
  const compactMetadata = buildCompactDecisionMetadata({
    stateRaw: config.stateRaw,
    actorLegalActions,
    latencyMs: config.latencyMs,
    telemetryMode: config.mode
  });
  const explanation = config.explanation ?? null;
  const candidateScores =
    config.candidateScores ??
    readExplanationField(explanation, "candidateScores");
  const stateFeatures =
    config.stateFeatures ??
    (readExplanationField(explanation, "stateFeatures") as JsonObject | null);
  const baseMetadata = withSourceMetadata({
    source: config.source,
    mode: config.mode,
    metadata: {
      requested_provider: config.requestedProvider,
      provider_used: config.providerUsed,
      fallback_used: config.fallbackUsed,
      ...compactMetadata,
      ...(explanation ? { explanation } : {}),
      ...(config.metadata ?? {})
    },
    workerId: config.workerId,
    controllerMode: config.controllerMode
  });

  const common = {
    ts: new Date().toISOString(),
    game_id: config.gameId,
    hand_id: config.handId,
    phase: config.phase,
    actor_seat: config.actorSeat,
    decision_index: config.decisionIndex,
    schema_version: TELEMETRY_SCHEMA_VERSION,
    engine_version: TELEMETRY_ENGINE_VERSION,
    sim_version: TELEMETRY_SIM_VERSION,
    requested_provider: config.requestedProvider,
    provider_used: config.providerUsed,
    fallback_used: config.fallbackUsed,
    policy_name: config.policyName,
    policy_source: config.policySource,
    chosen_action: chosenAction,
    metadata: baseMetadata,
    antipattern_tags: config.antipatternTags ?? []
  };

  return {
    full: {
      ...common,
      state_raw: config.stateRaw,
      state_norm: config.stateNorm,
      legal_actions: config.legalActions,
      explanation,
      candidateScores,
      stateFeatures
    },
    minimal: {
      ...common,
      state_raw: {},
      state_norm: null,
      legal_actions:
        actorLegalActions.length > 0 ? actorLegalActions : [chosenAction],
      explanation: null,
      candidateScores: null,
      stateFeatures: compactMetadata,
      antipattern_tags: []
    }
  };
}

export function buildTelemetryEventPayloads(config: {
  source: TelemetrySource;
  mode: TelemetryMode;
  gameId: string;
  handId: string;
  phase: string;
  eventType: string;
  actorSeat: string | null;
  eventIndex: number;
  payload: SeedJsonValue;
  fullPayload?: SeedJsonValue;
  stateNorm?: JsonObject | null;
  requestedProvider?: string | null;
  providerUsed?: string | null;
  fallbackUsed?: boolean;
  metadata?: JsonObject | undefined;
  workerId?: string | undefined;
  controllerMode?: boolean | undefined;
}): TelemetryEventBuildResult {
  const metadata = withSourceMetadata({
    source: config.source,
    mode: config.mode,
    metadata: {
      requested_provider: config.requestedProvider ?? null,
      provider_used: config.providerUsed ?? null,
      fallback_used: config.fallbackUsed ?? false,
      event_index: config.eventIndex,
      ...(config.metadata ?? {})
    },
    workerId: config.workerId,
    controllerMode: config.controllerMode
  });
  const common = {
    ts: new Date().toISOString(),
    game_id: config.gameId,
    hand_id: config.handId,
    phase: config.phase,
    event_type: config.eventType,
    actor_seat: config.actorSeat,
    event_index: config.eventIndex,
    schema_version: TELEMETRY_SCHEMA_VERSION,
    engine_version: TELEMETRY_ENGINE_VERSION,
    sim_version: TELEMETRY_SIM_VERSION,
    requested_provider: config.requestedProvider ?? null,
    provider_used: config.providerUsed ?? null,
    fallback_used: config.fallbackUsed ?? false,
    metadata
  };

  return {
    full: {
      ...common,
      state_norm: config.stateNorm ?? null,
      payload: config.fullPayload ?? config.payload
    },
    minimal: {
      ...common,
      state_norm: null,
      payload: config.payload
    }
  };
}

export const telemetryFoundation = {
  schemaVersion: TELEMETRY_SCHEMA_VERSION,
  milestone: "milestone-2",
  appendOnly: true as const,
  eventTelemetryReady: true,
  authoritativePackage: "@tichuml/telemetry"
};
