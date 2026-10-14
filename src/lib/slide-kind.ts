import type { MrcAvailability } from "./types.js";

export type SlideKind = "ga" | "preview" | "private-preview" | "retirement" | "announcement" | "update";
export type KindSource = "ring" | "tags" | "title";

export interface KindInput {
  title: string;
  tags: string[];
  availabilities: MrcAvailability[];
}

/** Rule-based kind. First match wins; never guessed from free text beyond the documented title prefixes. */
export function decideKind(i: KindInput): { kind: SlideKind; source: KindSource } {
  const rings = i.availabilities.map((a) => a.ring.toLowerCase());
  const tags = i.tags.map((t) => t.toLowerCase());
  if (rings.includes("retirement") || tags.includes("retirements")) return { kind: "retirement", source: rings.includes("retirement") ? "ring" : "tags" };
  if (rings.includes("private preview")) return { kind: "private-preview", source: "ring" };
  if (rings.includes("preview")) return { kind: "preview", source: "ring" };
  if (rings.includes("general availability")) return { kind: "ga", source: "ring" };
  if (tags.includes("announcement")) return { kind: "announcement", source: "tags" };
  if (/^announcing\b/i.test(i.title)) return { kind: "announcement", source: "title" };
  return { kind: "update", source: "title" };
}

export const KIND_LABEL: Record<SlideKind, string> = {
  ga: "GA",
  preview: "Preview",
  "private-preview": "Private Preview",
  retirement: "廃止",
  announcement: "アナウンス",
  update: "更新",
};

/** Standard panel ids per kind, in display order (see docs/slide-schema.md). */
export const PANEL_TEMPLATE: Record<SlideKind, { core: string[]; detail: string[] }> = {
  ga: { core: ["how-it-works", "how-to-start"], detail: ["prerequisites-limits", "related-features", "use-case"] },
  preview: { core: ["scope", "constraints"], detail: ["evaluate"] },
  "private-preview": { core: ["scope", "constraints"], detail: ["evaluate"] },
  retirement: { core: ["impact", "migration"], detail: ["action-plan"] },
  announcement: { core: ["scope", "permissions"], detail: ["impact-check"] },
  update: { core: ["scope"], detail: ["impact-check"] },
};
