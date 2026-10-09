const assert = require('node:assert/strict');
// Child arguments are observed through the fixture's spawn guard, never a real browser.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');

test(
  'default collection prepares states without opting into activation',
  { skip: process.platform !== 'win32' },
  (t) => {
    for (const probeShortcuts of [false, true]) {
      const fixture = createFixture(t);
      const result = runRunner(fixture, probeShortcuts ? ['--probe-shortcuts'] : [], {
        CI: '',
        CURRENT_PAGE_RUNNER_SCENARIO: 'capture-receipt',
      });
      assert.equal(result.status, 2);
      const args = JSON.parse(fs.readFileSync(`${fixture.spawnLogPath}.args.json`, 'utf8'));
      assert.equal(args.includes('--prepare-capture-only'), !probeShortcuts);
      assert.equal(args.includes('--probe-shortcuts'), probeShortcuts);
      const invocationIdArg = args.indexOf('--current-page-parent-invocation-id');
      assert.notEqual(invocationIdArg, -1);
      assert.match(args[invocationIdArg + 1], /^[0-9a-f-]{36}$/);
    }
  },
);
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
  capabilities: path.join(
    repositoryRoot,
    'tests',
    'playwright',
    'lib',
    'shortcut-capabilities.mjs',
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
  if (kind === 'browser-engine') {
    fs.writeFileSync(process.env.CURRENT_PAGE_RUNNER_SPAWN_LOG + '.args.json', JSON.stringify(args));
  }
  return originalSpawn(
    process.execPath,
    [process.env.CURRENT_PAGE_RUNNER_SENTINEL, kind, ...(Array.isArray(args) ? args : [])],
    options,
  );
};

syncBuiltinESMExports();
`;

const sentinelSource = String.raw`
const fs = require('node:fs');
const path = require('node:path');
fs.appendFileSync(process.env.CURRENT_PAGE_RUNNER_SENTINEL_LOG, process.argv[2] + '\n');
const scenario = process.env.CURRENT_PAGE_RUNNER_SCENARIO;
const childArgs = process.argv.slice(3);
const invocationIdIndex = childArgs.indexOf('--current-page-parent-invocation-id');
const parentInvocationId = invocationIdIndex === -1 ? '' : childArgs[invocationIdIndex + 1];
const resultPrefix = 'CGCSP_CURRENT_PAGE_RESULT_V1 ';
const emitResult = (folder, overrides = {}) => {
  console.log(
    resultPrefix +
      JSON.stringify({
        schemaVersion: 1,
        parentInvocationId,
        runFolder: folder,
        reportPath: path.join(folder, 'check-report.json'),
        ...overrides,
      }),
  );
};
if (
  scenario === 'capture-receipt' ||
  scenario === 'capture-passing-nonzero' ||
  scenario === 'capture-no-folder' ||
  scenario === 'capture-no-result' ||
  scenario === 'capture-malformed-result' ||
  scenario === 'capture-wrong-invocation' ||
  scenario === 'capture-outside-repo' ||
  scenario === 'capture-outside-capture-root' ||
  scenario === 'capture-report-mismatch' ||
  scenario === 'capture-duplicate-result'
) {
  if (process.argv[2] === 'browser-engine' && scenario !== 'capture-no-folder') {
    const folder = path.join(process.cwd(), '_temp-files', 'inspector-captures', 'fresh-synthetic-run');
    fs.mkdirSync(folder, { recursive: true });
    if (scenario === 'capture-passing-nonzero') {
      const timestamp = new Date().toISOString();
      const folderName = path.basename(folder);
      const fixtureUrl = 'https://chatgpt.com/c/synthetic-current-page-pass';
      fs.writeFileSync(
        path.join(folder, 'check-report.json'),
        JSON.stringify({
          schemaVersion: 3,
          generatedAt: timestamp,
          fixtureUrl,
          folderName,
          folderPath: folder,
          runManifest: {
            schemaVersion: 1,
            runKind: 'devscrapewide',
            folderName,
            fixtureUrl,
            pageInfo: { url: fixtureUrl, fixtureUrl, fixtureOk: true, title: 'Synthetic fixture' },
            startedAt: timestamp,
            completedAt: timestamp,
            capturedCount: 1,
            failedCount: 0,
            deferredCount: 0,
            artifacts: [{ filename: 'captured.txt', status: 'captured' }],
          },
          targetRows: [
            {
              targetId: 'synthetic-target',
              identifier: 'syntheticTarget',
              status: 'pass',
              expectedFiles: ['captured.txt'],
              matchedExpectedFiles: ['captured.txt'],
              missingExpectedFiles: [],
              usedByActionIds: ['synthetic-shortcut'],
            },
          ],
          shortcutRows: [
            {
              actionId: 'synthetic-shortcut',
              validationMode: 'scrape-targets',
              targetIds: ['synthetic-target'],
              activationProbeSafe: true,
              activationProbeMode: 'opens-target',
              status: 'pass',
            },
          ],
          liveProbeRows: [
            { actionId: 'synthetic-shortcut', probeMode: 'opens-target', status: 'pass' },
          ],
          missingArtifacts: [],
          missingExpectedFiles: [],
          inventoryIssues: [],
          summary: {
            liveProbes: {
              runStatus: 'completed',
              total: 1,
              executable: 1,
              passed: 1,
              failed: 0,
              skipped: 0,
              environmentFailed: 0,
              manual: 0,
              notApplicable: 0,
              notLiveProbed: 0,
              coverageGaps: 0,
              fixedTotal: 0,
              fixedPassed: 0,
              fixedCoverageGaps: 0,
            },
          },
        }),
      );
    } else {
      fs.writeFileSync(
        path.join(folder, 'check-report.json'),
        JSON.stringify({ schemaVersion: 0 }),
      );
    }
    console.log('Run folder: ' + folder);
    if (scenario === 'capture-malformed-result') {
      console.log(resultPrefix + '{malformed');
    } else if (scenario === 'capture-wrong-invocation') {
      emitResult(folder, { parentInvocationId: '00000000-0000-4000-8000-000000000000' });
    } else if (scenario === 'capture-outside-repo') {
      emitResult(path.join(path.dirname(process.cwd()), 'outside-run'));
    } else if (scenario === 'capture-outside-capture-root') {
      emitResult(path.join(process.cwd(), 'test-results', 'outside-run'));
    } else if (scenario === 'capture-report-mismatch') {
      emitResult(folder, { reportPath: path.join(folder, 'other-report.json') });
    } else if (scenario === 'capture-duplicate-result') {
      emitResult(folder);
      emitResult(folder);
    } else if (scenario !== 'capture-no-result') {
      emitResult(folder);
    }
  }
  process.exitCode =
    scenario === 'capture-passing-nonzero' && process.argv[2] === 'browser-engine' ? 37 : 0;
} else {
  process.exitCode = 91;
}
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
  const capabilitiesPath = path.join(
    root,
    'tests',
    'playwright',
    'lib',
    'shortcut-capabilities.mjs',
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
  fs.copyFileSync(sourceFiles.capabilities, capabilitiesPath);
  fs.writeFileSync(
    path.join(root, 'scripts', 'live-snapshot.mjs'),
    'export async function computeSourceFingerprint() { return "a".repeat(64); }\n',
    'utf8',
  );
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

function runRunner(fixture, args = [], environment = {}) {
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
        ...environment,
      },
    },
  );
}

