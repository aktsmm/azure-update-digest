import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { loadConfigs } from "../lib/config.js";
import { loadSiteData } from "../lib/site-data.js";
import { sha256, writeJson } from "../lib/stable.js";

const out = "dist";
const cfg = loadConfigs();
const { items, meta } = loadSiteData(process.env.DATA_ROOT ?? "data", cfg);

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/data`, { recursive: true });
cpSync("site/index.html", `${out}/index.html`);
cpSync("site/style.css", `${out}/style.css`);
writeJson(`${out}/data/items.json`, { schema: 1, items });
writeJson(`${out}/data/meta.json`, meta);
// GitHub Pages caches assets for 10 minutes; version the URLs so a new deploy is picked up immediately.
await build({ entryPoints: ["src/web/pdf-merge.ts"], bundle: true, format: "iife", globalName: "PdfMerge", target: "es2022", outfile: `${out}/pdf-merge.js`, minify: true, logLevel: "warning" });
await build({ entryPoints: ["src/web/pptx-build.ts"], bundle: true, format: "iife", globalName: "PptxBuild", target: "es2022", outfile: `${out}/pptx-build.js`, minify: true, logLevel: "warning", define: { "process.env.NODE_ENV": '"production"' } });
const ver = (p: string) => sha256(readFileSync(p, "utf8")).slice(0, 8);
const mergeV = ver(`${out}/pdf-merge.js`);
const pptxV = ver(`${out}/pptx-build.js`);
await build({ entryPoints: ["src/web/app.ts"], bundle: true, format: "iife", target: "es2022", outfile: `${out}/app.js`, minify: false, logLevel: "warning", define: { __PDF_MERGE_V__: JSON.stringify(mergeV), __PPTX_BUILD_V__: JSON.stringify(pptxV) } });
const html = readFileSync(`${out}/index.html`, "utf8")
  .replace('href="style.css"', `href="style.css?v=${ver(`${out}/style.css`)}"`)
  .replace('src="app.js"', `src="app.js?v=${ver(`${out}/app.js`)}"`);
writeFileSync(`${out}/index.html`, html, "utf8");
console.log(`site built: ${items.length} items`);
