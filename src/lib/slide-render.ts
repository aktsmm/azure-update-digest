import { existsSync } from "node:fs";
import type { Page } from "playwright-core";
import { PDF_CSS, slideHtml } from "./slide-html.js";

type SlideArg = Parameters<typeof slideHtml>[0];

export const FS_STEPS = [26, 25, 24, 23, 22, 21, 20, 19, 18, 17.5, 17, 16.5, 16, 15.5, 15, 14.5, 14, 13.5, 13, 12.5];

export interface FitReport { fs: number; sfs: number; detail: boolean; continuation: boolean; overflow: number }

export async function overflowOf(page: Page, key: string): Promise<number> {
  const js = `(() => { const s = document.querySelector('section[data-key="${key}"]'); const ft = s.querySelector('.ft'); const ftTop = ft.getBoundingClientRect().top; const cardOver = Math.max(0, ...[...s.querySelectorAll('.card')].map(c => c.getBoundingClientRect().bottom - ftTop)); const over = [...s.querySelectorAll('.main, .side')].map(e => e.scrollHeight - e.clientHeight); const hOver = s.scrollHeight - s.clientHeight; const ftOver = ft.getBoundingClientRect().bottom - s.getBoundingClientRect().bottom; return Math.max(0, hOver, Math.round(ftOver), Math.round(cardOver), ...over); })()`;
  return Number(await page.evaluate(js));
}

async function fits(page: Page, s: SlideArg, opts: Parameters<typeof slideHtml>[1]): Promise<number> {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${PDF_CSS}</style>${slideHtml(s, opts)}`);
  await page.evaluate(() => document.fonts.ready);
  return overflowOf(page, s.key);
}

/** Chooses the largest font that fits; detail panels move to a continuation page when needed. */
export async function fitSlide(page: Page, s: SlideArg): Promise<{ pages: string[]; report: FitReport }> {
  const MIN = FS_STEPS.at(-1)!;
  let chosen: { fs: number; sfs: number; detail: boolean } | null = null;
  let last = Infinity;
  // 1. largest single size that fits everything (detail panels included first, then core only)
  for (const includeDetail of [true, false]) {
    for (const fs of FS_STEPS) {
      last = await fits(page, s, { fs, includeDetail });
      if (last <= 0) { chosen = { fs, sfs: fs, detail: includeDetail }; break; }
    }
    if (chosen) break;
  }
  const hasDetail = s.panels.some((p) => p.priority === "detail" && p.availability === "present");
  const continuation = !!chosen && !chosen.detail && hasDetail;
  if (!chosen) chosen = { fs: MIN, sfs: MIN, detail: false };
  // 2. the two columns rarely fill up together: grow the main column alone while the right column keeps its size
  for (const fs of FS_STEPS.filter((x) => x > chosen!.fs)) {
    if ((await fits(page, s, { fs, sfs: chosen.sfs, includeDetail: chosen.detail })) <= 0) { chosen = { ...chosen, fs }; break; }
  }
  const report: FitReport = { fs: chosen.fs, sfs: chosen.sfs, detail: chosen.detail, continuation, overflow: chosen.detail || !Number.isFinite(last) ? 0 : Math.max(0, last) };
  const pages = [slideHtml(s, { fs: chosen.fs, sfs: chosen.sfs, includeDetail: chosen.detail })];
  if (continuation) {
    const detailOnly = { ...s, panels: s.panels.filter((p) => p.priority === "detail") } as SlideArg;
    let cfs: number | null = null;
    for (const fs of FS_STEPS) {
      if ((await fits(page, detailOnly, { fs, includeDetail: true, continuation: true })) <= 0) { cfs = fs; break; }
    }
    if (cfs === null) { report.overflow = 1; cfs = FS_STEPS.at(-1)!; }
    pages.push(slideHtml(detailOnly, { fs: cfs, includeDetail: true, continuation: true }));
  }
  return { pages, report };
}

export function findChrome(): string | undefined {
  const cands = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"];
  return cands.find((c) => c && existsSync(c));
}