function seedStaleReports(fixture) {
  fs.mkdirSync(fixture.outputDirectory, { recursive: true });
  for (const file of ['report.json', 'report.md', 'report.html'])
    fs.writeFileSync(path.join(fixture.outputDirectory, file), 'stale-live-report-marker', 'utf8');
  fs.writeFileSync(
    path.join(fixture.outputDirectory, 'receipt.json'),
    'stale-live-receipt',
    'utf8',
  );
  const snapshotDirectory = path.join(fixture.root, 'test-results', 'live-snapshot');
  fs.mkdirSync(snapshotDirectory, { recursive: true });
  for (const name of ['candidate.json', 'confirmation.json'])
    fs.writeFileSync(path.join(snapshotDirectory, name), 'stale-publish-evidence', 'utf8');
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
    const receipt = JSON.parse(
      fs.readFileSync(path.join(fixture.outputDirectory, 'receipt.json'), 'utf8'),
    );
    assert.equal(receipt.schemaVersion, 1);
    assert.match(receipt.invocationId, /^[0-9a-f-]{36}$/);
    for (const key of ['invocationId', 'startedAt', 'completedAt', 'sourceFingerprint'])
      assert.equal(receipt[key], report[key]);
    assert.ok(Date.parse(receipt.startedAt) <= Date.parse(receipt.completedAt));
    assert.equal(receipt.runFolder, null);
    assert.equal(receipt.captureExitCode, null);
    assert.equal(receipt.sourceFingerprint, null);
    assert.equal(receipt.validationReport, reportJson);
    assert.deepEqual(receipt.currentPageValidation, report.currentPageValidation);
    for (const name of ['candidate.json', 'confirmation.json'])
      assert.equal(
        fs.existsSync(path.join(fixture.root, 'test-results', 'live-snapshot', name)),
        false,
        'A failed new collection must invalidate older publication readiness.',
      );
  },
);

