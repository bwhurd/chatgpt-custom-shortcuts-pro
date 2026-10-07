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
    const path = {
      shortcutKeyToggleDictate: 'M12.4584 8.96973',
      shortcutKeyStopAndTranscribeDictation: 'M13.0834 3.91846',
      shortcutKeyCancelDictation: 'M14.779 4.27903',
      shortcutKeyMoreDotsReadAloud: 'M9.75122 4.09203',
    }[item.actionId];
    const control = `<button type="button" id="media-target" aria-pressed="false"><svg><path d="${path}" /></svg>Intended</button>`;
    await page.setContent(
      `<input id="search"><button id="outside-target" type="button"><svg><path d="${path}" /></svg>Outside</button>${aloud ? `<section data-testid="conversation-turn-1"><div class="turn-action-controls">${control}</div></section>` : `<form data-thread-find-composer="true">${control}<button type="button" id="send-distractor">Send</button></form>`}`,
    );
    await page.evaluate(
      ({ aloud }) => {
        window.fixtureClicks = [];
        for (const button of document.querySelectorAll('button'))
          button.onclick = () => {
            window.fixtureClicks.push(button.id);
            if (button.id === 'media-target') {
              button.setAttribute(
                'aria-pressed',
                button.getAttribute('aria-pressed') === 'false' ? 'true' : 'false',
              );
              if (aloud) button.querySelector('path').setAttribute('d', 'M0 0');
            }
          };
      },
      { aloud },
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
