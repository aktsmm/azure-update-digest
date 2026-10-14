import { readJson } from "./stable.js";
import type { CategoryConfig, ImportanceConfig } from "./classify.js";
import type { CollectConfig } from "./collect.js";

export interface Configs {
  categories: CategoryConfig;
  importance: ImportanceConfig;
  collect: CollectConfig & { minIntervalMs: number };
}

export function loadConfigs(root = "."): Configs {
  return {
    categories: readJson<CategoryConfig>(`${root}/config/categories.json`),
    importance: readJson<ImportanceConfig>(`${root}/config/importance.json`),
    collect: readJson<CollectConfig & { minIntervalMs: number }>(`${root}/config/collect.json`),
  };
}
