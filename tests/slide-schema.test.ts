import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";

const schema = JSON.parse(readFileSync("schema/slide-deck.schema.json", "utf8"));
const sample = JSON.parse(readFileSync("examples/slide-deck.sample.json", "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Words that must never reach a slide: they are internal-memo phrasing, not customer-facing content. */
const FORBIDDEN = ["未確認", "記載なし", "要確認", "推定", "未発表", "判定保留", "AI 生成", "データ時点"];

function renderedTexts(deck: any): string[] {
  const out: string[] = [];
  for (const s of deck.slides) {
    out.push(s.title.ja, s.title.subtitleJa ?? "", s.audience.who.text, s.audience.change.text, s.action.summary.text);
    if (s.beforeAfter?.before) out.push(s.beforeAfter.before.text);
    if (s.beforeAfter?.after) out.push(s.beforeAfter.after.text);
    for (const p of s.panels) if (p.availability === "present") for (const i of p.items) out.push(i.text);
    for (const g of s.glossary ?? []) out.push(g.oneLine.text);
    if (s.region?.note) out.push(s.region.note);
  }
  return out;
}

describe("slide-deck schema", () => {
  it("accepts the sample deck", () => {
    const ok = validate(sample);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it("speaker-notes Q&A is optional, needs evidence, and is capped", () => {
    const withQa = sample.slides.find((s: any) => s.speakerNotes);
    expect(withQa?.speakerNotes.qa.length).toBeGreaterThanOrEqual(2);
    const noEvidence = clone(sample);
    delete noEvidence.slides.find((s: any) => s.speakerNotes).speakerNotes.qa[0].evidence;
    expect(validate(noEvidence)).toBe(false);
    const tooMany = clone(sample);
    const qa = tooMany.slides.find((s: any) => s.speakerNotes).speakerNotes.qa;
    while (qa.length < 5) qa.push(clone(qa[0]));
    expect(validate(tooMany)).toBe(false);
    const without = clone(sample);
    for (const s of without.slides) delete s.speakerNotes;
    expect(validate(without)).toBe(true);
  });

  it("covers all four kinds in the sample", () => {
    expect(sample.slides.map((s: any) => s.kind)).toEqual(["ga", "preview", "retirement", "announcement"]);
  });

  it("never puts internal-memo phrasing into rendered text", () => {
    const hits = renderedTexts(sample).filter((t) => FORBIDDEN.some((w) => t.includes(w)));
    expect(hits).toEqual([]);
  });

  it("allows slides without a region (shown with no stamp)", () => {
    expect(sample.slides.filter((s: any) => !s.region).map((s: any) => s.key)).toEqual(["573861"]);
  });

  it("requires evidence for verified claims", () => {
    const d = clone(sample);
    delete d.slides[0].panels[1].items[0].evidence;
    expect(validate(d)).toBe(false);
  });

  it("does not allow editorial content to be asserted as fact", () => {
    const d = clone(sample);
    d.slides[0].action.summary = { text: "x", origin: "editorial", assertion: "fact", verification: "unverified" };
    expect(validate(d)).toBe(false);
  });

  it("keeps month-granularity deadlines as months (no fake day)", () => {
    const d = clone(sample);
    d.slides[2].action.deadline = { month: "2027-09", precision: "month" };
    expect(validate(d)).toBe(true);
    d.slides[2].action.deadline = { date: "2027-09-01", month: "2027-09", precision: "month" };
    expect(validate(d)).toBe(false);
    d.slides[2].action.deadline = { precision: "day" };
    expect(validate(d)).toBe(false);
  });

  it("requires a panel marked present to carry items, while not-stated panels may be empty", () => {
    const d = clone(sample);
    const p = d.slides[1].panels.find((x: any) => x.id === "ga-timing");
    expect(p.availability).toBe("not-stated");
    expect(validate(d)).toBe(true);
    p.availability = "present";
    expect(validate(d)).toBe(false);
  });

  it("requires ids for ids-mode selections and a period for period-mode selections", () => {
    const a = clone(sample);
    a.selection = { mode: "period", basis: "created", coverage: "complete", snapshotAt: "2026-10-14T12:16:25Z" };
    expect(validate(a)).toBe(false);
    a.selection.period = { start: "2026-10-01", end: "2026-10-14" };
    expect(validate(a)).toBe(true);
    const b = clone(sample);
    delete b.selection.ids;
    expect(validate(b)).toBe(false);
  });

  it("limits references to https URLs and at most 3 Learn links", () => {
    const d = clone(sample);
    d.slides[2].references.learn.push({ title: "x", url: "https://learn.microsoft.com/a", locale: "ja-jp" }, { title: "y", url: "https://learn.microsoft.com/b", locale: "ja-jp" });
    expect(validate(d)).toBe(false);
    const e = clone(sample);
    e.slides[0].references.announcement = "http://azure.microsoft.com/updates?id=1";
    expect(validate(e)).toBe(false);
  });
});
