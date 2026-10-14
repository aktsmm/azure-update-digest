import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { stableStringify } from "../lib/stable.js";
import { loadNormalized } from "../lib/site-data.js";
import { recentMonths, toJstDate } from "../lib/period.js";

// Collects a read-only health snapshot for the maintenance agent and for humans (.work/health.json).
// Everything here is deterministic; the agent only interprets the result.
const repo = process.env.GITHUB_REPOSITORY ?? "aktsmm/azure-update-digest";
const site = process.env.SITE_URL ?? "https://aktsmm.github.io/azure-update-digest";
const out = process.env.HEALTH_OUT ?? ".work/health.json";
const now = Date.now();
const DAY = 86400000;

function gh<T>(args: string[], fallback: T): T {
  try {
    return JSON.parse(execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })) as T;
  } catch {
    return fallback;
  }
}

async function http(path: string): Promise<{ status: number; json?: unknown }> {
  try {
    const r = await fetch(`${site}/${path}`, { headers: { "cache-control": "no-cache" } });
    const json = path.endsWith(".json") && r.ok ? await r.json() : undefined;
    return { status: r.status, json };
  } catch {
    return { status: 0 };
  }
}

interface Run { databaseId: number; workflowName: string; status: string; conclusion: string; event: string; createdAt: string; updatedAt: string }
const runs = gh<Run[]>(["run", "list", "--repo", repo, "--limit", "300", "--json", "databaseId,workflowName,status,conclusion,event,createdAt,updatedAt"], []);
const recent = runs.filter((r) => now - Date.parse(r.createdAt) <= 14 * DAY);

const byWorkflow: Record<string, { success: number; failure: number; cancelled: number; running: number; lastSuccess: string | null; lastFailures: { id: number; at: string }[] }> = {};
for (const r of recent) {
  const w = (byWorkflow[r.workflowName] ??= { success: 0, failure: 0, cancelled: 0, running: 0, lastSuccess: null, lastFailures: [] });
  if (r.status !== "completed") w.running++;
  else if (r.conclusion === "success") { w.success++; if (!w.lastSuccess || r.createdAt > w.lastSuccess) w.lastSuccess = r.createdAt; }
  else if (r.conclusion === "cancelled") w.cancelled++;
  else { w.failure++; if (w.lastFailures.length < 3) w.lastFailures.push({ id: r.databaseId, at: r.createdAt }); }
}
const stuck = runs.filter((r) => r.status === "in_progress" && now - Date.parse(r.createdAt) > 60 * 60000).map((r) => ({ id: r.databaseId, workflow: r.workflowName, startedMinutesAgo: Math.round((now - Date.parse(r.createdAt)) / 60000) }));

const prs = gh<{ number: number; title: string; headRefName: string; createdAt: string; labels: { name: string }[] }[]>(["pr", "list", "--repo", repo, "--state", "open", "--limit", "100", "--json", "number,title,headRefName,createdAt,labels"], []);
const openPrs = prs.map((p) => ({ number: p.number, title: p.title, branch: p.headRefName, ageDays: Math.round(((now - Date.parse(p.createdAt)) / DAY) * 10) / 10, labels: p.labels.map((l) => l.name) }));

// data coverage and backlog
const items = loadNormalized(process.env.DATA_ROOT ?? "data");
const latestCreated = items.map((i) => i.createdJst).sort().at(-1) ?? null;
const summaries = existsSync("data/summaries") ? readdirSync("data/summaries").filter((f) => f.endsWith(".json")).length : 0;
const slides = existsSync("data/slides") ? readdirSync("data/slides").filter((f) => f.endsWith(".json")).length : 0;
const since = `${recentMonths(now, 3)[0]}-01`;
const inWindow = items.filter((i) => i.detailState === "ok" && i.createdJst >= since).length;
const detailFailed = items.filter((i) => i.detailState === "failed").length;
const missingSummary = items.filter((i) => i.detailState === "ok" && !(existsSync(`data/summaries/${i.canonicalKey}.json`))).length;

// public site
const [slidesIdx, itemsIdx, apiIdx, sample] = await Promise.all([http("data/slides.json"), http("data/items.json"), http("api/v1/index.json"), http("pdf/sample.pdf")]);
const slidesJson = slidesIdx.json as { slides?: unknown[]; pdfCrypto?: unknown; sample?: string | null } | undefined;
const itemsJson = itemsIdx.json as { items?: unknown[] } | undefined;
const apiJson = apiIdx.json as { snapshotAt?: string; itemCount?: number } | undefined;

const health = {
  generatedAt: new Date(now).toISOString(),
  todayJst: toJstDate(now),
  repo,
  workflows14d: byWorkflow,
  stuckRuns: stuck,
  openPullRequests: openPrs,
  data: { items: items.length, latestCreatedJst: latestCreated, summaries, missingSummary, detailFailed, slides, slideWindowSince: since, itemsInSlideWindow: inWindow },
  publicSite: {
    slidesIndex: slidesIdx.status,
    itemsJson: itemsIdx.status,
    apiIndex: apiIdx.status,
    samplePdf: sample.status,
    publishedSlides: slidesJson?.slides?.length ?? null,
    pdfGateActive: slidesJson ? slidesJson.pdfCrypto != null : null,
    publishedItems: itemsJson?.items?.length ?? null,
    apiSnapshotAt: apiJson?.snapshotAt ?? null,
  },
  flags: [] as string[],
};

const f = health.flags;
for (const s of stuck) f.push(`stuck-run: ${s.workflow} #${s.id} running for ${s.startedMinutesAgo} min`);
for (const [name, w] of Object.entries(byWorkflow)) {
  if (w.failure >= 3 && w.failure > w.success) f.push(`failing-workflow: ${name} (${w.failure} failures vs ${w.success} successes in 14 days)`);
}
for (const p of openPrs) if (p.ageDays > 3 && p.labels.includes("automation")) f.push(`stale-automation-pr: #${p.number} open for ${p.ageDays} days`);
if (latestCreated && (now - Date.parse(`${latestCreated}T00:00:00+09:00`)) / DAY > 7) f.push(`stale-data: newest update created ${latestCreated}`);
if (detailFailed > 0) f.push(`detail-failed: ${detailFailed} items without details`);
for (const [k, v] of Object.entries({ slidesIndex: slidesIdx.status, itemsJson: itemsIdx.status, apiIndex: apiIdx.status })) if (v !== 200) f.push(`site-unreachable: ${k} returned ${v}`);
if (slidesJson && slidesJson.pdfCrypto == null) f.push("pdf-gate-inactive: merged PDF/PPTX download is disabled (PDF_PASSWORD secret missing?)");
if (slidesJson?.sample && sample.status !== 200) f.push(`sample-pdf-missing: status ${sample.status}`);
if (itemsJson?.items && items.length !== itemsJson.items.length) f.push(`site-out-of-date: repo has ${items.length} items, site ${itemsJson.items.length}`);

mkdirSync(out.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
writeFileSync(out, stableStringify(health) + "\n", "utf8");
console.log(`health: ${f.length} flag(s) -> ${out}`);
for (const x of f) console.log(`  - ${x}`);
