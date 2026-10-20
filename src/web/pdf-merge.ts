import { PDFDocument, concatTransformationMatrix, PDFString, pushGraphicsState, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { KIND_COLOR_HEX, KIND_ICON, sectionByKind } from "../lib/kind-section.js";
import type { SlideKind } from "../lib/slide-kind.js";

export interface SlideEntry { key: string; kind: string; label: string; title: string; publishedJst: string; categories: string[]; pages: number }
export interface DeckOptions {
  entries: SlideEntry[];
  categoryLabels: Record<string, string>;
  periodLabel: string | null;
  totalInPeriod: number | null;
  createdUtc: string;
  onProgress?: (done: number, total: number) => void;
}

const W = 1280, H = 720;
const NAVY = rgb(0x24 / 255, 0x3a / 255, 0x5e / 255);
const BLUE = rgb(0, 0x78 / 255, 0xd4 / 255);
const CYAN = rgb(0x50 / 255, 0xe6 / 255, 1);
const TINT = rgb(0xea / 255, 0xf3 / 255, 0xfc / 255);
const GRAY = rgb(0x3d / 255, 0x4a / 255, 0x5c / 255);
const WHITE = rgb(1, 1, 1);
const hexRgb = (h: string) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
const PER_TOC_PAGE = 13;
// Chrome writes the 1280x720 px slides as 960x540 pt; draw the extra pages in px units on the same page size.
const PT = 0.75;
function newPage(doc: PDFDocument): PDFPage {
  const p = doc.addPage([W * PT, H * PT]);
  p.pushOperators(pushGraphicsState(), concatTransformationMatrix(PT, 0, 0, PT, 0, 0));
  return p;
}

const REPO_URL = "https://github.com/aktsmm/azure-update-digest";

/** Clickable URI area; coordinates are in the same px units as the drawing helpers (top-based). */
function addLink(doc: PDFDocument, p: PDFPage, x: number, top: number, w: number, h: number, url: string) {
  const rect = [x * PT, (H - top - h) * PT, (x + w) * PT, (H - top) * PT];
  const annot = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: rect,
    Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
  });
  p.node.addAnnot(doc.context.register(annot));
}

class Painter {
  constructor(private font: PDFFont) {}
  text(p: PDFPage, s: string, x: number, top: number, size: number, color = NAVY, bold = false) {
    const y = H - top - size;
    p.drawText(s, { x, y, size, font: this.font, color });
    if (bold) p.drawText(s, { x: x + size * 0.025, y, size, font: this.font, color });
  }
  width(s: string, size: number) { return this.font.widthOfTextAtSize(s, size); }
  fit(s: string, size: number, max: number) {
    if (this.width(s, size) <= max) return s;
    let t = s;
    while (t.length > 1 && this.width(t + "…", size) > max) t = t.slice(0, -1);
    return t + "…";
  }
}

function frame(p: PDFPage) {
  p.drawRectangle({ x: 0, y: H - 14, width: W * 0.7, height: 14, color: BLUE });
  p.drawRectangle({ x: W * 0.7, y: H - 14, width: W * 0.15, height: 14, color: CYAN });
  p.drawRectangle({ x: W * 0.85, y: H - 14, width: W * 0.15, height: 14, color: NAVY });
  p.drawRectangle({ x: 0, y: 0, width: W, height: 56, color: NAVY });
}
function tint(p: PDFPage, leftTop: number) {
  p.drawSvgPath(`M ${leftTop} 14 L ${W} 14 L ${W} ${H - 56} L ${leftTop - 375} ${H - 56} Z`, { x: 0, y: H, color: TINT });
}
function footer(g: Painter, p: PDFPage, left: string, right: string) {
  g.text(p, left, 96, H - 38, 16, WHITE);
  g.text(p, right, W - 96 - g.width(right, 16), H - 38, 16, WHITE);
}

