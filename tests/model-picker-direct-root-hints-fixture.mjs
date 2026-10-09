import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const [labelsSource, contentSource] = await Promise.all([
  readFile(new URL('../extension/shared/model-picker-labels.js', import.meta.url), 'utf8'),
  readFile(new URL('../extension/content.js', import.meta.url), 'utf8'),
]);
const labelsContext = { window: {} };
vm.createContext(labelsContext);
vm.runInContext(labelsSource, labelsContext);
const { ModelLabels } = labelsContext.window;

const chatRows = ['GPT-5.6 Sol', 'GPT-5.5'];
const workRows = [
  'GPT-6 Astra',
  'GPT-6 Sol',
  'GPT-6 Luna',
  'GPT-5.6 Sol',
  'GPT-5.6 Terra',
  'GPT-5.5',
];
const createCodes = (slots) => {
  const codes = new Array(ModelLabels.MAX_SLOTS).fill('');
  slots.forEach(([slot, code]) => {
    codes[slot] = code;
  });
  return codes;
};
const fixtures = [
  {
    profile: 'chat',
    profileId: 'legacy',
    openerId: 'chat-composer-opener',
    rows: chatRows,
    catalogLabels: chatRows,
    codes: createCodes([
      [3, 'Digit1'],
      [8, 'Digit2'],
    ]),
    expected: [
      ['GPT-5.6 Sol', 'configure-latest', 3, 'Digit1'],
      ['GPT-5.5', 'configure-dynamic-gpt-5-5', 8, 'Digit2'],
    ],
  },
  {
    profile: 'work',
    profileId: 'latest',
    openerId: 'work-composer-opener',
    rows: workRows,
    catalogLabels: ['Default', ...workRows],
    codes: createCodes([
      [8, 'Digit1'],
      [9, 'Digit3'],
      [10, 'Digit4'],
      [4, 'Digit2'],
      [5, 'Digit6'],
      [6, 'Digit5'],
    ]),
    expected: [
      ['GPT-6 Astra', 'configure-dynamic-gpt-6-astra', 8, 'Digit1'],
      ['GPT-6 Sol', 'configure-dynamic-gpt-6-sol', 9, 'Digit3'],
      ['GPT-6 Luna', 'configure-dynamic-gpt-6-luna', 10, 'Digit4'],
      ['GPT-5.6 Sol', 'configure-dynamic-gpt-5-6-sol', 4, 'Digit2'],
      ['GPT-5.6 Terra', 'configure-dynamic-gpt-5-6-terra', 5, 'Digit6'],
      ['GPT-5.5', 'configure-dynamic-gpt-5-5', 6, 'Digit5'],
    ],
  },
];

for (const fixture of fixtures) {
  const menu = {
    role: 'menu',
    dataState: 'open',
    ariaLabelledBy: fixture.openerId,
    slider: { role: 'slider', ariaValueMin: '0', ariaValueMax: '5' },
    rows: fixture.catalogLabels.map((label) => ({ role: 'menuitemradio', label })),
    ...(fixture.profile === 'work'
      ? { fastToggle: { role: 'menuitemcheckbox', dataFastModeEnabled: 'false' } }
      : {}),
  };
  assert.equal(menu.role, 'menu');
  assert.equal(menu.dataState, 'open');
  assert.equal(menu.ariaLabelledBy, fixture.openerId);
  assert.deepEqual(menu.slider, { role: 'slider', ariaValueMin: '0', ariaValueMax: '5' });
  assert.deepEqual(
    menu.rows.map(({ label }) => label),
    fixture.catalogLabels,
    `${fixture.profile} direct-root row order should be preserved`,
  );
  if (fixture.profile === 'work') {
    assert.deepEqual(menu.fastToggle, {
      role: 'menuitemcheckbox',
      dataFastModeEnabled: 'false',
    });
    assert.equal(
      ModelLabels.getModelNameActionForLabelInList('Default', 0, fixture.catalogLabels)?.id,
      'configure-latest',
      'Work Default should remain the native-only anchor ahead of model rows',
    );
  }

  const catalogActions = fixture.catalogLabels.map((label, index) =>
    ModelLabels.getModelNameActionForLabelInList(label, index, fixture.catalogLabels),
  );
  const catalog = {
    configureOptions:
      fixture.profile === 'work'
        ? catalogActions.slice(1).map(({ id, slot, label }) => ({ id, slot, label }))
        : catalogActions.map(({ id, slot, label }) => ({ id, slot, label })),
  };
  const actual = fixture.rows.map((label, index) => {
    const action = ModelLabels.getCatalogModelNameActionForLabel(label, index, catalog);
    return [label, action?.id, action?.slot, fixture.codes[action?.slot]];
  });
  assert.deepEqual(
    actual,
    fixture.expected,
    `${fixture.profile} should use its own catalog row identity and assigned shortcut code`,
  );
}

const declaration = (startMarker, endMarker, exportedName) => {
  const start = contentSource.indexOf(startMarker);
  const end = contentSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${exportedName} source should be present`);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${contentSource.slice(start, end)}\nthis.exported = ${exportedName};`, context);
  return context.exported;
};

const modelVersionLabel = declaration(
  'const isLikelyModelVersionLabel = (value) =>',
  'const isLikelyModelVersionMenuElement',
  'isLikelyModelVersionLabel',
);
assert.equal(modelVersionLabel('GPT-6 Astra'), true);
assert.equal(modelVersionLabel('Default'), true);
for (const effortLabel of ['High', 'Standard', 'Extended', 'Max']) {
  assert.equal(modelVersionLabel(effortLabel), false, `${effortLabel} must not be a model row`);
}

const modelHintAction = declaration(
  'const isModelNameHintAction = (action) =>',
  'const getOpenModelVersionSubmenu',
  'isModelNameHintAction',
);

