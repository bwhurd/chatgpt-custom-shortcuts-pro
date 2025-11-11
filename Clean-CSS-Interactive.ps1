# To run this script from any PowerShell prompt, use:
# Run in PS: & "C:\Users\bwhur\Dropbox\CGCSP-Github\Clean-CSS-Interactive.ps1" -Run

[CmdletBinding()]
param(
  [string]$ToolDir = Join-Path $env:LOCALAPPDATA 'css-cleanup-tool',
  [switch]$InstallNode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Test-Cmd { param([string]$Name) Get-Command $Name -ErrorAction SilentlyContinue }

# 1) Ensure Node/npm
if (-not (Test-Cmd node) -or -not (Test-Cmd npm)) {
  if ($InstallNode) {
    $winget = Test-Cmd winget
    if (-not $winget) { throw "Node.js/npm not found and winget is unavailable. Install Node.js LTS, then rerun." }
    Write-Host "Installing Node.js LTS via winget..."
    winget install --id OpenJS.NodeJS.LTS -e --source winget --silent
    $env:PATH = [Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [Environment]::GetEnvironmentVariable("PATH","User")
  } else {
    throw "Node.js/npm not found. Rerun with -InstallNode or install Node.js LTS first."
  }
}

# 2) Prepare tool directory and dependencies (one-time)
if (-not (Test-Path -LiteralPath $ToolDir)) { New-Item -ItemType Directory -Path $ToolDir -Force | Out-Null }
$pkgPath = Join-Path $ToolDir 'package.json'
if (-not (Test-Path -LiteralPath $pkgPath)) {
  $pkg = [ordered]@{
    name    = "css-cleanup-tool"
    version = "0.0.0"
    private = $true
    type    = "module"
    scripts = @{}
  }
  $pkg | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $pkgPath -Encoding UTF8
}
# Install deps only if missing
$needInstall = @(
  Join-Path $ToolDir 'node_modules\postcss\package.json'),
  (Join-Path $ToolDir 'node_modules\purgecss\package.json'),
  (Join-Path $ToolDir 'node_modules\cssnano\package.json'),
  (Join-Path $ToolDir 'node_modules\prettier\package.json')
| ForEach-Object { if (-not (Test-Path $_)) { $_ } }

if ($needInstall.Count -gt 0) {
  Push-Location $ToolDir
  Write-Host "Installing tool dependencies..."
  $env:NPM_CONFIG_WORKSPACES='false'; $env:NPM_CONFIG_AUDIT='false'; $env:NPM_CONFIG_FUND='false'
  npm install --save-dev postcss purgecss cssnano prettier | Out-Null
  Pop-Location
}

# 3) Write/update the Node worker script (beautifies + removes unused keyframes)
$nodeScriptPath = Join-Path $ToolDir 'clean-css.mjs'
$nodeScript = @'
import fs from "fs/promises";
import path from "path";
import postcss from "postcss";
import cssnano from "cssnano";
import prettier from "prettier";

async function getPurgeCSS() {
  const mod = await import("purgecss");
  if (mod?.PurgeCSS && typeof mod.PurgeCSS === "function") return mod.PurgeCSS;
  if (mod?.default && typeof mod.default === "function") return mod.default;
  if (typeof mod === "function") return mod;
  throw new Error("Unable to resolve PurgeCSS export");
}

function arg(flag){ const i=process.argv.indexOf(flag); return i!==-1 ? process.argv[i+1] : null; }
function toKb(b){ return (b/1024).toFixed(2)+" KB"; }

async function readSafelist(file) {
  try {
    const raw = await fs.readFile(file,"utf8");
    return raw.split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith("#")).map(l=>{
      if (l.startsWith("/") && l.endsWith("/")) return new RegExp(l.slice(1,-1));
      return l;
    });
  } catch { return []; }
}

async function main(){
  const cssPath = arg("--css");
  const htmlPath = arg("--html");
  const outDir  = arg("--outDir") || (cssPath ? path.dirname(cssPath) : process.cwd());
  const safelistFile = arg("--safelist") || path.join(outDir, "safelist.txt");
  if (!cssPath || !htmlPath) {
    console.error("Usage: node clean-css.mjs --css <file.css> --html <file.html> [--outDir <dir>] [--safelist <file>]");
    process.exit(2);
  }

  const start = Date.now();
  const cssRaw = await fs.readFile(cssPath, "utf8");
  const cssBytes = Buffer.byteLength(cssRaw);

  const PurgeCSS = await getPurgeCSS();
  const purger = new PurgeCSS();
  const safelist = await readSafelist(safelistFile);

  const purgeResult = await purger.purge({
    content: [htmlPath],
    css: [{ raw: cssRaw, extension: "css" }],
    safelist,
    rejected: true,
    keyframes: true,   // remove @keyframes unused by remaining CSS
    fontFace: true     // remove @font-face unused by remaining CSS
  });

  const purgedCss = purgeResult[0]?.css ?? "";
  const rejected = purgeResult[0]?.rejected ?? [];

  // Optimize: dedupe/merge/clean overridden declarations
  const postcssResult = await postcss([ cssnano({ preset: "default" }) ])
    .process(purgedCss, { from: cssPath, to: path.join(outDir, "scrubbed.css"), map: false });

  // Beautify both outputs for readability
  const prettyPurged = await prettier.format(purgeResult[0]?.css ?? "", { parser: "css" });
  const prettyFinal  = await prettier.format(postcssResult.css,            { parser: "css" });

  const baseName = path.basename(cssPath, path.extname(cssPath));
  const purgedOut = path.join(outDir, `${baseName}.purged.css`);
  const finalOut  = path.join(outDir, `${baseName}.scrubbed.css`);
  const backupOut = path.join(outDir, `${baseName}.backup.original.css`);
  const reportOut = path.join(outDir, `${baseName}.scrubbed.report.txt`);

  const purgedBytes = Buffer.byteLength(prettyPurged);
  const finalBytes  = Buffer.byteLength(prettyFinal);

  const report = [
    "CSS cleanup report",
    `Source CSS: ${cssPath}`,
    `HTML scanned: ${htmlPath}`,
    `Safelist entries: ${safelist.length}`,
    `Original size: ${toKb(cssBytes)} (${cssBytes} bytes)`,
    `After purge:   ${toKb(purgedBytes)} (${purgedBytes} bytes)`,
    `Final size:    ${toKb(finalBytes)} (${finalBytes} bytes)`,
    `Removed selectors count (purge phase): ${rejected.length}`,
    "",
    "Note: Output is prettified. PurgeCSS removed unused selectors/@keyframes; cssnano deduped/merged rules.",
    "",
    "Removed selectors (first 500):",
    ...rejected.slice(0,500)
  ].join("\\n");

  // Write outputs
  try { await fs.access(backupOut); } catch { await fs.writeFile(backupOut, cssRaw, "utf8"); }
  await fs.writeFile(purgedOut, prettyPurged, "utf8");
  await fs.writeFile(finalOut,  prettyFinal,  "utf8");
  await fs.writeFile(reportOut, report + "\\n", "utf8");

  console.log(`Wrote: ${purgedOut}`);
  console.log(`Wrote: ${finalOut}`);
  console.log(`Wrote: ${reportOut}`);
  console.log(`Done in ${((Date.now()-start)/1000).toFixed(2)}s`);
}

main().catch(err => { console.error("Cleanup failed:", err); process.exit(1); });
'@
Set-Content -LiteralPath $nodeScriptPath -Encoding UTF8 -Value $nodeScript

# 4) Prompt for files in the current folder
$cwd = Get-Location
function Prompt-ForFile($filter, $label) {
  $candidates = Get-ChildItem -LiteralPath $cwd -File -Include $filter -ErrorAction SilentlyContinue | Sort-Object Name
  $default = if ($candidates.Count -gt 0) { $candidates[0].Name } else { "" }
  $prompt = if ($default) { "$label (default: $default)" } else { "$label" }
  $ans = Read-Host $prompt
  if ([string]::IsNullOrWhiteSpace($ans)) { $ans = $default }
  if (-not $ans) { throw "No file provided for $label." }
  $full = Join-Path $cwd $ans
  if (-not (Test-Path -LiteralPath $full)) { throw "Not found: $full" }
  return (Resolve-Path -LiteralPath $full).Path
}

$HtmlPath = Prompt-ForFile @("*.html","*.htm") "Enter HTML file name"
$CssPath  = Prompt-ForFile @("*.css")         "Enter CSS file name"

# 5) Create output folder named <cssfile>_scrubbed
$cssBase = [IO.Path]::GetFileNameWithoutExtension($CssPath)
$OutDir  = Join-Path $cwd ("{0}_scrubbed" -f $cssBase)
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

# 6) Create a per-run safelist beside outputs (user-editable)
$safelistPath = Join-Path $OutDir "safelist.txt"
if (-not (Test-Path -LiteralPath $safelistPath)) {
@'
# One entry per line. Plain text = exact match; /regex/ = pattern.
# Examples for dynamic classes you may toggle via JS:
#/^is-/
#/^has-/
#/^js-/
#show
#open
#active
#modal

# If your layout wraps this tile in `.shortcut-grid`, keep those rules:
#/shortcut-grid/
'@ | Set-Content -LiteralPath $safelistPath -Encoding UTF8
}

# 7) Run the worker
Push-Location -LiteralPath $ToolDir
Write-Host "Running cleanup..."
node .\clean-css.mjs --css "$CssPath" --html "$HtmlPath" --outDir "$OutDir" --safelist "$safelistPath"
Pop-Location

Write-Host ""
Write-Host "Outputs are in: $OutDir"
Write-Host " - Purged (prettified): $(Join-Path $OutDir ("{0}.purged.css" -f $cssBase))"
Write-Host " - Final  (prettified): $(Join-Path $OutDir ("{0}.scrubbed.css" -f $cssBase))"
Write-Host " - Report:               $(Join-Path $OutDir ("{0}.scrubbed.report.txt" -f $cssBase))"
Write-Host " - Backup:               $(Join-Path $OutDir ("{0}.backup.original.css" -f $cssBase))"