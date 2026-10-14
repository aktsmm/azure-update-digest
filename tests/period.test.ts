import { describe, expect, it } from "vitest";
import { addDays, inPeriod, isValidDateString, monthBounds, parseInstant, recentMonths, resolvePeriod, toJstDate } from "../src/lib/period.js";

describe("period", () => {
  it("converts UTC to JST calendar date across the boundary", () => {
    expect(toJstDate("2026-10-08T14:59:59.9999999Z")).toBe("2026-10-08");
    expect(toJstDate("2026-10-08T15:00:00Z")).toBe("2026-10-09");
    expect(toJstDate("2026-12-31T15:00:00Z")).toBe("2027-01-01");
    expect(toJstDate("2026-10-09T00:00:00+09:00")).toBe("2026-10-09");
  });

  it("rejects instants without offset", () => {
    expect(() => parseInstant("2026-10-08T10:00:00")).toThrow();
  });

  it("handles leap years and month ends", () => {
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(monthBounds("2028-02").end).toBe("2028-02-29");
    expect(monthBounds("2026-12").end).toBe("2026-12-31");
  });

  it("default period is 30 calendar days including today (JST)", () => {
    // 2026-10-14T18:37+09:00
    const p = resolvePeriod({ now: "2026-10-14T09:37:00Z" });
    expect(p).toEqual({ start: "2026-09-15", end: "2026-10-14" });
    // UTC still the 13th but JST is already the 14th
    expect(resolvePeriod({ now: "2026-10-13T15:30:00Z" }).end).toBe("2026-10-14");
  });

  it("includes both ends; end day runs to 23:59:59.999 JST", () => {
    const p = { start: "2026-10-01", end: "2026-10-31" };
    expect(inPeriod("2026-09-30T14:59:59.999Z", p)).toBe(false);
    expect(inPeriod("2026-09-30T15:00:00Z", p)).toBe(true);
    expect(inPeriod("2026-10-31T14:59:59.999Z", p)).toBe(true);
    expect(inPeriod("2026-10-31T15:00:00Z", p)).toBe(false);
  });

  it("rejects future and malformed input", () => {
    expect(() => resolvePeriod({ now: "2026-10-14T00:00:00Z", base: "2026-10-20" })).toThrow();
    expect(() => resolvePeriod({ now: "2026-10-14T00:00:00Z", start: "2026-10-05", end: "2026-10-01" })).toThrow();
    expect(() => resolvePeriod({ now: "2026-10-14T00:00:00Z", start: "2026-02-30", end: "2026-03-01" })).toThrow();
  });

  it("lists the last 12 JST months including the current one", () => {
    const m = recentMonths("2026-10-14T09:00:00Z", 12);
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2025-11");
    expect(m[11]).toBe("2026-10");
  });
});
