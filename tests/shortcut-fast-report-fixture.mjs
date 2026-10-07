import assert from 'node:assert/strict';
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
partial.observations.push({
  actionId,
  fixtureId: 'ready',
  attempted: true,
  proofScope: 'fixture-keyboard',
  status: 'pass',
  targetStatus: 'present',
  dispatchStatus: 'pass',
  effectStatus: 'pass',
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

// Unknown-only selection is a warning-only zero-check run with explicit scope.
const zeroSelection = makeReport();
assert.deepEqual(selectFastCases(zeroSelection, ['unknown-only'], []), []);
const zeroOutcome = fastReportOutcome(zeroSelection);
assert.equal(zeroOutcome.exitCode, 0);
assert.equal(zeroOutcome.scope, 'filtered');
assert.equal(zeroOutcome.checks, 'No checks ran');
assert.equal(zeroOutcome.coverage, 'partial');
assert.ok(
  zeroOutcome.warnings.some((warning) =>
    warning.reason.toLowerCase().includes('unknown requested actionid'),
  ),
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
const contractId = 'response-navigation-preview';
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
  actionIds: [filteredContract.requiredActions[0]],
  filtered: true,
};
assert.ok(
  !fastReportOutcome(filteredContractReport).warnings.some(
    (warning) => warning.rowId === filteredContract.rowId,
  ),
  'A filtered run must not warn for a contract whose required action was not selected',
);

contractReport.observations.push(
  {
    actionId: 'shortcutKeyPreviousThread',
    proofScope: 'fixture-keyboard',
    attempted: true,
    status: 'pass',
    contractProofs: [contractId],
  },
  {
    actionId: 'shortcutKeyNextThread',
    proofScope: 'live-keyboard',
    attempted: true,
    status: 'pass',
    contractProofs: [contractId],
  },
);
summarizeFastReport(contractReport);
assert.equal(contractRow.status, 'not-run', 'Live proof cannot establish a fixture contract');
contractReport.observations.at(-1).proofScope = 'fixture-keyboard';
summary = summarizeFastReport(contractReport);
assert.equal(contractRow.status, 'pass');
assert.deepEqual(contractRow.derivedFrom, ['shortcutKeyPreviousThread', 'shortcutKeyNextThread']);
assert.equal(summary.admitted, summary.admittedActions + summary.admittedContracts);
assert.equal(summary.passedRows, 3, 'Action and derived contract rows are distinct');
contractReport.observations.push({
  actionId: 'shortcutKeyNextThread',
  proofScope: 'fixture-keyboard',
  attempted: true,
  status: 'fail',
  reason: 'The second controlled fixture used the wrong navigator.',
});
summarizeFastReport(contractReport);
assert.equal(contractRow.status, 'fail', 'A duplicate failed proof cannot hide behind a pass');

console.log('Fast report fixture passed: warnings, scope, external denominator and failures.');
