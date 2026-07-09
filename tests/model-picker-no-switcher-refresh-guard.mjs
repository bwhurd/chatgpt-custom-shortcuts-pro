import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const popupSource = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
const backgroundSource = await readFile(
  new URL('../extension/background.js', import.meta.url),
  'utf8',
);
const popupCssSource = await readFile(new URL('../extension/popup.css', import.meta.url), 'utf8');
const localeSource = await readFile(
  new URL('../extension/_locales/en/messages.json', import.meta.url),
  'utf8',
);
const modelSwitchingSurfaceDetectorSource =
  contentSource.match(
    /function isModelMenuWithoutSwitchingSurface\([\s\S]*?\n      \}/,
  )?.[0] || '';

assert.match(
  contentSource,
  /const MODEL_SWITCHER_PILL_NOT_FOUND_ERROR = 'MODEL_SWITCHER_PILL_NOT_FOUND';/,
  'content script should define a stable no-switcher scrape error code',
);
assert.match(
  contentSource,
  /noModelSwitcher: true/,
  'content script should mark missing model switcher refresh results explicitly',
);
assert.match(
  contentSource,
  /const getVisibleModelMenuButton = \(\) => \{\s*const button = getModelMenuButton\(\);\s*return isUsablyVisibleModelElement\(button\) \? button : null;\s*\};/s,
  'content script should distinguish visible model buttons from hidden fallback candidates',
);
assert.match(
  contentSource,
  /await releasePreparedModelConfigSession\(\);\s*if \(!getVisibleModelMenuButton\(\)\) return createNoModelSwitcherResult\('model-switcher-pill-missing'\);\s*const integratedResult = await scrapeIntegratedModelCatalogOnce\(\);/s,
  'content scrape should stop with the no-switcher result before trying the integrated scrape path',
);
assert.match(
  contentSource,
  /if \(!integratedResult\?\.fallback\) return integratedResult;\s*await releasePreparedModelConfigSession\(\);\s*if \(!getVisibleModelMenuButton\(\)\) return createNoModelSwitcherResult\('model-switcher-pill-missing'\);\s*const alreadyOpen = ensureMainMenuOpen\(\);/s,
  'content scrape should re-check the model switcher before falling back to the legacy configure path',
);
assert.match(
  modelSwitchingSurfaceDetectorSource,
  /function isModelMenuWithoutSwitchingSurface\([\s\S]*?ignoreModelSubmenuTrigger = false[\s\S]*?findConfigureMenuItem\(state\)[\s\S]*?hasDirectModelVersion[\s\S]*?!ignoreModelSubmenuTrigger[\s\S]*?isCurrentModelSubmenuTriggerItem\(item\) && !isUnavailableModelMenuItem\(item\)[\s\S]*?getOpenModelVersionSubmenu\(state\.submenuTrigger\)/s,
  'content script should detect unavailable model switching structurally instead of reading localized tier labels',
);
assert.doesNotMatch(
  modelSwitchingSurfaceDetectorSource,
  /isLikelyFreeAccountSurface|hasFreeUpsellCopy|hasUpgradeCopy|hasPaidPlanCopy|chatgpt\\s\+plus|\\bfree\\b|\\bupgrade\\b|\\bplus\\b|\\bpro\\b|\\bteam\\b/i,
  'content no-switcher detection should not depend on localized account or upsell text',
);
assert.match(
  contentSource,
  /CSP_MODEL_REFRESH_DEBUG/,
  'content script should emit model refresh debug logs visible from the ChatGPT tab',
);
assert.match(
  contentSource,
  /!\(submenu instanceof Element\)[\s\S]*?isModelMenuWithoutSwitchingSurface\(state,\s*\{\s*ignoreModelSubmenuTrigger: true,\s*\}\)[\s\S]*?createNoModelSwitcherResult\('model-menu-without-switching-surface'\)[\s\S]*?MODEL_SUBMENU_NOT_FOUND/s,
  'content integrated scrape should classify structurally unavailable model switching as no-switcher while preserving submenu failures',
);
assert.match(
  contentSource,
  /const configureItem = findConfigureMenuItem\(state\);\s*if \(!state\.main \|\| !configureItem\) \{[\s\S]*?const noSwitcher = isModelMenuWithoutSwitchingSurface\(state,\s*\{\s*ignoreModelSubmenuTrigger: true,\s*\}\);[\s\S]*?return noSwitcher\s*\? createNoModelSwitcherResult\('model-menu-without-switching-surface'\)\s*: \{ ok: false, error: 'CONFIGURE_ITEM_NOT_FOUND' \};\s*\}/s,
  'content legacy fallback should preserve generic configure failures unless model switching is structurally unavailable',
);

assert.match(
  popupSource,
  /'no-switcher'/,
  'popup scrape state should include a dedicated no-switcher state',
);
assert.match(
  popupSource,
  /isModelCatalogNoSwitcherResult\(result\)/,
  'popup should branch on the typed no-switcher scrape result',
);
assert.match(
  popupSource,
  /const isDeliveredModelCatalogUnavailableResult = \(result\) =>[\s\S]*?result\?\.fromChatGptTab[\s\S]*?MODEL_SUBMENU_NOT_FOUND[\s\S]*?CONFIGURE_ITEM_NOT_FOUND/s,
  'popup should treat delivered model-menu scrape failures as unavailable switching instead of tab-missing',
);
assert.doesNotMatch(
  popupSource,
  /result\.error === 'CONFIGURE_ITEM_NOT_FOUND'/,
  'popup should not collapse paid-user scrape failures just because Configure was missing',
);
assert.match(
  popupSource,
  /return result \|\| null;/,
  'popup should preserve failed scrape result details for the click handler',
);
assert.match(
  popupSource,
  /label_modelPickerNoSwitcherPrompt/,
  'popup should use the dedicated no-switcher locale key',
);
assert.match(
  popupSource,
  /isPromptVisible \|\| isNoSwitcherVisible/,
  'popup overlay should show for the no-switcher state without using the generic failure prompt',
);
assert.match(
  popupSource,
  /const markDeliveredResponse = \(response\) =>[\s\S]*?fromChatGptTab: true[\s\S]*?if \(direct\?\.fromChatGptTab\) return direct;/s,
  'popup should preserve delivered non-ok content responses instead of falling through to the tab-missing relay',
);
assert.match(
  backgroundSource,
  /const markDeliveredResponse = \(response\) =>[\s\S]*?fromChatGptTab: true[\s\S]*?return markDeliveredResponse\(response\);/s,
  'background relay should mark content-script responses as delivered even when ok is false',
);

assert.match(
  localeSource,
  /"label_modelPickerNoSwitcherPrompt"\s*:\s*\{\s*"message"\s*:\s*"Log in with Plus or Pro to show model switching shortcuts\. Open ChatGPT, then click here to refresh\."/s,
  'English locale should include the no-switcher prompt copy',
);
assert.match(
  popupCssSource,
  /#model-picker-grid\.mp-grid-no-switcher-state[\s\S]*?min-height: 4\.5rem;[\s\S]*?#model-picker-grid\.mp-grid-no-switcher-state \.mp-grid-group/,
  'popup CSS should collapse the model grid in the no-switcher state',
);

console.log('model picker no-switcher refresh guard is wired');
