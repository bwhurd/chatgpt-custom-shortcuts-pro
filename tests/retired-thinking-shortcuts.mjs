import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const readExtensionFile = (path) =>
  readFile(new URL(`../extension/${path}`, import.meta.url), 'utf8');

const retiredKeys = [
  'shortcutKeyRegenerateWithDifferentModel',
  'altPageDown',
  'altPageUp',
  'shortcutKeyRegenerateAddDetails',
  'shortcutKeyRegenerateMoreConcise',
  'shortcutKeyThinkingExtended',
  'shortcutKeyThinkingStandard',
  'shortcutKeyThinkLonger',
  'shortcutKeyToggleCanvas',
];
const [content, metadata, options, popupHtml, popupJs, schema, modelLabels, analytics] =
  await Promise.all([
    readExtensionFile('content.js'),
    readExtensionFile('shared/shortcut-action-metadata.js'),
    readExtensionFile('options-storage.js'),
    readExtensionFile('popup.html'),
    readExtensionFile('popup.js'),
    readExtensionFile('settings-schema.js'),
    readExtensionFile('shared/model-picker-labels.js'),
    readExtensionFile('analytics.js'),
  ]);

for (const key of retiredKeys) {
  const keyPattern = new RegExp(key);
  for (const [name, source] of Object.entries({
    content,
    metadata,
    options,
    popupHtml,
    popupJs,
    schema,
    modelLabels,
    analytics,
  })) {
    assert.doesNotMatch(source, keyPattern, `${key} remains in ${name}`);
  }
}

const modelLabelsContext = vm.createContext({ window: {} });
vm.runInContext(modelLabels, modelLabelsContext, {
  filename: 'extension/shared/model-picker-labels.js',
});
const modelLabelsApi = modelLabelsContext.window.ModelLabels;
for (const [effortId, label, proShortcutKey] of [
  ['thinking-standard', 'Standard', 'shortcutKeyProStandard'],
  ['thinking-extended', 'Extended', 'shortcutKeyProExtended'],
]) {
  const option = modelLabelsApi.getThinkingEffortOptionById(effortId);
  assert.equal(option?.id, effortId, `${label} remains a model effort option`);
  assert.equal(
    Object.hasOwn(option, 'storageKey'),
    false,
    `${label} has no retired global shortcut key`,
  );
  assert.equal(modelLabelsApi.normalizeThinkingEffortId(label), effortId);

  const proShortcut = modelLabelsApi.getProThinkingShortcutByStorageKey(proShortcutKey);
  assert.equal(proShortcut?.optionId, effortId, `${label} remains linked to its Pro shortcut`);
}
for (const retiredKey of ['shortcutKeyThinkingStandard', 'shortcutKeyThinkingExtended']) {
  assert.equal(
    modelLabelsApi.getThinkingShortcutByStorageKey(retiredKey),
    null,
    `${retiredKey} is not a live global shortcut setting`,
  );
}

const metadataContext = vm.createContext({});
vm.runInContext(metadata, metadataContext, {
  filename: 'extension/shared/shortcut-action-metadata.js',
});
const shortcutActionIds = new Set(
  metadataContext.CSPShortcutActionMetadata.SHORTCUT_ACTIONS.map((action) => action.actionId),
);
for (const proShortcutKey of ['shortcutKeyProStandard', 'shortcutKeyProExtended']) {
  assert.ok(shortcutActionIds.has(proShortcutKey), `${proShortcutKey} remains in active metadata`);
}
for (const retiredKey of ['shortcutKeyThinkingStandard', 'shortcutKeyThinkingExtended']) {
  assert.ok(!shortcutActionIds.has(retiredKey), `${retiredKey} has no active shortcut metadata`);
}

const schemaContext = { window: {} };
schemaContext.globalThis = schemaContext.window;
vm.createContext(schemaContext);
vm.runInContext(schema, schemaContext, { filename: 'extension/settings-schema.js' });
const shortcutSchema = schemaContext.window.CSP_SETTINGS_SCHEMA.shortcuts;
assert.ok(!shortcutSchema.deprecatedShortcutKeys.includes('shortcutKeyStudy'));
assert.equal(shortcutSchema.labelI18nByKey.shortcutKeyStudy, 'label_study');
assert.ok(
  shortcutSchema.overlaySections.some((section) => section.keys.includes('shortcutKeyStudy')),
);
assert.match(popupHtml, /id="shortcutKeyStudy" data-sync="shortcutKeyStudy"/);
assert.doesNotMatch(metadata, /notApplicable\(['"]shortcutKeyStudy['"]/);
assert.match(content, /shortcutKeyStudy:\s*runStudyShortcut/);

let optionsConfig;
const removeUnused = (stored, defaults) => {
  for (const key of Object.keys(stored)) {
    if (!Object.hasOwn(defaults, key)) delete stored[key];
  }
};
function OptionsSync(config) {
  optionsConfig = config;
}
OptionsSync.migrations = { removeUnused };
const optionsContext = { console, OptionsSync };
optionsContext.globalThis = optionsContext;
vm.createContext(optionsContext);
vm.runInContext(options, optionsContext, { filename: 'extension/options-storage.js' });

for (const key of retiredKeys) {
  assert.ok(!Object.hasOwn(optionsConfig.defaults, key), `${key} remains in stored defaults`);
}
assert.equal(optionsConfig.migrations.at(-1), removeUnused);
assert.equal(optionsConfig.defaults.shortcutKeyStudy, '');

const stored = {
  ...optionsConfig.defaults,
  ...Object.fromEntries(retiredKeys.map((key) => [key, 'KeyA'])),
  shortcutKeyStudy: 'KeyU',
  shortcutKeySearchWeb: 'KeyQ',
  shortcutKeyProStandard: 'KeyP',
  modelPickerKeyCodesLegacy: ['F1', 'Digit2'],
  removeMarkdownOnCopyCheckbox: true,
};
for (const migration of optionsConfig.migrations) migration(stored, optionsConfig.defaults);

for (const key of retiredKeys) {
  assert.ok(!Object.hasOwn(stored, key), `${key} survived the remove-unused migration`);
}
assert.equal(stored.shortcutKeyStudy, 'KeyU');
assert.equal(stored.shortcutKeySearchWeb, 'KeyQ');
assert.equal(stored.shortcutKeyProStandard, 'KeyP');
assert.deepEqual(Array.from(stored.modelPickerKeyCodesLegacy), ['F1', 'Digit2']);
assert.equal(stored.removeMarkdownOnCopyCheckbox, true);

console.log('nine obsolete shortcut settings are removed safely and Study remains active');
