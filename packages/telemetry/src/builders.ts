import {
  getCardById,
  type Card,
  type EngineAction,
  type EngineEvent,
  type GameState,
  type LegalAction,
  type PublicDerivedState,
  type RoundPhase,
  type SeatId
} from "@tichuml/engine";
import {
  extractActorScopedLegalActions,
  inferTelemetryFallbackUsed,
  normalizeDecisionProviderName,
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
    actualRanks?: number[];
    phoenixAsRank?: number | null;
    containsMahjong?: boolean;
    containsDragon?: boolean;
    containsPhoenix?: boolean;
    containsDog?: boolean;
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
      mahjongWish?: JsonObject;
      tichuCall?: JsonObject;
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
    selectedMahjongWish?: JsonObject;
    selectedTichuCall?: JsonObject;
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
  const combination: NonNullable<SerializableLegalAction["combination"]> = {
    kind: action.combination.kind,
    primaryRank: action.combination.primaryRank,
    cardCount: action.combination.cardCount,
    isBomb: action.combination.isBomb,
    actualRanks: [...action.combination.actualRanks]
  };
  if (action.combination.phoenixAsRank !== undefined) {
    combination.phoenixAsRank = action.combination.phoenixAsRank;
  }
  if (action.combination.containsMahjong !== undefined) {
    combination.containsMahjong = action.combination.containsMahjong;
  }
  if (action.combination.containsDragon !== undefined) {
    combination.containsDragon = action.combination.containsDragon;
  }
  if (action.combination.containsPhoenix !== undefined) {
    combination.containsPhoenix = action.combination.containsPhoenix;
  }
  if (action.combination.containsDog !== undefined) {
    combination.containsDog = action.combination.containsDog;
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
    combination
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

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readJsonObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function cardRankFromId(cardId: string): number | null {
  let card: Card | null = null;
  try {
    card = getCardById(cardId);
  } catch {
    card = null;
  }
  return card?.kind === "standard" ? card.rank : null;
}

function readCurrentWish(state: JsonObject | null | undefined): number | null {
  if (!state) {
    return null;
  }
  return (
    readFiniteNumber(state.currentWish) ??
    readFiniteNumber(state.current_wish) ??
    readFiniteNumber(state.wish_rank)
  );
}

function actionFulfillsWish(
  action: unknown,
  wishedRank: number | null
): boolean {
  if (wishedRank === null) {
    return false;
  }
  const actionObject = readJsonObject(action);
  if (!actionObject || actionObject.type !== "play_cards") {
    return false;
  }
  const combination = readJsonObject(actionObject.combination);
  if (readFiniteNumber(actionObject.phoenixAsRank) === wishedRank) {
    return true;
  }
  if (
    combination &&
    (readFiniteNumber(combination.primaryRank) === wishedRank ||
      readFiniteNumber(combination.phoenixAsRank) === wishedRank ||
      readNumberList(combination.actualRanks).includes(wishedRank))
  ) {
    return true;
  }
  return readStringList(actionObject.cardIds).some(
    (cardId) => cardRankFromId(cardId) === wishedRank
  );
}

function actionResolvesWishObligation(action: unknown): boolean {
  const actionObject = readJsonObject(action);
  return (
    actionObject?.type === "play_cards" || actionObject?.type === "pass_turn"
  );
}

function actorHoldsWishCard(
  state: JsonObject,
  actorSeat: string,
  wishedRank: number | null
): boolean | null {
  if (wishedRank === null) {
    return false;
  }
  const hands = readJsonObject(state.hands);
  const hand = hands?.[actorSeat];
  if (!Array.isArray(hand)) {
    return null;
  }
  return hand.some((card) => {
    const cardObject = readJsonObject(card);
    return (
      cardObject?.kind === "standard" &&
      readFiniteNumber(cardObject.rank) === wishedRank
    );
  });
}

function inferWishSource(state: JsonObject): string | null {
  const currentTrick = readJsonObject(state.currentTrick);
  const entries = currentTrick?.entries;
  if (!Array.isArray(entries)) {
    return null;
  }
  for (const entry of entries) {
    const entryObject = readJsonObject(entry);
    const combination = readJsonObject(entryObject?.combination);
    if (
      entryObject?.type === "play" &&
      typeof entryObject.seat === "string" &&
      combination?.containsMahjong === true
    ) {
      return entryObject.seat;
    }
  }
  return null;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function actionIncludesMahjong(action: JsonObject | null | undefined): boolean {
  if (!action || action.type !== "play_cards") {
    return false;
  }
  const combination = readJsonObject(action.combination);
  return (
    readStringList(action.cardIds).includes("mahjong") ||
    combination?.containsMahjong === true
  );
}

function readNumberList(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is number =>
          typeof entry === "number" && Number.isFinite(entry)
      )
    : [];
}

function readBooleanField(value: JsonObject | null, key: string): boolean {
  return value?.[key] === true;
}

function readNullableStringField(
  value: JsonObject | null,
  key: string
): string | null {
  const field = value?.[key];
  return typeof field === "string" ? field : null;
}

function readSelectedMahjongWish(
  explanation: SeedJsonValue | null | undefined
): JsonObject | null {
  const explanationObject = readJsonObject(explanation);
  return readJsonObject(explanationObject?.selectedMahjongWish);
}

function readSelectedTichuCall(
  explanation: SeedJsonValue | null | undefined
): JsonObject | null {
  const explanationObject = readJsonObject(explanation);
  return readJsonObject(explanationObject?.selectedTichuCall);
}

function buildTichuCallTelemetryMetadata(config: {
  chosenAction?: JsonObject | undefined;
  explanation?: SeedJsonValue | null | undefined;
}): JsonObject {
  const selectedTichu = readSelectedTichuCall(config.explanation);
  const actionType =
    typeof config.chosenAction?.type === "string" ? config.chosenAction.type : null;
  const tichuCallSelected =
    actionType === "call_tichu" || actionType === "call_grand_tichu";

  return {
    tichu_call_score:
      readFiniteNumber(selectedTichu?.tichu_call_score) ?? null,
    tichu_call_threshold:
      readFiniteNumber(selectedTichu?.tichu_call_threshold) ?? null,
    tichu_call_reason:
      readNullableStringField(selectedTichu, "tichu_call_reason") ??
      (tichuCallSelected
        ? actionType === "call_grand_tichu"
          ? "grand_call_without_metadata"
          : "regular_call_without_metadata"
        : null),
    tichu_call_risk_flags: readStringList(
      selectedTichu?.tichu_call_risk_flags
    ),
    hand_quality_score:
      readFiniteNumber(selectedTichu?.hand_quality_score) ?? null,
    control_score: readFiniteNumber(selectedTichu?.control_score) ?? null,
    exit_path_score:
      readFiniteNumber(selectedTichu?.exit_path_score) ?? null,
    fragmentation_penalty:
      readFiniteNumber(selectedTichu?.fragmentation_penalty) ?? null,
    tichu_context_notes: readStringList(selectedTichu?.tichu_context_notes),
    tichu_call_selected:
      selectedTichu?.tichu_call_selected === true || tichuCallSelected,
    tichu_call_kind:
      readNullableStringField(selectedTichu, "tichu_call_kind") ??
      (actionType === "call_grand_tichu"
        ? "grand"
        : actionType === "call_tichu"
          ? "regular"
          : null)
  };
}

function findWishTemplateForChosenAction(config: {
  actorLegalActions: SeedJsonValue[];
  chosenAction?: JsonObject | undefined;
}): JsonObject | null {
  if (!config.chosenAction) {
    return null;
  }
  return (
    config.actorLegalActions.find(
      (candidate): candidate is JsonObject =>
        isJsonObjectValue(candidate) &&
        readStringField(candidate, "type") === "play_cards" &&
        actionsEquivalent(candidate, config.chosenAction as JsonObject) &&
        readNumberList(candidate.availableWishRanks).length > 0
    ) ?? null
  );
}

function buildMahjongWishStrategyMetadata(config: {
  actorLegalActions: SeedJsonValue[];
  chosenAction?: JsonObject | undefined;
  explanation?: SeedJsonValue | null | undefined;
}): JsonObject {
  const chosenAction = config.chosenAction;
  const selectedWish = readSelectedMahjongWish(config.explanation);
  const wishTemplate = findWishTemplateForChosenAction({
    actorLegalActions: config.actorLegalActions,
    chosenAction
  });
  const availableRanks = [
    ...readNumberList(wishTemplate?.availableWishRanks),
    ...readNumberList(chosenAction?.availableWishRanks)
  ];
  const mahjongPlayed =
    actionIncludesMahjong(chosenAction) ||
    readBooleanField(selectedWish, "mahjong_played");
  const wishAvailable =
    availableRanks.length > 0 ||
    readBooleanField(selectedWish, "mahjong_wish_available");
  const wishSelected =
    readFiniteNumber(chosenAction?.wishRank) !== null ||
    readBooleanField(selectedWish, "mahjong_wish_selected");
  const skippedReason =
    readNullableStringField(selectedWish, "mahjong_wish_skipped_reason") ??
    (mahjongPlayed && wishAvailable && !wishSelected
      ? "rules_variant_allows_no_wish"
      : null);

  return {
    mahjong_played: mahjongPlayed,
    mahjong_wish_available: mahjongPlayed ? wishAvailable : false,
    mahjong_wish_selected: mahjongPlayed ? wishSelected : false,
    mahjong_wish_skipped_reason: mahjongPlayed ? skippedReason : null,
    wish_reason: mahjongPlayed
      ? (readNullableStringField(selectedWish, "wish_reason") ??
        (wishSelected ? null : "skipped"))
      : null,
    wish_target_seat: readNullableStringField(selectedWish, "wish_target_seat"),
    wish_target_team: readNullableStringField(selectedWish, "wish_target_team"),
    wish_rank_source_card_id: readNullableStringField(
      selectedWish,
      "wish_rank_source_card_id"
    ),
    wish_rank_source_target: readNullableStringField(
      selectedWish,
      "wish_rank_source_target"
    ),
    wish_considered_tichu_pressure: readBooleanField(
      selectedWish,
      "wish_considered_tichu_pressure"
    ),
    wish_considered_grand_tichu_pressure: readBooleanField(
      selectedWish,
      "wish_considered_grand_tichu_pressure"
    )
  };
}

function buildWishTelemetryMetadata(config: {
  stateRaw: JsonObject;
  actorSeat: string;
  actorLegalActions: SeedJsonValue[];
  chosenAction?: JsonObject | undefined;
  explanation?: SeedJsonValue | null | undefined;
}): JsonObject {
  const wishedRank = readCurrentWish(config.stateRaw);
  const wishActive = wishedRank !== null;
  const legalFulfillingMoves = wishActive
    ? config.actorLegalActions.filter((action) =>
        actionFulfillsWish(action, wishedRank)
      ).length
    : 0;
  const chosenActionFulfilledWish =
    wishActive && config.chosenAction
      ? actionFulfillsWish(config.chosenAction, wishedRank)
      : false;
  const chosenActionResolvesWishObligation = actionResolvesWishObligation(
    config.chosenAction
  );
  const actorHoldsFulfillingCard = actorHoldsWishCard(
    config.stateRaw,
    config.actorSeat,
    wishedRank
  );
  const wishSource = wishActive ? inferWishSource(config.stateRaw) : null;

  return {
    wish_active: wishActive,
    has_wish: wishActive,
    current_wish: wishedRank,
    wish_rank: wishedRank,
    wished_rank: wishedRank,
    wish_owner: wishSource,
    wish_source: wishSource,
    actor_holds_fulfilling_wish_card: actorHoldsFulfillingCard,
    legal_fulfilling_wish_move_count: legalFulfillingMoves,
    legal_fulfilling_wish_moves_exist: legalFulfillingMoves > 0,
    wish_satisfiable: legalFulfillingMoves > 0,
    active_wish_no_legal_fulfilling_move:
      wishActive && legalFulfillingMoves === 0,
    wish_fulfillment_required: wishActive && legalFulfillingMoves > 0,
    chosen_action_fulfilled_wish: chosenActionFulfilledWish,
    chosen_action_failed_required_wish:
      wishActive &&
      legalFulfillingMoves > 0 &&
      chosenActionResolvesWishObligation &&
      !chosenActionFulfilledWish,
    ...buildMahjongWishStrategyMetadata({
      actorLegalActions: config.actorLegalActions,
      chosenAction: config.chosenAction,
      explanation: config.explanation
    })
  };
}

function buildEventWishMetadata(stateNorm: JsonObject | null): JsonObject {
  const wishedRank = readCurrentWish(stateNorm);
  return {
    wish_active: wishedRank !== null,
    has_wish: wishedRank !== null,
    current_wish: wishedRank,
    wish_rank: wishedRank,
    wished_rank: wishedRank
  };
}

export function buildDecisionContextMetadata(config: {
  stateRaw: JsonObject;
  actorLegalActions: SeedJsonValue[];
  actorSeat: string;
  chosenAction?: JsonObject | undefined;
  explanation?: SeedJsonValue | null | undefined;
  latencyMs?: number | undefined;
}): JsonObject {
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
    ...buildWishTelemetryMetadata({
      stateRaw: config.stateRaw,
      actorSeat: config.actorSeat,
      actorLegalActions: config.actorLegalActions,
      chosenAction: config.chosenAction,
      explanation: config.explanation
    }),
    ...buildTichuCallTelemetryMetadata({
      chosenAction: config.chosenAction,
      explanation: config.explanation
    })
  };
}

export function buildCompactDecisionMetadata(config: {
  stateRaw: JsonObject;
  actorLegalActions: SeedJsonValue[];
  actorSeat: string;
  chosenAction?: JsonObject | undefined;
  explanation?: SeedJsonValue | null | undefined;
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
    has_wish: detail.has_wish ?? false,
    current_wish: detail.current_wish ?? null,
    wish_rank: detail.wish_rank ?? null,
    wished_rank: detail.wished_rank ?? null,
    wish_owner: detail.wish_owner ?? null,
    wish_source: detail.wish_source ?? null,
    actor_holds_fulfilling_wish_card:
      detail.actor_holds_fulfilling_wish_card ?? null,
    legal_fulfilling_wish_move_count:
      detail.legal_fulfilling_wish_move_count ?? 0,
    legal_fulfilling_wish_moves_exist:
      detail.legal_fulfilling_wish_moves_exist ?? false,
    wish_satisfiable: detail.wish_satisfiable ?? false,
    active_wish_no_legal_fulfilling_move:
      detail.active_wish_no_legal_fulfilling_move ?? false,
    wish_fulfillment_required: detail.wish_fulfillment_required ?? false,
    chosen_action_fulfilled_wish: detail.chosen_action_fulfilled_wish ?? false,
    chosen_action_failed_required_wish:
      detail.chosen_action_failed_required_wish ?? false,
    mahjong_played: detail.mahjong_played ?? false,
    mahjong_wish_available: detail.mahjong_wish_available ?? false,
    mahjong_wish_selected: detail.mahjong_wish_selected ?? false,
    mahjong_wish_skipped_reason:
      detail.mahjong_wish_skipped_reason ?? null,
    wish_reason: detail.wish_reason ?? null,
    wish_target_seat: detail.wish_target_seat ?? null,
    wish_target_team: detail.wish_target_team ?? null,
    wish_rank_source_card_id: detail.wish_rank_source_card_id ?? null,
    wish_rank_source_target: detail.wish_rank_source_target ?? null,
    wish_considered_tichu_pressure:
      detail.wish_considered_tichu_pressure ?? false,
    wish_considered_grand_tichu_pressure:
      detail.wish_considered_grand_tichu_pressure ?? false,
    tichu_call_score: detail.tichu_call_score ?? null,
    tichu_call_threshold: detail.tichu_call_threshold ?? null,
    tichu_call_reason: detail.tichu_call_reason ?? null,
    tichu_call_risk_flags: detail.tichu_call_risk_flags ?? [],
    hand_quality_score: detail.hand_quality_score ?? null,
    control_score: detail.control_score ?? null,
    exit_path_score: detail.exit_path_score ?? null,
    fragmentation_penalty: detail.fragmentation_penalty ?? null,
    tichu_context_notes: detail.tichu_context_notes ?? [],
    tichu_call_selected: detail.tichu_call_selected ?? false,
    tichu_call_kind: detail.tichu_call_kind ?? null,
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
    if (
      typeof candidate.left !== "string" ||
      typeof candidate.partner !== "string" ||
      typeof candidate.right !== "string"
    ) {
      return false;
    }
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

  if (structuralMatch && readStringField(structuralMatch, "type") === "play_cards") {
    const wishRank = readFiniteNumber(config.chosenAction.wishRank);
    return {
      ...structuralMatch,
      ...(config.chosenAction.phoenixAsRank !== undefined
        ? { phoenixAsRank: config.chosenAction.phoenixAsRank }
        : {}),
      ...(wishRank !== null ? { wishRank } : {})
    };
  }

  return structuralMatch ?? config.chosenAction;
}

function summarizeCandidateScoreCoverage(config: {
  candidateScores: SeedJsonValue | null;
  chosenAction: JsonObject;
  legalActionCount: number;
}): JsonObject {
  const candidateScores = Array.isArray(config.candidateScores)
    ? config.candidateScores
    : [];
  const chosenActionScored = candidateScores.some((candidate) => {
    const candidateObject = readJsonObject(candidate);
    const action = readJsonObject(candidateObject?.action);
    return action ? actionsEquivalent(action, config.chosenAction) : false;
  });
  const chosenActionUnscoredReason = chosenActionScored
    ? null
    : candidateScores.length === 0
      ? "candidate_scores_empty"
      : "chosen_action_not_in_scored_candidate_set";

  return {
    candidate_scores_representation: "expanded_candidate_actions",
    candidate_scores_alignment:
      "candidateScores may expand or filter compact legal action templates; use action equivalence, not array length, for coverage.",
    compact_legal_action_count: config.legalActionCount,
    scored_candidate_count: candidateScores.length,
    chosen_action_has_scored_candidate: chosenActionScored,
    chosen_action_unscored_reason: chosenActionUnscoredReason
  };
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
  const explanation = config.explanation ?? null;
  const compactMetadata = buildCompactDecisionMetadata({
    stateRaw: config.stateRaw,
    actorLegalActions,
    actorSeat: config.actorSeat,
    chosenAction,
    explanation,
    latencyMs: config.latencyMs,
    telemetryMode: config.mode
  });
  const candidateScores =
    config.candidateScores ??
    readExplanationField(explanation, "candidateScores");
  const providedStateFeatures =
    config.stateFeatures ??
    (readExplanationField(explanation, "stateFeatures") as JsonObject | null);
  const stateFeatures =
    providedStateFeatures === null || providedStateFeatures === undefined
      ? compactMetadata
      : {
          ...providedStateFeatures,
          ...compactMetadata
        };
  const requestedProviderCanonical = normalizeDecisionProviderName(
    config.requestedProvider
  );
  const providerUsedCanonical = normalizeDecisionProviderName(
    config.providerUsed
  );
  const fallbackUsed = inferTelemetryFallbackUsed({
    requestedProvider: config.requestedProvider,
    providerUsed: config.providerUsed,
    explicitFallbackUsed: config.fallbackUsed
  });
  const candidateScoreCoverage = summarizeCandidateScoreCoverage({
    candidateScores,
    chosenAction,
    legalActionCount: actorLegalActions.length
  });
  const baseMetadata = withSourceMetadata({
    source: config.source,
    mode: config.mode,
    metadata: {
      requested_provider: config.requestedProvider,
      provider_used: config.providerUsed,
      ...candidateScoreCoverage,
      ...(explanation ? { explanation } : {}),
      ...(config.metadata ?? {}),
      ...compactMetadata,
      requested_provider_canonical: requestedProviderCanonical,
      provider_used_canonical: providerUsedCanonical,
      fallback_used: fallbackUsed
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
    fallback_used: fallbackUsed,
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
  const requestedProviderCanonical = normalizeDecisionProviderName(
    config.requestedProvider
  );
  const providerUsedCanonical = normalizeDecisionProviderName(
    config.providerUsed
  );
  const fallbackUsed = inferTelemetryFallbackUsed({
    requestedProvider: config.requestedProvider,
    providerUsed: config.providerUsed,
    explicitFallbackUsed: config.fallbackUsed
  });
  const eventWishMetadata = buildEventWishMetadata(config.stateNorm ?? null);
  const metadata = withSourceMetadata({
    source: config.source,
    mode: config.mode,
    metadata: {
      requested_provider: config.requestedProvider ?? null,
      provider_used: config.providerUsed ?? null,
      event_index: config.eventIndex,
      ...(config.metadata ?? {}),
      requested_provider_canonical: requestedProviderCanonical,
      provider_used_canonical: providerUsedCanonical,
      fallback_used: fallbackUsed,
      ...eventWishMetadata
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
    fallback_used: fallbackUsed,
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
