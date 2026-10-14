import type { NormalizedItem } from "./types.js";
import type { DigestItem } from "./query.js";

export interface SummaryFile {
  schema: 1;
  canonicalKey: string;
  sourceFingerprint: string;
  summaryJa: string;
  /** Natural Japanese headline (noun-ending), shown above the original English title. */
  titleJa?: string;
  generatedBy: string;
  generatedAt: string;
}

export interface RelatedCandidate {
  url: string;
  title: string;
  verified: boolean;
  locale: string;
  matchReason: string;
  checkedAt: string;
}

export interface RelatedFile {
  schema: 1;
  canonicalKey: string;
  status: "verified" | "not-found" | "error" | "uninvestigated";
  sourceQuery: string;
  checkedAt: string;
  candidates: RelatedCandidate[];
}

export const MAX_RELATED = 3;

export function buildDigestItems(items: NormalizedItem[], summaries: Map<string, SummaryFile>, related: Map<string, RelatedFile>): DigestItem[] {
  return items.map((i) => {
    const s = summaries.get(i.canonicalKey);
    const rel = related.get(i.canonicalKey);
    const verified = (rel?.candidates ?? []).filter((c) => c.verified).slice(0, MAX_RELATED);
    return {
      key: i.canonicalKey,
      id: i.latestId,
      title: i.title,
      titleJa: s && s.sourceFingerprint === i.fingerprint ? (s.titleJa ?? null) : null,
      createdJst: i.createdJst,
      modifiedJst: i.modifiedJst,
      status: i.status,
      tags: i.tags,
      products: i.products,
      productCategories: i.productCategories,
      categories: i.categories,
      importance: { level: i.importance.level, score: i.importance.score, topics: i.importance.topics },
      availabilities: i.availabilities,
      availabilityDates: i.availabilityDates,
      sourceUrl: i.sourceUrl,
      summary: s ? (s.sourceFingerprint === i.fingerprint ? { state: "generated", text: s.summaryJa } : { state: "stale", text: null }) : { state: "missing", text: null },
      related: { status: rel ? (verified.length > 0 ? "verified" : rel.status === "verified" ? "not-found" : rel.status) : "uninvestigated", items: verified.map((c) => ({ title: c.title, url: c.url })) },
      fingerprint: i.fingerprint,
      detailState: i.detailState,
    };
  });
}
