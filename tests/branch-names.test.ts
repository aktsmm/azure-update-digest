import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// The slide agent has named its branches "slides/<id>-…", "slides-<id>-…" and "slide-<id>-…". A branch-name filter silently
// missed one spelling and left PRs open for 6 days, so generated PRs are recognised by the "data" label and their changed files.
const read = (f: string) => readFileSync(`.github/workflows/${f}`, "utf8");

describe("generated PR selection", () => {
  it("does not depend on branch names", () => {
    for (const f of ["auto-merge-slides.yml", "auto-merge-summaries.yml", "slide-dispatch.yml", "watchdog.yml"]) {
      const t = read(f);
      expect(/test\(\\?"\^\(?slides?\|?summaries|test\("\^slides?\[|test\("\^summaries\[|grep -Eq? '\^slides/.test(t), `${f} filters by branch name`).toBe(false);
    }
  });
  it("selects by the data label", () => {
    expect(read("auto-merge-slides.yml")).toContain('index("data")');
    expect(read("auto-merge-summaries.yml")).toContain('index("data")');
    expect(read("watchdog.yml")).toContain("--label data");
    expect(read("slide-dispatch.yml")).toContain("--label data");
  });
  it("the watchdog judges a hung run by its job start time, not the run start (which includes the concurrency wait)", () => {
    const w = read("watchdog.yml");
    expect(w).toContain('select(.status == "in_progress") | .started_at');
    expect(/--status in_progress[^\n]*startedAt/.test(w), "run-level startedAt cancels healthy runs that waited in the queue").toBe(false);
  });
  it("auto-merge still only merges a PR that changes exactly one allowed file", () => {
    expect(read("auto-merge-slides.yml")).toContain("^data/slides/[0-9]{1,12}\\.json$");
    expect(read("auto-merge-summaries.yml")).toContain("^data/(summaries|related)/");
  });
});
