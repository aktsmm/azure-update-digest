import { monthBounds, parseInstant, recentMonths, toIsoSeconds } from "./period.js";
import { dedupeIntervals } from "./coverage.js";
import { normalize } from "./normalize.js";
import type { CategoryConfig, ImportanceConfig } from "./classify.js";
import type { MonthScanState, Store, CollectState } from "./store.js";
import type { CoverageInterval, MrcListResponse, RawRecord, MrcItem } from "./types.js";

export interface McpLike {
  callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T>;
  requestCount: number;
}

export interface CollectConfig {
  backfillMonths: number;
  dailySweepOverlapHours: number;
  limits: { maxPagesPerRun: number; maxDetailsPerRun: number; maxSecondsPerRun: number };
}

export interface CollectContext {
  client: McpLike;
  store: Store;
  config: CollectConfig;
  categories: CategoryConfig;
  importance: ImportanceConfig;
  clock?: () => number;
  log?: (m: string) => void;
}

export interface MonthReport {
  month: string;
  status: "complete" | "partial" | "in-progress" | "failed" | "not-started";
  totalCount: number | null;
  uniqueIds: number;
  pages: number;
  note?: string;
}

export interface RunReport {
  runId: string;
  mode: string;
  startedAt: string;
  finishedAt: string;
  cutoff: string;
  months: MonthReport[];
  sweep: { status: "complete" | "partial" | "failed" | "skipped"; from: string | null; to: string | null; totalCount: number | null; uniqueIds: number; pages: number; note?: string } | null;
  details: { attempted: number; succeeded: string[]; failed: string[]; pendingAfter: number };
  statusCounts: Record<string, number>;
  detailStateCounts: Record<string, number>;
  backfill: { complete: boolean; completedMonths: string[]; pendingMonths: string[] };
  limits: { pagesUsed: number; pagesMax: number; hit: string | null };
  mrcRequests: number;
  errors: string[];
  consistent: boolean;
  consistencyNotes: string[];
}

interface Budget {
  pages: number;
  start: number;
  hit: string | null;
}

const LIST_TOOL = "get_recent_azure_updates" as const;
const DETAIL_TOOL = "get_azure_update_by_id" as const;
const MAX_RESCANS = 2;

function budgetLeft(ctx: CollectContext, b: Budget): boolean {
  const now = (ctx.clock ?? Date.now)();
  if (b.pages >= ctx.config.limits.maxPagesPerRun) {
    b.hit = "maxPagesPerRun";
    return false;
  }
  if ((now - b.start) / 1000 >= ctx.config.limits.maxSecondsPerRun) {
    b.hit = "maxSecondsPerRun";
    return false;
  }
  return true;
}

function isListResponse(r: unknown): r is MrcListResponse {
  const x = r as MrcListResponse;
  return !!x && Array.isArray(x.items) && typeof x.totalCount === "number";
}

interface ScanResult {
  status: "complete" | "partial" | "in-progress" | "failed";
  totalCount: number | null;
  ids: string[];
  pages: number;
  nextOffset: number;
  note?: string;
}

/** Paged scan of one filter window with resume support and totalCount-drift rescans. */
async function scan(ctx: CollectContext, budget: Budget, filter: string, scanKey: string, resume: { nextOffset: number; ids: string[]; totalCount: number | null; rescans: number } | null, errors: string[]): Promise<ScanResult & { rescans: number }> {
  const now = () => new Date((ctx.clock ?? Date.now)()).toISOString();
  let offset = resume?.nextOffset ?? 0;
  let ids = new Set(resume?.ids ?? []);
  let total = resume?.totalCount ?? null;
  let rescans = resume?.rescans ?? 0;
  let pages = 0;
  for (;;) {
    if (!budgetLeft(ctx, budget)) return { status: "in-progress", totalCount: total, ids: [...ids].sort(), pages, nextOffset: offset, rescans, note: `stopped: ${budget.hit}` };
    const args: Record<string, unknown> = { filter, skip: offset };
    const fetchedAt = now();
    let rec: RawRecord;
    let r: unknown;
    try {
      r = await ctx.client.callTool(LIST_TOOL, args);
      if (!isListResponse(r)) throw new Error("unexpected list response shape");
      rec = { schema: 1, tool: LIST_TOOL, args, fetchedAt, ok: true, response: r, scan: scanKey };
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`${scanKey} offset=${offset}: ${msg}`);
      ctx.store.writeRaw({ schema: 1, tool: LIST_TOOL, args, fetchedAt, ok: false, error: msg, scan: scanKey }, `list_${scanKey}_o${offset}_err`);
      return { status: "failed", totalCount: total, ids: [...ids].sort(), pages, nextOffset: offset, rescans, note: msg };
    }
    const resp = r as MrcListResponse;
    ctx.store.writeRaw(rec, `list_${scanKey}_o${offset}`);
    budget.pages++;
    pages++;
    if (total !== null && resp.totalCount !== total && offset > 0) {
      if (rescans >= MAX_RESCANS) return { status: "partial", totalCount: resp.totalCount, ids: [...ids].sort(), pages, nextOffset: 0, rescans, note: "totalCount drifted during scan" };
      rescans++;
      ids = new Set();
      offset = 0;
      total = null;
      continue;
    }
    total = resp.totalCount;
    for (const i of resp.items) ids.add(i.id);
    offset += resp.items.length;
    if (!resp.hasMore || resp.items.length === 0) break;
  }
  const unique = ids.size;
  // baseId grouping may legitimately merge several ids; compare against distinct ids seen
  return { status: unique === total ? "complete" : "partial", totalCount: total, ids: [...ids].sort(), pages, nextOffset: offset, rescans, note: unique === total ? undefined : `unique ids ${unique} != totalCount ${total}` };
}

