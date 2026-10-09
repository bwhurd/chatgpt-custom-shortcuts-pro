import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { extractFastRuntime } from './shortcut-fast-cases.mjs';

export async function runMediaCase(context, content, item, started) {
  const begin = performance.now();
  const row = {
    actionId: item.actionId,
    type: item.type,
    attempted: true,
    status: 'fail',
    proofScope: 'fixture-keyboard',
    startedMs: begin - started,
    pathScope:
      'Real native-control routing and DOM state/retained target; isolated button effects only. Microphone, transcription and playback are unverified external effects.',
  };
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const aloud = item.actionId === 'shortcutKeyMoreDotsReadAloud';
    const toggleDictation = item.actionId === 'shortcutKeyToggleDictate';
    const path = {
      shortcutKeyToggleDictate: 'M12.4584 8.96973',
      shortcutKeyStopAndTranscribeDictation: 'M13.0834 3.91846',
      shortcutKeyCancelDictation: 'M14.779 4.27903',
      shortcutKeyMoreDotsReadAloud: 'M9.75122 4.09203',
    }[item.actionId];
    const symbol = {
      shortcutKeyToggleDictate: '#microphone-light-16',
      shortcutKeyStopAndTranscribeDictation: '#stop-fill-light-20',
      shortcutKeyCancelDictation: '#xmark-lg-light-20',
    }[item.actionId];
    const icon = symbol
      ? `<svg><use href="/assets/sprite.svg${symbol}"></use></svg>`
      : `<svg><path d="${path}" /></svg>`;
    const control = `<button id="media-target" aria-pressed="false">${icon}</button>`;
    const composerDistractors = symbol
      ? '<button id="ordinary-send-distractor"><svg><use href="/assets/sprite.svg#arrow-up-lg-light-20"></use></svg></button><button id="voice-distractor"><svg><use href="/assets/sprite.svg#voice-regular-20"></use></svg></button>'
      : '<button id="send-distractor">Send</button>';
    const outsideDictationTarget = symbol
      ? `<button id="outside-target"><svg><use href="/assets/sprite.svg${symbol}"></use></svg></button>`
      : `<button id="outside-target" type="button"><svg><path d="${path}" /></svg></button>`;
    await page.setContent(
      `<input id="search">${outsideDictationTarget}${aloud ? `<section data-testid="conversation-turn-1"><div class="turn-action-controls">${control}</div></section>` : `<form data-chatgpt-composer="" data-thread-find-composer="true">${composerDistractors}${control}</form>`}`,
    );
    await page.evaluate(
      ({ aloud, toggleDictation }) => {
        window.fixtureClicks = [];
        for (const form of document.querySelectorAll('form'))
          form.addEventListener('submit', (event) => event.preventDefault());
        for (const button of document.querySelectorAll('button'))
          button.onclick = () => {
            window.fixtureClicks.push(button.id);
            if (button.id === 'media-target') {
              button.setAttribute(
                'aria-pressed',
                button.getAttribute('aria-pressed') === 'false' ? 'true' : 'false',
              );
              if (aloud) button.querySelector('path').setAttribute('d', 'M0 0');
              if (toggleDictation)
                button
                  .querySelector('use')
                  .setAttribute('href', '/assets/sprite.svg#arrow-up-lg-light-20');
              if (toggleDictation) {
                const composer = button.closest('form');
                composer.querySelector('#ordinary-send-distractor')?.remove();
                for (const [id, symbol] of [
                  ['active-cancel', '#xmark-lg-light-20'],
                  ['active-stop', '#stop-fill-light-20'],
                ]) {
                  const control = document.createElement('button');
                  control.id = id;
                  control.innerHTML = `<svg><use href="/assets/sprite.svg${symbol}"></use></svg>`;
                  composer.append(control);
                }
              }
            }
          };
      },
      { aloud, toggleDictation },
    );
    const runtime = await extractFastRuntime(content, item.actionId);
    await page.addScriptTag({ content: runtime.source });
    const code = await page.evaluate((id) => window.CSP_SHORTCUTS_EFFECTIVE[id], item.actionId);
    await page.locator('#search').focus();
    await page.keyboard.press(`Alt+Shift+${code}`);
    assert.deepEqual(await page.evaluate(() => window.fixtureClicks), []);
    await page.keyboard.press(`Alt+${code}`);
    await page.waitForFunction(() => window.fixtureClicks.length > 0, null, { timeout: 2000 });
    assert.deepEqual(await page.evaluate(() => window.fixtureClicks), ['media-target']);
    if (toggleDictation) {
      await page.waitForTimeout(350);
      await page.keyboard.press(`Alt+${code}`);
      await page.waitForFunction(() => window.fixtureClicks.length === 2, null, { timeout: 2000 });
      assert.deepEqual(await page.evaluate(() => window.fixtureClicks), [
        'media-target',
        'media-target',
      ]);
      assert.equal(
        await page.locator('#media-target use').getAttribute('href'),
        '/assets/sprite.svg#arrow-up-lg-light-20',
      );
    }
    if (aloud) {
      await page.keyboard.press(`Alt+${code}`);
      assert.deepEqual(await page.evaluate(() => window.fixtureClicks), [
        'media-target',
        'media-target',
      ]);
      assert.equal(await page.locator('#media-target').getAttribute('aria-pressed'), 'false');
    }
    const observed = await page.evaluate(() => ({
      clicks: window.fixtureClicks,
      state: document.querySelector('#media-target').getAttribute('aria-pressed'),
    }));
    Object.assign(row, {
      status: 'pass',
      chord: `Alt+${code}`,
      targetStatus: 'present',
      dispatchStatus: 'pass',
      effectStatus: 'pass',
      observed,
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
