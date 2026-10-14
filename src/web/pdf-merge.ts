import { PDFDocument, concatTransformationMatrix, PDFString, pushGraphicsState, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

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
  const tocPages = Math.max(1, Math.ceil(n / PER_TOC_PAGE));
  const firstSlidePage = 1 + tocPages + 1 + 1;

  const cover = newPage(doc);
  tint(cover, 910); frame(cover);
  g.text(cover, "Microsoft Azure", 96, 218, 22, BLUE, true);
  g.text(cover, "Azure アップデート情報", 96, 258, 68, NAVY, true);
  let y = 366;
  if (o.periodLabel) { g.text(cover, `対象期間 ${o.periodLabel}`, 96, y, 28, BLUE, true); y += 52; }
  g.text(cover, String(n), 96, y, 44, NAVY, true);
  g.text(cover, o.totalInPeriod !== null ? ` 件（期間内の更新 ${o.totalInPeriod} 件のうちスライド作成済み）` : " 件", 96 + g.width(String(n), 44), y + 16, 26, GRAY);
  footer(g, cover, `作成日 ${o.createdUtc.slice(0, 10)}（UTC）`, source);

  let page = firstSlidePage;
  for (let t = 0; t < tocPages; t++) {
    const p = newPage(doc);
    frame(p);
    g.text(p, t === 0 ? "目次" : "目次（続き）", 70, 44, 34, NAVY, true);
    o.entries.slice(t * PER_TOC_PAGE, (t + 1) * PER_TOC_PAGE).forEach((e, i) => {
      const top = 108 + i * 36;
      g.text(p, `${t * PER_TOC_PAGE + i + 1}.`, 70, top, 20, BLUE, true);
      const pg = String(page);
      g.text(p, g.fit(`【${e.label}】${e.title}`, 20, W - 70 - 120 - 130), 120, top, 20, NAVY);
      g.text(p, pg, W - 70 - g.width(pg, 20), top, 20, GRAY);
      page += e.pages;
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
  [...kinds].forEach(([k, v], i) => { g.text(sum, `${k}　${v} 件`, 90, 152 + i * 34, 22, NAVY); });
  g.text(sum, "カテゴリ別（複数所属あり）", 560, 112, 22, BLUE, true);
  [...cats].sort((a, b) => b[1] - a[1]).forEach(([k, v], i) => { g.text(sum, `${o.categoryLabels[k] ?? k}　${v} 件`, 580, 152 + i * 34, 22, NAVY); });
  footer(g, sum, "Azure アップデート情報", source);

  let done = 0;
  for (const e of o.entries) {
    const src = await PDFDocument.load(await fetchPdf(e.key));
    for (const pg of await doc.copyPages(src, src.getPageIndices())) doc.addPage(pg);
    o.onProgress?.(++done, n);
  }

  const end = newPage(doc);
  tint(end, 790); frame(end);
  const w = g.width("以上", 64);
  g.text(end, "以上", (W - w) / 2, 250, 64, NAVY, true);
  const s2 = "Azure アップデート情報";
  g.text(end, s2, (W - g.width(s2, 26)) / 2, 340, 26, BLUE, true);
  const note = "この資料は GitHub Actions と AI エージェントで自動生成しています。仕組みについてのお問い合わせ・ご意見は GitHub へどうぞ。";
  g.text(end, note, (W - g.width(note, 15)) / 2, 420, 15, GRAY);
  const repo = REPO_URL;
  const rx = (W - g.width(repo, 17)) / 2;
  g.text(end, repo, rx, 448, 17, BLUE);
  end.drawLine({ start: { x: rx, y: H - 448 - 20 }, end: { x: rx + g.width(repo, 17), y: H - 448 - 20 }, thickness: 0.8, color: BLUE });
  addLink(doc, end, rx, 448, g.width(repo, 17), 22, repo);
  footer(g, end, "© 2026 yamapan（GitHub: aktsmm）  CC BY-NC-SA 4.0", source);

  doc.setTitle("Azure アップデート情報");
  doc.setCreationDate(new Date(o.createdUtc));
  return doc.save();
}
