import { access, lstat, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import modelPickerSelectors from '../../../extension/shared/model-picker-selectors.js';
import {
  AUDIT_ARTIFACT_FILENAMES,
  buildShortcutAuditReport,
  buildStorageRecoveryPlan,
  buildStorageRecoveryReport,
  createStorageMutationLedger,
  finalizeStorageRecoveryPlan,
  writeShortcutAuditArtifacts,
} from './shortcut-audit-artifacts.mjs';
import {
  assertCapabilities,
  deriveFreshCapabilities,
  getUnavailableCapabilities,
  unknownCapabilities,
} from './shortcut-capabilities.mjs';
import {
  buildFreshCurrentModelCatalogActionProjection,
  buildShortcutValidationInventory,
  parseModelPickerLabelsSource,
  parseOptionsDefaultsFromSource,
  parseSettingsSchemaSource,
} from './shortcut-target-inventory.mjs';
import { evaluateTargetPresence, targetMatchesText } from './shortcut-target-presence.mjs';

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
const NEW_CONVERSATION_SETTLE_MS = 2500;
const NEW_CONVERSATION_ACTION_ID = 'shortcutKeyNewConversation';
const TEMPORARY_CHAT_ACTION_ID = 'shortcutKeyTemporaryChat';
const CLICK_SEND_ACTION_ID = 'shortcutKeyClickSendButton';
const CLICK_STOP_ACTION_ID = 'shortcutKeyClickStopButton';
const LIVE_PROBE_CAPTURE_STATE_BY_ACTION = Object.freeze({
  shortcutKeyCopyAllCodeBlocks: 'probe-code-block-content',
  shortcutKeyToggleCodeboxWrap: 'probe-codebox-wrap-enabled',
  shortcutKeySendEdit: 'probe-edit-send-button',
  shortcutKeyClickSendButton: 'probe-send-button',
  shortcutKeyClickStopButton: 'probe-stop-button',
  shortcutKeyTemporaryChat: 'probe-temporary-chat',
  shortcutKeyNewGptConversation: 'probe-new-gpt-conversation',
  shortcutKeyNewConversation: 'probe-blank-chat-work-surface-toggle',
  shortcutKeyStudy: 'probe-composer-study-search',
  shortcutKeyDeepResearch: 'probe-composer-deep-research-search',
  shortcutKeyCancelDictation: 'probe-active-dictation-controls',
  shortcutKeyToggleDictate: 'probe-blank-chat-dictate-start',
});
const LIVE_PROBE_CAPTURE_TARGET_BY_STATE = Object.freeze({
  'probe-code-block-content': 'code-block-content',
  'probe-codebox-wrap-enabled': 'codebox-wrap-enabled',
  'probe-edit-send-button': 'edit-send-button',
  'probe-edit-message-button': 'edit-message-button',
  'probe-send-button': 'send-button',
  'probe-stop-button': 'stop-button',
  'probe-temporary-chat': 'temporary-chat-button',
  'probe-new-gpt-conversation': 'new-gpt-conversation-item',
  'probe-blank-chat-work-surface-toggle': 'chat-work-surface-toggle',
  'probe-composer-study-search': 'composer-study-action',
  'probe-composer-deep-research-search': 'composer-deep-research-action',
  'probe-active-dictation-controls': 'cancel-dictation-button',
  'probe-blank-chat-dictate-start': 'dictate-start-button',
});

export function getProbeOnlyCaptureActionIds(actionIds = []) {
  const requested = Array.isArray(actionIds) ? [...new Set(actionIds)] : [];
  const selected = requested.length ? requested : Object.keys(LIVE_PROBE_CAPTURE_STATE_BY_ACTION);
  const unsupported = selected.filter((actionId) => !LIVE_PROBE_CAPTURE_STATE_BY_ACTION[actionId]);
  if (unsupported.length) {
    throw new Error(`No probe-only state capture is registered for: ${unsupported.join(', ')}.`);
  }
  return selected;
}

export function requiresAuditOwnedTwoTurnFixture(options = {}) {
  const { onlyActionIds = [], fixedContractIds = [], phase = 'all', shortcuts = [] } = options;
  if (phase === 'model') return false;
  const selectedActionIds = Array.isArray(onlyActionIds) ? onlyActionIds : [];
  const selectedContractIds = Array.isArray(fixedContractIds) ? fixedContractIds : [];
  if (!selectedActionIds.length && !selectedContractIds.length) return true;
  const shortcutById = new Map(
    (Array.isArray(shortcuts) ? shortcuts : []).map((shortcut) => [shortcut.actionId, shortcut]),
  );
  return selectedActionIds.some((actionId) => {
    if (actionId === NEW_CONVERSATION_ACTION_ID) return true;
    const setup = String(shortcutById.get(actionId)?.activationProbeSetup || '');
    return (
      ['scroll-from-top', 'scroll-from-bottom'].includes(setup) ||
      setup.startsWith('message-scroll-')
    );
  });
}

export function buildCaptureOnlyLiveProbeRow(shortcut, captureArtifact, durationMs = 0) {
  const captureStatus = captureArtifact?.status || 'deferred';
  const captureReason = captureArtifact?.error || '';
  return {
    actionId: shortcut.actionId,
    label: shortcut.label,
    defaultCode: shortcut.defaultCode,
    requiredCapabilities: shortcut.requiredCapabilities || [],
    dispatchCode: '',
    probeMode: shortcut.activationProbeMode || '',
    expectedTargetRef: shortcut.activationProbeExpectedTargetRef || '',
    status: 'not-live-probed',
    reason:
      captureStatus === 'captured'
        ? 'Prepared target state was captured; shortcut activation was intentionally not dispatched.'
        : captureReason ||
          'Prepared target state was not captured; shortcut activation was intentionally not dispatched.',
    observedSelector: '',
    observedTextSnippet: '',
    stateCapture: {
      stateId: captureArtifact?.stateId || '',
      status: captureStatus,
      error: captureReason || null,
    },
    semantic: {
      status: 'not-run',
      proofMethod: 'none',
      expected: shortcut.activationProbeExpectedTargetRef || shortcut.notes || '',
      observed: '',
      reason: 'Shortcut activation was not dispatched during prepare/capture-only collection.',
    },
    durationMs,
  };
}

const CAPTURE_ONLY_FAILURE_REASONS = Object.freeze({
  setup: 'Prepared-state setup failed before the target state was captured.',
  capture: 'Prepared-state capture did not produce a verified artifact.',
  cleanup: 'Prepared-state cleanup failed; captured content was discarded.',
});

export function recordCaptureOnlyFailure({
  actionId,
  supplementalArtifactByState,
  rows = [],
  checkpoint = null,
  failureType = 'capture',
  diagnosticError = '',
} = {}) {
  const stateId = LIVE_PROBE_CAPTURE_STATE_BY_ACTION[actionId] || '';
  const reason = CAPTURE_ONLY_FAILURE_REASONS[failureType] || CAPTURE_ONLY_FAILURE_REASONS.capture;
  const artifact = stateId ? supplementalArtifactByState?.get(stateId) : null;
  let failedArtifact = null;
  if (artifact) {
    failedArtifact = {
      ...artifact,
      status: 'failed',
      error: reason,
      rawHtml: '',
      captureBytes: 0,
    };
    supplementalArtifactByState.set(stateId, failedArtifact);
  }

  const row = Array.isArray(rows)
    ? rows.findLast((candidate) => candidate.actionId === actionId)
    : null;
  if (row) {
    row.reason = reason;
    if (row.stateCapture) {
      row.stateCapture.status = 'failed';
      row.stateCapture.error = reason;
      if (diagnosticError) row.stateCapture.diagnosticError = diagnosticError;
      if (failureType === 'cleanup') row.stateCapture.cleanupStatus = 'failed';
    }
  }

  const completedCase = Array.isArray(checkpoint?.completedCases)
    ? checkpoint.completedCases.findLast((candidate) => candidate.actionId === actionId)
    : null;
  if (completedCase) {
    completedCase.captureStatus = 'failed';
    completedCase.reason = reason;
    if (diagnosticError) completedCase.diagnosticError = diagnosticError;
    if (failureType === 'cleanup') completedCase.captureCleanupStatus = 'failed';
  }
  if (failureType === 'cleanup' && checkpoint) {
    checkpoint.captureCleanupFailures ||= [];
    if (!checkpoint.captureCleanupFailures.some((failure) => failure.actionId === actionId)) {
      checkpoint.captureCleanupFailures.push({ actionId, stateId, reason });
    }
  }
  return failedArtifact;
}

export function recordPreparedCaptureCleanup({ cleanup, ...options }) {
  const { actionId, rows = [], checkpoint } = options;
  const status = cleanup?.status || 'unknown';
  const row = rows.findLast((candidate) => candidate.actionId === actionId);
  const completedCase = checkpoint?.completedCases?.findLast(
    (candidate) => candidate.actionId === actionId,
  );
  if (row?.stateCapture) row.stateCapture.cleanupStatus = status;
  if (completedCase) completedCase.captureCleanupStatus = status;
  if (['clean', 'not-needed'].includes(status)) return { failed: false, status };

  const stateId = LIVE_PROBE_CAPTURE_STATE_BY_ACTION[actionId];
  // Cleanup is diagnostic; it cannot undo the observed target capture.
  if (checkpoint) {
    checkpoint.captureCleanupFailures ||= [];
    if (!checkpoint.captureCleanupFailures.some((failure) => failure.actionId === actionId)) {
      checkpoint.captureCleanupFailures.push({
        actionId,
        stateId,
        reason: 'Prepared-state cleanup did not complete successfully.',
      });
    }
  }
  return { failed: true, status };
}

const COMPOSER_TOOL_ITEM_CAPTURE_SELECTOR = [
  'button[data-list-navigation-item="true"]',
  'div.__menu-item[tabindex]',
  'div[role="menuitem"]',
  'div[role="menuitemradio"]',
  'div[role="menuitemcheckbox"]',
].join(', ');
const GPT_MENU_TRIGGER_SELECTOR =
  'button[aria-haspopup="menu"]:has(svg path[d^="M15.6981 9.04712"]):has(svg path[d^="M4.69806 9.04712"]):has(svg path[d^="M10.2003 9.04712"])';
const GPT_MENU_ITEM_ICON_SELECTORS = Object.freeze([
  'svg use[href*="#square-and-pencil-light-16"]',
  'svg path[d^="M2.6687 11.333V8.66699C2.6687"]',
  'svg use[href*="#compose"]',
  'svg use[href*="#3a5c87"]',
]);
const GPT_OPEN_MENU_SELECTOR =
  '[role="menu"][data-radix-menu-content][data-state="open"], [data-radix-menu-content][data-state="open"][role="menu"]';
const AUDIT_OWNED_LIVE_PROBE_CAPTURE_STATES = new Set([
  'probe-code-block-content',
  'probe-codebox-wrap-enabled',
  'probe-edit-send-button',
  'probe-edit-message-button',
  'probe-send-button',
  'probe-stop-button',
  'probe-temporary-chat',
  'probe-composer-study-search',
  'probe-composer-deep-research-search',
  'probe-active-dictation-controls',
]);

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
const DICTATION_START_BUTTON_SELECTORS = Object.freeze([
  'form[data-chatgpt-composer][data-thread-find-composer="true"] button:has(svg use[href$="#microphone-light-16"])',
  'form[data-chatgpt-composer][data-thread-find-composer="true"] button:has(svg use[href$="#microphone-light-20"])',
  'form[data-thread-find-composer="true"] button:has(svg path[d^="M12.4584 8.96973"])',
  'form[data-chatgpt-composer] button:has(svg path[d^="M12.4584 8.96973"])',
]);
const ACTIVE_DICTATION_CONTROL_SPECS = Object.freeze([
  Object.freeze({
    pathPrefix: 'M9.31697 3.08317',
    symbols: Object.freeze(['#arrow-up-lg-light-20']),
  }),
  Object.freeze({
    pathPrefix: 'M13.0834 3.91846',
    symbols: Object.freeze(['#stop-fill-light-20']),
  }),
  Object.freeze({ pathPrefix: 'M14.779 4.27903', symbols: Object.freeze(['#xmark-lg-light-20']) }),
]);
const DICTATION_START_CONTROL_SPECS = Object.freeze([
  Object.freeze({
    pathPrefix: 'M12.4584 8.96973',
    symbols: Object.freeze(['#microphone-light-16', '#microphone-light-20']),
  }),
]);
const SEARCH_CONVERSATION_BUTTON_SELECTORS = Object.freeze([
  'button:has(svg path[d^="M9.16211 2.37976"])',
  'button:has(svg path[d^="M7.32849 1.91016"])',
  'button[data-testid="search-conversation-button"]',
]);
const SEARCH_DIALOG_VISIBLE_SELECTOR = '[role="dialog"]:visible';
const SHORTCUT_OVERLAY_SELECTOR = '#csp-shortcut-overlay';
const NATIVE_COMPOSER_FORM_SELECTOR = 'form:has([contenteditable="true"][role="textbox"])';
const NATIVE_COMPOSER_SEND_BUTTON_SELECTOR =
  'button[type="submit"]:has(svg path[d^="M9.33467 16.6663"])';
const NATIVE_COMPOSER_STOP_BUTTON_SELECTOR =
  'button[type="button"]:has(svg path[d^="M4.5 5.75C4.5 5.05964"])';
const NATIVE_COMPOSER_SEND_SELECTOR = `${NATIVE_COMPOSER_FORM_SELECTOR} ${NATIVE_COMPOSER_SEND_BUTTON_SELECTOR}`;
const NATIVE_COMPOSER_STOP_SELECTOR = `${NATIVE_COMPOSER_FORM_SELECTOR} ${NATIVE_COMPOSER_STOP_BUTTON_SELECTOR}`;
const LEGACY_SEND_BUTTON_SELECTORS = Object.freeze([
  'button[data-testid="send-button"]',
  '#composer-submit-button',
  'button[aria-label="Send prompt"]',
]);
const LEGACY_STOP_BUTTON_SELECTORS = Object.freeze([
  'button[data-testid="stop-button"]',
  'button[data-test-id="stop-button"]',
]);
const SEND_BUTTON_SELECTORS = Object.freeze([
  NATIVE_COMPOSER_SEND_SELECTOR,
  ...LEGACY_SEND_BUTTON_SELECTORS,
  'form[data-thread-find-composer="true"] button[type="submit"]',
  'form[data-chatgpt-composer] button[type="submit"]',
]);
const STOP_BUTTON_SELECTORS = Object.freeze([
  NATIVE_COMPOSER_STOP_SELECTOR,
  ...LEGACY_STOP_BUTTON_SELECTORS,
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
const AUDIT_FIXTURE_PROMPT_TEXTS = Object.freeze([
  'For the keyboard audit fixture, reply only with a fenced JavaScript code block. Include a single 240-character string on one line so horizontal wrapping can be observed. Do not add prose.',
  'Use the Search the web tool now to find an official OpenAI Help Center article about checking important information in ChatGPT. Reply in one sentence and cite that page so the response visibly includes a web citation.',
]);
const OWNED_AUDIT_DRAFT_TEXTS = new Set([
  SIDE_EFFECT_MESSAGE_TEXT,
  SIDE_EFFECT_EDITED_MESSAGE_TEXT,
  'study',
  'deep research',
  CODEBOX_WRAP_PROMPT_TEXT,
  CODEBOX_COPY_PROMPT_TEXT,
  ...AUDIT_FIXTURE_PROMPT_TEXTS,
]);
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
  'message-scroll-from-bottom',
  'message-scroll-from-top',
  'clipboard-single-message',
  'clipboard-entire-conversation',
  'clipboard-code-blocks',
  'codebox-conversation',
  'shortcut-overlay-ready',
]);
const CONTROL_SHORTCUT_ACTION_IDS = Object.freeze([CLICK_SEND_ACTION_ID, CLICK_STOP_ACTION_ID]);
const MODEL_EFFORT_ACTION_IDS = Object.freeze([
  'shortcutKeyThinkingLight',
  'shortcutKeyThinkingHeavy',
  'shortcutKeyProStandard',
  'shortcutKeyProExtended',
]);

let cachedContract = null;
let lastBrowserRequestAt = 0;
const verifiedBlankNewChatByPage = new WeakMap();
const ownedConversationIdsByPage = new WeakMap();
const activeOwnedComposerDraftByPage = new WeakMap();

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

export function deriveCollectorCapabilities({
  freshModelCatalog,
  modelMenuTarget,
  modelMenuText,
  currentModelCatalogActionProjection,
} = {}) {
  const modelMenuVerified =
    modelMenuTarget?.targetId === 'model-switcher-menu' &&
    !modelMenuTarget.missingMatchGroups &&
    !(modelMenuTarget.unknownUiStateRefs || []).length &&
    Array.isArray(modelMenuTarget.matchGroups) &&
    modelMenuTarget.matchGroups.length > 0 &&
    typeof modelMenuText === 'string' &&
    modelMenuText.trim().length > 0 &&
    targetMatchesText(modelMenuTarget, modelMenuText);
  return deriveFreshCapabilities({
    modelCatalog: freshModelCatalog,
    modelMenuText,
    modelMenuVerified,
    currentModelCatalogActionProjection,
  });
}

export function getRegistryCapabilityDeferral(definition, capabilities) {
  return (
    getUnavailableCapabilityStatus(definition?.requiredCapabilities, capabilities)?.statusReason ||
    ''
  );
}

const FRESH_MODEL_CATALOG_PROJECTION_SOURCE = 'fresh-current-model-catalog-action-projection-v2';
const FRESH_MODEL_CATALOG_REFRESH_PROOF_SOURCE = 'fresh-model-catalog-refresh-v1';
const PROFILE_BY_CHAT_WORK_MODE = Object.freeze({ chat: 'legacy', work: 'latest' });

async function readModelCatalogProjectionEvidence(page) {
  if (typeof page?.evaluate !== 'function') {
    return {
      mode: { status: 'unknown', mode: '', source: '' },
      activeSimpleSlider: { verified: false },
    };
  }
  try {
    return await page.evaluate(() => {
      const selectors = window.CSPModelPickerSelectors;
      const visible = (element) =>
        !!(
          element instanceof Element &&
          element.isConnected &&
          !element.closest('[inert], [data-active="false"]') &&
          selectors?.isUsablyVisibleElement?.(element, window)
        );
      const visibleModelTriggers = () => {
        const selector = selectors?.MODEL_MENU_BUTTON_SELECTOR;
        if (typeof selector !== 'string' || !selector) return [];
        return Array.from(document.querySelectorAll(selector)).filter(visible);
      };
      let mode = { status: 'unknown', mode: '', source: '' };
      const radios = selectors?.getNativeChatWorkSurfaceRadios?.(document, window) || [];
      if (radios.length === 2) {
        const selected = radios
          .map((radio, index) =>
            selectors.isChatWorkSurfaceSelected?.(radio) === true ? index : -1,
          )
          .filter((index) => index >= 0);
        if (selected.length === 1) {
          mode = {
            status: 'pass',
            mode: selected[0] === 0 ? 'chat' : 'work',
            source: 'native-surface-radios',
          };
        }
      } else if (radios.length === 0) {
        const triggers = visibleModelTriggers();
        if (triggers.length === 1) {
          mode = {
            status: 'pass',
            mode: triggers[0].querySelector('[data-animated-slider-trigger="true"]')
              ? 'work'
              : 'chat',
            source: 'composer-model-trigger',
          };
        }
      }

      const sliderFailure = (issueCode) => ({
        verified: false,
        issueCode,
      });
      const triggers = visibleModelTriggers();
      if (triggers.length !== 1) {
        return {
          mode,
          activeSimpleSlider: sliderFailure('model-trigger-not-unique'),
        };
      }
      const getOpenMenus = selectors?.getOpenModelMenuCandidates;
      const menus =
        typeof getOpenMenus === 'function' ? getOpenMenus(document, window, triggers[0]) : [];
      if (!Array.isArray(menus) || menus.length !== 1) {
        return {
          mode,
          activeSimpleSlider: sliderFailure('model-menu-not-unique'),
        };
      }

      const simpleViews = Array.from(
        menus[0].querySelectorAll('[data-model-picker-view="simple"]'),
      ).filter(visible);
      if (simpleViews.length !== 1) {
        return {
          mode,
          activeSimpleSlider: sliderFailure('active-simple-view-not-unique'),
        };
      }
      const sliderControls = Array.from(
        simpleViews[0].querySelectorAll('[data-reasoning-slider="true"]'),
      ).filter(visible);
      if (sliderControls.length !== 1) {
        return {
          mode,
          activeSimpleSlider: sliderFailure('active-simple-control-not-unique'),
        };
      }
      const sliders = Array.from(
        sliderControls[0].querySelectorAll(
          '[role="slider"][aria-valuemin][aria-valuemax][aria-valuenow]',
        ),
      ).filter(visible);
      if (sliders.length !== 1) {
        return {
          mode,
          activeSimpleSlider: sliderFailure('active-simple-slider-not-unique'),
        };
      }

      const min = Number(sliders[0].getAttribute('aria-valuemin'));
      const max = Number(sliders[0].getAttribute('aria-valuemax'));
      const value = Number(sliders[0].getAttribute('aria-valuenow'));
      if (
        ![min, max, value].every(Number.isSafeInteger) ||
        min < 0 ||
        max < min ||
        value < min ||
        value > max
      ) {
        return {
          mode,
          activeSimpleSlider: sliderFailure('active-simple-slider-range-invalid'),
        };
      }
      return {
        mode,
        activeSimpleSlider: { verified: true, min, max, value },
      };
    });
  } catch {
    return {
      mode: { status: 'unknown', mode: '', source: '' },
      activeSimpleSlider: { verified: false, issueCode: 'live-evidence-unavailable' },
    };
  }
}

function resolveFreshModelCatalogForMode(refreshResult, mode) {
  if (mode !== 'chat' && mode !== 'work') return null;
  if (refreshResult?.profiles && typeof refreshResult.profiles === 'object') {
    if (refreshResult.initialMode !== mode) return null;
    return refreshResult.profiles[mode] || null;
  }
  return refreshResult;
}

function isFreshModelCatalogRefreshProof(proof, mode) {
  return (
    proof?.schemaVersion === 1 &&
    proof?.source === FRESH_MODEL_CATALOG_REFRESH_PROOF_SOURCE &&
    proof?.status === 'pass' &&
    proof?.mode === mode &&
    ['native-surface-radios', 'composer-model-trigger'].includes(proof?.modeSource) &&
    Number.isFinite(proof?.startedAtMs) &&
    Number.isFinite(proof?.completedAtMs) &&
    proof.startedAtMs <= proof.completedAtMs
  );
}

export async function collectFreshCurrentModelCatalogActionProjection(page, refreshResult) {
  const evidence = await readModelCatalogProjectionEvidence(page);
  const mode = evidence?.mode?.status === 'pass' ? evidence.mode.mode : '';
  const profile = PROFILE_BY_CHAT_WORK_MODE[mode] || '';
  const runtimeProof = refreshResult?.collectorRuntimeModeProof;
  const proofMatchesCurrentMode = isFreshModelCatalogRefreshProof(runtimeProof, mode);
  const profileResult = resolveFreshModelCatalogForMode(refreshResult, mode);
  const catalog = profileResult?.modelCatalog;
  const activeConfigId = profileResult?.activeModelConfigId || '';
  const configureRows = Array.isArray(catalog?.configureOptions)
    ? catalog.configureOptions.filter((option) => option?.id === activeConfigId)
    : [];
  const currentActions = catalog?.frontendByConfig?.[activeConfigId];
  const activeConfigIsSelectedRow =
    typeof activeConfigId === 'string' &&
    activeConfigId.trim() === activeConfigId &&
    activeConfigId.length > 0 &&
    configureRows.length === 1 &&
    Array.isArray(currentActions) &&
    currentActions.length > 0;
  const scrapedAt = catalog?.scrapedAt;
  const scrapedDuringInvocation =
    Number.isFinite(scrapedAt) &&
    Number.isFinite(runtimeProof?.startedAtMs) &&
    Number.isFinite(runtimeProof?.completedAtMs) &&
    scrapedAt >= runtimeProof.startedAtMs &&
    scrapedAt <= runtimeProof.completedAtMs;
  const catalogModeMatches = !catalog?.surfaceMode || catalog.surfaceMode === mode;
  const freshCatalogVerified =
    profileResult?.ok === true &&
    proofMatchesCurrentMode &&
    activeConfigIsSelectedRow &&
    scrapedDuringInvocation &&
    catalogModeMatches;
  const catalogComplete =
    profileResult?.ok === true &&
    Array.isArray(catalog?.configureOptions) &&
    catalog.configureOptions.length > 0 &&
    currentActions?.length > 0;

  let modelLabels = null;
  try {
    modelLabels = parseModelPickerLabelsSource(await readFile(modelPickerLabelsSourcePath, 'utf8'));
  } catch {
    // Missing source leaves the projection unknown through the settled helper.
  }
  const projection = buildFreshCurrentModelCatalogActionProjection({
    catalog,
    profile,
    activeConfigId,
    modelLabels,
    freshCatalogVerified,
    catalogComplete,
    activeSimpleSlider: evidence?.activeSimpleSlider,
  });
  const issueCodes = [...projection.issueCodes];
  if (evidence?.mode?.status !== 'pass') issueCodes.push('active-native-mode-not-verified');
  if (evidence?.activeSimpleSlider?.verified !== true) {
    issueCodes.push(evidence?.activeSimpleSlider?.issueCode || 'active-simple-slider-not-verified');
  }
  if (!proofMatchesCurrentMode) issueCodes.push('refresh-mode-proof-missing-or-mismatched');
  if (profileResult?.ok !== true) issueCodes.push('model-catalog-refresh-incomplete');
  if (!activeConfigIsSelectedRow) issueCodes.push('active-config-not-selected-catalog-row');
  if (!scrapedDuringInvocation) issueCodes.push('catalog-not-scraped-during-refresh-invocation');
  if (!catalogModeMatches) issueCodes.push('catalog-surface-mode-mismatch');

  const uniqueIssueCodes = [...new Set(issueCodes)];
  const evidenceComplete =
    freshCatalogVerified &&
    catalogComplete &&
    evidence?.activeSimpleSlider?.verified === true &&
    projection.issueCodes.length === 0;
  const status = evidenceComplete ? projection.status : 'unknown';
  return {
    schemaVersion: 2,
    source: FRESH_MODEL_CATALOG_PROJECTION_SOURCE,
    status,
    profile,
    activeConfigId:
      activeConfigIsSelectedRow && typeof activeConfigId === 'string' ? activeConfigId : '',
    sliderRange: projection.sliderRange,
    actions: status === 'pass' ? projection.actions : [],
    integratedEffort:
      status === 'pass' && typeof projection.integratedEffort === 'boolean'
        ? projection.integratedEffort
        : null,
    issueCodes: uniqueIssueCodes,
  };
}

export function getUnavailableCapabilityStatus(requiredCapabilities, capabilities) {
  const unavailable = getUnavailableCapabilities(requiredCapabilities, capabilities);
  return unavailable.length
    ? {
        status: 'not-applicable',
        statusReason: `Required capability is unavailable: ${unavailable.join(', ')}.`,
      }
    : null;
}

function capabilitiesFromManifest(manifest) {
  return manifest && Object.hasOwn(manifest, 'capabilities')
    ? assertCapabilities(manifest.capabilities)
    : unknownCapabilities();
}

export async function resolveLiveProbeCapabilities(options, runFolderPath) {
  let persistedCapabilities = Object.hasOwn(options, 'capabilities')
    ? assertCapabilities(options.capabilities)
    : null;
  if (!persistedCapabilities && runFolderPath) {
    try {
      const manifest = JSON.parse(
        await readFile(path.join(runFolderPath, 'run-manifest.json'), 'utf8'),
      );
      persistedCapabilities = capabilitiesFromManifest(manifest);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return persistedCapabilities || unknownCapabilities();
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
        document.querySelectorAll(
          '[data-chatgpt-search-unit-key$=":user"], [data-chatgpt-search-unit-key$=":assistant"]',
        ),
      );
      const countRole = (role) =>
        units.filter((unit) =>
          unit.getAttribute('data-chatgpt-search-unit-key')?.endsWith(`:${role}`),
        ).length;
      const legacyMessages = Array.from(document.querySelectorAll('[data-message-author-role]'));
      const userCount =
        countRole('user') ||
        legacyMessages.filter((unit) => unit.getAttribute('data-message-author-role') === 'user')
          .length;
      const assistantCount =
        countRole('assistant') ||
        legacyMessages.filter(
          (unit) => unit.getAttribute('data-message-author-role') === 'assistant',
        ).length;
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
  const extensionIdFromProfile = await readExtensionIdFromSecurePreferences(
    options.extensionProfileDir,
  );
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
  const hasClose =
    (await closeButton.count()) > 0 && (await closeButton.isVisible().catch(() => false));
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

export async function getLatestUserMessageLocator(page) {
  for (const selector of USER_MESSAGE_SELECTORS) {
    const userMessage = page.locator(selector).filter({ visible: true }).last();
    if ((await userMessage.count()) === 0) continue;
    // Current user bubbles and their controls are siblings inside the user search unit.
    // Keep the scope within the nearest observed turn boundary, never the thread root.
    const wrapperDepth = await userMessage.evaluate((message) => {
      const turnSelector =
        '[data-chatgpt-search-unit-key$=":user"], [data-testid^="conversation-turn-"], [data-turn-key], article[data-turn="user"]';
      let current = message;
      for (let depth = 0; current && depth <= 10; depth += 1) {
        if (current.matches(turnSelector)) return depth;
        current = current.parentElement;
      }
      return null;
    });
    let userTurn = userMessage;
    for (let depth = 0; depth < (wrapperDepth ?? 0); depth += 1) {
      userTurn = userTurn.locator('xpath=..');
    }
    return userTurn;
  }
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
    triggerSelectors: ['button[aria-label="More actions"]'],
    expectedNeedles: [
      'voice-play-turn-action-button',
      '#03583c',
      'Read aloud',
      'Branch in new chat',
    ],
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
            for (
              let ancestor = item.parentElement;
              ancestor && ancestor !== document.body;
              ancestor = ancestor.parentElement
            ) {
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
  throw new Error(
    `Model switcher menu did not open${lastError ? `: ${lastError.message || lastError}` : ''}`,
  );
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
    await row
      .first()
      .hover({ force: true })
      .catch(() => {});
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
        menus.filter((menu) => /Standard|Extended/i.test(menu.textContent || '')).at(-1)
          ?.outerHTML || ''
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

export function findRenderedThreadScrollRoot(documentRef = document) {
  const view = documentRef?.defaultView;
  const HTMLElementType = view?.HTMLElement;
  if (!HTMLElementType) return null;

  return (
    Array.from(documentRef.querySelectorAll('.thread-scroll-container')).find((container) => {
      if (!(container instanceof HTMLElementType) || !container.isConnected) return false;
      const style = view.getComputedStyle(container);
      const rect = container.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.pointerEvents !== 'none' &&
        rect.width > 0 &&
        rect.height > 0
      );
    }) || null
  );
}

export function captureRenderedThreadBottomBoundary(documentRef = document) {
  const view = documentRef?.defaultView;
  const HTMLElementType = view?.HTMLElement;
  if (!HTMLElementType) return '';

  const isRendered = (element) => {
    if (!(element instanceof HTMLElementType) || !element.isConnected) return false;
    const style = view.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.pointerEvents !== 'none' &&
      rect.width > 0 &&
      rect.height > 0
    );
  };
  const nativeRoot = findRenderedThreadScrollRoot(documentRef);
  const boundary =
    nativeRoot ||
    Array.from(documentRef.querySelectorAll('#thread-bottom, #thread-bottom-container')).find(
      isRendered,
    );
  if (!boundary) return '';

  const marker = boundary.cloneNode(false);
  for (const attribute of Array.from(marker.attributes)) {
    marker.removeAttribute(attribute.name);
  }
  if (nativeRoot) {
    marker.setAttribute('class', 'thread-scroll-container');
  } else {
    const id = boundary.getAttribute('id');
    if (!['thread-bottom', 'thread-bottom-container'].includes(id)) return '';
    marker.setAttribute('id', id);
  }
  return marker.outerHTML;
}

async function captureByType(page, captureType, state) {
  if (captureType === 'body') {
    return page.evaluate(() => document.body?.outerHTML || '');
  }
  if (captureType === 'thread-bottom') {
    return page.evaluate(
      ({ scrollRootFinderSource, boundaryCaptureSource }) => {
        const findRenderedThreadScrollRoot = new Function(`return (${scrollRootFinderSource})`)();
        const captureBoundary = new Function(
          'findRenderedThreadScrollRoot',
          `return (${boundaryCaptureSource})`,
        )(findRenderedThreadScrollRoot);
        return captureBoundary(document);
      },
      {
        scrollRootFinderSource: findRenderedThreadScrollRoot.toString(),
        boundaryCaptureSource: captureRenderedThreadBottomBoundary.toString(),
      },
    );
  }
  if (captureType === 'header-area') {
    return page.evaluate(() => {
      const header = document.getElementById('page-header');
      return (
        header?.closest?.('[data-scroll-root]')?.outerHTML ||
        header?.parentElement?.outerHTML ||
        header?.outerHTML ||
        document
          .querySelector('main header [data-testid="app-shell-header-context-menu-surface"]')
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
  if (captureType === 'latest-open-dialog') {
    return state.latestDialogHtml || '';
  }
  if (captureType === 'shortcut-overlay') {
    return state.shortcutOverlayHtml || '';
  }
  if (captureType === 'configure-dialog') {
    return (
      (await page
        .locator('[role="dialog"]')
        .first()
        .evaluate((node) => node.outerHTML)
        .catch(() => '')) || ''
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
      const listbox = Array.from(document.querySelectorAll('[role="listbox"]'))
        .filter(isVisible)
        .at(-1);
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

function buildProbeCaptureMarkup(page, definition, { targetLocator = null } = {}) {
  const targetRef = definition.capture?.targetRef;
  const expectedTargetRef = LIVE_PROBE_CAPTURE_TARGET_BY_STATE[definition.stateId];
  if (definition.capture?.type !== 'probe-target' || targetRef !== expectedTargetRef) {
    throw new Error(`Unsupported probe capture target for ${definition.stateId}.`);
  }

  if (targetRef === 'edit-message-button') {
    if (!targetLocator) throw new Error('Edit capture requires the prepared user-turn button.');
    return targetLocator.evaluate((button) => button.outerHTML);
  }

  return page.evaluate(
    ({
      stateId,
      targetRef,
      codeboxContentSelectors,
      assistantContainerSelector,
      userMessageSelectors,
      gptMenuTriggerSelector,
      gptMenuItemIconSelectors,
      gptOpenMenuSelector,
      composerToolItemSelector,
      composerControlFormSelector,
      nativeSendButtonSelector,
      nativeStopButtonSelector,
      dictationControlSpecs,
    }) => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement) || node.hidden || node.closest('[aria-hidden="true"]')) {
          return false;
        }
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const unique = (nodes) => [...new Set(nodes)];
      const wrapper = (content) => `<div data-csp-probe-state="${stateId}">${content}</div>`;
      const visibleComposerEntries = () =>
        Array.from(document.querySelectorAll(composerControlFormSelector))
          .map((form) => ({
            form,
            textbox: Array.from(
              form.querySelectorAll('[contenteditable="true"][role="textbox"]'),
            ).find(isVisible),
          }))
          .filter(({ form, textbox }) => isVisible(form) && textbox);
      const findUniqueComposerControl = (buttonSelector) => {
        const matches = visibleComposerEntries().flatMap((entry) =>
          Array.from(entry.form.querySelectorAll(buttonSelector))
            .filter(
              (button) =>
                isVisible(button) &&
                !button.disabled &&
                button.getAttribute('aria-disabled') !== 'true',
            )
            .map((button) => ({ ...entry, button })),
        );
        return matches.length === 1 ? matches[0] : null;
      };
      const isStopButton = (button) =>
        button.getAttribute('data-testid') === 'stop-button' ||
        button.getAttribute('data-test-id') === 'stop-button' ||
        button.matches('button:has(svg path[d^="M4.5 5.75C4.5 5.05964"])');
      const captureComposerControl = (match) => {
        if (!match) return '';
        const formShell = match.form.cloneNode(false);
        formShell.appendChild(match.textbox.cloneNode(false));
        formShell.appendChild(match.button.cloneNode(true));
        return formShell.outerHTML ? wrapper(formShell.outerHTML) : '';
      };
      const visibleCodeBlocks = () => {
        const nodes = unique(
          codeboxContentSelectors.flatMap((selector) =>
            Array.from(document.querySelectorAll(selector)),
          ),
        ).filter(
          (node) =>
            isVisible(node) && node.closest(assistantContainerSelector) && node.matches('code'),
        );
        return nodes.map((node) => node.closest('pre') || node);
      };
      const serializeCodeBlocks = () =>
        unique(visibleCodeBlocks())
          .map((node) => node.outerHTML)
          .join('');
      const findGptMenuTrigger = () => {
        const isPartlyVisibleAboveComposer = (node) => {
          if (!node) return false;
          const rect = node.getBoundingClientRect();
          const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
          const inViewport =
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < viewportHeight &&
            rect.left < viewportWidth;
          if (!inViewport) return false;

          const composerContainer = document.getElementById('thread-bottom-container');
          const composer =
            composerContainer?.querySelector('.absolute.start-0.end-0.bottom-full.z-20') ||
            composerContainer?.querySelector('form[data-type="unified-composer"]') ||
            composerContainer?.querySelector('#composer-background') ||
            document.querySelector('#composer-background') ||
            document.querySelector('form[data-type="unified-composer"]');
          const composerTop = composer?.getBoundingClientRect()?.top;
          if (!Number.isFinite(composerTop)) return true;
          if (
            node.closest(
              '#thread-bottom-container, #thread-bottom, form[data-type="unified-composer"], #composer-background',
            )
          ) {
            return true;
          }
          return rect.bottom <= composerTop - 1;
        };
        const scopes = [
          document.querySelector('#page-header'),
          document.querySelector('#bottomBarContainer'),
          document,
        ];
        for (const scope of scopes) {
          if (!scope) continue;
          const candidates = Array.from(scope.querySelectorAll(gptMenuTriggerSelector)).filter(
            isPartlyVisibleAboveComposer,
          );
          if (!candidates.length) continue;
          return candidates.length === 1 ? candidates[0] : null;
        }
        return null;
      };
      const getAssociatedGptMenu = (trigger) => {
        if (!trigger) return null;
        const triggerId = trigger.getAttribute('id') || '';
        const controlledIds = (trigger.getAttribute('aria-controls') || '')
          .split(/\s+/)
          .filter(Boolean);
        if (!triggerId && !controlledIds.length) return null;
        return (
          Array.from(document.querySelectorAll(gptOpenMenuSelector)).find((menu) => {
            const menuId = menu.getAttribute('id') || '';
            const labelledByIds = (menu.getAttribute('aria-labelledby') || '').split(/\s+/);
            return (
              (menuId && controlledIds.includes(menuId)) ||
              (triggerId && labelledByIds.includes(triggerId))
            );
          }) || null
        );
      };

      if (targetRef === 'code-block-content') {
        const codeBlocks = serializeCodeBlocks();
        return codeBlocks ? wrapper(codeBlocks) : '';
      }
      if (targetRef === 'codebox-wrap-enabled') {
        const root = document.documentElement;
        if (!root?.classList.contains('csp-codebox-wrap-enabled')) return '';
        const codeBlocks = serializeCodeBlocks();
        if (!codeBlocks) return '';
        const rootClass = String(root.getAttribute('class') || '').replace(
          /[&"<>]/g,
          (character) => {
            const entities = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' };
            return entities[character];
          },
        );
        return `<div class="${rootClass}">${codeBlocks}</div>`;
      }
      if (targetRef === 'edit-send-button') {
        const editFieldSelector = userMessageSelectors
          .flatMap((selector) => [`${selector} textarea`, `${selector} [contenteditable="true"]`])
          .join(', ');
        const composerSelector =
          'form[data-thread-find-composer="true"], form[data-chatgpt-composer], #prompt-textarea, [name="prompt-textarea"]';
        const field = unique(Array.from(document.querySelectorAll(editFieldSelector))).find(
          (node) => !node.closest(composerSelector) && isVisible(node),
        );
        if (!field) return '';
        const editCard =
          field.closest('form') ||
          field.closest('.bg-token-main-surface-tertiary') ||
          field.closest('.rounded-3xl') ||
          field.closest('[data-message-id]') ||
          userMessageSelectors.map((selector) => field.closest(selector)).find(Boolean);
        if (!editCard) return '';
        const buttonRow =
          editCard.querySelector('div.flex.justify-end.gap-2') ||
          editCard.querySelector('div.flex.justify-end');
        const buttons = Array.from((buttonRow || editCard).querySelectorAll('button')).filter(
          isVisible,
        );
        const sendButton =
          buttons.find((button) => button.matches('button[type="submit"]')) ||
          (buttons.length > 1 ? buttons[buttons.length - 1] : null);
        if (!sendButton) return '';
        const fieldShell = field.cloneNode(false);
        fieldShell.removeAttribute('value');
        return wrapper(
          `${fieldShell.outerHTML}${buttons.map((button) => button.outerHTML).join('')}`,
        );
      }
      if (targetRef === 'send-button') {
        let match = findUniqueComposerControl(nativeSendButtonSelector);
        if (!match) {
          const legacySelectors = [
            '#composer-submit-button',
            'button[data-testid="send-button"]',
            'button[aria-label="Send prompt"]',
          ];
          match = visibleComposerEntries()
            .flatMap((entry) =>
              legacySelectors.flatMap((selector) =>
                Array.from(entry.form.querySelectorAll(selector)).map((button) => ({
                  ...entry,
                  button,
                })),
              ),
            )
            .find(
              ({ button }) =>
                isVisible(button) &&
                !button.disabled &&
                button.getAttribute('aria-disabled') !== 'true' &&
                !isStopButton(button),
            );
        }
        return captureComposerControl(match);
      }
      if (targetRef === 'stop-button') {
        let match = findUniqueComposerControl(nativeStopButtonSelector);
        if (!match) {
          const legacySelectors = [
            '#composer-submit-button[data-testid="stop-button"]',
            '#composer-submit-button[data-test-id="stop-button"]',
            'button[data-testid="stop-button"]',
            'button[data-test-id="stop-button"]',
            'button[aria-label="Stop"]',
          ];
          match = visibleComposerEntries()
            .flatMap((entry) =>
              legacySelectors.flatMap((selector) =>
                Array.from(entry.form.querySelectorAll(selector)).map((button) => ({
                  ...entry,
                  button,
                })),
              ),
            )
            .find(
              ({ button }) =>
                isVisible(button) &&
                !button.disabled &&
                button.getAttribute('aria-disabled') !== 'true',
            );
        }
        return captureComposerControl(match);
      }
      if (targetRef === 'temporary-chat-button') {
        const selectors = [
          'button:has(svg use[href$="#chat-bubble-dashed-light-20"])',
          'button:has(svg use[href$="#chat-bubble-checkmark-dashed-light-20"])',
        ];
        const controls = unique(
          selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))),
        ).filter(
          (node) =>
            isVisible(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true',
        );
        return controls.length === 1 ? wrapper(controls[0].outerHTML) : '';
      }
      if (targetRef === 'new-gpt-conversation-item') {
        const trigger = findGptMenuTrigger();
        const menu = getAssociatedGptMenu(trigger);
        if (!trigger || !menu || !isVisible(menu)) return '';
        const item = gptMenuItemIconSelectors
          .flatMap((selector) => Array.from(menu.querySelectorAll(selector)))
          .map((node) =>
            node.closest('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'),
          )
          .find((node) => node && isVisible(node));
        return item ? wrapper(`${trigger.outerHTML}${item.outerHTML}`) : '';
      }
      if (targetRef === 'chat-work-surface-toggle') {
        const radios = window.CSPModelPickerSelectors?.getNativeChatWorkSurfaceRadios?.(
          document,
          window,
        );
        if (
          !Array.isArray(radios) ||
          radios.length !== 2 ||
          radios.some((radio) => !isVisible(radio))
        ) {
          return '';
        }
        const group = radios[0].parentElement;
        const groupRole = group?.getAttribute('role');
        if (
          !group ||
          !['group', 'radiogroup'].includes(groupRole) ||
          radios.some((radio) => radio.parentElement !== group)
        ) {
          return '';
        }
        const groupShell = group.cloneNode(false);
        if (typeof groupShell?.appendChild !== 'function') return '';
        for (const radio of radios) groupShell.appendChild(radio.cloneNode(true));
        return groupShell.outerHTML ? wrapper(groupShell.outerHTML) : '';
      }
      if (targetRef === 'composer-study-action' || targetRef === 'composer-deep-research-action') {
        const openComposerButton = Array.from(
          document.querySelectorAll(
            'form[data-thread-find-composer="true"] button[data-composer-navigation-target="add-context"], form[data-chatgpt-composer] button[data-composer-navigation-target="add-context"]',
          ),
        ).find(
          (button) =>
            isVisible(button) &&
            (button.getAttribute('aria-expanded') === 'true' ||
              button.getAttribute('data-state') === 'open'),
        );
        if (!openComposerButton) return '';
        const studyGlyphTokens = ['#book-open-light-16', '#book-open-light-20'];
        const studyItems = Array.from(document.querySelectorAll(composerToolItemSelector))
          .filter(isVisible)
          .filter((candidate) =>
            targetRef === 'composer-deep-research-action'
              ? candidate.matches(
                  'button[data-list-navigation-item="true"]:has(img[src*="deep_research_app/icon.png"])',
                )
              : Array.from(candidate.querySelectorAll('svg')).some((svg) =>
                  studyGlyphTokens.some((glyph) => String(svg.outerHTML || '').includes(glyph)),
                ),
          );
        if (studyItems.length !== 1) return '';
        const item = studyItems[0];
        let menuScope = null;
        const requiredMentionListMarkers = [
          'data-mention-section-items',
          'data-mention-section-id',
          'data-mention-list-scroll-area',
        ];
        const observedMentionListMarkers = new Set();
        for (let ancestor = item.parentElement; ancestor && ancestor !== document.body; ) {
          for (const marker of requiredMentionListMarkers) {
            if (ancestor.hasAttribute(marker)) observedMentionListMarkers.add(marker);
          }
          if (
            ancestor.hasAttribute('data-composer-overlay-floating-ui') &&
            requiredMentionListMarkers.every((marker) => observedMentionListMarkers.has(marker))
          ) {
            menuScope = ancestor;
            break;
          }
          if (isVisible(ancestor)) {
            const roleMenu = ancestor.getAttribute('role') === 'menu';
            const fixedComposerMenu =
              getComputedStyle(ancestor).position === 'fixed' &&
              ancestor.querySelectorAll('button[data-list-navigation-item="true"]').length > 1;
            if (roleMenu || fixedComposerMenu) {
              menuScope = ancestor;
              break;
            }
          }
          ancestor = ancestor.parentElement;
        }
        return menuScope ? wrapper(item.outerHTML) : '';
      }
      if (targetRef === 'cancel-dictation-button' || targetRef === 'dictate-start-button') {
        const formSelector = 'form[data-thread-find-composer="true"], form[data-chatgpt-composer]';
        const matchingForms = Array.from(document.querySelectorAll(formSelector))
          .filter(isVisible)
          .map((form) => {
            const buttons = Array.from(form.querySelectorAll('button')).filter(isVisible);
            const hasCurrentComposerMarkers =
              form.hasAttribute('data-chatgpt-composer') &&
              form.getAttribute('data-thread-find-composer') === 'true';
            const controls = dictationControlSpecs.map((spec) => {
              const matches = buttons.filter((button) => {
                const pathMatches = Array.from(button.querySelectorAll('svg path')).some((path) =>
                  String(path.getAttribute('d') || '').startsWith(spec.pathPrefix),
                );
                const symbolMatches =
                  hasCurrentComposerMarkers &&
                  Array.from(button.querySelectorAll('svg use')).some((use) => {
                    const href = String(
                      use.getAttribute('href') || use.getAttribute('xlink:href') || '',
                    );
                    return spec.symbols.some((symbol) => href.endsWith(symbol));
                  });
                return pathMatches || symbolMatches;
              });
              return matches.length === 1 ? matches[0] : null;
            });
            return controls.every(Boolean) ? { form, controls } : null;
          })
          .filter(Boolean);
        if (matchingForms.length !== 1) return '';
        const { form, controls } = matchingForms[0];
        const formShell = form.cloneNode(false);
        if (typeof formShell?.appendChild !== 'function') return '';
        for (const control of controls) formShell.appendChild(control.cloneNode(true));
        return formShell.outerHTML ? wrapper(formShell.outerHTML) : '';
      }
      return '';
    },
    {
      stateId: definition.stateId,
      targetRef,
      codeboxContentSelectors: [...CODEBOX_CONTENT_SELECTORS],
      assistantContainerSelector: CODEBOX_VALIDATION_CONTAINER_SELECTOR,
      userMessageSelectors: [...USER_MESSAGE_SELECTORS],
      gptMenuTriggerSelector: GPT_MENU_TRIGGER_SELECTOR,
      gptMenuItemIconSelectors: [...GPT_MENU_ITEM_ICON_SELECTORS],
      gptOpenMenuSelector: GPT_OPEN_MENU_SELECTOR,
      composerToolItemSelector: COMPOSER_TOOL_ITEM_CAPTURE_SELECTOR,
      composerControlFormSelector: NATIVE_COMPOSER_FORM_SELECTOR,
      nativeSendButtonSelector: NATIVE_COMPOSER_SEND_BUTTON_SELECTOR,
      nativeStopButtonSelector: NATIVE_COMPOSER_STOP_BUTTON_SELECTOR,
      dictationControlSpecs:
        targetRef === 'cancel-dictation-button'
          ? ACTIVE_DICTATION_CONTROL_SPECS
          : DICTATION_START_CONTROL_SPECS,
    },
  );
}

export async function captureSupplementalProbeArtifact(
  page,
  definition,
  {
    auditOwned = false,
    semanticSnapshot = null,
    blankNewChatProvenance = null,
    targetLocator = null,
  } = {},
) {
  if (!definition?.probeOnly || !LIVE_PROBE_CAPTURE_TARGET_BY_STATE[definition.stateId]) {
    throw new Error('Probe capture requires a registered probe-only state.');
  }
  if (
    definition.stateId === 'probe-codebox-wrap-enabled' &&
    semanticSnapshot?.codeboxWrapEnabled !== true
  ) {
    return buildArtifactRecord(
      definition,
      'deferred',
      '',
      'The semantic probe snapshot did not observe the codebox wrap class enabled.',
    );
  }
  const blankHomeCaptureAllowed =
    [
      'probe-send-button',
      'probe-temporary-chat',
      'probe-blank-chat-work-surface-toggle',
      'probe-composer-study-search',
      'probe-composer-deep-research-search',
      'probe-active-dictation-controls',
      'probe-blank-chat-dictate-start',
    ].includes(definition.stateId) &&
    isVerifiedBlankNewChatProvenance(blankNewChatProvenance, page.url());
  if (
    AUDIT_OWNED_LIVE_PROBE_CAPTURE_STATES.has(definition.stateId) &&
    !auditOwned &&
    !blankHomeCaptureAllowed
  ) {
    return buildArtifactRecord(
      definition,
      'deferred',
      '',
      'Probe-state capture requires the prepared audit-owned disposable conversation.',
    );
  }

  try {
    if (definition.stateId === 'probe-blank-chat-work-surface-toggle') {
      await injectDevScrapeWideIntoPage(page);
      await page.waitForFunction(
        () => {
          const radios = window.CSPModelPickerSelectors?.getNativeChatWorkSurfaceRadios?.(
            document,
            window,
          );
          return Array.isArray(radios) && radios.length === 2;
        },
        undefined,
        { timeout: 5000 },
      );
    }
    let rawHtml = await buildProbeCaptureMarkup(page, definition, { targetLocator });
    if (definition.stateId === 'probe-temporary-chat' && !String(rawHtml || '').trim()) {
      await selectChatModeForEditProbe(page, blankNewChatProvenance);
      rawHtml = await buildProbeCaptureMarkup(page, definition);
    }
    if (!String(rawHtml || '').trim()) {
      throw new Error(
        `No matching ${definition.capture?.targetRef || 'probe'} fragment was found.`,
      );
    }
    return buildArtifactRecord(definition, 'captured', rawHtml);
  } catch (error) {
    return buildArtifactRecord(
      definition,
      'failed',
      '',
      error?.message || String(error) || 'Unknown probe-state capture failure',
    );
  }
}

export function isVerifiedBlankNewChatProvenance(provenance, currentUrl) {
  if (
    provenance?.kind !== 'verified-blank-new-chat' ||
    !['prepare-new-conversation', 'shortcut-semantic-postcondition'].includes(provenance.source) ||
    provenance.url !== currentUrl ||
    provenance.userMessageCount !== 0 ||
    provenance.assistantMessageCount !== 0 ||
    provenance.composerHasText !== false
  ) {
    return false;
  }
  try {
    const parsed = new URL(provenance.url);
    return (
      parsed.origin === 'https://chatgpt.com' &&
      parsed.pathname === '/' &&
      !parsed.search &&
      !parsed.hash &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
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
  const inventory = await buildCurrentShortcutInventory(exports.DUMP_REGISTRY);
  const shortcutOverlayAction = inventory.shortcuts.find(
    (shortcut) => shortcut.actionId === 'shortcutKeyShowOverlay',
  );
  let modelCapabilities = deriveCollectorCapabilities({
    freshModelCatalog: options.freshModelCatalog,
  });
  const rawArtifacts = new Map();
  const artifacts = [];
  let currentModelCatalogActionProjection = null;

  for (const definition of exports.DUMP_REGISTRY) {
    if (definition.aliasOf || definition.probeOnly) continue;
    const capabilityDeferral = getRegistryCapabilityDeferral(definition, modelCapabilities);
    if (capabilityDeferral) {
      artifacts.push(buildArtifactRecord(definition, 'deferred', '', capabilityDeferral));
      continue;
    }
    let restoreViewportSize = null;
    try {
      await closeOpenMenus(page);
      await closeConfigureDialog(page);
      await page.waitForTimeout(250);
      const state = {
        currentTurnTestId: null,
        latestMenuHtml: '',
        latestDialogHtml: '',
        shortcutOverlayHtml: '',
        freshModelCatalogRefresh: options.freshModelCatalogRefresh || null,
        collectCurrentModelCatalogActionProjection: definition.stateId === 'model-switcher-menu',
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
          await applyProbeStateStep(page, step, state);
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
        if (step.type === 'open-search-chats-dialog' || step.type === 'open-shortcut-overlay') {
          await executeSafeTargetCaptureStep(page, context, step, state, {
            shortcut: shortcutOverlayAction,
          });
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
      if (definition.stateId === 'model-switcher-menu') {
        currentModelCatalogActionProjection = state.currentModelCatalogActionProjection || null;
        const modelMenuTarget = inventory.targets.find(
          (target) => target.targetId === 'model-switcher-menu',
        );
        modelCapabilities = deriveCollectorCapabilities({
          freshModelCatalog: options.freshModelCatalog,
          modelMenuTarget,
          modelMenuText: rawHtml,
          currentModelCatalogActionProjection,
        });
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
    const capabilityDeferral = getRegistryCapabilityDeferral(definition, modelCapabilities);
    if (capabilityDeferral) {
      artifacts.push(buildArtifactRecord(definition, 'deferred', '', capabilityDeferral));
      continue;
    }
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

  for (const deferred of exports.DEFERRED_ARTIFACTS) {
    artifacts.push(buildArtifactRecord(deferred, deferred.status || 'deferred'));
  }
  for (const definition of exports.DUMP_REGISTRY.filter((item) => item.probeOnly)) {
    artifacts.push(
      buildArtifactRecord(
        definition,
        definition.status || 'deferred',
        '',
        'Probe-only state capture is deferred until an opted-in live shortcut probe prepares it.',
      ),
    );
  }

  return {
    runKind: 'devscrapewide',
    fixtureUrl,
    fixtureOwnership: options.fixtureOwnership || null,
    pageInfo,
    capabilities: assertCapabilities(modelCapabilities),
    currentModelCatalogActionProjection,
    startedAt,
    completedAt: new Date().toISOString(),
    capturedCount: artifacts.filter(
      (artifact) => artifact.status === 'captured' || artifact.status === 'alias',
    ).length,
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

export async function refreshModelCatalogForValidation(page, context, _options = {}) {
  // A fresh page has no page-world selectors until the collector is injected.
  // Install them before reading the native mode that binds this refresh proof.
  await injectDevScrapeWideIntoPage(page);
  const refreshStartedAtMs = Date.now();
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
    const refreshCompletedAtMs = Date.now();
    const modeEvidence = await readModelCatalogProjectionEvidence(page);
    const verifiedMode = modeEvidence?.mode?.status === 'pass' ? modeEvidence.mode : null;
    return {
      ...result,
      collectorRuntimeModeProof: {
        schemaVersion: 1,
        source: FRESH_MODEL_CATALOG_REFRESH_PROOF_SOURCE,
        status: verifiedMode ? 'pass' : 'unknown',
        mode: verifiedMode?.mode || '',
        modeSource: verifiedMode?.source || '',
        startedAtMs: refreshStartedAtMs,
        completedAtMs: refreshCompletedAtMs,
      },
    };
  } finally {
    await session.detach().catch(() => {});
  }
}

async function readExtensionSyncStorage(context, extensionId, keys) {
  await waitAroundExtensionPageAction();
  const extensionPage = await context.newPage();
  try {
    await waitAroundExtensionPageAction();
    await extensionPage.goto(
      `chrome-extension://${extensionId}/popup.html?playwrightProbe=storage`,
      {
        waitUntil: 'domcontentloaded',
        timeout: 5000,
      },
    );
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
    await extensionPage.goto(
      `chrome-extension://${extensionId}/popup.html?playwrightProbe=storage`,
      {
        waitUntil: 'domcontentloaded',
        timeout: 5000,
      },
    );
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

function findGptMenuTriggerSelection({ triggerSelector }) {
  const isPartlyVisibleAboveComposer = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const inViewport =
      rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < viewportWidth;
    if (!inViewport) return false;

    const composerContainer = document.getElementById('thread-bottom-container');
    const composer =
      composerContainer?.querySelector('.absolute.start-0.end-0.bottom-full.z-20') ||
      composerContainer?.querySelector('form[data-type="unified-composer"]') ||
      composerContainer?.querySelector('#composer-background') ||
      document.querySelector('#composer-background') ||
      document.querySelector('form[data-type="unified-composer"]');
    const composerTop = composer?.getBoundingClientRect()?.top;
    if (!Number.isFinite(composerTop)) return true;
    if (
      node.closest(
        '#thread-bottom-container, #thread-bottom, form[data-type="unified-composer"], #composer-background',
      )
    ) {
      return true;
    }
    return rect.bottom <= composerTop - 1;
  };
  const scopes = [
    { selector: '#page-header', element: document.querySelector('#page-header') },
    { selector: '#bottomBarContainer', element: document.querySelector('#bottomBarContainer') },
    { selector: '', element: document },
  ];
  for (const scope of scopes) {
    if (!scope.element) continue;
    const matches = Array.from(scope.element.querySelectorAll(triggerSelector));
    const visible = matches.filter(isPartlyVisibleAboveComposer);
    if (!visible.length) continue;
    if (visible.length !== 1) return null;
    return { scopeSelector: scope.selector, index: matches.indexOf(visible[0]) };
  }
  return null;
}

function isAssociatedGptMenuReady({
  triggerSelector,
  menuSelector,
  iconSelectors,
  scopeSelector,
  triggerIndex,
}) {
  const scope = scopeSelector ? document.querySelector(scopeSelector) : document;
  if (!scope) return false;
  const trigger = Array.from(scope.querySelectorAll(triggerSelector))[triggerIndex];
  if (!trigger) return false;
  const triggerId = trigger.getAttribute('id') || '';
  const controlledIds = (trigger.getAttribute('aria-controls') || '').split(/\s+/).filter(Boolean);
  if (!triggerId && !controlledIds.length) return false;
  return Array.from(document.querySelectorAll(menuSelector)).some((menu) => {
    const menuId = menu.getAttribute('id') || '';
    const labelledByIds = (menu.getAttribute('aria-labelledby') || '').split(/\s+/);
    const associated =
      (menuId && controlledIds.includes(menuId)) ||
      (triggerId && labelledByIds.includes(triggerId));
    return associated && iconSelectors.some((selector) => menu.querySelector(selector));
  });
}

export async function openGptMenuForProbeState(page) {
  const triggerSelector = GPT_MENU_TRIGGER_SELECTOR;
  const triggerSelection = await page.evaluate(findGptMenuTriggerSelection, { triggerSelector });
  if (!triggerSelection) {
    throw new Error('Could not find the existing GPT header menu trigger.');
  }
  const readinessOptions = {
    triggerSelector,
    menuSelector: GPT_OPEN_MENU_SELECTOR,
    iconSelectors: [...GPT_MENU_ITEM_ICON_SELECTORS],
    scopeSelector: triggerSelection.scopeSelector,
    triggerIndex: triggerSelection.index,
  };
  if (await page.evaluate(isAssociatedGptMenuReady, readinessOptions)) return;

  const triggerLocator = triggerSelection.scopeSelector
    ? page.locator(triggerSelection.scopeSelector).locator(triggerSelector)
    : page.locator(triggerSelector);
  await triggerLocator.nth(triggerSelection.index).click();
  await page.waitForFunction(isAssociatedGptMenuReady, readinessOptions, { timeout: 5000 });
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
    if (state.collectCurrentModelCatalogActionProjection === true) {
      state.currentModelCatalogActionProjection =
        await collectFreshCurrentModelCatalogActionProjection(
          page,
          state.freshModelCatalogRefresh || null,
        );
    }
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
  if (step.type === 'open-gpt-menu') {
    await openGptMenuForProbeState(page);
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

export async function prepareNewConversationProbeState(
  page,
  _fixtureUrl,
  {
    reportSettle = false,
    checkpoint: preparationCheckpoint,
    persistCheckpoint: preparationPersistCheckpoint,
    diagnosticCheckpoint,
    diagnosticPersistCheckpoint,
    scope = 'prepare-new-conversation',
  } = {},
) {
  const checkpoint = diagnosticCheckpoint || preparationCheckpoint;
  const persistCheckpoint = diagnosticPersistCheckpoint || preparationPersistCheckpoint;
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'new-conversation.home-navigation');
  await page.goto(CHATGPT_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'new-conversation.home-ready');
  await waitForFixtureConversationReady(page, 15000, { fixtureUrl: CHATGPT_HOME_URL });
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'new-conversation.close-menus');
  await closeOpenMenus(page);
  await markProbeDiagnosticStage(
    checkpoint,
    persistCheckpoint,
    'new-conversation.close-transient-ui',
  );
  await closeTransientUi(page);
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'new-conversation.blank-proof');
  let blankState = await captureLiveProbeSemanticSnapshot(page, null);
  if (
    !isChatGptRootPageUrl(blankState.url) ||
    blankState.userMessageCount ||
    blankState.assistantMessageCount
  ) {
    throw new Error(
      'ChatGPT home did not open a zero-turn audit chat; no existing conversation was changed.',
    );
  }
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'new-conversation.clear-draft');
  const draftPreparation = await clearComposerDraftForBlankHomeAudit(page, {
    checkpoint: preparationCheckpoint,
    persistCheckpoint: preparationPersistCheckpoint,
    scope,
  });
  if (!['clean', 'cleared'].includes(draftPreparation.status)) {
    throw new Error(`Blank-home composer preparation failed: ${draftPreparation.reason}`);
  }
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'new-conversation.verify-blank');
  blankState = await captureLiveProbeSemanticSnapshot(page, null);
  if (
    !isChatGptRootPageUrl(blankState.url) ||
    blankState.userMessageCount ||
    blankState.assistantMessageCount ||
    blankState.composerHasText
  ) {
    throw new Error(
      'ChatGPT home changed during blank-home preparation; no existing conversation was changed.',
    );
  }
  verifiedBlankNewChatByPage.set(page, {
    kind: 'verified-blank-new-chat',
    source: 'prepare-new-conversation',
    url: blankState.url,
    userMessageCount: 0,
    assistantMessageCount: 0,
    composerHasText: false,
  });
  if (reportSettle) {
    console.log(
      `Fresh blank ChatGPT conversation verified; waiting ${NEW_CONVERSATION_SETTLE_MS} ms before scanning.`,
    );
  }
  const settleStartedAt = reportSettle ? Date.now() : 0;
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'new-conversation.settle');
  await page.waitForTimeout(NEW_CONVERSATION_SETTLE_MS);
  if (reportSettle) {
    console.log(
      `Blank-chat settle completed after ${Date.now() - settleStartedAt} ms; starting model refresh and dev scrape.`,
    );
  }
  return {
    kind: 'verified-blank-new-chat',
    source: 'prepare-new-conversation',
    url: blankState.url,
    userMessageCount: blankState.userMessageCount,
    assistantMessageCount: blankState.assistantMessageCount,
    composerHasText: blankState.composerHasText,
  };
}

export function getCodeboxProbePreparationPlan({
  captureOnly = false,
  sessionInitialized = false,
  sessionConversationUrl = '',
  currentUrl = '',
} = {}) {
  let reusableConversationUrl = '';
  try {
    const parsedUrl = new URL(sessionConversationUrl);
    if (
      parsedUrl.origin === 'https://chatgpt.com' &&
      !parsedUrl.username &&
      !parsedUrl.password &&
      /^\/c\/[A-Za-z0-9-]+$/.test(parsedUrl.pathname) &&
      !parsedUrl.search &&
      !parsedUrl.hash
    ) {
      reusableConversationUrl = parsedUrl.href;
    }
  } catch {}

  const reuseConversation = sessionInitialized && Boolean(reusableConversationUrl);
  return {
    reuseConversationUrl: reuseConversation ? reusableConversationUrl : '',
    restoreConversation: reuseConversation && currentUrl !== reusableConversationUrl,
    promptKeys: captureOnly ? ['wrap-story'] : ['wrap-story', 'copy-story'],
    requiredCodeBlockCount: captureOnly ? 1 : 2,
    clearClipboard: !captureOnly,
  };
}

function normalizeComposerText(value) {
  return String(value || '').replace(/\r\n?/g, '\n');
}

function isComposerTextBlank(value) {
  return !normalizeComposerText(value).trim();
}

function isChatGptRootPageUrl(value) {
  try {
    const parsedUrl = new URL(value);
    return (
      parsedUrl.origin === 'https://chatgpt.com' &&
      !parsedUrl.username &&
      !parsedUrl.password &&
      parsedUrl.pathname === '/'
    );
  } catch {
    return false;
  }
}

function rememberAuditOwnedConversationIds(page, conversationIds) {
  if (!page || !Array.isArray(conversationIds)) return;
  const ownedIds = ownedConversationIdsByPage.get(page) || new Set();
  for (const conversationId of conversationIds) {
    if (typeof conversationId === 'string' && /^[A-Za-z0-9-]+$/.test(conversationId)) {
      ownedIds.add(conversationId);
    }
  }
  ownedConversationIdsByPage.set(page, ownedIds);
}

function resolveOwnedComposerScope(page, options = {}) {
  let parsedUrl;
  try {
    parsedUrl = new URL(page.url());
  } catch {
    return null;
  }
  if (parsedUrl.origin !== 'https://chatgpt.com' || parsedUrl.username || parsedUrl.password) {
    return null;
  }

  const conversationId = parsedUrl.pathname.match(/^\/c\/([A-Za-z0-9-]+)$/)?.[1] || '';
  const knownIds = new Set([
    ...(Array.isArray(options.auditOwnedConversationIds) ? options.auditOwnedConversationIds : []),
    ...(ownedConversationIdsByPage.get(page) || []),
  ]);
  if (conversationId && knownIds.has(conversationId)) {
    return { kind: 'audit-owned-conversation', conversationId };
  }

  const provenance = options.blankHomeProvenance || verifiedBlankNewChatByPage.get(page);
  if (
    options.allowVerifiedBlankHome !== false &&
    isVerifiedBlankNewChatProvenance(provenance, parsedUrl.href)
  ) {
    return { kind: 'verified-blank-home' };
  }
  return null;
}

async function findVisibleComposer(page, { timeoutMs = 0 } = {}) {
  const deadline = Date.now() + timeoutMs;
  do {
    const candidates = page.locator(COMPOSER_TEXTBOX_SELECTORS.join(', '));
    try {
      const candidateCount = await candidates.count();
      for (let index = 0; index < candidateCount; index += 1) {
        const candidate = candidates.nth(index);
        if (await candidate.isVisible().catch(() => false)) return candidate;
      }
    } catch {}

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return null;
    await page.waitForTimeout(Math.min(100, remainingMs)).catch(() => {});
  } while (Date.now() <= deadline);
  return null;
}

async function readComposerState(composer) {
  const state = await composer.evaluate((element) => {
    const tagName = String(element?.tagName || '').toLowerCase();
    const isFormControl = tagName === 'input' || tagName === 'textarea';
    return {
      isFormControl,
      text: isFormControl ? element.value : (element.innerText ?? element.textContent ?? ''),
      textContent: isFormControl ? null : (element.textContent ?? ''),
    };
  });
  return {
    ...state,
    text: normalizeComposerText(state.text),
    textContent: state.textContent === null ? null : normalizeComposerText(state.textContent),
  };
}

async function readComposerText(composer) {
  return (await readComposerState(composer)).text;
}

function isStructurallyBlankComposerState(state) {
  if (!state) return false;
  if (state.isFormControl) return state.text === '';
  return state.textContent === '' && !state.text.trim();
}

export async function prepareStructurallyBlankComposerForMenu(page) {
  const composer = await findVisibleComposer(page);
  if (!composer) throw new Error('No visible composer was available before opening the menu.');
  const before = await readComposerState(composer);
  if (!isStructurallyBlankComposerState(before)) {
    return { status: 'preserved', isFormControl: before.isFormControl };
  }
  if (before.text) {
    await clearStructurallyBlankComposer(page, composer, before.text, { focusOnly: true });
  }
  const after = await readComposerState(composer);
  if (!isStructurallyBlankComposerState(after)) {
    throw new Error('The structurally blank composer changed during pre-menu cleanup.');
  }
  return { status: before.text ? 'cleared' : 'already-blank' };
}

function recordBlankHomeDraftPreparation(checkpoint, result) {
  if (!checkpoint) return;
  checkpoint.blankHomeDraftPreparation = {
    status: result.status,
    scope: result.scope,
    reason: result.reason,
    completedAt: new Date().toISOString(),
  };
}

async function persistBlankHomeDraftPreparation(checkpoint, persistCheckpoint, result) {
  recordBlankHomeDraftPreparation(checkpoint, result);
  if (typeof persistCheckpoint !== 'function') return true;
  try {
    await persistCheckpoint();
    return true;
  } catch {
    if (checkpoint) {
      checkpoint.blankHomeDraftPreparation = {
        status: 'failed',
        scope: result.scope,
        reason: 'The composer preparation status could not be persisted.',
        completedAt: new Date().toISOString(),
      };
      checkpoint.blankHomeDraftPreparationPersistenceError =
        'Composer preparation status could not be persisted.';
    }
    return false;
  }
}

export async function clearComposerDraftForBlankHomeAudit(
  page,
  { checkpoint, persistCheckpoint, scope = 'blank-home-audit-preparation' } = {},
) {
  const finish = async (status, reason) => {
    const result = { status, scope, reason };
    const persisted = await persistBlankHomeDraftPreparation(checkpoint, persistCheckpoint, result);
    return persisted ? result : { ...result, status: 'failed' };
  };

  if (
    !(await persistBlankHomeDraftPreparation(checkpoint, persistCheckpoint, {
      status: 'pending',
      scope,
      reason: 'Waiting for verified zero-turn ChatGPT home preparation.',
    }))
  ) {
    return {
      status: 'failed',
      scope,
      reason: 'The composer preparation status could not be persisted.',
    };
  }

  try {
    const beforeSnapshot = await captureLiveProbeSemanticSnapshot(page, null);
    if (
      !isChatGptRootPageUrl(beforeSnapshot.url) ||
      beforeSnapshot.userMessageCount ||
      beforeSnapshot.assistantMessageCount
    ) {
      return finish(
        'not-authorized',
        'Composer cleanup requires ChatGPT home with no existing message turns.',
      );
    }

    const composer = await findVisibleComposer(page, { timeoutMs: 5000 });
    if (!composer) {
      return finish('failed', 'No visible composer was available for blank-home preparation.');
    }
    const beforeText = await readComposerText(composer);
    if (beforeText === '') {
      return finish('clean', 'No composer draft content was present.');
    }

    await composer.click({ force: true, timeout: 5000 });
    if ((await readComposerText(composer)) !== beforeText) {
      return finish(
        'conflict',
        'The composer changed before cleanup; retry blank-home preparation.',
      );
    }
    await page.keyboard.press('Control+A');
    if ((await readComposerText(composer)) !== beforeText) {
      return finish(
        'conflict',
        'The composer changed during selection; retry blank-home preparation.',
      );
    }
    await page.keyboard.press('Backspace');
    if (!isComposerTextBlank(await readComposerText(composer))) {
      return finish(
        'conflict',
        'The composer changed during cleanup; retry blank-home preparation.',
      );
    }

    const afterSnapshot = await captureLiveProbeSemanticSnapshot(page, null);
    if (
      !isChatGptRootPageUrl(afterSnapshot.url) ||
      afterSnapshot.userMessageCount ||
      afterSnapshot.assistantMessageCount ||
      afterSnapshot.composerHasText
    ) {
      return finish(
        'conflict',
        'ChatGPT home changed during composer cleanup; retry blank-home preparation.',
      );
    }
    activeOwnedComposerDraftByPage.delete(page);
    return finish('cleared', 'The blocking root-home draft was cleared with trusted keypresses.');
  } catch {
    return finish('failed', 'Composer cleanup failed; retry blank-home preparation.');
  }
}

async function clearStructurallyBlankComposer(page, composer, beforeText, options = {}) {
  if (!beforeText) return;
  if (options.focusOnly) {
    await composer.focus();
  } else {
    await composer.click({ force: true, timeout: 5000 });
  }
  if ((await readComposerText(composer)) !== beforeText) {
    throw new Error('The composer changed before its blank structure could be cleared.');
  }
  await page.keyboard.press('Control+A');
  if ((await readComposerText(composer)) !== beforeText) {
    throw new Error('The composer changed during selection; its draft was preserved.');
  }
  await page.keyboard.press('Backspace');
  if (!isComposerTextBlank(await readComposerText(composer))) {
    throw new Error('The blank composer structure could not be cleared safely.');
  }
}

function rememberComposerCleanupOutcome(checkpoint, result) {
  if (!checkpoint) return;
  const outcomes = Array.isArray(checkpoint.composerCleanupOutcomes)
    ? checkpoint.composerCleanupOutcomes
    : [];
  outcomes.push({
    status: result.status,
    scope: result.scope,
    reason: result.reason,
    completedAt: new Date().toISOString(),
  });
  checkpoint.composerCleanupOutcomes = outcomes.slice(-100);
}

async function persistComposerCleanupOutcome(options) {
  rememberComposerCleanupOutcome(options.checkpoint, options.result);
  try {
    await options.persistCheckpoint?.();
  } catch {
    if (options.checkpoint) {
      options.checkpoint.composerCleanupCheckpointError =
        'Composer cleanup outcome could not be persisted.';
    }
  }
}

export async function clearOwnedComposerDraft(page, expectedText, options = {}) {
  const scope = String(options.scope || 'composer-draft-cleanup');
  const expected = String(expectedText ?? '');
  let result;
  const finish = async (status, reason) => {
    result = { status, scope, reason };
    await persistComposerCleanupOutcome({ ...options, result });
    return result;
  };

  if (!OWNED_AUDIT_DRAFT_TEXTS.has(expected)) {
    return finish('not-owned', 'The expected text is not a known audit draft.');
  }
  try {
    const composer = await findVisibleComposer(page);
    if (!composer) return finish('failed', 'No visible composer was available for cleanup.');
    const beforeText = await readComposerText(composer);
    if (isComposerTextBlank(beforeText)) {
      const activeDraft = activeOwnedComposerDraftByPage.get(page);
      if (activeDraft?.expectedText === expected) activeOwnedComposerDraftByPage.delete(page);
      return finish('clean', 'The composer was already empty.');
    }
    if (!resolveOwnedComposerScope(page, options)) {
      return finish('not-owned', 'The current page has no verified audit-owned cleanup scope.');
    }
    if (beforeText !== expected) {
      return finish('conflict', 'Composer text changed; the draft was preserved.');
    }

    await composer.click({ force: true, timeout: 5000 });
    if ((await readComposerText(composer)) !== expected) {
      return finish('conflict', 'Composer text changed before cleanup; the draft was preserved.');
    }
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    if (!isComposerTextBlank(await readComposerText(composer))) {
      return finish('conflict', 'Trusted keypresses did not clear the expected draft.');
    }
    const activeDraft = activeOwnedComposerDraftByPage.get(page);
    if (activeDraft?.expectedText === expected) activeOwnedComposerDraftByPage.delete(page);
    return finish('clean', 'The expected audit draft was cleared with trusted keypresses.');
  } catch {
    return finish(
      'failed',
      'Composer cleanup could not be completed; the draft was left as observed.',
    );
  }
}

async function cleanupActiveOwnedComposerDraft(page, options = {}) {
  const activeDraft = activeOwnedComposerDraftByPage.get(page);
  if (!activeDraft)
    return { status: 'not-owned', reason: 'No audit draft was recorded for cleanup.' };
  return clearOwnedComposerDraft(page, activeDraft.expectedText, options);
}

export async function finalizeProbeComposerCleanup(rows, completedCases, actionId, cleanup) {
  let cleanupStatus = 'failed';
  let cleanupThrew = false;
  try {
    const result = await cleanup();
    cleanupStatus = ['clean', 'not-owned', 'conflict', 'failed'].includes(result?.status)
      ? result.status
      : 'failed';
  } catch {
    cleanupThrew = true;
  }

  if (cleanupStatus === 'clean' || cleanupStatus === 'not-owned') {
    return { cleanupStatus, cleanupThrew, downgraded: false, reason: '' };
  }

  const reason =
    cleanupStatus === 'conflict'
      ? 'Owned composer draft cleanup detected a changed draft and preserved it.'
      : 'Owned composer draft cleanup could not verify that the audit draft was cleared.';
  const appendReason = (existingReason) => {
    const existing = String(existingReason || '').trim();
    return existing.includes(reason) ? existing : [existing, reason].filter(Boolean).join(' ');
  };
  const row = [...(Array.isArray(rows) ? rows : [])]
    .reverse()
    .find((candidate) => candidate?.actionId === actionId);
  const completedCase = [...(Array.isArray(completedCases) ? completedCases : [])]
    .reverse()
    .find((candidate) => candidate?.rowId === `global:${actionId}`);

  if (row) {
    row.status = 'fail';
    row.reason = appendReason(row.reason);
  }
  if (completedCase) {
    completedCase.status = 'fail';
    completedCase.reason = appendReason(completedCase.reason);
  }

  return { cleanupStatus, cleanupThrew, downgraded: Boolean(row || completedCase), reason };
}

export async function setComposerText(page, text, options = {}) {
  const expectedText = normalizeComposerText(text);
  const composer = await findVisibleComposer(page);
  if (!composer) throw new Error('Could not find a visible prompt composer.');

  let composerState = await readComposerState(composer);
  let actualText = composerState.text;
  const activeDraft = activeOwnedComposerDraftByPage.get(page);
  if (!expectedText) {
    if (isComposerTextBlank(actualText)) {
      if (activeDraft) activeOwnedComposerDraftByPage.delete(page);
      return;
    }
    if (!activeDraft) throw new Error('Refusing to clear composer text without audit ownership.');
    const cleared = await clearOwnedComposerDraft(page, activeDraft.expectedText, {
      ...options,
      scope: options.scope || 'set-composer-clear',
    });
    if (cleared.status !== 'clean') {
      throw new Error('The owned composer draft could not be cleared safely.');
    }
    return;
  }
  if (!OWNED_AUDIT_DRAFT_TEXTS.has(expectedText)) {
    throw new Error('Refusing to type text that is not a known audit draft.');
  }

  if (!isComposerTextBlank(actualText)) {
    if (
      activeDraft?.expectedText === expectedText &&
      activeDraft.url === page.url() &&
      actualText === expectedText
    ) {
      return;
    }
    if (!activeDraft) throw new Error('Refusing to replace an unowned composer draft.');
    const cleared = await clearOwnedComposerDraft(page, activeDraft.expectedText, {
      ...options,
      scope: options.scope || 'set-composer-replacement',
    });
    if (cleared.status !== 'clean') {
      throw new Error('The existing composer text could not be replaced safely.');
    }
    actualText = '';
    composerState = await readComposerState(composer);
  } else if (!isStructurallyBlankComposerState(composerState)) {
    throw new Error('Refusing to type over unowned composer whitespace.');
  }

  const ownership = resolveOwnedComposerScope(page, options);
  if (!ownership || !isComposerTextBlank(actualText)) {
    throw new Error('Refusing to type into a composer without verified audit ownership.');
  }
  if (actualText && !(options.focusOnly && isStructurallyBlankComposerState(composerState))) {
    await clearStructurallyBlankComposer(page, composer, actualText, options);
    composerState = await readComposerState(composer);
    actualText = composerState.text;
  }

  const nextDraft = { expectedText, url: page.url(), ownershipKind: ownership.kind };
  activeOwnedComposerDraftByPage.set(page, nextDraft);
  if (options.focusOnly) {
    await composer.focus();
  } else {
    await composer.click({ force: true, timeout: 5000 });
  }
  const beforeTyping = await readComposerState(composer);
  if (
    !isComposerTextBlank(beforeTyping.text) ||
    (!isStructurallyBlankComposerState(beforeTyping) && beforeTyping.text !== '')
  ) {
    throw new Error('The composer changed before the audit draft could be typed.');
  }
  await page.keyboard.type(expectedText, { delay: 5 });
  if ((await readComposerText(composer)) !== expectedText) {
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

export async function prepareComposerDraftMessageProbeState(page, fixtureUrl, options = {}) {
  const { checkpoint, persistCheckpoint } = options;
  const blankNewChatProvenance = await prepareNewConversationProbeState(page, fixtureUrl, {
    diagnosticCheckpoint: checkpoint,
    diagnosticPersistCheckpoint: persistCheckpoint,
  });
  await markProbeDiagnosticStage(
    checkpoint,
    persistCheckpoint,
    'composer-draft-message.enable-control',
  );
  await ensureControlSendStopEnabled(page);
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'composer-draft-message.set-text');
  await setComposerText(page, SIDE_EFFECT_MESSAGE_TEXT);
  await markProbeDiagnosticStage(
    checkpoint,
    persistCheckpoint,
    'composer-draft-message.send-ready',
  );
  await waitForEnabledButton(page, SEND_BUTTON_SELECTORS);
  return blankNewChatProvenance;
}

export async function prepareInFlightMessageProbeState(page, fixtureUrl, options = {}) {
  const { checkpoint, persistCheckpoint } = options;
  const blankNewChatProvenance = await prepareNewConversationProbeState(page, fixtureUrl, {
    diagnosticCheckpoint: checkpoint,
    diagnosticPersistCheckpoint: persistCheckpoint,
  });
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'in-flight-message.enable-control');
  await ensureControlSendStopEnabled(page);
  await markProbeDiagnosticStage(
    checkpoint,
    persistCheckpoint,
    'in-flight-message.thinking-effort',
  );
  await selectThinkingEffortExtendedForProbe(page).catch(() => {});
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'in-flight-message.set-text');
  await setComposerText(page, SIDE_EFFECT_MESSAGE_TEXT);
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'in-flight-message.send');
  await clickEnabledButton(page, SEND_BUTTON_SELECTORS);
  await markProbeDiagnosticStage(
    checkpoint,
    persistCheckpoint,
    'in-flight-message.after-send-delay',
  );
  await page.waitForTimeout(STOP_AFTER_SEND_DELAY_MS);
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'in-flight-message.stop-ready');
  await waitForEnabledButton(page, STOP_BUTTON_SELECTORS, 15000);
  return blankNewChatProvenance;
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
      const messages =
        selectors
          .map((selector) => Array.from(document.querySelectorAll(selector)))
          .find((matches) => matches.length) || [];
      const latestRawText = messages.at(-1)?.textContent || '';
      const latestText = latestRawText.trim();
      const composer = document.querySelector(
        '#prompt-textarea, textarea, [role="textbox"], [contenteditable="true"]',
      );
      const composerText =
        composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement
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
    ({
      minimumCount,
      previousCount,
      previousHash,
      selectors,
      nativeSendSelector,
      nativeStopSelector,
      legacySendSelectors,
      legacyStopSelectors,
    }) => {
      const assistants =
        selectors
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
      const hasVisibleComposerTextbox = (button) => {
        const form = button.closest('form');
        return (
          isVisible(form) &&
          Array.from(form.querySelectorAll('[contenteditable="true"][role="textbox"]')).some(
            isVisible,
          )
        );
      };
      const observedStops = Array.from(document.querySelectorAll(nativeStopSelector)).filter(
        (button) =>
          isVisible(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true',
      );
      const legacyStops = legacyStopSelectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .filter((button) => isVisible(button) && !button.disabled);
      const stopVisible = observedStops.some(hasVisibleComposerTextbox) || legacyStops.length > 0;
      const observedSends = Array.from(document.querySelectorAll(nativeSendSelector)).filter(
        (button) =>
          isVisible(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true',
      );
      const legacySends = legacySendSelectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .filter(
          (button) =>
            isVisible(button) &&
            !button.disabled &&
            button.getAttribute('aria-disabled') !== 'true' &&
            button.getAttribute('data-testid') !== 'stop-button' &&
            button.getAttribute('data-test-id') !== 'stop-button' &&
            !button.matches('button:has(svg path[d^="M4.5 5.75C4.5 5.05964"])'),
        );
      const sendReady =
        (observedSends.length === 1 && hasVisibleComposerTextbox(observedSends[0])) ||
        legacySends.length > 0;
      const responseTurn = latest?.closest('[data-content-search-turn-key]');
      const responseCompleteControlVisible = Array.from(
        responseTurn?.querySelectorAll('button[aria-label="Regenerate response"]') || [],
      ).some((button) => {
        if (!(button instanceof HTMLElement)) return false;
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
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
      nativeSendSelector: NATIVE_COMPOSER_SEND_SELECTOR,
      nativeStopSelector: NATIVE_COMPOSER_STOP_SELECTOR,
      legacySendSelectors: [...LEGACY_SEND_BUTTON_SELECTORS],
      legacyStopSelectors: [...LEGACY_STOP_BUTTON_SELECTORS],
    },
    { timeout: 60000 },
  );
}

async function createAuditOwnedFixtureConversation(
  page,
  { checkpoint, persistCheckpoint, trackAuditOwnedConversation } = {},
) {
  const prompts = AUDIT_FIXTURE_PROMPT_TEXTS;
  if (!isVerifiedBlankNewChatProvenance(verifiedBlankNewChatByPage.get(page), page.url())) {
    await page.goto(CHATGPT_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
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
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              rect.width > 0 &&
              rect.height > 0
            );
          }),
        )
      );
    },
    undefined,
    { timeout: 20000 },
  );
  let before = await captureLiveProbeSemanticSnapshot(page, null);
  if (
    !isChatGptRootPageUrl(before.url) ||
    before.userMessageCount ||
    before.assistantMessageCount
  ) {
    throw new Error(
      'ChatGPT home was not a zero-turn audit chat; no existing conversation was changed.',
    );
  }
  const draftPreparation = await clearComposerDraftForBlankHomeAudit(page, {
    checkpoint,
    persistCheckpoint,
    scope: 'setup:audit-owned-fixture',
  });
  if (!['clean', 'cleared'].includes(draftPreparation.status)) {
    throw new Error(`Blank-home composer preparation failed: ${draftPreparation.reason}`);
  }
  before = await captureLiveProbeSemanticSnapshot(page, null);
  if (
    !isChatGptRootPageUrl(before.url) ||
    before.userMessageCount ||
    before.assistantMessageCount ||
    before.composerHasText
  ) {
    throw new Error(
      'ChatGPT home changed during blank-home preparation; no existing conversation was changed.',
    );
  }
  verifiedBlankNewChatByPage.set(page, {
    kind: 'verified-blank-new-chat',
    source: 'prepare-new-conversation',
    url: before.url,
    userMessageCount: 0,
    assistantMessageCount: 0,
    composerHasText: false,
  });
  await page.waitForTimeout(NEW_CONVERSATION_SETTLE_MS);

  try {
    for (let index = 0; index < prompts.length; index += 1) {
      try {
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
        trackAuditOwnedConversation(page.url());
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
          await clickEnabledButton(page, STOP_BUTTON_SELECTORS).catch(() => {});
          throw error;
        }
        const responseSnapshot = await captureLiveProbeSemanticSnapshot(page, null);
        if (
          responseSnapshot.userMessageCount !== before.userMessageCount + 1 ||
          responseSnapshot.assistantMessageCount !== before.assistantMessageCount + 1 ||
          responseSnapshot.lastUserHash === before.lastUserHash ||
          responseSnapshot.lastAssistantHash === before.lastAssistantHash
        ) {
          throw new Error(
            'The audit fixture turn did not retain its committed user message and assistant response.',
          );
        }
        const confirmedFixture = parseFreshAuditFixtureUrl(responseSnapshot.url);
        trackAuditOwnedConversation(confirmedFixture.fixtureUrl);
        checkpoint.auditFixtureUrl = confirmedFixture.fixtureUrl;
        checkpoint.currentCase.sourceConversationId = confirmedFixture.conversationId;
        await persistCheckpoint();
        before = responseSnapshot;
      } finally {
        await cleanupActiveOwnedComposerDraft(page, {
          auditOwnedConversationIds: checkpoint.auditOwnedConversationIds,
          allowVerifiedBlankHome: true,
          checkpoint,
          persistCheckpoint,
          scope: `setup:audit-owned-fixture-message-${index + 1}`,
        }).catch(() => {});
      }
    }
    const conversationId = page.url().match(/\/c\/([^/]+)/)?.[1] || '';
    if (!conversationId || before.userMessageCount !== 2 || before.assistantMessageCount !== 2) {
      throw new Error(
        'The audit-owned fixture did not finish with exactly two committed user turns and two assistant responses.',
      );
    }
    checkpoint.auditFixtureUrl = page.url();
    checkpoint.completedCases.push({
      rowId: 'setup:audit-owned-fixture',
      status: 'pass',
      semanticStatus: 'pass',
      reason: '',
      fixtureUrl: page.url(),
      conversationId,
      userMessageCount: before.userMessageCount,
      assistantMessageCount: before.assistantMessageCount,
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

function parseFreshAuditFixtureUrl(fixtureUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(fixtureUrl);
  } catch {
    throw new Error('The prepared audit fixture has no valid ChatGPT conversation URL.');
  }
  const conversationId = parsedUrl.pathname.match(/^\/c\/([A-Za-z0-9-]+)$/)?.[1] || '';
  if (
    parsedUrl.origin !== 'https://chatgpt.com' ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash ||
    !conversationId
  ) {
    throw new Error('The prepared audit fixture URL is not a direct ChatGPT conversation URL.');
  }
  return { fixtureUrl: parsedUrl.href, conversationId };
}

function isCompleteFreshAuditFixtureProof(proof, fixtureUrl, conversationId) {
  let parsedFixture;
  try {
    parsedFixture = parseFreshAuditFixtureUrl(fixtureUrl);
  } catch {
    return false;
  }
  return (
    proof?.rowId === 'setup:audit-owned-fixture' &&
    proof.status === 'pass' &&
    proof.semanticStatus === 'pass' &&
    proof.fixtureUrl === fixtureUrl &&
    proof.conversationId === conversationId &&
    parsedFixture.fixtureUrl === fixtureUrl &&
    parsedFixture.conversationId === conversationId &&
    proof.userMessageCount === 2 &&
    proof.assistantMessageCount === 2 &&
    Number.isFinite(Date.parse(proof.completedAt))
  );
}

async function prepareExistingAuditOwnedConversationForNewChat(
  page,
  fixtureUrl,
  { checkpoint, fixtureOwnership, persistCheckpoint } = {},
) {
  const parsedFixture = parseFreshAuditFixtureUrl(fixtureUrl);
  const fixtureProofCandidates = [
    fixtureOwnership?.setupProof,
    checkpoint?.fixtureSetupProof,
    ...(Array.isArray(checkpoint?.completedCases) ? checkpoint.completedCases : []),
  ];
  const hasFreshFixtureProof = fixtureProofCandidates.some((proof) =>
    isCompleteFreshAuditFixtureProof(proof, parsedFixture.fixtureUrl, parsedFixture.conversationId),
  );
  if (
    !hasFreshFixtureProof ||
    !checkpoint?.auditOwnedConversationIds?.includes(parsedFixture.conversationId)
  ) {
    throw new Error(
      'New Conversation requires a verified audit-owned two-turn conversation; no user conversation was changed.',
    );
  }

  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'newconv.source-navigation');
  await resetFixturePage(page, parsedFixture.fixtureUrl);
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'newconv.source-route-ready');
  await waitForFixtureConversationReady(page, 30000, { fixtureUrl: parsedFixture.fixtureUrl });
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'newconv.source-turns-ready');
  await waitForAuditOwnedFixtureContent(page, parsedFixture.fixtureUrl);
  const snapshot = await captureLiveProbeSemanticSnapshot(page, null);
  if (
    snapshot.url !== parsedFixture.fixtureUrl ||
    snapshot.messageCount !== 4 ||
    snapshot.userMessageCount !== 2 ||
    snapshot.assistantMessageCount !== 2 ||
    !snapshot.hasComposer ||
    snapshot.composerHasText
  ) {
    throw new Error(
      'New Conversation requires the verified audit-owned conversation to remain at two user and two assistant turns with an empty composer.',
    );
  }
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'newconv.source-proof');
  return true;
}

async function markProbeDiagnosticStage(checkpoint, persistCheckpoint, stage) {
  if (!checkpoint?.currentCase) return;
  checkpoint.currentCase.diagnosticStage = stage;
  if (typeof persistCheckpoint !== 'function') return;
  try {
    await persistCheckpoint();
  } catch {}
}

export async function prepareFreshAuditOwnedFixture(
  page,
  { runDirectory, fixtureCreator = createAuditOwnedFixtureConversation } = {},
) {
  const reservedRunDirectory = await validateReservedRunDirectory(runDirectory, {
    allowedEntries: [],
  });
  const checkpointPath = path.join(reservedRunDirectory.path, AUDIT_ARTIFACT_FILENAMES.checkpoint);
  const startedAt = new Date().toISOString();
  const { exports } = await loadDevScrapeWideContract();
  const protectedFixtureUrls = [
    exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
    exports.DEV_SCRAPE_WIDE_FALLBACK_FIXTURE_URL,
  ];
  const protectedFixtureIds = new Set(
    protectedFixtureUrls
      .map((url) => {
        try {
          return new URL(url).pathname.match(/\/c\/([^/]+)/)?.[1] || '';
        } catch {
          return '';
        }
      })
      .filter(Boolean),
  );
  const checkpoint = {
    schemaVersion: 1,
    status: 'fixture-setup-pending',
    phase: 'probe-shortcuts',
    fixtureUrl: '',
    auditFixtureUrl: '',
    auditFixtureOwned: false,
    auditFixtureSourceRun: reservedRunDirectory.name,
    fixtureSetupStartedAt: startedAt,
    startedAt,
    currentCase: {
      rowId: 'setup:audit-owned-fixture',
      phase: 'fixture-creation-pending',
      intendedSideEffect: 'create a disposable two-turn keyboard audit conversation',
      sourceConversationId: '',
      startedAt,
      attempt: 1,
    },
    completedCases: [],
    auditOwnedConversationIds: [],
    storageRecoveryStatus: 'not-run',
    clipboardRecoveryStatus: 'not-needed',
    checkpointWriteError: '',
  };
  const persistCheckpoint = () =>
    persistShortcutAuditCheckpoint(reservedRunDirectory.path, checkpoint);
  const trackAuditOwnedConversation = (url) => {
    try {
      const conversationId = new URL(url).pathname.match(/\/c\/([^/]+)/)?.[1] || '';
      if (conversationId && !protectedFixtureIds.has(conversationId)) {
        checkpoint.auditOwnedConversationIds = [
          ...new Set([...checkpoint.auditOwnedConversationIds, conversationId]),
        ];
        rememberAuditOwnedConversationIds(page, [conversationId]);
      }
    } catch {}
  };

  await persistCheckpoint();
  let fixtureUrl;
  try {
    fixtureUrl = await fixtureCreator(page, {
      checkpoint,
      persistCheckpoint,
      trackAuditOwnedConversation,
    });
    const fixture = parseFreshAuditFixtureUrl(fixtureUrl);
    const setupProof = checkpoint.completedCases.find(
      (item) => item.rowId === 'setup:audit-owned-fixture',
    );
    if (
      !isCompleteFreshAuditFixtureProof(setupProof, fixture.fixtureUrl, fixture.conversationId) ||
      checkpoint.auditFixtureUrl !== fixture.fixtureUrl ||
      !checkpoint.auditOwnedConversationIds.includes(fixture.conversationId)
    ) {
      throw new Error(
        'The fresh audit fixture did not preserve its completed two-turn setup proof.',
      );
    }
    if (protectedFixtureUrls.includes(fixture.fixtureUrl)) {
      throw new Error('A protected shared conversation cannot be used as a fresh audit fixture.');
    }
    const preparedAt = new Date().toISOString();
    checkpoint.fixtureUrl = fixture.fixtureUrl;
    checkpoint.auditFixtureUrl = fixture.fixtureUrl;
    checkpoint.auditFixtureOwned = true;
    checkpoint.fixturePreparedAt = preparedAt;
    checkpoint.status = 'fixture-prepared';
    checkpoint.currentCase = null;
    await persistCheckpoint();
    return {
      kind: 'audit-owned',
      fixtureUrl: fixture.fixtureUrl,
      conversationId: fixture.conversationId,
      sourceRunFolder: reservedRunDirectory.name,
      sourceCheckpointPath: checkpointPath,
      setupStartedAt: startedAt,
      preparedAt,
      setupProof: { ...setupProof },
      setupCompletedCases: checkpoint.completedCases.map((item) => ({ ...item })),
      setupCurrentCase: checkpoint.currentCase,
      auditOwnedConversationIds: [...checkpoint.auditOwnedConversationIds],
    };
  } catch (error) {
    if (checkpoint.currentCase) checkpoint.currentCase.phase = 'fixture-creation-failed';
    checkpoint.fixtureCreationError ||= error?.message || String(error);
    checkpoint.preflightError ||= `Audit-owned fixture creation failed: ${error?.message || error}`;
    checkpoint.status = 'fixture-setup-failed';
    await persistCheckpoint().catch(() => {});
    throw error;
  }
}

export async function selectChatModeForEditProbe(page, blankNewChatProvenance) {
  if (!isVerifiedBlankNewChatProvenance(blankNewChatProvenance, page.url())) {
    throw new Error('Edit setup requires a verified blank audit chat before selecting Chat mode.');
  }
  await injectDevScrapeWideIntoPage(page);
  await page.waitForFunction(
    () =>
      window.CSPModelPickerSelectors?.getNativeChatWorkSurfaceRadios?.(document, window)?.length ===
      2,
    undefined,
    { timeout: 5000 },
  );
  await waitBeforeBrowserInteraction();
  const selected = await page.evaluate(() => {
    const selectors = window.CSPModelPickerSelectors;
    const radios = selectors?.getNativeChatWorkSurfaceRadios?.(document, window);
    if (radios?.length !== 2) return false;
    // The shared native contract orders Chat first and Work second.
    if (!selectors.isChatWorkSurfaceSelected(radios[0])) radios[0].click();
    return true;
  });
  if (!selected) throw new Error('The verified blank audit chat has no native Chat mode control.');
  await page.waitForFunction(
    () => {
      const selectors = window.CSPModelPickerSelectors;
      const radios = selectors?.getNativeChatWorkSurfaceRadios?.(document, window);
      return radios?.length === 2 && selectors.isChatWorkSurfaceSelected(radios[0]);
    },
    undefined,
    { timeout: 5000 },
  );
}

async function prepareSentDisposableMessage(page, fixtureUrl, options = {}) {
  const { checkpoint, persistCheckpoint } = options;
  const blankNewChatProvenance = await prepareNewConversationProbeState(page, fixtureUrl, {
    diagnosticCheckpoint: checkpoint,
    diagnosticPersistCheckpoint: persistCheckpoint,
  });
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'active-edit-card.chat-mode-ready');
  await selectChatModeForEditProbe(page, blankNewChatProvenance);
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'active-edit-card.thinking-effort');
  await selectThinkingEffortExtendedForProbe(page).catch(() => {});
  await markProbeDiagnosticStage(
    checkpoint,
    persistCheckpoint,
    'active-edit-card.set-message-text',
  );
  await setComposerText(page, SIDE_EFFECT_MESSAGE_TEXT);
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'active-edit-card.send');
  await clickEnabledButton(page, SEND_BUTTON_SELECTORS);
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'active-edit-card.user-turn-ready');
  await waitForLatestUserTurn(page);
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'active-edit-card.response-delay');
  await page.waitForTimeout(2500);
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'active-edit-card.stop-response');
  await clickEnabledButton(page, STOP_BUTTON_SELECTORS).catch(() => {});
  await markProbeDiagnosticStage(
    checkpoint,
    persistCheckpoint,
    'active-edit-card.after-stop-delay',
  );
  await page.waitForTimeout(3000);
  return blankNewChatProvenance;
}

