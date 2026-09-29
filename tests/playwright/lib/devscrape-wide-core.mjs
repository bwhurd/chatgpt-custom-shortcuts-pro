import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import modelPickerSelectors from '../../../extension/shared/model-picker-selectors.js';
import {
  buildShortcutValidationInventory,
  parseModelPickerLabelsSource,
  parseOptionsDefaultsFromSource,
  parseSettingsSchemaSource,
} from './shortcut-target-inventory.mjs';
import {
  AUDIT_ARTIFACT_FILENAMES,
  buildShortcutAuditReport,
  buildStorageRecoveryPlan,
  buildStorageRecoveryReport,
  createStorageMutationLedger,
  finalizeStorageRecoveryPlan,
  writeShortcutAuditArtifacts,
} from './shortcut-audit-artifacts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const devScrapeWidePath = path.join(repoRoot, 'extension', 'lib', 'DevScrapeWide.js');
const modelPickerSelectorsPath = path.join(
  repoRoot,
  'extension',
  'shared',
  'model-picker-selectors.js',
);
const contentSourcePath = path.join(repoRoot, 'extension', 'content.js');
const settingsSchemaPath = path.join(repoRoot, 'extension', 'settings-schema.js');
const optionsStorageSourcePath = path.join(repoRoot, 'extension', 'options-storage.js');
const modelPickerLabelsSourcePath = path.join(
  repoRoot,
  'extension',
  'shared',
  'model-picker-labels.js',
);
const englishLocaleMessagesPath = path.join(
  repoRoot,
  'extension',
  '_locales',
  'en',
  'messages.json',
);
const inspectorCapturesRoot = path.join(repoRoot, '_temp-files', 'inspector-captures');
const GPT_CONVERSATION_PROBE_URL =
  'https://chatgpt.com/g/g-vU0PtzgAJ-step-1-2-nbme-medical-school-question-analysis-v2/c/69eba3bf-6f18-83ea-aa31-9a995aca7bc0';

const PAGE_EXPORT_NAMES = [
  'DEV_SCRAPE_WIDE_FIXTURE_URL',
  'DEV_SCRAPE_WIDE_FALLBACK_FIXTURE_URL',
  'runWideScrapeInPage',
  'normalizeHtmlForDump',
];
const LIVE_PROBE_REPORT_FILENAME = 'live-probes.json';
const AUDIT_STORAGE_SNAPSHOT_KEYS = Object.freeze([
  'modelPickerKeyCodes',
  'modelPickerKeyCodesLatest',
  'modelPickerKeyCodesLegacy',
  'enableSendWithControlEnterCheckbox',
  'enableStopWithControlBackspaceCheckbox',
  'pageUpDownTakeover',
  'codeboxWrapEnabled',
  'modelCatalogLatest',
  'modelCatalogLegacy',
]);
const EXECUTABLE_LIVE_PROBE_MODES = Object.freeze([
  'click-target',
  'focus-target',
  'opens-target',
  'direct-menu-target',
  'viewport-target',
  'clipboard-text',
  'dom-state',
]);
const MIN_BROWSER_REQUEST_SPACING_MS = 2500;
const MIN_BROWSER_INTERACTION_SPACING_MS = 350;
const MIN_EXTENSION_PAGE_SPACING_MS = 1000;
const NEW_CONVERSATION_ACTION_ID = 'shortcutKeyNewConversation';
const TEMPORARY_CHAT_ACTION_ID = 'shortcutKeyTemporaryChat';
const PREVIOUS_THREAD_ACTION_ID = 'shortcutKeyPreviousThread';
const NEXT_THREAD_ACTION_ID = 'shortcutKeyNextThread';
const CLICK_SEND_ACTION_ID = 'shortcutKeyClickSendButton';
const CLICK_STOP_ACTION_ID = 'shortcutKeyClickStopButton';
const SEND_EDIT_ACTION_ID = 'shortcutKeySendEdit';
const TOGGLE_DICTATE_ACTION_ID = 'shortcutKeyToggleDictate';
const CANCEL_DICTATION_ACTION_ID = 'shortcutKeyCancelDictation';
const COPY_ALL_CODE_BLOCKS_ACTION_ID = 'shortcutKeyCopyAllCodeBlocks';
const TOGGLE_CODEBOX_WRAP_ACTION_ID = 'shortcutKeyToggleCodeboxWrap';
const NEW_CONVERSATION_TARGET_READY_DELAY_MS = 500;
const DEFAULT_LIVE_PROBE_SETTLE_MS = 1600;
const CHATGPT_HOME_URL = 'https://chatgpt.com/';
const COMPOSER_TEXTBOX_SELECTORS = Object.freeze([
  'form[data-thread-find-composer="true"] [contenteditable="true"][role="textbox"]',
  'form[data-thread-find-composer="true"] #prompt-textarea',
  'form[data-thread-find-composer="true"] textarea[name="prompt-textarea"]',
  'form[data-chatgpt-composer] [data-composer-markdown]',
  'form[data-chatgpt-composer] [contenteditable="true"][role="textbox"]',
  'form[data-chatgpt-composer] #prompt-textarea',
  'form[data-chatgpt-composer] textarea[name="prompt-textarea"]',
]);
const COMPOSER_PLUS_BUTTON_SELECTORS = Object.freeze([
  'form[data-thread-find-composer="true"] button[data-composer-navigation-target="add-context"]',
  'form[data-chatgpt-composer] button[data-composer-navigation-target="add-context"]',
]);
const SEND_BUTTON_SELECTORS = Object.freeze([
  'button[data-testid="send-button"]',
  '#composer-submit-button',
  'form[data-thread-find-composer="true"] button[type="submit"]',
  'form[data-chatgpt-composer] button[type="submit"]',
]);
const USER_MESSAGE_SELECTORS = Object.freeze([
  '[data-message-author-role="user"]',
  '[data-user-message-bubble="true"]',
  '[data-testid^="conversation-turn-"][data-turn="user"]',
  '[data-chatgpt-search-unit-key$=":user"]',
]);
const ASSISTANT_MESSAGE_SELECTORS = Object.freeze([
  '[data-message-author-role="assistant"]',
  '[data-chatgpt-selection-message-id][data-chatgpt-selection-conversation-id]',
  '[data-chatgpt-search-unit-key$=":assistant"]',
]);
const RESPONSE_NAVIGATION_ATTEMPTS = 2;
const RESPONSE_NAVIGATION_STEP_SETTLE_MS = 1500;
const SIDE_EFFECT_MESSAGE_TEXT = 'this is a message I sent';
const SIDE_EFFECT_EDITED_MESSAGE_TEXT = 'this is an edited message';
const STOP_AFTER_SEND_DELAY_MS = 500;
const CODEBOX_RESPONSE_MIN_WAIT_MS = 15000;
const CODEBOX_RESPONSE_TIMEOUT_MS = 90000;
const CODEBOX_CONTENT_SELECTORS = Object.freeze([
  'div[id="code-block-viewer"].cm-editor .cm-content code',
  '[data-markdown-copy="code-block"] code',
  'pre:not(.cm-content) > code',
]);
const CODEBOX_VALIDATION_CONTAINER_SELECTOR = [
  '[data-message-author-role="assistant"]',
  '[data-markdown-text-style="assistant-message"]',
  'div[id="code-block-viewer"].cm-editor',
].join(', ');
const CODEBOX_WRAP_PROMPT_TEXT =
  'Return exactly one fenced JavaScript code block with one physical source line: a quoted string containing 500 consecutive digits with no spaces or line breaks inside the digits. Do not add prose.';
const CODEBOX_COPY_PROMPT_TEXT =
  'give me a 300 word story about sword fighting rats defending a moon base in a single codebox';
const STATELESS_LIVE_PROBE_SETUPS = Object.freeze([
  'new-conversation',
  'gpt-conversation',
  'composer-draft-message',
  'in-flight-message',
  'active-edit-card',
  'sent-user-message',
  'dictation-active',
  'model-effort-shortcut',
  'scroll-from-top',
  'scroll-from-bottom',
  'message-scroll-from-middle',
  'clipboard-single-message',
  'clipboard-entire-conversation',
  'clipboard-code-blocks',
  'codebox-conversation',
  'shortcut-overlay-ready',
]);
const CONTROL_SHORTCUT_ACTION_IDS = Object.freeze([CLICK_SEND_ACTION_ID, CLICK_STOP_ACTION_ID]);
const MODEL_EFFORT_ACTION_IDS = Object.freeze([
  'shortcutKeyThinkingStandard',
  'shortcutKeyThinkingExtended',
  'shortcutKeyThinkingLight',
  'shortcutKeyThinkingHeavy',
  'shortcutKeyProStandard',
  'shortcutKeyProExtended',
]);

let cachedContract = null;
let lastBrowserRequestAt = 0;

async function waitBeforeBrowserRequest() {
  const elapsed = Date.now() - lastBrowserRequestAt;
  if (elapsed < MIN_BROWSER_REQUEST_SPACING_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_BROWSER_REQUEST_SPACING_MS - elapsed));
  }
  lastBrowserRequestAt = Date.now();
}

async function waitBeforeBrowserInteraction() {
  await new Promise((resolve) => setTimeout(resolve, MIN_BROWSER_INTERACTION_SPACING_MS));
}

async function waitAroundExtensionPageAction() {
  await new Promise((resolve) => setTimeout(resolve, MIN_EXTENSION_PAGE_SPACING_MS));
}

function sanitizeModuleSource(source) {
  return String(source || '')
    .replace(/^\s*export\s+\{\s*isAbortError\s*\};?\s*$/m, '')
    .replace(/^export\s+/gm, '');
}

function buildNodeContractFromSource(source) {
  const sanitized = sanitizeModuleSource(source);
  const factory = new Function(`
${sanitized}
return {
  DEV_SCRAPE_WIDE_FIXTURE_URL,
  DEV_SCRAPE_WIDE_FALLBACK_FIXTURE_URL,
  DUMP_REGISTRY,
  DEFERRED_ARTIFACTS,
  buildRunFolderName,
  summarizeScrapeWriteResult,
  summarizeCheckResult,
};
`);
  return {
    sanitizedSource: sanitized,
    exports: factory(),
  };
}

export async function loadDevScrapeWideContract() {
  if (cachedContract) return cachedContract;
  const source = await readFile(devScrapeWidePath, 'utf8');
  cachedContract = buildNodeContractFromSource(source);
  return cachedContract;
}

export function getRepoRoot() {
  return repoRoot;
}

export function getInspectorCapturesRoot() {
  return inspectorCapturesRoot;
}

export async function ensureInspectorCapturesRoot() {
  await mkdir(inspectorCapturesRoot, { recursive: true });
  return inspectorCapturesRoot;
}

export function resolveAuditOwnedFixtureFromCheckpoint(
  checkpoint,
  { protectedFixtureUrls = [] } = {},
) {
  if (
    checkpoint?.status !== 'completed' ||
    checkpoint.auditFixtureOwned !== true ||
    checkpoint.finalBrowserState?.fixtureRestored !== true
  ) {
    throw new Error('The source run does not contain a completed, recovered audit-owned fixture.');
  }

  const fixtureUrl = String(checkpoint.auditFixtureUrl || '').trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(fixtureUrl);
  } catch {
    throw new Error('The source run has no valid audit-owned ChatGPT fixture URL.');
  }
  const match = parsedUrl.pathname.match(/^\/c\/([A-Za-z0-9-]+)$/);
  const conversationId = match?.[1] || '';
  if (
    parsedUrl.origin !== 'https://chatgpt.com' ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash ||
    !conversationId ||
    checkpoint.fixtureUrl !== fixtureUrl ||
    !Array.isArray(checkpoint.auditOwnedConversationIds) ||
    !checkpoint.auditOwnedConversationIds.includes(conversationId) ||
    protectedFixtureUrls.includes(fixtureUrl)
  ) {
    throw new Error('The source run fixture is not a verified audit-owned conversation.');
  }

  return {
    kind: 'audit-owned',
    fixtureUrl,
    conversationId,
  };
}

export async function loadAuditOwnedFixtureFromRun(sourceRunFolderName) {
  const folderName = String(sourceRunFolderName || '').trim();
  if (!folderName || folderName !== path.basename(folderName)) {
    throw new Error('Pass a run folder name under _temp-files/inspector-captures.');
  }

  const capturesRoot = path.resolve(inspectorCapturesRoot);
  const runDirectory = path.resolve(capturesRoot, folderName);
  const relativePath = path.relative(capturesRoot, runDirectory);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('The source run folder must be directly under _temp-files/inspector-captures.');
  }

  const checkpointPath = path.join(runDirectory, 'shortcut-audit-checkpoint.json');
  const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
  const { exports } = await loadDevScrapeWideContract();
  const fixture = resolveAuditOwnedFixtureFromCheckpoint(checkpoint, {
    protectedFixtureUrls: [
      exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
      exports.DEV_SCRAPE_WIDE_FALLBACK_FIXTURE_URL,
    ],
  });
  return {
    ...fixture,
    sourceRunFolder: folderName,
    sourceCheckpointPath: checkpointPath,
  };
}

export async function readCurrentRuntimeSource() {
  return readFile(contentSourcePath, 'utf8');
}

async function readSettingsSchemaSource() {
  return readFile(settingsSchemaPath, 'utf8');
}

async function readEnglishLocaleMessages() {
  try {
    const text = await readFile(englishLocaleMessagesPath, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function injectDevScrapeWideIntoPage(page) {
  const { sanitizedSource } = await loadDevScrapeWideContract();
  const selectorSource = await readFile(modelPickerSelectorsPath, 'utf8');
  await page.evaluate(
    ({ selectorSource, source, exportNames }) => {
      new Function(selectorSource)();
      const factory = new Function(`
${source}
return {
${exportNames.map((name) => `  ${name},`).join('\n')}
};
`);
      window.__CGCSP_DEVSCRAPE_WIDE__ = factory();
    },
    {
      selectorSource,
      source: sanitizedSource,
      exportNames: PAGE_EXPORT_NAMES,
    },
  );
}

export async function normalizeArtifactsInPage(page, artifacts) {
  return page.evaluate((artifactList) => {
    const normalize = window.__CGCSP_DEVSCRAPE_WIDE__.normalizeHtmlForDump;
    return artifactList.map((artifact) => ({
      filename: artifact.filename,
      normalizedHtml: normalize(window, artifact.rawHtml),
    }));
  }, artifacts);
}

export async function waitForFixtureConversationReady(page, timeout = 20000, options = {}) {
  const { exports } = await loadDevScrapeWideContract();
  const fixtureUrl = options.fixtureUrl || exports.DEV_SCRAPE_WIDE_FIXTURE_URL;
  await page.waitForFunction(
    ({ expectedFixtureUrl, composerSelectors }) => {
      const hasVisibleComposer = composerSelectors.some((selector) =>
        Array.from(document.querySelectorAll(selector)).some((node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.pointerEvents !== 'none' &&
            rect.width > 0 &&
            rect.height > 0
          );
        }),
      );
      return (
        window.location.href === expectedFixtureUrl &&
        document.readyState !== 'loading' &&
        Boolean(document.querySelector('main')) &&
        hasVisibleComposer
      );
    },
    { expectedFixtureUrl: fixtureUrl, composerSelectors: [...COMPOSER_TEXTBOX_SELECTORS] },
    { timeout },
  );
}

export async function waitForAuditOwnedFixtureContent(page, fixtureUrl, timeout = 30000) {
  await page.waitForFunction(
    ({ expectedUrl, minimumUserMessages, minimumAssistantMessages }) => {
      if (window.location.href !== expectedUrl) return false;
      const units = Array.from(
        document.querySelectorAll('[data-chatgpt-search-unit-key$=":user"], [data-chatgpt-search-unit-key$=":assistant"]'),
      );
      const countRole = (role) =>
        units.filter((unit) =>
          unit.getAttribute('data-chatgpt-search-unit-key')?.endsWith(`:${role}`),
        ).length;
      const legacyMessages = Array.from(document.querySelectorAll('[data-message-author-role]'));
      const userCount = countRole('user') || legacyMessages.filter((unit) => unit.getAttribute('data-message-author-role') === 'user').length;
      const assistantCount = countRole('assistant') || legacyMessages.filter((unit) => unit.getAttribute('data-message-author-role') === 'assistant').length;
      return userCount >= minimumUserMessages && assistantCount >= minimumAssistantMessages;
    },
    {
      expectedUrl: fixtureUrl,
      minimumUserMessages: 2,
      minimumAssistantMessages: 2,
    },
    { timeout },
  );
}

export async function evaluateWideScrapePageInfo(page, options = {}) {
  const { exports } = await loadDevScrapeWideContract();
  const fixtureUrl = options.fixtureUrl || exports.DEV_SCRAPE_WIDE_FIXTURE_URL;
  return page.evaluate((expectedFixtureUrl) => {
    const legacyTurns = Array.from(
      document.querySelectorAll('section[data-testid^="conversation-turn-"][data-turn]'),
    );
    const messageUnits = Array.from(
      document.querySelectorAll(
        '[data-chatgpt-search-unit-key$=":user"], [data-chatgpt-search-unit-key$=":assistant"]',
      ),
    );
    const assistantMessageUnits = messageUnits.filter((unit) =>
      unit.getAttribute('data-chatgpt-search-unit-key')?.endsWith(':assistant'),
    );
    const hasWebCitation = (root) =>
      Boolean(
        root.querySelector(
          '[data-testid="webpage-citation-pill"], [data-testid*="citation"], [data-citation-id]',
        ),
      );
    return {
      url: window.location.href,
      title: document.title,
      fixtureUrl: expectedFixtureUrl,
      fixtureOk: window.location.href === expectedFixtureUrl,
      turnCount: legacyTurns.length || document.querySelectorAll('[data-turn-key]').length,
      assistantTurnCount:
        legacyTurns.length > 0
          ? legacyTurns.filter((turn) => turn.getAttribute('data-turn') === 'assistant').length
          : assistantMessageUnits.length,
      userTurnCount:
        legacyTurns.length > 0
          ? legacyTurns.filter((turn) => turn.getAttribute('data-turn') === 'user').length
          : messageUnits.filter((unit) =>
              unit.getAttribute('data-chatgpt-search-unit-key')?.endsWith(':user'),
            ).length,
      hasWebSearchTurn:
        legacyTurns.some(hasWebCitation) ||
        assistantMessageUnits.some((unit) =>
          hasWebCitation(unit.closest('[data-turn-key]') || unit),
        ),
    };
  }, fixtureUrl);
}

async function getExtensionId(context, options = {}) {
  const extensionIdFromProfile = await readExtensionIdFromSecurePreferences(options.extensionProfileDir);
  if (extensionIdFromProfile) {
    return extensionIdFromProfile;
  }

  if (context.serviceWorkers().length === 0) {
    await context.waitForEvent('serviceworker', { timeout: 5000 }).catch(() => {});
  }
  const serviceWorkerIds = context
    .serviceWorkers()
    .map((serviceWorker) => new URL(serviceWorker.url()).host)
    .filter(Boolean);
  const uniqueServiceWorkerIds = [...new Set(serviceWorkerIds)];
  if (uniqueServiceWorkerIds.length === 1) {
    return uniqueServiceWorkerIds[0];
  }
  if (uniqueServiceWorkerIds.length > 1) {
    throw new Error(
      `Could not choose a deterministic extension id because multiple extension service workers were present: ${uniqueServiceWorkerIds.join(', ')}`,
    );
  }

  throw new Error(
    'Could not resolve a loaded extension id from the active browser context. Run validate-wide with auto-launch enabled so Chrome starts with the local unpacked extension.',
  );
}

function normalizeFsPath(value) {
  if (!value) return '';
  return path.resolve(String(value)).replace(/\\/g, '/').toLowerCase();
}

async function readExtensionIdFromSecurePreferences(profileDir = null) {
  const candidateProfileDir =
    profileDir ||
    path.join(
      process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local'),
      'Google',
      'Chrome',
      'User Data',
      'CodexCleanProfile',
    );
  const securePreferencesPath = path.join(candidateProfileDir, 'Default', 'Secure Preferences');
  const expectedExtensionPath = normalizeFsPath(path.join(repoRoot, 'extension'));

  try {
    const securePreferences = JSON.parse(await readFile(securePreferencesPath, 'utf8'));
    const extensionSettings = securePreferences?.extensions?.settings || {};
    for (const [extensionId, settings] of Object.entries(extensionSettings)) {
      if (normalizeFsPath(settings?.path) === expectedExtensionPath) {
        return extensionId;
      }
    }
  } catch {}

  return null;
}

async function withExtensionPopup(context, options, callback) {
  const extensionId = await getExtensionId(context, options);
  await waitAroundExtensionPageAction();
  const page = await context.newPage();
  try {
    await waitAroundExtensionPageAction();
    await page.goto(`chrome-extension://${extensionId}/popup.html?playwrightSetup=1`, {
      waitUntil: 'domcontentloaded',
    });
    await waitAroundExtensionPageAction();
    return await callback(page);
  } finally {
    await waitAroundExtensionPageAction();
    await page.close().catch(() => {});
    await waitAroundExtensionPageAction();
  }
}

async function readMoveTopBarToBottomSetting(context, options = {}) {
  return withExtensionPopup(context, options, (page) =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const key = 'moveTopBarToBottomCheckbox';
          chrome.storage.sync.get(key, (items) => {
            const error = chrome.runtime.lastError;
            if (error) {
              reject(new Error(error.message));
              return;
            }
            resolve({
              present: Object.prototype.hasOwnProperty.call(items, key),
              value: items[key],
            });
          });
        }),
    ),
  );
}

async function configureMoveTopBarToBottomSetting(context, enabled, options = {}) {
  return withExtensionPopup(context, options, (page) =>
    page.evaluate(
      (value) =>
        new Promise((resolve, reject) => {
          chrome.storage.sync.set({ moveTopBarToBottomCheckbox: value }, () => {
            const error = chrome.runtime.lastError;
            if (error) reject(new Error(error.message));
            else resolve();
          });
        }),
      enabled,
    ),
  );
}

async function restoreMoveTopBarToBottomSetting(context, originalSetting, options = {}) {
  return withExtensionPopup(context, options, (page) =>
    page.evaluate(
      (original) =>
        new Promise((resolve, reject) => {
          const key = 'moveTopBarToBottomCheckbox';
          const finish = () => {
            const error = chrome.runtime.lastError;
            if (error) {
              reject(new Error(error.message));
              return;
            }
            chrome.storage.sync.get(key, (items) => {
              const readError = chrome.runtime.lastError;
              if (readError) {
                reject(new Error(readError.message));
                return;
              }
              const restored = {
                present: Object.prototype.hasOwnProperty.call(items, key),
                value: items[key],
              };
              if (
                restored.present !== original.present ||
                restored.value !== original.value
              ) {
                reject(new Error('Move Top Bar to Bottom setting did not restore its original storage value.'));
                return;
              }
              resolve();
            });
          };
          if (original.present) {
            chrome.storage.sync.set({ [key]: original.value }, finish);
          } else {
            chrome.storage.sync.remove(key, finish);
          }
        }),
      originalSetting,
    ),
  );
}

async function resetFixturePage(page, fixtureUrl, options = {}) {
  const { forceReload = false } = options;
  if (page.url() !== fixtureUrl) {
    await waitBeforeBrowserRequest();
    await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
  } else if (forceReload) {
    await waitBeforeBrowserRequest();
    await page.reload({ waitUntil: 'domcontentloaded' });
  } else {
    // Reuse an already-rendered owned fixture. Reloading every probe repeatedly
    // hit transient ChatGPT conversation-load failures without clearing useful state.
    const ready = await page
      .evaluate(
        (composerSelectors) =>
          document.readyState !== 'loading' &&
          Boolean(document.querySelector('main')) &&
          composerSelectors.some((selector) =>
            Array.from(document.querySelectorAll(selector)).some((node) => {
              if (!(node instanceof HTMLElement)) return false;
              const style = getComputedStyle(node);
              const rect = node.getBoundingClientRect();
              return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                rect.width > 0 &&
                rect.height > 0
              );
            }),
          ),
        [...COMPOSER_TEXTBOX_SELECTORS],
      )
      .catch(() => false);
    if (!ready) {
      await waitBeforeBrowserRequest();
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
  }
  await waitForFixtureConversationReady(page, 30000, { fixtureUrl });
  await page.waitForTimeout(500);
}

async function closeOpenMenus(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const menuCount = await page
      .locator(
        [
          '[data-radix-menu-content][data-state="open"][role="menu"]',
          'div.popover:has(div.__menu-item[tabindex])',
        ].join(', '),
      )
      .count();
    if (!menuCount) return;
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);
  }
}

async function closeConfigureDialog(page) {
  const closeButton = page.locator('[role="dialog"] [data-testid="close-button"]').first();
  if ((await closeButton.count()) > 0 && (await closeButton.isVisible().catch(() => false))) {
    await closeButton.click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
  }
  const dialog = page.locator('[role="dialog"]').first();
  if ((await dialog.count()) > 0) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);
  }
}

async function closeTransientUi(page) {
  await closeOpenMenus(page);
  await closeConfigureDialog(page);
  await closeOpenMenus(page);
  await closeComposerPlusMenu(page);
}

