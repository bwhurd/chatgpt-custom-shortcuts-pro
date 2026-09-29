import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const settingKey = 'enableSendWithControlEnterCheckbox';
const tempRoot = path.resolve(os.tmpdir());
const extensionRoot = fileURLToPath(new URL('../../../extension/', import.meta.url));
const profilePath = await mkdtemp(path.join(tempRoot, 'csp-audit-0087-popup-'));
assert.ok(
  path.resolve(profilePath).startsWith(`${tempRoot}${path.sep}`),
  'The disposable profile must remain under the OS temp root.',
);

let context;
let originalStorage;
let originalControl;
let temporaryValue;
let popupUrl;
let browserCdp;
let popupSessionId;
let cdpMessageId = 0;
const pendingCdpMessages = new Map();
const result = {
  browser: 'Playwright bundled Chromium, headed, fresh persistent profile',
  extensionLoaded: false,
  nativePopupOpened: false,
  popupClosedAndReopened: false,
  settingPersistedAcrossReopen: false,
  originalSettingRestoredAndVerified: false,
  profileCleaned: false,
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, description, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function extensionWorker(extensionId = '') {
  const matches = () =>
    context
      .serviceWorkers()
      .find((worker) =>
        worker.url().startsWith('chrome-extension://') &&
        (!extensionId || new URL(worker.url()).hostname === extensionId),
      );
  return matches() || context.waitForEvent('serviceworker', { timeout: 10000 });
}

async function readStorageState(worker) {
  return worker.evaluate(
    (key) =>
      new Promise((resolve) =>
        chrome.storage.sync.get(key, (items) =>
          resolve({ present: Object.hasOwn(items, key), value: items[key] }),
        ),
      ),
    settingKey,
  );
}

async function setRawStorageState(worker, state) {
  if (state.present) {
    await worker.evaluate(
      ({ key, value }) =>
        new Promise((resolve) => chrome.storage.sync.set({ [key]: value }, resolve)),
      { key: settingKey, value: state.value },
    );
  } else {
    await worker.evaluate(
      (key) => new Promise((resolve) => chrome.storage.sync.remove(key, resolve)),
      settingKey,
    );
  }
}

async function popupTarget(extensionId) {
  const { targetInfos } = await browserCdp.send('Target.getTargets');
  return targetInfos.find(
    (target) =>
      target.type === 'page' && target.url === `chrome-extension://${extensionId}/popup.html`,
  );
}

async function openNativePopup(extensionId) {
  const existing = await popupTarget(extensionId);
  if (existing) return existing;
  const worker = await extensionWorker(extensionId);
  await worker.evaluate(async () => chrome.action.openPopup());
  return waitFor(
    () => popupTarget(extensionId),
    'the extension action popup target',
  );
}

async function attachPopupTarget(targetId) {
  const attached = await browserCdp.send('Target.attachToTarget', { targetId });
  popupSessionId = attached.sessionId;
}

async function sendPopupCommand(method, params = {}) {
  assert.ok(popupSessionId, 'The native popup target must be attached.');
  const id = ++cdpMessageId;
  const response = new Promise((resolve, reject) => {
    pendingCdpMessages.set(id, { reject, resolve });
  });
  await browserCdp.send('Target.sendMessageToTarget', {
    sessionId: popupSessionId,
    message: JSON.stringify({ id, method, params }),
  });
  return response;
}

async function evaluatePopup(expression) {
  const response = await sendPopupCommand('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || 'Native popup evaluation failed.');
  }
  return response.result?.value;
}

async function getControlValue() {
  return evaluatePopup(
    `document.querySelector('#${settingKey}')?.checked === true`,
  );
}

async function clickPopupControl() {
  const clicked = await evaluatePopup(`(() => {
    const control = document.querySelector('#${settingKey}');
    if (!control) return false;
    control.click();
    return true;
  })()`);
  assert.equal(clicked, true, 'The popup setting control must exist for activation.');
}

async function closeNativePopup(targetId) {
  await browserCdp.send('Target.closeTarget', { targetId });
  popupSessionId = undefined;
  await waitFor(
    async () => !(await popupTarget(new URL(popupUrl).hostname)),
    'the native popup to close',
  );
  await delay(1000);
}

async function waitForStoredValue(worker, expected) {
  await waitFor(async () => {
    const current = await readStorageState(worker);
    return current.present && current.value === expected;
  }, 'the temporary sync-storage value');
}

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

  const worker = await extensionWorker();
  const extensionId = new URL(worker.url()).hostname;
  popupUrl = `chrome-extension://${extensionId}/popup.html`;
  browserCdp = await context.browser().newBrowserCDPSession();
  browserCdp.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
    if (sessionId !== popupSessionId) return;
    let payload;
    try {
      payload = JSON.parse(message);
    } catch {
      return;
    }
    if (typeof payload.id !== 'number') return;
    const pending = pendingCdpMessages.get(payload.id);
    if (!pending) return;
    pendingCdpMessages.delete(payload.id);
    if (payload.error) pending.reject(new Error(payload.error.message));
    else pending.resolve(payload.result || {});
  });
  result.extensionLoaded = true;

  let popup = await openNativePopup(extensionId);
  result.nativePopupOpened = true;
  await attachPopupTarget(popup.targetId);
  await waitFor(
    async () => evaluatePopup(`Boolean(document.querySelector('#${settingKey}'))`),
    'the native popup setting control',
  );
  originalControl = await getControlValue();
  originalStorage = await readStorageState(worker);
  temporaryValue = !originalControl;

  await clickPopupControl();
  await waitForStoredValue(worker, temporaryValue);
  await closeNativePopup(popup.targetId);

  popup = await openNativePopup(extensionId);
  result.popupClosedAndReopened = true;
  await attachPopupTarget(popup.targetId);
  await waitFor(
    async () => evaluatePopup(`Boolean(document.querySelector('#${settingKey}'))`),
    'the reopened popup setting control',
  );
  assert.equal(
    await getControlValue(),
    temporaryValue,
    'The popup should rehydrate the temporary control value after closing and reopening.',
  );
  result.settingPersistedAcrossReopen = true;

  const stateBeforeRestore = await readStorageState(worker);
  assert.ok(
    stateBeforeRestore.present && stateBeforeRestore.value === temporaryValue,
    'Compare-before-restore must match the isolated value written by this probe.',
  );
  await setRawStorageState(worker, originalStorage);
  await closeNativePopup(popup.targetId);

  popup = await openNativePopup(extensionId);
  await attachPopupTarget(popup.targetId);
  await waitFor(
    async () => evaluatePopup(`Boolean(document.querySelector('#${settingKey}'))`),
    'the restored popup setting control',
  );
  const restoredStorage = await readStorageState(worker);
  assert.deepEqual(restoredStorage, originalStorage);
  assert.equal(await getControlValue(), originalControl);
  result.originalSettingRestoredAndVerified = true;
} finally {
  if (context && originalStorage && temporaryValue !== undefined && popupUrl) {
    try {
      const worker = await extensionWorker(new URL(popupUrl).hostname);
      const current = await readStorageState(worker);
      if (current.present && current.value === temporaryValue) {
        await setRawStorageState(worker, originalStorage);
      }
    } catch {}
  }
  if (context) await context.close();
  const resolvedProfilePath = path.resolve(profilePath);
  assert.ok(
    resolvedProfilePath.startsWith(`${tempRoot}${path.sep}`),
    'Refusing to remove a profile outside the OS temp root.',
  );
  await rm(resolvedProfilePath, { recursive: true, force: true });
  result.profileCleaned = true;
}

console.log(JSON.stringify(result));