function addCoverage(state: CollectState, c: CoverageInterval) {
  state.coverage = dedupeIntervals([...state.coverage, c]);
}

export async function runCollect(ctx: CollectContext, mode: "backfill" | "sweep" | "all"): Promise<RunReport> {
  const clock = ctx.clock ?? Date.now;
  const startMs = clock();
  const cutoffMs = Math.floor(startMs / 1000) * 1000;
  const cutoff = toIsoSeconds(cutoffMs);
  const runId = new Date(startMs).toISOString().replace(/[-:.]/g, "");
  const state = ctx.store.readState();
  const budget: Budget = { pages: 0, start: startMs, hit: null };
  const errors: string[] = [];
  const monthReports: MonthReport[] = [];
  let sweepReport: RunReport["sweep"] = null;

  if (mode === "backfill" || mode === "all") {
    if (state.backfill.targetMonths.length === 0) state.backfill.targetMonths = recentMonths(startMs, ctx.config.backfillMonths);
    const order = [...state.backfill.targetMonths].reverse();
    for (const month of order) {
      let st: MonthScanState | undefined = state.backfill.months[month];
      if (st?.status === "complete") {
        monthReports.push({ month, status: "complete", totalCount: st.totalCount, uniqueIds: st.ids.length, pages: st.pages });
        continue;
      }
      const b = monthBounds(month);
      if (!st) st = { status: "in-progress", cutoff, nextOffset: 0, pages: 0, totalCount: null, ids: [], rescans: 0 };
      if (st.status === "partial") st = { ...st, status: "in-progress", nextOffset: 0, ids: [], totalCount: null };
      const toMs = Math.min(b.endExclusiveMs, parseInstant(st.cutoff));
      if (toMs <= b.startMs) continue;
      const from = toIsoSeconds(b.startMs);
      const to = toIsoSeconds(toMs);
      const filter = `created ge ${from} and created lt ${to}`;
      if (!budgetLeft(ctx, budget)) {
        state.backfill.months[month] = st;
        monthReports.push({ month, status: st.nextOffset > 0 ? "in-progress" : "not-started", totalCount: st.totalCount, uniqueIds: st.ids.length, pages: st.pages, note: `deferred: ${budget.hit}` });
        continue;
      }
      ctx.log?.(`scan ${month} ${filter} from offset ${st.nextOffset}`);
      const res = await scan(ctx, budget, filter, month, st, errors);
      const next: MonthScanState = {
        status: res.status === "complete" ? "complete" : res.status === "partial" ? "partial" : "in-progress",
        cutoff: st.cutoff,
        nextOffset: res.nextOffset,
        pages: st.pages + res.pages,
        totalCount: res.totalCount,
        ids: res.ids,
        rescans: res.rescans,
      };
      state.backfill.months[month] = next;
      if (res.status === "complete" || res.status === "partial") {
        addCoverage(state, { from, to, status: res.status, totalCount: res.totalCount, uniqueIds: res.ids.length, recordedAt: toIsoSeconds(clock()), note: res.note });
      }
      monthReports.push({ month, status: res.status, totalCount: res.totalCount, uniqueIds: res.ids.length, pages: next.pages, note: res.note });
    }
    const allComplete = state.backfill.targetMonths.every((m) => state.backfill.months[m]?.status === "complete");
    if (allComplete && !state.backfill.completedAt) state.backfill.completedAt = toIsoSeconds(clock());
    const last = state.backfill.targetMonths.at(-1);
    const lastSt = last ? state.backfill.months[last] : undefined;
    if (lastSt?.status === "complete") {
      const lastBounds = monthBounds(last!);
      const end = Math.min(lastBounds.endExclusiveMs, parseInstant(lastSt.cutoff));
      if (!state.coveredThrough || parseInstant(state.coveredThrough) < end) state.coveredThrough = toIsoSeconds(end);
    }
  }

  if (mode === "sweep" || mode === "all") {
    if (!state.coveredThrough) {
      sweepReport = { status: "skipped", from: null, to: null, totalCount: null, uniqueIds: 0, pages: 0, note: "backfill of the current month is not complete yet" };
    } else {
      const fromMs = parseInstant(state.coveredThrough) - ctx.config.dailySweepOverlapHours * 3600_000;
      const from = toIsoSeconds(fromMs);
      const filter = `modified ge ${from} and modified lt ${cutoff}`;
      ctx.log?.(`sweep ${filter}`);
      const res = await scan(ctx, budget, filter, "sweep", null, errors);
      if (res.status === "complete") {
        addCoverage(state, { from: state.coveredThrough, to: cutoff, status: "complete", totalCount: res.totalCount, uniqueIds: res.ids.length, recordedAt: toIsoSeconds(clock()), note: "daily sweep by modified" });
        state.coveredThrough = cutoff;
      } else {
        addCoverage(state, { from: state.coveredThrough, to: cutoff, status: res.status === "partial" ? "partial" : "failed", totalCount: res.totalCount, uniqueIds: res.ids.length, recordedAt: toIsoSeconds(clock()), note: res.note });
      }
      sweepReport = { status: res.status === "complete" ? "complete" : res.status === "partial" ? "partial" : "failed", from, to: cutoff, totalCount: res.totalCount, uniqueIds: res.ids.length, pages: res.pages, note: res.note };
    }
  }

  ctx.store.writeState(state);

  // Detail completion
  const items = normalize(ctx.store.readAllRaw(), ctx.categories, ctx.importance);
  const pending = items
    .filter((i) => i.detailState !== "ok")
    .sort((a, b) => (a.detailState === b.detailState ? 0 : a.detailState === "failed" ? 1 : -1) || parseInstant(b.created) - parseInstant(a.created) || (a.canonicalKey < b.canonicalKey ? -1 : 1));
  const succeeded: string[] = [];
  const failed: string[] = [];
  for (const it of pending.slice(0, ctx.config.limits.maxDetailsPerRun)) {
    if ((clock() - startMs) / 1000 >= ctx.config.limits.maxSecondsPerRun) {
      budget.hit ??= "maxSecondsPerRun";
      break;
    }
    const fetchedAt = new Date(clock()).toISOString();
    const args = { id: it.latestId };
    try {
      const d = await ctx.client.callTool<MrcItem>(DETAIL_TOOL, args);
      if (!d || String(d.id) !== it.latestId) throw new Error("detail response id mismatch");
      ctx.store.writeRaw({ schema: 1, tool: DETAIL_TOOL, args, fetchedAt, ok: true, response: d }, `detail_${it.latestId}`);
      succeeded.push(it.latestId);
    } catch (e) {
      ctx.store.writeRaw({ schema: 1, tool: DETAIL_TOOL, args, fetchedAt, ok: false, error: (e as Error).message }, `detail_${it.latestId}_err`);
      failed.push(it.latestId);
      errors.push(`detail ${it.latestId}: ${(e as Error).message}`);
    }
  }
  if (pending.length > ctx.config.limits.maxDetailsPerRun) budget.hit ??= "maxDetailsPerRun";

  const finalItems = normalize(ctx.store.readAllRaw(), ctx.categories, ctx.importance);
  const statusCounts: Record<string, number> = {};
  const detailStateCounts: Record<string, number> = {};
  for (const i of finalItems) {
    statusCounts[i.status ?? "null"] = (statusCounts[i.status ?? "null"] ?? 0) + 1;
    detailStateCounts[i.detailState] = (detailStateCounts[i.detailState] ?? 0) + 1;
  }

  const notes: string[] = [];
  const finalState = ctx.store.readState();
  for (const [m, st] of Object.entries(finalState.backfill.months)) {
    if (st.status === "complete" && st.totalCount !== st.ids.length) notes.push(`${m}: complete but unique ${st.ids.length} != totalCount ${st.totalCount}`);
  }
  const monthIdSum = new Set(Object.values(finalState.backfill.months).flatMap((m) => m.ids));
  const inItems = new Set(finalItems.flatMap((i) => i.ids));
  for (const id of monthIdSum) if (!inItems.has(id)) notes.push(`scanned id ${id} missing from normalized`);
  if (inItems.size < monthIdSum.size) notes.push("normalized id count lower than scanned unique ids");

  const report: RunReport = {
    runId,
    mode,
    startedAt: new Date(startMs).toISOString(),
    finishedAt: new Date(clock()).toISOString(),
    cutoff,
    months: monthReports.sort((a, b) => (a.month < b.month ? -1 : 1)),
    sweep: sweepReport,
    details: { attempted: succeeded.length + failed.length, succeeded, failed, pendingAfter: Math.max(0, pending.length - succeeded.length) },
    statusCounts,
    detailStateCounts,
    backfill: {
      complete: !!finalState.backfill.completedAt,
      completedMonths: finalState.backfill.targetMonths.filter((m) => finalState.backfill.months[m]?.status === "complete"),
      pendingMonths: finalState.backfill.targetMonths.filter((m) => finalState.backfill.months[m]?.status !== "complete"),
    },
    limits: { pagesUsed: budget.pages, pagesMax: ctx.config.limits.maxPagesPerRun, hit: budget.hit },
    mrcRequests: ctx.client.requestCount,
    errors,
    consistent: notes.length === 0,
    consistencyNotes: notes,
  };
  ctx.store.writeRunReport(runId, report);
  return report;
}
