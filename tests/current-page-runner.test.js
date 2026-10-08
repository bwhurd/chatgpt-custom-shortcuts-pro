const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const temporaryPrefix = 'cgcsp-current-page-runner-';
const sourceFiles = {
  runner: path.join(repositoryRoot, 'scripts', 'run-current-page-check.mjs'),
  reportHelper: path.join(
    repositoryRoot,
    'tests',
    'playwright',
    'lib',
    'shortcut-fast-visual-report.mjs',
  ),
  classifier: path.join(
    repositoryRoot,
    'tests',
    'playwright',
    'lib',
    'current-page-validation.mjs',
  ),
};
const classifierAvailable = fs.existsSync(sourceFiles.classifier);

const spawnGuardSource = String.raw`
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { syncBuiltinESMExports } = require('node:module');
const originalSpawn = childProcess.spawn;

childProcess.spawn = function (command, args, options) {
  const commandText = Array.isArray(args) ? args.map(String).join(' ') : '';
  const commandName = path.basename(String(command)).toLowerCase();
  const kind = commandText.includes('devscrape-wide.mjs')
    ? 'browser-engine'
    : commandName === 'powershell.exe'
      ? 'profile-preflight'
      : 'unexpected-child-process';
  fs.appendFileSync(process.env.CURRENT_PAGE_RUNNER_SPAWN_LOG, kind + '\n');
  return originalSpawn(
    process.execPath,
    [process.env.CURRENT_PAGE_RUNNER_SENTINEL, kind],
    options,
  );
};

syncBuiltinESMExports();
`;

const sentinelSource = String.raw`
const fs = require('node:fs');
fs.appendFileSync(process.env.CURRENT_PAGE_RUNNER_SENTINEL_LOG, process.argv[2] + '\n');
process.exitCode = 91;
`;

function assertChildPath(parent, child) {
  const relative = path.relative(parent, child);
  assert.ok(
    relative && !relative.startsWith('..') && !path.isAbsolute(relative),
    `Expected ${child} to be a child of ${parent}`,
  );
}

function cleanupTemporaryRoot(temporaryRoot) {
  if (!fs.existsSync(temporaryRoot)) return;
  const temporaryParent = fs.realpathSync(os.tmpdir());
  const resolvedRoot = fs.realpathSync(temporaryRoot);
  assertChildPath(temporaryParent, resolvedRoot);
  assert.ok(
    path.basename(resolvedRoot).startsWith(temporaryPrefix),
    'Refusing to remove a temporary directory without the expected test prefix.',
  );
  fs.rmSync(resolvedRoot, { recursive: true, force: true });
}

function createFixture(t) {
  const temporaryParent = fs.realpathSync(os.tmpdir());
  const temporaryRoot = fs.mkdtempSync(path.join(temporaryParent, temporaryPrefix));
  assertChildPath(temporaryParent, temporaryRoot);
  t.after(() => cleanupTemporaryRoot(temporaryRoot));

  const root = path.join(temporaryRoot, 'repo');
  const runnerPath = path.join(root, 'scripts', 'run-current-page-check.mjs');
  const helperPath = path.join(
    root,
    'tests',
    'playwright',
    'lib',
    'shortcut-fast-visual-report.mjs',
  );
  const classifierPath = path.join(
    root,
    'tests',
    'playwright',
    'lib',
    'current-page-validation.mjs',
  );
  const outputDirectory = path.join(root, 'test-results', 'shortcuts-live');
  const spawnGuardPath = path.join(temporaryRoot, 'spawn-guard.cjs');
  const sentinelPath = path.join(temporaryRoot, 'fake-engine-sentinel.cjs');
  const spawnLogPath = path.join(temporaryRoot, 'spawn-attempts.log');
  const sentinelLogPath = path.join(temporaryRoot, 'sentinel-launches.log');

  fs.mkdirSync(path.dirname(runnerPath), { recursive: true });
  fs.mkdirSync(path.dirname(helperPath), { recursive: true });
  fs.copyFileSync(sourceFiles.runner, runnerPath);
  fs.copyFileSync(sourceFiles.reportHelper, helperPath);
  fs.copyFileSync(sourceFiles.classifier, classifierPath);
  fs.writeFileSync(spawnGuardPath, spawnGuardSource, 'utf8');
  fs.writeFileSync(sentinelPath, sentinelSource, 'utf8');

  return {
    root,
    temporaryRoot,
    runnerPath,
    outputDirectory,
    spawnGuardPath,
    sentinelPath,
    spawnLogPath,
    sentinelLogPath,
  };
}

