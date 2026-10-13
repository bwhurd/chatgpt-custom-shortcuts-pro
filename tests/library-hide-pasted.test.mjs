import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after } from 'node:test';
import { chromium } from 'playwright';

const source = await readFile(
  new URL('../extension/content-gated-ui-features.js', import.meta.url),
  'utf8',
);
const sectionStart = source.indexOf('// Hide pasted files in the ChatGPT Library');
assert.ok(sectionStart >= 0, 'Library IIFE must remain locatable');
const librarySource = source.slice(sectionStart);
const browser = await chromium.launch({ headless: true });
after(() => browser.close());

async function createFixture({ body, enabled = true, holdWrites = false, path = '/library' }) {
  const context = await browser.newContext();
  await context.route('https://chatgpt.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><head></head><body></body></html>',
    }),
  );
  await context.addInitScript(
    ({ hidePasted, holdWrites: shouldHoldWrites }) => {
      const listeners = [];
      window.__librarySetting = hidePasted;
      window.__holdLibraryWrites = shouldHoldWrites;
      window.__pendingLibraryWrites = [];
      window.__failNextLibraryWrite = false;
      window.__writeFailureMessage = '';
      window.__libraryCollectCount = 0;
      const querySelectorAll = Element.prototype.querySelectorAll;
      Element.prototype.querySelectorAll = function (selector, ...args) {
        if (selector === '[data-library-item][data-library-selection-id^="libfile_"]') {
          window.__libraryCollectCount += 1;
        }
        return querySelectorAll.call(this, selector, ...args);
      };
      window.chrome = {
        runtime: { id: 'library-fixture' },
        storage: {
          sync: {
            get(defaults, callback) {
              callback({ ...defaults, hidePastedLibraryFilesEnabled: window.__librarySetting });
            },
            set(values, callback) {
              if (window.__holdLibraryWrites) {
                window.__pendingLibraryWrites.push({ values, callback });
                return;
              }
              if (window.__failNextLibraryWrite) {
                window.__failNextLibraryWrite = false;
                window.chrome.runtime.lastError = {
                  message: window.__writeFailureMessage || 'Fixture storage failure',
                };
                window.__writeFailureMessage = '';
                callback?.();
                delete window.chrome.runtime.lastError;
                return;
              }
              window.__librarySetting = values.hidePastedLibraryFilesEnabled;
              callback?.();
            },
          },
          local: {},
          onChanged: {
            addListener(listener) {
              listeners.push(listener);
            },
          },
        },
        i18n: { getMessage: () => '' },
      };
      window.__failPendingLibraryWrite = () => {
        const pending = window.__pendingLibraryWrites.shift();
        if (!pending) throw new Error('No pending Library setting write');
        window.chrome.runtime.lastError = { message: 'Fixture storage failure' };
        pending.callback?.();
        delete window.chrome.runtime.lastError;
      };
      window.__notifyLibrarySetting = (value) => {
        const oldValue = window.__librarySetting;
        window.__librarySetting = value;
        for (const listener of listeners) {
          listener({ hidePastedLibraryFilesEnabled: { oldValue, newValue: value } }, 'sync');
        }
      };
    },
    { hidePasted: enabled, holdWrites },
  );
  const page = await context.newPage();
  await page.goto(`https://chatgpt.com${path}`);
  await page.setContent(`<!doctype html><html><head></head><body>${body}</body></html>`);
  await page.addScriptTag({ content: librarySource });
  if (path === '/library') {
    await page.waitForFunction(() => document.querySelector('style#csp-library-hide-pasted-style'));
  }
  return { context, page };
}

const listItem = (id, filename, extra = '') => `
  <div data-library-item data-library-selection-id="${id}">
    <div role="row" aria-label="${filename}">
      <div role="gridcell" data-library-column="selection"><button role="checkbox" aria-label="Select ${filename}"></button></div>
      <div role="gridcell" data-library-column="name"><button aria-label="${filename}">${filename}</button>${extra}</div>
      <div role="gridcell" data-library-column="actions"><button aria-haspopup="menu" aria-label="Actions"></button></div>
    </div>
  </div>`;

