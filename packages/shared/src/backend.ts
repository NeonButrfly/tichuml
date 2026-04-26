import type {
  SeedJsonValue,
  SeedProviderName,
  SeedSourceSummary
} from "./seed.js";

export const DEFAULT_SERVER_PORT = 4310;
export const DEFAULT_BACKEND_BASE_URL = `http://localhost:${DEFAULT_SERVER_PORT}`;
export const BACKEND_SETTINGS_STORAGE_KEY = "tichuml.backend-settings.v1";
export const BACKEND_HEALTH_PATH = "/health";
export const TELEMETRY_DECISION_PATH = "/api/telemetry/decision";
export const TELEMETRY_EVENT_PATH = "/api/telemetry/event";
export const DECISION_REQUEST_PATH = "/api/decision/request";
export const ADMIN_TELEMETRY_CLEAR_PATH = "/api/admin/telemetry/clear";
export const ADMIN_DATABASE_CLEAR_PATH = "/api/admin/database/clear";
export const ADMIN_DATABASE_RESET_PATH = "/api/admin/database/reset";
export const ADMIN_SIM_START_PATH = "/api/admin/sim/start";
export const ADMIN_SIM_PAUSE_PATH = "/api/admin/sim/pause";
export const ADMIN_SIM_CONTINUE_PATH = "/api/admin/sim/continue";
export const ADMIN_SIM_STOP_PATH = "/api/admin/sim/stop";
export const ADMIN_SIM_STATUS_PATH = "/api/admin/sim/status";
export const ADMIN_SIM_RUN_ONCE_PATH = "/api/admin/sim/run-once";
export const ADMIN_CONFIRMATION_VALUE = "CLEAR_TICHU_DB";

export type JsonObject = Record<string, SeedJsonValue>;
export type JsonArray = SeedJsonValue[];
export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export type DecisionMode = "local" | "server_heuristic" | "lightgbm_model";
export type RequestedDecisionProvider = "server_heuristic" | "lightgbm_model";
export type DecisionProviderUsed = RequestedDecisionProvider | "local_heuristic";
export type DecisionScoringPath = "fast_path" | "rich_path";
export type BackendReachabilityState =
  | "unknown"
  | "checking"
  | "reachable"
  | "unreachable";

export type BackendRuntimeSettings = {
  decisionMode: DecisionMode;
  backendBaseUrl: string;
  serverFallbackEnabled: boolean;
  telemetryEnabled: boolean;
};

export type TelemetryDecisionPayload = {
  ts: string;
  game_id: string;
  hand_id: string;
  phase: string;
  actor_seat: string;
  decision_index: number;
  schema_version: number;
  engine_version: string;
  sim_version: string;
  requested_provider: string;
  provider_used: string;
  fallback_used: boolean;
  policy_name: string;
  policy_source: string;
  state_raw: JsonObject;
  state_norm: JsonObject | null;
  legal_actions: SeedJsonValue;
  chosen_action: JsonObject;
  explanation: SeedJsonValue | null;
  candidateScores: SeedJsonValue | null;
  stateFeatures: JsonObject | null;
  metadata: JsonObject;
  antipattern_tags: SeedJsonValue;
};

export type SimControllerStatus =
  | "stopped"
  | "starting"
  | "running"
  | "pausing"
  | "paused"
  | "stopping"
  | "completed"
  | "error";

export type SimWorkerStatus =
  | "starting"
  | "running"
  | "paused"
  | "stopping"
  | "stopped"
  | "completed"
  | "error";

export type SimSeedMode = "automatic_entropy" | "manual_override";

export type SimRunSeedInfo = {
  mode: SimSeedMode;
  resolved_run_seed: string;
  derivation_namespace: string;
  manual_override_enabled: boolean;
  manual_override_seed: string | null;
  generated_at: string;
  entropy_game_id: string | null;
  audit_hash_hex: string | null;
  primary_provider: SeedProviderName | "manual_override" | null;
  local_fallback_used: boolean | null;
  source_summary: SeedSourceSummary | null;
};

