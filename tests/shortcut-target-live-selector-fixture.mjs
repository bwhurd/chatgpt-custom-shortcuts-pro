import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import {
  captureRenderedThreadBottomBoundary,
  findRenderedThreadScrollRoot,
} from './playwright/lib/devscrape-wide-core.mjs';

const require = createRequire(import.meta.url);
const modelPickerSelectors = require('../extension/shared/model-picker-selectors.js');
const shortcutMetadata = require('../extension/shared/shortcut-action-metadata.js');
const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');

const descriptorById = new Map(
  shortcutMetadata.TARGET_DESCRIPTORS.map((descriptor) => [descriptor.targetId, descriptor]),
);
const targetMatchesCapture = (descriptor, html) =>
  descriptor.matchGroups.some((group) => group.every((needle) => html.includes(needle)));

const expectedModelSwitcherButtonMatchGroups = [
  ['data-testid="model-switcher-dropdown-button"'],
  ['data-testid="Model-switCher-dropdown-button"'],
  ['data-codex-intelligence-trigger="true"', 'aria-haspopup="menu"'],
  ['__composer-pill', 'aria-haspopup="menu"', 'id="radix-'],
];
assert.deepEqual(
  modelPickerSelectors.getModelSwitcherButtonMatchGroups(),
  expectedModelSwitcherButtonMatchGroups,
);
const modelSwitcherButtonTarget = descriptorById.get('model-switcher-button');
assert.deepEqual(modelSwitcherButtonTarget.matchGroups, expectedModelSwitcherButtonMatchGroups);
assert.ok(
  targetMatchesCapture(
    modelSwitcherButtonTarget,
    '<button data-codex-intelligence-trigger="true" aria-haspopup="menu">',
  ),
  'The audit opener matcher should recognize the current Codex intelligence trigger',
);

const pageHeaderTarget = descriptorById.get('page-header');
assert.deepEqual(pageHeaderTarget.matchGroups, [['id="page-header"'], ['<header']]);
assert.ok(
  targetMatchesCapture(pageHeaderTarget, '<header data-app-shell-main-titlebar="true">'),
  'The header-area capture fallback should match a structural header without the legacy id',
);
const threadBottomTarget = descriptorById.get('thread-bottom');
assert.deepEqual(threadBottomTarget.matchGroups, [
  ['thread-scroll-container'],
  ['id="thread-bottom"'],
  ['id="thread-bottom-container"'],
]);
assert.equal(threadBottomTarget.kind, 'selector-list');
assert.equal(
  threadBottomTarget.matchGroups.flat().some((needle) => needle.includes('composer')),
  false,
  'the bottom scroll target should not depend on a composer marker',
);

const searchChatsDialogTarget = descriptorById.get('search-chats-dialog');
assert.deepEqual(searchChatsDialogTarget.matchGroups, [
  ['role="dialog"', '<input', 'role="combobox"', 'placeholder="Search…"'],
  ['role="dialog"', 'placeholder="Search chats..."'],
]);
assert.ok(
  targetMatchesCapture(
    searchChatsDialogTarget,
    '<div role="dialog"><input role="combobox" placeholder="Search…"></div>',
  ),
  'the Search Chats target should match the observed dialog and combobox placeholder',
);
assert.ok(
  targetMatchesCapture(
    searchChatsDialogTarget,
    '<div role="dialog"><input placeholder="Search chats..."></div>',
  ),
  'the Search Chats target should retain its legacy English placeholder match',
);
for (const unrelatedCapture of [
  '<input role="combobox" placeholder="Search…">',
  '<div role="dialog"><input placeholder="Search…"></div>',
  '<div role="dialog"><input role="combobox" placeholder="Search"></div>',
]) {
  assert.equal(
    targetMatchesCapture(searchChatsDialogTarget, unrelatedCapture),
    false,
    `the Search Chats target should reject outside-dialog, incomplete, or unrelated markup: ${unrelatedCapture}`,
  );
}

class SyntheticElement {
  constructor({ id = '', className = '', style = {}, width = 0, height = 0, text = '' } = {}) {
    this.isConnected = true;
    this.style = {
      display: 'block',
      visibility: 'visible',
      pointerEvents: 'auto',
      ...style,
    };
    this.rect = { width, height };
    this.text = text;
    this.attributes = [];
    if (id) this.setAttribute('id', id);
    if (className) this.setAttribute('class', className);
  }

  getBoundingClientRect() {
    return this.rect;
  }

  getAttribute(name) {
    return this.attributes.find((attribute) => attribute.name === name)?.value ?? null;
  }

  setAttribute(name, value) {
    const next = String(value);
    const existing = this.attributes.find((attribute) => attribute.name === name);
    if (existing) existing.value = next;
    else this.attributes.push({ name, value: next });
  }

  removeAttribute(name) {
    this.attributes = this.attributes.filter((attribute) => attribute.name !== name);
  }

  cloneNode(deep) {
    assert.equal(deep, false, 'thread-bottom capture should clone without child content');
    const clone = Object.create(SyntheticElement.prototype);
    Object.assign(clone, {
      isConnected: this.isConnected,
      style: { ...this.style },
      rect: { ...this.rect },
      text: '',
      attributes: this.attributes.map((attribute) => ({ ...attribute })),
    });
    return clone;
  }

  get outerHTML() {
    const attributes = this.attributes.map(({ name, value }) => ` ${name}="${value}"`).join('');
    return `<div${attributes}>${this.text}</div>`;
  }
}

function makeSyntheticDocument({ roots = [], boundaries = [] } = {}) {
  return {
    defaultView: {
      HTMLElement: SyntheticElement,
      getComputedStyle: (element) => element.style,
    },
    querySelectorAll(selector) {
      if (selector === '.thread-scroll-container') return roots;
      if (selector === '#thread-bottom, #thread-bottom-container') return boundaries;
      throw new Error(`Unexpected synthetic selector: ${selector}`);
    },
  };
}

const hiddenFirstRoot = new SyntheticElement({
  className: 'thread-scroll-container fixture-private-class',
  style: { display: 'none' },
  width: 600,
  height: 800,
  text: 'fixture-only content',
});
const visibleRoot = new SyntheticElement({
  className: 'thread-scroll-container fixture-generated-class',
  width: 600,
  height: 800,
  text: 'fixture-only conversation content',
});
const renderedRootDocument = makeSyntheticDocument({ roots: [hiddenFirstRoot, visibleRoot] });
assert.equal(
  findRenderedThreadScrollRoot(renderedRootDocument),
  visibleRoot,
  'thread-bottom capture should skip a hidden root before the rendered native root',
);
const renderedRootCapture = captureRenderedThreadBottomBoundary(renderedRootDocument);
assert.equal(renderedRootCapture, '<div class="thread-scroll-container"></div>');
assert.ok(
  targetMatchesCapture(threadBottomTarget, renderedRootCapture),
  'the native scroll-root capture should satisfy the thread-bottom target metadata',
);
assert.equal(
  renderedRootCapture.includes('fixture-private') || renderedRootCapture.includes('content'),
  false,
  'the native scroll-root capture should omit unrelated attributes and children',
);
assert.equal(
  captureRenderedThreadBottomBoundary(makeSyntheticDocument({ roots: [hiddenFirstRoot] })),
  '',
  'a hidden native root must not create target-presence evidence',
);

const visibleLegacyBoundary = new SyntheticElement({
  id: 'thread-bottom-container',
  width: 300,
  height: 80,
  text: 'fixture-only boundary content',
});
const legacyBoundaryCapture = captureRenderedThreadBottomBoundary(
  makeSyntheticDocument({ boundaries: [visibleLegacyBoundary] }),
);
assert.equal(legacyBoundaryCapture, '<div id="thread-bottom-container"></div>');
assert.ok(targetMatchesCapture(threadBottomTarget, legacyBoundaryCapture));

const sidebarToggleTarget = descriptorById.get('native-sidebar-toggle-control');
const expectedSidebarToggleMatchGroups = [
  ['data-app-shell-sidebar-trigger="true"'],
  ['aria-controls="app-shell-sidebar"'],
  ['data-testid="close-sidebar-button"'],
  ['aria-controls="stage-slideover-sidebar"'],
  ['aria-controls="stage-popover-sidebar"'],
  ['data-testid="open-sidebar-button"'],
];
assert.ok(sidebarToggleTarget, 'Toggle Sidebar should use the consolidated native control target');
assert.deepEqual(sidebarToggleTarget.matchGroups, expectedSidebarToggleMatchGroups);
for (const group of expectedSidebarToggleMatchGroups) {
  assert.ok(
    targetMatchesCapture(sidebarToggleTarget, `<button ${group.join(' ')}></button>`),
    `the consolidated sidebar target should retain marker group ${group.join(' + ')}`,
  );
}

const currentTargetTokens = {
  'assistant-more-actions-trigger': '#ellipsis-horizontal-light-16',
  'assistant-more-actions-branch': '#branch-light-16',
  'assistant-web-regenerate-trigger': '#arrows-clockwise-rotate-lg-light-16',
  'assistant-web-regenerate-item-try-again': '#arrows-clockwise-rotate-lg-light-16',
  'assistant-read-aloud-direct-action': 'M9.75122 4.09203',
  'temporary-chat-button': '#chat-bubble-dashed-light-20',
  'composer-web-search-action': 'M12 2c5.522',
  'composer-create-image-action': 'M7 21.005',
  'composer-deep-research-action': 'deep_research_app/icon.png',
  'composer-add-photos-files-action': 'M6.1416 10.1663',
  'dictate-start-button': '#microphone-light-16',
  'dictate-submit-button': '#arrow-up-lg-light-20',
  'stop-dictation-button': '#stop-fill-light-20',
  'cancel-dictation-button': '#xmark-lg-light-20',
  'new-gpt-conversation-item': '#compose',
};

for (const [targetId, token] of Object.entries(currentTargetTokens)) {
  const descriptor = descriptorById.get(targetId);
  assert.ok(descriptor, `${targetId} should remain in the target inventory`);
  assert.ok(
    descriptor.searchNeedles.some((needle) => needle.includes(token)),
    `${targetId} should list the current live token ${token}`,
  );
  assert.ok(contentSource.includes(token), `${targetId} should appear in the runtime source`);
}

const regenerateTriggerTarget = descriptorById.get('assistant-web-regenerate-trigger');
const expectedRegenerateTriggerSelectors = [
  '.turn-action-controls button[aria-haspopup="menu"]:has(svg use[href$="#arrows-clockwise-rotate-lg-light-16"])',
  '.turn-action-controls button[aria-haspopup="menu"]:has(svg path[d^="M14.0219 8.22363"])',
];
assert.deepEqual(regenerateTriggerTarget.searchNeedles, expectedRegenerateTriggerSelectors);
assert.deepEqual(regenerateTriggerTarget.matchGroups, [
  [
    'turn-action-controls',
    '<button',
    'aria-haspopup="menu"',
    'arrows-clockwise-rotate-lg-light-16',
  ],
  ['turn-action-controls', '<button', 'aria-haspopup="menu"', 'M14.0219 8.22363'],
]);
const regenerateTriggerCapture =
  '<div class="turn-action-controls"><button aria-haspopup="menu"><svg><use href="/assets/sprite.svg#arrows-clockwise-rotate-lg-light-16"></use></svg></button></div>';
assert.ok(
  targetMatchesCapture(regenerateTriggerTarget, regenerateTriggerCapture),
  'The web regenerate trigger should match serialized turn-action markup by structure and SVG symbol',
);
assert.equal(
  targetMatchesCapture(
    regenerateTriggerTarget,
    regenerateTriggerCapture.replace('turn-action-controls', 'other-actions'),
  ),
  false,
  'The web regenerate trigger should reject the same icon outside turn-action-controls',
);
const legacyRegenerateTriggerCapture = regenerateTriggerCapture.replace(
  '<use href="/assets/sprite.svg#arrows-clockwise-rotate-lg-light-16"></use>',
  '<path d="M14.0219 8.22363 10 12"></path>',
);
assert.ok(
  targetMatchesCapture(regenerateTriggerTarget, legacyRegenerateTriggerCapture),
  'The web regenerate trigger should retain its legacy SVG path fallback',
);
assert.equal(
  targetMatchesCapture(
    regenerateTriggerTarget,
    regenerateTriggerCapture.replace(
      'arrows-clockwise-rotate-lg-light-16',
      'ellipsis-horizontal-light-16',
    ),
  ),
  false,
  'The web regenerate trigger should reject the More Actions symbol',
);

const moreActionsTriggerTarget = descriptorById.get('assistant-more-actions-trigger');
const expectedMoreActionsTriggerSelectors = [
  '.turn-action-controls button[aria-haspopup="menu"]:has(svg use[href$="#ellipsis-horizontal-light-16"])',
  '.turn-action-controls button[aria-haspopup="menu"]:has(svg path[d^="M3.33362 6.80811"])',
];
assert.deepEqual(moreActionsTriggerTarget.searchNeedles, expectedMoreActionsTriggerSelectors);
assert.deepEqual(moreActionsTriggerTarget.matchGroups, [
  ['turn-action-controls', 'aria-haspopup="menu"', 'ellipsis-horizontal-light-16'],
  ['turn-action-controls', 'aria-haspopup="menu"', 'M3.33362 6.80811'],
]);
const moreActionsTriggerCapture =
  '<div class="turn-action-controls"><button aria-haspopup="menu"><svg><use href="/assets/sprite.svg#ellipsis-horizontal-light-16"></use></svg></button></div>';
assert.ok(
  targetMatchesCapture(moreActionsTriggerTarget, moreActionsTriggerCapture),
  'More Actions should match its current SVG symbol in turn-action controls',
);
assert.equal(
  targetMatchesCapture(moreActionsTriggerTarget, regenerateTriggerCapture),
  false,
  'More Actions should reject the regenerate control symbol',
);
assert.ok(
  targetMatchesCapture(
    moreActionsTriggerTarget,
    moreActionsTriggerCapture.replace(
      '<use href="/assets/sprite.svg#ellipsis-horizontal-light-16"></use>',
      '<path d="M3.33362 6.80811 10 12"></path>',
    ),
  ),
  'More Actions should retain its legacy SVG path fallback',
);

