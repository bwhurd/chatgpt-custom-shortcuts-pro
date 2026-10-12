import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractFastRuntime,
  FastAdapterUnavailableError,
  fastReportOutcome,
  loadFastCatalogue,
  preflightFastCases,
  selectFastCases,
  summarizeFastReport,
} from './playwright/lib/shortcut-fast-cases.mjs';
import { extractModelPickerSource } from './playwright/lib/shortcut-model-controls-fixture.mjs';
import { DEFAULT_TAB_LIMIT } from './playwright/lib/shortcut-tab-pool.mjs';

const { content, report: catalogue } = await loadFastCatalogue();
assert.deepEqual(catalogue.issues, []);
assert.doesNotThrow(() => extractModelPickerSource(content));
assert.ok((await extractFastRuntime(content, 'shortcutKeyShowOverlay')).source);
assert.ok((await extractFastRuntime(content, 'shortcutKeyActivateInput')).source);

const modelPickerAnchor = 'const MODEL_PICKER_CODES_BY_PROFILE =';
assert.ok(content.includes(modelPickerAnchor));
const duplicateModelPickerAnchor = content.replace(
  modelPickerAnchor,
  `(() => { const MODEL_PICKER_CODES_BY_PROFILE = {}; })();\n  ${modelPickerAnchor}`,
);
assert.throws(
  () => extractModelPickerSource(duplicateModelPickerAnchor),
  (error) =>
    error instanceof Error &&
    !(error instanceof FastAdapterUnavailableError) &&
    /ambiguous real picker profile anchor/i.test(error.message),
  'Duplicate specialized picker anchors are fatal source ambiguity',
);

const registryAction = '      shortcutKeyActivateInput: function activateInput() {';
assert.ok(content.includes(registryAction));
const duplicateRegistryAction = content.replace(
  registryAction,
  `      shortcutKeyActivateInput: function activateInput() {},\n${registryAction}`,
);
await assert.rejects(
  extractFastRuntime(duplicateRegistryAction, 'shortcutKeyActivateInput'),
  (error) =>
    error instanceof Error &&
    !(error instanceof FastAdapterUnavailableError) &&
    /ambiguous real action registry entry/i.test(error.message),
  'Duplicate generic action registry properties are fatal source ambiguity',
);

const preflightReport = structuredClone(catalogue);
preflightReport.warnings = [];
const preflightSelection = [
  { actionId: 'available', type: 'focus' },
  { actionId: 'missing', type: 'focus' },
  { actionId: 'broken', type: 'focus' },
  { actionId: 'ambiguous', type: 'focus' },
  { actionId: 'future', type: 'future-adapter' },
];
const prepared = await preflightFastCases(preflightReport, preflightSelection, async (item) => {
  if (item.actionId === 'missing') throw new FastAdapterUnavailableError('Missing source anchor');
  if (item.actionId === 'broken') throw new TypeError('Programming error');
  if (item.actionId === 'ambiguous') throw new Error('Ambiguous source anchor');
  return 'prepared';
});
assert.deepEqual(
  preflightSelection.map((item) => item.actionId),
  ['available'],
);
assert.equal(prepared.get('available'), 'prepared');
assert.deepEqual(preflightReport.warnings.map((item) => item.actionId).sort(), [
  'future',
  'missing',
]);
assert.deepEqual(preflightReport.issues.map((item) => item.actionId).sort(), [
  'ambiguous',
  'broken',
]);
assert.ok(preflightReport.issues.every((item) => item.fatal));
assert.equal(fastReportOutcome(preflightReport).exitCode, 1);
assert.equal(fastReportOutcome(preflightReport).errors.length, 2);
assert.ok(!fastReportOutcome(preflightReport).warnings.some((item) => item.fatal));
assert.equal(fastReportOutcome(preflightReport).checks, 'No checks ran');

for (const row of catalogue.rows.filter((item) => item.status === 'deferred')) {
  assert.equal(row.admitted, false);
  assert.equal(row.classificationStatus, 'provisional-unmeasured');
  assert.ok(['bounded-fixture-candidate', 'split-local-and-external'].includes(row.proposedLane));
  assert.ok(row.owner && row.deferCategory && row.proofBoundary, row.rowId);
  assert.ok(row.expectedBlocker && row.nextStep, row.rowId);
}

