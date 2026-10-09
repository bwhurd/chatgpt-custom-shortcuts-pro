const assert = require('node:assert/strict');
const test = require('node:test');

const coreModule = import('./playwright/lib/devscrape-wide-core.mjs');
const SEARCH_SELECTORS = [
  'button:has(svg path[d^="M9.16211 2.37976"])',
  'button:has(svg path[d^="M7.32849 1.91016"])',
  'button[data-testid="search-conversation-button"]',
];

function createPageStub({
  dialogInitiallyOpen = false,
  overlayInitiallyOpen = false,
  escapeCloses = true,
  searchOpenerEnabled = true,
  searchOpenerPath = 'M9.16211 2.37976',
} = {}) {
  const state = {
    dialogOpen: dialogInitiallyOpen,
    overlayOpen: overlayInitiallyOpen,
    altDown: false,
    events: [],
    selectors: [],
  };
  const makeLocator = (selector) => {
    state.selectors.push(selector);
    const locator = {
      first() {
        return locator;
      },
      filter() {
        return locator;
      },
      async count() {
        if (selector === '[role="dialog"]:visible') return Number(state.dialogOpen);
        if (selector === '#csp-shortcut-overlay') return Number(state.overlayOpen);
        if (selector.includes(searchOpenerPath)) return 1;
        return 0;
      },
      async click() {
        state.events.push('search-opener-click');
        state.dialogOpen = true;
      },
      async isEnabled() {
        return searchOpenerEnabled;
      },
      async waitFor({ state: expected }) {
        state.events.push(`wait-${selector}-${expected}`);
        const visible = selector.includes('[role="dialog"]') ? state.dialogOpen : state.overlayOpen;
        if (visible !== (expected === 'visible')) {
          throw new Error(`Unexpected ${selector} visibility; expected ${expected}`);
        }
      },
      async evaluate(callback) {
        state.events.push(`capture-${selector}`);
        const html = selector.includes('[role="dialog"]')
          ? '<div role="dialog"><input type="search" placeholder="Search chats..."></div>'
          : '<div id="csp-shortcut-overlay"></div>';
        return callback({ outerHTML: html });
      },
      async isVisible() {
        return selector === '#csp-shortcut-overlay' && state.overlayOpen;
      },
    };
    return locator;
  };
  const page = {
    locator: makeLocator,
    async waitForTimeout() {},
    keyboard: {
      async down(key) {
        state.events.push(`down-${key}`);
        if (key === 'Alt') state.altDown = true;
      },
      async press(key) {
        state.events.push(`press-${key}`);
        if (key === 'Escape') {
          if (escapeCloses) {
            state.dialogOpen = false;
            state.overlayOpen = false;
          }
        } else if (state.altDown) {
          state.overlayOpen = true;
        }
      },
      async up(key) {
        state.events.push(`up-${key}`);
        if (key === 'Alt') state.altDown = false;
      },
    },
  };
  return { page, state };
}

function createExtensionContextStub({ contextAvailable = true, shortcutCode = 'Slash' } = {}) {
  const state = { evaluateOptions: null, detached: false };
  const context = {
    async newCDPSession() {
      const handlers = new Map();
      return {
        on(eventName, handler) {
          handlers.set(eventName, handler);
        },
        async send(method, options) {
          if (method === 'Runtime.enable') {
            handlers.get('Runtime.executionContextCreated')?.({
              context: { id: 1, name: 'Main world', origin: 'https://chatgpt.com' },
            });
            if (contextAvailable) {
              handlers.get('Runtime.executionContextCreated')?.({
                context: {
                  id: 7,
                  name: 'ChatGPT Custom Shortcuts Pro',
                  origin: 'chrome-extension://test-extension',
                },
              });
            }
            return {};
          }
          if (method === 'Runtime.evaluate') {
            state.evaluateOptions = options;
            return { result: { value: { shortcutKeyShowOverlay: shortcutCode } } };
          }
          throw new Error(`Unexpected CDP method: ${method}`);
        },
        async detach() {
          state.detached = true;
        },
      };
    },
  };
  return { context, state };
}

