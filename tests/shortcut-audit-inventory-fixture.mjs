import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadDevScrapeWideContract } from './playwright/lib/devscrape-wide-core.mjs';
import {
  buildShortcutValidationInventory,
  getExpectedKeyboardListenerContracts,
  getExpectedSourceKeyboardContracts,
  parseModelPickerLabelsSource,
  parseOptionsDefaultsFromSource,
  parseSettingsSchemaSource,
} from './playwright/lib/shortcut-target-inventory.mjs';
import shortcutActionMetadata from '../extension/shared/shortcut-action-metadata.js';

const [contentSource, optionsSource, modelLabelsSource, settingsSchemaSource, localeSource, contract] =
  await Promise.all([
    readFile(new URL('../extension/content.js', import.meta.url), 'utf8'),
    readFile(new URL('../extension/options-storage.js', import.meta.url), 'utf8'),
    readFile(new URL('../extension/shared/model-picker-labels.js', import.meta.url), 'utf8'),
    readFile(new URL('../extension/settings-schema.js', import.meta.url), 'utf8'),
    readFile(new URL('../extension/_locales/en/messages.json', import.meta.url), 'utf8'),
    loadDevScrapeWideContract(),
  ]);

const scrapeStateRegistry = [
  ...(contract.exports.DUMP_REGISTRY || []),
  ...(contract.exports.DEFERRED_ARTIFACTS || []),
];
const inventory = buildShortcutValidationInventory({
  contentSource,
  optionsDefaults: parseOptionsDefaultsFromSource(optionsSource),
  modelLabels: parseModelPickerLabelsSource(modelLabelsSource),
  settingsSchema: parseSettingsSchemaSource(settingsSchemaSource),
  localeMessages: JSON.parse(localeSource),
  scrapeStateRegistry,
});

const requiredHandlerIds = shortcutActionMetadata.SHORTCUT_ACTIONS.filter(
  (action) => action.requiresHandler !== false,
).map((action) => action.actionId);
assert.deepEqual(
  requiredHandlerIds.filter((actionId) => !inventory.handlerActionIds.includes(actionId)),
  [],
  'every handler-backed shortcut should be found in the named runtime registry',
);
assert.deepEqual(
  inventory.allRuntimeActionIds.filter(
    (actionId) => !shortcutActionMetadata.SHORTCUT_ACTIONS.some((action) => action.actionId === actionId),
  ),
  [],
  'every default or handler action should have explicit shortcut metadata',
);
assert.deepEqual(
  inventory.inventoryIssues,
  [],
  `shortcut inventory should be coherent: ${JSON.stringify(inventory.inventoryIssues, null, 2)}`,
);

const expectedListenerIds = getExpectedKeyboardListenerContracts().map((contractRow) => contractRow.contractId);
assert.deepEqual(
  inventory.keyboardListeners.map((listener) => listener.contractId),
  expectedListenerIds,
  'all content keyboard listeners should have explicit fixed-contract classifications',
);
assert.ok(
  inventory.fixedKeyboardContracts.every((contractRow) => contractRow.status === 'present'),
  'every expected fixed keyboard contract should be present in content.js',
);
const expectedSourceContractIds = getExpectedSourceKeyboardContracts().map(
  (contractRow) => contractRow.contractId,
);
assert.deepEqual(
  inventory.fixedKeyboardContracts
    .filter((contractRow) => expectedSourceContractIds.includes(contractRow.contractId))
    .map((contractRow) => contractRow.contractId),
  expectedSourceContractIds,
  'modifier, preview, gate, overlay, and PageUp/PageDown source contracts should be represented',
);

const profileNames = ['legacy', 'latest'];
const expectedSlots = Array.from({ length: inventory.modelPickerSlotCount }, (_, slot) => slot);
assert.equal(
  inventory.modelPickerSlotRows.length,
  inventory.modelPickerSlotCount * profileNames.length,
  'both independent model-picker profiles should expose every sparse slot',
);
for (const profile of profileNames) {
  const rows = inventory.modelPickerProfiles[profile]?.rows || [];
  assert.deepEqual(
    rows.map((row) => row.slot),
    expectedSlots,
    `${profile} should retain exact slot order from zero through the configured maximum`,
  );
  assert.equal(
    new Set(rows.map((row) => row.rowId)).size,
    rows.length,
    `${profile} model slot row ids should be unique`,
  );
  assert.equal(
    rows.reduce((total, row) => total + (row.assigned ? 1 : 0), 0),
    inventory.modelPickerProfiles[profile].assignedCount,
    `${profile} assignment summary should reconcile with row data`,
  );
  assert.ok(
    rows.some((row) => row.availability === 'presented'),
    `${profile} should have at least one currently presented model action`,
  );
  assert.ok(
    rows.some((row) => row.availability === 'unavailable' || row.availability === 'empty'),
    `${profile} should preserve non-presented or empty slots for audit coverage`,
  );
}

console.log(
  JSON.stringify(
    {
      runtimeActions: inventory.allRuntimeActionIds.length,
      handlerActions: inventory.handlerActionIds.length,
      targetDescriptors: inventory.targets.length,
      fixedKeyboardContracts: inventory.fixedKeyboardContracts.length,
      modelPickerSlotRows: inventory.modelPickerSlotRows.length,
      modelPickerProfiles: Object.fromEntries(
        profileNames.map((profile) => [
          profile,
          {
            slots: inventory.modelPickerProfiles[profile].slotCount,
            assigned: inventory.modelPickerProfiles[profile].assignedCount,
            presented: inventory.modelPickerProfiles[profile].presentedCount,
            unavailable: inventory.modelPickerProfiles[profile].unavailableCount,
            empty: inventory.modelPickerProfiles[profile].emptyCount,
          },
        ]),
      ),
      inventoryIssues: inventory.inventoryIssues.length,
    },
    null,
    2,
  ),
);
