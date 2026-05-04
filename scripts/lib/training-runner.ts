import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type StreamingProcessOptions = {
  command: string;
  args: string[];
  cwd: string;
  logFile: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  mirrorToParent?: boolean;
  tailLineLimit?: number;
};

export type StreamingProcessResult = {
  exitCode: number;
  signal: NodeJS.Signals | null;
  errorMessage: string | null;
  enobufsDetected: boolean;
  outputTail: string[];
};

export function computeRemainingRequestedGames(input: {
  requestedGames: number;
  scopedMatches: number;
}): number {
  return Math.max(0, input.requestedGames - input.scopedMatches);
}

function ensureParent(filePath: string): void {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function trimTail(lines: string[], limit: number): void {
  while (lines.length > limit) {
    lines.shift();
  }
}

function appendChunkToTail(
  lines: string[],
  remainderByStream: { stdout: string; stderr: string },
  streamKey: "stdout" | "stderr",
  chunk: string,
  limit: number
): void {
  const combined = remainderByStream[streamKey] + chunk;
  const parts = combined.split(/\r?\n/u);
  remainderByStream[streamKey] = parts.pop() ?? "";
  for (const line of parts) {
    if (line.length === 0) {
      continue;
    }
    lines.push(line);
    trimTail(lines, limit);
  }
}

function flushTailRemainders(
  lines: string[],
  remainderByStream: { stdout: string; stderr: string },
  limit: number
): void {
  for (const key of ["stdout", "stderr"] as const) {
    const remainder = remainderByStream[key].trim();
    if (remainder.length > 0) {
      lines.push(remainder);
      trimTail(lines, limit);
      remainderByStream[key] = "";
    }
  }
}

function attachStreamingListener(
  child: ChildProcessWithoutNullStreams,
  streamKey: "stdout" | "stderr",
  target: NodeJS.WriteStream,
  logStream: fs.WriteStream,
  mirrorToParent: boolean,
  tailLines: string[],
  remainderByStream: { stdout: string; stderr: string },
  tailLineLimit: number
): void {
  const source = child[streamKey];
  source.setEncoding("utf8");
  source.on("data", (chunk: string) => {
    logStream.write(chunk);
    appendChunkToTail(
      tailLines,
      remainderByStream,
      streamKey,
      chunk,
      tailLineLimit
    );
    if (mirrorToParent) {
      target.write(chunk);
    }
  });
}

export async function runStreamingProcess(
  options: StreamingProcessOptions
): Promise<StreamingProcessResult> {
  ensureParent(options.logFile);
  const tailLineLimit = Math.max(10, options.tailLineLimit ?? 60);

  return new Promise<StreamingProcessResult>((resolve) => {
    const logStream = fs.createWriteStream(options.logFile, {
      flags: "a",
      encoding: "utf8"
    });
    const tailLines: string[] = [];
    const remainders = { stdout: "", stderr: "" };
    let settled = false;
    let errorMessage: string | null = null;
    let enobufsDetected = false;

    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: options.shell ?? false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    attachStreamingListener(
      child,
      "stdout",
      process.stdout,
      logStream,
      options.mirrorToParent !== false,
      tailLines,
      remainders,
      tailLineLimit
    );
    attachStreamingListener(
      child,
      "stderr",
      process.stderr,
      logStream,
      options.mirrorToParent !== false,
      tailLines,
      remainders,
      tailLineLimit
    );

    child.on("error", (error) => {
      errorMessage = error.message;
      enobufsDetected =
        error.message.includes("ENOBUFS") || (error as NodeJS.ErrnoException).code === "ENOBUFS";
    });

    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      flushTailRemainders(tailLines, remainders, tailLineLimit);
      logStream.end(() => {
        resolve({
          exitCode: exitCode ?? 1,
          signal,
          errorMessage,
          enobufsDetected,
          outputTail: [...tailLines]
        });
      });
    });
  });
}
