export const DEV_SCRAPE_WIDE_FIXTURE_URL =
  'https://chatgpt.com/c/69ea4723-7070-83ea-a069-89aaa4e6f9a1';
export const DEV_SCRAPE_WIDE_REPORT_PATH = 'dev-scrape/report.html';
export const DEV_SCRAPE_WIDE_LAST_REPORT_KEY = 'devScrapeWideLastReport';
export const DEV_SCRAPE_WIDE_LAST_FOLDER_KEY = 'devScrapeWideLastFolder';
export const DEV_SCRAPE_WIDE_CAPTURE_ROOT_REQUIRED_ERROR =
  'No capture directory is configured yet.';

const HANDLE_DB_NAME = 'csp-dev-scrape';
const HANDLE_STORE_NAME = 'handles';
const HANDLE_KEY = 'inspectorCapturesRootHandle';
const CAPTURE_ROOT_DIR_NAME = 'inspector-captures';
const RUN_FOLDER_SUFFIX = 'devscrapewide_c-69ea4723';
const RUN_MANIFEST_NAME = 'run-manifest.json';
const DEFERRED_FILENAME = '1c_TopbarToBottomEnabled_ThreadBottom.txt';
const CONTENT_SOURCE_PATH = 'content.js';
const TURN_SELECTOR =
  'section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"], article[data-turn]';
const OPEN_MENU_SELECTOR = '[data-radix-menu-content][data-state="open"][role="menu"]';
const DEV_SCRAPE_MIN_STEP_DELAY_MS = 250;

