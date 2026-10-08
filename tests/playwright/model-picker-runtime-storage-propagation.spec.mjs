import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { extractFastRuntime } from './lib/shortcut-fast-cases.mjs';
import { installModelPickerFixture } from './lib/shortcut-model-controls-fixture.mjs';
import { runSlotCase } from './lib/shortcut-model-slots-fixture.mjs';

const latestCatalog = {
  version: 1,
  selectorShape: 'pill-three-submenu',
  pillMenu: true,
  pillSpeedMenu: true,
  pillResetAvailable: false,
  configureOptions: [
    { id: 'configure-latest', label: 'GPT-5.6 Sol', slot: 3 },
    { id: 'configure-dynamic-gpt-5-6-terra', label: 'GPT-5.6 Terra', slot: 8 },
    { id: 'configure-dynamic-gpt-5-6-luna', label: 'GPT-5.6 Luna', slot: 9 },
    { id: 'configure-dynamic-gpt-5-5', label: 'GPT-5.5', slot: 10 },
    { id: 'configure-dynamic-gpt-6-1-sol', label: 'GPT-6.1 Sol', slot: 15 },
    { id: 'configure-dynamic-gpt-6-astra', label: 'GPT-6 Astra', slot: 16 },
  ],
  frontendByConfig: {},
};

const legacyCatalog = {
  version: 1,
  selectorShape: 'integrated-two-level',
  configureOptions: [
    { id: 'configure-o3', label: 'o3', slot: 6 },
    { id: 'configure-latest', label: '5.6', slot: 3 },
  ],
  frontendByConfig: {},
};

const makeReportedLatestCodes = () => {
  const codes = Array(22).fill('');
  codes[3] = 'KeyH';
  codes[8] = 'KeyZ';
  codes[13] = 'Digit6';
  codes[15] = 'Digit5';
  codes[16] = 'Digit6';
  return codes;
};

const makeScrubbedLatestCodes = () => {
  const codes = Array(22).fill('');
  codes[3] = 'KeyH';
  codes[13] = 'Digit6';
  return codes;
};

const contentSource = await readFile(
  fileURLToPath(new URL('../../extension/content.js', import.meta.url)),
  'utf8',
);

const switchProfile = async (page, sequence) => {
  await page.evaluate((modes) => {
    modes.forEach((mode) => {
      window.dispatchEvent(new CustomEvent('csp-chat-work-mode-changed', { detail: { mode } }));
    });
  }, sequence);
};

test('scrubbed model keys stop dispatch while preserved Chat and Work owners stay active', async ({
  page,
}) => {
  const clearedWorkOwner = await runSlotCase(
    page.context(),
    contentSource,
    {
      actionId: 'latest-configure-dynamic-gpt-6-1-sol',
      actionIds: ['configure-dynamic-gpt-6-1-sol'],
      code: 'Digit5',
      catalog: latestCatalog,
      initialCodes: makeReportedLatestCodes(),
      modelActionId: 'configure-dynamic-gpt-6-1-sol',
      profile: 'latest',
      rowId: 'latest-configure-dynamic-gpt-6-1-sol',
      slot: 15,
    },
    undefined,
    {
      beforeDispatch: async (runtimePage) => {
        const scrubbed = makeScrubbedLatestCodes();
        await runtimePage.evaluate(
          (codes) =>
            new Promise((resolve) =>
              window.chrome.storage.sync.set({ modelPickerKeyCodesLatest: codes }, resolve),
            ),
          scrubbed,
        );
        await switchProfile(runtimePage, ['chat', 'work']);
      },
      expectInertAfterUpdate: true,
      expectedProfile: 'latest',
    },
  );
  expect(clearedWorkOwner.status, clearedWorkOwner.reason).toBe('pass');
  expect(clearedWorkOwner.effectStatus).toBe('inert-after-update');
  expect(clearedWorkOwner.observed.profileCode).toBe('');

  const preservedWorkOwner = await runSlotCase(
    page.context(),
    contentSource,
    {
      actionId: 'latest-toggle-speed',
      actionIds: ['toggle-speed'],
      code: 'Digit6',
      catalog: latestCatalog,
      initialCodes: makeScrubbedLatestCodes(),
      modelActionId: 'toggle-speed',
      profile: 'latest',
      rowId: 'latest-toggle-speed',
      slot: 13,
    },
    undefined,
    { beforeDispatch: (runtimePage) => switchProfile(runtimePage, ['chat', 'work']) },
  );
  expect(preservedWorkOwner.status).toBe('pass');
  expect(preservedWorkOwner.observed.effect.speed).toBe(true);

  const preservedChatOwner = await runSlotCase(
    page.context(),
    contentSource,
    {
      actionId: 'legacy-configure-latest',
      actionIds: ['configure-latest'],
      code: 'KeyH',
      catalog: legacyCatalog,
      initialCodes: Array(22).fill(''),
      modelActionId: 'configure-latest',
      profile: 'legacy',
      rowId: 'legacy-configure-latest',
      slot: 3,
    },
    undefined,
    { beforeDispatch: (runtimePage) => switchProfile(runtimePage, ['work', 'chat']) },
  );
  expect(preservedChatOwner.status).toBe('pass');
  expect(preservedChatOwner.observed.effect.selected).toBe('configure-latest');
});

