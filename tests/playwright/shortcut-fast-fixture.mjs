import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  cleanupShareToastObserver,
  installShareToastObserver,
  readShareClipboardToastEvidence,
  waitForShareClipboardToast,
} from './lib/devscrape-wide-core.mjs';
import { runClipboardCase } from './lib/shortcut-clipboard-fixture.mjs';
import {
  CATALOGUE_RESULT_PATH,
  extractFastRuntime,
  fastReportOutcome,
  loadFastCatalogue,
  preflightFastCases,
  saveFastReport,
  selectFastCases,
  summarizeFastReport,
} from './lib/shortcut-fast-cases.mjs';
import { writeFastVisualReport } from './lib/shortcut-fast-visual-report.mjs';
import { runMediaCase } from './lib/shortcut-media-fixture.mjs';
import {
  extractModelPickerSource,
  runModelControlCase,
} from './lib/shortcut-model-controls-fixture.mjs';
import { runSlotCase } from './lib/shortcut-model-slots-fixture.mjs';
import { runUnassignedModelCase } from './lib/shortcut-model-unassigned-fixture.mjs';
import { runOverlayCase } from './lib/shortcut-overlay-fixture.mjs';
import { runResponseCase } from './lib/shortcut-response-fixture.mjs';
import { DEFAULT_TAB_LIMIT, settleTabPool } from './lib/shortcut-tab-pool.mjs';

const started = performance.now();
const args = process.argv.slice(2);
const getValues = (name) =>
  args.flatMap((value, index) => (value === name ? [args[index + 1]] : []));
let catalogue;
try {
  catalogue = await loadFastCatalogue();
} catch (error) {
  if (!args.includes('--catalog-only'))
    await writeFastVisualReport({
      rows: [],
      observations: [],
      summary: {},
      outcome: {
        status: 'failure',
        coverage: 'blocked-startup',
        checks: 'No checks ran',
        errors: [{ message: error.message }],
        warnings: [],
      },
    });
  console.error(
    JSON.stringify({
      status: 'failure',
      scope: 'blocked-startup',
      checks: 'No checks ran',
      reason: error.message,
    }),
  );
  process.exitCode = 1;
}
if (!catalogue) process.exit(1);
const { content, report } = catalogue;
const requested = getValues('--shortcut-action-id');
const types = getValues('--type');
const selected = selectFastCases(report, requested, types);
report.catalogueOnly = args.includes('--catalog-only');
const extracted = report.catalogueOnly
  ? new Map()
  : await preflightFastCases(report, selected, async (item) => {
      if (['model-slot', 'model-unassigned', 'model-control'].includes(item.type))
        extractModelPickerSource(content);
      if (['model-slot', 'model-unassigned'].includes(item.type)) return null;
      return extractFastRuntime(content, item.actionId);
    });
