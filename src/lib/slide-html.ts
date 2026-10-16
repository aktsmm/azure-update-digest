import { KIND_LABEL, type SlideKind } from "./slide-kind.js";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Minimal inline emphasis: **bold** only. Everything else is escaped. */
const rich = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

const MONTH_JA: Record<string, string> = { January: "1", February: "2", March: "3", April: "4", May: "5", June: "6", July: "7", August: "8", September: "9", October: "10", November: "11", December: "12" };
const monthJa = (a: { year: number; month: string }) => `${Number(a.year)}年${MONTH_JA[a.month] ?? a.month}月`;

const STAMP: Record<string, { text: string; cls: string }> = {
  global: { text: "グローバル（リージョン不問）", cls: "st-g" },
  "japan-both": { text: "東日本・西日本対応", cls: "st-ok" },
  "japan-east": { text: "東日本のみ対応", cls: "st-ok" },
  "japan-west": { text: "西日本のみ対応", cls: "st-ok" },
  "japan-none": { text: "日本リージョン未対応", cls: "st-no" },
};

export const PDF_CSS = `
@page { size: 1280px 720px; margin: 0 }
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;font-family:"Noto Sans CJK JP","Noto Sans JP","Yu Gothic UI","Meiryo","Segoe UI",sans-serif;color:#1b2430;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:1280px;height:720px;position:relative;overflow:hidden;page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
.slide{padding:20px 34px 14px;display:flex;flex-direction:column;gap:6px;--fs:15px}
.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.t{font-size:28px;font-weight:700;color:#0b2a4a;line-height:1.25}.t small{display:block;font-size:18px;font-weight:600;margin-top:2px}
.en{font-size:12.5px;color:#8a95a6;margin-top:2px}.dt{font-size:13.5px;color:#3d4a5c;font-weight:600;margin-left:12px}
.badge{color:#fff;font-weight:700;font-size:22px;padding:3px 22px;border-radius:999px;white-space:nowrap}
.k-ga{background:#1b7f3b}.k-preview{background:#7a4fd0}.k-retirement{background:#c62828}.k-announcement{background:#0b6bcb}.k-update{background:#5b6777}
.imp{display:flex;gap:8px}
.imp .c{flex:1;border-radius:6px;padding:calc(var(--fs) * .25) 10px;font-size:var(--fs);line-height:1.35;border:1.5px solid #c9d4e6;background:#fff}
.imp .c b.l{display:block;font-size:calc(var(--fs) * .8);color:#5b6777;font-weight:600}
.imp .c.who{border-color:#0b6bcb;background:#f3f8ff;font-weight:700;color:#0b2a4a}
.imp .act-yes{border-color:#c62828;background:#fdecec}.imp .act-optional{border-color:#1b7f3b;background:#eaf6ee}.imp .act-no,.imp .act-unknown{border-color:#0b6bcb;background:#eaf3ff}
.tl{display:flex;align-items:center}.tl .pt{flex:none;text-align:center;font-size:13px;width:170px}.tl .pt b{display:block;font-size:16px}.tl .ln{flex:1;height:4px;background:linear-gradient(90deg,#9fb0c8,#c62828);border-radius:2px}
.cols{display:flex;gap:14px;flex:1;min-height:0}
.main{flex:1.9;display:flex;flex-direction:column;gap:5px;min-width:0}
.row2{display:flex;gap:10px}.row2 .card{flex:1;min-width:0}
.side{flex:1;display:flex;flex-direction:column;gap:9px;min-width:0;--fs:var(--sfs)}
.card{border:1.5px solid #b8c7dc;border-radius:8px;padding:calc(var(--fs) * .4) 12px;background:#fff}
.card h3{margin:0 0 3px;font-size:calc(var(--fs) + 2px);color:#0b6bcb}
.card.hot{border-color:#0b6bcb;background:#f3f8ff}.card.red{border-color:#c62828;background:#fff4f4}.card.red h3{color:#c62828}
.card.sug{border:1.5px dashed #d9a441;background:#fff8e8;flex:1}.card.sug h3{color:#a8710f}
.card.gl{border-color:#7aa7d9;background:#f1f7ff}
ul{margin:0;padding-left:20px;font-size:var(--fs);line-height:1.4}li{margin:calc(var(--fs) * .1) 0}
.ba{display:flex;gap:8px;align-items:stretch}
.ba .p{flex:1;border-radius:6px;padding:6px 10px;font-size:var(--fs);line-height:1.45}
.ba .bf{background:#f1f3f6;border:1.5px solid #c4ccd8}.ba .af{background:#e8f6ec;border:1.5px solid #1b7f3b}
.ba .p b.l{display:block;font-size:12.5px;margin-bottom:2px}.ba .bf b.l{color:#5b6777}.ba .af b.l{color:#1b7f3b}
.ba .ar{align-self:center;font-size:24px;color:#0b6bcb;font-weight:700}
.term{font-size:calc(var(--fs) - 1px);line-height:1.4;margin:0 0 calc(var(--fs) * .4)}.term b{color:#0b2a4a}
.term .k{display:inline-block;font-size:11px;background:#dbe9fb;color:#1c5aa0;border-radius:3px;padding:0 5px;margin-left:4px}
.ft a{color:#0b5cad;text-decoration:underline}.lk .fl{font-weight:700;color:#3d4a5c;margin-right:4px}.lk .ls{line-height:1.35}
.ft{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;font-size:12.5px;color:#6b778a;border-top:1px solid #dde3ec;padding-top:6px;margin-top:auto}
.stamp{display:inline-flex;flex-direction:column;gap:1px;border-radius:6px;padding:3px 12px;color:#fff;font-weight:700;font-size:15px;line-height:1.25;min-width:230px;max-width:520px}
.stamp small{font-weight:400;font-size:11.5px;opacity:.95}
.st-g{background:#1c6bd0}.st-ok{background:#1b7f3b}.st-no{background:#c62828}
.cover{display:flex;flex-direction:column;background:#fff;color:#243a5e}
.cover .cv-bar{height:14px;background:linear-gradient(90deg,#0078d4 0 70%,#50e6ff 70% 85%,#243a5e 85%)}
.cover .cv-body{flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 96px;background:linear-gradient(120deg,#fff 0 55%,#eaf3fc 55%)}
.cover .cv-eyebrow{font-size:22px;font-weight:600;color:#0078d4;letter-spacing:.06em;margin-bottom:12px}
.cover h1{font-size:68px;margin:0 0 28px;color:#243a5e;line-height:1.2}
.cover .cv-period{font-size:28px;color:#0078d4;font-weight:600}
.cover .cv-count{font-size:26px;margin-top:14px;color:#3d4a5c}.cover .cv-count b{font-size:44px;color:#243a5e}
.cover .cv-foot{display:flex;justify-content:space-between;padding:16px 96px;background:#243a5e;color:#e6eef9;font-size:16px}
.plain{padding:50px 70px}.plain h2{font-size:34px;color:#0b2a4a;margin:0 0 18px}
.toc{font-size:20px;line-height:1.9}.toc .n{display:inline-block;width:44px;color:#0b6bcb;font-weight:700}
.end{display:flex;flex-direction:column;background:#fff;color:#243a5e}
.end .cv-bar{height:14px;background:linear-gradient(90deg,#0078d4 0 70%,#50e6ff 70% 85%,#243a5e 85%)}
.end .en-body{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;background:linear-gradient(120deg,#fff 0 45%,#eaf3fc 45%)}
.end h1{font-size:64px;margin:0 0 12px;color:#243a5e}.end .en-sub{font-size:26px;color:#0078d4;font-weight:600}
.end .en-foot{display:flex;justify-content:space-between;padding:16px 96px;background:#243a5e;color:#e6eef9;font-size:16px}
`;