// A newly inserted live model must not inherit a persisted binding from
// its current row position while the stored catalog still describes older rows.
const itemActionStart = contentSource.indexOf('const getModelNameActionForMenuItem = (');
const itemActionEnd = contentSource.indexOf('const isModelNameHintAction = (', itemActionStart);
assert.ok(itemActionStart >= 0 && itemActionEnd > itemActionStart);
class ModelRow {
  constructor(label) {
    this.label = label;
  }
  closest() {
    return null;
  }
}
const itemActionContext = {
  window: { ModelLabels },
  Element: ModelRow,
  getModelVersionMenuItemLabel: (row) => row.label,
};
vm.createContext(itemActionContext);
vm.runInContext(
  `${contentSource.slice(itemActionStart, itemActionEnd)}\nthis.resolve = getModelNameActionForMenuItem;`,
  itemActionContext,
);
const persistedCatalog = {
  integratedModelMenu: true,
  configureOptions: [
    { id: 'configure-dynamic-gpt-5-6-sol', label: 'GPT-5.6 Sol', slot: 8 },
    { id: 'configure-dynamic-gpt-5-6-luna', label: 'GPT-5.6 Luna', slot: 15 },
  ],
};
const changedRows = ['Default', 'GPT-6.1 Sol', 'GPT-5.6 Sol', 'GPT-5.6 Luna'];
assert.equal(
  itemActionContext.resolve(new ModelRow('GPT-6.1 Sol'), 1, persistedCatalog, changedRows),
  null,
  'uncatalogued live row must not borrow slot 8 from GPT-5.6 Sol',
);
for (const [label, slot] of [
  ['GPT-5.6 Sol', 8],
  ['GPT-5.6 Luna', 15],
]) {
  assert.equal(
    itemActionContext.resolve(
      new ModelRow(label),
      changedRows.indexOf(label),
      persistedCatalog,
      changedRows,
    )?.slot,
    slot,
    'known live model must retain its persisted slot despite inserted rows',
  );
}
assert.equal(
  itemActionContext.resolve(new ModelRow('Default'), 0, persistedCatalog, changedRows)?.nativeOnly,
  true,
);
const hintActionStart = contentSource.indexOf('const getHintAction = (item, index) =>');
const hintActionEnd = contentSource.indexOf('items.forEach((item, index) =>', hintActionStart);
assert.ok(hintActionStart >= 0 && hintActionEnd > hintActionStart);
const liveRows = changedRows.map((label) => new ModelRow(label));
const hintActionContext = {
  window: { ModelLabels, __modelCatalog: persistedCatalog },
  directComposerItems: liveRows,
  integratedModelItems: liveRows,
  hasDefaultRow: true,
  effectiveListLabels: changedRows,
  listLabels: changedRows,
  getModelNameActionForMenuItem: itemActionContext.resolve,
  getModelVersionMenuItemLabel: (row) => row.label,
  isModelNameHintAction: modelHintAction,
};
vm.createContext(hintActionContext);
vm.runInContext(
  `${contentSource.slice(hintActionStart, hintActionEnd)}\nthis.resolve = getHintAction;`,
  hintActionContext,
);
assert.equal(
  hintActionContext.resolve(liveRows[1], 1),
  null,
  'hint caller must not revive the uncatalogued row with a positional fallback',
);
assert.equal(hintActionContext.resolve(liveRows[2], 2)?.slot, 8);
assert.equal(hintActionContext.resolve(liveRows[3], 3)?.slot, 15);
delete persistedCatalog.integratedModelMenu;
assert.equal(
  hintActionContext.resolve(liveRows[1], 1),
  null,
  'current native menu must reject positional hints even with an older unmarked catalog',
);
assert.equal(hintActionContext.resolve(liveRows[2], 2)?.slot, 8);
assert.equal(hintActionContext.resolve(liveRows[3], 3)?.slot, 15);
assert.equal(
  modelHintAction({ actionKind: 'configure-option', group: 'configure', slot: 8 }),
  true,
);
assert.equal(modelHintAction({ actionKind: 'pill-effort', group: 'primary', slot: 0 }), false);
assert.equal(
  modelHintAction({ actionKind: 'configure-option', group: 'configure', slot: 13 }),
  false,
);
assert.equal(
  modelHintAction({ actionKind: 'configure-option', group: 'configure', slot: 14 }),
  false,
);

const directRootHintSource = contentSource.slice(
  contentSource.indexOf('function getOpenComposerModelRadioMenu()'),
  contentSource.indexOf('function applyModelVersionSubmenuHints()'),
);
assert.match(
  directRootHintSource,
  /\[role="menu"\]\[data-state="open"\][\s\S]*?aria-labelledby[\s\S]*?button\[data-codex-intelligence-trigger="true"\][\s\S]*?\[role="menuitemradio"\][\s\S]*?isLikelyModelVersionLabel[\s\S]*?\[role="slider"\]\[aria-valuemin\]\[aria-valuemax\]/,
  'direct-root discovery should require the opener relationship and model-radio/slider structure',
);
assert.match(
  contentSource,
  /getRuntimeModelPickerProfile\(\)[\s\S]*?MODEL_PICKER_CODES_BY_PROFILE\[integratedProfile\]/,
  'direct-root hints should use the active Chat or Work profile codes',
);
assert.match(
  contentSource,
  /if \(action\?\.nativeOnly\) return action;/,
  'native-only Default rows should not receive extension hints',
);
assert.match(
  contentSource,
  /const directComposerModelRows = new Set\([\s\S]*?getOpenComposerModelRadioMenu\(\)\?\.items[\s\S]*?directComposerModelRows\.has\(item\.el\)/,
  'direct-root model rows should be excluded from generic primary-action hints',
);
