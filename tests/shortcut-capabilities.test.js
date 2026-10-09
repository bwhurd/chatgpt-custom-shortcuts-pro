const assert = require('node:assert/strict');
const { before, test } = require('node:test');
let assertCapabilities;
let deriveFreshCapabilities;
let getUnavailableCapabilities;
let unknownCapabilities;
before(async () => {
  ({
    assertCapabilities,
    deriveFreshCapabilities,
    getUnavailableCapabilities,
    unknownCapabilities,
  } = await import('./playwright/lib/shortcut-capabilities.mjs'));
});

test('missing or generic slider catalogs cannot establish Pro-only capability', () => {
  for (const modelCatalog of [
    undefined,
    {},
    { frontendByConfig: {} },
    { frontendByConfig: { current: [] } },
    { frontendByConfig: { current: [{ id: '', available: false }] } },
    { frontendByConfig: { current: [{ id: 'pro', available: true, sliderValue: 2 }] } },
    { frontendByConfig: { current: [{ id: 'pro', available: false, sliderValue: 2 }] } },
  ]) {
    const capabilities = deriveFreshCapabilities({ modelCatalog });
    assert.equal(capabilities.proEffort, 'unknown');
    assert.equal(capabilities.dedicatedEffortControls, 'unknown');
    assert.deepEqual(getUnavailableCapabilities(['proEffort'], capabilities), []);
  }
});

test('dedicated effort controls are unavailable only from a passing v2 integrated projection', () => {
  const projection = {
    schemaVersion: 2,
    source: 'fresh-current-model-catalog-action-projection-v2',
    status: 'pass',
    profile: 'legacy',
    activeConfigId: 'configure-latest',
    sliderRange: { min: 0, max: 2, value: 1 },
    actions: [{ profile: 'legacy', slot: 0, actionId: 'instant', available: true, sliderValue: 0 }],
    integratedEffort: true,
    issueCodes: [],
  };
  const capabilities = deriveFreshCapabilities({ currentModelCatalogActionProjection: projection });
  assert.equal(capabilities.dedicatedEffortControls, 'unavailable');
  assert.equal(capabilities.proEffort, 'unknown');

  for (const incompleteProjection of [
    { ...projection, integratedEffort: false },
    { ...projection, integratedEffort: null },
    { ...projection, status: 'unknown' },
    { ...projection, schemaVersion: 1 },
    { ...projection, source: 'untrusted' },
    { ...projection, issueCodes: ['catalog-not-verified-complete'] },
    { ...projection, actions: [] },
    { ...projection, activeConfigId: '' },
    Object.fromEntries(Object.entries(projection).filter(([key]) => key !== 'integratedEffort')),
  ]) {
    assert.equal(
      deriveFreshCapabilities({ currentModelCatalogActionProjection: incompleteProjection })
        .dedicatedEffortControls,
      'unknown',
    );
  }
});

test('only explicit Pro-only evidence can make the capability unavailable', () => {
  const capabilities = unknownCapabilities();
  assert.deepEqual(getUnavailableCapabilities(['proEffort'], capabilities), []);
  assert.deepEqual(
    getUnavailableCapabilities(['proEffort'], { ...capabilities, proEffort: 'unavailable' }),
    ['proEffort'],
  );
});

test('Configure absence requires a verified current model menu', () => {
  assert.deepEqual(
    deriveFreshCapabilities({ modelMenuText: '<div></div>' }),
    unknownCapabilities(),
  );
  assert.equal(
    deriveFreshCapabilities({ modelMenuText: '<div></div>', modelMenuVerified: true })
      .configureRoute,
    'unavailable',
  );
  assert.equal(
    deriveFreshCapabilities({
      modelMenuText: '<button data-testid="model-configure-modal">',
      modelMenuVerified: true,
    }).configureRoute,
    'available',
  );
});

test('public capability marker rejects additional data', () => {
  assert.throws(
    () => assertCapabilities({ ...unknownCapabilities(), privateText: 'canary' }),
    /schema/,
  );
});

test('capability marker v2 has strict keys and accepts v1 without upgrading its proof version', () => {
  const legacy = {
    schemaVersion: 1,
    source: 'fresh-model-picker-v1',
    proEffort: 'unknown',
    configureRoute: 'unavailable',
  };
  assert.equal(assertCapabilities(legacy), legacy);
  assert.deepEqual(getUnavailableCapabilities(['dedicatedEffortControls'], legacy), []);
  assert.deepEqual(Object.keys(unknownCapabilities()).sort(), [
    'configureRoute',
    'dedicatedEffortControls',
    'proEffort',
    'schemaVersion',
    'source',
  ]);
  assert.throws(
    () => assertCapabilities({ ...legacy, dedicatedEffortControls: 'unavailable' }),
    /schema/,
  );
  assert.throws(() => assertCapabilities({ ...unknownCapabilities(), extra: true }), /schema/);
});
