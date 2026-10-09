import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { chromium } from 'playwright';

import {
  collectFreshCurrentModelCatalogActionProjection,
  refreshModelCatalogForValidation,
} from './devscrape-wide-core.mjs';

function makeCatalog({ surfaceMode = 'chat', scrapedAt = 150, integratedEffort = true } = {}) {
  return {
    version: 5,
    surfaceMode,
    scrapedAt,
    integratedEffort,
    configureOptions: [{ id: 'configure-latest', label: 'Private catalog title', slot: 3 }],
    frontendByConfig: {
      'configure-latest': [
        { id: 'instant', label: 'Light', slot: 0, available: true, sliderValue: 0 },
        { id: 'thinking', label: 'Medium', slot: 1, available: true, sliderValue: 1 },
        { id: 'pro', label: 'High', slot: 7, available: true, sliderValue: 2 },
      ],
    },
  };
}

test('fresh-page refresh installs selectors before recording native mode proof', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(makePickerMarkup());
    assert.equal(await page.evaluate(() => !!window.CSPModelPickerSelectors), false);
    let onContext;
    const context = {
      newCDPSession: async () => ({
        on: (_event, callback) => {
          onContext = callback;
        },
        send: async (method) => {
          if (method === 'Runtime.enable') {
            onContext({
              context: {
                id: 1,
                name: 'ChatGPT Custom Shortcuts Pro',
                origin: 'chrome-extension://fixture',
              },
            });
            return {};
          }
          return {
            result: {
              value: makeRefreshResult({ modelCatalog: makeCatalog({ scrapedAt: Date.now() }) }),
            },
          };
        },
        detach: async () => {},
      }),
    };
    const result = await refreshModelCatalogForValidation(page, context);
    assert.equal(result.collectorRuntimeModeProof.status, 'pass');
    assert.equal(result.collectorRuntimeModeProof.mode, 'chat');
    assert.equal(result.collectorRuntimeModeProof.modeSource, 'composer-model-trigger');
    const projection = await collectFreshCurrentModelCatalogActionProjection(page, result);
    assert.equal(projection.status, 'pass');
    assert.equal(projection.integratedEffort, true);
    assert.deepEqual(projection.issueCodes, []);
  } finally {
    await browser.close();
  }
});

function makeRefreshResult({
  mode = 'chat',
  surfaceMode = mode,
  ok = true,
  activeModelConfigId = 'configure-latest',
  modelCatalog = makeCatalog({ surfaceMode }),
} = {}) {
  return {
    ok,
    modelCatalog,
    activeModelConfigId,
    collectorRuntimeModeProof: {
      schemaVersion: 1,
      source: 'fresh-model-catalog-refresh-v1',
      status: 'pass',
      mode,
      modeSource: 'native-surface-radios',
      startedAtMs: 100,
      completedAtMs: 200,
    },
  };
}

function makePage({
  mode = 'chat',
  slider = { verified: true, min: 0, max: 2, value: 1 },
  modeSource = 'native-surface-radios',
} = {}) {
  return {
    evaluate: async () => ({
      mode: { status: 'pass', mode, source: modeSource },
      activeSimpleSlider: slider,
    }),
  };
}

function makePickerMarkup({
  menuState = 'open',
  inactive = false,
  duplicateMenus = 0,
  duplicateViews = 0,
  duplicateTriggers = 0,
  mode = 'chat',
} = {}) {
  const trigger = `
    <button data-testid="model-switcher-dropdown-button" id="model-picker-trigger" aria-haspopup="menu" aria-expanded="true">
      ${mode === 'work' ? '<span data-animated-slider-trigger="true"></span>' : ''}
      <span>Model</span>
    </button>`;
  const menu = `
    <div role="menu" data-radix-menu-content="" data-state="${menuState}" aria-labelledby="model-picker-trigger" ${inactive ? 'data-active="false"' : ''} style="width: 320px; min-height: 160px">
      ${Array.from(
        { length: duplicateViews + 1 },
        () => `
        <div data-model-picker-view="simple" style="width: 300px; height: 120px">
          <div data-reasoning-slider="true" style="width: 200px; height: 40px">
            <div role="slider" aria-valuemin="0" aria-valuemax="2" aria-valuenow="1" style="width: 160px; height: 24px"></div>
          </div>
        </div>`,
      ).join('')}
    </div>`;
  return `
    <main style="padding: 20px">
      ${trigger.repeat(duplicateTriggers + 1)}
      ${menu.repeat(duplicateMenus + 1)}
    </main>`;
}

