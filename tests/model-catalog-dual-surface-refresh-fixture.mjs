import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const popupSource = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

const coordinatorStart = contentSource.indexOf('const refreshChatWorkModelCatalogsOnce');
const coordinatorEnd = contentSource.indexOf('const getConfigureClickTargets', coordinatorStart);
assert.ok(coordinatorStart >= 0 && coordinatorEnd > coordinatorStart, 'dual-surface coordinator should exist');

const coordinator = contentSource.slice(coordinatorStart, coordinatorEnd);
const orderedCalls = [
  'window.triggerNativeNewConversationButton?.()',
  'window.waitForNativeChatWorkSurfaceRadios?.(4000)',
  "window.getNativeChatWorkSurfaceMode?.(radios)",
  "for (const mode of ['chat', 'work'])",
  'window.selectNativeChatWorkSurfaceMode?.(mode, 3000)',
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
  /finally\s*\{[\s\S]*collapseOpenModelPickerUiAfterScrape\(\)[\s\S]*window\.selectNativeChatWorkSurfaceMode\?\.\(initialMode,\s*3000\)[\s\S]*persistScrapedModelCatalog\(initialResult\.modelCatalog,[\s\S]*profile:\s*initialMode,[\s\S]*collapseOpenModelPickerUiAfterScrape\(\)/,
  'cleanup should collapse menus, restore the initial mode, restore its compatibility catalog, and collapse again',
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
assert.doesNotMatch(
  popupScrape,
  /repair.*shortcut|modelPickerKeyCodes/i,
  'popup scrape handling should leave both shortcut profiles untouched',
);

console.log('dual-surface Chat/Work model catalog refresh is wired');
