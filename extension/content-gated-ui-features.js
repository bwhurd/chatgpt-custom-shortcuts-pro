// ==================================================
// @note Click-to-copy inline code (gated by settings)
// ==================================================

(() => {
  const STYLE_ID = 'csp-inline-code-copy-style';
  const INLINE_CODE_SELECTOR = 'code, [data-markdown-copy="inline-code"]';
  const CODE_BLOCK_CONTENT_SELECTOR = 'pre code, pre [data-markdown-copy="inline-code"]';
  let styleEl = null;
  let listening = false;

  const ensureStyle = () => {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = `
      ${INLINE_CODE_SELECTOR} { cursor: pointer; }
      ${CODE_BLOCK_CONTENT_SELECTOR} { cursor: auto; }
    `;
    document.head.appendChild(styleEl);
  };

  const removeStyle = () => {
    styleEl?.remove();
    styleEl = null;
  };

  const onClick = (e) => {
    const el = e.target.closest(INLINE_CODE_SELECTOR);
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
  const isValidColor = (value) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

  const host = () => document.head || document.documentElement;

  const buildCSS = (lightColor, darkColor) => {
    const safeLightColor = isValidColor(lightColor) ? lightColor : DEFAULT_LIGHT_COLOR;
    const safeDarkColor = isValidColor(darkColor) ? darkColor : DEFAULT_DARK_COLOR;
    return `
      :root[data-theme="light"] b, :root[data-theme="light"] strong { color: ${safeLightColor} !important; }
      :root[data-theme="dark"] b, :root[data-theme="dark"] strong { color: ${safeDarkColor} !important; }
    `;
  };

  const enable = (lightColor, darkColor) => {
    const css = buildCSS(lightColor, darkColor);
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
    if (on === true) {
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
      apply(colorBoldTextEnabled, colorBoldTextLightColor, colorBoldTextDarkColor);
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
        apply(colorBoldTextEnabled, colorBoldTextLightColor, colorBoldTextDarkColor);
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
  const MASONRY_FLOW_ATTR = 'data-csp-library-pasted-masonry-flow';
  const LABEL_KEY = 'label_hide_pasted_library_files';
  const TOOLTIP_KEY = 'tt_hide_pasted_library_files';
  const PAGE_ROOT_SELECTOR =
    'main[data-app-shell-main-surface="browser"], [role="main"][data-app-shell-main-surface="browser"]';
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
    pageRoot: null,
    controlRefreshToken: 0,
    controlWriteToken: 0,
    shellObserver: null,
    shellObservationRoot: null,
    resultsObserver: null,
    resultsObservationRoot: null,
    cancelPendingWork: null,
  };

  const createCancellableDebounce = (fn, wait = 80) => {
    let timer = null;
    const schedule = (...args) => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        fn(...args);
      }, wait);
    };
    schedule.cancel = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    return schedule;
  };

  const isContextInvalidatedError = (err) =>
    /context invalidated/i.test(String(err?.message || err || '')) ||
    /Extension context invalidated/i.test(String(err?.message || err || ''));

  const markContextInvalidated = (err) => {
    if (state.contextInvalidated) return;
    state.contextInvalidated = true;
    state.onLibraryRoute = false;
    state.cancelPendingWork?.();
    console.warn(
      '[CSP] Hide Pasted Files disabled in this tab because the extension was reloaded. Refresh the page to re-enable it.',
      err,
    );
    try {
      state.controlRefreshToken += 1;
      state.shellObserver?.disconnect();
      state.shellObserver = null;
      state.shellObservationRoot = null;
      state.resultsObserver?.disconnect();
      state.resultsObserver = null;
      state.resultsObservationRoot = null;
      document.querySelectorAll(`[${CONTROL_ATTR}="true"]`).forEach((el) => {
        el.remove();
      });
      document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
        el.removeAttribute(HIDDEN_ATTR);
      });
      document.querySelectorAll(`[${MASONRY_FLOW_ATTR}]`).forEach((el) => {
        el.removeAttribute(MASONRY_FLOW_ATTR);
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

  const storageSetSync = (items, callback = () => {}) => {
    if (!isExtensionAlive()) {
      callback(false);
      return;
    }
    try {
      chrome.storage.sync.set(items, () => {
        if (!isExtensionAlive()) {
          callback(false);
          return;
        }
        const error = chrome.runtime.lastError;
        if (error) {
          if (isContextInvalidatedError(error)) markContextInvalidated(error);
          else console.warn('[CSP] Could not save Hide Pasted Files setting.', error);
          callback(false);
          return;
        }
        callback(true);
      });
    } catch (err) {
      if (isContextInvalidatedError(err)) {
        markContextInvalidated(err);
      } else {
        console.warn('[CSP] Could not save Hide Pasted Files setting.', err);
      }
      callback(false);
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

  const getPageRoot = () => {
    const shellRoots = document.querySelectorAll(PAGE_ROOT_SELECTOR);
    if (shellRoots.length === 1) return shellRoots[0];
    if (shellRoots.length > 1) return null;

    const semanticRoots = new Set(document.querySelectorAll('main, [role="main"]'));
    return semanticRoots.size === 1 ? semanticRoots.values().next().value : null;
  };

  const getShellObservationRoot = () => document.body || document.documentElement;

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
    const pageRoot = getPageRoot();
    if (!(pageRoot instanceof Element) || !pageRoot.isConnected) return null;

    const menuButtons = Array.from(pageRoot.querySelectorAll('button[aria-haspopup="menu"]'));
    const hasFilterIcon = (button) =>
      Array.from(button.querySelectorAll('svg use')).some((use) => {
        const href =
          use.getAttribute('href') ||
          use.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
          '';
        const fragment = href.slice(href.lastIndexOf('#') + 1);
        return /^filter(?:-|$)/i.test(fragment);
      });
    const preferredButtons = menuButtons.filter(hasFilterIcon);
    const candidates = preferredButtons.length === 1 ? preferredButtons : menuButtons;
    const anchors = candidates
      .map((filterButton) => {
        const actionGroup = findActionGroup(filterButton, pageRoot);
        return actionGroup ? { pageRoot, actionGroup, filterButton } : null;
      })
      .filter(Boolean);

    return anchors.length === 1 ? anchors[0] : null;
  };

  const sameControlAnchor = (left, right) =>
    !!left &&
    !!right &&
    left.pageRoot === right.pageRoot &&
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

[${MASONRY_FLOW_ATTR}] {
  height: auto !important;
  grid-auto-flow: row !important;
}

[${MASONRY_FLOW_ATTR}] > [data-masonry-item] {
  grid-area: auto !important;
  transform: none !important;
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

  const setAttributeIfChanged = (element, name, value) => {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  };

  const updateControlState = () => {
    const control = getControlNode();
    if (!(control instanceof Element)) return;

    const button = control.querySelector('[data-csp-library-pasted-button="true"]');
    if (button instanceof HTMLButtonElement) {
      setAttributeIfChanged(button, 'aria-label', getTooltipText());
      setAttributeIfChanged(button, 'aria-pressed', state.enabled ? 'true' : 'false');
      setAttributeIfChanged(button, 'title', getTooltipText());
    }

    const label = control.querySelector('[data-csp-library-pasted-label="true"]');
    if (label && label.textContent !== getLabelText()) label.textContent = getLabelText();

    const icon = control.querySelector('[data-csp-library-pasted-icon="true"]');
    if (icon instanceof HTMLElement) {
      const mode = state.enabled ? 'on' : 'off';
      if (icon.getAttribute('data-mode') !== mode) {
        icon.innerHTML = getIconMarkup(state.enabled);
        setAttributeIfChanged(icon, 'data-mode', mode);
      }
    }

    setAttributeIfChanged(control, 'title', getTooltipText());
  };

  const findActionGroup = (filterButton, pageRoot) => {
    if (!(filterButton instanceof HTMLElement) || !(pageRoot instanceof Element)) return null;

    const iconSymbol = (button) => {
      for (const use of button.querySelectorAll('svg use')) {
        const href =
          use.getAttribute('href') ||
          use.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
          '';
        const fragment = href.slice(href.lastIndexOf('#') + 1);
        if (fragment) return fragment.toLocaleLowerCase();
      }
      return '';
    };
    const isGridView = (button) => /^square-grid(?:-|$)/i.test(iconSymbol(button));
    const isListView = (button) => /^list-bullet(?:-|$)/i.test(iconSymbol(button));

    for (
      let candidate = filterButton.parentElement;
      candidate;
      candidate = candidate.parentElement
    ) {
      const menuButtons = Array.from(candidate.querySelectorAll('button[aria-haspopup="menu"]'));
      if (menuButtons.length !== 1 || menuButtons[0] !== filterButton) {
        if (candidate === pageRoot) break;
        continue;
      }

      const viewButtons = Array.from(candidate.querySelectorAll('button[aria-pressed]')).filter(
        (button) => !button.closest(`[${CONTROL_ATTR}="true"]`),
      );
      if (
        viewButtons.length === 2 &&
        viewButtons.some(isGridView) &&
        viewButtons.some(isListView)
      ) {
        return candidate;
      }

      if (candidate === pageRoot) break;
    }

    return null;
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
    button.setAttribute('aria-pressed', state.enabled ? 'true' : 'false');
    button.addEventListener('click', () => {
      const previousEnabled = state.enabled;
      const nextEnabled = !state.enabled;
      setEnabled(nextEnabled);
      const writeToken = (state.controlWriteToken || 0) + 1;
      state.controlWriteToken = writeToken;
      storageSetSync({ [STORAGE_KEY]: nextEnabled }, (saved) => {
        if (!saved && !state.contextInvalidated && state.controlWriteToken === writeToken) {
          setEnabled(previousEnabled);
        }
      });
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

  const getLibraryItemFilename = (itemRoot) => {
    const nameCell = itemRoot.querySelector('[data-library-column="name"]');
    if (nameCell) {
      const nameButton = nameCell.querySelector('button[aria-label]');
      const row = nameCell.closest('[role="row"][aria-label]');
      const filename = nameButton?.getAttribute('aria-label') || row?.getAttribute('aria-label');
      if (filename) return filename.trim();
      return readText(nameCell);
    }

    const openButtons = Array.from(itemRoot.querySelectorAll('button[aria-label]')).filter(
      (button) => !button.hasAttribute('aria-haspopup') && !button.hasAttribute('role'),
    );
    if (openButtons.length !== 1) return '';

    return openButtons[0].getAttribute('aria-label')?.trim() || readText(openButtons[0]);
  };

  const collectLibraryItems = () => {
    const root = getPageRoot();
    if (!(root instanceof Element)) return [];

    const out = [];
    const seen = new Set();

    root
      .querySelectorAll('[data-library-item][data-library-selection-id^="libfile_"]')
      .forEach((itemRoot) => {
        if (!(itemRoot instanceof HTMLElement) || seen.has(itemRoot)) return;

        seen.add(itemRoot);
        out.push({
          itemRoot,
          filename: getLibraryItemFilename(itemRoot),
          isListItem: !!itemRoot.querySelector('[data-library-column="name"]'),
        });
      });

    return out;
  };

  const restoreHiddenItems = () => {
    document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
      el.removeAttribute(HIDDEN_ATTR);
    });
    document.querySelectorAll(`[${MASONRY_FLOW_ATTR}]`).forEach((el) => {
      el.removeAttribute(MASONRY_FLOW_ATTR);
    });
  };

  const applyLibraryFilter = () => {
    if (!state.onLibraryRoute) {
      restoreHiddenItems();
      return;
    }

    if (!state.enabled) {
      restoreHiddenItems();
      return;
    }

    const items = collectLibraryItems();
    const hiddenGridParents = new Set();
    const currentTargets = new Set();

    // Hide existing Library nodes. In grid view, also remove the masonry slot
    // and temporarily let CSS Grid auto-place the remaining cards.
    items.forEach(({ itemRoot, filename, isListItem }) => {
      const isPastedFile = filename && shouldHideFilename(filename);
      const masonryItem = itemRoot.parentElement?.matches('[data-masonry-item^="file:"]')
        ? itemRoot.parentElement
        : null;
      if (!isListItem && !masonryItem) {
        itemRoot.removeAttribute(HIDDEN_ATTR);
        return;
      }

      const target = isListItem ? itemRoot : masonryItem;
      currentTargets.add(target);

      if (!isPastedFile) {
        target.removeAttribute(HIDDEN_ATTR);
        return;
      }

      target.setAttribute(HIDDEN_ATTR, '');
      if (masonryItem?.parentElement) hiddenGridParents.add(masonryItem.parentElement);
    });

    // Clear marks from nodes no longer recognized as files (including items
    // whose name changed while the setting stayed enabled).
    document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((target) => {
      if (!currentTargets.has(target)) target.removeAttribute(HIDDEN_ATTR);
    });

    document.querySelectorAll(`[${MASONRY_FLOW_ATTR}]`).forEach((parent) => {
      if (!hiddenGridParents.has(parent)) parent.removeAttribute(MASONRY_FLOW_ATTR);
    });
    hiddenGridParents.forEach((parent) => {
      parent.setAttribute(MASONRY_FLOW_ATTR, '');
    });
  };

  const runControlRefresh = createCancellableDebounce((requestToken) => {
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

  const scheduleFilterRefresh = createCancellableDebounce(() => {
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
    if (!state.onLibraryRoute || !state.enabled) {
      teardownResultsObserver();
      return;
    }

    const root = getPageRoot();
    if (!(root instanceof Node)) {
      teardownResultsObserver();
      return;
    }
    if (state.resultsObserver && state.resultsObservationRoot === root) return;

    teardownResultsObserver();

    state.resultsObserver = new MutationObserver((mutations) => {
      if (!state.onLibraryRoute || !state.enabled || !mutations.length) return;
      const nodeContainsLibraryItem = (node) =>
        node instanceof Element &&
        (node.matches('[data-library-item]') ||
          !!node.closest('[data-library-item]') ||
          !!node.querySelector('[data-library-item]'));
      const hasRelevantMutation = mutations.some((mutation) => {
        const target =
          mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        if (target?.closest('[data-library-item]')) return true;
        if (mutation.type !== 'childList') return false;
        return [...mutation.addedNodes, ...mutation.removedNodes].some(nodeContainsLibraryItem);
      });
      if (hasRelevantMutation) scheduleFilterRefresh();
    });

    state.resultsObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'data-library-selection-id'],
    });
    state.resultsObservationRoot = root;
  };

  const teardownShellObserver = () => {
    state.shellObserver?.disconnect();
    state.shellObserver = null;
    state.shellObservationRoot = null;
  };

  const ensureShellObserver = () => {
    if (!state.onLibraryRoute) return;

    const root = getShellObservationRoot();
    if (!(root instanceof Node)) return;
    if (state.shellObserver && state.shellObservationRoot === root) return;

    teardownShellObserver();

    state.shellObserver = new MutationObserver((mutations) => {
      if (state.contextInvalidated || !mutations.length) return;
      if (!isLibraryRoute()) {
        kickRouteRefresh();
        return;
      }

      const pageRoot = getPageRoot();
      if (pageRoot !== state.pageRoot) {
        kickRouteRefresh();
        return;
      }

      const anchor = getControlAnchor();
      const control = getControlNode();
      if (!anchor) {
        control?.remove();
        return;
      }
      if (
        !control ||
        control.parentElement !== anchor.actionGroup ||
        control.nextElementSibling !== anchor.filterButton
      ) {
        scheduleControlRefresh();
      }
    });

    state.shellObserver.observe(root, { childList: true, subtree: true });
    state.shellObservationRoot = root;
  };

  const teardownLibraryRoute = () => {
    state.onLibraryRoute = false;
    state.pageRoot = null;
    state.controlRefreshToken += 1;
    state.cancelPendingWork?.();
    teardownShellObserver();
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
    state.pageRoot = getPageRoot();
    ensureStyle();
    ensureShellObserver();

    if (state.enabled) {
      applyLibraryFilter();
      ensureResultsObserver();
    } else {
      teardownResultsObserver();
      restoreHiddenItems();
    }

    const anchor = getControlAnchor();
    const control = getControlNode();
    if (!anchor) {
      control?.remove();
    } else if (
      !control ||
      control.parentElement !== anchor.actionGroup ||
      control.nextElementSibling !== anchor.filterButton
    ) {
      scheduleControlRefresh();
    }
  };

  const scheduleRouteRefresh = createCancellableDebounce(refreshRouteState, 40);
  state.cancelPendingWork = () => {
    runControlRefresh.cancel();
    scheduleFilterRefresh.cancel();
    scheduleRouteRefresh.cancel();
  };

  const kickRouteRefresh = () => {
    if (state.contextInvalidated) return;
    scheduleRouteRefresh();
  };

  const setEnabled = (enabled) => {
    state.enabled = enabled === true;
    window[STORAGE_KEY] = state.enabled;
    updateControlState();

    if (!state.onLibraryRoute) return;

    if (!state.enabled) {
      scheduleFilterRefresh.cancel();
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
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const navigationControl = target.closest(
        'nav button, nav a[href], [role="navigation"] button, [role="navigation"] a[href]',
      );
      const anchor = target.closest('a[href]');
      let targetsLibrary = false;
      if (anchor instanceof HTMLAnchorElement) {
        try {
          const targetPath = new URL(anchor.href, location.origin).pathname || '';
          targetsLibrary = targetPath === '/library' || targetPath.startsWith('/library/');
        } catch {}
      }
      if (!navigationControl && !targetsLibrary && !state.onLibraryRoute) return;

      kickRouteRefresh();
    },
    { capture: true },
  );

  try {
    window.navigation?.addEventListener('navigate', kickRouteRefresh);
  } catch {}
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
      state.controlWriteToken += 1;
      setEnabled(changes[STORAGE_KEY]?.newValue === true);
      kickRouteRefresh();
    });
  } catch (err) {
    if (isContextInvalidatedError(err)) {
      markContextInvalidated(err);
    }
  }
})();
