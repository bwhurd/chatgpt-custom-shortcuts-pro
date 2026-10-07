import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { extractFastRuntime } from './shortcut-fast-cases.mjs';

export async function runOverlayCase(context, content, started) {
  const begin = performance.now();
  const row = {
    actionId: 'shortcutKeyShowOverlay',
    type: 'overlay',
    proofScope: 'fixture-keyboard',
    attempted: true,
    status: 'fail',
    startedMs: begin - started,
    pathScope:
      'Real overlay IIFE, settings/model hydration, shadow renderer and keyboard listener; in-memory Chrome storage, no live account or external assets.',
  };
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const runtime = await extractFastRuntime(content, row.actionId);
    await page.setContent('<input id="composer">');
    await page.addScriptTag({
      path: fileURLToPath(new URL('../../../extension/settings-schema.js', import.meta.url)),
    });
    await page.addScriptTag({
      path: fileURLToPath(
        new URL('../../../extension/shared/model-picker-labels.js', import.meta.url),
      ),
    });
    await page.evaluate(() => {
      window.fixtureStorageReads = [];
      window.fixtureWarnings = [];
      console.warn = (...args) => window.fixtureWarnings.push(args.map(String).join(' '));
      const data = { shortcutKeyShowOverlay: 'Period', shortcutKeyActivateInput: 'KeyW' };
      window.chrome = {
        runtime: {
          id: 'isolated-fixture',
          getURL: (path) => `https://shortcut-fixture.invalid/${path}`,
        },
        i18n: { getMessage: () => '' },
        storage: {
          sync: {
            get(keys, callback) {
              window.fixtureStorageReads.push(keys);
              queueMicrotask(() =>
                callback(
                  keys === null
                    ? { ...data }
                    : Array.isArray(keys)
                      ? Object.fromEntries(keys.map((key) => [key, data[key]]))
                      : { ...keys, ...data },
                ),
              );
            },
            set(values, callback) {
              Object.assign(data, values);
              callback?.();
            },
          },
          onChanged: { addListener: () => {} },
        },
      };
      window.fixtureKeys = [];
      document.addEventListener('keydown', (e) =>
        window.fixtureKeys.push({
          code: e.code,
          trusted: e.isTrusted,
          prevented: e.defaultPrevented,
        }),
      );
    });
    await page.addScriptTag({ content: runtime.source });
    const overlay = page.locator('#csp-shortcut-overlay');
    for (const chord of [
      'Control+Period',
      'Meta+Period',
      'Alt+Shift+Period',
      'Alt+Control+Period',
    ]) {
      await page.keyboard.press(chord);
      assert.equal(await overlay.count(), 0, `Wrong modifier opened overlay: ${chord}`);
    }
    await page.keyboard.press('Alt+Period');
    await overlay.waitFor({ state: 'visible', timeout: 2000 });
    assert.ok(
      await overlay.locator('.shortcut-container').count(),
      'Real renderer must produce shortcut content',
    );
    assert.ok(await overlay.locator('.key-input').count(), 'Assigned bindings must render');
    await page.keyboard.press('Escape');
    await overlay.waitFor({ state: 'detached', timeout: 2000 });
    await page.keyboard.press('Alt+Period');
    await overlay.waitFor({ state: 'visible', timeout: 2000 });
    await overlay.getByRole('button', { name: 'Close overlay' }).click();
    await overlay.waitFor({ state: 'detached', timeout: 2000 });
    const evidence = await page.evaluate(() => ({
      reads: window.fixtureStorageReads,
      warnings: window.fixtureWarnings,
      keys: window.fixtureKeys,
    }));
    assert.deepEqual(evidence.warnings, []);
    assert.ok(evidence.reads.includes(null), 'Settings hydration must run');
    assert.ok(evidence.reads.some(Array.isArray), 'Model hydration must run');
    assert.ok(evidence.keys.some((key) => key.code === 'Escape' && key.trusted));
    Object.assign(row, {
      status: 'pass',
      chord: 'Alt+Period',
      targetStatus: 'present',
      dispatchStatus: 'pass',
      effectStatus: 'pass',
      contractProofs: [
        'shortcut-overlay-opener',
        'shortcut-overlay-dismissal',
        'overlay-alt-only-capture',
      ],
      observed: evidence,
    });
  } catch (error) {
    row.reason = error.message;
  } finally {
    await page.close();
  }
  row.pageErrors = errors;
  if (errors.length) row.status = 'fail';
  row.durationMs = performance.now() - begin;
  row.endedMs = performance.now() - started;
  return row;
}