const DUMP_REGISTRY = Object.freeze([
  {
    filename: '1a_SideBarCollapsed_body.txt',
    stateId: 'sidebar-collapsed-body',
    label: 'Sidebar collapsed body',
    steps: [{ type: 'set-sidebar-state', state: 'collapsed', label: 'collapse sidebar' }],
    capture: { type: 'body' },
  },
  {
    filename: '1b_SidebarExpaneded_body.txt',
    stateId: 'sidebar-expanded-body',
    label: 'Sidebar expanded body',
    steps: [{ type: 'set-sidebar-state', state: 'expanded', label: 'expand sidebar' }],
    capture: { type: 'body' },
  },
  {
    filename: '1d_TopbarToBottomDisabled_ThreadBottom.txt',
    stateId: 'topbar-bottom-disabled-thread-bottom',
    label: 'Thread bottom area',
    steps: [],
    capture: { type: 'thread-bottom' },
  },
  {
    filename: '1e_TopbarToBottomDisabled_HeaderArea.txt',
    stateId: 'topbar-bottom-disabled-header-area',
    label: 'Header area',
    steps: [],
    capture: { type: 'header-area' },
  },
  {
    filename: '1f_UserTurnWithButtonsExposedOnHover.txt',
    stateId: 'user-turn-buttons-exposed',
    label: 'User turn with buttons exposed',
    steps: [{ type: 'focus-turn', turnRef: 'user-first', label: 'hover first user turn' }],
    capture: { type: 'current-turn' },
  },
  {
    filename: '1g_AgentTurnWithButtons_MultipleThreads_2of2_DidntSearchWeb.txt',
    stateId: 'assistant-turn-non-web-buttons-exposed',
    label: 'Assistant turn without web search',
    steps: [
      {
        type: 'focus-turn',
        turnRef: 'assistant-first-no-web',
        label: 'hover first non-web assistant turn',
      },
    ],
    capture: { type: 'current-turn' },
  },
  {
    filename: '1h_AgentTurnWithButtons_SingleThread_SearchedTheWeb.txt',
    stateId: 'assistant-turn-web-buttons-exposed',
    label: 'Assistant turn with web search',
    steps: [
      {
        type: 'focus-turn',
        turnRef: 'assistant-first-web',
        label: 'hover first web assistant turn',
      },
    ],
    capture: { type: 'current-turn' },
  },
  {
    filename: '2a_AgentOrUserTurn_SubmenuMoreActions3Dots_ReadAloudBranchButtons.txt',
    stateId: 'assistant-menu-read-aloud-branch',
    label: 'Assistant message menu with Read Aloud and Branch',
    steps: [
      {
        type: 'focus-turn',
        turnRef: 'assistant-first-no-web',
        label: 'hover first non-web assistant turn',
      },
      {
        type: 'open-turn-menu',
        menuKind: 'more-actions',
        label: 'open assistant message actions menu',
      },
    ],
    capture: { type: 'latest-open-menu' },
  },
  {
    filename:
      '2b_AgentOrUserTurn_SubmenuRegenerate_AfterWebSearchResponse_RegenerateSubmenu - Copy.txt',
    stateId: 'assistant-web-regenerate-menu-copy',
    label: 'Legacy alias of web regenerate menu',
    aliasOf: '2c_AgentOrUserTurn_SubmenuRegenerate_AfterWebSearchResponse_RegenerateSubmenu.txt',
  },
  {
    filename: '2c_AgentOrUserTurn_SubmenuRegenerate_AfterWebSearchResponse_RegenerateSubmenu.txt',
    stateId: 'assistant-web-regenerate-menu',
    label: 'Assistant web-search response menu',
    steps: [
      {
        type: 'focus-turn',
        turnRef: 'assistant-first-web',
        label: 'hover first web assistant turn',
      },
      {
        type: 'open-turn-menu',
        menuKind: 'regenerate',
        label: 'open web assistant regenerate menu',
      },
    ],
    capture: { type: 'latest-open-menu' },
  },
  {
    filename: '2d_SubmenuForModelSwitcher_data-testid_model-switcher-dropdown-button.txt',
    stateId: 'model-switcher-menu',
    label: 'Model switcher menu',
    steps: [{ type: 'open-model-switcher-menu', label: 'open model switcher menu' }],
    capture: { type: 'latest-open-menu' },
  },
  {
    filename: '2e_ModelSwitcher_ConfigureDialog_CurrentSelection.txt',
    stateId: 'model-switcher-configure-dialog',
    label: 'Configure dialog from model switcher',
    steps: [{ type: 'open-configure-dialog', label: 'open configure dialog from model switcher' }],
    capture: { type: 'configure-dialog' },
  },
  {
    filename: '2f_ModelSwitcher_ConfigureDialog_ModelSelectionListbox.txt',
    stateId: 'model-switcher-configure-listbox',
    label: 'Configure dialog model selection listbox',
    steps: [
      { type: 'open-configure-dialog', label: 'open configure dialog from model switcher' },
      { type: 'open-configure-listbox', label: 'open configure model selection listbox' },
    ],
    capture: { type: 'configure-listbox' },
  },
  {
    filename: '2g_ModelSwitcher_ConfigureDialog_ConfigureLatest_FrontendRows.txt',
    stateId: 'model-switcher-configure-latest-dialog',
    label: 'Configure dialog frontend rows for Latest',
    steps: [
      { type: 'open-configure-dialog', label: 'open configure dialog from model switcher' },
      {
        type: 'select-configure-option',
        optionId: 'configure-latest',
        label: 'select Latest in configure dialog',
      },
    ],
    capture: { type: 'configure-dialog' },
  },
  {
    filename: '2h_ModelSwitcher_ConfigureDialog_Configure5-2_FrontendRows.txt',
    stateId: 'model-switcher-configure-5-2-dialog',
    label: 'Configure dialog frontend rows for 5.2',
    steps: [
      { type: 'open-configure-dialog', label: 'open configure dialog from model switcher' },
      {
        type: 'select-configure-option',
        optionId: 'configure-5-2',
        label: 'select 5.2 in configure dialog',
      },
    ],
    capture: { type: 'configure-dialog' },
  },
  {
    filename: '2i_ModelSwitcher_ConfigureDialog_Configure5-4_FrontendRows.txt',
    stateId: 'model-switcher-configure-5-4-dialog',
    label: 'Configure dialog frontend rows for 5.4',
    steps: [
      { type: 'open-configure-dialog', label: 'open configure dialog from model switcher' },
      {
        type: 'select-configure-option',
        optionId: 'configure-5-4',
        label: 'select 5.4 in configure dialog',
      },
    ],
    capture: { type: 'configure-dialog' },
  },
  {
    filename: '2j_ModelSwitcher_ConfigureDialog_ConfigureO3_FrontendRows.txt',
    stateId: 'model-switcher-configure-o3-dialog',
    label: 'Configure dialog frontend rows for o3',
    steps: [
      { type: 'open-configure-dialog', label: 'open configure dialog from model switcher' },
      {
        type: 'select-configure-option',
        optionId: 'configure-o3',
        label: 'select o3 in configure dialog',
      },
    ],
    capture: { type: 'configure-dialog' },
  },
  {
    filename: '2k_Composer_AddFilesAndMore_Menu.txt',
    stateId: 'composer-add-files-and-more-menu',
    label: 'Composer Add files and more menu',
    steps: [{ type: 'open-composer-plus-menu', label: 'open composer Add files and more menu' }],
    capture: { type: 'latest-open-menu' },
  },
  {
    filename: '2l_Composer_AddFilesAndMore_More_Submenu.txt',
    stateId: 'composer-add-files-and-more-more-submenu',
    label: 'Composer Add files and more More submenu',
    steps: [
      { type: 'open-composer-plus-menu', label: 'open composer Add files and more menu' },
      { type: 'open-composer-more-submenu', label: 'open composer More submenu' },
    ],
    capture: { type: 'latest-open-menu' },
  },
  {
    filename: '2m_Header_ConversationOptions_Menu.txt',
    stateId: 'header-conversation-options-menu',
    label: 'Header conversation options menu',
    steps: [
      {
        type: 'open-conversation-options-menu',
        label: 'open header conversation options menu',
      },
    ],
    capture: { type: 'latest-open-menu' },
  },
]);

const DEFERRED_ARTIFACTS = Object.freeze([
  {
    filename: DEFERRED_FILENAME,
    stateId: 'topbar-bottom-enabled-thread-bottom',
    label: 'Deferred topbar-to-bottom thread-bottom capture',
    status: 'deferred',
  },
]);

