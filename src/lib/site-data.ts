import { existsSync, readdirSync } from "node:fs";
import { readJson } from "./stable.js";
import { buildDigestItems, type RelatedFile, type SummaryFile } from "./digest.js";
import type { CollectState } from "./store.js";
import type { NormalizedItem } from "./types.js";
import type { DigestItem } from "./query.js";
import type { Configs } from "./config.js";

export interface SiteMeta {
  schema: 1;
  /** Data snapshot time = end of contiguous coverage (deterministic for a given data set). */
  snapshotAt: string | null;
  backfill: { complete: boolean; completedAt: string | null; months: { month: string; status: string; totalCount: number | null; uniqueIds: number; pages: number }[] };
  coverage: CollectState["coverage"];
  categories: { id: string; label: string }[];
  importanceLevels: { id: string; label: string }[];
  itemCount: number;
  attribution: string;
}

export function loadNormalized(dataRoot: string): NormalizedItem[] {
  const dir = `${dataRoot}/normalized/items`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => readJson<{ items: NormalizedItem[] }>(`${dir}/${f}`).items);
}

function loadDir<T extends { canonicalKey: string }>(dir: string): Map<string, T> {
  const m = new Map<string, T>();
  if (!existsSync(dir)) return m;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const v = readJson<T>(`${dir}/${f}`);
    m.set(v.canonicalKey, v);
  }
  return m;
}

export const loadSummaries = (root: string) => loadDir<SummaryFile>(`${root}/summaries`);
export const loadRelated = (root: string) => loadDir<RelatedFile>(`${root}/related`);

export function loadSiteData(dataRoot: string, cfg: Configs): { items: DigestItem[]; meta: SiteMeta } {
  const normalized = loadNormalized(dataRoot);
  const items = buildDigestItems(normalized, loadSummaries(dataRoot), loadRelated(dataRoot)).sort((a, b) => (a.createdJst < b.createdJst ? 1 : a.createdJst > b.createdJst ? -1 : a.key < b.key ? -1 : 1));
  const state = readJson<CollectState>(`${dataRoot}/state/collect-state.json`, { schema: 1, backfill: { months: {}, completedAt: null, targetMonths: [] }, coveredThrough: null, coverage: [] });
  const months = state.backfill.targetMonths.map((m) => {
    const s = state.backfill.months[m];
    return { month: m, status: s?.status ?? "not-started", totalCount: s?.totalCount ?? null, uniqueIds: s?.ids.length ?? 0, pages: s?.pages ?? 0 };
  });
  const meta: SiteMeta = {
    schema: 1,
    snapshotAt: state.coveredThrough,
    backfill: { complete: !!state.backfill.completedAt, completedAt: state.backfill.completedAt, months },
    coverage: state.coverage,
    categories: cfg.categories.categories.map((c) => ({ id: c.id, label: c.label })),
    importanceLevels: cfg.importance.levels.map((l) => ({ id: l.id, label: l.label })),
    itemCount: items.length,
    attribution: "更新情報の出典: Microsoft Release Communications (https://www.microsoft.com/releasecommunications)。要約は独自生成で、原文全文は転載していません。",
  };
  return { items, meta };
}
