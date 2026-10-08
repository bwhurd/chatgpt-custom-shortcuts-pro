const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const runnerSource = path.join(repositoryRoot, 'scripts', 'run-checks.js');
const reportHelperSource = path.join(
  repositoryRoot,
  'tests',
  'playwright',
  'lib',
  'shortcut-fast-visual-report.mjs',
);
const dependencyVersions = {
  '@biomejs/biome': '2.3.2',
  playwright: '1.58.2',
  acorn: '8.18.0',
  cheerio: '1.0.0',
};

const fakeNpmSource = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const args = process.argv.slice(2);
const stage = args[0] === 'ci' ? 'ci' : args[1] || 'unknown';
const entry = { args, stage };
fs.appendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify(entry) + '\n');

function installDependencies() {
  const root = process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const name of Object.keys(dependencies)) {
    const version = lock.packages['node_modules/' + name]?.version;
    if (!version) throw new Error('Missing fake locked version for ' + name);
    const packagePath = path.join(root, 'node_modules', ...name.split('/'), 'package.json');
    fs.mkdirSync(path.dirname(packagePath), { recursive: true });
    fs.writeFileSync(packagePath, JSON.stringify({ name, version }) + '\n');
  }
}

async function writeSyntheticReport() {
  const helperPath = path.join(
    process.cwd(),
    'tests',
    'playwright',
    'lib',
    'shortcut-fast-visual-report.mjs',
  );
  const { writeFastVisualReport } = await import(pathToFileURL(helperPath).href);
  const actionId = 'shortcutKeySyntheticFixture';
  await writeFastVisualReport({
    reportMarker: process.env.FAKE_REPORT_MARKER || 'synthetic-fresh-report',
    rows: [
      {
        rowId: 'global:' + actionId,
        actionId,
        label: 'Synthetic fresh shortcut result',
        admitted: true,
        status: 'pass',
      },
    ],
    observations: [{ actionId, attempted: true, status: 'pass', chord: 'Alt+KeyQ' }],
  });
}