const gridItem = (id, filename, column, extra = '') => `
  <div data-masonry-item="file:${id}" style="grid-area: ${column}; transform: translateY(24px)">
    <div data-library-item data-library-selection-id="${id}">
      <button type="button" aria-label="${filename}"><span>${filename}</span><span>${extra}</span></button>
      <button role="checkbox" aria-label="Select ${filename}"></button>
      <button aria-haspopup="menu" aria-label="Actions"></button>
    </div>
  </div>`;

const libraryToolbar = ({
  filterCount = 1,
  filterSymbol = 'filter-light-16',
  assetHash = 'fixture-a',
  wrapper = 'view-controls-a',
} = {}) => `
  <div data-toolbar-fixture>
    <div class="${wrapper}">
      ${Array.from({ length: filterCount }, (_, index) => {
        const symbol = index === 0 ? filterSymbol : 'secondary-menu-light-16';
        return `<button type="button" data-menu="${index}" aria-haspopup="menu"><svg><use href="/cdn/icons-${assetHash}.svg#${symbol}"></use></svg></button>`;
      }).join('')}
      <div data-view-buttons>
        <button type="button" aria-pressed="true"><svg><use href="/cdn/icons-${assetHash}.svg#square-grid-2x2-light-16"></use></svg></button>
        <button type="button" aria-pressed="false"><svg><use href="/cdn/icons-${assetHash}.svg#list-bullet-light-16"></use></svg></button>
      </div>
    </div>
  </div>`;

test('list view filters only file names and uses accessible name over unrelated row text', async () => {
  const { context, page } = await createFixture({
    body: `<main data-app-shell-main-surface="browser">
      ${listItem('libfile_1', 'Ｐａｓｔｅｄ notes.txt', '<span>ordinary preview</span>')}
      ${listItem('libfile_2', 'Project notes.txt', '<span>Pasted appears only in preview</span>')}
      ${listItem('libfile_es', 'Archivo pegado.txt')}
      ${listItem('libfile_ja', '貼り付けられた内容.txt')}
      ${listItem('libfile_ru', 'Файл вставлен.txt')}
      ${listItem('libfile_fr', 'insertion document.txt')}
      ${listItem('libfile_hi', 'चिपकाया दस्तावेज़.txt')}
      ${listItem('libfolder_1', 'Pasted folder')}
      <section data-library-item data-library-selection-id="libfile_3"><button aria-label="Pasted ambiguous"></button><button aria-label="Second control"></button></section>
    </main>`,
  });
  try {
    await page.waitForFunction(
      () =>
        document.querySelector(
          '[data-library-selection-id="libfile_1"][data-csp-library-pasted-hidden]',
        ),
      null,
      { timeout: 3000 },
    );
    const result = await page.evaluate(() => ({
      pasted: getComputedStyle(document.querySelector('[data-library-selection-id="libfile_1"]'))
        .display,
      regular: getComputedStyle(document.querySelector('[data-library-selection-id="libfile_2"]'))
        .display,
      folder: getComputedStyle(document.querySelector('[data-library-selection-id="libfolder_1"]'))
        .display,
      ambiguous: getComputedStyle(document.querySelector('[data-library-selection-id="libfile_3"]'))
        .display,
      localized: ['libfile_es', 'libfile_ja', 'libfile_ru', 'libfile_fr', 'libfile_hi'].map(
        (id) =>
          getComputedStyle(document.querySelector(`[data-library-selection-id="${id}"]`)).display,
      ),
    }));
    assert.equal(result.pasted, 'none');
    assert.equal(result.regular, 'block');
    assert.equal(result.folder, 'block');
    assert.equal(result.ambiguous, 'block');
    assert.deepEqual(result.localized, Array(5).fill('none'));
  } finally {
    await context.close();
  }
});

