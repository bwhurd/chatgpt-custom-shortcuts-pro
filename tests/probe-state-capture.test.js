const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');
const parse5 = require('parse5');
const modelPickerSelectors = require('../extension/shared/model-picker-selectors.js');

const coreModule = import('./playwright/lib/devscrape-wide-core.mjs');
const targetPresenceModule = import('./playwright/lib/shortcut-target-presence.mjs');

test('Edit presence captures only its prepared Chat button before opening the edit card', async () => {
  const core = await coreModule;
  const { exports: contract } = await core.loadDevScrapeWideContract();
  const definition = contract.DUMP_REGISTRY.find(
    (entry) => entry.stateId === 'probe-edit-message-button',
  );
  assert.ok(definition?.probeOnly);
  const inventory = await core.buildCurrentShortcutInventory([
    ...contract.DUMP_REGISTRY,
    ...contract.DEFERRED_ARTIFACTS,
  ]);
  const editTarget = inventory.targets.find((target) => target.targetId === 'edit-message-button');
  assert.deepEqual(editTarget.expectedFiles, [definition.filename]);
  const page = {
    url: () => 'https://chatgpt.com/c/audit-owned',
    evaluate: () => assert.fail('Edit capture must not scan conversation content'),
  };
  const buttonMarkup = '<button><svg><path d="M11.7313 verified-edit"/></svg></button>';
  let captured = false;
  const targetLocator = {
    evaluate: async (callback) => {
      captured = true;
      return callback({ outerHTML: buttonMarkup });
    },
  };
  const deferred = await core.captureSupplementalProbeArtifact(page, definition, { targetLocator });
  assert.equal(deferred.status, 'deferred');
  assert.equal(captured, false);
  const artifact = await core.captureSupplementalProbeArtifact(page, definition, {
    auditOwned: true,
    targetLocator,
  });
  assert.equal(artifact.status, 'captured');
  assert.equal(artifact.rawHtml, buttonMarkup);
  const presence = (await targetPresenceModule).evaluateTargetPresence(editTarget, {
    [definition.filename]: artifact.rawHtml,
  });
  assert.equal(presence.status, 'pass');
  const source = await readFile(
    path.join(__dirname, 'playwright/lib/devscrape-wide-core.mjs'),
    'utf8',
  );
  const preparation = source.slice(
    source.indexOf('export async function prepareActiveEditCardProbeState('),
    source.indexOf('export async function getStableUserEditScope('),
  );
  assert.ok(
    preparation.indexOf('options.onBeforeOpenEdit?.(editButton)') <
      preparation.indexOf('await editButton.click('),
  );
});

class FakeHTMLElement {
  constructor({
    outerHTML = '',
    rect = null,
    attributes = {},
    queryResults = {},
    queryAllResults = {},
    closestResults = {},
    closestFallback = null,
    matches = [],
    tagName = 'div',
    parentElement = null,
  } = {}) {
    this._outerHTML = outerHTML;
    this.rect = rect || { left: 10, top: 10, right: 110, bottom: 40, width: 100, height: 30 };
    this.attributes = attributes;
    this.queryResults = queryResults;
    this.queryAllResults = queryAllResults;
    this.closestResults = closestResults;
    this.closestFallback = closestFallback;
    this.matchesResults = new Set(matches);
    this.tagName = String(tagName).toUpperCase();
    this.parentElement = parentElement;
    this.childNodes = [];
    this.renderAppendedChildren = false;
    this.isConnected = true;
    this.hidden = false;
    this.disabled = false;
  }

  get outerHTML() {
    if (this.renderAppendedChildren) {
      const attributes = Object.entries(this.attributes)
        .map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${String(value)}"`))
        .join('');
      return `<${this.tagName.toLowerCase()}${attributes}>${this.childNodes
        .map((node) => node.outerHTML)
        .join('')}</${this.tagName.toLowerCase()}>`;
    }
    return this._outerHTML;
  }

  set outerHTML(value) {
    this._outerHTML = value;
  }

  closest(selector) {
    if (Object.hasOwn(this.closestResults, selector)) return this.closestResults[selector];
    return this.closestFallback;
  }

  querySelector(selector) {
    return this.queryResults[selector] || null;
  }