async function findVisibleComposerPlusButton(page) {
  const buttons = page.locator(COMPOSER_PLUS_BUTTON_SELECTORS.join(', '));
  for (let index = 0; index < (await buttons.count()); index += 1) {
    const candidate = buttons.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function composerPlusButtonOpen(page) {
  const button = await findVisibleComposerPlusButton(page);
  return Boolean(
    button &&
      (await button.evaluate(
        (element) =>
          element.getAttribute('aria-expanded') === 'true' ||
          element.getAttribute('data-state') === 'open',
      )),
  );
}

async function closeComposerPlusMenu(page) {
  const button = await findVisibleComposerPlusButton(page);
  if (!button || !(await composerPlusButtonOpen(page))) return;
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
  if (await composerPlusButtonOpen(page)) {
    await waitBeforeBrowserInteraction();
    await button.click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

async function setSidebarState(page, state) {
  const shellToggle = page
    .locator('button[aria-controls="app-shell-sidebar"][aria-expanded]')
    .filter({ visible: true })
    .last();
  if ((await shellToggle.count()) > 0) {
    const targetExpanded = state === 'expanded';
    const currentExpanded = (await shellToggle.getAttribute('aria-expanded')) === 'true';
    if (currentExpanded !== targetExpanded) {
      await waitBeforeBrowserInteraction();
      await shellToggle.click({ force: true });
      await page.waitForTimeout(300);
      const expandedAfterClick = (await shellToggle.getAttribute('aria-expanded')) === 'true';
      if (expandedAfterClick !== targetExpanded) {
        throw new Error(`Sidebar did not reach the requested ${state} state`);
      }
    }
    return;
  }

  const closeButton = page.locator('button[data-testid="close-sidebar-button"]').first();
  const openButton = page
    .locator(
      [
        'button[data-testid="open-sidebar-button"]',
        '#stage-sidebar-tiny-bar button[aria-controls="stage-slideover-sidebar"]',
      ].join(', '),
    )
    .first();
  const hasClose = (await closeButton.count()) > 0 && (await closeButton.isVisible().catch(() => false));
  if (state === 'collapsed') {
    if (hasClose) {
      await waitBeforeBrowserInteraction();
      await closeButton.click({ force: true });
      await page.waitForTimeout(300);
    }
    return;
  }
  if (state === 'expanded') {
    if (hasClose) return;
    if (!((await openButton.count()) > 0) || !(await openButton.isVisible().catch(() => false))) {
      throw new Error('Could not find a visible sidebar open control');
    }
    await waitBeforeBrowserInteraction();
    await openButton.click({ force: true });
    await page.waitForTimeout(300);
  }
}

async function getTurnMetas(page) {
  return page.evaluate(() =>
    (() => {
      const legacyTurns = Array.from(
        document.querySelectorAll('section[data-testid^="conversation-turn-"][data-turn]'),
      );
      if (legacyTurns.length > 0) {
        return legacyTurns.map((turn) => ({
        testId: turn.getAttribute('data-testid') || '',
        turnRef: turn.getAttribute('data-turn') || '',
        hasWeb: !!turn.querySelector('[data-testid="webpage-citation-pill"]'),
        }));
      }

      return Array.from(
        document.querySelectorAll(
          '[data-chatgpt-search-unit-key$=":user"], [data-chatgpt-search-unit-key$=":assistant"]',
        ),
      ).map((unit) => {
        const unitKey = unit.getAttribute('data-chatgpt-search-unit-key') || '';
        const role = unitKey.endsWith(':user') ? 'user' : 'assistant';
        const turn = unit.closest('[data-turn-key]') || unit;
        return {
          testId: turn.getAttribute('data-turn-key')
            ? `turn:${turn.getAttribute('data-turn-key')}`
            : `unit:${unitKey}`,
          turnRef: role,
          hasWeb: Boolean(
            turn.querySelector(
              '[data-testid="webpage-citation-pill"], [data-testid*="citation"], [data-citation-id]',
            ),
          ),
        };
      });
    })(),
  );
}

function getTurnElementSelector(turnTestId) {
  const value = String(turnTestId || '');
  const escapeAttributeValue = (attributeValue) =>
    String(attributeValue).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (value.startsWith('turn:')) {
    return `[data-turn-key="${escapeAttributeValue(value.slice(5))}"]`;
  }
  if (value.startsWith('unit:')) {
    return `[data-chatgpt-search-unit-key="${escapeAttributeValue(value.slice(5))}"]`;
  }
  return `section[data-testid="${escapeAttributeValue(value)}"]`;
}

async function getLatestUserMessageLocator(page) {
  const userMessage = page.locator(USER_MESSAGE_SELECTORS.join(', ')).last();
  if ((await userMessage.count()) > 0) return userMessage;
  throw new Error('Could not locate a current-format user message for the Edit probe.');
}

async function resolveTurnTestId(page, turnRef) {
  const turns = await getTurnMetas(page);
  if (turnRef === 'user-first') {
    return turns.find((turn) => turn.turnRef === 'user')?.testId || null;
  }
  if (turnRef === 'assistant-first-no-web') {
    return turns.find((turn) => turn.turnRef === 'assistant' && !turn.hasWeb)?.testId || null;
  }
  if (turnRef === 'assistant-first-web') {
    return turns.find((turn) => turn.turnRef === 'assistant' && turn.hasWeb)?.testId || null;
  }
  return null;
}

async function getTurnProbeIds(page, preferredTurnTestId = null) {
  const turns = await getTurnMetas(page);
  const ordered = [
    preferredTurnTestId,
    ...turns.filter((turn) => turn.turnRef === 'assistant').map((turn) => turn.testId),
  ].filter(Boolean);
  return ordered.filter((turnTestId, index) => ordered.indexOf(turnTestId) === index);
}

async function hoverTurn(page, turnTestId) {
  const turnSelector = getTurnElementSelector(turnTestId);
  const selectors = [
    turnSelector,
    `${turnSelector} .group\\/turn-messages`,
    `${turnSelector} [data-message-author-role]`,
    turnSelector,
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (!((await locator.count()) > 0)) continue;
    await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await locator.hover({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function captureTurnHtml(page, turnTestId) {
  const locator = page.locator(getTurnElementSelector(turnTestId)).first();
  if (!((await locator.count()) > 0)) return '';
  return (await locator.evaluate((node) => node.outerHTML).catch(() => '')) || '';
}

async function describeVisibleControls(page, turnTestId) {
  return page.evaluate((selector) => {
    const turn = document.querySelector(selector);
    if (!turn) return 'turn not found';
    const controls = Array.from(turn.querySelectorAll('button,[role="button"]'))
      .map((button) => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        const visible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 0 &&
          rect.height > 0;
        if (!visible) return null;
        return [
          button.tagName.toLowerCase(),
          button.getAttribute('aria-label')
            ? `aria-label=${button.getAttribute('aria-label')}`
            : '',
          button.getAttribute('data-testid')
            ? `data-testid=${button.getAttribute('data-testid')}`
            : '',
          button.getAttribute('aria-haspopup')
            ? `aria-haspopup=${button.getAttribute('aria-haspopup')}`
            : '',
        ]
          .filter(Boolean)
          .join(' ');
      })
      .filter(Boolean);
    return controls.length ? controls.join(' | ') : 'no visible controls';
  }, getTurnElementSelector(turnTestId));
}

function getTurnMenuProbeConfig(menuKind = 'more-actions') {
  if (menuKind === 'regenerate') {
    return {
      triggerSelectors: [
        'button[aria-label="Switch model"]',
        'button[aria-label="Regenerate response"][aria-haspopup="menu"]',
      ],
      expectedNeedles: [
        'contextual-retry-dropdown-input',
        '#ffd536',
        '#9254a2',
        '#ec66f0',
        'Try again',
        'Don&#x27;t search the web',
        "Don't search the web",
      ],
    };
  }
  return {
    triggerSelectors: [
      'button[aria-label="More actions"]',
    ],
    expectedNeedles: ['voice-play-turn-action-button', '#03583c', 'Read aloud', 'Branch in new chat'],
  };
}

async function getLatestOpenMenuHtml(page) {
  return (
    (await page
      .evaluate(() => {
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0
          );
        };
        const openComposerButton = Array.from(
          document.querySelectorAll(
            'button[data-composer-navigation-target="add-context"][aria-expanded="true"], button[data-composer-navigation-target="add-context"][data-state="open"]',
          ),
        ).find(isVisible);
        if (openComposerButton) {
          const listItems = Array.from(
            document.querySelectorAll('button[data-list-navigation-item="true"]'),
          ).filter(isVisible);
          for (const item of listItems) {
            for (let ancestor = item.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
              const style = window.getComputedStyle(ancestor);
              const rect = ancestor.getBoundingClientRect();
              if (
                style.position === 'fixed' &&
                rect.width > 0 &&
                rect.height > 0 &&
                ancestor.querySelectorAll('button[data-list-navigation-item="true"]').length > 1
              ) {
                return ancestor.outerHTML || '';
              }
            }
          }
        }
        const selectors = [
          'div.popover:has(div.__menu-item[tabindex])',
          '[data-radix-menu-content][data-state="open"][role="menu"]',
          '[data-radix-menu-content][role="menu"]',
          '[data-radix-popper-content-wrapper] [role="menu"]',
          '[role="menu"][data-state="open"]',
          '[role="menu"]',
        ];
        for (const selector of selectors) {
          const matches = Array.from(document.querySelectorAll(selector)).filter(isVisible);
          if (matches.length) {
            return matches[matches.length - 1].outerHTML || '';
          }
        }
        return '';
      })
      .catch(() => '')) || ''
  );
}

async function openTurnMenu(page, turnTestId, menuKind = 'more-actions') {
  await closeOpenMenus(page);
  const { triggerSelectors, expectedNeedles } = getTurnMenuProbeConfig(menuKind);
  const probeTurnIds = await getTurnProbeIds(page, turnTestId);

  for (let pass = 0; pass < 4; pass += 1) {
    for (const probeTurnId of probeTurnIds) {
      await hoverTurn(page, probeTurnId);

      for (const relativeSelector of triggerSelectors) {
        const selector = `${getTurnElementSelector(probeTurnId)} ${relativeSelector}`;
        const locator = page.locator(selector);
        const count = await locator.count();
        for (let index = 0; index < count; index += 1) {
          const candidate = locator.nth(index);
          if (!(await candidate.isVisible().catch(() => false))) continue;
          await closeOpenMenus(page);
          await hoverTurn(page, probeTurnId);
          await candidate.click({ force: true }).catch(() => {});
          await page.waitForTimeout(350);
          const html = await getLatestOpenMenuHtml(page);
          if (expectedNeedles.some((needle) => html.includes(needle))) {
            return html;
          }
        }
      }
    }
  }

  const details = await describeVisibleControls(page, turnTestId);
  throw new Error(
    `Could not open ${menuKind} menu after multiple probes. Available controls: ${details}`,
  );
}

async function openModelSwitcherMenu(page) {
  await closeTransientUi(page);
  const selectors = Array.isArray(modelPickerSelectors.MODEL_MENU_BUTTON_SELECTORS)
    ? modelPickerSelectors.MODEL_MENU_BUTTON_SELECTORS
    : ['button[data-testid="model-switcher-dropdown-button"]'];
  let button = null;
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        button = candidate;
        break;
      }
    }
    if (button) break;
  }
  if (!button) {
    throw new Error('Could not find a visible model switcher button');
  }
  const triggerId = (await button.getAttribute('id').catch(() => '')) || '';
  const readOpenMenuHtml = async () => {
    const menuHtml = await page.waitForFunction(
      ({ menuSelector, configureMenuItemSelector, triggerId }) => {
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
          );
        };
        const menus = Array.from(document.querySelectorAll(menuSelector)).filter(isVisible);
        const match =
          menus.find((menu) => triggerId && menu.getAttribute('aria-labelledby') === triggerId) ||
          menus.find((menu) => menu.querySelector(configureMenuItemSelector)) ||
          menus.find((menu) => menu.querySelector('[data-testid^="model-switcher-"]')) ||
          menus[menus.length - 1] ||
          null;
        return match?.outerHTML || '';
      },
      {
        menuSelector: modelPickerSelectors.MODEL_MENU_SELECTOR,
        configureMenuItemSelector: modelPickerSelectors.MODEL_CONFIGURE_MENU_ITEM_SELECTOR,
        triggerId,
      },
      { timeout: 1400 },
    );
    return (await menuHtml.jsonValue().catch(() => '')) || '';
  };

  const attempts = [
    async () => button.click({ force: true }),
    async () => {
      await button.focus().catch(() => {});
      await button.press('Space');
    },
    async () => {
      await button.focus().catch(() => {});
      await button.press('Enter');
    },
  ];
  let lastError = null;
  for (const attempt of attempts) {
    await closeOpenMenus(page);
    await button.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(200);
    await attempt().catch((error) => {
      lastError = error;
    });
    await page.waitForTimeout(300);
    try {
      const html = await readOpenMenuHtml();
      if (html) return html;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Model switcher menu did not open${lastError ? `: ${lastError.message || lastError}` : ''}`);
}

async function findModelThinkingEffortAction(page, options = {}) {
  const actions = page.locator(modelPickerSelectors.MODEL_THINKING_EFFORT_ACTION_SELECTOR);
  const actionCount = await actions.count().catch(() => 0);
  for (let index = 0; index < actionCount; index += 1) {
    const candidate = actions.nth(index);
    const isPro = await candidate
      .evaluate((node) => {
        const actionTestId = node.getAttribute('data-testid') || '';
        const row = node.closest('[data-model-picker-thinking-effort-row="true"]');
        const menuItem =
          row?.querySelector('[data-model-picker-thinking-effort-menu-item="true"]') ||
          node.closest('[data-model-picker-thinking-effort-menu-item="true"]');
        const itemTestId = menuItem?.getAttribute?.('data-testid') || '';
        const itemText = menuItem?.textContent || row?.textContent || '';
        return (
          /(?:^|-)pro(?:$|-)/i.test(actionTestId) ||
          /(?:^|-)pro(?:$|-)/i.test(itemTestId) ||
          /\bPro\b/i.test(itemText)
        );
      })
      .catch(() => false);
    if ((options.kind === 'pro' && isPro) || (options.kind !== 'pro' && !isPro)) {
      return candidate;
    }
  }
  return actionCount > 0 && options.kind !== 'pro' ? actions.first() : null;
}

async function openModelThinkingEffortMenu(page, options = {}) {
  await openModelSwitcherMenu(page);
  if (options.kind !== 'pro') {
    const reasoningSlider = page
      .locator(`${modelPickerSelectors.MODEL_MENU_SELECTOR} [data-reasoning-slider]`)
      .last();
    if (
      (await reasoningSlider.count().catch(() => 0)) > 0 &&
      (await reasoningSlider.isVisible().catch(() => false))
    ) {
      return reasoningSlider.evaluate((node) => node.outerHTML);
    }
  }
  const action = await findModelThinkingEffortAction(page, options);
  if (!action || !((await action.count().catch(() => 0)) > 0)) {
    throw new Error(
      options.kind === 'pro'
        ? 'Could not find model picker Pro thinking effort action'
        : 'Could not find model picker thinking effort action',
    );
  }
  const row = action.locator('xpath=ancestor::*[@data-model-picker-thinking-effort-row="true"][1]');
  if ((await row.count().catch(() => 0)) > 0) {
    await row.first().hover({ force: true }).catch(() => {});
  }
  await action.hover({ force: true }).catch(() => {});
  const controlledId = (await action.getAttribute('aria-controls').catch(() => '')) || '';
  await action.click({ force: true }).catch(async () => {
    await action.focus().catch(() => {});
    await action.press('Enter');
  });
  await page.waitForTimeout(300);
  const menuHtml = await page.waitForFunction(
    ({ menuSelector, controlledId }) => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const controlled = controlledId ? document.getElementById(controlledId) : null;
      if (controlled && isVisible(controlled)) return controlled.outerHTML;
      const menus = Array.from(document.querySelectorAll(menuSelector)).filter(isVisible);
      return (
        menus
          .filter((menu) => /Standard|Extended/i.test(menu.textContent || ''))
          .at(-1)?.outerHTML || ''
      );
    },
    {
      menuSelector: modelPickerSelectors.MODEL_MENU_SELECTOR,
      controlledId,
    },
    { timeout: 1800 },
  );
  const html = (await menuHtml.jsonValue().catch(() => '')) || '';
  if (!html) {
    throw new Error(
      options.kind === 'pro'
        ? 'Model picker Pro thinking effort submenu did not open'
        : 'Model picker thinking effort submenu did not open',
    );
  }
  return html;
}

async function openComposerPlusMenu(page) {
  await closeTransientUi(page);
  await closeComposerPlusMenu(page);
  const button = await findVisibleComposerPlusButton(page);
  if (!button) {
    throw new Error('Could not find a visible composer Add files and more button');
  }
  await page.waitForFunction(
    (selectors) =>
      selectors.some((selector) =>
        Array.from(document.querySelectorAll(selector)).some((node) => {
          if (!(node instanceof HTMLButtonElement) || node.disabled) return false;
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          );
        }),
      ),
    [...COMPOSER_PLUS_BUTTON_SELECTORS],
    { timeout: 12000 },
  );

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await closeOpenMenus(page);
    await closeComposerPlusMenu(page);
    await button.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(250);
    await waitBeforeBrowserInteraction();
    await button.click({ force: true }).catch(() => {});
    await page.waitForTimeout(350);
    const html = await getLatestOpenMenuHtml(page);
    if (isComposerPlusMenuHtml(html) || (await composerPlusButtonOpen(page))) {
      return html || (await button.evaluate((element) => element.outerHTML));
    }
  }

  throw new Error('Could not open the composer Add files and more menu');
}

function isComposerPlusMenuHtml(html) {
  return Boolean(
    html &&
      ((html.includes('data-composer-navigation-target="add-context"') &&
        (html.includes('aria-expanded="true"') || html.includes('data-state="open"'))) ||
        html.includes('role="menuitem"') ||
        html.includes('role="menuitemradio"') ||
        html.includes('data-list-navigation-item="true"') ||
        html.includes('data-radix-menu-item') ||
        html.includes('__menu-item')),
  );
}

function isComposerMoreSubmenuHtml(html) {
  return Boolean(html) && (html.includes('#1fa93b') || html.includes('#e717cc') || html.includes('#cf3864'));
}

async function ensureComposerPlusMenuOpen(page) {
  const html = await getLatestOpenMenuHtml(page);
  if (isComposerPlusMenuHtml(html) || (await composerPlusButtonOpen(page))) {
    if (html) return html;
    const button = await findVisibleComposerPlusButton(page);
    return button ? button.evaluate((element) => element.outerHTML) : '';
  }
  return openComposerPlusMenu(page);
}

async function findComposerMoreTrigger(page) {
  const menu = page.locator('[data-radix-menu-content][data-state="open"][role="menu"]').last();
  if (!((await menu.count()) > 0)) return null;

  const candidates = menu.locator(
    '[role="menuitem"][aria-haspopup="menu"], [role="menuitem"][data-has-submenu]',
  );
  const count = await candidates.count();

  let fallback = null;
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) continue;

    const html = (await candidate.evaluate((node) => node.outerHTML).catch(() => '')) || '';
    const text = (await candidate.textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim() || '';

    if (html.includes('#f6d0e2') || /^more$/i.test(text)) {
      return candidate;
    }

    fallback = candidate;
  }

  return fallback;
}

async function openComposerMoreSubmenu(page) {
  const firstMenuHtml = await ensureComposerPlusMenuOpen(page);
  if (!firstMenuHtml) {
    throw new Error('Composer Add files and more menu did not open before submenu probe');
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const trigger = await findComposerMoreTrigger(page);
    if (!trigger) {
      if (attempt < 3) {
        await openComposerPlusMenu(page);
        continue;
      }
      throw new Error('Could not find composer More submenu trigger');
    }

    const openCountBefore = await page
      .locator('[data-radix-menu-content][data-state="open"][role="menu"]')
      .count();
    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(250);
    await waitBeforeBrowserInteraction();
    await trigger.hover({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
    await waitBeforeBrowserInteraction();
    await trigger.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);

    const html = await getLatestOpenMenuHtml(page);
    const openCountAfter = await page
      .locator('[data-radix-menu-content][data-state="open"][role="menu"]')
      .count();
    if (isComposerMoreSubmenuHtml(html) || (html && openCountAfter > openCountBefore) || html !== firstMenuHtml) {
      return html;
    }
  }

  throw new Error('Could not open composer More submenu');
}

async function openConversationOptionsMenu(page) {
  await closeTransientUi(page);
  const selectors = [
    'button[data-testid="conversation-options-button"]',
    'header [data-testid="app-shell-header-context-menu-surface"] button[aria-haspopup="menu"]',
    'header button[aria-haspopup="menu"]',
  ];
  let button = null;
  for (const selector of selectors) {
    const candidates = page.locator(selector);
    for (let index = 0; index < (await candidates.count().catch(() => 0)); index += 1) {
      const candidate = candidates.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        button = candidate;
        break;
      }
    }
    if (button) break;
  }
  if (!button) {
    throw new Error('Could not find a visible conversation options button');
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await closeOpenMenus(page);
    await button.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(250);
    await waitBeforeBrowserInteraction();
    await button.click({ force: true }).catch(() => {});
    await page.waitForTimeout(350);
    const html = await getLatestOpenMenuHtml(page);
    if (html && html.includes('role="menuitem"')) {
      return html;
    }
  }

  throw new Error('Could not open conversation options menu');
}

async function findComboboxByLabelId(page, labelId) {
  const escapedLabelId = String(labelId || '').replace(/"/g, '\\"');
  const locator = page
    .locator(
      [
        `[role="dialog"] button[role="combobox"][aria-labelledby~="${escapedLabelId}"][aria-controls]`,
        `[role="dialog"] #${escapedLabelId} ~ button[role="combobox"][aria-controls]`,
        `[role="dialog"] #${escapedLabelId} + button[role="combobox"][aria-controls]`,
      ].join(', '),
    )
    .first();
  if (!((await locator.count()) > 0)) return null;
  return locator;
}

async function findConfigureCombobox(page) {
  return findComboboxByLabelId(page, modelPickerSelectors.MODEL_SELECTION_LABEL_ID);
}

async function findThinkingEffortCombobox(page) {
  return findComboboxByLabelId(page, modelPickerSelectors.THINKING_EFFORT_SELECTION_LABEL_ID);
}

async function openConfigureDialog(page) {
  await openModelSwitcherMenu(page);
  const configureItem = page
    .locator(
      `${modelPickerSelectors.MODEL_MENU_SELECTOR} ${modelPickerSelectors.MODEL_CONFIGURE_MENU_ITEM_SELECTOR}`,
    )
    .first();
  if (!((await configureItem.count()) > 0) || !(await configureItem.isVisible().catch(() => false))) {
    throw new Error('Could not find visible model-configure-modal item');
  }
  await configureItem.click({ force: true });
  await page.waitForTimeout(300);
  const combobox = await findConfigureCombobox(page);
  if (!combobox) {
    throw new Error('Configure dialog did not open');
  }
  return combobox;
}

async function openConfigureListbox(page) {
  const combobox = (await findConfigureCombobox(page)) || (await openConfigureDialog(page));
  await combobox.click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
  const listboxId = await combobox.getAttribute('aria-controls');
  if (!listboxId) {
    throw new Error('Configure combobox did not expose aria-controls');
  }
  const listbox = page.locator(`#${listboxId}`).first();
  await listbox.waitFor({ state: 'visible', timeout: 2000 });
  return listbox;
}

async function openThinkingEffortListbox(page) {
  let combobox = await findThinkingEffortCombobox(page);
  if (!combobox) {
    await openConfigureDialog(page);
    combobox = await findThinkingEffortCombobox(page);
  }
  if (!combobox) {
    throw new Error('Could not find thinking effort combobox in Configure dialog');
  }
  await combobox.click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
  const listboxId = await combobox.getAttribute('aria-controls');
  if (!listboxId) {
    throw new Error('Thinking effort combobox did not expose aria-controls');
  }
  const listbox = page.locator(`#${listboxId}`).first();
  await listbox.waitFor({ state: 'visible', timeout: 2000 });
  return listbox;
}

function getConfigureOptionTarget(optionId) {
  if (optionId === 'configure-latest') {
    return { mode: 'first', label: '' };
  }
  if (optionId === 'configure-5-2') {
    return { mode: 'label', label: '5.2' };
  }
  if (optionId === 'configure-5-4') {
    return { mode: 'label', label: '5.4' };
  }
  if (optionId === 'configure-o3') {
    return { mode: 'label', label: 'o3' };
  }
  throw new Error(`Unsupported configure option ${optionId}`);
}

async function selectConfigureOption(page, optionId) {
  const listbox = await openConfigureListbox(page);
  const options = listbox.locator('[role="option"]');
  const optionCount = await options.count();
  if (!optionCount) {
    throw new Error('Configure listbox had no options');
  }
  const target = getConfigureOptionTarget(optionId);
  let option = null;
  if (target.mode === 'first') {
    option = options.first();
  } else {
    for (let index = 0; index < optionCount; index += 1) {
      const candidate = options.nth(index);
      const text = (await candidate.textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim() || '';
      if (text === target.label || text.startsWith(`${target.label}Alt+`)) {
        option = candidate;
        break;
      }
    }
  }
  if (!option) {
    throw new Error(`Could not find configure option for ${optionId}`);
  }
  await option.click({ force: true });
  await page.waitForTimeout(350);
}

async function captureByType(page, captureType, state) {
  if (captureType === 'body') {
    return page.evaluate(() => document.body?.outerHTML || '');
  }
  if (captureType === 'thread-bottom') {
    return page.evaluate(
      () =>
        document.getElementById('thread-bottom')?.outerHTML ||
        document.getElementById('thread-bottom-container')?.outerHTML ||
        document.querySelector('form[data-chatgpt-composer]')?.outerHTML ||
        '',
    );
  }
  if (captureType === 'header-area') {
    return page.evaluate(() => {
      const header = document.getElementById('page-header');
      return (
        header?.closest?.('[data-scroll-root]')?.outerHTML ||
        header?.parentElement?.outerHTML ||
        header?.outerHTML ||
        document.querySelector('main header [data-testid="app-shell-header-context-menu-surface"]')
          ?.closest('header')?.outerHTML ||
        document.querySelector('main header')?.outerHTML ||
        ''
      );
    });
  }
  if (captureType === 'current-turn') {
    return state.currentTurnTestId ? captureTurnHtml(page, state.currentTurnTestId) : '';
  }
  if (captureType === 'latest-open-menu') {
    return state.latestMenuHtml || '';
  }
  if (captureType === 'configure-dialog') {
    return (
      (await page.locator('[role="dialog"]').first().evaluate((node) => node.outerHTML).catch(() => '')) ||
      ''
    );
  }
  if (captureType === 'configure-listbox') {
    return page.evaluate(() => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const listbox = Array.from(document.querySelectorAll('[role="listbox"]')).filter(isVisible).at(-1);
      return listbox?.outerHTML || '';
    });
  }
  return '';
}

function buildArtifactRecord(definition, status, rawHtml = '', error = null) {
  return {
    filename: definition.filename,
    stateId: definition.stateId,
    label: definition.label,
    status,
    error,
    aliasOf: definition.aliasOf || null,
    rawHtml,
    captureBytes: rawHtml.length,
    clickPath: Array.isArray(definition.steps) ? definition.steps.map((step) => step.label) : [],
  };
}

function isExtensionUnavailableError(error) {
  const message = String(error?.message || error || '');
  return (
    message.includes('Could not resolve a loaded extension id') ||
    message.includes('net::ERR_FILE_NOT_FOUND at chrome-extension://') ||
    message.includes('net::ERR_BLOCKED_BY_CLIENT at chrome-extension://')
  );
}

async function captureTopBarMovedThreadBottom(context, fixtureUrl, options = {}) {
  const { requireExtensionCapture = false } = options;
  const definition = {
    filename: '1c_TopbarToBottomEnabled_ThreadBottom.txt',
    stateId: 'topbar-bottom-enabled-thread-bottom',
    label: 'Top bar moved to bottom thread-bottom area',
    steps: [{ type: 'toggle-move-topbar-to-bottom', label: 'enable MoveTopBarToBottom extension setting' }],
    capture: { type: 'thread-bottom' },
  };
  const capturePage = await context.newPage();
  let originalSetting = null;
  let artifact = null;
  let captureError = null;
  let restoreError = null;

  try {
    originalSetting = await readMoveTopBarToBottomSetting(context, options);
    await configureMoveTopBarToBottomSetting(context, true, options);
    await waitAroundExtensionPageAction();
    await capturePage.goto(fixtureUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForFixtureConversationReady(capturePage, 30000, { fixtureUrl });
    await capturePage.waitForFunction(
      () => document.documentElement.classList.contains('csp-bottom-bar-ready'),
      undefined,
      { timeout: 10000 },
    );
    if (options.fixtureOwnership?.kind === 'audit-owned') {
      await waitForAuditOwnedFixtureContent(capturePage, fixtureUrl);
    }
    const rawHtml = await captureByType(capturePage, definition.capture.type, {
      currentTurnTestId: null,
      latestMenuHtml: '',
    });
    if (!rawHtml) {
      throw new Error(`Capture for ${definition.filename} returned empty HTML`);
    }
    artifact = buildArtifactRecord(definition, 'captured', rawHtml);
  } catch (error) {
    if (isExtensionUnavailableError(error) && !requireExtensionCapture) {
      artifact = buildArtifactRecord(
        definition,
        'deferred',
        '',
        `${error?.message || error} This optional layout-state dump requires an extension-enabled validation profile; run setup-login after this change if the profile needs to be rebuilt.`,
      );
    } else {
      captureError = error;
    }
  } finally {
    if (originalSetting) {
      try {
        await restoreMoveTopBarToBottomSetting(context, originalSetting, options);
      } catch (error) {
        restoreError = error;
      }
    }
    await capturePage.close().catch(() => {});
  }

  if (captureError || restoreError) {
    const errors = [captureError, restoreError]
      .filter(Boolean)
      .map((error) => error?.message || String(error));
    return buildArtifactRecord(
      definition,
      'failed',
      '',
      `${errors.join('; ')}${
        requireExtensionCapture
          ? ' Strict extension capture is enabled, so this optional dump is required.'
          : ''
      }`,
    );
  }
  return artifact || buildArtifactRecord(definition, 'failed', '', 'Top-bar capture did not return an artifact.');
}

export async function runWideScrapeWithPlaywright(page, context, options = {}) {
  const { exports } = await loadDevScrapeWideContract();
  const fixtureUrl = options.fixtureUrl || exports.DEV_SCRAPE_WIDE_FIXTURE_URL;
  const startedAt = new Date().toISOString();
  const defaultViewportSize = page.viewportSize() || { width: 1280, height: 900 };
  const alreadyLoadedOwnedFixture =
    options.fixtureOwnership?.kind === 'audit-owned' && page.url() === fixtureUrl;
  if (alreadyLoadedOwnedFixture) {
    await closeTransientUi(page);
    await waitForFixtureConversationReady(page, 30000, { fixtureUrl });
  } else {
    await resetFixturePage(page, fixtureUrl);
  }
  if (options.fixtureOwnership?.kind === 'audit-owned') {
    await waitForAuditOwnedFixtureContent(page, fixtureUrl);
  }
  const pageInfo = await evaluateWideScrapePageInfo(page, { fixtureUrl });
  const rawArtifacts = new Map();
  const artifacts = [];

  for (const definition of exports.DUMP_REGISTRY) {
    if (definition.aliasOf) continue;
    let restoreViewportSize = null;
    try {
      await closeOpenMenus(page);
      await closeConfigureDialog(page);
      await page.waitForTimeout(250);
      const state = {
        currentTurnTestId: null,
        latestMenuHtml: '',
      };
      for (const step of definition.steps || []) {
        if (step.type === 'set-sidebar-state') {
          await setSidebarState(page, step.state);
          continue;
        }
        if (step.type === 'focus-turn') {
          const turnTestId = await resolveTurnTestId(page, step.turnRef);
          if (!turnTestId) {
            throw new Error(`Could not find turn for ${step.turnRef}`);
          }
          state.currentTurnTestId = turnTestId;
          await hoverTurn(page, turnTestId);
          continue;
        }
        if (step.type === 'open-turn-menu') {
          if (!state.currentTurnTestId) {
            throw new Error('No current turn is selected');
          }
          state.latestMenuHtml = await openTurnMenu(
            page,
            state.currentTurnTestId,
            step.menuKind || 'more-actions',
          );
          continue;
        }
        if (step.type === 'open-model-switcher-menu') {
          state.latestMenuHtml = await openModelSwitcherMenu(page);
          continue;
        }
        if (step.type === 'open-model-thinking-effort-menu') {
          state.latestMenuHtml = await openModelThinkingEffortMenu(page);
          continue;
        }
        if (step.type === 'open-model-pro-thinking-effort-menu') {
          state.latestMenuHtml = await openModelThinkingEffortMenu(page, { kind: 'pro' });
          continue;
        }
        if (step.type === 'open-composer-plus-menu') {
          state.latestMenuHtml = await openComposerPlusMenu(page);
          continue;
        }
        if (step.type === 'open-composer-more-submenu') {
          state.latestMenuHtml = await openComposerMoreSubmenu(page);
          continue;
        }
        if (step.type === 'open-conversation-options-menu') {
          state.latestMenuHtml = await openConversationOptionsMenu(page);
          continue;
        }
        if (step.type === 'open-configure-dialog') {
          await openConfigureDialog(page);
          continue;
        }
        if (step.type === 'open-configure-listbox') {
          await openConfigureListbox(page);
          continue;
        }
        if (step.type === 'open-thinking-effort-listbox') {
          await openThinkingEffortListbox(page);
          continue;
        }
        if (step.type === 'select-configure-option') {
          await selectConfigureOption(page, step.optionId);
          continue;
        }
        if (step.type === 'set-viewport-size') {
          restoreViewportSize = restoreViewportSize || defaultViewportSize;
          await page.setViewportSize({
            width: Number(step.width) || 500,
            height: Number(step.height) || 900,
          });
          await page.waitForTimeout(600);
          continue;
        }
        throw new Error(`Unsupported scrape step: ${step.type}`);
      }

      const rawHtml = await captureByType(page, definition.capture?.type, state);
      if (!rawHtml) {
        throw new Error(`Capture for ${definition.filename} returned empty HTML`);
      }
      rawArtifacts.set(definition.filename, rawHtml);
      artifacts.push(buildArtifactRecord(definition, 'captured', rawHtml));
    } catch (error) {
      artifacts.push(
        buildArtifactRecord(
          definition,
          'failed',
          '',
          error?.message || String(error) || 'Unknown capture failure',
        ),
      );
    } finally {
      if (restoreViewportSize) {
        await page.setViewportSize(restoreViewportSize).catch(() => {});
        await page.waitForTimeout(300).catch(() => {});
      }
    }
  }

  for (const definition of exports.DUMP_REGISTRY.filter((item) => item.aliasOf)) {
    const sourceHtml = rawArtifacts.get(definition.aliasOf);
    if (sourceHtml) {
      rawArtifacts.set(definition.filename, sourceHtml);
      artifacts.push(buildArtifactRecord(definition, 'alias', sourceHtml));
    } else {
      artifacts.push(
        buildArtifactRecord(
          definition,
          'failed',
          '',
          `Alias source ${definition.aliasOf} was not captured`,
        ),
      );
    }
  }

  const oneCArtifact = await captureTopBarMovedThreadBottom(
    context,
    fixtureUrl,
    options,
  );
  artifacts.push(oneCArtifact);

  for (const deferred of exports.DEFERRED_ARTIFACTS) {
    if (deferred.filename === oneCArtifact.filename) continue;
    artifacts.push(buildArtifactRecord(deferred, deferred.status || 'deferred'));
  }

  return {
    runKind: 'devscrapewide',
    fixtureUrl,
    fixtureOwnership: options.fixtureOwnership || null,
    pageInfo,
    startedAt,
    completedAt: new Date().toISOString(),
    capturedCount: artifacts.filter((artifact) => artifact.status === 'captured' || artifact.status === 'alias')
      .length,
    failedCount: artifacts.filter((artifact) => artifact.status === 'failed').length,
    deferredCount: artifacts.filter((artifact) => artifact.status === 'deferred').length,
    artifacts,
  };
}

export async function verifyExtensionRuntimeReachable(context, options = {}) {
  const extensionId = await getExtensionId(context, options);
  await waitAroundExtensionPageAction();
  const extensionPage = await context.newPage();
  try {
    await waitAroundExtensionPageAction();
    await extensionPage.goto(`chrome-extension://${extensionId}/popup.html?playwrightProbe=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 5000,
    });
    await waitAroundExtensionPageAction();
    return { extensionId };
  } finally {
    await waitAroundExtensionPageAction();
    await extensionPage.close().catch(() => {});
    await waitAroundExtensionPageAction();
  }
}

export async function refreshModelCatalogForValidation(page, context, options = {}) {
  const session = await context.newCDPSession(page);
  const executionContexts = [];
  session.on('Runtime.executionContextCreated', (event) => {
    if (event?.context) executionContexts.push(event.context);
  });
  try {
    await session.send('Runtime.enable');
    await page.waitForTimeout(250);
    const contentContext = executionContexts.find(
      (executionContext) =>
        executionContext?.name === 'ChatGPT Custom Shortcuts Pro' &&
        String(executionContext?.origin || '').startsWith('chrome-extension://'),
    );
    if (!contentContext?.id) {
      throw new Error('Could not find the ChatGPT Custom Shortcuts Pro content-script context.');
    }
    const evaluation = await session.send('Runtime.evaluate', {
      contextId: contentContext.id,
      awaitPromise: true,
      returnByValue: true,
      expression: `new Promise((resolve) => {
        if (!globalThis.chrome?.runtime?.sendMessage) {
          resolve({ ok: false, error: 'chrome.runtime.sendMessage is not available.' });
          return;
        }
        globalThis.chrome.runtime.sendMessage(
          {
            type: 'csp.relayToSenderTab',
            payload: {
              type: 'CSP_SCRAPE_MODEL_CATALOG',
              hideUi: true,
              keepPreparedSession: false,
            },
          },
          (response) => {
            const lastError = globalThis.chrome.runtime?.lastError;
            if (lastError) {
              resolve({ ok: false, error: lastError.message || String(lastError) });
              return;
            }
            resolve(response && typeof response === 'object' ? response : { ok: false });
          },
        );
      })`,
    });
    if (evaluation.exceptionDetails) {
      throw new Error(
        evaluation.exceptionDetails.text ||
          evaluation.exceptionDetails.exception?.description ||
          'Model catalog refresh evaluation failed',
      );
    }
    const result = evaluation.result?.value || null;
    if (!result?.ok) {
      throw new Error(result?.error || 'Model catalog refresh failed');
    }
    return result;
  } finally {
    await session.detach().catch(() => {});
  }
}

async function readExtensionSyncStorage(context, extensionId, keys) {
  await waitAroundExtensionPageAction();
  const extensionPage = await context.newPage();
  try {
    await waitAroundExtensionPageAction();
    await extensionPage.goto(`chrome-extension://${extensionId}/popup.html?playwrightProbe=storage`, {
      waitUntil: 'domcontentloaded',
      timeout: 5000,
    });
    await waitAroundExtensionPageAction();
    return await extensionPage.evaluate(
      (storageKeys) =>
        new Promise((resolve, reject) => {
          if (!globalThis.chrome?.storage?.sync) {
            reject(new Error('chrome.storage.sync is not available from the extension page.'));
            return;
          }
          globalThis.chrome.storage.sync.get(storageKeys, (items) => {
            const lastError = globalThis.chrome.runtime?.lastError;
            if (lastError) {
              reject(new Error(lastError.message || String(lastError)));
              return;
            }
            resolve(items || {});
          });
        }),
      keys,
    );
  } finally {
    await waitAroundExtensionPageAction();
    await extensionPage.close().catch(() => {});
    await waitAroundExtensionPageAction();
  }
}

async function mutateExtensionSyncStorage(context, extensionId, operation) {
  await waitAroundExtensionPageAction();
  const extensionPage = await context.newPage();
  try {
    await waitAroundExtensionPageAction();
    await extensionPage.goto(`chrome-extension://${extensionId}/popup.html?playwrightProbe=storage`, {
      waitUntil: 'domcontentloaded',
      timeout: 5000,
    });
    await waitAroundExtensionPageAction();
    return await extensionPage.evaluate(
      ({ op, payload }) =>
        new Promise((resolve, reject) => {
          if (!globalThis.chrome?.storage?.sync) {
            reject(new Error('chrome.storage.sync is not available from the extension page.'));
            return;
          }
          const finish = () => {
            const lastError = globalThis.chrome.runtime?.lastError;
            if (lastError) {
              reject(new Error(lastError.message || String(lastError)));
              return;
            }
            resolve(true);
          };
          if (op === 'set') {
            globalThis.chrome.storage.sync.set(payload, finish);
            return;
          }
          if (op === 'remove') {
            globalThis.chrome.storage.sync.remove(payload, finish);
            return;
          }
          reject(new Error(`Unsupported chrome.storage.sync operation: ${op}`));
        }),
      operation,
    );
  } finally {
    await waitAroundExtensionPageAction();
    await extensionPage.close().catch(() => {});
    await waitAroundExtensionPageAction();
  }
}

async function applyProbeStateStep(page, step, state) {
  if (step.type === 'set-sidebar-state') {
    await setSidebarState(page, step.state);
    return;
  }
  if (step.type === 'focus-turn') {
    const turnTestId = await resolveTurnTestId(page, step.turnRef);
    if (!turnTestId) {
      throw new Error(`Could not find turn for ${step.turnRef}`);
    }
    state.currentTurnTestId = turnTestId;
    await hoverTurn(page, turnTestId);
    return;
  }
  if (step.type === 'open-turn-menu') {
    if (!state.currentTurnTestId) {
      throw new Error('No current turn is selected');
    }
    state.latestMenuHtml = await openTurnMenu(
      page,
      state.currentTurnTestId,
      step.menuKind || 'more-actions',
    );
    return;
  }
  if (step.type === 'open-model-switcher-menu') {
    state.latestMenuHtml = await openModelSwitcherMenu(page);
    return;
  }
  if (step.type === 'open-model-thinking-effort-menu') {
    state.latestMenuHtml = await openModelThinkingEffortMenu(page);
    return;
  }
  if (step.type === 'open-model-pro-thinking-effort-menu') {
    state.latestMenuHtml = await openModelThinkingEffortMenu(page, { kind: 'pro' });
    return;
  }
  if (step.type === 'set-viewport-size') {
    await page.setViewportSize({
      width: Number(step.width) || 500,
      height: Number(step.height) || 900,
    });
    await page.waitForTimeout(600);
    return;
  }
  if (step.type === 'open-composer-plus-menu') {
    state.latestMenuHtml = await openComposerPlusMenu(page);
    return;
  }
  if (step.type === 'open-composer-more-submenu') {
    state.latestMenuHtml = await openComposerMoreSubmenu(page);
    return;
  }
  if (step.type === 'open-conversation-options-menu') {
    state.latestMenuHtml = await openConversationOptionsMenu(page);
    return;
  }
  if (step.type === 'open-configure-dialog') {
    await openConfigureDialog(page);
    return;
  }
  if (step.type === 'open-configure-listbox') {
    await openConfigureListbox(page);
    return;
  }
  if (step.type === 'open-thinking-effort-listbox') {
    await openThinkingEffortListbox(page);
    return;
  }
  if (step.type === 'select-configure-option') {
    await selectConfigureOption(page, step.optionId);
    return;
  }
  throw new Error(`Unsupported live probe state step: ${step.type}`);
}

async function prepareLiveProbeState(page, stateId, scrapeStateRegistry, fixtureUrl) {
  await resetFixturePage(page, fixtureUrl);
  await closeOpenMenus(page);
  await closeConfigureDialog(page);
  await closeTransientUi(page);
  const definition = scrapeStateRegistry.find((item) => item.stateId === stateId);
  if (!definition) {
    throw new Error(`Could not find scrape state ${stateId} for live probe`);
  }
  const state = {
    currentTurnTestId: null,
    latestMenuHtml: '',
  };
  for (const step of definition.steps || []) {
    await applyProbeStateStep(page, step, state);
  }
  await page.waitForTimeout(300);
}

