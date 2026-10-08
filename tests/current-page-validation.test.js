const assert = require('node:assert/strict');
const test = require('node:test');

const classifierModule = import('./playwright/lib/current-page-validation.mjs');
const invocation = {
  startedAt: '2026-10-07T18:00:00.000Z',
  completedAt: '2026-10-07T18:05:00.000Z',
  fixtureUrl: 'https://chatgpt.com/c/69ea4723-7070-83ea-a069-89aaa4e6f9a1',
  cdpEndpoint: 'http://127.0.0.1:9333',
  profileDirectory:
    'C:\\Users\\tester\\AppData\\Local\\Google\\Chrome\\User Data\\CodexCleanProfile',
};

function createReport() {
  const fixtureUrl = invocation.fixtureUrl;
  const folderName = '2026-10-07_18-00-01_devscrapewide_c-69ea4723';
  return {
    schemaVersion: 3,
    generatedAt: '2026-10-07T18:04:00.000Z',
    fixtureUrl,
    folderName,
    folderPath: `C:\\captures\\${folderName}`,
    runManifest: {
      schemaVersion: 1,
      runKind: 'devscrapewide',
      folderName,
      fixtureUrl,
      pageInfo: {
        url: fixtureUrl,
        fixtureUrl,
        fixtureOk: true,
        title: 'Conversation',
      },
      startedAt: '2026-10-07T18:00:01.000Z',
      completedAt: '2026-10-07T18:02:00.000Z',
      capturedCount: 1,
      failedCount: 0,
      deferredCount: 0,
      artifacts: [{ filename: '1a_fixture.txt', status: 'captured' }],
    },
    targetRows: [
      {
        targetId: 'model-switcher-button',
        identifier: 'modelSwitcherButton',
        status: 'pass',
        statusReason: 'Target matched an expected dump.',
        expectedFiles: ['2m_ModelSwitcher_Menu.txt'],
        matchedExpectedFiles: ['2m_ModelSwitcher_Menu.txt'],
        missingExpectedFiles: [],
        usedByActionIds: ['shortcutKeyToggleModelSelector'],
      },
    ],
    shortcutRows: [
      {
        actionId: 'shortcutKeyToggleModelSelector',
        validationMode: 'scrape-targets',
        targetIds: ['model-switcher-button'],
        activationProbeSafe: true,
        activationProbeMode: 'opens-target',
        status: 'pass',
      },
    ],
    liveProbeRows: [
      {
        actionId: 'shortcutKeyToggleModelSelector',
        probeMode: 'opens-target',
        status: 'pass',
        reason: '',
      },
    ],
    missingArtifacts: [],
    missingExpectedFiles: [],
    inventoryIssues: [],
    summary: {
      liveProbes: {
        runStatus: 'completed',
        total: 1,
        fixedTotal: 0,
        fixedPassed: 0,
        fixedCoverageGaps: 0,
        executable: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        environmentFailed: 0,
        manual: 0,
        notApplicable: 0,
        notLiveProbed: 0,
        coverageGaps: 0,
      },
    },
  };
}

test('absent evidence is unverified', async () => {
  const { classifyCurrentPageValidation } = await classifierModule;
  const result = classifyCurrentPageValidation(null, invocation);
  assert.equal(result.status, 'unverified');
  assert.match(result.reason, /No current-page check report/);
  assert.equal(result.failures.length, 0);
});

test('stale or future manifest evidence is unverified', async () => {
  const { classifyCurrentPageValidation } = await classifierModule;
  const stale = createReport();
  stale.runManifest.startedAt = '2026-10-07T17:50:00.000Z';
  assert.equal(classifyCurrentPageValidation(stale, invocation).status, 'unverified');

  const future = createReport();
  future.generatedAt = '2026-10-07T18:05:01.000Z';
  assert.equal(classifyCurrentPageValidation(future, invocation).status, 'unverified');
});

test('fixture identity mismatch is unverified', async () => {
  const { classifyCurrentPageValidation } = await classifierModule;
  const report = createReport();
  report.runManifest.pageInfo.url = 'https://chatgpt.com/c/a-different-conversation';
  const result = classifyCurrentPageValidation(report, invocation);
  assert.equal(result.status, 'unverified');
  assert.match(result.reason, /same loaded fixture/);
});

