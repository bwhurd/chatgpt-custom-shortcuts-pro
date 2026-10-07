import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(
  new URL('../extension/shared/model-picker-labels.js', import.meta.url),
  'utf8',
);
const context = vm.createContext({ window: {} });
vm.runInContext(source, context);
const labels = context.window.ModelLabels;
const codes = Array.from({ length: 15 }, (_, index) => `Digit${index}`);
const presentedSlots = (groups) =>
  new Set(groups.flatMap((group) => group.actions.map((action) => action.slot)));
const latestPresented = presentedSlots(
  labels.getPopupPresentationGroups('configure-latest', labels.defaultNames(), null),
);
const legacyPresented = presentedSlots(
  labels.getPopupPresentationGroups(
    'configure-latest',
    labels.defaultLegacyNames(),
    labels.getDefaultLegacyCatalog(),
  ),
);
for (const slot of [2, 4, 5, 6, 14]) assert.ok(!latestPresented.has(slot));
for (const slot of [2, 4, 5, 10, 11, 12, 13, 14]) assert.ok(!legacyPresented.has(slot));
assert.ok(legacyPresented.has(6), 'The available legacy o3 slot remains visible');
const latest = labels.filterProfileKeyCodesToCatalog(codes, 'latest');
const legacy = labels.filterProfileKeyCodesToCatalog(codes, 'legacy');

// Missing profile rows are removed, while actions present in the other profile
// and current dynamic/utility rows keep their bindings and fixed slot numbers.
for (const slot of [2, 4, 5, 6, 14]) assert.equal(latest[slot], '');
for (const slot of [2, 4, 5, 10, 11, 12, 13, 14]) assert.equal(legacy[slot], '');
assert.equal(latest[10], 'Digit10', 'Current dynamic model slot survives');
assert.equal(latest[11], 'Digit11', 'Current Extra High action survives');
assert.equal(latest[12], 'Digit12', 'Current Max action survives');
assert.equal(latest[13], 'Digit13', 'Current speed action survives');
assert.equal(legacy[6], 'Digit6', 'Legacy o3 action remains supported');
assert.equal(latest.length, 15);
assert.equal(legacy.length, 15);

const dynamicResetCatalog = {
  integratedEffort: true,
  integratedResetAvailable: true,
  configureOptions: [
    { id: 'configure-latest', label: 'Latest', slot: 3 },
    { id: 'configure-dynamic-example', label: 'Example', slot: 14 },
  ],
  frontendByConfig: {
    'configure-latest': [{ id: 'instant', label: 'Instant', available: true, slot: 0 }],
  },
};
const reset = labels.filterProfileKeyCodesToCatalog(codes, 'latest', dynamicResetCatalog);
assert.equal(reset[14], 'Digit14', 'A catalogue-present reset action keeps the same slot');

const storageSource = await readFile(
  new URL('../extension/options-storage.js', import.meta.url),
  'utf8',
);
let storageConfig;
class OptionsSyncFixture {
  constructor(config) {
    storageConfig = config;
  }
}
OptionsSyncFixture.migrations = { removeUnused() {} };
const storageContext = vm.createContext({
  OptionsSync: OptionsSyncFixture,
  console,
  globalThis: {},
});
vm.runInContext(storageSource, storageContext);
const defaults = storageContext.globalThis.OPTIONS_DEFAULTS;
assert.equal(defaults.modelPickerKeyCodesLatest[14], '');
assert.equal(defaults.modelPickerKeyCodesLegacy[10], '');
assert.equal(defaults.modelPickerKeyCodesLatest[10], 'Digit4');
assert.equal(defaults.modelPickerKeyCodesLatest[11], 'F4');
assert.equal(defaults.modelPickerKeyCodesLegacy[6], 'Digit4');
assert.equal(defaults.modelPickerKeyCodesLegacy[10], '');
assert.equal(defaults.modelPickerKeyCodesLegacy[11], '');
assert.equal(defaults.modelPickerKeyCodesLegacy.length, 15);
assert.equal(defaults.modelPickerKeyCodesLatest.length, 15);
assert.ok(storageConfig.migrations.length > 0);

console.log(
  'Unavailable model slot filtering preserves supported profile/dynamic actions and clears stale defaults.',
);