async function main() {
  if (process.env.FAKE_NPM_FAIL_STAGE === stage) {
    process.exitCode = 23;
    return;
  }
  if (stage === 'ci') installDependencies();
  if (stage === 'test:shortcuts:fast') await writeSyntheticReport();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
`;

function createFixture(t) {
  const temporaryParent = fs.realpathSync(os.tmpdir());
  const temporaryRoot = fs.mkdtempSync(path.join(temporaryParent, 'cgcsp-run-checks-'));
  const relativeTemporaryRoot = path.relative(temporaryParent, temporaryRoot);
  assert.ok(
    relativeTemporaryRoot &&
      !relativeTemporaryRoot.startsWith('..') &&
      !path.isAbsolute(relativeTemporaryRoot),
    'the fixture must be created under the OS temporary directory',
  );
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));

  const root = path.join(temporaryRoot, 'repo');
  const npmCli = path.join(temporaryRoot, 'fake-npm.js');
  const logPath = path.join(temporaryRoot, 'fake-npm.jsonl');
  fs.mkdirSync(root, { recursive: true });

  const manifest = {
    name: 'temporary-run-checks-fixture',
    version: '1.0.0',
    devDependencies: { ...dependencyVersions },
  };
  writeJson(path.join(root, 'package.json'), manifest);
  writeLock(root, manifest);

  const isolatedRunner = path.join(root, 'scripts', 'run-checks.js');
  const isolatedReportHelper = path.join(
    root,
    'tests',
    'playwright',
    'lib',
    'shortcut-fast-visual-report.mjs',
  );
  fs.mkdirSync(path.dirname(isolatedRunner), { recursive: true });
  fs.mkdirSync(path.dirname(isolatedReportHelper), { recursive: true });
  fs.copyFileSync(runnerSource, isolatedRunner);
  fs.copyFileSync(reportHelperSource, isolatedReportHelper);
  fs.writeFileSync(npmCli, fakeNpmSource, 'utf8');

  const outputDirectory = path.join(root, 'test-results', 'shortcuts-fast');
  return {
    root,
    npmCli,
    logPath,
    outputDirectory,
    manifest,
    lockPath: path.join(root, 'package-lock.json'),
    runnerPath: isolatedRunner,
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeLock(root, manifest, { integrity = 'sha512-synthetic' } = {}) {
  const packages = {
    '': {
      name: manifest.name,
      version: manifest.version,
      devDependencies: manifest.devDependencies,
    },
  };
  for (const [name, version] of Object.entries(manifest.devDependencies || {})) {
    packages[`node_modules/${name}`] = { version, integrity: `${integrity}-${name}` };
  }
  writeJson(path.join(root, 'package-lock.json'), {
    name: manifest.name,
    version: manifest.version,
    lockfileVersion: 3,
    packages,
  });
}

function runRunner(fixture, environment = {}) {
  return spawnSync(process.execPath, [fixture.runnerPath], {
    cwd: fixture.root,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      npm_execpath: fixture.npmCli,
      FAKE_NPM_LOG: fixture.logPath,
      FAKE_NPM_FAIL_STAGE: '',
      FAKE_REPORT_MARKER: 'synthetic-fresh-report',
      GITHUB_STEP_SUMMARY: '',
      ...environment,
    },
  });
}

function readCalls(fixture) {
  if (!fs.existsSync(fixture.logPath)) return [];
  return fs
    .readFileSync(fixture.logPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function reportPaths(fixture) {
  return ['report.json', 'report.md', 'report.html'].map((name) =>
    path.join(fixture.outputDirectory, name),
  );
}

function readReport(fixture) {
  return JSON.parse(fs.readFileSync(path.join(fixture.outputDirectory, 'report.json'), 'utf8'));
}

function seedStaleReport(fixture) {
  fs.mkdirSync(fixture.outputDirectory, { recursive: true });
  for (const reportPath of reportPaths(fixture))
    fs.writeFileSync(reportPath, 'stale-report-marker', 'utf8');
}

function callStages(fixture) {
  return readCalls(fixture).map((call) => call.stage);
}

function countStage(fixture, stage) {
  return callStages(fixture).filter((candidate) => candidate === stage).length;
}

test('installs locked dependencies once, reuses the stamp, and refreshes after lock changes', (t) => {
  const fixture = createFixture(t);

  const first = runRunner(fixture, { FAKE_REPORT_MARKER: 'first-report' });
  assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
  assert.equal(countStage(fixture, 'ci'), 1);
  assert.ok(fs.existsSync(path.join(fixture.root, 'node_modules', '.cgcsp-checks-lock')));
  assert.equal(readReport(fixture).reportMarker, 'first-report');

  const second = runRunner(fixture, { FAKE_REPORT_MARKER: 'second-report' });
  assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
  assert.equal(countStage(fixture, 'ci'), 1, 'unchanged manifest and lock should reuse npm ci');
  assert.equal(readReport(fixture).reportMarker, 'second-report');

  const lock = JSON.parse(fs.readFileSync(fixture.lockPath, 'utf8'));
  lock.packages['node_modules/acorn'].integrity = 'sha512-changed-with-versions-unchanged';
  writeJson(fixture.lockPath, lock);

  const third = runRunner(fixture, { FAKE_REPORT_MARKER: 'third-report' });
  assert.equal(third.status, 0, `${third.stdout}\n${third.stderr}`);
  assert.equal(countStage(fixture, 'ci'), 2, 'a changed lock should trigger npm ci');
  assert.equal(countStage(fixture, 'playwright:install'), 3);
  assert.equal(countStage(fixture, 'test:shortcuts:fast'), 3);
  assert.equal(readReport(fixture).reportMarker, 'third-report');
});

test('continues through the shortcut result and preserves failed checks in a fresh report', (t) => {
  const fixture = createFixture(t);
  seedStaleReport(fixture);

  const result = runRunner(fixture, {
    FAKE_NPM_FAIL_STAGE: 'check',
    FAKE_REPORT_MARKER: 'fresh-after-code-failure',
  });
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);

  const stages = callStages(fixture);
  const codeCheckIndex = stages.indexOf('check');
  const shortcutIndex = stages.indexOf('test:shortcuts:fast');
  assert.ok(codeCheckIndex >= 0 && shortcutIndex > codeCheckIndex, stages.join(', '));

  const report = readReport(fixture);
  assert.equal(report.reportMarker, 'fresh-after-code-failure');
  assert.equal(report.runStatus, 'FAIL');
  assert.equal(report.visualSummary.failedStages, 1);
  assert.equal(report.checkResults.find((check) => check.name === 'Code and text')?.status, 'fail');
  assert.ok(
    report.fixList.some(
      (item) => item.fixKind === 'failed-check-stage' && item.stageName === 'Code and text',
    ),
  );
  for (const reportPath of reportPaths(fixture)) {
    const contents = fs.readFileSync(reportPath, 'utf8');
    assert.ok(!contents.includes('stale-report-marker'), `${reportPath} retained stale output`);
  }
  assert.match(
    fs.readFileSync(path.join(fixture.outputDirectory, 'report.md'), 'utf8'),
    /Code and text/,
  );
  assert.match(
    fs.readFileSync(path.join(fixture.outputDirectory, 'report.html'), 'utf8'),
    /Code and text/,
  );
});

for (const setupFailure of [
  { stage: 'ci', label: 'dependency installation', expectedStages: ['ci'] },
  {
    stage: 'playwright:install',
    label: 'Chromium installation',
    expectedStages: ['ci', 'playwright:install'],
  },
]) {
  test(`blocks later checks and writes a blocked report after ${setupFailure.label} fails`, (t) => {
    const fixture = createFixture(t);
    seedStaleReport(fixture);

    const result = runRunner(fixture, { FAKE_NPM_FAIL_STAGE: setupFailure.stage });
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(callStages(fixture), setupFailure.expectedStages);

    const report = readReport(fixture);
    assert.equal(report.runStatus, 'FAIL');
    assert.equal(report.runScope.kind, 'blocked-startup');
    assert.equal(report.outcome.checks, 'No checks ran');
    assert.match(report.visualSummary.checks, /No keyboard checks recorded/);
    assert.equal(report.rows.length, 0);
    assert.ok(report.checkResults.some((check) => check.status === 'fail'));
    assert.ok(report.failures.some((failure) => failure.label === 'Startup / source preparation'));
    for (const reportPath of reportPaths(fixture)) {
      const contents = fs.readFileSync(reportPath, 'utf8');
      assert.ok(!contents.includes('stale-report-marker'), `${reportPath} retained stale output`);
    }
  });
}
