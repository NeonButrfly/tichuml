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
  startedAt: string;
  finishedAt: string;
};

type ResolvedSpawnCommand = {
  command: string;
  args: string[];
  shell: boolean;
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

function nowIso(): string {
  return new Date().toISOString();
}

function quoteForWindowsCmd(value: string): string {
  if (value.length === 0) {
    return "\"\"";
  }
  if (!/[\s"&()[\]{}^=;!'+,`~|<>]/u.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
}

function resolveSpawnCommand(
  command: string,
  args: string[],
  shell: boolean
): ResolvedSpawnCommand {
  if (
    process.platform === "win32" &&
    !shell &&
    /\.(cmd|bat)$/iu.test(command)
  ) {
    const comspec = process.env.ComSpec || "cmd.exe";
    return {
      command: comspec,
      args: [
        "/d",
        "/s",
        "/c",
        [command, ...args].map((part) => quoteForWindowsCmd(part)).join(" ")
      ],
      shell: false
    };
  }

  return {
    command,
    args,
    shell
  };
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
  const startedAt = nowIso();
  const commandLine = [options.command, ...options.args].join(" ");

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
    let finishedAt = startedAt;

    logStream.write(`[${startedAt}] COMMAND ${commandLine}\n`);
    tailLines.push(`COMMAND ${commandLine}`);
    trimTail(tailLines, tailLineLimit);

    const finalize = (exitCode: number, signal: NodeJS.Signals | null) => {
      if (settled) {
        return;
      }
      settled = true;
      finishedAt = nowIso();
      flushTailRemainders(tailLines, remainders, tailLineLimit);
      logStream.write(`[${finishedAt}] PROCESS_EXIT exitCode=${exitCode} signal=${signal ?? "null"}\n`);
      logStream.end(() => {
        resolve({
          exitCode,
          signal,
          errorMessage,
          enobufsDetected,
          outputTail: [...tailLines],
          startedAt,
          finishedAt
        });
      });
    };

    const resolvedCommand = resolveSpawnCommand(
      options.command,
      options.args,
      options.shell ?? false
    );
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(resolvedCommand.command, resolvedCommand.args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        shell: resolvedCommand.shell,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errorMessage = message;
      enobufsDetected =
        message.includes("ENOBUFS") ||
        ((error as NodeJS.ErrnoException | undefined)?.code === "ENOBUFS");
      const errorLine = `[${nowIso()}] PROCESS_ERROR ${message}`;
      logStream.write(`${errorLine}\n`);
      tailLines.push(errorLine);
      trimTail(tailLines, tailLineLimit);
      finalize(1, null);
      return;
    }

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
      const errorLine = `[${nowIso()}] PROCESS_ERROR ${error.message}`;
      logStream.write(`${errorLine}\n`);
      tailLines.push(errorLine);
      trimTail(tailLines, tailLineLimit);
      finalize(1, null);
    });

    child.on("close", (exitCode, signal) => {
      finalize(exitCode ?? 1, signal);
    });
  });
}
