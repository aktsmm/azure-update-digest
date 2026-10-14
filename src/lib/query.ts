import { addDays, jstStartMs, monthBounds, parseInstant, periodBoundsMs, type DateBasis, type Period } from "./period.js";
import { periodCoverage, type PeriodCoverage } from "./coverage.js";
import type { CoverageInterval } from "./types.js";

/** Public, display-ready item (no MRC description). Shared by the site, counts, and future reports. */
export interface DigestItem {
  key: string;
  id: string;
  title: string;
  titleJa: string | null;
  createdJst: string;
  modifiedJst: string;
  status: string | null;
  tags: string[];
  products: string[];
  productCategories: string[];
  categories: string[];
  importance: { level: "high" | "notable" | "normal"; score: number; topics: string[] };
  availabilities: { ring: string; year: number; month: string }[];
  availabilityDates: { general: string | null; preview: string | null; privatePreview: string | null };
  sourceUrl: string;
  summary: { state: "generated" | "stale" | "missing"; text: string | null };
  related: { status: "verified" | "not-found" | "error" | "uninvestigated"; items: { title: string; url: string }[] };
  fingerprint: string;
  detailState: "ok" | "failed" | "none";
}

export type QueryMode = "dated" | "availability";

export interface Query {
  period: Period;
  basis: DateBasis;
  mode: QueryMode;
  categories: string[];
  importance: "all" | "high" | "notable-or-high";
  text: string;
  rings: string[];
}

export const defaultQuery = (period: Period): Query => ({ period, basis: "created", mode: "dated", categories: [], importance: "all", text: "", rings: [] });

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function availabilityMonthOverlaps(a: { year: number; month: string }, p: Period): boolean {
  const mi = MONTHS.indexOf(a.month);
  if (mi < 0) return false;
  const ym = `${a.year}-${String(mi + 1).padStart(2, "0")}`;
  const b = monthBounds(ym);
  return b.start <= p.end && b.end >= p.start;
}

export function inQueryPeriod(item: DigestItem, q: Query): boolean {
  if (q.mode === "availability") {
    return item.availabilities.some((a) => availabilityMonthOverlaps(a, q.period) && (q.rings.length === 0 || q.rings.includes(a.ring)));
  }
  const d = q.basis === "created" ? item.createdJst : item.modifiedJst;
  return d >= q.period.start && d <= q.period.end;
}

export function matchesFilters(item: DigestItem, q: Query): boolean {
  if (q.categories.length && !q.categories.some((c) => item.categories.includes(c))) return false;
  if (q.importance === "high" && item.importance.level !== "high") return false;
  if (q.importance === "notable-or-high" && item.importance.level === "normal") return false;
  const t = q.text.trim().toLowerCase();
  if (t) {
    const hay = [item.title, item.titleJa ?? "", item.summary.text ?? "", item.products.join(" "), item.tags.join(" "), item.productCategories.join(" ")].join("\n").toLowerCase();
    if (!t.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

export function sortItems(items: DigestItem[], q: Query): DigestItem[] {
  const key = (i: DigestItem) => (q.basis === "modified" ? i.modifiedJst : i.createdJst);
  return [...items].sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : a.key < b.key ? -1 : 1));
}

export function highlightOrder(a: DigestItem, b: DigestItem): number {
  return b.importance.score - a.importance.score || (a.createdJst < b.createdJst ? 1 : a.createdJst > b.createdJst ? -1 : 0) || (a.key < b.key ? -1 : 1);
}

export interface QueryResult {
  query: Query;
  coverage: PeriodCoverage & { note?: string };
  /** every item in the period before category/text filters */
  periodTotal: number;
  items: DigestItem[];
  highlights: DigestItem[];
  countsByCategory: Record<string, number>;
  countsByImportance: Record<string, number>;
}

export function runQuery(all: DigestItem[], q: Query, coverage: CoverageInterval[], asOf: string | null = null, highlightLimit = 8): QueryResult {
  const inPeriod = all.filter((i) => inQueryPeriod(i, q));
  const { startMs, endExclusiveMs } = periodBoundsMs(q.period);
  let cov: PeriodCoverage & { note?: string };
  if (q.mode === "availability") {
    cov = { status: "partial", coveredRanges: [], note: "提供・廃止予定は取得済みの更新のみが対象です（月単位の時期は日付に変換しません）" };
  } else {
    cov = periodCoverage(coverage, startMs, endExclusiveMs);
    const asOfMs = asOf ? parseInstant(asOf) : null;
    if (cov.status !== "complete" && asOfMs !== null && asOfMs > startMs && asOfMs < endExclusiveMs) {
      const upToNow = periodCoverage(coverage, startMs, asOfMs);
      if (upToNow.status === "complete") cov = { status: "complete", coveredRanges: cov.coveredRanges, note: `データ時点（${asOf} UTC）までの全件です。それ以降の更新は未反映です` };
    }
    if (q.basis === "modified" && cov.status === "complete") cov = { ...cov, status: "partial", note: "更新日基準は、取得済みの更新のみが対象です" };
  }
  const items = sortItems(inPeriod.filter((i) => matchesFilters(i, q)), q);
  const countsByCategory: Record<string, number> = {};
  const countsByImportance: Record<string, number> = { high: 0, notable: 0, normal: 0 };
  for (const i of items) {
    for (const c of i.categories) countsByCategory[c] = (countsByCategory[c] ?? 0) + 1;
    countsByImportance[i.importance.level] = (countsByImportance[i.importance.level] ?? 0) + 1;
  }
  const highlights = items.filter((i) => i.importance.level === "high").sort(highlightOrder).slice(0, highlightLimit);
  return { query: q, coverage: cov, periodTotal: inPeriod.length, items, highlights, countsByCategory, countsByImportance };
}

export { addDays, jstStartMs };
