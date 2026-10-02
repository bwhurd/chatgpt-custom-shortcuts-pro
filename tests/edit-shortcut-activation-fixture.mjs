import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const extractBetween = (startMarker, endMarker, name) => {
  const start = contentSource.indexOf(startMarker);
  const end = contentSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${name} source markers should remain inspectable`);
  return contentSource.slice(start, end).replace(/^ {6}/gm, '');
};

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
assert.doesNotMatch(
  editTargetSource,
  /aria-label/i,
  'Edit targeting must remain language-agnostic',
);

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
  "const svgSelectorForTokens = (tokens) => tokens.map((token) => 'svg path[d^=\"' + token + '\"], svg use[href*=\"' + token + '\"]').join(', ');",
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

const context = {
  document: { querySelectorAll: () => [] },
  MouseEvent: FixtureMouseEvent,
  PointerEvent: FixturePointerEvent,
  window: { PointerEvent: FixturePointerEvent },
};
runInNewContext(
  [
    runtimeDependencies,
    directClickSource,
    'const smartClick = clickElementLikeUser;',
    editTargetSource,
    editActivationSource,
    openEditSource,
    'globalThis.editSelectors = editSelectors;',
    'globalThis.openEditButton = openEditButton;',
  ].join('\n'),
  context,
);

assert.deepEqual(
  Array.from(context.editSelectors),
  ['button svg path[d^="M11.7313"], button svg use[href*="M11.7313"]'],
  'Edit should continue to target its language-independent icon structure',
);

const userTurn = new FixtureTurn('user');
const editButton = new FixtureEditButton(userTurn);
context.openEditButton(editButton);

assert.equal(editButton.focusCount, 1, 'The resolved native Edit button should be focused once');
assert.equal(editButton.focusOptions?.preventScroll, true);
assert.equal(editButton.clickCount, 1, 'Edit should be activated exactly once');
assert.equal(userTurn.enteredEditMode, true, 'One native click should enter Edit state');
assert.equal(
  userTurn.editField?.contenteditable,
  'true',
  'The Edit state should expose its native textbox',
);
assert.equal(
  context.waitForOpenedEditFieldCalls,
  1,
  'The activation should wait for the Edit state',
);
assert.equal(context.openedEditFieldCallbackCalls, 1, 'The opened Edit state should be observed');
assert.equal(userTurn.submitCount, 0, 'Entering Edit must not submit edited text');
assert.equal(userTurn.submittedText, null);
assert.ok(
  !editButton.events.some((type) => ['keydown', 'keyup', 'submit'].includes(type)),
  'Edit activation must not synthesize keyboard submission or a form submit',
);
assert.equal(editButton.events.filter((type) => type === 'pointerdown').length, 1);
assert.equal(editButton.events.filter((type) => type === 'pointerup').length, 1);
assert.equal(editButton.events.filter((type) => type === 'click').length, 1);

for (const attributes of [{ disabled: true }, { 'aria-disabled': 'true' }]) {
  const disabledTurn = new FixtureTurn('user');
  const disabledButton = new FixtureEditButton(disabledTurn, attributes);
  context.openEditButton(disabledButton);
  assert.equal(
    disabledButton.clickCount,
    0,
    'A disabled native Edit control must not be activated',
  );
  assert.equal(disabledTurn.enteredEditMode, false);
}

const assistantTurn = new FixtureTurn('assistant');
const foreignButton = new FixtureEditButton(assistantTurn);
context.openEditButton(foreignButton);
assert.equal(
  foreignButton.clickCount,
  0,
  'An Edit-looking control in a foreign turn must be rejected',
);
assert.equal(assistantTurn.enteredEditMode, false);
assert.equal(assistantTurn.submitCount, 0);

console.log('Edit shortcut activation fixture passed.');
