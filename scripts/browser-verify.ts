import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

type PassMapValue = {
  dir: string;
  orientation: string;
  rot: number;
};

type PassAnchor = {
  id: string;
  arrow_direction: string;
  slot_orientation: string;
  slot_rotation_deg: number;
  bbox_px: { x: number; y: number; w: number; h: number };
};

type Tv7Snapshot = {
  assetRoot: string;
  phase: string;
  renderer: string;
  design: {
    width: number;
    height: number;
    scale: number;
    offsetX: number;
    offsetY: number;
  };
  table: {
    src: string;
    mode: string;
    designW: number;
    designH: number;
    rendered: {
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
    };
  };
  cardLayout: {
    src: string;
    layoutSource: string;
    anchors: Array<{
      id: string;
      zone: string;
      seat: string;
      renderMode: string;
    }>;
  };
  passing: {
    overlaySrc: string;
    anchors: Array<{
      id: string;
      arrow_direction: string;
      orientation: string;
      rotation: number;
      bbox_px: { x: number; y: number; w: number; h: number };
      screen_bbox: { x: number; y: number; width: number; height: number };
    }>;
  };
  cards: {
    usingImageAssets: boolean;
    placeholders: boolean;
    layoutSource: string;
    bySeat: Record<string, number>;
    sampleSrcs: string[];
    north: { renderMode: string; hiddenBottomPx: number; mostlyVisible: boolean };
    east: {
      renderMode: string;
      usesPolygonWarping: boolean;
      usesNormalImageSprites: boolean;
    };
    west: {
      renderMode: string;
      usesPolygonWarping: boolean;
      usesNormalImageSprites: boolean;
    };
    south: { renderMode: string };
  };
  deal: {
    phase: string;
    counts: Record<string, number>;
    history: string[];
  };
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

const expectedPassMap: Record<string, PassMapValue> = {
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
};

function printHelp() {
  console.log(`browser-verify.ts

Usage:
  npm run verify:browser:alt
  tsx scripts/browser-verify.ts [options]

Options:
  --url <url>                 Page to verify. Defaults to the tv7 ALT table route.
  --output <path>             Screenshot output path. Defaults to a temp PNG.
  --metadata <path>           Metadata JSON path. Defaults next to the screenshot.
  --snapshot <path>           Runtime snapshot JSON path. Defaults next to the screenshot.
  --wait-selector <selector>  DOM selector that must exist before verification.
                              Default: [data-alt-table-root='tv7']
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
    waitSelector: "[data-alt-table-root='tv7']",
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

async function canReachHttpOk(url: string, timeoutMs: number) {
  try {
    await waitForHttpOk(url, timeoutMs);
    return true;
  } catch {
    return false;
  }
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
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
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
  devServer:
    | {
        child: ChildProcessWithoutNullStreams;
        getLogs(): { stdout: string; stderr: string };
      }
    | undefined
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

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
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

async function readSnapshot(page: import("playwright").Page): Promise<Tv7Snapshot> {
  const snapshot = await page.evaluate(() => {
    const snapshotFactory = (window as Window & {
      __tichuAltTableSnapshot?: () => unknown;
      __tichuV7Snapshot?: () => unknown;
    }).__tichuAltTableSnapshot;
    if (typeof snapshotFactory === "function") {
      return snapshotFactory();
    }

    const fallbackFactory = (window as Window & {
      __tichuV7Snapshot?: () => unknown;
    }).__tichuV7Snapshot;
    return typeof fallbackFactory === "function" ? fallbackFactory() : null;
  });

  if (!snapshot) {
    throw new Error(
      "Neither window.__tichuAltTableSnapshot nor window.__tichuV7Snapshot was available."
    );
  }

  return snapshot as Tv7Snapshot;
}

function readFixtureJson<T>(repoRoot: string, relativePath: string): T {
  return JSON.parse(
    readFileSync(path.join(repoRoot, relativePath), "utf8")
  ) as T;
}

function compareRectWithinOnePixel(
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number },
  label: string
) {
  assertCondition(
    Math.abs(actual.x - expected.x) <= 1 &&
      Math.abs(actual.y - expected.y) <= 1 &&
      Math.abs(actual.width - expected.width) <= 1 &&
      Math.abs(actual.height - expected.height) <= 1,
    `${label} drifted away from its authored anchor.`
  );
}

async function verifyAtDesignViewport(
  page: import("playwright").Page,
  timeoutMs: number,
  passAnchors: PassAnchor[]
) {
  await expectPhase(page, "passing", timeoutMs);

  const tableImage = page.locator("img[data-table-layer='plate']");
  await tableImage.waitFor({ state: "visible", timeout: timeoutMs });
  const naturalSize = await tableImage.evaluate((image) => ({
    src: image.getAttribute("src"),
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight
  }));
  assertCondition(
    naturalSize.src?.endsWith("/tv_ed/t/plate.png"),
    `Expected table plate /tv_ed/t/plate.png, got ${naturalSize.src ?? "null"}.`
  );
  assertCondition(
    naturalSize.naturalWidth === 1536 && naturalSize.naturalHeight === 1024,
    `Expected table image 1536x1024, got ${naturalSize.naturalWidth}x${naturalSize.naturalHeight}.`
  );

  const overlay = page.locator("img[data-table-layer='passing-overlay']");
  await overlay.waitFor({ state: "visible", timeout: timeoutMs });

  for (const seat of ["north", "east", "south", "west"] as const) {
    const count = await page.locator(`[data-zone='${seat}_hand']`).count();
    assertCondition(count === 14, `Expected ${seat} to show 14 cards in passing, got ${count}.`);
  }

  const hiddenHands = page.locator("[data-render-mode='r3f-hidden-hand']");
  assertCondition((await hiddenHands.count()) === 42, "Expected 42 opponent rack cards in passing.");

  const sideHands = page.locator(
    "[data-zone='east_hand'][data-card-render-mode], [data-zone='west_hand'][data-card-render-mode]"
  );
  const sideHandModes = await sideHands.evaluateAll((nodes) =>
    nodes.map((node) => ({
      renderMode: node.getAttribute("data-card-render-mode"),
      usesPolygonWarping: node.getAttribute("data-uses-polygon-warping")
    }))
  );
  assertCondition(
    sideHandModes.every(
      (card) =>
        card.renderMode === "side_rack_readable_fan" &&
        card.usesPolygonWarping === "false"
    ),
    "East and west rack cards must stay readable sprites without polygon warping."
  );

  const passTargets = page.locator("[data-pass-id][data-arrow-direction]");
  assertCondition((await passTargets.count()) === 12, "Expected exactly 12 passing targets.");

  for (const [id, expected] of Object.entries(expectedPassMap)) {
    const target = page.locator(`[data-pass-id='${id}'][data-arrow-direction]`);
    await target.waitFor({ state: "visible", timeout: timeoutMs });
    const attrs = await target.evaluate((node) => ({
      direction: node.getAttribute("data-arrow-direction"),
      orientation: node.getAttribute("data-orientation"),
      rotation: node.getAttribute("data-rotation")
    }));
    assertCondition(attrs.direction === expected.dir, `${id} direction mismatch.`);
    assertCondition(attrs.orientation === expected.orientation, `${id} orientation mismatch.`);
    assertCondition(Number(attrs.rotation) === expected.rot, `${id} rotation mismatch.`);
  }

  const eastAcrossTarget = await page
    .locator("[data-pass-id='east_pass_across'][data-arrow-direction]")
    .boundingBox();
  const eastNorthTarget = await page
    .locator("[data-pass-id='east_pass_north'][data-arrow-direction]")
    .boundingBox();
  const westAcrossTarget = await page
    .locator("[data-pass-id='west_pass_across'][data-arrow-direction]")
    .boundingBox();
  const westSouthTarget = await page
    .locator("[data-pass-id='west_pass_south'][data-arrow-direction]")
    .boundingBox();
  assertCondition(
    Boolean(
      eastAcrossTarget &&
        eastNorthTarget &&
        westAcrossTarget &&
        westSouthTarget &&
        eastAcrossTarget.width > eastAcrossTarget.height &&
        westAcrossTarget.width > westAcrossTarget.height &&
        eastNorthTarget.height > eastNorthTarget.width &&
        westSouthTarget.height > westSouthTarget.width
    ),
    "Side-seat pass orientation sanity check failed."
  );

  const southCards = page.locator("[data-zone='south_hand'][data-card-id]");
  for (let index = 0; index < 3; index += 1) {
    await southCards.nth(index).click();
  }

  const confirmButton = page.locator("button[data-alt-action='confirm-pass']");
  assertCondition(
    await confirmButton.isDisabled(),
    "Confirm pass should stay disabled until the three south lanes are assigned."
  );

  for (const passId of [
    "south_pass_left",
    "south_pass_across",
    "south_pass_right"
  ] as const) {
  await page.locator(`[data-pass-id='${passId}'][data-arrow-direction]`).click();
  }

  const southAssignedCount = await page.locator(
    "[data-pass-id^='south_pass_'] [data-pass-card-img='true']"
  ).count();
  assertCondition(southAssignedCount === 3, "Expected 3 south pass cards to be assigned.");
  assertCondition(
    !(await confirmButton.isDisabled()),
    "Confirm pass should enable once the three south lanes are assigned."
  );

  const cardSources = await page
    .locator("[data-pass-card-img='true']")
    .evaluateAll((images) => images.map((image) => image.getAttribute("src") ?? ""));
  assertCondition(
    cardSources.length === 3,
    "Exactly the three south pass cards should be assigned before confirm."
  );
  assertCondition(
    cardSources.every((src) => src.startsWith("/tv7/c/")),
    "Every rendered card image must come from /tv7/c/."
  );

  const snapshot = await readSnapshot(page);
  assertCondition(snapshot.assetRoot === "/tv7", "Snapshot assetRoot mismatch.");
  assertCondition(snapshot.renderer === "react-three-fiber", "Snapshot renderer mismatch.");
  assertCondition(snapshot.table.src === "/tv_ed/t/plate.png", "Snapshot table path mismatch.");
  assertCondition(
    snapshot.table.mode === "single_image_plane",
    "Snapshot table mode mismatch."
  );
  assertCondition(snapshot.cardLayout.src === "v18CardRackMath", "Snapshot card anchor path mismatch.");
  assertCondition(snapshot.passing.overlaySrc === "/tv7/p/o.png", "Snapshot overlay path mismatch.");
  assertCondition(snapshot.phase === "passing", "Snapshot phase mismatch.");
  assertCondition(snapshot.cards.usingImageAssets === true, "Snapshot cards must use image assets.");
  assertCondition(snapshot.cards.placeholders === false, "Snapshot placeholders must be false.");
  assertCondition(snapshot.cards.layoutSource === "v18_math", "Snapshot card layout source mismatch.");
  assertCondition(snapshot.cardLayout.layoutSource === "v18_math", "Snapshot card anchors should be math-based.");
  assertCondition(snapshot.deal.counts.north === 14, "North count should be 14 in passing.");
  assertCondition(snapshot.deal.counts.east === 14, "East count should be 14 in passing.");
  assertCondition(snapshot.deal.counts.south === 14, "South count should be 14 in passing.");
  assertCondition(snapshot.deal.counts.west === 14, "West count should be 14 in passing.");
  assertCondition(snapshot.deal.counts.deckRemaining === 0, "Deck should be empty in passing.");
  assertCondition(snapshot.passing.anchors.length === 12, "Snapshot must expose 12 passing anchors.");
  assertCondition(
    snapshot.cards.north.renderMode === "north_rack_back_mostly_visible" &&
      snapshot.cards.north.hiddenBottomPx <= 16 &&
      snapshot.cards.north.mostlyVisible === true,
    "North rack snapshot contract drifted."
  );
  assertCondition(
    snapshot.cards.east.renderMode === "side_rack_readable_fan" &&
      snapshot.cards.east.usesPolygonWarping === false &&
      snapshot.cards.east.usesNormalImageSprites === true,
    "East rack snapshot contract drifted."
  );
  assertCondition(
    snapshot.cards.west.renderMode === "side_rack_readable_fan" &&
      snapshot.cards.west.usesPolygonWarping === false &&
      snapshot.cards.west.usesNormalImageSprites === true,
    "West rack snapshot contract drifted."
  );
  assertCondition(
    snapshot.cards.south.renderMode === "south_player_fan",
    "South rack snapshot contract drifted."
  );

  for (const anchor of snapshot.passing.anchors) {
    const expected = expectedPassMap[anchor.id];
    assertCondition(Boolean(expected), `Unexpected pass anchor ${anchor.id}.`);
    assertCondition(anchor.arrow_direction === expected.dir, `${anchor.id} snapshot direction mismatch.`);
    assertCondition(anchor.orientation === expected.orientation, `${anchor.id} snapshot orientation mismatch.`);
    assertCondition(anchor.rotation === expected.rot, `${anchor.id} snapshot rotation mismatch.`);
  }

  const passAnchorById = new Map(passAnchors.map((anchor) => [anchor.id, anchor]));
  for (const passAnchor of passAnchors) {
    const targetRect = await page
      .locator(`[data-pass-id='${passAnchor.id}'][data-arrow-direction]`)
      .boundingBox();
    assertCondition(Boolean(targetRect), `Missing bounding box for pass target ${passAnchor.id}.`);
    compareRectWithinOnePixel(
      {
        x: targetRect?.x ?? 0,
        y: targetRect?.y ?? 0,
        width: targetRect?.width ?? 0,
        height: targetRect?.height ?? 0
      },
      {
        x: passAnchor.bbox_px.x,
        y: passAnchor.bbox_px.y,
        width: passAnchor.bbox_px.w,
        height: passAnchor.bbox_px.h
      },
      `Pass target ${passAnchor.id}`
    );

    const snapshotPassAnchor = snapshot.passing.anchors.find(
      (anchor) => anchor.id === passAnchor.id
    );
    assertCondition(Boolean(snapshotPassAnchor), `Snapshot missing ${passAnchor.id}.`);
    const expected = passAnchorById.get(passAnchor.id);
    assertCondition(Boolean(expected), `Pass fixture missing ${passAnchor.id}.`);
    compareRectWithinOnePixel(
      snapshotPassAnchor!.screen_bbox,
      {
        x: passAnchor.bbox_px.x,
        y: passAnchor.bbox_px.y,
        width: passAnchor.bbox_px.w,
        height: passAnchor.bbox_px.h
      },
      `Snapshot pass anchor ${passAnchor.id}`
    );
  }

  return snapshot;
}

async function verifyAtResponsiveViewport(
  page: import("playwright").Page,
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
  compareRectWithinOnePixel(
    {
      x: tableRect?.x ?? 0,
      y: tableRect?.y ?? 0,
      width: tableRect?.width ?? 0,
      height: tableRect?.height ?? 0
    },
    snapshot.table.rendered,
    "Responsive table"
  );

  const overlayRect = await page
    .locator("img[data-table-layer='passing-overlay']")
    .boundingBox();
  assertCondition(Boolean(overlayRect), "Passing overlay did not produce a bounding box.");
  compareRectWithinOnePixel(
    {
      x: overlayRect?.x ?? 0,
      y: overlayRect?.y ?? 0,
      width: overlayRect?.width ?? 0,
      height: overlayRect?.height ?? 0
    },
    snapshot.table.rendered,
    "Responsive overlay"
  );

  const responsivePass = snapshot.passing.anchors.find(
    (anchor) => anchor.id === "east_pass_across"
  );
  const responsivePassRect = await page
    .locator("[data-pass-id='east_pass_across'][data-arrow-direction]")
    .boundingBox();
  assertCondition(Boolean(responsivePass && responsivePassRect), "Missing responsive pass target.");
  compareRectWithinOnePixel(
    {
      x: responsivePassRect?.x ?? 0,
      y: responsivePassRect?.y ?? 0,
      width: responsivePassRect?.width ?? 0,
      height: responsivePassRect?.height ?? 0
    },
    responsivePass!.screen_bbox,
    "Responsive east_pass_across"
  );

  const southCards = page.locator("[data-zone='south_hand'][data-card-id]");
  assertCondition((await southCards.count()) >= 8, "Expected visible south hand hitboxes.");
}

async function captureAltTable(options: Options) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputPath = options.output ?? defaultOutputPath("alt-table-verify");
  const metadataPath = options.metadata ?? defaultMetadataPath(outputPath);
  const snapshotPath = options.snapshot ?? defaultSnapshotPath(outputPath);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  mkdirSync(path.dirname(metadataPath), { recursive: true });
  mkdirSync(path.dirname(snapshotPath), { recursive: true });

  const passFixture = readFixtureJson<{ anchors: PassAnchor[] }>(
    repoRoot,
    "apps/web/public/tv7/p/a.json"
  );

  let devServer:
    | {
        child: ChildProcessWithoutNullStreams;
        getLogs(): { stdout: string; stderr: string };
      }
    | undefined;

  const targetUrl = options.url ?? `http://127.0.0.1:${options.devPort}/?table=alt`;
  const targetOrigin = new URL(targetUrl).origin;

  try {
    if (options.startDevWeb) {
      const alreadyRunning = await canReachHttpOk(targetOrigin, 2_500);
      if (!alreadyRunning) {
        devServer = startDevServer(repoRoot, options.devPort);
        await waitForHttpOk(targetOrigin, options.waitTimeoutMs);
      }
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

      const designSnapshot = await verifyAtDesignViewport(
        page,
        options.waitTimeoutMs,
        passFixture.anchors
      );
      await verifyAtResponsiveViewport(page);

      await page.screenshot({
        path: outputPath,
        fullPage: true
      });

      writeFileSync(snapshotPath, JSON.stringify(designSnapshot, null, 2));

      const guard = spawnSync(
        "node",
        ["apps/web/public/tv7/x/check.mjs", "apps/web/public/tv7", "--snap", snapshotPath],
        {
          cwd: repoRoot,
          encoding: "utf8",
          shell: process.platform === "win32"
        }
      );

      if (guard.status !== 0) {
        throw new Error(
          `tv7 guard failed for browser snapshot.\n${guard.stdout}\n${guard.stderr}`.trim()
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
        phase: designSnapshot.phase,
        deal: designSnapshot.deal
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
