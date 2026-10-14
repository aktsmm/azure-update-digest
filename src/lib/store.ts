import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readJson, writeIfChanged, stableStringify } from "./stable.js";
import type { CoverageInterval, RawRecord } from "./types.js";
import type { RawFile } from "./normalize.js";

export interface MonthScanState {
  status: "in-progress" | "complete" | "partial";
  /** Upper bound (exclusive, ISO seconds) fixed at the start of this month's scan */
  cutoff: string;
  nextOffset: number;
  pages: number;
  totalCount: number | null;
  ids: string[];
  rescans: number;
}

export interface CollectState {
  schema: 1;
  backfill: {
    months: Record<string, MonthScanState>;
    completedAt: string | null;
    targetMonths: string[];
  };
  /** Created-time up to which coverage is contiguous and complete (end of last complete scan). */
  coveredThrough: string | null;
  coverage: CoverageInterval[];
}

export const emptyState = (): CollectState => ({ schema: 1, backfill: { months: {}, completedAt: null, targetMonths: [] }, coveredThrough: null, coverage: [] });

export interface Store {
  writeRaw(record: RawRecord, key: string): string;
  readAllRaw(): RawFile[];
  readState(): CollectState;
  writeState(s: CollectState): void;
  writeRunReport(runId: string, report: unknown): void;
}

export class FileStore implements Store {
  constructor(private readonly root: string) {}
  private rawDir = () => join(this.root, "raw");

  writeRaw(record: RawRecord, key: string): string {
    const stamp = record.fetchedAt.replace(/[-:.]/g, "");
    const name = `${stamp}_${key.replace(/[^A-Za-z0-9_.-]/g, "-")}.json`;
    writeIfChanged(join(this.rawDir(), name), stableStringify(record));
    return name;
  }

  readAllRaw(): RawFile[] {
    const dir = this.rawDir();
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((name) => ({ name, record: JSON.parse(readFileSync(join(dir, name), "utf8")) as RawRecord }));
  }

  readState(): CollectState {
    return readJson<CollectState>(join(this.root, "state", "collect-state.json"), emptyState());
  }

  writeState(s: CollectState): void {
    mkdirSync(join(this.root, "state"), { recursive: true });
    writeIfChanged(join(this.root, "state", "collect-state.json"), stableStringify(s));
  }

  writeRunReport(runId: string, report: unknown): void {
    writeIfChanged(join(this.root, "runs", `${runId}.json`), stableStringify(report));
  }
}

export class MemoryStore implements Store {
  raw: RawFile[] = [];
  state: CollectState = emptyState();
  reports: Record<string, unknown> = {};
  writeRaw(record: RawRecord, key: string): string {
    const name = `${record.fetchedAt.replace(/[-:.]/g, "")}_${key}.json`;
    this.raw.push({ name, record: JSON.parse(JSON.stringify(record)) as RawRecord });
    return name;
  }
  readAllRaw(): RawFile[] {
    return [...this.raw].sort((a, b) => (a.name < b.name ? -1 : 1));
  }
  readState(): CollectState {
    return JSON.parse(JSON.stringify(this.state)) as CollectState;
  }
  writeState(s: CollectState): void {
    this.state = JSON.parse(JSON.stringify(s)) as CollectState;
  }
  writeRunReport(runId: string, report: unknown): void {
    this.reports[runId] = report;
  }
}
