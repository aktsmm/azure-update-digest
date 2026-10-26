import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { repairSlide } from "../src/cli/repair-slide.js";
import { validateDeck } from "../src/lib/slide-validate.js";

const load = (k: string) => JSON.parse(readFileSync(`data/slides/${k}.json`, "utf8"));

describe("repairSlide", () => {
  it("fixes the vocabulary slips seen in real agent output and the result validates", () => {
    const deck = load("573415");
    deck.slides[0].audience.changeNature = "risk";
    deck.slides[0].region = { stamp: "japan-both", scope: "service", basis: "confirmed", evidence: [{ url: "https://learn.microsoft.com/azure/x", locator: "a", retrievedAt: "2026-10-21T00:00:00Z" }] };
    expect(validateDeck(deck).length).toBeGreaterThan(0);
    const fixes = repairSlide(deck);
    expect(fixes.length).toBe(2);
    expect(validateDeck(deck)).toEqual([]);
  });

  it("leaves a valid slide untouched", () => {
    const deck = load("573415");
    const before = JSON.stringify(deck);
    expect(repairSlide(deck)).toEqual([]);
    expect(JSON.stringify(deck)).toBe(before);
  });
});
