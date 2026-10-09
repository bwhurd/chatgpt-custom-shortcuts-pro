import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import { waitForFixtureConversationReady } from './devscrape-wide-core.mjs';

const FIXTURE_URL = 'https://chatgpt.com/c/readiness-fixture';

class FakeHTMLElement {
  constructor(style = {}) {
    this.style = {
      display: 'block',
      visibility: 'visible',
      pointerEvents: 'auto',
      ...style,
    };
  }

  getBoundingClientRect() {
    return { width: 400, height: 40 };
  }
}

function makeReadinessPage({
  url = FIXTURE_URL,
  readyState = 'complete',
  hasMain = true,
  composerStyle = {},
} = {}) {
  const waitOptions = [];
  const composer = new FakeHTMLElement(composerStyle);
  const environment = {
    HTMLElement: FakeHTMLElement,
    getComputedStyle: (element) => element.style,
    window: { location: { href: url } },
    document: {
      readyState,
      querySelector: (selector) => (selector === 'main' && hasMain ? {} : null),
      querySelectorAll: () => [composer],
    },
  };

  return {
    waitOptions,
    async waitForFunction(predicate, argument, options) {
      waitOptions.push(options);
      const deadline = Date.now() + options.timeout;
      while (true) {
        const ready = runInNewContext(`(${predicate.toString()})(__argument)`, {
          ...environment,
          __argument: argument,
        });
        if (ready) return;

        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          throw new Error(`Timeout ${options.timeout}ms exceeded while waiting for readiness`);
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 1)));
      }
    },
  };
}

test('fixture readiness accepts the matching page after its main and visible composer render', async () => {
  const page = makeReadinessPage();

  await waitForFixtureConversationReady(page, 100, { fixtureUrl: FIXTURE_URL });

  assert.deepEqual(page.waitOptions, [{ timeout: 100 }]);
});

test('fixture readiness times out when the composer is unavailable', async () => {
  const page = makeReadinessPage({ composerStyle: { display: 'none' } });

  await assert.rejects(
    waitForFixtureConversationReady(page, 25, { fixtureUrl: FIXTURE_URL }),
    /Timeout 25ms exceeded while waiting for readiness/,
  );

  assert.deepEqual(page.waitOptions, [{ timeout: 25 }]);
});

test('GPT conversation preparation uses bounded semantic readiness and retains its GPT check', async () => {
  const source = await readFile(new URL('./devscrape-wide-core.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function prepareGptConversationProbeState(');
  const end = source.indexOf('\nasync function installLiveProbeObserver(', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const preparation = source.slice(start, end);

  assert.match(preparation, /await waitBeforeBrowserRequest\(\);/);
  assert.match(
    preparation,
    /await page\.goto\(fixtureUrl,\s*\{ waitUntil: 'domcontentloaded', timeout: 45000 \}\);/,
  );
  assert.match(
    preparation,
    /await waitForFixtureConversationReady\(page, 15000, \{ fixtureUrl \}\);/,
  );
  assert.match(
    preparation,
    /Boolean\(document\.querySelector\('#page-header'\) \|\| document\.querySelector\('main'\)\)/,
  );
  assert.doesNotMatch(preparation, /networkidle|waitForTimeout/);
});
