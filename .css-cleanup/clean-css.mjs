import fs from "fs/promises";
import path from "path";
import postcss from "postcss";
import cssnano from "cssnano";

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}
function toKb(bytes) { return (bytes / 1024).toFixed(2) + " KB"; }

async function readSafelist(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw.split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith("#")).map(l=>{
      if (l.startsWith("/") && l.endsWith("/")) return new RegExp(l.slice(1,-1));
      return l;
    });
  } catch { return []; }
}

async function getPurgeCSS() {
  const mod = await import("purgecss");
  if (mod?.PurgeCSS && typeof mod.PurgeCSS === "function") return mod.PurgeCSS;
  if (mod?.default && typeof mod.default === "function") return mod.default;
  if (typeof mod === "function") return mod;
  throw new Error("Unable to resolve PurgeCSS export from 'purgecss'");
}

async function main() {
  const cssPath = getArg("--css") || process.env.CSS_PATH;
  const htmlPath = getArg("--html") || process.env.HTML_PATH;
  const outDir = getArg("--outDir") || path.dirname(cssPath);
  const safelistFile = getArg("--safelist") || "safelist.txt";
  const dryRun = process.argv.includes("--dry-run");

  if (!cssPath || !htmlPath) {
    console.error("Usage: node clean-css.mjs --css <path.css> --html <path.html> [--outDir <dir>] [--safelist <file>] [--dry-run]");
    process.exit(2);
  }

  const cssRaw = await fs.readFile(cssPath, "utf8");
  const cssBytes = Buffer.byteLength(cssRaw);
  const safelist = await readSafelist(path.isAbsolute(safelistFile) ? safelistFile : path.join(process.cwd(), safelistFile));

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

  const postcssResult = await postcss([
    cssnano({ preset: "default" })
  ]).process(purgedCss, { from: cssPath, to: path.join(outDir, "scrubbed.css"), map: false });

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
    ...rejected.slice(0, 500)
  ].join("\n");

  if (dryRun) {
    console.log(report);
    return;
  }

  try { await fs.access(backupOut); } catch { await fs.writeFile(backupOut, cssRaw, "utf8"); }
  await fs.writeFile(purgedOut, purgedCss, "utf8");
  await fs.writeFile(finalOut, optimizedCss, "utf8");
  await fs.writeFile(reportOut, report + "\n", "utf8");

  console.log(`Wrote: ${purgedOut}`);
  console.log(`Wrote: ${finalOut}`);
  console.log(`Wrote: ${reportOut}`);
}

main().catch(err => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
