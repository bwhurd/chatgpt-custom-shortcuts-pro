import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const tempRoot = path.resolve(os.tmpdir());
const extensionRoot = fileURLToPath(new URL('../../../extension/', import.meta.url));
const profilePath = await mkdtemp(path.join(tempRoot, 'csp-audit-0087-ctrl-stop-'));
assert.ok(
  path.resolve(profilePath).startsWith(`${tempRoot}${path.sep}`),
  'The disposable profile must remain under the OS temp root.',
);

let context;
const result = {
  browser: 'Playwright bundled Chromium, headed, fresh persistent profile',
  extensionLoaded: false,
  targetHost: '',
  keydownTrace: [],
  stopClickCount: 0,
  profileCleaned: false,
};

try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${extensionRoot}`,
      `--load-extension=${extensionRoot}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const worker =
    context.serviceWorkers().find((candidate) => candidate.url().startsWith('chrome-extension://')) ||
    (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  result.extensionLoaded = true;

  const page = context.pages()[0] || (await context.newPage());
  await page.addInitScript(() => {
    window.__cspAuditKeydownTrace = [];
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Backspace' || !event.ctrlKey) return;
        const entry = {
          key: event.key,
          code: event.code,
          ctrlKey: event.ctrlKey,
          defaultPreventedAtWindowCapture: event.defaultPrevented,
        };
        queueMicrotask(() => {
          window.__cspAuditKeydownTrace.push({
            ...entry,
            defaultPreventedAfterDispatch: event.defaultPrevented,
          });
        });
      },
      { capture: true },
    );
  });
  await page.goto('https://chatgpt.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  result.targetHost = new URL(page.url()).hostname;
  assert.equal(result.targetHost, 'chatgpt.com', 'The probe must run on ChatGPT host permissions.');
  await page.waitForTimeout(4000);

  await page.evaluate(() => {
    const textarea = document.createElement('textarea');
    textarea.id = 'csp-audit-control-stop-keyboard-target';
    textarea.setAttribute('aria-label', 'Disposable shortcut probe');
    textarea.value = 'native word deletion sentinel';
    textarea.style.cssText =
      'position:fixed;left:12px;top:12px;width:220px;height:44px;z-index:2147483647;';

    const stop = document.createElement('button');
    stop.type = 'button';
    stop.setAttribute('data-testid', 'stop-button');
    stop.textContent = 'Synthetic Stop target';
    stop.style.cssText =
      'position:fixed;left:245px;top:12px;width:160px;height:44px;z-index:2147483647;';
    window.__cspAuditStopClickCount = 0;
    stop.addEventListener('click', () => {
      window.__cspAuditStopClickCount += 1;
    });

    document.body.append(textarea, stop);
  });
  await page.locator('#csp-audit-control-stop-keyboard-target').focus();
  await page
    .locator('#csp-audit-control-stop-keyboard-target')
    .evaluate((textarea) => textarea.setSelectionRange(textarea.value.length, textarea.value.length));
  await page.keyboard.press('Control+Backspace');
  await page.waitForTimeout(50);
  result.enabledCase = await page.evaluate(() => ({
    keydownTrace: window.__cspAuditKeydownTrace,
    stopClickCount: window.__cspAuditStopClickCount,
    draftAfterKeypress: document.querySelector('#csp-audit-control-stop-keyboard-target')?.value,
    targetVisible: (() => {
      const target = document.querySelector('button[data-testid="stop-button"]');
      const rect = target?.getBoundingClientRect();
      return Boolean(rect && rect.width > 0 && rect.height > 0);
    })(),
  }));

  assert.equal(result.enabledCase.targetVisible, true, 'The synthetic visible Stop target must be present.');
  assert.equal(result.enabledCase.stopClickCount, 1, 'The loaded extension must click the visible Stop target once.');
  assert.equal(result.enabledCase.keydownTrace.length, 1, 'The simulated Control+Backspace keydown must reach the page.');
  assert.equal(result.enabledCase.keydownTrace[0].ctrlKey, true);
  assert.equal(
    result.enabledCase.draftAfterKeypress,
    'native word deletion sentinel',
    'The loaded extension must preserve the focused draft while handling Stop.',
  );

  await worker.evaluate(
    () =>
      new Promise((resolve, reject) => {
        chrome.storage.sync.set({ enableStopWithControlBackspaceCheckbox: false }, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      }),
  );
  await page.waitForTimeout(250);
  await page.locator('#csp-audit-control-stop-keyboard-target').evaluate((textarea) => {
    textarea.value = 'native word deletion sentinel';
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  });
  await page.keyboard.press('Control+Backspace');
  await page.waitForTimeout(50);
  result.disabledCase = await page.evaluate(() => ({
    keydownTrace: window.__cspAuditKeydownTrace,
    stopClickCount: window.__cspAuditStopClickCount,
    draftAfterKeypress: document.querySelector('#csp-audit-control-stop-keyboard-target')?.value,
  }));
  assert.equal(result.disabledCase.stopClickCount, 1, 'The disabled setting must not click Stop again.');
  assert.equal(result.disabledCase.keydownTrace.length, 2, 'The disabled chord must still reach the page.');
} finally {
  await context?.close().catch(() => {});
  const resolvedTempRoot = path.resolve(tempRoot);
  const resolvedProfilePath = path.resolve(profilePath);
  assert.ok(
    resolvedProfilePath.startsWith(`${resolvedTempRoot}${path.sep}`),
    'Refuse to remove a profile outside the OS temp root.',
  );
  await rm(resolvedProfilePath, { recursive: true, force: true });
  result.profileCleaned = true;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
