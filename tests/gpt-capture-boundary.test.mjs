import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { openGptMenuForProbeState } from './playwright/lib/devscrape-wide-core.mjs';

function makeGptMenuPage({ menuOpen = false, associated = true } = {}) {
  let isMenuOpen = menuOpen;
  let syntheticClicks = 0;
  const locatorCalls = [];
  const waitCalls = [];
  const triggerAttributes = {
    id: 'gpt-trigger',
    'aria-controls': associated ? 'gpt-menu' : '',
    'aria-haspopup': 'menu',
    'aria-expanded': menuOpen ? 'true' : 'false',
  };
  const menuAttributes = {
    id: 'gpt-menu',
    role: 'menu',
    'data-radix-menu-content': '',
    'data-state': 'open',
    'aria-labelledby': associated ? 'gpt-trigger' : 'other-trigger',
  };
  const trigger = {
    getAttribute: (name) => triggerAttributes[name] || null,
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 40, bottom: 40 }),
    closest: () => null,
    click() {
      syntheticClicks += 1;
      throw new Error('The GPT trigger must use Playwright locator.click().');
    },
  };
  const menu = {
    getAttribute: (name) => menuAttributes[name] || null,
    querySelector: (selector) => (selector.includes('#square-and-pencil-light-16') ? {} : null),
  };
  const header = {
    querySelectorAll: () => [trigger],
  };
  const document = {
    documentElement: { clientHeight: 900, clientWidth: 1200 },
    getElementById: () => null,
    querySelector: (selector) => (selector === '#page-header' ? header : null),
    querySelectorAll: (selector) =>
      selector.includes('data-radix-menu-content') && isMenuOpen ? [menu] : [],
  };
  const page = {
    evaluate: async (callback, argument) =>
      runInNewContext(`(${callback.toString()})(__argument)`, {
        document,
        window: { innerHeight: 900, innerWidth: 1200 },
        __argument: argument,
      }),
    locator(selector) {
      const call = { scopeSelector: selector, triggerSelector: '', index: null };
      locatorCalls.push(call);
      return {
        locator(triggerSelector) {
          call.triggerSelector = triggerSelector;
          return this;
        },
        nth(index) {
          call.index = index;
          return this;
        },
        async click() {
          call.clicked = true;
          isMenuOpen = true;
          triggerAttributes['aria-expanded'] = 'true';
          triggerAttributes['aria-controls'] = 'gpt-menu';
          menuAttributes['aria-labelledby'] = 'gpt-trigger';
        },
      };
    },
    async waitForFunction(callback, argument, options) {
      waitCalls.push(options);
      return page.evaluate(callback, argument);
    },
  };
  return {
    page,
    locatorCalls,
    waitCalls,
    get syntheticClicks() {
      return syntheticClicks;
    },
  };
}

test('GPT capture opens its scoped trigger with Playwright and rejects unrelated open menus', async () => {
  const fixture = makeGptMenuPage({ menuOpen: true, associated: false });
  await openGptMenuForProbeState(fixture.page);

  assert.equal(fixture.syntheticClicks, 0);
  assert.equal(fixture.locatorCalls.length, 1);
  assert.equal(fixture.locatorCalls[0].scopeSelector, '#page-header');
  assert.match(fixture.locatorCalls[0].triggerSelector, /^button\[aria-haspopup="menu"\]/);
  assert.equal(fixture.locatorCalls[0].index, 0);
  assert.equal(fixture.locatorCalls[0].clicked, true);
  assert.deepEqual(fixture.waitCalls, [{ timeout: 5000 }]);
});

test('GPT capture reuses an already open associated menu without toggling it', async () => {
  const fixture = makeGptMenuPage({ menuOpen: true, associated: true });
  await openGptMenuForProbeState(fixture.page);

  assert.equal(fixture.syntheticClicks, 0);
  assert.deepEqual(fixture.locatorCalls, []);
  assert.deepEqual(fixture.waitCalls, []);
});

test('GPT capture-only completion does not require dispatch menu dismissal', async () => {
  const source = await readFile(
    new URL('./playwright/lib/devscrape-wide-core.mjs', import.meta.url),
    'utf8',
  );
  const end = source.indexOf('        if (prepareCaptureOnly) {\n          const stateId');
  const start = source.lastIndexOf(
    '        if (',
    source.indexOf(
      '          await closeOpenMenus(page);',
      source.indexOf('        trackAuditOwnedConversation(page.url());'),
    ),
  );
  const boundary = source.slice(start, end);
  assert.ok(boundary.includes('shortcutKeyNewGptConversation'));
  let dismissals = 0;
  const context = {
    prepareCaptureOnly: true,
    collectTargetArtifacts: true,
    shortcut: { actionId: 'shortcutKeyNewGptConversation' },
    closeOpenMenus: async () => {
      dismissals += 1;
    },
    page: { locator: () => ({ count: async () => 1 }) },
  };
  await runInNewContext(`(async () => { ${boundary} })()`, context);
  assert.equal(dismissals, 0);
  context.prepareCaptureOnly = false;
  await assert.rejects(
    runInNewContext(`(async () => { ${boundary} })()`, context),
    /GPT evidence menu could not be dismissed/,
  );
  assert.equal(dismissals, 1);
});
