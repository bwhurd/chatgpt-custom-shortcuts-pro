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
    { id: 'configure-o3', label: 'o3' },
  ],
};

const slotfulCatalog = {
  configureOptions: [
    { id: 'configure-latest', slot: 3, label: 'Latest • 5.5' },
    { id: 'configure-dynamic-5-4', slot: 8, label: '5.4' },
    { id: 'configure-dynamic-5-3', slot: 9, label: '5.3' },
    { id: 'configure-5-2', slot: 4, label: '5.2' },
    { id: 'configure-o3', slot: 6, label: 'o3' },
  ],
};

for (const [label, catalog] of [
  ['slotless refreshed catalog', slotlessCatalog],
  ['slotful refreshed catalog', slotfulCatalog],
]) {
  const actions = getConfigureActions(catalog);
  assertUniqueSlots(actions, label);

  const byLabel = Object.fromEntries(actions.map((action) => [action.label, action]));
  assert.notEqual(byLabel['5.4']?.slot, byLabel['5.3']?.slot, `${label} should split 5.4 and 5.3`);
  assert.equal(byLabel['5.2']?.slot, 4, `${label} should preserve static 5.2 slot`);
  assert.equal(byLabel.o3?.slot, 6, `${label} should preserve static o3 slot`);

  const codes = ModelLabels.buildDefaultKeyCodesFromPresentationGroups(
    ModelLabels.getPopupPresentationGroups(ModelLabels.DEFAULT_ACTIVE_CONFIG_ID, [], catalog),
  );
  assert.notEqual(
    codes[byLabel['5.4'].slot],
    codes[byLabel['5.3'].slot],
    `${label} should assign distinct default key codes`,
  );
}

console.log('model picker configure slots are unique');
