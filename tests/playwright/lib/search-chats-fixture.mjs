import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readSearchChatsPopup } from './search-chats-popup.mjs';
import { extractFastRuntime } from './shortcut-fast-cases.mjs';

const ACTION = 'shortcutKeySearchConversationHistory';

// Recorded from the native Search control on October 10, independently of runtime selectors.
const icon = (size) =>
  `<svg width="${size}" height="${size}"><use href="/cdn/assets/icons-fixture.svg#magnifying-glass-lg-light-${size}"></use></svg>`;

export async function runSearchChatsCase(context, content, item, started = performance.now()) {
  const begin = performance.now();
  const row = {
    actionId: ACTION,
    type: item.type,
    attempted: true,
    status: 'fail',
    proofScope: 'fixture-keyboard',
    bindingScope: 'isolated Alt+K assignment; installed storage is not read or changed',
    pathScope:
      'Real extracted listener and Search helpers against October 10 recorded sprites; controlled dialog completion, not current installed ChatGPT acceptance.',
    chord: 'Alt+KeyK',
    startedMs: begin - started,
    variants: [],
  };
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await page.setContent(
      `<form data-thread-find-composer="true"><div id="composer" class="ProseMirror" contenteditable="true" role="textbox">Preserve draft</div></form><button hidden id="hidden-search">${icon(16)}${icon(20)}</button><button disabled id="disabled-search">${icon(16)}${icon(20)}</button><button type="button" id="search-target">${icon(16)}</button><button type="button" id="search-distractor"><svg><use href="/cdn/assets/icons-fixture.svg#magnifying-glass-sm-light-16"></use></svg></button><div role="dialog" aria-modal="false" data-state="open">Unrelated dialog</div><div hidden role="dialog" aria-modal="true" data-state="open"><input role="combobox" aria-autocomplete="list" aria-expanded="true" placeholder="Search…" aria-controls="hidden-results"><div id="hidden-results" role="listbox"></div></div>`,
    );
    await page.evaluate(() => {
      window.searchProof = { clicks: [], keys: [] };
      for (const button of document.querySelectorAll('button')) {
        button.addEventListener('click', () => {
          window.searchProof.clicks.push(button.id);
          if (button.id !== 'search-target') return;
          const dialog = document.createElement('dialog');
          dialog.id = `search-popup-${window.searchProof.clicks.length}`;
          dialog.setAttribute('role', 'dialog');
          dialog.setAttribute('aria-modal', 'true');
          dialog.setAttribute('data-state', 'open');
          dialog.innerHTML = `<input id="${dialog.id}-input" role="combobox" aria-autocomplete="list" aria-expanded="true" placeholder="Search…" aria-controls="${dialog.id}-results"><div id="${dialog.id}-results" role="listbox"><div role="option">Fixture result</div></div>`;
          document.body.append(dialog);
          dialog.showModal();
          dialog.addEventListener('close', () => dialog.remove());
        });
      }
      // Runs after the runtime's capture handler, recording its final preventDefault state.
      document.addEventListener('keydown', (event) => {
        window.searchProof.keys.push({
          code: event.code,
          trusted: event.isTrusted,
          alt: event.altKey,
          control: event.ctrlKey,
          shift: event.shiftKey,
          meta: event.metaKey,
          prevented: event.defaultPrevented,
        });
      });
    });
    const runtime = await extractFastRuntime(content, ACTION);
    await page.addScriptTag({ content: runtime.source });
    await page.evaluate((action) => {
      window.CSP_SHORTCUTS_EFFECTIVE[action] = 'KeyK';
    }, ACTION);
    assert.deepEqual(pageErrors, [], 'Search runtime must initialize without errors');

    for (const size of [16, 20]) {
      await page.locator('#search-target').evaluate((button, markup) => {
        button.innerHTML = markup;
      }, icon(size));
      await page.locator('#composer').focus();
      const before = await page.evaluate(() => window.searchProof.clicks.length);
      assert.deepEqual(
        await page.evaluate(readSearchChatsPopup),
        [],
        'No preexisting Search popup',
      );
      for (const chord of ['k', 'Control+KeyK', 'Alt+Shift+KeyK', 'Alt+KeyL']) {
        await page.keyboard.press(chord);
        assert.deepEqual(
          await page.evaluate(readSearchChatsPopup),
          [],
          'Wrong chord cannot open Search',
        );
      }
      assert.equal(
        await page.evaluate(() => window.searchProof.clicks.length),
        before,
        'Wrong modifiers or keys must not activate Search',
      );
      // Plain k is intentionally typed during the negative probe; restore only fixture draft.
      await page.locator('#composer').fill('Preserve draft');
      await page.keyboard.press('Alt+KeyK');
      const observed = await page.evaluate(() => ({
        ...window.searchProof,
        draft: document.querySelector('#composer').textContent,
      }));
      assert.deepEqual(
        pageErrors,
        [],
        'Search dispatch must not fail through a missing extracted dependency',
      );
      const popups = await page.evaluate(readSearchChatsPopup);
      assert.equal(
        popups.length,
        1,
        'Alt+K must open a new visible Search popup with its linked listbox',
      );
      assert.deepEqual(
        observed.clicks.slice(before),
        ['search-target'],
        'Alt+K must activate exactly the intended visible Search button',
      );
      assert.deepEqual(
        observed.keys.at(-1),
        {
          code: 'KeyK',
          trusted: true,
          alt: true,
          control: false,
          shift: false,
          meta: false,
          prevented: true,
        },
        'A trusted Alt-only K must reach and be intercepted by the real listener',
      );
      assert.equal(
        observed.draft,
        'Preserve draft',
        'The shortcut must preserve the composer draft',
      );
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('dialog[open]') === null);
      assert.deepEqual(await page.evaluate(readSearchChatsPopup), [], 'Escape must dismiss Search');
      row.variants.push({ size, trustedAltK: true, clicks: ['search-target'], popup: popups[0] });
    }
    await page.locator('#search-target').evaluate((button) => {
      button.hidden = true;
    });
    await page.locator('#composer').focus();
    const beforeMissingTarget = await page.evaluate(() => window.searchProof.clicks.length);
    await page.keyboard.press('Alt+KeyK');
    assert.deepEqual(
      await page.evaluate(readSearchChatsPopup),
      [],
      'Absent actionable Search must not open a popup',
    );
    assert.equal(await page.evaluate(() => window.searchProof.clicks.length), beforeMissingTarget);
    assert.deepEqual(
      pageErrors,
      [],
      'Missing Search must not trigger an incomplete extracted fallback',
    );
    row.status = 'pass';
    row.targetStatus = 'present';
    row.dispatchStatus = 'pass';
    row.effectStatus = 'pass';
  } catch (error) {
    row.reason = error.message;
  } finally {
    row.pageErrors = pageErrors;
    row.durationMs = performance.now() - begin;
    await page.close();
  }
  return row;
}
