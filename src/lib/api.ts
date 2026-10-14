import type { DigestItem } from "./query.js";
import type { SiteMeta } from "./site-data.js";
import { addDays, toJstDate } from "./period.js";

export interface ApiFile { path: string; body: unknown }
export interface ApiSlideInfo { slide: unknown; pdf: boolean }

export const API_VERSION = "v1";
const BASE = `api/${API_VERSION}`;

function publicItem(i: DigestItem, slides: Map<string, ApiSlideInfo>) {
  const { detailState: _detail, ...rest } = i;
  const s = slides.get(i.key);
  return {
    ...rest,
    urls: {
      self: `${BASE}/updates/${i.key}.json`,
      source: i.sourceUrl,
      ...(s ? { slide: `slides/${i.key}.json` } : {}),
      ...(s?.pdf ? { slidePdf: `pdf/${i.key}.pdf` } : {}),
    },
  };
}

const byNewest = (a: DigestItem, b: DigestItem) => (a.createdJst < b.createdJst ? 1 : a.createdJst > b.createdJst ? -1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** Builds the static JSON API (served from GitHub Pages). Pure and deterministic: same input, same files. */
export function buildApi(items: DigestItem[], meta: SiteMeta, slides: Map<string, ApiSlideInfo>): ApiFile[] {
  const files: ApiFile[] = [];
  const sorted = [...items].sort(byNewest);
  const months = new Map<string, DigestItem[]>();
  for (const i of sorted) {
    const m = i.createdJst.slice(0, 7);
    (months.get(m) ?? months.set(m, []).get(m)!).push(i);
  }
  const monthStatus = new Map(meta.backfill.months.map((m) => [m.month, m.status]));
  const monthKeys = [...months.keys()].sort().reverse();

  files.push({
    path: `${BASE}/index.json`,
    body: {
      schema: 1,
      apiVersion: API_VERSION,
      snapshotAt: meta.snapshotAt,
      itemCount: sorted.length,
      slideCount: slides.size,
      attribution: meta.attribution,
      license: { name: "CC BY-NC-SA 4.0", spdx: "CC-BY-NC-SA-4.0", url: "https://creativecommons.org/licenses/by-nc-sa/4.0/", author: "yamapan (aktsmm)", commercialUse: false, excludes: "Microsoft Release Communications and Microsoft Learn content remain Microsoft's" },
      notes: [
        "Static JSON files; there is no query endpoint. Filter on the client side.",
        "Original announcement text is not republished. Summaries and slides are written in Japanese from Microsoft Release Communications metadata and Microsoft Learn; each slide claim carries its evidence URLs.",
        "Dates are JST calendar dates. Availability (GA / Preview / retirement) stays at month granularity as published.",
        "A month with coverage other than complete may be missing updates; do not read a short list as zero.",
      ],
      categories: meta.categories,
      importanceLevels: meta.importanceLevels,
      months: monthKeys.map((m) => ({ month: m, count: months.get(m)!.length, coverage: monthStatus.get(m) ?? "daily", url: `${BASE}/months/${m}.json` })),
      endpoints: {
        latest: `${BASE}/latest.json`,
        month: `${BASE}/months/{YYYY-MM}.json`,
        update: `${BASE}/updates/{id}.json`,
        category: `${BASE}/categories/{category}.json`,
        slide: "slides/{id}.json",
        slidePdf: "pdf/{id}.pdf",
        slideIndex: "data/slides.json",
      },
    },
  });

  for (const m of monthKeys) {
    const list = months.get(m)!;
    files.push({ path: `${BASE}/months/${m}.json`, body: { schema: 1, month: m, coverage: monthStatus.get(m) ?? "daily", count: list.length, items: list.map((i) => publicItem(i, slides)) } });
  }

  for (const i of sorted) {
    files.push({ path: `${BASE}/updates/${i.key}.json`, body: { schema: 1, item: publicItem(i, slides), slide: slides.get(i.key)?.slide ?? null } });
  }

  for (const c of meta.categories) {
    const list = sorted.filter((i) => i.categories.includes(c.id));
    files.push({ path: `${BASE}/categories/${c.id}.json`, body: { schema: 1, category: c, count: list.length, items: list.map((i) => ({ key: i.key, title: i.title, createdJst: i.createdJst, importance: i.importance.level, url: `${BASE}/updates/${i.key}.json` })) } });
  }

  const end = meta.snapshotAt ? toJstDate(meta.snapshotAt) : null;
  const start = end ? addDays(end, -29) : null;
  const latest = end && start ? sorted.filter((i) => i.createdJst >= start && i.createdJst <= end) : [];
  files.push({ path: `${BASE}/latest.json`, body: { schema: 1, period: end && start ? { start, end } : null, basis: "created", count: latest.length, items: latest.map((i) => publicItem(i, slides)) } });

  return files.sort((a, b) => (a.path < b.path ? -1 : 1));
}
