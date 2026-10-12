import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = await readFile(
  new URL('../extension/content-gated-ui-features.js', import.meta.url),
  'utf8',
);
const sectionStart = source.indexOf('// Highlight bold text in custom color');
const sectionEnd = source.indexOf('// Hide pasted files in the ChatGPT Library', sectionStart);
assert.ok(sectionStart >= 0 && sectionEnd > sectionStart, 'Bold-color IIFE must remain locatable');
const boldColorSource = source.slice(sectionStart, sectionEnd);

const STYLE_ID = 'csp-color-bold-text-style';
const DEFAULT_LIGHT_COLOR = '#2037e6';
const DEFAULT_DARK_COLOR = '#4da3ff';

function runBoldColorSource(settings) {
  const styles = new Map();
  const listeners = [];
  const document = {
    head: {
      appendChild(style) {
        styles.set(style.id, style);
      },
    },
    createElement(tagName) {
      assert.equal(tagName, 'style');
      return {
        id: '',
        textContent: '',
        remove() {
          styles.delete(this.id);
        },
      };
    },
    getElementById(id) {
      return styles.get(id) || null;
    },
  };
  const chrome = {
    storage: {
      sync: {
        get(defaults, callback) {
          callback({ ...defaults, ...settings });
        },
      },
      onChanged: {
        addListener(listener) {
          listeners.push(listener);
        },
      },
    },
  };

  runInNewContext(boldColorSource, { chrome, document });
  return { listeners, styles };
}

test('bold text uses both configured six-digit colors and only the intended rules', () => {
  const { styles } = runBoldColorSource({
    colorBoldTextEnabled: true,
    colorBoldTextLightColor: '#112233',
    colorBoldTextDarkColor: '#aAbBcC',
  });
  const style = styles.get(STYLE_ID);

  assert.ok(style, 'Enabled setting must add the color style');
  assert.match(
    style.textContent,
    /:root\[data-theme="light"\] b, :root\[data-theme="light"\] strong \{ color: #112233 !important; \}/,
  );
  assert.match(
    style.textContent,
    /:root\[data-theme="dark"\] b, :root\[data-theme="dark"\] strong \{ color: #aAbBcC !important; \}/,
  );
  assert.equal((style.textContent.match(/\{ color:/g) || []).length, 2);
});

test('string false setting adds no bold-color style', () => {
  const { styles } = runBoldColorSource({
    colorBoldTextEnabled: 'false',
    colorBoldTextLightColor: '#112233',
    colorBoldTextDarkColor: '#aAbBcC',
  });
  assert.equal(styles.has(STYLE_ID), false);
});

test('storage changes update the bold-color style only for exact boolean true', () => {
  const settings = {
    colorBoldTextEnabled: false,
    colorBoldTextLightColor: '#112233',
    colorBoldTextDarkColor: '#aAbBcC',
  };
  const { listeners, styles } = runBoldColorSource(settings);
  assert.equal(styles.has(STYLE_ID), false);

  listeners[0]({ colorBoldTextEnabled: { newValue: true } }, 'local');
  assert.equal(styles.has(STYLE_ID), false, 'Non-sync storage changes must be ignored');

  settings.colorBoldTextEnabled = true;
  listeners[0]({ colorBoldTextEnabled: { newValue: true } }, 'sync');
  assert.equal(styles.has(STYLE_ID), true, 'A sync true setting must enable the style');
  assert.match(styles.get(STYLE_ID).textContent, /color: #112233 !important;/);

  settings.colorBoldTextEnabled = 'true';
  listeners[0]({ colorBoldTextEnabled: { newValue: 'true' } }, 'sync');
  assert.equal(styles.has(STYLE_ID), false, 'A malformed truthy value must disable the style');
});

for (const scenario of [
  {
    field: 'colorBoldTextLightColor',
    validField: 'colorBoldTextDarkColor',
    validColor: '#445566',
    defaultColor: DEFAULT_LIGHT_COLOR,
    probe: 'csp-light-breakout-probe',
    payload: '#112233; } body { --csp-light-breakout-probe: 1; } /*',
  },
  {
    field: 'colorBoldTextDarkColor',
    validField: 'colorBoldTextLightColor',
    validColor: '#112233',
    defaultColor: DEFAULT_DARK_COLOR,
    probe: 'csp-dark-breakout-probe',
    payload: '#445566; } body { --csp-dark-breakout-probe: 1; } /*',
  },
]) {
  test(`a breakout in ${scenario.field} falls back without injecting a CSS rule`, () => {
    const { styles } = runBoldColorSource({
      colorBoldTextEnabled: true,
      [scenario.field]: scenario.payload,
      [scenario.validField]: scenario.validColor,
    });
    const style = styles.get(STYLE_ID);

    assert.ok(style, 'Enabled setting must add the color style');
    assert.match(style.textContent, new RegExp(`color: ${scenario.defaultColor} !important;`));
    assert.match(style.textContent, new RegExp(`color: ${scenario.validColor} !important;`));
    assert.equal((style.textContent.match(/\{ color:/g) || []).length, 2);
    assert.doesNotMatch(style.textContent, new RegExp(scenario.probe));
    assert.doesNotMatch(style.textContent, /body \{ --csp-/);
  });
}
