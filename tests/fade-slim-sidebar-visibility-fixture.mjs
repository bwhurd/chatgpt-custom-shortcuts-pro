import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'acorn';
import { chromium } from 'playwright';

const content = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const start = content.indexOf('function getSlimSidebarHost');
const end = content.indexOf('// @note Show Assigned Shortcuts Overlay', start);
assert(start >= 0 && end > start);
let coerce;
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'coerceNumberFromStorage')
    coerce = node;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
  }
}
visit(parse(content, { ecmaVersion: 'latest' }));
assert(coerce);
const runtime = `const ${content.slice(coerce.start, coerce.end)};\n${content.slice(start, content.lastIndexOf('// ==================================================', end))}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`
    <button aria-controls="app-shell-sidebar" aria-expanded="false">Toggle</button>
    <aside id="app-shell-sidebar" style="width:70px;height:200px;background:rgb(25, 25, 25)"><button id="rail-control" style="transition:background-color 0.2s ease">Native rail</button></aside>
    <div hidden><div role="listbox"><div role="option">Hidden fixture</div></div></div>
    <div id="overlay-parent" hidden><div role="dialog" style="position:fixed;left:200px;top:30px;width:100px;height:100px">Overlay fixture</div></div>
  `);
  await page.evaluate(() => {
    const activeObservers = new Set();
    const NativeObserver = window.MutationObserver;
    window.MutationObserver = class extends NativeObserver {
      observe(...args) {
        if (
          args[1]?.attributeFilter?.some(
            (name) => name === 'data-state' || name === 'aria-expanded',
          )
        )
          activeObservers.add(this);
        return super.observe(...args);
      }
      disconnect() {
        activeObservers.delete(this);
        return super.disconnect();
      }
    };
    window.activeFadeObserverCount = () => activeObservers.size;
    window.fixtureStorageListeners = [];
    window.chrome = {
      storage: {
        sync: {
          get: (defaults, done) =>
            done({
              ...defaults,
              fadeSlimSidebarEnabled: true,
              popupSlimSidebarOpacityValue: '0.35',
            }),
        },
        onChanged: { addListener: (listener) => window.fixtureStorageListeners.push(listener) },
      },
    };
  });
  await page.addScriptTag({ content: runtime });
  const opacity = () => page.locator('#rail-control').evaluate((el) => el.style.opacity);
  await page.waitForFunction(
    () => document.getElementById('rail-control').style.opacity === '0.35',
  );
  assert.equal(await opacity(), '0.35', 'hidden-parent listbox must not force zero opacity');
  assert.equal(await page.locator('#rail-control').evaluate((el) => el.style.pointerEvents), '');

  await page.locator('#app-shell-sidebar').hover();
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('rail-control')).opacity === '1',
  );
  assert.equal(await opacity(), '', 'real hover restores native button opacity');
  await page.mouse.move(350, 350);
  await page.waitForFunction(
    () => document.getElementById('rail-control').style.opacity === '0.35',
  );

  await page.locator('#overlay-parent').evaluate((el) => {
    el.hidden = false;
  });
  await page.waitForFunction(() => document.getElementById('rail-control').style.opacity === '0');
  assert.equal(
    await page.locator('#rail-control').evaluate((el) => el.style.pointerEvents),
    'none',
  );
  await page.locator('#overlay-parent').evaluate((el) => {
    el.hidden = true;
  });
  await page.waitForFunction(
    () => document.getElementById('rail-control').style.opacity === '0.35',
  );
  assert.equal(
    await page.locator('#rail-control').evaluate((el) => el.style.pointerEvents),
    '',
    'attribute-only closure restores hit testing',
  );

  await page.evaluate(() =>
    window.fixtureStorageListeners.forEach((listener) => {
      listener({ popupSlimSidebarOpacityValue: { newValue: 0 } }, 'sync');
    }),
  );
  assert.equal(await opacity(), '0', 'configured zero remains a valid idle level');
  await page.locator('#app-shell-sidebar').hover();
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('rail-control')).opacity === '1',
  );
  await page.mouse.move(350, 350);
  await page.waitForFunction(() => document.getElementById('rail-control').style.opacity === '0');
  await page.evaluate(() =>
    window.fixtureStorageListeners.forEach((listener) => {
      listener({ popupSlimSidebarOpacityValue: { newValue: '0.62' } }, 'sync');
    }),
  );
  assert.equal(
    await opacity(),
    '0.62',
    'numeric-string storage changes preserve the selected level',
  );

  await page.evaluate(() =>
    window.fixtureStorageListeners.forEach((listener) => {
      listener({ fadeSlimSidebarEnabled: { newValue: false } }, 'sync');
    }),
  );
  assert.equal(await opacity(), '', 'disabling restores native opacity');
  assert.equal(
    await page.evaluate(() => window.activeFadeObserverCount()),
    0,
    'disabling cleans up both existing observers',
  );
  assert.equal(
    await page.locator('#app-shell-sidebar').getAttribute('style'),
    'width:70px;height:200px;background:rgb(25, 25, 25)',
    'native container and background remain untouched',
  );
  assert.equal(
    await page.locator('#rail-control').evaluate((el) => el.style.transition),
    'background-color 0.2s',
    'disable restores native transition',
  );
  console.log(
    'Slim-sidebar browser regression passed: hidden overlays, actual hover, configured opacity, overlay-close recovery and disable cleanup.',
  );
} finally {
  await browser.close();
}
