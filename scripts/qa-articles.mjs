// QA for the three article templates (Tahap 4).
//
//   npm run build && npm run start:local   (server on :3200)
//   node scripts/qa-articles.mjs [baseUrl]
//
// Per template × width: no horizontal overflow, headline fits its box, images
// load, one <h1>, typography inside the brief's ranges, no console errors.
// Interactions: table of contents (inline + sidebar), lightbox, reading
// progress, share controls. Screenshots → qa/shots/artikel-*.png.
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

export const TEMPLATES = {
  standard: "/artikel/membaca-arah-pembangunan-sumenep",
  feature: "/artikel/nelayan-laut-dan-ekonomi-pulau",
  spotlight: "/artikel/sumenep-cerita-yang-tumbuh-di-ujung-kepulauan",
};
const WIDTHS = [360, 375, 390, 430, 768, 1024, 1280, 1440, 1920];

// Brief §4.3 (px). Tablet = 768–1279.
const RANGES = {
  mobile: { headline: [30, 36], standfirst: [18, 21], body: [17, 19], lh: [1.7, 1.85] },
  tablet: { headline: [34, 44], body: [18, 19], lh: [1.7, 1.9] },
  desktop: { headline: [42, 56], standfirst: [22, 28], body: [19, 20], lh: [1.75, 1.9], column: [680, 760] },
};

const failures = [];
const results = [];
const fail = (m) => {
  failures.push(m);
  console.log("  ✗", m);
};
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function open(width, url) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : width < 1280 ? 1100 : 900 },
    deviceScaleFactor: width < 768 ? 2 : 1,
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
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}

const inRange = (v, [a, b], tol = 0.6) => v >= a - tol && v <= b + tol;