export type SimControllerConfig = {
  provider: DecisionMode;
  games_per_batch: number;
  telemetry_enabled: boolean;
  server_fallback_enabled: boolean;
  strict_telemetry: boolean;
  trace_backend: boolean;
  full_state_decision_requests: boolean;
  telemetry_mode: "minimal" | "full";
  telemetry_max_bytes: number;
  telemetry_timeout_ms: number;
  telemetry_retry_attempts: number;
  telemetry_retry_delay_ms: number;
  telemetry_backoff_ms: number;
  backend_url: string;
  seed_namespace: string;
  manual_seed_override_enabled: boolean;
  manual_seed_override: string;
  seed_prefix: string;
  sleep_seconds: number;
  worker_count: number;
  quiet: boolean;
  progress: boolean;
  seat_providers: Record<string, DecisionMode>;
};

export type SimWorkerRuntimeState = {
  worker_id: string;
  controller_session_id: string | null;
  status: SimWorkerStatus;
  pid: number | null;
  current_batch_started_at: string | null;
  total_batches_completed: number;
  total_games_completed: number;
  last_heartbeat: string | null;
  last_error: string | null;
};

export type TelemetryTransportStatus =
  | "connected"
  | "degraded"
  | "backoff"
  | "offline";

export type TelemetryEndpointRuntimeState = {
  endpoint: string;
  request_kind: "telemetry_decision" | "telemetry_event";
  status: TelemetryTransportStatus;
  queue_depth: number;
  accepted_count: number;
  failed_count: number;
  dropped_count: number;
  pending_count: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  next_retry_at: string | null;
};

export type TelemetryRuntimeState = {
  enabled: boolean;
  status: TelemetryTransportStatus;
  queue_depth: number;
  accepted_count: number;
  failed_count: number;
  dropped_count: number;
  pending_count: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  storage_dir: string | null;
  replayed_dir: string | null;
  endpoints: Record<string, TelemetryEndpointRuntimeState>;
};

export type SimControllerRuntimeState = {
  runtime_schema_version: number;
  status: SimControllerStatus;
  pid: number | null;
  controller_id: string;
  controller_session_id: string | null;
  started_at: string | null;
  updated_at: string;
  last_heartbeat: string | null;
  heartbeat_stale: boolean;
  heartbeat_stale_after_seconds: number;
  requested_action: string | null;
  current_batch_started_at: string | null;
  last_batch_started_at: string | null;
  last_batch_finished_at: string | null;
  last_batch_size: number;
  last_batch_status: string | null;
  total_batches_completed: number;
  total_games_completed: number;
  total_errors: number;
  last_error: string | null;
  last_shutdown_reason: string | null;
  last_exit_code: number | null;
  last_exit_signal: string | null;
  active_run_seed: SimRunSeedInfo | null;
  last_run_seed: SimRunSeedInfo | null;
  telemetry_decision_failures: number;
  telemetry_event_failures: number;
  telemetry_failures_total: number;
  telemetry_failure_by_endpoint: Record<string, number>;
  telemetry_failure_by_kind: Record<string, number>;
  telemetry_backoff_until: string | null;
  telemetry_runtime?: TelemetryRuntimeState | null;
  worker_count: number;
  running_worker_count: number;
  paused_worker_count: number;
  stopped_worker_count: number;
  errored_worker_count: number;
  config: SimControllerConfig;
  workers: SimWorkerRuntimeState[];
  log_path: string;
  runtime_path: string;
  lock_path: string;
  pause_path: string;
  stop_path: string;
  warnings: string[];
  recent_logs: string[];
};

export type SimControllerResponse = {
  accepted: boolean;
  action: string;
  prior_status: SimControllerStatus;
  current_status: SimControllerStatus;
  message: string;
  runtime_state: SimControllerRuntimeState;
  warnings: string[];
};

