import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { chromium } from 'playwright';

test('Search setup proves rendered opener visibility independently of sidebar aria-expanded', async () => {
  const source = await readFile(new URL('./devscrape-wide-core.mjs', import.meta.url), 'utf8');
  const constants = source.slice(
    source.indexOf('const SEARCH_CONVERSATION_BUTTON_SELECTORS ='),
    source.indexOf('const SEARCH_DIALOG_VISIBLE_SELECTOR ='),
  );
  const helper = source.slice(
    source.indexOf('async function ensureSearchChatsOpenerVisible('),
    source.indexOf('async function captureSearchChatsDialog('),
  );
  const ensureVisible = vm.runInNewContext(
    `${constants}\n${helper}\nensureSearchChatsOpenerVisible`,
    { waitBeforeBrowserInteraction: async () => {} },
  );
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const scenario of ['hidden', 'visible', 'absent']) {
      await page.setContent(`
        <button id="rail-toggle" aria-controls="app-shell-sidebar" aria-expanded="true">Toggle</button>
        ${scenario === 'absent' ? '' : `<button id="search-opener" style="${scenario === 'hidden' ? 'display:none' : ''}"><svg><path d="M9.16211 2.37976" /></svg></button>`}`);
      await page.evaluate(() => {
        window.sidebarClicks = 0;
        document.getElementById('rail-toggle').addEventListener('click', (event) => {
          window.sidebarClicks += 1;
          event.currentTarget.setAttribute('aria-expanded', 'false');
          const search = document.getElementById('search-opener');
          if (search) search.style.display = '';
        });
      });
      if (scenario === 'absent') {
        await assert.rejects(ensureVisible(page), /Could not find a Search Chats opener/);
      } else {
        const opener = await ensureVisible(page);
        assert.equal(await opener.isVisible(), true);
      }
      assert.equal(await page.evaluate(() => window.sidebarClicks), scenario === 'hidden' ? 1 : 0);
    }
  } finally {
    await browser.close();
  }
});

test('native send/stop helpers parse selectors and click only visible enabled composer glyphs', async () => {
  const source = await readFile(new URL('./devscrape-wide-core.mjs', import.meta.url), 'utf8');
  const constants = source.slice(
    source.indexOf('const NATIVE_COMPOSER_FORM_SELECTOR ='),
    source.indexOf('const USER_MESSAGE_SELECTORS ='),
  );
  const helpers = source.slice(
    source.indexOf('async function waitForEnabledButton('),
    source.indexOf('async function ensureControlSendStopEnabled('),
  );
  const runtime = vm.runInNewContext(
    `${constants}\n${helpers}\n({ SEND_BUTTON_SELECTORS, STOP_BUTTON_SELECTORS, waitForEnabledButton, clickEnabledButton })`,
    { waitBeforeBrowserInteraction: async () => {} },
  );
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const buttons = (prefix, disabled = '') => `
      <button id="${prefix}-send" type="submit" ${disabled}><svg><path d="M9.33467 16.6663" /></svg></button>
      <button id="${prefix}-stop" type="button" ${disabled}><svg><path d="M4.5 5.75C4.5 5.05964" /></svg></button>`;
    await page.setContent(`
      <form style="display:none"><div contenteditable="true" role="textbox"></div>${buttons('hidden')}</form>
      <form><div contenteditable="true" role="textbox"></div>${buttons('disabled', 'disabled')}</form>
      <form>${buttons('unrelated')}</form>
      <form><div contenteditable="true" role="textbox"></div>${buttons('composer')}</form>`);
    await page.evaluate(() => {
      window.clickedButtons = [];
      document.addEventListener('click', (event) => {
        event.preventDefault();
        window.clickedButtons.push(event.target.closest('button')?.id);
      });
    });
    for (const [selectors, expected] of [
      [runtime.SEND_BUTTON_SELECTORS, 'composer-send'],
      [runtime.STOP_BUTTON_SELECTORS, 'composer-stop'],
    ]) {
      // Query every candidate with the native parser, including legacy fallbacks.
      await page.evaluate((candidates) => {
        for (const selector of candidates) document.querySelectorAll(selector);
      }, selectors);
      await runtime.waitForEnabledButton(page, selectors, 1000);
      await runtime.clickEnabledButton(page, selectors);
      assert.equal(await page.evaluate(() => window.clickedButtons.at(-1)), expected);
    }
    assert.deepEqual(await page.evaluate(() => window.clickedButtons), [
      'composer-send',
      'composer-stop',
    ]);
  } finally {
    await browser.close();
  }
});