async function prepareNewConversationProbeState(page, fixtureUrl) {
  await page.goto(CHATGPT_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await waitForFixtureConversationReady(page, 15000, { fixtureUrl: CHATGPT_HOME_URL });
  await closeOpenMenus(page);
  await closeTransientUi(page);
  const blankState = await captureLiveProbeSemanticSnapshot(page, null);
  if (blankState.userMessageCount || blankState.assistantMessageCount || blankState.composerHasText) {
    throw new Error('ChatGPT home did not open a blank audit chat; no existing conversation or draft was changed.');
  }
}

async function setComposerText(page, text) {
  const candidates = page.locator(COMPOSER_TEXTBOX_SELECTORS.join(', '));
  const candidateCount = await candidates.count();
  let composer = null;
  for (let index = 0; index < candidateCount; index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      composer = candidate;
      break;
    }
  }
  if (!composer) throw new Error('Could not find a visible prompt composer.');

  const expectedText = String(text);
  const normalize = (value) => String(value || '').replace(/\r\n?/g, '\n').trim();
  await composer.fill(expectedText, { timeout: 5000 });
  const actualText = await composer.evaluate((element) =>
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.value
      : element.innerText || element.textContent || '',
  );
  if (normalize(actualText) !== normalize(expectedText)) {
    throw new Error('The composer did not retain the requested draft text.');
  }
  await page.waitForTimeout(250);
}

async function waitForEnabledButton(page, selectors, timeout = 10000) {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];
  await page.waitForFunction(
    (candidates) =>
      candidates.some((selector) =>
        Array.from(document.querySelectorAll(selector)).some((button) => {
          if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
          const style = getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.pointerEvents !== 'none' &&
            rect.width > 0 &&
            rect.height > 0
          );
        }),
      ),
    selectorList,
    { timeout },
  );
}

async function clickEnabledButton(page, selectors) {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];
  await waitBeforeBrowserInteraction();
  const clicked = await page.evaluate((candidates) => {
    const isClickable = (button) => {
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.pointerEvents !== 'none' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    for (const selector of candidates) {
      const button = Array.from(document.querySelectorAll(selector)).find(isClickable);
      if (!button) continue;
      button.scrollIntoView({ block: 'center', inline: 'nearest' });
      button.click();
      return true;
    }
    return false;
  }, selectorList);
  if (!clicked) {
    throw new Error(`Could not click enabled button for selectors: ${selectorList.join(', ')}`);
  }
}

async function ensureControlSendStopEnabled(page) {
  await page.evaluate(() => {
    window.enableSendWithControlEnterCheckbox = true;
    window.enableStopWithControlBackspaceCheckbox = true;
  });
}

async function selectThinkingEffortExtendedForProbe(page) {
  await openModelThinkingEffortMenu(page);
  const clicked = await page.evaluate(() => {
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const menus = Array.from(
      document.querySelectorAll('[data-radix-menu-content][data-state="open"][role="menu"]'),
    ).filter(isVisible);
    const items = menus.flatMap((menu) =>
      Array.from(menu.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')).filter(
        isVisible,
      ),
    );
    const extended = items.find((item) => /\bExtended\b/i.test(item.textContent || ''));
    if (!extended) return false;
    extended.click();
    return true;
  });
  await page.waitForTimeout(500);
  await closeOpenMenus(page);
  if (!clicked) {
    throw new Error('Could not select Extended thinking effort from the model picker.');
  }
}

async function prepareComposerDraftMessageProbeState(page, fixtureUrl) {
  await prepareNewConversationProbeState(page, fixtureUrl);
  await ensureControlSendStopEnabled(page);
  await setComposerText(page, SIDE_EFFECT_MESSAGE_TEXT);
  await waitForEnabledButton(page, SEND_BUTTON_SELECTORS);
}

async function prepareInFlightMessageProbeState(page, fixtureUrl) {
  await prepareNewConversationProbeState(page, fixtureUrl);
  await ensureControlSendStopEnabled(page);
  await selectThinkingEffortExtendedForProbe(page).catch(() => {});
  await setComposerText(page, SIDE_EFFECT_MESSAGE_TEXT);
  await clickEnabledButton(page, SEND_BUTTON_SELECTORS);
  await page.waitForTimeout(STOP_AFTER_SEND_DELAY_MS);
  await waitForEnabledButton(
    page,
    ['button[data-testid="stop-button"]', 'button[data-test-id="stop-button"]'],
    15000,
  );
}

async function waitForLatestUserTurn(page) {
  await page.waitForFunction(
    (selectors) => selectors.some((selector) => document.querySelectorAll(selector).length > 0),
    [...USER_MESSAGE_SELECTORS],
    { timeout: 15000 },
  );
}

async function waitForCommittedUserTurn(page, { minimumCount = 1, previousHash = '' } = {}) {
  await page.waitForFunction(
    ({ minimumCount, previousHash, selectors }) => {
      const messages = selectors
        .map((selector) => Array.from(document.querySelectorAll(selector)))
        .find((matches) => matches.length) || [];
      const latestRawText = messages.at(-1)?.textContent || '';
      const latestText = latestRawText.trim();
      const composer = document.querySelector(
        '#prompt-textarea, textarea, [role="textbox"], [contenteditable="true"]',
      );
      const composerText = composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement
        ? composer.value
        : composer?.innerText || composer?.textContent || '';
      const hashText = (value) => {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
          hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
        }
        return `${value.length}:${(hash >>> 0).toString(16)}`;
      };
      return (
        messages.length >= minimumCount &&
        Boolean(latestText) &&
        hashText(latestRawText) !== previousHash &&
        !String(composerText).trim()
      );
    },
    { minimumCount, previousHash, selectors: [...USER_MESSAGE_SELECTORS] },
    { timeout: 20000 },
  );
}

async function waitForAssistantResponseCompletion(
  page,
  { minimumCount = 1, previousCount = 0, previousHash = '' } = {},
) {
  await page.waitForFunction(
    ({ minimumCount, previousCount, previousHash, selectors }) => {
      const assistants = selectors
        .map((selector) => Array.from(document.querySelectorAll(selector)))
        .find((matches) => matches.length) || [];
      const latest = assistants.at(-1);
      const latestRawText = latest?.textContent || '';
      const latestText = latestRawText.trim();
      const hashText = (value) => {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
          hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
        }
        return `${value.length}:${(hash >>> 0).toString(16)}`;
      };
      const stopVisible = Array.from(
        document.querySelectorAll('button[data-testid="stop-button"], button[data-test-id="stop-button"]'),
      ).some((button) => {
        if (!(button instanceof HTMLElement)) return false;
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
      const sendButton = document.querySelector(
        'button[data-testid="send-button"], #composer-submit-button, form:has([role="textbox"]) button[type="submit"]',
      );
      const sendReady = sendButton instanceof HTMLButtonElement && !sendButton.disabled;
      const responseTurn = latest?.closest('[data-content-search-turn-key]');
      const responseCompleteControlVisible = Array.from(
        responseTurn?.querySelectorAll('button[aria-label="Regenerate response"]') || [],
      ).some((button) => {
        if (!(button instanceof HTMLElement)) return false;
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
      const currentHash = latestText ? hashText(latestRawText) : '';
      return (
        assistants.length >= minimumCount &&
        latestText.length > 0 &&
        (assistants.length > previousCount || currentHash !== previousHash) &&
        !stopVisible &&
        (sendReady || responseCompleteControlVisible)
      );
    },
    {
      minimumCount,
      previousCount,
      previousHash,
      selectors: [...ASSISTANT_MESSAGE_SELECTORS],
    },
    { timeout: 60000 },
  );
}

async function createAuditOwnedFixtureConversation(
  page,
  { checkpoint, persistCheckpoint, trackAuditOwnedConversation } = {},
) {
  const prompts = [
    'For the keyboard audit fixture, reply only with a fenced JavaScript code block. Include a single 240-character string on one line so horizontal wrapping can be observed. Do not add prose.',
    'Use the Search the web tool now to find an official OpenAI Help Center article about checking important information in ChatGPT. Reply in one sentence and cite that page so the response visibly includes a web citation.',
  ];
  await page.goto(CHATGPT_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(
    () => {
      const selectors = [
        '#prompt-textarea',
        '[name="prompt-textarea"]',
        'textarea[placeholder]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
      ];
      return (
        location.hostname === 'chatgpt.com' &&
        Boolean(document.querySelector('main')) &&
        selectors.some((selector) =>
          Array.from(document.querySelectorAll(selector)).some((node) => {
            if (!(node instanceof HTMLElement)) return false;
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          }),
        )
      );
    },
    undefined,
    { timeout: 20000 },
  );
  let before = await captureLiveProbeSemanticSnapshot(page, null);
  if (before.userMessageCount || before.assistantMessageCount || before.composerHasText || /\/c\//.test(before.url)) {
    throw new Error('ChatGPT home was not a blank audit chat; no existing conversation or draft was changed.');
  }

  try {
    for (let index = 0; index < prompts.length; index += 1) {
      checkpoint.currentCase = {
        rowId: 'setup:audit-owned-fixture',
        phase: `message-${index + 1}-pending`,
        intendedSideEffect: `send audit fixture message ${index + 1}`,
        sourceConversationId: page.url().match(/\/c\/([^/]+)/)?.[1] || '',
        startedAt: new Date().toISOString(),
        attempt: 1,
      };
      await persistCheckpoint();
      await setComposerText(page, prompts[index]);
      await waitForEnabledButton(page, SEND_BUTTON_SELECTORS);
      checkpoint.currentCase.phase = `message-${index + 1}-dispatch-pending`;
      await persistCheckpoint();
      await clickEnabledButton(page, SEND_BUTTON_SELECTORS);
      await waitForCommittedUserTurn(page, {
        minimumCount: before.userMessageCount + 1,
        previousHash: before.lastUserHash,
      });
      trackAuditOwnedConversation(page.url());
      checkpoint.auditFixtureUrl = page.url();
      checkpoint.currentCase.phase = `message-${index + 1}-response-pending`;
      checkpoint.currentCase.sourceConversationId = page.url().match(/\/c\/([^/]+)/)?.[1] || '';
      await persistCheckpoint();
      try {
        await waitForAssistantResponseCompletion(page, {
          minimumCount: before.assistantMessageCount + 1,
          previousCount: before.assistantMessageCount,
          previousHash: before.lastAssistantHash,
        });
      } catch (error) {
        await clickEnabledButton(page, [
          'button[data-testid="stop-button"]',
          'button[data-test-id="stop-button"]',
        ]).catch(() => {});
        throw error;
      }
      before = await captureLiveProbeSemanticSnapshot(page, null);
    }
    const conversationId = page.url().match(/\/c\/([^/]+)/)?.[1] || '';
    if (!conversationId || before.userMessageCount < 2 || before.assistantMessageCount < 2) {
      throw new Error('The audit-owned fixture did not finish with two committed user turns and two assistant responses.');
    }
    checkpoint.auditFixtureUrl = page.url();
    checkpoint.completedCases.push({
      rowId: 'setup:audit-owned-fixture',
      status: 'pass',
      semanticStatus: 'pass',
      reason: '',
      completedAt: new Date().toISOString(),
    });
    checkpoint.currentCase = null;
    await persistCheckpoint();
    return page.url();
  } catch (error) {
    trackAuditOwnedConversation(page.url());
    checkpoint.auditFixtureUrl = page.url();
    if (checkpoint.currentCase) checkpoint.currentCase.phase = 'fixture-creation-failed';
    checkpoint.fixtureCreationError = error?.message || String(error);
    checkpoint.preflightError = `Audit-owned fixture creation failed: ${error?.message || String(error)}`;
    await persistCheckpoint().catch(() => {});
    throw error;
  }
}

async function prepareSentDisposableMessage(page, fixtureUrl) {
  await prepareNewConversationProbeState(page, fixtureUrl);
  await selectThinkingEffortExtendedForProbe(page).catch(() => {});
  await setComposerText(page, SIDE_EFFECT_MESSAGE_TEXT);
  await clickEnabledButton(page, SEND_BUTTON_SELECTORS);
  await waitForLatestUserTurn(page);
  await page.waitForTimeout(2500);
  await clickEnabledButton(page, [
    'button[data-testid="stop-button"]',
    'button[data-test-id="stop-button"]',
  ]).catch(() => {});
  await page.waitForTimeout(3000);
}

async function prepareActiveEditCardProbeState(page, fixtureUrl) {
  await prepareSentDisposableMessage(page, fixtureUrl);
  const userTurn = await getLatestUserMessageLocator(page);
  await userTurn.scrollIntoViewIfNeeded().catch(() => {});
  const editButton = userTurn.locator('button[aria-label="Edit message"]').first();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await userTurn.hover({ force: true }).catch(() => {});
    await page.waitForTimeout(700);
    if ((await editButton.count().catch(() => 0)) > 0) break;
  }
  if (!((await editButton.count().catch(() => 0)) > 0)) {
    throw new Error('Could not find the user message edit button.');
  }
  await waitBeforeBrowserInteraction();
  await editButton.click({ force: true });
  await page.waitForTimeout(700);
  const editField = page.locator('textarea, [contenteditable="true"]').last();
  if (!((await editField.count().catch(() => 0)) > 0)) {
    throw new Error('Could not find the active edit field.');
  }
  await editField.click({ force: true });
  await editField.fill(SIDE_EFFECT_EDITED_MESSAGE_TEXT).catch(async () => {
    await page.keyboard.press('Control+A');
    await page.keyboard.type(SIDE_EFFECT_EDITED_MESSAGE_TEXT, { delay: 5 });
  });
  await page.waitForTimeout(250);
}

async function prepareSentUserMessageProbeState(page, fixtureUrl) {
  if (page.url() !== fixtureUrl) {
    await waitBeforeBrowserRequest();
    await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
  }
  await waitForFixtureConversationReady(page, 30000, { fixtureUrl });
  await closeTransientUi(page);
  const userTurn = await getLatestUserMessageLocator(page);
  await userTurn.hover({ force: true });
  await page.waitForTimeout(700);
}

async function prepareDictationActiveProbeState(page, fixtureUrl) {
  await prepareNewConversationProbeState(page, fixtureUrl);
  await page.context().grantPermissions(['microphone'], { origin: 'https://chatgpt.com' }).catch(() => {});
  await clickEnabledButton(page, [
    'button[aria-label="Start dictation"]',
    'button:has(svg use[href*="#33d595"])',
    'button:has(svg use[href*="#29f921"])',
  ]);
  await page.waitForTimeout(700);
  await waitForLiveProbeTargetPresence(page, {
    matchGroups: [['#2dc143'], ['#85f94b']],
  });
}

async function setLiveProbeScrollPosition(page, position) {
  await page.evaluate((targetPosition) => {
    const container =
      typeof window.getScrollableContainer === 'function'
        ? window.getScrollableContainer()
        : document.scrollingElement || document.documentElement;
    const getMaxScroll = (node) => {
      if (node === window) {
        const root = document.scrollingElement || document.documentElement;
        return Math.max(0, root.scrollHeight - window.innerHeight);
      }
      return Math.max(0, node.scrollHeight - node.clientHeight);
    };
    const maxScroll = getMaxScroll(container);
    const y =
      targetPosition === 'bottom'
        ? maxScroll
        : targetPosition === 'middle'
          ? Math.round(maxScroll / 2)
          : 0;
    if (container === window) {
      window.scrollTo(0, y);
    } else {
      container.scrollTop = y;
    }
  }, position);
  await page.waitForTimeout(700);
}

async function captureLiveProbeScrollStart(page) {
  await page.evaluate(() => {
    const container =
      typeof window.getScrollableContainer === 'function'
        ? window.getScrollableContainer()
        : document.scrollingElement || document.documentElement;
    const getScrollTop = (node) =>
      node === window ? window.scrollY || document.documentElement.scrollTop || 0 : node.scrollTop;
    const getMaxScroll = (node) => {
      if (node === window) {
        const root = document.scrollingElement || document.documentElement;
        return Math.max(0, root.scrollHeight - window.innerHeight);
      }
      return Math.max(0, node.scrollHeight - node.clientHeight);
    };
    window.__CGCSP_SCROLL_PROBE_START__ = {
      top: getScrollTop(container),
      max: getMaxScroll(container),
    };
  });
}

async function prepareMessageScrollProbeState(page, fixtureUrl) {
  await resetFixturePage(page, fixtureUrl);
  await closeTransientUi(page);
  await setLiveProbeScrollPosition(page, 'middle');
  await captureLiveProbeScrollStart(page);
}

async function isViewportProbeTargetReached(page, target) {
  return page.evaluate((targetId) => {
    const container =
      typeof window.getScrollableContainer === 'function'
        ? window.getScrollableContainer()
        : document.scrollingElement || document.documentElement;
    const getScrollTop = (node) =>
      node === window ? window.scrollY || document.documentElement.scrollTop || 0 : node.scrollTop;
    const getMaxScroll = (node) => {
      if (node === window) {
        const root = document.scrollingElement || document.documentElement;
        return Math.max(0, root.scrollHeight - window.innerHeight);
      }
      return Math.max(0, node.scrollHeight - node.clientHeight);
    };
    if (targetId === 'page-header') {
      const header = document.getElementById('page-header');
      const rect = header?.getBoundingClientRect?.();
      return getScrollTop(container) <= 120 || (rect && rect.bottom > 0 && rect.top < 180);
    }
    if (targetId === 'thread-bottom') {
      const remaining = getMaxScroll(container) - getScrollTop(container);
      const threadBottom = document.getElementById('thread-bottom');
      const rect = threadBottom?.getBoundingClientRect?.();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      return remaining <= 160 || (rect && rect.top < viewportHeight && rect.bottom > 0);
    }
    return false;
  }, target?.targetId || '');
}

async function isDomStateProbeTargetReached(page, target) {
  return page.evaluate(({ targetId, codeboxSelectors }) => {
    const container =
      typeof window.getScrollableContainer === 'function'
        ? window.getScrollableContainer()
        : document.scrollingElement || document.documentElement;
    const getScrollTop = (node) =>
      node === window ? window.scrollY || document.documentElement.scrollTop || 0 : node.scrollTop;
    const start = window.__CGCSP_SCROLL_PROBE_START__ || {};
    const currentTop = getScrollTop(container);
    if (targetId === 'message-scroll-up-delta') {
      return Number.isFinite(start.top) && (start.top - currentTop >= 80 || currentTop <= 40);
    }
    if (targetId === 'message-scroll-down-delta') {
      return (
        Number.isFinite(start.top) &&
        (currentTop - start.top >= 80 ||
          (Number.isFinite(start.max) && start.max - currentTop <= 40))
      );
    }
    if (targetId === 'codebox-wrap-enabled') {
      const codeboxes = Array.from(document.querySelectorAll(codeboxSelectors.join(', ')));
      const allVisibleCodeboxesWrap =
        codeboxes.length > 0 &&
        codeboxes.every((code) => {
          const style = getComputedStyle(code);
          const scrollport =
            code.closest('.cm-editor')?.querySelector('.cm-scroller') ||
            code.closest('pre')?.parentElement ||
            code.parentElement ||
            code;
          const lineBox = code.closest('pre') || code.closest('.cm-content') || code.parentElement || code;
          const lineBoxStyle = getComputedStyle(lineBox);
          const availableWidth =
            lineBox.clientWidth -
            Number.parseFloat(lineBoxStyle.paddingLeft || '0') -
            Number.parseFloat(lineBoxStyle.paddingRight || '0');
          const text = String(code.textContent || '');
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (context) context.font = style.font;
          const longestLineWidth = Math.max(
            0,
            ...(text.split(/\r?\n/).map((line) => (context ? context.measureText(line).width : 0))),
          );
          const range = document.createRange();
          const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
          const lineTops = [];
          let textNode = walker.nextNode();
          while (textNode) {
            range.selectNodeContents(textNode);
            for (const rect of range.getClientRects()) {
              if (rect.width > 0.5 && rect.height > 0.5) lineTops.push(rect.top);
            }
            textNode = walker.nextNode();
          }
          lineTops.sort((left, right) => left - right);
          const lineHeight = Number.parseFloat(style.lineHeight) || 18;
          const visualLineCount = lineTops.reduce((count, top, index) => {
            if (index === 0 || top - lineTops[index - 1] > Math.max(2, lineHeight * 0.35)) {
              return count + 1;
            }
            return count;
          }, 0);
          const hardLineCount = Math.max(
            1,
            1 + (text.match(/\r?\n/g) || []).length,
            code.querySelectorAll('br').length + 1,
          );
          const requiresWrap = availableWidth > 0 && longestLineWidth > availableWidth + 2;
          const hasActualWrap = visualLineCount > hardLineCount;
          return (
            style.whiteSpace === 'pre-wrap' &&
            style.overflowWrap === 'anywhere' &&
            availableWidth > 0 &&
            (!requiresWrap || hasActualWrap) &&
            scrollport.scrollWidth <= scrollport.clientWidth + 2
          );
        });
      return (
        document.documentElement.classList.contains('csp-codebox-wrap-enabled') &&
        allVisibleCodeboxesWrap
      );
    }
    return false;
  }, { targetId: target?.targetId || '', codeboxSelectors: [...CODEBOX_CONTENT_SELECTORS] });
}

async function readClipboardPermissionState(page) {
  return page.evaluate(async () => {
    const stateFor = async (name) => {
      try {
        return (await navigator.permissions.query({ name })).state;
      } catch {
        return 'unsupported';
      }
    };
    return {
      read: await stateFor('clipboard-read'),
      write: await stateFor('clipboard-write'),
    };
  });
}

function fingerprintClipboardPayload(items) {
  return fingerprintAuditValue(
    items.map((item) =>
      item
        .map(({ type, base64 }) => ({ type, base64 }))
        .sort((left, right) => left.type.localeCompare(right.type)),
    ),
  );
}

async function captureClipboardPayload(page) {
  return page.evaluate(async () => {
    if (!navigator.clipboard?.read) throw new Error('Clipboard read API is unavailable.');
    const encode = (buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return btoa(binary);
    };
    const items = await navigator.clipboard.read();
    const payload = [];
    for (const item of items) {
      const types = [];
      for (const type of item.types) {
        const blob = await item.getType(type);
        if (blob.size > 8 * 1024 * 1024) {
          throw new Error(`Clipboard MIME type ${type} exceeds the safe restoration size.`);
        }
        types.push({ type, base64: encode(await blob.arrayBuffer()), size: blob.size });
      }
      payload.push(types);
    }
    return payload;
  });
}

async function clearClipboardForProbe(page, session) {
  if (session.clipboardSnapshot) {
    await page.evaluate(() => navigator.clipboard.writeText(''));
    return;
  }
  const origin = new URL(page.url()).origin;
  const permissionState = await readClipboardPermissionState(page);
  session.clipboardPermissionBefore = permissionState;
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const items = await captureClipboardPayload(page);
  const originalMetadata = await readClipboardMetadata(page);
  session.clipboardSnapshot = { items, originalMetadata };
  session.clipboardMimeTypes = originalMetadata.types;
  await restoreClipboardPayload(page, items);
  const verification = await readClipboardMetadata(page);
  const matches = items.length === 0
    ? verification.plainTextLength === 0
    : verification.payloadFingerprint === fingerprintClipboardPayload(items);
  if (!matches) {
    session.clipboardRestoreStatus = 'snapshot-verification-failed';
    throw new Error('Clipboard snapshot could not be re-written and verified; no clipboard probe was started.');
  }
  session.clipboardRestoreStatus = 'captured-and-verified';
  await page.evaluate(() => navigator.clipboard.writeText(''));
}

async function restoreClipboardPayload(page, items) {
  await page.evaluate(async (clipboardItems) => {
    if (!clipboardItems.length) {
      await navigator.clipboard.writeText('');
      return;
    }
    const decode = (base64) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    };
    const restoredItems = clipboardItems.map((item) => {
      const data = {};
      for (const entry of item) {
        data[entry.type] = new Blob([decode(entry.base64)], { type: entry.type });
      }
      return new ClipboardItem(data);
    });
    await navigator.clipboard.write(restoredItems);
  }, items);
}

async function readClipboardMetadata(page) {
  return page.evaluate(async () => {
    const hashText = (value) => {
      const text = String(value || '');
      let hash = 2166136261;
      for (let index = 0; index < text.length; index += 1) {
        hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
      }
      return `${text.length}:${(hash >>> 0).toString(16)}`;
    };
    const encode = (buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return btoa(binary);
    };
    const items = await navigator.clipboard.read();
    const payload = [];
    for (const item of items) {
      const typesForItem = [];
      for (const type of item.types) {
        const blob = await item.getType(type);
        typesForItem.push({ type, base64: encode(await blob.arrayBuffer()) });
      }
      payload.push(typesForItem);
    }
    const types = items.flatMap((item) => item.types);
    const plainText = await navigator.clipboard.readText().catch(() => '');
    const canonical = payload.map((item) =>
      item.sort((left, right) => left.type.localeCompare(right.type)),
    );
    const payloadFingerprint = hashText(JSON.stringify(canonical));
    return {
      types: [...new Set(types)].sort(),
      itemCount: items.length,
      plainTextLength: plainText.length,
      plainTextHash: hashText(plainText),
      payloadFingerprint,
    };
  });
}

async function restoreClipboardAfterProbe(page, session) {
  if (!session.clipboardSnapshot) {
    if (!session.clipboardPermissionBefore) return { status: 'not-needed' };
  }
  const origin = new URL(page.url()).origin;
  try {
    let contentRestored = true;
    let mimeTypesRestored = true;
    if (session.clipboardSnapshot) {
      await restoreClipboardPayload(page, session.clipboardSnapshot.items);
      const finalMetadata = await readClipboardMetadata(page);
      const items = session.clipboardSnapshot.items;
      contentRestored = items.length === 0
        ? finalMetadata.plainTextLength === 0
        : finalMetadata.payloadFingerprint === fingerprintClipboardPayload(items);
      mimeTypesRestored = JSON.stringify(finalMetadata.types) ===
        JSON.stringify(session.clipboardSnapshot.originalMetadata.types);
    }

    await page.context().clearPermissions();
    const originallyGranted = [];
    if (session.clipboardPermissionBefore?.read === 'granted') {
      originallyGranted.push('clipboard-read');
    }
    if (session.clipboardPermissionBefore?.write === 'granted') {
      originallyGranted.push('clipboard-write');
    }
    if (originallyGranted.length) {
      await page.context().grantPermissions(originallyGranted, { origin });
    }
    const permissionAfter = await readClipboardPermissionState(page);
    session.clipboardPermissionAfter = permissionAfter;
    const permissionsRestored =
      JSON.stringify(permissionAfter) === JSON.stringify(session.clipboardPermissionBefore);
    session.clipboardRestoreStatus = contentRestored && mimeTypesRestored && permissionsRestored
      ? 'clean'
      : 'partial';
    return {
      status: session.clipboardRestoreStatus,
      contentRestored,
      mimeTypesRestored,
      permissionsRestored,
      mimeTypes: session.clipboardMimeTypes,
      permissionBefore: session.clipboardPermissionBefore,
      permissionAfter,
      error: session.clipboardRestoreError,
    };
  } catch (error) {
    session.clipboardRestoreError = error?.message || String(error);
    session.clipboardRestoreStatus = 'failed';
    return {
      status: 'failed',
      contentRestored: false,
      mimeTypesRestored: false,
      permissionsRestored: false,
      mimeTypes: session.clipboardMimeTypes,
      permissionBefore: session.clipboardPermissionBefore,
      permissionAfter: session.clipboardPermissionAfter,
      error: session.clipboardRestoreError,
    };
  }
}

async function prepareClipboardSingleMessageProbeState(page, scrapeStateRegistry, fixtureUrl, session) {
  await prepareLiveProbeState(
    page,
    'assistant-turn-non-web-buttons-exposed',
    scrapeStateRegistry,
    fixtureUrl,
  );
  await clearClipboardForProbe(page, session);
}

async function prepareClipboardEntireConversationProbeState(page, fixtureUrl, session) {
  await resetFixturePage(page, fixtureUrl);
  await closeTransientUi(page);
  await clearClipboardForProbe(page, session);
}

function createCodeboxProbeSession() {
  return {
    initialized: false,
    sentPromptKeys: new Set(),
    clipboardSnapshot: null,
    clipboardRestoreStatus: 'not-needed',
    clipboardPermissionBefore: null,
    clipboardPermissionAfter: null,
    clipboardMimeTypes: [],
    clipboardRestoreError: '',
  };
}

async function countAssistantCodeBlocks(page) {
  return page.evaluate(({ selectors, containerSelector }) => {
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    return Array.from(document.querySelectorAll(selectors.join(', '))).filter((node) => {
      return (
        Boolean(node.closest?.(containerSelector)) &&
        Boolean(String(node.textContent || '').trim()) &&
        isVisible(node instanceof HTMLElement ? node : node.parentElement)
      );
    }).length;
  }, {
    selectors: [...CODEBOX_CONTENT_SELECTORS],
    containerSelector: CODEBOX_VALIDATION_CONTAINER_SELECTOR,
  });
}

async function waitForAssistantCodeBlockCount(page, minimumCount, timeout = CODEBOX_RESPONSE_TIMEOUT_MS) {
  await page.waitForFunction(
    ({ expectedCount, selectors, containerSelector }) => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      return (
        Array.from(document.querySelectorAll(selectors.join(', '))).filter((node) => {
          return (
            Boolean(node.closest?.(containerSelector)) &&
            Boolean(String(node.textContent || '').trim()) &&
            isVisible(node instanceof HTMLElement ? node : node.parentElement)
          );
        }).length >= expectedCount
      );
    },
    {
      expectedCount: minimumCount,
      selectors: [...CODEBOX_CONTENT_SELECTORS],
      containerSelector: CODEBOX_VALIDATION_CONTAINER_SELECTOR,
    },
    { timeout },
  );
}

async function waitForCodeboxResponseIdle(page, timeout = CODEBOX_RESPONSE_TIMEOUT_MS) {
  await page.waitForFunction(
    () => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const visibleStopButtons = Array.from(
        document.querySelectorAll('button[data-testid="stop-button"], button[data-test-id="stop-button"]'),
      ).filter(isVisible);
      const visibleComposers = Array.from(
        document.querySelectorAll(
          [
            '#prompt-textarea',
            '[name="prompt-textarea"]',
            'textarea[placeholder]',
            'div[contenteditable="true"][role="textbox"]',
            'div[contenteditable="true"]',
            '[role="textbox"]',
          ].join(', '),
        ),
      ).filter(isVisible);
      const assistantMessages = Array.from(document.querySelectorAll(
        '[data-message-author-role="assistant"], [data-chatgpt-selection-message-id][data-chatgpt-selection-conversation-id]',
      ));
      const latestAssistant = assistantMessages.at(-1);
      const assistantTurn = latestAssistant?.closest('[data-content-search-turn-key]');
      const completionAction = Array.from(
        assistantTurn?.querySelectorAll('button[aria-label="Regenerate response"]') || [],
      ).some(isVisible);
      const sendButton = document.querySelector(
        'button[data-testid="send-button"], #composer-submit-button, form:has([role="textbox"]) button[type="submit"]',
      );
      const sendReady = sendButton instanceof HTMLButtonElement && !sendButton.disabled;
      return (
        visibleStopButtons.length === 0 &&
        visibleComposers.length > 0 &&
        (!latestAssistant || completionAction || sendReady)
      );
    },
    undefined,
    { timeout },
  );
}

async function prepareCodeboxProbeConversation(page, fixtureUrl, session) {
  if (session.initialized) return;
  await prepareNewConversationProbeState(page, fixtureUrl);
  await closeOpenMenus(page);
  await closeTransientUi(page);
  session.initialized = true;
}

async function sendCodeboxPromptAndWaitForBlocks(page, promptText, expectedMinimumCount) {
  await waitForCodeboxResponseIdle(page);
  const beforeCount = await countAssistantCodeBlocks(page);
  await setComposerText(page, promptText);
  await waitForEnabledButton(page, SEND_BUTTON_SELECTORS, 15000);
  await clickEnabledButton(page, SEND_BUTTON_SELECTORS);
  await page.waitForTimeout(CODEBOX_RESPONSE_MIN_WAIT_MS);
  await waitForAssistantCodeBlockCount(page, Math.max(expectedMinimumCount, beforeCount + 1));
  await waitForCodeboxResponseIdle(page);
}

async function ensureCodeboxPromptSent(page, fixtureUrl, session, promptKey, promptText) {
  await prepareCodeboxProbeConversation(page, fixtureUrl, session);
  if (session.sentPromptKeys.has(promptKey)) return;
  const expectedMinimumCount = session.sentPromptKeys.size + 1;
  await sendCodeboxPromptAndWaitForBlocks(page, promptText, expectedMinimumCount);
  session.sentPromptKeys.add(promptKey);
}

async function prepareClipboardCodeBlocksProbeState(page, fixtureUrl, session) {
  await ensureCodeboxPromptSent(page, fixtureUrl, session, 'wrap-story', CODEBOX_WRAP_PROMPT_TEXT);
  await ensureCodeboxPromptSent(page, fixtureUrl, session, 'copy-story', CODEBOX_COPY_PROMPT_TEXT);
  await waitForAssistantCodeBlockCount(page, 2);
  await clearClipboardForProbe(page, session);
}

async function prepareCodeboxWrapProbeState(page, fixtureUrl, session) {
  await ensureCodeboxPromptSent(page, fixtureUrl, session, 'wrap-story', CODEBOX_WRAP_PROMPT_TEXT);
  await waitForAssistantCodeBlockCount(page, 1);
}

async function clipboardProbeHasText(page, shortcut) {
  const codeBlockCount =
    shortcut.actionId === COPY_ALL_CODE_BLOCKS_ACTION_ID ? await countAssistantCodeBlocks(page) : 0;
  return page.evaluate(async ({ actionId, codeBlockCount }) => {
    const hashText = (value) => {
      const text = String(value || '');
      let hash = 2166136261;
      for (let index = 0; index < text.length; index += 1) {
        hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
      }
      return `${text.length}:${(hash >>> 0).toString(16)}`;
    };
    const items = await navigator.clipboard.read();
    const types = [...new Set(items.flatMap((item) => item.types))].sort();
    const text = await navigator.clipboard.readText().catch(() => '');
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    let matches = normalized.length >= 20;
    if (actionId === 'shortcutKeyCopyAllCodeBlocks') {
      matches =
        codeBlockCount >= 2 &&
        normalized.length >= 40 &&
        normalized.includes('--- --- ---') &&
        !/no code boxes found/i.test(normalized);
    } else if (actionId === 'selectThenCopyAllMessages') {
      matches = normalized.length >= 80;
    }
    if (actionId === 'shortcutKeyCopyLowest') {
      matches = matches && types.length === 1 && types[0] === 'text/plain';
    }
    return {
      matches,
      types,
      hasHtml: types.includes('text/html'),
      plainTextLength: text.length,
      plainTextHash: hashText(text),
    };
  }, { actionId: shortcut.actionId, codeBlockCount });
}

