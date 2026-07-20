import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const labelsSource = await readFile(
  new URL('../extension/shared/model-picker-labels.js', import.meta.url),
  'utf8',
);
const selectorsSource = await readFile(
  new URL('../extension/shared/model-picker-selectors.js', import.meta.url),
  'utf8',
);
const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const optionsSource = await readFile(
  new URL('../extension/options-storage.js', import.meta.url),
  'utf8',
);
const popupCssSource = await readFile(new URL('../extension/popup.css', import.meta.url), 'utf8');
const popupHtmlSource = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
const popupJsSource = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const localeCodes = ['en', 'es', 'hi', 'ja', 'ru', 'uk'];
const localeMessages = Object.fromEntries(
  await Promise.all(
    localeCodes.map(async (locale) => [
      locale,
      JSON.parse(
        await readFile(
          new URL(`../extension/_locales/${locale}/messages.json`, import.meta.url),
          'utf8',
        ),
      ),
    ]),
  ),
);

const expectedProfileLabels = {
  en: ['Latest Models', 'Legacy Models'],
  es: ['Modelos nuevos', 'Modelos previos'],
  hi: ['नए मॉडल', 'पुराने मॉडल'],
  ja: ['最新モデル', '旧モデル'],
  ru: ['Новые модели', 'Старые модели'],
  uk: ['Нові моделі', 'Старі моделі'],
};
localeCodes.forEach((locale) => {
  const labels = [
    localeMessages[locale].label_modelCatalogLatest.message,
    localeMessages[locale].label_modelCatalogLegacy.message,
  ];
  assert.deepEqual(labels, expectedProfileLabels[locale], `${locale} profile labels should be translated`);
  labels.forEach((label) => {
    assert.ok(
      Array.from(label).length <= 15,
      `${locale} profile label "${label}" must be 15 Unicode characters or fewer`,
    );
  });
});

const labelsContext = { window: {} };
vm.createContext(labelsContext);
vm.runInContext(labelsSource, labelsContext, {
  filename: 'extension/shared/model-picker-labels.js',
});
const { ModelLabels } = labelsContext.window;

const selectorsContext = { module: { exports: {} } };
vm.createContext(selectorsContext);
vm.runInContext(selectorsSource, selectorsContext, {
  filename: 'extension/shared/model-picker-selectors.js',
});
const ModelPickerSelectors = selectorsContext.module.exports;

const LIVE_PILL_MATRIX = [
  {
    model: 'GPT-5.6 Sol',
    efforts: ['Light', 'Medium', 'High', 'Extra High', 'Max'],
    speeds: ['Standard', 'Fast'],
  },
  {
    model: 'GPT-5.6 Terra',
    efforts: ['Light', 'Medium', 'High', 'Extra High', 'Max'],
    speeds: ['Standard', 'Fast'],
  },
  {
    model: 'GPT-5.6 Luna',
    efforts: ['Light', 'Medium', 'High', 'Extra High', 'Max'],
    speeds: ['Standard', 'Fast'],
  },
  {
    model: 'GPT-5.5',
    efforts: ['Light', 'Medium', 'High', 'Extra High'],
    speeds: ['Standard', 'Fast'],
  },
];

const modelLabels = LIVE_PILL_MATRIX.map((entry) => entry.model);
assert.equal(
  ModelPickerSelectors.classifyPillSubmenuLabels(modelLabels),
  'model',
  'the observed four-row version menu should classify structurally as Model',
);
for (const entry of LIVE_PILL_MATRIX) {
  assert.equal(
    ModelPickerSelectors.classifyPillSubmenuLabels(entry.efforts),
    'effort',
    `${entry.model} effort rows should classify structurally as Effort`,
  );
  assert.equal(
    ModelPickerSelectors.classifyPillSubmenuLabels(entry.speeds),
    'speed',
    `${entry.model} two-row non-model menu should classify structurally as Speed`,
  );
}
assert.equal(
  ModelPickerSelectors.classifyPillSubmenuLabels(['Ligero', 'Medio', 'Alto', 'Muy alto', 'Máximo']),
  'effort',
  'effort submenu classification should depend on row shape rather than English text',
);
assert.equal(
  ModelPickerSelectors.classifyPillSubmenuLabels(['Normal', 'Rápido']),
  'speed',
  'speed submenu classification should depend on row shape rather than English text',
);

