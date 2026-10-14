import * as PptxNs from "pptxgenjs";
import type { Slide } from "../lib/slide-html.js";
import { CATEGORY_JA } from "../lib/slide-html.js";

// pptxgenjs ships CJS/ESM typings that disagree under NodeNext; resolve the constructor at runtime and keep loose option types.
/* eslint-disable @typescript-eslint/no-explicit-any */
type TextOpts = any;
type PptxSlide = any;
type PptxDeck = any;
const PptxGenJS: new () => PptxDeck = ((PptxNs as any).default?.default ?? (PptxNs as any).default ?? PptxNs) as new () => PptxDeck;

export interface PptxEntry { key: string; kind: string; label: string; title: string; publishedJst: string; categories: string[]; pages: number }
export interface PptxOptions {
  slides: Slide[];
  categoryLabels?: Record<string, string>;
  periodLabel: string | null;
  totalInPeriod: number | null;
  createdUtc: string;
}

const W = 13.333, H = 7.5, M = 0.35;
const FONT = "Yu Gothic";
const C = { navy: "243A5E", blue: "0078D4", cyan: "50E6FF", tint: "EAF3FC", gray: "3D4A5C", mute: "6B778A", line: "B8C7DC", white: "FFFFFF", red: "C62828", green: "1B7F3B" };
const KIND_COLOR: Record<string, string> = { ga: "1B7F3B", preview: "7A4FD0", "private-preview": "5B35A0", retirement: "C62828", announcement: "0B6BCB", update: "5B6777" };
const STAMP: Record<string, { text: string; color: string }> = {
  global: { text: "グローバル（リージョン不問）", color: "0B6BCB" },
  "japan-both": { text: "東日本・西日本対応", color: "1B7F3B" },
  "japan-east": { text: "東日本のみ対応", color: "1B7F3B" },
  "japan-west": { text: "西日本のみ対応", color: "1B7F3B" },
  "japan-none": { text: "日本リージョン未対応", color: "C62828" },
};
const ACT: Record<string, string> = { yes: "要対応", optional: "任意", no: "対応不要", unknown: "情報" };
const TYPE_JA: Record<string, string> = { product: "製品", feature: "機能", term: "用語", label: "ラベル" };
const MONTH: Record<string, string> = { January: "1", February: "2", March: "3", April: "4", May: "5", June: "6", July: "7", August: "8", September: "9", October: "10", November: "11", December: "12" };
const KIND_ORDER = ["preview", "private-preview", "ga", "retirement", "announcement", "update"];

type Run = { text: string; options?: TextOpts };

/** Text with **bold** segments as runs. */
function runs(s: string, base: TextOpts = {}): Run[] {
  return s.split(/(\*\*.+?\*\*)/g).filter(Boolean).map((p) => (p.startsWith("**") && p.endsWith("**") ? { text: p.slice(2, -2), options: { ...base, bold: true } } : { text: p, options: base }));
}
const plain = (s: string) => s.replace(/\*\*/g, "");

/** Rough text width in inches: full-width glyphs ~1em, ASCII ~0.55em. */
function textW(s: string, pt: number): number {
  let em = 0;
  for (const ch of s) em += ch.charCodeAt(0) < 0x250 ? 0.52 : 1;
  return (em * pt * 1.0) / 72;
}
/** Number of wrapped lines: Latin words stay whole, CJK glyphs wrap anywhere (greedy, like PowerPoint). */
function lines(s: string, pt: number, boxW: number): number {
  const usable = Math.max(0.5, boxW - 0.1);
  const tokens = plain(s).match(/[\x21-\x7E\u00A0-\u024F]+\s*|\s+|[^]/gu) ?? [];
  let n = 1, x = 0;
  for (const tk of tokens) {
    const w = textW(tk, pt);
    if (x > 0 && x + w > usable && tk.trim()) { n++; x = 0; }
    x += w;
  }
  return n;
}
const lineH = (pt: number) => (pt * 1.22) / 72;

