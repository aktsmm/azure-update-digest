import type { SlideKind } from "./slide-kind.js";
import { KIND_ORDER } from "./slide-order.js";

/** Kind (GA / Preview / Retirement ...) colours shared by the PDF and PPTX: the left-edge icon of each contents row and the section pages. */
export const KIND_COLOR_HEX: Record<SlideKind, string> = {
  ga: "1B7F3B",
  preview: "7A4FD0",
  retirement: "C62828",
  announcement: "0B6BCB",
  update: "5B6777",
};

/** One-glyph icon drawn inside the badge. Every icon must be in CP932 (JIS): that is the range of the PDF font subset (scripts/make-font.py). */
export const KIND_ICON: Record<SlideKind, string> = {
  ga: "○",
  preview: "◇",
  retirement: "×",
  announcement: "▲",
  update: "◆",
};

export interface Sectioned<T> { kind: SlideKind; label: string; items: T[] }

/** Split contents rows into pages of at most `perPage` rows; a section heading is never left as the last row of a page. */
export function paginateRows<R extends { type: "head" | "item" }>(rows: R[], perPage: number): R[][] {
  const pages: R[][] = [];
  let cur: R[] = [];
  for (const r of rows) {
    if (cur.length === perPage) { pages.push(cur); cur = []; }
    cur.push(r);
    // a heading that would end up last on a full page moves to the next page together with its first row
    if (cur.length === perPage && r.type === "head") { cur.pop(); pages.push(cur); cur = [r]; }
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/** Group already-ordered entries into kind sections, in KIND_ORDER, skipping kinds with no entries. */
export function sectionByKind<T extends { kind: SlideKind; label: string }>(entries: T[]): Sectioned<T>[] {
  const out: Sectioned<T>[] = [];
  for (const kind of KIND_ORDER) {
    const items = entries.filter((e) => e.kind === kind);
    if (items.length) out.push({ kind, label: items[0]!.label, items });
  }
  return out;
}
