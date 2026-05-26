import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams
} from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

type AltSnapshot = {
  phase: string;
  design: {
    scale: number;
    offsetX: number;
    offsetY: number;
    w?: number;
    h?: number;
    width?: number;
    height?: number;
  };
  table: {
    src: string;
    naturalW: number;
    naturalH: number;
    uses3d: boolean;
    usesCanvas: boolean;
    usesCssTable: boolean;
  };
  tablePlate: string;
  passingOverlay: string;
  anchorJson: string;
  passOverlay: {
    src: string;
    visible: boolean;
  };
  passAnchors: Array<{
    id: string;
    arrow_direction: string;
    slot_orientation: string;
    slot_rotation_deg: number;
    bbox_px: { x: number; y: number; w: number; h: number };
    screen_bbox: { x: number; y: number; width: number; height: number };
  }>;
  cards: {
    usesImages: boolean;
    usesPlaceholders: boolean;
    sampleSrcs: string[];
  };
  flow: {
    firstDeal: number;
    secondDeal: number;
    passCount: number;
  };
  handCounts: Record<string, number>;
};

type Options = {
  url?: string;
  output?: string;
  metadata?: string;
  snapshot?: string;
  waitSelector: string;
  waitTimeoutMs: number;
  settleMs: number;
  startDevWeb: boolean;
  devPort: number;
  browserPath?: string;
  width: number;
  height: number;
};

const expectedPassMap = {
  north_pass_left: { dir: "left", orientation: "landscape", rot: 0 },
  north_pass_across: { dir: "south", orientation: "portrait", rot: 0 },
  north_pass_right: { dir: "right", orientation: "landscape", rot: 0 },
  south_pass_left: { dir: "left", orientation: "landscape", rot: 0 },
  south_pass_across: { dir: "north", orientation: "portrait", rot: 0 },
  south_pass_right: { dir: "right", orientation: "landscape", rot: 0 },
  east_pass_north: { dir: "north", orientation: "portrait", rot: -90 },
  east_pass_across: { dir: "west", orientation: "landscape", rot: 90 },
  east_pass_south: { dir: "south", orientation: "portrait", rot: 90 },
  west_pass_north: { dir: "north", orientation: "portrait", rot: -90 },
  west_pass_across: { dir: "east", orientation: "landscape", rot: 90 },
  west_pass_south: { dir: "south", orientation: "portrait", rot: 90 }
} as const;

function printHelp() {
  console.log(`browser-verify.ts

Usage:
  npm run verify:browser:alt
  tsx scripts/browser-verify.ts [options]

Options:
  --url <url>                 Page to verify. Defaults to the tv6 ALT table route.
  --output <path>             Screenshot output path. Defaults to a temp PNG.
  --metadata <path>           Metadata JSON path. Defaults next to the screenshot.
  --snapshot <path>           Runtime snapshot JSON path. Defaults next to the screenshot.
  --wait-selector <selector>  DOM selector that must exist before verification.
                              Default: [data-alt-table-root='tv6']
  --wait-timeout-ms <ms>      Max wait for the table route. Default: 45000
  --settle-ms <ms>            Extra wait after initial load. Default: 300
  --start-dev-web             Start a local Vite dev server automatically.
  --dev-port <port>           Port used when --start-dev-web is set. Default: 4275
  --browser-path <path>       Explicit browser executable path.
  --width <px>                Initial viewport width. Default: 1536
  --height <px>               Initial viewport height. Default: 1024
  --help                      Show this message.
`);
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    waitSelector: "[data-alt-table-root='tv6']",
    waitTimeoutMs: 45_000,
    settleMs: 300,
    startDevWeb: false,
    devPort: 4275,
    width: 1536,
    height: 1024
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
      case "--snapshot":
        options.snapshot = next;
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
      case "--width":
        options.width = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--height":
        options.height = Number.parseInt(next, 10);
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

function defaultSnapshotPath(outputPath: string) {
  const extension = path.extname(outputPath);
  const base = outputPath.slice(0, outputPath.length - extension.length);
  return `${base}.snapshot.json`;
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
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? [
          "/d",
          "/s",
          "/c",
          `npm run dev -w @tichuml/web -- --host 127.0.0.1 --port ${port}`
        ]
      : [
          "run",
          "dev",
          "-w",
          "@tichuml/web",
          "--",
          "--host",
          "127.0.0.1",
          "--port",
          String(port)
        ];

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

function stopDevServer(
  devServer: {
    child: ChildProcessWithoutNullStreams;
    getLogs(): { stdout: string; stderr: string };
  } | undefined
) {
  if (!devServer) {
    return;
  }

  const pid = devServer.child.pid;

  if (process.platform === "win32" && typeof pid === "number") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      encoding: "utf8",
      shell: false
    });
    return;
  }

  devServer.child.kill("SIGTERM");
}

