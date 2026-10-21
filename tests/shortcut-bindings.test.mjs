import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { parse } from 'acorn';
import bindings from '../extension/shared/shortcut-bindings.js';

const [bindingSource, popupSource, runtimeSource, storageSource] = await Promise.all(
  ['shared/shortcut-bindings.js', 'popup.js', 'content.js', 'storage.js'].map((file) =>
    readFile(new URL(`../extension/${file}`, import.meta.url), 'utf8'),
  ),
);

function declaration(source, type, name) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === type && node.id?.name === name) found.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parse(source, { ecmaVersion: 'latest' }));
  assert.equal(found.length, 1, `one real ${name} definition`);
  const [node] = found;
  return `${type === 'VariableDeclarator' ? 'const ' : ''}${source.slice(node.start, node.end)};`;
}

test('browser script loads without DOM, storage or event setup', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(bindingSource, context);
  assert.equal(context.window.CSPShortcutBindings.normalize('IntlYen'), 'IntlYen');
  assert(Object.isFrozen(context.window.CSPShortcutBindings));
});

test('canonical bindings reject invalid input and preserve legacy keys and empty sentinels', () => {
  for (const [input, expected] of [
    ['a', 'KeyA'],
    ['7', 'Digit7'],
    [',', 'Comma'],
    ['↑', 'ArrowUp'],
    ['F24', 'F24'],
    ['IntlBackslash', 'IntlBackslash'],
    ['IntlYen', 'IntlYen'],
    ['IntlRo', 'IntlRo'],
    ['Lang1', 'Lang1'],
    ['AudioVolumeMute', 'AudioVolumeMute'],
    ['NumpadEnter', 'NumpadEnter'],
    ['OSLeft', 'MetaLeft'],
  ])
    assert.equal(bindings.normalize(input), expected);
  for (const input of [
    null,
    undefined,
    {},
    4,
    '',
    ' ',
    '\u00a0',
    'KeyAB',
    'F25',
    'IntlOops',
    'toString',
    '<input>',
  ]) {
    assert.equal(bindings.normalize(input), '');
    assert.equal(bindings.normalize(input, { empty: bindings.NBSP }), bindings.NBSP);
    assert.equal(bindings.matches(input, { code: input }), false);
  }
});

test('matching prefers physical code and preserves digit/numpad equivalence', () => {
  assert(bindings.matches('IntlBackslash', { code: 'IntlBackslash', key: '<' }));
  assert(bindings.matches('IntlYen', { code: 'IntlYen', key: '¥' }));
  assert(bindings.matches('5', { code: 'Numpad5', key: 'Clear' }));
  assert(bindings.matches('Numpad5', { code: 'Digit5', key: '%' }));
  assert(bindings.matches('KeyA', { code: 'Unidentified', key: 'a' }));
  assert(bindings.matches('Space', { key: ' ' }));
  assert.equal(bindings.matches('KeyA', { code: 'KeyQ', key: 'a' }), false);
  assert.equal(bindings.equals('', ''), false);
  assert.equal(bindings.equals('garbage', 'garbage'), false);
  assert(bindings.equals('Numpad5', 'Digit5'));
  assert.equal(bindings.collisionCode('Numpad5'), 'Digit5');
});

test('labels retain platform presentation and never replace a captured physical code', () => {
  assert.equal(bindings.display('KeyA'), 'a');
  assert.equal(bindings.display('MetaLeft'), 'Win');
  assert.equal(bindings.display('MetaLeft', { isMac: true }), '⌘');
  assert.equal(bindings.display('IntlYen'), '¥');
  assert.equal(bindings.display('<input>', { empty: '' }), '');
  assert.equal(bindings.fromLabel('PgDn'), 'PageDown');
  assert.equal(bindings.fromLabel('Play/Pause'), 'MediaPlayPause');
  assert.equal(bindings.fromLabel('IntlBackslash'), 'IntlBackslash');
  assert.equal(bindings.fromLabel('bad label'), '');
});

