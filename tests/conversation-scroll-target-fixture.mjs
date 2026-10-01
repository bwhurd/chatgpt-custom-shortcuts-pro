import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const helperStart = contentSource.indexOf('const CONVERSATION_TURN_SELECTOR =');
const helperEnd = contentSource.indexOf('function getComposerTopEdge', helperStart);
const messageHelperStart = contentSource.indexOf('  function getConversationTurnMessages() {');
const messageHelperEnd = contentSource.indexOf('  function getColorAlpha', messageHelperStart);
const nextMessageStart = contentSource.indexOf('  function getNextMessagePosition(', messageHelperStart);
const nextMessageEnd = contentSource.indexOf('  function goDownOneMessage(', nextMessageStart);
const boundaryHelperStart = contentSource.indexOf('  function getMaxBoundaryScrollTop(');
const boundaryHelperEnd = contentSource.indexOf(
  '  function settleBoundaryScrollTarget(',
  boundaryHelperStart,
);
const messageScrollTargetStart = contentSource.indexOf('  function scrollToMessageTop(');
const messageScrollTargetEnd = contentSource.indexOf(
  '  function scrollToMessagePosition(',
  messageScrollTargetStart,
);

assert.notEqual(helperStart, -1, 'shared conversation scroll helper start marker is missing');
assert.notEqual(helperEnd, -1, 'shared conversation scroll helper end marker is missing');
assert.notEqual(messageHelperStart, -1, 'message-scroll helper start marker is missing');
assert.notEqual(messageHelperEnd, -1, 'message-scroll helper end marker is missing');
assert.notEqual(nextMessageStart, -1, 'downward message-target helper start marker is missing');
assert.notEqual(nextMessageEnd, -1, 'downward message-target helper end marker is missing');
assert.notEqual(boundaryHelperStart, -1, 'top/bottom boundary helper start marker is missing');
assert.notEqual(boundaryHelperEnd, -1, 'top/bottom boundary helper end marker is missing');
assert.notEqual(messageScrollTargetStart, -1, 'message scroll target caller is missing');
assert.notEqual(messageScrollTargetEnd, -1, 'message scroll target caller end marker is missing');

class FixtureElement {
  constructor({
    overflowY = 'visible',
    scrollHeight = 0,
    clientHeight = 0,
    scrollTop = 0,
    offsetTop = 0,
    rectTop = 0,
    rectHeight = 100,
    flexDirection = 'column',
  } = {}) {
    this.parentElement = null;
    this.offsetParent = null;
    this.children = [];
    this.firstElementChild = {};
    this.isConnected = true;
    this.style = {};
    this.overflowY = overflowY;
    this.scrollHeight = scrollHeight;
    this.clientHeight = clientHeight;
    this.scrollTop = scrollTop;
    this.offsetTop = offsetTop;
    this.rectTop = rectTop;
    this.rectHeight = rectHeight;
    this.flexDirection = flexDirection;
  }

  getBoundingClientRect() {
    for (let ancestor = this; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.rectHeight === 0) return { top: 0, height: 0, width: 0 };
    }
    return { top: this.rectTop, height: this.rectHeight, width: 800 };
  }

  querySelectorAll(selector) {
    return document.querySelectorAll(selector).filter((node) => this.contains(node));
  }

  append(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  contains(node) {
    for (let current = node; current; current = current.parentElement) {
      if (current === this) return true;
    }
    return false;
  }
}

const documentElement = new FixtureElement();
const body = documentElement.append(new FixtureElement());
const outerScroll = body.append(
  new FixtureElement({ overflowY: 'auto', scrollHeight: 1800, clientHeight: 900 }),
);
const conversationScroll = outerScroll.append(
  new FixtureElement({
    overflowY: 'auto',
    scrollHeight: 1589,
    clientHeight: 1079,
    scrollTop: 0,
  }),
);
const nestedScroll = conversationScroll.append(
  new FixtureElement({ overflowY: 'auto', scrollHeight: 500, clientHeight: 200 }),
);
const firstTurn = nestedScroll.append(new FixtureElement({ offsetTop: 0, rectTop: -454 }));
const secondTurn = conversationScroll.append(new FixtureElement({ offsetTop: 366, rectTop: -88 }));
const thirdTurn = nestedScroll.append(new FixtureElement({ offsetTop: 674, rectTop: 220 }));
for (const turn of [firstTurn, secondTurn, thirdTurn]) {
  turn.offsetParent = conversationScroll;
}