const regenerateTryAgainTarget = descriptorById.get('assistant-web-regenerate-item-try-again');
const expectedRegenerateTryAgainSelectors = [
  '[role="menu"] [role="menuitem"]:has(svg use[href$="#arrows-clockwise-rotate-lg-light-16"])',
  '[role="menu"] [role="menuitem"]:has(svg path[d^="M14.0219 8.22363"])',
];
assert.deepEqual(regenerateTryAgainTarget.searchNeedles, expectedRegenerateTryAgainSelectors);
assert.deepEqual(regenerateTryAgainTarget.matchGroups, [
  ['role="menu"', 'role="menuitem"', 'arrows-clockwise-rotate-lg-light-16'],
  ['role="menu"', 'role="menuitem"', 'M14.0219 8.22363'],
]);
const regenerateTryAgainCapture =
  '<div role="menu"><div role="menuitem"><svg><use href="/assets/sprite.svg#arrows-clockwise-rotate-lg-light-16"></use></svg></div></div>';
assert.ok(
  targetMatchesCapture(regenerateTryAgainTarget, regenerateTryAgainCapture),
  'Try again should match serialized menu-item markup by menu role and SVG symbol',
);
assert.equal(
  targetMatchesCapture(
    regenerateTryAgainTarget,
    regenerateTryAgainCapture.replace('role="menu"', 'role="dialog"'),
  ),
  false,
  'Try again should reject the same menu item outside a menu',
);
for (const decoySymbol of ['arrow-up-md-light-16', 'globe-slash-light-16']) {
  assert.equal(
    targetMatchesCapture(
      regenerateTryAgainTarget,
      regenerateTryAgainCapture.replace('arrows-clockwise-rotate-lg-light-16', decoySymbol),
    ),
    false,
    `Try again should reject the ${decoySymbol} menu-item symbol`,
  );
}
assert.ok(
  targetMatchesCapture(
    regenerateTryAgainTarget,
    regenerateTryAgainCapture.replace(
      '<use href="/assets/sprite.svg#arrows-clockwise-rotate-lg-light-16"></use>',
      '<path d="M14.0219 8.22363 10 12"></path>',
    ),
  ),
  'Try again should retain its legacy SVG path fallback',
);
assert.equal(
  targetMatchesCapture(
    regenerateTryAgainTarget,
    regenerateTryAgainCapture.replace('arrows-clockwise-rotate-lg-light-16', 'branch-light-16'),
  ),
  false,
  'Try again should reject a different SVG symbol',
);

const moreActionsBranchTarget = descriptorById.get('assistant-more-actions-branch');
const expectedMoreActionsBranchSelectors = [
  '[role="menu"][data-state="open"] [role="menuitem"]:has(svg use[href$="#branch-light-16"])',
  '[role="menu"][data-state="open"] [role="menuitem"]:has(svg path[d^="M11.6672 1.97461"])',
];
assert.deepEqual(moreActionsBranchTarget.searchNeedles, expectedMoreActionsBranchSelectors);
assert.deepEqual(moreActionsBranchTarget.matchGroups, [
  ['role="menu"', 'data-state="open"', 'role="menuitem"', 'branch-light-16'],
  ['role="menu"', 'data-state="open"', 'role="menuitem"', 'M11.6672 1.97461'],
]);
const moreActionsBranchCapture =
  '<div role="menu" data-state="open"><div role="menuitem"><svg><use href="/assets/sprite.svg#branch-light-16"></use></svg></div></div>';
assert.ok(
  targetMatchesCapture(moreActionsBranchTarget, moreActionsBranchCapture),
  'Branch in new chat should match its current symbol in the open action menu',
);
for (const decoySymbol of ['arrows-clockwise-rotate-lg-light-16', 'globe-slash-light-16']) {
  assert.equal(
    targetMatchesCapture(
      moreActionsBranchTarget,
      moreActionsBranchCapture.replace('branch-light-16', decoySymbol),
    ),
    false,
    `Branch in new chat should reject the ${decoySymbol} menu-item symbol`,
  );
}
assert.ok(
  targetMatchesCapture(
    moreActionsBranchTarget,
    moreActionsBranchCapture.replace(
      '<use href="/assets/sprite.svg#branch-light-16"></use>',
      '<path d="M11.6672 1.97461 10 12"></path>',
    ),
  ),
  'Branch in new chat should retain its legacy SVG path fallback',
);

const expectedComposerToolMenuOpenerSelectors = [
  'form[data-thread-find-composer="true"] button[data-composer-navigation-target="add-context"]',
  'form[data-chatgpt-composer] button[data-composer-navigation-target="add-context"]',
];
assert.ok(
  expectedComposerToolMenuOpenerSelectors.every((selector) => !selector.includes('aria-haspopup')),
  'The live Add files button does not expose aria-haspopup',
);
const composerToolMenuOpenerTarget = descriptorById.get('composer-plus-button');
assert.ok(composerToolMenuOpenerTarget, 'The composer tool-menu opener should remain inventoried');
assert.equal(composerToolMenuOpenerTarget.kind, 'selector-list');
assert.deepEqual(
  composerToolMenuOpenerTarget.searchNeedles,
  expectedComposerToolMenuOpenerSelectors,
  'The opener descriptor should use the observed form-scoped structural selectors',
);
assert.deepEqual(composerToolMenuOpenerTarget.matchGroups, [
  ['data-thread-find-composer="true"', 'data-composer-navigation-target="add-context"'],
  ['data-chatgpt-composer', 'data-composer-navigation-target="add-context"'],
]);

const composerToolMenuOpenerSelectorsSource = contentSource.match(
  / {2}const COMPOSER_TOOL_MENU_OPENER_SELECTORS = \[[\s\S]*?\n {2}\];/,
)?.[0];
const composerToolOpenerFinderSource = contentSource.match(
  / {2}const findComposerToolMenuOpener = \(\) => \{[\s\S]*?\n {2}\};/,
)?.[0];
const composerToolActionStart = contentSource.indexOf('  const COMPOSER_TOOL_ITEM_SELECTOR = [');
const composerToolActionEnd = contentSource.indexOf('\n  const sleep =', composerToolActionStart);
const composerToolSelectorsAndCuesSource = contentSource
  .slice(
    contentSource.indexOf('  const COMPOSER_TOOL_MENU_OPENER_SELECTORS = ['),
    composerToolActionEnd,
  )
  .replace(/^ {2}/gm, '');
const composerToolFinderStart = contentSource.indexOf('  const findComposerToolItemByIcon =');
const runComposerToolActionSource = contentSource.match(
  / {2}const runActionByIcon = async \(iconPathPrefix, delays = DELAYS, matchOptions\) => \{[\s\S]*?\n {2}\};/,
)?.[0];
const composerToolFinderAndOpenerSource = contentSource
  .slice(
    composerToolFinderStart,
    contentSource.indexOf('  const runActionByIcon =', composerToolFinderStart),
  )
  .replace(/^ {2}/gm, '');
assert.ok(
  composerToolMenuOpenerSelectorsSource &&
    composerToolOpenerFinderSource &&
    composerToolActionStart >= 0 &&
    composerToolActionEnd > composerToolActionStart &&
    composerToolFinderStart >= 0 &&
    composerToolFinderAndOpenerSource &&
    runComposerToolActionSource,
  'The composer tool-menu opener and action fallback should remain inspectable',
);
const composerToolOpenerSelectorContext = {};
runInNewContext(
  `${composerToolMenuOpenerSelectorsSource}\nglobalThis.openerSelectors = COMPOSER_TOOL_MENU_OPENER_SELECTORS;`,
  composerToolOpenerSelectorContext,
);
assert.deepEqual(
  Array.from(composerToolOpenerSelectorContext.openerSelectors),
  expectedComposerToolMenuOpenerSelectors,
  'The live opener selectors should match the metadata descriptor',
);
assert.doesNotMatch(
  `${composerToolMenuOpenerSelectorsSource}\n${composerToolOpenerFinderSource}\n${runComposerToolActionSource}`,
  /unified-composer|composer-plus-btn/,
  'Composer tool shortcuts must not fall back to stale composer or test-id selectors',
);

const composerToolActionState = {
  menuOpen: false,
  openerClicks: 0,
  itemClicks: 0,
  deepResearchClicks: 0,
  openerQueries: 0,
};
const hiddenComposerToolOpener = {
  isConnected: true,
  getBoundingClientRect: () => ({ width: 0, height: 32 }),
  click: () => assert.fail('The hidden composer opener must not be clicked'),
};
const visibleComposerToolOpener = {
  isConnected: true,
  getBoundingClientRect: () => ({ width: 32, height: 32 }),
  click() {
    composerToolActionState.openerClicks += 1;
    composerToolActionState.menuOpen = true;
  },
};
const composerToolMenuItem = {
  getBoundingClientRect: () => ({ top: 12, width: 180, height: 36 }),
  click() {
    composerToolActionState.itemClicks += 1;
  },
};
const deepResearchMenuItem = {
  getBoundingClientRect: () => ({ top: 48, width: 180, height: 36 }),
  click() {
    composerToolActionState.deepResearchClicks += 1;
  },
};
const composerToolMenuIcon = {
  closest(selector) {
    assert.equal(
      selector,
      'button[data-list-navigation-item="true"], div.__menu-item[tabindex], div[role="menuitem"], div[role="menuitemradio"], div[role="menuitemcheckbox"]',
    );
    return composerToolMenuItem;
  },
};
const composerToolActionContext = {
  DELAYS: { waitActionItem: 100, beforeFinalClick: 0 },
  document: {
    querySelectorAll(selector) {
      if (selector === expectedComposerToolMenuOpenerSelectors.join(', ')) {
        composerToolActionState.openerQueries += 1;
        return [hiddenComposerToolOpener, visibleComposerToolOpener];
      }
      if (selector.startsWith('svg path[d^=')) {
        return composerToolActionState.menuOpen ? [composerToolMenuIcon] : [];
      }
      if (selector.includes('img[src*="deep_research_app/icon.png"]')) {
        return composerToolActionState.menuOpen ? [{ closest: () => deepResearchMenuItem }] : [];
      }
      return [];
    },
  },
  getComputedStyle: (element) => ({
    display: element === hiddenComposerToolOpener ? 'none' : 'block',
    visibility: 'visible',
    pointerEvents: 'auto',
  }),
  buildIconSelector: (tokens) =>
    (Array.isArray(tokens) ? tokens : [tokens])
      .map((token) => `svg path[d^="${token}"]`)
      .join(', '),
  escapeAttributeSelectorFragment: (value) => String(value),
  flashBorder() {},
  smartClick: (element) => element.click(),
  waitFor: async (getter) => getter(),
  sleep: async () => {},
};
runInNewContext(
  [
    composerToolSelectorsAndCuesSource,
    composerToolFinderAndOpenerSource,
    runComposerToolActionSource.replace(/^ {2}/gm, ''),
    'globalThis.runComposerToolAction = runActionByIcon;',
  ].join('\n'),
  composerToolActionContext,
);
await composerToolActionContext.runComposerToolAction('M12 2c5.522', {
  waitActionItem: 100,
  beforeFinalClick: 0,
});
assert.equal(
  composerToolActionState.openerQueries,
  1,
  'A closed tool menu should resolve its composer opener',
);
assert.equal(
  composerToolActionState.openerClicks,
  1,
  'A closed tool menu should open exactly once',
);
assert.equal(
  composerToolActionState.itemClicks,
  1,
  'The selected tool icon target should still click exactly once',
);
await composerToolActionContext.runComposerToolAction('img:deep_research_app/icon.png', {
  waitActionItem: 100,
  beforeFinalClick: 0,
});
assert.equal(
  composerToolActionState.deepResearchClicks,
  1,
  'A list-navigation row with the observed Deep research icon should resolve and click exactly once',
);

for (const [actionId, expectedTargetRef] of [
  ['shortcutKeySearchWeb', 'composer-web-search-action'],
  ['shortcutKeyCreateImage', 'composer-create-image-action'],
  ['shortcutKeyDeepResearch', 'composer-deep-research-action'],
  ['shortcutKeyAddPhotosFiles', 'composer-add-photos-files-action'],
]) {
  const action = shortcutMetadata.SHORTCUT_ACTIONS.find(
    (candidate) => candidate.actionId === actionId,
  );
  assert.ok(action, `${actionId} should remain active`);
  assert.ok(
    action.targetRefs.includes('composer-plus-button'),
    `${actionId} should use the shared opener`,
  );
  assert.ok(
    action.targetRefs.includes(expectedTargetRef),
    `${actionId} should preserve its tool-specific icon target`,
  );
}

const deepResearchTarget = descriptorById.get('composer-deep-research-action');
assert.ok(deepResearchTarget, 'Deep research should remain inventoried');
assert.equal(deepResearchTarget.kind, 'selector-list');
assert.deepEqual(deepResearchTarget.matchGroups, [
  ['data-list-navigation-item="true"', 'deep_research_app/icon.png'],
]);

const composerTarget = descriptorById.get('prompt-textarea');
assert.ok(composerTarget, 'The composer target should remain in the target inventory');
assert.equal(composerTarget.kind, 'selector-list');
const expectedComposerSelectors = [
  'form[data-thread-find-composer="true"] div.ProseMirror[contenteditable="true"][role="textbox"]',
  'form[data-chatgpt-composer] [data-composer-markdown][contenteditable="true"][role="textbox"]',
];
const composerInputSelectorsSource = contentSource.match(
  / {2}const COMPOSER_INPUT_SELECTORS = \[[\s\S]*?\n {2}\];/,
)?.[0];
assert.ok(
  composerInputSelectorsSource,
  'The composer target selector contract should remain inspectable',
);
const composerSelectorsContext = {};
runInNewContext(
  `${composerInputSelectorsSource}\nglobalThis.composerInputSelectors = COMPOSER_INPUT_SELECTORS;`,
  composerSelectorsContext,
);
assert.deepEqual(
  Array.from(composerSelectorsContext.composerInputSelectors),
  expectedComposerSelectors,
  'Activate Input should use only the current form-scoped composer structures',
);
assert.doesNotMatch(
  composerInputSelectorsSource,
  /unified-composer|#thread-bottom-container/,
  'Activate Input must not fall back to stale composer containers',
);
assert.equal(
  composerTarget.identifier,
  'form[data-thread-find-composer="true"] div.ProseMirror[contenteditable=true][role=textbox] | form[data-chatgpt-composer] [data-composer-markdown][contenteditable=true][role=textbox]',
  'The composer descriptor should match the observed form-scoped live textbox structures',
);
assert.deepEqual(composerTarget.matchGroups, [
  ['data-thread-find-composer="true"', 'ProseMirror', 'contenteditable="true"', 'role="textbox"'],
  ['data-chatgpt-composer', 'data-composer-markdown', 'contenteditable="true"', 'role="textbox"'],
]);
assert.deepEqual(composerTarget.searchNeedles, [
  'data-thread-find-composer="true"',
  'ProseMirror',
  'contenteditable="true"',
  'role="textbox"',
  'data-chatgpt-composer',
  'data-composer-markdown',
]);