const configureOptions = LIVE_PILL_MATRIX.map((entry, index) => {
  const action = ModelLabels.getModelNameActionForLabelInList(
    entry.model,
    index,
    modelLabels,
  );
  return { id: action.id, slot: action.slot, label: entry.model };
});
const frontendByConfig = {};
const speedByConfig = {};
LIVE_PILL_MATRIX.forEach((entry, index) => {
  const configId = configureOptions[index].id;
  frontendByConfig[configId] = entry.efforts.map((label, effortIndex) => {
    const id = ModelLabels.mapFrontendLabelToActionId(label, configId);
    const action = ModelLabels.getActionById(id);
    return {
      id,
      slot: action.slot,
      label,
      available: true,
      selected: effortIndex === 0,
    };
  });
  speedByConfig[configId] = entry.speeds.map((label, speedIndex) => ({
    id: ModelLabels.mapSpeedLabelToId(label),
    label,
    available: true,
    selected: speedIndex === 0,
  }));
});

const liveCatalog = {
  version: 4,
  selectorShape: 'pill-three-submenu',
  pillMenu: true,
  integratedEffort: true,
  configureOptions,
  frontendByConfig,
  speedByConfig,
};

for (const option of configureOptions) {
  const groups = ModelLabels.getPopupPresentationGroups(option.id, [], liveCatalog);
  const primary = groups.find((group) => group.id === 'primary')?.actions || [];
  const configure = groups.find((group) => group.id === 'configure')?.actions || [];
  const observed = LIVE_PILL_MATRIX.find((entry) => entry.model === option.label);

  assert.deepEqual(
    Array.from(primary, (action) => action.label),
    observed.efforts,
    `${option.label} should render every observed effort state`,
  );
  assert.ok(
    primary.every((action) => action.actionKind === 'pill-effort'),
    `${option.label} effort actions should route through the pill submenu`,
  );
  assert.deepEqual(
    Array.from(configure, (action) => action.label),
    [
      ...modelLabels,
      'Toggle Speed (Normal / Fast)',
      'Reset to default',
    ],
    'the second row should contain all four models followed by the two requested utilities',
  );
  assert.deepEqual(
    Array.from(configure.slice(-2), (action) => action.slot),
    [13, 14],
    'the utility actions should own the two far-right second-row slots',
  );
}

const defaultGroups = ModelLabels.getPopupPresentationGroups(
  'configure-dynamic-gpt-5-6-luna',
  [],
  liveCatalog,
);
const defaultCodes = ModelLabels.buildDefaultKeyCodesFromPresentationGroups(defaultGroups);
assert.deepEqual(
  Array.from(defaultCodes),
  [
    'F1',
    'F2',
    '',
    'Digit1',
    '',
    '',
    '',
    'F3',
    'Digit2',
    'Digit3',
    'Digit4',
    'F4',
    'F5',
    'Digit5',
    'Digit6',
  ],
  'fallback keys should mirror the first grid row with F1-F5 and the second with 1-9',
);

const chatMenuLabels = ['GPT-5.6 Sol', 'GPT-5.5', 'GPT-5.4', 'GPT-5.3', 'o3'];
const chatMenuShortcutSlots = chatMenuLabels.map((_label, index) =>
  ModelLabels.getPopupShortcutSlotForPosition('configure', index, [], liveCatalog),
);
assert.deepEqual(
  Array.from(chatMenuShortcutSlots),
  [3, 8, 9, 10, 13],
  'Chat-mode model rows should use the same canonical Latest-grid positions shown by the popup',
);
assert.deepEqual(
  Array.from(chatMenuShortcutSlots, (slot) => defaultCodes[slot]),
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'],
  'Chat-mode model hints should remain one-to-one even when legacy model action slots are reordered',
);

const latestNames = new Array(ModelLabels.MAX_SLOTS).fill('');
configureOptions.forEach((option) => {
  latestNames[option.slot] = option.label;
});
const overlayCodes = [
  'F1',
  'F2',
  '',
  'Digit1',
  '',
  '',
  'KeyO',
  'F3',
  'Digit2',
  'Digit3',
  'KeyL',
  'F4',
  'F5',
  'Digit5',
  'Digit6',
];
labelsContext.window.__modelPickerKeyCodes = overlayCodes;
labelsContext.escapeHtml = (value) => String(value);
labelsContext.getMessage = (key, fallback = '') =>
  ({
    section_switch_models: 'Effort',
    label_modelCatalogLatest: 'Latest',
    label_modelCatalogLegacy: 'Legacy',
    label_configureModelsCompact: 'Pick Model',
  })[key] || fallback;
