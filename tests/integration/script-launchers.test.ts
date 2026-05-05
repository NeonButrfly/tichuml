import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

function repoRoot(): string {
  return path.resolve(import.meta.dirname, "..", "..");
}

function hasCommand(name: string): boolean {
  const result = spawnSync("where.exe", [name], {
    cwd: repoRoot(),
    encoding: "utf8",
    stdio: "ignore"
  });
  return result.status === 0;
}

function runPowerShellScript(cwd: string, scriptPath: string) {
  return spawnSync(
    "powershell",
    [
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-DryRun",
      "-Games",
      "1",
      "-Provider",
      "server_heuristic",
      "-BackendUrl",
      "http://127.0.0.1:4310",
      "-AllowUnhealthyBackend",
      "-SkipMlExportCheck",
      "-DecisionTimeoutMs",
      "2000"
    ],
    {
      cwd,
      encoding: "utf8"
    }
  );
}

function runPowerShellHelp(cwd: string, scriptPath: string) {
  return spawnSync(
    "powershell",
    ["-ExecutionPolicy", "Bypass", "-File", scriptPath, "-Help"],
    {
      cwd,
      encoding: "utf8"
    }
  );
}

const shouldRunPowerShellLaunchers =
  process.platform === "win32" &&
  ["powershell", "git", "npx", "psql", "tar"].every(hasCommand);

const windowsDescribe = shouldRunPowerShellLaunchers ? describe : describe.skip;

windowsDescribe("training-data PowerShell launchers", () => {
  it(
    "supports the top-level start-training launcher from repo root",
    () => {
      const root = repoRoot();
      const result = runPowerShellScript(
        root,
        path.join(root, "scripts", "start-training.ps1")
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Resolved repo root: C:\\tichu\\tichuml");
      expect(result.stdout).toContain("Decision timeout ms: 2000");
    },
    30000
  );

  it(
    "supports the canonical Windows launcher from scripts",
    () => {
      const root = repoRoot();
      const result = runPowerShellScript(
        path.join(root, "scripts"),
        ".\\start-training.ps1"
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Resolved repo root: C:\\tichu\\tichuml");
      expect(result.stdout).toContain(
        "ML export validation command: npm run ml:export"
      );
      expect(result.stderr).not.toContain(
        "scripts\\scripts\\training-data.ts"
      );
      expect(result.stderr).not.toContain("Get-Content : Cannot find path");
    },
    30000
  );

  it(
    "preserves boolean binding through the top-level Windows launcher",
    () => {
      const root = repoRoot();
      const falseResult = spawnSync(
        "powershell",
        [
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(root, "scripts", "start-training.ps1"),
          "-DryRun",
          "-Games",
          "1",
          "-StrictTelemetry",
          "$false"
        ],
        {
          cwd: root,
          encoding: "utf8"
        }
      );
      const zeroResult = spawnSync(
        "powershell",
        [
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(root, "scripts", "start-training.ps1"),
          "-DryRun",
          "-Games",
          "1",
          "-StrictTelemetry",
          "0"
        ],
        {
          cwd: root,
          encoding: "utf8"
        }
      );

      expect(falseResult.status).toBe(0);
      expect(falseResult.stderr).not.toContain("Cannot convert value");
      expect(zeroResult.status).toBe(0);
      expect(zeroResult.stderr).not.toContain("Cannot convert value");
    },
    30000
  );

  it(
    "exposes the top-level Windows training status launcher",
    () => {
      const root = repoRoot();
      const result = runPowerShellHelp(
        root,
        path.join(root, "scripts", "status-training.ps1")
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("status-training.ps1");
      expect(result.stdout).toContain("SessionName");
    },
    30000
  );

  it(
    "renders JSON status output through the top-level Windows status launcher",
    () => {
      const root = repoRoot();
      const runId = "status-launcher-test-run";
      const sessionName = "status-launcher-test-session";
      const runDirectory = path.join(root, "training-runs", runId);
      const controlDirectory = path.join(runDirectory, "control");
      const metadataFile = path.join(runDirectory, "metadata.json");
      const runLog = path.join(runDirectory, "run.log");
      const verificationLog = path.join(runDirectory, "verification.log");
      const passwordFile = path.join(controlDirectory, "pg-password.txt");
      const pidFile = path.join(controlDirectory, "runner.pid");
      const stopFile = path.join(controlDirectory, "stop.signal");

      fs.mkdirSync(controlDirectory, { recursive: true });
      fs.writeFileSync(runLog, "run-log-line\n", "utf8");
      fs.writeFileSync(verificationLog, "verification-line\n", "utf8");
      fs.writeFileSync(passwordFile, "tichu_dev_password\n", "utf8");
      fs.writeFileSync(
        metadataFile,
        `${JSON.stringify(
          {
            run_id: runId,
            session_name: sessionName,
            started_at: "2026-05-05T00:00:00.000Z",
            game_id_prefix: "selfplay-status-launcher-test",
            run_directory: runDirectory,
            metadata_file: metadataFile,
            run_log: runLog,
            verification_log: verificationLog,
            pid_file: pidFile,
            stop_file: stopFile,
            backend_url: "http://127.0.0.1:9",
            pg_host: "127.0.0.1",
            pg_port: "9",
            pg_user: "tichu",
            pg_db: "tichu",
            completed_scoped_matches: 0,
            completed_scoped_decisions: 0,
            completed_scoped_events: 0,
            failure_reason: null,
            sim_exit_code: null,
            sim_exit_signal: null,
            output_tail: [],
            exploration_profile: "off",
            exploration_rate: 0,
            exploration_top_n: 0,
            exploration_max_score_gap: 0,
            fallback_count: 0,
            decision_provider_failures: 0,
            decision_timeout_count: 0
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      try {
        const result = spawnSync(
          "powershell",
          [
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            path.join(root, "scripts", "status-training.ps1"),
            "-SessionName",
            sessionName,
            "-TailLines",
            "5"
          ],
          {
            cwd: root,
            encoding: "utf8"
          }
        );

        expect(result.status).toBe(0);
        expect(result.stdout.trim().startsWith("{")).toBe(true);
        expect(result.stdout).toContain(`"session_name": "${sessionName}"`);
        expect(result.stdout).not.toContain("Microsoft Windows [Version");
      } finally {
        fs.rmSync(runDirectory, { recursive: true, force: true });
      }
    },
    30000
  );
});
