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
    const triggerSymbol = branch
      ? 'ellipsis-horizontal-light-16'
      : 'arrows-clockwise-rotate-lg-light-16';
    const actionSymbol = branch ? 'branch-light-16' : 'arrows-clockwise-rotate-lg-light-16';
    const decoyTriggerSymbol = branch
      ? 'arrows-clockwise-rotate-lg-light-16'
      : 'ellipsis-horizontal-light-16';
    const triggerIcon = gpt
      ? '<svg><path d="M15.6981 9.04712" /><path d="M4.69806 9.04712" /><path d="M10.2003 9.04712" /></svg>'
      : `<svg><use href="#${triggerSymbol}" /></svg>`;
    const decoyTriggerIcon = gpt
      ? ''
      : `<button id="decoy-trigger"><svg><use href="#${decoyTriggerSymbol}" /></svg></button>`;
    await page.setContent(
      `<input id="search"><section class="turn-action-controls"><button id="radix-trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="native-menu">${triggerIcon}</button>${decoyTriggerIcon}</section><div id="thread-bottom" style="position:fixed;top:650px"></div>`,
    );
    await page.evaluate(
      ({ actionSymbol, gpt }) => {
        window.fixtureClicks = [];
        const trigger = document.querySelector('#radix-trigger');
        trigger.addEventListener(gpt ? 'click' : 'keyup', (e) => {
          if (!gpt && e.code !== 'Space') return;
          window.fixtureClicks.push('trigger');
          trigger.setAttribute('aria-expanded', 'true');
          document.body.insertAdjacentHTML(
            'beforeend',
            `<div role="menu" id="native-menu" data-radix-menu-content data-state="open" aria-labelledby="radix-trigger"><div role="menuitem" id="decoy-arrow-up"><svg><use href="#arrow-up-md-light-16" /></svg></div><div role="menuitem" id="native-action"><svg>${gpt ? `<path d="M2.6687 11.333V8.66699C2.6687" />` : `<use href="#${actionSymbol}" />`}</svg></div><div role="menuitem" id="decoy-globe"><svg><use href="#globe-slash-light-16" /></svg></div><input id="feedback" name="contextual-retry-feedback" value="Improve answer"></div>`,
          );
          document.querySelectorAll('[role="menuitem"]').forEach((item) => {
            item.onclick = () => window.fixtureClicks.push(item.id);
          });
        });
      },
      { actionSymbol, gpt },
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
          : window.fixtureClicks.includes('native-action'),
      feedback,
      { timeout: 2000 },
    );
    const observed = await page.evaluate(() => ({
      clicks: window.fixtureClicks,
      focus: document.activeElement.id,
      caret: document.activeElement.selectionStart,
    }));
    assert.deepEqual(observed.clicks, feedback ? ['trigger'] : ['trigger', 'native-action']);
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
