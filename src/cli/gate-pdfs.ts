import { readFileSync, writeFileSync } from "node:fs";
import { makeGate } from "../lib/pdf-gate.js";
import { stableStringify } from "../lib/stable.js";

// Run after build:pdfs. Publishes a PBKDF2 verifier for PDF_PASSWORD (a GitHub secret) in dist/data/slides.json.
// Without the secret there is no gate and the site disables the "merge PDFs" button; per-slide PDFs stay public.
const out = process.env.PDF_OUT ?? "dist";
const password = process.env.PDF_PASSWORD ?? "";
const indexPath = `${out}/data/slides.json`;
const index = JSON.parse(readFileSync(indexPath, "utf8")) as Record<string, unknown>;

if (!password) {
  writeFileSync(indexPath, stableStringify({ ...index, pdfGate: null }) + "\n", "utf8");
  console.error("::warning::PDF_PASSWORD is not set; merged-PDF download is disabled");
} else {
  writeFileSync(indexPath, stableStringify({ ...index, pdfGate: await makeGate(password) }) + "\n", "utf8");
  console.log("pdf gate written");
}
