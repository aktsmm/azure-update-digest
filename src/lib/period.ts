/**
 * Shared period logic. Everything that shows or counts updates (list, counts, highlights,
 * search, future reports) must go through this module so headings and totals agree.
 * All calendar-day decisions use Asia/Tokyo (UTC+9, no DST).
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DateBasis = "created" | "modified";

export interface Period {
  /** inclusive, YYYY-MM-DD (JST) */
  start: string;
  /** inclusive, YYYY-MM-DD (JST); covers up to 23:59:59.999 JST */
  end: string;
}

export function isValidDateString(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Parse an ISO-8601 instant with offset/Z (any fraction length) into epoch ms. */
export function parseInstant(iso: string): number {
  const normalized = iso.replace(/(\.\d{3})\d+/, "$1");
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) throw new Error(`Invalid instant: ${iso}`);
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) {
    throw new Error(`Instant without offset is not allowed: ${iso}`);
  }
  return ms;
}

function fmtDate(utcMsShifted: number): string {
  const d = new Date(utcMsShifted);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** JST calendar date (YYYY-MM-DD) of an instant. */
export function toJstDate(iso: string | number): string {
  const ms = typeof iso === "number" ? iso : parseInstant(iso);
  return fmtDate(ms + JST_OFFSET_MS);
}

export function addDays(date: string, days: number): string {
  if (!isValidDateString(date)) throw new Error(`Invalid date: ${date}`);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return fmtDate(Date.UTC(y, m - 1, d) + days * DAY_MS);
}

/** Epoch ms of 00:00:00.000 JST on the given date. */
export function jstStartMs(date: string): number {
  if (!isValidDateString(date)) throw new Error(`Invalid date: ${date}`);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) - JST_OFFSET_MS;
}

export interface PeriodInput {
  now: string | number | Date;
  /** Reference date; the period becomes the 30 calendar days ending on it. */
  base?: string;
  start?: string;
  end?: string;
  days?: number;
}

export function resolvePeriod(input: PeriodInput): Period {
  const nowMs = input.now instanceof Date ? input.now.getTime() : typeof input.now === "number" ? input.now : parseInstant(input.now);
  const today = toJstDate(nowMs);
  if (input.start || input.end) {
    if (!input.start || !input.end) throw new Error("start and end must be given together");
    if (!isValidDateString(input.start) || !isValidDateString(input.end)) {
      throw new Error("start/end must be valid YYYY-MM-DD dates");
    }
    if (input.start > input.end) throw new Error("start must not be after end");
    if (input.end > today) throw new Error("end must not be in the future (past only)");
    return { start: input.start, end: input.end };
  }
  const base = input.base ?? today;
  if (!isValidDateString(base)) throw new Error("base must be a valid YYYY-MM-DD date");
  if (base > today) throw new Error("base must not be in the future (past only)");
  const days = input.days ?? 30;
  return { start: addDays(base, -(days - 1)), end: base };
}

export function periodBoundsMs(p: Period): { startMs: number; endExclusiveMs: number } {
  return { startMs: jstStartMs(p.start), endExclusiveMs: jstStartMs(addDays(p.end, 1)) };
}

export function inPeriod(iso: string, p: Period): boolean {
  const d = toJstDate(iso);
  return d >= p.start && d <= p.end;
}

export function periodDays(p: Period): number {
  return Math.round((jstStartMs(p.end) - jstStartMs(p.start)) / DAY_MS) + 1;
}

/** `YYYY-MM` of a JST date. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function monthBounds(month: string): { start: string; end: string; startMs: number; endExclusiveMs: number } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Invalid month: ${month}`);
  const start = `${month}-01`;
  if (!isValidDateString(start)) throw new Error(`Invalid month: ${month}`);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const nextStart = fmtDate(Date.UTC(y, m, 1));
  const end = addDays(nextStart, -1);
  return { start, end, startMs: jstStartMs(start), endExclusiveMs: jstStartMs(nextStart) };
}

/** The `count` JST months ending with (and including) the month of `now`, oldest first. */
export function recentMonths(now: string | number, count: number): string[] {
  const today = toJstDate(now);
  const [y, m] = today.split("-").map(Number) as [number, number];
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function toIsoSeconds(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}
