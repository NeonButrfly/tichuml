import type {
  HandEvaluation,
  PolicyTag,
  TeamplaySnapshot,
  UrgencyProfile
} from "@tichuml/ai-heuristics";
import {
  SYSTEM_ACTOR,
  getPartnerSeat,
  type CombinationKind,
  type EngineAction,
  type LegalAction,
  type LegalActionMap,
  type SeatId
} from "@tichuml/engine";
import type {
  DecisionMode,
  DecisionProviderUsed,
  JsonObject,
  TelemetryDecisionPayload,
  TelemetryEventPayload
} from "@tichuml/shared";

export type MasterControlTone = "green" | "yellow" | "red";
export type CollectionReadiness = "NOT READY" | "PARTIAL" | "READY";

export type DashboardUiState = {
  verboseMode: boolean;
  rawJsonVisible: boolean;
  frozen: boolean;
  frozenAt: string | null;
};

export type EndpointDiagnostics = {
  name: "/health" | "/api/decision/request" | "/api/telemetry/event";
  reachable: boolean | null;
  payloadValid: boolean | null;
  latencyMs: number | null;
  lastStatus: string | null;
  lastError: string | null;
  checkedAt: string | null;
  lastSuccessAt: string | null;
  lastValidationFailureReason: string | null;
};

export type ActionDescriptor = {
  summary: string;
  comboType: CombinationKind | "pass" | "exchange" | "call" | "system";
  rankLabel: string | null;
  length: number;
  cardIds: string[];
  usesBomb: boolean;
  usesDragon: boolean;
  usesPhoenix: boolean;
  satisfiesWish: boolean;
  containsMahjong: boolean;
};

export type CandidateDiagnostics = ActionDescriptor & {
  score: number;
  scoreBreakdown: string[];
  reasonTags: PolicyTag[];
  overtakesPartner: boolean;
  controlRetaining: boolean;
  endgameOriented: boolean;
  teamplay?: TeamplaySnapshot;
};

export type HandMetricSnapshot = {
  totalCards: number;
  singles: number;
  deadSingles: number;
  pairs: number;
  triples: number;
  straights: number;
  pairRuns: number;
  bombs: number;
  controlCards: number;
  finishabilityScore: number;
  structureQuality: number;
};

export type HandMetricDelta = {
  futureHandQualityDelta: number | null;
  controlRetentionDelta: number | null;
  deadSinglesDelta: number | null;
  comboPreservationImpact: number | null;
};

export type SeatDashboardRow = {
  seat: SeatId;
  relation: "self" | "partner" | "opponent";
  cardsRemaining: number;
  out: boolean;
  winningTrick: boolean;
  tichu: boolean;
  grandTichu: boolean;
  bombs: number;
  controlCards: number;
  comboCount: number;
  deadSingles: number;
};

export type TimelineEntry = {
  id: string;
  ts: string;
  kind:
    | "phase"
    | "decision"
    | "provider"
    | "fallback"
    | "telemetry"
    | "backend"
    | "ml"
    | "exchange";
  tone: MasterControlTone;
  title: string;
  detail: string;
};

export type TelemetryCompleteness = {
  gameIdPresent: boolean;
  handIdPresent: boolean;
  phasePresent: boolean;
  actorSeatPresent: boolean;
  stateRawPresent: boolean;
  stateNormPresent: boolean;
  legalActionsCount: number;
  chosenActionPresent: boolean;
  metadataPresent: boolean;
};

export type DecisionDebugSnapshot = {
  requestedProvider: DecisionMode;
  actualProviderUsed: DecisionProviderUsed | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  latencyMs: number | null;
  lastEndpointError: string | null;
  legalActionCount: number;
  pendingRequestState: string;
  pendingRequestActor: string | null;
  pendingRequestPhase: string | null;
  chosenAction: ActionDescriptor | null;
  topCandidates: CandidateDiagnostics[];
  urgencyMode: string;
  handQualityScore: number | null;
  controlRetentionEstimate: number | null;
  structurePreservation: number | null;
  endgamePressure: number | null;
  partnerAdvantage: number | null;
  lookahead: HandMetricDelta;
  reasonTags: PolicyTag[];
  lastSuccessfulTransition: {
    phase: string;
    actor: string;
    actionType: string;
    nextPhase: string;
    nextActiveSeat: string | null;
    grandTichuQueue: string[];
  } | null;
  requestedProviderLabel: string;
};

