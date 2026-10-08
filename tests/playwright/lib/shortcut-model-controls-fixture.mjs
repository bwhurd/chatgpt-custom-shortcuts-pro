import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { extractFastRuntime, FastAdapterUnavailableError } from './shortcut-fast-cases.mjs';

let cached;
export function extractModelPickerSource(content) {
  if (cached?.content === content) return cached;
  const tree = parse(content, { ecmaVersion: 'latest' });
  const nodes = [];
  const parents = new WeakMap();
  const visit = (node, parent = null) => {
    if (!node || typeof node !== 'object') return;
    if (node.type) {
      nodes.push(node);
      if (parent) parents.set(node, parent);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value))
        value.forEach((child) => {
          visit(child, node);
        });
      else if (value && typeof value === 'object') visit(value, node);
    }
  };
  visit(tree);
  const anchors = nodes.filter(
    (node) =>
      node.type === 'VariableDeclarator' && node.id?.name === 'MODEL_PICKER_CODES_BY_PROFILE',
  );
  if (!anchors.length) throw new FastAdapterUnavailableError('Missing real picker profile anchor');
  if (anchors.length !== 1)
    throw new Error(`Ambiguous real picker profile anchor; found ${anchors.length}`);
  const [anchor] = anchors;
  const wrapper = nodes
    .filter(
      (node) =>
        node.type === 'CallExpression' &&
        node.callee.type === 'ArrowFunctionExpression' &&
        node.start < anchor.start &&
        node.end > anchor.end,
    )
    .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
  if (!wrapper) throw new FastAdapterUnavailableError('Missing real picker IIFE');
  const functionSource = (name) => {
    const matches = nodes.filter(
      (node) => node.type === 'FunctionDeclaration' && node.id?.name === name,
    );
    if (!matches.length)
      throw new FastAdapterUnavailableError(`Missing real picker function: ${name}`);
    if (matches.length !== 1)
      throw new Error(`Ambiguous real picker function ${name}; found ${matches.length}`);
    return content.slice(matches[0].start, matches[0].end);
  };
  const isScriptScope = (node) => {
    let parent = parents.get(node);
    while (parent && parent.type !== 'Program') {
      if (
        [
          'ArrowFunctionExpression',
          'BlockStatement',
          'CatchClause',
          'ClassBody',
          'ForStatement',
          'FunctionDeclaration',
          'FunctionExpression',
          'SwitchCase',
        ].includes(parent.type)
      )
        return false;
      parent = parents.get(parent);
    }
    return parent?.type === 'Program';
  };
  const variableSource = (name) => {
    const matches = nodes.filter(
      (node) =>
        node.type === 'VariableDeclarator' &&
        node.id?.name === name &&
        node.start < wrapper.start &&
        isScriptScope(node),
    );
    if (!matches.length)
      throw new FastAdapterUnavailableError(`Missing real picker variable: ${name}`);
    if (matches.length !== 1)
      throw new Error(`Ambiguous real picker variable ${name}; found ${matches.length}`);
    const [match] = matches;
    return `const ${content.slice(match.start, match.end)};`;
  };
  const bridgeSource = `(() => { ${['LETTER_REGEX', 'DIGIT_REGEX', 'DIGIT_NUMPAD_REGEX', 'VALID_CODE_REGEX', 'codeEquals', 'normalizeStoredToCode', 'getSchemaShortcutDefaultCode'].map(variableSource).join('\n')} ${functionSource('charToCode')} window.ShortcutUtils = {codeEquals, normalizeStoredToCode, getSchemaShortcutDefaultCode}; ${['getNativeChatWorkSurfaceRadios', 'rememberNativeChatWorkSurfaceMode', 'getNativeChatWorkSurfaceMode'].map(functionSource).join('\n')} window.getNativeChatWorkSurfaceMode = getNativeChatWorkSurfaceMode; })();`;
  cached = {
    content,
    source: `${bridgeSource}\n${content.slice(wrapper.start, wrapper.end)};`,
    functionSource,
  };
  return cached;
}

// The caller supplies site DOM and catalogue state. All picker routing, queues,
// hint observers and production delays come from the actual complete IIFE.
export async function installModelPickerFixture(page, content, { storage = {} } = {}) {
  for (const file of [
    'settings-schema.js',
    'shared/model-picker-labels.js',
    'shared/model-picker-selectors.js',
  ]) {
    await page.addScriptTag({
      path: fileURLToPath(new URL(`../../../extension/${file}`, import.meta.url)),
    });
  }
  await page.evaluate((initial) => {
    const data = {
      useControlForModelSwitcherRadio: false,
      modelPickerKeyCodeProfilesVersion: 1,
      ...initial,
    };
    const listeners = [];
    window.fixtureStorage = data;
    window.chrome = {
      runtime: {
        id: 'isolated-model-fixture',
        getURL: (path) => `https://shortcut-fixture.invalid/${path}`,
      },
      i18n: { getMessage: () => '' },
      storage: {
        sync: {
          get(keys, callback) {
            const result =
              keys === null
                ? { ...data }
                : Array.isArray(keys)
                  ? Object.fromEntries(keys.map((key) => [key, data[key]]))
                  : { ...keys, ...data };
            queueMicrotask(() => callback(result));
          },
          set(values, callback) {
            const changes = Object.fromEntries(
              Object.entries(values).map(([key, value]) => [
                key,
                { oldValue: data[key], newValue: value },
              ]),
            );
            Object.assign(data, values);
            queueMicrotask(() => {
              listeners.forEach((listener) => {
                listener(changes, 'sync');
              });
              callback?.();
            });
          },
        },
        onChanged: {
          addListener(listener) {
            listeners.push(listener);
          },
        },
      },
    };
  }, storage);
  await page.addScriptTag({ content: extractModelPickerSource(content).source });
  await page.waitForFunction(
    () => typeof window.__cspRunProThinkingEffortAction === 'function',
    null,
    { timeout: 2000 },
  );
}