test('malformed or inconsistent report rows remain unverified', async () => {
  const { classifyCurrentPageValidation } = await classifierModule;
  const badSummary = createReport();
  badSummary.summary.liveProbes.passed = 0;
  assert.equal(classifyCurrentPageValidation(badSummary, invocation).status, 'unverified');

  const badTarget = createReport();
  badTarget.targetRows[0].matchedExpectedFiles = [];
  assert.equal(classifyCurrentPageValidation(badTarget, invocation).status, 'unverified');
});

test('a fresh complete target and probe report passes in the declared scope', async () => {
  const { classifyCurrentPageValidation } = await classifierModule;
  const result = classifyCurrentPageValidation(createReport(), invocation);
  assert.equal(result.status, 'passed');
  assert.equal(result.checkedAt, invocation.completedAt);
  assert.equal(result.pageUrl, invocation.fixtureUrl);
  assert.equal(result.targetSummary.status, 'passed');
  assert.equal(result.probeSummary.status, 'passed');
  assert.match(result.scopeLimitations[0].reason, /does not attest account identity/);
});

test('missing target presence evidence is partial', async () => {
  const { classifyCurrentPageValidation } = await classifierModule;
  const report = createReport();
  report.targetRows[0].status = 'no-scrape-coverage';
  report.targetRows[0].expectedFiles = [];
  report.targetRows[0].matchedExpectedFiles = [];
  const result = classifyCurrentPageValidation(report, invocation);
  assert.equal(result.status, 'partial');
  assert.equal(result.targetSummary.status, 'partial');
  assert.match(result.reason, /no scrape coverage/i);
});

test('an empty target inventory cannot pass', async () => {
  const { classifyCurrentPageValidation } = await classifierModule;
  const report = createReport();
  report.targetRows = [];
  const result = classifyCurrentPageValidation(report, invocation);
  assert.equal(result.status, 'partial');
  assert.equal(result.targetSummary.status, 'partial');
  assert.ok(result.scopeLimitations.some((item) => /no target rows/i.test(item.reason)));
});

test('actual target absence fails the validation', async () => {
  const { classifyCurrentPageValidation } = await classifierModule;
  const report = createReport();
  report.targetRows[0].status = 'fail';
  report.targetRows[0].statusReason = 'Target was not found in any expected scrape dump.';
  report.targetRows[0].matchedExpectedFiles = [];
  const result = classifyCurrentPageValidation(report, invocation);
  assert.equal(result.status, 'failed');
  assert.equal(result.failures[0].targetId, 'model-switcher-button');
  assert.equal(result.failures[0].actionId, 'shortcutKeyToggleModelSelector');
  assert.equal(result.failures[0].identifier, 'modelSwitcherButton');
});

test('missing expected capture keeps propagated shortcut failure partial', async () => {
  const { classifyCurrentPageValidation } = await classifierModule;
  const report = createReport();
  report.targetRows[0].status = 'fail';
  report.targetRows[0].statusReason = 'Expected dump files were missing: 2m_ModelSwitcher_Menu.txt';
  report.targetRows[0].matchedExpectedFiles = [];
  report.targetRows[0].missingExpectedFiles = ['2m_ModelSwitcher_Menu.txt'];
  report.shortcutRows[0].status = 'fail';
  report.shortcutRows[0].statusReason =
    'model-switcher-button: Expected dump files were missing: 2m_ModelSwitcher_Menu.txt';
  const result = classifyCurrentPageValidation(report, invocation);
  assert.equal(result.status, 'partial');
  assert.equal(result.targetSummary.status, 'partial');
  assert.equal(result.failures.length, 0);
  assert.ok(
    result.scopeLimitations.some((limitation) =>
      /missing expected dump files/i.test(limitation.reason),
    ),
  );
});

test('missing files and deferred artifacts are partial evidence', async () => {
  const { classifyCurrentPageValidation } = await classifierModule;
  const report = createReport();
  report.missingArtifacts.push({ filename: '1c_Topbar.txt', reason: 'Deferred by profile setup.' });
  report.runManifest.deferredCount = 1;
  report.runManifest.artifacts.push({ filename: '1c_Topbar.txt', status: 'deferred' });
  const result = classifyCurrentPageValidation(report, invocation);
  assert.equal(result.status, 'partial');
  assert.equal(result.failures.length, 0);
});