const browserCommand = catalogue.rows.find((row) => row.rowId === 'browser:_execute_action');
assert.ok(browserCommand, 'The manifest browser command remains in the catalogue');
assert.equal(browserCommand.status, 'external');
assert.equal(browserCommand.admitted, false);
assert.equal(browserCommand.wiringStatus, 'pass');
assert.match(browserCommand.reason, /external and unexercised/i);

let summary = summarizeFastReport(catalogue);
assert.equal(
  summary.catalogue,
  summary.admitted + summary.deferred + summary.notApplicable + summary.external,
  'External browser commands belong in the catalogue denominator',
);

const makeReport = () => structuredClone(catalogue);
const actionId = 'shortcutKeyActivateInput';

const allWarningPreflight = makeReport();
const allWarningSelection = selectFastCases(allWarningPreflight, [actionId], ['focus']);
await preflightFastCases(allWarningPreflight, allWarningSelection, async () => {
  throw new FastAdapterUnavailableError('Source adapter is unavailable');
});
const allWarningOutcome = fastReportOutcome(allWarningPreflight);
assert.equal(allWarningOutcome.exitCode, 1);
assert.equal(allWarningOutcome.status, 'failure');
assert.equal(allWarningOutcome.checks, 'No checks ran');
assert.match(
  allWarningOutcome.errors[0].message,
  /no runnable fast-check cases remained after source preflight/i,
);
assert.ok(
  allWarningOutcome.warnings.some((warning) =>
    warning.reason.includes('Source adapter is unavailable'),
  ),
  'All-warning preflight details remain visible alongside the empty-run failure',
);

// A future missing adapter stays a visible warning while an independently
// available case can still be selected and completed.
const partial = makeReport();
partial.rows.push({
  rowId: 'synthetic:missing-adapter',
  actionId: 'futureActionWithoutAdapter',
  admitted: false,
  status: 'deferred',
  owner: 'fixture:missing-adapter',
  deferCategory: 'missing-adapter',
  reason: 'No fixture adapter is available for this action.',
  classificationStatus: 'provisional-unmeasured',
  proposedLane: 'bounded-fixture-candidate',
  proofBoundary: 'Controlled DOM target and effect are unproven.',
  expectedBlocker: 'A bounded fixture adapter has not been built.',
  nextStep: 'Add a focused adapter when the behavior is ready to cover.',
});
const selected = selectFastCases(partial, [actionId, 'unknown-action'], ['focus', 'unknown-type']);
assert.deepEqual(
  selected.map((item) => item.actionId),
  [actionId],
);
partial.scheduling = {
  serialBarrierPassed: true,
  observedParallelTabs: 1,
};
partial.observations.push({
  actionId,
  fixtureId: 'ready',
  attempted: true,
  proofScope: 'fixture-keyboard',
  status: 'pass',
  targetStatus: 'present',
  dispatchStatus: 'pass',
  effectStatus: 'pass',
  startedMs: 1,
  endedMs: 6,
  durationMs: 5,
});
const partialOutcome = fastReportOutcome(partial);
assert.equal(partialOutcome.exitCode, 0, 'Coverage warnings do not stop runnable cases');
assert.equal(partialOutcome.status, 'success-with-warnings');
assert.equal(partialOutcome.scope, 'filtered');
assert.equal(partialOutcome.coverage, 'partial');
assert.ok(
  partialOutcome.warnings.some((warning) => warning.rowId === 'synthetic:missing-adapter'),
  'Missing-adapter details are retained in the final warnings',
);
assert.ok(
  partialOutcome.warnings.some((warning) =>
    warning.reason.toLowerCase().includes('unknown requested actionid'),
  ),
);
assert.ok(
  partialOutcome.warnings.some((warning) =>
    warning.reason.toLowerCase().includes('unknown requested type'),
  ),
);
assert.ok(
  partialOutcome.warnings.every((warning) => {
    const row = partial.rows.find((item) => item.rowId === warning.rowId);
    return (
      !row ||
      row.status !== 'not-run' ||
      row.externalCoverage ||
      (row.contractId &&
        row.requiredActions.every((requiredAction) =>
          partial.selection.actionIds.includes(requiredAction),
        ))
    );
  }),
  'Intentionally unselected actions do not become coverage gaps; selected unproven contracts warn',
);
assert.equal(
  partial.rows
    .filter((row) => row.admitted && row.actionId !== actionId)
    .every((row) => row.status === 'not-run'),
  true,
);

