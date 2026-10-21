import assert from 'node:assert/strict';
import metadata from '../extension/shared/shortcut-action-metadata.js';
import nativeSearch from '../extension/shortcuts/search.js';

const button = (id) => ({
  id,
  tagName: 'BUTTON',
  isConnected: true,
  matches: (selector) => selector === 'button',
  getAttribute: () => null,
});
const expanded = button('expanded-search');
const collapsed = button('collapsed-search');
const close = { previousElementSibling: expanded };
const newChat = {
  parentElement: {
    nextElementSibling: {
      querySelectorAll: (selector) =>
        selector === 'button[data-sidebar-item="true"]' ? [collapsed] : [],
    },
  },
};
const expandedRoot = {
  querySelectorAll: (selector) =>
    selector === '#sidebar-header button[data-testid="close-sidebar-button"]' ? [close] : [],
};
const collapsedRoot = {
  querySelectorAll: (selector) =>
    selector === '#stage-sidebar-tiny-bar [data-testid="create-new-chat-button"]' ? [newChat] : [],
};
const clicks = [];
const actions = nativeSearch.create({
  document: expandedRoot,
  isVisible: () => true,
  click: (element) => {
    clicks.push(element.id);
    return true;
  },
});
assert.equal(actions.inspect(undefined, { root: expandedRoot }).element, expanded);
assert.equal(actions.inspect(undefined, { root: collapsedRoot }).element, collapsed);
assert.equal((await actions.run({ root: expandedRoot })).ok, true);
assert.equal((await actions.run({ root: collapsedRoot })).ok, true);
assert.deepEqual(clicks, ['expanded-search', 'collapsed-search']);
const descriptor = metadata.TARGET_DESCRIPTORS.find(
  (target) => target.targetId === nativeSearch.TARGET_ID,
);
assert.deepEqual(descriptor.matchGroups, nativeSearch.targets[nativeSearch.TARGET_ID].matchGroups);
assert.ok(
  descriptor.matchGroups.some(
    (group) =>
      group.includes('id="sidebar-header"') && group.includes('data-testid="close-sidebar-button"'),
  ),
);
assert.ok(
  descriptor.matchGroups.some(
    (group) =>
      group.includes('id="stage-sidebar-tiny-bar"') &&
      group.includes('data-testid="create-new-chat-button"'),
  ),
);
console.log(
  'Authored Search module resolves and activates the expanded and collapsed native structural controls.',
);
