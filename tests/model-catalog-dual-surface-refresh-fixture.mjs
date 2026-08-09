import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const popupSource = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

const coordinatorStart = contentSource.indexOf('const refreshChatWorkModelCatalogsOnce');
const coordinatorEnd = contentSource.indexOf('const getConfigureClickTargets', coordinatorStart);
assert.ok(coordinatorStart >= 0 && coordinatorEnd > coordinatorStart, 'dual-surface coordinator should exist');

const coordinator = contentSource.slice(coordinatorStart, coordinatorEnd);
const stableSurfaceStart = contentSource.indexOf('const waitForStableNativeChatWorkSurface');
assert.ok(
  stableSurfaceStart >= 0 && stableSurfaceStart < coordinatorStart,
  'the dual-surface coordinator should have a structural surface-stability gate',
);
const stableSurface = contentSource.slice(stableSurfaceStart, coordinatorStart);
assert.match(
  stableSurface,
  /window\.waitForNativeChatWorkSurfaceRadios\?\.\(0\)[\s\S]*?currentRadios\.length === 2[\s\S]*?aria-checked'\) === 'true'[\s\S]*?aria-checked'\) === 'false'[\s\S]*?currentButton instanceof Element[\s\S]*?currentButton !== stableButton[\s\S]*?Date\.now\(\) - stableSince >= stableMs/,
  'surface readiness should require reciprocal radio state and one stable composer model button',
);
const orderedCalls = [
  'window.getNativeChatWorkSurfaceMode?.()',
  'window.triggerNativeNewConversationButton?.()',
  'window.waitForNativeChatWorkSurfaceRadios?.(4000)',
  'window.getNativeChatWorkSurfaceMode?.(radios)',
  "for (const mode of ['chat', 'work'])",
  'window.selectNativeChatWorkSurfaceMode?.(mode, 3000)',
  'waitForStableNativeChatWorkSurface(mode',
  'scrapeModelCatalogOnce({',
];
let previousIndex = -1;
for (const call of orderedCalls) {
  const index = coordinator.indexOf(call);
  assert.ok(index > previousIndex, `${call} should appear in refresh order`);
  previousIndex = index;
}

