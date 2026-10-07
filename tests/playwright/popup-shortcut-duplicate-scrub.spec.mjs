import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const extensionRoot = path.join(repoRoot, 'extension');

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
    { id: 'configure-latest', label: '5.6', slot: 3 },
    { id: 'configure-dynamic-5-5', label: '5.5', slot: 8 },
  ],
  frontendByConfig: {},
};

const makeCodes = () => Array(22).fill('');

async function launchExtensionProfile() {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'cgcsp-shortcut-scrub-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`],
  });
  const serviceWorker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  return { context, extensionId: new URL(serviceWorker.url()).host, serviceWorker, userDataDir };
}

async function seedReportedConflict(serviceWorker, { splitProfiles = true } = {}) {
  const latestCodes = makeCodes();
  latestCodes[3] = 'KeyH';
  latestCodes[8] = 'KeyZ';
  latestCodes[13] = 'Numpad6';
  latestCodes[15] = 'Digit5';
  latestCodes[16] = 'Digit6';

  const legacyCodes = makeCodes();
  legacyCodes[3] = 'KeyH';
  const workNames = new Array(22).fill('');
  const chatNames = new Array(22).fill('');
  const values = {
    shortcutKeyToggleChatWork: 'Digit5',
    useAltForModelSwitcherRadio: true,
    useControlForModelSwitcherRadio: false,
    modelCatalogLatest: latestCatalog,
    modelNamesLatest: workNames,
    modelCatalogLegacy: legacyCatalog,
    modelNamesLegacy: chatNames,
    modelCatalogSelectedProfile: 'latest',
    modelPickerKeyCodeProfilesVersion: 1,
    modelPickerKeyCodesLatest: latestCodes,
    modelPickerKeyCodesLegacy: legacyCodes,
  };
  if (!splitProfiles) {
    delete values.modelPickerKeyCodesLatest;
    delete values.modelPickerKeyCodesLegacy;
    delete values.modelPickerKeyCodeProfilesVersion;
    values.modelPickerKeyCodes = latestCodes;
    values.modelPickerKeyCodeProfilesVersion = 0;
  }
  await serviceWorker.evaluate(async (storage) => chrome.storage.sync.set(storage), values);
  return { latestCodes, legacyCodes };
}

async function installStorageProbe(
  page,
  { delayFirstFullRead = 0, failRepairWrite = false, grantIdentity = false } = {},
) {
  await page.addInitScript(
    ({ delayFirstFullRead, failRepairWrite, grantIdentity }) => {
      const sync = globalThis.chrome?.storage?.sync;
      const probe = {
        reads: 0,
        writes: [],
        getWrapped: false,
        setWrapped: false,
        identityContainsWrapped: false,
      };

      if (sync) {
        const nativeGet = sync.get;
        const nativeSet = sync.set;
        try {
          sync.get = (keys, callback) => {
            if (keys === null && delayFirstFullRead && probe.reads++ === 0) {
              setTimeout(
                () => Reflect.apply(nativeGet, sync, [keys, callback]),
                delayFirstFullRead,
              );
              return;
            }
            return Reflect.apply(nativeGet, sync, [keys, callback]);
          };
          probe.getWrapped = sync.get !== nativeGet;
        } catch {}

        try {
          sync.set = (items, callback) => {
            const keys = Object.keys(items || {});
            probe.writes.push(keys);
            const shouldFail = failRepairWrite && keys.includes('modelPickerKeyCodesLatest');
            const nextItems = shouldFail
              ? { ...items, __shortcutScrubQuotaProbe: 'x'.repeat(9000) }
              : items;
            return Reflect.apply(nativeSet, sync, [nextItems, callback]);
          };
          probe.setWrapped = sync.set !== nativeSet;
        } catch {}
      }

      if (grantIdentity && globalThis.chrome?.permissions) {
        const permissions = chrome.permissions;
        const nativeContains = permissions.contains;
        try {
          permissions.contains = (_options, callback) => callback(true);
          probe.identityContainsWrapped = permissions.contains !== nativeContains;
        } catch {}
      }
      window.__popupStorageProbe = probe;
    },
    { delayFirstFullRead, failRepairWrite, grantIdentity },
  );
}

async function openPopup(context, extensionId, options = {}) {
  const page = await context.newPage();
  await installStorageProbe(page, options);
  await page.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
  });
  return page;
}

