import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { loadNormalized } from "../lib/site-data.js";
import { stableStringify } from "../lib/stable.js";
import { parseInstant, recentMonths } from "../lib/period.js";

// Lists update IDs that still need a slide: created within the retention window (JST months),
// fully fetched, no data/slides/<id>.json yet. Newest first, capped by --limit.
const args = process.argv.slice(2);
const flag = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1] ?? d) : d;
};
const limit = Number(flag("limit", "30"));
const months = Number(flag("months", "3"));
const out = flag("out", ".work/slide-pending.json");
const root = process.env.DATA_ROOT ?? "data";
const slidesDir = process.env.SLIDES_DIR ?? "data/slides";
const since = `${recentMonths(Date.now(), months)[0]}-01`;

const todo = loadNormalized(root)
  .filter((i) => i.detailState === "ok" && i.description && i.createdJst >= since)
  .filter((i) => !existsSync(`${slidesDir}/${i.canonicalKey}.json`))
  .sort((a, b) => parseInstant(b.created) - parseInstant(a.created) || (a.canonicalKey < b.canonicalKey ? -1 : 1))
  .slice(0, limit)
  .map((i) => ({ id: i.canonicalKey, createdJst: i.createdJst, title: i.title }));

mkdirSync(out.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
writeFileSync(out, stableStringify({ since, count: todo.length, items: todo }), "utf8");
for (const t of todo) console.log(t.id);
console.error(`slides pending since ${since}: ${todo.length} (limit ${limit})`);
