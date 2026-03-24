import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { focusCodexWindow } from './focus-codex-window.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--')));

function getArgValue(flag, fallback) {
    const index = args.indexOf(flag);
    if (index === -1 || index === args.length - 1) {
        return fallback;
    }
    return args[index + 1];
}

function waitForEnter() {
    return new Promise((resolve) => {
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.once('data', () => resolve());
    });
}

const scenario = getArgValue('--scenario', 'csp-off');
const headed = flags.has('--headed') || flags.has('--setup-login') || flags.has('--keep-open');
const keepOpen = flags.has('--keep-open') || flags.has('--setup-login');
const setupLogin = flags.has('--setup-login');
const startUrl = getArgValue('--url', 'https://chatgpt.com/');

const scenarioConfig = {
    plain: {
        profileDir: path.join(repoRoot, '.playwright', 'chatgpt-profile-shared'),
        loadExtension: false,
        moveTopBarToBottom: null,
        label: 'plain',
    },
    'csp-off': {
        profileDir: path.join(repoRoot, '.playwright', 'chatgpt-profile-shared'),
        loadExtension: true,
        moveTopBarToBottom: false,
        label: 'csp-off',
    },
    'csp-on': {
        profileDir: path.join(repoRoot, '.playwright', 'chatgpt-profile-shared'),
        loadExtension: true,
        moveTopBarToBottom: true,
        label: 'csp-on',
    },
};

if (!scenarioConfig[scenario]) {
    console.error(`Unknown scenario "${scenario}". Use plain, csp-off, or csp-on.`);
    process.exit(1);
}

const config = scenarioConfig[scenario];
await mkdir(config.profileDir, { recursive: true });

const launchArgs = [];
if (config.loadExtension) {
    launchArgs.push(`--disable-extensions-except=${repoRoot}`, `--load-extension=${repoRoot}`);
}

const context = await chromium.launchPersistentContext(config.profileDir, {
    channel: 'chromium',
    headless: false,
    viewport: { width: 1440, height: 960 },
    args: launchArgs,
});

async function getExtensionId(ctx) {
    let serviceWorker = ctx.serviceWorkers()[0];
    if (!serviceWorker) {
        serviceWorker = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    }
    return new URL(serviceWorker.url()).host;
}

async function configureExtensionSetting(ctx, enabled) {
    const extensionId = await getExtensionId(ctx);
    const page = await ctx.newPage();
    try {
        await page.goto(`chrome-extension://${extensionId}/popup.html?playwrightSetup=1`, {
            waitUntil: 'domcontentloaded',
        });
        await page.evaluate(
            async (value) =>
                await new Promise((resolve, reject) => {
                    chrome.storage.sync.set({ moveTopBarToBottomCheckbox: value }, () => {
                        const err = chrome.runtime.lastError;
                        if (err) {
                            reject(new Error(err.message));
                            return;
                        }
                        chrome.storage.sync.get(
                            { moveTopBarToBottomCheckbox: false },
                            (items) => resolve(items.moveTopBarToBottomCheckbox),
                        );
                    });
                }),
            enabled,
        );
    } finally {
        await page.close().catch(() => {});
    }
}

try {
    if (config.loadExtension) {
        await configureExtensionSetting(context, config.moveTopBarToBottom);
    }

    const page = await context.newPage();
    await page.goto(startUrl, { waitUntil: 'domcontentloaded' });

    console.log(`Scenario: ${config.label}`);
    console.log(`Profile dir: ${config.profileDir}`);
    console.log(`Start URL: ${startUrl}`);
    if (config.loadExtension) {
        console.log(
            `moveTopBarToBottomCheckbox: ${config.moveTopBarToBottom ? 'true' : 'false'}`,
        );
    } else {
        console.log('Extension: not loaded');
    }

    if (setupLogin) {
        console.log('Log in to ChatGPT in this window, then press Enter here to save the profile.');
    }

    if (keepOpen) {
        if (process.stdin.isTTY) {
            console.log('Press Enter to close the browser window.');
            await waitForEnter();
        } else if (setupLogin && context.browser()) {
            console.log('Close the Chromium window after finishing login and 2FA.');
            await new Promise((resolve) => {
                context.browser().once('disconnected', resolve);
            });
        } else {
            console.log('No interactive terminal detected, closing after 5 minutes.');
            await page.waitForTimeout(300000);
        }
    } else {
        await page.waitForTimeout(3000);
    }
} finally {
    await context.close();
    await focusCodexWindow();
}
