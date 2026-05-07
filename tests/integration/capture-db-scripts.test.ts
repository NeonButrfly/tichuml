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

function parseNodeLog(logFile: string) {
  return fs
    .readFileSync(logFile, "utf8")
    .split(/\r?\n/gu)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { argv: string[]; command?: string; values?: Record<string, string> });
}

function createMockNode(binDir: string, logFile: string) {
  const mockScript = path.join(binDir, "mock-node.mjs");
  fs.writeFileSync(
    mockScript,
    `import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const logFile = process.env.MOCK_CAPTURE_NODE_LOG;
if (!logFile) {
  throw new Error("MOCK_CAPTURE_NODE_LOG is required");
}

function parseArgs(values) {
  const parsed = { command: values[1], values: {}, archiveFiles: [] };
  for (let index = 2; index < values.length; index += 1) {
    const token = values[index];
    if (token === "--archive-file") {
      parsed.archiveFiles.push(values[index + 1]);
      index += 1;
      continue;
    }
    if (token.startsWith("--")) {
      parsed.values[token.slice(2)] = values[index + 1] ?? "";
      index += 1;
    }
  }
  return parsed;
}

const parsed = parseArgs(argv);
fs.appendFileSync(logFile, JSON.stringify({ argv, command: parsed.command, values: parsed.values, archiveFiles: parsed.archiveFiles }) + "\\n", "utf8");

if (parsed.command === "collect") {
  const stagingDir = parsed.values["staging-dir"];
  fs.mkdirSync(stagingDir, { recursive: true });
  const files = {
    "db-status.txt": "status ok\\n",
    "db-table-sizes.txt": "sizes ok\\n",
    "db-stats.txt": "stats ok\\n",
    "db-activity.txt": "activity ok\\n",
    "db-settings.txt": "settings ok\\n",
    "db-indexes.sql": "-- indexes ok\\n",
    "db-columns.txt": "columns ok\\n",
    "git-status.txt": "git ok\\n",
    "env-redacted.txt": "DATABASE_URL=postgres://fixture-user:***@localhost:5544/from_env_file\\n",
    "docker-status.txt": "docker unavailable\\n",
    "run-notes.txt": "reason=test\\n",
    "RESTORE.md": "# Restore\\n",
    "manifest.json": JSON.stringify({
      capture_id: parsed.values["capture-id"],
      label: parsed.values.label || null,
      created_utc: parsed.values["created-utc"],
      created_local: parsed.values["created-local"],
      repo_path: parsed.values["repo-root"],
      git_branch: "main",
      git_head: "mock-head",
      dirty: false,
      database_host: "localhost",
      database_name: "from_env_file",
      dump_file: "db.dump",
      archive_files: [],
      split_size: parsed.values["split-size"],
      table_counts: {
        matches: 1,
        hands: 2,
        decisions: 3,
        events: 4,
        schema_migrations: 1
      },
      warnings: [],
      script_version: parsed.values["script-version"]
    }, null, 2) + "\\n"
  };
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(stagingDir, name), contents, "utf8");
  }
  process.exit(0);
}

if (parsed.command === "finalize-manifest") {
  const manifestPath = parsed.values.manifest;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.archive_files = parsed.archiveFiles;
  manifest.split_size = parsed.values["split-size"];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\\n", "utf8");
  process.exit(0);
}

throw new Error("Unsupported mock node command: " + parsed.command);
`,
    "utf8"
  );

  writeExecutable(
    path.join(binDir, "node"),
    `#!/usr/bin/env bash
set -euo pipefail
"${toShellPath(process.execPath)}" "${toShellPath(mockScript)}" "$@"
`
  );
  fs.writeFileSync(
    path.join(binDir, "node.cmd"),
    `@echo off\r\n"${process.execPath}" "${mockScript}" %*\r\n`,
    "utf8"
  );
}