report.timings = { catalogueMs: performance.now() - started };
if (!args.includes('--catalog-only') && selected.length) {
  let browser;
  const boot = performance.now();
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    report.timings.browserStartupMs = performance.now() - boot;
    const context = await browser.newContext();
    await context.route('**/*', (route) => route.abort());
    const runCase = async (item) => {
      if (item.type === 'model-slot' || item.type === 'model-unassigned') {
        const row = await (item.type === 'model-slot' ? runSlotCase : runUnassignedModelCase)(
          context,
          content,
          item,
          started,
        );
        if (item.rowId === 'model:legacy:3:configure-latest')
          row.contractProofs = ['model-picker-slot-dispatch'];
        report.observations.push(row);
        return;
      }
      if (item.type === 'model-control') {
        report.observations.push(await runModelControlCase(context, content, item, started));
        return;
      }
      if (item.type === 'media-control') {
        report.observations.push(await runMediaCase(context, content, item, started));
        return;
      }
      if (
        item.type === 'clipboard-code' ||
        item.type === 'clipboard-message' ||
        item.type === 'clipboard-lowest' ||
        item.type === 'clipboard-all'
      ) {
        report.observations.push(await runClipboardCase(context, content, item, started));
        return;
      }
      if (item.type === 'response-menu' || item.type === 'gpt-menu') {
        report.observations.push(await runResponseCase(context, content, item, started));
        return;
      }
      if (item.type === 'overlay') {
        report.observations.push(await runOverlayCase(context, content, started));
        return;
      }
      // setContent does not reset global declarations/listeners. A fresh page
      // isolates the real extracted runtime while retaining one browser/context.
      const page = await context.newPage();
      let spawnedPage;
      const caseStarted = performance.now();
      const row = {
        actionId: item.actionId,
        type: item.type,
        proofScope: 'fixture-keyboard',
        attempted: true,
        status: 'fail',
        startedMs: caseStarted - started,
      };
      const pageErrors = [];
      let fileChooserObserved = false;
      const onFileChooser = (chooser) => {
        fileChooserObserved = true;
        void Promise.resolve()
          .then(() => chooser.setFiles([], { timeout: 1200 }))
          .catch(() => {
            pageErrors.push('File chooser input could not be cleared without uploading files.');
          });
      };
      const onPageError = (error) => pageErrors.push(error.message);
      page.on('pageerror', onPageError);
      if (item.actionId === 'shortcutKeyAddPhotosFiles') page.on('filechooser', onFileChooser);
      try {
        const runtime = extracted.get(item.actionId);
        if (item.type === 'new-tab') {
          await context.route('https://shortcut-fixture.invalid/', (route) =>
            route.fulfill({
              contentType: 'text/html',
              body: '<!doctype html><html><head><title>Fixture blank conversation</title></head><body>Blank fixture</body></html>',
            }),
          );
          await page.goto('https://shortcut-fixture.invalid/');
        }
        if (item.type === 'blank-mode') {
          await page.route('https://shortcut-fixture.invalid/', (route) =>
            route.fulfill({
              contentType: 'text/html',
              body: '<!doctype html><html><body></body></html>',
            }),
          );
          await page.goto('https://shortcut-fixture.invalid/');
        }
        const isNewConversation = item.type === 'new-conversation';
        if (isNewConversation) {
          await page.route('https://shortcut-fixture.invalid/**', (route) =>
            route.fulfill({
              contentType: 'text/html',
              body: '<!doctype html><html><body></body></html>',
            }),
          );
          await page.goto('https://shortcut-fixture.invalid/c/audit-owned-existing');
        }
        const existingTurns = isNewConversation
          ? Array.from({ length: 8 }, (_, index) => {
              const role = index % 2 === 0 ? 'user' : 'assistant';
              return `<article data-testid="conversation-turn-${index + 1}" data-turn="${role}"><p>Existing ${role} message ${index + 1}</p></article>`;
            }).join('')
          : '';
        const composerMarkup =
          item.type === 'control-gate'
            ? '<form id="native-composer"><div id="composer" class="ProseMirror" contenteditable="true" role="textbox">Draft</div></form>'
            : `<form data-thread-find-composer="true"><div hidden class="ProseMirror" contenteditable="true" role="textbox">Hidden distractor</div><div id="composer" class="ProseMirror" contenteditable="true" role="textbox"${isNewConversation ? ' style="min-height: 1em"' : ''}>${isNewConversation ? '' : 'Draft'}</div></form>`;
        await page.setContent(
          `<input id="search" role="textbox"><div contenteditable="true" role="textbox" id="edit">Edit distractor</div>${isNewConversation ? `<main id="thread-turns">${existingTurns}</main>` : ''}${composerMarkup}`,
        );
        if (item.type === 'new-tab') {
          await page.evaluate(() => {
            window.fixtureClicks = [];
          });
          row.pathScope =
            'real noopener popup at locally fulfilled root URL; no live conversation is created';
        }
        if (item.type === 'edit-submit') {
          await page.evaluate(() => {
            document.body.insertAdjacentHTML(
              'beforeend',
              '<section data-turn="user" data-testid="conversation-turn-0" class="rounded-3xl"><textarea>Older message</textarea><button type="submit" id="older-edit">Commit older</button></section><section data-turn="user" data-testid="conversation-turn-1" class="rounded-3xl"><textarea id="active-edit">Edited fixture message</textarea><button type="submit" id="commit-edit">Commit intended</button><button disabled type="submit" id="disabled-edit">Disabled</button></section><section data-turn="assistant" data-testid="conversation-turn-2" class="rounded-3xl"><textarea>Assistant distractor</textarea><button type="submit" id="assistant-edit">Unrelated</button></section><div id="thread-bottom" style="position:fixed;bottom:0"><textarea>Composer draft</textarea><button type="submit" id="composer-edit">Send</button></div>',
            );
            window.fixtureClicks = [];
            for (const button of document.querySelectorAll('button[type="submit"]'))
              button.onclick = () => {
                window.fixtureClicks.push(button.id);
                if (button.id === 'commit-edit')
                  document.querySelector('[data-testid="conversation-turn-1"]').dataset.committed =
                    document.querySelector('#active-edit').value;
              };
          });
          row.pathScope =
            'native fixture edit commit only; regeneration/network response remains omitted';
        }
        if (item.type === 'header-share') {
          await page.evaluate(() => {
            document.body.insertAdjacentHTML(
              'beforeend',
              '<button type="button" id="share-distractor"><svg><use href="#arrow-up-open-base-light-16"></use></svg>Unrelated</button><div data-testid="app-shell-header-context-menu-surface"><div data-app-shell-header-obstacle="true"><button type="button" id="share-target"><svg><use href="#arrow-up-open-base-light-16"></use></svg>Share</button></div></div>',
            );
            window.fixtureClicks = [];
            window.fixtureClipboard = '';
            window.fixtureClipboardWrites = [];
            Object.defineProperty(navigator, 'clipboard', {
              configurable: true,
              value: {
                readText: async () => window.fixtureClipboard,
                writeText: async (text) => {
                  window.fixtureClipboardWrites.push(String(text));
                  window.fixtureClipboard = String(text);
                },
              },
            });
            for (const button of document.querySelectorAll('[id^="share-"]'))
              button.onclick = () => {
                window.fixtureClicks.push(button.id);
                if (button.id === 'share-target') {
                  void (async () => {
                    await navigator.clipboard.writeText(
                      'https://chatgpt.com/share/fixture-owned-shortcut-id',
                    );
                    const notification = document.createElement('div');
                    const title = document.createElement('div');
                    const message = document.createElement('div');
                    notification.setAttribute('data-content', '');
                    title.setAttribute('data-title', '');
                    message.textContent = 'Public link copied';
                    title.append(message);
                    notification.append(title);
                    document.body.append(notification);
                  })();
                }
              };
          });
          await installShareToastObserver(page);
          row.shareBeforeProof = await readShareClipboardToastEvidence(page);
          assert.deepEqual(row.shareBeforeProof, {
            validShareLink: false,
            clipboardReadSucceeded: true,
            toastObserved: false,
          });
          row.pathScope =
            'Extracted Share shortcut must click the scoped header control; an owned synthetic callback writes a fixture-only canonical share URL and adds a fresh native-shaped notification.';
        }
        if (item.type === 'blank-mode') {
          await page.addScriptTag({
            path: fileURLToPath(
              new URL('../../extension/shared/model-picker-selectors.js', import.meta.url),
            ),
          });
          await page.evaluate(() => {
            document.body.insertAdjacentHTML(
              'beforeend',
              '<header hidden><div role="radiogroup"><button role="radio" aria-checked="true" id="hidden-chat">Hidden Chat</button><button role="radio" aria-checked="false" id="hidden-work">Hidden Work</button></div></header><header><div role="radiogroup" id="mode-group"><button role="radio" aria-checked="true" id="chat-mode">Chat</button><button role="radio" aria-checked="false" id="work-mode">Work</button></div></header>',
            );
            window.fixtureClicks = [];
            window.fixtureModeEvents = [];
            window.addEventListener('csp-chat-work-mode-changed', (event) =>
              window.fixtureModeEvents.push(event.detail.mode),
            );
            for (const button of document.querySelectorAll('[role="radio"]'))
              button.onclick = () => {
                window.fixtureClicks.push(button.id);
                for (const radio of button.parentElement.children)
                  radio.setAttribute('aria-checked', String(radio === button));
              };
          });
          row.pathScope =
            'blank route with mounted native radios; existing-chat navigation and model slot effects remain deferred';
        }
        if (item.type === 'new-conversation') {
          await page.evaluate(() => {
            document.body.dataset.conversationState = 'existing';
            document.body.insertAdjacentHTML(
              'afterbegin',
              '<div data-app-shell-titlebar><button type="button" data-testid="create-new-chat-button" aria-label="New chat"><svg width="16" height="16"><path d="M6.33325 1.80763" /></svg></button></div>',
            );
            window.fixtureClicks = [];
            document
              .querySelector('[data-app-shell-titlebar] button')
              .addEventListener('click', () => {
                window.fixtureClicks.push('new-chat-target');
                window.history.pushState({ fixture: 'blank-conversation' }, '', '/');
                document.querySelector('#thread-turns').replaceChildren();
                document.querySelector('#composer').replaceChildren();
                document.body.dataset.conversationState = 'blank-root';
              });
          });
          row.pathScope =
            'Synthetic eight-turn existing conversation with the source-recognized titlebar new-chat target; the extracted shortcut must transition it to the root with an empty visible composer.';
          row.newConversationSetupProof = await page.evaluate(() => ({
            route: window.location.pathname,
            turnCount: document.querySelectorAll(
              '#thread-turns [data-testid^="conversation-turn-"]',
            ).length,
            userTurns: document.querySelectorAll('#thread-turns [data-turn="user"]').length,
            assistantTurns: document.querySelectorAll('#thread-turns [data-turn="assistant"]')
              .length,
            composerVisible: document.querySelector('#composer').getBoundingClientRect().height > 0,
            composerEmpty: document.querySelector('#composer').innerText.trim() === '',
          }));
          assert.deepEqual(row.newConversationSetupProof, {
            route: '/c/audit-owned-existing',
            turnCount: 8,
            userTurns: 4,
            assistantTurns: 4,
            composerVisible: true,
            composerEmpty: true,
          });
        }
        if (item.type === 'direct-control') {
          await page.evaluate((newChat) => {
            const testId = newChat ? 'create-new-chat-button' : 'search-conversation-button';
            document.body.insertAdjacentHTML(
              'beforeend',
              `<button hidden data-testid="${testId}" id="hidden-direct">Hidden</button><button disabled data-testid="${testId}" id="disabled-direct">Disabled</button><button type="button" data-testid="${testId}" id="direct-target">Control</button><button id="direct-distractor">Unrelated</button>`,
            );
            window.fixtureClicks = [];
            for (const button of document.querySelectorAll(
              '[id$="direct"], #direct-target, #direct-distractor',
            ))
              button.onclick = () => {
                window.fixtureClicks.push(button.id);
                if (button.id === 'direct-target')
                  document.body.dataset.directEffect = newChat
                    ? 'blank-conversation'
                    : 'search-dialog';
              };
          }, item.actionId === 'shortcutKeyNewConversation');
          row.pathScope =
            'visible direct control only; narrow-sidebar/navigation fallbacks remain deferred';
        }
        if (item.type === 'toggle') {
          await page.evaluate(() => {
            document.body.insertAdjacentHTML(
              'beforeend',
              '<aside id="app-shell-sidebar" data-state="closed"></aside><button id="toggle-target" data-app-shell-sidebar-trigger="true" aria-expanded="false">Toggle</button><button id="toggle-distractor">Distractor</button>',
            );
            window.fixtureClicks = [];
            document.querySelector('#toggle-target').onclick = () => {
              window.fixtureClicks.push('toggle-target');
              const host = document.querySelector('#app-shell-sidebar');
              host.dataset.state = host.dataset.state === 'open' ? 'closed' : 'open';
            };
            document.querySelector('#toggle-distractor').onclick = () =>
              window.fixtureClicks.push('toggle-distractor');
          });
        }
        if (item.type === 'before-first-message') {
          await page.evaluate(() => {
            document.body.insertAdjacentHTML(
              'beforeend',
              '<div id="conversation-header-actions"><button id="temporary-target" aria-label="Temporary chat" aria-pressed="false"><svg><use href="#chat-bubble-dashed-light-20" /></svg>Temporary</button></div>',
            );
            window.fixtureClicks = [];
            document.querySelector('#temporary-target').onclick = (event) => {
              window.fixtureClicks.push('temporary-target');
              event.currentTarget.setAttribute('aria-pressed', 'true');
            };
          });
        }
        if (item.type === 'control-gate') {
          row.pathScope =
            'Observed submit and Stop glyphs inside an untagged composer form; matching must ignore identical controls outside that form and pass through after the active glyph changes.';
          await page.evaluate((stop) => {
            const composerButton = stop
              ? '<button type="button" id="native-stop"><svg><path d="M4.5 5.75C4.5 5.05964" /></svg></button>'
              : '<button type="submit" id="native-send"><svg><path d="M9.33467 16.6663" /></svg></button>';
            document
              .querySelector('#native-composer')
              .insertAdjacentHTML('beforeend', composerButton);
            document.body.insertAdjacentHTML(
              'beforeend',
              '<form id="unrelated-form"><button type="submit" id="decoy-send"><svg><path d="M9.33467 16.6663" /></svg></button></form><button type="button" id="decoy-stop"><svg><path d="M4.5 5.75C4.5 5.05964" /></svg></button><button hidden data-testid="stop-button" id="hidden-stop">Hidden Stop</button>',
            );
            window.fixtureClicks = [];
            document.querySelector(stop ? '#native-stop' : '#native-send').onclick = (event) => {
              event.preventDefault();
              window.fixtureClicks.push(stop ? 'stop-target' : 'send-target');
            };
            document.querySelector('#decoy-send').onclick = (event) => {
              event.preventDefault();
              window.fixtureClicks.push('decoy-send');
            };
            document.querySelector('#decoy-stop').onclick = () =>
              window.fixtureClicks.push('decoy-stop');
            document.querySelector('#hidden-stop').onclick = () =>
              window.fixtureClicks.push('hidden-stop');
          }, item.actionId === 'shortcutKeyClickStopButton');
        }
        if (item.type === 'menu-cascade') {
          if (item.actionId === 'shortcutKeyAddPhotosFiles')
            row.pathScope =
              'Real Tools menu routing and upload action activation only; native chooser and upload completion require external integration proof.';
          const study = item.actionId === 'shortcutKeyStudy';
          const addPhotosFiles = item.actionId === 'shortcutKeyAddPhotosFiles';
          const persistentTool = item.actionId !== 'shortcutKeyAddPhotosFiles';
          if (study)
            row.pathScope =
              'Plus opens before the owned Study query is typed; extracted shortcut selects the scoped Study pill, and a second trusted press removes it from the empty composer.';
          await page.evaluate(
            ({ icon, study, addPhotosFiles, persistentTool, query }) => {
              document
                .querySelector('form')
                .insertAdjacentHTML(
                  'beforeend',
                  '<button type="button" id="tool-opener" data-composer-navigation-target="add-context">Tools</button>',
                );
              const composer = document.querySelector('#composer');
              window.studyTargetAvailable = true;
              if (study) {
                composer.replaceChildren();
                window.studyOwnedQuery = query;
              }
              document.body.insertAdjacentHTML(
                'beforeend',
                `<div hidden role="menuitem" id="hidden-tool">${icon}Hidden</div>`,
              );
              window.fixtureClicks = [];
              document.querySelector('#tool-opener').onclick = () => {
                window.fixtureClicks.push('tool-opener');
                const targetMarkup = addPhotosFiles
                  ? `<button type="button" data-list-navigation-item="true" role="menuitem" id="tool-target" ${study ? 'hidden' : ''}>${icon}Intended tool</button>`
                  : `<div role="menuitem" tabindex="0" id="tool-target" ${study ? 'hidden' : ''}>${icon}Intended tool</div>`;
                const ambiguousMarkup = addPhotosFiles
                  ? `<button type="button" data-list-navigation-item="true" role="menuitem" id="tool-ambiguous-distractor">${icon}Ambiguous tool</button>`
                  : '';
                document.body.insertAdjacentHTML(
                  'beforeend',
                  `<div role="menu">${targetMarkup}${ambiguousMarkup}<div role="menuitem" id="tool-distractor"><svg><path d="M0 0" /></svg>Unrelated tool</div></div>`,
                );
                if (study) {
                  composer.addEventListener('input', () => {
                    const target = document.querySelector('#tool-target');
                    if (target)
                      target.hidden =
                        !window.studyTargetAvailable ||
                        !composer.innerText.toLowerCase().endsWith(query);
                  });
                }
                document.querySelector('#tool-target').onclick = () => {
                  window.fixtureClicks.push('tool-target');
                  composer.dataset.toolEnabled = 'true';
                  if (persistentTool) {
                    const pill = `<span data-inline-selection-pill ${study ? 'data-system-hint-type="tatertot"' : ''} contenteditable="false">${icon}<span>${study ? 'Study' : 'Web search'}</span></span>`;
                    if (study) {
                      composer.innerHTML = pill;
                      window.studyOwnedQuery = null;
                    } else composer.insertAdjacentHTML('afterbegin', pill);
                  }
                  composer.addEventListener('input', () => {
                    if (!composer.querySelector('[data-inline-selection-pill]')) {
                      delete composer.dataset.toolEnabled;
                      delete composer.dataset.studyEnabled;
                      delete composer.dataset.systemHintType;
                    }
                  });
                  if (study) {
                    composer.dataset.studyEnabled = 'true';
                    composer.dataset.systemHintType = 'tatertot';
                  }
                };
                document.querySelector('#tool-distractor').onclick = () =>
                  window.fixtureClicks.push('tool-distractor');
              };
            },
            {
              icon: item.fixtureIcon,
              study,
              addPhotosFiles,
              persistentTool,
              query: item.fixtureQuery,
            },
          );
          if (study) {
            await page.locator('#tool-opener').click();
            await page.locator('#composer').click();
            await page.keyboard.type(item.fixtureQuery);
            await page.waitForFunction(
              () => {
                const target = document.querySelector('#tool-target');
                return target && !target.hidden;
              },
              null,
              { timeout: 1000 },
            );
            assert.deepEqual(
              await page.evaluate(() => window.fixtureClicks),
              ['tool-opener'],
              'Study setup opens Plus before typing its owned query',
            );
            assert.equal(
              await page.locator('#composer').innerText(),
              item.fixtureQuery,
              'Only the owned Study query should be present before shortcut dispatch',
            );
            assert.equal(
              await page.locator(`#tool-target svg use[href="#${item.fixturePillIconId}"]`).count(),
              1,
              'The visible menu target must expose the verified Study icon',
            );
            row.studySetupProof = {
              plusOpened: true,
              ownedQueryTypedBeforeDispatch: item.fixtureQuery,
              targetIconId: item.fixturePillIconId,
            };
            await page.evaluate(() => {
              window.fixtureClicks = [];
            });
          }
        }
        if (item.type.startsWith('scroll-')) {
          for (const filename of ['gsap.min.js', 'ScrollToPlugin.min.js'])
            await page.addScriptTag({
              path: fileURLToPath(new URL(`../../extension/lib/${filename}`, import.meta.url)),
            });
          await page.evaluate(() => {
            document.body.insertAdjacentHTML(
              'beforeend',
              '<div hidden class="thread-scroll-container" id="hidden-scroll"><article data-turn="assistant" style="height:1500px">Hidden conversation</article></div><div class="thread-scroll-container" id="scroll-target" style="height:200px;overflow-y:auto"><article data-turn="assistant" style="height:1500px">Synthetic long response</article></div><div id="scroll-distractor" style="height:100px;overflow:auto"><div style="height:800px">Unrelated scroll</div></div>',
            );
            document.querySelector('#scroll-target').scrollTop = 600;
            document.querySelector('#scroll-distractor').scrollTop = 300;
            window.fixtureClicks = [];
          });
          if (item.type === 'scroll-message')
            await page.evaluate(() => {
              const target = document.querySelector('#scroll-target');
              target.style.position = 'relative';
              target.innerHTML = Array.from(
                { length: 6 },
                (_, index) =>
                  `<article data-turn="assistant" style="height:300px"><div>Message ${index}</div></article>`,
              ).join('');
              target.scrollTop = 600;
            });
        }
        await page.addScriptTag({ content: runtime.source });
        if (item.type === 'message-edit') {
          await page.evaluate(() => {
            document.body.insertAdjacentHTML(
              'beforeend',
              '<section data-testid="conversation-turn-0" data-turn="user"><button type="button" id="edit-target"><svg><path d="M11.7313" /></svg>Edit</button></section><section data-testid="conversation-turn-1" data-turn="assistant"><button type="button" id="edit-distractor"><svg><path d="M11.7313" /></svg>Assistant</button></section>',
            );
            window.fixtureClicks = [];
            document.querySelector('#edit-target').onclick = () => {
              window.fixtureClicks.push('edit-target');
              document
                .querySelector('[data-testid="conversation-turn-0"]')
                .insertAdjacentHTML(
                  'beforeend',
                  '<textarea id="opened-edit">Original fixture message</textarea><button id="edit-submit" type="button">Submit</button>',
                );
              document.querySelector('#edit-submit').onclick = () =>
                window.fixtureClicks.push('edit-submit');
            };
            document.querySelector('#edit-distractor').onclick = () =>
              window.fixtureClicks.push('edit-distractor');
          });
        }
        if (item.type === 'code-dom') {
          await page.evaluate(() => {
            document.body.insertAdjacentHTML(
              'beforeend',
              '<section style="width:220px"><pre id="wrap-target" style="white-space:pre;overflow:auto"><code></code></pre></section>',
            );
            document.querySelector('#wrap-target code').textContent =
              `const harmless = "${'imaginary color '.repeat(30)}";`;
            window.fixtureClicks = [];
          });
          row.beforeWrap = await page.locator('#wrap-target').evaluate((element) => ({
            height: element.getBoundingClientRect().height,
            width: element.clientWidth,
            scrollWidth: element.scrollWidth,
          }));
          assert.ok(
            row.beforeWrap.scrollWidth > row.beforeWrap.width,
            'Fixture must require actual line wrapping',
          );
        }
        assert.deepEqual(pageErrors, [], 'Runtime fixture must initialize without page errors');
        row.setupMs = performance.now() - caseStarted;
        await page.evaluate(() => {
          window.fastKeys = [];
          document.addEventListener(
            'keydown',
            (event) =>
              window.fastKeys.push({
                code: event.code,
                trusted: event.isTrusted,
                prevented: event.defaultPrevented,
                alt: event.altKey,
                control: event.ctrlKey,
                shift: event.shiftKey,
                meta: event.metaKey,
              }),
            true,
          );
          document.querySelector('#search').focus();
        });
        const code =
          item.fixtureCode || report.rows.find((entry) => entry.actionId === item.actionId).code;
        if (item.fixtureCode)
          row.bindingScope = item.contractId
            ? 'fixed PageUp/PageDown listener; settings stored in memory only'
            : 'fixture-only assignment; shipped default is blank';
        const dispatchStarted = performance.now();
        if (item.type === 'scroll-page') {
          await page.evaluate(() => {
            window.fastPageGateKeys = [];
            window.fastPageGateObserver = (event) =>
              window.fastPageGateKeys.push({
                code: event.code,
                trusted: event.isTrusted,
                prevented: event.defaultPrevented,
              });
            document.addEventListener('keydown', window.fastPageGateObserver);
          });
          await page.keyboard.press('PageDown');
          await page.evaluate(() => window.fastPageSetting(true, 'local'));
          await page.keyboard.press('PageDown');
          await page.evaluate(() => {
            window.fastPageSetting(true);
            document.removeEventListener('keydown', window.fastPageGateObserver);
            document.addEventListener('keydown', window.fastPageGateObserver);
          });
          await page.keyboard.press('PageDown');
          await page.waitForFunction(
            () => Math.abs(document.querySelector('#scroll-target').scrollTop - 760) <= 1,
            null,
            { timeout: 1000 },
          );
          await page.keyboard.press('PageUp');
          await page.waitForFunction(
            () => Math.abs(document.querySelector('#scroll-target').scrollTop - 600) <= 1,
            null,
            { timeout: 1000 },
          );
          await page.evaluate(() => window.fastPageSetting(false));
          await page.keyboard.press('PageDown');
          const keys = await page.evaluate(() =>
            window.fastPageGateKeys.filter((event) => ['PageDown', 'PageUp'].includes(event.code)),
          );
          assert.deepEqual(
            keys.map((event) => [event.code, event.trusted, event.prevented]),
            [
              ['PageDown', true, false],
              ['PageDown', true, false],
              ['PageDown', true, true],
              ['PageUp', true, true],
              ['PageDown', true, false],
            ],
          );
          assert.equal(
            await page.locator('#scroll-distractor').evaluate((element) => element.scrollTop),
            300,
          );
          assert.equal(
            await page.locator('#hidden-scroll').evaluate((element) => element.scrollTop),
            0,
          );
          Object.assign(row, {
            status: 'pass',
            chord: 'PageDown / PageUp',
            contractProofs: ['page-up-down-takeover', 'page-up-down-enable-gate'],
            targetStatus: 'present',
            dispatchStatus: 'pass',
            effectStatus: 'pass',
            observed: { keys },
            dispatchAssertionMs: performance.now() - dispatchStarted,
          });
        } else if (item.type === 'control-gate') {
          const stop = item.actionId === 'shortcutKeyClickStopButton';
          const target = stop ? 'stop-target' : 'send-target';
          await page.keyboard.press(`Control+${code}`);
          assert.deepEqual(
            await page.evaluate(() => window.fixtureClicks),
            [],
            'Disabled setting must leave the composer control untouched',
          );
          await page.evaluate((stop) => {
            if (stop) window.enableStopWithControlBackspaceCheckbox = true;
            else window.enableSendWithControlEnterCheckbox = true;
          }, stop);
          await page.keyboard.press(`Control+${code}`);
          assert.deepEqual(
            await page.evaluate(() => window.fixtureClicks),
            [target],
            'Enabled Control key must activate exactly the intended control',
          );
          await page.locator(stop ? '#native-stop' : '#native-send').evaluate((element, stop) => {
            element.removeAttribute('data-testid');
            element.removeAttribute('data-test-id');
            element.setAttribute('type', stop ? 'submit' : 'button');
            element.innerHTML = stop
              ? '<svg><path d="M9.33467 16.6663" /></svg>'
              : '<svg><path d="M4.5 5.75C4.5 5.05964" /></svg>';
          }, stop);
          await page.keyboard.press(`Control+${code}`);
          assert.deepEqual(
            await page.evaluate(() => window.fixtureClicks),
            [target],
            'The key must not activate the opposite-state control or a hidden distractor',
          );
          const observed = await page.evaluate(() => ({
            keys: window.fastKeys,
            clicks: window.fixtureClicks,
          }));
          const delivered = observed.keys.filter(
            (event) => event.code === code && event.control && event.trusted,
          );
          assert.deepEqual(
            delivered.map((event) => event.prevented),
            [false, true, false],
            'Gate and unavailable-state chords must pass through; enabled control is intercepted',
          );
          Object.assign(row, {
            status: 'pass',
            contractProofs: [stop ? 'ctrl-stop-gate' : 'ctrl-send-gate'],
            chord: `Control+${code}`,
            targetStatus: 'present',
            dispatchStatus: 'pass',
            effectStatus: 'pass',
            observed,
            dispatchAssertionMs: performance.now() - dispatchStarted,
          });
        } else {
          const wrongModifier = 'Alt+Shift';
          const pagesBeforeWrongModifier = context.pages().length;
          const newConversationBeforeWrongModifier =
            item.type === 'new-conversation'
              ? await page.evaluate(() => ({
                  url: window.location.href,
                  turnTexts: Array.from(
                    document.querySelectorAll('#thread-turns [data-testid^="conversation-turn-"]'),
                    (turn) => turn.innerText,
                  ),
                  composerText: document.querySelector('#composer').innerText,
                  conversationState: document.body.dataset.conversationState,
                }))
              : null;
          await page.keyboard.press(`${wrongModifier}+${code}`);
          assert.equal(
            await page.evaluate(() => document.activeElement.id),
            'search',
            'Wrong modifier must leave focus unchanged',
          );
          if (item.type !== 'focus')
            assert.deepEqual(
              await page.evaluate(() => window.fixtureClicks),
              [],
              'Wrong modifier must not activate target',
            );
          if (item.actionId === 'shortcutKeyShare') {
            const wrongModifierEvidence = await readShareClipboardToastEvidence(page);
            assert.deepEqual(await page.evaluate(() => window.fixtureClipboardWrites), []);
            assert.deepEqual(wrongModifierEvidence, {
              validShareLink: false,
              clipboardReadSucceeded: true,
              toastObserved: false,
            });
            const wrongKey = await page.evaluate(
              (code) =>
                window.fastKeys.find(
                  (event) => event.code === code && event.alt && event.shift && event.trusted,
                ),
              code,
            );
            assert.ok(wrongKey, 'Wrong-modifier chord must be delivered as trusted input');
            assert.equal(wrongKey.prevented, false);
            row.shareWrongModifierProof = {
              trusted: wrongKey.trusted,
              passedThrough: !wrongKey.prevented,
              clipboardUnchanged: true,
              freshToastAbsent: true,
            };
          }
          if (newConversationBeforeWrongModifier) {
            const afterWrongModifier = await page.evaluate(() => ({
              url: window.location.href,
              turnTexts: Array.from(
                document.querySelectorAll('#thread-turns [data-testid^="conversation-turn-"]'),
                (turn) => turn.innerText,
              ),
              composerText: document.querySelector('#composer').innerText,
              conversationState: document.body.dataset.conversationState,
            }));
            assert.deepEqual(
              afterWrongModifier,
              newConversationBeforeWrongModifier,
              'Wrong modifier must preserve the existing conversation route, turns, and composer',
            );
            const wrongKey = await page.evaluate(
              (code) =>
                window.fastKeys.find(
                  (event) => event.code === code && event.alt && event.shift && event.trusted,
                ),
              code,
            );
            assert.ok(wrongKey, 'Wrong-modifier chord must be delivered as trusted input');
            assert.equal(wrongKey.prevented, false);
            row.newConversationWrongModifierProof = {
              trusted: wrongKey.trusted,
              passedThrough: !wrongKey.prevented,
              routeAndTurnsPreserved: true,
            };
          }
          if (item.type === 'new-tab')
            assert.equal(
              context.pages().length,
              pagesBeforeWrongModifier,
              'Wrong modifier must not create a tab',
            );
          if (item.type === 'focus') {
            for (const modifier of ['Alt+Control', 'Alt+Meta']) {
              await page.keyboard.press(`${modifier}+${code}`);
              assert.equal(
                await page.evaluate(() => document.activeElement.id),
                'search',
                'Compound non-preview modifiers must preserve focus',
              );
            }
            row.ignoreGuardProof = await page.evaluate((code) => {
              const cases = [
                { key: 'w', isComposing: true },
                { key: 'w', keyCode: 229 },
                ...['Control', 'Meta', 'Alt', 'AltGraph', 'Henkan', 'Muhenkan', 'KanaMode'].map(
                  (key) => ({ key }),
                ),
                { key: 'w', modifierAltGraph: true },
              ];
              return cases.map((init) => {
                const event = new KeyboardEvent('keydown', {
                  code,
                  altKey: true,
                  bubbles: true,
                  cancelable: true,
                  ...init,
                });
                document.querySelector('#search').dispatchEvent(event);
                return {
                  init,
                  ignored: !event.defaultPrevented && document.activeElement.id === 'search',
                  trusted: event.isTrusted,
                };
              });
            }, code);
            assert.ok(
              row.ignoreGuardProof.every((item) => item.ignored && !item.trusted),
              'Synthetic IME/AltGraph guard probes must not dispatch the action',
            );
            row.pathScope =
              'Windows modifier path with trusted Shift/Control/Meta negatives; IME/AltGraph guard probes are synthetic, not native IME sessions';
          }
          if (item.type === 'code-dom') {
            assert.equal(
              await page.evaluate(() =>
                document.documentElement.classList.contains('csp-codebox-wrap-enabled'),
              ),
              false,
              'Wrong modifier must leave code wrapping off',
            );
            assert.deepEqual(
              await page.evaluate(() => window.fastStorageWrites),
              [],
              'Wrong modifier must not request persistence',
            );
          }
          if (item.type.startsWith('scroll-'))
            assert.equal(
              await page.locator('#scroll-target').evaluate((element) => element.scrollTop),
              600,
              'Wrong modifier must preserve scroll position',
            );
          const originalPages = context.pages().length;
          const popupPromise =
            item.type === 'new-tab' ? context.waitForEvent('page', { timeout: 2000 }) : null;
          if (item.actionId === 'shortcutKeyStudy') {
            await page.locator('#tool-opener').evaluate((element) => {
              element.hidden = true;
            });
            await page.locator('#tool-target').evaluate((element) => {
              element.hidden = true;
            });
            await page.keyboard.press(`Alt+${code}`);
            assert.deepEqual(
              await page.evaluate(() => window.fixtureClicks),
              [],
              'A hidden menu target and unavailable opener must be a no-op',
            );
            assert.equal(
              await page.locator('#composer').innerText(),
              item.fixtureQuery,
              'A no-op must preserve the owned query for cleanup',
            );
            await page.locator('#tool-opener').evaluate((element) => {
              element.hidden = false;
            });
            await page.locator('#tool-target').evaluate((element) => {
              element.hidden = false;
            });
          }
          await page.keyboard.press(`Alt+${code}`);
          if (item.type === 'focus') {
            await page.waitForFunction(() => document.activeElement.id === 'composer', null, {
              timeout: 2000,
            });
            row.contractProofs = ['runtime-shortcut-dispatch', 'alt-modifier-isolation'];
          } else if (item.type === 'new-tab') {
            spawnedPage = await popupPromise;
            await spawnedPage.waitForURL('https://shortcut-fixture.invalid/', { timeout: 2000 });
            assert.equal(await spawnedPage.title(), 'Fixture blank conversation');
            assert.equal(
              await spawnedPage.evaluate(() => window.opener),
              null,
              'New tab must retain noopener isolation',
            );
            assert.equal(context.pages().length, originalPages + 1);
            assert.equal(
              page.url(),
              'https://shortcut-fixture.invalid/',
              'Original tab must stay on its route',
            );
            row.spawnedUrl = spawnedPage.url();
          } else if (item.type === 'edit-submit') {
            await page.waitForFunction(() => window.fixtureClicks.length === 1, null, {
              timeout: 1000,
            });
            assert.deepEqual(await page.evaluate(() => window.fixtureClicks), ['commit-edit']);
            assert.equal(
              await page
                .locator('[data-testid="conversation-turn-1"]')
                .getAttribute('data-committed'),
              'Edited fixture message',
            );
          } else if (item.type === 'header-share') {
            await page.waitForFunction(() => window.fixtureClicks.includes('share-target'), null, {
              timeout: 2000,
            });
            const shareEvidence = await waitForShareClipboardToast(page, { timeoutMs: 2000 });
            assert.deepEqual(shareEvidence, {
              clipboardReadSucceeded: true,
              validShareLink: true,
              toastObserved: true,
            });
            assert.deepEqual(
              await page.evaluate(() => window.fixtureClipboardWrites),
              ['https://chatgpt.com/share/fixture-owned-shortcut-id'],
              'The trusted shortcut must produce one owned canonical clipboard write',
            );
            const correctKey = await page.evaluate(
              (code) =>
                window.fastKeys.find(
                  (event) =>
                    event.code === code &&
                    event.alt &&
                    !event.shift &&
                    !event.control &&
                    !event.meta &&
                    event.trusted,
                ),
              code,
            );
            assert.ok(correctKey, 'Share must follow a trusted Alt shortcut');
            row.shareCopyToastProof = {
              trustedShortcut: correctKey.trusted,
              scopedTargetClicked: true,
              ownedClipboardWriteCount: 1,
              validShareLink: shareEvidence.validShareLink,
              freshToast: shareEvidence.toastObserved,
            };
            assert.deepEqual(await page.evaluate(() => window.fixtureClicks), ['share-target']);
            const toastCountBeforeMissingTarget = await page
              .locator('[data-content] [data-title]')
              .count();
            await page.locator('#share-target').evaluate((element) => element.remove());
            await page.keyboard.press(`Alt+${code}`);
            assert.deepEqual(
              await page.evaluate(() => window.fixtureClicks),
              ['share-target'],
              'Missing scoped Share control must not activate the matching outside control',
            );
            assert.deepEqual(
              await page.evaluate(() => window.fixtureClipboardWrites),
              ['https://chatgpt.com/share/fixture-owned-shortcut-id'],
              'Missing scoped Share control must not write the clipboard again',
            );
            assert.equal(
              await page.locator('[data-content] [data-title]').count(),
              toastCountBeforeMissingTarget,
              'Missing scoped Share control must not add another notification',
            );
          } else if (item.type === 'blank-mode') {
            await page.waitForFunction(() => window.__cspChatWorkSurfaceMode === 'work', null, {
              timeout: 1000,
            });
            assert.equal(await page.locator('#work-mode').getAttribute('aria-checked'), 'true');
            assert.equal(await page.locator('#chat-mode').getAttribute('aria-checked'), 'false');
            await page.keyboard.press(`Alt+${code}`);
            await page.waitForFunction(() => window.__cspChatWorkSurfaceMode === 'chat', null, {
              timeout: 1000,
            });
            assert.equal(await page.locator('#chat-mode').getAttribute('aria-checked'), 'true');
            assert.equal(await page.locator('#work-mode').getAttribute('aria-checked'), 'false');
            assert.deepEqual(await page.evaluate(() => window.fixtureClicks), [
              'work-mode',
              'chat-mode',
            ]);
            assert.deepEqual(await page.evaluate(() => window.fixtureModeEvents), [
              'chat',
              'work',
              'chat',
            ]);
            assert.equal(await page.locator('#hidden-chat').getAttribute('aria-checked'), 'true');
            assert.equal(await page.locator('#hidden-work').getAttribute('aria-checked'), 'false');
          } else if (item.type === 'direct-control') {
            assert.deepEqual(await page.evaluate(() => window.fixtureClicks), ['direct-target']);
            assert.equal(
              await page.locator('body').getAttribute('data-direct-effect'),
              item.actionId === 'shortcutKeyNewConversation'
                ? 'blank-conversation'
                : 'search-dialog',
            );
          } else if (item.type === 'new-conversation') {
            await page.waitForFunction(
              () =>
                window.location.pathname === '/' &&
                document.querySelectorAll('#thread-turns [data-testid^="conversation-turn-"]')
                  .length === 0 &&
                document.querySelector('#composer').getBoundingClientRect().height > 0 &&
                document.querySelector('#composer').innerText.trim() === '',
              null,
              { timeout: 2000 },
            );
            assert.deepEqual(
              await page.evaluate(() => window.fixtureClicks),
              ['new-chat-target'],
              'The extracted shortcut must activate the source-recognized titlebar target',
            );
            assert.equal(await page.url(), 'https://shortcut-fixture.invalid/');
            assert.equal(
              await page.locator('#thread-turns [data-testid^="conversation-turn-"]').count(),
              0,
              'New Conversation must clear the existing turns',
            );
            assert.equal(await page.locator('#composer').isVisible(), true);
            assert.equal((await page.locator('#composer').innerText()).trim(), '');
            assert.equal(
              await page.locator('body').getAttribute('data-conversation-state'),
              'blank-root',
            );
            const correctKey = await page.evaluate(
              (code) =>
                window.fastKeys.find(
                  (event) =>
                    event.code === code &&
                    event.alt &&
                    !event.shift &&
                    !event.control &&
                    !event.meta &&
                    event.trusted,
                ),
              code,
            );
            assert.ok(correctKey, 'The correct shortcut must be delivered as trusted input');
            row.newConversationResetProof = {
              trustedShortcut: correctKey.trusted,
              nativeTargetActivated: true,
              route: await page.evaluate(() => window.location.pathname),
              remainingTurns: 0,
              composerVisible: true,
              composerEmpty: true,
            };
          } else if (item.type.startsWith('scroll-')) {
            await page.waitForFunction(
              ({ bottom, expected }) => {
                const element = document.querySelector('#scroll-target');
                if (expected !== undefined) return Math.abs(element.scrollTop - expected) <= 1;
                return bottom
                  ? Math.abs(element.scrollTop - (element.scrollHeight - element.clientHeight)) <= 1
                  : element.scrollTop <= 1;
              },
              {
                bottom: item.actionId === 'shortcutKeyClickNativeScrollToBottom',
                expected: item.expectedScrollTop,
              },
              { timeout: 2000 },
            );
            assert.equal(
              await page.locator('#scroll-distractor').evaluate((element) => element.scrollTop),
              300,
              'Unrelated scroll region must remain untouched',
            );
            assert.equal(
              await page.locator('#hidden-scroll').evaluate((element) => element.scrollTop),
              0,
              'Hidden conversation must remain untouched',
            );
            row.scrollProof = await page.locator('#scroll-target').evaluate((element) => ({
              top: element.scrollTop,
              height: element.scrollHeight,
              viewport: element.clientHeight,
            }));
          } else if (item.type === 'message-edit') {
            await page.waitForFunction(() => document.activeElement?.id === 'opened-edit', null, {
              timeout: 2000,
            });
            assert.deepEqual(
              await page.evaluate(() => window.fixtureClicks),
              ['edit-target'],
              'Edit must activate the user-message control once without submitting or activating assistant distractor',
            );
            assert.deepEqual(
              await page.locator('#opened-edit').evaluate((element) => ({
                text: element.value,
                start: element.selectionStart,
                end: element.selectionEnd,
              })),
              { text: 'Original fixture message', start: 0, end: 24 },
              'Real Edit runtime must select the opened message text',
            );
          } else if (item.type === 'code-dom') {
            await page.waitForFunction(
              () => document.documentElement.classList.contains('csp-codebox-wrap-enabled'),
              null,
              { timeout: 1000 },
            );
            row.afterWrap = await page.locator('#wrap-target').evaluate((element) => ({
              height: element.getBoundingClientRect().height,
              width: element.clientWidth,
              scrollWidth: element.scrollWidth,
              whiteSpace: getComputedStyle(element).whiteSpace,
            }));
            assert.ok(
              row.afterWrap.height > row.beforeWrap.height,
              'Long code line must actually wrap',
            );
            assert.ok(
              row.afterWrap.scrollWidth <= row.afterWrap.width + 1,
              'Wrapped code must have no horizontal overflow',
            );
            await page.keyboard.press(`Alt+${code}`);
            assert.equal(
              await page.evaluate(() =>
                document.documentElement.classList.contains('csp-codebox-wrap-enabled'),
              ),
              false,
              'Second key must restore wrap state',
            );
            assert.deepEqual(
              await page.evaluate(() => window.fastStorageWrites),
              [{ codeboxWrapEnabled: true }, { codeboxWrapEnabled: false }],
              'Persistence requests must reflect both state transitions in memory only',
            );
          } else if (item.type === 'menu-cascade') {
            if (item.actionId === 'shortcutKeyAddPhotosFiles') {
              await page.waitForFunction(() => window.fixtureClicks.includes('tool-opener'), null, {
                timeout: 2000,
              });
              await page.waitForTimeout(2600);
              assert.deepEqual(
                await page.evaluate(() => window.fixtureClicks),
                ['tool-opener'],
                'Ambiguous Add Photos/Files list-navigation targets must not activate either row',
              );
              assert.equal(
                await page.locator('#composer').getAttribute('data-tool-enabled'),
                null,
                'Ambiguous target matches must not trigger a tool action',
              );
              await page
                .locator('#tool-ambiguous-distractor')
                .evaluate((element) => element.remove());
              await page.keyboard.press(`Alt+${code}`);
              assert.equal(
                fileChooserObserved,
                false,
                'The fixture must not open a native file chooser',
              );
              row.ambiguityRejectionProof = true;
            }
            await page.waitForFunction(
              () => document.querySelector('#composer').dataset.toolEnabled === 'true',
              null,
              { timeout: 2000 },
            );
            assert.deepEqual(
              await page.evaluate(() => window.fixtureClicks),
              item.actionId === 'shortcutKeyStudy'
                ? ['tool-target']
                : ['tool-opener', 'tool-target'],
              'Menu cascade must open Tools then activate only the intended visible item',
            );
            if (item.actionId === 'shortcutKeyStudy') {
              const composer = page.locator('#composer');
              assert.equal(
                await composer
                  .locator(
                    `span[data-inline-selection-pill] svg use[href="#${item.fixturePillIconId}"]`,
                  )
                  .count(),
                1,
                'The first trusted shortcut press must add the verified Study pill inside the composer',
              );
              assert.equal(
                await page.locator('body [data-inline-selection-pill]').count(),
                1,
                'Only the composer-owned Study pill should be present',
              );
              assert.equal(
                await composer.evaluate((element) =>
                  Array.from(element.childNodes)
                    .filter(
                      (node) =>
                        !(
                          node.nodeType === Node.ELEMENT_NODE &&
                          node.matches('[data-inline-selection-pill]')
                        ),
                    )
                    .map((node) => node.textContent)
                    .join('')
                    .trim(),
                ),
                '',
                'Selecting Study must consume only its owned search query',
              );
              assert.equal(
                await page.evaluate(() => window.studyOwnedQuery),
                null,
                'Study selection must release ownership of its search query',
              );
            }
            if (item.actionId !== 'shortcutKeyAddPhotosFiles') {
              assert.equal(
                await page.locator('#composer [data-inline-selection-pill]').count(),
                1,
                'The first shortcut press should leave its matching tool pill selected',
              );
              await page.keyboard.press(`Alt+${code}`);
              await page.waitForFunction(
                () => !document.querySelector('#composer [data-inline-selection-pill]'),
                null,
                { timeout: 1000 },
              );
              assert.equal(
                await page.locator('#composer').innerText(),
                item.actionId === 'shortcutKeyStudy' ? '' : 'Draft',
                item.actionId === 'shortcutKeyStudy'
                  ? 'The second Study press must leave the originally empty composer empty'
                  : 'Toggling the tool off must preserve any draft text',
              );
              assert.deepEqual(
                await page.evaluate(() => window.fixtureClicks),
                item.actionId === 'shortcutKeyStudy'
                  ? ['tool-target']
                  : ['tool-opener', 'tool-target'],
                'Toggling an active pill must not reopen the menu or click a second action',
              );
            }
          } else {
            assert.deepEqual(
              await page.evaluate(() => window.fixtureClicks),
              [item.type === 'toggle' ? 'toggle-target' : 'temporary-target'],
              'Actual action must activate exactly the intended native fixture control',
            );
            if (item.type === 'toggle') {
              assert.equal(
                await page.locator('#app-shell-sidebar').getAttribute('data-state'),
                'open',
              );
              await page.keyboard.press(`Alt+${code}`);
              assert.equal(
                await page.locator('#app-shell-sidebar').getAttribute('data-state'),
                'closed',
                'Second key must restore toggle state',
              );
            } else {
              assert.equal(
                await page.locator('#temporary-target').getAttribute('aria-pressed'),
                'true',
              );
              await page
                .locator('#conversation-header-actions')
                .evaluate((element) => element.remove());
              await page.keyboard.press(`Alt+${code}`);
              assert.deepEqual(
                await page.evaluate(() => window.fixtureClicks),
                ['temporary-target'],
                'Unavailable post-message control must cause no activation',
              );
            }
          }
          const observed = await page.evaluate(() => ({
            activeId: document.activeElement.id,
            keys: window.fastKeys,
            clicks: window.fixtureClicks,
          }));
          row.dispatchAssertionMs = performance.now() - dispatchStarted;
          if (item.type === 'focus') {
            const rejected = observed.keys.filter(
              (event) =>
                event.code === code &&
                event.trusted &&
                (event.shift || event.control || event.meta),
            );
            assert.equal(
              rejected.length,
              3,
              'All three wrong-modifier chords must be trusted and observed',
            );
            assert.ok(
              rejected.every((event) => !event.prevented),
              'Wrong-modifier chords must pass through',
            );
          }
          assert.ok(
            observed.keys.some(
              (event) =>
                event.code === code &&
                event.alt &&
                !event.shift &&
                event.trusted &&
                event.prevented,
            ),
            'Trusted runtime-intercepted key must reach document',
          );
          assert.ok(
            observed.keys.some(
              (event) =>
                event.code === code &&
                event.alt &&
                event.shift &&
                event.trusted &&
                !event.prevented,
            ),
            'Wrong-modifier event must be delivered and passed through',
          );
          Object.assign(row, {
            status: 'pass',
            chord: `Alt+${code}`,
            targetStatus: 'present',
            dispatchStatus: 'pass',
            effectStatus: 'pass',
            observed,
          });
        }
      } catch (error) {
        row.reason = error.message;
        row.observed = await page
          .evaluate(() => ({ activeId: document.activeElement.id, keys: window.fastKeys }))
          .catch(() => null);
      } finally {
        page.off('pageerror', onPageError);
        if (item.actionId === 'shortcutKeyAddPhotosFiles') page.off('filechooser', onFileChooser);
        if (item.actionId === 'shortcutKeyShare')
          await cleanupShareToastObserver(page).catch(() => {});
        const cleanup = await Promise.allSettled([
          page.close(),
          ...(spawnedPage ? [spawnedPage.close()] : []),
        ]);
        const rejected = cleanup.find((result) => result.status === 'rejected');
        if (rejected) {
          row.status = 'fail';
          row.reason = `Owned page cleanup failed: ${rejected.reason.message}`;
        }
      }
      row.pageErrors = pageErrors;
      if (pageErrors.length) row.status = 'fail';
      row.durationMs = performance.now() - caseStarted;
      row.endedMs = performance.now() - started;
      report.observations.push(row);
    };
    const parallel = selected.filter((item) => item.parallelSafe);
    report.scheduling = {
      maxParallelTabs: Math.min(DEFAULT_TAB_LIMIT, parallel.length),
      tabLimit: DEFAULT_TAB_LIMIT,
      parallel: parallel.map((item) => item.actionId),
      serial: selected.filter((item) => !item.parallelSafe).map((item) => item.actionId),
    };
    const settledCase = async (item) => {
      try {
        await runCase(item);
      } catch (error) {
        report.observations.push({
          actionId: item.actionId,
          attempted: true,
          proofScope: 'fixture-keyboard',
          status: 'fail',
          reason: error.message,
        });
      }
    };
    await settleTabPool(parallel, settledCase);
    // Shared-state families start only after all tab-local work has settled.
    for (const item of selected.filter((entry) => !entry.parallelSafe)) await settledCase(item);
    const parallelRows = report.observations.filter((row) =>
      report.scheduling.parallel.includes(row.actionId),
    );
    const serialRows = report.observations
      .filter((row) => report.scheduling.serial.includes(row.actionId))
      .sort((left, right) => left.startedMs - right.startedMs);
    let previousEnd = Math.max(0, ...parallelRows.map((row) => row.endedMs));
    report.scheduling.serialBarrierPassed = serialRows.every((row) => {
      const safe = row.startedMs >= previousEnd;
      previousEnd = row.endedMs;
      return safe;
    });
    const events = parallelRows
      .flatMap((row) => [
        { at: row.startedMs, delta: 1 },
        { at: row.endedMs, delta: -1 },
      ])
      .sort((left, right) => left.at - right.at || left.delta - right.delta);
    let active = 0;
    report.scheduling.observedParallelTabs = 0;
    for (const event of events) {
      active += event.delta;
      report.scheduling.observedParallelTabs = Math.max(
        report.scheduling.observedParallelTabs,
        active,
      );
    }
  } catch (error) {
    for (const item of selected.filter(
      (entry) => !report.observations.some((row) => row.actionId === entry.actionId),
    ))
      report.observations.push({
        actionId: item.actionId,
        attempted: false,
        proofScope: 'fixture-keyboard',
        status: 'environment-fail',
        reason: error.message,
      });
  } finally {
    try {
      await browser?.close();
    } catch (error) {
      report.observations.push({ status: 'environment-fail', reason: error.message });
    }
  }
}
report.timings.executionMs = performance.now() - started;
for (const row of report.observations) {
  const item = selected.find((entry) => entry.actionId === row.actionId);
  if (item && !row.bindingScope)
    row.bindingScope = item.fixtureCode
      ? 'fixture-only-assignment'
      : item.contractId
        ? 'fixed-contract'
        : 'source-default';
}
report.summary = summarizeFastReport(report);
report.outcome = fastReportOutcome(report);
const reportingStarted = performance.now();
await saveFastReport(report, args.includes('--catalog-only') ? CATALOGUE_RESULT_PATH : undefined);
report.timings.reportingMs = performance.now() - reportingStarted;
report.timings.totalMs = performance.now() - started;
if (!report.catalogueOnly) {
  const files = await writeFastVisualReport(report);
  console.log(`Visual shortcut report: ${files.html}`);
}
if (args.includes('--catalog-only'))
  for (const row of report.rows)
    console.log(`${row.rowId}\t${row.status}\t${(row.targetRefs || []).join(',')}`);
console.log(
  JSON.stringify(
    {
      summary: report.summary,
      outcome: report.outcome,
      timings: report.timings,
      scheduling: report.scheduling,
      observations: args.includes('--verbose')
        ? report.observations
        : report.observations.filter((row) => row.status !== 'pass'),
    },
    null,
    2,
  ),
);
console.log(`Final coverage: ${report.outcome.coverage}; ${report.outcome.checks}`);
for (const warning of report.outcome.warnings)
  console.log(
    `WARNING ${warning.rowId || warning.actionId || warning.owner || ''}: ${warning.reason || warning.message}`,
  );
for (const error of report.outcome.errors)
  console.log(`ERROR ${error.actionId || error.rowId || ''}: ${error.message}`);
process.exitCode = report.outcome.exitCode;
