import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const initialViewport = {
    width: 1100,
    height: 1200,
};

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
                popupMetrics.containerWidth + popupMetrics.bodyPaddingX + 24
            ),
            820,
            1280
        ),
        height: clamp(Math.max(popupMetrics.scrollHeight, 900), 900, 1600),
    });
}

test('popup matches the approved visual baseline', async () => {
    test.slow();

    const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'cgcsp-playwright-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless: true,
        viewport: initialViewport,
        args: [
            `--disable-extensions-except=${repoRoot}`,
            `--load-extension=${repoRoot}`,
        ],
    });

    try {
        let serviceWorker = context.serviceWorkers()[0];
        if (!serviceWorker) {
            serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
        }

        const extensionId = new URL(serviceWorker.url()).host;
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/popup.html`, {
            waitUntil: 'domcontentloaded',
        });
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.evaluate(async () => {
            if (document.fonts?.ready) {
                await document.fonts.ready;
            }
        });
        await page.waitForTimeout(500);
        await fitPopupViewport(page);
        await page.waitForTimeout(250);

        await expect(page).toHaveScreenshot('popup-visual.png', {
            fullPage: true,
            animations: 'disabled',
            caret: 'hide',
            scale: 'css',
        });
    } finally {
        await context.close();
        await rm(userDataDir, { recursive: true, force: true });
    }
});
