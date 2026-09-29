import assert from 'node:assert/strict';

import {
  buildStorageRecoveryPlan,
  finalizeStorageRecoveryPlan,
  createStorageMutationLedger,
} from './playwright/lib/shortcut-audit-artifacts.mjs';

const ledger = createStorageMutationLedger(
  { existing: 'before' },
  { existing: 'audit-value', temporary: 'audit-only' },
);
assert.deepEqual(
  ledger.map((entry) => ({
    key: entry.key,
    originalPresent: entry.originalPresent,
    originalValue: entry.originalValue,
    auditValue: entry.auditValue,
  })),
  [
    {
      key: 'existing',
      originalPresent: true,
      originalValue: 'before',
      auditValue: 'audit-value',
    },
    {
      key: 'temporary',
      originalPresent: false,
      originalValue: null,
      auditValue: 'audit-only',
    },
  ],
  'ledger should retain original presence and values for every mutated key',
);

const cleanPlan = buildStorageRecoveryPlan(ledger, {
  existing: 'audit-value',
  temporary: 'audit-only',
});
assert.deepEqual(cleanPlan.setValues, { existing: 'before' });
assert.deepEqual(cleanPlan.removeKeys, ['temporary']);
assert.deepEqual(cleanPlan.conflictKeys, []);
const cleanFinal = finalizeStorageRecoveryPlan(cleanPlan, { existing: 'before' });
assert.equal(cleanFinal.status, 'clean');
assert.ok(cleanFinal.entries.every((entry) => entry.status === 'restored'));

const partialLedger = createStorageMutationLedger(
  { written: 'before-write', untouched: 'before-write' },
  { written: 'audit-value', untouched: 'audit-value' },
);
const partialPlan = buildStorageRecoveryPlan(partialLedger, {
  written: 'audit-value',
  untouched: 'before-write',
});
assert.deepEqual(partialPlan.setValues, { written: 'before-write' });
assert.deepEqual(partialPlan.removeKeys, []);
assert.deepEqual(partialPlan.unchangedKeys, ['untouched']);
assert.deepEqual(partialPlan.conflictKeys, []);
const partialFinal = finalizeStorageRecoveryPlan(partialPlan, {
  written: 'before-write',
  untouched: 'before-write',
});
assert.equal(partialFinal.status, 'clean');
assert.equal(partialFinal.entries.find((entry) => entry.key === 'written').status, 'restored');
assert.equal(partialFinal.entries.find((entry) => entry.key === 'untouched').status, 'unchanged');

const changingGateLedger = createStorageMutationLedger(
  { pageUpDownTakeover: true },
  { pageUpDownTakeover: false },
);
changingGateLedger[0].auditValues.push(true);
changingGateLedger[0].auditValue = true;
const interruptedGatePlan = buildStorageRecoveryPlan(changingGateLedger, {
  pageUpDownTakeover: false,
});
assert.deepEqual(interruptedGatePlan.setValues, { pageUpDownTakeover: true });
assert.deepEqual(interruptedGatePlan.conflictKeys, []);
const concurrentGatePlan = buildStorageRecoveryPlan(changingGateLedger, {
  pageUpDownTakeover: 'user-change',
});
assert.deepEqual(concurrentGatePlan.setValues, {});
assert.deepEqual(concurrentGatePlan.conflictKeys, ['pageUpDownTakeover']);

const conflictPlan = buildStorageRecoveryPlan(ledger, {
  existing: 'user-edited-during-audit',
  temporary: 'audit-only',
});
assert.deepEqual(conflictPlan.setValues, {});
assert.deepEqual(conflictPlan.removeKeys, ['temporary']);
assert.deepEqual(conflictPlan.conflictKeys, ['existing']);
const conflictFinal = finalizeStorageRecoveryPlan(conflictPlan, {
  existing: 'user-edited-during-audit',
});
assert.equal(conflictFinal.status, 'conflict');
assert.equal(conflictFinal.entries.find((entry) => entry.key === 'existing').status, 'conflict-preserved');
assert.equal(conflictFinal.entries.find((entry) => entry.key === 'temporary').status, 'restored');

console.log('shortcut audit storage ledger preserves concurrent edits and restores cleanly');
