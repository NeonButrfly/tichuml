import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import postgres from "postgres";
import {
  applyEngineAction,
  getLegalActions,
  SEAT_IDS,
  SYSTEM_ACTOR,
  type GameState,
  type LegalAction,
  type LegalActionMap,
  type SeatId
} from "@tichuml/engine";
import {
  defaultDatabaseUrl,
  extractActorScopedLegalActions,
  type JsonObject
} from "@tichuml/shared";
import {
  buildRolloutSeed,
  coerceEngineAction,
  extractRolloutSampleMetrics,
  findMatchingLegalAction,
  legalActionKey,
  stableJsonString,
  summarizeRolloutSamples
} from "./ml-rollout-utils.js";
import { resolveDecision } from "./self-play-batch.js";

type ProviderMode = "local" | "server_heuristic" | "lightgbm_model";

type ParsedArgs = {
  databaseUrl: string;
  inputExport?: string;
  output: string;
  maxDecisions?: number;
  phase?: string;
  provider?: string;
  continuationProvider: ProviderMode;
  rolloutsPerAction: number;
  seed: string;
  concurrency: number;
  resume: boolean;
  backendUrl: string;
  decisionId?: number;
  gameId?: string;
  handId?: string;
};

type ExportSelection = Map<number, Set<string>>;

type DecisionRow = {
  id: number;
  game_id: string;
  hand_id: string;
  phase: string;
  actor_seat: string;
  decision_index: number;
  requested_provider: string | null;
  provider_used: string | null;
  engine_version: string;
  sim_version: string;
  state_raw: JsonObject | null;
  state_norm: JsonObject | null;
  legal_actions: JsonObject | null;
};

type RolloutJob = {
  decisionId: number;
  gameId: string;
  handId: string;
  phase: string;
  actorSeat: SeatId;
  candidateActionKey: string;
  candidateActionCanonicalJson: string;
  continuationProvider: ProviderMode;
  engineVersion: string;
};

type RolloutResultRow = {
  decision_id: number;
  candidate_action_key: string;
  rollout_available: boolean;
  rollout_samples: number;
  rollout_failures: number;
  rollout_mean_actor_team_delta: number | null;
  rollout_median_actor_team_delta: number | null;
  rollout_std_actor_team_delta: number | null;
  rollout_win_rate: number | null;
  rollout_hand_win_rate: number | null;
  rollout_tichu_success_rate: number | null;
  rollout_grand_tichu_success_rate: number | null;
  rollout_mean_finish_rank_actor: number | null;
  rollout_mean_finish_rank_partner: number | null;
  rollout_continuation_provider: string;
  rollout_seed: string;
  rollout_engine_version: string;
  rollout_failure_reason: string | null;
};

type RolloutQuality = {
  created_at: string;
  jobs_discovered: number;
  jobs_skipped_existing: number;
  jobs_executed: number;
  jobs_succeeded: number;
  jobs_failed: number;
  sample_runs_succeeded: number;
  sample_runs_failed: number;
  skipped_invalid_forced_action: number;
  skipped_missing_state_raw: number;
  skipped_actor_mismatch: number;
  skipped_parse_failures: number;
  phase: string | null;
  provider: string | null;
  continuation_provider: ProviderMode;
  rollouts_per_action: number;
  concurrency: number;
  seed: string;
  output: string;
  input_export: string | null;
  database_url_source: "explicit" | "default";
  failure_reason_counts: Record<string, number>;
};

