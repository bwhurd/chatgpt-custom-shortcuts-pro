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
const CONVERSATION_TURN_SELECTOR = '[data-testid^="conversation-turn-"]';

function stabilizeConversationScrollContainer(container) {
  if (container instanceof HTMLElement) {
    container.style.overflowAnchor = 'none';
  }
  return container;
}

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
  const firstMessage = document.querySelector(CONVERSATION_TURN_SELECTOR);
  if (!firstMessage) return null;

  let container = firstMessage.parentElement;
  while (container && container !== document.body) {
    const style = getComputedStyle(container);
    if (
      container.scrollHeight > container.clientHeight &&
      style.overflowY !== 'visible' &&
      style.overflowY !== 'hidden'
    ) {
      return stabilizeConversationScrollContainer(container);
    }
    container = container.parentElement;
  }
  return stabilizeConversationScrollContainer(document.scrollingElement || document.documentElement);
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
    hidePastedLibraryFilesEnabled: false,
  };
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

// Runtime bridge: later IIFEs call this after storage changes update visibility settings.
window.applyVisibilitySettings = applyVisibilitySettings;

// Runtime bridge: early slim-sidebar fallback controls.
// The feature IIFE later owns timers/state and overwrites window.flashSlimSidebarBar.
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
  // Delegate if a stateful slim-sidebar flash implementation was already attached.
  if (typeof window._flashSlimSidebarBar === 'function') {
    window._flashSlimSidebarBar(dur);
    return;
  }
  // Fallback before the slim-sidebar feature owns bar state: snap to 1, then fade to idle.
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

// --- Shortcut normalization helpers (runtime bridge source) -----------------

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

// Runtime bridge: shortcut normalization used by overlay and model-picker blocks.
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
// ==== Shared flashBorder helper (canonical GSAP visual cue) =========
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

// Runtime bridge: keep both names for existing IIFE callers; DELAYS is canonical.
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
// @note Code box line-wrap toggle implementation
// ==================================================
(() => {
  const ROOT_CLASS = 'csp-codebox-wrap-enabled';
  const STYLE_ID = 'csp-codebox-wrap-style';
  const CODEMIRROR_CODE_SELECTOR = 'div[id="code-block-viewer"].cm-editor .cm-content code';
  const CODEMIRROR_LINE_SELECTOR =
    'div[id="code-block-viewer"].cm-editor .cm-content code > span';
  const LINE_INDENT_ATTR = 'data-csp-codebox-wrap-line-indent';
  const LEGACY_INDENT_ATTR = 'data-csp-codebox-wrap-indent';

  const buildStyleText = () => `
      html.${ROOT_CLASS} div[id="code-block-viewer"].cm-editor,
      html.${ROOT_CLASS} div[id="code-block-viewer"].cm-editor .cm-scroller,
      html.${ROOT_CLASS} div[id="code-block-viewer"].cm-editor .cm-content,
      html.${ROOT_CLASS} div[id="code-block-viewer"].cm-editor .cm-content code,
      html.${ROOT_CLASS} pre:not(.cm-content) {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
      }

      html.${ROOT_CLASS} div[id="code-block-viewer"].cm-editor .cm-scroller,
      html.${ROOT_CLASS} pre:not(.cm-content) {
        overflow-x: hidden !important;
      }

      html.${ROOT_CLASS} div[id="code-block-viewer"].cm-editor .cm-content,
      html.${ROOT_CLASS} div[id="code-block-viewer"].cm-editor .cm-line,
      html.${ROOT_CLASS} div[id="code-block-viewer"].cm-editor .cm-content code,
      html.${ROOT_CLASS} div[id="code-block-viewer"].cm-editor .cm-content span,
      html.${ROOT_CLASS} pre:not(.cm-content),
      html.${ROOT_CLASS} pre:not(.cm-content) > code {
        white-space: pre-wrap !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
      }

      html.${ROOT_CLASS} div[id="code-block-viewer"].cm-editor .cm-content {
        flex-shrink: 1 !important;
      }

      html.${ROOT_CLASS} div[id="code-block-viewer"].cm-editor .cm-content code > span[${LINE_INDENT_ATTR}] {
        box-sizing: border-box !important;
        display: block !important;
        max-width: 100% !important;
        padding-inline-start: var(--csp-codebox-wrap-indent, 0ch) !important;
        text-indent: calc(-1 * var(--csp-codebox-wrap-indent, 0ch)) !important;
      }

      html.${ROOT_CLASS} div[id="code-block-viewer"].cm-editor .cm-content code > span[${LINE_INDENT_ATTR}] + br {
        display: none !important;
      }
    `;

  const ensureStyle = () => {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = buildStyleText();
  };

  const measureIndentCh = (text) => {
    let width = 0;
    for (const ch of text) {
      if (ch === ' ') {
        width += 1;
      } else if (ch === '\t') {
        width += 4;
      }
    }
    return width;
  };

  const getHangingIndentCh = (text) => {
    const raw = String(text || '');
    const leadingWhitespace = raw.match(/^[ \t]*/)?.[0] || '';
    const afterWhitespace = raw.slice(leadingWhitespace.length);
    const listMarker = afterWhitespace.match(/^(?:[-*+]|(?:\d+|[a-zA-Z])[.)])\s+/)?.[0] || '';
    const dashedBulletOffset = /^-\s+/.test(afterWhitespace) ? 1 : 0;
    const indent = measureIndentCh(leadingWhitespace) + measureIndentCh(listMarker) + dashedBulletOffset;
    return Math.max(0, Math.min(indent, 40));
  };

  const clearCodeboxWrapIndents = () => {
    document.querySelectorAll(CODEMIRROR_LINE_SELECTOR).forEach((line) => {
      line.removeAttribute(LINE_INDENT_ATTR);
      line.removeAttribute(LEGACY_INDENT_ATTR);
      line.style.removeProperty('--csp-codebox-wrap-indent');
    });
  };

  const applyIndentToWholeLineSpan = (lineNodes) => {
    const elementNodes = lineNodes.filter((node) => node instanceof HTMLElement);
    const hasMeaningfulNonElement = lineNodes.some(
      (node) => !(node instanceof HTMLElement) && String(node.textContent || '').trim(),
    );
    if (hasMeaningfulNonElement || elementNodes.length !== 1) return;

    const line = elementNodes[0];
    if (!(line instanceof HTMLSpanElement)) return;

    const indent = getHangingIndentCh(line.textContent || '');
    line.setAttribute(LINE_INDENT_ATTR, 'true');
    line.style.setProperty('--csp-codebox-wrap-indent', `${indent}ch`);
  };

  const applyCodeboxWrapIndents = () => {
    clearCodeboxWrapIndents();

    document.querySelectorAll(CODEMIRROR_CODE_SELECTOR).forEach((code) => {
      let lineNodes = [];
      const flushLine = () => {
        applyIndentToWholeLineSpan(lineNodes);
        lineNodes = [];
      };

      code.childNodes.forEach((node) => {
        if (node instanceof HTMLBRElement) {
          flushLine();
          return;
        }

        if (node.nodeType === Node.TEXT_NODE && !String(node.textContent || '').trim()) return;
        lineNodes.push(node);
      });

      flushLine();
    });
  };

  const getCodeboxScrollRoot = () => {
    if (typeof getScrollableContainer === 'function') {
      const scrollRoot = getScrollableContainer();
      if (scrollRoot instanceof Element) return scrollRoot;
    }
    return document.scrollingElement || document.documentElement;
  };

  const getViewportRect = (scrollRoot) => {
    if (
      scrollRoot === document.scrollingElement ||
      scrollRoot === document.documentElement ||
      scrollRoot === document.body
    ) {
      return { top: 0, bottom: window.innerHeight };
    }

    const rect = scrollRoot.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  };

  const findVisibleAnchor = (scrollRoot) => {
    const viewport = getViewportRect(scrollRoot);
    const targetY = viewport.top + Math.min(120, Math.max(24, (viewport.bottom - viewport.top) / 5));
    const selectors = [
      'div[id="code-block-viewer"].cm-editor .cm-content span',
      'div[id="code-block-viewer"].cm-editor .cm-line',
      'div[id="code-block-viewer"].cm-editor .cm-content code',
      'pre:not(.cm-content) > code',
      'div[id="code-block-viewer"].cm-editor',
      'pre:not(.cm-content)',
      '[data-testid^="conversation-turn-"]',
      'section[data-turn-id]',
    ];

    for (const selector of selectors) {
      let best = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const el of document.querySelectorAll(selector)) {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (rect.bottom <= viewport.top || rect.top >= viewport.bottom) continue;

        const distance =
          rect.top <= targetY && rect.bottom >= targetY
            ? 0
            : Math.min(Math.abs(rect.top - targetY), Math.abs(rect.bottom - targetY));
        if (distance < bestDistance) {
          best = el;
          bestDistance = distance;
        }
      }

      if (best) return best;
    }

    return null;
  };

  const captureScrollSnapshot = () => {
    const scrollRoot = getCodeboxScrollRoot();
    const anchor = findVisibleAnchor(scrollRoot);
    return {
      anchor,
      scrollRoot,
      scrollTop: scrollRoot.scrollTop,
      top: anchor?.getBoundingClientRect().top,
    };
  };

  const restoreScrollSnapshot = (snapshot) => {
    if (!snapshot?.scrollRoot) return;

    if (snapshot.anchor?.isConnected && Number.isFinite(snapshot.top)) {
      const delta = snapshot.anchor.getBoundingClientRect().top - snapshot.top;
      if (Number.isFinite(delta) && Math.abs(delta) > 0.5) {
        snapshot.scrollRoot.scrollTop += delta;
      }
      return;
    }

    snapshot.scrollRoot.scrollTop = snapshot.scrollTop;
  };

  const toggleCodeboxWrap = () => {
    ensureStyle();
    const snapshot = captureScrollSnapshot();
    const enabled = document.documentElement.classList.toggle(ROOT_CLASS);
    if (enabled) {
      applyCodeboxWrapIndents();
    } else {
      clearCodeboxWrapIndents();
    }

    restoreScrollSnapshot(snapshot);
    requestAnimationFrame(() => {
      if (enabled) applyCodeboxWrapIndents();
      restoreScrollSnapshot(snapshot);
    });
    window.setTimeout(() => {
      if (enabled) applyCodeboxWrapIndents();
      restoreScrollSnapshot(snapshot);
    }, 50);

    return enabled;
  };

  window.toggleCodeboxWrap = toggleCodeboxWrap;
})();

// Shared menu DOM helpers. Keep these near the menu utility IIFEs so call sites below are traceable.
const getIconTokenList = (tokenOrTokens) =>
  Array.isArray(tokenOrTokens) ? tokenOrTokens.filter(Boolean) : [tokenOrTokens].filter(Boolean);

const escapeCssSelectorValue = (value) => {
  try {
    return CSS?.escape ? CSS.escape(String(value)) : String(value);
  } catch {
    return String(value);
  }
};

