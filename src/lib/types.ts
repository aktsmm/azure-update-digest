export interface MrcAvailability {
  ring: string;
  year: number;
  month: string;
}

/** Item as returned by MRC (list or detail). Original values are preserved. */
export interface MrcItem {
  id: string;
  baseId: string;
  title: string;
  description?: string;
  created: string;
  modified: string;
  products?: string[];
  productCategories?: string[];
  tags?: string[];
  availabilities?: MrcAvailability[];
  status?: string;
  generalAvailabilityDate?: string;
  previewAvailabilityDate?: string;
  privatePreviewAvailabilityDate?: string;
}

export interface MrcListResponse {
  items: MrcItem[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  returnedCount: number;
  facets?: unknown;
}

/** Immutable raw record: one MCP call, success or failure. */
export interface RawRecord {
  schema: 1;
  tool: "get_recent_azure_updates" | "get_azure_update_by_id";
  args: Record<string, unknown>;
  fetchedAt: string;
  ok: boolean;
  error?: string;
  response?: unknown;
  /** Scan context (JST month or "sweep") for list pages. */
  scan?: string;
}

export interface ImportanceResult {
  score: number;
  level: "high" | "notable" | "normal";
  topics: string[];
  reasons: string[];
}

export interface HistoryEntry {
  fetchedAt: string;
  fingerprint: string;
  modifiedBefore: string | null;
  modifiedAfter: string;
  changedFields: string[];
  rawRef: string;
}

export interface NormalizedItem {
  canonicalKey: string;
  ids: string[];
  latestId: string;
  title: string;
  description: string | null;
  descriptionSource: "detail" | "list" | null;
  detailState: "ok" | "failed" | "none";
  created: string;
  modified: string;
  createdJst: string;
  modifiedJst: string;
  status: string | null;
  tags: string[];
  products: string[];
  productCategories: string[];
  availabilities: MrcAvailability[];
  availabilityDates: { general: string | null; preview: string | null; privatePreview: string | null };
  categories: string[];
  importance: ImportanceResult;
  fingerprint: string;
  sourceUrl: string;
  history: HistoryEntry[];
}

export type CoverageStatus = "complete" | "partial" | "failed";

export interface CoverageInterval {
  /** epoch-aligned ISO instants (UTC, seconds): [from, to) on `created` */
  from: string;
  to: string;
  status: CoverageStatus;
  totalCount: number | null;
  uniqueIds: number | null;
  recordedAt: string;
  note?: string;
}
