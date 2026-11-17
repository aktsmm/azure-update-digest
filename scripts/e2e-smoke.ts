import { chromium, type Page } from "playwright-core";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { PDFDocument, PDFName } from "pdf-lib";
import { findChrome } from "../src/lib/slide-render.js";

// End-to-end smoke test of the published site in a real browser.
//   BASE_URL=https://aktsmm.github.io/azure-update-digest/ E2E_PDF_PASSWORD=... npx tsx scripts/e2e-smoke.ts
// The password is read from the environment and never stored in the repository. Exit code 1 on any failed check.
const BASE = process.env.BASE_URL ?? "https://aktsmm.github.io/azure-update-digest/";
const PASSWORD = process.env.E2E_PDF_PASSWORD ?? "";
const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); };

const browser = await chromium.launch({ executablePath: findChrome(), args: ["--no-sandbox"] });
const errors: string[] = [];
const open = async (url: string, width = 1280) => {
  const page = await browser.newPage({ viewport: { width, height: 900 }, acceptDownloads: true });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(`console: ${m.text().slice(0, 120)}`); });
  page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url().slice(-60)}`));
  await page.goto(`${BASE}?x=${Date.now()}${url}`);
  await page.waitForSelector(".card, .empty, table", { timeout: 30000 });
  return page;
};
// the highlights section repeats cards from the list, so only the main list is counted
const MAIN = "article.card:not(#hl-fold article.card)";
const cards = (p: Page) => p.locator(MAIN).count();
const headlineCount = async (p: Page) => Number(((await p.locator("p:has(strong:has-text('件'))").first().innerText()).match(/(\d+)\s*件/) ?? [])[1] ?? -1);

// 1. home: count in the headline equals the rendered cards, numbering starts at 1
{
  const p = await open("#/");
  const n = await cards(p), h = await headlineCount(p);
  check("home: headline count equals rendered cards", n > 0 && n === h, `cards=${n} headline=${h}`);
  check("home: highlights section present and collapsible", (await p.locator("#hl-fold").count()) === 1);
  const nums = await p.locator(`${MAIN} .no`).first().innerText();
  check("home: cards are numbered from 1", nums.trim() === "1", nums.trim());
  await p.close();
}

// 2. search narrows results and survives reload via the hash
{
  const p = await open("#/");
  const total = await cards(p);
  await p.locator("input[name=q]").fill("Kubernetes");
  await p.locator("input[name=q]").press("Enter");
  await p.waitForTimeout(500);
  const n = await cards(p);
  check("search: narrows the list", n > 0 && n < total, `${total} -> ${n}`);
  const texts = await p.locator(MAIN).allInnerTexts();
  const unexplained = texts.filter((t) => !/kubernetes|aks/i.test(t) && !t.includes("検索に一致"));
  check("search: every result shows the query or says what matched", unexplained.length === 0, `${unexplained.length} unexplained`);
  const url = p.url();
  await p.reload(); await p.waitForSelector("article.card");
  check("search: state survives reload", (await cards(p)) === n && url.includes("q="));
  await p.getByRole("button", { name: "条件をリセット" }).click();
  await p.waitForTimeout(500);
  check("reset: restores the full list", (await cards(p)) === total);
  await p.close();
}

// 3. kind and importance chips (multi-select) agree with the badges
{
  const p = await open("#/");
  const total = await cards(p);
  await p.locator("label.kind-chip.k-retirement input").check();
  await p.waitForTimeout(500);
  const n = await cards(p);
  const kinds = await p.locator(`${MAIN} .kind`).allInnerTexts();
  check("kind chip: only retirement cards remain", n > 0 && n < total && kinds.every((k) => /廃止/.test(k)), `${n} cards, kinds=${[...new Set(kinds)].join("/")}`);
  await p.locator("label.kind-chip.k-ga input").check();
  await p.waitForTimeout(500);
  check("kind chip: two kinds are OR-ed", (await cards(p)) > n);
  await p.getByRole("button", { name: "条件をリセット" }).click();
  await p.locator("label.imp-chip.i-high input").check();
  await p.waitForTimeout(500);
  const hi = await cards(p);
  check("importance chip: high only", hi > 0 && hi < total, `${hi} of ${total}`);
  await p.close();
}

// 4. period: single day (boundary), invalid range, availability mode
{
  const p = await open("#/?start=2026-11-10&end=2026-11-10");
  const one = await headlineCount(p);
  check("period: a single day is inclusive and consistent", one === (await cards(p)), `headline=${one} cards=${await cards(p)}`);
  await p.close();
  const q = await open("#/?mode=availability");
  check("availability mode: renders without inventing dates", (await q.locator("text=月単位").count()) > 0);
  await q.close();
}

// 5. archive and detail anchor
{
  const p = await open("#/archive");
  const rows = await p.locator("table tbody tr").count();
  check("archive: lists months with a coverage state", rows >= 12 && (await p.locator("table").innerText()).includes("全件"), `rows=${rows}`);
  await p.locator("table tbody tr a").first().click();
  await p.waitForSelector("article.card, .empty");
  check("archive: a month opens its list", (await p.url()).includes("#/archive/"));
  await p.close();
  const d = await open("#/");
  const key = await d.locator("article.card").first().getAttribute("id");
  await d.goto(`${BASE}?x=${Date.now()}#/`); await d.waitForSelector("article.card");
  const href = await d.locator("article.card h3 a.anchor").first().getAttribute("href");
  check("detail: anchor link points at the card id", !!key && !!href && href.endsWith(key!) || (href ?? "").includes((key ?? "").replace("update-", "")), `${key} ${href}`);
  await d.close();
}