export type SimControllerRequestPayload = Partial<{
  provider: DecisionMode;
  games: number;
  games_per_batch: number;
  telemetry_enabled: boolean;
  telemetry: boolean;
  server_fallback_enabled: boolean;
  server_fallback: boolean;
  strict_telemetry: boolean;
  trace_backend: boolean;
  full_state_decision_requests: boolean;
  full_state: boolean;
  telemetry_mode: "minimal" | "full";
  telemetry_max_bytes: number;
  telemetry_timeout_ms: number;
  telemetry_retry_attempts: number;
  telemetry_retry_delay_ms: number;
  telemetry_backoff_ms: number;
  backend_url: string;
  seed: string;
  seed_namespace: string;
  seed_prefix: string;
  manual_seed_override_enabled: boolean;
  manual_seed_override: string;
  sleep_seconds: number;
  worker_count: number;
  sim_threads: number;
  quiet: boolean;
  progress: boolean;
  seat_providers: Record<string, DecisionMode>;
}>;

export type TelemetryEventPayload = {
  ts: string;
  game_id: string;
  hand_id: string;
  phase: string;
  event_type: string;
  actor_seat: string | null;
  event_index: number;
  schema_version: number;
  engine_version: string;
  sim_version: string;
  requested_provider: string | null;
  provider_used: string | null;
  fallback_used: boolean;
  state_norm: JsonObject | null;
  payload: SeedJsonValue;
  metadata: JsonObject;
};

export type DerivedTelemetryDecisionFields = {
  chosen_action_type: string;
  legal_action_count: number;
  chosen_action_is_legal: boolean;
  has_explanation: boolean;
  has_candidate_scores: boolean;
  has_state_features: boolean;
  explanation_quality_level: "none" | "basic" | "scored" | "featured";
  has_wish: boolean;
  wish_rank: number | null;
  can_pass: boolean;
  state_hash: string;
  legal_actions_hash: string;
  chosen_action_hash: string;
};

export type DerivedTelemetryEventFields = {
  state_hash: string | null;
  event_hash: string;
};

export type DecisionRequestPayload = {
  game_id: string;
  hand_id: string;
  phase: string;
  actor_seat: string;
  schema_version: number;
  engine_version: string;
  sim_version: string;
  state_raw: JsonObject | null;
  state_norm: JsonObject | null;
  legal_actions: SeedJsonValue;
  requested_provider: RequestedDecisionProvider;
  metadata: JsonObject;
};

export type DecisionResponsePayload = {
  accepted: boolean;
  chosen_action: JsonObject | null;
  provider_used: DecisionProviderUsed | null;
  provider_reason?: string;
  metadata?: JsonObject;
  validation_errors?: ValidationIssue[];
  telemetry_id?: number;
};

export type StoredTelemetryDecisionRecord = TelemetryDecisionPayload & {
  id: number;
  worker_id: string | null;
  chosen_action_type: string;
  legal_action_count: number;
  has_explanation: boolean;
  has_candidate_scores: boolean;
  has_state_features: boolean;
  explanation_quality_level: "none" | "basic" | "scored" | "featured";
  chosen_action_is_legal: boolean;
  has_wish: boolean;
  wish_rank: number | null;
  can_pass: boolean;
  state_hash: string;
  legal_actions_hash: string;
  chosen_action_hash: string;
  created_at: string;
};

export type StoredTelemetryEventRecord = TelemetryEventPayload & {
  id: number;
  worker_id: string | null;
  state_hash: string | null;
  event_hash: string;
  created_at: string;
};

export type ReplayRecord =
  | {
      kind: "decision";
      ts: string;
      id: number;
      phase: string;
      actor_seat: string;
      payload: StoredTelemetryDecisionRecord;
    }
  | {
      kind: "event";
      ts: string;
      id: number;
      phase: string;
      actor_seat: string | null;
      payload: StoredTelemetryEventRecord;
    };

export type ReplayPayload = {
  game_id: string;
  decisions: StoredTelemetryDecisionRecord[];
  events: StoredTelemetryEventRecord[];
  timeline: ReplayRecord[];
};