interface Panel { heading: string; items: string[]; tone: "normal" | "warn" | "sug" }

/** Diagonal tinted area on the right: wide at the bottom, narrow at the top (matches the PDF cover). */
function tintShape(s: PptxSlide, topLeft: number) {
  const x0 = topLeft - 3.9, w = W - x0, h = H - 0.69;
  s.addShape("custGeom", { x: x0, y: 0.14, w, h, fill: { color: C.tint }, line: { color: C.tint, width: 0 }, points: [{ x: topLeft - x0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }, { x: topLeft - x0, y: 0, close: true }] });
}

function panelHeight(p: Panel, pt: number, w: number): number {
  const body = p.items.reduce((a, t) => a + lines(t, pt, w - 0.25) * lineH(pt), 0);
  return 0.34 + body + 0.1 + (p.items.length - 1) * 0.03;
}

function dateJa(a: Slide["meta"]["availability"][number]): string {
  return `${a.year}年${MONTH[a.month] ?? a.month}月`;
}

export async function buildDeckPptx(o: PptxOptions): Promise<ArrayBuffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "yamapan (aktsmm)";
  pptx.title = "Azure アップデート情報";
  pptx.company = "Azure Update Digest";
  const labels = { ...CATEGORY_JA, ...(o.categoryLabels ?? {}) };

  const order = [...o.slides].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.meta.publishedJst < b.meta.publishedJst ? 1 : a.meta.publishedJst > b.meta.publishedJst ? -1 : 0) || (a.key < b.key ? -1 : 1));
  const source = "出典: Microsoft Azure Updates ／ Microsoft Learn";

  const frame = (s: PptxSlide, left: string, right: string) => {
    s.addShape("rect", { x: 0, y: 0, w: W * 0.7, h: 0.14, fill: { color: C.blue }, line: { color: C.blue, width: 0 } });
    s.addShape("rect", { x: W * 0.7, y: 0, w: W * 0.15, h: 0.14, fill: { color: C.cyan }, line: { color: C.cyan, width: 0 } });
    s.addShape("rect", { x: W * 0.85, y: 0, w: W * 0.15, h: 0.14, fill: { color: C.navy }, line: { color: C.navy, width: 0 } });
    s.addShape("rect", { x: 0, y: H - 0.55, w: W, h: 0.55, fill: { color: C.navy }, line: { color: C.navy, width: 0 } });
    s.addText(left, { x: 0.9, y: H - 0.5, w: 6, h: 0.45, fontFace: FONT, fontSize: 11, color: "E6EEF9", valign: "middle", margin: 0 });
    s.addText(right, { x: W - 6.9, y: H - 0.5, w: 6, h: 0.45, fontFace: FONT, fontSize: 11, color: "E6EEF9", align: "right", valign: "middle", margin: 0 });
  };

  // cover
  {
    const s = pptx.addSlide();
    s.background = { color: C.white };
    tintShape(s, W * 0.68);
    frame(s, `作成日 ${o.createdUtc.slice(0, 10)}（UTC）`, source);
    s.addText("Microsoft Azure", { x: 0.9, y: 2.3, w: 8, h: 0.4, fontFace: FONT, fontSize: 18, bold: true, color: C.blue, margin: 0 });
    s.addText("Azure アップデート情報", { x: 0.9, y: 2.8, w: 11, h: 1.0, fontFace: FONT, fontSize: 48, bold: true, color: C.navy, margin: 0 });
    let y = 4.0;
    if (o.periodLabel) { s.addText(`対象期間 ${o.periodLabel}`, { x: 0.9, y, w: 10, h: 0.5, fontFace: FONT, fontSize: 22, bold: true, color: C.blue, margin: 0 }); y += 0.65; }
    s.addText([{ text: String(order.length), options: { fontSize: 34, bold: true, color: C.navy } }, { text: o.totalInPeriod !== null ? ` 件（期間内の更新 ${o.totalInPeriod} 件のうちスライド作成済み）` : " 件", options: { fontSize: 18, color: C.gray } }], { x: 0.9, y, w: 11, h: 0.7, fontFace: FONT, margin: 0, valign: "middle" });
  }

  // table of contents (paged)
  const PER = 13;
  for (let t = 0; t < Math.max(1, Math.ceil(order.length / PER)); t++) {
    const s = pptx.addSlide();
    s.background = { color: C.white };
    frame(s, "Azure アップデート情報", source);
    s.addText(t === 0 ? "目次" : "目次（続き）", { x: 0.7, y: 0.4, w: 6, h: 0.6, fontFace: FONT, fontSize: 28, bold: true, color: C.navy, margin: 0 });
    order.slice(t * PER, (t + 1) * PER).forEach((e, i) => {
      const y = 1.25 + i * 0.4;
      s.addText(`${t * PER + i + 1}.`, { x: 0.7, y, w: 0.6, h: 0.36, fontFace: FONT, fontSize: 15, bold: true, color: C.blue, margin: 0, valign: "middle" });
      s.addText(`【${e.label}】${e.title.ja}`, { x: 1.3, y, w: 11.3, h: 0.36, fontFace: FONT, fontSize: 15, color: C.navy, margin: 0, valign: "middle", fit: "shrink" });
    });
  }

  // summary
  {
    const s = pptx.addSlide();
    s.background = { color: C.white };
    frame(s, "Azure アップデート情報", source);
    s.addText("概要", { x: 0.7, y: 0.4, w: 6, h: 0.6, fontFace: FONT, fontSize: 28, bold: true, color: C.navy, margin: 0 });
    const kinds = new Map<string, number>();
    const cats = new Map<string, number>();
    for (const e of order) { kinds.set(e.label, (kinds.get(e.label) ?? 0) + 1); for (const c of e.meta.categories) cats.set(c, (cats.get(c) ?? 0) + 1); }
    s.addText("種類別", { x: 0.7, y: 1.3, w: 5, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: C.blue, margin: 0 });
    s.addText([...kinds].map(([k, v]) => ({ text: `${k}　${v} 件`, options: { breakLine: true } })), { x: 0.9, y: 1.75, w: 5, h: 3.5, fontFace: FONT, fontSize: 16, color: C.navy, valign: "top", margin: 0, paraSpaceAfter: 6 });
    s.addText("カテゴリ別（複数所属あり）", { x: 6.7, y: 1.3, w: 6, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: C.blue, margin: 0 });
    s.addText([...cats].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ text: `${labels[k] ?? k}　${v} 件`, options: { breakLine: true } })), { x: 6.9, y: 1.75, w: 5.5, h: 4, fontFace: FONT, fontSize: 16, color: C.navy, valign: "top", margin: 0, paraSpaceAfter: 6 });
  }

  for (const sl of order) addUpdateSlide(pptx, sl, labels);

  // ending
  {
    const s = pptx.addSlide();
    s.background = { color: C.white };
    tintShape(s, W * 0.6);
    frame(s, "© 2026 yamapan（GitHub: aktsmm）  CC BY-NC-SA 4.0", source);
    s.addText("以上", { x: 0, y: 2.6, w: W, h: 1.0, align: "center", fontFace: FONT, fontSize: 48, bold: true, color: C.navy, margin: 0 });
    s.addText("Azure アップデート情報", { x: 0, y: 3.7, w: W, h: 0.5, align: "center", fontFace: FONT, fontSize: 20, bold: true, color: C.blue, margin: 0 });
    s.addText([
      { text: "GitHub Actions ＋ Agentic Workflow（GitHub Copilot）で自動生成しています。改善要望は GitHub（Issue）で対応します。", options: { breakLine: true } },
      { text: "https://github.com/aktsmm/azure-update-digest", options: { hyperlink: { url: "https://github.com/aktsmm/azure-update-digest" }, color: C.blue, underline: { style: "sng" } } },
    ], { x: 0.9, y: 5.9, w: 11.5, h: 0.65, fontFace: FONT, fontSize: 10.5, color: C.gray, margin: 0, valign: "bottom" });
  }

  return (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
}

