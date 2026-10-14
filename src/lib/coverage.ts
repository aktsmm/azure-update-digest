import { parseInstant, toJstDate, addDays } from "./period.js";
import type { CoverageInterval } from "./types.js";

export type PeriodCoverage = {
  status: "complete" | "partial" | "not-fetched";
  /** JST dates (inclusive) that are fully covered by complete intervals */
  coveredRanges: { start: string; end: string }[];
};

interface Span {
  from: number;
  to: number;
}

function mergeSpans(spans: Span[]): Span[] {
  const s = [...spans].sort((a, b) => a.from - b.from);
  const out: Span[] = [];
  for (const x of s) {
    const last = out.at(-1);
    if (last && x.from <= last.to) last.to = Math.max(last.to, x.to);
    else out.push({ ...x });
  }
  return out;
}

/** Keep only the newest record per exact [from,to). */
export function dedupeIntervals(list: CoverageInterval[]): CoverageInterval[] {
  const m = new Map<string, CoverageInterval>();
  for (const i of list) {
    const k = `${i.from}|${i.to}`;
    const prev = m.get(k);
    if (!prev || prev.recordedAt <= i.recordedAt) m.set(k, i);
  }
  return [...m.values()].sort((a, b) => parseInstant(a.from) - parseInstant(b.from) || (a.to < b.to ? -1 : 1));
}

/** Coverage of a JST-day period [startMs, endExclusiveMs) against recorded intervals (created-based). */
export function periodCoverage(intervals: CoverageInterval[], startMs: number, endExclusiveMs: number): PeriodCoverage {
  const complete = mergeSpans(intervals.filter((i) => i.status === "complete").map((i) => ({ from: parseInstant(i.from), to: parseInstant(i.to) })));
  const clipped = complete
    .map((s) => ({ from: Math.max(s.from, startMs), to: Math.min(s.to, endExclusiveMs) }))
    .filter((s) => s.from < s.to);
  const fullyCovered = clipped.length === 1 && clipped[0]!.from <= startMs && clipped[0]!.to >= endExclusiveMs;
  const touchesAny =
    clipped.length > 0 ||
    intervals.some((i) => i.status !== "complete" && parseInstant(i.from) < endExclusiveMs && parseInstant(i.to) > startMs);
  const coveredRanges = clipped.map((s) => ({ start: toJstDate(s.from), end: toJstDate(s.to - 1) }));
  return { status: fullyCovered ? "complete" : touchesAny ? "partial" : "not-fetched", coveredRanges };
}

export { addDays };
