import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// Every internal href/src in the built page must resolve to a file in dist/ (a missing asset shows up as a
// console 404 in production, e.g. the old /favicon.ico). Fragment-only links (#/...) and absolute URLs are skipped.
const DIST = "dist";

function internalRefs(html: string): { attr: string; ref: string }[] {
  const out: { attr: string; ref: string }[] = [];
  for (const m of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    const ref = m[2]!;
    if (/^(https?:|mailto:|data:|#|\/\/)/.test(ref)) continue;
    out.push({ attr: m[1]!, ref: ref.split("#")[0]!.split("?")[0]! });
  }
  return out;
}

describe("built site", () => {
  beforeAll(() => {
    if (!existsSync(`${DIST}/index.html`)) execFileSync("npx", ["tsx", "src/cli/build-site.ts"], { stdio: "ignore", shell: true });
  }, 120_000);

  it("has no broken internal links or assets", () => {
    const html = readFileSync(`${DIST}/index.html`, "utf8");
    const refs = internalRefs(html);
    expect(refs.length).toBeGreaterThan(0);
    const missing = refs.filter((r) => r.ref && !existsSync(`${DIST}/${r.ref}`)).map((r) => `${r.attr}=${r.ref}`);
    expect(missing).toEqual([]);
  });

  it("does not depend on a /favicon.ico file (the icon is inline)", () => {
    const html = readFileSync(`${DIST}/index.html`, "utf8");
    expect(html).toMatch(/<link rel="icon" href="data:/);
  });
});
