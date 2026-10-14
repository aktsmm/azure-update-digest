import { cpSync, mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";
import { loadConfigs } from "../lib/config.js";
import { loadSiteData } from "../lib/site-data.js";
import { writeJson } from "../lib/stable.js";

const out = "dist";
const cfg = loadConfigs();
const { items, meta } = loadSiteData(process.env.DATA_ROOT ?? "data", cfg);

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/data`, { recursive: true });
cpSync("site/index.html", `${out}/index.html`);
cpSync("site/style.css", `${out}/style.css`);
writeJson(`${out}/data/items.json`, { schema: 1, items });
writeJson(`${out}/data/meta.json`, meta);
await build({ entryPoints: ["src/web/app.ts"], bundle: true, format: "iife", target: "es2022", outfile: `${out}/app.js`, minify: false, logLevel: "warning" });
console.log(`site built: ${items.length} items`);
