# To run this script from any PowerShell prompt, use:
#   & "C:\Users\bwhur\Dropbox\CGCSP-Github\Setup-And-Clean-CSS.ps1" -Run

[CmdletBinding()]
param(
  [string]$CssPath = 'C:\Users\bwhur\Dropbox\CGCSP-Github\scrub-this-css.css',
  [string]$HtmlPath = 'C:\Users\bwhur\Dropbox\CGCSP-Github\based-on-this.html',
  [string]$ProjectDir,   # e.g. -ProjectDir "C:\Users\bwhur\css-cleanup" (recommended, outside Dropbox)
  [switch]$Run,
  [switch]$InstallNode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-Cmd { param([string]$Name) Get-Command $Name -ErrorAction SilentlyContinue }

Write-Host "== CSS cleanup setup v4 =="

# Resolve inputs
$CssPath  = (Resolve-Path -LiteralPath ([Environment]::ExpandEnvironmentVariables($CssPath)) -ErrorAction Stop).Path
$HtmlPath = (Resolve-Path -LiteralPath ([Environment]::ExpandEnvironmentVariables($HtmlPath)) -ErrorAction Stop).Path

# Choose project directory (avoid dot-prefixed name)
if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
  $cssDir = [IO.Path]::GetDirectoryName($CssPath)
  $ProjectDir = Join-Path -Path $cssDir -ChildPath "css-cleanup"
}
if ((Split-Path -Path $ProjectDir -Leaf) -like '.*') {
  $ProjectDir = Join-Path (Split-Path -Path $ProjectDir -Parent) 'css-cleanup'
  Write-Host "Adjusted project directory to: $ProjectDir"
}

if (-not (Test-Path -LiteralPath $ProjectDir)) {
  New-Item -ItemType Directory -Path $ProjectDir -Force | Out-Null
}
Write-Host "Project directory: $ProjectDir"

# Node/npm
$nodeCmd = Test-Cmd node
$npmCmd  = Test-Cmd npm
if (-not $nodeCmd -or -not $npmCmd) {
  if ($InstallNode) {
    $winget = Test-Cmd winget
    if (-not $winget) { throw "winget not available; install Node.js LTS from https://nodejs.org and rerun." }
    Write-Host "Installing Node.js LTS via winget..."
    winget install --id OpenJS.NodeJS.LTS -e --source winget --silent
    $env:PATH = [Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [Environment]::GetEnvironmentVariable("PATH","User")
  } else {
    throw "Node.js/npm not found. Rerun with -InstallNode or install Node.js LTS first."
  }
}
$nodeVersion = (node -v).Trim()
$npmVersion  = (npm -v).Trim()
Write-Host "Node: $nodeVersion  npm: $npmVersion"

# Keep npm scoped to this folder and quieter/faster
$env:NPM_CONFIG_WORKSPACES = 'false'
$env:NPM_CONFIG_AUDIT      = 'false'
$env:NPM_CONFIG_FUND       = 'false'

Push-Location -LiteralPath $ProjectDir

# package.json (write minimal if missing)
$pkgPath = Join-Path -Path $ProjectDir -ChildPath "package.json"
if (-not (Test-Path -LiteralPath $pkgPath)) {
  $pkgJson = [ordered]@{
    name    = "css-cleanup"
    version = "0.0.0"
    private = $true
    type    = "module"
    scripts = @{}
  }
  $pkgJson | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $pkgPath -Encoding UTF8
} else {
  # Load as hashtable so we can add/modify freely
  $pkgJson = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json -AsHashtable
  if (-not $pkgJson.ContainsKey('name') -or [string]::IsNullOrWhiteSpace([string]$pkgJson['name']) -or ($pkgJson['name'] -as [string]).StartsWith('.')) {
    $pkgJson['name'] = 'css-cleanup'
  }
  $pkgJson['private'] = $true
  $pkgJson['type']    = 'module'
  if (-not $pkgJson.ContainsKey('scripts') -or -not ($pkgJson['scripts'] -is [Collections.IDictionary])) {
    $pkgJson['scripts'] = @{}
  }
  $pkgJson | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $pkgPath -Encoding UTF8
}

# Install deps locally
Write-Host "Installing dependencies (postcss, purgecss, cssnano)..."
npm install --save-dev postcss purgecss cssnano | Out-Null

# safelist.txt
$safelistPath = Join-Path -Path $ProjectDir -ChildPath "safelist.txt"
if (-not (Test-Path -LiteralPath $safelistPath)) {
@'
# One entry per line. Use plain strings or /regex/.
#/^is-/
#/^has-/
#/^js-/
#show
#open
#collapse
'@ | Set-Content -LiteralPath $safelistPath -Encoding UTF8
}

# clean-css.mjs
$nodeScriptPath = Join-Path -Path $ProjectDir -ChildPath "clean-css.mjs"
$nodeScript = @'
import fs from "fs/promises";
import path from "path";
import postcss from "postcss";
import cssnano from "cssnano";

function getArg(flag){ const i=process.argv.indexOf(flag); return i!==-1?process.argv[i+1]:null; }
function toKb(b){ return (b/1024).toFixed(2)+" KB"; }

async function readSafelist(file){
  try{
    const raw = await fs.readFile(file,"utf8");
    return raw.split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith("#")).map(l=>{
      if(l.startsWith("/") && l.endsWith("/")) return new RegExp(l.slice(1,-1));
      return l;
    });
  }catch{ return []; }
}

