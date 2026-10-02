import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// This fixture starts at the page-level handler; Chrome's browser-menu accelerator is external.
const [contentSource, optionsStorageSource, popupSource, popupHtmlSource] = await Promise.all([
  readFile(new URL('../extension/content.js', import.meta.url), 'utf8'),
  readFile(new URL('../extension/options-storage.js', import.meta.url), 'utf8'),
  readFile(new URL('../extension/popup.js', import.meta.url), 'utf8'),
  readFile(new URL('../extension/popup.html', import.meta.url), 'utf8'),
]);

const extractBetween = (startMarker, endMarker, name) => {
  const start = contentSource.indexOf(startMarker);
  const end = contentSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${name} source markers should remain inspectable`);
  return contentSource.slice(start, end).replace(/^ {4}/gm, '');
};

const matchesShortcutKeySource = contentSource.match(
  / {4}function matchesShortcutKey\(setting, event\) \{[\s\S]*?\n {4}\}/,
)?.[0];
const getEffectiveShortcutSettingSource = contentSource.match(
  / {4}const getEffectiveShortcutSetting = \(storageKey\) => \{[\s\S]*?\n {4}\};/,
)?.[0];
const findMatchedAltShortcutActionKeySource = contentSource.match(
  / {4}const findMatchedAltShortcutActionKey = \(event\) => \{[\s\S]*?\n {4}\};/,
)?.[0];
const runAltShortcutActionSource = contentSource.match(
  / {4}const runAltShortcutAction = \(storageKey, event, options = \{\}\) => \{[\s\S]*?\n {4}\};/,
)?.[0];
const runMatchedAltShortcutSource = contentSource.match(
  / {4}const runMatchedAltShortcut = \(event\) => \{[\s\S]*?\n {4}\};/,
)?.[0];
const shouldIgnoreShortcutEventSource = extractBetween(
  '    const shouldIgnoreShortcutEvent =',
  '    const getShortcutKeyIdentifier =',
  'shortcut event guard',
);
const getShortcutKeyIdentifierSource = contentSource.match(
  / {4}const getShortcutKeyIdentifier = \(event\) =>[\s\S]*?;\n/,
)?.[0];
const hasUnexpectedAltShortcutModifierSource = contentSource.match(
  / {4}const hasUnexpectedAltShortcutModifier = \(event\) =>[\s\S]*?;\n/,
)?.[0];
const handleAltShortcutEventSource = contentSource.match(
  / {4}const handleAltShortcutEvent = \(event, keyIdentifier, isPrimaryControlPressed\) => \{[\s\S]*?\n {4}\};/,
)?.[0];
const runEditMessageShortcutSource = contentSource.match(
  / {4}function runEditMessageShortcut\(\) \{[\s\S]*?\n {4}\}/,
)?.[0];
const altDispatcherStart = contentSource.indexOf(
  "    document.addEventListener(\n      'keydown',",
  contentSource.indexOf('const handleAltShortcutEvent ='),
);
const altDispatcherEnd = contentSource.indexOf('\n    );', altDispatcherStart);
const altDispatcherSource =
  altDispatcherStart >= 0 && altDispatcherEnd > altDispatcherStart
    ? contentSource.slice(altDispatcherStart, altDispatcherEnd + '\n    );'.length)
    : null;

for (const [source, name] of [
  [matchesShortcutKeySource, 'shortcut key matcher'],
  [getEffectiveShortcutSettingSource, 'effective shortcut lookup'],
  [findMatchedAltShortcutActionKeySource, 'Alt shortcut registry lookup'],
  [runAltShortcutActionSource, 'Alt action runner'],
  [runMatchedAltShortcutSource, 'matched Alt action runner'],
  [shouldIgnoreShortcutEventSource, 'shortcut event guard'],
  [getShortcutKeyIdentifierSource, 'shortcut key identifier'],
  [hasUnexpectedAltShortcutModifierSource, 'Alt modifier guard'],
  [handleAltShortcutEventSource, 'Alt shortcut routing'],
  [runEditMessageShortcutSource, 'Edit shortcut action'],
  [altDispatcherSource, 'document keydown dispatcher'],
]) {
  assert.ok(source, `The ${name} should remain inspectable`);
}

assert.match(
  contentSource,
  /shortcutKeyEdit:\s*runEditMessageShortcut,/,
  'The Alt action registry should route shortcutKeyEdit to the Edit action',
);
const defaultEditCode = contentSource.match(/^\s*shortcutKeyEdit:\s*'([^']+)',\s*$/m)?.[1];
assert.ok(defaultEditCode, 'The default Edit shortcut should remain inspectable');
assert.equal(defaultEditCode, 'KeyE', 'The runtime Edit default should be Alt+E');
assert.match(popupSource, /shortcutKeyEdit:\s*'KeyE'/);
assert.match(popupHtmlSource, /id="shortcutKeyEdit"[\s\S]*?value="e"/);
assert.match(popupHtmlSource, /id="shortcutKeySendEdit"[\s\S]*?value="d"/);

let optionsConfig;
function OptionsSync(config) {
  optionsConfig = config;
}
OptionsSync.migrations = { removeUnused() {} };
const optionsContext = { console, OptionsSync };
optionsContext.globalThis = optionsContext;
runInNewContext(optionsStorageSource, optionsContext, { filename: 'extension/options-storage.js' });
assert.equal(optionsConfig.defaults.shortcutKeyEdit, 'e');

const createStoredSettings = (overrides) => {
  const stored = { ...optionsConfig.defaults };
  Object.entries(optionsConfig.defaults).forEach(([key, value]) => {
    if (Array.isArray(value)) stored[key] = value.slice();
  });
  return { ...stored, ...overrides };
};
const migrateStoredSettings = (stored) => {
  optionsConfig.migrations.forEach((migration) => {
    migration(stored, optionsConfig.defaults);
  });
  return stored;
};

assert.equal(
  migrateStoredSettings(createStoredSettings({ shortcutKeyEdit: 'e' })).shortcutKeyEdit,
  'e',
  'the Alt+E default should remain stored as configured',
);
assert.equal(
  migrateStoredSettings(createStoredSettings({ shortcutKeyEdit: 'KeyE' })).shortcutKeyEdit,
  'KeyE',
  'the KeyboardEvent.code representation should remain stored as configured',
);
const customCollision = migrateStoredSettings(
  createStoredSettings({ shortcutKeyEdit: 'e', shortcutKeyToggleSidebar: 'KeyM' }),
);
assert.equal(customCollision.shortcutKeyEdit, 'e');
assert.equal(customCollision.shortcutKeyToggleSidebar, 'KeyM');
const modelPickerCollision = migrateStoredSettings(
  createStoredSettings({ shortcutKeyEdit: 'e', modelPickerKeyCodesLatest: ['KeyM'] }),
);
assert.equal(modelPickerCollision.shortcutKeyEdit, 'e');
assert.deepEqual(modelPickerCollision.modelPickerKeyCodesLatest, ['KeyM']);
const customEditKey = migrateStoredSettings(createStoredSettings({ shortcutKeyEdit: 'z' }));
assert.equal(customEditKey.shortcutKeyEdit, 'z', 'other custom Edit values must remain');

const directClickSource = contentSource.match(
  /const clickElementLikeUser = \(el\) => \{[\s\S]*?\n\};/,
)?.[0];
assert.ok(directClickSource, 'The shared click-like-user helper should remain inspectable');

const editTargetSource = extractBetween(
  '      const EDIT_ICON_TOKENS =',
  '      const getEditButtonData =',
  'Edit target validation',
);
const editActivationSource = extractBetween(
  '      const clickEditButton =',
  '      const getScrollContainerMetrics',
  'Edit button activation',
);
const openEditSource = contentSource
  .match(/ {6}const openEditButton = \(button\) => \{[\s\S]*?\n {6}\};/)?.[0]
  ?.replace(/^ {6}/gm, '');
assert.ok(openEditSource, 'The Edit state opener should remain inspectable');

class FixtureMouseEvent {
  constructor(type, init) {
    this.type = type;
    this.init = init;
  }
}

class FixturePointerEvent extends FixtureMouseEvent {}

class FixtureTurn {
  constructor(role) {
    this.attributes = { 'data-turn': role };
    this.isConnected = true;
    this.editField = null;
    this.enteredEditMode = false;
    this.submitCount = 0;
    this.submittedText = null;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
}

class FixtureEditButton {
  constructor(turn, attributes = {}) {
    this.turn = turn;
    this.attributes = { type: 'button', ...attributes };
    this.type = this.attributes.type;
    this.disabled = this.attributes.disabled === true;
    this.isConnected = true;
    this.rect = { left: 20, top: 30, width: 24, height: 24 };
    this.events = [];
    this.clickCount = 0;
    this.focusCount = 0;
    this.focusOptions = null;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  closest(selector) {
    if (selector === '[data-turn-key], [data-testid^="conversation-turn-"]') {
      return this.turn;
    }
    return null;
  }

  getBoundingClientRect() {
    return this.rect;
  }

  focus(options) {
    this.focusCount += 1;
    this.focusOptions = options;
  }

  dispatchEvent(event) {
    this.events.push(event.type);
    return true;
  }

  click() {
    this.clickCount += 1;
    this.events.push('click');
    if (this.type === 'submit') {
      this.turn.submitCount += 1;
      this.turn.submittedText = this.turn.editField?.textContent ?? null;
      return;
    }

    this.turn.editField = {
      isConnected: true,
      contenteditable: 'true',
      role: 'textbox',
      textContent: 'Original user message',
    };
    this.turn.enteredEditMode = true;
  }
}

const runtimeDependencies = [
  'const CONVERSATION_TURN_SELECTOR = \'[data-turn-key], [data-testid^="conversation-turn-"]\';',
  'const escapeAttributeSelectorFragment = (value) => String(value);',
  "const withPrefix = (selectors, prefix) => selectors.split(',').map((selector) => prefix + ' ' + selector.trim()).join(', ');",
  `const svgSelectorForTokens = (tokens) => tokens.map((token) => 'svg path[d^="' + token + '"], svg use[href*="' + token + '"]').join(', ');`,
  'const document = globalThis.document;',
  'const findOpenedEditField = (turn) => turn?.editField?.isConnected ? turn.editField : null;',
  'const handleOpenedEditField = () => { globalThis.openedEditFieldCallbackCalls += 1; };',
  'const waitForOpenedEditField = (anchor, onOpen) => {',
  '  globalThis.waitForOpenedEditFieldCalls += 1;',
  '  if (findOpenedEditField(anchor.turn)) onOpen(anchor.turn);',
  '  return true;',
  '};',
  'globalThis.openedEditFieldCallbackCalls = 0;',
  'globalThis.waitForOpenedEditFieldCalls = 0;',
].join('\n');

const userTurn = new FixtureTurn('user');
const editButton = new FixtureEditButton(userTurn);
const menuTrigger = { role: 'button', isEditControl: false };
const document = {
  activeElement: menuTrigger,
  listeners: [],
  querySelectorAll: () => [],
  addEventListener(type, listener, options) {
    this.listeners.push({ type, listener, options });
  },
};
const shortcutSettings = { shortcutKeyEdit: defaultEditCode };
const context = {
  document,
  MouseEvent: FixtureMouseEvent,
  PointerEvent: FixturePointerEvent,
  window: {
    CSP_SHORTCUTS_EFFECTIVE: shortcutSettings,
    PointerEvent: FixturePointerEvent,
  },
};

const fixtureRuntimeSource = [
  runtimeDependencies,
  directClickSource,
  'const smartClick = clickElementLikeUser;',
  editTargetSource,
  editActivationSource,
  openEditSource,
  "const hasUsableShortcutSetting = (value) => typeof value === 'string';",
  `const shortcutDefaults = { shortcutKeyEdit: ${JSON.stringify(defaultEditCode)} };`,
  `const shortcuts = { shortcutKeyEdit: ${JSON.stringify(defaultEditCode)} };`,
  matchesShortcutKeySource.replace(/^ {4}/gm, ''),
  getEffectiveShortcutSettingSource.replace(/^ {4}/gm, ''),
  'const altShortcutActions = { shortcutKeyEdit: runEditMessageShortcut };',
  'const ALT_SHORTCUT_ACTION_KEYS = Object.keys(altShortcutActions);',
  findMatchedAltShortcutActionKeySource.replace(/^ {4}/gm, ''),
  runAltShortcutActionSource.replace(/^ {4}/gm, ''),
  runMatchedAltShortcutSource.replace(/^ {4}/gm, ''),
  shouldIgnoreShortcutEventSource.replace(/^ {4}/gm, ''),
  getShortcutKeyIdentifierSource.replace(/^ {4}/gm, ''),
  hasUnexpectedAltShortcutModifierSource.replace(/^ {4}/gm, ''),
  handleAltShortcutEventSource.replace(/^ {4}/gm, ''),
  'const isMac = false;',
  'const isModelToggleShortcutEvent = () => false;',
  'const runModelPickerDigitShortcut = () => false;',
  'const runDynamicThinkingEffortShortcut = () => false;',
  'const runDynamicProThinkingEffortShortcut = () => false;',
  'const runPreviewThreadShortcut = () => false;',
  'const recordShortcutUsage = () => {};',
  'const handleCtrlShortcutEvent = () => false;',
  runEditMessageShortcutSource.replace(/^ {4}/gm, ''),
  altDispatcherSource,
  'globalThis.openEditButton = openEditButton;',
].join('\n');
runInNewContext(fixtureRuntimeSource, context);

let editRunnerCalls = 0;
context.EditMessageShortcut = {
  run() {
    editRunnerCalls += 1;
    context.openEditButton(editButton);
  },
};

const keydownListener = document.listeners.find(
  ({ type, options }) => type === 'keydown' && options?.capture === true,
)?.listener;
assert.equal(
  typeof keydownListener,
  'function',
  'The capture-phase keydown handler should register',
);

const event = {
  type: 'keydown',
  key: 'e',
  code: 'KeyE',
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  isComposing: false,
  target: menuTrigger,
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
  getModifierState: () => false,
};

keydownListener(event);

assert.equal(event.defaultPrevented, true, 'A delivered Alt+E should be claimed by the extension');
assert.equal(
  document.activeElement,
  menuTrigger,
  'The focused non-Edit menu trigger should not block routing',
);
assert.equal(editRunnerCalls, 1, 'Alt+E should route to the Edit shortcut action exactly once');
assert.equal(editButton.focusCount, 1, 'The native Edit button should be focused once');
assert.equal(editButton.focusOptions?.preventScroll, true);
assert.equal(editButton.clickCount, 1, 'The native Edit button should be activated exactly once');
assert.equal(userTurn.enteredEditMode, true, 'One native click should enter Edit state');
assert.equal(userTurn.editField?.contenteditable, 'true');
assert.equal(context.waitForOpenedEditFieldCalls, 1);
assert.equal(context.openedEditFieldCallbackCalls, 1);
assert.equal(userTurn.submitCount, 0, 'Entering Edit must not submit edited text');
assert.equal(userTurn.submittedText, null);
assert.ok(
  !editButton.events.some((type) => ['keydown', 'keyup', 'submit'].includes(type)),
  'Edit activation must not synthesize keyboard submission or a form submit',
);
assert.equal(editButton.events.filter((type) => type === 'pointerdown').length, 1);
assert.equal(editButton.events.filter((type) => type === 'pointerup').length, 1);
assert.equal(editButton.events.filter((type) => type === 'click').length, 1);

console.log('Edit shortcut dispatch fixture passed when Alt+E is delivered to the page.');
