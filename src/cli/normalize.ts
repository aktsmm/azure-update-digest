import { loadConfigs } from "../lib/config.js";
import { FileStore } from "../lib/store.js";
import { normalize } from "../lib/normalize.js";
import { writeJson } from "../lib/stable.js";
import { monthOf } from "../lib/period.js";
import { readdirSync, existsSync, unlinkSync } from "node:fs";

const dataRoot = process.env.DATA_ROOT ?? "data";
const cfg = loadConfigs();
const items = normalize(new FileStore(dataRoot).readAllRaw(), cfg.categories, cfg.importance);

const byMonth = new Map<string, typeof items>();
for (const it of items) (byMonth.get(monthOf(it.createdJst)) ?? byMonth.set(monthOf(it.createdJst), []).get(monthOf(it.createdJst))!).push(it);

const dir = `${dataRoot}/normalized/items`;
let written = 0;
for (const [m, list] of [...byMonth].sort()) {
  const sortedList = [...list].sort((a, b) => (a.canonicalKey < b.canonicalKey ? -1 : 1));
  if (writeJson(`${dir}/${m}.json`, { schema: 1, month: m, items: sortedList })) written++;
}
if (existsSync(dir)) {
  for (const f of readdirSync(dir)) if (f.endsWith(".json") && !byMonth.has(f.replace(".json", ""))) unlinkSync(`${dir}/${f}`);
}
console.log(`normalized ${items.length} items into ${byMonth.size} month files (${written} changed)`);
