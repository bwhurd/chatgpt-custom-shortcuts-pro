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
  en: ['Work Models', 'Chat Models'],
  es: ['Modelos Trabajo', 'Modelos Chat'],
  hi: ['कार्य मॉडल', 'चैट मॉडल'],
  ja: ['作業モデル', 'チャットモデル'],
  ru: ['Рабочие модели', 'Модели чата'],
  uk: ['Робочі моделі', 'Моделі чату'],
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
  assert.equal(
    localeMessages[locale].label_modelTogglesCompact.message,
    'Model Toggles',
    `${locale} should provide the Model Toggles group label`,
  );
});
assert.match(
  popupHtmlSource,
  /class="active i18n"[^>]*aria-selected="true"[\s\S]*?data-model-catalog-profile="legacy">Chat Models<\/button>[\s\S]*?data-model-catalog-profile="latest">Work Models<\/button>/,
  'popup selector should render Chat/legacy first and active before Work/latest',
);
assert.match(
  popupJsSource,
  /window\.__modelCatalogProfile = MODEL_CATALOG_PROFILE_LEGACY/,
  'popup catalog profile should initialize to Chat/legacy',
);
assert.match(
  popupJsSource,
  /window\.MODEL_NAMES = window\.__modelNamesProfiles\[MODEL_CATALOG_PROFILE_LEGACY\]\.slice\(\)/,
  'popup model names should initialize from the Chat/legacy profile',
);

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

const createAdvancedToggleFixture = ({ expanded = false, hasSubmenu = false } = {}) => {
  const attributes = new Map([
    ['role', 'menuitem'],
    ['aria-expanded', expanded ? 'true' : 'false'],
  ]);
  if (hasSubmenu) attributes.set('aria-haspopup', 'menu');
  return {
    getAttribute: (name) => attributes.get(name) ?? null,
    hasAttribute: (name) => attributes.has(name),
  };
};
const collapsedAdvancedToggle = createAdvancedToggleFixture();
const expandedAdvancedToggle = createAdvancedToggleFixture({ expanded: true });
const modelSubmenuTrigger = createAdvancedToggleFixture({ hasSubmenu: true });
assert.equal(
  ModelPickerSelectors.isPillAdvancedToggle(collapsedAdvancedToggle),
  true,
  'the collapsed Advanced control should be recognized structurally',
);
assert.equal(
  ModelPickerSelectors.isPillAdvancedToggleExpanded(collapsedAdvancedToggle),
  false,
  'the collapsed Advanced control should require expansion',
);
assert.equal(
  ModelPickerSelectors.isPillAdvancedToggleExpanded(expandedAdvancedToggle),
  true,
  'an already expanded Advanced control should not be clicked closed',
);
assert.equal(
  ModelPickerSelectors.isPillAdvancedToggle(modelSubmenuTrigger),
  false,
  'model submenus must not be mistaken for the Advanced control',
);
assert.equal(
  ModelPickerSelectors.isPillAdvancedToggle(null),
  false,
  'older pill menus without an Advanced control should remain supported',
);

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
  pillSpeedMenu: true,
  pillResetAvailable: false,
  integratedEffort: true,
  configureOptions,
  frontendByConfig,
  speedByConfig,
};

for (const option of configureOptions) {
  const groups = ModelLabels.getPopupPresentationGroups(option.id, [], liveCatalog);
  const primary = groups.find((group) => group.id === 'primary')?.actions || [];
  const configure = groups.find((group) => group.id === 'configure')?.actions || [];
  const toggles = groups.find((group) => group.id === 'model-toggles');
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
    modelLabels,
    'the second row should contain only the four Work models',
  );
  assert.deepEqual(
    Array.from(toggles?.actions || [], (action) => action.label),
    ['Toggle Chat / Work', 'Toggle Speed'],
    'the third row should keep the shared Chat/Work toggle and the available Work speed utility',
  );
  assert.deepEqual(
    Array.from(toggles?.actions || [], (action) => action.slot),
    [undefined, 13],
    'the normal shortcut should not consume a model slot and Toggle Speed should preserve its slot',
  );
  assert.equal(toggles?.labelI18nKey, 'label_modelTogglesCompact');
}

const compactChatCatalog = {
  ...liveCatalog,
  selectorShape: 'pill-two-submenu',
  pillSpeedMenu: false,
  pillResetAvailable: false,
  speedByConfig: {},
};
const compactChatToggleActions =
  ModelLabels.getPopupPresentationGroups(configureOptions[0].id, [], compactChatCatalog).find(
    (group) => group.id === 'model-toggles',
  )?.actions || [];
assert.deepEqual(
  Array.from(compactChatToggleActions, (action) => action.label),
  ['Toggle Chat / Work'],
  'the compact Chat catalog should not inherit Work Speed or the removed Reset utility',
);

const catalogWithoutObservedReset = { ...liveCatalog };
delete catalogWithoutObservedReset.pillResetAvailable;
const unobservedResetActions =
  ModelLabels.getPopupPresentationGroups(
    configureOptions[0].id,
    [],
    catalogWithoutObservedReset,
  ).find((group) => group.id === 'model-toggles')?.actions || [];