export async function installModelControlShortcut(page, content, actionId, code = 'KeyQ') {
  const runtime = await extractFastRuntime(content, actionId);
  const extracted = extractModelPickerSource(content);
  const extra =
    actionId === 'shortcutKeyToggleModelSelector'
      ? ''
      : extracted.functionSource(
          actionId.startsWith('shortcutKeyPro')
            ? 'runProThinkingEffortShortcut'
            : 'runLegacyThinkingEffortShortcut',
        );
  await page.addScriptTag({ content: `${extra}\n${runtime.source}` });
  await page.evaluate(
    ({ actionId, code }) => {
      window.CSP_SHORTCUTS_EFFECTIVE[actionId] = code;
    },
    { actionId, code },
  );
}

export async function runModelControlCase(context, content, item, started) {
  const begin = performance.now();
  const row = {
    actionId: item.actionId,
    type: item.type,
    attempted: true,
    status: 'fail',
    proofScope: 'fixture-keyboard',
    startedMs: begin - started,
    pathScope:
      'Real full model-picker IIFE, native menu discovery, thinking/pro bridges and real global keyboard dispatcher; controlled native selection state, no account request.',
  };
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const pro = item.actionId.startsWith('shortcutKeyPro');
    const option = item.actionId.endsWith('Light')
      ? 'Light'
      : item.actionId.endsWith('Heavy')
        ? 'Heavy'
        : item.actionId.endsWith('Standard')
          ? 'Standard'
          : 'Extended';
    await page.setContent(
      '<input id="composer"><button id="model-trigger" data-testid="model-switcher-dropdown-button" aria-haspopup="menu" aria-expanded="false">Models</button>',
    );
    await page.evaluate(
      ({ pro }) => {
        window.fixtureClicks = [];
        const trigger = document.querySelector('#model-trigger');
        const open = () => {
          if (document.querySelector('#main-menu')) return;
          trigger.setAttribute('aria-expanded', 'true');
          window.fixtureClicks.push('main');
          document.body.insertAdjacentHTML(
            'beforeend',
            `<div id="main-menu" role="menu" data-state="open" data-radix-menu-content aria-labelledby="model-trigger"><div data-model-picker-thinking-effort-row="true"><div role="menuitemradio" data-model-picker-thinking-effort-menu-item="true" data-testid="model-switcher-${pro ? 'pro' : 'thinking'}">${pro ? 'Pro' : 'Thinking'}</div><button id="effort-trigger" data-model-picker-thinking-effort-action="true" data-testid="model-switcher-${pro ? 'pro' : 'thinking'}-thinking-effort" aria-haspopup="menu" aria-controls="effort-menu">Effort</button></div></div>`,
          );
          document.querySelector('#effort-trigger').onclick = () => {
            if (document.querySelector('#effort-menu')) return;
            window.fixtureClicks.push('effort');
            document.body.insertAdjacentHTML(
              'beforeend',
              '<div id="effort-menu" role="menu" data-state="open" data-radix-menu-content aria-labelledby="effort-trigger"><div role="group">' +
                ['Light', 'Heavy', 'Standard', 'Extended']
                  .map(
                    (label) =>
                      `<div role="menuitemradio" aria-checked="false" data-fixture-option="${label}">${label}</div>`,
                  )
                  .join('') +
                '</div></div>',
            );
            document.querySelectorAll('[data-fixture-option]').forEach((el) => {
              el.onclick = () => {
                window.fixtureClicks.push(el.dataset.fixtureOption);
                el.setAttribute('aria-checked', 'true');
              };
            });
          };
        };
        trigger.onclick = open;
        trigger.onkeyup = (e) => {
          if (e.code === 'Space') open();
        };
      },
      { pro },
    );
    await installModelPickerFixture(page, content);
    await installModelControlShortcut(page, content, item.actionId);
    await page.locator('#composer').focus();
    await page.keyboard.press('Alt+Shift+KeyQ');
    assert.deepEqual(await page.evaluate(() => window.fixtureClicks), []);
    await page.keyboard.press('Alt+KeyQ');
    const toggle = item.actionId === 'shortcutKeyToggleModelSelector';
    await page.waitForFunction(
      ({ toggle, option }) =>
        toggle
          ? document.querySelector('#model-trigger').getAttribute('aria-expanded') === 'true'
          : window.fixtureClicks.includes(option),
      { toggle, option },
      { timeout: 2500 },
    );
    const observed = await page.evaluate(() => ({
      clicks: window.fixtureClicks,
      checked: document.querySelector('[data-fixture-option][aria-checked="true"]')?.dataset
        .fixtureOption,
    }));
    assert.deepEqual(observed.clicks, toggle ? ['main'] : ['main', 'effort', option]);
    Object.assign(row, {
      status: 'pass',
      chord: 'Alt+KeyQ',
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
