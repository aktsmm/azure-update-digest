import { describe, expect, it } from "vitest";
import { runCollect, type McpLike, type CollectContext } from "../src/lib/collect.js";
import { MemoryStore } from "../src/lib/store.js";
import { normalize } from "../src/lib/normalize.js";
import { periodCoverage } from "../src/lib/coverage.js";
import type { MrcItem } from "../src/lib/types.js";
import { readFileSync } from "node:fs";

const categories = JSON.parse(readFileSync("config/categories.json", "utf8"));
const importance = JSON.parse(readFileSync("config/importance.json", "utf8"));

class FakeMrc implements McpLike {
  requestCount = 0;
  failDetailFor = new Set<string>();
  failListAt: number | null = null;
  constructor(public items: MrcItem[]) {}
  async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    this.requestCount++;
    if (name === "get_azure_update_by_id") {
      if (this.failDetailFor.has(String(args.id))) throw new Error("boom");
      const it = this.items.find((i) => i.id === args.id);
      if (!it) throw new Error("not found");
      return { ...it, description: `FULL ${it.description}` } as T;
    }
    const f = String(args.filter ?? "");
    const ge = (field: string) => /\b(created|modified) ge (\S+)/.exec(f)?.[1] === field ? Date.parse(/\b(?:created|modified) ge (\S+)/.exec(f)![1]!) : null;
    const lt = (field: string) => /\b(created|modified) lt (\S+)/.exec(f)?.[1] === field ? Date.parse(/\b(?:created|modified) lt (\S+)/.exec(f)![1]!) : null;
    const field = /\b(created|modified) ge/.exec(f)![1] as "created" | "modified";
    const lo = ge(field)!, hi = lt(field)!;
    const matched = this.items.filter((i) => { const t = Date.parse(i[field]); return t >= lo && t < hi; }).sort((a, b) => Number(a.id) - Number(b.id));
    const skip = Number(args.skip ?? 0);
    if (this.failListAt !== null && skip === this.failListAt) { this.failListAt = null; throw new Error("transient"); }
    const page = matched.slice(skip, skip + 50);
    return { items: page.map((i) => ({ ...i, description: i.description?.slice(0, 10) })), totalCount: matched.length, limit: 50, offset: skip, hasMore: skip + 50 < matched.length, returnedCount: page.length } as T;
  }
}

const mk = (n: number, created: string, extra: Partial<MrcItem> = {}): MrcItem => ({
  id: String(1000 + n), baseId: String(1000 + n), title: `Generally Available: thing ${n}`, description: `desc ${n} long description`,
  created, modified: created, products: ["Azure Functions"], productCategories: ["Compute"], tags: ["Features"],
  availabilities: [{ ring: "General Availability", year: 2026, month: "October" }], status: "Launched", ...extra,
});

const config = { backfillMonths: 2, dailySweepOverlapHours: 24, limits: { maxPagesPerRun: 100, maxDetailsPerRun: 1000, maxSecondsPerRun: 1000 } };

function ctxOf(client: FakeMrc, store: MemoryStore, now: { t: number }, over: Partial<typeof config> = {}): CollectContext {
  return { client, store, config: { ...config, ...over }, categories, importance, clock: () => now.t };
}

// 2026-10-14T00:00:00Z
const NOW = Date.parse("2026-10-14T00:00:00Z");

