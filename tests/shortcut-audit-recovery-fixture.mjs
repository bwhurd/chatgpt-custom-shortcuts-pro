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