export interface Slide {
  key: string; kind: SlideKind; label: string;
  title: { ja: string; subtitleJa?: string; en: string };
  meta: { publishedJst: string; availability: { rawRing: string; year: number; month: string }[]; status: string | null; products: string[]; categories: string[] };
  audience: { who: { text: string }; change: { text: string }; changeNature: string };
  action: { required: string; summary: { text: string }; deadline?: { date?: string; month?: string; precision: string } };
  beforeAfter?: { before?: { text: string }; after?: { text: string } };
  timeline?: { label: string; when: { date?: string; month?: string } }[];
  panels: { id: string; heading: string; availability: string; priority: string; items?: { text: string; assertion: string }[] }[];
  glossary?: { term: string; type: string; oneLine: { text: string } }[];
  region?: { stamp: string; note?: string };
  references: { announcement: string; learn?: { title: string; url: string }[] };
  speakerNotes?: { qa?: { q: string; a: string; evidence: { url: string }[] }[] };
}

const TYPE_JA: Record<string, string> = { product: "製品", feature: "機能", term: "用語", label: "ラベル" };
const ACT_LABEL: Record<string, string> = { yes: "要対応", optional: "任意", no: "対応不要", unknown: "情報" };
export const CATEGORY_JA: Record<string, string> = { compute: "コンピュート", networking: "ネットワーク", storage: "ストレージ", databases: "データベース", ai: "AI", security: "セキュリティ", containers: "コンテナー", "ops-governance": "運用・ガバナンス", integration: "インテグレーション", iot: "IoT", devtools: "開発ツール", "web-mobile": "Web・モバイル", other: "その他" };