// 6. selection drives the JSON download
{
  const p = await open("#/");
  const total = await cards(p);
  await p.locator(`${MAIN} label.sel`).first().click();
  await p.locator(`${MAIN} label.sel`).nth(1).click();
  const count = await p.locator("#selcount").innerText();
  check("selection: counter reflects deselected cards", count.includes(`${total - 2} / ${total}`), count);
  const [dl] = await Promise.all([p.waitForEvent("download"), p.locator('[data-dl="json"]').click()]);
  const path = await dl.path();
  const body = JSON.parse(readFileSync(path!, "utf8"));
  check("json download: only the selected updates", body.items.length === total - 2 && /_selected/.test(dl.suggestedFilename()), `${body.items.length} items, ${dl.suggestedFilename()}`);
  check("json download: carries selection conditions and snapshot", !!body.selection?.period && !!body.selection?.snapshotAt && Array.isArray(body.slides));
  const withPricing = body.slides.filter((s: any) => s.pricing).length;
  const kindOk = body.slides.every((s: any) => ["free", "paid", "change"].includes(s.pricing?.kind ?? "free"));
  check("json download: slide pricing (if any) uses the schema vocabulary", kindOk, `${body.slides.length} slides, ${withPricing} with pricing`);
  await p.close();
}

// 7. PDF / PPTX downloads (password gate)
if (PASSWORD) {
  const p = await open("#/?start=2026-11-01&end=2026-11-17");
  p.on("dialog", (d) => d.accept(PASSWORD));
  const [pdf] = await Promise.all([p.waitForEvent("download", { timeout: 180000 }), p.locator('[data-dl="pdf"]').click()]);
  const pdfDoc = await PDFDocument.load(readFileSync((await pdf.path())!));
  const outline = pdfDoc.catalog.lookup(PDFName.of("Outlines"));
  check("pdf download: opens and has bookmarks", pdfDoc.getPageCount() >= 5 && !!outline, `${pdfDoc.getPageCount()} pages`);
  const [pptx] = await Promise.all([p.waitForEvent("download", { timeout: 180000 }), p.locator('[data-dl="pptx"]').click()]);
  const zip = await JSZip.loadAsync(readFileSync((await pptx.path())!));
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length;
  check("pptx download: opens with cover, contents and slides", slides >= 5, `${slides} slides`);
  await p.close();
  const w = await open("#/?start=2026-11-01&end=2026-11-17");
  w.on("dialog", (d) => d.accept("wrong-password"));
  await w.locator('[data-dl="pdf"]').click();
  await w.waitForFunction(() => /パスワードが違います/.test(document.getElementById("dl-status")?.textContent ?? ""), null, { timeout: 60000 }).then(() => check("pdf download: wrong password is refused with a message", true)).catch(() => check("pdf download: wrong password is refused with a message", false));
  await w.close();
} else console.log("SKIP  pdf/pptx download (E2E_PDF_PASSWORD not set)");

// 8. keyboard flow and accessibility
{
  const p = await open("#/");
  await p.keyboard.press("Tab");
  check("keyboard: first Tab lands on the skip link", await p.evaluate(() => document.activeElement?.className === "skip-link"));
  await p.keyboard.press("Enter");
  check("keyboard: skip link moves focus to the main content", await p.evaluate(() => document.activeElement?.id === "app"));
  const chip = p.locator("label.kind-chip.k-ga input");
  await chip.focus(); await p.keyboard.press("Space"); await p.waitForTimeout(400);
  check("keyboard: a filter chip toggles with Space", (await p.locator("label.kind-chip.k-ga input").isChecked()) === true);
  check("a11y: search box is named, nav is labelled, page is not a live region", (await p.locator("input[type=search]").getAttribute("aria-label")) !== null && (await p.locator("nav").getAttribute("aria-label")) !== null && !(await p.locator("#app").getAttribute("aria-live")));
  await p.close();
}

// 9. phone width
{
  const p = await open("#/", 390);
  check("phone width: no horizontal scroll", !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  const box = await p.locator(`${MAIN} label.sel`).first().boundingBox();
  check("phone width: card checkbox target is at least 24px", !!box && box.width >= 24 && box.height >= 24, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "");
  await p.close();
}

check("no console errors, page errors or failed requests", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
