import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builderPath = path.join(repoRoot, 'scripts', 'build-zip.js');
const extensionPath = path.join(repoRoot, 'extension');
const builderSource = fs.readFileSync(builderPath, 'utf8');
const includeBlock = builderSource.match(/const includeItems = \[([\s\S]*?)\n\];/);
assert.ok(includeBlock, 'could not find the builder includeItems list');
const includeItems = [...includeBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
assert.ok(includeItems.length > 0, 'builder includeItems list is empty');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cgcsp-build-zip-fixture-'));

function createRepoCopy(name) {
  const tempRepo = path.join(root, name);
  const scriptsDir = path.join(tempRepo, 'scripts');
  const tempExtension = path.join(tempRepo, 'extension');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(tempExtension, { recursive: true });
  fs.copyFileSync(builderPath, path.join(scriptsDir, 'build-zip.js'));

  for (const item of includeItems) {
    const sourcePath = path.join(extensionPath, item);
    const sourceStats = fs.statSync(sourcePath);
    const tempPath = path.join(tempExtension, item);
    if (sourceStats.isDirectory()) {
      fs.mkdirSync(tempPath, { recursive: true });
      fs.writeFileSync(path.join(tempPath, 'fixture.txt'), `fixture for ${item}`);
      if (item === '_locales') {
        const defaultLocaleDir = path.join(tempPath, 'en');
        fs.mkdirSync(defaultLocaleDir, { recursive: true });
        fs.writeFileSync(
          path.join(defaultLocaleDir, 'messages.json'),
          '{"app_name":{"message":"ZIP fixture"}}',
        );
      }
    } else {
      fs.mkdirSync(path.dirname(tempPath), { recursive: true });
      const contents =
        item === 'manifest.json'
          ? JSON.stringify({
              manifest_version: 3,
              name: 'ZIP fixture',
              default_locale: 'en',
              version: 'fixture-1.2.3',
            })
          : `fixture for ${item}`;
      fs.writeFileSync(tempPath, contents);
    }
  }

  fs.mkdirSync(path.join(tempExtension, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(tempExtension, 'lib', 'DevScrapeWide.js'), 'dev-only fixture');
  fs.writeFileSync(path.join(tempExtension, 'lib', 'DevScrapeNarrow.js'), 'dev-only fixture');
  fs.mkdirSync(path.join(tempExtension, 'shared'), { recursive: true });
  fs.writeFileSync(
    path.join(tempExtension, 'shared', 'shortcut-action-metadata.js'),
    'dev-only fixture',
  );
  fs.mkdirSync(path.join(tempExtension, 'vendor', 'aptabase-browser'), { recursive: true });
  fs.writeFileSync(
    path.join(tempExtension, 'vendor', 'aptabase-browser', 'fixture.js'),
    'dev-only fixture',
  );

  return tempRepo;
}

function runBuilder(tempRepo) {
  const nodePath = path.join(repoRoot, 'node_modules');
  const env = {
    ...process.env,
    NODE_PATH: [nodePath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
  };
  return spawnSync(process.execPath, ['scripts/build-zip.js'], {
    cwd: tempRepo,
    encoding: 'utf8',
    env,
    timeout: 120_000,
  });
}

function readZipEntries(zipPath) {
  const zip = fs.readFileSync(zipPath);
  const minEocdOffset = Math.max(0, zip.length - 65_557);
  let eocdOffset = -1;
  for (let offset = zip.length - 22; offset >= minEocdOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  assert.notEqual(eocdOffset, -1, 'archive has no ZIP end-of-central-directory record');

  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  let offset = zip.readUInt32LE(eocdOffset + 16);
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50, 'invalid ZIP central directory entry');
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    entries.push(zip.toString('utf8', offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

try {
  const missingRepo = createRepoCopy('missing-input');
  const missingItem = 'popup.html';
  assert.ok(includeItems.includes(missingItem), `${missingItem} is not a configured include item`);
  fs.unlinkSync(path.join(missingRepo, 'extension', missingItem));

  const missingResult = runBuilder(missingRepo);
  assert.notEqual(missingResult.status, 0, 'builder succeeded with a required input missing');
  assert.match(
    `${missingResult.stdout}${missingResult.stderr}`,
    /Missing required input\(s\): popup\.html/,
  );
  assert.equal(
    fs.existsSync(path.join(missingRepo, 'dist')),
    false,
    'failure created the dist directory',
  );
  console.log(
    `Missing-input control: exit ${missingResult.status}; ${missingItem} rejected before dist/archive creation`,
  );

  const missingLocaleRepo = createRepoCopy('missing-default-locale-catalog');
  const defaultLocaleMessagesPath = path.join(
    missingLocaleRepo,
    'extension',
    '_locales',
    'en',
    'messages.json',
  );
  fs.unlinkSync(defaultLocaleMessagesPath);

  const missingLocaleResult = runBuilder(missingLocaleRepo);
  assert.notEqual(
    missingLocaleResult.status,
    0,
    'builder succeeded with the default-locale catalog missing',
  );
  assert.match(
    `${missingLocaleResult.stdout}${missingLocaleResult.stderr}`,
    /Missing required input\(s\): _locales\/en\/messages\.json/,
  );
  assert.equal(
    fs.existsSync(path.join(missingLocaleRepo, 'dist')),
    false,
    'default-locale catalog failure created the dist directory',
  );
  console.log(
    `Missing-default-locale control: exit ${missingLocaleResult.status}; _locales/en/messages.json rejected before dist/archive creation`,
  );

  const completeRepo = createRepoCopy('complete-inputs');
  const completeResult = runBuilder(completeRepo);
  assert.equal(
    completeResult.status,
    0,
    `builder failed with complete inputs:\n${completeResult.stderr}`,
  );
  const archivePath = path.join(completeRepo, 'dist', 'fixture-1.2.3.zip');
  assert.ok(fs.existsSync(archivePath), 'builder did not create the expected archive');
  const entries = new Set(readZipEntries(archivePath));
  assert.ok(
    entries.has('_locales/en/messages.json'),
    'archive omitted the manifest default-locale catalog',
  );
  for (const item of includeItems) {
    const sourcePath = path.join(extensionPath, item);
    const expectedArchivePath = fs.statSync(sourcePath).isDirectory()
      ? path.posix.join(item, 'fixture.txt')
      : item;
    assert.ok(
      entries.has(expectedArchivePath),
      `archive omitted configured include item ${item} (expected ${expectedArchivePath})`,
    );
  }
  for (const excludedAsset of [
    'lib/DevScrapeWide.js',
    'lib/DevScrapeNarrow.js',
    'shared/shortcut-action-metadata.js',
    'vendor/aptabase-browser/fixture.js',
  ]) {
    assert.ok(!entries.has(excludedAsset), `archive included dev-only asset ${excludedAsset}`);
  }
  console.log(
    `Complete-input control: exit ${completeResult.status}; runtime files included; dev-only assets excluded (${entries.size} entries)`,
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
