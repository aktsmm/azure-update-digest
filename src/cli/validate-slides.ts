import { existsSync, readdirSync, readFileSync } from "node:fs";
import { validateDeck } from "../lib/slide-validate.js";

/** Validates data/slides/*.json (each file is a one-slide deck envelope). Exits 1 on any problem. */
const dir = process.argv[2] ?? "data/slides";
if (!existsSync(dir)) {
  console.log(`no ${dir}; nothing to validate`);
  process.exit(0);
}
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
let bad = 0;
for (const f of files) {
  const deck = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  const problems = validateDeck(deck);
  const expected = f.replace(/\.json$/, "");
  const keys = (deck.slides ?? []).map((s: any) => s.key);
  if (keys.length !== 1 || keys[0] !== expected) problems.push({ slide: "(file)", message: `file ${f} must hold exactly slide ${expected}, found [${keys.join(",")}]` });
  if (problems.length) {
    bad += problems.length;
    console.error(`✗ ${f}`);
    for (const p of problems.slice(0, 40)) console.error(`   [${p.slide}] ${p.message}`);
  } else console.log(`✓ ${f}`);
}
if (bad) {
  console.error(`slide validation failed: ${bad} problem(s)`);
  process.exit(1);
}
console.log(`slide validation ok: ${files.length} file(s)`);
