import type {
  EngineAction,
  EngineEvent,
  GameState,
  LegalAction,
  PublicDerivedState,
  RoundPhase,
  SeatId
} from "@tichuml/engine";

export const TELEMETRY_SCHEMA_VERSION = 1;
export const TELEMETRY_ENGINE_VERSION = "milestone-1";
export const TELEMETRY_SIM_VERSION = "milestone-2";

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
    }>;
    selectedReasonSummary: string[];
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

export function serializeLegalAction(action: LegalAction): SerializableLegalAction {
  if (action.type !== "play_cards") {
    return action;
  }

  return {
    type: action.type,
    seat: action.seat,
    cardIds: action.cardIds,
    ...(action.phoenixAsRank !== undefined ? { phoenixAsRank: action.phoenixAsRank } : {}),
    ...(action.availableWishRanks ? { availableWishRanks: action.availableWishRanks } : {}),
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

export const telemetryFoundation = {
  schemaVersion: TELEMETRY_SCHEMA_VERSION,
  milestone: "milestone-2",
  appendOnly: true as const,
  eventTelemetryReady: true
};