async function readShortcutStorage(serviceWorker) {
  return serviceWorker.evaluate(async () =>
    chrome.storage.sync.get([
      'shortcutKeyToggleChatWork',
      'shortcutKeyClickNativeScrollToBottom',
      'modelPickerKeyCodesLatest',
      'modelPickerKeyCodesLegacy',
      'modelPickerKeyCodes',
      'modelPickerKeyCodeProfilesVersion',
      'useControlForModelSwitcherRadio',
      '__shortcutScrubImportSentinel',
      '__shortcutScrubQuotaProbe',
    ]),
  );
}

test('popup gates shortcut UI, scrubs both storage and Work inputs, then reopens without repair writes', async () => {
  const { context, extensionId, serviceWorker, userDataDir } = await launchExtensionProfile();
  try {
    await seedReportedConflict(serviceWorker);
    const page = await openPopup(context, extensionId, { delayFirstFullRead: 500 });
    await expect.poll(() => page.evaluate(() => window.__popupStorageProbe?.getWrapped)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__popupStorageProbe?.setWrapped)).toBe(true);
    await expect(page.locator('body')).toHaveAttribute('data-popup-shortcut-state', 'pending');
    await expect(page.locator('.shortcut-container')).toBeHidden();

    await expect(page.locator('body')).toHaveAttribute('data-popup-shortcut-state', 'ready');
    await expect(page.locator('.shortcut-container')).toBeVisible();
    await expect(page.locator('.ios-search-input')).toBeFocused();
    await expect(page.locator('[data-model-catalog-profile="latest"]')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const chatWorkInput = page.locator('#model-picker-grid #shortcutKeyToggleChatWork');
    const speedInput = page.locator('#model-picker-grid .mp-input[data-slot="13"]');
    const solInput = page.locator('#model-picker-grid .mp-input[data-slot="15"]');
    const astraInput = page.locator('#model-picker-grid .mp-input[data-slot="16"]');
    const scalarCollisionInput = page.locator('#model-picker-grid .mp-input[data-slot="8"]');
    const unaffectedWorkInput = page.locator('#model-picker-grid .mp-input[data-slot="3"]');
    await expect(chatWorkInput).toHaveValue('5');
    await expect(speedInput).toHaveValue('6');
    await expect(solInput).toHaveValue('');
    await expect(astraInput).toHaveValue('');
    await expect(scalarCollisionInput).toHaveValue('');
    await expect(unaffectedWorkInput).toHaveValue('h');
    expect(await chatWorkInput.evaluate((input) => input.dataset.keyCode)).toBe('Digit5');
    expect(await speedInput.evaluate((input) => input.dataset.keyCode)).toBe('Digit6');

    let stored = await readShortcutStorage(serviceWorker);
    expect(stored.shortcutKeyToggleChatWork).toBe('Digit5');
    expect(stored.shortcutKeyClickNativeScrollToBottom).toBe('KeyZ');
    expect(stored.modelPickerKeyCodesLatest[13]).toBe('Digit6');
    expect(stored.modelPickerKeyCodesLatest[15]).toBe('');
    expect(stored.modelPickerKeyCodesLatest[16]).toBe('');
    expect(stored.modelPickerKeyCodesLatest[8]).toBe('');
    expect(stored.modelPickerKeyCodesLatest[3]).toBe('KeyH');
    expect(stored.modelPickerKeyCodesLegacy[3]).toBe('KeyH');

    const firstOpenWrites = await page.evaluate(() => window.__popupStorageProbe.writes);
    expect(
      firstOpenWrites.some((keys) => keys.length === 1 && keys[0] === 'modelPickerKeyCodesLatest'),
    ).toBe(true);

    const reopened = await openPopup(context, extensionId);
    await expect(reopened.locator('body')).toHaveAttribute('data-popup-shortcut-state', 'ready');
    stored = await readShortcutStorage(serviceWorker);
    expect(stored.modelPickerKeyCodesLatest[15]).toBe('');
    expect(stored.modelPickerKeyCodesLatest[16]).toBe('');
    const reopenWrites = await reopened.evaluate(() => window.__popupStorageProbe.writes);
    expect(
      reopenWrites.some((keys) =>
        keys.some((key) =>
          [
            'shortcutKeyToggleChatWork',
            'modelPickerKeyCodesLatest',
            'modelPickerKeyCodesLegacy',
          ].includes(key),
        ),
      ),
    ).toBe(false);
    await reopened.close();
    await page.close();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('legacy shared-array migration preserves utility precedence until the full scrub', async () => {
  const { context, extensionId, serviceWorker, userDataDir } = await launchExtensionProfile();
  try {
    await seedReportedConflict(serviceWorker, { splitProfiles: false });
    const page = await openPopup(context, extensionId);
    await expect(page.locator('body')).toHaveAttribute('data-popup-shortcut-state', 'ready');
    const stored = await readShortcutStorage(serviceWorker);
    expect(stored.modelPickerKeyCodeProfilesVersion).toBe(1);
    expect(stored.modelPickerKeyCodesLatest[13]).toBe('Digit6');
    expect(stored.modelPickerKeyCodesLatest[15]).toBe('');
    expect(stored.modelPickerKeyCodesLatest[16]).toBe('');
    await page.close();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('popup stays unavailable and reports an error when the repair write fails', async () => {
  const { context, extensionId, serviceWorker, userDataDir } = await launchExtensionProfile();
  try {
    await seedReportedConflict(serviceWorker);
    const page = await openPopup(context, extensionId, { failRepairWrite: true });
    await expect.poll(() => page.evaluate(() => window.__popupStorageProbe?.setWrapped)).toBe(true);
    await expect(page.locator('body')).toHaveAttribute('data-popup-shortcut-state', 'failed');
    await expect(page.locator('.shortcut-container')).toBeHidden();
    await expect(page.locator('.ios-search-input')).not.toBeFocused();
    await expect(page.locator('#toast-container')).toContainText(
      'Shortcut settings could not be verified',
    );
    const stored = await readShortcutStorage(serviceWorker);
    expect(stored.modelPickerKeyCodesLatest[15]).toBe('Digit5');
    expect(stored.modelPickerKeyCodesLatest[16]).toBe('Digit6');
    expect(stored.__shortcutScrubQuotaProbe).toBeUndefined();
    await page.close();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('legacy and profile imports scrub collisions without mutating input or rewriting unrelated keys', async () => {
  const { context, extensionId, serviceWorker, userDataDir } = await launchExtensionProfile();
  try {
    await seedReportedConflict(serviceWorker);
    await serviceWorker.evaluate(async () =>
      chrome.storage.sync.set({ __shortcutScrubImportSentinel: 'keep' }),
    );
    const page = await openPopup(context, extensionId);
    await expect(page.locator('body')).toHaveAttribute('data-popup-shortcut-state', 'ready');

    let confirmationCount = 0;
    page.on('dialog', async (dialog) => {
      confirmationCount += 1;
      await dialog.accept();
    });

    const sharedCodes = makeCodes();
    sharedCodes[13] = 'Numpad6';
    sharedCodes[15] = 'Digit5';
    sharedCodes[16] = 'Digit6';
    const firstImport = await page.evaluate(async (codes) => {
      const source = {
        shortcutKeyToggleChatWork: 'Digit5',
        modelPickerKeyCodes: codes,
        modelCatalogLatest: { sentinel: 'must stay local' },
      };
      const result = await window.importSettingsObj(source);
      return { result, catalogUntouched: source.modelCatalogLatest?.sentinel };
    }, sharedCodes);
    expect(firstImport).toEqual({ result: true, catalogUntouched: 'must stay local' });

    let stored = await readShortcutStorage(serviceWorker);
    expect(stored.shortcutKeyToggleChatWork).toBe('Digit5');
    expect(stored.modelPickerKeyCodesLatest[13]).toBe('Digit6');
    expect(stored.modelPickerKeyCodesLatest[15]).toBe('');
    expect(stored.modelPickerKeyCodesLatest[16]).toBe('');
    expect(stored.modelPickerKeyCodes).toEqual(stored.modelPickerKeyCodesLegacy);
    expect(stored.__shortcutScrubImportSentinel).toBe('keep');

    const latestCodes = makeCodes();
    latestCodes[13] = 'Digit6';
    latestCodes[15] = 'Numpad5';
    latestCodes[16] = 'Numpad6';
    const legacyCodes = makeCodes();
    legacyCodes[3] = 'KeyH';
    await page.evaluate(
      async ({ latest, legacy }) =>
        window.importSettingsObj({
          shortcutKeyToggleChatWork: 'Digit5',
          modelPickerKeyCodesLatest: latest,
          modelPickerKeyCodesLegacy: legacy,
        }),
      { latest: latestCodes, legacy: legacyCodes },
    );
    stored = await readShortcutStorage(serviceWorker);
    expect(stored.modelPickerKeyCodesLatest[13]).toBe('Digit6');
    expect(stored.modelPickerKeyCodesLatest[15]).toBe('');
    expect(stored.modelPickerKeyCodesLatest[16]).toBe('');
    expect(stored.modelPickerKeyCodesLegacy[3]).toBe('KeyH');
    expect(stored.modelPickerKeyCodes).toEqual(stored.modelPickerKeyCodesLegacy);
    expect(confirmationCount).toBe(2);
    await page.close();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('export repairs the committed shortcut snapshot and writes aligned compatibility data', async () => {
  const { context, extensionId, serviceWorker, userDataDir } = await launchExtensionProfile();
  try {
    await seedReportedConflict(serviceWorker);
    const page = await openPopup(context, extensionId);
    await expect(page.locator('body')).toHaveAttribute('data-popup-shortcut-state', 'ready');

    const latestCodes = makeCodes();
    latestCodes[13] = 'Numpad6';
    latestCodes[15] = 'Digit5';
    latestCodes[16] = 'Digit6';
    await serviceWorker.evaluate(
      async (codes) =>
        chrome.storage.sync.set({
          shortcutKeyToggleChatWork: 'Digit5',
          modelPickerKeyCodesLatest: codes,
        }),
      latestCodes,
    );

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btnExportSettings').click();
    const download = await downloadPromise;
    const downloadedPath = await download.path();
    expect(downloadedPath).toBeTruthy();
    const exported = JSON.parse(await readFile(downloadedPath, 'utf8')).data;
    expect(exported.shortcutKeyToggleChatWork).toBe('Digit5');
    expect(exported.modelPickerKeyCodesLatest[13]).toBe('Digit6');
    expect(exported.modelPickerKeyCodesLatest[15]).toBe('');
    expect(exported.modelPickerKeyCodesLatest[16]).toBe('');
    expect(exported.modelPickerKeyCodes).toEqual(exported.modelPickerKeyCodesLegacy);
    expect(exported.modelCatalogLatest).toBeUndefined();

    const stored = await readShortcutStorage(serviceWorker);
    expect(stored.modelPickerKeyCodesLatest[15]).toBe('');
    expect(stored.modelPickerKeyCodesLatest[16]).toBe('');
    await page.close();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('cloud restore saves a normalized local patch before reflecting restored settings', async () => {
  const { context, extensionId, serviceWorker, userDataDir } = await launchExtensionProfile();
  try {
    await seedReportedConflict(serviceWorker);
    const page = await openPopup(context, extensionId, { grantIdentity: true });
    await expect(page.locator('body')).toHaveAttribute('data-popup-shortcut-state', 'ready');
    await expect
      .poll(() => page.evaluate(() => window.__popupStorageProbe.identityContainsWrapped))
      .toBe(true);

    const latestCodes = makeCodes();
    latestCodes[13] = 'Digit6';
    latestCodes[15] = 'Digit5';
    latestCodes[16] = 'Numpad6';
    const legacyCodes = makeCodes();
    legacyCodes[3] = 'KeyH';
    await page.evaluate(
      async ({ latest, legacy }) => {
        const remote = {
          shortcutKeyToggleChatWork: 'Digit5',
          useControlForModelSwitcherRadio: false,
          modelPickerKeyCodesLatest: latest,
          modelPickerKeyCodesLegacy: legacy,
          modelCatalogLatest: { sentinel: 'must not restore' },
          modelNamesLatest: ['remote catalog names'],
          showModelNamesCheckbox: true,
        };
        const nativeSet = chrome.storage.sync.set.bind(chrome.storage.sync);
        window.__restoreRemote = remote;
        window.__restoreSaveCalls = [];
        window.CloudStorage = {
          loadSyncedSettings: async () => remote,
          saveLocalSettings: async (patch) => {
            window.__restoreSaveCalls.push(structuredClone(patch));
            await new Promise((resolve, reject) => {
              nativeSet(patch, () => {
                const error = chrome.runtime.lastError;
                if (error) reject(new Error(error.message));
                else resolve();
              });
            });
          },
        };
      },
      { latest: latestCodes, legacy: legacyCodes },
    );

    await page.locator('#btnRestoreFromCloud').evaluate((button) => button.click());
    await expect(page.locator('#syncStatus')).toHaveAttribute('data-tone', 'success');
    const restoreEvidence = await page.evaluate(() => ({
      saveCalls: window.__restoreSaveCalls,
      remoteCatalogPreserved: window.__restoreRemote.modelCatalogLatest?.sentinel,
      reflectedNames: window.MODEL_NAMES,
    }));
    expect(restoreEvidence.saveCalls).toHaveLength(1);
    expect(restoreEvidence.remoteCatalogPreserved).toBe('must not restore');
    expect(restoreEvidence.saveCalls[0].modelCatalogLatest).toBeUndefined();
    expect(restoreEvidence.saveCalls[0].modelNamesLatest).toBeUndefined();
    expect(restoreEvidence.reflectedNames).not.toEqual(['remote catalog names']);

    const stored = await readShortcutStorage(serviceWorker);
    expect(stored.shortcutKeyToggleChatWork).toBe('Digit5');
    expect(stored.modelPickerKeyCodesLatest[13]).toBe('Digit6');
    expect(stored.modelPickerKeyCodesLatest[15]).toBe('');
    expect(stored.modelPickerKeyCodesLatest[16]).toBe('');
    expect(stored.modelPickerKeyCodesLegacy[3]).toBe('KeyH');
    expect(stored.modelPickerKeyCodes).toEqual(stored.modelPickerKeyCodesLegacy);
    await page.close();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('clear-all and reset-all use one normalized persistence path', async () => {
  const { context, extensionId, serviceWorker, userDataDir } = await launchExtensionProfile();
  try {
    await seedReportedConflict(serviceWorker);
    const page = await openPopup(context, extensionId);
    await expect(page.locator('body')).toHaveAttribute('data-popup-shortcut-state', 'ready');

    await page.locator('#btnClearAllShortcuts').click({ force: true });
    await expect(page.locator('#dup-overlay')).toBeVisible();
    await page.locator('#dup-yes').click();
    await expect
      .poll(async () => {
        const stored = await readShortcutStorage(serviceWorker);
        return stored.modelPickerKeyCodesLatest.every((code) => code === '');
      })
      .toBe(true);
    let stored = await readShortcutStorage(serviceWorker);
    expect(stored.shortcutKeyToggleChatWork).toBe('\u00A0');
    expect(stored.modelPickerKeyCodesLegacy.every((code) => code === '')).toBe(true);
    expect(stored.modelPickerKeyCodes.every((code) => code === '')).toBe(true);

    // The duplicate-modal guard coalesces confirmations answered within 300 ms.
    await page.waitForTimeout(350);
    await page.locator('#btnResetDefaults').click({ force: true });
    await expect(page.locator('#dup-overlay')).toBeVisible();
    await page.locator('#dup-yes').click();
    await expect
      .poll(async () => {
        const current = await readShortcutStorage(serviceWorker);
        return (
          current.shortcutKeyToggleChatWork === 'Digit5' && current.modelPickerKeyCodesLatest[13]
        );
      })
      .toBeTruthy();
    stored = await readShortcutStorage(serviceWorker);
    const expectedDefaults = await page.evaluate(() => {
      const modelLabels = window.ModelLabels;
      const shortcutKeys = Array.from(document.querySelectorAll('input.key-input'))
        .filter((input) => !input.classList.contains('mp-input'))
        .map((input) => input.getAttribute('data-sync') || input.id)
        .filter(Boolean);
      const profiles = {};
      ['latest', 'legacy'].forEach((profile) => {
        const suffix = profile === 'latest' ? 'Latest' : 'Legacy';
        const catalog = window.__modelCatalogProfiles[profile];
        const names = window.__modelNamesProfiles[profile];
        const configIds = new Set([
          'configure-latest',
          ...(Array.isArray(catalog?.configureOptions)
            ? catalog.configureOptions.map((option) => option?.id)
            : []),
          ...Object.keys(catalog?.frontendByConfig || {}),
        ]);
        const groups = Array.from(configIds).flatMap((configId) =>
          modelLabels.getPopupPresentationGroups(configId, names, catalog),
        );
        profiles[profile] = {
          storageKey: `modelPickerKeyCodes${suffix}`,
          codes: modelLabels.filterProfileKeyCodesToCatalog(
            window.DEFAULT_PRESET_DATA[`modelPickerKeyCodes${suffix}`],
            profile,
            catalog,
            names,
          ),
          groups,
        };
      });
      return modelLabels.normalizeShortcutAssignments({
        shortcuts: shortcutKeys.map((storageKey) => ({
          storageKey,
          value: window.DEFAULT_PRESET_DATA[storageKey] || '',
          modifier: window.CSP_SETTINGS_SCHEMA.shortcuts.ctrlShortcutKeys?.includes(storageKey)
            ? 'ctrl'
            : 'alt',
        })),
        modelModifier: window.DEFAULT_PRESET_DATA.useControlForModelSwitcherRadio ? 'ctrl' : 'alt',
        profiles,
      }).profiles;
    });
    expect(stored.modelPickerKeyCodesLatest).toEqual(expectedDefaults.latest);
    expect(stored.modelPickerKeyCodesLegacy).toEqual(expectedDefaults.legacy);
    expect(stored.modelPickerKeyCodes).toEqual(stored.modelPickerKeyCodesLegacy);
    await page.close();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