export async function prepareActiveEditCardProbeState(page, fixtureUrl, options = {}) {
  const { checkpoint, persistCheckpoint } = options;
  const blankNewChatProvenance = await prepareSentDisposableMessage(page, fixtureUrl, options);
  await markProbeDiagnosticStage(
    checkpoint,
    persistCheckpoint,
    'active-edit-card.user-turn-locator',
  );
  const userTurn = await getLatestUserMessageLocator(page);
  const editScope = await getStableUserEditScope(page, userTurn);
  await markProbeDiagnosticStage(
    checkpoint,
    persistCheckpoint,
    'active-edit-card.scroll-user-turn',
  );
  await userTurn.scrollIntoViewIfNeeded().catch(() => {});
  const editButton = userTurn
    .locator('button:has(svg path[d^="M11.7313"]), button[aria-label="Edit message"]')
    .first();
  await markProbeDiagnosticStage(
    checkpoint,
    persistCheckpoint,
    'active-edit-card.reveal-edit-button',
  );
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await userTurn.hover({ force: true }).catch(() => {});
    await page.waitForTimeout(700);
    if ((await editButton.count().catch(() => 0)) > 0) break;
  }
  if (!((await editButton.count().catch(() => 0)) > 0)) {
    throw new Error('Could not find the user message edit button.');
  }
  await options.onBeforeOpenEdit?.(editButton);
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'active-edit-card.open-edit');
  await waitBeforeBrowserInteraction();
  await editButton.click({ force: true });
  await markProbeDiagnosticStage(
    checkpoint,
    persistCheckpoint,
    'active-edit-card.edit-field-ready',
  );
  await page.waitForTimeout(700);
  const editField = editScope
    .locator('textarea, [contenteditable="true"]')
    .filter({ visible: true })
    .first();
  if (!((await editField.count().catch(() => 0)) > 0)) {
    throw new Error('Could not find the active edit field.');
  }
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'active-edit-card.set-edit-text');
  await editField.click({ force: true });
  await editField.fill(SIDE_EFFECT_EDITED_MESSAGE_TEXT).catch(async () => {
    await page.keyboard.press('Control+A');
    await page.keyboard.type(SIDE_EFFECT_EDITED_MESSAGE_TEXT, { delay: 5 });
  });
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'active-edit-card.edit-settle');
  await page.waitForTimeout(250);
  return blankNewChatProvenance;
}

