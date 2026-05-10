import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../extension/shared/model-picker-labels.js', import.meta.url), 'utf8');
const context = {
  window: {},
};

vm.createContext(context);
vm.runInContext(source, context, {
  filename: 'extension/shared/model-picker-labels.js',
});

const { ModelLabels } = context.window;
assert.ok(ModelLabels, 'ModelLabels should load');

const getConfigureActions = (catalog) => {
  const groups = ModelLabels.getPopupPresentationGroups(
    ModelLabels.DEFAULT_ACTIVE_CONFIG_ID,
    [],
    catalog,
  );
  return groups.find((group) => group.id === 'configure')?.actions || [];
};

const assertUniqueSlots = (actions, label) => {
  const slots = actions.map((action) => action.slot);
  assert.equal(new Set(slots).size, slots.length, `${label} should not reuse slots`);
};

const slotlessCatalog = {
  configureOptions: [
    { id: 'configure-latest', label: 'Latest • 5.5' },
    { id: 'configure-dynamic-5-4', label: '5.4' },
    { id: 'configure-dynamic-5-3', label: '5.3' },
    { id: 'configure-5-2', label: '5.2' },
    { id: 'configure-dynamic-4-5', label: '4.5' },
    { id: 'configure-o3', label: 'o3' },
  ],
};

const slotfulCatalog = {
  configureOptions: [
    { id: 'configure-latest', slot: 3, label: 'Latest • 5.5' },
    { id: 'configure-dynamic-5-4', slot: 8, label: '5.4' },
    { id: 'configure-dynamic-5-3', slot: 9, label: '5.3' },
    { id: 'configure-5-2', slot: 4, label: '5.2' },
    { id: 'configure-dynamic-4-5', slot: 10, label: '4.5' },
    { id: 'configure-o3', slot: 6, label: 'o3' },
  ],
};

const mixedCatalog = {
  configureOptions: [
    { id: 'configure-latest', slot: 3, label: 'Latest • 5.5' },
    { id: 'configure-dynamic-5-4', slot: 8, label: '5.4' },
    { id: 'configure-dynamic-4-5', label: '4.5' },
    { id: 'configure-dynamic-5-3', slot: 9, label: '5.3' },
    { id: 'configure-5-2', slot: 4, label: '5.2' },
    { id: 'configure-o3', slot: 6, label: 'o3' },
  ],
};

for (const [label, catalog] of [
  ['slotless refreshed catalog', slotlessCatalog],
  ['slotful refreshed catalog', slotfulCatalog],
  ['mixed refreshed catalog', mixedCatalog],
]) {
  const actions = getConfigureActions(catalog);
  assertUniqueSlots(actions, label);

  const byLabel = Object.fromEntries(actions.map((action) => [action.label, action]));
  assert.notEqual(byLabel['5.4']?.slot, byLabel['5.3']?.slot, `${label} should split 5.4 and 5.3`);
  assert.equal(byLabel['5.2']?.slot, 4, `${label} should preserve static 5.2 slot`);
  assert.equal(byLabel['4.5']?.slot, 10, `${label} should place 4.5 in the next open dynamic slot`);
  assert.equal(byLabel.o3?.slot, 6, `${label} should preserve static o3 slot`);

  const codes = ModelLabels.buildDefaultKeyCodesFromPresentationGroups(
    ModelLabels.getPopupPresentationGroups(ModelLabels.DEFAULT_ACTIVE_CONFIG_ID, [], catalog),
  );
  assert.notEqual(
    codes[byLabel['5.4'].slot],
    codes[byLabel['5.3'].slot],
    `${label} should assign distinct default key codes`,
  );
  assert.equal(
    ModelLabels.getCatalogConfigureActionForOption('4.5', 4, catalog)?.slot,
    byLabel['4.5'].slot,
    `${label} should resolve live 4.5 hints through the catalog slot`,
  );
  assert.equal(
    ModelLabels.getCatalogConfigureActionForOption('Latest • 5.5', 0, catalog)?.id,
    'configure-latest',
    `${label} should treat Latest version labels as the static latest action`,
  );
}

assert.equal(
  ModelLabels.mapFrontendLabelToActionId('Pro', ModelLabels.DEFAULT_ACTIVE_CONFIG_ID),
  'pro',
  'plain Configure dialog Pro row labels should map to the Pro frontend action',
);

const proPrimaryCatalog = {
  configureOptions: [{ id: 'configure-latest', slot: 3, label: 'Latest • 5.5' }],
  frontendByConfig: {
    'configure-latest': [
      { id: 'instant', slot: 0, label: 'Instant', available: true },
      { id: 'thinking', slot: 1, label: 'Thinking', available: true },
      { id: 'pro', slot: 7, label: 'Pro', available: true },
    ],
  },
};
const proPrimaryActions = ModelLabels.getPopupPrimaryActions(
  ModelLabels.DEFAULT_ACTIVE_CONFIG_ID,
  [],
  proPrimaryCatalog,
);
assert.equal(
  proPrimaryActions.find((action) => action.id === 'pro')?.slot,
  7,
  'catalog-backed primary actions should keep Pro in its shortcut slot',
);

console.log('model picker configure slots are unique');
