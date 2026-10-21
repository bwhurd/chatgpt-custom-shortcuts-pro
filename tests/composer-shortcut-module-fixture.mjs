import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { extractFastRuntime } from './playwright/lib/shortcut-fast-cases.mjs';
import { readInstalledTargets } from './playwright/lib/shortcut-target-inspection.mjs';

const moduleSource = await readFile(
  new URL('../extension/shortcuts/composer.js', import.meta.url),
  'utf8',
);
const passive = vm.createContext({});
vm.runInContext(moduleSource, passive);
assert.equal(
  typeof passive.CSPShortcuts.composer.create,
  'function',
  'module loads without DOM, storage, timers or listeners',
);
passive.CSPShortcuts.inspect = (actionId) => ({ actionId, status: 'ready' });
const installedRows = vm.runInContext(
  `(${readInstalledTargets.toString()})(['shortcutKeyActivateInput','shortcutKeyStudy'], ${JSON.stringify({ composer: passive.CSPShortcuts.composer.sourceSignature })})`,
  passive,
);
assert.equal(installedRows.length, 2);
assert.equal(
  installedRows.every((row) => row.status === 'ready'),
  true,
  'existing inspection collector routes both composer actions',
);
const content = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const runtime = await extractFastRuntime(content, 'shortcutKeyStudy');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`
    <div contenteditable="true" role="textbox" id="wrong">Wrong editor</div>
    <form data-thread-find-composer="true">
      <div hidden class="ProseMirror" contenteditable="true" role="textbox">Hidden</div>
      <div aria-disabled="true" class="ProseMirror" contenteditable="true" role="textbox">Disabled</div>
      <div id="composer" class="ProseMirror" contenteditable="true" role="textbox"><p>Keep <b>my draft</b></p></div>
      <button type="button" id="plus" data-composer-navigation-target="add-context">Plus</button>
      <div id="footer" data-composer-footer-responsive></div>
    </form>
  `);
  await page.addScriptTag({
    content: `${runtime.source}\nwindow.pilot = composerShortcutActions;`,
  });
  await page.evaluate(() => {
    window.clicks = [];
    window.allowStudy = true;
    const input = document.getElementById('composer');
    window.originalDraftHtml = input.innerHTML;
    document.getElementById('plus').onclick = () => {
      window.clicks.push('plus');
      document.querySelector('[role="menu"]')?.remove();
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div role="menu"><button type="button" role="menuitem" data-list-navigation-item="true" hidden id="study"><svg><use href="#book-open-light-20"></use></svg>Study</button></div>',
      );
      document.getElementById('study').onclick = () => {
        window.clicks.push('study');
        input.innerHTML = window.originalDraftHtml;
        document.querySelector('[role="menu"]').remove();
        document.getElementById('footer').innerHTML =
          '<button type="button" id="selected"><svg><use href="#book-open-light-20"></use></svg>Study</button>';
        document.getElementById('selected').onclick = (event) => {
          window.clicks.push('remove');
          event.currentTarget.remove();
        };
      };
    };
    input.addEventListener('input', () => {
      const item = document.getElementById('study');
      if (item) item.hidden = !window.allowStudy || !input.innerText.endsWith('study');
    });
  });
  assert.equal(await page.evaluate(() => window.pilot.focus()), true);
  assert.equal(await page.locator('#composer').innerHTML(), '<p>Keep <b>my draft</b></p>');
  assert.equal(
    await page.evaluate(() => {
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(document.getElementById('composer'));
      range.setEnd(selection.focusNode, selection.focusOffset);
      return range.toString().length === document.getElementById('composer').textContent.length;
    }),
    true,
    'focus places caret at end without changing the draft',
  );
  await page.evaluate(() =>
    document.body.insertAdjacentHTML(
      'beforeend',
      '<form data-chatgpt-composer><div id="second" data-composer-markdown contenteditable="true" role="textbox">Second draft</div></form>',
    ),
  );
  await page.locator('#composer').evaluate((element) => element.blur());
  assert.equal(await page.evaluate(() => window.pilot.inspect().diagnostic.status), 'ambiguous');
  assert.equal(await page.evaluate(() => window.pilot.focus()), false);
  await page.locator('#second').focus();
  assert.equal(
    await page.evaluate(() => window.pilot.focus() && document.activeElement.id === 'second'),
    true,
  );
  await page.locator('#second').evaluate((element) => element.closest('form').remove());
  await page.locator('#plus').focus();
  const before = await page.locator('body').innerHTML();
  assert.equal(
    await page.evaluate(() => window.pilot.inspect('composer-study-action').diagnostic.status),
    'needs-state',
  );
  assert.equal(
    await page.locator('body').innerHTML(),
    before,
    'inspection does not open a menu or insert query text',
  );
  assert.deepEqual(await page.evaluate(() => window.clicks), []);
  const outcomes = await page.evaluate(() =>
    Promise.all([window.pilot.study(), window.pilot.study()]),
  );
  assert.equal(outcomes[0].status, 'activated');
  assert.equal(outcomes[1].status, 'busy');
  assert.deepEqual(await page.evaluate(() => window.clicks), ['plus', 'study']);
  assert.equal(await page.locator('#composer').innerHTML(), '<p>Keep <b>my draft</b></p>');
  assert.equal(
    await page.evaluate(() => window.pilot.inspect('composer-study-action').diagnostic.reason),
    'study-selected',
  );
  await page.evaluate(() => window.pilot.study());
  assert.equal(await page.locator('#selected').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.clicks), ['plus', 'study', 'remove']);

  await page.evaluate(() => {
    window.allowStudy = false;
  });
  assert.equal((await page.evaluate(() => window.pilot.study())).status, 'timeout');
  assert.equal(
    await page.locator('#composer').innerHTML(),
    '<p>Keep <b>my draft</b></p>',
    'timeout restores exactly the owned draft markup',
  );
  const changed = await page.evaluate(async () => {
    const pending = window.pilot.study();
    setTimeout(() => document.getElementById('composer').append(' new typing'), 20);
    return pending;
  });
  assert.equal(changed.status, 'timeout');
  assert.match(
    await page.locator('#composer').innerText(),
    /new typing$/,
    'timeout never overwrites concurrent typing',
  );

  await page.evaluate(() => {
    document.getElementById('composer').innerHTML = window.originalDraftHtml;
    document.querySelector('[role="menu"]')?.remove();
    window.allowStudy = true;
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div role="menu"><button role="menuitem" data-list-navigation-item="true" id="candidate-a"><svg><use href="#book-open-light-16"></use></svg>A</button><button role="menuitem" data-list-navigation-item="true" id="candidate-b"><svg><use href="#book-open-light-20"></use></svg>B</button></div>',
    );
    window.clicks = [];
  });
  assert.equal(
    await page.evaluate(() => window.pilot.inspect('composer-study-action').diagnostic.status),
    'ambiguous',
  );
  assert.equal((await page.evaluate(() => window.pilot.study())).ok, false);
  assert.deepEqual(await page.evaluate(() => window.clicks), []);
  await page.locator('#candidate-b').evaluate((element) => {
    element.disabled = true;
  });
  assert.equal(
    await page.evaluate(() => window.pilot.inspect('composer-study-action').element.id),
    'candidate-a',
  );
  await page.locator('#candidate-a').evaluate((element) => {
    element.hidden = true;
  });
  assert.equal(
    await page.evaluate(() => window.pilot.inspect('composer-study-action').diagnostic.status),
    'needs-state',
  );
  console.log(
    'Composer module passed: passive import, active-form focus/caret, ambiguity, read-only inspection, Study add/remove, one execution, timeout restoration and concurrent draft preservation.',
  );
} finally {
  await browser.close();
}