let selectedTurns = [firstTurn, secondTurn, thirdTurn];
let selectedUnits = [];
let selectedRoles = [];
let nativeScrollRoots = [];
let queriedSelector = '';
const document = {
  body,
  documentElement,
  scrollingElement: documentElement,
  querySelectorAll(selector) {
    queriedSelector = selector;
    if (selector === '.thread-scroll-container') return nativeScrollRoots;
    if (selector === '[data-chatgpt-search-unit-key]') return selectedUnits;
    if (selector.includes('data-message-author-role')) return selectedRoles;
    return selectedTurns;
  },
};
const helperContext = {
  document,
  Element: FixtureElement,
  HTMLElement: FixtureElement,
  getComputedStyle: (element) => ({
    overflowY: element.overflowY,
    flexDirection: element.flexDirection,
  }),
};

runInNewContext(
  `${contentSource.slice(helperStart, helperEnd)}\n${contentSource
    .slice(messageHelperStart, messageHelperEnd)
    .replace(/^  /gm, '')}\n${contentSource
    .slice(nextMessageStart, nextMessageEnd)
    .replace(/^  /gm, '')}\n${contentSource
    .slice(boundaryHelperStart, boundaryHelperEnd)
    .replace(/^  /gm, '')}\nglobalThis.scrollHelpers = { CONVERSATION_TURN_SELECTOR, getConversationTurns, getConversationTurnMessages, getScrollableContainer, getMessageTopScrollPositions, getMessageScrollTarget, getNextMessagePosition, getBoundaryScrollTop, setBoundaryScrollPosition };`,
  helperContext,
);

const {
  CONVERSATION_TURN_SELECTOR,
  getConversationTurnMessages,
  getConversationTurns,
  getScrollableContainer,
  getBoundaryScrollTop,
  setBoundaryScrollPosition,
  getMessageScrollTarget,
  getMessageTopScrollPositions,
  getNextMessagePosition,
} = helperContext.scrollHelpers;

assert.match(CONVERSATION_TURN_SELECTOR, /\[data-turn-key\]/);
assert.match(CONVERSATION_TURN_SELECTOR, /\[data-testid\^="conversation-turn-"\]/);
const conversationTurns = getConversationTurns();
assert.equal(conversationTurns.length, 3);
assert.equal(conversationTurns[0], firstTurn);
assert.equal(conversationTurns[1], secondTurn);
assert.equal(conversationTurns[2], thirdTurn);
const messageTurns = getConversationTurnMessages();
assert.equal(messageTurns.length, 3);
assert.equal(messageTurns[0], firstTurn);
assert.equal(messageTurns[1], secondTurn);
assert.equal(messageTurns[2], thirdTurn);
assert.equal(queriedSelector, CONVERSATION_TURN_SELECTOR);
assert.equal(
  getScrollableContainer(),
  conversationScroll,
  'the scroll target should be the nearest scrollable ancestor shared by all conversation turns',
);
assert.equal(conversationScroll.style.overflowAnchor, 'none');
assert.equal(conversationScroll.scrollTop, 0);
assert.equal(conversationScroll.scrollHeight, 1589);
assert.equal(conversationScroll.clientHeight, 1079);

const messagePositions = getMessageTopScrollPositions(messageTurns, conversationScroll);
assert.deepEqual(
  Array.from(messagePositions, ({ topScroll }) => topScroll),
  [0, 366, 674],
  'message positions should use their scroll-content offsets, not negative viewport coordinates',
);

const scrollOffset = 25;
const downThreshold = scrollOffset + 5;
const upThreshold = scrollOffset - 5;
const upwardTargets = messageTurns.filter(
  (turn) => turn.getBoundingClientRect().top < upThreshold,
);
assert.equal(upwardTargets.length, 2);
assert.equal(
  getMessageScrollTarget(conversationScroll, upwardTargets.at(-1), scrollOffset),
  341,
  'one-message up should target the previous turn by its content offset',
);
assert.equal(
  getMessageScrollTarget(conversationScroll, upwardTargets.at(-2), scrollOffset),
  0,
  'two-message up should clamp at the conversation top',
);

