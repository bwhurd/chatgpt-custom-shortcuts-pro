/* 
ChatGPT Custom Shortcuts Pro
- Full Changelog: https://bwhurd.github.io/chatgpt-custom-shortcuts-pro/CHANGELOG.html
- Privacy Statement: This extension does not collect, monitor, or track user activity.
*/

// To do:
// 1. add shortcuts to move up or down to previous or next conversation

// =====================================
// @note Global Functions
// =====================================

// Verify GSAP libraries before registration (bounded retries, single warning)
// GSAP plugins are loaded via manifest *before* this script — register directly.
gsap.registerPlugin(ScrollToPlugin, Observer, Flip);
ScrollToPlugin.config({ autoKill: true });
console.log('GSAP plugins registered.');

// Shared scroll state object
const ScrollState = {
  scrollContainer: null,
  isAnimating: false,
  finalScrollPosition: 0,
  userInterrupted: false,
};

// Utility functions for scrolling
function resetScrollState() {
  if (ScrollState.isAnimating) {
    ScrollState.isAnimating = false;
    ScrollState.userInterrupted = true; // Mark animation as interrupted
  }
  ScrollState.scrollContainer = getScrollableContainer();
  if (ScrollState.scrollContainer) {
    ScrollState.finalScrollPosition = ScrollState.scrollContainer.scrollTop;
  }
}

function getScrollableContainer() {
  const firstMessage = document.querySelector('[data-testid^="conversation-turn-"]');
  if (!firstMessage) return null;

  let container = firstMessage.parentElement;
  while (container && container !== document.body) {
    const style = getComputedStyle(container);
    if (
      container.scrollHeight > container.clientHeight &&
      style.overflowY !== 'visible' &&
      style.overflowY !== 'hidden'
    ) {
      return container;
    }
    container = container.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function getComposerTopEdge() {
  const pickTop = (el) => {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return Number.isFinite(rect?.top) ? rect.top : null;
  };

  const container = document.getElementById('thread-bottom-container');
  if (container) {
    const marker = container.querySelector('.absolute.start-0.end-0.bottom-full.z-20');
    const markerTop = pickTop(marker);
    if (markerTop !== null) return markerTop;

    const formTop = pickTop(container.querySelector('form[data-type="unified-composer"]'));
    if (formTop !== null) return formTop;

    const backgroundTop = pickTop(container.querySelector('#composer-background'));
    if (backgroundTop !== null) return backgroundTop;
  }

  const fallbackBackgroundTop = pickTop(document.getElementById('composer-background'));
  if (fallbackBackgroundTop !== null) return fallbackBackgroundTop;

  const fallbackFormTop = pickTop(document.querySelector('form[data-type="unified-composer"]'));
  if (fallbackFormTop !== null) return fallbackFormTop;

  return null;
}

// Visible for lowest-item shortcuts means "above the composer's top edge"; anything under it is treated as occluded.
function isAboveComposer(rect, el) {
  const composerTop = getComposerTopEdge();
  if (!Number.isFinite(composerTop)) return true;

  if (el) {
    const composerAncestor = el.closest(
      '#thread-bottom-container, #thread-bottom, form[data-type="unified-composer"], #composer-background',
    );
    if (composerAncestor) return true;
  }

  if (!rect || !Number.isFinite(rect.bottom)) return true;

  const CLIP_BUFFER = 1;
  return rect.bottom <= composerTop - CLIP_BUFFER;
}

// =======================
// Centralized MutationObserver
// =======================

let chatContainerObserver = null;

function observeConversationContainer(callback) {
  // If DOM isn't ready yet, defer a single attach
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => observeConversationContainer(callback), {
      once: true,
    });
    return;
  }

  // Find the smallest stable ancestor of all [data-testid^="conversation-turn-"] nodes.
  const target = getScrollableContainer();
  if (!target) {
    // Retry briefly while the chat UI mounts, then give up cleanly
    observeConversationContainer._retries = (observeConversationContainer._retries || 0) + 1;
    if (observeConversationContainer._retries <= 20) {
      setTimeout(() => observeConversationContainer(callback), 150);
    }
    return; // Don't attach to body/doc ever!
  }

  // Reset retry counter on success
  observeConversationContainer._retries = 0;

  if (chatContainerObserver) chatContainerObserver.disconnect();

  chatContainerObserver = new MutationObserver((mutations) => {
    // Batch/delay heavy work (avoid global name collisions)
    if (mutations.length) {
      const key = '__csp_chatObserverFlushScheduled';
      if (!window[key]) {
        window[key] = true;
        requestIdleCallback(
          () => {
            window[key] = false;
            callback(mutations);
          },
          { timeout: 200 },
        );
      }
    }
  });

  chatContainerObserver.observe(target, {
    childList: true,
    subtree: false, // Only watch direct children, not entire subtree!
  });
}

// Usage example: Call this ONCE after DOM is ready
observeConversationContainer((mutations) => {
  // Only act if relevant children were added/removed
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      // Example: run updateChatUI or refresh shortcut mapping
      // updateChatUI();
    }
  }
});

// Global helper to toggle visibility and expose setting values
function applyVisibilitySettings(data) {
  // Key: global window property
  // Value: [defaultIfUndefined, defaultIfMissing]
  const settingsMap = {
    moveTopBarToBottomCheckbox: false,
    pageUpDownTakeover: true,
    showLegacyArrowButtonsCheckbox: false,
    removeMarkdownOnCopyCheckbox: true,
    selectMessagesSentByUserOrChatGptCheckbox: true,
    onlySelectUserCheckbox: false,
    onlySelectAssistantCheckbox: false,
    disableCopyAfterSelectCheckbox: false,
    enableSendWithControlEnterCheckbox: true,
    enableStopWithControlBackspaceCheckbox: true,
    useAltForModelSwitcherRadio: true,
    useControlForModelSwitcherRadio: false,
    rememberSidebarScrollPositionCheckbox: false,
    selectThenCopyAllMessagesBothUserAndChatGpt: false,
    selectThenCopyAllMessagesOnlyAssistant: true,
    selectThenCopyAllMessagesOnlyUser: false,
    doNotIncludeLabelsCheckbox: false,
    clickToCopyInlineCodeEnabled: false,
  };

  for (const key in settingsMap) {
    // If present in data, use its boolean value, otherwise fallback to default.
    window[key] = Object.hasOwn(data, key) ? Boolean(data[key]) : settingsMap[key];
  }
}

// Expose globally for use in other scripts/IIFEs
window.applyVisibilitySettings = applyVisibilitySettings;

// helper for slim sidebar bugs with sidebar toggle shortcut
// These helpers only set styles directly, no timers, no recursion
window.hideSlimSidebarBarInstant = () => {
  const bar = document.getElementById('stage-sidebar-tiny-bar');
  if (!bar) return;
  bar.style.setProperty('transition', 'none', 'important');
  bar.style.setProperty('opacity', '0', 'important');
  // force reflow without using void
  // eslint-disable-next-line no-unused-expressions
  bar.offsetWidth;
  setTimeout(() => {
    if (bar) {
      bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');
    }
  }, 0);
};

window.flashSlimSidebarBar = (dur = 2500) => {
  // Use the canonical timer in the main IIFE if present
  if (typeof window._flashSlimSidebarBar === 'function') {
    window._flashSlimSidebarBar(dur);
    return;
  }
  // Fallback for standalone: just snap to 1, fade to idle after dur
  const bar = document.getElementById('stage-sidebar-tiny-bar');
  if (!bar) return;
  bar.style.setProperty('transition', 'none', 'important');
  bar.style.setProperty('opacity', '1', 'important');
  // force reflow without using void
  // eslint-disable-next-line no-unused-expressions
  bar.offsetWidth;
  bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');
  setTimeout(() => window.fadeSlimSidebarBarToIdle(), dur);
};

window.fadeSlimSidebarBarToIdle = () => {
  const bar = document.getElementById('stage-sidebar-tiny-bar');
  if (!bar) return;
  bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');
  bar.style.setProperty('opacity', (window._slimBarIdleOpacity ?? 0.6).toString(), 'important');
};

// Mac Cross-Compatibility Helper
// Mac Cross-Compatibility Helper
const MAC_REGEX = /Mac/i;

function isMacPlatform() {
  const ua = navigator.userAgent || '';
  const plat = navigator.platform || '';
  const uaDataPlat = navigator.userAgentData?.platform || '';
  return MAC_REGEX.test(plat) || MAC_REGEX.test(ua) || MAC_REGEX.test(uaDataPlat);
}

// --- compat helpers to support both legacy chars and new codes ---
const LETTER_REGEX = /^[A-Z]$/;
const DIGIT_REGEX = /^[0-9]$/;

function charToCode(ch) {
  if (!ch) return '';
  const raw = ch.trim();
  const upper = raw.toUpperCase();
  if (LETTER_REGEX.test(upper)) return `Key${upper}`;
  if (DIGIT_REGEX.test(raw)) return `Digit${raw}`;

  switch (raw) {
    case '-':
      return 'Minus';
    case '=':
      return 'Equal';
    case '[':
      return 'BracketLeft';
    case ']':
      return 'BracketRight';
    case '\\':
      return 'Backslash';
    case ';':
      return 'Semicolon';
    case "'":
      return 'Quote';
    case ',':
      return 'Comma';
    case '.':
      return 'Period';
    case '/':
      return 'Slash';
    case '`':
      return 'Backquote';
    case ' ':
      return 'Space';
    default:
      return '';
  }
}

// --- Helpers (global scope) -----------------------------------------------

/**
 * Treat 'DigitX' and 'NumpadX' as equivalent.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
// Precompiled regexes (top-level for performance)
const DIGIT_NUMPAD_REGEX = /^(Digit|Numpad)([0-9])$/;
const VALID_CODE_REGEX =
  /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote|Space)$/;

/**
 * Treat 'DigitX' and 'NumpadX' as equivalent.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
const codeEquals = (a, b) => {
  if (a === b) return true;
  const A = a?.match(DIGIT_NUMPAD_REGEX);
  const B = b?.match(DIGIT_NUMPAD_REGEX);
  return Boolean(A && B && A[2] === B[2]);
};

/** Accepts either a legacy single char ('w') or a code ('KeyW', 'Digit1', 'Numpad1', etc.) in storage. */
const normalizeStoredToCode = (stored) => {
  if (!stored) return '';
  const s = String(stored).trim();

  // Recognized code patterns (keep in sync with charToCode)
  if (VALID_CODE_REGEX.test(s)) return s;

  // Legacy single-character value
  if (s.length === 1) return typeof charToCode === 'function' ? charToCode(s) : '';

  return '';
};

// Expose a single, canonical place for these helpers (used elsewhere in the file)
window.ShortcutUtils = {
  ...(window.ShortcutUtils || {}),
  codeEquals,
  normalizeStoredToCode,
};

// ======================================================
// ==== Shared getOpenMenus helper  =========
const getOpenMenus = () => {
  const menus = Array.from(
    document.querySelectorAll('[role="menu"][data-radix-menu-content][data-state="open"]'),
  );
  const X_OFFSET_TOLERANCE = 4; // px; prefer horizontal ordering when difference exceeds this
  return menus.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    if (Math.abs(ra.left - rb.left) > X_OFFSET_TOLERANCE) return ra.left - rb.left;
    return ra.top - rb.top;
  });
};

// ======================================================
// ==== Shared flashBorder helper (deduplicated) =========
const flashBorder = (el) => {
  if (!el) return;
  if (!window.gsap) return;

  const tertiary =
    getComputedStyle(document.documentElement).getPropertyValue('--main-surface-tertiary').trim() ||
    '#888';
  const row = el.closest('div[class*="group-hover/turn-messages"]') || el.parentElement;
  row?.classList.add('force-full-opacity');
  gsap
    .timeline({
      onComplete: () => {
        gsap.set(el, { clearProps: 'boxShadow,scale' });
        row?.classList.remove('force-full-opacity');
      },
    })
    .fromTo(
      el,
      { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1 },
      {
        boxShadow: `0 0 0 3px ${tertiary}`,
        scale: 0.95,
        duration: 0.15,
        ease: 'power2.out',
      },
    )
    .to(el, {
      boxShadow: `0 0 0 0 ${tertiary}`,
      scale: 1,
      duration: 0.2,
      ease: 'power2.in',
    });
};

// Prefer the composer button and verify its data-testid is "stop-button".
// Fallback also checks for both data-testid and data-test-id.
function getVisibleStopButton() {
  const candidates = [];

  const composerBtn = document.getElementById('composer-submit-button');
  if (
    composerBtn &&
    (composerBtn.getAttribute('data-testid') === 'stop-button' ||
      composerBtn.getAttribute('data-test-id') === 'stop-button')
  ) {
    candidates.push(composerBtn);
  }

  const q = document.querySelector(
    'button[data-testid="stop-button"], button[data-test-id="stop-button"]',
  );
  if (q) candidates.push(q);

  for (const btn of candidates) {
    if (!btn || btn.disabled) continue;
    const style = window.getComputedStyle(btn);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = btn.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (btn.closest('[aria-hidden="true"]')) continue;
    return btn;
  }
  return null;
}

// ======================================================
// ==== @note Delays Shared helpers ========

const DELAYS = {
  // Click Buried Button
  afterPlusClick: 50,
  beforeSubmenuInteract: 50,
  betweenKeyAttempts: 15,
  afterSubmenuOpen: 50,
  beforeFinalClick: 150,

  // Centralized timeouts
  waitSubmenuEl: 2000, // ms, submenu wait (existing)
  waitMenuOpen: 1500, // ms, composer menu open
  waitSubmenuOpen: 2000, // ms, "More" submenu open
  waitActionItem: 2500, // ms, menu action item search
  buttonFade: 3500, // ms, scroll button fade out
  feedbackDelay: 100, // ms, feedback animation delay
};

window.DELAYS = DELAYS;
window.delays = DELAYS;
const delays = DELAYS;

// =====================================
// @note Sync Chrome Storage + UI State + Expose Global Variables
// =====================================

(() => {
  // Fetch initial values from Chrome storage
  chrome.storage.sync.get(
    [
      'showLegacyArrowButtonsCheckbox',
      'hideArrowButtonsCheckbox',
      'moveTopBarToBottomCheckbox',
      'pageUpDownTakeover',
      'removeMarkdownOnCopyCheckbox',
      'selectMessagesSentByUserOrChatGptCheckbox',
      'onlySelectUserCheckbox',
      'onlySelectAssistantCheckbox',
      'disableCopyAfterSelectCheckbox',
      'enableSendWithControlEnterCheckbox',
      'enableStopWithControlBackspaceCheckbox',
      'popupBottomBarOpacityValue',
      'useAltForModelSwitcherRadio',
      'useControlForModelSwitcherRadio',
      'rememberSidebarScrollPositionCheckbox',
      'fadeSlimSidebarEnabled', // (checkbox state: true/false)
      'popupSlimSidebarOpacityValue', // (slider value: number)
      'clickToCopyInlineCodeEnabled', // (checkbox state: true/false)
      `selectThenCopyAllMessagesBothUserAndChatGpt`,
      `selectThenCopyAllMessagesOnlyAssistant`,
      `selectThenCopyAllMessagesOnlyUser`,
      `doNotIncludeLabelsCheckbox`,
    ],
    (data) => {
      // One-time migration: invert old value into new key, persist, then clean up
      if (
        !Object.hasOwn(data, 'showLegacyArrowButtonsCheckbox') &&
        Object.hasOwn(data, 'hideArrowButtonsCheckbox')
      ) {
        data.showLegacyArrowButtonsCheckbox = !data.hideArrowButtonsCheckbox;
        chrome.storage.sync.set({
          showLegacyArrowButtonsCheckbox: data.showLegacyArrowButtonsCheckbox,
        });
        chrome.storage.sync.remove('hideArrowButtonsCheckbox');
      }
      applyVisibilitySettings(data);
    },
  );

  // Listen for changes in Chrome storage and dynamically apply settings
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      const updatedData = {};

      // Back-compat: if old key changes, mirror it inverted into the new key
      if (
        Object.hasOwn(changes, 'hideArrowButtonsCheckbox') &&
        !Object.hasOwn(changes, 'showLegacyArrowButtonsCheckbox')
      ) {
        updatedData.showLegacyArrowButtonsCheckbox = !changes.hideArrowButtonsCheckbox.newValue;
      }

      for (const key in changes) {
        updatedData[key] = changes[key].newValue;
      }
      applyVisibilitySettings(updatedData);
    }
  });
})();

// ==================================================
// Custom GPT Menu Utilities
// Detects and interacts with GPT-specific menu buttons and submenu items,
// working for both header and bottom bar locations. Exposes helpers for
// reliable automation of menu navigation in custom GPT interfaces.
//
// Example (bind elsewhere via your shortcut system):
// const SUB_ITEM_BTN_PATH = 'M2.6687 11.333V8.66699C2.6687';
// window.clickGptMenuThenSubItemSvg(SUB_ITEM_BTN_PATH, { prefer: 'header' /* or 'bottom' */ });
// ==================================================
(() => {
  // Use same timings; prefer existing global if present
  const DEFAULT_MENU_DELAYS =
    (typeof window.DEFAULT_MENU_DELAYS === 'object' && window.DEFAULT_MENU_DELAYS) ||
    Object.freeze({
      MENU_READY_OPEN: 350,
      MENU_READY_EXPANDED: 250,
      ITEM_CLICK: 375,
      RETRY_INTERVAL: 25,
      MAX_RETRY_ATTEMPTS: 10,
    });

  const MENU_ITEM_ROLES =
    ':is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"])';
  const MENU_CONTENT_SELECTOR =
    '[role="menu"][data-radix-menu-content][data-state="open"], [data-radix-menu-content][data-state="open"][role="menu"]';

  // Down-chevron in the GPT trigger (text-agnostic)
  const CHEVRON_ICON_TOKENS = ['M12.1338 5.94433', '#ba3792'];

  const toTokenArray = (tokenOrTokens) =>
    Array.isArray(tokenOrTokens) ? tokenOrTokens.filter(Boolean) : [tokenOrTokens].filter(Boolean);

  const safeEsc = (s) => {
    try {
      return CSS?.escape ? CSS.escape(String(s)) : String(s);
    } catch {
      return String(s);
    }
  };

  const svgSelectorForTokensLocal = (tokenOrTokens) =>
    toTokenArray(tokenOrTokens)
      .map((token) => {
        const escapedPath = safeEsc(token);
        const escapedHref = String(token).replace(/(["\\])/g, '\\$1');
        return [`svg path[d^="${escapedPath}"]`, `svg use[href*="${escapedHref}"]`].join(', ');
      })
      .join(', ');

  // Call the same flashBorder you already use (support both local symbol and window export)
  function callFlash(el) {
    const fn =
      typeof window.flashBorder === 'function'
        ? window.flashBorder
        : typeof self !== 'undefined' && typeof self.flashBorder === 'function'
          ? self.flashBorder
          : typeof flashBorder === 'function'
            ? flashBorder
            : null;

    if (window.gsap && typeof fn === 'function') fn(el);
  }

  // Visibility matches viewport bounds and clips anything under the composer
  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const inViewport = r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
    return inViewport && isAboveComposer(r, el);
  }

  function smartClick(el) {
    if (!el) return false;
    try {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dispatch = (type, Ctor) => {
        try {
          el.dispatchEvent(
            new Ctor(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              clientX: cx,
              clientY: cy,
            }),
          );
        } catch {
          /* ignore */
        }
      };

      if ('PointerEvent' in window) {
        dispatch('pointerover', PointerEvent);
        dispatch('pointerenter', PointerEvent);
        dispatch('pointerdown', PointerEvent);
      }
      dispatch('mouseover', MouseEvent);
      dispatch('mouseenter', MouseEvent);
      dispatch('mousedown', MouseEvent);
      if ('PointerEvent' in window) dispatch('pointerup', PointerEvent);
      dispatch('mouseup', MouseEvent);
      el.click();
      if ('PointerEvent' in window) {
        dispatch('pointerout', PointerEvent);
        dispatch('pointerleave', PointerEvent);
      }
      return true;
    } catch {
      try {
        el.click();
        return true;
      } catch {
        return false;
      }
    }
  }

  function openRadixMenuIfNeeded(triggerEl, delays = DEFAULT_MENU_DELAYS) {
    const expanded = triggerEl.getAttribute('aria-expanded') === 'true';
    if (!expanded) {
      try {
        triggerEl.focus?.();
      } catch {}

      // Radix triggers are frequently non-button elements; use a real pointer click.
      smartClick(triggerEl);
      return delays.MENU_READY_OPEN;
    }
    return delays.MENU_READY_EXPANDED;
  }

  function findOpenMenuForTrigger(triggerEl) {
    if (!triggerEl) return null;

    const triggerId = triggerEl.getAttribute('id');
    if (triggerId) {
      const byLabel = document.querySelector(
        `${MENU_CONTENT_SELECTOR}[aria-labelledby="${safeEsc(triggerId)}"]`,
      );
      if (byLabel) return byLabel;
    }

    const menus = Array.from(document.querySelectorAll(MENU_CONTENT_SELECTOR));
    if (!menus.length) return null;

    const tr = triggerEl.getBoundingClientRect();
    const tcx = tr.left + tr.width / 2;
    const tcy = tr.top + tr.height / 2;

    menus.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const acx = ra.left + ra.width / 2;
      const acy = ra.top + ra.height / 2;
      const bcx = rb.left + rb.width / 2;
      const bcy = rb.top + rb.height / 2;
      const da = (acx - tcx) ** 2 + (acy - tcy) ** 2;
      const db = (bcx - tcx) ** 2 + (bcy - tcy) ** 2;
      return da - db;
    });
    return menus[0] || null;
  }

  const getMenuItemLabel = (el) =>
    (el?.textContent || el?.innerText || el?.getAttribute?.('aria-label') || '').trim();

  function clickMenuItemByPathPrefix(
    triggerEl,
    pathPrefix,
    delays = DEFAULT_MENU_DELAYS,
    attempt = 0,
    fallbackText,
  ) {
    const menu = findOpenMenuForTrigger(triggerEl);
    const selector = svgSelectorForTokensLocal(pathPrefix);
    const item = menu
      ? Array.from(menu.querySelectorAll(selector))
          .map((p) => p.closest(MENU_ITEM_ROLES))
          .filter(Boolean)
          .filter(isVisible)[0] || null
      : null;

    if (item) {
      // Flash the menu item with same logic
      callFlash(item);
      setTimeout(() => item.click(), delays.ITEM_CLICK);
      return true;
    }

    if (menu && fallbackText) {
      const needle = String(fallbackText).trim().toLowerCase();
      const fallback = Array.from(menu.querySelectorAll(MENU_ITEM_ROLES))
        .filter(isVisible)
        .find((el) => getMenuItemLabel(el).toLowerCase() === needle);
      if (fallback) {
        callFlash(fallback);
        setTimeout(() => fallback.click(), delays.ITEM_CLICK);
        return true;
      }
    }

    if (attempt < delays.MAX_RETRY_ATTEMPTS) {
      setTimeout(
        () =>
          clickMenuItemByPathPrefix(
            triggerEl,
            pathPrefix,
            delays,
            attempt + 1,
            fallbackText,
          ),
        delays.RETRY_INTERVAL,
      );
    }
    return false;
  }

  // Finds the GPT menu trigger in header or bottom bar (text-agnostic, locale-agnostic)
  function findGptMenuTrigger() {
    const scopes = [
      document.querySelector('#page-header'),
      document.querySelector('#bottomBarContainer'),
      document,
    ];

    for (const scope of scopes) {
      if (!scope) continue;

      const candidates = Array.from(
        scope.querySelectorAll(':is(div[type="button"],button)[aria-haspopup="menu"]'),
      ).filter(isVisible);

      if (!candidates.length) continue;

      const chevronSelector = svgSelectorForTokensLocal(CHEVRON_ICON_TOKENS);
      const withChevron = candidates.filter((el) => el.querySelector(chevronSelector));
      if (withChevron.length) return withChevron[withChevron.length - 1];

      return candidates[candidates.length - 1];
    }
    return null;
  }

  /**
   * Clicks the GPT menu trigger (header or bottom bar), then clicks a submenu item by SVG path 'd' prefix.
   * Uses the same flash/timing pattern as your clickLowestSvgThenSubItemSvg helper.
   * @param {string|string[]} subItemPathPrefix - SVG path 'd' prefix or icon tokens (e.g., 'M2.6687 11.333V8.66699C2.6687' or ['oldPath','newIconId'])
   * @param {object} [options] - Optional timing overrides: { delays: { ...DEFAULT_MENU_DELAYS } }
   */
  function clickGptHeaderThenSubItemSvg(subItemPathPrefix, options = {}) {
    const delays = { ...DEFAULT_MENU_DELAYS, ...(options.delays || {}) };
    const trigger = findGptMenuTrigger();
    if (!trigger) return false;

    // Flash the trigger exactly like your other helper
    callFlash(trigger);

    const waitMs = openRadixMenuIfNeeded(trigger, delays);
    setTimeout(() => {
      clickMenuItemByPathPrefix(
        trigger,
        subItemPathPrefix,
        delays,
        0,
        typeof options.fallbackText === 'string' ? options.fallbackText : undefined,
      );
    }, waitMs);

    return true;
  }

  // Optional: helper to inspect current menu icon path prefixes
  function debugListOpenMenuItemPathPrefixes(prefixLen = 40) {
    const paths = Array.from(document.querySelectorAll(`${MENU_ITEM_ROLES} svg path[d]`));
    const uniq = [...new Set(paths.map((p) => (p.getAttribute('d') || '').slice(0, prefixLen)))];
    console.log('Menu item path prefixes:', uniq);
    return uniq;
  }

  // Expose for your gated GPT-only IIFE / hotkeys
  window.clickGptHeaderThenSubItemSvg = clickGptHeaderThenSubItemSvg;
  window.findGptMenuTrigger = findGptMenuTrigger;
  window.debugListOpenMenuItemPathPrefixes = debugListOpenMenuItemPathPrefixes;

  // Also export flashBorder if your base script didn't (prevents missing flash when our IIFE runs first)
  if (typeof window.flashBorder !== 'function' && typeof flashBorder === 'function') {
    window.flashBorder = flashBorder;
  }
})();

