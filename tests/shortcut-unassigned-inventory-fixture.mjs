import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FAST_CASES, loadFastCatalogue } from './playwright/lib/shortcut-fast-cases.mjs';

const { content, inventory, report } = await loadFastCatalogue();
const unassigned = report.rows.filter(
  (row) => row.rowId.startsWith('model:') && row.admitted && !row.assigned,
);
const expectedUnassigned = inventory.modelPickerSlotRows.filter(
  (row) => !row.assigned && row.availability === 'unavailable',
);
assert.ok(unassigned.length > 0, 'The inventory must retain unavailable negative-proof cases');
assert.equal(unassigned.length, expectedUnassigned.length);
assert.equal(unassigned.filter((row) => row.availability === 'empty').length, 0);
assert.ok(unassigned.every((row) => !row.code));
assert.equal(unassigned.filter((row) => row.status === 'not-run').length, unassigned.length);
assert.equal(inventory.modelPickerProfiles.legacy.rows.length, inventory.modelPickerSlotCount);
const emptyPositions = Object.values(inventory.modelPickerProfiles).flatMap((profile) =>
  profile.rows.filter((row) => row.availability === 'empty'),
);
const emptyDiagnostics = report.rows.filter(
  (row) => row.rowId.startsWith('model:') && row.inventoryScope === 'slot-diagnostic',
);
assert.deepEqual(
  emptyDiagnostics.map((row) => row.rowId).sort(),
  emptyPositions.map((row) => row.rowId).sort(),
);
assert.ok(emptyDiagnostics.every((row) => row.status === 'not-applicable'));
const unavailableAssigned = report.rows.find((row) => row.profile === 'latest' && row.slot === 14);
assert.equal(unavailableAssigned.code, '');
assert.equal(unavailableAssigned.assigned, false);
assert.equal(unavailableAssigned.status, 'not-run');
assert.equal(unavailableAssigned.availability, 'unavailable');
assert.ok(!report.rows.some((row) => row.contractId === 'model-picker-refresh-support'));
assert.ok(!report.rows.some((row) => row.rowId === 'fixed:model-picker-refresh-support'));
assert.equal(inventory.presentationLifecycleListeners.length, 1);
assert.equal(
  inventory.presentationLifecycleListeners[0].lifecycleId,
  'slim-sidebar-interaction-refresh',
);
assert.match(content, /function scheduleInteractionRefresh\(\)\s*\{\s*scheduleBarRefresh\(120\)/);
assert.match(content, /document\.addEventListener\('keydown', scheduleInteractionRefresh/);

const manifest = JSON.parse(
  (await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8')).replace(
    /^\uFEFF/,
    '',
  ),
);
const browserAction = report.rows.find((row) => row.rowId === 'browser:_execute_action');
assert.ok(browserAction, 'the declared Chrome popup command should be catalogued');
assert.equal(browserAction.actionId, '_execute_action');
assert.equal(browserAction.proofScope, 'static-wiring');
assert.equal(browserAction.status, 'external');
assert.equal(browserAction.admitted, false);
assert.deepEqual(browserAction.targetRefs, [manifest.action.default_popup]);
assert.equal(browserAction.wiringStatus, 'pass');
assert.equal(browserAction.externalCoverage.status, 'not-proven');
assert.ok(
  !FAST_CASES.some((item) => item.actionId === '_execute_action'),
  'browser-native popup activation must stay outside executable keyboard cases',
);

const firstGeneratedModelCases = FAST_CASES.filter((item) => item.rowId?.startsWith('model:')).map(
  ({ rowId, actionId, type, fixtureCode }) => ({ rowId, actionId, type, fixtureCode }),
);
const secondLoad = await loadFastCatalogue();
const secondGeneratedModelCases = FAST_CASES.filter((item) => item.rowId?.startsWith('model:')).map(
  ({ rowId, actionId, type, fixtureCode }) => ({ rowId, actionId, type, fixtureCode }),
);
const expectedModelCaseIds = secondLoad.inventory.modelPickerSlotRows
  .filter((row) => row.availability !== 'empty')
  .map((row) => row.rowId);
const expectedSlots = Array.from(
  { length: secondLoad.inventory.modelPickerSlotCount },
  (_, slot) => slot,
);
assert.deepEqual(
  secondGeneratedModelCases,
  firstGeneratedModelCases,
  'reloading the catalogue should rebuild the same generated model cases without stale duplicates',
);
assert.deepEqual(
  secondGeneratedModelCases.map((item) => item.rowId),
  expectedModelCaseIds,
  'generated model cases should match the current non-empty profile slots exactly',
);
assert.equal(
  new Set(secondGeneratedModelCases.map((item) => item.rowId)).size,
  secondGeneratedModelCases.length,
  'generated model case row ids should remain unique after a repeated load',
);
assert.deepEqual(
  secondLoad.inventory.modelPickerProfiles.legacy.rows.map((row) => row.slot),
  expectedSlots,
  'catalogue reload should preserve sparse legacy slot positions',
);
assert.equal(
  secondLoad.inventory.modelPickerProfiles.legacy.emptyCount,
  1,
  'catalogue reload should retain the genuinely empty legacy position as a profile diagnostic',
);
console.log(
  'PASS: sparse profiles and repeat catalogue loads are stable; popup command wiring is catalogued with external activation scope.',
);