function createMockPgDump(binDir: string) {
  const mockScript = path.join(binDir, "mock-pg-dump.mjs");
  fs.writeFileSync(
    mockScript,
    `import fs from "node:fs";
const argv = process.argv.slice(2);
const fileIndex = argv.indexOf("-f");
if (fileIndex < 0 || fileIndex + 1 >= argv.length) {
  throw new Error("pg_dump mock missing -f");
}
fs.writeFileSync(argv[fileIndex + 1], "mock dump\\n", "utf8");
`,
    "utf8"
  );

  writeExecutable(
    path.join(binDir, "pg_dump"),
    `#!/usr/bin/env bash
set -euo pipefail
"${toShellPath(process.execPath)}" "${toShellPath(mockScript)}" "$@"
`
  );
  fs.writeFileSync(
    path.join(binDir, "pg_dump.cmd"),
    `@echo off\r\n"${process.execPath}" "${mockScript}" %*\r\n`,
    "utf8"
  );
}

function createMockPsql(binDir: string) {
  writeExecutable(
    path.join(binDir, "psql"),
    `#!/usr/bin/env bash
set -euo pipefail
exit 0
`
  );
  fs.writeFileSync(path.join(binDir, "psql.cmd"), "@echo off\r\nexit /b 0\r\n", "utf8");
}

function createMockSha256(binDir: string) {
  const mockScript = path.join(binDir, "mock-sha256.mjs");
  fs.writeFileSync(
    mockScript,
    `import crypto from "node:crypto";
import fs from "node:fs";

for (const filePath of process.argv.slice(2)) {
  const data = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(data).digest("hex");
  process.stdout.write(hash + "  " + filePath + "\\n");
}
`,
    "utf8"
  );

  writeExecutable(
    path.join(binDir, "sha256sum"),
    `#!/usr/bin/env bash
set -euo pipefail
"${toShellPath(process.execPath)}" "${toShellPath(mockScript)}" "$@"
`
  );
}

function createMockSevenZip(binDir: string) {
  const mockScript = path.join(binDir, "mock-7z.mjs");
  fs.writeFileSync(
    mockScript,
    `import fs from "node:fs";
const argv = process.argv.slice(2);
const archivePath = argv.find((value) => value.endsWith(".7z"));
const hasSplit = argv.some((value) => value.startsWith("-v"));
if (!archivePath) {
  throw new Error("7z mock missing archive path");
}
if (hasSplit) {
  fs.writeFileSync(archivePath + ".001", "part1\\n", "utf8");
  fs.writeFileSync(archivePath + ".002", "part2\\n", "utf8");
} else {
  fs.writeFileSync(archivePath, "archive\\n", "utf8");
}
`,
    "utf8"
  );

  writeExecutable(
    path.join(binDir, "7z"),
    `#!/usr/bin/env bash
set -euo pipefail
"${toShellPath(process.execPath)}" "${toShellPath(mockScript)}" "$@"
`
  );
  fs.writeFileSync(
    path.join(binDir, "7z.cmd"),
    `@echo off\r\n"${process.execPath}" "${mockScript}" %*\r\n`,
    "utf8"
  );
}

function createFixtureRepo() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tichuml-capture-db-"));
  const scriptsDir = path.join(tempDir, "scripts");
  const binDir = path.join(tempDir, "bin");
  const logFile = path.join(tempDir, "capture-node.jsonl");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(tempDir, "package.json"), '{ "name": "fixture" }\n');
  fs.writeFileSync(
    path.join(tempDir, ".env"),
    "DATABASE_URL=postgres://from-env-file:pw@localhost:5544/from_env_file\n",
    "utf8"
  );

  copyFixtureFile(tempDir, "scripts/common.sh");
  copyFixtureFile(tempDir, "scripts/common.ps1");
  copyFixtureFile(tempDir, "scripts/capture-db.sh");
  copyFixtureFile(tempDir, "scripts/capture-db.ps1");
  copyFixtureFile(tempDir, "scripts/capture-db-core.mjs");
  fs.chmodSync(path.join(scriptsDir, "capture-db.sh"), 0o755);

  createMockNode(binDir, logFile);
  createMockPgDump(binDir);
  createMockPsql(binDir);
  createMockSha256(binDir);
  createMockSevenZip(binDir);

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