// =============================
// @note Main IIFE
// =============================
(() => {
  // appendWithFragment: Appends multiple elements to a parent element using a document fragment to improve performance.

  function appendWithFragment(parent, ...elements) {
    const fragment = document.createDocumentFragment();
    for (const el of elements.filter((el) => el !== null && el !== undefined)) {
      fragment.appendChild(el);
    }
    parent.appendChild(fragment);
  }

  function showToast(message, delays = DELAYS) {
    // Reuse a single toast; avoid stacking & leaking timers
    const id = 'csp-toast';
    let toast = document.getElementById(id);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = id;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.style.cssText =
        'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);padding:16px;background-color:#333;color:#FFF;border-radius:4px;max-width:90%;text-align:center;z-index:1000;font-size:14px;opacity:0;transition:opacity 0.5s ease;box-shadow:0 2px 4px -1px rgba(0,0,0,0.2),0 4px 5px 0 rgba(0,0,0,0.14),0 1px 10px 0 rgba(0,0,0,0.12)';
      document.body.appendChild(toast);
    }
    // Clear previous timers if any
    if (toast._hideTimer) clearTimeout(toast._hideTimer);
    if (toast._removeTimer) clearTimeout(toast._removeTimer);

    toast.textContent = message;
    // Show
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });

    // Hide then remove
    toast._hideTimer = setTimeout(() => {
      toast.style.opacity = '0';
    }, 3000);
    toast._removeTimer = setTimeout(() => {
      if (toast?.parentNode) toast.parentNode.removeChild(toast);
    }, delays.buttonFade);
  }

  function getAllCodeBlocks() {
    const codeBoxes = document.querySelectorAll('pre');
    const blocks = [];
    for (const codeBox of codeBoxes) {
      const codeElements = codeBox.querySelectorAll('code');
      for (const codeElement of codeElements) {
        const block = codeElement.textContent.trim();
        if (block) {
          blocks.push(block);
        }
      }
    }
    return blocks;
  }

  function copyCode() {
    const codeBoxes = document.querySelectorAll('pre');
    if (codeBoxes.length === 0) {
      showToast('No code boxes found');
      return;
    }
    chrome.storage.sync.get('copyCodeUserSeparator', (data) => {
      const copyCodeSeparator = data.copyCodeUserSeparator
        ? parseSeparator(data.copyCodeUserSeparator)
        : ' \n  \n --- --- --- \n \n';
      const formattedBlocks = getAllCodeBlocks();
      const output = formattedBlocks.join(copyCodeSeparator);

      if (output.trim()) {
        navigator.clipboard
          .writeText(output)
          .then(() => showToast('All code boxes copied to clipboard!'))
          .catch(() => showToast('Error copying code content to clipboard!'));
      } else {
        showToast('No content found in the code boxes');
      }
    });
  }

  function parseSeparator(separator) {
    // Parse literal `\n` and similar into real line breaks
    return separator.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');
  }

  // Shared helper so "one up" and "two up" use the exact same anchor logic.
  function scrollUpByMessages(steps = 1, feedbackTarget = null) {
    resetScrollState();

    const messages = Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"]'));
    const scrollContainer = getScrollableContainer();
    if (!scrollContainer || messages.length === 0) return;

    // Offset values based on checkbox state
    const isBottom = window.moveTopBarToBottomCheckbox;
    const messageThreshold = isBottom ? -48 : -30; // same as original goUpOne
    const scrollOffset = isBottom ? 43 : 25;

    let foundCount = 0;
    let targetMessage = null;

    // Scan upward from the bottom, counting matches like original goUpOne
    for (let i = messages.length - 1; i >= 0; i--) {
      const messageTop = messages[i].getBoundingClientRect().top;
      if (messageTop < messageThreshold) {
        foundCount++;
        if (foundCount === steps) {
          targetMessage = messages[i];
          break;
        }
      }
    }

    if (targetMessage) {
      gsap.to(scrollContainer, {
        duration: 0.3,
        scrollTo: { y: targetMessage.offsetTop - scrollOffset },
        ease: 'power4.out',
      });
    } else {
      gsap.to(scrollContainer, {
        duration: 0.3,
        scrollTo: { y: 0 },
        ease: 'power4.out',
      });
    }

    if (feedbackTarget) feedbackAnimation(feedbackTarget); // trigger immediately
  }

  function goUpOneMessage(feedbackTarget = null) {
    resetScrollState(); // Reset the shared scroll state

    const messages = document.querySelectorAll('[data-testid^="conversation-turn-"]');
    let targetMessage = null;

    // Offset values based on checkbox state
    const isBottom = window.moveTopBarToBottomCheckbox;
    const messageThreshold = isBottom ? -48 : -30;
    const scrollOffset = isBottom ? 43 : 25;

    for (let i = messages.length - 1; i >= 0; i--) {
      const messageTop = messages[i].getBoundingClientRect().top;
      if (messageTop < messageThreshold) {
        targetMessage = messages[i];
        break;
      }
    }

    const scrollContainer = getScrollableContainer();
    if (!scrollContainer) return;

    if (targetMessage) {
      gsap.to(scrollContainer, {
        duration: 0.3,
        scrollTo: {
          y: targetMessage.offsetTop - scrollOffset,
        },
        ease: 'power4.out',
      });
    } else {
      gsap.to(scrollContainer, {
        duration: 0.3,
        scrollTo: {
          y: 0,
        },
        ease: 'power4.out',
      });
    }

    if (feedbackTarget) feedbackAnimation(feedbackTarget);
  }

  function goUpTwoMessages(feedbackTarget = null) {
    scrollUpByMessages(2, feedbackTarget);
  }

  function createScrollUpButton() {
    // Return a harmless node when button is gated off – avoids undefined append
    if (!window.showLegacyArrowButtonsCheckbox) {
      return null;
    }

    if (!(window.gsap && window.ScrollToPlugin)) {
      console.error('GSAP or ScrollToPlugin is missing.');
      return document.createComment('scroll-up-btn-no-gsap');
    }

    const upButton = document.createElement('button');
    upButton.classList.add(
      'chatGPT-scroll-btn',
      'cursor-pointer',
      'absolute',
      'right-6',
      'z-10',
      'rounded-full',
      'border',
      'border-gray-200',
      'bg-gray-50',
      'text-gray-600',
      'dark:border-white/10',
      'dark:bg-white/10',
      'dark:text-gray-200',
    );
    upButton.style.cssText =
      'display: flex; align-items: center; justify-content: center; background-color: var(--main-surface-tertiary); color: var(--text-primary); opacity: 0.8; width: 25.33px; height: 25.33px; border-radius: 50%; position: fixed; top: 196px; right: 26px; z-index: 10000; transition: opacity 1s;';
    upButton.id = 'upButton';

    upButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-2xl" style="transform: scale(0.75);">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M15.1918 8.90615C15.6381 8.45983 16.3618 8.45983 16.8081 8.90615L21.9509 14.049C22.3972 14.4953 22.3972 15.2189 21.9509 15.6652C21.5046 16.1116 20.781 16.1116 20.3347 15.6652L17.1428 12.4734V22.2857C17.1428 22.9169 16.6311 23.4286 15.9999 23.4286C15.3688 23.4286 14.8571 22.9169 14.8571 22.2857V12.4734L11.6652 15.6652C11.2189 16.1116 10.4953 16.1116 10.049 15.6652C9.60265 15.2189 9.60265 14.4953 10.049 14.049L15.1918 8.90615Z" fill="currentColor"></path>
            </svg>
        `;

    upButton.onclick = () => {
      goUpOneMessage(upButton);
    };

    upButton.addEventListener('mouseover', () => {
      upButton.style.opacity = '1';
    });

    upButton.addEventListener('mouseleave', () => {
      upButton.style.transition = 'opacity 1s';
      upButton.style.opacity = '0.2';
    });

    setTimeout(() => {
      upButton.style.transition = 'opacity 1s';
      upButton.style.opacity = '0.2';
    }, delays.buttonFade);

    return upButton;
  }

  function getNextMessage(messages, currentScrollTop, messageThreshold) {
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].offsetTop > currentScrollTop + messageThreshold) {
        return messages[i];
      }
    }
    return null;
  }

  function goDownOneMessage(feedbackTarget = null) {
    resetScrollState();

    const messages = Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"]'));
    const scrollContainer = getScrollableContainer();
    if (!scrollContainer || messages.length === 0) return;

    gsap.set(scrollContainer, { scrollTo: '+=0' });
    gsap.killTweensOf(scrollContainer);

    const currentScrollTop = scrollContainer.scrollTop;

    // Offset values based on checkbox state
    const isBottom = window.moveTopBarToBottomCheckbox;
    const messageThreshold = isBottom ? 48 : 30;
    const scrollOffset = isBottom ? 43 : 25;

    const targetMessage = getNextMessage(messages, currentScrollTop, messageThreshold);

    if (targetMessage) {
      gsap.to(scrollContainer, {
        duration: 0.3,
        scrollTo: { y: targetMessage.offsetTop - scrollOffset },
        ease: 'power4.out',
      });
    } else {
      gsap.to(scrollContainer, {
        duration: 0.3,
        scrollTo: {
          y: scrollContainer.scrollHeight - scrollContainer.clientHeight,
        },
        ease: 'power4.out',
      });
    }

    if (feedbackTarget) feedbackAnimation(feedbackTarget);
  }

  function scrolldownbymessages(steps = 1, feedbackTarget = null) {
    resetScrollState();

    const messages = Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"]'));
    const scrollContainer = getScrollableContainer();
    if (!scrollContainer || messages.length === 0) return;

    gsap.set(scrollContainer, { scrollTo: '+=0' });
    gsap.killTweensOf(scrollContainer);

    const isBottom = window.moveTopBarToBottomCheckbox;
    const messageThreshold = isBottom ? 48 : 30;
    const scrollOffset = isBottom ? 43 : 25;

    // Use a local variable instead of reassigning the parameter
    const stepCount = Math.max(1, Math.floor(steps));

    let virtualTop = scrollContainer.scrollTop;
    let targetMessage = null;

    for (let i = 0; i < stepCount; i++) {
      const next = getNextMessage(messages, virtualTop, messageThreshold);
      if (!next) {
        targetMessage = null;
        break;
      }
      targetMessage = next;
      virtualTop = Math.max(0, targetMessage.offsetTop - scrollOffset);
    }

    if (targetMessage) {
      gsap.to(scrollContainer, {
        duration: 0.3,
        overwrite: 'auto',
        scrollTo: { y: virtualTop },
        ease: 'power4.out',
      });
    } else {
      gsap.to(scrollContainer, {
        duration: 0.3,
        overwrite: 'auto',
        scrollTo: {
          y: scrollContainer.scrollHeight - scrollContainer.clientHeight,
        },
        ease: 'power4.out',
      });
    }

    if (feedbackTarget) feedbackAnimation(feedbackTarget); // trigger immediately
  }

  function goDownTwoMessages(feedbackTarget = null) {
    scrolldownbymessages(2, feedbackTarget);
  }

  function createScrollDownButton() {
    // Same defensive return strategy as the up-button
    if (!window.showLegacyArrowButtonsCheckbox) {
      return null;
    }

    if (!(window.gsap && window.ScrollToPlugin)) {
      console.error('GSAP or ScrollToPlugin is missing.');
      return document.createComment('scroll-down-btn-no-gsap');
    }

    const downButton = document.createElement('button');
    downButton.classList.add(
      'chatGPT-scroll-btn',
      'cursor-pointer',
      'absolute',
      'right-6',
      'z-10',
      'rounded-full',
      'border',
      'border-gray-200',
      'bg-gray-50',
      'text-gray-600',
      'dark:border-white/10',
      'dark:bg-white/10',
      'dark:text-gray-200',
    );
    downButton.style.cssText =
      'display: flex; align-items: center; justify-content: center; background-color: var(--main-surface-tertiary); color: var(--text-primary); opacity: 0.8; width: 25.33px; height: 25.33px; border-radius: 50%; position: fixed; top: 228px; right: 26px; z-index: 10000; transition: opacity 1s;';
    downButton.id = 'downButton';

    downButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-2xl" style="transform: scale(0.75);">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M16.8081 23.0938C16.3618 23.5402 15.6381 23.5402 15.1918 23.0938L10.049 17.951C9.60265 17.5047 9.60265 16.7811 10.049 16.3348C10.4953 15.8884 11.219 15.8884 11.6653 16.3348L14.8571 19.5266V9.71429C14.8571 9.0831 15.3688 8.57143 15.9999 8.57143C16.6311 8.57143 17.1428 9.0831 17.1428 9.71429V19.5266L20.3347 16.3348C20.781 15.8884 21.5046 15.8884 21.9509 16.3348C22.3972 16.7811 22.3972 17.5047 21.9509 17.951L16.8081 23.0938Z" fill="currentColor"></path>
            </svg>
        `;

    downButton.onclick = () => {
      goDownOneMessage(downButton);
    };

    downButton.addEventListener('mouseover', () => {
      downButton.style.opacity = '1';
    });

    downButton.addEventListener('mouseleave', () => {
      downButton.style.transition = 'opacity 1s';
      downButton.style.opacity = '0.2';
    });

    setTimeout(() => {
      downButton.style.transition = 'opacity 1s';
      downButton.style.opacity = '0.2';
    }, delays.buttonFade);

    return downButton;
  }

  function feedbackAnimation(button) {
    // Reset any ongoing transitions to ensure a clean start
    button.style.transition = 'none';
    button.style.opacity = '1'; // Full opacity immediately
    button.style.transform = 'scale(0.8)'; // Shrink for feedback effect

    // Delay to allow the scale and opacity changes to settle
    setTimeout(() => {
      button.style.transition = 'transform 0.2s, opacity 2s'; // Add transitions
      button.style.transform = 'scale(1)'; // Restore size
      button.style.opacity = '0.2'; // Gradually fade to low opacity
    }, delays.feedbackDelay); // Start fading and scaling after a brief delay
  }

  // Helper to (re)inject arrow buttons in the DOM based on current settings
  function injectOrToggleArrowButtons() {
    // Remove any previous buttons (or comments)
    document.getElementById('upButton')?.remove();
    document.getElementById('downButton')?.remove();

    // New logic: if unchecked (false), do nothing (keep hidden)
    if (!window.showLegacyArrowButtonsCheckbox) return;

    // Add fresh buttons (will only show when the checkbox is checked)
    const upButton = createScrollUpButton();
    const downButton = createScrollDownButton();
    appendWithFragment(document.body, upButton, downButton);
  }

  // Wrap applyVisibilitySettings so every time it's called, it also (re)injects
  const _applyVisibilitySettings = window.applyVisibilitySettings;
  window.applyVisibilitySettings = (data) => {
    _applyVisibilitySettings(data);
    injectOrToggleArrowButtons();
  };

  // Initial settings load
  chrome.storage.sync.get(null, (data) => {
    window.applyVisibilitySettings(data); // Will now auto (re)inject buttons
  });

  const PLUS_BTN_SEL = '[data-testid="composer-plus-btn"]';

  // "More" submenu trigger (match by icon path, not text)
  const MORE_ICON_PATH_PREFIX = 'M15.498 8.50159';
  const MORE_TRIGGER_SEL = `div[role="menuitem"][aria-haspopup="menu"] svg path[d^="${MORE_ICON_PATH_PREFIX}"], div[role="menuitem"][aria-haspopup="menu"] svg use[href*="#f6d0e2"]`;

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  const smartClick = (el) => {
    if (!el) return;
    try {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dispatch = (type, Ctor) => {
        try {
          el.dispatchEvent(
            new Ctor(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              clientX: cx,
              clientY: cy,
            }),
          );
        } catch {
          /* ignore */
        }
      };
      if ('PointerEvent' in window) {
        dispatch('pointerover', PointerEvent);
        dispatch('pointerenter', PointerEvent);
        dispatch('pointerdown', PointerEvent);
      }
      dispatch('mouseover', MouseEvent);
      dispatch('mouseenter', MouseEvent);
      dispatch('mousedown', MouseEvent);
      // Natural order: release before activation
      if ('PointerEvent' in window) dispatch('pointerup', PointerEvent);
      dispatch('mouseup', MouseEvent);
      // Now activate the element
      el.click();
      if ('PointerEvent' in window) {
        dispatch('pointerout', PointerEvent);
        dispatch('pointerleave', PointerEvent);
      }
    } catch {
      try {
        el.click();
      } catch {
        /* ignore */
      }
    }
  };

  const sendKey = (el, key, code = key, keyCode = 0) => {
    const opts = {
      key,
      code,
      keyCode,
      which: keyCode || undefined,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    try {
      el.dispatchEvent(new KeyboardEvent('keydown', opts));
    } catch {}
    try {
      el.dispatchEvent(new KeyboardEvent('keyup', opts));
    } catch {}
  };

  const waitFor = async (getter, { timeout = 3000, interval = 50 } = {}) => {
    const start = Date.now();

    const poll = async () => {
      if (Date.now() - start >= timeout) return null;
      const res = getter();
      if (res) return res;
      await sleep(interval);
      return poll();
    };

    return poll();
  };

  // Helper: synthesize a small cluster of hover-like events to hint UI state.
  const dispatchHoverEvents = (el) => {
    const fire = (type, Ctor) => {
      try {
        const rect = el.getBoundingClientRect();
        el.dispatchEvent(
          new Ctor(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
          }),
        );
      } catch {
        /* ignore */
      }
    };
    if ('PointerEvent' in window) {
      fire('pointerover', PointerEvent);
      fire('pointerenter', PointerEvent);
      fire('pointermove', PointerEvent);
    }
    fire('mouseover', MouseEvent);
    fire('mouseenter', MouseEvent);
    fire('mousemove', MouseEvent);
  };

  // Helper: progressively try to expand a submenu using keys/clicks.
  const attemptExpand = async (el, delays) => {
    sendKey(el, 'ArrowRight', 'ArrowRight', 39);
    await sleep(delays.betweenKeyAttempts);
    if (el.getAttribute('aria-expanded') !== 'true') {
      sendKey(el, 'Enter', 'Enter', 13);
      await sleep(delays.betweenKeyAttempts);
    }
    if (el.getAttribute('aria-expanded') !== 'true') {
      sendKey(el, ' ', 'Space', 32);
      await sleep(delays.betweenKeyAttempts);
    }
    if (el.getAttribute('aria-expanded') !== 'true') {
      smartClick(el);
    }
  };

  // Helper: resolve the currently-open submenu element.
  const resolveOpenSubmenu = (submenuId) => {
    if (submenuId) {
      const el = document.getElementById(submenuId);
      if (el && el.getAttribute('data-state') === 'open') return el;
    }
    const open = getOpenMenus();
    return open.length ? open[open.length - 1] : null;
  };

  const openSubmenu = async (triggerEl, delays = DELAYS) => {
    if (!triggerEl) return null;

    const ariaControls = triggerEl.getAttribute('aria-controls') || '';
    const submenuId = ariaControls ? ariaControls : null;

    flashBorder(triggerEl);
    await sleep(delays.beforeSubmenuInteract);

    try {
      triggerEl.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }

    dispatchHoverEvents(triggerEl);
    await attemptExpand(triggerEl, delays);

    const submenuEl = await waitFor(() => resolveOpenSubmenu(submenuId), {
      timeout: delays.waitSubmenuEl,
    });

    return submenuEl;
  };

  const openComposerMenuAndMore = async (delays = DELAYS) => {
    const composer = document.querySelector('form[data-type="unified-composer"]');
    const plusBtn = composer?.querySelector(PLUS_BTN_SEL) || document.querySelector(PLUS_BTN_SEL);

    if (!plusBtn) return false;

    flashBorder(plusBtn);
    smartClick(plusBtn);

    await waitFor(() => getOpenMenus().length > 0, {
      timeout: delays.waitMenuOpen,
    }); // 1500ms
    await sleep(delays.afterPlusClick);

    let menus = getOpenMenus();
    let topMenu = menus[menus.length - 1];

    const moreTrigger = await waitFor(
      () => {
        menus = getOpenMenus();
        topMenu = menus[menus.length - 1];
        if (!topMenu) return null;
        const path = topMenu.querySelector(MORE_TRIGGER_SEL);
        if (path) return path.closest('div[role="menuitem"][aria-haspopup="menu"]');
        return topMenu.querySelector('div[role="menuitem"][aria-haspopup="menu"]');
      },
      { timeout: delays.waitSubmenuOpen },
    );

    if (moreTrigger) {
      await openSubmenu(moreTrigger, delays);
      await sleep(delays.afterSubmenuOpen);
    }

    return true;
  };

  const normalizeIconTokens = (tokens) =>
    Array.isArray(tokens) ? tokens.filter(Boolean) : [tokens];

  const buildIconSelector = (tokens) =>
    normalizeIconTokens(tokens)
      .map((token) => {
        const safe = String(token).replace(/(["\\])/g, '\\$1');
        return `svg path[d^="${safe}"], svg use[href*="${safe}"]`;
      })
      .join(', ');

  const findMenuItemByPath = (iconTokens, { rootMenus } = {}) => {
    // Match both menuitem and menuitemradio for maximum compatibility
    const sel = `div[role="menuitem"], div[role="menuitemradio"]`;
    const iconSelector = buildIconSelector(iconTokens);
    const menus = rootMenus?.length ? rootMenus : getOpenMenus();
    for (const menu of menus) {
      // Find all possible menu items
      const items = Array.from(menu.querySelectorAll(sel));
      // For each item, check if its icon matches the prefix
      for (const item of items) {
        const path = item.querySelector(iconSelector);
        if (path) return item;
      }
    }
    return null;
  };

  const runActionByIcon = async (iconPathPrefix, delays = DELAYS) => {
    const opened = await openComposerMenuAndMore(delays);
    if (!opened) return;
    const item = await waitFor(
      () => {
        const menus = getOpenMenus();
        if (!menus.length) return null;

        // Prefer top-most open menu first (likely the submenu), but also search the parent
        const [maybeSubmenu, maybeRoot] =
          menus.length > 1 ? [menus[menus.length - 1], menus[menus.length - 2]] : [menus[0], null];

        const foundSub = findMenuItemByPath(iconPathPrefix, { rootMenus: [maybeSubmenu] });
        if (foundSub) return foundSub;
        return maybeRoot ? findMenuItemByPath(iconPathPrefix, { rootMenus: [maybeRoot] }) : null;
      },
      {
        timeout: delays.waitActionItem,
      },
    );
    if (!item) return;
    flashBorder(item);
    await sleep(delays.beforeFinalClick);
    smartClick(item);
  };

  // ==== End Buried Button Shared helpers ================
  // ======================================================

  // ======================================================
  // ==== Exposed Button Click Shared helpers ============
  // Click a directly-visible button by SVG icon path prefix (no menus involved)
  const clickExposedIconButton = async (
    iconPathPrefix,
    {
      timeout = 2000,
      interval = 50,
      delays = DELAYS,
      root = document,
      pick = (paths) => paths[0], // customize if multiple matches
    } = {},
  ) => {
    const pathSelector = buildIconSelector(iconPathPrefix);

    const getClickableAncestor = (node) => {
      const isClickable = (el) =>
        el &&
        typeof el.click === 'function' &&
        (el.tagName === 'BUTTON' ||
          el.tagName === 'A' ||
          el.getAttribute('role') === 'button' ||
          el.tabIndex >= 0);
      let el = node;
      for (let i = 0; i < 8 && el; i++) {
        if (isClickable(el)) return el;
        el = el.parentElement;
      }
      return null;
    };

    const ensureVisible = (el) => {
      try {
        el.scrollIntoView({
          block: 'center',
          inline: 'center',
          behavior: 'auto',
        });
      } catch {}
    };

    const target = await waitFor(
      () => {
        const paths = Array.from(root.querySelectorAll(pathSelector));
        if (!paths.length) return null;
        const chosenPath = pick(paths) || paths[0];
        return getClickableAncestor(chosenPath);
      },
      { timeout, interval },
    );

    if (!target) return;

    ensureVisible(target);
    flashBorder(target);
    await sleep(delays.beforeFinalClick);
    smartClick(target);
  };

  // Clicks a button by its data-testid attribute, ensuring it's visible and interactable.
  const clickButtonByTestId = async (
    testId,
    {
      timeout = 2000,
      interval = 50,
      delays = DELAYS,
      root = document,
      pick = (btns) => btns[0], // if multiple, pick the first
    } = {},
  ) => {
    const buttonSelector = `[data-testid="${testId}"]`;

    const getClickableAncestor = (node) => {
      const isClickable = (el) =>
        el &&
        typeof el.click === 'function' &&
        (el.tagName === 'BUTTON' ||
          el.tagName === 'A' ||
          el.getAttribute('role') === 'button' ||
          el.tabIndex >= 0);
      let el = node;
      for (let i = 0; i < 8 && el; i++) {
        if (isClickable(el)) return el;
        el = el.parentElement;
      }
      return null;
    };

    const ensureVisible = (el) => {
      try {
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
      } catch {}
    };

    const target = await waitFor(
      () => {
        const btns = Array.from(root.querySelectorAll(buttonSelector));
        if (!btns.length) return null;
        const chosenBtn = pick(btns) || btns[0];
        return getClickableAncestor(chosenBtn);
      },
      { timeout, interval },
    );

    if (!target) return;

    ensureVisible(target);
    flashBorder(target);
    await sleep(delays.beforeFinalClick);
    smartClick(target);
  };

  // ==== End Exposed Button Click Shared helpers =========
  // ======================================================

  /* ===== Start clickLowestSvgThenSubItemSvg Reusable Radix menu helpers ===== */

  const DEFAULT_MENU_DELAYS = Object.freeze({
    MENU_READY_OPEN: 350,
    MENU_READY_EXPANDED: 250,
    ITEM_CLICK: 375,
    RETRY_INTERVAL: 25,
    MAX_RETRY_ATTEMPTS: 10,
  });

  const MENU_ITEM_ROLES =
    ':is(div[role="menuitem"], div[role="menuitemradio"], div[role="menuitemcheckbox"])';

  const toTokenArray = (tokenOrTokens) =>
    Array.isArray(tokenOrTokens) ? tokenOrTokens.filter(Boolean) : [tokenOrTokens].filter(Boolean);

  const svgSelectorForTokens = (tokenOrTokens) =>
    toTokenArray(tokenOrTokens)
      .map((token) => {
        const escapedPath = safeEsc(token);
        const escapedHref = String(token).replace(/(["\\])/g, '\\$1');
        return [`svg path[d^="${escapedPath}"]`, `svg use[href*="${escapedHref}"]`].join(', ');
      })
      .join(', ');

  const withPrefix = (selectorList, prefix) =>
    selectorList
      .split(',')
      .map((s) => `${prefix} ${s.trim()}`)
      .join(', ');

  const MENU_SELECTORS = {
    buttonPath: (tokenOrTokens) =>
      withPrefix(svgSelectorForTokens(tokenOrTokens), 'button[id^="radix-"]'),
    // Apply the icon filter to ALL role types via :is(...)
    menuItemPath: (tokenOrTokens) =>
      withPrefix(svgSelectorForTokens(tokenOrTokens), MENU_ITEM_ROLES),
    menuItemAncestor: MENU_ITEM_ROLES,
  };

  function safeEsc(s) {
    try {
      return CSS?.escape ? CSS.escape(s) : s;
    } catch (_) {
      return s;
    }
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    return r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw && isAboveComposer(r, el);
  }

  function lowestVisibleFromPaths(selector, ancestorSelector, excludeAncestorSelector) {
    const paths = Array.from(document.querySelectorAll(selector));
    const els = paths
      .map((p) => p.closest(ancestorSelector))
      .filter(Boolean)
      .filter(isVisible)
      .filter((el) => !excludeAncestorSelector || !el.closest(excludeAncestorSelector));
    return els.length ? els[els.length - 1] : null;
  }

  function simulateSpace(el) {
    for (const type of ['keydown', 'keyup']) {
      el.dispatchEvent(
        new KeyboardEvent(type, {
          key: ' ',
          code: 'Space',
          keyCode: 32,
          charCode: 32,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
    }
  }

  function openRadixMenuIfNeeded(buttonEl, delays = DEFAULT_MENU_DELAYS) {
    const expanded = buttonEl.getAttribute('aria-expanded') === 'true';
    if (!expanded) {
      buttonEl.focus();
      simulateSpace(buttonEl);
      return delays.MENU_READY_OPEN;
    }
    return delays.MENU_READY_EXPANDED;
  }

  function findLowestMenuItemByPathInMenu(menuEl, pathPrefix) {
    if (!menuEl) return null;
    const iconSelector = svgSelectorForTokens(pathPrefix);
    const icons = Array.from(menuEl.querySelectorAll(iconSelector));
    const candidates = icons
      .map((icon) => icon.closest(MENU_SELECTORS.menuItemAncestor))
      .filter(Boolean);

    if (!candidates.length) return null;

    const seen = new Set();
    const unique = [];
    for (const item of candidates) {
      if (seen.has(item)) continue;
      seen.add(item);
      unique.push(item);
    }

    unique.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return unique[unique.length - 1] || null;
  }

  function clickLowestVisibleMenuItemByPath(pathPrefix, options = {}, attempt = 0) {
    const { delays = DEFAULT_MENU_DELAYS, menuRootSelector } = options;
    const menuEl = menuRootSelector ? document.querySelector(menuRootSelector) : null;
    let item = null;
    if (menuRootSelector) {
      const menus = menuEl ? [menuEl] : getOpenMenus().slice().reverse();
      for (const menu of menus) {
        item = findLowestMenuItemByPathInMenu(menu, pathPrefix);
        if (item) break;
      }
    } else {
      const baseSelector = MENU_SELECTORS.menuItemPath(pathPrefix);
      item = lowestVisibleFromPaths(baseSelector, MENU_SELECTORS.menuItemAncestor);
    }
    if (item) {
      if (window.gsap && typeof flashBorder === 'function') flashBorder(item);
      setTimeout(() => smartClick(item), delays.ITEM_CLICK);
      return true;
    }
    if (attempt < delays.MAX_RETRY_ATTEMPTS) {
      setTimeout(
        () => clickLowestVisibleMenuItemByPath(pathPrefix, options, attempt + 1),
        delays.RETRY_INTERVAL,
      );
    }
    return false;
  }

  /**
   * Clicks the lowest visible menu button (optionally excluding ancestors), opens its menu if needed,
   * then clicks the lowest matching sub-item.
   * @param {string} firstBtnPathPrefix
   * @param {string} subItemPathPrefix
   * @param {string} [excludeAncestorSelector] - Selector string (e.g. "#bottomBarContainer") or omit/undefined
   * @param {object} [options] - Optional timing overrides
   */
  function clickLowestSvgThenSubItemSvg(
    firstBtnPathPrefix,
    subItemPathPrefix,
    excludeAncestorSelector,
    options = {},
  ) {
    const delays = { ...DEFAULT_MENU_DELAYS, ...(options.delays || {}) };

    const btnSelector = MENU_SELECTORS.buttonPath(firstBtnPathPrefix);
    const btn = lowestVisibleFromPaths(btnSelector, 'button', excludeAncestorSelector);
    if (!btn) return false;

    if (window.gsap && typeof flashBorder === 'function') flashBorder(btn);

    const waitMs = openRadixMenuIfNeeded(btn, delays);

    const menuRootSelector =
      options.menuRootSelector ||
      (btn.id
        ? `[role="menu"][aria-labelledby="${safeEsc(btn.id)}"][data-state="open"]`
        : null);

    setTimeout(() => {
      clickLowestVisibleMenuItemByPath(subItemPathPrefix, { delays, menuRootSelector });
    }, waitMs);

    return true;
  }

  /* ===== End clickLowestSvgThenSubItemSvg Reusable Radix menu helpers ===== */

  /* ===== Extra helpers: click sub-item by id or id prefix ===== */

  function findLowestVisibleMenuItemByIdOrPrefix(idOrPrefix, { prefix = true } = {}) {
    const selector = prefix ? `[id^="${safeEsc(idOrPrefix)}"]` : `#${safeEsc(idOrPrefix)}`;
    const candidates = Array.from(document.querySelectorAll(selector));
    const items = candidates
      .map(
        (el) => el.closest('div[role="menuitem"],button[role="menuitem"],[role="menuitem"]') || el,
      )
      .filter(isVisible);
    return items.length ? items[items.length - 1] : null;
  }

  function clickLowestVisibleMenuItemByIdOrPrefix(idOrPrefix, options = {}, attempt = 0) {
    const { delays = DEFAULT_MENU_DELAYS, prefix = true } = options;
    const item = findLowestVisibleMenuItemByIdOrPrefix(idOrPrefix, { prefix });
    if (item) {
      if (window.gsap && typeof flashBorder === 'function') flashBorder(item);
      setTimeout(() => item.click(), delays.ITEM_CLICK);
      return true;
    }
    if (attempt < delays.MAX_RETRY_ATTEMPTS) {
      setTimeout(
        () => clickLowestVisibleMenuItemByIdOrPrefix(idOrPrefix, options, attempt + 1),
        delays.RETRY_INTERVAL,
      );
    }
    return false;
  }

  // biome-ignore lint/correctness/noUnusedVariables: allow unused function for now
  function clickLowestSvgThenSubItemById(firstBtnPathPrefix, idOrPrefix, options = {}) {
    const delays = { ...DEFAULT_MENU_DELAYS, ...(options.delays || {}) };
    const btn = lowestVisibleFromPaths(MENU_SELECTORS.buttonPath(firstBtnPathPrefix), 'button');
    if (!btn) return false;

    if (window.gsap && typeof flashBorder === 'function') flashBorder(btn);
    const waitMs = openRadixMenuIfNeeded(btn, delays);

    setTimeout(() => {
      clickLowestVisibleMenuItemByIdOrPrefix(idOrPrefix, { ...options, delays });
    }, waitMs);

    return true;
  }
  /* ===== End extra helpers ===== */

  /* ===== Helpers: Regenerate, “Ask to change response" Helpers focus a Radix dropdown input ===== */

  function placeCaret(input, { caret = 'end', selectAll = false } = {}) {
    const len = input.value?.length ?? 0;
    if (selectAll) {
      input.setSelectionRange(0, len);
    } else if (caret === 'start') {
      input.setSelectionRange(0, 0);
    } else {
      input.setSelectionRange(len, len);
    }
  }

  function focusLowestVisibleInputBySelector(selector, options = {}, attempt = 0) {
    const { delays = DEFAULT_MENU_DELAYS, caret = 'end', selectAll = false } = options;
    const inputs = Array.from(document.querySelectorAll(selector)).filter(isVisible);
    const target = inputs.length ? inputs[inputs.length - 1] : null;

    if (target) {
      if (window.gsap && typeof flashBorder === 'function') flashBorder(target);
      try {
        target.scrollIntoView({ block: 'center', behavior: 'instant' });
      } catch (_) {}
      target.removeAttribute?.('disabled');
      target.focus({ preventScroll: true });
      placeCaret(target, { caret, selectAll });
      return true;
    }

    if (attempt < delays.MAX_RETRY_ATTEMPTS) {
      setTimeout(
        () => focusLowestVisibleInputBySelector(selector, options, attempt + 1),
        delays.RETRY_INTERVAL,
      );
    }
    return false;
  }

  function runRadixMenuActionFocusInput(firstBtnPathPrefix, inputSelector, options = {}) {
    const delays = { ...DEFAULT_MENU_DELAYS, ...(options.delays || {}) };
    const btn = lowestVisibleFromPaths(MENU_SELECTORS.buttonPath(firstBtnPathPrefix), 'button');
    if (!btn) return false;

    if (window.gsap && typeof flashBorder === 'function') flashBorder(btn);
    const waitMs = openRadixMenuIfNeeded(btn, delays);

    setTimeout(() => {
      focusLowestVisibleInputBySelector(inputSelector, { ...options, delays });
    }, waitMs);

    return true;
  }

  function runRadixMenuActionFocusInputByName(firstBtnPathPrefix, inputName, options = {}) {
    const sel = `input[name="${safeEsc(inputName)}"]`;
    return runRadixMenuActionFocusInput(firstBtnPathPrefix, sel, options);
  }
  /* ===== End input focus helpers ===== */

  // Click Model by Label helper
  window.pressModelMenuItemByText = (needle) => {
    // Looks for any open menu (main or submenu) and clicks the first item containing the needle (case-insensitive)
    if (!needle) return false;
    const menus = Array.from(
      document.querySelectorAll('[data-radix-menu-content][data-state="open"]'),
    );
    const lowerNeedle = needle.toLowerCase();
    for (const menu of menus) {
      const items = Array.from(
        menu.querySelectorAll('[role="menuitem"][data-radix-collection-item]'),
      );
      for (const item of items) {
        const s = (item.textContent || '').toLowerCase();
        if (s.includes(lowerNeedle)) {
          item.click();
          return true;
        }
      }
    }
    return false;
  };

  /* ===== Toggle Dictation Helpers: click a single visible button by SVG path (simplified) ===== */

  const CLICKABLE_SELECTOR =
    'button, a, [role="button"], [tabindex], input[type="button"], input[type="submit"]';

  const escCss = (s) => CSS?.escape?.(s) ?? s;

  if (typeof safeClick !== 'function') {
    // biome-ignore lint/correctness/noUnusedVariables: allow unused function for now
    function safeClick(el) {
      if (!el || el.disabled || el.getAttribute?.('aria-disabled') === 'true') return false;
      try {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      } catch (_) {
        try {
          el.click();
          return true;
        } catch {
          return false;
        }
      }
    }
  }

  function findClickableBySvgPath(pathPrefix, climbMax = 8) {
    const tokens = toTokenArray(pathPrefix);
    let node = null;

    for (const token of tokens) {
      node =
        document.querySelector(`svg path[d^="${escCss(token)}"]`) ||
        document.querySelector(`svg use[href*="${token.replace(/(["\\])/g, '\\$1')}"]`);
      if (node) break;
    }
    if (!node) return null;

    // Prefer a direct closest() to a standard clickable
    const direct = node.closest(CLICKABLE_SELECTOR);
    if (direct) return direct;

    // Fallback: climb up a few levels to find something clickable
    let el = node;
    for (let i = 0; i < climbMax && el; i++) {
      if (el.matches?.(CLICKABLE_SELECTOR)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function clickBySvgPath(pathPrefix) {
    const el = findClickableBySvgPath(pathPrefix);
    if (!el) return false;
    if (window.gsap && typeof flashBorder === 'function') flashBorder(el);
    return safeClick(el);
  }
  /* ===== End simplified helpers ===== */

  // delayCall: calls a function after a delay with arguments
  function delayCall(fn, ms, ...args) {
    setTimeout(() => fn(...args), ms);
  }

  /* ===== End helpers ===== */

  // ========================================================================
  // ==== BEGIN Click Lowest Using SVG (Copy Lowest, etc) Helpers============
  /* ---------- Copy flow helpers (DOM + action orchestration) ---------- */

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  // copy-lowest run coordination to avoid overlapping delays
  let copyLowestRunToken = 0;
  const copyLowestDelayCancels = new Set();

  const cancelCopyLowestDelays = () => {
    copyLowestDelayCancels.forEach((fn) => {
      try {
        fn();
      } catch {
        /* noop */
      }
    });
    copyLowestDelayCancels.clear();
  };

  const delayCopyLowest = (ms, runToken) =>
    new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        copyLowestDelayCancels.delete(cancel);
        resolve(runToken === copyLowestRunToken);
      }, ms);
      const cancel = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        copyLowestDelayCancels.delete(cancel);
        resolve(false);
      };
      copyLowestDelayCancels.add(cancel);
    });

  const isFullyInViewport = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= vh &&
      rect.right <= vw &&
      isAboveComposer(rect, el)
    );
  };

  const findButtonsBySvgPathPrefix = (tokenOrTokens) => {
    if (!tokenOrTokens) return [];
    const selector = withPrefix(svgSelectorForTokens(tokenOrTokens), 'button');
    const matches = Array.from(document.querySelectorAll(selector)).map((el) =>
      el.closest('button'),
    );
    return matches.filter(Boolean);
  };

  const getVisibleCopyButtonsSorted = (tokenOrTokens) => {
    const set = new Set();
    const push = (list = []) => {
      list.forEach((el) => {
        if (el) set.add(el);
      });
    };

    // Primary: test-id buttons
    push(Array.from(document.querySelectorAll('button[data-testid="copy-turn-action-button"]')));
    // Secondary: icon-based matches
    push(findButtonsBySvgPathPrefix(tokenOrTokens));

    const arr = Array.from(set).filter((btn) => isFullyInViewport(btn));
    arr.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    return arr;
  };

  async function copyFromLowestButton(dPrefix, opts = {}) {
    const { delayBeforeClick = 350, delayClipboardRead = 350 } = opts;

    cancelCopyLowestDelays();
    const runToken = ++copyLowestRunToken;

    const buttons = getVisibleCopyButtonsSorted(dPrefix);
    if (!buttons.length) return;

    const now = Date.now();
    const RECENT_MS = 1500;
    const last = window.__copyLowestState || {};
    let target = buttons[buttons.length - 1]; // lowest visible by default

    const tokensKey = toTokenArray(dPrefix).join('|');
    const isRecent = last.time && now - last.time <= RECENT_MS && last.tokensKey === tokensKey;

    if (isRecent) {
      const prevIdx = last.el ? buttons.indexOf(last.el) : -1;
      if (prevIdx >= 0 && buttons.length) {
        // Move one up; wrap back to the lowest when we were at the highest.
        const nextIdx = (prevIdx - 1 + buttons.length) % buttons.length;
        target = buttons[nextIdx];
      }
    }

    window.__copyLowestState = { time: now, el: target, tokensKey };

    const btn = target;

    const isMsgCopy = btn.getAttribute('data-testid') === 'copy-turn-action-button';

    if (window.gsap && typeof window.flashBorder === 'function') {
      window.flashBorder(btn);
    }

    const shouldClick = await delayCopyLowest(delayBeforeClick, runToken);
    if (!shouldClick || runToken !== copyLowestRunToken) return;
    btn.click();
    const shouldRead = await delayCopyLowest(delayClipboardRead, runToken);
    if (!shouldRead || runToken !== copyLowestRunToken) return;

    if (!navigator.clipboard || !navigator.clipboard.readText || !navigator.clipboard.writeText)
      return;

    try {
      if (runToken !== copyLowestRunToken) return;
      const text = await navigator.clipboard.readText();
      if (runToken !== copyLowestRunToken) return;
      const processed = sanitizeCopiedText(text, { isMsgCopy });
      if (runToken !== copyLowestRunToken) return;
      await navigator.clipboard.writeText(processed);
    } catch {
      /* silent */
    }
  }

  /* ---------- Copy text transformers (pure helpers) ---------- */

  function removeMarkdownOnCopyEnabled() {
    return (
      typeof window.removeMarkdownOnCopyCheckbox !== 'undefined' &&
      !!window.removeMarkdownOnCopyCheckbox
    );
  }

  function sanitizeCopiedText(text, { isMsgCopy = false } = {}) {
    if (!text) return text;

    if (isMsgCopy && removeMarkdownOnCopyEnabled()) {
      const stripFn =
        typeof window !== 'undefined' && typeof window.stripMarkdownOutsideCodeblocks === 'function'
          ? window.stripMarkdownOutsideCodeblocks
          : typeof stripMarkdownOutsideCodeblocks === 'function'
            ? stripMarkdownOutsideCodeblocks
            : null;

      if (stripFn) {
        const processed = stripFn(text);

        // Failsafe: if any fenced OR inline code changed, prefer original.
        try {
          const getCodes = (s) =>
            splitByCodeFences(s)
              .filter((seg) => seg.isCode || seg.isInline)
              .map((seg) => seg.text)
              .join('\n§\n');
          if (getCodes(text) !== getCodes(processed)) {
            console.warn('[copy] Code changed during sanitize; returning original text.');
            return text;
          }
        } catch {
          return text;
        }
        return processed;
      }
    }

    // Default: do nothing if toggle is off or function unavailable.
    return text;
  }

  // ==== END Click Lowest Using SVG (Copy Lowest, etc) Helpers============
  // ==================================================================

  // ======================================================
  // ==== Shortcut Helpers============

  // ─────────────────────────────────────────────────────────────────────────────
  // Markdown fence constants (SINGLE source of truth; used by splitByCodeFences)
  // - Up to 3 leading spaces
  // - 3+ backticks or tildes
  // - Info string captured but not required
  // Note: closing fence may be same char with length >= opening (handled in logic)
  // ─────────────────────────────────────────────────────────────────────────────
  const FENCE_RE = /^[ \t]{0,3}([`~]{3,})([^\n`~]*)?$/;
  // ─────────────────────────────────────────────────────────────────────────────

  function safeClick(el) {
    if (!el) return false;
    if (el.offsetParent === null) return false;
    try {
      el.click();
      return true;
    } catch {
      return false;
    }
  }

  // @note Keyboard shortcut defaults
  chrome.storage.sync.get(
    [
      'shortcutKeyScrollUpOneMessage',
      'shortcutKeyScrollDownOneMessage',
      'shortcutKeyScrollUpTwoMessages',
      'shortcutKeyScrollDownTwoMessages',
      'shortcutKeyCopyLowest',
      'shortcutKeyEdit',
      'shortcutKeySendEdit',
      'shortcutKeyCopyAllCodeBlocks',
      'shortcutKeyClickNativeScrollToBottom',
      'shortcutKeyScrollToTop',
      'shortcutKeyNewConversation',
      'shortcutKeySearchConversationHistory',
      'shortcutKeyToggleSidebar',
      'shortcutKeyActivateInput',
      'shortcutKeySearchWeb',
      'shortcutKeyPreviousThread',
      'shortcutKeyNextThread',
      'selectThenCopy',
      'shortcutKeyClickSendButton',
      'shortcutKeyClickStopButton',
      'shortcutKeyToggleModelSelector',
      'shortcutKeyRegenerateTryAgain',
      'shortcutKeyRegenerateMoreConcise',
      'shortcutKeyRegenerateAddDetails',
      'shortcutKeyRegenerateWithDifferentModel',
      'shortcutKeyRegenerateAskToChangeResponse',
      'shortcutKeyMoreDotsReadAloud',
      'shortcutKeyMoreDotsBranchInNewChat',
      'altPageUp',
      'altPageDown',
      'shortcutKeyTemporaryChat',
      'shortcutKeyStudy',
      'shortcutKeyCreateImage',
      'shortcutKeyToggleCanvas',
      'shortcutKeyToggleDictate',
      'shortcutKeyCancelDictation',
      'shortcutKeyShare',
      'shortcutKeyThinkLonger',
      'shortcutKeyAddPhotosFiles',
      'selectThenCopyAllMessages',
      'shortcutKeyThinkingExtended',
      'shortcutKeyThinkingStandard',
      'shortcutKeyNewGptConversation',
    ],
    (data) => {
      const shortcutDefaults = {
        shortcutKeyScrollUpOneMessage: 'a',
        shortcutKeyScrollDownOneMessage: 'f',
        shortcutKeyScrollUpTwoMessages: '↑',
        shortcutKeyScrollDownTwoMessages: '↓',
        shortcutKeyCopyLowest: 'c',
        shortcutKeyEdit: 'e',
        shortcutKeySendEdit: 'd',
        shortcutKeyCopyAllCodeBlocks: ']',
        shortcutKeyClickNativeScrollToBottom: 'z',
        shortcutKeyScrollToTop: 't',
        shortcutKeyNewConversation: 'n',
        shortcutKeySearchConversationHistory: 'k',
        shortcutKeyToggleSidebar: 's',
        shortcutKeyActivateInput: 'w',
        shortcutKeySearchWeb: 'q',
        shortcutKeyPreviousThread: 'j',
        shortcutKeyNextThread: ';',
        selectThenCopy: 'x',
        shortcutKeyClickSendButton: 'Enter',
        shortcutKeyClickStopButton: 'Backspace',
        shortcutKeyToggleModelSelector: '/',
        shortcutKeyRegenerateTryAgain: 'r',
        shortcutKeyRegenerateMoreConcise: '',
        shortcutKeyRegenerateAddDetails: '',
        shortcutKeyRegenerateWithDifferentModel: '',
        shortcutKeyRegenerateAskToChangeResponse: '',
        shortcutKeyMoreDotsReadAloud: '',
        shortcutKeyMoreDotsBranchInNewChat: '',
        altPageUp: 'PageUp',
        altPageDown: 'PageDown',
        shortcutKeyTemporaryChat: 'p',
        shortcutKeyStudy: '',
        shortcutKeyCreateImage: '',
        shortcutKeyToggleCanvas: '',
        shortcutKeyToggleDictate: 'y',
        shortcutKeyCancelDictation: '',
        shortcutKeyShare: '',
        shortcutKeyThinkLonger: '',
        shortcutKeyAddPhotosFiles: '',
        selectThenCopyAllMessages: '[',
        shortcutKeyThinkingExtended: '',
        shortcutKeyThinkingStandard: '',
        shortcutKeyNewGptConversation: '',
      };

      const shortcuts = {};
      for (const key in shortcutDefaults) {
        if (Object.hasOwn(data, key)) {
          // Preserve explicit user-provided values, including empty strings
          shortcuts[key] = data[key];
        } else {
          shortcuts[key] = shortcutDefaults[key];
        }
      }

      const modelToggleKey = shortcuts.shortcutKeyToggleModelSelector.toLowerCase();

      const isMac = isMacPlatform();

      // Robust fenced-code splitter (character-level).
      // - Treats any run of 3+ ` or ~ as a fence, even if not isolated on its own line.
      // - Closing fence must use the same char and have length >= opening run.
      // - Code regions (including their fences) are emitted verbatim, unmodified.
      // Robust fenced-code splitter (character-level).
      // - Treat any run of 3+ ` or ~ as a fence, even mid-line (e.g., "You set:```cmd").
      // - Closing fence must use the same char and have length >= opening run.
      // - Code regions (including their fences) are emitted verbatim, unmodified.
      // Split into regions while preserving fenced code and inline `code` spans.
      // Emits segments like { text, isCode: boolean, isInline: boolean }
      function splitByCodeFences(text) {
        const regions = [];
        const n = text.length;

        let i = 0;
        let last = 0;

        // Fenced-code state
        let inFence = false;
        let fenceChar = '';
        let fenceLen = 0;
        let fenceStart = -1;

        // Inline-code state (backticks only)
        let inInline = false;
        let inlineLen = 0; // 1 or 2 backticks
        let inlineStart = -1;

        const runLenFrom = (pos, ch) => {
          let k = pos;
          while (k < n && text[k] === ch) k += 1;
          return k - pos;
        };

        // Optional spec fence check using your top-level FENCE_RE
        const isSpecFenceAt = (pos, run) => {
          const re =
            typeof getFenceRe === 'function'
              ? getFenceRe()
              : typeof FENCE_RE !== 'undefined'
                ? FENCE_RE
                : null;
          if (!re) return run >= 3; // generous fallback
          const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
          let lineEnd = text.indexOf('\n', pos);
          if (lineEnd === -1) lineEnd = n;
          return re.test(text.slice(lineStart, lineEnd));
        };

        while (i < n) {
          const ch = text[i];

          // Opening fences or inline code (when not already inside one)
          if (!inFence && !inInline && (ch === '`' || ch === '~')) {
            const run = runLenFrom(i, ch);

            // Fenced code: 3+ backticks or tildes, accepted even mid-line (chat export sometimes inlines fences)
            if (run >= 3) {
              if (isSpecFenceAt(i, run) || run >= 3) {
                if (i > last)
                  regions.push({ text: text.slice(last, i), isCode: false, isInline: false });

                inFence = true;
                fenceChar = ch;
                fenceLen = run;
                fenceStart = i;

                // Include any trailing info string on the opening line in the fenced region
                i += run;
                while (i < n && text[i] !== '\n') i += 1;
                continue;
              }
            }

            // Inline code: 1 or 2 backticks (Markdown allows multi-backtick spans; triple is treated as fence above)
            if (ch === '`' && (run === 1 || run === 2)) {
              if (i > last)
                regions.push({ text: text.slice(last, i), isCode: false, isInline: false });
              inInline = true;
              inlineLen = run;
              inlineStart = i;
              i += run;
              continue;
            }
          }

          // Closing inline code
          if (inInline) {
            if (text[i] === '`') {
              const run = runLenFrom(i, '`');
              if (run === inlineLen) {
                const end = i + run;
                regions.push({ text: text.slice(inlineStart, end), isCode: true, isInline: true });
                i = end;
                last = end;
                inInline = false;
                inlineLen = 0;
                inlineStart = -1;
                continue;
              }
            }
            i += 1;
            continue;
          }

          // Closing fenced code
          if (inFence) {
            if (ch === fenceChar) {
              const run = runLenFrom(i, fenceChar);
              if (run >= fenceLen) {
                const end = i + run;
                regions.push({ text: text.slice(fenceStart, end), isCode: true, isInline: false });
                i = end;
                last = end;
                inFence = false;
                fenceChar = '';
                fenceLen = 0;
                fenceStart = -1;
                continue;
              }
            }
            i += 1;
            continue;
          }

          // Normal text
          i += 1;
        }

        // Flush tail
        if (inFence && fenceStart >= 0) {
          regions.push({ text: text.slice(fenceStart), isCode: true, isInline: false });
        } else if (inInline && inlineStart >= 0) {
          // Unmatched inline opener: treat rest as inline code to avoid mangling
          regions.push({ text: text.slice(inlineStart), isCode: true, isInline: true });
        } else if (last < n) {
          regions.push({ text: text.slice(last), isCode: false, isInline: false });
        }

        return regions;
      }

      function stripMarkdownOutsideCodeblocks(text) {
        return splitByCodeFences(text)
          .map((seg) =>
            seg.isCode || seg.isInline ? seg.text : removeMarkdown(seg.text, { trimResult: false }),
          )
          .join('');
      }

      function removeMarkdown(text, { trimResult = true } = {}) {
        const result = text
          // Images: ![alt](url) → alt
          .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
          // Links: [text](url) → text
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          // Bold: **text** or __text__ (only when not inside words)
          .replace(/(^|[^\w\\])\*\*(.*?)\*\*(?!\w)/g, '$1$2')
          .replace(/(^|[^\w])__(.*?)__(?!\w)/g, '$1$2')
          // Italic: *text* or _text_ (only when not inside words)
          .replace(/(^|[^\w\\])\*(.*?)\*(?!\w)/g, '$1$2')
          .replace(/(^|[^\w])_(.*?)_(?!\w)/g, '$1$2')
          // Fallback: strip any remaining bold markers
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/__(.*?)__/g, '$1')
          // Headings
          .replace(/^\s{0,3}#{1,6}\s+/gm, '')
          // Blockquotes
          .replace(/^\s{0,3}>\s?/gm, '')
          // Ordered / unordered lists (preserve indentation)
          .replace(/^([ \t]*)(\d+)\.\s+/gm, '$1$2. ')
          .replace(/^([ \t]*)[-*+]\s+/gm, '$1- ')
          // Horizontal rules
          .replace(/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/gm, '')
          // Collapse extra blank lines
          .replace(/\n{3,}/g, '\n\n')
          // Strip any remaining stray bold markers (e.g., split across inline code)
          .replace(/\*\*/g, '')
          .replace(/__/g, '')
          // Unescape common escapes
          .replace(/\\([_*[\](){}#+\-!.>])/g, '$1');

        return trimResult ? result.trim() : result;
      }

      // Expose helpers globally so sanitizeCopiedText can find them in MV3 scope
      if (typeof window !== 'undefined') {
        if (
          typeof window.splitByCodeFences !== 'function' &&
          typeof splitByCodeFences === 'function'
        ) {
          window.splitByCodeFences = splitByCodeFences;
        }
        if (typeof window.removeMarkdown !== 'function' && typeof removeMarkdown === 'function') {
          window.removeMarkdown = removeMarkdown;
        }
        if (
          typeof window.stripMarkdownOutsideCodeblocks !== 'function' &&
          typeof stripMarkdownOutsideCodeblocks === 'function'
        ) {
          window.stripMarkdownOutsideCodeblocks = stripMarkdownOutsideCodeblocks;
        }
      }

      const keyFunctionMappingCtrl = {
        Enter: () => {
          try {
            document.querySelector('button[data-testid="send-button"]')?.click();
          } catch (e) {
            console.error('Enter handler failed:', e);
          }
        },
        Backspace: () => {
          try {
            const btn = getVisibleStopButton();
            btn?.click();
          } catch (e) {
            console.error('Backspace handler failed:', e);
          }
        },
      };

      let dictateInProgress = false;

      // @note Alt Key Function Maps
      const keyFunctionMappingAlt = {
        [shortcuts.shortcutKeyScrollUpOneMessage]: () => {
          const upButton = document.getElementById('upButton');
          if (upButton) {
            upButton.click();
            // feedbackAnimation is already called inside the click handler, so this is redundant.
          } else {
            goUpOneMessage(); // Call the scroll function directly, no feedback since no button.
          }
        },
        [shortcuts.shortcutKeyScrollDownOneMessage]: () => {
          const downButton = document.getElementById('downButton');
          if (downButton) {
            downButton.click(); // feedback is triggered in the click handler
          } else {
            goDownOneMessage(); // function is available even when button is hidden
          }
        },
        [shortcuts.shortcutKeyScrollUpTwoMessages]: () => {
          const upButton = document.getElementById('upButton');
          goUpTwoMessages(upButton || null);
        },
        [shortcuts.shortcutKeyScrollDownTwoMessages]: () => {
          const downButton = document.getElementById('downButton');
          goDownTwoMessages(downButton || null);
        },
        [shortcuts.shortcutKeyCopyAllCodeBlocks]: copyCode,
        [shortcuts.shortcutKeyCopyLowest]: () => {
          const copyPath = ['M12.668 10.667C12.668', '#ce3544'];
          copyFromLowestButton(copyPath, {
            delayBeforeClick: 350,
            delayClipboardRead: 350,
          });
        },
        // @note shortcutKeyEDIT
        [shortcuts.shortcutKeyEdit]: () => {
          // Centralized timing constants (all halved from original)
          const DELAY_SAFE_CLICK = 200; // after scroll, before click
          const GSAP_SCROLL_DURATION = 0.2; // smooth scroll duration with GSAP
          const DELAY_FALLBACK_FINISH = 125; // fallback delay if GSAP unavailable
          const DELAY_INITIAL_SCAN = 25; // initial wait before scanning buttons

          // always scroll to center if possible, clamp if not
          const gsapScrollToCenterAndClick = (button) => {
            if (!button || !button.isConnected || typeof button.click !== 'function') return;

            let container = window;
            try {
              if (typeof getScrollableContainer === 'function') {
                const candidate = getScrollableContainer();
                if (candidate && candidate instanceof Element && candidate.isConnected) {
                  container = candidate;
                }
              }
            } catch {}

            let contTop = 0;
            let contHeight = window.innerHeight;
            if (container !== window) {
              try {
                const cr = container.getBoundingClientRect();
                contTop = cr.top;
                contHeight = container.clientHeight;
              } catch {}
            }

            const rect = button.getBoundingClientRect();
            const offsetCenter = (contHeight - rect.height) / 2;

            let targetY =
              container === window
                ? window.scrollY + rect.top - offsetCenter
                : container.scrollTop + (rect.top - contTop) - offsetCenter;

            const maxScroll =
              container === window
                ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
                : Math.max(0, container.scrollHeight - container.clientHeight);

            targetY = Math.max(0, Math.min(targetY, maxScroll));

            const safeClick = () => {
              const canClick = button?.isConnected && typeof button?.click === 'function';
              if (!canClick) return;
              try {
                button.click();
              } catch {}
            };

            const finish = () => {
              try {
                if (typeof flashBorder === 'function') flashBorder(button);
              } catch {}
              setTimeout(safeClick, DELAY_SAFE_CLICK);
            };

            const animateWithGsap = () => {
              try {
                if (!window.gsap) return false;
                const hasScrollTo =
                  (gsap.plugins && (gsap.plugins.scrollTo || gsap.plugins.ScrollToPlugin)) ||
                  typeof ScrollToPlugin !== 'undefined';
                if (!hasScrollTo) return false;

                gsap.to(container, {
                  duration: GSAP_SCROLL_DURATION,
                  scrollTo: { y: targetY, autoKill: true },
                  ease: 'power4.out',
                  onComplete: finish,
                });
                return true;
              } catch {
                return false;
              }
            };

            if (!animateWithGsap()) {
              try {
                if (container === window) {
                  window.scrollTo({ top: targetY, behavior: 'smooth' });
                } else if (typeof container.scrollTo === 'function') {
                  container.scrollTo({ top: targetY, behavior: 'smooth' });
                } else {
                  container.scrollTop = targetY;
                }
              } catch {
                if (container === window) window.scrollTo(0, targetY);
                else container.scrollTop = targetY;
              }
              setTimeout(finish, DELAY_FALLBACK_FINISH);
            }
          };

          setTimeout(() => {
            try {
              const EDIT_ICON_TOKENS = ['M11.3312 3.56837C12.7488', '#6d87e1'];
              const editSelectors = [
                'button[aria-label="Edit message"]',
                withPrefix(svgSelectorForTokens(EDIT_ICON_TOKENS), 'button'),
              ];

              const allButtons = Array.from(
                new Set(
                  editSelectors
                    .flatMap((sel) =>
                      Array.from(document.querySelectorAll(sel)).map(
                        (node) => node.closest('button') || node,
                      ),
                    )
                    .filter(Boolean),
                ),
              );

              const filteredButtonsData = allButtons
                .filter((btn) => btn !== null)
                .map((btn) => {
                  const rect = btn.getBoundingClientRect();
                  return { btn, rect };
                })
                .filter(({ btn, rect }) => isAboveComposer(rect, btn));

              filteredButtonsData.sort((a, b) => a.rect.top - b.rect.top);

              const inViewport = filteredButtonsData.filter(
                ({ rect }) =>
                  rect.bottom > 0 &&
                  rect.right > 0 &&
                  rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
                  rect.left < (window.innerWidth || document.documentElement.clientWidth),
              );

              let targetButton = null;
              if (inViewport.length > 0) {
                const target = inViewport.reduce((bottomMost, current) =>
                  current.rect.top > bottomMost.rect.top ? current : bottomMost,
                );
                targetButton = target.btn;
              } else {
                const aboveViewport = filteredButtonsData.filter(({ rect }) => rect.bottom < 0);
                if (aboveViewport.length > 0) {
                  const target = aboveViewport.reduce((closest, current) =>
                    current.rect.bottom > closest.rect.bottom ? current : closest,
                  );
                  targetButton = target.btn;
                }
              }

              if (targetButton) {
                gsapScrollToCenterAndClick(targetButton);
              }
            } catch {}
          }, DELAY_INITIAL_SCAN);
        },
        [shortcuts.shortcutKeySendEdit]: () => {
          try {
            // Centralized timing constant
            const DELAY_BEFORE_CLICK = 250; // was 500ms

            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

            const isVisible = (btn) => {
              if (!btn || btn.disabled) return false;
              if (btn.closest('[aria-hidden="true"]')) return false;
              const style = window.getComputedStyle(btn);
              if (
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                style.opacity === '0'
              )
                return false;
              const rect = btn.getBoundingClientRect();
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.bottom > 0 &&
                rect.right > 0 &&
                rect.top < viewportHeight &&
                rect.left < viewportWidth &&
                isAboveComposer(rect, btn)
              );
            };

            const getButtonLabel = (btn) =>
              (
                btn?.textContent ||
                btn?.innerText ||
                btn?.getAttribute?.('aria-label') ||
                ''
              ).trim();

            const findEditSendButton = (row) => {
              if (!row) return null;
              const buttons = Array.from(row.querySelectorAll('button'));
              if (!buttons.length) return null;

              const hasCancel = buttons.some((btn) => /cancel/i.test(getButtonLabel(btn)));
              if (!hasCancel) return null;

              const sendBtn =
                buttons.find((btn) => /send/i.test(getButtonLabel(btn))) ||
                buttons[1] ||
                buttons[0];

              return sendBtn || null;
            };

            // Prefer send buttons tied to active edit textareas (ChatGPT now renders edits with a textarea)
            const textareaSendButtons = Array.from(document.querySelectorAll('textarea'))
              .map((ta) => {
                // Scope to the edit card around the textarea
                const editCard =
                  ta.closest('.bg-token-main-surface-tertiary') ||
                  ta.closest('.rounded-3xl') ||
                  ta.closest('[data-message-id]') ||
                  ta.parentElement;
                if (!editCard) return null;

                const buttonRow =
                  editCard.querySelector('div.flex.justify-end.gap-2') ||
                  editCard.querySelector('div.flex.justify-end');
                if (!buttonRow) return null;

                return findEditSendButton(buttonRow);
              })
              .filter(Boolean);

            // Fallback: only consider edit rows that contain an editable field + Cancel/Send
            const fallbackButtons = Array.from(
              document.querySelectorAll('div.flex.justify-end.gap-2, div.flex.justify-end'),
            )
              .map((row) => {
                const scope = row.closest(
                  '.bg-token-main-surface-tertiary, .rounded-3xl, [data-message-id], article[data-testid^="conversation-turn-"]',
                );
                if (!scope) return null;
                if (!scope.querySelector('textarea, [contenteditable="true"]')) return null;
                return findEditSendButton(row);
              })
              .filter(Boolean);

            const candidateButtons = Array.from(
              new Set([...textareaSendButtons, ...fallbackButtons]),
            );

            const visibleSendButtons = candidateButtons.filter(isVisible);

            if (!visibleSendButtons.length) return;

            // The lowest visible one (last in DOM order)
            const btn = visibleSendButtons.reduce((bottomMost, current) => {
              const bottomRect = bottomMost.getBoundingClientRect();
              const currentRect = current.getBoundingClientRect();
              return currentRect.top >= bottomRect.top ? current : bottomMost;
            });

            if (window.gsap) flashBorder(btn);

            setTimeout(() => {
              safeClick(btn);
            }, DELAY_BEFORE_CLICK);
          } catch {
            // Fail silently
          }
        },
        [shortcuts.shortcutKeyNewConversation]: function newConversation() {
          // 1) Fire the native “New Chat” shortcut first (Ctrl/Cmd + Shift + O)
          const isMac = isMacPlatform();
          const eventInit = {
            key: 'o',
            code: 'KeyO',
            keyCode: 79,
            which: 79,
            bubbles: true,
            cancelable: true,
            composed: true,
            shiftKey: true,
            ctrlKey: !isMac,
            metaKey: isMac,
          };
          document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
          document.dispatchEvent(new KeyboardEvent('keyup', eventInit));

          // 2) Fallbacks only if nothing clickable is visible

          // 2a) Try the test-id button
          const newChatBtn = document.querySelector('button[data-testid="new-chat-button"]');
          if (safeClick(newChatBtn)) return;

          // 2b) Try known SVG-path variants (very old UIs)
          const selectors = [
            'button:has(svg > path[d^="M15.6729 3.91287C16.8918"])',
            'button:has(svg > path[d^="M15.673 3.913a3.121 3.121 0 1 1 4.414 4.414"])',
          ];
          for (const sel of selectors) {
            const btn = document.querySelector(sel);
            if (safeClick(btn)) return;
          }
        },
        [shortcuts.shortcutKeySearchConversationHistory]: () => {
          // 1) Fire the native “Search Conversation History” shortcut first (Ctrl/Cmd + K)
          const isMac = isMacPlatform();
          const eventInit = {
            key: 'k',
            code: 'KeyK',
            keyCode: 75,
            which: 75,
            bubbles: true,
            cancelable: true,
            composed: true,
            shiftKey: false,
            ctrlKey: !isMac,
            metaKey: isMac,
            altKey: false,
          };
          document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
          document.dispatchEvent(new KeyboardEvent('keyup', eventInit));

          // 2a) Try the test-id button
          const searchBtn = document.querySelector(
            'button[data-testid="search-conversation-button"]',
          );
          if (safeClick(searchBtn)) return;

          // 2b) Very old SVG-path fallback
          const path = document.querySelector('button svg path[d^="M10.75 4.25C7.16015"]');
          const btn = path?.closest('button');
          if (safeClick(btn)) return;
        },
        [shortcuts.shortcutKeyClickNativeScrollToBottom]: () => {
          // native scroll to bottom
          const el = getScrollableContainer();
          if (!el) return;

          gsap.to(el, {
            duration: 0.3,
            scrollTo: { y: 'max' },
            ease: 'power4.out',
          });
        },
        [shortcuts.shortcutKeyScrollToTop]: () => {
          // native scroll to top
          const el = getScrollableContainer();
          if (!el) return;

          gsap.to(el, {
            duration: 0.3,
            scrollTo: { y: 0 },
            ease: 'power4.out',
          });
        },
        // @note Toggle Sidebar Function
        [shortcuts.shortcutKeyToggleSidebar]: function toggleSidebar() {
          // —— Directional snap logic ——
          const slimBarEl = document.getElementById('stage-sidebar-tiny-bar');
          const largeSidebarEl = document.querySelector(
            'aside#stage-sidebar:not([inert]):not(.pointer-events-none)',
          );
          if (window._fadeSlimSidebarEnabled && slimBarEl && !largeSidebarEl) {
            window.hideSlimSidebarBarInstant();
          } else if (window._fadeSlimSidebarEnabled && slimBarEl && largeSidebarEl) {
            window.flashSlimSidebarBar();
          }

          // —— Existing toggle logic ——
          const isMac = isMacPlatform();
          const eventInit = {
            key: 's',
            code: 'KeyS',
            keyCode: 83,
            which: 83,
            bubbles: true,
            cancelable: true,
            composed: true,
            shiftKey: true,
            ctrlKey: !isMac,
            metaKey: isMac,
          };

          // 1) Try native keyboard toggle
          document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
          document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
          if (
            document.querySelector('button[data-testid="close-sidebar-button"]')?.offsetParent !==
            null
          ) {
            setTimeout(() => {}, 30);
            return;
          }

          // 2) Fallback: direct open/close button
          const direct = document.querySelector(
            'button[data-testid="open-sidebar-button"], button[data-testid="close-sidebar-button"]',
          );
          if (safeClick(direct)) {
            setTimeout(() => {}, 30);
            return;
          }

          // 3) Final fallback: legacy SVG-path selectors
          const selectors = [
            '#bottomBarContainer button:has(svg > path[d^="M8.85719 3H15.1428C16.2266 2.99999"])',
            '#bottomBarContainer button:has(svg > path[d^="M8.85719 3L13.5"])',
            '#bottomBarContainer button:has(svg > path[d^="M8.85720 3H15.1428C16.2266"])',
            '#sidebar-header button:has(svg > path[d^="M8.85719 3H15.1428C16.2266 2.99999"])',
            '#conversation-header-actions button:has(svg > path[d^="M8.85719 3H15.1428C16.2266"])',
            '#sidebar-header button:has(svg > path[d^="M8.85719 3L13.5"])',
            'div.draggable.h-header-height button[data-testid="open-sidebar-button"]',
            'div.draggable.h-header-height button:has(svg > path[d^="M3 8C3 7.44772 3.44772"])',
            'button:has(svg > path[d^="M3 8C3 7.44772 3.44772"])',
            'button[data-testid="close-sidebar-button"]',
            'button[data-testid="open-sidebar-button"]',
            'button svg path[d^="M13.0187 7C13.0061"]',
            'button svg path[d^="M8.85719 3L13.5"]',
            'button svg path[d^="M3 8C3 7.44772"]',
            'button svg path[d^="M8.85719 3H15.1428C16.2266"]',
            'button svg path[d^="M3 6h18M3 12h18M3 18h18"]',
            'button svg path[d^="M6 6h12M6 12h12M6 18h12"]',
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            const btn = el?.closest('button');
            if (safeClick(btn)) {
              setTimeout(() => {}, 30);
              return;
            }
          }

          // 4) If still nothing, just exit
          setTimeout(() => {}, 30);
        },
        [shortcuts.shortcutKeyActivateInput]: function activateInput() {
          const selectors = [
            '#prompt-textarea[contenteditable="true"]',
            'div[contenteditable="true"][id="prompt-textarea"]',
            'div.ProseMirror[contenteditable="true"]',
          ];

          for (const selector of selectors) {
            const inputField = document.querySelector(selector);
            if (inputField) {
              inputField.focus();
              return;
            }
          }

          // Fallback: trigger the page’s native shortcut (Shift + Escape)
          const eventInit = {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
            composed: true,
            shiftKey: true,
            ctrlKey: false,
            metaKey: false,
          };
          document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
          document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
        },
        [shortcuts.shortcutKeySearchWeb]: async () => {
          // Unique config for this action
          const ICON_PATH_PREFIX = ['M10 2.125C14.3492', '#6b0d8c']; // globe icon prefix
          await runActionByIcon(ICON_PATH_PREFIX);
        },
        [shortcuts.shortcutKeyPreviousThread]: (opts = {}) => {
          const SCROLL_ANCHOR_PCT =
            typeof window.SCROLL_ANCHOR_PCT === 'number' ? window.SCROLL_ANCHOR_PCT : 80;

          // Centralized timing constants
          const DELAY_INITIAL = 25; // was 50
          const DELAY_POST_CLICK = 175; // was 350
          const SCROLL_DURATION = 0.2; // was 0.6s

          const getScrollableContainer =
            typeof window.getScrollableContainer === 'function'
              ? window.getScrollableContainer
              : () => window;

          const composerRect = () => {
            const el = document.getElementById('composer-background');
            return el ? el.getBoundingClientRect() : null;
          };

          const scrollToAnchor = (container, target, onComplete) => {
            if (!window.gsap || !target) return onComplete?.();

            const rect = target.getBoundingClientRect();
            const contRect =
              container === window
                ? { top: 0, height: window.innerHeight }
                : {
                    top: container.getBoundingClientRect().top,
                    height: container.clientHeight,
                  };

            const anchorPx = (contRect.height * SCROLL_ANCHOR_PCT) / 100 - rect.height / 2;
            const current = container === window ? window.scrollY : container.scrollTop;
            let targetY =
              container === window
                ? current + rect.top - anchorPx
                : container.scrollTop + (rect.top - contRect.top) - anchorPx;

            const maxScroll =
              container === window
                ? (document.scrollingElement || document.documentElement).scrollHeight -
                  window.innerHeight
                : container.scrollHeight - container.clientHeight;
            targetY = Math.max(0, Math.min(targetY, maxScroll));

            gsap.to(container, {
              duration: SCROLL_DURATION,
              scrollTo: { y: targetY, autoKill: false },
              ease: 'power4.out',
              onComplete,
            });
          };

          function isButtonCentered(container, btn) {
            if (!window.gsap || !btn) return false;
            const rect = btn.getBoundingClientRect();
            const contRect =
              container === window
                ? { top: 0, height: window.innerHeight }
                : {
                    top: container.getBoundingClientRect().top,
                    height: container.clientHeight,
                  };

            const anchorPx = (contRect.height * SCROLL_ANCHOR_PCT) / 100 - rect.height / 2;
            const currentScroll = container === window ? window.scrollY : container.scrollTop;
            const btnTop =
              container === window
                ? rect.top + window.scrollY
                : rect.top - contRect.top + container.scrollTop;
            const targetY = btnTop - anchorPx;
            const delta = Math.abs(currentScroll - targetY);
            return delta < 2; // threshold
          }

          const getMsgId = (btn) =>
            btn.closest('[data-message-id]')?.getAttribute('data-message-id');

          const relaunchHover = (wrapper) => {
            if (!wrapper) return;
            wrapper.classList.add('force-hover');
            ['pointerover', 'pointerenter', 'mouseover'].forEach((evt) => {
              wrapper.dispatchEvent(new MouseEvent(evt, { bubbles: true }));
            });
          };

          const collectCandidates = () => {
            const divBtns = Array.from(document.querySelectorAll('div.tabular-nums'))
              .map((el) => el.previousElementSibling)
              .filter((el) => el?.tagName === 'BUTTON');
            const iconSelectors = [
              'button[aria-label="Previous response"]',
              withPrefix(svgSelectorForTokens(['M11.5292 3.7793', '#8ee2e9']), 'button'),
            ];
            const iconBtns = iconSelectors.flatMap((sel) =>
              Array.from(document.querySelectorAll(sel)).map(
                (node) => node.closest('button') || node,
              ),
            );
            return [...divBtns, ...iconBtns].filter(Boolean);
          };

          const isOverlapComposer = (rect) => {
            const comp = composerRect();
            return comp
              ? !(
                  rect.bottom < comp.top ||
                  rect.top > comp.bottom ||
                  rect.right < comp.left ||
                  rect.left > comp.right
                )
              : false;
          };

          const chooseTarget = (buttons) => {
            const scrollY = window.scrollY;
            const viewH = window.innerHeight;
            const BOTTOM_BUFFER = 85;

            const withMeta = buttons.map((btn) => {
              const rect = btn.getBoundingClientRect();
              return {
                btn,
                rect,
                absBottom: rect.bottom + scrollY,
                fullyVisible:
                  rect.top >= 0 && rect.bottom <= viewH - BOTTOM_BUFFER && !isOverlapComposer(rect),
              };
            });

            const fully = withMeta.filter((m) => m.fullyVisible);
            if (fully.length) {
              return fully.reduce((a, b) => (a.rect.bottom > b.rect.bottom ? a : b)).btn;
            }
            const above = withMeta.filter((m) => m.rect.bottom <= 0);
            if (above.length) {
              return above.reduce((a, b) => (a.rect.bottom > b.rect.bottom ? a : b)).btn;
            }
            return withMeta.reduce((a, b) => (a.absBottom > b.absBottom ? a : b)).btn;
          };

          const recenter = (msgId) => {
            if (!msgId) return;
            const container = getScrollableContainer();
            const target = document.querySelector(`[data-message-id="${msgId}"] button`);
            if (!target) return;
            scrollToAnchor(container, target);
          };

          setTimeout(() => {
            try {
              const all = collectCandidates();
              if (!all.length) return;

              let target = chooseTarget(all);
              const container = getScrollableContainer();

              if (opts.previewOnly && target && isButtonCentered(container, target)) {
                const idx = all.indexOf(target);
                let found = false;
                for (let i = idx - 1; i >= 0; --i) {
                  if (!isButtonCentered(container, all[i])) {
                    target = all[i];
                    found = true;
                    break;
                  }
                }
                if (!found && all.length > 1) {
                  target = all[all.length - 1];
                }
              }

              if (!target) return;
              const msgId = getMsgId(target);

              scrollToAnchor(container, target, () => {
                flashBorder(target);
                relaunchHover(target.closest('[class*="group-hover"]'));

                if (!opts.previewOnly) {
                  setTimeout(() => {
                    target.click();
                    setTimeout(() => recenter(msgId), DELAY_POST_CLICK);
                  }, DELAY_POST_CLICK);
                }
              });
            } catch (_) {
              /* silent */
            }
          }, DELAY_INITIAL);
        },

        /*──────────────────────────────────────────────────────────────────────────────
         *  NEXT‑THREAD shortcut – tracks ONE specific button through re‑render
         *────────────────────────────────────────────────────────────────────────────*/
        /* Thread‑Navigation “next” shortcut – full drop‑in replacement */
        // Updated "Thread Navigation" shortcut implementation
        // Fulfils mandatory sequence: select‑scroll‑highlight‑click‑pause‑recenter

        // Export / attach to your shortcuts map
        [shortcuts.shortcutKeyNextThread]: (opts = {}) => {
          const SCROLL_ANCHOR_PCT =
            typeof window.SCROLL_ANCHOR_PCT === 'number' ? window.SCROLL_ANCHOR_PCT : 80;

          // Centralized timing constants (all halved)
          const DELAY_INITIAL = 25; // was 50
          const DELAY_POST_CLICK = 200; // was 350
          const SCROLL_DURATION = 0.2; // was 0.6s

          const getScrollableContainer =
            typeof window.getScrollableContainer === 'function'
              ? window.getScrollableContainer
              : () => window;

          const composerRect = () => {
            const el = document.getElementById('composer-background');
            return el ? el.getBoundingClientRect() : null;
          };

          const scrollToAnchor = (container, target, onComplete) => {
            if (!window.gsap || !target) return onComplete?.();

            const rect = target.getBoundingClientRect();
            const contRect =
              container === window
                ? { top: 0, height: window.innerHeight }
                : {
                    top: container.getBoundingClientRect().top,
                    height: container.clientHeight,
                  };

            const anchorPx = (contRect.height * SCROLL_ANCHOR_PCT) / 100 - rect.height / 2;
            const current = container === window ? window.scrollY : container.scrollTop;
            let targetY =
              container === window
                ? current + rect.top - anchorPx
                : container.scrollTop + (rect.top - contRect.top) - anchorPx;

            const maxScroll =
              container === window
                ? (document.scrollingElement || document.documentElement).scrollHeight -
                  window.innerHeight
                : container.scrollHeight - container.clientHeight;
            targetY = Math.max(0, Math.min(targetY, maxScroll));

            gsap.to(container, {
              duration: SCROLL_DURATION,
              scrollTo: { y: targetY, autoKill: false },
              ease: 'power4.out',
              onComplete,
            });
          };

          function isButtonCentered(container, btn) {
            if (!window.gsap || !btn) return false;
            const rect = btn.getBoundingClientRect();
            const contRect =
              container === window
                ? { top: 0, height: window.innerHeight }
                : {
                    top: container.getBoundingClientRect().top,
                    height: container.clientHeight,
                  };

            const anchorPx = (contRect.height * SCROLL_ANCHOR_PCT) / 100 - rect.height / 2;
            const currentScroll = container === window ? window.scrollY : container.scrollTop;
            const btnTop =
              container === window
                ? rect.top + window.scrollY
                : rect.top - contRect.top + container.scrollTop;
            const targetY = btnTop - anchorPx;
            const delta = Math.abs(currentScroll - targetY);
            return delta < 2; // threshold
          }

          const getMsgId = (btn) =>
            btn.closest('[data-message-id]')?.getAttribute('data-message-id');

          const relaunchHover = (wrapper) => {
            if (!wrapper) return;
            wrapper.classList.add('force-hover');
            ['pointerover', 'pointerenter', 'mouseover'].forEach((evt) => {
              wrapper.dispatchEvent(new MouseEvent(evt, { bubbles: true }));
            });
          };

          const collectCandidates = () => {
            const divBtns = Array.from(document.querySelectorAll('div.tabular-nums'))
              .map((el) => el.previousElementSibling)
              .filter((el) => el?.tagName === 'BUTTON');
            const iconSelectors = [
              'button[aria-label="Next response"]',
              withPrefix(svgSelectorForTokens(['M7.52925 3.7793', '#b140e7']), 'button'),
            ];
            const pathBtns = iconSelectors.flatMap((sel) =>
              Array.from(document.querySelectorAll(sel)).map(
                (node) => node.closest('button') || node,
              ),
            );

            // Exclude "Thought for" buttons
            const isExcluded = (btn) => {
              const span = btn.querySelector('span');
              if (!span) return false;
              return /^Thought for\b/.test(span.textContent.trim());
            };

            return [...divBtns, ...pathBtns].filter(Boolean).filter((btn) => !isExcluded(btn));
          };

          const isOverlapComposer = (rect) => {
            const comp = composerRect();
            return comp
              ? !(
                  rect.bottom < comp.top ||
                  rect.top > comp.bottom ||
                  rect.right < comp.left ||
                  rect.left > comp.right
                )
              : false;
          };

          const chooseTarget = (buttons) => {
            const scrollY = window.scrollY;
            const viewH = window.innerHeight;
            const BOTTOM_BUFFER = 85;

            const withMeta = buttons.map((btn) => {
              const rect = btn.getBoundingClientRect();
              return {
                btn,
                rect,
                absBottom: rect.bottom + scrollY,
                fullyVisible:
                  rect.top >= 0 && rect.bottom <= viewH - BOTTOM_BUFFER && !isOverlapComposer(rect),
              };
            });

            const fully = withMeta.filter((m) => m.fullyVisible);
            if (fully.length) {
              return fully.reduce((a, b) => (a.rect.bottom > b.rect.bottom ? a : b)).btn;
            }
            const above = withMeta.filter((m) => m.rect.bottom <= 0);
            if (above.length) {
              return above.reduce((a, b) => (a.rect.bottom > b.rect.bottom ? a : b)).btn;
            }
            return withMeta.reduce((a, b) => (a.absBottom > b.absBottom ? a : b)).btn;
          };

          const recenter = (msgId) => {
            if (!msgId) return;
            const container = getScrollableContainer();
            const target = document.querySelector(`[data-message-id="${msgId}"] button`);
            if (!target) return;
            scrollToAnchor(container, target);
          };

          setTimeout(() => {
            try {
              const all = collectCandidates();
              if (!all.length) return;

              let target = chooseTarget(all);
              const container = getScrollableContainer();

              if (opts.previewOnly && target && isButtonCentered(container, target)) {
                const idx = all.indexOf(target);
                for (let i = idx - 1; i >= 0; --i) {
                  if (!isButtonCentered(container, all[i])) {
                    target = all[i];
                    break;
                  }
                }
              }

              if (!target) return;
              const msgId = getMsgId(target);

              scrollToAnchor(container, target, () => {
                flashBorder(target);
                relaunchHover(target.closest('[class*="group-hover"]'));

                if (!opts.previewOnly) {
                  setTimeout(() => {
                    target.click();
                    setTimeout(() => recenter(msgId), DELAY_POST_CLICK);
                  }, DELAY_POST_CLICK);
                }
              });
            } catch (_) {
              /* silent */
            }
          }, DELAY_INITIAL);
        },

        [shortcuts.selectThenCopy]: (() => {
          window.selectThenCopyState = window.selectThenCopyState || { lastSelectedIndex: -1 };
          const DEBUG = false;

          // Copy HTML + Text (mirror 111s ordering: try async API first, then copy-event fallback)
          async function writeClipboardHTMLAndText_Single(html, text) {
            if (navigator.clipboard && window.ClipboardItem) {
              try {
                const item = new ClipboardItem({
                  'text/html': new Blob([html], { type: 'text/html' }),
                  'text/plain': new Blob([text], { type: 'text/plain' }),
                });
                await navigator.clipboard.write([item]);
                return;
              } catch (e) {
                if (DEBUG) console.debug('Clipboard write fallback (single):', e);
              }
            }
            document.addEventListener(
              'copy',
              (e) => {
                e.clipboardData.setData('text/html', html);
                e.clipboardData.setData('text/plain', text);
                e.preventDefault();
              },
              { once: true },
            );
            document.execCommand('copy');
          }

          // Convert embedded newlines to <br> for user messages (HTML path)
          function replaceNewlinesWithBr_UserPreWrap(root) {
            try {
              const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
              const toProcess = [];
              for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (n.nodeValue?.includes('\n')) toProcess.push(n);
              }
              for (const textNode of toProcess) {
                const parts = textNode.nodeValue.split('\n');
                const frag = document.createDocumentFragment();
                parts.forEach((part, i) => {
                  if (part) frag.appendChild(document.createTextNode(part));
                  if (i < parts.length - 1) frag.appendChild(document.createElement('br'));
                });
                textNode.parentNode.replaceChild(frag, textNode);
              }
            } catch (err) {
              if (DEBUG) console.debug('replaceNewlinesWithBr_UserPreWrap failed:', err);
            }
          }

          // Normalize code blocks → <pre><code class="language-...">```lang ...```</code></pre>
          function normalizeCodeBlocksInClone(root) {
            const safeLang = (s) => {
              const v = (s || '').trim();
              return /^[a-z0-9+.#-]+$/i.test(v) ? v.toLowerCase() : '';
            };
            // Remove UI chrome (copy buttons/headers)
            root
              .querySelectorAll(
                '.flex.items-center.text-token-text-secondary,[data-testid="copy-code-button"],button[aria-label*="Copy"],button[title*="Copy"]',
              )
              .forEach((el) => {
                el.remove();
              });

            const preNodes = Array.from(root.querySelectorAll('pre'));
            const codeBlocks = Array.from(
              root.querySelectorAll(
                'code[class*="whitespace-pre"], code.whitespace-pre, code[class*="whitespace-pre!"]',
              ),
            ).filter((c) => !c.closest('pre'));
            const blocks = [...preNodes, ...codeBlocks];

            for (const node of blocks) {
              const isPre = node.tagName === 'PRE';
              const codeEl = isPre ? node.querySelector('code') || node : node;
              let codeText = (codeEl?.innerText ?? node.innerText ?? '').replace(/\u00A0/g, ' ');
              codeText = codeText.replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/gu, '');
              codeText = codeText.replace(/\r\n?/g, '\n').replace(/[ \t\u00A0\r\n]+$/g, '');

              let lang = '';
              if (codeEl) {
                const cls = Array.from(codeEl.classList || []).find((c) =>
                  c.toLowerCase().startsWith('language-'),
                );
                if (cls) lang = cls.split('language-')[1];
                if (!lang && codeEl.dataset?.language) lang = codeEl.dataset.language;
              }
              if (!lang && isPre) {
                const hdr = node.querySelector('.flex.items-center.text-token-text-secondary');
                const hdrText = hdr?.innerText?.trim();
                if (hdrText) lang = hdrText;
              }
              lang = safeLang(lang);

              const eol = '\r\n';
              let fenced;
              if (/^\s*```/.test(codeText)) {
                fenced = codeText.replace(/\r\n?/g, '\n').replace(/\n/g, eol);
                if (!fenced.endsWith(eol)) fenced += eol;
              } else {
                fenced = `\`\`\`${lang || ''}${eol}${codeText}${eol}\`\`\`${eol}`;
              }

              const preNew = document.createElement('pre');
              const codeNew = document.createElement('code');
              if (lang) codeNew.className = `language-${lang}`;
              codeNew.textContent = fenced;
              preNew.appendChild(codeNew);
              node.replaceWith(preNew);
            }
          }

          // Strip data-* (prevents weird list detection in Word), keep real elements intact
          function demotePTagsAndStripDataAttrs(root) {
            for (const el of Array.from(root.querySelectorAll('*'))) {
              for (const attr of Array.from(el.attributes)) {
                if (
                  attr.name === 'data-start' ||
                  attr.name === 'data-end' ||
                  attr.name.startsWith('data-')
                ) {
                  el.removeAttribute(attr.name);
                }
              }
            }
          }

          // Split UL/OL so <pre> and following siblings don’t inherit bullets in Word
          function splitListsAroundCodeBlocks_Word(root) {
            ['ul', 'ol'].forEach((tag) => {
              root.querySelectorAll(tag).forEach((list) => {
                const lis = Array.from(list.children).filter((c) => c.tagName === 'LI');
                if (!lis.some((li) => li.querySelector('pre'))) return;
                const frag = document.createDocumentFragment();
                let acc = document.createElement(tag);
                const flushAcc = () => {
                  if (acc.children.length) frag.appendChild(acc);
                  acc = document.createElement(tag);
                };
                for (const li of lis) {
                  const firstPre = li.querySelector(':scope > pre') || li.querySelector('pre');
                  if (!firstPre) {
                    acc.appendChild(li.cloneNode(true));
                    continue;
                  }
                  const newLi = document.createElement('li');
                  for (const child of Array.from(li.childNodes)) {
                    if (child === firstPre) break;
                    newLi.appendChild(child.cloneNode(true));
                  }
                  if (newLi.childNodes.length) acc.appendChild(newLi);
                  flushAcc();
                  let started = false;
                  for (const child of Array.from(li.childNodes)) {
                    if (child === firstPre) started = true;
                    if (started) frag.appendChild(child.cloneNode(true));
                  }
                }
                flushAcc();
                for (const n of Array.from(list.childNodes)) {
                  if (n.tagName !== 'LI') frag.appendChild(n.cloneNode(true));
                }
                list.replaceWith(frag);
              });
            });
          }

          function applyWordSpacingAndFont_Word(root) {
            const fontStack = `'Segoe UI', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, system-ui, sans-serif`;
            const baseRules = [
              `font-family:${fontStack}`,
              'line-height:116%',
              'mso-line-height-alt:116%',
              'mso-line-height-rule:exactly',
            ].join(';');
            const base = root.getAttribute('style') || '';
            root.setAttribute('style', base ? `${base};${baseRules}` : baseRules);
            const selector = 'p, pre, blockquote, li, h1, h2, h3, h4, h5, h6';
            root.querySelectorAll(selector).forEach((el) => {
              const s = el.getAttribute('style') || '';
              const rules = [
                `font-family:${fontStack}`,
                'margin-top:0pt',
                'margin-bottom:8pt',
                'line-height:116%',
                'mso-margin-top-alt:0pt',
                'mso-margin-bottom-alt:8pt',
                'mso-line-height-alt:116%',
                'mso-line-height-rule:exactly',
              ].join(';');
              el.setAttribute('style', s ? `${s};${rules}` : rules);
            });
          }

          // Inline guard used by single-message copy: no extra paragraphs, no labels.
          // Break Word's auto-list at paragraph starts and after <br> by inserting
          // WORD JOINER (U+2060) between the number and the delimiter, plus NBSP after.
          function inlineGuardFirstRuns_Word(root) {
            const WJ = '\u2060'; // WORD JOINER
            const NBSP = '\u00A0';
            // Matches: (leading spaces)(1..3 digits or A-Z)(. or ))(at least one space)
            const LIST_START_RE = /^(\s*)(\d{1,3}|[A-Za-z])([.)])\s+/;

            function firstText(rootEl) {
              const w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
                acceptNode(n) {
                  return (n.nodeValue || '').trim().length
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_SKIP;
                },
              });
              return w.nextNode();
            }

            function neutralizeStart(textNode) {
              const s = textNode.nodeValue || '';
              if (!s) return;
              if (LIST_START_RE.test(s)) {
                textNode.nodeValue = s.replace(
                  LIST_START_RE,
                  (_, lead, num, punct) => `${lead}${num}${WJ}${punct}${NBSP}`,
                );
              }
            }

            // Paragraph-like blocks (but not inside real lists)
            root
              .querySelectorAll('p, pre, blockquote, h1, h2, h3, h4, h5, h6, div')
              .forEach((el) => {
                if (el.closest('li, ol, ul')) return;
                const t = firstText(el);
                if (t) neutralizeStart(t);
              });

            // After each <br>, neutralize the next visual "line"
            root.querySelectorAll('p, pre, blockquote, div').forEach((el) => {
              if (el.closest('li, ol, ul')) return;
              el.querySelectorAll('br').forEach((br) => {
                let n = br.nextSibling;
                while (
                  n &&
                  ((n.nodeType === 3 && !(n.nodeValue || '').trim()) ||
                    (n.nodeType === 1 && n.tagName === 'BR'))
                ) {
                  n = n.nextSibling;
                }
                if (!n) return;
                if (n.nodeType === 3) {
                  neutralizeStart(n);
                } else if (n.nodeType === 1) {
                  const t = firstText(n);
                  if (t) neutralizeStart(t);
                }
              });
            });
          }

          // Plain text builder: convert each <pre> into a fenced block with CRLF line endings (matches 111s)
          function buildPlainTextWithFences(root) {
            const clone = root.cloneNode(true);
            normalizeCodeBlocksInClone(clone);
            for (const pre of Array.from(clone.querySelectorAll('pre'))) {
              const codeEl = pre.querySelector('code');
              let codeText = (codeEl?.innerText ?? pre.innerText ?? '').replace(/\u00A0/g, ' ');
              codeText = codeText
                .replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/gu, '')
                .replace(/\r\n?/g, '\n')
                .replace(/[ \t\u00A0\r\n]+$/g, '');
              let lang = '';
              if (codeEl) {
                const cls = Array.from(codeEl.classList || []).find((c) =>
                  c.toLowerCase().startsWith('language-'),
                );
                if (cls) lang = cls.split('language-')[1];
              }
              const eol = '\r\n';
              const out = codeText.trim().startsWith('```')
                ? `\r\n${codeText.replace(/\r\n?/g, '\n').replace(/\n/g, eol)}\r\n`
                : `\r\n\`\`\`${lang}${eol}${codeText}${eol}\`\`\`${eol}`;
              const container = document.createElement('div');
              container.textContent = out;
              pre.replaceWith(container);
            }
            // Mirror 111s: do not force-convert all non-code newlines; only code blocks are normalized to CRLF
            return clone.innerText.replace(/\u00A0/g, ' ').trim();
          }

          // Build processed HTML + Text from a single content element (mirror 111s behavior)
          function buildProcessedClipboardPayload_Single(contentEl) {
            const cloneForHtml = contentEl.cloneNode(true);

            // Preserve user message hard line breaks visually
            const isUser = !!contentEl.closest?.('[data-message-author-role="user"]');
            if (isUser) replaceNewlinesWithBr_UserPreWrap(cloneForHtml);

            // Normalize DOM to Word-friendly HTML
            normalizeCodeBlocksInClone(cloneForHtml);
            demotePTagsAndStripDataAttrs(cloneForHtml);
            splitListsAroundCodeBlocks_Word(cloneForHtml);

            // Wrapper (acts like 111s turn wrapper — but no visible label)
            const turnWrapper = document.createElement('div');
            turnWrapper.setAttribute('data-export', 'chatgpt-shortcuts-single-message');
            // Preserve role tag (purely metadata)
            const roleContainer = contentEl.closest?.('[data-message-author-role]');
            turnWrapper.setAttribute(
              'data-role',
              roleContainer?.getAttribute?.('data-message-author-role') || 'assistant',
            );

            // 1) Body container (Word-friendly spacing + code/list normalization)
            const bodyDiv = document.createElement('div');
            bodyDiv.innerHTML = cloneForHtml.innerHTML;

            applyWordSpacingAndFont_Word(bodyDiv);
            splitListsAroundCodeBlocks_Word(bodyDiv);
            inlineGuardFirstRuns_Word(bodyDiv);

            // Assemble like 111s (simple container)
            turnWrapper.appendChild(bodyDiv);
            const html =
              '<div data-export="chatgpt-shortcuts-single-message">' +
              turnWrapper.outerHTML +
              '</div>';

            // Plain text variant with fenced code (no labels)
            const text = buildPlainTextWithFences(contentEl);

            return { html, text };
          }

          // Copy processed payload built from a content element
          async function copyProcessedFromElement(el) {
            const { html, text } = buildProcessedClipboardPayload_Single(el);
            await writeClipboardHTMLAndText_Single(html, text);
          }

          // Visual selection (for feedback) + processed copy
          function doSelectAndCopy(el, shouldCopy = true) {
            try {
              const selection = window.getSelection?.();
              if (selection) selection.removeAllRanges();

              const makeTextWalker = (root) =>
                document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                  acceptNode(node) {
                    return node.nodeValue?.trim().length
                      ? NodeFilter.FILTER_ACCEPT
                      : NodeFilter.FILTER_SKIP;
                  },
                });

              const startWalker = makeTextWalker(el);
              const startNode = startWalker.nextNode();
              let endNode = null;
              if (startNode) {
                const endWalker = makeTextWalker(el);
                for (let n = endWalker.nextNode(); n; n = endWalker.nextNode()) endNode = n;
              }
              const range = document.createRange();
              if (startNode && endNode) {
                range.setStart(startNode, 0);
                range.setEnd(endNode, endNode.nodeValue.length);
              } else {
                range.selectNodeContents(el);
              }
              if (selection) selection.addRange(range);

              if (shouldCopy) void copyProcessedFromElement(el);
            } catch (err) {
              if (DEBUG) console.debug('doSelectAndCopy failed:', err);
            }
          }

          // Innermost visible text container for a given role container
          function findContentElForTurn(roleContainer) {
            const isUser = roleContainer.getAttribute('data-message-author-role') === 'user';
            if (isUser) {
              return (
                roleContainer.querySelector(
                  '[data-message-author-role="user"] .whitespace-pre-wrap',
                ) ||
                roleContainer.querySelector(
                  '[data-message-author-role="user"] .prose, [data-message-author-role="user"] .markdown, [data-message-author-role="user"] .markdown-new-styling',
                ) ||
                roleContainer.querySelector('[data-message-author-role="user"]')
              );
            }
            return (
              roleContainer.querySelector(
                '[data-message-author-role="assistant"] .whitespace-pre-wrap',
              ) ||
              roleContainer.querySelector(
                '[data-message-author-role="assistant"] .prose, [data-message-author-role="assistant"] .markdown, [data-message-author-role="assistant"] .markdown-new-styling',
              ) ||
              roleContainer.querySelector('.prose, .markdown, .markdown-new-styling') ||
              roleContainer.querySelector('[data-message-author-role="assistant"]')
            );
          }
          // click handler uses processed copy
          if (!window.__selectThenCopyCopyHandlerAttached) {
            document.addEventListener('click', (e) => {
              const btn = e.target.closest?.('[data-testid="copy-turn-action-button"]');
              if (!btn) return;

              const roleContainer =
                btn.closest('[data-message-author-role]') ||
                btn
                  .closest('article[data-turn], article[data-testid^="conversation-turn-"]')
                  ?.querySelector(
                    '[data-message-author-role="assistant"], [data-message-author-role="user"]',
                  );

              if (!roleContainer) return;

              const contentEl = findContentElForTurn(roleContainer);
              if (contentEl && (contentEl.innerText || contentEl.textContent || '').trim()) {
                // Always show selection AND copy processed HTML/Text
                doSelectAndCopy(contentEl, true);
              }
            });
            window.__selectThenCopyCopyHandlerAttached = true;
          }
          return () => {
            setTimeout(() => {
              try {
                const onlySelectAssistant = window.onlySelectAssistantCheckbox || false;
                const onlySelectUser = window.onlySelectUserCheckbox || false;
                const disableCopyAfterSelect = window.disableCopyAfterSelectCheckbox || false;
                const shouldCopy = !disableCopyAfterSelect;

                const allConversationTurns = Array.from(
                  document.querySelectorAll(
                    'article[data-turn], article[data-testid^="conversation-turn-"]',
                  ),
                );

                const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
                const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

                const composerRect = (() => {
                  const composer = document.getElementById('composer-background');
                  return composer ? composer.getBoundingClientRect() : null;
                })();

                const visibleTurns = allConversationTurns.filter((el) => {
                  const rect = el.getBoundingClientRect();
                  const horizontallyVisible = rect.right > 0 && rect.left < viewportWidth;
                  const verticallyVisible = rect.bottom > 0 && rect.top < viewportHeight;
                  if (!(horizontallyVisible && verticallyVisible)) return false;
                  if (composerRect && rect.top >= composerRect.top) return false;
                  return true;
                });

                const filteredVisibleTurns = visibleTurns.filter((el) => {
                  if (
                    onlySelectAssistant &&
                    !el.querySelector('[data-message-author-role="assistant"]')
                  )
                    return false;
                  if (onlySelectUser && !el.querySelector('[data-message-author-role="user"]'))
                    return false;
                  return true;
                });

                if (!filteredVisibleTurns.length) return;

                filteredVisibleTurns.sort(
                  (a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top,
                );

                const { lastSelectedIndex } = window.selectThenCopyState;
                const nextIndex = (lastSelectedIndex + 1) % filteredVisibleTurns.length;
                const selectedTurn = filteredVisibleTurns[nextIndex];
                if (!selectedTurn) return;

                selectAndCopyMessage(selectedTurn, shouldCopy);
                window.selectThenCopyState.lastSelectedIndex = nextIndex;

                function selectAndCopyMessage(turn, shouldCopyParam) {
                  try {
                    const isUser = !!turn.querySelector('[data-message-author-role="user"]');
                    const isAssistant = !!turn.querySelector(
                      '[data-message-author-role="assistant"]',
                    );

                    if (onlySelectUser && !isUser) return;
                    if (onlySelectAssistant && !isAssistant) return;

                    let contentEl = null;
                    if (isUser) {
                      contentEl =
                        turn.querySelector(
                          '[data-message-author-role="user"] .whitespace-pre-wrap',
                        ) ||
                        turn.querySelector(
                          '[data-message-author-role="user"] .prose, [data-message-author-role="user"] .markdown, [data-message-author-role="user"] .markdown-new-styling',
                        ) ||
                        turn.querySelector('[data-message-author-role="user"]');
                    } else {
                      contentEl =
                        turn.querySelector(
                          '[data-message-author-role="assistant"] .whitespace-pre-wrap',
                        ) ||
                        turn.querySelector(
                          '[data-message-author-role="assistant"] .prose, [data-message-author-role="assistant"] .markdown, [data-message-author-role="assistant"] .markdown-new-styling',
                        ) ||
                        turn.querySelector('.prose, .markdown, .markdown-new-styling') ||
                        turn.querySelector('[data-message-author-role="assistant"]');
                    }

                    if (!contentEl || !contentEl.innerText.trim()) return;

                    doSelectAndCopy(contentEl, !!shouldCopyParam);
                  } catch (err) {
                    if (DEBUG) console.debug('selectAndCopyMessage failed:', err);
                  }
                }
              } catch (err) {
                if (DEBUG) console.debug('outer selectThenCopy failure:', err);
              }
            }, 50);
          };
        })(),
        [shortcuts.shortcutKeyToggleModelSelector]: () => {
          window.toggleModelSelector();
        },
        // Regenerate: open the kebab/overflow menu, then click the "Regenerate" sub-item.
        // Note: these two path prefixes can be the same (as in this case) or different for other actions.
        [shortcuts.shortcutKeyRegenerateTryAgain]: () => {
          const FIRST_BTN_PATH = ['M3.502 16.6663V13.3333C3.502', '#ec66f0']; // menu button icon path (prefix)
          const SUB_ITEM_BTN_PATH = ['M3.502 16.6663V13.3333C3.502', '#ec66f0']; // sub-item icon path (prefix)
          clickLowestSvgThenSubItemSvg(FIRST_BTN_PATH, SUB_ITEM_BTN_PATH);
        },
        [shortcuts.shortcutKeyRegenerateMoreConcise]: () => {
          const FIRST_BTN_PATH = ['M3.502 16.6663V13.3333C3.502', '#ec66f0']; // menu button icon path (prefix)
          const SUB_ITEM_BTN_PATH = ['M10.2002 7.91699L16.8669', '#155a34']; // sub-item icon path (prefix)
          clickLowestSvgThenSubItemSvg(FIRST_BTN_PATH, SUB_ITEM_BTN_PATH);
        },
        [shortcuts.shortcutKeyRegenerateAddDetails]: () => {
          const FIRST_BTN_PATH = ['M3.502 16.6663V13.3333C3.502', '#ec66f0']; // menu button icon path (prefix)
          const SUB_ITEM_BTN_PATH = ['M14.3013 12.6816C14.6039', '#71a046']; // sub-item icon path (prefix)
          clickLowestSvgThenSubItemSvg(FIRST_BTN_PATH, SUB_ITEM_BTN_PATH);
        },
        [shortcuts.shortcutKeyRegenerateWithDifferentModel]: () => {
          const FIRST_BTN_PATH = ['M3.502 16.6663V13.3333C3.502', '#ec66f0']; // menu button icon path (prefix)
          const SUB_ITEM_BTN_PATH = ['M15.4707 17.137C15.211', '#77bc5f']; // sub-item icon path (prefix)
          clickLowestSvgThenSubItemSvg(FIRST_BTN_PATH, SUB_ITEM_BTN_PATH);
        },
        [shortcuts.shortcutKeyRegenerateAskToChangeResponse]: () => {
          const FIRST_BTN_PATH = ['M3.502 16.6663V13.3333C3.502', '#ec66f0']; // menu/overflow button icon path (prefix)
          runRadixMenuActionFocusInputByName(FIRST_BTN_PATH, 'contextual-retry-dropdown-input', {
            caret: 'end', // 'start' | 'end'
            selectAll: false, // true to select existing text
          });
        },
        [shortcuts.shortcutKeyMoreDotsReadAloud]: () => {
          const FIRST_BTN_PATH = ['M15.498 8.50159C16.3254', '#f6d0e2'];
          const SUB_ITEM_BTN_PATH = ['M9.75122 4.09203C9.75122', '#54f145'];
          const EXCLUDE_ANCESTOR = '#bottomBarContainer';

          const openMenuSel = 'div[role="menu"][data-state="open"]';

          function activate(el) {
            try {
              el.focus();
            } catch {}
            try {
              el.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }),
              );
              el.dispatchEvent(
                new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }),
              );
            } catch {}
            try {
              el.click();
            } catch {}
          }

          // 1) If a Stop item is visible in an open menu, click it (stop playback).
          const stopInOpenMenu = document.querySelector(
            `${openMenuSel} div[role="menuitem"][data-testid="voice-play-turn-action-button"]`,
          );
          if (stopInOpenMenu) {
            if (window.gsap && typeof flashBorder === 'function') flashBorder(stopInOpenMenu);
            activate(stopInOpenMenu);
            return;
          }

          // 2) If the Read Aloud sub-item is already exposed in an open menu, click it directly.
          const readAloudSelector = withPrefix(
            svgSelectorForTokens(SUB_ITEM_BTN_PATH),
            `${openMenuSel} div[role="menuitem"]`,
          );
          const exposedReadAloudPath = document.querySelector(readAloudSelector);
          if (exposedReadAloudPath) {
            const item = exposedReadAloudPath.closest('div[role="menuitem"]');
            if (item) {
              if (window.gsap && typeof flashBorder === 'function') flashBorder(item);
              activate(item);
              return;
            }
          }

          // 3) Otherwise, open the menu on the lowest eligible "More dots" button and click Read Aloud.
          clickLowestSvgThenSubItemSvg(FIRST_BTN_PATH, SUB_ITEM_BTN_PATH, EXCLUDE_ANCESTOR);
        },
        [shortcuts.shortcutKeyMoreDotsBranchInNewChat]: () => {
          const FIRST_BTN_PATH = ['M15.498 8.50159C16.3254', '#f6d0e2']; // menu button icon path (prefix)
          const SUB_ITEM_BTN_PATH = ['M3.32996 10H8.01173C8.7455', '#03583c']; // sub-item icon path (prefix)
          clickLowestSvgThenSubItemSvg(FIRST_BTN_PATH, SUB_ITEM_BTN_PATH, '#bottomBarContainer');
        },
        [shortcuts.shortcutKeyThinkingExtended]: () => {
          const FIRST_BTN_PATH = ['#127a53', '#c9d737'];
          const SUB_ITEM_BTN_PATH = '#143e56';
          delayCall(clickLowestSvgThenSubItemSvg, 350, FIRST_BTN_PATH, SUB_ITEM_BTN_PATH);
        },

        [shortcuts.shortcutKeyThinkingStandard]: () => {
          const FIRST_BTN_PATH = ['#127a53', '#c9d737'];
          const SUB_ITEM_BTN_PATH = '#fec800';
          delayCall(clickLowestSvgThenSubItemSvg, 350, FIRST_BTN_PATH, SUB_ITEM_BTN_PATH);
        },
        [shortcuts.shortcutKeyTemporaryChat]: () => {
          const root = document.querySelector('#conversation-header-actions') || document;
          const el =
            root.querySelector('button svg use[href*="#28a8a0"]')?.closest('button') || // Turn on
            root.querySelector('button svg use[href*="#6eabdf"]')?.closest('button'); // Turn off
          if (!el) return;
          smartClick(el);
        },
        [shortcuts.shortcutKeyStudy]: async () => {
          const ICON_PATH_PREFIX = ['M16.3965 5.01128C16.3963', '#1fa93b']; // book icon prefix
          await runActionByIcon(ICON_PATH_PREFIX);
        },
        [shortcuts.shortcutKeyCreateImage]: async () => {
          const ICON_PATH_PREFIX = ['M9.38759 8.53403C10.0712', '#266724']; // image icon prefix
          await runActionByIcon(ICON_PATH_PREFIX);
        },
        [shortcuts.shortcutKeyToggleCanvas]: async () => {
          const ICON_PATH_PREFIX = ['M12.0303 4.11328C13.4406', '#cf3864']; // canvas icon prefix
          await runActionByIcon(ICON_PATH_PREFIX);
        },
        [shortcuts.shortcutKeyAddPhotosFiles]: async () => {
          const ICON_PATH_PREFIX = ['M4.33496 12.5V7.5C4.33496', '#712359']; // Add Photos & Files icon path prefix
          await runActionByIcon(ICON_PATH_PREFIX);
        },
        [shortcuts.shortcutKeyToggleDictate]: () => {
          if (dictateInProgress) return;
          dictateInProgress = true;
          setTimeout(() => {
            dictateInProgress = false;
          }, 300);

          const composerRoot =
            document.getElementById('thread-bottom-container') ||
            document.querySelector('form[data-type="unified-composer"]') ||
            document.getElementById('composer-background') ||
            document.body;

          const findClickableBySpriteId = (spriteId) => {
            const safe = String(spriteId).replace(/(["\\])/g, '\\$1');
            const use = composerRoot.querySelector(`svg use[href*="${safe}"]`);
            if (!use) return null;
            return (
              use.closest('button, [role="button"], a, [tabindex]') ||
              use.closest('svg')?.closest('button, [role="button"], a, [tabindex]') ||
              null
            );
          };

          const click = (el) => {
            if (!el) return false;
            try {
              el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
            } catch {}
            flashBorder(el);
            smartClick(el);
            return true;
          };

          // If dictation is active, prefer submitting (not cancelling).
          const submitBtn = findClickableBySpriteId('#fa1dbd');
          if (click(submitBtn)) return;

          // If submit isn't available, stop dictation.
          const stopBtn = findClickableBySpriteId('#85f94b');
          if (click(stopBtn)) return;

          // Otherwise start dictation (avoid Voice Mode button).
          const dictateBtn = findClickableBySpriteId('#29f921');
          click(dictateBtn);
        },
        [shortcuts.shortcutKeyCancelDictation]: async () => {
          // Prefer stable, language-agnostic selectors first; fall back to icon path if needed.
          const composerRoot =
            document.getElementById('thread-bottom-container') ||
            document.querySelector('form[data-type="unified-composer"]') ||
            document.getElementById('composer-background') ||
            document.body;

          const safe = String('#85f94b').replace(/(["\\])/g, '\\$1');
          const use = composerRoot.querySelector(`svg use[href*="${safe}"]`);
          const btn = use?.closest('button, [role="button"], a, [tabindex]') || null;

          // Only stop if Stop dictation is currently available; otherwise no-op.
          if (!btn) return;

          try {
            btn.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
          } catch {}
          flashBorder(btn);
          await sleep(DELAYS.beforeFinalClick);
          smartClick(btn);
        },
        [shortcuts.shortcutKeyShare]: async () => {
          await clickButtonByTestId('share-chat-button');
        },
        [shortcuts.shortcutKeyThinkLonger]: async () => {
          const ICON_PATH_PREFIX = ['M14.3352 10.0257C14.3352', '#e717cc']; // Thinking (sprite id)
          await runActionByIcon(ICON_PATH_PREFIX);
        },
        [shortcuts.shortcutKeyNewGptConversation]: () => {
          const SUB_ITEM_BTN_PATH = ['M2.6687 11.333V8.66699C2.6687', '#3a5c87']; // submenu New Conversation with GPT icon path prefix
          window.clickGptHeaderThenSubItemSvg(SUB_ITEM_BTN_PATH, { fallbackText: 'New chat' });
        },
        // @note [shortcuts.selectThenCopyAllMessages]: (() => {
        [shortcuts.selectThenCopyAllMessages]: (() => {
          const DEBUG = false;

          // Utility: copy HTML + text to clipboard with fallback
          async function writeClipboardHTMLAndText_EntireConv(html, text) {
            if (navigator.clipboard && window.ClipboardItem) {
              try {
                const item = new ClipboardItem({
                  'text/html': new Blob([html], { type: 'text/html' }),
                  'text/plain': new Blob([text], { type: 'text/plain' }),
                });
                await navigator.clipboard.write([item]);
                return;
              } catch (e) {
                if (DEBUG) console.debug('Clipboard write fallback:', e);
              }
            }
            document.addEventListener(
              'copy',
              (e) => {
                e.clipboardData.setData('text/html', html);
                e.clipboardData.setData('text/plain', text);
                e.preventDefault();
              },
              { once: true },
            );
            document.execCommand('copy');
          }

          // Utility: create a single Range spanning all specified elements (for visual selection feedback)
          function createSelectionRangeForEls_EntireConv(els) {
            try {
              const selection = window.getSelection?.();
              if (!selection || !els.length) return null;
              selection.removeAllRanges();

              function makeTextWalker(root) {
                return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                  acceptNode(node) {
                    return node.nodeValue?.trim().length
                      ? NodeFilter.FILTER_ACCEPT
                      : NodeFilter.FILTER_SKIP;
                  },
                });
              }

              function findFirstTextNode(root) {
                const w = makeTextWalker(root);
                return w.nextNode();
              }

              function findLastTextNode(root) {
                const w = makeTextWalker(root);
                let last = null;
                let n = w.nextNode();
                while (n) {
                  last = n;
                  n = w.nextNode();
                }
                return last;
              }

              const firstEl = els[0];
              const lastEl = els[els.length - 1];
              const startNode = findFirstTextNode(firstEl) || firstEl;
              const endNode = findLastTextNode(lastEl) || lastEl;

              const range = document.createRange();
              if (startNode.nodeType === Node.TEXT_NODE) {
                range.setStart(startNode, 0);
              } else {
                range.setStart(startNode, 0);
              }
              if (endNode.nodeType === Node.TEXT_NODE) {
                range.setEnd(endNode, endNode.nodeValue.length);
              } else {
                range.setEnd(endNode, endNode.childNodes.length);
              }
              return range;
            } catch (err) {
              if (DEBUG) console.debug('createSelectionRangeForEls_EntireConv error:', err);
              return null;
            }
          }

          // Convert newline characters to in user messages so paste targets keep line breaks.
          // We conservatively transform all text nodes under the clone (user messages are plain text in a pre-wrap container).
          function replaceNewlinesWithBr_UserPreWrap(root) {
            try {
              const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
              const toProcess = [];
              let n = walker.nextNode();
              while (n) {
                if (n.nodeValue?.includes('\n')) toProcess.push(n);
                n = walker.nextNode();
              }
              for (const textNode of toProcess) {
                const parts = textNode.nodeValue.split('\n');
                const frag = document.createDocumentFragment();
                parts.forEach((part, i) => {
                  if (part) frag.appendChild(document.createTextNode(part));
                  if (i < parts.length - 1) frag.appendChild(document.createElement('br'));
                });
                textNode.parentNode.replaceChild(frag, textNode);
              }
            } catch (err) {
              if (DEBUG) console.debug('replaceNewlinesWithBr_UserPreWrap failed:', err);
            }
          }

          // Identify the content element for a user/assistant turn
          function findContentElForTurn_EntireConv(container) {
            const assistantScope = container.matches?.('[data-message-author-role="assistant"]')
              ? container
              : container.querySelector?.('[data-message-author-role="assistant"]');
            const userScope = container.matches?.('[data-message-author-role="user"]')
              ? container
              : container.querySelector?.('[data-message-author-role="user"]');
            if (assistantScope) {
              return (
                assistantScope.querySelector('.whitespace-pre-wrap') ||
                assistantScope.querySelector('.prose, .markdown, .markdown-new-styling') ||
                assistantScope
              );
            }
            if (userScope) {
              return (
                userScope.querySelector('.whitespace-pre-wrap') ||
                userScope.querySelector('.prose, .markdown, .markdown-new-styling') ||
                userScope
              );
            }
            return (
              container.querySelector?.('.whitespace-pre-wrap') ||
              container.querySelector?.('.prose, .markdown, .markdown-new-styling') ||
              container
            );
          }

          // Checkboxes or booleans -> forced boolean
          function resolveFlag_EntireConv(v) {
            return !!(v && typeof v === 'object' && 'checked' in v ? v.checked : v);
          }

          // Build the processed HTML + Text payload from DOM, honoring role filters and label settings
          function buildProcessedClipboardPayload_EntireConv({
            includeAssistant,
            includeUser,
            includeLabels,
          }) {
            // helper: infer language from code/pre UI
            function inferLangFromPre(pre) {
              let lang = '';
              const codeEl = pre.querySelector('code');
              if (codeEl) {
                const cls = Array.from(codeEl.classList || []).find((c) =>
                  c.toLowerCase().startsWith('language-'),
                );
                if (cls) lang = cls.split('language-')[1];
              }
              if (!lang) {
                // Try header label inside ChatGPT’s code block UI (e.g., "js")
                const header = pre.querySelector('.flex.items-center.text-token-text-secondary');
                const headerText = header?.innerText?.trim();
                // hyphen placed at end to avoid escape (fixes biome noUselessEscapeInRegex)
                if (headerText && /^[a-z0-9+.#-]+$/i.test(headerText)) {
                  lang = headerText.toLowerCase();
                }
              }
              return lang;
            }

            // helper: simplify ChatGPT code block UI to <pre><code class="language-...">...</code></pre>
            function normalizeCodeBlocksInClone(root) {
              const preNodes = Array.from(root.querySelectorAll('pre'));
              const codeBlocks = Array.from(
                root.querySelectorAll(
                  'code[class*="whitespace-pre"], code.whitespace-pre, code[class*="whitespace-pre!"]',
                ),
              ).filter((c) => !c.closest('pre'));
              const blocks = [...preNodes, ...codeBlocks];
              for (const node of blocks) {
                const isPre = node.tagName === 'PRE';
                const codeEl = isPre ? node.querySelector('code') || node : node;
                let codeText = (codeEl?.innerText ?? node.innerText ?? '').replace(/\u00A0/g, ' ');
                codeText = codeText.replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/gu, '');
                codeText = codeText.replace(/\r\n?/g, '\n');
                codeText = codeText.replace(/[ \t\u00A0\r\n]+$/g, '');
                let lang = '';
                if (isPre) {
                  lang = inferLangFromPre(node);
                  if (!lang && codeEl) {
                    const cls1 = Array.from(codeEl.classList || []).find((c) =>
                      c.toLowerCase().startsWith('language-'),
                    );
                    if (cls1) lang = cls1.split('language-')[1];
                  }
                } else if (codeEl) {
                  const cls2 = Array.from(codeEl.classList || []).find((c) =>
                    c.toLowerCase().startsWith('language-'),
                  );
                  if (cls2) lang = cls2.split('language-')[1];
                }
                const preNew = document.createElement('pre');
                const codeNew = document.createElement('code');
                if (lang) codeNew.className = `language-${lang}`;
                // Use CRLF so Word keeps the closing fence on its own line (no $ markers)
                const eol = '\r\n';
                const fenceOpen = `\`\`\`${lang || ''}`;

                // Emit clean fenced block only
                let fenced;
                if (/^\s*```/.test(codeText)) {
                  // Already fenced: normalize line endings and ensure trailing EOL
                  fenced = codeText.replace(/\r\n?/g, '\n').replace(/\n/g, eol);
                  if (!fenced.endsWith(eol)) fenced += eol;
                } else {
                  fenced = `${fenceOpen}${eol}${codeText}${eol}\`\`\`${eol}`;
                }

                codeNew.textContent = fenced; // literal fenced text inside pre/code
                preNew.appendChild(codeNew);

                // Replace the original node with normalized pre/code
                node.replaceWith(preNew);
              }
            }
            // Strip Word-confusing data-* attributes (preserve <p> semantics for proper paragraph spacing)
            function demotePTagsAndStripDataAttrs(root) {
              for (const el of Array.from(root.querySelectorAll('*'))) {
                for (const attr of Array.from(el.attributes)) {
                  if (
                    attr.name === 'data-start' ||
                    attr.name === 'data-end' ||
                    attr.name.startsWith('data-')
                  ) {
                    el.removeAttribute(attr.name);
                  }
                }
              }
            }
            // Add minimal list guard without altering margins (keeps After: 8pt intact)
            function addListGuardStyles(el) {
              const existing = el.getAttribute('style') || '';
              const guard = 'list-style-type:none;';
              el.setAttribute('style', existing ? `${existing};${guard}` : guard);
            }
            // Split UL/OL so code blocks and follow-up paragraphs don't inherit bullets in Word
            function splitListsAroundCodeBlocks_Word(root) {
              ['ul', 'ol'].forEach((tag) => {
                root.querySelectorAll(tag).forEach((list) => {
                  const lis = Array.from(list.children).filter((c) => c.tagName === 'LI');
                  if (!lis.some((li) => li.querySelector('pre'))) return;
                  const frag = document.createDocumentFragment();
                  let acc = document.createElement(tag);
                  const flushAcc = () => {
                    if (acc.children.length) frag.appendChild(acc);
                    acc = document.createElement(tag);
                  };
                  for (const li of lis) {
                    const firstPre = li.querySelector(':scope > pre') || li.querySelector('pre');
                    if (!firstPre) {
                      acc.appendChild(li.cloneNode(true));
                      continue;
                    }
                    const newLi = document.createElement('li');
                    for (const child of Array.from(li.childNodes)) {
                      if (child === firstPre) break;
                      newLi.appendChild(child.cloneNode(true));
                    }
                    if (newLi.childNodes.length) acc.appendChild(newLi);
                    flushAcc();
                    let started = false;
                    for (const child of Array.from(li.childNodes)) {
                      if (child === firstPre) started = true;
                      if (started) frag.appendChild(child.cloneNode(true)); // move <pre> and any siblings after
                    }
                  }
                  flushAcc();
                  for (const n of Array.from(list.childNodes)) {
                    if (n.tagName !== 'LI') frag.appendChild(n.cloneNode(true));
                  }
                  list.replaceWith(frag);
                });
              });
            }
            // helper: build plain text where each <pre><code> becomes a fenced block
            function buildPlainTextWithFences(root) {
              const clone = root.cloneNode(true);

              // Normalize first (HTML path already inserts fences)
              normalizeCodeBlocksInClone(clone);

              for (const pre of Array.from(clone.querySelectorAll('pre'))) {
                const codeEl = pre.querySelector('code');
                let codeText = (codeEl?.innerText ?? pre.innerText ?? '').replace(/\u00A0/g, ' ');

                // Scrub zero-width/BOM and normalize line endings
                codeText = codeText.replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/gu, '');
                codeText = codeText.replace(/\r\n?/g, '\n');

                // Trim only trailing whitespace/newlines so we control spacing around closing fence
                codeText = codeText.replace(/[ \t\u00A0\r\n]+$/g, '');

                const eol = '\r\n';
                let out;

                // Avoid double-wrapping if already fenced; normalize to CRLF
                if (codeText.trim().startsWith('```')) {
                  const norm = codeText.replace(/\r\n?/g, '\n').replace(/\n/g, eol);
                  out = `${eol}${norm}${eol}`;
                } else {
                  let lang = '';
                  if (codeEl) {
                    const cls = Array.from(codeEl.classList || []).find((c) =>
                      c.toLowerCase().startsWith('language-'),
                    );
                    if (cls) lang = cls.split('language-')[1];
                  }
                  out = `${eol}\`\`\`${lang}${eol}${codeText}${eol}\`\`\`${eol}`;
                }

                const container = document.createElement('div');
                container.textContent = out;
                pre.replaceWith(container);
              }

              return clone.innerText.replace(/\u00A0/g, ' ').trim();
            }

            // Get all conversation turns in DOM order
            const allTurns = Array.from(
              document.querySelectorAll(
                'article[data-turn], article[data-testid^="conversation-turn-"]',
              ),
            );

            // Filter by role
            const filteredTurns = allTurns.filter((turn) => {
              const isAssistant = !!turn.querySelector('[data-message-author-role="assistant"]');
              const isUser = !!turn.querySelector('[data-message-author-role="user"]');
              if (isAssistant && includeAssistant) return true;
              if (isUser && includeUser) return true;
              return false;
            });

            // Map to content elements
            const contentEls = filteredTurns
              .map((turn) => ({
                el: findContentElForTurn_EntireConv(turn),
                turn,
              }))
              .filter(({ el }) => {
                if (!el) return false;
                const txt = (el.innerText || el.textContent || '').trim();
                return !!txt;
              });

            // Nothing to copy
            if (!contentEls.length) return { html: '', text: '' };

            // Build HTML + text blocks
            const blocksHTML = [];
            const blocksText = [];

            for (const { el, turn } of contentEls) {
              const roleContainer = el.closest?.('[data-message-author-role]');
              const role = roleContainer?.getAttribute?.('data-message-author-role') || 'assistant';

              // Determine label source
              let nativeLabel = '';
              try {
                nativeLabel = (
                  turn.querySelector?.('h5.sr-only, h6.sr-only')?.textContent || ''
                ).trim();
              } catch (_) {
                /* ignore */
              }
              const fallbackLabel = role === 'user' ? 'You said:' : 'ChatGPT said:';
              const labelText = includeLabels ? nativeLabel || fallbackLabel : '';

              // Clone content for HTML normalization
              const cloneForHtml = el.cloneNode(true);

              if (role === 'user') {
                // Preserve user message line breaks visually
                replaceNewlinesWithBr_UserPreWrap(cloneForHtml);
              }

              // Normalize code blocks, strip list-bait attrs, and split lists around <pre>
              normalizeCodeBlocksInClone(cloneForHtml);
              demotePTagsAndStripDataAttrs(cloneForHtml);
              splitListsAroundCodeBlocks_Word(cloneForHtml);

              // HTML block
              const turnWrapper = document.createElement('div');
              turnWrapper.setAttribute('data-role', role);

              if (labelText) {
                // Real blank paragraph before label for spacing in Word
                const spacerP = document.createElement('p');
                spacerP.setAttribute(
                  'style',
                  'margin-top:0pt;margin-bottom:8pt;line-height:116%;mso-line-height-alt:116%;mso-line-height-rule:exactly;',
                );
                spacerP.innerHTML = '&nbsp;';
                turnWrapper.appendChild(spacerP);

                // Label as a semantic Heading 2 so Word maps it to its built-in "Heading 2" style
                // Keep zero-width space to suppress auto-numbering (no forced color)
                const labelH = document.createElement('h1');
                labelH.setAttribute(
                  'style',
                  [
                    "font-family:'Calibri',Arial,sans-serif",
                    'font-size:18pt',
                    'font-weight:bold',
                    'margin-top:0pt',
                    'margin-bottom:8pt',
                    'line-height:116%',
                    'mso-line-height-alt:116%',
                    'mso-line-height-rule:exactly',
                  ].join(';'),
                );
                labelH.innerHTML = `\u200B${labelText}`;
                addListGuardStyles(labelH);
                turnWrapper.appendChild(labelH);
              }

              // Body content: inject first, then apply paragraph spacing/font to real <p> etc.
              const bodyDiv = document.createElement('div');
              bodyDiv.innerHTML = cloneForHtml.innerHTML;

              // Apply Word-friendly spacing to real paragraphs (not divs)
              (function applyWordSpacingAndFont_Word(root) {
                if (!root) return;
                const fontStack =
                  "'Segoe UI', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, system-ui, sans-serif";
                const baseRules = [
                  `font-family:${fontStack}`,
                  'line-height:116%',
                  'mso-line-height-alt:116%',
                  'mso-line-height-rule:exactly',
                ].join(';');

                // Apply to container
                const base = root.getAttribute('style') || '';
                root.setAttribute('style', base ? `${base};${baseRules}` : baseRules);

                // Apply to paragraph-like tags Word respects
                const selector = 'p, pre, blockquote, li, h1, h2, h3, h4, h5, h6';
                root.querySelectorAll(selector).forEach((el) => {
                  const s = el.getAttribute('style') || '';
                  const rules = [
                    `font-family:${fontStack}`,
                    'margin-top:0pt',
                    'margin-bottom:8pt',
                    'line-height:116%',
                    'mso-margin-top-alt:0pt',
                    'mso-margin-bottom-alt:8pt',
                    'mso-line-height-alt:116%',
                    'mso-line-height-rule:exactly',
                  ].join(';');
                  el.setAttribute('style', s ? `${s};${rules}` : rules);
                });
              })(bodyDiv);

              turnWrapper.appendChild(bodyDiv);

              blocksHTML.push(turnWrapper.outerHTML);

              // Build plain text with fenced code blocks (```lang ... ```)
              const cloneForText = el.cloneNode(true);
              if (role === 'user') {
                // keep user message visual line breaks in text as-is (they are already \n in innerText)
                // no <br> insertion needed for text variant
              }
              const contentText = buildPlainTextWithFences(cloneForText);
              const textBlock = labelText ? `${labelText}\n${contentText}` : contentText;
              blocksText.push(textBlock);
            }

            const html =
              '<div data-export="chatgpt-shortcuts-entire-conversation">' +
              blocksHTML.join('') +
              '</div>';
            const text = blocksText.join('\n\n');

            return { html, text, contentEls: contentEls.map(({ el }) => el) };
          }

          return () => {
            setTimeout(() => {
              try {
                // RADIO LOGIC: prioritize "only" options. If neither is selected, include both.
                const onlyAssistant = resolveFlag_EntireConv(
                  window.selectThenCopyAllMessagesOnlyAssistant || false,
                );
                const onlyUser = resolveFlag_EntireConv(
                  window.selectThenCopyAllMessagesOnlyUser || false,
                );

                let includeAssistant = true;
                let includeUser = true;
                if (onlyAssistant) {
                  includeAssistant = true;
                  includeUser = false;
                } else if (onlyUser) {
                  includeAssistant = false;
                  includeUser = true;
                } else {
                  includeAssistant = true;
                  includeUser = true;
                }

                // LABEL LOGIC:
                // - If includeLabelsAndSeparatorsCheckbox is checked => omit labels
                // - If doNotIncludeLabelsCheckbox is true => omit labels
                // - Otherwise => include labels
                const omitViaSeparators = resolveFlag_EntireConv(
                  window.includeLabelsAndSeparatorsCheckbox,
                );
                const omitViaDoNotInclude = resolveFlag_EntireConv(
                  window.doNotIncludeLabelsCheckbox,
                );
                const includeLabels = !(omitViaSeparators || omitViaDoNotInclude);

                // Build processed clipboard payload directly from DOM (robust), not from selection
                const { html, text, contentEls } = buildProcessedClipboardPayload_EntireConv({
                  includeAssistant,
                  includeUser,
                  includeLabels,
                });

                if (!html && !text) return;

                // Create a visual selection spanning first->last message (for user feedback)
                if (contentEls?.length) {
                  const range = createSelectionRangeForEls_EntireConv(contentEls);
                  // Use optional chaining to safely access Selection API
                  const selection = window.getSelection?.();
                  if (selection && range) {
                    selection.removeAllRanges();
                    selection.addRange(range);
                  }
                }

                // Programmatically write the processed HTML/Text (this enforces role filtering + label rules)
                void writeClipboardHTMLAndText_EntireConv(html, text);
              } catch (err) {
                if (DEBUG) console.debug('selectThenCopyAllMessages error:', err);
              }
            }, 50);
          };
        })(),
      }; // Close keyFunctionMapping object @note Bottom of keyFunctionMapping

      // Assign the functions to the window object for global access
      window.toggleSidebar = keyFunctionMappingAlt[shortcuts.shortcutKeyToggleSidebar];
      window.newConversation = keyFunctionMappingAlt[shortcuts.shortcutKeyNewConversation];
      window.globalScrollToBottom =
        keyFunctionMappingAlt[shortcuts.shortcutKeyClickNativeScrollToBottom];

      // Robust helper for all shortcut styles, including number keys!
      function matchesShortcutKey(setting, event) {
        if (!setting || setting === '\u00A0') return false;

        // If it's a single digit, match against key and code for both top-row and numpad
        if (/^\d$/.test(setting)) {
          return (
            event.key === setting ||
            event.code === `Digit${setting}` ||
            event.code === `Numpad${setting}`
          );
        }

        // If the stored value is KeyboardEvent.code style
        const isCodeStyle =
          /^(Key|Digit|Numpad|Arrow|F\d{1,2}|Backspace|Enter|Escape|Tab|Space|Slash|Minus|Equal|Bracket|Semicolon|Quote|Comma|Period|Backslash)/i.test(
            setting,
          );
        if (isCodeStyle) {
          // Special handling for numbers saved as "Digit1", "Numpad1"
          if (/^Digit(\d)$/.test(setting) || /^Numpad(\d)$/.test(setting)) {
            const num = setting.match(/\d/)[0];
            return event.code === setting || event.key === num;
          }
          // All other codes
          return event.code === setting;
        }

        // Fallback: check event.key, case-insensitive
        return event.key && event.key.toLowerCase() === setting.toLowerCase();
      }

      document.addEventListener('keydown', (event) => {
        if (
          event.isComposing || // IME active (Hindi, Japanese)
          event.keyCode === 229 || // Generic composition keyCode
          ['Control', 'Meta', 'Alt', 'AltGraph'].includes(event.key) || // Modifier keys
          event.getModifierState?.('AltGraph') || // AltGr pressed (ES, EU)
          ['Henkan', 'Muhenkan', 'KanaMode'].includes(event.key) // JIS IME-specific keys
        ) {
          return;
        }

        const isCtrlPressed = isMac ? event.metaKey : event.ctrlKey;
        const isAltPressed = event.altKey;

        // Canonical key: use layout-aware key for text, keep exact for special keys
        const keyIdentifier = event.key.length === 1 ? event.key.toLowerCase() : event.key;

        // Handle Alt+Key and Alt+Ctrl+Key (for preview mode in previousThread)
        if (isAltPressed) {
          // Always open menu for Alt+W (or whatever your toggle key is)
          if (
            !isCtrlPressed &&
            (keyIdentifier === modelToggleKey || event.code === modelToggleKey)
          ) {
            event.preventDefault();
            window.toggleModelSelector();
            return;
          }

          // If this is a digit (1-9 or 0), decide whether to intercept for model switching.
          if (/^\d$/.test(keyIdentifier)) {
            const digit = keyIdentifier; // '0'..'9'

            // Get model codes cache safely (may be provided by ShortcutUtils)
            const modelCodes =
              window.ShortcutUtils &&
              typeof window.ShortcutUtils.getModelPickerCodesCache === 'function'
                ? window.ShortcutUtils.getModelPickerCodesCache()
                : [];

            // Find a model slot assigned to that digit (normalizes Digit/Numpad via codeEquals)
            const modelAssignedIndex =
              window.ShortcutUtils && typeof window.ShortcutUtils.codeEquals === 'function'
                ? modelCodes.findIndex((c) => window.ShortcutUtils.codeEquals(c, `Digit${digit}`))
                : -1;

            if (modelAssignedIndex !== -1) {
              // There is a model assigned to this digit.
              // Intercept it only if the model picker is configured to use Alt.
              if (window.useAltForModelSwitcherRadio === true) {
                // Intercept only when Alt is the chosen modifier for model switching.
                event.preventDefault();
                // Prefer an existing switch function; otherwise dispatch a custom event that other code can listen to.
                if (typeof window.switchModelByIndex === 'function') {
                  window.switchModelByIndex(modelAssignedIndex);
                } else {
                  document.dispatchEvent(
                    new CustomEvent('modelPickerNumber', {
                      detail: { index: modelAssignedIndex, event },
                    }),
                  );
                }
                return;
              }
              // If model picker uses Control, DO NOT intercept Alt+digit: let Alt mappings handle it.
            } else {
              // No model assigned to this digit: do NOT intercept — let Alt+digit fall through to other Alt handlers.
            }
          }

          // Special handling: Alt+Ctrl+Key for previewOnly on shortcutKeyPreviousThread
          if (
            isCtrlPressed &&
            matchesShortcutKey(shortcuts.shortcutKeyPreviousThread, event) &&
            keyFunctionMappingAlt[shortcuts.shortcutKeyPreviousThread]
          ) {
            event.preventDefault();
            keyFunctionMappingAlt[shortcuts.shortcutKeyPreviousThread]({
              previewOnly: true,
              event,
            });
            return;
          }

          // Special handling: Alt+Ctrl+Key for previewOnly on shortcutKeyNextThread
          if (
            isCtrlPressed &&
            matchesShortcutKey(shortcuts.shortcutKeyNextThread, event) &&
            keyFunctionMappingAlt[shortcuts.shortcutKeyNextThread]
          ) {
            event.preventDefault();
            keyFunctionMappingAlt[shortcuts.shortcutKeyNextThread]({
              previewOnly: true,
              event,
            });
            return;
          }

          // Normal Alt+Key shortcut: handle mapped Alt shortcuts.
          // Note: digit keys that *were assigned to models* above were already handled and returned;
          // digit keys not assigned to models are allowed here and will be handled by keyFunctionMappingAlt.
          const matchedAltKey = Object.keys(keyFunctionMappingAlt).find((k) =>
            matchesShortcutKey(k, event),
          );
          if (matchedAltKey) {
            event.preventDefault();
            keyFunctionMappingAlt[matchedAltKey]({ previewOnly: false, event });
            return;
          }
        }

        // Handle Ctrl/Command‑based shortcuts (model‑menu toggle only, plus mapped Ctrl shortcuts)
        if (isCtrlPressed && !isAltPressed) {
          // If user chose Ctrl/Cmd for the model switcher, only intercept the toggle key (e.g. Ctrl + W).
          if (
            window.useControlForModelSwitcherRadio === true &&
            (keyIdentifier === modelToggleKey || event.code === modelToggleKey)
          ) {
            event.preventDefault();
            window.toggleModelSelector(); // open / close the menu
            return; // allow Ctrl/Cmd + 1‑5 to fall through to the IIFE
          }

          // … everything else (Ctrl + Enter, Ctrl + Backspace, etc.)
          const ctrlShortcut =
            keyFunctionMappingCtrl[keyIdentifier] || keyFunctionMappingCtrl[event.code];

          if (ctrlShortcut) {
            const enabled =
              isCtrlShortcutEnabled(keyIdentifier) || isCtrlShortcutEnabled(event.code);

            if (!enabled) return;

            const isBackspace = keyIdentifier === 'Backspace' || event.code === 'Backspace';

            if (isBackspace) {
              // Only intercept if a visible Stop button exists; otherwise let native deletion happen.
              const stopBtn = getVisibleStopButton();
              if (stopBtn) {
                event.preventDefault();
                try {
                  ctrlShortcut(); // will click the stop button
                } catch (e) {
                  console.error('Backspace handler failed:', e);
                }
              }
              // If no visible stop button: do nothing -> native Ctrl+Backspace behavior
            } else {
              // Non-Backspace Ctrl shortcuts behave as before
              event.preventDefault();
              ctrlShortcut();
            }
          }
        }
      });

      // Function to check if the specific Ctrl/Command + Key shortcut is enabled
      function isCtrlShortcutEnabled(key) {
        if (key === shortcuts.shortcutKeyClickSendButton) {
          return window.enableSendWithControlEnterCheckbox === true;
        }
        if (key === shortcuts.shortcutKeyClickStopButton) {
          return window.enableStopWithControlBackspaceCheckbox === true;
        }
        return false;
      }
    },
  );
})();

