import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const selectors = require('../extension/shared/model-picker-selectors.js');
const popupSource = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(attributes = {}, parent = null) {
    this.attributes = new Map(Object.entries(attributes));
    this.parentElement = parent;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  closest(selector) {
    if (selector !== '[data-model-selection-view="true"]') return null;
    return this.parentElement?.getAttribute('data-model-selection-view') === 'true'
      ? this.parentElement
      : null;
  }
}

const modelView = new FakeElement({ 'data-model-selection-view': 'true' });
const selectModel = new FakeElement(
  {
    role: 'menuitem',
    'data-interactive': 'true',
    'aria-expanded': 'false',
  },
  modelView,
);
assert.equal(
  selectors.isModelSelectionViewTrigger(selectModel),
  true,
  'current integrated Select model trigger should be structurally recognized',
);
const workSelectModel = new FakeElement(
  {
    role: 'menuitem',
    'data-interactive': 'false',
  },
  modelView,
);
assert.equal(
  selectors.isModelSelectionViewTrigger(workSelectModel),
  true,
  'Work view toggle should be recognized even when ChatGPT marks it non-interactive',
);

assert.match(
  popupSource,
  /pickFirstTabWithId = \(tabs\) =>/,
  'popup tab selection must retain an active tab ID when URL visibility is restricted',
);
assert.match(
  popupSource,
  /pickBestChatGptTab\(activeCurrentWindowTabs\) \|\| pickFirstTabWithId\(activeCurrentWindowTabs\)/,
  'popup tab selection must prefer a visible ChatGPT URL but fall back to the active tab ID',
);
assert.match(
  popupSource,
  /Search all open ChatGPT tabs before giving up[\s\S]*?queryTabsAsync\(\{ url: \['\*:\/\/chatgpt\.com\/\*'/,
  'popup tab selection must fall back across open ChatGPT tabs',
);
assert.match(
  contentSource,
  /ModelPickerSelectors\.isModelSelectionViewTrigger\(item\)/,
  'content should recognize the current same-menu model view trigger',
);
assert.match(
  contentSource,
  /data-testid="composer-model-picker-slider-advanced-view"\]\[data-active="true"\][\s\S]*?getModelVersionMenuItems\(integratedAdvancedView\)\.length[\s\S]*?return integratedAdvancedView/,
  'integrated model scraping should use only the active Advanced panel rows',
);
assert.match(
  contentSource,
  /data-testid="composer-model-picker-slider-simple-view"\] \[role="slider"\]\[aria-valuemin\]\[aria-valuemax\][\s\S]*?effortIds = \['instant', 'thinking', 'pro', 'effort-extra-high', 'effort-max'\]/,
  'integrated effort scraping should derive structural slider rows without localized labels',
);
assert.match(
  contentSource,
  /data-maximum[\s\S]*?data-max-effort|querySelectorAll\('\[data-maximum\], \[data-max-effort\]'\)/,
  'integrated model labels must strip the effort badge from the composer trigger',
);
assert.match(
  contentSource,
  /isLikelyModelVersionLabel[\s\S]*?\^default\\b|nativeOnly: true/,
  'the current Work model list should recognize its native Default row without turning it into an extension slot',
);
assert.match(
  contentSource,
  /availableModelNames\.find\(\(modelName\) => modelName\.label === activeLabel\)/,
  'active Work model selection should remain correct when the native Default row is omitted from extension slots',
);
assert.match(
  contentSource,
  /canUseDirectSlot[\s\S]*?reservedCatalogSlots\.has\(slot\)[\s\S]*?reservedStaticSlots\.has\(slot\)/,
  'newly observed model rows should not steal slots reserved by existing catalog models',
);
assert.match(
  contentSource,
  /activeModelAction[\s\S]*?availableModelNames\.find\(\(modelName\) => modelName\.id === activeModelAction\?\.id\)/,
  'active Work model selection should resolve by action id instead of the DOM index after Default is omitted',
);
assert.match(
  contentSource,
  /INTEGRATED_SPEED_TOGGLE_SELECTOR =\s*'\[role="menuitemcheckbox"\]\[data-fast-mode-enabled\]'/,
  'integrated scraping should identify the current fast-mode control structurally',
);
assert.match(
  contentSource,
  /collectIntegratedSpeedRows[\s\S]*?speed-fast[\s\S]*?label: '1\.5x'/,
  'integrated scraping should persist the current 1.5x speed state',
);
assert.match(
  contentSource,
  /integratedSpeedMenu: hasIntegratedSpeedMenu[\s\S]*?integratedResetAvailable: hasIntegratedReset/,
  'integrated catalogs should persist observed speed and reset capability flags',
);
assert.match(
  popupSource,
  /pickFirstTabWithId\(activeLastFocusedWindowTabs\)/,
  'popup routing should retain the active-tab fallback for both window queries',
);
assert.match(
  contentSource,
  /csp-alt-hint-utility[\s\S]*?flex-direction: column[\s\S]*?margin-top: 2px/,
  'integrated speed and reset helper labels should be centered below their controls',
);
assert.match(
  contentSource,
  /composer-model-picker-slider-simple-view[\s\S]*?querySelectorAll\(`\.\$\{HINT_CLASS\}`\)/,
  'the native integrated Alt+F4 slider hint must be removed from the simple view',
);
assert.match(
  contentSource,
  /data-model-selection-view="true"[\s\S]*?composer-model-picker-slider-simple-view[\s\S]*?display: none !important/,
  'the integrated simple-view effort bar must stay free of native or extension shortcut labels',
);
assert.match(
  contentSource,
  /getIntegratedModelSelectionViewTrigger[\s\S]*?data-interactive\]/,
  'Advanced-first scraping should locate the dynamic central model trigger structurally',
);
assert.match(
  contentSource,
  /effectiveTrigger[\s\S]*?getIntegratedModelSelectionViewTrigger[\s\S]*?getOpenModelVersionSubmenu/,
  'model scraping should resolve the in-place Advanced panel from the structural central trigger',
);
assert.match(
  contentSource,
  /integratedViewTrigger[\s\S]*?schedule\(\{ retries: 4, interval: 25 \}\)/,
  'opening the structural Advanced view trigger should reschedule model-row hints',
);
assert.match(
  contentSource,
  /availableModelNames\.sort\([\s\S]*?observedOrderById/,
  'scraped Work models should be persisted in the native Advanced-list order',
);
assert.match(
  contentSource,
  /reset-default', 'Digit7'/,
  'integrated Reset to default should use the Alt+7 utility shortcut',
);
assert.match(
  popupSource,
  /out\[14\] = 'Digit7'/,
  'popup fallback defaults should expose Reset to default as Alt+7',
);
assert.match(
  popupSource,
  /storedId[\s\S]*?getCatalogActionById\(storedId, catalog, \[\]\)/,
  'popup catalog normalization should preserve scraped model action identities and order',
);
assert.match(
  popupSource,
  /integratedModelCatalog && id === 'configure-latest'/,
  'popup normalization should discard stale native Default aliases from integrated Work catalogs',
);
assert.match(
  contentSource,
  /storedId[\s\S]*?getCatalogActionById\(storedId, catalog, \[\]\)/,
  'persisted model names should use the scraped action id rather than positional latest inference',
);
assert.match(
  contentSource,
  /isModelNameHintAction[\s\S]*?\[3, 4, 5, 6, 8, 9, 10\]/,
  'integrated model hints must exclude effort and utility shortcut slots',
);
assert.match(
  contentSource,
  /catalogAction\?\.fromCatalog === true[\s\S]*?catalogAction\.actionKind === 'configure-option'[\s\S]*?return \{ \.\.\.listAction, \.\.\.catalogAction, label \}/,
  'live model-row labels should preserve catalog-assigned slots over positional fallbacks',
);
assert.match(
  contentSource,
  /const INTEGRATED_EFFORT_ACTION_IDS = Object\.freeze\(\[[\s\S]*?'effort-max'[\s\S]*?\]\)/,
  'integrated effort actions should use the structural Power slider rather than model rows',
);
assert.match(
  contentSource,
  /const isIntegratedComposerMenu = \(mainMenu\)[\s\S]*?data-model-selection-view="true"/,
  'current same-menu model pickers should use the structural integrated-menu marker during scraping and dispatch',
);
assert.match(
  contentSource,
  /runIntegratedEffortAction = async \(action[\s\S]*?getOrOpenModelPickerState\(\)[\s\S]*?data-testid="composer-model-picker-slider-simple-view"[\s\S]*?pressElementKey\(control, direction, direction\)/,
  'integrated effort shortcuts should move the live slider with structural arrow controls',
);
assert.doesNotMatch(
  contentSource,
  /shouldFallbackToLatestForMissingLiveEffort|runIntegratedEffortFallbackAction|skipIntegratedEffortFallback/,
  'an unavailable Work effort must not switch to another model and replay the shortcut',
);
assert.match(
  contentSource,
  /activateIntegratedEffortTick = \(el\)[\s\S]*?clientX:/,
  'integrated effort shortcuts should click the destination tick before using the bounded keyboard fallback',
);
assert.match(
  contentSource,
  /querySelectorAll\('\[data-selected\]\[data-locked\]'\)/,
  'integrated effort shortcuts should resolve destination ticks structurally',
);
assert.match(
  contentSource,
  /isModelPickerAssignedShortcutEvent[\s\S]*?runDynamicThinkingEffortShortcut[\s\S]*?isModelPickerAssignedShortcutEvent\(event\)/,
  'legacy effort handlers should stand down when the active model-picker profile owns the key',
);
assert.match(
  contentSource,
  /closePickerAfterCommit[\s\S]*?button\.click\(\);[\s\S]*?aria-expanded'\) === 'false'[\s\S]*?timeout: 180/,
  'integrated effort shortcuts should close the picker through its native composer-pill toggle',
);
assert.match(
  contentSource,
  /INTEGRATED_EFFORT_WORK_OFFSETS[\s\S]*?instant:\s*0[\s\S]*?thinking:\s*1[\s\S]*?pro:\s*2/,
  'Work effort shortcuts should map Light, Medium, and High to their live slider positions',
);
assert.match(
  contentSource,
  /advancedView instanceof Element[\s\S]*?pressElementKey\(advancedView, 'Escape', 'Escape'\)[\s\S]*?ensureMainMenuOpen\(\)/,
  'effort actions should close Advanced and reopen the composer pill before targeting Power',
);
assert.match(
  contentSource,
  /dispatchIntegratedEffortAction\(action, options, complete\)[\s\S]*?dispatchDirectPillModelAction/,
  'effort actions should take the integrated slider route before generic model dispatch',
);
assert.match(
  contentSource,
  /e\.stopImmediatePropagation\?\.\(\)[\s\S]*?runModelPickerShortcutSlot\(idx/,
  'claimed picker shortcuts should not be enqueued twice by a stale reloaded listener',
);

console.log('model refresh routing and current integrated picker fixture passed');