const PLAYWRIGHT_CHECK_REQUIRED_ERROR =
  'The in-extension Check-Scrape path is retired. Run `node tests/playwright/devscrape-wide.mjs --action validate-wide` so shortcut metadata, target match groups, and report generation use the deterministic Playwright validator.';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtmlText(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeHtmlAttribute(value) {
  return escapeHtmlText(value).replaceAll('"', '&quot;');
}

function isVisible(element) {
  if (!(element instanceof Element) || !element.isConnected) return false;
  const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
  if (!style) return false;
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
    return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function smartClick(element, windowObj) {
  if (!(element instanceof Element)) return false;
  const init = { bubbles: true, cancelable: true, view: windowObj };
  const ctorList = [
    ['pointerdown', windowObj.PointerEvent || windowObj.MouseEvent],
    ['mousedown', windowObj.MouseEvent],
    ['pointerup', windowObj.PointerEvent || windowObj.MouseEvent],
    ['mouseup', windowObj.MouseEvent],
    ['click', windowObj.MouseEvent],
  ];
  ctorList.forEach(([type, Ctor]) => {
    try {
      element.dispatchEvent(new Ctor(type, init));
    } catch {}
  });
  try {
    element.click();
    return true;
  } catch {
    return false;
  }
}

function dispatchHover(element, windowObj) {
  if (!(element instanceof Element)) return false;
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + Math.max(1, Math.min(rect.width - 1, rect.width / 2 || 1));
  const clientY = rect.top + Math.max(1, Math.min(rect.height - 1, rect.height / 2 || 1));
  const init = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    view: windowObj,
  };
  const ctor = windowObj.PointerEvent || windowObj.MouseEvent;
  ['pointerover', 'mouseover', 'mouseenter', 'pointermove', 'mousemove'].forEach((type) => {
    try {
      element.dispatchEvent(new ctor(type, init));
    } catch {}
  });
  return true;
}

function describeError(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string' && error.message) return error.message;
  return String(error);
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

async function waitForCondition(getter, { timeout = 2000, interval = 50 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const value = getter();
    if (value) return value;
    await sleep(interval);
  }
  return null;
}

function getTurnElements(documentObj) {
  return Array.from(documentObj.querySelectorAll(TURN_SELECTOR)).filter(
    (element) => element instanceof Element,
  );
}

function hasWebCitation(turn) {
  return !!turn?.querySelector?.('[data-testid="webpage-citation-pill"]');
}

function isAssistantTurn(turn) {
  return (
    turn?.getAttribute?.('data-turn') === 'assistant' ||
    !!turn?.querySelector?.('[data-message-author-role="assistant"]')
  );
}

function isUserTurn(turn) {
  return (
    turn?.getAttribute?.('data-turn') === 'user' ||
    !!turn?.querySelector?.('[data-message-author-role="user"]')
  );
}

function findTurnByRef(documentObj, turnRef) {
  const turns = getTurnElements(documentObj);
  if (turnRef === 'user-first') {
    return turns.find((turn) => isUserTurn(turn)) || null;
  }
  if (turnRef === 'assistant-first-no-web') {
    return turns.find((turn) => isAssistantTurn(turn) && !hasWebCitation(turn)) || null;
  }
  if (turnRef === 'assistant-first-web') {
    return turns.find((turn) => isAssistantTurn(turn) && hasWebCitation(turn)) || null;
  }
  return null;
}

function getOpenMenuWrappers(documentObj) {
  return Array.from(documentObj.querySelectorAll(OPEN_MENU_SELECTOR))
    .map((menu) => menu.closest('[data-radix-popper-content-wrapper]') || menu)
    .filter((element) => element instanceof Element && element.isConnected);
}

async function closeOpenMenus(documentObj, windowObj) {
  const dispatchEscape = () => {
    const target = documentObj.activeElement || documentObj.body || documentObj.documentElement;
    ['keydown', 'keyup'].forEach((type) => {
      try {
        target.dispatchEvent(
          new windowObj.KeyboardEvent(type, {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
            cancelable: true,
          }),
        );
      } catch {}
    });
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!getOpenMenuWrappers(documentObj).length) return;
    dispatchEscape();
    await sleep(DEV_SCRAPE_MIN_STEP_DELAY_MS);
  }
}

function serializeNodePretty(node, depth = 0) {
  const indent = '  '.repeat(depth);
  if (node.nodeType === node.TEXT_NODE) {
    const text = String(node.textContent || '')
      .replaceAll('\r', '')
      .trim();
    return text ? `${indent}${escapeHtmlText(text)}` : '';
  }
  if (node.nodeType === node.COMMENT_NODE) {
    return `${indent}<!--${node.textContent || ''}-->`;
  }
  if (node.nodeType !== node.ELEMENT_NODE) return '';
  const tagName = node.tagName.toLowerCase();
  const attrs = Array.from(node.attributes)
    .map((attribute) => ` ${attribute.name}="${escapeHtmlAttribute(attribute.value)}"`)
    .join('');
  const children = Array.from(node.childNodes)
    .map((child) => serializeNodePretty(child, depth + 1))
    .filter(Boolean);
  if (!children.length) {
    return `${indent}<${tagName}${attrs}></${tagName}>`;
  }
  return `${indent}<${tagName}${attrs}>\n${children.join('\n')}\n${indent}</${tagName}>`;
}

function normalizeHtmlForDump(windowObj, html) {
  const documentObj = windowObj.document;
  const htmlDoc = documentObj.implementation.createHTMLDocument('csp-dev-scrape');
  const container = htmlDoc.createElement('div');
  container.innerHTML = String(html || '').trim();
  return Array.from(container.childNodes)
    .map((node) => serializeNodePretty(node, 0))
    .filter(Boolean)
    .join('\n');
}

function findThreadBottomElement(documentObj) {
  return (
    documentObj.getElementById('thread-bottom') ||
    documentObj.getElementById('thread-bottom-container') ||
    null
  );
}

function findHeaderAreaElement(documentObj) {
  const header = documentObj.getElementById('page-header');
  if (!header) return null;
  return header.closest('[data-scroll-root]') || header.parentElement || header;
}

function getTurnActionGroup(turn) {
  if (!(turn instanceof Element)) return null;
  const candidates = Array.from(
    turn.querySelectorAll(
      '[role="group"], [aria-label="Response actions"], [aria-label="Your message actions"]',
    ),
  ).filter(
    (element) =>
      element instanceof Element && isVisible(element) && element.querySelector('button'),
  );
  return candidates[0] || null;
}

function getTurnHoverTarget(turn) {
  if (!(turn instanceof Element)) return null;
  return (
    turn.querySelector('.group\\/turn-messages') ||
    turn.querySelector('[data-message-author-role]') ||
    turn
  );
}

function getTurnHoverTargets(turn) {
  if (!(turn instanceof Element)) return [];
  return [
    turn.querySelector('.group\\/turn-messages'),
    turn.querySelector('[data-message-author-role]'),
    turn,
  ].filter((element, index, list) => element instanceof Element && list.indexOf(element) === index);
}

function getTurnMenuTriggerCandidates(turn) {
  const group = getTurnActionGroup(turn);
  if (!(group instanceof Element)) return [];
  const buttons = Array.from(group.querySelectorAll('button')).filter((button) =>
    isVisible(button),
  );
  const prioritized = [
    ...buttons.filter((button) => button.getAttribute('aria-label') === 'More actions'),
    ...buttons.filter(
      (button) =>
        button.getAttribute('aria-haspopup') === 'menu' &&
        button.getAttribute('aria-label') !== 'Switch model',
    ),
    ...buttons.filter((button) => button.getAttribute('aria-haspopup') === 'menu'),
    ...buttons.filter(
      (button) =>
        ![
          'copy-turn-action-button',
          'good-response-turn-action-button',
          'bad-response-turn-action-button',
        ].includes(button.getAttribute('data-testid') || ''),
    ),
  ];
  return prioritized.filter(
    (button, index, list) => button instanceof Element && list.indexOf(button) === index,
  );
}

function describeTurnActionButtons(turn) {
  const group = getTurnActionGroup(turn);
  const scope = group instanceof Element ? group : turn;
  const buttons = Array.from(scope.querySelectorAll('button,[role="button"]'))
    .slice(0, 12)
    .map((button) => {
      const parts = [
        button.tagName.toLowerCase(),
        button.getAttribute('aria-label') ? `aria-label=${button.getAttribute('aria-label')}` : '',
        button.getAttribute('data-testid')
          ? `data-testid=${button.getAttribute('data-testid')}`
          : '',
        button.getAttribute('aria-haspopup')
          ? `aria-haspopup=${button.getAttribute('aria-haspopup')}`
          : '',
      ].filter(Boolean);
      return parts.join(' ');
    })
    .filter(Boolean);
  return buttons.length ? buttons.join(' | ') : 'no button candidates found';
}

async function revealTurnActions(turn, windowObj) {
  const hoverTargets = getTurnHoverTargets(turn);
  for (const target of hoverTargets) {
    try {
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
    } catch {}
    dispatchHover(target, windowObj);
    try {
      target.focus?.();
    } catch {}
    try {
      if (target !== turn) smartClick(target, windowObj);
    } catch {}
    await sleep(DEV_SCRAPE_MIN_STEP_DELAY_MS);
    const group = getTurnActionGroup(turn);
    if (group instanceof Element) return group;
  }
  return null;
}

async function ensureSidebarState(documentObj, windowObj, state) {
  const closeButton = documentObj.querySelector('button[data-testid="close-sidebar-button"]');
  const openButton =
    documentObj.querySelector('button[data-testid="open-sidebar-button"]') ||
    documentObj.querySelector(
      '#stage-sidebar-tiny-bar button[aria-controls="stage-slideover-sidebar"]',
    );
  if (state === 'collapsed') {
    if (closeButton && isVisible(closeButton)) {
      smartClick(closeButton, windowObj);
      await sleep(250);
    }
    return;
  }
  if (state === 'expanded') {
    if (closeButton && isVisible(closeButton)) return;
    if (!openButton || !isVisible(openButton)) {
      throw new Error('Could not find a visible sidebar open control');
    }
    smartClick(openButton, windowObj);
    await sleep(300);
  }
}

async function focusTurn(documentObj, windowObj, turnRef, runtime) {
  const turn = findTurnByRef(documentObj, turnRef);
  if (!(turn instanceof Element)) {
    throw new Error(`Could not find turn for ${turnRef}`);
  }
  const hoverTarget = getTurnHoverTarget(turn);
  try {
    (hoverTarget || turn).scrollIntoView({ block: 'center', inline: 'nearest' });
  } catch {}
  dispatchHover(hoverTarget || turn, windowObj);
  try {
    hoverTarget?.focus?.();
  } catch {}
  if (hoverTarget && hoverTarget !== turn) {
    try {
      smartClick(hoverTarget, windowObj);
    } catch {}
  }
  await sleep(DEV_SCRAPE_MIN_STEP_DELAY_MS);
  await revealTurnActions(turn, windowObj);
  runtime.currentTurn = turn;
  return turn;
}

async function openTurnMenu(documentObj, windowObj, runtime) {
  const turn = runtime.currentTurn;
  if (!(turn instanceof Element)) throw new Error('No current turn is selected');
  await closeOpenMenus(documentObj, windowObj);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await revealTurnActions(turn, windowObj);
    const triggers = getTurnMenuTriggerCandidates(turn);
    for (const trigger of triggers) {
      smartClick(trigger, windowObj);
      await sleep(DEV_SCRAPE_MIN_STEP_DELAY_MS);
      const menu = await waitForCondition(
        () => getOpenMenuWrappers(documentObj).slice(-1)[0] || null,
        {
          timeout: 1000,
          interval: 50,
        },
      );
      if (menu instanceof Element) {
        runtime.latestMenu = menu;
        return menu;
      }
    }
  }
  throw new Error(
    `Could not find or open a visible turn menu trigger. Available controls: ${describeTurnActionButtons(turn)}`,
  );
}