assert.doesNotMatch(
  Array.from(unobservedResetActions, (action) => action.label).join('|'),
  /Reset to default/,
  'Reset must be absent unless the scrape explicitly records that native row',
);
const popupFallbackGroups = popupJsSource.slice(
  popupJsSource.indexOf('const FALLBACK_MODEL_ACTION_GROUPS'),
  popupJsSource.indexOf('const cloneModelActionGroups'),
);
assert.doesNotMatch(
  popupFallbackGroups,
  /Reset to default|reset-default/,
  'the popup fallback must not invent the optional Reset utility before catalog hydration',
);

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
    'Digit6',
    '',
  ],
  'fallback keys should mirror the first grid row with F1-F5 and the second with 1-9',
);

const chatMenuLabels = ['GPT-5.6 Sol', 'GPT-5.5', 'GPT-5.4', 'GPT-5.3'];
const chatMenuShortcutSlots = chatMenuLabels.map((_label, index) =>
  ModelLabels.getPopupShortcutSlotForPosition(
    'configure',
    index,
    ModelLabels.defaultLegacyNames(),
    ModelLabels.getDefaultLegacyCatalog(),
  ),
);
assert.deepEqual(
  Array.from(chatMenuShortcutSlots),
  [3, 8, 9, 6],
  'Chat model rows should retain their own action slots',
);
assert.deepEqual(
  Array.from(
    chatMenuShortcutSlots,
    (slot) => ModelLabels.defaultKeyCodesForProfile('legacy')[slot],
  ),
  ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
  'Chat defaults should match Work positions without sharing their stored slots',
);
assert.equal(
  ModelLabels.getPopupShortcutSlotForPosition(
    'configure',
    4,
    ModelLabels.defaultLegacyNames(),
    ModelLabels.getDefaultLegacyCatalog(),
  ),
  -1,
  'a fifth Chat model position must not borrow the first Work Model Toggles slot',
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
  'Digit6',
  'Digit0',
];
labelsContext.escapeHtml = (value) => String(value);
labelsContext.getMessage = (key, fallback = '') =>
  ({
    section_switch_models: 'Effort',
    label_modelCatalogLatest: 'Latest',
    label_modelCatalogLegacy: 'Legacy',
    label_configureModelsCompact: 'Pick Model',
    label_toggleChatWork: 'Toggle Chat / Work',
  })[key] || fallback;
labelsContext.displayFromCode = (code) =>
  String(code || '')
    .replace(/^Digit/, '')
    .replace(/^Key/, '')
    .toLowerCase();
