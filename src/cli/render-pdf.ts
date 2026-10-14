import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";
import { documentHtml, slideHtml, type Deck } from "../lib/slide-html.js";
import { validateDeck } from "../lib/slide-validate.js";

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};

const outDir = flag("out", "dist-pdf")!;
const ids = (flag("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const dir = flag("dir", "data/slides")!;
const snapshotAt = flag("snapshot") ?? process.env.SNAPSHOT_AT ?? "1970-01-01T00:00:00Z";

function findChrome(): string | undefined {
  const cands = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"];
  return cands.find((c) => c && existsSync(c));
}

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

const FS_STEPS = [16, 15.5, 15, 14.5, 14, 13.5, 13];

async function overflowOf(page: Page, key: string): Promise<number> {
    const JS = `(() => { const s = document.querySelector('section[data-key="${key}"]'); const ft = s.querySelector('.ft'); const ftTop = ft.getBoundingClientRect().top; const cardOver = Math.max(0, ...[...s.querySelectorAll('.card')].map(c => c.getBoundingClientRect().bottom - ftTop)); const over = [...s.querySelectorAll('.main, .side')].map(e => e.scrollHeight - e.clientHeight); const hOver = s.scrollHeight - s.clientHeight; const ftOver = ft.getBoundingClientRect().bottom - s.getBoundingClientRect().bottom; return Math.max(0, hOver, Math.round(ftOver), Math.round(cardOver), ...over); })()`;
    return Number(await page.evaluate(JS));
  }

const exe = findChrome();
if (!exe) throw new Error("no Chrome/Chromium found; set CHROME_PATH");
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const report: Record<string, { fs: number; detail: boolean; continuation: boolean; overflow: number }> = {};
  const pages: string[] = [];

  for (const s of slides) {
    let chosen: { fs: number; detail: boolean } | null = null;
    let last = Infinity;
    for (const includeDetail of [true, false]) {
      for (const fs of FS_STEPS) {
        await page.setContent(`<!doctype html><meta charset="utf-8"><style>${(await import("../lib/slide-html.js")).PDF_CSS}</style>${slideHtml(s, { fs, includeDetail })}`);
        await page.evaluate(() => document.fonts.ready);
        const o = await overflowOf(page, s.key);
        last = o;
        if (o <= 0) { chosen = { fs, detail: includeDetail }; break; }
      }
      if (chosen) break;
    }
    const continuation = !!chosen && !chosen.detail && s.panels.some((p) => p.priority === "detail" && p.availability === "present");
    if (!chosen) chosen = { fs: FS_STEPS.at(-1)!, detail: false };
    report[s.key] = { fs: chosen.fs, detail: chosen.detail, continuation, overflow: chosen.detail || !Number.isFinite(last) ? 0 : Math.max(0, last) };
    pages.push(slideHtml(s, { fs: chosen.fs, includeDetail: chosen.detail }));
    if (continuation) {
      const detailOnly = { ...s, panels: s.panels.filter((p) => p.priority === "detail") };
      let cfs: number | null = null;
      for (const fs of FS_STEPS) {
        await page.setContent(`<!doctype html><meta charset="utf-8"><style>${(await import("../lib/slide-html.js")).PDF_CSS}</style>${slideHtml(detailOnly as typeof s, { fs, includeDetail: true, continuation: true })}`);
        await page.evaluate(() => document.fonts.ready);
        if ((await overflowOf(page, s.key)) <= 0) { cfs = fs; break; }
      }
      if (cfs === null) { report[s.key]!.overflow = 1; cfs = FS_STEPS.at(-1)!; }
      pages.push(slideHtml(detailOnly as typeof s, { fs: cfs, includeDetail: true, continuation: true }));
    }
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
