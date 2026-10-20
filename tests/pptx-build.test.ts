import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { buildDeckPptx } from "../src/web/pptx-build.js";

describe("pptx export", () => {
  it("builds cover, toc, summary, one slide per update and an ending, with real hyperlinks", async () => {
    const deck = JSON.parse(readFileSync("examples/slide-deck.sample.json", "utf8"));
    const bytes = await buildDeckPptx({ slides: deck.slides, periodLabel: "2026-10-01 〜 2026-10-31", totalInPeriod: 28, createdUtc: "2026-10-14T12:00:00Z" });
    const zip = await JSZip.loadAsync(bytes);
    const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    // cover + toc + summary + one section slide per kind present + one slide per update + ending
    const kinds = new Set(deck.slides.map((s: { kind: string }) => s.kind));
    expect(slideFiles).toHaveLength(3 + kinds.size + deck.slides.length + 1);
    const all = (await Promise.all(slideFiles.map((f) => zip.file(f)!.async("string")))).join("\n");
    // the contents page lists a heading per kind with its count, and no technical-genre tags
    const toc = await zip.file("ppt/slides/slide2.xml")!.async("string");
    for (const k of kinds as Set<string>) {
      const n = deck.slides.filter((s: { kind: string }) => s.kind === k).length;
      expect(toc).toContain(`${n} 件）`);
    }
    expect(all).toContain("Azure アップデート情報");
    expect(all).toContain("© 2026 yamapan");
    for (const s of deck.slides) expect(all).toContain(s.title.ja.slice(0, 8));
    for (const word of ["未確認", "記載なし", "要確認", "推定", "未発表", "判定保留"]) expect(all).not.toContain(word);
    const rels = (await Promise.all(Object.keys(zip.files).filter((f) => /slides\/_rels\/.*\.rels$/.test(f)).map((f) => zip.file(f)!.async("string")))).join("\n");
    expect(rels).toContain("https://azure.microsoft.com/updates?id=574343");
    expect(rels).toContain("https://learn.microsoft.com/ja-jp/");
  });
});