export type AdminClearResult = {
  accepted: boolean;
  action: string;
  tables_cleared: string[];
  row_counts: Record<string, number>;
  warnings: string[];
};

export type TelemetryHealthStats = {
  decisions: number;
  events: number;
  unique_state_hashes: number;
  duplicate_state_hashes: number;
  unique_legal_actions_hashes: number;
  duplicate_legal_actions_hashes: number;
  decisions_with_explanation: number;
  decisions_with_candidate_scores: number;
  decisions_with_state_features: number;
  decisions_with_legal_chosen_action: number;
  decisions_with_wish: number;
  decisions_can_pass: number;
  latest_decision_ts: string | null;
  latest_event_ts: string | null;
  decisions_by_provider: Record<string, number>;
  decisions_by_phase: Record<string, number>;
  decisions_by_seat: Record<string, number>;
  events_by_type: Record<string, number>;
  events_by_phase: Record<string, number>;
};

type ValidatorContext = {
  issues: ValidationIssue[];
};

function pushIssue(
  context: ValidatorContext,
  path: string,
  message: string
): void {
  context.issues.push({ path, message });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonValue(value: unknown): value is SeedJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return Number.isFinite(value as number) || typeof value !== "number";
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every((entry) => isJsonValue(entry));
}

function expectString(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): string | null {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    pushIssue(context, key, "Expected a non-empty string.");
    return null;
  }

  return value;
}

function expectNumber(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): number | null {
  const value = input[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    pushIssue(context, key, "Expected a finite number.");
    return null;
  }

  return value;
}

function expectJsonObject(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string,
  options?: { nullable?: boolean }
): JsonObject | null {
  const value = input[key];
  if (value === null && options?.nullable) {
    return null;
  }

  if (!isPlainObject(value) || !isJsonValue(value)) {
    pushIssue(context, key, "Expected a JSON object.");
    return null;
  }

  return value as JsonObject;
}

function expectJsonValue(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): SeedJsonValue | null {
  const value = input[key];
  if (!isJsonValue(value)) {
    pushIssue(context, key, "Expected JSON-compatible data.");
    return null;
  }

  return value;
}

function expectOptionalJsonObject(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): JsonObject | null {
  if (input[key] === undefined || input[key] === null) {
    return null;
  }

  return expectJsonObject(context, input, key);
}

function expectOptionalJsonValue(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): SeedJsonValue | null {
  if (input[key] === undefined || input[key] === null) {
    return null;
  }

  return expectJsonValue(context, input, key);
}

function expectOptionalString(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): string | null {
  const value = input[key];
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    pushIssue(context, key, "Expected a non-empty string.");
    return null;
  }

  return value;
}

function expectOptionalBoolean(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): boolean | null {
  const value = input[key];
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "boolean") {
    pushIssue(context, key, "Expected a boolean.");
    return null;
  }

  return value;
}

function expectOptionalSeat(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): string | null {
  const value = input[key];
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    pushIssue(context, key, "Expected a seat string or null.");
    return null;
  }

  return value;
}

function expectIsoDate(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): string | null {
  const value = expectString(context, input, key);
  if (!value) {
    return null;
  }

  if (Number.isNaN(Date.parse(value))) {
    pushIssue(context, key, "Expected an ISO-8601 timestamp.");
    return null;
  }

  return value;
}

function expectRequestedProvider(
  context: ValidatorContext,
  input: Record<string, unknown>,
  key: string
): RequestedDecisionProvider | null {
  const value = input[key];
  if (value !== "server_heuristic" && value !== "lightgbm_model") {
    pushIssue(context, key, "Expected 'server_heuristic' or 'lightgbm_model'.");
    return null;
  }

  return value;
}

function finalizeValidation<T>(
  context: ValidatorContext,
  value: T
): ValidationResult<T> {
  return context.issues.length === 0
    ? { ok: true, value }
    : { ok: false, issues: context.issues };
}

