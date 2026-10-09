const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const coreModule = import('./playwright/lib/devscrape-wide-core.mjs');

async function makeReservedRunDirectory() {
  const { createUniqueRunDirectory } = await coreModule;
  return createUniqueRunDirectory(`fresh-owned-fixture-test-${randomUUID()}`);
}

function makeProductionFixturePage({
  fixtureUrl,
  provisionalUrl = fixtureUrl,
  initialDraft,
  checkpointPath,
}) {
  let currentUrl = 'about:blank';
  let composerText = initialDraft;
  let userMessageCount = 0;
  let assistantMessageCount = 0;
  let sendCount = 0;
  let selected = false;
  const keyboardEvents = [];
  const navigations = [];
  const sentPrompts = [];
  const checkpointStatusesBeforePrompt = [];
  let composerCountReads = 0;
  let composerVisibilityReads = 0;
  const editable = {
    tagName: 'DIV',
    get innerText() {
      return composerText;
    },
    get textContent() {
      return composerText;
    },
  };
  const locator = {
    count: async () => {
      composerCountReads += 1;
      return composerCountReads === 1 ? 0 : 1;
    },
    nth: () => locator,
    isVisible: async () => {
      composerVisibilityReads += 1;
      return composerVisibilityReads > 1;
    },
    click: async () => {},
    evaluate: async (callback) => callback(editable),
  };
  const page = {
    url: () => currentUrl,
    goto: async (url) => {
      navigations.push(url);
      currentUrl = url;
    },
    waitForFunction: async (_predicate, argument) => {
      if (argument && !Array.isArray(argument) && 'previousCount' in argument) {
        currentUrl = fixtureUrl;
      }
    },
    waitForTimeout: async () => {},
    locator: (selector) =>
      selector.includes('prompt-textarea') || selector.includes('contenteditable')
        ? locator
        : {
            count: async () => 0,
            first() {
              return this;
            },
          },
    evaluate: async (_callback, argument) => {
      if (Array.isArray(argument)) {
        sentPrompts.push(composerText);
        composerText = '';
        sendCount += 1;
        userMessageCount += 1;
        assistantMessageCount += 1;
        currentUrl = sendCount === 1 ? provisionalUrl : fixtureUrl;
        return true;
      }
      return {
        url: currentUrl,
        userMessageCount,
        assistantMessageCount,
        lastUserHash: userMessageCount ? `user-${userMessageCount}` : '',
        lastAssistantHash: assistantMessageCount ? `assistant-${assistantMessageCount}` : '',
        composerHasText: Boolean(composerText.trim()),
      };
    },
    keyboard: {
      press: async (key) => {
        keyboardEvents.push({ type: 'press', key });
        if (key === 'Control+A') selected = true;
        if (key === 'Backspace' && selected) {
          composerText = '';
          selected = false;
        }
      },
      type: async (text) => {
        const checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
        checkpointStatusesBeforePrompt.push(checkpoint.blankHomeDraftPreparation?.status || '');
        keyboardEvents.push({ type: 'type', text });
        composerText += text;
      },
    },
  };
  return {
    page,
    navigations,
    keyboardEvents,
    sentPrompts,
    checkpointStatusesBeforePrompt,
    composerCountReads: () => composerCountReads,
    composerVisibilityReads: () => composerVisibilityReads,
    currentText: () => composerText,
    setUserMessageCount: (count) => {
      userMessageCount = count;
    },
    setComposerText: (text) => {
      composerText = text;
    },
  };
}

