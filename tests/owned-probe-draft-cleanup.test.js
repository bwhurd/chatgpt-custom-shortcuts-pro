const assert = require('node:assert/strict');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

const coreModule = import('./playwright/lib/devscrape-wide-core.mjs');
const OWNED_DRAFT = 'this is a message I sent';
const OWNED_CONVERSATION_ID = 'owned-draft-cleanup-test';

function makeEditablePage({ url, value = '', menuOpen = false }) {
  const keyboardEvents = [];
  let clickCount = 0;
  let focusCount = 0;
  let plusMenuOpen = menuOpen;
  let selected = false;
  const editable = {
    tagName: 'DIV',
    get innerText() {
      return value;
    },
    get textContent() {
      return value === '\n' ? '' : value;
    },
  };
  const locator = {
    count: async () => 1,
    nth: () => locator,
    isVisible: async () => true,
    click: async () => {
      clickCount += 1;
      plusMenuOpen = false;
    },
    focus: async () => {
      focusCount += 1;
    },
    fill: async () => {
      throw new Error('The fake React editor rejects locator.fill().');
    },
    evaluate: async (callback) => callback(editable),
  };
  const page = {
    url: () => url,
    sendCount: 0,
    keyboardEvents,
    locator: () => locator,
    keyboard: {
      press: async (key) => {
        keyboardEvents.push({ type: 'press', key });
        if (key === 'Control+A') selected = true;
        if (key === 'Backspace' && selected) {
          value = '';
          selected = false;
        }
      },
      type: async (text) => {
        keyboardEvents.push({ type: 'type', text });
        value = value === '\n' ? text : `${value}${text}`;
      },
    },
    waitForTimeout: async () => {},
    currentText: () => value,
    isMenuOpen: () => plusMenuOpen,
    setText: (nextValue) => {
      value = nextValue;
    },
    currentTextContent: () => (value === '\n' ? '' : value),
    get clickCount() {
      return clickCount;
    },
    get focusCount() {
      return focusCount;
    },
  };
  return page;
}

const ownedOptions = (overrides = {}) => ({
  auditOwnedConversationIds: [OWNED_CONVERSATION_ID],
  allowVerifiedBlankHome: true,
  ...overrides,
});

function addBlankHomeSemanticDom(page, { hiddenTurns = true } = {}) {
  class Element {
    constructor(parentElement = null) {
      this.parentElement = parentElement;
      this.tagName = 'DIV';
    }
    getBoundingClientRect() {
      return { width: 100, height: 30 };
    }
    getAttribute(name) {
      return name === 'aria-hidden' && this.hiddenTurns ? 'true' : null;
    }
    hasAttribute() {
      return false;
    }
    querySelectorAll() {
      return [];
    }
    closest() {
      return null;
    }
    contains() {
      return false;
    }
    compareDocumentPosition() {
      return 4;
    }
  }
  const parent = new Element();
  parent.hiddenTurns = hiddenTurns;
  const users = [new Element(parent), new Element(parent)];
  const assistants = [new Element(parent), new Element(parent)];
  const composer = new Element();
  Object.defineProperties(composer, {
    innerText: { get: () => page.currentText() },
    textContent: { get: () => page.currentTextContent() },
  });
  const root = {
    classList: { contains: () => false },
    scrollTop: 0,
    scrollHeight: 800,
    clientHeight: 800,
  };
  page.evaluate = (callback, input) => {
    const document = {
      title: '',
      activeElement: null,
      documentElement: root,
      scrollingElement: root,
      querySelector: () => composer,
      getElementById: () => null,
      querySelectorAll(selector) {
        if (selector.startsWith('#prompt-textarea')) return [composer];
        if (selector === input.userMessageSelectors[0]) return users;
        if (selector === input.assistantMessageSelectors[0]) return assistants;
        return [];
      },
    };
    const location = { href: page.url() };
    return runInNewContext(`(${callback.toString()})(input)`, {
      input,
      document,
      location,
      window: { location, innerHeight: 800 },
      Element,
      HTMLElement: Element,
      HTMLInputElement: class {},
      HTMLTextAreaElement: class {},
      Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', pointerEvents: 'auto' }),
    });
  };
}

