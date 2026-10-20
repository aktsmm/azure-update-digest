# Renders the merged PPTX of every published slide in a real PowerPoint (read-only) and reports
# text boxes whose text is taller than the box (overflow) and slides with a large unused band above the footer.
# Local verification only (needs PowerPoint + Node). Usage: pwsh scripts/pptx-render-audit.ps1 [-Tolerance 2.5] [-MaxBlankInches 0.6]
param([double]$Tolerance = 2.5, [double]$MaxBlankInches = 0.6)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
New-Item -ItemType Directory -Force scratch | Out-Null
$js = @'
import { build } from "esbuild";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
await build({ entryPoints: ["src/web/pptx-build.ts"], bundle: true, format: "cjs", platform: "node", outfile: "scratch/audit-pptx.cjs", logLevel: "error" });
const lib = createRequire(import.meta.url)("./audit-pptx.cjs");
const all = [];
for (const f of readdirSync("data/slides").filter((x) => x.endsWith(".json"))) all.push(...JSON.parse(readFileSync("data/slides/" + f, "utf8")).slides);
writeFileSync("scratch/audit-all.pptx", Buffer.from(await lib.buildDeckPptx({ slides: all, categoryLabels: {}, periodLabel: null, totalInPeriod: all.length, createdUtc: "2026-01-01T00:00:00Z" })));
writeFileSync("scratch/audit-keys.json", JSON.stringify(all.map((s) => s.key)));
'@
Set-Content scratch\audit-build.mjs $js -Encoding utf8
node scratch\audit-build.mjs
$keys = Get-Content scratch\audit-keys.json -Raw | ConvertFrom-Json
$app = New-Object -ComObject PowerPoint.Application
$pres = $app.Presentations.Open((Resolve-Path scratch\audit-all.pptx).Path, $true, $false, $false)
$H = $pres.PageSetup.SlideHeight
$footerLine = $H - 0.84 * 72
$bad = @()
$n = 0
foreach ($sl in $pres.Slides) {
  $n++
  $over = @(); $bottom = 0.0; $isUpdate = $false
  foreach ($sh in $sl.Shapes) {
    if ($sh.HasTextFrame -and $sh.TextFrame.HasText) {
      $d = $sh.TextFrame.TextRange.BoundHeight - $sh.Height
      # headings are single-line and centred vertically, so ignore a couple of points there
      if ($d -gt $Tolerance) { $over += ("{0:N1}pt '{1}'" -f $d, $sh.TextFrame.TextRange.Text.Substring(0, [math]::Min(20, $sh.TextFrame.TextRange.Text.Length))) }
      if ($sh.TextFrame.TextRange.Text -match 'ID \d{5,}') { $isUpdate = $true }
    }
    if ($sh.Top + $sh.Height -lt $footerLine + 1 -and $sh.Top -gt 150) { $bottom = [math]::Max($bottom, $sh.Top + $sh.Height) }
  }
  if (-not $isUpdate) { continue }
  $blank = ($footerLine - $bottom) / 72
  if ($over.Count -gt 0 -or $blank -gt $MaxBlankInches) { $bad += [pscustomobject]@{ Slide = $n; Over = ($over -join '; '); BlankIn = [math]::Round($blank, 2) } }
}
$pres.Close()
"update slides checked: $($keys.Count); flagged: $($bad.Count)"
$bad | Format-Table -AutoSize -Wrap
