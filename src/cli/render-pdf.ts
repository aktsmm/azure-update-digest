import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";
import { documentHtml, slideHtml, type Deck } from "../lib/slide-html.js";
import { validateDeck } from "../lib/slide-validate.js";
import { findChrome, fitSlide } from "../lib/slide-render.js";

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};

const outDir = flag("out", "dist-pdf")!;
const ids = (flag("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const dir = flag("dir", "data/slides")!;
const snapshotAt = flag("snapshot") ?? process.env.SNAPSHOT_AT ?? "1970-01-01T00:00:00Z";

const files = (ids.length ? ids.map((i) => `${i}.json`) : readdirSync(dir).filter((f) => f.endsWith(".json"))).sort();
if (!files.length) throw new Error(`no slide files in ${dir}`);

const slides = files.flatMap((f) => (JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Deck).slides);
const first = JSON.parse(readFileSync(`${dir}/${files[0]}`, "utf8")) as Deck;
const deck: Deck = {
  schemaVersion: 1,
  selection: { ...first.selection, mode: "ids", ids: slides.map((s) => s.key), snapshotAt: first.selection.snapshotAt ?? snapshotAt },
  slides,
};
const problems = validateDeck(deck);
if (problems.length) {
  for (const p of problems.slice(0, 30)) console.error(`[${p.slide}] ${p.message}`);
  throw new Error(`deck is invalid (${problems.length} problem(s)); refusing to render`);
}

const exe = findChrome();
if (!exe) throw new Error("no Chrome/Chromium found; set CHROME_PATH");
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const report: Record<string, { fs: number; sfs: number; detail: boolean; continuation: boolean; overflow: number }> = {};
  const pages: string[] = [];

  for (const s of slides) {
    const fit = await fitSlide(page, s);
    report[s.key] = fit.report;
    pages.push(...fit.pages);
  }

  mkdirSync(outDir, { recursive: true });
  const html = documentHtml(deck, pages);
  writeFileSync(`${outDir}/deck.html`, html, "utf8");
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const stem = ids.length === 1 ? ids[0]! : "digest";
  await page.pdf({ path: `${outDir}/${stem}.pdf`, width: "1280px", height: "720px", printBackground: true, preferCSSPageSize: true });
  const total = await page.evaluate(() => document.querySelectorAll(".page").length);
  // per-page preview images for quality review
  for (let i = 0; i < total; i++) {
    await page.evaluate((n) => { document.querySelectorAll<HTMLElement>(".page").forEach((p, j) => { p.style.display = j === n ? "" : "none"; }); }, i);
    await page.screenshot({ path: `${outDir}/${stem}-p${i + 1}.png`, clip: { x: 0, y: 0, width: 1280, height: 720 } });
  }
  writeFileSync(`${outDir}/render-report.json`, JSON.stringify({ pages: total, slides: report }, null, 2) + "\n", "utf8");
  console.log(`pdf: ${outDir}/${stem}.pdf (${total} pages)`);
  console.log(JSON.stringify(report));
  const stuck = Object.entries(report).filter(([, r]) => r.overflow > 0);
  if (stuck.length) throw new Error(`content still overflows at minimum font size: ${stuck.map(([k]) => k).join(", ")}`);
} finally {
  await browser.close();
}