test('grid view removes masonry slots, keeps responsive columns, and restores native layout', async () => {
  const { context, page } = await createFixture({
    body: `<main data-app-shell-main-surface="browser">
      <div id="masonry" style="display:grid;grid-template-columns:repeat(3, 100px);height:300px;gap:12px">
        ${gridItem('libfile_1', 'Pasted text.txt', '1 / 1')}
        ${gridItem('libfile_2', 'Normal notes.txt', '1 / 2', 'Pasted appears only in preview')}
        ${gridItem('libfile_3', 'Another file.txt', '1 / 3')}
      </div>
      <div data-library-item data-library-selection-id="libfile_4"><button aria-label="Pasted unknown layout">Pasted unknown layout</button></div>
    </main>`,
  });
  try {
    await page.waitForFunction(() =>
      document.querySelector(
        '[data-masonry-item="file:libfile_1"][data-csp-library-pasted-hidden]',
      ),
    );
    const enabled = await page.evaluate(() => {
      const masonry = document.querySelector('#masonry');
      const pasted = document.querySelector('[data-masonry-item="file:libfile_1"]');
      const normal = document.querySelector('[data-masonry-item="file:libfile_2"]');
      return {
        pastedDisplay: getComputedStyle(pasted).display,
        unknownLayoutDisplay: getComputedStyle(
          document.querySelector('[data-library-selection-id="libfile_4"]'),
        ).display,
        parentHeight: getComputedStyle(masonry).height,
        columns: getComputedStyle(masonry).gridTemplateColumns,
        normalGridArea: getComputedStyle(normal).gridArea,
        normalTransform: getComputedStyle(normal).transform,
        flowMarker: masonry.hasAttribute('data-csp-library-pasted-masonry-flow'),
      };
    });
    assert.equal(enabled.pastedDisplay, 'none');
    assert.equal(enabled.unknownLayoutDisplay, 'block');
    assert.notEqual(enabled.parentHeight, '300px');
    assert.equal(enabled.columns, '100px 100px 100px');
    assert.equal(enabled.normalGridArea, 'auto');
    assert.equal(enabled.normalTransform, 'none');
    assert.equal(enabled.flowMarker, true);

    await page.evaluate(() => {
      window.__originalPastedMasonryItem = document.querySelector(
        '[data-masonry-item="file:libfile_1"]',
      );
    });
    await page.evaluate(() => window.__notifyLibrarySetting(false));
    await page.waitForFunction(() => !document.querySelector('[data-csp-library-pasted-hidden]'));
    const restored = await page.evaluate(() => {
      const masonry = document.querySelector('#masonry');
      const pasted = document.querySelector('[data-masonry-item="file:libfile_1"]');
      const normal = document.querySelector('[data-masonry-item="file:libfile_2"]');
      return {
        parentHeight: masonry.style.height,
        flowMarker: masonry.hasAttribute('data-csp-library-pasted-masonry-flow'),
        pastedGridArea: pasted.style.gridArea,
        pastedTransform: pasted.style.transform,
        sameNativeNode: window.__originalPastedMasonryItem === pasted,
        normalGridArea: normal.style.gridArea,
        normalTransform: normal.style.transform,
      };
    });
    assert.equal(restored.parentHeight, '300px');
    assert.equal(restored.flowMarker, false);
    assert.equal(restored.pastedGridArea, '1 / 1');
    assert.equal(restored.pastedTransform, 'translateY(24px)');
    assert.equal(restored.sameNativeNode, true);
    assert.equal(restored.normalGridArea, '1 / 2');
    assert.equal(restored.normalTransform, 'translateY(24px)');

    await page.evaluate(() => window.__notifyLibrarySetting(true));
    await page.waitForFunction(() =>
      document.querySelector('[data-csp-library-pasted-masonry-flow]'),
    );
    await page.evaluate(() => {
      document.querySelector('#masonry').replaceChildren();
    });
    await page.waitForFunction(
      () => !document.querySelector('[data-csp-library-pasted-masonry-flow]'),
    );
    assert.equal(await page.locator('#masonry').evaluate((el) => el.style.height), '300px');
  } finally {
    await context.close();
  }
});