async function openModelSwitcherMenu(documentObj, windowObj, runtime) {
  await closeOpenMenus(documentObj, windowObj);
  const button = documentObj.querySelector('button[data-testid="model-switcher-dropdown-button"]');
  if (!(button instanceof Element) || !isVisible(button)) {
    throw new Error('Could not find a visible model switcher button');
  }
  smartClick(button, windowObj);
  const menu = await waitForCondition(
    () =>
      getOpenMenuWrappers(documentObj).find((candidate) =>
        candidate.querySelector?.('[data-testid^="model-switcher-"]'),
      ) || null,
    {
      timeout: 2000,
      interval: 50,
    },
  );
  if (!(menu instanceof Element)) {
    throw new Error('Model switcher menu did not open');
  }
  runtime.latestMenu = menu;
  return menu;
}

async function executeStep(documentObj, windowObj, runtime, step) {
  if (step.type === 'set-sidebar-state') {
    await ensureSidebarState(documentObj, windowObj, step.state);
    return;
  }
  if (step.type === 'focus-turn') {
    await focusTurn(documentObj, windowObj, step.turnRef, runtime);
    return;
  }
  if (step.type === 'open-turn-menu') {
    await openTurnMenu(documentObj, windowObj, runtime);
    return;
  }
  if (step.type === 'open-model-switcher-menu') {
    await openModelSwitcherMenu(documentObj, windowObj, runtime);
    return;
  }
  throw new Error(`Unsupported scrape step: ${step.type}`);
}