labelsContext.isAssigned = (code) => !!code;
labelsContext.isMacPlatform = () => false;
labelsContext.shortcutModifierLabel = () => 'Alt + ';
labelsContext.overlayCfg = {
  activeModelConfigId: 'configure-latest',
  shortcutKeyToggleChatWork: 'KeyG',
  modelCatalogLatest: liveCatalog,
  modelNamesLatest: latestNames,
  modelCatalogLegacy: ModelLabels.getDefaultLegacyCatalog(),
  modelNamesLegacy: Array.from(ModelLabels.defaultLegacyNames()),
  modelPickerKeyCodesLatest: overlayCodes,
  modelPickerKeyCodesLegacy: [
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
    '',
    '',
    '',
    '',
    '',
  ],
};
const overlayHelperStart = contentSource.indexOf('const getOverlayModelSlotCount');
const overlayHelperEnd = contentSource.indexOf(
  '// ---- 3) Build overlay HTML',
  overlayHelperStart,
);
assert.ok(overlayHelperStart >= 0 && overlayHelperEnd > overlayHelperStart);
vm.runInContext(
  `${contentSource.slice(overlayHelperStart, overlayHelperEnd)}
globalThis.overlayLegacyMarkup = buildShortcutOverlayModelPickerGrid(overlayCfg);
globalThis.overlayLatestMarkup = buildShortcutOverlayModelPickerGrid(overlayCfg, 'latest');`,
  labelsContext,
  { filename: 'overlay-model-profile-fixture.js' },
);
assert.match(labelsContext.overlayLatestMarkup, /data-model-catalog-profile="latest"/);
assert.match(labelsContext.overlayLatestMarkup, /GPT-5\.6 Sol/);
assert.match(labelsContext.overlayLatestMarkup, /Toggle Chat \/ Work/);
assert.match(labelsContext.overlayLatestMarkup, /Toggle Speed/);
assert.doesNotMatch(labelsContext.overlayLatestMarkup, /Reset to default/);
assert.match(labelsContext.overlayLatestMarkup, /data-group="model-toggles"/);
assert.match(labelsContext.overlayLatestMarkup, />Model Toggles</);
assert.match(labelsContext.overlayLegacyMarkup, /data-model-catalog-profile="legacy"/);
assert.match(
  labelsContext.overlayLegacyMarkup,
  /data-overlay-model-catalog-profile="legacy"[\s\S]*?data-overlay-model-catalog-profile="latest"/,
  'overlay selector should render Chat/legacy before Work/latest',
);
assert.match(
  labelsContext.overlayLegacyMarkup,
  /class="active"[^>]*data-overlay-model-catalog-profile="legacy"/,
  'overlay selector should default to Chat/legacy',
);
assert.match(labelsContext.overlayLegacyMarkup, />5\.5</);
assert.match(labelsContext.overlayLegacyMarkup, />o3</);
assert.match(labelsContext.overlayLegacyMarkup, /data-group="model-toggles"/);
assert.match(labelsContext.overlayLegacyMarkup, /Toggle Chat \/ Work/);
assert.match(
  labelsContext.overlayLegacyMarkup,
  /value="o"/,
  'Chat should display its independently stored fourth-position shortcut',
);
assert.doesNotMatch(
  labelsContext.overlayLegacyMarkup,
  /value="l"/,
  'Chat should not display the Work fourth-position shortcut',
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
  /storageKey[\s\S]*?modelPickerKeyCodesLatest[\s\S]*?modelPickerKeyCodesLegacy[\s\S]*?codes\[action\.slot\]/,
  'the overlay should read the requested profile array at the action slot directly',
);
assert.doesNotMatch(
  overlayProfileSource,
  /getOverlayMirroredSlotsForGridPosition/,
  'the overlay must not relink Chat and Work assignments by visual position',
);
assert.match(
  overlayProfileSource,
  /buildShortcutOverlayModelPickerGrid\(cfg, requestedProfile = OVERLAY_MODEL_PROFILE_LEGACY\)/,
  'each overlay open should default its model grid to Chat/legacy',
);
assert.match(
  overlayProfileSource,
  /data-overlay-model-catalog-profile="legacy"[\s\S]*?data-overlay-model-catalog-profile="latest"/,
  'the overlay should render Chat/legacy before Work/latest',
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
const currentScrapeStart = contentSource.indexOf('const scrapeCurrentModelPickerCatalogOnce');
const currentScrapeEnd = contentSource.indexOf('const scrapeModelCatalogOnce', currentScrapeStart);
assert.ok(currentScrapeStart >= 0 && currentScrapeEnd > currentScrapeStart);
const currentScrapeSource = contentSource.slice(currentScrapeStart, currentScrapeEnd);
assert.match(currentScrapeSource, /data-model-picker-view/);
assert.match(currentScrapeSource, /getActiveModelPickerRows/);
assert.match(currentScrapeSource, /data-model-picker-view-toggle="true"/);
assert.match(currentScrapeSource, /persistScrapedModelCatalog\(catalog, \{ profile/);

const currentActionStart = contentSource.indexOf('const runCurrentModelPickerAction = async (action) => {');
const currentActionEnd = contentSource.indexOf('const ensureIntegratedSimplePicker = async', currentActionStart);
assert.ok(currentActionStart >= 0 && currentActionEnd > currentActionStart);
const currentActionSource = contentSource.slice(currentActionStart, currentActionEnd);
assert.match(currentActionSource, /getActiveModelPickerRows/);
assert.match(currentActionSource, /action\?\.actionKind === 'configure-option'/);
assert.match(currentActionSource, /catalog\?\.configureOptions\?\.find/);
assert.match(currentActionSource, /smartClickSafe\(matches\[0\]\)/);
assert.match(currentActionSource, /getSelection\(\)\?\.model\?\.id === action\.id/);
assert.match(currentActionSource, /data-reasoning-slider="true"/);
assert.match(currentActionSource, /entry\?\.sliderValue/);
assert.match(currentActionSource, /effort\.min \+ effortIndex/);

const modelPickerRunnerSource = contentSource.slice(
  contentSource.indexOf('const ModelPickerActionRunner = (() => {'),
  contentSource.indexOf('const executeModelAction = (action, options = {}) =>'),
);
const currentDispatchIndex = modelPickerRunnerSource.indexOf('runCurrentModelPickerAction(action)');
const legacyDispatchIndex = modelPickerRunnerSource.indexOf(
  'if (dispatchIntegratedEffortAction(action, options, complete))',
  currentDispatchIndex,
);
assert.ok(currentDispatchIndex >= 0 && legacyDispatchIndex > currentDispatchIndex);
assert.match(
  modelPickerRunnerSource.slice(currentDispatchIndex, legacyDispatchIndex),
  /if \(result !== null\)\s*\{\s*complete\(result\);\s*return;/,
  'a recognized current picker should not fall through to legacy menu handling',
);

assert.match(
  contentSource,
  /const getRuntimeModelPickerProfile = \(\) =>[\s\S]*?getNativeChatWorkSurfaceMode\(\)[\s\S]*?getProfileForChatWorkMode\(liveMode\)/,
  'shortcut routing should select the catalog profile from the live Chat or Work surface',
);
assert.match(
  contentSource,
  /function indexFromEvent\(e\)[\s\S]*?activateCurrentRuntimeModelPickerProfile\('shortcut:key'\)[\s\S]*?for \(const slot of currentVisibleSlots\)/,
  'keyboard matching should scan only the active profile slots',
);

console.log('Current Chat/Work model-picker profile and overlay fixture passed.');
