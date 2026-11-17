import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Static guards for the accessibility fixes found by measuring the live DOM: unlabeled search box, unlabeled nav,
// and the whole page being a live region (every filter change would be read out in full).
const html = readFileSync("site/index.html", "utf8");
const app = readFileSync("src/web/app.ts", "utf8");
const css = readFileSync("site/style.css", "utf8");

describe("site accessibility guards", () => {
  it("landmarks and live regions", () => {
    expect(html).toMatch(/<nav aria-label="[^"]+"/);
    expect(html).toMatch(/<a class="skip-link" href="#app"/);
    expect(/<main[^>]*aria-live/.test(html), "main must not be a live region").toBe(false);
    expect(html).toMatch(/id="sr-live"[^>]*role="status"/);
  });
  it("every form control and the download status are named or announced", () => {
    for (const m of app.matchAll(/<input type="search"[^>]*>/g)) expect(m[0]).toContain("aria-label=");
    expect(app).toMatch(/id="dl-status" role="status"/);
    expect(app).toContain("announce(");
  });
  it("keyboard focus is visible", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain(".sr-only");
  });
});
