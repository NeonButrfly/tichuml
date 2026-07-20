import os from "node:os";
import { pathToFileURL } from "node:url";

function localHostAliases(osModule = os) {
  const aliases = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
  const hostname = osModule.hostname().trim().toLowerCase();
  if (hostname) {
    aliases.add(hostname);
    aliases.add(hostname.split(".")[0]);
  }

  for (const interfaces of Object.values(osModule.networkInterfaces())) {
    for (const entry of interfaces ?? []) {
      if (entry?.address) {
        aliases.add(entry.address.trim().toLowerCase());
      }
    }
  }

  return aliases;
}

export function parseDatabaseTarget(databaseUrl, osModule = os) {
  if (typeof databaseUrl !== "string" || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL is required.");
  }

  const target = new URL(databaseUrl);
  const host = target.hostname.trim().toLowerCase();
  const port = target.port.trim().length > 0 ? target.port.trim() : "5432";
  const database = target.pathname.replace(/^\/+/, "");
  const isLocal = localHostAliases(osModule).has(host);

  return {
    database,
    host,
    isLocal,
    port,
    scope: isLocal ? "local" : "remote"
  };
}

function printUsage() {
  console.error(
    "Usage: node scripts/database-target.mjs <field|is-local> <database-url> [key]"
  );
}

function main() {
  const [command, databaseUrl, key] = process.argv.slice(2);
  if (!command || !databaseUrl) {
    printUsage();
    process.exit(1);
  }

  let target;
  try {
    target = parseDatabaseTarget(databaseUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to parse DATABASE_URL.";
    console.error(message);
    process.exit(1);
  }

  if (command === "is-local") {
    process.exit(target.isLocal ? 0 : 1);
  }

  if (command === "field") {
    if (!key || !(key in target)) {
      console.error(`Unsupported database target field: ${key ?? "<missing>"}`);
      process.exit(1);
    }
    process.stdout.write(String(target[key]));
    return;
  }

  console.error(`Unsupported database target command: ${command}`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
