import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const helperStart = contentSource.indexOf('function findNativeComposerUtilityRow');
const helperEnd = contentSource.indexOf('function createBottomBarController', helperStart);

assert.ok(helperStart >= 0 && helperEnd > helperStart, 'native utility-row helper should exist');

class FakeElement {
  constructor({ id = '', hidden = false, row = null, buttons = 0, menuButtons = 0 } = {}) {
    this.id = id;
    this.hidden = hidden;
    this.firstElementChild = row;
    this.nextElementSibling = null;
    this.buttons = buttons;
    this.menuButtons = menuButtons;
  }

  querySelectorAll(selector) {
    if (selector === 'button') return Array.from({ length: this.buttons }, () => ({}));
    if (selector === 'button[aria-haspopup="menu"]') {
      return Array.from({ length: this.menuButtons }, () => ({}));
    }
    return [];
  }
}

const status = new FakeElement();
const oldBottomBar = new FakeElement({ id: 'bottomBarContainer' });
const suggestions = new FakeElement({
  row: new FakeElement({ buttons: 4, menuButtons: 0 }),
});
const uploadInput = new FakeElement();
const nativeRow = new FakeElement({ buttons: 2, menuButtons: 2 });
const nativeUtilityContainer = new FakeElement({ row: nativeRow });
const composerForm = new FakeElement();

composerForm.nextElementSibling = status;
status.nextElementSibling = oldBottomBar;
oldBottomBar.nextElementSibling = suggestions;
suggestions.nextElementSibling = uploadInput;
uploadInput.nextElementSibling = nativeUtilityContainer;

const context = vm.createContext({
  Element: FakeElement,
  HTMLElement: FakeElement,
  snapshot: { mountAfterEl: composerForm },
});

vm.runInContext(
  `${contentSource.slice(helperStart, helperEnd)}
globalThis.result = findNativeComposerUtilityRow(snapshot);`,
  context,
  { filename: 'topbar-native-row-helper.js' },
);

assert.equal(
  context.result,
  nativeRow,
  'the resolver should skip intervening status, extension, suggestion, and upload siblings',
);

const hydratingRow = new FakeElement({ buttons: 1, menuButtons: 1 });
const hydratingContainer = new FakeElement({ row: hydratingRow });
const hydratingComposerForm = new FakeElement();
hydratingComposerForm.nextElementSibling = hydratingContainer;

const hydratingContext = vm.createContext({
  Element: FakeElement,
  HTMLElement: FakeElement,
  snapshot: { mountAfterEl: hydratingComposerForm },
});
vm.runInContext(
  `${contentSource.slice(helperStart, helperEnd)}
globalThis.result = findNativeComposerUtilityRow(snapshot);`,
  hydratingContext,
  { filename: 'topbar-hydrating-native-row-helper.js' },
);
assert.equal(
  hydratingContext.result,
  hydratingRow,
  'a one-button native menu row should be usable while the blank Work utility row hydrates',
);

const provisionalRow = new FakeElement({ buttons: 1, menuButtons: 1 });
const provisionalContainer = new FakeElement({ row: provisionalRow });
const completeRow = new FakeElement({ buttons: 2, menuButtons: 1 });
const completeContainer = new FakeElement({ row: completeRow });
const competingComposerForm = new FakeElement();
competingComposerForm.nextElementSibling = provisionalContainer;
provisionalContainer.nextElementSibling = completeContainer;

const competingContext = vm.createContext({
  Element: FakeElement,
  HTMLElement: FakeElement,
  snapshot: { mountAfterEl: competingComposerForm },
});
vm.runInContext(
  `${contentSource.slice(helperStart, helperEnd)}
globalThis.result = findNativeComposerUtilityRow(snapshot);`,
  competingContext,
  { filename: 'topbar-competing-native-row-helper.js' },
);
assert.equal(
  competingContext.result,
  completeRow,
  'a complete native utility row should win over an earlier hydrating candidate',
);