async function expectPhase(page: import("playwright").Page, phase: string, timeoutMs: number) {
  await page.waitForFunction(
    (expectedPhase) =>
      document.querySelector("[data-alt-phase-label='true']")?.textContent?.trim() ===
      expectedPhase,
    phase,
    { timeout: timeoutMs }
  );
}

async function readSnapshot(page: import("playwright").Page): Promise<AltSnapshot> {
  const snapshot = await page.evaluate(() => {
    const value = (window as Window & {
      __TICHU_ALT_SNAPSHOT__?: AltSnapshot;
    }).__TICHU_ALT_SNAPSHOT__;
    return value ?? null;
  });

  if (!snapshot) {
    throw new Error("window.__TICHU_ALT_SNAPSHOT__ was not available.");
  }

  return snapshot;
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function verifyAtDesignViewport(
  page: import("playwright").Page,
  timeoutMs: number
) {
  await expectPhase(page, "deal8", timeoutMs);
  const tableImage = page.locator("img[data-table-layer='plate']");
  await tableImage.waitFor({ state: "visible", timeout: timeoutMs });

  const naturalSize = await tableImage.evaluate((image) => ({
    src: image.getAttribute("src"),
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight
  }));
  assertCondition(
    naturalSize.src?.endsWith("/tv6/t/plate.png"),
    `Expected table plate /tv6/t/plate.png, got ${naturalSize.src ?? "null"}.`
  );
  assertCondition(
    naturalSize.naturalWidth === 1536 && naturalSize.naturalHeight === 1024,
    `Expected table image 1536x1024, got ${naturalSize.naturalWidth}x${naturalSize.naturalHeight}.`
  );

  for (const seat of ["north", "east", "south", "west"] as const) {
    const cardCount = await page.locator(`[data-seat-hand='${seat}'] img`).count();
    assertCondition(cardCount === 8, `Expected ${seat} to show 8 cards in deal8, got ${cardCount}.`);
  }

  await expectPhase(page, "gt", timeoutMs);
  await page.locator("button[data-alt-action='skip-gt']").click();
  await expectPhase(page, "deal6", timeoutMs);
  await expectPhase(page, "passing", timeoutMs);

  const overlay = page.locator("img[data-table-layer='passing-overlay']");
  await overlay.waitFor({ state: "visible", timeout: timeoutMs });

  const passTargets = page.locator("[data-pass-id]");
  assertCondition((await passTargets.count()) === 12, "Expected exactly 12 passing targets.");

  for (const [anchorId, expected] of Object.entries(expectedPassMap)) {
    const target = page.locator(`[data-pass-id='${anchorId}']`);
    await target.waitFor({ state: "visible", timeout: timeoutMs });
    const attrs = await target.evaluate((node) => ({
      direction: node.getAttribute("data-arrow-direction"),
      orientation: node.getAttribute("data-orientation"),
      rotation: node.getAttribute("data-rotation")
    }));
    assertCondition(
      attrs.direction === expected.dir,
      `${anchorId} direction mismatch: ${attrs.direction} != ${expected.dir}`
    );
    assertCondition(
      attrs.orientation === expected.orientation,
      `${anchorId} orientation mismatch: ${attrs.orientation} != ${expected.orientation}`
    );
    assertCondition(
      Number(attrs.rotation) === expected.rot,
      `${anchorId} rotation mismatch: ${attrs.rotation} != ${expected.rot}`
    );
  }

  const southCards = page.locator("[data-seat-hand='south'] button[data-card-id]");
  for (let index = 0; index < 3; index += 1) {
    await southCards.nth(index).click();
  }
  for (const anchorId of [
    "south_pass_left",
    "south_pass_across",
    "south_pass_right"
  ] as const) {
    await page.locator(`[data-pass-id='${anchorId}']`).click();
  }

  const southAssignedCount = await page.locator(
    "[data-pass-id^='south_pass_'] [data-pass-card-img='true']"
  ).count();
  assertCondition(
    southAssignedCount === 3,
    `Expected 3 assigned south pass cards, got ${southAssignedCount}.`
  );

  await page.locator("button[data-alt-action='auto-demo-pass']").click();
  const allAssignedCount = await page.locator(
    "[data-pass-id] [data-pass-card-img='true']"
  ).count();
  assertCondition(
    allAssignedCount === 12,
    `Expected auto demo pass to fill all 12 lanes, got ${allAssignedCount}.`
  );

  const cardSources = await page
    .locator("[data-pass-id] [data-pass-card-img='true']")
    .evaluateAll((images) =>
      images.map((image) => image.getAttribute("src") ?? "")
    );
  assertCondition(
    cardSources.every((src) => src.startsWith("/tv6/c/")),
    "Expected all pass cards to render from /tv6/c/ image assets."
  );

  const snapshot = await readSnapshot(page);
  assertCondition(snapshot.tablePlate === "/tv6/t/plate.png", "Snapshot tablePlate mismatch.");
  assertCondition(
    snapshot.passingOverlay === "/tv6/p/o.png",
    "Snapshot passingOverlay mismatch."
  );
  assertCondition(snapshot.anchorJson === "/tv6/p/a.json", "Snapshot anchorJson mismatch.");
  assertCondition(snapshot.handCounts.north === 14, "North hand count should be 14 in passing.");
  assertCondition(snapshot.handCounts.east === 14, "East hand count should be 14 in passing.");
  assertCondition(snapshot.handCounts.south === 14, "South hand count should be 14 in passing.");
  assertCondition(snapshot.handCounts.west === 14, "West hand count should be 14 in passing.");

  for (const anchor of snapshot.passAnchors) {
    const expected = expectedPassMap[anchor.id as keyof typeof expectedPassMap];
    assertCondition(Boolean(expected), `Unexpected snapshot anchor ${anchor.id}.`);
    assertCondition(anchor.arrow_direction === expected.dir, `${anchor.id} snapshot direction mismatch.`);
    assertCondition(
      anchor.slot_orientation === expected.orientation,
      `${anchor.id} snapshot orientation mismatch.`
    );
    assertCondition(
      anchor.slot_rotation_deg === expected.rot,
      `${anchor.id} snapshot rotation mismatch.`
    );
    assertCondition(
      Math.abs(anchor.screen_bbox.x - anchor.bbox_px.x) <= 1 &&
        Math.abs(anchor.screen_bbox.y - anchor.bbox_px.y) <= 1 &&
        Math.abs(anchor.screen_bbox.width - anchor.bbox_px.w) <= 1 &&
        Math.abs(anchor.screen_bbox.height - anchor.bbox_px.h) <= 1,
      `${anchor.id} screen bbox diverged from design bbox at 1536x1024.`
    );
  }

  return snapshot;
}

async function verifyAtResponsiveViewport(
  page: import("playwright").Page
) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(250);
  const snapshot = await readSnapshot(page);
  const expectedScale = Math.min(1280 / 1536, 720 / 1024);
  assertCondition(
    Math.abs(snapshot.design.scale - expectedScale) < 0.0001,
    `Responsive scale mismatch: ${snapshot.design.scale} != ${expectedScale}.`
  );

  const tableRect = await page.locator("img[data-table-layer='plate']").boundingBox();
  assertCondition(Boolean(tableRect), "Table plate did not produce a bounding box.");
  assertCondition(
    Math.abs((tableRect?.width ?? 0) - 1536 * snapshot.design.scale) <= 1 &&
      Math.abs((tableRect?.height ?? 0) - 1024 * snapshot.design.scale) <= 1,
    "Responsive table size drifted away from contain-fit transform."
  );

  const overlayRect = await page
    .locator("img[data-table-layer='passing-overlay']")
    .boundingBox();
  assertCondition(Boolean(overlayRect), "Passing overlay did not produce a bounding box.");
  assertCondition(
    Math.abs((overlayRect?.x ?? 0) - snapshot.design.offsetX) <= 1 &&
      Math.abs((overlayRect?.y ?? 0) - snapshot.design.offsetY) <= 1,
    "Responsive overlay drifted away from contain-fit offsets."
  );

  const sampleTargetRect = await page
    .locator("[data-pass-id='east_pass_across']")
    .boundingBox();
  const sampleSnapshot = snapshot.passAnchors.find(
    (anchor) => anchor.id === "east_pass_across"
  );
  assertCondition(Boolean(sampleTargetRect && sampleSnapshot), "Missing east_pass_across responsive data.");
  assertCondition(
    Math.abs((sampleTargetRect?.x ?? 0) - (sampleSnapshot?.screen_bbox.x ?? 0)) <= 1 &&
      Math.abs((sampleTargetRect?.y ?? 0) - (sampleSnapshot?.screen_bbox.y ?? 0)) <= 1 &&
      Math.abs((sampleTargetRect?.width ?? 0) - (sampleSnapshot?.screen_bbox.width ?? 0)) <= 1 &&
      Math.abs((sampleTargetRect?.height ?? 0) - (sampleSnapshot?.screen_bbox.height ?? 0)) <= 1,
    "Responsive pass target drifted away from shared transform."
  );
}

