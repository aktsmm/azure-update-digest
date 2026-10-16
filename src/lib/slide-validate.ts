import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";

/** Phrases that are internal-memo wording, never customer-facing content. */
export const FORBIDDEN_PHRASES = ["未確認", "記載なし", "要確認", "推定", "未発表", "判定保留", "AI 生成", "AI生成", "データ時点", "（原文）", "（Learn）", "初心者向け"];

/** Hosts allowed as evidence / reference URLs. */
export const ALLOWED_HOSTS = new Set(["learn.microsoft.com", "azure.microsoft.com", "www.microsoft.com"]);

let compiled: ReturnType<Ajv2020["compile"]> | null = null;
function validator() {
  if (!compiled) {
    const schema = JSON.parse(readFileSync("schema/slide-deck.schema.json", "utf8"));
    compiled = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  }
  return compiled;
}

interface Claim { text: string; assertion?: string; verification?: string; evidence?: { url: string }[] }

/** Every text a customer can see on the slide. */
export function renderedTexts(slide: any): string[] {
  const out: string[] = [slide.title?.ja ?? "", slide.title?.subtitleJa ?? "", slide.audience?.who?.text ?? "", slide.audience?.change?.text ?? "", slide.action?.summary?.text ?? ""];
  if (slide.beforeAfter?.before) out.push(slide.beforeAfter.before.text);
  if (slide.beforeAfter?.after) out.push(slide.beforeAfter.after.text);
  for (const p of slide.panels ?? []) {
    out.push(p.heading ?? "");
    if (p.availability === "present") for (const i of p.items ?? []) out.push((i as Claim).text);
  }
  for (const g of slide.glossary ?? []) out.push(g.term ?? "", g.oneLine?.text ?? "");
  if (slide.region?.note) out.push(slide.region.note);
  for (const t of slide.timeline ?? []) out.push(t.label ?? "");
  for (const qa of slide.speakerNotes?.qa ?? []) out.push(qa.q ?? "", qa.a ?? "");
  return out;
}

function claimsOf(slide: any): Claim[] {
  const c: Claim[] = [slide.audience?.who, slide.audience?.change, slide.action?.summary, slide.beforeAfter?.before, slide.beforeAfter?.after].filter(Boolean);
  for (const p of slide.panels ?? []) for (const i of p.items ?? []) c.push(i);
  for (const g of slide.glossary ?? []) if (g.oneLine) c.push(g.oneLine);
  return c;
}

export interface DeckProblem { slide: string; message: string }

/** Schema + semantic checks that JSON Schema cannot express. */
export function validateDeck(deck: any): DeckProblem[] {
  const problems: DeckProblem[] = [];
  const v = validator();
  if (!v(deck)) for (const e of v.errors ?? []) problems.push({ slide: "(deck)", message: `${e.instancePath || "/"} ${e.message ?? ""} ${JSON.stringify(e.params)}`.trim() });
  for (const s of deck?.slides ?? []) {
    const k = String(s.key ?? "?");
    for (const t of renderedTexts(s)) for (const w of FORBIDDEN_PHRASES) if (t.includes(w)) problems.push({ slide: k, message: `forbidden phrase "${w}" in: ${t.slice(0, 60)}` });
    const urls: string[] = [s.references?.announcement, ...(s.references?.learn ?? []).map((l: any) => l.url), ...(s.region?.evidence ?? []).map((e: any) => e.url)];
    for (const c of claimsOf(s)) for (const e of c.evidence ?? []) urls.push(e.url);
    for (const qa of s.speakerNotes?.qa ?? []) for (const e of qa.evidence ?? []) urls.push(e.url);
    for (const u of urls.filter(Boolean)) {
      try {
        const h = new URL(u).hostname;
        if (!ALLOWED_HOSTS.has(h)) problems.push({ slide: k, message: `evidence/reference host not allowed: ${h}` });
      } catch {
        problems.push({ slide: k, message: `invalid url: ${u}` });
      }
    }
    for (const c of claimsOf(s)) if (c.assertion === "recommendation" && c.verification === "verified") problems.push({ slide: k, message: `a recommendation cannot be "verified": ${c.text.slice(0, 40)}` });
    if (s.panels && !s.panels.some((p: any) => p.priority === "core" && p.availability === "present")) problems.push({ slide: k, message: "no core panel is present" });
    const learnLinks = s.references?.learn ?? [];
    const seen = new Set<string>();
    for (const l of learnLinks) {
    if (seen.has(l.url)) problems.push({ slide: k, message: `duplicate learn link: ${l.url}` });
    seen.add(l.url);
    if ((l.locale === "ja-jp") !== l.url.includes("/ja-jp/")) problems.push({ slide: k, message: `learn link locale does not match URL: ${l.url}` });
  }
  }
  const keys = (deck?.slides ?? []).map((s: any) => s.key);
  if (new Set(keys).size !== keys.length) problems.push({ slide: "(deck)", message: "duplicate slide keys" });
  return problems;
}