function readMetadataString(
  metadata: JsonObject | null,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readMetadataBoolean(
  metadata: JsonObject | null,
  key: string
): boolean | null {
  const value = metadata?.[key];
  return typeof value === "boolean" ? value : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toStableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => toStableJson(entry)).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${toStableJson(entry)}`)
    .join(",")}}`;
}

export function stableTelemetryHash(value: unknown): string {
  const input = toStableJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getActionType(action: unknown): string {
  return isPlainObject(action) && typeof action.type === "string"
    ? action.type
    : "unknown";
}

function sortedStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").sort()
    : [];
}

function readActionStringField(
  action: Record<string, unknown>,
  key: string
): string | null {
  const value = action[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isSelectPassTemplateAction(
  action: Record<string, unknown>
): boolean {
  return (
    action.type === "select_pass" &&
    Array.isArray(action.availableCardIds) &&
    Array.isArray(action.requiredTargets)
  );
}

function isConcreteSelectPassAction(
  action: Record<string, unknown>
): boolean {
  return (
    action.type === "select_pass" &&
    typeof action.left === "string" &&
    typeof action.partner === "string" &&
    typeof action.right === "string"
  );
}

function validateSelectPassTemplateAction(
  candidate: Record<string, unknown>,
  chosen: Record<string, unknown>
): boolean {
  if (!isSelectPassTemplateAction(candidate)) {
    return false;
  }

  const candidateSeat = readActionStringField(candidate, "seat");
  const chosenSeat = readActionStringField(chosen, "seat");
  if (
    candidateSeat !== null &&
    chosenSeat !== null &&
    candidateSeat !== chosenSeat
  ) {
    return false;
  }

  const requiredTargets = sortedStringList(candidate.requiredTargets);
  const selectedTargets = ["left", "partner", "right"] as const;
  if (selectedTargets.some((target) => !requiredTargets.includes(target))) {
    return false;
  }

  const selectedCards = selectedTargets.map((target) =>
    readActionStringField(chosen, target)
  );
  if (selectedCards.some((cardId) => cardId === null)) {
    return false;
  }

  const chosenCardIds = selectedCards.filter(
    (cardId): cardId is string => cardId !== null
  );
  if (new Set(chosenCardIds).size !== chosenCardIds.length) {
    return false;
  }

  const availableCardIds = new Set(sortedStringList(candidate.availableCardIds));
  return chosenCardIds.every((cardId) => availableCardIds.has(cardId));
}

function concreteActionsEquivalent(candidate: unknown, chosen: unknown): boolean {
  if (!isPlainObject(candidate) || !isPlainObject(chosen)) {
    return false;
  }

  if (candidate.type !== chosen.type) {
    return false;
  }

  if (
    typeof candidate.seat === "string" &&
    typeof chosen.seat === "string" &&
    candidate.seat !== chosen.seat
  ) {
    return false;
  }

  if (candidate.type === "play_cards") {
    return (
      sortedStringList(candidate.cardIds).join("|") ===
        sortedStringList(chosen.cardIds).join("|") &&
      candidate.phoenixAsRank === chosen.phoenixAsRank
    );
  }

  if (candidate.type === "select_pass") {
    if (!isConcreteSelectPassAction(candidate)) {
      return false;
    }
    return (
      candidate.seat === chosen.seat &&
      candidate.left === chosen.left &&
      candidate.partner === chosen.partner &&
      candidate.right === chosen.right
    );
  }

  if (candidate.type === "assign_dragon_trick") {
    return candidate.recipient === chosen.recipient;
  }

  if (candidate.type === "advance_phase") {
    return candidate.actor === chosen.actor;
  }

  return true;
}

function chosenActionMatchesLegalAction(
  candidate: unknown,
  chosen: unknown
): boolean {
  if (!isPlainObject(candidate) || !isPlainObject(chosen)) {
    return false;
  }

  if (candidate.type !== chosen.type) {
    return false;
  }

  if (
    candidate.type === "select_pass" &&
    validateSelectPassTemplateAction(candidate, chosen)
  ) {
    return true;
  }

  return concreteActionsEquivalent(candidate, chosen);
}

export function actionsEquivalent(candidate: unknown, chosen: unknown): boolean {
  return chosenActionMatchesLegalAction(candidate, chosen);
}

export function extractActorScopedLegalActions(
  legalActions: SeedJsonValue,
  actorSeat: string
): SeedJsonValue[] {
  if (Array.isArray(legalActions)) {
    return legalActions;
  }

  if (isPlainObject(legalActions)) {
    const actorActions = legalActions[actorSeat];
    if (Array.isArray(actorActions)) {
      return actorActions as SeedJsonValue[];
    }
  }

  return [];
}

export function getDecisionScoringPath(payload: Pick<DecisionRequestPayload, "metadata">): DecisionScoringPath {
  const value = payload.metadata.scoring_path;
  return value === "rich_path" ? "rich_path" : "fast_path";
}

function extractExplanationFromMetadata(metadata: JsonObject | null): SeedJsonValue | null {
  const explanation = metadata?.explanation ?? metadata?.policy_explanation;
  return explanation !== undefined && isJsonValue(explanation) ? explanation : null;
}

function extractCandidateScores(explanation: SeedJsonValue | null): SeedJsonValue | null {
  if (isPlainObject(explanation) && isJsonValue(explanation.candidateScores)) {
    return explanation.candidateScores;
  }

  return null;
}

function extractStateFeatures(explanation: SeedJsonValue | null): JsonObject | null {
  if (isPlainObject(explanation) && isPlainObject(explanation.stateFeatures)) {
    return isJsonValue(explanation.stateFeatures)
      ? (explanation.stateFeatures as JsonObject)
      : null;
  }

  return null;
}

export function deriveTelemetryDecisionFields(
  payload: TelemetryDecisionPayload
): DerivedTelemetryDecisionFields {
  const actorActions = extractActorScopedLegalActions(
    payload.legal_actions,
    payload.actor_seat
  );
  const chosenActionType = getActionType(payload.chosen_action);
  const chosenActionIsLegal = actorActions.some((candidate) =>
    actionsEquivalent(candidate, payload.chosen_action)
  );
  const wishRank =
    readFiniteNumber(payload.state_raw.currentWish) ??
    readFiniteNumber(payload.metadata.current_wish) ??
    readFiniteNumber(payload.metadata.wish_rank) ??
    readFiniteNumber(payload.chosen_action.wishRank);

  const explanationQualityLevel =
    payload.stateFeatures !== null
      ? "featured"
      : Array.isArray(payload.candidateScores)
        ? "scored"
        : payload.explanation !== null
          ? "basic"
          : "none";

  return {
    chosen_action_type: chosenActionType,
    legal_action_count: actorActions.length,
    chosen_action_is_legal: chosenActionIsLegal,
    has_explanation: payload.explanation !== null,
    has_candidate_scores: Array.isArray(payload.candidateScores),
    has_state_features: payload.stateFeatures !== null,
    explanation_quality_level: explanationQualityLevel,
    has_wish: wishRank !== null,
    wish_rank: wishRank,
    can_pass: actorActions.some((action) => getActionType(action) === "pass_turn"),
    state_hash: stableTelemetryHash(payload.state_norm ?? payload.state_raw),
    legal_actions_hash: stableTelemetryHash(actorActions),
    chosen_action_hash: stableTelemetryHash(payload.chosen_action)
  };
}

export function deriveTelemetryEventFields(
  payload: TelemetryEventPayload
): DerivedTelemetryEventFields {
  return {
    state_hash: payload.state_norm ? stableTelemetryHash(payload.state_norm) : null,
    event_hash: stableTelemetryHash(payload.payload)
  };
}

function validateDecisionConsistency(
  context: ValidatorContext,
  payload: TelemetryDecisionPayload
): void {
  const actorActions = extractActorScopedLegalActions(
    payload.legal_actions,
    payload.actor_seat
  );

  if (actorActions.length === 0) {
    pushIssue(
      context,
      "legal_actions",
      "Expected actor-scoped legal actions or a legal action map containing actor_seat."
    );
  } else if (
    !actorActions.some((candidate) =>
      actionsEquivalent(candidate, payload.chosen_action)
    )
  ) {
    pushIssue(
      context,
      "chosen_action",
      "chosen_action must match one of actor_seat's legal_actions."
    );
  }

  if (
    typeof payload.state_raw.phase === "string" &&
    payload.state_raw.phase !== payload.phase
  ) {
    pushIssue(context, "phase", "phase must match state_raw.phase.");
  }

  if (
    payload.actor_seat !== "system" &&
    typeof payload.state_raw.activeSeat === "string" &&
    payload.state_raw.activeSeat !== payload.actor_seat
  ) {
    pushIssue(
      context,
      "actor_seat",
      "actor_seat must match state_raw.activeSeat when activeSeat is available."
    );
  }
}

export function validateTelemetryDecisionPayload(
  payload: unknown
): ValidationResult<TelemetryDecisionPayload> {
  const context: ValidatorContext = { issues: [] };

  if (!isPlainObject(payload)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "Expected a JSON object payload." }]
    };
  }

  const metadata = expectJsonObject(context, payload, "metadata") ?? {};
  const explanation =
    expectOptionalJsonValue(context, payload, "explanation") ??
    extractExplanationFromMetadata(metadata);
  const candidateScores =
    expectOptionalJsonValue(context, payload, "candidateScores") ??
    extractCandidateScores(explanation);
  const stateFeatures =
    expectOptionalJsonObject(context, payload, "stateFeatures") ??
    extractStateFeatures(explanation);
  const policySourceForFallback =
    typeof payload.policy_source === "string" && payload.policy_source.trim().length > 0
      ? payload.policy_source
      : "";
  const requestedProvider =
    expectOptionalString(context, payload, "requested_provider") ??
    readMetadataString(metadata, "requested_provider") ??
    policySourceForFallback ??
    "";
  const providerUsed =
    expectOptionalString(context, payload, "provider_used") ??
    readMetadataString(metadata, "provider_used") ??
    policySourceForFallback ??
    "";
  const fallbackUsed =
    expectOptionalBoolean(context, payload, "fallback_used") ??
    readMetadataBoolean(metadata, "fallback_used") ??
    false;

  if (!requestedProvider) {
    pushIssue(
      context,
      "requested_provider",
      "Expected requested_provider as a canonical field or metadata value."
    );
  }

  if (!providerUsed) {
    pushIssue(
      context,
      "provider_used",
      "Expected provider_used as a canonical field or metadata value."
    );
  }

  const value: TelemetryDecisionPayload = {
    ts: expectIsoDate(context, payload, "ts") ?? new Date(0).toISOString(),
    game_id: expectString(context, payload, "game_id") ?? "",
    hand_id: expectString(context, payload, "hand_id") ?? "",
    phase: expectString(context, payload, "phase") ?? "",
    actor_seat: expectString(context, payload, "actor_seat") ?? "",
    decision_index: expectNumber(context, payload, "decision_index") ?? 0,
    schema_version: expectNumber(context, payload, "schema_version") ?? 0,
    engine_version: expectString(context, payload, "engine_version") ?? "",
    sim_version: expectString(context, payload, "sim_version") ?? "",
    requested_provider: requestedProvider,
    provider_used: providerUsed,
    fallback_used: fallbackUsed,
    policy_name: expectString(context, payload, "policy_name") ?? "",
    policy_source: expectString(context, payload, "policy_source") ?? "",
    state_raw: expectJsonObject(context, payload, "state_raw") ?? {},
    state_norm:
      payload.state_norm === undefined
        ? null
        : expectJsonObject(context, payload, "state_norm", {
            nullable: true
          }),
    legal_actions: expectJsonValue(context, payload, "legal_actions") ?? [],
    chosen_action: expectJsonObject(context, payload, "chosen_action") ?? {},
    explanation,
    candidateScores,
    stateFeatures,
    metadata,
    antipattern_tags: expectJsonValue(context, payload, "antipattern_tags") ?? []
  };

  validateDecisionConsistency(context, value);

  return finalizeValidation(context, value);
}

