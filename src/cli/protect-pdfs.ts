import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { deriveKey, encryptBytes, newCryptoInfo } from "../lib/pdf-crypto.js";
import { stableStringify } from "../lib/stable.js";

// Run after build:pdfs. The newest slide's PDF is published as a free sample (pdf/sample.pdf); every other
// per-slide PDF is encrypted with PDF_PASSWORD (a GitHub secret) and only the browser merge can decrypt it.
// Fail closed: without the password only the sample is published and the merge is disabled (pdfCrypto: null).
const out = process.env.PDF_OUT ?? "dist";
const password = process.env.PDF_PASSWORD ?? "";
const indexPath = `${out}/data/slides.json`;
const index = JSON.parse(readFileSync(indexPath, "utf8")) as { slides: { key: string; publishedJst: string }[] };
const pdfs = existsSync(`${out}/pdf`) ? readdirSync(`${out}/pdf`).filter((f) => f.endsWith(".pdf")) : [];

const newest = [...index.slides].sort((a, b) => (a.publishedJst < b.publishedJst ? 1 : a.publishedJst > b.publishedJst ? -1 : a.key < b.key ? -1 : 1))[0];
const sample = newest && pdfs.includes(`${newest.key}.pdf`) ? newest.key : null;
if (sample) copyFileSync(`${out}/pdf/${sample}.pdf`, `${out}/pdf/sample.pdf`);

let info = null;
if (password) {
  info = newCryptoInfo();
  const key = await deriveKey(password, info);
  for (const f of pdfs) writeFileSync(`${out}/pdf/${f}.enc`, await encryptBytes(key, readFileSync(`${out}/pdf/${f}`)));
} else {
  console.error("::warning::PDF_PASSWORD is not set; merged-PDF download is disabled");
}
for (const f of pdfs) rmSync(`${out}/pdf/${f}`);

writeFileSync(indexPath, stableStringify({ ...index, pdfCrypto: info, sample }) + "\n", "utf8");
console.log(`pdfs: ${pdfs.length} (${info ? "encrypted" : "not published"}), sample: ${sample ?? "none"}`);
