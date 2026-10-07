import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { extractFastRuntime } from './shortcut-fast-cases.mjs';

export async function runResponseCase(context, content, item, started) {
  const begin = performance.now();
  const row = {
    actionId: item.actionId,
    type: item.type,
    attempted: true,
    status: 'fail',
    proofScope: 'fixture-keyboard',
    startedMs: begin - started,
    pathScope:
      'Real response-menu helper and default production delays; native menu click or feedback focus only. Generation and new-chat lineage require external proof.',
  };
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const branch = item.actionId === 'shortcutKeyMoreDotsBranchInNewChat';
    const feedback = item.actionId === 'shortcutKeyRegenerateAskToChangeResponse';
    const gpt = item.type === 'gpt-menu';
    const icon = gpt ? 'M12.1338 5.94433' : branch ? 'M3.33362 6.80811' : 'M14.0219 8.22363';
    await page.setContent(
      `<input id="search"><section class="turn-action-controls"><button id="radix-trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="native-menu"><svg><path d="${icon}" /></svg>Menu</button></section><div id="thread-bottom" style="position:fixed;top:650px"></div>`,
    );
    await page.evaluate(
      ({ branch, icon, gpt }) => {
        window.fixtureClicks = [];
        const trigger = document.querySelector('#radix-trigger');
        trigger.addEventListener(gpt ? 'click' : 'keyup', (e) => {
          if (!gpt && e.code !== 'Space') return;
          window.fixtureClicks.push('trigger');
          trigger.setAttribute('aria-expanded', 'true');
          document.body.insertAdjacentHTML(
            'beforeend',
            `<div role="menu" id="native-menu" data-radix-menu-content data-state="open" aria-labelledby="radix-trigger"><div role="menuitem" id="native-action"><svg><path d="${gpt ? 'M2.6687 11.333V8.66699C2.6687' : branch ? 'M11.6672 1.97461' : icon}" /></svg>Native action</div><input id="feedback" name="contextual-retry-feedback" value="Improve answer"></div>`,
          );
          document.querySelector('#native-action').onclick = () =>
            window.fixtureClicks.push('action');
        });
      },
      { branch, icon, gpt },
    );
    const runtime = await extractFastRuntime(content, item.actionId);
    await page.addScriptTag({ content: runtime.source });
    const code = await page.evaluate((id) => window.CSP_SHORTCUTS_EFFECTIVE[id], item.actionId);
    await page.locator('#search').focus();
    await page.keyboard.press(`Alt+Shift+${code}`);
    assert.deepEqual(await page.evaluate(() => window.fixtureClicks), []);
    await page.keyboard.press(`Alt+${code}`);
    await page.waitForFunction(
      (feedback) =>
        feedback
          ? document.activeElement.id === 'feedback'
          : window.fixtureClicks.includes('action'),
      feedback,
      { timeout: 2000 },
    );
    const observed = await page.evaluate(() => ({
      clicks: window.fixtureClicks,
      focus: document.activeElement.id,
      caret: document.activeElement.selectionStart,
    }));
    assert.deepEqual(observed.clicks, feedback ? ['trigger'] : ['trigger', 'action']);
    if (feedback) assert.equal(observed.caret, 'Improve answer'.length);
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
