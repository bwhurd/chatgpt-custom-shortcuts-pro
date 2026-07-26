import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const storageSource = await readFile(new URL('../extension/storage.js', import.meta.url), 'utf8');
const popupSource = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const fixture = JSON.parse(
  await readFile(new URL('./fixtures/settings.json', import.meta.url), 'utf8'),
);

const scrapedStateKeys = [
  'modelCatalog',
  'modelCatalogLatest',
  'modelCatalogLegacy',
  'modelNames',
  'modelNamesAt',
  'modelNamesLatest',
  'modelNamesLatestAt',
  'modelNamesLegacy',
  'modelNamesLegacyAt',
];
const localSettings = {
  shortcutKeyNewConversation: 'KeyN',
  modelPickerKeyCodesLatest: ['Digit1'],
  modelPickerKeyCodesLegacy: ['Digit1'],
  modelPickerKeyCodeProfilesVersion: 1,
  ...Object.fromEntries(scrapedStateKeys.map((key) => [key, `${key}-stale`])),
};
const storageContext = vm.createContext({
  OPTIONS_DEFAULTS: Object.fromEntries(Object.keys(localSettings).map((key) => [key, null])),
  window: {
    optionsStorage: {
      getAll: async () => localSettings,
      setAll: async (settings) => settings,
    },
  },
  chrome: {
    storage: {
      local: {},
      sync: {},
    },
  },
});
vm.runInContext(storageSource, storageContext, { filename: 'cloud-storage-filter.js' });
const cloudPayload = await storageContext.window.CloudStorage.loadLocalSettings();

assert.equal(
  cloudPayload.shortcutKeyNewConversation,
  'KeyN',
  'portable user settings should remain in the Drive payload',
);
assert.deepEqual(
  Array.from(cloudPayload.modelPickerKeyCodesLatest),
  ['Digit1'],
  'Work model shortcut assignments should remain portable user settings',
);
assert.deepEqual(
  Array.from(cloudPayload.modelPickerKeyCodesLegacy),
  ['Digit1'],
  'Chat model shortcut assignments should remain portable user settings',
);
for (const key of scrapedStateKeys) {
  assert.equal(key in cloudPayload, false, `${key} should stay out of Drive settings`);
  assert.equal(key in fixture.data, false, `${key} should stay out of the exported settings fixture`);
}

const popupDefaultsStart = popupSource.indexOf('const DEFAULT_PRESET_DATA = (() =>');
const popupDefaultsEnd = popupSource.indexOf('// Make available everywhere', popupDefaultsStart);
assert.ok(
  popupDefaultsStart >= 0 && popupDefaultsEnd > popupDefaultsStart,
  'popup export allowlist builder should exist',
);
const popupDefaultsSource = popupSource.slice(popupDefaultsStart, popupDefaultsEnd);
const popupScrapeKeysStart = popupSource.indexOf('const MODEL_CATALOG_SCRAPE_STATE_KEYS');
const popupScrapeKeysEnd = popupSource.indexOf('const AUTO_MANAGED_SYNC_KEYS', popupScrapeKeysStart);
assert.ok(
  popupScrapeKeysStart >= 0 && popupScrapeKeysEnd > popupScrapeKeysStart,
  'popup scraped-state exclusion registry should exist',
);
const popupScrapeKeysSource = popupSource.slice(popupScrapeKeysStart, popupScrapeKeysEnd);
for (const key of scrapedStateKeys) {
  assert.match(
    popupScrapeKeysSource,
    new RegExp(`['"]${key}['"]`),
    `${key} should be registered as local-only popup state`,
  );
}
assert.match(
  popupDefaultsSource,
  /\.\.\.MODEL_CATALOG_SCRAPE_STATE_KEYS/,
  'popup backup defaults should exclude the shared scraped-state registry',
);

console.log('scraped model catalog state stays out of local and Drive backups');
