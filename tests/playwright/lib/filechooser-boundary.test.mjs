import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const { FileChooser } = require(
  path.join(
    path.dirname(require.resolve('playwright-core/package.json')),
    'lib/client/fileChooser.js',
  ),
);

// Exercise the production callbacks without connecting to an authenticated browser.
function loadListener(kind) {
  const live = kind === 'live';
  const source = readFileSync(
    new URL(live ? './devscrape-wide-core.mjs' : '../shortcut-fast-fixture.mjs', import.meta.url),
    'utf8',
  );
  const name = live ? 'fileChooserListener' : 'onFileChooser';
  const start = source.indexOf(`const ${name} = (chooser) => {`);
  assert.ok(start >= 0);
  const end = source.indexOf('\n      };', start);
  assert.ok(end > start);
  return runInNewContext(`
    let fileChooserObserved = false;
    let result;
    const pageErrors = [];
    const resolveFileChooser = (value) => { result = value; };
    ${source.slice(start, end + '\n      };'.length)}
    ({ listener: ${name}, state: () => ({ fileChooserObserved, result, pageErrors }) });
  `);
}

for (const kind of ['live', 'fixture']) {
  test(`${kind} chooser uses the installed Playwright API with no file payload`, async () => {
    const calls = [];
    const chooser = new FileChooser(
      {},
      { setInputFiles: async (files, options) => calls.push({ files, options }) },
      false,
    );
    assert.equal(chooser.cancel, undefined);
    const { listener, state } = loadListener(kind);
    assert.doesNotThrow(() => listener(chooser));
    await new Promise(setImmediate);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].files.length, 0);
    assert.equal(calls[0].options.timeout, 1200);
    assert.equal(state().fileChooserObserved, true);
    if (kind === 'live') assert.equal(state().result, true);
    assert.equal(state().pageErrors.length, 0);
  });

  for (const failure of ['throw', 'reject']) {
    test(`${kind} chooser ${failure} is contained and owned-page cleanup completes`, async () => {
      const { listener, state } = loadListener(kind);
      const page = new EventEmitter();
      let closed = false;
      page.close = async () => {
        closed = true;
      };
      const chooser = {
        setFiles: () => {
          if (failure === 'throw') throw new TypeError('Synthetic API failure');
          return Promise.reject(new Error('Synthetic API failure'));
        },
      };
      page.on('filechooser', listener);
      try {
        assert.doesNotThrow(() => page.emit('filechooser', chooser));
        await new Promise(setImmediate);
      } finally {
        page.off('filechooser', listener);
        await page.close();
      }
      assert.equal(closed, true);
      assert.equal(page.listenerCount('filechooser'), 0);
      if (kind === 'live') {
        assert.equal(state().fileChooserObserved, false);
        assert.equal(state().result, false);
      } else {
        assert.equal(state().pageErrors.length, 1);
        assert.doesNotMatch(state().pageErrors[0], /Synthetic/);
      }
    });
  }
}