export type TelemetryHealthSnapshot = {
  enabled: boolean;
  healthy: boolean;
  payloadValid: boolean;
  decisionPayloadValid: boolean;
  lastWriteAt: string | null;
  lastRecordedPhase: string | null;
  lastDecisionIndex: number | null;
  completeness: TelemetryCompleteness;
  phaseTracking: {
    deal: boolean;
    passSelect: boolean;
    exchange: boolean;
    pickup: boolean;
    play: boolean;
    roundEnd: boolean;
  };
  exchangeRecorded: boolean;
  collectionReadiness: CollectionReadiness;
  lastError: string | null;
};

export type BackendMlSnapshot = {
  backendUrl: string;
  backendReachable: boolean | null;
  backendLatencyMs: number | null;
  backendLastError: string | null;
  endpoints: EndpointDiagnostics[];
  modelLoaded: boolean | null;
  modelName: string | null;
  inferenceWorking: boolean | null;
  inferenceLatencyMs: number | null;
  candidatesScoredCount: number;
  scoreSpread: {
    max: number | null;
    min: number | null;
    chosen: number | null;
    gapToSecond: number | null;
  };
  lastError: string | null;
};

export type ExchangePanelSnapshot = {
  state: string;
  direction: string;
  pickupStatus: string;
  telemetryEmitted: boolean;
  backendRecorded: boolean;
  selectedBySeat: Array<{
    seat: SeatId;
    label: string;
    cards: string[];
  }>;
};

export type GameStateSnapshot = {
  gameId: string;
  handId: string;
  decisionIndex: number;
  phase: string;
  activeSeat: string | null;
  wishState: string;
  tichuCalls: string[];
  grandTichuCalls: string[];
  exchangeState: string;
  pickupState: string;
  trick: {
    comboType: string;
    rank: string | null;
    cards: string[];
    currentLeader: string | null;
  };
  seats: SeatDashboardRow[];
};

export type HandInspectorSnapshot = {
  seat: string;
  before: HandMetricSnapshot;
  after: HandMetricSnapshot | null;
  delta: HandMetricDelta;
};

export type RawInspectorSnapshot = {
  stateRaw: JsonObject | null;
  legalActions: unknown;
  chosenAction: JsonObject | null;
  telemetryPayload: JsonObject | null;
  backendResponse: JsonObject | null;
};

export type MasterControlSnapshot = {
  generatedAt: string;
  ui: DashboardUiState;
  game: GameStateSnapshot;
  decision: DecisionDebugSnapshot;
  telemetry: TelemetryHealthSnapshot;
  backendMl: BackendMlSnapshot;
  exchange: ExchangePanelSnapshot;
  handInspector: HandInspectorSnapshot;
  timeline: TimelineEntry[];
  raw: RawInspectorSnapshot;
};

export function formatRankLabel(rank: number | null): string | null {
  if (rank === null) {
    return null;
  }

  switch (rank) {
    case 11:
      return "J";
    case 12:
      return "Q";
    case 13:
      return "K";
    case 14:
      return "A";
    default:
      return String(rank);
  }
}

export function formatCombinationLabel(kind: CombinationKind): string {
  switch (kind) {
    case "full-house":
      return "Full House";
    case "pair-sequence":
      return "Pair Run";
    case "bomb-four-kind":
      return "Bomb (4)";
    case "bomb-straight":
      return "Bomb (Straight)";
    default:
      return kind.replace(/(^|-)([a-z])/g, (_, prefix: string, letter: string) =>
        `${prefix === "-" ? " " : ""}${letter.toUpperCase()}`
      );
  }
}