export async function getStableUserEditScope(page, userTurn) {
  const identity = await userTurn.evaluate((turn) => {
    for (const name of ['data-chatgpt-search-unit-key', 'data-turn-key', 'data-testid']) {
      const value = turn.getAttribute(name);
      if (value) return { name, value };
    }
    return null;
  });
  if (!identity) throw new Error('The owned user Edit turn has no stable wrapper identity.');
  const value = identity.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return page.locator(`[${identity.name}="${value}"]`);
}

export async function prepareSentUserMessageProbeState(page, fixtureUrl, options = {}) {
  const blankNewChatProvenance = await prepareSentDisposableMessage(page, fixtureUrl, options);
  const userTurn = await getLatestUserMessageLocator(page);
  await userTurn.hover({ force: true });
  await page.waitForTimeout(700);
  return blankNewChatProvenance;
}

async function prepareDictationActiveProbeState(page, fixtureUrl) {
  const blankNewChatProvenance = await prepareNewConversationProbeState(page, fixtureUrl);
  await page
    .context()
    .grantPermissions(['microphone'], { origin: 'https://chatgpt.com' })
    .catch(() => {});
  await waitForEnabledButton(page, DICTATION_START_BUTTON_SELECTORS, 15000);
  await clickEnabledButton(page, DICTATION_START_BUTTON_SELECTORS);
  await page.waitForFunction(
    (controlSpecs) => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement) || node.hidden || node.closest('[aria-hidden="true"]')) {
          return false;
        }
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
      const forms = Array.from(
        document.querySelectorAll(
          'form[data-thread-find-composer="true"], form[data-chatgpt-composer]',
        ),
      ).filter(isVisible);
      const activeForms = forms.filter((form) => {
        const currentComposer =
          form.hasAttribute('data-chatgpt-composer') &&
          form.getAttribute('data-thread-find-composer') === 'true';
        const buttons = Array.from(form.querySelectorAll('button')).filter(isVisible);
        return controlSpecs.every((spec) => {
          const matches = buttons.filter((button) => {
            const pathMatches = Array.from(button.querySelectorAll('svg path')).some((path) =>
              String(path.getAttribute('d') || '').startsWith(spec.pathPrefix),
            );
            const symbolMatches =
              currentComposer &&
              Array.from(button.querySelectorAll('svg use')).some((use) => {
                const href = String(
                  use.getAttribute('href') || use.getAttribute('xlink:href') || '',
                );
                return spec.symbols.some((symbol) => href.endsWith(symbol));
              });
            return pathMatches || symbolMatches;
          });
          return matches.length === 1;
        });
      });
      return activeForms.length === 1;
    },
    ACTIVE_DICTATION_CONTROL_SPECS,
    { timeout: 15000 },
  );
  return blankNewChatProvenance;
}

