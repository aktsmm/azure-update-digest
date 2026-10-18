import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

// Workflow hygiene: gh-aw lock files must match the prompts they were compiled from, and no
// workflow may widen its permissions or run untrusted pull-request code with secrets.
const dir = ".github/workflows";
const names = readdirSync(dir);
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const read = (f: string) => readFileSync(`${dir}/${f}`, "utf8");

describe("gh-aw lock files", () => {
  for (const file of names.filter((n) => n.endsWith(".md"))) {
    it(`${file} matches its compiled lock file`, () => {
      const lockFile = file.replace(/\.md$/, ".lock.yml");
      expect(names, `${file} has no compiled ${lockFile}; run \`gh aw compile\``).toContain(lockFile);
      const meta = JSON.parse(read(lockFile).match(/gh-aw-metadata: (\{.*\})/)?.[1] ?? "null") as { body_hash?: string } | null;
      expect(meta?.body_hash, `${lockFile} has no gh-aw metadata`).toBeTruthy();
      const source = read(file).replace(/\r\n/g, "\n");
      const body = source.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)?.[1] ?? "";
      expect(sha(body.trim()), `${file} was edited after ${lockFile} was compiled; run \`gh aw compile\` and commit the lock file`).toBe(meta?.body_hash);
    });
  }
});

describe("workflow permissions", () => {
  for (const file of names.filter((n) => n.endsWith(".yml") && !n.endsWith(".lock.yml"))) {
    it(`${file} declares minimal permissions and avoids risky triggers`, () => {
      const text = read(file);
      expect(text, `${file} must declare its permissions`).toMatch(/^permissions:/m);
      expect(text, `${file} must not use write-all`).not.toMatch(/write-all/);
      expect(text, `${file} must not use pull_request_target`).not.toMatch(/pull_request_target/);
    });
  }
});