bashDescribe("capture-db bash launcher", () => {
  it("exposes help", () => {
    const fixture = createFixtureRepo();
    cleanupPaths.push(fixture.tempDir);

    const result = spawnSync(bashPath!, ["./capture-db.sh", "--help"], {
      cwd: fixture.scriptsDir,
      encoding: "utf8"
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("scripts/capture-db.sh");
    expect(result.stdout).toContain("--no-split");
    expect(result.stdout).toContain("--remove-staging");
  });

  it("loads DATABASE_URL from .env, creates required artifacts, and splits archives by default", () => {
    const fixture = createFixtureRepo();
    cleanupPaths.push(fixture.tempDir);

    const result = spawnSync(
      bashPath!,
      ["./capture-db.sh", "--label", "fixture run", "--reason", "test capture"],
      {
        cwd: fixture.scriptsDir,
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: "",
          MOCK_CAPTURE_NODE_LOG: fixture.logFile,
          PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH ?? ""}`
        }
      }
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Capture summary");
    expect(result.stdout).toContain(".7z.001");

    const entries = parseNodeLog(fixture.logFile);
    const collectEntry = entries.find((entry) => entry.command === "collect");
    expect(collectEntry?.values?.["database-url"]).toBe(
      "postgres://from-env-file:pw@localhost:5544/from_env_file"
    );

    const outDir = path.join(fixture.tempDir, ".runtime", "db-captures");
    const stagingDir = fs
      .readdirSync(outDir)
      .map((name) => path.join(outDir, name))
      .find((candidate) => fs.statSync(candidate).isDirectory());
    expect(stagingDir).toBeTruthy();

    for (const fileName of [
      "db.dump",
      "db-schema.sql",
      "manifest.json",
      "checksums.txt",
      "db-status.txt",
      "git-status.txt",
      "env-redacted.txt",
      "RESTORE.md"
    ]) {
      expect(fs.existsSync(path.join(stagingDir!, fileName))).toBe(true);
    }

    const manifestText = fs.readFileSync(path.join(stagingDir!, "manifest.json"), "utf8");
    const envText = fs.readFileSync(path.join(stagingDir!, "env-redacted.txt"), "utf8");
    expect(manifestText).not.toContain("pw@");
    expect(envText).not.toContain("pw@");
    expect(
      fs.readdirSync(stagingDir!).some((name) => name.includes("node_modules"))
    ).toBe(false);

    const archiveParts = fs
      .readdirSync(outDir)
      .filter((name) => name.endsWith(".7z.001") || name.endsWith(".7z.002"));
    expect(archiveParts.length).toBe(2);
  });
});

windowsDescribe("capture-db PowerShell launcher", () => {
  it("exposes help", () => {
    const fixture = createFixtureRepo();
    cleanupPaths.push(fixture.tempDir);

    const result = spawnSync(
      "powershell",
      ["-ExecutionPolicy", "Bypass", "-File", ".\\capture-db.ps1", "-Help"],
      {
        cwd: fixture.scriptsDir,
        encoding: "utf8"
      }
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("scripts\\capture-db.ps1");
    expect(result.stdout).toContain("-NoSplit");
    expect(result.stdout).toContain("-RemoveStaging");
  });

  it("lets an explicit DATABASE_URL override .env and creates split archives", () => {
    const fixture = createFixtureRepo();
    cleanupPaths.push(fixture.tempDir);

    const result = spawnSync(
      "powershell",
      [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        ".\\capture-db.ps1",
        "-Label",
        "fixture run"
      ],
      {
        cwd: fixture.scriptsDir,
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: "postgres://override-user:pw@localhost:6655/override_db",
          MOCK_CAPTURE_NODE_LOG: fixture.logFile,
          PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH ?? ""}`
        }
      }
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Capture summary");

    const entries = parseNodeLog(fixture.logFile);
    const collectEntry = entries.find((entry) => entry.command === "collect");
    expect(collectEntry?.values?.["database-url"]).toBe(
      "postgres://override-user:pw@localhost:6655/override_db"
    );

    const outDir = path.join(fixture.tempDir, ".runtime", "db-captures");
    const stagingDir = fs
      .readdirSync(outDir)
      .map((name) => path.join(outDir, name))
      .find((candidate) => fs.statSync(candidate).isDirectory());
    expect(stagingDir).toBeTruthy();

    const manifestText = fs.readFileSync(path.join(stagingDir!, "manifest.json"), "utf8");
    const envText = fs.readFileSync(path.join(stagingDir!, "env-redacted.txt"), "utf8");
    expect(manifestText).not.toContain("pw@");
    expect(envText).not.toContain("pw@");

    const archiveParts = fs
      .readdirSync(outDir)
      .filter((name) => name.endsWith(".7z.001") || name.endsWith(".7z.002"));
    expect(archiveParts.length).toBe(2);
  });
});