const DEFAULT_OUTPUT = "ml/data/rollout_rows.jsonl";
const DEFAULT_JOBS_OUTPUT = "artifacts/ml/rollout-jobs.jsonl";
const DEFAULT_QUALITY_JSON = "artifacts/ml/rollout-quality.json";
const DEFAULT_QUALITY_MD = "artifacts/ml/rollout-quality.md";

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
      [
        "Usage: npm run ml:rollouts -- [options]",
        "",
        "Options:",
        "  --database-url <url>",
        "  --input-export <path-to-jsonl>",
        "  --output <path-to-jsonl>",
        "  --max-decisions <count>",
        "  --phase <phase>",
        "  --provider <provider>",
        "  --continuation-provider <local|server_heuristic|lightgbm_model>",
        "  --rollouts-per-action <count>",
        "  --seed <seed>",
        "  --concurrency <count>",
        "  --resume",
        "  --backend-url <url>",
        "  --decision-id <id>",
        "  --game-id <game-id>",
        "  --hand-id <hand-id>"
      ].join("\n") + "\n"
    );
    process.exit(0);
  }

  const parsed: ParsedArgs = {
    databaseUrl: defaultDatabaseUrl,
    output: DEFAULT_OUTPUT,
    phase: "play",
    continuationProvider: "local",
    rolloutsPerAction: 1,
    seed: "rollout",
    concurrency: 1,
    resume: false,
    backendUrl: "http://127.0.0.1:4310"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case "--database-url":
        if (next) {
          parsed.databaseUrl = next;
          index += 1;
        }
        break;
      case "--input-export":
        if (next) {
          parsed.inputExport = next;
          index += 1;
        }
        break;
      case "--output":
        if (next) {
          parsed.output = next;
          index += 1;
        }
        break;
      case "--max-decisions":
        if (next) {
          parsed.maxDecisions = Number(next);
          index += 1;
        }
        break;
      case "--phase":
        if (next) {
          parsed.phase = next;
          index += 1;
        }
        break;
      case "--provider":
        if (next) {
          parsed.provider = next;
          index += 1;
        }
        break;
      case "--continuation-provider":
        if (
          next === "local" ||
          next === "server_heuristic" ||
          next === "lightgbm_model"
        ) {
          parsed.continuationProvider = next;
          index += 1;
        } else {
          throw new Error(`Unsupported continuation provider: ${String(next)}`);
        }
        break;
      case "--rollouts-per-action":
        if (next) {
          parsed.rolloutsPerAction = Math.max(1, Number(next));
          index += 1;
        }
        break;
      case "--seed":
        if (next) {
          parsed.seed = next;
          index += 1;
        }
        break;
      case "--concurrency":
        if (next) {
          parsed.concurrency = Math.max(1, Number(next));
          index += 1;
        }
        break;
      case "--resume":
        parsed.resume = true;
        break;
      case "--backend-url":
        if (next) {
          parsed.backendUrl = next;
          index += 1;
        }
        break;
      case "--decision-id":
        if (next) {
          parsed.decisionId = Number(next);
          index += 1;
        }
        break;
      case "--game-id":
        if (next) {
          parsed.gameId = next;
          index += 1;
        }
        break;
      case "--hand-id":
        if (next) {
          parsed.handId = next;
          index += 1;
        }
        break;
      default:
        break;
    }
  }

  return parsed;
}

function resolvePhaseFilter(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value === "play" ? "trick_play" : value;
}

function resolveNextActor(
  legalActions: LegalActionMap,
  state: GameState
): SeatId | typeof SYSTEM_ACTOR {
  if ((legalActions[SYSTEM_ACTOR] ?? []).length > 0) {
    return SYSTEM_ACTOR;
  }

  if (
    typeof state.activeSeat === "string" &&
    SEAT_IDS.includes(state.activeSeat as SeatId) &&
    (legalActions[state.activeSeat as SeatId] ?? []).length > 0
  ) {
    return state.activeSeat as SeatId;
  }

  if (state.phase === "pass_select") {
    const pendingSeat = SEAT_IDS.find(
      (seat) =>
        !state.passSelections[seat] && (legalActions[seat] ?? []).length > 0
    );
    if (pendingSeat) {
      return pendingSeat;
    }
  }

  for (const seat of SEAT_IDS) {
    if ((legalActions[seat] ?? []).length > 0) {
      return seat;
    }
  }

  throw new Error("No legal actor was available for the rollout continuation.");
}

