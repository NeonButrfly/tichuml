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

const shouldRunPowerShellLaunchers =
  process.platform === "win32" &&
  ["powershell", "git", "npx", "psql", "tar"].every(hasCommand);

const windowsDescribe = shouldRunPowerShellLaunchers ? describe : describe.skip;

windowsDescribe("training-data PowerShell launchers", () => {
  it(
    "supports the top-level start-training-data launcher from repo root",
    () => {
      const root = repoRoot();
      const result = runPowerShellScript(
        root,
        path.join(root, "scripts", "start-training-data.ps1")
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Resolved repo root: C:\\tichu\\tichuml");
      expect(result.stdout).toContain("Decision timeout ms: 2000");
    },
    30000
  );

  it(
    "supports the canonical Windows launcher from scripts/windows",
    () => {
      const root = repoRoot();
      const result = runPowerShellScript(
        path.join(root, "scripts", "windows"),
        ".\\start-training-data.ps1"
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Resolved repo root: C:\\tichu\\tichuml");
      expect(result.stdout).toContain(
        "ML export validation command: npm run ml:export"
      );
      expect(result.stderr).not.toContain(
        "scripts\\windows\\scripts\\training-data.ts"
      );
      expect(result.stderr).not.toContain("Get-Content : Cannot find path");
    },
    30000
  );
});