labelsContext.displayFromCode = (code) =>
  String(code || '')
    .replace(/^Digit/, '')
    .replace(/^Key/, '')
    .toLowerCase();
labelsContext.isAssigned = (code) => !!code;
labelsContext.isMacPlatform = () => false;
labelsContext.overlayCfg = {
  activeModelConfigId: 'configure-latest',
  modelCatalogLatest: liveCatalog,
  modelNamesLatest: latestNames,
  modelCatalogLegacy: ModelLabels.getDefaultLegacyCatalog(),
  modelNamesLegacy: Array.from(ModelLabels.defaultLegacyNames()),
};
const overlayHelperStart = contentSource.indexOf('const getOverlayModelSlotLimit');
const overlayHelperEnd = contentSource.indexOf(
  '// ---- 3) Build overlay HTML',
  overlayHelperStart,
);
assert.ok(overlayHelperStart >= 0 && overlayHelperEnd > overlayHelperStart);
vm.runInContext(
  `${contentSource.slice(overlayHelperStart, overlayHelperEnd)}
globalThis.overlayLatestMarkup = buildShortcutOverlayModelPickerGrid(overlayCfg);
globalThis.overlayLegacyMarkup = buildShortcutOverlayModelPickerGrid(overlayCfg, 'legacy');`,
  labelsContext,
  { filename: 'overlay-model-profile-fixture.js' },
);
assert.match(labelsContext.overlayLatestMarkup, /data-model-catalog-profile="latest"/);
assert.match(labelsContext.overlayLatestMarkup, /GPT-5\.6 Sol/);
assert.match(labelsContext.overlayLatestMarkup, /Toggle Speed \(Normal \/ Fast\)/);
assert.match(labelsContext.overlayLatestMarkup, /Reset to default/);
assert.match(labelsContext.overlayLegacyMarkup, /data-model-catalog-profile="legacy"/);
assert.match(labelsContext.overlayLegacyMarkup, />5\.5</);
assert.match(labelsContext.overlayLegacyMarkup, />o3</);
assert.match(
  labelsContext.overlayLegacyMarkup,
  /value="l"/,
  'Legacy should display the canonical Latest fourth-position shortcut',
);
assert.doesNotMatch(
  labelsContext.overlayLegacyMarkup,
  /value="o"/,
  'Legacy should not render its stale fourth-position slot assignment',
);

const legacyGroups = ModelLabels.getPopupPresentationGroups('configure-latest', [], {
  version: 3,
  integratedEffort: true,
  configureOptions: [{ id: 'configure-latest', slot: 3, label: '5.5' }],
  frontendByConfig: {
    'configure-latest': [{ id: 'instant', slot: 0, label: 'Instant', available: true }],
  },
});
assert.deepEqual(
  Array.from(
    legacyGroups.find((group) => group.id === 'configure')?.actions || [],
    (action) => action.label,
  ),
  ['5.5'],
  'the existing integrated scraper catalog should remain a utility-free fallback',
);