test('overlay model hints omit scrubbed owners and retain assigned hints in both profiles', async ({
  page,
}) => {
  await page.setContent('<input id="composer">');
  const latestCodes = makeScrubbedLatestCodes();
  const legacyCodes = Array(22).fill('');
  legacyCodes[3] = 'KeyH';
  legacyCodes[6] = 'KeyT';
  await installModelPickerFixture(page, contentSource, {
    storage: {
      modelCatalogLatest: latestCatalog,
      modelCatalogLegacy: legacyCatalog,
      modelPickerKeyCodesLatest: latestCodes,
      modelPickerKeyCodesLegacy: legacyCodes,
      shortcutKeyShowOverlay: 'Period',
      shortcutKeyToggleChatWork: 'Digit5',
    },
  });
  const overlayRuntime = await extractFastRuntime(contentSource, 'shortcutKeyShowOverlay');
  await page.addScriptTag({ content: overlayRuntime.source });

  await page.keyboard.press('Alt+Period');
  const overlay = page.locator('#csp-shortcut-overlay');
  await overlay.waitFor({ state: 'visible' });

  await overlay.getByRole('tab', { name: 'Work Models' }).click();
  const workGrid = overlay.locator(
    '.overlay-model-picker-root[data-model-catalog-profile="latest"]',
  );
  const workModelRows = workGrid.locator('.mp-grid-group[data-group="configure"] .shortcut-item');
  await expect(workModelRows.filter({ hasText: 'GPT-5.6 Terra' })).toHaveCount(0);
  await expect(workModelRows.filter({ hasText: 'GPT-6.1 Sol' })).toHaveCount(0);
  await expect(workModelRows.filter({ hasText: 'GPT-6 Astra' })).toHaveCount(0);
  await expect(workModelRows.filter({ hasText: 'GPT-5.6 Sol' })).toHaveCount(1);
  expect(
    await workGrid
      .locator('.mp-grid-group[data-group="model-toggles"] .key-input')
      .evaluateAll((inputs) => inputs.map((input) => input.value)),
  ).toEqual(['5', '6']);

  await overlay.getByRole('tab', { name: 'Chat Models' }).click();
  const chatGrid = overlay.locator(
    '.overlay-model-picker-root[data-model-catalog-profile="legacy"]',
  );
  const chatModelRows = chatGrid.locator('.mp-grid-group[data-group="configure"] .shortcut-item');
  await expect(chatModelRows.filter({ hasText: 'o3' })).toHaveCount(1);
  await expect(chatModelRows.filter({ hasText: 'o3' }).locator('.key-input')).not.toHaveValue('');
});