function captureArtifactHtml(documentObj, runtime, capture) {
  if (capture.type === 'body') {
    return documentObj.body?.outerHTML || '';
  }
  if (capture.type === 'thread-bottom') {
    return findThreadBottomElement(documentObj)?.outerHTML || '';
  }
  if (capture.type === 'header-area') {
    return findHeaderAreaElement(documentObj)?.outerHTML || '';
  }
  if (capture.type === 'current-turn') {
    return runtime.currentTurn?.outerHTML || '';
  }
  if (capture.type === 'latest-open-menu') {
    const menu = runtime.latestMenu || getOpenMenuWrappers(documentObj).slice(-1)[0] || null;
    return menu?.outerHTML || '';
  }
  return '';
}

function makeArtifactRecord(definition, override = {}) {
  return {
    filename: definition.filename,
    stateId: definition.stateId,
    label: definition.label,
    ...override,
  };
}

function getLocalTimestampParts(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return {
    year: date.getFullYear(),
    month: pad(date.getMonth() + 1),
    day: pad(date.getDate()),
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
    second: pad(date.getSeconds()),
  };
}

function buildRunFolderName(date = new Date()) {
  const parts = getLocalTimestampParts(date);
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}_${RUN_FOLDER_SUFFIX}`;
}

async function getUniqueRunDirectoryHandle(rootHandle, preferredName) {
  let candidateName = preferredName;
  let suffix = 0;
  for (;;) {
    try {
      await rootHandle.getDirectoryHandle(candidateName);
      suffix += 1;
      candidateName = `${preferredName}_${String(suffix).padStart(2, '0')}`;
    } catch {
      return rootHandle.getDirectoryHandle(candidateName, { create: true });
    }
  }
}

async function openHandleDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        request.result.createObjectStore(HANDLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open IndexedDB'));
  });
}

async function idbGet(key) {
  const db = await openHandleDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HANDLE_STORE_NAME, 'readonly');
    const request = transaction.objectStore(HANDLE_STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Could not read IndexedDB value'));
  });
}

async function idbSet(key, value) {
  const db = await openHandleDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HANDLE_STORE_NAME, 'readwrite');
    const request = transaction.objectStore(HANDLE_STORE_NAME).put(value, key);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error || new Error('Could not write IndexedDB value'));
  });
}

async function getStoredLastRunFolderInfo() {
  const stored = await chrome.storage.local.get(DEV_SCRAPE_WIDE_LAST_FOLDER_KEY);
  const value = stored?.[DEV_SCRAPE_WIDE_LAST_FOLDER_KEY];
  if (!value || typeof value !== 'object') return null;
  const folderName = String(value.folderName || '').trim();
  if (!folderName) return null;
  return {
    folderName,
    completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
  };
}

async function setStoredLastRunFolderInfo({ folderName, completedAt = null }) {
  const normalizedFolderName = String(folderName || '').trim();
  if (!normalizedFolderName) return;
  await chrome.storage.local.set({
    [DEV_SCRAPE_WIDE_LAST_FOLDER_KEY]: {
      folderName: normalizedFolderName,
      completedAt: typeof completedAt === 'string' ? completedAt : null,
    },
  });
}

async function clearStoredLastRunFolderInfo() {
  await chrome.storage.local.remove(DEV_SCRAPE_WIDE_LAST_FOLDER_KEY);
}

async function ensureDirectoryPermission(handle, { interactive = false } = {}) {
  if (!handle || handle.kind !== 'directory') return null;
  const options = { mode: 'readwrite' };
  if ((await handle.queryPermission?.(options)) === 'granted') return handle;
  if (interactive && (await handle.requestPermission?.(options)) === 'granted') return handle;
  return null;
}

export async function clearStoredCaptureRootHandle() {
  await idbSet(HANDLE_KEY, null);
  await clearStoredLastRunFolderInfo();
}

export async function ensureCaptureRootHandle(
  windowObj,
  { interactive = false, forcePick = false } = {},
) {
  let handle = null;
  if (!forcePick) {
    handle = await ensureDirectoryPermission(await idbGet(HANDLE_KEY), { interactive });
  }
  if (!handle && interactive) {
    if (typeof windowObj?.showDirectoryPicker !== 'function') {
      throw new Error('Directory picker is unavailable in this extension page');
    }
    handle = await windowObj.showDirectoryPicker({ mode: 'readwrite' });
    handle = await ensureDirectoryPermission(handle, { interactive: true });
    if (!handle) {
      throw new Error('Write permission was not granted for the capture directory');
    }
    await idbSet(HANDLE_KEY, handle);
  }
  if (!handle) {
    throw new Error(
      `${DEV_SCRAPE_WIDE_CAPTURE_ROOT_REQUIRED_ERROR} Click Set Path first and choose the ${CAPTURE_ROOT_DIR_NAME} folder.`,
    );
  }
  return handle;
}

export async function configureCaptureRootHandle(windowObj) {
  const handle = await ensureCaptureRootHandle(windowObj, { interactive: true, forcePick: true });
  await clearStoredLastRunFolderInfo();
  return handle;
}

export function isCaptureRootRequiredError(error) {
  return String(error?.message || '').startsWith(DEV_SCRAPE_WIDE_CAPTURE_ROOT_REQUIRED_ERROR);
}

async function writeTextFile(directoryHandle, fileName, text) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function readTextFile(directoryHandle, fileName) {
  const fileHandle = await directoryHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.text();
}

async function listDirectoryEntries(directoryHandle) {
  const entries = [];
  for await (const [name, handle] of directoryHandle.entries()) {
    entries.push({ name, handle });
  }
  return entries;
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

async function getNamedRunDirectoryHandle(rootHandle, folderName) {
  const normalizedFolderName = String(folderName || '').trim();
  if (!normalizedFolderName) return null;
  try {
    const handle = await rootHandle.getDirectoryHandle(normalizedFolderName);
    return { name: normalizedFolderName, handle };
  } catch {
    return null;
  }
}

async function getLatestRunDirectoryHandle(rootHandle) {
  const directories = await Promise.all(
    (await listDirectoryEntries(rootHandle))
      .filter((entry) => entry.handle?.kind === 'directory')
      .map(async (entry) => {
        const folderSortKey = parseRunFolderSortKey(entry.name);
        if (folderSortKey) return { ...entry, sortKey: folderSortKey };
        try {
          const manifestText = await readTextFile(entry.handle, RUN_MANIFEST_NAME);
          return {
            ...entry,
            sortKey: parseManifestSortKey(JSON.parse(manifestText)),
          };
        } catch {
          return null;
        }
      }),
  );
  const sortableDirectories = directories.filter((entry) => entry?.sortKey);
  sortableDirectories.sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  return sortableDirectories[sortableDirectories.length - 1] || null;
}

async function getPreferredRunDirectoryHandle(rootHandle) {
  const storedFolderInfo = await getStoredLastRunFolderInfo();
  const storedRunDirectory = await getNamedRunDirectoryHandle(
    rootHandle,
    storedFolderInfo?.folderName,
  );
  if (storedRunDirectory) return storedRunDirectory;
  return getLatestRunDirectoryHandle(rootHandle);
}

async function storeLastRunAfterPersist(runDirectoryName, completedAt) {
  await setStoredLastRunFolderInfo({
    folderName: runDirectoryName,
    completedAt: completedAt || new Date().toISOString(),
  });
}

async function fetchPackagedText(relativePath) {
  const response = await fetch(chrome.runtime.getURL(relativePath), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not read packaged file: ${relativePath}`);
  }
  return response.text();
}

