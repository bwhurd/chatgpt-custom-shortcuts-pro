import assert from 'node:assert/strict';
import test from 'node:test';
import { getCodeboxProbePreparationPlan } from './playwright/lib/devscrape-wide-core.mjs';

const ownedConversationUrl = 'https://chatgpt.com/c/audit-owned-codebox-1';

test('capture-only code-block setup reuses its owned conversation and needs one block', () => {
  const plan = getCodeboxProbePreparationPlan({
    captureOnly: true,
    sessionInitialized: true,
    sessionConversationUrl: ownedConversationUrl,
    currentUrl: 'https://chatgpt.com/',
  });

  assert.equal(plan.reuseConversationUrl, ownedConversationUrl);
  assert.equal(plan.restoreConversation, true);
  assert.deepEqual(plan.promptKeys, ['wrap-story']);
  assert.equal(plan.requiredCodeBlockCount, 1);
  assert.equal(plan.clearClipboard, false);
});

test('copy shortcut setup retains both code blocks and clipboard preparation', () => {
  const plan = getCodeboxProbePreparationPlan({
    sessionInitialized: true,
    sessionConversationUrl: ownedConversationUrl,
    currentUrl: ownedConversationUrl,
  });

  assert.equal(plan.reuseConversationUrl, ownedConversationUrl);
  assert.equal(plan.restoreConversation, false);
  assert.deepEqual(plan.promptKeys, ['wrap-story', 'copy-story']);
  assert.equal(plan.requiredCodeBlockCount, 2);
  assert.equal(plan.clearClipboard, true);
});

test('capture-only setup creates a fresh conversation when no owned source is usable', () => {
  const plan = getCodeboxProbePreparationPlan({
    captureOnly: true,
    sessionInitialized: true,
    sessionConversationUrl: 'https://chatgpt.com/?temporary-chat=true',
    currentUrl: 'https://chatgpt.com/',
  });

  assert.equal(plan.reuseConversationUrl, '');
  assert.equal(plan.restoreConversation, false);
  assert.deepEqual(plan.promptKeys, ['wrap-story']);
  assert.equal(plan.requiredCodeBlockCount, 1);
  assert.equal(plan.clearClipboard, false);
});