test('Search Chats capture uses the source opener, records the new dialog, and dismisses it', async () => {
  const { executeSafeTargetCaptureStep } = await coreModule;
  const { page, state: pageState } = createPageStub();
  const captureState = {};

  await executeSafeTargetCaptureStep(page, {}, { type: 'open-search-chats-dialog' }, captureState);

  assert.match(captureState.latestDialogHtml, /role="dialog"/);
  assert.ok(pageState.selectors.includes(SEARCH_SELECTORS.join(', ')));
  assert.deepEqual(
    pageState.events.filter((event) => event === 'search-opener-click' || event === 'press-Escape'),
    ['search-opener-click', 'press-Escape'],
  );
  assert.equal(pageState.dialogOpen, false);
});

test('Search Chats capture retains the legacy opener fallback', async () => {
  const { executeSafeTargetCaptureStep } = await coreModule;
  const { page, state } = createPageStub({ searchOpenerPath: 'M7.32849 1.91016' });
  const captureState = {};

  await executeSafeTargetCaptureStep(page, {}, { type: 'open-search-chats-dialog' }, captureState);

  assert.match(captureState.latestDialogHtml, /role="dialog"/);
  assert.ok(state.selectors.includes(SEARCH_SELECTORS.join(', ')));
  assert.equal(state.events.filter((event) => event === 'search-opener-click').length, 1);
  assert.equal(state.dialogOpen, false);
});

test('registry maps both safe capture states to canonical filenames and bounded steps', async () => {
  const { loadDevScrapeWideContract } = await coreModule;
  const { exports } = await loadDevScrapeWideContract();
  const search = exports.DUMP_REGISTRY.find((item) => item.stateId === 'search-chats-dialog');
  const overlay = exports.DUMP_REGISTRY.find((item) => item.stateId === 'shortcut-overlay');

  assert.equal(search.filename, '2n_SearchChats_Dialog.txt');
  assert.equal(search.capture.type, 'latest-open-dialog');
  assert.deepEqual(
    search.steps.map((step) => step.type),
    ['set-sidebar-state', 'open-search-chats-dialog'],
  );
  assert.equal(overlay.filename, '2o_ShortcutOverlay_Dialog.txt');
  assert.equal(overlay.capture.type, 'shortcut-overlay');
  assert.deepEqual(
    overlay.steps.map((step) => step.type),
    ['open-shortcut-overlay'],
  );
  assert.ok(search.steps.length <= 5 && overlay.steps.length <= 5);
});

test('Search Chats capture leaves an unrelated open dialog untouched and blocks ambiguous capture', async () => {
  const { executeSafeTargetCaptureStep } = await coreModule;
  const { page, state } = createPageStub({ dialogInitiallyOpen: true });

  await assert.rejects(
    executeSafeTargetCaptureStep(page, {}, { type: 'open-search-chats-dialog' }, {}),
    /dialog was already open/,
  );
  assert.equal(state.dialogOpen, true);
  assert.equal(state.events.includes('search-opener-click'), false);
});

test('Search Chats capture does not activate a disabled source-owned opener', async () => {
  const { executeSafeTargetCaptureStep } = await coreModule;
  const { page, state } = createPageStub({ searchOpenerEnabled: false });

  await assert.rejects(
    executeSafeTargetCaptureStep(page, {}, { type: 'open-search-chats-dialog' }, {}),
    /opener is disabled/,
  );
  assert.equal(state.events.includes('search-opener-click'), false);
});

test('Search Chats capture fails closed when the opened dialog cannot be dismissed', async () => {
  const { executeSafeTargetCaptureStep } = await coreModule;
  const { page, state } = createPageStub({ escapeCloses: false });

  await assert.rejects(
    executeSafeTargetCaptureStep(page, {}, { type: 'open-search-chats-dialog' }, {}),
    /Search Chats dialog cleanup failed/,
  );
  assert.equal(state.dialogOpen, true);
});