export function validateTelemetryEventPayload(
  payload: unknown
): ValidationResult<TelemetryEventPayload> {
  const context: ValidatorContext = { issues: [] };

  if (!isPlainObject(payload)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "Expected a JSON object payload." }]
    };
  }

  const metadata = expectJsonObject(context, payload, "metadata") ?? {};
  const value: TelemetryEventPayload = {
    ts: expectIsoDate(context, payload, "ts") ?? new Date(0).toISOString(),
    game_id: expectString(context, payload, "game_id") ?? "",
    hand_id: expectString(context, payload, "hand_id") ?? "",
    phase: expectString(context, payload, "phase") ?? "",
    event_type: expectString(context, payload, "event_type") ?? "",
    actor_seat: expectOptionalSeat(context, payload, "actor_seat"),
    event_index: expectNumber(context, payload, "event_index") ?? 0,
    schema_version: expectNumber(context, payload, "schema_version") ?? 0,
    engine_version: expectString(context, payload, "engine_version") ?? "",
    sim_version: expectString(context, payload, "sim_version") ?? "",
    requested_provider:
      typeof payload.requested_provider === "string"
        ? payload.requested_provider
        : readMetadataString(metadata, "requested_provider"),
    provider_used:
      typeof payload.provider_used === "string"
        ? payload.provider_used
        : readMetadataString(metadata, "provider_used"),
    fallback_used:
      typeof payload.fallback_used === "boolean"
        ? payload.fallback_used
        : (readMetadataBoolean(metadata, "fallback_used") ?? false),
    state_norm: expectJsonObject(context, payload, "state_norm", {
      nullable: true
    }),
    payload: expectJsonValue(context, payload, "payload") ?? {},
    metadata
  };

  return finalizeValidation(context, value);
}