export function summarizeActionDescriptor(
  action: EngineAction,
  legalActions: LegalActionMap,
  currentWish: number | null
): ActionDescriptor {
  const legalAction = findMatchingLegalAction(legalActions, action);
  if (legalAction?.type === "play_cards") {
    return {
      summary: `${formatCombinationLabel(legalAction.combination.kind)} ${formatRankLabel(
        legalAction.combination.primaryRank
      ) ?? ""}`.trim(),
      comboType: legalAction.combination.kind,
      rankLabel: formatRankLabel(legalAction.combination.primaryRank),
      length: legalAction.combination.cardCount,
      cardIds: [...legalAction.cardIds],
      usesBomb: legalAction.combination.isBomb,
      usesDragon: legalAction.combination.containsDragon,
      usesPhoenix: legalAction.combination.containsPhoenix,
      satisfiesWish:
        currentWish === null
          ? false
          : legalAction.combination.actualRanks.includes(currentWish as never),
      containsMahjong: legalAction.combination.containsMahjong
    };
  }

  switch (action.type) {
    case "pass_turn":
      return {
        summary: "Pass",
        comboType: "pass",
        rankLabel: null,
        length: 0,
        cardIds: [],
        usesBomb: false,
        usesDragon: false,
        usesPhoenix: false,
        satisfiesWish: false,
        containsMahjong: false
      };
    case "select_pass":
      return {
        summary: "Exchange selection",
        comboType: "exchange",
        rankLabel: null,
        length: 3,
        cardIds: [action.left, action.partner, action.right],
        usesBomb: false,
        usesDragon: false,
        usesPhoenix: false,
        satisfiesWish: false,
        containsMahjong: action.left === "mahjong" || action.partner === "mahjong" || action.right === "mahjong"
      };
    case "call_grand_tichu":
      return {
        summary: "Call Grand Tichu",
        comboType: "call",
        rankLabel: null,
        length: 0,
        cardIds: [],
        usesBomb: false,
        usesDragon: false,
        usesPhoenix: false,
        satisfiesWish: false,
        containsMahjong: false
      };
    case "call_tichu":
      return {
        summary: "Call Tichu",
        comboType: "call",
        rankLabel: null,
        length: 0,
        cardIds: [],
        usesBomb: false,
        usesDragon: false,
        usesPhoenix: false,
        satisfiesWish: false,
        containsMahjong: false
      };
    case "assign_dragon_trick":
      return {
        summary: `Gift Dragon to ${action.recipient}`,
        comboType: "system",
        rankLabel: null,
        length: 0,
        cardIds: [],
        usesBomb: false,
        usesDragon: true,
        usesPhoenix: false,
        satisfiesWish: false,
        containsMahjong: false
      };
    case "advance_phase":
      return {
        summary: "Advance phase",
        comboType: "system",
        rankLabel: null,
        length: 0,
        cardIds: [],
        usesBomb: false,
        usesDragon: false,
        usesPhoenix: false,
        satisfiesWish: false,
        containsMahjong: false
      };
    default:
      return {
        summary: action.type,
        comboType: "system",
        rankLabel: null,
        length: 0,
        cardIds: [],
        usesBomb: false,
        usesDragon: false,
        usesPhoenix: false,
        satisfiesWish: false,
        containsMahjong: false
      };
  }
}

export function buildTelemetryCompleteness(
  payload: TelemetryDecisionPayload | null
): TelemetryCompleteness {
  return {
    gameIdPresent: Boolean(payload?.game_id),
    handIdPresent: Boolean(payload?.hand_id),
    phasePresent: Boolean(payload?.phase),
    actorSeatPresent: Boolean(payload?.actor_seat),
    stateRawPresent: Boolean(payload?.state_raw && Object.keys(payload.state_raw).length > 0),
    stateNormPresent: Boolean(payload?.state_norm && Object.keys(payload.state_norm).length > 0),
    legalActionsCount: countLegalActions(payload?.legal_actions),
    chosenActionPresent: Boolean(
      payload?.chosen_action && Object.keys(payload.chosen_action).length > 0
    ),
    metadataPresent: Boolean(payload?.metadata && Object.keys(payload.metadata).length > 0)
  };
}

export function buildPhaseTracking(phases: string[]) {
  const phaseSet = new Set(phases);
  return {
    deal:
      phaseSet.has("shuffle") ||
      phaseSet.has("deal8") ||
      phaseSet.has("grand_tichu_window") ||
      phaseSet.has("complete_deal"),
    passSelect: phaseSet.has("pass_select"),
    exchange: phaseSet.has("pass_reveal"),
    pickup: phaseSet.has("exchange_complete"),
    play: phaseSet.has("trick_play"),
    roundEnd: phaseSet.has("round_scoring") || phaseSet.has("finished")
  };
}