// Unknown-only selection keeps its warning and fails because no cases can run.
const zeroSelection = makeReport();
assert.deepEqual(selectFastCases(zeroSelection, ['unknown-only'], []), []);
const zeroOutcome = fastReportOutcome(zeroSelection);
assert.equal(zeroOutcome.exitCode, 1);
assert.equal(zeroOutcome.status, 'failure');
assert.equal(zeroOutcome.scope, 'filtered');
assert.equal(zeroOutcome.checks, 'No checks ran');
assert.equal(zeroOutcome.coverage, 'partial');
assert.match(zeroOutcome.errors[0].message, /no runnable fast-check cases matched/i);
assert.ok(
  zeroOutcome.warnings.some((warning) =>
    warning.reason.toLowerCase().includes('unknown requested actionid'),
  ),
);

const noIntersection = makeReport();
assert.deepEqual(
  selectFastCases(noIntersection, [actionId], ['clipboard-message']),
  [],
  'Both selection filters are recognized but have no intersection',
);
const noIntersectionOutcome = fastReportOutcome(noIntersection);
assert.equal(noIntersectionOutcome.exitCode, 1);
assert.equal(noIntersectionOutcome.status, 'failure');
assert.equal(noIntersectionOutcome.coverage, 'partial');
assert.match(
  noIntersectionOutcome.errors[0].message,
  /no runnable fast-check cases matched the requested action\/type selection/i,
);

const catalogueOnly = makeReport();
catalogueOnly.catalogueOnly = true;
catalogueOnly.selection = {
  actionIds: [],
  runnableActionIds: [],
  filtered: true,
};
const makeScheduledReport = () => {
  const scheduled = makeReport();
  scheduled.scheduling = {
    serialBarrierPassed: true,
    observedParallelTabs: 1,
  };
  scheduled.selection = { actionIds: [actionId], filtered: true };
  scheduled.observations.push({
    actionId,
    fixtureId: 'timed',
    attempted: true,
    proofScope: 'fixture-keyboard',
    status: 'pass',
    startedMs: 1,
    endedMs: 6,
    durationMs: 5,
  });
  return scheduled;
};

assert.equal(
  fastReportOutcome(makeScheduledReport()).exitCode,
  0,
  'A filtered scheduled pass with an internally consistent timing window succeeds',
);

for (const [description, corruptScheduling] of [
  ['missing scheduling metadata', (report) => delete report.scheduling],
  ['missing serial barrier evidence', (report) => delete report.scheduling.serialBarrierPassed],
  [
    'false serial barrier evidence',
    (report) => {
      report.scheduling.serialBarrierPassed = false;
    },
  ],
  [
    'non-boolean serial barrier evidence',
    (report) => {
      report.scheduling.serialBarrierPassed = 'true';
    },
  ],
  [
    'missing observed parallel tab count',
    (report) => delete report.scheduling.observedParallelTabs,
  ],
  [
    'non-finite observed parallel tab count',
    (report) => {
      report.scheduling.observedParallelTabs = Number.NaN;
    },
  ],
  [
    'negative observed parallel tab count',
    (report) => {
      report.scheduling.observedParallelTabs = -1;
    },
  ],
  [
    'observed parallel tab count above the limit',
    (report) => {
      report.scheduling.observedParallelTabs = DEFAULT_TAB_LIMIT + 1;
    },
  ],
]) {
  const scheduled = makeScheduledReport();
  corruptScheduling(scheduled);
  const schedulingOutcome = fastReportOutcome(scheduled);
  assert.equal(schedulingOutcome.exitCode, 1, `A scheduled pass with ${description} must fail`);
  assert.ok(
    schedulingOutcome.errors.some((error) => error.owner === 'scheduling-integrity'),
    `The ${description} failure must identify scheduling integrity`,
  );
}

for (const [description, corruptTiming] of [
  ['missing startedMs', (observation) => delete observation.startedMs],
  [
    'non-finite startedMs',
    (observation) => {
      observation.startedMs = Number.NaN;
    },
  ],
  ['missing endedMs', (observation) => delete observation.endedMs],
  [
    'non-finite endedMs',
    (observation) => {
      observation.endedMs = Number.POSITIVE_INFINITY;
    },
  ],
  [
    'unordered timestamps',
    (observation) => {
      observation.startedMs = 7;
      observation.endedMs = 6;
    },
  ],
  ['missing durationMs', (observation) => delete observation.durationMs],
  [
    'non-finite durationMs',
    (observation) => {
      observation.durationMs = Number.NaN;
    },
  ],
  [
    'negative durationMs',
    (observation) => {
      observation.durationMs = -1;
    },
  ],
  [
    'durationMs longer than its interval',
    (observation) => {
      observation.durationMs = 6;
    },
  ],
]) {
  const scheduled = makeScheduledReport();
  corruptTiming(scheduled.observations[0]);
  const timingOutcome = fastReportOutcome(scheduled);
  assert.equal(timingOutcome.exitCode, 1, `A scheduled pass with ${description} must fail`);
  assert.equal(timingOutcome.status, 'failure');
  assert.ok(
    timingOutcome.errors.some((error) => error.owner === 'timing-integrity'),
    `The ${description} failure must identify timing integrity`,
  );
}