export function validateDecisionRequestPayload(
  payload: unknown
): ValidationResult<DecisionRequestPayload> {
  const context: ValidatorContext = { issues: [] };

  if (!isPlainObject(payload)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "Expected a JSON object payload." }]
    };
  }

  const stateRaw =
    payload.state_raw === null || payload.state_raw === undefined
      ? null
      : expectJsonObject(context, payload, "state_raw");
  const stateNorm =
    payload.state_norm === null || payload.state_norm === undefined
      ? null
      : expectJsonObject(context, payload, "state_norm");

  if (!stateRaw && !stateNorm) {
    pushIssue(context, "state_raw", "Expected state_raw or state_norm.");
  }

  const value: DecisionRequestPayload = {
    game_id: expectString(context, payload, "game_id") ?? "",
    hand_id: expectString(context, payload, "hand_id") ?? "",
    phase: expectString(context, payload, "phase") ?? "",
    actor_seat: expectString(context, payload, "actor_seat") ?? "",
    schema_version: expectNumber(context, payload, "schema_version") ?? 0,
    engine_version: expectString(context, payload, "engine_version") ?? "",
    sim_version: expectString(context, payload, "sim_version") ?? "",
    state_raw: stateRaw,
    state_norm: stateNorm,
    legal_actions: expectJsonValue(context, payload, "legal_actions") ?? [],
    requested_provider:
      expectRequestedProvider(context, payload, "requested_provider") ??
      "server_heuristic",
    metadata: expectJsonObject(context, payload, "metadata") ?? {}
  };

  return finalizeValidation(context, value);
}

export function normalizeBackendBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return DEFAULT_BACKEND_BASE_URL;
  }

  return trimmed.replace(/\/+$/, "");
}

export function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean
): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}
