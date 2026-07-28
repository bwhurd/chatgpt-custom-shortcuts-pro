import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const shortcutMetadata = require('../extension/shared/shortcut-action-metadata.js');
const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const helperStart = contentSource.indexOf('function findStructuralSearchConversationButton');
const helperEnd = contentSource.indexOf('function navigateToNewConversationFallback', helperStart);

assert.ok(
  helperStart >= 0 && helperEnd > helperStart,
  'Search Chats should have a structural native-button resolver',
);

const expandedSearchButton = { id: 'expanded-search', matches: (selector) => selector === 'button' };
const closeSidebarButton = { previousElementSibling: expandedSearchButton };
const expandedRoot = {
  querySelector(selector) {
    if (selector === '#sidebar-header button[data-testid="close-sidebar-button"]') {
      return closeSidebarButton;
    }
    return null;
  },
};

const collapsedSearchButton = { id: 'collapsed-search', matches: (selector) => selector === 'button' };
const collapsedSearchWrapper = {
  querySelector(selector) {
    return selector === 'button[data-sidebar-item="true"]' ? collapsedSearchButton : null;
  },
};
const collapsedNewChatWrapper = { nextElementSibling: collapsedSearchWrapper };
const collapsedNewChat = { parentElement: collapsedNewChatWrapper };
const collapsedContainer = {
  querySelector(selector) {
    return selector === '[data-testid="create-new-chat-button"]' ? collapsedNewChat : null;
  },
};
const collapsedRoot = {
  querySelector(selector) {
    if (selector === '#stage-sidebar-tiny-bar') return collapsedContainer;
    return null;
  },
};

const helperContext = vm.createContext({
  document: expandedRoot,
  expandedRoot,
  collapsedRoot,
});
vm.runInContext(
  `${contentSource.slice(helperStart, helperEnd)}
globalThis.findSearch = findStructuralSearchConversationButton;`,
  helperContext,
  { filename: 'search-chats-structural-helper.js' },
);

assert.equal(
  helperContext.findSearch(expandedRoot, () => true),
  expandedSearchButton,
  'expanded Search should resolve as the button immediately before Close sidebar',
);
assert.equal(
  helperContext.findSearch(collapsedRoot, () => true),
  collapsedSearchButton,
  'collapsed Search should resolve as the sidebar item immediately after New Chat',
);

const triggerStart = contentSource.indexOf('function triggerNativeSearchConversationButton');
const triggerEnd = contentSource.indexOf('function triggerDirectComposerActivation', triggerStart);
const triggerSource = contentSource.slice(triggerStart, triggerEnd);
const structuralIndex = triggerSource.indexOf('findStructuralSearchConversationButton');
const spriteFallbackIndex = triggerSource.indexOf('SEARCH_SPRITE_FRAGMENT');
const popoverFallbackIndex = triggerSource.indexOf(
  'triggerNativeSearchConversationFromNarrowPopover',
);
assert.ok(
  structuralIndex >= 0 &&
    spriteFallbackIndex > structuralIndex &&
    popoverFallbackIndex > spriteFallbackIndex,
  'Search Chats should use the structural direct target before sprite and popover fallbacks',
);

const searchTarget = shortcutMetadata.TARGET_DESCRIPTORS.find(
  (descriptor) => descriptor.targetId === 'search-conversation-button',
);
assert.ok(searchTarget, 'Search Chats should retain a runtime-selector validation target');
assert.ok(
  searchTarget.matchGroups.some(
    (group) =>
      group.includes('id="sidebar-header"') &&
      group.includes('data-testid="close-sidebar-button"'),
  ),
  'runtime validation should recognize the expanded structural Search control',
);
assert.ok(
  searchTarget.matchGroups.some(
    (group) =>
      group.includes('id="stage-sidebar-tiny-bar"') &&
      group.includes('data-testid="create-new-chat-button"') &&
      group.includes('data-sidebar-item="true"'),
  ),
  'runtime validation should recognize the collapsed structural Search control',
);

console.log('Search Chats uses the current structural native control');