export interface SlideOptions { fs: number; /** font size of the right column (glossary, suggestion); defaults to fs */ sfs?: number; includeDetail: boolean; continuation?: boolean }

export function slideHtml(s: Slide, o: SlideOptions): string {
  const when = (w?: { date?: string; month?: string }) => (w?.date ?? w?.month ?? "");
  const dateLine = s.meta.availability.length ? `掲載 ${s.meta.publishedJst} ｜ ${s.kind === "retirement" ? "終了" : "時期"} ${monthJa(s.meta.availability[0]!)}` : `掲載 ${s.meta.publishedJst}`;
  const deadline = s.action.deadline ? `　${esc(when(s.action.deadline))}` : "";
  const panels = s.panels.filter((p) => p.availability === "present" && (p.priority === "core" || (o.includeDetail && p.priority === "detail")));
  const isSug = (p: Slide["panels"][number]) => (p.items ?? []).every((i) => i.assertion === "recommendation");
  const mainPanels = panels.filter((p) => !isSug(p));
  const sugPanels = panels.filter(isSug);
  const items = (p: Slide["panels"][number]) => `<ul>${(p.items ?? []).map((i) => `<li>${rich(i.text)}</li>`).join("")}</ul>`;
  const panelCard = (p: Slide["panels"][number]) => `<div class="card ${/制約|注意|権限|影響/.test(p.heading) && s.kind !== "ga" ? "red" : ""}"><h3>${esc(p.heading)}</h3>${items(p)}</div>`;
  const ba = s.beforeAfter && (s.beforeAfter.before || s.beforeAfter.after)
    ? `<div class="card hot"><h3>${s.beforeAfter.before ? "Before → After：何が変わるのか" : "何が嬉しいのか"}</h3><div class="ba">${s.beforeAfter.before ? `<div class="p bf"><b class="l">Before</b>${rich(s.beforeAfter.before.text)}</div><div class="ar">→</div>` : ""}${s.beforeAfter.after ? `<div class="p af"><b class="l">${s.beforeAfter.before ? "After" : "できるようになること"}</b>${rich(s.beforeAfter.after.text)}</div>` : ""}</div></div>`
    : "";
  const corePanels = mainPanels.filter((p) => p.priority === "core");
  const detailPanels = mainPanels.filter((p) => p.priority !== "core");
  const detailRow = detailPanels.length ? `<div class="row2">${detailPanels.map(panelCard).join("")}</div>` : "";
  const detailsOnlyPage = !!o.continuation;
  const mainHtml = detailsOnlyPage ? `<div class="row2">${detailPanels.map(panelCard).join("")}</div>` : `${ba}${corePanels.map(panelCard).join("")}${detailRow}`;
  const tl = s.timeline?.length ? `<div class="tl">${s.timeline.map((t, i, a) => `<div class="pt"${i === a.length - 1 ? ' style="color:#c62828"' : ""}><b>${esc(when(t.when))}</b>${esc(t.label)}</div>${i < a.length - 1 ? '<div class="ln"></div>' : ""}`).join("")}</div>` : "";
  const glossary = (s.glossary ?? []).length
    ? `<div class="card gl"><h3>用語ミニ解説</h3>${(s.glossary ?? []).map((g) => `<div class="term"><b>${esc(g.term)}</b><span class="k">${esc(TYPE_JA[g.type] ?? g.type)}</span><br>${esc(g.oneLine.text)}</div>`).join("")}</div>`
    : "";
  const sug = sugPanels.length ? `<div class="card sug"><h3>${esc(sugPanels[0]!.heading)}（提案）</h3>${sugPanels.map(items).join("")}</div>` : "";
  const stamp = s.region && STAMP[s.region.stamp] ? `<div class="stamp ${STAMP[s.region.stamp]!.cls}">${STAMP[s.region.stamp]!.text}${s.region.note ? `<small>${esc(s.region.note)}</small>` : ""}</div>` : "<div></div>";
  const link = (url: string, text: string) => `<a href="${esc(url)}">${esc(text)}</a>`;
  const learn = (s.references.learn ?? []).slice(0, 3).map((l) => link(l.url, l.title)).join(" ｜ ");
  const meta2 = [s.meta.categories.length ? `分類: ${esc(s.meta.categories.map((c) => CATEGORY_JA[c] ?? c).join("・"))}` : "", `ID ${esc(s.key)}`].filter(Boolean).join(" ｜ ");
  return `<section class="page slide" data-key="${esc(s.key)}" style="--fs:${o.fs}px;--sfs:${o.sfs ?? o.fs}px">
  <div class="hd"><div><div class="t">${esc(s.title.ja)}${s.title.subtitleJa ? `<small>― ${esc(s.title.subtitleJa)}</small>` : ""}${o.continuation ? "<small>（続き）</small>" : ""}</div><div class="en">${esc(s.title.en)}<span class="dt">${esc(dateLine)}</span></div></div><span class="badge k-${s.kind}">${esc(s.label || KIND_LABEL[s.kind])}</span></div>
  ${detailsOnlyPage ? "" : `<div class="imp"><div class="c who"><b class="l">誰に関係するか</b>${rich(s.audience.who.text)}</div><div class="c"><b class="l">${s.audience.changeNature === "benefit" ? "嬉しい点" : s.audience.changeNature === "breaking" ? "変わること（嬉しくない変更）" : "変わること"}</b>${esc(s.audience.change.text)}</div><div class="c act-${esc(s.action.required)}"><b class="l">対応の要否</b><b>${ACT_LABEL[s.action.required] ?? ""}</b>　${esc(s.action.summary.text)}  ${deadline}</div></div>`}
    ${detailsOnlyPage ? "" : tl}
  <div class="cols"><div class="main">${mainHtml}</div><div class="side">${detailsOnlyPage ? "" : glossary + sug}</div></div>
  <div class="ft"><div class="lk"><div><b class="fl">発表</b> ${link(s.references.announcement, "Azure Updates")}</div>${learn ? `<div><b class="fl">詳細</b> ${learn}</div>` : ""}<div>${meta2}</div></div>${stamp}</div>
</section>`;
}

