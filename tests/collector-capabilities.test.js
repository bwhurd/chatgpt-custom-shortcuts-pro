const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

let buildCurrentShortcutInventory;
let deriveCollectorCapabilities;
let getRegistryCapabilityDeferral;
let getUnavailableCapabilityStatus;
let loadDevScrapeWideContract;
let resolveLiveProbeCapabilities;
let unknownCapabilities;
let primaryModelMenuTarget;
let shortcutInventory;

before(async () => {
  const core = await import('./playwright/lib/devscrape-wide-core.mjs');
  const capabilityHelpers = await import('./playwright/lib/shortcut-capabilities.mjs');
  ({
    buildCurrentShortcutInventory,
    deriveCollectorCapabilities,
    getRegistryCapabilityDeferral,
    getUnavailableCapabilityStatus,
    loadDevScrapeWideContract,
    resolveLiveProbeCapabilities,
  } = core);
  ({ unknownCapabilities } = capabilityHelpers);
  const { exports } = await loadDevScrapeWideContract();
  shortcutInventory = await buildCurrentShortcutInventory(exports.DUMP_REGISTRY);
  primaryModelMenuTarget = shortcutInventory.targets.find(
    (target) => target.targetId === 'model-switcher-menu',
  );
});

function primaryMenuMatchingText(target) {
  const group = target.matchGroups.find((matchGroup) => matchGroup.length > 0);
  const needles = Array.isArray(group) ? group : [group];
  return `${needles.join('\n')} [data-testid="model-configure-modal"]`;
}

test('Configure capability requires the existing primary model-menu target to match', () => {
  assert.ok(primaryModelMenuTarget, 'the current inventory defines the primary model menu');
  const freshModelCatalog = {
    frontendByConfig: {
      'configure-latest': [{ id: 'instant', available: true }],
    },
  };

  const genericConfigureText = deriveCollectorCapabilities({
    freshModelCatalog,
    modelMenuTarget: primaryModelMenuTarget,
    modelMenuText: '<div data-testid="model-configure-modal"></div>',
  });
  assert.equal(genericConfigureText.configureRoute, 'unknown');
  assert.equal(genericConfigureText.proEffort, 'unknown');

  const matchingPrimaryMenu = deriveCollectorCapabilities({
    freshModelCatalog,
    modelMenuTarget: primaryModelMenuTarget,
    modelMenuText: primaryMenuMatchingText(primaryModelMenuTarget),
  });
  assert.equal(matchingPrimaryMenu.configureRoute, 'available');

  const wrongTarget = deriveCollectorCapabilities({
    freshModelCatalog,
    modelMenuTarget: { ...primaryModelMenuTarget, targetId: 'another-target' },
    modelMenuText: primaryMenuMatchingText(primaryModelMenuTarget),
  });
  assert.equal(wrongTarget.configureRoute, 'unknown');
});

test('generic slider positions never establish Pro-only effort support or absence', () => {
  for (const entries of [
    [{ id: 'pro', label: 'High', available: true }],
    [{ id: 'pro', label: 'High', available: false }],
    [{ id: 'instant', available: true }],
    [],
  ]) {
    const capabilities = deriveCollectorCapabilities({
      freshModelCatalog: { frontendByConfig: { 'configure-latest': entries } },
      modelMenuTarget: primaryModelMenuTarget,
      modelMenuText: primaryMenuMatchingText(primaryModelMenuTarget),
    });
    assert.equal(capabilities.proEffort, 'unknown');
    assert.equal(
      getRegistryCapabilityDeferral({ requiredCapabilities: ['proEffort'] }, capabilities),
      '',
    );
  }
});

test('incomplete fresh catalog leaves Pro unknown instead of deferring its registry state', () => {
  const capabilities = deriveCollectorCapabilities({
    freshModelCatalog: {
      frontendByConfig: {
        'configure-latest': [{ id: 'instant', available: true }, { id: 'pro' }],
      },
    },
    modelMenuTarget: primaryModelMenuTarget,
    modelMenuText: primaryMenuMatchingText(primaryModelMenuTarget),
  });
  const proRegistryState = { requiredCapabilities: ['proEffort'] };

  assert.equal(capabilities.proEffort, 'unknown');
  assert.equal(getRegistryCapabilityDeferral(proRegistryState, capabilities), '');
});

