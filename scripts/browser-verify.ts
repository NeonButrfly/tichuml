import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

type Options = {
  url?: string;
  output?: string;
  metadata?: string;
  waitSelector: string;
  waitTimeoutMs: number;
  settleMs: number;
  startDevWeb: boolean;
  devPort: number;
  browserPath?: string;
};

function printHelp() {
  console.log(`browser-verify.ts

Usage:
  npm run verify:browser:alt
  tsx scripts/browser-verify.ts [options]

Options:
  --url <url>                 Page to verify. Defaults to a local ALT preview URL.
  --output <path>             Screenshot output path. Defaults to a temp PNG.
  --metadata <path>           Metadata JSON path. Defaults next to the screenshot.
  --wait-selector <selector>  DOM selector that must exist before capture.
                              Default: [data-alt-table-3d-scene='true']
  --wait-timeout-ms <ms>      Max wait for the scene markers. Default: 45000
  --settle-ms <ms>            Extra wait after the markers appear. Default: 1500
  --start-dev-web             Start a local Vite dev server automatically.
  --dev-port <port>           Port used when --start-dev-web is set. Default: 4275
  --browser-path <path>       Explicit browser executable path.
  --help                      Show this message.
`);
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    waitSelector: "[data-alt-table-3d-scene='true']",
    waitTimeoutMs: 45_000,
    settleMs: 1_500,
    startDevWeb: false,
    devPort: 4275
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    switch (token) {
      case "--url":
        options.url = next;
        index += 1;
        break;
      case "--output":
        options.output = next;
        index += 1;
        break;
      case "--metadata":
        options.metadata = next;
        index += 1;
        break;
      case "--wait-selector":
        options.waitSelector = next;
        index += 1;
        break;
      case "--wait-timeout-ms":
        options.waitTimeoutMs = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--settle-ms":
        options.settleMs = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--start-dev-web":
        options.startDevWeb = true;
        break;
      case "--no-start-dev-web":
        options.startDevWeb = false;
        break;
      case "--dev-port":
        options.devPort = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--browser-path":
        options.browserPath = next;
        index += 1;
        break;
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  return options;
}

function defaultOutputPath(name: string) {
  const dir = path.join(tmpdir(), "tichuml-browser-verify");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(dir, `${name}-${stamp}.png`);
}

function defaultMetadataPath(outputPath: string) {
  const extension = path.extname(outputPath);
  const base = outputPath.slice(0, outputPath.length - extension.length);
  return `${base}.json`;
}

async function waitForHttpOk(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }

  throw new Error(
    `Timed out waiting for ${url} to respond successfully.${
      lastError instanceof Error ? ` Last error: ${lastError.message}` : ""
    }`
  );
}

function resolveBrowserPath(explicitPath?: string) {
  if (explicitPath) {
    if (!existsSync(explicitPath)) {
      throw new Error(`Browser executable was not found at ${explicitPath}`);
    }
    return explicitPath;
  }

  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
    ];
    const match = candidates.find((candidate) => existsSync(candidate));
    if (match) {
      return match;
    }
  }

  const whichCommand = process.platform === "win32" ? "where" : "which";
  const candidates =
    process.platform === "win32"
      ? ["chrome", "msedge"]
      : ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"];

  for (const candidate of candidates) {
    const result = spawnSync(whichCommand, [candidate], {
      encoding: "utf8",
      shell: process.platform === "win32"
    });
    if (result.status === 0) {
      const firstLine = result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (firstLine) {
        return firstLine;
      }
    }
  }

  throw new Error(
    "No supported browser executable was found. Pass --browser-path to choose one explicitly."
  );
}

function startDevServer(repoRoot: string, port: number) {
  const command =
    process.platform === "win32"
      ? "cmd.exe"
      : "npm";
  const args =
    process.platform === "win32"
      ? [
          "/d",
          "/s",
          "/c",
          `npm run dev -w @tichuml/web -- --host 127.0.0.1 --port ${port}`
        ]
      : ["run", "dev", "-w", "@tichuml/web", "--", "--host", "127.0.0.1", "--port", String(port)];

  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  return {
    child,
    getLogs() {
      return { stdout, stderr };
    }
  };
}

async function captureAltTable(options: Options) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputPath = options.output ?? defaultOutputPath("alt-table-verify");
  const metadataPath = options.metadata ?? defaultMetadataPath(outputPath);
  mkdirSync(path.dirname(outputPath), { recursive: true });

  let devServer:
    | {
        child: ChildProcessWithoutNullStreams;
        getLogs(): { stdout: string; stderr: string };
      }
    | undefined;

  const targetUrl =
    options.url ??
    `http://127.0.0.1:${options.devPort}/?table=alt&preview=pass-select`;

  try {
    if (options.startDevWeb) {
      devServer = startDevServer(repoRoot, options.devPort);
      await waitForHttpOk(`http://127.0.0.1:${options.devPort}/`, options.waitTimeoutMs);
    }

    const browserPath = resolveBrowserPath(options.browserPath);
    const browser = await chromium.launch({
      headless: true,
      executablePath: browserPath
    });

    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: options.waitTimeoutMs
      });

      await page.waitForFunction(
        (selector) => {
          const scene = document.querySelector(selector);
          if (!scene) {
            return false;
          }

          const seatTrays = document.querySelectorAll("[data-scene-node='seat-tray']").length;
          const southCards = document.querySelectorAll("[data-scene-card='south-mesh']").length;
          const loadingText = document.body.textContent?.includes("Starting New Game") ?? false;
          return seatTrays === 4 && southCards > 0 && !loadingText;
        },
        options.waitSelector,
        { timeout: options.waitTimeoutMs }
      );

      await delay(options.settleMs);

      const summary = await page.evaluate(() => ({
        seatTrays: document.querySelectorAll("[data-scene-node='seat-tray']").length,
        passLanes: document.querySelectorAll("[data-scene-node='pass-lane']").length,
        southCards: document.querySelectorAll("[data-scene-card='south-mesh']").length,
        opponentCards: document.querySelectorAll("[data-scene-card='opponent-mesh']").length,
        loadingTextVisible: document.body.textContent?.includes("Starting New Game") ?? false,
        title: document.title
      }));

      await page.screenshot({
        path: outputPath,
        fullPage: true
      });

      writeFileSync(
        metadataPath,
        JSON.stringify(
          {
            url: targetUrl,
            outputPath,
            browserPath,
            waitSelector: options.waitSelector,
            waitTimeoutMs: options.waitTimeoutMs,
            settleMs: options.settleMs,
            summary
          },
          null,
          2
        )
      );

      console.log(`Screenshot: ${outputPath}`);
      console.log(`Metadata: ${metadataPath}`);
      console.log(`Summary: ${JSON.stringify(summary)}`);
    } finally {
      await browser.close();
    }
  } finally {
    if (devServer) {
      devServer.child.kill();
      const logs = devServer.getLogs();
      if (logs.stderr.trim()) {
        console.error(logs.stderr.trim());
      }
    }
  }
}

const options = parseArgs(process.argv.slice(2));
void captureAltTable(options).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
