import { fingerprint } from "./stable.js";
import { parseInstant, toJstDate } from "./period.js";
import { classifyCategories, scoreImportance, type CategoryConfig, type ImportanceConfig } from "./classify.js";
import type { HistoryEntry, MrcAvailability, MrcItem, NormalizedItem, RawRecord } from "./types.js";

export interface RawFile {
  name: string;
  record: RawRecord;
}

interface Observation {
  fetchedAt: string;
  rawRef: string;
  isDetail: boolean;
  item: MrcItem;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const sorted = (a: string[] | undefined) => [...(a ?? [])].sort();

function sortAvail(a: MrcAvailability[] | undefined): MrcAvailability[] {
  return [...(a ?? [])].sort((x, y) => x.year - y.year || MONTHS.indexOf(x.month) - MONTHS.indexOf(y.month) || x.ring.localeCompare(y.ring));
}

function metaOf(i: MrcItem) {
  return {
    title: i.title,
    status: i.status ?? null,
    created: i.created,
    modified: i.modified,
    tags: sorted(i.tags),
    products: sorted(i.products),
    productCategories: sorted(i.productCategories),
    availabilities: sortAvail(i.availabilities),
    general: i.generalAvailabilityDate ?? null,
    preview: i.previewAvailabilityDate ?? null,
    privatePreview: i.privatePreviewAvailabilityDate ?? null,
  };
}

function observationsFrom(files: RawFile[]): { obs: Observation[]; detailFailures: Map<string, string> } {
  const obs: Observation[] = [];
  const detailFailures = new Map<string, string>();
  for (const { name, record } of files) {
    if (record.tool === "get_recent_azure_updates") {
      if (!record.ok) continue;
      const items = (record.response as { items?: MrcItem[] } | undefined)?.items ?? [];
      for (const item of items) obs.push({ fetchedAt: record.fetchedAt, rawRef: name, isDetail: false, item });
    } else {
      const id = String(record.args.id ?? "");
      if (!record.ok) {
        detailFailures.set(id, record.fetchedAt);
        continue;
      }
      const item = record.response as MrcItem | undefined;
      if (item?.id) {
        obs.push({ fetchedAt: record.fetchedAt, rawRef: name, isDetail: true, item });
        detailFailures.delete(id);
      }
    }
  }
  return { obs, detailFailures };
}

export function normalize(files: RawFile[], categoryCfg: CategoryConfig, importanceCfg: ImportanceConfig): NormalizedItem[] {
  const ordered = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const { obs, detailFailures } = observationsFrom(ordered);
  const groups = new Map<string, Observation[]>();
  for (const o of obs) {
    const key = o.item.baseId || o.item.id;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(o);
  }

  const out: NormalizedItem[] = [];
  for (const [key, list] of groups) {
    const ids = [...new Set(list.map((o) => o.item.id))].sort();
    const best = (pred: (o: Observation) => boolean) =>
      list.filter(pred).sort((a, b) => parseInstant(a.item.modified) - parseInstant(b.item.modified) || (a.fetchedAt < b.fetchedAt ? -1 : a.fetchedAt > b.fetchedAt ? 1 : 0)).at(-1);
    const latest = best(() => true)!;
    const latestListObs = best((o) => !o.isDetail && o.item.id === latest.item.id);
    const detailObs = best((o) => o.isDetail && o.item.id === latest.item.id && o.item.modified === latest.item.modified);

    const base = detailObs?.item ?? latest.item;
    let detailState: NormalizedItem["detailState"] = detailObs ? "ok" : "none";
    if (!detailObs && ids.some((id) => detailFailures.has(id))) detailState = "failed";

    const description = detailObs ? (detailObs.item.description ?? null) : (latestListObs?.item.description ?? latest.item.description ?? null);
    const descriptionSource: NormalizedItem["descriptionSource"] = detailObs ? "detail" : description !== null ? "list" : null;
    const meta = metaOf(base);
    const classifyInput = { title: meta.title, tags: meta.tags, products: meta.products, productCategories: meta.productCategories, availabilities: meta.availabilities, status: meta.status };

    const history: HistoryEntry[] = [];
    let prevMeta: ReturnType<typeof metaOf> | null = null;
    let prevMetaFp: string | null = null;
    let prevDescFp: string | null = null;
    const chrono = [...list].sort((a, b) => (a.fetchedAt < b.fetchedAt ? -1 : a.fetchedAt > b.fetchedAt ? 1 : a.rawRef < b.rawRef ? -1 : 1));
    for (const o of chrono) {
      const m = metaOf(o.item);
      const mfp = fingerprint(m);
      const dfp = o.isDetail ? fingerprint(o.item.description ?? null) : null;
      const metaChanged = mfp !== prevMetaFp;
      const descChanged = dfp !== null && dfp !== prevDescFp;
      if (metaChanged || descChanged) {
        const changed: string[] = [];
        if (prevMeta) {
          for (const k of Object.keys(m) as (keyof typeof m)[]) if (fingerprint(m[k]) !== fingerprint(prevMeta[k])) changed.push(k);
        } else changed.push("initial");
        if (descChanged && prevDescFp !== null) changed.push("description");
        history.push({
          fetchedAt: o.fetchedAt,
          fingerprint: fingerprint({ meta: m, description: o.isDetail ? (o.item.description ?? null) : null }),
          modifiedBefore: prevMeta?.modified ?? null,
          modifiedAfter: m.modified,
          changedFields: changed.sort(),
          rawRef: `${o.rawRef}#${o.item.id}`,
        });
      }
      prevMeta = m;
      prevMetaFp = mfp;
      if (dfp !== null) prevDescFp = dfp;
    }

    out.push({
      canonicalKey: key,
      ids,
      latestId: latest.item.id,
      title: meta.title,
      description,
      descriptionSource,
      detailState,
      created: meta.created,
      modified: meta.modified,
      createdJst: toJstDate(meta.created),
      modifiedJst: toJstDate(meta.modified),
      status: meta.status,
      tags: meta.tags,
      products: meta.products,
      productCategories: meta.productCategories,
      availabilities: meta.availabilities,
      availabilityDates: { general: meta.general, preview: meta.preview, privatePreview: meta.privatePreview },
      categories: classifyCategories(classifyInput, categoryCfg),
      importance: scoreImportance(classifyInput, importanceCfg),
      fingerprint: fingerprint({ meta, description }),
      sourceUrl: `https://azure.microsoft.com/updates?id=${latest.item.id}`,
      history,
    });
  }
  return out.sort((a, b) => parseInstant(b.created) - parseInstant(a.created) || (a.canonicalKey < b.canonicalKey ? -1 : 1));
}