export function getWideScrapePageInfo({ windowObj, documentObj }) {
  const turns = getTurnElements(documentObj);
  return {
    url: windowObj.location.href,
    title: documentObj.title || '',
    fixtureUrl: DEV_SCRAPE_WIDE_FIXTURE_URL,
    fixtureOk: windowObj.location.href === DEV_SCRAPE_WIDE_FIXTURE_URL,
    turnCount: turns.length,
    assistantTurnCount: turns.filter((turn) => isAssistantTurn(turn)).length,
    userTurnCount: turns.filter((turn) => isUserTurn(turn)).length,
    hasWebSearchTurn: turns.some((turn) => isAssistantTurn(turn) && hasWebCitation(turn)),
  };
}

export async function runWideScrapeInPage({ windowObj, documentObj }) {
  const pageInfo = getWideScrapePageInfo({ windowObj, documentObj });
  if (!pageInfo.fixtureOk) {
    return {
      ok: false,
      error: `Active tab does not match the required fixture.\n\nExpected:\n${DEV_SCRAPE_WIDE_FIXTURE_URL}\n\nActual:\n${pageInfo.url || '(unknown)'}`,
      runKind: 'devscrapewide',
      fixtureUrl: DEV_SCRAPE_WIDE_FIXTURE_URL,
      pageInfo,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      artifacts: [],
      capturedCount: 0,
      failedCount: 0,
      deferredCount: DEFERRED_ARTIFACTS.length,
    };
  }
  const startedAt = new Date().toISOString();
  const runtime = {
    currentTurn: null,
    latestMenu: null,
  };
  const artifacts = [];
  const capturedByFileName = new Map();

  for (const definition of DUMP_REGISTRY) {
    if (definition.aliasOf) continue;
    try {
      await closeOpenMenus(documentObj, windowObj);
      runtime.latestMenu = null;
      const steps = Array.isArray(definition.steps) ? definition.steps : [];
      if (steps.length > 5) {
        throw new Error(`Artifact ${definition.filename} exceeds the 5-step limit`);
      }
      for (const step of steps) {
        await executeStep(documentObj, windowObj, runtime, step);
        await sleep(DEV_SCRAPE_MIN_STEP_DELAY_MS);
      }
      const html = captureArtifactHtml(documentObj, runtime, definition.capture);
      if (!html) {
        throw new Error(`No HTML was captured for ${definition.filename}`);
      }
      const artifact = makeArtifactRecord(definition, {
        status: 'captured',
        rawHtml: html,
        captureBytes: html.length,
        clickPath: steps.map((step) => step.label),
      });
      artifacts.push(artifact);
      capturedByFileName.set(definition.filename, artifact);
    } catch (error) {
      artifacts.push(
        makeArtifactRecord(definition, {
          status: 'failed',
          error: describeError(error),
          clickPath: Array.isArray(definition.steps)
            ? definition.steps.map((step) => step.label)
            : [],
        }),
      );
    }
  }

  DUMP_REGISTRY.filter((definition) => definition.aliasOf).forEach((definition) => {
    const sourceArtifact = capturedByFileName.get(definition.aliasOf);
    if (!sourceArtifact || sourceArtifact.status !== 'captured') {
      artifacts.push(
        makeArtifactRecord(definition, {
          status: 'failed',
          error: `Alias source ${definition.aliasOf} was not captured`,
          aliasOf: definition.aliasOf,
          clickPath: [],
        }),
      );
      return;
    }
    artifacts.push(
      makeArtifactRecord(definition, {
        status: 'alias',
        aliasOf: definition.aliasOf,
        rawHtml: sourceArtifact.rawHtml,
        captureBytes: sourceArtifact.captureBytes,
        clickPath: sourceArtifact.clickPath,
      }),
    );
  });

  DEFERRED_ARTIFACTS.forEach((artifact) => {
    artifacts.push({
      ...artifact,
      clickPath: [],
    });
  });

  await closeOpenMenus(documentObj, windowObj);

  const completedAt = new Date().toISOString();
  const failedArtifacts = artifacts.filter((artifact) => artifact.status === 'failed');
  const capturedArtifacts = artifacts.filter(
    (artifact) => artifact.status === 'captured' || artifact.status === 'alias',
  );

  return {
    ok: failedArtifacts.length === 0,
    runKind: 'devscrapewide',
    fixtureUrl: DEV_SCRAPE_WIDE_FIXTURE_URL,
    pageInfo,
    startedAt,
    completedAt,
    artifacts,
    capturedCount: capturedArtifacts.length,
    failedCount: failedArtifacts.length,
    deferredCount: DEFERRED_ARTIFACTS.length,
  };
}