export async function prepareComposerStudySearchProbeState(
  page,
  fixtureUrl,
  { checkpoint, persistCheckpoint, query = 'study', actionId = 'shortcutKeyStudy' } = {},
) {
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'study.blank-home-preparation');
  const blankNewChatProvenance = await prepareNewConversationProbeState(page, fixtureUrl, {
    checkpoint,
    persistCheckpoint,
    scope: `global:${actionId}:blank-home`,
  });
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'study.blank-home-ready');
  const structurePreparation = await prepareStructurallyBlankComposerForMenu(page);
  if (checkpoint?.currentCase) {
    checkpoint.currentCase.studyComposerStructure = structurePreparation.status;
  }
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'study.plus-menu-opening');
  await openComposerPlusMenu(page);
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'study.plus-menu-open');
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'study.owned-query-typing');
  await setComposerText(page, query, {
    auditOwnedConversationIds: checkpoint?.auditOwnedConversationIds,
    blankHomeProvenance: blankNewChatProvenance,
    checkpoint,
    focusOnly: true,
    persistCheckpoint,
    scope: `global:${actionId}:setup`,
  });
  await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'study.query-ready');
  return blankNewChatProvenance;
}

export function resolveLiveProbeScrollContainer() {
  let helperContainer = null;
  try {
    if (typeof window.getScrollableContainer === 'function') {
      helperContainer = window.getScrollableContainer();
    }
  } catch {}

  if (
    helperContainer === window ||
    (helperContainer instanceof Element && helperContainer.isConnected)
  ) {
    return helperContainer;
  }

  const visibleThreadContainer = findRenderedThreadScrollRoot(document);
  return visibleThreadContainer || document.scrollingElement || document.documentElement;
}

const LIVE_PROBE_SCROLL_CONTAINER_RESOLVER_SOURCE = `(() => {
  const findRenderedThreadScrollRoot = ${findRenderedThreadScrollRoot.toString()};
  return (${resolveLiveProbeScrollContainer.toString()});
})()`;

// Physical column-reverse coordinates run from -max at the top to zero at the bottom.
// Keep every probe's setup, boundary and movement checks in top-to-bottom coordinates.
export function readLiveProbeScrollMetrics(container, position) {
  const root = document.scrollingElement || document.documentElement;
  const isWindow = container === window;
  const max = Math.max(
    0,
    isWindow
      ? root.scrollHeight - window.innerHeight
      : container.scrollHeight - container.clientHeight,
  );
  const reverse = !isWindow && getComputedStyle(container).flexDirection === 'column-reverse';
  if (position !== undefined) {
    const logical = position === 'bottom' ? max : position === 'middle' ? Math.round(max / 2) : 0;
    const physical = reverse ? logical - max : logical;
    if (isWindow) window.scrollTo(0, physical);
    else container.scrollTop = physical;
  }
  const rawTop = Number(
    isWindow ? window.scrollY || root.scrollTop || 0 : container.scrollTop || 0,
  );
  return { top: Math.max(0, Math.min(max, reverse ? max + rawTop : rawTop)), max, rawTop, reverse };
}

const LIVE_PROBE_SCROLL_METRICS_SOURCE = readLiveProbeScrollMetrics.toString();

export async function setLiveProbeScrollPosition(page, position) {
  await page.evaluate(
    ({ targetPosition, scrollContainerResolverSource, scrollMetricsSource }) => {
      const resolveScrollContainer = new Function(`return (${scrollContainerResolverSource})`)();
      const readScrollMetrics = new Function(`return (${scrollMetricsSource})`)();
      readScrollMetrics(resolveScrollContainer(), targetPosition);
    },
    {
      targetPosition: position,
      scrollContainerResolverSource: LIVE_PROBE_SCROLL_CONTAINER_RESOLVER_SOURCE,
      scrollMetricsSource: LIVE_PROBE_SCROLL_METRICS_SOURCE,
    },
  );
  await page.waitForTimeout(700);
}

async function captureLiveProbeScrollStart(page) {
  await page.evaluate(
    ({ scrollContainerResolverSource, scrollMetricsSource }) => {
      const resolveScrollContainer = new Function(`return (${scrollContainerResolverSource})`)();
      const readScrollMetrics = new Function(`return (${scrollMetricsSource})`)();
      const { top, max } = readScrollMetrics(resolveScrollContainer());
      window.__CGCSP_SCROLL_PROBE_START__ = { top, max };
    },
    {
      scrollContainerResolverSource: LIVE_PROBE_SCROLL_CONTAINER_RESOLVER_SOURCE,
      scrollMetricsSource: LIVE_PROBE_SCROLL_METRICS_SOURCE,
    },
  );
}

export async function setLiveProbeMessageScrollStart(page, setup) {
  if (!['message-scroll-from-top', 'message-scroll-from-bottom'].includes(setup)) {
    throw new Error(`Unsupported message-scroll setup: ${setup}`);
  }
  await setLiveProbeScrollPosition(page, setup === 'message-scroll-from-top' ? 'top' : 'bottom');
  await captureLiveProbeScrollStart(page);
}

async function prepareMessageScrollProbeState(page, fixtureUrl, setup) {
  await resetFixturePage(page, fixtureUrl);
  await closeTransientUi(page);
  await setLiveProbeMessageScrollStart(page, setup);
}

async function isViewportProbeTargetReached(page, target) {
  return page.evaluate(
    ({ targetId, scrollContainerResolverSource, scrollMetricsSource }) => {
      const resolveScrollContainer = new Function(`return (${scrollContainerResolverSource})`)();
      const container = resolveScrollContainer();
      const readScrollMetrics = new Function(`return (${scrollMetricsSource})`)();
      const metrics = readScrollMetrics(container);
      if (targetId === 'page-header') {
        const header = document.getElementById('page-header');
        const rect = header?.getBoundingClientRect?.();
        return metrics.top <= 120 || (rect && rect.bottom > 0 && rect.top < 180);
      }
      if (targetId === 'thread-bottom') {
        const remaining = metrics.max - metrics.top;
        const threadBottom = document.getElementById('thread-bottom');
        const rect = threadBottom?.getBoundingClientRect?.();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return remaining <= 160 || (rect && rect.top < viewportHeight && rect.bottom > 0);
      }
      return false;
    },
    {
      targetId: target?.targetId || '',
      scrollContainerResolverSource: LIVE_PROBE_SCROLL_CONTAINER_RESOLVER_SOURCE,
      scrollMetricsSource: LIVE_PROBE_SCROLL_METRICS_SOURCE,
    },
  );
}

async function isDomStateProbeTargetReached(page, target) {
  return page.evaluate(
    ({ targetId, codeboxSelectors, scrollContainerResolverSource, scrollMetricsSource }) => {
      const resolveScrollContainer = new Function(`return (${scrollContainerResolverSource})`)();
      const container = resolveScrollContainer();
      const readScrollMetrics = new Function(`return (${scrollMetricsSource})`)();
      const metrics = readScrollMetrics(container);
      const start = window.__CGCSP_SCROLL_PROBE_START__ || {};
      const currentTop = metrics.top;
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
            const lineBox =
              code.closest('pre') || code.closest('.cm-content') || code.parentElement || code;
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
              ...text.split(/\r?\n/).map((line) => (context ? context.measureText(line).width : 0)),
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
            // A native layered whitespace rule can win on code while its
            // descendants wrap. Overlong text must prove rendered wrapping.
            return (
              availableWidth > 0 &&
              (requiresWrap
                ? hasActualWrap
                : style.whiteSpace === 'pre-wrap' && style.overflowWrap === 'anywhere') &&
              scrollport.scrollWidth <= scrollport.clientWidth + 2
            );
          });
        return (
          document.documentElement.classList.contains('csp-codebox-wrap-enabled') &&
          allVisibleCodeboxesWrap
        );
      }
      return false;
    },
    {
      targetId: target?.targetId || '',
      codeboxSelectors: [...CODEBOX_CONTENT_SELECTORS],
      scrollContainerResolverSource: LIVE_PROBE_SCROLL_CONTAINER_RESOLVER_SOURCE,
      scrollMetricsSource: LIVE_PROBE_SCROLL_METRICS_SOURCE,
    },
  );
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
  const matches =
    items.length === 0
      ? verification.plainTextLength === 0
      : verification.payloadFingerprint === fingerprintClipboardPayload(items);
  if (!matches) {
    session.clipboardRestoreStatus = 'snapshot-verification-failed';
    throw new Error(
      'Clipboard snapshot could not be re-written and verified; no clipboard probe was started.',
    );
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
      contentRestored =
        items.length === 0
          ? finalMetadata.plainTextLength === 0
          : finalMetadata.payloadFingerprint === fingerprintClipboardPayload(items);
      mimeTypesRestored =
        JSON.stringify(finalMetadata.types) ===
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
    session.clipboardRestoreStatus =
      contentRestored && mimeTypesRestored && permissionsRestored ? 'clean' : 'partial';
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

async function prepareClipboardSingleMessageProbeState(
  page,
  scrapeStateRegistry,
  fixtureUrl,
  session,
) {
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
    conversationUrl: '',
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
  return page.evaluate(
    ({ selectors, containerSelector }) => {
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
    },
    {
      selectors: [...CODEBOX_CONTENT_SELECTORS],
      containerSelector: CODEBOX_VALIDATION_CONTAINER_SELECTOR,
    },
  );
}

async function waitForAssistantCodeBlockCount(
  page,
  minimumCount,
  timeout = CODEBOX_RESPONSE_TIMEOUT_MS,
) {
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
    ({ nativeSendSelector, nativeStopSelector, legacySendSelectors, legacyStopSelectors }) => {
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
      const hasVisibleComposerTextbox = (button) => {
        const form = button.closest('form');
        return (
          isVisible(form) &&
          Array.from(form.querySelectorAll('[contenteditable="true"][role="textbox"]')).some(
            isVisible,
          )
        );
      };
      const visibleStopButtons = [
        ...Array.from(document.querySelectorAll(nativeStopSelector)).filter(
          (button) => isVisible(button) && hasVisibleComposerTextbox(button),
        ),
        ...legacyStopSelectors.flatMap((selector) =>
          Array.from(document.querySelectorAll(selector)).filter(isVisible),
        ),
      ];
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
      const assistantMessages = Array.from(
        document.querySelectorAll(
          '[data-message-author-role="assistant"], [data-chatgpt-selection-message-id][data-chatgpt-selection-conversation-id]',
        ),
      );
      const latestAssistant = assistantMessages.at(-1);
      const assistantTurn = latestAssistant?.closest('[data-content-search-turn-key]');
      const completionAction = Array.from(
        assistantTurn?.querySelectorAll('button[aria-label="Regenerate response"]') || [],
      ).some(isVisible);
      const observedSendButtons = Array.from(document.querySelectorAll(nativeSendSelector)).filter(
        (button) =>
          isVisible(button) &&
          hasVisibleComposerTextbox(button) &&
          !button.disabled &&
          button.getAttribute('aria-disabled') !== 'true',
      );
      const legacySendButtons = legacySendSelectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .filter(
          (button) =>
            isVisible(button) &&
            !button.disabled &&
            button.getAttribute('aria-disabled') !== 'true' &&
            button.getAttribute('data-testid') !== 'stop-button' &&
            button.getAttribute('data-test-id') !== 'stop-button' &&
            !button.matches('button:has(svg path[d^="M4.5 5.75C4.5 5.05964"])'),
        );
      const sendReady =
        (observedSendButtons.length === 1 && hasVisibleComposerTextbox(observedSendButtons[0])) ||
        legacySendButtons.length > 0;
      return (
        visibleStopButtons.length === 0 &&
        visibleComposers.length > 0 &&
        (!latestAssistant || completionAction || sendReady)
      );
    },
    {
      nativeSendSelector: NATIVE_COMPOSER_SEND_SELECTOR,
      nativeStopSelector: NATIVE_COMPOSER_STOP_SELECTOR,
      legacySendSelectors: [...LEGACY_SEND_BUTTON_SELECTORS],
      legacyStopSelectors: [...LEGACY_STOP_BUTTON_SELECTORS],
    },
    { timeout },
  );
}