async function loadExportSelection(
  inputExport: string | undefined
): Promise<ExportSelection> {
  const selection: ExportSelection = new Map();
  if (!inputExport) {
    return selection;
  }

  const resolved = path.resolve(inputExport);
  if (!resolved.endsWith(".jsonl")) {
    throw new Error(
      "ml:rollouts currently supports --input-export only for JSONL exports. Re-run ml:export with --format jsonl or omit --input-export."
    );
  }

  const reader = readline.createInterface({
    input: fs.createReadStream(resolved, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const payload = JSON.parse(trimmed) as Record<string, unknown>;
    const decisionId =
      typeof payload.decision_id === "number"
        ? payload.decision_id
        : Number(payload.decision_id);
    const candidateActionKey =
      typeof payload.candidate_action_key === "string"
        ? payload.candidate_action_key
        : null;
    if (!Number.isFinite(decisionId) || !candidateActionKey) {
      continue;
    }
    const existing = selection.get(decisionId) ?? new Set<string>();
    existing.add(candidateActionKey);
    selection.set(decisionId, existing);
  }

  return selection;
}

async function loadExistingResults(outputPath: string): Promise<Set<string>> {
  const existing = new Set<string>();
  if (!fs.existsSync(outputPath)) {
    return existing;
  }

  const reader = readline.createInterface({
    input: fs.createReadStream(outputPath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const payload = JSON.parse(trimmed) as Record<string, unknown>;
    const decisionId =
      typeof payload.decision_id === "number"
        ? payload.decision_id
        : Number(payload.decision_id);
    const candidateActionKey =
      typeof payload.candidate_action_key === "string"
        ? payload.candidate_action_key
        : null;
    if (Number.isFinite(decisionId) && candidateActionKey) {
      existing.add(`${decisionId}:${candidateActionKey}`);
    }
  }
  return existing;
}

async function fetchDecisionRows(
  sql: postgres.Sql,
  args: ParsedArgs,
  exportSelection: ExportSelection
): Promise<DecisionRow[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const phase = resolvePhaseFilter(args.phase);

  if (phase) {
    clauses.push(`phase = $${params.length + 1}`);
    params.push(phase);
  }
  if (args.provider) {
    clauses.push(`COALESCE(provider_used, requested_provider) = $${params.length + 1}`);
    params.push(args.provider);
  }
  if (args.decisionId !== undefined) {
    clauses.push(`id = $${params.length + 1}`);
    params.push(args.decisionId);
  }
  if (args.gameId) {
    clauses.push(`game_id = $${params.length + 1}`);
    params.push(args.gameId);
  }
  if (args.handId) {
    clauses.push(`hand_id = $${params.length + 1}`);
    params.push(args.handId);
  }
  if (exportSelection.size > 0 && args.decisionId === undefined) {
    clauses.push(`id = ANY($${params.length + 1})`);
    params.push([...exportSelection.keys()]);
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limitClause =
    typeof args.maxDecisions === "number" && args.maxDecisions > 0
      ? `LIMIT $${params.length + 1}`
      : "";
  if (limitClause) {
    params.push(args.maxDecisions);
  }

  const query = `
    SELECT
      id,
      game_id,
      hand_id,
      phase,
      actor_seat,
      decision_index,
      requested_provider,
      provider_used,
      engine_version,
      sim_version,
      state_raw,
      state_norm,
      legal_actions
    FROM decisions
    ${whereClause}
    ORDER BY game_id ASC, hand_id ASC, decision_index ASC, id ASC
    ${limitClause}
  `;

  return await sql.unsafe<DecisionRow[]>(query, params as never[]);
}

function buildJobs(
  decisions: DecisionRow[],
  exportSelection: ExportSelection
): {
  jobs: RolloutJob[];
  decisionsById: Map<number, DecisionRow>;
  skippedMissingStateRaw: number;
  skippedActorMismatch: number;
  skippedParseFailures: number;
} {
  const jobs: RolloutJob[] = [];
  const decisionsById = new Map<number, DecisionRow>();
  let skippedMissingStateRaw = 0;
  let skippedActorMismatch = 0;
  let skippedParseFailures = 0;

  for (const decision of decisions) {
    decisionsById.set(decision.id, decision);
    const stateRaw = decision.state_raw as unknown as GameState | null;
    if (!stateRaw) {
      skippedMissingStateRaw += 1;
      continue;
    }
    const actorSeat = decision.actor_seat as SeatId;
    if (!SEAT_IDS.includes(actorSeat)) {
      skippedActorMismatch += 1;
      continue;
    }
    const actorActions = extractActorScopedLegalActions(
      decision.legal_actions,
      actorSeat
    ) as unknown[];
    if (!Array.isArray(actorActions) || actorActions.length === 0) {
      skippedParseFailures += 1;
      continue;
    }
    const selection = exportSelection.get(decision.id);
    for (const action of actorActions) {
      const actionObject =
        typeof action === "object" && action !== null && !Array.isArray(action)
          ? (action as JsonObject)
          : null;
      if (!actionObject) {
        skippedParseFailures += 1;
        continue;
      }
      const candidateActionKey = stableJsonString(actionObject);
      if (selection && !selection.has(candidateActionKey)) {
        continue;
      }
      jobs.push({
        decisionId: decision.id,
        gameId: decision.game_id,
        handId: decision.hand_id,
        phase: decision.phase,
        actorSeat,
        candidateActionKey,
        candidateActionCanonicalJson: JSON.stringify(actionObject),
        continuationProvider: "local",
        engineVersion: decision.engine_version
      });
    }
  }

  return {
    jobs,
    decisionsById,
    skippedMissingStateRaw,
    skippedActorMismatch,
    skippedParseFailures
  };
}

async function appendJsonlLine(targetPath: string, payload: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.appendFile(
    targetPath,
    `${JSON.stringify(payload)}\n`,
    "utf8"
  );
}

function qualityMarkdown(payload: RolloutQuality): string {
  return [
    "# Rollout Quality Report",
    "",
    `- jobs_discovered: ${payload.jobs_discovered}`,
    `- jobs_skipped_existing: ${payload.jobs_skipped_existing}`,
    `- jobs_executed: ${payload.jobs_executed}`,
    `- jobs_succeeded: ${payload.jobs_succeeded}`,
    `- jobs_failed: ${payload.jobs_failed}`,
    `- sample_runs_succeeded: ${payload.sample_runs_succeeded}`,
    `- sample_runs_failed: ${payload.sample_runs_failed}`,
    `- skipped_invalid_forced_action: ${payload.skipped_invalid_forced_action}`,
    `- skipped_missing_state_raw: ${payload.skipped_missing_state_raw}`,
    `- skipped_actor_mismatch: ${payload.skipped_actor_mismatch}`,
    `- skipped_parse_failures: ${payload.skipped_parse_failures}`,
    `- continuation_provider: ${payload.continuation_provider}`,
    `- rollouts_per_action: ${payload.rollouts_per_action}`,
    `- concurrency: ${payload.concurrency}`,
    `- seed: ${payload.seed}`,
    "",
    "## Failure Reasons",
    "",
    ...Object.entries(payload.failure_reason_counts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reason, count]) => `- ${reason}: ${count}`)
  ].join("\n");
}

async function runSingleRolloutJob(
  job: RolloutJob,
  args: ParsedArgs,
  decision: DecisionRow
): Promise<RolloutResultRow> {
  const stateRaw = decision.state_raw as unknown as GameState | null;
  if (!stateRaw) {
    return {
      decision_id: job.decisionId,
      candidate_action_key: job.candidateActionKey,
      rollout_available: false,
      rollout_samples: 0,
      rollout_failures: args.rolloutsPerAction,
      rollout_mean_actor_team_delta: null,
      rollout_median_actor_team_delta: null,
      rollout_std_actor_team_delta: null,
      rollout_win_rate: null,
      rollout_hand_win_rate: null,
      rollout_tichu_success_rate: null,
      rollout_grand_tichu_success_rate: null,
      rollout_mean_finish_rank_actor: null,
      rollout_mean_finish_rank_partner: null,
      rollout_continuation_provider: args.continuationProvider,
      rollout_seed: buildRolloutSeed(args.seed, job.decisionId, job.candidateActionKey, 0),
      rollout_engine_version: job.engineVersion,
      rollout_failure_reason: "missing_state_raw"
    };
  }

  const candidateAction = JSON.parse(job.candidateActionCanonicalJson) as JsonObject;
  const legalActions = getLegalActions(stateRaw);
  const actorLegalActions = legalActions[job.actorSeat] ?? [];
  const forcedAction = findMatchingLegalAction(actorLegalActions, candidateAction);
  if (!forcedAction) {
    return {
      decision_id: job.decisionId,
      candidate_action_key: job.candidateActionKey,
      rollout_available: false,
      rollout_samples: 0,
      rollout_failures: args.rolloutsPerAction,
      rollout_mean_actor_team_delta: null,
      rollout_median_actor_team_delta: null,
      rollout_std_actor_team_delta: null,
      rollout_win_rate: null,
      rollout_hand_win_rate: null,
      rollout_tichu_success_rate: null,
      rollout_grand_tichu_success_rate: null,
      rollout_mean_finish_rank_actor: null,
      rollout_mean_finish_rank_partner: null,
      rollout_continuation_provider: args.continuationProvider,
      rollout_seed: buildRolloutSeed(args.seed, job.decisionId, job.candidateActionKey, 0),
      rollout_engine_version: job.engineVersion,
      rollout_failure_reason: "invalid_forced_action"
    };
  }

  const samples = [];
  let rolloutFailures = 0;
  let lastFailureReason: string | null = null;

  for (let sampleIndex = 0; sampleIndex < args.rolloutsPerAction; sampleIndex += 1) {
    const sampleSeed = buildRolloutSeed(
      args.seed,
      job.decisionId,
      job.candidateActionKey,
      sampleIndex
    );
    void sampleSeed;
    try {
      let result = applyEngineAction(
        stateRaw,
        coerceEngineAction(JSON.parse(JSON.stringify(forcedAction)) as JsonObject)
      );
      let continuationDecisionIndex = decision.decision_index + 1;
      let safetyCounter = 0;

      while (result.nextState.phase !== "finished") {
        if (safetyCounter >= 5_000) {
          throw new Error("rollout_decision_limit_reached");
        }
        safetyCounter += 1;
        const actor = resolveNextActor(result.legalActions, result.nextState);
        const resolved = await resolveDecision({
          backendBaseUrl: args.backendUrl,
          telemetryEnabled: false,
          gameId: job.gameId,
          handId: job.handId,
          actor,
          decisionIndex: continuationDecisionIndex,
          stateRaw: result.nextState as unknown as JsonObject,
          stateNorm: result.derivedView as unknown as JsonObject,
          legalActions: result.legalActions,
          phase: result.nextState.phase,
          defaultProvider: args.continuationProvider,
          quiet: true,
          serverFallbackEnabled: true,
          fullStateDecisionRequests: args.continuationProvider !== "server_heuristic"
        });
        result = applyEngineAction(result.nextState, resolved.chosenAction);
        continuationDecisionIndex += 1;
      }

      samples.push(extractRolloutSampleMetrics(result.nextState, job.actorSeat));
    } catch (error) {
      rolloutFailures += 1;
      lastFailureReason =
        error instanceof Error ? error.message : String(error);
    }
  }

  const summary = summarizeRolloutSamples(samples);
  return {
    decision_id: job.decisionId,
    candidate_action_key: job.candidateActionKey,
    rollout_available: samples.length > 0,
    rollout_samples: samples.length,
    rollout_failures: rolloutFailures,
    ...summary,
    rollout_continuation_provider: args.continuationProvider,
    rollout_seed: buildRolloutSeed(args.seed, job.decisionId, job.candidateActionKey, 0),
    rollout_engine_version: job.engineVersion,
    rollout_failure_reason:
      samples.length > 0 && rolloutFailures === 0 ? null : lastFailureReason
  };
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let currentIndex = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (currentIndex < items.length) {
      const nextIndex = currentIndex;
      currentIndex += 1;
      const item = items[nextIndex];
      if (item !== undefined) {
        await worker(item);
      }
    }
  });
  await Promise.all(runners);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const exportSelection = await loadExportSelection(args.inputExport);
  const outputPath = path.resolve(args.output);
  const jobsOutputPath = path.resolve(DEFAULT_JOBS_OUTPUT);
  const qualityJsonPath = path.resolve(DEFAULT_QUALITY_JSON);
  const qualityMdPath = path.resolve(DEFAULT_QUALITY_MD);
  const existingResults = args.resume
    ? await loadExistingResults(outputPath)
    : new Set<string>();
  const quality: RolloutQuality = {
    created_at: new Date().toISOString(),
    jobs_discovered: 0,
    jobs_skipped_existing: 0,
    jobs_executed: 0,
    jobs_succeeded: 0,
    jobs_failed: 0,
    sample_runs_succeeded: 0,
    sample_runs_failed: 0,
    skipped_invalid_forced_action: 0,
    skipped_missing_state_raw: 0,
    skipped_actor_mismatch: 0,
    skipped_parse_failures: 0,
    phase: resolvePhaseFilter(args.phase) ?? null,
    provider: args.provider ?? null,
    continuation_provider: args.continuationProvider,
    rollouts_per_action: args.rolloutsPerAction,
    concurrency: args.concurrency,
    seed: args.seed,
    output: outputPath,
    input_export: args.inputExport ? path.resolve(args.inputExport) : null,
    database_url_source:
      args.databaseUrl === defaultDatabaseUrl ? "default" : "explicit",
    failure_reason_counts: {}
  };

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  if (!args.resume && fs.existsSync(outputPath)) {
    await fs.promises.writeFile(outputPath, "", "utf8");
  }
  await fs.promises.writeFile(jobsOutputPath, "", "utf8");

  const sql = postgres(args.databaseUrl, { max: 1, idle_timeout: 5 });
  try {
    const decisions = await fetchDecisionRows(sql, args, exportSelection);
    const built = buildJobs(decisions, exportSelection);
    quality.skipped_missing_state_raw = built.skippedMissingStateRaw;
    quality.skipped_actor_mismatch = built.skippedActorMismatch;
    quality.skipped_parse_failures = built.skippedParseFailures;
    quality.jobs_discovered = built.jobs.length;

    const pendingJobs = built.jobs.filter((job) => {
      const key = `${job.decisionId}:${job.candidateActionKey}`;
      if (existingResults.has(key)) {
        quality.jobs_skipped_existing += 1;
        return false;
      }
      return true;
    });

    for (const job of pendingJobs) {
      await appendJsonlLine(jobsOutputPath, job);
    }

    await runWithConcurrency(pendingJobs, args.concurrency, async (job) => {
      const decision = built.decisionsById.get(job.decisionId);
      if (!decision) {
        return;
      }
      const row = await runSingleRolloutJob(job, args, decision);
      quality.jobs_executed += 1;
      quality.sample_runs_succeeded += row.rollout_samples;
      quality.sample_runs_failed += row.rollout_failures;
      if (row.rollout_available) {
        quality.jobs_succeeded += 1;
      } else {
        quality.jobs_failed += 1;
      }
      if (row.rollout_failure_reason) {
        quality.failure_reason_counts[row.rollout_failure_reason] =
          (quality.failure_reason_counts[row.rollout_failure_reason] ?? 0) + 1;
        if (row.rollout_failure_reason === "invalid_forced_action") {
          quality.skipped_invalid_forced_action += 1;
        }
      }
      await appendJsonlLine(outputPath, row);
    });
  } finally {
    await sql.end({ timeout: 5 });
  }

  await fs.promises.mkdir(path.dirname(qualityJsonPath), { recursive: true });
  await fs.promises.writeFile(
    qualityJsonPath,
    `${JSON.stringify(quality, null, 2)}\n`,
    "utf8"
  );
  await fs.promises.writeFile(qualityMdPath, qualityMarkdown(quality), "utf8");

  process.stdout.write(
    `${JSON.stringify({
      accepted: true,
      output: outputPath,
      jobs_output: jobsOutputPath,
      quality_output: qualityJsonPath,
      jobs_executed: quality.jobs_executed,
      jobs_succeeded: quality.jobs_succeeded,
      jobs_failed: quality.jobs_failed
    })}\n`
  );
}

void main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      accepted: false,
      error: error instanceof Error ? error.message : String(error)
    })}\n`
  );
  process.exitCode = 1;
});