export async function buildDeckPdf(o: DeckOptions, fontBytes: ArrayBuffer, fetchPdf: (key: string) => Promise<ArrayBuffer>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const g = new Painter(await doc.embedFont(fontBytes, { subset: false }));
  const source = "出典: Microsoft Azure Updates ／ Microsoft Learn";
  const n = o.entries.length;
  const sections = sectionByKind(o.entries.map((e) => ({ ...e, kind: e.kind as SlideKind })));
  // contents rows: one heading row per kind section, then its updates (a section page precedes each kind's slides)
  type TocRow = { type: "head"; kind: SlideKind; label: string; count: number; page: number } | { type: "item"; no: number; kind: SlideKind; label: string; title: string; page: number };
  const tocPagesFor = (rows: number) => Math.max(1, Math.ceil(rows / PER_TOC_PAGE));
  const rowCount = n + sections.length;
  const tocPages = tocPagesFor(rowCount);
  const firstSlidePage = 1 + tocPages + 1 + 1;
  const rows: TocRow[] = [];
  {
    let pg = firstSlidePage, no = 0;
    for (const s of sections) {
      rows.push({ type: "head", kind: s.kind, label: s.label, count: s.items.length, page: pg });
      pg += 1; // the section page
      for (const e of s.items) { rows.push({ type: "item", no: ++no, kind: s.kind, label: e.label, title: e.title, page: pg }); pg += e.pages; }
    }
  }

  const cover = newPage(doc);
  tint(cover, 910); frame(cover);
  g.text(cover, "Microsoft Azure", 96, 218, 22, BLUE, true);
  g.text(cover, "Azure アップデート情報", 96, 258, 68, NAVY, true);
  let y = 366;
  if (o.periodLabel) { g.text(cover, `対象期間 ${o.periodLabel}`, 96, y, 28, BLUE, true); y += 52; }
  g.text(cover, String(n), 96, y, 44, NAVY, true);
  g.text(cover, " 件", 96 + g.width(String(n), 44), y + 16, 26, GRAY);
  footer(g, cover, `作成日 ${o.createdUtc.slice(0, 10)}（UTC）`, source);

  for (let t = 0; t < tocPages; t++) {
    const p = newPage(doc);
    frame(p);
    g.text(p, t === 0 ? "目次" : "目次（続き）", 70, 44, 34, NAVY, true);
    rows.slice(t * PER_TOC_PAGE, (t + 1) * PER_TOC_PAGE).forEach((r, i) => {
      const top = 108 + i * 36;
      const col = hexRgb(KIND_COLOR_HEX[r.kind]);
      const pg = String(r.page);
      if (r.type === "head") {
        // section heading: a wide colour band with the kind icon, name and count
        p.drawRectangle({ x: 70, y: H - top - 26, width: W - 140, height: 30, color: col });
        g.text(p, `${KIND_ICON[r.kind]}  ${r.label}（${r.count} 件）`, 84, top, 20, WHITE, true);
        g.text(p, pg, W - 70 - 14 - g.width(pg, 20), top, 20, WHITE);
      } else {
        // left-edge kind icon (small colour badge), then number and title
        p.drawRectangle({ x: 70, y: H - top - 24, width: 26, height: 26, color: col });
        g.text(p, KIND_ICON[r.kind], 70 + (26 - g.width(KIND_ICON[r.kind], 16)) / 2, top + 4, 16, WHITE, true);
        g.text(p, `${r.no}.`, 106, top + 1, 20, BLUE, true);
        g.text(p, g.fit(r.title, 20, W - 160 - 90 - g.width(pg, 20)), 160, top + 1, 20, NAVY);
        g.text(p, pg, W - 70 - g.width(pg, 20), top + 1, 20, GRAY);
      }
    });
    footer(g, p, "Azure アップデート情報", source);
  }

  const sum = newPage(doc);
  frame(sum);
  g.text(sum, "概要", 70, 44, 34, NAVY, true);
  const kinds = new Map<string, number>();
  const cats = new Map<string, number>();
  for (const e of o.entries) {
    kinds.set(e.label, (kinds.get(e.label) ?? 0) + 1);
    for (const c of e.categories) cats.set(c, (cats.get(c) ?? 0) + 1);
  }
  g.text(sum, "種類別", 70, 112, 22, BLUE, true);
  const row = (label: string, n: number, x: number, w: number, i: number) => {
    const top = 152 + i * 34;
    g.text(sum, label, x, top, 22, NAVY);
    const cnt = String(n), unit = " 件";
    const ux = x + w - g.width(unit, 22);
    g.text(sum, unit, ux, top, 22, GRAY);
    g.text(sum, cnt, ux - g.width(cnt, 22), top, 22, NAVY, true);
    sum.drawLine({ start: { x, y: H - top - 28 }, end: { x: x + w, y: H - top - 28 }, thickness: 0.5, color: rgb(0.86, 0.89, 0.93) });
  };
  [...kinds].forEach(([k, v], i) => row(k, v, 90, 360, i));
  g.text(sum, "カテゴリ別（複数所属あり）", 560, 112, 22, BLUE, true);
  [...cats].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).forEach(([k, v], i) => row(o.categoryLabels[k] ?? k, v, 580, 560, i));
  footer(g, sum, "Azure アップデート情報", source);

  let done = 0;
  for (const s of sections) {
    // section page: big colour icon + kind name + count
    const sp = newPage(doc);
    frame(sp);
    const col = hexRgb(KIND_COLOR_HEX[s.kind]);
    sp.drawRectangle({ x: 96, y: H - 350, width: 120, height: 120, color: col });
    g.text(sp, KIND_ICON[s.kind], 96 + (120 - g.width(KIND_ICON[s.kind], 80)) / 2, 262, 80, WHITE, true);
    g.text(sp, s.label, 250, 250, 64, NAVY, true);
    g.text(sp, `${s.items.length} 件`, 252, 340, 30, GRAY);
    footer(g, sp, "Azure アップデート情報", source);
    for (const e of s.items) {
      const src = await PDFDocument.load(await fetchPdf(e.key));
      for (const pg of await doc.copyPages(src, src.getPageIndices())) doc.addPage(pg);
      o.onProgress?.(++done, n);
    }
  }

  const end = newPage(doc);
  tint(end, 790); frame(end);
  const w = g.width("以上", 64);
  g.text(end, "以上", (W - w) / 2, 250, 64, NAVY, true);
  const s2 = "Azure アップデート情報";
  g.text(end, s2, (W - g.width(s2, 26)) / 2, 340, 26, BLUE, true);
  const note = "GitHub Actions ＋ Agentic Workflow（GitHub Copilot）で生成しています。改善要望は GitHub（Issue）で対応します。";
  g.text(end, note, 96, 590, 14, GRAY);
  const repo = REPO_URL;
  const rw = g.width(repo, 14);
  g.text(end, repo, 96, 616, 14, BLUE);
  end.drawLine({ start: { x: 96, y: H - 616 - 16 }, end: { x: 96 + rw, y: H - 616 - 16 }, thickness: 0.7, color: BLUE });
  addLink(doc, end, 96, 616, rw, 20, repo);
  footer(g, end, "© 2026 yamapan（GitHub: aktsmm）  CC BY-NC-SA 4.0", source);

  doc.setTitle("Azure アップデート情報");
  doc.setCreationDate(new Date(o.createdUtc));
  return doc.save();
}
