import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The health report is read by the maintenance agent: its shape must stay stable and must never contain secrets.
describe("health report", () => {
  it("produces the documented structure offline", () => {
    const out = join(mkdtempSync(join(tmpdir(), "health-")), "health.json");
    execFileSync("npx", ["tsx", "src/cli/health.ts"], { env: { ...process.env, HEALTH_OUT: out, SITE_URL: "http://127.0.0.1:9", PATH: process.env.PATH }, stdio: "ignore", shell: true });
    const h = JSON.parse(readFileSync(out, "utf8"));
    for (const k of ["generatedAt", "todayJst", "workflows14d", "stuckRuns", "openPullRequests", "data", "publicSite", "flags"]) expect(h).toHaveProperty(k);
    expect(h.data.items).toBeGreaterThan(0);
    expect(h.flags.some((f: string) => f.startsWith("site-unreachable"))).toBe(true);
    expect(JSON.stringify(h)).not.toMatch(/ghp_|github_pat_|PDF_PASSWORD/);
  }, 60000);
});
