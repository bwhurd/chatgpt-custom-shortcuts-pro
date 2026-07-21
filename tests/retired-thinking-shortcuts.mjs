import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const readExtensionFile = (path) =>
  readFile(new URL(`../extension/${path}`, import.meta.url), 'utf8');

const [contentSource, metadataSource, optionsSource, popupHtmlSource, popupJsSource, schemaSource] =
  await Promise.all([
    readExtensionFile('content.js'),
    readExtensionFile('shared/shortcut-action-metadata.js'),
    readExtensionFile('options-storage.js'),
    readExtensionFile('popup.html'),
    readExtensionFile('popup.js'),
    readExtensionFile('settings-schema.js'),
  ]);

const retiredKeys = ['shortcutKeyThinkingStandard', 'shortcutKeyThinkingExtended'];

retiredKeys.forEach((key) => {
  assert.doesNotMatch(popupHtmlSource, new RegExp(`id=["']${key}["']`));
});
assert.doesNotMatch(popupJsSource, /MANUAL_REFRESH_THINKING_SHORTCUT_DEFAULTS/);
assert.doesNotMatch(popupJsSource, /cspThinkingShortcutsManualSeededV1/);

const overlaySource = contentSource.slice(
  contentSource.indexOf('const EFFORT_SHORTCUT_LAYOUT'),
  contentSource.indexOf('// ---- 5) Read settings and open overlay'),
);
retiredKeys.forEach((key) => {
  assert.doesNotMatch(overlaySource, new RegExp(key));
  assert.match(metadataSource, new RegExp(`notApplicable\\(['"]${key}['"]`));
});

const schemaContext = { window: {} };
schemaContext.globalThis = schemaContext.window;
vm.createContext(schemaContext);
vm.runInContext(schemaSource, schemaContext, { filename: 'extension/settings-schema.js' });
const shortcutSchema = schemaContext.window.CSP_SETTINGS_SCHEMA.shortcuts;
const overlayKeys = shortcutSchema.overlaySections.flatMap((section) => section.keys || []);
retiredKeys.forEach((key) => {
  assert.ok(shortcutSchema.deprecatedShortcutKeys.includes(key));
  assert.ok(!Object.hasOwn(shortcutSchema.labelI18nByKey, key));
  assert.ok(!overlayKeys.includes(key));
});

let optionsConfig;
function OptionsSync(config) {
  optionsConfig = config;
}
OptionsSync.migrations = { removeUnused() {} };
const optionsContext = { console, OptionsSync };
optionsContext.globalThis = optionsContext;
vm.createContext(optionsContext);
vm.runInContext(optionsSource, optionsContext, { filename: 'extension/options-storage.js' });

const stored = {
  ...optionsConfig.defaults,
  shortcutKeyThinkingStandard: 'Digit8',
  shortcutKeyThinkingExtended: 'Digit9',
};
optionsConfig.migrations.forEach((migration) => migration(stored, optionsConfig.defaults));
retiredKeys.forEach((key) => {
  assert.equal(stored[key], '\u00A0', `${key} should migrate to the cleared NBSP value`);
});

console.log('retired standalone Thinking shortcuts stay hidden, inert, and cleared');
