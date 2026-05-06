import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

function repoRoot(): string {
  return path.resolve(import.meta.dirname, "..", "..");
}

function hasCommand(name: string): boolean {
  const probe = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(probe, [name], {
    cwd: repoRoot(),
    encoding: "utf8",
    stdio: "ignore"
  });
  return result.status === 0;
}

function resolveUsableBash(): string | null {
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Git\\bin\\bash.exe",
          "C:\\Program Files\\Git\\usr\\bin\\bash.exe"
        ]
      : ["bash"];
  for (const candidate of candidates) {
    if (candidate === "bash") {
      const result = spawnSync("bash", ["-lc", "echo ok"], {
        cwd: repoRoot(),
        encoding: "utf8"
      });
      if (result.status === 0 && result.stdout.includes("ok")) {
        return candidate;
      }
      continue;
    }
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function writeExecutable(filePath: string, contents: string) {
  fs.writeFileSync(filePath, contents, "utf8");
  fs.chmodSync(filePath, 0o755);
}

function toShellPath(value: string): string {
  return value.replace(/\\/gu, "/");
}

function parseInvocationLog(logFile: string): Array<{ argv: string[] }> {
  return fs
    .readFileSync(logFile, "utf8")
    .split(/\r?\n/gu)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { argv: string[] });
}

function copyFixtureFile(
  fixtureRoot: string,
  sourceRelativePath: string,
  targetRelativePath = sourceRelativePath
) {
  const sourcePath = path.join(repoRoot(), sourceRelativePath);
  const targetPath = path.join(fixtureRoot, targetRelativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function createMockPsql(binDir: string, logFile: string) {
  const mockScript = path.join(binDir, "mock-psql.mjs");
  fs.writeFileSync(
    mockScript,
    `import fs from "node:fs";
const argv = process.argv.slice(2);
const logFile = process.env.MOCK_PSQL_LOG_FILE;
if (!logFile) {
  throw new Error("MOCK_PSQL_LOG_FILE is required");
}
fs.appendFileSync(logFile, JSON.stringify({ argv }) + "\\n", "utf8");
const joined = argv.join(" ");
if (joined.includes("pg_catalog.pg_tables")) {
  process.stdout.write([
    "public.decisions",
    "public.events",
    "public.matches",
    "public.schema_migrations",
    "public.__drizzle_migrations"
  ].join("\\n"));
  process.exit(0);
}
if (joined.includes("COUNT(*)") && joined.includes("public.decisions")) {
  process.stdout.write("0\\n");
  process.exit(0);
}
if (joined.includes("COUNT(*)") && joined.includes("public.events")) {
  process.stdout.write("0\\n");
  process.exit(0);
}
if (joined.includes("COUNT(*)") && joined.includes("public.matches")) {
  process.stdout.write("0\\n");
  process.exit(0);
}
process.exit(0);
`,
    "utf8"
  );

  writeExecutable(
    path.join(binDir, "psql"),
    `#!/usr/bin/env bash
set -euo pipefail
node "${toShellPath(mockScript)}" "$@"
`
  );
  fs.writeFileSync(
    path.join(binDir, "psql.cmd"),
    `@echo off\r\nnode "${mockScript}" %*\r\n`,
    "utf8"
  );
}

function createFixtureRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tichuml-clear-db-"));
  const scriptsDir = path.join(tempDir, "scripts");
  const binDir = path.join(tempDir, "bin");
  const logFile = path.join(tempDir, "psql-invocations.jsonl");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(tempDir, "package.json"), '{ "name": "fixture" }\n');
  fs.writeFileSync(
    path.join(tempDir, ".env"),
    "DATABASE_URL=postgres://from-env-file:pw@localhost:5544/from_env_file\n",
    "utf8"
  );
  createMockPsql(binDir, logFile);
  return { tempDir, scriptsDir, binDir, logFile };
}

