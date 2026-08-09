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
const overlayHelperStart = contentSource.indexOf('const getOverlayModelSlotLimit');
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

const pillIndex = contentSource.indexOf(
  'const pillResult = await scrapePillModelCatalogOnce({ profile })',
);
const integratedIndex = contentSource.indexOf(
  'const integratedResult = await scrapeIntegratedModelCatalogOnce({ profile })',
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
  /const waitForPillMainMenuFromShortcut = async \(\) =>[\s\S]*?window\.__cspOpenModelPickerMainMenu\(\)[\s\S]*?ensurePillAdvancedOptionsExpanded\(opened\)/,
  'pill refresh should use the shared main-menu opener and expand Advanced before returning',
);
const pillAdvancedSource = contentSource.slice(
  contentSource.indexOf('const getPillAdvancedToggle ='),
  contentSource.indexOf('const getOpenPillSubmenuForTrigger ='),
);
assert.match(
  pillAdvancedSource,
  /getPillAdvancedToggle\(mainMenu\)[\s\S]*?!isPillAdvancedToggleExpanded\(initialToggle\)[\s\S]*?smartClickSafe\(initialToggle\)/,
  'a collapsed Advanced control should be clicked before submenu work begins',
);
assert.match(
  pillAdvancedSource,
  /getPillSubmenuTriggers\(current\)\.length >= 2 \? current : null/,
  'Advanced expansion should wait until the required Model and Effort triggers are ready',
);
assert.doesNotMatch(
  pillAdvancedSource,
  /['"](?:Advanced|Show advanced options|Show compact options)['"]/,
  'Advanced expansion must not depend on localized control text',
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
assert.match(
  contentSource,
  /const getPillSpeedTriggerFromCurrentOrder = \(mainMenu\) =>[\s\S]*?triggers\.length === 3 \? triggers\[2\] : null/,
  'the current three-submenu pill should expose Speed through its verified third structural trigger',
);
assert.match(
  contentSource,
  /const getPillModelTriggerFromCurrentOrder = \(mainMenu\) =>[\s\S]*?triggers\.length >= 2 \? triggers\[0\] : null/,
  'both current compact pills should expose Model through their verified first structural trigger',
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
  /const scrapePillModelCatalogOnce = async \(\{ profile = '' \} = \{\}\) =>[\s\S]*?await waitForPillMainMenuFromShortcut\(\)/,
  'the primary pill scrape must await the shortcut opener before inventorying menus',
);
assert.match(
  contentSource,
  /const getPillMenuInventory = async \(\) => \{[\s\S]*?ensurePillAdvancedOptionsExpanded\(getOpenPillMainMenu\(\)\)/,
  'every full pill inventory should independently enforce Advanced expansion',
);
assert.match(
  contentSource,
  /const getPillMenuInventory = async \(\) =>[\s\S]*?triggers\.model && triggers\.effort \? \{ main, triggers \} : null/,
  'compact pill inventory should require Model and Effort while allowing Speed to be absent on Chat',
);
assert.match(
  contentSource,
  /const expectedTypes = \['model', 'effort', 'speed'\][\s\S]*?expectedType === 'effort' && type/,
  'submenu discovery should use structural order so a two-row Effort menu is not mistaken for Speed',
);
assert.match(
  contentSource,
  /selectorShape: hasSpeedMenu \? 'pill-three-submenu' : 'pill-two-submenu'[\s\S]*?pillSpeedMenu: hasSpeedMenu[\s\S]*?pillResetAvailable: hasResetItem/,
  'scraped catalogs should persist the observed two-versus-three submenu and reset capabilities',
);
assert.match(
  contentSource,
  /const selectHybridModelNameDuringScrape = async \(action\) => \{[\s\S]*?selectPillModelNameDuringScrape\(action\)[\s\S]*?selectIntegratedModelNameDuringScrape\(action\)/,
  'a Chat scrape should switch models through either menu shape when o3 changes the selector shell',
);
assert.match(
  contentSource,
  /if \(inventory\) \{[\s\S]*?collectPillEffortRows[\s\S]*?else if \(!hasSpeedMenu\) \{[\s\S]*?COMPOSER_INTELLIGENCE_MENU_CONTENT_SELECTOR[\s\S]*?getIntegratedFrontendRowsFromState/,
  'a two-submenu Chat scrape should preserve GPT effort rows and collect integrated o3 effort rows in one catalog',
);
assert.match(
  contentSource,
  /const getProfileForCatalog = \(catalog\) => \{[\s\S]*?selectorShape === 'pill-two-submenu'[\s\S]*?MODEL_PICKER_PROFILE_LEGACY/,
  'a generic two-submenu compact catalog should fall back to the Chat profile',
);
assert.match(contentSource, /runPillSpeedToggleAction/);
assert.match(contentSource, /runPillResetAction/);
assert.match(contentSource, /speedByConfig/);
const pillSpeedSelectionUpdateSource = contentSource.slice(
  contentSource.indexOf('const updatePillSpeedSelectionInMemory ='),
  contentSource.indexOf('const runPillSpeedToggleAction = async'),
);
assert.match(
  pillSpeedSelectionUpdateSource,
  /window\.__modelCatalog = nextCatalog/,
  'Speed toggles should keep the active content-script catalog coherent in memory',
);
assert.doesNotMatch(
  pillSpeedSelectionUpdateSource,
  /chrome\.storage/,
  'Speed toggles should not rewrite the full sync catalog for an unused selected flag',
);
const pillSpeedToggleSource = contentSource.slice(
  contentSource.indexOf('const runPillSpeedToggleAction = async'),
  contentSource.indexOf('const runPillResetAction = async'),
);
assert.doesNotMatch(
  pillSpeedToggleSource,
  /window\.__modelCatalog\?\.pillMenu/,
  'Speed toggle support should be determined from the live structural pill inventory, not stale stored catalog shape',
);
assert.match(
  pillSpeedToggleSource,
  /ensurePillAdvancedOptionsExpanded\(getOpenPillMainMenu\(\)\)[\s\S]*?getPillSpeedTriggerFromCurrentOrder\(mainMenu\)[\s\S]*?openPillSubmenu\(directTrigger\)[\s\S]*?classifyPillSubmenu\(menu\) !== 'speed'[\s\S]*?getPillMenuInventory\(\)/,
  'Speed should expand Advanced before its verified third-trigger fast path and inventory fallback',
);
const pillResetSource = contentSource.slice(
  contentSource.indexOf('const runPillResetAction = async'),
  contentSource.indexOf('const INTEGRATED_EFFORT_FALLBACK_STEP_DELAY_MS'),
);
assert.match(
  pillResetSource,
  /ensurePillAdvancedOptionsExpanded\(state\.main\)[\s\S]*?getPillResetMenuItem\(mainMenu\)/,
  'Reset should expand Advanced before resolving its menu item',
);
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
  /applyModelVersionSubmenuHints[\s\S]*?const slot = Number\(action\?\.slot\)/,
  'model submenu hints should use the active profile action slot directly',
);
assert.match(
  contentSource,
  /activateCurrentRuntimeModelPickerProfile\('shortcut:key'\)[\s\S]*?for \(const slot of currentVisibleSlots\)/,
  'keyboard matching should scan only the currently active profile slots',
);
assert.match(
  contentSource,
  /const openSurfaceIds = new WeakMap\(\)[\s\S]*?function getOpenSurfaceSignature\(\)[\s\S]*?new MutationObserver\(scheduleWhenOpenSurfaceChanges\)/,
  'hint scheduling should detect submenu identity changes even when the number of open menus is unchanged',
);
assert.match(
  contentSource,
  /function getNativeChatWorkSurfaceMode[\s\S]*?data-animated-slider-trigger="true"[\s\S]*?composer:read/,
  'existing conversations should select Chat or Work from the live composer trigger after the blank-page radios disappear',
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
const modelPickerRunnerSource = contentSource.slice(
  contentSource.indexOf('const ModelPickerActionRunner = (() => {'),
  contentSource.indexOf('const executeModelAction = (action, options = {}) =>'),
);
assert.match(
  modelPickerRunnerSource,
  /async function findHintedTargetAfterOpeningMenus\(sourceSlot\)[\s\S]*?typeof window\.toggleModelSelector === 'function'[\s\S]*?window\.toggleModelSelector\(\);[\s\S]*?window\.__cspOpenModelPickerMainMenu\(\);[\s\S]*?ensurePillAdvancedOptionsExpanded\(mainMenu\)[\s\S]*?getUniqueVisibleMenuItemForSlot\([\s\S]*?sourceSlot,[\s\S]*?readyMainMenu,[\s\S]*?getPillSubmenuTriggers\(readyMainMenu\)[\s\S]*?openPillSubmenu\(trigger\)[\s\S]*?getUniqueVisibleMenuItemForSlot\(sourceSlot, submenu\)/,
  'fallback hint discovery should expand Advanced before scanning exposed submenus',
);
assert.doesNotMatch(
  modelPickerRunnerSource,
  /shouldScanSubmenus|\['pill-effort', 'configure-option'\]\.includes/,
  'fallback submenu discovery should not depend on cross-profile slot mirroring',
);
assert.match(
  modelPickerRunnerSource,
  /function dispatchVisibleHintedMenuAction\(action, options, complete\)\s*{\s*[\s\S]*?if \(action\.actionKind === 'pill-speed-toggle'\) return false;/,
  'the shared Speed shortcut should bypass unique-hint routing because both radio rows intentionally carry the same hint',
);
const modelPickerExecuteSource = modelPickerRunnerSource.slice(
  modelPickerRunnerSource.indexOf('function execute(action, options = {})'),
);
assert.ok(
  modelPickerExecuteSource.indexOf(
    'if (dispatchDirectPillModelAction(action, options, complete))',
  ) <
    modelPickerExecuteSource.indexOf(
      'if (dispatchVisibleHintedMenuAction(action, options, complete))',
    ),
  'a known Work model action should route directly before generic hint discovery',
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
  modelPickerRunnerSource,
  /function dispatchDirectPillModelAction\(action, options, complete\)[\s\S]*?action\.actionKind !== 'configure-option'[\s\S]*?runIntegratedModelNameAction\(action/,
  'direct Work model routing should be limited to known configure-option actions',
);
assert.match(
  contentSource,
  /const selectPillModelNameDuringScrape = async \(action\)[\s\S]*?getPillModelTriggerFromCurrentOrder\(mainMenu\)[\s\S]*?openPillSubmenu\(directTrigger\)[\s\S]*?classifyPillSubmenu\(menu\) !== 'model'[\s\S]*?getPillMenuInventory\(\)/,
  'Work model activation should verify the first-trigger fast path before full inventory fallback',
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
