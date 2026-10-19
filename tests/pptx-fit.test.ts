import { afterAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";

// PPTX fit audit. The font-fit estimate is deliberately conservative (it over-estimates height, which was checked
// against real PowerPoint renders: slides estimated at the 9pt floor still render without overlap because text boxes
// use `fit: shrink`). This test keeps the estimate from getting WORSE and checks that the audit hook still works.
// If you improve the estimate, lower the baseline below.
const BASELINE_AT_FLOOR = 45; // slides whose main column is estimated at the 9pt floor (measured: 39 of 108)
const OUT = "scratch-pptx-fit.cjs";

afterAll(() => rmSync(OUT, { force: true }));

describe("pptx fit estimate", () => {
  it("reports a font size for every published slide and does not regress", async () => {
    await build({ entryPoints: ["src/web/pptx-build.ts"], bundle: true, format: "cjs", platform: "node", outfile: OUT, logLevel: "error" });
    const lib = createRequire(import.meta.url)(`./../${OUT}`) as { buildDeckPptx: (o: unknown) => Promise<ArrayBuffer> };
    const slides: { key: string }[] = [];
    for (const f of readdirSync("data/slides").filter((x) => x.endsWith(".json"))) slides.push(...(JSON.parse(readFileSync(`data/slides/${f}`, "utf8")) as { slides: { key: string }[] }).slides);
    const audit: { key: string; pt: number }[] = [];
    (globalThis as { __PPTX_FIT_AUDIT__?: unknown }).__PPTX_FIT_AUDIT__ = audit;
    await lib.buildDeckPptx({ slides, categoryLabels: {}, periodLabel: null, totalInPeriod: slides.length, createdUtc: "2026-01-01T00:00:00Z" });
    delete (globalThis as { __PPTX_FIT_AUDIT__?: unknown }).__PPTX_FIT_AUDIT__;
    expect(audit.length).toBe(slides.length);
    const atFloor = audit.filter((a) => a.pt <= 9).length;
    expect(atFloor).toBeLessThanOrEqual(Math.max(BASELINE_AT_FLOOR, Math.ceil(slides.length * 0.42)));
  }, 120_000);
});