const temporaryChatTarget = descriptorById.get('temporary-chat-button');
assert.deepEqual(temporaryChatTarget.matchGroups, [
  ['#chat-bubble-dashed-light-20'],
  ['#chat-bubble-checkmark-dashed-light-20'],
]);
assert.match(
  contentSource,
  /button:has\(svg use\[href\$="#chat-bubble-dashed-light-20"\]\)/,
  'Temporary Chat should use the observed unchecked sprite selector',
);
assert.match(
  contentSource,
  /button:has\(svg use\[href\$="#chat-bubble-checkmark-dashed-light-20"\]\)/,
  'Temporary Chat should use the observed checked sprite selector',
);
assert.doesNotMatch(
  contentSource.match(/function runTemporaryChatShortcut\(\) \{[\s\S]*?\n {4}\}/)?.[0] || '',
  /aria-label|#conversation-header-actions|#chat-temp|#28a8a0|#6eabdf/,
  'Temporary Chat resolution should use observed sprites without label or stale header assumptions',
);
const temporaryChatHandlerSource = contentSource.match(
  / {4}function runTemporaryChatShortcut\(\) \{[\s\S]*?\n {4}\}/,
)?.[0];
assert.ok(
  temporaryChatHandlerSource,
  'Temporary Chat should have a directly testable runtime handler',
);
const temporaryChatSelectors = [
  'button:has(svg use[href$="#chat-bubble-dashed-light-20"])',
  'button:has(svg use[href$="#chat-bubble-checkmark-dashed-light-20"])',
];
let temporaryChatButtons = [];
const temporaryChatSelectorQueries = [];
const temporaryChatClicks = [];
const temporaryChatContext = {
  document: {
    querySelectorAll(selector) {
      temporaryChatSelectorQueries.push(selector);
      const symbol = selector.match(/href\$="#([^"]+)"/)?.[1];
      return temporaryChatButtons.filter((button) => button.href.endsWith(`#${symbol}`));
    },
  },
  isDirectActionVisible: (button) => button.visible && !button.disabled,
  smartClick: (button) => temporaryChatClicks.push(button),
};
runInNewContext(
  `${temporaryChatHandlerSource}\nglobalThis.runTemporaryChatShortcut = runTemporaryChatShortcut;`,
  temporaryChatContext,
);
const visibleTemporaryButton = {
  href: '/assets/sprite.svg#chat-bubble-dashed-light-20',
  visible: true,
  disabled: false,
};
temporaryChatButtons = [
  visibleTemporaryButton,
  { href: visibleTemporaryButton.href, visible: false, disabled: false },
  {
    href: '/assets/sprite.svg#chat-bubble-checkmark-dashed-light-20',
    visible: true,
    disabled: true,
  },
  {
    href: '/assets/sprite.svg#unrelated-control',
    ariaLabel: 'Temporary chat',
    visible: true,
    disabled: false,
  },
];
temporaryChatContext.runTemporaryChatShortcut();
assert.deepEqual(temporaryChatSelectorQueries, temporaryChatSelectors);
assert.deepEqual(temporaryChatClicks, [visibleTemporaryButton]);
temporaryChatButtons = [
  visibleTemporaryButton,
  {
    href: '/assets/sprite.svg#chat-bubble-checkmark-dashed-light-20',
    visible: true,
    disabled: false,
  },
];
temporaryChatContext.runTemporaryChatShortcut();
assert.equal(
  temporaryChatClicks.length,
  1,
  'Temporary Chat should not click when multiple visible enabled sprite targets match',
);
assert.match(
  contentSource,
  /button:has\(svg path\[d\^="M12\.4584 8\.96973"\]\)/,
  'Dictation start should target the observed icon path structurally',
);
assert.match(
  contentSource,
  /button\[type="button"\]:has\(svg path\[d\^="M14\.779 4\.27903"\]\)/,
  'Dictation cancellation should target the observed Cancel icon path structurally',
);
assert.match(
  contentSource,
  /button\[type="button"\]:has\(svg path\[d\^="M9\.31697 3\.08317"\]\)/,
  'Dictation submission should target the observed Transcribe-and-send icon path',
);
assert.match(
  contentSource,
  /button\[type="button"\]:has\(svg path\[d\^="M13\.0834 3\.91846"\]\)/,
  'Stop and Transcribe should target only the observed square Stop icon path',
);
for (const symbol of [
  '#microphone-light-16',
  '#microphone-light-20',
  '#arrow-up-lg-light-20',
  '#stop-fill-light-20',
  '#xmark-lg-light-20',
])
  assert.ok(
    contentSource.includes(`use[href$="${symbol}"]`),
    `${symbol} should be a runtime target`,
  );
const dictateStartTarget = descriptorById.get('dictate-start-button');
const expectedDictateStartSelectors = [
  'form[data-chatgpt-composer][data-thread-find-composer="true"] button:has(svg use[href$="#microphone-light-16"])',
  'form[data-chatgpt-composer][data-thread-find-composer="true"] button:has(svg use[href$="#microphone-light-20"])',
  'form[data-thread-find-composer="true"] button:has(svg path[d^="M12.4584 8.96973"])',
  'form[data-chatgpt-composer] button:has(svg path[d^="M12.4584 8.96973"])',
];
assert.equal(dictateStartTarget.kind, 'selector-list');
assert.deepEqual(
  dictateStartTarget.searchNeedles,
  expectedDictateStartSelectors,
  'Dictation start metadata should prefer exact current SVG symbols and retain observed path fallbacks',
);
const dictateSubmitTarget = descriptorById.get('dictate-submit-button');
const expectedDictateSubmitSelectors = [
  'form[data-chatgpt-composer][data-thread-find-composer="true"]:has(svg use[href$="#xmark-lg-light-20"]):has(svg use[href$="#stop-fill-light-20"]) button:has(svg use[href$="#arrow-up-lg-light-20"])',
  'form[data-thread-find-composer="true"] button[type="button"]:has(svg path[d^="M9.31697 3.08317"])',
  'form[data-chatgpt-composer] button[type="button"]:has(svg path[d^="M9.31697 3.08317"])',
];
assert.equal(dictateSubmitTarget.kind, 'selector-list');
assert.deepEqual(
  dictateSubmitTarget.searchNeedles,
  expectedDictateSubmitSelectors,
  'Dictation submit metadata should prefer the current SVG symbol and retain observed path fallbacks',
);
const dictateCancelTarget = descriptorById.get('cancel-dictation-button');
const expectedDictateCancelSelectors = [
  'form[data-chatgpt-composer][data-thread-find-composer="true"] button:has(svg use[href$="#xmark-lg-light-20"])',
  'form[data-thread-find-composer="true"] button[type="button"]:has(svg path[d^="M14.779 4.27903"])',
  'form[data-chatgpt-composer] button[type="button"]:has(svg path[d^="M14.779 4.27903"])',
];
assert.equal(dictateCancelTarget.kind, 'selector-list');
assert.deepEqual(
  dictateCancelTarget.searchNeedles,
  expectedDictateCancelSelectors,
  'Dictation cancel metadata should prefer the current SVG symbol and retain observed path fallbacks',
);
const stopDictationTarget = descriptorById.get('stop-dictation-button');
const expectedStopDictationSelectors = [
  'form[data-chatgpt-composer][data-thread-find-composer="true"] button:has(svg use[href$="#stop-fill-light-20"])',
  'form[data-thread-find-composer="true"] button[type="button"]:has(svg path[d^="M13.0834 3.91846"])',
  'form[data-chatgpt-composer] button[type="button"]:has(svg path[d^="M13.0834 3.91846"])',
];
assert.equal(stopDictationTarget.kind, 'selector-list');
assert.deepEqual(
  stopDictationTarget.searchNeedles,
  expectedStopDictationSelectors,
  'Stop and Transcribe metadata should prefer the current SVG symbol and retain observed path fallbacks',
);

const dictationCaptureCases = [
  {
    target: dictateStartTarget,
    path: 'M12.4584 8.96973',
    symbols: ['#microphone-light-16', '#microphone-light-20'],
    activeButton: false,
    matchGroups: [
      [
        '<form',
        'data-chatgpt-composer',
        'data-thread-find-composer="true"',
        '<button',
        '#microphone-light-16"',
      ],
      [
        '<form',
        'data-chatgpt-composer',
        'data-thread-find-composer="true"',
        '<button',
        '#microphone-light-20"',
      ],
      ['<form', 'data-thread-find-composer="true"', '<button', 'M12.4584 8.96973'],
      ['<form', 'data-chatgpt-composer', '<button', 'M12.4584 8.96973'],
    ],
  },
  {
    target: dictateSubmitTarget,
    path: 'M9.31697 3.08317',
    symbols: ['#arrow-up-lg-light-20'],
    activeContextSymbols: ['#xmark-lg-light-20', '#stop-fill-light-20'],
    activeButton: true,
    matchGroups: [
      [
        '<form',
        'data-chatgpt-composer',
        'data-thread-find-composer="true"',
        '#xmark-lg-light-20"',
        '#stop-fill-light-20"',
        '<button',
        '#arrow-up-lg-light-20"',
      ],
      ['<form', 'data-thread-find-composer="true"', '<button', 'type="button"', 'M9.31697 3.08317'],
      ['<form', 'data-chatgpt-composer', '<button', 'type="button"', 'M9.31697 3.08317'],
    ],
  },
  {
    target: stopDictationTarget,
    path: 'M13.0834 3.91846',
    symbols: ['#stop-fill-light-20'],
    activeButton: true,
    matchGroups: [
      [
        '<form',
        'data-chatgpt-composer',
        'data-thread-find-composer="true"',
        '<button',
        '#stop-fill-light-20"',
      ],
      ['<form', 'data-thread-find-composer="true"', '<button', 'type="button"', 'M13.0834 3.91846'],
      ['<form', 'data-chatgpt-composer', '<button', 'type="button"', 'M13.0834 3.91846'],
    ],
  },
  {
    target: dictateCancelTarget,
    path: 'M14.779 4.27903',
    symbols: ['#xmark-lg-light-20'],
    activeButton: true,
    matchGroups: [
      [
        '<form',
        'data-chatgpt-composer',
        'data-thread-find-composer="true"',
        '<button',
        '#xmark-lg-light-20"',
      ],
      ['<form', 'data-thread-find-composer="true"', '<button', 'type="button"', 'M14.779 4.27903'],
      ['<form', 'data-chatgpt-composer', '<button', 'type="button"', 'M14.779 4.27903'],
    ],
  },
];

for (const {
  target,
  path,
  symbols,
  activeContextSymbols = [],
  activeButton,
  matchGroups,
} of dictationCaptureCases) {
  assert.deepEqual(target.matchGroups, matchGroups);
  assert.ok(
    matchGroups.flat().every((needle) => !needle.includes(':has') && !needle.includes('[d^=')),
    `${target.targetId} match groups should contain serialized HTML tokens, not CSS syntax`,
  );
  const buttonType = activeButton ? ' type="button"' : '';
  for (const composerAttribute of [
    'data-thread-find-composer="true"',
    'data-chatgpt-composer="true"',
  ]) {
    const validCapture = `<form ${composerAttribute}><button${buttonType}><svg><path d="${path} 0 0"></path></svg></button></form>`;
    assert.ok(
      targetMatchesCapture(target, validCapture),
      `${target.targetId} should match its icon within either current composer form`,
    );
  }

  const wrongPathCapture = `<form data-thread-find-composer="true"><button${buttonType}><svg><path d="M0 0 wrong"></path></svg></button></form>`;
  assert.equal(
    targetMatchesCapture(target, wrongPathCapture),
    false,
    `${target.targetId} should reject a different SVG path`,
  );
  const wrongScopeCapture = `<section data-thread-find-composer="true"><button${buttonType}><svg><path d="${path} 0 0"></path></svg></button></section>`;
  assert.equal(
    targetMatchesCapture(target, wrongScopeCapture),
    false,
    `${target.targetId} should reject the icon outside a composer form`,
  );
  if (activeButton) {
    const wrongButtonTypeCapture = `<form data-thread-find-composer="true"><button><svg><path d="${path} 0 0"></path></svg></button></form>`;
    assert.equal(
      targetMatchesCapture(target, wrongButtonTypeCapture),
      false,
      `${target.targetId} should require the active control type button`,
    );
  }
  for (const symbol of symbols) {
    const activeContextMarkup = activeContextSymbols
      .map(
        (contextSymbol) =>
          `<button><svg><use href="/assets/sprite.svg${contextSymbol}"></use></svg></button>`,
      )
      .join('');
    const currentSymbolCapture = `<form data-chatgpt-composer="" data-thread-find-composer="true">${activeContextMarkup}<button><svg><use href="/assets/sprite.svg${symbol}"></use></svg></button></form>`;
    assert.ok(
      targetMatchesCapture(target, currentSymbolCapture),
      `${target.targetId} should match exact current SVG symbol markup without requiring a type attribute`,
    );
    const wrongSymbolCapture = currentSymbolCapture.replace(symbol, '#voice-regular-20');
    assert.equal(
      targetMatchesCapture(target, wrongSymbolCapture),
      false,
      `${target.targetId} should reject the Voice or another wrong SVG symbol`,
    );
    const wrongSymbolScope = currentSymbolCapture
      .replace('<form ', '<section ')
      .replace('</form>', '</section>');
    assert.equal(
      targetMatchesCapture(target, wrongSymbolScope),
      false,
      `${target.targetId} should reject its symbol outside the composer form`,
    );
  }
  if (target === dictateSubmitTarget) {
    const ordinarySendOnly =
      '<form data-chatgpt-composer="" data-thread-find-composer="true"><button><svg><use href="/assets/sprite.svg#arrow-up-lg-light-20"></use></svg></button></form>';
    assert.equal(
      targetMatchesCapture(target, ordinarySendOnly),
      false,
      'The ordinary composer Send arrow-up symbol must not match without active Cancel and Stop controls',
    );
  }
}

