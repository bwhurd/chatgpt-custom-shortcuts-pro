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
  const errors = [];
  const pages = [];
  const poisonedShortcutKey =
    'shortcutKeyOverlayFixturePoisoned"><img id="csp-overlay-property-injected"><input id="csp-overlay-property-rogue"';
  const poisonedShortcutValueKey = 'shortcutKeyOverlayFixtureValuePoisoned';
  const poisonedShortcutValue =
    'KeyZ"><img id="csp-overlay-value-injected"><input id="csp-overlay-value-rogue"';

  async function createPage(data, runtimeSource) {
    const page = await context.newPage();
    pages.push(page);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setContent('<input id="composer">');
    await page.addScriptTag({
      path: fileURLToPath(
        new URL('../../../extension/shared/shortcut-bindings.js', import.meta.url),
      ),
    });
    await page.addScriptTag({
      path: fileURLToPath(new URL('../../../extension/settings-schema.js', import.meta.url)),
    });
    await page.addScriptTag({
      path: fileURLToPath(
        new URL('../../../extension/shared/model-picker-labels.js', import.meta.url),
      ),
    });
    await page.evaluate((initialData) => {
      const storageData = { ...initialData };
      window.fixtureStorageReads = [];
      window.fixtureWarnings = [];
      console.warn = (...args) => window.fixtureWarnings.push(args.map(String).join(' '));
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
                    ? { ...storageData }
                    : Array.isArray(keys)
                      ? Object.fromEntries(keys.map((key) => [key, storageData[key]]))
                      : { ...keys, ...storageData },
                ),
              );
            },
            set(values, callback) {
              Object.assign(storageData, values);
              callback?.();
            },
          },
          onChanged: { addListener: () => {} },
        },
      };
      window.fixtureKeys = [];
      document.addEventListener('keydown', (event) =>
        window.fixtureKeys.push({
          code: event.code,
          trusted: event.isTrusted,
          prevented: event.defaultPrevented,
        }),
      );
    }, data);
    await page.addScriptTag({ content: runtimeSource });
    return page;
  }

  try {
    const runtime = await extractFastRuntime(content, row.actionId);
    const commonData = {
      shortcutKeyShowOverlay: 'Period',
      shortcutKeyActivateInput: 'KeyW',
      shortcutKeyPreviousThread: 'KeyJ',
      shortcutKeyNextThread: 'KeyK',
      shortcutKeyOverlayFixtureCustom: 'KeyZ',
    };
    const propertyNamePage = await createPage(
      {
        ...commonData,
        [poisonedShortcutKey]: 'KeyP',
      },
      runtime.source,
    );
    const overlay = propertyNamePage.locator('#csp-shortcut-overlay');
    for (const chord of [
      'Control+Period',
      'Meta+Period',
      'Alt+Shift+Period',
      'Alt+Control+Period',
    ]) {
      await propertyNamePage.keyboard.press(chord);
      assert.equal(await overlay.count(), 0, `Wrong modifier opened overlay: ${chord}`);
    }
    await propertyNamePage.keyboard.press('Alt+Period');
    await overlay.waitFor({ state: 'visible', timeout: 2000 });
    const activeConfigItem = overlay.locator('.mp-configure-item-active');
    await activeConfigItem.waitFor({ state: 'visible', timeout: 2000 });
    const activeConfigBackground = await activeConfigItem.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    assert.equal(
      activeConfigBackground,
      'rgb(0, 63, 122)',
      'The current model configuration must stay visibly highlighted in the overlay',
    );
    const activeConfigLabelColor = await activeConfigItem
      .locator('.shortcut-label')
      .evaluate((element) => getComputedStyle(element).color);
    assert.equal(
      activeConfigLabelColor,
      'rgb(255, 255, 255)',
      'The active configuration label must remain readable on the highlighted background',
    );
    const activeConfigKeycapStyles = await activeConfigItem
      .locator('.key-input')
      .evaluate((element) => {
        const styles = getComputedStyle(element);
        return {
          backgroundColor: styles.backgroundColor,
          borderColor: styles.borderColor,
          color: styles.color,
        };
      });
    assert.deepEqual(
      activeConfigKeycapStyles,
      {
        backgroundColor: 'rgba(255, 255, 255, 0.18)',
        borderColor: 'rgba(255, 255, 255, 0.55)',
        color: 'rgb(255, 255, 255)',
      },
      'The active configuration keycap styling must override the generic grid keycap styling',
    );
    assert.ok(
      await overlay.locator('.shortcut-container').count(),
      'Real renderer must produce shortcut content',
    );
    assert.ok(await overlay.locator('.key-input').count(), 'Assigned bindings must render');
    const validKeyDisplay = await overlay.locator('#shortcutKeyActivateInput').inputValue();
    assert.equal(validKeyDisplay, 'w', 'A valid KeyW binding must render normally');
    const renderedInputIds = await overlay
      .locator('.key-input')
      .evaluateAll((inputs) => inputs.map((input) => input.getAttribute('id')));
    assert.ok(
      renderedInputIds.includes(poisonedShortcutKey),
      'A poisoned shortcut property name must reach its input id literally',
    );
    const propertyNameInjectedElementCount = await overlay
      .locator('#csp-overlay-property-injected, #csp-overlay-property-rogue')
      .count();
    assert.equal(
      propertyNameInjectedElementCount,
      0,
      'A poisoned shortcut property name must not inject DOM',
    );
    for (const retiredKey of ['shortcutKeyPreviousThread', 'shortcutKeyNextThread']) {
      assert.equal(
        await overlay.locator(`#${retiredKey}`).count(),
        0,
        `Retired shortcut must stay out of the overlay: ${retiredKey}`,
      );
    }
    assert.equal(
      await overlay.locator('#shortcutKeyOverlayFixtureCustom').count(),
      1,
      'Generic assigned shortcuts must remain visible in the overlay catch-all',
    );
    await propertyNamePage.keyboard.press('Escape');
    await overlay.waitFor({ state: 'detached', timeout: 2000 });
    await propertyNamePage.keyboard.press('Alt+Period');
    await overlay.waitFor({ state: 'visible', timeout: 2000 });
    await overlay.getByRole('button', { name: 'Close overlay' }).click();
    await overlay.waitFor({ state: 'detached', timeout: 2000 });
    const propertyNameEvidence = await propertyNamePage.evaluate(() => ({
      reads: window.fixtureStorageReads,
      warnings: window.fixtureWarnings,
      keys: window.fixtureKeys,
    }));
    assert.deepEqual(propertyNameEvidence.warnings, []);
    assert.ok(propertyNameEvidence.reads.includes(null), 'Settings hydration must run');
    assert.ok(propertyNameEvidence.reads.some(Array.isArray), 'Model hydration must run');
    assert.ok(propertyNameEvidence.keys.some((key) => key.code === 'Escape' && key.trusted));

    const shortcutValuePage = await createPage(
      {
        ...commonData,
        [poisonedShortcutValueKey]: poisonedShortcutValue,
      },
      runtime.source,
    );
    await shortcutValuePage.keyboard.press('Alt+Period');
    const valueOverlay = shortcutValuePage.locator('#csp-shortcut-overlay');
    await valueOverlay.waitFor({ state: 'visible', timeout: 2000 });
    assert.equal(
      await valueOverlay.locator(`#${poisonedShortcutValueKey}`).count(),
      1,
      'The malformed shortcut value must be tested on its own ordinary storage property',
    );
    const valueInjectedElementCount = await valueOverlay
      .locator('#csp-overlay-value-injected, #csp-overlay-value-rogue')
      .count();
    assert.equal(valueInjectedElementCount, 0, 'A malformed shortcut value must not inject DOM');
    await shortcutValuePage.keyboard.press('Escape');
    await valueOverlay.waitFor({ state: 'detached', timeout: 2000 });
    const valueEvidence = await shortcutValuePage.evaluate(() => ({
      reads: window.fixtureStorageReads,
      warnings: window.fixtureWarnings,
      keys: window.fixtureKeys,
    }));
    assert.deepEqual(valueEvidence.warnings, []);
    assert.ok(valueEvidence.reads.includes(null), 'Settings hydration must run for value case');
    assert.ok(valueEvidence.keys.some((key) => key.code === 'Escape' && key.trusted));
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
        'overlay-active-model-config-styling',
        'overlay-storage-property-name-escaping',
        'overlay-storage-shortcut-value-escaping',
      ],
      observed: {
        propertyNameEvidence,
        valueEvidence,
        validKeyDisplay,
        activeConfigBackground,
        propertyNameInjectedElementCount,
        valueInjectedElementCount,
      },
    });
  } catch (error) {
    row.reason = error.message;
  } finally {
    await Promise.all(pages.map((page) => page.close()));
  }
  row.pageErrors = errors;
  if (errors.length) row.status = 'fail';
  row.durationMs = performance.now() - begin;
  row.endedMs = performance.now() - started;
  return row;
}