function orderLiveProbeShortcuts(shortcuts) {
  const ordered = [...shortcuts];
  const temporaryChatIndex = ordered.findIndex(
    (shortcut) => shortcut.actionId === TEMPORARY_CHAT_ACTION_ID,
  );
  if (temporaryChatIndex !== -1) {
    const [temporaryChatShortcut] = ordered.splice(temporaryChatIndex, 1);
    const newConversationIndex = ordered.findIndex(
      (shortcut) => shortcut.actionId === NEW_CONVERSATION_ACTION_ID,
    );
    if (newConversationIndex === -1) {
      ordered.splice(temporaryChatIndex, 0, temporaryChatShortcut);
    } else {
      ordered.splice(newConversationIndex + 1, 0, temporaryChatShortcut);
    }
  }
  const codeboxWrapIndex = ordered.findIndex(
    (shortcut) => shortcut.actionId === TOGGLE_CODEBOX_WRAP_ACTION_ID,
  );
  const copyCodeBlocksIndex = ordered.findIndex(
    (shortcut) => shortcut.actionId === COPY_ALL_CODE_BLOCKS_ACTION_ID,
  );
  if (codeboxWrapIndex !== -1 && copyCodeBlocksIndex !== -1 && copyCodeBlocksIndex < codeboxWrapIndex) {
    const [codeboxWrapShortcut] = ordered.splice(codeboxWrapIndex, 1);
    const insertionIndex = ordered.findIndex(
      (shortcut) => shortcut.actionId === COPY_ALL_CODE_BLOCKS_ACTION_ID,
    );
    ordered.splice(insertionIndex, 0, codeboxWrapShortcut);
  }
  return ordered;
}

function shouldPreservePreparedProbeState(shortcut) {
  const stateRefs = [
    ...(Array.isArray(shortcut.activationProbeUiStateRefs)
      ? shortcut.activationProbeUiStateRefs
      : []),
    ...(Array.isArray(shortcut.requiredUiStateRefs) ? shortcut.requiredUiStateRefs : []),
  ];
  return stateRefs.some((stateRef) => String(stateRef).includes('buttons-exposed'));
}

function isResponseNavigationShortcut(shortcut) {
  return (
    shortcut?.actionId === PREVIOUS_THREAD_ACTION_ID || shortcut?.actionId === NEXT_THREAD_ACTION_ID
  );
}

function isResponseNavigationProbeSetup(shortcut) {
  return String(shortcut?.activationProbeSetup || '').startsWith('response-navigation-before-');
}

function isModelEffortShortcut(shortcut) {
  return MODEL_EFFORT_ACTION_IDS.includes(shortcut?.actionId);
}

function isModelPhaseShortcut(shortcut) {
  if (!shortcut) return false;
  if (isModelEffortShortcut(shortcut)) return true;
  if (
    [
      'shortcutKeyToggleModelSelector',
      'shortcutKeyToggleChatWork',
      'shortcutKeyThinkingExtended',
      'shortcutKeyThinkingStandard',
      'shortcutKeyThinkingLight',
      'shortcutKeyThinkingHeavy',
      'shortcutKeyProStandard',
      'shortcutKeyProExtended',
    ].includes(shortcut.actionId)
  ) {
    return true;
  }
  return (shortcut.targetIds || []).some((targetId) =>
    String(targetId).startsWith('model-'),
  );
}

function getOppositeResponseNavigationActionId(actionId) {
  return actionId === NEXT_THREAD_ACTION_ID ? PREVIOUS_THREAD_ACTION_ID : NEXT_THREAD_ACTION_ID;
}

function getResponseNavigationAriaLabel(target) {
  if (target?.targetId === PREVIOUS_THREAD_ACTION_ID || target?.targetId === 'previous-response-button') {
    return 'Previous response';
  }
  if (target?.targetId === NEXT_THREAD_ACTION_ID || target?.targetId === 'next-response-button') {
    return 'Next response';
  }
  return '';
}

function getResponseNavigationAriaLabelForAction(actionId) {
  return actionId === PREVIOUS_THREAD_ACTION_ID ? 'Previous response' : 'Next response';
}

async function waitForEnabledResponseNavigationTarget(page, target) {
  const ariaLabel = getResponseNavigationAriaLabel(target);
  if (!ariaLabel) return;
  await page.waitForFunction(
    (label) =>
      Array.from(document.querySelectorAll(`button[aria-label="${label}"]`)).some((button) => {
        return button instanceof HTMLButtonElement && !button.disabled;
      }),
    ariaLabel,
    { timeout: 7000 },
  );
}

async function clickEnabledResponseNavigationTarget(page, ariaLabel) {
  await waitBeforeBrowserInteraction();
  return page.evaluate((label) => {
    const isVisible = (button) => {
      if (!(button instanceof HTMLButtonElement)) return false;
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return (
        !button.disabled &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.pointerEvents !== 'none' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const buttons = Array.from(document.querySelectorAll(`button[aria-label="${label}"]`)).filter(
      (button) => button instanceof HTMLButtonElement && !button.disabled,
    );
    if (!buttons.length) return false;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const visibleButtons = buttons.filter(isVisible);
    const inViewport = visibleButtons.filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= viewportHeight;
    });
    const target = inViewport[0] || visibleButtons[0] || buttons[0];
    target.scrollIntoView({ block: 'center', inline: 'nearest' });
    const wrapper = target.closest('[class*="group-hover"]');
    wrapper?.classList?.add('force-hover');
    ['pointerover', 'pointerenter', 'mouseover'].forEach((eventType) => {
      wrapper?.dispatchEvent?.(new MouseEvent(eventType, { bubbles: true }));
    });
    target.click();
    return true;
  }, ariaLabel);
}

async function clickResponseNavigationTargetRepeated(page, ariaLabel, attempts) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await clickEnabledResponseNavigationTarget(page, ariaLabel);
    await page.waitForTimeout(RESPONSE_NAVIGATION_STEP_SETTLE_MS);
  }
}

async function dispatchLiveShortcutRepeated(page, shortcut, code, attempts, settleMs) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await dispatchShortcutForAction(page, shortcut, code);
    await page.waitForTimeout(settleMs);
  }
}

async function prepareResponseNavigationProbeState(
  page,
  shortcut,
  target,
  scrapeStateRegistry,
  fixtureUrl,
) {
  const probeStateId = shortcut.activationProbeUiStateRefs?.[0] || shortcut.requiredUiStateRefs?.[0];
  await prepareLiveProbeState(page, probeStateId, scrapeStateRegistry, fixtureUrl);
  const oppositeActionId = getOppositeResponseNavigationActionId(shortcut.actionId);
  const oppositeAriaLabel = getResponseNavigationAriaLabelForAction(oppositeActionId);
  await clickResponseNavigationTargetRepeated(page, oppositeAriaLabel, RESPONSE_NAVIGATION_ATTEMPTS);
  await waitForEnabledResponseNavigationTarget(page, target);
}

async function prepareGptConversationProbeState(page, fixtureUrl) {
  await waitBeforeBrowserRequest();
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await closeOpenMenus(page);
  await closeTransientUi(page);
  await page.waitForFunction(
    () => Boolean(document.querySelector('#page-header') || document.querySelector('main')),
    undefined,
    { timeout: 15000 },
  );
}

async function installLiveProbeObserver(page, options = {}) {
  await page.evaluate(({ preventDefault }) => {
    window.__CGCSP_LIVE_SHORTCUT_PROBE__?.cleanup?.();
    const state = {
      clicks: [],
      submits: [],
      keydowns: [],
      startedAt: Date.now(),
    };
    const describeNode = (node) => {
      const element = node instanceof Element ? node : node?.parentElement;
      if (!element) {
        return {
          selector: '',
          textSnippet: '',
          html: '',
        };
      }
      const path = [];
      let current = element;
      for (let depth = 0; current && depth < 6; depth += 1) {
        const tag = current.tagName ? current.tagName.toLowerCase() : '';
        const parts = [tag];
        const testId = current.getAttribute?.('data-testid');
        const id = current.getAttribute?.('id');
        const ariaLabel = current.getAttribute?.('aria-label');
        const role = current.getAttribute?.('role');
        if (testId) parts.push(`[data-testid="${testId}"]`);
        if (id) parts.push(`#${id}`);
        if (ariaLabel) parts.push(`[aria-label="${ariaLabel}"]`);
        if (role) parts.push(`[role="${role}"]`);
        path.push(parts.join(''));
        current = current.parentElement;
      }
      const htmlChain = [];
      current = element;
      for (let depth = 0; current && depth < 5; depth += 1) {
        htmlChain.push(current.outerHTML || '');
        current = current.parentElement;
      }
      return {
        selector: path.join(' < '),
        textSnippet: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
        html: htmlChain.join('\n'),
      };
    };
    const onClick = (event) => {
      state.clicks.push(describeNode(event.target));
      if (preventDefault) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const onSubmit = (event) => {
      state.submits.push(describeNode(event.target));
      if (preventDefault) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const onKeydown = (event) => {
      const observed = {
        key: event.key,
        code: event.code,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altGraph: event.getModifierState?.('AltGraph') || false,
        isComposing: event.isComposing,
        isTrusted: event.isTrusted,
        defaultPrevented: event.defaultPrevented,
      };
      state.keydowns.push(observed);
      queueMicrotask(() => {
        observed.defaultPrevented = event.defaultPrevented;
      });
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    // Extension key handlers are installed before this audit observer. A
    // bubbling listener therefore sees whether the real key path claimed the
    // event without intercepting or changing its default behavior.
    document.addEventListener('keydown', onKeydown, true);
    window.__CGCSP_LIVE_SHORTCUT_PROBE__ = {
      state,
      describeNode,
      cleanup() {
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('submit', onSubmit, true);
        document.removeEventListener('keydown', onKeydown, true);
      },
    };
  }, {
    preventDefault: options.preventDefault !== false,
  });
}

async function readLiveProbeObserver(page) {
  return page.evaluate(() => {
    const probe = window.__CGCSP_LIVE_SHORTCUT_PROBE__;
    const activeElement = probe?.describeNode?.(document.activeElement) || {
      selector: '',
      textSnippet: '',
      html: '',
    };
    return {
      clicks: probe?.state?.clicks || [],
      submits: probe?.state?.submits || [],
      keydowns: probe?.state?.keydowns || [],
      activeElement,
    };
  });
}

async function cleanupLiveProbeObserver(page) {
  await page.evaluate(() => {
    window.__CGCSP_LIVE_SHORTCUT_PROBE__?.cleanup?.();
    delete window.__CGCSP_LIVE_SHORTCUT_PROBE__;
  }).catch(() => {});
}

function getTargetNeedleGroups(target) {
  const matchGroups = Array.isArray(target?.matchGroups) ? target.matchGroups : [];
  const normalizedGroups = matchGroups
    .map((group) => (Array.isArray(group) ? group : []))
    .map((group) => group.map((needle) => String(needle || '')).filter(Boolean))
    .filter((group) => group.length > 0);
  if (normalizedGroups.length) return normalizedGroups;
  return target?.identifier ? [[String(target.identifier)]] : [];
}

async function captureLiveProbeSemanticSnapshot(page, target) {
  return page.evaluate(({
    targetGroups,
    userMessageSelectors,
    assistantMessageSelectors,
    codeboxContentSelectors,
  }) => {
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.pointerEvents !== 'none' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const matchesTarget = (node) => {
      const html = String(node?.outerHTML || '');
      return targetGroups.some((group) => group.every((needle) => html.includes(needle)));
    };
    const targetNodes = Array.from(
      document.querySelectorAll(
        'button, a, [role], [data-testid], [id], [aria-controls], [name], input, [contenteditable="true"]',
      ),
    ).filter((node) => matchesTarget(node));
    const visibleTargetNodes = targetNodes.filter(isVisible);
    const visibleDialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))
      .filter(isVisible)
      .map((node) =>
        [
          node.id,
          node.getAttribute('data-testid'),
          node.getAttribute('aria-label'),
          node.getAttribute('aria-modal'),
        ]
          .filter(Boolean)
          .join('|'),
      );
    const root = document.scrollingElement || document.documentElement;
    const container =
      typeof window.getScrollableContainer === 'function'
        ? window.getScrollableContainer()
        : root;
    const scrollTop =
      container === window
        ? window.scrollY || root.scrollTop || 0
        : Number(container?.scrollTop || 0);
    const scrollMax =
      container === window
        ? Math.max(0, root.scrollHeight - window.innerHeight)
        : Math.max(0, Number(container?.scrollHeight || 0) - Number(container?.clientHeight || 0));
    const activeElement = document.activeElement;
    const activeTarget = matchesTarget(activeElement);
    const composer = document.querySelector(
      '#prompt-textarea, [name="prompt-textarea"], [data-testid="composer-input"], [contenteditable="true"][role="textbox"]',
    );
    const composerText =
      composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement
        ? composer.value
        : composer?.innerText || composer?.textContent || '';
    const hashText = (value) => {
      const text = String(value || '');
      let hash = 2166136261;
      for (let index = 0; index < text.length; index += 1) {
        hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
      }
      return `${text.length}:${(hash >>> 0).toString(16)}`;
    };
    const findMessageNodes = (selectors) => {
      for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        if (nodes.length) return nodes;
      }
      return [];
    };
    const userMessageNodes = findMessageNodes(userMessageSelectors);
    const assistantMessageNodes = findMessageNodes(assistantMessageSelectors);
    const messages = [
      ...userMessageNodes.map((node) => ({ node, role: 'user' })),
      ...assistantMessageNodes.map((node) => ({ node, role: 'assistant' })),
    ]
      .sort((left, right) => {
        if (left.node === right.node) return 0;
        return left.node.compareDocumentPosition(right.node) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1;
      })
      .map(({ node, role }) => ({
        role,
        id:
          node.getAttribute('data-message-id') ||
          node.id ||
          node.getAttribute('data-chatgpt-selection-message-id') ||
          node.closest('[data-chatgpt-search-message-ids]')
            ?.getAttribute('data-chatgpt-search-message-ids')
            ?.split(/\s+/)[0] ||
          '',
        contentHash: hashText(node.textContent),
      }));
    const userMessages = messages.filter((message) => message.role === 'user');
    const assistantMessages = messages.filter((message) => message.role === 'assistant');
    const targetControls = visibleTargetNodes.map((node) => ({
      key:
        node.id ||
        node.getAttribute('data-testid') ||
        node.getAttribute('aria-controls') ||
        node.getAttribute('aria-label') ||
        node.getAttribute('name') ||
        '',
      pressed: node.getAttribute('aria-pressed'),
      checked: node.getAttribute('aria-checked') ?? (node.checked ? 'true' : null),
      expanded: node.getAttribute('aria-expanded'),
      selected: node.getAttribute('aria-selected'),
    }));
    const targetTextHashes = visibleTargetNodes.map((node) => ({
      key:
        node.id ||
        node.getAttribute('data-testid') ||
        node.getAttribute('aria-label') ||
        node.getAttribute('name') ||
        '',
      hash: hashText(node.innerText || node.textContent || ''),
    }));
    const controls = Array.from(
      document.querySelectorAll('[aria-pressed], [aria-checked], [aria-expanded], [aria-selected], input[type="checkbox"], input[type="radio"]'),
    )
      .filter(isVisible)
      .map((node) => ({
        key:
          node.id ||
          node.getAttribute('data-testid') ||
          node.getAttribute('aria-controls') ||
          node.getAttribute('aria-label') ||
          node.getAttribute('name') ||
          '',
        pressed: node.getAttribute('aria-pressed'),
        checked: node.getAttribute('aria-checked') ?? (node.checked ? 'true' : null),
        expanded: node.getAttribute('aria-expanded'),
        selected: node.getAttribute('aria-selected'),
      }))
      .filter((control) => control.key);
    const audioElements = Array.from(document.querySelectorAll('audio, video'));
    const header = document.getElementById('page-header');
    const bottom = document.getElementById('thread-bottom');
    const codeboxNodes = Array.from(
      document.querySelectorAll(codeboxContentSelectors.join(', ')),
    ).filter(isVisible);
    const codeboxWrapMetrics = codeboxNodes.map((code) => {
      const style = getComputedStyle(code);
      const pre = code.closest('pre');
      const lineBox = pre || code.closest('.cm-content') || code.parentElement || code;
      const lineBoxStyle = getComputedStyle(lineBox);
      const scrollport =
        code.closest('.cm-editor')?.querySelector('.cm-scroller') ||
        pre?.parentElement ||
        code.parentElement ||
        code;
      const availableWidth =
        lineBox.clientWidth -
        Number.parseFloat(lineBoxStyle.paddingLeft || '0') -
        Number.parseFloat(lineBoxStyle.paddingRight || '0');
      const logicalLines = [''];
      const appendLogicalText = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const parts = String(node.textContent || '').split(/\r?\n/);
          logicalLines[logicalLines.length - 1] += parts[0];
          for (const part of parts.slice(1)) logicalLines.push(part);
          return;
        }
        if (node instanceof HTMLBRElement) {
          logicalLines.push('');
          return;
        }
        node.childNodes.forEach(appendLogicalText);
      };
      appendLogicalText(code);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context) context.font = style.font;
      const longestLineWidth = Math.max(
        0,
        ...logicalLines.map((line) => (context ? context.measureText(line).width : 0)),
      );
      const range = document.createRange();
      const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      const lineTops = [];
      let textNode = walker.nextNode();
      while (textNode) {
        range.selectNodeContents(textNode);
        for (const rect of range.getClientRects()) {
          if (rect.width > 0.5 && rect.height > 0.5) lineTops.push(rect.top);
        }
        textNode = walker.nextNode();
      }
      lineTops.sort((left, right) => left - right);
      const lineHeight = Number.parseFloat(style.lineHeight) || 18;
      const visualLineCount = lineTops.reduce((count, top, index) => {
        if (index === 0 || top - lineTops[index - 1] > Math.max(2, lineHeight * 0.35)) {
          return count + 1;
        }
        return count;
      }, 0);
      const hardLineCount = Math.max(1, logicalLines.length);
      const requiresWrap = availableWidth > 0 && longestLineWidth > availableWidth + 2;
      const hasActualWrap = visualLineCount > hardLineCount;
      return {
        whiteSpace: style.whiteSpace,
        overflowWrap: style.overflowWrap,
        codeDisplay: style.display,
        codeClientWidth: code.clientWidth,
        codeScrollWidth: code.scrollWidth,
        lineBoxClientWidth: lineBox.clientWidth,
        availableWidth,
        longestLineWidth,
        hardLineCount,
        visualLineCount,
        wrappedLineCount: Math.max(0, visualLineCount - hardLineCount),
        requiresWrap,
        hasActualWrap,
        scrollportClientWidth: scrollport.clientWidth,
        scrollportScrollWidth: scrollport.scrollWidth,
      };
    });
    const codeboxWrappedCount = codeboxWrapMetrics.filter(
      (metric) =>
        metric.whiteSpace === 'pre-wrap' &&
        metric.overflowWrap === 'anywhere' &&
        metric.availableWidth > 0 &&
        (!metric.requiresWrap || metric.hasActualWrap) &&
        metric.scrollportScrollWidth <= metric.scrollportClientWidth + 2,
    ).length;
    return {
      url: location.href,
      title: document.title,
      hasComposer: Boolean(composer && isVisible(composer)),
      composerFocused: Boolean(composer && (activeElement === composer || composer.contains(activeElement))),
      activeTarget,
      visibleTarget: visibleTargetNodes.length > 0,
      visibleTargetCount: visibleTargetNodes.length,
      targetControls,
      targetTextHashes,
      visibleDialogCount: visibleDialogs.length,
      visibleDialogs,
      controls,
      messageCount: messages.length,
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      lastUserHash: userMessages.at(-1)?.contentHash || '',
      lastAssistantHash: assistantMessages.at(-1)?.contentHash || '',
      messageIds: messages.map((message) => message.id).filter(Boolean),
      composerHasText: Boolean(String(composerText).trim()),
      composerTextHash: hashText(composerText),
      editableUserMessageCount: document.querySelectorAll(
        [
          '[data-message-author-role="user"] [contenteditable="true"]',
          '[data-message-author-role="user"] textarea',
          '[data-user-message-bubble="true"] [contenteditable="true"]',
          '[data-user-message-bubble="true"] textarea',
          '[data-chatgpt-search-unit-key$=":user"] [contenteditable="true"]',
          '[data-chatgpt-search-unit-key$=":user"] textarea',
        ].join(', '),
      ).length,
      codeboxWrapEnabled: document.documentElement.classList.contains('csp-codebox-wrap-enabled'),
      codeboxCount: codeboxNodes.length,
      codeboxWrappedCount,
      codeboxHorizontalOverflowCount: codeboxWrapMetrics.filter(
        (metric) => metric.scrollportScrollWidth > metric.scrollportClientWidth + 2,
      ).length,
      codeboxWrapRequiredCount: codeboxWrapMetrics.filter((metric) => metric.requiresWrap).length,
      codeboxActuallyWrappedCount: codeboxWrapMetrics.filter((metric) => metric.hasActualWrap).length,
      codeboxWrapSatisfied: codeboxNodes.length > 0 && codeboxWrappedCount === codeboxNodes.length,
      codeboxWrapMetrics,
      filePickerInputs: Array.from(document.querySelectorAll('input[type="file"]')).filter(isVisible).length,
      audioPlaying: audioElements.some((element) => !element.paused),
      scrollTop,
      scrollMax,
      headerVisible: Boolean(header && isVisible(header)),
      bottomVisible: Boolean(bottom && isVisible(bottom)),
    };
  }, {
    targetGroups: getTargetNeedleGroups(target),
    userMessageSelectors: [...USER_MESSAGE_SELECTORS],
    assistantMessageSelectors: [...ASSISTANT_MESSAGE_SELECTORS],
    codeboxContentSelectors: [...CODEBOX_CONTENT_SELECTORS],
  });
}

export function buildCodeboxWrapPersistenceProof(
  storedBeforeReload,
  storedAfterReload,
  reloadedSnapshot,
) {
  const codeboxWrapMetrics = Array.isArray(reloadedSnapshot?.codeboxWrapMetrics)
    ? reloadedSnapshot.codeboxWrapMetrics
    : [];
  const requiredWrapMetrics = codeboxWrapMetrics.filter((metric) => metric?.requiresWrap === true);
  const actuallyWrappedCount = requiredWrapMetrics.filter((metric) => metric.hasActualWrap === true).length;
  const wrapClassRestored = reloadedSnapshot?.codeboxWrapEnabled === true;
  const horizontalOverflowCount = Number.isFinite(reloadedSnapshot?.codeboxHorizontalOverflowCount)
    ? reloadedSnapshot.codeboxHorizontalOverflowCount
    : null;
  const actualWrapRestored =
    wrapClassRestored &&
    requiredWrapMetrics.length > 0 &&
    actuallyWrappedCount === requiredWrapMetrics.length &&
    requiredWrapMetrics.every(
      (metric) =>
        metric.whiteSpace === 'pre-wrap' &&
        metric.overflowWrap === 'anywhere' &&
        Number.isFinite(metric.scrollportClientWidth) &&
        Number.isFinite(metric.scrollportScrollWidth) &&
        metric.scrollportScrollWidth <= metric.scrollportClientWidth + 2,
    ) &&
    horizontalOverflowCount === 0;
  const storedEnabledBeforeReload = storedBeforeReload?.codeboxWrapEnabled === true;
  const storedEnabledAfterReload = storedAfterReload?.codeboxWrapEnabled === true;
  const persisted = storedEnabledBeforeReload && storedEnabledAfterReload && actualWrapRestored;

  return {
    status: persisted ? 'pass' : 'fail',
    proofMethod: 'chrome.storage.sync read plus audit-owned page reload and rendered line geometry',
    storedEnabledBeforeReload,
    storedEnabledAfterReload,
    wrapClassRestored,
    codeboxCount: reloadedSnapshot?.codeboxCount ?? 0,
    codeboxWrappedCount: reloadedSnapshot?.codeboxWrappedCount ?? 0,
    codeboxWrapSatisfied: reloadedSnapshot?.codeboxWrapSatisfied === true,
    actualWrapRestored,
    requiredWrapCount: requiredWrapMetrics.length,
    actuallyWrappedCount,
    horizontalOverflowCount,
    codeboxWrapMetrics,
    reason: persisted
      ? ''
      : 'The saved codebox-wrap preference did not restore actual wrapping after page reload.',
  };
}

function evaluateLiveProbeSemantic(
  shortcut,
  target,
  before,
  after,
  clipboardEvidence = null,
  fileChooserObserved = false,
) {
  const proof = {
    status: 'not-run',
    proofMethod: 'none',
    expected: shortcut.activationProbeExpectedTargetRef || shortcut.notes || 'Declared shortcut behavior.',
    observed: '',
    reason: 'No action-specific semantic postcondition is registered for this shortcut yet.',
  };
  if (!before || !after) return proof;
  const conversationId = (url) => String(url || '').match(/\/c\/([^/]+)/)?.[1] || '';
  const clipboardMatched = clipboardEvidence === true || clipboardEvidence?.matches === true;
  const targetStateChanged = JSON.stringify(before.targetControls) !== JSON.stringify(after.targetControls);
  const generalControlStateChanged = JSON.stringify(before.controls) !== JSON.stringify(after.controls);
  const responseChanged =
    before.lastAssistantHash !== after.lastAssistantHash ||
    after.assistantMessageCount > before.assistantMessageCount;

  if (shortcut.activationProbeMode === 'focus-target') {
    proof.proofMethod = 'active-element-state';
    proof.status = after.activeTarget ? 'pass' : 'fail';
    proof.observed = after.activeTarget ? 'The expected target owns keyboard focus.' : 'The expected target did not gain keyboard focus.';
    proof.reason = proof.status === 'pass' ? '' : 'Keyboard focus did not reach the expected target.';
  } else if (shortcut.activationProbeMode === 'opens-target') {
    if (shortcut.actionId === NEW_CONVERSATION_ACTION_ID) {
      const newBlankConversation =
        before.url !== after.url && after.hasComposer && after.messageCount === 0;
      proof.proofMethod = 'conversation-identity-and-blank-state';
      proof.status = newBlankConversation ? 'pass' : 'fail';
      proof.observed = `URL changed=${before.url !== after.url}; blank composer=${after.hasComposer && after.messageCount === 0}`;
      proof.reason = proof.status === 'pass' ? '' : 'A new blank conversation was not opened.';
    } else {
      proof.proofMethod = 'visible-ui-state';
      const appeared = after.visibleTarget && !before.visibleTarget;
      const dialogOpened = after.visibleDialogCount > before.visibleDialogCount;
      proof.status = appeared || dialogOpened ? 'pass' : 'fail';
      proof.observed = `visibleTarget ${before.visibleTarget} -> ${after.visibleTarget}; dialogs ${before.visibleDialogCount} -> ${after.visibleDialogCount}`;
      proof.reason = proof.status === 'pass' ? '' : 'The expected UI boundary did not newly become visible.';
    }
  } else if (shortcut.activationProbeMode === 'viewport-target') {
    proof.proofMethod = 'scroll-position-and-boundary';
    const moved = Math.abs(after.scrollTop - before.scrollTop) >= 40;
    const reachedTop = target?.targetId === 'page-header' && after.scrollTop <= 120;
    const reachedBottom =
      target?.targetId === 'thread-bottom' && after.scrollMax - after.scrollTop <= 160;
    proof.status = moved && (reachedTop || reachedBottom) ? 'pass' : 'fail';
    proof.observed = `scrollTop ${before.scrollTop} -> ${after.scrollTop}; target boundary reached=${reachedTop || reachedBottom}`;
    proof.reason = proof.status === 'pass' ? '' : 'Scroll position did not move to the expected viewport boundary.';
  } else if (shortcut.activationProbeMode === 'dom-state') {
    proof.proofMethod = 'dom-postcondition';
    if (target?.targetId === 'codebox-wrap-enabled') {
      const wrapped =
        after.codeboxCount > 0 &&
        after.codeboxWrappedCount === after.codeboxCount &&
        after.codeboxHorizontalOverflowCount === 0;
      proof.status = after.codeboxWrapEnabled && !before.codeboxWrapEnabled && wrapped ? 'pass' : 'fail';
      proof.observed = `wrap class ${before.codeboxWrapEnabled} -> ${after.codeboxWrapEnabled}; style/overflow pass=${after.codeboxWrappedCount}/${after.codeboxCount}; lines wrapped=${after.codeboxActuallyWrappedCount}/${after.codeboxWrapRequiredCount} codeboxes requiring it; overflowing codeboxes=${after.codeboxHorizontalOverflowCount}`;
      proof.reason = proof.status === 'pass' ? '' : 'The shortcut did not wrap overlong rendered code lines and remove horizontal overflow.';
    } else if (target?.targetId === 'message-scroll-up-delta' || target?.targetId === 'message-scroll-down-delta') {
      const difference = after.scrollTop - before.scrollTop;
      const movedInExpectedDirection =
        target.targetId === 'message-scroll-up-delta' ? difference < -40 : difference > 40;
      proof.status = movedInExpectedDirection ? 'pass' : 'fail';
      proof.observed = `scrollTop ${before.scrollTop} -> ${after.scrollTop}`;
      proof.reason = proof.status === 'pass' ? '' : 'Message scrolling did not move in the expected direction.';
    }
  } else if (shortcut.activationProbeMode === 'clipboard-text') {
    proof.proofMethod = 'clipboard-content';
    proof.status = clipboardMatched ? 'pass' : 'fail';
    proof.observed = `Clipboard content check passed=${clipboardMatched}; types=${(clipboardEvidence?.types || []).join(',')}; HTML present=${Boolean(clipboardEvidence?.hasHtml)}; plain-text length=${clipboardEvidence?.plainTextLength ?? 0}; hash=${clipboardEvidence?.plainTextHash || ''}`;
    proof.reason = proof.status === 'pass' ? '' : 'Clipboard content did not satisfy the action-specific check.';
  } else if (shortcut.activationProbeMode === 'click-target' || shortcut.activationProbeMode === 'direct-menu-target') {
    proof.proofMethod = 'action-specific-postcondition';
    let matched = false;
    switch (shortcut.actionId) {
      case 'shortcutKeyToggleSidebar':
        matched = targetStateChanged && after.targetControls.length > 0;
        proof.observed = `sidebar control state changed=${matched}`;
        proof.reason = matched ? '' : 'Sidebar expanded/collapsed state did not change.';
        break;
      case 'shortcutKeyShare':
        matched = after.visibleDialogCount > before.visibleDialogCount;
        proof.observed = `visible dialogs ${before.visibleDialogCount} -> ${after.visibleDialogCount}`;
        proof.reason = matched ? '' : 'The share dialog did not open.';
        break;
      case 'shortcutKeyNewGptConversation':
        matched = before.url !== after.url && after.hasComposer;
        proof.observed = `URL changed=${before.url !== after.url}; composer=${after.hasComposer}`;
        proof.reason = matched ? '' : 'A new custom GPT conversation did not open.';
        break;
      case 'shortcutKeyClickSendButton':
        matched = after.userMessageCount > before.userMessageCount && !after.composerHasText && responseChanged;
        proof.observed = `user messages ${before.userMessageCount} -> ${after.userMessageCount}; assistant response changed=${responseChanged}; draft remains=${after.composerHasText}`;
        proof.reason = matched ? '' : 'The draft was not committed and followed by a changed assistant response.';
        break;
      case 'shortcutKeyClickStopButton':
        matched = before.visibleTarget && !after.visibleTarget;
        proof.observed = `stop control visible ${before.visibleTarget} -> ${after.visibleTarget}`;
        proof.reason = matched ? '' : 'The active generation stop control did not disappear.';
        break;
      case 'shortcutKeyEdit':
        matched = after.editableUserMessageCount > before.editableUserMessageCount;
        proof.observed = `editable user messages ${before.editableUserMessageCount} -> ${after.editableUserMessageCount}`;
        proof.reason = matched ? '' : 'The selected user message did not enter edit mode.';
        break;
      case 'shortcutKeySendEdit':
        matched =
          after.userMessageCount === before.userMessageCount &&
          after.lastUserHash !== before.lastUserHash &&
          !after.composerHasText &&
          responseChanged;
        proof.observed = `user-message hash changed=${after.lastUserHash !== before.lastUserHash}; assistant response changed=${responseChanged}; draft remains=${after.composerHasText}`;
        proof.reason = matched ? '' : 'The edited user message was not committed and followed by a changed assistant response.';
        break;
      case 'shortcutKeyMoreDotsBranchInNewChat':
        matched =
          Boolean(conversationId(before.url)) &&
          Boolean(conversationId(after.url)) &&
          conversationId(before.url) !== conversationId(after.url) &&
          before.messageCount === after.messageCount &&
          before.lastUserHash === after.lastUserHash &&
          before.lastAssistantHash === after.lastAssistantHash;
        proof.observed = `conversation identity changed=${conversationId(before.url) !== conversationId(after.url)}; message count/context hashes preserved=${before.messageCount === after.messageCount && before.lastUserHash === after.lastUserHash && before.lastAssistantHash === after.lastAssistantHash}`;
        proof.reason = matched ? '' : 'Branch did not create a new conversation with the same audit-message context.';
        break;
      case 'shortcutKeyTemporaryChat':
        matched = targetStateChanged || generalControlStateChanged;
        proof.observed = `temporary-chat control state changed=${matched}`;
        proof.reason = matched ? '' : 'Temporary Chat did not change its selected state.';
        break;
      case 'shortcutKeyToggleDictate':
        matched =
          targetStateChanged ||
          (before.visibleTarget && !after.visibleTarget) ||
          after.visibleDialogCount > before.visibleDialogCount;
        proof.observed = `dictation UI state changed=${matched}; target visible ${before.visibleTarget} -> ${after.visibleTarget}`;
        proof.reason = matched ? '' : 'Dictation did not enter an observable active state.';
        break;
      case 'shortcutKeyCancelDictation':
        matched = before.visibleTarget && !after.visibleTarget;
        proof.observed = `cancel control visible ${before.visibleTarget} -> ${after.visibleTarget}`;
        proof.reason = matched ? '' : 'Dictation did not leave its active state.';
        break;
      case 'shortcutKeyMoreDotsReadAloud':
        matched = !before.audioPlaying && after.audioPlaying;
        proof.observed = `audio playing ${before.audioPlaying} -> ${after.audioPlaying}`;
        proof.reason = matched ? '' : 'Read Aloud did not start audio playback.';
        break;
      case 'shortcutKeyRegenerateTryAgain':
      case 'shortcutKeyRegenerateWithDifferentModel':
        matched = responseChanged;
        proof.observed = `assistant messages ${before.assistantMessageCount} -> ${after.assistantMessageCount}; response hash changed=${before.lastAssistantHash !== after.lastAssistantHash}`;
        proof.reason = matched ? '' : 'Regeneration did not produce a new assistant response.';
        break;
      case PREVIOUS_THREAD_ACTION_ID:
      case NEXT_THREAD_ACTION_ID:
        matched =
          before.url === after.url &&
          before.assistantMessageCount === after.assistantMessageCount &&
          before.lastAssistantHash !== after.lastAssistantHash;
        proof.proofMethod = 'response-variant-preview-hash';
        proof.observed = `conversation identity preserved=${before.url === after.url}; response count preserved=${before.assistantMessageCount === after.assistantMessageCount}; displayed response variant changed=${before.lastAssistantHash !== after.lastAssistantHash}`;
        proof.reason = matched ? '' : 'The Ctrl+Alt response preview did not switch the displayed response variant.';
        break;
      case 'shortcutKeyCopyLowest':
        matched = clipboardMatched;
        proof.proofMethod = 'clipboard-content';
        proof.observed = `plain-text-only copy passed=${matched}; types=${(clipboardEvidence?.types || []).join(',')}; HTML present=${Boolean(clipboardEvidence?.hasHtml)}; plain-text length=${clipboardEvidence?.plainTextLength ?? 0}; hash=${clipboardEvidence?.plainTextHash || ''}`;
        proof.reason = matched ? '' : 'Alt+C did not place a qualifying plain-text-only response on the clipboard.';
        break;
      case 'shortcutKeySearchWeb':
      case 'shortcutKeyCreateImage':
      case 'shortcutKeyDeepResearch':
        matched = targetStateChanged || generalControlStateChanged;
        proof.observed = `tool selection/control state changed=${matched}`;
        proof.reason = matched ? '' : 'The composer tool did not enter a selected state.';
        break;
      case 'shortcutKeyAddPhotosFiles':
        matched =
          fileChooserObserved &&
          before.composerTextHash === after.composerTextHash &&
          before.messageCount === after.messageCount;
        proof.proofMethod = 'canceled-file-chooser-boundary';
        proof.observed = `native file chooser observed and canceled=${fileChooserObserved}; conversation state unchanged=${before.composerTextHash === after.composerTextHash && before.messageCount === after.messageCount}`;
        proof.reason = matched ? '' : 'The file chooser boundary was not observed and canceled without uploading a file.';
        break;
      default:
        proof.reason = 'No action-specific semantic postcondition is registered for this click-target action yet.';
        return proof;
    }
    proof.status = matched ? 'pass' : 'fail';
  }
  return proof;
}

