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
const VISIBILITY_DEFAULTS = (() => {
  const schemaDefaults = window.CSP_SETTINGS_SCHEMA?.content?.visibilityDefaults;
  if (schemaDefaults && typeof schemaDefaults === 'object') {
    return { ...schemaDefaults };
  }

  return {
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
    selectThenCopyAllMessagesBothUserAndChatGpt: true,
    selectThenCopyAllMessagesOnlyAssistant: false,
    selectThenCopyAllMessagesOnlyUser: false,
    doNotIncludeLabelsCheckbox: false,
    clickToCopyInlineCodeEnabled: false,
    fadeMessageButtonsCheckbox: false,
    hidePastedLibraryFilesEnabled: false,
    lazyFastModeEnabled: false,
  };
})();

// =============================================================
// Lazy Load Fast Mode POC (always active)
// =============================================================
(() => {
  const ENABLE_INLINE_LAZY_FAST_POC = false;
  if (!ENABLE_INLINE_LAZY_FAST_POC) return;
})();

// =============================================================
// Lazy Load Fast Mode history surface (always active POC)
// =============================================================
(() => {
  const ENABLE_LAZY_FAST_HISTORY_SURFACE = false;
  if (!ENABLE_LAZY_FAST_HISTORY_SURFACE) return;

  const ROUTE_RE = /^\/c\/([^/?#]+)/;
  const HISTORY_DATA_NODE_ID = 'csp-lazy-fast-history-data';
  const HISTORY_MESSAGE_SOURCE = 'csp-lazy-fast-history';
  const ROOT_ID = 'csp-lazy-fast-history-root';
  const STYLE_ID = 'csp-lazy-fast-history-style';
  const ROUTE_CHECK_MS = 700;
  const INITIAL_OLDER_TURN_COUNT = 40;
  const LOAD_MORE_BATCH_SIZE = 40;
  const BYPASS_KEY = 'csp_lazy_fast_skip_once';
  const NATIVE_TURN_SELECTOR =
    'section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"], article[data-turn]';

  const state = {
    currentConversationId: '',
    history: null,
    root: null,
    summary: null,
    toggleButton: null,
    loadMoreButton: null,
    fullButton: null,
    panel: null,
    scroller: null,
    inner: null,
    routeTimer: 0,
    virtualizer: null,
    virtualizerCleanup: null,
    renderRaf: 0,
    autoLoadCheckRaf: 0,
    visibleOlderCount: INITIAL_OLDER_TURN_COUNT,
    panelOpen: true,
    autoLoadMoreQueued: false,
  };

  const getConversationIdFromPath = (pathname = location.pathname || '') =>
    pathname.match(ROUTE_RE)?.[1] || '';

  const getMessage = (key, substitutions, fallback) => {
    try {
      const value = chrome?.i18n?.getMessage?.(key, substitutions);
      return value || fallback;
    } catch {
      return fallback;
    }
  };

  const getSegmentLabel = (segment) => {
    if (segment?.type === 'output') {
      return getMessage('lazy_fast_output_label', undefined, 'Output');
    }
    if (typeof segment?.label === 'string' && segment.label.trim()) return segment.label.trim();
    return getMessage('lazy_fast_rich_content_label', undefined, 'Rich content');
  };

  const getOlderTurns = () =>
    Array.isArray(state.history?.turns)
      ? state.history.turns.slice(0, Math.max(0, Number(state.history.keptStartIndex) || 0))
      : [];

  const getDisplayedOlderTurns = () => {
    const olderTurns = getOlderTurns();
    if (!olderTurns.length) return [];
    const startIndex = Math.max(0, olderTurns.length - state.visibleOlderCount);
    return olderTurns.slice(startIndex);
  };

  const getRemainingOlderTurnCount = () => {
    const olderTurns = getOlderTurns();
    return Math.max(0, olderTurns.length - getDisplayedOlderTurns().length);
  };

  const clearRenderRaf = () => {
    if (!state.renderRaf) return;
    cancelAnimationFrame(state.renderRaf);
    state.renderRaf = 0;
  };

  const clearAutoLoadCheckRaf = () => {
    if (!state.autoLoadCheckRaf) return;
    cancelAnimationFrame(state.autoLoadCheckRaf);
    state.autoLoadCheckRaf = 0;
  };

  const queueLoadMoreOlderTurns = () => {
    if (state.autoLoadMoreQueued) return;
    if (getRemainingOlderTurnCount() <= 0) return;
    const previousDisplayed = getDisplayedOlderTurns();
    const previousLength = previousDisplayed.length;
    state.autoLoadMoreQueued = true;
    requestAnimationFrame(() => {
      state.autoLoadMoreQueued = false;
      state.visibleOlderCount += LOAD_MORE_BATCH_SIZE;
      updateSurface();
      requestAnimationFrame(() => {
        const displayedTurns = getDisplayedOlderTurns();
        const addedCount = Math.max(0, displayedTurns.length - previousLength);
        if (addedCount <= 0) return;
        const boundaryTurn = displayedTurns[addedCount - 1];
        if (!boundaryTurn?.id) return;
        const boundaryNode = state.inner?.querySelector(
          `.csp-lazy-fast-turn[data-turn-id="${CSS.escape(boundaryTurn.id)}"]`,
        );
        if (!(boundaryNode instanceof HTMLElement)) return;
        boundaryNode.scrollIntoView({ block: 'start' });
      });
    });
  };

  const destroyVirtualizer = () => {
    clearRenderRaf();
    if (typeof state.virtualizerCleanup === 'function') {
      state.virtualizerCleanup();
    }
    state.virtualizerCleanup = null;
    state.virtualizer = null;
  };

  const removeRoot = () => {
    destroyVirtualizer();
    state.root?.remove();
    state.root = null;
    state.summary = null;
    state.toggleButton = null;
    state.loadMoreButton = null;
    state.fullButton = null;
    state.panel = null;
    state.scroller = null;
    state.inner = null;
  };

  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        margin: 0 0 10px;
        width: 100%;
      }
      #${ROOT_ID} .csp-lazy-fast-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 10px;
        padding: 0 0 12px;
      }
      #${ROOT_ID} .csp-lazy-fast-summary {
        flex: 1 1 240px;
        min-width: 0;
        font: 500 12px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: var(--text-tertiary, rgb(102 102 102));
      }
      #${ROOT_ID} .csp-lazy-fast-button {
        appearance: none;
        border: 1px solid rgb(0 0 0 / 0.08);
        background: transparent;
        color: var(--text-primary, #1f1f1f);
        border-radius: 999px;
        padding: 6px 11px;
        font: 500 12px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        cursor: pointer;
      }
      .dark #${ROOT_ID} .csp-lazy-fast-button {
        border-color: rgb(255 255 255 / 0.08);
        background: transparent;
        color: var(--text-primary, #ececec);
      }
      #${ROOT_ID} .csp-lazy-fast-panel {
        display: block;
        padding: 0;
      }
      #${ROOT_ID} .csp-lazy-fast-scroller {
        position: relative;
        height: auto;
        min-height: 0;
        max-height: none;
        overflow: visible;
        overscroll-behavior: auto;
        border-radius: 0;
        background: transparent;
      }
      #${ROOT_ID} .csp-lazy-fast-inner {
        position: static;
        width: 100%;
      }
      #${ROOT_ID} .csp-lazy-fast-turn {
        position: relative;
        left: 0;
        width: 100%;
        padding: 0 0 6px;
        box-sizing: border-box;
      }
      #${ROOT_ID} .csp-lazy-fast-turn--assistant {
        justify-content: flex-start;
      }
      #${ROOT_ID} .csp-lazy-fast-turn--user {
        justify-content: flex-end;
      }
      #${ROOT_ID} .csp-lazy-fast-turn-shell {
        display: flex;
        width: 100%;
      }
      #${ROOT_ID} .csp-lazy-fast-turn-shell--assistant {
        justify-content: flex-start;
      }
      #${ROOT_ID} .csp-lazy-fast-turn-shell--user {
        justify-content: flex-end;
      }
      #${ROOT_ID} .csp-lazy-fast-bubble {
        max-width: min(100%, 42rem);
        border-radius: 18px;
        padding: 12px 14px;
        border: 1px solid rgb(0 0 0 / 0.04);
      }
      #${ROOT_ID} .csp-lazy-fast-turn-shell--assistant .csp-lazy-fast-bubble {
        background: rgb(255 255 255 / 0.72);
      }
      #${ROOT_ID} .csp-lazy-fast-turn-shell--user .csp-lazy-fast-bubble {
        background: rgb(16 163 127 / 0.09);
      }
      .dark #${ROOT_ID} .csp-lazy-fast-turn-shell--assistant .csp-lazy-fast-bubble {
        background: rgb(44 44 44 / 0.72);
        border-color: rgb(255 255 255 / 0.06);
      }
      .dark #${ROOT_ID} .csp-lazy-fast-turn-shell--user .csp-lazy-fast-bubble {
        background: rgb(16 163 127 / 0.18);
        border-color: rgb(255 255 255 / 0.06);
      }
      #${ROOT_ID} .csp-lazy-fast-segment + .csp-lazy-fast-segment {
        margin-top: 12px;
      }
      #${ROOT_ID} .csp-lazy-fast-text {
        white-space: pre-wrap;
        word-break: break-word;
        font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #${ROOT_ID} .csp-lazy-fast-native-block + .csp-lazy-fast-native-block {
        margin-top: 0.75rem;
      }
      #${ROOT_ID} .csp-lazy-fast-native-code {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
      }
      #${ROOT_ID} .csp-lazy-fast-rich {
        border: 1px dashed rgb(0 0 0 / 0.14);
        border-radius: 14px;
        padding: 10px 12px;
        background: rgb(0 0 0 / 0.025);
      }
      .dark #${ROOT_ID} .csp-lazy-fast-rich {
        border-color: rgb(255 255 255 / 0.16);
        background: rgb(255 255 255 / 0.03);
      }
      #${ROOT_ID} .csp-lazy-fast-rich-title {
        font: 600 12px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #${ROOT_ID} .csp-lazy-fast-rich-summary {
        margin-top: 4px;
        color: rgb(90 90 90);
        font: 400 12px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .dark #${ROOT_ID} .csp-lazy-fast-rich-summary {
        color: rgb(180 180 180);
      }
      #${ROOT_ID} .csp-lazy-fast-code-label {
        display: inline-flex;
        margin-bottom: 8px;
        padding: 3px 8px;
        border-radius: 999px;
        background: rgb(0 0 0 / 0.06);
        font: 600 11px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace;
      }
      .dark #${ROOT_ID} .csp-lazy-fast-code-label {
        background: rgb(255 255 255 / 0.08);
      }
      #${ROOT_ID} .csp-lazy-fast-code {
        margin: 0;
        padding: 12px 14px;
        border-radius: 14px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        background: rgb(0 0 0 / 0.045);
        font: 400 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      .dark #${ROOT_ID} .csp-lazy-fast-code {
        background: rgb(0 0 0 / 0.24);
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };

  const appendParagraphText = (target, value) => {
    const text = String(value || '').replace(/\r\n?/g, '\n');
    const paragraphs = text.split(/\n{2,}/).filter(Boolean);
    const source = paragraphs.length ? paragraphs : [text];

    source.forEach((paragraph) => {
      const p = document.createElement('p');
      p.className = 'whitespace-pre-wrap';
      p.textContent = paragraph;
      target.appendChild(p);
    });
  };

  const createTextSegmentNode = (segment, role) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'csp-lazy-fast-native-block';

    if (role === 'assistant') {
      appendParagraphText(wrapper, segment.text || '');
      return wrapper;
    }

    const text = document.createElement('div');
    text.className = 'whitespace-pre-wrap';
    text.textContent = segment.text || '';
    wrapper.appendChild(text);
    return wrapper;
  };

  const createCodeSegmentNode = (segment, role) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'csp-lazy-fast-native-block';

    if (segment.language) {
      const label = document.createElement('div');
      label.className = 'csp-lazy-fast-code-label';
      label.textContent = segment.language;
      wrapper.appendChild(label);
    }

    const pre = document.createElement('pre');
    pre.className =
      role === 'assistant'
        ? 'csp-lazy-fast-native-code'
        : 'csp-lazy-fast-code csp-lazy-fast-native-code';
    const code = document.createElement('code');
    code.textContent = segment.text || '';
    pre.appendChild(code);
    wrapper.appendChild(pre);
    return wrapper;
  };

  const createRichSegmentNode = (segment) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'csp-lazy-fast-native-block csp-lazy-fast-rich';

    const title = document.createElement('div');
    title.className = 'csp-lazy-fast-rich-title';
    title.textContent = getSegmentLabel(segment);
    wrapper.appendChild(title);

    const summary = document.createElement('div');
    summary.className = 'csp-lazy-fast-rich-summary';
    summary.textContent =
      typeof segment?.summary === 'string' && segment.summary.trim()
        ? segment.summary.trim()
        : getMessage(
            'lazy_fast_rich_content_summary',
            getSegmentLabel(segment),
            `${getSegmentLabel(segment)} is preserved in Fast Mode but not fully rendered yet.`,
          );
    wrapper.appendChild(summary);

    return wrapper;
  };

  const getNativeTurnTemplate = (role) =>
    Array.from(document.querySelectorAll(NATIVE_TURN_SELECTOR)).find(
      (node) => node instanceof HTMLElement && !node.closest(`#${ROOT_ID}`) && node.getAttribute('data-turn') === role,
    ) || null;

  const stripNativeTurnChrome = (shell) => {
    shell
      .querySelectorAll('[aria-label="Your message actions"], [aria-label="Response actions"]')
      .forEach((actions) => {
        const row = actions.closest('.z-0');
        if (row) {
          row.remove();
          return;
        }
        actions.remove();
      });
  };

  const populateNativeTurnContent = (container, turn) => {
    container.replaceChildren();
    if (turn.role === 'assistant') {
      for (const segment of turn.segments || []) {
        if (segment.type === 'text') {
          appendParagraphText(container, segment.text || '');
          continue;
        }

        if (segment.type === 'rich') {
          container.appendChild(createRichSegmentNode(segment));
          continue;
        }

        if (segment.type === 'output' || segment.language) {
          const label = document.createElement('div');
          label.className = 'csp-lazy-fast-code-label';
          label.textContent = segment.type === 'output' ? getSegmentLabel(segment) : segment.language;
          container.appendChild(label);
        }

        const pre = document.createElement('pre');
        pre.className = 'csp-lazy-fast-native-code';
        const code = document.createElement('code');
        code.textContent = segment.text || '';
        pre.appendChild(code);
        container.appendChild(pre);
      }
      return;
    }

    for (const segment of turn.segments || []) {
      if (segment.type === 'text') {
        container.appendChild(createTextSegmentNode(segment, turn.role));
        continue;
      }
      if (segment.type === 'rich') {
        container.appendChild(createRichSegmentNode(segment));
        continue;
      }
      container.appendChild(createCodeSegmentNode(segment, turn.role));
    }
  };

  const createTurnNode = (turn, index, startOffset) => {
    const template = getNativeTurnTemplate(turn.role);
    if (template instanceof HTMLElement) {
      const shell = template.cloneNode(true);
      shell.classList.add('csp-lazy-fast-turn', `csp-lazy-fast-turn--${turn.role}`);
      shell.style.transform = `translateY(${Math.round(startOffset)}px)`;
      shell.setAttribute('data-index', String(index));
      shell.setAttribute('data-turn', turn.role);
      shell.removeAttribute('data-testid');
      if (turn?.id) shell.setAttribute('data-turn-id', turn.id);

      stripNativeTurnChrome(shell);

      const message = shell.querySelector(`[data-message-author-role="${turn.role}"]`);
      if (message instanceof HTMLElement) {
        if (turn?.id) message.setAttribute('data-message-id', turn.id);
        const contentContainer =
          turn.role === 'assistant'
            ? message.querySelector('.markdown')
            : message.querySelector('.user-message-bubble-color');

        if (contentContainer instanceof HTMLElement) {
          populateNativeTurnContent(contentContainer, turn);
          return shell;
        }
      }
    }

    const shell = document.createElement('section');
    shell.className = `csp-lazy-fast-turn csp-lazy-fast-turn--${turn.role}`;
    shell.style.transform = `translateY(${Math.round(startOffset)}px)`;
    shell.setAttribute('data-index', String(index));
    if (turn?.id) shell.setAttribute('data-turn-id', turn.id);
    shell.setAttribute('dir', 'auto');
    shell.setAttribute('data-turn', turn.role);

    const content = document.createElement('div');
    content.className = turn.role === 'assistant' ? 'markdown prose dark:prose-invert w-full wrap-break-word light markdown-new-styling' : 'user-message-bubble-color corner-superellipse/0.98 relative rounded-[22px] px-4 py-2.5 leading-6 max-w-(--user-chat-width,70%)';
    populateNativeTurnContent(content, turn);
    shell.appendChild(content);
    return shell;
  };

  // biome-ignore lint/correctness/noUnusedVariables: retained virtual-render sizing helper
  const estimateTurnSize = (index) => {
    const turn = getDisplayedOlderTurns()[index];
    if (!turn) return 120;

    let score = 72;
    for (const segment of turn.segments || []) {
      const textLength = (segment.text || '').length;
      score += Math.min(180, Math.ceil(textLength / 110) * 16);
      if (segment.type !== 'text') score += 32;
    }
    return Math.max(92, Math.min(360, score));
  };

  const scheduleVirtualRender = () => {
    if (state.renderRaf) return;
    state.renderRaf = requestAnimationFrame(() => {
      state.renderRaf = 0;
      renderHistoryItems();
    });
  };

  const ensureVirtualizer = () => {
    destroyVirtualizer();
  };

  const renderFallbackItems = (displayedTurns) => {
    if (!state.inner) return;
    state.inner.replaceChildren();
    state.inner.style.height = 'auto';

    const fragment = document.createDocumentFragment();
    displayedTurns.forEach((turn, index) => {
      const node = createTurnNode(turn, index, 0);
      node.style.position = 'relative';
      node.style.transform = 'none';
      fragment.appendChild(node);
    });

    state.inner.appendChild(fragment);
  };

  function renderHistoryItems() {
    if (!state.inner || !state.panelOpen) return;
    const displayedTurns = getDisplayedOlderTurns();
    if (!displayedTurns.length) {
      state.inner.replaceChildren();
      state.inner.style.height = '0px';
      return;
    }
    renderFallbackItems(displayedTurns);
  }

  const maybeAutoLoadOlderTurns = () => {
    if (!state.root || !state.inner || !state.panelOpen) return;
    if (state.autoLoadMoreQueued) return;
    if (getRemainingOlderTurnCount() <= 0) return;

    const firstTurn = state.inner.querySelector('.csp-lazy-fast-turn');
    if (!(firstTurn instanceof HTMLElement)) return;

    const rect = firstTurn.getBoundingClientRect();
    if (rect.bottom < 0) return;
    if (rect.top > Math.min(window.innerHeight * 0.55, 220)) return;

    queueLoadMoreOlderTurns();
  };

  const scheduleAutoLoadCheck = () => {
    if (state.autoLoadCheckRaf) return;
    state.autoLoadCheckRaf = requestAnimationFrame(() => {
      state.autoLoadCheckRaf = 0;
      maybeAutoLoadOlderTurns();
    });
  };

  const updateButtons = () => {
    if (!state.history || !state.root) return;

    const olderTurns = getOlderTurns();
    const olderCount = olderTurns.length;
    const visibleCount = getDisplayedOlderTurns().length;
    const remainingCount = getRemainingOlderTurnCount();
    const hiddenCount = olderCount.toLocaleString();

    state.summary.textContent = getMessage(
      'lazy_fast_history_summary',
      hiddenCount,
      `Fast Mode hid ${hiddenCount} earlier turns.`,
    );

    state.toggleButton.textContent = state.panelOpen
      ? getMessage('lazy_fast_hide_older', undefined, 'Hide older history')
      : getMessage(
          'lazy_fast_show_older',
          visibleCount.toLocaleString(),
          `Show older history (${visibleCount})`,
        );
    state.toggleButton.style.display = 'none';

    state.loadMoreButton.style.display = state.panelOpen && remainingCount > 0 ? '' : 'none';
    if (remainingCount > 0) {
      const batchCount = Math.min(LOAD_MORE_BATCH_SIZE, remainingCount).toLocaleString();
      state.loadMoreButton.textContent = getMessage(
        'lazy_fast_load_more',
        batchCount,
        `Load ${batchCount} more older turns`,
      );
    }

    state.fullButton.textContent = getMessage(
      'lazy_fast_load_full',
      undefined,
      'Load full conversation natively',
    );
  };

  const refreshRootPlacement = () => {
    if (!state.history || !getOlderTurns().length) {
      removeRoot();
      return;
    }

    ensureStyle();

    const firstNativeTurn = document.querySelector(NATIVE_TURN_SELECTOR);
    const anchorParent = firstNativeTurn?.parentElement;
    if (!anchorParent || !firstNativeTurn) return;

    if (!state.root) {
      const root = document.createElement('section');
      root.id = ROOT_ID;

      const toolbar = document.createElement('div');
      toolbar.className = 'csp-lazy-fast-toolbar';

      const summary = document.createElement('div');
      summary.className = 'csp-lazy-fast-summary';

      const toggleButton = document.createElement('button');
      toggleButton.type = 'button';
      toggleButton.className = 'csp-lazy-fast-button';
      toggleButton.addEventListener('click', () => {
        state.panelOpen = !state.panelOpen;
        if (state.panelOpen) {
          state.visibleOlderCount = Math.max(INITIAL_OLDER_TURN_COUNT, state.visibleOlderCount);
        }
        updateSurface();
        if (state.panelOpen && state.scroller) {
          requestAnimationFrame(() => {
            if (!state.scroller) return;
            state.scroller.scrollTop = state.scroller.scrollHeight;
          });
        }
      });

      const loadMoreButton = document.createElement('button');
      loadMoreButton.type = 'button';
      loadMoreButton.className = 'csp-lazy-fast-button';
      loadMoreButton.addEventListener('click', () => {
        queueLoadMoreOlderTurns();
      });

      const fullButton = document.createElement('button');
      fullButton.type = 'button';
      fullButton.className = 'csp-lazy-fast-button';
      fullButton.addEventListener('click', () => {
        try {
          localStorage.setItem(BYPASS_KEY, 'true');
        } catch { }
        location.reload();
      });

      const panel = document.createElement('div');
      panel.className = 'csp-lazy-fast-panel';

      const scroller = document.createElement('div');
      scroller.className = 'csp-lazy-fast-scroller';

      const inner = document.createElement('div');
      inner.className = 'csp-lazy-fast-inner';

      scroller.appendChild(inner);
      panel.appendChild(scroller);

      toolbar.appendChild(summary);
      toolbar.appendChild(toggleButton);
      toolbar.appendChild(loadMoreButton);
      toolbar.appendChild(fullButton);
      root.appendChild(toolbar);
      root.appendChild(panel);

      state.root = root;
      state.summary = summary;
      state.toggleButton = toggleButton;
      state.loadMoreButton = loadMoreButton;
      state.fullButton = fullButton;
      state.panel = panel;
      state.scroller = scroller;
      state.inner = inner;
    }

    if (state.root.parentElement !== anchorParent || state.root.nextElementSibling !== firstNativeTurn) {
      anchorParent.insertBefore(state.root, firstNativeTurn);
    }
  };

  const updateSurface = () => {
    refreshRootPlacement();

    if (!state.root) return;

    state.root.classList.toggle('is-open', !!state.panelOpen);
    updateButtons();
    ensureVirtualizer();
    scheduleVirtualRender();
    scheduleAutoLoadCheck();
  };

  const clearHistoryState = () => {
    state.history = null;
    state.visibleOlderCount = INITIAL_OLDER_TURN_COUNT;
    state.panelOpen = false;
    clearAutoLoadCheckRaf();
    removeRoot();
  };

  const readStoredHistoryPayload = () => {
    const node = document.getElementById(HISTORY_DATA_NODE_ID);
    const text = node?.textContent?.trim();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const applyHistoryPayload = (payload) => {
    const conversationId = getConversationIdFromPath();
    if (!payload?.conversationId || payload.conversationId !== conversationId) return;
    if (!Array.isArray(payload.turns) || !payload.turns.length) return;
    if ((payload.keptStartIndex || 0) <= 0) {
      clearHistoryState();
      return;
    }

    state.currentConversationId = conversationId;
    state.history = payload;
    state.visibleOlderCount = Math.max(INITIAL_OLDER_TURN_COUNT, state.visibleOlderCount);
    state.panelOpen = true;
    updateSurface();
  };

  const syncCurrentRoute = () => {
    const conversationId = getConversationIdFromPath();
    if (!conversationId) {
      if (state.currentConversationId) {
        state.currentConversationId = '';
        clearHistoryState();
      }
      return;
    }

    if (state.currentConversationId && state.currentConversationId !== conversationId) {
      state.currentConversationId = conversationId;
      clearHistoryState();
    } else if (!state.currentConversationId) {
      state.currentConversationId = conversationId;
    }

    if (!state.history || state.history.conversationId !== conversationId) {
      const stored = readStoredHistoryPayload();
      if (stored?.conversationId === conversationId) {
        applyHistoryPayload(stored);
      } else {
        removeRoot();
      }
    } else {
      updateSurface();
    }
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== HISTORY_MESSAGE_SOURCE) return;
    applyHistoryPayload(event.data.payload);
  });

  window.addEventListener(
    'scroll',
    () => {
      scheduleAutoLoadCheck();
    },
    { passive: true },
  );

  state.routeTimer = window.setInterval(syncCurrentRoute, ROUTE_CHECK_MS);
  syncCurrentRoute();
})();

// =============================================================
// Lazy Load Fast Mode native manual expansion proof
// =============================================================
(() => {
  const LAZY_FAST_MODE_SETTING_KEY = 'lazyFastModeEnabled';
  const LAZY_FAST_MODE_FORCE_INERT = false;
  const LAZY_FAST_MODE_FULL_DISABLE = true;

  const forceStoredLazyFastModeOff = () => {
    try {
      chrome.storage.sync.get({ [LAZY_FAST_MODE_SETTING_KEY]: false }, (items) => {
        if (chrome.runtime?.lastError) return;
        if (items?.[LAZY_FAST_MODE_SETTING_KEY] !== true) return;
        chrome.storage.sync.set({ [LAZY_FAST_MODE_SETTING_KEY]: false });
      });
    } catch {}
  };

  if (LAZY_FAST_MODE_FULL_DISABLE) {
    globalThis.__CSP_ENABLE_LAZY_FAST_MODE = false;
    forceStoredLazyFastModeOff();
    return;
  }

  if (LAZY_FAST_MODE_FORCE_INERT) {
    globalThis.__CSP_ENABLE_LAZY_FAST_MODE = false;
    return;
  }

  const initLazyFastModeNative = () => {
    if (window.__cspLazyFastModeNativeInstalled) return;
    window.__cspLazyFastModeNativeInstalled = true;

  const ROUTE_RE = /^\/c\/([^/?#]+)/;
  const HISTORY_DATA_NODE_ID = 'csp-lazy-fast-history-data';
  const HISTORY_MESSAGE_SOURCE = 'csp-lazy-fast-history';
  const EXPAND_REQUEST_SOURCE = 'csp-lazy-fast-expand-request';
  const EXPAND_RESULT_SOURCE = 'csp-lazy-fast-expand-result';
  const AUTO_EXPAND_INTENT_SOURCE = 'csp-lazy-fast-auto-expand-intent';
  const RETAINED_COUNT_KEY_PREFIX = 'csp_lazy_fast_retained_turn_count:';
  const ANCHOR_KEY_PREFIX = 'csp_lazy_fast_restore_anchor:';
  const CONSUMED_ANCHOR_KEY_PREFIX = 'csp_lazy_fast_consumed_anchor:';
  const DEBUG_KEY_PREFIX = 'csp_lazy_fast_debug:';
  const DEBUG_WINDOW_KEY = '__cspLazyFastNativeDebug';
  const DEFAULT_RETAINED_TURN_COUNT = 24;
  const LOAD_MORE_BATCH_SIZE = 40;
  const ROUTE_CHECK_MS = 700;
  const RESTORE_MAX_AGE_MS = 2 * 60 * 1000;
  const RELOAD_COOLDOWN_MS = 1500;
  const ANCHOR_TWEEN_MIN_DURATION_S = 0.14;
  const ANCHOR_TWEEN_MAX_DURATION_S = 0.3;
  const ANCHOR_TWEEN_MAX_DISTANCE_PX = 2200;
  const ANCHOR_TWEEN_MIN_DISTANCE_PX = 18;
  const IN_PLACE_REVEAL_MAX_ATTEMPTS = 16;
  const POST_REVEAL_DISTANCE_LOCK_MS = 1600;
  const EXPANSION_FLIP_MAX_TARGETS = 12;
  const EXPANSION_FLIP_MARGIN_PX = 140;
  const EXPANSION_FLIP_MAX_AGE_MS = 4000;
  const MAX_DEBUG_EVENTS = 12;
  const ROOT_ID = 'csp-lazy-fast-native-banner';
  const STYLE_ID = 'csp-lazy-fast-native-banner-style';
  const NATIVE_TURN_SELECTOR =
    'section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"], article[data-turn]';

  const state = {
    currentConversationId: '',
    history: null,
    routeTimer: 0,
    root: null,
    summary: null,
    summaryText: null,
    summarySpinner: null,
    loadMoreButton: null,
    fullButton: null,
    reloadScheduled: false,
    lastReloadAt: 0,
    restoredConversationId: '',
    cooldownTimer: 0,
    anchorRestoreTween: null,
    anchorRestoreConversationId: '',
    anchorRestoreTurnId: '',
    anchorRestoreTargetScrollTop: NaN,
    anchorRestoreScrollRoot: null,
    anchorRestorePrevOverflowAnchor: '',
    anchorRestorePrevScrollBehavior: '',
    pendingExpansionFlip: null,
    inPlaceBusy: null,
    inPlaceBusyDistanceLockRaf: 0,
    postRevealDistanceLock: null,
    postRevealDistanceLockRaf: 0,
  };

  const getConversationIdFromPath = (pathname = location.pathname || '') =>
    pathname.match(ROUTE_RE)?.[1] || '';

  const getRetainedCountKey = (conversationId) =>
    `${RETAINED_COUNT_KEY_PREFIX}${String(conversationId || '')}`;

  const getAnchorKey = (conversationId) =>
    `${ANCHOR_KEY_PREFIX}${String(conversationId || '')}`;

  const getConsumedAnchorKey = (conversationId) =>
    `${CONSUMED_ANCHOR_KEY_PREFIX}${String(conversationId || '')}`;

  const getDebugKey = (conversationId) =>
    `${DEBUG_KEY_PREFIX}${String(conversationId || '')}`;

  const normalizeRetainedTurnCount = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return DEFAULT_RETAINED_TURN_COUNT;
    return Math.max(DEFAULT_RETAINED_TURN_COUNT, Math.floor(parsed));
  };

  const syncDebugWindow = (snapshot) => {
    try {
      window[DEBUG_WINDOW_KEY] = snapshot || null;
    } catch { }
  };

  const readDebugSnapshot = (conversationId) => {
    if (!conversationId) return null;
    try {
      const raw = sessionStorage.getItem(getDebugKey(conversationId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  };

  const writeDebugSnapshot = (conversationId, snapshot) => {
    if (!conversationId) return;
    try {
      sessionStorage.setItem(getDebugKey(conversationId), JSON.stringify(snapshot));
    } catch { }
    syncDebugWindow(snapshot);
  };

  const syncDebugSnapshot = (conversationId) => {
    syncDebugWindow(readDebugSnapshot(conversationId));
  };

  const recordDebugEvent = (conversationId, details = {}) => {
    if (!conversationId) return;

    const previous = readDebugSnapshot(conversationId) || {
      conversationId,
      events: [],
    };
    const event = {
      action: String(details.action || '').trim(),
      source: String(details.source || '').trim(),
      requestedRetainedTurnCount: Number.isFinite(Number(details.requestedRetainedTurnCount))
        ? normalizeRetainedTurnCount(details.requestedRetainedTurnCount)
        : null,
      anchorTurnId:
        typeof details.anchorTurnId === 'string' && details.anchorTurnId.trim()
          ? details.anchorTurnId.trim()
          : null,
      anchorOffsetWithinScrollRoot: Number.isFinite(Number(details.anchorOffsetWithinScrollRoot))
        ? Math.round(Number(details.anchorOffsetWithinScrollRoot))
        : null,
      at: Date.now(),
    };

    const events = Array.isArray(previous.events)
      ? [...previous.events, event].slice(-MAX_DEBUG_EVENTS)
      : [event];

    const next = {
      conversationId,
      lastAction: event.action || null,
      lastActionSource: event.source || null,
      requestedRetainedTurnCount: event.requestedRetainedTurnCount,
      lastRequestSource:
        event.action === 'request_native_expansion'
          ? event.source || null
          : previous.lastRequestSource || null,
      lastRequestRetainedTurnCount:
        event.action === 'request_native_expansion'
          ? event.requestedRetainedTurnCount
          : previous.lastRequestRetainedTurnCount ?? null,
      lastRequestAt:
        event.action === 'request_native_expansion'
          ? event.at
          : previous.lastRequestAt ?? null,
      anchorTurnId: event.anchorTurnId,
      anchorOffsetWithinScrollRoot: event.anchorOffsetWithinScrollRoot,
      lastActionAt: event.at,
      events,
    };
    writeDebugSnapshot(conversationId, next);
  };

  const readPendingAnchor = (conversationId) => {
    if (!conversationId) return null;
    try {
      const raw = sessionStorage.getItem(getAnchorKey(conversationId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  };

  const clearPendingAnchor = (conversationId, source = '') => {
    if (!conversationId) return;
    try {
      sessionStorage.removeItem(getAnchorKey(conversationId));
      sessionStorage.removeItem(getConsumedAnchorKey(conversationId));
    } catch { }
    recordDebugEvent(conversationId, {
      action: 'clear_anchor',
      source: source || 'clearPendingAnchor',
    });
  };

  const getScrollRoot = () =>
    typeof getScrollableContainer === 'function'
      ? getScrollableContainer()
      : document.scrollingElement || document.documentElement;

  const getScrollRootMetrics = () => {
    const scrollRoot = getScrollRoot();
    if (!(scrollRoot instanceof Element)) return null;

    const rect = scrollRoot.getBoundingClientRect?.() || {
      top: 0,
      bottom: window.innerHeight,
    };
    const top = Number.isFinite(rect.top) ? rect.top : 0;
    const bottom = Number.isFinite(rect.bottom) ? rect.bottom : window.innerHeight;

    return {
      scrollRoot,
      top,
      bottom,
    };
  };

  const clearCooldownRefreshTimer = () => {
    if (!state.cooldownTimer) return;
    window.clearTimeout(state.cooldownTimer);
    state.cooldownTimer = 0;
  };

  const getInPlaceBusyState = (conversationId = state.currentConversationId) =>
    state.inPlaceBusy?.conversationId === conversationId ? state.inPlaceBusy : null;

  const syncScrollRootDistanceFromBottom = (scrollRoot, distanceFromBottom) => {
    if (!(scrollRoot instanceof HTMLElement)) return;
    const maxScrollTop = Math.max(
      0,
      (Number(scrollRoot.scrollHeight) || 0) - (Number(scrollRoot.clientHeight) || 0),
    );
    const targetScrollTop = Math.max(
      0,
      Math.min(maxScrollTop, maxScrollTop - Math.max(0, Number(distanceFromBottom) || 0)),
    );
    if (Math.abs((Number(scrollRoot.scrollTop) || 0) - targetScrollTop) > 1) {
      scrollRoot.scrollTop = targetScrollTop;
    }
  };

  const clearInPlaceBusyDistanceLock = () => {
    if (state.inPlaceBusyDistanceLockRaf) {
      cancelAnimationFrame(state.inPlaceBusyDistanceLockRaf);
    }
    state.inPlaceBusyDistanceLockRaf = 0;
  };

  const startInPlaceBusyDistanceLock = (conversationId) => {
    clearInPlaceBusyDistanceLock();

    const tick = () => {
      const busyState = getInPlaceBusyState(conversationId);
      if (!busyState || busyState.revealStarted || conversationId !== state.currentConversationId) {
        clearInPlaceBusyDistanceLock();
        return;
      }

      syncScrollRootDistanceFromBottom(getScrollRootMetrics()?.scrollRoot, busyState.distanceFromBottom);
      state.inPlaceBusyDistanceLockRaf = requestAnimationFrame(tick);
    };

    state.inPlaceBusyDistanceLockRaf = requestAnimationFrame(tick);
  };

  const clearInPlaceBusyState = (conversationId = '') => {
    if (conversationId && state.inPlaceBusy?.conversationId !== conversationId) return;
    clearInPlaceBusyDistanceLock();
    state.inPlaceBusy = null;
  };

  const clearPostRevealDistanceLock = () => {
    if (state.postRevealDistanceLockRaf) {
      cancelAnimationFrame(state.postRevealDistanceLockRaf);
    }
    state.postRevealDistanceLockRaf = 0;
    state.postRevealDistanceLock = null;
  };

  const startPostRevealDistanceLock = (conversationId, distanceFromBottom) => {
    clearPostRevealDistanceLock();

    const normalizedDistanceFromBottom = Math.max(0, Number(distanceFromBottom) || 0);
    state.postRevealDistanceLock = {
      conversationId: String(conversationId || ''),
      distanceFromBottom: normalizedDistanceFromBottom,
      startedAt: Date.now(),
    };

    syncScrollRootDistanceFromBottom(
      getScrollRootMetrics()?.scrollRoot,
      normalizedDistanceFromBottom,
    );

    const tick = () => {
      const lockState = state.postRevealDistanceLock;
      if (!lockState || lockState.conversationId !== conversationId) {
        state.postRevealDistanceLockRaf = 0;
        return;
      }
      if (
        conversationId !== state.currentConversationId ||
        Date.now() - Number(lockState.startedAt || 0) >= POST_REVEAL_DISTANCE_LOCK_MS
      ) {
        clearPostRevealDistanceLock();
        return;
      }

      syncScrollRootDistanceFromBottom(
        getScrollRootMetrics()?.scrollRoot,
        lockState.distanceFromBottom,
      );

      state.postRevealDistanceLockRaf = requestAnimationFrame(tick);
    };

    state.postRevealDistanceLockRaf = requestAnimationFrame(tick);
  };

  const startInPlaceBusyState = (conversationId, requestedRetainedTurnCount, source = '') => {
    clearInPlaceBusyDistanceLock();
    clearPostRevealDistanceLock();
    const scrollMetrics = getScrollRootMetrics();
    const scrollRoot = scrollMetrics?.scrollRoot;
    const oldScrollTop = Number(scrollRoot?.scrollTop) || 0;
    const oldScrollHeight = Number(scrollRoot?.scrollHeight) || 0;
    const oldClientHeight = Number(scrollRoot?.clientHeight) || 0;
    const oldMaxScrollTop = Math.max(0, oldScrollHeight - oldClientHeight);
    state.inPlaceBusy = {
      conversationId,
      requestedRetainedTurnCount: normalizeRetainedTurnCount(requestedRetainedTurnCount),
      source: String(source || '').trim(),
      startedAt: Date.now(),
      frozenScrollTop: oldScrollTop,
      oldScrollTop,
      oldScrollHeight,
      oldClientHeight,
      oldMaxScrollTop,
      distanceFromBottom: Math.max(0, oldMaxScrollTop - oldScrollTop),
      revealStarted: false,
    };
    startInPlaceBusyDistanceLock(conversationId);
  };

  const clearAnchorRestoreTween = () => {
    state.anchorRestoreTween?.kill?.();
    state.anchorRestoreTween = null;
    state.anchorRestoreConversationId = '';
    state.anchorRestoreTurnId = '';
    state.anchorRestoreTargetScrollTop = NaN;
  };

  const setAnchorRestoreScrollGuard = (enabled) => {
    const scrollRoot = getScrollRootMetrics()?.scrollRoot || null;
    if (!(scrollRoot instanceof HTMLElement)) return;

    if (enabled) {
      if (state.anchorRestoreScrollRoot !== scrollRoot) {
        if (state.anchorRestoreScrollRoot instanceof HTMLElement) {
          state.anchorRestoreScrollRoot.style.overflowAnchor = state.anchorRestorePrevOverflowAnchor;
          state.anchorRestoreScrollRoot.style.scrollBehavior = state.anchorRestorePrevScrollBehavior;
        }
        state.anchorRestoreScrollRoot = scrollRoot;
        state.anchorRestorePrevOverflowAnchor = scrollRoot.style.overflowAnchor || '';
        state.anchorRestorePrevScrollBehavior = scrollRoot.style.scrollBehavior || '';
      }
      scrollRoot.style.overflowAnchor = 'none';
      scrollRoot.style.scrollBehavior = 'auto';
      return;
    }

    if (!(state.anchorRestoreScrollRoot instanceof HTMLElement)) return;
    state.anchorRestoreScrollRoot.style.overflowAnchor = state.anchorRestorePrevOverflowAnchor;
    state.anchorRestoreScrollRoot.style.scrollBehavior = state.anchorRestorePrevScrollBehavior;
    state.anchorRestoreScrollRoot = null;
    state.anchorRestorePrevOverflowAnchor = '';
    state.anchorRestorePrevScrollBehavior = '';
  };

  const getAnchorTweenDuration = (distance) => {
    const normalizedDistance = Math.max(0, Math.min(ANCHOR_TWEEN_MAX_DISTANCE_PX, Number(distance) || 0));
    const progress = normalizedDistance / ANCHOR_TWEEN_MAX_DISTANCE_PX;
    return ANCHOR_TWEEN_MIN_DURATION_S +
      (ANCHOR_TWEEN_MAX_DURATION_S - ANCHOR_TWEEN_MIN_DURATION_S) * progress;
  };

  const getExpansionCooldownRemainingMs = () =>
    Math.max(0, RELOAD_COOLDOWN_MS - (Date.now() - state.lastReloadAt));

  const isExpansionCoolingDown = () => getExpansionCooldownRemainingMs() > 0;

  const getMessage = (key, substitutions, fallback) => {
    try {
      const value = chrome?.i18n?.getMessage?.(key, substitutions);
      return value || fallback;
    } catch {
      return fallback;
    }
  };

  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        margin: 0 auto 12px;
        width: min(100%, 52rem);
      }
      #${ROOT_ID} .csp-lazy-fast-native-banner-inner {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 10px;
        border: 1px solid rgb(0 0 0 / 0.08);
        border-radius: 16px;
        background: rgb(255 255 255 / 0.82);
        backdrop-filter: blur(10px);
        padding: 10px 12px;
      }
      .dark #${ROOT_ID} .csp-lazy-fast-native-banner-inner {
        border-color: rgb(255 255 255 / 0.08);
        background: rgb(36 36 36 / 0.82);
      }
      #${ROOT_ID} .csp-lazy-fast-native-summary {
        flex: 1 1 260px;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        font: 500 12px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: var(--text-secondary, rgb(90 90 90));
      }
      .dark #${ROOT_ID} .csp-lazy-fast-native-summary {
        color: var(--text-secondary, rgb(185 185 185));
      }
      #${ROOT_ID} .csp-lazy-fast-native-summary-text {
        min-width: 0;
      }
      #${ROOT_ID} .csp-lazy-fast-native-spinner {
        display: none;
        inline-size: 14px;
        block-size: 14px;
        flex: 0 0 auto;
        border-radius: 999px;
        border: 2px solid rgb(0 0 0 / 0.14);
        border-top-color: rgb(0 0 0 / 0.46);
        animation: csp-lazy-fast-native-spin 0.8s linear infinite;
      }
      .dark #${ROOT_ID} .csp-lazy-fast-native-spinner {
        border-color: rgb(255 255 255 / 0.16);
        border-top-color: rgb(255 255 255 / 0.58);
      }
      #${ROOT_ID}[data-busy="true"] .csp-lazy-fast-native-spinner {
        display: inline-block;
      }
      #${ROOT_ID} .csp-lazy-fast-native-button {
        appearance: none;
        border: 1px solid rgb(0 0 0 / 0.08);
        background: transparent;
        color: var(--text-primary, #1f1f1f);
        border-radius: 999px;
        padding: 6px 11px;
        font: 500 12px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        cursor: pointer;
      }
      .dark #${ROOT_ID} .csp-lazy-fast-native-button {
        border-color: rgb(255 255 255 / 0.08);
        color: var(--text-primary, #ececec);
      }
      #${ROOT_ID} .csp-lazy-fast-native-button[disabled] {
        opacity: 0.6;
        cursor: default;
      }
      @keyframes csp-lazy-fast-native-spin {
        to {
          transform: rotate(1turn);
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };

  const readStoredHistoryPayload = () => {
    const node = document.getElementById(HISTORY_DATA_NODE_ID);
    const text = node?.textContent?.trim();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  // biome-ignore lint/correctness/noUnusedFunctionParameters: keep conversationId for helper signature parity
  const getRequestedRetainedTurnCount = (conversationId, history) => {
    const historyCount = normalizeRetainedTurnCount(history?.requestedRetainedTurnCount);
    return historyCount;
  };

  const setRequestedRetainedTurnCount = (conversationId, count, source = '') => {
    const normalizedCount = normalizeRetainedTurnCount(count);
    try {
      sessionStorage.setItem(
        getRetainedCountKey(conversationId),
        String(normalizedCount),
      );
    } catch { }
    recordDebugEvent(conversationId, {
      action: 'set_retained_count',
      source: source || 'setRequestedRetainedTurnCount',
      requestedRetainedTurnCount: normalizedCount,
    });
  };

  const getTotalTurnCount = (history) =>
    Math.max(0, Number(history?.totalTurnCount) || history?.turns?.length || 0);

  const getLoadedTurnCount = (history) => {
    const fromStats = Number(history?.stats?.keptTurns);
    if (Number.isFinite(fromStats) && fromStats >= 0) return fromStats;
    const totalTurnCount = getTotalTurnCount(history);
    return Math.max(0, totalTurnCount - Math.max(0, Number(history?.keptStartIndex) || 0));
  };

  const getRemainingTurnCount = (history) =>
    Math.max(0, getTotalTurnCount(history) - getLoadedTurnCount(history));

  const getNativeTurns = () =>
    Array.from(document.querySelectorAll(NATIVE_TURN_SELECTOR)).filter(
      (node) => node instanceof HTMLElement,
    );

  const clearPendingExpansionFlip = () => {
    state.pendingExpansionFlip = null;
  };

  const completeAnchorRestoreFinalize = (conversationId, source = 'anchor_restored') => {
    clearInPlaceBusyState(conversationId);
    playPendingExpansionFlip(conversationId);
    clearPendingAnchor(conversationId, source);
    updateBanner();
  };

  const finalizeAnchorRestore = (conversationId, source = 'anchor_restored') => {
    const busyState = getInPlaceBusyState(conversationId);
    clearAnchorRestoreTween();
    setAnchorRestoreScrollGuard(false);
    state.lastReloadAt = Date.now();
    state.restoredConversationId = conversationId;
    state.reloadScheduled = false;
    if (busyState?.revealStarted) {
      startPostRevealDistanceLock(conversationId, busyState.distanceFromBottom);
      requestAnimationFrame(() => {
        if (conversationId !== state.currentConversationId) return;
        completeAnchorRestoreFinalize(conversationId, source);
      });
      return;
    }
    completeAnchorRestoreFinalize(conversationId, source);
  };

  const failInPlaceBusyState = (conversationId, source = 'in_place_busy_failed') => {
    clearAnchorRestoreTween();
    setAnchorRestoreScrollGuard(false);
    clearPostRevealDistanceLock();
    clearPendingExpansionFlip();
    clearInPlaceBusyState(conversationId);
    state.reloadScheduled = false;
    clearPendingAnchor(conversationId, source);
    updateBanner();
  };

  const getExpansionFlipTargets = () => {
    const scrollMetrics = getScrollRootMetrics();
    const viewportTop = scrollMetrics?.top ?? 0;
    const viewportBottom = scrollMetrics?.bottom ?? window.innerHeight;

    return getNativeTurns()
      .filter((turn) => {
        const rect = turn.getBoundingClientRect();
        return rect.bottom > viewportTop - EXPANSION_FLIP_MARGIN_PX &&
          rect.top < viewportBottom + EXPANSION_FLIP_MARGIN_PX;
      })
      .slice(0, EXPANSION_FLIP_MAX_TARGETS);
  };

  const getFlipApi = () => {
    try {
      if (typeof Flip !== 'undefined') return Flip;
    } catch { }
    return window.Flip || null;
  };

  const capturePendingExpansionFlip = (conversationId, requestedRetainedTurnCount) => {
    const flipApi = getFlipApi();
    if (!flipApi?.getState || !conversationId) {
      clearPendingExpansionFlip();
      return;
    }

    const targets = getExpansionFlipTargets();
    if (!targets.length) {
      clearPendingExpansionFlip();
      return;
    }

    try {
      state.pendingExpansionFlip = {
        conversationId,
        requestedRetainedTurnCount: normalizeRetainedTurnCount(requestedRetainedTurnCount),
        capturedAt: Date.now(),
        flipState: flipApi.getState(targets),
      };
    } catch {
      clearPendingExpansionFlip();
    }
  };

  const playPendingExpansionFlip = (conversationId) => {
    const pending = state.pendingExpansionFlip;
    clearPendingExpansionFlip();
    if (!pending || pending.conversationId !== conversationId) return;
    if (Date.now() - Number(pending.capturedAt || 0) > EXPANSION_FLIP_MAX_AGE_MS) return;
    const flipApi = getFlipApi();
    if (!flipApi?.from || !pending.flipState) return;

    try {
      flipApi.from(pending.flipState, {
        duration: 0.24,
        ease: 'power2.out',
        absolute: true,
        nested: true,
        prune: true,
        simple: true,
      });
    } catch { }
  };

  const getBestVisibleAnchorTurn = () => {
    const scrollMetrics = getScrollRootMetrics();
    const viewportTop = scrollMetrics?.top ?? 0;
    const viewportBottom = scrollMetrics?.bottom ?? window.innerHeight;
    const nativeTurns = getNativeTurns();
    let firstVisible = null;
    let bestNonNegative = null;
    let bestNonNegativeOffset = Number.POSITIVE_INFINITY;
    let closestToViewportTop = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const turn of nativeTurns) {
      const rect = turn.getBoundingClientRect();
      if (rect.bottom <= viewportTop || rect.top >= viewportBottom) continue;
      if (!firstVisible) firstVisible = turn;

      const offset = rect.top - viewportTop;
      if (offset >= -1 && offset < bestNonNegativeOffset) {
        bestNonNegative = turn;
        bestNonNegativeOffset = offset;
      }

      const distance = Math.abs(offset);
      if (distance < closestDistance) {
        closestToViewportTop = turn;
        closestDistance = distance;
      }
    }
    return closestToViewportTop || bestNonNegative || firstVisible || nativeTurns[0] || null;
  };

  const tweenAnchorRestoreScroll = (conversationId, turnId, scrollRoot, targetScrollTop) => {
    if (!(scrollRoot instanceof HTMLElement) || !window.gsap?.to) return false;

    const normalizedTarget = Math.max(0, Number(targetScrollTop) || 0);
    if (
      state.anchorRestoreTween &&
      state.anchorRestoreConversationId === conversationId &&
      state.anchorRestoreTurnId === turnId &&
      Math.abs((Number(state.anchorRestoreTargetScrollTop) || 0) - normalizedTarget) <= 1
    ) {
      return true;
    }

    clearAnchorRestoreTween();
    state.anchorRestoreConversationId = conversationId;
    state.anchorRestoreTurnId = turnId;
    state.anchorRestoreTargetScrollTop = normalizedTarget;
    state.anchorRestoreTween = window.gsap.to(scrollRoot, {
      scrollTop: normalizedTarget,
      duration: getAnchorTweenDuration(
        Math.abs((Number(scrollRoot.scrollTop) || 0) - normalizedTarget),
      ),
      ease: 'power2.out',
      overwrite: 'auto',
      onComplete: () => {
        state.anchorRestoreTween = null;
        state.anchorRestoreConversationId = '';
        state.anchorRestoreTurnId = '';
        state.anchorRestoreTargetScrollTop = NaN;
        requestAnimationFrame(() => {
          maybeRestoreAnchor(conversationId);
        });
      },
      onInterrupt: () => {
        state.anchorRestoreTween = null;
        state.anchorRestoreConversationId = '';
        state.anchorRestoreTurnId = '';
        state.anchorRestoreTargetScrollTop = NaN;
      },
    });
    return true;
  };

  const storeAnchorForReload = (conversationId, requestedRetainedTurnCount, source = '') => {
    const anchor = getBestVisibleAnchorTurn();
    const scrollMetrics = getScrollRootMetrics();
    if (!(anchor instanceof HTMLElement) || !scrollMetrics) return false;

    const turnId = anchor.getAttribute('data-turn-id') || '';
    if (!turnId) return false;
    const offsetWithinScrollRoot = anchor.getBoundingClientRect().top - scrollMetrics.top;

    try {
      sessionStorage.setItem(
        getAnchorKey(conversationId),
        JSON.stringify({
          turnId,
          offsetWithinScrollRoot,
          requestedRetainedTurnCount: normalizeRetainedTurnCount(requestedRetainedTurnCount),
          createdAt: Date.now(),
        }),
      );
      recordDebugEvent(conversationId, {
        action: 'store_anchor',
        source: source || 'storeAnchorForReload',
        requestedRetainedTurnCount,
        anchorTurnId: turnId,
        anchorOffsetWithinScrollRoot: offsetWithinScrollRoot,
      });
      return true;
    } catch {
      return false;
    }
  };

  const removeBanner = () => {
    clearCooldownRefreshTimer();
    state.root?.remove();
    state.root = null;
    state.summary = null;
    state.summaryText = null;
    state.summarySpinner = null;
    state.loadMoreButton = null;
    state.fullButton = null;
  };

  const maybeRestoreAnchor = (conversationId) => {
    if (!conversationId || state.restoredConversationId === conversationId) return;

    const payload = readPendingAnchor(conversationId);
    if (!payload?.turnId) {
      clearAnchorRestoreTween();
      setAnchorRestoreScrollGuard(false);
      clearPostRevealDistanceLock();
      clearPendingExpansionFlip();
      return;
    }
    if (Date.now() - Number(payload.createdAt || 0) > RESTORE_MAX_AGE_MS) {
      clearAnchorRestoreTween();
      setAnchorRestoreScrollGuard(false);
      clearPostRevealDistanceLock();
      clearPendingExpansionFlip();
      clearPendingAnchor(conversationId, 'anchor_expired');
      return;
    }

    const pendingRetainedTurnCount = normalizeRetainedTurnCount(payload.requestedRetainedTurnCount);
    const currentRetainedTurnCount = Number(state.history?.requestedRetainedTurnCount);
    if (!Number.isFinite(currentRetainedTurnCount)) return;
    if (normalizeRetainedTurnCount(currentRetainedTurnCount) < pendingRetainedTurnCount) {
      if (!getInPlaceBusyState(conversationId)) {
        clearPendingAnchor(conversationId, 'stale_anchor_after_reset');
      }
      return;
    }

    const anchor = document.querySelector(
      `${NATIVE_TURN_SELECTOR}[data-turn-id="${CSS.escape(payload.turnId)}"]`,
    );
    if (!(anchor instanceof HTMLElement)) return;

    const scrollMetrics = getScrollRootMetrics();
    if (!scrollMetrics) return;

    const desiredOffset = Number(payload.offsetWithinScrollRoot);
    if (!Number.isFinite(desiredOffset)) return;

    setAnchorRestoreScrollGuard(true);
    const currentOffset = anchor.getBoundingClientRect().top - scrollMetrics.top;
    const delta = currentOffset - desiredOffset;
    if (Math.abs(delta) > 1) {
      const targetScrollTop = Math.max(0, (Number(scrollMetrics.scrollRoot.scrollTop) || 0) + delta);
      if (
        Math.abs(delta) > ANCHOR_TWEEN_MIN_DISTANCE_PX &&
        tweenAnchorRestoreScroll(conversationId, payload.turnId, scrollMetrics.scrollRoot, targetScrollTop)
      ) {
        return;
      }
      clearAnchorRestoreTween();
      scrollMetrics.scrollRoot.scrollTop = targetScrollTop;
      return;
    }

    finalizeAnchorRestore(conversationId, 'anchor_restored');
  };

  const settleInPlaceExpansionAtAnchor = (conversationId, attempt = 0) => {
    const busyState = getInPlaceBusyState(conversationId);
    if (!busyState) return;

    const payload = readPendingAnchor(conversationId);
    if (!payload?.turnId) {
      failInPlaceBusyState(conversationId, 'in_place_anchor_missing');
      return;
    }
    if (Date.now() - Number(payload.createdAt || 0) > RESTORE_MAX_AGE_MS) {
      failInPlaceBusyState(conversationId, 'in_place_anchor_expired');
      return;
    }

    const pendingRetainedTurnCount = normalizeRetainedTurnCount(payload.requestedRetainedTurnCount);
    const currentRetainedTurnCount = Number(state.history?.requestedRetainedTurnCount);
    if (
      !Number.isFinite(currentRetainedTurnCount) ||
      normalizeRetainedTurnCount(currentRetainedTurnCount) < pendingRetainedTurnCount
    ) {
      if (attempt >= IN_PLACE_REVEAL_MAX_ATTEMPTS) {
        failInPlaceBusyState(conversationId, 'in_place_history_not_ready');
        return;
      }
      requestAnimationFrame(() => {
        settleInPlaceExpansionAtAnchor(conversationId, attempt + 1);
      });
      return;
    }

    const scrollMetrics = getScrollRootMetrics();
    const scrollRoot = scrollMetrics?.scrollRoot;
    const newScrollHeight = Number(scrollRoot?.scrollHeight) || 0;
    const newClientHeight = Number(scrollRoot?.clientHeight) || 0;
    const newMaxScrollTop = Math.max(0, newScrollHeight - newClientHeight);
    const heightDelta = newScrollHeight - Number(busyState.oldScrollHeight || 0);
    const hasMeaningfulHeightDelta =
      Number.isFinite(heightDelta) &&
      Number.isFinite(newScrollHeight) &&
      newScrollHeight > 0 &&
      heightDelta > 0;

    if (!(scrollRoot instanceof HTMLElement) || !hasMeaningfulHeightDelta) {
      const anchor = document.querySelector(
        `${NATIVE_TURN_SELECTOR}[data-turn-id="${CSS.escape(payload.turnId)}"]`,
      );
      const desiredOffset = Number(payload.offsetWithinScrollRoot);
      if (!(anchor instanceof HTMLElement) || !scrollMetrics || !Number.isFinite(desiredOffset)) {
        if (attempt >= IN_PLACE_REVEAL_MAX_ATTEMPTS) {
          failInPlaceBusyState(conversationId, 'in_place_anchor_not_ready');
          return;
        }
        requestAnimationFrame(() => {
          settleInPlaceExpansionAtAnchor(conversationId, attempt + 1);
        });
        return;
      }

      busyState.revealStarted = true;
      const currentOffset = anchor.getBoundingClientRect().top - scrollMetrics.top;
      const delta = currentOffset - desiredOffset;
      if (Math.abs(delta) <= 1) {
        finalizeAnchorRestore(conversationId, 'in_place_anchor_restored');
        return;
      }

      const targetScrollTop = Math.max(0, (Number(scrollRoot.scrollTop) || 0) + delta);
      if (
        Math.abs(delta) > ANCHOR_TWEEN_MIN_DISTANCE_PX &&
        tweenAnchorRestoreScroll(conversationId, payload.turnId, scrollRoot, targetScrollTop)
      ) {
        return;
      }

      clearAnchorRestoreTween();
      scrollRoot.scrollTop = targetScrollTop;
      finalizeAnchorRestore(conversationId, 'in_place_anchor_restored');
      return;
    }

    busyState.revealStarted = true;
    const targetScrollTop = Math.max(
      0,
      Math.min(
        newMaxScrollTop,
        newMaxScrollTop - Math.max(0, Number(busyState.distanceFromBottom) || 0),
      ),
    );
    scrollRoot.scrollTop = targetScrollTop;

    if (Math.abs((Number(scrollRoot.scrollTop) || 0) - targetScrollTop) > 1 && attempt < IN_PLACE_REVEAL_MAX_ATTEMPTS) {
      requestAnimationFrame(() => {
        settleInPlaceExpansionAtAnchor(conversationId, attempt + 1);
      });
      return;
    }

    requestAnimationFrame(() => {
      finalizeAnchorRestore(conversationId, 'in_place_height_delta_restored');
    });
  };

  const requestNativeExpansionByReload = (
    conversationId,
    nextRetainedTurnCount,
    mode = 'older',
    source = '',
  ) => {
    if (!storeAnchorForReload(conversationId, nextRetainedTurnCount, source || `requestNativeExpansion:${mode}`)) {
      return false;
    }

    state.restoredConversationId = '';
    setRequestedRetainedTurnCount(
      conversationId,
      nextRetainedTurnCount,
      source || `requestNativeExpansion:${mode}`,
    );
    state.reloadScheduled = true;
    state.lastReloadAt = Date.now();
    updateBanner();
    location.reload();
    return true;
  };

  const requestNativeExpansion = (mode = 'older', source = '') => {
    const conversationId = state.currentConversationId;
    const history = state.history;
    if (!conversationId || !history) return;
    if ((history.keptStartIndex || 0) <= 0) return;
    if (state.reloadScheduled) return;
    if (Date.now() - state.lastReloadAt < RELOAD_COOLDOWN_MS) return;

    const totalTurnCount = getTotalTurnCount(history);
    const currentRetainedTurnCount = getRequestedRetainedTurnCount(conversationId, history);
    const nextRetainedTurnCount =
      mode === 'full'
        ? totalTurnCount
        : Math.min(totalTurnCount, currentRetainedTurnCount + LOAD_MORE_BATCH_SIZE);
    if (!totalTurnCount || nextRetainedTurnCount <= currentRetainedTurnCount) return;
    recordDebugEvent(conversationId, {
      action: 'request_native_expansion',
      source: source || `requestNativeExpansion:${mode}`,
      requestedRetainedTurnCount: nextRetainedTurnCount,
    });
    if (mode !== 'older') {
      requestNativeExpansionByReload(conversationId, nextRetainedTurnCount, mode, source);
      return;
    }

    capturePendingExpansionFlip(conversationId, nextRetainedTurnCount);
    if (!storeAnchorForReload(conversationId, nextRetainedTurnCount, source || `requestNativeExpansion:${mode}`)) return;
    startInPlaceBusyState(conversationId, nextRetainedTurnCount, source || `requestNativeExpansion:${mode}`);
    setAnchorRestoreScrollGuard(true);

    state.restoredConversationId = '';
    setRequestedRetainedTurnCount(
      conversationId,
      nextRetainedTurnCount,
      source || `requestNativeExpansion:${mode}`,
    );
    state.reloadScheduled = true;
    state.lastReloadAt = Date.now();
    updateBanner();
    window.postMessage(
      {
        source: EXPAND_REQUEST_SOURCE,
        conversationId,
        requestedRetainedTurnCount: nextRetainedTurnCount,
      },
      location.origin,
    );
  };

  const ensureBanner = () => {
    if (state.root) return;

    const root = document.createElement('section');
    root.id = ROOT_ID;

    const inner = document.createElement('div');
    inner.className = 'csp-lazy-fast-native-banner-inner';

    const summary = document.createElement('div');
    summary.className = 'csp-lazy-fast-native-summary';

    const summarySpinner = document.createElement('span');
    summarySpinner.className = 'csp-lazy-fast-native-spinner';
    summarySpinner.setAttribute('aria-hidden', 'true');

    const summaryText = document.createElement('span');
    summaryText.className = 'csp-lazy-fast-native-summary-text';

    const loadMoreButton = document.createElement('button');
    loadMoreButton.type = 'button';
    loadMoreButton.className = 'csp-lazy-fast-native-button';
    loadMoreButton.addEventListener('click', () => {
      recordDebugEvent(state.currentConversationId, {
        action: 'button_click',
        source: 'load_older_button',
        requestedRetainedTurnCount: getRequestedRetainedTurnCount(
          state.currentConversationId,
          state.history,
        ),
      });
      requestNativeExpansion('older', 'load_older_button');
    });

    const fullButton = document.createElement('button');
    fullButton.type = 'button';
    fullButton.className = 'csp-lazy-fast-native-button';
    fullButton.addEventListener('click', () => {
      recordDebugEvent(state.currentConversationId, {
        action: 'button_click',
        source: 'load_full_button',
        requestedRetainedTurnCount: getRequestedRetainedTurnCount(
          state.currentConversationId,
          state.history,
        ),
      });
      requestNativeExpansion('full', 'load_full_button');
    });

    summary.appendChild(summarySpinner);
    summary.appendChild(summaryText);
    inner.appendChild(summary);
    inner.appendChild(loadMoreButton);
    inner.appendChild(fullButton);
    root.appendChild(inner);

    state.root = root;
    state.summary = summary;
    state.summaryText = summaryText;
    state.summarySpinner = summarySpinner;
    state.loadMoreButton = loadMoreButton;
    state.fullButton = fullButton;
  };

  const refreshBannerPlacement = () => {
    const history = state.history;
    if (!history || !state.currentConversationId) {
      removeBanner();
      return;
    }

    const firstNativeTurn = document.querySelector(NATIVE_TURN_SELECTOR);
    const anchorParent = firstNativeTurn?.parentElement;
    if (!anchorParent || !firstNativeTurn) return;

    ensureStyle();
    ensureBanner();

    if (state.root.parentElement !== anchorParent || state.root.nextElementSibling !== firstNativeTurn) {
      anchorParent.insertBefore(state.root, firstNativeTurn);
    }
  };

  const updateBanner = () => {
    const history = state.history;
    if (!history) {
      removeBanner();
      return;
    }

    refreshBannerPlacement();
    if (!state.root) return;

    const totalTurnCount = getTotalTurnCount(history);
    const loadedTurnCount = getLoadedTurnCount(history);
    const remainingTurnCount = getRemainingTurnCount(history);
    const busyState = getInPlaceBusyState();

    const loadedLabel = loadedTurnCount.toLocaleString();
    const totalLabel = totalTurnCount.toLocaleString();

    state.root.dataset.busy = busyState ? 'true' : 'false';
    state.summaryText.textContent = busyState
      ? getMessage(
          'lazy_fast_loading_older_native',
          undefined,
          'Loading older turns...',
        )
      : remainingTurnCount > 0
        ? getMessage(
            'lazy_fast_native_summary',
            [loadedLabel, totalLabel],
            `Fast Mode loaded latest ${loadedLabel} of ${totalLabel} turns.`,
          )
        : getMessage(
            'lazy_fast_native_summary_full',
            totalLabel,
            `Fast Mode loaded all ${totalLabel} turns natively.`,
          );

    const batchCount = Math.min(LOAD_MORE_BATCH_SIZE, remainingTurnCount).toLocaleString();
    state.loadMoreButton.textContent = getMessage(
      'lazy_fast_load_older_native',
      batchCount,
      `Load ${batchCount} older natively`,
    );
    state.fullButton.textContent = getMessage(
      'lazy_fast_load_full',
      undefined,
      'Load full conversation natively',
    );

    const hideButtons = remainingTurnCount <= 0;
    const disableForCooldown = isExpansionCoolingDown();
    state.loadMoreButton.hidden = hideButtons;
    state.fullButton.hidden = hideButtons;
    state.loadMoreButton.disabled = !!state.reloadScheduled || disableForCooldown || !!busyState;
    state.fullButton.disabled = !!state.reloadScheduled || disableForCooldown || !!busyState;

    clearCooldownRefreshTimer();
    if (!hideButtons && disableForCooldown) {
      state.cooldownTimer = window.setTimeout(() => {
        state.cooldownTimer = 0;
        updateBanner();
      }, Math.max(40, getExpansionCooldownRemainingMs() + 25));
    }
  };

  const applyHistoryPayload = (payload, source = '') => {
    const conversationId = getConversationIdFromPath();
    if (!conversationId || payload?.conversationId !== conversationId) return;
    state.currentConversationId = conversationId;
    state.history = payload;
    recordDebugEvent(conversationId, {
      action: 'apply_history_payload',
      source: source || 'applyHistoryPayload',
      requestedRetainedTurnCount: payload?.requestedRetainedTurnCount,
    });
    const busyState = getInPlaceBusyState(conversationId);
    if (busyState && !busyState.revealStarted) {
      syncScrollRootDistanceFromBottom(
        getScrollRootMetrics()?.scrollRoot,
        busyState.distanceFromBottom,
      );
      requestAnimationFrame(updateBanner);
      return;
    }
    maybeRestoreAnchor(conversationId);
    requestAnimationFrame(updateBanner);
  };

  const syncCurrentRoute = () => {
    const conversationId = getConversationIdFromPath();
    if (!conversationId) {
      clearAnchorRestoreTween();
      setAnchorRestoreScrollGuard(false);
      clearPostRevealDistanceLock();
      clearPendingExpansionFlip();
      clearInPlaceBusyState();
      state.currentConversationId = '';
      state.history = null;
      state.reloadScheduled = false;
      state.restoredConversationId = '';
      syncDebugWindow(null);
      removeBanner();
      return;
    }

    if (state.currentConversationId !== conversationId) {
      clearAnchorRestoreTween();
      setAnchorRestoreScrollGuard(false);
      clearPostRevealDistanceLock();
      clearPendingExpansionFlip();
      clearInPlaceBusyState();
      state.currentConversationId = conversationId;
      state.history = null;
      state.reloadScheduled = false;
      state.restoredConversationId = '';
      removeBanner();
    }
    syncDebugSnapshot(conversationId);

    const stored = readStoredHistoryPayload();
    if (stored?.conversationId === conversationId) {
      applyHistoryPayload(stored, 'stored_history_payload');
      return;
    }

    if (getInPlaceBusyState(conversationId)) {
      requestAnimationFrame(updateBanner);
      return;
    }
    maybeRestoreAnchor(conversationId);
    if (state.history?.conversationId === conversationId) {
      requestAnimationFrame(updateBanner);
    }
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== HISTORY_MESSAGE_SOURCE) return;
    applyHistoryPayload(event.data.payload, 'history_message');
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== EXPAND_RESULT_SOURCE) return;

    const payload = event.data?.payload;
    if (!payload || payload.conversationId !== state.currentConversationId) return;

    if (payload.ok) {
      if (getInPlaceBusyState(payload.conversationId)) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            settleInPlaceExpansionAtAnchor(payload.conversationId);
          });
        });
        return;
      }
      requestAnimationFrame(() => {
        maybeRestoreAnchor(payload.conversationId);
      });
      return;
    }

    state.reloadScheduled = false;
    clearAnchorRestoreTween();
    setAnchorRestoreScrollGuard(false);
    clearPostRevealDistanceLock();
    clearPendingExpansionFlip();
    clearInPlaceBusyState(payload.conversationId);
    clearPendingAnchor(payload.conversationId, 'expand_failed');
    setRequestedRetainedTurnCount(
      payload.conversationId,
      state.history?.requestedRetainedTurnCount,
      'expand_failed_reset',
    );
    updateBanner();
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== AUTO_EXPAND_INTENT_SOURCE) return;

    const payload = event.data?.payload;
    if (!payload || payload.conversationId !== state.currentConversationId) return;

    const source =
      typeof payload.source === 'string' && payload.source.trim()
        ? payload.source.trim()
        : 'auto_expand_intent';
    requestNativeExpansion('older', source);
  });

  state.routeTimer = window.setInterval(syncCurrentRoute, ROUTE_CHECK_MS);
  syncCurrentRoute();

  };

  const maybeInitLazyFastModeNative = (enabled) => {
    if (!enabled) {
      globalThis.__CSP_ENABLE_LAZY_FAST_MODE = false;
      return;
    }
    globalThis.__CSP_ENABLE_LAZY_FAST_MODE = true;
    initLazyFastModeNative();
  };

  if (globalThis.__CSP_ENABLE_LAZY_FAST_MODE === true) {
    maybeInitLazyFastModeNative(true);
    return;
  }

  try {
    chrome.storage.sync.get({ [LAZY_FAST_MODE_SETTING_KEY]: false }, (items) => {
      if (chrome.runtime?.lastError) {
        globalThis.__CSP_ENABLE_LAZY_FAST_MODE = false;
        return;
      }
      maybeInitLazyFastModeNative(Boolean(items?.[LAZY_FAST_MODE_SETTING_KEY]));
    });
  } catch {
    globalThis.__CSP_ENABLE_LAZY_FAST_MODE = false;
  }
})();

// =============================================================
// Fast conversation text preview overlay (always on for /c/*)
// =============================================================
(() => {
  const ENABLE_FAST_PREVIEW_OVERLAY = false;
  if (!ENABLE_FAST_PREVIEW_OVERLAY) return;

  const ROUTE_RE = /^\/c\/([^/?#]+)/;
  const ROOT_ID = 'csp-fast-preview-root';
  const STYLE_ID = 'csp-fast-preview-style';
  const BRIDGE_SCRIPT_ID = 'csp-fast-preview-bridge';
  const BRIDGE_DATA_SOURCE = 'csp-fast-preview-bridge-data';
  const BRIDGE_REQUEST_SOURCE = 'csp-fast-preview-bridge-request';
  const ROUTE_CHECK_MS = 700;
  const PREVIEW_REQUEST_DELAYS_MS = Object.freeze([350, 1400, 3600]);
  const LARGE_CONVERSATION_TURN_THRESHOLD = 10;
  const READY_STABLE_MS = 1200;
  const NATIVE_TURN_SELECTOR =
    'section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"], article[data-turn]';

  const state = {
    currentConversationId: '',
    readyConversationId: '',
    preview: null,
    root: null,
    panel: null,
    title: null,
    list: null,
    indicator: null,
    routeTimer: 0,
    requestTimers: [],
    nativeObserver: null,
    pulseTween: null,
    readyTimer: 0,
    panelShown: false,
    isFading: false,
  };

  function fastPreviewPageBridge() {
    const CONVERSATION_PATH_RE = /^\/backend-api\/conversation\/([^/?#]+)$/i;
    const DATA_SOURCE = 'csp-fast-preview-bridge-data';
    const REQUEST_SOURCE = 'csp-fast-preview-bridge-request';

    if (window.__cspFastPreviewBridgeInstalled) return;
    window.__cspFastPreviewBridgeInstalled = true;

    let authHeaders = null;

    const captureAuthHeaders = (input, init) => {
      let headers;
      try {
        headers = new Headers();
        if (input && typeof input === 'object' && input.headers) {
          new Headers(input.headers).forEach((value, key) => {
            headers.set(key, value);
          });
        }
        if (init?.headers) {
          new Headers(init.headers).forEach((value, key) => {
            headers.set(key, value);
          });
        }
      } catch {
        return;
      }

      if (!headers.get('authorization')) return;

      const next = {};
      headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (
          lower === 'authorization' ||
          lower === 'oai-language' ||
          lower === 'oai-session-id' ||
          lower === 'oai-client-build-number' ||
          lower === 'oai-device-id' ||
          lower === 'oai-client-version' ||
          lower === 'content-type'
        ) {
          next[key] = value;
        }
      });

      if (Object.keys(next).length) authHeaders = next;
    };

    const normalizeText = (value) => {
      if (typeof value !== 'string') return '';
      return value.replace(/\r\n?/g, '\n').trim();
    };

    const extractSegment = (message) => {
      const content = message?.content || {};
      const type = content.content_type || '';

      if (type === 'text') {
        const text = normalizeText(
          Array.isArray(content.parts)
            ? content.parts.filter((part) => typeof part === 'string').join('\n\n')
            : '',
        );
        return text ? { type: 'text', text } : null;
      }

      if (type === 'code') {
        const text = normalizeText(content.text || '');
        return text
          ? {
              type: 'code',
              text,
              language: typeof content.language === 'string' ? content.language.trim() : '',
            }
          : null;
      }

      if (type === 'execution_output') {
        const text = normalizeText(content.text || '');
        return text ? { type: 'output', text } : null;
      }

      return null;
    };

    const buildPreview = (payload) => {
      if (!payload || typeof payload !== 'object' || !payload.mapping || !payload.current_node) {
        return null;
      }

      const mapping = payload.mapping;
      const visited = new Set();
      const nodes = [];
      let nodeId = payload.current_node;

      while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
        visited.add(nodeId);
        nodes.push(mapping[nodeId]);
        nodeId = mapping[nodeId].parent;
      }

      if (!nodes.length) return null;

      nodes.reverse();

      const turns = [];
      let currentTurn = null;

      const appendSegment = (role, segment) => {
        if (!segment?.text) return;

        if (!currentTurn || currentTurn.role !== role) {
          currentTurn = { role, segments: [] };
          turns.push(currentTurn);
        }

        const lastSegment = currentTurn.segments[currentTurn.segments.length - 1];
        if (
          lastSegment &&
          lastSegment.type === segment.type &&
          (lastSegment.language || '') === (segment.language || '')
        ) {
          const separator = segment.type === 'text' ? '\n\n' : '\n';
          lastSegment.text = `${lastSegment.text}${separator}${segment.text}`.trim();
          return;
        }

        currentTurn.segments.push(segment);
      };

      for (const node of nodes) {
        const message = node?.message;
        if (!message || message.metadata?.is_visually_hidden_from_conversation) continue;

        const role = message.author?.role;
        if (role !== 'user' && role !== 'assistant') continue;

        const segment = extractSegment(message);
        if (!segment) continue;

        appendSegment(role, segment);
      }

      if (!turns.length) return null;

      return {
        conversationId: payload.conversation_id || '',
        title: typeof payload.title === 'string' ? payload.title : '',
        turnCount: turns.length,
        turns,
      };
    };

    const publishPreview = (preview) => {
      if (!preview?.conversationId || !Array.isArray(preview.turns) || !preview.turns.length) return;
      window.postMessage({ source: DATA_SOURCE, payload: preview }, location.origin);
    };

    const maybePublishResponse = (url, response) => {
      let pathname = '';
      try {
        pathname = new URL(url, location.origin).pathname || '';
      } catch {
        return;
      }

      const match = pathname.match(CONVERSATION_PATH_RE);
      if (!match || !response?.ok) return;

      response
        .clone()
        .json()
        .then((payload) => {
          const preview = buildPreview(payload);
          if (preview) publishPreview(preview);
        })
        .catch(() => {});
    };

    const refetchConversation = (conversationId) => {
      if (!conversationId || !authHeaders) return;

      const url = `/backend-api/conversation/${conversationId}`;
      const headers = {
        ...authHeaders,
        'X-OpenAI-Target-Path': url,
        'X-OpenAI-Target-Route': url,
      };

      window
        .fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers,
        })
        .then((response) => maybePublishResponse(url, response))
        .catch(() => {});
    };

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function (...args) {
        const [input, init] = args;
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : typeof input?.url === 'string'
                ? input.url
                : '';

        captureAuthHeaders(input, init);

        const result = originalFetch.apply(this, args);
        Promise.resolve(result)
          .then((response) => {
            maybePublishResponse(response?.url || requestUrl, response);
          })
          .catch(() => {});
        return result;
      };
    }

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.source !== REQUEST_SOURCE) return;
      const conversationId =
        typeof event.data?.conversationId === 'string' ? event.data.conversationId.trim() : '';
      if (!conversationId) return;
      refetchConversation(conversationId);
    });
  }

  const getConversationIdFromPath = (pathname = location.pathname || '') =>
    pathname.match(ROUTE_RE)?.[1] || '';

  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        pointer-events: none;
        opacity: 1;
      }
      #${ROOT_ID} .csp-fast-preview-panel {
        position: fixed;
        display: none;
        flex-direction: column;
        gap: 12px;
        padding: 18px 18px 22px;
        border-radius: 24px;
        border: 1px solid rgb(0 0 0 / 0.08);
        background: rgb(255 255 255 / 0.96);
        color: var(--text-primary, #1f1f1f);
        box-shadow: 0 24px 60px rgb(0 0 0 / 0.14);
        overflow: hidden;
        pointer-events: auto;
        backdrop-filter: blur(10px);
      }
      .dark #${ROOT_ID} .csp-fast-preview-panel {
        background: rgb(33 33 33 / 0.94);
        border-color: rgb(255 255 255 / 0.08);
        box-shadow: 0 24px 60px rgb(0 0 0 / 0.34);
        color: var(--text-primary, #ececec);
      }
      #${ROOT_ID} .csp-fast-preview-title {
        font: 600 14px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        letter-spacing: 0.01em;
        opacity: 0.88;
        padding-inline: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${ROOT_ID} .csp-fast-preview-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 0;
        overflow: auto;
        padding-right: 4px;
        overscroll-behavior: contain;
      }
      #${ROOT_ID} .csp-fast-preview-list::-webkit-scrollbar {
        width: 10px;
      }
      #${ROOT_ID} .csp-fast-preview-list::-webkit-scrollbar-thumb {
        background: rgb(127 127 127 / 0.22);
        border-radius: 999px;
      }
      #${ROOT_ID} .csp-fast-preview-turn {
        display: flex;
        width: 100%;
      }
      #${ROOT_ID} .csp-fast-preview-turn--assistant {
        justify-content: flex-start;
      }
      #${ROOT_ID} .csp-fast-preview-turn--user {
        justify-content: flex-end;
      }
      #${ROOT_ID} .csp-fast-preview-bubble {
        max-width: min(100%, 52rem);
        border-radius: 22px;
        padding: 14px 16px;
        border: 1px solid rgb(0 0 0 / 0.05);
        box-shadow: 0 10px 24px rgb(0 0 0 / 0.06);
      }
      #${ROOT_ID} .csp-fast-preview-turn--assistant .csp-fast-preview-bubble {
        background: rgb(255 255 255 / 0.88);
      }
      #${ROOT_ID} .csp-fast-preview-turn--user .csp-fast-preview-bubble {
        background: rgb(15 163 127 / 0.11);
      }
      .dark #${ROOT_ID} .csp-fast-preview-turn--assistant .csp-fast-preview-bubble {
        background: rgb(44 44 44 / 0.9);
        border-color: rgb(255 255 255 / 0.06);
        box-shadow: 0 10px 24px rgb(0 0 0 / 0.16);
      }
      .dark #${ROOT_ID} .csp-fast-preview-turn--user .csp-fast-preview-bubble {
        background: rgb(16 163 127 / 0.18);
        border-color: rgb(255 255 255 / 0.06);
        box-shadow: 0 10px 24px rgb(0 0 0 / 0.16);
      }
      #${ROOT_ID} .csp-fast-preview-segment + .csp-fast-preview-segment {
        margin-top: 12px;
      }
      #${ROOT_ID} .csp-fast-preview-text {
        white-space: pre-wrap;
        word-break: break-word;
        font: 400 14px/1.52 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #${ROOT_ID} .csp-fast-preview-code-label {
        display: inline-flex;
        margin-bottom: 8px;
        padding: 3px 8px;
        border-radius: 999px;
        background: rgb(0 0 0 / 0.06);
        font: 600 11px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }
      .dark #${ROOT_ID} .csp-fast-preview-code-label {
        background: rgb(255 255 255 / 0.08);
      }
      #${ROOT_ID} .csp-fast-preview-code {
        margin: 0;
        padding: 12px 14px;
        border-radius: 16px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        background: rgb(0 0 0 / 0.045);
        font: 400 12px/1.48 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      .dark #${ROOT_ID} .csp-fast-preview-code {
        background: rgb(0 0 0 / 0.26);
      }
      #${ROOT_ID} .csp-fast-preview-indicator {
        position: fixed;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        background: rgb(16 163 127);
        color: #fff;
        box-shadow: 0 10px 24px rgb(0 0 0 / 0.18);
        border: 1px solid rgb(255 255 255 / 0.12);
        font: 600 18px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        user-select: none;
      }
      #${ROOT_ID} .csp-fast-preview-indicator span {
        transform: translateY(-1px);
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };

  const ensureBridge = () => {
    if (document.getElementById(BRIDGE_SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = BRIDGE_SCRIPT_ID;
    script.textContent = `;(${fastPreviewPageBridge.toString()})();`;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  };

  const getMainRect = () => {
    const main = document.querySelector('main#main') || document.querySelector('main');
    return main?.getBoundingClientRect?.() || null;
  };

  const getComposerRect = () => {
    const composer =
      document.querySelector('#thread-bottom-container form[data-type="unified-composer"]') ||
      document.querySelector('form[data-type="unified-composer"]') ||
      document.getElementById('thread-bottom-container') ||
      document.getElementById('composer-background');
    return composer?.getBoundingClientRect?.() || null;
  };

  const getSendButton = () =>
    document.querySelector('#composer-submit-button') ||
    document.querySelector('button[data-testid="send-button"]') ||
    document.querySelector('button[aria-label="Send prompt"]');

  const isTransparentColor = (value) =>
    !value ||
    value === 'transparent' ||
    /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0(?:\.0+)?\s*\)$/i.test(value);

  const clearRequestTimers = () => {
    while (state.requestTimers.length) {
      window.clearTimeout(state.requestTimers.pop());
    }
  };

  const clearReadyTimer = () => {
    if (!state.readyTimer) return;
    window.clearTimeout(state.readyTimer);
    state.readyTimer = 0;
  };

  const stopIndicatorPulse = () => {
    if (state.pulseTween?.kill) state.pulseTween.kill();
    state.pulseTween = null;

    if (!state.indicator) return;
    state.indicator.style.opacity = '1';
    state.indicator.style.transform = 'none';
  };

  const startIndicatorPulse = () => {
    if (!state.indicator || state.pulseTween) return;

    if (window.gsap?.to) {
      state.pulseTween = window.gsap.to(state.indicator, {
        opacity: 0.34,
        scale: 0.95,
        duration: 0.95,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        transformOrigin: '50% 50%',
      });
      return;
    }

    state.indicator.style.transition = 'opacity 0.95s ease-in-out, transform 0.95s ease-in-out';
    let visible = true;
    state.pulseTween = {
      kill() {
        if (this._timer) window.clearInterval(this._timer);
      },
    };
    state.pulseTween._timer = window.setInterval(() => {
      visible = !visible;
      state.indicator.style.opacity = visible ? '1' : '0.34';
      state.indicator.style.transform = visible ? 'scale(1)' : 'scale(0.95)';
    }, 950);
  };

  const ensureRoot = () => {
    ensureStyle();

    if (state.root?.isConnected) return;

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-hidden', 'true');

    const panel = document.createElement('div');
    panel.className = 'csp-fast-preview-panel';

    const title = document.createElement('div');
    title.className = 'csp-fast-preview-title';

    const list = document.createElement('div');
    list.className = 'csp-fast-preview-list';

    const indicator = document.createElement('div');
    indicator.className = 'csp-fast-preview-indicator';
    indicator.innerHTML = '<span>↯</span>';

    panel.appendChild(title);
    panel.appendChild(list);
    root.appendChild(panel);
    root.appendChild(indicator);

    (document.body || document.documentElement).appendChild(root);

    state.root = root;
    state.panel = panel;
    state.title = title;
    state.list = list;
    state.indicator = indicator;
    state.panelShown = false;

    syncOverlayLayout();
    startIndicatorPulse();
  };

  const removeRoot = () => {
    stopIndicatorPulse();

    state.root?.remove();
    state.root = null;
    state.panel = null;
    state.title = null;
    state.list = null;
    state.indicator = null;
    state.panelShown = false;
    state.isFading = false;
  };

  const disconnectNativeObserver = () => {
    state.nativeObserver?.disconnect();
    state.nativeObserver = null;
  };

  const resetConversationUi = () => {
    clearRequestTimers();
    clearReadyTimer();
    disconnectNativeObserver();
    state.preview = null;
    removeRoot();
  };

  const syncIndicatorAppearance = () => {
    if (!state.indicator) return;

    const button = getSendButton();
    const rect = button?.getBoundingClientRect?.();

    if (rect && Number.isFinite(rect.top) && rect.width > 0 && rect.height > 0) {
      const size = Math.max(28, Math.round(Math.max(rect.width, rect.height)));
      const right = Math.max(16, Math.round(window.innerWidth - rect.right));
      const top = Math.max(12, Math.round(rect.top + (rect.height - size) / 2));
      const computed = getComputedStyle(button);
      const background = isTransparentColor(computed.backgroundColor)
        ? 'rgb(16 163 127)'
        : computed.backgroundColor;
      const color = isTransparentColor(computed.color) ? '#fff' : computed.color;

      state.indicator.style.width = `${size}px`;
      state.indicator.style.height = `${size}px`;
      state.indicator.style.top = `${top}px`;
      state.indicator.style.right = `${right}px`;
      state.indicator.style.bottom = 'auto';
      state.indicator.style.borderRadius = computed.borderRadius || '999px';
      state.indicator.style.background = background;
      state.indicator.style.color = color;
      state.indicator.style.borderColor = isTransparentColor(computed.borderColor)
        ? 'rgb(255 255 255 / 0.12)'
        : computed.borderColor;
      state.indicator.style.boxShadow =
        computed.boxShadow && computed.boxShadow !== 'none'
          ? computed.boxShadow
          : '0 10px 24px rgb(0 0 0 / 0.18)';
      return;
    }

    state.indicator.style.width = '34px';
    state.indicator.style.height = '34px';
    state.indicator.style.top = 'auto';
    state.indicator.style.right = '22px';
    state.indicator.style.bottom = '24px';
    state.indicator.style.borderRadius = '999px';
    state.indicator.style.background = 'rgb(16 163 127)';
    state.indicator.style.color = '#fff';
    state.indicator.style.borderColor = 'rgb(255 255 255 / 0.12)';
    state.indicator.style.boxShadow = '0 10px 24px rgb(0 0 0 / 0.18)';
  };

  function syncOverlayLayout() {
    if (!state.root) return;

    syncIndicatorAppearance();

    if (!state.panel || state.panel.style.display === 'none') return;

    const mainRect = getMainRect();
    const composerRect = getComposerRect();
    const viewportPadding = 14;
    const rect = mainRect || {
      top: viewportPadding,
      left: viewportPadding,
      width: window.innerWidth - viewportPadding * 2,
      height: window.innerHeight - viewportPadding * 2,
    };

    const top = Math.max(viewportPadding, Math.round(rect.top) + 6);
    const availableWidth = Math.max(320, Math.round(rect.width) - 32);
    const panelWidth = Math.min(860, availableWidth);
    const left = Math.max(
      viewportPadding,
      Math.round(rect.left + Math.max(16, (rect.width - panelWidth) / 2)),
    );
    const composerGap = composerRect
      ? Math.max(88, Math.round(window.innerHeight - composerRect.top + 14))
      : 96;
    const maxHeight = Math.max(
      220,
      Math.round(window.innerHeight - top - composerGap - viewportPadding),
    );

    state.panel.style.top = `${top}px`;
    state.panel.style.left = `${left}px`;
    state.panel.style.width = `${panelWidth}px`;
    state.panel.style.height = `${maxHeight}px`;
  }

  const createCodeSegmentNode = (segment) => {
    const wrapper = document.createElement('section');
    wrapper.className = 'csp-fast-preview-segment';

    if (segment.language) {
      const label = document.createElement('div');
      label.className = 'csp-fast-preview-code-label';
      label.textContent = segment.language;
      wrapper.appendChild(label);
    }

    const pre = document.createElement('pre');
    pre.className = 'csp-fast-preview-code';

    const code = document.createElement('code');
    code.textContent = segment.text;

    pre.appendChild(code);
    wrapper.appendChild(pre);
    return wrapper;
  };

  const createTextSegmentNode = (segment) => {
    const wrapper = document.createElement('section');
    wrapper.className = 'csp-fast-preview-segment';

    const text = document.createElement('div');
    text.className = 'csp-fast-preview-text';
    text.textContent = segment.text;

    wrapper.appendChild(text);
    return wrapper;
  };

  const renderPreview = (preview) => {
    ensureRoot();
    if (!state.panel || !state.list || !state.title) return;

    state.title.textContent = preview.title || '';
    state.title.style.display = preview.title ? '' : 'none';
    state.list.replaceChildren();

    const fragment = document.createDocumentFragment();
    for (const turn of preview.turns || []) {
      const turnEl = document.createElement('div');
      turnEl.className = `csp-fast-preview-turn csp-fast-preview-turn--${turn.role}`;

      const bubble = document.createElement('div');
      bubble.className = 'csp-fast-preview-bubble';

      for (const segment of turn.segments || []) {
        bubble.appendChild(
          segment.type === 'text' ? createTextSegmentNode(segment) : createCodeSegmentNode(segment),
        );
      }

      turnEl.appendChild(bubble);
      fragment.appendChild(turnEl);
    }

    state.list.appendChild(fragment);
    state.panel.style.display = 'flex';
    syncOverlayLayout();

    if (!state.panelShown) {
      state.panelShown = true;
      if (window.gsap?.fromTo) {
        window.gsap.fromTo(
          state.panel,
          { autoAlpha: 0, y: 10 },
          { autoAlpha: 1, y: 0, duration: 0.22, ease: 'power2.out' },
        );
      } else {
        state.panel.style.opacity = '1';
      }
    }
  };

  const getNativeTurnCount = () => document.querySelectorAll(NATIVE_TURN_SELECTOR).length;

  const isNativeConversationReady = () => {
    const nativeTurnCount = getNativeTurnCount();
    if (!nativeTurnCount) return false;

    const expectedTurnCount = state.preview?.turnCount || 0;
    const scrollContainer =
      typeof getScrollableContainer === 'function' ? getScrollableContainer() : document.scrollingElement;
    const isScrollable = !!(
      scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight + 64
    );

    if (expectedTurnCount > LARGE_CONVERSATION_TURN_THRESHOLD) return isScrollable;
    return isScrollable || nativeTurnCount >= Math.min(3, Math.max(1, expectedTurnCount));
  };

  const fadeOutOverlay = () => {
    if (!state.root || state.isFading) return;

    state.isFading = true;
    clearRequestTimers();
    clearReadyTimer();
    disconnectNativeObserver();
    stopIndicatorPulse();

    const finalize = () => {
      state.readyConversationId = state.currentConversationId;
      removeRoot();
    };

    if (window.gsap?.to) {
      window.gsap.to(state.root, {
        autoAlpha: 0,
        duration: 0.28,
        ease: 'power2.out',
        onComplete: finalize,
      });
      return;
    }

    state.root.style.transition = 'opacity 0.28s ease';
    state.root.style.opacity = '0';
    window.setTimeout(finalize, 300);
  };

  const scheduleReadyCheck = () => {
    if (!state.currentConversationId || state.readyConversationId === state.currentConversationId) {
      return;
    }

    if (!isNativeConversationReady()) {
      clearReadyTimer();
      return;
    }

    clearReadyTimer();
    state.readyTimer = window.setTimeout(() => {
      if (isNativeConversationReady()) fadeOutOverlay();
    }, READY_STABLE_MS);
  };

  const ensureNativeObserver = () => {
    if (state.nativeObserver) return;

    state.nativeObserver = new MutationObserver(() => {
      syncOverlayLayout();
      scheduleReadyCheck();
    });

    state.nativeObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  };

  const requestPreviewFromBridge = (conversationId) => {
    if (!conversationId) return;
    window.postMessage(
      {
        source: BRIDGE_REQUEST_SOURCE,
        conversationId,
      },
      location.origin,
    );
  };

  const schedulePreviewRequests = (conversationId) => {
    clearRequestTimers();

    for (const delay of PREVIEW_REQUEST_DELAYS_MS) {
      const timer = window.setTimeout(() => {
        if (state.currentConversationId !== conversationId || state.preview) return;
        requestPreviewFromBridge(conversationId);
      }, delay);
      state.requestTimers.push(timer);
    }
  };

  const beginConversationRoute = (conversationId) => {
    if (!conversationId) return;
    if (
      state.currentConversationId === conversationId &&
      (state.root?.isConnected || state.readyConversationId === conversationId)
    ) {
      syncOverlayLayout();
      scheduleReadyCheck();
      return;
    }

    resetConversationUi();
    state.currentConversationId = conversationId;
    state.readyConversationId = '';
    state.preview = null;
    state.isFading = false;

    ensureBridge();
    ensureRoot();
    ensureNativeObserver();
    syncOverlayLayout();
    schedulePreviewRequests(conversationId);
    scheduleReadyCheck();
  };

  const handleRouteChange = () => {
    const conversationId = getConversationIdFromPath();
    if (!conversationId) {
      state.currentConversationId = '';
      state.readyConversationId = '';
      resetConversationUi();
      return;
    }

    beginConversationRoute(conversationId);
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== BRIDGE_DATA_SOURCE) return;

    const preview = event.data?.payload;
    if (!preview?.conversationId || preview.conversationId !== state.currentConversationId) return;

    state.preview = preview;
    renderPreview(preview);
    scheduleReadyCheck();
  });

  window.addEventListener('resize', syncOverlayLayout, { passive: true });
  window.addEventListener(
    'scroll',
    () => {
      if (!state.currentConversationId) return;
      syncOverlayLayout();
      scheduleReadyCheck();
    },
    { passive: true },
  );

  state.routeTimer = window.setInterval(handleRouteChange, ROUTE_CHECK_MS);
  handleRouteChange();
})();

function applyVisibilitySettings(data) {
  for (const key in VISIBILITY_DEFAULTS) {
    if (Object.hasOwn(data, key)) {
      window[key] = data[key] === undefined ? VISIBILITY_DEFAULTS[key] : Boolean(data[key]);
      continue;
    }

    // Only apply defaults when a setting has never been initialized.
    if (typeof window[key] === 'undefined') {
      window[key] = VISIBILITY_DEFAULTS[key];
    }
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

const getSchemaShortcutDefaultCode = (key, fallback = '') => {
  const defaults = window.CSP_SETTINGS_SCHEMA?.shortcuts?.defaultCodeByKey;
  const code = defaults?.[key];
  return typeof code === 'string' && code.trim() ? code : fallback;
};

const hasUsableShortcutSetting = (value) => typeof value === 'string';

const coerceNumberFromStorage = (v, fallback) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isNaN(n) ? fallback : n;
  }
  return fallback;
};

// Expose a single, canonical place for these helpers (used elsewhere in the file)
window.ShortcutUtils = {
  ...(window.ShortcutUtils || {}),
  codeEquals,
  getSchemaShortcutDefaultCode,
  normalizeStoredToCode,
};

if (!window.CSP_SETTINGS_SCHEMA) {
  console.warn(
    '[csp] settings-schema.js not detected before content.js; falling back to internal defaults.',
  );
}

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
  const schemaExtra = window.CSP_SETTINGS_SCHEMA?.content?.visibilityExtraKeys;
  const visibilityExtraKeys = Array.isArray(schemaExtra)
    ? schemaExtra
    : [
      'hideArrowButtonsCheckbox',
      'popupBottomBarOpacityValue',
      'fadeSlimSidebarEnabled',
      'popupSlimSidebarOpacityValue',
    ];

  const VISIBILITY_KEYS = [...Object.keys(VISIBILITY_DEFAULTS), ...visibilityExtraKeys];

  // Fetch initial values from Chrome storage
  chrome.storage.sync.get(VISIBILITY_KEYS, (data) => {
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
  });

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
        const isPress = type === 'pointerdown' || type === 'mousedown';
        const isRelease =
          type === 'pointerup' ||
          type === 'mouseup' ||
          type === 'pointerout' ||
          type === 'pointerleave';
        try {
          el.dispatchEvent(
            new Ctor(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              clientX: cx,
              clientY: cy,
              button: 0,
              buttons: isPress ? 1 : isRelease ? 0 : 0,
              view: window,
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
      } catch { }

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
        () => clickMenuItemByPathPrefix(triggerEl, pathPrefix, delays, attempt + 1, fallbackText),
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
        scope.querySelectorAll(
          ':is([aria-haspopup="menu"][id^="radix-"], div[type="button"][aria-haspopup="menu"], div[role="button"][aria-haspopup="menu"], button[aria-haspopup="menu"])',
        ),
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
    const fallbackText = typeof options.fallbackText === 'string' ? options.fallbackText : undefined;
    const tryClickMenuItem = (attempt = 0) => {
      if (!findOpenMenuForTrigger(trigger) && attempt < 1) {
        const retryTrigger = findGptMenuTrigger() || trigger;
        callFlash(retryTrigger);
        smartClick(retryTrigger);
        setTimeout(() => tryClickMenuItem(attempt + 1), delays.MENU_READY_OPEN);
        return;
      }
      clickMenuItemByPathPrefix(trigger, subItemPathPrefix, delays, 0, fallbackText);
    };
    setTimeout(() => {
      tryClickMenuItem(0);
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
  if (typeof window.showLegacyArrowButtonsCheckbox === 'boolean') {
    injectOrToggleArrowButtons();
  } else {
    chrome.storage.sync.get({ showLegacyArrowButtonsCheckbox: false }, (data) => {
      window.showLegacyArrowButtonsCheckbox = !!data.showLegacyArrowButtonsCheckbox;
      injectOrToggleArrowButtons();
    });
  }

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
        const isPress = type === 'pointerdown' || type === 'mousedown';
        const isRelease =
          type === 'pointerup' ||
          type === 'mouseup' ||
          type === 'pointerout' ||
          type === 'pointerleave';
        try {
          el.dispatchEvent(
            new Ctor(type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              clientX: cx,
              clientY: cy,
              button: 0,
              buttons: isPress ? 1 : isRelease ? 0 : 0,
              view: window,
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
    } catch { }
    try {
      el.dispatchEvent(new KeyboardEvent('keyup', opts));
    } catch { }
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
      } catch { }
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
      (btn.id ? `[role="menu"][aria-labelledby="${safeEsc(btn.id)}"][data-state="open"]` : null);

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
      } catch (_) { }
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
        menu.querySelectorAll(
          ':is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"])[data-radix-collection-item]',
        ),
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

  /* ===== End simplified helpers ===== */

  // delayCall: calls a function after a delay with arguments
  function delayCall(fn, ms, ...args) {
    setTimeout(() => fn(...args), ms);
  }

  /* ===== End helpers ===== */

  // ========================================================================
  // ==== BEGIN Click Lowest Using SVG (Copy Lowest, etc) Helpers============
  /* ---------- Copy flow helpers (DOM + action orchestration) ---------- */

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
    if (!isDirectActionVisible(el)) return false;
    try {
      el.click();
      return true;
    } catch {
      return false;
    }
  }

  const SIDEBAR_TOGGLE_SELECTORS = [
    'button[data-testid="close-sidebar-button"]',
    '#stage-sidebar-tiny-bar button[aria-controls="stage-slideover-sidebar"]',
    'button[data-testid="open-sidebar-button"][aria-controls="stage-popover-sidebar"]',
    'button[data-testid="open-sidebar-button"]',
  ];
  const NARROW_SIDEBAR_POPOVER_SELECTORS = [
    'button[data-testid="open-sidebar-button"][aria-controls="stage-popover-sidebar"]',
  ];
  const SEARCH_CONVERSATION_SELECTORS = ['button[data-testid="search-conversation-button"]'];
  const NEW_CHAT_SELECTORS = [
    'a[data-testid="create-new-chat-button"]',
    'button[data-testid="create-new-chat-button"]',
    'button[data-testid="new-chat-button"]',
  ];
  const COMPOSER_INPUT_SELECTORS = [
    'form[data-type="unified-composer"] #prompt-textarea.ProseMirror[contenteditable="true"][role="textbox"]',
    'form[data-type="unified-composer"] textarea[name="prompt-textarea"]',
    '#thread-bottom-container #prompt-textarea.ProseMirror[contenteditable="true"][role="textbox"]',
    '#thread-bottom-container textarea[name="prompt-textarea"]',
  ];
  const SEARCH_SPRITE_FRAGMENT = '#ac6d36';
  const NEW_CHAT_SPRITE_FRAGMENT = '#3a5c87';

  function isDirectActionVisible(el) {
    if (!(el instanceof Element) || !el.isConnected) return false;
    if (el instanceof HTMLElement && el.hidden) return false;
    if (el.getAttribute?.('aria-hidden') === 'true') return false;
    if (el.getAttribute?.('aria-disabled') === 'true') return false;
    if ('disabled' in el && el.disabled) return false;

    let current = el;
    while (current instanceof HTMLElement) {
      if (current.hidden) return false;
      if (current.hasAttribute('inert')) return false;
      if (current.getAttribute('aria-hidden') === 'true') return false;

      const style = window.getComputedStyle(current);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        (current === el && style.pointerEvents === 'none')
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findFirstVisibleElement(selectors) {
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (isDirectActionVisible(el)) return el;
      }
    }
    return null;
  }

  function waitForFirstVisibleElement(selectors, timeoutMs = 800) {
    const existing = findFirstVisibleElement(selectors);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      let observer = null;
      const timeoutId = setTimeout(() => {
        observer?.disconnect();
        resolve(null);
      }, timeoutMs);

      const finish = (el) => {
        clearTimeout(timeoutId);
        observer?.disconnect();
        resolve(el);
      };

      observer = new MutationObserver(() => {
        const el = findFirstVisibleElement(selectors);
        if (el) finish(el);
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-expanded', 'aria-hidden', 'data-state', 'hidden', 'style', 'class'],
      });
    });
  }

  async function openNarrowSidebarPopover() {
    const opener = findFirstVisibleElement(NARROW_SIDEBAR_POPOVER_SELECTORS);
    if (!(opener instanceof HTMLElement)) return false;
    if (opener.getAttribute('aria-expanded') !== 'true' && !safeClick(opener)) return false;
    return true;
  }

  function navigateToNewConversationFallback() {
    if (window.location.pathname === '/') return true;
    window.location.assign('/');
    return true;
  }

  async function triggerNativeNewConversationFromNarrowPopover() {
    if (!(await openNarrowSidebarPopover())) return navigateToNewConversationFallback();

    const direct = await waitForFirstVisibleElement(NEW_CHAT_SELECTORS);
    if (safeClick(direct)) return true;

    const spriteMatch = await waitForFirstVisibleElement([
      `a[data-sidebar-item="true"] use[href*="${NEW_CHAT_SPRITE_FRAGMENT}"]`,
      `button[data-sidebar-item="true"] use[href*="${NEW_CHAT_SPRITE_FRAGMENT}"]`,
    ]);
    const target = spriteMatch?.closest?.(
      '[data-testid="create-new-chat-button"], [data-sidebar-item="true"]',
    );
    if (safeClick(target)) return true;

    return navigateToNewConversationFallback();
  }

  async function triggerNativeSearchConversationFromNarrowPopover() {
    if (!(await openNarrowSidebarPopover())) return false;

    const direct = await waitForFirstVisibleElement(SEARCH_CONVERSATION_SELECTORS);
    if (safeClick(direct)) return true;

    const spriteMatch = await waitForFirstVisibleElement([
      `button[data-sidebar-item="true"] use[href*="${SEARCH_SPRITE_FRAGMENT}"]`,
    ]);
    const target = spriteMatch?.closest?.('button[data-sidebar-item="true"]');
    return safeClick(target);
  }

  function triggerNativeNewConversationButton() {
    const direct = findFirstVisibleElement(NEW_CHAT_SELECTORS);
    if (safeClick(direct)) return true;

    const spriteMatch = Array.from(
      document.querySelectorAll(
        `a[data-sidebar-item="true"] use[href*="${NEW_CHAT_SPRITE_FRAGMENT}"], button[data-sidebar-item="true"] use[href*="${NEW_CHAT_SPRITE_FRAGMENT}"]`,
      ),
    )
      .map((iconUse) => iconUse.closest('[data-testid="create-new-chat-button"], [data-sidebar-item="true"]'))
      .find((el) => isDirectActionVisible(el));

    if (safeClick(spriteMatch)) return true;

    void triggerNativeNewConversationFromNarrowPopover();
    return true;
  }

  function triggerNativeSidebarToggleButton() {
    const direct = findFirstVisibleElement(SIDEBAR_TOGGLE_SELECTORS);
    return safeClick(direct);
  }

  function triggerNativeSearchConversationButton() {
    const direct = Array.from(document.querySelectorAll(SEARCH_CONVERSATION_SELECTORS[0])).find(
      (el) => isDirectActionVisible(el),
    );
    if (safeClick(direct)) return true;

    const spriteMatch = Array.from(
      document.querySelectorAll(
        `button[data-sidebar-item="true"] use[href*="${SEARCH_SPRITE_FRAGMENT}"]`,
      ),
    )
      .map((iconUse) => iconUse.closest('button[data-sidebar-item="true"]'))
      .find((el) => isDirectActionVisible(el));

    if (safeClick(spriteMatch)) return true;

    void triggerNativeSearchConversationFromNarrowPopover();
    return true;
  }

  function triggerDirectComposerActivation() {
    const input = findFirstVisibleElement(COMPOSER_INPUT_SELECTORS);
    if (!(input instanceof HTMLElement)) return false;

    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }

    if (input.isContentEditable) {
      try {
        const selection = window.getSelection?.();
        const range = document.createRange();
        range.selectNodeContents(input);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      } catch {}
    }

    return document.activeElement === input || input.contains(document.activeElement);
  }

  Object.assign(window, {
    triggerNativeNewConversationButton,
    triggerNativeSidebarToggleButton,
    triggerNativeSearchConversationButton,
    triggerDirectComposerActivation,
  });

  // @note Keyboard shortcut defaults
  const shortcutDefaults = {
    shortcutKeyScrollUpOneMessage: 'KeyA',
    shortcutKeyScrollDownOneMessage: 'KeyF',
    shortcutKeyScrollUpTwoMessages: 'ArrowUp',
    shortcutKeyScrollDownTwoMessages: 'ArrowDown',
    shortcutKeyCopyLowest: 'KeyC',
    shortcutKeyEdit: 'KeyE',
    shortcutKeySendEdit: 'KeyD',
    shortcutKeyCopyAllCodeBlocks: 'BracketRight',
    shortcutKeyClickNativeScrollToBottom: 'KeyZ',
    shortcutKeyScrollToTop: 'KeyT',
    shortcutKeyNewConversation: 'KeyN',
    shortcutKeySearchConversationHistory: 'Comma',
    shortcutKeyToggleSidebar: 'KeyS',
    shortcutKeyActivateInput: 'KeyW',
    shortcutKeySearchWeb: 'KeyQ',
    shortcutKeyPreviousThread: 'KeyJ',
    shortcutKeyNextThread: 'Semicolon',
    selectThenCopy: 'KeyX',
    shortcutKeyClickSendButton: 'Enter',
    shortcutKeyClickStopButton: 'Backspace',
    shortcutKeyToggleModelSelector: 'Slash',
    shortcutKeyShowOverlay: getSchemaShortcutDefaultCode('shortcutKeyShowOverlay', 'Period'),
    shortcutKeyRegenerateTryAgain: 'KeyR',
    shortcutKeyRegenerateMoreConcise: '',
    shortcutKeyRegenerateAddDetails: '',
    shortcutKeyRegenerateWithDifferentModel: '',
    shortcutKeyRegenerateAskToChangeResponse: '',
    shortcutKeyMoreDotsReadAloud: '',
    shortcutKeyMoreDotsBranchInNewChat: '',
    altPageUp: 'PageUp',
    altPageDown: 'PageDown',
    shortcutKeyTemporaryChat: 'KeyP',
    shortcutKeyStudy: '',
    shortcutKeyCreateImage: '',
    shortcutKeyToggleCanvas: '',
    shortcutKeyToggleDictate: 'KeyY',
    shortcutKeyCancelDictation: '',
    shortcutKeyShare: '',
    shortcutKeyThinkLonger: '',
    shortcutKeyAddPhotosFiles: '',
    selectThenCopyAllMessages: 'BracketLeft',
    shortcutKeyThinkingExtended: '',
    shortcutKeyThinkingStandard: '',
    shortcutKeyThinkingLight: '',
    shortcutKeyThinkingHeavy: '',
    shortcutKeyNewGptConversation: '',
  };
  window.CSP_SHORTCUT_DEFAULTS = {
    ...(window.CSP_SHORTCUT_DEFAULTS || {}),
    ...shortcutDefaults,
  };

  chrome.storage.sync.get(Object.keys(shortcutDefaults), (data) => {
    const shortcuts = {};
    for (const key in shortcutDefaults) {
      if (Object.hasOwn(data, key) && hasUsableShortcutSetting(data[key])) {
        // Preserve explicit user-provided string values, including NBSP and empty strings.
        shortcuts[key] = data[key];
      } else {
        shortcuts[key] = shortcutDefaults[key];
      }
    }
    window.CSP_SHORTCUTS_EFFECTIVE = {
      ...(window.CSP_SHORTCUTS_EFFECTIVE || {}),
      ...shortcuts,
    };

    const modelToggleSetting = shortcuts.shortcutKeyToggleModelSelector;

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
          } catch { }

          let contTop = 0;
          let contHeight = window.innerHeight;
          if (container !== window) {
            try {
              const cr = container.getBoundingClientRect();
              contTop = cr.top;
              contHeight = container.clientHeight;
            } catch { }
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
            } catch { }
          };

          const finish = () => {
            try {
              if (typeof flashBorder === 'function') flashBorder(button);
            } catch { }
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
          } catch { }
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
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
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
            (btn?.textContent || btn?.innerText || btn?.getAttribute?.('aria-label') || '').trim();

          const findEditSendButton = (row) => {
            if (!row) return null;
            const buttons = Array.from(row.querySelectorAll('button'));
            if (!buttons.length) return null;

            const hasCancel = buttons.some((btn) => /cancel/i.test(getButtonLabel(btn)));
            if (!hasCancel) return null;

            const sendBtn =
              buttons.find((btn) => /send/i.test(getButtonLabel(btn))) || buttons[1] || buttons[0];

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
                '.bg-token-main-surface-tertiary, .rounded-3xl, [data-message-id], section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"]',
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
        triggerNativeNewConversationButton();
      },
      [shortcuts.shortcutKeySearchConversationHistory]: () => {
        triggerNativeSearchConversationButton();
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

        if (triggerNativeSidebarToggleButton()) {
          setTimeout(() => { }, 30);
          return;
        }

        // If still nothing, just exit
        setTimeout(() => { }, 30);
      },
      [shortcuts.shortcutKeyActivateInput]: function activateInput() {
        triggerDirectComposerActivation();
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

        const getMsgId = (btn) => btn.closest('[data-message-id]')?.getAttribute('data-message-id');

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

        const getMsgId = (btn) => btn.closest('[data-message-id]')?.getAttribute('data-message-id');

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
          root.querySelectorAll('p, pre, blockquote, h1, h2, h3, h4, h5, h6, div').forEach((el) => {
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

        // Build processed HTML + Text from one or more content elements in the same turn.
        function buildProcessedClipboardPayload_Single(contentEls) {
          const elements = Array.isArray(contentEls) ? contentEls.filter(Boolean) : [contentEls].filter(Boolean);
          if (!elements.length) return { html: '', text: '' };
          // Wrapper (acts like 111s turn wrapper — but no visible label)
          const turnWrapper = document.createElement('div');
          turnWrapper.setAttribute('data-export', 'chatgpt-shortcuts-single-message');
          // Preserve role tag (purely metadata)
          const roleContainer = elements[0].closest?.('[data-message-author-role]');
          turnWrapper.setAttribute(
            'data-role',
            roleContainer?.getAttribute?.('data-message-author-role') || 'assistant',
          );

          const textParts = [];
          for (const contentEl of elements) {
            const cloneForHtml = contentEl.cloneNode(true);

            // Preserve user message hard line breaks visually
            const isUser = !!contentEl.closest?.('[data-message-author-role="user"]');
            if (isUser) replaceNewlinesWithBr_UserPreWrap(cloneForHtml);

            // Normalize DOM to Word-friendly HTML
            normalizeCodeBlocksInClone(cloneForHtml);
            demotePTagsAndStripDataAttrs(cloneForHtml);
            splitListsAroundCodeBlocks_Word(cloneForHtml);

            // 1) Body container (Word-friendly spacing + code/list normalization)
            const bodyDiv = document.createElement('div');
            bodyDiv.innerHTML = cloneForHtml.innerHTML;

            applyWordSpacingAndFont_Word(bodyDiv);
            splitListsAroundCodeBlocks_Word(bodyDiv);
            inlineGuardFirstRuns_Word(bodyDiv);

            turnWrapper.appendChild(bodyDiv);
            textParts.push(buildPlainTextWithFences(contentEl));
          }

          const html =
            '<div data-export="chatgpt-shortcuts-single-message">' +
            turnWrapper.outerHTML +
            '</div>';

          const text = textParts.filter(Boolean).join('\n\n');

          return { html, text };
        }

        // Copy processed payload built from one or more content elements
        async function copyProcessedFromElements(contentEls) {
          const { html, text } = buildProcessedClipboardPayload_Single(contentEls);
          if (!html && !text) return;
          await writeClipboardHTMLAndText_Single(html, text);
        }

        // Visual selection (for feedback) + processed copy
        function doSelectAndCopy(contentEls, shouldCopy = true) {
          try {
            const elements = Array.isArray(contentEls)
              ? contentEls.filter(Boolean)
              : [contentEls].filter(Boolean);
            if (!elements.length) return;
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

            const firstEl = elements[0];
            const lastEl = elements[elements.length - 1];
            const startWalker = makeTextWalker(firstEl);
            const startNode = startWalker.nextNode();
            let endNode = null;
            if (startNode) {
              const endWalker = makeTextWalker(lastEl);
              for (let n = endWalker.nextNode(); n; n = endWalker.nextNode()) endNode = n;
            }
            const range = document.createRange();
            if (startNode && endNode) {
              range.setStart(startNode, 0);
              range.setEnd(endNode, endNode.nodeValue.length);
            } else {
              range.selectNodeContents(firstEl);
            }
            if (selection) selection.addRange(range);

            if (shouldCopy) void copyProcessedFromElements(elements);
          } catch (err) {
            if (DEBUG) console.debug('doSelectAndCopy failed:', err);
          }
        }

        const TURN_SELECTOR_SELECT_COPY =
          'section[data-testid^="conversation-turn-"], article[data-turn], article[data-testid^="conversation-turn-"]';

        function findRoleContainersFromTurn(turn, preferredRole = null) {
          if (!turn) return [];
          const selectors = preferredRole
            ? [`[data-message-author-role="${preferredRole}"]`]
            : ['[data-message-author-role="assistant"]', '[data-message-author-role="user"]'];
          for (const selector of selectors) {
            const matches = Array.from(turn.querySelectorAll(selector));
            if (matches.length) return matches;
          }
          return [];
        }

        function findContentElsForTurn(turn, preferredRole = null) {
          const seen = new Set();
          return findRoleContainersFromTurn(turn, preferredRole)
            .map((roleContainer) => findContentElForTurn(roleContainer))
            .filter((contentEl) => {
              if (!contentEl) return false;
              if (!(contentEl.innerText || contentEl.textContent || '').trim()) return false;
              if (seen.has(contentEl)) return false;
              seen.add(contentEl);
              return true;
            });
        }

        function findPreferredRoleForTurn(turn) {
          const dataTurn = turn?.getAttribute?.('data-turn');
          if (dataTurn === 'assistant' || dataTurn === 'user') return dataTurn;
          return findRoleContainersFromTurn(turn, 'assistant').length ? 'assistant' : 'user';
        }

        function findDirectContentEls(btn) {
          const roleContainer = btn.closest?.('[data-message-author-role]');
          if (!roleContainer) return [];
          const contentEl = findContentElForTurn(roleContainer);
          return contentEl && (contentEl.innerText || contentEl.textContent || '').trim()
            ? [contentEl]
            : [];
        }

        function getContentElsForCopyButton(btn) {
          const turn = btn.closest(TURN_SELECTOR_SELECT_COPY);
          const directContentEls = findDirectContentEls(btn);
          if (directContentEls.length) return directContentEls;
          return findContentElsForTurn(turn, findPreferredRoleForTurn(turn));
        }

        function turnHasRole(turn, role) {
          return findRoleContainersFromTurn(turn, role).length > 0;
        }

        function getPrimaryContentElsForTurn(turn) {
          return findContentElsForTurn(turn, findPreferredRoleForTurn(turn));
        }

        // Innermost visible text container for a given role container
        function findContentElForTurn(roleContainer) {
          if (!roleContainer) return null;
          const isUser = roleContainer.getAttribute('data-message-author-role') === 'user';
          if (isUser) {
            return (
              roleContainer.querySelector('.whitespace-pre-wrap') ||
              roleContainer.querySelector('.prose, .markdown, .markdown-new-styling') ||
              roleContainer
            );
          }
          return (
            roleContainer.querySelector('.whitespace-pre-wrap') ||
            roleContainer.querySelector('.prose, .markdown, .markdown-new-styling') ||
            roleContainer
          );
        }
        // click handler uses processed copy
        if (!window.__selectThenCopyCopyHandlerAttached) {
          document.addEventListener('click', (e) => {
            const btn = e.target.closest?.('[data-testid="copy-turn-action-button"]');
            if (!btn) return;

            const contentEls = getContentElsForCopyButton(btn);
            if (contentEls.length) {
              // Always show selection AND copy processed HTML/Text
              doSelectAndCopy(contentEls, true);
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
                document.querySelectorAll(TURN_SELECTOR_SELECT_COPY),
              );

              const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
              const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

              const composerTop = getComposerTopEdge();

              const visibleTurns = allConversationTurns.filter((el) => {
                const rect = el.getBoundingClientRect();
                const horizontallyVisible = rect.right > 0 && rect.left < viewportWidth;
                const verticallyVisible = rect.bottom > 0 && rect.top < viewportHeight;
                if (!(horizontallyVisible && verticallyVisible)) return false;
                if (Number.isFinite(composerTop) && rect.top >= composerTop) return false;
                return true;
              });

              const filteredVisibleTurns = visibleTurns.filter((el) => {
                if (
                  onlySelectAssistant &&
                  !turnHasRole(el, 'assistant')
                )
                  return false;
                if (onlySelectUser && !turnHasRole(el, 'user'))
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
                  const isUser = turnHasRole(turn, 'user');
                  const isAssistant = turnHasRole(turn, 'assistant');

                  if (onlySelectUser && !isUser) return;
                  if (onlySelectAssistant && !isAssistant) return;

                  const contentEls = getPrimaryContentElsForTurn(turn);
                  if (!contentEls.length) return;

                  doSelectAndCopy(contentEls, !!shouldCopyParam);
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
      [shortcuts.shortcutKeyRegenerateWithDifferentModel]: () => {
        const FIRST_BTN_PATH = ['M3.502 16.6663V13.3333C3.502', '#ec66f0']; // menu button icon path (prefix)
        const SUB_ITEM_BTN_PATH = ['#9254a2']; // legacy storage key now targets "Don't Search the Web"
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
          } catch { }
          try {
            el.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }),
            );
            el.dispatchEvent(
              new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }),
            );
          } catch { }
          try {
            el.click();
          } catch { }
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
        if (window.__cspRunThinkingEffortAction?.('thinking-extended')) return;
        const FIRST_BTN_PATH = ['#127a53', '#c9d737'];
        const SUB_ITEM_BTN_PATH = '#143e56';
        delayCall(clickLowestSvgThenSubItemSvg, 350, FIRST_BTN_PATH, SUB_ITEM_BTN_PATH);
      },

      [shortcuts.shortcutKeyThinkingStandard]: () => {
        if (window.__cspRunThinkingEffortAction?.('thinking-standard')) return;
        const FIRST_BTN_PATH = ['#127a53', '#c9d737'];
        const SUB_ITEM_BTN_PATH = '#fec800';
        delayCall(clickLowestSvgThenSubItemSvg, 350, FIRST_BTN_PATH, SUB_ITEM_BTN_PATH);
      },
      [shortcuts.shortcutKeyThinkingLight]: () => {
        if (window.__cspRunThinkingEffortAction?.('thinking-light')) return;
        const FIRST_BTN_PATH = ['#127a53', '#c9d737'];
        const SUB_ITEM_BTN_PATH = '#407870';
        delayCall(clickLowestSvgThenSubItemSvg, 350, FIRST_BTN_PATH, SUB_ITEM_BTN_PATH);
      },
      [shortcuts.shortcutKeyThinkingHeavy]: () => {
        if (window.__cspRunThinkingEffortAction?.('thinking-heavy')) return;
        const FIRST_BTN_PATH = ['#127a53', '#c9d737'];
        const SUB_ITEM_BTN_PATH = '#3c5754';
        delayCall(clickLowestSvgThenSubItemSvg, 350, FIRST_BTN_PATH, SUB_ITEM_BTN_PATH);
      },
      [shortcuts.shortcutKeyTemporaryChat]: () => {
        const root = document.querySelector('#conversation-header-actions') || document;
        const el =
          root
            .querySelector('button svg use[href*="#28a8a0"]')
            ?.closest('button') || // Turn on
          root.querySelector('button svg use[href*="#6eabdf"]')?.closest('button'); // Turn off
        if (!el) return;
        smartClick(el);
      },
      [shortcuts.shortcutKeyStudy]: async () => {
        // Removed from ChatGPT; keep the legacy storage key inert for existing installs.
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
          } catch { }
          flashBorder(el);
          smartClick(el);
          return true;
        };

        const findFirstClickable = (...selectors) => {
          for (const selector of selectors) {
            if (!selector) continue;
            const el = composerRoot.querySelector(selector);
            if (el) return el;
          }
          return null;
        };

        // While dictation is active, ChatGPT renders both cancel (X) and submit (checkmark).
        // The toggle shortcut should confirm/send first; explicit cancel stays on its own key.
        const submitDictationBtn =
          findClickableBySpriteId('#fa1dbd') ||
          findFirstClickable('button[aria-label="Submit dictation"]');
        if (click(submitDictationBtn)) return;

        // Otherwise start dictation (avoid Voice Mode button).
        const dictateBtn =
          findClickableBySpriteId('#29f921') ||
          findFirstClickable('button[aria-label="Dictate button"]');
        if (click(dictateBtn)) return;

        // Fall back to submit only when the dedicated dictate/stop controls are unavailable.
        const submitBtn =
          findFirstClickable(
            '#composer-submit-button',
            'button[data-testid="send-button"]',
            'button[aria-label="Send prompt"]',
          ) ||
          findClickableBySpriteId('#01bab7') ||
          findClickableBySpriteId('#fa1dbd');
        click(submitBtn);
      },
      [shortcuts.shortcutKeyCancelDictation]: async () => {
        // Prefer stable, language-agnostic selectors first; fall back to icon path if needed.
        const composerRoot =
          document.getElementById('thread-bottom-container') ||
          document.querySelector('form[data-type="unified-composer"]') ||
          document.getElementById('composer-background') ||
          document.body;

        const btn =
          (() => {
            const safe = String('#85f94b').replace(/(["\\])/g, '\\$1');
            const use = composerRoot.querySelector(`svg use[href*="${safe}"]`);
            return use?.closest('button, [role="button"], a, [tabindex]') || null;
          })() || composerRoot.querySelector('button[aria-label="Stop dictation"]');

        // Only stop if Stop dictation is currently available; otherwise no-op.
        if (!btn) return;

        try {
          btn.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
        } catch { }
        flashBorder(btn);
        await sleep(DELAYS.beforeFinalClick);
        smartClick(btn);
      },
      [shortcuts.shortcutKeyShare]: async () => {
        await clickButtonByTestId('share-chat-button');
      },
      [shortcuts.shortcutKeyThinkLonger]: async () => {
        // Removed from ChatGPT; keep the legacy storage key inert for existing installs.
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

        const TURN_SELECTOR_ENTIRE_CONV =
          'section[data-testid^="conversation-turn-"], article[data-turn], article[data-testid^="conversation-turn-"]';

        // Identify the content elements for a user/assistant turn
        function findContentElsForTurn_EntireConv(container) {
          const assistantScopes = container.matches?.('[data-message-author-role="assistant"]')
            ? [container]
            : Array.from(container.querySelectorAll?.('[data-message-author-role="assistant"]') || []);
          const userScopes = container.matches?.('[data-message-author-role="user"]')
            ? [container]
            : Array.from(container.querySelectorAll?.('[data-message-author-role="user"]') || []);
          const scopes = assistantScopes.length ? assistantScopes : userScopes;
          if (!scopes.length) {
            return [
              container.querySelector?.('.whitespace-pre-wrap') ||
              container.querySelector?.('.prose, .markdown, .markdown-new-styling') ||
              container,
            ].filter(Boolean);
          }
          const seen = new Set();
          return scopes
            .map(
              (scope) =>
                scope.querySelector('.whitespace-pre-wrap') ||
                scope.querySelector('.prose, .markdown, .markdown-new-styling') ||
                scope,
            )
            .filter((contentEl) => {
              if (!contentEl) return false;
              const txt = (contentEl.innerText || contentEl.textContent || '').trim();
              if (!txt) return false;
              if (seen.has(contentEl)) return false;
              seen.add(contentEl);
              return true;
            });
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
          const allTurns = Array.from(document.querySelectorAll(TURN_SELECTOR_ENTIRE_CONV));

          // Filter by role
          const filteredTurns = allTurns.filter((turn) => {
            const isAssistant = !!turn.querySelector('[data-message-author-role="assistant"]');
            const isUser = !!turn.querySelector('[data-message-author-role="user"]');
            if (isAssistant && includeAssistant) return true;
            if (isUser && includeUser) return true;
            return false;
          });

          // Map to content elements
          const turnContentGroups = filteredTurns
            .map((turn) => ({
              els: findContentElsForTurn_EntireConv(turn),
              turn,
            }))
            .filter(({ els }) => els.length);

          // Nothing to copy
          if (!turnContentGroups.length) return { html: '', text: '' };

          // Build HTML + text blocks
          const blocksHTML = [];
          const blocksText = [];
          const selectionEls = [];

          for (const { els, turn } of turnContentGroups) {
            const roleContainer = els[0]?.closest?.('[data-message-author-role]');
            const role = roleContainer?.getAttribute?.('data-message-author-role') || 'assistant';

            // Determine label source
            let nativeLabel = '';
            try {
              nativeLabel = (
                turn.querySelector?.('h4.sr-only, h5.sr-only, h6.sr-only')?.textContent || ''
              ).trim();
            } catch (_) {
              /* ignore */
            }
            const fallbackLabel = role === 'user' ? 'You said:' : 'ChatGPT said:';
            const labelText = includeLabels ? nativeLabel || fallbackLabel : '';

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

            const textParts = [];
            for (const el of els) {
              selectionEls.push(el);

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
              textParts.push(buildPlainTextWithFences(el.cloneNode(true)));
            }

            blocksHTML.push(turnWrapper.outerHTML);

            const contentText = textParts.filter(Boolean).join('\n\n');
            const textBlock = labelText ? `${labelText}\n${contentText}` : contentText;
            blocksText.push(textBlock);
          }

          const html =
            '<div data-export="chatgpt-shortcuts-entire-conversation">' +
            blocksHTML.join('') +
            '</div>';
          const text = blocksText.join('\n\n');

          return { html, text, contentEls: selectionEls };
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
              const omitViaDoNotInclude = resolveFlag_EntireConv(window.doNotIncludeLabelsCheckbox);
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

    const THINKING_EFFORT_DYNAMIC_SHORTCUTS = [
      {
        storageKey: 'shortcutKeyThinkingExtended',
        optionId: 'thinking-extended',
        fallback: () => {
          const FIRST_BTN_PATH = ['#127a53', '#c9d737'];
          const SUB_ITEM_BTN_PATH = '#143e56';
          delayCall(clickLowestSvgThenSubItemSvg, 350, FIRST_BTN_PATH, SUB_ITEM_BTN_PATH);
        },
      },
      {
        storageKey: 'shortcutKeyThinkingStandard',
        optionId: 'thinking-standard',
        fallback: () => {
          const FIRST_BTN_PATH = ['#127a53', '#c9d737'];
          const SUB_ITEM_BTN_PATH = '#fec800';
          delayCall(clickLowestSvgThenSubItemSvg, 350, FIRST_BTN_PATH, SUB_ITEM_BTN_PATH);
        },
      },
      {
        storageKey: 'shortcutKeyThinkingLight',
        optionId: 'thinking-light',
        fallback: () => {
          const FIRST_BTN_PATH = ['#127a53', '#c9d737'];
          const SUB_ITEM_BTN_PATH = '#407870';
          delayCall(clickLowestSvgThenSubItemSvg, 350, FIRST_BTN_PATH, SUB_ITEM_BTN_PATH);
        },
      },
      {
        storageKey: 'shortcutKeyThinkingHeavy',
        optionId: 'thinking-heavy',
        fallback: () => {
          const FIRST_BTN_PATH = ['#127a53', '#c9d737'];
          const SUB_ITEM_BTN_PATH = '#3c5754';
          delayCall(clickLowestSvgThenSubItemSvg, 350, FIRST_BTN_PATH, SUB_ITEM_BTN_PATH);
        },
      },
    ];

    const getEffectiveShortcutSetting = (storageKey) => {
      const effective = window.CSP_SHORTCUTS_EFFECTIVE || {};
      if (hasUsableShortcutSetting(effective[storageKey])) return effective[storageKey];
      if (hasUsableShortcutSetting(shortcuts[storageKey])) return shortcuts[storageKey];
      return shortcutDefaults[storageKey] || '';
    };

    const runDynamicThinkingEffortShortcut = (event) => {
      const matched = THINKING_EFFORT_DYNAMIC_SHORTCUTS.find(({ storageKey }) =>
        matchesShortcutKey(getEffectiveShortcutSetting(storageKey), event),
      );
      if (!matched) return false;
      event.preventDefault();
      if (window.__cspRunThinkingEffortAction?.(matched.optionId)) return true;
      matched.fallback();
      return true;
    };

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const shortcutPatch = {};
      for (const key of Object.keys(shortcutDefaults)) {
        if (!Object.hasOwn(changes, key)) continue;
        const next = changes[key].newValue;
        shortcutPatch[key] = hasUsableShortcutSetting(next) ? next : shortcutDefaults[key];
      }
      if (!Object.keys(shortcutPatch).length) return;
      window.CSP_SHORTCUTS_EFFECTIVE = {
        ...(window.CSP_SHORTCUTS_EFFECTIVE || {}),
        ...shortcutPatch,
      };
    });

    document.addEventListener(
      'keydown',
      (event) => {
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
        if (!isCtrlPressed && matchesShortcutKey(modelToggleSetting, event)) {
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
        if (runDynamicThinkingEffortShortcut(event)) return;

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
          matchesShortcutKey(modelToggleSetting, event)
        ) {
          event.preventDefault();
          window.toggleModelSelector(); // open / close the menu
          return; // allow Ctrl/Cmd + 1‑5 to fall through to the IIFE
        }

        // … everything else (Ctrl + Enter, Ctrl + Backspace, etc.)
        const ctrlShortcut =
          keyFunctionMappingCtrl[keyIdentifier] || keyFunctionMappingCtrl[event.code];

        if (ctrlShortcut) {
          const enabled = isCtrlShortcutEnabled(keyIdentifier) || isCtrlShortcutEnabled(event.code);

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
      },
      { capture: true },
    );

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
  });
})();

// ====================================
// @note UI Styling & Header Scaling
// ====================================
(() => {
  const DYNAMIC_UI_SELECTOR = [
    '.group\\/conversation-turn',
    '.flex.h-\\[44px\\].items-center.justify-between',
    '.md\\:h-header-height',
    'a.group.flex.gap-2',
  ].join(', ');

  function shouldHideDynamicAnchor(node) {
    if (!(node instanceof Element) || !node.matches('a.group.flex.gap-2')) return false;
    return !node.closest(
      'nav, aside#stage-sidebar, #stage-slideover-sidebar, [data-testid="stage-sidebar"], [data-testid="stage-slideover-sidebar"]',
    );
  }

  function applyConversationTurnStyling(el) {
    if (!(el instanceof HTMLElement) || el.dataset.cspTurnFadeBound === 'true') return;
    el.dataset.cspTurnFadeBound = 'true';
    el.style.display = 'flex';
    el.style.opacity = '0.1';
    el.style.transition = 'opacity 0.2s ease-in-out';
    el.addEventListener('mouseenter', () => gsap.to(el, { opacity: 1, duration: 0.2 }));
    el.addEventListener('mouseleave', () => gsap.to(el, { opacity: 0.1, duration: 0.2 }));
  }

  function applyDynamicUiStyling(node) {
    if (!(node instanceof Element)) return;

    if (node.matches('.group\\/conversation-turn')) {
      applyConversationTurnStyling(node);
    }

    if (
      node.matches('.flex.h-\\[44px\\].items-center.justify-between') &&
      node.dataset.cspHeaderFadeApplied !== 'true'
    ) {
      node.dataset.cspHeaderFadeApplied = 'true';
      gsap.to(node, {
        opacity: 0.3,
        duration: 0.2,
        ease: 'sine.out',
      });
    }

    if (node.matches('.md\\:h-header-height') && node.dataset.cspHeaderHeightApplied !== 'true') {
      node.dataset.cspHeaderHeightApplied = 'true';
      node.style.height = 'fit-content';
    }

    if (shouldHideDynamicAnchor(node) && node.dataset.cspAnchorHiddenApplied !== 'true') {
      node.dataset.cspAnchorHiddenApplied = 'true';
      gsap.set(node, {
        opacity: 0,
        pointerEvents: 'none',
        width: 0,
        height: 0,
        overflow: 'hidden',
      });
    }
  }

  function forEachDynamicUiTarget(root, callback) {
    if (!(root instanceof Element) || typeof callback !== 'function') return false;

    let foundMatch = false;

    if (root.matches(DYNAMIC_UI_SELECTOR)) {
      foundMatch = true;
      callback(root);
    }

    root.querySelectorAll(DYNAMIC_UI_SELECTOR).forEach((node) => {
      foundMatch = true;
      callback(node);
    });

    return foundMatch;
  }

  function applyDynamicUiStylingInSubtree(root) {
    if (!(root instanceof Element)) return false;
    if (!root.matches(DYNAMIC_UI_SELECTOR) && root.childElementCount === 0) return false;
    return forEachDynamicUiTarget(root, applyDynamicUiStyling);
  }

  const pendingDynamicUiRoots = [];
  let dynamicUiFlushHandle = 0;

  function queueDynamicUiRoot(root) {
    if (!(root instanceof Element)) return;
    if (!root.matches(DYNAMIC_UI_SELECTOR) && root.childElementCount === 0) return;

    for (let i = pendingDynamicUiRoots.length - 1; i >= 0; i--) {
      const pending = pendingDynamicUiRoots[i];
      if (!(pending instanceof Element) || !pending.isConnected) {
        pendingDynamicUiRoots.splice(i, 1);
        continue;
      }
      if (pending === root || pending.contains(root)) return;
      if (root.contains(pending)) {
        pendingDynamicUiRoots.splice(i, 1);
      }
    }

    pendingDynamicUiRoots.push(root);

    if (dynamicUiFlushHandle) return;

    const flush = () => {
      dynamicUiFlushHandle = 0;
      const roots = pendingDynamicUiRoots.splice(0, pendingDynamicUiRoots.length);
      roots.forEach((queuedRoot) => {
        applyDynamicUiStylingInSubtree(queuedRoot);
      });
    };

    if (typeof window.requestAnimationFrame === 'function') {
      dynamicUiFlushHandle = window.requestAnimationFrame(flush);
    } else {
      dynamicUiFlushHandle = window.setTimeout(flush, 16);
    }
  }

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
      applyConversationTurnStyling(el);
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
          if (!(n instanceof Element)) continue;
          queueDynamicUiRoot(n);
        }
      }
    });

    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
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
  const STYLE_ID = 'csp-fade-message-buttons-style';
  let styleEl = null;
  let hoverAbort = null;
  const pendingTimeouts = new Set();

  const ensureStyle = () => {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = `

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
    document.head.appendChild(styleEl);
  };

  const removeStyle = () => {
    styleEl?.remove();
    styleEl = null;
  };

  // Decide how faded the buttons are in light/dark mode
  const getFadeOpacity = () => {
    if (
      document.documentElement.classList.contains('dark') ||
      document.body.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 0.08;
    }
    return 0.2;
  };

  const clearPendingTimeouts = () => {
    pendingTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    pendingTimeouts.clear();
  };

  const resetManagedRows = () => {
    document.querySelectorAll('div[class*="group-hover/turn-messages"]').forEach((child) => {
      child.classList.remove('force-full-opacity');
      child.style.removeProperty('opacity');
    });
  };

  const detachHoverHandlers = () => {
    hoverAbort?.abort();
    hoverAbort = null;
    clearPendingTimeouts();
    resetManagedRows();
  };

  const attachHoverHandlers = () => {
    detachHoverHandlers();
    hoverAbort = new AbortController();
    const { signal } = hoverAbort;

    document.querySelectorAll('div.flex.justify-start, div.flex.justify-end').forEach((parent) => {
      const child = parent.querySelector('div[class*="group-hover/turn-messages"]');
      if (!child) return;

      let fadeTimeout = null;
      const clearFadeTimeout = () => {
        if (fadeTimeout == null) return;
        clearTimeout(fadeTimeout);
        pendingTimeouts.delete(fadeTimeout);
        fadeTimeout = null;
      };

      parent.addEventListener(
        'mouseenter',
        () => {
          clearFadeTimeout();
          child.classList.add('force-full-opacity');
          child.style.opacity = '1';
        },
        { signal },
      );

      parent.addEventListener(
        'mouseleave',
        () => {
          clearFadeTimeout();
          fadeTimeout = window.setTimeout(() => {
            pendingTimeouts.delete(fadeTimeout);
            fadeTimeout = null;
            child.classList.remove('force-full-opacity');
            child.style.opacity = String(getFadeOpacity());
          }, 2000);
          pendingTimeouts.add(fadeTimeout);
        },
        { signal },
      );

      signal.addEventListener('abort', clearFadeTimeout, { once: true });
      child.style.opacity = String(getFadeOpacity());
    });
  };

  const applySetting = (enabled) => {
    const isOn = Boolean(enabled);
    window._fadeMessageButtonsCheckbox = isOn;
    window.fadeMessageButtonsCheckbox = isOn;

    if (!isOn) {
      detachHoverHandlers();
      removeStyle();
      return;
    }

    ensureStyle();
    attachHoverHandlers();
  };

  chrome.storage.sync.get(
    { fadeMessageButtonsCheckbox: false },
    ({ fadeMessageButtonsCheckbox }) => {
      applySetting(fadeMessageButtonsCheckbox);
    },
  );

  chrome.storage.onChanged.addListener((chg, area) => {
    if (area !== 'sync' || !('fadeMessageButtonsCheckbox' in chg)) return;
    applySetting(chg.fadeMessageButtonsCheckbox.newValue);
  });
})();

// ==================================================
// @note always hide the disclaimer footer
// ==================================================
(() => {
  const STYLE_ID = 'csp-hide-disclaimer-style';

  if (document.getElementById(STYLE_ID)) return;

  const styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = `
div[data-id="hide-this-warning"],
div[class*="view-transition-name:var(--vt-disclaimer)"] {
    display: none !important;
}
`;
  document.head.appendChild(styleEl);
})();

(() => {
  const IMPORTANT_ROOTS = ['important', 'importante', 'ज़रूरी', '重要', 'важн', 'важлив'];
  const DISCLAIMER_CONTAINER_SELECTOR =
    'div[data-id="hide-this-warning"], div[class*="view-transition-name:var(--vt-disclaimer)"]';
  const DISCLAIMER_TEXT_ROW_SELECTOR =
    'div.text-token-text-secondary.relative.mt-auto.flex.min-h-8.w-full.items-center.justify-center.p-2.text-center.text-xs, ' +
    'div.text-token-text-secondary.text-center.text-xs';
  const DISCLAIMER_RECHECK_DELAYS_MS = [0, 150, 600, 1500];
  const pendingDisclaimerRechecks = new WeakSet();
  let disclaimerRefreshToken = 0;

  const containsImportantRoot = (txt) =>
    IMPORTANT_ROOTS.some((root) => txt.toLowerCase().includes(root.toLowerCase()));

  const findDisclaimerSearchRoot = () =>
    document.getElementById('thread') ||
    document.getElementById('thread-bottom-container')?.parentElement ||
    document.getElementById('thread-bottom-container') ||
    document.body ||
    document.documentElement;

  const findDisclaimerObserverRoot = () => document.body || document.documentElement;

  const isScopedDisclaimerTextRow = (node) =>
    node instanceof Element &&
    node.matches(DISCLAIMER_TEXT_ROW_SELECTOR) &&
    !!node.closest?.(
      '#thread, #thread-bottom, #thread-bottom-container, form[data-type="unified-composer"]',
    );

  const getDisclaimerContainer = (node) => {
    if (!(node instanceof Element)) return null;
    if (node.matches('div[data-id="hide-this-warning"]')) return node;

    const explicitContainer = node.matches('div[class*="view-transition-name:var(--vt-disclaimer)"]')
      ? node
      : node.closest?.('div[class*="view-transition-name:var(--vt-disclaimer)"]');
    if (explicitContainer instanceof Element) return explicitContainer;

    if (isScopedDisclaimerTextRow(node)) return node;

    const textRowContainer = node.closest?.(DISCLAIMER_TEXT_ROW_SELECTOR);
    return isScopedDisclaimerTextRow(textRowContainer) ? textRowContainer : null;
  };

  const findLiveDisclaimerNode = (root = document) => {
    if (!(root instanceof Element) && root !== document) return null;

    if (root instanceof Element) {
      const selfContainer = getDisclaimerContainer(root);
      if (selfContainer instanceof Element) return selfContainer;
    }

    const tagged = root.querySelector?.('[data-id="hide-this-warning"]');
    if (tagged instanceof Element) return tagged;

    const explicit = root.querySelector?.(DISCLAIMER_CONTAINER_SELECTOR);
    if (explicit instanceof Element) return explicit;

    const textRow = Array.from(root.querySelectorAll?.(DISCLAIMER_TEXT_ROW_SELECTOR) || []).find(
      isScopedDisclaimerTextRow,
    );
    return textRow instanceof Element ? textRow : null;
  };

  window.__cspFindLiveDisclaimerNode = (root) => findLiveDisclaimerNode(root);

  const isDisclaimerCandidate = (node) => getDisclaimerContainer(node) instanceof Element;

  const markDisclaimerNode = (node) => {
    const container = getDisclaimerContainer(node);
    if (!(container instanceof Element)) return;

    const txt = container.textContent.trim().replace(/\s+/g, ' ');
    if (containsImportantRoot(txt)) {
      container.setAttribute('data-id', 'hide-this-warning');
    }
  };

  const markDisclaimerWarnings = (root) => {
    if (!(root instanceof Element) && root !== document) return;
    const liveNode = findLiveDisclaimerNode(root);
    if (liveNode instanceof Element) {
      markDisclaimerNode(liveNode);
    }
  };

  const scheduleDisclaimerRecheck = (root) => {
    if (!(root instanceof Element) || pendingDisclaimerRechecks.has(root)) return;
    pendingDisclaimerRechecks.add(root);
    DISCLAIMER_RECHECK_DELAYS_MS.forEach((delayMs, index) => {
      setTimeout(() => {
        if (index === DISCLAIMER_RECHECK_DELAYS_MS.length - 1) {
          pendingDisclaimerRechecks.delete(root);
        }
        if (!root.isConnected) return;

        const liveNode = findLiveDisclaimerNode(root);
        if (liveNode instanceof Element) {
          markDisclaimerNode(liveNode);
        }
      }, delayMs);
    });
  };

  const refreshDisclaimerWarnings = (root = findDisclaimerSearchRoot()) => {
    if (!(root instanceof Element) && root !== document) return;
    markDisclaimerWarnings(root);
    const liveNode = findLiveDisclaimerNode(root);
    if (liveNode instanceof Element) {
      scheduleDisclaimerRecheck(liveNode);
    }
  };

  const scheduleDisclaimerRefresh = () => {
    const refreshToken = ++disclaimerRefreshToken;
    DISCLAIMER_RECHECK_DELAYS_MS.forEach((delayMs) => {
      setTimeout(() => {
        if (refreshToken !== disclaimerRefreshToken) return;
        refreshDisclaimerWarnings();
      }, delayMs);
    });
  };

  const maybeScheduleDisclaimerRefreshFromClick = (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;

    let targetUrl;
    try {
      targetUrl = new URL(anchor.href, location.origin);
    } catch {
      return;
    }

    if (targetUrl.origin !== location.origin) return;
    if (
      targetUrl.pathname === location.pathname &&
      targetUrl.search === location.search &&
      targetUrl.hash === location.hash
    ) {
      return;
    }

    scheduleDisclaimerRefresh();
  };

  window.__cspEnsureDisclaimerHider = () => {
    if (window.__cspDisclaimerHiderInstalled) {
      scheduleDisclaimerRefresh();
      return;
    }
    window.__cspDisclaimerHiderInstalled = true;

    refreshDisclaimerWarnings();

    const root = findDisclaimerObserverRoot();
    if (!root) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.target instanceof Element && isDisclaimerCandidate(mutation.target)) {
          markDisclaimerWarnings(mutation.target);
          scheduleDisclaimerRecheck(mutation.target);
        }

        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          const liveNode = findLiveDisclaimerNode(node);
          if (!(liveNode instanceof Element) && !isDisclaimerCandidate(node)) continue;

          markDisclaimerWarnings(node);
          scheduleDisclaimerRecheck(liveNode instanceof Element ? liveNode : node);
        }
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
    });

    document.addEventListener('click', maybeScheduleDisclaimerRefreshFromClick, {
      capture: true,
    });
    window.addEventListener('popstate', scheduleDisclaimerRefresh);
    window.addEventListener('hashchange', scheduleDisclaimerRefresh);
  };
})();

// ==================================================
// @note TopBarToBottom Feature (single-flight / stable-anchor rewrite)
// ==================================================
(() => {
  const READY_CLASS = 'csp-bottom-bar-ready';
  const STYLE_ID = 'csp-bottom-bar-style';

  const SELECTORS = {
    PAGE_HEADER: '#page-header',
    CONVERSATION_HEADER_ACTIONS: '#conversation-header-actions',
    THREAD_BOTTOM_CONTAINER: '#thread-bottom-container',
    THREAD_BOTTOM: '#thread-bottom',
    COMPOSER_FORM: "form[data-type='unified-composer']",
    COMPOSER_SURFACE: '[data-composer-surface="true"]',
    MODEL_SWITCHER_BUTTON:
      'button[data-testid="model-switcher-dropdown-button"], ' +
      'button[data-testid="Model-switCher-dropdown-button"], ' +
      '[data-composer-surface="true"] button.__composer-pill[aria-haspopup="menu"][id^="radix-"]',
    PROFILE_BUTTON: 'button[data-testid="profile-button"]',
    LOGIN_BUTTON: 'button[data-testid="login-button"]',
  };

  const RELEVANT_MUTATION_SELECTORS = [
    SELECTORS.PAGE_HEADER,
    SELECTORS.CONVERSATION_HEADER_ACTIONS,
    SELECTORS.THREAD_BOTTOM_CONTAINER,
    SELECTORS.THREAD_BOTTOM,
    SELECTORS.COMPOSER_FORM,
    SELECTORS.MODEL_SWITCHER_BUTTON,
  ];

  function setReadyState(ready) {
    const isReady = Boolean(ready);
    document.documentElement?.classList.toggle(READY_CLASS, isReady);
    document.body?.classList.toggle(READY_CLASS, isReady);
  }

  function clearReadyState() {
    setReadyState(false);
  }

  function hasLoginButtonPresent() {
    return !!document.querySelector(SELECTORS.LOGIN_BUTTON);
  }

  function isExcludedTopBarToBottomPath() {
    const hostname = location.hostname.replace(/^www\./, '');
    const pathname = location.pathname;

    const isGpts = hostname === 'chatgpt.com' && pathname.startsWith('/gpts');
    const isCodex = hostname === 'chatgpt.com' && pathname.startsWith('/codex');
    const isG = hostname === 'chatgpt.com' && pathname.startsWith('/g/');
    const isSora = hostname === 'sora.chatgpt.com';
    const isLibrary = hostname === 'chatgpt.com' && pathname.startsWith('/library/');

    return isGpts || isCodex || isG || isSora || isLibrary;
  }

  function coerceStoredNumber(value, fallback) {
    if (typeof coerceNumberFromStorage === 'function') {
      return coerceNumberFromStorage(value, fallback);
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function createDebounce(fn, wait = 80) {
    let t = 0;
    return (...args) => {
      clearTimeout(t);
      t = window.setTimeout(() => fn(...args), wait);
    };
  }

  function injectBottomBarStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${READY_CLASS} .draggable.sticky.top-0,
      .${READY_CLASS} #page-header {
        opacity: 0 !important;
        pointer-events: none !important;
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        overflow: hidden !important;
      }

      #bottomBarContainer {
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        margin-top: 2px !important;
        margin-bottom: -15px !important;
        overflow-anchor: none !important;
        min-height: 36px !important;
        box-sizing: border-box !important;
        background: transparent !important;
      }

      #bottomBarContainer[data-pending="true"] {
        visibility: hidden !important;
      }

      #bottomBarContainer button:hover {
        filter: brightness(1.1) !important;
      }

      div[data-id="hide-this-warning"] {
        opacity: 0 !important;
        pointer-events: none !important;
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        overflow: hidden !important;
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

      div#bottomBarLeft {
        scale: 0.9;
      }

      div#bottomBarCenter {
        scale: 0.9;
      }

      div#bottomBarRight {
        scale: 0.85;
        padding-right: 0em;
      }

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

      #bottomBarContainer .truncate,
      #bottomBarLeft .truncate,
      #bottomBarCenter .truncate,
      #bottomBarRight .truncate {
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        word-break: break-word !important;
      }

      .mb-4 {
        margin-bottom: 4px;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function findHeaderModelButton() {
    const pageHeader = document.querySelector(SELECTORS.PAGE_HEADER);

    if (pageHeader instanceof Element) {
      const fromHeader = Array.from(
        pageHeader.querySelectorAll(SELECTORS.MODEL_SWITCHER_BUTTON),
      ).find((el) => !el.closest('#bottomBarContainer'));
      if (fromHeader) return fromHeader;
    }

    return (
      Array.from(document.querySelectorAll(SELECTORS.MODEL_SWITCHER_BUTTON)).find(
        (el) => !el.closest('#bottomBarContainer'),
      ) || null
    );
  }

  function findHeaderConversationActions() {
    const pageHeader = document.querySelector(SELECTORS.PAGE_HEADER);

    if (pageHeader instanceof Element) {
      const fromHeader = pageHeader.querySelector(SELECTORS.CONVERSATION_HEADER_ACTIONS);
      if (fromHeader instanceof Element && !fromHeader.closest('#bottomBarContainer')) {
        return fromHeader;
      }
    }

    return (
      Array.from(document.querySelectorAll(SELECTORS.CONVERSATION_HEADER_ACTIONS)).find(
        (el) => !el.closest('#bottomBarContainer'),
      ) || null
    );
  }

  function findAnchorSnapshot() {
    const threadBottomContainer = document.querySelector(SELECTORS.THREAD_BOTTOM_CONTAINER);
    if (!(threadBottomContainer instanceof Element)) return null;

    const composerForm =
      threadBottomContainer.querySelector(SELECTORS.COMPOSER_FORM) ||
      document.querySelector(SELECTORS.COMPOSER_FORM);

    if (!(composerForm instanceof Element)) return null;

    const composerContainer =
      composerForm.querySelector(SELECTORS.COMPOSER_SURFACE) ||
      composerForm.querySelector('.border-token-border-default') ||
      composerForm;

    const mountAfterEl = composerForm;
    const mountParent = composerForm.parentElement;
    if (!(mountParent instanceof Element)) return null;

    return {
      composerForm,
      composerContainer: composerContainer instanceof Element ? composerContainer : composerForm,
      mountParent,
      mountAfterEl,
    };
  }

  function createBottomBarController() {
    const state = {
      started: false,
      observer: null,
      scheduled: false,
      reconcileRunning: false,
      suppressObserverUntil: 0,

      root: null,
      lane: null,
      row: null,
      left: null,
      center: null,
      right: null,

      mountedHostParent: null,
      mountedAnchor: null,
      composerContainer: null,
      modelButton: null,
      headerActions: null,

      revealed: false,
      shellAttachedAt: 0,
      revealTimer: 0,

      opacityValue: 0.6,
      opacityPromise: null,

      textScaleResizeObserver: null,
      textScaleObservedRoot: null,
      textScaleResizeHandler: null,
      textScaleWindowBound: false,

      nonCriticalHelpersStarted: false,
      profileButtonObserverStarted: false,
      attachCount: 0,
      observationRoot: null,
    };

    function applyReadyState(ready) {
      setReadyState(Boolean(ready));
    }

    function start() {
      if (state.started) return;
      state.started = true;

      void loadOpacityValue(); // async, but not blocking first mount
      installMainObserver();
      scheduleReconcile('start');
    }

    function loadOpacityValue() {
      if (state.opacityPromise) return state.opacityPromise;

      state.opacityPromise = new Promise((resolve) => {
        if (!chrome?.storage?.sync) {
          state.opacityValue = 0.6;
          window.popupBottomBarOpacityValue = state.opacityValue;
          applyIdleOpacity();
          resolve(state.opacityValue);
          return;
        }

        try {
          chrome.storage.sync.get({ popupBottomBarOpacityValue: 0.6 }, (res) => {
            if (chrome.runtime.lastError) {
              state.opacityValue = 0.6;
            } else {
              state.opacityValue = coerceStoredNumber(res.popupBottomBarOpacityValue, 0.6);
            }

            window.popupBottomBarOpacityValue = state.opacityValue;
            applyIdleOpacity();
            resolve(state.opacityValue);
          });
        } catch {
          state.opacityValue = 0.6;
          window.popupBottomBarOpacityValue = state.opacityValue;
          applyIdleOpacity();
          resolve(state.opacityValue);
        }
      });

      return state.opacityPromise;
    }

    function applyIdleOpacity() {
      const opacity = String(coerceStoredNumber(state.opacityValue, 0.6));

      if (state.root instanceof HTMLElement) {
        state.root.style.opacity = '1';
      }

      if (state.row instanceof HTMLElement) {
        state.row.style.opacity = opacity;
        return;
      }

      if (state.root instanceof HTMLElement) {
        state.root.style.opacity = opacity;
      }
    }

    // biome-ignore lint/correctness/noUnusedFunctionParameters: keep snapshot placeholder for observer call shape
    function resolveObservationRoot(snapshot = null) {
      return document.body || document.documentElement || null;
    }

    function observeMainRoot(root) {
      if (!(root instanceof Node) || !(state.observer instanceof MutationObserver)) return;
      if (state.observationRoot === root) return;

      state.observer.disconnect();
      state.observer.observe(root, {
        childList: true,
        subtree: true,
      });
      state.observationRoot = root;
    }

    function installMainObserver(snapshot = null) {
      if (!(state.observer instanceof MutationObserver)) {
        state.observer = new MutationObserver((mutations) => {
          if (performance.now() < state.suppressObserverUntil) return;
          if (!mutations.length) return;

          if (mutations.every(isInternalBottomBarMutation)) return;

          if (
            !(state.root instanceof Element) ||
            !state.root.isConnected ||
            (state.mountedHostParent && !state.mountedHostParent.isConnected) ||
            (state.mountedAnchor && !state.mountedAnchor.isConnected)
          ) {
            scheduleReconcile('repair:tracked_node_disconnected');
            return;
          }

          if (!mutations.some(isRelevantMutation)) return;

          const repairReason = getRepairReason();
          if (repairReason) {
            scheduleReconcile(`repair:${repairReason}`);
            return;
          }

          scheduleReconcile(
            state.revealed ? 'mutation:relevant_after_reveal' : 'mutation:relevant_before_reveal',
          );
        });
      }

      observeMainRoot(resolveObservationRoot(snapshot));
    }

    function suppressOwnMutations(ms = 250) {
      state.suppressObserverUntil = performance.now() + ms;
    }

    function scheduleReconcile() {
      if (state.scheduled) return;
      state.scheduled = true;

      requestAnimationFrame(() => {
        state.scheduled = false;
        void reconcile();
      });
    }

    function ensureStableAnchor(snapshot) {
      if (
        !(snapshot?.mountParent instanceof Element) ||
        !snapshot.mountParent.isConnected ||
        !(snapshot?.mountAfterEl instanceof Element) ||
        !snapshot.mountAfterEl.isConnected
      ) {
        return false;
      }

      state.mountedHostParent = snapshot.mountParent;
      state.mountedAnchor = snapshot.mountAfterEl;
      state.composerContainer = snapshot.composerContainer;
      installMainObserver(snapshot);

      return true;
    }

    function withScrollPreserved(fn) {
      const sc = typeof getScrollableContainer === 'function' ? getScrollableContainer() : null;

      const prevDistanceFromBottom = sc ? sc.scrollHeight - sc.scrollTop : 0;
      fn();

      if (sc) {
        sc.scrollTop = sc.scrollHeight - prevDistanceFromBottom;
      }
    }

    function createRoot() {
      let root = document.getElementById('bottomBarContainer');

      if (!(root instanceof HTMLElement)) {
        root = document.createElement('div');
        root.id = 'bottomBarContainer';
      }

      Object.assign(root.style, {
        display: 'block',
        position: '',
        left: '',
        top: '',
        bottom: '',
        width: '100%',
        padding: '0',
        margin: '0',
        minHeight: 'unset',
        lineHeight: '1',
        fontSize: '12px',
        boxSizing: 'border-box',
        opacity: '1',
        transition: 'opacity 0.18s ease',
        visibility: state.revealed ? '' : 'hidden',
        zIndex: '',
        pointerEvents: '',
      });

      root.dataset.pending = state.revealed ? 'false' : 'true';

      if (!root.__cspHoverBound) {
        let fadeT = 0;

        const toIdleOpacity = () => {
          applyIdleOpacity();
          if (typeof setGrayscale === 'function') setGrayscale(true);
        };

        root.addEventListener('mouseover', () => {
          clearTimeout(fadeT);
          if (state.root instanceof HTMLElement) {
            state.root.style.opacity = '1';
          }
          if (state.row instanceof HTMLElement) {
            state.row.style.opacity = '1';
          }
          if (typeof setGrayscale === 'function') setGrayscale(false);
        });

        root.addEventListener('mouseout', () => {
          fadeT = window.setTimeout(toIdleOpacity, 2500);
        });

        root.__cspHoverBound = true;

        window.setTimeout(() => {
          if (root.isConnected) toIdleOpacity();
        }, 2500);
      }

      state.root = root;
      ensureTextScaleWatchers(root);

      return root;
    }

    function ensureTextScaleWatchers(root) {
      if (!state.textScaleResizeHandler) {
        state.textScaleResizeHandler = createDebounce(() => {
          const snapshot = findAnchorSnapshot();
          if (snapshot) {
            syncShellGeometry(snapshot);
          }

          if (state.root instanceof Element) {
            adjustBottomBarTextScaling(state.root);
          }
        }, 100);
      }

      if (!state.textScaleWindowBound) {
        window.addEventListener('resize', state.textScaleResizeHandler);
        state.textScaleWindowBound = true;
      }

      if (state.textScaleObservedRoot === root && state.textScaleResizeObserver) return;

      if (state.textScaleResizeObserver) {
        state.textScaleResizeObserver.disconnect();
      }

      state.textScaleResizeObserver = new ResizeObserver(state.textScaleResizeHandler);
      state.textScaleResizeObserver.observe(root);
      state.textScaleObservedRoot = root;
    }

    function ensureSlot(id, styles) {
      let el = document.getElementById(id);
      if (!(el instanceof HTMLElement)) {
        el = document.createElement('div');
        el.id = id;
      }
      Object.assign(el.style, styles);
      return el;
    }

    function syncShellGeometry(snapshot) {
      if (!(state.root instanceof HTMLElement)) return;
      if (!(snapshot?.composerContainer instanceof Element)) return;

      const width = Math.max(0, Math.round(snapshot.composerContainer.clientWidth * 10) / 10);
      if (!width) return;

      state.root.style.width = `${width}px`;
    }

    function ensureShell(snapshot) {
      if (
        !(snapshot?.mountParent instanceof Element) ||
        !(snapshot?.mountAfterEl instanceof Element)
      ) {
        return null;
      }

      const root = createRoot();

      state.lane = ensureSlot('bottomBarLane', {
        width: '100%',
        boxSizing: 'border-box',
        paddingLeft: '0px',
        paddingRight: '0px',
      });

      state.row = ensureSlot('bottomBarRow', {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        maxWidth: '100%',
        margin: '0',
        padding: '0 12px',
        minHeight: '36px',
        lineHeight: '1',
        fontSize: '12px',
        boxSizing: 'border-box',
        opacity: '1',
        transition: 'opacity 0.18s ease',
      });

      state.left = ensureSlot('bottomBarLeft', {
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        minWidth: '0',
        flex: '0 1 auto',
      });

      state.center = ensureSlot('bottomBarCenter', {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        minWidth: '0',
        flex: '1 1 auto',
      });

      state.right = ensureSlot('bottomBarRight', {
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        minWidth: '0',
        marginLeft: 'auto',
        flex: '0 1 auto',
      });

      if (state.lane.parentElement !== root) root.appendChild(state.lane);
      if (state.row.parentElement !== state.lane) state.lane.appendChild(state.row);

      if (state.left.parentElement !== state.row) state.row.appendChild(state.left);
      if (state.right.parentElement !== state.row) state.row.appendChild(state.right);
      if (state.center.parentElement !== state.row || state.center.nextSibling !== state.right) {
        state.row.insertBefore(state.center, state.right);
      }

      injectStaticButtons(state.left);
      syncShellGeometry(snapshot);
      applyIdleOpacity();

      const mountParent = snapshot.mountParent;
      const mountAfterEl = snapshot.mountAfterEl;
      const needsAttach =
        root.parentElement !== mountParent || root.previousElementSibling !== mountAfterEl;

      if (needsAttach) {
        suppressOwnMutations(350);

        withScrollPreserved(() => {
          mountParent.insertBefore(root, mountAfterEl.nextSibling);
        });

        state.attachCount += 1;
        state.mountedHostParent = mountParent;
        state.mountedAnchor = mountAfterEl;
        state.composerContainer = snapshot.composerContainer;
        state.shellAttachedAt = performance.now();
      } else {
        state.mountedHostParent = mountParent;
        state.mountedAnchor = mountAfterEl;
        state.composerContainer = snapshot.composerContainer;
      }

      return {
        bottomBar: root,
        left: state.left,
        center: state.center,
        right: state.right,
      };
    }

    function resolveMountedSlotNode(slot, preferredNode, previousNode) {
      if (preferredNode instanceof Element) return preferredNode;
      if (
        previousNode instanceof Element &&
        previousNode.isConnected &&
        slot instanceof Element &&
        slot.contains(previousNode)
      ) {
        return previousNode;
      }
      return null;
    }

    function syncSlotContent(slot, node) {
      if (!(slot instanceof Element)) return null;

      let changed = false;

      Array.from(slot.children).forEach((child) => {
        if (child === node) return;
        child.remove();
        changed = true;
      });

      if (!(node instanceof Element)) return null;

      if (node.parentElement !== slot || slot.lastElementChild !== node || changed) {
        suppressOwnMutations(300);
        slot.appendChild(node);
      }

      return node;
    }

    function syncLeftSlotContent(left, node) {
      if (!(left instanceof Element)) return null;

      const keep = new Set(['static-sidebar-btn', 'static-newchat-btn']);

      Array.from(left.children).forEach((child) => {
        if (child === node) return;
        if (keep.has(child.dataset.id)) return;
        child.remove();
      });

      if (!(node instanceof Element)) return null;

      node.style.marginLeft = 'calc(36px - 1em)';

      const newChatButton = left.querySelector('button[data-id="static-newchat-btn"]');
      const alreadyPositioned =
        node.parentElement === left &&
        (!newChatButton || newChatButton.nextElementSibling === node);

      if (!alreadyPositioned) {
        suppressOwnMutations(300);

        if (newChatButton?.nextSibling) {
          left.insertBefore(node, newChatButton.nextSibling);
        } else if (newChatButton) {
          left.appendChild(node);
        } else {
          left.appendChild(node);
        }
      }

      return node;
    }

    function shouldHideTopHeader() {
      return (
        state.revealed &&
        state.left instanceof Element &&
        !!state.modelButton &&
        state.left.contains(state.modelButton) &&
        !findHeaderConversationActions()
      );
    }

    function getRevealDecision(nextModelButton) {
      const hasPrimaryControl = !!nextModelButton || !!state.modelButton;
      const waitedMs = performance.now() - state.shellAttachedAt;
      const waitedLongEnough = waitedMs >= 250;

      if (!hasPrimaryControl && !waitedLongEnough) {
        clearTimeout(state.revealTimer);
        state.revealTimer = window.setTimeout(() => {
          scheduleReconcile('reveal_wait_timeout');
        }, 250);

        return {
          shouldReveal: false,
          reason: 'waiting_for_model_button',
        };
      }

      clearTimeout(state.revealTimer);

      return {
        shouldReveal: true,
        reason: hasPrimaryControl ? 'primary_control_ready' : 'timeout',
      };
    }

    // biome-ignore lint/correctness/noUnusedFunctionParameters: retain revealDecision in the reveal pipeline signature
    function commitReveal(shell, nextModelButton, nextHeaderActions, revealDecision) {
      if (!shell) return;

      state.modelButton = syncLeftSlotContent(
        shell.left,
        resolveMountedSlotNode(shell.left, nextModelButton, state.modelButton),
      );

      state.headerActions = syncSlotContent(
        shell.right,
        resolveMountedSlotNode(shell.right, nextHeaderActions, state.headerActions),
      );

      adjustBottomBarTextScaling(shell.bottomBar);
      hideStaleDisclaimer();

      if (shell.bottomBar instanceof HTMLElement) {
        shell.bottomBar.style.visibility = '';
        shell.bottomBar.dataset.pending = 'false';
      }

      state.revealed = true;

      applyReadyState(shouldHideTopHeader());
    }

    function syncRevealedSlots(shell, nextModelButton, nextHeaderActions) {
      if (!shell) return;

      clearTimeout(state.revealTimer);

      state.modelButton = syncLeftSlotContent(
        shell.left,
        resolveMountedSlotNode(shell.left, nextModelButton, state.modelButton),
      );

      state.headerActions = syncSlotContent(
        shell.right,
        resolveMountedSlotNode(shell.right, nextHeaderActions, state.headerActions),
      );

      adjustBottomBarTextScaling(shell.bottomBar);
      hideStaleDisclaimer();
      applyReadyState(shouldHideTopHeader());
    }

    function getRepairReason() {
      if (!(state.root instanceof Element)) return null;
      if (!state.root.isConnected) return 'root_disconnected';

      if (!(state.left instanceof Element)) return 'left_slot_missing';
      if (!(state.center instanceof Element)) return 'center_slot_missing';
      if (!(state.right instanceof Element)) return 'right_slot_missing';

      if (state.mountedHostParent && !state.mountedHostParent.isConnected) {
        return 'mount_parent_disconnected';
      }

      if (state.mountedAnchor && !state.mountedAnchor.isConnected) {
        return 'anchor_disconnected';
      }

      if (state.mountedHostParent && state.root.parentElement !== state.mountedHostParent) {
        return 'mount_parent_mismatch';
      }

      if (state.mountedAnchor && state.root.previousElementSibling !== state.mountedAnchor) {
        return 'anchor_mismatch';
      }

      if (!state.left.querySelector('button[data-id="static-sidebar-btn"]')) {
        return 'static_sidebar_missing';
      }

      if (!state.left.querySelector('button[data-id="static-newchat-btn"]')) {
        return 'static_newchat_missing';
      }

      if (state.modelButton instanceof Element) {
        if (!state.modelButton.isConnected) return 'model_button_disconnected';
        if (!state.left.contains(state.modelButton)) return 'model_button_unmounted';
      }

      if (state.headerActions instanceof Element) {
        if (!state.headerActions.isConnected) return 'header_actions_disconnected';
        if (!state.right.contains(state.headerActions)) return 'header_actions_unmounted';
      }

      return null;
    }

    function nodeIsInsideBottomBar(node) {
      const el =
        node instanceof Element
          ? node
          : node && node.parentElement instanceof Element
            ? node.parentElement
            : null;
      return !!(el && el.closest('#bottomBarContainer') === state.root);
    }

    function isInternalBottomBarMutation(mutation) {
      if (!nodeIsInsideBottomBar(mutation.target)) return false;

      const touchedOutside = [...mutation.addedNodes, ...mutation.removedNodes].some(
        (node) => !nodeIsInsideBottomBar(node),
      );

      return !touchedOutside;
    }

    function elementTouchesTrackedNode(element, tracked) {
      return (
        tracked instanceof Element &&
        (element === tracked || element.contains(tracked) || tracked.contains(element))
      );
    }

    function nodeTouchesRelevant(node) {
      if (!(node instanceof Element)) return false;
      if (node.closest('#bottomBarContainer')) return false;

      if (
        RELEVANT_MUTATION_SELECTORS.some(
          (selector) => node.matches(selector) || !!node.querySelector(selector),
        )
      ) {
        return true;
      }

      if (elementTouchesTrackedNode(node, state.mountedAnchor)) return true;
      if (elementTouchesTrackedNode(node, state.composerContainer)) return true;
      if (elementTouchesTrackedNode(node, state.modelButton)) return true;
      if (elementTouchesTrackedNode(node, state.headerActions)) return true;

      return false;
    }

    function isRelevantMutation(mutation) {
      const target = mutation.target instanceof Element ? mutation.target : null;

      if (target && !target.closest('#bottomBarContainer')) {
        if (
          target.closest(SELECTORS.PAGE_HEADER) ||
          target.closest(SELECTORS.THREAD_BOTTOM_CONTAINER) ||
          target.closest(SELECTORS.THREAD_BOTTOM) ||
          target.closest(SELECTORS.COMPOSER_FORM)
        ) {
          return true;
        }

        if (elementTouchesTrackedNode(target, state.mountedAnchor)) return true;
        if (elementTouchesTrackedNode(target, state.composerContainer)) return true;
        if (elementTouchesTrackedNode(target, state.modelButton)) return true;
        if (elementTouchesTrackedNode(target, state.headerActions)) return true;
      }

      return [...mutation.addedNodes, ...mutation.removedNodes].some(nodeTouchesRelevant);
    }

    function maybeStartNonCriticalHelpers() {
      if (state.nonCriticalHelpersStarted || !state.revealed) return;
      state.nonCriticalHelpersStarted = true;

      const run = () => {
        initStripComposerLabels();

        waitForElement(SELECTORS.PROFILE_BUTTON, 12000).then((profileButton) => {
          if (profileButton && !state.profileButtonObserverStarted) {
            state.profileButtonObserverStarted = true;
            applyInitialGrayscale(profileButton);
            observeProfileButton(profileButton);
          }
        });
      };

      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 600 });
      } else {
        window.setTimeout(run, 180);
      }
    }

    async function reconcile() {
      if (state.reconcileRunning) return;

      state.reconcileRunning = true;

      try {
        if (hasLoginButtonPresent()) {
          applyReadyState(false);
          return;
        }

        const snapshot = findAnchorSnapshot();

        if (!snapshot) {
          applyReadyState(false);
          return;
        }

        if (!ensureStableAnchor(snapshot)) {
          applyReadyState(false);
          return;
        }

        const shell = ensureShell(snapshot);
        if (!shell) {
          applyReadyState(false);
          return;
        }

        const nextModelButton = resolveMountedSlotNode(
          shell.left,
          findHeaderModelButton(),
          state.modelButton,
        );

        const nextHeaderActions = resolveMountedSlotNode(
          shell.right,
          findHeaderConversationActions(),
          state.headerActions,
        );

        state.composerContainer = snapshot.composerContainer;

        if (state.revealed) {
          syncRevealedSlots(shell, nextModelButton, nextHeaderActions);
        } else {
          const revealDecision = getRevealDecision(nextModelButton);

          if (revealDecision.shouldReveal) {
            commitReveal(shell, nextModelButton, nextHeaderActions, revealDecision);
          } else {
            applyReadyState(false);
          }
        }

        maybeStartNonCriticalHelpers();
      } finally {
        state.reconcileRunning = false;
      }
    }

    return { start };
  }

  // -------------------- Shared helpers used after controller starts --------------------

  function waitForElement(selector, timeout = 12000) {
    const existing = document.querySelector(selector);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const root = document.body || document.documentElement;
      if (!root) {
        resolve(null);
        return;
      }

      let done = false;

      const finish = (el) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        observer.disconnect();
        resolve(el || null);
      };

      const timer = window.setTimeout(() => finish(null), timeout);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) finish(el);
      });

      observer.observe(root, {
        childList: true,
        subtree: true,
      });
    });
  }

  function nodeMatchesSelector(node, selector) {
    return node instanceof Element && (node.matches(selector) || !!node.querySelector(selector));
  }

  function observeMountedSelector(selector, onAttach, timeout = 12000) {
    let currentEl = null;
    let detachCurrent = null;

    const attach = (el) => {
      if (!(el instanceof Element) || el === currentEl) return;
      detachCurrent?.();
      currentEl = el;
      const maybeDetach = onAttach(el);
      detachCurrent = typeof maybeDetach === 'function' ? maybeDetach : null;
    };

    const refresh = () => {
      const next = document.querySelector(selector);
      if (next instanceof Element) {
        attach(next);
        return;
      }

      if (currentEl && !currentEl.isConnected) {
        detachCurrent?.();
        detachCurrent = null;
        currentEl = null;
      }
    };

    waitForElement(selector, timeout).then((el) => {
      if (el) attach(el);
    });

    const root = document.body || document.documentElement;
    if (!root) return;

    const observer = new MutationObserver((mutations) => {
      if (currentEl && !currentEl.isConnected) {
        refresh();
        return;
      }

      const touchesSelector = mutations.some(
        (mutation) =>
          Array.from(mutation.addedNodes).some((node) => nodeMatchesSelector(node, selector)) ||
          Array.from(mutation.removedNodes).some((node) => nodeMatchesSelector(node, selector)),
      );

      if (touchesSelector) refresh();
    });

    observer.observe(root, { childList: true, subtree: true });
    refresh();
  }

  // -------------------- Static buttons --------------------

  function injectStaticButtons(leftContainer) {
    let btnSidebar = leftContainer.querySelector('button[data-id="static-sidebar-btn"]');
    if (!btnSidebar) {
      btnSidebar = createStaticButton({
        label: 'Static Toggle Sidebar',
        svg: '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M8.85720 3H15.1428C16.2266 2.99999 17.1007 2.99998 17.8086 3.05782C18.5375 3.11737 19.1777 3.24318 19.77 3.54497C20.7108 4.02433 21.4757 4.78924 21.955 5.73005C22.2568 6.32234 22.3826 6.96253 22.4422 7.69138C22.5 8.39925 22.5 9.27339 22.5 10.3572V13.6428C22.5 14.7266 22.5 15.6008 22.4422 16.3086C22.3826 17.0375 22.2568 17.6777 21.955 18.27C21.4757 19.2108 20.7108 19.9757 19.77 20.455C19.1777 20.7568 18.5375 20.8826 17.8086 20.9422C17.1008 21 16.2266 21 15.1428 21H8.85717C7.77339 21 6.89925 21 6.19138 20.9422C5.46253 20.8826 4.82234 20.7568 4.23005 20.455C3.28924 19.9757 2.52433 19.2108 2.04497 18.27C1.74318 17.6777 1.61737 17.0375 1.55782 16.3086C1.49998 15.6007 1.49999 14.7266 1.5 13.6428V10.3572C1.49999 9.27341 1.49998 8.39926 1.55782 7.69138C1.61737 6.96253 1.74318 6.32234 2.04497 5.73005C2.52433 4.78924 3.28924 4.02433 4.23005 3.54497C4.82234 3.24318 5.46253 3.11737 6.19138 3.05782C6.89926 2.99998 7.77341 2.99999 8.85719 3ZM6.35424 5.05118C5.74907 5.10062 5.40138 5.19279 5.13803 5.32698C4.57354 5.6146 4.1146 6.07354 3.82698 6.63803C3.69279 6.90138 3.60062 7.24907 3.55118 7.85424C3.50078 8.47108 3.5 9.26339 3.5 10.4V13.6C3.5 14.7366 3.50078 15.5289 3.55118 16.1458C3.60062 16.7509 3.69279 17.0986 3.82698 17.362C4.1146 17.9265 4.57354 18.3854 5.13803 18.673C5.40138 18.8072 5.74907 18.8994 6.35424 18.9488C6.97108 18.9992 7.76339 19 8.9 19H9.5V5H8.9C7.76339 5 6.97108 5.00078 6.35424 5.05118ZM11.5 5V19H15.1C16.2366 19 17.0289 18.9992 17.6458 18.9488C18.2509 18.8994 18.5986 18.8072 18.862 18.673C19.4265 18.3854 19.8854 17.9265 20.173 17.362C20.3072 17.0986 20.3994 16.7509 20.4488 16.1458C20.4992 15.5289 20.5 14.7366 20.5 13.6V10.4C20.5 9.26339 20.4992 8.47108 20.4488 7.85424C20.3994 7.24907 20.3072 6.90138 20.173 6.63803C19.8854 6.07354 19.4265 5.6146 18.862 5.32698C18.5986 5.19279 18.2509 5.10062 17.6458 5.05118C17.0289 5.00078 16.2366 5 15.1 5H11.5ZM5 8.5C5 7.94772 5.44772 7.5 6 7.5H7C7.55229 7.5 8 7.94772 8 8.5C8 9.05229 7.55229 9.5 7 9.5H6C5.44772 9.5 5 9.05229 5 8.5ZM5 12C5 11.4477 5.44772 11 6 11H7C7.55229 11 8 11.4477 8 12C8 12.5523 7.55229 13 7 13H6C5.44772 13 5 12.5523 5 12Z"/></svg>',
        activate: () => window.triggerNativeSidebarToggleButton?.(),
      });
      leftContainer.insertBefore(btnSidebar, leftContainer.firstChild);
    }

    let btnNewChat = leftContainer.querySelector('button[data-id="static-newchat-btn"]');
    if (!btnNewChat) {
      btnNewChat = createStaticButton({
        label: 'Static New Chat',
        svg: '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M15.6730 3.91287C16.8918 2.69392 18.8682 2.69392 20.0871 3.91287C21.3061 5.13182 21.3061 7.10813 20.0871 8.32708L14.1499 14.2643C13.3849 15.0293 12.3925 15.5255 11.3215 15.6785L9.14142 15.9899C8.82983 16.0344 8.51546 15.9297 8.29289 15.7071C8.07033 15.4845 7.96554 15.1701 8.01005 14.8586L8.32149 12.6785C8.47449 11.6075 8.97072 10.615 9.7357 9.85006L15.6729 3.91287ZM18.6729 5.32708C18.235 4.88918 17.525 4.88918 17.0871 5.32708L11.1499 11.2643C10.6909 11.7233 10.3932 12.3187 10.3014 12.9613L10.1785 13.8215L11.0386 13.6986C11.6812 13.6068 12.2767 13.3091 12.7357 12.8501L18.6729 6.91287C19.1108 6.47497 19.1108 5.76499 18.6729 5.32708ZM11 3.99929C11.0004 4.55157 10.5531 4.99963 10.0008 5.00007C9.00227 5.00084 8.29769 5.00827 7.74651 5.06064C7.20685 5.11191 6.88488 5.20117 6.63803 5.32695C6.07354 5.61457 5.6146 6.07351 5.32698 6.63799C5.19279 6.90135 5.10062 7.24904 5.05118 7.8542C5.00078 8.47105 5 9.26336 5 10.4V13.6C5 14.7366 5.00078 15.5289 5.05118 16.1457C5.10062 16.7509 5.19279 17.0986 5.32698 17.3619C5.6146 17.9264 6.07354 18.3854 6.63803 18.673C6.90138 18.8072 7.24907 18.8993 7.85424 18.9488C8.47108 18.9992 9.26339 19 10.4 19H13.6C14.7366 19 15.5289 18.9992 16.1458 18.9488C16.7509 18.8993 17.0986 18.8072 17.362 18.673C17.9265 18.3854 18.3854 17.9264 18.673 17.3619C18.7988 17.1151 18.8881 16.7931 18.9393 16.2535C18.9917 15.7023 18.9991 14.9977 18.9999 13.9992C19.0003 13.4469 19.4484 12.9995 20.0007 13C20.553 13.0004 21.0003 13.4485 20.9999 14.0007C20.9991 14.9789 20.9932 15.7808 20.9304 16.4426C20.8664 17.116 20.7385 17.7136 20.455 18.2699C19.9757 19.2107 19.2108 19.9756 18.27 20.455C17.6777 20.7568 17.0375 20.8826 16.3086 20.9421C15.6008 21 14.7266 21 13.6428 21H10.3572C9.27339 21 8.39925 21 7.69138 20.9421C6.96253 20.8826 6.32234 20.7568 5.73005 20.455C4.78924 19.9756 4.02433 19.2107 3.54497 18.2699C3.24318 17.6776 3.11737 17.0374 3.05782 16.3086C2.99998 15.6007 2.99999 14.7266 3 13.6428V10.3572C2.99999 9.27337 2.99998 8.39922 3.05782 7.69134C3.11737 6.96249 3.24318 6.3223 3.54497 5.73001C4.02433 4.7892 4.78924 4.0243 5.73005 3.54493C6.28633 3.26149 6.88399 3.13358 7.55735 3.06961C8.21919 3.00673 9.02103 3.00083 9.99922 3.00007C10.5515 2.99964 10.9996 3.447 11 3.99929Z"/></svg>',
        activate: () => window.triggerNativeNewConversationButton?.(),
      });
      leftContainer.insertBefore(btnNewChat, btnSidebar.nextSibling);
    }
  }

  function createStaticButton({ label, svg, activate }) {
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', label);
    btn.setAttribute(
      'data-id',
      label.toLowerCase().includes('sidebar') ? 'static-sidebar-btn' : 'static-newchat-btn',
    );

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

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (typeof activate === 'function') activate();
    };

    return btn;
  }

  // -------------------- Grayscale Profile Button --------------------

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
      const newBtn = document.querySelector(SELECTORS.PROFILE_BUTTON);
      if (newBtn && newBtn !== profileBtnRef) {
        applyInitialGrayscale(newBtn);
      }
    });
    observer.observe(parent, { childList: true, subtree: false });
  }

  // -------------------- Bottom bar text handling --------------------

  function applyOneLineEllipsis(el) {
    el.style.setProperty('white-space', 'nowrap', 'important');
    el.style.setProperty('overflow', 'hidden', 'important');
    el.style.setProperty('text-overflow', 'ellipsis', 'important');
  }

  function adjustBottomBarTextScaling(bar) {
    if (!(bar instanceof Element)) return;

    bar.querySelectorAll('.truncate').forEach((el) => {
      if (el.closest('button[data-id="static-sidebar-btn"],button[data-id="static-newchat-btn"]')) {
        return;
      }
      applyOneLineEllipsis(el);
    });
  }

  function hideStaleDisclaimer() {
    const warning =
      window.__cspFindLiveDisclaimerNode?.() ||
      document.querySelector('[data-id="hide-this-warning"]') ||
      document.querySelector(
        'div.text-token-text-secondary.relative.mt-auto.flex.min-h-8.w-full.items-center.justify-center.p-2.text-center.text-xs',
      );

    if (warning instanceof HTMLElement) {
      warning.style.display = 'none';
    }
  }

  // -------------------- Remove Composer Button Labels (deferred) --------------------

  function initStripComposerLabels() {
    const ACTION_WRAPPER =
      '[style*="--vt-composer-search-action"],[style*="--vt-composer-research-action"]';
    const IMAGE_BUTTON = 'button[data-testid="composer-button-create-image"]';
    const debounce = createDebounce;

    const stripLabel = (btn) => {
      btn.querySelectorAll('span, div').forEach((node) => {
        if (node.querySelector('svg') || node.dataset.labelStripped) return;

        node.dataset.labelStripped = 'true';

        if (window.gsap?.to) {
          gsap.to(node, {
            opacity: 0,
            duration: 0.15,
            ease: 'sine.out',
            onComplete: () => node.remove(),
          });
        } else {
          node.style.opacity = '0';
          node.remove();
        }
      });
    };

    const scan = (root) => {
      if (!(root instanceof Element) && root !== document) return;

      root.querySelectorAll(ACTION_WRAPPER).forEach((wrp) => {
        const btn = wrp.querySelector('button');
        if (btn) stripLabel(btn);
      });

      root.querySelectorAll(IMAGE_BUTTON).forEach((btn) => {
        stripLabel(btn);
      });
    };

    observeMountedSelector(SELECTORS.COMPOSER_FORM, (composerForm) => {
      const debouncedScan = debounce(() => scan(composerForm), 60);

      scan(composerForm);

      const observer = new MutationObserver((mutations) => {
        const hasRelevantMutations = mutations.some(
          (mutation) =>
            mutation.target instanceof Element &&
            mutation.target.closest(SELECTORS.COMPOSER_FORM) === composerForm &&
            (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0),
        );

        if (hasRelevantMutations) debouncedScan();
      });

      observer.observe(composerForm, { childList: true, subtree: true });

      return () => observer.disconnect();
    });
  }

  // -------------------- Boot --------------------

  chrome.storage.sync.get(
    { moveTopBarToBottomCheckbox: false },
    ({ moveTopBarToBottomCheckbox: enabled }) => {
      if (!enabled) {
        clearReadyState();
        return;
      }

      if (isExcludedTopBarToBottomPath()) {
        clearReadyState();
        return;
      }

      if (hasLoginButtonPresent()) {
        clearReadyState();
        return;
      }

      const boot = () => {
        injectBottomBarStyles();
        window.__cspEnsureDisclaimerHider?.();
        createBottomBarController().start();
      };

      if (document.body || document.readyState !== 'loading') {
        boot();
      } else {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
      }
    },
  );
})();

// ==================================================
// @note styles when there is no bottombar (unchecked)
// ==================================================

(() => {
  chrome.storage.sync.get(
    { moveTopBarToBottomCheckbox: false },
    ({ moveTopBarToBottomCheckbox: enabled }) => {
      if (enabled) return; // Feature runs ONLY if NOT enabled
      const DISABLE_LEGACY_NO_BOTTOM_BAR_COMPOSER_PULLDOWN = true;

      (() => {
        setTimeout(function injectNoBottomBarStyles() {
          const style = document.createElement('style');
          style.textContent = `
${DISABLE_LEGACY_NO_BOTTOM_BAR_COMPOSER_PULLDOWN ? '' : `
                        form.w-full[data-type="unified-composer"] {
                            margin-bottom: -1em;
                        }
`}

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

          window.__cspEnsureDisclaimerHider?.();
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
  const TRY_AGAIN_RELEVANT_SELECTOR = `${containerSel}, button.btn-secondary`;

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

  function scheduleTryAgainFlush(callback) {
    if (typeof window.requestIdleCallback === 'function') {
      return window.requestIdleCallback(callback, { timeout: 500 });
    }
    return window.setTimeout(callback, 80);
  }

  let flushHandle = 0;
  const pendingRoots = [];

  function collectTryAgainContainers(root) {
    if (!(root instanceof Element)) return [];
    const containers = new Set();
    if (root.matches(containerSel)) containers.add(root);
    if (root.matches('button.btn-secondary')) {
      const closest = root.closest(containerSel);
      if (closest) containers.add(closest);
    }
    root.querySelectorAll(TRY_AGAIN_RELEVANT_SELECTOR).forEach((match) => {
      const container = match.matches(containerSel) ? match : match.closest(containerSel);
      if (container) containers.add(container);
    });
    return Array.from(containers);
  }

  function queueTryAgainRoot(root) {
    if (!(root instanceof Element)) return;
    if (!root.matches(TRY_AGAIN_RELEVANT_SELECTOR) && root.childElementCount === 0) return;

    for (let i = pendingRoots.length - 1; i >= 0; i--) {
      const pending = pendingRoots[i];
      if (!(pending instanceof Element) || !pending.isConnected) {
        pendingRoots.splice(i, 1);
        continue;
      }
      if (pending === root || pending.contains(root)) return;
      if (root.contains(pending)) pendingRoots.splice(i, 1);
    }

    pendingRoots.push(root);
    if (flushHandle) return;
    flushHandle = scheduleTryAgainFlush(() => {
      flushHandle = 0;
      const roots = pendingRoots.splice(0, pendingRoots.length);
      const containers = new Set();
      roots.forEach((candidateRoot) => {
        collectTryAgainContainers(candidateRoot).forEach((container) => {
          containers.add(container);
        });
      });
      containers.forEach((container) => {
        if (!(container instanceof HTMLElement) || !container.isConnected) return;
        container.classList.add('visible');
        window.setTimeout(() => {
          if (!container.isConnected) return;
          container.querySelector(btnSel)?.click();
          container.classList.remove('visible');
        }, 0);
      });
    });
  }

  // 3) Initial pass in case it’s already there
  document.querySelectorAll(containerSel).forEach((node) => {
    queueTryAgainRoot(node);
  });

  // 4) Watch for new ones
  new MutationObserver((muts) => {
    for (const { addedNodes } of muts) {
      addedNodes.forEach(queueTryAgainRoot);
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
  const LINK_CANDIDATE_SELECTOR = 'a.btn-primary, a[rel][target]';
  const pendingOpenLinkRoots = [];
  let openLinkFlushHandle = 0;

  /**
   * Checks if a node or its descendants have an <a> with the target text
   * and performs the click if found.
   */
  function tryClickOpenLink(node) {
    // Only Element nodes
    if (node.nodeType !== 1) return;
    if (!(node instanceof Element)) return;

    // Helper for quick text check
    function findButton(root) {
      // Check for <a> with child div containing our BUTTON_TEXT
      // We assume (as in your HTML) structure:
      //    <a ...><div>Open link</div></a>
      const anchors = root.querySelectorAll(LINK_CANDIDATE_SELECTOR);
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

    if (!node.matches(LINK_CANDIDATE_SELECTOR) && !node.querySelector(LINK_CANDIDATE_SELECTOR)) {
      return;
    }

    // Check self, then descendants. This is cheap for typical small dialog nodes.
    let btn = null;
    if (node.matches(LINK_CANDIDATE_SELECTOR) && node.textContent.trim() === BUTTON_TEXT) {
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

  function flushOpenLinkRoots() {
    openLinkFlushHandle = 0;
    const roots = pendingOpenLinkRoots.splice(0, pendingOpenLinkRoots.length);
    roots.forEach((root) => {
      tryClickOpenLink(root);
    });
  }

  function queueOpenLinkRoot(root) {
    if (!(root instanceof Element)) return;
    if (!root.matches(LINK_CANDIDATE_SELECTOR) && root.childElementCount === 0) return;

    for (let i = pendingOpenLinkRoots.length - 1; i >= 0; i--) {
      const pending = pendingOpenLinkRoots[i];
      if (!(pending instanceof Element) || !pending.isConnected) {
        pendingOpenLinkRoots.splice(i, 1);
        continue;
      }
      if (pending === root || pending.contains(root)) return;
      if (root.contains(pending)) pendingOpenLinkRoots.splice(i, 1);
    }

    pendingOpenLinkRoots.push(root);
    if (openLinkFlushHandle) return;
    openLinkFlushHandle = window.setTimeout(flushOpenLinkRoots, 30);
  }

  // --- Observe only child additions (very cheap) ---
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        queueOpenLinkRoot(n);
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

// ====================================
// @note ModelSwitcherKeyboardShortcuts
// with Dynamic Labeling and Persistent Mapping
// ====================================
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
  const LEGACY_MODEL_MENU_BTN_SELECTOR = 'button[data-testid="model-switcher-dropdown-button"]';
  const COMPOSER_MODEL_MENU_BTN_SELECTOR =
    '[data-composer-surface="true"] button.__composer-pill[aria-haspopup="menu"][id^="radix-"]';
  const MENU_BTN_SELECTOR = [
    LEGACY_MODEL_MENU_BTN_SELECTOR,
    COMPOSER_MODEL_MENU_BTN_SELECTOR,
  ].join(', ');
  const MODEL_MENU_SELECTOR = '[data-radix-menu-content][data-state="open"][role="menu"]';
  const MODEL_MENU_ITEM_SELECTOR =
    ':scope > :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"])[data-radix-collection-item], ' +
    ':scope > :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"]), ' +
    ':scope > * > :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"])[data-radix-collection-item], ' +
    ':scope > * > :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"])';
  const THINKING_EFFORT_OPTION_IDS = [
    'thinking-standard',
    'thinking-extended',
    'thinking-light',
    'thinking-heavy',
  ];
  const escapeSelectorValue = (value) => {
    try {
      return CSS?.escape ? CSS.escape(String(value)) : String(value);
    } catch {
      return String(value);
    }
  };
  const getModelActionSlots = () =>
    typeof window.ModelLabels?.getActionSlots === 'function'
      ? window.ModelLabels.getActionSlots()
      : [];
  const isUsablyVisibleElement = (el) => {
    if (!(el instanceof Element) || !el.isConnected) return false;
    try {
      const style = window.getComputedStyle?.(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    } catch { }
    return Array.from(el.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
  };
  const getModelMenuButton = () => {
    const candidates = Array.from(document.querySelectorAll(MENU_BTN_SELECTOR));
    if (!candidates.length) return null;
    const visible = candidates.filter(isUsablyVisibleElement);
    return (
      visible.find((el) => el.matches(LEGACY_MODEL_MENU_BTN_SELECTOR)) ||
      visible.find((el) => el.matches(COMPOSER_MODEL_MENU_BTN_SELECTOR)) ||
      visible[0] ||
      candidates[0] ||
      null
    );
  };
  const getModelActionBySlot = (slot) => {
    const staticAction =
      typeof window.ModelLabels?.getActionBySlot === 'function'
        ? window.ModelLabels.getActionBySlot(slot)
        : null;
    if (staticAction) return staticAction;
    const catalog = window.__modelCatalog || null;
    if (!catalog || typeof window.ModelLabels?.getPopupPresentationGroups !== 'function') return null;
    const activeModelConfigId = window.__activeModelConfigId || DEFAULT_ACTIVE_MODEL_CONFIG_ID;
    const groups = window.ModelLabels.getPopupPresentationGroups(
      activeModelConfigId,
      window.MODEL_NAMES || [],
      catalog,
    );
    return (
      groups
        .flatMap((group) => (Array.isArray(group?.actions) ? group.actions : []))
        .find((action) => Number(action?.slot) === Number(slot)) || null
    );
  };
  const getModelActionById = (id) => {
    const action =
      typeof window.ModelLabels?.getActionById === 'function'
        ? window.ModelLabels.getActionById(id)
        : null;
    if (action) return action;
    if (/^configure-dynamic-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(id || '').trim())) {
      return {
        id: String(id || '').trim(),
        slot: -1,
        group: 'configure',
        label: '',
        actionKind: 'configure-option',
        optionKind: 'dynamic-id',
      };
    }
    return null;
  };
  const DEFAULT_ACTIVE_MODEL_CONFIG_ID =
    typeof window.ModelLabels?.DEFAULT_ACTIVE_CONFIG_ID === 'string'
      ? window.ModelLabels.DEFAULT_ACTIVE_CONFIG_ID
      : 'configure-latest';
  const normalizeActiveModelConfigId = (value) =>
    typeof window.ModelLabels?.normalizeActiveConfigId === 'function'
      ? window.ModelLabels.normalizeActiveConfigId(value)
      : [
        'configure-latest',
        'configure-5-2',
        'configure-5-0-thinking-mini',
        'configure-o3',
      ].includes(String(value || '').trim())
        ? String(value || '').trim()
        : DEFAULT_ACTIVE_MODEL_CONFIG_ID;
  // biome-ignore lint/correctness/noUnusedVariables: retain local cache mirror during model-picker cleanup
  let ACTIVE_MODEL_CONFIG_ID = DEFAULT_ACTIVE_MODEL_CONFIG_ID;
  let LAST_PERSISTED_ACTIVE_MODEL_CONFIG_ID = DEFAULT_ACTIVE_MODEL_CONFIG_ID;
  const getDefaultModelPickerCodes = () =>
    typeof window.ModelLabels?.defaultKeyCodes === 'function'
      ? window.ModelLabels.defaultKeyCodes()
      : (() => {
        const out = new Array(MAX_SLOTS).fill('');
        out[0] = 'Digit1';
        out[1] = 'Digit2';
        out[2] = 'Digit0';
        out[3] = 'Digit3';
        out[4] = 'Digit4';
        out[5] = 'Digit5';
        out[6] = 'Digit6';
        return out;
      })();
  const sleepAsync =
    typeof sleep === 'function' ? sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const smartClickSafe =
    typeof smartClick === 'function'
      ? smartClick
      : (el) => {
        if (!el) return false;
        try {
          el.click?.();
          return true;
        } catch {
          return false;
        }
      };
  const waitForAsync =
    typeof waitFor === 'function'
      ? waitFor
      : async (getter, { timeout = 3000, interval = 50 } = {}) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
          const result = getter();
          if (result) return result;
          await sleepAsync(interval);
        }
        return null;
      };
  // biome-ignore lint/correctness/noUnusedVariables: retain compatibility helper for follow-on model picker work
  const clickButtonByTestIdSafe =
    typeof clickButtonByTestId === 'function'
      ? clickButtonByTestId
      : async (
        testId,
        { timeout = 2000, interval = 50, pick = (nodes) => nodes[0], root = document } = {},
      ) => {
        const target = await waitForAsync(
          () => {
            const matches = Array.from(root.querySelectorAll(`[data-testid="${testId}"]`));
            if (!matches.length) return null;
            return pick(matches) || matches[0] || null;
          },
          { timeout, interval },
        );
        if (!target) return;
        if (typeof flashBorder === 'function') flashBorder(target);
        await sleepAsync(90);
        smartClickSafe(target);
      };
  const waitForButtonByTestIdSafe = async (
    testId,
    { timeout = 2000, interval = 50, pick = (nodes) => nodes[0], root = document } = {},
  ) =>
    waitForAsync(
      () => {
        const matches = Array.from(root.querySelectorAll(`[data-testid="${testId}"]`));
        if (!matches.length) return null;
        return pick(matches) || matches[0] || null;
      },
      { timeout, interval },
    );
  const setCachedActiveModelConfigId = (value) => {
    const next = normalizeActiveModelConfigId(value);
    ACTIVE_MODEL_CONFIG_ID = next;
    window.__activeModelConfigId = next;
    return next;
  };
  const persistActiveModelConfigId = (value) => {
    const next = setCachedActiveModelConfigId(value);
    if (next === LAST_PERSISTED_ACTIVE_MODEL_CONFIG_ID) return next;
    LAST_PERSISTED_ACTIVE_MODEL_CONFIG_ID = next;
    try {
      chrome.storage.sync.set({ activeModelConfigId: next }, () => { });
    } catch { }
    return next;
  };
  const MODEL_CATALOG_STORAGE_KEY = 'modelCatalog';
  let SCRAPE_HIDE_UI_ACTIVE = false;
  const SCRAPE_HIDDEN_ELEMENTS = new Set();
  const PREPARED_SESSION_HIDDEN_ELEMENTS = new Set();
  let PREPARED_MODEL_CONFIG_SESSION = null;
  const hideLiveScrapeElement = (el) => {
    if (!SCRAPE_HIDE_UI_ACTIVE || !(el instanceof Element) || SCRAPE_HIDDEN_ELEMENTS.has(el))
      return;
    SCRAPE_HIDDEN_ELEMENTS.add(el);
    if (!el.hasAttribute('data-csp-scrape-inline-visibility'))
      el.setAttribute('data-csp-scrape-inline-visibility', el.style.visibility || '');
    if (!el.hasAttribute('data-csp-scrape-inline-pointer-events'))
      el.setAttribute('data-csp-scrape-inline-pointer-events', el.style.pointerEvents || '');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  };
  const clearHiddenLiveScrapeElements = () => {
    SCRAPE_HIDDEN_ELEMENTS.forEach((el) => {
      if (!(el instanceof Element)) return;
      const prevVisibility = el.getAttribute('data-csp-scrape-inline-visibility');
      const prevPointerEvents = el.getAttribute('data-csp-scrape-inline-pointer-events');
      if (prevVisibility != null) {
        if (prevVisibility) el.style.visibility = prevVisibility;
        else el.style.removeProperty('visibility');
        el.removeAttribute('data-csp-scrape-inline-visibility');
      }
      if (prevPointerEvents != null) {
        if (prevPointerEvents) el.style.pointerEvents = prevPointerEvents;
        else el.style.removeProperty('pointer-events');
        el.removeAttribute('data-csp-scrape-inline-pointer-events');
      }
    });
    SCRAPE_HIDDEN_ELEMENTS.clear();
  };
  const hidePreparedSessionElement = (el) => {
    if (!(el instanceof Element) || PREPARED_SESSION_HIDDEN_ELEMENTS.has(el)) return;
    PREPARED_SESSION_HIDDEN_ELEMENTS.add(el);
    if (!el.hasAttribute('data-csp-prepared-inline-visibility'))
      el.setAttribute('data-csp-prepared-inline-visibility', el.style.visibility || '');
    if (!el.hasAttribute('data-csp-prepared-inline-pointer-events'))
      el.setAttribute('data-csp-prepared-inline-pointer-events', el.style.pointerEvents || '');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  };
  const clearPreparedSessionHiddenElements = () => {
    PREPARED_SESSION_HIDDEN_ELEMENTS.forEach((el) => {
      if (!(el instanceof Element)) return;
      const prevVisibility = el.getAttribute('data-csp-prepared-inline-visibility');
      const prevPointerEvents = el.getAttribute('data-csp-prepared-inline-pointer-events');
      if (prevVisibility != null) {
        if (prevVisibility) el.style.visibility = prevVisibility;
        else el.style.removeProperty('visibility');
        el.removeAttribute('data-csp-prepared-inline-visibility');
      }
      if (prevPointerEvents != null) {
        if (prevPointerEvents) el.style.pointerEvents = prevPointerEvents;
        else el.style.removeProperty('pointer-events');
        el.removeAttribute('data-csp-prepared-inline-pointer-events');
      }
    });
    PREPARED_SESSION_HIDDEN_ELEMENTS.clear();
  };
  const withTemporarilyHiddenModelUi = async (enabled, task) => {
    const previousHideState = SCRAPE_HIDE_UI_ACTIVE;
    if (enabled) SCRAPE_HIDE_UI_ACTIVE = true;
    try {
      return await task();
    } finally {
      SCRAPE_HIDE_UI_ACTIVE = previousHideState;
      if (!SCRAPE_HIDE_UI_ACTIVE) clearHiddenLiveScrapeElements();
    }
  };
  const getPreparedModelConfigSession = () => {
    const session = PREPARED_MODEL_CONFIG_SESSION;
    const combobox = session?.combobox;
    const dialog = combobox?.closest?.('[role="dialog"]');
    if (
      !(combobox instanceof Element) ||
      !combobox.isConnected ||
      !(dialog instanceof Element) ||
      !dialog.isConnected
    ) {
      PREPARED_MODEL_CONFIG_SESSION = null;
      clearPreparedSessionHiddenElements();
      return null;
    }
    return session;
  };
  const setPreparedModelConfigSession = (combobox, activeConfigId) => {
    if (!(combobox instanceof Element) || !combobox.isConnected) {
      PREPARED_MODEL_CONFIG_SESSION = null;
      return null;
    }
    const dialog = combobox.closest?.('[role="dialog"]');
    if (dialog) hidePreparedSessionElement(dialog);
    PREPARED_MODEL_CONFIG_SESSION = {
      combobox,
      activeConfigId: normalizeActiveModelConfigId(activeConfigId),
      preparedAt: Date.now(),
    };
    return PREPARED_MODEL_CONFIG_SESSION;
  };
  const releasePreparedModelConfigSession = async () => {
    const session = getPreparedModelConfigSession();
    PREPARED_MODEL_CONFIG_SESSION = null;
    if (!session) {
      clearHiddenLiveScrapeElements();
      return false;
    }
    const previousHideState = SCRAPE_HIDE_UI_ACTIVE;
    SCRAPE_HIDE_UI_ACTIVE = true;
    try {
      const dialog = session.combobox.closest('[role="dialog"]');
      const closeButton =
        dialog?.querySelector?.('[data-testid="close-button"]') ||
        (await waitForButtonByTestIdSafe('close-button', { timeout: 200, interval: 25 }));
      if (closeButton) smartClickSafe(closeButton);
      await sleepAsync(40);
      return true;
    } catch {
      return false;
    } finally {
      SCRAPE_HIDE_UI_ACTIVE = previousHideState;
      clearPreparedSessionHiddenElements();
      if (!SCRAPE_HIDE_UI_ACTIVE) clearHiddenLiveScrapeElements();
    }
  };

  const normModelTid = (tid) =>
    typeof window.ModelLabels?.normTid === 'function'
      ? window.ModelLabels.normTid(tid)
      : String(tid || '')
        .toLowerCase()
        .trim();

  const getOpenRadixMenus = () =>
    typeof getOpenMenus === 'function'
      ? getOpenMenus()
      : Array.from(document.querySelectorAll(MODEL_MENU_SELECTOR));

  const hasExpandedModelMenuTrigger = () =>
    getModelMenuButton()?.getAttribute('aria-expanded') === 'true';

  const hasOpenModelMenuCandidate = () => {
    const triggerId = getModelMenuButton()?.id || '';
    if (
      triggerId &&
      document.querySelector(
        `${MODEL_MENU_SELECTOR}[aria-labelledby="${escapeSelectorValue(triggerId)}"]`,
      )
    ) {
      return true;
    }

    return !!document.querySelector(
      `${MODEL_MENU_SELECTOR} [data-testid="model-configure-modal"], ` +
      `${MODEL_MENU_SELECTOR} [data-testid^="model-switcher-"]`,
    );
  };

  const isModelMenuLikelyActive = () =>
    hasExpandedModelMenuTrigger() || hasOpenModelMenuCandidate();

  const getDirectModelMenuItems = (menuEl) =>
    menuEl instanceof Element ? Array.from(menuEl.querySelectorAll(MODEL_MENU_ITEM_SELECTOR)) : [];

  const isKnownModelMenuItem = (item) => {
    if (!(item instanceof Element)) return false;
    const tid = normModelTid(item.getAttribute('data-testid'));
    return !!tid && (tid.startsWith('model-switcher-') || tid === 'model-configure-modal');
  };

  const isModelSubmenuTriggerItem = (item) => {
    if (!(item instanceof Element)) return false;
    if (
      typeof window.ModelLabels?.isSubmenuTrigger === 'function' &&
      window.ModelLabels.isSubmenuTrigger(item)
    ) {
      return true;
    }
    const tid = normModelTid(item.getAttribute('data-testid'));
    return !!tid && (tid.endsWith('-submenu') || tid.includes('legacy'));
  };

  const isPrimaryModelMenuElement = (menuEl) => {
    if (!(menuEl instanceof Element)) return false;

    const items = getDirectModelMenuItems(menuEl);
    if (!items.length) return false;

    const labelledby = menuEl.getAttribute('aria-labelledby') || '';
    const triggerId = getModelMenuButton()?.id || '';
    if (triggerId && labelledby === triggerId) return true;

    if (
      items.some(
        (item) => normModelTid(item.getAttribute('data-testid')) === 'model-configure-modal',
      )
    ) {
      return true;
    }

    if (items.some(isKnownModelMenuItem)) return true;

    return false;
  };

  const isNestedModelMenuElement = (menuEl) => {
    if (!(menuEl instanceof Element)) return false;
    if (!getDirectModelMenuItems(menuEl).some(isKnownModelMenuItem)) return false;

    const labelledby = menuEl.getAttribute('aria-labelledby') || '';
    const triggerEl = labelledby ? document.getElementById(labelledby) : null;
    const parentMenu = triggerEl?.closest('[data-radix-menu-content]');
    return !!(parentMenu && isPrimaryModelMenuElement(parentMenu));
  };

  const sortModelMenus = (menus) =>
    menus.slice().sort((a, b) => {
      const aPrimary = isPrimaryModelMenuElement(a);
      const bPrimary = isPrimaryModelMenuElement(b);
      if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;

      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      if (Math.abs(aRect.left - bRect.left) > 1) return aRect.left - bRect.left;
      if (Math.abs(aRect.top - bRect.top) > 1) return aRect.top - bRect.top;
      return 0;
    });

  const getOpenModelMenus = () =>
    sortModelMenus(
      getOpenRadixMenus().filter(
        (menuEl) => isPrimaryModelMenuElement(menuEl) || isNestedModelMenuElement(menuEl),
      ),
    );

  const findModelSubmenuTrigger = (menuEl) => {
    if (!(menuEl instanceof Element)) return null;

    const directItems = getDirectModelMenuItems(menuEl);
    const exact = directItems.find(
      (item) => normModelTid(item.getAttribute('data-testid')) === 'legacy models-submenu',
    );
    if (exact) return exact;

    const candidates = directItems.filter(isModelSubmenuTriggerItem);
    const byTid = candidates.find((item) =>
      normModelTid(item.getAttribute('data-testid')).includes('legacy'),
    );
    if (byTid) return byTid;

    if (candidates.length === 1) return candidates[0];
    return null;
  };

  const getVisibleModelMenuState = () => {
    const menus = getOpenModelMenus();
    const main = menus.find(isPrimaryModelMenuElement) || menus[0] || null;
    const orderedMenus = main ? [main, ...menus.filter((menu) => menu !== main)] : menus.slice();
    const items = [];

    for (let m = 0; m < orderedMenus.length && items.length < MAX_SLOTS; m++) {
      const directItems = getDirectModelMenuItems(orderedMenus[m]);
      const filtered =
        m === 0 ? directItems.filter((item) => !isModelSubmenuTriggerItem(item)) : directItems;
      filtered.forEach((el, idx) => {
        if (items.length < MAX_SLOTS) {
          items.push({ el, menu: m === 0 ? 'main' : 'submenu', idx });
        }
      });
    }

    return {
      menus: orderedMenus,
      main,
      submenuTrigger: findModelSubmenuTrigger(main),
      submenuOpen: orderedMenus.length > 1,
      items,
    };
  };

  // ----- Timing constants (IIFE scope so all closures share them) -----
  // Keydown flow
  const DELAY_MAIN_MENU_SETTLE_OPEN_MS = 30; // was 60 (wait after opening main menu)
  const DELAY_MAIN_MENU_SETTLE_EXPANDED_MS = 0; // when already open

  // Submenu polling loop in keydown flow

  // Activation delay (post-labeling) in keydown flow
  const DELAY_ACTIVATE_TARGET_MS = 375; // was 750
  const DELAY_CONFIGURE_STEP_MS = 70;
  const DELAY_CONFIGURE_CLOSE_MS = 90;
  const DELAY_CONFIGURE_FINAL_CLICK_MS = DELAY_ACTIVATE_TARGET_MS;
  const DELAY_CONFIGURE_COMBOBOX_OPEN_MS = 35;
  const DELAY_CONFIGURE_LISTBOX_QUICK_CHECK_MS = 120;

  // Label scheduling in click flows
  const DELAY_APPLY_HINTS_AFTER_MAIN_MS = 30; // was 60
  const DELAY_APPLY_HINTS_AFTER_SUBMENU_MS = 45; // was 90
  const DELAY_APPLY_HINTS_OBSERVER_MS = 25; // was 50
  const DELAY_APPLY_HINTS_STORAGE_MS = 25; // was 50

  // Optional: micro animation for highlighting menu items
  const ANIM_FLASH_IN_S = 0.11; // was 0.22
  const ANIM_FLASH_OUT_S = 0.075; // was 0.15

  chrome.storage.sync.get(
    ['useControlForModelSwitcherRadio', 'modelPickerKeyCodes', 'activeModelConfigId', 'modelCatalog'],
    ({ useControlForModelSwitcherRadio, modelPickerKeyCodes, activeModelConfigId, modelCatalog }) => {
      // Initialize shared KEY_CODES (mutate the const array to keep references alive)
      const incoming = Array.isArray(modelPickerKeyCodes)
        ? modelPickerKeyCodes.slice(0, MAX_SLOTS)
        : [];
      while (incoming.length < MAX_SLOTS) incoming.push('');
      const effective = incoming.some(Boolean) ? incoming : getDefaultModelPickerCodes();
      KEY_CODES.splice(0, KEY_CODES.length, ...effective);
      const initialActiveModelConfigId = setCachedActiveModelConfigId(activeModelConfigId);
      LAST_PERSISTED_ACTIVE_MODEL_CONFIG_ID = initialActiveModelConfigId;
      window.__modelCatalog = modelCatalog && typeof modelCatalog === 'object' ? modelCatalog : null;

      // Platform + modifier label
      const IS_MAC = /Mac|iPad|iPhone|iPod/.test(navigator.platform);
      const USE_CTRL = !!useControlForModelSwitcherRadio;
      const MOD_KEY_TEXT = USE_CTRL ? (IS_MAC ? 'Command' : 'Ctrl') : IS_MAC ? 'Option' : 'Alt';

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
          const targetOpacity = coerceNumberFromStorage(window.popupBottomBarOpacityValue, 0.6);
          bb.style.opacity = String(targetOpacity);
        };

        bb._flashTimer = setTimeout(idle, 4000);
      };

      const ensureMainMenuOpen = () => {
        const btn = getModelMenuButton();
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

      // Style for shortcut labels
      (() => {
        if (document.getElementById('__altHintStyle')) return;
        const style = document.createElement('style');
        style.id = '__altHintStyle';
        style.textContent = `
                @keyframes csp-alt-hint-fade-in {
                    from {
                        opacity: 0;
                        transform: translateY(2px);
                    }
                    to {
                        opacity: .55;
                        transform: translateY(0);
                    }
                }
                .alt-hint {
                    font-size: 10px;
                    opacity: .55;
                    margin-left: 6px;
                    user-select: none;
                    pointer-events: none;
                    display: inline-flex;
                    align-items: center;
                    animation: csp-alt-hint-fade-in 140ms ease-out;
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

      const getExpectedPrimaryHintTexts = (primaryPairs) =>
        primaryPairs.map(({ action }) => {
          const slot = action?.slot;
          return slot == null ? '' : `${MOD_KEY_TEXT}+${displayFromCode(KEY_CODES[slot])}`;
        });

      const primaryHintsAlreadyApplied = (primaryPairs, expectedHintTexts) => {
        for (let i = 0; i < primaryPairs.length; ++i) {
          const actual = primaryPairs[i]?.item?.el?.querySelector('.alt-hint')?.textContent?.trim() || '';
          if ((expectedHintTexts[i] || '') !== actual) return false;
        }
        return true;
      };

      // --- Ultra-light model-name capture: piggybacks on applyHints ---

      function __cspTextNoHint(el) {
        if (!(el instanceof Element)) return window.ModelLabels.textNoHint(el);
        const clone = el.cloneNode(true);
        clone
          .querySelectorAll('[data-model-picker-thinking-effort-label-extra]')
          .forEach((node) => {
            node.remove();
          });
        return window.ModelLabels.textNoHint(clone);
      }

      const __cspIsSubmenuTrigger = (el) => isModelSubmenuTriggerItem(el);
      const __cspNormTid = (tid) => window.ModelLabels.normTid(tid);
      const inferActiveConfigFromMenuState = (state = getVisibleModelMenuState()) => {
        const items = getPrimaryMenuItems(state).map((item) => ({
          testId: item.el.getAttribute('data-testid') || '',
          text: __cspTextNoHint(item.el),
        }));
        const header = state.main?.querySelector('.__menu-label')?.textContent?.trim() || '';
        return typeof window.ModelLabels?.inferActiveConfigFromMenuState === 'function'
          ? window.ModelLabels.inferActiveConfigFromMenuState({ header, items })
          : DEFAULT_ACTIVE_MODEL_CONFIG_ID;
      };
      const syncActiveConfigFromMenuState = (
        state = getVisibleModelMenuState(),
        { persist = false } = {},
      ) => {
        const inferred = inferActiveConfigFromMenuState(state);
        if (persist) return persistActiveModelConfigId(inferred);
        return setCachedActiveModelConfigId(inferred);
      };
      // Collect up to MAX_SLOTS names across all open model menus (main first, then submenus).
      function __cspCollectModelNamesN() {
        const CAP = MAX_SLOTS;
        const menus = getVisibleModelMenuState().menus.filter(Boolean);

        if (!menus.length) return null;

        const out = [];
        for (const menu of menus) {
          const items = Array.from(menu.querySelectorAll(MODEL_MENU_ITEM_SELECTOR));
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
        const canonFromTid =
          typeof window.ModelLabels.canonFromTid === 'function'
            ? window.ModelLabels.canonFromTid
            : (tid) => (tid && TESTID_CANON[tid]) || '';

        function pickMainMenuLabel(item, index) {
          const tid = __cspNormTid(item.getAttribute('data-testid'));
          const domLabel = __cspTextNoHint(item);
          const canonLabel = canonFromTid(tid) || '';

          // Main-menu rows now change their visible labels without keeping tid parity.
          // Prefer the primary DOM label, then fall back to stable tid-based canon labels.
          if (domLabel) return domLabel;
          if (canonLabel) return canonLabel;
          if (index < MAIN_CANON_BY_INDEX.length) return MAIN_CANON_BY_INDEX[index];
          return '';
        }

        function __cspCanonicalLabelsFromDOM() {
          const CAP = MAX_SLOTS;
          const names = Array(CAP).fill('');
          const menus = getVisibleModelMenuState().menus.filter(Boolean);

          if (!menus.length) return { names, observedCount: 0, complete: false };

          let idx = 0;
          let hasSubmenuTrigger = false;

          // Main menu first
          const main = menus[0];
          if (main) {
            const mainItems = Array.from(main.querySelectorAll(MODEL_MENU_ITEM_SELECTOR));
            for (let i = 0; i < mainItems.length && idx < CAP; i++) {
              const item = mainItems[i];
              let label = '';

              if (__cspIsSubmenuTrigger(item)) {
                label = '→'; // canonical for submenu trigger (not a model)
                hasSubmenuTrigger = true;
              } else {
                label = pickMainMenuLabel(item, i);
              }

              names[idx++] = (label || '').trim();
            }
          }

          // Any additional open menus (submenus) in order
          for (let m = 1; m < menus.length && idx < CAP; m++) {
            const subItems = Array.from(menus[m].querySelectorAll(MODEL_MENU_ITEM_SELECTOR));
            for (const item of subItems) {
              if (idx >= CAP) break;
              const tid = __cspNormTid(item.getAttribute('data-testid'));
              let label = canonFromTid(tid) || '';
              if (!label) {
                const primary = item.querySelector('.flex.items-center.gap-1') || item;
                const txt = __cspTextNoHint(primary);
                label = mapSubmenuLabel(txt) || txt;
              }
              names[idx++] = (label || '').trim();
            }
          }

          // A scrape is "complete" iff:
          // - there is no submenu trigger (single-level menu), OR
          // - a submenu trigger exists and we currently have submenu content open
          const complete = !hasSubmenuTrigger || menus.length > 1;

          while (names.length < CAP) names.push('');
          for (let k = 0; k < names.length; k++) names[k] = (names[k] || '').trim();
          return { names, observedCount: idx, complete };
        }

        function __cspMergeAndPersist(candidates, meta) {
          const now = Date.now();
          try {
            const CAP = MAX_SLOTS;
            const observedCount = Math.max(
              0,
              Math.min(
                CAP,
                Number(meta && meta.observedCount != null ? meta.observedCount : 0) || 0,
              ),
            );
            const complete = !!meta?.complete;
            chrome.storage.sync.get('modelNames', ({ modelNames: prev }) => {
              const prevArr = Array.isArray(prev) ? prev.slice(0, CAP) : Array(CAP).fill('');
              while (prevArr.length < CAP) prevArr.push('');
              const merged = Array.from({ length: CAP }, (_, i) => {
                if (complete && i >= observedCount) return '';
                const nv = (candidates[i] || '').trim();
                const pv = (prevArr[i] || '').trim();
                return nv || pv || '';
              });
              const sig = merged.join('|');
              if (sig === lastSig && now - lastWrite < 1000) return;
              lastSig = sig;
              lastWrite = now;
              chrome.storage.sync.set({ modelNames: merged, modelNamesAt: now }, () => { });
            });
          } catch (_) { }
        }

        return (arrN) => {
          const CAP = MAX_SLOTS;
          const dom = __cspCanonicalLabelsFromDOM();
          const domNames = dom && Array.isArray(dom.names) ? dom.names : Array(CAP).fill('');
          const fallback = Array.isArray(arrN) ? arrN.slice(0, CAP) : Array(CAP).fill('');
          while (fallback.length < CAP) fallback.push('');

          const candidates = Array.from({ length: CAP }, (_, i) => {
            const d = (domNames[i] || '').trim();
            const f = (fallback[i] || '').trim();
            return d || f || '';
          });

          if (!candidates.some(Boolean)) return;
          __cspMergeAndPersist(candidates, dom);
        };
      })();

      function __cspMaybePersistModelNames() {
        const arr = __cspCollectModelNamesN();
        if (arr) __cspSaveModelNames(arr);
      }

      const __cspPersistModelNameRange = (startIdx, values, rangeCount) => {
        const CAP = MAX_SLOTS;
        const start = Math.max(0, Math.min(CAP - 1, Number(startIdx) || 0));
        const count = Math.max(0, Math.min(CAP - start, Number(rangeCount) || 0));
        if (!count) return;

        const incoming = Array.isArray(values) ? values.slice(0, count) : [];
        const normalizeName =
          typeof window.ModelLabels?.normalizeStoredActionName === 'function'
            ? window.ModelLabels.normalizeStoredActionName
            : (_slot, value) => (value ?? '').toString().trim();

        chrome.storage.sync.get('modelNames', ({ modelNames: prev }) => {
          const next = Array.isArray(prev) ? prev.slice(0, CAP) : Array(CAP).fill('');
          while (next.length < CAP) next.push('');
          for (let i = 0; i < count; i++) next[start + i] = '';
          for (let i = 0; i < incoming.length; i++) {
            next[start + i] = normalizeName(start + i, incoming[i]) || '';
          }
          chrome.storage.sync.set({ modelNames: next, modelNamesAt: Date.now() }, () => { });
        });
      };

      // Respond to popup requests for live names (ensures freshness on popup open)
      try {
        chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
          if (msg && msg.type === 'CSP_GET_MODEL_NAMES') {
            const arr = __cspCollectModelNamesN();
            if (arr) __cspSaveModelNames(arr);
            sendResponse({ modelNames: Array.isArray(arr) ? arr : null });
            return;
          }
          if (msg && msg.type === 'CSP_SCRAPE_MODEL_CATALOG') {
            void scrapeModelCatalogOnce({
              hideUi: msg.hideUi !== false,
              keepPreparedSession: msg.keepPreparedSession !== false,
            }).then((result) => {
              sendResponse(result);
            });
            return true;
          }
          if (msg && msg.type === 'CSP_RELEASE_MODEL_CONFIG_SESSION') {
            void releasePreparedModelConfigSession().then(() => {
              sendResponse({ ok: true });
            });
            return true;
          }
          if (msg && msg.type === 'CSP_TRIGGER_MODEL_ACTION') {
            const action = getModelActionById(msg.actionId);
            if (!action) {
              sendResponse({ ok: false, error: 'UNKNOWN_ACTION' });
              return;
            }
            executeModelAction(action, {
              hideUi: msg.hideUi === true,
              preferPreparedSession: msg.preferPreparedSession === true,
            });
            sendResponse({ ok: true });
          }
        });
      } catch (_) { }

      // Get all menu items (main menu + open submenu) in order, capped at MAX_SLOTS.
      // biome-ignore lint/correctness/noUnusedVariables: preserve menu-order helper during model menu iteration work
      function getOrderedMenuItems() {
        return getVisibleModelMenuState().items.slice(0, MAX_SLOTS);
      }

      function getModelVersionFromSwitcherTestId(testId) {
        const tid = normModelTid(testId);
        const match = tid.match(/^model-switcher-gpt-(\d+)(?:-(\d+))?(?:-(?:instant|thinking))?$/);
        if (!match) return '';
        return match[2] ? `${match[1]}.${match[2]}` : match[1];
      }

      function getModelVersionFromFrontendRow(row) {
        if (!(row instanceof Element)) return '';
        const candidates = Array.from(row.querySelectorAll('.text-token-text-tertiary.text-xs'));
        for (const candidate of candidates) {
          const value = __cspTextNoHint(candidate).replace(/\s+/g, ' ').trim();
          if (/^\d+(?:\.\d+)?$/.test(value)) return value;
        }
        return '';
      }

      let latestFrontendActionSignatures = {};

      function getPrimaryActionIdForMenuItem(item, rawItems = []) {
        if (!(item instanceof Element)) return '';
        const tid = normModelTid(item.getAttribute('data-testid'));
        if (tid === 'model-configure-modal') return 'configure';
        if (
          item.hasAttribute('data-model-picker-thinking-effort-menu-item') ||
          /(?:^|-)thinking(?:$|-)/.test(tid)
        ) {
          return 'thinking';
        }
        if (tid.startsWith('model-switcher-')) {
          const unassignedModelRows = rawItems.filter((candidate) => {
            const candidateTid = normModelTid(candidate?.el?.getAttribute('data-testid'));
            return (
              candidateTid.startsWith('model-switcher-') &&
              !candidate?.el?.hasAttribute('data-model-picker-thinking-effort-menu-item') &&
              !/(?:^|-)thinking(?:$|-)/.test(candidateTid)
            );
          });
          if (unassignedModelRows.length === 1 && unassignedModelRows[0]?.el === item) {
            return 'instant';
          }
        }
        return '';
      }

      function collectFrontendActionSignaturesFromPrimaryMenu(rawItems = []) {
        const signatures = {};
        rawItems.forEach((item) => {
          const actionId = getPrimaryActionIdForMenuItem(item.el, rawItems);
          if (!actionId || actionId === 'configure') return;
          const modelVersion = getModelVersionFromSwitcherTestId(item.el.getAttribute('data-testid'));
          if (!modelVersion) return;
          signatures[actionId] = { modelVersion };
        });
        latestFrontendActionSignatures = {
          ...latestFrontendActionSignatures,
          ...signatures,
        };
        return signatures;
      }

      function getPrimaryMenuItems(state = getVisibleModelMenuState()) {
        return getPrimaryMenuActionPairs(state).map((pair) => pair.item);
      }

      function getPrimaryMenuActionPairs(state = getVisibleModelMenuState()) {
        const rawItems = (state.items || []).filter((item) => item.menu === 'main');
        const activeModelConfigId = window.__activeModelConfigId || DEFAULT_ACTIVE_MODEL_CONFIG_ID;
        const primaryActions =
          typeof window.ModelLabels?.getPrimaryPresentationActions === 'function'
            ? window.ModelLabels
                .getPrimaryPresentationActions(activeModelConfigId, [])
            : getModelActionSlots().filter((action) => action.group === 'primary');
        const actionSignatures = collectFrontendActionSignaturesFromPrimaryMenu(rawItems);
        const byActionId = new Map();
        rawItems.forEach((item) => {
          const actionId = getPrimaryActionIdForMenuItem(item.el, rawItems);
          if (!actionId || byActionId.has(actionId)) return;
          byActionId.set(actionId, item);
        });
        const usedItems = new Set();
        const usedActionIds = new Set();
        const ordered = [];
        primaryActions.forEach((action) => {
          const item = byActionId.get(action.id);
          if (!item) return;
          ordered.push({ item, action });
          usedItems.add(item);
          usedActionIds.add(action.id);
        });
        rawItems.forEach((item, index) => {
          if (usedItems.has(item)) return;
          const action = primaryActions[index];
          if (
            !action ||
            usedActionIds.has(action.id) ||
            (['instant', 'thinking'].includes(action.id) && !actionSignatures[action.id])
          ) {
            return;
          }
          ordered.push({ item, action });
          usedItems.add(item);
          usedActionIds.add(action.id);
        });
        return ordered.sort((a, b) => rawItems.indexOf(a.item) - rawItems.indexOf(b.item));
      }

      function findMainItemByTestId(testId, state = getVisibleModelMenuState()) {
        const tid = normModelTid(testId);
        return getPrimaryMenuItems(state).find(
          (item) => normModelTid(item.el.getAttribute('data-testid')) === tid,
        );
      }
      function findConfigureMenuItem(state = getVisibleModelMenuState()) {
        const fromState = findMainItemByTestId('model-configure-modal', state)?.el;
        if (fromState instanceof Element) return fromState;
        const roots = [state.main, ...getOpenModelMenus(), document].filter(Boolean);
        for (const root of roots) {
          const match = Array.from(
            root.querySelectorAll?.('[data-testid="model-configure-modal"]') || [],
          ).find(isUsablyVisibleElement);
          if (match) return match;
        }
        return null;
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

      // Robust activator: focus + pointer + mouse + keyboard confirm (covers Radix commit paths).
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

      const pressElementKey = (el, key, code = key) => {
        if (!el) return;
        el.dispatchEvent(
          new KeyboardEvent('keydown', {
            key,
            code,
            bubbles: true,
            cancelable: true,
          }),
        );
        el.dispatchEvent(
          new KeyboardEvent('keyup', {
            key,
            code,
            bubbles: true,
            cancelable: true,
          }),
        );
      };

      const activateAfterFlash = async (el, delayMs) => {
        if (!el) return;
        if (window.gsap) flashMenuItem(el);
        if (delayMs > 0) await sleepAsync(delayMs);
        activateMenuItem(el);
      };

      const clickAfterFlash = async (el, delayMs) => {
        if (!el) return;
        if (window.gsap) flashMenuItem(el);
        else if (typeof flashBorder === 'function') flashBorder(el);
        if (delayMs > 0) await sleepAsync(delayMs);
        smartClickSafe(el);
      };

      const getTargetMenuItemForAction = (action, state = getVisibleModelMenuState()) => {
        if (!action) return null;
        const primaryMatch = getPrimaryMenuActionPairs(state).find(
          (pair) => pair.action?.id === action.id,
        );
        if (primaryMatch) return primaryMatch.item;
        if (action.id === 'configure') {
          const configureEl = findConfigureMenuItem(state);
          return configureEl ? { el: configureEl, menu: 'main', idx: -1 } : null;
        }
        if (action.actionKind === 'configure-option') {
          const stateItem = findMainItemByTestId('model-configure-modal', state);
          if (stateItem) return stateItem;
          const configureEl = findConfigureMenuItem(state);
          return configureEl ? { el: configureEl, menu: 'main', idx: -1 } : null;
        }
        return null;
      };

      const waitForMainMenuActionTarget = async (action) =>
        waitForAsync(
          () => {
            const state = getVisibleModelMenuState();
            const target = getTargetMenuItemForAction(action, state);
            return target ? { state, target } : null;
          },
          { timeout: 2000, interval: 30 },
        );

      const findComboboxByLabelId = (labelId) => {
        const label = document.getElementById(labelId);
        if (!(label instanceof Element)) return null;

        const roots = [
          label.closest('[role="dialog"]'),
          label.closest('[data-state="open"]'),
          label.parentElement,
          label.parentElement?.parentElement,
          label.closest('section'),
          document,
        ].filter(Boolean);

        for (const root of roots) {
          const controls = Array.from(root.querySelectorAll('button[role="combobox"][aria-controls]'));
          const button =
            controls.find((candidate) => candidate.getAttribute('aria-labelledby') === labelId) ||
            controls.find((candidate) => {
              const labelledBy = candidate.getAttribute('aria-labelledby') || '';
              return labelledBy.split(/\s+/).includes(labelId);
            });
          if (button) return button;
        }
        return null;
      };
      const findConfigureCombobox = () => findComboboxByLabelId('model-selection-label');
      const findThinkingEffortCombobox = () =>
        findComboboxByLabelId('thinking-effort-selection-label');

      const waitForConfigureCombobox = async () =>
        waitForAsync(findConfigureCombobox, { timeout: 2500, interval: 30 });

      const waitForConfigureComboboxQuick = async () =>
        waitForAsync(findConfigureCombobox, { timeout: 450, interval: 25 });

      const getControlledListboxForCombobox = (combobox) => {
        const listboxId = combobox?.getAttribute('aria-controls') || '';
        if (!listboxId) return null;
        const listbox = document.getElementById(listboxId);
        return listbox instanceof Element && listbox.getAttribute('role') === 'listbox'
          ? listbox
          : null;
      };

      const waitForControlledListbox = async (combobox, { timeout = 2500, interval = 30 } = {}) =>
        waitForAsync(
          () => {
            return getControlledListboxForCombobox(combobox);
          },
          { timeout, interval },
        );

      const waitForConfigureListbox = async (combobox) => waitForControlledListbox(combobox);

      const waitForConfigureListboxQuick = async (combobox) =>
        waitForControlledListbox(combobox, {
          timeout: DELAY_CONFIGURE_LISTBOX_QUICK_CHECK_MS,
          interval: 25,
        });

      const getConfigureOptionLabel = (option) => {
        if (!(option instanceof Element)) return '';
        const labelled = option.getAttribute('aria-labelledby') || '';
        const byId = labelled ? document.getElementById(labelled) : null;
        const text = (byId?.textContent || option.textContent || '').replace(/\s+/g, ' ').trim();
        return text;
      };
      const getConfigureActionForOption = (option, listbox, slotHint = -1) => {
        if (!(option instanceof Element) || !(listbox instanceof Element)) return null;
        const options = Array.from(listbox.querySelectorAll(':scope [role="option"]'));
        const optionIndex = options.indexOf(option);
        const label = getConfigureOptionLabel(option);
        if (typeof window.ModelLabels?.getConfigureActionForOption === 'function') {
          return window.ModelLabels.getConfigureActionForOption(label, optionIndex, slotHint);
        }
        if (optionIndex === 0) return getModelActionById('configure-latest');
        if (label === '5.2') return getModelActionById('configure-5-2');
        if (label === '5.0') return getModelActionById('configure-5-0-thinking-mini');
        if (label === 'o3') return getModelActionById('configure-o3');
        return null;
      };
      const inferActiveConfigFromConfigureOption = (option, listbox) => {
        if (!(option instanceof Element) || !(listbox instanceof Element)) return null;
        return getConfigureActionForOption(option, listbox)?.id || null;
      };

      // biome-ignore lint/correctness/noUnusedVariables: preserve configure-option scrape helper for follow-up wiring
      const captureConfigureOptionLabels = (listbox) => {
        if (!(listbox instanceof Element)) return;
        const options = Array.from(listbox.querySelectorAll(':scope [role="option"]')).slice(0, 4);
        if (!options.length) return;
        const labels = options.map((option) => getConfigureOptionLabel(option));
        __cspPersistModelNameRange(3, labels, 4);
      };
      const findConfigureDialog = () => {
        const combobox = findConfigureCombobox();
        const dialog = combobox?.closest('[role="dialog"]');
        return dialog instanceof Element ? dialog : null;
      };
      const hideOpenModelUiForScrape = (state = getVisibleModelMenuState()) => {
        const mainWrapper =
          state.main?.closest('[data-radix-popper-content-wrapper]') || state.main || null;
        const submenuWrapper =
          state.submenu?.closest('[data-radix-popper-content-wrapper]') || state.submenu || null;
        hideLiveScrapeElement(mainWrapper);
        hideLiveScrapeElement(submenuWrapper);
      };
      const hideConfigureDialogUiForScrape = () => {
        const dialog = findConfigureDialog();
        if (dialog) hideLiveScrapeElement(dialog);
        return dialog;
      };
      const hideConfigureListboxUiForScrape = (listbox) => {
        const wrapper = listbox?.closest('[data-radix-popper-content-wrapper]') || listbox || null;
        hideLiveScrapeElement(wrapper);
      };
      const getConfigureFrontendRadioRows = (dialog) =>
        dialog instanceof Element
          ? Array.from(dialog.querySelectorAll('button.__menu-item.hoverable[role="radio"]'))
          : [];
      const isUnavailableConfigureFrontendRow = (row) =>
        row instanceof Element &&
        (row.hasAttribute('data-disabled') ||
          row.getAttribute('aria-disabled') === 'true' ||
          row.hasAttribute('disabled') ||
          row.matches(':disabled'));
      const findConfigureProRow = (dialog) => {
        if (!(dialog instanceof Element)) return null;
        const candidates = Array.from(
          dialog.querySelectorAll('[data-testid], [data-model-picker-pro-row], [data-model-picker-pro-menu-item]'),
        )
          .map((candidate) => candidate.closest('.__menu-item') || candidate)
          .filter((candidate, index, rows) => rows.indexOf(candidate) === index);
        return (
          candidates.find((candidate) => {
            if (isUnavailableConfigureFrontendRow(candidate)) return false;
            const stableAttributes = candidate
              .getAttributeNames()
              .map((name) => `${name}=${candidate.getAttribute(name) || ''}`)
              .join(' ');
            return /(?:^|[-_=\s])pro(?:$|[-_=\s])/i.test(stableAttributes);
          }) || null
        );
      };
      const getConfigureFrontendActionIdForRow = (row, dialog) => {
        if (!(row instanceof Element) || !(dialog instanceof Element)) return '';
        const modelVersion = getModelVersionFromFrontendRow(row);
        if (modelVersion) {
          const match = Object.entries(latestFrontendActionSignatures).find(
            ([, signature]) => signature?.modelVersion === modelVersion,
          );
          if (match) return match[0];
        }
        if (row === findConfigureProRow(dialog)) return 'pro';
        return '';
      };
      const collectConfigureFrontendRows = (dialog) => {
        if (!(dialog instanceof Element)) return [];
        const rows = [...getConfigureFrontendRadioRows(dialog), findConfigureProRow(dialog)].filter(Boolean);
        return rows
          .map((row) => {
            const actionId = getConfigureFrontendActionIdForRow(row, dialog);
            const action =
              typeof window.ModelLabels?.getActionById === 'function'
                ? window.ModelLabels.getActionById(actionId)
                : null;
            if (!actionId || !action) return null;
            return {
              id: actionId,
              slot: action.slot,
              available: true,
              label:
                typeof window.ModelLabels?.getCanonicalActionLabel === 'function'
                  ? window.ModelLabels.getCanonicalActionLabel(actionId, action.label)
                  : action.label,
            };
          })
          .filter(Boolean);
      };
      const getComboboxDisplayText = (combobox) =>
        (combobox?.querySelector('span')?.textContent || combobox?.textContent || '')
          .replace(/\s+/g, ' ')
          .trim();
      const openComboboxListbox = async (combobox, { timeout = 2500 } = {}) => {
        if (!(combobox instanceof Element)) return null;
        let listbox = await waitForControlledListbox(combobox, {
          timeout: DELAY_CONFIGURE_LISTBOX_QUICK_CHECK_MS,
          interval: 25,
        });
        if (listbox) return { listbox, opened: false };
        await clickAfterFlash(combobox, DELAY_CONFIGURE_COMBOBOX_OPEN_MS);
        listbox = await waitForControlledListbox(combobox, { timeout, interval: 30 });
        return listbox ? { listbox, opened: true } : null;
      };
      const closeComboboxListbox = async (combobox) => {
        if (!(combobox instanceof Element)) return;
        try {
          combobox.focus?.();
          pressElementKey(combobox, 'Escape', 'Escape');
        } catch { }
        await sleepAsync(40);
      };
      const mapThinkingEffortLabelToId = (label) =>
        typeof window.ModelLabels?.mapThinkingEffortLabelToId === 'function'
          ? window.ModelLabels.mapThinkingEffortLabelToId(label)
          : '';
      const getThinkingEffortOptionById = (id) =>
        typeof window.ModelLabels?.getThinkingEffortOptionById === 'function'
          ? window.ModelLabels.getThinkingEffortOptionById(id)
          : null;
      const getThinkingEffortIdForOption = (option) => {
        if (!(option instanceof Element)) return '';
        const listbox = option.closest('[role="listbox"]');
        const index = listbox
          ? Array.from(listbox.querySelectorAll(':scope [role="option"]')).indexOf(option)
          : -1;
        if (index >= 0 && THINKING_EFFORT_OPTION_IDS[index]) return THINKING_EFFORT_OPTION_IDS[index];
        return mapThinkingEffortLabelToId(getConfigureOptionLabel(option));
      };
      const getThinkingEffortStorageCode = (optionId) => {
        const option = getThinkingEffortOptionById(optionId);
        const storageKey = option?.storageKey || '';
        return storageKey ? window.CSP_SHORTCUTS_EFFECTIVE?.[storageKey] || '' : '';
      };
      const findThinkingEffortOption = (listbox, optionId) => {
        if (!(listbox instanceof Element)) return null;
        const targetId =
          typeof window.ModelLabels?.normalizeThinkingEffortId === 'function'
            ? window.ModelLabels.normalizeThinkingEffortId(optionId)
            : String(optionId || '').trim();
        return (
          Array.from(listbox.querySelectorAll(':scope [role="option"]')).find(
            (option) => getThinkingEffortIdForOption(option) === targetId,
          ) || null
        );
      };
      const inferActiveFrontendActionIdFromDialog = (dialog) => {
        if (!(dialog instanceof Element)) return '';
        const activeRow =
          getConfigureFrontendRadioRows(dialog).find(
            (button) => button.getAttribute('aria-checked') === 'true',
          ) || null;
        return activeRow ? getConfigureFrontendActionIdForRow(activeRow, dialog) : '';
      };
      const ensureConfigureFrontendRowSelection = async (actionOrId) => {
        const action =
          typeof actionOrId === 'string' ? getModelActionById(actionOrId) : actionOrId;
        const dialog = findConfigureDialog();
        const row = findConfigureFrontendRowForAction(action, dialog);
        if (!row) return false;
        if (row.getAttribute('aria-checked') === 'true') return true;
        await activateAfterFlash(row, DELAY_CONFIGURE_STEP_MS);
        await sleepAsync(120);
        return true;
      };
      const ensureThinkingEffortSelection = async (optionId) => {
        const normalizedOptionId =
          typeof window.ModelLabels?.normalizeThinkingEffortId === 'function'
            ? window.ModelLabels.normalizeThinkingEffortId(optionId)
            : String(optionId || '').trim();
        if (!normalizedOptionId) return false;
        const combobox = await waitForAsync(findThinkingEffortCombobox, {
          timeout: 1600,
          interval: 30,
        });
        if (!combobox) return false;
        if (mapThinkingEffortLabelToId(getComboboxDisplayText(combobox)) === normalizedOptionId)
          return true;
        const opened = await openComboboxListbox(combobox);
        const listbox = opened?.listbox || null;
        if (!listbox) return false;
        const option = findThinkingEffortOption(listbox, normalizedOptionId);
        if (!option) {
          await closeComboboxListbox(combobox);
          return false;
        }
        await activateAfterFlash(option, DELAY_ACTIVATE_TARGET_MS);
        await sleepAsync(100);
        return true;
      };
      const collectThinkingEffortIdsDuringScrape = async (combobox) => {
        if (!(combobox instanceof Element)) return [];

        await ensureConfigureComboboxSelection(combobox, DEFAULT_ACTIVE_MODEL_CONFIG_ID);
        await sleepAsync(80);
        await ensureConfigureFrontendRowSelection('thinking');

        const effortCombobox = await waitForAsync(findThinkingEffortCombobox, {
          timeout: 1600,
          interval: 30,
        });
        if (!(effortCombobox instanceof Element)) return [];

        const opened = await openComboboxListbox(effortCombobox, { timeout: 1600 });
        const listbox = opened?.listbox || null;
        if (!(listbox instanceof Element)) return [];

        hideConfigureListboxUiForScrape(listbox);
        const ids = Array.from(listbox.querySelectorAll(':scope [role="option"]'))
          .map(getThinkingEffortIdForOption)
          .filter(Boolean);

        if (opened.opened) await closeComboboxListbox(effortCombobox);

        return typeof window.ModelLabels?.sortThinkingEffortIds === 'function'
          ? window.ModelLabels.sortThinkingEffortIds(ids)
          : Array.from(new Set(ids));
      };
      const deriveFlatModelNamesFromCatalog = (catalog) => {
        const names = Array(MAX_SLOTS).fill('');
        const configureOptions = Array.isArray(catalog?.configureOptions)
          ? catalog.configureOptions
          : [];
        configureOptions.forEach((option, optionIndex) => {
          const action =
            typeof window.ModelLabels?.getConfigureActionForOption === 'function'
              ? window.ModelLabels.getConfigureActionForOption(
                  option?.label || '',
                  optionIndex,
                  option?.slot,
                )
              : typeof window.ModelLabels?.getActionById === 'function'
                ? window.ModelLabels.getActionById(option?.id)
                : null;
          const slot = Number.isInteger(Number(option?.slot))
            ? Number(option.slot)
            : Number(action?.slot);
          if (!action || !Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS) return;
          names[slot] =
            typeof window.ModelLabels?.getCanonicalActionLabel === 'function'
              ? window.ModelLabels.getCanonicalActionLabel(action.id, option.label)
              : typeof window.ModelLabels?.normalizeStoredActionName === 'function'
                ? window.ModelLabels.normalizeStoredActionName(slot, option.label)
                : String(option?.label || '').trim();
        });
        const frontendByConfig =
          catalog && typeof catalog.frontendByConfig === 'object' ? catalog.frontendByConfig : {};
        Object.values(frontendByConfig).forEach((rows) => {
          (Array.isArray(rows) ? rows : []).forEach((row) => {
            if (!Number.isInteger(row?.slot)) return;
            const action =
              typeof window.ModelLabels?.getActionById === 'function'
                ? window.ModelLabels.getActionById(row?.id)
                : null;
            names[row.slot] =
              action && typeof window.ModelLabels?.getCanonicalActionLabel === 'function'
                ? window.ModelLabels.getCanonicalActionLabel(action.id, row.label)
                : typeof window.ModelLabels?.normalizeStoredActionName === 'function'
                  ? window.ModelLabels.normalizeStoredActionName(row.slot, row.label)
                  : String(row?.label || '').trim();
          });
        });
        return names.slice(0, MAX_SLOTS);
      };
      const selectConfigureOptionDuringScrape = async (combobox, targetAction) => {
        if (!(combobox instanceof Element) || !targetAction) return null;
        let listbox = await waitForConfigureListboxQuick(combobox);
        if (!listbox) {
          smartClickSafe(combobox);
          listbox = await waitForConfigureListbox(combobox);
        }
        if (!listbox) return null;
        hideConfigureListboxUiForScrape(listbox);
        const option = findConfigureOptionForAction(targetAction, listbox);
        if (!option) return null;
        activateMenuItem(option);
        await sleepAsync(80);
        return option;
      };
      const scrapeModelCatalogOnce = async ({ hideUi = true, keepPreparedSession = true } = {}) => {
        const previousHideState = SCRAPE_HIDE_UI_ACTIVE;
        SCRAPE_HIDE_UI_ACTIVE = !!hideUi;
        try {
          await releasePreparedModelConfigSession();
          const alreadyOpen = ensureMainMenuOpen();
          await sleepAsync(alreadyOpen ? 120 : 180);
          const menuReady = await waitForMainMenuActionTarget(getModelActionById('configure'));
          const state = menuReady?.state || getVisibleModelMenuState();
          hideOpenModelUiForScrape(state);
          const configureItem = findConfigureMenuItem(state);
          if (!configureItem) return { ok: false, error: 'CONFIGURE_ITEM_NOT_FOUND' };

          const combobox = await openConfigureDialogFromMenuItem(configureItem);
          if (!combobox) return { ok: false, error: 'CONFIGURE_DIALOG_NOT_FOUND' };

          hideConfigureDialogUiForScrape();
          const frontendByConfig = {};
          const initialActiveConfigId = inferActiveConfigFromCombobox(combobox);
          const initialFrontendActionId = inferActiveFrontendActionIdFromDialog(findConfigureDialog());

          let listbox = await waitForConfigureListboxQuick(combobox);
          if (!listbox) {
            smartClickSafe(combobox);
            listbox = await waitForConfigureListbox(combobox);
          }
          if (!listbox) return { ok: false, error: 'CONFIGURE_LISTBOX_NOT_FOUND' };
          hideConfigureListboxUiForScrape(listbox);

          let nextDynamicConfigureSlot = 8;
          const usedConfigureSlots = new Set();
          const availableOptions = Array.from(listbox.querySelectorAll(':scope [role="option"]'))
            .map((option) => {
              const action = getConfigureActionForOption(option, listbox);
              if (!action?.id) return null;
              const isDynamic = action.optionKind === 'value' && action.id.startsWith('configure-dynamic-');
              const slot = isDynamic
                ? (() => {
                    while (usedConfigureSlots.has(nextDynamicConfigureSlot)) {
                      nextDynamicConfigureSlot += 1;
                    }
                    return nextDynamicConfigureSlot++;
                  })()
                : Number(action.slot);
              if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS) return null;
              usedConfigureSlots.add(slot);
              return {
                ...action,
                slot,
                label: getConfigureOptionLabel(option),
              };
            })
            .filter(Boolean);

          const scrapeOrder = availableOptions
            .slice()
            .sort((a, b) =>
              a.id === 'configure-latest' ? -1 : b.id === 'configure-latest' ? 1 : 0,
            );

          for (const option of scrapeOrder) {
            await selectConfigureOptionDuringScrape(combobox, option);
            hideConfigureDialogUiForScrape();
            frontendByConfig[option.id] = collectConfigureFrontendRows(findConfigureDialog());
          }
          if (availableOptions.every((option) => option.id !== initialActiveConfigId)) {
            frontendByConfig[initialActiveConfigId] = collectConfigureFrontendRows(findConfigureDialog());
          }
          const thinkingEffortIds = await collectThinkingEffortIdsDuringScrape(combobox);
          await ensureConfigureComboboxSelection(combobox, initialActiveConfigId);
          if (initialFrontendActionId) {
            await ensureConfigureFrontendRowSelection(initialFrontendActionId);
          }

          const catalog = {
            version: 2,
            scrapedAt: Date.now(),
            configureOptions: availableOptions.map((option) => ({
              id: option.id,
              label:
                typeof window.ModelLabels?.getCanonicalActionLabel === 'function'
                  ? window.ModelLabels.getCanonicalActionLabel(option.id, option.label)
                  : typeof window.ModelLabels?.normalizeStoredActionName === 'function'
                  ? window.ModelLabels.normalizeStoredActionName(option.slot, option.label)
                : option.label,
            })),
            thinkingEffortIds,
            frontendByConfig,
          };
          const modelNames = deriveFlatModelNamesFromCatalog(catalog);
          chrome.storage.sync.set(
            {
              [MODEL_CATALOG_STORAGE_KEY]: catalog,
              modelNames,
              modelNamesAt: catalog.scrapedAt,
            },
            () => { },
          );

          if (keepPreparedSession) {
            clearHiddenLiveScrapeElements();
            setPreparedModelConfigSession(combobox, initialActiveConfigId);
          } else {
            const closeButton = await waitForButtonByTestIdSafe('close-button', {
              timeout: 800,
              interval: 25,
            });
            try {
              smartClickSafe(closeButton);
            } catch { }
            PREPARED_MODEL_CONFIG_SESSION = null;
          }

          return {
            ok: true,
            modelCatalog: catalog,
            modelNames,
            activeModelConfigId: initialActiveConfigId,
          };
        } catch (error) {
          return { ok: false, error: error?.message || 'SCRAPE_FAILED' };
        } finally {
          SCRAPE_HIDE_UI_ACTIVE = previousHideState;
          clearHiddenLiveScrapeElements();
        }
      };

      const getConfigureClickTargets = (configureItem) => {
        if (!(configureItem instanceof Element)) return [];
        const targets = [
          configureItem,
          configureItem.querySelector('.flex.min-w-0.grow.items-center.gap-2\\.5'),
          configureItem.querySelector('.truncate'),
          configureItem.firstElementChild,
        ].filter(Boolean);
        return Array.from(new Set(targets));
      };

      const openConfigureDialogFromMenuItem = async (configureItem) => {
        if (!(configureItem instanceof Element)) return null;

        const attempts = [];
        const targets = getConfigureClickTargets(configureItem);
        targets.forEach((target) => {
          attempts.push(async () => {
            await clickAfterFlash(target, DELAY_CONFIGURE_STEP_MS);
          });
        });
        attempts.push(async () => {
          await activateAfterFlash(configureItem, DELAY_CONFIGURE_STEP_MS);
        });
        attempts.push(async () => {
          configureItem.focus?.();
          pressElementKey(configureItem, 'Enter', 'Enter');
        });
        attempts.push(async () => {
          configureItem.focus?.();
          pressElementKey(configureItem, ' ', 'Space');
        });
        attempts.push(async () => {
          try {
            configureItem.click?.();
          } catch { }
        });

        for (const attempt of attempts) {
          const existing = findConfigureCombobox();
          if (existing) return existing;
          await attempt();
          const combobox = await waitForConfigureComboboxQuick();
          if (combobox) return combobox;
        }

        return waitForConfigureCombobox();
      };

      const findConfigureOptionForAction = (action, listbox) => {
        if (!(listbox instanceof Element) || !action) return null;
        const options = Array.from(listbox.querySelectorAll(':scope [role="option"]'));
        if (!options.length) return null;
        if (action.optionKind === 'first') return options[0] || null;
        if (action.optionKind === 'value') {
          return (
            options.find(
              (option) => getConfigureOptionLabel(option) === String(action.optionValue || ''),
            ) || null
          );
        }
        if (action.optionKind === 'dynamic-id') {
          return (
            options.find((option) => inferActiveConfigFromConfigureOption(option, listbox) === action.id) ||
            null
          );
        }
        return null;
      };
      const inferActiveConfigFromCombobox = (combobox) => {
        const value =
          combobox?.querySelector('span')?.textContent?.replace(/\s+/g, ' ').trim() || '';
        if (!value) return DEFAULT_ACTIVE_MODEL_CONFIG_ID;
        if (typeof window.ModelLabels?.getConfigureActionForOption === 'function') {
          return window.ModelLabels.getConfigureActionForOption(value, -1)?.id || DEFAULT_ACTIVE_MODEL_CONFIG_ID;
        }
        if (value === '5.2') return 'configure-5-2';
        if (value === '5.0') return 'configure-5-0-thinking-mini';
        if (value === 'o3') return 'configure-o3';
        return 'configure-latest';
      };
      const ensureConfigureComboboxSelection = async (combobox, targetConfigId) => {
        if (!(combobox instanceof Element)) return false;
        const normalizedTargetConfigId = normalizeActiveModelConfigId(targetConfigId);
        if (inferActiveConfigFromCombobox(combobox) === normalizedTargetConfigId) return true;
        const action = getModelActionById(normalizedTargetConfigId);
        if (!action) return false;
        let listbox = await waitForConfigureListboxQuick(combobox);
        if (!listbox) {
          await clickAfterFlash(combobox, DELAY_CONFIGURE_COMBOBOX_OPEN_MS);
          listbox = await waitForConfigureListbox(combobox);
        }
        if (!listbox) return false;
        const option = findConfigureOptionForAction(action, listbox);
        if (!option) return false;
        await activateAfterFlash(option, DELAY_ACTIVATE_TARGET_MS);
        await sleepAsync(80);
        return true;
      };
      const findConfigureFrontendRowForAction = (action, dialog) => {
        if (!(dialog instanceof Element) || !action) return null;
        const expectedVersion = latestFrontendActionSignatures[action.id]?.modelVersion || '';
        if (expectedVersion) {
          const match = getConfigureFrontendRadioRows(dialog).find(
            (row) => getModelVersionFromFrontendRow(row) === expectedVersion,
          );
          if (match) return match;
        }
        if (action.id === 'pro') return findConfigureProRow(dialog);
        return null;
      };

      const runConfigureOptionAction = async (
        action,
        { hideUi = false, initialState = null, preferPreparedSession = false } = {},
      ) => {
        return withTemporarilyHiddenModelUi(hideUi, async () => {
          const preparedSession = preferPreparedSession ? getPreparedModelConfigSession() : null;
          if (preparedSession) {
            const combobox = preparedSession.combobox;
            hideConfigureDialogUiForScrape();

            let listbox = await waitForConfigureListboxQuick(combobox);
            if (!listbox) {
              await clickAfterFlash(combobox, DELAY_CONFIGURE_COMBOBOX_OPEN_MS);
              listbox = await waitForConfigureListbox(combobox);
            }
            if (!listbox) return;
            hideConfigureListboxUiForScrape(listbox);

            const option = findConfigureOptionForAction(action, listbox);
            if (!option) return;

            await activateAfterFlash(option, DELAY_ACTIVATE_TARGET_MS);
            persistActiveModelConfigId(action.id);
            setPreparedModelConfigSession(combobox, action.id);
            await sleepAsync(80);
            hideConfigureDialogUiForScrape();
            return;
          }

          const ready = initialState
            ? { state: initialState }
            : await waitForMainMenuActionTarget(action);
          const state = ready?.state || getVisibleModelMenuState();
          hideOpenModelUiForScrape(state);
          const configureItem = findConfigureMenuItem(state);
          if (!configureItem) return;

          const combobox = await openConfigureDialogFromMenuItem(configureItem);
          if (!combobox) return;
          hideConfigureDialogUiForScrape();

          let listbox = await waitForConfigureListboxQuick(combobox);
          if (!listbox) {
            await clickAfterFlash(combobox, DELAY_CONFIGURE_COMBOBOX_OPEN_MS);
            listbox = await waitForConfigureListbox(combobox);
          }
          if (!listbox) return;
          hideConfigureListboxUiForScrape(listbox);

          const option = findConfigureOptionForAction(action, listbox);
          if (!option) return;

          await activateAfterFlash(option, DELAY_ACTIVATE_TARGET_MS);
          persistActiveModelConfigId(action.id);
          await sleepAsync(DELAY_CONFIGURE_CLOSE_MS);
          hideConfigureDialogUiForScrape();
          const closeButton = await waitForButtonByTestIdSafe('close-button', {
            timeout: 1500,
            interval: 30,
          });
          if (!closeButton) return;
          await clickAfterFlash(closeButton, DELAY_CONFIGURE_FINAL_CLICK_MS);
          flashBottomBar();
        });
      };
      const runConfigureFrontendRowAction = async (action) => {
        const ready = await waitForMainMenuActionTarget(getModelActionById('configure'));
        const state = ready?.state || getVisibleModelMenuState();
        const configureItem = findConfigureMenuItem(state);
        if (!configureItem) return;

        const combobox = await openConfigureDialogFromMenuItem(configureItem);
        if (!combobox) return;
        if (action.requiredConfigId) {
          const ensured = await ensureConfigureComboboxSelection(combobox, action.requiredConfigId);
          if (!ensured) return;
        }
        const dialog = findConfigureDialog();
        const frontendRow = findConfigureFrontendRowForAction(action, dialog);
        if (!frontendRow) return;
        await activateAfterFlash(frontendRow, DELAY_ACTIVATE_TARGET_MS);
        await sleepAsync(DELAY_CONFIGURE_CLOSE_MS);
        const closeButton = await waitForButtonByTestIdSafe('close-button', {
          timeout: 1500,
          interval: 30,
        });
        if (!closeButton) return;
        await clickAfterFlash(closeButton, DELAY_CONFIGURE_FINAL_CLICK_MS);
        flashBottomBar();
      };
      const runThinkingEffortOptionAction = async (optionId, { hideUi = false } = {}) => {
        const option = getThinkingEffortOptionById(optionId);
        if (!option?.id) return false;
        return withTemporarilyHiddenModelUi(hideUi, async () => {
          const alreadyOpen = ensureMainMenuOpen();
          await sleepAsync(alreadyOpen ? 120 : 180);

          const ready = await waitForMainMenuActionTarget(getModelActionById('configure'));
          const state = ready?.state || getVisibleModelMenuState();
          hideOpenModelUiForScrape(state);
          const configureItem = findConfigureMenuItem(state);
          if (!configureItem) return false;

          const combobox = await openConfigureDialogFromMenuItem(configureItem);
          if (!combobox) return false;
          if (hideUi) hideConfigureDialogUiForScrape();

          const modelSelected = await ensureConfigureComboboxSelection(
            combobox,
            DEFAULT_ACTIVE_MODEL_CONFIG_ID,
          );
          if (!modelSelected) return false;
          persistActiveModelConfigId(DEFAULT_ACTIVE_MODEL_CONFIG_ID);

          const thinkingSelected = await ensureConfigureFrontendRowSelection('thinking');
          if (!thinkingSelected) return false;

          const effortSelected = await ensureThinkingEffortSelection(option.id);
          if (!effortSelected) return false;

          await sleepAsync(DELAY_CONFIGURE_CLOSE_MS);
          if (hideUi) {
            hideConfigureDialogUiForScrape();
            return true;
          }

          const closeButton = await waitForButtonByTestIdSafe('close-button', {
            timeout: 1500,
            interval: 30,
          });
          if (closeButton) await clickAfterFlash(closeButton, DELAY_CONFIGURE_FINAL_CLICK_MS);
          flashBottomBar();
          return true;
        });
      };
      window.__cspRunThinkingEffortAction = (optionId, options = {}) => {
        const option = getThinkingEffortOptionById(optionId);
        if (!option?.id) return false;
        void runThinkingEffortOptionAction(option.id, options);
        return true;
      };

      let hintScheduleToken = 0;

      const isOpenVisibleListbox = (listbox) =>
        listbox instanceof Element &&
        listbox.getAttribute('role') === 'listbox' &&
        listbox.getAttribute('data-state') === 'open' &&
        isUsablyVisibleElement(listbox);

      const applyConfigureListboxHints = () => {
        const combobox = findConfigureCombobox();
        const listbox = getControlledListboxForCombobox(combobox);
        if (!isOpenVisibleListbox(listbox)) return false;
        const options = Array.from(listbox.querySelectorAll(':scope [role="option"]'));
        let applied = false;
        options.forEach((option) => {
          const action = getConfigureActionForOption(option, listbox);
          const slot = Number(action?.slot);
          if (!Number.isInteger(slot) || slot < 0 || slot >= KEY_CODES.length) return;
          const label = displayFromCode(KEY_CODES[slot]);
          if (!label || label === '—') return;
          addLabel(option, label);
          applied = true;
        });
        return applied;
      };

      const applyThinkingEffortListboxHints = () => {
        const combobox = findThinkingEffortCombobox();
        const listbox = getControlledListboxForCombobox(combobox);
        if (!isOpenVisibleListbox(listbox)) return false;
        const options = Array.from(listbox.querySelectorAll(':scope [role="option"]'));
        let applied = false;
        options.forEach((option) => {
          const optionId = getThinkingEffortIdForOption(option);
          const label = displayFromCode(getThinkingEffortStorageCode(optionId));
          if (!label || label === '—') return;
          addLabel(option, label);
          applied = true;
        });
        return applied;
      };

      const applyConfigureFrontendRowHints = () => {
        const dialog = findConfigureDialog();
        if (!(dialog instanceof Element) || !isUsablyVisibleElement(dialog)) return false;
        let applied = false;
        ['instant', 'thinking', 'pro'].forEach((actionId) => {
          const action = getModelActionById(actionId);
          const row = findConfigureFrontendRowForAction(action, dialog);
          const slot = Number(action?.slot);
          if (!row || !Number.isInteger(slot) || slot < 0 || slot >= KEY_CODES.length) return;
          const label = displayFromCode(KEY_CODES[slot]);
          if (!label || label === '—') return;
          addLabel(row, label);
          applied = true;
        });
        return applied;
      };

      const applyOpenSelectListboxHints = () => {
        let applied = false;
        applied = applyConfigureFrontendRowHints() || applied;
        applied = applyConfigureListboxHints() || applied;
        applied = applyThinkingEffortListboxHints() || applied;
        return applied;
      };

      const applyHints = (state = getVisibleModelMenuState()) => {
        const primaryPairs = getPrimaryMenuActionPairs(state);
        const selectHintsApplied = applyOpenSelectListboxHints();
        if (!primaryPairs.length) return selectHintsApplied;
        const expectedHintTexts = getExpectedPrimaryHintTexts(primaryPairs);
        if (primaryHintsAlreadyApplied(primaryPairs, expectedHintTexts)) {
          syncActiveConfigFromMenuState(state, { persist: true });
          __cspMaybePersistModelNames();
          return true;
        }
        removeAllLabels();
        for (const { item, action } of primaryPairs) {
          const slot = action?.slot;
          if (slot == null) continue;
          addLabel(item.el, displayFromCode(KEY_CODES[slot]));
        }
        applyOpenSelectListboxHints();
        syncActiveConfigFromMenuState(state, { persist: true });
        // Persist labels -> names once menus are present (submenu must be open for full set)
        __cspMaybePersistModelNames();
        return true;
      };
      const scheduleHints = ({ retries = 0, interval = DELAY_APPLY_HINTS_OBSERVER_MS } = {}) => {
        const token = ++hintScheduleToken;
        const run = () => {
          if (token !== hintScheduleToken) return;
          const applied = applyHints();
          if (applied || retries <= 0) return;
          retries -= 1;
          setTimeout(() => requestAnimationFrame(run), interval);
        };
        requestAnimationFrame(run);
      };

      // Expose a minimal hook so outer listeners can refresh labels when keys change
      window.__mp_applyHints = (options = {}) => scheduleHints(options);

      const openMenuForAction = (nextAction, done) => {
        ensureMainMenuOpen();

        let mainPolls = 0;
        const waitForReadyState = () => {
          const state = getVisibleModelMenuState();
          const target = getTargetMenuItemForAction(nextAction, state);
          if (!target) {
            if (mainPolls++ > 50) return done(null);
            setTimeout(waitForReadyState, 30);
            return;
          }
          done({ state, target });
        };

        waitForReadyState();
      };

      const executeModelAction = (action, options = {}) => {
        if (!action) return false;
        if (action.actionKind === 'configure-option' && options.preferPreparedSession) {
          const preparedSession = getPreparedModelConfigSession();
          if (preparedSession) {
            void runConfigureOptionAction(action, {
              hideUi: options.hideUi === true,
              preferPreparedSession: true,
            });
            return true;
          }
        }
        const alreadyOpen = ensureMainMenuOpen();
        setTimeout(
          () => {
            openMenuForAction(action, (ready) => {
              if (!ready) {
                if (action.actionKind === 'main-row') void runConfigureFrontendRowAction(action);
                return;
              }
              if (action.actionKind === 'configure-option') {
                if (!options.hideUi) applyHints();
                void runConfigureOptionAction(action, {
                  hideUi: options.hideUi === true,
                  initialState: ready.state,
                  preferPreparedSession: options.preferPreparedSession === true,
                });
                return;
              }
              applyHints();
              if (action.actionKind === 'configure-frontend-row') {
                void runConfigureFrontendRowAction(action);
                return;
              }
              const targetEl = ready.target?.el;
              if (!targetEl) return;
              if (window.gsap) flashMenuItem(targetEl);
              setTimeout(() => {
                activateMenuItem(targetEl);
                flashBottomBar();
                const stateAfterClick = getVisibleModelMenuState();
                const clickedPair = getPrimaryMenuActionPairs(stateAfterClick).find(
                  (pair) => pair.item.el === targetEl,
                );
                const clickedAction = clickedPair?.action || null;
                if (clickedAction?.id === 'configure') return;
                if (clickedAction?.actionKind === 'configure-option') {
                  persistActiveModelConfigId(clickedAction.id);
                  return;
                }
                syncActiveConfigFromMenuState(ready.state, { persist: true });
              }, DELAY_ACTIVATE_TARGET_MS);
            });
          },
          alreadyOpen ? DELAY_MAIN_MENU_SETTLE_EXPANDED_MS : DELAY_MAIN_MENU_SETTLE_OPEN_MS,
        );
        return true;
      };
      // --- KEY HANDLING ---
      window.addEventListener(
        'keydown',
        (e) => {
          if (!modPressed(e)) return;

          const idx = indexFromEvent(e);
          if (idx === -1) return;
          const action = getModelActionBySlot(idx);
          if (!action) return;

          e.preventDefault();
          e.stopPropagation();
          executeModelAction(action);
        },
        true,
      );

      // Keep click-to-open labels, but also observe DOM so labels appear *when* submenu mounts
      document.addEventListener('click', (e) => {
        if (e.composedPath().some((n) => n instanceof Element && n.matches(MENU_BTN_SELECTOR))) {
          setTimeout(
            () => scheduleHints({ retries: 12, interval: DELAY_APPLY_HINTS_AFTER_MAIN_MS }),
            0,
          );
        }
        const t = e.target instanceof Element ? e.target : null;
        const clickedPrimaryItem = t?.closest(
          '[data-radix-menu-content][role="menu"] > :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"]), ' +
          '[data-radix-menu-content][role="menu"] > * > :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"])',
        );
        if (clickedPrimaryItem) {
          const state = getVisibleModelMenuState();
          const clickedPair = getPrimaryMenuActionPairs(state).find(
            (pair) => pair.item.el === clickedPrimaryItem,
          );
          const clickedAction = clickedPair?.action || null;
          if (clickedAction) {
            setTimeout(() => {
              if (clickedAction.id === 'configure') return;
              if (clickedAction.actionKind === 'configure-option') {
                persistActiveModelConfigId(clickedAction.id);
                return;
              }
              syncActiveConfigFromMenuState(state, { persist: true });
            }, 60);
          }
        }
        const clickedConfigureOption = t?.closest('[role="option"][data-radix-collection-item]');
        if (clickedConfigureOption) {
          const listbox = clickedConfigureOption.closest('[role="listbox"]');
          const configureListbox = getControlledListboxForCombobox(findConfigureCombobox());
          if (listbox && listbox === configureListbox) {
            const inferredConfigId = inferActiveConfigFromConfigureOption(
              clickedConfigureOption,
              listbox,
            );
            if (inferredConfigId) {
              setTimeout(() => {
                persistActiveModelConfigId(inferredConfigId);
              }, 0);
            }
          }
        }
        const clickedCombobox = t?.closest('button[role="combobox"][aria-controls]');
        if (clickedCombobox) {
          setTimeout(
            () => scheduleHints({ retries: 10, interval: DELAY_APPLY_HINTS_AFTER_SUBMENU_MS }),
            0,
          );
        }
        const submenuTriggerClicked = t?.closest(
          '[role="menuitem"][data-has-submenu], ' +
          '[role="menuitem"][aria-haspopup="menu"], ' +
          '[role="menuitem"][aria-controls]',
        );
        if (submenuTriggerClicked) {
          setTimeout(
            () => scheduleHints({ retries: 10, interval: DELAY_APPLY_HINTS_AFTER_SUBMENU_MS }),
            0,
          );
        }
      });

      // Observe for open Radix menus; when the count of open menus changes, refresh labels
      (() => {
        let lastCount = 0;
        const getOpenSelectListboxCount = () =>
          [findConfigureCombobox(), findThinkingEffortCombobox()]
            .map(getControlledListboxForCombobox)
            .filter(isOpenVisibleListbox).length;
        const getConfigureDialogCount = () => (findConfigureDialog() ? 1 : 0);
        const isConfigureUiLikelyActive = () =>
          !!findConfigureDialog() || getOpenSelectListboxCount() > 0;
        const obs = new MutationObserver(() => {
          if (!isModelMenuLikelyActive() && !isConfigureUiLikelyActive()) {
            lastCount = 0;
            return;
          }
          const count =
            getOpenModelMenus().length + getConfigureDialogCount() + getOpenSelectListboxCount();
          if (count !== lastCount) {
            lastCount = count;
            setTimeout(
              () => scheduleHints({ retries: 8, interval: DELAY_APPLY_HINTS_OBSERVER_MS }),
              0,
            );
          }
        });
        obs.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      })();

      if (isModelMenuLikelyActive()) {
        scheduleHints({ retries: 8, interval: DELAY_APPLY_HINTS_OBSERVER_MS });
      }
    },
  );

  // Alt+/ opens the menu and forces the “Legacy models” submenu to be visible (robust to current DOM)
  window.toggleModelSelector = () => {
    const btn = getModelMenuButton();
    if (!btn) return;

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

    const waitForMainOpen = (cb) => {
      const currentState = getVisibleModelMenuState();
      const isExpanded = () => btn.getAttribute('aria-expanded') === 'true';
      if (isExpanded() && (currentState.main || hasOpenModelMenuCandidate()))
        return cb(currentState);
      btn.focus();
      pressSpace(btn);

      let tries = 0;
      let usedClickFallback = false;
      const poll = () => {
        const state = getVisibleModelMenuState();
        if (state.main || isExpanded() || tries++ > 50) return cb(state);
        if (!usedClickFallback && tries >= 4) {
          usedClickFallback = true;
          safeClick(btn);
        }
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
      const state = getVisibleModelMenuState();
      if (!state.main || state.submenuOpen) return done();

      const trigger = state.submenuTrigger;
      if (!trigger) return done();

      let polls = 0;
      const tick = () => {
        const nextState = getVisibleModelMenuState();
        if (nextState.submenuOpen || trigger.getAttribute('aria-expanded') === 'true') {
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
    waitForMainOpen((state) => {
      const readyState = state || getVisibleModelMenuState();
      if (!readyState.submenuTrigger) return;
      // Let Radix mount main content before searching
      setTimeout(() => forceOpenSubmenu(() => { }), 40);
    });
  };

  // Listen for modelPickerKeyCodes changes and update in real-time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.activeModelConfigId) {
      const nextActiveModelConfigId = setCachedActiveModelConfigId(
        changes.activeModelConfigId.newValue,
      );
      LAST_PERSISTED_ACTIVE_MODEL_CONFIG_ID = nextActiveModelConfigId;
    }
    if (changes.modelCatalog) {
      window.__modelCatalog =
        changes.modelCatalog.newValue && typeof changes.modelCatalog.newValue === 'object'
          ? changes.modelCatalog.newValue
          : null;
    }
    if (changes.modelPickerKeyCodes) {
      const val = changes.modelPickerKeyCodes.newValue;
      if (!Array.isArray(val)) return;

      const next = val.slice(0, MAX_SLOTS);
      while (next.length < MAX_SLOTS) next.push('');

      // Mutate the const array so references stay valid
      KEY_CODES.splice(0, KEY_CODES.length, ...next);

      // If menu is open, refresh labels to reflect new keys
      const btn = getModelMenuButton();
      if (btn?.getAttribute('aria-expanded') === 'true') {
        setTimeout(() => {
          window.__mp_applyHints?.();
        }, DELAY_APPLY_HINTS_STORAGE_MS);
      }
    }
  });
})();

// ====================================
// rememberSidebarScrollPositionCheckbox
// Temporarily hard-disabled pending a rewrite.
// ====================================
setTimeout(() => {
  try {
    chrome.storage.sync.get(
      { rememberSidebarScrollPositionCheckbox: false },
      ({ rememberSidebarScrollPositionCheckbox: enabled }) => {
        window.rememberSidebarScrollPositionCheckbox = false;
        if (enabled !== false) {
          chrome.storage.sync.set({ rememberSidebarScrollPositionCheckbox: false });
        }
      },
    );
  } catch { }
}, 500);

// ==================================================
// @note Slim-bar opacity / fade logic (robust, overlay-aware, single IIFE)
// ==================================================
(() => {
  chrome.storage.sync.get(
    { fadeSlimSidebarEnabled: false },
    ({ fadeSlimSidebarEnabled: enabled }) => {
      window._fadeSlimSidebarEnabled = enabled;

      let bar = null;
      let hover = false;
      let idleTimer = null;
      let idleTimerVersion = 0;
      let classObserver = null;
      let domObserver = null;
      let refreshTimer = null;
      let refreshListenersAttached = false;
      let pendingFlashAfterAttach = false;
      let settleUntil = 0;

      const INITIAL_SETTLE_MS = 1200;
      const IDLE_FADE_DELAY_MS = 2500;
      const BAR_REFRESH_DEBOUNCE_MS = 80;

      function isFeatureEnabled() {
        return window._fadeSlimSidebarEnabled === true;
      }

      function beginSettle(ms = INITIAL_SETTLE_MS) {
        settleUntil = Math.max(settleUntil, Date.now() + ms);
      }

      function getSettleDelayMs() {
        return Math.max(0, settleUntil - Date.now());
      }

      function isSettling() {
        return getSettleDelayMs() > 0;
      }

      function resetBarStyles(barEl) {
        if (!barEl) return;
        barEl.style.removeProperty('transition');
        barEl.style.removeProperty('opacity');
        barEl.style.removeProperty('pointer-events');
      }

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
        return coerceNumberFromStorage(window._slimBarIdleOpacity, 0.0);
      }
      function ensureOpacityLoaded() {
        if (window._slimBarOpacityPromise) return window._slimBarOpacityPromise;
        window._slimBarOpacityPromise = new Promise((res) => {
          chrome.storage.sync.get({ popupSlimSidebarOpacityValue: 0.0 }, (data) => {
            window._slimBarIdleOpacity = coerceNumberFromStorage(
              data.popupSlimSidebarOpacityValue,
              0.0,
            );
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
        classObserver = null;
        clearTimeout(idleTimer);
        idleTimerVersion++;
        bar = null;
      }

      function clearRefreshTimer() {
        if (!refreshTimer) return;
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }

      function removeRefreshListeners() {
        if (!refreshListenersAttached) return;
        document.removeEventListener('pointerdown', scheduleInteractionRefresh, true);
        document.removeEventListener('keydown', scheduleInteractionRefresh, true);
        document.removeEventListener('visibilitychange', scheduleInteractionRefresh, true);
        window.removeEventListener('resize', scheduleInteractionRefresh, true);
        refreshListenersAttached = false;
      }

      function disconnectGlobalObservers() {
        domObserver?.disconnect();
        domObserver = null;
        clearRefreshTimer();
        removeRefreshListeners();
        pendingFlashAfterAttach = false;
      }

      function stopFeature() {
        disconnectGlobalObservers();
        detachCurrentBar();
        resetBarStyles(document.getElementById('stage-sidebar-tiny-bar'));
      }

      function overlayIsOpen() {
        const selectors = [
          '[id^="radix-"][data-state="open"]',
          '[role="menu"][data-radix-menu-content][data-state="open"]',
          '[role="dialog"]',
          '[aria-modal="true"]',
          '[role="listbox"]',
          '[data-radix-popper-content-wrapper]',
          '.modal, .slideover, .overlay, .DialogOverlay, .MenuOverlay',
          '[data-state="open"]',
          '[data-overlay="true"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && isVisible(el)) return true;
        }
        return false;
      }
      function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      }

      function setOpacity(value) {
        if (!bar || !isFeatureEnabled()) return;
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
        if (!bar || !isFeatureEnabled()) return;
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
        if (isSettling()) return;
        setOpacity(getIdleOpacity().toString());
      }

      function scheduleIdleFade(delayMs = IDLE_FADE_DELAY_MS) {
        clearTimeout(idleTimer);
        idleTimerVersion++;
        const thisVersion = idleTimerVersion;
        idleTimer = setTimeout(() => {
          if (idleTimerVersion === thisVersion) fadeToIdle();
        }, getSettleDelayMs() + delayMs);
      }

      function onEnter() {
        if (!isFeatureEnabled()) return;
        hover = true;
        clearTimeout(idleTimer);
        setOpacity('1');
      }
      function onLeave() {
        if (!isFeatureEnabled()) return;
        hover = false;
        scheduleIdleFade();
      }

      function relevantNodeForSlimSidebarRefresh(node) {
        if (!(node instanceof Element) && !(node instanceof DocumentFragment)) return false;
        const selector =
          '#stage-sidebar-tiny-bar, #stage-sidebar, [data-radix-popper-content-wrapper], [role="menu"][data-radix-menu-content], [role="dialog"], [aria-modal="true"], [role="listbox"], [data-overlay="true"]';
        if (node instanceof Element && node.matches(selector)) return true;
        return typeof node.querySelector === 'function' && !!node.querySelector(selector);
      }

      function mutationsNeedSlimSidebarRefresh(mutations) {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (relevantNodeForSlimSidebarRefresh(node)) return true;
          }
          for (const node of mutation.removedNodes) {
            if (relevantNodeForSlimSidebarRefresh(node)) return true;
          }
        }
        return false;
      }

      function refreshBarState() {
        if (!isFeatureEnabled()) return;
        const el = document.getElementById('stage-sidebar-tiny-bar');
        if (el !== bar) {
          if (el) {
            const shouldFlash = pendingFlashAfterAttach;
            pendingFlashAfterAttach = false;
            const attachPromise = attachToBar(el);
            if (shouldFlash) {
              Promise.resolve(attachPromise).then(() => {
                window.flashSlimSidebarBar?.();
              });
            }
          } else {
            pendingFlashAfterAttach = false;
            detachCurrentBar();
          }
          return;
        }
        pendingFlashAfterAttach = false;
        fadeToIdle();
      }

      function scheduleBarRefresh(delayMs = BAR_REFRESH_DEBOUNCE_MS, { flashIfNew = false } = {}) {
        if (!isFeatureEnabled()) return;
        if (flashIfNew) pendingFlashAfterAttach = true;
        clearRefreshTimer();
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          refreshBarState();
        }, delayMs);
      }

      function scheduleInteractionRefresh() {
        scheduleBarRefresh(120);
      }

      async function attachToBar(el) {
        if (!isFeatureEnabled() || !(el instanceof HTMLElement)) return;
        detachCurrentBar();
        await ensureOpacityLoaded();
        if (!isFeatureEnabled() || !el.isConnected) return;

        bar = el;
        beginSettle();
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
          if (!bar || !isFeatureEnabled()) return;
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
              scheduleIdleFade();
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
        scheduleIdleFade();
      }

      function ensureGlobalObservers() {
        if (!isFeatureEnabled() || domObserver) return;
        const observationRoot = document.body || document.documentElement;
        if (!(observationRoot instanceof Node)) return;

        domObserver = new MutationObserver((mutations) => {
          if (!isFeatureEnabled() || !mutationsNeedSlimSidebarRefresh(mutations)) return;
          scheduleBarRefresh(BAR_REFRESH_DEBOUNCE_MS, { flashIfNew: true });
        });
        domObserver.observe(observationRoot, { childList: true, subtree: true });
        if (!refreshListenersAttached) {
          document.addEventListener('pointerdown', scheduleInteractionRefresh, true);
          document.addEventListener('keydown', scheduleInteractionRefresh, true);
          document.addEventListener('visibilitychange', scheduleInteractionRefresh, true);
          window.addEventListener('resize', scheduleInteractionRefresh, true);
          refreshListenersAttached = true;
        }
      }

      function startFeature() {
        if (!isFeatureEnabled()) return;
        ensureGlobalObservers();
        const first = document.getElementById('stage-sidebar-tiny-bar');
        if (first) attachToBar(first);
      }

      // (Removed setInterval: fadeToIdle() is now handled by user idle, relevant DOM changes, and interaction-triggered refreshes.)

      // startup
      function startup() {
        if (isFeatureEnabled()) startFeature();
        else stopFeature();
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startup, { once: true });
      } else {
        startup();
      }

      chrome.storage.onChanged.addListener((chg, area) => {
        if (area !== 'sync') return;

        if ('popupSlimSidebarOpacityValue' in chg) {
          window._slimBarIdleOpacity = coerceNumberFromStorage(
            chg.popupSlimSidebarOpacityValue.newValue,
            0.0,
          );
          fadeToIdle();
        }

        if ('fadeSlimSidebarEnabled' in chg) {
          window._fadeSlimSidebarEnabled = chg.fadeSlimSidebarEnabled.newValue === true;
          const nowOn = window._fadeSlimSidebarEnabled;
          if (!nowOn) {
            stopFeature();
          } else {
            startFeature();
          }
        }
      });

      window.flashSlimSidebarBar = (dur = 2500) => {
        if (!bar || !isFeatureEnabled()) return;
        if (overlayIsOpen()) {
          setOpacity('0');
          hover = false;
          return;
        }
        clearTimeout(idleTimer);
        idleTimerVersion++;
        setOpacity('1');
        hover = false;
        scheduleIdleFade(dur);
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
:host,:root{--text-primary:#1e1e1e;--text-secondary:#646464;--border-light:#dfdfdc;--bg-primary:#f4f3f1;--bg-secondary:#f8f7f5;--highlight-color:#3f51b5}*,body{margin:0}*{padding:0;box-sizing:border-box}body{width:100%;height:100vh;overflow-y:auto;overflow-x:hidden;padding:.5rem;display:flex;justify-content:center;align-items:flex-start;line-height:1.5!important}.key-input,.key-text,h1{text-wrap:balance}.key-input,.key-text,.shortcut-label,.tooltiptext,body,h1{font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif!important;font-size:14px;font-feature-settings:normal;font-variation-settings:normal;text-size-adjust:100%;text-align:start;text-overflow:ellipsis;white-space-collapse:collapse;unicode-bidi:isolate;pointer-events:auto}.tooltiptext{text-wrap:balance}h1{font-size:1.25rem;font-weight:500;text-align:center;margin-bottom:1rem}#toast-container .toast{text-wrap:balance}.disabled-section{opacity:.2;pointer-events:none}.disabled-section .key-input{background-color:#eee;color:#aaa;border-color:#ccc;cursor:not-allowed}.flash-highlight{animation:pulse-highlight 0.6s ease-out 1.2s 1}.full-width{grid-column:span 2}.icon-input-container{display:flex;align-items:center;gap:8px}.icon-input-container::after{position:absolute;left:.5rem;top:50%;transform:translateY(-50%);font:inherit;color:#666;pointer-events:none;z-index:2;opacity:1;transition:opacity 0.1s ease}.icon-input-container:focus-within::after{opacity:0}.key-input{width:50px;height:2rem;border:1px solid var(--border-light);border-radius:9999px;text-align:center;font-size:.9rem;font-weight:700;background-color:var(--bg-primary);color:var(--text-secondary)}.key-input:focus{border-color:var(--highlight-color);outline:0}.key-text{font-size:.9rem;font-weight:600}.material-checkbox{width:12px;height:12px;cursor:pointer!important}.material-radio{width:12px;height:12px;cursor:pointer!important}.material-icons-outlined{font-size:18px;color:var(--text-secondary)}.material-input-long{position:relative;z-index:1;width:6ch;padding:.25rem .5rem;border:1px solid #ccc;border-radius:9999px;background:0 0;box-sizing:border-box;color:#fff0;transition:width 0.25s ease}.material-input-long:focus{width:24ch;color:inherit;outline:0}.model-picker{width:100%;display:flex;flex-direction:column;align-items:left;margin-left:0}.model-picker-shortcut{flex-direction:column;align-items:stretch;gap:6px}.mp-icons{display:flex;justify-content:center;font-size:clamp(9px, 1.9vw, 12px);line-height:1;scale:.85;margin-left:10px}.mp-icons .material-symbols-outlined{margin:0 -1px;pointer-events:none;vertical-align:middle}.mp-option{display:inline-flex;align-items:center;gap:4px;cursor:pointer;position:relative;user-select:none;font-size:12px}.mp-option input[type="radio"]{width:12px;height:12px;margin:0 2px;accent-color:var(--highlight-color)}.mp-option-text{text-align:center;font-size:.75rem;text-wrap:balance;margin:0}.mp-option .info-icon{margin-left:2px;line-height:1;font-size:14px}.mp-options{display:flex;justify-content:center;gap:3rem;margin-top:10px;margin-bottom:8px}.new-emoji-indicator{font-size:1.5em;line-height:1;user-select:none;pointer-events:none;opacity:.9;transform:translateY(-1px)}.new-feature-tag{font-size:.65rem;font-weight:600;color:#fff;background-color:#6fc15f;padding:2px 6px;border-radius:4px;letter-spacing:.5px;line-height:1;user-select:none}.opacity-slider-clipper{height:60px;overflow:hidden;display:flex;align-items:center;justify-content:center;width:100%}.opacity-tooltip{position:relative;width:60%;flex:1 1 0%;min-width:0}.opacity-tooltip.tooltip:hover::after{transform:scaleX(0)!important}.opacity-tooltip.visible-opacity-slider::after{transform-origin:left;pointer-events:none;content:"";display:block;position:absolute;bottom:-2px;left:0;width:100%;transform:scaleX(0);transition:transform 0.2s ease-in-out}.opacity-tooltip.visible-opacity-slider:hover::after,.opacity-tooltip:hover::after{transform:scaleX(1)}.opacity-tooltip::after{content:none;border:0}.p-form-switch{--width:80px;cursor:pointer;display:inline-block;scale:.5;transform-origin:right center}.p-form-switch>input{display:none}.p-form-switch>span{background:#e0e0e0;border:1px solid #d3d3d3;border-radius:500px;display:block;height:calc(var(--width) / 1.6);position:relative;transition:all 0.2s;width:var(--width)}.p-form-switch>span::after{background:#f9f9f9;border-radius:50%;border:.5px solid rgb(0 0 0 / .101987);box-shadow:0 3px 1px rgb(0 0 0 / .1),0 1px 1px rgb(0 0 0 / .16),0 3px 8px rgb(0 0 0 / .15);box-sizing:border-box;content:"";height:84%;left:3%;position:absolute;top:6.5%;transition:all 0.2s;width:52.5%}.p-form-switch>input:checked+span{background:#60c35b}.p-form-switch>input:checked+span::after{left:calc(100% - calc(var(--width) / 1.8))}.shortcut-column{display:flex;flex-direction:column;gap:10px}.shortcut-container{width:800px;max-width:100%;margin:0 auto;padding:1rem;background-color:var(--bg-primary);border-radius:8px;box-shadow:0 4px 8px rgb(0 0 0 / .1);box-sizing:border-box}.shortcut-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.shortcut-item,.shortcut-keys{display:flex;align-items:center;max-width:100%}.shortcut-item{justify-content:space-between;background-color:var(--bg-secondary);padding:.75rem .75rem .75rem .75rem;border:1px solid var(--border-light);border-radius:6px;box-shadow:0 2px 4px rgb(0 0 0 / .05);min-height:3.5rem}.shortcut-item.hidden{visibility:hidden;pointer-events:none}.shortcut-item .p-form-switch,.shortcut-item label.p-form-switch,.shortcut-item>.p-form-switch{margin-left:auto}.shortcut-keys{gap:5px}.shortcut-label{font-size:90%;color:var(--text-primary);font-weight:400;line-height:1.5}.shortcut-label,.shortcut-label .i18n,.tooltip .i18n{text-wrap:balance}.tooltip{position:relative;display:inline;cursor:pointer;border-bottom:none}.tooltip .i18n{text-underline-offset:4px;text-decoration-thickness:1px;display:inline}.tooltip .tooltiptext{visibility:hidden;width:120px;background-color:#2a2b32;color:#ececf1;text-align:left;border-radius:6px;padding:5px;position:absolute;z-index:1;top:-100%;left:50%;transform:translateX(-50%);opacity:0;transition:opacity 0.3s}.tooltip-area{display:none;opacity:0;transition:opacity 0.5s ease-in-out;position:fixed;bottom:0;left:0;width:100%;height:55px;padding:8px 10px 10px;background-color:#f5f5f5;color:#616161;text-align:center;line-height:1.5;border-top:1px solid #ccc;font-size:.9rem;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-weight:400;z-index:100;box-shadow:0 -4px 8px rgb(0 0 0 / .2);text-wrap:balance}.tooltip:hover .tooltiptext{visibility:visible;opacity:1}.mp-option-text.i18n{margin-right:.25rem}.opacity-slider::-webkit-slider-runnable-track,.opacity-slider::-moz-range-track{height:4px;border-radius:2px;background:#9e9e9e}.opacity-slider::-webkit-slider-thumb,.opacity-slider::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#6fc05f;border:none}.class-1{display:flex;flex-direction:column;gap:8px}.class-2{display:flex;align-items:center;gap:12px;width:100%;justify-content:flex-start}.class-3{flex:0 0 auto;margin-bottom:4px}.class-4{flex:1 1 auto;min-width:0;display:flex;justify-content:center;align-items:center}.class-5{width:100%;overflow:visible;display:flex;align-items:center;justify-content:center}.class-6{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;transform:scale(1);transform-origin:top center;margin-left:20px;padding-right:10px!important}.class-7{width:100%;display:flex;justify-content:center}.class-8{width:20px;height:20px;display:block;opacity:.6}.class-9{width:85%}.class-10{display:flex;align-items:center;gap:4px}.class-11{font-size:11px}.class-12{margin-left:auto;flex-shrink:0}.class-13{position:relative}.class-14{flex:1}.class-15{margin-bottom:4px}.class-16{line-height:1.8!important}.class-17{margin-bottom:2px}.class-18{display:flex;justify-content:center;gap:3rem}.class-19{display:flex;gap:32px;align-items:center;justify-content:center;flex-grow:1;max-width:400px}.class-20{display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;position:relative;border-bottom:none!important}.class-21{font-size:20px}.class-22{border-bottom:none!important}.class-23{width:12px;height:12px}.class-24{margin-left:auto}.class-25{flex:0 0 auto}.class-26{flex:1 1 auto;display:flex;justify-content:center;align-items:center}.class-27{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;transform:scale(1);transform-origin:top center;margin-left:20px;margin-right:-20px}.class-28{display:flex;gap:1.5rem;align-items:center}.class-29{display:flex;align-items:center;gap:6px;cursor:pointer;border-bottom:1px dotted currentColor;padding-bottom:4px}.class-30{display:flex;align-items:center}.class-31{display:none!important}@keyframes pulse-highlight{0%{box-shadow:0 0 0 0 rgb(33 150 243 / .6)}to{box-shadow:0 0 0 0 #fff0}70%{box-shadow:0 0 0 10px #fff0}}h1{font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif!important}.opacity-editable{cursor:pointer;transition:border 0.18s,box-shadow 0.18s,background 0.18s;border-radius:20px;padding:0% .5em;border:1.5px solid #fff0;outline:none}.opacity-editable:hover,.opacity-editable:focus,.opacity-editable.editing{border:1.5px solid rgb(0 0 0 / .11);box-shadow:0 0 2px 1px rgb(0 0 0 / .07);background:rgb(0 0 0 / .015);outline:none}.opacity-editable input{outline:none;border:none;width:2.4em;font:inherit;background:none;text-align:right;box-shadow:none}#dup-overlay{position:fixed;inset:0;background:rgb(0 0 0 / .14);display:flex;align-items:center;justify-content:center;z-index:99999}#dup-box{background:#fff;padding:22px 20px 18px;border-radius:16px;box-shadow:0 4px 24px rgb(0 0 0 / .14);max-width:400px;width:92vw;font:15px / 1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}#dup-box h2{margin:0 0 12px;font-size:17px;font-weight:600;color:#111}#dup-msg{margin:0 0 16px;font-size:15px;color:#444}#dup-box label{display:flex;align-items:center;gap:7px;margin:0 0 20px;font-size:14px;color:#666;user-select:none}#dup-dont{accent-color:#007aff}.dup-btns{display:flex;justify-content:flex-end;gap:12px}#dup-no,#dup-yes{padding:7px 22px;font-size:15px;border-radius:9999px;outline:none;font-family:inherit;-webkit-tap-highlight-color:#fff0;cursor:pointer;transition:background 0.14s,border-color 0.14s,color 0.14s}#dup-no{font-weight:500;color:#007aff;background:#fff0;border:1px solid rgb(0 0 0 / .12)}#dup-no:hover,#dup-no:focus-visible{background:rgb(0 122 255 / .08);border-color:rgb(0 122 255 / .19);color:#007aff}#dup-no:active{background:rgb(0 122 255 / .16)}#dup-yes{font-weight:600;color:#fff;background:#007aff;border:none}#dup-yes:hover,#dup-yes:focus-visible{background:#338fff;color:#fff}#dup-yes:active{background:#006be6;color:#fff}span.dup-key{color:#007aff!important;font-weight:600;width:95%}.mp-key{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-width:1.8em;height:1.6em;margin:0 2px;padding:0 .4em;border-radius:6px;font-weight:600;border:1.5px solid rgb(0 0 0 / .11);box-shadow:0 0 2px 1px rgb(0 0 0 / .07);background:rgb(0 0 0 / .015);outline:none;user-select:none;transition:border 0.18s,box-shadow 0.18s,background 0.18s}.mp-key:hover,.mp-key:focus,.mp-key.listening{border:1.5px solid rgb(0 0 0 / .11);outline:2px solid #39f!important;box-shadow:0 0 2px 1px rgb(0 0 0 / .07);background:rgb(0 0 0 / .015)}.mp-key:focus{outline:2px solid #39f!important;outline-offset:1px}.custom-tooltip{position:relative}.custom-tooltip:hover::after,.custom-tooltip:focus::after,.custom-tooltip:focus-visible::after,.custom-tooltip:focus-within::after{content:attr(data-tooltip);white-space:pre;position:absolute;top:-63px;left:50%;transform:translateX(-50%);background:rgb(0 0 0 / .9);color:#fff;padding:6px 10px;border-radius:6px;font-size:16px;font-weight:500;text-align:center;line-height:1.3;z-index:9999;pointer-events:none;box-shadow:0 2px 6px rgb(0 0 0 / .2)}.custom-tooltip:hover::before,.custom-tooltip:focus::before,.custom-tooltip:focus-visible::before,.custom-tooltip:focus-within::before{content:"";position:absolute;top:-15px;left:50%;transform:translateX(-50%) rotate(180deg);border-width:6px;border-style:solid;border-color:#fff0 #fff0 rgb(0 0 0 / .9) #fff0}.mp-key--shift-left.custom-tooltip:hover::after,.mp-key--shift-left.custom-tooltip:focus::after,.mp-key--shift-left.custom-tooltip:focus-visible::after,.mp-key--shift-left.custom-tooltip:focus-within::after{left:calc(50% - 1em)}.mp-key--shift-left.custom-tooltip:hover::before,.mp-key--shift-left.custom-tooltip:focus::before,.mp-key--shift-left.custom-tooltip:focus-visible::before,.mp-key--shift-left.custom-tooltip:focus-within::before{left:calc(50% - 1em)}.ios-searchbar{margin:8px 0 12px;padding:0 4px 8px 0}.ios-searchbar-inner{display:flex;align-items:center;gap:8px}.ios-search-input{-webkit-appearance:none;appearance:none;width:100%;height:36px;border-radius:9999px;border:1px solid rgb(60 60 67 / .18);background:rgb(118 118 128 / .12);box-shadow:inset 0 1px 0 rgb(255 255 255 / .35);outline:none;padding:0 36px;font:inherit;line-height:36px;caret-color:#007aff;transition:background 0.12s,border-color 0.12s,box-shadow 0.12s;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236e6e73'><path d='M13.61 12.2l4 4a1 1 0 11-1.42 1.42l-4-4a7 7 0 111.42-1.42zM8.5 13a4.5 4.5 0 100-9 4.5 4.5 0 000 9z'/></svg>");background-repeat:no-repeat;background-position:12px 50%;background-size:16px 16px}.ios-search-input::placeholder{color:#6e6e73;opacity:1}.ios-search-input:focus{background:rgb(118 118 128 / .18);border-color:rgb(60 60 67 / .28);box-shadow:0 0 0 2px rgb(0 122 255 / .15)}.ios-search-cancel{display:none;border:0;background:#fff0;color:#007aff;font:inherit;padding:4px 8px;line-height:1;border-radius:6px}.ios-searchbar.focused .ios-search-cancel,.ios-searchbar.active .ios-search-cancel{display:inline-block}.ios-search-cancel:active{background:rgb(0 122 255 / .08)}.shortcut-container.filtering-active .blank-row{display:none!important}.shortcut-container.filtering-active .shortcut-grid{align-content:start!important;justify-content:start!important;grid-auto-flow:dense;gap:8px 12px}.shortcut-container.filtering-active .shortcut-grid>.shortcut-item{margin:0!important}@media (prefers-color-scheme:dark){.ios-search-input{border-color:rgb(235 235 245 / .18);background:rgb(118 118 128 / .24)}.ios-search-input:focus{border-color:rgb(235 235 245 / .28);box-shadow:0 0 0 2px rgb(10 132 255 / .22)}.ios-search-input::placeholder{color:#8e8e93}.ios-search-cancel{color:#0a84ff}}:root{--tooltip-max-ch:36}.material-symbols-outlined.info-icon{font-size:1em;font-weight:inherit;vertical-align:middle;line-height:1;cursor:pointer;margin-left:.25em}.info-icon-tooltip{position:relative;display:inline-flex;align-items:center;cursor:pointer}.info-icon-tooltip:hover::after,.info-icon-tooltip:focus::after{content:attr(data-tooltip);position:absolute;left:50%;bottom:120%;transform:translateX(calc(-50% + var(--tooltip-offset-x, 0px)));display:block;background:rgb(20 20 20 / .98);color:#fff;padding:12px 20px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:14px;font-weight:500;text-align:center;white-space:normal;text-wrap:balance;overflow-wrap:normal;word-break:keep-all;line-height:1.45;z-index:1100;pointer-events:none;box-shadow:0 6px 20px rgb(0 0 0 / .14),0 1.5px 7px rgb(0 0 0 / .12);inline-size:clamp(28ch, calc(var(--tooltip-max-ch) * 1ch), 95vw);box-sizing:border-box;opacity:1;transition:opacity 0.16s cubic-bezier(.4,0,.2,1);padding-block:12px;max-inline-size:var(--tooltip-max-fit,clamp(28ch, calc(var(--tooltip-max-ch) * 1ch), 95vw))}.info-icon-tooltip:hover::after,.info-icon-tooltip:focus::after{transform:translateX(calc(-50% + var(--tooltip-offset-x, 0px))) translateY(var(--tooltip-offset-y,0))}.info-icon-tooltip:hover::before,.info-icon-tooltip:focus::before{transform:translateX(calc(-50% + var(--tooltip-offset-x, 0px))) translateY(var(--tooltip-offset-y,0))}.nowrap-label{white-space:nowrap;display:inline-block}.backup-restore-tile .shortcut-keys{display:flex;align-items:center;gap:12px;flex-wrap:nowrap;white-space:nowrap;overflow-x:hidden}.dup-like-btn{padding:7px 22px;font-size:13px;border-radius:9999px;outline:none;font-family:inherit;-webkit-tap-highlight-color:#fff0;cursor:pointer;transition:background 0.14s,border-color 0.14s,color 0.14s;font-weight:500;color:#007aff;background:#fff0;border:1px solid rgb(0 0 0 / .12)}.dup-like-btn:hover,.dup-like-btn:focus-visible{background:rgb(0 122 255 / .08);border-color:rgb(0 122 255 / .19);color:#007aff}.dup-like-btn:active{background:rgb(0 122 255 / .16)}.class-9{accent-color:#60c35b}#dup-line1{text-wrap:normal!important;white-space:normal!important}#dup-box,#dup-box *{text-wrap:normal!important;white-space:normal!important;word-break:normal!important;overflow-wrap:normal!important}.blank-row{grid-column:span 2;height:50px}.blank-row.section-header{display:flex;align-items:flex-end;justify-content:flex-start;padding:0 .75rem 2px;min-height:24px;color:rgb(60 60 67 / .6);font-size:12px;font-weight:600;letter-spacing:.06em;line-height:1;text-transform:uppercase;white-space:nowrap}.model-picker-shortcut-grid{display:grid;grid-auto-flow:row;grid-template-columns:repeat(5,minmax(0,1fr));grid-auto-rows:auto;gap:4px;margin-bottom:12px;overflow:hidden;padding:8px 0;font-size:80%;box-sizing:border-box;background:transparent}.model-picker-shortcut-grid>.shortcut-item:nth-child(n+16){display:none}.model-picker-shortcut-grid .shortcut-item{background:var(--bg-secondary);border:1px solid var(--border-light);border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;transition:box-shadow .12s;padding:.75rem;min-height:3.5rem}.model-picker-shortcut-grid .shortcut-label{font-size:90%;color:var(--text-primary);font-weight:400;line-height:1.5;margin-bottom:6px;text-align:center}.model-picker-shortcut-grid .shortcut-keys{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:0;font-size:.9rem;color:var(--text-secondary)}.model-picker-shortcut-grid .key-text,.model-picker-shortcut-grid .platform-alt-label{font-weight:600;font-size:.9rem;color:var(--text-primary)}.model-picker-shortcut-grid .key-input{width:50px;height:2rem;border:1px solid var(--border-light);border-radius:9999px;text-align:center;font-size:.9rem;font-weight:700;background-color:var(--bg-primary);color:var(--text-secondary);pointer-events:none;margin-left:2px;margin-right:2px}.model-picker-shortcut-grid *{box-sizing:border-box}*,body{color:#000}.model-picker-shortcut-grid .shortcut-label{font-size:97.2%;}.model-picker-shortcut-grid{padding-bottom:0;margin-bottom:0;}
  `;
  // @note Shortcuts Overlay IIFE Code Below
  // ---- 2) Utils ----
  const NBSP = '\u00A0';

  const escapeHtml = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );

  const getMessage = (key, fallback = '') => {
    if (!key) return fallback;
    try {
      const msg = chrome?.i18n?.getMessage?.(key);
      if (msg) return msg;
    } catch {
      // ignore
    }
    return fallback;
  };

  const unwrapSettings = (obj) => {
    const topLevel = obj && typeof obj === 'object' ? { ...obj } : {};
    const nestedData = topLevel.data && typeof topLevel.data === 'object' ? topLevel.data : null;
    delete topLevel.data;
    delete topLevel.__meta;
    if (Object.keys(topLevel).length) return topLevel;
    if (!nestedData) return topLevel;

    // Support bare imported/export-style payloads only when sync storage does
    // not already contain live top-level settings. The runtime writes and reads
    // top-level keys, so a leftover nested `data` blob should not override them.
    return { ...nestedData };
  };

  const isAssigned = (val) => typeof val === 'string' && val.trim() && val !== NBSP;
  const applyShortcutDefaults = (settings) => {
    const next = settings && typeof settings === 'object' ? { ...settings } : {};
    const sharedShortcutDefaults =
      window.CSP_SHORTCUTS_EFFECTIVE || window.CSP_SHORTCUT_DEFAULTS || {};
    Object.keys(sharedShortcutDefaults).forEach((key) => {
      if (hasUsableShortcutSetting(next[key])) return;
      next[key] = sharedShortcutDefaults[key];
    });
    return next;
  };

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
    const activeModelConfigId =
      typeof window.ModelLabels?.normalizeActiveConfigId === 'function'
        ? window.ModelLabels.normalizeActiveConfigId(cfg?.activeModelConfigId)
        : cfg?.activeModelConfigId || 'configure-latest';
    const names =
      typeof window.ModelLabels?.resolveActionableNames === 'function'
        ? window.ModelLabels.resolveActionableNames(window.MODEL_NAMES || [])
        : window.MODEL_NAMES || [];
    const actionGroups =
      typeof window.ModelLabels?.getPopupPresentationGroups === 'function'
        ? window.ModelLabels.getPopupPresentationGroups(
          activeModelConfigId,
          names,
          cfg?.modelCatalog || null,
        )
        : typeof window.ModelLabels?.getPresentationGroups === 'function'
          ? window.ModelLabels.getPresentationGroups(activeModelConfigId, names)
          : typeof window.ModelLabels?.getActionGroups === 'function'
            ? window.ModelLabels.getActionGroups()
            : [];
    const codes =
      Array.isArray(window.__modelPickerKeyCodes) && window.__modelPickerKeyCodes.length
        ? window.__modelPickerKeyCodes.slice(0, window.ModelLabels?.MAX_SLOTS || 15)
        : typeof window.ModelLabels?.defaultKeyCodes === 'function'
          ? window.ModelLabels.defaultKeyCodes().slice(0, window.ModelLabels?.MAX_SLOTS || 15)
          : [];
    while (codes.length < (window.ModelLabels?.MAX_SLOTS || 15)) codes.push('');

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

    const resolveGroupLabel = (group) => {
      const key = group?.labelI18nKey || '';
      const localized = key ? getMessage(key, '') : '';
      return localized || group?.label || '';
    };

    const groupMarkup = actionGroups
      .map((group) => {
        const rows = (group.actions || [])
          .filter((action) => isAssigned(codes[action.slot]))
          .map((action) => {
            const label = esc(action.label || names[action.slot] || '');
            const val = displayFromCode(codes[action.slot]);
            const activeClass =
              group.id === 'configure' && action.id === activeModelConfigId
                ? ' mp-configure-item mp-configure-item-active'
                : group.id === 'configure'
                  ? ' mp-configure-item'
                  : '';
            return `
      <div class="shortcut-item${activeClass}">
        <div class="shortcut-label"><span>${label}</span></div>
        <div class="shortcut-keys">
          <span class="key-text platform-alt-label">${modLabel}</span>
          <input class="key-input" disabled maxlength="12" value="${val}" />
        </div>
      </div>
    `;
          });

        if (!rows.length) return '';

        const heading =
          group.compactLabel && resolveGroupLabel(group)
            ? `<div class="mp-subsection-label" role="heading" aria-level="3">${escapeHtml(resolveGroupLabel(group))}</div>`
            : '';

        return `
<div class="mp-grid-group" data-group="${escapeHtml(group.id || '')}">
  ${heading}
  <div class="model-picker-shortcut-grid">
    ${rows.join('')}
  </div>
</div>`;
      })
      .filter(Boolean);

    if (!groupMarkup.length) return '';

    return `
<div class="section-header" role="heading" aria-level="2" style="margin-top:0;padding-left:12px;font-size:12px;font-family:ui-sans-serif,-apple-system,system-ui,'Segoe UI',Helvetica,'Apple Color Emoji',Arial,sans-serif,'Segoe UI Emoji','Segoe UI Symbol';font-weight:600;line-height:12px;letter-spacing:0.72px;text-transform:uppercase;color:rgba(60,60,67,0.6);">
  Switch Models
</div>
${groupMarkup.join('')}`;
  }

  // ---- 3) Build overlay HTML (sections similar to popup, but only assigned shortcuts) ----
  const buildOverlayHtml = (cfg) => {
    const schemaSections = window.CSP_SETTINGS_SCHEMA?.shortcuts?.overlaySections;
    const isShortcutVisibleInCatalog = (key) => {
      const option =
        typeof window.ModelLabels?.getThinkingShortcutByStorageKey === 'function'
          ? window.ModelLabels.getThinkingShortcutByStorageKey(key)
          : null;
      if (!option?.optional) return true;
      return typeof window.ModelLabels?.hasThinkingEffortOption === 'function'
        ? window.ModelLabels.hasThinkingEffortOption(cfg?.modelCatalog || null, option.id)
        : false;
    };
    const sections = Array.isArray(schemaSections)
      ? schemaSections
      : [
        {
          header: 'Model Picker + UI Tweaks',
          keys: [
            'shortcutKeyToggleModelSelector',
            'shortcutKeyShowOverlay',
            'shortcutKeyThinkingStandard',
            'shortcutKeyThinkingExtended',
            'shortcutKeyThinkingLight',
            'shortcutKeyThinkingHeavy',
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

    const labelI18nByKey = window.CSP_SETTINGS_SCHEMA?.shortcuts?.labelI18nByKey || {};
    const renderedKeys = new Set();
    const labelForKey = (k) => {
      const i18nKey = labelI18nByKey[k];
      const msg = getMessage(i18nKey, '');
      return msg || keyToLabel(k);
    };

    for (const section of sections) {
      const rows = section.keys
        .filter((k) => isShortcutVisibleInCatalog(k))
        .filter((k) => isAssigned(cfg?.[k]))
        .map((k) => {
          renderedKeys.add(k);
          const val = cfg[k];
          return `
          <div class="shortcut-item">
            <div class="shortcut-label"><span>${escapeHtml(labelForKey(k))}</span></div>
            <div class="shortcut-keys">
              <span class="key-text platform-alt-label"> Alt + </span>
              <input class="key-input" disabled id="${k}" maxlength="12" value="${displayFromCode(val)}" />
            </div>
          </div>
        `;
        });

      if (rows.length) {
        const headerText =
          getMessage(section.headerI18nKey, section.header || '') || section.header || '';
        out.push(
          `<div class="blank-row section-header" role="heading" aria-level="2">${escapeHtml(headerText)}</div>`,
        );
        out.push(rows.join(''));
      }
    }

    // Catch-all: include any assigned shortcuts not captured by section lists/metadata.
    const keyPrefix = window.CSP_SETTINGS_SCHEMA?.shortcuts?.keyPrefix || 'shortcutKey';
    const extraShortcutKeys = window.CSP_SETTINGS_SCHEMA?.shortcuts?.extraShortcutKeys || [
      'selectThenCopy',
      'selectThenCopyAllMessages',
    ];
    const schemaDeprecated = window.CSP_SETTINGS_SCHEMA?.shortcuts?.deprecatedShortcutKeys;
    const deprecatedShortcutKeys = Array.isArray(schemaDeprecated)
      ? schemaDeprecated
      : ['shortcutKeyRegenerate', 'shortcutKeyCopyAllResponses'];

    const catchAllKeys = Object.keys(cfg)
      .filter((k) => k.startsWith(keyPrefix) || extraShortcutKeys.includes(k))
      .filter((k) => !deprecatedShortcutKeys.includes(k))
      .filter((k) => isShortcutVisibleInCatalog(k))
      .filter((k) => isAssigned(cfg?.[k]))
      .filter((k) => !renderedKeys.has(k))
      .sort((a, b) => a.localeCompare(b));

    if (catchAllKeys.length) {
      out.push(`<div class="blank-row section-header" role="heading" aria-level="2">Other</div>`);
      out.push(
        catchAllKeys
          .map((k) => {
            renderedKeys.add(k);
            const val = cfg[k];
            return `
            <div class="shortcut-item">
              <div class="shortcut-label"><span>${escapeHtml(labelForKey(k))}</span></div>
              <div class="shortcut-keys">
                <span class="key-text platform-alt-label"> Alt + </span>
                <input class="key-input" disabled id="${k}" maxlength="12" value="${displayFromCode(val)}" />
              </div>
            </div>
          `;
          })
          .join(''),
      );
    }

    out.push(`</div></div>`);
    return out.join('');
  };

  // ---- 4) Show/close overlay (injecting CSS, scrolling) ----
  const OVERLAY_ID = 'csp-shortcut-overlay';

  const showShortcutOverlay = async (cfg) => {
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

    // Variables to shift position slightly here   ↓
    const CLOSE_BTN_SHIFT_TOP = -12; // negative = up, positive = down, in px
    const CLOSE_BTN_SHIFT_RIGHT = -12; // negative = closer to edge, positive = further left, in px

    shadow.innerHTML = `
    <link rel="stylesheet" href="${chrome.runtime.getURL('popup.css')}">
    <style>${FULL_POPUP_CSS}</style>
    <style>
      .material-symbols-outlined,
      .material-icons-outlined,
      .msr {
        display: inline-block;
        line-height: 1;
        letter-spacing: normal;
        text-transform: none;
        white-space: nowrap;
        word-wrap: normal;
        direction: ltr;
        vertical-align: middle;
        font-style: normal;
        font-weight: normal;
        -webkit-font-feature-settings: 'liga';
        font-feature-settings: 'liga';
        -webkit-font-smoothing: antialiased;
      }

      .material-symbols-outlined {
        font-family: 'CSP Material Symbols Outlined', sans-serif;
        font-variation-settings:
          'FILL' 0,
          'wght' 400,
          'GRAD' 0,
          'opsz' 24;
      }

      .material-icons-outlined,
      .msr {
        font-family: 'CSP Material Symbols Rounded', sans-serif;
      }

      .material-icons-outlined {
        font-variation-settings:
          'FILL' 0,
          'wght' 400,
          'GRAD' 0,
          'opsz' 24;
      }

      .msr {
        font-variation-settings:
          'FILL' 0,
          'wght' 500,
          'GRAD' 0,
          'opsz' 24;
      }

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
  // ---- 5) Read settings and open overlay on Alt + configured key ----
  let overlayContextInvalidated = false;
  let overlayContextInvalidatedLogged = false;

  const markOverlayContextInvalidated = (err) => {
    overlayContextInvalidated = true;
    if (overlayContextInvalidatedLogged) return;
    overlayContextInvalidatedLogged = true;
    console.warn(
      '[CSP] overlay disabled (extension reloaded while tab is open). Reload the page to re-enable.',
      err,
    );
  };

  const isExtensionAlive = () =>
    typeof chrome !== 'undefined' &&
    !overlayContextInvalidated &&
    !!chrome.runtime &&
    !!chrome.runtime.id &&
    !!chrome.storage?.sync;

  // Configurable shortcuts overlay key (Alt + <key>)
  const showOverlayDefaultCode = getSchemaShortcutDefaultCode(
    'shortcutKeyShowOverlay',
    'Period',
  );
  let showOverlayCode = showOverlayDefaultCode;

  const normalizeShowOverlaySettingToCode = (stored) => {
    if (stored == null) return '';
    const s = String(stored).trim();
    if (!s || s === '\u00A0') return '';
    if (s.length === 1) return typeof charToCode === 'function' ? charToCode(s) : '';
    return s;
  };

  const usesLegacyShowOverlayTestDefault = (stored) => {
    if (stored == null) return false;
    const s = String(stored).trim();
    return s === 'i' || s === 'I' || s === 'KeyI' || s === 'keyi';
  };

  const persistShowOverlayDefaultCode = () => {
    if (!isExtensionAlive()) return;
    try {
      chrome.storage.sync.set({ shortcutKeyShowOverlay: showOverlayDefaultCode }, () => {
        if (!chrome.runtime.lastError) return;
        console.warn(
          '[CSP] storage.set(shortcutKeyShowOverlay) failed:',
          chrome.runtime.lastError,
        );
      });
    } catch (err) {
      if (
        /context invalidated/i.test(err?.message || '') ||
        /Extension context invalidated/i.test(err?.message || '')
      ) {
        markOverlayContextInvalidated(err);
      }
      console.warn('[CSP] storage.set(shortcutKeyShowOverlay) threw:', err);
    }
  };

  const setShowOverlayCode = (stored) => {
    if (stored == null) {
      showOverlayCode = showOverlayDefaultCode;
      return;
    }
    if (usesLegacyShowOverlayTestDefault(stored)) {
      showOverlayCode = showOverlayDefaultCode;
      persistShowOverlayDefaultCode();
      return;
    }
    showOverlayCode = normalizeShowOverlaySettingToCode(stored);
  };

  const hydrateShowOverlayCode = () => {
    if (!isExtensionAlive()) return;
    try {
      chrome.storage.sync.get({ shortcutKeyShowOverlay: showOverlayDefaultCode }, (res = {}) => {
        if (!isExtensionAlive()) return;
        if (chrome.runtime.lastError) {
          if (
            /context invalidated/i.test(chrome.runtime.lastError.message || '') ||
            /Extension context invalidated/i.test(chrome.runtime.lastError.message || '')
          ) {
            markOverlayContextInvalidated(chrome.runtime.lastError);
          }
          console.warn(
            '[CSP] storage.get(shortcutKeyShowOverlay) failed:',
            chrome.runtime.lastError,
          );
          return;
        }
        setShowOverlayCode(res.shortcutKeyShowOverlay);
      });
    } catch (err) {
      if (
        /context invalidated/i.test(err?.message || '') ||
        /Extension context invalidated/i.test(err?.message || '')
      ) {
        markOverlayContextInvalidated(err);
      }
      console.warn('[CSP] storage.get(shortcutKeyShowOverlay) threw:', err);
    }
  };

  hydrateShowOverlayCode();
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      if (!changes || !changes.shortcutKeyShowOverlay) return;
      setShowOverlayCode(changes.shortcutKeyShowOverlay.newValue);
    });
  } catch (_) { }

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
            if (
              /context invalidated/i.test(chrome.runtime.lastError.message || '') ||
              /Extension context invalidated/i.test(chrome.runtime.lastError.message || '')
            ) {
              markOverlayContextInvalidated(chrome.runtime.lastError);
            }
            console.warn('[CSP] storage.get(all) failed:', chrome.runtime.lastError);
            resolve({});
            return;
          }
          const settings = unwrapSettings(raw);
          resolve(applyShortcutDefaults(settings));
        });
      } catch (err) {
        if (
          /context invalidated/i.test(err?.message || '') ||
          /Extension context invalidated/i.test(err?.message || '')
        ) {
          markOverlayContextInvalidated(err);
        }
        console.warn('[CSP] storage.get(all) threw:', err);
        resolve({});
      }
    });

  const hydrateModelData = () =>
    new Promise((resolve) => {
      if (!isExtensionAlive()) return resolve();

      const MAX = window.ModelLabels?.MAX_SLOTS || 15;
      const defaultNames = (raw) =>
        typeof window.ModelLabels?.resolveActionableNames === 'function'
          ? window.ModelLabels.resolveActionableNames(raw)
          : ['Instant', 'Thinking', 'Configure...', 'Latest', '5.2', '5.0 Thinking Mini', 'o3'];
      const buildDefaultCodes = () =>
        typeof window.ModelLabels?.defaultKeyCodes === 'function'
          ? window.ModelLabels.defaultKeyCodes()
          : ['Digit1', 'Digit2', 'Digit0', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'];

      try {
        chrome.storage.sync.get(['modelNames', 'modelPickerKeyCodes', 'modelCatalog'], (res = {}) => {
          if (!isExtensionAlive()) return resolve();
          if (chrome.runtime.lastError) {
            if (
              /context invalidated/i.test(chrome.runtime.lastError.message || '') ||
              /Extension context invalidated/i.test(chrome.runtime.lastError.message || '')
            ) {
              markOverlayContextInvalidated(chrome.runtime.lastError);
            }
            console.warn('[CSP] storage.get(model*) failed:', chrome.runtime.lastError);
            return resolve();
          }
          try {
            const rawNames = Array.isArray(res.modelNames) ? res.modelNames.slice(0, MAX) : [];
            const names = defaultNames(rawNames).slice(0, MAX);
            const codes = Array.isArray(res.modelPickerKeyCodes)
              ? res.modelPickerKeyCodes.slice(0, MAX)
              : buildDefaultCodes().slice(0, MAX);

            while (codes.length < MAX) codes.push('');
            window.__modelCatalog =
              res.modelCatalog && typeof res.modelCatalog === 'object' ? res.modelCatalog : null;
            window.MODEL_NAMES = names;
            window.__modelPickerKeyCodes = codes;
          } catch (err) {
            if (
              /context invalidated/i.test(err?.message || '') ||
              /Extension context invalidated/i.test(err?.message || '')
            ) {
              markOverlayContextInvalidated(err);
            }
            console.warn('[CSP] hydrateModelData error:', err);
          }
          resolve();
        });
      } catch (err) {
        if (
          /context invalidated/i.test(err?.message || '') ||
          /Extension context invalidated/i.test(err?.message || '')
        ) {
          markOverlayContextInvalidated(err);
        }
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
    const altOnly = e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    if (!altOnly) return;

    const desired = showOverlayCode;
    if (!desired) return;

    const isSlashLike = desired === 'Slash' || desired === 'NumpadDivide';
    const matchesKey = isSlashLike
      ? e.code === 'Slash' || e.code === 'NumpadDivide' || e.key === '/'
      : codeEquals(desired, e.code);

    if (!matchesKey) return;
    if (!isExtensionAlive()) return;
    e.preventDefault();
    e.stopPropagation();

    Promise.all([getAllSettings(), hydrateModelData()])
      .then(([cfg]) => {
        if (!isExtensionAlive()) return;
        // last guard: DOM might be gone if tab navigated between keydown and resolve
        if (!document || !document.body) return;
        showShortcutOverlay(cfg || {}).catch((err) => {
          console.warn('[CSP] overlay render failed:', err);
        });
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

// ===============================================
// Highlight bold text in custom color (gated via MV3 setting)
// Content script IIFE for ChatGPT Custom Shortcuts Pro
// ===============================================
(() => {
  // biome-ignore lint/suspicious/noRedundantUseStrict: IIFE strict mode needed
  'use strict';

  const STYLE_ID = 'csp-color-bold-text-style';
  const DEFAULT_LIGHT_COLOR = '#2037e6';
  const DEFAULT_DARK_COLOR = '#4da3ff';

  const host = () => document.head || document.documentElement;

  const buildCSS = (lightColor, darkColor) => `
    .light b, .light strong { color: ${lightColor} !important; }
    .dark  b, .dark  strong { color: ${darkColor} !important; }
  `;

  const enable = (lightColor, darkColor) => {
    const css = buildCSS(lightColor || DEFAULT_LIGHT_COLOR, darkColor || DEFAULT_DARK_COLOR);
    let s = document.getElementById(STYLE_ID);
    if (s) {
      s.textContent = css;
    } else {
      s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = css;
      host().appendChild(s);
    }
  };

  const disable = () => {
    const s = document.getElementById(STYLE_ID);
    if (s) s.remove();
  };

  const apply = (on, lightColor, darkColor) => {
    if (on) {
      enable(lightColor, darkColor);
    } else {
      disable();
    }
  };

  // Initial load
  chrome.storage.sync.get(
    {
      colorBoldTextEnabled: false,
      colorBoldTextLightColor: DEFAULT_LIGHT_COLOR,
      colorBoldTextDarkColor: DEFAULT_DARK_COLOR,
    },
    ({ colorBoldTextEnabled, colorBoldTextLightColor, colorBoldTextDarkColor }) => {
      apply(!!colorBoldTextEnabled, colorBoldTextLightColor, colorBoldTextDarkColor);
    },
  );

  // Listen for changes
  chrome.storage.onChanged.addListener((chg, area) => {
    if (area !== 'sync') return;

    const relevantKeys = [
      'colorBoldTextEnabled',
      'colorBoldTextLightColor',
      'colorBoldTextDarkColor',
    ];
    if (!relevantKeys.some((key) => key in chg)) return;

    chrome.storage.sync.get(
      {
        colorBoldTextEnabled: false,
        colorBoldTextLightColor: DEFAULT_LIGHT_COLOR,
        colorBoldTextDarkColor: DEFAULT_DARK_COLOR,
      },
      ({ colorBoldTextEnabled, colorBoldTextLightColor, colorBoldTextDarkColor }) => {
        apply(!!colorBoldTextEnabled, colorBoldTextLightColor, colorBoldTextDarkColor);
      },
    );
  });
})();

// ==========================================================
// Hide pasted files in the ChatGPT Library (gated by setting)
// ==========================================================

(() => {
  const STORAGE_KEY = 'hidePastedLibraryFilesEnabled';
  const STYLE_ID = 'csp-library-hide-pasted-style';
  const CONTROL_ATTR = 'data-csp-library-pasted-toggle';
  const HIDDEN_ATTR = 'data-csp-library-pasted-hidden';
  const LABEL_KEY = 'label_hide_pasted_library_files';
  const TOOLTIP_KEY = 'tt_hide_pasted_library_files';
  const TOP_CONTROLS_SELECTOR = '[data-testid="artifacts-surface-top-controls"]';
  const PAGE_ROOT_SELECTOR = 'main#main';
  const CONTROL_SETTLE_MS = 260;
  const HIDE_FILENAME_TOKENS = Object.freeze([
    'pasted',
    'pegado',
    '貼り付けられた',
    'вставлен',
    'insertion',
    'चिपकाया',
  ]);

  const state = {
    enabled: false,
    contextInvalidated: false,
    onLibraryRoute: false,
    controlRefreshToken: 0,
    topControlsObserver: null,
    topControlsObservationRoot: null,
    resultsObserver: null,
    resultsObservationRoot: null,
  };

  const debounce =
    typeof createDebounce === 'function'
      ? createDebounce
      : (fn, wait = 80) => {
          let timer = null;
          return (...args) => {
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
              timer = null;
              fn(...args);
            }, wait);
          };
        };

  const isContextInvalidatedError = (err) =>
    /context invalidated/i.test(String(err?.message || err || '')) ||
    /Extension context invalidated/i.test(String(err?.message || err || ''));

  const markContextInvalidated = (err) => {
    if (state.contextInvalidated) return;
    state.contextInvalidated = true;
    state.onLibraryRoute = false;
    console.warn(
      '[CSP] Hide Pasted Files disabled in this tab because the extension was reloaded. Refresh the page to re-enable it.',
      err,
    );
    try {
      state.controlRefreshToken += 1;
      state.topControlsObserver?.disconnect();
      state.topControlsObserver = null;
      state.topControlsObservationRoot = null;
      state.resultsObserver?.disconnect();
      state.resultsObserver = null;
      state.resultsObservationRoot = null;
      document.querySelectorAll(`[${CONTROL_ATTR}="true"]`).forEach((el) => {
        el.remove();
      });
      document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
        el.removeAttribute(HIDDEN_ATTR);
      });
    } catch {}
  };

  const isExtensionAlive = () => {
    try {
      return !state.contextInvalidated && !!chrome?.runtime?.id && !!chrome?.storage?.sync && !!chrome?.storage?.local;
    } catch {
      return false;
    }
  };
  if (!isExtensionAlive()) return;

  const getMessage = (key, fallback) => {
    try {
      return chrome?.i18n?.getMessage?.(key) || fallback;
    } catch {
      return fallback;
    }
  };

  const storageGetSync = (defaults, callback) => {
    if (!isExtensionAlive()) {
      callback(defaults || {});
      return;
    }
    try {
      chrome.storage.sync.get(defaults, (items = {}) => {
        if (!isExtensionAlive()) {
          callback(defaults || {});
          return;
        }
        if (chrome.runtime.lastError) {
          if (isContextInvalidatedError(chrome.runtime.lastError)) {
            markContextInvalidated(chrome.runtime.lastError);
          }
          callback(defaults || {});
          return;
        }
        callback(items || {});
      });
    } catch (err) {
      if (isContextInvalidatedError(err)) {
        markContextInvalidated(err);
      }
      callback(defaults || {});
    }
  };

  const storageSetSync = (items) => {
    if (!isExtensionAlive()) return;
    try {
      chrome.storage.sync.set(items, () => {
        if (!isExtensionAlive()) return;
        if (chrome.runtime.lastError && isContextInvalidatedError(chrome.runtime.lastError)) {
          markContextInvalidated(chrome.runtime.lastError);
        }
      });
    } catch (err) {
      if (isContextInvalidatedError(err)) {
        markContextInvalidated(err);
      }
    }
  };

  const isLibraryRoute = () => {
    const hostname = location.hostname.replace(/^www\./, '');
    const pathname = location.pathname || '';
    return hostname === 'chatgpt.com' && (pathname === '/library' || pathname.startsWith('/library/'));
  };

  const normalizeFilenameText = (value) => String(value || '').normalize('NFKC').toLocaleLowerCase();
  const shouldHideFilename = (name) => {
    const normalizedName = normalizeFilenameText(name);
    return HIDE_FILENAME_TOKENS.some((token) => normalizedName.includes(normalizeFilenameText(token)));
  };

  const getPageRoot = () => document.querySelector(PAGE_ROOT_SELECTOR);

  const getTopControls = () => document.querySelector(TOP_CONTROLS_SELECTOR);

  const getTopControlsObservationRoot = () => document.body || document.documentElement;

  const getControlNode = () => document.querySelector(`[${CONTROL_ATTR}="true"]`);

  const afterTwoPaints = (fn) => {
    const raf = window.requestAnimationFrame?.bind(window);
    if (typeof raf !== 'function') {
      window.setTimeout(() => window.setTimeout(fn, 16), 16);
      return;
    }
    raf(() => raf(fn));
  };

  const getControlAnchor = () => {
    const topControls = getTopControls();
    if (!(topControls instanceof Element) || !topControls.isConnected) return null;

    const actionGroup = findActionGroup(topControls);
    if (!(actionGroup instanceof Element) || !actionGroup.isConnected) return null;

    const filterButton = actionGroup.querySelector('button[aria-haspopup="menu"]');
    if (!(filterButton instanceof HTMLElement) || !filterButton.isConnected) return null;

    return { topControls, actionGroup, filterButton };
  };

  const sameControlAnchor = (left, right) =>
    !!left &&
    !!right &&
    left.topControls === right.topControls &&
    left.actionGroup === right.actionGroup &&
    left.filterButton === right.filterButton;

  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
[${CONTROL_ATTR}="true"] {
  display: inline-flex;
  align-items: center;
  margin-inline-end: 1em;
  flex: 0 0 auto;
}

[${CONTROL_ATTR}="true"] [data-csp-library-pasted-button="true"] {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 999px;
  color: var(--token-icon-tertiary, var(--token-text-secondary, inherit));
  cursor: pointer;
  display: inline-flex;
  gap: 6px;
  height: 36px;
  justify-content: center;
  padding: 0 12px;
  transition:
    background-color 0.16s ease,
    color 0.16s ease,
    opacity 0.16s ease;
  white-space: nowrap;
}

[${CONTROL_ATTR}="true"] [data-csp-library-pasted-button="true"]:hover {
  background: var(--token-bg-tertiary, rgba(127, 127, 127, 0.12));
  color: var(--token-text-primary, inherit);
}

[${CONTROL_ATTR}="true"] [data-csp-library-pasted-button="true"][aria-pressed="true"] {
  background: var(--token-bg-tertiary, rgba(127, 127, 127, 0.12));
  color: var(--token-text-primary, inherit);
}

[${CONTROL_ATTR}="true"] [data-csp-library-pasted-button="true"]:focus-visible {
  outline: 2px solid var(--token-ring, var(--token-text-primary, currentColor));
  outline-offset: 2px;
}

[${CONTROL_ATTR}="true"] [data-csp-library-pasted-label="true"] {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 16px;
  white-space: nowrap;
}

[${CONTROL_ATTR}="true"] [data-csp-library-pasted-icon="true"] {
  align-items: center;
  display: inline-flex;
  height: 16px;
  justify-content: center;
  width: 16px;
}

[${CONTROL_ATTR}="true"] [data-csp-library-pasted-icon="true"] svg {
  fill: none;
  height: 16px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
  width: 16px;
}

[${HIDDEN_ATTR}] {
  display: none !important;
}
`;
    (document.head || document.documentElement).appendChild(style);
  };

  const getTooltipText = () =>
    getMessage(
      TOOLTIP_KEY,
      'Hide files in the Library whose names contain "Pasted". Turn it off to show them again.',
    );

  const getLabelText = () => getMessage(LABEL_KEY, 'Hide Pasted Files');

  const getIconMarkup = (enabled) =>
    enabled
      ? `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <path d="M1.5 8c1.8-2.7 4-4 6.5-4s4.7 1.3 6.5 4c-1.8 2.7-4 4-6.5 4S3.3 10.7 1.5 8Z"></path>
  <path d="M3 13 13 3"></path>
</svg>`
      : `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <path d="M1.5 8c1.8-2.7 4-4 6.5-4s4.7 1.3 6.5 4c-1.8 2.7-4 4-6.5 4S3.3 10.7 1.5 8Z"></path>
  <circle cx="8" cy="8" r="2.1"></circle>
</svg>`;

  const updateControlState = () => {
    const control = getControlNode();
    if (!(control instanceof Element)) return;

    const button = control.querySelector('[data-csp-library-pasted-button="true"]');
    if (button instanceof HTMLButtonElement) {
      button.setAttribute('aria-label', getTooltipText());
      button.setAttribute('aria-pressed', state.enabled ? 'true' : 'false');
      button.setAttribute('title', getTooltipText());
    }

    const label = control.querySelector('[data-csp-library-pasted-label="true"]');
    if (label) {
      label.textContent = getLabelText();
    }

    const icon = control.querySelector('[data-csp-library-pasted-icon="true"]');
    if (icon instanceof HTMLElement) {
      icon.innerHTML = getIconMarkup(state.enabled);
    }

    control.setAttribute('title', getTooltipText());
  };

  const findActionGroup = (topControls) => {
    if (!(topControls instanceof Element)) return null;

    return Array.from(topControls.children).find(
      (child) =>
        child instanceof Element &&
        child.querySelector('button[aria-haspopup="menu"]') &&
        child.querySelector('button[aria-pressed]'),
    );
  };

  const createControl = () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute(CONTROL_ATTR, 'true');
    wrapper.setAttribute('title', getTooltipText());

    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      'relative flex h-9 items-center justify-center gap-1.5 rounded-full px-3 transition-colors focus-visible:ring-token-ring focus-visible:ring-2 focus-visible:outline-none';
    button.setAttribute('data-csp-library-pasted-button', 'true');
    button.addEventListener('click', () => {
      const nextEnabled = !state.enabled;
      setEnabled(nextEnabled);
      storageSetSync({ [STORAGE_KEY]: nextEnabled });
    });

    const icon = document.createElement('span');
    icon.setAttribute('data-csp-library-pasted-icon', 'true');
    icon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.setAttribute('data-csp-library-pasted-label', 'true');
    label.textContent = getLabelText();
    label.setAttribute('dir', 'auto');

    button.append(icon, label);
    wrapper.append(button);
    updateControlState();
    return wrapper;
  };

  const injectLibraryToggle = (anchor = getControlAnchor()) => {
    if (!state.onLibraryRoute || !anchor) return false;

    const { actionGroup, filterButton } = anchor;
    const existingControls = Array.from(document.querySelectorAll(`[${CONTROL_ATTR}="true"]`));
    existingControls.forEach((node) => {
      if (node.parentElement !== actionGroup) node.remove();
    });

    let control = actionGroup.querySelector(`[${CONTROL_ATTR}="true"]`);
    if (!(control instanceof Element)) {
      control = createControl();
      actionGroup.insertBefore(control, filterButton);
    } else if (control.nextElementSibling !== filterButton) {
      actionGroup.insertBefore(control, filterButton);
    }

    updateControlState();
    return true;
  };

  const readText = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

  const collectLibraryItems = () => {
    const root = getPageRoot();
    if (!(root instanceof Element)) return [];

    const out = [];
    const seen = new Set();

    root.querySelectorAll('[data-testid^="artifact-card-title-container-"]').forEach((titleContainer) => {
      const button = titleContainer.closest('button[type="button"]');
      const itemRoot = button?.parentElement;
      if (!(itemRoot instanceof HTMLElement) || seen.has(itemRoot)) return;

      seen.add(itemRoot);
      out.push({
        itemRoot,
        filename: readText(titleContainer.querySelector('span') || titleContainer),
      });
    });

    root.querySelectorAll('button[data-testid^="artifact-checkbox-bridge-file_"]').forEach((bridgeButton) => {
      const itemRoot = bridgeButton.closest('[role="button"]');
      if (!(itemRoot instanceof HTMLElement) || seen.has(itemRoot)) return;

      seen.add(itemRoot);
      out.push({
        itemRoot,
        filename: readText(itemRoot.querySelector('.text-token-text-primary')),
      });
    });

    return out;
  };

  const restoreHiddenItems = () => {
    document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
      el.removeAttribute(HIDDEN_ATTR);
    });
  };

  const applyLibraryFilter = () => {
    if (!state.onLibraryRoute) {
      restoreHiddenItems();
      return;
    }

    if (getControlNode()) {
      updateControlState();
    } else {
      scheduleControlRefresh();
    }

    const items = collectLibraryItems();
    if (!items.length) {
      if (!state.enabled) restoreHiddenItems();
      return;
    }

    // Hide/show the existing item nodes instead of rebuilding the Library DOM.
    items.forEach(({ itemRoot, filename }) => {
      if (state.enabled && shouldHideFilename(filename)) {
        itemRoot.setAttribute(HIDDEN_ATTR, '');
        return;
      }

      itemRoot.removeAttribute(HIDDEN_ATTR);
    });

    if (!state.enabled) restoreHiddenItems();
  };

  const runControlRefresh = debounce((requestToken) => {
    if (!state.onLibraryRoute || requestToken !== state.controlRefreshToken) return;

    const anchor = getControlAnchor();
    if (!anchor) return;

    afterTwoPaints(() => {
      if (!state.onLibraryRoute || requestToken !== state.controlRefreshToken) return;

      const settledAnchor = getControlAnchor();
      if (!sameControlAnchor(anchor, settledAnchor)) {
        scheduleControlRefresh();
        return;
      }

      injectLibraryToggle(settledAnchor);
    });
  }, CONTROL_SETTLE_MS);

  const scheduleControlRefresh = () => {
    state.controlRefreshToken += 1;
    runControlRefresh(state.controlRefreshToken);
  };

  const scheduleFilterRefresh = debounce(() => {
    if (!state.onLibraryRoute || !state.enabled) return;
    applyLibraryFilter();
    ensureResultsObserver();
  }, 70);

  const teardownResultsObserver = () => {
    state.resultsObserver?.disconnect();
    state.resultsObserver = null;
    state.resultsObservationRoot = null;
  };

  const ensureResultsObserver = () => {
    if (!state.onLibraryRoute || !state.enabled) return;

    const root = getPageRoot();
    if (!(root instanceof Node)) return;
    if (state.resultsObserver && state.resultsObservationRoot === root) return;

    teardownResultsObserver();

    state.resultsObserver = new MutationObserver((mutations) => {
      if (!state.onLibraryRoute || !state.enabled || !mutations.length) return;
      scheduleFilterRefresh();
    });

    state.resultsObserver.observe(root, { childList: true, subtree: true });
    state.resultsObservationRoot = root;
  };

  const teardownTopControlsObserver = () => {
    state.topControlsObserver?.disconnect();
    state.topControlsObserver = null;
    state.topControlsObservationRoot = null;
  };

  const ensureTopControlsObserver = () => {
    if (!state.onLibraryRoute) return;

    const root = getTopControlsObservationRoot();
    if (!(root instanceof Node)) return;
    if (state.topControlsObserver && state.topControlsObservationRoot === root) return;

    teardownTopControlsObserver();

    state.topControlsObserver = new MutationObserver((mutations) => {
      if (!state.onLibraryRoute || !mutations.length) return;

      const nextRoot = getTopControlsObservationRoot();
      if (nextRoot instanceof Node && nextRoot !== state.topControlsObservationRoot) {
        ensureTopControlsObserver();
        if (state.enabled) ensureResultsObserver();
        scheduleControlRefresh();
        return;
      }

      const controlMissing = !getControlNode();
      const controlAnchorPresent = !!getControlAnchor();
      const touchesTopControls = mutations.some(
        (mutation) => {
          const target = mutation.target;
          if (
            target instanceof Element &&
            (target.matches(TOP_CONTROLS_SELECTOR) || !!target.closest(TOP_CONTROLS_SELECTOR))
          ) {
            return true;
          }

          return (
            Array.from(mutation.addedNodes).some(
              (node) =>
                node instanceof Element &&
                (node.matches(TOP_CONTROLS_SELECTOR) || !!node.querySelector(TOP_CONTROLS_SELECTOR)),
            ) ||
            Array.from(mutation.removedNodes).some(
              (node) =>
                node instanceof Element &&
                (node.matches(TOP_CONTROLS_SELECTOR) || !!node.querySelector(TOP_CONTROLS_SELECTOR)),
            )
          );
        },
      );

      if ((controlMissing && controlAnchorPresent) || touchesTopControls) scheduleControlRefresh();
    });

    state.topControlsObserver.observe(root, { childList: true, subtree: true });
    state.topControlsObservationRoot = root;
  };

  const teardownLibraryRoute = () => {
    state.onLibraryRoute = false;
    state.controlRefreshToken += 1;
    teardownTopControlsObserver();
    teardownResultsObserver();
    restoreHiddenItems();
    getControlNode()?.remove();
  };

  const refreshRouteState = () => {
    if (state.contextInvalidated) return;
    if (!isLibraryRoute()) {
      teardownLibraryRoute();
      return;
    }

    state.onLibraryRoute = true;
    ensureStyle();
    scheduleControlRefresh();
    ensureTopControlsObserver();

    if (state.enabled) {
      applyLibraryFilter();
      ensureResultsObserver();
      return;
    }

    teardownResultsObserver();
    restoreHiddenItems();
  };

  const scheduleRouteRefresh = debounce(refreshRouteState, 40);

  const kickRouteRefresh = () => {
    if (state.contextInvalidated) return;
    scheduleRouteRefresh();
    window.requestAnimationFrame?.(() => {
      window.requestAnimationFrame?.(() => {
        scheduleRouteRefresh();
      });
    });
    window.setTimeout(scheduleRouteRefresh, 180);
  };

  const setEnabled = (enabled) => {
    state.enabled = enabled === true;
    window[STORAGE_KEY] = state.enabled;
    updateControlState();

    if (!state.onLibraryRoute) return;

    if (!state.enabled) {
      teardownResultsObserver();
      restoreHiddenItems();
      return;
    }

    applyLibraryFilter();
    ensureResultsObserver();
  };

  document.addEventListener(
    'click',
    (event) => {
      const anchor = event.target.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      let targetPath = '';
      try {
        targetPath = new URL(anchor.href, location.origin).pathname || '';
      } catch {
        return;
      }

      if (!state.onLibraryRoute && targetPath !== '/library' && !targetPath.startsWith('/library/')) {
        return;
      }

      kickRouteRefresh();
    },
    { capture: true },
  );

  window.addEventListener('popstate', kickRouteRefresh);
  window.addEventListener('hashchange', kickRouteRefresh);

  storageGetSync({ [STORAGE_KEY]: false }, (data) => {
    setEnabled(data?.[STORAGE_KEY] === true);
    kickRouteRefresh();
  });

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (!isExtensionAlive()) return;
      if (area !== 'sync' || !(STORAGE_KEY in changes)) return;
      setEnabled(changes[STORAGE_KEY]?.newValue === true);
      kickRouteRefresh();
    });
  } catch (err) {
    if (isContextInvalidatedError(err)) {
      markContextInvalidated(err);
    }
  }
})();
