// Throwaway: renders the live web app at the iPad 13" size (1032 x 1376 pt @2x
// = 2064 x 2752 px) for the App Store listing. Not meant to be merged.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "https://ohmywind.fr";
const PLAN =
  "/plan?wpts=43.2790,5.3250;43.1650,5.3900;43.0250,5.8600;42.9950,6.1150;43.0080,6.1980" +
  "&departure=2026-11-28T08:00&archetype=cruiser_30ft&motor=4,5.5";
const SPOTS = [
  { name: "Marseille, Frioul", latitude: 43.275, longitude: 5.305 },
  { name: "Cassis", latitude: 43.205, longitude: 5.535 },
  { name: "La Ciotat", latitude: 43.165, longitude: 5.625 },
  { name: "Porquerolles", latitude: 43.012, longitude: 6.2 },
];

mkdirSync("out", { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1376, height: 1032 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "fr-FR",
  timezoneId: "Europe/Paris",
  userAgent:
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
await ctx.addInitScript((spots) => {
  try {
    if (!localStorage.getItem("ohmywind_custom_spots"))
      localStorage.setItem("ohmywind_custom_spots", JSON.stringify(spots));
  } catch {}
}, SPOTS);

async function settle(page, ms) {
  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => console.log("no networkidle"));
  await page.waitForTimeout(ms);
}
async function shot(name, path, act) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(name, "pageerror", e.message));
  try {
    await page.goto(BASE + path, { waitUntil: "load", timeout: 60000 });
    await settle(page, 9000);
    if (act) await act(page);
  } catch (e) {
    console.log(name, "FAILED", e.message);
  }
  await page.screenshot({ path: `out/${name}.png` });
  console.log(name, page.url());
  await page.close();
}

await shot("5_explore", "/?center=43.05,5.60&zoom=10", async (page) => {
  await page.touchscreen.tap(520, 480);
  await settle(page, 14000);
});
await browser.close();