test('fresh owned fixture setup persists proof and the writer reuses its reserved run folder', async () => {
  const { prepareFreshAuditOwnedFixture, writeScrapeRun } = await coreModule;
  const runDirectory = await makeReservedRunDirectory();
  const fixtureUrl = `https://chatgpt.com/c/fresh-fixture-${randomUUID()}`;
  const checkpointPath = path.join(runDirectory.path, 'shortcut-audit-checkpoint.json');
  const page = { url: () => fixtureUrl };

  try {
    const ownership = await prepareFreshAuditOwnedFixture(page, {
      runDirectory,
      fixtureCreator: async (
        _page,
        { checkpoint, persistCheckpoint, trackAuditOwnedConversation },
      ) => {
        const beforeFirstPrompt = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
        assert.equal(beforeFirstPrompt.status, 'fixture-setup-pending');
        assert.equal(beforeFirstPrompt.currentCase.phase, 'fixture-creation-pending');
        assert.equal(beforeFirstPrompt.auditFixtureSourceRun, runDirectory.name);

        checkpoint.currentCase.phase = 'message-1-pending';
        await persistCheckpoint();
        trackAuditOwnedConversation(fixtureUrl);
        checkpoint.auditFixtureUrl = fixtureUrl;
        checkpoint.completedCases.push({
          rowId: 'setup:audit-owned-fixture',
          status: 'pass',
          semanticStatus: 'pass',
          fixtureUrl,
          conversationId: fixtureUrl.split('/').at(-1),
          userMessageCount: 2,
          assistantMessageCount: 2,
          completedAt: new Date().toISOString(),
        });
        checkpoint.currentCase = null;
        await persistCheckpoint();
        return fixtureUrl;
      },
    });

    assert.equal(ownership.kind, 'audit-owned');
    assert.equal(ownership.fixtureUrl, fixtureUrl);
    assert.equal(ownership.conversationId, fixtureUrl.split('/').at(-1));
    assert.equal(ownership.sourceRunFolder, runDirectory.name);
    assert.equal(ownership.sourceCheckpointPath, checkpointPath);
    assert.equal(ownership.setupProof.userMessageCount, 2);
    assert.equal(ownership.setupProof.assistantMessageCount, 2);
    assert.ok(Number.isFinite(Date.parse(ownership.setupStartedAt)));
    assert.ok(Number.isFinite(Date.parse(ownership.preparedAt)));

    const scrapeResult = {
      fixtureUrl,
      fixtureOwnership: ownership,
      startedAt: ownership.setupStartedAt,
      artifacts: [],
      capturedCount: 0,
      failedCount: 0,
      deferredCount: 0,
    };
    const written = await writeScrapeRun({
      scrapeResult,
      normalizedArtifacts: [],
      runDirectory,
    });
    assert.equal(written.folderName, runDirectory.name);
    assert.equal(written.folderPath, runDirectory.path);
    assert.equal(written.manifest.startedAt, ownership.setupStartedAt);
    assert.equal(written.manifest.fixtureOwnership.sourceRunFolder, runDirectory.name);
    assert.equal(JSON.parse(await fs.readFile(checkpointPath, 'utf8')).status, 'fixture-prepared');
    assert.equal(
      JSON.parse(await fs.readFile(path.join(runDirectory.path, 'run-manifest.json'), 'utf8'))
        .folderName,
      runDirectory.name,
    );
  } finally {
    await fs.rm(runDirectory.path, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
});

test('production fixture creator recovers from transient composer lookup gaps before clearing and sending', async () => {
  const { prepareFreshAuditOwnedFixture } = await coreModule;
  const runDirectory = await makeReservedRunDirectory();
  const fixtureUrl = `https://chatgpt.com/c/production-fixture-${randomUUID()}`;
  const provisionalUrl = `https://chatgpt.com/c/provisional-fixture-${randomUUID()}`;
  const checkpointPath = path.join(runDirectory.path, 'shortcut-audit-checkpoint.json');
  const privateDraft = 'An unsent draft from the previous root-home visit';
  const fixturePage = makeProductionFixturePage({
    fixtureUrl,
    provisionalUrl,
    initialDraft: privateDraft,
    checkpointPath,
  });

  try {
    const ownership = await prepareFreshAuditOwnedFixture(fixturePage.page, { runDirectory });
    const checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));

    assert.equal(ownership.kind, 'audit-owned');
    assert.equal(ownership.fixtureUrl, fixtureUrl);
    assert.equal(ownership.setupProof.userMessageCount, 2);
    assert.equal(ownership.setupProof.assistantMessageCount, 2);
    assert.deepEqual(fixturePage.checkpointStatusesBeforePrompt, ['cleared', 'cleared']);
    assert.ok(fixturePage.composerCountReads() >= 3);
    assert.ok(fixturePage.composerVisibilityReads() >= 2);
    assert.equal(fixturePage.sentPrompts.length, 2);
    assert.deepEqual(fixturePage.navigations, ['https://chatgpt.com/']);
    assert.equal(fixturePage.currentText(), '');
    assert.deepEqual(
      fixturePage.keyboardEvents.slice(0, 2).map((event) => event.key),
      ['Control+A', 'Backspace'],
    );
    assert.equal(checkpoint.blankHomeDraftPreparation.status, 'cleared');
    assert.deepEqual(ownership.auditOwnedConversationIds, [
      provisionalUrl.split('/').at(-1),
      fixtureUrl.split('/').at(-1),
    ]);
    assert.deepEqual(Object.keys(checkpoint.blankHomeDraftPreparation).sort(), [
      'completedAt',
      'reason',
      'scope',
      'status',
    ]);
    assert.equal(JSON.stringify(checkpoint).includes(privateDraft), false);
  } finally {
    await fs.rm(runDirectory.path, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
});

test('production fixture creator reuses prepared home while rechecking draft and turn safety', async () => {
  const { prepareFreshAuditOwnedFixture, prepareNewConversationProbeState } = await coreModule;
  for (const changedTurns of [false, true]) {
    const runDirectory = await makeReservedRunDirectory();
    const fixtureUrl = `https://chatgpt.com/c/prepared-fixture-${randomUUID()}`;
    const fixturePage = makeProductionFixturePage({
      fixtureUrl,
      initialDraft: '',
      checkpointPath: path.join(runDirectory.path, 'shortcut-audit-checkpoint.json'),
    });
    try {
      await prepareNewConversationProbeState(fixturePage.page, null);
      if (changedTurns) fixturePage.setUserMessageCount(1);
      else fixturePage.setComposerText('Draft appeared after home preparation');
      if (changedTurns) {
        await assert.rejects(
          prepareFreshAuditOwnedFixture(fixturePage.page, { runDirectory }),
          /not a zero-turn audit chat/,
        );
        assert.equal(fixturePage.sentPrompts.length, 0);
      } else {
        const ownership = await prepareFreshAuditOwnedFixture(fixturePage.page, { runDirectory });
        assert.equal(ownership.setupProof.userMessageCount, 2);
        assert.equal(ownership.setupProof.assistantMessageCount, 2);
        assert.deepEqual(fixturePage.checkpointStatusesBeforePrompt, ['cleared', 'cleared']);
      }
      assert.deepEqual(fixturePage.navigations, ['https://chatgpt.com/']);
    } finally {
      await fs.rm(runDirectory.path, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  }
});

test('fresh owned fixture setup rejects incomplete two-turn proof and keeps its checkpoint', async () => {
  const { prepareFreshAuditOwnedFixture } = await coreModule;
  const runDirectory = await makeReservedRunDirectory();
  const fixtureUrl = `https://chatgpt.com/c/incomplete-fixture-${randomUUID()}`;
  const checkpointPath = path.join(runDirectory.path, 'shortcut-audit-checkpoint.json');

  try {
    await assert.rejects(
      prepareFreshAuditOwnedFixture(
        { url: () => fixtureUrl },
        {
          runDirectory,
          fixtureCreator: async (
            _page,
            { checkpoint, persistCheckpoint, trackAuditOwnedConversation },
          ) => {
            checkpoint.currentCase.phase = 'message-2-response-pending';
            await persistCheckpoint();
            trackAuditOwnedConversation(fixtureUrl);
            checkpoint.auditFixtureUrl = fixtureUrl;
            checkpoint.completedCases.push({
              rowId: 'setup:audit-owned-fixture',
              status: 'pass',
              semanticStatus: 'pass',
              fixtureUrl,
              conversationId: fixtureUrl.split('/').at(-1),
              userMessageCount: 2,
              assistantMessageCount: 1,
              completedAt: new Date().toISOString(),
            });
            await persistCheckpoint();
            return fixtureUrl;
          },
        },
      ),
      /completed two-turn setup proof/,
    );

    const checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
    assert.equal(checkpoint.status, 'fixture-setup-failed');
    assert.equal(checkpoint.currentCase.phase, 'fixture-creation-failed');
    assert.equal(checkpoint.auditOwnedConversationIds[0], fixtureUrl.split('/').at(-1));
    assert.equal(checkpoint.completedCases[0].assistantMessageCount, 1);
  } finally {
    await fs.rm(runDirectory.path, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
});

test('fresh fixture preparation and scrape writing reject paths outside the reserved captures root', async () => {
  const { prepareFreshAuditOwnedFixture, writeScrapeRun } = await coreModule;
  const invalidRunDirectory = {
    name: 'outside-run',
    path: path.join(os.tmpdir(), `outside-run-${randomUUID()}`),
  };

  await assert.rejects(
    prepareFreshAuditOwnedFixture({ url: () => '' }, { runDirectory: invalidRunDirectory }),
    /direct child of inspector-captures/,
  );
  await assert.rejects(
    writeScrapeRun({
      scrapeResult: { artifacts: [] },
      normalizedArtifacts: [],
      runDirectory: invalidRunDirectory,
    }),
    /direct child of inspector-captures/,
  );
});
