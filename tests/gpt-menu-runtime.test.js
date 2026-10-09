const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const metadata = require('../extension/shared/shortcut-action-metadata.js');

const repoRoot = path.resolve(__dirname, '..');
const contentPath = path.join(repoRoot, 'extension', 'content.js');
const collectorPath = path.join(repoRoot, 'tests', 'playwright', 'lib', 'devscrape-wide-core.mjs');

function extract(source, pattern, description) {
  const match = source.match(pattern);
  assert.ok(match, `Could not extract ${description}`);
  return match[0];
}

function makeTriggerFinder(contentSource, header) {
  const pathPrefixes = extract(
    contentSource,
    / {2}const GPT_MENU_TRIGGER_PATH_PREFIXES = Object\.freeze\(\[[\s\S]*?\n {2}\]\);/,
    'GPT menu trigger path prefixes',
  );
  const glyphMatcher = extract(
    contentSource,
    / {2}function isGptActionsMenuTrigger\(element\) \{[\s\S]*?\n {2}\}/,
    'GPT menu trigger glyph matcher',
  );
  const finder = extract(
    contentSource,
    / {2}function findGptMenuTrigger\(\) \{[\s\S]*?\n {2}\}/,
    'GPT menu trigger finder',
  );
  const document = {
    documentElement: { clientHeight: 900, clientWidth: 1200 },
    querySelector(selector) {
      if (selector === '#page-header') return header;
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  return new Function(
    'HTMLElement',
    'document',
    'window',
    'isPartlyVisibleAboveComposer',
    `${pathPrefixes}\n${glyphMatcher}\n${finder}\nreturn findGptMenuTrigger;`,
  )(FixtureElement, document, { innerHeight: 900 }, () => true);
}

class FixtureElement {
  constructor({ paths = [], ariaLabel = '' } = {}) {
    this.paths = paths;
    this.ariaLabel = ariaLabel;
    this.rect = { left: 10, top: 10, right: 40, bottom: 40, width: 30, height: 30 };
  }

  matches(selector) {
    return selector === 'button[aria-haspopup="menu"]';
  }

  querySelector(selector) {
    const pathPrefix = selector.match(/svg path\[d\^="([^"]+)"\]/)?.[1];
    return pathPrefix && this.paths.some((pathValue) => pathValue.startsWith(pathPrefix))
      ? {}
      : null;
  }

  getBoundingClientRect() {
    return this.rect;
  }
}

test('GPT menu trigger selection requires the observed three-path icon', async () => {
  const contentSource = await readFile(contentPath, 'utf8');
  const moreButton = new FixtureElement({ ariaLabel: 'More' });
  const gptActionsButton = new FixtureElement({
    paths: ['M15.6981 9.04712 0', 'M4.69806 9.04712 0', 'M10.2003 9.04712 0'],
    ariaLabel: 'GPT actions',
  });
  const header = {
    querySelectorAll(selector) {
      assert.equal(selector, 'button[aria-haspopup="menu"]');
      return [moreButton, gptActionsButton];
    },
  };

  assert.equal(makeTriggerFinder(contentSource, header)(), gptActionsButton);

  const labelOnlyHeader = {
    querySelectorAll() {
      return [new FixtureElement({ ariaLabel: 'GPT actions' })];
    },
  };
  assert.equal(makeTriggerFinder(contentSource, labelOnlyHeader)(), null);

  const partialGlyphHeader = {
    querySelectorAll() {
      return [new FixtureElement({ paths: ['M15.6981 9.04712 0', 'M4.69806 9.04712 0'] })];
    },
  };
  assert.equal(makeTriggerFinder(contentSource, partialGlyphHeader)(), null);
});

test('GPT menu lookup follows aria-controls or trigger id and refuses unrelated open menus', async () => {
  const contentSource = await readFile(contentPath, 'utf8');
  const menuSelector = extract(
    contentSource,
    / {2}const MENU_CONTENT_SELECTOR =\s*\n {4}'[^']+';/,
    'open Radix menu selector',
  );
  const findOpenMenu = extract(
    contentSource,
    / {2}function findOpenMenuForTrigger\(triggerEl\) \{[\s\S]*?\n {2}\}/,
    'GPT menu association helper',
  );
  const menuLookup = new Function(
    'document',
    `${menuSelector}\n${findOpenMenu}\nreturn findOpenMenuForTrigger;`,
  );
  const makeMenu = (attributes) => ({ getAttribute: (name) => attributes[name] ?? null });
  const unrelatedMenu = makeMenu({ id: 'other-menu', 'aria-labelledby': 'other-trigger' });
  const controlledMenu = makeMenu({ id: 'gpt-menu', role: 'menu' });
  const document = {
    querySelectorAll(selector) {
      assert.match(selector, /data-state="open"/);
      return [unrelatedMenu, controlledMenu];
    },
  };
  const find = menuLookup(document);

  assert.equal(
    find({ getAttribute: (name) => ({ id: 'gpt-trigger', 'aria-controls': 'gpt-menu' })[name] }),
    controlledMenu,
  );

  const labelledMenu = makeMenu({ id: 'labelled-menu', 'aria-labelledby': 'other-id gpt-trigger' });
  document.querySelectorAll = () => [unrelatedMenu, labelledMenu];
  assert.equal(find({ getAttribute: (name) => ({ id: 'gpt-trigger' })[name] }), labelledMenu);
  assert.equal(find({ getAttribute: () => null }), null);
});

test('GPT New Chat metadata and collector keep the observed glyph plus legacy sprites', async () => {
  const [contentSource, collectorSource] = await Promise.all([
    readFile(contentPath, 'utf8'),
    readFile(collectorPath, 'utf8'),
  ]);
  const descriptor = metadata.TARGET_DESCRIPTORS.find(
    (target) => target.targetId === 'new-gpt-conversation-item',
  );

  assert.deepEqual(descriptor.searchNeedles, [
    '#square-and-pencil-light-16',
    '#compose',
    '#3a5c87',
  ]);
  assert.match(
    contentSource,
    /newGptConversationMenuItem:[\s\S]*?'#square-and-pencil-light-16'[\s\S]*?'#compose'[\s\S]*?'#3a5c87'/,
  );
  assert.match(
    collectorSource,
    /GPT_MENU_ITEM_ICON_SELECTORS = Object\.freeze\(\[[\s\S]*?#square-and-pencil-light-16[\s\S]*?#compose[\s\S]*?#3a5c87[\s\S]*?\]\)/,
  );
  assert.doesNotMatch(contentSource, /fallbackText: 'New chat'/);
  assert.doesNotMatch(collectorSource, /M12\.1338 5\.94433|#ba3792/);
});