async function waitForLiveProbeTargetPresence(page, target) {
  const needleGroups = getTargetNeedleGroups(target);
  if (!needleGroups.length) return;
  await page.waitForFunction(
    (groups) => {
      const html = document.documentElement?.outerHTML || '';
      return groups.some((group) => group.every((needle) => html.includes(needle)));
    },
    needleGroups,
    { timeout: 5000 },
  );
}

async function clickLiveProbeTarget(page, target) {
  const needleGroups = getTargetNeedleGroups(target);
  await waitBeforeBrowserInteraction();
  const clicked = await page.evaluate((groups) => {
    const matchesNeedles = (html) =>
      groups.some((group) => group.every((needle) => String(html || '').includes(String(needle))));
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.pointerEvents !== 'none' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const candidates = Array.from(
      document.querySelectorAll(
        'div.__menu-item[tabindex], [role="menuitem"], [role="menuitemradio"], button, a',
      ),
    ).filter(isVisible);
    const targetNode =
      candidates.find((node) => matchesNeedles(node.outerHTML)) ||
      candidates.find((node) => {
        const match = Array.from(node.querySelectorAll('svg,path,use')).find((child) =>
          matchesNeedles(child.outerHTML),
        );
        return Boolean(match);
      });
    targetNode?.click?.();
    return Boolean(targetNode);
  }, needleGroups);
  if (!clicked) {
    throw new Error(`Could not click live probe target ${target?.targetId || target?.identifier || ''}.`);
  }
}

function keyForShortcutCode(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return code.slice(6);
  const keysByCode = {
    Backquote: '`',
    Backslash: '\\',
    BracketLeft: '[',
    BracketRight: ']',
    Comma: ',',
    Equal: '=',
    Minus: '-',
    Period: '.',
    Quote: "'",
    Semicolon: ';',
    Slash: '/',
    Space: ' ',
  };
  return keysByCode[code] || code;
}

function normalizeShortcutCode(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, '')
    .trim();
}

function resolveShortcutDispatchCode(shortcut, activeShortcutCodes = {}) {
  return (
    normalizeShortcutCode(activeShortcutCodes[shortcut.actionId]) ||
    normalizeShortcutCode(shortcut.defaultCode)
  );
}

const TEMPORARY_LIVE_PROBE_KEY_POOL = Object.freeze([
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'Backquote',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Slash',
  'Quote',
  'Minus',
  'Equal',
  'Digit8',
  'Digit9',
  'Digit0',
]);

function buildTemporaryShortcutAssignments(shortcuts, activeShortcutCodes = {}) {
  const usedCodes = new Set();
  for (const shortcut of shortcuts) {
    const activeCode = normalizeShortcutCode(activeShortcutCodes[shortcut.actionId]);
    const defaultCode = normalizeShortcutCode(shortcut.defaultCode);
    if (activeCode) usedCodes.add(activeCode);
    if (defaultCode) usedCodes.add(defaultCode);
  }

  const assignments = {};
  let poolIndex = 0;
  for (const shortcut of shortcuts) {
    const activeCode = normalizeShortcutCode(activeShortcutCodes[shortcut.actionId]);
    const defaultCode = normalizeShortcutCode(shortcut.defaultCode);
    if (activeCode) continue;
    if (defaultCode) {
      assignments[shortcut.actionId] = defaultCode;
      usedCodes.add(defaultCode);
      continue;
    }
    while (
      poolIndex < TEMPORARY_LIVE_PROBE_KEY_POOL.length &&
      usedCodes.has(TEMPORARY_LIVE_PROBE_KEY_POOL[poolIndex])
    ) {
      poolIndex += 1;
    }
    const code = TEMPORARY_LIVE_PROBE_KEY_POOL[poolIndex];
    if (!code) break;
    assignments[shortcut.actionId] = code;
    usedCodes.add(code);
    poolIndex += 1;
  }
  return assignments;
}

async function recoverTemporaryShortcutAssignments({
  context,
  extensionId,
  originalActiveShortcutCodes,
  temporaryShortcutAssignments,
  mutationLedger = null,
  onRecoveryUpdate = null,
} = {}) {
  const auditKeys = Array.isArray(mutationLedger) && mutationLedger.length
    ? mutationLedger.map((entry) => entry.key)
    : Object.keys(temporaryShortcutAssignments || {});
  if (!auditKeys.length) {
    return buildStorageRecoveryReport({
      status: 'not-needed',
      reason: 'No validation-only shortcut assignments were written.',
    });
  }
  const ledger = Array.isArray(mutationLedger)
    ? mutationLedger
    : createStorageMutationLedger(originalActiveShortcutCodes || {}, temporaryShortcutAssignments);
  let plan = null;
  try {
    await onRecoveryUpdate?.({ stage: 'observing-before-restore', ledger });
    const observedBeforeRestore = await readExtensionSyncStorage(
      context,
      extensionId,
      auditKeys,
    );
    plan = buildStorageRecoveryPlan(ledger, observedBeforeRestore);
    await onRecoveryUpdate?.({ stage: 'restore-planned', ledger, plan });
    if (Object.keys(plan.setValues).length > 0) {
      await onRecoveryUpdate?.({ stage: 'restoring-set-values', ledger, plan });
      await mutateExtensionSyncStorage(context, extensionId, {
        op: 'set',
        payload: plan.setValues,
      });
    }
    if (plan.removeKeys.length > 0) {
      await onRecoveryUpdate?.({ stage: 'restoring-remove-keys', ledger, plan });
      await mutateExtensionSyncStorage(context, extensionId, {
        op: 'remove',
        payload: plan.removeKeys,
      });
    }
    const finalStorage = await readExtensionSyncStorage(context, extensionId, auditKeys);
    const finalized = finalizeStorageRecoveryPlan(plan, finalStorage);
    const report = buildStorageRecoveryReport({
      status: finalized.status,
      reason:
        finalized.status === 'conflict'
          ? `Concurrent edits were preserved for: ${finalized.conflictKeys.join(', ')}.`
          : '',
      plan: finalized,
    });
    await onRecoveryUpdate?.({ stage: 'restore-verified', ledger, plan: finalized, report });
    return report;
  } catch (error) {
    const fallbackPlan = plan || {
      entries: ledger,
      conflictCount: 0,
      failedCount: 1,
    };
    const report = buildStorageRecoveryReport({
      status: 'failed',
      reason: error?.message || String(error) || 'Storage recovery failed.',
      plan: fallbackPlan,
    });
    try {
      await onRecoveryUpdate?.({ stage: 'restore-failed', ledger, plan: fallbackPlan, report });
    } catch {}
    return report;
  }
}

async function writeAuditStorageSetting({
  context,
  extensionId,
  key,
  value,
  originalStorage,
  mutationLedger,
  checkpoint,
  persistCheckpoint,
  intentType = 'fixed-contract-setting',
}) {
  let entry = mutationLedger.find((candidate) => candidate.key === key);
  if (!entry) {
    [entry] = createStorageMutationLedger(originalStorage, { [key]: value });
    mutationLedger.push(entry);
  }
  entry.auditValues = [
    ...new Set([...(entry.auditValues || [entry.auditValue]), value]),
  ];
  entry.auditPresent = true;
  entry.auditValue = value;
  entry.restoreAction = 'pending';
  entry.status = 'pending';
  checkpoint.mutationLedger = mutationLedger;
  checkpoint.mutationIntent = {
    type: intentType,
    status: 'write-pending',
    keys: [key],
    valueFingerprint: fingerprintAuditValue(value),
  };
  await persistCheckpoint();
  await mutateExtensionSyncStorage(context, extensionId, {
    op: 'set',
    payload: { [key]: value },
  });
  checkpoint.mutationOccurred = true;
  checkpoint.mutationIntent.status = 'applied';
  await persistCheckpoint();
  const observed = await readExtensionSyncStorage(context, extensionId, [key]);
  if (JSON.stringify(observed[key]) !== JSON.stringify(value)) {
    const observedDescription = Object.hasOwn(observed, key)
      ? JSON.stringify(observed[key])
      : 'missing';
    throw new Error(
      `Could not verify temporary ${key}=${String(value)} setting; storage read returned ${observedDescription}.`,
    );
  }
}