function runRunner(fixture, args = []) {
  return spawnSync(
    process.execPath,
    ['--require', fixture.spawnGuardPath, fixture.runnerPath, ...args],
    {
      cwd: fixture.root,
      encoding: 'utf8',
      timeout: 20_000,
      env: {
        ...process.env,
        CI: 'true',
        NODE_OPTIONS: '',
        LOCALAPPDATA: path.join(fixture.temporaryRoot, 'local-app-data'),
        CURRENT_PAGE_RUNNER_SPAWN_LOG: fixture.spawnLogPath,
        CURRENT_PAGE_RUNNER_SENTINEL: fixture.sentinelPath,
        CURRENT_PAGE_RUNNER_SENTINEL_LOG: fixture.sentinelLogPath,
      },
    },
  );
}

function seedStaleReports(fixture) {
  fs.mkdirSync(fixture.outputDirectory, { recursive: true });
  for (const file of ['report.json', 'report.md', 'report.html'])
    fs.writeFileSync(path.join(fixture.outputDirectory, file), 'stale-live-report-marker', 'utf8');
}

function assertNoChildProcesses(fixture) {
  assert.equal(
    fs.existsSync(fixture.spawnLogPath),
    false,
    'The CI guard should stop before profile preflight or browser capture is spawned.',
  );
  assert.equal(
    fs.existsSync(fixture.sentinelLogPath),
    false,
    'The fake engine sentinel must not be launched.',
  );
}

test(
  'CI replaces stale live reports with fresh unverified output without launching preflight or browser capture',
  { skip: !classifierAvailable && 'The current-page classifier is not available yet.' },
  (t) => {
    const fixture = createFixture(t);
    seedStaleReports(fixture);

    const result = runRunner(fixture);
    assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Current ChatGPT page: UNVERIFIED/);
    assertNoChildProcesses(fixture);

    const reportJson = path.join(fixture.outputDirectory, 'report.json');
    const reportMarkdown = path.join(fixture.outputDirectory, 'report.md');
    const reportHtml = path.join(fixture.outputDirectory, 'report.html');
    const report = JSON.parse(fs.readFileSync(reportJson, 'utf8'));
    assert.equal(report.scope, 'current-page');
    assert.equal(report.currentPageValidation.status, 'unverified');
    assert.match(report.currentPageValidation.reason, /local Windows Chrome profile/);
    for (const reportPath of [reportJson, reportMarkdown, reportHtml]) {
      assert.ok(fs.existsSync(reportPath), `Expected fresh report ${reportPath}`);
      assert.doesNotMatch(fs.readFileSync(reportPath, 'utf8'), /stale-live-report-marker/);
    }
  },
);

test(
  'invalid arguments are rejected before profile preflight or browser capture',
  { skip: !classifierAvailable && 'The current-page classifier is not available yet.' },
  (t) => {
    const fixture = createFixture(t);

    const result = runRunner(fixture, ['--unexpected']);
    assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
    assertNoChildProcesses(fixture);

    const report = JSON.parse(
      fs.readFileSync(path.join(fixture.outputDirectory, 'report.json'), 'utf8'),
    );
    assert.equal(report.currentPageValidation.status, 'unverified');
    assert.match(report.currentPageValidation.reason, /Use npm run check:current-page/);
  },
);