const stopAndTranscribeAction = shortcutMetadata.SHORTCUT_ACTIONS.find(
  (action) => action.actionId === 'shortcutKeyStopAndTranscribeDictation',
);
assert.ok(stopAndTranscribeAction, 'Stop and Transcribe should have shortcut action metadata');
assert.equal(stopAndTranscribeAction.validationMode, 'manual-only');
assert.deepEqual(stopAndTranscribeAction.targetRefs, ['stop-dictation-button']);
assert.equal(stopAndTranscribeAction.activationProbe.mode, 'manual-only');
assert.equal(stopAndTranscribeAction.activationProbe.safe, false);
const dictationRuntimeSource = contentSource.match(
  / {4}const DictationShortcut = \(\(\) => \{[\s\S]*?\n {4}\}\)\(\);/,
)?.[0];
assert.ok(dictationRuntimeSource, 'The Dictation shortcut runtime should remain inspectable');
assert.doesNotMatch(
  dictationRuntimeSource,
  /Start dictation|Send dictated message|Cancel dictation|#2dc143|#85f94b|#75ee4d|#fa1dbd|microphone-regular-24|#33d595|#29f921|thread-bottom-container|unified-composer|composer-background/,
  'Dictation start must not use stale labels, icon ids, or composer roots',
);
assert.equal(
  modelPickerSelectors.PILL_ADVANCED_TOGGLE_SELECTOR,
  '[role="menuitem"][aria-expanded]:not([aria-haspopup="menu"])',
);

const activeTargetIds = new Set(
  shortcutMetadata.SHORTCUT_ACTIONS.filter((action) =>
    ['scrape-targets', 'manual-only'].includes(action.validationMode),
  ).flatMap((action) => action.targetRefs),
);
for (const targetId of Object.keys(currentTargetTokens)) {
  assert.ok(activeTargetIds.has(targetId), `${targetId} should be covered by an active shortcut`);
}

