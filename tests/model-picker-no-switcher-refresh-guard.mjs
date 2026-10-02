import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const popupSource = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

// Execute the current refresh boundary instead of asserting retired scraper source text.
const scrapeStart = contentSource.indexOf('const scrapeModelCatalogOnce =');
const scrapeEnd = contentSource.indexOf(
  'const collapseOpenModelPickerUiAfterScrape =',
  scrapeStart,
);
assert.ok(scrapeStart >= 0 && scrapeEnd > scrapeStart, 'current scraper boundary must exist');
async function runScrape({
  pickerVisible = true,
  scanResult = { ok: true },
  scanError = '',
  releaseError = '',
} = {}) {
  const state = { scans: 0, refocuses: 0, profile: '' };
  const context = vm.createContext({
    ModelPickerScrapeSession: { withCatalogUi: async (_hideUi, action) => action() },
    releasePreparedModelConfigSession: async () => {
      if (releaseError) throw new Error(releaseError);
    },
    getVisibleModelMenuButton: () => (pickerVisible ? {} : null),
    scrapeCurrentModelPickerCatalogOnce: async ({ profile }) => {
      state.scans += 1;
      state.profile = profile;
      if (scanError) throw new Error(scanError);
      return scanResult;
    },
    scheduleComposerRefocusAfterModelPicker: () => {
      state.refocuses += 1;
    },
  });
  vm.runInContext(
    contentSource.slice(scrapeStart, scrapeEnd) +
      '\nglobalThis.scrapeOnce = scrapeModelCatalogOnce;',
    context,
  );
  const result = JSON.parse(JSON.stringify(await context.scrapeOnce({ profile: 'latest' })));
  assert.equal(state.refocuses, 1, 'every refresh outcome should schedule composer restoration');
  return { result, state };
}
const missing = await runScrape({ pickerVisible: false });
assert.deepEqual(missing.result, { ok: false, error: 'MODEL_REFRESH_PICKER_NOT_FOUND' });
assert.equal(
  missing.state.scans,
  0,
  'missing picker must stop before scanning or persisting a catalog',
);
const success = await runScrape({
  scanResult: { ok: true, modelCatalog: { entries: ['synthetic-model'] } },
});
assert.deepEqual(success.result, { ok: true, modelCatalog: { entries: ['synthetic-model'] } });
assert.equal(success.state.scans, 1);
assert.equal(success.state.profile, 'latest');
assert.deepEqual(
  (await runScrape({ scanResult: { fallback: true } })).result,
  { ok: false, error: 'MODEL_REFRESH_PICKER_FORMAT_UNSUPPORTED' },
  'unsupported format must not silently try retired refresh scrapers',
);
assert.deepEqual((await runScrape({ scanError: 'MODEL_REFRESH_FAILED' })).result, {
  ok: false,
  error: 'MODEL_REFRESH_FAILED',
});
const cleanupFailure = await runScrape({ releaseError: 'RESTORE_FAILED' });
assert.deepEqual(cleanupFailure.result, { ok: false, error: 'RESTORE_FAILED' });
assert.equal(cleanupFailure.state.scans, 0);

const helpersStart = popupSource.indexOf('const MODEL_CATALOG_NO_SWITCHER_ERROR');
const helpersEnd = popupSource.indexOf('const setModelCatalogScrapeState', helpersStart);
assert.ok(helpersStart >= 0 && helpersEnd > helpersStart, 'popup refresh classifiers must exist');
const popup = vm.createContext({ window: {} });
vm.runInContext(
  popupSource.slice(helpersStart, helpersEnd) +
    '\nglobalThis.outcome = getModelCatalogRefreshOutcome;',
  popup,
);
for (const [result, expected] of [
  [null, 'failed'],
  [{ ok: false, error: 'MODEL_REFRESH_PICKER_NOT_FOUND' }, 'failed'],
  [{ ok: false, noModelSwitcher: true }, 'no-switcher'],
  [{ ok: false, error: 'MODEL_SWITCHER_PILL_NOT_FOUND' }, 'no-switcher'],
  [{ ok: false, error: 'MODEL_SUBMENU_NOT_FOUND' }, 'failed'],
  [{ ok: false, fromChatGptTab: true, error: 'MODEL_SUBMENU_NOT_FOUND' }, 'no-switcher'],
  [{ ok: true }, 'ready'],
  [
    { ok: false, noModelSwitcher: true, profiles: { chat: { ok: true }, work: { ok: false } } },
    'partial',
  ],
])
  assert.equal(
    popup.outcome(result),
    expected,
    'typed outcomes must preserve real failures and usable partial catalogs',
  );
console.log('current model refresh absence, failure, cleanup, and popup outcome guards pass');