test('the unique semantic main is required when the app-shell marker is absent', async () => {
  const { context, page } = await createFixture({
    body: `<main>${listItem('libfile_1', 'Pasted in unique main.txt')}</main>`,
  });
  try {
    await page.waitForFunction(
      () =>
        document.querySelector(
          '[data-library-selection-id="libfile_1"][data-csp-library-pasted-hidden]',
        ),
      null,
      { timeout: 3000 },
    );
    assert.equal(
      await page
        .locator('[data-library-selection-id="libfile_1"]')
        .evaluate((el) => getComputedStyle(el).display),
      'none',
    );
  } finally {
    await context.close();
  }
});

test('a unique role=main root is also supported without an app-shell marker', async () => {
  const { context, page } = await createFixture({
    body:
      '<div role="main">' +
      libraryToolbar() +
      listItem('libfile_role_main', 'Pasted in role main.txt') +
      '</div>',
  });
  try {
    await page.waitForFunction(() =>
      document.querySelector(
        '[data-library-selection-id="libfile_role_main"][data-csp-library-pasted-hidden]',
      ),
    );
    await page.waitForFunction(() =>
      document.querySelector('[data-csp-library-pasted-toggle="true"]'),
    );
    assert.equal(await page.locator('[data-csp-library-pasted-toggle="true"]').count(), 1);
    assert.equal(
      await page
        .locator('[data-library-selection-id="libfile_role_main"]')
        .evaluate((item) => getComputedStyle(item).display),
      'none',
    );
  } finally {
    await context.close();
  }
});

test('ambiguous main roots and grid items without the masonry wrapper fail open', async () => {
  const { context, page } = await createFixture({
    body: `<main>${listItem('libfile_1', 'Pasted in first main.txt')}</main>
      <main>${listItem('libfile_2', 'Pasted in second main.txt')}</main>`,
  });
  try {
    await page.waitForTimeout(80);
    assert.equal(
      await page
        .locator('[data-library-selection-id="libfile_1"]')
        .evaluate((el) => getComputedStyle(el).display),
      'block',
    );
    assert.equal(
      await page
        .locator('[data-library-selection-id="libfile_2"]')
        .evaluate((el) => getComputedStyle(el).display),
      'block',
    );
  } finally {
    await context.close();
  }
});

test('all matching grid items leave no reserved masonry height', async () => {
  const { context, page } = await createFixture({
    body: `<main data-app-shell-main-surface="browser">
      <div id="masonry" style="display:grid;grid-template-columns:repeat(2, 100px);height:500px;gap:12px">
        ${gridItem('libfile_1', 'Pasted first.txt', '1 / 1')}
        ${gridItem('libfile_2', 'Pasted second.txt', '1 / 2')}
      </div>
    </main>`,
  });
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('[data-csp-library-pasted-hidden]').length === 2,
    );
    const layout = await page.locator('#masonry').evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      childDisplay: [...el.children].map((child) => getComputedStyle(child).display),
    }));
    assert.equal(layout.height, 0);
    assert.deepEqual(layout.childDisplay, ['none', 'none']);
  } finally {
    await context.close();
  }
});

