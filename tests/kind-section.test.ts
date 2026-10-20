import { describe, expect, it } from "vitest";
import { KIND_COLOR_HEX, KIND_ICON, sectionByKind } from "../src/lib/kind-section.js";
import { KIND_ORDER } from "../src/lib/slide-order.js";
import type { SlideKind } from "../src/lib/slide-kind.js";

const e = (key: string, kind: SlideKind) => ({ key, kind, label: kind.toUpperCase() });

describe("sectionByKind", () => {
  it("groups already-ordered entries by kind in the deck order and skips empty kinds", () => {
    const sections = sectionByKind([e("1", "preview"), e("2", "retirement"), e("3", "ga"), e("4", "retirement")]);
    expect(sections.map((s) => s.kind)).toEqual(["preview", "ga", "retirement"]);
    expect(sections.find((s) => s.kind === "retirement")!.items.map((x) => x.key)).toEqual(["2", "4"]);
  });
  it("keeps every entry exactly once", () => {
    const all = [e("1", "update"), e("2", "ga"), e("3", "announcement"), e("4", "preview"), e("5", "retirement"), e("6", "ga")];
    expect(sectionByKind(all).flatMap((s) => s.items).length).toBe(all.length);
  });
  it("returns no sections for no entries", () => {
    expect(sectionByKind([])).toEqual([]);
  });
});

/** True when the character exists in CP932 (Shift_JIS), the range of the PDF font subset built by scripts/make-font.py. */
function inCp932(ch: string): boolean {
  const dec = new TextDecoder("shift_jis");
  if (ch.codePointAt(0)! < 0x100) return true; // Latin-1 range is included separately
  for (let lead = 0x81; lead < 0xf0; lead++) {
    for (let trail = 0x40; trail < 0xfd; trail++) {
      if (dec.decode(new Uint8Array([lead, trail])) === ch) return true;
    }
  }
  return false;
}

describe("kind icons", () => {
  it("has a colour and a single-glyph icon for every kind", () => {
    for (const k of KIND_ORDER) {
      expect(KIND_COLOR_HEX[k]).toMatch(/^[0-9A-F]{6}$/);
      expect([...KIND_ICON[k]].length).toBe(1);
    }
  });
  // An icon outside the font subset renders as a blank box in the PDF (a check mark did exactly that in production).
  it("uses only icons the PDF font subset can draw", () => {
    for (const k of KIND_ORDER) expect(inCp932(KIND_ICON[k]), `${k} icon ${KIND_ICON[k]} is not in CP932`).toBe(true);
  });
  it("uses distinct icons and colours", () => {
    expect(new Set(KIND_ORDER.map((k) => KIND_ICON[k])).size).toBe(KIND_ORDER.length);
    expect(new Set(KIND_ORDER.map((k) => KIND_COLOR_HEX[k])).size).toBe(KIND_ORDER.length);
  });
});
