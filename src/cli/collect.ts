import { loadConfigs } from "../lib/config.js";
import { runCollect } from "../lib/collect.js";
import { McpClient } from "../lib/mcp.js";
import { FileStore } from "../lib/store.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1] ?? d) : d;
};
const mode = flag("mode", "all") as "backfill" | "sweep" | "all";
if (!["backfill", "sweep", "all"].includes(mode)) throw new Error(`invalid --mode ${mode}`);

const cfg = loadConfigs();
const client = new McpClient({ minIntervalMs: cfg.collect.minIntervalMs, log: (m) => console.log(`[mcp] ${m}`) });
const store = new FileStore(flag("data", "data"));

// Fail fast (and leave published data untouched) if MRC is not reachable.
await client.initialize();

const report = await runCollect({ client, store, config: cfg.collect, categories: cfg.categories, importance: cfg.importance, log: (m) => console.log(m) }, mode);
console.log(JSON.stringify({ ...report, months: report.months.map((m) => `${m.month}:${m.status}:${m.uniqueIds}/${m.totalCount}`) }, null, 2));
if (!report.consistent) {
  console.error("Consistency check failed:", report.consistencyNotes);
  process.exitCode = 2;
}
