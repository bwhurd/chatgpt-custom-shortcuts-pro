import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import {
  buildCodeboxWrapPersistenceProof,
  verifyCodeboxWrapConversationSwitch,
} from './playwright/lib/devscrape-wide-core.mjs';

const contentSource = readFileSync(new URL('../extension/content.js', import.meta.url), 'utf8');
const wrapControllerStart = contentSource.indexOf(
  '// @note Code box line-wrap toggle implementation',
);
const wrapControllerEnd = contentSource.indexOf('// Shared menu DOM helpers.', wrapControllerStart);
assert.notEqual(wrapControllerStart, -1);
assert.notEqual(wrapControllerEnd, -1);

const restoredClasses = new Set(['csp-codebox-wrap-enabled']);
const restoredStyles = new Map();
const documentMock = {
  documentElement: {
    classList: {
      contains: (className) => restoredClasses.has(className),
      toggle: (className, enabled) => {
        if (enabled) restoredClasses.add(className);
        else restoredClasses.delete(className);
      },
    },
  },
  head: {
    appendChild: (style) => restoredStyles.set(style.id, style),
  },
  getElementById: (id) => restoredStyles.get(id) || null,
  createElement: (tagName) => ({ tagName, id: '', textContent: '' }),
};
const windowMock = { codeboxWrapEnabled: true };

runInNewContext(contentSource.slice(wrapControllerStart, wrapControllerEnd), {
  document: documentMock,
  window: windowMock,
});

const restoredStyle = restoredStyles.get('csp-codebox-wrap-style');
assert.ok(
  restoredStyle,
  'reload bootstrap must install CSS when the enabled class is already restored',
);
assert.match(restoredStyle.textContent, /white-space:\s*pre-wrap\s*!important/);
assert.equal(restoredClasses.has('csp-codebox-wrap-enabled'), true);

const enabledStorage = { codeboxWrapEnabled: true };
const snapshot = (overrides = {}) => ({
  codeboxWrapEnabled: true,
  codeboxCount: 2,
  codeboxWrappedCount: 1,
  codeboxWrapSatisfied: false,
  codeboxHorizontalOverflowCount: 0,
  codeboxWrapMetrics: [
    {
      requiresWrap: true,
      hasActualWrap: true,
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      scrollportClientWidth: 700,
      scrollportScrollWidth: 700,
    },
    {
      requiresWrap: false,
      hasActualWrap: false,
      whiteSpace: 'pre',
      overflowWrap: 'normal',
      scrollportClientWidth: 700,
      scrollportScrollWidth: 700,
    },
  ],
  ...overrides,
});

const persistedProof = buildCodeboxWrapPersistenceProof(enabledStorage, enabledStorage, snapshot());
assert.equal(persistedProof.status, 'pass');
assert.equal(persistedProof.codeboxWrapSatisfied, false);
assert.equal(persistedProof.requiredWrapCount, 1);
assert.equal(persistedProof.actuallyWrappedCount, 1);
assert.equal(persistedProof.horizontalOverflowCount, 0);

const notPersistedProof = buildCodeboxWrapPersistenceProof(
  enabledStorage,
  { codeboxWrapEnabled: false },
  snapshot(),
);
assert.equal(notPersistedProof.status, 'fail');

const unwrappedProof = buildCodeboxWrapPersistenceProof(
  enabledStorage,
  enabledStorage,
  snapshot({
    codeboxHorizontalOverflowCount: 1,
    codeboxWrapMetrics: [
      {
        requiresWrap: true,
        hasActualWrap: false,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        scrollportClientWidth: 700,
        scrollportScrollWidth: 900,
      },
    ],
  }),
);
assert.equal(unwrappedProof.status, 'fail');
assert.equal(unwrappedProof.actuallyWrappedCount, 0);

const noRequiredWrapProof = buildCodeboxWrapPersistenceProof(
  enabledStorage,
  enabledStorage,
  snapshot({
    codeboxWrapMetrics: [
      {
        requiresWrap: false,
        hasActualWrap: false,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        scrollportClientWidth: 700,
        scrollportScrollWidth: 700,
      },
    ],
  }),
);
assert.equal(noRequiredWrapProof.status, 'fail');

// Native layered whitespace-pre can win on code while extension CSS wraps its
// descendants. Rendered text geometry, rather than the ancestor shorthand,
// proves the overlong line wrapped after reload.
const descendantWrappedProof = buildCodeboxWrapPersistenceProof(
  enabledStorage,
  enabledStorage,
  snapshot({
    codeboxWrapMetrics: [
      {
        requiresWrap: true,
        hasActualWrap: true,
        whiteSpace: 'pre',
        overflowWrap: 'anywhere',
        hardLineCount: 1,
        visualLineCount: 5,
        wrappedLineCount: 4,
        scrollportClientWidth: 700,
        scrollportScrollWidth: 700,
      },
    ],
  }),
);
assert.equal(descendantWrappedProof.status, 'pass');

