import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const extensionRoot = path.join(repoRoot, 'extension');
const initialViewport = {
  width: 1100,
  height: 1200,
};
const productionViewport = { width: 784, height: 580 };
const toggleKey = 'hidePastedLibraryFilesEnabled';

async function readSetting(page) {
  return page.evaluate(async (key) => (await chrome.storage.sync.get(key))[key], toggleKey);
}

async function waitForPopupReady(page) {
  await expect(page.locator(`#${toggleKey}`)).toHaveAttribute('data-listener-attached', 'true');
  await expect(page.locator('#shortcutKeyCopyLowest')).toHaveAttribute('data-key-code', /\S+/);
  await expect
    .poll(() => readSetting(page), { message: 'Popup settings must be seeded' })
    .not.toBeUndefined();
  const stored = await readSetting(page);
  expect(typeof stored).toBe('boolean');
  await expect(page.locator(`#${toggleKey}`)).toBeChecked({ checked: stored });
  await page.evaluate(() => document.fonts.ready);
}

const popupTest = test.extend({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture dependencies; this fixture owns its browser.
  extension: async ({}, use) => {
    const tempParent = await realpath(os.tmpdir());
    const userDataDir = await mkdtemp(path.join(tempParent, 'cgcsp-playwright-'));
    if (path.dirname(path.resolve(userDataDir)) !== tempParent) {
      throw new Error('Temporary profile escaped its allocated parent');
    }
    let context;
    try {
      context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: true,
        viewport: productionViewport,
        args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`],
      });
      const worker =
        context.serviceWorkers()[0] ||
        (await context.waitForEvent('serviceworker', { timeout: 15000 }));
      const url = `chrome-extension://${new URL(worker.url()).host}/popup.html`;
      const errors = [];
      const open = async () => {
        const page = await context.newPage();
        // Register before navigation so startup failures cannot escape the gate.
        page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
        page.on('console', (message) => {
          if (message.type() === 'error' || message.type() === 'warning') {
            errors.push(`${message.type()}: ${message.text()}`);
          }
        });
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await waitForPopupReady(page);
        return page;
      };
      await use({ open });
      expect(errors, 'Unexpected popup browser errors or warnings').toEqual([]);
    } finally {
      try {
        await context?.close();
      } finally {
        await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    }
  },
});

async function assertNoHorizontalOverflow(page, timeout = 5000) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const container = document.querySelector('.shortcut-container');
          return [document.documentElement, document.body, container].map((element) =>
            Math.max(0, element.scrollWidth - element.clientWidth),
          );
        }),
      { timeout, message: 'Popup horizontal overflow must not hide content' },
    )
    .toEqual([0, 0, 0]);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function fitPopupViewport(page) {
  const popupMetrics = await page.evaluate(() => {
    const container = document.querySelector('.shortcut-container');
    const body = document.body;
    const doc = document.documentElement;
    const containerRect = container?.getBoundingClientRect();
    const bodyStyles = window.getComputedStyle(body);
    const bodyPaddingX =
      Number.parseFloat(bodyStyles.paddingLeft || '0') +
      Number.parseFloat(bodyStyles.paddingRight || '0');
    return {
      containerWidth: Math.ceil(containerRect?.width || 0),
      bodyPaddingX: Math.ceil(bodyPaddingX),
      scrollWidth: Math.ceil(Math.max(body.scrollWidth, doc.scrollWidth)),
      scrollHeight: Math.ceil(Math.max(body.scrollHeight, doc.scrollHeight)),
    };
  });

  await page.setViewportSize({
    width: clamp(
      Math.max(
        popupMetrics.scrollWidth,
        popupMetrics.containerWidth + popupMetrics.bodyPaddingX + 24,
      ),
      820,
      1280,
    ),
    height: clamp(Math.max(popupMetrics.scrollHeight, 900), 900, 1600),
  });
}

async function expandScrollablePopupForSnapshot(page) {
  await page.addStyleTag({
    content: `
            html,
            body {
                height: auto !important;
                max-height: none !important;
                min-height: 0 !important;
                overflow: visible !important;
            }

            .shortcut-container {
                height: auto !important;
                max-height: none !important;
                overflow: visible !important;
            }
        `,
  });
}

popupTest('expanded popup catalog matches the approved visual baseline', async ({ extension }) => {
  const page = await extension.open();
  await page.setViewportSize(initialViewport);
  await expandScrollablePopupForSnapshot(page);
  await fitPopupViewport(page);
  await expect(page).toHaveScreenshot('popup-visual.png', {
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
  });
});

popupTest(
  'production popup scrolls and restores a user setting after reopening',
  async ({ extension }) => {
    const page = await extension.open();
    await expect(page.locator('h1[data-i18n="popup_title"]')).toBeInViewport();
    await assertNoHorizontalOverflow(page);
    const lowerControl = page.locator('#shortcutKeyAddPhotosFiles');
    await expect(lowerControl).not.toBeInViewport();
    await lowerControl.scrollIntoViewIfNeeded();
    await expect(lowerControl).toBeInViewport();
    expect(
      await page.locator('.shortcut-container').evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);

    const seeded = await page.evaluate((key) => globalThis.OPTIONS_DEFAULTS[key], toggleKey);
    expect(await readSetting(page)).toBe(seeded);
    const changed = !seeded;
    const toggle = page.locator(`#${toggleKey}`);
    await toggle.locator('..').click();
    await expect(toggle).toBeChecked({ checked: changed });
    await expect
      .poll(() => readSetting(page), { message: 'Switch action must persist its exact sync key' })
      .toBe(changed);
    await page.close();
    const reopened = await extension.open();
    await expect(reopened.locator(`#${toggleKey}`)).toBeChecked({ checked: changed });
    expect(await readSetting(reopened)).toBe(changed);
  },
);

popupTest('layout check rejects a deliberately clipped popup', async ({ extension }) => {
  const page = await extension.open();
  await assertNoHorizontalOverflow(page);
  await page.evaluate(() => {
    const defect = document.createElement('div');
    defect.style.width = '1200px';
    defect.style.height = '1px';
    document.querySelector('.shortcut-container').appendChild(defect);
  });
  await expect(assertNoHorizontalOverflow(page, 300)).rejects.toThrow(/Popup horizontal overflow/);
});
