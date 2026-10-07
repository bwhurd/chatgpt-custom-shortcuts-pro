import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { extractFastRuntime } from './shortcut-fast-cases.mjs';

export async function runClipboardCase(context, content, item, started) {
  const begin = performance.now();
  const row = {
    actionId: item.actionId,
    type: item.type,
    attempted: true,
    status: 'fail',
    proofScope: 'fixture-keyboard',
    startedMs: begin - started,
    pathScope:
      'Real code collection, normalization and copy handler; in-memory clipboard boundary and toast observer. No OS clipboard or permission changes.',
  };
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const message = item.type !== 'clipboard-code';
    const all = item.type === 'clipboard-all';
    const expectedAll = all
      ? (
          await readFile(
            new URL('../../fixtures/copy-all-formatted-expected.txt', import.meta.url),
            'utf8',
          )
        ).trimEnd()
      : '';
    if (message)
      row.pathScope =
        'Real message selection, payload serializer and clipboard writer with an in-memory ClipboardItem boundary; native OS clipboard and permissions remain unverified.';
    await page.setContent(
      '<input id="search"><section data-message-author-role="user"><pre><code>User distractor</code></pre></section><section data-message-author-role="assistant"><pre><code>  one<br>two</code></pre><pre><code>three</code></pre></section><code>Inline distractor</code>',
    );
    if (message)
      await page.setContent(
        '<input id="search"><section data-testid="conversation-turn-0" data-turn="user"><div data-message-author-role="user"><div class="whitespace-pre-wrap">Older user</div></div></section><section data-testid="conversation-turn-1" data-turn="assistant"><div data-message-author-role="assistant"><div class="markdown"><p>Intended assistant</p></div></div></section><div id="thread-bottom" style="position:fixed;top:650px"></div>',
      );
    if (item.type === 'clipboard-lowest')
      await page.evaluate(() => {
        document
          .querySelector('[data-testid="conversation-turn-1"]')
          .insertAdjacentHTML(
            'beforeend',
            '<div class="turn-action-controls"><button data-testid="copy-turn-action-button" id="copy-target"><svg><path d="M13.468 11.1216" /></svg>Copy</button></div>',
          );
      });
    if (all)
      await page.setContent(
        await readFile(
          new URL('../../fixtures/copy-all-formatted-conversation.html', import.meta.url),
          'utf8',
        ),
      );
    if (all)
      await page.evaluate(() => {
        const templates = Array.from(document.querySelectorAll('section'));
        const turns = Array.from({ length: 24 }, (_, index) => {
          const turn = templates[index % templates.length].cloneNode(true);
          turn.dataset.testid = `conversation-turn-${index}`;
          turn.style.height = '160px';
          return turn;
        });
        for (const turn of templates) turn.remove();
        const scroller = document.createElement('div');
        scroller.className = 'thread-scroll-container';
        scroller.id = 'copy-scroll';
        scroller.style.cssText = 'height:150px;overflow:auto;position:relative';
        scroller.append(...turns.slice(20));
        document.body.appendChild(scroller);
        scroller.scrollTop = 80;
        window.fixtureOriginalAnchorOffset =
          turns[20].getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        window.doNotIncludeLabelsCheckbox = false;
        window.fixtureLazyBatches = 0;
        const pending = turns.slice(0, 20);
        let loading = false;
        scroller.addEventListener('scroll', () => {
          if (scroller.scrollTop !== 0 || loading || !pending.length) return;
          loading = true;
          setTimeout(() => {
            scroller.prepend(...pending.splice(-4));
            window.fixtureLazyBatches++;
            loading = false;
          }, 75);
        });
        window.fixtureInitialTurnCount = scroller.querySelectorAll('section').length;
      });
    await page.evaluate(() => {
      window.fixtureClipboard = [];
      window.fixtureToasts = [];
      document.execCommand = () => {
        throw new Error('Native clipboard fallback is forbidden in this isolated fixture');
      };
      window.ClipboardItem = class {
        constructor(data) {
          this.data = data;
        }
      };
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          write: async (items) => {
            for (const item of items)
              window.fixtureClipboard.push(await item.data['text/plain'].text());
          },
          writeText: async (text) => {
            window.fixtureClipboard.push(text);
          },
        },
      });
    });
    const runtime = await extractFastRuntime(content, item.actionId);
    await page.addScriptTag({ content: runtime.source });
    const code = await page.evaluate((id) => window.CSP_SHORTCUTS_EFFECTIVE[id], item.actionId);
    await page.locator('#search').focus();
    await page.keyboard.press(`Alt+Shift+${code}`);
    assert.deepEqual(await page.evaluate(() => window.fixtureClipboard), []);
    await page.keyboard.press(`Alt+${code}`);
    await page.waitForFunction(() => window.fixtureClipboard.length > 0, null, {
      timeout: all ? 4000 : 2000,
    });
    const observed = await page.evaluate(() => ({
      payloads: window.fixtureClipboard,
      toasts: window.fixtureToasts,
    }));
    if (all) {
      await page.waitForFunction(
        () =>
          Math.abs(
            document.querySelector('[data-testid="conversation-turn-20"]').getBoundingClientRect()
              .top -
              document.querySelector('#copy-scroll').getBoundingClientRect().top -
              window.fixtureOriginalAnchorOffset,
          ) < 4,
        null,
        { timeout: 1000 },
      );
      const lazy = await page.evaluate(() => ({
        initial: window.fixtureInitialTurnCount,
        final: document.querySelectorAll('#copy-scroll section').length,
        batches: window.fixtureLazyBatches,
      }));
      assert.deepEqual(lazy, { initial: 4, final: 24, batches: 5 });
      row.pathScope =
        'Real copy-all preload with unchanged production waits, conversation payload/selection and scroll restoration; isolated rich clipboard boundary. Live lazy loading and OS clipboard remain unverified.';
      observed.restoredScrollTop = await page
        .locator('#copy-scroll')
        .evaluate((element) => element.scrollTop);
      observed.lazyLoading = lazy;
    }
    assert.deepEqual(observed.payloads, [
      all
        ? Array(6).fill(expectedAll).join('\n\n')
        : message
          ? 'Intended assistant'
          : '  one\ntwo\n\n--- --- ---\n\nthree',
    ]);
    if (message && !all)
      assert.equal(
        await page.evaluate(() => window.getSelection().toString()),
        'Intended assistant',
      );
    else if (!all) assert.deepEqual(observed.toasts, ['All code boxes copied to clipboard!']);
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
