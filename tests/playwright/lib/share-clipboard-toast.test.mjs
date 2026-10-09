import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import {
  cleanupShareToastObserver,
  evaluateLiveProbeSemantic,
  installShareToastObserver,
  readShareClipboardToastEvidence,
  waitForShareClipboardToast,
} from './devscrape-wide-core.mjs';

const shortcut = { actionId: 'shortcutKeyShare', activationProbeMode: 'click-target' };
const snapshot = { visibleDialogCount: 0 };
const complete = {
  clipboardCleared: true,
  clipboardReadSucceeded: true,
  validShareLink: true,
  toastObserved: true,
  trustedDispatch: true,
  targetClickObserved: true,
};

test('Share requires new actual clipboard content, fresh toast and trusted target routing', () => {
  const proof = (share) =>
    evaluateLiveProbeSemantic(shortcut, {}, snapshot, snapshot, null, false, { share });
  assert.equal(proof(complete).status, 'pass');
  for (const key of Object.keys(complete)) {
    assert.equal(proof({ ...complete, [key]: false }).status, 'fail', key);
  }
  assert.equal(proof(null).status, 'fail');
  assert.equal(
    evaluateLiveProbeSemantic(shortcut, {}, snapshot, { visibleDialogCount: 1 }).status,
    'fail',
  );
});

test('Share observes fresh rendered toast leaves and validates the actual clipboard without exporting it', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(
      '<div data-content style="display:contents"><div data-title style="display:contents"><div>Public link copied</div></div></div>',
    );
    await page.evaluate(() => {
      window.fixtureClipboard = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          readText: async () => window.fixtureClipboard,
        },
      });
    });
    await installShareToastObserver(page);
    await page.evaluate(() => document.body.appendChild(document.createElement('div')));
    assert.equal(
      (await readShareClipboardToastEvidence(page)).toastObserved,
      false,
      'A preexisting toast cannot satisfy this dispatch',
    );
    await page.evaluate(() => {
      setTimeout(() => {
        window.fixtureClipboard = 'https://chatgpt.com/share/fixture-owned-id';
        document.querySelector('[data-title]').innerHTML = '<div>Public link copied</div>';
      }, 120);
    });
    assert.deepEqual(await waitForShareClipboardToast(page, { timeoutMs: 1000 }), {
      clipboardReadSucceeded: true,
      validShareLink: true,
      toastObserved: true,
    });
    for (const value of [
      'https://example.com/share/fixture-owned-id',
      'https://chatgpt.com/c/fixture-owned-id',
      'https://chatgpt.com/share/',
      'https://chatgpt.com/share/id?tracking=1',
      'https://chatgpt.com/share/id#fragment',
      'https://user@chatgpt.com/share/id',
      ' https://chatgpt.com/share/id ',
    ]) {
      await page.evaluate((text) => {
        window.fixtureClipboard = text;
      }, value);
      const evidence = await readShareClipboardToastEvidence(page);
      assert.equal(evidence.validShareLink, false);
      assert.equal(
        JSON.stringify(evidence).includes(value),
        false,
        'No clipboard payload is exported',
      );
    }
    await page.evaluate(() => {
      navigator.clipboard.readText = async () => {
        throw new Error('Denied');
      };
    });
    assert.equal((await readShareClipboardToastEvidence(page)).clipboardReadSucceeded, false);
    await cleanupShareToastObserver(page);
    assert.equal(await page.evaluate(() => '__cspShareToastProbe' in window), false);
    await installShareToastObserver(page);
    await page.evaluate(() => {
      document.querySelector('[data-title]').innerHTML =
        '<div style="display:none">Public link copied</div>';
    });
    assert.equal(
      (await readShareClipboardToastEvidence(page)).toastObserved,
      false,
      'A hidden confirmation is insufficient',
    );
  } finally {
    await cleanupShareToastObserver(page).catch(() => {});
    await browser.close();
  }
});