const standaloneGateStart = contentSource.indexOf('function shouldHoldStandaloneWorkBottomBar');
const standaloneGateEnd = contentSource.indexOf('function createBottomBarController', standaloneGateStart);
assert.ok(
  standaloneGateStart >= 0 && standaloneGateEnd > standaloneGateStart,
  'blank-Work standalone visibility gate should exist',
);
const standaloneGateContext = vm.createContext({
  location: { pathname: '/' },
  mode: '',
  getNativeChatWorkSurfaceMode: () => standaloneGateContext.mode,
});
vm.runInContext(
  `${contentSource.slice(standaloneGateStart, standaloneGateEnd)}
globalThis.holdUnknownWithoutNativeRow = shouldHoldStandaloneWorkBottomBar(false);
globalThis.mode = 'chat';
globalThis.holdChatWithoutNativeRow = shouldHoldStandaloneWorkBottomBar(false);
globalThis.mode = 'work';
globalThis.holdWorkWithoutNativeRow = shouldHoldStandaloneWorkBottomBar(false);
globalThis.holdWorkWithNativeRow = shouldHoldStandaloneWorkBottomBar(true);`,
  standaloneGateContext,
  { filename: 'topbar-blank-work-standalone-gate.js' },
);
assert.equal(
  standaloneGateContext.holdUnknownWithoutNativeRow,
  true,
  'an unresolved blank-chat mode should stay pending during cold hydration',
);
assert.equal(
  standaloneGateContext.holdChatWithoutNativeRow,
  false,
  'blank Chat may use the standalone fallback when no native utility row exists',
);
assert.equal(
  standaloneGateContext.holdWorkWithoutNativeRow,
  true,
  'blank Work should keep a standalone fallback pending until the native utility row appears',
);
assert.equal(
  standaloneGateContext.holdWorkWithNativeRow,
  false,
  'blank Work should reveal normally once the native utility row is available',
);

assert.doesNotMatch(
  contentSource.slice(helperStart, helperEnd),
  /Choose project|Plugins/i,
  'native utility-row detection should not depend on localized button text',
);

const bottomBarCssStart = contentSource.indexOf('function getBottomBarCss');
const bottomBarCssEnd = contentSource.indexOf('function injectBottomBarStyles', bottomBarCssStart);
const bottomBarCssSource = contentSource.slice(bottomBarCssStart, bottomBarCssEnd);

assert.doesNotMatch(
  bottomBarCssSource,
  /#page-header|\.draggable\.sticky\.top-0/,
  'Move Top Bar to Bottom must not hide or resize the native page header',
);

const headerActionsHelperStart = contentSource.indexOf(
  'function hasRelocatableConversationHeaderControls',
);
const headerActionsHelperEnd = contentSource.indexOf(
  'function findHeaderConversationActions',
  headerActionsHelperStart,
);
assert.ok(
  headerActionsHelperStart >= 0 && headerActionsHelperEnd > headerActionsHelperStart,
  'conversation-header action readiness helper should exist',
);

class FakeHeaderActionsElement {
  constructor(controlKind = 'none', { connected = true } = {}) {
    this.controlKind = controlKind;
    this.isConnected = connected;
    this.parentElement = null;
    this.parentNode = null;
    this.children = [];
  }

  querySelector(selector) {
    assert.equal(
      selector,
      'button[data-testid="share-chat-button"], button[data-testid="conversation-options-button"]',
      'header relocation should use stable post-conversation controls',
    );
    return this.controlKind === 'conversation' ? {} : null;
  }

  insertBefore(child, anchor) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
    }
    const anchorIndex = anchor ? this.children.indexOf(anchor) : -1;
    if (anchorIndex >= 0) {
      this.children.splice(anchorIndex, 0, child);
    } else {
      this.children.push(child);
    }
    child.parentElement = this;
    child.parentNode = this;
  }
}

const nativeActionsHome = new FakeHeaderActionsElement();
const nativeActionsAnchor = new FakeHeaderActionsElement();
nativeActionsHome.children = [nativeActionsAnchor];
nativeActionsAnchor.parentElement = nativeActionsHome;
nativeActionsAnchor.parentNode = nativeActionsHome;
const bottomRightSlot = new FakeHeaderActionsElement();
const emptyMovedActions = new FakeHeaderActionsElement();
const preConversationMovedActions = new FakeHeaderActionsElement('pre-conversation');
bottomRightSlot.children = [emptyMovedActions, preConversationMovedActions];
emptyMovedActions.parentElement = bottomRightSlot;
emptyMovedActions.parentNode = bottomRightSlot;
preConversationMovedActions.parentElement = bottomRightSlot;
preConversationMovedActions.parentNode = bottomRightSlot;
const populatedMovedActions = new FakeHeaderActionsElement('conversation');
populatedMovedActions.parentElement = bottomRightSlot;
populatedMovedActions.parentNode = bottomRightSlot;

