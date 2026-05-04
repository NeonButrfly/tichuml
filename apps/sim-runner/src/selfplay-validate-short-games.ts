import {
  runSelfPlayBatchDetailed,
  type SelfPlayBatchDetailedResult,
  type SelfPlayStopReason
} from "./self-play-batch.js";

type ParsedArgs = {
  games: number;
  seed: string;
  provider: "local" | "server_heuristic" | "lightgbm_model";
  backendUrl?: string;
  maxDecisionsPerGame?: number;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    games: 10,
    seed: "validate-short-games",
    provider: "local"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--games":
        if (next) {
          parsed.games = Number(next);
          index += 1;
        }
        break;
      case "--seed":
        if (next) {
          parsed.seed = next;
          index += 1;
        }
        break;
      case "--provider":
        if (
          next === "local" ||
          next === "server_heuristic" ||
          next === "lightgbm_model"
        ) {
          parsed.provider = next;
          index += 1;
        }
        break;
      case "--backend-url":
        if (next) {
          parsed.backendUrl = next;
          index += 1;
        }
        break;
      case "--max-decisions":
        if (next) {
          parsed.maxDecisionsPerGame = Number(next);
          index += 1;
        }
        break;
      default:
        break;
    }
  }

  return parsed;
}

function countByKey(bucket: Record<string, number>, key: string | null): void {
  const normalized = key ?? "none";
  bucket[normalized] = (bucket[normalized] ?? 0) + 1;
}

function buildFailureExamples(
  result: SelfPlayBatchDetailedResult
): Record<string, unknown[]> {
  const examples: Record<string, unknown[]> = {};
  for (const game of result.games) {
    if (game.stopReason === "terminal_game_finished") {
      continue;
    }
    const bucket = examples[game.stopReason] ?? [];
    if (bucket.length >= 3) {
      examples[game.stopReason] = bucket;
      continue;
    }
    bucket.push({
      game_id: game.gameId,
      hand_id: game.lastHandId,
      decisions: game.decisions,
      last_phase: game.lastPhase,
      last_actor: game.lastActor,
      last_action_type: game.lastActionType,
      stop_reason: game.stopReason,
      stop_details: game.stopDetails
    });
    examples[game.stopReason] = bucket;
  }
  return examples;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const detailed = await runSelfPlayBatchDetailed({
    games: args.games,
    baseSeed: args.seed,
    defaultProvider: args.provider,
    telemetryEnabled: false,
    quiet: true,
    progress: false,
    ...(args.backendUrl ? { backendBaseUrl: args.backendUrl } : {}),
    ...(args.maxDecisionsPerGame !== undefined
      ? { maxDecisionsPerGame: args.maxDecisionsPerGame }
      : {})
  });

  const under20 = detailed.games.filter((game) => game.decisions < 20);
  const under50 = detailed.games.filter((game) => game.decisions < 50);
  const stopReasons: Record<SelfPlayStopReason, number> = {
    terminal_game_finished: 0,
    waiting_for_local_input: 0,
    no_legal_actions: 0,
    invalid_state: 0,
    backend_error: 0,
    max_steps_guard: 0
  };
  const lastPhaseDistribution: Record<string, number> = {};
  const lastActionDistribution: Record<string, number> = {};

  for (const game of detailed.games) {
    stopReasons[game.stopReason] += 1;
    countByKey(lastPhaseDistribution, game.lastPhase);
    countByKey(lastActionDistribution, game.lastActionType);
  }

  const payload = {
    games_requested: args.games,
    games_observed: detailed.games.length,
    under_20_decisions: under20.length,
    under_50_decisions: under50.length,
    summary: detailed.summary,
    stop_reasons: stopReasons,
    last_phase_distribution: lastPhaseDistribution,
    last_action_distribution: lastActionDistribution,
    examples_by_failure_class: buildFailureExamples(detailed),
    short_game_examples: under50.slice(0, 10).map((game) => ({
      game_id: game.gameId,
      hand_id: game.lastHandId,
      decisions: game.decisions,
      stop_reason: game.stopReason,
      last_phase: game.lastPhase,
      last_actor: game.lastActor,
      last_action_type: game.lastActionType
    }))
  };

  console.log(JSON.stringify(payload, null, 2));
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    })
  );
  process.exitCode = 1;
});
