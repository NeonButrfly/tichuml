import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

function resolvePythonExecutable(cwd: string): string {
  const configured = process.env.PYTHON_EXECUTABLE?.trim();
  if (configured && isUsableExecutable(configured)) {
    return configured;
  }

  const windowsVenv = path.join(cwd, ".venv", "Scripts", "python.exe");
  if (existsSync(windowsVenv) && isUsableExecutable(windowsVenv)) {
    return windowsVenv;
  }

  const unixVenv = path.join(cwd, ".venv", "bin", "python");
  if (existsSync(unixVenv) && isUsableExecutable(unixVenv)) {
    return unixVenv;
  }

  if (isUsableExecutable("python")) {
    return "python";
  }

  if (isUsableExecutable("python3")) {
    return "python3";
  }

  return "python";
}

function isUsableExecutable(candidate: string): boolean {
  const result = spawnSync(candidate, ["--version"], {
    stdio: "ignore",
    timeout: 2_000,
    shell: false
  });
  return result.error === undefined && result.status === 0;
}

const [, , ...args] = process.argv;

if (args.length === 0) {
  console.error("Usage: tsx scripts/run-python.ts <script> [args...]");
  process.exit(1);
}

const cwd = process.cwd();
const executable = resolvePythonExecutable(cwd);
const result = spawnSync(executable, args, {
  cwd,
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
