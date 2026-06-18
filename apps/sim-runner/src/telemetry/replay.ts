import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDefaultTelemetryStorageRoot,
  replayPersistedTelemetry
} from "./async-telemetry.js";

type ReplayCliOutput = Pick<Console, "log" | "error">;

export function parseReplayArgs(
  argv: string[]
): { storageRoot: string; quiet: boolean } {
  let storageRoot = createDefaultTelemetryStorageRoot();
  let quiet = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--dir":
      case "--storage-root":
        if (typeof next === "string" && next.length > 0) {
          storageRoot = path.resolve(next);
          index += 1;
        }
        break;
      case "--quiet":
        quiet = true;
        break;
      default:
        break;
    }
  }

  return { storageRoot, quiet };
}

export async function runReplayCli(
  argv: string[] = process.argv.slice(2),
  output: ReplayCliOutput = console
): Promise<number> {
  const args = parseReplayArgs(argv);
  const summary = await replayPersistedTelemetry({
    storageRoot: args.storageRoot,
    quiet: true
  });
  if (!args.quiet) {
    output.log(JSON.stringify(summary, null, 2));
  }
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runReplayCli();
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          accepted: false,
          error: error instanceof Error ? error.message : String(error)
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  });
}
