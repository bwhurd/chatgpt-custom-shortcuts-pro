<#
Setup-I18n-Audit.ps1 — Simple HTML vs JSON i18n audit

How to run (script saved at C:\Users\bwhur\Dropbox\CGCSP-Github\Setup-I18n-Audit.ps1)
1) Update JSON only:
   & "C:\Users\bwhur\Dropbox\CGCSP-Github\Setup-I18n-Audit.ps1" -Run

2) Update JSON + annotate HTML:
   & "C:\Users\bwhur\Dropbox\CGCSP-Github\Setup-I18n-Audit.ps1" -Run -AnnotateHtml

3) Use custom paths:
   & "C:\Users\bwhur\Dropbox\CGCSP-Github\Setup-I18n-Audit.ps1" -Run `
       -HtmlPath "D:\site\page.html" -JsonPath "D:\site\messages.json"

Default input files (change with -HtmlPath / -JsonPath)
- HTML: C:\Users\bwhur\Dropbox\CGCSP-Github\CheckThisHtmlLocalization.html
- JSON: C:\Users\bwhur\Dropbox\CGCSP-Github\AgainstThisLocalizationFile.json

Outputs (written next to your inputs)
- AgainstThisLocalizationFile.backup.original.json   (created once)
- AgainstThisLocalizationFile.updated.json           (JSON + any missing keys)
- CheckThisHtmlLocalization.annotated.html           (only with -AnnotateHtml)

What it does
- Reads your HTML and JSON (messages) files.
- Finds all data-i18n="key" in the HTML.
- Appends any missing keys to the end of the JSON as:
    "the_missing_key": { "message": "UpdateThisText" }
- Does not overwrite the original JSON (writes *.updated.json + one-time backup).
- Optional: adds localization to plain-text elements missing it:
    class="i18n" data-i18n="new_i18_N" (N auto-increments)
  and appends those new_i18_N keys to the updated JSON.

Notes
- Safe to re-run; only adds keys that are still missing.
- If your app toggles text at runtime, you can manually add keys later; this tool just ensures referenced keys exist.
#>

[CmdletBinding()]
param(
  [string]$HtmlPath  = 'C:\Users\bwhur\Dropbox\CGCSP-Github\CheckThisHtmlLocalization.html',
  [string]$JsonPath  = 'C:\Users\bwhur\Dropbox\CGCSP-Github\AgainstThisLocalizationFile.json',
  [string]$ProjectDir,
  [switch]$AnnotateHtml,   # add -AnnotateHtml to also add data-i18n/class="i18n" to plain-text elements
  [switch]$Run,            # add -Run to execute immediately
  [switch]$InstallNode     # add -InstallNode to install Node LTS via winget if missing
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-Cmd { param([string]$Name) Get-Command $Name -ErrorAction SilentlyContinue }

Write-Host "== i18n audit setup =="

# Resolve inputs
$HtmlPath = (Resolve-Path -LiteralPath ([Environment]::ExpandEnvironmentVariables($HtmlPath)) -ErrorAction Stop).Path
$JsonPath = (Resolve-Path -LiteralPath ([Environment]::ExpandEnvironmentVariables($JsonPath)) -ErrorAction Stop).Path

# Choose project directory near the JSON file (avoid dot-prefixed name)
if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
  $jsonDir = [IO.Path]::GetDirectoryName($JsonPath)
  $ProjectDir = Join-Path -Path $jsonDir -ChildPath "i18n-audit"
}
if (-not (Test-Path -LiteralPath $ProjectDir)) {
  New-Item -ItemType Directory -Path $ProjectDir -Force | Out-Null
}
Write-Host "Project directory: $ProjectDir"

# Verify Node/npm (install if requested)
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
Write-Host ("Node: {0}  npm: {1}" -f (node -v).Trim(), (npm -v).Trim())

# Keep npm local and quiet
$env:NPM_CONFIG_WORKSPACES = 'false'
$env:NPM_CONFIG_AUDIT      = 'false'
$env:NPM_CONFIG_FUND       = 'false'

Push-Location -LiteralPath $ProjectDir

# Minimal package.json
$pkgPath = Join-Path -Path $ProjectDir -ChildPath "package.json"
if (-not (Test-Path -LiteralPath $pkgPath)) {
  $pkgJson = [ordered]@{
    name    = "i18n-audit"
    version = "0.0.0"
    private = $true
    type    = "module"
    scripts = @{}
  }
  $pkgJson | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $pkgPath -Encoding UTF8
}

# Install deps only if missing
$deps = @('cheerio')
$toInstall = @()
foreach ($d in $deps) {
  if (-not (Test-Path -LiteralPath (Join-Path $ProjectDir ("node_modules\" + $d)))) {
    $toInstall += $d
  }
}
if ($toInstall.Count -gt 0) {
  Write-Host "Installing dependencies: $($toInstall -join ', ')..."
  npm install --save-dev $toInstall | Out-Null
} else {
  Write-Host "Dependencies already installed. Skipping npm install."
}

# Write the Node script that audits and optionally annotates HTML
$nodeScriptPath = Join-Path -Path $ProjectDir -ChildPath "audit-i18n.mjs"
$nodeScript = @'
import fs from "fs/promises";
import path from "path";
import cheerio from "cheerio";

function getArg(flag){ const i=process.argv.indexOf(flag); return i!==-1?process.argv[i+1]:null; }
function hasFlag(flag){ return process.argv.includes(flag); }

function stripBOM(s){ return s.replace(/^\uFEFF/, ""); }

function detectIndent(src){
  const lines = src.split(/\r?\n/);
  for(const ln of lines){
    const m = ln.match(/^(\s+)"[^"]+"\s*:/);
    if(m) return m[1];
  }
  return "  ";
}

function isObject(v){ return v && typeof v === "object" && !Array.isArray(v); }

function nextNewKeyFactory(existingKeys){
  let max = 0;
  for (const k of existingKeys){
    const m = /^new_i18_(\d+)$/.exec(k);
    if (m) max = Math.max(max, parseInt(m[1],10));
  }
  let n = max + 1;
  return () => {
    let key;
    do { key = `new_i18_${n++}`; } while (existingKeys.has(key));
    existingKeys.add(key);
    return key;
  };
}

function isLeafWithText($, el){
  const $el = $(el);
  if ($el.attr("data-i18n")) return false;
  if ($el.find("[data-i18n]").length) return false; // avoid nesting duplicates
  if ($el.children().length > 0) return false;      // only leaf nodes (safer)
  const rawText = $el.text().replace(/\s+/g," ").trim();
  if (!rawText) return false;
  if (!/[A-Za-z0-9]/.test(rawText)) return false;   // skip non-word-only
  return true;
}

async function main(){
  const htmlPath = getArg("--html");
  const jsonPath = getArg("--json");
  const outDir   = getArg("--outDir") || path.dirname(jsonPath);
  const annotate = hasFlag("--annotate"); // add data-i18n/class="i18n" to plain-text leaf nodes

  if(!htmlPath || !jsonPath){
    console.error("Usage: node audit-i18n.mjs --html <file.html> --json <messages.json> [--outDir <dir>] [--annotate]");
    process.exit(2);
  }

  const [htmlRaw, jsonRaw] = await Promise.all([
    fs.readFile(htmlPath, "utf8"),
    fs.readFile(jsonPath, "utf8")
  ]);

  const html = stripBOM(htmlRaw);
  const jsonText = stripBOM(jsonRaw);
  let messages;
  try {
    messages = JSON.parse(jsonText);
  } catch (e) {
    console.error("Failed to parse JSON:", e.message);
    process.exit(1);
  }
  if (!isObject(messages)) {
    console.error("Expected the JSON root to be an object mapping keys to { message: string }.");
    process.exit(1);
  }

  const $ = cheerio.load(html, { decodeEntities: false });

  // Collect all data-i18n keys referenced in HTML (in document order)
  const referenced = [];
  const seenRef = new Set();
  $("[data-i18n]").each((_, el) => {
    const k = ($(el).attr("data-i18n") || "").trim();
    if (k && !seenRef.has(k)) { seenRef.add(k); referenced.push(k); }
  });

  // Determine missing keys (referenced in HTML but absent in JSON)
  const existingKeys = Object.keys(messages);
  const existingSet  = new Set(existingKeys);
  const missingFromJson = referenced.filter(k => !existingSet.has(k));

  // Prepare output object while preserving original key order
  const out = {};
  for (const k of existingKeys) out[k] = messages[k];

  // Append missing referenced keys at the end with default payload
  for (const k of missingFromJson) {
    out[k] = { message: "UpdateThisText" };
    existingSet.add(k);
  }

  // Optionally annotate HTML: add data-i18n + class to leaf elements with plain text
  const addedHtmlKeys = [];
  if (annotate) {
    const allKnown = new Set(Object.keys(out));
    for (const k of referenced) allKnown.add(k);
    const nextKey = nextNewKeyFactory(allKnown);

    const candidates = $("p,span,div,button,a,li,label,option,h1,h2,h3,h4,h5,h6,th,td,small,strong,em,b,i,caption")
      .filter((_, el) => isLeafWithText($, el));

    candidates.each((_, el) => {
      const $el = $(el);
      // Double-check no attribute exists
      if ($el.attr("data-i18n")) return;
      const key = nextKey();
      $el.attr("data-i18n", key);
      const cls = $el.attr("class");
      if (!cls || !(" " + cls + " ").includes(" i18n ")) $el.addClass("i18n");
      addedHtmlKeys.push(key);
    });

    // Add those new keys to JSON as well, at the end
    for (const k of addedHtmlKeys) {
      out[k] = { message: "UpdateThisText" };
    }
  }

  // Write outputs
  const baseJson = path.basename(jsonPath, path.extname(jsonPath));
  const baseHtml = path.basename(htmlPath, path.extname(htmlPath));

  const jsonBackup = path.join(outDir, `${baseJson}.backup.original.json`);
  const jsonUpdated = path.join(outDir, `${baseJson}.updated.json`);
  const htmlAnnotated = path.join(outDir, `${baseHtml}.annotated.html`);

  // Keep a one-time backup of original JSON
  try { await fs.access(jsonBackup); } catch { await fs.writeFile(jsonBackup, jsonText, "utf8"); }

  // Serialize with similar indentation
  const indent = detectIndent(jsonText);
  const updatedJsonText = JSON.stringify(out, null, indent) + "\n";
  await fs.writeFile(jsonUpdated, updatedJsonText, "utf8");

  if (annotate) {
    await fs.writeFile(htmlAnnotated, $.html(), "utf8");
  }

  // Console summary
  console.log(`Referenced keys in HTML: ${referenced.length}`);
  console.log(`Missing in JSON (added): ${missingFromJson.length}`);
  console.log(`Annotated HTML elements (new_i18_*): ${addedHtmlKeys.length}${annotate ? " (written)" : ""}`);
  console.log(`JSON updated -> ${jsonUpdated}`);
  if (annotate) console.log(`HTML annotated -> ${htmlAnnotated}`);
}
main().catch(err => { console.error("Audit failed:", err); process.exit(1); });
'@
Set-Content -LiteralPath $nodeScriptPath -Encoding UTF8 -Value $nodeScript

# Add npm script for convenience
$pkgJson = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json -AsHashtable
if (-not $pkgJson.ContainsKey('scripts')) { $pkgJson['scripts'] = @{} }
$cmd = "node audit-i18n.mjs --html `"$HtmlPath`" --json `"$JsonPath`""
if ($AnnotateHtml) { $cmd += " --annotate" }
$pkgJson['scripts']['audit'] = $cmd
$pkgJson | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $pkgPath -Encoding UTF8

Pop-Location

if ($Run) {
  Push-Location -LiteralPath $ProjectDir
  Write-Host "Running i18n audit..."
  $argsList = @("audit-i18n.mjs","--html",$HtmlPath,"--json",$JsonPath)
  if ($AnnotateHtml) { $argsList += @("--annotate") }
  node @argsList
  Pop-Location
}

Write-Host "Done. Project: $ProjectDir"
Write-Host "Run later: cd `"$ProjectDir`"; npm run audit"
Write-Host "Outputs: *.updated.json (+ optional *.annotated.html) in the same folder as your JSON/HTML"