catalogueOnly.scheduling = {};
catalogueOnly.observations.push({
  actionId,
  status: 'pass',
  startedMs: Number.NaN,
  endedMs: 1,
  durationMs: -1,
});
assert.equal(
  fastReportOutcome(catalogueOnly).exitCode,
  0,
  'Catalogue-only success does not require timing data for scheduled observations',
);

// A success on one prepared tab cannot mask an environment failure on another.
const environmentReport = makeReport();
environmentReport.observations.push(
  {
    actionId,
    fixtureId: 'ready',
    attempted: true,
    proofScope: 'live-keyboard',
    status: 'pass',
    targetStatus: 'present',
    dispatchStatus: 'pass',
    effectStatus: 'pass',
  },
  {
    actionId,
    fixtureId: 'unavailable',
    attempted: false,
    proofScope: 'live-keyboard',
    status: 'environment-fail',
    reason: 'Prepared URL did not open',
  },
);
summary = summarizeFastReport(environmentReport);
const environmentRow = environmentReport.rows.find((item) => item.actionId === actionId);
assert.equal(environmentRow.status, 'environment-fail');
assert.equal(environmentRow.proofScope, 'live-keyboard');
assert.equal(environmentRow.observations.length, 2);
assert.equal(environmentRow.reason, 'Prepared URL did not open');
assert.equal(summary.selected, 2);
assert.equal(summary.attempted, 1);
assert.equal(summary.environmentFailed, 1);
assert.equal(
  summary.catalogue,
  summary.admitted + summary.deferred + summary.notApplicable + summary.external,
);
assert.equal(fastReportOutcome(environmentReport).exitCode, 1);

const failedReport = makeReport();
failedReport.observations.push({
  actionId,
  fixtureId: 'wrong-target',
  attempted: true,
  proofScope: 'fixture-keyboard',
  status: 'fail',
  reason: 'Wrong native target',
});
summary = summarizeFastReport(failedReport);
assert.equal(failedReport.rows.find((item) => item.actionId === actionId).status, 'fail');
assert.equal(
  failedReport.rows.find((item) => item.actionId === actionId).reason,
  'Wrong native target',
);
assert.equal(summary.failed, 1);
assert.equal(summary.environmentFailed, 0);
assert.equal(fastReportOutcome(failedReport).exitCode, 1);

// Derived contracts require all declared actions with controlled fixture proof.
const contractReport = makeReport();
const contractId = 'alt-modifier-isolation';
const contractRow = contractReport.rows.find((item) => item.contractId === contractId);
assert.ok(contractRow, `Expected derived contract ${contractId}`);

contractReport.selection = {
  actionIds: contractRow.requiredActions,
  filtered: false,
};
const missingContractWarning = fastReportOutcome(contractReport).warnings.find(
  (warning) => warning.rowId === contractRow.rowId,
);
assert.ok(missingContractWarning, 'A full run must warn when a derived contract is unproven');
assert.equal(missingContractWarning.source, 'source-contract');
assert.equal(missingContractWarning.owner, contractRow.owner);
assert.match(missingContractWarning.reason, /fixture-keyboard proof is missing/);

const filteredContractReport = makeReport();
const filteredContract = filteredContractReport.rows.find((item) => item.contractId === contractId);
filteredContractReport.selection = {
  actionIds: ['shortcutKeyCopyLowest'],
  filtered: true,
};
assert.ok(
  !fastReportOutcome(filteredContractReport).warnings.some(
    (warning) => warning.rowId === filteredContract.rowId,
  ),
  'A filtered run must not warn for a contract whose required action was not selected',
);

