import process from 'node:process';
import { chromium } from 'playwright';
import { focusCodexWindow } from './focus-codex-window.mjs';

const args = process.argv.slice(2);

function getArgValue(flag, fallback) {
    const index = args.indexOf(flag);
    if (index === -1 || index === args.length - 1) {
        return fallback;
    }
    return args[index + 1];
}

const cdpUrl = getArgValue('--cdp', 'http://127.0.0.1:9223');
const passes = Math.max(1, Number.parseInt(getArgValue('--passes', '3'), 10) || 3);
const sampleMs = Math.max(400, Number.parseInt(getArgValue('--sample-ms', '1600'), 10) || 1600);
const sampleEveryMs = Math.max(20, Number.parseInt(getArgValue('--step-ms', '50'), 10) || 50);

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function maxDrift(samples, key) {
    const values = samples.map((sample) => sample[key]).filter((value) => Number.isFinite(value));
    if (!values.length) return null;
    return round(Math.max(...values) - Math.min(...values));
}

async function openFreshWindow(browser, context, url) {
    const session = await browser.newBrowserCDPSession();
    const pagePromise = context.waitForEvent('page', { timeout: 15000 });
    await session.send('Target.createTarget', { url, newWindow: true });
    const page = await pagePromise;
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.bringToFront().catch(() => {});
    await session.detach().catch(() => {});
    return page;
}

async function reloadExtensionViaUi(browser, context) {
    const page = await openFreshWindow(browser, context, 'chrome://extensions/');
    try {
        await page.waitForTimeout(1500);
        await page.evaluate(() => {
            const manager = document.querySelector('extensions-manager');
            const managerRoot = manager?.shadowRoot;
            const itemList = managerRoot?.querySelector('extensions-item-list');
            const listRoot = itemList?.shadowRoot;
            const items = listRoot ? Array.from(listRoot.querySelectorAll('extensions-item')) : [];
            const match = items.find((item) => {
                const root = item.shadowRoot;
                const name = root?.querySelector('#name')?.textContent?.trim() || '';
                return name === 'ChatGPT Custom Shortcuts Pro';
            });
            const reloadButton = match?.shadowRoot?.querySelector('#dev-reload-button');
            if (!(reloadButton instanceof HTMLElement)) {
                throw new Error('Reload button not found for ChatGPT Custom Shortcuts Pro');
            }
            reloadButton.click();
        });
        await page.waitForTimeout(2200);
    } finally {
        await page.close().catch(() => {});
    }
}

async function getChatPage(browser, context) {
    let page = context.pages().find((candidate) => /^https:\/\/chatgpt\.com\//.test(candidate.url()));
    if (!page) {
        page = await openFreshWindow(browser, context, 'https://chatgpt.com/');
    }
    await page.bringToFront().catch(() => {});
    return page;
}

async function sampleWiggle(page, passIndex) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(100);

    const result = await page.evaluate(
        async ({ sampleMs, sampleEveryMs, passIndex }) => {
            const start = performance.now();
            const round = (value) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : null);
            const samples = [];

            const snap = () => {
                const form = document.querySelector("form[data-type='unified-composer']");
                const bar = document.getElementById('bottomBarContainer');
                const threadBottom = document.getElementById('thread-bottom-container');
                const formRect = form?.getBoundingClientRect();
                const barRect = bar?.getBoundingClientRect();
                const tbcRect = threadBottom?.getBoundingClientRect();

                samples.push({
                    t: round(performance.now() - start),
                    composerTop: round(formRect?.top),
                    composerBottom: round(formRect?.bottom),
                    barTop: round(barRect?.top),
                    barBottom: round(barRect?.bottom),
                    tbcBottom: round(tbcRect?.bottom),
                    gap: formRect && barRect ? round(barRect.top - formRect.bottom) : null,
                    barVisible:
                        !!bar &&
                        bar.isConnected &&
                        getComputedStyle(bar).visibility !== 'hidden' &&
                        getComputedStyle(bar).display !== 'none',
                });
            };

            snap();
            while (performance.now() - start < sampleMs) {
                await new Promise((resolve) => setTimeout(resolve, sampleEveryMs));
                snap();
            }

            const values = (key) => samples.map((sample) => sample[key]).filter(Number.isFinite);
            const drift = (key) => {
                const vals = values(key);
                if (!vals.length) return null;
                return round(Math.max(...vals) - Math.min(...vals));
            };

            return {
                passIndex,
                samples,
                summary: {
                    composerTopDrift: drift('composerTop'),
                    composerBottomDrift: drift('composerBottom'),
                    barTopDrift: drift('barTop'),
                    barBottomDrift: drift('barBottom'),
                    gapDrift: drift('gap'),
                    minGap: values('gap').length ? round(Math.min(...values('gap'))) : null,
                    maxOverlap: values('gap').length
                        ? round(Math.max(0, -(Math.min(...values('gap')))))
                        : null,
                    finalGap: samples.at(-1)?.gap ?? null,
                    firstGap: samples[0]?.gap ?? null,
                    barVisibleSamples: samples.filter((sample) => sample.barVisible).length,
                    hasOverlap: samples.some(
                        (sample) => sample.barVisible && Number.isFinite(sample.gap) && sample.gap < 0,
                    ),
                },
            };
        },
        { sampleMs, sampleEveryMs, passIndex },
    );

    return result;
}

const browser = await chromium.connectOverCDP(cdpUrl);
const context = browser.contexts()[0];

if (!context) {
    console.error('No browser context found for CDP session.');
    process.exit(1);
}

try {
    const results = [];
    for (let i = 0; i < passes; i += 1) {
        await reloadExtensionViaUi(browser, context);
        const page = await getChatPage(browser, context);
        const result = await sampleWiggle(page, i + 1);
        results.push(result);
    }

    const compact = results.map((result) => ({
        pass: result.passIndex,
        ...result.summary,
    }));

    console.log(JSON.stringify(compact, null, 2));
    if (compact.some((result) => result.hasOverlap)) {
        process.exitCode = 2;
    }
} finally {
    await browser.close().catch(() => {});
    await focusCodexWindow();
}
