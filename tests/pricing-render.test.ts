import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { slideHtml } from "../src/lib/slide-html.js";
import { buildDeckPptx } from "../src/web/pptx-build.js";

const base = () => JSON.parse(readFileSync("data/slides/569236.json", "utf8")).slides[0];
const withPricing = () => ({ ...base(), pricing: { kind: "change", text: "2027-11-01 以降、料金が切り替わります", origin: "learn", assertion: "fact", verification: "verified", evidence: [{ url: "https://learn.microsoft.com/azure/x", locator: "a", retrievedAt: "2026-11-01T00:00:00Z" }] } });
const slideXml = async (s: unknown) => {
  const zip = await JSZip.loadAsync(await buildDeckPptx({ slides: [s], categoryLabels: {}, periodLabel: null, totalInPeriod: 1, createdUtc: "2026-01-01T00:00:00Z" } as never));
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  return (await Promise.all(names.map((n) => zip.file(n)!.async("string")))).join("\n");
};

describe("これまで / これから and pricing rendering", () => {
  it("PDF html uses Japanese labels and shows the pricing strip only when present", () => {
    const o = { fs: 14, sfs: 14, includeDetail: true } as never;
    const without = slideHtml(base(), o);
    const withP = slideHtml(withPricing(), o);
    expect(without).toContain("これまで");
    expect(without).toContain("これから");
    expect(without).not.toContain("Before");
    expect(without).not.toContain('class="pricing');
    expect(withP).toContain('class="pricing pr-change"');
    expect(withP).toContain("2027-11-01 以降、料金が切り替わります");
  });
  it("PPTX uses the same labels and strip", async () => {
    const without = await slideXml(base());
    const withP = await slideXml(withPricing());
    expect(without).toContain("これまで");
    expect(without).not.toContain("課金");
    expect(withP).toContain("課金");
    expect(withP).toContain("2027-11-01 以降、料金が切り替わります");
  });
});