contractReport.observations.push({
  actionId: 'shortcutKeyActivateInput',
  proofScope: 'live-keyboard',
  attempted: true,
  status: 'pass',
  contractProofs: [contractId],
});
summarizeFastReport(contractReport);
assert.equal(contractRow.status, 'not-run', 'Live proof cannot establish a fixture contract');
contractReport.observations.at(-1).proofScope = 'fixture-keyboard';
summary = summarizeFastReport(contractReport);
assert.equal(contractRow.status, 'pass');
assert.deepEqual(contractRow.derivedFrom, ['shortcutKeyActivateInput']);
assert.equal(summary.admitted, summary.admittedActions + summary.admittedContracts);
assert.equal(summary.passedRows, 2, 'Action and derived contract rows are distinct');
contractReport.observations.push({
  actionId: 'shortcutKeyActivateInput',
  proofScope: 'fixture-keyboard',
  attempted: true,
  status: 'fail',
  reason: 'The second controlled fixture focused the wrong input.',
});
summarizeFastReport(contractReport);
assert.equal(contractRow.status, 'fail', 'A duplicate failed proof cannot hide behind a pass');

async function proveZeroRunnableCliFailsInIsolatedMirror() {
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
  const mirrorRoot = await mkdtemp(path.join(os.tmpdir(), 'cgcsp-b04-fast-cli-'));
  const mirrorPath = (...parts) => path.join(mirrorRoot, ...parts);
  const copyFileIntoMirror = async (relativePath) => {
    const destination = mirrorPath(relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(repositoryRoot, relativePath), destination);
  };

  try {
    await cp(
      path.join(repositoryRoot, 'tests/playwright/lib'),
      mirrorPath('tests/playwright/lib'),
      { recursive: true },
    );
    await Promise.all(
      [
        'package.json',
        'tests/playwright/shortcut-fast-fixture.mjs',
        'tests/fixtures/copy-all-formatted-conversation.html',
        'tests/fixtures/copy-all-formatted-expected.txt',
        'extension/content.js',
        'extension/manifest.json',
        'extension/lib/DevScrapeWide.js',
        'extension/settings-schema.js',
        'extension/options-storage.js',
        'extension/shared/model-picker-labels.js',
        'extension/shared/model-picker-selectors.js',
        'extension/shared/shortcut-action-metadata.js',
        'extension/_locales/en/messages.json',
      ].map(copyFileIntoMirror),
    );

    const manifestSource = await readFile(
      path.join(repositoryRoot, 'extension/manifest.json'),
      'utf8',
    );
    const manifest = JSON.parse(manifestSource.replace(/^\uFEFF/, ''));
    const manifestScripts = [
      ...(manifest.content_scripts || []).flatMap((entry) => entry.js || []),
      ...(manifest.background?.service_worker ? [manifest.background.service_worker] : []),
    ].filter((file) => !file.startsWith('lib/') && !file.startsWith('vendor/'));
    const manifestFiles = [
      ...manifestScripts.map((file) => path.join('extension', file)),
      ...(manifest.action?.default_popup
        ? [path.join('extension', manifest.action.default_popup)]
        : []),
    ];
    await Promise.all(manifestFiles.map(copyFileIntoMirror));

    await symlink(
      path.join(repositoryRoot, 'node_modules'),
      mirrorPath('node_modules'),
      'junction',
    );

    const child = spawnSync(
      process.execPath,
      [
        mirrorPath('tests/playwright/shortcut-fast-fixture.mjs'),
        '--shortcut-action-id',
        actionId,
        '--type',
        'clipboard-message',
      ],
      {
        cwd: mirrorRoot,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        timeout: 120_000,
        windowsHide: true,
      },
    );
    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.status, 1, child.stderr || child.stdout);

    const reportSource = await readFile(
      mirrorPath('tests/playwright/shortcut-fast-results.local.json'),
      'utf8',
    );
    assert.ok(reportSource.includes('"outcome"'), reportSource.slice(0, 120));
    const report = JSON.parse(reportSource.replace(/^\uFEFF/, ''));
    assert.equal(report.outcome.exitCode, 1);
    assert.equal(report.outcome.status, 'failure');
    assert.equal(report.outcome.checks, 'No checks ran');
    assert.equal(report.selection.actionIds.length, 0);
    assert.deepEqual(report.selection.runnableActionIds, []);
    assert.equal(report.observations.length, 0);
    assert.equal(report.timings.browserStartupMs, undefined);
    assert.match(
      report.outcome.errors[0].message,
      /no runnable fast-check cases matched the requested action\/type selection/i,
    );
  } finally {
    await rm(mirrorRoot, { recursive: true, force: true });
  }
}

await proveZeroRunnableCliFailsInIsolatedMirror();

console.log('Fast report fixture passed: warnings, scope, external denominator and failures.');