test('real popup save/normalization and runtime matcher agree with persisted values', () => {
  const stored = {};
  const context = vm.createContext({
    window: { CSPShortcutBindings: bindings, ShortcutUtils: {}, __savingShortcutGuard: {} },
    document: { getElementById: () => null },
    chrome: {
      runtime: {},
      storage: {
        sync: {
          set: (patch, done) => {
            Object.assign(stored, patch);
            done?.();
          },
          get: (key, done) => done({ [key]: stored[key] }),
        },
      },
    },
  });
  vm.runInContext(
    [
      declaration(popupSource, 'FunctionDeclaration', 'saveShortcutValue'),
      declaration(popupSource, 'VariableDeclarator', 'normalizePopupShortcutValue'),
      declaration(runtimeSource, 'FunctionDeclaration', 'matchesShortcutKey'),
      'this.api = { saveShortcutValue, normalizePopupShortcutValue, matchesShortcutKey };',
    ].join('\n'),
    context,
  );
  for (const [value, key] of [
    ['IntlBackslash', '<'],
    ['IntlYen', '¥'],
    ['F5', 'F5'],
    ['a', 'a'],
  ]) {
    context.api.saveShortcutValue('shortcutKeySearchConversationHistory', value);
    const saved = stored.shortcutKeySearchConversationHistory;
    assert.equal(context.api.normalizePopupShortcutValue(saved), saved);
    assert(context.api.matchesShortcutKey(saved, { code: bindings.normalize(value), key }));
  }
  for (const invalid of ['', '\u00a0', 'IntlOops', '<input>']) {
    context.api.saveShortcutValue('shortcutKeySearchConversationHistory', invalid);
    assert.equal(stored.shortcutKeySearchConversationHistory, bindings.NBSP);
  }
});

test('actual portable-settings boundary normalizes scalar/profile bindings without carrying scraped state', async () => {
  let persisted;
  const defaults = {
    shortcutKeySearchConversationHistory: ',',
    selectThenCopy: 'x',
    modelPickerKeyCodesLatest: [],
    modelPickerKeyCodesLegacy: [],
    modelCatalog: null,
    moveTopBarToBottomCheckbox: false,
  };
  const context = vm.createContext({
    OPTIONS_DEFAULTS: defaults,
    window: {
      CSPShortcutBindings: bindings,
      optionsStorage: {
        getAll: async () => persisted,
        setAll: async (data) => {
          persisted = data;
        },
      },
    },
  });
  vm.runInContext(storageSource, context);
  await context.window.CloudStorage.saveLocalSettings({
    shortcutKeySearchConversationHistory: 'IntlBackslash',
    selectThenCopy: 'x',
    modelPickerKeyCodesLatest: ['IntlYen', '\u00a0', 'invalid'],
    modelPickerKeyCodesLegacy: ['F24'],
    modelCatalog: { private: true },
    moveTopBarToBottomCheckbox: false,
    unknownKey: 'KeyZ',
  });
  const loaded = await context.window.CloudStorage.loadLocalSettings();
  assert.equal(loaded.shortcutKeySearchConversationHistory, 'IntlBackslash');
  assert.equal(loaded.selectThenCopy, 'KeyX');
  assert.deepEqual(Array.from(loaded.modelPickerKeyCodesLatest), ['IntlYen', '', '']);
  assert.deepEqual(Array.from(loaded.modelPickerKeyCodesLegacy), ['F24']);
  assert.equal(loaded.moveTopBarToBottomCheckbox, false);
  assert.equal('modelCatalog' in loaded, false);
  assert.equal('unknownKey' in loaded, false);
});

test('shipped consumers load the codec before dependent scripts and ZIP inputs require it', async () => {
  const [manifestText, html, builder] = await Promise.all([
    readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'),
    readFile(new URL('../extension/popup.html', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/build-zip.js', import.meta.url), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestText.replace(/^\uFEFF/, ''));
  const idle = manifest.content_scripts.find((entry) => entry.js.includes('content.js')).js;
  assert(idle.indexOf('shared/shortcut-bindings.js') >= 0);
  assert(
    idle.indexOf('shared/shortcut-bindings.js') < idle.indexOf('shared/model-picker-labels.js'),
  );
  assert(idle.indexOf('shared/shortcut-bindings.js') < idle.indexOf('content.js'));
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  assert(scripts.indexOf('shared/shortcut-bindings.js') >= 0);
  for (const consumer of ['storage.js', 'shared/model-picker-labels.js', 'popup.js'])
    assert(scripts.indexOf('shared/shortcut-bindings.js') < scripts.indexOf(consumer));
  assert.match(builder, /const includeItems = \[[\s\S]*?'shared\/shortcut-bindings\.js'/);
});