const headerActionsContext = vm.createContext({
  Element: FakeHeaderActionsElement,
  SELECTORS: {
    CONVERSATION_HEADER_RELOCATION_CONTROLS:
      'button[data-testid="share-chat-button"], button[data-testid="conversation-options-button"]',
  },
  emptyActions: new FakeHeaderActionsElement(),
  preConversationActions: new FakeHeaderActionsElement('pre-conversation'),
  populatedActions: new FakeHeaderActionsElement('conversation'),
  nativeActionsHome,
  nativeActionsAnchor,
  emptyMovedActions,
  preConversationMovedActions,
  populatedMovedActions,
});
vm.runInContext(
  `${contentSource.slice(headerActionsHelperStart, headerActionsHelperEnd)}
globalThis.emptyReady = hasRelocatableConversationHeaderControls(emptyActions);
globalThis.preConversationReady = hasRelocatableConversationHeaderControls(preConversationActions);
globalThis.populatedReady = hasRelocatableConversationHeaderControls(populatedActions);
globalThis.emptyRestored = restoreInactiveConversationHeaderActions(
  emptyMovedActions,
  nativeActionsHome,
  nativeActionsAnchor,
);
globalThis.preConversationRestored = restoreInactiveConversationHeaderActions(
  preConversationMovedActions,
  nativeActionsHome,
  nativeActionsAnchor,
);
globalThis.populatedRestored = restoreInactiveConversationHeaderActions(
  populatedMovedActions,
  nativeActionsHome,
  nativeActionsAnchor,
);`,
  headerActionsContext,
  { filename: 'topbar-header-actions-helper.js' },
);
assert.equal(
  headerActionsContext.emptyReady,
  false,
  'the blank-chat empty header-actions placeholder must remain in the native header',
);
assert.equal(
  headerActionsContext.preConversationReady,
  false,
  'temporary and group-chat controls must remain in the native header before a conversation exists',
);
assert.equal(
  headerActionsContext.populatedReady,
  true,
  'conversation header actions should become movable once stable post-conversation controls materialize',
);
assert.equal(
  headerActionsContext.emptyRestored,
  true,
  'an emptied Chat-only actions container should return to its native header parent in Work',
);
assert.equal(
  headerActionsContext.preConversationRestored,
  true,
  'pre-conversation controls should return to their native header parent',
);
assert.equal(
  preConversationMovedActions.parentElement,
  nativeActionsHome,
  'pre-conversation controls should not remain mounted in the extension bottom bar',
);
assert.equal(
  emptyMovedActions.parentElement,
  nativeActionsHome,
  'the native actions placeholder should be restored before its original sibling anchor',
);
assert.equal(
  nativeActionsHome.children[0],
  emptyMovedActions,
  'native header ordering should be preserved when the placeholder is restored',
);
assert.equal(
  headerActionsContext.populatedRestored,
  false,
  'stable post-conversation controls should remain eligible for the bottom-right slot',
);

class FakeMutationElement {
  constructor(id = '') {
    this.id = id;
    this.parentElement = null;
    this.children = [];
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
    }
    this.children.push(child);
    child.parentElement = this;
  }

  closest(selector) {
    if (selector !== '#bottomBarContainer') return null;
    let current = this;
    while (current) {
      if (current.id === 'bottomBarContainer') return current;
      current = current.parentElement;
    }
    return null;
  }

  contains(node) {
    let current = node;
    while (current) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }

  matches() {
    return false;
  }

  querySelector() {
    return null;
  }
}

const mutationHelpersStart = contentSource.indexOf('function nodeIsInsideBottomBar');
const mutationHelpersEnd = contentSource.indexOf(
  'function maybeStartNonCriticalHelpers',
  mutationHelpersStart,
);
assert.ok(
  mutationHelpersStart >= 0 && mutationHelpersEnd > mutationHelpersStart,
  'bottom-bar mutation classifiers should exist',
);

const mutationRoot = new FakeMutationElement('bottomBarContainer');
const mutationLeft = new FakeMutationElement('bottomBarLeft');
const mutationRight = new FakeMutationElement('bottomBarRight');
const trackedHeaderActions = new FakeMutationElement('conversation-header-actions');
const shareButton = new FakeMutationElement();
const optionsButton = new FakeMutationElement();
const staticButton = new FakeMutationElement();
mutationRoot.appendChild(mutationLeft);
mutationRoot.appendChild(mutationRight);
mutationRight.appendChild(trackedHeaderActions);
trackedHeaderActions.appendChild(shareButton);
trackedHeaderActions.appendChild(optionsButton);
mutationLeft.appendChild(staticButton);