test('toolbar control stays beside Filters through replacement, filename updates, and view swaps', async () => {
  const { context, page } = await createFixture({
    body: `<main data-app-shell-main-surface="browser">
      ${libraryToolbar()}
      ${listItem('libfile_11', 'Pasted first.txt')}
      ${listItem('libfile_12', 'Project notes.txt')}
    </main>`,
  });
  try {
    await page.waitForFunction(() => {
      const control = document.querySelector('[data-csp-library-pasted-toggle="true"]');
      return control?.nextElementSibling?.matches('[data-menu="0"]');
    });
    const initial = await page.evaluate(() => {
      const control = document.querySelector('[data-csp-library-pasted-toggle="true"]');
      const button = control.querySelector('button');
      return {
        count: document.querySelectorAll('[data-csp-library-pasted-toggle="true"]').length,
        pressed: button.getAttribute('aria-pressed'),
        label: button.getAttribute('aria-label'),
        title: button.title,
        visibleLabel: control.textContent.trim(),
        placement: control.nextElementSibling?.getAttribute('data-menu'),
      };
    });
    assert.equal(initial.count, 1);
    assert.equal(initial.pressed, 'true');
    assert.match(initial.label, /Hide files in the Library/);
    assert.equal(initial.title, initial.label);
    assert.equal(initial.visibleLabel, 'Hide Pasted Files');
    assert.equal(initial.placement, '0');

    const scanCount = await page.evaluate(() => window.__libraryCollectCount);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.__libraryCollectCount), scanCount);

    const replacementToolbar = libraryToolbar({
      assetHash: 'different',
      wrapper: 'replaced-controls',
    });
    await page.locator('[data-toolbar-fixture]').evaluate((element, html) => {
      element.outerHTML = html;
    }, replacementToolbar);
    await page.waitForFunction(() => {
      const control = document.querySelector('[data-csp-library-pasted-toggle="true"]');
      return (
        document.querySelectorAll('[data-csp-library-pasted-toggle="true"]').length === 1 &&
        control?.nextElementSibling?.matches('[data-menu="0"]') &&
        document
          .querySelector('[data-toolbar-fixture] use')
          ?.getAttribute('href')
          ?.includes('different')
      );
    });

    const normalItem = page.locator('[data-library-selection-id="libfile_12"]');
    await normalItem.evaluate((item) => {
      item
        .querySelector('[data-library-column="name"] button')
        .setAttribute('aria-label', 'Pasted renamed.txt');
    });
    await page.waitForFunction(() =>
      document.querySelector(
        '[data-library-selection-id="libfile_12"][data-csp-library-pasted-hidden]',
      ),
    );
    await normalItem.evaluate((item) => {
      item
        .querySelector('[data-library-column="name"] button')
        .setAttribute('aria-label', 'Renamed project.txt');
    });
    await page.waitForFunction(
      () =>
        !document.querySelector(
          '[data-library-selection-id="libfile_12"][data-csp-library-pasted-hidden]',
        ),
    );

    await page
      .locator('[data-view-buttons] button')
      .first()
      .evaluate((button) => {
        button.addEventListener('click', () => {
          button.setAttribute('aria-pressed', 'false');
          button.nextElementSibling.setAttribute('aria-pressed', 'true');
        });
      });
    await page
      .locator('[data-view-buttons] button')
      .last()
      .evaluate((button) => {
        button.addEventListener('click', () => {
          button.setAttribute('aria-pressed', 'false');
          button.previousElementSibling.setAttribute('aria-pressed', 'true');
        });
      });
    for (let index = 0; index < 3; index += 1) {
      await page.locator('[data-view-buttons] button').last().click();
      await page.locator('[data-view-buttons] button').first().click();
    }
    assert.equal(await page.locator('[data-csp-library-pasted-toggle="true"]').count(), 1);
    assert.equal(
      await page
        .locator('[data-csp-library-pasted-toggle="true"]')
        .evaluate((control) => control.nextElementSibling.getAttribute('data-menu')),
      '0',
    );
  } finally {
    await context.close();
  }
});

