// Throwaway: renders the live web app at the iPad 13" size (1032 x 1376 pt @2x
// = 2064 x 2752 px) for the App Store listing. Not meant to be merged.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "https://ohmywind.fr";
const PLAN =
  "/plan?wpts=43.2790,5.3250;43.1650,5.3900;43.0250,5.8600;42.9950,6.1150;43.0080,6.1980" +
  "&departure=2026-11-28T08:00&archetype=cruiser_30ft";
const SHOTS = [
  ["1_plan", PLAN],
  ["2_explorer", "/?center=43.15,5.60&zoom=10"],
  ["3_comparer", "/comparer"],
];

mkdirSync("out", { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1032, height: 1376 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "fr-FR",
  timezoneId: "Europe/Paris",
  userAgent:
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
for (const [name, path] of SHOTS) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(name, "pageerror", e.message));
  await page.goto(BASE + path, { waitUntil: "load", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => console.log(name, "no networkidle"));
  await page.waitForTimeout(12000);
  await page.screenshot({ path: `out/${name}.png` });
  console.log(name, page.url(), (await page.title()));
  await page.close();
}
await browser.close();
