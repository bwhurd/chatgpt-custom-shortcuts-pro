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

const getModelNameActions = (catalog) => {
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
  const actions = getModelNameActions(catalog);
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
    ModelLabels.getCatalogModelNameActionForLabel('4.5', 4, catalog)?.slot,
    byLabel['4.5'].slot,
    `${label} should resolve live 4.5 hints through the catalog slot`,
  );
  assert.equal(
    ModelLabels.getCatalogModelNameActionForLabel('Latest • 5.5', 0, catalog)?.id,
    'configure-latest',
    `${label} should treat Latest version labels as the static latest action`,
  );
}

assert.equal(
  ModelLabels.getLatestModelNameIndex(['5.5', '5.6', '5.4', 'o3']),
  1,
  'highest numeric model label should be treated as latest',
);
assert.equal(
  ModelLabels.getModelNameActionForLabelInList('5.6', 1, ['5.5', '5.6', '5.4', 'o3'])?.id,
  'configure-latest',
  'a newly added higher model should take the latest action id even when not first',
);
assert.equal(
  ModelLabels.getModelNameActionForLabelInList('5.5', 0, ['5.5', '5.6', '5.4', 'o3'])?.id,
  'configure-dynamic-5-5',
  'old first-row latest should become a dynamic model when a higher version is visible',
);

const dynamicSelfPrimaryCatalog = {
  configureOptions: [
    { id: 'configure-latest', slot: 3, label: 'Latest • 5.5' },
    { id: 'configure-dynamic-4-5', slot: 10, label: '4.5' },
  ],
  frontendByConfig: {
    'configure-dynamic-4-5': [
      { id: 'configure-dynamic-4-5', slot: 10, label: 'GPT-4.5', available: true },
    ],
  },
};
const dynamicSelfPrimaryActions = ModelLabels.getPopupPrimaryActions(
  'configure-dynamic-4-5',
  [],
  dynamicSelfPrimaryCatalog,
);
assert.deepEqual(
  dynamicSelfPrimaryActions.map((action) => action.label),
  ['GPT-4.5', 'Configure...'],
  'dynamic no-variant models should render their scraped self row plus Configure',
);
assert.equal(
  dynamicSelfPrimaryActions[0]?.slot,
  dynamicSelfPrimaryCatalog.configureOptions[1].slot,
  'dynamic no-variant primary row should share the second-row configure slot',
);
assert.equal(
  ModelLabels.getCatalogActionById('configure-dynamic-4-5', dynamicSelfPrimaryCatalog)?.slot,
  10,
  'dynamic catalog actions should resolve by id with their persisted slot',
);

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
assert.equal(
  ModelLabels.hasProFrontendOption(proPrimaryCatalog),
  true,
  'catalog-backed Pro shortcut rows should show when refresh captured an available Pro row',
);
assert.equal(
  ModelLabels.hasProFrontendOption({
    frontendByConfig: {
      'configure-latest': [{ id: 'pro', slot: 7, label: 'Pro', available: false }],
    },
  }),
  false,
  'catalog-backed Pro shortcut rows should stay hidden when the Pro row is unavailable',
);
assert.equal(
  ModelLabels.getProThinkingShortcutByStorageKey('shortcutKeyProStandard')?.optionId,
  'thinking-standard',
  'Pro Standard shortcut should target the Standard thinking effort',
);
assert.equal(
  ModelLabels.getProThinkingShortcutByStorageKey('shortcutKeyProExtended')?.optionId,
  'thinking-extended',
  'Pro Extended shortcut should target the Extended thinking effort',
);