// ====================================
// @note UI Styling & Header Scaling
// ====================================
(() => {
  function applyInitialTransitions() {
    // Profile button
    const profileBtn = document.querySelector('button[data-testid="profile-button"]');
    if (profileBtn) {
      profileBtn.style.padding = '0';
      profileBtn.style.overflow = 'visible';
      const img = profileBtn.querySelector('img');
      if (img) {
        gsap.to(img, {
          scale: 0.85,
          transformOrigin: 'center',
          borderRadius: '50%',
          duration: 0.2,
          ease: 'power1.out',
        });
      }
      const rounded = profileBtn.querySelector('.rounded-full');
      if (rounded) {
        rounded.style.borderRadius = '50%';
        rounded.style.overflow = 'visible';
      }
    }

    // Conversation edit buttons hover behavior
    document.querySelectorAll('.group\\/conversation-turn').forEach((el) => {
      el.style.display = 'flex';
      el.style.opacity = '0.1';
      el.style.transition = 'opacity 0.2s ease-in-out';
      const parent = el.closest('.group\\/conversation-turn');
      if (parent) {
        parent.addEventListener('mouseenter', () => gsap.to(el, { opacity: 1, duration: 0.2 }));
        parent.addEventListener('mouseleave', () => gsap.to(el, { opacity: 0.1, duration: 0.2 }));
      }
    });

    // Disclaimer text color match
    document
      .querySelectorAll('.items-center.justify-center.p-2.text-center.text-xs')
      .forEach((el) => {
        gsap.to(el, {
          color: getComputedStyle(document.body).getPropertyValue('--main-surface-primary'),
          duration: 0.1,
          ease: 'power1.out',
        });
      });

    // Sidebar labels truncation
    document
      .querySelectorAll('nav .relative.grow.overflow-hidden.whitespace-nowrap')
      .forEach((el) => {
        el.style.whiteSpace = 'nowrap';
        el.style.overflow = 'hidden';
        el.style.textOverflow = 'ellipsis';
        el.style.fontSize = '0.9em';
      });

    // Sidebar headers
    document.querySelectorAll('nav h3.px-2.text-xs.font-semibold').forEach((el) => {
      el.style.display = 'block';
      el.style.backgroundColor = 'var(--sidebar-surface-primary)';
      el.style.width = '100%';
    });

    // Kill sidebar scrollbar
    const main = document.querySelector('#main.transition-width');
    if (main) {
      main.style.overflowY = '';
    }
  }

  // Initial pass after layout is stable
  const ready = () => {
    applyInitialTransitions();

    // Observer for dynamic nodes
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;

          // Late-loaded conversation edit buttons
          if (n.matches('.group\\/conversation-turn')) {
            gsap.set(n, { opacity: 0.1 });
            const parent = n.closest('.group\\/conversation-turn');
            if (parent) {
              parent.addEventListener('mouseenter', () =>
                gsap.to(n, { opacity: 1, duration: 0.2 }),
              );
              parent.addEventListener('mouseleave', () =>
                gsap.to(n, { opacity: 0.1, duration: 0.2 }),
              );
            }
          }

          // Delayed header fade (originally timeout-based)
          if (n.matches('.flex.h-\\[44px\\].items-center.justify-between')) {
            gsap.to(n, {
              opacity: 0.3,
              duration: 0.2,
              ease: 'sine.out',
            });
          }

          // Shrink header height if `.md\:h-header-height` appears
          if (n.matches('.md\\:h-header-height')) {
            n.style.height = 'fit-content';
          }

          // Hide late anchor buttons
          if (n.matches('a.group.flex.gap-2')) {
            gsap.set(n, {
              opacity: 0,
              pointerEvents: 'none',
              width: 0,
              height: 0,
              overflow: 'hidden',
            });
          }
        }
      }
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });
  };

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();

