import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

/**
 * Deterministic repair of the schema slips the slide agent keeps making when it cannot run the validator.
 * Only mechanical vocabulary fixes; it never invents facts. Returns the list of fixes applied.
 */
const CHANGE_NATURE: Record<string, string> = { risk: "breaking", warning: "breaking", negative: "breaking", positive: "benefit", none: "neutral", info: "neutral" };

export function repairSlide(deck: any): string[] {
  const fixes: string[] = [];
  for (const s of deck?.slides ?? []) {
    const a = s?.audience;
    if (a && typeof a.changeNature === "string" && CHANGE_NATURE[a.changeNature]) {
      fixes.push(`audience.changeNature ${a.changeNature} -> ${CHANGE_NATURE[a.changeNature]}`);
      a.changeNature = CHANGE_NATURE[a.changeNature];
    }
    const r = s?.region;
    // "confirmed" means the feature itself was checked; evidence about the service or a policy is "service-level" / "policy"
    if (r && r.basis === "confirmed" && (r.scope === "service" || r.scope === "policy")) {
      const next = r.scope === "policy" ? "policy" : "service-level";
      fixes.push(`region.basis confirmed -> ${next} (scope ${r.scope})`);
      r.basis = next;
    }
  }
  return fixes;
}

if (process.argv[1]?.endsWith("repair-slide.ts")) {
  const dir = process.argv[2] ?? "data/slides";
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  for (const f of files) {
    const deck = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    const fixes = repairSlide(deck);
    if (fixes.length) {
      writeFileSync(`${dir}/${f}`, JSON.stringify(deck, null, 2) + "\n", "utf8");
      console.log(`repaired ${f}: ${fixes.join("; ")}`);
    }
  }
}