async function installPickerMarkup(page, markup) {
  await page.setContent(markup);
  const selectors = await readFile(
    new URL('../../../extension/shared/model-picker-selectors.js', import.meta.url),
    'utf8',
  );
  await page.addScriptTag({ content: selectors });
}

test('collector projects a fresh Chat catalog with structural slider evidence and code-only output', async () => {
  const projection = await collectFreshCurrentModelCatalogActionProjection(
    makePage(),
    makeRefreshResult(),
  );

  assert.deepEqual(projection, {
    schemaVersion: 2,
    source: 'fresh-current-model-catalog-action-projection-v2',
    status: 'pass',
    profile: 'legacy',
    activeConfigId: 'configure-latest',
    sliderRange: { min: 0, max: 2, value: 1 },
    integratedEffort: true,
    actions: [
      { profile: 'legacy', slot: 0, actionId: 'instant', available: true, sliderValue: 0 },
      { profile: 'legacy', slot: 1, actionId: 'thinking', available: true, sliderValue: 1 },
      { profile: 'legacy', slot: 7, actionId: 'pro', available: true, sliderValue: 2 },
    ],
    issueCodes: [],
  });
  const serialized = JSON.stringify(projection);
  assert.equal(serialized.includes('Private catalog title'), false);
  assert.equal(serialized.includes('Light'), false);
  assert.equal(serialized.includes('capabilit'), false);
  assert.equal(serialized.includes('pro-standard'), false);
  assert.equal(serialized.includes('pro-extended'), false);
  assert.equal(serialized.includes('shortcutKeyProStandard'), false);
  assert.equal(serialized.includes('shortcutKeyProExtended'), false);
});

test('collector leaves integrated-effort capability unknown when its typed catalog flag is missing', async () => {
  const catalog = makeCatalog();
  delete catalog.integratedEffort;
  const projection = await collectFreshCurrentModelCatalogActionProjection(
    makePage(),
    makeRefreshResult({ modelCatalog: catalog }),
  );

  assert.equal(projection.status, 'pass');
  assert.equal(projection.integratedEffort, null);
});

test('collector maps a verified Work refresh to the latest profile', async () => {
  const catalog = makeCatalog({ surfaceMode: 'work' });
  const refreshResult = {
    ok: true,
    initialMode: 'work',
    profiles: {
      work: {
        ok: true,
        modelCatalog: catalog,
        activeModelConfigId: 'configure-latest',
      },
    },
    collectorRuntimeModeProof: {
      schemaVersion: 1,
      source: 'fresh-model-catalog-refresh-v1',
      status: 'pass',
      mode: 'work',
      modeSource: 'composer-model-trigger',
      startedAtMs: 100,
      completedAtMs: 200,
    },
  };
  const projection = await collectFreshCurrentModelCatalogActionProjection(
    makePage({ mode: 'work', modeSource: 'composer-model-trigger' }),
    refreshResult,
  );

  assert.equal(projection.status, 'pass');
  assert.equal(projection.profile, 'latest');
  assert.equal(projection.activeConfigId, 'configure-latest');
  assert.equal(projection.integratedEffort, true);
  assert.deepEqual(
    projection.actions.map(({ actionId, slot, sliderValue }) => ({
      actionId,
      slot,
      sliderValue,
    })),
    [
      { actionId: 'instant', slot: 0, sliderValue: 0 },
      { actionId: 'thinking', slot: 1, sliderValue: 1 },
      { actionId: 'pro', slot: 7, sliderValue: 2 },
    ],
  );
});

