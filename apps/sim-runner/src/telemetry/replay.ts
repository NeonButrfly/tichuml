import path from "node:path";
import {
  createDefaultTelemetryStorageRoot,
  replayPersistedTelemetry
} from "./async-telemetry.js";

function parseArgs(argv: string[]): { storageRoot: string; quiet: boolean } {
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await replayPersistedTelemetry({
    storageRoot: args.storageRoot,
    quiet: args.quiet
  });
}

if (import.meta.main) {
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