const genuinelyUnwrappedProof = buildCodeboxWrapPersistenceProof(
  enabledStorage,
  enabledStorage,
  snapshot({
    codeboxWrapMetrics: [
      {
        requiresWrap: true,
        hasActualWrap: false,
        whiteSpace: 'pre',
        overflowWrap: 'anywhere',
        hardLineCount: 1,
        visualLineCount: 1,
        wrappedLineCount: 0,
        scrollportClientWidth: 700,
        scrollportScrollWidth: 700,
      },
    ],
  }),
);
assert.equal(genuinelyUnwrappedProof.status, 'fail');

const overflowingWrappedProof = buildCodeboxWrapPersistenceProof(
  enabledStorage,
  enabledStorage,
  snapshot({
    codeboxHorizontalOverflowCount: 1,
    codeboxWrapMetrics: [
      {
        requiresWrap: true,
        hasActualWrap: true,
        whiteSpace: 'pre',
        overflowWrap: 'anywhere',
        scrollportClientWidth: 700,
        scrollportScrollWidth: 900,
      },
    ],
  }),
);
assert.equal(overflowingWrappedProof.status, 'fail');

const ownedConversationUrl = 'https://chatgpt.com/c/synthetic-wrap-audit';
const rootUrl = 'https://chatgpt.com/';
const switchSnapshot = (overrides = {}) =>
  snapshot({
    url: ownedConversationUrl,
    hasComposer: true,
    composerHasText: false,
    codeboxCount: 1,
    codeboxWrapMetrics: [descendantWrappedProof.codeboxWrapMetrics[0]],
    ...overrides,
  });
const runSwitchFixture = async ({
  returned = {},
  blank = {},
  ownedIds = ['synthetic-wrap-audit'],
  protectedIds = [],
} = {}) => {
  let currentUrl = ownedConversationUrl;
  const navigations = [];
  const phases = [];
  const checkpoint = { currentCase: {} };
  const page = {
    url: () => currentUrl,
    goto: async (url) => {
      navigations.push(url);
      currentUrl = url;
    },
    waitForTimeout: async () => {},
  };
  const promise = verifyCodeboxWrapConversationSwitch(page, {
    sourceSnapshot: switchSnapshot(),
    storedBeforeSwitch: enabledStorage,
    auditOwnedConversationIds: ownedIds,
    protectedConversationIds: protectedIds,
    checkpoint,
    persistCheckpoint: async () => phases.push(checkpoint.currentCase.phase),
    readStorage: async () => enabledStorage,
    waitForReady: async () => {},
    waitForCodeBlocks: async () => {},
    captureSnapshot: async () =>
      currentUrl === rootUrl
        ? { url: rootUrl, hasComposer: true, messageCount: 0, composerHasText: false, ...blank }
        : switchSnapshot(returned),
  });
  return { promise, navigations, phases, checkpoint };
};

const successfulSwitch = await runSwitchFixture();
assert.equal((await successfulSwitch.promise).status, 'pass');
assert.deepEqual(successfulSwitch.navigations, [rootUrl, ownedConversationUrl]);
assert.deepEqual(successfulSwitch.phases, [
  'codebox-persistence-switch-blank-pending',
  'codebox-persistence-switch-blank-verified',
  'codebox-persistence-switch-return-pending',
  'codebox-persistence-switch-verified',
]);
assert.equal(
  successfulSwitch.checkpoint.currentCase.conversationSwitchProof.blankRootVerified,
  true,
);
assert.equal(
  successfulSwitch.checkpoint.currentCase.conversationSwitchProof.sameOwnedConversationRestored,
  true,
);

const unwrappedSwitch = await runSwitchFixture({
  returned: {
    codeboxWrapMetrics: [{ ...descendantWrappedProof.codeboxWrapMetrics[0], hasActualWrap: false }],
  },
});
assert.equal((await unwrappedSwitch.promise).status, 'fail');
assert.equal(unwrappedSwitch.phases.at(-1), 'codebox-persistence-switch-failed');

const unknownConversation = await runSwitchFixture({ ownedIds: [] });
await assert.rejects(unknownConversation.promise, /draft-free owned codebox conversation/);
assert.deepEqual(unknownConversation.navigations, []);

const protectedConversation = await runSwitchFixture({ protectedIds: ['synthetic-wrap-audit'] });
await assert.rejects(protectedConversation.promise, /draft-free owned codebox conversation/);
assert.deepEqual(protectedConversation.navigations, []);

const draftAtRoot = await runSwitchFixture({ blank: { composerHasText: true } });
await assert.rejects(draftAtRoot.promise, /root was not blank; no draft was changed/);
assert.deepEqual(draftAtRoot.navigations, [rootUrl, ownedConversationUrl]);
assert.equal(draftAtRoot.checkpoint.currentCase.codeboxSwitchBlankRootVerified, false);

console.log(
  'codebox wrap persistence proof accepts rendered descendant wrapping and rejects missing state, wrapping, or overflow',
);
