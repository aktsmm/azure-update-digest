import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { buildDeckPdf } from "../src/web/pdf-merge.js";

// The bold weight used to be drawn by printing the same string twice, shifted by 2.5% of the size. The text layer then held every
// bold word twice (cover, headings), so search, copy and screen readers repeated it. Bold is now one draw plus a text outline.
const FONT = "scratch/live-font.ttf";

async function contentTexts(pdf: Uint8Array): Promise<string[][]> {
  const doc = await PDFDocument.load(pdf);
  const pages: string[][] = [];
  for (const page of doc.getPages().slice(0, 2)) {
    const refs = page.node.Contents();
    const parts: string[] = [];
    const arr = (refs as any).asArray ? (refs as any).asArray() : [refs];
    for (const r of arr) {
      const s = doc.context.lookup(r) as PDFRawStream;
      if (!s || !(s as any).contents) continue;
      const raw = (s as any).contents as Uint8Array;
      let bytes: Uint8Array = raw;
      try { bytes = inflateSync(raw); } catch { /* not compressed */ }
      parts.push(Buffer.from(bytes).toString("latin1"));
    }
    // each hex string passed to Tj is one text draw
    pages.push([...parts.join("\n").matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((m) => m[1]!));
  }
  return pages;
}

describe("PDF bold text", () => {
  it("draws each bold string once (no shifted duplicate in the text layer)", async () => {
    let font: Buffer;
    try { font = readFileSync(FONT); } catch { return; } // the production font is downloaded for local runs only
    const blank = async () => { const d = await PDFDocument.create(); d.addPage([960, 540]); return (await d.save()).buffer as ArrayBuffer; };
    const pdf = await buildDeckPdf({ entries: [], categoryLabels: {}, periodLabel: "2026-11-01 〜 2026-11-17", totalInPeriod: 0, createdUtc: "2026-11-18T00:00:00Z" } as never, font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer, blank);
    const [cover] = await contentTexts(pdf);
    const counts = new Map<string, number>();
    for (const t of cover!) counts.set(t, (counts.get(t) ?? 0) + 1);
    const dup = [...counts].filter(([t, n]) => n > 1 && t.length > 12);
    expect(dup, "a string is drawn more than once on the cover").toEqual([]);
    expect(cover!.length).toBeGreaterThan(3);
  });
});