const integratedEffortCatalog = {
  integratedEffort: true,
  configureOptions: [
    { id: 'configure-latest', slot: 3, label: '5.5' },
    { id: 'configure-dynamic-5-4', slot: 8, label: '5.4' },
    { id: 'configure-dynamic-5-3', slot: 9, label: '5.3' },
    { id: 'configure-o3', slot: 6, label: 'o3' },
  ],
  frontendByConfig: {
    'configure-latest': [
      { id: 'instant', slot: 0, label: 'Instant', available: true },
      { id: 'thinking', slot: 1, label: 'Medium', available: true },
      { id: 'pro', slot: 7, label: 'High', available: true },
    ],
    'configure-dynamic-5-4': [
      { id: 'instant', slot: 0, label: 'Instant', available: true },
      { id: 'thinking', slot: 1, label: 'Medium', available: true },
      { id: 'pro', slot: 7, label: 'High', available: true },
    ],
    'configure-dynamic-5-3': [{ id: 'instant', slot: 0, label: 'Instant', available: true }],
    'configure-o3': [{ id: 'thinking', slot: 1, label: 'Medium', available: true }],
  },
};
const integratedGroups = ModelLabels.getPopupPresentationGroups(
  ModelLabels.DEFAULT_ACTIVE_CONFIG_ID,
  [],
  integratedEffortCatalog,
);
assert.deepEqual(
  integratedGroups.find((group) => group.id === 'primary')?.actions.map((action) => action.label),
  ['Instant', 'Medium', 'High'],
  'integrated effort catalog should render first-level options as the first popup row',
);
assert.deepEqual(
  integratedGroups.find((group) => group.id === 'configure')?.actions.map((action) => action.label),
  ['5.5', '5.4', '5.3', 'o3'],
  'integrated effort catalog should render second-level model options as the second popup row',
);
assert.deepEqual(
  ModelLabels.getPopupPresentationGroups('configure-dynamic-5-3', [], integratedEffortCatalog)
    .find((group) => group.id === 'primary')
    ?.actions.map((action) => action.label),
  ['Instant'],
  'integrated effort catalog should allow per-model first-level option sets',
);
assert.deepEqual(
  ModelLabels.getPopupPresentationGroups('configure-o3', [], integratedEffortCatalog)
    .find((group) => group.id === 'primary')
    ?.actions.map((action) => action.label),
  ['Medium'],
  'integrated effort catalog should preserve medium-only model option sets',
);

const integratedFallbackLabels = ModelLabels.getPopupPresentationGroups(
  ModelLabels.DEFAULT_ACTIVE_CONFIG_ID,
  [],
  {
    integratedEffort: true,
    configureOptions: [{ id: 'configure-latest', slot: 3, label: '5.5' }],
    frontendByConfig: {},
  },
)
  .find((group) => group.id === 'primary')
  ?.actions.map((action) => action.label);
assert.equal(
  JSON.stringify(integratedFallbackLabels),
  JSON.stringify(['Instant', 'Medium', 'High']),
  'integrated effort fallback should not render the removed Configure first-row button',
);

const noCatalogGroups = ModelLabels.getPopupPresentationGroups(
  ModelLabels.DEFAULT_ACTIVE_CONFIG_ID,
  [],
  null,
);
assert.equal(
  JSON.stringify(
    noCatalogGroups.find((group) => group.id === 'primary')?.actions.map((action) => action.label),
  ),
  JSON.stringify(['Instant', 'Medium', 'High']),
  'no-catalog popup fallback should use the scraped integrated first row',
);
assert.equal(
  JSON.stringify(
    noCatalogGroups.find((group) => group.id === 'configure')?.actions.map((action) => action.label),
  ),
  JSON.stringify(['5.5', '5.4', '5.3', 'o3']),
  'no-catalog popup fallback should use the scraped second-row model labels',
);
assert.equal(
  JSON.stringify(ModelLabels.defaultKeyCodes().slice(0, 10)),
  JSON.stringify(['Digit1', 'Digit2', '', 'Digit4', '', '', 'Digit7', 'Digit3', 'Digit5', 'Digit6']),
  'default model picker codes should not assign the removed Configure slot',
);
assert.equal(
  JSON.stringify(ModelLabels.defaultNames().slice(0, 10)),
  JSON.stringify(['Instant', 'Medium', '', '5.5', '', '', 'o3', 'High', '5.4', '5.3']),
  'default model names should mirror the scraped integrated picker layout',
);
assert.equal(
  JSON.stringify(
    ModelLabels.resolveActionableNames([
      'Instant',
      'Thinking',
      'Configure...',
      'Latest',
      '5.2',
      '5.0 Thinking Mini',
      'o3',
    ]).slice(0, 10),
  ),
  JSON.stringify([
    'Instant',
    'Medium',
    '',
    '5.5',
    '',
    '',
    'o3',
    'High',
    '5.4',
    '5.3',
  ]),
  'legacy stored names should not restore Thinking/Configure/Latest fallbacks',
);

console.log('model picker model-name slots are unique');
