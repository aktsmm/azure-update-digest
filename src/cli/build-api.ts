import { existsSync, readdirSync, readFileSync } from "node:fs";
import { loadConfigs } from "../lib/config.js";
import { loadSiteData } from "../lib/site-data.js";
import { buildApi, type ApiSlideInfo } from "../lib/api.js";
import { writeJson } from "../lib/stable.js";

// Run after build + build:pdfs. Writes dist/api/v1/**.
const out = process.env.PDF_OUT ?? "dist";
const { items, meta } = loadSiteData(process.env.DATA_ROOT ?? "data", loadConfigs());

const slides = new Map<string, ApiSlideInfo>();
const published = new Set<string>(existsSync(`${out}/data/slides.json`) ? (JSON.parse(readFileSync(`${out}/data/slides.json`, "utf8")) as { slides: { key: string }[] }).slides.map((s) => s.key) : []);
if (existsSync(`${out}/slides`)) {
  for (const f of readdirSync(`${out}/slides`).filter((x) => x.endsWith(".json"))) {
    const deck = JSON.parse(readFileSync(`${out}/slides/${f}`, "utf8")) as { slides: { key: string }[] };
    const s = deck.slides[0];
    if (s) slides.set(s.key, { slide: s, pdf: published.has(s.key) });
  }
}

const files = buildApi(items, meta, slides);
for (const f of files) writeJson(`${out}/${f.path}`, f.body);
console.log(`api: ${files.length} files (${items.length} updates, ${slides.size} slides)`);