class FixtureDictationNode {
  constructor({
    tagName = 'BUTTON',
    attributes = {},
    iconPath = '',
    iconHref = '',
    buttons = [],
  } = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.iconPath = iconPath;
    this.iconHref = iconHref;
    this.buttons = buttons;
    this.clickCount = 0;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  querySelector(selector) {
    const symbolMatch = selector.match(/^button:has\(svg use\[href\$="#([^"]+)"\]\)$/);
    if (symbolMatch) {
      const [, symbol] = symbolMatch;
      return this.buttons.find((button) => button.iconHref.endsWith(`#${symbol}`)) || null;
    }
    const pathMatch = selector.match(
      /^button(?:\[type="([^"]+)"\])?:has\(svg path\[d\^="([^"]+)"\]\)$/,
    );
    if (pathMatch) {
      const [, buttonType, pathPrefix] = pathMatch;
      return (
        this.buttons.find(
          (button) =>
            (!buttonType || button.getAttribute('type') === buttonType) &&
            button.iconPath.startsWith(pathPrefix),
        ) || null
      );
    }
    if (selector.startsWith('svg use[')) return null;
    const ariaLabel = selector.match(/^button\[aria-label="([^"]+)"\]$/)?.[1];
    if (ariaLabel) {
      return this.buttons.find((button) => button.getAttribute('aria-label') === ariaLabel) || null;
    }
    if (selector === '#composer-submit-button') {
      return (
        this.buttons.find((button) => button.getAttribute('id') === 'composer-submit-button') ||
        null
      );
    }
    const testId = selector.match(/^button\[data-testid="([^"]+)"\]$/)?.[1];
    if (testId) {
      return this.buttons.find((button) => button.getAttribute('data-testid') === testId) || null;
    }
    return null;
  }

  scrollIntoView() {}

  click() {
    this.clickCount += 1;
  }
}

const dictateButton = new FixtureDictationNode({
  iconHref: '/assets/sprite.svg#microphone-light-16',
  iconPath: 'M12.4584 8.96973 ...',
});
const voiceModeButton = new FixtureDictationNode({
  iconHref: '/assets/sprite.svg#voice-regular-20',
  iconPath: 'M12.4583 8.96973 ...',
});
const composerSendButton = new FixtureDictationNode({
  attributes: { 'data-testid': 'send-button' },
  iconHref: '/assets/sprite.svg#arrow-up-lg-light-20',
  iconPath: 'M8 2.5 ...',
});
const cancelDictationButton = new FixtureDictationNode({
  iconHref: '/assets/sprite.svg#xmark-lg-light-20',
  iconPath: 'M14.779 4.27903 ...',
});
const stopDictationButton = new FixtureDictationNode({
  iconHref: '/assets/sprite.svg#stop-fill-light-20',
  iconPath: 'M13.0834 3.91846 ...',
});
const transcribeAndSendButton = new FixtureDictationNode({
  iconHref: '/assets/sprite.svg#arrow-up-lg-light-20',
  iconPath: 'M9.31697 3.08317 ...',
});
const dictationComposer = new FixtureDictationNode({
  tagName: 'FORM',
  attributes: { 'data-chatgpt-composer': '', 'data-thread-find-composer': 'true' },
  buttons: [voiceModeButton, composerSendButton, dictateButton],
});
const scheduledTimers = [];
const dictationContext = {
  document: {
    querySelector(selector) {
      if (
        selector === 'form[data-chatgpt-composer][data-thread-find-composer="true"]' ||
        selector === 'form[data-thread-find-composer="true"]' ||
        selector === 'form[data-chatgpt-composer]'
      ) {
        return dictationComposer;
      }
      return null;
    },
  },
  DELAYS: { beforeFinalClick: 0 },
  escapeAttributeSelectorFragment: (value) => value,
  flashBorder() {},
  getIconTokenList: (tokens) => (Array.isArray(tokens) ? tokens : [tokens]),
  setTimeout(callback) {
    scheduledTimers.push(callback);
  },
  sleep: async () => {},
  smartClick: (button) => button.click(),
};
runInNewContext(
  `${dictationRuntimeSource.replace(/^ {4}/gm, '')}\nglobalThis.runDictationToggle = DictationShortcut.runToggle;\nglobalThis.runStopAndTranscribeDictation = DictationShortcut.runStopAndTranscribe;\nglobalThis.runDictationCancel = DictationShortcut.runCancel;`,
  dictationContext,
);
dictationContext.runDictationToggle();
assert.equal(
  dictateButton.clickCount,
  1,
  'The observed Dictate button should be clicked exactly once',
);
assert.equal(voiceModeButton.clickCount, 0, 'The adjacent Start Voice button must not be clicked');
assert.equal(
  composerSendButton.clickCount,
  0,
  'The composer Send button must not be clicked as Dictate',
);

scheduledTimers.shift()();
dictateButton.iconHref = '/assets/sprite.svg#microphone-light-20';
dictationContext.runDictationToggle();
assert.equal(
  dictateButton.clickCount,
  2,
  'The alternate observed microphone symbol should also start Dictation',
);

dictationComposer.buttons = [cancelDictationButton, stopDictationButton, transcribeAndSendButton];
scheduledTimers.shift()();
dictationContext.runDictationToggle();
assert.equal(
  transcribeAndSendButton.clickCount,
  1,
  'The second Dictation toggle should click Transcribe-and-send exactly once',
);
assert.equal(cancelDictationButton.clickCount, 0, 'The active Cancel button must not be clicked');
assert.equal(stopDictationButton.clickCount, 0, 'The active Stop button must not be clicked');
assert.equal(composerSendButton.clickCount, 0, 'The idle composer Send button must not be clicked');
await dictationContext.runDictationCancel();
assert.equal(cancelDictationButton.clickCount, 1, 'The Cancel shortcut should click only Cancel');
assert.equal(stopDictationButton.clickCount, 0, 'The Cancel shortcut must not click Stop');
assert.equal(
  transcribeAndSendButton.clickCount,
  1,
  'The Cancel shortcut must not click Transcribe-and-send',
);
dictationContext.runStopAndTranscribeDictation();
assert.equal(
  stopDictationButton.clickCount,
  1,
  'Stop and Transcribe should click the active square Stop control exactly once',
);
assert.equal(cancelDictationButton.clickCount, 1, 'Stop and Transcribe must not click Cancel');
assert.equal(
  transcribeAndSendButton.clickCount,
  1,
  'Stop and Transcribe must not click Transcribe-and-send',
);
assert.equal(composerSendButton.clickCount, 0, 'Stop and Transcribe must not click composer Send');

const legacyStartButton = new FixtureDictationNode({
  iconPath: 'M12.4584 8.96973 ...',
});
const legacySubmitButton = new FixtureDictationNode({
  attributes: { type: 'button' },
  iconPath: 'M9.31697 3.08317 ...',
});
const legacyStopButton = new FixtureDictationNode({
  attributes: { type: 'button' },
  iconPath: 'M13.0834 3.91846 ...',
});
const legacyCancelButton = new FixtureDictationNode({
  attributes: { type: 'button' },
  iconPath: 'M14.779 4.27903 ...',
});
scheduledTimers.shift()();
dictationComposer.buttons = [legacyStartButton];
dictationContext.runDictationToggle();
assert.equal(
  legacyStartButton.clickCount,
  1,
  'The verified legacy Dictate path should remain usable',
);
scheduledTimers.shift()();
dictationComposer.buttons = [legacySubmitButton];
dictationContext.runDictationToggle();
assert.equal(
  legacySubmitButton.clickCount,
  1,
  'The verified legacy Transcribe-and-send path should remain usable',
);
dictationComposer.buttons = [legacyCancelButton];
await dictationContext.runDictationCancel();
assert.equal(
  legacyCancelButton.clickCount,
  1,
  'The verified legacy Cancel path should remain usable',
);
dictationComposer.buttons = [legacyStopButton];
dictationContext.runStopAndTranscribeDictation();
assert.equal(legacyStopButton.clickCount, 1, 'The verified legacy Stop path should remain usable');

const branchMenuHelperStart = contentSource.indexOf(
  '  const DEFAULT_MENU_DELAYS = Object.freeze({',
);
const branchMenuHelperEnd = contentSource.indexOf(
  '  // Runtime bridge: model-picker thinking fallbacks and shortcut handlers reuse this Radix menu path.',
  branchMenuHelperStart,
);
const branchMenuHelperSource = contentSource
  .slice(branchMenuHelperStart, branchMenuHelperEnd)
  .replace(/^ {2}/gm, '');
const branchShortcutSource = contentSource
  .match(/ {4}function runBranchInNewChatShortcut\(\) \{[\s\S]*?\n {4}\}/)?.[0]
  .replace(/^ {4}/gm, '');
assert.ok(
  branchMenuHelperStart >= 0 && branchMenuHelperEnd > branchMenuHelperStart && branchShortcutSource,
  'Branch in new chat should use the inspectable shared menu cascade',
);
assert.match(
  branchShortcutSource,
  /menuRootResolver:\s*findOpenMenuForTrigger/,
  'Branch must resolve the opened menu from its selected overflow trigger',
);
assert.match(
  branchShortcutSource,
  /requireTriggerSelector:\s*true/,
  'Branch must not fall back to a global icon match when its message-action trigger is absent',
);
assert.match(
  branchMenuHelperSource,
  /getAttribute\('aria-controls'\)[\s\S]*getAttribute\('aria-labelledby'\)/,
  'The menu resolver should use structural ARIA ID references only',
);
assert.doesNotMatch(
  branchShortcutSource,
  /aria-label|innerText|textContent/,
  'Branch targeting must not depend on localized labels or text',
);

class FixtureBranchNode {
  constructor({ tagName = 'DIV', attributes = {}, iconPath = '', rect } = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.iconPath = iconPath;
    this.rect = rect || { top: 20, left: 10, bottom: 50, right: 80 };
    this.parentElement = null;
    this.children = [];
    this.focusCount = 0;
    this.clickCount = 0;
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  append(child) {
    child.parentElement = this;
    this.children.push(child);
  }

  matches(selector) {
    if (selector === 'button') return this.tagName === 'BUTTON';
    if (selector === '.turn-action-controls') {
      return (this.getAttribute('class') || '').split(/\s+/).includes('turn-action-controls');
    }
    if (selector.startsWith(':is(') && selector.includes('[role="menuitem"]')) {
      return ['menuitem', 'menuitemradio', 'menuitemcheckbox'].includes(this.getAttribute('role'));
    }
    return false;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  descendants() {
    const result = [];
    const visit = (node) => {
      for (const child of node.children) {
        result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  querySelectorAll(selector) {
    const pathPrefixes = Array.from(
      selector.matchAll(/svg path\[d\^="([^"]+)"\]/g),
      (match) => match[1],
    );
    if (pathPrefixes.length) {
      return this.descendants().filter((node) =>
        pathPrefixes.some((prefix) => node.iconPath.startsWith(prefix)),
      );
    }
    return [];
  }

  getBoundingClientRect() {
    return this.rect;
  }

  focus() {
    this.focusCount += 1;
  }

  dispatchEvent(event) {
    if (event.type === 'keydown' && event.key === ' ') {
      const controlledId = (this.getAttribute('aria-controls') || '').split(/\s+/)[0];
      const controlledMenu = branchMenus.find((menu) => menu.id === controlledId);
      controlledMenu?.setAttribute('data-state', 'open');
    }
    return true;
  }

  click() {
    this.clickCount += 1;
  }
}

const branchMenus = [];
const olderTurnActions = new FixtureBranchNode({
  attributes: { class: 'turn-action-controls' },
});
const latestTurnActions = new FixtureBranchNode({
  attributes: { class: 'turn-action-controls' },
});
const olderOverflowButton = new FixtureBranchNode({
  tagName: 'BUTTON',
  attributes: { 'aria-haspopup': 'menu', 'aria-controls': 'older-actions-menu' },
  iconPath: 'M3.33362 6.80811 older',
  rect: { top: 260, left: 10, bottom: 290, right: 80 },
});
const latestOverflowButton = new FixtureBranchNode({
  tagName: 'BUTTON',
  // The current control intentionally has no test ID or element ID; aria-controls owns the menu.
  attributes: { 'aria-haspopup': 'menu', 'aria-controls': 'latest-actions-menu' },
  iconPath: 'M3.33362 6.80811 latest',
  rect: { top: 520, left: 10, bottom: 550, right: 80 },
});
const sidebarOverflowButton = new FixtureBranchNode({
  tagName: 'BUTTON',
  attributes: {
    id: 'radix-sidebar-actions',
    'aria-haspopup': 'menu',
    'aria-controls': 'sidebar-actions-menu',
  },
  iconPath: 'M3.33362 6.80811 sidebar Chat actions',
});
olderTurnActions.append(olderOverflowButton);
latestTurnActions.append(latestOverflowButton);
const olderBranchItem = new FixtureBranchNode({
  attributes: { role: 'menuitem' },
  iconPath: 'M11.6672 1.97461 older branch',
  rect: { top: 300, left: 10, bottom: 330, right: 150 },
});
const latestBranchItem = new FixtureBranchNode({
  attributes: { role: 'menuitem' },
  iconPath: 'M11.6672 1.97461 latest branch',
  rect: { top: 300, left: 10, bottom: 330, right: 150 },
});
const sidebarBranchItem = new FixtureBranchNode({
  attributes: { role: 'menuitem' },
  iconPath: 'M11.6672 1.97461 sidebar branch',
  rect: { top: 300, left: 10, bottom: 330, right: 150 },
});
const olderActionsMenu = new FixtureBranchNode({
  attributes: { role: 'menu', id: 'older-actions-menu', 'data-state': 'open' },
});
const latestActionsMenu = new FixtureBranchNode({
  attributes: { role: 'menu', id: 'latest-actions-menu', 'data-state': 'closed' },
});
olderActionsMenu.append(olderBranchItem);
latestActionsMenu.append(latestBranchItem);
const sidebarActionsMenu = new FixtureBranchNode({
  attributes: { role: 'menu', id: 'sidebar-actions-menu', 'data-state': 'closed' },
});
sidebarActionsMenu.append(sidebarBranchItem);
branchMenus.push(olderActionsMenu, latestActionsMenu, sidebarActionsMenu);

const branchTimers = [];
const branchMenuContext = {
  document: {
    documentElement: { clientHeight: 800, clientWidth: 600 },
    querySelectorAll(selector) {
      if (selector === '[role="menu"][data-state="open"]') {
        return branchMenus.filter((menu) => menu.getAttribute('data-state') === 'open');
      }
      if (selector.includes('.turn-action-controls button[aria-haspopup="menu"]')) {
        const pathPrefix = selector.match(/svg path\[d\^="([^"]+)"\]/)?.[1];
        return [olderOverflowButton, latestOverflowButton].filter(
          (button) =>
            button.getAttribute('aria-haspopup') === 'menu' &&
            button.iconPath.startsWith(pathPrefix || '') &&
            button.closest('.turn-action-controls'),
        );
      }
      if (selector.startsWith('button[id^="radix-"] ')) {
        const pathPrefix = selector.match(/svg path\[d\^="([^"]+)"\]/)?.[1];
        return sidebarOverflowButton.iconPath.startsWith(pathPrefix || '')
          ? [sidebarOverflowButton]
          : [];
      }
      return [];
    },
  },
  window: { innerHeight: 800, innerWidth: 600, gsap: null },
  KeyboardEvent: class {
    constructor(type, init) {
      this.type = type;
      Object.assign(this, init);
    }
  },
  getIconTokenList: (tokens) => (Array.isArray(tokens) ? tokens : [tokens]),
  escapeCssSelectorValue: (value) => String(value).replaceAll('"', '\\"'),
  buildSvgSelectorForIconTokens: (tokens) =>
    (Array.isArray(tokens) ? tokens : [tokens])
      .map((token) => `svg path[d^="${token}"]`)
      .join(', '),
  getOpenMenus: () => branchMenus.filter((menu) => menu.getAttribute('data-state') === 'open'),
  isAboveComposer: () => true,
  flashBorder: () => {},
  smartClick: (target) => target.click(),
  setTimeout: (callback, delay) => {
    branchTimers.push({ callback, delay });
    return branchTimers.length;
  },
};
runInNewContext(
  [
    `const SHORTCUT_ICON_TOKENS = { moreDotsMenuButton: 'M3.33362 6.80811', branchInNewChatMenuItem: 'M11.6672 1.97461' };`,
    `const BOTTOM_BAR_CONTAINER_SELECTOR = '#bottomBarContainer';`,
    branchMenuHelperSource,
    'globalThis.resolveBranchMenu = findOpenMenuForTrigger;',
    branchShortcutSource,
    'globalThis.runBranchShortcut = runBranchInNewChatShortcut;',
  ].join('\n'),
  branchMenuContext,
);
branchMenuContext.runBranchShortcut();
while (branchTimers.length) branchTimers.shift().callback();
assert.equal(
  latestOverflowButton.focusCount,
  1,
  'Branch should open the lowest visible response menu',
);
assert.equal(
  olderOverflowButton.focusCount,
  0,
  'Branch must not open the higher distractor response menu',
);
assert.equal(
  latestBranchItem.clickCount,
  1,
  'Branch should activate the exact item in the opened menu once',
);
assert.equal(
  olderBranchItem.clickCount,
  0,
  'Branch must not activate the item in another open response menu',
);

delete latestOverflowButton.attributes['aria-controls'];
branchMenuContext.runBranchShortcut();
while (branchTimers.length) branchTimers.shift().callback();
assert.equal(
  latestBranchItem.clickCount,
  1,
  'Branch must not activate an item from an open menu when its trigger has no structural association',
);

olderTurnActions.setAttribute('class', '');
latestTurnActions.setAttribute('class', '');
branchMenuContext.runBranchShortcut();
while (branchTimers.length) branchTimers.shift().callback();
assert.equal(
  sidebarOverflowButton.focusCount,
  0,
  'Branch must not open the sidebar Chat actions menu when message-action controls are absent',
);
assert.equal(
  sidebarBranchItem.clickCount,
  0,
  'Branch must not activate a same-icon sidebar item as a fallback',
);

const labelledByTrigger = new FixtureBranchNode({
  tagName: 'BUTTON',
  attributes: { id: 'labelled-by-trigger' },
});
const labelledByMenu = new FixtureBranchNode({
  attributes: {
    role: 'menu',
    id: 'labelled-by-menu',
    'aria-labelledby': 'labelled-by-trigger',
    'data-state': 'open',
  },
});
branchMenus.push(labelledByMenu);
assert.equal(
  branchMenuContext.resolveBranchMenu(labelledByTrigger),
  labelledByMenu,
  'The branch resolver should also support the trigger/menu aria-labelledby relationship',
);
assert.equal(
  branchMenuContext.resolveBranchMenu(new FixtureBranchNode({ tagName: 'BUTTON' })),
  null,
  'An unassociated menu must not become a global Branch fallback',
);

const readAloudRuntimeSource = contentSource.match(
  /const READ_ALOUD_TARGET_BUTTON_ATTRIBUTE = 'data-csp-read-aloud-shortcut-target';[\s\S]*?function runReadAloudShortcut\(\) \{[\s\S]*?\n {4}\}/,
)?.[0];
assert.ok(readAloudRuntimeSource, 'Read Aloud shortcut target logic should remain inspectable');
assert.match(
  readAloudRuntimeSource,
  /data-csp-read-aloud-target-turn-value/,
  'The first Play activation should persist its response identity outside the callback closure',
);
assert.doesNotMatch(
  readAloudRuntimeSource,
  /let readAloudShortcutTarget|aria-pressed="true"/,
  'Repeat targeting must not depend on recreated local state or a generic pressed button',
);

class FixtureHTMLElement {
  constructor() {
    this.isConnected = true;
    this.attributes = {};
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }
}

const composerVisibilitySource = contentSource.match(
  / {2}function isDirectActionVisible\(el\) \{[\s\S]*?\n {2}\}/,
)?.[0];
const composerVisibleFinderSource = contentSource.match(
  / {2}function findFirstVisibleElement\(selectors\) \{[\s\S]*?\n {2}\}/,
)?.[0];
const composerActivationSource = contentSource.match(
  / {2}function triggerDirectComposerActivation\(\) \{[\s\S]*?\n {2}\}/,
)?.[0];
assert.ok(
  composerVisibilitySource && composerVisibleFinderSource && composerActivationSource,
  'Activate Input should retain inspectable visibility, selector, and focus logic',
);

function runComposerActivationFixture(inputMarkup) {
  const selectorQueries = [];
  const focusCalls = [];
  const fixtureRange = {
    target: null,
    collapsedToStart: null,
    selectNodeContents(target) {
      this.target = target;
    },
    collapse(toStart) {
      this.collapsedToStart = toStart;
    },
  };
  const fixtureSelection = {
    range: null,
    removeAllRanges() {
      this.range = null;
    },
    addRange(range) {
      this.range = range;
    },
  };
  const fixtureDocument = {
    activeElement: null,
    querySelectorAll(selector) {
      selectorQueries.push(selector);
      if (selector === expectedComposerSelectors[0]) {
        return composerInputs.filter(
          (input) =>
            input.tagName === 'DIV' &&
            input.getAttribute('class')?.split(/\s+/).includes('ProseMirror') &&
            input.getAttribute('contenteditable') === 'true' &&
            input.getAttribute('role') === 'textbox' &&
            input.parentElement.getAttribute('data-thread-find-composer') === 'true',
        );
      }
      if (selector === expectedComposerSelectors[1]) {
        return composerInputs.filter(
          (input) =>
            input.getAttribute('data-composer-markdown') !== null &&
            input.getAttribute('contenteditable') === 'true' &&
            input.getAttribute('role') === 'textbox' &&
            input.parentElement.getAttribute('data-chatgpt-composer') !== null,
        );
      }
      return [];
    },
    createRange() {
      return fixtureRange;
    },
  };

  class FixtureComposerForm extends FixtureHTMLElement {
    constructor(attributes) {
      super();
      this.tagName = 'FORM';
      this.attributes = { ...attributes };
      this.parentElement = null;
    }

    hasAttribute(name) {
      return Object.hasOwn(this.attributes, name);
    }
  }

  class FixtureComposerInput extends FixtureHTMLElement {
    constructor({ formAttributes, inputAttributes, tagName = 'DIV' }) {
      super();
      this.tagName = tagName;
      this.attributes = { ...inputAttributes };
      this.hidden = false;
      this.parentElement = new FixtureComposerForm(formAttributes);
      this.disabled = false;
      this.isContentEditable = inputAttributes.contenteditable === 'true';
    }

    hasAttribute(name) {
      return Object.hasOwn(this.attributes, name);
    }

    getBoundingClientRect() {
      return { width: 500, height: 44 };
    }

    focus(options) {
      focusCalls.push(options);
      fixtureDocument.activeElement = this;
    }

    contains(element) {
      return element === this;
    }
  }

  const composerInputs = inputMarkup.map((markup) => new FixtureComposerInput(markup));
  const fixtureContext = {
    document: fixtureDocument,
    Element: FixtureHTMLElement,
    HTMLElement: FixtureHTMLElement,
    window: {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', pointerEvents: 'auto' }),
      getSelection: () => fixtureSelection,
    },
  };
  runInNewContext(
    [
      composerInputSelectorsSource,
      composerVisibilitySource,
      composerVisibleFinderSource,
      composerActivationSource,
      'globalThis.runComposerActivation = triggerDirectComposerActivation;',
    ].join('\n'),
    fixtureContext,
  );

  return {
    result: fixtureContext.runComposerActivation(),
    activeElement: fixtureDocument.activeElement,
    composerInputs,
    selectorQueries,
    focusCalls,
    selectedRange: fixtureSelection.range,
    fixtureRange,
  };
}

const workModeComposer = runComposerActivationFixture([
  {
    formAttributes: { 'data-thread-find-composer': 'true' },
    inputAttributes: { class: 'ProseMirror', contenteditable: 'true', role: 'textbox' },
  },
  {
    formAttributes: { 'data-edit-message': 'true' },
    inputAttributes: { class: 'ProseMirror', contenteditable: 'true', role: 'textbox' },
  },
  {
    formAttributes: { 'data-search-form': 'true' },
    inputAttributes: { class: 'ProseMirror', contenteditable: 'true', role: 'textbox' },
  },
]);
assert.equal(workModeComposer.result, true, 'Activate Input should focus the Work-mode composer');
assert.equal(workModeComposer.activeElement, workModeComposer.composerInputs[0]);
assert.deepEqual(workModeComposer.selectorQueries, [expectedComposerSelectors[0]]);
assert.equal(workModeComposer.focusCalls.length, 1);
assert.equal(workModeComposer.focusCalls[0].preventScroll, true);
assert.equal(workModeComposer.selectedRange.target, workModeComposer.composerInputs[0]);
assert.equal(workModeComposer.fixtureRange.collapsedToStart, false);

const markedComposer = runComposerActivationFixture([
  {
    formAttributes: { 'data-chatgpt-composer': 'true' },
    inputAttributes: {
      'data-composer-markdown': '',
      contenteditable: 'true',
      role: 'textbox',
    },
  },
  {
    formAttributes: { 'data-edit-message': 'true' },
    inputAttributes: { 'data-composer-markdown': '', contenteditable: 'true', role: 'textbox' },
  },
]);
assert.equal(
  markedComposer.result,
  true,
  'Activate Input should preserve the marked composer variant',
);
assert.equal(markedComposer.activeElement, markedComposer.composerInputs[0]);
assert.deepEqual(markedComposer.selectorQueries, expectedComposerSelectors);
assert.equal(markedComposer.selectedRange.target, markedComposer.composerInputs[0]);
assert.equal(markedComposer.fixtureRange.collapsedToStart, false);

const nonComposerTextboxes = runComposerActivationFixture([
  {
    formAttributes: { 'data-edit-message': 'true' },
    inputAttributes: { class: 'ProseMirror', contenteditable: 'true', role: 'textbox' },
  },
  {
    formAttributes: { 'data-search-form': 'true' },
    inputAttributes: { 'data-composer-markdown': '', contenteditable: 'true', role: 'textbox' },
  },
]);
assert.equal(
  nonComposerTextboxes.result,
  false,
  'Activate Input must not focus Edit or Search textboxes',
);
assert.equal(nonComposerTextboxes.activeElement, null);
assert.equal(nonComposerTextboxes.focusCalls.length, 0);
assert.deepEqual(nonComposerTextboxes.selectorQueries, expectedComposerSelectors);

const searchConversationSelectorsSource = contentSource.match(
  / {2}const SEARCH_CONVERSATION_SELECTORS = \[[\s\S]*?\n {2}\];/,
)?.[0];
const searchSafeClickSource = contentSource.match(
  / {2}function safeClick\(el\) \{[\s\S]*?\n {2}\}/,
)?.[0];
const searchPointerClickSource = contentSource.match(
  / {2}function safeClickSearchConversationButton\(el\) \{[\s\S]*?\n {2}\}/,
)?.[0];
const searchVisibilitySource = contentSource.match(
  / {2}function isDirectActionVisible\(el\) \{[\s\S]*?\n {2}\}/,
)?.[0];
const searchVisibleFinderSource = contentSource.match(
  / {2}function findFirstVisibleElement\(selectors\) \{[\s\S]*?\n {2}\}/,
)?.[0];
const searchShortcutSource = contentSource.match(
  / {2}function triggerNativeSearchConversationButton\(\) \{[\s\S]*?\n {2}\}/,
)?.[0];
assert.ok(
  searchConversationSelectorsSource &&
    searchSafeClickSource &&
    searchPointerClickSource &&
    searchVisibilitySource &&
    searchVisibleFinderSource &&
    searchShortcutSource,
  'Search Conversation History should retain inspectable live-selector activation logic',
);

class FixtureSearchButton extends FixtureHTMLElement {
  constructor(bounds) {
    super();
    this.setAttribute('aria-label', 'Search');
    this.bounds = bounds;
    this.disabled = false;
    this.clickCount = 0;
  }

  hasAttribute(name) {
    return Object.hasOwn(this.attributes, name);
  }

  getBoundingClientRect() {
    return this.bounds;
  }

  click() {
    this.clickCount += 1;
  }
}

const hiddenSearchButton = new FixtureSearchButton({ left: 0, top: 0, width: 0, height: 0 });
const visibleSearchButton = new FixtureSearchButton({
  left: 260,
  top: 8,
  width: 36,
  height: 36,
});
const currentSearchSelector = 'button:has(svg path[d^="M9.16211 2.37976"])';
const searchSelectorQueries = [];
let searchPointerClickCount = 0;
const searchRuntimeSource = [
  searchConversationSelectorsSource,
  searchSafeClickSource,
  searchPointerClickSource,
  searchVisibilitySource,
  searchVisibleFinderSource,
  searchShortcutSource,
  'globalThis.searchConversationSelectors = SEARCH_CONVERSATION_SELECTORS;',
  'globalThis.runSearchConversationShortcut = triggerNativeSearchConversationButton;',
].join('\n');
const searchShortcutContext = {
  document: {
    querySelectorAll(selector) {
      searchSelectorQueries.push(selector);
      assert.equal(selector, currentSearchSelector);
      return [hiddenSearchButton, visibleSearchButton];
    },
  },
  Element: FixtureSearchButton,
  HTMLElement: FixtureSearchButton,
  window: {
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', pointerEvents: 'auto' }),
  },
  clickElementLikeUser: (el) => {
    searchPointerClickCount += 1;
    el.click();
    return true;
  },
  findStructuralSearchConversationButton: () => null,
  triggerNativeSearchConversationFromNarrowPopover: () => false,
};
runInNewContext(searchRuntimeSource, searchShortcutContext);
assert.deepEqual(
  Array.from(searchShortcutContext.searchConversationSelectors),
  [
    currentSearchSelector,
    'button:has(svg path[d^="M7.32849 1.91016"])',
    'button[data-testid="search-conversation-button"]',
  ],
  'Search should prefer the freshly observed sidebar icon and retain its legacy fallbacks',
);
assert.ok(
  Array.from(searchShortcutContext.searchConversationSelectors).every(
    (selector) => !selector.includes('aria-label'),
  ),
  'Search target resolution must not depend on localized accessible labels',
);
assert.equal(searchShortcutContext.runSearchConversationShortcut(), true);
assert.deepEqual(searchSelectorQueries, [currentSearchSelector]);
assert.equal(
  hiddenSearchButton.clickCount,
  0,
  'Search must skip the hidden zero-size rail duplicate',
);
assert.equal(
  visibleSearchButton.clickCount,
  1,
  'Search should click the visible native control exactly once',
);
assert.equal(
  searchPointerClickCount,
  1,
  'Search should use the pointer-aware native-control activation helper exactly once',
);

const newChatSelectorsSource = contentSource.match(
  / {2}const NEW_CHAT_SELECTORS = \[[\s\S]*?\n {2}\];/,
)?.[0];
const narrowSidebarSelectorsSource = contentSource.match(
  / {2}const NARROW_SIDEBAR_POPOVER_SELECTORS = \[[\s\S]*?\n {2}\];/,
)?.[0];
const newChatSpriteTokensSource = contentSource.match(
  / {2}const NEW_CHAT_SPRITE_FRAGMENT = '[^']+';\n {2}const NEW_CHAT_SPRITE_FALLBACK_FRAGMENT = '[^']+';/,
)?.[0];
const newChatOpenPopoverSource = contentSource.match(
  / {2}async function openNarrowSidebarPopover\([^)]*\) \{[\s\S]*?\n {2}\}/,
)?.[0];
const newChatWaitForTargetSource = contentSource.match(
  / {2}function waitForFirstVisibleElement\(selectors, timeoutMs = 800\) \{[\s\S]*?\n {2}\}/,
)?.[0];
const newChatFallbackSource = contentSource.match(
  / {2}function navigateToNewConversationFallback\(\) \{[\s\S]*?\n {2}\}/,
)?.[0];
const newChatNarrowShortcutSource = contentSource.match(
  / {2}async function triggerNativeNewConversationFromNarrowPopover\(\) \{[\s\S]*?\n {2}\}/,
)?.[0];
const newChatShortcutSource = contentSource.match(
  / {2}function triggerNativeNewConversationButton\(\) \{[\s\S]*?\n {2}\}/,
)?.[0];
assert.ok(
  newChatSelectorsSource &&
    narrowSidebarSelectorsSource &&
    newChatSpriteTokensSource &&
    searchSafeClickSource &&
    searchVisibilitySource &&
    searchVisibleFinderSource &&
    newChatOpenPopoverSource &&
    newChatWaitForTargetSource &&
    newChatFallbackSource &&
    newChatNarrowShortcutSource &&
    newChatShortcutSource,
  'New Conversation should retain inspectable live-selector activation logic',
);

const currentNewChatSelector = 'button:has(svg path[d^="M8.16675 2.50127"])';
const staleProjectNewChatSelector = 'button:has(svg path[d^="M6.33325 1.88379"])';
const newChatRuntimeSource = [
  narrowSidebarSelectorsSource,
  newChatSelectorsSource,
  newChatSpriteTokensSource,
  searchSafeClickSource,
  searchVisibilitySource,
  searchVisibleFinderSource,
  newChatOpenPopoverSource,
  newChatWaitForTargetSource,
  newChatFallbackSource,
  newChatNarrowShortcutSource,
  newChatShortcutSource,
].join('\n');

class FixtureNewChatButton extends FixtureHTMLElement {
  constructor(iconPath, bounds) {
    super();
    this.iconPath = iconPath;
    this.bounds = bounds;
    this.disabled = false;
    this.clickCount = 0;
  }

  hasAttribute(name) {
    return Object.hasOwn(this.attributes, name);
  }

  getBoundingClientRect() {
    return this.bounds;
  }

  click() {
    this.clickCount += 1;
  }
}

function createNewChatFixture() {
  const projectActionCandidates = Array.from(
    { length: 5 },
    () =>
      new FixtureNewChatButton('M6.33325 1.88379 20x20 project action', {
        left: 40,
        top: 80,
        width: 20,
        height: 20,
      }),
  );
  const hiddenProjectActionDuplicate = new FixtureNewChatButton('M6.33325 1.88379 0x0 duplicate', {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const hiddenGenericDuplicate = new FixtureNewChatButton('M8.16675 2.50127 0x0 duplicate', {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const genericNewChatButton = new FixtureNewChatButton('M8.16675 2.50127 generic action', {
    left: 12,
    top: 20,
    width: 36,
    height: 36,
  });
  const narrowPopoverOpener = new FixtureNewChatButton('sidebar opener', {
    left: 4,
    top: 8,
    width: 24,
    height: 24,
  });
  narrowPopoverOpener.setAttribute('aria-expanded', 'false');
  const selectorQueries = [];
  const context = {
    document: {
      querySelectorAll(selector) {
        selectorQueries.push(selector);
        if (selector.includes('M8.16675 2.50127')) {
          return [hiddenGenericDuplicate, genericNewChatButton].filter((button) =>
            button.iconPath.startsWith('M8.16675 2.50127'),
          );
        }
        if (selector.includes('M6.33325 1.88379')) {
          return [...projectActionCandidates, hiddenProjectActionDuplicate].filter((button) =>
            button.iconPath.startsWith('M6.33325 1.88379'),
          );
        }
        if (selector.includes('open-sidebar-button')) return [narrowPopoverOpener];
        return [];
      },
    },
    Element: FixtureNewChatButton,
    HTMLElement: FixtureNewChatButton,
    window: {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', pointerEvents: 'auto' }),
      location: { pathname: '/' },
    },
  };
  runInNewContext(
    `${newChatRuntimeSource}\nglobalThis.newChatSelectors = NEW_CHAT_SELECTORS;\nglobalThis.runNewChatShortcut = triggerNativeNewConversationButton;\nglobalThis.runNarrowPopoverNewChatShortcut = triggerNativeNewConversationFromNarrowPopover;`,
    context,
  );
  return {
    context,
    genericNewChatButton,
    hiddenGenericDuplicate,
    hiddenProjectActionDuplicate,
    narrowPopoverOpener,
    projectActionCandidates,
    selectorQueries,
  };
}

const newChatFixture = createNewChatFixture();
const newChatDescriptor = descriptorById.get('create-new-chat-button');
assert.ok(newChatDescriptor, 'The generic New Chat target should remain in the target inventory');
assert.equal(newChatDescriptor.kind, 'selector-list');
assert.deepEqual(
  Array.from(newChatDescriptor.searchNeedles),
  Array.from(newChatFixture.context.newChatSelectors),
  'The audit descriptor should match the runtime New Chat selector list and order',
);
assert.deepEqual(
  Array.from(newChatDescriptor.matchGroups, (group) => Array.from(group)),
  [
    ['<button', 'M8.16675 2.50127'],
    ['data-app-shell-titlebar', '<button', 'M6.33325 1.80763'],
    ['<a', 'data-testid="create-new-chat-button"'],
    ['<button', 'data-testid="create-new-chat-button"'],
    ['<button', 'data-testid="new-chat-button"'],
  ],
  'New Chat audit groups should use structural tokens derived from each runtime selector',
);
for (const captureHtml of [
  '<button><svg><path d="M8.16675 2.50127"></path></svg></button>',
  '<div data-app-shell-titlebar="true"><button><svg><path d="M6.33325 1.80763"></path></svg></button></div>',
  '<a data-testid="create-new-chat-button"></a>',
  '<button data-testid="create-new-chat-button"></button>',
  '<button data-testid="new-chat-button"></button>',
]) {
  assert.ok(
    targetMatchesCapture(newChatDescriptor, captureHtml),
    `New Chat audit matcher should recognize structural capture ${captureHtml}`,
  );
}
assert.equal(
  targetMatchesCapture(
    newChatDescriptor,
    '<button><svg><path d="M6.33325 1.88379"></path></svg></button>',
  ),
  false,
  'Structural New Chat matching must still exclude the project-row action icon',
);
assert.ok(
  Array.from(newChatDescriptor.searchNeedles).every(
    (selector) => !selector.includes('M6.33325 1.88379'),
  ),
  'The audit descriptor must exclude the broad project-row action SVG path',
);
assert.equal(
  Array.from(newChatFixture.context.newChatSelectors)[0],
  currentNewChatSelector,
  'New Chat should prefer the generic action SVG, not the project-row action SVG',
);
assert.ok(
  !Array.from(newChatFixture.context.newChatSelectors).includes(staleProjectNewChatSelector),
  'The project-row action SVG must not remain in the generic selector list',
);
assert.ok(
  Array.from(newChatFixture.context.newChatSelectors).every(
    (selector) => !selector.includes('aria-label'),
  ),
  'New Chat target resolution must not depend on localized accessible labels',
);
assert.equal(newChatFixture.projectActionCandidates.length, 5);
assert.equal(newChatFixture.hiddenProjectActionDuplicate.getBoundingClientRect().width, 0);
assert.equal(newChatFixture.context.runNewChatShortcut(), true);
assert.deepEqual(newChatFixture.selectorQueries, [currentNewChatSelector]);
assert.equal(
  newChatFixture.hiddenGenericDuplicate.clickCount,
  0,
  'New Chat must skip hidden duplicates',
);
assert.equal(
  newChatFixture.genericNewChatButton.clickCount,
  1,
  'New Chat should click the visible generic action exactly once',
);
assert.ok(
  newChatFixture.projectActionCandidates.every((button) => button.clickCount === 0) &&
    newChatFixture.hiddenProjectActionDuplicate.clickCount === 0,
  'New Chat must never click project-specific actions',
);

const narrowNewChatFixture = createNewChatFixture();
assert.equal(await narrowNewChatFixture.context.runNarrowPopoverNewChatShortcut(), true);
assert.deepEqual(narrowNewChatFixture.selectorQueries, [
  'button[data-testid="open-sidebar-button"][aria-controls="stage-popover-sidebar"]',
  currentNewChatSelector,
]);
assert.equal(narrowNewChatFixture.narrowPopoverOpener.clickCount, 1);
assert.equal(narrowNewChatFixture.hiddenGenericDuplicate.clickCount, 0);
assert.equal(narrowNewChatFixture.genericNewChatButton.clickCount, 1);
assert.ok(
  narrowNewChatFixture.projectActionCandidates.every((button) => button.clickCount === 0),
  'The narrow-popover path must never click project-specific actions',
);

const newConversationBinding = contentSource.match(
  /shortcutKeyNewConversation: function newConversation\(\) \{[\s\S]*?\n {6}\},/,
)?.[0];
const chatWorkToggleHelper = contentSource.match(
  / {2}async function triggerNativeChatWorkToggle\(\) \{[\s\S]*?\n {2}\}/,
)?.[0];
const chatWorkToggleBinding = contentSource.match(
  /shortcutKeyToggleChatWork: \(\) => \{[\s\S]*?\n {6}\},/,
)?.[0];
assert.ok(newConversationBinding && chatWorkToggleHelper && chatWorkToggleBinding);
assert.match(newConversationBinding, /triggerNativeNewConversationButton\(\)/);
assert.match(chatWorkToggleHelper, /triggerNativeNewConversationButton\(\)/);
assert.match(chatWorkToggleBinding, /triggerNativeChatWorkToggle\(\)/);

class FixtureTurn extends FixtureHTMLElement {
  constructor(turnKey) {
    super();
    this.setAttribute('data-turn-key', turnKey);
    this.actionControls = new FixtureActionControls();
  }

  querySelector(selector) {
    return selector === '.turn-action-controls' ? this.actionControls : null;
  }
}

class FixtureActionControls extends FixtureHTMLElement {
  constructor() {
    super();
    this.buttons = [];
  }

  querySelectorAll(selector) {
    return selector === 'button' ? this.buttons.filter((button) => button.isConnected) : [];
  }

  replaceButton(previous, next) {
    const index = this.buttons.indexOf(previous);
    assert.notEqual(index, -1);
    previous.isConnected = false;
    next.isConnected = true;
    this.buttons[index] = next;
  }
}

class FixtureReadAloudButton extends FixtureHTMLElement {
  constructor(turn, kind) {
    super();
    this.turn = turn;
    this.kind = kind;
  }

  closest(selector) {
    if (selector === '.turn-action-controls') return this.turn.actionControls;
    if (selector.includes('[data-turn-key]')) return this.turn;
    return null;
  }

  getClientRects() {
    return this.isConnected ? [{}] : [];
  }

  querySelector(selector) {
    return this.kind === 'play' && selector.includes('M9.75122 4.09203') ? {} : null;
  }

  click() {
    if (this.kind === 'play') this.turn.playCount = (this.turn.playCount ?? 0) + 1;
    else this.turn.stopCount = (this.turn.stopCount ?? 0) + 1;

    const nextKind = this.kind === 'play' ? 'stop' : 'play';
    this.turn.actionControls.replaceButton(this, new FixtureReadAloudButton(this.turn, nextKind));
  }
}

const olderResponse = new FixtureTurn('older-response');
const latestResponse = new FixtureTurn('latest-response');
const fixtureDocumentElement = new FixtureHTMLElement();
const olderPlay = new FixtureReadAloudButton(olderResponse, 'play');
const latestPlay = new FixtureReadAloudButton(latestResponse, 'play');
olderResponse.actionControls.buttons.push(olderPlay);
latestResponse.actionControls.buttons.push(latestPlay);

const fixtureDocument = {
  documentElement: fixtureDocumentElement,
  querySelector(selector) {
    if (selector === '[data-csp-read-aloud-shortcut-target="true"]') {
      return (
        [olderResponse, latestResponse]
          .flatMap((turn) => turn.actionControls.querySelectorAll('button'))
          .find(
            (button) => button.getAttribute('data-csp-read-aloud-shortcut-target') === 'true',
          ) ?? null
      );
    }
    return null;
  },
  querySelectorAll(selector) {
    if (selector === '.turn-action-controls button[aria-pressed]') {
      return [olderResponse, latestResponse].flatMap((turn) =>
        turn.actionControls.querySelectorAll('button'),
      );
    }
    if (selector === '[data-turn-key], [data-testid^="conversation-turn-"]') {
      return [olderResponse, latestResponse].filter((turn) => turn.isConnected);
    }
    if (selector === '[data-csp-read-aloud-shortcut-target="true"]') {
      return [olderResponse, latestResponse]
        .flatMap((turn) => turn.actionControls.querySelectorAll('button'))
        .filter((button) => button.getAttribute('data-csp-read-aloud-shortcut-target') === 'true');
    }
    return [];
  },
};
const activateReadAloudInFreshContext = () => {
  const context = {
    document: fixtureDocument,
    HTMLElement: FixtureHTMLElement,
    flashShortcutTarget() {},
  };
  runInNewContext(
    `${readAloudRuntimeSource}\nglobalThis.runReadAloudShortcut = runReadAloudShortcut;`,
    context,
  );
  context.runReadAloudShortcut();
};

activateReadAloudInFreshContext();
const latestStop = latestResponse.actionControls.buttons[0];
assert.equal(
  latestStop.kind,
  'stop',
  'The first shortcut should activate Play on the latest response',
);
assert.equal(olderPlay.kind, 'play', 'The next-higher response should remain at Play');
assert.equal(
  fixtureDocumentElement.getAttribute('data-csp-read-aloud-target-turn-value'),
  'latest-response',
  'The selected response identity should survive shortcut-handler recreation',
);
activateReadAloudInFreshContext();

assert.equal(
  latestResponse.stopCount,
  1,
  'The second shortcut should activate Stop on that same response',
);
assert.equal(latestResponse.playCount, 1, 'The latest response should have started only once');
assert.equal(
  olderResponse.playCount ?? 0,
  0,
  'The second shortcut must not start the next-higher response',
);

const shareClickRuntimeSource = contentSource.match(
  / {2}const clickButtonBySelector = async \([\s\S]*?\n {2}\};/,
)?.[0];
assert.ok(shareClickRuntimeSource, 'The shared selector click helper should remain inspectable');
const shareDirectClickRuntimeSource = contentSource.match(
  /const clickElementLikeUser = \(el\) => \{[\s\S]*?\n\};/,
)?.[0];
assert.ok(
  shareDirectClickRuntimeSource,
  'The shared direct-click helper should remain inspectable',
);
const shareShortcutSource = contentSource.match(
  /shortcutKeyShare: \(\) => \{[\s\S]*?\n {6}\},/,
)?.[0];
assert.ok(shareShortcutSource, 'The Share shortcut should activate the current native control');
assert.match(
  shareShortcutSource,
  /\[data-testid="app-shell-header-context-menu-surface"\] > \[data-app-shell-header-obstacle="true"\] button:has\(svg use\[href\$="#arrow-up-open-base-light-16"\]\)/,
  'The Share shortcut should match the current header sprite glyph',
);
assert.match(
  shareShortcutSource,
  /\[data-testid="app-shell-header-context-menu-surface"\] > \[data-app-shell-header-obstacle="true"\] button:has\(svg path\[d\^="M13\.3337"\]\)/,
  'The Share shortcut should match its header target before and after bottom-bar relocation',
);
assert.doesNotMatch(
  shareShortcutSource,
  /data-csp-bottom-native-actions/,
  'Share target resolution must not depend on the bottom-bar-only marker',
);
assert.doesNotMatch(
  shareShortcutSource,
  /\basync\b|\bawait\b/,
  'Share activation must not yield before entering the selector click helper',
);
assert.match(
  shareShortcutSource,
  /\{ immediate: true \}/,
  'Share should request the selector helper’s same-task activation mode',
);

class FixtureShareButton extends FixtureHTMLElement {
  constructor() {
    super();
    this.tagName = 'BUTTON';
    this.disabled = false;
    this.clickCount = 0;
  }

  getClientRects() {
    return [{}];
  }

  getBoundingClientRect() {
    return { left: 10, top: 20, width: 30, height: 20 };
  }

  dispatchEvent() {
    return true;
  }

  click() {
    this.clickCount += 1;
  }
}

class FixtureMouseEvent {
  constructor(type, init) {
    this.type = type;
    this.init = init;
  }
}

class FixturePointerEvent extends FixtureMouseEvent {}

const structuralShareSelector =
  '[data-testid="app-shell-header-context-menu-surface"] > [data-app-shell-header-obstacle="true"] button:has(svg use[href$="#arrow-up-open-base-light-16"]), ' +
  '[data-testid="app-shell-header-context-menu-surface"] > [data-app-shell-header-obstacle="true"] button:has(svg path[d^="M13.3337"])';
const staleShareButton = new FixtureShareButton();
const currentShareButton = new FixtureShareButton();
const duplicateShareButton = new FixtureShareButton();
let resolvedShareButton = staleShareButton;
staleShareButton.scrollIntoView = () => {
  staleShareButton.isConnected = false;
  resolvedShareButton = currentShareButton;
};
let shareSelectorQueryCount = 0;
let shareWaitForCalls = 0;
let shareSleepCalls = 0;
const moveTopBarToBottom = false;
const shareShortcutContext = {
  document: {
    querySelectorAll(selector) {
      shareSelectorQueryCount += 1;
      assert.equal(selector, structuralShareSelector);
      if (!moveTopBarToBottom) {
        assert.ok(
          !selector.includes('data-csp-bottom-native-actions'),
          'The default header target must not require a bottom-bar marker',
        );
      }
      return resolvedShareButton ? [resolvedShareButton, duplicateShareButton] : [];
    },
  },
  DELAYS: { beforeFinalClick: 150 },
  MouseEvent: FixtureMouseEvent,
  PointerEvent: FixturePointerEvent,
  flashBorder() {},
  sleep: async () => {
    shareSleepCalls += 1;
  },
  waitFor: async (resolve) => {
    shareWaitForCalls += 1;
    return resolve();
  },
  window: { PointerEvent: FixturePointerEvent },
};
runInNewContext(
  `${shareDirectClickRuntimeSource}\nconst smartClick = clickElementLikeUser;\n${shareClickRuntimeSource}\nconst altShortcutActions = { ${shareShortcutSource} };\nglobalThis.runShareShortcut = altShortcutActions.shortcutKeyShare;`,
  shareShortcutContext,
);
shareShortcutContext.runShareShortcut();
assert.equal(
  shareSelectorQueryCount,
  2,
  'Immediate Share activation should re-resolve after scrolling',
);
assert.equal(
  shareWaitForCalls,
  0,
  'Share activation must not yield to asynchronous target polling',
);
assert.equal(shareSleepCalls, 0, 'Share activation must not wait for the generic click delay');
assert.equal(
  staleShareButton.clickCount,
  0,
  'Share must not click a node detached by scrollIntoView',
);
assert.equal(
  currentShareButton.clickCount,
  1,
  'Share should click the current native button exactly once',
);
assert.equal(
  duplicateShareButton.clickCount,
  0,
  'Share should not activate a second matching header button',
);

const removedShareButton = new FixtureShareButton();
resolvedShareButton = removedShareButton;
removedShareButton.scrollIntoView = () => {
  removedShareButton.isConnected = false;
  resolvedShareButton = null;
};
shareShortcutContext.runShareShortcut();
assert.equal(shareSelectorQueryCount, 4, 'Share should re-resolve even when scrolling removes it');
assert.equal(removedShareButton.clickCount, 0, 'Share must not activate a removed header button');
assert.equal(currentShareButton.clickCount, 1, 'Share must not reuse the previous header button');
assert.equal(duplicateShareButton.clickCount, 0, 'Share must not reuse a previous duplicate');
assert.equal(shareWaitForCalls, 0, 'Missing Share targets must not start asynchronous polling');
assert.equal(shareSleepCalls, 0, 'Missing Share targets must not start a delayed click');

const editTurnLogicStart = contentSource.indexOf('      const EDIT_ICON_TOKENS =');
const editTurnLogicEnd = contentSource.indexOf(
  '      const getEditButtonData =',
  editTurnLogicStart,
);
assert.ok(editTurnLogicStart >= 0 && editTurnLogicEnd > editTurnLogicStart);
const editTurnLogicSource = contentSource
  .slice(editTurnLogicStart, editTurnLogicEnd)
  .replace(/^ {6}/gm, '');
const editTurnContext = {
  CONVERSATION_TURN_SELECTOR: '[data-turn-key], [data-testid^="conversation-turn-"]',
  escapeAttributeSelectorFragment: (value) => value,
  withPrefix: (selectorList, prefix) =>
    selectorList
      .split(',')
      .map((selector) => `${prefix} ${selector.trim()}`)
      .join(', '),
  svgSelectorForTokens: (tokens) =>
    tokens.map((token) => `svg path[d^="${token}"], svg use[href*="${token}"]`).join(', '),
  document: { querySelectorAll: () => [] },
};
runInNewContext(
  `${editTurnLogicSource}\nglobalThis.editSelectors = editSelectors;\nglobalThis.getEditTargetAnchor = getEditTargetAnchor;\nglobalThis.resolveEditTargetTurn = resolveEditTargetTurn;`,
  editTurnContext,
);
assert.deepEqual(
  Array.from(editTurnContext.editSelectors),
  ['button svg path[d^="M11.7313"], button svg use[href*="M11.7313"]'],
  'Edit target resolution should use only its language-independent icon structure',
);
assert.doesNotMatch(
  editTurnLogicSource,
  /aria-label/,
  'Edit target resolution must not depend on localized labels',
);
const makeEditTurn = (attributes) => ({
  attributes: { ...attributes },
  isConnected: true,
  getAttribute(name) {
    return this.attributes[name] ?? null;
  },
  matches(selector) {
    return (
      selector.includes('[data-user-message-bubble="true"]') &&
      this.attributes['data-user-message-bubble'] === 'true'
    );
  },
  querySelector() {
    return null;
  },
});
const editedUserTurn = makeEditTurn({
  'data-turn-key': 'user-turn-1',
  'data-testid': 'conversation-turn-1',
  'data-user-message-bubble': 'true',
});
const replacementEditTurn = makeEditTurn({
  'data-turn-key': 'user-turn-1',
  'data-testid': 'conversation-turn-1',
});
const editMessageContainer = { getAttribute: () => 'user-message-1' };
const editButton = {
  closest(selector) {
    if (selector === editTurnContext.CONVERSATION_TURN_SELECTOR) return editedUserTurn;
    if (selector === '[data-message-id]') return editMessageContainer;
    return null;
  },
};
const editAnchor = editTurnContext.getEditTargetAnchor(editButton);
assert.equal(
  editAnchor.userEditTurnValidated,
  true,
  'A self-marked user bubble validates its edit target',
);
editedUserTurn.attributes['data-user-message-bubble'] = 'false';
assert.equal(
  editTurnContext.resolveEditTargetTurn(editAnchor),
  editedUserTurn,
  'Edit observation must keep the validated turn after its user marker is replaced',
);
editedUserTurn.isConnected = false;
editTurnContext.document.querySelectorAll = (selector) => {
  if (selector.includes('[data-turn-key=')) return [replacementEditTurn];
  return [];
};
assert.equal(
  editTurnContext.resolveEditTargetTurn(editAnchor),
  replacementEditTurn,
  'Edit observation must resolve a replaced turn by its validated stable turn key',
);

const editActivationStart = contentSource.indexOf('      const clickEditButton =');
const editActivationEnd = contentSource.indexOf(
  '\n      const getScrollContainerMetrics',
  editActivationStart,
);
assert.ok(editActivationStart >= 0 && editActivationEnd > editActivationStart);
const editActivationSource = contentSource
  .slice(editActivationStart, editActivationEnd)
  .replace(/^ {6}/gm, '');
const editActivationEvents = [];
const editActivationContext = {
  window: { PointerEvent: FixturePointerEvent },
  PointerEvent: FixturePointerEvent,
  MouseEvent: FixtureMouseEvent,
};
runInNewContext(
  [
    shareDirectClickRuntimeSource,
    'const smartClick = clickElementLikeUser;',
    editActivationSource,
    'globalThis.clickEditButton = clickEditButton;',
  ].join('\n'),
  editActivationContext,
);
const editActivationButton = new FixtureShareButton();
editActivationButton.focusCount = 0;
editActivationButton.focus = () => {
  editActivationButton.focusCount += 1;
};
editActivationButton.dispatchEvent = (event) => {
  editActivationEvents.push(event.type);
  return true;
};
editActivationButton.click = () => {
  editActivationEvents.push('click');
  editActivationButton.clickCount += 1;
  editActivationButton.editModeEntered = true;
};
assert.equal(editActivationContext.clickEditButton(editActivationButton), true);
assert.equal(
  editActivationButton.focusCount,
  1,
  'Edit should focus its resolved native button once',
);
assert.equal(
  editActivationButton.clickCount,
  1,
  'Edit should enter edit mode with exactly one click activation',
);
assert.equal(
  editActivationButton.editModeEntered,
  true,
  'The activation should target Edit, not a submit control',
);
assert.equal(editActivationEvents.filter((eventType) => eventType === 'pointerdown').length, 1);
assert.equal(editActivationEvents.filter((eventType) => eventType === 'pointerup').length, 1);
assert.equal(editActivationEvents.filter((eventType) => eventType === 'click').length, 1);
assert.ok(
  !editActivationEvents.some((eventType) => ['keydown', 'keyup', 'submit'].includes(eventType)),
  'Edit activation must not submit edited content or simulate a keyboard submission',
);
const disabledEditButton = new FixtureShareButton();
disabledEditButton.disabled = true;
assert.equal(editActivationContext.clickEditButton(disabledEditButton), false);
assert.equal(
  disabledEditButton.clickCount,
  0,
  'A disabled native Edit button must not be activated',
);

const copyTargetLogicStart = contentSource.indexOf('  const findButtonsBySvgPathPrefix =');
const copyTargetLogicEnd = contentSource.indexOf(
  '  function splitTextByProtectedBlocks',
  copyTargetLogicStart,
);
const copyTargetLogicSource = contentSource
  .slice(copyTargetLogicStart, copyTargetLogicEnd)
  .replace(/^ {2}/gm, '');
const nativeCodeBoxCopyFinderSource = copyTargetLogicSource.match(
  /function findNativeCodeBoxCopyButtons\(\) \{[\s\S]*?\n\}/,
)?.[0];
const copyViewportSource = contentSource.match(
  / {2}const isFullyInViewport = \(el\) => \{[\s\S]*?\n {2}\};/,
)?.[0];
const copyFromLowestSource = contentSource.match(
  / {2}async function copyFromLowestButton\(dPrefix, opts = \{\}\) \{[\s\S]*?\n {2}\}/,
)?.[0];
const messageCopyIconPathPrefix = contentSource.match(
  /const COPY_MESSAGE_ACTION_ICON_PATH_PREFIX = '([^']+)';/,
)?.[1];
assert.ok(
  copyTargetLogicSource &&
    nativeCodeBoxCopyFinderSource &&
    copyViewportSource &&
    copyFromLowestSource &&
    messageCopyIconPathPrefix,
  'Alt+C native code-block Copy target logic should remain inspectable',
);
assert.match(
  nativeCodeBoxCopyFinderSource,
  /data-markdown-copy="code-block"|NATIVE_CODEBOX_WRAPPER_SELECTOR/,
  'Native code-block Copy discovery must be scoped to ChatGPT code-block wrappers',
);
assert.match(
  nativeCodeBoxCopyFinderSource,
  /NATIVE_CODEBOX_COPY_ICON_PATH_PREFIX/,
  'Native code-block Copy discovery must identify the observed Copy icon structurally',
);
assert.doesNotMatch(
  nativeCodeBoxCopyFinderSource,
  /aria-label|title|innerText|textContent/,
  'Native code-block Copy discovery must not depend on localized labels or text',
);
assert.match(
  copyFromLowestSource,
  /if \(isMsgCopy && copyMessageFromButton\?\.\(btn, \{ altC: true \}\)\) return;/,
  'Formatted message-copy behavior should remain limited to native message Copy actions',
);
assert.match(
  copyFromLowestSource,
  /if \(isCodeBoxCopy \|\| isMsgCopy\) return;/,
  'Native code-block Copy must return before any clipboard read or transformation',
);

const nativeCodeBoxWrapperSelector = '[data-markdown-copy="code-block"]';
const nativeCodeBoxCopyIconPathPrefix = 'M15.1006 1.78516C16.793 1.78556';

class FixtureCopyNode extends FixtureHTMLElement {
  constructor({
    tagName = 'DIV',
    attributes = {},
    iconPath = '',
    rect = { top: 20, left: 20, bottom: 40, right: 80 },
  } = {}) {
    super();
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.iconPath = iconPath;
    this.rect = rect;
    this.parentElement = null;
    this.children = [];
    this.clickCount = 0;
  }

  append(child) {
    child.parentElement = this;
    this.children.push(child);
  }

  matches(selector) {
    return selector.split(',').some((part) => {
      const candidate = part.trim();
      if (candidate === 'button') return this.tagName === 'BUTTON';
      if (candidate === '[role="button"]') return this.getAttribute('role') === 'button';
      if (candidate === nativeCodeBoxWrapperSelector) {
        return this.getAttribute('data-markdown-copy') === 'code-block';
      }
      return false;
    });
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches?.(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector === 'button') {
      const buttons = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (child.matches('button')) buttons.push(child);
          visit(child);
        }
      };
      visit(this);
      return buttons;
    }

    const pathPrefix = selector.match(/^svg path\[d\^="([^"]+)"\]$/)?.[1];
    if (pathPrefix) {
      return this.tagName === 'BUTTON' && this.iconPath.startsWith(pathPrefix) ? [{}] : [];
    }
    return [];
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getBoundingClientRect() {
    return this.rect;
  }

  click() {
    this.clickCount += 1;
  }
}

function makeCodeBoxCopyFixture({
  copyButtonRect = { top: 80, left: 20, bottom: 100, right: 80 },
} = {}) {
  const wrapper = new FixtureCopyNode({
    attributes: { 'data-markdown-copy': 'code-block' },
  });
  const wordWrapButton = new FixtureCopyNode({
    tagName: 'BUTTON',
    attributes: { 'aria-label': 'Wrap lines' },
    rect: { top: 20, left: 20, bottom: 40, right: 80 },
  });
  const nativeCopyButton = new FixtureCopyNode({
    tagName: 'BUTTON',
    // Deliberately omit data-testid and use a non-English label; selection is structural.
    attributes: { 'aria-label': 'Copiar' },
    iconPath: `${nativeCodeBoxCopyIconPathPrefix} ...`,
    rect: copyButtonRect,
  });
  const scrollToBottomButton = new FixtureCopyNode({
    tagName: 'BUTTON',
    attributes: { 'aria-label': 'Scroll to bottom' },
    iconPath: 'M1 1 scroll-control-icon',
    rect: { top: 120, left: 20, bottom: 140, right: 80 },
  });
  wrapper.append(wordWrapButton);
  wrapper.append(nativeCopyButton);
  wrapper.append(scrollToBottomButton);

  const copyCounters = {
    clipboardRead: 0,
    clipboardWrite: 0,
    clipboardTransform: 0,
    permissionQuery: 0,
    formattedMessageCopy: 0,
  };
  const fixtureDocument = {
    body: {},
    documentElement: { clientWidth: 800, clientHeight: 600 },
    querySelectorAll(selector) {
      if (selector === nativeCodeBoxWrapperSelector) return [wrapper];
      return [];
    },
  };
  const context = {
    document: fixtureDocument,
    Element: FixtureCopyNode,
    window: {
      innerWidth: 800,
      innerHeight: 600,
      __copyLowestState: null,
      gsap: null,
    },
    navigator: {
      clipboard: {
        async readText() {
          copyCounters.clipboardRead += 1;
          return '';
        },
        async writeText() {
          copyCounters.clipboardWrite += 1;
        },
      },
      permissions: {
        async query() {
          copyCounters.permissionQuery += 1;
        },
      },
    },
    copyCounters,
    isAboveComposer: () => true,
  };
  runInNewContext(
    [
      `const COPY_MESSAGE_ACTION_ICON_PATH_PREFIX = '${messageCopyIconPathPrefix}';`,
      'const toTokenArray = (tokens) => (Array.isArray(tokens) ? tokens : [tokens]);',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal JavaScript source evaluated by this fixture.
      'const svgSelectorForTokens = (tokens) => `svg path[d^="${Array.isArray(tokens) ? tokens[0] : tokens}"]`;',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal JavaScript source evaluated by this fixture.
      'const withPrefix = (selector, prefix) => `${prefix} ${selector}`;',
      'const isAboveComposer = () => true;',
      copyViewportSource.replace(/^ {2}/gm, ''),
      copyTargetLogicSource,
      'let copyLowestRunToken = 0;',
      'const cancelCopyLowestDelays = () => {};',
      'const delayCopyLowest = async () => true;',
      'let copyMessageFromButton = () => { copyCounters.formattedMessageCopy += 1; return false; };',
      'function sanitizeCopiedText(text) { copyCounters.clipboardTransform += 1; return text; }',
      copyFromLowestSource.replace(/^ {2}/gm, ''),
      'globalThis.getVisibleCopyButtons = getVisibleCopyButtonsSorted;',
      `globalThis.runAltCCopy = () => copyFromLowestButton(['${messageCopyIconPathPrefix}'], { delayBeforeClick: 0 });`,
    ].join('\n'),
    context,
  );

  return {
    context,
    copyCounters,
    nativeCopyButton,
    scrollToBottomButton,
    wordWrapButton,
  };
}

const codeBoxCopyFixture = makeCodeBoxCopyFixture();
const visibleCodeBoxCopyTargets =
  codeBoxCopyFixture.context.getVisibleCopyButtons(messageCopyIconPathPrefix);
assert.equal(
  visibleCodeBoxCopyTargets.length,
  1,
  'Only the native code-block Copy button should qualify',
);
assert.equal(
  visibleCodeBoxCopyTargets[0],
  codeBoxCopyFixture.nativeCopyButton,
  'Alt+C should resolve the exact native Copy button inside the code-block wrapper',
);
await codeBoxCopyFixture.context.runAltCCopy();
await codeBoxCopyFixture.context.runAltCCopy();
assert.equal(
  codeBoxCopyFixture.nativeCopyButton.clickCount,
  2,
  'Repeated Alt+C should click native Copy once per activation',
);
assert.equal(
  codeBoxCopyFixture.wordWrapButton.clickCount,
  0,
  'Alt+C must not click the word-wrap control',
);
assert.equal(
  codeBoxCopyFixture.scrollToBottomButton.clickCount,
  0,
  'Alt+C must not click the scroll-to-bottom control',
);
assert.deepEqual(codeBoxCopyFixture.copyCounters, {
  clipboardRead: 0,
  clipboardWrite: 0,
  clipboardTransform: 0,
  permissionQuery: 0,
  formattedMessageCopy: 0,
});

const hiddenCodeBoxCopyFixture = makeCodeBoxCopyFixture({
  copyButtonRect: { top: 700, left: 20, bottom: 720, right: 80 },
});
assert.equal(
  hiddenCodeBoxCopyFixture.context.getVisibleCopyButtons(messageCopyIconPathPrefix).length,
  0,
  'A hidden native code-block Copy button should not be selected',
);
await hiddenCodeBoxCopyFixture.context.runAltCCopy();
assert.equal(
  hiddenCodeBoxCopyFixture.nativeCopyButton.clickCount,
  0,
  'A hidden copy target should be a no-op',
);

console.log(
  'live shortcut targets match current ChatGPT controls; Branch menu cascade, Read Aloud, same-task Share, validated Edit turns, and exact native code-block Copy pass focused fixtures',
);