test('verified blank-home preparation clears blocking whitespace before owned typing despite retained hidden turns', async () => {
  const { clearComposerDraftForBlankHomeAudit, setComposerText } = await coreModule;
  for (const value of [' ', '\n']) {
    const page = makeEditablePage({ url: 'https://chatgpt.com/', value });
    addBlankHomeSemanticDom(page);
    const result = await clearComposerDraftForBlankHomeAudit(page);
    assert.equal(result.status, 'cleared');
    assert.equal(page.currentText(), '');
    assert.deepEqual(
      page.keyboardEvents.map((event) => event.key),
      ['Control+A', 'Backspace'],
    );
    await setComposerText(page, OWNED_DRAFT, {
      blankHomeProvenance: {
        kind: 'verified-blank-new-chat',
        source: 'prepare-new-conversation',
        url: page.url(),
        userMessageCount: 0,
        assistantMessageCount: 0,
        composerHasText: false,
      },
    });
    assert.equal(page.currentText(), OWNED_DRAFT);
    assert.equal(page.sendCount, 0);
  }
});

test('blank-home whitespace preparation rejects visible conversations and preserves concurrent draft edits', async () => {
  const { clearComposerDraftForBlankHomeAudit } = await coreModule;
  for (const url of ['https://chatgpt.com/', 'https://chatgpt.com/c/unowned']) {
    const page = makeEditablePage({ url, value: ' ' });
    addBlankHomeSemanticDom(page, { hiddenTurns: url !== 'https://chatgpt.com/' });
    assert.equal((await clearComposerDraftForBlankHomeAudit(page)).status, 'not-authorized');
    assert.equal(page.currentText(), ' ');
    assert.deepEqual(page.keyboardEvents, []);
    assert.equal(page.clickCount, 0);
  }
  const page = makeEditablePage({ url: 'https://chatgpt.com/', value: ' ' });
  addBlankHomeSemanticDom(page);
  const locator = page.locator();
  const click = locator.click;
  locator.click = async () => {
    await click();
    page.setText('Concurrent user draft');
  };
  assert.equal((await clearComposerDraftForBlankHomeAudit(page)).status, 'conflict');
  assert.equal(page.currentText(), 'Concurrent user draft');
  assert.deepEqual(page.keyboardEvents, []);
});

test('React composer drafts use trusted clear and type actions', async () => {
  const { clearOwnedComposerDraft, setComposerText } = await coreModule;
  const page = makeEditablePage({
    url: `https://chatgpt.com/c/${OWNED_CONVERSATION_ID}`,
  });
  const checkpoint = {};

  await setComposerText(page, OWNED_DRAFT, ownedOptions());
  assert.equal(page.currentText(), OWNED_DRAFT);

  const result = await clearOwnedComposerDraft(
    page,
    OWNED_DRAFT,
    ownedOptions({ checkpoint, scope: 'global:send-probe' }),
  );

  assert.equal(result.status, 'clean');
  assert.equal(page.currentText(), '');
  assert.deepEqual(
    page.keyboardEvents.map((event) => event.key || event.text),
    [OWNED_DRAFT, 'Control+A', 'Backspace'],
  );
  assert.equal(checkpoint.composerCleanupOutcomes.at(-1).scope, 'global:send-probe');
  assert.equal(JSON.stringify(checkpoint).includes(OWNED_DRAFT), false);
});

test('click-based structural clearing closes an open menu', async () => {
  const { setComposerText } = await coreModule;
  const page = makeEditablePage({
    url: `https://chatgpt.com/c/${OWNED_CONVERSATION_ID}`,
    value: '\n',
    menuOpen: true,
  });

  assert.equal(page.currentText(), '\n');
  assert.equal(page.currentTextContent(), '');
  await setComposerText(page, OWNED_DRAFT, ownedOptions());

  assert.equal(page.currentText(), OWNED_DRAFT);
  assert.equal(page.isMenuOpen(), false);
  assert.equal(page.clickCount, 2);
  assert.deepEqual(
    page.keyboardEvents.map((event) => event.key || event.text),
    ['Control+A', 'Backspace', OWNED_DRAFT],
  );
});

test('Study focus-only typing skips newline clearing after the plus menu opens', async () => {
  const { clearOwnedComposerDraft, setComposerText } = await coreModule;
  const page = makeEditablePage({
    url: `https://chatgpt.com/c/${OWNED_CONVERSATION_ID}`,
    value: '\n',
    menuOpen: true,
  });

  await setComposerText(page, 'study', ownedOptions({ focusOnly: true }));

  assert.equal(page.currentText(), 'study');
  assert.equal(page.isMenuOpen(), true);
  assert.equal(page.focusCount, 1);
  assert.equal(page.clickCount, 0);
  assert.deepEqual(
    page.keyboardEvents.map((event) => event.key || event.text),
    ['study'],
  );
  const cleanup = await clearOwnedComposerDraft(page, 'study', ownedOptions());
  assert.equal(cleanup.status, 'clean');
  assert.equal(page.currentText(), '');
  assert.equal(page.clickCount, 1);
  assert.equal(page.isMenuOpen(), false);
  assert.equal(page.sendCount, 0);
});

