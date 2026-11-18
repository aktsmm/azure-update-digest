import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runQuery, defaultQuery, matchedElsewhere, bulkRegistrationDays, type DigestItem } from "../src/lib/query.js";
import { classifyCategories, scoreImportance } from "../src/lib/classify.js";
import { stableStringify } from "../src/lib/stable.js";

const cats = JSON.parse(readFileSync("config/categories.json", "utf8"));
const imp = JSON.parse(readFileSync("config/importance.json", "utf8"));

const item = (key: string, createdJst: string, over: Partial<DigestItem> = {}): DigestItem => ({
  key, id: key, title: `t${key}`, titleJa: null, kind: "update", createdJst, modifiedJst: createdJst, status: null, tags: [], products: [], productCategories: [], categories: ["compute"],
  importance: { level: "normal", score: 0, topics: [] }, availabilities: [], availabilityDates: { general: null, preview: null, privatePreview: null },
  sourceUrl: "https://azure.microsoft.com/updates?id=" + key, summary: { state: "missing", text: null }, related: { status: "uninvestigated", items: [] }, fingerprint: "f", detailState: "ok", ...over,
});

const cov = [{ from: "2026-01-31T15:00:00Z", to: "2026-03-31T15:00:00Z", status: "complete" as const, totalCount: 3, uniqueIds: 3, recordedAt: "x" }];

describe("query", () => {
  const all = [
    item("1", "2028-02-29"), item("2", "2028-03-01", { categories: ["ai", "security"] }), item("3", "2026-02-28"),
    item("4", "2026-03-01", { categories: ["ai", "security"], importance: { level: "high", score: 10, topics: ["retirement"] } }),
  ];
  it("counts match the list and honour multiple categories and period ends", () => {
    const r = runQuery(all, { ...defaultQuery({ start: "2026-02-01", end: "2026-03-31" }), categories: ["ai"] }, cov);
    expect(r.items.map((i) => i.key)).toEqual(["4"]);
    expect(r.periodTotal).toBe(2);
    expect(r.coverage.status).toBe("complete");
    expect(Object.values(r.countsByImportance).reduce((a, b) => a + b, 0)).toBe(r.items.length);
    expect(r.highlights.map((i) => i.key)).toEqual(["4"]);
  });
  it("filters by kind and keeps counts consistent", () => {
    const kinds = [item("a", "2026-03-01", { kind: "ga" }), item("b", "2026-03-02", { kind: "retirement" }), item("c", "2026-03-03", { kind: "retirement" })];
    const r = runQuery(kinds, { ...defaultQuery({ start: "2026-03-01", end: "2026-03-31" }), kinds: ["retirement", "preview"] }, cov);
    expect(r.items.map((i) => i.key).sort()).toEqual(["b", "c"]);
    expect(r.periodTotal).toBe(3);
    expect(runQuery(kinds, defaultQuery({ start: "2026-03-01", end: "2026-03-31" }), cov).items).toHaveLength(3);
  });
  it("filters by one or more importance levels (empty = all) and keeps counts consistent", () => {
    const lv = (l: "high" | "notable" | "normal") => ({ level: l, score: 0, topics: [] as string[] });
    const set = [item("h", "2026-03-01", { importance: lv("high") }), item("n", "2026-03-02", { importance: lv("notable") }), item("o", "2026-03-03", { importance: lv("normal") })];
    const p = defaultQuery({ start: "2026-03-01", end: "2026-03-31" });
    const keys = (importance: ("high" | "notable" | "normal")[]) => runQuery(set, { ...p, importance }, cov).items.map((i) => i.key).sort();
    expect(keys([])).toEqual(["h", "n", "o"]);
    expect(keys(["high"])).toEqual(["h"]);
    expect(keys(["high", "notable"])).toEqual(["h", "n"]);
    expect(keys(["normal", "high"])).toEqual(["h", "o"]);
    const r = runQuery(set, { ...p, importance: ["notable"] }, cov);
    expect(r.periodTotal).toBe(3);
    expect(Object.values(r.countsByImportance).reduce((a, b) => a + b, 0)).toBe(r.items.length);
  });
  it("distinguishes not-fetched from zero", () => {
    const r = runQuery(all, defaultQuery({ start: "2025-01-01", end: "2025-01-31" }), cov);
    expect(r.items).toHaveLength(0);
    expect(r.coverage.status).toBe("not-fetched");
  });
  it("leap day is inside Feb 2028", () => {
    const r = runQuery(all, defaultQuery({ start: "2028-02-01", end: "2028-02-29" }), []);
    expect(r.items.map((i) => i.key)).toEqual(["1"]);
  });
  it("treats data as of the snapshot as complete for a period reaching into today", () => {
    const r = runQuery(all, defaultQuery({ start: "2026-03-01", end: "2026-04-30" }), cov, "2026-03-20T00:00:00Z");
    expect(r.coverage.status).toBe("complete");
    expect(r.coverage.note).toContain("データ時点");
  });
  it("availability mode keeps month granularity", () => {
    const a = item("9", "2026-01-01", { availabilities: [{ ring: "Retirement", year: 2026, month: "October" }] });
    const q = { ...defaultQuery({ start: "2026-10-31", end: "2026-11-05" }), mode: "availability" as const };
    expect(runQuery([a], q, []).items).toHaveLength(1);
    expect(runQuery([a], { ...q, period: { start: "2026-11-01", end: "2026-11-05" } }, []).items).toHaveLength(0);
  });
});

