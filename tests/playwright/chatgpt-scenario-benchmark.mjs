import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { focusCodexWindow } from './focus-codex-window.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const resultsPath = path.join(repoRoot, 'test-results', 'playwright', 'chatgpt-scenario-results.json');
const perfLogPath = path.join(repoRoot, 'tests', 'bottom-bar-perf-log.ndjson');
const PERF_LOG_PREFIX = '[CSP_BB_PERF]';

const args = process.argv.slice(2);

function getArgValue(flag, fallback) {
    const index = args.indexOf(flag);
    if (index === -1 || index === args.length - 1) {
        return fallback;
    }
    return args[index + 1];
}

const requestedTitles = (getArgValue(
    '--titles',
    'ShortConversationTest|MediumConversationTest|LongConversationTest'
) || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

const plainCdpUrl = getArgValue('--plain-cdp', 'http://127.0.0.1:9222');
const cspCdpUrl = getArgValue('--csp-cdp', 'http://127.0.0.1:9223');

const scenarios = [
    { id: 'plain', cdpUrl: plainCdpUrl, loadExtension: false, moveTopBarToBottom: null },
    { id: 'csp-off', cdpUrl: cspCdpUrl, loadExtension: true, moveTopBarToBottom: false },
    { id: 'csp-on', cdpUrl: cspCdpUrl, loadExtension: true, moveTopBarToBottom: true },
];

const loadProbeScript = `
(() => {
  const roundMs = (value) => Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
  const nav = performance.getEntriesByType('navigation')[0] || null;
  const result = {
    href: location.href,
    path: location.pathname,
    title: '',
    scenarioGuess: 'undetermined',
    timings: {
      domContentLoaded: roundMs(nav?.domContentLoadedEventEnd),
      loadEventEnd: roundMs(nav?.loadEventEnd),
      domComplete: roundMs(nav?.domComplete),
      firstContentfulPaint: null,
      largestContentfulPaint: null,
      extensionDetected: null,
      bottomBarDetected: null,
      bottomBarReady: null,
      finalized: null
    }
  };
  const hasExtensionMarker = () => !!(
    document.getElementById('csp-hide-disclaimer-style') ||
    document.getElementById('csp-fade-message-buttons-style') ||
    document.documentElement.classList.contains('csp-bottom-bar-ready') ||
    document.body.classList.contains('csp-bottom-bar-ready')
  );
  const hasBottomBar = () => !!document.getElementById('bottomBarContainer');
  const hasBottomBarReady = () => !!(
    document.documentElement.classList.contains('csp-bottom-bar-ready') ||
    document.body.classList.contains('csp-bottom-bar-ready') ||
    document.querySelector('#bottomBarContainer button[data-id="static-sidebar-btn"], #bottomBarContainer button[data-testid="model-switcher-dropdown-button"]')
  );
  const nowMs = () => roundMs(performance.now());
  const computeScenario = () => {
    if (result.timings.extensionDetected == null) return 'extension_not_loaded';
    if (result.timings.bottomBarDetected != null || result.timings.bottomBarReady != null) {
      return 'extension_loaded_moveTopBarToBottomCheckbox_true';
    }
    return 'extension_loaded_moveTopBarToBottomCheckbox_false';
  };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint' && result.timings.firstContentfulPaint == null) {
          result.timings.firstContentfulPaint = roundMs(entry.startTime);
        }
      }
    }).observe({ type: 'paint', buffered: true });
  } catch (_) {}
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) result.timings.largestContentfulPaint = roundMs(last.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (_) {}
  const intervalId = setInterval(() => {
    if (result.timings.extensionDetected == null && hasExtensionMarker()) {
      result.timings.extensionDetected = nowMs();
    }
    if (result.timings.bottomBarDetected == null && hasBottomBar()) {
      result.timings.bottomBarDetected = nowMs();
    }
    if (result.timings.bottomBarReady == null && hasBottomBarReady()) {
      result.timings.bottomBarReady = nowMs();
    }
    const now = nowMs();
    if (now >= 15000 || (document.readyState === 'complete' && now >= 4000)) {
      clearInterval(intervalId);
      result.title = document.title || '';
      result.scenarioGuess = computeScenario();
      result.timings.finalized = now;
      window.__pwLoadProbeResult = result;
      window.__pwLoadProbeDone = true;
    }
  }, 250);
})();
`;

async function connectScenarioBrowser(cdpUrl) {
    return await chromium.connectOverCDP(cdpUrl);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getPrimaryContext(browser) {
    const context = browser.contexts()[0];
    if (!context) {
        throw new Error('NO_BROWSER_CONTEXT');
    }
    return context;
}

async function getExtensionId(context) {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
        try {
            serviceWorker = await context.waitForEvent('serviceworker', { timeout: 5000 });
        } catch (_) {}
    }
    if (serviceWorker) {
        return new URL(serviceWorker.url()).host;
    }

    const page = await context.newPage();
    try {
        await page.goto('chrome://extensions/', {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
        });
        await page.waitForTimeout(1500);
        const extensionId = await page.evaluate(() => {
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
            return match?.getAttribute('id') || null;
        });
        if (!extensionId) throw new Error('EXTENSION_ID_NOT_FOUND');
        return extensionId;
    } finally {
        await page.close().catch(() => {});
    }
}

async function configureExtensionSetting(context, enabled) {
    const extensionId = await getExtensionId(context);
    const page = await context.newPage();
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
            enabled
        );
    } finally {
        await page.close().catch(() => {});
    }
}