const escapeAttributeSelectorFragment = (value) => String(value).replace(/(["\\])/g, '\\$1');

const buildSvgSelectorForIconTokens = (tokenOrTokens) =>
  getIconTokenList(tokenOrTokens)
    .map((token) => {
      const escapedPath = escapeCssSelectorValue(token);
      const escapedHref = escapeAttributeSelectorFragment(token);
      return [`svg path[d^="${escapedPath}"]`, `svg use[href*="${escapedHref}"]`].join(', ');
    })
    .join(', ');

const clickElementLikeUser = (el) => {
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
};

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

  // Menu-specific cue wrapper around the shared flashBorder visual.
  function flashCustomGptMenuCue(el) {
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
  function isPartlyVisibleAboveComposer(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const inViewport = r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
    return inViewport && isAboveComposer(r, el);
  }

  function openRadixMenuIfNeeded(triggerEl, delays = DEFAULT_MENU_DELAYS) {
    const expanded = triggerEl.getAttribute('aria-expanded') === 'true';
    if (!expanded) {
      try {
        triggerEl.focus?.();
      } catch { }

      // Radix triggers are frequently non-button elements; use a real pointer click.
      clickElementLikeUser(triggerEl);
      return delays.MENU_READY_OPEN;
    }
    return delays.MENU_READY_EXPANDED;
  }

  function findOpenMenuForTrigger(triggerEl) {
    if (!triggerEl) return null;

    const triggerId = triggerEl.getAttribute('id');
    if (triggerId) {
      const byLabel = document.querySelector(
        `${MENU_CONTENT_SELECTOR}[aria-labelledby="${escapeCssSelectorValue(triggerId)}"]`,
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
    const selector = buildSvgSelectorForIconTokens(pathPrefix);
    const item = menu
      ? Array.from(menu.querySelectorAll(selector))
        .map((p) => p.closest(MENU_ITEM_ROLES))
        .filter(Boolean)
        .filter(isPartlyVisibleAboveComposer)[0] || null
      : null;

    if (item) {
      // Flash the menu item with same logic
      flashCustomGptMenuCue(item);
      setTimeout(() => item.click(), delays.ITEM_CLICK);
      return true;
    }

    if (menu && fallbackText) {
      const needle = String(fallbackText).trim().toLowerCase();
      const fallback = Array.from(menu.querySelectorAll(MENU_ITEM_ROLES))
        .filter(isPartlyVisibleAboveComposer)
        .find((el) => getMenuItemLabel(el).toLowerCase() === needle);
      if (fallback) {
        flashCustomGptMenuCue(fallback);
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
      ).filter(isPartlyVisibleAboveComposer);

      if (!candidates.length) continue;

      const chevronSelector = buildSvgSelectorForIconTokens(CHEVRON_ICON_TOKENS);
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
    flashCustomGptMenuCue(trigger);

    const waitMs = openRadixMenuIfNeeded(trigger, delays);
    const fallbackText = typeof options.fallbackText === 'string' ? options.fallbackText : undefined;
    const tryClickMenuItem = (attempt = 0) => {
      if (!findOpenMenuForTrigger(trigger) && attempt < 1) {
        const retryTrigger = findGptMenuTrigger() || trigger;
        flashCustomGptMenuCue(retryTrigger);
        clickElementLikeUser(retryTrigger);
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

  // Runtime bridge: GPT menu helpers consumed by shortcut handlers and GPT-specific IIFEs.
  window.clickGptHeaderThenSubItemSvg = clickGptHeaderThenSubItemSvg;
  window.findGptMenuTrigger = findGptMenuTrigger;
  window.debugListOpenMenuItemPathPrefixes = debugListOpenMenuItemPathPrefixes;

  // Runtime bridge: shared visual cue fallback for later feature IIFEs.
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

  const COPY_ALL_CODE_BLOCK_SELECTOR = [
    '#code-block-viewer .cm-content code',
    '#code-block-viewer code',
    'pre.cm-content code',
    'pre code',
    'code[class*="whitespace-pre"]',
    'code.whitespace-pre',
  ].join(', ');

  function getRenderedCodeText(codeElement) {
    const parts = [];

    const walk = (node) => {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.nodeValue || '');
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      if (node.tagName === 'BR') {
        parts.push('\n');
        return;
      }

      for (const child of node.childNodes) {
        walk(child);
      }
    };

    walk(codeElement);

    const normalized = parts
      .join('')
      .replace(/\u00A0/g, ' ')
      .replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/gu, '')
      .replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');

    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

    return lines.join('\n');
  }

  function getAllCodeBlocks() {
    const blocks = [];
    const codeElements = Array.from(document.querySelectorAll(COPY_ALL_CODE_BLOCK_SELECTOR));

    for (const codeElement of codeElements) {
      const roleContainer = codeElement.closest?.('[data-message-author-role]');
      if (roleContainer?.getAttribute?.('data-message-author-role') !== 'assistant') continue;

      const block = getRenderedCodeText(codeElement);
      if (block) blocks.push(block);
    }

    return blocks;
  }

  function copyCode() {
    const formattedBlocks = getAllCodeBlocks();
    if (!formattedBlocks.length) {
      showToast('No code boxes found');
      return;
    }

    chrome.storage.sync.get('copyCodeUserSeparator', (data) => {
      const copyCodeSeparator = data.copyCodeUserSeparator
        ? parseSeparator(data.copyCodeUserSeparator)
        : '\n\n--- --- ---\n\n';
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
    const parsed = separator.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');
    return parsed.trim() === '--- --- ---' ? '\n\n--- --- ---\n\n' : parsed;
  }

  function getConversationTurnMessages() {
    const candidates = Array.from(document.querySelectorAll(CONVERSATION_TURN_SELECTOR)).filter(
      (message) => message instanceof HTMLElement && message.isConnected,
    );
    const renderedMessages = candidates.filter((message) => {
      if (!message.firstElementChild) return false;

      const rect = message.getBoundingClientRect();
      return Number.isFinite(rect.height) && rect.height > 1;
    });

    return renderedMessages.length ? renderedMessages : candidates;
  }

  function getScrollContainerTopEdge(scrollContainer) {
    if (
      scrollContainer === document.scrollingElement ||
      scrollContainer === document.documentElement ||
      scrollContainer === document.body
    ) {
      return 0;
    }

    const rect = scrollContainer.getBoundingClientRect();
    return Number.isFinite(rect.top) ? rect.top : 0;
  }

  function getMessageTopScrollPosition(message, scrollContainer) {
    if (!(message instanceof HTMLElement) || !message.isConnected) return NaN;

    const currentScrollTop = Number(scrollContainer.scrollTop) || 0;
    const rect = message.getBoundingClientRect();
    const topScroll = currentScrollTop + rect.top - getScrollContainerTopEdge(scrollContainer);
    return Number.isFinite(topScroll) ? topScroll : NaN;
  }

  function getMessageTopScrollPositions(messages, scrollContainer) {
    return messages
      .map((message) => {
        const topScroll = getMessageTopScrollPosition(message, scrollContainer);
        return Number.isFinite(topScroll) ? { message, topScroll } : null;
      })
      .filter(Boolean);
  }

  function clampScrollTop(scrollContainer, scrollTop) {
    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    return Math.max(0, Math.min(maxScrollTop, scrollTop));
  }

  function getColorAlpha(color) {
    const value = String(color || '').trim();
    if (!value || value === 'transparent') return 0;

    const rgbaMatch = value.match(/rgba?\(([^)]+)\)/i);
    if (rgbaMatch) {
      const inside = rgbaMatch[1].trim();
      if (inside.includes('/')) {
        const alpha = Number.parseFloat(inside.split('/').pop().trim());
        return Number.isFinite(alpha) ? alpha : 1;
      }

      const parts = inside.split(',').map((part) => part.trim());
      if (parts.length >= 4) {
        const alpha = Number.parseFloat(parts[3]);
        return Number.isFinite(alpha) ? alpha : 1;
      }
      return 1;
    }

    const slashAlphaMatch = value.match(/\/\s*([0-9.]+%?)/);
    if (slashAlphaMatch) {
      const rawAlpha = slashAlphaMatch[1];
      const alpha = rawAlpha.endsWith('%')
        ? Number.parseFloat(rawAlpha) / 100
        : Number.parseFloat(rawAlpha);
      return Number.isFinite(alpha) ? alpha : 1;
    }

    return 1;
  }

  function getTopHeaderScrollOffset(scrollContainer) {
    if (window.moveTopBarToBottomCheckbox) return 0;

    const header = document.getElementById('page-header');
    if (!(header instanceof HTMLElement)) return 0;

    const style = getComputedStyle(header);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number.parseFloat(style.opacity || '1') <= 0 ||
      getColorAlpha(style.backgroundColor) <= 0.05
    ) {
      return 0;
    }

    const headerRect = header.getBoundingClientRect();
    const scrollRect = scrollContainer.getBoundingClientRect();
    const horizontalOverlap =
      Math.min(headerRect.right, scrollRect.right) - Math.max(headerRect.left, scrollRect.left);
    const verticalOverlap =
      Math.min(headerRect.bottom, scrollRect.bottom) - Math.max(headerRect.top, scrollRect.top);

    if (horizontalOverlap <= 0 || verticalOverlap <= 0 || headerRect.top > scrollRect.top + 1) {
      return 0;
    }

    return Math.max(0, Math.round(verticalOverlap));
  }

  function getMessageScrollOptions() {
    const isBottom = window.moveTopBarToBottomCheckbox;
    const baseScrollOffset = isBottom ? 43 : 25;
    const scrollContainer = getScrollableContainer();
    const scrollOffset = baseScrollOffset + (scrollContainer ? getTopHeaderScrollOffset(scrollContainer) : 0);

    return {
      downThreshold: scrollOffset + 5,
      scrollOffset,
      upThreshold: scrollOffset - 5,
    };
  }

  let activeMessageScrollTween = null;
  let activeMessageScrollSettleFrame = null;
  let activeBoundaryScrollSettleFrame = null;
  let activeBoundaryScrollSettleTimeouts = [];
  const MESSAGE_SCROLL_SETTLE_MS = 900;
  const BOUNDARY_SCROLL_SETTLE_DELAYS_MS = [50, 150, 350, 700];

  function clearBoundaryScrollSettle() {
    if (activeBoundaryScrollSettleFrame) {
      cancelAnimationFrame(activeBoundaryScrollSettleFrame);
      activeBoundaryScrollSettleFrame = null;
    }

    for (const timeoutId of activeBoundaryScrollSettleTimeouts) {
      clearTimeout(timeoutId);
    }
    activeBoundaryScrollSettleTimeouts = [];
  }

  function getMaxBoundaryScrollTop(scrollContainer) {
    if (!(scrollContainer instanceof Element)) return 0;
    return Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
  }

  function getBoundaryScrollTop(scrollContainer, boundary) {
    return boundary === 'bottom' ? getMaxBoundaryScrollTop(scrollContainer) : 0;
  }

  function setBoundaryScrollPosition(scrollContainer, boundary) {
    if (!(scrollContainer instanceof Element)) return NaN;
    if (
      !scrollContainer.isConnected &&
      scrollContainer !== document.scrollingElement &&
      scrollContainer !== document.documentElement &&
      scrollContainer !== document.body
    ) {
      return NaN;
    }

    stabilizeConversationScrollContainer(scrollContainer);
    const targetY = getBoundaryScrollTop(scrollContainer, boundary);
    scrollContainer.scrollTop = targetY;
    return targetY;
  }

  function settleBoundaryScrollTarget(scrollContainer, boundary) {
    clearBoundaryScrollSettle();

    const settle = () => {
      setBoundaryScrollPosition(scrollContainer, boundary);
    };

    activeBoundaryScrollSettleFrame = requestAnimationFrame(() => {
      activeBoundaryScrollSettleFrame = null;
      settle();
    });

    activeBoundaryScrollSettleTimeouts = BOUNDARY_SCROLL_SETTLE_DELAYS_MS.map((delay) =>
      setTimeout(settle, delay),
    );
  }

  function animateBoundaryScrollTo(scrollContainer, boundary) {
    if (!(scrollContainer instanceof Element)) return;

    killActiveMessageScrollTween();
    clearBoundaryScrollSettle();
    gsap.killTweensOf(scrollContainer);
    stabilizeConversationScrollContainer(scrollContainer);

    gsap.to(scrollContainer, {
      duration: 0.3,
      overwrite: 'auto',
      scrollTo: { y: getBoundaryScrollTop(scrollContainer, boundary), autoKill: false },
      ease: 'power4.out',
      onComplete: () => {
        settleBoundaryScrollTarget(scrollContainer, boundary);
      },
    });
  }

  function killActiveMessageScrollTween() {
    clearBoundaryScrollSettle();

    if (activeMessageScrollSettleFrame) {
      cancelAnimationFrame(activeMessageScrollSettleFrame);
      activeMessageScrollSettleFrame = null;
    }

    if (!activeMessageScrollTween) return;

    activeMessageScrollTween.kill();
    activeMessageScrollTween = null;
  }

  function stabilizeMessageScrollContainer(scrollContainer) {
    stabilizeConversationScrollContainer(scrollContainer);
  }

  function settleMessageScrollTarget(scrollContainer, message, scrollOffset) {
    if (!(message instanceof HTMLElement) || !message.isConnected) return;

    const startedAt = performance.now();
    const tick = () => {
      if (!(message instanceof HTMLElement) || !message.isConnected) {
        activeMessageScrollSettleFrame = null;
        return;
      }

      const actualTop = message.getBoundingClientRect().top - getScrollContainerTopEdge(scrollContainer);
      const delta = actualTop - scrollOffset;
      if (Math.abs(delta) > 1) {
        scrollContainer.scrollTop = clampScrollTop(scrollContainer, scrollContainer.scrollTop + delta);
      }

      if (performance.now() - startedAt < MESSAGE_SCROLL_SETTLE_MS) {
        activeMessageScrollSettleFrame = requestAnimationFrame(tick);
      } else {
        activeMessageScrollSettleFrame = null;
      }
    };

    activeMessageScrollSettleFrame = requestAnimationFrame(tick);
  }

  function alignMessageToVisualTop(scrollContainer, message, visualTop) {
    if (!(message instanceof HTMLElement) || !message.isConnected) return;

    const actualTop = message.getBoundingClientRect().top - getScrollContainerTopEdge(scrollContainer);
    if (!Number.isFinite(actualTop)) return;

    const delta = actualTop - visualTop;
    if (Math.abs(delta) > 0.5) {
      scrollContainer.scrollTop = clampScrollTop(scrollContainer, scrollContainer.scrollTop + delta);
    }
  }

  function animateMessageScrollTo(scrollContainer, targetY, message = null, scrollOffset = 0) {
    killActiveMessageScrollTween();
    gsap.killTweensOf(scrollContainer);
    stabilizeMessageScrollContainer(scrollContainer);

    if (message instanceof HTMLElement && message.isConnected) {
      const startVisualTop = message.getBoundingClientRect().top - getScrollContainerTopEdge(scrollContainer);
      const tweenState = { visualTop: startVisualTop };

      activeMessageScrollTween = gsap.to(tweenState, {
        duration: 0.3,
        visualTop: scrollOffset,
        ease: 'power4.out',
        onUpdate: () => {
          alignMessageToVisualTop(scrollContainer, message, tweenState.visualTop);
        },
        onComplete: () => {
          activeMessageScrollTween = null;
          alignMessageToVisualTop(scrollContainer, message, scrollOffset);
          settleMessageScrollTarget(scrollContainer, message, scrollOffset);
        },
        onInterrupt: () => {
          activeMessageScrollTween = null;
        },
      });
      return;
    }

    activeMessageScrollTween = gsap.to(scrollContainer, {
      duration: 0.3,
      overwrite: 'auto',
      scrollTo: { y: targetY, autoKill: false },
      ease: 'power4.out',
      onComplete: () => {
        activeMessageScrollTween = null;
        if (message instanceof HTMLElement) {
          settleMessageScrollTarget(scrollContainer, message, scrollOffset);
        }
      },
      onInterrupt: () => {
        activeMessageScrollTween = null;
      },
    });
  }

  function scrollToMessageTop(scrollContainer, message, scrollOffset) {
    if (!(message instanceof HTMLElement) || !message.isConnected) return;

    const targetScrollTop = getMessageTopScrollPosition(message, scrollContainer);
    if (!Number.isFinite(targetScrollTop)) return;

    animateMessageScrollTo(
      scrollContainer,
      clampScrollTop(scrollContainer, targetScrollTop - scrollOffset),
      message,
      scrollOffset,
    );
  }

  function scrollToMessagePosition(scrollContainer, messagePosition, scrollOffset) {
    scrollToMessageTop(scrollContainer, messagePosition.message, scrollOffset);
  }

  // Shared helper so "one up" and "two up" use the exact same anchor logic.
  function scrollUpByMessages(steps = 1, feedbackTarget = null) {
    resetScrollState();

    const messages = getConversationTurnMessages();
    const scrollContainer = getScrollableContainer();
    if (!scrollContainer || messages.length === 0) return;

    killActiveMessageScrollTween();
    gsap.killTweensOf(scrollContainer);

    const { scrollOffset, upThreshold } = getMessageScrollOptions();
    const stepCount = Math.max(1, Math.floor(steps));

    let foundCount = 0;
    let targetMessage = null;

    for (let i = messages.length - 1; i >= 0; i--) {
      const messageTop = messages[i].getBoundingClientRect().top;
      if (messageTop < upThreshold) {
        foundCount++;
        if (foundCount === stepCount) {
          targetMessage = messages[i];
          break;
        }
      }
    }

    if (targetMessage) {
      scrollToMessageTop(scrollContainer, targetMessage, scrollOffset);
    } else {
      animateMessageScrollTo(scrollContainer, 0);
    }

    if (feedbackTarget) feedbackAnimation(feedbackTarget); // trigger immediately
  }

  function goUpOneMessage(feedbackTarget = null) {
    scrollUpByMessages(1, feedbackTarget);
  }

  function goUpTwoMessages(feedbackTarget = null) {
    scrollUpByMessages(2, feedbackTarget);
  }

  const LEGACY_ARROW_POSITION_STYLE_ID = 'csp-legacy-arrow-position-style';
  const LEGACY_ARROW_RIGHT_DEFAULT = '26px';
  const LEGACY_ARROW_RIGHT_WITH_PROMPT_RAIL = 'calc(1rem + 2.25rem + 2em)';

  function ensureLegacyArrowButtonPositionStyle() {
    if (document.getElementById(LEGACY_ARROW_POSITION_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = LEGACY_ARROW_POSITION_STYLE_ID;
    style.textContent = `
      @supports selector(body:has(*)) {
        body:has(
          div[class~="fixed"][class~="top-1/2"][class~="inset-e-4"]
            div[class~="no-scrollbar"][class~="overflow-y-auto"] > button:nth-of-type(40)
        ) {
          --csp-legacy-scroll-arrow-right: ${LEGACY_ARROW_RIGHT_WITH_PROMPT_RAIL};
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
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
      `display: flex; align-items: center; justify-content: center; background-color: var(--main-surface-tertiary); color: var(--text-primary); opacity: 0.8; width: 25.33px; height: 25.33px; border-radius: 50%; position: fixed; top: 196px; right: var(--csp-legacy-scroll-arrow-right, ${LEGACY_ARROW_RIGHT_DEFAULT}); z-index: 10000; transition: opacity 1s;`;
    upButton.id = 'upButton';
    upButton.dataset.cspLegacyScrollArrow = 'true';

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

  function getNextMessagePosition(messagePositions, currentScrollTop, messageThreshold) {
    for (let i = 0; i < messagePositions.length; i++) {
      if (messagePositions[i].topScroll > currentScrollTop + messageThreshold) {
        return messagePositions[i];
      }
    }
    return null;
  }

  function goDownOneMessage(feedbackTarget = null) {
    resetScrollState();

    const messages = getConversationTurnMessages();
    const scrollContainer = getScrollableContainer();
    if (!scrollContainer || messages.length === 0) return;

    killActiveMessageScrollTween();
    gsap.killTweensOf(scrollContainer);

    const currentScrollTop = scrollContainer.scrollTop;

    const { downThreshold, scrollOffset } = getMessageScrollOptions();
    const messagePositions = getMessageTopScrollPositions(messages, scrollContainer);

    const targetPosition = getNextMessagePosition(messagePositions, currentScrollTop, downThreshold);

    if (targetPosition) {
      scrollToMessagePosition(scrollContainer, targetPosition, scrollOffset);
    } else {
      animateMessageScrollTo(scrollContainer, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    }

    if (feedbackTarget) feedbackAnimation(feedbackTarget);
  }

  function scrolldownbymessages(steps = 1, feedbackTarget = null) {
    resetScrollState();

    const messages = getConversationTurnMessages();
    const scrollContainer = getScrollableContainer();
    if (!scrollContainer || messages.length === 0) return;

    killActiveMessageScrollTween();
    gsap.killTweensOf(scrollContainer);

    const { downThreshold, scrollOffset } = getMessageScrollOptions();
    const messagePositions = getMessageTopScrollPositions(messages, scrollContainer);

    // Use a local variable instead of reassigning the parameter
    const stepCount = Math.max(1, Math.floor(steps));

    let virtualTop = scrollContainer.scrollTop;
    let targetPosition = null;

    for (let i = 0; i < stepCount; i++) {
      const next = getNextMessagePosition(messagePositions, virtualTop, downThreshold);
      if (!next) {
        targetPosition = null;
        break;
      }
      targetPosition = next;
      virtualTop = clampScrollTop(scrollContainer, targetPosition.topScroll - scrollOffset);
    }

    if (targetPosition) {
      scrollToMessagePosition(scrollContainer, targetPosition, scrollOffset);
    } else {
      animateMessageScrollTo(scrollContainer, scrollContainer.scrollHeight - scrollContainer.clientHeight);
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
      `display: flex; align-items: center; justify-content: center; background-color: var(--main-surface-tertiary); color: var(--text-primary); opacity: 0.8; width: 25.33px; height: 25.33px; border-radius: 50%; position: fixed; top: 228px; right: var(--csp-legacy-scroll-arrow-right, ${LEGACY_ARROW_RIGHT_DEFAULT}); z-index: 10000; transition: opacity 1s;`;
    downButton.id = 'downButton';
    downButton.dataset.cspLegacyScrollArrow = 'true';

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

  function removeExistingArrowButtons() {
    document.getElementById('upButton')?.remove();
    document.getElementById('downButton')?.remove();
  }

  function getArrowButtonsParent(preferredParent = null) {
    if (preferredParent instanceof HTMLElement) {
      return preferredParent;
    }

    if (window.moveTopBarToBottomCheckbox) {
      const bottomBar = document.getElementById('bottomBarContainer');
      return bottomBar instanceof HTMLElement ? bottomBar : null;
    }

    return document.body || null;
  }

  function arrowButtonsAreMountedIn(parent) {
    const upButton = document.getElementById('upButton');
    const downButton = document.getElementById('downButton');
    return upButton?.parentElement === parent && downButton?.parentElement === parent;
  }

  // Helper to (re)inject arrow buttons in the DOM based on current settings
  function injectOrToggleArrowButtons(preferredParent = null) {
    // New logic: if unchecked (false), do nothing (keep hidden)
    if (!window.showLegacyArrowButtonsCheckbox) {
      removeExistingArrowButtons();
      return;
    }

    const parent = getArrowButtonsParent(preferredParent);
    if (!parent) {
      if (window.moveTopBarToBottomCheckbox) removeExistingArrowButtons();
      return;
    }
    if (arrowButtonsAreMountedIn(parent)) return;

    // Remove any previous buttons (or comments)
    removeExistingArrowButtons();
    ensureLegacyArrowButtonPositionStyle();

    // Add fresh buttons (will only show when the checkbox is checked)
    const upButton = createScrollUpButton();
    const downButton = createScrollDownButton();
    appendWithFragment(parent, upButton, downButton);
  }

  // Runtime bridge: visibility settings reapply legacy arrows from other IIFEs.
  window.__cspInjectOrToggleArrowButtons = injectOrToggleArrowButtons;

  // Runtime bridge extension point: keep legacy arrows in sync with global visibility changes.
  const _applyVisibilitySettings = window.applyVisibilitySettings;
  window.applyVisibilitySettings = (data) => {
    _applyVisibilitySettings(data);
    injectOrToggleArrowButtons();
  };

  // Initial settings load
  if (typeof window.showLegacyArrowButtonsCheckbox === 'boolean') {
    injectOrToggleArrowButtons();
  } else {
    chrome.storage.sync.get(
      { moveTopBarToBottomCheckbox: false, showLegacyArrowButtonsCheckbox: false },
      (data) => {
        window.moveTopBarToBottomCheckbox = !!data.moveTopBarToBottomCheckbox;
        window.showLegacyArrowButtonsCheckbox = !!data.showLegacyArrowButtonsCheckbox;
        injectOrToggleArrowButtons();
      },
    );
  }

  const PLUS_BTN_SEL = '[data-testid="composer-plus-btn"]';
  const COMPOSER_TOOL_ITEM_SELECTOR = [
    'div.__menu-item[tabindex]',
    'div[role="menuitem"]',
    'div[role="menuitemradio"]',
    'div[role="menuitemcheckbox"]',
  ].join(', ');
  const COMPOSER_TOOL_MENU_CUE_TOKENS = [
    '#712359',
    '#ccfd18',
    '#6d72eb',
    '#46f45a',
    '#266724',
    '#6b0d8c',
  ];

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  const smartClick = clickElementLikeUser;

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

  const buildIconSelector = buildSvgSelectorForIconTokens;

  const findComposerToolItemByIcon = (iconTokens) => {
    const iconSelector = buildIconSelector(iconTokens);
    const items = Array.from(document.querySelectorAll(iconSelector))
      .map((icon) => icon.closest(COMPOSER_TOOL_ITEM_SELECTOR))
      .filter((item, index, all) => item && all.indexOf(item) === index)
      .filter((item) => {
        const style = getComputedStyle(item);
        const rect = item.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.pointerEvents !== 'none' &&
          rect.width > 0 &&
          rect.height > 0
        );
      });
    items.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return items[items.length - 1] || null;
  };

  const runActionByIcon = async (iconPathPrefix, delays = DELAYS) => {
    let item = findComposerToolItemByIcon(iconPathPrefix);
    if (!item) {
      const composer = document.querySelector('form[data-type="unified-composer"]');
      const plusBtn = composer?.querySelector(PLUS_BTN_SEL) || document.querySelector(PLUS_BTN_SEL);
      if (!plusBtn) return;

      if (!findComposerToolItemByIcon(COMPOSER_TOOL_MENU_CUE_TOKENS)) {
        flashBorder(plusBtn);
        smartClick(plusBtn);
      }

      item = await waitFor(() => findComposerToolItemByIcon(iconPathPrefix), {
        timeout: delays.waitActionItem,
      });
    }
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

  const toTokenArray = getIconTokenList;
  const safeEsc = escapeCssSelectorValue;
  const svgSelectorForTokens = buildSvgSelectorForIconTokens;

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

  // Strict menu helper: fully inside viewport and not hidden under the composer.
  function isFullyVisibleAboveComposer(el) {
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
      .filter(isFullyVisibleAboveComposer)
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
      // Button-owned Radix menus respond reliably to Space; Custom GPT triggers above use pointer clicks.
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

  // Runtime bridge: model-picker thinking fallbacks and shortcut handlers reuse this Radix menu path.
  window.__cspClickLowestSvgThenSubItemSvg = clickLowestSvgThenSubItemSvg;

  /* ===== End clickLowestSvgThenSubItemSvg Reusable Radix menu helpers ===== */

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
    const inputs = Array.from(document.querySelectorAll(selector)).filter(isFullyVisibleAboveComposer);
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

  // Runtime bridge: diagnostics/manual model-menu activation by visible label.
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

  const CODEBOX_PAYLOAD_SELECTOR = [
    '#code-block-viewer code',
    '.cm-content code',
    'pre code',
    'code[class*="language-"]',
    'code[class*="whitespace-pre"]',
    'code.whitespace-pre',
  ].join(', ');
  const MESSAGE_COPY_BOUNDARY_SELECTOR =
    '[data-message-author-role], section[data-testid^="conversation-turn-"], article[data-turn], article[data-testid^="conversation-turn-"]';

  function normalizeCodeTextForCopyGuard(text) {
    return String(text || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/gu, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t\u00A0\r\n]+$/g, '');
  }

  function getMessageCopyCodeBlockTexts(btn) {
    if (btn?.getAttribute?.('data-testid') !== 'copy-turn-action-button') return [];

    const scope = btn.closest?.(MESSAGE_COPY_BOUNDARY_SELECTOR);
    if (!scope) return [];

    const seen = new Set();
    return Array.from(scope.querySelectorAll(CODEBOX_PAYLOAD_SELECTOR))
      .map((codeEl) =>
        normalizeCodeTextForCopyGuard(codeEl?.innerText ?? codeEl?.textContent ?? ''),
      )
      .filter((text) => {
        if (!text || seen.has(text)) return false;
        seen.add(text);
        return true;
      });
  }

  function isCodeBoxCopyControl(control) {
    const btn = control?.closest?.('button, [role="button"]') || control;
    if (!btn || !(btn instanceof Element)) return false;
    if (btn.getAttribute?.('data-testid') === 'copy-turn-action-button') return false;

    if (btn.closest('pre, #code-block-viewer, .cm-editor, .cm-content')) return true;

    let node = btn.parentElement;
    let depth = 0;
    while (node && node !== document.body && depth < 7) {
      if (node.matches?.(MESSAGE_COPY_BOUNDARY_SELECTOR)) break;
      if (node.querySelector?.(CODEBOX_PAYLOAD_SELECTOR)) return true;
      node = node.parentElement;
      depth += 1;
    }

    return false;
  }

  function splitTextByProtectedBlocks(text, protectedBlocks = []) {
    let segments = [{ text, protected: false }];
    const blocks = Array.from(new Set(protectedBlocks.filter(Boolean))).sort(
      (a, b) => b.length - a.length,
    );

    for (const block of blocks) {
      const nextSegments = [];
      for (const segment of segments) {
        if (segment.protected) {
          nextSegments.push(segment);
          continue;
        }

        let remaining = segment.text;
        let index = remaining.indexOf(block);
        while (index >= 0) {
          if (index > 0) {
            nextSegments.push({ text: remaining.slice(0, index), protected: false });
          }
          nextSegments.push({ text: block, protected: true });
          remaining = remaining.slice(index + block.length);
          index = remaining.indexOf(block);
        }
        if (remaining) {
          nextSegments.push({ text: remaining, protected: false });
        }
      }
      segments = nextSegments;
    }

    return segments;
  }

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

    const isCodeBoxCopy = isCodeBoxCopyControl(btn);
    const isMsgCopy =
      !isCodeBoxCopy && btn.getAttribute('data-testid') === 'copy-turn-action-button';
    const protectedCodeTexts = isMsgCopy ? getMessageCopyCodeBlockTexts(btn) : [];

    if (window.gsap && typeof window.flashBorder === 'function') {
      window.flashBorder(btn);
    }

    const shouldClick = await delayCopyLowest(delayBeforeClick, runToken);
    if (!shouldClick || runToken !== copyLowestRunToken) return;
    btn.click();
    // Codebox copy controls already write exact code text; leave their clipboard payload untouched.
    if (isCodeBoxCopy) return;

    const shouldRead = await delayCopyLowest(delayClipboardRead, runToken);
    if (!shouldRead || runToken !== copyLowestRunToken) return;

    if (!navigator.clipboard || !navigator.clipboard.readText || !navigator.clipboard.writeText)
      return;

    try {
      if (runToken !== copyLowestRunToken) return;
      const text = await navigator.clipboard.readText();
      if (runToken !== copyLowestRunToken) return;
      const processed = sanitizeCopiedText(text, { isMsgCopy, protectedCodeTexts });
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

  function sanitizeCopiedText(text, { isMsgCopy = false, protectedCodeTexts = [] } = {}) {
    if (!text) return text;

    if (isMsgCopy && removeMarkdownOnCopyEnabled()) {
      const stripFn =
        typeof window !== 'undefined' && typeof window.stripMarkdownOutsideCodeblocks === 'function'
          ? window.stripMarkdownOutsideCodeblocks
          : typeof stripMarkdownOutsideCodeblocks === 'function'
            ? stripMarkdownOutsideCodeblocks
            : null;

      if (stripFn) {
        const codeTexts = Array.from(
          new Set(
            protectedCodeTexts
              .map((codeText) => normalizeCodeTextForCopyGuard(codeText))
              .filter(Boolean),
          ),
        );
        const allProtectedBlocksFound = codeTexts.every((codeText) => text.includes(codeText));
        const protectedSegments = allProtectedBlocksFound
          ? splitTextByProtectedBlocks(text, codeTexts)
          : [];
        const processed =
          protectedSegments.length > 1 || protectedSegments.some((seg) => seg.protected)
            ? protectedSegments
                .map((seg) => (seg.protected ? seg.text : stripFn(seg.text)))
                .join('')
            : stripFn(text);

        if (codeTexts.length && !codeTexts.every((codeText) => processed.includes(codeText))) {
          return text;
        }

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
    shortcutKeyToggleCodeboxWrap: '',
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
    shortcutKeyDeepResearch: '',
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
    shortcutKeyProStandard: '',
    shortcutKeyProExtended: '',
    shortcutKeyNewGptConversation: '',
  };
  // Runtime bridge: overlay, analytics, and model-picker handlers read the effective shortcut map.
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

    // Runtime bridge: sanitizeCopiedText and copy handlers share Markdown stripping in MV3 scope.
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

    const COPY_EXPORT_FONT_STACK =
      "'Segoe UI', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, system-ui, sans-serif";
    const COPY_EXPORT_CODE_CHROME_SELECTOR =
      '.flex.items-center.text-token-text-secondary,[data-testid="copy-code-button"],button[aria-label*="Copy"],button[title*="Copy"]';

    function normalizeCopyContentElements(contentEls) {
      return Array.isArray(contentEls) ? contentEls.filter(Boolean) : [contentEls].filter(Boolean);
    }

    async function writeClipboardHtmlAndText(html, text) {
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          const item = new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          });
          await navigator.clipboard.write([item]);
          return;
        } catch (_) {
          /* fall back to copy event */
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

    async function copyClipboardPayload(payload) {
      const html = payload?.html || '';
      const text = payload?.text || '';
      if (!html && !text) return;
      await writeClipboardHtmlAndText(html, text);
    }

    function makeCopyTextWalker(root) {
      return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.nodeValue?.trim().length
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        },
      });
    }

    function findFirstCopyTextNode(root) {
      return makeCopyTextWalker(root).nextNode();
    }

    function findLastCopyTextNode(root) {
      const walker = makeCopyTextWalker(root);
      let last = null;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) last = node;
      return last;
    }

    function createSelectionRangeForElements(elements, options = {}) {
      const normalizedElements = normalizeCopyContentElements(elements);
      if (!normalizedElements.length) return null;

      const { fallback = 'span-elements' } = options;
      const firstEl = normalizedElements[0];
      const lastEl = normalizedElements[normalizedElements.length - 1];
      const startNode = findFirstCopyTextNode(firstEl);
      const endNode = findLastCopyTextNode(lastEl);
      const range = document.createRange();

      if (startNode && endNode) {
        range.setStart(startNode, 0);
        range.setEnd(endNode, endNode.nodeValue.length);
        return range;
      }

      if (fallback === 'first-element') {
        range.selectNodeContents(firstEl);
        return range;
      }

      range.setStart(firstEl, 0);
      range.setEnd(lastEl, lastEl.childNodes.length);
      return range;
    }

    function selectElementsForCopyFeedback(elements, options = {}) {
      const selection = window.getSelection?.();
      const range = createSelectionRangeForElements(elements, options);
      if (!selection || !range) return false;
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }

    const COPY_CONVERSATION_TURN_SELECTOR =
      'section[data-testid^="conversation-turn-"], article[data-turn], article[data-testid^="conversation-turn-"]';
    const COPY_CONTENT_SELECTOR = '.whitespace-pre-wrap, .prose, .markdown, .markdown-new-styling';
    const COPY_SHORTCUT_DEBUG = false;

    function hasCopyTextContent(el) {
      return !!(el && (el.innerText || el.textContent || '').trim());
    }

    function dedupeCopyContentElements(elements) {
      const seen = new Set();
      return normalizeCopyContentElements(elements).filter((contentEl) => {
        if (!hasCopyTextContent(contentEl)) return false;
        if (seen.has(contentEl)) return false;
        seen.add(contentEl);
        return true;
      });
    }

    function getCopyRoleContainers(container, preferredRole = null) {
      if (!container) return [];
      const roles = preferredRole ? [preferredRole] : ['assistant', 'user'];
      for (const role of roles) {
        const selector = `[data-message-author-role="${role}"]`;
        const direct = container.matches?.(selector) ? [container] : [];
        const nested = Array.from(container.querySelectorAll?.(selector) || []);
        const matches = [...direct, ...nested];
        if (matches.length) return matches;
      }
      return [];
    }

    function getCopyContentElementForRoleContainer(roleContainer) {
      if (!roleContainer) return null;
      return roleContainer.querySelector?.(COPY_CONTENT_SELECTOR) || roleContainer;
    }

    function getFallbackCopyContentElement(container) {
      return container?.querySelector?.(COPY_CONTENT_SELECTOR) || container || null;
    }

    function getCopyContentElementsForTurn(turn, preferredRole = null, options = {}) {
      const { fallbackToContainer = false } = options;
      const roleContainers = getCopyRoleContainers(turn, preferredRole);
      const contentEls = roleContainers.map(getCopyContentElementForRoleContainer);
      if (!contentEls.length && fallbackToContainer) {
        contentEls.push(getFallbackCopyContentElement(turn));
      }
      return dedupeCopyContentElements(contentEls);
    }

    function getPreferredCopyRoleForTurn(turn) {
      const dataTurn = turn?.getAttribute?.('data-turn');
      if (dataTurn === 'assistant' || dataTurn === 'user') return dataTurn;
      return getCopyRoleContainers(turn, 'assistant').length ? 'assistant' : 'user';
    }

    function copyTurnHasRole(turn, role) {
      return getCopyRoleContainers(turn, role).length > 0;
    }

    function getPrimaryCopyContentElementsForTurn(turn) {
      return getCopyContentElementsForTurn(turn, getPreferredCopyRoleForTurn(turn));
    }

    function getDirectCopyContentElementsForButton(btn) {
      const roleContainer = btn?.closest?.('[data-message-author-role]');
      return dedupeCopyContentElements([getCopyContentElementForRoleContainer(roleContainer)]);
    }

    function getCopyButtonContentElements(btn) {
      const directContentEls = getDirectCopyContentElementsForButton(btn);
      if (directContentEls.length) return directContentEls;
      const turn = btn?.closest?.(COPY_CONVERSATION_TURN_SELECTOR);
      return getPrimaryCopyContentElementsForTurn(turn);
    }

    function getVisibleCopyTurnsAboveComposer() {
      const allConversationTurns = Array.from(
        document.querySelectorAll(COPY_CONVERSATION_TURN_SELECTOR),
      );
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const composerTop = getComposerTopEdge();

      return allConversationTurns.filter((el) => {
        const rect = el.getBoundingClientRect();
        const horizontallyVisible = rect.right > 0 && rect.left < viewportWidth;
        const verticallyVisible = rect.bottom > 0 && rect.top < viewportHeight;
        if (!(horizontallyVisible && verticallyVisible)) return false;
        if (Number.isFinite(composerTop) && rect.top >= composerTop) return false;
        return true;
      });
    }

    function resolveConversationCopyFlag(v) {
      return !!(v && typeof v === 'object' && 'checked' in v ? v.checked : v);
    }

    function replaceNewlinesWithBr_UserPreWrap(root) {
      try {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        const toProcess = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.nodeValue?.includes('\n')) toProcess.push(node);
        }
        for (const textNode of toProcess) {
          const parts = textNode.nodeValue.split('\n');
          const frag = document.createDocumentFragment();
          parts.forEach((part, index) => {
            if (part) frag.appendChild(document.createTextNode(part));
            if (index < parts.length - 1) frag.appendChild(document.createElement('br'));
          });
          textNode.parentNode.replaceChild(frag, textNode);
        }
      } catch (_) {
        /* copy/export should not fail because one text node could not normalize */
      }
    }

    function safeCodeLanguage(value) {
      const normalizedValue = (value || '').trim();
      return /^[a-z0-9+.#-]+$/i.test(normalizedValue) ? normalizedValue.toLowerCase() : '';
    }

    function languageFromCodeClass(codeEl) {
      const className = Array.from(codeEl?.classList || []).find((name) =>
        name.toLowerCase().startsWith('language-'),
      );
      return className ? className.split(/language-/i)[1] : '';
    }

    function inferCodeBlockLanguage(blockNode, codeEl) {
      const classLanguage = languageFromCodeClass(codeEl);
      if (classLanguage) return safeCodeLanguage(classLanguage);
      const datasetLanguage = codeEl?.dataset?.language;
      if (datasetLanguage) return safeCodeLanguage(datasetLanguage);
      const headerText = blockNode
        ?.querySelector?.('.flex.items-center.text-token-text-secondary')
        ?.innerText?.trim();
      return safeCodeLanguage(headerText);
    }

    function removeCopyExportCodeChrome(root) {
      root.querySelectorAll(COPY_EXPORT_CODE_CHROME_SELECTOR).forEach((el) => {
        el.remove();
      });
    }

    function collectCopyCodeBlockMeta(root) {
      const preNodes = Array.from(root?.querySelectorAll?.('pre') || []);
      const codeBlocks = Array.from(
        root?.querySelectorAll?.(
          'code[class*="whitespace-pre"], code.whitespace-pre, code[class*="whitespace-pre!"]',
        ) || [],
      ).filter((codeEl) => !codeEl.closest('pre'));

      return [...preNodes, ...codeBlocks].map((node) => {
        const isPre = node.tagName === 'PRE';
        const codeEl = isPre ? node.querySelector('code') || node : node;
        return {
          codeEl,
          language: inferCodeBlockLanguage(node, codeEl),
          node,
        };
      });
    }

    function getNormalizedCodeText(node, codeEl, sourceNode = node, sourceCodeEl = codeEl) {
      const sourceText =
        sourceCodeEl?.innerText ??
        sourceNode?.innerText ??
        codeEl?.innerText ??
        node?.innerText ??
        '';
      return sourceText
        .replace(/\u00A0/g, ' ')
        .replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/gu, '')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t\u00A0\r\n]+$/g, '');
    }

    function buildFencedCodeText(codeText, language = '') {
      const eol = '\r\n';
      if (/^\s*```/.test(codeText)) {
        let fenced = codeText.replace(/\r\n?/g, '\n').replace(/\n/g, eol);
        if (!fenced.endsWith(eol)) fenced += eol;
        return fenced;
      }
      return `\`\`\`${language || ''}${eol}${codeText}${eol}\`\`\`${eol}`;
    }

    function normalizeCodeBlocksInClone(root, sourceRoot = root) {
      const blockMeta = collectCopyCodeBlockMeta(root);
      const sourceBlockMeta = sourceRoot === root ? blockMeta : collectCopyCodeBlockMeta(sourceRoot);

      removeCopyExportCodeChrome(root);

      for (const [index, { codeEl, language, node }] of blockMeta.entries()) {
        if (!root.contains(node)) continue;
        const sourceMeta = sourceBlockMeta[index] || {};
        const codeText = getNormalizedCodeText(
          node,
          codeEl,
          sourceMeta.node || node,
          sourceMeta.codeEl || codeEl,
        );
        const preNew = document.createElement('pre');
        const codeNew = document.createElement('code');
        if (language) codeNew.className = `language-${language}`;
        codeNew.textContent = buildFencedCodeText(codeText, language);
        preNew.appendChild(codeNew);
        node.replaceWith(preNew);
      }
    }

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

    function splitListsAroundCodeBlocks_Word(root) {
      ['ul', 'ol'].forEach((tag) => {
        root.querySelectorAll(tag).forEach((list) => {
          const lis = Array.from(list.children).filter((child) => child.tagName === 'LI');
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
          for (const node of Array.from(list.childNodes)) {
            if (node.tagName !== 'LI') frag.appendChild(node.cloneNode(true));
          }
          list.replaceWith(frag);
        });
      });
    }

    function applyWordSpacingAndFont_Word(root) {
      if (!root) return;
      const baseRules = [
        `font-family:${COPY_EXPORT_FONT_STACK}`,
        'line-height:116%',
        'mso-line-height-alt:116%',
        'mso-line-height-rule:exactly',
      ].join(';');
      const base = root.getAttribute('style') || '';
      root.setAttribute('style', base ? `${base};${baseRules}` : baseRules);

      const selector = 'p, pre, blockquote, li, h1, h2, h3, h4, h5, h6';
      root.querySelectorAll(selector).forEach((el) => {
        const currentStyle = el.getAttribute('style') || '';
        const rules = [
          `font-family:${COPY_EXPORT_FONT_STACK}`,
          'margin-top:0pt',
          'margin-bottom:8pt',
          'line-height:116%',
          'mso-margin-top-alt:0pt',
          'mso-margin-bottom-alt:8pt',
          'mso-line-height-alt:116%',
          'mso-line-height-rule:exactly',
        ].join(';');
        el.setAttribute('style', currentStyle ? `${currentStyle};${rules}` : rules);
      });
    }

    function addListGuardStyles(el) {
      const existing = el.getAttribute('style') || '';
      const guard = 'list-style-type:none;';
      el.setAttribute('style', existing ? `${existing};${guard}` : guard);
    }

    function guardSingleMessageAutoListStartsForWord(root) {
      const WJ = '\u2060';
      const NBSP = '\u00A0';
      const listStartRe = /^(\s*)(\d{1,3}|[A-Za-z])([.)])\s+/;

      function firstText(rootEl) {
        return findFirstCopyTextNode(rootEl);
      }

      function neutralizeStart(textNode) {
        const value = textNode.nodeValue || '';
        if (!value || !listStartRe.test(value)) return;
        textNode.nodeValue = value.replace(
          listStartRe,
          (_, lead, num, punct) => `${lead}${num}${WJ}${punct}${NBSP}`,
        );
      }

      root.querySelectorAll('p, pre, blockquote, h1, h2, h3, h4, h5, h6, div').forEach((el) => {
        if (el.closest('li, ol, ul')) return;
        const textNode = firstText(el);
        if (textNode) neutralizeStart(textNode);
      });

      root.querySelectorAll('p, pre, blockquote, div').forEach((el) => {
        if (el.closest('li, ol, ul')) return;
        el.querySelectorAll('br').forEach((br) => {
          let node = br.nextSibling;
          while (
            node &&
            ((node.nodeType === 3 && !(node.nodeValue || '').trim()) ||
              (node.nodeType === 1 && node.tagName === 'BR'))
          ) {
            node = node.nextSibling;
          }
          if (!node) return;
          if (node.nodeType === 3) {
            neutralizeStart(node);
          } else if (node.nodeType === 1) {
            const textNode = firstText(node);
            if (textNode) neutralizeStart(textNode);
          }
        });
      });
    }

    function getAttachedCopyInnerText(el) {
      if (!document.body) return el?.textContent || '';

      const host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.setAttribute(
        'style',
        [
          'position:fixed',
          'left:-100000px',
          'top:0',
          'width:10000px',
          'max-width:none',
          'height:auto',
          'overflow:visible',
          'opacity:0',
          'pointer-events:none',
          'z-index:-1',
        ].join(';'),
      );

      try {
        host.appendChild(el);
        document.body.appendChild(host);
        return el?.innerText || el?.textContent || '';
      } finally {
        host.remove();
      }
    }

    function buildPlainTextWithFences(root) {
      const clone = root.cloneNode(true);
      normalizeCodeBlocksInClone(clone, root);
      return getAttachedCopyInnerText(clone).replace(/\u00A0/g, ' ').trim();
    }

    function getThreadNavigationScrollAnchorPct() {
      return typeof window.SCROLL_ANCHOR_PCT === 'number' ? window.SCROLL_ANCHOR_PCT : 80;
    }

    function getThreadNavigationScrollableContainer() {
      return typeof window.getScrollableContainer === 'function'
        ? window.getScrollableContainer()
        : window;
    }

    function getThreadNavigationContainerRect(container) {
      return container === window
        ? { top: 0, height: window.innerHeight }
        : {
          top: container.getBoundingClientRect().top,
          height: container.clientHeight,
        };
    }

    function scrollThreadNavigationTargetToAnchor(container, target, options = {}) {
      if (!window.gsap || !target) {
        options.onComplete?.();
        return;
      }

      const scrollAnchorPct = getThreadNavigationScrollAnchorPct();
      const scrollDuration = options.scrollDuration ?? 0.2;
      const rect = target.getBoundingClientRect();
      const contRect = getThreadNavigationContainerRect(container);
      const anchorPx = (contRect.height * scrollAnchorPct) / 100 - rect.height / 2;
      const current = container === window ? window.scrollY : container.scrollTop;
      let targetY =
        container === window
          ? current + rect.top - anchorPx
          : container.scrollTop + (rect.top - contRect.top) - anchorPx;

      const maxScroll =
        container === window
          ? (document.scrollingElement || document.documentElement).scrollHeight - window.innerHeight
          : container.scrollHeight - container.clientHeight;
      targetY = Math.max(0, Math.min(targetY, maxScroll));

      gsap.to(container, {
        duration: scrollDuration,
        scrollTo: { y: targetY, autoKill: false },
        ease: 'power4.out',
        onComplete: options.onComplete,
      });
    }

    const THREAD_NAVIGATION_BOUNDARY_SETTLE_DELAY = 140;
    const threadNavigationPreviewState = {
      inFlight: false,
      targetKey: null,
    };

    function getThreadNavigationGroup(btn) {
      const parent = btn?.parentElement;
      const counter = parent
        ? Array.from(parent.children).find(
          (child) =>
            child.classList?.contains('tabular-nums') &&
            child.previousElementSibling?.tagName === 'BUTTON' &&
            child.nextElementSibling?.tagName === 'BUTTON',
        )
        : null;
      return counter ? parent : btn?.closest('[data-testid^="conversation-turn-"]') || btn;
    }

    function getThreadNavigationTargetKey(btn) {
      const turnId = btn
        ?.closest('[data-testid^="conversation-turn-"]')
        ?.getAttribute('data-testid');
      return turnId || getThreadNavigationGroup(btn);
    }

    function resetThreadNavigationPreviewState() {
      threadNavigationPreviewState.inFlight = false;
      threadNavigationPreviewState.targetKey = null;
    }

    function trackThreadNavigationPreviewTarget(target) {
      threadNavigationPreviewState.inFlight = true;
      threadNavigationPreviewState.targetKey = getThreadNavigationTargetKey(target);
    }

    function completeThreadNavigationPreviewTarget(target) {
      if (threadNavigationPreviewState.targetKey !== getThreadNavigationTargetKey(target)) return;
      threadNavigationPreviewState.inFlight = false;
    }

    function relaunchThreadNavigationHover(wrapper) {
      if (!wrapper) return;
      wrapper.classList.add('force-hover');
      ['pointerover', 'pointerenter', 'mouseover'].forEach((eventName) => {
        wrapper.dispatchEvent(new MouseEvent(eventName, { bubbles: true }));
      });
    }

    function collectThreadNavigationCandidates(config) {
      const counterSibling =
        config.direction === 'previous' ? 'previousElementSibling' : 'nextElementSibling';
      const structuralBtns = Array.from(document.querySelectorAll('div.tabular-nums'))
        .filter(
          (counter) =>
            counter.previousElementSibling?.tagName === 'BUTTON' &&
            counter.nextElementSibling?.tagName === 'BUTTON',
        )
        .map((counter) => counter[counterSibling]);
      const iconSelectors = [
        `button[aria-label="${config.ariaLabel}"]`,
        withPrefix(svgSelectorForTokens(config.iconTokens), 'button'),
      ];
      const iconBtns = iconSelectors.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector)).map(
          (node) => node.closest('button') || node,
        ),
      );
      return Array.from(new Set([...structuralBtns, ...iconBtns].filter(Boolean))).sort((a, b) => {
        if (a === b) return 0;
        return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
    }

    function isThreadNavigationButtonActionable(btn) {
      return !btn.disabled && btn.getAttribute('aria-disabled') !== 'true';
    }

    function isThreadNavigationOverComposer(rect) {
      const composer = document.getElementById('composer-background')?.getBoundingClientRect();
      return composer
        ? !(
          rect.bottom < composer.top ||
          rect.top > composer.bottom ||
          rect.right < composer.left ||
          rect.left > composer.right
        )
        : false;
    }

    function chooseThreadNavigationTarget(buttons) {
      const scrollY = window.scrollY;
      const viewH = window.innerHeight;
      const bottomBuffer = 85;
      const withMeta = buttons.map((btn) => {
        const rect = btn.getBoundingClientRect();
        return {
          absBottom: rect.bottom + scrollY,
          btn,
          fullyVisible:
            rect.top >= 0 &&
            rect.bottom <= viewH - bottomBuffer &&
            !isThreadNavigationOverComposer(rect),
          rect,
        };
      });

      const fully = withMeta.filter((meta) => meta.fullyVisible);
      if (fully.length) return fully.reduce((a, b) => (a.rect.bottom > b.rect.bottom ? a : b)).btn;

      const above = withMeta.filter((meta) => meta.rect.bottom <= 0);
      if (above.length) return above.reduce((a, b) => (a.rect.bottom > b.rect.bottom ? a : b)).btn;

      return withMeta.reduce((a, b) => (a.absBottom > b.absBottom ? a : b)).btn;
    }

    function getAdjacentThreadNavigationTarget(buttons, targetKey, direction) {
      const currentIndex = buttons.findIndex(
        (button) => getThreadNavigationTargetKey(button) === targetKey,
      );
      if (currentIndex < 0) return null;

      const nextIndex = currentIndex + (direction === 'previous' ? -1 : 1);
      return nextIndex >= 0 && nextIndex < buttons.length ? buttons[nextIndex] : null;
    }

    function getThreadNavigationWrapTarget(buttons, direction) {
      return direction === 'previous' ? buttons[buttons.length - 1] : buttons[0];
    }

    function chooseThreadNavigationPreviewTarget(initialTarget, buttons, config) {
      if (!initialTarget || buttons.length < 2) return { scanBoundary: null, target: initialTarget };

      if (!threadNavigationPreviewState.targetKey) {
        return { scanBoundary: null, target: initialTarget };
      }

      const adjacentTarget = getAdjacentThreadNavigationTarget(
        buttons,
        threadNavigationPreviewState.targetKey,
        config.direction,
      );
      return adjacentTarget
        ? { scanBoundary: null, target: adjacentTarget }
        : {
          scanBoundary: config.direction === 'previous' ? 'top' : 'bottom',
          target: null,
        };
    }

    function scrollThreadNavigationContainerToBoundary(container, boundary, options = {}) {
      const maxScroll =
        container === window
          ? (document.scrollingElement || document.documentElement).scrollHeight - window.innerHeight
          : container.scrollHeight - container.clientHeight;
      const targetY = boundary === 'top' ? 0 : Math.max(0, maxScroll);

      if (!window.gsap) {
        if (container === window) window.scrollTo(0, targetY);
        else container.scrollTop = targetY;
        options.onComplete?.();
        return;
      }

      gsap.to(container, {
        duration: options.scrollDuration ?? 0.2,
        scrollTo: { y: targetY, autoKill: false },
        ease: 'power4.out',
        onComplete: options.onComplete,
      });
    }

    function scrollThreadNavigationPreviewTarget(container, target, scrollDuration) {
      if (!target) {
        threadNavigationPreviewState.inFlight = false;
        return;
      }

      trackThreadNavigationPreviewTarget(target);
      scrollThreadNavigationTargetToAnchor(container, target, {
        onComplete: () => {
          flashBorder(target);
          relaunchThreadNavigationHover(target.closest('[class*="group-hover"]'));
          completeThreadNavigationPreviewTarget(target);
        },
        scrollDuration,
      });
    }

    function runThreadNavigationBoundaryScan(container, config, scrollDuration) {
      const currentTargetKey = threadNavigationPreviewState.targetKey;
      const scanBoundary = config.direction === 'previous' ? 'top' : 'bottom';
      const wrapBoundary = config.direction === 'previous' ? 'bottom' : 'top';
      threadNavigationPreviewState.inFlight = true;

      const settleThenResolve = (afterScan) => {
        setTimeout(afterScan, THREAD_NAVIGATION_BOUNDARY_SETTLE_DELAY);
      };
      const scrollToWrappedTarget = () => {
        scrollThreadNavigationContainerToBoundary(container, wrapBoundary, {
          onComplete: () => {
            settleThenResolve(() => {
              const wrappedCandidates = collectThreadNavigationCandidates(config);
              scrollThreadNavigationPreviewTarget(
                container,
                getThreadNavigationWrapTarget(wrappedCandidates, config.direction),
                scrollDuration,
              );
            });
          },
          scrollDuration,
        });
      };

      scrollThreadNavigationContainerToBoundary(container, scanBoundary, {
        onComplete: () => {
          settleThenResolve(() => {
            const scannedCandidates = collectThreadNavigationCandidates(config);
            const adjacentTarget = getAdjacentThreadNavigationTarget(
              scannedCandidates,
              currentTargetKey,
              config.direction,
            );
            if (adjacentTarget) {
              scrollThreadNavigationPreviewTarget(container, adjacentTarget, scrollDuration);
              return;
            }
            scrollToWrappedTarget();
          });
        },
        scrollDuration,
      });
    }

    function getThreadNavigationMessageId(btn) {
      return btn.closest('[data-message-id]')?.getAttribute('data-message-id');
    }

    function recenterThreadNavigationTarget(msgId, scrollDuration) {
      if (!msgId) return;
      const container = getThreadNavigationScrollableContainer();
      const target = document.querySelector(`[data-message-id="${msgId}"] button`);
      if (!target) return;
      scrollThreadNavigationTargetToAnchor(container, target, { scrollDuration });
    }

    function runThreadNavigationShortcut(opts = {}, config = {}) {
      const initialDelay = config.initialDelay ?? 25;
      const postClickDelay = config.postClickDelay ?? 175;
      const scrollDuration = config.scrollDuration ?? 0.2;

      setTimeout(() => {
        try {
          if (opts.previewOnly && threadNavigationPreviewState.inFlight) return;

          const all = collectThreadNavigationCandidates(config);
          const candidates = opts.previewOnly
            ? all
            : all.filter(isThreadNavigationButtonActionable);
          if (!candidates.length) return;

          const container = getThreadNavigationScrollableContainer();
          let target = chooseThreadNavigationTarget(candidates);

          if (opts.previewOnly) {
            const previewChoice = chooseThreadNavigationPreviewTarget(
              target,
              candidates,
              config,
            );
            if (previewChoice.scanBoundary) {
              runThreadNavigationBoundaryScan(container, config, scrollDuration);
              return;
            }
            target = previewChoice.target;
            scrollThreadNavigationPreviewTarget(container, target, scrollDuration);
            return;
          }
          resetThreadNavigationPreviewState();

          if (!target) return;
          const msgId = getThreadNavigationMessageId(target);

          scrollThreadNavigationTargetToAnchor(container, target, {
            onComplete: () => {
              flashBorder(target);
              relaunchThreadNavigationHover(target.closest('[class*="group-hover"]'));

              setTimeout(() => {
                target.click();
                setTimeout(
                  () => recenterThreadNavigationTarget(msgId, scrollDuration),
                  postClickDelay,
                );
              }, postClickDelay);
            },
            scrollDuration,
          });
        } catch (_) {
          if (opts.previewOnly) threadNavigationPreviewState.inFlight = false;
          /* silent */
        }
      }, initialDelay);
    }

    function buildSingleMessageClipboardPayload(contentEls) {
      const elements = normalizeCopyContentElements(contentEls);
      if (!elements.length) return { html: '', text: '' };

      const turnWrapper = document.createElement('div');
      turnWrapper.setAttribute('data-export', 'chatgpt-shortcuts-single-message');

      const roleContainer = elements[0].closest?.('[data-message-author-role]');
      turnWrapper.setAttribute(
        'data-role',
        roleContainer?.getAttribute?.('data-message-author-role') || 'assistant',
      );

      const textParts = [];
      for (const contentEl of elements) {
        const cloneForHtml = contentEl.cloneNode(true);

        const isUser = !!contentEl.closest?.('[data-message-author-role="user"]');
        if (isUser) replaceNewlinesWithBr_UserPreWrap(cloneForHtml);

        normalizeCodeBlocksInClone(cloneForHtml, contentEl);
        demotePTagsAndStripDataAttrs(cloneForHtml);
        splitListsAroundCodeBlocks_Word(cloneForHtml);

        const bodyDiv = document.createElement('div');
        bodyDiv.innerHTML = cloneForHtml.innerHTML;

        applyWordSpacingAndFont_Word(bodyDiv);
        splitListsAroundCodeBlocks_Word(bodyDiv);
        guardSingleMessageAutoListStartsForWord(bodyDiv);

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

    async function copySingleMessagePayloadFromElements(contentEls) {
      await copyClipboardPayload(buildSingleMessageClipboardPayload(contentEls));
    }

    function selectAndMaybeCopySingleMessage(contentEls, shouldCopy = true) {
      try {
        const elements = normalizeCopyContentElements(contentEls);
        if (!elements.length) return;
        selectElementsForCopyFeedback(elements, { fallback: 'first-element' });
        if (shouldCopy) void copySingleMessagePayloadFromElements(elements);
      } catch (err) {
        if (COPY_SHORTCUT_DEBUG) console.debug('selectAndMaybeCopySingleMessage failed:', err);
      }
    }

    function installSelectThenCopyButtonHandler() {
      if (window.__selectThenCopyCopyHandlerAttached) return;
      document.addEventListener('click', (e) => {
        const btn = e.target.closest?.('[data-testid="copy-turn-action-button"]');
        if (!btn) return;
        if (isCodeBoxCopyControl(btn)) return;

        const contentEls = getCopyButtonContentElements(btn);
        if (contentEls.length) {
          selectAndMaybeCopySingleMessage(contentEls, true);
        }
      });
      window.__selectThenCopyCopyHandlerAttached = true;
    }

    function runSelectThenCopyShortcut() {
      setTimeout(() => {
        try {
          window.selectThenCopyState = window.selectThenCopyState || { lastSelectedIndex: -1 };
          const onlySelectAssistant = window.onlySelectAssistantCheckbox || false;
          const onlySelectUser = window.onlySelectUserCheckbox || false;
          const disableCopyAfterSelect = window.disableCopyAfterSelectCheckbox || false;
          const shouldCopy = !disableCopyAfterSelect;

          const filteredVisibleTurns = getVisibleCopyTurnsAboveComposer().filter((turn) => {
            if (onlySelectAssistant && !copyTurnHasRole(turn, 'assistant')) return false;
            if (onlySelectUser && !copyTurnHasRole(turn, 'user')) return false;
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
          window.selectThenCopyState.lastSelectedIndex = nextIndex;

          const contentEls = getPrimaryCopyContentElementsForTurn(selectedTurn);
          if (!contentEls.length) return;

          selectAndMaybeCopySingleMessage(contentEls, shouldCopy);
        } catch (err) {
          if (COPY_SHORTCUT_DEBUG) console.debug('outer selectThenCopy failure:', err);
        }
      }, 50);
    }

    function getConversationCopyLabelText(turn, role, includeLabels) {
      if (!includeLabels) return '';
      let nativeLabel = '';
      try {
        nativeLabel = (
          turn.querySelector?.('h4.sr-only, h5.sr-only, h6.sr-only')?.textContent || ''
        ).trim();
      } catch (_) {
        /* ignore */
      }
      const fallbackLabel = role === 'user' ? 'You said:' : 'ChatGPT said:';
      return nativeLabel || fallbackLabel;
    }

    function buildConversationClipboardPayload({
      includeAssistant,
      includeUser,
      includeLabels,
    }) {
      const allTurns = Array.from(document.querySelectorAll(COPY_CONVERSATION_TURN_SELECTOR));
      const filteredTurns = allTurns.filter((turn) => {
        if (copyTurnHasRole(turn, 'assistant') && includeAssistant) return true;
        if (copyTurnHasRole(turn, 'user') && includeUser) return true;
        return false;
      });

      const turnContentGroups = filteredTurns
        .map((turn) => ({
          els: getCopyContentElementsForTurn(turn, getPreferredCopyRoleForTurn(turn), {
            fallbackToContainer: true,
          }),
          turn,
        }))
        .filter(({ els }) => els.length);

      if (!turnContentGroups.length) return { html: '', text: '' };

      const blocksHTML = [];
      const blocksText = [];
      const selectionEls = [];

      for (const { els, turn } of turnContentGroups) {
        const roleContainer = els[0]?.closest?.('[data-message-author-role]');
        const role = roleContainer?.getAttribute?.('data-message-author-role') || 'assistant';
        const labelText = getConversationCopyLabelText(turn, role, includeLabels);
        const turnWrapper = document.createElement('div');
        turnWrapper.setAttribute('data-role', role);

        if (labelText) {
          const spacerP = document.createElement('p');
          spacerP.setAttribute(
            'style',
            'margin-top:0pt;margin-bottom:8pt;line-height:116%;mso-line-height-alt:116%;mso-line-height-rule:exactly;',
          );
          spacerP.innerHTML = '&nbsp;';
          turnWrapper.appendChild(spacerP);

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
          const cloneForHtml = el.cloneNode(true);

          if (role === 'user') {
            replaceNewlinesWithBr_UserPreWrap(cloneForHtml);
          }

          normalizeCodeBlocksInClone(cloneForHtml, el);
          demotePTagsAndStripDataAttrs(cloneForHtml);
          splitListsAroundCodeBlocks_Word(cloneForHtml);

          const bodyDiv = document.createElement('div');
          bodyDiv.innerHTML = cloneForHtml.innerHTML;

          applyWordSpacingAndFont_Word(bodyDiv);

          turnWrapper.appendChild(bodyDiv);
          textParts.push(buildPlainTextWithFences(el));
        }

        blocksHTML.push(turnWrapper.outerHTML);

        const contentText = textParts.filter(Boolean).join('\n\n');
        blocksText.push(labelText ? `${labelText}\n${contentText}` : contentText);
      }

      const html =
        '<div data-export="chatgpt-shortcuts-entire-conversation">' +
        blocksHTML.join('') +
        '</div>';
      const text = blocksText.join('\n\n');

      return { html, text, contentEls: selectionEls };
    }

    function runSelectThenCopyAllMessagesShortcut() {
      setTimeout(() => {
        try {
          const onlyAssistant = resolveConversationCopyFlag(
            window.selectThenCopyAllMessagesOnlyAssistant || false,
          );
          const onlyUser = resolveConversationCopyFlag(
            window.selectThenCopyAllMessagesOnlyUser || false,
          );
          let includeAssistant = true;
          let includeUser = true;
          if (onlyAssistant) {
            includeUser = false;
          } else if (onlyUser) {
            includeAssistant = false;
          }

          const omitViaSeparators = resolveConversationCopyFlag(
            window.includeLabelsAndSeparatorsCheckbox,
          );
          const omitViaDoNotInclude = resolveConversationCopyFlag(window.doNotIncludeLabelsCheckbox);
          const includeLabels = !(omitViaSeparators || omitViaDoNotInclude);

          const { html, text, contentEls } = buildConversationClipboardPayload({
            includeAssistant,
            includeUser,
            includeLabels,
          });

          if (!html && !text) return;

          if (contentEls?.length) {
            selectElementsForCopyFeedback(contentEls);
          }

          void copyClipboardPayload({ html, text });
        } catch (err) {
          if (COPY_SHORTCUT_DEBUG) console.debug('selectThenCopyAllMessages error:', err);
        }
      }, 50);
    }

    installSelectThenCopyButtonHandler();
    window.selectThenCopyState = window.selectThenCopyState || { lastSelectedIndex: -1 };

    const EditMessageShortcut = (() => {
      // Centralized timing constants (all halved from original)
      const DELAY_SAFE_CLICK = 300; // after scroll, before click
      const GSAP_SCROLL_DURATION = 0.3; // smooth scroll duration with GSAP
      const DELAY_FALLBACK_FINISH = 125; // fallback delay if GSAP unavailable
      const DELAY_INITIAL_SCAN = 25; // initial wait before scanning buttons
      const EDIT_ICON_TOKENS = ['M11.3312 3.56837C12.7488', '#6d87e1'];
      const editSelectors = [withPrefix(svgSelectorForTokens(EDIT_ICON_TOKENS), 'button')];

      const getEditButtonData = (root = document) => {
        const queryRoot = root && typeof root.querySelectorAll === 'function' ? root : document;
        return Array.from(
          new Set(
            editSelectors
              .flatMap((sel) =>
                Array.from(queryRoot.querySelectorAll(sel)).map(
                  (node) => node.closest('button') || node,
                ),
              )
              .filter(Boolean),
          ),
        )
          .filter((btn) => btn !== null)
          .map((btn) => {
            const rect = btn.getBoundingClientRect();
            return { btn, rect };
          });
      };

      const pickEditTarget = (buttonData) => {
        const filteredButtonsData = buttonData
          .filter(({ btn, rect }) => isAboveComposer(rect, btn))
          .sort((a, b) => a.rect.top - b.rect.top);

        const inViewport = filteredButtonsData.filter(
          ({ rect }) =>
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
            rect.left < (window.innerWidth || document.documentElement.clientWidth),
        );

        if (inViewport.length > 0) {
          return inViewport.reduce((bottomMost, current) =>
            current.rect.top > bottomMost.rect.top ? current : bottomMost,
          ).btn;
        }

        const aboveViewport = filteredButtonsData.filter(({ rect }) => rect.bottom < 0);
        if (aboveViewport.length > 0) {
          return aboveViewport.reduce((closest, current) =>
            current.rect.bottom > closest.rect.bottom ? current : closest,
          ).btn;
        }

        return null;
      };

      const resolveFinalEditButton = (initialButton) => {
        const initialTurn = initialButton?.closest?.(CONVERSATION_TURN_SELECTOR);
        if (initialTurn?.isConnected) {
          const sameTurnButton = pickEditTarget(getEditButtonData(initialTurn));
          if (sameTurnButton) return sameTurnButton;

          const sameTurnButtons = getEditButtonData(initialTurn);
          if (sameTurnButtons.length > 0) return sameTurnButtons[sameTurnButtons.length - 1].btn;
        }

        return pickEditTarget(getEditButtonData()) || (initialButton?.isConnected ? initialButton : null);
      };

      const clickEditButton = (button) => {
        if (!button || !button.isConnected || typeof button.click !== 'function') return false;
        if (button.disabled || button.getAttribute?.('aria-disabled') === 'true') return false;

        const rect = button.getBoundingClientRect();
        const center =
          rect && rect.width > 0 && rect.height > 0
            ? {
              clientX: Math.round(rect.left + rect.width / 2),
              clientY: Math.round(rect.top + rect.height / 2),
            }
            : {};
        const pointTarget =
          Number.isFinite(center.clientX) && Number.isFinite(center.clientY)
            ? document.elementFromPoint(center.clientX, center.clientY)
            : null;
        const eventTarget = pointTarget && button.contains(pointTarget) ? pointTarget : button;
        const mouseBase = {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          button: 0,
          ...center,
        };
        const pointerBase = {
          ...mouseBase,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
        };

        try {
          button.focus?.({ preventScroll: true });
        } catch { }

        try {
          if (typeof PointerEvent === 'function') {
            eventTarget.dispatchEvent(
              new PointerEvent('pointerover', { ...pointerBase, buttons: 0 }),
            );
            eventTarget.dispatchEvent(
              new PointerEvent('pointerenter', { ...pointerBase, bubbles: false, buttons: 0 }),
            );
            eventTarget.dispatchEvent(
              new PointerEvent('pointerdown', { ...pointerBase, buttons: 1 }),
            );
          }
          eventTarget.dispatchEvent(new MouseEvent('mouseover', { ...mouseBase, buttons: 0 }));
          eventTarget.dispatchEvent(new MouseEvent('mousedown', { ...mouseBase, buttons: 1 }));
          if (typeof PointerEvent === 'function') {
            eventTarget.dispatchEvent(
              new PointerEvent('pointerup', { ...pointerBase, buttons: 0 }),
            );
          }
          eventTarget.dispatchEvent(new MouseEvent('mouseup', { ...mouseBase, buttons: 0 }));
          eventTarget.dispatchEvent(new MouseEvent('click', { ...mouseBase, buttons: 0 }));
          if (button.isConnected) button.click();
          return true;
        } catch {
          try {
            button.click();
            return true;
          } catch {
            return false;
          }
        }
      };

      const getScrollContainerMetrics = (container) => {
        if (container === window) {
          return {
            scrollTop: window.scrollY,
            viewportTop: 0,
            viewportBottom: window.innerHeight || document.documentElement.clientHeight,
            maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
            scrollTo: (top, behavior = 'auto') => window.scrollTo({ top, behavior }),
          };
        }

        const rect = container.getBoundingClientRect();
        return {
          scrollTop: container.scrollTop,
          viewportTop: rect.top,
          viewportBottom: rect.bottom,
          maxScroll: Math.max(0, container.scrollHeight - container.clientHeight),
          scrollTo: (top, behavior = 'auto') => {
            if (typeof container.scrollTo === 'function') {
              container.scrollTo({ top, behavior });
            } else {
              container.scrollTop = top;
            }
          },
        };
      };

      const resolveScrollContainer = () => {
        try {
          if (typeof getScrollableContainer === 'function') {
            const candidate = getScrollableContainer();
            if (candidate && candidate instanceof Element && candidate.isConnected) {
              return candidate;
            }
          }
        } catch { }

        return window;
      };

      const getEditTurn = (target) => target?.closest?.(CONVERSATION_TURN_SELECTOR) || null;

      const findOpenedEditField = (turn) => {
        if (!turn?.isConnected) return null;
        return (
          Array.from(
            turn.querySelectorAll(
              'textarea, [contenteditable="true"][role="textbox"], [contenteditable="true"]',
            ),
          )
            .filter((field) => field instanceof Element && field.isConnected)
            .find((field) => {
              const rect = field.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            }) || null
        );
      };

      const smoothScrollContainerTo = (container, top) => {
        try {
          const hasScrollTo =
            window.gsap &&
            ((gsap.plugins && (gsap.plugins.scrollTo || gsap.plugins.ScrollToPlugin)) ||
              typeof ScrollToPlugin !== 'undefined');
          if (hasScrollTo) {
            gsap.to(container, {
              duration: 0.25,
              scrollTo: { y: top, autoKill: true },
              ease: 'power2.out',
            });
            return true;
          }
        } catch { }

        try {
          if (container === window) {
            window.scrollTo({ top, behavior: 'smooth' });
            return true;
          }
          if (typeof container.scrollTo === 'function') {
            container.scrollTo({ top, behavior: 'smooth' });
            return true;
          }
        } catch { }

        return false;
      };

      const scrollOverlappingEditCardAboveComposer = (targetTurnOrButton) => {
        const turn = getEditTurn(targetTurnOrButton);
        if (!turn?.isConnected) return { found: false, scrolled: false };

        const editField = findOpenedEditField(turn);
        if (!editField) return { found: false, scrolled: false };

        const editFrame =
          editField.closest('.bg-token-main-surface-tertiary.rounded-3xl') ||
          editField.closest('.bg-token-main-surface-tertiary, .rounded-3xl, [data-message-id]') ||
          editField;
        const target = turn.contains(editFrame) ? editFrame : editField;
        const rect = target.getBoundingClientRect();
        const container = resolveScrollContainer();
        const metrics = getScrollContainerMetrics(container);
        const composerTop = getComposerTopEdge();
        if (!Number.isFinite(composerTop) || composerTop <= metrics.viewportTop) {
          return { found: true, scrolled: false };
        }

        const margin = 16;
        const exposedBottom = Math.min(metrics.viewportBottom, composerTop) - margin;
        const overlap = rect.bottom - exposedBottom;
        if (overlap <= 8) return { found: true, scrolled: false };

        const nextTop = metrics.scrollTop + overlap;
        const clampedTop = Math.max(0, Math.min(nextTop, metrics.maxScroll));
        if (Math.abs(clampedTop - metrics.scrollTop) < 1) {
          return { found: true, scrolled: false };
        }

        return { found: true, scrolled: smoothScrollContainerTo(container, clampedTop) };
      };

      const stabilizeOpenedEditCard = (targetTurnOrButton) => {
        const run = () => {
          scrollOverlappingEditCardAboveComposer(targetTurnOrButton);
        };

        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => setTimeout(run, 150));
        } else {
          setTimeout(run, 150);
        }
      };

      const focusAndSelectEditField = (turn) => {
        if (!turn?.isConnected || !findOpenedEditField(turn)) return false;
        let expectedText = null;

        const selectFieldText = () => {
          if (!turn?.isConnected) return;
          const editField = findOpenedEditField(turn);
          if (!editField) return;

          const currentText = editField.matches('textarea, input')
            ? editField.value || ''
            : editField.textContent || '';
          if (expectedText === null || (expectedText === '' && currentText)) {
            expectedText = currentText;
          } else if (currentText !== expectedText) {
            return;
          }

          try {
            editField.focus({ preventScroll: true });
          } catch {
            try {
              editField.focus();
            } catch { }
          }

          try {
            if (editField.matches('textarea, input')) {
              const length = editField.value?.length || 0;
              if (
                document.activeElement === editField &&
                editField.selectionStart === 0 &&
                editField.selectionEnd === length
              ) {
                return;
              }
              if (typeof editField.select === 'function') editField.select();
              editField.setSelectionRange(0, length);
              return;
            }

            if (editField.isContentEditable) {
              const range = document.createRange();
              range.selectNodeContents(editField);
              const selection = window.getSelection();
              selection?.removeAllRanges();
              selection?.addRange(range);
            }
          } catch { }
        };

        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => {
            selectFieldText();
            setTimeout(selectFieldText, 80);
            setTimeout(selectFieldText, 250);
          });
        } else {
          setTimeout(selectFieldText, 0);
          setTimeout(selectFieldText, 80);
          setTimeout(selectFieldText, 250);
        }

        return true;
      };

      const handleOpenedEditField = (turn) => {
        focusAndSelectEditField(turn);
        stabilizeOpenedEditCard(turn);
      };

      const waitForOpenedEditField = (turn, onOpen, timeout = 1500) => {
        if (!turn?.isConnected || typeof onOpen !== 'function') return false;
        let done = false;
        let observer = null;
        let timeoutId = null;
        let rafId = null;

        const cleanup = () => {
          done = true;
          observer?.disconnect();
          if (timeoutId !== null) clearTimeout(timeoutId);
          if (rafId !== null && typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(rafId);
          }
        };

        const check = () => {
          if (done) return true;
          if (!turn?.isConnected) {
            cleanup();
            return true;
          }
          if (findOpenedEditField(turn)) {
            cleanup();
            onOpen();
            return true;
          }
          return false;
        };

        const scheduleCheck = () => {
          if (done) return;
          if (typeof window.requestAnimationFrame === 'function') {
            if (rafId !== null) return;
            rafId = window.requestAnimationFrame(() => {
              rafId = null;
              check();
            });
          } else {
            setTimeout(check, 0);
          }
        };

        if (check()) return true;

        observer = new MutationObserver(scheduleCheck);
        observer.observe(turn, { childList: true, subtree: true });
        timeoutId = setTimeout(() => {
          check();
          cleanup();
        }, timeout);

        return true;
      };

      const openEditButtonWithRetry = (button) => {
        const turn = getEditTurn(button);
        if (!turn?.isConnected || !clickEditButton(button)) return;
        let handled = false;
        const handleOnce = () => {
          if (handled) return;
          handled = true;
          handleOpenedEditField(turn);
        };
        waitForOpenedEditField(turn, handleOnce);

        setTimeout(() => {
          if (findOpenedEditField(turn)) {
            handleOnce();
            return;
          }

          if (!button?.isConnected) {
            return;
          }
          clickEditButton(button);
          waitForOpenedEditField(turn, handleOnce);

          setTimeout(() => {
            if (findOpenedEditField(turn)) {
              handleOnce();
            }
          }, 100);
        }, 100);
      };

      // always scroll to center if possible, clamp if not
      const gsapScrollToCenterAndClick = (button) => {
        if (!button || !button.isConnected || typeof button.click !== 'function') return;

        const container = resolveScrollContainer();

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

        let finished = false;
        const finish = () => {
          const clickFinalTarget = () => {
            const finalButton = resolveFinalEditButton(button);
            if (!finalButton) return;
            try {
              if (typeof flashBorder === 'function') flashBorder(finalButton);
            } catch { }
            openEditButtonWithRetry(finalButton);
          };

          if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => setTimeout(clickFinalTarget, DELAY_SAFE_CLICK));
          } else {
            setTimeout(clickFinalTarget, DELAY_SAFE_CLICK);
          }
        };
        const finishOnce = () => {
          if (finished) return;
          finished = true;
          finish();
        };

        const animateWithGsap = () => {
          try {
            if (!window.gsap) return false;
            const scrollElement =
              container === window
                ? document.scrollingElement || document.documentElement
                : container;
            const targetTurn = getEditTurn(button);
            if (
              scrollElement instanceof Element &&
              targetTurn instanceof HTMLElement &&
              typeof scrollToMessageTop === 'function' &&
              typeof getMessageScrollOptions === 'function'
            ) {
              const { scrollOffset } = getMessageScrollOptions();
              scrollToMessageTop(scrollElement, targetTurn, scrollOffset);
              setTimeout(finishOnce, GSAP_SCROLL_DURATION * 1000 + 150);
              return true;
            }

            if (
              scrollElement instanceof Element &&
              button instanceof HTMLElement &&
              typeof animateMessageScrollTo === 'function'
            ) {
              animateMessageScrollTo(scrollElement, targetY, button, offsetCenter);
              setTimeout(finishOnce, GSAP_SCROLL_DURATION * 1000 + 150);
              return true;
            }

            const hasScrollTo =
              (gsap.plugins && (gsap.plugins.scrollTo || gsap.plugins.ScrollToPlugin)) ||
              typeof ScrollToPlugin !== 'undefined';
            if (!hasScrollTo) return false;

            gsap.to(container, {
              duration: GSAP_SCROLL_DURATION,
              scrollTo: { y: targetY, autoKill: true },
              ease: 'power4.out',
              onComplete: finishOnce,
              onInterrupt: finishOnce,
            });
            setTimeout(finishOnce, GSAP_SCROLL_DURATION * 1000 + 150);
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
          setTimeout(finishOnce, DELAY_FALLBACK_FINISH);
        }
      };

      function run() {
        setTimeout(() => {
          try {
            const targetButton = pickEditTarget(getEditButtonData());

            if (targetButton) {
              gsapScrollToCenterAndClick(targetButton);
            }
          } catch { }
        }, DELAY_INITIAL_SCAN);
      }

      return { run };
    })();

    function runEditMessageShortcut() {
      EditMessageShortcut.run();
    }

    const SendEditShortcut = (() => {
      const DELAY_BEFORE_CLICK = 250;
      const COMPOSER_SCOPE_SELECTOR =
        '#thread-bottom-container, #thread-bottom, form[data-type="unified-composer"], #composer-background';
      const USER_TURN_SELECTOR =
        'section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"], [data-turn="user"]';

      let viewportHeight = 0;
      let viewportWidth = 0;

      const refreshViewportMetrics = () => {
        viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      };

      const getUserTurn = (el) => {
        const turn = el?.closest?.(USER_TURN_SELECTOR);
        return turn?.getAttribute?.('data-turn') === 'user' ? turn : null;
      };

      const isEligibleEditSendButton = (btn) => {
        if (!btn || btn.disabled) return false;
        if (btn.closest(COMPOSER_SCOPE_SELECTOR)) return false;
        if (btn.closest('[aria-hidden="true"]')) return false;
        const style = window.getComputedStyle(btn);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
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

      const getFocusedEditField = () => {
        const roots = [];
        if (document.activeElement instanceof Element) roots.push(document.activeElement);

        try {
          const selection = window.getSelection?.();
          for (const node of [selection?.anchorNode, selection?.focusNode]) {
            const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
            if (element instanceof Element) roots.push(element);
          }
        } catch { }

        return (
          roots
            .map((root) => root.closest?.('textarea, input, [contenteditable="true"]'))
            .filter((field) => field instanceof Element && field.isConnected)
            .find((field) => {
              if (!getUserTurn(field) || field.closest(COMPOSER_SCOPE_SELECTOR)) return false;

              const rect = field.getBoundingClientRect();
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.bottom > 0 &&
                rect.right > 0 &&
                rect.top < viewportHeight &&
                rect.left < viewportWidth &&
                isAboveComposer(rect, field)
              );
            }) || null
        );
      };

      const findFocusedEditSendButton = () => {
        const editField = getFocusedEditField();
        if (!editField) return null;

        const editCard =
          editField.closest('.bg-token-main-surface-tertiary') ||
          editField.closest('.rounded-3xl') ||
          editField.closest('[data-message-id]') ||
          getUserTurn(editField);
        if (!editCard) return null;

        const rows = Array.from(
          new Set([
            ...Array.from(editCard.querySelectorAll('div.flex.justify-end.gap-2')),
            ...Array.from(editCard.querySelectorAll('div.flex.justify-end')),
          ]),
        );
        const buttons = rows
          .flatMap((row) => Array.from(row.querySelectorAll('button')))
          .filter(isEligibleEditSendButton);
        if (!buttons.length) return null;

        return (
          buttons.find((btn) => btn.classList.contains('btn-primary')) ||
          buttons.reduce((rightMost, current) => {
            const rightRect = rightMost.getBoundingClientRect();
            const currentRect = current.getBoundingClientRect();
            if (currentRect.top > rightRect.top + 4) return current;
            return currentRect.right >= rightRect.right ? current : rightMost;
          })
        );
      };

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

      const findTextareaEditSendButtons = () =>
        Array.from(document.querySelectorAll('textarea'))
          .map((ta) => {
            if (!getUserTurn(ta) || ta.closest(COMPOSER_SCOPE_SELECTOR)) return null;

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

      const findFallbackEditSendButtons = () =>
        Array.from(document.querySelectorAll('div.flex.justify-end.gap-2, div.flex.justify-end'))
          .map((row) => {
            if (row.closest(COMPOSER_SCOPE_SELECTOR)) return null;
            const scope = row.closest(
              '.bg-token-main-surface-tertiary, .rounded-3xl, [data-message-id], section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"]',
            );
            if (!scope) return null;
            if (!getUserTurn(scope)) return null;
            if (!scope.querySelector('textarea, [contenteditable="true"]')) return null;
            return findEditSendButton(row);
          })
          .filter(Boolean);

      const chooseBottomMostEditSendButton = (buttons) =>
        buttons.reduce((bottomMost, current) => {
          const bottomRect = bottomMost.getBoundingClientRect();
          const currentRect = current.getBoundingClientRect();
          return currentRect.top >= bottomRect.top ? current : bottomMost;
        });

      const flashAndClickSendEditButton = (btn) => {
        if (window.gsap) flashBorder(btn);
        setTimeout(() => {
          safeClick(btn);
        }, DELAY_BEFORE_CLICK);
      };

      function run() {
        try {
          refreshViewportMetrics();

          const focusedSendButton = findFocusedEditSendButton();
          if (focusedSendButton) {
            flashAndClickSendEditButton(focusedSendButton);
            return;
          }

          const candidateButtons = Array.from(
            new Set([...findTextareaEditSendButtons(), ...findFallbackEditSendButtons()]),
          );
          const visibleSendButtons = candidateButtons.filter(isEligibleEditSendButton);

          if (!visibleSendButtons.length) return;

          flashAndClickSendEditButton(chooseBottomMostEditSendButton(visibleSendButtons));
        } catch {
          // Fail silently
        }
      }

      return { run };
    })();

    function runSendEditShortcut() {
      SendEditShortcut.run();
    }

    const SHORTCUT_ICON_TOKENS = {
      addPhotosFiles: ['#712359', 'M4.33496 12.5V7.5C4.33496'],
      askToChangeResponseInputMenu: ['M3.502 16.6663V13.3333C3.502', '#ec66f0'],
      branchInNewChatMenuItem: ['M3.32996 10H8.01173C8.7455', '#03583c'],
      createImage: ['#ccfd18', '#266724', 'M9.38759 8.53403C10.0712'],
      deepResearch: ['#46f45a'],
      dontSearchTheWebMenuItem: ['#9254a2'],
      moreDotsMenuButton: ['M15.498 8.50159C16.3254', '#f6d0e2'],
      newGptConversationMenuItem: ['M2.6687 11.333V8.66699C2.6687', '#3a5c87'],
      readAloudMenuItem: ['M9.75122 4.09203C9.75122', '#54f145'],
      regenerateMenuButton: ['M3.502 16.6663V13.3333C3.502', '#ec66f0'],
      searchWeb: ['#6d72eb', '#6b0d8c', 'M10 2.125C14.3492'],
      thinkingMenuButton: ['#127a53', '#c9d737'],
    };

    const LEGACY_THINKING_MENU_ITEM_BY_OPTION_ID = {
      'thinking-extended': '#143e56',
      'thinking-standard': '#fec800',
      'thinking-light': '#407870',
      'thinking-heavy': '#3c5754',
    };

    const BOTTOM_BAR_CONTAINER_SELECTOR = '#bottomBarContainer';
    const OPEN_RADIX_MENU_SELECTOR = 'div[role="menu"][data-state="open"]';

    function flashShortcutTarget(el) {
      if (window.gsap && typeof flashBorder === 'function') flashBorder(el);
    }

    function activateMenuItemWithKeyboardThenClick(el) {
      try {
        el.focus();
      } catch {}
      try {
        el.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }),
        );
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      } catch {}
      try {
        el.click();
      } catch {}
    }

    function activateOpenMenuItem(el) {
      if (!(el instanceof Element)) return false;
      flashShortcutTarget(el);
      activateMenuItemWithKeyboardThenClick(el);
      return true;
    }

    function findOpenReadAloudMenuItem() {
      const readAloudSelector = withPrefix(
        svgSelectorForTokens(SHORTCUT_ICON_TOKENS.readAloudMenuItem),
        `${OPEN_RADIX_MENU_SELECTOR} div[role="menuitem"]`,
      );
      return document.querySelector(readAloudSelector)?.closest('div[role="menuitem"]') || null;
    }

    function runReadAloudShortcut() {
      const stopInOpenMenu = document.querySelector(
        `${OPEN_RADIX_MENU_SELECTOR} div[role="menuitem"][data-testid="voice-play-turn-action-button"]`,
      );
      if (activateOpenMenuItem(stopInOpenMenu)) return;

      if (activateOpenMenuItem(findOpenReadAloudMenuItem())) return;

      clickLowestSvgThenSubItemSvg(
        SHORTCUT_ICON_TOKENS.moreDotsMenuButton,
        SHORTCUT_ICON_TOKENS.readAloudMenuItem,
        BOTTOM_BAR_CONTAINER_SELECTOR,
      );
    }

    function runBranchInNewChatShortcut() {
      clickLowestSvgThenSubItemSvg(
        SHORTCUT_ICON_TOKENS.moreDotsMenuButton,
        SHORTCUT_ICON_TOKENS.branchInNewChatMenuItem,
        BOTTOM_BAR_CONTAINER_SELECTOR,
      );
    }

    function runRegenerateTryAgainShortcut() {
      clickLowestSvgThenSubItemSvg(
        SHORTCUT_ICON_TOKENS.regenerateMenuButton,
        SHORTCUT_ICON_TOKENS.regenerateMenuButton,
      );
    }

    function runRegenerateWithDifferentModelShortcut() {
      clickLowestSvgThenSubItemSvg(
        SHORTCUT_ICON_TOKENS.regenerateMenuButton,
        SHORTCUT_ICON_TOKENS.dontSearchTheWebMenuItem,
      );
    }

    function runRegenerateAskToChangeResponseShortcut() {
      runRadixMenuActionFocusInputByName(
        SHORTCUT_ICON_TOKENS.askToChangeResponseInputMenu,
        'contextual-retry-dropdown-input',
        {
          caret: 'end',
          selectAll: false,
        },
      );
    }

    async function runIconToolbarShortcut(iconTokenKey) {
      await runActionByIcon(SHORTCUT_ICON_TOKENS[iconTokenKey]);
    }

    function runLegacyThinkingEffortShortcut(optionId) {
      if (window.__cspRunThinkingEffortAction?.(optionId)) return;
      delayCall(
        clickLowestSvgThenSubItemSvg,
        350,
        SHORTCUT_ICON_TOKENS.thinkingMenuButton,
        LEGACY_THINKING_MENU_ITEM_BY_OPTION_ID[optionId],
      );
    }

    function runProThinkingEffortShortcut(optionId) {
      window.__cspRunProThinkingEffortAction?.(optionId);
    }

    function runTemporaryChatShortcut() {
      const root = document.querySelector('#conversation-header-actions') || document;
      const el =
        root.querySelector('button svg use[href*="#28a8a0"]')?.closest('button') ||
        root.querySelector('button svg use[href*="#6eabdf"]')?.closest('button');
      if (!el) return;
      smartClick(el);
    }

    function runNewGptConversationShortcut() {
      window.clickGptHeaderThenSubItemSvg(SHORTCUT_ICON_TOKENS.newGptConversationMenuItem, {
        fallbackText: 'New chat',
      });
    }

    const DictationShortcut = (() => {
      let toggleInProgress = false;

      const SPRITE_IDS = {
        cancel: ['#85f94b'],
        dictate: ['#33d595', '#29f921'],
        send: ['#01bab7'],
        submitDictation: ['#fa1dbd'],
      };

      function getComposerRoot() {
        return (
          document.getElementById('thread-bottom-container') ||
          document.querySelector('form[data-type="unified-composer"]') ||
          document.getElementById('composer-background') ||
          document.body
        );
      }

      function findClickableBySpriteId(root, spriteIdOrIds) {
        for (const spriteId of getIconTokenList(spriteIdOrIds)) {
          const safe = escapeAttributeSelectorFragment(spriteId);
          const use = root.querySelector(`svg use[href*="${safe}"]`);
          if (!use) continue;
          const clickable =
            use.closest('button, [role="button"], a, [tabindex]') ||
            use.closest('svg')?.closest('button, [role="button"], a, [tabindex]') ||
            null;
          if (clickable) return clickable;
        }
        return null;
      }

      function findFirstClickable(root, ...selectors) {
        for (const selector of selectors) {
          if (!selector) continue;
          const el = root.querySelector(selector);
          if (el) return el;
        }
        return null;
      }

      function scrollAndFlashComposerControl(el) {
        if (!el) return false;
        try {
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
        } catch {}
        flashBorder(el);
        return true;
      }

      function clickComposerControl(el) {
        if (!scrollAndFlashComposerControl(el)) return false;
        smartClick(el);
        return true;
      }

      function runToggle() {
        if (toggleInProgress) return;
        toggleInProgress = true;
        setTimeout(() => {
          toggleInProgress = false;
        }, 300);

        const composerRoot = getComposerRoot();

        // While dictation is active, ChatGPT renders both cancel (X) and submit (checkmark).
        // The toggle shortcut should confirm/send first; explicit cancel stays on its own key.
        const submitDictationBtn = findClickableBySpriteId(
          composerRoot,
          SPRITE_IDS.submitDictation,
        );
        if (clickComposerControl(submitDictationBtn)) return;

        // Otherwise start dictation (avoid Voice Mode button).
        const dictateBtn = findClickableBySpriteId(composerRoot, SPRITE_IDS.dictate);
        if (clickComposerControl(dictateBtn)) return;

        // Fall back to submit only when the dedicated dictate/stop controls are unavailable.
        const submitBtn =
          findFirstClickable(
            composerRoot,
            '#composer-submit-button',
            'button[data-testid="send-button"]',
          ) ||
          findClickableBySpriteId(composerRoot, SPRITE_IDS.send) ||
          findClickableBySpriteId(composerRoot, SPRITE_IDS.submitDictation);
        clickComposerControl(submitBtn);
      }

      async function runCancel() {
        const composerRoot = getComposerRoot();
        const btn =
          findClickableBySpriteId(composerRoot, SPRITE_IDS.cancel);

        // Only stop if the active dictation cancel control is currently available; otherwise no-op.
        if (!btn) return;

        scrollAndFlashComposerControl(btn);
        await sleep(DELAYS.beforeFinalClick);
        smartClick(btn);
      }

      return {
        runCancel,
        runToggle,
      };
    })();

    // @note Alt shortcut action registry
    const altShortcutActions = {
      shortcutKeyScrollUpOneMessage: () => {
        const upButton = document.getElementById('upButton');
        if (upButton) {
          upButton.click();
          // feedbackAnimation is already called inside the click handler, so this is redundant.
        } else {
          goUpOneMessage(); // Call the scroll function directly, no feedback since no button.
        }
      },
      shortcutKeyScrollDownOneMessage: () => {
        const downButton = document.getElementById('downButton');
        if (downButton) {
          downButton.click(); // feedback is triggered in the click handler
        } else {
          goDownOneMessage(); // function is available even when button is hidden
        }
      },
      shortcutKeyScrollUpTwoMessages: () => {
        const upButton = document.getElementById('upButton');
        goUpTwoMessages(upButton || null);
      },
      shortcutKeyScrollDownTwoMessages: () => {
        const downButton = document.getElementById('downButton');
        goDownTwoMessages(downButton || null);
      },
      shortcutKeyCopyAllCodeBlocks: copyCode,
      shortcutKeyToggleCodeboxWrap: () => {
        window.toggleCodeboxWrap?.();
      },
      shortcutKeyCopyLowest: () => {
        const copyPath = ['M12.668 10.667C12.668', '#ce3544'];
        copyFromLowestButton(copyPath, {
          delayBeforeClick: 350,
          delayClipboardRead: 350,
        });
      },
      shortcutKeyEdit: runEditMessageShortcut,
      shortcutKeySendEdit: runSendEditShortcut,
      shortcutKeyNewConversation: function newConversation() {
        triggerNativeNewConversationButton();
      },
      shortcutKeySearchConversationHistory: () => {
        triggerNativeSearchConversationButton();
      },
      shortcutKeyClickNativeScrollToBottom: () => {
        // native scroll to bottom
        const el = getScrollableContainer();
        if (!el) return;

        animateBoundaryScrollTo(el, 'bottom');
      },
      shortcutKeyScrollToTop: () => {
        // native scroll to top
        const el = getScrollableContainer();
        if (!el) return;

        animateBoundaryScrollTo(el, 'top');
      },
      // @note Toggle Sidebar Function
      shortcutKeyToggleSidebar: function toggleSidebar() {
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
      shortcutKeyActivateInput: function activateInput() {
        triggerDirectComposerActivation();
      },
      shortcutKeySearchWeb: () => runIconToolbarShortcut('searchWeb'),
      shortcutKeyPreviousThread: (opts = {}) => {
        runThreadNavigationShortcut(opts, {
          ariaLabel: 'Previous response',
          direction: 'previous',
          iconTokens: ['M11.5292 3.7793', '#8ee2e9'],
          postClickDelay: 175,
        });
      },
      shortcutKeyNextThread: (opts = {}) => {
        runThreadNavigationShortcut(opts, {
          ariaLabel: 'Next response',
          direction: 'next',
          iconTokens: ['M7.52925 3.7793', '#b140e7'],
          postClickDelay: 200,
        });
      },
      selectThenCopy: runSelectThenCopyShortcut,
      shortcutKeyToggleModelSelector: () => {
        window.toggleModelSelector();
      },
      shortcutKeyRegenerateTryAgain: runRegenerateTryAgainShortcut,
      shortcutKeyRegenerateWithDifferentModel: runRegenerateWithDifferentModelShortcut,
      shortcutKeyRegenerateAskToChangeResponse: runRegenerateAskToChangeResponseShortcut,
      shortcutKeyMoreDotsReadAloud: runReadAloudShortcut,
      shortcutKeyMoreDotsBranchInNewChat: runBranchInNewChatShortcut,
      shortcutKeyThinkingExtended: () => runLegacyThinkingEffortShortcut('thinking-extended'),
      shortcutKeyThinkingStandard: () => runLegacyThinkingEffortShortcut('thinking-standard'),
      shortcutKeyThinkingLight: () => runLegacyThinkingEffortShortcut('thinking-light'),
      shortcutKeyThinkingHeavy: () => runLegacyThinkingEffortShortcut('thinking-heavy'),
      shortcutKeyProStandard: () => runProThinkingEffortShortcut('thinking-standard'),
      shortcutKeyProExtended: () => runProThinkingEffortShortcut('thinking-extended'),
      shortcutKeyTemporaryChat: runTemporaryChatShortcut,
      shortcutKeyStudy: async () => {
        // Removed from ChatGPT; keep the legacy storage key inert for existing installs.
      },
      shortcutKeyCreateImage: () => runIconToolbarShortcut('createImage'),
      shortcutKeyToggleCanvas: async () => {
        // Removed from ChatGPT; keep the legacy storage key inert for existing installs.
      },
      shortcutKeyDeepResearch: () => runIconToolbarShortcut('deepResearch'),
      shortcutKeyAddPhotosFiles: () => runIconToolbarShortcut('addPhotosFiles'),
      shortcutKeyToggleDictate: DictationShortcut.runToggle,
      shortcutKeyCancelDictation: DictationShortcut.runCancel,
      shortcutKeyShare: async () => {
        await clickButtonByTestId('share-chat-button');
      },
      shortcutKeyThinkLonger: async () => {
        // Removed from ChatGPT; keep the legacy storage key inert for existing installs.
      },
      shortcutKeyNewGptConversation: runNewGptConversationShortcut,
      selectThenCopyAllMessages: runSelectThenCopyAllMessagesShortcut,
    }; // Close altShortcutActions registry

    // Runtime bridge: popup/debug hooks invoke these core shortcut actions directly.
    window.toggleSidebar = altShortcutActions.shortcutKeyToggleSidebar;
    window.newConversation = altShortcutActions.shortcutKeyNewConversation;
    window.globalScrollToBottom = altShortcutActions.shortcutKeyClickNativeScrollToBottom;

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

    function recordShortcutUsage(_actionId) {}

    function flushUsageAnalytics(_reason) {}

    const THINKING_EFFORT_DYNAMIC_SHORTCUTS = [
      {
        storageKey: 'shortcutKeyThinkingExtended',
        optionId: 'thinking-extended',
        fallback: () => runLegacyThinkingEffortShortcut('thinking-extended'),
      },
      {
        storageKey: 'shortcutKeyThinkingStandard',
        optionId: 'thinking-standard',
        fallback: () => runLegacyThinkingEffortShortcut('thinking-standard'),
      },
      {
        storageKey: 'shortcutKeyThinkingLight',
        optionId: 'thinking-light',
        fallback: () => runLegacyThinkingEffortShortcut('thinking-light'),
      },
      {
        storageKey: 'shortcutKeyThinkingHeavy',
        optionId: 'thinking-heavy',
        fallback: () => runLegacyThinkingEffortShortcut('thinking-heavy'),
      },
    ];
    const PRO_THINKING_EFFORT_DYNAMIC_SHORTCUTS = [
      {
        storageKey: 'shortcutKeyProStandard',
        optionId: 'thinking-standard',
      },
      {
        storageKey: 'shortcutKeyProExtended',
        optionId: 'thinking-extended',
      },
    ];

    const getEffectiveShortcutSetting = (storageKey) => {
      const effective = window.CSP_SHORTCUTS_EFFECTIVE || {};
      if (hasUsableShortcutSetting(effective[storageKey])) return effective[storageKey];
      if (hasUsableShortcutSetting(shortcuts[storageKey])) return shortcuts[storageKey];
      return shortcutDefaults[storageKey] || '';
    };

    const getModelPickerAssignedIndexForDigit = (digit) => {
      const utils = window.ShortcutUtils || {};
      const getModelCodes =
        typeof utils.getModelPickerCodesCache === 'function' ? utils.getModelPickerCodesCache : null;
      const codeEquals = typeof utils.codeEquals === 'function' ? utils.codeEquals : null;
      const modelCodes = getModelCodes ? getModelCodes() : [];
      if (!Array.isArray(modelCodes) || !codeEquals) return -1;
      return modelCodes.findIndex((code) => codeEquals(code, `Digit${digit}`));
    };

    const ALT_SHORTCUT_ACTION_KEYS = Object.keys(altShortcutActions);
    const isModelToggleShortcutEvent = (event) =>
      matchesShortcutKey(getEffectiveShortcutSetting('shortcutKeyToggleModelSelector'), event);

    const findMatchedAltShortcutActionKey = (event) => {
      // Later registry entries intentionally win duplicate assignments, matching the
      // previous computed-key object behavior after property overwrites.
      for (let i = ALT_SHORTCUT_ACTION_KEYS.length - 1; i >= 0; i -= 1) {
        const storageKey = ALT_SHORTCUT_ACTION_KEYS[i];
        if (matchesShortcutKey(getEffectiveShortcutSetting(storageKey), event)) return storageKey;
      }
      return '';
    };

    const runAltShortcutAction = (storageKey, event, options = {}) => {
      const action = altShortcutActions[storageKey];
      if (typeof action !== 'function') return false;
      event.preventDefault();
      recordShortcutUsage(storageKey);
      action({ previewOnly: false, event, ...options });
      return true;
    };

    const runPreviewThreadShortcut = (storageKey, event) => {
      if (!matchesShortcutKey(getEffectiveShortcutSetting(storageKey), event)) return false;
      return runAltShortcutAction(storageKey, event, { previewOnly: true });
    };

    const runModelPickerDigitShortcut = (event, keyIdentifier) => {
      if (!/^\d$/.test(keyIdentifier)) return false;

      const modelAssignedIndex = getModelPickerAssignedIndexForDigit(keyIdentifier);
      if (modelAssignedIndex === -1 || window.useAltForModelSwitcherRadio !== true) return false;

      event.preventDefault();
      recordShortcutUsage(`modelPickerSlot:${modelAssignedIndex + 1}`);

      if (typeof window.switchModelByIndex === 'function') {
        window.switchModelByIndex(modelAssignedIndex);
        return true;
      }

      document.dispatchEvent(
        new CustomEvent('modelPickerNumber', {
          detail: { index: modelAssignedIndex, event },
        }),
      );
      return true;
    };

    const runMatchedAltShortcut = (event) => {
      const matchedStorageKey = findMatchedAltShortcutActionKey(event);
      if (!matchedStorageKey) return false;
      return runAltShortcutAction(matchedStorageKey, event);
    };

    flushUsageAnalytics('content-start');

    const runDynamicThinkingEffortShortcut = (event) => {
      const matched = THINKING_EFFORT_DYNAMIC_SHORTCUTS.find(({ storageKey }) =>
        matchesShortcutKey(getEffectiveShortcutSetting(storageKey), event),
      );
      if (!matched) return false;
      event.preventDefault();
      recordShortcutUsage(matched.storageKey);
      if (window.__cspRunThinkingEffortAction?.(matched.optionId)) return true;
      matched.fallback();
      return true;
    };
    const runDynamicProThinkingEffortShortcut = (event) => {
      const matched = PRO_THINKING_EFFORT_DYNAMIC_SHORTCUTS.find(({ storageKey }) =>
        matchesShortcutKey(getEffectiveShortcutSetting(storageKey), event),
      );
      if (!matched) return false;
      event.preventDefault();
      recordShortcutUsage(matched.storageKey);
      window.__cspRunProThinkingEffortAction?.(matched.optionId);
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

    const shouldIgnoreShortcutEvent = (event) =>
      event.isComposing || // IME active (Hindi, Japanese)
      event.keyCode === 229 || // Generic composition keyCode
      ['Control', 'Meta', 'Alt', 'AltGraph'].includes(event.key) || // Modifier keys
      event.getModifierState?.('AltGraph') || // AltGr pressed (ES, EU)
      ['Henkan', 'Muhenkan', 'KanaMode'].includes(event.key); // JIS IME-specific keys

    const getShortcutKeyIdentifier = (event) =>
      // Canonical key: use layout-aware key for text, keep exact for special keys.
      event.key.length === 1 ? event.key.toLowerCase() : event.key;

    const handleAltShortcutEvent = (event, keyIdentifier, isCtrlPressed) => {
      if (!isCtrlPressed && isModelToggleShortcutEvent(event)) {
        return runAltShortcutAction('shortcutKeyToggleModelSelector', event);
      }

      if (runModelPickerDigitShortcut(event, keyIdentifier)) return true;

      if (
        isCtrlPressed &&
        runPreviewThreadShortcut('shortcutKeyPreviousThread', event)
      ) {
        return true;
      }

      if (isCtrlPressed && runPreviewThreadShortcut('shortcutKeyNextThread', event)) {
        return true;
      }

      if (runDynamicThinkingEffortShortcut(event)) return true;
      if (runDynamicProThinkingEffortShortcut(event)) return true;

      return runMatchedAltShortcut(event);
    };

    const handleCtrlShortcutEvent = (event, keyIdentifier) => {
      if (
        window.useControlForModelSwitcherRadio === true &&
        isModelToggleShortcutEvent(event)
      ) {
        return runAltShortcutAction('shortcutKeyToggleModelSelector', event);
      }

      const ctrlShortcut =
        keyFunctionMappingCtrl[keyIdentifier] || keyFunctionMappingCtrl[event.code];
      if (!ctrlShortcut) return false;

      const enabled = isCtrlShortcutEnabled(keyIdentifier) || isCtrlShortcutEnabled(event.code);
      if (!enabled) return false;

      const isBackspace = keyIdentifier === 'Backspace' || event.code === 'Backspace';
      if (isBackspace) {
        // Only intercept if a visible Stop button exists; otherwise let native deletion happen.
        const stopBtn = getVisibleStopButton();
        if (!stopBtn) return false;

        event.preventDefault();
        try {
          recordShortcutUsage('shortcutKeyClickStopButton');
          ctrlShortcut();
        } catch (e) {
          console.error('Backspace handler failed:', e);
        }
        return true;
      }

      event.preventDefault();
      recordShortcutUsage('shortcutKeyClickSendButton');
      ctrlShortcut();
      return true;
    };

    document.addEventListener(
      'keydown',
      (event) => {
        if (shouldIgnoreShortcutEvent(event)) return;

        const isCtrlPressed = isMac ? event.metaKey : event.ctrlKey;
        const isAltPressed = event.altKey;
        const keyIdentifier = getShortcutKeyIdentifier(event);

        if (isAltPressed && handleAltShortcutEvent(event, keyIdentifier, isCtrlPressed)) return;
        if (isCtrlPressed && !isAltPressed) handleCtrlShortcutEvent(event, keyIdentifier);
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
// @note always hide the disclaimer footer
// ==================================================
(() => {
  const STYLE_ID = 'csp-hide-disclaimer-style';
  const STYLE_TEXT = `
div[data-id="hide-this-warning"],
div[class*="view-transition-name:var(--vt-disclaimer)"] {
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
}
`;

  let styleEl = document.getElementById(STYLE_ID);
  if (!(styleEl instanceof HTMLStyleElement)) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = STYLE_TEXT;
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

  // Runtime bridge: bottom-bar relocation reuses the live disclaimer finder.
  window.__cspFindLiveDisclaimerNode = (root) => findLiveDisclaimerNode(root);

  const isDisclaimerCandidate = (node) => getDisclaimerContainer(node) instanceof Element;

  const markDisclaimerNode = (node) => {
    const container = getDisclaimerContainer(node);
    if (!(container instanceof Element)) return;

    const txt = container.textContent.trim().replace(/\s+/g, ' ');
    if (containsImportantRoot(txt)) {
      container.setAttribute('data-id', 'hide-this-warning');
      if (container instanceof HTMLElement) {
        container.style.removeProperty('display');
      }
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

  // Runtime bridge: route/layout features can force-install or refresh disclaimer hiding.
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
  const modelPickerSelectors = window.CSPModelPickerSelectors || {};

  const SELECTORS = {
    PAGE_HEADER: '#page-header',
    CONVERSATION_HEADER_ACTIONS: '#conversation-header-actions',
    THREAD_BOTTOM_CONTAINER: '#thread-bottom-container',
    THREAD_BOTTOM: '#thread-bottom',
    COMPOSER_FORM: "form[data-type='unified-composer']",
    COMPOSER_SURFACE: '[data-composer-surface="true"]',
    MODEL_SWITCHER_BUTTON:
      modelPickerSelectors.MODEL_MENU_BUTTON_SELECTOR ||
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

  const EXCLUDED_ROUTE_RULES = [
    { hostname: 'chatgpt.com', pathPrefix: '/gpts' },
    { hostname: 'chatgpt.com', pathPrefix: '/codex' },
    { hostname: 'chatgpt.com', pathPrefix: '/g/' },
    { hostname: 'sora.chatgpt.com' },
    { hostname: 'chatgpt.com', pathPrefix: '/library/' },
  ];

  const STATIC_BUTTON_IDS = {
    sidebar: 'static-sidebar-btn',
    newChat: 'static-newchat-btn',
  };
  const STATIC_BUTTON_KEEP_IDS = new Set(Object.values(STATIC_BUTTON_IDS));
  const STATIC_BUTTON_CLASS =
    'text-token-text-secondary focus-visible:bg-token-surface-hover ' +
    'enabled:hover:bg-token-surface-hover disabled:text-token-text-quaternary ' +
    'h-10 rounded-lg px-2 focus-visible:outline-0';
  const STATIC_BUTTON_STYLE = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '36px',
    padding: '8px',
  };

  const ROOT_STYLE = {
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
    zIndex: '',
    pointerEvents: '',
  };

  const SHELL_SLOT_STYLES = {
    lane: {
      width: '100%',
      boxSizing: 'border-box',
      paddingLeft: '0px',
      paddingRight: '0px',
    },
    row: {
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
    },
    left: {
      display: 'flex',
      alignItems: 'center',
      gap: '2px',
      minWidth: '0',
      flex: '0 1 auto',
    },
    center: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      minWidth: '0',
      flex: '1 1 auto',
    },
    right: {
      display: 'flex',
      alignItems: 'center',
      gap: '2px',
      minWidth: '0',
      marginLeft: 'auto',
      flex: '0 1 auto',
    },
  };

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
    return EXCLUDED_ROUTE_RULES.some(
      (rule) =>
        hostname === rule.hostname && (!rule.pathPrefix || pathname.startsWith(rule.pathPrefix)),
    );
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

  function getBottomBarCss() {
    return `
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
        margin-bottom: -35px !important;
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
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
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
  }

  function injectBottomBarStyles() {
    let style = document.getElementById(STYLE_ID);
    if (!(style instanceof HTMLStyleElement)) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = getBottomBarCss();
  }

  function findHeaderModelButton() {
    const pageHeader = document.querySelector(SELECTORS.PAGE_HEADER);

    if (pageHeader instanceof Element) {
      const fromHeader = Array.from(
        pageHeader.querySelectorAll(SELECTORS.MODEL_SWITCHER_BUTTON),
      ).find((el) => !el.closest('#bottomBarContainer'));
      if (fromHeader) return fromHeader;
    }

    return null;
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

      Object.assign(root.style, ROOT_STYLE, {
        visibility: state.revealed ? '' : 'hidden',
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

      state.lane = ensureSlot('bottomBarLane', SHELL_SLOT_STYLES.lane);
      state.row = ensureSlot('bottomBarRow', SHELL_SLOT_STYLES.row);
      state.left = ensureSlot('bottomBarLeft', SHELL_SLOT_STYLES.left);
      state.center = ensureSlot('bottomBarCenter', SHELL_SLOT_STYLES.center);
      state.right = ensureSlot('bottomBarRight', SHELL_SLOT_STYLES.right);

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

      window.__cspInjectOrToggleArrowButtons?.(root);

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

      Array.from(left.children).forEach((child) => {
        if (child === node) return;
        if (STATIC_BUTTON_KEEP_IDS.has(child.dataset.id)) return;
        child.remove();
      });

      if (!(node instanceof Element)) return null;

      node.style.marginLeft = 'calc(36px - 1em)';

      const newChatButton = left.querySelector(`button[data-id="${STATIC_BUTTON_IDS.newChat}"]`);
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
      return state.revealed;
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
      window.__cspEnsureDisclaimerHider?.();

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
      window.__cspEnsureDisclaimerHider?.();
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

      if (!state.left.querySelector(`button[data-id="${STATIC_BUTTON_IDS.sidebar}"]`)) {
        return 'static_sidebar_missing';
      }

      if (!state.left.querySelector(`button[data-id="${STATIC_BUTTON_IDS.newChat}"]`)) {
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
    const btnSidebar = ensureStaticButton(leftContainer, {
      id: STATIC_BUTTON_IDS.sidebar,
      label: 'Static Toggle Sidebar',
      svg: '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M8.85720 3H15.1428C16.2266 2.99999 17.1007 2.99998 17.8086 3.05782C18.5375 3.11737 19.1777 3.24318 19.77 3.54497C20.7108 4.02433 21.4757 4.78924 21.955 5.73005C22.2568 6.32234 22.3826 6.96253 22.4422 7.69138C22.5 8.39925 22.5 9.27339 22.5 10.3572V13.6428C22.5 14.7266 22.5 15.6008 22.4422 16.3086C22.3826 17.0375 22.2568 17.6777 21.955 18.27C21.4757 19.2108 20.7108 19.9757 19.77 20.455C19.1777 20.7568 18.5375 20.8826 17.8086 20.9422C17.1008 21 16.2266 21 15.1428 21H8.85717C7.77339 21 6.89925 21 6.19138 20.9422C5.46253 20.8826 4.82234 20.7568 4.23005 20.455C3.28924 19.9757 2.52433 19.2108 2.04497 18.27C1.74318 17.6777 1.61737 17.0375 1.55782 16.3086C1.49998 15.6007 1.49999 14.7266 1.5 13.6428V10.3572C1.49999 9.27341 1.49998 8.39926 1.55782 7.69138C1.61737 6.96253 1.74318 6.32234 2.04497 5.73005C2.52433 4.78924 3.28924 4.02433 4.23005 3.54497C4.82234 3.24318 5.46253 3.11737 6.19138 3.05782C6.89926 2.99998 7.77341 2.99999 8.85719 3ZM6.35424 5.05118C5.74907 5.10062 5.40138 5.19279 5.13803 5.32698C4.57354 5.6146 4.1146 6.07354 3.82698 6.63803C3.69279 6.90138 3.60062 7.24907 3.55118 7.85424C3.50078 8.47108 3.5 9.26339 3.5 10.4V13.6C3.5 14.7366 3.50078 15.5289 3.55118 16.1458C3.60062 16.7509 3.69279 17.0986 3.82698 17.362C4.1146 17.9265 4.57354 18.3854 5.13803 18.673C5.40138 18.8072 5.74907 18.8994 6.35424 18.9488C6.97108 18.9992 7.76339 19 8.9 19H9.5V5H8.9C7.76339 5 6.97108 5.00078 6.35424 5.05118ZM11.5 5V19H15.1C16.2366 19 17.0289 18.9992 17.6458 18.9488C18.2509 18.8994 18.5986 18.8072 18.862 18.673C19.4265 18.3854 19.8854 17.9265 20.173 17.362C20.3072 17.0986 20.3994 16.7509 20.4488 16.1458C20.4992 15.5289 20.5 14.7366 20.5 13.6V10.4C20.5 9.26339 20.4992 8.47108 20.4488 7.85424C20.3994 7.24907 20.3072 6.90138 20.173 6.63803C19.8854 6.07354 19.4265 5.6146 18.862 5.32698C18.5986 5.19279 18.2509 5.10062 17.6458 5.05118C17.0289 5.00078 16.2366 5 15.1 5H11.5ZM5 8.5C5 7.94772 5.44772 7.5 6 7.5H7C7.55229 7.5 8 7.94772 8 8.5C8 9.05229 7.55229 9.5 7 9.5H6C5.44772 9.5 5 9.05229 5 8.5ZM5 12C5 11.4477 5.44772 11 6 11H7C7.55229 11 8 11.4477 8 12C8 12.5523 7.55229 13 7 13H6C5.44772 13 5 12.5523 5 12Z"/></svg>',
      activate: () => window.triggerNativeSidebarToggleButton?.(),
    });
    const btnNewChat = ensureStaticButton(leftContainer, {
      id: STATIC_BUTTON_IDS.newChat,
      label: 'Static New Chat',
      svg: '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M15.6730 3.91287C16.8918 2.69392 18.8682 2.69392 20.0871 3.91287C21.3061 5.13182 21.3061 7.10813 20.0871 8.32708L14.1499 14.2643C13.3849 15.0293 12.3925 15.5255 11.3215 15.6785L9.14142 15.9899C8.82983 16.0344 8.51546 15.9297 8.29289 15.7071C8.07033 15.4845 7.96554 15.1701 8.01005 14.8586L8.32149 12.6785C8.47449 11.6075 8.97072 10.615 9.7357 9.85006L15.6729 3.91287ZM18.6729 5.32708C18.235 4.88918 17.525 4.88918 17.0871 5.32708L11.1499 11.2643C10.6909 11.7233 10.3932 12.3187 10.3014 12.9613L10.1785 13.8215L11.0386 13.6986C11.6812 13.6068 12.2767 13.3091 12.7357 12.8501L18.6729 6.91287C19.1108 6.47497 19.1108 5.76499 18.6729 5.32708ZM11 3.99929C11.0004 4.55157 10.5531 4.99963 10.0008 5.00007C9.00227 5.00084 8.29769 5.00827 7.74651 5.06064C7.20685 5.11191 6.88488 5.20117 6.63803 5.32695C6.07354 5.61457 5.6146 6.07351 5.32698 6.63799C5.19279 6.90135 5.10062 7.24904 5.05118 7.8542C5.00078 8.47105 5 9.26336 5 10.4V13.6C5 14.7366 5.00078 15.5289 5.05118 16.1457C5.10062 16.7509 5.19279 17.0986 5.32698 17.3619C5.6146 17.9264 6.07354 18.3854 6.63803 18.673C6.90138 18.8072 7.24907 18.8993 7.85424 18.9488C8.47108 18.9992 9.26339 19 10.4 19H13.6C14.7366 19 15.5289 18.9992 16.1458 18.9488C16.7509 18.8993 17.0986 18.8072 17.362 18.673C17.9265 18.3854 18.3854 17.9264 18.673 17.3619C18.7988 17.1151 18.8881 16.7931 18.9393 16.2535C18.9917 15.7023 18.9991 14.9977 18.9999 13.9992C19.0003 13.4469 19.4484 12.9995 20.0007 13C20.553 13.0004 21.0003 13.4485 20.9999 14.0007C20.9991 14.9789 20.9932 15.7808 20.9304 16.4426C20.8664 17.116 20.7385 17.7136 20.455 18.2699C19.9757 19.2107 19.2108 19.9756 18.27 20.455C17.6777 20.7568 17.0375 20.8826 16.3086 20.9421C15.6008 21 14.7266 21 13.6428 21H10.3572C9.27339 21 8.39925 21 7.69138 20.9421C6.96253 20.8826 6.32234 20.7568 5.73005 20.455C4.78924 19.9756 4.02433 19.2107 3.54497 18.2699C3.24318 17.6776 3.11737 17.0374 3.05782 16.3086C2.99998 15.6007 2.99999 14.7266 3 13.6428V10.3572C2.99999 9.27337 2.99998 8.39922 3.05782 7.69134C3.11737 6.96249 3.24318 6.3223 3.54497 5.73001C4.02433 4.7892 4.78924 4.0243 5.73005 3.54493C6.28633 3.26149 6.88399 3.13358 7.55735 3.06961C8.21919 3.00673 9.02103 3.00083 9.99922 3.00007C10.5515 2.99964 10.9996 3.447 11 3.99929Z"/></svg>',
      activate: () => window.triggerNativeNewConversationButton?.(),
    });
    mountStaticButtons(leftContainer, btnSidebar, btnNewChat);
  }

  function ensureStaticButton(container, config) {
    return (
      container.querySelector(`button[data-id="${config.id}"]`) ||
      createStaticButton(config)
    );
  }

  function mountStaticButtons(leftContainer, btnSidebar, btnNewChat) {
    if (btnSidebar.parentElement !== leftContainer || leftContainer.firstElementChild !== btnSidebar) {
      leftContainer.insertBefore(btnSidebar, leftContainer.firstChild);
    }
    if (btnNewChat.parentElement !== leftContainer || btnSidebar.nextElementSibling !== btnNewChat) {
      leftContainer.insertBefore(btnNewChat, btnSidebar.nextSibling);
    }
  }

  function createStaticButton({ id, label, svg, activate }) {
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('data-id', id);

    btn.innerHTML = svg;
    btn.className = STATIC_BUTTON_CLASS;

    Object.assign(btn.style, STATIC_BUTTON_STYLE);

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
  const ModelLabels = window.ModelLabels || {};
  const MAX_SLOTS = ModelLabels.MAX_SLOTS || 15;
  const ModelPickerSelectors = window.CSPModelPickerSelectors || {};
  const LEGACY_MODEL_MENU_BTN_SELECTOR =
    ModelPickerSelectors.LEGACY_MODEL_MENU_BUTTON_SELECTOR ||
    'button[data-testid="model-switcher-dropdown-button"]';
  const COMPOSER_MODEL_MENU_BTN_SELECTOR =
    ModelPickerSelectors.COMPOSER_MODEL_MENU_BUTTON_SELECTOR ||
    '[data-composer-surface="true"] button.__composer-pill[aria-haspopup="menu"][id^="radix-"]';
  const MENU_BTN_SELECTOR =
    ModelPickerSelectors.MODEL_MENU_BUTTON_SELECTOR ||
    [LEGACY_MODEL_MENU_BTN_SELECTOR, COMPOSER_MODEL_MENU_BTN_SELECTOR].join(', ');
  const MODEL_MENU_SELECTOR =
    ModelPickerSelectors.MODEL_MENU_SELECTOR ||
    '[data-radix-menu-content][data-state="open"][role="menu"]';
  const MODEL_CONFIGURE_MENU_ITEM_SELECTOR =
    ModelPickerSelectors.MODEL_CONFIGURE_MENU_ITEM_SELECTOR ||
    '[data-testid="model-configure-modal"]';
  const MODEL_CONFIGURE_DIALOG_SELECTOR =
    ModelPickerSelectors.MODEL_CONFIGURE_DIALOG_SELECTOR || '[role="dialog"]';
  const MODEL_SELECTION_LABEL_ID =
    ModelPickerSelectors.MODEL_SELECTION_LABEL_ID || 'model-selection-label';
  const THINKING_EFFORT_SELECTION_LABEL_ID =
    ModelPickerSelectors.THINKING_EFFORT_SELECTION_LABEL_ID ||
    'thinking-effort-selection-label';
  const COMPOSER_INTELLIGENCE_MENU_CONTENT_SELECTOR =
    ModelPickerSelectors.COMPOSER_INTELLIGENCE_MENU_CONTENT_SELECTOR ||
    '[data-testid="composer-intelligence-picker-content"]';
  const MODEL_SUBMENU_TRIGGER_SELECTOR =
    ModelPickerSelectors.MODEL_SUBMENU_TRIGGER_SELECTOR ||
    '[role="menuitem"][aria-haspopup="menu"], [role="menuitem"][data-has-submenu]';
  const MODEL_THINKING_EFFORT_ROW_SELECTOR =
    ModelPickerSelectors.MODEL_THINKING_EFFORT_ROW_SELECTOR ||
    '[data-model-picker-thinking-effort-row="true"]';
  const MODEL_THINKING_EFFORT_MENU_ITEM_SELECTOR =
    ModelPickerSelectors.MODEL_THINKING_EFFORT_MENU_ITEM_SELECTOR ||
    '[data-model-picker-thinking-effort-menu-item="true"]';
  const MODEL_THINKING_EFFORT_ACTION_SELECTOR =
    ModelPickerSelectors.MODEL_THINKING_EFFORT_ACTION_SELECTOR ||
    '[data-model-picker-thinking-effort-action="true"][aria-haspopup="menu"]';
  const MODEL_THINKING_EFFORT_OPTION_SELECTOR =
    ModelPickerSelectors.MODEL_THINKING_EFFORT_OPTION_SELECTOR || '[role="menuitemradio"]';
  const MODEL_MENU_ITEM_SELECTOR =
    ':scope > :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"])[data-radix-collection-item], ' +
    ':scope > :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"]), ' +
    ':scope > * > :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"])[data-radix-collection-item], ' +
    ':scope > * > :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"]), ' +
    ':scope > * > * > :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"])[data-radix-collection-item], ' +
    ':scope > * > * > :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="radio"])';
  const THINKING_EFFORT_OPTION_IDS = [
    'thinking-standard',
    'thinking-extended',
    'thinking-light',
    'thinking-heavy',
  ];
  const getModelActionSlots = () =>
    typeof window.ModelLabels?.getActionSlots === 'function'
      ? window.ModelLabels.getActionSlots()
      : [];
  const isUsablyVisibleModelElement = (el) => {
    if (typeof ModelPickerSelectors.isUsablyVisibleElement === 'function') {
      return ModelPickerSelectors.isUsablyVisibleElement(el, window);
    }
    if (!(el instanceof Element) || !el.isConnected) return false;
    try {
      const style = window.getComputedStyle?.(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    } catch { }
    return Array.from(el.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
  };
  const getModelMenuButton = () => {
    if (typeof ModelPickerSelectors.getModelMenuButton === 'function') {
      return ModelPickerSelectors.getModelMenuButton(document, window);
    }
    const candidates = Array.from(document.querySelectorAll(MENU_BTN_SELECTOR));
    if (!candidates.length) return null;
    const visible = candidates.filter(isUsablyVisibleModelElement);
    return (
      visible.find((el) => el.matches(LEGACY_MODEL_MENU_BTN_SELECTOR)) ||
      visible.find((el) => el.matches(COMPOSER_MODEL_MENU_BTN_SELECTOR)) ||
      visible[0] ||
      candidates[0] ||
      null
    );
  };
  const getVisibleModelMenuButton = () => {
    const button = getModelMenuButton();
    return isUsablyVisibleModelElement(button) ? button : null;
  };
  const getOpenModelMenuCandidates = (trigger = getModelMenuButton()) => {
    if (typeof ModelPickerSelectors.getOpenModelMenuCandidates === 'function') {
      return ModelPickerSelectors.getOpenModelMenuCandidates(document, window, trigger);
    }

    const triggerId = trigger?.id || '';
    return Array.from(document.querySelectorAll(MODEL_MENU_SELECTOR))
      .filter(isUsablyVisibleModelElement)
      .filter((menu) => {
        if (triggerId && menu.getAttribute('aria-labelledby') === triggerId) return true;
        if (menu.querySelector(COMPOSER_INTELLIGENCE_MENU_CONTENT_SELECTOR)) return true;
        if (menu.querySelector(MODEL_CONFIGURE_MENU_ITEM_SELECTOR)) return true;
        return !!menu.querySelector('[data-testid^="model-switcher-"]');
      });
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
    const catalogAction =
      typeof window.ModelLabels?.getCatalogActionById === 'function'
        ? window.ModelLabels.getCatalogActionById(id, window.__modelCatalog || null, window.MODEL_NAMES || [])
        : null;
    if (catalogAction) return catalogAction;
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
        'configure-dynamic-5-4',
        'configure-dynamic-5-3',
        'configure-5-2',
        'configure-5-0-thinking-mini',
        'configure-o3',
      ].includes(String(value || '').trim())
        ? String(value || '').trim()
        : DEFAULT_ACTIVE_MODEL_CONFIG_ID;
  let LAST_PERSISTED_ACTIVE_MODEL_CONFIG_ID = DEFAULT_ACTIVE_MODEL_CONFIG_ID;
  const getDefaultModelPickerCodes = () =>
    typeof window.ModelLabels?.defaultKeyCodes === 'function'
      ? window.ModelLabels.defaultKeyCodes()
      : (() => {
        const out = new Array(MAX_SLOTS).fill('');
        out[0] = 'Digit1';
        out[1] = 'Digit2';
        out[3] = 'Digit4';
        out[6] = 'Digit7';
        out[7] = 'Digit3';
        out[8] = 'Digit5';
        out[9] = 'Digit6';
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
  const MODEL_SWITCHER_PILL_NOT_FOUND_ERROR = 'MODEL_SWITCHER_PILL_NOT_FOUND';
  const createNoModelSwitcherResult = (reason = 'model-switcher-unavailable') => ({
    ok: false,
    error: MODEL_SWITCHER_PILL_NOT_FOUND_ERROR,
    noModelSwitcher: true,
    reason,
  });
  let SCRAPE_HIDE_UI_ACTIVE = false;
  const SCRAPE_HIDDEN_ELEMENTS = new Set();
  const PREPARED_SESSION_HIDDEN_ELEMENTS = new Set();
  let PREPARED_MODEL_CONFIG_SESSION = null;
  const ModelPickerScrapeSession = (() => {
    function hideLiveElement(el) {
      if (!SCRAPE_HIDE_UI_ACTIVE || !(el instanceof Element) || SCRAPE_HIDDEN_ELEMENTS.has(el)) {
        return;
      }
      SCRAPE_HIDDEN_ELEMENTS.add(el);
      if (!el.hasAttribute('data-csp-scrape-inline-visibility')) {
        el.setAttribute('data-csp-scrape-inline-visibility', el.style.visibility || '');
      }
      if (!el.hasAttribute('data-csp-scrape-inline-pointer-events')) {
        el.setAttribute('data-csp-scrape-inline-pointer-events', el.style.pointerEvents || '');
      }
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    }

    function restoreElements(elements, visibilityAttr, pointerEventsAttr) {
      elements.forEach((el) => {
        if (!(el instanceof Element)) return;
        const prevVisibility = el.getAttribute(visibilityAttr);
        const prevPointerEvents = el.getAttribute(pointerEventsAttr);
        if (prevVisibility != null) {
          if (prevVisibility) el.style.visibility = prevVisibility;
          else el.style.removeProperty('visibility');
          el.removeAttribute(visibilityAttr);
        }
        if (prevPointerEvents != null) {
          if (prevPointerEvents) el.style.pointerEvents = prevPointerEvents;
          else el.style.removeProperty('pointer-events');
          el.removeAttribute(pointerEventsAttr);
        }
      });
      elements.clear();
    }

    function clearLiveElements() {
      restoreElements(
        SCRAPE_HIDDEN_ELEMENTS,
        'data-csp-scrape-inline-visibility',
        'data-csp-scrape-inline-pointer-events',
      );
    }

    function hidePreparedElement(el) {
      if (!(el instanceof Element) || PREPARED_SESSION_HIDDEN_ELEMENTS.has(el)) return;
      PREPARED_SESSION_HIDDEN_ELEMENTS.add(el);
      if (!el.hasAttribute('data-csp-prepared-inline-visibility')) {
        el.setAttribute('data-csp-prepared-inline-visibility', el.style.visibility || '');
      }
      if (!el.hasAttribute('data-csp-prepared-inline-pointer-events')) {
        el.setAttribute('data-csp-prepared-inline-pointer-events', el.style.pointerEvents || '');
      }
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    }

    function clearPreparedElements() {
      restoreElements(
        PREPARED_SESSION_HIDDEN_ELEMENTS,
        'data-csp-prepared-inline-visibility',
        'data-csp-prepared-inline-pointer-events',
      );
    }

    async function withHiddenUi(enabled, task) {
      const previousHideState = SCRAPE_HIDE_UI_ACTIVE;
      if (enabled) SCRAPE_HIDE_UI_ACTIVE = true;
      try {
        return await task();
      } finally {
        SCRAPE_HIDE_UI_ACTIVE = previousHideState;
        if (!SCRAPE_HIDE_UI_ACTIVE) clearLiveElements();
      }
    }

    async function withCatalogUi(hideUi, task) {
      const previousHideState = SCRAPE_HIDE_UI_ACTIVE;
      SCRAPE_HIDE_UI_ACTIVE = !!hideUi;
      try {
        return await task();
      } finally {
        SCRAPE_HIDE_UI_ACTIVE = previousHideState;
        clearLiveElements();
      }
    }

    function getPrepared() {
      const session = PREPARED_MODEL_CONFIG_SESSION;
      const combobox = session?.combobox;
      const dialog = combobox?.closest?.(MODEL_CONFIGURE_DIALOG_SELECTOR);
      if (
        !(combobox instanceof Element) ||
        !combobox.isConnected ||
        !(dialog instanceof Element) ||
        !dialog.isConnected
      ) {
        PREPARED_MODEL_CONFIG_SESSION = null;
        clearPreparedElements();
        return null;
      }
      return session;
    }

    function setPrepared(combobox, activeConfigId) {
      if (!(combobox instanceof Element) || !combobox.isConnected) {
        PREPARED_MODEL_CONFIG_SESSION = null;
        return null;
      }
      const dialog = combobox.closest?.(MODEL_CONFIGURE_DIALOG_SELECTOR);
      if (dialog) hidePreparedElement(dialog);
      PREPARED_MODEL_CONFIG_SESSION = {
        combobox,
        activeConfigId: normalizeActiveModelConfigId(activeConfigId),
        preparedAt: Date.now(),
      };
      return PREPARED_MODEL_CONFIG_SESSION;
    }

    function clearPrepared() {
      PREPARED_MODEL_CONFIG_SESSION = null;
      clearPreparedElements();
    }

    async function releasePrepared() {
      const session = getPrepared();
      PREPARED_MODEL_CONFIG_SESSION = null;
      if (!session) {
        clearLiveElements();
        return false;
      }
      const previousHideState = SCRAPE_HIDE_UI_ACTIVE;
      SCRAPE_HIDE_UI_ACTIVE = true;
      try {
        const dialog = session.combobox.closest(MODEL_CONFIGURE_DIALOG_SELECTOR);
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
        clearPreparedElements();
        if (!SCRAPE_HIDE_UI_ACTIVE) clearLiveElements();
      }
    }

    return {
      clearLiveElements,
      clearPrepared,
      getPrepared,
      hideLiveElement,
      releasePrepared,
      setPrepared,
      withCatalogUi,
      withHiddenUi,
    };
  })();

  const hideLiveScrapeElement = ModelPickerScrapeSession.hideLiveElement;
  const clearHiddenLiveScrapeElements = ModelPickerScrapeSession.clearLiveElements;
  const withTemporarilyHiddenModelUi = ModelPickerScrapeSession.withHiddenUi;
  const getPreparedModelConfigSession = ModelPickerScrapeSession.getPrepared;
  const setPreparedModelConfigSession = ModelPickerScrapeSession.setPrepared;
  const clearPreparedModelConfigSession = ModelPickerScrapeSession.clearPrepared;
  const releasePreparedModelConfigSession = ModelPickerScrapeSession.releasePrepared;

  const normModelTid = (tid) =>
    typeof ModelLabels.normTid === 'function'
      ? ModelLabels.normTid(tid)
      : String(tid || '')
        .toLowerCase()
        .trim();

  const getOpenRadixMenus = () =>
    typeof getOpenMenus === 'function'
      ? getOpenMenus()
      : Array.from(document.querySelectorAll(MODEL_MENU_SELECTOR));

  const hasExpandedModelMenuTrigger = () =>
    getModelMenuButton()?.getAttribute('aria-expanded') === 'true';

  const hasOpenModelMenuCandidate = () => getOpenModelMenuCandidates().length > 0;

  const isModelMenuLikelyActive = () =>
    hasExpandedModelMenuTrigger() || hasOpenModelMenuCandidate();

  const getDirectModelMenuItems = (menuEl) =>
    menuEl instanceof Element ? Array.from(menuEl.querySelectorAll(MODEL_MENU_ITEM_SELECTOR)) : [];

  const isKnownModelMenuItem = (item) => {
    if (!(item instanceof Element)) return false;
    const tid = normModelTid(item.getAttribute('data-testid'));
    return !!tid && (tid.startsWith('model-switcher-') || item.matches(MODEL_CONFIGURE_MENU_ITEM_SELECTOR));
  };

  const isModelSubmenuTriggerItem = (item) => {
    if (!(item instanceof Element)) return false;
    if (item.matches(MODEL_THINKING_EFFORT_ACTION_SELECTOR)) return false;
    if (item.matches(MODEL_SUBMENU_TRIGGER_SELECTOR) || item.hasAttribute('data-has-submenu')) {
      return true;
    }
    if (
      typeof window.ModelLabels?.isSubmenuTrigger === 'function' &&
      window.ModelLabels.isSubmenuTrigger(item)
    ) {
      return true;
    }
    const tid = normModelTid(item.getAttribute('data-testid'));
    return !!tid && (tid.endsWith('-submenu') || tid.includes('legacy'));
  };
  const isLegacyModelSubmenuTriggerItem = (item) => {
    if (!(item instanceof Element)) return false;
    const tid = normModelTid(item.getAttribute('data-testid'));
    if (tid.includes('legacy')) return true;
    const text = (item.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return /^legacy\s+models?\b/.test(text);
  };
  const isCurrentModelSubmenuTriggerItem = (item) =>
    isModelSubmenuTriggerItem(item) && !isLegacyModelSubmenuTriggerItem(item);
  const isLikelyModelVersionLabel = (value) => {
    const text = String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!text) return false;
    if (['instant', 'medium', 'high', 'standard', 'extended', 'light', 'heavy'].includes(text)) {
      return false;
    }
    return /^(?:gpt[-\s]*)?\d+(?:\.\d+)?(?:\b|$)/i.test(text) || /^o\d+(?:\b|$)/i.test(text);
  };
  const isLikelyModelVersionMenuElement = (menuEl) =>
    menuEl instanceof Element &&
    getDirectModelMenuItems(menuEl).some((item) => isLikelyModelVersionLabel(item.textContent));

  const isPrimaryModelMenuElement = (menuEl) => {
    if (!(menuEl instanceof Element)) return false;

    const items = getDirectModelMenuItems(menuEl);
    if (!items.length) return false;

    if (menuEl.querySelector(COMPOSER_INTELLIGENCE_MENU_CONTENT_SELECTOR)) return true;

    const labelledby = menuEl.getAttribute('aria-labelledby') || '';
    const triggerId = getModelMenuButton()?.id || '';
    if (triggerId && labelledby === triggerId) return true;

    if (
      items.some((item) => item.matches(MODEL_CONFIGURE_MENU_ITEM_SELECTOR))
    ) {
      return true;
    }

    if (items.some(isKnownModelMenuItem)) return true;

    return false;
  };

  const isNestedModelMenuElement = (menuEl) => {
    if (!(menuEl instanceof Element)) return false;
    const directItems = getDirectModelMenuItems(menuEl);
    if (!directItems.length) return false;

    const labelledby = menuEl.getAttribute('aria-labelledby') || '';
    const triggerEl = labelledby ? document.getElementById(labelledby) : null;
    const parentMenu = triggerEl?.closest('[data-radix-menu-content]');
    if (
      parentMenu &&
      isPrimaryModelMenuElement(parentMenu) &&
      isCurrentModelSubmenuTriggerItem(triggerEl)
    ) {
      return true;
    }

    if (
      getOpenRadixMenus().some((menu) => menu !== menuEl && isPrimaryModelMenuElement(menu)) &&
      isLikelyModelVersionMenuElement(menuEl)
    ) {
      return true;
    }

    return directItems.some(isKnownModelMenuItem) && !!(parentMenu && isPrimaryModelMenuElement(parentMenu));
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
    const current = candidates.find(isCurrentModelSubmenuTriggerItem);
    if (current) return current;

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
        m === 0
          ? directItems.filter((item) => !isLegacyModelSubmenuTriggerItem(item))
          : directItems;
      filtered.forEach((el, idx) => {
        if (items.length < MAX_SLOTS) {
          items.push({ el, menu: m === 0 ? 'main' : 'submenu', idx });
        }
      });
    }

    return {
      menus: orderedMenus,
      main,
      submenu: orderedMenus.find((menu) => menu !== main) || null,
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

      const ModelPickerHints = (() => {
        const STYLE_ID = '__altHintStyle';
        const HINT_CLASS = 'alt-hint';
        let scheduleToken = 0;
        let observedOpenSurfaceCount = 0;

        function ensureStyle() {
          if (document.getElementById(STYLE_ID)) return;
          const style = document.createElement('style');
          style.id = STYLE_ID;
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
                .${HINT_CLASS} {
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
        }

        function removeAllLabels() {
          document.querySelectorAll(`.${HINT_CLASS}`).forEach((el) => {
            el.remove();
          });
        }

        function addLabel(el, labelText) {
          if (!el || el.querySelector(`.${HINT_CLASS}`)) return;
          if (!labelText || labelText === '—') return;
          const target = el.querySelector('.flex.items-center') || el.querySelector('.flex') || el;
          const span = document.createElement('span');
          span.className = HINT_CLASS;
          span.textContent = `${MOD_KEY_TEXT}+${labelText}`;
          (target || el).appendChild(span);
        }

        function getExpectedPrimaryHintTexts(primaryPairs) {
          return primaryPairs.map(({ action }) => {
            const slot = action?.slot;
            return slot == null ? '' : `${MOD_KEY_TEXT}+${displayFromCode(KEY_CODES[slot])}`;
          });
        }

        function primaryHintsAlreadyApplied(primaryPairs, expectedHintTexts) {
          for (let i = 0; i < primaryPairs.length; ++i) {
            const actual =
              primaryPairs[i]?.item?.el?.querySelector(`.${HINT_CLASS}`)?.textContent?.trim() || '';
            if ((expectedHintTexts[i] || '') !== actual) return false;
          }
          return true;
        }

        function isOpenVisibleListbox(listbox) {
          return (
            listbox instanceof Element &&
            listbox.getAttribute('role') === 'listbox' &&
            listbox.getAttribute('data-state') === 'open' &&
            isUsablyVisibleModelElement(listbox)
          );
        }

        function applyConfigureListboxHints() {
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
        }

        function applyThinkingEffortListboxHints() {
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
        }

        function applyModelSelectorThinkingEffortMenuHints() {
          const menu = getOpenThinkingEffortMenu();
          if (!(menu instanceof Element)) return false;
          let applied = false;
          Array.from(menu.querySelectorAll(`:scope ${MODEL_THINKING_EFFORT_OPTION_SELECTOR}`)).forEach(
            (item) => {
              const optionId = getThinkingEffortIdForMenuItem(item);
              const label = displayFromCode(getThinkingEffortStorageCode(optionId));
              if (!label || label === '—') return;
              addLabel(item, label);
              applied = true;
            },
          );
          return applied;
        }

        function applyModelVersionSubmenuHints() {
          const menu = getOpenModelVersionSubmenu(getVisibleModelMenuState().submenuTrigger);
          if (!(menu instanceof Element)) return false;
          let applied = false;
          getModelVersionMenuItems(menu).forEach((item, index) => {
            const action = getModelNameActionForMenuItem(item, index, window.__modelCatalog);
            const slot = Number(action?.slot);
            if (!Number.isInteger(slot) || slot < 0 || slot >= KEY_CODES.length) return;
            const label = displayFromCode(KEY_CODES[slot]);
            if (!label || label === '—') return;
            addLabel(item, label);
            applied = true;
          });
          return applied;
        }

        function applyConfigureFrontendRowHints() {
          const dialog = findConfigureDialog();
          if (!(dialog instanceof Element) || !isUsablyVisibleModelElement(dialog)) return false;
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
        }

        function applyOpenSelectListboxHints() {
          let applied = false;
          applied = applyConfigureFrontendRowHints() || applied;
          applied = applyConfigureListboxHints() || applied;
          applied = applyThinkingEffortListboxHints() || applied;
          applied = applyModelSelectorThinkingEffortMenuHints() || applied;
          applied = applyModelVersionSubmenuHints() || applied;
          return applied;
        }

        function apply(state = getVisibleModelMenuState()) {
          const primaryPairs = getPrimaryMenuActionPairs(state);
          const selectHintsApplied = applyOpenSelectListboxHints();
          if (!primaryPairs.length) return selectHintsApplied;
          const expectedHintTexts = getExpectedPrimaryHintTexts(primaryPairs);
          if (primaryHintsAlreadyApplied(primaryPairs, expectedHintTexts)) {
            syncActiveConfigFromMenuState(state, { persist: true });
            ModelPickerNameCache.maybePersistFromOpenMenus();
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
          // Persist labels -> names once menus are present; submenu must be open for full set.
          ModelPickerNameCache.maybePersistFromOpenMenus();
          return true;
        }

        function schedule({ retries = 0, interval = DELAY_APPLY_HINTS_OBSERVER_MS } = {}) {
          const token = ++scheduleToken;
          const run = () => {
            if (token !== scheduleToken) return;
            const applied = apply();
            if (applied || retries <= 0) return;
            retries -= 1;
            setTimeout(() => requestAnimationFrame(run), interval);
          };
          requestAnimationFrame(run);
        }

        function scheduleAfterMenuInteraction(event) {
          if (event.composedPath().some((n) => n instanceof Element && n.matches(MENU_BTN_SELECTOR))) {
            setTimeout(() => schedule({ retries: 12, interval: DELAY_APPLY_HINTS_AFTER_MAIN_MS }), 0);
          }

          const target = event.target instanceof Element ? event.target : null;
          const modelVersionMenu = getOpenModelVersionSubmenu(getVisibleModelMenuState().submenuTrigger);
          const clickedModelVersionItem =
            modelVersionMenu instanceof Element
              ? getModelVersionMenuItems(modelVersionMenu).find(
                (item) => item === target || item.contains(target),
              )
              : null;
          if (clickedModelVersionItem) {
            const itemIndex = getModelVersionMenuItems(modelVersionMenu).indexOf(clickedModelVersionItem);
            const clickedAction = getModelNameActionForMenuItem(
              clickedModelVersionItem,
              itemIndex,
              window.__modelCatalog,
            );
            if (clickedAction?.id) {
              setTimeout(() => {
                persistActiveModelConfigId(clickedAction.id);
              }, 0);
            }
          }

          const clickedPrimaryItem = target?.closest(
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

          const clickedConfigureOption = target?.closest('[role="option"][data-radix-collection-item]');
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

          const clickedCombobox = target?.closest('button[role="combobox"][aria-controls]');
          if (clickedCombobox) {
            setTimeout(() => schedule({ retries: 10, interval: DELAY_APPLY_HINTS_AFTER_SUBMENU_MS }), 0);
          }

          const submenuTriggerClicked = target?.closest(
            '[role="menuitem"][data-has-submenu], ' +
            '[role="menuitem"][aria-haspopup="menu"], ' +
            '[role="menuitem"][aria-controls]',
          );
          if (submenuTriggerClicked) {
            setTimeout(() => schedule({ retries: 10, interval: DELAY_APPLY_HINTS_AFTER_SUBMENU_MS }), 0);
          }
        }

        function getOpenSelectListboxCount() {
          return [findConfigureCombobox(), findThinkingEffortCombobox()]
            .map(getControlledListboxForCombobox)
            .filter(isOpenVisibleListbox).length;
        }

        function getOpenConfigureDialogCount() {
          return findConfigureDialog() ? 1 : 0;
        }

        function isConfigureUiLikelyActive() {
          return !!findConfigureDialog() || getOpenSelectListboxCount() > 0;
        }

        function scheduleWhenOpenSurfaceCountChanges() {
          if (!isModelMenuLikelyActive() && !isConfigureUiLikelyActive()) {
            observedOpenSurfaceCount = 0;
            return;
          }
          const count =
            getOpenModelMenus().length + getOpenConfigureDialogCount() + getOpenSelectListboxCount();
          if (count !== observedOpenSurfaceCount) {
            observedOpenSurfaceCount = count;
            setTimeout(() => schedule({ retries: 8, interval: DELAY_APPLY_HINTS_OBSERVER_MS }), 0);
          }
        }

        function installInteractionListeners() {
          document.addEventListener('click', scheduleAfterMenuInteraction);

          const observer = new MutationObserver(scheduleWhenOpenSurfaceCountChanges);
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
          });

          if (isModelMenuLikelyActive()) {
            schedule({ retries: 8, interval: DELAY_APPLY_HINTS_OBSERVER_MS });
          }
        }

        return {
          apply,
          applyOpenSelectListboxHints,
          ensureStyle,
          installInteractionListeners,
          schedule,
        };
      })();

      ModelPickerHints.ensureStyle();

      // --- Model-name cache: live menu labels -> popup/overlay storage ---

      function getModelTextWithoutHints(el) {
        if (!(el instanceof Element)) return window.ModelLabels.textNoHint(el);
        const clone = el.cloneNode(true);
        clone
          .querySelectorAll('[data-model-picker-thinking-effort-label-extra]')
          .forEach((node) => {
            node.remove();
          });
        return window.ModelLabels.textNoHint(clone);
      }

      const inferActiveConfigFromMenuState = (state = getVisibleModelMenuState()) => {
        const items = getPrimaryMenuItems(state).map((item) => ({
          testId: item.el.getAttribute('data-testid') || '',
          text: getModelTextWithoutHints(item.el),
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

      const ModelPickerNameCache = (() => {
        let lastPersistedSignature = '';
        let lastPersistedAt = 0;

        const TESTID_CANON = window.ModelLabels.TESTID_CANON;
        const MAIN_CANON_BY_INDEX = window.ModelLabels.MAIN_CANON_BY_INDEX;
        const mapSubmenuLabel = window.ModelLabels.mapSubmenuLabel;
        const canonFromTid =
          typeof window.ModelLabels.canonFromTid === 'function'
            ? window.ModelLabels.canonFromTid
            : (tid) => (tid && TESTID_CANON[tid]) || '';

        function collectOpenMenuNames() {
          const menus = getVisibleModelMenuState().menus.filter(Boolean);

          if (!menus.length) return null;

          const names = [];
          for (const menu of menus) {
            const items = Array.from(menu.querySelectorAll(MODEL_MENU_ITEM_SELECTOR));
            for (const item of items) {
              if (names.length >= MAX_SLOTS) break;
              names.push(getModelTextWithoutHints(item));
            }
            if (names.length >= MAX_SLOTS) break;
          }
          return names.map((name) => (name || '').trim());
        }

        function pickPrimaryMenuLabel(item, index) {
          const tid = normModelTid(item.getAttribute('data-testid'));
          const domLabel = getModelTextWithoutHints(item);
          const canonLabel = canonFromTid(tid) || '';

          // Main-menu rows now change their visible labels without keeping tid parity.
          // Prefer the primary DOM label, then fall back to stable tid-based canon labels.
          if (domLabel) return domLabel;
          if (canonLabel) return canonLabel;
          if (index < MAIN_CANON_BY_INDEX.length) return MAIN_CANON_BY_INDEX[index];
          return '';
        }

        function buildCanonicalLabelsFromOpenMenus() {
          const names = Array(MAX_SLOTS).fill('');
          const menus = getVisibleModelMenuState().menus.filter(Boolean);

          if (!menus.length) return { names, observedCount: 0, complete: false };

          let idx = 0;
          let hasSubmenuTrigger = false;

          // Main menu first
          const main = menus[0];
          if (main) {
            const mainItems = Array.from(main.querySelectorAll(MODEL_MENU_ITEM_SELECTOR));
            for (let i = 0; i < mainItems.length && idx < MAX_SLOTS; i++) {
              const item = mainItems[i];
              let label = '';

              if (isModelSubmenuTriggerItem(item)) {
                label = '→'; // canonical for submenu trigger (not a model)
                hasSubmenuTrigger = true;
              } else {
                label = pickPrimaryMenuLabel(item, i);
              }

              names[idx++] = (label || '').trim();
            }
          }

          // Any additional open menus (submenus) in order
          for (let m = 1; m < menus.length && idx < MAX_SLOTS; m++) {
            const subItems = Array.from(menus[m].querySelectorAll(MODEL_MENU_ITEM_SELECTOR));
            for (const item of subItems) {
              if (idx >= MAX_SLOTS) break;
              const tid = normModelTid(item.getAttribute('data-testid'));
              let label = canonFromTid(tid) || '';
              if (!label) {
                const primary = item.querySelector('.flex.items-center.gap-1') || item;
                const txt = getModelTextWithoutHints(primary);
                label = mapSubmenuLabel(txt) || txt;
              }
              names[idx++] = (label || '').trim();
            }
          }

          // A scrape is "complete" iff:
          // - there is no submenu trigger (single-level menu), OR
          // - a submenu trigger exists and we currently have submenu content open
          const complete = !hasSubmenuTrigger || menus.length > 1;

          while (names.length < MAX_SLOTS) names.push('');
          for (let k = 0; k < names.length; k++) names[k] = (names[k] || '').trim();
          return { names, observedCount: idx, complete };
        }

        function mergeAndPersistNames(candidates, meta) {
          const now = Date.now();
          try {
            const observedCount = Math.max(
              0,
              Math.min(
                MAX_SLOTS,
                Number(meta && meta.observedCount != null ? meta.observedCount : 0) || 0,
              ),
            );
            const complete = !!meta?.complete;
            chrome.storage.sync.get('modelNames', ({ modelNames: prev }) => {
              const prevArr = Array.isArray(prev) ? prev.slice(0, MAX_SLOTS) : Array(MAX_SLOTS).fill('');
              while (prevArr.length < MAX_SLOTS) prevArr.push('');
              const merged = Array.from({ length: MAX_SLOTS }, (_, i) => {
                if (complete && i >= observedCount) return '';
                const nv = (candidates[i] || '').trim();
                const pv = (prevArr[i] || '').trim();
                return nv || pv || '';
              });
              const sig = merged.join('|');
              if (sig === lastPersistedSignature && now - lastPersistedAt < 1000) return;
              lastPersistedSignature = sig;
              lastPersistedAt = now;
              chrome.storage.sync.set({ modelNames: merged, modelNamesAt: now }, () => { });
            });
          } catch (_) { }
        }

        function persistFromOpenMenus(fallbackNames) {
          const dom = buildCanonicalLabelsFromOpenMenus();
          const domNames = dom && Array.isArray(dom.names) ? dom.names : Array(MAX_SLOTS).fill('');
          const fallback = Array.isArray(fallbackNames)
            ? fallbackNames.slice(0, MAX_SLOTS)
            : Array(MAX_SLOTS).fill('');
          while (fallback.length < MAX_SLOTS) fallback.push('');

          const candidates = Array.from({ length: MAX_SLOTS }, (_, i) => {
            const d = (domNames[i] || '').trim();
            const f = (fallback[i] || '').trim();
            return d || f || '';
          });

          if (!candidates.some(Boolean)) return;
          mergeAndPersistNames(candidates, dom);
        }

        function maybePersistFromOpenMenus() {
          const names = collectOpenMenuNames();
          if (names) persistFromOpenMenus(names);
        }

        function persistRange(startIdx, values, rangeCount) {
          const start = Math.max(0, Math.min(MAX_SLOTS - 1, Number(startIdx) || 0));
          const count = Math.max(0, Math.min(MAX_SLOTS - start, Number(rangeCount) || 0));
          if (!count) return;

          const incoming = Array.isArray(values) ? values.slice(0, count) : [];
          const normalizeName =
            typeof window.ModelLabels?.normalizeStoredActionName === 'function'
              ? window.ModelLabels.normalizeStoredActionName
              : (_slot, value) => (value ?? '').toString().trim();

          chrome.storage.sync.get('modelNames', ({ modelNames: prev }) => {
            const next = Array.isArray(prev) ? prev.slice(0, MAX_SLOTS) : Array(MAX_SLOTS).fill('');
            while (next.length < MAX_SLOTS) next.push('');
            for (let i = 0; i < count; i++) next[start + i] = '';
            for (let i = 0; i < incoming.length; i++) {
              next[start + i] = normalizeName(start + i, incoming[i]) || '';
            }
            chrome.storage.sync.set({ modelNames: next, modelNamesAt: Date.now() }, () => { });
          });
        }

        return {
          collectOpenMenuNames,
          maybePersistFromOpenMenus,
          persistFromOpenMenus,
          persistRange,
        };
      })();

      function handleModelPickerRuntimeMessage(msg, _sender, sendResponse) {
        if (msg && msg.type === 'CSP_GET_MODEL_NAMES') {
          const names = ModelPickerNameCache.collectOpenMenuNames();
          if (names) ModelPickerNameCache.persistFromOpenMenus(names);
          sendResponse({ modelNames: Array.isArray(names) ? names : null });
          return;
        }
        if (msg && msg.type === 'CSP_SCRAPE_MODEL_CATALOG') {
          logModelRefreshDebug('message:catalog-scrape:start', {
            hideUi: msg.hideUi !== false,
            keepPreparedSession: msg.keepPreparedSession !== false,
          });
          void scrapeModelCatalogOnce({
            hideUi: msg.hideUi !== false,
            keepPreparedSession: msg.keepPreparedSession !== false,
          })
            .then((result) => {
              logModelRefreshDebug('message:catalog-scrape:result', {
                result: {
                  ok: !!result?.ok,
                  error: result?.error || '',
                  noModelSwitcher: result?.noModelSwitcher === true,
                  reason: result?.reason || '',
                },
                menu: getModelRefreshDebugMenuSummary(),
              });
              sendResponse(result);
            })
            .catch((error) => {
              const result = { ok: false, error: error?.message || 'SCRAPE_EXCEPTION' };
              logModelRefreshDebug('message:catalog-scrape:exception', {
                result,
                menu: getModelRefreshDebugMenuSummary(),
              });
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
      }

      // Respond to popup requests for live names (ensures freshness on popup open)
      try {
        chrome.runtime.onMessage.addListener(handleModelPickerRuntimeMessage);
      } catch (_) { }

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
          const value = getModelTextWithoutHints(candidate).replace(/\s+/g, ' ').trim();
          if (/^\d+(?:\.\d+)?$/.test(value)) return value;
        }
        return '';
      }
      const getModelVersionFromText = (value) => {
        const match = String(value || '')
          .replace(/\s+/g, ' ')
          .trim()
          .match(/\b(?:gpt[-\s]*)?(\d+(?:\.\d+)?)\b/i);
        return match?.[1] || '';
      };
      const isDynamicConfigureAction = (action) =>
        /^configure-dynamic-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(action?.id || '').trim());

      let latestFrontendActionSignatures = {};

      function getPrimaryActionIdForMenuItem(item, rawItems = []) {
        if (!(item instanceof Element)) return '';
        const activeModelConfigId = window.__activeModelConfigId || DEFAULT_ACTIVE_MODEL_CONFIG_ID;
        const mapFrontendLabel =
          typeof window.ModelLabels?.mapFrontendLabelToActionId === 'function'
            ? window.ModelLabels.mapFrontendLabelToActionId
            : null;
        const mapMenuLabelToFrontendActionId = () => {
          if (!mapFrontendLabel) return '';
          const label = getModelTextWithoutHints(item);
          return (
            mapFrontendLabel(label, activeModelConfigId) ||
            mapFrontendLabel(label, DEFAULT_ACTIVE_MODEL_CONFIG_ID) ||
            ''
          );
        };
        const tid = normModelTid(item.getAttribute('data-testid'));
        if (item.matches(MODEL_CONFIGURE_MENU_ITEM_SELECTOR)) return 'configure';
        if (isCurrentModelSubmenuTriggerItem(item)) return 'configure';
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
        return mapMenuLabelToFrontendActionId();
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
        const catalog = window.__modelCatalog || null;
        const catalogPrimaryActions =
          catalog && typeof window.ModelLabels?.getPopupPrimaryActions === 'function'
            ? window.ModelLabels.getPopupPrimaryActions(activeModelConfigId, [], catalog)
            : [];
        const primaryActions = catalogPrimaryActions.length
          ? catalogPrimaryActions
          : typeof window.ModelLabels?.getPrimaryPresentationActions === 'function'
            ? window.ModelLabels.getPrimaryPresentationActions(activeModelConfigId, [])
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

      function findConfigureMenuItem(state = getVisibleModelMenuState()) {
        const fromState = getPrimaryMenuItems(state).find((item) =>
          item.el.matches(MODEL_CONFIGURE_MENU_ITEM_SELECTOR),
        )?.el;
        if (fromState instanceof Element) return fromState;
        const roots = [state.main, ...getOpenModelMenus(), document].filter(Boolean);
        for (const root of roots) {
          const match = Array.from(
            root.querySelectorAll?.(MODEL_CONFIGURE_MENU_ITEM_SELECTOR) || [],
          ).find(isUsablyVisibleModelElement);
          if (match) return match;
        }
        return null;
      }

      function isUnavailableModelMenuItem(item) {
        return (
          item instanceof Element &&
          (item.hasAttribute('data-disabled') ||
            item.getAttribute('aria-disabled') === 'true' ||
            item.hasAttribute('disabled') ||
            item.matches(':disabled'))
        );
      }

      function isModelMenuWithoutSwitchingSurface(
        state = getVisibleModelMenuState(),
        { ignoreModelSubmenuTrigger = false } = {},
      ) {
        const main = state?.main;
        if (!(main instanceof Element)) return false;
        if (findConfigureMenuItem(state)) return false;

        const items = getDirectModelMenuItems(main);
        if (!items.length) return false;
        const hasDirectModelVersion = items.some((item) =>
          isLikelyModelVersionLabel(getModelTextWithoutHints(item)),
        );
        if (hasDirectModelVersion) return false;

        if (!ignoreModelSubmenuTrigger) {
          const hasModelSubmenuTrigger = items.some(
            (item) => isCurrentModelSubmenuTriggerItem(item) && !isUnavailableModelMenuItem(item),
          );
          if (hasModelSubmenuTrigger) return false;
        }

        const visibleModelVersionMenu = getOpenModelVersionSubmenu(state.submenuTrigger);
        return !(visibleModelVersionMenu instanceof Element);
      }

      function getModelRefreshDebugMenuSummary(state = getVisibleModelMenuState()) {
        const main = state?.main;
        const items = main instanceof Element ? getDirectModelMenuItems(main) : [];
        const text =
          main instanceof Element ? getModelTextWithoutHints(main).replace(/\s+/g, ' ').trim() : '';
        return {
          debugRev: 'model-refresh-structural-no-switching-v5',
          hasMain: main instanceof Element,
          hasComposerContent:
            main instanceof Element && !!main.querySelector(COMPOSER_INTELLIGENCE_MENU_CONTENT_SELECTOR),
          hasConfigure: !!findConfigureMenuItem(state),
          isModelMenuWithoutSwitchingSurface: isModelMenuWithoutSwitchingSurface(state),
          itemCount: items.length,
          itemTexts: items.map((item) => getModelTextWithoutHints(item).replace(/\s+/g, ' ').trim()),
          text,
        };
      }

      function logModelRefreshDebug(stage, details = {}) {
        try {
          console.log(
            '[CSP_MODEL_REFRESH_DEBUG]',
            JSON.stringify({
              stage,
              at: Date.now(),
              ...details,
            }),
          );
        } catch {
          console.log('[CSP_MODEL_REFRESH_DEBUG]', stage);
        }
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
          if (!configureEl && isCurrentModelSubmenuTriggerItem(state.submenuTrigger)) {
            return { el: state.submenuTrigger, menu: 'main', idx: -1 };
          }
          return configureEl ? { el: configureEl, menu: 'main', idx: -1 } : null;
        }
        if (action.actionKind === 'configure-option') {
          if (isCurrentModelSubmenuTriggerItem(state.submenuTrigger)) {
            return { el: state.submenuTrigger, menu: 'main', idx: -1 };
          }
          const stateItem = getPrimaryMenuItems(state).find((item) =>
            item.el.matches(MODEL_CONFIGURE_MENU_ITEM_SELECTOR),
          );
          if (stateItem) return stateItem;
          const configureEl = findConfigureMenuItem(state);
          return configureEl ? { el: configureEl, menu: 'main', idx: -1 } : null;
        }
        if (action.actionKind === 'configure-frontend-row') {
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
          label.closest(MODEL_CONFIGURE_DIALOG_SELECTOR),
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
      const findConfigureCombobox = () => findComboboxByLabelId(MODEL_SELECTION_LABEL_ID);
      const findThinkingEffortCombobox = () =>
        findComboboxByLabelId(THINKING_EFFORT_SELECTION_LABEL_ID);

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
        const optionLabels = options.map(getConfigureOptionLabel);
        const listAction =
          optionLabels.length && typeof window.ModelLabels?.getModelNameActionForLabelInList === 'function'
            ? window.ModelLabels.getModelNameActionForLabelInList(
                label,
                optionIndex,
                optionLabels,
                slotHint,
              )
            : null;
        if (typeof window.ModelLabels?.getCatalogModelNameActionForLabel === 'function') {
          const catalogAction = window.ModelLabels.getCatalogModelNameActionForLabel(
            label,
            optionIndex,
            window.__modelCatalog || null,
          );
          if (listAction?.id === DEFAULT_ACTIVE_MODEL_CONFIG_ID) return listAction;
          if (catalogAction?.id === DEFAULT_ACTIVE_MODEL_CONFIG_ID && listAction?.id) {
            return listAction;
          }
          if (catalogAction) return catalogAction;
        }
        if (listAction) return listAction;
        if (typeof window.ModelLabels?.getModelNameActionForLabel === 'function') {
          return window.ModelLabels.getModelNameActionForLabel(label, optionIndex, slotHint);
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

      const findConfigureDialog = () => {
        const combobox = findConfigureCombobox();
        const dialog = combobox?.closest(MODEL_CONFIGURE_DIALOG_SELECTOR);
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
      const getConfigureFrontendRowLabel = (row) => {
        if (!(row instanceof Element)) return '';
        const primary =
          row.querySelector('.flex.min-w-0.items-center.gap-1') ||
          row.querySelector('.flex.items-center.gap-1') ||
          row.querySelector('.truncate') ||
          row;
        return getModelTextWithoutHints(primary);
      };
      const getFrontendActionIdFromRowLabel = (row) => {
        const label = getConfigureFrontendRowLabel(row);
        if (!label || typeof window.ModelLabels?.mapFrontendLabelToActionId !== 'function') {
          return '';
        }
        return window.ModelLabels.mapFrontendLabelToActionId(
          label,
          DEFAULT_ACTIVE_MODEL_CONFIG_ID,
        );
      };
      const isUnavailableConfigureFrontendRow = (row) =>
        row instanceof Element &&
        (row.hasAttribute('data-disabled') ||
          row.getAttribute('aria-disabled') === 'true' ||
          row.hasAttribute('disabled') ||
          row.matches(':disabled'));
      const findConfigureProRow = (dialog) => {
        if (!(dialog instanceof Element)) return null;
        const candidates = Array.from(
          new Set([
            ...getConfigureFrontendRadioRows(dialog),
            ...Array.from(
              dialog.querySelectorAll(
                '[data-testid], [data-model-picker-pro-row], [data-model-picker-pro-menu-item]',
              ),
            ),
          ]),
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
            return (
              /(?:^|[-_=\s])pro(?:$|[-_=\s])/i.test(stableAttributes) ||
              getFrontendActionIdFromRowLabel(candidate) === 'pro'
            );
          }) || null
        );
      };
      const getDynamicSelfActionIdForRow = (row, activeConfigAction) => {
        if (!(row instanceof Element) || !isDynamicConfigureAction(activeConfigAction)) return '';
        if (getFrontendActionIdFromRowLabel(row)) return '';
        const expectedVersion = getModelVersionFromText(
          activeConfigAction.optionValue || activeConfigAction.label,
        );
        if (!expectedVersion) return '';
        const rowVersion =
          getModelVersionFromFrontendRow(row) ||
          getModelVersionFromText(getConfigureFrontendRowLabel(row));
        return rowVersion === expectedVersion ? activeConfigAction.id : '';
      };
      const getConfigureFrontendActionIdForRow = (row, dialog, activeConfigAction = null) => {
        if (!(row instanceof Element) || !(dialog instanceof Element)) return '';
        if (isUnavailableConfigureFrontendRow(row)) return '';
        const labelActionId = getFrontendActionIdFromRowLabel(row);
        if (labelActionId) return labelActionId;
        const dynamicSelfActionId = getDynamicSelfActionIdForRow(row, activeConfigAction);
        if (dynamicSelfActionId) return dynamicSelfActionId;
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
      const collectConfigureFrontendRows = (dialog, activeConfigAction = null) => {
        if (!(dialog instanceof Element)) return [];
        const rows = Array.from(
          new Set([...getConfigureFrontendRadioRows(dialog), findConfigureProRow(dialog)].filter(Boolean)),
        );
        return rows
          .map((row) => {
            const actionId = getConfigureFrontendActionIdForRow(row, dialog, activeConfigAction);
            const action =
              typeof window.ModelLabels?.getActionById === 'function'
                ? window.ModelLabels.getActionById(actionId)
                : null;
            const catalogAction =
              !action &&
              activeConfigAction &&
              actionId === activeConfigAction.id
                ? activeConfigAction
                : null;
            const resolvedAction = action || catalogAction;
            if (!actionId || !resolvedAction) return null;
            const rowLabel = getConfigureFrontendRowLabel(row);
            const label =
              catalogAction && rowLabel
                ? rowLabel
                : typeof window.ModelLabels?.getCanonicalActionLabel === 'function'
                  ? window.ModelLabels.getCanonicalActionLabel(actionId, resolvedAction.label)
                  : resolvedAction.label;
            return {
              id: actionId,
              slot: resolvedAction.slot,
              available: true,
              label,
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
      const normalizeThinkingEffortId = (id) =>
        typeof window.ModelLabels?.normalizeThinkingEffortId === 'function'
          ? window.ModelLabels.normalizeThinkingEffortId(id)
          : String(id || '').trim();
      const getThinkingEffortIdForMenuItem = (item) => {
        if (!(item instanceof Element)) return '';
        return mapThinkingEffortLabelToId(getModelTextWithoutHints(item));
      };
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
      const getOpenThinkingEffortMenu = (trigger = null, { strictTrigger = false } = {}) => {
        const triggerId = trigger?.id || '';
        return (
          Array.from(document.querySelectorAll(MODEL_MENU_SELECTOR))
            .filter((menu) => {
              if (!isUsablyVisibleModelElement(menu)) return false;
              if (triggerId && menu.getAttribute('aria-labelledby') === triggerId) return true;
              if (triggerId && strictTrigger) return false;
              return Array.from(
                menu.querySelectorAll(`:scope ${MODEL_THINKING_EFFORT_OPTION_SELECTOR}`),
              ).some((item) => getThinkingEffortIdForMenuItem(item));
            })
            .at(-1) || null
        );
      };
      const getModelThinkingEffortRowForButton = (button) =>
        button instanceof Element ? button.closest(MODEL_THINKING_EFFORT_ROW_SELECTOR) : null;
      const getModelThinkingEffortMenuItemForButton = (button) => {
        const row = getModelThinkingEffortRowForButton(button);
        return (
          row?.querySelector(MODEL_THINKING_EFFORT_MENU_ITEM_SELECTOR) ||
          button?.closest?.(MODEL_THINKING_EFFORT_MENU_ITEM_SELECTOR) ||
          null
        );
      };
      const isDisabledModelThinkingEffortButton = (button) =>
        button instanceof Element &&
        (button.hasAttribute('disabled') ||
          button.matches(':disabled') ||
          button.hasAttribute('data-disabled') ||
          button.getAttribute('aria-disabled') === 'true');
      const isProModelThinkingEffortMenuItem = (menuItem) => {
        if (!(menuItem instanceof Element)) return false;
        const tid = normModelTid(menuItem.getAttribute('data-testid'));
        if (/(?:^|-)pro(?:$|-)/.test(tid)) return true;
        return (
          typeof window.ModelLabels?.mapFrontendLabelToActionId === 'function' &&
          window.ModelLabels.mapFrontendLabelToActionId(
            getModelTextWithoutHints(menuItem),
            DEFAULT_ACTIVE_MODEL_CONFIG_ID,
          ) === 'pro'
        );
      };
      const isProModelThinkingEffortActionButton = (button) => {
        if (!(button instanceof Element)) return false;
        if (isDisabledModelThinkingEffortButton(button)) return false;
        const row = getModelThinkingEffortRowForButton(button);
        if (!(row instanceof Element)) return false;
        const menuItem = getModelThinkingEffortMenuItemForButton(button);
        if (isDisabledModelThinkingEffortButton(menuItem)) return false;
        const buttonTid = normModelTid(button.getAttribute('data-testid'));
        return (
          /(?:^|-)pro(?:$|-)/.test(buttonTid) ||
          isProModelThinkingEffortMenuItem(menuItem)
        );
      };
      const findModelThinkingEffortActionButton = (
        state = getVisibleModelMenuState(),
        predicate = null,
      ) => {
        const roots = [state.main, ...Array.from(document.querySelectorAll(MODEL_MENU_SELECTOR))].filter(
          (root, index, arr) => root instanceof Element && arr.indexOf(root) === index,
        );
        for (const root of roots) {
          const buttons = Array.from(root.querySelectorAll(MODEL_THINKING_EFFORT_ACTION_SELECTOR));
          const button = buttons.find(
            (candidate) => candidate instanceof Element && (!predicate || predicate(candidate)),
          );
          if (button instanceof Element) return button;
        }
        return null;
      };
      const findProModelThinkingEffortActionButton = (state = getVisibleModelMenuState()) =>
        findModelThinkingEffortActionButton(state, isProModelThinkingEffortActionButton);
      const revealModelThinkingEffortActionButton = (button) => {
        if (!(button instanceof Element)) return;
        const row =
          button.closest(MODEL_THINKING_EFFORT_ROW_SELECTOR) ||
          button.closest(MODEL_THINKING_EFFORT_MENU_ITEM_SELECTOR) ||
          button;
        [row, button].forEach((el) => {
          if (!(el instanceof Element)) return;
          el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false }));
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
          el.focus?.();
        });
      };
      const openModelSelectorThinkingEffortMenuForButton = async (button) => {
        if (!(button instanceof Element)) return null;
        const existing = getOpenThinkingEffortMenu(button, { strictTrigger: true });
        if (existing) return { menu: existing, opened: false };
        revealModelThinkingEffortActionButton(button);
        await sleepAsync(40);
        activateMenuItem(button);
        const menu = await waitForAsync(
          () => getOpenThinkingEffortMenu(button, { strictTrigger: true }),
          {
            timeout: 1200,
            interval: 40,
          },
        );
        return menu instanceof Element ? { menu, opened: true } : null;
      };
      const openModelSelectorThinkingEffortMenu = async (state = getVisibleModelMenuState()) => {
        const existing = getOpenThinkingEffortMenu();
        if (existing) return { menu: existing, opened: false };
        const button = findModelThinkingEffortActionButton(state);
        return openModelSelectorThinkingEffortMenuForButton(button);
      };
      const findThinkingEffortMenuItem = (menu, optionId) => {
        if (!(menu instanceof Element)) return null;
        const targetId = normalizeThinkingEffortId(optionId);
        return (
          Array.from(menu.querySelectorAll(`:scope ${MODEL_THINKING_EFFORT_OPTION_SELECTOR}`)).find(
            (item) => getThinkingEffortIdForMenuItem(item) === targetId,
          ) || null
        );
      };
      const collectThinkingEffortIdsFromModelSelectorMenu = async (
        state = getVisibleModelMenuState(),
      ) => {
        const opened = await openModelSelectorThinkingEffortMenu(state);
        const menu = opened?.menu || null;
        if (!(menu instanceof Element)) return [];
        const ids = Array.from(menu.querySelectorAll(`:scope ${MODEL_THINKING_EFFORT_OPTION_SELECTOR}`))
          .map(getThinkingEffortIdForMenuItem)
          .filter(Boolean);
        return typeof window.ModelLabels?.sortThinkingEffortIds === 'function'
          ? window.ModelLabels.sortThinkingEffortIds(ids)
          : Array.from(new Set(ids));
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
        const normalizedOptionId = normalizeThinkingEffortId(optionId);
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
      const DYNAMIC_SCRAPE_SLOT_START = 8;
      const isDynamicScrapeAction = (action) =>
        action?.optionKind === 'value' && String(action.id || '').startsWith('configure-dynamic-');
      const createScrapeSlotAllocator = (actions, startSlot = DYNAMIC_SCRAPE_SLOT_START) => {
        let nextDynamicSlot = startSlot;
        const usedSlots = new Set();
        const reservedCatalogSlots = new Set(
          actions
            .filter((action) => action?.fromCatalog)
            .map((action) => Number(action.slot))
            .filter((slot) => Number.isInteger(slot) && slot >= 0 && slot < MAX_SLOTS),
        );

        return (action) => {
          const isDynamic = isDynamicScrapeAction(action);
          let slot = Number(action?.slot);
          if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS) slot = -1;
          if (isDynamic && !action?.fromCatalog) slot = -1;
          if (slot >= 0 && !usedSlots.has(slot)) {
            usedSlots.add(slot);
            return slot;
          }
          if (!isDynamic) return -1;
          while (
            nextDynamicSlot < MAX_SLOTS &&
            (usedSlots.has(nextDynamicSlot) || reservedCatalogSlots.has(nextDynamicSlot))
          ) {
            nextDynamicSlot += 1;
          }
          if (nextDynamicSlot >= MAX_SLOTS) return -1;
          slot = nextDynamicSlot;
          usedSlots.add(slot);
          nextDynamicSlot += 1;
          return slot;
        };
      };
      const buildAvailableScrapeActions = (elements, actions, getLabel) => {
        const takeSlot = createScrapeSlotAllocator(actions);
        return elements
          .map((element, index) => {
            const action = actions[index];
            if (!action?.id) return null;
            const slot = takeSlot(action);
            if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS) return null;
            return {
              ...action,
              slot,
              label: getLabel(element, index, action),
            };
          })
          .filter(Boolean);
      };
      const deriveFlatModelNamesFromCatalog = (catalog) => {
        const names = Array(MAX_SLOTS).fill('');
        const configureOptions = Array.isArray(catalog?.configureOptions)
          ? catalog.configureOptions
          : [];
        configureOptions.forEach((option, optionIndex) => {
          const action =
            typeof window.ModelLabels?.getModelNameActionForLabel === 'function'
              ? window.ModelLabels.getModelNameActionForLabel(
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
      const persistScrapedModelCatalog = (catalog, { activeModelConfigId = '' } = {}) => {
        const modelNames = deriveFlatModelNamesFromCatalog(catalog);
        const values = {
          [MODEL_CATALOG_STORAGE_KEY]: catalog,
          modelNames,
          modelNamesAt: catalog.scrapedAt,
        };
        if (activeModelConfigId) values.activeModelConfigId = activeModelConfigId;
        chrome.storage.sync.set(values, () => {});
        return modelNames;
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
      const getModelVersionMenuItems = (menu) =>
        menu instanceof Element
          ? getDirectModelMenuItems(menu).filter((item) =>
              isLikelyModelVersionLabel(getModelTextWithoutHints(item)),
            )
          : [];
      const getModelVersionMenuItemLabel = (item) => {
        if (!(item instanceof Element)) return '';
        const primary = item.querySelector('.truncate') || item;
        return getModelTextWithoutHints(primary).replace(/\s+/g, ' ').trim();
      };
      const getModelNameActionForMenuItem = (
        item,
        itemIndex,
        catalog = window.__modelCatalog,
        listLabels = [],
      ) => {
        const label = getModelVersionMenuItemLabel(item);
        if (!label) return null;
        const listAction =
          Array.isArray(listLabels) &&
          listLabels.length &&
          typeof window.ModelLabels?.getModelNameActionForLabelInList === 'function'
            ? window.ModelLabels.getModelNameActionForLabelInList(label, itemIndex, listLabels)
            : null;
        if (typeof window.ModelLabels?.getCatalogModelNameActionForLabel === 'function') {
          const catalogAction = window.ModelLabels.getCatalogModelNameActionForLabel(
            label,
            itemIndex,
            catalog || null,
          );
          if (listAction?.id === DEFAULT_ACTIVE_MODEL_CONFIG_ID) return listAction;
          if (catalogAction?.id === DEFAULT_ACTIVE_MODEL_CONFIG_ID && listAction?.id) {
            return listAction;
          }
          if (catalogAction) return catalogAction;
        }
        if (listAction) return listAction;
        if (typeof window.ModelLabels?.getModelNameActionForLabel === 'function') {
          return window.ModelLabels.getModelNameActionForLabel(label, itemIndex);
        }
        return null;
      };
      const getOpenModelVersionSubmenu = (trigger = null) => {
        const triggerControls = trigger?.getAttribute?.('aria-controls') || '';
        const controlled = triggerControls ? document.getElementById(triggerControls) : null;
        if (
          controlled instanceof Element &&
          controlled.matches(MODEL_MENU_SELECTOR) &&
          isUsablyVisibleModelElement(controlled) &&
          isLikelyModelVersionMenuElement(controlled)
        ) {
          return controlled;
        }

        const triggerId = trigger?.id || '';
        const parentMenu = trigger?.closest?.('[data-radix-menu-content]') || null;
        const menus = Array.from(document.querySelectorAll(MODEL_MENU_SELECTOR)).filter(
          (menu) => menu instanceof Element && isUsablyVisibleModelElement(menu),
        );
        return (
          menus.find(
            (menu) =>
              triggerId &&
              menu.getAttribute('aria-labelledby') === triggerId &&
              isLikelyModelVersionMenuElement(menu),
          ) ||
          menus.find((menu) => menu !== parentMenu && isLikelyModelVersionMenuElement(menu)) ||
          null
        );
      };
      const openModelVersionSubmenu = async (state = getVisibleModelMenuState()) => {
        const existing =
          (state.submenu instanceof Element && isLikelyModelVersionMenuElement(state.submenu)
            ? state.submenu
            : null) || getOpenModelVersionSubmenu(state.submenuTrigger);
        if (existing) return { menu: existing, opened: false };

        const trigger = state.submenuTrigger;
        if (!(trigger instanceof Element)) return null;

        const openAttempt = (attemptIndex) => {
          trigger.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
          trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          trigger.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false }));
          trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
          trigger.focus?.();
          switch (attemptIndex % 4) {
            case 1:
              smartClickSafe(trigger);
              break;
            case 2:
              pressElementKey(trigger, 'ArrowRight', 'ArrowRight');
              break;
            case 3:
              pressElementKey(trigger, 'Enter', 'Enter');
              break;
            default:
              trigger.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
              break;
          }
        };

        let attempts = 0;
        const menu = await waitForAsync(
          () => {
            const found = getOpenModelVersionSubmenu(trigger);
            if (found) return found;
            openAttempt(attempts++);
            return null;
          },
          { timeout: 1800, interval: 45 },
        );
        return menu instanceof Element ? { menu, opened: true } : null;
      };
      const getIntegratedFrontendRowsFromState = (
        state = getVisibleModelMenuState(),
        activeConfigId = DEFAULT_ACTIVE_MODEL_CONFIG_ID,
      ) => {
        const main = state.main;
        if (!(main instanceof Element)) return [];
        const seen = new Set();
        return getDirectModelMenuItems(main)
          .filter((item) => !isModelSubmenuTriggerItem(item))
          .map((item) => {
            const label = getModelTextWithoutHints(item).replace(/\s+/g, ' ').trim();
            if (!label || typeof window.ModelLabels?.mapFrontendLabelToActionId !== 'function') {
              return null;
            }
            const actionId =
              window.ModelLabels.mapFrontendLabelToActionId(label, activeConfigId) ||
              window.ModelLabels.mapFrontendLabelToActionId(label, DEFAULT_ACTIVE_MODEL_CONFIG_ID);
            if (!actionId || seen.has(actionId)) return null;
            const action = getModelActionById(actionId);
            const slot = Number(action?.slot);
            if (!action || !Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS) return null;
            seen.add(actionId);
            return {
              id: actionId,
              slot,
              available: true,
              label,
            };
          })
          .filter(Boolean);
      };
      const findModelVersionMenuItemForAction = (menu, action) => {
        const items = getModelVersionMenuItems(menu);
        return (
          items.find((item, index) => {
            const itemAction = getModelNameActionForMenuItem(item, index, window.__modelCatalog);
            return itemAction?.id === action?.id;
          }) || null
        );
      };
      const selectIntegratedModelNameDuringScrape = async (action) => {
        if (!action?.id) return false;
        const alreadyOpen = ensureMainMenuOpen();
        await sleepAsync(alreadyOpen ? 100 : 160);
        const opened = await openModelVersionSubmenu(getVisibleModelMenuState());
        const menu = opened?.menu || null;
        if (!(menu instanceof Element)) return false;
        const item = findModelVersionMenuItemForAction(menu, action);
        if (!(item instanceof Element)) return false;
        activateMenuItem(item);
        persistActiveModelConfigId(action.id);
        await sleepAsync(180);
        return true;
      };
      const scrapeIntegratedModelCatalogOnce = async () => {
        await releasePreparedModelConfigSession();
        const alreadyOpen = ensureMainMenuOpen();
        await sleepAsync(alreadyOpen ? 120 : 180);
        let state = getVisibleModelMenuState();
        const isIntegratedMenu =
          state.main instanceof Element &&
          !!state.main.querySelector(COMPOSER_INTELLIGENCE_MENU_CONTENT_SELECTOR);
        logModelRefreshDebug('integrated:menu-state', {
          isIntegratedMenu,
          menu: getModelRefreshDebugMenuSummary(state),
        });
        if (!isIntegratedMenu) return { fallback: true };

        const opened = await openModelVersionSubmenu(state);
        const submenu = opened?.menu || null;
        if (!(submenu instanceof Element)) {
          const noSwitcher = isModelMenuWithoutSwitchingSurface(state, {
            ignoreModelSubmenuTrigger: true,
          });
          logModelRefreshDebug('integrated:missing-submenu', {
            noSwitcher,
            menu: getModelRefreshDebugMenuSummary(state),
          });
          return noSwitcher
            ? createNoModelSwitcherResult('model-menu-without-switching-surface')
            : { ok: false, error: 'MODEL_SUBMENU_NOT_FOUND' };
        }

        const modelNameItems = getModelVersionMenuItems(submenu);
        if (!modelNameItems.length) {
          const currentState = getVisibleModelMenuState();
          const noSwitcher = isModelMenuWithoutSwitchingSurface(currentState, {
            ignoreModelSubmenuTrigger: true,
          });
          logModelRefreshDebug('integrated:missing-submenu-options', {
            noSwitcher,
            menu: getModelRefreshDebugMenuSummary(currentState),
          });
          return noSwitcher
            ? createNoModelSwitcherResult('model-menu-without-switching-surface')
            : { ok: false, error: 'MODEL_SUBMENU_OPTIONS_NOT_FOUND' };
        }

        const modelNameLabels = modelNameItems.map(getModelVersionMenuItemLabel);
        const modelNameActions = modelNameItems.map((item, index) =>
          getModelNameActionForMenuItem(item, index, window.__modelCatalog, modelNameLabels),
        );
        const availableModelNames = buildAvailableScrapeActions(
          modelNameItems,
          modelNameActions,
          getModelVersionMenuItemLabel,
        );
        if (!availableModelNames.length) {
          const currentState = getVisibleModelMenuState();
          const noSwitcher = isModelMenuWithoutSwitchingSurface(currentState, {
            ignoreModelSubmenuTrigger: true,
          });
          logModelRefreshDebug('integrated:unresolved-options', {
            noSwitcher,
            menu: getModelRefreshDebugMenuSummary(currentState),
          });
          return noSwitcher
            ? createNoModelSwitcherResult('model-menu-without-switching-surface')
            : { ok: false, error: 'MODEL_OPTIONS_UNRESOLVED' };
        }

        const activeIndex = modelNameItems.findIndex(
          (item) =>
            item.getAttribute('aria-checked') === 'true' ||
            item.getAttribute('data-state') === 'checked',
        );
        const initialActiveModelName =
          availableModelNames[Math.max(0, activeIndex)] || availableModelNames[0] || null;
        const initialActiveConfigId = normalizeActiveModelConfigId(initialActiveModelName?.id);
        const frontendByConfig = {};
        frontendByConfig[initialActiveConfigId] = getIntegratedFrontendRowsFromState(
          state,
          initialActiveConfigId,
        );

        for (const modelName of availableModelNames) {
          if (modelName.id === initialActiveConfigId) continue;
          const selected = await selectIntegratedModelNameDuringScrape(modelName);
          if (!selected) continue;
          const reopened = ensureMainMenuOpen();
          await sleepAsync(reopened ? 100 : 160);
          state = getVisibleModelMenuState();
          frontendByConfig[modelName.id] = getIntegratedFrontendRowsFromState(state, modelName.id);
        }

        if (initialActiveModelName?.id) {
          await selectIntegratedModelNameDuringScrape(initialActiveModelName);
        }

        const catalog = {
          version: 3,
          scrapedAt: Date.now(),
          integratedEffort: true,
          configureOptions: availableModelNames.map((modelName) => ({
            id: modelName.id,
            slot: modelName.slot,
            label:
              typeof window.ModelLabels?.getCanonicalActionLabel === 'function'
                ? window.ModelLabels.getCanonicalActionLabel(modelName.id, modelName.label)
                : modelName.label,
          })),
          thinkingEffortIds: [],
          frontendByConfig,
        };
        const modelNames = persistScrapedModelCatalog(catalog, {
          activeModelConfigId: initialActiveConfigId,
        });
        setCachedActiveModelConfigId(initialActiveConfigId);

        return {
          ok: true,
          modelCatalog: catalog,
          modelNames,
          activeModelConfigId: initialActiveConfigId,
        };
      };
      const scrapeModelCatalogOnce = async ({ hideUi = true, keepPreparedSession = true } = {}) =>
        ModelPickerScrapeSession.withCatalogUi(hideUi, async () => {
          try {
          await releasePreparedModelConfigSession();
          if (!getVisibleModelMenuButton()) return createNoModelSwitcherResult('model-switcher-pill-missing');

          const integratedResult = await scrapeIntegratedModelCatalogOnce();
          if (!integratedResult?.fallback) return integratedResult;

          await releasePreparedModelConfigSession();
          if (!getVisibleModelMenuButton()) return createNoModelSwitcherResult('model-switcher-pill-missing');

          const alreadyOpen = ensureMainMenuOpen();
          await sleepAsync(alreadyOpen ? 120 : 180);
          const menuReady = await waitForMainMenuActionTarget(getModelActionById('configure'));
          const state = menuReady?.state || getVisibleModelMenuState();
          const modelSelectorThinkingEffortIds =
            await collectThinkingEffortIdsFromModelSelectorMenu(state);
          hideOpenModelUiForScrape(getVisibleModelMenuState());
          const configureItem = findConfigureMenuItem(state);
          if (!state.main || !configureItem) {
            const noSwitcher = isModelMenuWithoutSwitchingSurface(state, {
              ignoreModelSubmenuTrigger: true,
            });
            logModelRefreshDebug('legacy:missing-configure', {
              noSwitcher,
              menu: getModelRefreshDebugMenuSummary(state),
            });
            return noSwitcher
              ? createNoModelSwitcherResult('model-menu-without-switching-surface')
              : { ok: false, error: 'CONFIGURE_ITEM_NOT_FOUND' };
          }

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

          const optionElements = Array.from(listbox.querySelectorAll(':scope [role="option"]'));
          const optionActions = optionElements.map((option) =>
            getConfigureActionForOption(option, listbox),
          );
          const availableOptions = buildAvailableScrapeActions(
            optionElements,
            optionActions,
            getConfigureOptionLabel,
          );

          const scrapeOrder = availableOptions
            .slice()
            .sort((a, b) =>
              a.id === 'configure-latest' ? -1 : b.id === 'configure-latest' ? 1 : 0,
            );

          for (const option of scrapeOrder) {
            await selectConfigureOptionDuringScrape(combobox, option);
            hideConfigureDialogUiForScrape();
            frontendByConfig[option.id] = collectConfigureFrontendRows(findConfigureDialog(), option);
          }
          if (availableOptions.every((option) => option.id !== initialActiveConfigId)) {
            const initialOption =
              availableOptions.find((option) => option.id === initialActiveConfigId) ||
              getModelActionById(initialActiveConfigId);
            frontendByConfig[initialActiveConfigId] = collectConfigureFrontendRows(
              findConfigureDialog(),
              initialOption,
            );
          }
          const configureThinkingEffortIds = await collectThinkingEffortIdsDuringScrape(combobox);
          const thinkingEffortIds =
            typeof window.ModelLabels?.sortThinkingEffortIds === 'function'
              ? window.ModelLabels.sortThinkingEffortIds([
                  ...modelSelectorThinkingEffortIds,
                  ...configureThinkingEffortIds,
                ])
              : Array.from(
                  new Set([...modelSelectorThinkingEffortIds, ...configureThinkingEffortIds]),
                );
          await ensureConfigureComboboxSelection(combobox, initialActiveConfigId);
          if (initialFrontendActionId) {
            await ensureConfigureFrontendRowSelection(initialFrontendActionId);
          }

          const catalog = {
            version: 2,
            scrapedAt: Date.now(),
            configureOptions: availableOptions.map((option) => ({
              id: option.id,
              slot: option.slot,
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
          const modelNames = persistScrapedModelCatalog(catalog);

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
            clearPreparedModelConfigSession();
          }

          return {
            ok: true,
            modelCatalog: catalog,
            modelNames,
            activeModelConfigId: initialActiveConfigId,
          };
          } catch (error) {
            return { ok: false, error: error?.message || 'SCRAPE_FAILED' };
          }
        });

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
        if (typeof window.ModelLabels?.getModelNameActionForLabel === 'function') {
          return window.ModelLabels.getModelNameActionForLabel(value, -1)?.id || DEFAULT_ACTIVE_MODEL_CONFIG_ID;
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

      const runConfigureOpenAction = async ({ initialState = null } = {}) => {
        const ready = initialState
          ? { state: initialState }
          : await waitForMainMenuActionTarget(getModelActionById('configure'));
        const state = ready?.state || getVisibleModelMenuState();
        const configureItem = findConfigureMenuItem(state);
        if (!configureItem) return false;

        const combobox = await openConfigureDialogFromMenuItem(configureItem);
        if (!combobox) return false;

        const opened = await openComboboxListbox(combobox);
        if (!opened?.listbox) return false;

        ModelPickerHints.applyOpenSelectListboxHints();
        flashBottomBar();
        return true;
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
      const runIntegratedModelNameAction = async (
        action,
        { hideUi = false, initialState = null } = {},
      ) => {
        if (!action?.id || window.__modelCatalog?.integratedEffort !== true) return false;
        return withTemporarilyHiddenModelUi(hideUi, async () => {
          const alreadyOpen = ensureMainMenuOpen();
          await sleepAsync(alreadyOpen ? 80 : 140);
          const opened = await openModelVersionSubmenu(initialState || getVisibleModelMenuState());
          const menu = opened?.menu || null;
          if (!(menu instanceof Element)) return false;
          if (hideUi) hideOpenModelUiForScrape(getVisibleModelMenuState());

          const item = findModelVersionMenuItemForAction(menu, action);
          if (!(item instanceof Element)) return false;

          if (!hideUi) {
            ModelPickerHints.apply();
            if (window.gsap) flashMenuItem(item);
          }
          await sleepAsync(hideUi ? 0 : DELAY_ACTIVATE_TARGET_MS);
          activateMenuItem(item);
          persistActiveModelConfigId(action.id);
          await sleepAsync(100);
          if (!hideUi) flashBottomBar();
          return true;
        });
      };
      const INTEGRATED_EFFORT_FALLBACK_STEP_DELAY_MS = 100;
      const clearOpenModelMenuBeforeSequentialReplay = async () => {
        if (!isModelMenuLikelyActive()) return;
        const state = getVisibleModelMenuState();
        const targets = [
          document.activeElement instanceof Element ? document.activeElement : null,
          state.submenu,
          state.main,
          getModelMenuButton(),
        ].filter((target, index, arr) => target instanceof Element && arr.indexOf(target) === index);
        targets.forEach((target) => {
          pressElementKey(target, 'Escape', 'Escape');
        });
        await sleepAsync(30);
      };
      const BASELINE_INTEGRATED_EFFORT_ACTION_IDS = new Set(['instant', 'thinking', 'pro']);
      const isIntegratedBaselineEffortAction = (action) =>
        window.__modelCatalog?.integratedEffort === true &&
        BASELINE_INTEGRATED_EFFORT_ACTION_IDS.has(String(action?.id || '').trim());
      const latestModelSupportsEffortAction = (action) => {
        const rows = window.__modelCatalog?.frontendByConfig?.[DEFAULT_ACTIVE_MODEL_CONFIG_ID];
        if (!Array.isArray(rows)) return true;
        return rows.some(
          (row) =>
            row?.available === true &&
            String(row?.id || '').trim() === String(action?.id || '').trim(),
        );
      };
      const getLatestModelShortcutSlot = () => {
        const latestAction = getModelActionById(DEFAULT_ACTIVE_MODEL_CONFIG_ID);
        const slot = Number(latestAction?.slot);
        return Number.isInteger(slot) && slot >= 0 && slot < KEY_CODES.length ? slot : -1;
      };
      const shouldFallbackToLatestForMissingLiveEffort = (
        action,
        state = getVisibleModelMenuState(),
      ) => {
        if (!isIntegratedBaselineEffortAction(action)) return false;
        if (!latestModelSupportsEffortAction(action)) return false;
        if (!(state?.main instanceof Element)) return false;
        return getPrimaryMenuActionPairs(state).some((pair) =>
          BASELINE_INTEGRATED_EFFORT_ACTION_IDS.has(String(pair.action?.id || '').trim()),
        );
      };
      const runIntegratedEffortFallbackAction = async (
        action,
        { hideUi = false, initialState = null, sourceSlot = -1 } = {},
      ) => {
        if (!shouldFallbackToLatestForMissingLiveEffort(action, initialState)) return false;
        const fallbackAction = getModelActionById(DEFAULT_ACTIVE_MODEL_CONFIG_ID);
        if (!fallbackAction) return false;
        const fallbackSlot = getLatestModelShortcutSlot();
        if (fallbackSlot < 0) return false;

        const replaySlot = Number.isInteger(Number(sourceSlot))
          ? Number(sourceSlot)
          : Number(action?.slot);
        const replayAction = getModelActionBySlot(replaySlot) || action;

        runModelPickerShortcutSlot(fallbackSlot, {
          hideUi,
          skipIntegratedEffortFallback: true,
          fallbackAction,
          skipUsageRecord: true,
          onComplete: async (switched) => {
            if (!switched) return;
            persistActiveModelConfigId(DEFAULT_ACTIVE_MODEL_CONFIG_ID);
            await sleepAsync(INTEGRATED_EFFORT_FALLBACK_STEP_DELAY_MS);
            await clearOpenModelMenuBeforeSequentialReplay();
            runModelPickerShortcutSlot(replaySlot, {
              hideUi,
              skipIntegratedEffortFallback: true,
              fallbackAction: replayAction,
              skipUsageRecord: true,
            });
          },
        });
        return true;
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
      const runLegacyThinkingEffortOptionAction = (optionId) => {
        const iconTokenByOptionId = {
          'thinking-extended': '#143e56',
          'thinking-standard': '#fec800',
          'thinking-light': '#407870',
          'thinking-heavy': '#3c5754',
        };
        const subItemToken = iconTokenByOptionId[normalizeThinkingEffortId(optionId)];
        if (!subItemToken) return false;
        const firstButtonPath = ['#127a53', '#c9d737'];
        const clickLegacyThinkingMenuItem = window.__cspClickLowestSvgThenSubItemSvg;
        if (typeof clickLegacyThinkingMenuItem !== 'function') return false;
        setTimeout(() => {
          clickLegacyThinkingMenuItem(firstButtonPath, subItemToken);
        }, 350);
        return true;
      };
      const runModelSelectorThinkingEffortOptionAction = async (option, { hideUi = false } = {}) => {
        if (!option?.id) return false;
        const alreadyOpen = ensureMainMenuOpen();
        await sleepAsync(alreadyOpen ? 120 : 180);
        const opened = await openModelSelectorThinkingEffortMenu(getVisibleModelMenuState());
        const menu = opened?.menu || null;
        if (!(menu instanceof Element)) return false;
        if (hideUi) hideOpenModelUiForScrape(getVisibleModelMenuState());
        const target = findThinkingEffortMenuItem(menu, option.id);
        if (!target) return false;
        await activateAfterFlash(target, DELAY_ACTIVATE_TARGET_MS);
        persistActiveModelConfigId(DEFAULT_ACTIVE_MODEL_CONFIG_ID);
        await sleepAsync(120);
        if (!hideUi) flashBottomBar();
        return true;
      };
      const runModelSelectorProThinkingEffortOptionAction = async (
        option,
        { hideUi = false } = {},
      ) => {
        if (!option?.id) return false;
        const alreadyOpen = ensureMainMenuOpen();
        await sleepAsync(alreadyOpen ? 120 : 180);
        const button = findProModelThinkingEffortActionButton(getVisibleModelMenuState());
        if (!(button instanceof Element)) return false;
        const opened = await openModelSelectorThinkingEffortMenuForButton(button);
        const menu = opened?.menu || null;
        if (!(menu instanceof Element)) return false;
        if (hideUi) hideOpenModelUiForScrape(getVisibleModelMenuState());
        const target = findThinkingEffortMenuItem(menu, option.id);
        if (!target) return false;
        await activateAfterFlash(target, DELAY_ACTIVATE_TARGET_MS);
        await sleepAsync(120);
        if (!hideUi) flashBottomBar();
        return true;
      };
      const runConfigureFrontendThinkingEffortOptionAction = async (
        option,
        frontendActionId,
        { hideUi = false } = {},
      ) => {
        if (!option?.id) return false;
        const normalizedFrontendActionId = String(frontendActionId || '').trim();
        if (!normalizedFrontendActionId) return false;
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

        const frontendSelected =
          await ensureConfigureFrontendRowSelection(normalizedFrontendActionId);
        if (!frontendSelected) return false;

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
      };
      const runConfigureThinkingEffortOptionAction = async (option, { hideUi = false } = {}) =>
        runConfigureFrontendThinkingEffortOptionAction(option, 'thinking', { hideUi });
      const runConfigureProThinkingEffortOptionAction = async (option, { hideUi = false } = {}) =>
        runConfigureFrontendThinkingEffortOptionAction(option, 'pro', { hideUi });
      const runThinkingEffortOptionAction = async (optionId, { hideUi = false } = {}) => {
        const option = getThinkingEffortOptionById(optionId);
        if (!option?.id) return false;
        return withTemporarilyHiddenModelUi(hideUi, async () => {
          if (await runModelSelectorThinkingEffortOptionAction(option, { hideUi })) return true;
          if (await runConfigureThinkingEffortOptionAction(option, { hideUi })) return true;
          return hideUi ? false : runLegacyThinkingEffortOptionAction(option.id);
        });
      };
      // Runtime bridge: Alt shortcut map delegates thinking-effort actions to model-picker routing.
      window.__cspRunThinkingEffortAction = (optionId, options = {}) => {
        const option = getThinkingEffortOptionById(optionId);
        if (!option?.id) return false;
        void runThinkingEffortOptionAction(option.id, options);
        return true;
      };
      const runProThinkingEffortOptionAction = async (optionId, { hideUi = false } = {}) => {
        const option = getThinkingEffortOptionById(optionId);
        if (!option?.id) return false;
        return withTemporarilyHiddenModelUi(hideUi, async () => {
          if (await runModelSelectorProThinkingEffortOptionAction(option, { hideUi })) return true;
          return runConfigureProThinkingEffortOptionAction(option, { hideUi });
        });
      };
      // Runtime bridge: Alt shortcut map delegates Pro thinking actions to model-picker routing.
      window.__cspRunProThinkingEffortAction = (optionId, options = {}) => {
        const option = getThinkingEffortOptionById(optionId);
        if (!option?.id) return false;
        void runProThinkingEffortOptionAction(option.id, options);
        return true;
      };

      // Runtime bridge: outer listeners refresh model-picker labels when key assignments change.
      window.__mp_applyHints = (options = {}) => ModelPickerHints.schedule(options);

      const ModelPickerActionRunner = (() => {
        function createCompletion(options) {
          let completed = false;
          return (ok = true) => {
            if (completed) return;
            completed = true;
            if (typeof options.onComplete === 'function') {
              try {
                options.onComplete(ok);
              } catch {}
            }
          };
        }

        function waitForMenuActionTarget(nextAction, done, options = {}) {
          ensureMainMenuOpen();

          let mainPolls = 0;
          let lastState = null;
          const waitForReadyState = () => {
            const state = getVisibleModelMenuState();
            if (state?.menus?.length || state?.items?.length) lastState = state;
            const target = getTargetMenuItemForAction(nextAction, state);
            if (!target) {
              if (
                options.allowIntegratedEffortFallback !== false &&
                shouldFallbackToLatestForMissingLiveEffort(nextAction, state)
              ) {
                done({ state, target: null });
                return;
              }
              if (mainPolls++ > 50) {
                done(lastState ? { state: lastState, target: null } : null);
                return;
              }
              setTimeout(waitForReadyState, 30);
              return;
            }
            done({ state, target });
          };

          waitForReadyState();
        }

        function activateDirectModelTarget(action, ready, complete) {
          const targetEl = ready?.target?.el;
          if (!targetEl) return false;
          const directPair = getPrimaryMenuActionPairs(ready?.state || getVisibleModelMenuState()).find(
            (pair) => pair.action?.id === action.id && pair.item?.el === targetEl,
          );
          if (!directPair) return false;
          if (window.gsap) flashMenuItem(targetEl);
          setTimeout(() => {
            activateMenuItem(targetEl);
            flashBottomBar();
            complete(true);
          }, DELAY_ACTIVATE_TARGET_MS);
          return true;
        }

        function dispatchPreparedConfigureOptionIfAvailable(action, options, complete) {
          if (action.actionKind !== 'configure-option' || !options.preferPreparedSession) return false;
          if (!getPreparedModelConfigSession()) return false;
          void runConfigureOptionAction(action, {
            hideUi: options.hideUi === true,
            preferPreparedSession: true,
          }).then((result) => complete(result !== false));
          return true;
        }

        function dispatchIntegratedEffortFallbackIfNeeded(action, ready, options, complete) {
          if (options.skipIntegratedEffortFallback === true) return false;
          if (!shouldFallbackToLatestForMissingLiveEffort(action, ready?.state || null)) return false;
          void runIntegratedEffortFallbackAction(action, {
            hideUi: options.hideUi === true,
            initialState: ready?.state || null,
            sourceSlot: options.sourceSlot,
          }).then((result) => complete(result !== false));
          return true;
        }

        function dispatchMissingTargetAction(action, ready, options, complete) {
          if (dispatchIntegratedEffortFallbackIfNeeded(action, ready, options, complete)) return;
          if (action.actionKind === 'main-row' || action.actionKind === 'configure-frontend-row') {
            void runConfigureFrontendRowAction(action).then((result) => complete(result !== false));
            return;
          }
          complete(false);
        }

        async function dispatchConfigureOptionAction(action, ready, options, complete) {
          if (!options.hideUi) ModelPickerHints.apply();
          if (
            await runIntegratedModelNameAction(action, {
              hideUi: options.hideUi === true,
              initialState: ready.state,
            })
          ) {
            complete(true);
            return;
          }
          await runConfigureOptionAction(action, {
            hideUi: options.hideUi === true,
            initialState: ready.state,
            preferPreparedSession: options.preferPreparedSession === true,
          });
          complete(true);
        }

        function dispatchConfigureOpenAction(ready, options, complete) {
          if (!options.hideUi) ModelPickerHints.apply();
          void runConfigureOpenAction({ initialState: ready.state }).then((result) =>
            complete(result !== false),
          );
        }

        function activateVisibleMenuTarget(ready, complete) {
          const targetEl = ready.target?.el;
          if (!targetEl) {
            complete(false);
            return;
          }
          if (window.gsap) flashMenuItem(targetEl);
          setTimeout(() => {
            activateMenuItem(targetEl);
            flashBottomBar();
            const stateAfterClick = getVisibleModelMenuState();
            const clickedPair = getPrimaryMenuActionPairs(stateAfterClick).find(
              (pair) => pair.item.el === targetEl,
            );
            const clickedAction = clickedPair?.action || null;
            if (clickedAction?.id === 'configure') {
              complete(true);
              return;
            }
            if (clickedAction?.actionKind === 'configure-option') {
              persistActiveModelConfigId(clickedAction.id);
              complete(true);
              return;
            }
            syncActiveConfigFromMenuState(ready.state, { persist: true });
            complete(true);
          }, DELAY_ACTIVATE_TARGET_MS);
        }

        function dispatchReadyAction(action, ready, options, complete) {
          if (!ready?.target) {
            dispatchMissingTargetAction(action, ready, options, complete);
            return;
          }
          if (action.actionKind === 'configure-option') {
            void dispatchConfigureOptionAction(action, ready, options, complete);
            return;
          }
          if (action.actionKind === 'configure-open') {
            dispatchConfigureOpenAction(ready, options, complete);
            return;
          }

          ModelPickerHints.apply();
          if (action.actionKind === 'configure-frontend-row') {
            if (activateDirectModelTarget(action, ready, complete)) return;
            void runConfigureFrontendRowAction(action).then((result) => complete(result !== false));
            return;
          }
          activateVisibleMenuTarget(ready, complete);
        }

        function execute(action, options = {}) {
          if (!action) return false;
          const complete = createCompletion(options);
          if (dispatchPreparedConfigureOptionIfAvailable(action, options, complete)) return true;

          const alreadyOpen = ensureMainMenuOpen();
          setTimeout(
            () => {
              waitForMenuActionTarget(
                action,
                (ready) => dispatchReadyAction(action, ready, options, complete),
                { allowIntegratedEffortFallback: options.skipIntegratedEffortFallback !== true },
              );
            },
            alreadyOpen ? DELAY_MAIN_MENU_SETTLE_EXPANDED_MS : DELAY_MAIN_MENU_SETTLE_OPEN_MS,
          );
          return true;
        }

        return {
          execute,
        };
      })();

      const executeModelAction = (action, options = {}) =>
        ModelPickerActionRunner.execute(action, options);
      // --- KEY HANDLING ---
      function runModelPickerShortcutSlot(slot, options = {}) {
        const idx = Number(slot);
        if (!Number.isInteger(idx) || idx < 0 || idx >= KEY_CODES.length) return false;
        const action = getModelActionBySlot(idx) || options.fallbackAction || null;
        if (!action) return false;
        if (options.skipUsageRecord !== true) recordModelPickerSlotUsage(idx);
        executeModelAction(action, {
          hideUi: options.hideUi === true,
          preferPreparedSession: options.preferPreparedSession === true,
          skipIntegratedEffortFallback: options.skipIntegratedEffortFallback === true,
          sourceSlot: idx,
          onComplete: options.onComplete,
        });
        return true;
      }

      const recordModelPickerSlotUsage = (_index) => {};
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
          runModelPickerShortcutSlot(idx, { fallbackAction: action });
        },
        true,
      );

      ModelPickerHints.installInteractionListeners();
    },
  );

  const pressModelMenuKey = (el, key, code = key, extraInit = {}) => {
    if (!el) return;
    ['keydown', 'keyup'].forEach((type) => {
      el.dispatchEvent(
        new KeyboardEvent(type, {
          key,
          code,
          bubbles: true,
          cancelable: true,
          composed: true,
          ...extraInit,
        }),
      );
    });
  };

  const hoverModelMenuElement = (el, { includeMove = false } = {}) => {
    if (!el) return;
    el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    if (includeMove) el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  };

  const clickModelMenuElement = (el) => {
    if (!el) return;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  };

  const waitForModelMenuOpen = (btn, cb) => {
    const currentState = getVisibleModelMenuState();
    const isExpanded = () => btn.getAttribute('aria-expanded') === 'true';
    if (isExpanded() && (currentState.main || hasOpenModelMenuCandidate()))
      return cb(currentState);

    btn.focus();
    pressModelMenuKey(btn, ' ', 'Space', { keyCode: 32, charCode: 32 });

    let tries = 0;
    let usedClickFallback = false;
    const poll = () => {
      const state = getVisibleModelMenuState();
      if (state.main || isExpanded() || tries++ > 50) return cb(state);
      if (!usedClickFallback && tries >= 4) {
        usedClickFallback = true;
        clickModelMenuElement(btn);
      }
      setTimeout(poll, 30);
    };
    poll();
  };

  const tryOpenModelVersionSubmenu = (trigger, attempt) => {
    switch (attempt % 4) {
      case 0:
        hoverModelMenuElement(trigger, { includeMove: true });
        break;
      case 1:
        clickModelMenuElement(trigger);
        break;
      case 2:
        trigger.focus();
        pressModelMenuKey(trigger, 'ArrowRight', 'ArrowRight');
        break;
      case 3:
        trigger.focus();
        pressModelMenuKey(trigger, 'Enter', 'Enter');
        break;
    }
  };

  const openModelVersionSubmenuFromState = (state, done = () => { }) => {
    if (!state?.main || state.submenuOpen) return done();

    const trigger = state.submenuTrigger;
    if (!trigger) return done();

    let polls = 0;
    const tick = () => {
      const nextState = getVisibleModelMenuState();
      if (nextState.submenuOpen || trigger.getAttribute('aria-expanded') === 'true') {
        setTimeout(() => window.__mp_applyHints?.(), 25);
        return done();
      }

      tryOpenModelVersionSubmenu(trigger, polls);

      if (polls++ > 60) return done();
      setTimeout(tick, 30);
    };
    tick();
  };

  // Runtime bridge: keyboard dispatcher opens current single-level menus and older submenu layouts.
  window.toggleModelSelector = () => {
    const btn = getModelMenuButton();
    if (!btn) return;

    waitForModelMenuOpen(btn, (state) => {
      const readyState = state || getVisibleModelMenuState();
      if (!readyState.submenuTrigger) return;
      setTimeout(
        () => openModelVersionSubmenuFromState(getVisibleModelMenuState()),
        40,
      );
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
      // Runtime bridge: overlay and shortcuts share the latest scraped model catalog.
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
          if (el && hasVisibleComputedStyle(el)) return true;
        }
        return false;
      }
      // Overlay detection only needs computed visibility, not viewport or composer bounds.
      function hasVisibleComputedStyle(el) {
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

      // Feature-owned override for the early runtime bridge above. Keep timing/state local here.
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
  const OVERLAY_MODEL_GRID_CSS = `
.model-picker-shortcut-grid,
.model-picker-effort-shortcut-grid,
.model-picker-effort-label-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 4px;
}
.model-picker-shortcut-grid {
  grid-auto-flow: row;
  grid-auto-rows: auto;
  margin-bottom: 0;
  overflow: hidden;
  padding: 8px 0 0;
  font-size: 80%;
  box-sizing: border-box;
  background: transparent;
}
.model-picker-shortcut-grid > .shortcut-item:nth-child(n+16) {
  display: none;
}
.model-picker-shortcut-grid .shortcut-item,
.model-picker-effort-shortcut-grid > .shortcut-item {
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  transition: box-shadow 0.12s;
  padding: 0.55rem 0.35rem;
  min-width: 0;
  min-height: 3.35rem;
  text-align: center;
}
.model-picker-shortcut-grid .shortcut-label,
.model-picker-effort-shortcut-grid .shortcut-label {
  width: 100%;
  min-width: 0;
  margin: 0 0 10px;
  color: var(--text-primary);
  font-size: 0.82rem;
  font-weight: 400;
  line-height: 1.15;
  text-align: center;
}
.model-picker-shortcut-grid .mp-label,
.model-picker-effort-shortcut-grid .mp-effort-display-label {
  display: block;
  overflow-wrap: anywhere;
  text-align: center;
  text-wrap: balance;
}
.model-picker-shortcut-grid .mp-label {
  font-size: 0.9em;
}
.model-picker-shortcut-grid .shortcut-keys,
.model-picker-effort-shortcut-grid .shortcut-keys {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 0;
  color: var(--text-secondary);
}
.model-picker-shortcut-grid .key-text,
.model-picker-shortcut-grid .platform-alt-label,
.model-picker-effort-shortcut-grid .key-text,
.model-picker-effort-shortcut-grid .platform-alt-label {
  flex: 0 0 auto;
  font-size: 0.76rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  color: var(--text-primary);
}
.model-picker-shortcut-grid .key-input,
.model-picker-effort-shortcut-grid .key-input {
  width: 2.55rem;
  min-width: 0;
  height: 1.8rem;
  border: 1px solid var(--border-light);
  border-radius: 9999px;
  text-align: center;
  font-size: 0.9rem;
  font-weight: 700;
  background-color: var(--bg-primary);
  color: var(--text-secondary);
  pointer-events: none;
  margin-left: 2px;
  margin-right: 2px;
}
.model-picker-effort-label-row {
  margin: 1.5em 0 0.5em;
}
.model-picker-effort-label-row .mp-subsection-label {
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  min-height: 0;
  margin: 0;
  padding: 0 0 0 2px;
  color: rgba(60, 60, 67, 0.6);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
}
.model-picker-effort-label {
  grid-column: 1 / 5;
}
.model-picker-pro-effort-label {
  grid-column: 5 / 7;
}
.model-picker-pro-effort-label[hidden] {
  display: none !important;
}
.model-picker-effort-label-row .model-picker-effort-label,
.model-picker-effort-label-row .model-picker-pro-effort-label {
  margin-left: 1em;
}
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

  const isMacPlatform = () => {
    const ua = navigator.userAgent || '';
    const plat = navigator.platform || '';
    const uaDataPlat = navigator.userAgentData?.platform ?? '';
    return /Mac/i.test(plat) || /Mac/i.test(ua) || /mac/i.test(uaDataPlat);
  };

  const CONTROL_MODIFIER_SHORTCUT_KEYS = new Set([
    'shortcutKeyClickSendButton',
    'shortcutKeyClickStopButton',
  ]);

  const shortcutModifierLabel = (key) =>
    CONTROL_MODIFIER_SHORTCUT_KEYS.has(key)
      ? `${isMacPlatform() ? 'Command' : 'Control'} + `
      : 'Alt + ';

  const EFFORT_SHORTCUT_LAYOUT = [
    {
      key: 'shortcutKeyThinkingLight',
      labelHtml: 'Thinking<br>Light',
      optionKind: 'thinking',
      optionId: 'thinking-light',
      column: 1,
    },
    {
      key: 'shortcutKeyThinkingStandard',
      labelHtml: 'Thinking<br>Standard',
      optionKind: 'thinking',
      optionId: 'thinking-standard',
      column: 2,
    },
    {
      key: 'shortcutKeyThinkingExtended',
      labelHtml: 'Thinking<br>Extended',
      optionKind: 'thinking',
      optionId: 'thinking-extended',
      column: 3,
    },
    {
      key: 'shortcutKeyThinkingHeavy',
      labelHtml: 'Thinking<br>Heavy',
      optionKind: 'thinking',
      optionId: 'thinking-heavy',
      column: 4,
    },
    {
      key: 'shortcutKeyProStandard',
      labelHtml: 'Pro<br>Standard',
      optionKind: 'pro',
      optionId: 'pro-standard',
      column: 5,
    },
    {
      key: 'shortcutKeyProExtended',
      labelHtml: 'Pro<br>Extended',
      optionKind: 'pro',
      optionId: 'pro-extended',
      column: 6,
    },
  ];
  const EFFORT_SHORTCUT_KEY_SET = new Set(EFFORT_SHORTCUT_LAYOUT.map((item) => item.key));

  // Platform-aware key display
  function displayFromCode(code) {
    if (!code || code === '' || code === '\u00A0') return '\u00A0';

    const isMac = isMacPlatform();

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

  const isEffortShortcutVisibleInCatalog = (key, catalog) => {
    const effort = EFFORT_SHORTCUT_LAYOUT.find((item) => item.key === key);
    if (!effort) return true;
    if (effort.optionKind === 'pro') {
      return typeof window.ModelLabels?.hasProFrontendOption === 'function'
        ? window.ModelLabels.hasProFrontendOption(catalog || null)
        : false;
    }
    const option =
      typeof window.ModelLabels?.getThinkingShortcutByStorageKey === 'function'
        ? window.ModelLabels.getThinkingShortcutByStorageKey(key)
        : null;
    if (!option?.optional) return true;
    return typeof window.ModelLabels?.hasThinkingEffortOption === 'function'
      ? window.ModelLabels.hasThinkingEffortOption(catalog || null, option.id || effort.optionId)
      : false;
  };

  const getOverlayModelSlotLimit = () => window.ModelLabels?.MAX_SLOTS || 15;

  const getOverlayActiveModelConfigId = (cfg) =>
    typeof window.ModelLabels?.normalizeActiveConfigId === 'function'
      ? window.ModelLabels.normalizeActiveConfigId(cfg?.activeModelConfigId)
      : cfg?.activeModelConfigId || 'configure-latest';

  const getOverlayModelNames = () =>
    typeof window.ModelLabels?.resolveActionableNames === 'function'
      ? window.ModelLabels.resolveActionableNames(window.MODEL_NAMES || [])
      : window.MODEL_NAMES || [];

  const getOverlayModelActionGroups = (activeModelConfigId, names, catalog) =>
    typeof window.ModelLabels?.getPopupPresentationGroups === 'function'
      ? window.ModelLabels.getPopupPresentationGroups(activeModelConfigId, names, catalog || null)
      : typeof window.ModelLabels?.getPresentationGroups === 'function'
        ? window.ModelLabels.getPresentationGroups(activeModelConfigId, names)
        : typeof window.ModelLabels?.getActionGroups === 'function'
          ? window.ModelLabels.getActionGroups()
          : [];

  const getOverlayModelKeyCodes = () => {
    const maxSlots = getOverlayModelSlotLimit();
    const codes =
      Array.isArray(window.__modelPickerKeyCodes) && window.__modelPickerKeyCodes.length
        ? window.__modelPickerKeyCodes.slice(0, maxSlots)
        : typeof window.ModelLabels?.defaultKeyCodes === 'function'
          ? window.ModelLabels.defaultKeyCodes().slice(0, maxSlots)
          : [];
    while (codes.length < maxSlots) codes.push('');
    return codes;
  };

  const getOverlayGroupLabel = (group) => {
    const key = group?.labelI18nKey || '';
    const localized = key ? getMessage(key, '') : '';
    return localized || group?.label || '';
  };

  const getOverlayModelPickerModifierLabel = (cfg) => {
    const useCtrl = !!cfg?.useControlForModelSwitcherRadio;
    if (!useCtrl) return isMacPlatform() ? 'Opt ⌥ ' : 'Alt + ';
    return isMacPlatform() ? 'Command + ' : 'Ctrl + ';
  };

  const buildShortcutOverlayModelPickerRow = (action, group, context) => {
    const { activeModelConfigId, codes, modifierLabel, names } = context;
    const label = escapeHtml(action.label || names[action.slot] || '');
    const value = displayFromCode(codes[action.slot]);
    const activeClass =
      group.id === 'configure' && action.id === activeModelConfigId
        ? ' mp-configure-item mp-configure-item-active'
        : group.id === 'configure'
          ? ' mp-configure-item'
          : '';

    return `
      <div class="shortcut-item${activeClass}">
        <div class="shortcut-label"><span class="mp-label">${label}</span></div>
        <div class="shortcut-keys">
          <span class="key-text platform-alt-label">${modifierLabel}</span>
          <input class="key-input" disabled maxlength="12" value="${value}" />
        </div>
      </div>
    `;
  };

  function buildShortcutOverlayModelPickerGrid(cfg) {
    const activeModelConfigId = getOverlayActiveModelConfigId(cfg);
    const names = getOverlayModelNames();
    const actionGroups = getOverlayModelActionGroups(
      activeModelConfigId,
      names,
      cfg?.modelCatalog || null,
    );
    const codes = getOverlayModelKeyCodes();
    const modifierLabel = getOverlayModelPickerModifierLabel(cfg);
    const rowContext = { activeModelConfigId, codes, modifierLabel, names };

    const groupMarkup = actionGroups
      .map((group) => {
        const rows = (group.actions || [])
          .filter((action) => isAssigned(codes[action.slot]))
          .map((action) => buildShortcutOverlayModelPickerRow(action, group, rowContext));

        if (!rows.length) return '';

        const groupLabel = getOverlayGroupLabel(group);
        const heading =
          group.compactLabel && groupLabel
            ? `<div class="blank-row section-header" role="heading" aria-level="2">${escapeHtml(groupLabel)}</div>`
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
  Effort
</div>
${groupMarkup.join('')}`;
  }

  // ---- 3) Build overlay HTML (sections similar to popup, but only assigned shortcuts) ----
  const buildShortcutOverlayHtml = (cfg) => {
    const schemaSections = window.CSP_SETTINGS_SCHEMA?.shortcuts?.overlaySections;
    const isShortcutVisibleInCatalog = (key) => {
      if (EFFORT_SHORTCUT_KEY_SET.has(key)) {
        return isEffortShortcutVisibleInCatalog(key, cfg?.modelCatalog || null);
      }
      const option =
        typeof window.ModelLabels?.getThinkingShortcutByStorageKey === 'function'
          ? window.ModelLabels.getThinkingShortcutByStorageKey(key)
          : null;
      if (option?.optional) {
        return typeof window.ModelLabels?.hasThinkingEffortOption === 'function'
          ? window.ModelLabels.hasThinkingEffortOption(cfg?.modelCatalog || null, option.id)
          : false;
      }
      const proOption =
        typeof window.ModelLabels?.getProThinkingShortcutByStorageKey === 'function'
          ? window.ModelLabels.getProThinkingShortcutByStorageKey(key)
          : null;
      if (proOption?.optional) {
        return typeof window.ModelLabels?.hasProFrontendOption === 'function'
          ? window.ModelLabels.hasProFrontendOption(cfg?.modelCatalog || null)
          : false;
      }
      return true;
    };
    const labelI18nByKey = window.CSP_SETTINGS_SCHEMA?.shortcuts?.labelI18nByKey || {};
    const renderedKeys = new Set();
    const labelForKey = (k) => {
      const i18nKey = labelI18nByKey[k];
      const msg = getMessage(i18nKey, '');
      return msg || keyToLabel(k);
    };
    const buildEffortShortcutGrid = () => {
      const visibleEffortRows = EFFORT_SHORTCUT_LAYOUT.filter((item) =>
        isShortcutVisibleInCatalog(item.key),
      ).filter((item) => isAssigned(cfg?.[item.key]));

      if (!visibleEffortRows.length) return '';

      visibleEffortRows.forEach((item) => {
        renderedKeys.add(item.key);
      });
      const thinkingEffortRows = visibleEffortRows
        .filter((item) => item.optionKind === 'thinking')
        .map((item, index) => ({ ...item, column: index + 1 }));
      const proEffortRows = visibleEffortRows
        .filter((item) => item.optionKind === 'pro')
        .map((item, index) => ({ ...item, column: index + 5 }));
      const hasProEffort = proEffortRows.length > 0;
      const rowMarkup = [...thinkingEffortRows, ...proEffortRows].map((item) => {
        const itemClass =
          item.optionKind === 'pro' ? ' mp-pro-effort-item' : ' mp-thinking-effort-item';
        const dataAttr =
          item.optionKind === 'pro'
            ? ` data-pro-option-id="${escapeHtml(item.optionId)}"`
            : ` data-thinking-option-id="${escapeHtml(item.optionId)}"`;
        return `
      <div class="shortcut-item${itemClass}"${dataAttr} style="grid-column:${item.column};">
        <div class="shortcut-label">
          <span class="mp-effort-display-label">${item.labelHtml}</span>
        </div>
        <div class="shortcut-keys">
          <span class="key-text platform-alt-label">${shortcutModifierLabel(item.key)}</span>
          <input class="key-input" disabled id="${item.key}" maxlength="12" value="${displayFromCode(cfg[item.key])}" />
        </div>
      </div>`;
      });

      return `
<section class="model-picker-effort-grid" aria-labelledby="model-picker-effort-heading">
  <div class="model-picker-effort-label-row">
    <div id="model-picker-effort-heading" class="mp-subsection-label model-picker-effort-label" role="heading" aria-level="2">${escapeHtml(getMessage('label_popupEffort', 'Effort'))}</div>
    <div class="mp-subsection-label model-picker-pro-effort-label" role="heading" aria-level="2"${hasProEffort ? '' : ' hidden'}>${escapeHtml(getMessage('label_popupProEffort', 'Pro Effort'))}</div>
  </div>
  <div class="model-picker-effort-shortcut-grid" aria-label="Thinking effort shortcuts">
    ${rowMarkup.join('')}
  </div>
</section>`;
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
            'shortcutKeyProStandard',
            'shortcutKeyProExtended',
          ],
        },
        {
          header: 'Quick Clicks',
          keys: [
            'shortcutKeyNewConversation',
            'shortcutKeyActivateInput',
            'shortcutKeyToggleSidebar',
            'shortcutKeySearchConversationHistory',
            'shortcutKeyPreviousThread',
            'shortcutKeyNextThread',
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
            'shortcutKeyClickSendButton',
            'shortcutKeyClickStopButton',
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
            'shortcutKeyDeepResearch',
            'shortcutKeyAddPhotosFiles',
            'shortcutKeyThinkLonger',
          ],
        },
      ];

    const out = [];
    out.push(`<div class="shortcut-container">
    <h1 class="i18n" data-i18n="popup_title">ChatGPT Custom Shortcuts Pro</h1>
    ${buildShortcutOverlayModelPickerGrid(cfg)}
    ${buildEffortShortcutGrid()}
    <div class="shortcut-grid">`);

    for (const section of sections) {
      const rows = section.keys
        .filter((k) => !EFFORT_SHORTCUT_KEY_SET.has(k))
        .filter((k) => isShortcutVisibleInCatalog(k))
        .filter((k) => isAssigned(cfg?.[k]))
        .map((k) => {
          renderedKeys.add(k);
          const val = cfg[k];
          return `
          <div class="shortcut-item">
            <div class="shortcut-label"><span>${escapeHtml(labelForKey(k))}</span></div>
            <div class="shortcut-keys">
              <span class="key-text platform-alt-label">${shortcutModifierLabel(k)}</span>
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
      .filter((k) => !EFFORT_SHORTCUT_KEY_SET.has(k))
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
                <span class="key-text platform-alt-label">${shortcutModifierLabel(k)}</span>
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
    <style>${FULL_POPUP_CSS}${OVERLAY_MODEL_GRID_CSS}</style>
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
      ${buildShortcutOverlayHtml(cfg)}
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
          : ['Instant', 'Medium', '', '5.5', '', '', 'o3', 'High', '5.4', '5.3'];
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
            // Runtime bridge: shortcuts overlay reads hydrated model names/codes from the content scope.
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