const pillIndex = contentSource.indexOf('const pillResult = await scrapePillModelCatalogOnce()');
const integratedIndex = contentSource.indexOf(
  'const integratedResult = await scrapeIntegratedModelCatalogOnce()',
);
const legacyIndex = contentSource.indexOf("error: 'CONFIGURE_ITEM_NOT_FOUND'");
assert.ok(pillIndex >= 0, 'content should define the new primary pill scrape call');
assert.ok(
  pillIndex < integratedIndex && integratedIndex < legacyIndex,
  'scrape order should be pill first, integrated second, Configure dialog last',
);
assert.match(
  contentSource,
  /window\.__cspOpenModelPickerMainMenu = openModelPickerMainMenu/,
  'pill refresh and Show model picker should share one main-menu opener',
);
assert.match(
  contentSource,
  /const waitForPillMainMenuFromShortcut = async \(\) =>[\s\S]*?window\.__cspOpenModelPickerMainMenu\(\)/,
  'pill refresh should use the shared working main-menu opener',
);
assert.match(
  contentSource,
  /const controlledId = trigger\.getAttribute\('aria-controls'\)/,
  'each pill submenu should be resolved from its trigger aria-controls relationship',
);
assert.match(
  contentSource,
  /const MODEL_MENU_ITEM_SELECTOR =\s*\n\s*':scope :is\(\[role="menuitem"\]/,
  'menu row discovery must not impose a fixed wrapper-depth limit',
);
assert.doesNotMatch(
  contentSource.slice(
    contentSource.indexOf('const MODEL_MENU_ITEM_SELECTOR'),
    contentSource.indexOf('const THINKING_EFFORT_OPTION_IDS'),
  ),
  /:scope > \* > \*/,
  'the new six-level pill hierarchy must not use the historical two-wrapper selector',
);
assert.match(
  contentSource,
  /const PILL_EFFORT_ACTION_IDS_BY_ROW = Object\.freeze\(\[[\s\S]*?'effort-max'/,
  'pill effort states should be mapped by structural row order, not localized labels',
);
assert.match(
  contentSource,
  /const PILL_SPEED_IDS_BY_ROW = Object\.freeze\(\['speed-standard', 'speed-fast'\]\)/,
  'pill speed states should be mapped by structural row order, not localized labels',
);
assert.doesNotMatch(
  contentSource.slice(
    contentSource.indexOf('const PILL_EFFORT_ACTION_IDS_BY_ROW'),
    contentSource.indexOf('const getPillMenuInventory'),
  ),
  /mapFrontendLabelToActionId|mapSpeedLabelToId|label\.toLowerCase\(\)/,
  'pill scrape state detection must not depend on English labels',
);
assert.match(
  contentSource,
  /const scrapePillModelCatalogOnce = async \(\) =>[\s\S]*?await waitForPillMainMenuFromShortcut\(\)/,
  'the primary pill scrape must await the shortcut opener before inventorying menus',
);
assert.match(contentSource, /runPillSpeedToggleAction/);
assert.match(contentSource, /runPillResetAction/);
assert.match(contentSource, /speedByConfig/);
const pillHintSource = contentSource.slice(
  contentSource.indexOf('function getOpenPillSubmenuByKind'),
  contentSource.indexOf('function applyConfigureFrontendRowHints'),
);
assert.match(
  pillHintSource,
  /getPillSubmenuTriggers\(mainMenu\)[\s\S]*?getOpenPillSubmenuForTrigger\(trigger\)[\s\S]*?classifyPillSubmenu\(menu\)/,
  'pill hints should resolve the open submenu through structural trigger/menu relationships',
);
assert.match(
  pillHintSource,
  /getPopupPresentationGroups[\s\S]*?group\?\.id === 'primary'/,
  'pill Effort hints should reuse the shared popup action order and slots',
);
assert.match(
  pillHintSource,
  /getModelActionById\('toggle-speed'\)[\s\S]*?getPillRadioItems\(menu\)/,
  'both structural Speed rows should show the existing toggle-speed shortcut',
);
assert.doesNotMatch(
  pillHintSource,
  /textContent\s*[!=]==?\s*['"](?:Effort|Speed)|querySelector\([^)]*text/i,
  'pill hint selectors must not target localized Effort or Speed text',
);
assert.match(
  contentSource,
  /applyModelSelectorThinkingEffortMenuHints\(\)[\s\S]*?applyModelVersionSubmenuHints\(\)[\s\S]*?applyPillEffortSubmenuHints\(\)[\s\S]*?applyPillSpeedSubmenuHints\(\)/,
  'legacy and pill menu hint paths should remain active together',
);
assert.match(
  contentSource,
  /applyModelVersionSubmenuHints[\s\S]*?getLatestPopupShortcutSlotForPosition\(\s*'configure',\s*index/,
  'model submenu hints should use the popup canonical grid position instead of stale per-label slots',
);
assert.match(
  contentSource,
  /new Set\(\[\.\.\.getLatestPopupShortcutSlots\(\), \.\.\.currentVisibleSlots\]\)/,
  'keyboard matching should include the canonical popup slots used by positional model hints',
);
assert.match(
  contentSource,
  /const openSurfaceIds = new WeakMap\(\)[\s\S]*?function getOpenSurfaceSignature\(\)[\s\S]*?new MutationObserver\(scheduleWhenOpenSurfaceChanges\)/,
  'hint scheduling should detect submenu identity changes even when the number of open menus is unchanged',
);

const overlayProfileSource = contentSource.slice(
  contentSource.indexOf('const OVERLAY_MODEL_PROFILE_LATEST'),
  contentSource.indexOf('// ---- 5) Read settings and open overlay'),
);
assert.match(overlayProfileSource, /cfg\?\.modelCatalogLatest/);
assert.match(overlayProfileSource, /cfg\?\.modelCatalogLegacy/);
assert.match(overlayProfileSource, /cfg\?\.modelNamesLatest/);
assert.match(overlayProfileSource, /cfg\?\.modelNamesLegacy/);
assert.match(
  overlayProfileSource,
  /getOverlayMirroredSlotsForGridPosition[\s\S]*?OVERLAY_MODEL_PROFILE_LATEST[\s\S]*?OVERLAY_MODEL_PROFILE_LEGACY/,
  'the overlay should resolve shortcut display slots in deterministic Latest-then-Legacy order',
);
assert.match(
  overlayProfileSource,
  /buildShortcutOverlayModelPickerGrid\(cfg, requestedProfile = OVERLAY_MODEL_PROFILE_LATEST\)/,
  'each overlay open should default its model grid to Latest',
);
assert.match(
  overlayProfileSource,
  /data-overlay-model-catalog-profile="latest"[\s\S]*?data-overlay-model-catalog-profile="legacy"/,
  'the overlay should render both profile tabs',
);
assert.match(
  overlayProfileSource,
  /wireShortcutOverlayModelProfileSelector[\s\S]*?root\.replaceWith\(replacement\)[\s\S]*?wireShortcutOverlayModelProfileSelector\(shadow, cfg\)/,
  'the overlay profile tabs should replace and rewire the model grid in place',
);

assert.match(
  popupCssSource,
  /\.p-segmented-controls\.p-segmented-radius :is\(a, button\)\.active\s*{\s*color: #fff;/,
  'both anchor and button segmented controls should use the same visible active text color',
);
assert.match(
  popupCssSource,
  /\.p-segmented-controls\.mp-model-catalog-profile-selector\s*{[\s\S]*?height: 22px;[\s\S]*?left: -12px;[\s\S]*?position: absolute;[\s\S]*?top: -2px;/,
  'the Latest/Legacy pill should align to the model grid while retaining its vertical position',
);
assert.match(
  popupCssSource,
  /--color-segmented: #003f7a;/,
  'segmented-control borders and active backgrounds should match the active model-row color',
);
assert.match(
  popupCssSource,
  /\.p-segmented-controls:is\(#mp-model-switcher-modifier-selector, \.mp-model-catalog-profile-selector\)\s+:is\(a, button\)\s*{[\s\S]*?padding: 0 11px;[\s\S]*?font-family: var\(--popup-font-stack\);[\s\S]*?font-size: 14px;/,
  'both segmented selectors should share the same typography and proportional padding',
);
assert.match(
  popupHtmlSource,
  /height: 22px;[\s\S]*?transform: translate\(8px, -11px\);/,
  'the Use Alt/Use Control pill should move upward 11px',
);
assert.match(
  popupHtmlSource,
  /align-items: flex-start;[\s\S]*?height: 44px; line-height: 26px;[\s\S]*?top: 24px;">Effort/,
  'the popup Effort label and model-grid edge should move down 18px below the selectors',
);
assert.match(
  contentSource,
  /\.overlay-model-catalog-heading\s*{[\s\S]*?min-height: 44px;[\s\S]*?position: relative;[\s\S]*?\.overlay-model-catalog-heading > span\s*{[\s\S]*?top: 25px;/,
  'the overlay should mirror the popup header separation',
);
assert.match(
  contentSource,
  /\.overlay-model-catalog-heading \.p-segmented-controls\.mp-model-catalog-profile-selector\s*{[\s\S]*?--color-segmented: #003f7a;[\s\S]*?border-radius: 30px;[\s\S]*?left: 0;[\s\S]*?position: absolute;/,
  'the overlay profile selector should carry its full pill styling and align to the model grid independently of popup padding',
);
assert.match(
  contentSource,
  /\.overlay-model-catalog-heading \.p-segmented-controls\.mp-model-catalog-profile-selector button\s*{[\s\S]*?font-size: 14px;[\s\S]*?padding: 0 11px;[\s\S]*?button\.active\s*{[\s\S]*?background: var\(--color-segmented\);[\s\S]*?color: #fff;/,
  'the overlay profile tabs should mirror the popup typography, spacing, and active treatment',
);
assert.match(
  contentSource,
  /function getUniqueVisibleMenuItemForSlot\(slot, root = document\)[\s\S]*?const expectedHint = `\$\{MOD_KEY_TEXT\}\+\$\{keyLabel\}`;[\s\S]*?scope\.querySelectorAll\(`\.\$\{HINT_CLASS\}`\)[\s\S]*?openMenus\.has\(menu\)[\s\S]*?return matches\.size === 1 \? matches\.values\(\)\.next\(\)\.value : null;/,
  'an exposed menu should resolve an exact language-agnostic shortcut hint only when it labels one visible item',
);
const modelPickerRunnerSource = contentSource.slice(
  contentSource.indexOf('const ModelPickerActionRunner = (() => {'),
  contentSource.indexOf('const executeModelAction = (action, options = {}) =>'),
);
assert.match(
  modelPickerRunnerSource,
  /async function findHintedTargetAfterOpeningMenus\(sourceSlot\)[\s\S]*?typeof window\.toggleModelSelector === 'function'[\s\S]*?window\.toggleModelSelector\(\);[\s\S]*?window\.__cspOpenModelPickerMainMenu\(\);[\s\S]*?getUniqueVisibleMenuItemForSlot\([\s\S]*?sourceSlot,[\s\S]*?mainMenu,[\s\S]*?getPillSubmenuTriggers\(mainMenu\)[\s\S]*?openPillSubmenu\(trigger\)[\s\S]*?getUniqueVisibleMenuItemForSlot\(sourceSlot, submenu\)/,
  'one shortcut press should expose first-level and submenu hints before choosing the exact labeled item',
);
assert.doesNotMatch(
  modelPickerRunnerSource,
  /shouldScanSubmenus|\['pill-effort', 'configure-option'\]\.includes/,
  'every canonical popup slot should be allowed to scan submenus because tab mirroring can pair it with a different legacy action',
);
const modelPickerExecuteSource = modelPickerRunnerSource.slice(
  modelPickerRunnerSource.indexOf('function execute(action, options = {})'),
);
assert.ok(
  modelPickerExecuteSource.indexOf(
    'if (dispatchVisibleHintedMenuAction(action, options, complete))',
  ) <
    modelPickerExecuteSource.indexOf(
      'dispatchActionWithoutVisibleHint(action, options, complete);',
    ),
  'the visible hinted item must win before Work-mode pill submenu routing',
);
assert.match(
  popupHtmlSource,
  /id="mp-model-switcher-modifier-selector" class="p-segmented-controls p-segmented-radius"/,
  'the modifier segmented control should have a stable explicit owner ID',
);
const modifierInitializerSource = popupJsSource.slice(
  popupJsSource.indexOf('function initModelSwitcherToggle()'),
  popupJsSource.indexOf('// Initialize when DOM is ready'),
);
assert.match(
  modifierInitializerSource,
  /document\.getElementById\('mp-model-switcher-modifier-selector'\)/,
  'Alt/Control wiring should target its explicit control',
);
assert.doesNotMatch(
  modifierInitializerSource,
  /document\.querySelector\('\.p-segmented-controls'\)/,
  'Alt/Control wiring must not depend on being the first segmented control',
);
assert.match(
  contentSource,
  /function createCompletion\(action, options\)[\s\S]*?shouldRefocusComposerAfterModelAction\(action\)[\s\S]*?scheduleComposerRefocusAfterModelPicker\(\)/,
  'successful model-picker actions should refocus the composer through shared completion',
);
assert.match(
  contentSource,
  /const scrapeModelCatalogOnce = async[\s\S]*?finally\s*{\s*scheduleComposerRefocusAfterModelPicker\(\);\s*}/,
  'catalog refresh should refocus the composer in cleanup on every exit path',
);
assert.match(
  optionsSource,
  /arr\.every\(\(value, index\) => value === legacyIntegratedDefaults\[index\]\)/,
  'storage migration should reseed only the exact untouched legacy default layout',
);

console.log('model picker three-submenu pill matrix is fully wired');