async function reloadExtension(context) {
    const extensionId = await getExtensionId(context);
    const page = await context.newPage();
    try {
        await page.goto(`chrome-extension://${extensionId}/popup.html?playwrightSetup=1`, {
            waitUntil: 'domcontentloaded',
        });
        await page.evaluate(() => {
            chrome.runtime.reload();
        });
    } catch (error) {
        const message = String(error?.message || error);
        if (
            !/Execution context was destroyed|Extension context invalidated|Target page, context or browser has been closed/i.test(
                message
            )
        ) {
            throw error;
        }
    } finally {
        await page.close().catch(() => {});
    }

    await sleep(2500);
}

async function openFreshWindow(context, url = 'about:blank') {
    const browser = context.browser();
    const session = await browser.newBrowserCDPSession();
    const pagePromise = context.waitForEvent('page', { timeout: 15000 });
    await session.send('Target.createTarget', {
        url,
        newWindow: true,
    });
    const page = await pagePromise;
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.bringToFront().catch(() => {});
    await session.detach().catch(() => {});
    return page;
}

function attachPerfConsoleCapture(page, sink) {
    page.on('console', (msg) => {
        const text = msg.text();
        if (typeof text !== 'string' || !text.startsWith(PERF_LOG_PREFIX)) return;

        const line = text.slice(PERF_LOG_PREFIX.length).trim();
        if (!line) return;
        sink.push(line);
    });
}

async function ensureSidebarOpen(page) {
    await page.bringToFront().catch(() => {});
    const openButton = page.locator('button[data-testid="open-sidebar-button"]');
    if (await openButton.count()) {
        const button = openButton.first();
        if (await button.isVisible().catch(() => false)) {
            await button.click().catch(() => {});
            await page.waitForTimeout(500);
        }
    }
}

async function getConversationLinks(page) {
    return await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('a[href*="/c/"]'));
        return nodes
            .map((node) => ({
                title: (node.textContent || '').trim().replace(/\\s+/g, ' '),
                href: node.href,
            }))
            .filter((item) => item.title && item.href.startsWith('http'));
    });
}

async function getTopConversationTitles(page, limit = 3) {
    await ensureSidebarOpen(page);
    await page.waitForTimeout(2000);
    const links = await getConversationLinks(page);
    const unique = [];
    const seen = new Set();
    for (const item of links) {
        if (seen.has(item.title)) continue;
        seen.add(item.title);
        unique.push(item.title);
        if (unique.length >= limit) break;
    }
    return unique;
}

async function findConversationHref(page, title) {
    await ensureSidebarOpen(page);
    await page.waitForTimeout(2000);
    const links = await getConversationLinks(page);
    const exact = links.find((item) => item.title === title);
    if (exact) return exact.href;
    const loose = links.find((item) => item.title.toLowerCase().includes(title.toLowerCase()));
    return loose?.href || null;
}

