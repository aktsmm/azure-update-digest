import type { SlideKind } from "./slide-kind.js";

export const KIND_ORDER: SlideKind[] = ["preview", "ga", "retirement", "announcement", "update"];

export interface Orderable { key: string; kind: SlideKind; publishedJst: string }

/** Deterministic deck order: kind, then newest first, then key. */
export function orderSlides<T extends Orderable>(xs: T[]): T[] {
  return [...xs].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.publishedJst < b.publishedJst ? 1 : a.publishedJst > b.publishedJst ? -1 : 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