test('shortcut overlay capture uses the active extension assignment and trusted keyboard, then restores state', async () => {
  const { executeSafeTargetCaptureStep } = await coreModule;
  const { page, state: pageState } = createPageStub();
  const { context, state: contextState } = createExtensionContextStub({ shortcutCode: 'Slash' });
  const captureState = {};

  await executeSafeTargetCaptureStep(
    page,
    context,
    { type: 'open-shortcut-overlay' },
    captureState,
    { shortcut: { actionId: 'shortcutKeyShowOverlay', defaultCode: 'Period' } },
  );

  assert.match(captureState.shortcutOverlayHtml, /id="csp-shortcut-overlay"/);
  assert.equal(contextState.evaluateOptions.contextId, 7);
  assert.match(contextState.evaluateOptions.expression, /shortcutKeyShowOverlay/);
  assert.deepEqual(
    pageState.events.filter((event) => /^(down|press|up)-/.test(event)),
    ['down-Alt', 'press-Slash', 'up-Alt', 'press-Escape'],
  );
  assert.equal(pageState.overlayOpen, false);
  assert.equal(contextState.detached, true);
});

test('shortcut overlay capture fails closed when Escape does not restore the page', async () => {
  const { executeSafeTargetCaptureStep } = await coreModule;
  const { page, state } = createPageStub({ escapeCloses: false });
  const { context } = createExtensionContextStub({ shortcutCode: 'Slash' });

  await assert.rejects(
    executeSafeTargetCaptureStep(
      page,
      context,
      { type: 'open-shortcut-overlay' },
      {},
      { shortcut: { actionId: 'shortcutKeyShowOverlay', defaultCode: 'Period' } },
    ),
    /Shortcut overlay cleanup failed/,
  );
  assert.equal(state.overlayOpen, true);
});

test('shortcut overlay capture blocks on an existing overlay that cannot be dismissed', async () => {
  const { executeSafeTargetCaptureStep } = await coreModule;
  const { page, state } = createPageStub({ overlayInitiallyOpen: true, escapeCloses: false });
  const { context, state: contextState } = createExtensionContextStub({ shortcutCode: 'Slash' });

  await assert.rejects(
    executeSafeTargetCaptureStep(
      page,
      context,
      { type: 'open-shortcut-overlay' },
      {},
      { shortcut: { actionId: 'shortcutKeyShowOverlay', defaultCode: 'Period' } },
    ),
    /hidden/,
  );
  assert.equal(state.events.includes('press-Period'), false);
  assert.equal(contextState.evaluateOptions, null);
  assert.equal(state.overlayOpen, true);
});

test('shortcut overlay capture is blocked without the loaded extension context and does not dispatch keys', async () => {
  const { executeSafeTargetCaptureStep } = await coreModule;
  const { page, state: pageState } = createPageStub();
  const { context } = createExtensionContextStub({ contextAvailable: false });

  await assert.rejects(
    executeSafeTargetCaptureStep(
      page,
      context,
      { type: 'open-shortcut-overlay' },
      {},
      { shortcut: { actionId: 'shortcutKeyShowOverlay', defaultCode: 'Period' } },
    ),
    /content script is not loaded/,
  );
  assert.deepEqual(
    pageState.events.filter((event) => /^(down|press|up)-/.test(event)),
    [],
  );
});

test('a blank stored overlay assignment remains disabled instead of falling back to its default', async () => {
  const { executeSafeTargetCaptureStep } = await coreModule;
  const { page, state: pageState } = createPageStub();
  const { context } = createExtensionContextStub({ shortcutCode: '' });

  await assert.rejects(
    executeSafeTargetCaptureStep(
      page,
      context,
      { type: 'open-shortcut-overlay' },
      {},
      { shortcut: { actionId: 'shortcutKeyShowOverlay', defaultCode: 'Period' } },
    ),
    /active assignment is blank or disabled/,
  );
  assert.deepEqual(
    pageState.events.filter((event) => /^(down|press|up)-/.test(event)),
    [],
  );
});