// =========================================
// @note PageUp/PageDown Key Takeover Logic
// =========================================
(() => {
  // Handle PageUp & PageDown scrolling with GSAP
  function handleKeyDown(event) {
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      resetScrollState(); // Reset shared state

      event.stopPropagation();
      event.preventDefault();

      const scrollContainer = getScrollableContainer();
      if (!scrollContainer) return;

      const viewportHeight = window.innerHeight * 0.8; // Keep the native PageUp/PageDown feel
      const direction = event.key === 'PageUp' ? -1 : 1;
      let targetScrollPosition = scrollContainer.scrollTop + direction * viewportHeight;

      // Ensure we don't scroll past the natural top/bottom limits
      const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      targetScrollPosition = Math.max(0, Math.min(targetScrollPosition, maxScroll));

      // Use GSAP for smooth scrolling with slow end effect
      gsap.to(scrollContainer, {
        duration: 0.3, // Slightly longer for smoother motion
        scrollTo: {
          y: targetScrollPosition,
        },
        ease: 'power4.out', // Ensures gradual deceleration at the end
      });
    }
  }

  // Stop animation on user interaction (wheel/touch)
  function handleUserInteraction() {
    resetScrollState(); // Interrupt animation and reset state
  }

  // Attach or detach the event listener
  function toggleEventListener(enabled) {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('wheel', handleUserInteraction, {
        passive: true,
      });
      document.addEventListener('touchstart', handleUserInteraction, {
        passive: true,
      });
    } else {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('wheel', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    }
  }

  // Initialize PageUp/PageDown takeover
  function initializePageUpDownTakeover() {
    chrome.storage.sync.get(['pageUpDownTakeover'], (data) => {
      const enabled = data.pageUpDownTakeover !== false;
      toggleEventListener(enabled);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.pageUpDownTakeover) {
        const enabled = changes.pageUpDownTakeover.newValue !== false;
        toggleEventListener(enabled);
      }
    });
  }

  initializePageUpDownTakeover();
})();

