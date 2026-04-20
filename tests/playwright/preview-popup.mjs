import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { focusCodexWindow } from './focus-codex-window.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const extensionRoot = path.join(repoRoot, 'extension');

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--')));

function getArgValue(flag, fallback) {
    const index = args.indexOf(flag);
    if (index === -1 || index === args.length - 1) {
        return fallback;
    }
    return args[index + 1];
}

const headed = flags.has('--headed');
const keepOpen = flags.has('--keep-open');
const waitMs = Number.parseInt(getArgValue('--wait-ms', headed ? '1500' : '750'), 10);
const screenshotPath = path.resolve(
    repoRoot,
    getArgValue('--out', path.join('test-results', 'playwright', 'popup-preview.png'))
);
const userDataDir = path.join(repoRoot, '.playwright', 'extension-profile');
const initialViewport = {
    width: 1100,
    height: 1200,
};

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function waitForEnter() {
    return new Promise((resolve) => {
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.once('data', () => resolve());
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

await mkdir(path.dirname(screenshotPath), { recursive: true });
await mkdir(userDataDir, { recursive: true });

const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false,
    viewport: initialViewport,
    args: [
        `--disable-extensions-except=${extensionRoot}`,
        `--load-extension=${extensionRoot}`,
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
    await page.waitForTimeout(waitMs);
    await expandScrollablePopupForSnapshot(page);
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
    const targetWidth = clamp(
        Math.max(
            popupMetrics.scrollWidth,
            popupMetrics.containerWidth + popupMetrics.bodyPaddingX + 24
        ),
        820,
        1280
    );
    const targetHeight = clamp(Math.max(popupMetrics.scrollHeight, 900), 900, 1600);
    await page.setViewportSize({
        width: targetWidth,
        height: targetHeight,
    });
    await page.waitForTimeout(250);
    await page.screenshot({
        path: screenshotPath,
        fullPage: true,
    });

    console.log(`Popup preview loaded from chrome-extension://${extensionId}/popup.html`);
    console.log(`Screenshot saved to ${screenshotPath}`);

    if (keepOpen) {
        if (process.stdin.isTTY) {
            console.log('Press Enter to close the preview window.');
            await waitForEnter();
        } else {
            console.log('No interactive terminal detected, closing preview after 20 seconds.');
            await page.waitForTimeout(20000);
        }
    }
} finally {
    await context.close();
    await focusCodexWindow();
}