async function captureAltTable(options: Options) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputPath = options.output ?? defaultOutputPath("alt-table-verify");
  const metadataPath = options.metadata ?? defaultMetadataPath(outputPath);
  const snapshotPath = options.snapshot ?? defaultSnapshotPath(outputPath);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  mkdirSync(path.dirname(metadataPath), { recursive: true });
  mkdirSync(path.dirname(snapshotPath), { recursive: true });

  let devServer:
    | {
        child: ChildProcessWithoutNullStreams;
        getLogs(): { stdout: string; stderr: string };
      }
    | undefined;

  const targetUrl = options.url ?? `http://127.0.0.1:${options.devPort}/?table=alt`;

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
      const page = await browser.newPage({
        viewport: { width: options.width, height: options.height }
      });
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: options.waitTimeoutMs
      });
      await page.locator(options.waitSelector).waitFor({
        state: "visible",
        timeout: options.waitTimeoutMs
      });
      await delay(options.settleMs);

      const designViewportSnapshot = await verifyAtDesignViewport(
        page,
        options.waitTimeoutMs
      );
      await verifyAtResponsiveViewport(page);

      await page.screenshot({
        path: outputPath,
        fullPage: true
      });

      writeFileSync(snapshotPath, JSON.stringify(designViewportSnapshot, null, 2));

      const guard = spawnSync(
        "node",
        [
          "tools/tv6/check.mjs",
          "apps/web/public/tv6",
          "--lock",
          "tools/tv6/lock.json",
          "--snap",
          snapshotPath
        ],
        {
          cwd: repoRoot,
          encoding: "utf8",
          shell: process.platform === "win32"
        }
      );

      if (guard.status !== 0) {
        throw new Error(
          `tv6 guard failed for browser snapshot.\n${guard.stdout}\n${guard.stderr}`.trim()
        );
      }

      await page.locator("button[data-alt-action='confirm-pass']").click();
      await expectPhase(page, "passed", options.waitTimeoutMs);

      const metadata = {
        url: targetUrl,
        outputPath,
        metadataPath,
        snapshotPath,
        browserPath,
        waitSelector: options.waitSelector,
        viewport: {
          width: options.width,
          height: options.height
        },
        guardStdout: guard.stdout.trim(),
        phase: designViewportSnapshot.phase,
        handCounts: designViewportSnapshot.handCounts
      };

      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      console.log(`Screenshot: ${outputPath}`);
      console.log(`Metadata: ${metadataPath}`);
      console.log(`Snapshot: ${snapshotPath}`);
      console.log(`Guard: ${guard.stdout.trim()}`);
    } finally {
      await browser.close();
    }
  } finally {
    if (devServer) {
      stopDevServer(devServer);
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
