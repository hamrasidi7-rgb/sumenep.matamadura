// Responsive QA: screenshots + automatic checks on every target width.
//
//   npm run build && npm start        (server on :3200)
//   node scripts/shoot.mjs [baseUrl]
//
// Uses the locally installed Chrome (playwright-core, no browser download).
// Output: qa/shots/*.png and qa/report.json. Exit code 1 on any failure.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3200";
const OUT = path.resolve(import.meta.dirname, "../qa/shots");
fs.mkdirSync(OUT, { recursive: true });

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
].find((p) => fs.existsSync(p));

const WIDTHS = {
  mobile: [360, 375, 390, 414, 430],
  tablet: [768, 820, 1024],
  desktop: [1280, 1440, 1600, 1920],
};
const PAGES = ["/", "/artikel/sumenep-cerita-yang-tumbuh-di-ujung-kepulauan", "/rubrik/catatan-sumenep", "/cari?q=pulau"];

const failures = [];
const report = { base: BASE, pages: [] };
const fail = (msg) => {
  failures.push(msg);
  console.log("  ✗", msg);
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function open(width, url, dpr) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : width < 1280 ? 1100 : 900 },
    deviceScaleFactor: dpr ?? (width < 768 ? 2 : 1),
    isMobile: width < 768,
    hasTouch: width < 1024,
    locale: "id-ID",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // Trigger lazy images, then return to top.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(450);
  return { ctx, page, errors };
}

async function checks(page, label) {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - vw;
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        if (!b.width || getComputedStyle(el).position === "fixed") return false;
        if (el.closest("dialog:not([open])")) return false;
        return b.right > vw + 1 || b.left < -1;
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    const brokenImgs = [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src);
    const smallTargets = [...document.querySelectorAll("body > header a, body > header button, dialog[open] a, dialog[open] button, [aria-label^='Buka Chator']")]
      .filter((el) => el.checkVisibility?.())
      .map((el) => ({ el, b: el.getBoundingClientRect() }))
      .filter(({ b }) => b.width > 0 && (b.width < 44 || b.height < 44))
      .map(({ el, b }) => `${el.getAttribute("aria-label") ?? el.textContent?.trim()} ${Math.round(b.width)}×${Math.round(b.height)}`);
    const h1 = document.querySelectorAll("h1").length;
    const imgsNoAlt = [...document.images].filter((i) => !i.hasAttribute("alt")).length;
    return { vw, overflow, offenders, brokenImgs, smallTargets, h1, imgsNoAlt };
  });
  if (r.overflow > 0) fail(`${label}: horizontal overflow ${r.overflow}px → ${r.offenders.join(", ")}`);
  if (r.brokenImgs.length) fail(`${label}: broken images ${r.brokenImgs.join(", ")}`);
  if (r.smallTargets.length) fail(`${label}: tap targets < 44px: ${r.smallTargets.join("; ")}`);
  if (r.h1 !== 1) fail(`${label}: expected exactly one <h1>, found ${r.h1}`);
  if (r.imgsNoAlt) fail(`${label}: ${r.imgsNoAlt} image(s) without alt attribute`);
  return r;
}

// 1) Every page × every width
for (const url of PAGES) {
  for (const [group, widths] of Object.entries(WIDTHS)) {
    for (const w of widths) {
      const label = `${url} @${w}`;
      const { ctx, page, errors } = await open(w, url);
      const r = await checks(page, label);
      if (errors.length) fail(`${label}: console errors: ${errors.join(" | ").slice(0, 300)}`);
      if (url === "/" || (url.startsWith("/artikel") && [390, 1440].includes(w))) {
        const slug = url === "/" ? "home" : "artikel";
        await page.screenshot({ path: path.join(OUT, `${slug}-${group}-${w}.png`), fullPage: true });
      }
      report.pages.push({ url, width: w, overflow: r.overflow, errors: errors.length });
      await ctx.close();
    }
  }
  console.log("✓ checked", url);
}

// 2) Above-the-fold shots (what a reader sees first) at 390 and 430 for mockup comparison
for (const w of [390, 430]) {
  const { ctx, page } = await open(w, "/");
  await page.screenshot({ path: path.join(OUT, `home-mobile-${w}-viewport.png`) });
  await ctx.close();
}

// 3) Interactions: hamburger drawer and Chator AI panel
for (const w of [390, 1440]) {
  const { ctx, page, errors } = await open(w, "/");
  const tag = w < 768 ? "mobile" : "desktop";

  await page.getByRole("button", { name: /menu/i }).first().click();
  const drawer = page.locator("dialog#navigasi-utama");
  await drawer.waitFor({ state: "visible" });
  await page.waitForTimeout(350);
  const links = await drawer.locator("nav a").allInnerTexts();
  if (links.length !== 11) fail(`drawer @${w}: expected 11 links, got ${links.length}`);
  await page.screenshot({ path: path.join(OUT, `drawer-${tag}-${w}.png`) });
  await checks(page, `drawer @${w}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  if (await drawer.evaluate((d) => d.open)) fail(`drawer @${w}: Escape did not close it`);

  await page.getByRole("button", { name: /Buka Chator AI/ }).click();
  const chat = page.locator("dialog.chator");
  await chat.waitFor({ state: "visible" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `chator-${tag}-${w}.png`) });
  // Development mode: the notice is shown and there is NO way to "chat".
  const chatText = await chat.innerText();
  if (!chatText.includes("Chator AI sedang dalam pengembangan.")) fail(`chator @${w}: development notice missing`);
  const inputs = await chat.locator("input, textarea, [contenteditable='true']").count();
  if (inputs !== 0) fail(`chator @${w}: panel must not contain a question input (found ${inputs})`);
  await checks(page, `chator @${w}`);
  await page.getByRole("button", { name: "Tutup Chator AI" }).click();
  await page.waitForTimeout(300);
  if (await chat.evaluate((d) => d.open)) fail(`chator @${w}: close button did not close it`);
  await page.getByRole("button", { name: /Buka Chator AI/ }).click();
  await page.waitForTimeout(300);
  await chat.getByRole("button", { name: "Tutup", exact: true }).click();
  await page.waitForTimeout(300);
  if (await chat.evaluate((d) => d.open)) fail(`chator @${w}: "Tutup" button did not close it`);
  if (errors.length) fail(`interactions @${w}: console errors: ${errors.join(" | ").slice(0, 300)}`);
  await ctx.close();
  console.log("✓ interactions", w);
}

// 4) Every internal link on the homepage resolves (no 404s)
{
  const { ctx, page } = await open(1440, "/");
  const hrefs = [...new Set(await page.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href"))))];
  for (const h of hrefs) {
    const res = await page.request.get(BASE + h);
    if (res.status() !== 200) fail(`link ${h} → HTTP ${res.status()}`);
  }
  report.links = hrefs.length;
  console.log(`✓ ${hrefs.length} internal links checked`);
  await ctx.close();
}

await browser.close();
report.failures = failures;
fs.writeFileSync(path.resolve(OUT, "../report.json"), JSON.stringify(report, null, 2));
console.log(failures.length ? `\n${failures.length} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exit(failures.length ? 1 : 0);