test('integrated-effort capability requires the passing current invocation projection', () => {
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
  const unavailable = deriveCollectorCapabilities({
    currentModelCatalogActionProjection: projection,
  });
  assert.equal(unavailable.dedicatedEffortControls, 'unavailable');
  assert.equal(unavailable.proEffort, 'unknown');
  assert.equal(
    getRegistryCapabilityDeferral(
      { requiredCapabilities: ['dedicatedEffortControls'] },
      unavailable,
    ),
    'Required capability is unavailable: dedicatedEffortControls.',
  );

  for (const incompleteProjection of [
    { ...projection, integratedEffort: false },
    { ...projection, integratedEffort: null },
    { ...projection, status: 'unknown' },
    { ...projection, schemaVersion: 1 },
  ]) {
    const capabilities = deriveCollectorCapabilities({
      currentModelCatalogActionProjection: incompleteProjection,
    });
    assert.equal(capabilities.dedicatedEffortControls, 'unknown');
    assert.equal(
      getRegistryCapabilityDeferral(
        { requiredCapabilities: ['dedicatedEffortControls'] },
        capabilities,
      ),
      '',
    );
  }
});

test('live probes preserve fresh manifest capabilities when a raw catalog is also supplied', async () => {
  const runFolderPath = await mkdtemp(path.join(os.tmpdir(), 'live-probe-capabilities-'));
  const manifestCapabilities = {
    ...unknownCapabilities(),
    configureRoute: 'available',
    dedicatedEffortControls: 'unavailable',
  };
  try {
    await writeFile(
      path.join(runFolderPath, 'run-manifest.json'),
      JSON.stringify({ capabilities: manifestCapabilities }),
      'utf8',
    );
    const capabilities = await resolveLiveProbeCapabilities(
      {
        freshModelCatalog: {
          frontendByConfig: {
            'configure-latest': [{ id: 'pro', available: true, sliderValue: 2 }],
          },
        },
      },
      runFolderPath,
    );
    assert.deepEqual(capabilities, manifestCapabilities);
  } finally {
    await rm(runFolderPath, { recursive: true, force: true });
  }
});

test('only explicit fresh unavailability defers a required registry state', () => {
  const proRegistryState = { requiredCapabilities: ['proEffort'] };
  assert.equal(getRegistryCapabilityDeferral(proRegistryState, unknownCapabilities()), '');
  assert.equal(
    getRegistryCapabilityDeferral(proRegistryState, {
      ...unknownCapabilities(),
      proEffort: 'unavailable',
    }),
    'Required capability is unavailable: proEffort.',
  );
});

test('Pro shortcut action projection requires Pro and dedicated effort capabilities and only unavailable is N/A', () => {
  for (const actionId of ['shortcutKeyProStandard', 'shortcutKeyProExtended']) {
    const action = shortcutInventory.shortcuts.find((row) => row.actionId === actionId);
    assert.deepEqual(action?.requiredCapabilities, ['proEffort', 'dedicatedEffortControls']);
    assert.equal(
      getUnavailableCapabilityStatus(action.requiredCapabilities, unknownCapabilities()),
      null,
    );
    assert.deepEqual(
      getUnavailableCapabilityStatus(action.requiredCapabilities, {
        ...unknownCapabilities(),
        proEffort: 'unavailable',
      }),
      {
        status: 'not-applicable',
        statusReason: 'Required capability is unavailable: proEffort.',
      },
    );
    assert.deepEqual(
      getUnavailableCapabilityStatus(action.requiredCapabilities, {
        ...unknownCapabilities(),
        dedicatedEffortControls: 'unavailable',
      }),
      {
        status: 'not-applicable',
        statusReason: 'Required capability is unavailable: dedicatedEffortControls.',
      },
    );
  }
});
