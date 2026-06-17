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
      return (
        !state.contextInvalidated &&
        !!chrome?.runtime?.id &&
        !!chrome?.storage?.sync &&
        !!chrome?.storage?.local
      );
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
    return (
      hostname === 'chatgpt.com' && (pathname === '/library' || pathname.startsWith('/library/'))
    );
  };

  const normalizeFilenameText = (value) =>
    String(value || '')
      .normalize('NFKC')
      .toLocaleLowerCase();
  const shouldHideFilename = (name) => {
    const normalizedName = normalizeFilenameText(name);
    return HIDE_FILENAME_TOKENS.some((token) =>
      normalizedName.includes(normalizeFilenameText(token)),
    );
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

  const getBridgeFileRoot = (bridgeButton) =>
    bridgeButton.closest('[data-page-table-selectable-row="true"]') ||
    bridgeButton.closest('[role="button"]');

  const collectLibraryItems = () => {
    const root = getPageRoot();
    if (!(root instanceof Element)) return [];

    const out = [];
    const seen = new Set();

    root
      .querySelectorAll('[data-testid^="artifact-card-title-container-"]')
      .forEach((titleContainer) => {
        const button = titleContainer.closest('button[type="button"]');
        const itemRoot = button?.parentElement;
        if (!(itemRoot instanceof HTMLElement) || seen.has(itemRoot)) return;

        seen.add(itemRoot);
        out.push({
          itemRoot,
          filename: readText(titleContainer.querySelector('span') || titleContainer),
        });
      });

    root
      .querySelectorAll('button[data-testid^="artifact-checkbox-bridge-file_"]')
      .forEach((bridgeButton) => {
        const itemRoot = getBridgeFileRoot(bridgeButton);
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
      const touchesTopControls = mutations.some((mutation) => {
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
      });

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

      if (
        !state.onLibraryRoute &&
        targetPath !== '/library' &&
        !targetPath.startsWith('/library/')
      ) {
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
