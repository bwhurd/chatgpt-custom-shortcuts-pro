import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const modelPickerSelectors = require('../extension/shared/model-picker-selectors.js');
const shortcutMetadata = require('../extension/shared/shortcut-action-metadata.js');
const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');

const descriptorById = new Map(
  shortcutMetadata.TARGET_DESCRIPTORS.map((descriptor) => [descriptor.targetId, descriptor]),
);

const currentTargetTokens = {
  'assistant-more-actions-trigger': '#623957',
  'assistant-web-regenerate-item-different-model': '#ffd536',
  'temporary-chat-button': '#chat-temp',
  'composer-web-search-action': '#skill-globe-dark',
  'composer-create-image-action': '#create-image-plugin',
  'composer-deep-research-action': '#skill-deep-research-dark',
  'composer-add-photos-files-action': '#paperclip',
  'dictate-start-button': '#microphone-regular-24',
  'dictate-submit-button': '#75ee4d',
  'cancel-dictation-button': '#2dc143',
  'new-gpt-conversation-item': '#compose',
};

for (const [targetId, token] of Object.entries(currentTargetTokens)) {
  const descriptor = descriptorById.get(targetId);
  assert.ok(descriptor, `${targetId} should remain in the target inventory`);
  assert.ok(
    descriptor.searchNeedles.includes(token),
    `${targetId} should list the current live token ${token}`,
  );
  assert.match(contentSource, new RegExp(token.replace(/[#$]/g, '\\$&')));
}

assert.match(
  contentSource,
  /button\[aria-label="Temporary chat"\]/,
  'Temporary Chat should prefer its stable accessible label',
);
assert.match(
  contentSource,
  /button\[aria-label="Start dictation"\]/,
  'Dictation should prefer the stable start label',
);
assert.match(
  contentSource,
  /button\[aria-label="Cancel dictation"\]/,
  'Dictation cancellation should prefer the stable cancel label',
);
assert.match(
  contentSource,
  /button\[aria-label="Send dictated message"\]/,
  'Dictation submission should prefer the stable submit label',
);
assert.equal(
  modelPickerSelectors.PILL_ADVANCED_TOGGLE_SELECTOR,
  '[role="menuitem"][aria-expanded]:not([aria-haspopup="menu"])',
);

const activeTargetIds = new Set(
  shortcutMetadata.SHORTCUT_ACTIONS.filter((action) => action.validationMode === 'scrape-targets')
    .flatMap((action) => action.targetRefs),
);
for (const targetId of Object.keys(currentTargetTokens)) {
  assert.ok(activeTargetIds.has(targetId), `${targetId} should be covered by an active shortcut`);
}

console.log('live shortcut target mappings include current ChatGPT controls and Advanced-first model routing');