test('probe failures fail the validation', async () => {
  const { classifyCurrentPageValidation } = await classifierModule;
  const report = createReport();
  report.liveProbeRows[0].status = 'fail';
  report.liveProbeRows[0].reason = 'The shortcut did not open the model menu.';
  report.summary.liveProbes.passed = 0;
  report.summary.liveProbes.failed = 1;
  const result = classifyCurrentPageValidation(report, invocation);
  assert.equal(result.status, 'failed');
  assert.equal(result.failures[0].actionId, 'shortcutKeyToggleModelSelector');
});

test('a complete target-only run is partial overall with target proof passed', async () => {
  const { classifyCurrentPageValidation } = await classifierModule;
  const report = createReport();
  report.liveProbeRows = [];
  report.summary.liveProbes = {
    runStatus: 'not-run',
    total: 0,
    executable: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    environmentFailed: 0,
    manual: 0,
    notApplicable: 0,
    notLiveProbed: 0,
    coverageGaps: 0,
  };
  const result = classifyCurrentPageValidation(report, invocation);
  assert.equal(result.status, 'partial');
  assert.equal(result.targetSummary.status, 'passed');
  assert.equal(result.probeSummary.status, 'unverified');
  assert.match(result.probeSummary.reason, /not run/i);
});

test('manual-only and not-applicable actions are reported as explicit scope limits', async () => {
  const { classifyCurrentPageValidation } = await classifierModule;
  const report = createReport();
  report.targetRows.push({
    targetId: 'dictation-stop-button',
    status: 'no-scrape-coverage',
    expectedFiles: [],
    matchedExpectedFiles: [],
    missingExpectedFiles: [],
    usedByActionIds: ['shortcutKeyStopAndTranscribeDictation'],
  });
  report.targetRows.push({
    targetId: 'native-browser-action',
    status: 'no-scrape-coverage',
    expectedFiles: [],
    matchedExpectedFiles: [],
    missingExpectedFiles: [],
    usedByActionIds: ['shortcutKeyBrowserNativeAction'],
  });
  report.shortcutRows.push({
    actionId: 'shortcutKeyStopAndTranscribeDictation',
    validationMode: 'manual-only',
    targetIds: ['dictation-stop-button'],
    activationProbeSafe: false,
    activationProbeMode: 'manual-only',
    status: 'manual',
  });
  report.shortcutRows.push({
    actionId: 'shortcutKeyBrowserNativeAction',
    validationMode: 'not-applicable',
    targetIds: ['native-browser-action'],
    activationProbeSafe: false,
    activationProbeMode: 'not-applicable',
    status: 'not-applicable',
  });
  report.liveProbeRows.push({
    actionId: 'shortcutKeyStopAndTranscribeDictation',
    probeMode: 'manual-only',
    status: 'manual',
    reason: 'Requires active dictation.',
  });
  report.liveProbeRows.push({
    actionId: 'shortcutKeyBrowserNativeAction',
    probeMode: 'not-applicable',
    status: 'not-applicable',
    reason: 'The browser owns this action.',
  });
  report.summary.liveProbes.total = 3;
  report.summary.liveProbes.manual = 1;
  report.summary.liveProbes.notApplicable = 1;
  const result = classifyCurrentPageValidation(report, invocation);
  assert.equal(result.status, 'passed');
  assert.equal(result.checkedAt, invocation.completedAt);
  assert.equal(result.pageUrl, invocation.fixtureUrl);
  assert.equal(result.targetSummary.status, 'passed');
  assert.equal(result.targetSummary.outOfScope, 2);
  assert.equal(result.probeSummary.status, 'passed');
  assert.equal(result.probeSummary.passed, 1);
  assert.ok(result.scopeLimitations.some((item) => /manual-only/.test(item.reason)));
  assert.ok(result.scopeLimitations.some((item) => /not applicable/.test(item.reason)));
  assert.ok(
    result.scopeLimitations.some((item) => /does not attest account identity/.test(item.reason)),
  );
});