// ==================================================
// @note expose edit buttons with simulated mouse hover
// ==================================================
(function injectAlwaysVisibleStyle() {
  const style = document.createElement('style');
  style.textContent = `

/* Ensure parents can receive hover events */
div.flex.justify-start,
div.flex.justify-end {
    pointer-events: auto !important;
}

/* Force group-hover/turn-messages always visible, pointer-events always on */
div[class*="group-hover/turn-messages"] {
    opacity: 0.2 !important;
    pointer-events: auto !important;
    transition: opacity 0.5s !important;
}

/* Dark mode override for opacity */
.dark div[class*="group-hover/turn-messages"] {
    opacity: 0.08 !important;
}

/* Hover or JS-forced state: fully visible */
div[class*="group-hover/turn-messages"]:hover,
div[class*="group-hover/turn-messages"].force-full-opacity {
    opacity: 1 !important;
}

/* Make sure we also override any tailwind transitions that might re-add pointer-events */
div[class*="group-hover/turn-messages"] * {
    pointer-events: auto !important;
}

/* Hide warning by ID */
div[data-id="hide-this-warning"] {
    color: var(--main-surface-primary);
}

/* Pointer events and mask for custom group-hover utilities */
.group-hover\\/turn-messages\\:pointer-events-auto,
.group-hover\\/turn-messages\\:\\[mask-position\\:0_0\\] {
    pointer-events: auto !important;
    mask-position: 0% 0% !important;
}

/* Hide upgrade button in sidebar Robust selector. Hide upgrade ad but not profile menu. Reference 101 */
/* Hide the first .__menu-item with data-fill, but not the profile menu */


/* Make the sidebar header shorter */
div.bg-token-bg-elevated-secondary.sticky.top-0 {
    padding-top: 2px !important;
    padding-bottom: 2px !important;
    margin-top: 2px !important;
    margin-bottom: 2px !important;
    min-height: 44px !important;
}

/* Reduce height of the inner header container */
#sidebar-header {
    min-height: 40px !important;
    height: 40px !important;
}

/* Reduce padding of bottom sticky sidebar (user settings button container) */
/* ReferenceLocation 101 = location for the logic to hide the user settings button when the moveTop bar to bottom enable is enabled */
.bg-token-bg-elevated-secondary.sticky.bottom-0 {
    padding-top: 2px !important;
    padding-bottom: 2px !important;
}

/* Hide the upgrade ad in sidebar */

/* accounts-profile-button to make it smaller */
div[data-testid="accounts-profile-button"] {
    padding-top: 2px !important;
    padding-bottom: 2px !important;
}

div[data-testid="accounts-profile-button"] div.truncate {
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    max-width: 100% !important;
}

/* Fix sidebar showing horizontal scroll bars  */
nav.group\\/scrollport {
overflow-x: hidden !important;
}

// Remove horizontal scrolling from sidebar
nav.group/scrollport.relative.flex.h-full.w-full.flex-1.flex-col.overflow-y-auto.transition-opacity.duration-500 {
overflow-x:hidden!important;
}

aside {
    padding-top: 0 !important;
    top: 40px;
    padding-bottom: 11px;
}

// fix some issue some people have where they can't scroll while in a project

.composer-parent.flex.flex-col.overflow-hidden.focus-visible:outline-0.h-full {
    overflow: auto;
}

button.btn.btn-secondary.shadow-long.flex.rounded-xl.border-none.active:opacity-1 {
  opacity: 1 !important;
}


`;
  document.head.appendChild(style);

  // Decide how faded the buttons are in light/dark mode
  function getFadeOpacity() {
    if (
      document.documentElement.classList.contains('dark') ||
      document.body.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 0.08;
    }
    return 0.2;
  }

  // Attach to all .flex.justify-start OR .flex.justify-end
  document.querySelectorAll('div.flex.justify-start, div.flex.justify-end').forEach((parent) => {
    // Find the child that contains "group-hover/turn-messages"
    // (Does not need to be a direct child if you prefer querySelector)
    const child = parent.querySelector('div[class*="group-hover/turn-messages"]');
    if (!child) return;

    let fadeTimeout = null;

    // Show the child immediately on hover
    parent.addEventListener('mouseenter', () => {
      clearTimeout(fadeTimeout);
      child.classList.add('force-full-opacity');
      child.style.opacity = '1';
    });

    // Fade the child out 2s after mouse leaves
    parent.addEventListener('mouseleave', () => {
      fadeTimeout = setTimeout(() => {
        child.classList.remove('force-full-opacity');
        child.style.opacity = getFadeOpacity();
      }, 2000);
    });

    // Set initial opacity according to current mode
    child.style.opacity = getFadeOpacity();
  });
})();