test(
  'complete passing capture evidence passes despite a nonzero capture-process exit code',
  { skip: process.platform !== 'win32' && 'The authenticated runner is Windows-local.' },
  (t) => {
    const fixture = createFixture(t);
    const result = runRunner(fixture, ['--probe-shortcuts'], {
      CI: '',
      CURRENT_PAGE_RUNNER_SCENARIO: 'capture-passing-nonzero',
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Current ChatGPT page: PASSED/);
    assert.match(result.stdout, /Run folder:/);
    assert.doesNotMatch(result.stdout, /CGCSP_CURRENT_PAGE_RESULT_V1/);
    const receipt = JSON.parse(
      fs.readFileSync(path.join(fixture.outputDirectory, 'receipt.json'), 'utf8'),
    );
    assert.equal(receipt.captureExitCode, 37);
    const args = JSON.parse(fs.readFileSync(`${fixture.spawnLogPath}.args.json`, 'utf8'));
    const invocationIdArg = args.indexOf('--current-page-parent-invocation-id');
    assert.equal(args[invocationIdArg + 1], receipt.invocationId);
    assert.equal(receipt.currentPageValidation.status, 'passed');
    assert.equal(receipt.currentPageValidation.targetSummary.status, 'passed');
    assert.equal(receipt.currentPageValidation.probeSummary.status, 'passed');
  },
);

test(
  'structured capture result protocol rejects missing, malformed, mismatched, duplicate and out-of-scope results',
  { skip: process.platform !== 'win32' && 'The authenticated runner is Windows-local.' },
  (t) => {
    const scenarios = [
      ['capture-no-result', /produced 0 structured capture results/],
      ['capture-malformed-result', /structured capture result is malformed/],
      ['capture-wrong-invocation', /invalid or belongs to another invocation/],
      ['capture-outside-repo', /outside the expected local capture directory/],
      ['capture-outside-capture-root', /outside the expected local capture directory/],
      ['capture-report-mismatch', /does not name its exact capture report/],
      ['capture-duplicate-result', /produced 2 structured capture results/],
    ];

    for (const [scenario, reason] of scenarios) {
      const fixture = createFixture(t);
      const result = runRunner(fixture, ['--probe-shortcuts'], {
        CI: '',
        CURRENT_PAGE_RUNNER_SCENARIO: scenario,
      });
      assert.equal(result.status, 2, `${scenario}: ${result.stdout}\n${result.stderr}`);
      const receipt = JSON.parse(
        fs.readFileSync(path.join(fixture.outputDirectory, 'receipt.json'), 'utf8'),
      );
      assert.equal(receipt.runFolder, null, `${scenario} must not select a capture folder`);
      assert.equal(receipt.captureExitCode, 0, `${scenario} must preserve the child exit code`);
      assert.match(receipt.currentPageValidation.reason, reason, scenario);
    }
  },
);

test(
  'legacy Run folder text does not substitute for a structured result',
  { skip: process.platform !== 'win32' && 'The authenticated runner is Windows-local.' },
  (t) => {
    const fixture = createFixture(t);
    const result = runRunner(fixture, [], {
      CI: '',
      CURRENT_PAGE_RUNNER_SCENARIO: 'capture-no-result',
    });
    assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Run folder:/);
    const receipt = JSON.parse(
      fs.readFileSync(path.join(fixture.outputDirectory, 'receipt.json'), 'utf8'),
    );
    assert.equal(receipt.runFolder, null);
    assert.equal(receipt.captureExitCode, 0);
    assert.match(receipt.currentPageValidation.reason, /produced 0 structured capture results/);
  },
);

test('a redirected output parent is rejected before outside cleanup or writes', (t) => {
  const fixture = createFixture(t);
  const outside = path.join(fixture.temporaryRoot, 'outside-output');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'preserved', 'utf8');
  fs.symlinkSync(
    outside,
    path.join(fixture.root, 'test-results'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const result = runRunner(fixture);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assertNoChildProcesses(fixture);
  assert.match(result.stderr, /repository-owned local directories/);
  assert.deepEqual(fs.readdirSync(outside), ['sentinel.txt']);
  assert.equal(fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8'), 'preserved');
});

test(
  'invalid arguments are rejected before profile preflight or browser capture',
  { skip: !classifierAvailable && 'The current-page classifier is not available yet.' },
  (t) => {
    const fixture = createFixture(t);
    seedStaleReports(fixture);
    const latestPath = path.join(
      fixture.root,
      'tests',
      'playwright',
      'live-snapshot',
      'latest.json',
    );
    fs.mkdirSync(path.dirname(latestPath), { recursive: true });
    fs.writeFileSync(latestPath, 'previous-public-snapshot', 'utf8');

    const result = runRunner(fixture, ['--unexpected']);
    assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
    assertNoChildProcesses(fixture);

    const report = JSON.parse(
      fs.readFileSync(path.join(fixture.outputDirectory, 'report.json'), 'utf8'),
    );
    assert.equal(report.currentPageValidation.status, 'unverified');
    assert.match(report.currentPageValidation.reason, /Use npm run check:current-page/);
    assert.equal(fs.readFileSync(latestPath, 'utf8'), 'previous-public-snapshot');
    for (const name of ['candidate.json', 'confirmation.json'])
      assert.equal(
        fs.existsSync(path.join(fixture.root, 'test-results', 'live-snapshot', name)),
        false,
      );
  },
);
