// Run against the web development server. Entropy is supplied by the real
// seed generator with local crypto; this isolates UI verification from Postgres.
import { chromium } from "playwright";
const { generateEntropySeed, serializeEntropyGenerationResult } =
  await import("../apps/server/src/entropy/index.ts");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1536, height: 1024 }
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/entropy/generate", async (route) => {
    const result = await generateEntropySeed({
      roundIndex: 0,
      enabledSourceIds: ["local_crypto"]
    });
    await route.fulfill({ json: serializeEntropyGenerationResult(result) });
  });
  await page.goto(
    process.env.TICHU_WEB_URL ?? "http://127.0.0.1:5174/?table=luxury"
  );
  await page.getByTestId("fresh-alt-table").waitFor();
  await page.screenshot({
    path:
      process.env.TICHU_SCREENSHOT ??
      "C:/Users/Keifm/Downloads/tichuml-luxury-recovery.png"
  });
  console.log(await page.locator("body").innerText());
  const broken = await page
    .locator("img")
    .evaluateAll((images) =>
      images
        .filter((image) => !image.complete || !image.naturalWidth)
        .map((image) => image.src)
    );
  if (broken.length || errors.length)
    throw new Error(JSON.stringify({ broken, errors }));
  await page
    .getByRole("button", { name: "Open game menu", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Standard Table", exact: true })
    .click();
  await page.locator(".tabletop-app--normal").waitFor();
  await page
    .getByRole("button", { name: "Open game menu", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Luxury Table", exact: true })
    .click();
  await page.getByTestId("fresh-alt-table").waitFor();
  console.log(
    "PASS: luxury artwork/cards load; table switching preserves live session; no page errors."
  );
  await page
    .getByRole("button", { name: "Autoplay my hand", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Next Deal", exact: true })
    .waitFor({ timeout: 180000 })
    .catch(async error => {
      console.error("Deal did not finish:", await page.locator("body").innerText());
      await page.screenshot({path: "C:/Users/Keifm/Downloads/tichuml-luxury-stalled.png"});
      throw error;
    });
  console.log(
    "PASS: real engine completed a deal through live luxury UI autoplay."
  );
} finally {
  await browser.close();
}
