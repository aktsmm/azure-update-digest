import { existsSync, readdirSync } from "node:fs";
import { loadConfigs } from "../lib/config.js";
import { loadNormalized, loadRelated, loadSummaries } from "../lib/site-data.js";
import { readJson } from "../lib/stable.js";
import { MAX_RELATED } from "../lib/digest.js";
import type { CollectState } from "../lib/store.js";
import type { RunReport } from "../lib/collect.js";

const root = process.argv[2] ?? process.env.DATA_ROOT ?? "data";
loadConfigs();
const errors: string[] = [];
const err = (m: string) => errors.push(m);

const items = loadNormalized(root);
const byKey = new Map(items.map((i) => [i.canonicalKey, i]));
if (byKey.size !== items.length) err("duplicate canonicalKey in normalized data");

const summaries = loadSummaries(root);
for (const [k, s] of summaries) {
  const it = byKey.get(k);
  if (!it) { err(`summary ${k}: no such item`); continue; }
  if (s.schema !== 1 || s.canonicalKey !== k) err(`summary ${k}: bad schema/key`);
  if (!/^[0-9a-f]{64}$/.test(s.sourceFingerprint)) err(`summary ${k}: bad sourceFingerprint`);
  const t = s.summaryJa ?? "";
  if (t.length < 20 || t.length > 600) err(`summary ${k}: length ${t.length} out of 20..600`);
  if (!/[\u3040-\u30ff\u4e00-\u9fff]/.test(t)) err(`summary ${k}: not Japanese`);
  if (/https?:\/\//i.test(t)) err(`summary ${k}: contains URL`);
  const d = it.description ?? "";
  for (let i = 0; i + 80 <= d.length; i += 40) if (t.includes(d.slice(i, i + 80))) { err(`summary ${k}: copies source text verbatim`); break; }
}

const related = loadRelated(root);
for (const [k, r] of related) {
  if (!byKey.has(k)) { err(`related ${k}: no such item`); continue; }
  if (!["verified", "not-found", "error", "uninvestigated"].includes(r.status)) err(`related ${k}: bad status`);
  const v = r.candidates.filter((c) => c.verified);
  if (v.length > MAX_RELATED) err(`related ${k}: more than ${MAX_RELATED} verified`);
  if (r.status === "verified" && v.length === 0) err(`related ${k}: status verified without verified candidate`);
  if (!r.sourceQuery) err(`related ${k}: missing sourceQuery`);
  for (const c of r.candidates) {
    let u: URL | null = null;
    try { u = new URL(c.url); } catch { err(`related ${k}: bad url ${c.url}`); }
    if (!u) continue;
    if (c.verified) {
      if (u.protocol !== "https:" || u.hostname !== "learn.microsoft.com") err(`related ${k}: verified url not on learn.microsoft.com: ${c.url}`);
      if (!c.title || !c.matchReason || !c.checkedAt) err(`related ${k}: verified candidate lacks title/matchReason/checkedAt`);
      if (c.locale === "ja-jp" && !u.pathname.startsWith("/ja-jp/")) err(`related ${k}: ja-jp locale but url is not /ja-jp/: ${c.url}`);
    }
  }
}

const state = readJson<CollectState | null>(`${root}/state/collect-state.json`, null);
if (state) {
  for (const [m, s] of Object.entries(state.backfill.months)) if (s.status === "complete" && s.ids.length !== s.totalCount) err(`state ${m}: complete but ${s.ids.length} != ${s.totalCount}`);
}
const runsDir = `${root}/runs`;
if (existsSync(runsDir)) {
  const last = readdirSync(runsDir).filter((f) => f.endsWith(".json")).sort().at(-1);
  if (last) {
    const r = readJson<RunReport>(`${runsDir}/${last}`);
    if (!r.consistent) err(`latest run report ${last} is inconsistent: ${r.consistencyNotes.join("; ")}`);
  }
}

if (errors.length) {
  console.error(errors.slice(0, 50).join("\n"));
  console.error(`validation failed: ${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`validation ok: ${items.length} items, ${summaries.size} summaries, ${related.size} related files`);
