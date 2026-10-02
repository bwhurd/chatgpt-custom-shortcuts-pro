import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const selectors = require('../extension/shared/model-picker-selectors.js');
const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const popupSource = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(attributes = {}, { tagName = 'DIV', textContent = '' } = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.tagName = tagName;
    this.textContent = textContent;
    this.children = [];
    this.parentElement = null;
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  matches(selector) {
    return (
      selector === '[role="menuitem"][data-model-picker-view-toggle="true"]' &&
      this.getAttribute('role') === 'menuitem' &&
      this.getAttribute('data-model-picker-view-toggle') === 'true'
    );
  }

  closest(selector) {
    if (selector === '[inert], [data-active="false"]') {
      for (let node = this; node; node = node.parentElement) {
        if (node.hasAttribute('inert') || node.getAttribute('data-active') === 'false') return node;
      }
      return null;
    }
    if (selector === '[data-model-selection-view="true"]') {
      for (let node = this; node; node = node.parentElement) {
        if (node.getAttribute('data-model-selection-view') === 'true') return node;
      }
      return null;
    }
    if (selector === '[data-model-selection-view="true"] [role="menuitem"][data-interactive]') {
      for (let candidate = this; candidate; candidate = candidate.parentElement) {
        if (
          candidate.getAttribute('role') !== 'menuitem' ||
          !candidate.hasAttribute('data-interactive')
        ) {
          continue;
        }
        for (let view = candidate.parentElement; view; view = view.parentElement) {
          if (view.getAttribute('data-model-selection-view') === 'true') return candidate;
        }
      }
      return null;
    }
    if (selector === '[data-model-picker-view]') {
      for (let node = this; node; node = node.parentElement) {
        if (node.hasAttribute('data-model-picker-view')) return node;
      }
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = (node) =>
      (selector === '[role="menuitemradio"]' && node.getAttribute('role') === 'menuitemradio') ||
      (selector === '[data-menu-row-content="true"]' &&
        node.getAttribute('data-menu-row-content') === 'true');
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (matches(child)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

const modelView = new FakeElement({ 'data-model-picker-view': 'advanced' });
const activePanel = new FakeElement({ 'data-active': 'true' });
const inactivePanel = new FakeElement({ 'data-active': 'false', inert: '' });
const firstModelRow = new FakeElement({ role: 'menuitemradio', 'aria-checked': 'true' });
const secondModelRow = new FakeElement({ role: 'menuitemradio', 'aria-checked': 'false' });
const hiddenModelRow = new FakeElement({ role: 'menuitemradio', 'aria-checked': 'false' });

const firstContent = new FakeElement({ 'data-menu-row-content': 'true' });
firstContent.append(new FakeElement({}, { tagName: 'SPAN', textContent: 'GPT-6 Astra' }));
firstModelRow.append(firstContent);

const secondContent = new FakeElement({ 'data-menu-row-content': 'true' });
const titleAndDescription = new FakeElement();
titleAndDescription.append(
  new FakeElement({}, { tagName: 'SPAN', textContent: 'GPT-5.5' }),
  new FakeElement({}, { tagName: 'SPAN', textContent: 'Leaving on October 14' }),
);
secondContent.append(titleAndDescription);
secondModelRow.append(secondContent);

inactivePanel.append(hiddenModelRow);
activePanel.append(firstModelRow, secondModelRow);
modelView.append(activePanel, inactivePanel);

const rows = selectors.getActiveModelPickerRows(modelView);
assert.deepEqual(
  rows,
  [firstModelRow, secondModelRow],
  'inactive/inert mounted rows must not enter the catalog',
);
assert.equal(
  selectors.getModelPickerRowTitleElement(firstModelRow)?.textContent,
  'GPT-6 Astra',
  'a direct primary span should be used as the model title',
);
assert.equal(
  selectors.getModelPickerRowTitleElement(secondModelRow)?.textContent,
  'GPT-5.5',
  'a title/description wrapper should exclude the secondary description',
);

const trigger = new FakeElement({ role: 'menuitem', 'data-model-picker-view-toggle': 'true' });
trigger.parentElement = modelView;
assert.equal(
  selectors.isModelSelectionViewTrigger(trigger),
  true,
  'the current Advanced/effort view toggle must not depend on the retired wrapper or aria-expanded',
);

const interactionStart = contentSource.indexOf('function scheduleAfterMenuInteraction(event)');
const interactionEnd = contentSource.indexOf(
  '\n        function getOpenSelectListboxCount()',
  interactionStart,
);
assert.ok(
  interactionStart >= 0 && interactionEnd > interactionStart,
  'the menu interaction handler should exist',
);
const interactionHandler = contentSource.slice(interactionStart, interactionEnd);
assert.match(
  interactionHandler,
  /target\?\.closest\?\.\(\s*'\[data-model-selection-view="true"\] \[role="menuitem"\]\[data-interactive\]'/,
  'nested clicks should resolve the closest integrated view-toggle candidate without requiring aria-expanded',
);
assert.match(
  interactionHandler,
  /ModelPickerSelectors\.isModelSelectionViewTrigger\(integratedViewToggleCandidate\)[\s\S]*?schedule\(\{ retries: 4, interval: 25 \}\)/,
  'the shared structural helper should validate the trigger before bounded hint scheduling',
);

const resolveIntegratedViewTriggerFromClick = (target) => {
  const candidate = target?.closest?.(
    '[data-model-selection-view="true"] [role="menuitem"][data-interactive]',
  );
  return candidate && selectors.isModelSelectionViewTrigger(candidate) ? candidate : null;
};

const workPickerView = new FakeElement({ 'data-model-selection-view': 'true' });
const workPickerTrigger = new FakeElement({ role: 'menuitem', 'data-interactive': 'false' });
const workPickerText = new FakeElement({}, { tagName: 'SPAN', textContent: 'GPT-6 Astra Medium' });
workPickerTrigger.append(workPickerText);
workPickerView.append(workPickerTrigger);
assert.equal(
  workPickerTrigger.hasAttribute('aria-expanded'),
  false,
  'Work omits aria-expanded on this trigger',
);
assert.equal(
  resolveIntegratedViewTriggerFromClick(workPickerText),
  workPickerTrigger,
  'a click on Work trigger text should resolve the non-interactive view trigger without aria-expanded',
);

const chatPickerView = new FakeElement({ 'data-model-selection-view': 'true' });
const chatPickerTrigger = new FakeElement({
  role: 'menuitem',
  'data-interactive': 'true',
  'aria-expanded': 'false',
});
const chatPickerIcon = new FakeElement({}, { tagName: 'SVG' });
chatPickerTrigger.append(chatPickerIcon);
chatPickerView.append(chatPickerTrigger);
assert.equal(
  resolveIntegratedViewTriggerFromClick(chatPickerIcon),
  chatPickerTrigger,
  'a nested Chat click should continue to resolve its expanded-state view trigger',
);

const chatButton = new FakeElement({ 'aria-pressed': 'true' });
const workButton = new FakeElement({ 'aria-pressed': 'false' });
assert.equal(selectors.isChatWorkSurfaceSelected(chatButton), true);
assert.equal(selectors.isChatWorkSurfaceSelected(workButton), false);

const scanStart = contentSource.indexOf('const scrapeCurrentModelPickerCatalogOnce');
const scanEnd = contentSource.indexOf('const scrapeModelCatalogOnce', scanStart);
assert.ok(
  scanStart >= 0 && scanEnd > scanStart,
  'the current-picker scanner should be the single catalog scan',
);
const scanner = contentSource.slice(scanStart, scanEnd);
assert.match(scanner, /aria-labelledby.*triggerId|triggerId.*aria-labelledby/s);
assert.match(scanner, /data-model-picker-view-toggle="true"/);
assert.match(scanner, /getActiveModelPickerRows\?\.\(view\)/);
assert.match(scanner, /getModelPickerRowTitleElement\?\.\(row\)/);
assert.match(scanner, /data-reasoning-slider="true"/);
assert.match(scanner, /aria-valuemin.*aria-valuemax.*aria-valuenow/s);
assert.match(scanner, /data-selected-reasoning-effort/);
assert.match(scanner, /waitForStorage: true/);
assert.doesNotMatch(scanner, /MAX_SLOTS|slice\(0,/);
assert.doesNotMatch(
  contentSource,
  /scrapePillModelCatalogOnce|scrapeIntegratedModelCatalogOnce|ModelPickerNameCache/,
  'retired picker scrapers and the opportunistic shared-name scraper must not remain active',
);
assert.doesNotMatch(
  popupSource,
  /resolveModelActionableNames\(settings\.modelNames\)\.slice\([\s\S]{0,90}MODEL_PICKER_MAX_SLOTS/,
  'cloud restoration must not truncate catalog names to the compatibility padding size',
);
assert.match(
  popupSource,
  /type:\s*'CSP_REFRESH_CHAT_WORK_MODEL_CATALOGS'/,
  'popup refresh must use the Chat/Work coordinator rather than the retired single-surface path',
);

const hintStart = contentSource.indexOf('function addLabel(el, labelText)');
const hintEnd = contentSource.indexOf('function getUniqueVisibleMenuItemForSlot', hintStart);
assert.ok(hintStart >= 0 && hintEnd > hintStart, 'the current hint renderer should exist');
const hintRenderer = contentSource.slice(hintStart, hintEnd);
assert.match(
  hintRenderer,
  /compactIconUtilityTarget[\s\S]*?span\.classList\.add\('csp-utility-icon-hint'\)[\s\S]*?el\.appendChild\(span\)/,
  'compact speed/reset hints should sit outside the native icon row',
);
assert.match(
  contentSource,
  /\.csp-alt-hint-utility > \.csp-utility-icon-hint[\s\S]*?position: absolute[\s\S]*?top: calc\(100% - 5px\)[\s\S]*?left: 50%/,
  'compact utility hints should be centered just below the icons without changing their flex layout',
);
assert.match(
  contentSource,
  /data-testid="composer-model-picker-slider-simple-view"\]\s*\.\$\{HINT_CLASS\}[\s\S]*?display: none !important/,
  'the current effort slider should not display shortcut labels',
);

console.log('current model-picker inventory and title fixture passed');