async function waitForVisualSettle(page) {
    return await page.evaluate(async () => {
        const nowMs = () => Math.round(performance.now() * 10) / 10;
        const startedAt = nowMs();
        const quietWindowMs = 1800;
        const maxWaitMs = 20000;
        const root = document.body || document.documentElement;
        if (!root) return { visualSettleMs: nowMs(), settleReason: 'no-root' };

        return await new Promise((resolve) => {
            let finished = false;
            let quietTimer = null;
            let maxTimer = null;
            const finish = (reason) => {
                if (finished) return;
                finished = true;
                if (quietTimer) clearTimeout(quietTimer);
                if (maxTimer) clearTimeout(maxTimer);
                observer.disconnect();
                resolve({
                    visualSettleMs: Math.round((nowMs() - startedAt) * 10) / 10,
                    settleReason: reason,
                });
            };
            const rearm = () => {
                if (quietTimer) clearTimeout(quietTimer);
                quietTimer = setTimeout(() => finish('mutation-quiet-window'), quietWindowMs);
            };
            const observer = new MutationObserver(() => {
                rearm();
            });
            observer.observe(root, {
                subtree: true,
                childList: true,
                attributes: true,
                characterData: true,
            });
            maxTimer = setTimeout(() => finish('max-wait'), maxWaitMs);
            rearm();
        });
    });
}

async function measureConversationReload(page, href) {
    const cdpSession = await page.context().newCDPSession(page);
    await cdpSession.send('Network.enable');
    await cdpSession.send('Network.clearBrowserCache');
    await cdpSession.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.addInitScript(loadProbeScript);
    await page.bringToFront().catch(() => {});
    await page.goto(href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__pwLoadProbeDone === true, null, {
        timeout: 25000,
    });
    const result = await page.evaluate(() => window.__pwLoadProbeResult);
    const settle = await waitForVisualSettle(page);
    await cdpSession.detach().catch(() => {});
    return {
        ...result,
        cacheMode: 'cleared_and_disabled',
        ...settle,
    };
}

const results = {
    generatedAtIso: new Date().toISOString(),
    plainCdpUrl,
    cspCdpUrl,
    requestedTitles,
    topTitlesPreview: [],
    runs: [],
};
const conversationHrefByTitle = new Map();
const perfLogLines = [];
let cspExtensionReloaded = false;

for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const browser = await connectScenarioBrowser(scenario.cdpUrl);
    const context = getPrimaryContext(browser);
    let page = null;
    try {
        if (scenario.loadExtension) {
            if (!cspExtensionReloaded) {
                await reloadExtension(context);
                cspExtensionReloaded = true;
            }
            await configureExtensionSetting(context, scenario.moveTopBarToBottom);
            await sleep(2500);
        }

        page = await openFreshWindow(context, 'https://chatgpt.com/');
        attachPerfConsoleCapture(page, perfLogLines);
        await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
        await sleep(2500);
        if (i === 0) {
            results.topTitlesPreview = await getTopConversationTitles(page, 3);
            console.log('Top conversation titles:', results.topTitlesPreview);
        }

        for (const title of requestedTitles) {
            const href = conversationHrefByTitle.get(title) || (await findConversationHref(page, title));
            if (!href) {
                results.runs.push({
                    scenario: scenario.id,
                    requestedTitle: title,
                    error: 'CONVERSATION_NOT_FOUND',
                });
                continue;
            }
            conversationHrefByTitle.set(title, href);

            await sleep(3000);
            const probe = await measureConversationReload(page, href);
            results.runs.push({
                scenario: scenario.id,
                requestedTitle: title,
                href,
                probe,
            });
            console.log(
                `[chatgpt-scenario-benchmark] ${scenario.id} | ${title} | lcp=${probe?.timings?.largestContentfulPaint ?? 'n/a'} | settle=${probe?.visualSettleMs ?? 'n/a'}ms`
            );
            await sleep(3500);
            await page.close().catch(() => {});
            page = await openFreshWindow(context, 'https://chatgpt.com/');
            attachPerfConsoleCapture(page, perfLogLines);
            await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
            await sleep(2500);
        }
    } finally {
        await page?.close().catch(() => {});
    }
}

await mkdir(path.dirname(resultsPath), { recursive: true });
await writeFile(resultsPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
await mkdir(path.dirname(perfLogPath), { recursive: true });
await writeFile(perfLogPath, perfLogLines.length ? `${perfLogLines.join('\n')}\n` : '', 'utf8');
console.log(`Saved scenario results to ${resultsPath}`);
console.log(`Saved perf console log to ${perfLogPath}`);
await focusCodexWindow();
process.exit(0);
