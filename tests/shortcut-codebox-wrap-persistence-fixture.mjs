import assert from 'node:assert/strict';

import { buildCodeboxWrapPersistenceProof } from './playwright/lib/devscrape-wide-core.mjs';

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

const persistedProof = buildCodeboxWrapPersistenceProof(
  enabledStorage,
  enabledStorage,
  snapshot(),
);
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

const cssMismatchProof = buildCodeboxWrapPersistenceProof(
  enabledStorage,
  enabledStorage,
  snapshot({
    codeboxWrapMetrics: [
      {
        requiresWrap: true,
        hasActualWrap: true,
        whiteSpace: 'pre',
        overflowWrap: 'anywhere',
        scrollportClientWidth: 700,
        scrollportScrollWidth: 700,
      },
    ],
  }),
);
assert.equal(cssMismatchProof.status, 'fail');

console.log('codebox wrap persistence proof accepts required wrapped lines and rejects missing state, wraps, CSS, or geometry');
