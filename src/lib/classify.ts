import type { ImportanceResult, MrcAvailability } from "./types.js";

export interface CategoryConfig {
  fallbackId: string;
  categories: {
    id: string;
    label: string;
    productCategories: string[];
    products: string[];
    tags: string[];
    titleRegex: string[];
  }[];
}

export interface ImportanceConfig {
  levels: { id: "high" | "notable" | "normal"; label: string; minScore: number }[];
  rules: {
    id: string;
    topic: string;
    label: string;
    field: "tag" | "productCategory" | "product" | "ring" | "status" | "title";
    match: "equals" | "regex";
    value: string;
    points: number;
  }[];
}

export interface ClassifyInput {
  title: string;
  tags: string[];
  products: string[];
  productCategories: string[];
  availabilities: MrcAvailability[];
  status: string | null;
}

const lc = (s: string) => s.toLowerCase();

export function classifyCategories(item: ClassifyInput, cfg: CategoryConfig): string[] {
  const hit = new Set<string>();
  for (const c of cfg.categories) {
    if (c.id === cfg.fallbackId) continue;
    const pcs = new Set(c.productCategories.map(lc));
    const prods = new Set(c.products.map(lc));
    const tags = new Set(c.tags.map(lc));
    const matched =
      item.productCategories.some((x) => pcs.has(lc(x))) ||
      item.products.some((x) => prods.has(lc(x))) ||
      item.tags.some((x) => tags.has(lc(x))) ||
      c.titleRegex.some((r) => new RegExp(r, "i").test(item.title));
    if (matched) hit.add(c.id);
  }
  if (hit.size === 0) hit.add(cfg.fallbackId);
  const order = cfg.categories.map((c) => c.id);
  return [...hit].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function scoreImportance(item: ClassifyInput, cfg: ImportanceConfig): ImportanceResult {
  let score = 0;
  const reasons: string[] = [];
  const topics = new Set<string>();
  for (const r of cfg.rules) {
    const values =
      r.field === "tag" ? item.tags
      : r.field === "productCategory" ? item.productCategories
      : r.field === "product" ? item.products
      : r.field === "ring" ? item.availabilities.map((a) => a.ring)
      : r.field === "status" ? (item.status ? [item.status] : [])
      : [item.title];
    const ok = values.some((v) => (r.match === "equals" ? lc(v) === lc(r.value) : new RegExp(r.value, "i").test(v)));
    if (ok) {
      score += r.points;
      reasons.push(r.id);
      topics.add(r.topic);
    }
  }
  const levels = [...cfg.levels].sort((a, b) => b.minScore - a.minScore);
  const level = levels.find((l) => score >= l.minScore)?.id ?? "normal";
  return { score, level, topics: [...topics].sort(), reasons };
}
