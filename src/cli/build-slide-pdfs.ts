import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { PDF_CSS } from "../lib/slide-html.js";
import { findChrome, fitSlide } from "../lib/slide-render.js";
import { validateDeck } from "../lib/slide-validate.js";
import type { SlideKind } from "../lib/slide-kind.js";
import { orderSlides } from "../lib/slide-order.js";
import { recentMonths } from "../lib/period.js";
import { stableStringify } from "../lib/stable.js";

// Renders every data/slides/<key>.json into dist/pdf/<key>.pdf (1 update = 1-2 pages) and writes dist/data/slides.json.
const dir = process.env.SLIDES_DIR ?? "data/slides";
const out = process.env.PDF_OUT ?? "dist";
// Only the most recent N calendar months (JST, current month included) are published; slide JSON stays in Git. 0 = unlimited.
const retention = Number(process.env.PDF_RETENTION_MONTHS ?? "3");
const since = retention > 0 ? `${recentMonths(Date.now(), retention)[0]}-01` : "0000-00-00";
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];

mkdirSync(`${out}/pdf`, { recursive: true });
mkdirSync(`${out}/data`, { recursive: true });
mkdirSync(`${out}/slides`, { recursive: true });

const entries: { key: string; kind: SlideKind; label: string; title: string; publishedJst: string; categories: string[]; pages: number; bytes: number }[] = [];

if (files.length) {
  const exe = findChrome();
  if (!exe) throw new Error("no Chrome/Chromium found; set CHROME_PATH");
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    for (const f of files) {
     try {
      const deck = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
      const problems = validateDeck(deck);
      if (problems.length) throw new Error(`${f} is invalid: ${problems[0]!.message}`);
      const s = deck.slides[0];
      if (s.meta.publishedJst < since) continue;
      const fit = await fitSlide(page, s);
      if (fit.report.overflow > 0) throw new Error(`${f} still overflows at the minimum font size`);
      await page.setContent(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${PDF_CSS}</style></head><body>${fit.pages.join("")}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      copyFileSync(`${dir}/${f}`, `${out}/slides/${s.key}.json`);
      const path = `${out}/pdf/${s.key}.pdf`;
      await page.pdf({ path, width: "1280px", height: "720px", printBackground: true, preferCSSPageSize: true });
      entries.push({ key: s.key, kind: s.kind, label: s.label, title: s.title.ja, publishedJst: s.meta.publishedJst, categories: s.meta.categories, pages: fit.pages.length, bytes: statSync(path).size });
     } catch (e) {
      // a bad slide must never block the whole site deploy
      console.error(`::warning::skipping ${f}: ${(e as Error).message}`);
     }
    }
  } finally {
    await browser.close();
  }
}

const slides = orderSlides(entries.map((e) => ({ ...e })));
writeFileSync(`${out}/data/slides.json`, stableStringify({ schema: 1, slides }) + "\n", "utf8");
console.log(`slide pdfs: ${slides.length} (published since ${since})`);
