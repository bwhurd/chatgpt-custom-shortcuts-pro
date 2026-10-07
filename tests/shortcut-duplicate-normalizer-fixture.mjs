import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(
  new URL('../extension/shared/model-picker-labels.js', import.meta.url),
  'utf8',
);
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context, {
  filename: 'extension/shared/model-picker-labels.js',
});

const { ModelLabels } = context.window;
assert.ok(ModelLabels, 'ModelLabels should load');
assert.equal(typeof ModelLabels.normalizeShortcutAssignments, 'function');

const catalog = {
  pillMenu: true,
  pillSpeedMenu: true,
  pillResetAvailable: false,
  configureOptions: [
    { id: 'configure-latest', label: 'GPT-5.6 Sol', slot: 3 },
    { id: 'configure-dynamic-gpt-5-6-terra', label: 'GPT-5.6 Terra', slot: 8 },
    { id: 'configure-dynamic-gpt-5-6-luna', label: 'GPT-5.6 Luna', slot: 9 },
    { id: 'configure-dynamic-gpt-5-5', label: 'GPT-5.5', slot: 10 },
    { id: 'configure-dynamic-gpt-6-1-sol', label: 'GPT-6.1 Sol', slot: 15 },
    { id: 'configure-dynamic-gpt-6-astra', label: 'GPT-6 Astra', slot: 16 },
  ],
  frontendByConfig: {},
};
const groups = ModelLabels.getPopupPresentationGroups(
  ModelLabels.DEFAULT_ACTIVE_CONFIG_ID,
  ModelLabels.defaultNames(),
  catalog,
);
const modelSlots = [3, 8, 9, 10, 15, 16];
const defaults = ModelLabels.buildDefaultKeyCodesFromPresentationGroups(groups);
assert.deepEqual(
  modelSlots.map((slot) => defaults[slot]),
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit7', 'Digit8'],
  'generated model keys should skip the shared toggle and Speed reservations',
);
assert.equal(defaults[13], 'Digit6', 'Speed should keep its stable default');
assert.notEqual(defaults[15], 'Digit5', 'GPT-6.1 Sol should not reuse Chat/Work');
assert.notEqual(defaults[16], 'Digit6', 'GPT-6 Astra should not reuse Toggle Speed');

const customReservedDefaults = ModelLabels.buildDefaultKeyCodesFromPresentationGroups(groups, {
  reservedCodes: ['Numpad8', '2'],
});
assert.deepEqual(
  modelSlots.map((slot) => customReservedDefaults[slot]),
  ['Digit1', 'Digit3', 'Digit4', 'Digit7', 'Digit9', ''],
  'custom scalar reservations and the finite digit sequence should be honored',
);
assert.equal(
  ModelLabels.defaultKeyCodesForProfile(ModelLabels.MODEL_PICKER_PROFILE_LATEST, {
    catalog,
    names: ModelLabels.defaultNames(),
    reservedCodes: ['Digit1'],
  })[3],
  'Digit2',
  'profile defaults should accept scalar shortcut reservations',
);
const resetGroups = ModelLabels.getPopupPresentationGroups(
  ModelLabels.DEFAULT_ACTIVE_CONFIG_ID,
  ModelLabels.defaultNames(),
  { ...catalog, pillResetAvailable: true },
);
const resetDefaults = ModelLabels.buildDefaultKeyCodesFromPresentationGroups(resetGroups);
assert.equal(resetDefaults[14], 'Digit7', 'an available reset utility should keep its default');
assert.equal(resetDefaults[15], 'Digit8', 'model defaults should skip the Reset key');
assert.equal(resetDefaults[16], 'Digit9', 'model defaults should continue through free digits');

const makeCodes = () => Array(22).fill('');
const latestCodes = makeCodes();
latestCodes[13] = 'Numpad6';
latestCodes[15] = '5';
latestCodes[16] = 'Digit6';
latestCodes[7] = 'KeyC';
latestCodes[18] = 'KeyR';
latestCodes[20] = 'KeyH';
latestCodes[21] = 'Period';
const legacyCodes = makeCodes();
legacyCodes[8] = 'KeyZ';
legacyCodes[9] = 'KeyZ';
legacyCodes[7] = 'KeyC';
const legacyGroups = ModelLabels.getPopupPresentationGroups(
  ModelLabels.DEFAULT_ACTIVE_CONFIG_ID,
  ModelLabels.defaultLegacyNames(),
  ModelLabels.getDefaultLegacyCatalog(),
);
const latestGroups = [
  ...groups,
  { id: 'hidden-config', actions: [{ id: 'hidden-effort', slot: 18 }] },
  { id: 'same-owner-alias', actions: [{ id: 'gpt-6-1-self-row', slot: 15 }] },
];
const shortcuts = [
  { storageKey: 'shortcutKeyToggleChatWork', value: '5', modifier: 'Alt' },
  { storageKey: 'shortcutKeyToggleSidebar', value: 'Numpad5', modifier: 'alt' },
  { storageKey: 'shortcutKeyControlExample', value: 'Digit5', modifier: 'ctrl' },
  { storageKey: 'shortcutKeyUnassigned', value: '\u00A0', modifier: 'alt' },
  { storageKey: 'shortcutKeyBlank', value: '', modifier: 'alt' },
];
const snapshot = {
  shortcutKeyToggleChatWork: '5',
  shortcutKeyToggleSidebar: 'Numpad5',
  shortcutKeyControlExample: 'Digit5',
  shortcutKeyUnassigned: '\u00A0',
  shortcutKeyBlank: '',
  modelPickerKeyCodesLatest: latestCodes.slice(),
  modelPickerKeyCodesLegacy: legacyCodes.slice(),
  unrelatedSetting: { retained: true },
};