test('collector reads an open active Simple menu from a real headless DOM and fails closed on ambiguity', async (t) => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await installPickerMarkup(page, makePickerMarkup());
    const projection = await collectFreshCurrentModelCatalogActionProjection(
      page,
      makeRefreshResult(),
    );
    assert.equal(projection.status, 'pass');
    assert.equal(projection.profile, 'legacy');
    assert.deepEqual(
      projection.actions.map(({ profile, slot, actionId }) => ({ profile, slot, actionId })),
      [
        { profile: 'legacy', slot: 0, actionId: 'instant' },
        { profile: 'legacy', slot: 1, actionId: 'thinking' },
        { profile: 'legacy', slot: 7, actionId: 'pro' },
      ],
    );

    await installPickerMarkup(page, makePickerMarkup({ mode: 'work' }));
    const workProjection = await collectFreshCurrentModelCatalogActionProjection(
      page,
      makeRefreshResult({ mode: 'work', surfaceMode: 'work' }),
    );
    assert.equal(workProjection.status, 'pass');
    assert.equal(workProjection.profile, 'latest');

    const cases = [
      {
        name: 'closed model menu',
        markup: makePickerMarkup({ menuState: 'closed' }),
        issueCode: 'model-menu-not-unique',
      },
      {
        name: 'inactive Simple menu',
        markup: makePickerMarkup({ inactive: true }),
        issueCode: 'active-simple-view-not-unique',
      },
      {
        name: 'duplicate open model menus',
        markup: makePickerMarkup({ duplicateMenus: 1 }),
        issueCode: 'model-menu-not-unique',
      },
      {
        name: 'duplicate active Simple views',
        markup: makePickerMarkup({ duplicateViews: 1 }),
        issueCode: 'active-simple-view-not-unique',
      },
      {
        name: 'duplicate model triggers',
        markup: makePickerMarkup({ duplicateTriggers: 1 }),
        issueCode: 'model-trigger-not-unique',
      },
      {
        name: 'fresh refresh profile does not match the live trigger profile',
        markup: makePickerMarkup(),
        refreshResult: makeRefreshResult({ mode: 'work', surfaceMode: 'work' }),
        issueCode: 'refresh-mode-proof-missing-or-mismatched',
      },
    ];

    for (const entry of cases) {
      await t.test(entry.name, async () => {
        await installPickerMarkup(page, entry.markup);
        const failedProjection = await collectFreshCurrentModelCatalogActionProjection(
          page,
          entry.refreshResult || makeRefreshResult(),
        );
        assert.equal(failedProjection.status, 'unknown');
        assert.deepEqual(failedProjection.actions, []);
        assert.ok(failedProjection.issueCodes.includes(entry.issueCode));
      });
    }
  } finally {
    await browser.close();
  }
});

test('collector returns unknown when refresh, mode, config-row, or slider evidence is incomplete', async (t) => {
  const cases = [
    {
      name: 'failed refresh',
      page: makePage(),
      refreshResult: makeRefreshResult({ ok: false }),
      issueCode: 'model-catalog-refresh-incomplete',
    },
    {
      name: 'mode changed after refresh',
      page: makePage({ mode: 'work' }),
      refreshResult: makeRefreshResult(),
      issueCode: 'refresh-mode-proof-missing-or-mismatched',
    },
    {
      name: 'selected config is not a catalog row',
      page: makePage(),
      refreshResult: makeRefreshResult({ activeModelConfigId: 'uncatalogued-config' }),
      issueCode: 'active-config-not-selected-catalog-row',
    },
    {
      name: 'active slider is ambiguous',
      page: makePage({
        slider: { verified: false, issueCode: 'active-simple-slider-not-unique' },
      }),
      refreshResult: makeRefreshResult(),
      issueCode: 'active-simple-slider-not-unique',
    },
    {
      name: 'catalog timestamp predates the refresh',
      page: makePage(),
      refreshResult: makeRefreshResult({
        modelCatalog: makeCatalog({ scrapedAt: 50 }),
      }),
      issueCode: 'catalog-not-scraped-during-refresh-invocation',
    },
    {
      name: 'catalog timestamp follows the refresh',
      page: makePage(),
      refreshResult: makeRefreshResult({
        modelCatalog: makeCatalog({ scrapedAt: 201 }),
      }),
      issueCode: 'catalog-not-scraped-during-refresh-invocation',
    },
    {
      name: 'catalog surface belongs to another profile',
      page: makePage(),
      refreshResult: makeRefreshResult({ surfaceMode: 'work' }),
      issueCode: 'catalog-surface-mode-mismatch',
    },
    {
      name: 'dual profile result does not match active mode',
      page: makePage(),
      refreshResult: {
        ...makeRefreshResult(),
        initialMode: 'work',
        profiles: { chat: makeRefreshResult() },
      },
      issueCode: 'model-catalog-refresh-incomplete',
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const projection = await collectFreshCurrentModelCatalogActionProjection(
        entry.page,
        entry.refreshResult,
      );
      assert.equal(projection.status, 'unknown');
      assert.deepEqual(projection.actions, []);
      assert.ok(projection.issueCodes.includes(entry.issueCode));
    });
  }
});