for (const [name, url] of Object.entries(TEMPLATES)) {
  for (const w of WIDTHS) {
    const label = `${name} @${w}`;
    const { ctx, page, errors } = await open(w, url);
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const scrollable = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true;
        }
        return false;
      };
      const offenders = [...document.querySelectorAll("main *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width && getComputedStyle(el).position !== "fixed" && !el.closest("dialog") && !scrollable(el) && (r.right > vw + 1 || r.left < -1);
        })
        .slice(0, 4)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)}`);
      const h1 = document.querySelector("h1");
      const p = document.querySelector("[data-article-body] > p");
      const sf = h1?.parentElement?.querySelector("h1 + p");
      const px = (el, prop) => (el ? parseFloat(getComputedStyle(el)[prop]) : 0);
      return {
        overflow: document.documentElement.scrollWidth - vw,
        offenders,
        h1Count: document.querySelectorAll("h1").length,
        h1Fits: h1 ? h1.scrollWidth <= h1.clientWidth + 1 : false,
        headline: px(h1, "fontSize"),
        standfirst: px(sf, "fontSize"),
        body: px(p, "fontSize"),
        lh: p ? px(p, "lineHeight") / px(p, "fontSize") : 0,
        column: document.getElementById("isi-artikel")?.getBoundingClientRect().width ?? 0,
        padLeft: document.getElementById("isi-artikel")?.getBoundingClientRect().left ?? 0,
        brokenImgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
        noAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).length,
      };
    });
    const range = w < 768 ? RANGES.mobile : w < 1280 ? RANGES.tablet : RANGES.desktop;
    if (m.overflow > 0) fail(`${label}: horizontal overflow ${m.overflow}px → ${m.offenders.join(", ")}`);
    if (m.h1Count !== 1) fail(`${label}: ${m.h1Count} <h1>`);
    if (!m.h1Fits) fail(`${label}: headline overflows its box`);
    if (!inRange(m.headline, range.headline)) fail(`${label}: headline ${m.headline}px outside ${range.headline}`);
    if (range.standfirst && !inRange(m.standfirst, range.standfirst)) fail(`${label}: standfirst ${m.standfirst}px outside ${range.standfirst}`);
    if (!inRange(m.body, range.body)) fail(`${label}: body ${m.body}px outside ${range.body}`);
    if (!inRange(m.lh, range.lh, 0.02)) fail(`${label}: line-height ${m.lh.toFixed(2)} outside ${range.lh}`);
    if (range.column && !inRange(m.column, range.column, 1)) fail(`${label}: text column ${m.column}px outside ${range.column}`);
    if (w < 768 && (m.padLeft < 19.5 || m.padLeft > 24.5)) fail(`${label}: horizontal padding ${m.padLeft}px outside 20–24`);
    if (m.brokenImgs.length) fail(`${label}: broken images ${m.brokenImgs.join(", ")}`);
    if (m.noAlt) fail(`${label}: ${m.noAlt} image(s) without alt`);
    if (errors.length) fail(`${label}: console errors: ${errors.join(" | ").slice(0, 300)}`);
    results.push({ template: name, width: w, headline: m.headline, standfirst: m.standfirst, body: m.body, lineHeight: +m.lh.toFixed(2), column: Math.round(m.column) });
    if (w === 390 || w === 1440) {
      // Lazy embeds (map) only load near the viewport: give them time before the full-page shot.
      const frames = page.locator("main iframe");
      for (let k = 0; k < (await frames.count()); k++) {
        await frames.nth(k).scrollIntoViewIfNeeded();
        await page.waitForTimeout(3500);
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `artikel-${name}-${w < 768 ? "mobile" : "desktop"}-${w}.png`), fullPage: true });
    }
    await ctx.close();
  }
  console.log("✓ checked", name);
}

// ── Interactions (spotlight has every component) ─────────────────────────────
{
  // Inline table of contents on a phone
  const { ctx, page, errors } = await open(390, TEMPLATES.spotlight);
  const toc = page.locator("#isi-artikel nav[aria-label='Daftar isi'] details");
  await toc.locator("summary").click();
  const links = toc.locator("a[data-toc-link]");
  const n = await links.count();
  if (n < 5) fail(`toc inline: expected ≥5 entries, got ${n}`);
  const target = await links.nth(3).getAttribute("data-toc-link");
  await links.nth(3).click();
  await page.waitForTimeout(900);
  const pos = await page.evaluate((id) => ({ hash: location.hash, top: document.getElementById(id)?.getBoundingClientRect().top ?? -1 }), target);
  if (pos.hash !== `#${target}` || pos.top < -5 || pos.top > 200) fail(`toc inline: link did not bring #${target} into view (hash ${pos.hash}, top ${pos.top})`);

  // Reading progress grows as the reader scrolls
  const progress = await page.evaluate(() => {
    const bar = document.querySelector("[aria-hidden] > .origin-left");
    return bar ? new DOMMatrixReadOnly(getComputedStyle(bar).transform).a : -1;
  });
  if (!(progress > 0.05 && progress <= 1)) fail(`reading progress: expected 0.05–1 after scrolling, got ${progress}`);

  // Lightbox: open gallery, next, Esc
  await page.locator("[data-lightbox][data-group^='galeri']").first().click();
  const lb = page.locator("dialog.lightbox");
  await lb.waitFor({ state: "visible" });
  const c1 = await lb.locator("[aria-live]").first().innerText();
  await lb.getByRole("button", { name: "Gambar berikutnya" }).click();
  const c2 = await lb.locator("[aria-live]").first().innerText();
  if (!c1.startsWith("1 /") || !c2.startsWith("2 /")) fail(`lightbox: counter ${c1} → ${c2}`);
  const imgOk = await lb.locator("img").evaluate((i) => i.complete && i.naturalWidth > 0);
  if (!imgOk) fail("lightbox: image did not load");
  await page.screenshot({ path: path.join(OUT, "artikel-lightbox-mobile-390.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  if (await lb.evaluate((d) => d.open)) fail("lightbox: Escape did not close");

  // Share controls
  const share = await page.locator("button:has-text('Salin tautan')").count();
  if (share < 1) fail("share: copy-link button missing");
  if (errors.length) fail(`interactions @390: console errors: ${errors.join(" | ").slice(0, 300)}`);
  await ctx.close();
}
{
  // Sidebar table of contents on desktop, with active-section tracking
  const { ctx, page, errors } = await open(1440, TEMPLATES.spotlight);
  const side = page.locator("nav[aria-label='Daftar isi']").first();
  if (!(await side.isVisible())) fail("toc sidebar: not visible at 1440");
  const link = side.locator("a[data-toc-link]").nth(2);
  const id = await link.getAttribute("data-toc-link");
  await link.click();
  await page.waitForTimeout(1000);
  const st = await page.evaluate((i) => ({ top: document.getElementById(i)?.getBoundingClientRect().top ?? -1, active: document.querySelector(`[data-toc-link="${i}"]`)?.getAttribute("data-active") }), id);
  if (st.top < -5 || st.top > 200) fail(`toc sidebar: #${id} not in view (top ${st.top})`);
  if (st.active !== "true") fail(`toc sidebar: #${id} not marked active (data-active=${st.active})`);
  await page.screenshot({ path: path.join(OUT, "artikel-spotlight-toc-desktop-1440.png") });
  // Cross-origin iframes are not painted in full-page captures, so the map gets its own shot.
  const map = page.locator("main iframe[title^='Peta']");
  if (await map.count()) {
    await map.scrollIntoViewIfNeeded();
    await page.waitForTimeout(4000);
    await map.screenshot({ path: path.join(OUT, "artikel-spotlight-peta-desktop-1440.png") });
  } else fail("map: spotlight demo should contain a map block");
  if (errors.length) fail(`interactions @1440: console errors: ${errors.join(" | ").slice(0, 300)}`);
  await ctx.close();
}
console.log("✓ interactions (toc, progress, lightbox, share)");

await browser.close();
fs.writeFileSync(path.resolve(OUT, "../articles-report.json"), JSON.stringify({ results, failures }, null, 2));
console.log(failures.length ? `\n${failures.length} FAILURE(S)` : `\nALL ARTICLE CHECKS PASSED (${results.length} page checks)`);
process.exit(failures.length ? 1 : 0);