describe("classification", () => {
  it("maps to multiple display categories and falls back to other", () => {
    const base = { title: "x", tags: [], products: [], productCategories: [], availabilities: [], status: null };
    expect(classifyCategories({ ...base, productCategories: ["Compute", "Containers"] }, cats)).toEqual(["compute", "containers"]);
    expect(classifyCategories(base, cats)).toEqual(["other"]);
  });
  it("classifies integration / IoT / developer tools from productCategories and untagged titles from the title", () => {
    const base = { title: "x", tags: [], products: [], productCategories: [], availabilities: [], status: null };
    expect(classifyCategories({ ...base, productCategories: ["Integration"] }, cats)).toEqual(["integration"]);
    expect(classifyCategories({ ...base, productCategories: ["Internet of Things"] }, cats)).toEqual(["iot"]);
    expect(classifyCategories({ ...base, productCategories: ["DevOps"] }, cats)).toEqual(["devtools"]);
    expect(classifyCategories({ ...base, title: "Generally Available: SQL Server 2025" }, cats)).toEqual(["databases"]);
    expect(classifyCategories({ ...base, title: "Microsoft Marketplace multiparty offers" }, cats)).toEqual(["other"]);
  });
  it("scores retirement high and unknown rings as normal", () => {
    const base = { title: "Retirement: X will be retired on May 1, 2027", tags: ["Retirements"], products: [], productCategories: [], availabilities: [{ ring: "Retirement", year: 2027, month: "May" }], status: null };
    expect(scoreImportance(base, imp).level).toBe("high");
    const eff = { ...base, title: "Announcing: thing", tags: ["Announcement"], availabilities: [{ ring: "Effective", year: 2026, month: "October" }] };
    expect(scoreImportance(eff, imp)).toMatchObject({ score: 0, level: "normal" });
  });
});

describe("stable json", () => {
  it("is key-order independent", () => {
    expect(stableStringify({ b: 1, a: { d: 1, c: 2 } })).toBe(stableStringify({ a: { c: 2, d: 1 }, b: 1 }));
  });
});

describe("matchedElsewhere", () => {
  const aks = item("9", "2026-02-10", { title: "Auto scaling of ingestion limits", titleJa: "取り込み上限の自動スケール", products: ["Azure Kubernetes Service (AKS)", "Azure Monitor"], tags: ["Feature"], summary: { state: "generated", text: "Azure Monitor の取り込み上限を自動で調整します" } });
  it("names the product that matched when it is not visible in the title or summary", () => {
    expect(matchedElsewhere(aks, "kubernetes")).toEqual(["Azure Kubernetes Service (AKS)"]);
  });
  it("says nothing when the text is already visible, is empty, or does not match", () => {
    expect(matchedElsewhere(aks, "monitor")).toEqual([]);
    expect(matchedElsewhere(aks, "")).toEqual([]);
    expect(matchedElsewhere(aks, "  ")).toEqual([]);
    expect(matchedElsewhere(aks, "postgresql")).toEqual([]);
  });
});

describe("bulkRegistrationDays", () => {
  const day = (d: string, n: number, start = 0) => Array.from({ length: n }, (_, i) => item(`${d}-${start + i}`, d));
  const normal = [...day("2026-05-01", 6), ...day("2026-05-02", 7), ...day("2026-05-03", 8), ...day("2026-05-04", 5), ...day("2026-05-05", 9)];
  it("flags a day with a registration batch far above the usual", () => {
    const all = [...normal, ...day("2026-06-03", 130)];
    expect([...bulkRegistrationDays(all).entries()]).toEqual([["2026-06-03", 130]]);
  });
  it("does not flag a busy but ordinary day, nor small data sets", () => {
    expect(bulkRegistrationDays([...normal, ...day("2026-06-03", 30)]).size).toBe(0);
    expect(bulkRegistrationDays(day("2026-06-03", 10)).size).toBe(0);
    expect(bulkRegistrationDays([]).size).toBe(0);
  });
  it("finds the two batches in the real data and no other day", () => {
    const real = JSON.parse(readFileSync("data/normalized/items/2025-11.json", "utf8")).items.map((x: any) => item(x.canonicalKey, x.createdJst));
    const june = JSON.parse(readFileSync("data/normalized/items/2026-06.json", "utf8")).items.map((x: any) => item(x.canonicalKey, x.createdJst));
    const days = [...bulkRegistrationDays([...real, ...june]).keys()].sort();
    expect(days).toEqual(["2025-11-19", "2026-06-03"]);
  });
});