test('new and reused Library items are rechecked after identity and filename changes', async () => {
  const { context, page } = await createFixture({
    body:
      '<main data-app-shell-main-surface="browser">' +
      libraryToolbar() +
      listItem('libfile_61', 'Project notes.txt') +
      '</main>',
  });
  try {
    await page.waitForFunction(() =>
      document.querySelector('[data-csp-library-pasted-button="true"]'),
    );
    await page.locator('main').evaluate(
      (main, markup) => {
        main.insertAdjacentHTML('beforeend', markup);
      },
      listItem('libfile_62', 'Pasted added.txt'),
    );
    await page.waitForFunction(() =>
      document.querySelector(
        '[data-library-selection-id="libfile_62"][data-csp-library-pasted-hidden]',
      ),
    );

    await page.locator('[data-library-selection-id="libfile_62"]').evaluate((item) => {
      item.setAttribute('data-library-selection-id', 'libfile_63');
      const name = item.querySelector('[data-library-column="name"] button');
      name.setAttribute('aria-label', 'Project reused.txt');
      name.textContent = 'Project reused.txt';
    });
    await page.waitForFunction(
      () =>
        !document.querySelector(
          '[data-library-selection-id="libfile_63"][data-csp-library-pasted-hidden]',
        ),
    );

    await page.locator('[data-library-selection-id="libfile_63"]').evaluate((item) => {
      item.setAttribute('data-library-selection-id', 'libfile_64');
      const name = item.querySelector('[data-library-column="name"] button');
      name.setAttribute('aria-label', 'Pasted reused.txt');
      name.textContent = 'Pasted reused.txt';
    });
    await page.waitForFunction(() =>
      document.querySelector(
        '[data-library-selection-id="libfile_64"][data-csp-library-pasted-hidden]',
      ),
    );
  } finally {
    await context.close();
  }
});

test('ambiguous toolbar menus fail open and a unique structural fallback recovers the control', async () => {
  const { context, page } = await createFixture({
    enabled: false,
    body: `<main data-app-shell-main-surface="browser">
      ${libraryToolbar({ filterCount: 2, filterSymbol: 'unknown-symbol' })}
      ${listItem('libfile_21', 'Pasted file.txt')}
    </main>`,
  });
  try {
    await page.waitForFunction(() => document.querySelector('style#csp-library-hide-pasted-style'));
    await page.waitForTimeout(320);
    assert.equal(await page.locator('[data-csp-library-pasted-toggle="true"]').count(), 0);
    assert.equal(
      await page
        .locator('[data-library-selection-id="libfile_21"]')
        .evaluate((item) => getComputedStyle(item).display),
      'block',
    );

    await page.locator('[data-menu="1"]').evaluate((menu) => menu.remove());
    await page
      .locator('[data-menu="0"] use')
      .evaluate((use) => use.setAttribute('href', '/cdn/new-icons.svg#changed-symbol'));
    await page.waitForFunction(() => {
      const control = document.querySelector('[data-csp-library-pasted-toggle="true"]');
      return control?.nextElementSibling?.matches('[data-menu="0"]');
    });
    assert.equal(await page.locator('[data-csp-library-pasted-toggle="true"]').count(), 1);
    assert.equal(
      await page.locator('[data-csp-library-pasted-button="true"]').getAttribute('aria-pressed'),
      'false',
    );
  } finally {
    await context.close();
  }
});

