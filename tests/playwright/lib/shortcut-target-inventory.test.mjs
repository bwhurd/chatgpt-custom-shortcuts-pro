import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildFreshCurrentModelCatalogActionProjection,
  parseModelPickerLabelsSource,
} from './shortcut-target-inventory.mjs';

const modelLabels = parseModelPickerLabelsSource(
  await readFile(
    new URL('../../../extension/shared/model-picker-labels.js', import.meta.url),
    'utf8',
  ),
);

function makeCatalog(entries = null) {
  return {
    pillMenu: true,
    integratedEffort: true,
    configureOptions: [{ id: 'configure-latest', label: 'Latest', slot: 3 }],
    frontendByConfig: {
      'configure-latest': entries || [
        { id: 'instant', label: 'Light', slot: 0, available: true, sliderValue: 0 },
        { id: 'thinking', label: 'Medium', slot: 1, available: true, sliderValue: 1 },
        { id: 'pro', label: 'High', slot: 7, available: true, sliderValue: 2 },
      ],
    },
  };
}

function makeInput(overrides = {}) {
  return {
    catalog: makeCatalog(),
    profile: 'legacy',
    activeConfigId: 'configure-latest',
    modelLabels,
    freshCatalogVerified: true,
    catalogComplete: true,
    activeSimpleSlider: { verified: true, min: 0, max: 2, value: 1 },
    ...overrides,
  };
}

test('fresh current catalog projection preserves exact action ids, profile, slots, availability, and slider values', () => {
  const projection = buildFreshCurrentModelCatalogActionProjection(makeInput());

  assert.deepEqual(projection, {
    schemaVersion: 2,
    source: 'fresh-current-model-catalog-action-projection-v2',
    status: 'pass',
    profile: 'legacy',
    sliderRange: { min: 0, max: 2, value: 1 },
    actions: [
      { profile: 'legacy', slot: 0, actionId: 'instant', available: true, sliderValue: 0 },
      { profile: 'legacy', slot: 1, actionId: 'thinking', available: true, sliderValue: 1 },
      { profile: 'legacy', slot: 7, actionId: 'pro', available: true, sliderValue: 2 },
    ],
    integratedEffort: true,
    issueCodes: [],
  });
  assert.equal(JSON.stringify(projection).includes('Light'), false);
  assert.equal(JSON.stringify(projection).includes('label'), false);
});

test('integrated-effort projection is typed and unknown when missing or unverified', () => {
  const absent = makeCatalog();
  delete absent.integratedEffort;
  const missingFlag = buildFreshCurrentModelCatalogActionProjection(makeInput({ catalog: absent }));
  assert.equal(missingFlag.status, 'pass');
  assert.equal(missingFlag.integratedEffort, null);

  const invalid = buildFreshCurrentModelCatalogActionProjection(
    makeInput({ catalog: makeCatalog(), catalogComplete: false }),
  );
  assert.equal(invalid.status, 'fail');
  assert.equal(invalid.integratedEffort, null);
});

test('projection fails closed when freshness, completeness, or active slider evidence is missing', () => {
  const cases = [
    [{ freshCatalogVerified: false }, 'catalog-not-verified-fresh'],
    [{ catalogComplete: false }, 'catalog-not-verified-complete'],
    [
      { activeSimpleSlider: { verified: false, min: 0, max: 2, value: 1 } },
      'active-simple-slider-not-verified',
    ],
    [
      { activeSimpleSlider: { verified: true, min: 0, max: 2 } },
      'active-simple-slider-not-verified',
    ],
    [{ catalog: makeCatalog([]) }, 'missing-current-catalog-actions'],
  ];

  for (const [overrides, expectedIssue] of cases) {
    const projection = buildFreshCurrentModelCatalogActionProjection(makeInput(overrides));
    assert.equal(projection.status, 'fail');
    assert.deepEqual(projection.actions, []);
    assert.ok(projection.issueCodes.includes(expectedIssue));
  }
});

test('projection rejects catalog actions without an exact slot, availability, or in-range finite value', () => {
  const cases = [
    [
      [
        { id: 'instant', label: 'Light', available: true, sliderValue: 0 },
        { id: 'thinking', label: 'Medium', slot: 1, available: true, sliderValue: 1 },
      ],
      'invalid-current-catalog-action-slot',
    ],
    [
      [{ id: 'instant', label: 'Light', slot: 0, available: false, sliderValue: 0 }],
      'current-action-not-available',
    ],
    [
      [{ id: 'instant', label: 'Light', slot: 0, available: true, sliderValue: Number.NaN }],
      'invalid-current-action-slider-value',
    ],
    [
      [{ id: 'instant', label: 'Light', slot: 0, available: true, sliderValue: 3 }],
      'current-action-slider-value-out-of-range',
    ],
  ];

  for (const [entries, expectedIssue] of cases) {
    const projection = buildFreshCurrentModelCatalogActionProjection(
      makeInput({ catalog: makeCatalog(entries) }),
    );
    assert.equal(projection.status, 'fail');
    assert.deepEqual(projection.actions, []);
    assert.ok(projection.issueCodes.includes(expectedIssue));
  }
});

test('generic Pro slider action remains a catalog row without establishing Pro-only capability', () => {
  const projection = buildFreshCurrentModelCatalogActionProjection(makeInput());

  assert.equal(projection.status, 'pass');
  assert.deepEqual(
    projection.actions.find((action) => action.actionId === 'pro'),
    { profile: 'legacy', slot: 7, actionId: 'pro', available: true, sliderValue: 2 },
  );
  assert.equal(projection.integratedEffort, true);
  assert.equal(Object.hasOwn(projection, 'capabilities'), false);
});