export interface Deck {
  schemaVersion: 1;
  selection: { mode: string; period?: { start: string; end: string }; ids?: string[]; basis: string; coverage: string; snapshotAt: string };
  slides: Slide[];
}

export function coverHtml(d: Deck): string {
  const period = d.selection.mode === "period" && d.selection.period ? `<div class="cv-period">対象期間 ${esc(d.selection.period.start)} 〜 ${esc(d.selection.period.end)}</div>` : "";
  return `<section class="page cover"><div class="cv-bar"></div><div class="cv-body"><div class="cv-eyebrow">Microsoft Azure</div><h1>Azure アップデート情報</h1>${period}<div class="cv-count"><b>${d.slides.length}</b> 件</div></div><div class="cv-foot"><span>作成日 ${esc(d.selection.snapshotAt.slice(0, 10))}（UTC）</span><span>出典: Microsoft Azure Updates ／ Microsoft Learn</span></div></section>`;
}

export function tocHtml(d: Deck): string {
  const order: SlideKind[] = ["preview", "ga", "retirement", "announcement", "update"];
  const sorted = [...d.slides].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.meta.publishedJst < b.meta.publishedJst ? 1 : -1) || (a.key < b.key ? -1 : 1));
  return `<section class="page plain"><h2>目次・概要</h2><div class="toc">${sorted.map((s, i) => `<div><span class="n">${i + 1}.</span>【${esc(s.label)}】${esc(s.title.ja)}</div>`).join("")}</div></section>`;
}

export function endHtml(): string {
  return `<section class="page end"><div class="cv-bar"></div><div class="en-body"><h1>以上</h1><div class="en-sub">Azure アップデート情報</div></div><div class="en-foot"><span>Created by yamapan（GitHub: aktsmm）</span><span>出典: Microsoft Azure Updates ／ Microsoft Learn</span></div></section>`;
}

export function documentHtml(d: Deck, slidePages: string[]): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Azure アップデート情報</title><style>${PDF_CSS}</style></head><body>${coverHtml(d)}${tocHtml(d)}${slidePages.join("")}${endHtml()}</body></html>`;
}
