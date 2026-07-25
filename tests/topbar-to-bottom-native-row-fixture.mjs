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
  'function hasActionableConversationHeaderControls',
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
  constructor(hasInteractiveControl) {
    this.hasInteractiveControl = hasInteractiveControl;
  }

  querySelector(selector) {
    assert.equal(
      selector,
      'button, a[href], [role="button"]',
      'header readiness should use structural interactive controls',
    );
    return this.hasInteractiveControl ? {} : null;
  }
}

const headerActionsContext = vm.createContext({
  Element: FakeHeaderActionsElement,
  emptyActions: new FakeHeaderActionsElement(false),
  populatedActions: new FakeHeaderActionsElement(true),
});
vm.runInContext(
  `${contentSource.slice(headerActionsHelperStart, headerActionsHelperEnd)}
globalThis.emptyReady = hasActionableConversationHeaderControls(emptyActions);
globalThis.populatedReady = hasActionableConversationHeaderControls(populatedActions);`,
  headerActionsContext,
  { filename: 'topbar-header-actions-helper.js' },
);
assert.equal(
  headerActionsContext.emptyReady,
  false,
  'the blank-chat empty header-actions placeholder must remain in the native header',
);
assert.equal(
  headerActionsContext.populatedReady,
  true,
  'conversation header actions should become movable once native controls materialize',
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
assert.doesNotMatch(
  controllerSource,
  /setInterval\(/,
  'bottom-bar first-message repair should not add a permanent polling interval',
);

console.log('topbar-to-bottom native row and header preservation are wired');