async function prepareCodeboxProbeConversation(page, fixtureUrl, session) {
  const plan = getCodeboxProbePreparationPlan({
    sessionInitialized: session.initialized,
    sessionConversationUrl: session.conversationUrl,
    currentUrl: page.url(),
  });
  if (plan.reuseConversationUrl) {
    try {
      if (plan.restoreConversation) {
        await page.goto(plan.reuseConversationUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
      }
      await waitForFixtureConversationReady(page, 15000, {
        fixtureUrl: plan.reuseConversationUrl,
      });
      if (await countAssistantCodeBlocks(page)) {
        await closeOpenMenus(page);
        await closeTransientUi(page);
        session.conversationUrl = page.url();
        return;
      }
    } catch {}
  }

  session.initialized = false;
  session.conversationUrl = '';
  session.sentPromptKeys.clear();
  await prepareNewConversationProbeState(page, fixtureUrl);
  await closeOpenMenus(page);
  await closeTransientUi(page);
  session.initialized = true;
}

async function sendCodeboxPromptAndWaitForBlocks(
  page,
  promptText,
  expectedMinimumCount,
  trackAuditOwnedConversation,
) {
  await waitForCodeboxResponseIdle(page);
  const beforeCount = await countAssistantCodeBlocks(page);
  await setComposerText(page, promptText);
  await waitForEnabledButton(page, SEND_BUTTON_SELECTORS, 15000);
  await clickEnabledButton(page, SEND_BUTTON_SELECTORS);
  await page.waitForTimeout(CODEBOX_RESPONSE_MIN_WAIT_MS);
  await waitForAssistantCodeBlockCount(page, Math.max(expectedMinimumCount, beforeCount + 1));
  await waitForCodeboxResponseIdle(page);
  trackAuditOwnedConversation?.(page.url());
}

async function ensureCodeboxPromptSent(
  page,
  fixtureUrl,
  session,
  promptKey,
  promptText,
  trackAuditOwnedConversation,
) {
  await prepareCodeboxProbeConversation(page, fixtureUrl, session);
  if (session.sentPromptKeys.has(promptKey)) return;
  const expectedMinimumCount = session.sentPromptKeys.size + 1;
  await sendCodeboxPromptAndWaitForBlocks(
    page,
    promptText,
    expectedMinimumCount,
    trackAuditOwnedConversation,
  );
  try {
    const parsedUrl = new URL(page.url());
    session.conversationUrl =
      parsedUrl.origin === 'https://chatgpt.com' &&
      !parsedUrl.username &&
      !parsedUrl.password &&
      /^\/c\/[A-Za-z0-9-]+$/.test(parsedUrl.pathname) &&
      !parsedUrl.search &&
      !parsedUrl.hash
        ? parsedUrl.href
        : '';
  } catch {
    session.conversationUrl = '';
  }
  session.sentPromptKeys.add(promptKey);
}

async function prepareClipboardCodeBlocksProbeState(
  page,
  fixtureUrl,
  session,
  { captureOnly = false, trackAuditOwnedConversation } = {},
) {
  const plan = getCodeboxProbePreparationPlan({ captureOnly });
  for (const promptKey of plan.promptKeys) {
    const promptText =
      promptKey === 'wrap-story' ? CODEBOX_WRAP_PROMPT_TEXT : CODEBOX_COPY_PROMPT_TEXT;
    await ensureCodeboxPromptSent(
      page,
      fixtureUrl,
      session,
      promptKey,
      promptText,
      trackAuditOwnedConversation,
    );
  }
  await waitForAssistantCodeBlockCount(page, plan.requiredCodeBlockCount);
  if (plan.clearClipboard) await clearClipboardForProbe(page, session);
}

async function prepareCodeboxWrapProbeState(page, fixtureUrl, session) {
  await ensureCodeboxPromptSent(page, fixtureUrl, session, 'wrap-story', CODEBOX_WRAP_PROMPT_TEXT);
  await waitForAssistantCodeBlockCount(page, 1);
}

async function clipboardProbeHasText(page, shortcut) {
  const codeBlockCount =
    shortcut.actionId === COPY_ALL_CODE_BLOCKS_ACTION_ID ? await countAssistantCodeBlocks(page) : 0;
  return page.evaluate(
    async ({ actionId, codeBlockCount }) => {
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
      const normalized = String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
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
    },
    { actionId: shortcut.actionId, codeBlockCount },
  );
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
  if (
    codeboxWrapIndex !== -1 &&
    copyCodeBlocksIndex !== -1 &&
    copyCodeBlocksIndex < codeboxWrapIndex
  ) {
    const [codeboxWrapShortcut] = ordered.splice(codeboxWrapIndex, 1);
    const insertionIndex = ordered.findIndex(
      (shortcut) => shortcut.actionId === COPY_ALL_CODE_BLOCKS_ACTION_ID,
    );
    ordered.splice(insertionIndex, 0, codeboxWrapShortcut);
  }
  return ordered;
}

export function shouldPreservePreparedProbeState(shortcut) {
  if (shortcut?.activationProbeSetup === 'active-edit-card') return true;
  if (
    ['composer-plus-menu-search-study', 'composer-plus-menu-search-deep-research'].includes(
      shortcut?.activationProbeSetup,
    )
  )
    return true;
  const stateRefs = [
    ...(Array.isArray(shortcut.activationProbeUiStateRefs)
      ? shortcut.activationProbeUiStateRefs
      : []),
    ...(Array.isArray(shortcut.requiredUiStateRefs) ? shortcut.requiredUiStateRefs : []),
  ];
  return stateRefs.some((stateRef) => String(stateRef).includes('buttons-exposed'));
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
      'shortcutKeyThinkingLight',
      'shortcutKeyThinkingHeavy',
      'shortcutKeyProStandard',
      'shortcutKeyProExtended',
    ].includes(shortcut.actionId)
  ) {
    return true;
  }
  return (shortcut.targetIds || []).some((targetId) => String(targetId).startsWith('model-'));
}

async function prepareGptConversationProbeState(page, fixtureUrl) {
  await waitBeforeBrowserRequest();
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await waitForFixtureConversationReady(page, 15000, { fixtureUrl });
  await closeOpenMenus(page);
  await closeTransientUi(page);
  await page.waitForFunction(
    () => Boolean(document.querySelector('#page-header') || document.querySelector('main')),
    undefined,
    { timeout: 15000 },
  );
}

async function installLiveProbeObserver(page, options = {}) {
  await page.evaluate(
    ({ preventDefault }) => {
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
    },
    {
      preventDefault: options.preventDefault !== false,
    },
  );
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
  await page
    .evaluate(() => {
      window.__CGCSP_LIVE_SHORTCUT_PROBE__?.cleanup?.();
      delete window.__CGCSP_LIVE_SHORTCUT_PROBE__;
    })
    .catch(() => {});
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

// Serialized into page callbacks so waiting, reporting, and semantic proof share one rule.
export function findRenderedProbeMessageNodes(selectors) {
  const isRendered = (node) => {
    if (!(node instanceof HTMLElement)) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (
        ancestor.hidden ||
        ancestor.hasAttribute('inert') ||
        ancestor.getAttribute('aria-hidden') === 'true' ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse'
      )
        return false;
    }
    return true;
  };
  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector)).filter(isRendered);
    if (nodes.length) return [...new Set(nodes)];
  }
  return [];
}

export async function waitForVerifiedBlankConversationAfterShortcut(
  page,
  sourceUrl,
  timeout = 15000,
) {
  await page.waitForFunction(
    ({
      sourceUrl,
      composerSelectors,
      userMessageSelectors,
      assistantMessageSelectors,
      messageReaderSource,
    }) => {
      const findMessages = new Function(`return (${messageReaderSource})`)();
      let currentUrl;
      try {
        currentUrl = new URL(window.location.href);
      } catch {
        return false;
      }
      if (
        window.location.href === sourceUrl ||
        currentUrl.origin !== 'https://chatgpt.com' ||
        currentUrl.username ||
        currentUrl.password ||
        currentUrl.pathname !== '/' ||
        currentUrl.search ||
        currentUrl.hash
      ) {
        return false;
      }
      const countMessages = (selectors) => findMessages(selectors).length;
      const composer = composerSelectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => {
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
        });
      if (!composer) return false;
      const composerText =
        composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement
          ? composer.value
          : composer.innerText || composer.textContent || '';
      return (
        countMessages(userMessageSelectors) === 0 &&
        countMessages(assistantMessageSelectors) === 0 &&
        !String(composerText).trim()
      );
    },
    {
      sourceUrl,
      composerSelectors: [...COMPOSER_TEXTBOX_SELECTORS],
      userMessageSelectors: [...USER_MESSAGE_SELECTORS],
      assistantMessageSelectors: [...ASSISTANT_MESSAGE_SELECTORS],
      messageReaderSource: findRenderedProbeMessageNodes.toString(),
    },
    { timeout },
  );
}

export async function captureBlankHomePostconditionStatus(page, sourceUrl) {
  return page.evaluate(
    ({
      sourceUrl,
      composerSelectors,
      userMessageSelectors,
      assistantMessageSelectors,
      messageReaderSource,
    }) => {
      const findMessages = new Function(`return (${messageReaderSource})`)();
      const currentUrl = new URL(window.location.href);
      const isChatGptRootPage =
        currentUrl.origin === 'https://chatgpt.com' &&
        !currentUrl.username &&
        !currentUrl.password &&
        currentUrl.pathname === '/' &&
        !currentUrl.search &&
        !currentUrl.hash;
      const hasVisibleComposer = composerSelectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .some((node) => {
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
        });
      const countMessages = (selectors) => {
        for (const selector of selectors) {
          const nodes = document.querySelectorAll(selector);
          if (nodes.length) return nodes.length;
        }
        return 0;
      };
      const composer = composerSelectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => {
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
        });
      const composerText = composer
        ? composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement
          ? composer.value
          : composer.innerText || composer.textContent || ''
        : '';
      const rawUserMessageCount = countMessages(userMessageSelectors);
      const rawAssistantMessageCount = countMessages(assistantMessageSelectors);
      const userMessageCount = findMessages(userMessageSelectors).length;
      const assistantMessageCount = findMessages(assistantMessageSelectors).length;
      // Raw retained-DOM and hidden-ancestor counts remain separate diagnostics.
      const diagnoseMessages = (selectors) => {
        let nodes = [];
        for (const selector of selectors) {
          nodes = Array.from(document.querySelectorAll(selector));
          if (nodes.length) break;
        }
        let hiddenAncestorCount = 0;
        for (const node of nodes) {
          if (!(node instanceof HTMLElement)) continue;
          for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
            const ancestorStyle = getComputedStyle(ancestor);
            if (
              ancestor.hidden ||
              ancestor.hasAttribute('inert') ||
              ancestor.getAttribute('aria-hidden') === 'true' ||
              ancestorStyle.display === 'none' ||
              ancestorStyle.visibility === 'hidden' ||
              ancestorStyle.visibility === 'collapse'
            ) {
              hiddenAncestorCount += 1;
              break;
            }
          }
        }
        return { hiddenAncestorCount };
      };
      const userMessageDiagnostics = diagnoseMessages(userMessageSelectors);
      const assistantMessageDiagnostics = diagnoseMessages(assistantMessageSelectors);
      const composerHasText = Boolean(String(composerText).trim());
      return {
        sourceUrlChanged: window.location.href !== sourceUrl,
        isChatGptRootPage,
        hasVisibleComposer,
        userMessageCount,
        assistantMessageCount,
        rawUserMessageCount,
        rawAssistantMessageCount,
        renderedUserMessageCount: userMessageCount,
        renderedAssistantMessageCount: assistantMessageCount,
        hiddenAncestorUserMessageCount: userMessageDiagnostics.hiddenAncestorCount,
        hiddenAncestorAssistantMessageCount: assistantMessageDiagnostics.hiddenAncestorCount,
        composerHasText,
        satisfied:
          window.location.href !== sourceUrl &&
          isChatGptRootPage &&
          hasVisibleComposer &&
          userMessageCount === 0 &&
          assistantMessageCount === 0 &&
          !composerHasText,
      };
    },
    {
      sourceUrl,
      composerSelectors: [...COMPOSER_TEXTBOX_SELECTORS],
      userMessageSelectors: [...USER_MESSAGE_SELECTORS],
      assistantMessageSelectors: [...ASSISTANT_MESSAGE_SELECTORS],
      messageReaderSource: findRenderedProbeMessageNodes.toString(),
    },
  );
}

async function captureTargetPresenceCounts(page, target) {
  const groups = getTargetNeedleGroups(target);
  return page.evaluate((needleGroups) => {
    const html = document.documentElement?.outerHTML || '';
    const matchedGroups = needleGroups.filter((group) =>
      group.every((needle) => html.includes(needle)),
    ).length;
    return { requiredGroups: needleGroups.length, matchedGroups };
  }, groups);
}

async function waitForStudyPillCount(page, expectedCount, timeout = 5000) {
  await page.waitForFunction(
    ({ expectedCount, composerSelectors, studyIconTokens }) => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement) || node.hidden) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const composer = composerSelectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find(isVisible);
      if (!composer) return false;
      const pills = Array.from(composer.querySelectorAll('[data-inline-selection-pill]')).filter(
        (pill) =>
          pill.tagName === 'SPAN' &&
          isVisible(pill) &&
          Array.from(pill.querySelectorAll('svg use')).some((use) => {
            const href = String(use.getAttribute('href') || use.getAttribute('xlink:href') || '');
            return studyIconTokens.some((symbol) => href.endsWith(symbol));
          }),
      );
      return pills.length === expectedCount;
    },
    {
      expectedCount,
      composerSelectors: [...COMPOSER_TEXTBOX_SELECTORS],
      studyIconTokens: ['#book-open-light-20', '#book-open-light-16'],
    },
    { timeout },
  );
}

export async function captureLiveProbeSemanticSnapshot(page, target) {
  return page.evaluate(
    ({
      targetGroups,
      userMessageSelectors,
      assistantMessageSelectors,
      codeboxContentSelectors,
      messageReaderSource,
      scrollContainerResolverSource,
      scrollMetricsSource,
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
      const visibleDialogs = Array.from(
        document.querySelectorAll('[role="dialog"], [aria-modal="true"]'),
      )
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
      const resolveScrollContainer = new Function(`return (${scrollContainerResolverSource})`)();
      const container = resolveScrollContainer();
      const readScrollMetrics = new Function(`return (${scrollMetricsSource})`)();
      const {
        top: scrollTop,
        max: scrollMax,
        rawTop: scrollRawTop,
        reverse: scrollReverse,
      } = readScrollMetrics(container);
      const activeElement = document.activeElement;
      const activeTarget = matchesTarget(activeElement);
      const composer = Array.from(
        document.querySelectorAll(
          '#prompt-textarea, [name="prompt-textarea"], [data-testid="composer-input"], [contenteditable="true"][role="textbox"]',
        ),
      ).find(isVisible);
      const composerText =
        composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement
          ? composer.value
          : composer?.innerText || composer?.textContent || '';
      const selectedStudyPillCount = composer
        ? Array.from(composer.querySelectorAll('[data-inline-selection-pill]')).filter(
            (pill) =>
              pill.tagName === 'SPAN' &&
              isVisible(pill) &&
              Array.from(pill.querySelectorAll('svg use')).some((use) => {
                const href = String(
                  use.getAttribute('href') || use.getAttribute('xlink:href') || '',
                );
                return ['#book-open-light-20', '#book-open-light-16'].some((symbol) =>
                  href.endsWith(symbol),
                );
              }),
          ).length
        : 0;
      const hashText = (value) => {
        const text = String(value || '');
        let hash = 2166136261;
        for (let index = 0; index < text.length; index += 1) {
          hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
        }
        return `${text.length}:${(hash >>> 0).toString(16)}`;
      };
      const findMessageNodes = new Function(`return (${messageReaderSource})`)();
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
            node
              .closest('[data-chatgpt-search-message-ids]')
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
        document.querySelectorAll(
          '[aria-pressed], [aria-checked], [aria-expanded], [aria-selected], input[type="checkbox"], input[type="radio"]',
        ),
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
      // Preserve the CSS check for short lines that cannot prove wrapping;
      // overlong lines instead prove the actual descendant text layout.
      const codeboxWrappedCount = codeboxWrapMetrics.filter(
        (metric) =>
          metric.availableWidth > 0 &&
          (metric.requiresWrap
            ? metric.hasActualWrap
            : metric.whiteSpace === 'pre-wrap' && metric.overflowWrap === 'anywhere') &&
          metric.scrollportScrollWidth <= metric.scrollportClientWidth + 2,
      ).length;
      return {
        url: location.href,
        title: document.title,
        hasComposer: Boolean(composer && isVisible(composer)),
        composerFocused: Boolean(
          composer && (activeElement === composer || composer.contains(activeElement)),
        ),
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
        selectedStudyPillCount,
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
        codeboxActuallyWrappedCount: codeboxWrapMetrics.filter((metric) => metric.hasActualWrap)
          .length,
        codeboxWrapSatisfied:
          codeboxNodes.length > 0 && codeboxWrappedCount === codeboxNodes.length,
        codeboxWrapMetrics,
        filePickerInputs: Array.from(document.querySelectorAll('input[type="file"]')).filter(
          isVisible,
        ).length,
        audioPlaying: audioElements.some((element) => !element.paused),
        scrollTop,
        scrollMax,
        scrollRawTop,
        scrollReverse,
        headerVisible: Boolean(header && isVisible(header)),
        bottomVisible: Boolean(bottom && isVisible(bottom)),
      };
    },
    {
      targetGroups: getTargetNeedleGroups(target),
      userMessageSelectors: [...USER_MESSAGE_SELECTORS],
      assistantMessageSelectors: [...ASSISTANT_MESSAGE_SELECTORS],
      messageReaderSource: findRenderedProbeMessageNodes.toString(),
      codeboxContentSelectors: [...CODEBOX_CONTENT_SELECTORS],
      scrollContainerResolverSource: LIVE_PROBE_SCROLL_CONTAINER_RESOLVER_SOURCE,
      scrollMetricsSource: LIVE_PROBE_SCROLL_METRICS_SOURCE,
    },
  );
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
  const actuallyWrappedCount = requiredWrapMetrics.filter(
    (metric) => metric.hasActualWrap === true,
  ).length;
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

export function matchesLiveProbeFocusTarget(target, snapshot, activeElementHtml = '') {
  if (target?.targetId === 'prompt-textarea') return snapshot?.composerFocused === true;
  return targetMatchesText(target, activeElementHtml);
}

export async function verifyCodeboxWrapConversationSwitch(
  page,
  {
    sourceSnapshot,
    storedBeforeSwitch,
    auditOwnedConversationIds,
    protectedConversationIds = [],
    checkpoint,
    persistCheckpoint = async () => {},
    readStorage,
    captureSnapshot = (page) => captureLiveProbeSemanticSnapshot(page, null),
    waitForReady = (page, fixtureUrl) =>
      waitForFixtureConversationReady(page, 15000, { fixtureUrl }),
    waitForCodeBlocks = (page) => waitForAssistantCodeBlockCount(page, 1),
  },
) {
  const sourceUrl = page.url();
  const parsed = new URL(sourceUrl);
  const conversationId = parsed.pathname.match(/^\/c\/([A-Za-z0-9-]+)$/)?.[1] || '';
  if (
    parsed.origin !== 'https://chatgpt.com' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !conversationId ||
    !auditOwnedConversationIds?.includes(conversationId) ||
    protectedConversationIds.includes(conversationId) ||
    sourceSnapshot?.url !== sourceUrl ||
    sourceSnapshot?.composerHasText !== false ||
    !(sourceSnapshot?.codeboxCount > 0)
  ) {
    throw new Error(
      'Wrap conversation-switch validation requires a draft-free owned codebox conversation.',
    );
  }
  const setPhase = async (phase) => {
    if (checkpoint?.currentCase) checkpoint.currentCase.phase = phase;
    await persistCheckpoint();
  };
  let blankRootVerified = false;
  await setPhase('codebox-persistence-switch-blank-pending');
  try {
    await page.goto(CHATGPT_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForReady(page, CHATGPT_HOME_URL);
    const blankSnapshot = await captureSnapshot(page);
    blankRootVerified =
      isChatGptRootPageUrl(blankSnapshot.url) &&
      blankSnapshot.hasComposer === true &&
      blankSnapshot.messageCount === 0 &&
      blankSnapshot.composerHasText === false;
    if (checkpoint?.currentCase) {
      checkpoint.currentCase.codeboxSwitchBlankRootVerified = blankRootVerified;
    }
    if (!blankRootVerified) {
      throw new Error('Wrap conversation-switch root was not blank; no draft was changed.');
    }
    await setPhase('codebox-persistence-switch-blank-verified');
  } finally {
    await setPhase('codebox-persistence-switch-return-pending');
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForReady(page, sourceUrl);
  }
  if (page.url() !== sourceUrl) {
    throw new Error('Wrap conversation-switch did not return to the same owned conversation.');
  }
  await waitForCodeBlocks(page);
  await page.waitForTimeout(400);
  const returnedSnapshot = await captureSnapshot(page);
  const storedAfterSwitch = await readStorage();
  const proof = buildCodeboxWrapPersistenceProof(
    storedBeforeSwitch,
    storedAfterSwitch,
    returnedSnapshot,
  );
  proof.proofMethod =
    'chrome.storage.sync read plus owned conversation to verified blank root and back with rendered line geometry';
  proof.blankRootVerified = blankRootVerified;
  proof.sameOwnedConversationRestored = returnedSnapshot.url === sourceUrl;
  if (!proof.sameOwnedConversationRestored || returnedSnapshot.composerHasText !== false) {
    proof.status = 'fail';
  }
  proof.reason =
    proof.status === 'pass'
      ? ''
      : 'The saved codebox-wrap preference did not restore actual wrapping after conversation switch.';
  if (checkpoint?.currentCase) checkpoint.currentCase.conversationSwitchProof = proof;
  await setPhase(
    proof.status === 'pass'
      ? 'codebox-persistence-switch-verified'
      : 'codebox-persistence-switch-failed',
  );
  return proof;
}

export async function installShareToastObserver(page) {
  await page.evaluate(() => {
    window.__cspShareToastProbe?.observer?.disconnect();
    const state = { toastObserved: false };
    const inspect = (root) => {
      if (!(root instanceof Element)) return;
      const titles = new Set(root.querySelectorAll('[data-content] [data-title]'));
      const owningTitle = root.closest('[data-title]');
      if (owningTitle?.closest('[data-content]')) titles.add(owningTitle);
      for (const title of titles) {
        // These native toast wrappers use display:contents; inspect their
        // rendered leaves instead of requiring a rectangle on the wrapper.
        for (const leaf of [title, ...title.querySelectorAll('*')]) {
          if (leaf.children.length || !/^Public link\b/i.test(leaf.textContent.trim())) continue;
          const style = getComputedStyle(leaf);
          const rect = leaf.getBoundingClientRect();
          if (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
          ) {
            state.toastObserved = true;
          }
        }
      }
    };
    state.observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') inspect(record.target.parentElement);
        else {
          for (const node of record.addedNodes)
            inspect(node instanceof Element ? node : node.parentElement);
        }
      }
    });
    state.observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    window.__cspShareToastProbe = state;
  });
}

export async function readShareClipboardToastEvidence(page) {
  return page.evaluate(async () => {
    let validShareLink = false;
    let clipboardReadSucceeded = false;
    try {
      const text = await navigator.clipboard.readText();
      clipboardReadSucceeded = true;
      const url = new URL(text);
      validShareLink =
        text === url.href &&
        url.origin === 'https://chatgpt.com' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        /^\/share\/[A-Za-z0-9-]+$/.test(url.pathname);
    } catch {}
    return {
      validShareLink,
      clipboardReadSucceeded,
      toastObserved: window.__cspShareToastProbe?.toastObserved === true,
    };
  });
}