const repaired = ModelLabels.normalizeShortcutAssignments({
  shortcuts,
  modelModifier: 'alt',
  snapshot,
  profiles: {
    latest: {
      codes: latestCodes,
      groups: latestGroups,
      storageKey: 'modelPickerKeyCodesLatest',
    },
    legacy: {
      codes: legacyCodes,
      groups: legacyGroups,
      storageKey: 'modelPickerKeyCodesLegacy',
    },
  },
});
assert.equal(
  repaired.shortcuts[0].value,
  'Digit5',
  'legacy digits should normalize to KeyboardEvent.code',
);
assert.equal(
  repaired.shortcuts[1].value,
  '\u00A0',
  'later duplicate scalar shortcut should clear to NBSP',
);
assert.equal(
  repaired.shortcuts[2].value,
  'Digit5',
  'a different modifier domain may reuse the key',
);
assert.equal(repaired.shortcuts[3].value, '\u00A0', 'an already-cleared shortcut stays cleared');
assert.equal(repaired.shortcuts[4].value, '', 'an empty scalar value stays empty');
assert.equal(repaired.profiles.latest[13], 'Digit6', 'Speed should win over model rows');
assert.equal(repaired.profiles.latest[15], '', 'GPT-6.1 Sol should yield to Chat/Work');
assert.equal(repaired.profiles.latest[16], '', 'GPT-6 Astra should yield to Toggle Speed');
assert.equal(
  repaired.profiles.latest[7],
  'KeyC',
  'nonconflicting custom model keys should survive',
);
assert.equal(repaired.profiles.latest[20], 'KeyH', 'long hidden custom slots should survive');
assert.equal(
  repaired.profiles.latest[18],
  'KeyR',
  'keys for hidden supported configurations should survive',
);
assert.equal(
  repaired.profiles.latest[21],
  'Period',
  'arrays should retain their existing length and values',
);
assert.equal(repaired.profiles.legacy[8], 'KeyZ');
assert.equal(repaired.profiles.legacy[9], '', 'later duplicate slots in one profile should clear');
assert.equal(repaired.profiles.legacy[7], 'KeyC', 'Chat/Work may reuse the same key independently');
assert.equal(
  repaired.clearedOwners.filter((owner) => owner.type === 'shortcut').length,
  1,
  'the duplicate scalar owner should be reported once',
);
assert.ok(
  repaired.clearedOwners.some((owner) => owner.profile === 'latest' && owner.slot === 15),
  'cleared model owners should identify their profile and slot',
);
assert.equal(
  repaired.clearedOwners.filter((owner) => owner.profile === 'latest' && owner.slot === 15).length,
  1,
  'self-row and Configure aliases for one slot should count as one owner',
);
assert.deepEqual(
  [...repaired.changedKeys],
  [
    'shortcutKeyToggleChatWork',
    'shortcutKeyToggleSidebar',
    'modelPickerKeyCodesLatest',
    'modelPickerKeyCodesLegacy',
  ],
);
assert.deepEqual(Object.keys(repaired.patch), [...repaired.changedKeys]);
assert.equal(repaired.snapshot.shortcutKeyToggleChatWork, 'Digit5');
assert.equal(repaired.snapshot.shortcutKeyToggleSidebar, '\u00A0');
assert.equal(repaired.snapshot.modelPickerKeyCodesLatest[15], '');
assert.equal(repaired.snapshot.modelPickerKeyCodesLegacy[9], '');
assert.equal(repaired.snapshot.unrelatedSetting, snapshot.unrelatedSetting);
assert.equal('unrelatedSetting' in repaired.patch, false, 'unrelated settings must not be patched');

const controlModelCodes = makeCodes();
controlModelCodes[15] = 'Digit5';
const modifierSeparated = ModelLabels.normalizeShortcutAssignments({
  shortcuts: [{ storageKey: 'shortcutKeyToggleChatWork', value: 'Digit5', modifier: 'alt' }],
  modelModifier: 'control',
  profiles: { latest: { codes: controlModelCodes, groups: latestGroups } },
});
assert.equal(
  modifierSeparated.profiles.latest[15],
  'Digit5',
  'a Control model binding may reuse an Alt scalar shortcut key',
);

const repeated = ModelLabels.normalizeShortcutAssignments({
  shortcuts: repaired.shortcuts,
  modelModifier: 'alt',
  snapshot: repaired.snapshot,
  profiles: {
    latest: {
      codes: repaired.profiles.latest,
      groups: latestGroups,
      storageKey: 'modelPickerKeyCodesLatest',
    },
    legacy: {
      codes: repaired.profiles.legacy,
      groups: legacyGroups,
      storageKey: 'modelPickerKeyCodesLegacy',
    },
  },
});
assert.equal(repeated.clearedOwners.length, 0, 'a second normalization should make no repairs');
assert.equal(repeated.changedKeys.length, 0, 'a repaired storage snapshot should need no writes');
assert.deepEqual(repeated.profiles.latest, repaired.profiles.latest);
assert.deepEqual(repeated.profiles.legacy, repaired.profiles.legacy);

console.log('shortcut duplicate normalizer fixture passed');