assert.match(
  coordinator,
  /keepPreparedSession:\s*false,\s*profile:\s*mode,/s,
  'each surface scrape should close its prepared session and persist to the explicit mode profile',
);
assert.match(
  coordinator,
  /const blankMode = window\.getNativeChatWorkSurfaceMode\?\.\(radios\)[\s\S]*if \(!initialMode\) initialMode = blankMode/,
  'blank-chat mode should only fall back when the pre-navigation mode was unavailable',
);
assert.match(
  coordinator,
  /finally\s*\{[\s\S]*collapseOpenModelPickerUiAfterScrape\(\)[\s\S]*window\.selectNativeChatWorkSurfaceMode\?\.\(initialMode,\s*3000\)[\s\S]*waitForStableNativeChatWorkSurface\(initialMode[\s\S]*if \(!restored\)[\s\S]*selectNativeChatWorkSurfaceMode\?\.\(initialMode,\s*3000\)[\s\S]*persistScrapedModelCatalog\(initialResult\.modelCatalog,[\s\S]*profile:\s*initialMode,[\s\S]*collapseOpenModelPickerUiAfterScrape\(\)/,
  'cleanup should stably restore and retry the initial mode, restore its compatibility catalog, and collapse again',
);
assert.doesNotMatch(
  coordinator,
  /repair.*shortcut|modelPickerKeyCodes|KEY_CODES/i,
  'catalog scraping should never inspect, repair, or write shortcut assignments',
);

const popupScrapeStart = popupSource.indexOf('const runScrape = async () =>');
const popupScrapeEnd = popupSource.indexOf('window.__startModelCatalogScrape = runScrape', popupScrapeStart);
const popupScrape = popupSource.slice(popupScrapeStart, popupScrapeEnd);
assert.match(
  popupScrape,
  /type:\s*'CSP_REFRESH_CHAT_WORK_MODEL_CATALOGS'/,
  'manual popup refresh should request the dual-surface coordinator',
);
assert.doesNotMatch(
  popupScrape,
  /type:\s*'CSP_SCRAPE_MODEL_CATALOG'/,
  'manual popup refresh should no longer scrape only the currently active surface',
);
assert.match(
  popupScrape,
  /scrapedProfiles\[mode\][\s\S]*setModelCatalogCache[\s\S]*if \(!result\?\.ok\)/,
  'the popup should hydrate both returned catalog profiles even when one profile failed',
);
assert.match(
  popupScrape,
  /const hasScrapedProfiles = Object\.keys\(scrapedProfiles\)\.length > 0[\s\S]*if \(!hasScrapedProfiles\)[\s\S]*getModelCatalogProfileForCatalog\(result\.modelCatalog\)/,
  'aggregate responses should not reclassify their preferred result by menu shape',
);
assert.doesNotMatch(
  popupScrape,
  /repair.*shortcut|modelPickerKeyCodes/i,
  'popup scrape handling should leave both shortcut profiles untouched',
);

const noSwitcherHelpersStart = popupSource.indexOf('const MODEL_CATALOG_NO_SWITCHER_ERROR');
const noSwitcherHelpersEnd = popupSource.indexOf(
  'const setModelCatalogScrapeState',
  noSwitcherHelpersStart,
);
assert.ok(
  noSwitcherHelpersStart >= 0 && noSwitcherHelpersEnd > noSwitcherHelpersStart,
  'popup no-switcher result helpers should exist',
);
const noSwitcherContext = vm.createContext({});
vm.runInContext(
  `${popupSource.slice(noSwitcherHelpersStart, noSwitcherHelpersEnd)}
globalThis.isNoSwitcher = isModelCatalogNoSwitcherResult;
globalThis.isDeliveredUnavailable = isDeliveredModelCatalogUnavailableResult;
globalThis.getRefreshOutcome = getModelCatalogRefreshOutcome;`,
  noSwitcherContext,
  { filename: 'popup-model-catalog-result-helpers.js' },
);
const partialResult = {
  ok: false,
  fromChatGptTab: true,
  error: 'MODEL_SUBMENU_NOT_FOUND',
  profiles: {
    chat: { ok: true, modelCatalog: {} },
    work: { ok: false, error: 'MODEL_SUBMENU_NOT_FOUND' },
  },
};
assert.equal(
  noSwitcherContext.isNoSwitcher(partialResult),
  false,
  'one failed surface must not turn a successful profile into global no-switcher state',
);
assert.equal(
  noSwitcherContext.isDeliveredUnavailable(partialResult),
  false,
  'delivered partial failure must preserve the successful profile grid',
);
assert.equal(
  noSwitcherContext.getRefreshOutcome(partialResult),
  'partial',
  'a dual-surface result with one successful profile should be a usable partial refresh',
);
assert.equal(
  noSwitcherContext.isNoSwitcher({
    ok: false,
    noModelSwitcher: true,
    profiles: {
      chat: { ok: false, noModelSwitcher: true },
      work: { ok: false, noModelSwitcher: true },
    },
  }),
  true,
  'global no-switcher state remains valid when neither surface succeeded',
);

const manualRefreshStart = popupSource.indexOf('const triggerManualCatalogRefresh');
const manualRefreshEnd = popupSource.indexOf('const syncCatalogLoadingUi', manualRefreshStart);
assert.ok(
  manualRefreshStart >= 0 && manualRefreshEnd > manualRefreshStart,
  'manual refresh outcome handler should exist',
);
const manualRefreshContext = vm.createContext({
  chrome: { i18n: { getMessage: () => '' } },
  promptValues: [],
  scrapeStates: [],
  renderCount: 0,
  toastCount: 0,
  isModelCatalogScrapeLoading: () => false,
  setModelCatalogRefreshPromptVisible(value) {
    manualRefreshContext.promptValues.push(value);
  },
  setModelCatalogScrapeState(value) {
    manualRefreshContext.scrapeStates.push(value);
  },
  renderAll() {
    manualRefreshContext.renderCount += 1;
  },
  window: {
    __startModelCatalogScrape: async () => partialResult,
    toast: {
      show() {
        manualRefreshContext.toastCount += 1;
      },
    },
  },
});
vm.runInContext(
  `${popupSource.slice(noSwitcherHelpersStart, noSwitcherHelpersEnd)}
${popupSource.slice(manualRefreshStart, manualRefreshEnd)}
globalThis.triggerManualRefresh = triggerManualCatalogRefresh;`,
  manualRefreshContext,
  { filename: 'popup-model-catalog-manual-refresh-outcome.js' },
);
const manualPartialResult = await manualRefreshContext.triggerManualRefresh('fixture');
assert.equal(manualPartialResult, partialResult, 'manual refresh should return the usable partial result');
assert.equal(
  manualRefreshContext.promptValues.at(-1),
  false,
  'partial success should leave the blocking retry prompt hidden',
);
assert.deepEqual(
  manualRefreshContext.scrapeStates,
  ['ready'],
  'partial success should restore an interactive grid state',
);
assert.equal(
  manualRefreshContext.toastCount,
  0,
  'partial success should not show the misleading missing-tab retry toast',
);

console.log('dual-surface Chat/Work model catalog refresh is wired');
