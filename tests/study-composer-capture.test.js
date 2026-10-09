const assert = require('node:assert/strict');
const { runInNewContext } = require('node:vm');
const test = require('node:test');

const coreModule = import('./playwright/lib/devscrape-wide-core.mjs');

class FakeHTMLElement {
  constructor({ tagName = 'div', attributes = {}, outerHTML = '', position = 'static' } = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = attributes;
    this._outerHTML = outerHTML;
    this.position = position;
    this.parentElement = null;
    this.children = [];
    this.queryAllResults = {};
    this.hidden = false;
    this.disabled = false;
    this.rect = { width: 100, height: 30, left: 0, top: 0, right: 100, bottom: 30 };
  }

  get outerHTML() {
    return this._outerHTML;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  hasAttribute(name) {
    return Object.hasOwn(this.attributes, name);
  }

  getBoundingClientRect() {
    return this.rect;
  }

  closest(selector) {
    if (selector !== '[aria-hidden="true"]') return null;
    for (let node = this; node; node = node.parentElement) {
      if (node.getAttribute('aria-hidden') === 'true') return node;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (Object.hasOwn(this.queryAllResults, selector)) return this.queryAllResults[selector];
    const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll('*')]);
    if (selector === 'button[data-list-navigation-item="true"]') {
      return descendants.filter(
        (node) =>
          node.tagName === 'BUTTON' && node.getAttribute('data-list-navigation-item') === 'true',
      );
    }
    if (selector === '*') return descendants;
    return [];
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
}

function element(tagName, attributes = {}, options = {}) {
  return new FakeHTMLElement({ tagName, attributes, ...options });
}

function makeStudyDocument({
  glyph,
  plusOpen = true,
  overlay = 'observed',
  unrelatedBook = false,
  duplicateStudy = false,
}) {
  const body = element('body');
  const form = body.appendChild(element('form', { 'data-thread-find-composer': 'true' }));
  const plusButton = form.appendChild(
    element('button', {
      'data-composer-navigation-target': 'add-context',
      'aria-expanded': String(plusOpen),
    }),
  );
  const svgFor = (icon) =>
    element('svg', {}, { outerHTML: `<svg><use href="${icon}"></use></svg>` });
  const makeItem = (icon) => {
    const label = icon.startsWith('#book-open-light-') ? 'Study' : 'Other';
    const item = element(
      'button',
      { 'data-list-navigation-item': 'true' },
      {
        outerHTML: `<button data-list-navigation-item="true"><svg><use href="${icon}"></use></svg><span>${label}</span></button>`,
      },
    );
    item.queryAllResults.svg = [svgFor(icon)];
    return item;
  };

  const items = [];
  if (overlay === 'legacy-menu') {
    const menu = body.appendChild(element('div', { role: 'menu' }));
    items.push(menu.appendChild(makeItem(glyph)));
  } else {
    const fixedHost = body.appendChild(element('div', {}, { position: 'fixed' }));
    const floating = fixedHost.appendChild(
      element('div', overlay === 'observed' ? { 'data-composer-overlay-floating-ui': '' } : {}),
    );
    let itemParent = floating;
    if (overlay === 'observed') {
      itemParent = itemParent.appendChild(element('div'));
      itemParent = itemParent.appendChild(element('div', { 'data-mention-list-scroll-area': '' }));
      itemParent = itemParent.appendChild(element('div', { 'data-mention-section-id': 'section' }));
      itemParent = itemParent.appendChild(element('div', { 'data-mention-section-items': '' }));
    }
    items.push(itemParent.appendChild(makeItem(glyph)));
    if (duplicateStudy) {
      items.push(itemParent.appendChild(makeItem(glyph)));
    }
    if (unrelatedBook) {
      items.push(itemParent.appendChild(makeItem('#books-light-20')));
    }
  }

  return {
    body,
    items,
    querySelectorAll(selector) {
      if (selector.includes('data-composer-navigation-target="add-context"')) {
        return [plusButton];
      }
      if (selector.includes('button[data-list-navigation-item="true"]')) return items;
      return [];
    },
  };
}

function makeEvaluationPage(document) {
  const url = 'https://chatgpt.com/';
  const getComputedStyle = (node) => ({
    display: node.hidden ? 'none' : 'block',
    visibility: 'visible',
    position: node.position,
  });
  return {
    url: () => url,
    evaluate(callback, input) {
      return runInNewContext(`(${callback.toString()})(input)`, {
        input,
        document,
        window: { innerWidth: 1200, innerHeight: 800 },
        Element: FakeHTMLElement,
        HTMLElement: FakeHTMLElement,
        getComputedStyle,
      });
    },
  };
}

test('Study capture accepts the observed mention-list overlay and exact Study glyphs', async () => {
  const core = await coreModule;
  const { exports } = await core.loadDevScrapeWideContract();
  const definition = exports.DUMP_REGISTRY.find(
    (entry) => entry.stateId === 'probe-composer-study-search',
  );
  const blankNewChatProvenance = {
    kind: 'verified-blank-new-chat',
    source: 'prepare-new-conversation',
    url: 'https://chatgpt.com/',
    userMessageCount: 0,
    assistantMessageCount: 0,
    composerHasText: false,
  };

  for (const glyph of ['#book-open-light-16', '#book-open-light-20']) {
    const document = makeStudyDocument({ glyph, unrelatedBook: true });
    const capture = await core.captureSupplementalProbeArtifact(
      makeEvaluationPage(document),
      definition,
      { blankNewChatProvenance },
    );
    assert.equal(capture.status, 'captured');
    assert.ok(capture.rawHtml.includes(glyph));
    assert.doesNotMatch(capture.rawHtml, /books-light-20/);
  }
});

test('Study capture rejects a closed Plus control and an unrelated floating overlay', async () => {
  const core = await coreModule;
  const { exports } = await core.loadDevScrapeWideContract();
  const definition = exports.DUMP_REGISTRY.find(
    (entry) => entry.stateId === 'probe-composer-study-search',
  );
  const blankNewChatProvenance = {
    kind: 'verified-blank-new-chat',
    source: 'prepare-new-conversation',
    url: 'https://chatgpt.com/',
    userMessageCount: 0,
    assistantMessageCount: 0,
    composerHasText: false,
  };
  const capture = (document) =>
    core.captureSupplementalProbeArtifact(makeEvaluationPage(document), definition, {
      blankNewChatProvenance,
    });

  assert.equal(
    (await capture(makeStudyDocument({ glyph: '#book-open-light-16', plusOpen: false }))).status,
    'failed',
  );
  assert.equal(
    (await capture(makeStudyDocument({ glyph: '#book-open-light-16', overlay: 'unrelated' })))
      .status,
    'failed',
  );
  assert.equal((await capture(makeStudyDocument({ glyph: '#books-light-20' }))).status, 'failed');
  assert.equal(
    (await capture(makeStudyDocument({ glyph: '#book-open-light-16', duplicateStudy: true })))
      .status,
    'failed',
  );
});

test('Study capture retains the existing role-menu fallback', async () => {
  const core = await coreModule;
  const { exports } = await core.loadDevScrapeWideContract();
  const definition = exports.DUMP_REGISTRY.find(
    (entry) => entry.stateId === 'probe-composer-study-search',
  );
  const capture = await core.captureSupplementalProbeArtifact(
    makeEvaluationPage(makeStudyDocument({ glyph: '#book-open-light-16', overlay: 'legacy-menu' })),
    definition,
    {
      blankNewChatProvenance: {
        kind: 'verified-blank-new-chat',
        source: 'prepare-new-conversation',
        url: 'https://chatgpt.com/',
        userMessageCount: 0,
        assistantMessageCount: 0,
        composerHasText: false,
      },
    },
  );

  assert.equal(capture.status, 'captured');
});