export async function waitForShareClipboardToast(page, { timeoutMs = 8000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let evidence;
  do {
    evidence = await readShareClipboardToastEvidence(page);
    if (evidence.validShareLink && evidence.toastObserved) break;
    await page.waitForTimeout(100);
  } while (Date.now() < deadline);
  return evidence;
}

export async function cleanupShareToastObserver(page) {
  await page.evaluate(() => {
    window.__cspShareToastProbe?.observer?.disconnect();
    delete window.__cspShareToastProbe;
  });
}

export function evaluateLiveProbeSemantic(
  shortcut,
  target,
  before,
  after,
  clipboardEvidence = null,
  fileChooserObserved = false,
  actionEvidence = null,
) {
  const proof = {
    status: 'not-run',
    proofMethod: 'none',
    expected:
      shortcut.activationProbeExpectedTargetRef || shortcut.notes || 'Declared shortcut behavior.',
    observed: '',
    reason: 'No action-specific semantic postcondition is registered for this shortcut yet.',
  };
  if (!before || !after) return proof;
  const conversationId = (url) => String(url || '').match(/\/c\/([^/]+)/)?.[1] || '';
  const clipboardMatched = clipboardEvidence === true || clipboardEvidence?.matches === true;
  const targetStateChanged =
    JSON.stringify(before.targetControls) !== JSON.stringify(after.targetControls);
  const generalControlStateChanged =
    JSON.stringify(before.controls) !== JSON.stringify(after.controls);
  const responseChanged =
    before.lastAssistantHash !== after.lastAssistantHash ||
    after.assistantMessageCount > before.assistantMessageCount;

  if (shortcut.activationProbeMode === 'focus-target') {
    proof.proofMethod = 'active-element-state';
    const focusReached =
      target?.targetId === 'prompt-textarea' ? after.composerFocused === true : after.activeTarget;
    proof.status = focusReached ? 'pass' : 'fail';
    proof.observed =
      target?.targetId === 'prompt-textarea'
        ? focusReached
          ? 'The expected composer owns or contains keyboard focus.'
          : 'The expected composer did not receive keyboard focus.'
        : focusReached
          ? 'The expected target owns keyboard focus.'
          : 'The expected target did not gain keyboard focus.';
    proof.reason =
      proof.status === 'pass' ? '' : 'Keyboard focus did not reach the expected target.';
  } else if (shortcut.activationProbeMode === 'opens-target') {
    if (shortcut.actionId === NEW_CONVERSATION_ACTION_ID) {
      const newBlankConversation =
        before.auditOwnedFixtureConversation === true &&
        before.messageCount === 4 &&
        before.userMessageCount === 2 &&
        before.assistantMessageCount === 2 &&
        !before.composerHasText &&
        before.url !== after.url &&
        isChatGptRootPageUrl(after.url) &&
        after.hasComposer &&
        after.messageCount === 0 &&
        after.userMessageCount === 0 &&
        after.assistantMessageCount === 0 &&
        !after.composerHasText;
      proof.proofMethod = 'verified-audit-conversation-to-blank-home-transition';
      proof.status = newBlankConversation ? 'pass' : 'fail';
      proof.observed = `verified audit source=${before.auditOwnedFixtureConversation === true}; source turns=${before.userMessageCount} user/${before.assistantMessageCount} assistant; route changed=${before.url !== after.url}; blank home=${isChatGptRootPageUrl(after.url) && after.hasComposer && after.messageCount === 0 && !after.composerHasText}`;
      proof.reason =
        proof.status === 'pass'
          ? ''
          : 'The shortcut did not open a blank home from the verified audit-owned conversation.';
    } else {
      proof.proofMethod = 'visible-ui-state';
      const appeared = after.visibleTarget && !before.visibleTarget;
      const dialogOpened = after.visibleDialogCount > before.visibleDialogCount;
      proof.status = appeared || dialogOpened ? 'pass' : 'fail';
      proof.observed = `visibleTarget ${before.visibleTarget} -> ${after.visibleTarget}; dialogs ${before.visibleDialogCount} -> ${after.visibleDialogCount}`;
      proof.reason =
        proof.status === 'pass' ? '' : 'The expected UI boundary did not newly become visible.';
    }
  } else if (shortcut.activationProbeMode === 'viewport-target') {
    proof.proofMethod = 'scroll-position-and-boundary';
    const moved = Math.abs(after.scrollTop - before.scrollTop) >= 40;
    const reachedTop = target?.targetId === 'page-header' && after.scrollTop <= 120;
    const reachedBottom =
      target?.targetId === 'thread-bottom' && after.scrollMax - after.scrollTop <= 160;
    proof.status = moved && (reachedTop || reachedBottom) ? 'pass' : 'fail';
    proof.observed = `scrollTop ${before.scrollTop} -> ${after.scrollTop}; target boundary reached=${reachedTop || reachedBottom}`;
    proof.reason =
      proof.status === 'pass'
        ? ''
        : 'Scroll position did not move to the expected viewport boundary.';
  } else if (shortcut.activationProbeMode === 'dom-state') {
    proof.proofMethod = 'dom-postcondition';
    if (target?.targetId === 'codebox-wrap-enabled') {
      const wrapped =
        after.codeboxCount > 0 &&
        after.codeboxWrappedCount === after.codeboxCount &&
        after.codeboxHorizontalOverflowCount === 0;
      proof.status =
        after.codeboxWrapEnabled && !before.codeboxWrapEnabled && wrapped ? 'pass' : 'fail';
      proof.observed = `wrap class ${before.codeboxWrapEnabled} -> ${after.codeboxWrapEnabled}; wrapping/overflow pass=${after.codeboxWrappedCount}/${after.codeboxCount}; lines wrapped=${after.codeboxActuallyWrappedCount}/${after.codeboxWrapRequiredCount} codeboxes requiring it; overflowing codeboxes=${after.codeboxHorizontalOverflowCount}`;
      proof.reason =
        proof.status === 'pass'
          ? ''
          : 'The shortcut did not wrap overlong rendered code lines and remove horizontal overflow.';
    } else if (
      target?.targetId === 'message-scroll-up-delta' ||
      target?.targetId === 'message-scroll-down-delta'
    ) {
      const difference = after.scrollTop - before.scrollTop;
      const movedInExpectedDirection =
        target.targetId === 'message-scroll-up-delta' ? difference < -40 : difference > 40;
      proof.status = movedInExpectedDirection ? 'pass' : 'fail';
      proof.observed = `scrollTop ${before.scrollTop} -> ${after.scrollTop}`;
      proof.reason =
        proof.status === 'pass' ? '' : 'Message scrolling did not move in the expected direction.';
    }
  } else if (shortcut.activationProbeMode === 'clipboard-text') {
    proof.proofMethod = 'clipboard-content';
    proof.status = clipboardMatched ? 'pass' : 'fail';
    proof.observed = `Clipboard content check passed=${clipboardMatched}; types=${(clipboardEvidence?.types || []).join(',')}; HTML present=${Boolean(clipboardEvidence?.hasHtml)}; plain-text length=${clipboardEvidence?.plainTextLength ?? 0}; hash=${clipboardEvidence?.plainTextHash || ''}`;
    proof.reason =
      proof.status === 'pass' ? '' : 'Clipboard content did not satisfy the action-specific check.';
  } else if (
    shortcut.activationProbeMode === 'click-target' ||
    shortcut.activationProbeMode === 'direct-menu-target'
  ) {
    proof.proofMethod = 'action-specific-postcondition';
    let matched = false;
    switch (shortcut.actionId) {
      case 'shortcutKeyToggleSidebar':
        matched = targetStateChanged && after.targetControls.length > 0;
        proof.observed = `sidebar control state changed=${matched}`;
        proof.reason = matched ? '' : 'Sidebar expanded/collapsed state did not change.';
        break;
      case 'shortcutKeyShare':
        matched =
          actionEvidence?.share?.clipboardCleared === true &&
          actionEvidence.share.clipboardReadSucceeded === true &&
          actionEvidence.share.validShareLink === true &&
          actionEvidence.share.toastObserved === true &&
          actionEvidence.share.trustedDispatch === true &&
          actionEvidence.share.targetClickObserved === true;
        proof.proofMethod = 'fresh-share-link-clipboard-and-native-toast';
        proof.observed = `new valid share link=${actionEvidence?.share?.validShareLink === true}; fresh native toast=${actionEvidence?.share?.toastObserved === true}; trusted target dispatch=${actionEvidence?.share?.trustedDispatch === true && actionEvidence?.share?.targetClickObserved === true}`;
        proof.reason = matched
          ? ''
          : 'Share did not produce a new valid clipboard link and fresh native confirmation toast.';
        break;
      case 'shortcutKeyNewGptConversation':
        matched = before.url !== after.url && after.hasComposer;
        proof.observed = `URL changed=${before.url !== after.url}; composer=${after.hasComposer}`;
        proof.reason = matched ? '' : 'A new custom GPT conversation did not open.';
        break;
      case 'shortcutKeyClickSendButton':
        matched =
          after.userMessageCount > before.userMessageCount &&
          !after.composerHasText &&
          responseChanged;
        proof.observed = `user messages ${before.userMessageCount} -> ${after.userMessageCount}; assistant response changed=${responseChanged}; draft remains=${after.composerHasText}`;
        proof.reason = matched
          ? ''
          : 'The draft was not committed and followed by a changed assistant response.';
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
        proof.reason = matched
          ? ''
          : 'The edited user message was not committed and followed by a changed assistant response.';
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
        proof.reason = matched
          ? ''
          : 'Branch did not create a new conversation with the same audit-message context.';
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
        matched = responseChanged;
        proof.observed = `assistant messages ${before.assistantMessageCount} -> ${after.assistantMessageCount}; response hash changed=${before.lastAssistantHash !== after.lastAssistantHash}`;
        proof.reason = matched ? '' : 'Regeneration did not produce a new assistant response.';
        break;
      case 'shortcutKeyCopyLowest':
        matched = clipboardMatched;
        proof.proofMethod = 'clipboard-content';
        proof.observed = `plain-text-only copy passed=${matched}; types=${(clipboardEvidence?.types || []).join(',')}; HTML present=${Boolean(clipboardEvidence?.hasHtml)}; plain-text length=${clipboardEvidence?.plainTextLength ?? 0}; hash=${clipboardEvidence?.plainTextHash || ''}`;
        proof.reason = matched
          ? ''
          : 'Alt+C did not place a qualifying plain-text-only response on the clipboard.';
        break;
      case 'shortcutKeySearchWeb':
      case 'shortcutKeyCreateImage':
      case 'shortcutKeyDeepResearch':
        matched = targetStateChanged || generalControlStateChanged;
        proof.observed = `tool selection/control state changed=${matched}`;
        proof.reason = matched ? '' : 'The composer tool did not enter a selected state.';
        break;
      case 'shortcutKeyStudy': {
        const activationSnapshot = actionEvidence?.studyPillActivationSnapshot;
        const deactivationSnapshot = actionEvidence?.studyPillDeactivationSnapshot;
        const stableBlankHome =
          isChatGptRootPageUrl(before.url) &&
          before.url === activationSnapshot?.url &&
          activationSnapshot?.url === deactivationSnapshot?.url &&
          deactivationSnapshot?.url === after.url &&
          before.messageCount === 0 &&
          activationSnapshot?.messageCount === 0 &&
          deactivationSnapshot?.messageCount === 0 &&
          after.messageCount === 0 &&
          before.userMessageCount === 0 &&
          before.assistantMessageCount === 0 &&
          activationSnapshot?.userMessageCount === 0 &&
          activationSnapshot?.assistantMessageCount === 0 &&
          deactivationSnapshot?.userMessageCount === 0 &&
          deactivationSnapshot?.assistantMessageCount === 0 &&
          after.userMessageCount === 0 &&
          after.assistantMessageCount === 0;
        matched =
          stableBlankHome &&
          before.composerHasText === true &&
          before.selectedStudyPillCount === 0 &&
          activationSnapshot?.selectedStudyPillCount === 1 &&
          actionEvidence?.studyToggleOffDispatched === true &&
          deactivationSnapshot?.selectedStudyPillCount === 0 &&
          after.selectedStudyPillCount === 0 &&
          !after.composerHasText;
        proof.proofMethod = 'observed-study-inline-pill-on-and-toggle-off';
        proof.observed = `Study pill count 0 -> ${activationSnapshot?.selectedStudyPillCount ?? 0} -> ${deactivationSnapshot?.selectedStudyPillCount ?? 0}; second shortcut dispatched=${actionEvidence?.studyToggleOffDispatched === true}; composer empty afterward=${!after.composerHasText}`;
        proof.reason = matched
          ? ''
          : 'The Study shortcut did not add the observed inline pill and toggle it off with a second shortcut.';
        break;
      }
      case 'shortcutKeyAddPhotosFiles':
        matched =
          fileChooserObserved &&
          before.composerTextHash === after.composerTextHash &&
          before.messageCount === after.messageCount;
        proof.proofMethod = 'cleared-file-chooser-boundary';
        proof.observed = `native file chooser observed and cleared=${fileChooserObserved}; conversation state unchanged=${before.composerTextHash === after.composerTextHash && before.messageCount === after.messageCount}`;
        proof.reason = matched
          ? ''
          : 'The file chooser boundary was not observed and cleared without uploading a file.';
        break;
      default:
        proof.reason =
          'No action-specific semantic postcondition is registered for this click-target action yet.';
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

function throwCaptureCleanupError(captureError, cleanupError, captureName) {
  if (captureError && cleanupError) {
    throw new Error(
      `${captureError.message || String(captureError)} Cleanup also failed: ${cleanupError.message || String(cleanupError)}`,
      { cause: captureError },
    );
  }
  if (captureError) throw captureError;
  if (cleanupError) {
    throw new Error(
      `${captureName} cleanup failed: ${cleanupError.message || String(cleanupError)}`,
      {
        cause: cleanupError,
      },
    );
  }
}

async function ensureSearchChatsOpenerVisible(page) {
  const candidates = page.locator(SEARCH_CONVERSATION_BUTTON_SELECTORS.join(', '));
  const opener = candidates.filter({ visible: true }).first();
  if (await opener.count()) return opener;
  if (!(await candidates.count())) {
    throw new Error(
      'Could not find a Search Chats opener using the source selectors from content.js.',
    );
  }

  // The observed shell toggle's aria-expanded can disagree with rendered rail visibility.
  // Search setup uses the actual opener as its postcondition, without changing other sidebar states.
  const toggle = page
    .locator('button[aria-controls="app-shell-sidebar"][aria-expanded]')
    .filter({ visible: true })
    .last();
  if (!(await toggle.count()) || !(await toggle.isEnabled())) {
    throw new Error(
      'Could not reveal the hidden Search Chats opener with the observed sidebar toggle.',
    );
  }
  await waitBeforeBrowserInteraction();
  await toggle.click();
  await waitBeforeBrowserInteraction();
  await opener.waitFor({ state: 'visible', timeout: 5000 });
  return opener;
}

async function captureSearchChatsDialog(page) {
  const dialogs = page.locator(SEARCH_DIALOG_VISIBLE_SELECTOR);
  if ((await dialogs.count()) > 0) {
    throw new Error(
      'Search Chats capture is blocked because a dialog was already open before the source-owned opener ran.',
    );
  }
  const opener = await ensureSearchChatsOpenerVisible(page);
  if (!(await opener.isEnabled())) {
    throw new Error('The source-owned Search Chats opener is disabled.');
  }

  let opened = false;
  let dialog = null;
  let html = '';
  let captureError = null;
  try {
    await opener.click();
    opened = true;
    dialog = page.locator(SEARCH_DIALOG_VISIBLE_SELECTOR).first();
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    if ((await dialogs.count()) !== 1) {
      throw new Error('Search Chats opener did not produce one unambiguous visible dialog.');
    }
    html = await dialog.evaluate((element) => element.outerHTML);
    if (!html) throw new Error('Search Chats dialog returned empty HTML.');
  } catch (error) {
    captureError = error;
  }

  let cleanupError = null;
  if (opened) {
    try {
      await page.keyboard.press('Escape');
    } catch (error) {
      cleanupError = error;
    }
    try {
      await dialog?.waitFor({ state: 'hidden', timeout: 2000 });
    } catch (error) {
      cleanupError = cleanupError
        ? new Error(`${cleanupError.message}; ${error?.message || String(error)}`)
        : error;
    }
  }
  throwCaptureCleanupError(captureError, cleanupError, 'Search Chats dialog');
  return html;
}

async function readActiveExtensionShortcutCodes(page, context, actionIds) {
  const session = await context.newCDPSession(page);
  const executionContexts = [];
  session.on('Runtime.executionContextCreated', (event) => {
    if (event?.context) executionContexts.push(event.context);
  });
  try {
    await session.send('Runtime.enable');
    await page.waitForTimeout(250);
    const extensionContext = executionContexts.find(
      (executionContext) =>
        executionContext?.name === 'ChatGPT Custom Shortcuts Pro' &&
        String(executionContext?.origin || '').startsWith('chrome-extension://'),
    );
    if (!extensionContext?.id) {
      throw new Error(
        'Shortcut overlay capture is blocked because the ChatGPT Custom Shortcuts Pro content script is not loaded in the active tab.',
      );
    }

    const keysLiteral = JSON.stringify(actionIds);
    const evaluation = await session.send('Runtime.evaluate', {
      contextId: extensionContext.id,
      awaitPromise: true,
      returnByValue: true,
      expression: `new Promise((resolve) => {
        const extensionChrome = globalThis.chrome;
        if (!extensionChrome?.storage?.sync?.get) {
          resolve({ __cspError: 'Extension sync storage is unavailable in its content-script context.' });
          return;
        }
        extensionChrome.storage.sync.get(${keysLiteral}, (values = {}) => {
          const lastError = extensionChrome.runtime?.lastError;
          resolve(lastError ? { __cspError: lastError.message || String(lastError) } : values);
        });
      })`,
    });
    if (evaluation?.exceptionDetails) {
      throw new Error(
        evaluation.exceptionDetails.text ||
          'Could not read the active extension shortcut assignment.',
      );
    }
    const values = evaluation?.result?.value;
    if (!values || typeof values !== 'object' || values.__cspError) {
      throw new Error(
        values?.__cspError || 'Could not read the active extension shortcut assignment.',
      );
    }
    return values;
  } finally {
    await session.detach().catch(() => {});
  }
}

async function captureShortcutOverlay(page, context, shortcut) {
  if (!shortcut?.actionId) {
    throw new Error('Shortcut overlay capture has no registered shortcut assignment.');
  }
  const overlay = page.locator(SHORTCUT_OVERLAY_SELECTOR).first();
  if (await overlay.isVisible()) {
    await page.keyboard.press('Escape');
    await overlay.waitFor({ state: 'hidden', timeout: 2000 });
  }
  const activeShortcutCodes = await readActiveExtensionShortcutCodes(page, context, [
    shortcut.actionId,
  ]);
  const hasStoredAssignment = Object.hasOwn(activeShortcutCodes, shortcut.actionId);
  const code = hasStoredAssignment
    ? normalizeShortcutCode(activeShortcutCodes[shortcut.actionId])
    : resolveShortcutDispatchCode(shortcut, activeShortcutCodes);
  if (!code) {
    throw new Error(
      hasStoredAssignment
        ? 'Shortcut overlay capture is blocked because its active assignment is blank or disabled.'
        : 'No active or default key assignment is registered for the shortcut overlay.',
    );
  }

  let dispatchAttempted = false;
  let html = '';
  let captureError = null;
  try {
    dispatchAttempted = true;
    const dispatch = await dispatchObservedKeyboardChord(page, code, ['Alt']);
    if (dispatch.status !== 'dispatched') {
      throw new Error(
        dispatch.reason || 'Could not dispatch the trusted Alt shortcut for the overlay.',
      );
    }
    await overlay.waitFor({ state: 'visible', timeout: 5000 });
    html = await overlay.evaluate((element) => element.outerHTML);
    if (!html) throw new Error('Extension shortcut overlay returned empty HTML.');
  } catch (error) {
    captureError = error;
  }

  let cleanupError = null;
  if (dispatchAttempted) {
    try {
      await page.keyboard.press('Escape');
    } catch (error) {
      cleanupError = error;
    }
    try {
      await overlay.waitFor({ state: 'hidden', timeout: 2000 });
    } catch (error) {
      cleanupError = cleanupError
        ? new Error(`${cleanupError.message}; ${error?.message || String(error)}`)
        : error;
    }
  }
  throwCaptureCleanupError(captureError, cleanupError, 'Shortcut overlay');
  return html;
}

export async function executeSafeTargetCaptureStep(page, context, step, state, options = {}) {
  if (step?.type === 'open-search-chats-dialog') {
    state.latestDialogHtml = await captureSearchChatsDialog(page);
    return;
  }
  if (step?.type === 'open-shortcut-overlay') {
    state.shortcutOverlayHtml = await captureShortcutOverlay(
      page,
      context,
      options.shortcut || null,
    );
    return;
  }
  throw new Error(`Unsupported safe-target capture step: ${step?.type || '(missing type)'}`);
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
  const auditKeys =
    Array.isArray(mutationLedger) && mutationLedger.length
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
    const observedBeforeRestore = await readExtensionSyncStorage(context, extensionId, auditKeys);
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
  entry.auditValues = [...new Set([...(entry.auditValues || [entry.auditValue]), value])];
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
  await page.evaluate(
    ({ shortcutCode, shortcutKey }) => {
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
    },
    {
      shortcutCode: code,
      shortcutKey: keyForShortcutCode(code),
    },
  );
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
  await page.evaluate(
    ({ shortcutCode, shortcutKey }) => {
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
    },
    {
      shortcutCode: code,
      shortcutKey: keyForShortcutCode(code),
    },
  );
}

async function dispatchShortcutForAction(page, shortcut, code) {
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
  const contractById = new Map(
    (contracts || []).map((contract) => [contract.contractId, contract]),
  );
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
          error?.message ||
            String(error) ||
            'Fixed-contract probe failed before semantic evaluation.',
        ),
      );
    } finally {
      await cleanupActiveOwnedComposerDraft(page, {
        auditOwnedConversationIds: checkpoint.auditOwnedConversationIds,
        allowVerifiedBlankHome: true,
        checkpoint,
        persistCheckpoint,
        scope: `fixed:${contractId}`,
      }).catch(() => {});
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

  const pageScrollTarget = targetById['thread-bottom'];
  let pageScrollMatrix = null;
  const getPageScrollMatrix = async () => {
    if (pageScrollMatrix) return pageScrollMatrix;
    if (!extensionId)
      throw new Error(
        'Extension sync storage was unavailable for the PageUp/PageDown gate matrix.',
      );
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
          throw new Error(
            'The authenticated fixture does not have enough scroll range for PageUp/PageDown behavior proof.',
          );
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
          passed:
            observed.dispatch.status === 'dispatched' && movedInDirection && keydownMatchesGate,
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
        fixedSemantic(
          'coverage-gap',
          'keyboard-scroll-state',
          'PageUp/PageDown moves the viewport when takeover is enabled.',
          '',
          error?.message || String(error),
        ),
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
        passed
          ? ''
          : 'Enabled PageUp/PageDown did not both move in the expected direction and prevent the native default.',
      ),
      {
        modifiers: 'PageUp / PageDown without modifiers',
        routingProof: {
          status: passed ? 'observed' : 'not-observed',
          proofMethod: 'trusted-keydown-and-scroll-delta',
        },
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
        fixedSemantic(
          'coverage-gap',
          'keyboard-scroll-state',
          'Disabled takeover preserves native PageUp/PageDown behavior.',
          '',
          error?.message || String(error),
        ),
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
        passed
          ? ''
          : 'One or more enabled/disabled PageUp/PageDown key cases failed or could not be observed.',
      ),
      {
        modifiers: 'PageUp / PageDown enabled and disabled',
        routingProof: {
          status: passed ? 'observed' : 'not-observed',
          proofMethod: 'trusted-keydown-and-scroll-delta',
        },
        evidence: { cases },
      },
    );
  });

  await finishCase('alt-modifier-isolation', async (contract) => {
    const shortcut = inventory.shortcuts.find(
      (item) => item.actionId === 'shortcutKeyActivateInput',
    );
    const code = resolveShortcutDispatchCode(shortcut || {}, activeShortcutCodes);
    if (!code) {
      return buildFixedContractLiveRow(
        contract,
        fixedSemantic(
          'coverage-gap',
          'modifier-pass-through',
          'Unexpected modifiers pass through.',
          '',
          'No validation key was available for the input-focus action.',
        ),
      );
    }
    await resetFixturePage(page, fixtureUrl);
    await closeTransientUi(page);
    await page.evaluate(
      () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
    );
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
      if (unsupportedAltGraph)
        limitations.push('Playwright did not expose a trusted AltGraph state for this key event.');
      cases.push({
        modifier,
        activeTarget: observed.after.activeTarget,
        defaultPrevented: keydown?.defaultPrevented ?? null,
        altGraph: keydown?.altGraph ?? false,
        passed,
      });
    }
    limitations.push(
      'Physical IME composition (isComposing/keyCode 229) cannot be generated by the Playwright keyboard driver on this Windows profile.',
    );
    const passed = cases.length === 4 && cases.every((item) => item.passed);
    return buildFixedContractLiveRow(
      contract,
      fixedSemantic(
        passed ? 'pass' : 'coverage-gap',
        'trusted-keydown-modifier-matrix',
        'Shift, Control, Meta, and AltGraph variants do not claim the ordinary Alt shortcut; IME composition is separately limited.',
        JSON.stringify(cases),
        passed
          ? limitations.join(' ')
          : `Modifier isolation did not pass for all tested chords. ${limitations.join(' ')}`,
      ),
      {
        modifiers: 'Alt + Shift / Control / Meta / AltGraph',
        routingProof: {
          status: passed ? 'observed-pass-through' : 'not-observed',
          proofMethod: 'trusted-keydown-default-prevention',
        },
        evidence: { cases, limitations },
      },
    );
  });

  await finishCase('shortcut-overlay-dismissal', async (contract) => {
    const showOverlay = inventory.shortcuts.find(
      (item) => item.actionId === 'shortcutKeyShowOverlay',
    );
    const code = resolveShortcutDispatchCode(showOverlay || {}, activeShortcutCodes);
    const target = targetById['shortcut-overlay'];
    if (!code || !target) {
      return buildFixedContractLiveRow(
        contract,
        fixedSemantic(
          'coverage-gap',
          'escape-dismissal',
          'Escape closes the visible extension shortcut overlay.',
          '',
          'Overlay key or structural target was unavailable.',
        ),
      );
    }
    await resetFixturePage(page, fixtureUrl);
    await closeTransientUi(page);
    await page.keyboard.press('Escape').catch(() => {});
    await dispatchObservedKeyboardChord(page, code, ['Alt']);
    await page.waitForTimeout(500);
    const before = await captureLiveProbeSemanticSnapshot(page, target);
    if (!before.visibleTarget)
      throw new Error('The extension shortcut overlay did not open for the Escape dismissal case.');
    const observed = await observeFixedChord(page, 'Escape', [], target, 500);
    const passed = observed.before.visibleTarget && !observed.after.visibleTarget;
    return buildFixedContractLiveRow(
      contract,
      fixedSemantic(
        passed ? 'pass' : 'coverage-gap',
        'visible-overlay-dismissal',
        'Escape closes the extension shortcut overlay.',
        `overlay ${observed.before.visibleTarget} -> ${observed.after.visibleTarget}`,
        passed ? '' : 'Escape did not dismiss the visible extension shortcut overlay.',
      ),
      {
        modifiers: 'Escape',
        targetProof: {
          status: observed.before.visibleTarget ? 'present' : 'not-present',
          expectedTargetRef: 'shortcut-overlay',
          observedTargetRef: observed.before.visibleTarget ? 'shortcut-overlay' : '',
          proofMethod: 'visible-overlay-state',
        },
        routingProof: {
          status: passed ? 'observed' : 'not-observed',
          proofMethod: 'trusted-keydown-and-overlay-state',
        },
      },
    );
  });

  await finishCase('overlay-alt-only-capture', async (contract) => {
    const showOverlay = inventory.shortcuts.find(
      (item) => item.actionId === 'shortcutKeyShowOverlay',
    );
    const code = resolveShortcutDispatchCode(showOverlay || {}, activeShortcutCodes);
    const target = targetById['shortcut-overlay'];
    if (!code || !target) {
      return buildFixedContractLiveRow(
        contract,
        fixedSemantic(
          'coverage-gap',
          'alt-only-keydown-matrix',
          'Only plain Alt plus the configured key opens the overlay.',
          '',
          'Overlay key or structural target was unavailable.',
        ),
      );
    }
    await resetFixturePage(page, fixtureUrl);
    await closeTransientUi(page);
    const cases = [];
    for (const modifier of ['Shift', 'Control', 'Meta', 'AltGraph']) {
      await page.keyboard.press('Escape').catch(() => {});
      const observed = await observeFixedChord(page, code, ['Alt', modifier], target);
      const keydown = observed.keydown;
      const unsupportedAltGraph =
        modifier === 'AltGraph' &&
        (observed.dispatch.status !== 'dispatched' || keydown?.altGraph !== true);
      cases.push({
        modifier,
        visible: observed.after.visibleTarget,
        defaultPrevented: keydown?.defaultPrevented ?? null,
        altGraph: keydown?.altGraph ?? false,
        passed:
          !unsupportedAltGraph &&
          observed.dispatch.status === 'dispatched' &&
          !observed.after.visibleTarget &&
          keydown?.defaultPrevented === false,
        unsupported: unsupportedAltGraph
          ? observed.dispatch.reason || 'No trusted AltGraph state was observed.'
          : '',
      });
    }
    const passed = cases.length === 4 && cases.every((item) => item.passed);
    return buildFixedContractLiveRow(
      contract,
      fixedSemantic(
        passed ? 'pass' : 'coverage-gap',
        'trusted-keydown-alt-only-matrix',
        'Shift, Control, Meta, and AltGraph prevent overlay capture.',
        JSON.stringify(cases),
        passed
          ? ''
          : 'The overlay opened or captured a modified key, or AltGraph could not be observed.',
      ),
      {
        modifiers: 'Alt + Shift / Control / Meta / AltGraph',
        targetProof: {
          status: 'present',
          expectedTargetRef: 'shortcut-overlay',
          observedTargetRef: 'shortcut-overlay',
          proofMethod: 'structural-target-match',
        },
        routingProof: {
          status: passed ? 'observed-pass-through' : 'not-observed',
          proofMethod: 'trusted-keydown-default-prevention',
        },
        evidence: {
          cases,
          limitation:
            'IME composition cannot be generated by the Playwright keyboard driver on this Windows profile.',
        },
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
    await page.evaluate(() => {
      window.enableSendWithControlEnterCheckbox = false;
    });
    const disabled = await observeFixedChord(page, 'Enter', ['Control'], sendTarget, 350);
    const disabledPass =
      disabled.after.userMessageCount === disabled.before.userMessageCount &&
      disabled.after.composerHasText &&
      disabled.keydown?.isTrusted === true &&
      disabled.keydown?.defaultPrevented === false;
    await setComposerText(page, '', {
      checkpoint,
      persistCheckpoint,
      scope: 'fixed:ctrl-send-gate-draft-reset',
    });
    checkpoint.currentCase.phase = 'enabled-gate-pending';
    await persistCheckpoint();
    await page.evaluate(() => {
      window.enableSendWithControlEnterCheckbox = true;
    });
    await setComposerText(page, SIDE_EFFECT_MESSAGE_TEXT);
    const enabled = await observeFixedChord(page, 'Enter', ['Control'], sendTarget, 600);
    const enabledChordRouted =
      enabled.dispatch.status === 'dispatched' &&
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
        await clickEnabledButton(page, STOP_BUTTON_SELECTORS).catch(() => {});
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
      fixedSemantic(
        passed ? 'pass' : 'coverage-gap',
        'enabled-disabled-control-send-and-response',
        'Disabled Ctrl+Enter preserves the draft and passes through; enabled Ctrl+Enter commits it and receives a completed assistant response.',
        `disabled: user messages ${disabled.before.userMessageCount} -> ${disabled.after.userMessageCount}; draft remains=${disabled.after.composerHasText}; defaultPrevented=${disabled.keydown?.defaultPrevented}; enabled: user messages ${enabled.before.userMessageCount} -> ${enabledAfter.userMessageCount}; assistant messages ${enabled.before.assistantMessageCount} -> ${enabledAfter.assistantMessageCount}; response completed=${responseCompleted}; defaultPrevented=${enabled.keydown?.defaultPrevented}`,
        passed
          ? ''
          : 'The disabled pass-through, enabled user-message commit, or completed assistant-response transition was not observed.',
      ),
      {
        modifiers: 'Ctrl+Enter with gate disabled and enabled',
        targetProof: {
          status: 'present',
          expectedTargetRef: 'send-button',
          observedTargetRef: 'send-button',
          proofMethod: 'structural-target-match',
        },
        routingProof: {
          status: passed ? 'observed-enabled-and-disabled' : 'not-observed',
          proofMethod: 'trusted-keydown-default-prevention',
        },
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
    if (!before.visibleTarget)
      throw new Error(
        'A live generation Stop control was not visible before the Ctrl+Backspace gate case.',
      );
    await page.evaluate(() => {
      window.enableStopWithControlBackspaceCheckbox = false;
    });
    const disabled = await observeFixedChord(page, 'Backspace', ['Control'], stopTarget, 350);
    const disabledPass =
      disabled.after.visibleTarget && disabled.keydown?.defaultPrevented === false;
    await page.evaluate(() => {
      window.enableStopWithControlBackspaceCheckbox = true;
    });
    const enabled = await observeFixedChord(page, 'Backspace', ['Control'], stopTarget, 1500);
    const enabledPass = enabled.before.visibleTarget && !enabled.after.visibleTarget;
    const passed = disabledPass && enabledPass;
    return buildFixedContractLiveRow(
      contract,
      fixedSemantic(
        passed ? 'pass' : 'coverage-gap',
        'enabled-disabled-control-stop-matrix',
        'Disabled Ctrl+Backspace preserves active generation; enabled Ctrl+Backspace stops it.',
        `disabled stop visible=${disabled.after.visibleTarget}, defaultPrevented=${disabled.keydown?.defaultPrevented}; enabled stop ${enabled.before.visibleTarget} -> ${enabled.after.visibleTarget}`,
        passed
          ? ''
          : 'Ctrl+Backspace did not preserve/stop generation according to the enabled gate.',
      ),
      {
        modifiers: 'Ctrl+Backspace with gate disabled and enabled',
        targetProof: {
          status: before.visibleTarget ? 'present' : 'not-present',
          expectedTargetRef: 'stop-button',
          observedTargetRef: before.visibleTarget ? 'stop-button' : '',
          proofMethod: 'visible-stop-state',
        },
        routingProof: {
          status: passed ? 'observed' : 'not-observed',
          proofMethod: 'trusted-keydown-and-generation-state',
        },
        evidence: {
          disabledNoOp: disabledPass,
          enabledStop: enabledPass,
          linkedPositive:
            globalById.get('shortcutKeyClickStopButton')?.semantic?.status || 'not-run',
        },
      },
    );
  });

  await finishCase('model-picker-slot-dispatch', async (contract) => {
    await prepareNewConversationProbeState(page, fixtureUrl);
    trackAuditOwnedConversation(page.url());
    await openModelSwitcherMenu(page);
    const slotInfos = await page.evaluate(() => {
      const profile = window.__activeModelPickerShortcutProfile || '';
      const groups =
        window.ModelLabels?.getPopupPresentationGroups?.(
          window.__activeModelConfigId || window.ModelLabels?.DEFAULT_ACTIVE_CONFIG_ID,
          window.MODEL_NAMES || [],
          window.__modelCatalog || null,
        ) || [];
      const codes =
        window.__modelPickerKeyCodesProfiles?.[profile] || window.__modelPickerKeyCodes || [];
      return groups
        .flatMap((group) => (Array.isArray(group.actions) ? group.actions : []))
        .map((action) => ({
          profile,
          slot: Number(action.slot),
          actionId: String(action.id || action.actionId || ''),
          code: codes[Number(action.slot)] || '',
        }))
        .filter((action) => Number.isInteger(action.slot) && action.slot >= 0 && action.code)
        .sort((left, right) => left.slot - right.slot);
    });
    if (!slotInfos.length) {
      return buildFixedContractLiveRow(
        contract,
        fixedSemantic(
          'account-unavailable',
          'model-catalog-slot-dispatch',
          'An assigned, currently presented model slot can be selected through its real keyboard shortcut.',
          '',
          'The authenticated account exposed no assigned current model slot in the active ChatGPT catalog.',
        ),
      );
    }
    const useControl = await page.evaluate(() => window.useControlForModelSwitcherRadio === true);
    const modelTarget = targetById['model-switcher-button'];
    const readModelLabelHash = () =>
      page.evaluate((selectors) => {
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
      }, modelPickerSelectors.MODEL_MENU_BUTTON_SELECTORS || [
        'button[data-testid="model-switcher-dropdown-button"]',
      ]);
    let selected = null;
    const attempts = [];
    for (const slotInfo of slotInfos) {
      await closeTransientUi(page);
      await openModelSwitcherMenu(page);
      checkpoint.currentCase.phase = 'model-slot-pending';
      checkpoint.currentCase.intendedSideEffect = `model-picker-slot:${slotInfo.slot}:${slotInfo.actionId}`;
      await persistCheckpoint();
      const beforeLabelHash = await readModelLabelHash();
      const observed = await observeFixedChord(
        page,
        slotInfo.code,
        [useControl ? 'Control' : 'Alt'],
        modelTarget,
        1200,
      );
      const afterLabelHash = await readModelLabelHash();
      const menuClosed = await page.evaluate((selector) => {
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
      fixedSemantic(
        passed ? 'pass' : 'coverage-gap',
        'assigned-model-slot-selection',
        `Profile ${slotInfo.profile || 'active'}, slot ${slotInfo.slot} selects a different native model action and closes the picker.`,
        JSON.stringify(attempts),
        passed
          ? ''
          : 'No assigned model slot changed the native model selection and closed the picker.',
      ),
      {
        modifiers: `${useControl ? 'Control' : 'Alt'} + ${slotInfo.code}`,
        targetProof: {
          status: 'present',
          expectedTargetRef: 'model-switcher-button',
          observedTargetRef: 'model-switcher-button',
          proofMethod: 'model-picker-native-control-state',
        },
        routingProof: {
          status: passed ? 'observed' : 'not-observed',
          proofMethod: 'trusted-window-keydown',
        },
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
        fixedSemantic(
          'account-unavailable',
          'interaction-refresh-state',
          'A live interaction event refreshes the extension-owned sidebar state.',
          '',
          'The authenticated ChatGPT layout did not render #stage-sidebar-tiny-bar, so this source contract has no live target in the current account/layout.',
        ),
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
      afterOpacity = await page.evaluate(
        () => document.getElementById('stage-sidebar-tiny-bar')?.style.opacity || '',
      );
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
      fixedSemantic(
        passed ? 'pass' : 'coverage-gap',
        'trusted-keydown-refresh-state',
        'A keydown schedules the sidebar interaction refresh and repairs the stale opacity state.',
        `opacity ${barState.opacity} -> ${afterOpacity}; key=${observed.keydown?.code || ''}`,
        passed
          ? ''
          : 'The keydown did not produce an observable refresh of the live sidebar state.',
      ),
      {
        modifiers: 'F8 unmodified',
        routingProof: {
          status: passed ? 'observed' : 'not-observed',
          proofMethod: 'trusted-keydown-and-dom-state',
        },
        evidence: { before: barState, afterOpacity },
      },
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
    requiredCapabilities: shortcut.requiredCapabilities || [],
    dispatchCode,
    probeMode,
    expectedTargetRef: shortcut.activationProbeExpectedTargetRef || '',
    status,
    reason:
      shortcut.activationProbe?.notes ||
      shortcut.notes ||
      'No live activation probe is configured.',
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
    requiredCapabilities: shortcut.requiredCapabilities || [],
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

export async function cleanupPreparedCaptureState(page, shortcut, options = {}) {
  const setup = shortcut?.activationProbeSetup;
  if (!['in-flight-message', 'dictation-active'].includes(setup)) {
    return { status: 'not-needed' };
  }
  if (!resolveOwnedComposerScope(page, options)) {
    throw new Error('Prepared-state cleanup requires a verified audit-owned page.');
  }
  const cancelSpec = ACTIVE_DICTATION_CONTROL_SPECS[2];
  const selectors =
    setup === 'in-flight-message'
      ? STOP_BUTTON_SELECTORS
      : [
          ...['form[data-thread-find-composer="true"]', 'form[data-chatgpt-composer]'].map(
            (form) => `${form} button:has(svg path[d^="${cancelSpec.pathPrefix}"])`,
          ),
          ...cancelSpec.symbols.map(
            (symbol) =>
              `form[data-chatgpt-composer][data-thread-find-composer="true"] button:has(svg use[href$="${symbol}"])`,
          ),
        ];
  const control = page.locator(selectors.join(', ')).filter({ visible: true });
  const count = await control.count();
  if (count === 0) {
    if (setup === 'dictation-active') {
      await waitForEnabledButton(page, DICTATION_START_BUTTON_SELECTORS, 5000);
    }
    return { status: 'clean' };
  }
  if (count !== 1) throw new Error('Prepared-state cleanup control is ambiguous.');
  await waitBeforeBrowserInteraction();
  await control.click({ timeout: 5000 });
  await control.waitFor({ state: 'hidden', timeout: 15000 });
  if (setup === 'dictation-active') {
    await waitForEnabledButton(page, DICTATION_START_BUTTON_SELECTORS, 5000);
  }
  return { status: 'clean' };
}

export async function runLiveShortcutActivationProbes(page, context, options = {}) {
  const prepareCaptureOnly = options.prepareCaptureOnly === true;
  const selectedCaptureActionIds = prepareCaptureOnly
    ? getProbeOnlyCaptureActionIds(options.onlyActionIds || [])
    : [];
  const requestedActionIds = new Set(
    prepareCaptureOnly ? selectedCaptureActionIds : options.onlyActionIds || [],
  );
  const fixedContractIds = new Set(prepareCaptureOnly ? [] : options.fixedContractIds || []);
  const phase = prepareCaptureOnly
    ? 'all'
    : ['global', 'model', 'all'].includes(options.phase)
      ? options.phase
      : 'all';
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
  const collectTargetArtifacts = prepareCaptureOnly || options.collectTargetArtifacts === true;
  const inventory = await buildCurrentShortcutInventory(scrapeStateRegistry);
  const runFolderPath = options.runFolderPath || '';
  const modelCapabilities = await resolveLiveProbeCapabilities(options, runFolderPath);
  const targetById = Object.fromEntries(
    inventory.targets.map((target) => [target.targetId, target]),
  );
  const fixedOnly = requestedActionIds.size === 0 && fixedContractIds.size > 0;
  const selectedGlobalActionIds = new Set(requestedActionIds);
  if (fixedContractIds.has('runtime-shortcut-dispatch')) {
    selectedGlobalActionIds.add('shortcutKeyActivateInput');
  }
  if (fixedContractIds.has('shortcut-overlay-opener')) {
    selectedGlobalActionIds.add('shortcutKeyShowOverlay');
  }
  const runGlobalActions = !fixedOnly || selectedGlobalActionIds.size > 0;
  const phaseShortcuts = inventory.shortcuts.filter(
    (shortcut) =>
      phase === 'all' ||
      (phase === 'model' ? isModelPhaseShortcut(shortcut) : !isModelPhaseShortcut(shortcut)),
  );
  const globalShortcutsToRun = !runGlobalActions
    ? []
    : requestedActionIds.size || fixedContractIds.size
      ? phaseShortcuts.filter((shortcut) => selectedGlobalActionIds.has(shortcut.actionId))
      : phaseShortcuts;
  const fixedContractsToRun =
    prepareCaptureOnly ||
    options.includeFixedContracts === false ||
    phase === 'model' ||
    (requestedActionIds.size > 0 && fixedContractIds.size === 0)
      ? []
      : (inventory.fixedKeyboardContracts || []).filter(
          (contract) => !fixedContractIds.size || fixedContractIds.has(contract.contractId),
        );
  const executableProbeShortcuts = inventory.shortcuts.filter(
    (shortcut) =>
      globalShortcutsToRun.includes(shortcut) &&
      EXECUTABLE_LIVE_PROBE_MODES.includes(shortcut.activationProbeMode) &&
      shortcut.activationProbeSafe &&
      !getUnavailableCapabilities(shortcut.requiredCapabilities, modelCapabilities).length,
  );
  const checkpoint = {
    schemaVersion: 1,
    status: 'preflight',
    phase,
    capabilities: modelCapabilities,
    fixtureUrl,
    auditFixtureUrl: fixtureOwnership?.fixtureUrl || '',
    auditFixtureOwned: Boolean(fixtureOwnership),
    auditFixtureSourceRun: fixtureOwnership?.sourceRunFolder || '',
    fixtureSetupStartedAt: fixtureOwnership?.setupStartedAt || '',
    fixturePreparedAt: fixtureOwnership?.preparedAt || '',
    fixtureSetupProof: fixtureOwnership?.setupProof || null,
    fixtureSetupCheckpointPath: fixtureOwnership?.sourceCheckpointPath || '',
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
    currentCase: fixtureOwnership?.setupCurrentCase || null,
    completedCases: Array.isArray(fixtureOwnership?.setupCompletedCases)
      ? fixtureOwnership.setupCompletedCases.map((item) => ({ ...item }))
      : [],
    auditOwnedConversationIds: Array.isArray(fixtureOwnership?.auditOwnedConversationIds)
      ? [...new Set(fixtureOwnership.auditOwnedConversationIds)]
      : fixtureOwnership?.conversationId
        ? [fixtureOwnership.conversationId]
        : [],
    storageRecoveryStatus: 'not-run',
    clipboardRecoveryStatus: 'not-needed',
    clipboardRecovery: null,
    recoveryCheckpointStage: '',
    checkpointWriteError: '',
  };
  rememberAuditOwnedConversationIds(page, checkpoint.auditOwnedConversationIds);
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
        rememberAuditOwnedConversationIds(page, [conversationId]);
      }
    } catch {}
  };

  const supplementalArtifactByState = new Map();
  const supplementalDefinitionByState = new Map();
  if (collectTargetArtifacts) {
    for (const stateId of Object.keys(LIVE_PROBE_CAPTURE_TARGET_BY_STATE)) {
      const definition = scrapeStateRegistry.find(
        (entry) => entry.stateId === stateId && entry.probeOnly === true,
      );
      if (!definition) {
        throw new Error(`The registered probe-only artifact ${stateId} is missing.`);
      }
      if (definition.capture?.targetRef !== LIVE_PROBE_CAPTURE_TARGET_BY_STATE[stateId]) {
        throw new Error(`The registered probe-only artifact ${stateId} has an unsupported target.`);
      }
      supplementalDefinitionByState.set(stateId, definition);
      supplementalArtifactByState.set(
        stateId,
        buildArtifactRecord(
          definition,
          'deferred',
          '',
          'The matching live shortcut probe was omitted or did not reach its prepared target state.',
        ),
      );
    }
  }
  const auditOwnedSetupByCaptureState = Object.freeze({
    'probe-code-block-content': 'clipboard-code-blocks',
    'probe-codebox-wrap-enabled': 'codebox-conversation',
    'probe-edit-send-button': 'active-edit-card',
    'probe-edit-message-button': 'active-edit-card',
    'probe-send-button': 'composer-draft-message',
    'probe-stop-button': 'in-flight-message',
    'probe-temporary-chat': 'new-conversation',
    'probe-blank-chat-work-surface-toggle': 'new-conversation',
    'probe-composer-study-search': 'composer-plus-menu-search-study',
    'probe-composer-deep-research-search': 'composer-plus-menu-search-deep-research',
    'probe-active-dictation-controls': 'dictation-active',
    'probe-blank-chat-dictate-start': 'new-conversation',
  });
  const captureSupplementalForAction = async (
    shortcut,
    semanticSnapshot = null,
    blankNewChatProvenance = null,
    captureOptions = {},
  ) => {
    if (!collectTargetArtifacts) return;
    const stateId = captureOptions.stateId || LIVE_PROBE_CAPTURE_STATE_BY_ACTION[shortcut.actionId];
    if (!stateId) return;
    const definition = supplementalDefinitionByState.get(stateId);
    if (!definition) return;
    const expectedSetup = auditOwnedSetupByCaptureState[stateId];
    const conversationId = page.url().match(/\/c\/([^/]+)/)?.[1] || '';
    const setupMatches = !expectedSetup || shortcut.activationProbeSetup === expectedSetup;
    const isAuditOwnedConversation =
      !protectedFixtureIds.has(conversationId) &&
      Boolean(conversationId) &&
      checkpoint.auditOwnedConversationIds.includes(conversationId) &&
      setupMatches;
    const hasVerifiedBlankHomeProvenance =
      setupMatches &&
      [
        'probe-send-button',
        'probe-temporary-chat',
        'probe-blank-chat-work-surface-toggle',
        'probe-composer-study-search',
        'probe-composer-deep-research-search',
        'probe-active-dictation-controls',
        'probe-blank-chat-dictate-start',
      ].includes(stateId) &&
      isVerifiedBlankNewChatProvenance(blankNewChatProvenance, page.url());
    supplementalArtifactByState.set(
      stateId,
      await captureSupplementalProbeArtifact(page, definition, {
        auditOwned: isAuditOwnedConversation,
        semanticSnapshot,
        blankNewChatProvenance: hasVerifiedBlankHomeProvenance ? blankNewChatProvenance : null,
        targetLocator: captureOptions.targetLocator || null,
      }),
    );
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
    activeShortcutCodes = await readExtensionSyncStorage(context, extensionId, [
      ...new Set(storageSnapshotKeys),
    ]);
    originalActiveShortcutCodes = { ...activeShortcutCodes };
    const storedValues = {};
    const catalogFingerprints = {};
    for (const key of storageSnapshotKeys) {
      const present = Object.hasOwn(activeShortcutCodes, key);
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
    temporaryShortcutAssignments = prepareCaptureOnly
      ? {}
      : buildTemporaryShortcutAssignments(executableProbeShortcuts, activeShortcutCodes);
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
  let lastVerifiedBlankNewChatProvenance = null;
  try {
    const needsConversationState =
      phase !== 'model' && (runGlobalActions || fixedContractIds.size > 0);
    const needsTwoTurnFixture = requiresAuditOwnedTwoTurnFixture({
      onlyActionIds: [...requestedActionIds],
      fixedContractIds: [...fixedContractIds],
      phase,
      shortcuts: inventory.shortcuts,
    });
    const freshFixtureSetupWasProven =
      fixtureOwnership?.kind === 'audit-owned' &&
      isCompleteFreshAuditFixtureProof(
        fixtureOwnership.setupProof,
        fixtureUrl,
        fixtureOwnership.conversationId,
      ) &&
      checkpoint.auditOwnedConversationIds.includes(fixtureOwnership.conversationId);
    const shouldPrepareOwnedFixture =
      needsConversationState && needsTwoTurnFixture && !freshFixtureSetupWasProven;
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
    if (needsConversationState && !needsTwoTurnFixture) {
      await prepareNewConversationProbeState(page, fixtureUrl, {
        diagnosticCheckpoint: checkpoint,
        diagnosticPersistCheckpoint: persistCheckpoint,
      });
    }
    for (const shortcut of orderedShortcuts) {
      if (
        shortcut.actionId !== NEW_CONVERSATION_ACTION_ID &&
        shortcut.actionId !== TEMPORARY_CHAT_ACTION_ID
      ) {
        blankConversationReadyFromShortcut = false;
      }
      const dispatchCode = resolveShortcutDispatchCode(shortcut, activeShortcutCodes);
      const unavailableCapabilities = getUnavailableCapabilities(
        shortcut.requiredCapabilities,
        modelCapabilities,
      );
      if (unavailableCapabilities.length > 0) {
        const reason = `Required capability is unavailable: ${unavailableCapabilities.join(', ')}.`;
        const row = buildSkippedLiveProbeRow(shortcut, 'not-applicable', reason, dispatchCode);
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
      if (
        !prepareCaptureOnly &&
        !executableProbeShortcuts.some((item) => item.actionId === shortcut.actionId)
      ) {
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
      const probeStateId =
        shortcut.activationProbeUiStateRefs?.[0] || shortcut.requiredUiStateRefs?.[0];
      let fileChooserObserved = false;
      let shareClipboardCleared = false;
      let resolveFileChooser;
      const fileChooserEvent =
        shortcut.actionId === 'shortcutKeyAddPhotosFiles'
          ? new Promise((resolve) => {
              resolveFileChooser = resolve;
            })
          : Promise.resolve(false);
      const fileChooserListener = (chooser) => {
        // Playwright intercepts the picker; an empty selection uploads no files.
        // Wrap the API call so a synchronous callback failure cannot escape the emitter.
        void Promise.resolve()
          .then(() => chooser.setFiles([], { timeout: 1200 }))
          .then(
            () => {
              fileChooserObserved = true;
              resolveFileChooser?.(true);
            },
            () => resolveFileChooser?.(false),
          );
      };
      const canReuseNewConversationState =
        shortcut.actionId === TEMPORARY_CHAT_ACTION_ID &&
        shortcut.activationProbeSetup === 'new-conversation' &&
        blankConversationReadyFromShortcut;
      let setupBlankNewChatProvenance = canReuseNewConversationState
        ? lastVerifiedBlankNewChatProvenance
        : null;
      let verifiedAuditConversationSource = false;
      try {
        if (!prepareCaptureOnly && !dispatchCode) {
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
          throw new Error(
            `Unknown expected probe target: ${shortcut.activationProbeExpectedTargetRef}`,
          );
        }
        if (!probeStateId && !STATELESS_LIVE_PROBE_SETUPS.includes(shortcut.activationProbeSetup)) {
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
          if (shortcut.actionId === NEW_CONVERSATION_ACTION_ID) {
            if (prepareCaptureOnly) {
              setupBlankNewChatProvenance = await prepareNewConversationProbeState(
                page,
                fixtureUrl,
                {
                  diagnosticCheckpoint: checkpoint,
                  diagnosticPersistCheckpoint: persistCheckpoint,
                },
              );
            } else {
              verifiedAuditConversationSource =
                await prepareExistingAuditOwnedConversationForNewChat(page, fixtureUrl, {
                  checkpoint,
                  fixtureOwnership,
                  persistCheckpoint,
                });
            }
          } else if (!canReuseNewConversationState) {
            setupBlankNewChatProvenance = await prepareNewConversationProbeState(page, fixtureUrl, {
              diagnosticCheckpoint: checkpoint,
              diagnosticPersistCheckpoint: persistCheckpoint,
            });
          }
        } else if (shortcut.activationProbeSetup === 'gpt-conversation') {
          await prepareGptConversationProbeState(
            page,
            shortcut.activationProbeUrl || GPT_CONVERSATION_PROBE_URL,
          );
          if (collectTargetArtifacts) {
            const definition = supplementalDefinitionByState.get('probe-new-gpt-conversation');
            if (definition) {
              const captureState = { currentTurnTestId: null, latestMenuHtml: '' };
              for (const step of definition.steps || []) {
                await applyProbeStateStep(page, step, captureState);
              }
            }
          }
        } else if (shortcut.activationProbeSetup === 'composer-draft-message') {
          setupBlankNewChatProvenance = await prepareComposerDraftMessageProbeState(
            page,
            fixtureUrl,
            { checkpoint, persistCheckpoint },
          );
        } else if (shortcut.activationProbeSetup === 'in-flight-message') {
          setupBlankNewChatProvenance = await prepareInFlightMessageProbeState(page, fixtureUrl, {
            checkpoint,
            persistCheckpoint,
          });
        } else if (shortcut.activationProbeSetup === 'active-edit-card') {
          setupBlankNewChatProvenance = await prepareActiveEditCardProbeState(page, fixtureUrl, {
            checkpoint,
            persistCheckpoint,
            onBeforeOpenEdit: async (editButton) => {
              trackAuditOwnedConversation(page.url());
              await captureSupplementalForAction(shortcut, null, null, {
                stateId: 'probe-edit-message-button',
                targetLocator: editButton,
              });
            },
          });
        } else if (shortcut.activationProbeSetup === 'sent-user-message') {
          setupBlankNewChatProvenance = await prepareSentUserMessageProbeState(page, fixtureUrl, {
            checkpoint,
            persistCheckpoint,
          });
        } else if (shortcut.activationProbeSetup === 'dictation-active') {
          setupBlankNewChatProvenance = await prepareDictationActiveProbeState(page, fixtureUrl);
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
        } else if (
          ['message-scroll-from-top', 'message-scroll-from-bottom'].includes(
            shortcut.activationProbeSetup,
          )
        ) {
          await prepareMessageScrollProbeState(page, fixtureUrl, shortcut.activationProbeSetup);
        } else if (shortcut.activationProbeSetup === 'clipboard-single-message') {
          await prepareClipboardSingleMessageProbeState(
            page,
            scrapeStateRegistry,
            fixtureUrl,
            codeboxProbeSession,
          );
        } else if (shortcut.activationProbeSetup === 'clipboard-entire-conversation') {
          await prepareClipboardEntireConversationProbeState(page, fixtureUrl, codeboxProbeSession);
        } else if (shortcut.activationProbeSetup === 'clipboard-code-blocks') {
          await prepareClipboardCodeBlocksProbeState(page, fixtureUrl, codeboxProbeSession, {
            captureOnly: prepareCaptureOnly,
            trackAuditOwnedConversation,
          });
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
            throw new Error(
              'Codebox wrap preference mutation was not recorded before shortcut dispatch.',
            );
          }
          codeboxPreferenceMutation.auditValues = [false, true];
          checkpoint.mutationLedger = mutationLedger;
          checkpoint.currentCase.codeboxPreferenceMayBecomeEnabled = true;
          await persistCheckpoint();
          if (prepareCaptureOnly) {
            await writeAuditStorageSetting({
              context,
              extensionId,
              key: 'codeboxWrapEnabled',
              value: true,
              originalStorage: originalActiveShortcutCodes,
              mutationLedger,
              checkpoint,
              persistCheckpoint,
              intentType: 'codebox-wrap-capture-only',
            });
            await page.waitForFunction(
              () => document.documentElement.classList.contains('csp-codebox-wrap-enabled'),
              undefined,
              { timeout: 5000 },
            );
          }
        } else if (shortcut.activationProbeSetup === 'shortcut-overlay-ready') {
          await resetFixturePage(page, fixtureUrl);
          await closeTransientUi(page);
        } else if (shortcut.activationProbeSetup === 'composer-plus-menu') {
          await resetFixturePage(page, fixtureUrl);
          await openComposerPlusMenu(page);
        } else if (
          ['composer-plus-menu-search-study', 'composer-plus-menu-search-deep-research'].includes(
            shortcut.activationProbeSetup,
          )
        ) {
          setupBlankNewChatProvenance = await prepareComposerStudySearchProbeState(
            page,
            fixtureUrl,
            {
              checkpoint,
              persistCheckpoint,
              query: shortcut.actionId === 'shortcutKeyDeepResearch' ? 'deep research' : 'study',
              actionId: shortcut.actionId,
            },
          );
        } else {
          await prepareLiveProbeState(page, probeStateId, scrapeStateRegistry, fixtureUrl);
        }
        if (shortcut.actionId === 'shortcutKeySearchConversationHistory') {
          await ensureSearchChatsOpenerVisible(page);
        }
        if (
          shortcut.activationProbeSetup !== 'gpt-conversation' &&
          shortcut.activationProbeMode !== 'opens-target' &&
          shortcut.activationProbeMode !== 'dom-state' &&
          !isModelEffortShortcut(shortcut)
        ) {
          if (shortcut.actionId === 'shortcutKeyStudy') {
            await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'study.target-presence');
          }
          try {
            await waitForLiveProbeTargetPresence(page, target);
          } catch (error) {
            if (shortcut.actionId === 'shortcutKeyStudy' && checkpoint.currentCase) {
              checkpoint.currentCase.studyTargetPresence = await captureTargetPresenceCounts(
                page,
                target,
              ).catch(() => ({ requiredGroups: 0, matchedGroups: 0, unavailable: true }));
              await persistCheckpoint().catch(() => {});
            }
            throw error;
          }
          if (shortcut.actionId === 'shortcutKeyStudy') {
            await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'study.target-present');
          }
        }
        trackAuditOwnedConversation(page.url());
        if (
          shortcut.actionId !== 'shortcutKeyToggleCodeboxWrap' &&
          (shortcut.actionId !== NEW_CONVERSATION_ACTION_ID || prepareCaptureOnly)
        ) {
          await captureSupplementalForAction(shortcut, null, setupBlankNewChatProvenance);
        }
        if (prepareCaptureOnly && shortcut.actionId === 'shortcutKeyToggleCodeboxWrap') {
          const captureSnapshot = await captureLiveProbeSemanticSnapshot(page, target);
          await captureSupplementalForAction(
            shortcut,
            captureSnapshot,
            setupBlankNewChatProvenance,
          );
        }
        if (
          !prepareCaptureOnly &&
          collectTargetArtifacts &&
          shortcut.actionId === 'shortcutKeyNewGptConversation'
        ) {
          await closeOpenMenus(page);
          if (
            await page.locator('[data-radix-menu-content][data-state="open"][role="menu"]').count()
          ) {
            throw new Error(
              'The GPT evidence menu could not be dismissed before shortcut dispatch.',
            );
          }
        }
        if (prepareCaptureOnly) {
          const stateId = LIVE_PROBE_CAPTURE_STATE_BY_ACTION[shortcut.actionId];
          const captureArtifact = supplementalArtifactByState.get(stateId);
          const row = buildCaptureOnlyLiveProbeRow(
            shortcut,
            captureArtifact,
            Date.now() - startedAt,
          );
          rows.push(row);
          checkpoint.currentCase.phase = 'capture-only-completed';
          checkpoint.currentCase.captureStatus = row.stateCapture.status;
          checkpoint.completedCases.push({
            rowId: `global:${shortcut.actionId}`,
            actionId: shortcut.actionId,
            status: row.status,
            captureStatus: row.stateCapture.status,
            reason: row.reason,
            completedAt: new Date().toISOString(),
          });
          checkpoint.currentCase = null;
          await persistCheckpoint();
          continue;
        }
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
        if (shortcut.actionId === 'shortcutKeyShare') {
          await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
            origin: new URL(page.url()).origin,
          });
          await page.evaluate(() => navigator.clipboard.writeText(''));
          shareClipboardCleared = await page.evaluate(
            async () => (await navigator.clipboard.readText()) === '',
          );
          if (!shareClipboardCleared)
            throw new Error(
              'Share clipboard preparation did not produce a verified empty clipboard.',
            );
          await installShareToastObserver(page);
        }
        const beforeSnapshot = await captureLiveProbeSemanticSnapshot(page, target);
        if (shortcut.actionId === NEW_CONVERSATION_ACTION_ID) {
          beforeSnapshot.auditOwnedFixtureConversation = verifiedAuditConversationSource;
        }
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
        } else {
          await dispatchShortcutForAction(page, shortcut, dispatchCode);
        }
        checkpoint.currentCase.phase = 'sent-awaiting-semantic-postcondition';
        checkpoint.currentCase.postActionUrl = page.url();
        checkpoint.currentCase.postActionConversationId =
          page.url().match(/\/c\/([^/]+)/)?.[1] || '';
        await persistCheckpoint();
        if (shortcut.actionId === NEW_CONVERSATION_ACTION_ID) {
          await markProbeDiagnosticStage(
            checkpoint,
            persistCheckpoint,
            'newconv.blank-home-postcondition',
          );
          try {
            await waitForVerifiedBlankConversationAfterShortcut(page, beforeSnapshot.url);
          } catch (error) {
            checkpoint.currentCase.newConversationBlankHomeStatus =
              await captureBlankHomePostconditionStatus(page, beforeSnapshot.url).catch(() => ({
                available: false,
              }));
            await persistCheckpoint().catch(() => {});
            throw error;
          }
          checkpoint.currentCase.newConversationBlankHomeStatus = { satisfied: true };
        }
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
            await clickEnabledButton(page, STOP_BUTTON_SELECTORS).catch(() => {});
            throw error;
          }
        }
        checkpoint.currentCase.phase = 'dispatched';
        checkpoint.currentCase.postActionUrl = page.url();
        checkpoint.currentCase.postActionConversationId =
          page.url().match(/\/c\/([^/]+)/)?.[1] || '';
        await persistCheckpoint();
        if (shortcut.actionId === 'shortcutKeyAddPhotosFiles') {
          await Promise.race([fileChooserEvent, page.waitForTimeout(1200).then(() => false)]);
        }
        let afterSnapshot = await captureLiveProbeSemanticSnapshot(page, target);
        let semanticActionEvidence = null;
        if (shortcut.actionId === 'shortcutKeyShare') {
          semanticActionEvidence = {
            share: {
              ...(await waitForShareClipboardToast(page)),
              clipboardCleared: shareClipboardCleared,
            },
          };
        }
        if (shortcut.actionId === 'shortcutKeyStudy') {
          const studyPillActivationSnapshot = afterSnapshot;
          let studyToggleOffDispatched = false;
          await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'study.pill-on');
          try {
            await waitForStudyPillCount(page, 1);
          } catch {}
          const confirmedActivationSnapshot =
            studyPillActivationSnapshot.selectedStudyPillCount === 1
              ? studyPillActivationSnapshot
              : await captureLiveProbeSemanticSnapshot(page, target);
          if (confirmedActivationSnapshot.selectedStudyPillCount === 1) {
            await markProbeDiagnosticStage(checkpoint, persistCheckpoint, 'study.pill-off');
            checkpoint.currentCase.phase = 'study-pill-on-confirmed';
            await persistCheckpoint();
            try {
              await dispatchShortcutForAction(page, shortcut, dispatchCode);
              studyToggleOffDispatched = true;
              checkpoint.currentCase.phase = 'study-pill-off-pending';
              await persistCheckpoint();
              await waitForStudyPillCount(page, 0);
            } catch {}
          }
          afterSnapshot = await captureLiveProbeSemanticSnapshot(page, target);
          semanticActionEvidence = {
            studyPillActivationSnapshot: confirmedActivationSnapshot,
            studyPillDeactivationSnapshot: afterSnapshot,
            studyToggleOffDispatched,
          };
          checkpoint.currentCase.studyPillCounts = {
            afterActivation: confirmedActivationSnapshot.selectedStudyPillCount,
            afterDeactivation: afterSnapshot.selectedStudyPillCount,
          };
          await persistCheckpoint();
        }
        const observed = await readLiveProbeObserver(page);
        const clickMatch = (observed.clicks || []).find((click) =>
          targetMatchesText(target, click.html),
        );
        const focusMatch = matchesLiveProbeFocusTarget(
          target,
          afterSnapshot,
          observed.activeElement?.html || '',
        );
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
        const matchingKeydown =
          [...(observed.keydowns || [])].reverse().find((event) => event.code === dispatchCode) ||
          null;
        if (semanticActionEvidence?.share) {
          semanticActionEvidence.share.trustedDispatch =
            matchingKeydown?.isTrusted === true &&
            matchingKeydown.altKey === true &&
            matchingKeydown.defaultPrevented === true;
          semanticActionEvidence.share.targetClickObserved = Boolean(clickMatch);
        }
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
          semanticActionEvidence,
        );
        if (shortcut.actionId === NEW_CONVERSATION_ACTION_ID && semantic.status === 'pass') {
          const blankNewChatProvenance = {
            kind: 'verified-blank-new-chat',
            source: 'shortcut-semantic-postcondition',
            url: afterSnapshot.url,
            userMessageCount: afterSnapshot.userMessageCount,
            assistantMessageCount: afterSnapshot.assistantMessageCount,
            composerHasText: afterSnapshot.composerHasText,
          };
          await captureSupplementalForAction(shortcut, afterSnapshot, blankNewChatProvenance);
        }
        if (
          shortcut.actionId === 'shortcutKeyToggleCodeboxWrap' &&
          afterSnapshot.codeboxWrapEnabled === true
        ) {
          await captureSupplementalForAction(shortcut, afterSnapshot, setupBlankNewChatProvenance);
        }
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
            if (persistenceProof.status === 'pass') {
              const conversationSwitchProof = await verifyCodeboxWrapConversationSwitch(page, {
                sourceSnapshot: reloadedSnapshot,
                storedBeforeSwitch: storedAfterReload,
                auditOwnedConversationIds: checkpoint.auditOwnedConversationIds,
                protectedConversationIds: [...protectedFixtureIds],
                checkpoint,
                persistCheckpoint,
                readStorage: () =>
                  readExtensionSyncStorage(context, extensionId, ['codeboxWrapEnabled']),
              });
              persistenceProof.conversationSwitchProof = conversationSwitchProof;
              if (conversationSwitchProof.status !== 'pass') {
                persistenceProof.status = conversationSwitchProof.status;
                persistenceProof.reason = conversationSwitchProof.reason;
              }
            }
            checkpoint.currentCase.persistenceProof = persistenceProof;
            checkpoint.currentCase.phase = 'codebox-persistence-verified';
            checkpoint.currentCase.postActionUrl = page.url();
            checkpoint.currentCase.postActionConversationId =
              page.url().match(/\/c\/([^/]+)/)?.[1] || '';
            await persistCheckpoint();
          } catch (error) {
            persistenceProof = {
              status: 'environment-fail',
              proofMethod:
                'chrome.storage.sync read plus audit-owned page reload and rendered line geometry',
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
          proofMethod: intercepted ? 'trusted-keydown-default-prevention' : 'keyboard-event-path',
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
            beforeSnapshot.visibleTarget || afterSnapshot.visibleTarget || Boolean(clickMatch)
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
        const diagnosticStage =
          semantic.status === 'pass' ? '' : checkpoint.currentCase?.diagnosticStage || '';
        const observedNode = clickMatch || observed.clicks?.[0] || observed.activeElement || {};

        rows.push({
          actionId: shortcut.actionId,
          label: shortcut.label,
          defaultCode: shortcut.defaultCode,
          requiredCapabilities: shortcut.requiredCapabilities || [],
          dispatchCode,
          probeMode: shortcut.activationProbeMode,
          expectedTargetRef: shortcut.activationProbeExpectedTargetRef,
          status,
          ...(diagnosticStage ? { failureStage: diagnosticStage } : {}),
          reason:
            semantic.reason ||
            (status === 'pass'
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
          ...(diagnosticStage ? { failureStage: diagnosticStage } : {}),
          preActionConversationId: checkpoint.currentCase?.preActionConversationId || '',
          postActionConversationId: checkpoint.currentCase?.postActionConversationId || '',
          completedAt: new Date().toISOString(),
        });
        checkpoint.currentCase = null;
        await persistCheckpoint();
        blankConversationReadyFromShortcut =
          shortcut.actionId === NEW_CONVERSATION_ACTION_ID && semantic.status === 'pass';
        lastVerifiedBlankNewChatProvenance =
          blankConversationReadyFromShortcut &&
          isChatGptRootPageUrl(afterSnapshot.url) &&
          afterSnapshot.hasComposer &&
          afterSnapshot.messageCount === 0 &&
          afterSnapshot.userMessageCount === 0 &&
          afterSnapshot.assistantMessageCount === 0 &&
          afterSnapshot.composerHasText === false
            ? {
                kind: 'verified-blank-new-chat',
                source: 'shortcut-semantic-postcondition',
                url: afterSnapshot.url,
                userMessageCount: 0,
                assistantMessageCount: 0,
                composerHasText: false,
              }
            : null;
      } catch (error) {
        blankConversationReadyFromShortcut = false;
        const failureReason = error?.message || String(error) || 'Unknown live probe failure';
        const reportedFailureReason = prepareCaptureOnly
          ? CAPTURE_ONLY_FAILURE_REASONS.capture
          : failureReason;
        const failureStatus = prepareCaptureOnly ? 'not-live-probed' : 'coverage-gap';
        if (checkpoint.currentCase?.actionId === shortcut.actionId) {
          const failureStage = checkpoint.currentCase.diagnosticStage || '';
          checkpoint.currentCase.phase = 'case-failed';
          checkpoint.currentCase.error = reportedFailureReason;
          checkpoint.currentCase.postActionUrl = page.url();
          checkpoint.currentCase.postActionConversationId =
            page.url().match(/\/c\/([^/]+)/)?.[1] || '';
          trackAuditOwnedConversation(page.url());
          checkpoint.completedCases.push({
            rowId: `global:${shortcut.actionId}`,
            actionId: shortcut.actionId,
            status: failureStatus,
            ...(prepareCaptureOnly ? { captureStatus: 'failed' } : {}),
            reason: reportedFailureReason,
            failureStage,
            preActionConversationId: checkpoint.currentCase.preActionConversationId || '',
            postActionConversationId: checkpoint.currentCase.postActionConversationId || '',
            ...(checkpoint.currentCase.newConversationBlankHomeStatus
              ? {
                  newConversationBlankHomeStatus:
                    checkpoint.currentCase.newConversationBlankHomeStatus,
                }
              : {}),
            ...(checkpoint.currentCase.studyTargetPresence
              ? { studyTargetPresence: checkpoint.currentCase.studyTargetPresence }
              : {}),
            completedAt: new Date().toISOString(),
          });
          checkpoint.currentCase = null;
          await persistCheckpoint().catch(() => {});
        } else {
          checkpoint.completedCases.push({
            rowId: `global:${shortcut.actionId}`,
            actionId: shortcut.actionId,
            status: failureStatus,
            ...(prepareCaptureOnly ? { captureStatus: 'failed' } : {}),
            reason: reportedFailureReason,
            failureStage: '',
            completedAt: new Date().toISOString(),
          });
          await persistCheckpoint().catch(() => {});
        }
        rows.push(
          prepareCaptureOnly
            ? buildCaptureOnlyLiveProbeRow(
                shortcut,
                {
                  stateId: LIVE_PROBE_CAPTURE_STATE_BY_ACTION[shortcut.actionId],
                  status: 'failed',
                  error: reportedFailureReason,
                },
                Date.now() - startedAt,
              )
            : {
                actionId: shortcut.actionId,
                label: shortcut.label,
                defaultCode: shortcut.defaultCode,
                requiredCapabilities: shortcut.requiredCapabilities || [],
                dispatchCode,
                probeMode: shortcut.activationProbeMode,
                expectedTargetRef: shortcut.activationProbeExpectedTargetRef,
                status: 'fail',
                failureStage: checkpoint.completedCases.at(-1)?.failureStage || '',
                ...(checkpoint.completedCases.at(-1)?.newConversationBlankHomeStatus
                  ? {
                      newConversationBlankHomeStatus:
                        checkpoint.completedCases.at(-1).newConversationBlankHomeStatus,
                    }
                  : {}),
                ...(checkpoint.completedCases.at(-1)?.studyTargetPresence
                  ? { studyTargetPresence: checkpoint.completedCases.at(-1).studyTargetPresence }
                  : {}),
                reason: error?.message || String(error) || 'Unknown live probe failure',
                observedSelector: '',
                observedTextSnippet: '',
                targetProof: {
                  status: 'not-run',
                  proofMethod: 'none',
                  expectedTargetRef: shortcut.activationProbeExpectedTargetRef || '',
                  observedTargetRef: '',
                },
                routingProof: {
                  status: 'not-observed',
                  proofMethod: 'none',
                  observedTargetRef: '',
                },
                semantic: {
                  status: 'not-run',
                  proofMethod: 'none',
                  expected: shortcut.activationProbeExpectedTargetRef || shortcut.notes || '',
                  observed: '',
                  reason:
                    error?.message || String(error) || 'Probe did not reach semantic evaluation.',
                },
                durationMs: Date.now() - startedAt,
              },
        );
        if (prepareCaptureOnly) {
          recordCaptureOnlyFailure({
            actionId: shortcut.actionId,
            supplementalArtifactByState,
            rows,
            checkpoint,
            failureType: 'capture',
            diagnosticError: failureReason,
          });
        }
      } finally {
        const cleanupScope = `global:${shortcut.actionId}`;
        if (prepareCaptureOnly) {
          try {
            const cleanup = await cleanupPreparedCaptureState(page, shortcut, {
              auditOwnedConversationIds: checkpoint.auditOwnedConversationIds,
              allowVerifiedBlankHome: true,
            });
            const cleanupResult = recordPreparedCaptureCleanup({
              cleanup,
              actionId: shortcut.actionId,
              supplementalArtifactByState,
              rows,
              checkpoint,
            });
            if (cleanupResult.failed) {
              await persistCheckpoint().catch(() => {});
            }
          } catch {
            recordPreparedCaptureCleanup({
              cleanup: { status: 'failed' },
              actionId: shortcut.actionId,
              supplementalArtifactByState,
              rows,
              checkpoint,
            });
            await persistCheckpoint().catch(() => {});
          }
        }
        const cleanupGate = await finalizeProbeComposerCleanup(
          rows,
          checkpoint.completedCases,
          shortcut.actionId,
          () =>
            cleanupActiveOwnedComposerDraft(page, {
              auditOwnedConversationIds: checkpoint.auditOwnedConversationIds,
              allowVerifiedBlankHome: true,
              checkpoint,
              persistCheckpoint,
              scope: cleanupScope,
            }),
        );
        if (cleanupGate.downgraded) {
          if (cleanupGate.cleanupThrew) {
            rememberComposerCleanupOutcome(checkpoint, {
              status: 'failed',
              scope: cleanupScope,
              reason: cleanupGate.reason,
            });
          }
          await persistCheckpoint().catch(() => {
            checkpoint.composerCleanupCheckpointError =
              'Composer cleanup gate outcome could not be persisted.';
          });
        }
        page.off('filechooser', fileChooserListener);
        if (shortcut.actionId === 'shortcutKeyShare')
          await cleanupShareToastObserver(page).catch(() => {});
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
    const reportedFailureReason = prepareCaptureOnly
      ? CAPTURE_ONLY_FAILURE_REASONS.setup
      : failureReason;
    checkpoint.preflightError ||= reportedFailureReason;
    checkpoint.status = 'preflight-failed';
    for (const shortcut of orderedShortcuts) {
      if (rows.some((row) => row.actionId === shortcut.actionId)) continue;
      const dispatchCode = resolveShortcutDispatchCode(shortcut, activeShortcutCodes);
      const row = prepareCaptureOnly
        ? buildCaptureOnlyLiveProbeRow(shortcut, {
            stateId: LIVE_PROBE_CAPTURE_STATE_BY_ACTION[shortcut.actionId],
            status: 'failed',
            error: reportedFailureReason,
          })
        : EXECUTABLE_LIVE_PROBE_MODES.includes(shortcut.activationProbeMode) &&
            shortcut.activationProbeSafe
          ? buildSkippedLiveProbeRow(
              shortcut,
              'environment-fail',
              reportedFailureReason,
              dispatchCode,
            )
          : buildNonExecutableLiveProbeRow(shortcut, dispatchCode);
      rows.push(row);
      checkpoint.completedCases.push({
        rowId: `global:${shortcut.actionId}`,
        actionId: shortcut.actionId,
        status: row.status,
        ...(prepareCaptureOnly ? { captureStatus: row.stateCapture.status } : {}),
        reason: row.reason || reportedFailureReason,
        completedAt: new Date().toISOString(),
      });
      if (prepareCaptureOnly) {
        recordCaptureOnlyFailure({
          actionId: shortcut.actionId,
          supplementalArtifactByState,
          rows,
          checkpoint,
          failureType: 'setup',
        });
      }
    }
    for (const contract of fixedContractsToRun) {
      if (fixedRows.some((row) => row.contractId === contract.contractId)) continue;
      fixedRows.push(
        buildFixedContractLiveRow(
          contract,
          fixedSemantic(
            'environment-fail',
            'audit-setup-failure',
            contract.classification,
            '',
            failureReason,
          ),
        ),
      );
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

  await cleanupActiveOwnedComposerDraft(page, {
    auditOwnedConversationIds: checkpoint.auditOwnedConversationIds,
    allowVerifiedBlankHome: true,
    checkpoint,
    persistCheckpoint,
    scope: 'final-run',
  }).catch(() => {});

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
    mode: prepareCaptureOnly ? 'prepare-capture-only' : 'shortcut-activation',
    activationStatus: prepareCaptureOnly ? 'not-live-probed' : 'probed',
    generatedAt: new Date().toISOString(),
    fixtureUrl,
    fixtureOwnership,
    phase,
    capabilities: modelCapabilities,
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
    ...(collectTargetArtifacts
      ? { supplementalArtifacts: [...supplementalArtifactByState.values()] }
      : {}),
    checkpoint: {
      status: checkpoint.status,
      path: checkpointPath,
      currentCase: checkpoint.currentCase,
      completedCaseCount: checkpoint.completedCases.length,
      auditOwnedConversationIds: checkpoint.auditOwnedConversationIds,
      captureCleanupFailures: checkpoint.captureCleanupFailures || [],
      composerCleanupOutcomes: checkpoint.composerCleanupOutcomes || [],
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

async function validateReservedRunDirectory(runDirectory, { allowedEntries = [] } = {}) {
  if (
    !runDirectory ||
    typeof runDirectory.name !== 'string' ||
    typeof runDirectory.path !== 'string' ||
    !path.isAbsolute(runDirectory.path) ||
    !runDirectory.name ||
    runDirectory.name === '.' ||
    runDirectory.name === '..' ||
    path.basename(runDirectory.name) !== runDirectory.name
  ) {
    throw new Error('A reserved run directory name and absolute path are required.');
  }

  const capturesRoot = path.resolve(inspectorCapturesRoot);
  const folderPath = path.resolve(runDirectory.path);
  if (
    path.dirname(folderPath) !== capturesRoot ||
    path.basename(folderPath) !== runDirectory.name
  ) {
    throw new Error('The reserved run directory must be a direct child of inspector-captures.');
  }
  const rootInfo = await lstat(capturesRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error('The inspector-captures root must be a real directory.');
  }
  const folderInfo = await lstat(folderPath);
  if (!folderInfo.isDirectory() || folderInfo.isSymbolicLink()) {
    throw new Error('The reserved run path must be an existing folder, not a link.');
  }
  const entries = await readdir(folderPath);
  const permittedEntries = new Set(allowedEntries);
  if (entries.some((entry) => !permittedEntries.has(entry))) {
    throw new Error('The reserved run directory contains unexpected existing files.');
  }
  return { name: runDirectory.name, path: folderPath };
}

export async function writeScrapeRun({
  scrapeResult,
  normalizedArtifacts,
  runDirectory: reservedRunDirectory,
}) {
  const { exports } = await loadDevScrapeWideContract();
  const runDirectory = reservedRunDirectory
    ? await validateReservedRunDirectory(reservedRunDirectory, {
        allowedEntries: [AUDIT_ARTIFACT_FILENAMES.checkpoint],
      })
    : await createUniqueRunDirectory(exports.buildRunFolderName(new Date()));
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
  const modelCapabilities = Object.hasOwn(scrapeResult, 'capabilities')
    ? assertCapabilities(scrapeResult.capabilities)
    : unknownCapabilities();

  const manifest = {
    schemaVersion: 1,
    runKind: scrapeResult.runKind || 'devscrapewide',
    folderName: runDirectory.name,
    fixtureUrl: scrapeResult.fixtureUrl || exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
    fixtureOwnership: scrapeResult.fixtureOwnership || null,
    capabilities: modelCapabilities,
    pageInfo: scrapeResult.pageInfo || null,
    startedAt: scrapeResult.startedAt || new Date().toISOString(),
    completedAt: scrapeResult.completedAt || new Date().toISOString(),
    capturedCount: Number(scrapeResult.capturedCount || 0),
    failedCount: Number(scrapeResult.failedCount || 0),
    deferredCount: Number(scrapeResult.deferredCount || 0),
    writtenFiles,
    artifacts: manifestArtifacts,
    ...(scrapeResult.currentModelCatalogActionProjection
      ? { currentModelCatalogActionProjection: scrapeResult.currentModelCatalogActionProjection }
      : {}),
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

export async function appendSupplementalProbeArtifacts({
  runFolderPath,
  supplementalArtifacts = [],
  normalizedArtifacts = [],
} = {}) {
  if (typeof runFolderPath !== 'string' || !path.isAbsolute(runFolderPath)) {
    throw new Error('A full path to the existing scrape run folder is required.');
  }
  if (!Array.isArray(supplementalArtifacts) || !Array.isArray(normalizedArtifacts)) {
    throw new Error('Supplemental and normalized artifacts must be arrays.');
  }

  const folderPath = path.resolve(runFolderPath);
  const folderInfo = await lstat(folderPath);
  if (!folderInfo.isDirectory() || folderInfo.isSymbolicLink()) {
    throw new Error('The scrape run path must be an existing folder, not a link.');
  }
  const manifestPath = path.join(folderPath, 'run-manifest.json');
  const manifestInfo = await lstat(manifestPath);
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) {
    throw new Error('The existing scrape run manifest must be a regular file.');
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (
    manifest.folderName !== path.basename(folderPath) ||
    !Array.isArray(manifest.artifacts) ||
    !Array.isArray(manifest.writtenFiles)
  ) {
    throw new Error('The existing run manifest does not identify this scrape folder.');
  }

  const { exports } = await loadDevScrapeWideContract();
  const registryDefinitions = [
    ...(exports.DUMP_REGISTRY || []),
    ...(exports.DEFERRED_ARTIFACTS || []),
  ].filter((definition) => definition.probeOnly === true);
  const definitionByState = new Map();
  const registryFilenames = new Set();
  for (const definition of registryDefinitions) {
    if (
      !definition.stateId ||
      !definition.filename ||
      definitionByState.has(definition.stateId) ||
      registryFilenames.has(definition.filename)
    ) {
      throw new Error('The probe-only registry contains duplicate or incomplete artifact entries.');
    }
    definitionByState.set(definition.stateId, definition);
    registryFilenames.add(definition.filename);
  }

  const assertLeafFilename = (filename, description) => {
    if (
      typeof filename !== 'string' ||
      !filename ||
      filename === '.' ||
      filename === '..' ||
      path.isAbsolute(filename) ||
      filename.includes('/') ||
      filename.includes('\\') ||
      path.basename(filename) !== filename
    ) {
      throw new Error(
        `${description} must be a single filename inside the existing scrape folder.`,
      );
    }
  };
  const incomingByState = new Map();
  const incomingFilenames = new Set();
  for (const artifact of supplementalArtifacts) {
    const definition = definitionByState.get(artifact?.stateId);
    if (!definition) {
      throw new Error(`Unknown probe-only artifact state: ${artifact?.stateId || '(empty)'}`);
    }
    assertLeafFilename(artifact.filename, 'Supplemental artifact filename');
    if (artifact.filename !== definition.filename) {
      throw new Error(`Filename does not match the registered state ${definition.stateId}.`);
    }
    if (incomingByState.has(artifact.stateId) || incomingFilenames.has(artifact.filename)) {
      throw new Error('Supplemental artifacts contain a duplicate state or filename.');
    }
    if (!['captured', 'failed', 'deferred'].includes(artifact.status)) {
      throw new Error(`Unsupported supplemental artifact status for ${artifact.stateId}.`);
    }
    incomingByState.set(artifact.stateId, { artifact, definition });
    incomingFilenames.add(artifact.filename);
  }

  const normalizedByFilename = new Map();
  for (const normalized of normalizedArtifacts) {
    assertLeafFilename(normalized?.filename, 'Normalized artifact filename');
    if (
      normalizedByFilename.has(normalized.filename) ||
      !incomingFilenames.has(normalized.filename) ||
      ![...incomingByState.values()].some(
        ({ artifact }) =>
          artifact.filename === normalized.filename && artifact.status === 'captured',
      )
    ) {
      throw new Error('Normalized artifacts must uniquely match captured supplemental artifacts.');
    }
    if (typeof normalized.normalizedHtml !== 'string' || !normalized.normalizedHtml.trim()) {
      throw new Error(`Normalized HTML is missing for ${normalized.filename}.`);
    }
    normalizedByFilename.set(normalized.filename, normalized.normalizedHtml);
  }
  for (const { artifact } of incomingByState.values()) {
    if (artifact.status === 'captured' && !normalizedByFilename.has(artifact.filename)) {
      throw new Error(`Missing normalized HTML for ${artifact.filename}.`);
    }
  }

  const existingByState = new Map();
  const existingFilenames = new Map();
  for (const entry of manifest.artifacts) {
    if (!entry?.stateId || !entry.filename) continue;
    if (existingByState.has(entry.stateId) || existingFilenames.has(entry.filename)) {
      throw new Error('The existing run manifest contains duplicate artifact states or filenames.');
    }
    existingByState.set(entry.stateId, entry);
    existingFilenames.set(entry.filename, entry.stateId);
  }
  for (const { artifact, definition } of incomingByState.values()) {
    const existingState = existingByState.get(artifact.stateId);
    const filenameOwner = existingFilenames.get(artifact.filename);
    if (existingState && existingState.filename !== definition.filename) {
      throw new Error(`The existing manifest filename does not match ${artifact.stateId}.`);
    }
    if (filenameOwner && filenameOwner !== artifact.stateId) {
      throw new Error(
        `The existing manifest filename belongs to another state: ${artifact.filename}.`,
      );
    }
    if (artifact.status === 'captured') {
      const filePath = path.join(folderPath, artifact.filename);
      if (path.dirname(path.resolve(filePath)) !== folderPath) {
        throw new Error(`Artifact path leaves the existing scrape folder: ${artifact.filename}.`);
      }
      try {
        const targetInfo = await lstat(filePath);
        if (!targetInfo.isFile() || targetInfo.isSymbolicLink()) {
          throw new Error(`Artifact path is not a regular file: ${artifact.filename}.`);
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }

  const nextArtifacts = manifest.artifacts.map((entry) => ({ ...entry }));
  for (const { artifact, definition } of incomingByState.values()) {
    const manifestArtifact = {
      filename: definition.filename,
      stateId: definition.stateId,
      label: definition.label,
      status: artifact.status,
      error: artifact.error || null,
      aliasOf: null,
      captureBytes:
        typeof artifact.captureBytes === 'number'
          ? artifact.captureBytes
          : normalizedByFilename.get(artifact.filename)?.length || 0,
      clickPath: Array.isArray(artifact.clickPath)
        ? artifact.clickPath
        : Array.isArray(definition.steps)
          ? definition.steps.map((step) => step.label || step.type)
          : [],
    };
    const existingIndex = nextArtifacts.findIndex((entry) => entry.stateId === definition.stateId);
    if (existingIndex >= 0) nextArtifacts[existingIndex] = manifestArtifact;
    else nextArtifacts.push(manifestArtifact);
  }

  const nextWrittenFiles = [
    ...new Set(
      nextArtifacts
        .filter((artifact) => artifact.status === 'captured' || artifact.status === 'alias')
        .map((artifact) => artifact.filename),
    ),
  ];
  const previousCompletedAt = Date.parse(manifest.completedAt || '');
  const completedAt = new Date(
    Math.max(Date.now(), Number.isFinite(previousCompletedAt) ? previousCompletedAt + 1 : 0),
  ).toISOString();
  const nextManifest = {
    ...manifest,
    completedAt,
    capturedCount: nextArtifacts.filter(
      (artifact) => artifact.status === 'captured' || artifact.status === 'alias',
    ).length,
    failedCount: nextArtifacts.filter((artifact) => artifact.status === 'failed').length,
    deferredCount: nextArtifacts.filter((artifact) => artifact.status === 'deferred').length,
    writtenFiles: nextWrittenFiles,
    artifacts: nextArtifacts,
  };

  for (const { artifact } of incomingByState.values()) {
    if (artifact.status !== 'captured') continue;
    await writeFile(
      path.join(folderPath, artifact.filename),
      normalizedByFilename.get(artifact.filename),
      'utf8',
    );
  }
  await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8');
  return {
    folderName: nextManifest.folderName,
    folderPath,
    capturedCount: nextManifest.capturedCount,
    failedCount: nextManifest.failedCount,
    deferredCount: nextManifest.deferredCount,
    writtenFiles: nextManifest.writtenFiles,
    manifest: nextManifest,
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
    capabilities: unknownCapabilities(),
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
      clickPath: Array.isArray(definition.steps) ? definition.steps.map((step) => step.label) : [],
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
    capabilities: manifest.capabilities,
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
          error: fileNames.has(definition.filename)
            ? null
            : `Alias file ${definition.filename} is missing`,
          aliasOf: definition.aliasOf || null,
          captureBytes: 0,
          clickPath: Array.isArray(definition.steps)
            ? definition.steps.map((step) => step.label)
            : [],
        };
      }
      return {
        filename: definition.filename,
        stateId: definition.stateId,
        label: definition.label,
        status: fileNames.has(definition.filename) ? 'captured' : 'failed',
        error: fileNames.has(definition.filename)
          ? null
          : `Legacy scrape folder is missing ${definition.filename}`,
        aliasOf: null,
        captureBytes: 0,
        clickPath: Array.isArray(definition.steps)
          ? definition.steps.map((step) => step.label)
          : [],
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
    capturedCount: artifacts.filter(
      (artifact) => artifact.status === 'captured' || artifact.status === 'alias',
    ).length,
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
  const sortableDirectories = directories
    .filter(Boolean)
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey));
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
  const textEntries = entries.filter(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'),
  );
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
  const modelCapabilities = capabilitiesFromManifest(run?.manifest);
  const targetRows = (inventory.targets || []).map((target) => {
    const unavailableStatus = getUnavailableCapabilityStatus(
      target.requiredCapabilities,
      modelCapabilities,
    );
    return {
      targetId: target.targetId,
      identifier: target.identifier,
      canonicalIdentifier: target.identifier,
      kind: target.kind,
      usedByActionIds: target.usedByActionIds,
      requiredCapabilities: target.requiredCapabilities || [],
      expectedUiStateRefs: target.expectedUiStateRefs || [],
      expectedFiles: target.expectedFiles || [],
      matchGroups: target.matchGroups || [],
      matchedExpectedFiles: [],
      allMatchedFiles: [],
      missingExpectedFiles: [],
      unknownUiStateRefs: target.unknownUiStateRefs || [],
      missingMatchGroups: target.missingMatchGroups || false,
      status: unavailableStatus?.status || 'not-run',
      statusReason:
        unavailableStatus?.statusReason ||
        'Inventory-only run; no browser scrape dumps were captured.',
      notes: target.notes || '',
    };
  });
  const shortcutRows = (inventory.shortcuts || []).map((shortcut) => {
    const sourceIssues = (inventory.inventoryIssues || [])
      .filter((issue) => issue.actionId === shortcut.actionId)
      .map((issue) => issue.message || issue.type || 'Inventory issue');
    const unavailableStatus = getUnavailableCapabilityStatus(
      shortcut.requiredCapabilities,
      modelCapabilities,
    );
    const status = sourceIssues.length
      ? 'fail'
      : unavailableStatus
        ? unavailableStatus.status
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
      requiredCapabilities: shortcut.requiredCapabilities || [],
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
        (unavailableStatus
          ? unavailableStatus.statusReason
          : runMode === 'environment-fail'
            ? run?.manifest?.artifacts?.find((artifact) => artifact.error)?.error ||
              'Browser audit could not start.'
            : 'Live activation and scrape coverage were not run in this phase.'),
      notes: shortcut.notes || '',
    };
  });
  const liveProbeRows = Array.isArray(run.liveProbeReport?.rows) ? run.liveProbeReport.rows : [];
  const shortcutSummary = {
    total: shortcutRows.length,
    passed: shortcutRows.filter((row) => row.status === 'pass').length,
    failed: shortcutRows.filter((row) => row.status === 'fail').length,
    partial: 0,
    manual: 0,
    notApplicable: shortcutRows.filter((row) => row.status === 'not-applicable').length,
    notRun: shortcutRows.filter((row) => row.status === 'not-run').length,
    environmentFailed: shortcutRows.filter((row) => row.status === 'environment-fail').length,
  };
  const targetSummary = {
    total: targetRows.length,
    passed: 0,
    failed: 0,
    noScrapeCoverage: targetRows.filter((row) => row.status === 'not-run').length,
    notApplicable: targetRows.filter((row) => row.status === 'not-applicable').length,
    notRun: targetRows.filter((row) => row.status === 'not-run').length,
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
    capabilities: modelCapabilities,
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
  const modelCapabilities = capabilitiesFromManifest(run.manifest);

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
    const presence = evaluateTargetPresence(target, run.files, {
      capabilities: modelCapabilities,
    });

    return {
      targetId: target.targetId,
      identifier: target.identifier,
      canonicalIdentifier: target.identifier,
      kind: target.kind,
      usedByActionIds: target.usedByActionIds,
      requiredCapabilities: target.requiredCapabilities || [],
      expectedUiStateRefs: target.expectedUiStateRefs || [],
      expectedFiles: presence.expectedFiles,
      matchGroups: target.matchGroups || [],
      matchedExpectedFiles: presence.matchedExpectedFiles,
      allMatchedFiles: presence.allMatchedFiles,
      missingExpectedFiles:
        presence.status === 'not-applicable' ? [] : presence.missingExpectedFiles,
      unknownUiStateRefs: target.unknownUiStateRefs || [],
      missingMatchGroups: target.missingMatchGroups || false,
      status: presence.status,
      statusReason: presence.statusReason,
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
    const targetRowsForShortcut = shortcut.targetIds
      .map((targetId) => targetRowById[targetId])
      .filter(Boolean);
    const targetStatuses = targetRowsForShortcut.map((row) => row.status);
    const unavailableStatus = getUnavailableCapabilityStatus(
      shortcut.requiredCapabilities,
      modelCapabilities,
    );
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
    } else if (unavailableStatus) {
      status = unavailableStatus.status;
      statusReason = unavailableStatus.statusReason;
    } else if (shortcut.validationMode === 'not-applicable') {
      status = 'not-applicable';
      statusReason =
        shortcut.notes || 'This shortcut does not rely on a deterministic ChatGPT click target.';
    } else if (shortcut.validationMode === 'manual-only') {
      status = 'manual';
      statusReason =
        shortcut.notes ||
        'This shortcut needs manual or behavioral verification outside the scrape-only validator.';
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
      requiredCapabilities: shortcut.requiredCapabilities || [],
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
    notApplicable: targetRows.filter((row) => row.status === 'not-applicable').length,
  };

  const failingShortcutRows = shortcutRows.filter((row) => row.status === 'fail');
  const partialShortcutRows = shortcutRows.filter(
    (row) => row.status === 'partial' && !livePassedActionIds.has(row.actionId),
  );
  const manualShortcutRows = shortcutRows.filter((row) => row.status === 'manual');
  const needsCoverageShortcutRows = shortcutRows.filter(
    (row) => ['partial', 'manual'].includes(row.status) && !livePassedActionIds.has(row.actionId),
  );
  const liveProbeSummary = run.liveProbeReport?.summary || buildLiveProbeSummary([], 'not-run');
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
    capabilities: modelCapabilities,
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
  const href = pathToFileURL(
    folderPath.endsWith(path.sep) ? folderPath : `${folderPath}${path.sep}`,
  ).href;
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
  const match = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_devscrapewide_c-69ea4723/.exec(
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
      status: inventoryOnly
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
        const className = row.status === 'pass' ? 'ok' : row.status === 'fail' ? 'fail' : 'warn';
        return [
          '<tr>',
          `<td class="mono">${escapeHtml(row.targetId)}</td>`,
          `<td>${escapeHtml(row.kind)}</td>`,
          `<td class="mono">${escapeHtml(row.canonicalIdentifier || row.identifier)}</td>`,
          `<td class="mono">${escapeHtml((row.matchGroups || []).map((group) => `[${(group || []).join(' + ')}]`).join(' OR ') || '(none)')}</td>`,
          `<td><div class="mono">${escapeHtml((row.expectedUiStateRefs || []).join(', ') || '(not covered by current scrape family)')}</div><div class="muted mono">${escapeHtml((row.expectedFiles || []).join(', ') || '(no scrape file requirement)')}</div></td>`,
          `<td class="mono">${escapeHtml((row.matchedExpectedFiles || row.allMatchedFiles || []).join(', ') || '(none)')}</td>`,
          `<td class="${className}">${escapeHtml(
            row.status === 'no-scrape-coverage'
              ? 'NO SCRAPE COVERAGE'
              : String(row.status || '')
                  .replaceAll('-', ' ')
                  .toUpperCase(),
          )}<div class="muted">${escapeHtml(row.statusReason || '')}</div></td>`,
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
