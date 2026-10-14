import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { deriveKey, encryptBytes, newCryptoInfo } from "../lib/pdf-crypto.js";
import { stableStringify } from "../lib/stable.js";

// Run after build:pdfs. Encrypts dist/pdf/<id>.pdf to <id>.pdf.enc with PDF_PASSWORD (a GitHub secret).
// Fail closed: without the password no PDF is published and slides.json carries pdfCrypto: null.
const out = process.env.PDF_OUT ?? "dist";
const password = process.env.PDF_PASSWORD ?? "";
const indexPath = `${out}/data/slides.json`;
const index = JSON.parse(readFileSync(indexPath, "utf8")) as { schema: number; slides: unknown[]; pdfCrypto?: unknown };
const pdfs = existsSync(`${out}/pdf`) ? readdirSync(`${out}/pdf`).filter((f) => f.endsWith(".pdf")) : [];

if (!password) {
  for (const f of pdfs) rmSync(`${out}/pdf/${f}`);
  writeFileSync(indexPath, stableStringify({ ...index, pdfCrypto: null }) + "\n", "utf8");
  console.error("::warning::PDF_PASSWORD is not set; PDFs are not published");
  process.exit(0);
}

const info = newCryptoInfo();
const key = await deriveKey(password, info);
for (const f of pdfs) {
  const enc = await encryptBytes(key, readFileSync(`${out}/pdf/${f}`));
  writeFileSync(`${out}/pdf/${f}.enc`, enc);
  rmSync(`${out}/pdf/${f}`);
}
writeFileSync(indexPath, stableStringify({ ...index, pdfCrypto: info }) + "\n", "utf8");
console.log(`encrypted ${pdfs.length} pdf(s)`);
