import { addDays, isValidDateString, monthBounds, resolvePeriod, toJstDate, type Period } from "../lib/period.js";
import { defaultQuery, runQuery, type DigestItem, type Query, type QueryResult } from "../lib/query.js";
import type { SiteMeta } from "../lib/site-data.js";
import type { SlideEntry } from "./pdf-merge.js";
import { orderSlides } from "../lib/slide-order.js";
import { KIND_LABEL } from "../lib/slide-kind.js";
import { decryptBytes, deriveKey, type PdfCryptoInfo } from "../lib/pdf-crypto.js";
import type { SlideKind } from "../lib/slide-kind.js";

declare const __PDF_MERGE_V__: string;
declare const __PPTX_BUILD_V__: string;
const app = document.getElementById("app")!;
let items: DigestItem[] = [];
let meta: SiteMeta;
let slideEntries = new Map<string, SlideEntry>();
let pdfCrypto: PdfCryptoInfo | null = null;
let samplePdf = false;
let pdfKey: { pw: string; key: CryptoKey } | null = null;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const KIND_FILTERS: SlideKind[] = ["ga", "preview", "retirement", "announcement", "update"];
const catLabel = (id: string) => meta.categories.find((c) => c.id === id)?.label ?? id;
const impLabel = (id: string) => meta.importanceLevels.find((c) => c.id === id)?.label ?? id;
const safeUrl = (u: string) => (/^https:\/\//.test(u) ? esc(u) : "#");

function parseHash(): { path: string; params: URLSearchParams } {
  const h = location.hash.replace(/^#/, "");
  if (h.startsWith("update-")) return { path: "/update", params: new URLSearchParams({ key: h.slice(7) }) };
  const [path = "/", qs = ""] = h.split("?");
  return { path: path || "/", params: new URLSearchParams(qs) };
}

function queryFrom(params: URLSearchParams, forcedPeriod?: Period): Query {
  const now = Date.now();
  let period: Period;
  try {
    const s = params.get("start"), e = params.get("end"), b = params.get("base");
    period = forcedPeriod ?? resolvePeriod({ now, ...(s && e ? { start: s, end: e } : b ? { base: b } : {}) });
  } catch {
    period = resolvePeriod({ now });
  }
  const q = defaultQuery(period);
  q.basis = params.get("basis") === "modified" ? "modified" : "created";
  q.mode = params.get("mode") === "availability" ? "availability" : "dated";
  q.categories = (params.get("cat") ?? "").split(",").filter(Boolean);
  q.kinds = (params.get("kind") ?? "").split(",").filter((k) => (KIND_FILTERS as string[]).includes(k));
  q.importance = params.get("imp") === "high" ? "high" : params.get("imp") === "notable" ? "notable-or-high" : "all";
  q.text = params.get("q") ?? "";
  return q;
}

function toParams(q: Query, keepPeriod: boolean): string {
  const p = new URLSearchParams();
  if (keepPeriod) { p.set("start", q.period.start); p.set("end", q.period.end); }
  if (q.basis === "modified") p.set("basis", "modified");
  if (q.mode === "availability") p.set("mode", "availability");
  if (q.categories.length) p.set("cat", q.categories.join(","));
  if (q.kinds.length) p.set("kind", q.kinds.join(","));
  if (q.importance !== "all") p.set("imp", q.importance === "high" ? "high" : "notable");
  if (q.text) p.set("q", q.text);
  return p.toString();
}

function coverageBanner(r: QueryResult): string {
  const c = r.coverage;
  const ranges = c.coveredRanges.map((x) => `${x.start}〜${x.end}`).join(", ") || "なし";
  // fully fetched periods need no banner; only partial / not-fetched states are called out (data time is in the footer)
  if (c.status === "complete") return "";
  if (c.status === "partial") return `<div class="banner partial"><strong>取得状態: 一部のみ取得</strong>　取得済みの範囲: ${esc(ranges)}。件数は取得済み分のみで、全件ではありません。${c.note ? `<br>${esc(c.note)}` : ""}</div>`;
  return `<div class="banner not-fetched"><strong>取得状態: 未取得</strong>　この期間はまだ取得していないため、「0件」ではありません。</div>`;
}

function backfillPanel(): string {
  if (meta.backfill.complete) return "";
  const names: Record<string, string> = { complete: "全件", partial: "部分", "in-progress": "取得中", "not-started": "未取得", failed: "失敗" };
  const rows = meta.backfill.months.map((m) => `<tr><td>${esc(m.month)}</td><td>${esc(names[m.status] ?? m.status)}</td><td>${m.uniqueIds}${m.totalCount !== null ? ` / ${m.totalCount}` : ""}</td></tr>`).join("");
  return `<details class="panel" open><summary><strong>初期取得（直近12ヶ月）は進行中です</strong></summary><table><thead><tr><th>月 (JST)</th><th>状態</th><th>取得ID数 / 総数</th></tr></thead><tbody>${rows}</tbody></table></details>`;
}

function badges(i: DigestItem): string {
  const b: string[] = [];
  if (i.importance.level !== "normal") b.push(`<span class="badge ${i.importance.level}">${esc(impLabel(i.importance.level))}</span>`);
  for (const c of i.categories) b.push(`<span class="badge">${esc(catLabel(c))}</span>`);
  if (i.status) b.push(`<span class="badge">${esc(i.status)}</span>`);
  for (const a of i.availabilities) b.push(`<span class="badge">${esc(a.ring)} ${a.year}年${esc(a.month)}</span>`);
  return `<div class="badges">${b.join("")}</div>`;
}

// keys the user unchecked; everything is selected by default and the choice survives filter changes
const deselected = new Set<string>();

function card(i: DigestItem): string {
  const summary =
    i.summary.state === "generated" ? `<p class="summary">${esc(i.summary.text ?? "")}</p>`
    : i.summary.state === "stale" ? `<p class="summary missing">要約未生成（原文の更新により再生成待ち）</p>`
    : `<p class="summary missing">要約未生成</p>`;
  const relNames: Record<string, string> = { "not-found": "公式資料は見つかりませんでした", error: "確認に失敗しました", uninvestigated: "未調査", verified: "なし" };
  const rel =
    i.related.items.length > 0 ? `<div>関連資料（Microsoft Learn）<ul>${i.related.items.map((r) => `<li><a href="${safeUrl(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a></li>`).join("")}</ul></div>`
    : `<div class="meta">関連資料: ${relNames[i.related.status]}</div>`;
  return `<article class="card" id="update-${esc(i.key)}">
    <div class="card-head"><label class="sel" title="ダウンロード（JSON・PDF・PPTX）に含める"><input type="checkbox" data-sel="${esc(i.key)}" ${deselected.has(i.key) ? "" : "checked"} aria-label="ダウンロードに含める"></label><h3><a class="anchor" href="#update-${esc(i.key)}" title="この更新へのリンク">#</a>${esc(i.titleJa ?? i.title)}</h3><span class="kind k-${i.kind}">${esc(KIND_LABEL[i.kind])}</span></div>
    ${i.titleJa ? `<div class="orig">${esc(i.title)}</div>` : ""}
    <div class="meta">作成 ${esc(i.createdJst)} ／ 更新 ${esc(i.modifiedJst)} ／ ID ${esc(i.key)}</div>
    ${badges(i)}${summary}
    <div class="links"><a href="${safeUrl(i.sourceUrl)}" target="_blank" rel="noopener noreferrer">原文（Azure Updates）</a>${rel}</div>
  </article>`;
}

function periodForm(q: Query, fixedMonth: string | null, dl: string): string {
  const chips = meta.categories.map((c) => `<label class="chip"><input type="checkbox" name="cat" value="${esc(c.id)}" ${q.categories.includes(c.id) ? "checked" : ""}>${esc(c.label)}</label>`).join("");
  const kindChips = KIND_FILTERS.map((k) => `<label class="chip kind-chip k-${k}"><input type="checkbox" name="kind" value="${k}" ${q.kinds.includes(k) ? "checked" : ""}>${esc(KIND_LABEL[k])}</label>`).join("");
  return `<form class="panel" id="f">
    ${fixedMonth ? "" : `<div class="row">
      <label>開始 <input type="date" name="start" value="${q.period.start}"></label>
      <label>終了 <input type="date" name="end" value="${q.period.end}"></label>
      <label>基準日 <input type="date" name="base"></label>
      <button type="button" data-act="d30">過去30日</button><button type="button" data-act="d7">過去7日</button>
    </div>`}
    <div class="row" style="margin-top:8px">
      <label>日付の基準 <select name="basis"><option value="created" ${q.basis === "created" ? "selected" : ""}>作成日</option><option value="modified" ${q.basis === "modified" ? "selected" : ""}>更新日</option></select></label>
      <label>重要度 <select name="imp"><option value="all">すべて</option><option value="notable" ${q.importance === "notable-or-high" ? "selected" : ""}>注目以上</option><option value="high" ${q.importance === "high" ? "selected" : ""}>重要のみ</option></select></label>
      <input type="search" name="q" placeholder="タイトル・要約・製品で検索" value="${esc(q.text)}">
      ${dl}
    </div>
    <div class="chips" style="margin-top:8px"><span class="chips-label">種類</span>${kindChips}</div>
    <div class="chips" style="margin-top:6px"><span class="chips-label">カテゴリ</span>${chips}</div>
  </form>`;
}

function debounce(fn: () => void, ms: number) {
  let t: number | undefined;
  return () => { clearTimeout(t); t = window.setTimeout(fn, ms); };
}

function bind(q: Query, fixedMonth: string | null, basePath: string) {
  const f = document.getElementById("f") as HTMLFormElement;
  const apply = () => {
    const d = new FormData(f);
    const nq: Query = { ...q, categories: d.getAll("cat").map(String), kinds: d.getAll("kind").map(String), basis: d.get("basis") === "modified" ? "modified" : "created", importance: d.get("imp") === "high" ? "high" : d.get("imp") === "notable" ? "notable-or-high" : "all", text: String(d.get("q") ?? "") };
    let start = String(d.get("start") ?? q.period.start), end = String(d.get("end") ?? q.period.end);
    const base = String(d.get("base") ?? "");
    if (!fixedMonth && base && isValidDateString(base) && base <= toJstDate(Date.now())) { end = base; start = addDays(base, -29); }
    if (!fixedMonth && isValidDateString(start) && isValidDateString(end) && start <= end && end <= toJstDate(Date.now())) nq.period = { start, end };
    location.hash = `${basePath}?${toParams(nq, !fixedMonth)}`;
  };
  f.addEventListener("change", apply);
  f.addEventListener("submit", (e) => { e.preventDefault(); apply(); });
  f.querySelector("input[type=search]")?.addEventListener("input", debounce(apply, 400));
  f.querySelectorAll("button[data-act]").forEach((b) => b.addEventListener("click", () => {
    const days = (b as HTMLElement).dataset.act === "d7" ? 7 : 30;
    const end = toJstDate(Date.now());
    (f.elements.namedItem("start") as HTMLInputElement).value = addDays(end, -(days - 1));
    (f.elements.namedItem("end") as HTMLInputElement).value = end;
    (f.elements.namedItem("base") as HTMLInputElement).value = "";
    apply();
  }));
}

function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function selectionLabel(q: Query, r: QueryResult) {
  const cats = q.categories.length ? q.categories.map(catLabel).join("・") : "すべて";
  return { period: `${q.period.start} 〜 ${q.period.end}`, cats, file: `azure-updates_${q.period.start}_${q.period.end}` };
}

function downloadBar(r: QueryResult, q: Query): string {
  const sample = samplePdf ? `<a href="pdf/sample.pdf" target="_blank" rel="noopener noreferrer" title="最新のスライド 1 件（パスワード不要）">サンプル PDF</a>` : "";
  const pdf = pdfCrypto && slideEntries.size
    ? `<button type="button" data-dl="pdf" title="選択した更新のうちスライド作成済み（直近3か月）のものをまとめた PDF。ダウンロードにはパスワードが必要です"></button>`
    : "";
  const pptx = pdfCrypto && slideEntries.size
    ? `<button type="button" data-dl="pptx" title="選択した更新を編集できる PowerPoint（.pptx）で。ダウンロードにはパスワードが必要です"></button>`
    : "";
  return `<span class="dl-actions" id="dl"><span class="selbar"><span id="selcount"></span><button type="button" class="mini" data-sel-all title="表示中の更新をすべて選択">全選択</button><button type="button" class="mini" data-sel-none title="表示中の更新をすべて解除">全解除</button></span><button type="button" data-dl="json" title="選択した更新（スライド JSON を含む）"></button>${pdf}${pptx}${sample}<span class="meta" id="dl-status"></span></span>`;
}

function bindDownload(r: QueryResult, q: Query) {
  const status = document.getElementById("dl-status")!;
  const sel = selectionLabel(q, r);
  const chosen = () => r.items.filter((i) => !deselected.has(i.key));
  const withSlides = () => chosen().filter((i) => slideEntries.has(i.key));
  const refresh = () => {
    const n = chosen().length, s = withSlides().length;
    const set = (dl: string, label: string, count: number) => {
      const b = document.querySelector<HTMLButtonElement>(`[data-dl="${dl}"]`);
      if (b) { b.textContent = `${label}（${count}）`; b.disabled = count === 0; }
    };
    set("json", "JSON", n); set("pdf", "PDF", s); set("pptx", "PPTX", s);
    const c = document.getElementById("selcount");
    if (c) c.textContent = `出力対象 ${n} / ${r.items.length} 件`;
  };
  document.querySelectorAll<HTMLInputElement>("input[data-sel]").forEach((cb) => cb.addEventListener("change", () => {
    const key = cb.dataset.sel!;
    if (cb.checked) deselected.delete(key); else deselected.add(key);
    // the same update can appear in both the highlights and the list
    document.querySelectorAll<HTMLInputElement>(`input[data-sel="${CSS.escape(key)}"]`).forEach((o) => { o.checked = cb.checked; });
    refresh();
  }));
  const setAll = (on: boolean) => {
    for (const i of r.items) { if (on) deselected.delete(i.key); else deselected.add(i.key); }
    document.querySelectorAll<HTMLInputElement>("input[data-sel]").forEach((cb) => { cb.checked = !deselected.has(cb.dataset.sel!); });
    refresh();
  };
  document.querySelector("[data-sel-all]")?.addEventListener("click", () => setAll(true));
  document.querySelector("[data-sel-none]")?.addEventListener("click", () => setAll(false));
  refresh();
  const fileName = () => (chosen().length === r.items.length ? sel.file : `${sel.file}_selected`);
  document.querySelector('[data-dl="json"]')?.addEventListener("click", async () => {
    status.textContent = "作成中…";
    const slides: unknown[] = [];
    const picked = chosen();
    for (const i of picked) {
      if (!slideEntries.has(i.key)) continue;
      try { slides.push(...((await (await fetch(`slides/${i.key}.json`)).json()) as { slides: unknown[] }).slides); } catch { /* slide JSON is optional */ }
    }
    const body = {
      schema: 1,
      selection: { period: q.period, basis: q.basis, mode: q.mode, categories: q.categories, importance: q.importance, text: q.text, snapshotAt: meta.snapshotAt, coverage: r.coverage.status },
      items: picked,
      slides,
    };
    download(`${fileName()}.json`, new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }));
    status.textContent = `JSON を保存しました（更新 ${picked.length} 件、スライド ${slides.length} 件）`;
  });
  document.querySelector('[data-dl="pdf"]')?.addEventListener("click", async () => {
    const entries = orderSlides(withSlides().map((i) => slideEntries.get(i.key)!).map((e) => ({ ...e, kind: e.kind as SlideKind })));
    if (!entries.length) return;
    const pw = askPassword();
    if (!pw) { status.textContent = "パスワードを入力してください。"; return; }
    status.textContent = "PDF 作成の準備中…";
    try {
      await new Promise<void>((ok, ng) => {
        if ((window as unknown as { PdfMerge?: unknown }).PdfMerge) return ok();
        const s = document.createElement("script");
        s.src = `pdf-merge.js?v=${__PDF_MERGE_V__}`;
        s.onload = () => ok();
        s.onerror = () => ng(new Error("script"));
        document.head.append(s);
      });
      const font = await (await fetch("fonts/NotoSansJP.ttf")).arrayBuffer();
      const lib = (window as unknown as { PdfMerge: typeof import("./pdf-merge.js") }).PdfMerge;
      const bytes = await lib.buildDeckPdf(
        {
          entries, categoryLabels: Object.fromEntries(meta.categories.map((c) => [c.id, c.label])),
          periodLabel: q.mode === "dated" ? sel.period : null, totalInPeriod: chosen().length, createdUtc: new Date().toISOString(),
          onProgress: (d, t) => { status.textContent = `PDF を結合中… ${d} / ${t}`; },
        },
        font,
        (key) => fetchPdf(key, pw),
      );
      download(`${fileName()}.pdf`, new Blob([bytes as BlobPart], { type: "application/pdf" }));
      status.textContent = `PDF を保存しました（${entries.length} 件）`;
    } catch (e) {
      status.textContent = e instanceof WrongPasswordError ? "パスワードが違います。" : "PDF を作成できませんでした。時間をおいて再度お試しください。";
    }
  });
  document.querySelector('[data-dl="pptx"]')?.addEventListener("click", async () => {
    const entries = withSlides();
    if (!entries.length) return;
    const pw = askPassword();
    if (!pw) { status.textContent = "パスワードを入力してください。"; return; }
    status.textContent = "PowerPoint 作成の準備中…";
    try {
      // the slide JSON is public, so the password is checked by decrypting one encrypted PDF
      await fetchPdf(entries[0]!.key, pw);
      await new Promise<void>((ok, ng) => {
        if ((window as unknown as { PptxBuild?: unknown }).PptxBuild) return ok();
        const s = document.createElement("script");
        s.src = `pptx-build.js?v=${__PPTX_BUILD_V__}`;
        s.onload = () => ok();
        s.onerror = () => ng(new Error("script"));
        document.head.append(s);
      });
      const slides: unknown[] = [];
      for (const [n, i] of entries.entries()) {
        status.textContent = `スライドを読み込み中… ${n + 1} / ${entries.length}`;
        slides.push(...((await (await fetch(`slides/${i.key}.json`)).json()) as { slides: unknown[] }).slides);
      }
      const lib = (window as unknown as { PptxBuild: typeof import("./pptx-build.js") }).PptxBuild;
      status.textContent = "PowerPoint を作成中…";
      const bytes = await lib.buildDeckPptx({
        slides: slides as never, categoryLabels: Object.fromEntries(meta.categories.map((c) => [c.id, c.label])),
        periodLabel: q.mode === "dated" ? sel.period : null, totalInPeriod: chosen().length, createdUtc: new Date().toISOString(),
      });
      download(`${fileName()}.pptx`, new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
      status.textContent = `PowerPoint を保存しました（${entries.length} 件）`;
    } catch (e) {
      status.textContent = e instanceof WrongPasswordError ? "パスワードが違います。" : "PowerPoint を作成できませんでした。時間をおいて再度お試しください。";
    }
  });
}

class WrongPasswordError extends Error {}

function askPassword(): string {
  return pdfKey?.pw || window.prompt("パスワードを入力してください") || "";
}

/** Fetches an encrypted slide PDF and decrypts it; the key is derived once per password. */
async function fetchPdf(key: string, pw: string): Promise<ArrayBuffer> {
  if (!pdfCrypto) throw new Error("PDF is not published");
  if (!pdfKey || pdfKey.pw !== pw) pdfKey = { pw, key: await deriveKey(pw, pdfCrypto) };
  const res = await fetch(`pdf/${key}.pdf.enc`);
  if (!res.ok) throw new Error("fetch");
  try {
    return await decryptBytes(pdfKey.key, await res.arrayBuffer());
  } catch {
    pdfKey = null;
    throw new WrongPasswordError();
  }
}

function jstStamp(iso: string | null): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "未取得";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

// counts come from the same period/filter module as the list, so the hero never disagrees with the headings
function hero(): string {
  const today = toJstDate(Date.now());
  const run = (days: number) => runQuery(items, defaultQuery({ start: addDays(today, -(days - 1)), end: today }), meta.coverage, meta.snapshotAt);
  const day = run(1), week = run(7);
  const partial = day.coverage.status === "complete" && week.coverage.status === "complete" ? "" : "（一部のみ取得）";
  return `<section class="hero"><div class="hero-main">
      <p class="eyebrow">UNOFFICIAL UPDATE DIGEST</p>
      <h1>Azure の更新を、埋もれさせない。</h1>
      <p>Microsoft Release Communications の Azure 更新を毎日収集し、日本語の要約とスライドで追えるように整理します。重要な更新（廃止・セキュリティ・GA・リージョン追加・価格変更）を先頭に、新着を月別に遡れます。</p>
      <div class="pills"><span class="pill">最終更新 <strong>${esc(jstStamp(meta.snapshotAt))}</strong>（JST）</span><span class="pill">取得状態 <strong>${meta.backfill.complete ? "全期間 取得済み" : "初期取得中"}</strong></span></div>
    </div><div class="hero-stats">
      <div class="stat"><span class="stat-label">追跡中の更新</span><strong>${meta.itemCount}</strong><span class="meta">累計・重複除去後</span></div>
      <div class="stat"><span class="stat-label">新規（作成日基準）</span><strong>${day.items.length} / ${week.items.length}</strong><span class="meta">今日 / 過去7日${esc(partial)}</span></div>
    </div></section>`;
}

function renderList(q: Query, heading: string, fixedMonth: string | null, basePath: string) {
  const r = runQuery(items, q, meta.coverage, meta.snapshotAt);
  const basisLabel = q.mode === "availability" ? "提供・廃止予定（月単位）" : q.basis === "created" ? "作成日基準" : "更新日基準";
  const filtered = r.items.length !== r.periodTotal ? `（期間内 ${r.periodTotal} 件中、絞り込み後 ${r.items.length} 件）` : "";
  const empty = r.items.length === 0
    ? `<div class="empty">${r.coverage.status === "complete" ? "条件に一致する更新はありません。" : "取得範囲外・一部取得のため、0件とは断定できません。取得状態を確認してください。"}</div>` : "";
  const hl = q.mode === "dated" && r.highlights.length ? `<h2>重要更新（${r.highlights.length}件）</h2>${r.highlights.map(card).join("")}` : "";
  const note = q.mode === "availability" ? "<p class='meta'>提供時期は公式の月単位表記のまま表示しています（日付への換算はしていません）。</p>" : "";
  app.innerHTML = `${basePath === "/" ? `${hero()}<h2>${esc(heading)}</h2>` : `<h1>${esc(heading)}</h1>`}
    <p><strong>${esc(q.period.start)} 〜 ${esc(q.period.end)}</strong>（JST・${basisLabel}）: <strong>${r.items.length} 件</strong> ${filtered}</p>
    ${coverageBanner(r)}${backfillPanel()}${periodForm(q, fixedMonth, downloadBar(r, q))}${note}${hl}
    <h2>${q.mode === "availability" ? "提供・廃止予定" : "新着"}（${r.items.length}件）</h2>${r.items.map(card).join("")}${empty}`;
  bind(q, fixedMonth, basePath);
  bindDownload(r, q);
}

function renderArchive() {
  const counts = new Map<string, number>();
  for (const i of items) { const m = i.createdJst.slice(0, 7); counts.set(m, (counts.get(m) ?? 0) + 1); }
  const status = new Map(meta.backfill.months.map((m) => [m.month, m.status]));
  const names: Record<string, string> = { complete: "全件", partial: "部分", "in-progress": "取得中", failed: "失敗" };
  const months = [...new Set([...counts.keys(), ...status.keys()])].sort().reverse();
  const rows = months.map((m) => {
    const st = status.get(m);
    return `<tr><td><a href="#/archive/${m}">${m}</a></td><td>${counts.get(m) ?? 0} 件</td><td>${st ? (names[st] ?? "未取得") : "日次収集"}</td></tr>`;
  }).join("");
  app.innerHTML = `<h1>月別アーカイブ</h1><p class="meta">件数は取得済みの更新です。取得状態が「全件」以外の月は、件数が全件とは限りません。</p>${backfillPanel()}<table><thead><tr><th>月 (JST)</th><th>取得済み件数</th><th>取得状態</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function route() {
  document.querySelectorAll("nav a").forEach((a) => a.classList.remove("active"));
  const { path, params } = parseHash();
  if (path === "/update") {
    const it = items.find((x) => x.key === params.get("key"));
    if (!it) { app.innerHTML = `<h1>更新が見つかりません</h1><p>ID ${esc(params.get("key") ?? "")} は取得済みデータにありません。<a href="#/">ホームへ</a></p>`; return; }
    const m = it.createdJst.slice(0, 7);
    const b = monthBounds(m);
    renderList(defaultQuery({ start: b.start, end: b.end }), `${m} の更新`, m, `/archive/${m}`);
    document.getElementById(`update-${it.key}`)?.scrollIntoView();
    return;
  }
  if (path === "/archive") { document.querySelector('nav [data-nav="archive"]')?.classList.add("active"); renderArchive(); return; }
  const mm = /^\/archive\/(\d{4}-\d{2})$/.exec(path);
  if (mm) {
    const b = monthBounds(mm[1]!);
    document.querySelector('nav [data-nav="archive"]')?.classList.add("active");
    renderList(queryFrom(params, { start: b.start, end: b.end }), `${mm[1]} の更新（月別アーカイブ）`, mm[1]!, `/archive/${mm[1]}`);
    return;
  }
  const q = queryFrom(params);
  document.querySelector(`nav [data-nav="${q.mode === "availability" ? "availability" : "home"}"]`)?.classList.add("active");
  renderList(q, q.mode === "availability" ? "提供・廃止予定" : "Azure の最新更新", null, "/");
}

async function main() {
  try {
    const [m, it] = await Promise.all([fetch("data/meta.json").then((r) => r.json()), fetch("data/items.json").then((r) => r.json())]);
    meta = m as SiteMeta;
    items = (it as { items: DigestItem[] }).items;
  } catch {
    app.innerHTML = `<div class="banner failed">データを読み込めませんでした。時間をおいて再読み込みしてください。</div>`;
    return;
  }
  document.getElementById("footer")!.innerHTML = `${esc(meta.attribution)}<br>データ時点: ${esc(meta.snapshotAt ?? "未取得")}（UTC） ／ 件数 ${meta.itemCount} ／ 原文リンクは Azure Updates の公式 permalink 形式で、リンク先の存在は自動確認できません（開けない場合は MRC の ID をご確認ください）。<br>ライセンス: <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ja" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a>（商用利用不可）© yamapan (aktsmm) ／ Microsoft の原文・Learn の内容は対象外<br><a href="https://github.com/aktsmm/azure-update-digest/blob/main/docs/design.md" target="_blank" rel="noopener noreferrer">設計・方式の詳細</a> ／ <a href="https://github.com/aktsmm/azure-update-digest#readme" target="_blank" rel="noopener noreferrer">README</a>`;
  try {
    const s = (await (await fetch("data/slides.json")).json()) as { slides: SlideEntry[]; pdfCrypto?: PdfCryptoInfo | null; sample?: string | null };
    pdfCrypto = s.pdfCrypto ?? null;
    samplePdf = !!s.sample;
    slideEntries = new Map(s.slides.map((e) => [e.key, e]));
  } catch { /* no slide PDFs published */ }
  window.addEventListener("hashchange", route);
  route();
}
void main();