  querySelectorAll(selector) {
    return this.queryAllResults[selector] || [];
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

  getClientRects() {
    return [this.rect];
  }

  matches(selector) {
    return this.matchesResults.has(selector);
  }

  cloneNode(deep = false) {
    const clone = new FakeHTMLElement({
      outerHTML: this.outerHTML,
      rect: this.rect,
      attributes: { ...this.attributes },
      tagName: this.tagName,
    });
    if (deep) {
      clone.childNodes = this.childNodes.map((node) => node.cloneNode(true));
      for (const child of clone.childNodes) child.parentElement = clone;
    }
    return clone;
  }

  appendChild(node) {
    node.parentElement = this;
    this.childNodes.push(node);
    this.renderAppendedChildren = true;
    return node;
  }
}

function makeEvaluationPage(
  document,
  url = 'https://chatgpt.com/c/audit-owned',
  onEvaluate = null,
  injectedWorkResolver = null,
) {
  const windowObj = { innerWidth: 1200, innerHeight: 800, Element: FakeHTMLElement };
  windowObj.getComputedStyle = (node) => ({
    display: 'block',
    visibility: 'visible',
    pointerEvents: 'auto',
    position: node?.position || 'static',
  });
  return {
    url: () => url,
    evaluate(callback, input) {
      if (input?.selectorSource && input?.source) {
        assert.match(input.selectorSource, /getNativeChatWorkSurfaceRadios/);
        windowObj.CSPModelPickerSelectors = {
          getNativeChatWorkSurfaceRadios:
            injectedWorkResolver || modelPickerSelectors.getNativeChatWorkSurfaceRadios,
          isChatWorkSurfaceSelected: modelPickerSelectors.isChatWorkSurfaceSelected,
        };
        return undefined;
      }
      onEvaluate?.(input);
      return runInNewContext(`(${callback.toString()})(input)`, {
        input,
        document,
        window: windowObj,
        Element: FakeHTMLElement,
        HTMLElement: FakeHTMLElement,
        getComputedStyle: windowObj.getComputedStyle,
      });
    },
    async waitForFunction(callback, argument, options = {}) {
      const deadline = Date.now() + Number(options.timeout || 1000);
      do {
        const result = runInNewContext(`(${callback.toString()})(argument)`, {
          argument,
          document,
          window: windowObj,
          Element: FakeHTMLElement,
          HTMLElement: FakeHTMLElement,
          getComputedStyle: windowObj.getComputedStyle,
        });
        if (result) return result;
        await new Promise((resolve) => setTimeout(resolve, 1));
      } while (Date.now() < deadline);
      throw new Error('fake waitForFunction timed out');
    },
  };
}

function makeNormalizerWindow() {
  const toDomNode = (parsedNode) => {
    const nodeType =
      parsedNode.nodeName === '#text' ? 3 : parsedNode.nodeName === '#comment' ? 8 : 1;
    return {
      nodeType,
      TEXT_NODE: 3,
      COMMENT_NODE: 8,
      ELEMENT_NODE: 1,
      tagName: parsedNode.tagName,
      textContent: parsedNode.value ?? parsedNode.data ?? '',
      attributes: (parsedNode.attrs || []).map((attribute) => ({
        name: attribute.name,
        value: attribute.value,
      })),
      childNodes: (parsedNode.childNodes || []).map(toDomNode),
    };
  };
  const document = {
    implementation: {
      createHTMLDocument() {
        return {
          createElement() {
            const container = { childNodes: [] };
            Object.defineProperty(container, 'innerHTML', {
              set(value) {
                container.childNodes = parse5
                  .parseFragment(String(value))
                  .childNodes.map(toDomNode);
              },
            });
            return container;
          },
        };
      },
    },
  };
  return { document };
}

function makeEditableComposerPage(url) {
  const keyboardEvents = [];
  let value = '';
  let selected = false;
  const editable = {
    tagName: 'DIV',
    get innerText() {
      return value;
    },
    get textContent() {
      return value;
    },
  };
  const locator = {
    count: async () => 1,
    nth: () => locator,
    isVisible: async () => true,
    click: async () => {},
    evaluate: async (callback) => callback(editable),
  };
  return {
    url: () => url,
    keyboardEvents,
    sendCount: 0,
    locator: () => locator,
    keyboard: {
      type: async (text) => {
        keyboardEvents.push({ type: 'type', text });
        value += text;
      },
      press: async (key) => {
        keyboardEvents.push({ type: 'press', key });
        if (key === 'Control+A') selected = true;
        if (key === 'Backspace' && selected) {
          value = '';
          selected = false;
        }
      },
    },
    waitForTimeout: async () => {},
    currentText: () => value,
  };
}

async function getProbeDefinitions() {
  const { loadDevScrapeWideContract } = await coreModule;
  const { exports } = await loadDevScrapeWideContract();
  return exports.DUMP_REGISTRY.filter((definition) => definition.probeOnly === true);
}

test('prepare/capture-only selects registered probe states and leaves activations unverified', async () => {
  const core = await coreModule;
  const definitions = await getProbeDefinitions();
  const actionIds = core.getProbeOnlyCaptureActionIds();

  assert.equal(definitions.length, 13);
  // SendEdit also captures its Edit opener, so 13 states use 12 preparation actions.
  assert.deepEqual(actionIds, [
    'shortcutKeyCopyAllCodeBlocks',
    'shortcutKeyToggleCodeboxWrap',
    'shortcutKeySendEdit',
    'shortcutKeyClickSendButton',
    'shortcutKeyClickStopButton',
    'shortcutKeyTemporaryChat',
    'shortcutKeyNewGptConversation',
    'shortcutKeyNewConversation',
    'shortcutKeyStudy',
    'shortcutKeyDeepResearch',
    'shortcutKeyCancelDictation',
    'shortcutKeyToggleDictate',
  ]);
  assert.throws(
    () => core.getProbeOnlyCaptureActionIds(['shortcutKeySearchConversationHistory']),
    /No probe-only state capture is registered/,
  );

  const row = core.buildCaptureOnlyLiveProbeRow(
    {
      actionId: 'shortcutKeyClickSendButton',
      label: 'Send',
      defaultCode: 'Enter',
      activationProbeMode: 'click-target',
      activationProbeExpectedTargetRef: 'send-button',
    },
    {
      stateId: 'probe-send-button',
      status: 'captured',
    },
  );

  assert.equal(row.status, 'not-live-probed');
  assert.equal(row.dispatchCode, '');
  assert.equal(row.stateCapture.status, 'captured');
  assert.equal(row.semantic.status, 'not-run');
  assert.match(row.reason, /activation was intentionally not dispatched/);
});

test('capture-only failures downgrade shared artifact and checkpoint state without changing activation status', async () => {
  const core = await coreModule;
  const actionId = 'shortcutKeyClickStopButton';
  const stateId = 'probe-stop-button';
  const shortcut = {
    actionId,
    label: 'Stop',
    defaultCode: 'Escape',
    activationProbeMode: 'click-target',
    activationProbeExpectedTargetRef: 'stop-button',
  };
  const artifact = {
    filename: '3e_Probe_StopButton.txt',
    stateId,
    label: 'Probe stop button',
    status: 'captured',
    error: null,
    rawHtml: '<button>private draft text</button>',
    captureBytes: 39,
    clickPath: [],
  };
  const supplementalArtifactByState = new Map([[stateId, artifact]]);
  const row = core.buildCaptureOnlyLiveProbeRow(shortcut, artifact);
  const completedCase = {
    actionId,
    status: 'not-live-probed',
    captureStatus: 'captured',
  };
  const checkpoint = { completedCases: [completedCase] };

  core.recordCaptureOnlyFailure({
    actionId,
    supplementalArtifactByState,
    rows: [row],
    checkpoint,
    failureType: 'cleanup',
  });

  const failedArtifact = supplementalArtifactByState.get(stateId);
  assert.equal(failedArtifact.status, 'failed');
  assert.equal(failedArtifact.rawHtml, '');
  assert.equal(failedArtifact.captureBytes, 0);
  assert.match(failedArtifact.error, /cleanup failed/);
  assert.equal(JSON.stringify(failedArtifact).includes('private draft text'), false);
  assert.equal(row.status, 'not-live-probed');
  assert.equal(row.stateCapture.status, 'failed');
  assert.equal(row.stateCapture.cleanupStatus, 'failed');
  assert.equal(row.semantic.status, 'not-run');
  assert.equal(completedCase.status, 'not-live-probed');
  assert.equal(completedCase.captureStatus, 'failed');
  assert.equal(completedCase.captureCleanupStatus, 'failed');
  assert.equal(checkpoint.captureCleanupFailures[0].stateId, stateId);
  assert.match(checkpoint.captureCleanupFailures[0].reason, /cleanup failed/);

  const deferredArtifact = { ...artifact, status: 'deferred', rawHtml: '', captureBytes: 0 };
  const deferredArtifacts = new Map([[stateId, deferredArtifact]]);
  const setupRow = core.buildCaptureOnlyLiveProbeRow(shortcut, deferredArtifact);
  const setupCase = { actionId, status: 'not-live-probed', captureStatus: 'deferred' };
  core.recordCaptureOnlyFailure({
    actionId,
    supplementalArtifactByState: deferredArtifacts,
    rows: [setupRow],
    checkpoint: { completedCases: [setupCase] },
    failureType: 'setup',
  });
  assert.equal(deferredArtifacts.get(stateId).status, 'failed');
  assert.match(deferredArtifacts.get(stateId).error, /setup failed/);
  assert.equal(setupRow.status, 'not-live-probed');
  assert.equal(setupRow.stateCapture.status, 'failed');
  assert.equal(setupRow.semantic.status, 'not-run');
  assert.equal(setupCase.captureStatus, 'failed');
});

test('capture failure preserves its local diagnostic while display reasons stay generic', async () => {
  const core = await coreModule;
  const actionId = 'shortcutKeyClickStopButton';
  const diagnosticError = 'Original preparation timeout: private conversation detail';
  const artifact = { stateId: 'probe-stop-button', status: 'failed', error: 'generic' };
  const artifacts = new Map([[artifact.stateId, artifact]]);
  const row = core.buildCaptureOnlyLiveProbeRow({ actionId }, artifact);
  const completedCase = { actionId, captureStatus: 'failed' };
  const options = {
    actionId,
    supplementalArtifactByState: artifacts,
    rows: [row],
    checkpoint: { completedCases: [completedCase] },
  };
  core.recordCaptureOnlyFailure({ ...options, diagnosticError });
  core.recordCaptureOnlyFailure(options);

  assert.equal(row.stateCapture.diagnosticError, diagnosticError);
  assert.equal(completedCase.diagnosticError, diagnosticError);
  assert.equal(row.reason.includes('private conversation detail'), false);
  assert.equal(row.stateCapture.error, row.reason);
  assert.equal(completedCase.reason, row.reason);
  assert.equal(artifacts.get(artifact.stateId).error, row.reason);
  assert.equal(JSON.stringify(artifacts.get(artifact.stateId)).includes(diagnosticError), false);
});

test('two-turn fixture dependency follows selected action and fixed-contract metadata', async () => {
  const core = await coreModule;
  const { exports } = await core.loadDevScrapeWideContract();
  const inventory = await core.buildCurrentShortcutInventory([
    ...(exports.DUMP_REGISTRY || []),
    ...(exports.DEFERRED_ARTIFACTS || []),
  ]);
  const sendEdit = inventory.shortcuts.find((row) => row.actionId === 'shortcutKeySendEdit');
  const searchChats = inventory.shortcuts.find(
    (row) => row.actionId === 'shortcutKeySearchConversationHistory',
  );
  const scrollShortcuts = inventory.shortcuts.filter((row) => {
    const setup = String(row.activationProbeSetup || '');
    return (
      ['scroll-from-top', 'scroll-from-bottom'].includes(setup) ||
      setup.startsWith('message-scroll-')
    );
  });

  assert.ok(sendEdit);
  assert.ok(searchChats);
  assert.equal(scrollShortcuts.length, 6);
  for (const shortcut of scrollShortcuts) {
    assert.equal(
      core.requiresAuditOwnedTwoTurnFixture({
        onlyActionIds: [shortcut.actionId],
        shortcuts: inventory.shortcuts,
      }),
      true,
      `${shortcut.actionId} requires its audit-owned scroll fixture`,
    );
  }
  assert.equal(
    core.requiresAuditOwnedTwoTurnFixture({
      onlyActionIds: [sendEdit.actionId, searchChats.actionId],
      shortcuts: inventory.shortcuts,
    }),
    false,
  );
  assert.equal(
    core.requiresAuditOwnedTwoTurnFixture({
      onlyActionIds: scrollShortcuts.map((row) => row.actionId),
      shortcuts: inventory.shortcuts,
    }),
    true,
  );
  assert.equal(core.requiresAuditOwnedTwoTurnFixture({ phase: 'all' }), true);
  assert.equal(core.requiresAuditOwnedTwoTurnFixture({ phase: 'model' }), false);
  assert.equal(
    core.requiresAuditOwnedTwoTurnFixture({ fixedContractIds: ['response-navigation-preview'] }),
    false,
    'The retired response navigation contract does not require a two-turn fixture',
  );
});

test('prepared capture cleanup stops only owned native controls without shortcut dispatch', async () => {
  const { cleanupPreparedCaptureState } = await coreModule;
  for (const setup of ['in-flight-message', 'dictation-active']) {
    const interactions = [];
    let controlCount = 1;
    const control = {
      filter: () => control,
      count: async () => controlCount,
      click: async () => interactions.push('native-control-click'),
      waitFor: async ({ state }) => interactions.push(`control-${state}`),
    };
    const page = {
      url: () => 'https://chatgpt.com/c/audit-cleanup',
      locator: () => control,
      waitForFunction: async () => {},
      keyboard: { press: async () => assert.fail('Cleanup must not dispatch shortcuts.') },
    };
    const shortcut = { activationProbeSetup: setup };
    await assert.rejects(cleanupPreparedCaptureState(page, shortcut), /audit-owned page/);
    assert.deepEqual(interactions, []);
    const ownership = { auditOwnedConversationIds: ['audit-cleanup'] };
    controlCount = 2;
    await assert.rejects(cleanupPreparedCaptureState(page, shortcut, ownership), /ambiguous/);
    assert.deepEqual(interactions, []);
    controlCount = 1;
    assert.deepEqual(await cleanupPreparedCaptureState(page, shortcut, ownership), {
      status: 'clean',
    });
    assert.deepEqual(interactions, ['native-control-click', 'control-hidden']);
    controlCount = 0;
    assert.deepEqual(await cleanupPreparedCaptureState(page, shortcut, ownership), {
      status: 'clean',
    });
    assert.equal(interactions.length, 2);
  }
});

test('current New Conversation metadata reaches the owned source setup with composer postcondition', async () => {
  const { loadDevScrapeWideContract, buildCurrentShortcutInventory } = await coreModule;
  const { exports } = await loadDevScrapeWideContract();
  const inventory = await buildCurrentShortcutInventory([
    ...(exports.DUMP_REGISTRY || []),
    ...(exports.DEFERRED_ARTIFACTS || []),
  ]);
  const shortcut = inventory.shortcuts.find((row) => row.actionId === 'shortcutKeyNewConversation');
  assert.ok(shortcut);
  assert.equal(shortcut.activationProbeSetup, 'new-conversation');
  assert.equal(shortcut.activationProbeMode, 'opens-target');
  assert.equal(shortcut.activationProbeExpectedTargetRef, 'prompt-textarea');
  assert.ok(!shortcut.activationProbeUiStateRefs.includes('temporary-chat-button'));
});

test('Study plus-menu query setup preserves its prepared composer and menu through dispatch', async () => {
  const { shouldPreservePreparedProbeState } = await coreModule;

  assert.equal(
    shouldPreservePreparedProbeState({
      actionId: 'shortcutKeyStudy',
      activationProbeSetup: 'composer-plus-menu-search-study',
      activationProbeUiStateRefs: [],
      requiredUiStateRefs: [],
    }),
    true,
  );
  assert.equal(
    shouldPreservePreparedProbeState({
      actionId: 'shortcutKeyStudy',
      activationProbeSetup: 'composer-plus-menu',
      activationProbeUiStateRefs: [],
      requiredUiStateRefs: [],
    }),
    false,
  );
  assert.equal(
    shouldPreservePreparedProbeState({
      actionId: 'shortcutKeyTemporaryChat',
      activationProbeSetup: 'other-setup',
      activationProbeUiStateRefs: ['composer-buttons-exposed'],
      requiredUiStateRefs: [],
    }),
    true,
  );
});

test('probe setup readiness failures retain the exact stage before each wait', async () => {
  const core = await coreModule;
  for (const prepare of [
    core.prepareNewConversationProbeState,
    core.prepareComposerDraftMessageProbeState,
    core.prepareInFlightMessageProbeState,
    core.prepareActiveEditCardProbeState,
    core.prepareSentUserMessageProbeState,
  ]) {
    const checkpoint = { currentCase: {} };
    const persistedStages = [];
    const timeout = new Error('readiness timeout');
    const options = {
      checkpoint,
      async persistCheckpoint() {
        persistedStages.push(checkpoint.currentCase.diagnosticStage);
      },
    };
    const page = {
      async goto(url, navigationOptions) {
        assert.equal(checkpoint.currentCase.diagnosticStage, 'new-conversation.home-navigation');
        assert.equal(url, 'https://chatgpt.com/');
        assert.deepEqual(navigationOptions, { waitUntil: 'domcontentloaded', timeout: 45000 });
      },
      async waitForFunction(_callback, input, waitOptions) {
        assert.equal(checkpoint.currentCase.diagnosticStage, 'new-conversation.home-ready');
        assert.equal(input.expectedFixtureUrl, 'https://chatgpt.com/');
        assert.equal(waitOptions.timeout, 15000);
        throw timeout;
      },
    };
    await assert.rejects(prepare(page, 'https://chatgpt.com/c/owned', options), (error) => {
      assert.equal(error, timeout);
      return true;
    });
    assert.deepEqual(persistedStages, [
      'new-conversation.home-navigation',
      'new-conversation.home-ready',
    ]);
    assert.deepEqual(checkpoint.currentCase, { diagnosticStage: 'new-conversation.home-ready' });
  }
});

test('active edit-card setup uses the canonical Edit icon with its localized-label fallback', async () => {
  const source = await readFile(
    path.join(__dirname, 'playwright/lib/devscrape-wide-core.mjs'),
    'utf8',
  );
  assert.match(
    source,
    /const editButton = userTurn\s*\.locator\('button:has\(svg path\[d\^="M11\.7313"\]\), button\[aria-label="Edit message"\]'\)\s*\.first\(\);/,
  );
});

function makeUserMessageLocatorPage(selectorNodes) {
  const wrap = (nodes) => ({
    filter: ({ visible }) => wrap(nodes.filter((node) => (node.visible !== false) === visible)),
    last: () => wrap(nodes.slice(-1)),
    count: async () => nodes.length,
    evaluate: async (callback) => callback(nodes[0]),
    locator: (selector) => {
      assert.equal(selector, 'xpath=..');
      return wrap(nodes.map((node) => node.parentElement).filter(Boolean));
    },
    nodes,
  });
  return { locator: (selector) => wrap(selectorNodes[selector] || []) };
}

test('latest user bubble resolves its own wrapper containing sibling Edit controls', async () => {
  const { getLatestUserMessageLocator } = await coreModule;
  const turnSelector =
    '[data-chatgpt-search-unit-key$=":user"], [data-testid^="conversation-turn-"], [data-turn-key], article[data-turn="user"]';
  const oldTurn = new FakeHTMLElement({ matches: [turnSelector] });
  const latestTurn = new FakeHTMLElement({ matches: [turnSelector] });
  const oldBubble = new FakeHTMLElement({ parentElement: oldTurn });
  const bubbleParent = new FakeHTMLElement({ parentElement: latestTurn });
  const latestBubble = new FakeHTMLElement({ parentElement: bubbleParent });
  const editButton = new FakeHTMLElement({ tagName: 'button', parentElement: bubbleParent });
  bubbleParent.childNodes = [latestBubble, editButton];
  const hiddenLegacyMessage = new FakeHTMLElement();
  hiddenLegacyMessage.visible = false;
  const page = makeUserMessageLocatorPage({
    '[data-message-author-role="user"]': [hiddenLegacyMessage],
    '[data-user-message-bubble="true"]': [oldBubble, latestBubble],
    '[data-chatgpt-search-unit-key$=":user"]': [oldTurn, latestTurn],
  });

  const locator = await getLatestUserMessageLocator(page);
  assert.equal(locator.nodes[0], latestTurn);
  assert.notEqual(locator.nodes[0], oldTurn);
  assert.ok(bubbleParent.childNodes.includes(editButton));
  assert.equal(latestBubble.childNodes.length, 0);
});

test('user-message scope never climbs beyond the bounded turn ancestor search', async () => {
  const { getLatestUserMessageLocator } = await coreModule;
  const turnSelector =
    '[data-chatgpt-search-unit-key$=":user"], [data-testid^="conversation-turn-"], [data-turn-key], article[data-turn="user"]';
  let ancestor = new FakeHTMLElement({ matches: [turnSelector] });
  for (let depth = 0; depth < 11; depth += 1) {
    ancestor = new FakeHTMLElement({ parentElement: ancestor });
  }
  const message = ancestor;
  const page = makeUserMessageLocatorPage({ '[data-user-message-bubble="true"]': [message] });
  const locator = await getLatestUserMessageLocator(page);
  assert.equal(locator.nodes[0], message);
});

test('Edit setup selects native Chat on a verified blank audit root before sending', async () => {
  const { selectChatModeForEditProbe } = await coreModule;
  const provenance = {
    kind: 'verified-blank-new-chat',
    source: 'prepare-new-conversation',
    url: 'https://chatgpt.com/',
    userMessageCount: 0,
    assistantMessageCount: 0,
    composerHasText: false,
  };
  for (const selectedAttribute of ['aria-pressed', 'aria-checked']) {
    const chat = new FakeHTMLElement({ attributes: { [selectedAttribute]: 'false' } });
    const work = new FakeHTMLElement({ attributes: { [selectedAttribute]: 'true' } });
    let clicks = 0;
    chat.click = () => {
      clicks += 1;
      chat.attributes[selectedAttribute] = 'true';
      work.attributes[selectedAttribute] = 'false';
    };
    work.click = () => assert.fail('Edit setup must select Chat, not toggle the current mode');
    const page = makeEvaluationPage({}, provenance.url, null, () => [chat, work]);
    await selectChatModeForEditProbe(page, provenance);
    assert.equal(clicks, 1);
    assert.equal(chat.getAttribute(selectedAttribute), 'true');
    await selectChatModeForEditProbe(page, provenance);
    assert.equal(clicks, 1, 'an already selected Chat surface must remain selected');
  }
  const source = await readFile(
    path.join(__dirname, 'playwright/lib/devscrape-wide-core.mjs'),
    'utf8',
  );
  const preparation = source.slice(
    source.indexOf('async function prepareSentDisposableMessage('),
    source.indexOf('export async function prepareActiveEditCardProbeState('),
  );
  assert.ok(
    preparation.indexOf('selectChatModeForEditProbe(page, blankNewChatProvenance)') <
      preparation.indexOf('setComposerText(page, SIDE_EFFECT_MESSAGE_TEXT)'),
  );
});

test('Edit Chat preparation rejects an existing conversation before any browser action', async () => {
  const { selectChatModeForEditProbe } = await coreModule;
  const page = {
    url: () => 'https://chatgpt.com/c/existing',
    evaluate: () => assert.fail('must not act on an existing conversation'),
    waitForFunction: () => assert.fail('must not inspect an existing conversation'),
  };
  await assert.rejects(
    selectChatModeForEditProbe(page, {
      kind: 'verified-blank-new-chat',
      source: 'prepare-new-conversation',
      url: 'https://chatgpt.com/',
      userMessageCount: 0,
      assistantMessageCount: 0,
      composerHasText: false,
    }),
    /verified blank audit chat/,
  );
});

test('active Edit pins the user wrapper independently of the disappearing bubble and preserves focus', async () => {
  const { getStableUserEditScope, shouldPreservePreparedProbeState } = await coreModule;
  const wrapper = new FakeHTMLElement({
    attributes: { 'data-chatgpt-search-unit-key': 'audit-owned:user' },
  });
  const stableLocator = {};
  const page = {
    locator(selector) {
      assert.equal(selector, '[data-chatgpt-search-unit-key="audit-owned:user"]');
      return stableLocator;
    },
  };
  assert.equal(
    await getStableUserEditScope(page, { evaluate: async (callback) => callback(wrapper) }),
    stableLocator,
  );
  const escapedWrapper = new FakeHTMLElement({
    attributes: { 'data-chatgpt-search-unit-key': 'audit\\owned"unit:user' },
  });
  assert.equal(
    await getStableUserEditScope(
      {
        locator(selector) {
          assert.equal(selector, '[data-chatgpt-search-unit-key="audit\\\\owned\\"unit:user"]');
          return stableLocator;
        },
      },
      { evaluate: async (callback) => callback(escapedWrapper) },
    ),
    stableLocator,
  );
  await assert.rejects(
    getStableUserEditScope(page, {
      evaluate: async (callback) => callback(new FakeHTMLElement()),
    }),
    /no stable wrapper identity/,
  );
  assert.equal(
    shouldPreservePreparedProbeState({ activationProbeSetup: 'active-edit-card' }),
    true,
  );
  const source = await readFile(
    path.join(__dirname, 'playwright/lib/devscrape-wide-core.mjs'),
    'utf8',
  );
  const setup = source.slice(
    source.indexOf('export async function prepareActiveEditCardProbeState('),
    source.indexOf('export async function getStableUserEditScope('),
  );
  assert.match(setup, /editScope\s*\.locator\('textarea, \[contenteditable="true"\]'\)/);
  assert.doesNotMatch(setup, /page\.locator\('textarea, \[contenteditable="true"\]'\)/);
});

test('probe diagnostic persistence failures retain local attribution and the original setup error', async () => {
  const { prepareNewConversationProbeState } = await coreModule;
  const checkpoint = { currentCase: {} };
  const navigationError = new Error('navigation timeout');
  await assert.rejects(
    prepareNewConversationProbeState(
      {
        async goto() {
          throw navigationError;
        },
      },
      '',
      {
        diagnosticCheckpoint: checkpoint,
        async diagnosticPersistCheckpoint() {
          throw new Error('checkpoint unavailable');
        },
      },
    ),
    (error) => {
      assert.equal(error, navigationError);
      return true;
    },
  );
  assert.deepEqual(checkpoint.currentCase, { diagnosticStage: 'new-conversation.home-navigation' });
});

test('blank-home timeout diagnostics distinguish retained hidden turns without weakening proof', async () => {
  const { captureBlankHomePostconditionStatus } = await coreModule;
  const hiddenParent = new FakeHTMLElement({ attributes: { 'aria-hidden': 'true' } });
  const hiddenUser = new FakeHTMLElement({
    rect: { width: 0, height: 0 },
    parentElement: hiddenParent,
  });
  const visibleAssistant = new FakeHTMLElement();
  const composer = new FakeHTMLElement();
  composer.innerText = '';
  const page = {
    evaluate(callback, input) {
      const document = {
        querySelectorAll(selector) {
          if (input.composerSelectors.includes(selector)) return [composer];
          if (input.userMessageSelectors.includes(selector)) return [hiddenUser];
          if (input.assistantMessageSelectors.includes(selector)) return [visibleAssistant];
          return [];
        },
      };
      return runInNewContext(`(${callback.toString()})(input)`, {
        input,
        document,
        window: { location: { href: 'https://chatgpt.com/' } },
        URL,
        HTMLElement: FakeHTMLElement,
        HTMLInputElement: class {},
        HTMLTextAreaElement: class {},
        getComputedStyle: () => ({
          display: 'block',
          visibility: 'visible',
          pointerEvents: 'auto',
        }),
      });
    },
  };
  const result = await captureBlankHomePostconditionStatus(page, 'https://chatgpt.com/c/owned');
  assert.equal(result.sourceUrlChanged, true);
  assert.equal(result.isChatGptRootPage, true);
  assert.equal(result.hasVisibleComposer, true);
  assert.equal(result.userMessageCount, 0);
  assert.equal(result.rawUserMessageCount, 1);
  assert.equal(result.assistantMessageCount, 1);
  assert.equal(result.renderedUserMessageCount, 0);
  assert.equal(result.renderedAssistantMessageCount, 1);
  assert.equal(result.hiddenAncestorUserMessageCount, 1);
  assert.equal(result.hiddenAncestorAssistantMessageCount, 0);
  assert.equal(result.satisfied, false);
  assert.ok(Object.values(result).every((value) => ['boolean', 'number'].includes(typeof value)));
});

test('production blank-home wait and semantic snapshot ignore retained hidden turns but count rendered offscreen turns', async () => {
  const core = await coreModule;
  const hiddenParent = new FakeHTMLElement({ attributes: { 'aria-hidden': 'true' } });
  const makeMessage = (parentElement = null) => {
    const node = new FakeHTMLElement({ parentElement });
    node.textContent = 'owned fixture';
    node.compareDocumentPosition = () => 4;
    return node;
  };
  const users = [makeMessage(hiddenParent), makeMessage(hiddenParent)];
  const assistants = [makeMessage(hiddenParent), makeMessage(hiddenParent)];
  const composer = new FakeHTMLElement();
  composer.innerText = '';
  composer.contains = () => false;
  const hiddenComposer = new FakeHTMLElement({ rect: { width: 0, height: 0 } });
  hiddenComposer.innerText = 'retained inactive draft';
  const root = {
    classList: { contains: () => false },
    scrollTop: 0,
    scrollHeight: 800,
    clientHeight: 800,
  };
  let href = 'https://chatgpt.com/';
  let alternateUsers = [];
  const page = {
    evaluate(callback, input) {
      const document = {
        title: '',
        activeElement: null,
        documentElement: root,
        scrollingElement: root,
        getElementById: () => null,
        querySelector: () => hiddenComposer,
        querySelectorAll(selector) {
          if (
            selector.startsWith('#prompt-textarea') ||
            input.composerSelectors?.includes(selector)
          )
            return [hiddenComposer, composer];
          if (selector === input.userMessageSelectors?.[0]) return users;
          if (selector === input.userMessageSelectors?.[1]) return alternateUsers;
          if (selector === input.assistantMessageSelectors?.[0]) return assistants;
          return [];
        },
      };
      const location = { href };
      return runInNewContext(`(${callback.toString()})(input)`, {
        input,
        document,
        location,
        window: { location, innerHeight: 800 },
        URL,
        Element: FakeHTMLElement,
        HTMLElement: FakeHTMLElement,
        HTMLInputElement: class {},
        HTMLTextAreaElement: class {},
        Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
        getComputedStyle: (node) => ({
          display: 'block',
          visibility: 'visible',
          pointerEvents: node === composer || node === hiddenComposer ? 'auto' : 'none',
        }),
      });
    },
    async waitForFunction(callback, input) {
      if (!this.evaluate(callback, input)) throw new Error('postcondition not satisfied');
    },
  };
  const sourceUrl = 'https://chatgpt.com/c/owned';
  const hiddenSnapshot = await core.captureLiveProbeSemanticSnapshot(page, null);
  assert.equal(hiddenSnapshot.hasComposer, true);
  assert.equal(
    hiddenSnapshot.composerHasText,
    false,
    'hidden first composer does not supply draft text',
  );
  assert.equal(hiddenSnapshot.messageCount, 0);
  assert.equal(hiddenSnapshot.userMessageCount, 0);
  assert.equal(hiddenSnapshot.assistantMessageCount, 0);
  const status = await core.captureBlankHomePostconditionStatus(page, sourceUrl);
  assert.equal(status.rawUserMessageCount, 2);
  assert.equal(status.rawAssistantMessageCount, 2);
  assert.equal(status.hiddenAncestorUserMessageCount, 2);
  assert.equal(status.hiddenAncestorAssistantMessageCount, 2);
  await core.waitForVerifiedBlankConversationAfterShortcut(page, sourceUrl);
  assert.equal(status.satisfied, true);

  delete hiddenParent.attributes['aria-hidden'];
  for (const node of [...users, ...assistants])
    node.rect = { width: 100, height: 30, top: -10000, bottom: -9970 };
  alternateUsers = [...users, makeMessage()];
  href = sourceUrl;
  const before = await core.captureLiveProbeSemanticSnapshot(page, null);
  assert.equal(before.userMessageCount, 2, 'ordered selector priority avoids alias duplication');
  assert.equal(before.assistantMessageCount, 2);
  before.auditOwnedFixtureConversation = true;
  href = 'https://chatgpt.com/';
  const visibleAfter = await core.captureLiveProbeSemanticSnapshot(page, null);
  assert.equal(visibleAfter.messageCount, 4, 'offscreen rendered messages remain active');
  assert.equal((await core.captureBlankHomePostconditionStatus(page, sourceUrl)).satisfied, false);
  await assert.rejects(
    core.waitForVerifiedBlankConversationAfterShortcut(page, sourceUrl),
    /postcondition/,
  );
  hiddenParent.attributes['aria-hidden'] = 'true';
  alternateUsers = [];
  const after = await core.captureLiveProbeSemanticSnapshot(page, null);
  const proof = core.evaluateLiveProbeSemantic(
    { actionId: 'shortcutKeyNewConversation', activationProbeMode: 'opens-target' },
    null,
    before,
    after,
  );
  assert.equal(proof.status, 'pass');
});

test('probe capture failures stay separate from semantics and wrap capture needs observed enabled state', async () => {
  const core = await coreModule;
  const definitions = await getProbeDefinitions();
  const wrapDefinition = definitions.find(
    (definition) => definition.stateId === 'probe-codebox-wrap-enabled',
  );
  const sendDefinition = definitions.find(
    (definition) => definition.stateId === 'probe-send-button',
  );
  const codeDefinition = definitions.find(
    (definition) => definition.stateId === 'probe-code-block-content',
  );
  const gptDefinition = definitions.find(
    (definition) => definition.stateId === 'probe-new-gpt-conversation',
  );
  assert.ok(wrapDefinition);
  assert.ok(sendDefinition);
  assert.ok(codeDefinition);
  assert.ok(gptDefinition);

  let evaluationCount = 0;
  const assistantContainer = new FakeHTMLElement({ outerHTML: '<article>assistant</article>' });
  const preBlock = new FakeHTMLElement({ outerHTML: '<pre><code>audit code</code></pre>' });
  const codeNode = new FakeHTMLElement({
    outerHTML: '<code>audit code</code>',
    closestResults: {
      '[aria-hidden="true"]': null,
      pre: preBlock,
    },
    closestFallback: assistantContainer,
    matches: ['code'],
  });
  const rootElement = new FakeHTMLElement({
    attributes: { class: 'csp-codebox-wrap-enabled' },
  });
  rootElement.classList = { contains: (className) => className === 'csp-codebox-wrap-enabled' };
  const codeDocument = {
    body: { outerHTML: '<body>PRIVATE CONVERSATION BODY</body>' },
    documentElement: rootElement,
    querySelectorAll: () => [codeNode],
    querySelector: () => null,
    getElementById: () => null,
  };
  const wrapPage = makeEvaluationPage(codeDocument, undefined, (input) => {
    evaluationCount += 1;
    assert.equal(input.stateId, 'probe-codebox-wrap-enabled');
  });
  const deferredWrap = await core.captureSupplementalProbeArtifact(wrapPage, wrapDefinition, {
    auditOwned: true,
    semanticSnapshot: { codeboxWrapEnabled: false },
  });
  assert.equal(deferredWrap.status, 'deferred');
  assert.equal(evaluationCount, 0);

  const enabledWrap = await core.captureSupplementalProbeArtifact(wrapPage, wrapDefinition, {
    auditOwned: true,
    semanticSnapshot: { codeboxWrapEnabled: true },
  });
  assert.equal(enabledWrap.status, 'captured');
  assert.match(enabledWrap.rawHtml, /csp-codebox-wrap-enabled/);
  assert.match(enabledWrap.rawHtml, /<pre><code>audit code<\/code><\/pre>/);
  assert.doesNotMatch(enabledWrap.rawHtml, /PRIVATE CONVERSATION BODY/);
  assert.equal(evaluationCount, 1);

  const emptyCodeDocument = {
    ...codeDocument,
    querySelectorAll: () => [],
  };
  const emptyCodeCapture = await core.captureSupplementalProbeArtifact(
    makeEvaluationPage(emptyCodeDocument),
    codeDefinition,
    { auditOwned: true },
  );
  assert.equal(emptyCodeCapture.status, 'failed');
  assert.match(emptyCodeCapture.error, /No matching/);
  const emptyWrapCapture = await core.captureSupplementalProbeArtifact(
    makeEvaluationPage(emptyCodeDocument),
    wrapDefinition,
    { auditOwned: true, semanticSnapshot: { codeboxWrapEnabled: true } },
  );
  assert.equal(emptyWrapCapture.status, 'failed');
  assert.match(emptyWrapCapture.error, /No matching/);

  const semanticSnapshot = { codeboxWrapEnabled: true, url: 'https://chatgpt.com/' };
  const failingPage = {
    url: () => 'https://chatgpt.com/c/audit-owned',
    async evaluate() {
      throw new Error('fake page capture failure');
    },
  };
  const failedCapture = await core.captureSupplementalProbeArtifact(failingPage, sendDefinition, {
    auditOwned: true,
    semanticSnapshot,
  });
  assert.equal(failedCapture.status, 'failed');
  assert.match(failedCapture.error, /fake page capture failure/);
  assert.deepEqual(semanticSnapshot, { codeboxWrapEnabled: true, url: 'https://chatgpt.com/' });

  const blankHomeProvenance = {
    kind: 'verified-blank-new-chat',
    source: 'prepare-new-conversation',
    url: 'https://chatgpt.com/',
    userMessageCount: 0,
    assistantMessageCount: 0,
    composerHasText: false,
  };
  assert.equal(
    core.isVerifiedBlankNewChatProvenance(blankHomeProvenance, 'https://chatgpt.com/'),
    true,
  );
  let blankHomeCaptureCount = 0;
  const blankHomePage = {
    url: () => 'https://chatgpt.com/',
    async evaluate(_callback, input) {
      blankHomeCaptureCount += 1;
      assert.equal(input.targetRef, 'send-button');
      return '<button id="composer-submit-button">Send</button>';
    },
  };
  const blankHomeCapture = await core.captureSupplementalProbeArtifact(
    blankHomePage,
    sendDefinition,
    { blankNewChatProvenance: blankHomeProvenance },
  );
  assert.equal(blankHomeCapture.status, 'captured');
  const privateConversationProvenance = {
    ...blankHomeProvenance,
    url: 'https://chatgpt.com/c/private',
  };
  assert.equal(
    core.isVerifiedBlankNewChatProvenance(
      privateConversationProvenance,
      privateConversationProvenance.url,
    ),
    false,
  );
  const privateConversationCapture = await core.captureSupplementalProbeArtifact(
    { ...blankHomePage, url: () => privateConversationProvenance.url },
    sendDefinition,
    { blankNewChatProvenance: privateConversationProvenance },
  );
  assert.equal(privateConversationCapture.status, 'deferred');
  assert.equal(blankHomeCaptureCount, 1);

  const gptTrigger = new FakeHTMLElement({
    outerHTML:
      '<button id="radix-gpt-trigger" aria-controls="radix-gpt-menu" aria-haspopup="menu" aria-expanded="true"><svg><path d="M15.6981 9.04712"></path><path d="M4.69806 9.04712"></path><path d="M10.2003 9.04712"></path></svg></button>',
    attributes: {
      id: 'radix-gpt-trigger',
      'aria-controls': 'radix-gpt-menu',
      'aria-haspopup': 'menu',
      'aria-expanded': 'true',
    },
  });
  const header = new FakeHTMLElement({
    queryAllResults: {
      'button[aria-haspopup="menu"]:has(svg path[d^="M15.6981 9.04712"]):has(svg path[d^="M4.69806 9.04712"]):has(svg path[d^="M10.2003 9.04712"])':
        [gptTrigger],
    },
  });
  const menuItem = new FakeHTMLElement({
    outerHTML:
      '<div role="menuitem"><svg><use href="#square-and-pencil-light-16"></use></svg>New Chat</div>',
    closestResults: { '[aria-hidden="true"]': null },
  });
  const targetIcon = new FakeHTMLElement({
    closestResults: {
      '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]': menuItem,
    },
  });
  const menu = new FakeHTMLElement({
    attributes: {
      id: 'radix-gpt-menu',
      role: 'menu',
      'data-radix-menu-content': '',
      'data-state': 'open',
    },
    queryAllResults: {
      'svg use[href*="#square-and-pencil-light-16"]': [targetIcon],
      'svg path[d^="M2.6687 11.333V8.66699C2.6687"]': [targetIcon],
      'svg use[href*="#compose"]': [],
      'svg use[href*="#3a5c87"]': [],
    },
  });
  const gptDocument = {
    body: { outerHTML: '<body>PRIVATE EXISTING CONVERSATION</body>' },
    documentElement: { clientWidth: 1200, clientHeight: 800 },
    querySelector(selector) {
      return selector === '#page-header' ? header : null;
    },
    querySelectorAll(selector) {
      return selector.includes('[role="menu"]') ? [menu] : [];
    },
    getElementById: () => null,
  };
  const gptPage = makeEvaluationPage(gptDocument);
  const gptCapture = await core.captureSupplementalProbeArtifact(gptPage, gptDefinition);
  assert.equal(gptCapture.status, 'captured');
  assert.match(gptCapture.rawHtml, /aria-controls="radix-gpt-menu"/);
  assert.match(gptCapture.rawHtml, /#square-and-pencil-light-16/);
  assert.doesNotMatch(gptCapture.rawHtml, /PRIVATE EXISTING CONVERSATION/);

  const unrelatedMenu = new FakeHTMLElement({
    attributes: {
      id: 'radix-unrelated-menu',
      role: 'menu',
      'data-radix-menu-content': '',
      'data-state': 'open',
    },
    queryAllResults: {
      'svg use[href*="#square-and-pencil-light-16"]': [targetIcon],
      'svg path[d^="M2.6687 11.333V8.66699C2.6687"]': [],
      'svg use[href*="#compose"]': [],
      'svg use[href*="#3a5c87"]': [],
    },
  });
  const unrelatedCapture = await core.captureSupplementalProbeArtifact(
    makeEvaluationPage({
      ...gptDocument,
      querySelectorAll: (selector) => (selector.includes('[role="menu"]') ? [unrelatedMenu] : []),
    }),
    gptDefinition,
  );
  assert.equal(unrelatedCapture.status, 'failed');
  assert.match(unrelatedCapture.error, /No matching/);
});

test('Temporary Chat capture requires a unique visible sprite and prepares Chat mode when needed', async () => {
  const core = await coreModule;
  const { targetMatchesText } = await targetPresenceModule;
  const { exports } = await core.loadDevScrapeWideContract();
  const definition = exports.DUMP_REGISTRY.find(
    (entry) => entry.stateId === 'probe-temporary-chat',
  );
  const inventory = await core.buildCurrentShortcutInventory(exports.DUMP_REGISTRY);
  const target = inventory.targets.find((entry) => entry.targetId === 'temporary-chat-button');
  const blankNewChatProvenance = {
    kind: 'verified-blank-new-chat',
    source: 'prepare-new-conversation',
    url: 'https://chatgpt.com/',
    userMessageCount: 0,
    assistantMessageCount: 0,
    composerHasText: false,
  };
  const makeButton = (symbol, { visible = true, disabled = false, ariaDisabled = false } = {}) => {
    const attributes = {
      ...(disabled ? { disabled: '' } : {}),
      ...(ariaDisabled ? { 'aria-disabled': 'true' } : {}),
    };
    const serializedState = `${disabled ? ' disabled' : ''}${ariaDisabled ? ' aria-disabled="true"' : ''}`;
    const button = new FakeHTMLElement({
      outerHTML: `<button${serializedState}><svg><use href="${symbol}"></use></svg></button>`,
      rect: visible ? undefined : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
      attributes,
      tagName: 'button',
    });
    button.symbol = symbol;
    button.disabled = disabled;
    return button;
  };
  const capture = async (buttons, { chatModeSelected = true } = {}) => {
    let currentChatModeSelected = chatModeSelected;
    const chat = new FakeHTMLElement({
      attributes: { 'aria-pressed': chatModeSelected ? 'true' : 'false' },
      tagName: 'button',
    });
    const work = new FakeHTMLElement({
      attributes: { 'aria-pressed': chatModeSelected ? 'false' : 'true' },
      tagName: 'button',
    });
    chat.click = () => {
      chat.attributes['aria-pressed'] = 'true';
      work.attributes['aria-pressed'] = 'false';
      currentChatModeSelected = true;
    };
    const document = {
      body: new FakeHTMLElement({ tagName: 'body' }),
      querySelectorAll(selector) {
        if (!currentChatModeSelected) return [];
        if (selector === 'button:has(svg use[href$="#chat-bubble-dashed-light-20"])') {
          return buttons.filter((button) => button.symbol === '#chat-bubble-dashed-light-20');
        }
        if (selector === 'button:has(svg use[href$="#chat-bubble-checkmark-dashed-light-20"])') {
          return buttons.filter(
            (button) => button.symbol === '#chat-bubble-checkmark-dashed-light-20',
          );
        }
        return [];
      },
    };
    const page = makeEvaluationPage(document, 'https://chatgpt.com/', null, () => [chat, work]);
    return {
      result: await core.captureSupplementalProbeArtifact(page, definition, {
        blankNewChatProvenance,
      }),
      chat,
    };
  };

  assert.ok(definition);
  assert.ok(target);
  assert.deepEqual(target.matchGroups, [
    ['#chat-bubble-dashed-light-20'],
    ['#chat-bubble-checkmark-dashed-light-20'],
  ]);
  for (const symbol of ['#chat-bubble-dashed-light-20', '#chat-bubble-checkmark-dashed-light-20']) {
    const visibleButton = makeButton(symbol);
    const fixture = await capture([
      visibleButton,
      makeButton(symbol, { visible: false }),
      makeButton(symbol, { disabled: true }),
      makeButton(symbol, { ariaDisabled: true }),
      makeButton('#voice-regular-20'),
    ]);
    assert.equal(fixture.result.status, 'captured');
    assert.equal(
      fixture.result.rawHtml,
      `<div data-csp-probe-state="probe-temporary-chat">${visibleButton.outerHTML}</div>`,
    );
    assert.equal(targetMatchesText(target, fixture.result.rawHtml), true);
  }

  const ambiguous = await capture([
    makeButton('#chat-bubble-dashed-light-20'),
    makeButton('#chat-bubble-checkmark-dashed-light-20'),
  ]);
  assert.equal(ambiguous.result.status, 'failed');
  assert.match(ambiguous.result.error, /No matching temporary-chat-button/);

  const needsChatMode = await capture([makeButton('#chat-bubble-dashed-light-20')], {
    chatModeSelected: false,
  });
  assert.equal(needsChatMode.result.status, 'captured');
  assert.equal(needsChatMode.chat.getAttribute('aria-pressed'), 'true');
});

test('new probe captures stay scoped to observed controls and satisfy normalized target groups', async () => {
  const core = await coreModule;
  const { targetMatchesText } = await targetPresenceModule;
  const contract = await core.loadDevScrapeWideContract();
  const { exports } = contract;
  const normalizeHtmlForDump = new Function(
    `${contract.sanitizedSource}\nreturn normalizeHtmlForDump;`,
  )();
  const definitions = exports.DUMP_REGISTRY.filter((definition) => definition.probeOnly === true);
  const inventory = await core.buildCurrentShortcutInventory(exports.DUMP_REGISTRY);
  const blankNewChatProvenance = {
    kind: 'verified-blank-new-chat',
    source: 'prepare-new-conversation',
    url: 'https://chatgpt.com/',
    userMessageCount: 0,
    assistantMessageCount: 0,
    composerHasText: false,
  };
  const captures = [];

  const workGroup = new FakeHTMLElement({
    outerHTML: '<div role="group"><span>UNRELATED SURFACE CONTENT</span></div>',
    attributes: { role: 'group' },
    tagName: 'div',
  });
  const visibleWorkGroupRect = workGroup.rect;
  workGroup.rect = { ...visibleWorkGroupRect, right: 10, bottom: 10, width: 0, height: 0 };
  const chatRadio = new FakeHTMLElement({
    outerHTML: '<button role="radio" aria-pressed="true">Chat</button>',
    attributes: { role: 'radio', 'aria-pressed': 'true' },
    tagName: 'button',
    parentElement: workGroup,
  });
  const workRadio = new FakeHTMLElement({
    outerHTML: '<button role="radio" aria-pressed="false">Work</button>',
    attributes: { role: 'radio', 'aria-pressed': 'false' },
    tagName: 'button',
    parentElement: workGroup,
  });
  workGroup.queryAllResults['button[role="radio"][aria-checked], button[aria-pressed]'] = [
    chatRadio,
    workRadio,
  ];
  let workGroupLookupCount = 0;
  const workDocument = {
    body: new FakeHTMLElement({ tagName: 'body' }),
    querySelectorAll(selector) {
      if (selector !== modelPickerSelectors.CHAT_WORK_SURFACE_GROUP_SELECTOR) {
        return [];
      }
      workGroupLookupCount += 1;
      if (workGroupLookupCount >= 3) workGroup.rect = visibleWorkGroupRect;
      return [workGroup];
    },
  };
  const workDefinition = definitions.find(
    (definition) => definition.stateId === 'probe-blank-chat-work-surface-toggle',
  );
  let workCaptureEvaluations = 0;
  const workCapture = await core.captureSupplementalProbeArtifact(
    makeEvaluationPage(workDocument, 'https://chatgpt.com/', (input) => {
      workCaptureEvaluations += 1;
      assert.equal(input.targetRef, 'chat-work-surface-toggle');
    }),
    workDefinition,
    { blankNewChatProvenance },
  );
  assert.equal(workCapture.status, 'captured');
  assert.match(
    workCapture.rawHtml,
    /<div role="group"><button role="radio" aria-pressed="true">Chat/,
  );
  assert.match(workCapture.rawHtml, /<button role="radio" aria-pressed="false">Work/);
  assert.doesNotMatch(workCapture.rawHtml, /UNRELATED SURFACE CONTENT/);
  assert.ok(workGroupLookupCount >= 3, 'shared Work resolver should retry after hidden controls');
  assert.equal(workCaptureEvaluations, 1);
  captures.push(workCapture);

  const studyDefinition = definitions.find(
    (definition) => definition.stateId === 'probe-composer-study-search',
  );
  const studyMenu = new FakeHTMLElement({
    attributes: { role: 'menu' },
    tagName: 'div',
    queryAllResults: { 'button[data-list-navigation-item="true"]': [] },
    closestFallback: null,
  });
  studyMenu.getAttribute = (name) => (name === 'role' ? 'menu' : null);
  studyMenu.position = 'fixed';
  const studySvg = new FakeHTMLElement({
    outerHTML: '<svg><use href="#book-open-light-16"></use></svg>',
  });
  const studyItem = new FakeHTMLElement({
    outerHTML:
      '<button data-list-navigation-item="true"><svg><use href="#book-open-light-16"></use></svg><span>Study</span></button>',
    attributes: { 'data-list-navigation-item': 'true' },
    tagName: 'button',
    parentElement: studyMenu,
    queryAllResults: { svg: [studySvg] },
  });
  const openPlusButton = new FakeHTMLElement({
    outerHTML:
      '<button data-composer-navigation-target="add-context" aria-expanded="true">Add context</button>',
    attributes: { 'data-composer-navigation-target': 'add-context', 'aria-expanded': 'true' },
    tagName: 'button',
  });
  const studyDocument = {
    body: new FakeHTMLElement({ tagName: 'body' }),
    querySelectorAll(selector) {
      if (selector.includes('data-composer-navigation-target')) return [openPlusButton];
      if (
        selector ===
        'button[data-list-navigation-item="true"], div.__menu-item[tabindex], div[role="menuitem"], div[role="menuitemradio"], div[role="menuitemcheckbox"]'
      ) {
        return [studyItem];
      }
      return [];
    },
  };
  studyMenu.parentElement = studyDocument.body;
  const studyCapture = await core.captureSupplementalProbeArtifact(
    makeEvaluationPage(studyDocument, 'https://chatgpt.com/'),
    studyDefinition,
    { blankNewChatProvenance },
  );
  assert.equal(studyCapture.status, 'captured');
  assert.match(studyCapture.rawHtml, /#book-open-light-16/);
  assert.doesNotMatch(studyCapture.rawHtml, /PRIVATE DRAFT|PRIVATE TRANSCRIPT/);
  captures.push(studyCapture);

  const deepResearchDefinition = definitions.find(
    (definition) => definition.stateId === 'probe-composer-deep-research-search',
  );
  const deepResearchItem = new FakeHTMLElement({
    outerHTML:
      '<button data-list-navigation-item="true"><img src="deep_research_app/icon.png"></button>',
    tagName: 'button',
    parentElement: studyMenu,
  });
  deepResearchItem.matches = (selector) => selector.includes('deep_research_app/icon.png');
  const deepResearchDocument = {
    ...studyDocument,
    querySelectorAll(selector) {
      const matches = studyDocument.querySelectorAll(selector);
      return matches.includes(studyItem) ? [deepResearchItem] : matches;
    },
  };
  const deepResearchCapture = await core.captureSupplementalProbeArtifact(
    makeEvaluationPage(deepResearchDocument, 'https://chatgpt.com/'),
    deepResearchDefinition,
    { blankNewChatProvenance },
  );
  assert.equal(deepResearchCapture.status, 'captured');
  assert.match(deepResearchCapture.rawHtml, /deep_research_app\/icon.png/);
  assert.doesNotMatch(deepResearchCapture.rawHtml, /PRIVATE DRAFT|PRIVATE TRANSCRIPT/);

  const makeDictationCapture = async (stateId, controls) => {
    const buttons = controls.map(({ path, symbol, label }) => {
      const pathNode = path
        ? new FakeHTMLElement({
            attributes: { d: path },
            tagName: 'path',
          })
        : null;
      const useNode = symbol
        ? new FakeHTMLElement({
            attributes: { href: symbol },
            tagName: 'use',
          })
        : null;
      const buttonAttributes = path ? { type: 'button' } : {};
      const iconMarkup = symbol
        ? `<svg><use href="${symbol}"></use></svg>`
        : `<svg><path d="${path}X"></path></svg>`;
      const button = new FakeHTMLElement({
        outerHTML: `<button${path ? ' type="button"' : ''}>${iconMarkup}${label}</button>`,
        attributes: buttonAttributes,
        tagName: 'button',
        queryAllResults: {
          'svg path': pathNode ? [pathNode] : [],
          'svg use': useNode ? [useNode] : [],
        },
      });
      return button;
    });
    const form = new FakeHTMLElement({
      outerHTML:
        '<form data-chatgpt-composer data-thread-find-composer="true"><div>PRIVATE DRAFT PRIVATE TRANSCRIPT</div></form>',
      attributes: { 'data-chatgpt-composer': '', 'data-thread-find-composer': 'true' },
      tagName: 'form',
      queryAllResults: { button: buttons },
    });
    for (const button of buttons) button.parentElement = form;
    const document = {
      body: new FakeHTMLElement({ tagName: 'body' }),
      querySelectorAll(selector) {
        return selector === 'form[data-thread-find-composer="true"], form[data-chatgpt-composer]'
          ? [form]
          : [];
      },
    };
    const definition = definitions.find((entry) => entry.stateId === stateId);
    const capture = await core.captureSupplementalProbeArtifact(
      makeEvaluationPage(document, 'https://chatgpt.com/'),
      definition,
      { blankNewChatProvenance },
    );
    return { capture, form };
  };
  const activeDictation = await makeDictationCapture('probe-active-dictation-controls', [
    { symbol: '#arrow-up-lg-light-20', label: 'transcribe' },
    { symbol: '#stop-fill-light-20', label: 'stop' },
    { symbol: '#xmark-lg-light-20', label: 'cancel' },
  ]);
  assert.equal(activeDictation.capture.status, 'captured');
  assert.match(
    activeDictation.capture.rawHtml,
    /<form data-chatgpt-composer data-thread-find-composer="true"><button>/,
  );
  assert.match(activeDictation.capture.rawHtml, /#arrow-up-lg-light-20/);
  assert.match(activeDictation.capture.rawHtml, /#stop-fill-light-20/);
  assert.match(activeDictation.capture.rawHtml, /#xmark-lg-light-20/);
  assert.doesNotMatch(activeDictation.capture.rawHtml, /<button[^>]*type=/);
  assert.doesNotMatch(activeDictation.capture.rawHtml, /PRIVATE DRAFT|PRIVATE TRANSCRIPT/);
  captures.push(activeDictation.capture);

  const dictateStart = await makeDictationCapture('probe-blank-chat-dictate-start', [
    { symbol: '#microphone-light-20', label: 'start' },
  ]);
  assert.equal(dictateStart.capture.status, 'captured');
  assert.match(
    dictateStart.capture.rawHtml,
    /<form data-chatgpt-composer data-thread-find-composer="true"><button>/,
  );
  assert.match(dictateStart.capture.rawHtml, /#microphone-light-20/);
  assert.doesNotMatch(dictateStart.capture.rawHtml, /PRIVATE DRAFT|PRIVATE TRANSCRIPT/);
  captures.push(dictateStart.capture);

  const legacyActiveDictation = await makeDictationCapture('probe-active-dictation-controls', [
    { path: 'M9.31697 3.08317', label: 'transcribe' },
    { path: 'M13.0834 3.91846', label: 'stop' },
    { path: 'M14.779 4.27903', label: 'cancel' },
  ]);
  assert.equal(legacyActiveDictation.capture.status, 'captured');
  assert.match(legacyActiveDictation.capture.rawHtml, /M9\.31697 3\.08317/);
  captures.push(legacyActiveDictation.capture);

  const legacyDictateStart = await makeDictationCapture('probe-blank-chat-dictate-start', [
    { path: 'M12.4584 8.96973', label: 'start' },
  ]);
  assert.equal(legacyDictateStart.capture.status, 'captured');
  assert.match(legacyDictateStart.capture.rawHtml, /M12\.4584 8\.96973/);
  captures.push(legacyDictateStart.capture);

  const normalizerWindow = makeNormalizerWindow();
  for (const capture of captures) {
    const definition = definitions.find((entry) => entry.stateId === capture.stateId);
    const target = inventory.targets.find(
      (entry) => entry.targetId === definition.capture.targetRef,
    );
    assert.ok(target, `missing inventory target ${definition.capture.targetRef}`);
    const normalized = normalizeHtmlForDump(normalizerWindow, capture.rawHtml);
    assert.equal(
      targetMatchesText(target, normalized),
      true,
      `${capture.stateId} target match groups must survive HTML normalization`,
    );
  }

  const failedWorkCapture = await core.captureSupplementalProbeArtifact(
    makeEvaluationPage(workDocument, 'https://chatgpt.com/', null, () => []),
    workDefinition,
    { blankNewChatProvenance },
  );
  assert.equal(failedWorkCapture.status, 'failed');
  assert.match(failedWorkCapture.error, /timed out/);

  const noOpenStudyDocument = {
    ...studyDocument,
    querySelectorAll(selector) {
      return selector.includes('data-composer-navigation-target')
        ? []
        : studyDocument.querySelectorAll(selector);
    },
  };
  const studyWithoutBlankProvenance = await core.captureSupplementalProbeArtifact(
    makeEvaluationPage(studyDocument, 'https://chatgpt.com/'),
    studyDefinition,
  );
  assert.equal(studyWithoutBlankProvenance.status, 'deferred');
  const failedStudyCapture = await core.captureSupplementalProbeArtifact(
    makeEvaluationPage(noOpenStudyDocument, 'https://chatgpt.com/'),
    studyDefinition,
    { blankNewChatProvenance },
  );
  assert.equal(failedStudyCapture.status, 'failed');

  const missingActiveControl = await makeDictationCapture('probe-active-dictation-controls', [
    { path: 'M9.31697 3.08317', label: 'transcribe' },
    { path: 'M14.779 4.27903', label: 'cancel' },
  ]);
  assert.equal(missingActiveControl.capture.status, 'failed');
  const ordinarySendOnly = await makeDictationCapture('probe-active-dictation-controls', [
    { symbol: '#arrow-up-lg-light-20', label: 'send' },
  ]);
  assert.equal(ordinarySendOnly.capture.status, 'failed');

  const dictateStartDefinition = definitions.find(
    (definition) => definition.stateId === 'probe-blank-chat-dictate-start',
  );
  const unknownDictationDocument = {
    body: new FakeHTMLElement({ tagName: 'body' }),
    querySelectorAll: () => [],
  };
  const unknownDictationScope = await core.captureSupplementalProbeArtifact(
    makeEvaluationPage(unknownDictationDocument, 'https://chatgpt.com/'),
    dictateStartDefinition,
    { blankNewChatProvenance },
  );
  assert.equal(unknownDictationScope.status, 'failed');
  assert.match(unknownDictationScope.error, /No matching/);

  const draftPage = makeEditableComposerPage('https://chatgpt.com/c/owned-study-setup');
  const cleanupCheckpoint = {};
  await core.setComposerText(draftPage, 'study', {
    auditOwnedConversationIds: ['owned-study-setup'],
    checkpoint: cleanupCheckpoint,
    scope: 'global:shortcutKeyStudy:setup',
  });
  assert.equal(draftPage.currentText(), 'study');
  const cleanup = await core.clearOwnedComposerDraft(draftPage, 'study', {
    auditOwnedConversationIds: ['owned-study-setup'],
    checkpoint: cleanupCheckpoint,
    scope: 'global:shortcutKeyStudy:cleanup',
  });
  assert.equal(cleanup.status, 'clean');
  assert.equal(draftPage.currentText(), '');
  assert.equal(draftPage.sendCount, 0);
  assert.deepEqual(
    draftPage.keyboardEvents.map((event) => event.key || event.text),
    ['study', 'Control+A', 'Backspace'],
  );
  assert.equal(JSON.stringify(cleanupCheckpoint).includes('study'), false);
});

test('New Conversation semantic proof requires the real owned-conversation to blank-home transition', async () => {
  const { evaluateLiveProbeSemantic } = await coreModule;
  const shortcut = {
    actionId: 'shortcutKeyNewConversation',
    activationProbeMode: 'opens-target',
  };
  const target = { targetId: 'chat-work-surface-toggle' };
  const before = {
    url: 'https://chatgpt.com/c/audit-owned-123',
    auditOwnedFixtureConversation: true,
    hasComposer: true,
    composerHasText: false,
    messageCount: 4,
    userMessageCount: 2,
    assistantMessageCount: 2,
  };
  const after = {
    url: 'https://chatgpt.com/',
    hasComposer: true,
    composerHasText: false,
    messageCount: 0,
    userMessageCount: 0,
    assistantMessageCount: 0,
  };

  const proof = evaluateLiveProbeSemantic(shortcut, target, before, after);
  assert.equal(proof.status, 'pass');
  assert.equal(proof.proofMethod, 'verified-audit-conversation-to-blank-home-transition');
  assert.match(proof.observed, /source turns=2 user\/2 assistant/);
  assert.doesNotMatch(JSON.stringify(proof), /audit-owned-123/);

  const unverifiedSource = evaluateLiveProbeSemantic(
    shortcut,
    target,
    { ...before, auditOwnedFixtureConversation: false },
    after,
  );
  assert.equal(unverifiedSource.status, 'fail');

  const alreadyBlank = evaluateLiveProbeSemantic(
    shortcut,
    target,
    {
      ...before,
      url: 'https://chatgpt.com/',
      auditOwnedFixtureConversation: false,
      messageCount: 0,
      userMessageCount: 0,
      assistantMessageCount: 0,
    },
    after,
  );
  assert.equal(alreadyBlank.status, 'fail');
});

test('Study semantic proof requires observed inline pill activation and a second-shortcut toggle off', async () => {
  const { evaluateLiveProbeSemantic } = await coreModule;
  const shortcut = {
    actionId: 'shortcutKeyStudy',
    activationProbeMode: 'direct-menu-target',
  };
  const target = { targetId: 'composer-study-action' };
  const before = {
    url: 'https://chatgpt.com/',
    messageCount: 0,
    userMessageCount: 0,
    assistantMessageCount: 0,
    composerHasText: true,
    selectedStudyPillCount: 0,
  };
  const activation = { ...before, selectedStudyPillCount: 1 };
  const deactivation = { ...before, composerHasText: false, selectedStudyPillCount: 0 };
  const after = { ...deactivation };
  const actionEvidence = {
    studyPillActivationSnapshot: activation,
    studyPillDeactivationSnapshot: deactivation,
    studyToggleOffDispatched: true,
  };

  const proof = evaluateLiveProbeSemantic(
    shortcut,
    target,
    before,
    after,
    null,
    false,
    actionEvidence,
  );
  assert.equal(proof.status, 'pass');
  assert.equal(proof.proofMethod, 'observed-study-inline-pill-on-and-toggle-off');
  assert.match(proof.observed, /Study pill count 0 -> 1 -> 0/);
  assert.doesNotMatch(JSON.stringify(proof), /PRIVATE COMPOSER TEXT/);

  for (const { changedActivation, changedDeactivation, changedEvidence, changedAfter } of [
    { changedActivation: { ...activation, selectedStudyPillCount: 0 } },
    { changedDeactivation: { ...deactivation, selectedStudyPillCount: 1 } },
    { changedEvidence: { ...actionEvidence, studyToggleOffDispatched: false } },
    { changedAfter: { ...after, composerHasText: true } },
    { changedAfter: { ...after, messageCount: 1, userMessageCount: 1 } },
    { changedAfter: { ...after, url: 'https://chatgpt.com/c/unrelated' } },
  ]) {
    const failedProof = evaluateLiveProbeSemantic(
      shortcut,
      target,
      before,
      changedAfter || after,
      null,
      false,
      {
        ...actionEvidence,
        ...(changedEvidence || {}),
        studyPillActivationSnapshot: changedActivation || activation,
        studyPillDeactivationSnapshot: changedDeactivation || deactivation,
      },
    );
    assert.equal(failedProof.status, 'fail');
  }
});

test('supplemental artifacts replace deferred rows and write only to the existing scrape folder', async (t) => {
  const core = await coreModule;
  const definitions = await getProbeDefinitions();
  assert.equal(definitions.length, 13);
  const expectedProbeTargets = [
    ['probe-edit-message-button', 'edit-message-button', '3l_Probe_EditMessageButton.txt'],
    [
      'probe-blank-chat-work-surface-toggle',
      'chat-work-surface-toggle',
      '3h_Probe_BlankChatWorkSurfaceToggle.txt',
    ],
    ['probe-composer-study-search', 'composer-study-action', '3i_Probe_ComposerStudySearch.txt'],
    [
      'probe-composer-deep-research-search',
      'composer-deep-research-action',
      '3m_Probe_ComposerDeepResearchSearch.txt',
    ],
    [
      'probe-active-dictation-controls',
      'cancel-dictation-button',
      '3j_Probe_ActiveDictationControls.txt',
    ],
    [
      'probe-blank-chat-dictate-start',
      'dictate-start-button',
      '3k_Probe_BlankChatDictateStart.txt',
    ],
  ];
  for (const [stateId, targetRef, filename] of expectedProbeTargets) {
    const definition = definitions.find((entry) => entry.stateId === stateId);
    assert.ok(definition, `missing probe-only state ${stateId}`);
    assert.equal(definition.capture?.targetRef, targetRef);
    assert.equal(definition.filename, filename);
  }
  const root = await mkdtemp(path.join(os.tmpdir(), 'probe-state-capture-'));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const folderName = '2026-10-08_12-00-00_devscrapewide_test';
  const folderPath = path.join(root, folderName);
  await mkdir(folderPath);
  const selected = definitions.find(
    (definition) => definition.stateId === 'probe-code-block-content',
  );
  const stopDefinition = definitions.find(
    (definition) => definition.stateId === 'probe-stop-button',
  );
  const startedAt = '2026-10-08T18:00:00.000Z';
  const previousCompletedAt = '2026-10-08T18:01:00.000Z';
  const manifest = {
    schemaVersion: 1,
    folderName,
    startedAt,
    completedAt: previousCompletedAt,
    capturedCount: 1,
    failedCount: 0,
    deferredCount: definitions.length,
    writtenFiles: ['base.txt'],
    artifacts: [
      {
        filename: 'base.txt',
        stateId: 'base-state',
        label: 'Base artifact',
        status: 'captured',
        error: null,
        aliasOf: null,
        captureBytes: 4,
        clickPath: [],
      },
      ...definitions.map((definition) => ({
        filename: definition.filename,
        stateId: definition.stateId,
        label: definition.label,
        status: 'deferred',
        error: null,
        aliasOf: null,
        captureBytes: 0,
        clickPath: [],
      })),
    ],
  };
  await writeFile(path.join(folderPath, 'base.txt'), 'base', 'utf8');
  await writeFile(
    path.join(folderPath, 'run-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  const normalizedHtml =
    '<div data-csp-probe-state="probe-code-block-content"><pre><code>audit code</code></pre></div>';
  const result = await core.appendSupplementalProbeArtifacts({
    runFolderPath: folderPath,
    supplementalArtifacts: [
      {
        ...selected,
        status: 'captured',
        rawHtml: '<pre><code>audit code</code></pre>',
        captureBytes: 40,
      },
      {
        ...stopDefinition,
        status: 'failed',
        error: 'Prepared-state cleanup failed; captured content was discarded.',
        rawHtml: '',
        captureBytes: 0,
      },
    ],
    normalizedArtifacts: [{ filename: selected.filename, normalizedHtml }],
  });

  assert.equal(result.folderPath, folderPath);
  assert.equal(result.manifest.startedAt, startedAt);
  assert.ok(Date.parse(result.manifest.completedAt) > Date.parse(previousCompletedAt));
  assert.equal(await readFile(path.join(folderPath, selected.filename), 'utf8'), normalizedHtml);
  assert.equal(result.manifest.capturedCount, 2);
  assert.equal(result.manifest.failedCount, 1);
  assert.equal(result.manifest.deferredCount, definitions.length - 2);
  assert.ok(result.manifest.writtenFiles.includes(selected.filename));
  assert.equal(
    result.manifest.artifacts.filter((artifact) => artifact.stateId === selected.stateId).length,
    1,
  );
  assert.equal(
    result.manifest.artifacts.find((artifact) => artifact.stateId === selected.stateId).status,
    'captured',
  );
  assert.equal(
    result.manifest.artifacts.find((artifact) => artifact.stateId === 'probe-stop-button').status,
    'failed',
  );
  assert.equal(
    await readFile(path.join(folderPath, stopDefinition.filename), 'utf8').catch(() => null),
    null,
  );
  assert.equal(await readFile(path.join(folderPath, 'base.txt'), 'utf8'), 'base');

  const beforeInvalidInput = await readFile(path.join(folderPath, 'run-manifest.json'), 'utf8');
  const escapedFilename = `..${path.sep}outside.txt`;
  await assert.rejects(
    core.appendSupplementalProbeArtifacts({
      runFolderPath: folderPath,
      supplementalArtifacts: [
        { stateId: selected.stateId, filename: escapedFilename, status: 'captured' },
      ],
      normalizedArtifacts: [{ filename: escapedFilename, normalizedHtml: 'unsafe' }],
    }),
    /single filename inside the existing scrape folder/,
  );
  assert.equal(
    await readFile(path.join(folderPath, 'run-manifest.json'), 'utf8'),
    beforeInvalidInput,
  );
  assert.equal(await readFile(path.join(root, 'outside.txt'), 'utf8').catch(() => null), null);

  const stopFilePath = path.join(folderPath, stopDefinition.filename);
  await assert.rejects(
    core.appendSupplementalProbeArtifacts({
      runFolderPath: folderPath,
      supplementalArtifacts: [
        { ...stopDefinition, status: 'captured' },
        { ...stopDefinition, status: 'captured' },
      ],
      normalizedArtifacts: [
        {
          filename: stopDefinition.filename,
          normalizedHtml: '<button data-testid="stop-button"></button>',
        },
      ],
    }),
    /duplicate state or filename/,
  );
  assert.equal(await readFile(stopFilePath, 'utf8').catch(() => null), null);
  assert.equal(
    await readFile(path.join(folderPath, 'run-manifest.json'), 'utf8'),
    beforeInvalidInput,
  );

  await assert.rejects(
    core.appendSupplementalProbeArtifacts({
      runFolderPath: folderPath,
      supplementalArtifacts: [{ ...stopDefinition, status: 'captured' }],
    }),
    /Missing normalized HTML/,
  );
  assert.equal(await readFile(stopFilePath, 'utf8').catch(() => null), null);
  assert.equal(
    await readFile(path.join(folderPath, 'run-manifest.json'), 'utf8'),
    beforeInvalidInput,
  );
});