const firstDown = getNextMessagePosition(messagePositions, conversationScroll.scrollTop, downThreshold);
assert.equal(firstDown?.message, secondTurn, 'one-message down should choose the next content turn');
assert.equal(
  getMessageScrollTarget(conversationScroll, firstDown.message, scrollOffset),
  341,
  'one-message down should target the next turn by its content offset',
);

let virtualTop = conversationScroll.scrollTop;
const twoDownTargets = [];
for (let step = 0; step < 2; step++) {
  const next = getNextMessagePosition(messagePositions, virtualTop, downThreshold);
  assert.ok(next, `two-message down should find target ${step + 1}`);
  const targetTop = getMessageScrollTarget(conversationScroll, next.message, scrollOffset);
  twoDownTargets.push(targetTop);
  virtualTop = targetTop;
}
assert.deepEqual(twoDownTargets, [341, 510], 'two-message down should advance across both turns and clamp at bottom');

assert.equal(getBoundaryScrollTop(conversationScroll, 'top'), 0);
assert.equal(
  getBoundaryScrollTop(conversationScroll, 'bottom'),
  510,
  'top and bottom targets should use the same current conversation scroller',
);

const shortcutScrollActionsStart = contentSource.indexOf(
  'shortcutKeyScrollUpOneMessage: () => {',
);
const shortcutScrollActionsEnd = contentSource.indexOf('// @note Toggle Sidebar Function', shortcutScrollActionsStart);
assert.notEqual(shortcutScrollActionsStart, -1, 'native-bottom shortcut action is missing');
assert.notEqual(shortcutScrollActionsEnd, -1, 'scroll shortcut action block end marker is missing');
const shortcutScrollActions = contentSource.slice(shortcutScrollActionsStart, shortcutScrollActionsEnd);
assert.match(shortcutScrollActions, /shortcutKeyScrollUpOneMessage:[\s\S]*?goUpOneMessage\(\)/);
assert.match(shortcutScrollActions, /shortcutKeyScrollDownOneMessage:[\s\S]*?goDownOneMessage\(\)/);
assert.match(shortcutScrollActions, /shortcutKeyScrollUpTwoMessages:[\s\S]*?goUpTwoMessages\(/);
assert.match(shortcutScrollActions, /shortcutKeyScrollDownTwoMessages:[\s\S]*?goDownTwoMessages\(/);
assert.match(
  shortcutScrollActions,
  /shortcutKeyClickNativeScrollToBottom:[\s\S]*?getScrollableContainer\(\)[\s\S]*?animateBoundaryScrollTo\(el, 'bottom'\)/,
);
assert.match(
  shortcutScrollActions,
  /shortcutKeyScrollToTop:[\s\S]*?getScrollableContainer\(\)[\s\S]*?animateBoundaryScrollTo\(el, 'top'\)/,
);
assert.match(
  contentSource.slice(messageScrollTargetStart, messageScrollTargetEnd),
  /getMessageScrollTarget\(scrollContainer, message, scrollOffset\)[\s\S]*?animateMessageScrollTo\(scrollContainer, targetScrollTop\)/,
  'message shortcuts should animate to the computed content position instead of reusing viewport rect coordinates',
);

// ChatGPT retains A's connected DOM in a hidden panel when B is mounted.
const nextConversationScroll = body.append(
  new FixtureElement({ overflowY: 'auto', scrollHeight: 2000, clientHeight: 600 }),
);
const nextFirst = nextConversationScroll.append(new FixtureElement({ offsetTop: 0 }));
const nextSecond = nextConversationScroll.append(new FixtureElement({ offsetTop: 500 }));
for (const message of [nextFirst, nextSecond]) message.offsetParent = nextConversationScroll;
nativeScrollRoots = [conversationScroll, nextConversationScroll];
selectedUnits = [...selectedTurns, nextFirst, nextSecond];
conversationScroll.rectHeight = 0;
const previousTop = conversationScroll.scrollTop;
const pendingPreviousSettle = () => setBoundaryScrollPosition(conversationScroll, 'bottom');

assert.equal(getScrollableContainer(), nextConversationScroll, 'switching must select visible B');
assert.deepEqual(Array.from(getConversationTurnMessages()), [nextFirst, nextSecond]);
assert.equal(getMessageScrollTarget(nextConversationScroll, nextSecond, 25), 475);
assert.equal(setBoundaryScrollPosition(nextConversationScroll, 'bottom'), 1400);
assert.equal(nextConversationScroll.scrollTop, 1400);
assert.ok(Number.isNaN(pendingPreviousSettle()), 'pending A settle must stop when A is hidden');
assert.equal(conversationScroll.scrollTop, previousTop, 'B scrolling must leave hidden A untouched');

// Returning to A works without replacing the document or reinitializing helpers.
conversationScroll.rectHeight = 100;
nextConversationScroll.rectHeight = 0;
assert.equal(getScrollableContainer(), conversationScroll);
assert.deepEqual(Array.from(getConversationTurnMessages()), selectedTurns);
assert.ok(Number.isNaN(setBoundaryScrollPosition(nextConversationScroll, 'top')));
assert.equal(nextConversationScroll.scrollTop, 1400, 'hidden B settle must not restore B');

conversationScroll.isConnected = false;
nextConversationScroll.rectHeight = 100;
nextConversationScroll.flexDirection = 'column-reverse';
assert.equal(getScrollableContainer(), nextConversationScroll, 'detached A must be ignored');
assert.equal(getBoundaryScrollTop(nextConversationScroll, 'top'), -1400);
assert.equal(getBoundaryScrollTop(nextConversationScroll, 'bottom'), 0);

// Selector fallbacks stay scoped to the current root.
selectedUnits = selectedTurns;
selectedRoles = [nextFirst, nextSecond];
assert.deepEqual(Array.from(getConversationTurnMessages()), selectedRoles);
selectedRoles = [];
selectedTurns = [nextFirst, nextSecond];
assert.deepEqual(Array.from(getConversationTurnMessages()), selectedTurns);

// Page takeover must use negative positions in the current column-reverse scroller.
const pageTakeoverStart = contentSource.indexOf('// @note PageUp/PageDown Key Takeover Logic');
const pageKeyStart = contentSource.indexOf('  function handleKeyDown(event)', pageTakeoverStart);
const pageKeyEnd = contentSource.indexOf('  function handleUserInteraction()', pageKeyStart);
assert.notEqual(pageKeyStart, -1);
assert.notEqual(pageKeyEnd, -1);
let pageTweenOptions;
helperContext.ScrollState = { isAnimating: false };
helperContext.gsap = {
  to(target, options) {
    pageTweenOptions = options;
    target.scrollTop = options.scrollTop ?? options.scrollTo.y;
  },
};
runInNewContext(
  `${contentSource.slice(pageKeyStart, pageKeyEnd)}\nglobalThis.pageScroll = handleKeyDown;`,
  helperContext,
);
const pageEvent = (key) => ({ key, stopPropagation() {}, preventDefault() {} });
nextConversationScroll.scrollTop = 0;
helperContext.pageScroll(pageEvent('PageUp'));
assert.equal(nextConversationScroll.scrollTop, -480);
helperContext.pageScroll(pageEvent('PageDown'));
assert.equal(nextConversationScroll.scrollTop, 0);
nextConversationScroll.flexDirection = 'column';
helperContext.pageScroll(pageEvent('PageDown'));
assert.equal(nextConversationScroll.scrollTop, 480);
helperContext.pageScroll(pageEvent('PageUp'));
assert.equal(nextConversationScroll.scrollTop, 0);
nextConversationScroll.rectHeight = 0;
let inactiveTweenKilled = false;
pageTweenOptions.onUpdate.call({ kill() { inactiveTweenKilled = true; } });
assert.equal(inactiveTweenKilled, true, 'page tween must stop after its conversation is hidden');

selectedTurns = [];
selectedUnits = [];
assert.equal(getScrollableContainer(), null, 'no conversation turns should resolve to no target');

console.log('Conversation message and boundary scroll target fixture passed.');
