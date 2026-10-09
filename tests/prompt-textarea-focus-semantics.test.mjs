import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateLiveProbeSemantic,
  matchesLiveProbeFocusTarget,
} from './playwright/lib/devscrape-wide-core.mjs';

const promptTextareaShortcut = {
  actionId: 'shortcutKeyActivateInput',
  activationProbeMode: 'focus-target',
  activationProbeExpectedTargetRef: 'prompt-textarea',
};

const promptTextareaTarget = { targetId: 'prompt-textarea' };

test('prompt textarea focus passes when the active element is inside the composer', () => {
  const proof = evaluateLiveProbeSemantic(
    promptTextareaShortcut,
    promptTextareaTarget,
    { activeTarget: false, composerFocused: false },
    { activeTarget: false, composerFocused: true },
  );

  assert.equal(proof.status, 'pass');
  assert.match(proof.observed, /composer/);
});

test('prompt textarea focus fails when only the exact target marker is active', () => {
  const proof = evaluateLiveProbeSemantic(
    promptTextareaShortcut,
    promptTextareaTarget,
    { activeTarget: false, composerFocused: false },
    { activeTarget: true, composerFocused: false },
  );

  assert.equal(proof.status, 'fail');
});

test('prompt textarea routing match uses composer containment', () => {
  assert.equal(
    matchesLiveProbeFocusTarget(promptTextareaTarget, { composerFocused: true }, ''),
    true,
  );
  assert.equal(
    matchesLiveProbeFocusTarget(promptTextareaTarget, { composerFocused: false }, ''),
    false,
  );
});

test('other focus targets retain exact target matching and active-target semantics', () => {
  const target = {
    targetId: 'other-focus-target',
    matchGroups: [['data-target="other-focus-target"']],
  };
  const shortcut = {
    actionId: 'otherFocusAction',
    activationProbeMode: 'focus-target',
    activationProbeExpectedTargetRef: 'other-focus-target',
  };

  assert.equal(
    matchesLiveProbeFocusTarget(
      target,
      { composerFocused: false },
      '<div data-target="other-focus-target"></div>',
    ),
    true,
  );
  assert.equal(matchesLiveProbeFocusTarget(target, { composerFocused: true }, ''), false);
  assert.equal(
    evaluateLiveProbeSemantic(shortcut, target, { activeTarget: false }, { activeTarget: true })
      .status,
    'pass',
  );
  assert.equal(
    evaluateLiveProbeSemantic(
      shortcut,
      target,
      { activeTarget: false },
      { activeTarget: false, composerFocused: true },
    ).status,
    'fail',
  );
});
