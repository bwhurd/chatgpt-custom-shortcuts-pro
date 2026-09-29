import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const moduleStart = contentSource.indexOf('    const SendEditShortcut = (() => {');
const moduleEndMarker = '\n    })();\n\n    function runSendEditShortcut()';
const moduleEnd = contentSource.indexOf(moduleEndMarker, moduleStart);

assert.notEqual(moduleStart, -1, 'SendEditShortcut module start marker is missing');
assert.notEqual(moduleEnd, -1, 'SendEditShortcut module end marker is missing');

const sendEditSource = contentSource
  .slice(moduleStart, moduleEnd + '\n    })();'.length)
  .replace(/^    /gm, '');

class FixtureElement {
  constructor(tagName, { attributes = {}, classes = [], rect = {} } = {}) {
    this.tagName = tagName.toLowerCase();
    this.attributes = new Map(Object.entries(attributes));
    this.classes = new Set(classes);
    this.classList = { contains: (className) => this.classes.has(className) };
    this.rect = {
      top: 100,
      bottom: 124,
      left: 300,
      right: 324,
      width: 24,
      height: 24,
      ...rect,
    };
    this.parentElement = null;
    this.children = [];
    this.isConnected = true;
    this.disabled = false;
    this.style = { display: 'block', visibility: 'visible', opacity: '1' };
    this.clickCount = 0;
  }

  append(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  matches(selector) {
    return selector.split(',').some((candidate) => this.matchesOne(candidate.trim()));
  }

  matchesOne(selector) {
    const tag = selector.match(/^[a-z][\w-]*/i)?.[0];
    if (tag && this.tagName !== tag.toLowerCase()) return false;

    const classes = Array.from(selector.matchAll(/\.([\w-]+)/g), (match) => match[1]);
    if (classes.some((className) => !this.classes.has(className))) return false;

    const ids = Array.from(selector.matchAll(/#([\w-]+)/g), (match) => match[1]);
    if (ids.some((id) => this.getAttribute('id') !== id)) return false;

    const attributes = Array.from(selector.matchAll(/\[([^\]]+)\]/g), (match) => match[1]);
    for (const expression of attributes) {
      const [, name, operator, rawValue] = expression.match(
        /^([\w:-]+)(?:\s*(\^=|\$=|\*=|=)\s*["']?([^"']*)["']?)?$/,
      ) || [];
      if (!name) return false;
      const value = this.getAttribute(name);
      if (operator === undefined) {
        if (value === null) return false;
      } else if (value === null) {
        return false;
      } else if (operator === '=' && value !== rawValue) {
        return false;
      } else if (operator === '^=' && !value.startsWith(rawValue)) {
        return false;
      } else if (operator === '$=' && !value.endsWith(rawValue)) {
        return false;
      } else if (operator === '*=' && !value.includes(rawValue)) {
        return false;
      }
    }

    const remainder = selector
      .replace(/^[a-z][\w-]*/i, '')
      .replace(/\.[\w-]+/g, '')
      .replace(/#[\w-]+/g, '')
      .replace(/\[[^\]]+\]/g, '')
      .trim();
    return remainder === '';
  }

  closest(selector) {
    for (let current = this; current; current = current.parentElement) {
      if (current.matches(selector)) return current;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getBoundingClientRect() {
    return this.rect;
  }

  click() {
    this.clickCount += 1;
  }
}

const createHarness = ({ focused }) => {
  const scheduled = [];
  const turn = new FixtureElement('div', { attributes: { 'data-turn-key': 'user-turn-1' } });
  const userMessage = turn.append(
    new FixtureElement('div', { attributes: { 'data-message-author-role': 'user' } }),
  );
  const editCard = userMessage.append(
    new FixtureElement('div', {
      attributes: { 'data-message-id': 'message-1' },
      classes: ['bg-token-main-surface-tertiary'],
    }),
  );
  const editField = editCard.append(
    new FixtureElement('div', {
      attributes: { contenteditable: 'true', role: 'textbox' },
      rect: { top: 120, bottom: 300, left: 100, right: 700, width: 600, height: 180 },
    }),
  );
  const actionRow = editCard.append(
    new FixtureElement('div', { classes: ['flex', 'justify-end', 'gap-2'] }),
  );
  const submitButton = actionRow.append(
    new FixtureElement('button', {
      attributes: { type: 'submit', 'aria-label': 'Senden' },
      rect: { top: 340, bottom: 372, left: 280, right: 352, width: 72, height: 32 },
    }),
  );
  const cancelButton = actionRow.append(
    new FixtureElement('button', {
      attributes: { type: 'button', 'aria-label': 'Abbrechen' },
      rect: { top: 340, bottom: 372, left: 380, right: 472, width: 92, height: 32 },
    }),
  );
  const body = new FixtureElement('body');
  body.append(turn);
  const document = {
    activeElement: focused ? editField : null,
    body,
    documentElement: { clientHeight: 900, clientWidth: 1200 },
    querySelectorAll: (selector) => body.querySelectorAll(selector),
  };
  const window = {
    innerHeight: 900,
    innerWidth: 1200,
    getComputedStyle: (element) => element.style,
    getSelection: () => null,
    gsap: null,
  };
  const context = {
    Element: FixtureElement,
    HTMLElement: FixtureElement,
    Node: { ELEMENT_NODE: 1 },
    document,
    isAboveComposer: () => true,
    safeClick: (button) => {
      if (!button.isConnected) return false;
      button.click();
      return true;
    },
    setTimeout: (callback, delay) => {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    window,
  };

  runInNewContext(`${sendEditSource}\nglobalThis.sendEditShortcut = SendEditShortcut;`, context);
  return { cancelButton, scheduled, submitButton, shortcut: context.sendEditShortcut };
};

for (const focused of [true, false]) {
  const harness = createHarness({ focused });
  harness.shortcut.run();
  assert.equal(harness.scheduled.length, 1, 'the edit submit button should be scheduled once');
  assert.equal(harness.scheduled[0].delay, 250);
  harness.scheduled[0].callback();
  assert.equal(harness.submitButton.clickCount, 1, 'the language-neutral submit control should activate');
  assert.equal(harness.cancelButton.clickCount, 0, 'the cancel control must not be selected');
}

console.log('Send edited message shortcut fixture passed.');