test('button-driven Library entry, back/forward, and main replacement reconcile state', async () => {
  const { context, page } = await createFixture({
    enabled: false,
    path: '/c/start',
    body: `<nav role="navigation" aria-label="Primary">
      <button id="library-nav" type="button">Library</button>
    </nav>
    <main data-app-shell-main-surface="browser">Conversation view</main>`,
  });
  try {
    assert.equal(await page.evaluate(() => window.__libraryCollectCount), 0);
    await page.locator('#library-nav').evaluate(
      (button, markup) => {
        button.addEventListener('click', () => {
          history.pushState({}, '', '/library');
          setTimeout(() => {
            document.querySelector('main').innerHTML = markup;
          }, 120);
        });
      },
      `${libraryToolbar()}${listItem('libfile_31', 'Pasted route-entry.txt')}`,
    );
    await page.locator('#library-nav').click();
    await page.waitForFunction(
      () =>
        location.pathname === '/library' &&
        document.querySelector('[data-csp-library-pasted-toggle="true"]'),
    );
    assert.equal(await page.evaluate(() => window.__libraryCollectCount), 0);
    assert.equal(
      await page
        .locator('[data-library-selection-id="libfile_31"]')
        .evaluate((item) => getComputedStyle(item).display),
      'block',
    );

    await page.locator('[data-csp-library-pasted-button="true"]').press('Enter');
    await page.waitForFunction(() =>
      document.querySelector(
        '[data-library-selection-id="libfile_31"][data-csp-library-pasted-hidden]',
      ),
    );
    assert.equal(await page.evaluate(() => window.__librarySetting), true);

    await page.goBack();
    await page.waitForFunction(() => location.pathname === '/c/start');
    await page.waitForFunction(
      () => !document.querySelector('[data-csp-library-pasted-toggle="true"]'),
    );
    assert.equal(
      await page
        .locator('[data-library-selection-id="libfile_31"]')
        .evaluate((item) => getComputedStyle(item).display),
      'block',
    );

    await page.goForward();
    await page.waitForFunction(
      () =>
        location.pathname === '/library' &&
        document.querySelector('[data-csp-library-pasted-toggle="true"]') &&
        document.querySelector(
          '[data-library-selection-id="libfile_31"][data-csp-library-pasted-hidden]',
        ),
    );

    await page.locator('main').evaluate(
      (main, markup) => {
        main.outerHTML = `<main data-app-shell-main-surface="browser">${markup}</main>`;
      },
      `${libraryToolbar({ assetHash: 'root-replaced', wrapper: 'new-wrapper' })}${listItem('libfile_32', 'Pasted replacement-root.txt')}`,
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-csp-library-pasted-toggle="true"]')
          ?.nextElementSibling?.matches('[data-menu="0"]') &&
        document.querySelector(
          '[data-library-selection-id="libfile_32"][data-csp-library-pasted-hidden]',
        ),
    );
    assert.equal(await page.locator('[data-csp-library-pasted-toggle="true"]').count(), 1);
    assert.equal(await page.evaluate(() => window.__librarySetting), true);
  } finally {
    await context.close();
  }
});

test('popup sync updates the toggle and filtering; a failed storage write rolls back', async () => {
  const { context, page } = await createFixture({
    enabled: false,
    body: `<main data-app-shell-main-surface="browser">
      ${libraryToolbar()}
      ${listItem('libfile_41', 'Pasted storage.txt')}
    </main>`,
  });
  try {
    await page.waitForFunction(() =>
      document.querySelector('[data-csp-library-pasted-toggle="true"]'),
    );
    assert.equal(await page.evaluate(() => window.__libraryCollectCount), 0);
    await page.evaluate(() => {
      window.__failNextLibraryWrite = true;
    });
    await page.locator('[data-csp-library-pasted-button="true"]').press('Space');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-csp-library-pasted-button="true"]')
          ?.getAttribute('aria-pressed') === 'false',
    );
    assert.equal(await page.evaluate(() => window.__librarySetting), false);
    const scansAfterRollback = await page.evaluate(() => window.__libraryCollectCount);
    assert.equal(scansAfterRollback, 1);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__libraryCollectCount), scansAfterRollback);
    assert.equal(
      await page
        .locator('[data-library-selection-id="libfile_41"]')
        .evaluate((item) => getComputedStyle(item).display),
      'block',
    );

    await page.evaluate(() => window.__notifyLibrarySetting(true));
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-csp-library-pasted-button="true"]')
          ?.getAttribute('aria-pressed') === 'true' &&
        document.querySelector(
          '[data-library-selection-id="libfile_41"][data-csp-library-pasted-hidden]',
        ),
    );
    await page.evaluate(() => window.__notifyLibrarySetting(false));
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-csp-library-pasted-button="true"]')
          ?.getAttribute('aria-pressed') === 'false' &&
        !document.querySelector(
          '[data-library-selection-id="libfile_41"][data-csp-library-pasted-hidden]',
        ),
    );
    await page.evaluate(() => window.__notifyLibrarySetting(true));
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-csp-library-pasted-button="true"]')
          ?.getAttribute('aria-pressed') === 'true' &&
        document.querySelector(
          '[data-library-selection-id="libfile_41"][data-csp-library-pasted-hidden]',
        ),
    );
  } finally {
    await context.close();
  }
});