// ==================================================
// @note TopBarToBottom Feature
// ==================================================
(() => {
  chrome.storage.sync.get(
    { moveTopBarToBottomCheckbox: false },
    ({ moveTopBarToBottomCheckbox: enabled }) => {
      if (!enabled) return;

      // Blacklist logic for specific paths/hostnames
      const hostname = location.hostname.replace(/^www\./, '');
      const pathname = location.pathname;

      // Matches "*://chatgpt.com/gpts*"
      const isGpts = hostname === 'chatgpt.com' && pathname.startsWith('/gpts');
      // Matches "*://chatgpt.com/codex*"
      const isCodex = hostname === 'chatgpt.com' && pathname.startsWith('/codex');
      // Matches "*://chatgpt.com/g/*"
      const isG = hostname === 'chatgpt.com' && pathname.startsWith('/g/');
      // Matches "*://sora.chatgpt.com/*"
      const isSora = hostname === 'sora.chatgpt.com';
      // Matches "*://chatgpt.com/library/*"
      const isLibrary = hostname === 'chatgpt.com' && pathname.startsWith('/library/');

      if (isGpts || isCodex || isG || isSora || isLibrary) return;

      // --- Early gate ---
      (async function main() {
        async function gateIfLoginButtonPresent() {
          function sleep(ms) {
            return new Promise((r) => setTimeout(r, ms));
          }
          let header,
            flexChildren,
            tries = 0;
          while (tries++ < 25) {
            header = document.querySelector('#page-header');
            if (header) {
              flexChildren = header.querySelectorAll(':scope > .flex.items-center');
              if (flexChildren.length > 0) break;
            }
            await sleep(200);
          }
          if (!header || !flexChildren || flexChildren.length === 0) return false;
          for (const seg of [flexChildren[0], flexChildren[flexChildren.length - 1]]) {
            const loginBtn = seg?.querySelector('button[data-testid="login-button"]');
            if (loginBtn) return true;
          }
          return false;
        }
        if (await gateIfLoginButtonPresent()) return; // GATE: do nothing!

        setTimeout(function injectBottomBarStyles() {
          // -------------------- Section 1. Utilities --------------------
          async function waitForElement(selector, timeout = 12000, poll = 200) {
            const start = Date.now();
            let el = null;

            while (Date.now() - start < timeout) {
              el = document.querySelector(selector);
              if (el) return el;
              await new Promise((r) => setTimeout(r, poll));
            }

            return null; // timed out
          }

          // ------------------------------------------------------------------------
          // (A) One-time storage fetch approach:
          //     Only fetch once from chrome.storage.sync to avoid repeated calls,
          //     and keep the resolved value in a single Promise.
          // ------------------------------------------------------------------------
          let opacityValuePromise;
          function ensureOpacityValueReady() {
            // Return the already-fetched value if we have it
            if (opacityValuePromise) return opacityValuePromise;

            // Otherwise, build the one-time promise that fetches from storage
            opacityValuePromise = new Promise((resolve) => {
              // If chrome.storage.sync is missing/invalid, fallback silently to 0.6
              if (!chrome?.storage?.sync) {
                window.popupBottomBarOpacityValue = 0.6;
                return resolve(window.popupBottomBarOpacityValue);
              }

              try {
                chrome.storage.sync.get({ popupBottomBarOpacityValue: 0.6 }, (res) => {
                  if (chrome.runtime.lastError) {
                    // console.error("Error:", chrome.runtime.lastError); // comment out if you want silence
                    window.popupBottomBarOpacityValue = 0.6;
                  } else {
                    window.popupBottomBarOpacityValue =
                      typeof res.popupBottomBarOpacityValue === 'number'
                        ? res.popupBottomBarOpacityValue
                        : 0.6;
                  }
                  resolve(window.popupBottomBarOpacityValue);
                });
              } catch {
                // console.error("Failed chrome.storage.sync.get"); // left silent
                window.popupBottomBarOpacityValue = 0.6;
                resolve(window.popupBottomBarOpacityValue);
              }
            });

            return opacityValuePromise;
          }

          // -------------------- Section 2. Main Logic & Reinject --------------------
          setTimeout(() => {
            (() => {
              runMoveTopBarLogic();
              // Stay alive if DOM changes (mutation-observe, auto re-inject)
              let reinjectTimeout;
              new MutationObserver(() => {
                clearTimeout(reinjectTimeout);
                reinjectTimeout = setTimeout(runMoveTopBarLogic, 350);
              }).observe(document.body, { childList: true, subtree: true });

              async function runMoveTopBarLogic() {
                await ensureOpacityValueReady(); // Wait for storage fetch
                // Wait for target UI pieces
                async function getTopBarSegments() {
                  const header = await waitForElement('#page-header', 12000, 200);
                  if (!header) return [null, null];
                  const flexChildren = Array.from(
                    header.querySelectorAll(':scope > .flex.items-center'),
                  );
                  if (!flexChildren.length) return [null, null];
                  if (flexChildren.length === 1) return [flexChildren[0], flexChildren[0]];
                  return [flexChildren[0], flexChildren[flexChildren.length - 1]];
                }

                const [topBarLeft, topBarRight] = await getTopBarSegments();
                const composerForm = await waitForElement(
                  "form[data-type='unified-composer']",
                  12000,
                  200,
                );

                if (!topBarLeft || !topBarRight || !composerForm) return;
                const composerContainer =
                  composerForm.querySelector('.border-token-border-default') || composerForm;

                injectBottomBar(topBarLeft, topBarRight, composerContainer);

                // Grayscale Profile Button
                waitForElement('button[data-testid="profile-button"]').then((profileButton) => {
                  if (profileButton) {
                    applyInitialGrayscale(profileButton);
                    observeProfileButton(profileButton);
                  }
                });
              }

              // ---------- Section 3 • Bottom Bar Creation ----------
              /* one global debounce helper — defined ONCE in the IIFE ------------------ */
              if (!window.__bbDebounce) {
                window.__bbDebounce = function (fn, wait = 80) {
                  let t;
                  return (...a) => {
                    clearTimeout(t);
                    t = setTimeout(() => fn.apply(this, a), wait);
                  };
                };
              }
              const debounce = window.__bbDebounce;

              /* ----------------------------------------------------------------------- */
              function injectBottomBar(topBarLeft, topBarRight, composerContainer) {
                /* prevent double‑injection ------------------------------------------ */
                let bottomBar = document.getElementById('bottomBarContainer');

                /* width + scale helpers: always defined so calls never fail ---------- */
                function setWidth() {
                  if (!bottomBar) return;
                  bottomBar.style.width = window.getComputedStyle(composerContainer).width;
                }
                function scaleOnce() {
                  if (!bottomBar) return 1;
                  const avail = composerContainer.clientWidth;
                  const content = bottomBar.scrollWidth;
                  const s = Math.min(1, avail / content);
                  bottomBar.style.transform = `scale(${s})`;
                  bottomBar.style.transformOrigin = 'left center';
                  return s;
                }
                function scaleUntilStable() {
                  let prev;
                  const loop = () => {
                    setWidth();
                    const curr = scaleOnce();
                    if (curr !== prev) {
                      prev = curr;
                      requestAnimationFrame(loop); // keep looping until stable
                    }
                  };
                  loop();
                }
                const debouncedStable = debounce(scaleUntilStable, 60);

                if (!bottomBar) {
                  /* create bar ----------------------------------------------------- */
                  bottomBar = document.createElement('div');
                  bottomBar.id = 'bottomBarContainer';
                  Object.assign(bottomBar.style, {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0 12px',
                    margin: '0',
                    minHeight: 'unset',
                    lineHeight: '1',
                    gap: '8px',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                    opacity: '1',
                    transition: 'opacity 0.5s',
                  });

                  /* observe container resize + window resize (only once) ----------- */
                  new ResizeObserver(debouncedStable).observe(composerContainer);
                  window.addEventListener('resize', debouncedStable);

                  /* fade / opacity handlers --------------------------------------- */
                  const idleOpacity = () => {
                    const value =
                      typeof window.popupBottomBarOpacityValue === 'number'
                        ? window.popupBottomBarOpacityValue
                        : 0.6;
                    if (bottomBar) bottomBar.style.opacity = String(value);
                  };

                  let fadeT;
                  setTimeout(idleOpacity, 2500);
                  bottomBar.addEventListener('mouseover', () => {
                    clearTimeout(fadeT);
                    if (bottomBar) bottomBar.style.opacity = '1';
                    if (typeof setGrayscale === 'function') setGrayscale(false);
                  });
                  bottomBar.addEventListener('mouseout', () => {
                    fadeT = setTimeout(() => {
                      idleOpacity();
                      if (typeof setGrayscale === 'function') setGrayscale(true);
                    }, 2500);
                  });

                  /* capture scroll, insert, restore ------------------------------- */
                  const sc =
                    typeof getScrollableContainer === 'function' && getScrollableContainer();
                  const prevScrollBot = sc ? sc.scrollHeight - sc.scrollTop : 0;
                  (composerContainer.closest('form') || composerContainer).insertAdjacentElement(
                    'afterend',
                    bottomBar,
                  );
                  if (sc) sc.scrollTop += sc.scrollHeight - prevScrollBot;

                  /* run first stable scale pass after insertion ------------------- */
                  requestAnimationFrame(scaleUntilStable);
                  setTimeout(scaleUntilStable, 1500);

                  /* gsap intro ---------------------------------------------------- */
                  gsap.set(bottomBar, { opacity: 0, y: 10, display: 'flex' });
                  gsap.to(bottomBar, {
                    opacity: 1,
                    y: 0,
                    duration: 0.2,
                    ease: 'power2.out',
                  });
                }

                /* ----- left / center / right containers ------------------------------------ */
                let left = document.getElementById('bottomBarLeft');
                let center = document.getElementById('bottomBarCenter');
                let right = document.getElementById('bottomBarRight');

                if (!left) {
                  left = document.createElement('div');
                  left.id = 'bottomBarLeft';
                  left.style.display = 'flex';
                  left.style.alignItems = 'center';
                  left.style.gap = '2px';
                  bottomBar.appendChild(left);
                }

                if (!right) {
                  right = document.createElement('div');
                  right.id = 'bottomBarRight';
                  right.style.display = 'flex';
                  right.style.alignItems = 'center';
                  right.style.gap = '2px';
                  right.style.marginLeft = 'auto';
                  bottomBar.appendChild(right);
                }

                if (!center) {
                  center = document.createElement('div');
                  center.id = 'bottomBarCenter';
                  center.style.display = 'flex';
                  center.style.alignItems = 'center';
                  center.style.gap = '6px';
                  // ensure the center sits between left and right
                  bottomBar.insertBefore(center, right);
                } else if (center.nextSibling !== right) {
                  // keep center situated between left and right if DOM reorders
                  bottomBar.insertBefore(center, right);
                }

                // Clean up left so only static buttons + topBarLeft remain
                [...left.children].forEach((c) => {
                  const keep = ['static-sidebar-btn', 'static-newchat-btn'];
                  if (!keep.includes(c.dataset.id) && c !== topBarLeft) c.remove();
                });

                if (!left.contains(topBarLeft)) left.appendChild(topBarLeft);
                if (!right.contains(topBarRight)) right.appendChild(topBarRight);

                // Find and move the model switcher into the center area
                (function placeModelSwitcherInCenter() {
                  // robust selector set
                  const findModelBtn = () =>
                    document.querySelector('#page-header button[aria-label^="Model selector" i]') ||
                    document.querySelector(
                      '#page-header button[data-testid="Model-switCher-dropdown-button"]',
                    ) ||
                    document.querySelector(
                      '#bottomBarContainer button[aria-label^="Model selector" i]',
                    ) ||
                    document.querySelector(
                      'button[data-testid="Model-switCher-dropdown-button"]',
                    ) ||
                    document.querySelector('button[aria-label^="Model selector" i]');

                  const btn = findModelBtn();
                  if (!btn) return;

                  // Prefer moving its flex group wrapper to preserve spacing
                  let group =
                    btn.closest('#page-header .flex.items-center') ||
                    btn.closest('#bottomBarContainer .flex.items-center') ||
                    btn.closest('.flex.items-center') ||
                    btn;

                  // If it's already in the center, do nothing
                  if (center.contains(group)) return;

                  // Avoid accidentally moving the entire right container
                  if (group === right) group = btn;

                  // Drop the model switcher into the center container
                  center.appendChild(group);
                })();

                injectStaticButtons(left);
                adjustBottomBarTextScaling(bottomBar);
                debounce(() => {
                  /* re‑scale once text truncation done */
                  scaleUntilStable();
                }, 50)();

                /* hide stale disclaimer ------------------------------------------- */
                const old = document.querySelector(
                  'div.text-token-text-secondary.relative.mt-auto.flex.min-h-8.w-full.items-center.justify-center.p-2.text-center.text-xs',
                );
                if (old)
                  gsap.to(old, {
                    opacity: 0,
                    duration: 0.4,
                    ease: 'sine.out',
                    onComplete: () => {
                      old.style.display = 'none';
                    },
                  });
              }

              // -------------------- Section 4. Static Buttons --------------------
              function injectStaticButtons(leftContainer) {
                // ---- 4.1  Static Toggle‑Sidebar Button ----
                let btnSidebar = leftContainer.querySelector(
                  'button[data-id="static-sidebar-btn"]',
                );
                if (!btnSidebar) {
                  btnSidebar = createStaticButton({
                    label: 'Static Toggle Sidebar',
                    svg: '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M8.85720 3H15.1428C16.2266 2.99999 17.1007 2.99998 17.8086 3.05782C18.5375 3.11737 19.1777 3.24318 19.77 3.54497C20.7108 4.02433 21.4757 4.78924 21.955 5.73005C22.2568 6.32234 22.3826 6.96253 22.4422 7.69138C22.5 8.39925 22.5 9.27339 22.5 10.3572V13.6428C22.5 14.7266 22.5 15.6008 22.4422 16.3086C22.3826 17.0375 22.2568 17.6777 21.955 18.27C21.4757 19.2108 20.7108 19.9757 19.77 20.455C19.1777 20.7568 18.5375 20.8826 17.8086 20.9422C17.1008 21 16.2266 21 15.1428 21H8.85717C7.77339 21 6.89925 21 6.19138 20.9422C5.46253 20.8826 4.82234 20.7568 4.23005 20.455C3.28924 19.9757 2.52433 19.2108 2.04497 18.27C1.74318 17.6777 1.61737 17.0375 1.55782 16.3086C1.49998 15.6007 1.49999 14.7266 1.5 13.6428V10.3572C1.49999 9.27341 1.49998 8.39926 1.55782 7.69138C1.61737 6.96253 1.74318 6.32234 2.04497 5.73005C2.52433 4.78924 3.28924 4.02433 4.23005 3.54497C4.82234 3.24318 5.46253 3.11737 6.19138 3.05782C6.89926 2.99998 7.77341 2.99999 8.85719 3ZM6.35424 5.05118C5.74907 5.10062 5.40138 5.19279 5.13803 5.32698C4.57354 5.6146 4.1146 6.07354 3.82698 6.63803C3.69279 6.90138 3.60062 7.24907 3.55118 7.85424C3.50078 8.47108 3.5 9.26339 3.5 10.4V13.6C3.5 14.7366 3.50078 15.5289 3.55118 16.1458C3.60062 16.7509 3.69279 17.0986 3.82698 17.362C4.1146 17.9265 4.57354 18.3854 5.13803 18.673C5.40138 18.8072 5.74907 18.8994 6.35424 18.9488C6.97108 18.9992 7.76339 19 8.9 19H9.5V5H8.9C7.76339 5 6.97108 5.00078 6.35424 5.05118ZM11.5 5V19H15.1C16.2366 19 17.0289 18.9992 17.6458 18.9488C18.2509 18.8994 18.5986 18.8072 18.862 18.673C19.4265 18.3854 19.8854 17.9265 20.173 17.362C20.3072 17.0986 20.3994 16.7509 20.4488 16.1458C20.4992 15.5289 20.5 14.7366 20.5 13.6V10.4C20.5 9.26339 20.4992 8.47108 20.4488 7.85424C20.3994 7.24907 20.3072 6.90138 20.173 6.63803C19.8854 6.07354 19.4265 5.6146 18.862 5.32698C18.5986 5.19279 18.2509 5.10062 17.6458 5.05118C17.0289 5.00078 16.2366 5 15.1 5H11.5ZM5 8.5C5 7.94772 5.44772 7.5 6 7.5H7C7.55229 7.5 8 7.94772 8 8.5C8 9.05229 7.55229 9.5 7 9.5H6C5.44772 9.5 5 9.05229 5 8.5ZM5 12C5 11.4477 5.44772 11 6 11H7C7.55229 11 8 11.4477 8 12C8 12.5523 7.55229 13 7 13H6C5.44772 13 5 12.5523 5 12Z"/></svg>',
                    proxySelector:
                      'button[data-testid="open-sidebar-button"],button[data-testid="close-sidebar-button"]',
                    fallbackShortcut: {
                      ctrl: true,
                      shift: true,
                      key: 's',
                      code: 'KeyS',
                    },
                  });
                  leftContainer.insertBefore(btnSidebar, leftContainer.firstChild);
                }

                // ---- 4.2  Static New‑Chat Button ----
                let btnNewChat = leftContainer.querySelector(
                  'button[data-id="static-newchat-btn"]',
                );
                if (!btnNewChat) {
                  btnNewChat = createStaticButton({
                    label: 'Static New Chat',
                    svg: '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M15.6730 3.91287C16.8918 2.69392 18.8682 2.69392 20.0871 3.91287C21.3061 5.13182 21.3061 7.10813 20.0871 8.32708L14.1499 14.2643C13.3849 15.0293 12.3925 15.5255 11.3215 15.6785L9.14142 15.9899C8.82983 16.0344 8.51546 15.9297 8.29289 15.7071C8.07033 15.4845 7.96554 15.1701 8.01005 14.8586L8.32149 12.6785C8.47449 11.6075 8.97072 10.615 9.7357 9.85006L15.6729 3.91287ZM18.6729 5.32708C18.235 4.88918 17.525 4.88918 17.0871 5.32708L11.1499 11.2643C10.6909 11.7233 10.3932 12.3187 10.3014 12.9613L10.1785 13.8215L11.0386 13.6986C11.6812 13.6068 12.2767 13.3091 12.7357 12.8501L18.6729 6.91287C19.1108 6.47497 19.1108 5.76499 18.6729 5.32708ZM11 3.99929C11.0004 4.55157 10.5531 4.99963 10.0008 5.00007C9.00227 5.00084 8.29769 5.00827 7.74651 5.06064C7.20685 5.11191 6.88488 5.20117 6.63803 5.32695C6.07354 5.61457 5.6146 6.07351 5.32698 6.63799C5.19279 6.90135 5.10062 7.24904 5.05118 7.8542C5.00078 8.47105 5 9.26336 5 10.4V13.6C5 14.7366 5.00078 15.5289 5.05118 16.1457C5.10062 16.7509 5.19279 17.0986 5.32698 17.3619C5.6146 17.9264 6.07354 18.3854 6.63803 18.673C6.90138 18.8072 7.24907 18.8993 7.85424 18.9488C8.47108 18.9992 9.26339 19 10.4 19H13.6C14.7366 19 15.5289 18.9992 16.1458 18.9488C16.7509 18.8993 17.0986 18.8072 17.362 18.673C17.9265 18.3854 18.3854 17.9264 18.673 17.3619C18.7988 17.1151 18.8881 16.7931 18.9393 16.2535C18.9917 15.7023 18.9991 14.9977 18.9999 13.9992C19.0003 13.4469 19.4484 12.9995 20.0007 13C20.553 13.0004 21.0003 13.4485 20.9999 14.0007C20.9991 14.9789 20.9932 15.7808 20.9304 16.4426C20.8664 17.116 20.7385 17.7136 20.455 18.2699C19.9757 19.2107 19.2108 19.9756 18.27 20.455C17.6777 20.7568 17.0375 20.8826 16.3086 20.9421C15.6008 21 14.7266 21 13.6428 21H10.3572C9.27339 21 8.39925 21 7.69138 20.9421C6.96253 20.8826 6.32234 20.7568 5.73005 20.455C4.78924 19.9756 4.02433 19.2107 3.54497 18.2699C3.24318 17.6776 3.11737 17.0374 3.05782 16.3086C2.99998 15.6007 2.99999 14.7266 3 13.6428V10.3572C2.99999 9.27337 2.99998 8.39922 3.05782 7.69134C3.11737 6.96249 3.24318 6.3223 3.54497 5.73001C4.02433 4.7892 4.78924 4.0243 5.73005 3.54493C6.28633 3.26149 6.88399 3.13358 7.55735 3.06961C8.21919 3.00673 9.02103 3.00083 9.99922 3.00007C10.5515 2.99964 10.9996 3.447 11 3.99929Z"/></svg>',
                    proxySelector: 'button[data-testid="new-chat-button"]',
                    fallbackShortcut: {
                      ctrl: true,
                      shift: true,
                      key: 'o',
                      code: 'KeyO',
                    },
                  });
                  leftContainer.insertBefore(btnNewChat, btnSidebar.nextSibling);
                }
              }

              /* ---------- shared helper ---------- */
              function createStaticButton({ label, svg, proxySelector, fallbackShortcut }) {
                const btn = document.createElement('button');
                btn.setAttribute('aria-label', label);
                btn.setAttribute(
                  'data-id',
                  label.toLowerCase().includes('sidebar')
                    ? 'static-sidebar-btn'
                    : 'static-newchat-btn',
                );

                // ---- visual styling (unchanged) ----
                btn.innerHTML = svg;
                btn.className =
                  'text-token-text-secondary focus-visible:bg-token-surface-hover ' +
                  'enabled:hover:bg-token-surface-hover disabled:text-token-text-quaternary ' +
                  'h-10 rounded-lg px-2 focus-visible:outline-0';
                Object.assign(btn.style, {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '36px',
                  padding: '8px',
                });

                /* ---- behaviour ---- */
                btn.onclick = (e) => {
                  e.preventDefault();
                  e.stopImmediatePropagation();

                  // Attempt shortcut first (if defined)…
                  if (fallbackShortcut) {
                    const { key, code, ctrl, shift, alt = false, meta = false } = fallbackShortcut;
                    const isMac = isMacPlatform();

                    const evtInit = {
                      key: key.toUpperCase(),
                      code,
                      keyCode: key.toUpperCase().charCodeAt(0),
                      which: key.toUpperCase().charCodeAt(0),
                      bubbles: true,
                      cancelable: true,
                      composed: true,
                      shiftKey: !!shift,
                      ctrlKey: !!ctrl && !isMac,
                      metaKey: !!meta || (isMac && !!ctrl),
                      altKey: !!alt,
                    };

                    // `dispatchEvent` returns FALSE if preventDefault was called → means the page handled our shortcut
                    const shortcutUnhandled = document.dispatchEvent(
                      new KeyboardEvent('keydown', evtInit),
                    );
                    document.dispatchEvent(new KeyboardEvent('keyup', evtInit));

                    // …fallback to click only when the shortcut was NOT handled
                    if (shortcutUnhandled) {
                      const target = document.querySelector(proxySelector);
                      if (target?.offsetParent !== null) target.click();
                    }
                  } else {
                    // No shortcut defined → always click
                    const target = document.querySelector(proxySelector);
                    if (target?.offsetParent !== null) target.click();
                  }
                };

                return btn;
              }

              // -------------------- Section 5. Grayscale Profile Button --------------------
              let profileBtnRef;
              function applyInitialGrayscale(btn) {
                if (!btn) return;
                profileBtnRef = btn;
                btn.style.setProperty('filter', 'grayscale(100%)', 'important');
                btn.style.setProperty('transition', 'filter 0.4s ease', 'important');
              }
              function setGrayscale(state) {
                if (!profileBtnRef) return;
                profileBtnRef.style.setProperty(
                  'filter',
                  state ? 'grayscale(100%)' : 'grayscale(0%)',
                  'important',
                );
              }
              function observeProfileButton(btn) {
                const parent = btn.parentElement || document.body;
                const observer = new MutationObserver(() => {
                  const newBtn = document.querySelector('button[data-testid="profile-button"]');
                  if (newBtn && newBtn !== profileBtnRef) {
                    applyInitialGrayscale(newBtn);
                  }
                });
                observer.observe(parent, { childList: true, subtree: false });
              }

              // ---------- Section 6 • Text Truncation ----------

              function applyOneLineEllipsis(el) {
                el.style.setProperty('white-space', 'nowrap', 'important');
                el.style.setProperty('overflow', 'hidden', 'important');
                el.style.setProperty('text-overflow', 'ellipsis', 'important');
                // keep the current font‑size; no shrinking logic
              }

              function adjustBottomBarTextScaling(bar) {
                bar.querySelectorAll('.truncate').forEach((el) => {
                  if (
                    el.closest(
                      'button[data-id="static-sidebar-btn"],button[data-id="static-newchat-btn"]',
                    )
                  )
                    return;
                  applyOneLineEllipsis(el);
                });
              }

              function initAdjustBottomBarTextScaling() {
                const bar = document.querySelector('#bottomBarContainer, .bottom-bar');
                if (!bar) return;

                const run = () => adjustBottomBarTextScaling(bar);
                const deb = debounce(run, 100);

                run(); // initial pass
                window.addEventListener('resize', deb);
                new ResizeObserver(deb).observe(bar); // re‑apply on layout changes
              }

              document.addEventListener('DOMContentLoaded', initAdjustBottomBarTextScaling);
            })();
          }, 500);

          // -------------------- Section 7. Style Injection ("global") --------------------

          (function injectBottomBarStyles() {
            const style = document.createElement('style');
            style.textContent = `
                    .draggable.sticky.top-0 {
                        opacity: 0 !important; pointer-events: none !important;
                        position: absolute !important; width: 1px !important; height: 1px !important; overflow: hidden !important;
                    }
                    #bottomBarContainer { padding-top:0!important; padding-bottom:0!important; margin-top:2px!important; margin-bottom:2px!important; overflow-anchor:none!important;}
                    #bottomBarContainer button:hover {filter:brightness(1.1)!important;}
                    div[data-id="hide-this-warning"] {
                        opacity:0!important; pointer-events:none!important; position:absolute!important;
                        width:1px!important; height:1px!important; overflow:hidden!important;
                    }
                    #bottomBarContainer button[data-testid="open-sidebar-button"] {
                        opacity: 0 !important;
                        pointer-events: none !important;
                        position: absolute !important;
                        width: 1px !important;
                        height: 1px !important;
                        overflow: hidden !important;
                    }
                    #bottomBarContainer #conversation-header-actions a[href="/"][data-discover="true"] {
                        opacity: 0 !important;
                        pointer-events: none !important;
                        position: absolute !important;
                        width: 1px !important;
                        height: 1px !important;
                        overflow: hidden !important;
                    }
                    div#bottomBarLeft { scale: 0.9; }
                    div#bottomBarCenter { scale: 0.9; }
                    div#bottomBarRight { scale: 0.85; padding-right: 0em;}
                    #thread-bottom-container {margin-bottom:0em;}

                    #bottomBarContainer button:has(svg > path[d^="M8.85719 3H15.1428C16.2266 2.99999"]),
                    #bottomBarContainer button:has(svg > path[d^="M6.83496"]),
                    #bottomBarContainer button:has(svg > path[d^="M2.6687"]),
                    #bottomBarContainer a:has(svg > path[d^="M2.6687"]),
                    #bottomBarContainer a:has(svg > path[d^="M8.85719 3H15.1428C16.2266 2.99999"]),
                    #bottomBarContainer button:has(svg > path[d^="M15.6729 3.91287C16.8918"]),
                    #bottomBarContainer button:has(svg > path[d^="M9.65723 2.66504C9.47346"]),
                    #bottomBarContainer a:has(svg > path[d^="M9.65723 2.66504C9.47346"]),
                    #bottomBarContainer a:has(svg > path[d^="M15.6729 3.91287C16.8918"]),
                    #bottomBarContainer button:has(svg > path[d^="M8.85719 3L13.5"]),
                    #bottomBarContainer a:has(svg > path[d^="M11.6663 12.6686L11.801"]),
                    #bottomBarContainer button:has(svg > path[d^="M11.6663 12.6686L11.801"]) {
                    visibility: hidden !important;
                    position: absolute !important;
                    width: 1px !important;
                    height: 1px !important;
                    overflow: hidden !important;
                    }

                    /* one‑line truncation for bottom‑bar text */
                    #bottomBarContainer .truncate,
                    #bottomBarLeft      .truncate,
                    #bottomBarCenter    .truncate,
                    #bottomBarRight     .truncate {
                    
                    white-space: nowrap !important;   /* single line */
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    word-break: break-word !important;
                    /* removed: -webkit-line-clamp, -webkit-box-orient, font‑size, line‑height, max‑height */
                    }


                    /* ReferenceLocation 101 hide the user setting button in sidebar, but ONLY when moveTopBarToBottomCheckbox feature is enabled */

                    /* Nudge the legacy models submenu (left popper) up by 50px when bottomBarContainer is present */

                    .mb-4 {
                    margin-bottom: 4px;
                    }

                `;
            document.head.appendChild(style);
          })();

          // -------------------- Section 7.1. Bottom Bar Mutation Observer for Duplicate Buttons --------------------
          (() => {
            const PATH_PREFIXES = ['M15.6729', 'M8.85719'];
            const SELECTOR = ['button', 'a']
              .map((tag) =>
                PATH_PREFIXES.map((prefix) => `${tag} svg > path[d^="${prefix}"]`).join(','),
              )
              .join(',');

            function hideMatchedElements(container) {
              if (!container) return;
              // Find all matching paths in the container
              const paths = container.querySelectorAll(SELECTOR);
              paths.forEach((path) => {
                const el = path.closest('button,a');
                if (el) {
                  el.style.setProperty('visibility', 'hidden', 'important');
                  el.style.setProperty('position', 'absolute', 'important');
                  el.style.setProperty('width', '1px', 'important');
                  el.style.setProperty('height', '1px', 'important');
                  el.style.setProperty('overflow', 'hidden', 'important');
                  // Optional: add a data attribute so you can track which elements were hidden
                  el.setAttribute('data-ext-hidden', 'true');
                }
              });
            }

            // Setup mutation observer
            function observeBottomBar() {
              const container = document.querySelector('#bottomBarContainer');
              if (!container) {
                // Try again soon if the container isn't present yet
                setTimeout(observeBottomBar, 500);
                return;
              }
              // Initial hide
              hideMatchedElements(container);
              // Create the observer
              const observer = new MutationObserver((mutationsList) => {
                mutationsList.forEach((mutation) => {
                  // If children added/removed or subtree changed, re-hide
                  if (mutation.addedNodes.length > 0 || mutation.type === 'childList') {
                    hideMatchedElements(container);
                  }
                });
              });
              observer.observe(container, {
                childList: true,
                subtree: true,
              });
            }

            // Run
            observeBottomBar();
          })();

          // -------------------- Section 8. Hide Disclaimers (live observation) --------------------
          setTimeout(() => {
            (() => {
              // "Important" roots in: English, Spanish, Hindi, Japanese, Ukrainian, Russian
              const importantRoots = [
                'important', // English
                'importante', // Spanish
                'ज़रूरी', // Hindi (zaruri)
                '重要', // Japanese
                'важн', // Russian (catch важную, важное, важно, важная, etc.)
                'важлив', // Ukrainian (catch важливу, важливо, etc.)
              ];

              function containsImportantRoot(txt) {
                return importantRoots.some((root) =>
                  txt.toLowerCase().includes(root.toLowerCase()),
                );
              }

              const observer = new MutationObserver(() => {
                const container = document.getElementById('thread-bottom-container');
                if (!container) return;
                container.querySelectorAll('div.text-token-text-secondary').forEach((el) => {
                  const txt = el.textContent.trim().replace(/\s+/g, ' ');
                  if (containsImportantRoot(txt)) {
                    el.setAttribute('data-id', 'hide-this-warning');
                  }
                });
              });

              observer.observe(document.body, {
                childList: true,
                subtree: true,
              });
            })();
          }, 100);

          // -------------------- Section 9. Remove Composer Button Labels (lang-agnostic) --------------------
          (function stripComposerLabels() {
            const ACTION_WRAPPER =
              '[style*="--vt-composer-search-action"],[style*="--vt-composer-research-action"]';
            const IMAGE_BUTTON = 'button[data-testid="composer-button-create-image"]';

            const stripLabel = (btn) => {
              btn.querySelectorAll('span, div').forEach((node) => {
                if (!node.querySelector('svg') && !node.dataset.labelStripped) {
                  node.dataset.labelStripped = 'true';
                  gsap.to(node, {
                    opacity: 0,
                    duration: 0.15,
                    ease: 'sine.out',
                    onComplete: () => node.remove(),
                  });
                }
              });
            };
            const scan = (root) => {
              root.querySelectorAll(ACTION_WRAPPER).forEach((wrp) => {
                const btn = wrp.querySelector('button');
                if (btn) stripLabel(btn);
              });
              root.querySelectorAll(IMAGE_BUTTON).forEach((btn) => {
                stripLabel(btn); // no implicit return from callback
              });
            };

            // Initial label removal
            scan(document);

            // Watch for new buttons
            new MutationObserver((mutations) => {
              for (const { addedNodes } of mutations) {
                for (const node of addedNodes) {
                  if (node.nodeType !== 1) continue;
                  scan(node); // always scan deeply
                }
              }
            }).observe(document.body, { childList: true, subtree: true });
          })();
        }); // closes setTimeout(function injectBottomBarStyles() { ... });
      })(); // closes async function main()
    }, // closes chrome.storage.sync.get callback
  ); // closes chrome.storage.sync.get
})(); // closes the outer IIFE

// ==================================================
// @note styles when there is no bottombar (unchecked)
// ==================================================

(() => {
  chrome.storage.sync.get(
    { moveTopBarToBottomCheckbox: false },
    ({ moveTopBarToBottomCheckbox: enabled }) => {
      if (enabled) return; // Feature runs ONLY if NOT enabled

      (() => {
        setTimeout(function injectNoBottomBarStyles() {
          const style = document.createElement('style');
          style.textContent = `
                        form.w-full[data-type="unified-composer"] {
                            margin-bottom: -1em;
                        }

.bg-token-bg-elevated-secondary.sticky.bottom-0
  .group.__menu-item:not([data-testid]) .truncate:contains("View plans") {
    display: none !important;
}

/* Optionally, hide the whole promo block (not just the text): */
.bg-token-bg-elevated-secondary.sticky.bottom-0
  .group.__menu-item:not([data-testid]) {
    display: none !important;
}


                    `;
          document.head.appendChild(style);

          (() => {
            const observer = new MutationObserver(() => {
              document.querySelectorAll('div.text-token-text-secondary').forEach((el) => {
                const txt = el.textContent.trim().replace(/\s+/g, ' ');
                if (txt.includes('Check important info')) {
                  el.setAttribute('data-id', 'hide-this-warning');
                }
              });
            });
            observer.observe(document.body, { childList: true, subtree: true });
          })();
        }, 100);
      })();
    },
  );
})();

// ==============================================================
// @note Auto-click 'try again' after 'Something went wrong'
// ==============================================================

