// build-zip.js
// run in powershell with: node build-zip.js
const fs = require('node:fs');
const path = require('node:path');
const archiver = require('archiver');
const stripJsonComments = require('strip-json-comments');

// 1. Read version from manifest.json (handle BOM + comments)
const manifestPath = path.join(__dirname, 'manifest.json');

let raw = fs.readFileSync(manifestPath, 'utf8');

// Strip UTF-8 BOM if present
if (raw.charCodeAt(0) === 0xfeff) {
  raw = raw.slice(1);
}

// Remove // and /* */ comments (JSONC → JSON)
const cleaned = stripJsonComments(raw, { whitespace: false });

let manifest;
try {
  manifest = JSON.parse(cleaned);
} catch (err) {
  console.error('❌ Failed to parse manifest.json. Make sure it is valid JSON.');
  console.error(`   ${err.message}`);
  process.exit(1);
}

const version = manifest?.version;
if (!version || typeof version !== 'string') {
  console.error('❌ No valid "version" field found in manifest.json');
  process.exit(1);
}

// 2. Ensure dist/ exists
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// 3. Create output zip stream (auto-number if existing)
let finalZipPath = path.join(distDir, `${version}.zip`);
let counter = 1;
while (fs.existsSync(finalZipPath)) {
  finalZipPath = path.join(distDir, `${version}-${counter}.zip`);
  counter++;
}

const output = fs.createWriteStream(finalZipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(
    `✅ Created ${path.basename(finalZipPath)} in dist/ (${archive.pointer()} total bytes)`,
  );
});
archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// 4. Add only the allowed folders/files
const includeItems = [
  'lib',
  '_locales',
  'popup.js',
  'popup.html',
  'popup.css',
  'manifest.json',
  'icon128.png',
  'icon48.png',
  'icon32.png',
  'icon16.png',
  'content.js',
  'background.js',
];

includeItems.forEach((item) => {
  const itemPath = path.join(__dirname, item);
  if (fs.existsSync(itemPath)) {
    const stats = fs.statSync(itemPath);
    if (stats.isDirectory()) {
      archive.directory(itemPath, item); // preserve folder name
    } else {
      archive.file(itemPath, { name: item });
    }
  } else {
    console.warn(`⚠️ Skipping missing: ${item}`);
  }
});

// 5. Finalize zip
archive.finalize();
