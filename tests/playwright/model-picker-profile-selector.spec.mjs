import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const extensionRoot = path.join(repoRoot, 'extension');

const latestCatalog = {
  version: 4,
  selectorShape: 'pill-three-submenu',
  pillMenu: true,
  pillSpeedMenu: true,
  pillResetAvailable: false,
  integratedEffort: true,
  configureOptions: [
    { id: 'configure-latest', label: 'GPT-5.6 Sol', slot: 3 },
    { id: 'configure-dynamic-gpt-5-6-terra', label: 'GPT-5.6 Terra', slot: 8 },
    { id: 'configure-dynamic-gpt-5-6-luna', label: 'GPT-5.6 Luna', slot: 9 },
    { id: 'configure-dynamic-gpt-5-5', label: 'GPT-5.5', slot: 10 },
  ],
  frontendByConfig: {
    'configure-latest': [
      { available: true, id: 'instant', label: 'Light', slot: 0 },
      { available: true, id: 'thinking', label: 'Medium', slot: 1 },
      { available: true, id: 'pro', label: 'High', slot: 7 },
      { available: true, id: 'effort-extra-high', label: 'Extra High', slot: 11 },
      { available: true, id: 'effort-max', label: 'Max', slot: 12 },
    ],
  },
};

const legacyCatalog = {
  version: 3,
  selectorShape: 'integrated-two-level',
  integratedEffort: true,
  configureOptions: [
    { id: 'configure-latest', label: '5.5', slot: 3 },
    { id: 'configure-dynamic-5-4', label: '5.4', slot: 8 },
    { id: 'configure-dynamic-5-3', label: '5.3', slot: 9 },
    { id: 'configure-o3', label: 'o3', slot: 6 },
  ],
  frontendByConfig: {
    'configure-latest': [
      { available: true, id: 'instant', label: 'Instant', slot: 0 },
      { available: true, id: 'thinking', label: 'Medium', slot: 1 },
      { available: true, id: 'pro', label: 'High', slot: 7 },
    ],
  },
};