async function getPurgeCSS(){
  const mod = await import("purgecss");
  if (mod?.PurgeCSS && typeof mod.PurgeCSS === "function") return mod.PurgeCSS;
  if (mod?.default && typeof mod.default === "function") return mod.default;
  if (typeof mod === "function") return mod;
  throw new Error("Unable to resolve PurgeCSS export from 'purgecss'");
}

async function main(){
  const cssPath = getArg("--css") || process.env.CSS_PATH;
  const htmlPath = getArg("--html") || process.env.HTML_PATH;
  const outDir = getArg("--outDir") || path.dirname(cssPath);
  const safelistFile = getArg("--safelist") || "safelist.txt";
  const dryRun = process.argv.includes("--dry-run");
  if(!cssPath || !htmlPath){
    console.error("Usage: node clean-css.mjs --css <path.css> --html <path.html> [--outDir <dir>] [--safelist <file>] [--dry-run]");
    process.exit(2);
  }

  const cssRaw = await fs.readFile(cssPath,"utf8");
  const cssBytes = Buffer.byteLength(cssRaw);
  const safelist = await readSafelist(path.isAbsolute(safelistFile)?safelistFile:path.join(process.cwd(),safelistFile));

  const PurgeCSS = await getPurgeCSS();
  const purger = new PurgeCSS();
  const purgeResult = await purger.purge({
    content: [htmlPath],
    css: [{ raw: cssRaw, extension: "css" }],
    safelist,
    rejected: true
  });
  const purgedCss = purgeResult[0]?.css ?? "";
  const rejected = purgeResult[0]?.rejected ?? [];
  const purgedBytes = Buffer.byteLength(purgedCss);

  const postcssResult = await postcss([ cssnano({ preset: "default" }) ])
    .process(purgedCss, { from: cssPath, to: path.join(outDir,"scrubbed.css"), map:false });

  const optimizedCss = postcssResult.css;
  const optimizedBytes = Buffer.byteLength(optimizedCss);

  const baseName = path.basename(cssPath, path.extname(cssPath));
  const purgedOut = path.join(outDir, `${baseName}.purged.css`);
  const finalOut  = path.join(outDir, `${baseName}.scrubbed.css`);
  const backupOut = path.join(outDir, `${baseName}.backup.original.css`);
  const reportOut = path.join(outDir, `${baseName}.scrubbed.report.txt`);

  const report = [
    `CSS cleanup report`,
    `Source CSS: ${cssPath}`,
    `HTML scanned: ${htmlPath}`,
    `Safelist entries: ${safelist.length}`,
    `Original size: ${toKb(cssBytes)} (${cssBytes} bytes)`,
    `After purge:   ${toKb(purgedBytes)} (${purgedBytes} bytes)`,
    `Final size:    ${toKb(optimizedBytes)} (${optimizedBytes} bytes)`,
    `Removed selectors count (purge phase): ${rejected.length}`,
    ``,
    `Note: cssnano removed duplicates/overrides and merged compatible rules.`,
    ``,
    `Removed selectors (first 500):`,
    ...rejected.slice(0,500)
  ].join("\n");

  if(dryRun){ console.log(report); return; }

  try{ await fs.access(backupOut); }catch{ await fs.writeFile(backupOut, cssRaw, "utf8"); }
  await fs.writeFile(purgedOut, purgedCss, "utf8");
  await fs.writeFile(finalOut, optimizedCss, "utf8");
  await fs.writeFile(reportOut, report+"\n", "utf8");

  console.log(`Wrote: ${purgedOut}`);
  console.log(`Wrote: ${finalOut}`);
  console.log(`Wrote: ${reportOut}`);
}

main().catch(err=>{ console.error("Cleanup failed:", err); process.exit(1); });
'@
Set-Content -LiteralPath $nodeScriptPath -Encoding UTF8 -Value $nodeScript

# Update package.json scripts (load as hashtable to avoid property-set errors)
$pkgJson = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json -AsHashtable
if (-not $pkgJson.ContainsKey('scripts') -or -not ($pkgJson['scripts'] -is [Collections.IDictionary])) {
  $pkgJson['scripts'] = @{}
}
$pkgJson['scripts']['clean'] = "node clean-css.mjs --css `"$CssPath`" --html `"$HtmlPath`""
$pkgJson | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $pkgPath -Encoding UTF8

Pop-Location

if ($Run) {
  Push-Location -LiteralPath $ProjectDir
  Write-Host "Running initial cleanup..."
  node .\clean-css.mjs --css "$CssPath" --html "$HtmlPath"
  Pop-Location
}

Write-Host "Done. Project: $ProjectDir"
Write-Host "Run later: cd `"$ProjectDir`"; npm run clean"
Write-Host "Safelist (optional): $safelistPath"