async function dispatchLiveShortcut(page, code) {
  try {
    await waitBeforeBrowserInteraction();
    await page.keyboard.down('Alt');
    await page.waitForTimeout(MIN_BROWSER_INTERACTION_SPACING_MS);
    await page.keyboard.press(code, { delay: 120 });
    await page.waitForTimeout(MIN_BROWSER_INTERACTION_SPACING_MS);
    await page.keyboard.up('Alt');
    return;
  } catch {
    await page.keyboard.up('Alt').catch(() => {});
  }

  await page.waitForTimeout(MIN_BROWSER_INTERACTION_SPACING_MS);
  await page.evaluate(({ shortcutCode, shortcutKey }) => {
    const eventInit = {
      key: shortcutKey,
      code: shortcutCode,
      altKey: true,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
  }, {
    shortcutCode: code,
    shortcutKey: keyForShortcutCode(code),
  });
}

async function dispatchControlShortcut(page, code) {
  try {
    await waitBeforeBrowserInteraction();
    await page.keyboard.down('Control');
    await page.waitForTimeout(MIN_BROWSER_INTERACTION_SPACING_MS);
    await page.keyboard.press(code, { delay: 120 });
    await page.waitForTimeout(MIN_BROWSER_INTERACTION_SPACING_MS);
    await page.keyboard.up('Control');
    return;
  } catch {
    await page.keyboard.up('Control').catch(() => {});
  }

  await page.waitForTimeout(MIN_BROWSER_INTERACTION_SPACING_MS);
  await page.evaluate(({ shortcutCode, shortcutKey }) => {
    const eventInit = {
      key: shortcutKey,
      code: shortcutCode,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
  }, {
    shortcutCode: code,
    shortcutKey: keyForShortcutCode(code),
  });
}

async function dispatchAltControlShortcut(page, code) {
  try {
    await waitBeforeBrowserInteraction();
    await page.keyboard.down('Control');
    await page.waitForTimeout(MIN_BROWSER_INTERACTION_SPACING_MS);
    await page.keyboard.down('Alt');
    await page.waitForTimeout(MIN_BROWSER_INTERACTION_SPACING_MS);
    await page.keyboard.press(code, { delay: 120 });
    await page.waitForTimeout(MIN_BROWSER_INTERACTION_SPACING_MS);
    await page.keyboard.up('Alt');
    await page.keyboard.up('Control');
    return;
  } catch {
    await page.keyboard.up('Alt').catch(() => {});
    await page.keyboard.up('Control').catch(() => {});
  }

  await page.waitForTimeout(MIN_BROWSER_INTERACTION_SPACING_MS);
  await page.evaluate(({ shortcutCode, shortcutKey }) => {
    const eventInit = {
      key: shortcutKey,
      code: shortcutCode,
      altKey: true,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
  }, {
    shortcutCode: code,
    shortcutKey: keyForShortcutCode(code),
  });
}

async function dispatchShortcutForAction(page, shortcut, code) {
  if (isResponseNavigationShortcut(shortcut)) {
    await dispatchAltControlShortcut(page, code);
    return;
  }
  if (CONTROL_SHORTCUT_ACTION_IDS.includes(shortcut?.actionId)) {
    await ensureControlSendStopEnabled(page);
    await dispatchControlShortcut(page, code);
    return;
  }
  await dispatchLiveShortcut(page, code);
}

async function dispatchObservedKeyboardChord(page, code, modifiers = []) {
  const modifierKeys = {
    Control: 'Control',
    Alt: 'Alt',
    Shift: 'Shift',
    Meta: 'Meta',
    AltGraph: 'AltGraph',
  };
  const pressed = [];
  try {
    await waitBeforeBrowserInteraction();
    for (const modifier of modifiers) {
      const key = modifierKeys[modifier];
      if (!key) throw new Error(`Unsupported keyboard modifier ${modifier}.`);
      await page.keyboard.down(key);
      pressed.push(key);
      await page.waitForTimeout(MIN_BROWSER_INTERACTION_SPACING_MS);
    }
    await page.keyboard.press(code, { delay: 80 });
    await page.waitForTimeout(MIN_BROWSER_INTERACTION_SPACING_MS);
    return { status: 'dispatched', proofMethod: 'playwright-keyboard' };
  } catch (error) {
    return {
      status: 'unsupported',
      proofMethod: 'none',
      reason: error?.message || String(error),
    };
  } finally {
    for (const key of pressed.reverse()) {
      await page.keyboard.up(key).catch(() => {});
    }
  }
}

function buildFixedContractLiveRow(contract, semantic, details = {}) {
  const status = semantic?.status || 'not-run';
  return {
    contractId: contract.contractId,
    classification: contract.classification,
    status,
    modifiers: details.modifiers || '',
    reason: semantic?.reason || '',
    targetProof: details.targetProof || {
      status: 'not-applicable',
      expectedTargetRef: '',
      observedTargetRef: '',
      proofMethod: 'not-applicable',
    },
    routingProof: details.routingProof || {
      status: 'not-run',
      proofMethod: 'none',
      observedTargetRef: '',
    },
    semantic,
    evidence: details.evidence || null,
  };
}

function linkedFixedContractRow(contract, globalRow, modifiers = '') {
  const semantic = globalRow?.semantic
    ? { ...globalRow.semantic }
    : {
        status: 'not-run',
        proofMethod: 'none',
        expected: contract.classification,
        observed: '',
        reason: `No linked live global probe was collected for ${contract.contractId}.`,
      };
  return buildFixedContractLiveRow(contract, semantic, {
    modifiers,
    targetProof: globalRow?.targetProof,
    routingProof: globalRow?.routingProof,
    evidence: {
      linkedActionId: globalRow?.actionId || '',
      linkedActionStatus: globalRow?.status || 'not-run',
    },
  });
}

function fixedSemantic(status, proofMethod, expected, observed, reason = '') {
  return { status, proofMethod, expected, observed, reason };
}

async function observeFixedChord(page, code, modifiers, target, settleMs = 500) {
  await installLiveProbeObserver(page, { preventDefault: false });
  try {
    const before = await captureLiveProbeSemanticSnapshot(page, target);
    const dispatch = await dispatchObservedKeyboardChord(page, code, modifiers);
    if (dispatch.status === 'dispatched') await page.waitForTimeout(settleMs);
    const after = await captureLiveProbeSemanticSnapshot(page, target);
    const observer = await readLiveProbeObserver(page);
    return {
      before,
      after,
      dispatch,
      observer,
      keydown: observer.keydowns?.at(-1) || null,
    };
  } finally {
    await cleanupLiveProbeObserver(page);
  }
}

async function runFixedShortcutContractProbes({
  page,
  context,
  inventory,
  contracts,
  targetById,
  globalRows,
  fixtureUrl,
  activeShortcutCodes,
  extensionId,
  originalActiveShortcutCodes,
  mutationLedger,
  checkpoint,
  persistCheckpoint,
  trackAuditOwnedConversation,
  fixedContractIds = [],
} = {}) {
  const contractById = new Map((contracts || []).map((contract) => [contract.contractId, contract]));
  const requested = new Set(fixedContractIds || []);
  const shouldRun = (contractId) => !requested.size || requested.has(contractId);
  const rows = [];
  const globalById = new Map((globalRows || []).map((row) => [row.actionId, row]));
  const finishCase = async (contractId, action) => {
    if (!shouldRun(contractId)) return null;
    const contract = contractById.get(contractId);
    if (!contract) return null;
    checkpoint.currentCase = {
      rowId: `fixed:${contractId}`,
      contractId,
      phase: 'setup-pending',
      intendedSideEffect: action.name || contractId,
      sourceConversationId: page.url().match(/\/c\/([^/]+)/)?.[1] || '',
      startedAt: new Date().toISOString(),
      attempt: 1,
    };
    await persistCheckpoint();
    let row;
    try {
      row = await action(contract);
    } catch (error) {
      row = buildFixedContractLiveRow(
        contract,
        fixedSemantic(
          'coverage-gap',
          'probe-error',
          contract.classification,
          '',
          error?.message || String(error) || 'Fixed-contract probe failed before semantic evaluation.',
        ),
      );
    }
    row.contractId = contractId;
    row.status = row.semantic?.status || row.status || 'coverage-gap';
    checkpoint.completedCases.push({
      rowId: `fixed:${contractId}`,
      contractId,
      status: row.status,
      semanticStatus: row.semantic?.status || 'not-run',
      reason: row.reason || row.semantic?.reason || '',
      completedAt: new Date().toISOString(),
    });
    checkpoint.currentCase = null;
    rows.push(row);
    await persistCheckpoint().catch(() => {});
    return row;
  };

  await finishCase('runtime-shortcut-dispatch', async (contract) =>
    linkedFixedContractRow(
      contract,
      globalById.get('shortcutKeyActivateInput'),
      'Alt + assigned input-focus key',
    ),
  );
  await finishCase('shortcut-overlay-opener', async (contract) =>
    linkedFixedContractRow(
      contract,
      globalById.get('shortcutKeyShowOverlay'),
      'Alt + configured overlay key',
    ),
  );
  await finishCase('response-navigation-preview', async (contract) => {
    const previous = globalById.get(PREVIOUS_THREAD_ACTION_ID);
    const next = globalById.get(NEXT_THREAD_ACTION_ID);
    const passed = previous?.semantic?.status === 'pass' && next?.semantic?.status === 'pass';
    const limited = [previous, next].some((row) => row?.status === 'environment-fail');
    return buildFixedContractLiveRow(
      contract,
      fixedSemantic(
        passed ? 'pass' : limited ? 'environment-fail' : 'coverage-gap',
        'ctrl-alt-response-variant-preview',
        'Ctrl+Alt previous/next changes the displayed response variant without changing the conversation or response count.',
        `previous=${previous?.semantic?.observed || 'not run'}; next=${next?.semantic?.observed || 'not run'}`,
        passed ? '' : 'Both live Ctrl+Alt preview directions must change the displayed response variant.',
      ),
      {
        modifiers: 'Ctrl+Alt + assigned previous/next key',
        routingProof: {
          status: passed ? 'observed' : 'not-observed',
          proofMethod: 'keyboard-event-path',
          observedTargetRef: passed ? 'previous-response-button;next-response-button' : '',
        },
        evidence: { linkedActionIds: [PREVIOUS_THREAD_ACTION_ID, NEXT_THREAD_ACTION_ID] },
      },
    );
  });

  const pageScrollTarget = targetById['thread-bottom'];
  let pageScrollMatrix = null;
  const getPageScrollMatrix = async () => {
    if (pageScrollMatrix) return pageScrollMatrix;
    if (!extensionId) throw new Error('Extension sync storage was unavailable for the PageUp/PageDown gate matrix.');
    const cases = [];
    for (const enabled of [false, true]) {
      await writeAuditStorageSetting({
        context,
        extensionId,
        key: 'pageUpDownTakeover',
        value: enabled,
        originalStorage: originalActiveShortcutCodes,
        mutationLedger,
        checkpoint,
        persistCheckpoint,
      });
      for (const code of ['PageDown', 'PageUp']) {
        await resetFixturePage(page, fixtureUrl);
        await closeTransientUi(page);
        await setLiveProbeScrollPosition(page, 'middle');
        const before = await captureLiveProbeSemanticSnapshot(page, pageScrollTarget);
        if (before.scrollMax < 120) {
          throw new Error('The authenticated fixture does not have enough scroll range for PageUp/PageDown behavior proof.');
        }
        const observed = await observeFixedChord(page, code, [], pageScrollTarget, 700);
        const delta = observed.after.scrollTop - observed.before.scrollTop;
        const movedInDirection = code === 'PageDown' ? delta > 40 : delta < -40;
        const keydownMatchesGate =
          observed.keydown?.code === code &&
          observed.keydown?.isTrusted === true &&
          observed.keydown?.defaultPrevented === enabled;
        cases.push({
          enabled,
          code,
          delta,
          defaultPrevented: observed.keydown?.defaultPrevented ?? null,
          isTrusted: observed.keydown?.isTrusted ?? false,
          passed: observed.dispatch.status === 'dispatched' && movedInDirection && keydownMatchesGate,
        });
      }
    }
    pageScrollMatrix = cases;
    return cases;
  };
  await finishCase('page-up-down-takeover', async (contract) => {
    let cases;
    try {
      cases = await getPageScrollMatrix();
    } catch (error) {
      return buildFixedContractLiveRow(
        contract,
        fixedSemantic('coverage-gap', 'keyboard-scroll-state', 'PageUp/PageDown moves the viewport when takeover is enabled.', '', error?.message || String(error)),
      );
    }
    const enabledCases = cases.filter((item) => item.enabled);
    const passed = enabledCases.length === 2 && enabledCases.every((item) => item.passed);
    return buildFixedContractLiveRow(
      contract,
      fixedSemantic(
        passed ? 'pass' : 'coverage-gap',
        'keyboard-scroll-and-default-prevention',
        'Enabled PageUp and PageDown both move the page in the expected direction and claim the native key event.',
        JSON.stringify(enabledCases),
        passed ? '' : 'Enabled PageUp/PageDown did not both move in the expected direction and prevent the native default.',
      ),
      {
        modifiers: 'PageUp / PageDown without modifiers',
        routingProof: { status: passed ? 'observed' : 'not-observed', proofMethod: 'trusted-keydown-and-scroll-delta' },
        evidence: { cases: enabledCases },
      },
    );
  });
  await finishCase('page-up-down-enable-gate', async (contract) => {
    let cases;
    try {
      cases = await getPageScrollMatrix();
    } catch (error) {
      return buildFixedContractLiveRow(
        contract,
        fixedSemantic('coverage-gap', 'keyboard-scroll-state', 'Disabled takeover preserves native PageUp/PageDown behavior.', '', error?.message || String(error)),
      );
    }
    const passed = cases.length === 4 && cases.every((item) => item.passed);
    return buildFixedContractLiveRow(
      contract,
      fixedSemantic(
        passed ? 'pass' : 'coverage-gap',
        'enabled-disabled-trusted-keydown-matrix',
        'Enabled PageUp/PageDown are claimed; disabled PageUp/PageDown pass through to native scrolling.',
        JSON.stringify(cases),
        passed ? '' : 'One or more enabled/disabled PageUp/PageDown key cases failed or could not be observed.',
      ),
      {
        modifiers: 'PageUp / PageDown enabled and disabled',
        routingProof: { status: passed ? 'observed' : 'not-observed', proofMethod: 'trusted-keydown-and-scroll-delta' },
        evidence: { cases },
      },
    );
  });

  await finishCase('alt-modifier-isolation', async (contract) => {
    const shortcut = inventory.shortcuts.find((item) => item.actionId === 'shortcutKeyActivateInput');
    const code = resolveShortcutDispatchCode(shortcut || {}, activeShortcutCodes);
    if (!code) {
      return buildFixedContractLiveRow(
        contract,
        fixedSemantic('coverage-gap', 'modifier-pass-through', 'Unexpected modifiers pass through.', '', 'No validation key was available for the input-focus action.'),
      );
    }
    await resetFixturePage(page, fixtureUrl);
    await closeTransientUi(page);
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    const target = targetById['prompt-textarea'];
    const cases = [];
    const limitations = [];
    for (const modifier of ['Shift', 'Control', 'Meta', 'AltGraph']) {
      const observed = await observeFixedChord(page, code, ['Alt', modifier], target);
      const keydown = observed.keydown;
      const unsupportedAltGraph =
        modifier === 'AltGraph' &&
        (observed.dispatch.status !== 'dispatched' || keydown?.altGraph !== true);
      const passed =
        !unsupportedAltGraph &&
        observed.dispatch.status === 'dispatched' &&
        !observed.after.activeTarget &&
        keydown?.isTrusted === true &&
        keydown?.defaultPrevented === false;
      if (unsupportedAltGraph) limitations.push('Playwright did not expose a trusted AltGraph state for this key event.');
      cases.push({ modifier, activeTarget: observed.after.activeTarget, defaultPrevented: keydown?.defaultPrevented ?? null, altGraph: keydown?.altGraph ?? false, passed });
    }
    limitations.push('Physical IME composition (isComposing/keyCode 229) cannot be generated by the Playwright keyboard driver on this Windows profile.');
    const passed = cases.length === 4 && cases.every((item) => item.passed);
    return buildFixedContractLiveRow(
      contract,
      fixedSemantic(
        passed ? 'pass' : 'coverage-gap',
        'trusted-keydown-modifier-matrix',
        'Shift, Control, Meta, and AltGraph variants do not claim the ordinary Alt shortcut; IME composition is separately limited.',
        JSON.stringify(cases),
        passed ? limitations.join(' ') : `Modifier isolation did not pass for all tested chords. ${limitations.join(' ')}`,
      ),
      {
        modifiers: 'Alt + Shift / Control / Meta / AltGraph',
        routingProof: { status: passed ? 'observed-pass-through' : 'not-observed', proofMethod: 'trusted-keydown-default-prevention' },
        evidence: { cases, limitations },
      },
    );
  });

  await finishCase('shortcut-overlay-dismissal', async (contract) => {
    const showOverlay = inventory.shortcuts.find((item) => item.actionId === 'shortcutKeyShowOverlay');
    const code = resolveShortcutDispatchCode(showOverlay || {}, activeShortcutCodes);
    const target = targetById['shortcut-overlay'];
    if (!code || !target) {
      return buildFixedContractLiveRow(contract, fixedSemantic('coverage-gap', 'escape-dismissal', 'Escape closes the visible extension shortcut overlay.', '', 'Overlay key or structural target was unavailable.'));
    }
    await resetFixturePage(page, fixtureUrl);
    await closeTransientUi(page);
    await page.keyboard.press('Escape').catch(() => {});
    await dispatchObservedKeyboardChord(page, code, ['Alt']);
    await page.waitForTimeout(500);
    const before = await captureLiveProbeSemanticSnapshot(page, target);
    if (!before.visibleTarget) throw new Error('The extension shortcut overlay did not open for the Escape dismissal case.');
    const observed = await observeFixedChord(page, 'Escape', [], target, 500);
    const passed = observed.before.visibleTarget && !observed.after.visibleTarget;
    return buildFixedContractLiveRow(
      contract,
      fixedSemantic(passed ? 'pass' : 'coverage-gap', 'visible-overlay-dismissal', 'Escape closes the extension shortcut overlay.', `overlay ${observed.before.visibleTarget} -> ${observed.after.visibleTarget}`, passed ? '' : 'Escape did not dismiss the visible extension shortcut overlay.'),
      {
        modifiers: 'Escape',
        targetProof: { status: observed.before.visibleTarget ? 'present' : 'not-present', expectedTargetRef: 'shortcut-overlay', observedTargetRef: observed.before.visibleTarget ? 'shortcut-overlay' : '', proofMethod: 'visible-overlay-state' },
        routingProof: { status: passed ? 'observed' : 'not-observed', proofMethod: 'trusted-keydown-and-overlay-state' },
      },
    );
  });

  await finishCase('overlay-alt-only-capture', async (contract) => {
    const showOverlay = inventory.shortcuts.find((item) => item.actionId === 'shortcutKeyShowOverlay');
    const code = resolveShortcutDispatchCode(showOverlay || {}, activeShortcutCodes);
    const target = targetById['shortcut-overlay'];
    if (!code || !target) {
      return buildFixedContractLiveRow(contract, fixedSemantic('coverage-gap', 'alt-only-keydown-matrix', 'Only plain Alt plus the configured key opens the overlay.', '', 'Overlay key or structural target was unavailable.'));
    }
    await resetFixturePage(page, fixtureUrl);
    await closeTransientUi(page);
    const cases = [];
    for (const modifier of ['Shift', 'Control', 'Meta', 'AltGraph']) {
      await page.keyboard.press('Escape').catch(() => {});
      const observed = await observeFixedChord(page, code, ['Alt', modifier], target);
      const keydown = observed.keydown;
      const unsupportedAltGraph = modifier === 'AltGraph' && (observed.dispatch.status !== 'dispatched' || keydown?.altGraph !== true);
      cases.push({
        modifier,
        visible: observed.after.visibleTarget,
        defaultPrevented: keydown?.defaultPrevented ?? null,
        altGraph: keydown?.altGraph ?? false,
        passed: !unsupportedAltGraph && observed.dispatch.status === 'dispatched' && !observed.after.visibleTarget && keydown?.defaultPrevented === false,
        unsupported: unsupportedAltGraph ? observed.dispatch.reason || 'No trusted AltGraph state was observed.' : '',
      });
    }
    const passed = cases.length === 4 && cases.every((item) => item.passed);
    return buildFixedContractLiveRow(
      contract,
      fixedSemantic(passed ? 'pass' : 'coverage-gap', 'trusted-keydown-alt-only-matrix', 'Shift, Control, Meta, and AltGraph prevent overlay capture.', JSON.stringify(cases), passed ? '' : 'The overlay opened or captured a modified key, or AltGraph could not be observed.'),
      {
        modifiers: 'Alt + Shift / Control / Meta / AltGraph',
        targetProof: { status: 'present', expectedTargetRef: 'shortcut-overlay', observedTargetRef: 'shortcut-overlay', proofMethod: 'structural-target-match' },
        routingProof: { status: passed ? 'observed-pass-through' : 'not-observed', proofMethod: 'trusted-keydown-default-prevention' },
        evidence: { cases, limitation: 'IME composition cannot be generated by the Playwright keyboard driver on this Windows profile.' },
      },
    );
  });

  await finishCase('ctrl-send-gate', async (contract) => {
    await prepareNewConversationProbeState(page, fixtureUrl);
    trackAuditOwnedConversation(page.url());
    await ensureControlSendStopEnabled(page);
    await setComposerText(page, SIDE_EFFECT_MESSAGE_TEXT);
    const sendTarget = targetById['send-button'];
    checkpoint.currentCase.phase = 'disabled-gate-pending';
    await persistCheckpoint();
    await page.evaluate(() => { window.enableSendWithControlEnterCheckbox = false; });
    const disabled = await observeFixedChord(page, 'Enter', ['Control'], sendTarget, 350);
    const disabledPass =
      disabled.after.userMessageCount === disabled.before.userMessageCount &&
      disabled.after.composerHasText &&
      disabled.keydown?.isTrusted === true &&
      disabled.keydown?.defaultPrevented === false;
    await setComposerText(page, '');
    checkpoint.currentCase.phase = 'enabled-gate-pending';
    await persistCheckpoint();
    await page.evaluate(() => { window.enableSendWithControlEnterCheckbox = true; });
    await setComposerText(page, SIDE_EFFECT_MESSAGE_TEXT);
    const enabled = await observeFixedChord(page, 'Enter', ['Control'], sendTarget, 600);
    const enabledChordRouted = enabled.dispatch.status === 'dispatched' &&
      enabled.keydown?.isTrusted === true &&
      enabled.keydown?.defaultPrevented === true;
    let responseCompleted = false;
    let enabledAfter = enabled.after;
    let enabledDispatched = false;
    if (enabledChordRouted) {
      await waitForCommittedUserTurn(page, {
        minimumCount: enabled.before.userMessageCount + 1,
        previousHash: enabled.before.lastUserHash,
      });
      enabledAfter = await captureLiveProbeSemanticSnapshot(page, sendTarget);
      enabledDispatched =
        enabledAfter.userMessageCount > enabled.before.userMessageCount &&
        !enabledAfter.composerHasText;
    }
    if (enabledDispatched) {
      checkpoint.currentCase.phase = 'sent-awaiting-response';
      await persistCheckpoint();
      try {
        await waitForAssistantResponseCompletion(page, {
          minimumCount: enabled.before.assistantMessageCount + 1,
          previousCount: enabled.before.assistantMessageCount,
          previousHash: enabled.before.lastAssistantHash,
        });
      } catch (error) {
        await clickEnabledButton(page, [
          'button[data-testid="stop-button"]',
          'button[data-test-id="stop-button"]',
        ]).catch(() => {});
        throw error;
      }
      enabledAfter = await captureLiveProbeSemanticSnapshot(page, sendTarget);
      responseCompleted =
        enabledAfter.userMessageCount > enabled.before.userMessageCount &&
        enabledAfter.assistantMessageCount > enabled.before.assistantMessageCount &&
        enabledAfter.lastAssistantHash !== enabled.before.lastAssistantHash &&
        !enabledAfter.composerHasText;
      checkpoint.currentCase.phase = 'response-completed';
      await persistCheckpoint();
    }
    const passed = disabledPass && enabledDispatched && responseCompleted;
    return buildFixedContractLiveRow(
      contract,
      fixedSemantic(passed ? 'pass' : 'coverage-gap', 'enabled-disabled-control-send-and-response', 'Disabled Ctrl+Enter preserves the draft and passes through; enabled Ctrl+Enter commits it and receives a completed assistant response.', `disabled: user messages ${disabled.before.userMessageCount} -> ${disabled.after.userMessageCount}; draft remains=${disabled.after.composerHasText}; defaultPrevented=${disabled.keydown?.defaultPrevented}; enabled: user messages ${enabled.before.userMessageCount} -> ${enabledAfter.userMessageCount}; assistant messages ${enabled.before.assistantMessageCount} -> ${enabledAfter.assistantMessageCount}; response completed=${responseCompleted}; defaultPrevented=${enabled.keydown?.defaultPrevented}`, passed ? '' : 'The disabled pass-through, enabled user-message commit, or completed assistant-response transition was not observed.'),
      {
        modifiers: 'Ctrl+Enter with gate disabled and enabled',
        targetProof: { status: 'present', expectedTargetRef: 'send-button', observedTargetRef: 'send-button', proofMethod: 'structural-target-match' },
        routingProof: { status: passed ? 'observed-enabled-and-disabled' : 'not-observed', proofMethod: 'trusted-keydown-default-prevention' },
        evidence: {
          disabledNoOp: disabledPass,
          enabledDispatch: enabledDispatched,
          responseCompleted,
          enabledDefaultPrevented: enabled.keydown?.defaultPrevented ?? null,
        },
      },
    );
  });

  await finishCase('ctrl-stop-gate', async (contract) => {
    await prepareInFlightMessageProbeState(page, fixtureUrl);
    trackAuditOwnedConversation(page.url());
    const stopTarget = targetById['stop-button'];
    const before = await captureLiveProbeSemanticSnapshot(page, stopTarget);
    if (!before.visibleTarget) throw new Error('A live generation Stop control was not visible before the Ctrl+Backspace gate case.');
    await page.evaluate(() => { window.enableStopWithControlBackspaceCheckbox = false; });
    const disabled = await observeFixedChord(page, 'Backspace', ['Control'], stopTarget, 350);
    const disabledPass = disabled.after.visibleTarget && disabled.keydown?.defaultPrevented === false;
    await page.evaluate(() => { window.enableStopWithControlBackspaceCheckbox = true; });
    const enabled = await observeFixedChord(page, 'Backspace', ['Control'], stopTarget, 1500);
    const enabledPass = enabled.before.visibleTarget && !enabled.after.visibleTarget;
    const passed = disabledPass && enabledPass;
    return buildFixedContractLiveRow(
      contract,
      fixedSemantic(passed ? 'pass' : 'coverage-gap', 'enabled-disabled-control-stop-matrix', 'Disabled Ctrl+Backspace preserves active generation; enabled Ctrl+Backspace stops it.', `disabled stop visible=${disabled.after.visibleTarget}, defaultPrevented=${disabled.keydown?.defaultPrevented}; enabled stop ${enabled.before.visibleTarget} -> ${enabled.after.visibleTarget}`, passed ? '' : 'Ctrl+Backspace did not preserve/stop generation according to the enabled gate.'),
      {
        modifiers: 'Ctrl+Backspace with gate disabled and enabled',
        targetProof: { status: before.visibleTarget ? 'present' : 'not-present', expectedTargetRef: 'stop-button', observedTargetRef: before.visibleTarget ? 'stop-button' : '', proofMethod: 'visible-stop-state' },
        routingProof: { status: passed ? 'observed' : 'not-observed', proofMethod: 'trusted-keydown-and-generation-state' },
        evidence: { disabledNoOp: disabledPass, enabledStop: enabledPass, linkedPositive: globalById.get('shortcutKeyClickStopButton')?.semantic?.status || 'not-run' },
      },
    );
  });

  await finishCase('model-picker-slot-dispatch', async (contract) => {
    await prepareNewConversationProbeState(page, fixtureUrl);
    trackAuditOwnedConversation(page.url());
    await openModelSwitcherMenu(page);
    const slotInfos = await page.evaluate(() => {
      const profile = window.__activeModelPickerShortcutProfile || '';
      const groups = window.ModelLabels?.getPopupPresentationGroups?.(
        window.__activeModelConfigId || window.ModelLabels?.DEFAULT_ACTIVE_CONFIG_ID,
        window.MODEL_NAMES || [],
        window.__modelCatalog || null,
      ) || [];
      const codes = window.__modelPickerKeyCodesProfiles?.[profile] || window.__modelPickerKeyCodes || [];
      return groups.flatMap((group) => (Array.isArray(group.actions) ? group.actions : []))
        .map((action) => ({ profile, slot: Number(action.slot), actionId: String(action.id || action.actionId || ''), code: codes[Number(action.slot)] || '' }))
        .filter((action) => Number.isInteger(action.slot) && action.slot >= 0 && action.code)
        .sort((left, right) => left.slot - right.slot);
    });
    if (!slotInfos.length) {
      return buildFixedContractLiveRow(
        contract,
        fixedSemantic('account-unavailable', 'model-catalog-slot-dispatch', 'An assigned, currently presented model slot can be selected through its real keyboard shortcut.', '', 'The authenticated account exposed no assigned current model slot in the active ChatGPT catalog.'),
      );
    }
    const useControl = await page.evaluate(() => window.useControlForModelSwitcherRadio === true);
    const modelTarget = targetById['model-switcher-button'];
    const readModelLabelHash = () => page.evaluate((selectors) => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      let button = null;
      for (const selector of selectors) {
        button = Array.from(document.querySelectorAll(selector)).find(isVisible) || null;
        if (button) break;
      }
      const text = button?.innerText || button?.textContent || '';
      let hash = 2166136261;
      for (let index = 0; index < text.length; index += 1) {
        hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
      }
      return button && text.trim() ? `${text.length}:${(hash >>> 0).toString(16)}` : '';
    }, modelPickerSelectors.MODEL_MENU_BUTTON_SELECTORS || ['button[data-testid="model-switcher-dropdown-button"]']);
    let selected = null;
    const attempts = [];
    for (const slotInfo of slotInfos) {
      await closeTransientUi(page);
      await openModelSwitcherMenu(page);
      checkpoint.currentCase.phase = 'model-slot-pending';
      checkpoint.currentCase.intendedSideEffect = `model-picker-slot:${slotInfo.slot}:${slotInfo.actionId}`;
      await persistCheckpoint();
      const beforeLabelHash = await readModelLabelHash();
      const observed = await observeFixedChord(page, slotInfo.code, [useControl ? 'Control' : 'Alt'], modelTarget, 1200);
      const afterLabelHash = await readModelLabelHash();
      const menuClosed = await page.evaluate((selector) => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      return !Array.from(document.querySelectorAll(selector)).some(isVisible);
    }, modelPickerSelectors.MODEL_MENU_SELECTOR);
      const passed =
        observed.dispatch.status === 'dispatched' &&
        observed.keydown?.isTrusted === true &&
        observed.keydown?.defaultPrevented === true &&
        Boolean(afterLabelHash) &&
        beforeLabelHash !== afterLabelHash &&
        menuClosed;
      attempts.push({
        slot: slotInfo.slot,
        actionId: slotInfo.actionId,
        profile: slotInfo.profile || '',
        labelChanged: beforeLabelHash !== afterLabelHash,
        pickerClosed: menuClosed,
        defaultPrevented: observed.keydown?.defaultPrevented ?? null,
        trusted: observed.keydown?.isTrusted === true,
      });
      if (passed) {
        selected = { slotInfo, observed, beforeLabelHash, afterLabelHash, menuClosed };
        break;
      }
    }
    const passed = Boolean(selected);
    const slotInfo = selected?.slotInfo || slotInfos[0];
    return buildFixedContractLiveRow(
      contract,
      fixedSemantic(passed ? 'pass' : 'coverage-gap', 'assigned-model-slot-selection', `Profile ${slotInfo.profile || 'active'}, slot ${slotInfo.slot} selects a different native model action and closes the picker.`, JSON.stringify(attempts), passed ? '' : 'No assigned model slot changed the native model selection and closed the picker.'),
      {
        modifiers: `${useControl ? 'Control' : 'Alt'} + ${slotInfo.code}`,
        targetProof: { status: 'present', expectedTargetRef: 'model-switcher-button', observedTargetRef: 'model-switcher-button', proofMethod: 'model-picker-native-control-state' },
        routingProof: { status: passed ? 'observed' : 'not-observed', proofMethod: 'trusted-window-keydown' },
        evidence: { selectedSlot: selected ? slotInfo.slot : null, attempts },
      },
    );
  });

  await finishCase('model-picker-refresh-support', async (contract) => {
    await resetFixturePage(page, fixtureUrl);
    const barState = await page.evaluate(() => {
      const bar = document.getElementById('stage-sidebar-tiny-bar');
      if (!bar) return null;
      return {
        opacity: getComputedStyle(bar).opacity,
        inlineOpacity: bar.style.opacity,
        transition: bar.style.transition,
      };
    });
    if (!barState) {
      return buildFixedContractLiveRow(
        contract,
        fixedSemantic('account-unavailable', 'interaction-refresh-state', 'A live interaction event refreshes the extension-owned sidebar state.', '', 'The authenticated ChatGPT layout did not render #stage-sidebar-tiny-bar, so this source contract has no live target in the current account/layout.'),
      );
    }
    let changed = false;
    let observed = null;
    let afterOpacity = '';
    try {
      changed = await page.evaluate(() => {
        const bar = document.getElementById('stage-sidebar-tiny-bar');
        if (!bar) return false;
        bar.style.opacity = '0.23';
        return true;
      });
      observed = await observeFixedChord(page, 'F8', [], null, 500);
      afterOpacity = await page.evaluate(() => document.getElementById('stage-sidebar-tiny-bar')?.style.opacity || '');
    } finally {
      await page.evaluate((style) => {
        const bar = document.getElementById('stage-sidebar-tiny-bar');
        if (bar) {
          bar.style.opacity = style.inlineOpacity;
          bar.style.transition = style.transition;
        }
      }, barState);
    }
    const passed = changed && observed.keydown?.isTrusted === true && afterOpacity !== '0.23';
    return buildFixedContractLiveRow(
      contract,
      fixedSemantic(passed ? 'pass' : 'coverage-gap', 'trusted-keydown-refresh-state', 'A keydown schedules the sidebar interaction refresh and repairs the stale opacity state.', `opacity ${barState.opacity} -> ${afterOpacity}; key=${observed.keydown?.code || ''}`, passed ? '' : 'The keydown did not produce an observable refresh of the live sidebar state.'),
      { modifiers: 'F8 unmodified', routingProof: { status: passed ? 'observed' : 'not-observed', proofMethod: 'trusted-keydown-and-dom-state' }, evidence: { before: barState, afterOpacity } },
    );
  });

  return rows;
}

function buildLiveProbeSummary(rows, runStatus = 'completed') {
  return {
    runStatus,
    total: rows.length,
    executable: rows.filter((row) => EXECUTABLE_LIVE_PROBE_MODES.includes(row.probeMode)).length,
    passed: rows.filter((row) => row.status === 'pass').length,
    failed: rows.filter((row) => row.status === 'fail').length,
    skipped: rows.filter((row) => row.status === 'skipped').length,
    environmentFailed: rows.filter((row) => row.status === 'environment-fail').length,
    manual: rows.filter((row) => row.status === 'manual').length,
    notApplicable: rows.filter((row) => row.status === 'not-applicable').length,
    notLiveProbed: rows.filter((row) => row.status === 'not-live-probed').length,
    routed: rows.filter((row) => row.routingProof?.status === 'observed').length,
    intercepted: rows.filter((row) => row.routingProof?.status === 'intercepted').length,
    semanticPending: rows.filter((row) => row.semantic?.status === 'not-run').length,
    coverageGaps: rows.filter((row) => row.status === 'coverage-gap').length,
  };
}

function buildNonExecutableLiveProbeRow(shortcut, dispatchCode = '') {
  const probeMode = shortcut.activationProbeMode || 'not-live-probed';
  let status = 'not-live-probed';
  if (probeMode === 'manual-only') status = 'manual';
  if (probeMode === 'not-applicable') status = 'not-applicable';
  return {
    actionId: shortcut.actionId,
    label: shortcut.label,
    defaultCode: shortcut.defaultCode,
    dispatchCode,
    probeMode,
    expectedTargetRef: shortcut.activationProbeExpectedTargetRef || '',
    status,
    reason: shortcut.activationProbe?.notes || shortcut.notes || 'No live activation probe is configured.',
    observedSelector: '',
    observedTextSnippet: '',
    durationMs: 0,
  };
}

function buildSkippedLiveProbeRow(shortcut, status, reason, dispatchCode = '') {
  return {
    actionId: shortcut.actionId,
    label: shortcut.label,
    defaultCode: shortcut.defaultCode,
    dispatchCode,
    probeMode: shortcut.activationProbeMode || '',
    expectedTargetRef: shortcut.activationProbeExpectedTargetRef || '',
    status,
    reason,
    observedSelector: '',
    observedTextSnippet: '',
    durationMs: 0,
  };
}

export async function runLiveShortcutActivationProbes(page, context, options = {}) {
  const requestedActionIds = new Set(options.onlyActionIds || []);
  const fixedContractIds = new Set(options.fixedContractIds || []);
  const phase = ['global', 'model', 'all'].includes(options.phase) ? options.phase : 'all';
  const { exports } = await loadDevScrapeWideContract();
  let fixtureUrl = options.fixtureUrl || exports.DEV_SCRAPE_WIDE_FIXTURE_URL;
  const fixtureOwnership = options.fixtureOwnership || null;
  if (
    fixtureOwnership &&
    (fixtureOwnership.kind !== 'audit-owned' || fixtureOwnership.fixtureUrl !== fixtureUrl)
  ) {
    throw new Error('The supplied audit fixture provenance does not match the live probe URL.');
  }
  const scrapeStateRegistry = [
    ...(exports.DUMP_REGISTRY || []),
    ...(exports.DEFERRED_ARTIFACTS || []),
  ];
  const inventory = await buildCurrentShortcutInventory(scrapeStateRegistry);
  const targetById = Object.fromEntries(inventory.targets.map((target) => [target.targetId, target]));
  const fixedOnly = requestedActionIds.size === 0 && fixedContractIds.size > 0;
  const selectedGlobalActionIds = new Set(requestedActionIds);
  if (fixedContractIds.has('runtime-shortcut-dispatch')) {
    selectedGlobalActionIds.add('shortcutKeyActivateInput');
  }
  if (fixedContractIds.has('shortcut-overlay-opener')) {
    selectedGlobalActionIds.add('shortcutKeyShowOverlay');
  }
  if (fixedContractIds.has('response-navigation-preview')) {
    selectedGlobalActionIds.add(PREVIOUS_THREAD_ACTION_ID);
    selectedGlobalActionIds.add(NEXT_THREAD_ACTION_ID);
  }
  const runGlobalActions = !fixedOnly || selectedGlobalActionIds.size > 0;
  const phaseShortcuts = inventory.shortcuts.filter((shortcut) =>
    phase === 'all' || (phase === 'model' ? isModelPhaseShortcut(shortcut) : !isModelPhaseShortcut(shortcut)),
  );
  const globalShortcutsToRun = !runGlobalActions
    ? []
    : requestedActionIds.size || fixedContractIds.size
      ? phaseShortcuts.filter((shortcut) => selectedGlobalActionIds.has(shortcut.actionId))
      : phaseShortcuts;
  const fixedContractsToRun = options.includeFixedContracts === false || phase === 'model' || (requestedActionIds.size > 0 && fixedContractIds.size === 0)
    ? []
    : (inventory.fixedKeyboardContracts || []).filter(
        (contract) => !fixedContractIds.size || fixedContractIds.has(contract.contractId),
      );
  const executableProbeShortcuts = inventory.shortcuts.filter(
    (shortcut) =>
      globalShortcutsToRun.includes(shortcut) &&
      EXECUTABLE_LIVE_PROBE_MODES.includes(shortcut.activationProbeMode) &&
      shortcut.activationProbeSafe,
  );
  const runFolderPath = options.runFolderPath || '';
  const checkpoint = {
    schemaVersion: 1,
    status: 'preflight',
    phase,
    fixtureUrl,
    auditFixtureUrl: fixtureOwnership?.fixtureUrl || '',
    auditFixtureOwned: Boolean(fixtureOwnership),
    auditFixtureSourceRun: fixtureOwnership?.sourceRunFolder || '',
    startedAt: new Date().toISOString(),
    extensionId: '',
    extensionPath: options.extensionDir || path.join(repoRoot, 'extension'),
    inventorySummary: {
      runtimeActions: inventory.allRuntimeActionIds?.length || 0,
      handlerActions: inventory.handlerActionIds?.length || 0,
      targetDescriptors: inventory.targets?.length || 0,
      fixedKeyboardContracts: inventory.fixedKeyboardContracts?.length || 0,
      modelPickerSlotRows: inventory.modelPickerSlotRows?.length || 0,
    },
    storageSnapshot: null,
    temporaryShortcutAssignments: {},
    mutationLedger: [],
    mutationOccurred: false,
    currentCase: null,
    completedCases: [],
    auditOwnedConversationIds: fixtureOwnership?.conversationId ? [fixtureOwnership.conversationId] : [],
    storageRecoveryStatus: 'not-run',
    clipboardRecoveryStatus: 'not-needed',
    clipboardRecovery: null,
    recoveryCheckpointStage: '',
    checkpointWriteError: '',
  };
  const persistCheckpoint = async () => {
    try {
      const checkpointPath = await persistShortcutAuditCheckpoint(runFolderPath, checkpoint);
      if (checkpointPath) checkpoint.checkpointPath = checkpointPath;
      return checkpointPath;
    } catch (error) {
      checkpoint.checkpointWriteError = error?.message || String(error);
      throw error;
    }
  };
  const protectedFixtureIds = new Set(
    [exports.DEV_SCRAPE_WIDE_FIXTURE_URL, exports.DEV_SCRAPE_WIDE_FALLBACK_FIXTURE_URL]
      .map((url) => {
        try {
          return new URL(url).pathname.match(/\/c\/([^/]+)/)?.[1] || '';
        } catch {
          return '';
        }
      })
      .filter(Boolean),
  );
  const trackAuditOwnedConversation = (url) => {
    try {
      const conversationId = new URL(url).pathname.match(/\/c\/([^/]+)/)?.[1] || '';
      if (conversationId && !protectedFixtureIds.has(conversationId)) {
        checkpoint.auditOwnedConversationIds = [
          ...new Set([...checkpoint.auditOwnedConversationIds, conversationId]),
        ];
      }
    } catch {}
  };

  let activeShortcutCodes = {};
  let originalActiveShortcutCodes = {};
  let extensionId = '';
  let temporaryShortcutAssignments = {};
  let mutationLedger = [];
  let storageRecovery = null;
  let clipboardRecovery = { status: 'not-needed' };
  let extensionStorageWarning = '';
  const codeboxProbeSession = createCodeboxProbeSession();
  try {
    await persistCheckpoint();
    const reachability = await verifyExtensionRuntimeReachable(context, options);
    extensionId = reachability.extensionId;
    checkpoint.extensionId = extensionId;
    checkpoint.extensionPath = options.extensionDir || path.join(repoRoot, 'extension');
    checkpoint.status = 'extension-verified';
    await persistCheckpoint();
    const storageSnapshotKeys = [
      ...inventory.shortcuts.map((shortcut) => shortcut.actionId),
      ...AUDIT_STORAGE_SNAPSHOT_KEYS,
    ];
    activeShortcutCodes = await readExtensionSyncStorage(
      context,
      extensionId,
      [...new Set(storageSnapshotKeys)],
    );
    originalActiveShortcutCodes = { ...activeShortcutCodes };
    const storedValues = {};
    const catalogFingerprints = {};
    for (const key of storageSnapshotKeys) {
      const present = Object.prototype.hasOwnProperty.call(activeShortcutCodes, key);
      if (key === 'modelCatalogLatest' || key === 'modelCatalogLegacy') {
        catalogFingerprints[key] = {
          present,
          fingerprint: fingerprintAuditValue(present ? activeShortcutCodes[key] : null),
        };
      } else {
        storedValues[key] = {
          present,
          value: present ? activeShortcutCodes[key] : null,
        };
      }
    }
    checkpoint.storageSnapshot = { keys: storedValues, catalogFingerprints };
    temporaryShortcutAssignments = buildTemporaryShortcutAssignments(
      executableProbeShortcuts,
      activeShortcutCodes,
    );
    mutationLedger = createStorageMutationLedger(
      originalActiveShortcutCodes,
      temporaryShortcutAssignments,
    );
    checkpoint.temporaryShortcutAssignments = { ...temporaryShortcutAssignments };
    checkpoint.mutationLedger = mutationLedger;
    checkpoint.status = 'ready';
    await persistCheckpoint();
    if (Object.keys(temporaryShortcutAssignments).length > 0) {
      checkpoint.mutationIntent = {
        type: 'temporary-shortcut-assignment',
        status: 'write-pending',
        keys: Object.keys(temporaryShortcutAssignments),
      };
      await persistCheckpoint();
      await mutateExtensionSyncStorage(context, extensionId, {
        op: 'set',
        payload: temporaryShortcutAssignments,
      });
      checkpoint.mutationOccurred = true;
      checkpoint.mutationIntent.status = 'applied';
      await persistCheckpoint();
      activeShortcutCodes = {
        ...activeShortcutCodes,
        ...temporaryShortcutAssignments,
      };
    }
  } catch (error) {
    extensionStorageWarning = `${error?.message || error} Active extension storage was not reachable; live probes will use shipped defaults only and skip validation-only temporary key assignment.`;
    checkpoint.status = 'preflight-failed';
    checkpoint.preflightError = error?.message || String(error);
    if (checkpoint.mutationIntent?.status === 'write-pending') {
      checkpoint.mutationIntent.status = 'write-failed-or-partial';
    }
    activeShortcutCodes = {};
    if (!extensionId) {
      originalActiveShortcutCodes = {};
      temporaryShortcutAssignments = {};
    }
    await persistCheckpoint().catch(() => {});
  }

  const rows = [];
  const fixedRows = [];
  const orderedShortcuts = orderLiveProbeShortcuts(globalShortcutsToRun);
  let blankConversationReadyFromShortcut = false;
  try {
    const initialFixtureState = await captureLiveProbeSemanticSnapshot(page, null);
    const needsConversationState =
      phase !== 'model' && (runGlobalActions || fixedContractIds.size > 0);
    const shouldPrepareOwnedFixture =
      needsConversationState &&
      (!fixtureOwnership ||
        initialFixtureState.userMessageCount < 2 ||
        initialFixtureState.assistantMessageCount < 2);
    if (shouldPrepareOwnedFixture) {
      checkpoint.currentCase = {
        rowId: 'setup:audit-owned-fixture',
        phase: 'fixture-creation-pending',
        intendedSideEffect: 'create a disposable two-turn keyboard audit conversation',
        sourceConversationId: '',
        startedAt: new Date().toISOString(),
        attempt: 1,
      };
      checkpoint.sourceFixtureUrl = fixtureUrl;
      await persistCheckpoint();
      fixtureUrl = await createAuditOwnedFixtureConversation(page, {
        checkpoint,
        persistCheckpoint,
        trackAuditOwnedConversation,
      });
      checkpoint.fixtureUrl = fixtureUrl;
      checkpoint.auditFixtureOwned = true;
      await persistCheckpoint();
    }
    for (const shortcut of orderedShortcuts) {
      if (
        shortcut.actionId !== NEW_CONVERSATION_ACTION_ID &&
        shortcut.actionId !== TEMPORARY_CHAT_ACTION_ID
      ) {
        blankConversationReadyFromShortcut = false;
      }
      const dispatchCode = resolveShortcutDispatchCode(shortcut, activeShortcutCodes);
      if (!executableProbeShortcuts.some((item) => item.actionId === shortcut.actionId)) {
        const row = buildNonExecutableLiveProbeRow(shortcut, dispatchCode);
        rows.push(row);
        checkpoint.completedCases.push({
          rowId: `global:${shortcut.actionId}`,
          actionId: shortcut.actionId,
          status: row.status,
          reason: row.reason,
          completedAt: new Date().toISOString(),
        });
        await persistCheckpoint().catch(() => {});
        continue;
      }

      const startedAt = Date.now();
      const target = targetById[shortcut.activationProbeExpectedTargetRef];
      const probeStateId = shortcut.activationProbeUiStateRefs?.[0] || shortcut.requiredUiStateRefs?.[0];
      let fileChooserObserved = false;
      let resolveFileChooser;
      const fileChooserEvent =
        shortcut.actionId === 'shortcutKeyAddPhotosFiles'
          ? new Promise((resolve) => {
              resolveFileChooser = resolve;
            })
          : Promise.resolve(false);
      const fileChooserListener = (chooser) => {
        fileChooserObserved = true;
        void chooser.cancel().then(
          () => resolveFileChooser?.(true),
          () => resolveFileChooser?.(false),
        );
      };
      const canReuseNewConversationState =
        shortcut.actionId === TEMPORARY_CHAT_ACTION_ID &&
        shortcut.activationProbeSetup === 'new-conversation' &&
        blankConversationReadyFromShortcut;
      try {
        if (!dispatchCode) {
          const reason = extensionStorageWarning
            ? `No default shortcut key code is assigned and active extension storage was unavailable for a temporary assignment. ${extensionStorageWarning}`
            : 'No assigned shortcut key code was found in active storage or defaults.';
          const row = buildSkippedLiveProbeRow(
              shortcut,
              extensionStorageWarning ? 'environment-fail' : 'skipped',
              reason,
              dispatchCode,
            );
          rows.push(row);
          checkpoint.completedCases.push({
            rowId: `global:${shortcut.actionId}`,
            actionId: shortcut.actionId,
            status: row.status,
            reason: row.reason,
            completedAt: new Date().toISOString(),
          });
          await persistCheckpoint().catch(() => {});
          continue;
        }
        if (!target) {
          throw new Error(`Unknown expected probe target: ${shortcut.activationProbeExpectedTargetRef}`);
        }
        if (
          !probeStateId &&
          !STATELESS_LIVE_PROBE_SETUPS.includes(shortcut.activationProbeSetup)
        ) {
          throw new Error('Shortcut has no probe scrape state to prepare.');
        }

        trackAuditOwnedConversation(page.url());
        checkpoint.currentCase = {
          rowId: `global:${shortcut.actionId}`,
          actionId: shortcut.actionId,
          phase: 'setup-pending',
          setup: shortcut.activationProbeSetup || '',
          dispatchCode,
          intendedSideEffect: shortcut.activationProbeSetup || 'keyboard shortcut activation',
          sourceConversationId: page.url().match(/\/c\/([^/]+)/)?.[1] || '',
          startedAt: new Date(startedAt).toISOString(),
          attempt: 1,
        };
        await persistCheckpoint();

        if (shortcut.activationProbeSetup === 'new-conversation') {
          if (!canReuseNewConversationState) {
            await prepareNewConversationProbeState(page, fixtureUrl);
          }
        } else if (shortcut.activationProbeSetup === 'gpt-conversation') {
          await prepareGptConversationProbeState(
            page,
            shortcut.activationProbeUrl || GPT_CONVERSATION_PROBE_URL,
          );
        } else if (isResponseNavigationProbeSetup(shortcut)) {
          await prepareResponseNavigationProbeState(
            page,
            shortcut,
            target,
            scrapeStateRegistry,
            fixtureUrl,
          );
        } else if (shortcut.activationProbeSetup === 'composer-draft-message') {
          await prepareComposerDraftMessageProbeState(page, fixtureUrl);
        } else if (shortcut.activationProbeSetup === 'in-flight-message') {
          await prepareInFlightMessageProbeState(page, fixtureUrl);
        } else if (shortcut.activationProbeSetup === 'active-edit-card') {
          await prepareActiveEditCardProbeState(page, fixtureUrl);
        } else if (shortcut.activationProbeSetup === 'sent-user-message') {
          await prepareSentUserMessageProbeState(page, fixtureUrl);
        } else if (shortcut.activationProbeSetup === 'dictation-active') {
          await prepareDictationActiveProbeState(page, fixtureUrl);
        } else if (shortcut.activationProbeSetup === 'model-effort-shortcut') {
          await resetFixturePage(page, fixtureUrl);
          await closeTransientUi(page);
        } else if (shortcut.activationProbeSetup === 'scroll-from-top') {
          await resetFixturePage(page, fixtureUrl);
          await closeTransientUi(page);
          await setLiveProbeScrollPosition(page, 'top');
        } else if (shortcut.activationProbeSetup === 'scroll-from-bottom') {
          await resetFixturePage(page, fixtureUrl);
          await closeTransientUi(page);
          await setLiveProbeScrollPosition(page, 'bottom');
        } else if (shortcut.activationProbeSetup === 'message-scroll-from-middle') {
          await prepareMessageScrollProbeState(page, fixtureUrl);
        } else if (shortcut.activationProbeSetup === 'clipboard-single-message') {
          await prepareClipboardSingleMessageProbeState(
            page,
            scrapeStateRegistry,
            fixtureUrl,
            codeboxProbeSession,
          );
        } else if (shortcut.activationProbeSetup === 'clipboard-entire-conversation') {
          await prepareClipboardEntireConversationProbeState(
            page,
            fixtureUrl,
            codeboxProbeSession,
          );
        } else if (shortcut.activationProbeSetup === 'clipboard-code-blocks') {
          await prepareClipboardCodeBlocksProbeState(page, fixtureUrl, codeboxProbeSession);
        } else if (shortcut.activationProbeSetup === 'codebox-conversation') {
          await prepareCodeboxWrapProbeState(page, fixtureUrl, codeboxProbeSession);
          await writeAuditStorageSetting({
            context,
            extensionId,
            key: 'codeboxWrapEnabled',
            value: false,
            originalStorage: originalActiveShortcutCodes,
            mutationLedger,
            checkpoint,
            persistCheckpoint,
            intentType: 'codebox-wrap-persistence-test',
          });
          await page.waitForFunction(
            () => !document.documentElement.classList.contains('csp-codebox-wrap-enabled'),
            undefined,
            { timeout: 5000 },
          );
          const codeboxPreferenceMutation = mutationLedger.find(
            (entry) => entry.key === 'codeboxWrapEnabled',
          );
          if (!codeboxPreferenceMutation) {
            throw new Error('Codebox wrap preference mutation was not recorded before shortcut dispatch.');
          }
          codeboxPreferenceMutation.auditValues = [false, true];
          checkpoint.mutationLedger = mutationLedger;
          checkpoint.currentCase.codeboxPreferenceMayBecomeEnabled = true;
          await persistCheckpoint();
        } else if (shortcut.activationProbeSetup === 'shortcut-overlay-ready') {
          await resetFixturePage(page, fixtureUrl);
          await closeTransientUi(page);
        } else if (shortcut.activationProbeSetup === 'composer-plus-menu') {
          await resetFixturePage(page, fixtureUrl);
          await openComposerPlusMenu(page);
        } else if (shortcut.activationProbeSetup === 'composer-more-submenu') {
          await resetFixturePage(page, fixtureUrl);
          await openComposerMoreSubmenu(page);
        } else {
          await prepareLiveProbeState(page, probeStateId, scrapeStateRegistry, fixtureUrl);
        }
        if (
          shortcut.activationProbeSetup !== 'gpt-conversation' &&
          shortcut.activationProbeMode !== 'opens-target' &&
          shortcut.activationProbeMode !== 'dom-state' &&
          !isModelEffortShortcut(shortcut)
        ) {
          await waitForLiveProbeTargetPresence(page, target);
        }
        if (isResponseNavigationShortcut(shortcut)) {
          await waitForEnabledResponseNavigationTarget(page, target);
        }
        trackAuditOwnedConversation(page.url());
        checkpoint.currentCase.phase = 'ready-to-dispatch';
        checkpoint.currentCase.preActionConversationId =
          page.url().match(/\/c\/([^/]+)/)?.[1] || '';
        await persistCheckpoint();
        await installLiveProbeObserver(page, { preventDefault: false });
        if (!shouldPreservePreparedProbeState(shortcut)) {
          await page.evaluate(() => {
            const active = document.activeElement;
            if (active instanceof HTMLElement) active.blur();
            document.body?.focus?.();
          });
        }
        const beforeSnapshot = await captureLiveProbeSemanticSnapshot(page, target);
        checkpoint.currentCase.phase = 'dispatch-pending';
        checkpoint.currentCase.beforeSnapshot = {
          url: beforeSnapshot.url,
          title: beforeSnapshot.title,
          messageCount: beforeSnapshot.messageCount,
          userMessageCount: beforeSnapshot.userMessageCount,
          assistantMessageCount: beforeSnapshot.assistantMessageCount,
          scrollTop: beforeSnapshot.scrollTop,
          scrollMax: beforeSnapshot.scrollMax,
        };
        await persistCheckpoint();
        if (shortcut.actionId === 'shortcutKeyAddPhotosFiles') {
          page.on('filechooser', fileChooserListener);
        }
        if (shortcut.activationProbeMode === 'direct-menu-target') {
          await dispatchShortcutForAction(page, shortcut, dispatchCode);
        } else if (isResponseNavigationShortcut(shortcut)) {
          await dispatchLiveShortcutRepeated(
            page,
            shortcut,
            dispatchCode,
            RESPONSE_NAVIGATION_ATTEMPTS,
            RESPONSE_NAVIGATION_STEP_SETTLE_MS,
          );
        } else {
          await dispatchShortcutForAction(page, shortcut, dispatchCode);
        }
        checkpoint.currentCase.phase = 'sent-awaiting-semantic-postcondition';
        checkpoint.currentCase.postActionUrl = page.url();
        checkpoint.currentCase.postActionConversationId =
          page.url().match(/\/c\/([^/]+)/)?.[1] || '';
        await persistCheckpoint();
        await page.waitForTimeout(
          shortcut.actionId === NEW_CONVERSATION_ACTION_ID
            ? NEW_CONVERSATION_TARGET_READY_DELAY_MS
            : DEFAULT_LIVE_PROBE_SETTLE_MS,
        );
        trackAuditOwnedConversation(page.url());
        const requiresCommittedResponse = [
          'shortcutKeyClickSendButton',
          'shortcutKeySendEdit',
          'shortcutKeyRegenerateTryAgain',
          'shortcutKeyRegenerateWithDifferentModel',
        ].includes(shortcut.actionId);
        if (requiresCommittedResponse) {
          if (shortcut.actionId === 'shortcutKeyClickSendButton') {
            await waitForCommittedUserTurn(page, {
              minimumCount: beforeSnapshot.userMessageCount + 1,
              previousHash: beforeSnapshot.lastUserHash,
            });
          } else if (shortcut.actionId === 'shortcutKeySendEdit') {
            await waitForCommittedUserTurn(page, {
              minimumCount: beforeSnapshot.userMessageCount,
              previousHash: beforeSnapshot.lastUserHash,
            });
          }
          try {
            await waitForAssistantResponseCompletion(page, {
              minimumCount: Math.max(
                1,
                beforeSnapshot.assistantMessageCount +
                  (shortcut.actionId === 'shortcutKeyClickSendButton' ? 1 : 0),
              ),
              previousCount: beforeSnapshot.assistantMessageCount,
              previousHash: beforeSnapshot.lastAssistantHash,
            });
          } catch (error) {
            await clickEnabledButton(page, [
              'button[data-testid="stop-button"]',
              'button[data-test-id="stop-button"]',
            ]).catch(() => {});
            throw error;
          }
        }
        checkpoint.currentCase.phase = 'dispatched';
        checkpoint.currentCase.postActionUrl = page.url();
        checkpoint.currentCase.postActionConversationId =
          page.url().match(/\/c\/([^/]+)/)?.[1] || '';
        await persistCheckpoint();
        const observed = await readLiveProbeObserver(page);
        if (shortcut.actionId === 'shortcutKeyAddPhotosFiles') {
          await Promise.race([fileChooserEvent, page.waitForTimeout(1200).then(() => false)]);
        }
        const afterSnapshot = await captureLiveProbeSemanticSnapshot(page, target);
        const clickMatch = (observed.clicks || []).find((click) =>
          targetMatchesText(target, click.html),
        );
        const focusMatch = targetMatchesText(target, observed.activeElement?.html || '');
        const openedMatch =
          shortcut.activationProbeMode === 'opens-target'
            ? targetMatchesText(
                target,
                await page.evaluate(() => document.documentElement?.outerHTML || ''),
              )
            : false;
        const viewportMatch =
          shortcut.activationProbeMode === 'viewport-target'
            ? await isViewportProbeTargetReached(page, target)
            : false;
        const clipboardMatch =
          shortcut.activationProbeMode === 'clipboard-text' ||
          shortcut.actionId === 'shortcutKeyCopyLowest'
            ? await clipboardProbeHasText(page, shortcut)
            : null;
        const domStateMatch =
          shortcut.activationProbeMode === 'dom-state'
            ? target?.targetId === 'codebox-wrap-enabled'
              ? afterSnapshot.codeboxWrapEnabled && afterSnapshot.codeboxWrapSatisfied
              : await isDomStateProbeTargetReached(page, target)
            : false;
        const matchingKeydown = [...(observed.keydowns || [])]
          .reverse()
          .find((event) => event.code === dispatchCode) || null;
        const routed =
          shortcut.activationProbeMode === 'focus-target'
            ? focusMatch
            : shortcut.activationProbeMode === 'opens-target'
              ? openedMatch
              : shortcut.activationProbeMode === 'viewport-target'
                ? viewportMatch
                : shortcut.activationProbeMode === 'clipboard-text'
                  ? clipboardMatch?.matches
                  : shortcut.activationProbeMode === 'dom-state'
                    ? domStateMatch
                    : !!clickMatch;
        const intercepted =
          !routed &&
          matchingKeydown?.isTrusted === true &&
          matchingKeydown.defaultPrevented === true;
        const semantic = evaluateLiveProbeSemantic(
          shortcut,
          target,
          beforeSnapshot,
          afterSnapshot,
          clipboardMatch,
          fileChooserObserved,
        );
        if (target?.targetId === 'codebox-wrap-enabled' && semantic.status === 'pass') {
          let persistenceProof;
          try {
            const storedBeforeReload = await readExtensionSyncStorage(context, extensionId, [
              'codeboxWrapEnabled',
            ]);
            const preferenceMutation = mutationLedger.find(
              (entry) => entry.key === 'codeboxWrapEnabled',
            );
            if (storedBeforeReload.codeboxWrapEnabled === true && preferenceMutation) {
              preferenceMutation.auditValues = [true];
              preferenceMutation.auditPresent = true;
              preferenceMutation.auditValue = true;
              preferenceMutation.restoreAction = 'pending';
              preferenceMutation.status = 'pending';
            }
            checkpoint.mutationLedger = mutationLedger;
            checkpoint.currentCase.phase = 'codebox-persistence-reload-pending';
            checkpoint.currentCase.persistedValueBeforeReload =
              storedBeforeReload.codeboxWrapEnabled === true;
            await persistCheckpoint();

            await page.reload({ waitUntil: 'domcontentloaded' });
            trackAuditOwnedConversation(page.url());
            await waitForAssistantCodeBlockCount(page, 1);
            await page.waitForTimeout(400);
            const reloadedSnapshot = await captureLiveProbeSemanticSnapshot(page, target);
            const storedAfterReload = await readExtensionSyncStorage(context, extensionId, [
              'codeboxWrapEnabled',
            ]);
            persistenceProof = buildCodeboxWrapPersistenceProof(
              storedBeforeReload,
              storedAfterReload,
              reloadedSnapshot,
            );
            checkpoint.currentCase.persistenceProof = persistenceProof;
            checkpoint.currentCase.phase = 'codebox-persistence-verified';
            checkpoint.currentCase.postActionUrl = page.url();
            checkpoint.currentCase.postActionConversationId =
              page.url().match(/\/c\/([^/]+)/)?.[1] || '';
            await persistCheckpoint();
          } catch (error) {
            persistenceProof = {
              status: 'environment-fail',
              proofMethod: 'chrome.storage.sync read plus audit-owned page reload and rendered line geometry',
              reason: error?.message || String(error),
            };
            checkpoint.currentCase.persistenceProof = persistenceProof;
            await persistCheckpoint().catch(() => {});
          }
          semantic.persistenceProof = persistenceProof;
          if (persistenceProof.status !== 'pass') {
            semantic.status = persistenceProof.status;
            semantic.reason = persistenceProof.reason;
          }
        }
        const routingProof = {
          status: routed ? 'observed' : intercepted ? 'intercepted' : 'not-observed',
          proofMethod: intercepted
            ? 'trusted-keydown-default-prevention'
            : 'keyboard-event-path',
          observedTargetRef: routed
            ? shortcut.activationProbeMode === 'focus-target'
              ? shortcut.activationProbeExpectedTargetRef
              : shortcut.activationProbeMode === 'opens-target'
                ? shortcut.activationProbeExpectedTargetRef
                : clickMatch
                  ? shortcut.activationProbeExpectedTargetRef
                  : ''
            : '',
          clickObserved: Boolean(clickMatch),
          keydownObserved: Boolean(matchingKeydown),
          keydownDefaultPrevented: matchingKeydown?.defaultPrevented === true,
          keydown: matchingKeydown
            ? {
                code: matchingKeydown.code,
                altKey: matchingKeydown.altKey,
                ctrlKey: matchingKeydown.ctrlKey,
                metaKey: matchingKeydown.metaKey,
                shiftKey: matchingKeydown.shiftKey,
                altGraph: matchingKeydown.altGraph,
                isTrusted: matchingKeydown.isTrusted,
                defaultPrevented: matchingKeydown.defaultPrevented,
              }
            : null,
        };
        const targetProof = {
          status:
            beforeSnapshot.visibleTarget ||
            afterSnapshot.visibleTarget ||
            Boolean(clickMatch)
              ? 'present'
              : 'not-present',
          proofMethod: 'structural-target-match',
          expectedTargetRef: shortcut.activationProbeExpectedTargetRef || '',
          observedTargetRef:
            beforeSnapshot.visibleTarget || afterSnapshot.visibleTarget || clickMatch
              ? shortcut.activationProbeExpectedTargetRef || ''
              : '',
        };
        const status =
          semantic.status === 'pass'
            ? 'pass'
            : semantic.status === 'fail'
              ? 'fail'
              : semantic.status === 'environment-fail'
                ? 'environment-fail'
                : 'coverage-gap';
        const observedNode = clickMatch || observed.clicks?.[0] || observed.activeElement || {};

        rows.push({
          actionId: shortcut.actionId,
          label: shortcut.label,
          defaultCode: shortcut.defaultCode,
          dispatchCode,
          probeMode: shortcut.activationProbeMode,
          expectedTargetRef: shortcut.activationProbeExpectedTargetRef,
          status,
          reason: semantic.reason || (status === 'pass'
            ? 'Keyboard activation produced the expected semantic postcondition.'
            : `Keyboard routing did not yet have a registered semantic postcondition for ${shortcut.activationProbeExpectedTargetRef}.${extensionStorageWarning ? ` ${extensionStorageWarning}` : ''}`),
          observedSelector: observedNode.selector || '',
          observedTextSnippet: '',
          targetProof,
          routingProof,
          semantic,
          clipboardProof: clipboardMatch
            ? {
                types: clipboardMatch.types,
                hasHtml: clipboardMatch.hasHtml,
                plainTextLength: clipboardMatch.plainTextLength,
                plainTextHash: clipboardMatch.plainTextHash,
              }
            : null,
          beforeSnapshot,
          afterSnapshot,
          durationMs: Date.now() - startedAt,
        });
        checkpoint.completedCases.push({
          rowId: `global:${shortcut.actionId}`,
          actionId: shortcut.actionId,
          status,
          routingStatus: routingProof.status,
          semanticStatus: semantic.status,
          preActionConversationId: checkpoint.currentCase?.preActionConversationId || '',
          postActionConversationId: checkpoint.currentCase?.postActionConversationId || '',
          completedAt: new Date().toISOString(),
        });
        checkpoint.currentCase = null;
        await persistCheckpoint();
        blankConversationReadyFromShortcut =
          shortcut.actionId === NEW_CONVERSATION_ACTION_ID && semantic.status === 'pass';
      } catch (error) {
        blankConversationReadyFromShortcut = false;
        if (checkpoint.currentCase?.actionId === shortcut.actionId) {
          checkpoint.currentCase.phase = 'case-failed';
          checkpoint.currentCase.error = error?.message || String(error);
          checkpoint.currentCase.postActionUrl = page.url();
          checkpoint.currentCase.postActionConversationId =
            page.url().match(/\/c\/([^/]+)/)?.[1] || '';
          trackAuditOwnedConversation(page.url());
          checkpoint.completedCases.push({
            rowId: `global:${shortcut.actionId}`,
            actionId: shortcut.actionId,
            status: 'coverage-gap',
            reason: checkpoint.currentCase.error,
            preActionConversationId: checkpoint.currentCase.preActionConversationId || '',
            postActionConversationId: checkpoint.currentCase.postActionConversationId || '',
            completedAt: new Date().toISOString(),
          });
          checkpoint.currentCase = null;
          await persistCheckpoint().catch(() => {});
        } else {
          checkpoint.completedCases.push({
            rowId: `global:${shortcut.actionId}`,
            actionId: shortcut.actionId,
            status: 'coverage-gap',
            reason: error?.message || String(error),
            completedAt: new Date().toISOString(),
          });
          await persistCheckpoint().catch(() => {});
        }
        rows.push({
          actionId: shortcut.actionId,
          label: shortcut.label,
          defaultCode: shortcut.defaultCode,
          dispatchCode,
          probeMode: shortcut.activationProbeMode,
          expectedTargetRef: shortcut.activationProbeExpectedTargetRef,
          status: 'fail',
          reason: error?.message || String(error) || 'Unknown live probe failure',
          observedSelector: '',
          observedTextSnippet: '',
          targetProof: {
            status: 'not-run',
            proofMethod: 'none',
            expectedTargetRef: shortcut.activationProbeExpectedTargetRef || '',
            observedTargetRef: '',
          },
          routingProof: { status: 'not-observed', proofMethod: 'none', observedTargetRef: '' },
          semantic: {
            status: 'not-run',
            proofMethod: 'none',
            expected: shortcut.activationProbeExpectedTargetRef || shortcut.notes || '',
            observed: '',
            reason: error?.message || String(error) || 'Probe did not reach semantic evaluation.',
          },
          durationMs: Date.now() - startedAt,
        });
      } finally {
        page.off('filechooser', fileChooserListener);
        await cleanupLiveProbeObserver(page);
        await closeOpenMenus(page).catch(() => {});
      }
    }
    if (fixedContractsToRun.length) {
      const fixedProbeRows = await runFixedShortcutContractProbes({
        page,
        context,
        inventory,
        contracts: fixedContractsToRun,
        targetById,
        globalRows: rows,
        fixtureUrl,
        activeShortcutCodes,
        extensionId,
        originalActiveShortcutCodes,
        mutationLedger,
        checkpoint,
        persistCheckpoint,
        trackAuditOwnedConversation,
        fixedContractIds: [...fixedContractIds],
      });
      fixedRows.push(...fixedProbeRows);
    }
  } catch (error) {
    const failureReason = error?.message || String(error) || 'Live shortcut audit setup failed.';
    checkpoint.preflightError ||= failureReason;
    checkpoint.status = 'preflight-failed';
    for (const shortcut of orderedShortcuts) {
      if (rows.some((row) => row.actionId === shortcut.actionId)) continue;
      const dispatchCode = resolveShortcutDispatchCode(shortcut, activeShortcutCodes);
      const row = EXECUTABLE_LIVE_PROBE_MODES.includes(shortcut.activationProbeMode) && shortcut.activationProbeSafe
        ? buildSkippedLiveProbeRow(shortcut, 'environment-fail', failureReason, dispatchCode)
        : buildNonExecutableLiveProbeRow(shortcut, dispatchCode);
      rows.push(row);
      checkpoint.completedCases.push({
        rowId: `global:${shortcut.actionId}`,
        actionId: shortcut.actionId,
        status: row.status,
        reason: row.reason,
        completedAt: new Date().toISOString(),
      });
    }
    for (const contract of fixedContractsToRun) {
      if (fixedRows.some((row) => row.contractId === contract.contractId)) continue;
      fixedRows.push(buildFixedContractLiveRow(
        contract,
        fixedSemantic(
          'environment-fail',
          'audit-setup-failure',
          contract.classification,
          '',
          failureReason,
        ),
      ));
    }
    await persistCheckpoint().catch(() => {});
  } finally {
    if (extensionId && mutationLedger.length > 0) {
      checkpoint.status = 'recovering-storage';
      await persistCheckpoint().catch(() => {});
      storageRecovery = await recoverTemporaryShortcutAssignments({
        context,
        extensionId,
        originalActiveShortcutCodes,
        temporaryShortcutAssignments,
        mutationLedger,
        onRecoveryUpdate: async ({ stage, plan, report }) => {
          checkpoint.recoveryCheckpointStage = stage;
          if (plan) checkpoint.storageRecoveryPlan = plan;
          if (report) checkpoint.storageRecoveryStatus = report.status;
          await persistCheckpoint();
        },
      });
    } else {
      storageRecovery = buildStorageRecoveryReport({
        status: extensionId ? 'not-needed' : 'environment-fail',
        reason: extensionId
          ? 'No validation-only shortcut assignments were written.'
          : extensionStorageWarning || 'Extension storage was not reachable.',
      });
    }
    checkpoint.storageRecoveryStatus = storageRecovery.status;
    if (checkpoint.mutationIntent) {
      checkpoint.mutationIntent.status =
        storageRecovery.status === 'clean' || storageRecovery.status === 'not-needed'
          ? 'restored'
          : storageRecovery.status;
    }
  }

  clipboardRecovery = await restoreClipboardAfterProbe(page, codeboxProbeSession);
  checkpoint.clipboardRecoveryStatus = clipboardRecovery.status;
  checkpoint.clipboardRecovery = clipboardRecovery;
  await persistCheckpoint().catch(() => {});

  let fixtureRecoveryError = '';
  try {
    await resetFixturePage(page, fixtureUrl);
  } catch (error) {
    fixtureRecoveryError = error?.message || String(error);
  }
  checkpoint.finalBrowserState = {
    url: page.url(),
    fixtureRestored: page.url() === fixtureUrl,
    error: fixtureRecoveryError,
  };
  checkpoint.completedAt = new Date().toISOString();
  checkpoint.status = checkpoint.checkpointWriteError
    ? 'checkpoint-write-failed'
    : fixtureRecoveryError
      ? 'browser-recovery-failed'
      : storageRecovery.status === 'conflict' || storageRecovery.status === 'failed'
        ? 'recovery-blocked'
        : checkpoint.preflightError
          ? 'preflight-failed'
          : 'completed';
  await persistCheckpoint().catch(() => {});
  const checkpointPath = checkpoint.checkpointPath || '';
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fixtureUrl,
    fixtureOwnership,
    phase,
    rows,
    fixedRows,
    summary: {
      ...buildLiveProbeSummary(rows),
      total: rows.length + fixedRows.length,
      fixedTotal: fixedRows.length,
      fixedPassed: fixedRows.filter((row) => row.status === 'pass').length,
      fixedCoverageGaps: fixedRows.filter((row) => row.status === 'coverage-gap').length,
    },
    storageRecovery,
    clipboardRecovery,
    checkpoint: {
      status: checkpoint.status,
      path: checkpointPath,
      currentCase: checkpoint.currentCase,
      completedCaseCount: checkpoint.completedCases.length,
      auditOwnedConversationIds: checkpoint.auditOwnedConversationIds,
      fixtureRestored: checkpoint.finalBrowserState.fixtureRestored,
      clipboardRecoveryStatus: checkpoint.clipboardRecoveryStatus,
      checkpointWriteError: checkpoint.checkpointWriteError,
    },
  };
}

