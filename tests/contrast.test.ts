import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
const css = readFileSync("site/style.css", "utf8");

// WCAG AA (4.5:1) for the small text on badges and kind labels.
describe("site colour contrast", () => {
  it("kind labels (white on colour)", () => {
    for (const k of ["ga", "preview", "retirement", "announcement", "update"]) {
      const m = css.match(new RegExp(`\\.kind\\.k-${k}\\s*\\{\\s*background:\\s*(#[0-9a-f]{6})`, "i"));
      expect(m, `kind ${k} colour`).toBeTruthy();
      expect(ratio("#ffffff", m![1]!), `kind ${k}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("importance and slide badges", () => {
    for (const cls of ["slide-yes", "high", "notable"]) {
      const m = css.match(new RegExp(`\\.badge\\.${cls}\\s*\\{[^}]*?background:\\s*(#[0-9a-f]{6})[^}]*?[; ]color:\\s*(#[0-9a-f]{6}|var\\(--[a-z]+\\))`, "i"));
      expect(m, `badge ${cls}`).toBeTruthy();
      const fg = m![2]!.startsWith("var") ? css.match(new RegExp(`${m![2]!.slice(4, -1)}:\\s*(#[0-9a-f]{6})`))![1]! : m![2]!;
      expect(ratio(m![1]!, fg), `badge ${cls}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
