import { execFileSync } from "node:child_process";
import type { ServerConfig } from "../config/env.js";

export type BackendRuntimeInfo = {
  pid: number;
  cwd: string;
  command_line: string;
  database_url: string;
  git_commit: string;
  build_timestamp: string | null;
  backend_mode: "dev" | "dist" | "server";
  backend_port: number;
  telemetry_health_shape_version: number;
};

export const TELEMETRY_HEALTH_SHAPE_VERSION = 2;

export function sanitizeDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = "***";
    }
    if (url.username) {
      url.username = encodeURIComponent(decodeURIComponent(url.username));
    }
    return url.toString();
  } catch {
    return value.replace(/\/\/([^:@/]+):([^@/]+)@/u, "//$1:***@");
  }
}

function tryExec(repoRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}

function detectBackendMode(): BackendRuntimeInfo["backend_mode"] {
  const argv = process.argv.join(" ");
  if (argv.includes("tsx") || argv.includes("src/index.ts")) {
    return "dev";
  }
  if (argv.includes("dist") || argv.includes("dist/index.js")) {
    return "dist";
  }
  return "server";
}

export function getBackendRuntimeInfo(
  config: ServerConfig
): BackendRuntimeInfo {
  const commit = tryExec(config.repoRoot, ["rev-parse", "HEAD"]) ?? "unknown";
  const commitTimestamp =
    tryExec(config.repoRoot, ["show", "-s", "--format=%cI", "HEAD"]) ?? null;
  return {
    pid: process.pid,
    cwd: process.cwd(),
    command_line: process.argv.join(" "),
    database_url: sanitizeDatabaseUrl(config.databaseUrl),
    git_commit: commit,
    build_timestamp:
      process.env.BUILD_TIMESTAMP?.trim() || commitTimestamp || null,
    backend_mode: detectBackendMode(),
    backend_port: config.port,
    telemetry_health_shape_version: TELEMETRY_HEALTH_SHAPE_VERSION
  };
}