export async function writeLiveProbeReport(folderPath, liveProbeReport) {
  const reportPath = path.join(folderPath, LIVE_PROBE_REPORT_FILENAME);
  await writeFile(reportPath, `${JSON.stringify(liveProbeReport, null, 2)}\n`, 'utf8');
  return reportPath;
}

async function persistShortcutAuditCheckpoint(folderPath, checkpoint) {
  if (!folderPath) return '';
  const checkpointPath = path.join(folderPath, AUDIT_ARTIFACT_FILENAMES.checkpoint);
  await writeFile(
    checkpointPath,
    `${JSON.stringify({ ...checkpoint, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
  return checkpointPath;
}

function fingerprintAuditValue(value) {
  const serialized = JSON.stringify(value ?? null);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = Math.imul(hash ^ serialized.charCodeAt(index), 16777619);
  }
  return `${serialized.length}:${(hash >>> 0).toString(16)}`;
}

export async function createUniqueRunDirectory(preferredName) {
  await ensureInspectorCapturesRoot();
  let candidateName = preferredName;
  let suffix = 0;
  for (;;) {
    const candidatePath = path.join(inspectorCapturesRoot, candidateName);
    try {
      await access(candidatePath);
      suffix += 1;
      candidateName = `${preferredName}_${String(suffix).padStart(2, '0')}`;
    } catch {
      await mkdir(candidatePath, { recursive: true });
      return { name: candidateName, path: candidatePath };
    }
  }
}

export async function writeScrapeRun({ scrapeResult, normalizedArtifacts }) {
  const { exports } = await loadDevScrapeWideContract();
  const runDirectory = await createUniqueRunDirectory(exports.buildRunFolderName(new Date()));
  const normalizedByFilename = new Map(
    normalizedArtifacts.map((artifact) => [artifact.filename, artifact.normalizedHtml]),
  );

  const writtenFiles = [];
  for (const artifact of scrapeResult.artifacts || []) {
    if (artifact.status !== 'captured' && artifact.status !== 'alias') continue;
    const normalizedHtml = normalizedByFilename.get(artifact.filename);
    if (!normalizedHtml) {
      throw new Error(`Missing normalized HTML for ${artifact.filename}`);
    }
    await writeFile(path.join(runDirectory.path, artifact.filename), normalizedHtml, 'utf8');
    writtenFiles.push(artifact.filename);
  }

  const manifestArtifacts = (scrapeResult.artifacts || []).map((artifact) => ({
    filename: artifact.filename,
    stateId: artifact.stateId,
    label: artifact.label,
    status: artifact.status,
    error: artifact.error || null,
    aliasOf: artifact.aliasOf || null,
    captureBytes:
      typeof artifact.captureBytes === 'number'
        ? artifact.captureBytes
        : normalizedByFilename.get(artifact.filename)?.length || 0,
    clickPath: Array.isArray(artifact.clickPath) ? artifact.clickPath : [],
  }));

  const manifest = {
    schemaVersion: 1,
    runKind: scrapeResult.runKind || 'devscrapewide',
    folderName: runDirectory.name,
    fixtureUrl: scrapeResult.fixtureUrl || exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
    fixtureOwnership: scrapeResult.fixtureOwnership || null,
    pageInfo: scrapeResult.pageInfo || null,
    startedAt: scrapeResult.startedAt || new Date().toISOString(),
    completedAt: scrapeResult.completedAt || new Date().toISOString(),
    capturedCount: Number(scrapeResult.capturedCount || 0),
    failedCount: Number(scrapeResult.failedCount || 0),
    deferredCount: Number(scrapeResult.deferredCount || 0),
    writtenFiles,
    artifacts: manifestArtifacts,
  };

  await writeFile(
    path.join(runDirectory.path, 'run-manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );

  return {
    folderName: runDirectory.name,
    folderPath: runDirectory.path,
    capturedCount: manifest.capturedCount,
    failedCount: manifest.failedCount,
    deferredCount: manifest.deferredCount,
    writtenFiles,
    manifest,
  };
}

export async function writeInventoryOnlyShortcutAuditRun({
  phase = 'all',
  reason = '',
  runMode = 'inventory-only',
  onlyActionIds = [],
  fixedContractIds = [],
  modelProfile = '',
  modelSlot = null,
  modelActionId = '',
} = {}) {
  const { exports } = await loadDevScrapeWideContract();
  await ensureInspectorCapturesRoot();
  const startedAt = new Date().toISOString();
  const runDirectory = await createUniqueRunDirectory(exports.buildRunFolderName(new Date()));
  const scrapeStateRegistry = [
    ...(exports.DUMP_REGISTRY || []),
    ...(exports.DEFERRED_ARTIFACTS || []),
  ];
  const inventory = await buildCurrentShortcutInventory(scrapeStateRegistry);
  const manifest = {
    schemaVersion: 2,
    runKind: 'shortcut-audit',
    mode: runMode,
    auditPhase: phase,
    folderName: runDirectory.name,
    fixtureUrl: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
    pageInfo: null,
    startedAt,
    completedAt: new Date().toISOString(),
    capturedCount: 0,
    failedCount: 0,
    deferredCount: 0,
    writtenFiles: [],
    artifacts: scrapeStateRegistry.map((definition) => ({
      filename: definition.filename,
      stateId: definition.stateId,
      label: definition.label,
      status: 'not-run',
      error: reason || 'Inventory-only run did not attach to a browser.',
      aliasOf: definition.aliasOf || null,
      captureBytes: 0,
      clickPath: Array.isArray(definition.steps)
        ? definition.steps.map((step) => step.label)
        : [],
    })),
  };
  await writeFile(
    path.join(runDirectory.path, 'run-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  const recoveryReport = buildStorageRecoveryReport({
    status: 'not-run',
    reason: reason || 'No browser or extension storage mutation occurred in inventory-only mode.',
  });
  const liveProbeReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fixtureUrl: manifest.fixtureUrl,
    runStatus: 'not-run',
    phase,
    rows: [],
    summary: {
      runStatus: 'not-run',
      total: 0,
      executable: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      environmentFailed: 0,
      manual: 0,
      notApplicable: 0,
      notLiveProbed: 0,
    },
    storageRecovery: recoveryReport,
  };
  await writeLiveProbeReport(runDirectory.path, liveProbeReport);
  const auditReport = buildShortcutAuditReport({
    inventory,
    liveProbeReport: null,
    phase,
    onlyActionIds,
    fixedContractIds,
    modelProfile,
    modelSlot,
    modelActionId,
    runMode,
    runFolderName: runDirectory.name,
    runFolderPath: runDirectory.path,
    recoveryStatus: recoveryReport.status,
  });
  const artifactResult = await writeShortcutAuditArtifacts(
    runDirectory.path,
    auditReport,
    recoveryReport,
  );
  const checkReport = await buildCheckReport({ folderName: runDirectory.name });
  checkReport.auditArtifacts = Object.fromEntries(
    Object.entries(artifactResult.paths)
      .filter(([key]) => key.endsWith('Path'))
      .map(([key, value]) => [key, value]),
  );
  checkReport.storageRecovery = recoveryReport;
  checkReport.auditPhase = phase;
  checkReport.inventoryOnly = true;
  const checkReportFiles = await writeCheckReportFiles(checkReport);
  return {
    folderName: runDirectory.name,
    folderPath: runDirectory.path,
    manifest,
    inventory,
    auditReport: artifactResult.report,
    recoveryReport,
    checkReport,
    checkReportFiles,
    artifactPaths: artifactResult.paths,
  };
}

function buildRunSortKey(date, suffix = 0) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${String(date.getTime()).padStart(16, '0')}_${String(Math.max(0, suffix)).padStart(4, '0')}`;
}

function parseRunFolderSortKey(name) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_devscrapewide_c-69ea4723(?:([_-])(\d+))?$/.exec(
      String(name || ''),
    );
  if (!match) return '';
  return buildRunSortKey(
    new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    ),
    Number.parseInt(match[8] || '0', 10),
  );
}

function parseManifestSortKey(manifest) {
  const stamp = manifest?.completedAt || manifest?.startedAt;
  if (!stamp) return '';
  return buildRunSortKey(new Date(stamp));
}

async function loadRunManifest(folderPath) {
  const manifestPath = path.join(folderPath, 'run-manifest.json');
  const manifestText = await readFile(manifestPath, 'utf8');
  return JSON.parse(manifestText);
}

async function buildLegacyManifestFromFiles(folderName, folderPath, exports) {
  const entries = await readdir(folderPath, { withFileTypes: true });
  const fileNames = new Set(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
      .map((entry) => entry.name),
  );

  const artifacts = [
    ...exports.DUMP_REGISTRY.map((definition) => {
      if (definition.aliasOf) {
        return {
          filename: definition.filename,
          stateId: definition.stateId,
          label: definition.label,
          status: fileNames.has(definition.filename) ? 'alias' : 'failed',
          error: fileNames.has(definition.filename) ? null : `Alias file ${definition.filename} is missing`,
          aliasOf: definition.aliasOf || null,
          captureBytes: 0,
          clickPath: Array.isArray(definition.steps) ? definition.steps.map((step) => step.label) : [],
        };
      }
      return {
        filename: definition.filename,
        stateId: definition.stateId,
        label: definition.label,
        status: fileNames.has(definition.filename) ? 'captured' : 'failed',
        error: fileNames.has(definition.filename) ? null : `Legacy scrape folder is missing ${definition.filename}`,
        aliasOf: null,
        captureBytes: 0,
        clickPath: Array.isArray(definition.steps) ? definition.steps.map((step) => step.label) : [],
      };
    }),
    ...exports.DEFERRED_ARTIFACTS.map((artifact) => ({
      filename: artifact.filename,
      stateId: artifact.stateId,
      label: artifact.label,
      status: fileNames.has(artifact.filename) ? 'captured' : artifact.status,
      error: null,
      aliasOf: null,
      captureBytes: 0,
      clickPath: [],
    })),
  ];

  return {
    schemaVersion: 1,
    runKind: 'devscrapewide',
    folderName,
    fixtureUrl: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
    pageInfo: null,
    startedAt: null,
    completedAt: null,
    capturedCount: artifacts.filter((artifact) => artifact.status === 'captured' || artifact.status === 'alias')
      .length,
    failedCount: artifacts.filter((artifact) => artifact.status === 'failed').length,
    deferredCount: artifacts.filter((artifact) => artifact.status === 'deferred').length,
    writtenFiles: [...fileNames].sort(),
    artifacts,
    legacyFolder: true,
  };
}

export async function getLatestRunFolder() {
  await ensureInspectorCapturesRoot();
  const entries = await readdir(inspectorCapturesRoot, { withFileTypes: true });
  const directories = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const folderPath = path.join(inspectorCapturesRoot, entry.name);
        const folderSortKey = parseRunFolderSortKey(entry.name);
        if (folderSortKey) {
          try {
            const manifest = await loadRunManifest(folderPath);
            if (manifest?.runKind === 'shortcut-audit') return null;
          } catch {
            // Older scrape folders do not have a manifest; keep their legacy sort behavior.
          }
          return { name: entry.name, path: folderPath, sortKey: folderSortKey };
        }
        try {
          const manifest = await loadRunManifest(folderPath);
          if (manifest?.runKind === 'shortcut-audit') return null;
          const sortKey = parseManifestSortKey(manifest);
          return sortKey ? { name: entry.name, path: folderPath, sortKey } : null;
        } catch {
          return null;
        }
      }),
  );
  const sortableDirectories = directories.filter(Boolean).sort((left, right) =>
    left.sortKey.localeCompare(right.sortKey),
  );
  return sortableDirectories[sortableDirectories.length - 1] || null;
}

async function getSortedRunFolders() {
  await ensureInspectorCapturesRoot();
  const entries = await readdir(inspectorCapturesRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.join(inspectorCapturesRoot, entry.name),
      sortKey: parseRunFolderSortKey(entry.name),
    }))
    .filter((entry) => entry.sortKey)
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey));
}

export async function getNamedRunFolder(folderName) {
  const normalized = String(folderName || '').trim();
  if (!normalized) return null;
  const folderPath = path.join(inspectorCapturesRoot, normalized);
  try {
    const stats = await stat(folderPath);
    return stats.isDirectory() ? { name: normalized, path: folderPath } : null;
  } catch {
    return null;
  }
}