export function buildCollectionReadiness(config: {
  telemetryEnabled: boolean;
  telemetryHealthy: boolean;
  backendReachable: boolean;
  decisionPayloadValid: boolean;
  telemetryPayloadValid: boolean;
  exchangeRecorded: boolean;
  completeness: TelemetryCompleteness;
}): CollectionReadiness {
  if (!config.telemetryEnabled || !config.backendReachable) {
    return "NOT READY";
  }

  const complete =
    config.telemetryHealthy &&
    config.decisionPayloadValid &&
    config.telemetryPayloadValid &&
    config.exchangeRecorded &&
    config.completeness.gameIdPresent &&
    config.completeness.handIdPresent &&
    config.completeness.phasePresent &&
    config.completeness.actorSeatPresent &&
    config.completeness.stateRawPresent &&
    config.completeness.stateNormPresent &&
    config.completeness.legalActionsCount > 0 &&
    config.completeness.chosenActionPresent;

  if (complete) {
    return "READY";
  }

  return "PARTIAL";
}

export function toneForBoolean(
  value: boolean | null | undefined,
  options: { pendingIsWarning?: boolean } = {}
): MasterControlTone {
  if (value === true) {
    return "green";
  }

  if (value === null || value === undefined) {
    return options.pendingIsWarning ? "yellow" : "red";
  }

  return "red";
}

export function toneForCollectionReadiness(
  readiness: CollectionReadiness
): MasterControlTone {
  if (readiness === "READY") {
    return "green";
  }
  if (readiness === "PARTIAL") {
    return "yellow";
  }
  return "red";
}

export function buildHandMetricSnapshot(
  evaluation: HandEvaluation | null,
  totalCards: number
): HandMetricSnapshot {
  if (!evaluation) {
    return {
      totalCards,
      singles: 0,
      deadSingles: 0,
      pairs: 0,
      triples: 0,
      straights: 0,
      pairRuns: 0,
      bombs: 0,
      controlCards: 0,
      finishabilityScore: 0,
      structureQuality: 0
    };
  }

  return {
    totalCards,
    singles: Math.max(
      0,
      totalCards -
        evaluation.pairCount * 2 -
        evaluation.trioCount * 3 -
        evaluation.longestStraightLength
    ),
    deadSingles: evaluation.deadSingleCount,
    pairs: evaluation.pairCount,
    triples: evaluation.trioCount,
    straights: evaluation.longestStraightLength,
    pairRuns: evaluation.longestPairSequenceLength,
    bombs: evaluation.bombCount,
    controlCards: evaluation.controlCount,
    finishabilityScore: roundMetric(evaluation.finishPlanScore),
    structureQuality: roundMetric(
      evaluation.synergyScore - evaluation.fragmentation + evaluation.finishPlanScore
    )
  };
}

export function buildHandMetricDelta(
  beforeEval: HandEvaluation | null,
  afterEval: HandEvaluation | null
): HandMetricDelta {
  if (!beforeEval || !afterEval) {
    return {
      futureHandQualityDelta: null,
      controlRetentionDelta: null,
      deadSinglesDelta: null,
      comboPreservationImpact: null
    };
  }

  return {
    futureHandQualityDelta: roundMetric(
      afterEval.finishPlanScore -
        beforeEval.finishPlanScore +
        afterEval.synergyScore -
        beforeEval.synergyScore
    ),
    controlRetentionDelta: roundMetric(
      afterEval.controlCount - beforeEval.controlCount
    ),
    deadSinglesDelta: roundMetric(
      beforeEval.deadSingleCount - afterEval.deadSingleCount
    ),
    comboPreservationImpact: roundMetric(
      (afterEval.longestStraightLength - beforeEval.longestStraightLength) +
        (afterEval.longestPairSequenceLength -
          beforeEval.longestPairSequenceLength) +
        (afterEval.bombCount - beforeEval.bombCount) * 2
    )
  };
}

export function buildUrgencyModeLabel(urgency: UrgencyProfile | null): string {
  if (!urgency) {
    return "normal";
  }
  if (urgency.opponentOutUrgent) {
    return "opponent near out";
  }
  if (urgency.selfNearOut) {
    return "self near out";
  }
  if (urgency.partnerNearOut || urgency.yieldToPartner) {
    return "partner support";
  }
  if (urgency.highUrgency) {
    return "endgame";
  }
  return "normal";
}

