import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

// Untrusted event text (titles, bodies, branch names...) must reach shell code through env, never through ${{ }} inside run/script.
const dir = ".github/workflows";
const files = readdirSync(dir).filter((f) => f.endsWith(".yml") && !f.endsWith(".lock.yml"));
const UNTRUSTED = /\$\{\{[^}]*github\.(event\.[a-z_.]*(title|body|ref|label|name|message|login|email)|head_ref)[^}]*\}\}/i;

describe("hand-written workflows", () => {
  it("never interpolate untrusted event fields inside run or script blocks", () => {
    const bad: string[] = [];
    for (const file of files) {
      let inBlock = false;
      let indent = 0;
      readFileSync(`${dir}/${file}`, "utf8").split(/\r?\n/).forEach((line, i) => {
        const start = line.match(/^(\s*)(?:-\s+)?(run|script):\s*(.*)$/);
        if (start) {
          inBlock = true;
          indent = start[1]!.length;
          if (UNTRUSTED.test(start[3]!)) bad.push(`${file}:${i + 1}`);
          return;
        }
        if (inBlock && line.trim() && line.match(/^(\s*)/)![1]!.length <= indent) { inBlock = false; return; }
        if (inBlock && UNTRUSTED.test(line)) bad.push(`${file}:${i + 1}`);
      });
    }
    expect(bad, "move these values into env").toEqual([]);
  });

  it("only use first-party actions", () => {
    const external: string[] = [];
    for (const file of files) {
      for (const m of readFileSync(`${dir}/${file}`, "utf8").matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) {
        if (!/^(actions|github|\.\/)/.test(m[1]!)) external.push(`${file}: ${m[1]}`);
      }
    }
    expect(external, "third-party actions need a commit-SHA pin and a review").toEqual([]);
  });
});