// Auto-click "try again" when "Something went wrong" appears after switching from a foldered to non-foldered chat.
// Batch checks during browser idle time to avoid main-thread contention. Wrap click logic in an idle callback and schedule it once per mutation burst.
(() => {
  const containerSel = 'div.flex.h-full.w-full.flex-col.items-center.justify-center.gap-4';
  const btnSel = `${containerSel} button.btn-secondary`;

  // 1) Inject fade CSS
  const style = document.createElement('style');
  style.textContent = `
      ${containerSel} {
        opacity: 0;
        transition: opacity 200ms ease-in-out;
      }
      ${containerSel}.visible {
        opacity: 1;
      }
    `;
  document.head.append(style);

  // 2) Centralized click + fade logic
  let scheduled = false;
  const handleNode = (node) => {
    if (!(node instanceof HTMLElement) || !node.matches(containerSel)) return;
    node.classList.add('visible'); // fade in
    if (scheduled) return;
    scheduled = true;
    requestIdleCallback(() => {
      node.querySelector(btnSel)?.click();
      node.classList.remove('visible'); // fade out
      scheduled = false;
    });
  };

  // 3) Initial pass in case it’s already there
  document.querySelectorAll(containerSel).forEach(handleNode);

  // 4) Watch for new ones
  new MutationObserver((muts) => {
    for (const { addedNodes } of muts) {
      addedNodes.forEach(handleNode);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();

// ==============================================================
// @note Auto-click "Open link" in warning dialogs
// Efficient, minimal observer, only targets added nodes.
// ==============================================================
(() => {
  // --- Parameters ---
  const BUTTON_TEXT = 'Open link';

  /**
   * Checks if a node or its descendants have an <a> with the target text
   * and performs the click if found.
   */
  function tryClickOpenLink(node) {
    // Only Element nodes
    if (node.nodeType !== 1) return;

    // Helper for quick text check
    function findButton(root) {
      // Check for <a> with child div containing our BUTTON_TEXT
      // We assume (as in your HTML) structure:
      //    <a ...><div>Open link</div></a>
      const anchors = root.querySelectorAll('a.btn-primary');
      for (const a of anchors) {
        if (
          a.textContent.trim() === BUTTON_TEXT ||
          // Flexible: match if BUTTON_TEXT appears in a child div
          Array.from(a.childNodes).some(
            (n) =>
              n.nodeType === 1 && // ELEMENT_NODE
              n.textContent.trim() === BUTTON_TEXT,
          )
        ) {
          return a;
        }
      }
      return null;
    }

    // Check self, then descendants. This is cheap for typical small dialog nodes.
    let btn = null;
    if (
      node.matches &&
      (node.matches('a.btn-primary') || node.matches('a[rel][target]')) &&
      node.textContent.trim() === BUTTON_TEXT
    ) {
      btn = node;
    } else {
      btn = findButton(node);
    }
    if (btn && !btn.__autoClicked) {
      btn.__autoClicked = true; // Mark so we don't double-click
      // Slight delay: ensure UI is ready (optional)
      setTimeout(() => btn.click(), 0);
    }
  }

  // --- Observe only child additions (very cheap) ---
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        tryClickOpenLink(n);
      }
    }
  });

  // Start observer on DOMContentLoaded, or immediately if DOM is ready
  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
    // If dialog is already on the page (edge case), activate once at start
    tryClickOpenLink(document.body);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

/**
 * Enables customizable keyboard shortcuts for selecting models in a dropdown menu
 * by synchronizing key codes from Chrome storage, labeling menu items with the
 * correct modifier+key combination, and handling real-time key and storage events
 * to trigger the appropriate menu actions, submenu opening, UI feedback, and persistent
 * model name mapping for an extension popup. All logic is encapsulated in an IIFE
 * to maintain private shared state and support robust, dynamic updates.
 */
(() => {
  // Shared, mutable ref so live updates affect all closures without reassignment
  const KEY_CODES = [];
  const MAX_SLOTS = window.ModelLabels.MAX_SLOTS;

  // ----- Timing constants (IIFE scope so all closures share them) -----
  // Keydown flow
  const DELAY_MAIN_MENU_SETTLE_OPEN_MS = 30; // was 60 (wait after opening main menu)
  const DELAY_MAIN_MENU_SETTLE_EXPANDED_MS = 0; // when already open

  // Submenu polling loop in keydown flow

  // Activation delay (post-labeling) in keydown flow
  const DELAY_ACTIVATE_TARGET_MS = 375; // was 750

  // Label scheduling in click flows
  const DELAY_APPLY_HINTS_AFTER_MAIN_MS = 30; // was 60
  const DELAY_APPLY_HINTS_AFTER_SUBMENU_MS = 45; // was 90
  const DELAY_APPLY_HINTS_OBSERVER_MS = 25; // was 50
  const DELAY_APPLY_HINTS_STORAGE_MS = 25; // was 50

  // Optional: micro animation for highlighting menu items
  const ANIM_FLASH_IN_S = 0.11; // was 0.22
  const ANIM_FLASH_OUT_S = 0.075; // was 0.15

  chrome.storage.sync.get(
    ['useControlForModelSwitcherRadio', 'modelPickerKeyCodes'],
    ({ useControlForModelSwitcherRadio, modelPickerKeyCodes }) => {
      // Capacity and defaults: show as many as needed, up to MAX_SLOTS
      const MAX_SLOTS = 15;
      const buildDefaultCodes = (n = MAX_SLOTS) => {
        const base = [
          'Digit1',
          'Digit2',
          'Digit3',
          'Digit4',
          'Digit5',
          'Digit6',
          'Digit7',
          'Digit8',
          'Digit9',
          'Digit0',
        ];
        while (base.length < n) base.push('');
        return base.slice(0, n);
      };

      // Initialize shared KEY_CODES (mutate the const array to keep references alive)
      const incoming = Array.isArray(modelPickerKeyCodes)
        ? modelPickerKeyCodes.slice(0, MAX_SLOTS)
        : [];
      while (incoming.length < MAX_SLOTS) incoming.push('');
      const effective = incoming.some(Boolean) ? incoming : buildDefaultCodes(MAX_SLOTS);
      KEY_CODES.splice(0, KEY_CODES.length, ...effective);

      // Platform + modifier label
      const IS_MAC = /Mac|iPad|iPhone|iPod/.test(navigator.platform);
      const USE_CTRL = !!useControlForModelSwitcherRadio;
      const MOD_KEY_TEXT = USE_CTRL ? (IS_MAC ? 'Command' : 'Ctrl') : IS_MAC ? 'Option' : 'Alt';
      const MENU_BTN = 'button[data-testid="model-switcher-dropdown-button"]';

      // Helper: Alt/Option or Ctrl/Command
      const modPressed = (e) => (USE_CTRL ? (IS_MAC ? e.metaKey : e.ctrlKey) : e.altKey);

      const flashMenuItem = (el) => {
        if (!el || !window.gsap) return;
        const tertiary =
          getComputedStyle(document.documentElement)
            .getPropertyValue('--main-surface-tertiary')
            .trim() || '#888';
        window.gsap
          .timeline({
            onComplete: () => window.gsap.set(el, { clearProps: 'boxShadow,scale' }),
          })
          .fromTo(
            el,
            { boxShadow: `0 0 0 0 ${tertiary}`, scale: 1 },
            {
              boxShadow: `0 0 0 3px ${tertiary}`,
              scale: 0.95,
              duration: ANIM_FLASH_IN_S,
              ease: 'power2.out',
            },
          )
          .to(el, {
            boxShadow: `0 0 0 0 ${tertiary}`,
            scale: 1,
            duration: ANIM_FLASH_OUT_S,
            ease: 'power2.in',
          });
      };

      const flashBottomBar = () => {
        const bb = document.getElementById('bottomBarContainer');
        if (!bb) return;
        clearTimeout(bb._flashTimer);
        clearTimeout(bb._fadeT);
        bb.style.opacity = '1';

        // No assignment inside an expression: compute first, then assign.
        const idle = () => {
          const targetOpacity =
            typeof window.popupBottomBarOpacityValue === 'number'
              ? window.popupBottomBarOpacityValue
              : 0.6;
          bb.style.opacity = String(targetOpacity);
        };

        bb._flashTimer = setTimeout(idle, 4000);
      };

      const ensureMainMenuOpen = () => {
        const btn = document.querySelector(MENU_BTN);
        if (!btn) return false;
        if (btn.getAttribute('aria-expanded') === 'true') return true;
        btn.focus();

        ['keydown', 'keyup'].forEach((type) => {
          btn.dispatchEvent(
            new KeyboardEvent(type, {
              key: ' ',
              code: 'Space',
              keyCode: 32,
              charCode: 32,
              bubbles: true,
              cancelable: true,
              composed: true,
            }),
          );
        });

        return false;
      };

      // Only consider "Model switcher" menus (main or its submenu)
      // Robust detection:
      // - has [data-testid^="Model-switCher-"] items
      // - OR header like "GPT-5" (.__menu-label)
      // - OR aria-labelledby equals the model switcher trigger button id
      // - OR aria-labelledby points to a trigger inside a primary model menu
      const isPrimaryModelMenu = (menuEl) => {
        if (!menuEl || !(menuEl instanceof Element)) return false;
        if (menuEl.querySelector('[data-testid^="Model-switCher-"]')) return true;
        const header = menuEl.querySelector('.__menu-label')?.textContent?.trim() || '';
        if (/^gpt[\s-]*/i.test(header)) return true;
        const triggerId = document.querySelector(MENU_BTN)?.id;
        const labelledby = menuEl.getAttribute('aria-labelledby') || '';
        if (triggerId && labelledby === triggerId) return true;
        return false;
      };

      const isModelMenu = (menuEl) => {
        if (!menuEl || !(menuEl instanceof Element)) return false;
        // Direct match
        if (isPrimaryModelMenu(menuEl)) return true;

        // Submenu: its labelledby points to a trigger that lives inside a primary model menu
        const labelledby = menuEl.getAttribute('aria-labelledby') || '';
        const triggerEl = labelledby ? document.getElementById(labelledby) : null;
        const parentMenu = triggerEl?.closest('[data-radix-menu-content]');
        if (parentMenu && isPrimaryModelMenu(parentMenu)) return true;

        return false;
      };

      const getOpenModelMenus = () => {
        const all =
          typeof getOpenMenus === 'function'
            ? getOpenMenus()
            : Array.from(document.querySelectorAll('[data-radix-menu-content][data-state="open"]'));
        return all.filter(isModelMenu);
      };

      // Back-compat alias where existing code expects a single menu (the first/leftmost)

      // Style for shortcut labels
      (() => {
        if (document.getElementById('__altHintStyle')) return;
        const style = document.createElement('style');
        style.id = '__altHintStyle';
        style.textContent = `
                .alt-hint {
                    font-size: 10px;
                    opacity: .55;
                    margin-left: 6px;
                    user-select: none;
                    pointer-events: none;
                }`;
        document.head.appendChild(style);
      })();

      const removeAllLabels = () => {
        document.querySelectorAll('.alt-hint').forEach((el) => {
          el.remove();
        });
      };

      const addLabel = (el, labelText) => {
        if (!el || el.querySelector('.alt-hint')) return;
        if (!labelText || labelText === '—') return;
        const target = el.querySelector('.flex.items-center') || el.querySelector('.flex') || el;
        const span = document.createElement('span');
        span.className = 'alt-hint';
        span.textContent = `${MOD_KEY_TEXT}+${labelText}`;
        (target || el).appendChild(span);
      };

      // --- Ultra-light model-name capture: piggybacks on applyHints ---

      function __cspTextNoHint(el) {
        return window.ModelLabels.textNoHint(el);
      }

      const __cspIsSubmenuTrigger = (el) => window.ModelLabels.isSubmenuTrigger(el);
      const __cspNormTid = (tid) => window.ModelLabels.normTid(tid);

      // Collect up to MAX_SLOTS names across all open model menus (main first, then submenus).
      function __cspCollectModelNamesN() {
        const CAP = MAX_SLOTS;
        const menus =
          typeof getOpenModelMenus === 'function'
            ? getOpenModelMenus().filter(Boolean)
            : Array.from(document.querySelectorAll('[data-radix-menu-content][data-state="open"]'));

        if (!menus.length) return null;

        const out = [];
        for (const menu of menus) {
          const items = Array.from(
            menu.querySelectorAll(':scope > [role="menuitem"][data-radix-collection-item]'),
          );
          for (const it of items) {
            if (out.length >= CAP) break;
            out.push(__cspTextNoHint(it));
          }
          if (out.length >= CAP) break;
        }
        return out.map((s) => (s || '').trim());
      }
      // Saver: derive canonical labels from DOM (data-testid + structure), not localized text
      const __cspSaveModelNames = (() => {
        let lastSig = '';
        let lastWrite = 0;

        // Single source of truth (shared/model-picker-labels.js)
        const TESTID_CANON = window.ModelLabels.TESTID_CANON;
        const MAIN_CANON_BY_INDEX = window.ModelLabels.MAIN_CANON_BY_INDEX;
        const mapSubmenuLabel = window.ModelLabels.mapSubmenuLabel;

        function __cspCanonicalLabelsFromDOM() {
          const CAP = MAX_SLOTS;
          const names = Array(CAP).fill('');

          const menus =
            typeof getOpenModelMenus === 'function'
              ? getOpenModelMenus().filter(Boolean)
              : Array.from(
                  document.querySelectorAll('[data-radix-menu-content][data-state="open"]'),
                );

          if (!menus.length) return names;

          let idx = 0;

          // Main menu first
          const main = menus[0];
          if (main) {
            const mainItems = Array.from(
              main.querySelectorAll(':scope > [role="menuitem"][data-radix-collection-item]'),
            );
            for (let i = 0; i < mainItems.length && idx < CAP; i++) {
              const item = mainItems[i];
              let label = '';

              if (__cspIsSubmenuTrigger(item)) {
                label = '→'; // canonical for submenu trigger (not a model)
              } else {
                const tid = __cspNormTid(item.getAttribute('data-testid'));
                label = (tid && TESTID_CANON[tid]) || '';
                if (!label) label = __cspTextNoHint(item);
                if (!label && i < MAIN_CANON_BY_INDEX.length) label = MAIN_CANON_BY_INDEX[i];
              }

              names[idx++] = (label || '').trim();
            }
          }

          // Any additional open menus (submenus) in order
          for (let m = 1; m < menus.length && idx < CAP; m++) {
            const subItems = Array.from(
              menus[m].querySelectorAll(':scope > [role="menuitem"][data-radix-collection-item]'),
            );
            for (const item of subItems) {
              if (idx >= CAP) break;
              const tid = __cspNormTid(item.getAttribute('data-testid'));
              let label = (tid && TESTID_CANON[tid]) || '';
              if (!label) {
                const primary = item.querySelector('.flex.items-center.gap-1') || item;
                const txt = __cspTextNoHint(primary);
                label = mapSubmenuLabel(txt) || txt;
              }
              names[idx++] = (label || '').trim();
            }
          }

          while (names.length < CAP) names.push('');
          for (let k = 0; k < names.length; k++) names[k] = (names[k] || '').trim();
          return names;
        }

        function __cspMergeAndPersist(candidates) {
          const now = Date.now();
          try {
            const CAP = MAX_SLOTS;
            chrome.storage.sync.get('modelNames', ({ modelNames: prev }) => {
              const prevArr = Array.isArray(prev) ? prev.slice(0, CAP) : Array(CAP).fill('');
              while (prevArr.length < CAP) prevArr.push('');
              const merged = Array.from({ length: CAP }, (_, i) => {
                const nv = (candidates[i] || '').trim();
                const pv = (prevArr[i] || '').trim();
                return nv || pv || '';
              });
              const sig = merged.join('|');
              if (sig === lastSig && now - lastWrite < 1000) return;
              lastSig = sig;
              lastWrite = now;
              chrome.storage.sync.set({ modelNames: merged, modelNamesAt: now }, () => {});
            });
          } catch (_) {}
        }

        return (arrN) => {
          const CAP = MAX_SLOTS;
          const domNames = __cspCanonicalLabelsFromDOM();
          const fallback = Array.isArray(arrN) ? arrN.slice(0, CAP) : Array(CAP).fill('');
          while (fallback.length < CAP) fallback.push('');

          const candidates = Array.from({ length: CAP }, (_, i) => {
            const d = (domNames[i] || '').trim();
            const f = (fallback[i] || '').trim();
            return d || f || '';
          });

          if (!candidates.some(Boolean)) return;
          __cspMergeAndPersist(candidates);
        };
      })();

      function __cspMaybePersistModelNames() {
        const arr = __cspCollectModelNamesN();
        if (arr) __cspSaveModelNames(arr);
      }

      // Respond to popup requests for live names (ensures freshness on popup open)
      try {
        chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
          if (msg && msg.type === 'CSP_GET_MODEL_NAMES') {
            const arr = __cspCollectModelNamesN();
            if (arr) __cspSaveModelNames(arr);
            sendResponse({ modelNames: Array.isArray(arr) ? arr : null });
          }
        });
      } catch (_) {}

      // Get all menu items (main menu + open submenu) in order, capped at MAX_SLOTS
      // Collect items from the *first* open menu (level 1) and, if present, any additional open submenus.
      function getOrderedMenuItems() {
        const cap = MAX_SLOTS;
        const menus =
          typeof getOpenModelMenus === 'function'
            ? getOpenModelMenus()
            : Array.from(document.querySelectorAll('[data-radix-menu-content][data-state="open"]'));

        if (!menus.length) return [];
        const result = [];

        for (let m = 0; m < menus.length; m++) {
          const all = Array.from(
            menus[m].querySelectorAll(':scope > [role="menuitem"][data-radix-collection-item]'),
          );

          // For the main menu, filter out the submenu trigger (arrow)
          const filtered = m === 0 ? all.filter((el) => !__cspIsSubmenuTrigger(el)) : all;

          filtered.forEach((el, idx) => {
            if (result.length < cap) {
              result.push({ el, menu: m === 0 ? 'main' : 'submenu', idx });
            }
          });

          if (result.length >= cap) break;
        }
        return result;
      }

      function displayFromCode(code) {
        // Handle "cleared" shortcuts: anything falsy, empty string, or nbsp
        if (!code || code === '' || code === '\u00A0') return '—';
        if (/^Key([A-Z])$/.test(code)) return code.slice(-1);
        if (/^Digit([0-9])$/.test(code)) return code.slice(-1);
        if (/^Numpad([0-9])$/.test(code)) return code.slice(-1);
        if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
        switch (code) {
          case 'Minus':
            return '-';
          case 'Equal':
            return '=';
          case 'BracketLeft':
            return '[';
          case 'BracketRight':
            return ']';
          case 'Backslash':
            return '\\';
          case 'Semicolon':
            return ';';
          case 'Quote':
            return "'";
          case 'Comma':
            return ',';
          case 'Period':
            return '.';
          case 'Slash':
            return '/';
          case 'Backquote':
            return '`';
          case 'Space':
            return 'Space';
          case 'Enter':
            return 'Enter';
          case 'Escape':
            return 'Esc';
          case 'Tab':
            return 'Tab';
          case 'Backspace':
            return 'Bksp';
          case 'Delete':
            return 'Del';
          case 'ArrowLeft':
            return '←';
          case 'ArrowRight':
            return '→';
          case 'ArrowUp':
            return '↑';
          case 'ArrowDown':
            return '↓';
          default:
            return code;
        }
      }

      // Use the global helper to avoid drift/duplication
      function indexFromEvent(e) {
        const utils = window.ShortcutUtils || {};
        const cmp = typeof utils.codeEquals === 'function' ? utils.codeEquals : () => false;
        for (let i = 0; i < KEY_CODES.length; i++) {
          if (cmp(e.code, KEY_CODES[i])) return i;
        }
        return -1;
      }

      const applyHints = () => {
        removeAllLabels();
        const items = getOrderedMenuItems();
        for (let i = 0; i < items.length && i < KEY_CODES.length; ++i) {
          addLabel(items[i].el, displayFromCode(KEY_CODES[i]));
        }
        // Persist labels -> names once menus are present (submenu must be open for full set)
        __cspMaybePersistModelNames();
      };
      const scheduleHints = () => requestAnimationFrame(applyHints);

      // Expose a minimal hook so outer listeners can refresh labels when keys change
      window.__mp_applyHints = applyHints;

      // --- KEY HANDLING ---
      window.addEventListener(
        'keydown',
        (e) => {
          if (!modPressed(e)) return;

          const idx = indexFromEvent(e);
          if (idx === -1) return;

          e.preventDefault();
          e.stopPropagation();

          const alreadyOpen = ensureMainMenuOpen();

          // Robust activator: focus + pointer + mouse + keyboard confirm (covers Radix commit paths)
          const activateMenuItem = (el) => {
            if (!el) return;

            el.focus?.();

            el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false }));
            el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));

            el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            el.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
                cancelable: true,
              }),
            );
            el.dispatchEvent(
              new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
                cancelable: true,
              }),
            );
          };

          // Always open both menus using the same robust flow as toggleModelSelector
          const openBothMenus = (done) => {
            // Trigger robust flow that opens main + legacy submenu
            if (typeof window.toggleModelSelector === 'function') {
              window.toggleModelSelector();
            } else {
              // Fallback: try to at least open main
              ensureMainMenuOpen();
            }

            // Wait until two model menus are open, then continue
            let polls = 0;
            const tick = () => {
              const menus = getOpenModelMenus();
              if (menus.length > 1) return done();
              if (polls++ > 60) return done(); // ~1.8s max
              setTimeout(tick, 30);
            };
            tick();
          };

          setTimeout(
            () => {
              openBothMenus(() => {
                const items = getOrderedMenuItems();
                applyHints();

                if (items.length <= idx) return;
                const target = items[idx];
                if (!target) return;
                if (window.gsap) flashMenuItem(target.el);
                setTimeout(() => {
                  activateMenuItem(target.el);
                  flashBottomBar();
                }, DELAY_ACTIVATE_TARGET_MS);
              });
            },
            alreadyOpen ? DELAY_MAIN_MENU_SETTLE_EXPANDED_MS : DELAY_MAIN_MENU_SETTLE_OPEN_MS,
          );
        },
        true,
      );

      // Keep click-to-open labels, but also observe DOM so labels appear *when* submenu mounts
      document.addEventListener('click', (e) => {
        if (e.composedPath().some((n) => n instanceof Element && n.matches(MENU_BTN))) {
          setTimeout(applyHints, DELAY_APPLY_HINTS_AFTER_MAIN_MS);
        }
        const t = e.target instanceof Element ? e.target : null;
        const submenuTriggerClicked = t?.closest(
          '[role="menuitem"][data-has-submenu], ' +
            '[role="menuitem"][aria-haspopup="menu"], ' +
            '[role="menuitem"][aria-controls]',
        );
        if (submenuTriggerClicked) {
          setTimeout(applyHints, DELAY_APPLY_HINTS_AFTER_SUBMENU_MS);
        }
      });

      // Observe for open Radix menus; when the count of open menus changes, refresh labels
      (() => {
        let lastCount = 0;
        const obs = new MutationObserver(() => {
          const count = getOpenModelMenus().length;
          if (count !== lastCount) {
            lastCount = count;
            setTimeout(applyHints, DELAY_APPLY_HINTS_OBSERVER_MS);
          }
        });
        obs.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      })();

      if (document.querySelector(MENU_BTN)?.getAttribute('aria-expanded') === 'true') {
        scheduleHints();
      }
    },
  );

  // Alt+/ opens the menu and forces the “Legacy models” submenu to be visible (robust to current DOM)
  window.toggleModelSelector = () => {
    const MENU_BTN = 'button[data-testid="model-switcher-dropdown-button"]';
    const btn = document.querySelector(MENU_BTN);
    if (!btn) return;

    // Tunables

    // Helpers
    const pressSpace = (el) => {
      ['keydown', 'keyup'].forEach((type) => {
        el.dispatchEvent(
          new KeyboardEvent(type, {
            key: ' ',
            code: 'Space',
            keyCode: 32,
            charCode: 32,
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
        );
      });
    };
    const hover = (el) => {
      if (!el) return;
      el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    };
    const safeClick = (el) => {
      if (!el) return;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    };

    // Identify menus that belong to the model switcher (matches your 555 HTML)
    const isModelMenuEl = (menuEl) => {
      if (!menuEl || !(menuEl instanceof Element)) return false;
      if (menuEl.querySelector('[data-testid^="model-switcher-"]')) return true; // current
      if (menuEl.querySelector('[data-testid^="Model-switCher-"]')) return true; // legacy casing
      if (menuEl.querySelector('[data-testid$="-submenu"]')) return true; // e.g., “Legacy models-submenu”
      const header = menuEl.querySelector('.__menu-label')?.textContent?.trim() || '';
      return /^gpt[\s.-]*/i.test(header);
    };

    const getModelMenus = () => {
      const all =
        typeof getOpenMenus === 'function'
          ? getOpenMenus()
          : Array.from(
              document.querySelectorAll(
                '[data-radix-menu-content][data-state="open"][role="menu"]',
              ),
            );
      return all.filter(isModelMenuEl);
    };

    // Find the specific “Legacy models” trigger inside the main menu
    const findLegacyTrigger = (menu) => {
      if (!menu) return null;

      // 1) Exact data-testid match from your HTML (note the space)
      const el = menu.querySelector(
        ':scope > [role="menuitem"][data-testid="Legacy models-submenu"]',
      );
      if (el) return el;

      // 2) Any submenu-capable item whose data-testid mentions “legacy”
      const candidates = Array.from(
        menu.querySelectorAll(
          ':scope > [role="menuitem"][data-has-submenu], ' +
            ':scope > [role="menuitem"][aria-haspopup="menu"], ' +
            ':scope > [role="menuitem"][aria-controls]',
        ),
      );
      const byTid = candidates.find((n) =>
        (n.getAttribute('data-testid') || '').toLowerCase().includes('legacy'),
      );
      if (byTid) return byTid;

      // 3) Text content fallback
      const byText = candidates.find((n) => /legacy\s*models?/i.test(n.textContent || ''));
      if (byText) return byText;

      // 4) Last resort: if there’s exactly one submenu trigger, use it
      if (candidates.length === 1) return candidates[0];

      return null;
    };

    const waitForMainOpen = (cb) => {
      if (btn.getAttribute('aria-expanded') === 'true') return cb();
      btn.focus();
      pressSpace(btn);

      let tries = 0;
      const poll = () => {
        const menus = getModelMenus();
        if (menus.length > 0 || tries++ > 50) return cb(); // up to ~1.5s
        setTimeout(poll, 30);
      };
      poll();
    };

    const pressKey = (el, key, code) => {
      ['keydown', 'keyup'].forEach((type) => {
        el.dispatchEvent(
          new KeyboardEvent(type, {
            key,
            code,
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
        );
      });
    };

    const forceOpenSubmenu = (done) => {
      // If already open, we’re done
      if (getModelMenus().length > 1) return done();

      const menus = getModelMenus();
      if (!menus.length) return done();

      const main = menus[0];
      const trigger = findLegacyTrigger(main);
      if (!trigger) return done();

      let polls = 0;
      const tick = () => {
        const currentMenus = getModelMenus();
        if (currentMenus.length > 1 || trigger.getAttribute('aria-expanded') === 'true') {
          // Let labels render (if needed)
          setTimeout(() => window.__mp_applyHints?.(), 25);
          return done();
        }

        // Try multiple strategies in sequence to satisfy Radix submenu behavior
        switch (polls % 4) {
          case 0:
            // Hover (Radix often opens submenu on pointer enter)
            hover(trigger);
            trigger.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
            break;
          case 1:
            // Click (some menus toggle on click)
            safeClick(trigger);
            break;
          case 2:
            // Keyboard open (ArrowRight is a common submenu open action)
            trigger.focus();
            pressKey(trigger, 'ArrowRight', 'ArrowRight');
            break;
          case 3:
            // Keyboard fallback (Enter)
            trigger.focus();
            pressKey(trigger, 'Enter', 'Enter');
            break;
        }

        if (polls++ > 60) return done(); // ~1.8s total attempts
        setTimeout(tick, 30);
      };
      tick();
    };

    // Open main menu, then open the Legacy submenu
    waitForMainOpen(() => {
      // Let Radix mount main content before searching
      setTimeout(() => forceOpenSubmenu(() => {}), 40);
    });
  };

  // Listen for modelPickerKeyCodes changes and update in real-time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (!changes.modelPickerKeyCodes) return;

    const val = changes.modelPickerKeyCodes.newValue;
    if (!Array.isArray(val)) return;

    const next = val.slice(0, MAX_SLOTS);
    while (next.length < MAX_SLOTS) next.push('');

    // Mutate the const array so references stay valid
    KEY_CODES.splice(0, KEY_CODES.length, ...next);

    // If menu is open, refresh labels to reflect new keys
    const btn = document.querySelector('button[data-testid="model-switcher-dropdown-button"]');
    if (btn?.getAttribute('aria-expanded') === 'true') {
      setTimeout(() => {
        window.__mp_applyHints?.();
      }, DELAY_APPLY_HINTS_STORAGE_MS);
    }
  });
})();

// ====================================
// rememberSidebarScrollPositionCheckbox
// Robust scroll-restore for rail + overlay (2025)
// ====================================
setTimeout(() => {
  (() => {
    chrome.storage.sync.get(
      { rememberSidebarScrollPositionCheckbox: false },
      async ({ rememberSidebarScrollPositionCheckbox: enabled }) => {
        if (!enabled) return;

        const SAVE_DEBOUNCE_MS = 150;
        const IDLE_WAIT_MS = 1000;
        const POLL_INTERVAL_MS = 100;
        const MAX_WAIT_MS = 5000;
        const FINAL_DELAY_MS = 2000;

        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        // --- State we swap when the overlay/rail changes ---
        let cur = {
          container: null,
          keySuffix: 'rail',
          saveTimer: null,
          userScrolled: false,
          cleanup: () => {},
        };

        // Helpers --------------------------------------------------------------
        const isPage = (el) => el === document.scrollingElement;

        const on = (el, type, handler, opts) => {
          (isPage(el) ? window : el).addEventListener(type, handler, opts);
          return () => (isPage(el) ? window : el).removeEventListener(type, handler, opts);
        };

        const getMaxScroll = (el) =>
          isPage(el)
            ? Math.max(0, (document.scrollingElement?.scrollHeight || 0) - window.innerHeight)
            : Math.max(0, el.scrollHeight - el.clientHeight);

        const getScrollTop = (el) =>
          isPage(el)
            ? document.scrollingElement?.scrollTop || document.documentElement.scrollTop || 0
            : el.scrollTop;

        const setScrollTop = (el, v) => {
          if (isPage(el)) window.scrollTo(0, v);
          else el.scrollTop = v;
        };

        const getScrollHeight = (el) =>
          isPage(el) ? document.scrollingElement?.scrollHeight || 0 : el.scrollHeight;

        const isVisible = (el) => {
          if (!el) return false;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0)
            return false;
          const rects = el.getClientRects();
          return rects && rects.length > 0 && rects[0].height > 0 && rects[0].width > 0;
        };

        // Walk up from a node to find the actual scrollport (incl. Radix viewport)
        function pickScrollContainer(start) {
          // Prefer Radix ScrollArea viewport if present
          const radixViewport = start.querySelector('[data-radix-scroll-area-viewport]');
          if (radixViewport && isVisible(radixViewport)) return radixViewport;

          // Otherwise, walk ancestors until we find a scrollable clipped element
          let el = start;
          while (el) {
            if (isVisible(el)) {
              const cs = getComputedStyle(el);
              const canScroll = /(auto|scroll|overlay)/.test(cs.overflowY);
              const clipped = el.clientHeight > 0 && el.scrollHeight > el.clientHeight;
              if (canScroll && clipped) return el;
            }
            el = el.parentElement;
          }
          // Fallback: page scroll (rail hidden; overlay not found)
          return document.scrollingElement || document.documentElement;
        }

        // Find the *visible* sidebar root (overlay if open, else rail)
        function findVisibleSidebarRoot() {
          // Overlay: often lives in a portal with these IDs
          const overlayIds = ['stage-popover-sidebar', 'stage-slideover-sidebar'];
          for (const id of overlayIds) {
            const root = document.getElementById(id);
            if (root && isVisible(root)) return { root, mode: 'overlay' };
          }

          // Otherwise, use a visible nav as anchor (rail or overlay)
          const navs = Array.from(document.querySelectorAll('nav[aria-label="Chat history"]'));
          const visible = navs.filter(isVisible);
          if (visible.length) {
            // Pick the one with the highest z-index (overlay beats rail)
            const best = visible
              .map((el) => ({
                el,
                zi: parseInt(getComputedStyle(el).zIndex || '0', 10) || 0,
              }))
              .sort((a, b) => b.zi - a.zi)[0].el;
            // Root is the closest container that likely owns the panel
            const root =
              best.closest('#stage-popover-sidebar, #stage-slideover-sidebar, aside, nav') || best;
            const mode =
              root.id && /stage-(popover|slideover)-sidebar/.test(root.id) ? 'overlay' : 'rail';
            return { root, mode };
          }

          // Nothing visible yet
          return null;
        }

        async function waitForInitialIdle(el) {
          let lastH = getScrollHeight(el);
          let lastChange = Date.now();
          while (Date.now() - lastChange < IDLE_WAIT_MS) {
            await sleep(200);
            const h = getScrollHeight(el);
            if (h !== lastH) {
              lastH = h;
              lastChange = Date.now();
            }
          }
        }

        async function restoreScroll(el, storageKey) {
          const raw = sessionStorage.getItem(storageKey);
          if (raw === null) return;
          const desired = parseInt(raw, 10);
          if (Number.isNaN(desired)) return;

          const start = Date.now();

          while (Date.now() - start < MAX_WAIT_MS) {
            if (cur.userScrolled) return;

            // nudge to bottom to trigger lazy loading in history
            setScrollTop(el, getMaxScroll(el));

            if (cur.userScrolled) return;

            if (getMaxScroll(el) >= desired) {
              setScrollTop(el, desired);
              return;
            }
            await sleep(POLL_INTERVAL_MS);
          }
        }

        function attachSaver(el, storageKey) {
          const cleanups = [];

          const commit = (pos) => sessionStorage.setItem(storageKey, String(pos));

          // Save on scroll (trusted)
          cleanups.push(
            on(
              el,
              'scroll',
              (e) => {
                if (e.isTrusted) {
                  cur.userScrolled = true; // real user scrolled
                  clearTimeout(cur.saveTimer);
                  cur.saveTimer = setTimeout(() => commit(getScrollTop(el)), SAVE_DEBOUNCE_MS);
                }
              },
              { passive: true },
            ),
          );

          // Also consider pre-scroll intent (wheel/touch/keydown/mousedown)
          const markIntent = () => {
            cur.userScrolled = true;
          };
          ['wheel', 'touchstart', 'mousedown', 'keydown'].forEach((evt) => {
            cleanups.push(on(el, evt, markIntent, { passive: true }));
          });

          window.addEventListener('beforeunload', () => {
            commit(getScrollTop(el));
          });

          return () => {
            for (const fn of cleanups) {
              // call if it's a function; do not return any value from an array callback
              if (typeof fn === 'function') {
                fn();
              }
            }
          };
        }

        async function initOnce() {
          const found = findVisibleSidebarRoot();
          if (!found) return; // nothing visible yet (e.g., before the overlay opens)

          const { root, mode } = found;
          const anchor =
            root.querySelector('nav[aria-label="Chat history"]') ||
            root.querySelector('[data-radix-scroll-area-viewport]') ||
            root;

          const container = pickScrollContainer(anchor);
          const keySuffix = mode; // 'overlay' or 'rail'
          const STORAGE_KEY = `__chat_sidebar_scrollTop__::${location.pathname}::${keySuffix}`;

          // If container hasn't changed, do nothing
          if (cur.container === container) return;

          // Cleanup previous listeners
          cur.cleanup();
          cur = {
            ...cur,
            container,
            keySuffix,
            userScrolled: false,
            cleanup: () => {},
          };

          // Wait for content to finish initial growth, then restore
          await waitForInitialIdle(container);
          await restoreScroll(container, STORAGE_KEY);

          // Attach saver and final safeguard
          cur.cleanup = attachSaver(container, STORAGE_KEY);

          setTimeout(() => {
            if (cur.userScrolled) return;
            const raw = sessionStorage.getItem(STORAGE_KEY);
            const desired = raw !== null ? Number.parseInt(raw, 10) : NaN;
            if (!Number.isNaN(desired)) setScrollTop(container, desired);
          }, FINAL_DELAY_MS);
        }

        // Observe DOM changes so we re-target when overlay opens/closes
        const mo = new MutationObserver(() => {
          initOnce();
        });
        mo.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'data-state', 'aria-hidden'],
        });

        // Also re-evaluate on resize (rail vs overlay threshold)
        window.addEventListener(
          'resize',
          () => {
            initOnce();
          },
          { passive: true },
        );

        // Kick off now; observer will re-run as needed
        initOnce();
      },
    );
  })();
}, 500);

// ==================================================
// @note Slim-bar opacity / fade logic (robust, overlay-aware, single IIFE)
// ==================================================
(() => {
  chrome.storage.sync.get(
    { fadeSlimSidebarEnabled: false },
    ({ fadeSlimSidebarEnabled: enabled }) => {
      window._fadeSlimSidebarEnabled = enabled;
      if (!enabled) {
        const barEl = document.getElementById('stage-sidebar-tiny-bar');
        if (barEl) {
          barEl.style.removeProperty('transition');
          barEl.style.removeProperty('opacity');
          barEl.style.removeProperty('pointer-events');
        }
        return;
      }

      let bar = null;
      let hover = false;
      let idleTimer = null;
      let idleTimerVersion = 0;
      let classObserver = null;

      // -- NEW: Helper to check if large sidebar is open --
      function isLargeSidebarOpen() {
        // Replace '#stage-sidebar' with your actual sidebar element ID/class if needed!
        const largeSidebar = document.getElementById('stage-sidebar');
        if (!largeSidebar) return false;
        const style = window.getComputedStyle(largeSidebar);
        // Consider it open if it's visible and not display:none/hidden
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      }

      function getIdleOpacity() {
        return window._slimBarIdleOpacity ?? 0.6;
      }
      function ensureOpacityLoaded() {
        if (window._slimBarOpacityPromise) return window._slimBarOpacityPromise;
        window._slimBarOpacityPromise = new Promise((res) => {
          chrome.storage.sync.get({ popupSlimSidebarOpacityValue: 0.6 }, (data) => {
            window._slimBarIdleOpacity =
              typeof data.popupSlimSidebarOpacityValue === 'number'
                ? data.popupSlimSidebarOpacityValue
                : 0.6;
            res();
          });
        });
        return window._slimBarOpacityPromise;
      }

      function detachCurrentBar() {
        if (!bar) return;
        bar.removeEventListener('mouseenter', onEnter, true);
        bar.removeEventListener('mouseleave', onLeave, true);
        if (classObserver) classObserver.disconnect();
        clearTimeout(idleTimer);
        idleTimerVersion++;
        bar = null;
      }

      // Overlay detection unchanged
      function overlayIsOpen() {
        const selectors = [
          '[id^="radix-"][data-state="open"]',
          '.modal, .slideover, .overlay, .DialogOverlay, .MenuOverlay',
          '[data-state="open"]',
          '[data-overlay="true"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && isVisible(el)) return true;
        }
        // Heuristic fallback: look for large, fixed overlays with high z-index
        const candidates = Array.from(document.body.querySelectorAll('*'));
        return candidates.some((elem) => {
          if (!(elem instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(elem);
          if (
            (style.position === 'fixed' || style.position === 'absolute') &&
            (parseInt(style.zIndex, 10) || 0) > 1000 &&
            elem.offsetWidth >= window.innerWidth * 0.75 &&
            elem.offsetHeight >= window.innerHeight * 0.5
          ) {
            // Don't match alerts/toasts, only major overlays
            return isVisible(elem);
          }
          return false;
        });
      }
      function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      }

      function setOpacity(value) {
        if (!bar) return;
        if (overlayIsOpen()) {
          bar.style.setProperty('opacity', '0', 'important');
          bar.style.pointerEvents = 'none';
          return;
        }
        // Don't block pointer-events unless you actually want to!
        bar.style.setProperty('opacity', value, 'important');
        bar.style.pointerEvents = '';
      }

      function fadeToIdle() {
        if (!bar) return;
        if (overlayIsOpen()) {
          setOpacity('0');
          return;
        }
        if (hover) return;
        // If large sidebar is open, instantly set opacity 0
        if (isLargeSidebarOpen()) {
          bar.style.setProperty('transition', 'none', 'important');
          setOpacity('0');
          void bar.offsetWidth;
          setTimeout(() => {
            if (bar) bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');
          }, 0);
          return;
        }
        setOpacity(getIdleOpacity().toString());
      }

      function onEnter() {
        hover = true;
        clearTimeout(idleTimer);
        setOpacity('1');
      }
      function onLeave() {
        hover = false;
        clearTimeout(idleTimer);
        idleTimerVersion++;
        const thisVersion = idleTimerVersion;
        idleTimer = setTimeout(() => {
          if (idleTimerVersion === thisVersion) fadeToIdle();
        }, 2500);
      }

      async function attachToBar(el) {
        detachCurrentBar();
        await ensureOpacityLoaded();

        bar = el;
        // Show instantly, then restore the fade
        bar.style.setProperty('transition', 'none', 'important');
        setOpacity('1');
        void bar.offsetWidth;
        bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');

        bar.addEventListener('mouseenter', onEnter, true);
        bar.addEventListener('mouseleave', onLeave, true);

        bar.addEventListener(
          'click',
          function onClick() {
            if (!bar) return;
            // Disable fade transition instantly for this click
            bar.style.setProperty('transition', 'none', 'important');
            setOpacity('0');
            hover = false;
            clearTimeout(idleTimer);
            idleTimerVersion++;
            void bar.offsetWidth;
            setTimeout(() => {
              if (bar) bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');
            }, 0);
          },
          true,
        );

        classObserver = new MutationObserver(() => {
          // Sidebar just closed or opened; handle transition instantly
          if (isLargeSidebarOpen()) {
            bar.style.setProperty('transition', 'none', 'important');
            setOpacity('0');
            hover = false;
            clearTimeout(idleTimer);
            idleTimerVersion++;
            void bar.offsetWidth;
            setTimeout(() => {
              if (bar) bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');
            }, 0);
          } else {
            bar.style.setProperty('transition', 'none', 'important');
            setOpacity('1');
            void bar.offsetWidth;
            setTimeout(() => {
              if (bar) bar.style.setProperty('transition', 'opacity 0.5s ease-in-out', 'important');
              clearTimeout(idleTimer);
              idleTimerVersion++;
              const thisVersion = idleTimerVersion;
              idleTimer = setTimeout(() => {
                if (idleTimerVersion === thisVersion) fadeToIdle();
              }, 2500);
            }, 0);
          }
        });

        // We want to observe changes on the large sidebar, not the slimbar
        const largeSidebar = document.getElementById('stage-sidebar');
        if (largeSidebar) {
          classObserver.observe(largeSidebar, {
            attributes: true,
            attributeFilter: ['class', 'style'],
          });
        }

        setOpacity('1');
        clearTimeout(idleTimer);
        idleTimerVersion++;
        const thisVersion = idleTimerVersion;
        idleTimer = setTimeout(() => {
          if (idleTimerVersion === thisVersion) fadeToIdle();
        }, 2500);
      }

      // DOM observer to attach/detach
      const domObserver = new MutationObserver(() => {
        const el = document.getElementById('stage-sidebar-tiny-bar');
        if (el !== bar) {
          if (el) {
            attachToBar(el);
            window.flashSlimSidebarBar?.();
          } else {
            detachCurrentBar();
          }
        } else {
          fadeToIdle();
        }
      });
      domObserver.observe(document.body, { childList: true, subtree: true });

      // Also observe overlay-relevant changes (class/style on body/overlays)
      const overlayObserver = new MutationObserver(fadeToIdle);
      overlayObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });

      // (Removed setInterval: fadeToIdle() is now handled only by user idle, DOM mutation, or overlayObserver events.)

      // startup
      function startup() {
        const first = document.getElementById('stage-sidebar-tiny-bar');
        if (first) attachToBar(first);
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startup);
      } else {
        startup();
      }

      chrome.storage.onChanged.addListener((chg, area) => {
        if (area !== 'sync') return;

        if ('popupSlimSidebarOpacityValue' in chg) {
          window._slimBarIdleOpacity =
            typeof chg.popupSlimSidebarOpacityValue.newValue === 'number'
              ? chg.popupSlimSidebarOpacityValue.newValue
              : 0.6;
          fadeToIdle();
        }

        if ('fadeSlimSidebarEnabled' in chg) {
          window._fadeSlimSidebarEnabled = chg.fadeSlimSidebarEnabled.newValue;
          const nowOn = chg.fadeSlimSidebarEnabled.newValue;
          if (!nowOn) {
            detachCurrentBar();
            const barEl = document.getElementById('stage-sidebar-tiny-bar');
            if (barEl) {
              barEl.style.removeProperty('transition');
              barEl.style.removeProperty('opacity');
              barEl.style.removeProperty('pointer-events');
            }
          } else {
            const barEl = document.getElementById('stage-sidebar-tiny-bar');
            if (barEl) attachToBar(barEl);
          }
        }
      });

      window.flashSlimSidebarBar = (dur = 2500) => {
        if (!bar) return;
        if (overlayIsOpen()) {
          setOpacity('0');
          hover = false;
          return;
        }
        clearTimeout(idleTimer);
        idleTimerVersion++;
        setOpacity('1');
        const thisVersion = idleTimerVersion;
        idleTimer = setTimeout(() => {
          if (idleTimerVersion === thisVersion) {
            hover = false;
            fadeToIdle();
          }
        }, dur);
      };
    },
  );
})();

// ==================================================
// @note Show Assigned Shortcuts Overlay
// ==================================================