const trackedHeaderMutation = {
  target: trackedHeaderActions,
  addedNodes: [shareButton, optionsButton],
  removedNodes: [],
};
const extensionSlotMutation = {
  target: mutationLeft,
  addedNodes: [staticButton],
  removedNodes: [],
};
const mutationContext = vm.createContext({
  Element: FakeMutationElement,
  RELEVANT_MUTATION_SELECTORS: [],
  SELECTORS: {},
  state: {
    root: mutationRoot,
    mountedAnchor: null,
    composerContainer: null,
    modelButton: null,
    headerActions: trackedHeaderActions,
  },
  trackedHeaderMutation,
  extensionSlotMutation,
});
vm.runInContext(
  `${contentSource.slice(mutationHelpersStart, mutationHelpersEnd)}
globalThis.trackedHeaderInternal = isInternalBottomBarMutation(trackedHeaderMutation);
globalThis.trackedHeaderRelevant = isRelevantMutation(trackedHeaderMutation);
globalThis.extensionSlotInternal = isInternalBottomBarMutation(extensionSlotMutation);
globalThis.extensionSlotRelevant = isRelevantMutation(extensionSlotMutation);`,
  mutationContext,
  { filename: 'topbar-header-actions-mutation-helper.js' },
);
assert.equal(
  mutationContext.trackedHeaderRelevant,
  true,
  'ChatGPT hydration inside the moved native actions container should remain relevant',
);
assert.equal(
  mutationContext.trackedHeaderInternal,
  false,
  'ChatGPT hydration inside the moved native actions container must not be discarded as extension-internal',
);
assert.equal(
  mutationContext.extensionSlotInternal,
  true,
  'purely extension-owned bottom-bar slot changes should remain internal',
);
assert.equal(
  mutationContext.extensionSlotRelevant,
  false,
  'purely extension-owned bottom-bar slot changes should remain ignorable',
);

const controllerStart = contentSource.indexOf('function createBottomBarController');
const controllerEnd = contentSource.indexOf(
  '// -------------------- Shared helpers used after controller starts',
  controllerStart,
);
const controllerSource = contentSource.slice(controllerStart, controllerEnd);
assert.match(
  controllerSource,
  /performance\.now\(\) < state\.suppressObserverUntil[\s\S]*mutations\.some\(isRelevantMutation\)[\s\S]*scheduleReconcileAfterSuppression\(\)/,
  'relevant first-message mutations should be deferred instead of discarded during suppression',
);
assert.match(
  controllerSource,
  /function scheduleReconcileAfterSuppression\(\)[\s\S]*window\.setTimeout\([\s\S]*scheduleReconcile\('mutation:relevant_during_suppression'\)/,
  'suppressed relevant mutations should schedule one bounded post-suppression reconcile',
);
assert.match(
  controllerSource,
  /const holdStandaloneWorkBar = shouldHoldStandaloneWorkBottomBar\(state\.usesNativeUtilityRow\)[\s\S]*state\.revealed = false[\s\S]*root\.dataset\.pending = 'true'/,
  'an already-revealed SPA shell should return to pending instead of flashing standalone on blank Work',
);
assert.match(
  controllerSource,
  /function getRevealDecision[\s\S]*shouldHoldStandaloneWorkBottomBar\(state\.usesNativeUtilityRow\)[\s\S]*shouldReveal:\s*false/,
  'the initial reveal decision should wait for blank Work native-row readiness',
);
const relevantMutationStart = controllerSource.indexOf('function isRelevantMutation');
const trackedHeaderMutationIndex = controllerSource.indexOf(
  'elementTouchesTrackedNode(target, state.headerActions)',
  relevantMutationStart,
);
const outsideBottomBarGuardIndex = controllerSource.indexOf(
  "target && !target.closest('#bottomBarContainer')",
  relevantMutationStart,
);
assert.ok(
  trackedHeaderMutationIndex >= 0 &&
    outsideBottomBarGuardIndex > trackedHeaderMutationIndex,
  'tracked header-action child changes should reconcile even while the native container is mounted in the bottom bar',
);
assert.doesNotMatch(
  controllerSource,
  /setInterval\(/,
  'bottom-bar first-message repair should not add a permanent polling interval',
);

console.log('topbar-to-bottom native row and header preservation are wired');