test('Chat and Work profiles keep matching defaults but persist edits independently', async () => {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'cgcsp-profiles-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`],
  });

  try {
    const serviceWorker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent('serviceworker', { timeout: 15000 }));
    const extensionId = new URL(serviceWorker.url()).host;
    const latestCodes = [
      'F1',
      'F2',
      '',
      'Digit1',
      '',
      'KeyH',
      '',
      'F3',
      'Digit2',
      'Digit3',
      'KeyL',
      'F4',
      'F5',
      'Digit6',
      'Digit0',
    ];
    const legacyCodes = [
      'F1',
      'F2',
      '',
      'Digit1',
      '',
      '',
      'KeyO',
      'F3',
      'Digit2',
      'Digit3',
      '',
      '',
      '',
      '',
      '',
    ];
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(() => document.querySelectorAll('#model-picker-grid .mp-input').length > 0);
    await page.waitForTimeout(500);
    await page.evaluate(
      async ({ latest, legacy, workCodes, chatCodes }) => {
        const latestNames = new Array(15).fill('');
        latestNames.splice(3, 1, 'GPT-5.6 Sol');
        latestNames.splice(8, 3, 'GPT-5.6 Terra', 'GPT-5.6 Luna', 'GPT-5.5');
        const legacyNames = new Array(15).fill('');
        legacyNames.splice(3, 1, '5.5');
        legacyNames.splice(6, 1, 'o3');
        legacyNames.splice(8, 2, '5.4', '5.3');
        await chrome.storage.sync.set({
          modelCatalogLatest: latest,
          modelNamesLatest: latestNames,
          modelCatalogLegacy: legacy,
          modelNamesLegacy: legacyNames,
          modelPickerKeyCodesLatest: workCodes,
          modelPickerKeyCodesLegacy: chatCodes,
          modelPickerKeyCodeProfilesVersion: 1,
        });
        window.__setModelPickerCodesCache?.('latest', workCodes);
        window.__setModelPickerCodesCache?.('legacy', chatCodes);
        document.dispatchEvent(new CustomEvent('modelPickerHydrated'));
      },
      {
        latest: latestCatalog,
        legacy: legacyCatalog,
        workCodes: latestCodes,
        chatCodes: legacyCodes,
      },
    );

    const profileButton = (profile) =>
      page.locator(`[data-model-catalog-profile="${profile}"]`);
    await expect(page.locator('#mp-model-catalog-profile-selector button')).toHaveText([
      'Chat Models',
      'Work Models',
    ]);
    const configureInputs = () =>
      page.locator('#model-picker-grid .mp-grid-group[data-group="configure"] .mp-input');
    const modelToggleGroup = () =>
      page.locator('#model-picker-grid .mp-grid-group[data-group="model-toggles"]');
    const modelToggleInputs = () => modelToggleGroup().locator('.mp-input');
    const chatWorkToggleInput = () =>
      modelToggleGroup().locator('#shortcutKeyToggleChatWork');
    const modelGroupIds = () =>
      page
        .locator('#model-picker-grid > .mp-grid-group')
        .evaluateAll((groups) => groups.map((group) => group.getAttribute('data-group')));
    const modifierControl = page.locator('#mp-model-switcher-modifier-selector');

    await modifierControl
      .locator('a[data-target="useControlForModelSwitcherRadio"]')
      .click();
    await expect(page.locator('#useControlForModelSwitcherRadio')).toBeChecked();
    await expect
      .poll(() =>
        serviceWorker.evaluate(async () => {
          const stored = await chrome.storage.sync.get([
            'useAltForModelSwitcherRadio',
            'useControlForModelSwitcherRadio',
          ]);
          return [stored.useAltForModelSwitcherRadio, stored.useControlForModelSwitcherRadio];
        }),
      )
      .toEqual([false, true]);

    await expect
      .poll(() =>
        modifierControl.locator('a.active').evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .toBe('rgb(0, 63, 122)');

    const segmentedControlLayout = await page.evaluate(() => {
      const profileSelector = document.querySelector('#mp-model-catalog-profile-selector');
      const profileButton = profileSelector?.querySelector('button');
      const modifierSelector = document.querySelector('#mp-model-switcher-modifier-selector');
      const modifierButton = modifierSelector?.querySelector('a.active');
      const modelGrid = document.querySelector('#model-picker-grid');
      if (!profileSelector || !profileButton || !modifierSelector || !modifierButton || !modelGrid) {
        return null;
      }

      const profileRect = profileSelector.getBoundingClientRect();
      const modifierRect = modifierSelector.getBoundingClientRect();
      const gridRect = modelGrid.getBoundingClientRect();
      const profileStyle = getComputedStyle(profileButton);
      const modifierStyle = getComputedStyle(modifierButton);
      return {
        profileLeft: profileRect.left,
        gridLeft: gridRect.left,
        profileBottom: profileRect.bottom,
        modifierBottom: modifierRect.bottom,
        profileBorderColor: getComputedStyle(profileSelector).borderColor,
        modifierBorderColor: getComputedStyle(modifierSelector).borderColor,
        profileActiveBackground: profileStyle.backgroundColor,
        modifierActiveBackground: modifierStyle.backgroundColor,
        profileFontFamily: profileStyle.fontFamily,
        modifierFontFamily: modifierStyle.fontFamily,
        profileFontSize: profileStyle.fontSize,
        modifierFontSize: modifierStyle.fontSize,
        profileFontStyle: profileStyle.fontStyle,
        modifierFontStyle: modifierStyle.fontStyle,
        profileFontWeight: profileStyle.fontWeight,
        modifierFontWeight: modifierStyle.fontWeight,
      };
    });

    expect(segmentedControlLayout).not.toBeNull();
    expect(Math.abs(segmentedControlLayout.profileLeft - segmentedControlLayout.gridLeft)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(segmentedControlLayout.profileBottom - segmentedControlLayout.modifierBottom)).toBeLessThanOrEqual(1);
    expect(segmentedControlLayout.profileBorderColor).toBe('rgb(0, 63, 122)');
    expect(segmentedControlLayout.modifierBorderColor).toBe('rgb(0, 63, 122)');
    expect(segmentedControlLayout.profileActiveBackground).toBe('rgb(0, 63, 122)');
    expect(segmentedControlLayout.modifierActiveBackground).toBe('rgb(0, 63, 122)');
    expect(segmentedControlLayout.profileFontFamily).toBe(segmentedControlLayout.modifierFontFamily);
    expect(segmentedControlLayout.profileFontSize).toBe(segmentedControlLayout.modifierFontSize);
    expect(segmentedControlLayout.profileFontStyle).toBe(segmentedControlLayout.modifierFontStyle);
    expect(segmentedControlLayout.profileFontWeight).toBe(segmentedControlLayout.modifierFontWeight);

    await expect(profileButton('legacy')).toHaveAttribute('aria-selected', 'true');
    await expect(configureInputs()).toHaveCount(4);
    await expect(modelToggleGroup()).toHaveCount(1);
    await expect(modelToggleGroup().locator('.mp-label')).toHaveText(['Toggle Chat / Work']);
    await expect(chatWorkToggleInput()).toHaveCount(1);
    await expect.poll(modelGroupIds).toEqual(['primary', 'configure', 'model-toggles']);
    await expect(configureInputs().nth(3)).toHaveValue('o');
    await chatWorkToggleInput().press('g');
    await expect(chatWorkToggleInput()).toHaveValue('g');
    await expect
      .poll(() =>
        serviceWorker.evaluate(
          async () =>
            (await chrome.storage.sync.get('shortcutKeyToggleChatWork'))
              .shortcutKeyToggleChatWork,
        ),
      )
      .toBe('KeyG');

    await profileButton('latest').click();
    await expect(profileButton('latest')).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(() =>
        serviceWorker.evaluate(
          async () =>
            (await chrome.storage.sync.get('modelCatalogSelectedProfile'))
              .modelCatalogSelectedProfile,
        ),
      )
      .toBe('latest');

    const reopenedPopup = await context.newPage();
    await reopenedPopup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      reopenedPopup.locator('[data-model-catalog-profile="latest"]'),
    ).toHaveAttribute('aria-selected', 'true');
    await reopenedPopup.close();

    await expect(configureInputs()).toHaveCount(4);
    await expect(modelToggleGroup().locator('.mp-subsection-label')).toHaveText('Model Toggles');
    await expect(modelToggleInputs()).toHaveCount(1);
    await expect(modelToggleGroup().locator('.mp-label')).toHaveText([
      'Toggle Chat / Work',
      'Toggle Speed',
    ]);
    await expect(chatWorkToggleInput()).toHaveValue('g');
    await expect
      .poll(() =>
        modelToggleGroup()
          .locator('.mp-subsection-label')
          .evaluate((element) => getComputedStyle(element).marginTop),
      )
      .toBe('18px');
    await expect.poll(modelGroupIds).toEqual(['primary', 'configure', 'model-toggles']);
    await expect(configureInputs().nth(3)).toHaveValue('l');
    await expect
      .poll(() =>
        serviceWorker.evaluate(
          async () =>
            (await chrome.storage.sync.get('modelPickerKeyCodesLegacy'))
              .modelPickerKeyCodesLegacy[6],
        ),
      )
      .toBe('KeyO');

    await configureInputs().nth(3).press('k');
    await profileButton('legacy').click();
    await expect
      .poll(() =>
        serviceWorker.evaluate(
          async () =>
            (await chrome.storage.sync.get('modelCatalogSelectedProfile'))
              .modelCatalogSelectedProfile,
        ),
      )
      .toBe('legacy');
    await expect(modelToggleGroup().locator('.mp-label')).toHaveText(['Toggle Chat / Work']);
    await expect(chatWorkToggleInput()).toHaveValue('g');
    await expect(configureInputs().nth(3)).toHaveValue('o');
    await configureInputs().nth(3).press('m');
    await profileButton('latest').click();
    await expect(configureInputs().nth(3)).toHaveValue('k');
    await expect
      .poll(() =>
        serviceWorker.evaluate(async () => {
          const stored = await chrome.storage.sync.get([
            'modelPickerKeyCodesLatest',
            'modelPickerKeyCodesLegacy',
          ]);
          return [
            stored.modelPickerKeyCodesLatest[10],
            stored.modelPickerKeyCodesLegacy[6],
          ];
        }),
      )
      .toEqual(['KeyK', 'KeyM']);

    // Shared raw slots are still independent. Clearing or editing Work slot 8
    // must not touch Chat slot 8, and the same code may then exist once in each
    // mutually exclusive profile without a duplicate prompt.
    await configureInputs().nth(1).press('h');
    await expect(page.locator('#dup-yes')).toBeVisible();
    await page.locator('#dup-yes').click();
    await expect
      .poll(() =>
        serviceWorker.evaluate(async () => {
          const work = (await chrome.storage.sync.get('modelPickerKeyCodesLatest'))
            .modelPickerKeyCodesLatest;
          return [work[5], work[8]];
        }),
      )
      .toEqual(['', 'KeyH']);
    await configureInputs().nth(1).press('w');
    await configureInputs().nth(1).press('Delete');
    await profileButton('legacy').click();
    await expect(configureInputs().nth(1)).toHaveValue('2');
    await configureInputs().nth(1).press('c');
    await profileButton('latest').click();
    await expect(configureInputs().nth(1)).toHaveValue('');
    await configureInputs().nth(1).press('c');
    await expect(page.locator('#dup-overlay')).toBeHidden();
    await expect
      .poll(() =>
        serviceWorker.evaluate(async () => {
          const stored = await chrome.storage.sync.get([
            'modelPickerKeyCodesLatest',
            'modelPickerKeyCodesLegacy',
          ]);
          return [
            stored.modelPickerKeyCodesLatest[8],
            stored.modelPickerKeyCodesLegacy[8],
          ];
        }),
      )
      .toEqual(['KeyC', 'KeyC']);

    await page.waitForTimeout(350);
    await configureInputs().nth(3).press('3');
    await expect(page.locator('#dup-yes')).toBeVisible();
    await page.locator('#dup-yes').click();
    await expect
      .poll(() => configureInputs().evaluateAll((inputs) => inputs.map((input) => input.value)))
      .toEqual(['1', 'c', '', '3']);
    await expect
      .poll(() =>
        serviceWorker.evaluate(async () => {
          const stored = await chrome.storage.sync.get([
            'modelPickerKeyCodesLatest',
            'modelPickerKeyCodesLegacy',
          ]);
          return {
            work: [
              stored.modelPickerKeyCodesLatest[8],
              stored.modelPickerKeyCodesLatest[9],
              stored.modelPickerKeyCodesLatest[10],
            ],
            chat: [
              stored.modelPickerKeyCodesLegacy[8],
              stored.modelPickerKeyCodesLegacy[9],
              stored.modelPickerKeyCodesLegacy[6],
            ],
          };
        }),
      )
      .toEqual({
        work: ['KeyC', '', 'Digit3'],
        chat: ['KeyC', 'Digit3', 'KeyM'],
      });

    const finalStoredProfiles = await serviceWorker.evaluate(async () => {
      const stored = await chrome.storage.sync.get([
        'modelPickerKeyCodesLatest',
        'modelPickerKeyCodesLegacy',
      ]);
      return {
        work: stored.modelPickerKeyCodesLatest,
        chat: stored.modelPickerKeyCodesLegacy,
      };
    });
    expect(finalStoredProfiles.work).toEqual([
      'F1',
      'F2',
      '',
      'Digit1',
      '',
      '',
      '',
      'F3',
      'KeyC',
      '',
      'Digit3',
      'F4',
      'F5',
      'Digit6',
      'Digit0',
    ]);
    expect(finalStoredProfiles.chat).toEqual([
      'F1',
      'F2',
      '',
      'Digit1',
      '',
      '',
      'KeyM',
      'F3',
      'KeyC',
      'Digit3',
      '',
      '',
      '',
      '',
      '',
    ]);

    const finalReopen = await context.newPage();
    await finalReopen.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
    });
    const finalInputs = finalReopen.locator(
      '#model-picker-grid .mp-grid-group[data-group="configure"] .mp-input',
    );
    await expect(finalInputs).toHaveCount(4);
    await expect
      .poll(() => finalInputs.evaluateAll((inputs) => inputs.map((input) => input.value)))
      .toEqual(['1', 'c', '', '3']);
    await finalReopen.locator('[data-model-catalog-profile="legacy"]').click();
    await expect
      .poll(() => finalInputs.evaluateAll((inputs) => inputs.map((input) => input.value)))
      .toEqual(['1', 'c', '3', 'm']);
    await finalReopen.close();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('legacy shared shortcuts migrate once into unique independent profile arrays', async () => {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'cgcsp-dedupe-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`],
  });

  try {
    const serviceWorker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent('serviceworker', { timeout: 15000 }));
    const extensionId = new URL(serviceWorker.url()).host;
    const latestNames = new Array(15).fill('');
    latestNames.splice(3, 1, 'GPT-5.6 Sol');
    latestNames.splice(8, 3, 'GPT-5.6 Terra', 'GPT-5.6 Luna', 'GPT-5.5');
    const legacyNames = new Array(15).fill('');
    legacyNames.splice(3, 1, '5.5');
    legacyNames.splice(6, 1, 'o3');
    legacyNames.splice(8, 2, '5.4', '5.3');
    const duplicateCodes = [
      'F1',
      'F2',
      '',
      'Digit1',
      '',
      '',
      'Digit4',
      'F3',
      'Digit3',
      'Digit3',
      'Digit2',
      'F4',
      'F5',
      'Digit6',
      'Digit0',
    ];
    await serviceWorker.evaluate(
      async ({ latest, legacy, latestModelNames, legacyModelNames, codes }) => {
        await chrome.storage.sync.set({
          modelCatalogLatest: latest,
          modelNamesLatest: latestModelNames,
          modelCatalogLegacy: legacy,
          modelNamesLegacy: legacyModelNames,
          modelPickerKeyCodes: codes,
          modelPickerKeyCodeProfilesVersion: 0,
          shortcutKeyToggleChatWork: 'Digit9',
          modelCatalogSelectedProfile: 'latest',
        });
      },
      {
        latest: latestCatalog,
        legacy: legacyCatalog,
        latestModelNames: latestNames,
        legacyModelNames: legacyNames,
        codes: duplicateCodes,
      },
    );

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
    });
    const configureInputs = page.locator(
      '#model-picker-grid .mp-grid-group[data-group="configure"] .mp-input',
    );
    await expect(configureInputs).toHaveCount(4);
    await expect
      .poll(() => configureInputs.evaluateAll((inputs) => inputs.map((input) => input.value)))
      .toEqual(['1', '3', '', '2']);
    await expect
      .poll(() =>
        serviceWorker.evaluate(async () => {
          const stored = await chrome.storage.sync.get([
            'modelPickerKeyCodesLatest',
            'modelPickerKeyCodesLegacy',
            'modelPickerKeyCodeProfilesVersion',
            'shortcutKeyToggleChatWork',
          ]);
          return {
            workCodes: [
              stored.modelPickerKeyCodesLatest[3],
              stored.modelPickerKeyCodesLatest[8],
              stored.modelPickerKeyCodesLatest[9],
              stored.modelPickerKeyCodesLatest[10],
            ],
            chatCodes: [
              stored.modelPickerKeyCodesLegacy[3],
              stored.modelPickerKeyCodesLegacy[8],
              stored.modelPickerKeyCodesLegacy[9],
              stored.modelPickerKeyCodesLegacy[6],
            ],
            version: stored.modelPickerKeyCodeProfilesVersion,
            chatWork: stored.shortcutKeyToggleChatWork,
          };
        }),
      )
      .toEqual({
        workCodes: ['Digit1', 'Digit3', '', 'Digit2'],
        chatCodes: ['Digit1', 'Digit3', '', 'Digit4'],
        version: 1,
        chatWork: 'Digit9',
      });

    await page.close();
    await serviceWorker.evaluate(async () => {
      const replacement = new Array(15).fill('');
      replacement[3] = 'KeyZ';
      await chrome.storage.sync.set({ modelPickerKeyCodes: replacement });
    });
    const reopened = await context.newPage();
    await reopened.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
    });
    const reopenedInputs = reopened.locator(
      '#model-picker-grid .mp-grid-group[data-group="configure"] .mp-input',
    );
    await expect
      .poll(() => reopenedInputs.evaluateAll((inputs) => inputs.map((input) => input.value)))
      .toEqual(['1', '3', '', '2']);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('shortcut overlay profile selector mirrors popup styling and grid alignment', async ({
  page,
}) => {
  const contentSource = await readFile(path.join(extensionRoot, 'content.js'), 'utf8');
  const overlayCss = contentSource.match(
    /const OVERLAY_MODEL_GRID_CSS = `([\s\S]*?)`;\s*\/\/ @note Shortcuts Overlay/,
  )?.[1];
  expect(overlayCss).toBeTruthy();

  await page.setViewportSize({ width: 800, height: 220 });
  await page.setContent(`
    <style>
      :root {
        --popup-font-stack: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        --bg-secondary: #f8f7f5;
        --border-light: #dfdfdc;
        --text-primary: #1e1e1e;
      }
      * { box-sizing: border-box; }
      body { margin: 0; }
      ${overlayCss}
    </style>
    <div class="overlay-model-picker-root">
      <div class="section-header overlay-model-catalog-heading">
        <span>Effort</span>
        <div class="p-segmented-controls p-segmented-radius mp-model-catalog-profile-selector">
          <button type="button" class="active">Chat Models</button>
          <button type="button">Work Models</button>
        </div>
      </div>
      <div class="model-picker-shortcut-grid">
        <div class="shortcut-item"><span class="shortcut-label">Light</span></div>
      </div>
    </div>
  `);

  const layout = await page.evaluate(() => {
    const selector = document.querySelector('.mp-model-catalog-profile-selector');
    const active = selector.querySelector('button.active');
    const inactive = selector.querySelector('button:not(.active)');
    const grid = document.querySelector('.model-picker-shortcut-grid');
    const selectorRect = selector.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const selectorStyle = getComputedStyle(selector);
    const activeStyle = getComputedStyle(active);
    const inactiveStyle = getComputedStyle(inactive);
    return {
      selectorLeft: selectorRect.left,
      gridLeft: gridRect.left,
      height: selectorRect.height,
      borderColor: selectorStyle.borderColor,
      borderRadius: selectorStyle.borderRadius,
      activeBackground: activeStyle.backgroundColor,
      activeColor: activeStyle.color,
      inactiveColor: inactiveStyle.color,
      fontFamily: activeStyle.fontFamily,
      fontSize: activeStyle.fontSize,
      paddingLeft: activeStyle.paddingLeft,
    };
  });

  expect(Math.abs(layout.selectorLeft - layout.gridLeft)).toBeLessThanOrEqual(0.5);
  expect(layout.height).toBe(22);
  expect(layout.borderColor).toBe('rgb(0, 63, 122)');
  expect(layout.borderRadius).toBe('30px');
  expect(layout.activeBackground).toBe('rgb(0, 63, 122)');
  expect(layout.activeColor).toBe('rgb(255, 255, 255)');
  expect(layout.inactiveColor).toBe('rgb(79, 78, 78)');
  expect(layout.fontFamily).toContain('system-ui');
  expect(layout.fontSize).toBe('14px');
  expect(layout.paddingLeft).toBe('11px');

  await page.screenshot({ path: path.join(os.tmpdir(), 'cgcsp-overlay-segmented-control.png') });
});