const cleanupPaths: string[] = [];
afterEach(() => {
  for (const target of cleanupPaths.splice(0)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

const bashPath = resolveUsableBash();
const shouldRunBash = bashPath !== null && hasCommand("node");
const shouldRunPowerShell =
  process.platform === "win32" &&
  hasCommand("powershell") &&
  hasCommand("node");

const bashDescribe = shouldRunBash ? describe : describe.skip;
const windowsDescribe = shouldRunPowerShell ? describe : describe.skip;

bashDescribe("clear-db bash launcher", () => {
  it("requires explicit confirmation and exposes help", () => {
    const fixture = createFixtureRepo();
    cleanupPaths.push(fixture.tempDir);
    copyFixtureFile(fixture.tempDir, "scripts/clear-db.sh");
    copyFixtureFile(fixture.tempDir, "scripts/common.sh");
    fs.chmodSync(path.join(fixture.scriptsDir, "clear-db.sh"), 0o755);

    const helpResult = spawnSync(bashPath!, ["./clear-db.sh", "--help"], {
      cwd: fixture.scriptsDir,
      encoding: "utf8"
    });
    const deniedResult = spawnSync(bashPath!, ["./clear-db.sh"], {
      cwd: fixture.scriptsDir,
      encoding: "utf8"
    });

    expect(helpResult.status).toBe(0);
    expect(helpResult.stdout).toContain("scripts/clear-db.sh --yes");
    expect(helpResult.stdout).toContain("--help, -help");
    expect(deniedResult.status).not.toBe(0);
    expect(`${deniedResult.stdout}\n${deniedResult.stderr}`).toContain("--yes");
  });

  it("loads DATABASE_URL from .env, preserves migration tables, and reports zero row counts", () => {
    const fixture = createFixtureRepo();
    cleanupPaths.push(fixture.tempDir);
    copyFixtureFile(fixture.tempDir, "scripts/clear-db.sh");
    copyFixtureFile(fixture.tempDir, "scripts/common.sh");
    fs.chmodSync(path.join(fixture.scriptsDir, "clear-db.sh"), 0o755);

    const result = spawnSync(bashPath!, ["./clear-db.sh", "--yes"], {
      cwd: fixture.scriptsDir,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "",
        MOCK_PSQL_LOG_FILE: fixture.logFile,
        PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH ?? ""}`
      }
    });
    const output = `${result.stdout}\n${result.stderr}`;
    const invocations = parseInvocationLog(fixture.logFile);
    const flattened = invocations.flatMap((entry) => entry.argv);
    const truncateSql =
      invocations
        .flatMap((entry) => entry.argv)
        .find((value) => value.includes("TRUNCATE TABLE")) ?? "";

    expect(result.status).toBe(0);
    expect(output).toContain("Tables to clear:");
    expect(output).toContain("public.decisions");
    expect(output).toContain("public.events");
    expect(output).toContain("public.matches");
    expect(output).toContain("Preserved migration tables:");
    expect(output).toContain("public.schema_migrations");
    expect(flattened).toContain(
      "postgres://from-env-file:pw@localhost:5544/from_env_file"
    );
    expect(truncateSql).toContain("public.decisions");
    expect(truncateSql).toContain("public.events");
    expect(truncateSql).toContain("public.matches");
    expect(truncateSql).toContain("RESTART IDENTITY CASCADE");
    expect(truncateSql).not.toContain("schema_migrations");
    expect(truncateSql).not.toContain("__drizzle_migrations");
    expect(output).toContain("public.decisions: 0");
    expect(output).toContain("public.events: 0");
    expect(output).toContain("public.matches: 0");
  });

  it("lets an explicit DATABASE_URL override beat .env", () => {
    const fixture = createFixtureRepo();
    cleanupPaths.push(fixture.tempDir);
    copyFixtureFile(fixture.tempDir, "scripts/clear-db.sh");
    copyFixtureFile(fixture.tempDir, "scripts/common.sh");
    fs.chmodSync(path.join(fixture.scriptsDir, "clear-db.sh"), 0o755);

    const result = spawnSync(bashPath!, ["./clear-db.sh", "--yes"], {
      cwd: fixture.scriptsDir,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "postgres://override-user:pw@localhost:6655/override_db",
        MOCK_PSQL_LOG_FILE: fixture.logFile,
        PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH ?? ""}`
      }
    });
    const flattened = parseInvocationLog(fixture.logFile).flatMap(
      (entry) => entry.argv
    );

    expect(result.status).toBe(0);
    expect(flattened).toContain(
      "postgres://override-user:pw@localhost:6655/override_db"
    );
    expect(flattened).not.toContain(
      "postgres://from-env-file:pw@localhost:5544/from_env_file"
    );
  });
});

windowsDescribe("clear-db PowerShell launcher", () => {
  it("requires explicit confirmation and exposes help", () => {
    const fixture = createFixtureRepo();
    cleanupPaths.push(fixture.tempDir);
    copyFixtureFile(fixture.tempDir, "scripts/clear-db.ps1");
    copyFixtureFile(fixture.tempDir, "scripts/common.ps1");

    const helpResult = spawnSync(
      "powershell",
      ["-ExecutionPolicy", "Bypass", "-File", ".\\clear-db.ps1", "--help"],
      {
        cwd: fixture.scriptsDir,
        encoding: "utf8"
      }
    );
    const deniedResult = spawnSync(
      "powershell",
      ["-ExecutionPolicy", "Bypass", "-File", ".\\clear-db.ps1"],
      {
        cwd: fixture.scriptsDir,
        encoding: "utf8"
      }
    );

    expect(helpResult.status).toBe(0);
    expect(helpResult.stdout).toContain("scripts\\clear-db.ps1");
    expect(helpResult.stdout).toContain("--help, -help");
    expect(deniedResult.status).not.toBe(0);
    expect(`${deniedResult.stdout}\n${deniedResult.stderr}`).toContain("--yes");
  });

  it("loads DATABASE_URL from .env, preserves migration tables, and reports zero row counts", () => {
    const fixture = createFixtureRepo();
    cleanupPaths.push(fixture.tempDir);
    copyFixtureFile(fixture.tempDir, "scripts/clear-db.ps1");
    copyFixtureFile(fixture.tempDir, "scripts/common.ps1");

    const result = spawnSync(
      "powershell",
      ["-ExecutionPolicy", "Bypass", "-File", ".\\clear-db.ps1", "--yes"],
      {
        cwd: fixture.scriptsDir,
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: "",
          MOCK_PSQL_LOG_FILE: fixture.logFile,
          PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH ?? ""}`
        }
      }
    );
    const output = `${result.stdout}\n${result.stderr}`;
    const invocations = parseInvocationLog(fixture.logFile);
    const flattened = invocations.flatMap((entry) => entry.argv);
    const truncateSql =
      invocations
        .flatMap((entry) => entry.argv)
        .find((value) => value.includes("TRUNCATE TABLE")) ?? "";

    expect(result.status).toBe(0);
    expect(output).toContain("Tables to clear:");
    expect(output).toContain("public.decisions");
    expect(output).toContain("public.events");
    expect(output).toContain("public.matches");
    expect(output).toContain("Preserved migration tables:");
    expect(output).toContain("public.schema_migrations");
    expect(flattened).toContain(
      "postgres://from-env-file:pw@localhost:5544/from_env_file"
    );
    expect(truncateSql).toContain("public.decisions");
    expect(truncateSql).toContain("public.events");
    expect(truncateSql).toContain("public.matches");
    expect(truncateSql).toContain("RESTART IDENTITY CASCADE");
    expect(truncateSql).not.toContain("schema_migrations");
    expect(truncateSql).not.toContain("__drizzle_migrations");
    expect(output).toContain("public.decisions: 0");
    expect(output).toContain("public.events: 0");
    expect(output).toContain("public.matches: 0");
  });

  it("lets an explicit DATABASE_URL override beat .env", () => {
    const fixture = createFixtureRepo();
    cleanupPaths.push(fixture.tempDir);
    copyFixtureFile(fixture.tempDir, "scripts/clear-db.ps1");
    copyFixtureFile(fixture.tempDir, "scripts/common.ps1");

    const result = spawnSync(
      "powershell",
      ["-ExecutionPolicy", "Bypass", "-File", ".\\clear-db.ps1", "--yes"],
      {
        cwd: fixture.scriptsDir,
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: "postgres://override-user:pw@localhost:6655/override_db",
          MOCK_PSQL_LOG_FILE: fixture.logFile,
          PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH ?? ""}`
        }
      }
    );
    const flattened = parseInvocationLog(fixture.logFile).flatMap(
      (entry) => entry.argv
    );

    expect(result.status).toBe(0);
    expect(flattened).toContain(
      "postgres://override-user:pw@localhost:6655/override_db"
    );
    expect(flattened).not.toContain(
      "postgres://from-env-file:pw@localhost:5544/from_env_file"
    );
  });
});
