import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/** Deterministic JSON: object keys sorted recursively, 2-space indent, LF, trailing newline. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2) + "\n";
}

export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function fingerprint(value: unknown): string {
  return sha256(JSON.stringify(sortKeys(value)));
}

/** Writes only when content differs, so reruns leave no diff. Returns true when written. */
export function writeIfChanged(path: string, content: string): boolean {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && readFileSync(path, "utf8") === content) return false;
  writeFileSync(path, content, "utf8");
  return true;
}

export function writeJson(path: string, value: unknown): boolean {
  return writeIfChanged(path, stableStringify(value));
}

export function readJson<T>(path: string, fallback?: T): T {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing file: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