(() => {
  // ---- 1) Static CSS: Insert your full popup.css below ----
  const FULL_POPUP_CSS = `
:host,:root{--text-primary:#1e1e1e;--text-secondary:#646464;--border-light:#dfdfdc;--bg-primary:#f4f3f1;--bg-secondary:#f8f7f5;--highlight-color:#3f51b5}*,body{margin:0}*{padding:0;box-sizing:border-box}body{width:100%;height:100vh;overflow-y:auto;overflow-x:hidden;padding:.5rem;display:flex;justify-content:center;align-items:flex-start;line-height:1.5!important}.key-input,.key-text,h1{text-wrap:balance}.key-input,.key-text,.shortcut-label,.tooltiptext,body,h1{font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif!important;font-size:14px;font-feature-settings:normal;font-variation-settings:normal;text-size-adjust:100%;text-align:start;text-overflow:ellipsis;white-space-collapse:collapse;unicode-bidi:isolate;pointer-events:auto}.tooltiptext{text-wrap:balance}h1{font-size:1.25rem;font-weight:500;text-align:center;margin-bottom:1rem}#toast-container .toast{text-wrap:balance}.disabled-section{opacity:.2;pointer-events:none}.disabled-section .key-input{background-color:#eee;color:#aaa;border-color:#ccc;cursor:not-allowed}.flash-highlight{animation:pulse-highlight 0.6s ease-out 1.2s 1}.full-width{grid-column:span 2}.icon-input-container{display:flex;align-items:center;gap:8px}.icon-input-container::after{position:absolute;left:.5rem;top:50%;transform:translateY(-50%);font:inherit;color:#666;pointer-events:none;z-index:2;opacity:1;transition:opacity 0.1s ease}.icon-input-container:focus-within::after{opacity:0}.key-input{width:50px;height:2rem;border:1px solid var(--border-light);border-radius:9999px;text-align:center;font-size:.9rem;font-weight:700;background-color:var(--bg-primary);color:var(--text-secondary)}.key-input:focus{border-color:var(--highlight-color);outline:0}.key-text{font-size:.9rem;font-weight:600}.material-checkbox{width:12px;height:12px;cursor:pointer!important}.material-radio{width:12px;height:12px;cursor:pointer!important}.material-icons-outlined{font-size:18px;color:var(--text-secondary)}.material-input-long{position:relative;z-index:1;width:6ch;padding:.25rem .5rem;border:1px solid #ccc;border-radius:9999px;background:0 0;box-sizing:border-box;color:#fff0;transition:width 0.25s ease}.material-input-long:focus{width:24ch;color:inherit;outline:0}.model-picker{width:100%;display:flex;flex-direction:column;align-items:left;margin-left:0}.model-picker-shortcut{flex-direction:column;align-items:stretch;gap:6px}.mp-icons{display:flex;justify-content:center;font-size:clamp(9px, 1.9vw, 12px);line-height:1;scale:.85;margin-left:10px}.mp-icons .material-symbols-outlined{margin:0 -1px;pointer-events:none;vertical-align:middle}.mp-option{display:inline-flex;align-items:center;gap:4px;cursor:pointer;position:relative;user-select:none;font-size:12px}.mp-option input[type="radio"]{width:12px;height:12px;margin:0 2px;accent-color:var(--highlight-color)}.mp-option-text{text-align:center;font-size:.75rem;text-wrap:balance;margin:0}.mp-option .info-icon{margin-left:2px;line-height:1;font-size:14px}.mp-options{display:flex;justify-content:center;gap:3rem;margin-top:10px;margin-bottom:8px}.new-emoji-indicator{font-size:1.5em;line-height:1;user-select:none;pointer-events:none;opacity:.9;transform:translateY(-1px)}.new-feature-tag{font-size:.65rem;font-weight:600;color:#fff;background-color:#6fc15f;padding:2px 6px;border-radius:4px;letter-spacing:.5px;line-height:1;user-select:none}.opacity-slider-clipper{height:60px;overflow:hidden;display:flex;align-items:center;justify-content:center;width:100%}.opacity-tooltip{position:relative;width:60%;flex:1 1 0%;min-width:0}.opacity-tooltip.tooltip:hover::after{transform:scaleX(0)!important}.opacity-tooltip.visible-opacity-slider::after{transform-origin:left;pointer-events:none;content:"";display:block;position:absolute;bottom:-2px;left:0;width:100%;transform:scaleX(0);transition:transform 0.2s ease-in-out}.opacity-tooltip.visible-opacity-slider:hover::after,.opacity-tooltip:hover::after{transform:scaleX(1)}.opacity-tooltip::after{content:none;border:0}.p-form-switch{--width:80px;cursor:pointer;display:inline-block;scale:.5;transform-origin:right center}.p-form-switch>input{display:none}.p-form-switch>span{background:#e0e0e0;border:1px solid #d3d3d3;border-radius:500px;display:block;height:calc(var(--width) / 1.6);position:relative;transition:all 0.2s;width:var(--width)}.p-form-switch>span::after{background:#f9f9f9;border-radius:50%;border:.5px solid rgb(0 0 0 / .101987);box-shadow:0 3px 1px rgb(0 0 0 / .1),0 1px 1px rgb(0 0 0 / .16),0 3px 8px rgb(0 0 0 / .15);box-sizing:border-box;content:"";height:84%;left:3%;position:absolute;top:6.5%;transition:all 0.2s;width:52.5%}.p-form-switch>input:checked+span{background:#60c35b}.p-form-switch>input:checked+span::after{left:calc(100% - calc(var(--width) / 1.8))}.shortcut-column{display:flex;flex-direction:column;gap:10px}.shortcut-container{width:800px;max-width:100%;margin:0 auto;padding:1rem;background-color:var(--bg-primary);border-radius:8px;box-shadow:0 4px 8px rgb(0 0 0 / .1);box-sizing:border-box}.shortcut-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.shortcut-item,.shortcut-keys{display:flex;align-items:center;max-width:100%}.shortcut-item{justify-content:space-between;background-color:var(--bg-secondary);padding:.75rem .75rem .75rem .75rem;border:1px solid var(--border-light);border-radius:6px;box-shadow:0 2px 4px rgb(0 0 0 / .05);min-height:3.5rem}.shortcut-item.hidden{visibility:hidden;pointer-events:none}.shortcut-item .p-form-switch,.shortcut-item label.p-form-switch,.shortcut-item>.p-form-switch{margin-left:auto}.shortcut-keys{gap:5px}.shortcut-label{font-size:inherit;color:var(--text-primary);font-weight:400;line-height:1.5}.shortcut-label,.shortcut-label .i18n,.tooltip .i18n{text-wrap:balance}.tooltip{position:relative;display:inline;cursor:pointer;border-bottom:none}.tooltip .i18n{text-underline-offset:4px;text-decoration-thickness:1px;display:inline}.tooltip .tooltiptext{visibility:hidden;width:120px;background-color:#2a2b32;color:#ececf1;text-align:left;border-radius:6px;padding:5px;position:absolute;z-index:1;top:-100%;left:50%;transform:translateX(-50%);opacity:0;transition:opacity 0.3s}.tooltip-area{display:none;opacity:0;transition:opacity 0.5s ease-in-out;position:fixed;bottom:0;left:0;width:100%;height:55px;padding:8px 10px 10px;background-color:#f5f5f5;color:#616161;text-align:center;line-height:1.5;border-top:1px solid #ccc;font-size:.9rem;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-weight:400;z-index:100;box-shadow:0 -4px 8px rgb(0 0 0 / .2);text-wrap:balance}.tooltip:hover .tooltiptext{visibility:visible;opacity:1}.mp-option-text.i18n{margin-right:.25rem}.opacity-slider::-webkit-slider-runnable-track,.opacity-slider::-moz-range-track{height:4px;border-radius:2px;background:#9e9e9e}.opacity-slider::-webkit-slider-thumb,.opacity-slider::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#6fc05f;border:none}.class-1{display:flex;flex-direction:column;gap:8px}.class-2{display:flex;align-items:center;gap:12px;width:100%;justify-content:flex-start}.class-3{flex:0 0 auto;margin-bottom:4px}.class-4{flex:1 1 auto;min-width:0;display:flex;justify-content:center;align-items:center}.class-5{width:100%;overflow:visible;display:flex;align-items:center;justify-content:center}.class-6{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;transform:scale(1);transform-origin:top center;margin-left:20px;padding-right:10px!important}.class-7{width:100%;display:flex;justify-content:center}.class-8{width:20px;height:20px;display:block;opacity:.6}.class-9{width:85%}.class-10{display:flex;align-items:center;gap:4px}.class-11{font-size:11px}.class-12{margin-left:auto;flex-shrink:0}.class-13{position:relative}.class-14{flex:1}.class-15{margin-bottom:4px}.class-16{line-height:1.8!important}.class-17{margin-bottom:2px}.class-18{display:flex;justify-content:center;gap:3rem}.class-19{display:flex;gap:32px;align-items:center;justify-content:center;flex-grow:1;max-width:400px}.class-20{display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;position:relative;border-bottom:none!important}.class-21{font-size:20px}.class-22{border-bottom:none!important}.class-23{width:12px;height:12px}.class-24{margin-left:auto}.class-25{flex:0 0 auto}.class-26{flex:1 1 auto;display:flex;justify-content:center;align-items:center}.class-27{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;transform:scale(1);transform-origin:top center;margin-left:20px;margin-right:-20px}.class-28{display:flex;gap:1.5rem;align-items:center}.class-29{display:flex;align-items:center;gap:6px;cursor:pointer;border-bottom:1px dotted currentColor;padding-bottom:4px}.class-30{display:flex;align-items:center}.class-31{display:none!important}@keyframes pulse-highlight{0%{box-shadow:0 0 0 0 rgb(33 150 243 / .6)}to{box-shadow:0 0 0 0 #fff0}70%{box-shadow:0 0 0 10px #fff0}}h1{font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif!important}.opacity-editable{cursor:pointer;transition:border 0.18s,box-shadow 0.18s,background 0.18s;border-radius:20px;padding:0% .5em;border:1.5px solid #fff0;outline:none}.opacity-editable:hover,.opacity-editable:focus,.opacity-editable.editing{border:1.5px solid rgb(0 0 0 / .11);box-shadow:0 0 2px 1px rgb(0 0 0 / .07);background:rgb(0 0 0 / .015);outline:none}.opacity-editable input{outline:none;border:none;width:2.4em;font:inherit;background:none;text-align:right;box-shadow:none}#dup-overlay{position:fixed;inset:0;background:rgb(0 0 0 / .14);display:flex;align-items:center;justify-content:center;z-index:99999}#dup-box{background:#fff;padding:22px 20px 18px;border-radius:16px;box-shadow:0 4px 24px rgb(0 0 0 / .14);max-width:400px;width:92vw;font:15px / 1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}#dup-box h2{margin:0 0 12px;font-size:17px;font-weight:600;color:#111}#dup-msg{margin:0 0 16px;font-size:15px;color:#444}#dup-box label{display:flex;align-items:center;gap:7px;margin:0 0 20px;font-size:14px;color:#666;user-select:none}#dup-dont{accent-color:#007aff}.dup-btns{display:flex;justify-content:flex-end;gap:12px}#dup-no,#dup-yes{padding:7px 22px;font-size:15px;border-radius:9999px;outline:none;font-family:inherit;-webkit-tap-highlight-color:#fff0;cursor:pointer;transition:background 0.14s,border-color 0.14s,color 0.14s}#dup-no{font-weight:500;color:#007aff;background:#fff0;border:1px solid rgb(0 0 0 / .12)}#dup-no:hover,#dup-no:focus-visible{background:rgb(0 122 255 / .08);border-color:rgb(0 122 255 / .19);color:#007aff}#dup-no:active{background:rgb(0 122 255 / .16)}#dup-yes{font-weight:600;color:#fff;background:#007aff;border:none}#dup-yes:hover,#dup-yes:focus-visible{background:#338fff;color:#fff}#dup-yes:active{background:#006be6;color:#fff}span.dup-key{color:#007aff!important;font-weight:600;width:95%}.mp-key{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-width:1.8em;height:1.6em;margin:0 2px;padding:0 .4em;border-radius:6px;font-weight:600;border:1.5px solid rgb(0 0 0 / .11);box-shadow:0 0 2px 1px rgb(0 0 0 / .07);background:rgb(0 0 0 / .015);outline:none;user-select:none;transition:border 0.18s,box-shadow 0.18s,background 0.18s}.mp-key:hover,.mp-key:focus,.mp-key.listening{border:1.5px solid rgb(0 0 0 / .11);outline:2px solid #39f!important;box-shadow:0 0 2px 1px rgb(0 0 0 / .07);background:rgb(0 0 0 / .015)}.mp-key:focus{outline:2px solid #39f!important;outline-offset:1px}.custom-tooltip{position:relative}.custom-tooltip:hover::after,.custom-tooltip:focus::after,.custom-tooltip:focus-visible::after,.custom-tooltip:focus-within::after{content:attr(data-tooltip);white-space:pre;position:absolute;top:-63px;left:50%;transform:translateX(-50%);background:rgb(0 0 0 / .9);color:#fff;padding:6px 10px;border-radius:6px;font-size:16px;font-weight:500;text-align:center;line-height:1.3;z-index:9999;pointer-events:none;box-shadow:0 2px 6px rgb(0 0 0 / .2)}.custom-tooltip:hover::before,.custom-tooltip:focus::before,.custom-tooltip:focus-visible::before,.custom-tooltip:focus-within::before{content:"";position:absolute;top:-15px;left:50%;transform:translateX(-50%) rotate(180deg);border-width:6px;border-style:solid;border-color:#fff0 #fff0 rgb(0 0 0 / .9) #fff0}.mp-key--shift-left.custom-tooltip:hover::after,.mp-key--shift-left.custom-tooltip:focus::after,.mp-key--shift-left.custom-tooltip:focus-visible::after,.mp-key--shift-left.custom-tooltip:focus-within::after{left:calc(50% - 1em)}.mp-key--shift-left.custom-tooltip:hover::before,.mp-key--shift-left.custom-tooltip:focus::before,.mp-key--shift-left.custom-tooltip:focus-visible::before,.mp-key--shift-left.custom-tooltip:focus-within::before{left:calc(50% - 1em)}.ios-searchbar{margin:8px 0 12px;padding:0 4px 8px 0}.ios-searchbar-inner{display:flex;align-items:center;gap:8px}.ios-search-input{-webkit-appearance:none;appearance:none;width:100%;height:36px;border-radius:9999px;border:1px solid rgb(60 60 67 / .18);background:rgb(118 118 128 / .12);box-shadow:inset 0 1px 0 rgb(255 255 255 / .35);outline:none;padding:0 36px;font:inherit;line-height:36px;caret-color:#007aff;transition:background 0.12s,border-color 0.12s,box-shadow 0.12s;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236e6e73'><path d='M13.61 12.2l4 4a1 1 0 11-1.42 1.42l-4-4a7 7 0 111.42-1.42zM8.5 13a4.5 4.5 0 100-9 4.5 4.5 0 000 9z'/></svg>");background-repeat:no-repeat;background-position:12px 50%;background-size:16px 16px}.ios-search-input::placeholder{color:#6e6e73;opacity:1}.ios-search-input:focus{background:rgb(118 118 128 / .18);border-color:rgb(60 60 67 / .28);box-shadow:0 0 0 2px rgb(0 122 255 / .15)}.ios-search-cancel{display:none;border:0;background:#fff0;color:#007aff;font:inherit;padding:4px 8px;line-height:1;border-radius:6px}.ios-searchbar.focused .ios-search-cancel,.ios-searchbar.active .ios-search-cancel{display:inline-block}.ios-search-cancel:active{background:rgb(0 122 255 / .08)}.shortcut-container.filtering-active .blank-row{display:none!important}.shortcut-container.filtering-active .shortcut-grid{align-content:start!important;justify-content:start!important;grid-auto-flow:dense;gap:8px 12px}.shortcut-container.filtering-active .shortcut-grid>.shortcut-item{margin:0!important}@media (prefers-color-scheme:dark){.ios-search-input{border-color:rgb(235 235 245 / .18);background:rgb(118 118 128 / .24)}.ios-search-input:focus{border-color:rgb(235 235 245 / .28);box-shadow:0 0 0 2px rgb(10 132 255 / .22)}.ios-search-input::placeholder{color:#8e8e93}.ios-search-cancel{color:#0a84ff}}:root{--tooltip-max-ch:36}.material-symbols-outlined.info-icon{font-size:1em;font-weight:inherit;vertical-align:middle;line-height:1;cursor:pointer;margin-left:.25em}.info-icon-tooltip{position:relative;display:inline-flex;align-items:center;cursor:pointer}.info-icon-tooltip:hover::after,.info-icon-tooltip:focus::after{content:attr(data-tooltip);position:absolute;left:50%;bottom:120%;transform:translateX(calc(-50% + var(--tooltip-offset-x, 0px)));display:block;background:rgb(20 20 20 / .98);color:#fff;padding:12px 20px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:14px;font-weight:500;text-align:center;white-space:normal;text-wrap:balance;overflow-wrap:normal;word-break:keep-all;line-height:1.45;z-index:1100;pointer-events:none;box-shadow:0 6px 20px rgb(0 0 0 / .14),0 1.5px 7px rgb(0 0 0 / .12);inline-size:clamp(28ch, calc(var(--tooltip-max-ch) * 1ch), 95vw);box-sizing:border-box;opacity:1;transition:opacity 0.16s cubic-bezier(.4,0,.2,1);padding-block:12px;max-inline-size:var(--tooltip-max-fit,clamp(28ch, calc(var(--tooltip-max-ch) * 1ch), 95vw))}.info-icon-tooltip:hover::after,.info-icon-tooltip:focus::after{transform:translateX(calc(-50% + var(--tooltip-offset-x, 0px))) translateY(var(--tooltip-offset-y,0))}.info-icon-tooltip:hover::before,.info-icon-tooltip:focus::before{transform:translateX(calc(-50% + var(--tooltip-offset-x, 0px))) translateY(var(--tooltip-offset-y,0))}.nowrap-label{white-space:nowrap;display:inline-block}.backup-restore-tile .shortcut-keys{display:flex;align-items:center;gap:12px;flex-wrap:nowrap;white-space:nowrap;overflow-x:hidden}.dup-like-btn{padding:7px 22px;font-size:13px;border-radius:9999px;outline:none;font-family:inherit;-webkit-tap-highlight-color:#fff0;cursor:pointer;transition:background 0.14s,border-color 0.14s,color 0.14s;font-weight:500;color:#007aff;background:#fff0;border:1px solid rgb(0 0 0 / .12)}.dup-like-btn:hover,.dup-like-btn:focus-visible{background:rgb(0 122 255 / .08);border-color:rgb(0 122 255 / .19);color:#007aff}.dup-like-btn:active{background:rgb(0 122 255 / .16)}.class-9{accent-color:#60c35b}#dup-line1{text-wrap:normal!important;white-space:normal!important}#dup-box,#dup-box *{text-wrap:normal!important;white-space:normal!important;word-break:normal!important;overflow-wrap:normal!important}.blank-row{grid-column:span 2;height:50px}.blank-row.section-header{display:flex;align-items:flex-end;justify-content:flex-start;padding:0 .75rem 2px;min-height:24px;color:rgb(60 60 67 / .6);font-size:12px;font-weight:600;letter-spacing:.06em;line-height:1;text-transform:uppercase;white-space:nowrap}.model-picker-shortcut-grid{display:grid;grid-auto-flow:row;grid-template-columns:repeat(5,minmax(0,1fr));grid-auto-rows:auto;gap:4px;margin-bottom:12px;overflow:hidden;padding:8px 0;font-size:80%;box-sizing:border-box;background:transparent}.model-picker-shortcut-grid>.shortcut-item:nth-child(n+16){display:none}.model-picker-shortcut-grid .shortcut-item{background:var(--bg-secondary);border:1px solid var(--border-light);border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;transition:box-shadow .12s;padding:.75rem;min-height:3.5rem}.model-picker-shortcut-grid .shortcut-label{font-size:inherit;color:var(--text-primary);font-weight:400;line-height:1.5;margin-bottom:6px;text-align:center}.model-picker-shortcut-grid .shortcut-keys{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:0;font-size:.9rem;color:var(--text-secondary)}.model-picker-shortcut-grid .key-text,.model-picker-shortcut-grid .platform-alt-label{font-weight:600;font-size:.9rem;color:var(--text-primary)}.model-picker-shortcut-grid .key-input{width:50px;height:2rem;border:1px solid var(--border-light);border-radius:9999px;text-align:center;font-size:.9rem;font-weight:700;background-color:var(--bg-primary);color:var(--text-secondary);pointer-events:none;margin-left:2px;margin-right:2px}.model-picker-shortcut-grid *{box-sizing:border-box}*,body{color:#000}.model-picker-shortcut-grid .shortcut-label{font-size:108%;}.model-picker-shortcut-grid{padding-bottom:0;margin-bottom:0;}
  `;

  // ---- 2) Utils ----
  const NBSP = '\u00A0';

  const unwrapSettings = (obj) => {
    if (obj?.data && typeof obj.data === 'object') {
      const hasShortcutKeys = Object.keys(obj.data).some(
        (k) => k.startsWith('shortcutKey') || k.startsWith('selectThenCopy'),
      );
      if (hasShortcutKeys) return obj.data;
    }
    return obj || {};
  };

  const isAssigned = (val) => typeof val === 'string' && val.trim() && val !== NBSP;

  // Platform-aware key display
  function displayFromCode(code) {
    if (!code || code === '' || code === '\u00A0') return '\u00A0';

    // Robust Mac detection (works in Chrome extensions)
    const isMac = (() => {
      const ua = navigator.userAgent || '';
      const plat = navigator.platform || '';
      const uaDataPlat = navigator.userAgentData?.platform ?? '';
      return /Mac/i.test(plat) || /Mac/i.test(ua) || /mac/i.test(uaDataPlat);
    })();

    if (/^Key([A-Z])$/.test(code)) return code.slice(-1).toLowerCase();
    if (/^Digit([0-9])$/.test(code)) return code.slice(-1);
    if (/^Numpad([0-9])$/.test(code)) return code.slice(-1);
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;

    const baseMap = {
      Minus: '-',
      Equal: '=',
      BracketLeft: '[',
      BracketRight: ']',
      Backslash: '\\',
      Semicolon: ';',
      Quote: "'",
      Comma: ',',
      Period: '.',
      Slash: '/',
      Backquote: '`',
      Space: 'Space',
      Enter: 'Enter',
      Escape: 'Esc',
      Tab: 'Tab',
      Backspace: 'Bksp',
      Delete: 'Del',
      ArrowLeft: '←',
      ArrowRight: '→',
      ArrowUp: '↑',
      ArrowDown: '↓',
      IntlBackslash: '\\',
      IntlYen: '¥',
      IntlRo: 'ro',
      Lang1: 'lang1',
      Lang2: 'lang2',
      Lang3: 'lang3',
      Lang4: 'lang4',
      Lang5: 'lang5',
      VolumeMute: 'Mute',
      VolumeDown: 'Vol–',
      VolumeUp: 'Vol+',
      MediaPlayPause: 'Play/Pause',
      MediaTrackNext: 'Next',
      MediaTrackPrevious: 'Prev',
    };

    const mods = isMac
      ? {
          MetaLeft: '⌘',
          MetaRight: '⌘',
          AltLeft: '⌥',
          AltRight: '⌥',
          ControlLeft: 'Ctrl',
          ControlRight: 'Ctrl',
          ShiftLeft: '⇧',
          ShiftRight: '⇧',
          Fn: 'fn',
        }
      : {
          MetaLeft: 'Win',
          MetaRight: 'Win',
          AltLeft: 'Alt',
          AltRight: 'Alt',
          ControlLeft: 'Ctrl',
          ControlRight: 'Ctrl',
          ShiftLeft: 'Shift',
          ShiftRight: 'Shift',
          Fn: 'Fn',
        };

    if (code in baseMap) return baseMap[code];
    if (code in mods) return mods[code];

    return code.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  // ====== content.js (NEW SECTION TO PASTE IN) ======
  // Build model switcher shortcut grid (top of overlay)
  function buildModelSwitcherGrid(cfg) {
    const MAX = window.ModelLabels?.MAX_SLOTS || 15;

    const isLegacyArrow = (s) => {
      const t = (s ?? '').toString().trim();
      if (!t) return false;
      if (t === '→') return true;
      if (/^legacy\s*models?/i.test(t)) return true;
      return /legacy/i.test(t) && t.includes('→');
    };

    // Prefer hydrated actionable names (window.MODEL_NAMES from hydrateModelData),
    // fall back to canonical defaults from ModelLabels (which include the arrow).
    const rawNames =
      Array.isArray(window.MODEL_NAMES) && window.MODEL_NAMES.length
        ? window.MODEL_NAMES.slice()
        : window.ModelLabels?.defaultNames?.() || [];

    // Actionable = non-arrow, non-empty, in canonical order, capped at MAX.
    const names = rawNames
      .filter((n) => !isLegacyArrow(n))
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter(Boolean)
      .slice(0, MAX);

    const buildDefaultCodes = (n = names.length || 0) => {
      const base = [
        'Digit1',
        'Digit2',
        'Digit3',
        'Digit4',
        'Digit5',
        'Digit6',
        'Digit7',
        'Digit8',
        'Digit9',
        'Digit0',
      ];
      while (base.length < n) base.push('');
      return base.slice(0, n);
    };

    let codes =
      Array.isArray(window.__modelPickerKeyCodes) && window.__modelPickerKeyCodes.length
        ? window.__modelPickerKeyCodes.slice()
        : buildDefaultCodes(names.length);

    // Ensure codes list is aligned 1:1 with actionable names
    codes = codes.slice(0, names.length);
    while (codes.length < names.length) codes.push('');

    const esc = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      );

    // Platform-aware modifier label for the model picker (Alt vs Control/Command)
    const isMac = (() => {
      const ua = navigator.userAgent || '';
      const plat = navigator.platform || '';
      const uaDataPlat = navigator.userAgentData?.platform ?? '';
      return /Mac/i.test(plat) || /Mac/i.test(ua) || /mac/i.test(uaDataPlat);
    })();
    const useCtrl = !!cfg?.useControlForModelSwitcherRadio;
    const modLabel = useCtrl ? (isMac ? 'Command + ' : 'Ctrl + ') : isMac ? 'Opt ⌥ ' : 'Alt + ';

    const rows = [];
    for (let i = 0; i < names.length; i++) {
      const rawCode = codes[i];
      if (!isAssigned(rawCode)) continue; // overlay: only show assigned shortcuts
      const label = names[i] ? esc(names[i]) : '';
      const val = displayFromCode(rawCode);
      rows.push(`
      <div class="shortcut-item">
        <div class="shortcut-label"><span>${label}</span></div>
        <div class="shortcut-keys">
          <span class="key-text platform-alt-label">${modLabel}</span>
          <input class="key-input" disabled maxlength="12" value="${val}" />
        </div>
      </div>
    `);
    }

    if (!rows.length) return '';

    return `
<div class="section-header" role="heading" aria-level="2" style="margin-top:0;padding-left:12px;font-size:12px;font-family:ui-sans-serif,-apple-system,system-ui,'Segoe UI',Helvetica,'Apple Color Emoji',Arial,sans-serif,'Segoe UI Emoji','Segoe UI Symbol';font-weight:600;line-height:12px;letter-spacing:0.72px;text-transform:uppercase;color:rgba(60,60,67,0.6);">
  Switch Models
</div>
<div class="model-picker-shortcut-grid">
  ${rows.join('')}
</div>`;
  }

  // ---- 3) Build overlay HTML (sections similar to popup, but only assigned shortcuts) ----
  const buildOverlayHtml = (cfg) => {
    const sections = [
      {
        header: 'Model Picker + UI Tweaks',
        keys: [
          'shortcutKeyToggleModelSelector',
          'shortcutKeyThinkingStandard',
          'shortcutKeyThinkingExtended',
        ],
      },
      {
        header: 'Quick Clicks',
        keys: [
          'shortcutKeyNewConversation',
          'shortcutKeyActivateInput',
          'shortcutKeyToggleSidebar',
          'shortcutKeyPreviousThread',
          'shortcutKeyNextThread',
          'shortcutKeySearchConversationHistory',
        ],
      },
      {
        header: 'Scroll',
        keys: [
          'shortcutKeyScrollToTop',
          'shortcutKeyClickNativeScrollToBottom',
          'shortcutKeyScrollUpOneMessage',
          'shortcutKeyScrollDownOneMessage',
          'shortcutKeyScrollUpTwoMessages',
          'shortcutKeyScrollDownTwoMessages',
        ],
      },
      {
        header: 'Clipboard',
        keys: [
          'shortcutKeyCopyLowest',
          'selectThenCopy',
          'selectThenCopyAllMessages',
          'shortcutKeyCopyAllCodeBlocks',
        ],
      },
      {
        header: 'Compose + Send',
        keys: [
          'shortcutKeyEdit',
          'shortcutKeySendEdit',
          'shortcutKeyTemporaryChat',
          'shortcutKeyToggleDictate',
        ],
      },
      {
        header: 'Regenerate Response',
        keys: [
          'shortcutKeyRegenerateTryAgain',
          'shortcutKeyRegenerateMoreConcise',
          'shortcutKeyRegenerateAddDetails',
          'shortcutKeyRegenerateWithDifferentModel',
          'shortcutKeyRegenerateAskToChangeResponse',
        ],
      },
      {
        header: 'Message Tools',
        keys: [
          'shortcutKeySearchWeb',
          'shortcutKeyStudy',
          'shortcutKeyCreateImage',
          'shortcutKeyToggleCanvas',
          'shortcutKeyAddPhotosFiles',
          'shortcutKeyThinkLonger',
        ],
      },
    ];

    const out = [];
    out.push(`<div class="shortcut-container">
    <h1 class="i18n" data-i18n="popup_title">ChatGPT Custom Shortcuts Pro</h1>
    ${buildModelSwitcherGrid(cfg)}
    <div class="shortcut-grid">`);

    for (const section of sections) {
      const rows = section.keys
        .filter((k) => isAssigned(cfg[k]))
        .map((k) => {
          const val = cfg[k];
          return `
          <div class="shortcut-item">
            <div class="shortcut-label"><span>${keyToLabel(k)}</span></div>
            <div class="shortcut-keys">
              <span class="key-text platform-alt-label"> Alt + </span>
              <input class="key-input" disabled id="${k}" maxlength="12" value="${displayFromCode(val)}" />
            </div>
          </div>
        `;
        });

      if (rows.length) {
        out.push(
          `<div class="blank-row section-header" role="heading" aria-level="2">${section.header}</div>`,
        );
        out.push(rows.join(''));
      }
    }

    out.push(`</div></div>`);
    return out.join('');
  };

  // ---- 4) Show/close overlay (injecting CSS, scrolling) ----
  const OVERLAY_ID = 'csp-shortcut-overlay';

  const showShortcutOverlay = (cfg) => {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      existing.remove();
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.65);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Set up a shadow root for CSS encapsulation.
    const shadow = overlay.attachShadow({ mode: 'open' });

    [
      'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap',
      'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;600&display=swap',
      'https://fonts.googleapis.com/icon?family=Material+Icons',
      'https://fonts.googleapis.com/icon?family=Material+Icons+Outlined',
      'https://fonts.googleapis.com/icon?family=Material+Symbols+Outlined',
    ].forEach((href) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      shadow.appendChild(link);
    });

    // Variables to shift position slightly here   ↓
    const CLOSE_BTN_SHIFT_TOP = -12; // negative = up, positive = down, in px
    const CLOSE_BTN_SHIFT_RIGHT = -12; // negative = closer to edge, positive = further left, in px

    // Scroll container should use max-height and overflow-y:auto
    shadow.innerHTML = `
    <style>${FULL_POPUP_CSS}</style>
    <style>
      :root {
        --close-btn-color: #0d026fff;
        --close-btn-hover: #610404;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --close-btn-color: #fff;
          --close-btn-hover: #ffb4b4;
        }
      }

      .csp-close-btn {
        position: fixed;
        top: var(--close-btn-top);
        right: var(--close-btn-right);
        z-index: 3;
        border: none;
        background: transparent;
        color: var(--close-btn-color);
        font: 600 45px/1 system-ui, sans-serif;
        cursor: pointer;
        transition: color .24s, transform .16s;
      }

      .csp-close-btn:hover {
        color: var(--close-btn-hover);
        transform: scale(.9);
      }

      .csp-close-btn:focus-visible {
        outline: 2px solid #1a73e8;
        outline-offset: 2px;
      }

    </style>
    <div class="csp-box-wrap" style="max-height:90vh;overflow-y:auto;width:min(800px,100vw - 10px);margin:0 auto;">
      ${buildOverlayHtml(cfg)}
      <button class="csp-close-btn" aria-label="Close overlay">×</button>
    </div>
    `;

    /* Position the X: 1em left of the H1's right edge, same top as H1, then keep fixed */
    const placeCloseBtnFromH1 = () => {
      const btn = shadow.querySelector('.csp-close-btn');
      const h1 =
        shadow.querySelector('.shortcut-container h1.i18n[data-i18n="popup_title"]') ||
        shadow.querySelector('.shortcut-container h1.i18n') ||
        shadow.querySelector('.shortcut-container h1');
      if (!btn || !h1) return;

      const h1Rect = h1.getBoundingClientRect();
      const emPx = parseFloat(getComputedStyle(h1).fontSize) || 16;

      // Add your shift offsets here:
      btn.style.top = `${Math.max(0, Math.round(h1Rect.top) + CLOSE_BTN_SHIFT_TOP)}px`;
      btn.style.right =
        Math.max(0, Math.round(window.innerWidth - h1Rect.right + emPx) + CLOSE_BTN_SHIFT_RIGHT) +
        'px';
    };

    // Initial placement after layout and again after fonts load (to account for metric shifts)
    requestAnimationFrame(placeCloseBtnFromH1);
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => requestAnimationFrame(placeCloseBtnFromH1));
    }

    // Keep aligned on window resizes
    const onResize = () => placeCloseBtnFromH1();
    window.addEventListener('resize', onResize, { passive: true });

    const close = () => {
      window.removeEventListener('resize', onResize);
      overlay.remove();
    };
    shadow.querySelector('.csp-close-btn')?.addEventListener('click', close);
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onEsc, true);
      }
    };
    document.addEventListener('keydown', onEsc, true);
    overlay.addEventListener('click', (e) => {
      const path = e.composedPath?.() || [];
      if (path[0] === overlay) close();
    });

    document.body.appendChild(overlay);
  };

  // ====== content.js (NEW SECTION TO PASTE IN) ======
  // ---- 5) Read settings and open overlay on Ctrl+/ ----
  const isExtensionAlive = () =>
    typeof chrome !== 'undefined' &&
    !!chrome.runtime &&
    !!chrome.runtime.id &&
    !!chrome.storage?.sync;

  const getAllSettings = () =>
    new Promise((resolve) => {
      if (!isExtensionAlive()) {
        resolve({});
        return;
      }
      try {
        chrome.storage.sync.get(null, (raw) => {
          if (!isExtensionAlive()) {
            resolve({});
            return;
          }
          if (chrome.runtime.lastError) {
            console.warn('[CSP] storage.get(all) failed:', chrome.runtime.lastError);
            resolve({});
            return;
          }
          resolve(unwrapSettings(raw));
        });
      } catch (err) {
        console.warn('[CSP] storage.get(all) threw:', err);
        resolve({});
      }
    });

  const hydrateModelData = () =>
    new Promise((resolve) => {
      if (!isExtensionAlive()) return resolve();

      const MAX = window.ModelLabels?.MAX_SLOTS || 15;
      const isLegacyArrow = (s) => {
        const t = (s ?? '').toString().trim();
        if (!t) return false;
        if (t === '→') return true;
        if (/^legacy\s*models?/i.test(t)) return true;
        return /legacy/i.test(t) && t.includes('→');
      };
      const defaultNames = () => window.ModelLabels?.defaultNames?.() || [];
      const buildDefaultCodes = (n = MAX) => {
        const base = [
          'Digit1',
          'Digit2',
          'Digit3',
          'Digit4',
          'Digit5',
          'Digit6',
          'Digit7',
          'Digit8',
          'Digit9',
          'Digit0',
        ];
        while (base.length < n) base.push('');
        return base.slice(0, n);
      };

      try {
        chrome.storage.sync.get(['modelNames', 'modelPickerKeyCodes'], (res = {}) => {
          if (!isExtensionAlive()) return resolve();
          if (chrome.runtime.lastError) {
            console.warn('[CSP] storage.get(model*) failed:', chrome.runtime.lastError);
            return resolve();
          }
          try {
            // Canonical names saved by content.js (may contain arrow “→”)
            const rawNames = Array.isArray(res.modelNames)
              ? res.modelNames.slice(0, MAX)
              : defaultNames();

            // Actionable display names: drop arrow + empties, keep canonical order.
            const names = rawNames
              .filter((n) => !isLegacyArrow(n))
              .map((v) => (v == null ? '' : String(v).trim()))
              .filter(Boolean)
              .slice(0, MAX);

            // Codes saved by the popup are already aligned to actionable names (no arrow slot).
            let codes = Array.isArray(res.modelPickerKeyCodes)
              ? res.modelPickerKeyCodes.slice(0, MAX)
              : buildDefaultCodes(names.length || MAX);

            while (codes.length < MAX) codes.push('');

            // Now trim/pad to actionable names length
            codes = codes.slice(0, names.length);
            while (codes.length < names.length) codes.push('');

            // These are the same structures used by popup.js: names are actionable only,
            // codes aligned 1:1 with those names.
            window.MODEL_NAMES = names;
            window.__modelPickerKeyCodes = codes;
          } catch (err) {
            console.warn('[CSP] hydrateModelData error:', err);
          }
          resolve();
        });
      } catch (err) {
        console.warn('[CSP] storage.get(model*) threw:', err);
        resolve();
      }
    });

  const keyToLabel = (key) =>
    key
      .replace(/^shortcutKey/, '')
      .replace(/^selectThenCopy(AllMessages)?/, 'Select Then Copy$1')
      .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
      .replace(/^./, (s) => s.toUpperCase())
      .replace(/\bGpt\b/gi, 'GPT')
      .trim();

  const onKeyDown = (e) => {
    const ctrlSlash =
      e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.shiftKey &&
      (e.code === 'Slash' || e.key === '/' || e.code === 'NumpadDivide');
    if (!ctrlSlash) return;
    e.preventDefault();
    e.stopPropagation();

    Promise.all([getAllSettings(), hydrateModelData()])
      .then(([cfg]) => {
        if (!isExtensionAlive()) return;
        // last guard: DOM might be gone if tab navigated between keydown and resolve
        if (!document || !document.body) return;
        showShortcutOverlay(cfg || {});
      })
      .catch((err) => {
        console.warn('[CSP] overlay open failed:', err);
      });
  };

  document.addEventListener('keydown', onKeyDown, { capture: true });
})();

// ==================================================
// @note Click-to-copy inline code (gated by settings)
// ==================================================

(() => {
  const STYLE_ID = 'csp-inline-code-copy-style';
  let styleEl = null;
  let listening = false;

  const ensureStyle = () => {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = 'pre code{cursor:auto} code{cursor:pointer}';
    document.head.appendChild(styleEl);
  };

  const removeStyle = () => {
    styleEl?.remove();
    styleEl = null;
  };

  const onClick = (e) => {
    const el = e.target.closest('code');
    if (!el || el.closest('pre')) return;

    const txt = el.textContent.trim();
    if (!txt) return;

    const fallback = () => {
      const ta = Object.assign(document.createElement('textarea'), { value: txt });
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    };

    (navigator.clipboard?.writeText(txt) || Promise.reject()).catch(fallback);
    el.animate([{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], { duration: 200 });
  };

  const detach = () => {
    if (!listening) return;
    document.removeEventListener('click', onClick, true);
    listening = false;
    removeStyle();
  };

  const applySetting = (enabled) => {
    const isOn = Boolean(enabled);
    window._clickToCopyInlineCodeEnabled = isOn;
    window.clickToCopyInlineCodeEnabled = isOn;

    if (!isOn) {
      detach();
      return;
    }

    ensureStyle();
    if (!listening) {
      document.addEventListener('click', onClick, { capture: true });
      listening = true;
    }
  };

  chrome.storage.sync.get(
    { clickToCopyInlineCodeEnabled: false },
    ({ clickToCopyInlineCodeEnabled }) => {
      applySetting(clickToCopyInlineCodeEnabled);
    },
  );

  chrome.storage.onChanged.addListener((chg, area) => {
    if (area !== 'sync' || !('clickToCopyInlineCodeEnabled' in chg)) return;
    applySetting(chg.clickToCopyInlineCodeEnabled.newValue);
  });
})();