test('pre-menu structural cleanup clears only newline-only empty editor structure', async () => {
  const { prepareStructurallyBlankComposerForMenu } = await coreModule;
  const page = makeEditablePage({
    url: `https://chatgpt.com/c/${OWNED_CONVERSATION_ID}`,
    value: '\n',
  });

  const result = await prepareStructurallyBlankComposerForMenu(page);

  assert.deepEqual(result, { status: 'cleared' });
  assert.equal(page.currentText(), '');
  assert.equal(page.clickCount, 0);
  assert.deepEqual(
    page.keyboardEvents.map((event) => event.key || event.text),
    ['Control+A', 'Backspace'],
  );
});

test('changed user draft is preserved and reported as a conflict', async () => {
  const { clearOwnedComposerDraft, setComposerText } = await coreModule;
  const page = makeEditablePage({
    url: `https://chatgpt.com/c/${OWNED_CONVERSATION_ID}`,
  });
  const checkpoint = {};

  await setComposerText(page, OWNED_DRAFT, ownedOptions());
  // Simulate the user replacing the owned text after setup and before cleanup.
  page.setText(` ${OWNED_DRAFT} `);
  page.keyboardEvents.length = 0;

  const result = await clearOwnedComposerDraft(
    page,
    OWNED_DRAFT,
    ownedOptions({ checkpoint, scope: 'failed-case' }),
  );

  assert.equal(result.status, 'conflict');
  assert.equal(page.currentText(), ` ${OWNED_DRAFT} `);
  assert.deepEqual(page.keyboardEvents, []);
  assert.equal(checkpoint.composerCleanupOutcomes.at(-1).status, 'conflict');

  const unrelatedPage = makeEditablePage({
    url: 'https://chatgpt.com/c/unrelated-user-chat',
    value: 'Keep this unrelated draft',
  });
  await assert.rejects(() => setComposerText(unrelatedPage, OWNED_DRAFT, ownedOptions()));
  assert.equal(unrelatedPage.currentText(), 'Keep this unrelated draft');
  assert.deepEqual(unrelatedPage.keyboardEvents, []);
});

test('nonempty whitespace in textContent is preserved as an unowned draft', async () => {
  const { setComposerText } = await coreModule;
  const page = makeEditablePage({
    url: `https://chatgpt.com/c/${OWNED_CONVERSATION_ID}`,
    value: ' ',
    menuOpen: true,
  });

  await assert.rejects(
    () => setComposerText(page, 'study', ownedOptions({ focusOnly: true })),
    /unowned composer whitespace/,
  );
  assert.equal(page.currentText(), ' ');
  assert.equal(page.isMenuOpen(), true);
  assert.equal(page.clickCount, 0);
  assert.deepEqual(page.keyboardEvents, []);
});

test('failed probe cleanup clears its draft without submitting another prompt', async () => {
  const { clearOwnedComposerDraft, setComposerText } = await coreModule;
  const page = makeEditablePage({
    url: `https://chatgpt.com/c/${OWNED_CONVERSATION_ID}`,
  });
  const checkpoint = {};

  try {
    await setComposerText(page, OWNED_DRAFT, ownedOptions());
    throw new Error('Target wait failed after draft setup.');
  } catch (error) {
    assert.match(error.message, /Target wait failed/);
  } finally {
    await clearOwnedComposerDraft(
      page,
      OWNED_DRAFT,
      ownedOptions({
        checkpoint,
        scope: 'global:shortcutKeyClickSendButton',
      }),
    );
  }

  assert.equal(page.currentText(), '');
  assert.equal(page.sendCount, 0);
  assert.equal(
    page.keyboardEvents.some((event) => event.key === 'Enter'),
    false,
  );
  assert.equal(checkpoint.composerCleanupOutcomes.at(-1).status, 'clean');
});