export function buildSeatDashboardRows(config: {
  seats: SeatId[];
  localSeat: SeatId;
  activeSeat: SeatId | null;
  currentWinner: SeatId | null;
  handCounts: Record<SeatId, number>;
  evaluations: Record<SeatId, HandEvaluation | null>;
  calls: Record<
    SeatId,
    {
      grandTichu: boolean;
      smallTichu: boolean;
    }
  >;
}): SeatDashboardRow[] {
  return config.seats.map((seat) => {
    const evaluation = config.evaluations[seat];
    return {
      seat,
      relation:
        seat === config.localSeat
          ? "self"
          : getPartnerSeat(config.localSeat) === seat
            ? "partner"
            : "opponent",
      cardsRemaining: config.handCounts[seat],
      out: config.handCounts[seat] === 0,
      winningTrick: config.currentWinner === seat,
      tichu: config.calls[seat].smallTichu,
      grandTichu: config.calls[seat].grandTichu,
      bombs: evaluation?.bombCount ?? 0,
      controlCards: evaluation?.controlCount ?? 0,
      comboCount:
        (evaluation?.pairCount ?? 0) +
        (evaluation?.trioCount ?? 0) +
        ((evaluation?.longestStraightLength ?? 0) > 0 ? 1 : 0) +
        ((evaluation?.longestPairSequenceLength ?? 0) > 0 ? 1 : 0) +
        (evaluation?.bombCount ?? 0),
      deadSingles: evaluation?.deadSingleCount ?? 0
    };
  });
}

export function summarizeMlScores(
  scores: Array<{ score?: number | null }>
): {
  max: number | null;
  min: number | null;
  chosen: number | null;
  gapToSecond: number | null;
  candidateCount: number;
} {
  const numericScores = scores
    .map((entry) => entry.score)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score))
    .sort((left, right) => right - left);

  if (numericScores.length === 0) {
    return {
      max: null,
      min: null,
      chosen: null,
      gapToSecond: null,
      candidateCount: 0
    };
  }

  return {
    max: roundMetric(numericScores[0] ?? null),
    min: roundMetric(numericScores[numericScores.length - 1] ?? null),
    chosen: roundMetric(numericScores[0] ?? null),
    gapToSecond:
      numericScores.length > 1
        ? roundMetric((numericScores[0] ?? 0) - (numericScores[1] ?? 0))
        : null,
    candidateCount: numericScores.length
  };
}

export function getTelemetryEventPhaseList(
  lastDecisionPayload: TelemetryDecisionPayload | null,
  lastEventPayload: TelemetryEventPayload | null,
  phaseHistory: string[]
): string[] {
  const phases = [...phaseHistory];
  if (lastDecisionPayload?.phase) {
    phases.push(lastDecisionPayload.phase);
  }
  if (lastEventPayload?.phase) {
    phases.push(lastEventPayload.phase);
  }
  return [...new Set(phases)];
}

export function buildProviderModeLabel(mode: DecisionMode): string {
  switch (mode) {
    case "server_heuristic":
      return "server heuristic";
    case "lightgbm_model":
      return "LightGBM model";
    default:
      return "local heuristic";
  }
}

export function isServerMode(mode: DecisionMode): boolean {
  return mode === "server_heuristic" || mode === "lightgbm_model";
}

export function relationLabel(localSeat: SeatId, seat: SeatId): string {
  if (seat === localSeat) {
    return "Self";
  }
  if (getPartnerSeat(localSeat) === seat) {
    return "Partner";
  }
  return "Opponent";
}

function findMatchingLegalAction(
  legalActions: LegalActionMap,
  action: EngineAction
): LegalAction | null {
  const actorActions =
    action.type === "advance_phase"
      ? legalActions[SYSTEM_ACTOR]
      : "seat" in action
        ? legalActions[action.seat]
        : null;
  if (!actorActions) {
    return null;
  }

  return (
    actorActions.find((candidate) => {
      if (candidate.type !== action.type) {
        return false;
      }

      switch (candidate.type) {
        case "play_cards":
          return (
            candidate.cardIds.join("|") === action.cardIds.join("|") &&
            candidate.phoenixAsRank === action.phoenixAsRank
          );
        case "select_pass":
          return (
            candidate.seat === action.seat &&
            action.type === "select_pass"
          );
        case "assign_dragon_trick":
          return (
            action.type === "assign_dragon_trick" &&
            candidate.recipient === action.recipient
          );
        default:
          return true;
      }
    }) ?? null
  );
}

function countLegalActions(legalActions: unknown): number {
  if (Array.isArray(legalActions)) {
    return legalActions.length;
  }

  if (typeof legalActions !== "object" || legalActions === null) {
    return 0;
  }

  return Object.values(legalActions).reduce((count, value) => {
    return count + (Array.isArray(value) ? value.length : 0);
  }, 0);
}

function roundMetric(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Number(value.toFixed(2));
}