export async function loadRunDirectory(folderName = null) {
  const { exports } = await loadDevScrapeWideContract();
  const target = folderName ? await getNamedRunFolder(folderName) : await getLatestRunFolder();
  if (!target) {
    throw new Error(
      folderName
        ? `Could not find scrape folder ${folderName}`
        : 'No DevScrapeWide capture folders were found',
    );
  }
  const entries = await readdir(target.path, { withFileTypes: true });
  const textEntries = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'));
  let manifest = null;
  try {
    manifest = await loadRunManifest(target.path);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    manifest = await buildLegacyManifestFromFiles(target.name, target.path, exports);
  }
  const files = Object.fromEntries(
    await Promise.all(
      textEntries.map(async (entry) => [
        entry.name,
        await readFile(path.join(target.path, entry.name), 'utf8'),
      ]),
    ),
  );
  let liveProbeReport = null;
  try {
    liveProbeReport = JSON.parse(
      await readFile(path.join(target.path, LIVE_PROBE_REPORT_FILENAME), 'utf8'),
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return {
    folderName: target.name,
    folderPath: target.path,
    manifest,
    files,
    liveProbeReport,
  };
}

function targetMatchesText(target, text) {
  const haystack = String(text || '');
  const matchGroups = Array.isArray(target?.matchGroups) ? target.matchGroups : [];
  return matchGroups.some((group) => {
    const needles = Array.isArray(group) ? group : [group];
    const requiredNeedles = needles.filter(Boolean);
    return (
      requiredNeedles.length > 0 &&
      requiredNeedles.every((needle) => haystack.includes(String(needle)))
    );
  });
}

export async function buildCurrentShortcutInventory(scrapeStateRegistry) {
  const [
    contentSource,
    settingsSchemaSource,
    localeMessages,
    optionsStorageSource,
    modelPickerLabelsSource,
  ] = await Promise.all([
    readCurrentRuntimeSource(),
    readSettingsSchemaSource(),
    readEnglishLocaleMessages(),
    readFile(optionsStorageSourcePath, 'utf8'),
    readFile(modelPickerLabelsSourcePath, 'utf8'),
  ]);
  return buildShortcutValidationInventory({
    contentSource,
    settingsSchema: parseSettingsSchemaSource(settingsSchemaSource),
    localeMessages,
    scrapeStateRegistry,
    optionsDefaults: parseOptionsDefaultsFromSource(optionsStorageSource),
    modelLabels: parseModelPickerLabelsSource(modelPickerLabelsSource),
  });
}

function buildInventoryOnlyCheckReport({ exports, run, sortedRunFolders, inventory }) {
  const inventoryOnly = ['inventory-only', 'environment-fail'].includes(run?.manifest?.mode);
  const runMode = run?.manifest?.mode || 'inventory-only';
  const targetRows = (inventory.targets || []).map((target) => ({
    targetId: target.targetId,
    identifier: target.identifier,
    canonicalIdentifier: target.identifier,
    kind: target.kind,
    usedByActionIds: target.usedByActionIds,
    expectedUiStateRefs: target.expectedUiStateRefs || [],
    expectedFiles: target.expectedFiles || [],
    matchGroups: target.matchGroups || [],
    matchedExpectedFiles: [],
    allMatchedFiles: [],
    missingExpectedFiles: [],
    unknownUiStateRefs: target.unknownUiStateRefs || [],
    missingMatchGroups: target.missingMatchGroups || false,
    status: 'not-run',
    statusReason: 'Inventory-only run; no browser scrape dumps were captured.',
    notes: target.notes || '',
  }));
  const shortcutRows = (inventory.shortcuts || []).map((shortcut) => {
    const sourceIssues = (inventory.inventoryIssues || [])
      .filter((issue) => issue.actionId === shortcut.actionId)
      .map((issue) => issue.message || issue.type || 'Inventory issue');
    const status = sourceIssues.length
      ? 'fail'
      : runMode === 'environment-fail'
        ? 'environment-fail'
        : 'not-run';
    return {
      actionId: shortcut.actionId,
      label: shortcut.label,
      labelKey: shortcut.labelKey,
      sectionHeader: shortcut.sectionHeader,
      defaultCode: shortcut.defaultCode,
      validationMode: shortcut.validationMode,
      targetIds: shortcut.targetIds,
      targetRefs: shortcut.targetRefs || shortcut.targetIds,
      requiredUiStateRefs: shortcut.requiredUiStateRefs || [],
      requiredFiles: shortcut.requiredFiles || [],
      unknownTargetRefs: shortcut.unknownTargetRefs || [],
      unknownUiStateRefs: shortcut.unknownUiStateRefs || [],
      activationProbe: shortcut.activationProbe || null,
      activationProbeMode: shortcut.activationProbeMode || '',
      activationProbeExpectedTargetRef: shortcut.activationProbeExpectedTargetRef || '',
      activationProbeUiStateRefs: shortcut.activationProbeUiStateRefs || [],
      activationProbeSetup: shortcut.activationProbeSetup || '',
      activationProbeUrl: shortcut.activationProbeUrl || '',
      activationProbeRequiredFiles: shortcut.activationProbeRequiredFiles || [],
      activationProbeSafe: shortcut.activationProbeSafe === true,
      unknownActivationProbeUiStateRefs: shortcut.unknownActivationProbeUiStateRefs || [],
      targetStatuses: [],
      handlerRef: shortcut.handlerRef || '',
      handlerPresent: shortcut.handlerPresent,
      defaultPresent: shortcut.defaultPresent,
      missingMetadata: shortcut.missingMetadata || false,
      status,
      statusReason:
        sourceIssues.join('; ') ||
        (runMode === 'environment-fail'
          ? run?.manifest?.artifacts?.find((artifact) => artifact.error)?.error ||
            'Browser audit could not start.'
          : 'Live activation and scrape coverage were not run in this phase.'),
      notes: shortcut.notes || '',
    };
  });
  const liveProbeRows = Array.isArray(run.liveProbeReport?.rows)
    ? run.liveProbeReport.rows
    : [];
  const shortcutSummary = {
    total: shortcutRows.length,
    passed: shortcutRows.filter((row) => row.status === 'pass').length,
    failed: shortcutRows.filter((row) => row.status === 'fail').length,
    partial: 0,
    manual: 0,
    notApplicable: shortcutRows.filter((row) => row.validationMode === 'not-applicable').length,
    notRun: shortcutRows.filter((row) => row.status === 'not-run').length,
    environmentFailed: shortcutRows.filter((row) => row.status === 'environment-fail').length,
  };
  const targetSummary = {
    total: targetRows.length,
    passed: 0,
    failed: 0,
    noScrapeCoverage: targetRows.length,
    notRun: targetRows.length,
  };
  const sortedCurrentIndex = sortedRunFolders.findIndex((item) => item.name === run.folderName);
  const latestRun = sortedRunFolders[sortedRunFolders.length - 1] || null;
  const previousReportLinks = sortedRunFolders
    .slice(0, sortedCurrentIndex >= 0 ? sortedCurrentIndex : sortedRunFolders.length)
    .slice(-5)
    .reverse()
    .map((item) => ({
      folderName: item.name,
      folderPath: item.path,
      sortKey: item.sortKey,
      htmlPath: path.join(item.path, 'check-report.html'),
    }));
  return {
    schemaVersion: 4,
    generatedAt: new Date().toISOString(),
    fixtureUrl: run?.manifest?.fixtureUrl || exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
    folderName: run.folderName,
    folderPath: run.folderPath,
    runManifest: run.manifest,
    reportHistory: {
      latest:
        latestRun && latestRun.name !== run.folderName
          ? {
              folderName: latestRun.name,
              folderPath: latestRun.path,
              sortKey: latestRun.sortKey,
              htmlPath: path.join(latestRun.path, 'check-report.html'),
            }
          : null,
      previous: previousReportLinks,
    },
    rows: targetRows,
    shortcutRows,
    targetRows,
    liveProbeRows,
    failingShortcutRows: shortcutRows.filter((row) => row.status === 'fail'),
    partialShortcutRows: [],
    manualShortcutRows: [],
    needsCoverageShortcutRows: [],
    inventoryIssues: inventory.inventoryIssues || [],
    missingArtifacts: [],
    missingExpectedFiles: [],
    inventoryOnly,
    runMode,
    fixedKeyboardContracts: inventory.fixedKeyboardContracts || [],
    modelPickerProfiles: inventory.modelPickerProfiles || {},
    modelPickerSlotRows: inventory.modelPickerSlotRows || [],
    summary: {
      total: shortcutRows.length,
      passed: shortcutSummary.passed,
      failed: shortcutSummary.failed,
      partial: 0,
      manual: 0,
      notApplicable: shortcutSummary.notApplicable,
      shortcuts: shortcutSummary,
      targets: targetSummary,
      liveProbes: run.liveProbeReport?.summary || {
        runStatus: 'not-run',
        total: 0,
        executable: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        environmentFailed: 0,
        manual: 0,
        notApplicable: 0,
        notLiveProbed: 0,
      },
    },
  };
}

export async function buildCheckReport({ folderName = null } = {}) {
  const [{ exports }, run, sortedRunFolders] = await Promise.all([
    loadDevScrapeWideContract(),
    loadRunDirectory(folderName),
    getSortedRunFolders(),
  ]);
  const scrapeStateRegistry = [
    ...(exports.DUMP_REGISTRY || []),
    ...(exports.DEFERRED_ARTIFACTS || []),
  ];
  const inventory = await buildCurrentShortcutInventory(scrapeStateRegistry);

  if (['inventory-only', 'environment-fail'].includes(run.manifest?.mode)) {
    return buildInventoryOnlyCheckReport({ exports, run, sortedRunFolders, inventory });
  }

  const missingArtifacts = (run.manifest.artifacts || [])
    .filter((artifact) => artifact.status === 'failed')
    .map((artifact) => ({
      filename: artifact.filename,
      reason: artifact.error || 'Capture failed',
    }));

  const targetRows = inventory.targets.map((target) => {
    const allMatchedFiles = Object.entries(run.files)
      .filter(([, text]) => targetMatchesText(target, text))
      .map(([fileName]) => fileName)
      .sort();
    const expectedFiles = Array.isArray(target.expectedFiles) ? target.expectedFiles : [];
    const missingExpectedFiles = expectedFiles.filter(
      (fileName) => !Object.hasOwn(run.files, fileName),
    );
    const matchedExpectedFiles = expectedFiles.filter((fileName) =>
      targetMatchesText(target, run.files[fileName]),
    );
    const hasMatchGroups = Array.isArray(target.matchGroups) && target.matchGroups.length > 0;
    let status = 'pass';
    let statusReason = 'Target matched at least one expected scrape dump.';

    if ((target.unknownUiStateRefs || []).length > 0) {
      status = 'fail';
      statusReason = `Target references unknown scrape state(s): ${target.unknownUiStateRefs.join(', ')}`;
    } else if (target.missingMatchGroups) {
      status = 'fail';
      statusReason = 'Target has scrape state coverage but no deterministic match group.';
    } else if (!expectedFiles.length || !hasMatchGroups) {
      status = 'no-scrape-coverage';
      statusReason =
        target.notes ||
        'The target is known, but the current scrape family does not capture a deterministic dump for it yet.';
    } else if (missingExpectedFiles.length > 0) {
      status = 'fail';
      statusReason = `Expected dump files were missing: ${missingExpectedFiles.join(', ')}`;
    } else if (!matchedExpectedFiles.length) {
      status = 'fail';
      statusReason = 'Target was not found in any expected scrape dump.';
    }

    return {
      targetId: target.targetId,
      identifier: target.identifier,
      canonicalIdentifier: target.identifier,
      kind: target.kind,
      usedByActionIds: target.usedByActionIds,
      expectedUiStateRefs: target.expectedUiStateRefs || [],
      expectedFiles,
      matchGroups: target.matchGroups || [],
      matchedExpectedFiles,
      allMatchedFiles,
      missingExpectedFiles,
      unknownUiStateRefs: target.unknownUiStateRefs || [],
      missingMatchGroups: target.missingMatchGroups || false,
      status,
      statusReason,
      notes: target.notes || '',
    };
  });
  const targetRowById = Object.fromEntries(targetRows.map((row) => [row.targetId, row]));
  const missingExpectedFiles = targetRows.flatMap((row) =>
    row.missingExpectedFiles.map((fileName) => ({
      identifier: row.identifier,
      filename: fileName,
    })),
  );
  const liveProbeRows = Array.isArray(run.liveProbeReport?.rows) ? run.liveProbeReport.rows : [];
  const livePassedActionIds = new Set(
    liveProbeRows.filter((row) => row.status === 'pass').map((row) => row.actionId),
  );

  const shortcutRows = inventory.shortcuts.map((shortcut) => {
    const targetRowsForShortcut = shortcut.targetIds.map((targetId) => targetRowById[targetId]).filter(Boolean);
    const targetStatuses = targetRowsForShortcut.map((row) => row.status);
    const sourceIssues = [];
    if (shortcut.missingMetadata) {
      sourceIssues.push('missing explicit validation metadata');
    }
    if ((shortcut.unknownTargetRefs || []).length > 0) {
      sourceIssues.push(`unknown target ref(s): ${shortcut.unknownTargetRefs.join(', ')}`);
    }
    if ((shortcut.unknownUiStateRefs || []).length > 0) {
      sourceIssues.push(`unknown scrape state ref(s): ${shortcut.unknownUiStateRefs.join(', ')}`);
    }
    if ((shortcut.unknownActivationProbeUiStateRefs || []).length > 0) {
      sourceIssues.push(
        `unknown activation probe scrape state ref(s): ${shortcut.unknownActivationProbeUiStateRefs.join(', ')}`,
      );
    }
    if (shortcut.requiresHandler && !shortcut.handlerPresent) {
      sourceIssues.push('missing runtime handler');
    }
    if (shortcut.requiresDefault && !shortcut.defaultPresent) {
      sourceIssues.push('missing default shortcut code');
    }

    let status = 'pass';
    let statusReason = 'All declared targets matched the expected scrape dumps.';
    if (sourceIssues.length) {
      status = 'fail';
      statusReason = sourceIssues.join('; ');
    } else if (shortcut.validationMode === 'not-applicable') {
      status = 'not-applicable';
      statusReason = shortcut.notes || 'This shortcut does not rely on a deterministic ChatGPT click target.';
    } else if (shortcut.validationMode === 'manual-only') {
      status = 'manual';
      statusReason =
        shortcut.notes || 'This shortcut needs manual or behavioral verification outside the scrape-only validator.';
    } else if (!targetRowsForShortcut.length) {
      status = 'partial';
      statusReason = 'The shortcut is classified for scrape validation but has no target rows yet.';
    } else if (targetStatuses.includes('fail')) {
      status = 'fail';
      statusReason = targetRowsForShortcut
        .filter((row) => row.status === 'fail')
        .map((row) => `${row.targetId}: ${row.statusReason}`)
        .join(' | ');
    } else if (targetStatuses.includes('no-scrape-coverage')) {
      status = 'partial';
      statusReason = targetRowsForShortcut
        .filter((row) => row.status === 'no-scrape-coverage')
        .map((row) => `${row.targetId}: ${row.statusReason}`)
        .join(' | ');
      if (livePassedActionIds.has(shortcut.actionId)) {
        status = 'pass';
        statusReason =
          'Setup-only target coverage was validated by a passing live activation probe.';
      }
    }

    return {
      actionId: shortcut.actionId,
      label: shortcut.label,
      labelKey: shortcut.labelKey,
      sectionHeader: shortcut.sectionHeader,
      defaultCode: shortcut.defaultCode,
      validationMode: shortcut.validationMode,
      targetIds: shortcut.targetIds,
      targetRefs: shortcut.targetRefs || shortcut.targetIds,
      requiredUiStateRefs: shortcut.requiredUiStateRefs || [],
      requiredFiles: shortcut.requiredFiles || [],
      unknownTargetRefs: shortcut.unknownTargetRefs || [],
      unknownUiStateRefs: shortcut.unknownUiStateRefs || [],
      activationProbe: shortcut.activationProbe || null,
      activationProbeMode: shortcut.activationProbeMode || '',
      activationProbeExpectedTargetRef: shortcut.activationProbeExpectedTargetRef || '',
      activationProbeUiStateRefs: shortcut.activationProbeUiStateRefs || [],
      activationProbeSetup: shortcut.activationProbeSetup || '',
      activationProbeUrl: shortcut.activationProbeUrl || '',
      activationProbeRequiredFiles: shortcut.activationProbeRequiredFiles || [],
      activationProbeSafe: shortcut.activationProbeSafe === true,
      unknownActivationProbeUiStateRefs: shortcut.unknownActivationProbeUiStateRefs || [],
      targetStatuses,
      handlerRef: shortcut.handlerRef || '',
      handlerPresent: shortcut.handlerPresent,
      defaultPresent: shortcut.defaultPresent,
      missingMetadata: shortcut.missingMetadata || false,
      status,
      statusReason,
      notes: shortcut.notes || '',
    };
  });

  const shortcutSummary = {
    total: shortcutRows.length,
    passed: shortcutRows.filter((row) => row.status === 'pass').length,
    failed: shortcutRows.filter((row) => row.status === 'fail').length,
    partial: shortcutRows.filter((row) => row.status === 'partial').length,
    manual: shortcutRows.filter((row) => row.status === 'manual').length,
    notApplicable: shortcutRows.filter((row) => row.status === 'not-applicable').length,
  };

  const targetSummary = {
    total: targetRows.length,
    passed: targetRows.filter((row) => row.status === 'pass').length,
    failed: targetRows.filter((row) => row.status === 'fail').length,
    noScrapeCoverage: targetRows.filter((row) => row.status === 'no-scrape-coverage').length,
  };

  const failingShortcutRows = shortcutRows.filter((row) => row.status === 'fail');
  const partialShortcutRows = shortcutRows.filter(
    (row) => row.status === 'partial' && !livePassedActionIds.has(row.actionId),
  );
  const manualShortcutRows = shortcutRows.filter((row) => row.status === 'manual');
  const needsCoverageShortcutRows = shortcutRows.filter((row) =>
    ['partial', 'manual'].includes(row.status) && !livePassedActionIds.has(row.actionId),
  );
  const liveProbeSummary =
    run.liveProbeReport?.summary || buildLiveProbeSummary([], 'not-run');
  const currentRunIndex = sortedRunFolders.findIndex((item) => item.name === run.folderName);
  const latestRun = sortedRunFolders[sortedRunFolders.length - 1] || null;
  const previousReportLinks = sortedRunFolders
    .slice(0, currentRunIndex >= 0 ? currentRunIndex : sortedRunFolders.length)
    .slice(-5)
    .reverse()
    .map((item) => ({
      folderName: item.name,
      folderPath: item.path,
      sortKey: item.sortKey,
      htmlPath: path.join(item.path, 'check-report.html'),
    }));
  const summary = {
    total: shortcutSummary.total,
    passed: shortcutSummary.passed,
    failed: shortcutSummary.failed,
    partial: shortcutSummary.partial,
    manual: shortcutSummary.manual,
    notApplicable: shortcutSummary.notApplicable,
    shortcuts: shortcutSummary,
    targets: targetSummary,
    liveProbes: liveProbeSummary,
  };

  return {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    fixtureUrl: run?.manifest?.fixtureUrl || exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
    folderName: run.folderName,
    folderPath: run.folderPath,
    runManifest: run.manifest,
    reportHistory: {
      latest:
        latestRun && latestRun.name !== run.folderName
          ? {
              folderName: latestRun.name,
              folderPath: latestRun.path,
              sortKey: latestRun.sortKey,
              htmlPath: path.join(latestRun.path, 'check-report.html'),
            }
          : null,
      previous: previousReportLinks,
    },
    rows: targetRows,
    shortcutRows,
    targetRows,
    liveProbeRows,
    failingShortcutRows,
    partialShortcutRows,
    manualShortcutRows,
    needsCoverageShortcutRows,
    inventoryIssues: inventory.inventoryIssues,
    missingArtifacts,
    missingExpectedFiles,
    summary,
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function folderPathLinkHtml(folderPath) {
  if (!folderPath) return '<span class="mono">(unknown)</span>';
  const href = pathToFileURL(folderPath.endsWith(path.sep) ? folderPath : `${folderPath}${path.sep}`).href;
  return `<a class="mono" href="${escapeHtml(href)}" title="Open local scrape folder">${escapeHtml(folderPath)}</a>`;
}

function localDateTimeText(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function parseRunFolderDate(name) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_devscrapewide_c-69ea4723/.exec(
      String(name || ''),
    );
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function reportLinkDateTimeText(reportLink) {
  const folderDate = parseRunFolderDate(reportLink?.folderName);
  if (folderDate) return localDateTimeText(folderDate);
  return String(reportLink?.folderName || reportLink?.sortKey || '');
}

function reportFileLinkHtml(reportLink, label) {
  if (!reportLink?.htmlPath) return '';
  const href = pathToFileURL(reportLink.htmlPath).href;
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function reportHistoryHtml(report) {
  const history = report?.reportHistory || {};
  const latest = history.latest || null;
  const previous = Array.isArray(history.previous) ? history.previous : [];
  if (!latest && !previous.length) return '';

  const lines = ['<div class="section"><strong>Report History</strong>'];
  if (latest) {
    lines.push(
      `<p>${reportFileLinkHtml(latest, `View latest report from ${reportLinkDateTimeText(latest)}`)}</p>`,
    );
  }
  if (previous.length) {
    lines.push('<p class="muted">Previous reports:</p>');
    lines.push('<ul>');
    for (const item of previous) {
      lines.push(
        `<li>${reportFileLinkHtml(item, `${reportLinkDateTimeText(item)} - ${item.folderName}`)}</li>`,
      );
    }
    lines.push('</ul>');
  }
  lines.push('</div>');
  return lines.join('');
}

export function renderCheckReportHtml(report) {
  const shortcutRows = Array.isArray(report?.shortcutRows) ? report.shortcutRows : [];
  const targetRows = Array.isArray(report?.targetRows) ? report.targetRows : [];
  const failingShortcutRows = Array.isArray(report?.failingShortcutRows)
    ? report.failingShortcutRows
    : shortcutRows.filter((row) => row.status === 'fail');
  const partialShortcutRows = Array.isArray(report?.partialShortcutRows)
    ? report.partialShortcutRows
    : shortcutRows.filter((row) => row.status === 'partial');
  const manualShortcutRows = Array.isArray(report?.manualShortcutRows)
    ? report.manualShortcutRows
    : shortcutRows.filter((row) => row.status === 'manual');
  const needsCoverageShortcutRows = Array.isArray(report?.needsCoverageShortcutRows)
    ? report.needsCoverageShortcutRows
    : [...partialShortcutRows, ...manualShortcutRows];
  const inventoryIssues = Array.isArray(report?.inventoryIssues) ? report.inventoryIssues : [];
  const missingArtifacts = Array.isArray(report?.missingArtifacts) ? report.missingArtifacts : [];
  const missingExpectedFiles = Array.isArray(report?.missingExpectedFiles)
    ? report.missingExpectedFiles
    : [];
  const liveProbeRows = Array.isArray(report?.liveProbeRows) ? report.liveProbeRows : [];
  const livePassedActionIds = new Set(
    liveProbeRows.filter((row) => row.status === 'pass').map((row) => row.actionId),
  );
  const actionablePartialShortcutRows = partialShortcutRows.filter(
    (row) => !livePassedActionIds.has(row.actionId),
  );
  const actionableNeedsCoverageShortcutRows = needsCoverageShortcutRows.filter(
    (row) => !livePassedActionIds.has(row.actionId),
  );
  const shortcutSummary = report?.summary?.shortcuts || {};
  const targetSummary = report?.summary?.targets || {};
  const liveProbeSummary = report?.summary?.liveProbes || { runStatus: 'not-run' };
  const inventoryOnly = report?.inventoryOnly === true;
  const runMode = report?.runMode || (inventoryOnly ? 'inventory-only' : 'live');
  const auditArtifacts = report?.auditArtifacts || {};
  const statusTextByShortcutStatus = {
    pass: 'PASS',
    fail: 'FAIL',
    partial: 'PARTIAL',
    manual: 'MANUAL',
    'not-applicable': 'N/A',
    'not-run': 'NOT RUN',
    'environment-fail': 'ENVIRONMENT FAIL',
  };
  const artifactFailureCount = missingArtifacts.length + missingExpectedFiles.length;
  const dashboardRows = [
    {
      area: 'Metadata Guard',
      status: inventoryIssues.length ? 'Needs Fix' : 'Pass',
      good: inventoryIssues.length ? 0 : shortcutSummary.total || 0,
      needs: inventoryIssues.length,
      meaning: inventoryIssues.length
        ? 'Shortcut metadata has drift or invalid references.'
        : 'Shortcut metadata, target refs, scrape refs, defaults, and handlers are coherent.',
    },
    {
      area: 'Scrape Artifacts',
      status: inventoryOnly ? 'Not Run' : artifactFailureCount ? 'Needs Fix' : 'Pass',
      good: report?.runManifest?.capturedCount || 0,
      needs: inventoryOnly ? 0 : artifactFailureCount,
      meaning: inventoryOnly
        ? 'Inventory-only mode intentionally captured no browser dumps.'
        : artifactFailureCount
          ? 'One or more required dumps failed or expected scrape files are missing.'
          : 'Saved dumps are available for the target audit.',
    },
    {
      area: 'Shortcut Target Audit',
      status:
        inventoryOnly
          ? 'Not Run'
          : (shortcutSummary.failed || 0) > 0
            ? 'Needs Fix'
            : actionablePartialShortcutRows.length > 0
              ? 'Partial'
              : 'Pass',
      good: shortcutSummary.passed || 0,
      needs: inventoryOnly
        ? shortcutSummary.notRun || 0
        : (shortcutSummary.failed || 0) + actionablePartialShortcutRows.length,
      meaning: inventoryOnly
        ? `${shortcutSummary.notRun || 0} shortcuts await live activation proof.`
        : `${shortcutSummary.failed || 0} failed, ${actionablePartialShortcutRows.length} unresolved partial, ${shortcutSummary.manual || 0} manual follow-up.`,
    },
    {
      area: 'Live Activation Probes',
      status:
        liveProbeSummary.runStatus === 'not-run'
          ? 'Not Run'
          : (liveProbeSummary.environmentFailed || 0) > 0
            ? 'Setup Issue'
            : (liveProbeSummary.failed || 0) > 0
              ? 'Needs Fix'
              : 'Pass',
      good: liveProbeSummary.passed || 0,
      needs: (liveProbeSummary.failed || 0) + (liveProbeSummary.environmentFailed || 0),
      meaning:
        liveProbeSummary.runStatus === 'not-run'
          ? 'Run validate-wide with --probe-shortcuts to exercise safe live shortcuts.'
          : `${liveProbeSummary.executable || 0} executable probes, ${liveProbeSummary.notLiveProbed || 0} intentionally not live-probed.`,
    },
  ];
  const followUpRows = [
    ...(inventoryOnly && (shortcutSummary.notRun || shortcutSummary.environmentFailed)
      ? [
          {
            kind: runMode === 'environment-fail' ? 'Setup issue' : 'Awaiting live coverage',
            item: `${shortcutSummary.notRun || shortcutSummary.environmentFailed} shortcut rows`,
            reason:
              runMode === 'environment-fail'
                ? 'Browser/CDP or extension setup prevented live activation; rerun with an authenticated profile and strict extension capture.'
                : 'Inventory-only mode intentionally skipped browser capture and activation; run the strict live audit to close these rows.',
          },
        ]
      : []),
    ...failingShortcutRows.map((row) => ({
      kind: 'Broken shortcut',
      item: row.actionId,
      reason: row.statusReason,
    })),
    ...actionablePartialShortcutRows.map((row) => ({
      kind: 'Needs coverage',
      item: row.actionId,
      reason: row.statusReason,
    })),
    ...liveProbeRows
      .filter((row) => row.status === 'fail' || row.status === 'environment-fail')
      .map((row) => ({
        kind: row.status === 'environment-fail' ? 'Setup issue' : 'Live probe failed',
        item: row.actionId,
        reason: row.reason,
      })),
  ].slice(0, 8);
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><title>ChatGPT Custom Shortcuts Pro Shortcut Audit Report</title>',
    '<style>',
    'body{font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px;color:#111827;background:#f8fafc;}',
    'h1{font-size:20px;margin:0 0 12px;}',
    'p{margin:0 0 10px;}',
    'table{border-collapse:collapse;width:100%;background:#fff;}',
    'th,td{border:1px solid #d1d5db;padding:8px 10px;text-align:left;vertical-align:top;}',
    'th{background:#e5e7eb;font-weight:600;}',
    '.ok{color:#166534;font-weight:700;}',
    '.fail{color:#991b1b;font-weight:700;}',
    '.warn{color:#9a6700;font-weight:700;}',
    '.muted{color:#475569;}',
    '.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}',
    '.section{margin-top:22px;}',
    '.tab-input{position:absolute;opacity:0;pointer-events:none;}',
    '.tab-labels{display:flex;gap:8px;margin:16px 0;}',
    '.tab-labels label{border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:8px 12px;font-weight:600;cursor:pointer;}',
    '.tab-panel{display:none;}',
    '#tab-summary:checked~.tab-labels label[for="tab-summary"],#tab-details:checked~.tab-labels label[for="tab-details"]{background:#111827;color:#fff;border-color:#111827;}',
    '#tab-summary:checked~.tab-panels #summary-panel,#tab-details:checked~.tab-panels #details-panel{display:block;}',
    '.dashboard-table th,.dashboard-table td{padding:7px 9px;}',
    'ul{margin:8px 0 0 20px;padding:0;}',
    '</style></head><body>',
    '<h1>ChatGPT Custom Shortcuts Pro Shortcut Audit Report</h1>',
    `<p><strong>Report run:</strong> ${escapeHtml(localDateTimeText(report?.generatedAt))}</p>`,
    '<input class="tab-input" id="tab-summary" name="report-tab" type="radio" checked>',
    '<input class="tab-input" id="tab-details" name="report-tab" type="radio">',
    '<div class="tab-labels"><label for="tab-summary">Dashboard</label><label for="tab-details">Details</label></div>',
    '<div class="tab-panels"><section class="tab-panel" id="summary-panel">',
    `<p><strong>Folder:</strong> ${folderPathLinkHtml(report?.folderPath || '')}</p>`,
    inventoryOnly
      ? '<p class="warn"><strong>Inventory-only:</strong> browser capture and live activation were intentionally not run.</p>'
      : '',
    Object.keys(auditArtifacts).length
      ? [
          '<div class="section"><strong>Shortcut Audit Artifacts</strong><ul>',
          ...Object.entries(auditArtifacts).map(([key, value]) => {
            const label = key.replace(/Path$/, '').replaceAll(/([a-z])([A-Z])/g, '$1 $2');
            const href = pathToFileURL(value).href;
            return `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`;
          }),
          '</ul></div>',
        ].join('')
      : '',
    '<table class="dashboard-table"><thead><tr><th>Check</th><th>Status</th><th>Good</th><th>Needs Attention</th><th>Meaning</th></tr></thead><tbody>',
    dashboardRows
      .map((row) => {
        const className =
          row.status === 'Pass'
            ? 'ok'
            : row.status === 'Partial' || row.status === 'Not Run'
              ? 'warn'
              : 'fail';
        return [
          '<tr>',
          `<td>${escapeHtml(row.area)}</td>`,
          `<td class="${className}">${escapeHtml(row.status)}</td>`,
          `<td>${escapeHtml(row.good)}</td>`,
          `<td>${escapeHtml(row.needs)}</td>`,
          `<td>${escapeHtml(row.meaning)}</td>`,
          '</tr>',
        ].join('');
      })
      .join(''),
    '</tbody></table>',
    '<div class="section"><strong>Top Follow-Up</strong>',
    followUpRows.length
      ? [
          '<table class="dashboard-table"><thead><tr><th>Type</th><th>Shortcut / Item</th><th>Reason</th></tr></thead><tbody>',
          followUpRows
            .map(
              (row) =>
                `<tr><td>${escapeHtml(row.kind)}</td><td class="mono">${escapeHtml(row.item)}</td><td>${escapeHtml(row.reason || '')}</td></tr>`,
            )
            .join(''),
          '</tbody></table>',
        ].join('')
      : '<p>No broken shortcuts, missing coverage, or live-probe failures were flagged.</p>',
    '</div>',
    reportHistoryHtml(report),
    '</section><section class="tab-panel" id="details-panel">',
    `<p><strong>Fixture:</strong> <span class="mono">${escapeHtml(report?.fixtureUrl || '')}</span></p>`,
    `<p><strong>Folder:</strong> <span class="mono">${escapeHtml(report?.folderName || '')}</span></p>`,
    `<p><strong>Summary:</strong> ${escapeHtml(
      `${shortcutSummary.total ?? 0} shortcuts inventoried: ${shortcutSummary.passed ?? 0} passed, ${shortcutSummary.failed ?? 0} failed, ${shortcutSummary.partial ?? 0} partial, ${shortcutSummary.manual ?? 0} manual-only, ${shortcutSummary.notApplicable ?? 0} not applicable, ${shortcutSummary.notRun ?? 0} not run.`,
    )}</p>`,
    `<p><strong>Live probes:</strong> ${escapeHtml(
      liveProbeSummary.runStatus === 'not-run'
        ? 'not run'
        : `${liveProbeSummary.passed ?? 0} passed, ${liveProbeSummary.failed ?? 0} failed, ${liveProbeSummary.environmentFailed ?? 0} environment failed, ${liveProbeSummary.notLiveProbed ?? 0} not live-probed.`,
    )}</p>`,
    '<div class="section"><strong>Likely Broken Shortcuts</strong>',
    failingShortcutRows.length
      ? `<ul>${failingShortcutRows
          .map(
            (row) =>
              `<li><span class="mono">${escapeHtml(row.actionId)}</span> — ${escapeHtml(row.label)} — ${escapeHtml(row.statusReason)}</li>`,
          )
          .join('')}</ul>`
      : '<p>None.</p>',
    '</div>',
    '<div class="section"><strong>Needs Coverage / Manual Follow-Up</strong>',
    actionableNeedsCoverageShortcutRows.length
      ? `<ul>${actionableNeedsCoverageShortcutRows
          .map(
            (row) =>
              `<li><span class="mono">${escapeHtml(row.actionId)}</span> - ${escapeHtml(row.label)} - ${escapeHtml(row.statusReason)}</li>`,
          )
          .join('')}</ul>`
      : '<p>None.</p>',
    '</div>',
    '<div class="section"><strong>Shortcut Coverage</strong>',
    `<p class="muted">${escapeHtml(
      `${shortcutSummary.total ?? 0} shortcuts inventoried. ${targetSummary.total ?? 0} canonical targets tracked.`,
    )}</p>`,
    '<table><thead><tr><th>Action Id / Label</th><th>Default Key Code</th><th>Validation Mode</th><th>Ordered Target Refs</th><th>Activation Probe</th><th>Required Scrape States / Files</th><th>Status</th><th>Reason</th></tr></thead><tbody>',
    shortcutRows
      .map((row) => {
        const className =
          row.status === 'pass'
            ? 'ok'
            : row.status === 'fail'
              ? 'fail'
              : row.status === 'partial'
                ? 'warn'
                : 'muted';
        return [
          '<tr>',
          `<td><div><span class="mono">${escapeHtml(row.actionId)}</span></div><div>${escapeHtml(row.label || '')}</div></td>`,
          `<td class="mono">${escapeHtml(row.defaultCode || '(none)')}</td>`,
          `<td>${escapeHtml(row.validationMode)}</td>`,
          `<td class="mono">${escapeHtml((row.targetRefs || row.targetIds || []).join(' -> ') || '(none)')}</td>`,
          `<td><div>${escapeHtml(row.activationProbeMode || '(none)')}</div><div class="muted mono">${escapeHtml(row.activationProbeExpectedTargetRef || '')}</div><div class="muted mono">${escapeHtml(row.activationProbeSetup || '')}</div></td>`,
          `<td><div class="mono">${escapeHtml((row.requiredUiStateRefs || []).join(', ') || '(none)')}</div><div class="muted mono">${escapeHtml((row.requiredFiles || []).join(', ') || '(no scrape file requirement)')}</div></td>`,
          `<td class="${className}">${escapeHtml(statusTextByShortcutStatus[row.status] || row.status || 'UNKNOWN')}</td>`,
          `<td>${escapeHtml(row.statusReason || row.notes || '')}</td>`,
          '</tr>',
        ].join('');
      })
      .join(''),
    '</tbody></table>',
    '</div>',
    '<div class="section"><strong>Live Shortcut Activation Probes</strong>',
    liveProbeRows.length
      ? [
          '<table><thead><tr><th>Action Id / Label</th><th>Key Code</th><th>Probe</th><th>Expected Target</th><th>Status</th><th>Observed</th><th>Reason</th></tr></thead><tbody>',
          liveProbeRows
            .map((row) => {
              const className =
                row.status === 'pass'
                  ? 'ok'
                  : row.status === 'fail' || row.status === 'environment-fail'
                    ? 'fail'
                    : row.status === 'skipped'
                      ? 'warn'
                      : 'muted';
              return [
                '<tr>',
                `<td><div class="mono">${escapeHtml(row.actionId)}</div><div>${escapeHtml(row.label || '')}</div></td>`,
                `<td class="mono">${escapeHtml(row.dispatchCode || row.defaultCode || '(none)')}</td>`,
                `<td>${escapeHtml(row.probeMode || '')}</td>`,
                `<td class="mono">${escapeHtml(row.expectedTargetRef || '')}</td>`,
                `<td class="${className}">${escapeHtml(String(row.status || '').toUpperCase())}</td>`,
                `<td><div class="mono">${escapeHtml(row.observedSelector || '')}</div><div class="muted">${escapeHtml(row.observedTextSnippet || '')}</div></td>`,
                `<td>${escapeHtml(row.reason || '')}</td>`,
                '</tr>',
              ].join('');
            })
            .join(''),
          '</tbody></table>',
        ].join('')
      : '<p>Not run. Use <span class="mono">--probe-shortcuts</span> with <span class="mono">validate-wide</span>.</p>',
    '</div>',
    '<div class="section"><strong>Target Coverage</strong>',
    '<table><thead><tr><th>Target Id</th><th>Kind</th><th>Canonical Identifier</th><th>Match Groups</th><th>Expected Scrape States / Files</th><th>Matched Dump Files</th><th>Status</th><th>Dependent Shortcuts</th></tr></thead><tbody>',
    targetRows
      .map((row) => {
        const className =
          row.status === 'pass' ? 'ok' : row.status === 'fail' ? 'fail' : 'warn';
        return [
          '<tr>',
          `<td class="mono">${escapeHtml(row.targetId)}</td>`,
          `<td>${escapeHtml(row.kind)}</td>`,
          `<td class="mono">${escapeHtml(row.canonicalIdentifier || row.identifier)}</td>`,
          `<td class="mono">${escapeHtml((row.matchGroups || []).map((group) => `[${(group || []).join(' + ')}]`).join(' OR ') || '(none)')}</td>`,
          `<td><div class="mono">${escapeHtml((row.expectedUiStateRefs || []).join(', ') || '(not covered by current scrape family)')}</div><div class="muted mono">${escapeHtml((row.expectedFiles || []).join(', ') || '(no scrape file requirement)')}</div></td>`,
          `<td class="mono">${escapeHtml((row.matchedExpectedFiles || row.allMatchedFiles || []).join(', ') || '(none)')}</td>`,
          `<td class="${className}">${escapeHtml(row.status === 'no-scrape-coverage' ? 'NO SCRAPE COVERAGE' : String(row.status || '').replaceAll('-', ' ').toUpperCase())}<div class="muted">${escapeHtml(row.statusReason || '')}</div></td>`,
          `<td class="mono">${escapeHtml((row.usedByActionIds || []).join(', ') || '(none)')}</td>`,
          '</tr>',
        ].join('');
      })
      .join(''),
    '</tbody></table>',
    '</div>',
    '<div class="section"><strong>Inventory Issues</strong>',
    inventoryIssues.length
      ? `<ul>${inventoryIssues
          .map((item) => `<li>${escapeHtml(item.message || '')}</li>`)
          .join('')}</ul>`
      : '<p>None.</p>',
    '</div>',
    '<div class="section"><strong>Missing or Failed Dumps</strong>',
    missingArtifacts.length
      ? `<ul>${missingArtifacts
          .map(
            (item) =>
              `<li><span class="mono">${escapeHtml(item.filename)}</span> — ${escapeHtml(item.reason || 'Capture failed')}</li>`,
          )
          .join('')}</ul>`
      : '<p>None.</p>',
    '</div>',
    '<div class="section"><strong>Missing Expected Files</strong>',
    missingExpectedFiles.length
      ? `<ul>${missingExpectedFiles
          .map(
            (item) =>
              `<li><span class="mono">${escapeHtml(item.identifier)}</span> expected <span class="mono">${escapeHtml(item.filename)}</span></li>`,
          )
          .join('')}</ul>`
      : '<p>None.</p>',
    '</div>',
    reportHistoryHtml(report),
    '</section></div>',
    '</body></html>',
  ].join('');
}

export async function writeCheckReportFiles(report) {
  const jsonPath = path.join(report.folderPath, 'check-report.json');
  const htmlPath = path.join(report.folderPath, 'check-report.html');
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  await writeFile(htmlPath, renderCheckReportHtml(report), 'utf8');
  return { jsonPath, htmlPath };
}

export async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }
  return response.json();
}

export async function waitForEndpointReady(endpoint, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await fetchJson(new URL('/json/version', endpoint).toString());
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(
    `CDP endpoint ${endpoint} was not reachable within ${timeoutMs}ms${
      lastError ? `: ${lastError.message}` : ''
    }`,
  );
}