function addUpdateSlide(pptx: PptxDeck, sl: Slide, labels: Record<string, string>) {
  const s = pptx.addSlide();
  s.background = { color: C.white };
  const ring = sl.meta.availability[0];
  const dateLine = `掲載 ${sl.meta.publishedJst}${ring ? ` ｜ ${sl.kind === "retirement" ? "終了" : "時期"} ${dateJa(ring)}` : ""}`;

  // header
  s.addText(sl.title.ja, { x: M, y: 0.22, w: W - M - 2.5, h: 0.5, fontFace: FONT, fontSize: 24, bold: true, color: "0B2A4A", margin: 0, fit: "shrink" });
  if (sl.title.subtitleJa) s.addText(`― ${sl.title.subtitleJa}`, { x: M, y: 0.74, w: W - M - 2.5, h: 0.32, fontFace: FONT, fontSize: 13, bold: true, color: C.navy, margin: 0, fit: "shrink" });
  s.addText([{ text: sl.title.en, options: { color: "8A95A6" } }, { text: `　${dateLine}`, options: { color: C.gray, bold: true } }], { x: M, y: 1.06, w: W - 2 * M, h: 0.26, fontFace: FONT, fontSize: 9.5, margin: 0, fit: "shrink" });
  s.addShape("roundRect", { x: W - M - 1.9, y: 0.25, w: 1.9, h: 0.42, fill: { color: KIND_COLOR[sl.kind] ?? C.mute }, line: { color: KIND_COLOR[sl.kind] ?? C.mute, width: 0 }, rectRadius: 0.2 });
  s.addText(sl.label, { x: W - M - 1.9, y: 0.25, w: 1.9, h: 0.42, align: "center", valign: "middle", fontFace: FONT, fontSize: 14, bold: true, color: C.white, margin: 0 });

  // audience strip
  const act = ACT[sl.action.required] ?? "情報";
  const deadline = sl.action.deadline ? `　${sl.action.deadline.date ?? sl.action.deadline.month ?? ""}` : "";
  const stripY = 1.4;
  const cells: { x: number; w: number; label: string; body: Run[]; fill: string; line: string }[] = [
    { x: M, w: 4.1, label: "誰に関係するか", body: runs(sl.audience.who.text, { bold: true }), fill: "F3F8FF", line: "0B6BCB" },
    { x: M + 4.2, w: 4.3, label: sl.audience.changeNature === "benefit" ? "嬉しい点" : sl.audience.changeNature === "breaking" ? "変わること（嬉しくない変更）" : "変わること", body: runs(sl.audience.change.text), fill: "FFFFFF", line: "C9D4E6" },
    { x: M + 8.6, w: W - 2 * M - 8.6, label: "対応の要否", body: [{ text: act, options: { bold: true } }, { text: `　${sl.action.summary.text}${deadline}` }], fill: sl.action.required === "yes" ? "FDECEC" : sl.action.required === "optional" ? "EAF6EE" : "EAF3FF", line: sl.action.required === "yes" ? C.red : sl.action.required === "optional" ? C.green : "0B6BCB" },
  ];
  const stripH = Math.max(0.62, ...cells.map((c) => 0.08 + lineH(9) + lineH(11.5) * lines(c.body.map((r) => r.text).join(""), 11.5, c.w - 0.2) + 0.06));
  for (const c of cells) {
    s.addShape("roundRect", { x: c.x, y: stripY, w: c.w, h: stripH, fill: { color: c.fill }, line: { color: c.line, width: 1.25 }, rectRadius: 0.06 });
    s.addText([{ text: c.label, options: { fontSize: 9, color: "5B6777", bold: true, breakLine: true } }, ...c.body.map((r) => ({ ...r, options: { fontSize: 11.5, color: "0B2A4A", ...(r.options ?? {}) } }))], { x: c.x + 0.1, y: stripY + 0.06, w: c.w - 0.2, h: stripH - 0.1, fontFace: FONT, margin: 0, valign: "top", fit: "shrink" });
  }

  // timeline (retirement)
  let bodyTop = stripY + stripH + 0.12;
  if (sl.timeline?.length) {
    const tl = sl.timeline;
    s.addShape("line", { x: 2.2, y: bodyTop + 0.2, w: W - 2.2 - 2.4, h: 0, line: { color: C.red, width: 2 } });
    s.addText([{ text: tl[0]!.when.date ?? tl[0]!.when.month ?? "", options: { bold: true, breakLine: true } }, { text: tl[0]!.label, options: { fontSize: 9, color: C.mute } }], { x: M, y: bodyTop, w: 1.8, h: 0.5, align: "center", fontFace: FONT, fontSize: 12, color: "0B2A4A", margin: 0 });
    const last = tl[tl.length - 1]!;
    s.addText([{ text: last.when.date ?? last.when.month ?? "", options: { bold: true, breakLine: true } }, { text: last.label, options: { fontSize: 9 } }], { x: W - M - 2.2, y: bodyTop, w: 2.2, h: 0.5, align: "center", fontFace: FONT, fontSize: 12, color: C.red, margin: 0 });
    bodyTop += 0.58;
  }

  const footerTop = H - 0.98;
  const mainW = 8.55, sideX = M + mainW + 0.15, sideW = W - M - sideX;
  const isSug = (p: Slide["panels"][number]) => (p.items ?? []).length > 0 && (p.items ?? []).every((i) => i.assertion === "recommendation");
  const shown = sl.panels.filter((p) => p.availability === "present" && (p.items ?? []).length);
  const toPanel = (p: Slide["panels"][number]): Panel => ({ heading: p.heading, items: (p.items ?? []).map((i) => plain(i.text)), tone: /制約|注意|権限|影響/.test(p.heading) && sl.kind !== "ga" ? "warn" : "normal" });
  const core = shown.filter((p) => p.priority === "core" && !isSug(p)).map(toPanel);
  const detail = shown.filter((p) => p.priority !== "core" && !isSug(p)).map(toPanel);
  const sug = shown.filter(isSug).map((p) => ({ ...toPanel(p), heading: `${p.heading}（提案）`, tone: "sug" as const }));
  const gloss = (sl.glossary ?? []).slice(0, 6);
  const ba = sl.beforeAfter && (sl.beforeAfter.before || sl.beforeAfter.after) ? sl.beforeAfter : null;
  const avail = footerTop - bodyTop - 0.14;

  // choose the largest font that fits both columns
  const detW = (mainW - 0.2) / Math.max(1, Math.min(3, detail.length));
  const fitFor = (pt: number) => {
    const baH = ba ? 0.34 + Math.max(...[ba.before?.text ?? "", ba.after?.text ?? ""].map((t) => lines(t, pt, mainW / 2 - 0.65) * lineH(pt))) + 0.36 + lineH(pt - 1.5) + 0.12 : 0;
    const coreH = core.reduce((a, p) => a + panelHeight(p, pt, mainW) + 0.08, 0);
    const detH = detail.length ? Math.max(...detail.map((p) => panelHeight(p, pt, detW))) + 0.08 : 0;
    const sideGl = gloss.reduce((a, g) => a + lineH(pt) * (1 + lines(g.oneLine.text, pt - 1, sideW - 0.1)) + 0.05, 0.4);
    const sideSug = sug.reduce((a, p) => a + panelHeight(p, pt, sideW) + 0.08, 0);
    return { total: baH + (ba ? 0.08 : 0) + coreH + detH, side: sideGl + sideSug, baH };
  };
  let pt = 9;
  for (const cand of [15, 14.5, 14, 13.5, 13, 12.5, 12, 11.5, 11, 10.5, 10, 9.5, 9]) {
    const f = fitFor(cand);
    if (f.total <= avail && f.side <= avail) { pt = cand; break; }
  }

  const drawPanel = (p: Panel, x: number, y: number, w: number, h: number) => {
    const col = p.tone === "warn" ? C.red : p.tone === "sug" ? "A8710F" : "0B6BCB";
    s.addShape("roundRect", { x, y, w, h, fill: { color: p.tone === "warn" ? "FFF4F4" : p.tone === "sug" ? "FFF8E8" : C.white }, line: { color: p.tone === "warn" ? C.red : p.tone === "sug" ? "D9A441" : C.line, width: 1.25, ...(p.tone === "sug" ? { dashType: "dash" } : {}) }, rectRadius: 0.06 });
    s.addText(p.heading, { x: x + 0.1, y: y + 0.03, w: w - 0.2, h: 0.3, fontFace: FONT, fontSize: pt + 1.5, bold: true, color: col, margin: 0, valign: "middle" });
    s.addText(p.items.map((t) => ({ text: t, options: { bullet: { indent: 12 }, breakLine: true } })), { x: x + 0.12, y: y + 0.34, w: w - 0.24, h: h - 0.38, fontFace: FONT, fontSize: pt, color: "1F2A37", valign: "top", margin: 0, paraSpaceAfter: 2, fit: "shrink" });
  };

  let y = bodyTop;
  if (ba) {
    const f = fitFor(pt);
    s.addShape("roundRect", { x: M, y, w: mainW, h: f.baH, fill: { color: "F3F8FF" }, line: { color: "0B6BCB", width: 1.25 }, rectRadius: 0.06 });
    s.addText(ba.before ? "Before → After：何が変わるのか" : "何が嬉しいのか", { x: M + 0.1, y: y + 0.03, w: mainW - 0.2, h: 0.3, fontFace: FONT, fontSize: pt + 1.5, bold: true, color: "0B6BCB", margin: 0, valign: "middle" });
    const bw = (mainW - 0.6) / 2;
    const bt = y + 0.36, bh = f.baH - 0.44;
    if (ba.before) {
      s.addShape("roundRect", { x: M + 0.1, y: bt, w: bw, h: bh, fill: { color: "EEF1F5" }, line: { color: "C9D4E6", width: 1 }, rectRadius: 0.05 });
      s.addText([{ text: "Before", options: { bold: true, fontSize: pt - 1.5, color: C.mute, breakLine: true } }, ...runs(ba.before.text, { fontSize: pt })], { x: M + 0.18, y: bt + 0.03, w: bw - 0.16, h: bh - 0.06, fontFace: FONT, color: "1F2A37", margin: 0, valign: "top", fit: "shrink" });
      s.addText("→", { x: M + 0.1 + bw, y: bt, w: 0.4, h: bh, align: "center", valign: "middle", fontFace: FONT, fontSize: 18, bold: true, color: "0B6BCB", margin: 0 });
    }
    if (ba.after) {
      const ax = ba.before ? M + 0.1 + bw + 0.4 : M + 0.1;
      const aw = ba.before ? bw : mainW - 0.2;
      s.addShape("roundRect", { x: ax, y: bt, w: aw, h: bh, fill: { color: "E8F5EC" }, line: { color: C.green, width: 1 }, rectRadius: 0.05 });
      s.addText([{ text: ba.before ? "After" : "できるようになること", options: { bold: true, fontSize: pt - 1.5, color: C.green, breakLine: true } }, ...runs(ba.after.text, { fontSize: pt })], { x: ax + 0.08, y: bt + 0.03, w: aw - 0.16, h: bh - 0.06, fontFace: FONT, color: "1F2A37", margin: 0, valign: "top", fit: "shrink" });
    }
    y += f.baH + 0.08;
  }
  for (const p of core) { const h = panelHeight(p, pt, mainW); drawPanel(p, M, y, mainW, h); y += h + 0.08; }
  if (detail.length) {
    const cols = Math.min(3, detail.length);
    const h = Math.max(...detail.map((p) => panelHeight(p, pt, detW)));
    detail.slice(0, 3).forEach((p, i) => drawPanel(p, M + i * (detW + 0.1), y, detW, h));
  }

  // side column: glossary then suggestion
  let sy = bodyTop;
  if (gloss.length) {
    const gh = gloss.reduce((a, g) => a + lineH(pt) * (1 + lines(g.oneLine.text, pt - 1, sideW - 0.1)) + 0.05, 0.4);
    s.addShape("roundRect", { x: sideX, y: sy, w: sideW, h: gh, fill: { color: "F1F7FF" }, line: { color: "7AA7D9", width: 1.25 }, rectRadius: 0.06 });
    s.addText("用語ミニ解説", { x: sideX + 0.1, y: sy + 0.03, w: sideW - 0.2, h: 0.3, fontFace: FONT, fontSize: pt + 1.5, bold: true, color: "0B6BCB", margin: 0, valign: "middle" });
    s.addText(gloss.flatMap((g) => [
      { text: `${g.term}`, options: { bold: true, fontSize: pt, color: C.navy } },
      { text: `  ${TYPE_JA[g.type] ?? g.type}`, options: { fontSize: pt - 2.5, color: "1C5AA0", breakLine: true } },
      { text: g.oneLine.text, options: { fontSize: pt - 1, color: "1F2A37", breakLine: true } },
    ]), { x: sideX + 0.12, y: sy + 0.34, w: sideW - 0.24, h: gh - 0.38, fontFace: FONT, valign: "top", margin: 0, paraSpaceAfter: 2, fit: "shrink" });
    sy += gh + 0.08;
  }
  for (const p of sug) { const h = Math.min(panelHeight(p, pt, sideW), footerTop - sy - 0.05); drawPanel(p, sideX, sy, sideW, h); sy += h + 0.08; }

  // footer: links, meta, region stamp
  s.addShape("line", { x: M, y: footerTop + 0.02, w: W - 2 * M, h: 0, line: { color: "DDE3EC", width: 0.75 } });
  const link = (text: string, url: string): Run => ({ text, options: { hyperlink: { url }, color: "0B5CAD", underline: { style: "sng" } } });
  const learn = (sl.references.learn ?? []).slice(0, 3);
  const detailRuns: Run[] = [{ text: "詳細 ", options: { bold: true, color: C.gray } }];
  learn.forEach((l, i) => { if (i) detailRuns.push({ text: " ｜ ", options: { color: C.mute } }); detailRuns.push(link(l.title, l.url)); });
  const cats = sl.meta.categories.map((c) => labels[c] ?? c).join("・");
  s.addText([
    { text: "発表 ", options: { bold: true, color: C.gray } }, link("Azure Updates", sl.references.announcement), { text: "", options: { breakLine: true } },
    ...(learn.length ? [...detailRuns, { text: "", options: { breakLine: true } }] : []),
    { text: `${cats ? `分類: ${cats}　｜　` : ""}ID ${sl.key}`, options: { color: C.mute } },
  ], { x: M, y: footerTop + 0.06, w: 9.2, h: 0.8, fontFace: FONT, fontSize: 9.5, margin: 0, valign: "top", fit: "shrink" });
  const st = sl.region ? STAMP[sl.region.stamp] : undefined;
  if (st) {
    s.addShape("roundRect", { x: W - M - 3.6, y: footerTop + 0.1, w: 3.6, h: 0.72, fill: { color: st.color }, line: { color: st.color, width: 0 }, rectRadius: 0.08 });
    s.addText([{ text: st.text, options: { bold: true, fontSize: 13, breakLine: true } }, ...(sl.region?.note ? [{ text: sl.region.note, options: { fontSize: 8 } }] : [])], { x: W - M - 3.55, y: footerTop + 0.12, w: 3.5, h: 0.68, fontFace: FONT, color: C.white, margin: 0, valign: "middle", fit: "shrink" });
  }

  // notes: sources for reviewers
  const sources = (sl.references.learn ?? []).map((l) => `${l.title}: ${l.url}`);
  s.addNotes([`出典（Azure Updates）: ${sl.references.announcement}`, ...sources].join("\n"));
}