export async function persistWideScrapeRun({ windowObj, rootHandle, scrapeResult }) {
  if (!scrapeResult || !Array.isArray(scrapeResult.artifacts)) {
    throw new Error('Scrape result is missing artifacts');
  }
  const runDirectory = await getUniqueRunDirectoryHandle(rootHandle, buildRunFolderName());
  const writtenFiles = [];

  for (const artifact of scrapeResult.artifacts) {
    if (artifact.status !== 'captured' && artifact.status !== 'alias') continue;
    const normalized = normalizeHtmlForDump(windowObj, artifact.rawHtml);
    await writeTextFile(runDirectory, artifact.filename, normalized);
    writtenFiles.push(artifact.filename);
  }

  const manifest = {
    schemaVersion: 1,
    runKind: 'devscrapewide',
    folderName: runDirectory.name,
    fixtureUrl: scrapeResult.fixtureUrl || DEV_SCRAPE_WIDE_FIXTURE_URL,
    pageInfo: scrapeResult.pageInfo || null,
    startedAt: scrapeResult.startedAt || new Date().toISOString(),
    completedAt: scrapeResult.completedAt || new Date().toISOString(),
    writtenFiles,
    deferredFiles: DEFERRED_ARTIFACTS.map((artifact) => artifact.filename),
    artifacts: scrapeResult.artifacts.map((artifact) => {
      const artifactForManifest = { ...artifact };
      delete artifactForManifest.rawHtml;
      return artifactForManifest;
    }),
  };
  await writeTextFile(runDirectory, RUN_MANIFEST_NAME, `${JSON.stringify(manifest, null, 2)}\n`);
  await storeLastRunAfterPersist(runDirectory.name, manifest.completedAt);

  return {
    folderName: runDirectory.name,
    manifest,
    writtenFiles,
    capturedCount: manifest.artifacts.filter(
      (artifact) => artifact.status === 'captured' || artifact.status === 'alias',
    ).length,
    failedCount: manifest.artifacts.filter((artifact) => artifact.status === 'failed').length,
    deferredCount: manifest.deferredFiles.length,
  };
}

