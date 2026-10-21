import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { chromium } from 'playwright';
import nativeSearch from '../extension/shortcuts/search.js';
import { renderCheckReportHtml } from './playwright/lib/devscrape-wide-core.mjs';
import {
  inspectInstalledShortcutTargets,
  inspectionExitCode,
  readInstalledTargets,
  validateInspectionArgs,
} from './playwright/lib/shortcut-target-inspection.mjs';

const source = await readFile(new URL('../extension/shortcuts/search.js', import.meta.url), 'utf8');
const passive = vm.createContext({});
vm.runInContext(source, passive);
assert.equal(
  typeof passive.CSPShortcuts.search.create,
  'function',
  'import needs no DOM, storage, timer or listener',
);
assert.throws(
  () => validateInspectionArgs(['--inspect-targets', '--provision-fixtures']),
  /cannot be combined/,
);
assert.throws(() => validateInspectionArgs(['--inspect-targets', '--fast']), /cannot be combined/);
validateInspectionArgs([
  '--action',
  'audit-shortcuts',
  '--inspect-targets',
  '--shortcut-action-id',
  nativeSearch.ACTION_ID,
]);
const rejected = spawnSync(
  process.execPath,
  [
    'tests/playwright/devscrape-wide.mjs',
    '--action',
    'audit-shortcuts',
    '--inspect-targets',
    '--fast',
  ],
  { encoding: 'utf8' },
);
assert.equal(rejected.status, 1);
assert.match(rejected.stderr, /inspection never prepares or activates targets/);
assert.doesNotMatch(rejected.stderr, /connectOverCDP|ECONNREFUSED/);

const calls = [];
const fixtureWorld = vm.createContext({
  CSPShortcuts: {
    search: nativeSearch,
    inspect: (actionId) => ({ actionId, status: 'ready', reason: 'fixture' }),
  },
});
let created;
let detached = false;
const context = {
  newCDPSession: async () => ({
    on: (_event, callback) => {
      created = callback;
    },
    send: async (method, params) => {
      calls.push(method);
      if (method === 'Runtime.enable') {
        created({
          context: {
            id: 4,
            name: 'ChatGPT Custom Shortcuts Pro',
            origin: 'chrome-extension://fixture',
          },
        });
        return {};
      }
      if (method === 'Runtime.evaluate')
        return { result: { value: vm.runInContext(params.expression, fixtureWorld) } };
      throw new Error(`Unexpected mutating protocol call: ${method}`);
    },
    detach: async () => {
      detached = true;
    },
  }),
};
const inspected = await inspectInstalledShortcutTargets(context, {}, [
  nativeSearch.ACTION_ID,
  'legacy-action',
]);
assert.equal(inspected.rows[0].status, 'ready');
assert.equal(inspected.rows[1].reason, 'legacy-resolver');
assert.equal(inspectionExitCode(inspected.rows), 2);
assert.equal(inspectionExitCode([{ status: 'ambiguous' }]), 1);
assert.equal(inspectionExitCode([{ status: 'ready' }]), 0);
assert.match(
  renderCheckReportHtml({ targetInspection: inspected, generatedAt: new Date().toISOString() }),
  /Read-only target inspection/,
);
assert.equal(detached, true);
assert.deepEqual(calls, ['Runtime.enable', 'Runtime.evaluate']);
assert.equal(
  vm.runInContext(
    `(${readInstalledTargets.toString()})(['${nativeSearch.ACTION_ID}'], {search:'stale'})`,
    fixtureWorld,
  )[0].reason,
  'extension-module-missing-or-stale',
);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(
    '<button id="search"><svg><use href="#magnifying-glass-lg-light-16"></use></svg></button>',
  );
  await page.addScriptTag({ content: source });
  await page.evaluate(() => {
    const NativeObserver = window.MutationObserver;
    const active = new Set();
    window.activeSearchWaits = () => active.size;
    window.MutationObserver = class extends NativeObserver {
      observe(target, options) {
        if (options?.attributeFilter?.includes('href')) active.add(this);
        super.observe(target, options);
      }
      disconnect() {
        active.delete(this);
        super.disconnect();
      }
    };
    window.clicks = [];
    window.actions = window.CSPShortcuts.search.create({
      document,
      click: (element) => {
        window.clicks.push(element.id);
        element.click();
        return true;
      },
      isVisible: (element) =>
        element.getBoundingClientRect().width > 0 &&
        getComputedStyle(element).visibility !== 'hidden',
    });
  });
  const ready = await page.evaluate(() => {
    const before = document.body.innerHTML;
    const rows = window.actions.inspect().diagnostic;
    return { rows, unchanged: before === document.body.innerHTML, clicks: window.clicks.length };
  });
  assert.equal(ready.rows.status, 'ready');
  assert.equal(ready.unchanged, true);
  assert.equal(ready.clicks, 0);
  await page.evaluate(() =>
    document.body.append(document.getElementById('search').cloneNode(true)),
  );
  assert.equal(await page.evaluate(() => window.actions.inspect().diagnostic.status), 'ambiguous');
  assert.equal((await page.evaluate(() => window.actions.run())).ok, false);
  assert.deepEqual(await page.evaluate(() => window.clicks), []);

  await page.setContent(
    '<button id="opener" data-testid="open-sidebar-button" aria-controls="stage-popover-sidebar" aria-expanded="false">Open</button>',
  );
  await page.evaluate(() => {
    document.getElementById('opener').onclick = () =>
      setTimeout(() => {
        document.body.insertAdjacentHTML(
          'beforeend',
          '<button id="native-search"><svg><use href="#magnifying-glass-lg-light-20"></use></svg></button>',
        );
      }, 10);
  });
  assert.equal(
    await page.evaluate(() => window.actions.inspect().diagnostic.status),
    'needs-state',
  );
  assert.equal((await page.evaluate(() => window.actions.run())).status, 'activated');
  assert.deepEqual(await page.evaluate(() => window.clicks), ['opener', 'native-search']);
  assert.equal(await page.evaluate(() => window.activeSearchWaits()), 0);
  await page.evaluate(() => {
    document.getElementById('native-search').remove();
    document.getElementById('opener').onclick = null;
  });
  assert.equal(
    (await page.evaluate(() => window.actions.run({ timeoutMs: 20 }))).status,
    'timeout',
  );
  assert.equal(await page.evaluate(() => window.activeSearchWaits()), 0);
  assert.equal(
    (
      await page.evaluate(() => {
        const controller = new AbortController();
        const result = window.actions.run({ signal: controller.signal });
        controller.abort();
        return result;
      })
    ).status,
    'cancelled',
  );
  assert.equal(await page.evaluate(() => window.activeSearchWaits()), 0);
  console.log(
    'Search module: passive load, read-only inspection, ambiguity refusal, narrow preparation, timeout/cancellation, and isolated CDP routing passed.',
  );
} finally {
  await browser.close();
}