test('composer cleanup conflicts downgrade pass without discarding activation evidence or draft privacy', async () => {
  const { finalizeProbeComposerCleanup } = await coreModule;
  const semantic = { status: 'pass', proofMethod: 'state-change', observed: 'target changed' };
  const routingProof = { status: 'observed', clickObserved: true };
  const targetProof = { status: 'present', observedTargetRef: 'composer-submit-button' };
  const row = {
    actionId: 'shortcutKeyStudy',
    status: 'pass',
    reason: 'The semantic postcondition passed.',
    semantic,
    routingProof,
    targetProof,
  };
  const completedCase = {
    rowId: 'global:shortcutKeyStudy',
    actionId: 'shortcutKeyStudy',
    status: 'pass',
    routingStatus: 'observed',
    semanticStatus: 'pass',
  };

  const result = await finalizeProbeComposerCleanup(
    [row],
    [completedCase],
    'shortcutKeyStudy',
    async () => ({ status: 'conflict', reason: 'Changed draft: PRIVATE COMPOSER TEXT' }),
  );

  assert.equal(result.cleanupStatus, 'conflict');
  assert.equal(result.downgraded, true);
  assert.equal(row.status, 'fail');
  assert.equal(completedCase.status, 'fail');
  assert.match(row.reason, /semantic postcondition passed/);
  assert.match(row.reason, /draft and preserved/);
  assert.match(completedCase.reason, /draft and preserved/);
  assert.doesNotMatch(JSON.stringify({ row, completedCase, result }), /PRIVATE COMPOSER TEXT/);
  assert.equal(row.semantic, semantic);
  assert.equal(row.routingProof, routingProof);
  assert.equal(row.targetProof, targetProof);
  assert.equal(completedCase.routingStatus, 'observed');
  assert.equal(completedCase.semanticStatus, 'pass');
});

test('failed and thrown composer cleanup prevent pass while keeping cleanup details private', async () => {
  const { finalizeProbeComposerCleanup } = await coreModule;
  for (const { cleanup, threw } of [
    {
      cleanup: async () => ({ status: 'failed', reason: 'Private draft was not cleared.' }),
      threw: false,
    },
    {
      cleanup: async () => {
        throw new Error('Private draft exception text.');
      },
      threw: true,
    },
  ]) {
    const row = {
      actionId: 'shortcutKeyClickSendButton',
      status: 'pass',
      reason: 'Send semantics passed.',
    };
    const completedCase = {
      rowId: 'global:shortcutKeyClickSendButton',
      actionId: 'shortcutKeyClickSendButton',
      status: 'pass',
    };
    const result = await finalizeProbeComposerCleanup(
      [row],
      [completedCase],
      'shortcutKeyClickSendButton',
      cleanup,
    );

    assert.equal(result.cleanupStatus, 'failed');
    assert.equal(result.cleanupThrew, threw);
    assert.equal(result.downgraded, true);
    assert.equal(row.status, 'fail');
    assert.equal(completedCase.status, 'fail');
    assert.match(row.reason, /could not verify/);
    assert.doesNotMatch(JSON.stringify({ row, completedCase, result }), /Private draft/);
  }
});

test('cleanup gate preserves an observed activation failure and treats clean or unowned drafts as no-ops', async () => {
  const { finalizeProbeComposerCleanup } = await coreModule;
  const failedRow = {
    actionId: 'shortcutKeyStudy',
    status: 'fail',
    reason: 'The shortcut did not activate the Study target.',
    semantic: { status: 'fail', reason: 'Target did not activate.' },
  };
  const failedCase = {
    rowId: 'global:shortcutKeyStudy',
    actionId: 'shortcutKeyStudy',
    status: 'coverage-gap',
    reason: 'Activation was not observed.',
  };
  const failureResult = await finalizeProbeComposerCleanup(
    [failedRow],
    [failedCase],
    'shortcutKeyStudy',
    async () => ({ status: 'conflict' }),
  );
  assert.equal(failureResult.downgraded, true);
  assert.equal(failedRow.status, 'fail');
  assert.match(failedRow.reason, /^The shortcut did not activate the Study target\./);
  assert.deepEqual(failedRow.semantic, { status: 'fail', reason: 'Target did not activate.' });
  assert.equal(failedCase.status, 'fail');
  assert.match(failedCase.reason, /^Activation was not observed\./);

  for (const status of ['clean', 'not-owned']) {
    const row = { actionId: 'shortcutKeyStudy', status: 'pass', reason: 'Activation passed.' };
    const completedCase = {
      rowId: 'global:shortcutKeyStudy',
      actionId: 'shortcutKeyStudy',
      status: 'pass',
    };
    const noOp = await finalizeProbeComposerCleanup(
      [row],
      [completedCase],
      'shortcutKeyStudy',
      async () => ({ status }),
    );
    assert.equal(noOp.downgraded, false);
    assert.equal(row.status, 'pass');
    assert.equal(completedCase.status, 'pass');
  }
});