async function loadRunFromDirectory(directoryHandle) {
  const manifestText = await readTextFile(directoryHandle, RUN_MANIFEST_NAME);
  const manifest = JSON.parse(manifestText);
  const textEntries = (await listDirectoryEntries(directoryHandle)).filter(
    (entry) => entry.handle?.kind === 'file' && entry.name.toLowerCase().endsWith('.txt'),
  );
  const files = {};
  for (const entry of textEntries) {
    files[entry.name] = await readTextFile(directoryHandle, entry.name);
  }
  return { manifest, files };
}

export async function runWideScrapeCheck() {
  throw new Error(PLAYWRIGHT_CHECK_REQUIRED_ERROR);
}

export function getReportPageUrl() {
  return chrome.runtime.getURL(DEV_SCRAPE_WIDE_REPORT_PATH);
}

export function summarizeScrapeWriteResult(writeResult) {
  const parts = [`Saved ${writeResult.capturedCount} dumps to ${writeResult.folderName}.`];
  if (writeResult.failedCount) {
    parts.push(
      `${writeResult.failedCount} dump(s) failed; check run-manifest.json before trusting the scrape.`,
    );
  }
  if (writeResult.deferredCount) {
    parts.push(`${writeResult.deferredCount} dump remains deferred.`);
  }
  return parts.join(' ');
}

export function summarizeCheckResult(report) {
  const shortcutSummary = report?.summary?.shortcuts;
  const targetSummary = report?.summary?.targets;
  const liveProbeSummary = report?.summary?.liveProbes;
  if (shortcutSummary && targetSummary) {
    const parts = [
      `Checked ${shortcutSummary.total} shortcuts and ${targetSummary.total} targets in ${report.folderName}.`,
      `${shortcutSummary.passed} shortcuts passed, ${shortcutSummary.failed} failed, ${shortcutSummary.partial || 0} partial, ${shortcutSummary.manual || 0} manual-only, ${shortcutSummary.notApplicable || 0} not applicable.`,
    ];
    if (liveProbeSummary && liveProbeSummary.runStatus !== 'not-run') {
      parts.push(
        `Live probes: ${liveProbeSummary.passed || 0} passed, ${liveProbeSummary.failed || 0} failed, ${liveProbeSummary.environmentFailed || 0} environment failed.`,
      );
    }
    if (report.missingArtifacts.length) {
      parts.push(`${report.missingArtifacts.length} dump(s) were missing or failed to capture.`);
    }
    return parts.join(' ');
  }
  const parts = [
    `Checked ${report.summary.total} identifiers in ${report.folderName}.`,
    `${report.summary.passed} passed, ${report.summary.failed} failed.`,
  ];
  if (report.missingArtifacts.length) {
    parts.push(`${report.missingArtifacts.length} dump(s) were missing or failed to capture.`);
  }
  return parts.join(' ');
}

export { isAbortError };