test('a delayed failed write still rolls back after leaving Library', async () => {
  const { context, page } = await createFixture({
    enabled: false,
    holdWrites: true,
    body: `<main data-app-shell-main-surface="browser">
      ${libraryToolbar()}
      ${listItem('libfile_51', 'Pasted delayed.txt')}
    </main>`,
  });
  try {
    await page.waitForFunction(() =>
      document.querySelector('[data-csp-library-pasted-button="true"]'),
    );
    await page.locator('[data-csp-library-pasted-button="true"]').press('Space');
    await page.waitForFunction(() =>
      document.querySelector(
        '[data-library-selection-id="libfile_51"][data-csp-library-pasted-hidden]',
      ),
    );
    await page.evaluate(() => {
      history.pushState({}, '', '/chat');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForFunction(
      () =>
        location.pathname === '/chat' &&
        !document.querySelector('[data-csp-library-pasted-toggle="true"]'),
    );
    await page.evaluate(() => window.__failPendingLibraryWrite());

    await page.evaluate(() => {
      history.pushState({}, '', '/library');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForFunction(
      () =>
        location.pathname === '/library' &&
        document
          .querySelector('[data-csp-library-pasted-button="true"]')
          ?.getAttribute('aria-pressed') === 'false',
    );
    assert.equal(await page.evaluate(() => window.__librarySetting), false);
    assert.equal(
      await page
        .locator('[data-library-selection-id="libfile_51"]')
        .evaluate((item) => getComputedStyle(item).display),
      'block',
    );
  } finally {
    await context.close();
  }
});

test('extension context invalidation removes the toggle and restores grid layout', async () => {
  const { context, page } = await createFixture({
    enabled: false,
    body:
      '<main data-app-shell-main-surface="browser">' +
      libraryToolbar() +
      '<div id="masonry" style="display:grid;grid-template-columns:repeat(2,100px);height:300px">' +
      gridItem('libfile_71', 'Pasted invalidated.txt', '1 / 1') +
      gridItem('libfile_72', 'Project notes.txt', '1 / 2') +
      '</div></main>',
  });
  try {
    await page.waitForFunction(() =>
      document.querySelector('[data-csp-library-pasted-button="true"]'),
    );
    await page.evaluate(() => {
      window.__failNextLibraryWrite = true;
      window.__writeFailureMessage = 'Extension context invalidated.';
    });
    await page.locator('[data-csp-library-pasted-button="true"]').press('Space');
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-csp-library-pasted-toggle="true"]') &&
        !document.querySelector('[data-csp-library-pasted-hidden]') &&
        !document.querySelector('[data-csp-library-pasted-masonry-flow]'),
    );
    const layout = await page.locator('#masonry').evaluate((masonry) => ({
      height: masonry.style.height,
      childStyles: [...masonry.children].map((item) => ({
        gridArea: item.style.gridArea,
        transform: item.style.transform,
      })),
    }));
    assert.equal(layout.height, '300px');
    assert.deepEqual(layout.childStyles, [
      { gridArea: '1 / 1', transform: 'translateY(24px)' },
      { gridArea: '1 / 2', transform: 'translateY(24px)' },
    ]);
  } finally {
    await context.close();
  }
});
