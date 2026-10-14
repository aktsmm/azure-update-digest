import { mkdirSync, writeFileSync } from "node:fs";
import { loadNormalized, loadRelated, loadSummaries } from "../lib/site-data.js";
import { stableStringify } from "../lib/stable.js";
import { parseInstant } from "../lib/period.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1] ?? d) : d;
};
const limit = Number(flag("limit", "25"));
const out = flag("out", ".work/pending.json");
const root = process.env.DATA_ROOT ?? "data";

const items = loadNormalized(root);
const summaries = loadSummaries(root);
const related = loadRelated(root);

const todo = items
  .filter((i) => i.detailState === "ok" && i.description)
  .map((i) => ({
    needsSummary: summaries.get(i.canonicalKey)?.sourceFingerprint !== i.fingerprint,
    needsTitle: summaries.get(i.canonicalKey)?.sourceFingerprint === i.fingerprint && !summaries.get(i.canonicalKey)?.titleJa,
    needsRelated: !related.has(i.canonicalKey),
    i,
  }))
  .filter((x) => x.needsSummary || x.needsTitle || x.needsRelated)
  .sort((a, b) => parseInstant(b.i.created) - parseInstant(a.i.created) || (a.i.canonicalKey < b.i.canonicalKey ? -1 : 1))
  .slice(0, limit)
  .map(({ needsSummary, needsTitle, needsRelated, i }) => ({
    canonicalKey: i.canonicalKey,
    needsSummary,
    needsTitle,
    needsRelated,
    sourceFingerprint: i.fingerprint,
    title: i.title,
    description: i.description,
    status: i.status,
    tags: i.tags,
    products: i.products,
    productCategories: i.productCategories,
    availabilities: i.availabilities,
    createdJst: i.createdJst,
  }));

mkdirSync(out.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
writeFileSync(out, stableStringify({ count: todo.length, items: todo }), "utf8");
console.log(`pending: ${todo.length} item(s) (${todo.filter((t) => t.needsSummary).length} summaries, ${todo.filter((t) => t.needsTitle).length} titles, ${todo.filter((t) => t.needsRelated).length} related) -> ${out}`);
