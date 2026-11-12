import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// The slide agent has created branches named both "slides/<id>-<hash>" and "slide-<id>-<hash>" (and "summaries-..."/"summaries/...").
// Every workflow that picks generated PRs by branch name must accept all of these, or the PR sits open unnoticed.
const BRANCHES = ["slides/579507-d616cd44b0f9cb7d", "slides-576547-b31246b6d39900ef", "slide-579507-d616cd44b0f9cb7d", "summaries/2026-10-28-f9e63f3d8b94c8e1", "summaries-577491-d06de346b3818db7"];
const read = (f: string) => readFileSync(`.github/workflows/${f}`, "utf8");

describe("generated PR branch names", () => {
  it("auto-merge-slides accepts every slide branch spelling", () => {
    const m = read("auto-merge-slides.yml").match(/test\("(\^slides\??\[\/-\])"\)/);
    expect(m, "branch filter not found").toBeTruthy();
    const re = new RegExp(m![1]!);
    for (const b of BRANCHES.filter((x) => x.startsWith("slide"))) expect(re.test(b), b).toBe(true);
  });
  it("watchdog covers slide, slides and summaries branches", () => {
    const m = read("watchdog.yml").match(/test\(\\"(\^\([^"]*?\)\[\/-\])\\"\)/);
    expect(m, "watchdog filter not found").toBeTruthy();
    const re = new RegExp(m![1]!);
    for (const b of BRANCHES) expect(re.test(b), b).toBe(true);
  });
  it("slide-dispatch treats every slide branch as an open PR", () => {
    const m = read("slide-dispatch.yml").match(/grep -E '(\^slides\??\[\/-\])'/);
    expect(m, "dispatch filter not found").toBeTruthy();
    const re = new RegExp(m![1]!);
    for (const b of BRANCHES.filter((x) => x.startsWith("slide"))) expect(re.test(b), b).toBe(true);
  });
});
