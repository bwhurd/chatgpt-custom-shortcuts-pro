import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildShortcutValidationInventory,
  parseSettingsSchemaSource,
} from './shortcut-target-inventory.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const devScrapeWidePath = path.join(repoRoot, 'extension', 'lib', 'DevScrapeWide.js');
const contentSourcePath = path.join(repoRoot, 'extension', 'content.js');
const settingsSchemaPath = path.join(repoRoot, 'extension', 'settings-schema.js');
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
  'runWideScrapeInPage',
  'normalizeHtmlForDump',
];
const LIVE_PROBE_REPORT_FILENAME = 'live-probes.json';
const EXECUTABLE_LIVE_PROBE_MODES = Object.freeze([
  'click-target',
  'focus-target',
  'opens-target',
  'direct-menu-target',
]);
const MIN_BROWSER_REQUEST_SPACING_MS = 2500;
const MIN_BROWSER_INTERACTION_SPACING_MS = 350;
const MIN_EXTENSION_PAGE_SPACING_MS = 1000;

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
  await page.evaluate(
    ({ source, exportNames }) => {
      const factory = new Function(`
${source}
return {
${exportNames.map((name) => `  ${name},`).join('\n')}
};
`);
      window.__CGCSP_DEVSCRAPE_WIDE__ = factory();
    },
    {
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

export async function waitForFixtureConversationReady(page, timeout = 20000) {
  await page.waitForFunction(
    () => {
      const turnCount = document.querySelectorAll(
        'section[data-testid^="conversation-turn-"][data-turn]',
      ).length;
      const assistantTurnCount = document.querySelectorAll(
        'section[data-testid^="conversation-turn-"][data-turn="assistant"]',
      ).length;
      const userTurnCount = document.querySelectorAll(
        'section[data-testid^="conversation-turn-"][data-turn="user"]',
      ).length;
      const hasThread = !!document.getElementById('thread');
      return (
        window.location.href ===
          'https://chatgpt.com/c/69ea4723-7070-83ea-a069-89aaa4e6f9a1' &&
        hasThread &&
        turnCount >= 4 &&
        assistantTurnCount >= 2 &&
        userTurnCount >= 2
      );
    },
    undefined,
    { timeout },
  );
}

export async function evaluateWideScrapePageInfo(page) {
  return page.evaluate(() => {
    const turns = Array.from(
      document.querySelectorAll('section[data-testid^="conversation-turn-"][data-turn]'),
    );
    return {
      url: window.location.href,
      title: document.title,
      fixtureUrl: 'https://chatgpt.com/c/69ea4723-7070-83ea-a069-89aaa4e6f9a1',
      fixtureOk:
        window.location.href ===
        'https://chatgpt.com/c/69ea4723-7070-83ea-a069-89aaa4e6f9a1',
      turnCount: turns.length,
      assistantTurnCount: turns.filter((turn) => turn.getAttribute('data-turn') === 'assistant')
        .length,
      userTurnCount: turns.filter((turn) => turn.getAttribute('data-turn') === 'user').length,
      hasWebSearchTurn: turns.some((turn) =>
        turn.querySelector('[data-testid="webpage-citation-pill"]'),
      ),
    };
  });
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

async function configureMoveTopBarToBottomSetting(context, enabled, options = {}) {
  const extensionId = await getExtensionId(context, options);
  await waitAroundExtensionPageAction();
  const page = await context.newPage();
  try {
    await waitAroundExtensionPageAction();
    await page.goto(`chrome-extension://${extensionId}/popup.html?playwrightSetup=1`, {
      waitUntil: 'domcontentloaded',
    });
    await waitAroundExtensionPageAction();
    await page.evaluate(
      async (value) =>
        await new Promise((resolve, reject) => {
          chrome.storage.sync.set({ moveTopBarToBottomCheckbox: value }, () => {
            const err = chrome.runtime.lastError;
            if (err) {
              reject(new Error(err.message));
              return;
            }
            chrome.storage.sync.get(
              { moveTopBarToBottomCheckbox: false },
              (items) => resolve(items.moveTopBarToBottomCheckbox),
            );
          });
        }),
      enabled,
    );
    await waitAroundExtensionPageAction();
  } finally {
    await waitAroundExtensionPageAction();
    await page.close().catch(() => {});
    await waitAroundExtensionPageAction();
  }
}

async function resetFixturePage(page, fixtureUrl) {
  if (page.url() !== fixtureUrl) {
    await waitBeforeBrowserRequest();
    await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
  } else {
    await waitBeforeBrowserRequest();
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await waitForFixtureConversationReady(page, 30000);
  await page.waitForTimeout(500);
}

async function closeOpenMenus(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const menuCount = await page.locator('[data-radix-menu-content][data-state="open"][role="menu"]').count();
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
}

async function setSidebarState(page, state) {
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
    Array.from(document.querySelectorAll('section[data-testid^="conversation-turn-"][data-turn]')).map(
      (turn) => ({
        testId: turn.getAttribute('data-testid') || '',
        turnRef: turn.getAttribute('data-turn') || '',
        hasWeb: !!turn.querySelector('[data-testid="webpage-citation-pill"]'),
      }),
    ),
  );
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
  const selectors = [
    `section[data-testid="${turnTestId}"]`,
    `section[data-testid="${turnTestId}"] .group\\/turn-messages`,
    `section[data-testid="${turnTestId}"] [data-message-author-role]`,
    `section[data-testid="${turnTestId}"]`,
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
  const locator = page.locator(`section[data-testid="${turnTestId}"]`).first();
  if (!((await locator.count()) > 0)) return '';
  return (await locator.evaluate((node) => node.outerHTML).catch(() => '')) || '';
}

async function describeVisibleControls(page, turnTestId) {
  return page.evaluate((testId) => {
    const turn = document.querySelector(`section[data-testid="${testId}"]`);
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
  }, turnTestId);
}

function getTurnMenuProbeConfig(menuKind = 'more-actions') {
  if (menuKind === 'regenerate') {
    return {
      triggerSelectors: [
        'button[aria-label="Switch model"]',
      ],
      expectedNeedles: ['contextual-retry-dropdown-input', '#9254a2', '#ec66f0'],
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
        const selectors = [
          '[data-radix-menu-content][data-state="open"][role="menu"]',
          '[data-radix-menu-content][role="menu"]',
          '[data-radix-popper-content-wrapper] [role="menu"]',
          '[role="menu"][data-state="open"]',
          '[role="menu"]',
        ];
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
        const selector = `section[data-testid="${probeTurnId}"] ${relativeSelector}`;
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
  const button = page.locator('button[data-testid="model-switcher-dropdown-button"]').first();
  if (!((await button.count()) > 0) || !(await button.isVisible().catch(() => false))) {
    throw new Error('Could not find a visible model switcher button');
  }
  await button.click({ force: true });
  await page.waitForTimeout(300);
  const menu = page.locator('[data-radix-menu-content][data-state="open"][role="menu"]').last();
  await menu.waitFor({ state: 'visible', timeout: 2000 });
  return (await menu.evaluate((node) => node.outerHTML).catch(() => '')) || '';
}

async function openComposerPlusMenu(page) {
  await closeTransientUi(page);
  const button = page
    .locator(
      [
        'form[data-type="unified-composer"] button[data-testid="composer-plus-btn"]',
        'button[data-testid="composer-plus-btn"]',
        'button[aria-label="Add files and more"]',
      ].join(', '),
    )
    .first();
  if (!((await button.count()) > 0) || !(await button.isVisible().catch(() => false))) {
    throw new Error('Could not find a visible composer Add files and more button');
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await closeOpenMenus(page);
    await button.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(250);
    await waitBeforeBrowserInteraction();
    await button.click({ force: true }).catch(() => {});
    await page.waitForTimeout(350);
    const html = await getLatestOpenMenuHtml(page);
    if (html && (html.includes('#712359') || html.includes('Recent files') || html.includes('#f6d0e2'))) {
      return html;
    }
  }

  throw new Error('Could not open the composer Add files and more menu');
}

function isComposerPlusMenuHtml(html) {
  return Boolean(html) && (html.includes('#712359') || html.includes('Recent files') || html.includes('#f6d0e2'));
}

function isComposerMoreSubmenuHtml(html) {
  return Boolean(html) && (html.includes('#1fa93b') || html.includes('#e717cc') || html.includes('#cf3864'));
}

async function ensureComposerPlusMenuOpen(page) {
  const html = await getLatestOpenMenuHtml(page);
  if (isComposerPlusMenuHtml(html)) {
    return html;
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
  const button = page.locator('button[data-testid="conversation-options-button"]').first();
  if (!((await button.count()) > 0) || !(await button.isVisible().catch(() => false))) {
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
    if (html && (html.includes('share-chat-menu-item') || html.includes('delete-chat-menu-item'))) {
      return html;
    }
  }

  throw new Error('Could not open conversation options menu');
}

async function findConfigureCombobox(page) {
  const locator = page.locator(
    [
      '[role="dialog"] button[role="combobox"][aria-controls]',
      '[role="dialog"] #model-selection-label ~ button[role="combobox"][aria-controls]',
    ].join(', '),
  ).first();
  if (!((await locator.count()) > 0)) return null;
  return locator;
}

async function openConfigureDialog(page) {
  await openModelSwitcherMenu(page);
  const configureItem = page.locator('[data-radix-menu-content][data-state="open"][role="menu"] [data-testid="model-configure-modal"]').first();
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
      if (text === target.label) {
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
    return (
      (await page.locator('[role="listbox"]').first().evaluate((node) => node.outerHTML).catch(() => '')) ||
      ''
    );
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

async function captureTopBarMovedThreadBottom(page, context, fixtureUrl, options = {}) {
  const { requireExtensionCapture = false } = options;
  const definition = {
    filename: '1c_TopbarToBottomEnabled_ThreadBottom.txt',
    stateId: 'topbar-bottom-enabled-thread-bottom',
    label: 'Top bar moved to bottom thread-bottom area',
    steps: [{ type: 'toggle-move-topbar-to-bottom', label: 'enable MoveTopBarToBottom extension setting' }],
    capture: { type: 'thread-bottom' },
  };

  try {
    await configureMoveTopBarToBottomSetting(context, true, options);
    await waitAroundExtensionPageAction();
    await resetFixturePage(page, fixtureUrl);
    const rawHtml = await captureByType(page, definition.capture.type, {
      currentTurnTestId: null,
      latestMenuHtml: '',
    });
    if (!rawHtml) {
      throw new Error(`Capture for ${definition.filename} returned empty HTML`);
    }
    return buildArtifactRecord(definition, 'captured', rawHtml);
  } catch (error) {
    if (isExtensionUnavailableError(error) && !requireExtensionCapture) {
      return buildArtifactRecord(
        definition,
        'deferred',
        '',
        `${error?.message || error} This optional layout-state dump requires an extension-enabled validation profile; run setup-login after this change if the profile needs to be rebuilt.`,
      );
    }
    return buildArtifactRecord(
      definition,
      'failed',
      '',
      `${error?.message || String(error) || 'Unknown capture failure'}${
        requireExtensionCapture
          ? ' Strict extension capture is enabled, so this optional dump is required.'
          : ''
      }`,
    );
  } finally {
    await configureMoveTopBarToBottomSetting(context, false, options).catch(() => {});
    await waitAroundExtensionPageAction();
    await resetFixturePage(page, fixtureUrl).catch(() => {});
  }
}

export async function runWideScrapeWithPlaywright(page, context, options = {}) {
  const { exports } = await loadDevScrapeWideContract();
  const startedAt = new Date().toISOString();
  await resetFixturePage(page, exports.DEV_SCRAPE_WIDE_FIXTURE_URL);
  const pageInfo = await evaluateWideScrapePageInfo(page);
  const rawArtifacts = new Map();
  const artifacts = [];

  for (const definition of exports.DUMP_REGISTRY) {
    if (definition.aliasOf) continue;
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
        if (step.type === 'select-configure-option') {
          await selectConfigureOption(page, step.optionId);
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
    page,
    context,
    exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
    options,
  );
  artifacts.push(oneCArtifact);

  for (const deferred of exports.DEFERRED_ARTIFACTS) {
    if (deferred.filename === oneCArtifact.filename) continue;
    artifacts.push(buildArtifactRecord(deferred, deferred.status || 'deferred'));
  }

  return {
    runKind: 'devscrapewide',
    fixtureUrl: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
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
  if (step.type === 'open-model-switcher-menu') {
    state.latestMenuHtml = await openModelSwitcherMenu(page);
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
  await resetFixturePage(page, fixtureUrl);
  await closeOpenMenus(page);
  await closeTransientUi(page);
  const newChat = page
    .locator(
      [
        'a[data-testid="create-new-chat-button"]',
        'button[data-testid="create-new-chat-button"]',
        'button[data-testid="new-chat-button"]',
      ].join(', '),
    )
    .first();
  if (!((await newChat.count()) > 0) || !(await newChat.isVisible().catch(() => false))) {
    throw new Error('Could not find a visible new conversation control for live probe setup.');
  }
  await waitBeforeBrowserInteraction();
  await newChat.click({ force: true });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(2500);
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('#prompt-textarea,[name="prompt-textarea"]')).some(
        (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
          );
        },
      ),
    undefined,
    { timeout: 10000 },
  );
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
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    window.__CGCSP_LIVE_SHORTCUT_PROBE__ = {
      state,
      describeNode,
      cleanup() {
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('submit', onSubmit, true);
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
      document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], button, a'),
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
    if (shortcut.activationProbeMode === 'direct-menu-target') continue;
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
  const onlyActionIds = new Set(options.onlyActionIds || []);
  const { exports } = await loadDevScrapeWideContract();
  const scrapeStateRegistry = [
    ...(exports.DUMP_REGISTRY || []),
    ...(exports.DEFERRED_ARTIFACTS || []),
  ];
  const inventory = await buildCurrentShortcutInventory(scrapeStateRegistry);
  const targetById = Object.fromEntries(inventory.targets.map((target) => [target.targetId, target]));
  const executableProbeShortcuts = inventory.shortcuts.filter(
    (shortcut) =>
      EXECUTABLE_LIVE_PROBE_MODES.includes(shortcut.activationProbeMode) &&
      shortcut.activationProbeSafe,
  );

  let activeShortcutCodes = {};
  let originalActiveShortcutCodes = {};
  let extensionId = '';
  let temporaryShortcutAssignments = {};
  try {
    const reachability = await verifyExtensionRuntimeReachable(context, options);
    extensionId = reachability.extensionId;
    activeShortcutCodes = await readExtensionSyncStorage(
      context,
      extensionId,
      inventory.shortcuts.map((shortcut) => shortcut.actionId),
    );
    originalActiveShortcutCodes = { ...activeShortcutCodes };
    temporaryShortcutAssignments = buildTemporaryShortcutAssignments(
      executableProbeShortcuts,
      activeShortcutCodes,
    );
    if (Object.keys(temporaryShortcutAssignments).length > 0) {
      await mutateExtensionSyncStorage(context, extensionId, {
        op: 'set',
        payload: temporaryShortcutAssignments,
      });
      activeShortcutCodes = {
        ...activeShortcutCodes,
        ...temporaryShortcutAssignments,
      };
    }
  } catch (error) {
    const reason = `${error?.message || error} Live shortcut probes require the unpacked extension to be loaded and reachable.`;
    const rows = inventory.shortcuts.map((shortcut) =>
      executableProbeShortcuts.some((item) => item.actionId === shortcut.actionId)
        ? buildSkippedLiveProbeRow(shortcut, 'environment-fail', reason)
        : buildNonExecutableLiveProbeRow(shortcut),
    );
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      fixtureUrl: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
      rows,
      summary: buildLiveProbeSummary(rows, 'environment-failed'),
    };
  }

  const rows = [];
  try {
    for (const shortcut of inventory.shortcuts) {
      if (onlyActionIds.size > 0 && !onlyActionIds.has(shortcut.actionId)) {
        continue;
      }
      const dispatchCode = resolveShortcutDispatchCode(shortcut, activeShortcutCodes);
      if (!executableProbeShortcuts.some((item) => item.actionId === shortcut.actionId)) {
        rows.push(buildNonExecutableLiveProbeRow(shortcut, dispatchCode));
        continue;
      }

      const startedAt = Date.now();
      const target = targetById[shortcut.activationProbeExpectedTargetRef];
      const probeStateId = shortcut.activationProbeUiStateRefs?.[0] || shortcut.requiredUiStateRefs?.[0];
      try {
      if (!dispatchCode && shortcut.activationProbeMode !== 'direct-menu-target') {
        rows.push(
          buildSkippedLiveProbeRow(
            shortcut,
            'skipped',
            'No assigned shortcut key code was found in active storage or defaults.',
            dispatchCode,
          ),
        );
        continue;
      }
      if (!target) {
        throw new Error(`Unknown expected probe target: ${shortcut.activationProbeExpectedTargetRef}`);
      }
      if (
        !probeStateId &&
        !['new-conversation', 'gpt-conversation'].includes(shortcut.activationProbeSetup)
      ) {
        throw new Error('Shortcut has no probe scrape state to prepare.');
      }

      if (shortcut.activationProbeSetup === 'new-conversation') {
        await prepareNewConversationProbeState(page, exports.DEV_SCRAPE_WIDE_FIXTURE_URL);
      } else if (shortcut.activationProbeSetup === 'gpt-conversation') {
        await prepareGptConversationProbeState(
          page,
          shortcut.activationProbeUrl || GPT_CONVERSATION_PROBE_URL,
        );
      } else if (shortcut.activationProbeSetup === 'composer-plus-menu') {
        await resetFixturePage(page, exports.DEV_SCRAPE_WIDE_FIXTURE_URL);
        await openComposerPlusMenu(page);
      } else if (shortcut.activationProbeSetup === 'composer-more-submenu') {
        await resetFixturePage(page, exports.DEV_SCRAPE_WIDE_FIXTURE_URL);
        await openComposerMoreSubmenu(page);
      } else {
        await prepareLiveProbeState(
          page,
          probeStateId,
          scrapeStateRegistry,
          exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
        );
      }
      if (
        shortcut.activationProbeSetup !== 'gpt-conversation' &&
        shortcut.activationProbeMode !== 'opens-target'
      ) {
        await waitForLiveProbeTargetPresence(page, target);
      }
      if (shortcut.activationProbeSetup === 'previous-thread-after-next-thread') {
        const nextCode =
          normalizeShortcutCode(activeShortcutCodes.shortcutKeyNextThread) || 'Semicolon';
        await dispatchLiveShortcut(page, nextCode);
        await page.waitForTimeout(1500);
        await waitForLiveProbeTargetPresence(page, target);
      }
      await installLiveProbeObserver(page, {
        preventDefault: shortcut.activationProbeMode !== 'opens-target',
      });
      await page.evaluate(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
        document.body?.focus?.();
      });
      if (shortcut.activationProbeMode === 'direct-menu-target') {
        await clickLiveProbeTarget(page, target);
      } else {
        await dispatchLiveShortcut(page, dispatchCode);
      }
      await page.waitForTimeout(1600);
      const observed = await readLiveProbeObserver(page);
      const clickMatch = (observed.clicks || []).find((click) => targetMatchesText(target, click.html));
      const focusMatch = targetMatchesText(target, observed.activeElement?.html || '');
      const openedMatch =
        shortcut.activationProbeMode === 'opens-target'
          ? targetMatchesText(
              target,
              await page.evaluate(() => document.documentElement?.outerHTML || ''),
            )
          : false;
      const matched =
        shortcut.activationProbeMode === 'focus-target'
          ? focusMatch
          : shortcut.activationProbeMode === 'opens-target'
            ? openedMatch
            : !!clickMatch;
      const observedNode = clickMatch || observed.clicks?.[0] || observed.activeElement || {};

      rows.push({
        actionId: shortcut.actionId,
        label: shortcut.label,
        defaultCode: shortcut.defaultCode,
        dispatchCode,
        probeMode: shortcut.activationProbeMode,
        expectedTargetRef: shortcut.activationProbeExpectedTargetRef,
        status: matched ? 'pass' : 'fail',
        reason: matched
          ? 'Shortcut activated the expected target.'
          : `Shortcut did not activate expected target ${shortcut.activationProbeExpectedTargetRef}.`,
        observedSelector: observedNode.selector || '',
        observedTextSnippet: observedNode.textSnippet || '',
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
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
        durationMs: Date.now() - startedAt,
      });
      } finally {
        await cleanupLiveProbeObserver(page);
        await closeOpenMenus(page).catch(() => {});
      }
    }
  } finally {
    const temporaryKeys = Object.keys(temporaryShortcutAssignments);
    if (temporaryKeys.length > 0 && extensionId) {
      const valuesToRestore = {};
      const keysToRemove = [];
      for (const key of temporaryKeys) {
        if (Object.hasOwn(originalActiveShortcutCodes, key)) {
          valuesToRestore[key] = originalActiveShortcutCodes[key];
        } else {
          keysToRemove.push(key);
        }
      }
      if (Object.keys(valuesToRestore).length > 0) {
        await mutateExtensionSyncStorage(context, extensionId, { op: 'set', payload: valuesToRestore }).catch(
          () => {},
        );
      }
      if (keysToRemove.length > 0) {
        await mutateExtensionSyncStorage(context, extensionId, { op: 'remove', payload: keysToRemove }).catch(
          () => {},
        );
      }
    }
  }

  await resetFixturePage(page, exports.DEV_SCRAPE_WIDE_FIXTURE_URL).catch(() => {});
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fixtureUrl: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
    rows,
    summary: buildLiveProbeSummary(rows),
  };
}

export async function writeLiveProbeReport(folderPath, liveProbeReport) {
  const reportPath = path.join(folderPath, LIVE_PROBE_REPORT_FILENAME);
  await writeFile(reportPath, `${JSON.stringify(liveProbeReport, null, 2)}\n`, 'utf8');
  return reportPath;
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
          return { name: entry.name, path: folderPath, sortKey: folderSortKey };
        }
        try {
          const manifest = await loadRunManifest(folderPath);
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
  const directories = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const folderPath = path.join(inspectorCapturesRoot, entry.name);
        const folderSortKey = parseRunFolderSortKey(entry.name);
        if (folderSortKey) {
          return { name: entry.name, path: folderPath, sortKey: folderSortKey };
        }
        try {
          const manifest = await loadRunManifest(folderPath);
          const sortKey = parseManifestSortKey(manifest);
          return sortKey ? { name: entry.name, path: folderPath, sortKey } : null;
        } catch {
          return null;
        }
      }),
  );
  return directories.filter(Boolean).sort((left, right) => left.sortKey.localeCompare(right.sortKey));
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

async function buildCurrentShortcutInventory(scrapeStateRegistry) {
  const [contentSource, settingsSchemaSource, localeMessages] = await Promise.all([
    readCurrentRuntimeSource(),
    readSettingsSchemaSource(),
    readEnglishLocaleMessages(),
  ]);
  return buildShortcutValidationInventory({
    contentSource,
    settingsSchema: parseSettingsSchemaSource(settingsSchemaSource),
    localeMessages,
    scrapeStateRegistry,
  });
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

  const liveProbeRows = Array.isArray(run.liveProbeReport?.rows) ? run.liveProbeReport.rows : [];
  const livePassedActionIds = new Set(
    liveProbeRows.filter((row) => row.status === 'pass').map((row) => row.actionId),
  );
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
    fixtureUrl: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
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
      `<p>${reportFileLinkHtml(latest, `View latest report from ${localDateTimeText(latest.sortKey)}`)}</p>`,
    );
  }
  if (previous.length) {
    lines.push('<p class="muted">Previous reports:</p>');
    lines.push('<ul>');
    for (const item of previous) {
      lines.push(
        `<li>${reportFileLinkHtml(item, `${localDateTimeText(item.sortKey)} - ${item.folderName}`)}</li>`,
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
  const statusTextByShortcutStatus = {
    pass: 'PASS',
    fail: 'FAIL',
    partial: 'PARTIAL',
    manual: 'MANUAL',
    'not-applicable': 'N/A',
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
      status: artifactFailureCount ? 'Needs Fix' : 'Pass',
      good: report?.runManifest?.capturedCount || 0,
      needs: artifactFailureCount,
      meaning: artifactFailureCount
        ? 'One or more required dumps failed or expected scrape files are missing.'
        : 'Saved dumps are available for the target audit.',
    },
    {
      area: 'Shortcut Target Audit',
      status:
        (shortcutSummary.failed || 0) > 0
          ? 'Needs Fix'
          : actionablePartialShortcutRows.length > 0
            ? 'Partial'
            : 'Pass',
      good: shortcutSummary.passed || 0,
      needs: (shortcutSummary.failed || 0) + actionablePartialShortcutRows.length,
      meaning: `${shortcutSummary.failed || 0} failed, ${actionablePartialShortcutRows.length} unresolved partial, ${shortcutSummary.manual || 0} manual follow-up.`,
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
    '</section><section class="tab-panel" id="details-panel">',
    `<p><strong>Fixture:</strong> <span class="mono">${escapeHtml(report?.fixtureUrl || '')}</span></p>`,
    `<p><strong>Folder:</strong> <span class="mono">${escapeHtml(report?.folderName || '')}</span></p>`,
    `<p><strong>Summary:</strong> ${escapeHtml(
      `${shortcutSummary.total ?? 0} shortcuts checked: ${shortcutSummary.passed ?? 0} passed, ${shortcutSummary.failed ?? 0} failed, ${shortcutSummary.partial ?? 0} partial, ${shortcutSummary.manual ?? 0} manual-only, ${shortcutSummary.notApplicable ?? 0} not applicable.`,
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
          `<td class="${className}">${escapeHtml(row.status === 'no-scrape-coverage' ? 'NO SCRAPE COVERAGE' : row.status.toUpperCase())}<div class="muted">${escapeHtml(row.statusReason || '')}</div></td>`,
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