describe("collect", () => {
  it("scans across page boundaries, balances totalCount/unique ids, completes backfill, and is idempotent", async () => {
    const items: MrcItem[] = [];
    for (let i = 0; i < 137; i++) items.push(mk(i, `2026-10-${String(1 + (i % 12)).padStart(2, "0")}T0${i % 9}:00:00.1234567Z`));
    for (let i = 200; i < 260; i++) items.push(mk(i, "2026-09-15T01:00:00Z"));
    // JST boundary: Aug 31 15:00Z is Sep 1 JST (inside the Sep window), Aug 31 14:59:59Z is outside
    items.push(mk(300, "2026-08-31T15:00:00Z"), mk(301, "2026-08-31T14:59:59Z"));
    const srv = new FakeMrc(items);
    const store = new MemoryStore();
    const now = { t: NOW };
    const r1 = await runCollect(ctxOf(srv, store, now), "all");
    const oct = r1.months.find((m) => m.month === "2026-10")!;
    expect(oct.status).toBe("complete");
    expect(oct.totalCount).toBe(137);
    expect(oct.uniqueIds).toBe(137);
    expect(oct.pages).toBe(3);
    expect(r1.backfill.complete).toBe(true);
    expect(r1.consistent).toBe(true);
    expect(r1.details.failed).toEqual([]);
    expect(r1.sweep?.status).toBe("complete");
    const sep = r1.months.find((m) => m.month === "2026-09")!;
    expect(sep.uniqueIds).toBe(61); // 60 + the JST-boundary item
    const norm = normalize(store.readAllRaw(), categories, importance);
    expect(norm.every((i) => i.detailState === "ok")).toBe(true);
    expect(norm.find((i) => i.canonicalKey === "1301")).toBeUndefined();

    // Rerun with identical upstream data: normalized output identical, state-only differences
    const before = JSON.stringify(norm);
    now.t += 3600_000;
    const r2 = await runCollect(ctxOf(srv, store, now), "all");
    expect(r2.details.attempted).toBe(0);
    expect(JSON.stringify(normalize(store.readAllRaw(), categories, importance))).toBe(before);
  });

  it("records partial when totalCount and unique ids disagree, and does not report 0 for unfetched ranges", async () => {
    const items = [mk(1, "2026-10-05T01:00:00Z")];
    const srv = new FakeMrc(items);
    const orig = srv.callTool.bind(srv);
    srv.callTool = (async (n: string, a: Record<string, unknown>) => {
      const r = (await orig(n, a)) as { totalCount?: number };
      if (n === "get_recent_azure_updates") r.totalCount = 5;
      return r;
    }) as never;
    const store = new MemoryStore();
    const rep = await runCollect(ctxOf(srv, store, { t: NOW }), "backfill");
    expect(rep.months.find((m) => m.month === "2026-10")!.status).toBe("partial");
    expect(rep.backfill.complete).toBe(false);
    const cov = periodCoverage(store.readState().coverage, Date.parse("2026-10-01T00:00:00Z"), NOW);
    expect(cov.status).toBe("partial");
    const none = periodCoverage([], 0, 1000);
    expect(none.status).toBe("not-fetched");
  });

  it("resumes after hitting the page limit and a transient failure", async () => {
    const items: MrcItem[] = [];
    for (let i = 0; i < 120; i++) items.push(mk(i, "2026-10-05T01:00:00Z"));
    const srv = new FakeMrc(items);
    const store = new MemoryStore();
    const now = { t: NOW };
    const r1 = await runCollect(ctxOf(srv, store, now, { limits: { maxPagesPerRun: 2, maxDetailsPerRun: 10, maxSecondsPerRun: 1000 } }), "backfill");
    expect(r1.months.find((m) => m.month === "2026-10")!.status).toBe("in-progress");
    expect(r1.limits.hit).toBe("maxPagesPerRun");
    expect(r1.details.attempted).toBe(10);
    srv.failListAt = 100;
    const r2 = await runCollect(ctxOf(srv, store, now, { limits: { maxPagesPerRun: 5, maxDetailsPerRun: 200, maxSecondsPerRun: 1000 } }), "backfill");
    expect(r2.errors.join()).toContain("transient");
    const r3 = await runCollect(ctxOf(srv, store, now, { limits: { maxPagesPerRun: 5, maxDetailsPerRun: 200, maxSecondsPerRun: 1000 } }), "backfill");
    const m = r3.months.find((x) => x.month === "2026-10")!;
    expect(m.status).toBe("complete");
    expect(m.uniqueIds).toBe(120);
  });

  it("tracks modified changes in history and re-fetches detail", async () => {
    const it0 = mk(1, "2026-10-05T01:00:00Z");
    const srv = new FakeMrc([it0]);
    const store = new MemoryStore();
    const now = { t: NOW };
    await runCollect(ctxOf(srv, store, now), "all");
    srv.items = [{ ...it0, modified: "2026-10-13T01:00:00Z", title: "Generally Available: thing 1 (updated)" }];
    now.t = NOW + 24 * 3600_000;
    const rep = await runCollect(ctxOf(srv, store, now), "sweep");
    expect(rep.sweep?.status).toBe("complete");
    const n = normalize(store.readAllRaw(), categories, importance)[0]!;
    expect(n.title).toContain("updated");
    expect(n.detailState).toBe("ok");
    const last = n.history.at(-1)!;
    expect(last.modifiedBefore).toBe("2026-10-05T01:00:00Z");
    expect(last.modifiedAfter).toBe("2026-10-13T01:00:00Z");
    expect(last.changedFields).toContain("title");
  });

  it("records failed detail ids and keeps going", async () => {
    const srv = new FakeMrc([mk(1, "2026-10-05T01:00:00Z"), mk(2, "2026-10-06T01:00:00Z")]);
    srv.failDetailFor.add("1002");
    const rep = await runCollect(ctxOf(srv, new MemoryStore(), { t: NOW }), "backfill");
    expect(rep.details.failed).toEqual(["1002"]);
    expect(rep.details.succeeded).toEqual(["1001"]);
    expect(rep.detailStateCounts).toEqual({ ok: 1, failed: 1 });
  });
});
