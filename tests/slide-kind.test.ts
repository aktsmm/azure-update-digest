import { describe, expect, it } from "vitest";
import { decideKind } from "../src/lib/slide-kind.js";

const base = { title: "x", tags: [] as string[] };

describe("decideKind", () => {
  it("treats Private Preview as Preview", () => {
    expect(decideKind({ ...base, availabilities: [{ ring: "Private Preview", year: 2026, month: "October" }] }).kind).toBe("preview");
    expect(decideKind({ ...base, availabilities: [{ ring: "Preview", year: 2026, month: "October" }] }).kind).toBe("preview");
  });
  it("keeps retirement above preview and GA", () => {
    expect(decideKind({ ...base, availabilities: [{ ring: "Retirement", year: 2027, month: "May" }, { ring: "Preview", year: 2026, month: "May" }] }).kind).toBe("retirement");
  });
  it("falls back to GA, announcement and update", () => {
    expect(decideKind({ ...base, availabilities: [{ ring: "General Availability", year: 2026, month: "May" }] }).kind).toBe("ga");
    expect(decideKind({ title: "Announcing something", tags: [], availabilities: [] }).kind).toBe("announcement");
    expect(decideKind({ ...base, availabilities: [] }).kind).toBe("update");
  });
});