class MinimalNode {
  constructor(nodeType, textContent = '') {
    this.nodeType = nodeType;
    this.TEXT_NODE = 3;
    this.COMMENT_NODE = 8;
    this.ELEMENT_NODE = 1;
    this.textContent = textContent;
    this.childNodes = [];
    this.attributes = [];
  }
}

class MinimalElement extends MinimalNode {
  constructor(tagName) {
    super(1);
    this.tagName = tagName.toUpperCase();
  }

  set innerHTML(markup) {
    this.childNodes = parseMinimalHtml(markup, this);
  }
}

class CaptureHTMLElement {
  constructor({ outerHTML = '', closestResults = {}, matches = [] } = {}) {
    this.outerHTML = outerHTML;
    this.closestResults = closestResults;
    this.matchesResults = new Set(matches);
    this.hidden = false;
  }

  closest(selector) {
    if (Object.hasOwn(this.closestResults, selector)) return this.closestResults[selector];
    return selector.includes('[data-message-author-role="assistant"]')
      ? this.closestResults.assistant || null
      : null;
  }

  matches(selector) {
    return this.matchesResults.has(selector);
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 };
  }
}

function parseMinimalHtml(markup, root) {
  const stack = [root];
  const voidTags = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);
  const tokens = String(markup).match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || [];
  for (const token of tokens) {
    if (token.startsWith('<!--')) {
      stack.at(-1).childNodes.push(new MinimalNode(8, token.slice(4, -3)));
      continue;
    }
    if (token.startsWith('</')) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (token.startsWith('<')) {
      const match = token.match(/^<([\w-]+)([\s\S]*?)\s*\/?>$/);
      if (!match) continue;
      const element = new MinimalElement(match[1]);
      const attributes = match[2].matchAll(/([\w:-]+)="([^"]*)"/g);
      element.attributes = [...attributes].map((attribute) => ({
        name: attribute[1],
        value: attribute[2],
      }));
      stack.at(-1).childNodes.push(element);
      if (!voidTags.has(match[1].toLowerCase()) && !token.endsWith('/>')) stack.push(element);
      continue;
    }
    stack.at(-1).childNodes.push(new MinimalNode(3, token));
  }
  return root.childNodes;
}

test('actual dump normalization preserves the codebox root class on the captured fragment', async () => {
  const { captureSupplementalProbeArtifact, loadDevScrapeWideContract } = await coreModule;
  const { exports, sanitizedSource } = await loadDevScrapeWideContract();
  const normalizeHtmlForDump = new Function(`${sanitizedSource}\nreturn normalizeHtmlForDump;`)();
  const wrapDefinition = exports.DUMP_REGISTRY.find(
    (definition) => definition.stateId === 'probe-codebox-wrap-enabled',
  );
  const assistant = new CaptureHTMLElement();
  const preBlock = new CaptureHTMLElement({ outerHTML: '<pre><code>audit code</code></pre>' });
  const codeNode = new CaptureHTMLElement({
    outerHTML: '<code>audit code</code>',
    closestResults: {
      '[aria-hidden="true"]': null,
      pre: preBlock,
      assistant,
    },
    matches: ['code'],
  });
  const rootElement = {
    classList: { contains: (className) => className === 'csp-codebox-wrap-enabled' },
    getAttribute: (name) => (name === 'class' ? 'csp-codebox-wrap-enabled' : null),
  };
  const captureDocument = {
    documentElement: rootElement,
    querySelectorAll: () => [codeNode],
  };
  const capturePage = {
    url: () => `https://chatgpt.com/c/${OWNED_CONVERSATION_ID}`,
    evaluate: (callback, input) =>
      runInNewContext(`(${callback.toString()})(input)`, {
        input,
        document: captureDocument,
        window: { innerWidth: 1200, innerHeight: 800 },
        Element: CaptureHTMLElement,
        HTMLElement: CaptureHTMLElement,
        getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
      }),
  };
  const artifact = await captureSupplementalProbeArtifact(capturePage, wrapDefinition, {
    auditOwned: true,
    semanticSnapshot: { codeboxWrapEnabled: true },
  });
  assert.equal(artifact.status, 'captured');
  assert.match(artifact.rawHtml, /^<div class="csp-codebox-wrap-enabled">/);

  const document = {
    implementation: {
      createHTMLDocument: () => ({
        createElement: (tagName) => new MinimalElement(tagName),
      }),
    },
  };

  const normalized = normalizeHtmlForDump({ document }, artifact.rawHtml);

  assert.match(normalized, /<div class="csp-codebox-wrap-enabled">/);
  assert.match(normalized, /<pre>/);
  assert.match(normalized, /<code>/);
  assert.doesNotMatch(normalized, /<html|<body/);
});
