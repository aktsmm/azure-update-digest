import { describe, expect, it } from "vitest";
import { buildApi } from "../src/lib/api.js";
import type { DigestItem } from "../src/lib/query.js";
import type { SiteMeta } from "../src/lib/site-data.js";

const item = (key: string, createdJst: string, categories: string[]): DigestItem => ({
  key, id: key, title: `t${key}`, createdJst, modifiedJst: createdJst, status: null, tags: [], products: [], productCategories: [], categories,
  importance: { level: "normal", score: 0, topics: [] }, availabilities: [], availabilityDates: { general: null, preview: null, privatePreview: null },
  sourceUrl: `https://azure.microsoft.com/updates?id=${key}`, summary: { state: "missing", text: null }, related: { status: "uninvestigated", items: [] }, fingerprint: "f", detailState: "ok",
});

const meta: SiteMeta = {
  schema: 1, snapshotAt: "2026-10-14T12:00:00Z",
  backfill: { complete: true, completedAt: null, months: [{ month: "2026-10", status: "complete", totalCount: 3, uniqueIds: 3, pages: 1 }] },
  coverage: {} as SiteMeta["coverage"],
  categories: [{ id: "networking", label: "Networking" }, { id: "ai", label: "AI" }], importanceLevels: [], itemCount: 3, attribution: "attr",
};

describe("buildApi", () => {
  const items = [item("1", "2026-10-14", ["networking"]), item("2", "2026-09-20", ["networking", "ai"]), item("3", "2026-08-01", [])];
  const slides = new Map([["1", { slide: { key: "1" }, pdf: true }]]);
  const files = buildApi(items, meta, slides);
  const get = (p: string) => files.find((f) => f.path === p)?.body as any;

  it("is deterministic and sorted", () => {
    expect(buildApi(items, meta, slides)).toEqual(files);
    expect(files.map((f) => f.path)).toEqual([...files.map((f) => f.path)].sort());
  });
  it("builds index, months, updates, categories and latest", () => {
    expect(get("api/v1/index.json").months.map((m: any) => m.month)).toEqual(["2026-10", "2026-09", "2026-08"]);
    expect(get("api/v1/months/2026-09.json").items).toHaveLength(1);
    expect(get("api/v1/categories/networking.json").count).toBe(2);
    expect(get("api/v1/categories/ai.json").items[0].key).toBe("2");
    expect(get("api/v1/latest.json").period).toEqual({ start: "2026-09-15", end: "2026-10-14" });
    expect(get("api/v1/latest.json").items.map((i: any) => i.key)).toEqual(["1", "2"]);
  });
  it("links slide and PDF only when they exist", () => {
    expect(get("api/v1/updates/1.json").item.urls.slidePdf).toBe("pdf/1.pdf");
    expect(get("api/v1/updates/1.json").slide).toEqual({ key: "1" });
    expect(get("api/v1/updates/2.json").item.urls.slide).toBeUndefined();
    expect(get("api/v1/updates/2.json").slide).toBeNull();
  });
  it("never exposes internal detailState", () => {
    expect(JSON.stringify(files)).not.toContain("detailState");
  });
});
