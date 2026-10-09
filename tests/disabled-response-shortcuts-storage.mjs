import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const [schema, options, popup, cloud, manifest, analytics] = await Promise.all(
  [
    'extension/settings-schema.js',
    'extension/options-storage.js',
    'extension/popup.js',
    'extension/storage.js',
    'extension/manifest.json',
    'extension/analytics.js',
  ].map((path) => readFile(new URL(path, root), 'utf8')),
);
const disabled = ['shortcutKeyPreviousThread', 'shortcutKeyNextThread'];
let optionsConfig;
function OptionsSync(config) {
  optionsConfig = config;
}
OptionsSync.migrations = { removeUnused() {} };
vm.runInNewContext(options, { console, OptionsSync });
for (const key of disabled) {
  assert.ok(!Object.hasOwn(optionsConfig.defaults, key));
  assert.ok(!popup.includes(key), `${key} remains in popup defaults/import logic`);
}
// Both backup boundaries derive their allowlists from the remaining defaults.
assert.match(cloud, /new Set\(Object\.keys\(globalThis\.OPTIONS_DEFAULTS/);
assert.match(popup, /const base = globalThis\.OPTIONS_DEFAULTS/);
assert.match(popup, /const OPTION_KEYS = Object\.keys\(DEFAULT_PRESET_DATA\)/);
assert.ok(
  JSON.parse(manifest.replace(/^\uFEFF/, '')).content_scripts.some((entry) =>
    entry.js.includes('settings-schema.js'),
  ),
);

for (const values of [
  ['j', ';'],
  ['KeyQ', 'F8'],
]) {
  const stored = {
    shortcutKeyPreviousThread: values[0],
    shortcutKeyNextThread: values[1],
    shortcutKeySearchWeb: 'KeyJ',
    modelPickerKeyCodesLegacy: ['F1', 'Digit2'],
    unrelatedCloudBackup: 'keep',
  };
  const preserved = structuredClone(stored);
  for (const key of disabled) delete preserved[key];
  let removals = 0;
  const context = {
    console,
    chrome: {
      storage: {
        sync: {
          remove(keys, callback) {
            assert.deepEqual(Array.from(keys), disabled);
            for (const key of keys) delete stored[key];
            removals += 1;
            callback();
          },
        },
      },
      runtime: {},
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(schema, context);
  assert.deepEqual(stored, preserved, 'content bootstrap must persist a narrow cleanup');
  vm.runInContext(schema, context);
  assert.deepEqual(stored, preserved, 'cleanup must be idempotent');
  assert.equal(removals, 2);
  const migrated = { ...preserved, ...Object.fromEntries(disabled.map((key) => [key, 'KeyA'])) };
  for (const migration of optionsConfig.migrations) migration(migrated, optionsConfig.defaults);
  for (const key of disabled) assert.ok(!Object.hasOwn(migrated, key));
}
const storeKey = 'csp_usage_analytics_v1';
const fixedNow = Date.parse('2026-10-09T12:00:00Z');
class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [fixedNow]));
  }

  static now() {
    return fixedNow;
  }
}
const createStorageArea = (storedValues) => ({
  get(defaults, callback) {
    callback(
      Object.fromEntries(
        Object.entries(defaults).map(([key, fallback]) => [
          key,
          Object.hasOwn(storedValues, key) ? storedValues[key] : fallback,
        ]),
      ),
    );
  },
});
const analyticsContext = vm.createContext({
  Date: FixedDate,
  chrome: {
    runtime: { getManifest: () => ({ version: 'test' }) },
    storage: {
      local: createStorageArea({
        [storeKey]: {
          schemaVersion: 1,
          buckets: {
            '2026-10-09': {
              shortcuts: {
                shortcutKeyPreviousThread: 4,
                shortcutKeyNextThread: 3,
                shortcutKeyNewConversation: 2,
              },
              totalShortcutUses: 9,
            },
            '2026-10-08': {
              shortcuts: {
                shortcutKeyPreviousThread: 4,
                shortcutKeyNextThread: 3,
              },
              totalShortcutUses: 7,
            },
            '2026-10-07': { shortcuts: {}, totalShortcutUses: 7 },
          },
          lastFlushAttemptAt: 0,
          lastFlushAt: 0,
          lastFlushDay: '',
        },
      }),
      sync: createStorageArea({
        shortcutKeyPreviousThread: 'Alt+ArrowUp',
        shortcutKeyNextThread: 'Alt+ArrowDown',
      }),
    },
  },
  console,
});
vm.runInNewContext(analytics, analyticsContext, { filename: 'extension/analytics.js' });

const report = await analyticsContext.CSPUsageAnalytics.buildReport();
const navigation = report.groupRows.find((row) => row.group === 'navigation');
assert.equal(navigation.count, 2, 'retired counters do not contribute to navigation usage');
assert.equal(navigation.bucket, '2_5');
assert.equal(report.daysObserved, 1, 'only days with current shortcut usage are observed');
assert.equal(report.usageSummary.days_observed_7d, 1);
assert.equal(report.totalShortcutUses, 2);
assert.equal(report.distinctShortcutsUsed, 1);
assert.equal(report.usageSummary.distinct_shortcuts_used_7d, 1);
assert.equal(report.usageSummary.total_shortcut_uses_7d_bucket, '2_5');
for (const key of disabled) {
  assert.equal(
    report.shortcutRows.some((row) => row.key === key),
    false,
  );
  assert.equal(
    report.actionRows.some((row) => row.actionId === key),
    false,
  );
}
assert.equal(Object.hasOwn(report.settingsSummary, 's_previous_thread'), false);
assert.equal(Object.hasOwn(report.settingsSummary, 's_next_thread'), false);
assert.equal(Object.hasOwn(report.usageSummary, 'u_previous_thread'), false);
assert.equal(Object.hasOwn(report.usageSummary, 'u_next_thread'), false);
console.log('Disabled response shortcuts are removed from storage and historical report surfaces.');
