document.addEventListener('DOMContentLoaded', () => {
  // Localize the title dynamically
  const titleElement = document.querySelector('title');
  const localizedTitle = chrome.i18n.getMessage('popup_title');
  if (titleElement && localizedTitle) {
    titleElement.textContent = localizedTitle;
  }

  function getModelPickerModifier() {
    // Prefer DOM state (instant), fallback to storage defaults if needed
    const ctrlEl = document.getElementById('useControlForModelSwitcherRadio');
    const altEl = document.getElementById('useAltForModelSwitcherRadio');
    if (ctrlEl?.checked) return 'ctrl';
    if (altEl?.checked) return 'alt';
    // Fallback: assume alt if radios not present yet
    return 'alt';
  }

  // === Unified shortcut helpers (REPLACES 555) ================================

  function sep_storageToUI(str) {
    // Converts real newlines to literal \n for display in the input
    return typeof str === 'string' ? str.replace(/\n/g, '\\n') : str;
  }
  function sep_UItoStorage(str) {
    // Converts displayed literal \n back to real newlines for storage/export
    return typeof str === 'string' ? str.replace(/\\n/g, '\n') : str;
  }

  // Source of truth for the 10 model-picker slots if storage is empty
  const DEFAULT_MODEL_PICKER_KEY_CODES = [
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

  // Preference: auto-overwrite on duplicate?
  const prefs = { autoOverwrite: false };
  chrome.storage.sync.get('autoOverwrite', (d) => {
    prefs.autoOverwrite = !!d.autoOverwrite;
  });
  // expose to 333
  window.prefs = prefs;

  // Display helper used by chips and hints (platform-aware)
  // Letters are deliberately shown in lowercase for chips and modals.
  function displayFromCode(code) {
    if (!code || code === '' || code === '\u00A0') return '\u00A0';

    // Robust Mac detection (works in Chrome extensions)
    const isMac = (() => {
      const ua = navigator.userAgent || '';
      const plat = navigator.platform || '';
      const uaDataPlat = navigator.userAgentData?.platform ?? '';
      return /Mac/i.test(plat) || /Mac/i.test(ua) || /mac/i.test(uaDataPlat);
    })();

    // Letters → lowercase
    if (/^Key([A-Z])$/.test(code)) return code.slice(-1).toLowerCase();

    // Numbers (row + numpad)
    if (/^Digit([0-9])$/.test(code)) return code.slice(-1);
    if (/^Numpad([0-9])$/.test(code)) return code.slice(-1);

    // Function keys F1–F24
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;

    // Punctuation / common physical keys
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

      // Navigation / whitespace
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

      // International (safe English approximations)
      IntlBackslash: '\\',
      IntlYen: '¥',
      IntlRo: 'ro',
      Lang1: 'lang1',
      Lang2: 'lang2',
      Lang3: 'lang3',
      Lang4: 'lang4',
      Lang5: 'lang5',

      // Media
      VolumeMute: 'Mute',
      VolumeDown: 'Vol–',
      VolumeUp: 'Vol+',
      MediaPlayPause: 'Play/Pause',
      MediaTrackNext: 'Next',
      MediaTrackPrevious: 'Prev',
    };

    // Modifiers, platform-accurate labels
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

    // Fallback: humanize the raw code (e.g., "IntlBackslash" → "Intl Backslash")
    return code.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  // Treat DigitX and NumpadX as equivalent
  function codeEquals(a, b) {
    if (a === b) return true;
    const A = a?.match(/^(Digit|Numpad)([0-9])$/);
    const B = b?.match(/^(Digit|Numpad)([0-9])$/);
    const dA = A?.[2];
    const dB = B?.[2];
    return dA !== undefined && dA === dB;
  }

  // Convert single-character popup input to KeyboardEvent.code
  function charToCode(ch) {
    if (!ch) return '';
    const raw = ch.trim();
    if (!raw) return '';
    const upper = raw.toUpperCase();
    if (/^[A-Z]$/.test(upper)) return `Key${upper}`;
    if (/^[0-9]$/.test(raw)) return `Digit${raw}`;
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
        return ''; // unsupported single char here
    }
  }

  // ---------- Existing helpers (kept) ----------

  // Get current value for every shortcut input (raw text), used by older code paths

  // New: get current KeyboardEvent.code for each popup input (prefers dataset, falls back to char→code)

  function gatherPopupConflictsForModelSwitch(targetMode) {
    if (targetMode !== 'alt') return [];

    const owners = [];
    const seen = new Set();

    const modelCodes = window.ShortcutUtils.getModelPickerCodesCache(); // 10 codes

    // Prefer codes from dataset; fallback to char->code
    const popupCodes = {};
    shortcutKeys.forEach((id) => {
      const el = document.getElementById(id);
      let code = el?.dataset?.keyCode || '';
      if (!code) {
        const ch = (el?.value || '').trim();
        code = (window.ShortcutUtils?.charToCode || charToCode)(ch) || '';
      }
      popupCodes[id] = code;
    });

    Object.keys(popupCodes).forEach((id) => {
      const c2 = popupCodes[id];
      if (!c2) return;
      // Find which model slot this collides with (Digit/Numpad normalized)
      let collideIdx = -1;
      for (let i = 0; i < modelCodes.length; i++) {
        const mc = modelCodes[i];
        if (mc && window.ShortcutUtils.codeEquals(mc, c2)) {
          collideIdx = i;
          break;
        }
      }
      if (collideIdx === -1) return;

      const toLabel = window.MODEL_NAMES?.[collideIdx] ?? `Model slot ${collideIdx + 1}`;
      if (!seen.has(id)) {
        owners.push({
          type: 'shortcut',
          id,
          label: getShortcutLabelById(id),
          keyCode: c2,
          keyLabel: codeToDisplayChar(c2),
          targetLabel: toLabel,
        });
        seen.add(id);
      }
    });

    return owners;
  }

  // Reentrancy guard per-field to avoid double modals/saves
  window.__savingShortcutGuard = window.__savingShortcutGuard || Object.create(null);

  // Save a popup input value (char or code) with strict Alt+digit preflight vs chips
  function saveShortcutValue(id, value, fireInput = false) {
    if (window.__savingShortcutGuard[id]) return; // suppress re-entry
    window.__savingShortcutGuard[id] = true;

    const raw = value == null ? '' : String(value);
    const valToSave = raw === '' ? '\u00A0' : raw;

    // helper: clear guard safely
    const clearGuard = () => {
      window.__savingShortcutGuard[id] = false;
    };

    // helper: perform actual save + mirror UI + verify

    function commit(v) {
      chrome.storage.sync.set({ [id]: v }, () => {
        if (chrome.runtime?.lastError) {
          console.error('[saveShortcutValue] set error:', chrome.runtime.lastError);
          if (typeof showToast === 'function') {
            showToast(`Save failed: ${chrome.runtime.lastError.message ?? 'storage error'}`);
          }
          clearGuard();
          return;
        }

        const inp = document.getElementById(id);
        if (inp) {
          // Keep the actual KeyboardEvent.code on the element for robust conflict checks
          if (v === '\u00A0') {
            inp.dataset.keyCode = '';
            inp.value = '';
          } else {
            inp.dataset.keyCode = v;
            inp.value = codeToDisplayChar(v);
          }
          if (fireInput) inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        chrome.storage.sync.get(id, (data) => {
          const persisted = data && Object.hasOwn(data, id) ? data[id] : undefined;
          if (persisted !== v) {
            console.warn('[saveShortcutValue] verification mismatch', {
              expected: v,
              got: persisted,
            });
            typeof showToast === 'function' && showToast('Save did not persist. Trying again…');
            chrome.storage.sync.set({ [id]: v }, () => {
              if (chrome.runtime?.lastError) {
                console.error('[saveShortcutValue] retry error:', chrome.runtime.lastError);
                if (typeof showToast === 'function') {
                  showToast(`Save failed: ${chrome.runtime.lastError.message ?? 'storage error'}`);
                }
              }
              clearGuard();
            });
          } else {
            clearGuard();
          }
        });
      });
    }

    // clears are simple
    if (valToSave === '\u00A0') {
      commit(valToSave);
      return;
    }

    // normalize to code if needed
    const isCode =
      /^(Key|Digit|Numpad|Arrow|F\d{1,2}|Backspace|Enter|Escape|Tab|Space|Slash|Minus|Equal|Bracket|Semicolon|Quote|Comma|Period|Backslash)/i.test(
        valToSave,
      );
    const toCode = (s) =>
      window.ShortcutUtils?.charToCode
        ? window.ShortcutUtils.charToCode(s)
        : typeof charToCode === 'function'
          ? charToCode(s)
          : '';
    const code = isCode ? valToSave : raw.length === 1 ? toCode(raw) : '';

    // STRICT PREFLIGHT REMOVED (handled upstream)
    // We intentionally avoid prompting here to prevent double-modals.
    // All duplicate checks/overwrites are performed by the input handler
    // using ShortcutUtils.buildConflictsForCode and showDuplicateModal.
    // This function now focuses on committing the final, conflict-free value.

    // === Generic cross-system conflicts for non-digit / non-Alt cases ===
    if (code && typeof window.ShortcutUtils?.buildConflictsForCode === 'function') {
      const conflicts = window.ShortcutUtils.buildConflictsForCode(code, {
        type: 'shortcut',
        id,
      });
      if (conflicts.length) {
        if (window.prefs?.autoOverwrite && window.ShortcutUtils?.clearOwners) {
          return window.ShortcutUtils.clearOwners(conflicts, () => commit(valToSave));
        }
        const keyLabel = window.ShortcutUtils?.displayFromCode
          ? window.ShortcutUtils.displayFromCode(code)
          : code;
        const names = conflicts.map((c) => c.label).join(', ');
        const ask =
          window.showDuplicateModal ||
          ((o, cb) =>
            cb(window.confirm(`This key is assigned to ${o}. Assign here instead?`), false));
        ask(
          names,
          (yes, remember) => {
            if (!yes) {
              clearGuard();
              return;
            }
            if (remember) {
              window.prefs = window.prefs || {};
              window.prefs.autoOverwrite = true;
              chrome.storage.sync.set({ autoOverwrite: true });
            }
            if (window.ShortcutUtils?.clearOwners)
              window.ShortcutUtils.clearOwners(conflicts, () => commit(valToSave));
            else commit(valToSave);
          },
          {
            keyLabel,
            targetLabel: getShortcutLabelById(id),
            proceedText: 'Proceed with changes?',
          },
        );
        return;
      }
    }

    // no conflicts
    commit(valToSave);
  }
  window.saveShortcutValue = saveShortcutValue;

  // ---------- Dynamic model names for tooltips and picker UI (keeps variable names) ----------
  const MODEL_NAMES = [
    'GPT-5 Auto', // Slot 1
    'GPT-5 Instant', // Slot 2
    'GPT-5 mini', // Slot 3
    'GPT-5 Thinking', // Slot 4
    'GPT-5 Pro', // Slot 5
    'Legacy Models →', // Slot 6
    '4o', // Slot 7
    '4.1', // Slot 8
    'o3', // Slot 9
    'o4-mini', // Slot 0
  ];
  // Initialize global with defaults for instant UI
  window.MODEL_NAMES = MODEL_NAMES.slice();

  // Hydrate and keep in sync with storage-scraped labels (content.js)
  (function initModelNamesDynamic() {
    // Use the current defaults as a fallback if storage is missing any slots
    const fallbackTen = (window.MODEL_NAMES || []).slice(0, 10);

    function mergeWithFallback(incoming) {
      const in10 = Array.isArray(incoming) ? incoming.slice(0, 10) : [];
      return Array(10)
        .fill('')
        .map((_, i) => (in10[i] && String(in10[i]).trim()) || fallbackTen[i] || '');
    }

    function setAndRender(a10) {
      window.MODEL_NAMES = a10.slice(0, 10);
      if (typeof window.modelPickerRender === 'function') window.modelPickerRender();
      window.dispatchEvent(
        new CustomEvent('model-names-updated', { detail: { source: 'storage' } }),
      );
    }

    // Load latest from storage when popup opens
    try {
      chrome.storage.sync.get('modelNames', ({ modelNames }) => {
        setAndRender(mergeWithFallback(modelNames));
      });
    } catch (_) {
      setAndRender(fallbackTen);
    }

    // Update live if content saves new labels while popup is open
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.modelNames) return;
      setAndRender(mergeWithFallback(changes.modelNames.newValue));
    });
  })();

  // ---------- Unified registry for model-picker codes ----------
  function getModelPickerCodesCache() {
    const arr = Array.isArray(window.__modelPickerKeyCodes) ? window.__modelPickerKeyCodes : null;
    return arr && arr.length === 10 ? arr.slice(0, 10) : DEFAULT_MODEL_PICKER_KEY_CODES.slice();
  }

  function saveModelPickerKeyCodes(codes, cb) {
    window.__modelPickerKeyCodes = codes.slice(0, 10); // update cache first for snappy UI
    chrome.storage.sync.set({ modelPickerKeyCodes: window.__modelPickerKeyCodes }, () => {
      const err = chrome.runtime?.lastError;
      if (err) {
        console.error('[saveModelPickerKeyCodes] set error:', err);
        if (typeof showToast === 'function') {
          showToast(`Save failed: ${err.message || 'storage error'}`);
        }
        cb?.(false);
        return;
      }
      cb?.(true);
      // no need to fire onChanged here; we already updated local cache and UI calls render()
    });
  }

  /** Hydrate cache from storage and notify listeners once */
  function initModelPickerCodesCache() {
    if (window.__modelPickerHydrating) return window.__modelPickerHydrating;
    window.__modelPickerHydrating = new Promise((resolve) => {
      chrome.storage.sync.get('modelPickerKeyCodes', ({ modelPickerKeyCodes }) => {
        window.__modelPickerKeyCodes =
          Array.isArray(modelPickerKeyCodes) && modelPickerKeyCodes.length === 10
            ? modelPickerKeyCodes.slice(0, 10)
            : DEFAULT_MODEL_PICKER_KEY_CODES.slice();

        // Broadcast a one-time custom event so editors can render after hydration
        document.dispatchEvent(new CustomEvent('modelPickerHydrated'));
        resolve(window.__modelPickerKeyCodes);
      });
    });
    return window.__modelPickerHydrating;
  }
  initModelPickerCodesCache();

  // expose for 333
  window.saveModelPickerKeyCodes = saveModelPickerKeyCodes;

  // ---------- Cross-system conflict detection ----------
  function getShortcutLabelById(id) {
    const el = document.getElementById(id);
    if (!el) return id;
    const label = el
      .closest('.shortcut-item')
      ?.querySelector('.shortcut-label .i18n')
      ?.textContent?.trim();
    return label || id;
  }

  /**
   * Determine if a key code represents a collision in the current modifier domain.
   * Only blocks keys if the modifier matches.
   */

  /**
   * Build list of owners that conflict with `code`.
   * Rules:
   * - Model ↔ Model: always conflict.
   * - Popup ↔ Popup: always conflict.
   * - Model ↔ Popup: conflict only when model picker uses Alt (no conflict when using Control).
   * Digits on row and numpad are treated as equal.
   */
  function buildConflictsForCode(code, selfOwner) {
    const conflicts = [];
    const modelCodes = getModelPickerCodesCache();
    const MODEL_NAMES_SAFE = window.MODEL_NAMES || [];
    const modelMod =
      typeof getModelPickerModifier === 'function' ? getModelPickerModifier() : 'alt';
    const ownerType = selfOwner?.type ?? null;

    // 1) Model slots
    modelCodes.forEach((c, i) => {
      if (!c) return;
      const isSelfModel = ownerType === 'model' && selfOwner.idx === i;
      if (isSelfModel) return;

      if (codeEquals(c, code)) {
        if (ownerType === 'shortcut' && modelMod !== 'alt') return;
        conflicts.push({
          type: 'model',
          idx: i,
          label: MODEL_NAMES_SAFE[i] || `Model slot ${i + 1}`,
        });
      }
    });

    // 2) Popup inputs (read actual saved codes from dataset; fallback to char→code)
    const shouldCheckPopup = ownerType !== 'model' || modelMod === 'alt';
    if (shouldCheckPopup) {
      shortcutKeys.forEach((id) => {
        const el = document.getElementById(id);
        let c2 = el?.dataset?.keyCode || '';
        if (!c2) {
          const ch = (el?.value || '').trim();
          c2 = (window.ShortcutUtils?.charToCode || charToCode)(ch) || '';
        }
        if (!c2) return;

        const isSelfShortcut = ownerType === 'shortcut' && selfOwner.id === id;
        if (isSelfShortcut) return;

        if (codeEquals(c2, code)) {
          conflicts.push({
            type: 'shortcut',
            id,
            label: getShortcutLabelById(id),
          });
        }
      });
    }

    return conflicts;
  }

  /**
   * Clear all conflicting owners immediately in the UI and persist.
   * - Clears popup inputs without re-triggering their input handlers (avoids races)
   * - Clears model slots and saves the 10-slot array if touched
   */
  function clearOwners(owners, done) {
    const codes = getModelPickerCodesCache().slice(0, 10);
    let modelTouched = false;

    owners.forEach((o) => {
      if (o.type === 'shortcut') {
        // 1) Clear the visible field right away
        const inp = document.getElementById(o.id);
        if (inp) inp.value = '';

        // 2) Keep any local cache in sync (if present)
        try {
          if (typeof shortcutKeyValues === 'object' && o.id in shortcutKeyValues) {
            shortcutKeyValues[o.id] = '';
          }
        } catch (_) {}

        // 3) Persist to storage (NBSP) without firing input handler
        try {
          saveShortcutValue(o.id, '', false);
        } catch (_) {}
      } else if (o.type === 'model') {
        if (o.idx >= 0 && o.idx < codes.length) {
          codes[o.idx] = '';
          modelTouched = true;
        }
      }
    });

    const finish = () => {
      // Immediately re-render model chips after clearing, for instant UI update
      if (typeof window.modelPickerRender === 'function') window.modelPickerRender();
      if (typeof done === 'function') done();
    };

    if (modelTouched) {
      saveModelPickerKeyCodes(codes, finish);
    } else {
      finish();
    }
  }

  // Reuse the one duplicate modal defined in 222 earlier
  // expose it so 333 can use it

  // Bundle utils for 333
  window.ShortcutUtils = {
    displayFromCode,
    codeEquals,
    charToCode,
    buildConflictsForCode,
    clearOwners,
    getModelPickerCodesCache,
    saveModelPickerKeyCodes,
  };

  // Robust Mac detection (Chrome, Chromium, extension context)
  const isMac = (() => {
    const ua = navigator.userAgent ?? '';
    const plat = navigator.platform ?? '';
    const uaDataPlat = navigator.userAgentData?.platform ?? '';
    return /Mac/i.test(plat) || /Mac/i.test(ua) || /mac/i.test(uaDataPlat);
  })();

  // Flash highlight animation for newFeatureHighlightFlash div
  const highlightDiv = document.getElementById('newFeatureHighlightFlash');
  if (highlightDiv) {
    highlightDiv.classList.add('flash-highlight');
    setTimeout(() => {
      highlightDiv.classList.remove('flash-highlight');
    }, 3000);
  }

  // Replace shortcut labels for Mac
  const altLabel = isMac ? 'Opt ⌥' : 'Alt +';
  const ctrlLabel = isMac ? 'Command + ' : 'Control + ';
  document.querySelectorAll('.shortcut span, .key-text.platform-alt-label').forEach((span) => {
    if (span.textContent.includes('Alt +')) {
      span.textContent = altLabel;
    }
    if (span.textContent.includes('Ctrl +')) {
      span.textContent = ctrlLabel;
    }
  });

  // --- BEGIN TOAST QUEUE WITH GSAP SUPPORT ---

  let activeToast = null;
  let activeToastTimer = null;

  function showToast(message, duration = 3500) {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      Object.assign(toastContainer.style, {
        position: 'fixed',
        top: '1em',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: '10000',
        pointerEvents: 'none',
      });
      document.body.appendChild(toastContainer);
    }

    if (activeToast) {
      // Update message and reset timer; capture the current node for fade
      activeToast.innerHTML = message;
      clearTimeout(activeToastTimer);
      const target = activeToast; // capture stable reference
      activeToastTimer = setTimeout(() => {
        fadeOutToast(target, toastContainer);
      }, duration);
      return;
    }

    // Create new toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    Object.assign(toast.style, {
      background: 'rgba(0, 0, 0, 0.82)',
      color: 'white',
      padding: '10px 20px',
      borderRadius: '5px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.27)',
      maxWidth: '320px',
      width: 'auto',
      marginTop: '4px',
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      textAlign: 'center',
      opacity: '0',
      pointerEvents: 'auto',
    });

    toast.innerHTML = message;
    toastContainer.appendChild(toast);

    // Fade in
    const tweenIn = window.gsap?.to?.(toast, {
      opacity: 1,
      duration: 0.28,
      ease: 'power2.out',
    });
    if (!tweenIn) {
      toast.style.transition = 'opacity 0.28s';
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
      });
    }

    activeToast = toast;

    // Fade out after duration (capture stable reference)
    const target = toast;
    activeToastTimer = setTimeout(() => {
      fadeOutToast(target, toastContainer);
    }, duration);
  }

  function fadeOutToast(toast, toastContainer) {
    // Guard: toast may already be cleared or detached by another path
    if (!toast?.isConnected) {
      activeToast = null;
      if (toastContainer?.childElementCount === 0 && toastContainer?.isConnected) {
        toastContainer.remove();
      }
      return;
    }

    // Prevent double-fades on the same node
    if (toast.dataset.fading === '1') return;
    toast.dataset.fading = '1';

    const cleanup = () => {
      if (toast?.isConnected) toast.remove();
      if (toastContainer?.childElementCount === 0 && toastContainer?.isConnected) {
        toastContainer.remove();
      }
      activeToast = null;
    };

    if (window.gsap?.to) {
      window.gsap.to(toast, {
        opacity: 0,
        duration: 0.28,
        ease: 'power2.in',
        onComplete: cleanup,
      });
    } else {
      // Node may get removed mid-flight; recheck before touching style
      if (!toast?.style) {
        cleanup();
        return;
      }
      // Ensure a transition exists for smooth fade
      if (!toast.style.transition) toast.style.transition = 'opacity 0.28s';
      // Trigger fade
      requestAnimationFrame(() => {
        if (!toast?.style) {
          cleanup();
          return;
        }
        toast.style.opacity = '0';
      });
      toast.addEventListener('transitionend', cleanup, { once: true });
    }
  }

  // Export API
  window.toast = {
    show: showToast,
    hide: () => {
      if (activeToast) fadeOutToast(activeToast, document.getElementById('toast-container'));
    },
  };

  // --- END TOAST QUEUE WITH GSAP SUPPORT ---

  // If label forced on to two lines, balance the line break
  /* Balance any label that *actually* wraps */
  function balanceWrappedLabels() {
    const labels = document.querySelectorAll('.shortcut-label .i18n');

    labels.forEach((label) => {
      const original = label.dataset.originalText || label.textContent.trim();

      // Restore pristine label
      label.innerHTML = original;
      label.dataset.originalText = original;

      const words = original.split(' ');
      if (words.length < 2) return;

      const forceBreak = label.classList.contains('force-balance-break');
      const wrapsNaturally = label.scrollWidth > label.clientWidth + 1;

      if (!wrapsNaturally && !forceBreak) return;

      // Smart word-boundary midpoint
      const cumLen = [];
      let sum = 0;
      words.forEach((w, i) => {
        sum += w.length + (i < words.length - 1 ? 1 : 0);
        cumLen.push(sum);
      });

      const half = original.length / 2;
      let breakIdx = cumLen.findIndex((len) => len >= half);
      if (
        breakIdx > 0 &&
        Math.abs(cumLen[breakIdx - 1] - half) < Math.abs(cumLen[breakIdx] - half)
      ) {
        breakIdx -= 1;
      }

      const first = words.slice(0, breakIdx + 1).join(' ');
      const second = words.slice(breakIdx + 1).join(' ');
      label.innerHTML = `${first}<br>${second}`;
    });
  }

  // === Tooltip helpers (localize + balance) ===

  function localizeText(text) {
    if (!text) return text;
    if (text.startsWith('__MSG_') && text.endsWith('__')) {
      const msgKey = text.replace(/^__MSG_/, '').replace(/__$/, '');
      const msg = chrome.i18n.getMessage(msgKey);
      if (msg) return msg;
    }
    return text;
  }

  /**
   * Balance into 2–maxLines lines while keeping lines <= maxCharsPerLine.
   * Prefers FEWER, LONGER lines and low spread. Respects existing \n.
/**
 * Balance into 2–maxLines lines while keeping lines <= maxCharsPerLine.
 * Uses DP to pick optimal breakpoints (no greedy packing), prefers fewer lines,
 * and avoids 1-word widows/orphans.
 */
  function balanceTooltipLines(text, maxCharsPerLine = 36, maxLines = 4) {
    if (!text || text.includes('\n') || text.length <= maxCharsPerLine) return text;

    const words = text.trim().split(/\s+/);
    if (words.length === 1) return text;

    // --- tunables ---
    const MIN_FILL_FRAC = 0.72; // target ≥72% of max on non-last lines
    const UNDERFILL_WEIGHT = 6; // penalty per char below the target
    const SHORT_BREAK_WORDS = 2; // avoid lines with ≤2 words (non-last)
    const SHORT_BREAK_PENALTY = 80; // strong penalty for short non-last lines
    const LAST_LINE_SLACK_MULT = 0.6; // last line can be looser
    const LINECOUNT_PENALTY = 8; // bias toward fewer lines
    // -----------------

    // compute length of words[i..j] including spaces between
    const lens = words.map((w) => w.length);
    function lineLen(i, j) {
      let sum = 0;
      for (let k = i; k <= j; k++) sum += lens[k];
      return sum + (j - i); // spaces
    }

    function lineCost(len, isLast, wordCount) {
      if (len > maxCharsPerLine) return Infinity;

      const slack = maxCharsPerLine - len;
      let cost = (isLast ? LAST_LINE_SLACK_MULT : 1.0) * slack * slack;

      // Prefer fuller non-last lines; avoid early short breaks like "Enable to"
      if (!isLast) {
        const minTarget = Math.floor(maxCharsPerLine * MIN_FILL_FRAC);
        if (len < minTarget) {
          cost += UNDERFILL_WEIGHT * (minTarget - len);
        }
        if (wordCount <= SHORT_BREAK_WORDS) {
          cost += SHORT_BREAK_PENALTY;
        }
      }
      return cost;
    }

    function widowPenalty(wordCount) {
      if (wordCount <= 1) return 200; // no 1-word last line
      if (wordCount === 2) return 25; // discourage 2-word widow
      return 0;
    }

    let bestText = null;
    let bestScore = Infinity;

    // Try exact line counts; score picks the best, preferring fewer lines.
    for (let L = 2; L <= Math.min(maxLines, words.length); L++) {
      const n = words.length;
      const dp = Array.from({ length: L + 1 }, () => Array(n + 1).fill(Infinity));
      const prev = Array.from({ length: L + 1 }, () => Array(n + 1).fill(-1));
      dp[0][0] = 0;

      for (let l = 1; l <= L; l++) {
        for (let j = 1; j <= n; j++) {
          for (let i = l - 1; i <= j - 1; i++) {
            const isLast = l === L && j === n;
            const len = lineLen(i, j - 1);
            const wordCount = j - i;

            const lc = lineCost(len, isLast, wordCount);
            if (lc === Infinity) continue;

            const wp = isLast ? widowPenalty(wordCount) : 0;
            const cand = dp[l - 1][i] + lc + wp;

            if (cand < dp[l][j]) {
              dp[l][j] = cand;
              prev[l][j] = i;
            }
          }
        }
      }

      if (dp[L][n] === Infinity) continue;

      const score = dp[L][n] + (L - 2) * LINECOUNT_PENALTY;

      if (score < bestScore) {
        bestScore = score;

        // reconstruct breaks
        const breaks = [];
        let l = L,
          j = n;
        while (l > 0) {
          const i = prev[l][j];
          breaks.push([i, j - 1]);
          j = i;
          l--;
        }
        breaks.reverse();

        bestText = breaks.map(([i, j]) => words.slice(i, j + 1).join(' ')).join('\n');
      }
    }

    return bestText || text;
  }

  // Syncs with CSS --tooltip-max-ch variable
  function getTooltipMaxCh() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--tooltip-max-ch');
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 36;
  }

  function initTooltips() {
    const maxCh = getTooltipMaxCh(); // stays in sync with CSS

    document.querySelectorAll('.info-icon-tooltip[data-tooltip]').forEach((el) => {
      // Keep a separate, untouched source so other features (like "send edited message")
      // can read the unmodified value.
      if (!el.dataset.tooltipSrc) {
        el.dataset.tooltipSrc = el.getAttribute('data-tooltip') || '';
      }

      const raw = el.dataset.tooltipSrc;
      let tooltip = localizeText(raw);
      if (tooltip) tooltip = balanceTooltipLines(tooltip, maxCh, 4);

      // Only write if it actually changed to avoid churn
      if (el.getAttribute('data-tooltip') !== tooltip) {
        el.setAttribute('data-tooltip', tooltip);
      }
    });
  }

  // --- Localize all .i18n elements first (so tooltips are up to date) ---
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    if (message) el.textContent = message;
  });

  // --- Initialize tooltips (localize + balanced 1–4 lines) ---
  initTooltips();

  // --- Boundary-aware tooltip nudge -------------------------------

  /**
   * Finds the boundary container (add data-tooltip-boundary to your main wrapper),
   * falls back to document.body if not present.
   */
  function getTooltipBoundary() {
    return document.querySelector('[data-tooltip-boundary]') || document.body;
  }

  /**
   * Create (or reuse) a hidden measuring node that mimics the tooltip bubble.
   * We size it using the same typography and width rules so measured width ≈ render width.
   */
  function getTooltipMeasureEl() {
    if (getTooltipMeasureEl._el) return getTooltipMeasureEl._el;

    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed',
      'top:-99999px',
      'left:-99999px',
      'visibility:hidden',
      'pointer-events:none',
      'z-index:-1',
      'background:rgba(20,20,20,0.98)',
      'color:#fff',
      'padding:12px 20px',
      'border-radius:10px',
      'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
      'font-size:14px',
      'font-weight:500',
      'text-align:center',
      // Match tooltip wrapping exactly
      'white-space:normal',
      'text-wrap:balance', // <-- add this
      'overflow-wrap:normal',
      'word-break:keep-all',
      // Match the tooltip width rule
      'inline-size:clamp(28ch, calc(var(--tooltip-max-ch) * 1ch), 95vw)', // <-- add this
      'max-inline-size:calc(var(--tooltip-max-ch) * 1ch)',
      'box-sizing:border-box',
      'line-height:1.45',
    ].join(';');

    document.body.appendChild(el);
    getTooltipMeasureEl._el = el;
    return el;
  }

  /**
   * Compute offsets so the tooltip:
   * - stays inside the container horizontally
   * - stays inside the viewport vertically (top/bottom)
   * - never covers the current mouse pointer (horizontal sidestep)
   *
   * Applies CSS vars: --tooltip-offset-x, --tooltip-offset-y, --tooltip-max-fit.
   */
  function nudgeTooltipIntoBounds(
    triggerEl,
    { gap = 6, mouse = null, avoidMouseMargin = 10 } = {},
  ) {
    const boundary = getTooltipBoundary();
    const text = triggerEl.getAttribute('data-tooltip') || '';
    if (!text) {
      triggerEl.style.removeProperty('--tooltip-offset-x');
      triggerEl.style.removeProperty('--tooltip-offset-y');
      triggerEl.style.removeProperty('--tooltip-max-fit');
      return;
    }

    // Container horizontal limits (so we don't spill out of cards/panels)
    const cRect = boundary.getBoundingClientRect();
    const usableLeft = cRect.left + gap;
    const usableRight = cRect.right - gap;
    const usableWidth = Math.max(0, usableRight - usableLeft);

    // Viewport vertical limits (so we never leave the visible window)
    const vTop = gap; // viewport top edge
    const vBottom = window.innerHeight - gap;

    // Measure bubble after width cap
    const meas = getTooltipMeasureEl();
    meas.style.maxInlineSize = `${usableWidth}px`;
    meas.textContent = text;
    const bubbleWidth = meas.offsetWidth;
    const bubbleHeight = meas.offsetHeight;

    // Expose final width cap to CSS so ::after matches measured width
    triggerEl.style.setProperty('--tooltip-max-fit', `${bubbleWidth}px`);

    // Base position (assume above trigger with ~8px gap; adjust if your CSS differs)
    const tRect = triggerEl.getBoundingClientRect();
    const bubbleLeft = tRect.left + tRect.width / 2 - bubbleWidth / 2;
    const bubbleRight = bubbleLeft + bubbleWidth;
    const bubbleTop = tRect.top - bubbleHeight - 8;
    const bubbleBottom = bubbleTop + bubbleHeight;

    // Initial horizontal nudge to fit container
    let offsetX = 0;
    if (bubbleLeft < usableLeft) offsetX += usableLeft - bubbleLeft;
    else if (bubbleRight > usableRight) offsetX -= bubbleRight - usableRight;

    // Vertical nudge to fit viewport
    let offsetY = 0;
    if (bubbleTop < vTop) offsetY += vTop - bubbleTop;
    if (bubbleBottom + offsetY > vBottom) offsetY -= bubbleBottom + offsetY - vBottom;

    // Cursor avoidance: If mouse is inside the (offset) bubble, push horizontally
    if (mouse && Number.isFinite(mouse.x) && Number.isFinite(mouse.y)) {
      const curLeft = bubbleLeft + offsetX;
      const curRight = bubbleRight + offsetX;
      const curTop = bubbleTop + offsetY;
      const curBottom = bubbleBottom + offsetY;

      const insideHoriz = mouse.x >= curLeft && mouse.x <= curRight;
      const insideVert = mouse.y >= curTop && mouse.y <= curBottom;
      if (insideHoriz && insideVert) {
        const spaceLeft = curLeft - usableLeft;
        const spaceRight = usableRight - curRight;

        // Choose the side with more horizontal space
        const moveLeft = spaceLeft >= spaceRight;

        // Compute delta to clear the mouse with a small margin
        let delta;
        if (moveLeft) {
          // Target right edge just to the left of the pointer
          const targetRight = mouse.x - avoidMouseMargin;
          delta = targetRight - curRight; // negative => move left
          // Clamp so we don't go past container left
          const minDelta = usableLeft - curLeft;
          if (delta < minDelta) delta = minDelta;
        } else {
          // Target left edge just to the right of the pointer
          const targetLeft = mouse.x + avoidMouseMargin;
          delta = targetLeft - curLeft; // positive => move right
          // Clamp so we don't go past container right
          const maxDelta = usableRight - curRight;
          if (delta > maxDelta) delta = maxDelta;
        }

        offsetX += delta;

        // Re-clamp horizontally after the mouse-avoid shift
        const newLeft = bubbleLeft + offsetX;
        const newRight = bubbleRight + offsetX;
        if (newLeft < usableLeft) offsetX += usableLeft - newLeft;
        else if (newRight > usableRight) offsetX -= newRight - usableRight;
      }
    }

    triggerEl.style.setProperty('--tooltip-offset-x', `${Math.round(offsetX)}px`);
    triggerEl.style.setProperty('--tooltip-offset-y', `${Math.round(offsetY)}px`);
  }

  /**
   * Hook up listeners to recompute on show / hide / resize / pointer move.
   * - Horizontal bounds: container with [data-tooltip-boundary] (fallback body)
   * - Vertical bounds: viewport (so tooltips never leave the visible window)
   * - Cursor avoidance: bubble never covers current mouse location
   */
  function setupTooltipBoundary() {
    const boundary = getTooltipBoundary();
    const items = Array.from(
      document.querySelectorAll(
        '.info-icon-tooltip[data-tooltip], .mp-key.custom-tooltip[data-tooltip]',
      ),
    );

    const optsBase = { gap: 6 };

    // Track latest pointer position (rAF-throttled)
    const pointer = { x: NaN, y: NaN };
    let pmRAF = 0;
    function nudgeActiveWithPointer() {
      const active = items.filter((el) => el.matches(':hover, :focus'));
      for (const el of active) {
        nudgeTooltipIntoBounds(el, {
          ...optsBase,
          mouse: { x: pointer.x, y: pointer.y },
        });
      }
    }
    window.addEventListener(
      'pointermove',
      (e) => {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        if (pmRAF) cancelAnimationFrame(pmRAF);
        pmRAF = requestAnimationFrame(nudgeActiveWithPointer);
      },
      { passive: true },
    );

    function onShow(e) {
      const el = e.currentTarget;
      nudgeTooltipIntoBounds(el, {
        ...optsBase,
        mouse: { x: pointer.x, y: pointer.y },
      });
    }
    function onHide(e) {
      e.currentTarget.style.removeProperty('--tooltip-offset-x');
      e.currentTarget.style.removeProperty('--tooltip-offset-y');
      e.currentTarget.style.removeProperty('--tooltip-max-fit');
    }
    function onResizeOrScroll() {
      const active = items.filter((el) => el.matches(':hover, :focus'));
      for (const el of active) {
        nudgeTooltipIntoBounds(el, {
          ...optsBase,
          mouse: { x: pointer.x, y: pointer.y },
        });
      }
    }

    items.forEach((el) => {
      el.addEventListener('mouseenter', onShow);
      el.addEventListener('focus', onShow);
      el.addEventListener('mouseleave', onHide);
      el.addEventListener('blur', onHide);
    });

    let rid = 0;
    const raf = (fn) => {
      cancelAnimationFrame(rid);
      rid = requestAnimationFrame(fn);
    };

    window.addEventListener('resize', () => raf(onResizeOrScroll), { passive: true });
    boundary.addEventListener('scroll', () => raf(onResizeOrScroll), { passive: true });
    window.addEventListener('scroll', () => raf(onResizeOrScroll), { passive: true });
  }

  // Call this once after your initTooltips()
  /* initTooltips(); */
  setupTooltipBoundary();

  // --- end boundary hack -----------------------------------------

  function showDuplicateModal(messageOrData, cb, opts = {}) {
    // opts:
    //   simple?: true    // If true, just show message(s) literally and no special logic
    //   keyLabel?: string (already lowercased if you want it lower)
    //   targetLabel?: string (destination label)
    //   lines?: Array<{ key: string, from: string, to: string }>  // for multi, per-item mapping
    //   proceedText?: string
    //   assignText?: string

    const DONT_ASK_SHORTCUT_KEY = 'dontAskDuplicateShortcutModal';
    const proceedText = opts.proceedText || 'Proceed with changes?';
    const assignText = opts.assignText || 'Assign here instead?';

    // HTML-escape helper
    function esc(s) {
      return String(s).replace(
        /[&<>"']/g,
        (m) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[m],
      );
    }

    function ensureOverlay() {
      let overlay = document.getElementById('dup-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'dup-overlay';
        overlay.style.display = 'none';
        overlay.innerHTML = `
        <div id="dup-box" style="max-width: 520px;">
          <p id="dup-line1" class="dup-line" style="margin:0 0 6px 0; font-size:14px; font-weight:400;"></p>
          <div id="dup-list-wrap" style="margin:0 0 6px; font-size:14px; font-weight:400; display:none;"></div>
          <p id="dup-line2" class="dup-line" style="margin:0 0 10px 0; font-size:14px; font-weight:400;"></p>

          <label style="display:flex;gap:.5em;align-items:center;margin-top:2px;">
            <input id="dup-dont" type="checkbox"> Don’t ask me again
          </label>

          <div class="dup-btns" style="display:flex;gap:.5em;margin-top:10px;">
            <button id="dup-no">Cancel</button>
            <button id="dup-yes">Yes</button>
          </div>
        </div>`;
        document.body.appendChild(overlay);
      }
      return overlay;
    }

    function parseOwners(input) {
      if (Array.isArray(input)) return input;
      const s = typeof input === 'string' ? input : '';
      return s
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }

    // --- SIMPLE/GENERIC MODAL SUPPORT ---
    if (opts.simple === true) {
      const overlay = ensureOverlay();
      // Hide the "Don't ask me again" checkbox for simple modals
      const dontLabel = overlay.querySelector('label input#dup-dont')?.parentElement;
      if (dontLabel) dontLabel.style.display = 'none';

      const oldCancel = overlay.querySelector('#dup-no');
      const oldYes = overlay.querySelector('#dup-yes');
      const newCancel = oldCancel.cloneNode(true);
      const newYes = oldYes.cloneNode(true);
      oldCancel.parentNode.replaceChild(newCancel, oldCancel);
      oldYes.parentNode.replaceChild(newYes, oldYes);

      function detachDupKeyHandler() {
        if (overlay.__dupKeyHandler) {
          document.removeEventListener('keydown', overlay.__dupKeyHandler, true);
          overlay.__dupKeyHandler = null;
        }
      }
      function attachDupKeyHandler() {
        detachDupKeyHandler();
        overlay.__dupKeyHandler = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            newYes.click();
          } else if (e.key === 'Escape' || e.key === 'Esc') {
            e.preventDefault();
            e.stopPropagation();
            newCancel.click();
          }
        };
        document.addEventListener('keydown', overlay.__dupKeyHandler, true);
      }

      newCancel.addEventListener('click', () => {
        detachDupKeyHandler();
        overlay.style.display = 'none';
        cb(false, false);
      });

      newYes.addEventListener('click', () => {
        detachDupKeyHandler();
        overlay.style.display = 'none';
        cb(true, false);
      });

      attachDupKeyHandler();

      const line1 = overlay.querySelector('#dup-line1');
      const line2 = overlay.querySelector('#dup-line2');
      const listWrap = overlay.querySelector('#dup-list-wrap');

      // Allow HTML in messageOrData if flagged
      if (opts.allowHTML) {
        line1.innerHTML = messageOrData;
      } else {
        line1.innerHTML = esc(messageOrData);
      }

      listWrap.innerHTML = '';
      listWrap.style.display = 'none';
      line2.innerHTML = `<strong>${esc(proceedText)}</strong>`;

      overlay.style.display = 'flex';
      return;
    }

    chrome.storage.sync.get(DONT_ASK_SHORTCUT_KEY, (data) => {
      if (data[DONT_ASK_SHORTCUT_KEY]) {
        cb(true, true);
        return;
      }

      const overlay = ensureOverlay();

      // wire buttons per-open + keyboard shortcuts (Enter=Yes, Escape=Cancel)
      const dontChk = overlay.querySelector('#dup-dont');
      const oldCancel = overlay.querySelector('#dup-no');
      const oldYes = overlay.querySelector('#dup-yes');
      const newCancel = oldCancel.cloneNode(true);
      const newYes = oldYes.cloneNode(true);
      oldCancel.parentNode.replaceChild(newCancel, oldCancel);
      oldYes.parentNode.replaceChild(newYes, oldYes);

      function detachDupKeyHandler() {
        if (overlay.__dupKeyHandler) {
          document.removeEventListener('keydown', overlay.__dupKeyHandler, true);
          overlay.__dupKeyHandler = null;
        }
      }
      function attachDupKeyHandler() {
        detachDupKeyHandler();
        overlay.__dupKeyHandler = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            newYes.click();
          } else if (e.key === 'Escape' || e.key === 'Esc') {
            e.preventDefault();
            e.stopPropagation();
            newCancel.click();
          }
        };
        document.addEventListener('keydown', overlay.__dupKeyHandler, true);
      }

      newCancel.addEventListener('click', () => {
        detachDupKeyHandler();
        overlay.style.display = 'none';
        cb(false, false);
      });

      newYes.addEventListener('click', () => {
        detachDupKeyHandler();
        const skip = dontChk.checked;
        overlay.style.display = 'none';
        if (skip) chrome.storage.sync.set({ [DONT_ASK_SHORTCUT_KEY]: true }, () => cb(true, true));
        else cb(true, false);
      });

      attachDupKeyHandler();

      const line1 = overlay.querySelector('#dup-line1');
      const line2 = overlay.querySelector('#dup-line2');
      const listWrap = overlay.querySelector('#dup-list-wrap');

      const yesBtn = overlay.querySelector('#dup-yes');
      const yesColor = yesBtn ? getComputedStyle(yesBtn).color : '#1a73e8';

      // Build data
      const owners = parseOwners(messageOrData);
      const lines = Array.isArray(opts.lines) ? opts.lines.slice() : null;
      const keyLabel = (opts.keyLabel || '').trim();
      const targetLabel = (opts.targetLabel || '').trim();

      // Reset UI zones
      line1.textContent = '';
      line2.textContent = '';
      listWrap.innerHTML = '';
      listWrap.style.display = 'none';

      if (lines && lines.length > 0) {
        const header = document.createElement('div');
        header.textContent = 'Multiple shortcuts will be reassigned:';
        header.style.marginBottom = '6px';
        listWrap.appendChild(header);

        const ul = document.createElement('ul');
        ul.id = 'dup-list';
        ul.style.margin = '0 0 6px 1.1em';
        ul.style.padding = '0';
        ul.style.whiteSpace = 'normal';
        ul.style.wordBreak = 'keep-all';

        lines.forEach(({ key, from, to }) => {
          const li = document.createElement('li');
          li.style.margin = '0 0 4px 0';
          li.style.listStyle = 'disc';
          li.style.whiteSpace = 'normal';
          li.style.wordBreak = 'keep-all';

          const keySpan = document.createElement('span');
          keySpan.className = 'dup-key';
          keySpan.style.fontWeight = '700';
          keySpan.style.color = yesColor;
          keySpan.textContent = String(key || '').toLowerCase();

          const fromSpan = document.createElement('span');
          fromSpan.className = 'dup-key';
          fromSpan.style.fontWeight = '700';
          fromSpan.style.color = yesColor;
          fromSpan.textContent = from || '';

          const toSpan = document.createElement('span');
          toSpan.className = 'dup-key';
          toSpan.style.fontWeight = '700';
          toSpan.style.color = yesColor;
          toSpan.textContent = to || targetLabel || '';

          li.appendChild(keySpan);
          li.appendChild(document.createTextNode(' will be reassigned from '));
          li.appendChild(fromSpan);
          li.appendChild(document.createTextNode(' to '));
          li.appendChild(toSpan);
          ul.appendChild(li);
        });

        listWrap.appendChild(ul);
        listWrap.style.display = 'block';
        line2.textContent = proceedText;
      } else if (owners.length > 1) {
        const header = document.createElement('div');
        header.textContent = 'Multiple shortcuts will be reassigned:';
        header.style.marginBottom = '6px';
        listWrap.appendChild(header);

        const ul = document.createElement('ul');
        ul.id = 'dup-list';
        ul.style.margin = '0 0 6px 1.1em';
        ul.style.padding = '0';
        ul.style.whiteSpace = 'normal';
        ul.style.wordBreak = 'keep-all';

        owners.forEach((fromName) => {
          const li = document.createElement('li');
          li.style.margin = '0 0 4px 0';
          li.style.listStyle = 'disc';
          li.style.whiteSpace = 'normal';
          li.style.wordBreak = 'keep-all';

          const keySpan = document.createElement('span');
          keySpan.className = 'dup-key';
          keySpan.style.fontWeight = '700';
          keySpan.style.color = yesColor;
          keySpan.textContent = keyLabel || 'key';

          const fromSpan = document.createElement('span');
          fromSpan.className = 'dup-key';
          fromSpan.style.fontWeight = '700';
          fromSpan.style.color = yesColor;
          fromSpan.textContent = fromName || '';

          const toSpan = document.createElement('span');
          toSpan.className = 'dup-key';
          toSpan.style.fontWeight = '700';
          toSpan.style.color = yesColor;
          toSpan.textContent = targetLabel || '';

          li.appendChild(keySpan);
          li.appendChild(document.createTextNode(' will be reassigned from '));
          li.appendChild(fromSpan);
          li.appendChild(document.createTextNode(' to '));
          li.appendChild(toSpan);
          ul.appendChild(li);
        });

        listWrap.appendChild(ul);
        listWrap.style.display = 'block';
        line2.textContent = proceedText;
      } else {
        const owner = owners[0] || '';
        const prettyKey =
          keyLabel && /^[A-Za-z]$/.test(keyLabel) ? keyLabel.toLowerCase() : keyLabel;

        if (prettyKey) {
          line1.innerHTML = `<span class="dup-key" style="font-weight:700; color:${esc(yesColor)};">${esc(prettyKey)}</span> is already assigned to <span class="dup-key" style="font-weight:700; color:${esc(yesColor)};">${esc(owner)}</span>.`;
        } else {
          line1.innerHTML = `This key is assigned to <span class="dup-key" style="font-weight:700; color:${esc(yesColor)};">${esc(owner)}</span>.`;
        }
        line2.innerHTML = `<strong>${esc(assignText)}</strong>`;
      }

      overlay.style.display = 'flex';
    });
  }
  /* Coalesce duplicate modal requests so the user only answers once */
  (() => {
    if (window.__dupModalGateInstalled) return;
    window.__dupModalGateInstalled = true;

    const rawShow = window.showDuplicateModal || showDuplicateModal;
    const KEY = 'dontAskDuplicateShortcutModal';

    const state = {
      open: false,
      waiters: [],
      last: null, // { yes, remember, at }
      dontAskCache: null, // true | false | null (unknown)
    };

    window.showDuplicateModal = function coalescedDuplicateModal(messageOrData, cb, opts = {}) {
      // If a dialog is in-flight, just join this request to the same decision.
      if (state.open) {
        state.waiters.push(cb);
        return;
      }

      // If the user just answered very recently, reuse that decision (prevents back-to-back re-prompts).
      if (state.last && Date.now() - state.last.at < 300) {
        cb(state.last.yes, state.last.remember);
        return;
      }

      // If we already know "Don't ask again" is set, auto-accept for all callers.
      const autoAccept = () => {
        const res = { yes: true, remember: true, at: Date.now() };
        state.last = res;
        try {
          cb(true, true);
        } catch (_) {}
      };

      const openModal = () => {
        state.open = true;
        state.waiters = [cb];

        rawShow(
          messageOrData,
          (yes, remember) => {
            // Update caches
            if (remember) state.dontAskCache = true;
            state.last = { yes, remember, at: Date.now() };

            // Resolve all queued callers with the same answer
            const waiters = state.waiters.slice();
            state.waiters.length = 0;
            state.open = false;
            waiters.forEach((fn) => {
              try {
                fn(yes, remember);
              } catch (_) {}
            });
          },
          opts,
        );
      };

      if (state.dontAskCache === true) {
        autoAccept();
        return;
      }

      // Read "Don't ask again" from storage once, then cache
      chrome.storage.sync.get(KEY, (data) => {
        const skip = Boolean(data?.[KEY]);
        if (skip) {
          state.dontAskCache = true;
          autoAccept();
        } else {
          openModal();
        }
      });
    };
  })();

  // End of Utility Functions

  /**
   * Initializes default settings if not present in Chrome storage.
   * Sets the radio button and checkbox states and stores them if they haven't been defined yet.
   */
  // === Robust Settings Initialization ===
  // --- Global source of truth for all default settings ---
  const NBSP = '\u00A0';
  const DEFAULT_PRESET_DATA = {
    // UI settings
    showLegacyArrowButtonsCheckbox: false,
    removeMarkdownOnCopyCheckbox: true,
    moveTopBarToBottomCheckbox: false,
    pageUpDownTakeover: true,
    selectMessagesSentByUserOrChatGptCheckbox: true,
    onlySelectUserCheckbox: false,
    onlySelectAssistantCheckbox: false,
    disableCopyAfterSelectCheckbox: false,
    rememberSidebarScrollPositionCheckbox: false,
    fadeSlimSidebarEnabled: false,
    selectThenCopyAllMessagesBothUserAndChatGpt: false,
    selectThenCopyAllMessagesOnlyAssistant: true,
    selectThenCopyAllMessagesOnlyUser: false,
    doNotIncludeLabelsCheckbox: false,

    // opacity defaults
    popupBottomBarOpacityValue: 0.6, // Default: 0.6
    popupSlimSidebarOpacityValue: 0, // Default: 0 (fully opaque)

    // Shortcut toggles
    enableSendWithControlEnterCheckbox: true,
    enableStopWithControlBackspaceCheckbox: true,
    useAltForModelSwitcherRadio: true,
    useControlForModelSwitcherRadio: false,

    // Shortcuts (KeyboardEvent.code values)
    shortcutKeyScrollUpOneMessage: 'KeyA',
    shortcutKeyScrollDownOneMessage: 'KeyF',
    shortcutKeyScrollUpTwoMessages: 'ArrowUp',
    shortcutKeyScrollDownTwoMessages: 'ArrowDown',
    shortcutKeyCopyLowest: 'KeyC',
    shortcutKeyEdit: 'KeyE',
    shortcutKeySendEdit: 'KeyD',
    shortcutKeyCopyAllCodeBlocks: 'BracketRight',
    copyCodeUserSeparator: ' \n \n --- --- --- \n \n',
    shortcutKeyNewConversation: 'KeyN',
    shortcutKeySearchConversationHistory: 'KeyK',
    shortcutKeyClickNativeScrollToBottom: 'KeyZ',
    shortcutKeyToggleSidebar: 'KeyS',
    shortcutKeyActivateInput: 'KeyW',
    shortcutKeySearchWeb: 'KeyQ',
    shortcutKeyScrollToTop: 'KeyT',
    shortcutKeyPreviousThread: 'KeyJ',
    shortcutKeyNextThread: 'Semicolon',
    selectThenCopy: 'KeyX',
    shortcutKeyToggleModelSelector: 'Slash',
    shortcutKeyRegenerateTryAgain: 'KeyR',
    shortcutKeyRegenerateMoreConcise: NBSP,
    shortcutKeyRegenerateAddDetails: NBSP,
    shortcutKeyRegenerateWithDifferentModel: NBSP,
    shortcutKeyRegenerateAskToChangeResponse: NBSP,
    shortcutKeyMoreDotsReadAloud: NBSP,
    shortcutKeyMoreDotsBranchInNewChat: NBSP,
    shortcutKeyTemporaryChat: 'KeyP',
    shortcutKeyStudy: NBSP,
    shortcutKeyCreateImage: NBSP,
    shortcutKeyToggleCanvas: NBSP,
    shortcutKeyToggleDictate: 'KeyY',
    shortcutKeyCancelDictation: NBSP,
    shortcutKeyShare: NBSP,
    shortcutKeyThinkLonger: NBSP,
    shortcutKeyAddPhotosFiles: NBSP,
    selectThenCopyAllMessages: 'BracketLeft',
    shortcutKeyThinkingExtended: NBSP,
    shortcutKeyThinkingStandard: NBSP,
    shortcutKeyNewGptConversation: NBSP,

    // Other options

    // Model picker keys (number row, 0-9)
    modelPickerKeyCodes: [
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
    ],
  };
  // Make available everywhere
  window.DEFAULT_PRESET_DATA = DEFAULT_PRESET_DATA;

  // === Robust First-Run Defaults Loader for All Options, Shortcuts, Separators ===
  (function robustFirstRunDefaultsInit() {
    const DEFAULT_PRESET_DATA = window.DEFAULT_PRESET_DATA;
    const allKeys = Object.keys(DEFAULT_PRESET_DATA);

    chrome.storage.sync.get(allKeys, (data) => {
      const patch = {};

      allKeys.forEach((key) => {
        if (data[key] === undefined) {
          patch[key] = DEFAULT_PRESET_DATA[key];
        }
      });

      if (Object.keys(patch).length > 0) {
        chrome.storage.sync.set(patch, () => {
          if (typeof window.refreshShortcutInputsFromStorage === 'function') {
            window.refreshShortcutInputsFromStorage();
          }
          ['copyCodeUserSeparator'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (patch[id] !== undefined) {
              el.value = sep_storageToUI(patch[id]);
            }
          });
        });
      }

      // Always reflect current storage into UI
      allKeys.forEach((key) => {
        const el = document.getElementById(key);
        if (!el) return;

        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = data[key] !== undefined ? data[key] : DEFAULT_PRESET_DATA[key];
          return;
        }

        if (typeof DEFAULT_PRESET_DATA[key] === 'string') {
          const raw = data[key] !== undefined ? data[key] : DEFAULT_PRESET_DATA[key];
          if (key === 'copyCodeUserSeparator') {
            el.value = sep_storageToUI(raw);
          } else {
            el.value = raw;
          }
        }
      });

      // hydrate segmented "Use Alt / Use Control" pill from the radios we just set
      (function syncModelSwitcherPillFromRadios() {
        const altRadio = document.getElementById('useAltForModelSwitcherRadio');
        const ctrlRadio = document.getElementById('useControlForModelSwitcherRadio');
        const altSeg = document.querySelector(
          '.p-segmented-controls a[data-target="useAltForModelSwitcherRadio"]',
        );
        const ctrlSeg = document.querySelector(
          '.p-segmented-controls a[data-target="useControlForModelSwitcherRadio"]',
        );

        if (!altSeg && !ctrlSeg) return;

        const useCtrl = ctrlRadio?.checked ?? false;
        const useAlt = altRadio?.checked ?? false;

        if (useCtrl) {
          altSeg?.classList.remove('active');
          ctrlSeg?.classList.add('active');
          return;
        }

        if (useAlt) {
          ctrlSeg?.classList.remove('active');
          altSeg?.classList.add('active');
          return;
        }

        // default: favor control segment if radios are missing
        ctrlSeg?.classList.add('active');
        altSeg?.classList.remove('active');
      })();
    });
  })();

  /**
   * Handles checkbox or radio button state changes by saving to Chrome storage and showing a toast.
   * Prevents attaching multiple event listeners.
   * @param {string} elementId - The ID of the checkbox or radio button element.
   * @param {string} storageKey - The key to store the state in Chrome storage.
   */
  // Handler for checkboxes and radio-like groups (exclusive within each group)
  function handleStateChange(elementId, storageKey) {
    const element = document.getElementById(elementId);
    if (element && !element.dataset.listenerAttached) {
      element.addEventListener('change', function () {
        const isChecked = this.checked === true;
        let obj = {};

        // Group A: Select + Copy One Behavior (radio group)
        const groupA = [
          'selectMessagesSentByUserOrChatGptCheckbox',
          'onlySelectUserCheckbox',
          'onlySelectAssistantCheckbox',
        ];

        // Group B: Select + Copy All Behavior (radio group)
        // Support both naming variants to avoid breakage:
        // - "EntireConversation..." (prior JS)
        // - "AllMessages..." (current HTML)
        const groupB = [
          'selectAndCopyEntireConversationBothUserAndChatGpt',
          'selectAndCopyEntireConversationOnlyAssistant',
          'selectAndCopyEntireConversationOnlyUser',
          'selectThenCopyAllMessagesBothUserAndChatGpt',
          'selectThenCopyAllMessagesOnlyAssistant',
          'selectThenCopyAllMessagesOnlyUser',
        ];

        // Group C: Model switcher (radio group)
        const modelSwitcherKeys = [
          'useAltForModelSwitcherRadio',
          'useControlForModelSwitcherRadio',
        ];

        const isRadioGroupKey =
          groupA.includes(storageKey) ||
          groupB.includes(storageKey) ||
          modelSwitcherKeys.includes(storageKey);

        // For radio groups, ignore "unchecked" events to avoid clearing storage
        if (isRadioGroupKey && !isChecked) return;

        if (groupA.includes(storageKey)) {
          obj = groupA.reduce((acc, key) => {
            acc[key] = false;
            return acc;
          }, {});
          obj[storageKey] = true;
        } else if (groupB.includes(storageKey)) {
          obj = groupB.reduce((acc, key) => {
            acc[key] = false;
            return acc;
          }, {});
          obj[storageKey] = true;
        } else if (modelSwitcherKeys.includes(storageKey)) {
          obj = modelSwitcherKeys.reduce((acc, key) => {
            acc[key] = false;
            return acc;
          }, {});
          obj[storageKey] = true;
        } else {
          obj[storageKey] = isChecked;
        }

        chrome.storage.sync.set(obj, () => {
          if (chrome.runtime.lastError) {
            console.error(`Error saving "${storageKey}":`, chrome.runtime.lastError);
            showToast(`Error saving option: ${chrome.runtime.lastError.message}`);
            return;
          }
          console.log(`The value of "${storageKey}" is set to ${isChecked}`);
          showToast('Options saved. Reload page to apply changes.');
        });
      });
      element.dataset.listenerAttached = 'true';
    }
  }

  // Apply the handler to each checkbox and radio button
  handleStateChange('showLegacyArrowButtonsCheckbox', 'showLegacyArrowButtonsCheckbox');
  handleStateChange('removeMarkdownOnCopyCheckbox', 'removeMarkdownOnCopyCheckbox');
  handleStateChange('moveTopBarToBottomCheckbox', 'moveTopBarToBottomCheckbox');
  handleStateChange('pageUpDownTakeover', 'pageUpDownTakeover');

  // Select + Copy One Behavior (Set 1)
  handleStateChange(
    'selectMessagesSentByUserOrChatGptCheckbox',
    'selectMessagesSentByUserOrChatGptCheckbox',
  );
  handleStateChange('onlySelectUserCheckbox', 'onlySelectUserCheckbox');
  handleStateChange('onlySelectAssistantCheckbox', 'onlySelectAssistantCheckbox');

  // Other checkboxes
  handleStateChange('disableCopyAfterSelectCheckbox', 'disableCopyAfterSelectCheckbox');
  handleStateChange('doNotIncludeLabelsCheckbox', 'doNotIncludeLabelsCheckbox');
  handleStateChange('enableSendWithControlEnterCheckbox', 'enableSendWithControlEnterCheckbox');
  handleStateChange(
    'enableStopWithControlBackspaceCheckbox',
    'enableStopWithControlBackspaceCheckbox',
  );
  handleStateChange(
    'rememberSidebarScrollPositionCheckbox',
    'rememberSidebarScrollPositionCheckbox',
  );

  // Select + Copy All Behavior (Set 2)
  // If your HTML uses the "EntireConversation..." IDs/keys:
  handleStateChange(
    'selectAndCopyEntireConversationBothUserAndChatGpt',
    'selectAndCopyEntireConversationBothUserAndChatGpt',
  );
  handleStateChange(
    'selectAndCopyEntireConversationOnlyAssistant',
    'selectAndCopyEntireConversationOnlyAssistant',
  );
  handleStateChange(
    'selectAndCopyEntireConversationOnlyUser',
    'selectAndCopyEntireConversationOnlyUser',
  );

  // If your HTML uses the "AllMessages..." IDs/keys (as shown in your snippet):
  handleStateChange(
    'selectThenCopyAllMessagesBothUserAndChatGpt',
    'selectThenCopyAllMessagesBothUserAndChatGpt',
  );
  handleStateChange(
    'selectThenCopyAllMessagesOnlyAssistant',
    'selectThenCopyAllMessagesOnlyAssistant',
  );
  handleStateChange('selectThenCopyAllMessagesOnlyUser', 'selectThenCopyAllMessagesOnlyUser');

  // Specialized wiring for the Model Picker mode radios (Alt vs Control)
  // Shows a dupe modal when switching to Alt would collide with popup shortcuts.
  (function wireModelPickerModeRadios() {
    const alt = document.getElementById('useAltForModelSwitcherRadio');
    const ctrl = document.getElementById('useControlForModelSwitcherRadio');
    if (!alt || !ctrl) return;

    // Avoid double-binding if this script can run twice
    if (alt.dataset.listenerAttached === 'true' || ctrl.dataset.listenerAttached === 'true') return;

    function saveMode(mode) {
      const obj = {
        useAltForModelSwitcherRadio: mode === 'alt',
        useControlForModelSwitcherRadio: mode === 'ctrl',
      };
      chrome.storage.sync.set(obj, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving model picker mode:', chrome.runtime.lastError);
          showToast(`Error: ${chrome.runtime.lastError.message}`);
          return;
        }
        showToast('Options saved. Reload page to apply changes.');
      });
    }

    alt.addEventListener('change', () => {
      if (!alt.checked) return;

      const conflicts = gatherPopupConflictsForModelSwitch('alt');
      if (conflicts.length === 0) {
        saveMode('alt');
        return;
      }

      // Build bulleted lines like: “w will be reassigned from Web Search Tool to GPT-5 Auto”
      const lines = conflicts.map((c) => ({
        key: (c.keyLabel || '').toLowerCase(),
        from: c.label,
        to: c.targetLabel || 'Model',
      }));

      const names = conflicts.map((c) => c.label).join(', ');
      window.showDuplicateModal(
        names,
        (yes, remember) => {
          if (yes) {
            window.ShortcutUtils.clearOwners(conflicts, () => {
              saveMode('alt');
              if (remember) {
                window.prefs = window.prefs || {};
                window.prefs.autoOverwrite = true;
                chrome.storage.sync.set({ autoOverwrite: true });
              }
            });
          } else {
            alt.checked = false;
            ctrl.checked = true;
            // Ensure segmented UI + 5×2 labels resync immediately
            ctrl.dispatchEvent(new Event('change', { bubbles: true }));
          }
        },
        { lines, proceedText: 'Proceed with changes?' },
      );
    });

    // Switching to Control never collides with Alt-based popup shortcuts; just save.
    ctrl.addEventListener('change', () => {
      if (!ctrl.checked) return;
      saveMode('ctrl');
    });

    alt.dataset.listenerAttached = 'true';
    ctrl.dataset.listenerAttached = 'true';
  })();

  const shortcutKeys = [
    'shortcutKeyScrollUpOneMessage',
    'shortcutKeyScrollDownOneMessage',
    'shortcutKeyScrollUpTwoMessages',
    'shortcutKeyScrollDownTwoMessages',
    'shortcutKeyCopyLowest',
    'shortcutKeyEdit',
    'shortcutKeySendEdit',
    'shortcutKeyCopyAllCodeBlocks',
    'shortcutKeyNewConversation',
    'shortcutKeySearchConversationHistory',
    'shortcutKeyClickNativeScrollToBottom',
    'shortcutKeyToggleSidebar',
    'shortcutKeyActivateInput',
    'shortcutKeySearchWeb',
    'shortcutKeyScrollToTop',
    'shortcutKeyPreviousThread',
    'shortcutKeyNextThread',
    'selectThenCopy',
    'shortcutKeyToggleModelSelector',
    'shortcutKeyRegenerateTryAgain',
    'shortcutKeyRegenerateMoreConcise',
    'shortcutKeyRegenerateAddDetails',
    'shortcutKeyRegenerateWithDifferentModel',
    'shortcutKeyRegenerateAskToChangeResponse',
    'shortcutKeyMoreDotsReadAloud',
    'shortcutKeyMoreDotsBranchInNewChat',
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
  ];
  const shortcutKeyValues = {};

  // Helper: convert KeyboardEvent.code to display label for popup input (reuses chip helper)
  function codeToDisplayChar(code) {
    if (!code || code === '\u00A0') return '';
    const fn =
      window.ShortcutUtils && typeof window.ShortcutUtils.displayFromCode === 'function'
        ? window.ShortcutUtils.displayFromCode
        : typeof displayFromCode === 'function'
          ? displayFromCode
          : null;
    return fn ? fn(code) || '' : '';
  }

  // --- Robust shortcut input load/save/wireup (fixes clear bug & always syncs) ---

  // Known fallback defaults for shortcuts that may not have an HTML value attribute
  // Add more entries here if you discover other defaults that must roundtrip.
  const DEFAULT_SHORTCUT_CODE_FALLBACKS = {
    // Show Model Picker default "/"
    shortcutKeyToggleModelSelector: 'Slash',
  };

  // Reusable: hydrate all shortcut inputs from storage (or HTML defaults) into value + dataset.keyCode
  function refreshShortcutInputsFromStorage() {
    chrome.storage.sync.get(shortcutKeys, (data) => {
      // Clear old cache
      Object.keys(shortcutKeyValues).forEach((k) => {
        delete shortcutKeyValues[k];
      });

      shortcutKeys.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;

        const stored = data[id];
        const defaultValue = (el.getAttribute('value') || '').trim();
        const fallbackCode = DEFAULT_SHORTCUT_CODE_FALLBACKS[id] || '';

        if (typeof stored === 'string' && stored !== '\u00A0' && stored.trim()) {
          el.dataset.keyCode = stored;
          el.value = codeToDisplayChar(stored);
          shortcutKeyValues[id] = el.value;
        } else if (stored === '\u00A0') {
          el.dataset.keyCode = '';
          el.value = '';
          shortcutKeyValues[id] = '';
        } else if (defaultValue) {
          const code = (window.ShortcutUtils?.charToCode || charToCode)(defaultValue) || '';
          el.dataset.keyCode = code;
          el.value = code ? codeToDisplayChar(code) : defaultValue;
          shortcutKeyValues[id] = el.value;
        } else if (fallbackCode) {
          el.dataset.keyCode = fallbackCode;
          el.value = codeToDisplayChar(fallbackCode);
          shortcutKeyValues[id] = el.value;
        } else {
          el.dataset.keyCode = '';
          el.value = '';
          shortcutKeyValues[id] = '';
        }
      });
    });
  }

  // Expose for import code to reuse
  window.refreshShortcutInputsFromStorage = refreshShortcutInputsFromStorage;

  // Initial hydrate on popup open
  refreshShortcutInputsFromStorage();

  // Wire up robust key capture: supports arrows, function keys, media keys, labels, and guards input vs keydown
  shortcutKeys.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;

    // Build a reverse map from display labels → KeyboardEvent.code (once per popup)
    function getReverseMap() {
      if (window.__revShortcutLabelMap) return window.__revShortcutLabelMap;

      const display = window.ShortcutUtils?.displayFromCode || window.displayFromCode;
      const codes = [
        // Letters
        ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
        // Top-row digits + numpad digits
        ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
        ...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
        // Function keys
        ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
        // Punctuation/symbols
        'Minus',
        'Equal',
        'BracketLeft',
        'BracketRight',
        'Backslash',
        'Semicolon',
        'Quote',
        'Comma',
        'Period',
        'Slash',
        'Backquote',
        // Navigation/whitespace/control
        'Space',
        'Enter',
        'Escape',
        'Tab',
        'Backspace',
        'Delete',
        'Insert',
        'Home',
        'End',
        'PageUp',
        'PageDown',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        // Numpad ops
        'NumpadDivide',
        'NumpadMultiply',
        'NumpadSubtract',
        'NumpadAdd',
        'NumpadDecimal',
        'NumpadEnter',
        'NumpadEqual',
        // Lock/system/context
        'CapsLock',
        'NumLock',
        'ScrollLock',
        'PrintScreen',
        'Pause',
        'ContextMenu',
        // International
        'IntlBackslash',
        'IntlYen',
        'IntlRo',
        'Lang1',
        'Lang2',
        'Lang3',
        'Lang4',
        'Lang5',
        // Media (stay consistent with your chips)
        'VolumeMute',
        'VolumeDown',
        'VolumeUp',
        'MediaPlayPause',
        'MediaTrackNext',
        'MediaTrackPrevious',
        // Modifiers (for label matching; we still ignore as assignments)
        'MetaLeft',
        'MetaRight',
        'AltLeft',
        'AltRight',
        'ControlLeft',
        'ControlRight',
        'ShiftLeft',
        'ShiftRight',
        'Fn',
      ];

      const exact = Object.create(null);
      const lower = Object.create(null);
      const set = new Set(codes);

      // Known synonym labels → codes
      const synonyms = {
        Bksp: 'Backspace',
        Backspace: 'Backspace',
        Del: 'Delete',
        Delete: 'Delete',
        Esc: 'Escape',
        Enter: 'Enter',
        '↩': 'Enter',
        '⎋': 'Escape',
        '⇥': 'Tab',
        Tab: 'Tab',
        Space: 'Space',
        // Arrows
        '↑': 'ArrowUp',
        '↓': 'ArrowDown',
        '←': 'ArrowLeft',
        '→': 'ArrowRight',
        // Paging
        PgUp: 'PageUp',
        PgDn: 'PageDown',
        'Page Up': 'PageUp',
        'Page Down': 'PageDown',
        // Navigation
        Home: 'Home',
        End: 'End',
        Insert: 'Insert',
        // Media and volume
        Mute: 'VolumeMute',
        'Vol+': 'VolumeUp',
        'Vol-': 'VolumeDown',
        'Vol–': 'VolumeDown',
        'Play/Pause': 'MediaPlayPause',
        Next: 'MediaTrackNext',
        Prev: 'MediaTrackPrevious',
        // Platform modifiers
        Win: 'MetaLeft',
        '⌘': 'MetaLeft',
        Command: 'MetaLeft',
        Ctrl: 'ControlLeft',
        Control: 'ControlLeft',
        '⌥': 'AltLeft',
        Alt: 'AltLeft',
        '⇧': 'ShiftLeft',
        Shift: 'ShiftLeft',
        Fn: 'Fn',
      };

      // Fill from synonyms first (exact + lowercase)
      Object.keys(synonyms).forEach((label) => {
        const code = synonyms[label];
        exact[label] = code;
        lower[label.toLowerCase()] = code;
      });

      // Derive from your displayFromCode for canonical labels
      codes.forEach((c) => {
        const label = display ? display(c) : '';
        if (!label || label === '\u00A0') return;
        if (!exact[label]) exact[label] = c;
        const lc = label.toLowerCase();
        if (!lower[lc]) lower[lc] = c;
      });

      // Also allow raw code names typed directly (e.g., "Insert", "MediaPlayPause")
      codes.forEach((c) => {
        if (!exact[c]) exact[c] = c;
        const lc = c.toLowerCase();
        if (!lower[lc]) lower[lc] = c;
      });

      window.__revShortcutLabelMap = { exact, lower, set };
      return window.__revShortcutLabelMap;
    }

    // KEYDOWN: primary path for all keys
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') return; // allow navigation
      e.preventDefault();
      e.stopPropagation();

      // Mark that keydown handled this; ignore the next input event flicker
      this.dataset.justHandled = '1';
      setTimeout(() => {
        this.dataset.justHandled = '';
      }, 60);

      // Escape: restore current assignment
      if (e.code === 'Escape') {
        const prevCode = this.dataset.keyCode || '';
        this.value = prevCode ? codeToDisplayChar(prevCode) : '';
        return;
      }

      // Clear on Backspace/Delete
      if (e.code === 'Backspace' || e.code === 'Delete') {
        saveShortcutValue(id, '');
        this.dataset.keyCode = '';
        this.value = '';
        shortcutKeyValues[id] = '';
        showToast('Shortcut cleared. Reload page to apply changes.');
        return;
      }

      // Ignore bare modifiers
      if (/^(Shift|Alt|Control|Meta|Fn)(Left|Right)?$/.test(e.code)) return;

      const code = e.code;
      const selfOwner = { type: 'shortcut', id };
      const conflicts = window.ShortcutUtils.buildConflictsForCode(code, selfOwner);

      const proceed = () => {
        window.ShortcutUtils.clearOwners(conflicts, () => {
          saveShortcutValue(id, code, true);
          this.dataset.keyCode = code;
          this.value = codeToDisplayChar(code);
          shortcutKeyValues[id] = this.value;
          showToast('Options saved. Reload page to apply changes.');
        });
      };

      if (conflicts.length) {
        if (prefs.autoOverwrite) return proceed();
        const keyLabel = codeToDisplayChar(code);
        const targetLabel = getShortcutLabelById(id) || '';
        const names = conflicts.map((c) => c.label).join(', ');
        window.showDuplicateModal(
          names,
          (yes, remember) => {
            if (yes) {
              if (remember) {
                prefs.autoOverwrite = true;
                chrome.storage.sync.set({ autoOverwrite: true });
              }
              proceed();
            }
          },
          { keyLabel, targetLabel },
        );
      } else {
        proceed();
      }
    });

    // INPUT: fallback for typing/pasting characters or labels
    input.addEventListener('input', function () {
      // If keydown just handled it, ignore this input event to prevent false "unsupported"
      if (this.dataset.justHandled === '1') {
        const current = this.dataset.keyCode || '';
        this.value = current ? codeToDisplayChar(current) : '';
        this.dataset.justHandled = '';
        return;
      }

      const raw = this.value.trim();
      if (!raw) {
        saveShortcutValue(id, '');
        this.dataset.keyCode = '';
        shortcutKeyValues[id] = '';
        showToast('Shortcut cleared. Reload page to apply changes.');
        return;
      }

      // If raw equals current display, keep current code (no change)
      const currentCode = this.dataset.keyCode || '';
      if (currentCode && raw === codeToDisplayChar(currentCode)) {
        this.value = codeToDisplayChar(currentCode);
        return;
      }

      // Try character → code first
      let code = (window.ShortcutUtils?.charToCode || charToCode)(raw);

      // Try label/code reverse map
      if (!code) {
        const map = getReverseMap();
        code = map.exact[raw] || map.lower[raw.toLowerCase()] || '';
      }

      if (!code) {
        // No mapping found; revert to the last good display (if any) and notify
        this.value = currentCode ? codeToDisplayChar(currentCode) : '';
        showToast('Unsupported key. Press a key or enter a valid shortcut label.');
        return;
      }

      const selfOwner = { type: 'shortcut', id };
      const conflicts = window.ShortcutUtils.buildConflictsForCode(code, selfOwner);

      const proceed = () => {
        window.ShortcutUtils.clearOwners(conflicts, () => {
          saveShortcutValue(id, code, true);
          this.dataset.keyCode = code;
          this.value = codeToDisplayChar(code);
          shortcutKeyValues[id] = this.value;
          showToast('Options saved. Reload page to apply changes.');
        });
      };

      if (conflicts.length) {
        if (prefs.autoOverwrite) return proceed();

        const keyLabel = codeToDisplayChar(code);
        const targetLabel = getShortcutLabelById(id) || '';
        const names = conflicts.map((c) => c.label).join(', ');
        window.showDuplicateModal(
          names,
          (yes, remember) => {
            if (yes) {
              if (remember) {
                prefs.autoOverwrite = true;
                chrome.storage.sync.set({ autoOverwrite: true });
              }
              proceed();
            } else {
              // Revert to previously persisted value
              chrome.storage.sync.get(id, (data) => {
                const val = data?.[id];
                const prev = val && val !== '\u00A0' ? val : '';
                this.dataset.keyCode = prev || '';
                this.value = prev ? codeToDisplayChar(prev) : '';
              });
            }
          },
          { keyLabel, targetLabel },
        );
      } else {
        proceed();
      }
    });
  });

  // Handling separator keys (copyCodeUserSeparator) -- now robustly stored like 111

  const separatorKeys = ['copyCodeUserSeparator'];

  // Save separators without trimming or alteration
  separatorKeys.forEach((id) => {
    const inputField = document.getElementById(id);
    if (inputField && !inputField.dataset.listenerAttached) {
      /* ---------- Persist separator input on blur ---------- */
      /* keep exact whitespace – no .trim() */
      inputField.addEventListener('blur', function () {
        const converted = sep_UItoStorage(this.value); // literal "\n" → real newlines
        chrome.storage.sync.set({ [id]: converted }, () => {
          showToast('Separator saved. Reload page to apply changes.');
        });
        this.value = sep_storageToUI(converted); // keep UI in literal form
      });
      inputField.dataset.listenerAttached = 'true';
    }
  });

  const moveTopBarCheckbox = document.getElementById('moveTopBarToBottomCheckbox');
  const slider = document.getElementById('popupBottomBarOpacityValue');
  const sliderValueDisplay = document.getElementById('opacityValue');
  const previewIcon = document.getElementById('opacityPreviewIcon');
  const tooltipContainer = document.getElementById('opacity-tooltip-container');

  if (moveTopBarCheckbox && slider && sliderValueDisplay && previewIcon && tooltipContainer) {
    // Only proceed if all required elements exist
    chrome.storage.sync.get('popupBottomBarOpacityValue', ({ popupBottomBarOpacityValue }) => {
      const val = typeof popupBottomBarOpacityValue === 'number' ? popupBottomBarOpacityValue : 0.6;
      slider.value = val;
      sliderValueDisplay.textContent = val.toFixed(2);
      previewIcon.style.opacity = val;
    });

    function toggleOpacityUI(visible) {
      tooltipContainer.style.display = visible ? 'flex' : 'none';
    }

    // Update visibility initially and on change
    chrome.storage.sync.get('moveTopBarToBottomCheckbox', ({ moveTopBarToBottomCheckbox }) => {
      const isVisible =
        moveTopBarToBottomCheckbox !== undefined ? moveTopBarToBottomCheckbox : false;
      moveTopBarCheckbox.checked = isVisible;
      toggleOpacityUI(isVisible);
    });

    moveTopBarCheckbox.addEventListener('change', () => {
      const isChecked = moveTopBarCheckbox.checked;
      toggleOpacityUI(isChecked);
      chrome.storage.sync.set({ moveTopBarToBottomCheckbox: isChecked });
    });

    let sliderTimeout;
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      sliderValueDisplay.textContent = val.toFixed(2);
      previewIcon.style.opacity = val;

      clearTimeout(sliderTimeout);
      sliderTimeout = setTimeout(() => {
        let numericVal = Number(slider.value);
        if (Number.isNaN(numericVal)) numericVal = 0.6;

        chrome.storage.sync.set({ popupBottomBarOpacityValue: numericVal }, () => {
          if (chrome.runtime.lastError) {
            console.error('Storage set error:', chrome.runtime.lastError);
          } else {
            console.log('popupBottomBarOpacityValue set to', numericVal);
            showToast('Opacity saved. Reload page to apply changes.');
          }
        });
      }, 500);
    });
  }

  setTimeout(() => {
    balanceWrappedLabels();
  }, 50); // delay lets i18n/localization update labels first

  // ===================== @note Import and Export Settings IIFE =====================

  // === Backup & Restore (Export/Import) ===
  (function settingsBackupInit() {
    // DRY whitelist: all default keys minus shortcut keys
    const OPTION_KEYS = Object.keys(DEFAULT_PRESET_DATA).filter(
      (key) => !shortcutKeys.includes(key),
    );
    function getExportKeySet() {
      return new Set([...shortcutKeys, ...OPTION_KEYS]);
    }

    // i18n helper — mirrors your 111/222 approach but works in JS too.
    // Usage: t('key') or t('key', 'substitution')
    function t(key, substitution) {
      try {
        const msg = chrome?.i18n?.getMessage?.(key, substitution);
        return msg?.trim() || key; // optional chain + same fallback semantics
      } catch (_) {
        return key;
      }
    }

    /**
     * Normalize any stored/loaded shortcut value to a valid
     * `KeyboardEvent.code` or NBSP placeholder.
     *
     * 1. Accepts already-valid code strings like "Slash" — **fixes import bug**.
     * 2. Converts single printable characters (e.g. "/") to codes.
     * 3. Returns NBSP for empty/invalid input.
     */
    function normalizeShortcutVal(v) {
      // ── empty / placeholder handling ───────────────────────────────────
      if (v == null) return '\u00A0';
      const s = String(v).trim();
      if (s === '' || s === '\u00A0') return '\u00A0';

      // ── fast-path: value is already a valid `KeyboardEvent.code` ───────
      //    Added `Slash` and other punctuation codes that were missing.
      // Full-string match for every valid KeyboardEvent.code
      const CODE_RE =
        /^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(?:Left|Right|Up|Down)|F(?:[1-9]|1[0-9]|2[0-4])|Backspace|Enter|Escape|Tab|Space|Minus|Equal|Bracket(?:Left|Right)|Semicolon|Quote|Comma|Period|Slash|Backslash|Backquote|Delete|Insert|Home|End|Page(?:Up|Down)|CapsLock|NumLock|ScrollLock|PrintScreen|Pause|ContextMenu|Numpad(?:Divide|Multiply|Subtract|Add|Decimal|Enter|Equal)|Volume(?:Mute|Down|Up)|Media(?:PlayPause|TrackNext|TrackPrevious)|Meta(?:Left|Right)|Alt(?:Left|Right)|Control(?:Left|Right)|Shift(?:Left|Right)|Fn)$/;

      if (CODE_RE.test(s)) return s;

      // ── fallback: convert single printable char to code ────────────────
      const toCode = window.ShortcutUtils?.charToCode || charToCode;
      const converted = toCode ? toCode(s) : '';

      return converted || '\u00A0';
    }

    function exportSettingsToFile() {
      const keySet = getExportKeySet();

      // Build reverse label map on demand to translate visible labels (↑, Enter, Mute) back to codes
      function getReverseMap() {
        if (window.__revShortcutLabelMapForExport) return window.__revShortcutLabelMapForExport;
        const display = window.ShortcutUtils?.displayFromCode || window.displayFromCode;
        const codes = [
          ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
          ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
          ...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
          ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
          'Minus',
          'Equal',
          'BracketLeft',
          'BracketRight',
          'Backslash',
          'Semicolon',
          'Quote',
          'Comma',
          'Period',
          'Slash',
          'Backquote',
          'Space',
          'Enter',
          'Escape',
          'Tab',
          'Backspace',
          'Delete',
          'Insert',
          'Home',
          'End',
          'PageUp',
          'PageDown',
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'NumpadDivide',
          'NumpadMultiply',
          'NumpadSubtract',
          'NumpadAdd',
          'NumpadDecimal',
          'NumpadEnter',
          'NumpadEqual',
          'CapsLock',
          'NumLock',
          'ScrollLock',
          'PrintScreen',
          'Pause',
          'ContextMenu',
          'IntlBackslash',
          'IntlYen',
          'IntlRo',
          'Lang1',
          'Lang2',
          'Lang3',
          'Lang4',
          'Lang5',
          'VolumeMute',
          'VolumeDown',
          'VolumeUp',
          'MediaPlayPause',
          'MediaTrackNext',
          'MediaTrackPrevious',
          'MetaLeft',
          'MetaRight',
          'AltLeft',
          'AltRight',
          'ControlLeft',
          'ControlRight',
          'ShiftLeft',
          'ShiftRight',
          'Fn',
        ];
        const exact = Object.create(null);
        const lower = Object.create(null);

        // Known synonyms
        const synonyms = {
          Bksp: 'Backspace',
          Backspace: 'Backspace',
          Del: 'Delete',
          Delete: 'Delete',
          Esc: 'Escape',
          '⎋': 'Escape',
          Enter: 'Enter',
          '↩': 'Enter',
          '⇥': 'Tab',
          Tab: 'Tab',
          Space: 'Space',
          '↑': 'ArrowUp',
          '↓': 'ArrowDown',
          '←': 'ArrowLeft',
          '→': 'ArrowRight',
          PgUp: 'PageUp',
          PgDn: 'PageDown',
          'Page Up': 'PageUp',
          'Page Down': 'PageDown',
          Home: 'Home',
          End: 'End',
          Insert: 'Insert',
          Mute: 'VolumeMute',
          'Vol+': 'VolumeUp',
          'Vol-': 'VolumeDown',
          'Vol–': 'VolumeDown',
          'Play/Pause': 'MediaPlayPause',
          Next: 'MediaTrackNext',
          Prev: 'MediaTrackPrevious',
          Win: 'MetaLeft',
          '⌘': 'MetaLeft',
          Command: 'MetaLeft',
          Ctrl: 'ControlLeft',
          Control: 'ControlLeft',
          '⌥': 'AltLeft',
          Alt: 'AltLeft',
          '⇧': 'ShiftLeft',
          Shift: 'ShiftLeft',
          Fn: 'Fn',
        };
        Object.keys(synonyms).forEach((lbl) => {
          exact[lbl] = synonyms[lbl];
          lower[lbl.toLowerCase()] = synonyms[lbl];
        });

        codes.forEach((c) => {
          const lbl = display ? display(c) : '';
          if (lbl && lbl !== '\u00A0') {
            exact[lbl] ||= c;
            lower[lbl.toLowerCase()] ||= c;
          }
          exact[c] ||= c;
          lower[c.toLowerCase()] ||= c;
        });

        window.__revShortcutLabelMapForExport = { exact, lower };
        return window.__revShortcutLabelMapForExport;
      }

      function effectiveShortcutCode(id, stored) {
        // 0) If the user explicitly cleared this shortcut, preserve the clear in the export.
        //    NBSP is our canonical "cleared" sentinel for shortcut fields.
        if (stored === '\u00A0') return '\u00A0';

        // 1) If storage holds a real value, export it (normalize in case it's a label/char).
        if (typeof stored === 'string' && stored.trim()) {
          return normalizeShortcutVal(stored);
        }

        // 2) Only for truly "unset" keys (no storage record), derive an effective value
        //    so first-time exports include defaults currently visible in the UI.
        const el = document.getElementById(id);

        // Prefer dataset (already a KeyboardEvent.code)
        const ds = el?.dataset?.keyCode || '';
        if (ds && ds !== '\u00A0') return ds;

        // Try the visible label/character in the input
        const visible = el?.value?.trim() || '';
        if (visible) {
          let code = (window.ShortcutUtils?.charToCode ?? charToCode)(visible) || '';
          if (!code) {
            const map = getReverseMap();
            code = map.exact[visible] || map.lower[visible.toLowerCase()] || '';
          }
          if (code) return code;
        }

        // HTML default attribute (single character) → code
        const defAttr = el?.getAttribute('value')?.trim() || '';
        if (defAttr) {
          const c = (window.ShortcutUtils?.charToCode ?? charToCode)(defAttr) || '';
          if (c) return c;
        }

        // Final fallback for known edge cases (e.g., "/")
        const fallback = DEFAULT_SHORTCUT_CODE_FALLBACKS?.[id] || '';
        return fallback || '\u00A0';
      }

      chrome.storage.sync.get(null, (all) => {
        const out = {};

        // Include all known keys present in storage (options, toggles, etc.)
        keySet.forEach((k) => {
          if (Object.hasOwn(all, k)) out[k] = all[k];
        });

        // Ensure EVERY shortcut key is present using "effective" value (not NBSP if a default exists)
        shortcutKeys.forEach((k) => {
          const stored = Object.hasOwn(all, k) ? all[k] : undefined;
          out[k] = effectiveShortcutCode(k, stored);
        });

        // Ensure modelPickerKeyCodes present (always 10)
        if (!Object.hasOwn(out, 'modelPickerKeyCodes')) {
          const codes = (
            typeof getModelPickerCodesCache === 'function'
              ? getModelPickerCodesCache()
              : window.__modelPickerKeyCodes || DEFAULT_MODEL_PICKER_KEY_CODES
          ).slice(0, 10);
          if (codes.length === 10) out.modelPickerKeyCodes = codes;
        }

        // Include modelNames (10 labels). Preserve your "→" for slot 5.
        {
          const storageNames = Array.isArray(all.modelNames) ? all.modelNames.slice(0, 10) : null;
          const windowNames =
            Array.isArray(window.MODEL_NAMES) && window.MODEL_NAMES.length >= 10
              ? window.MODEL_NAMES.slice(0, 10)
              : null;

          // Prefer storage → window → defaults, trim, normalize "->" to "→"
          const names10 = (storageNames || windowNames || MODEL_NAMES).slice(0, 10).map((s) =>
            String(s ?? '')
              .replace(/->/g, '→')
              .trim(),
          );

          out.modelNames = names10;
        }

        const payload = {
          __meta: {
            name: 'ChatGPT Custom Shortcuts Pro Settings',
            version: chrome.runtime?.getManifest?.().version || '',
            exportedAt: new Date().toISOString(),
          },
          data: out,
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `${dateStr}_chatgpt_custom_shortcuts_pro_settings.json`;

        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);

        showToast(t('toast_export_success'));
      });
    }

    function importSettingsObj(src) {
      const keySet = getExportKeySet();
      const next = {};

      Object.keys(src || {}).forEach((k) => {
        if (!keySet.has(k)) return;
        let v = src[k];
        if (shortcutKeys.includes(k)) {
          v = normalizeShortcutVal(v);
        }
        next[k] = v;
      });

      // If nothing recognized
      if (Object.keys(next).length === 0) {
        showToast(t('toast_import_no_compatible'));
        return;
      }

      // Confirm overwrite
      const proceed = window.confirm(t('confirm_import_overwrite'));
      if (!proceed) return;

      // Apply to storage
      // Apply to storage
      chrome.storage.sync.get(null, (curr) => {
        const merged = { ...curr, ...next };

        chrome.storage.sync.set(merged, () => {
          if (chrome.runtime.lastError) {
            console.error('Import error:', chrome.runtime.lastError);
            showToast(t('toast_import_failed', chrome.runtime.lastError.message));
            return;
          }

          // Rehydrate all shortcut inputs from storage so tricky defaults (e.g., Slash) render correctly
          if (typeof refreshShortcutInputsFromStorage === 'function') {
            refreshShortcutInputsFromStorage();
          }

          // Reflect options/radios provided by the file
          const reflectOption = (key, val) => {
            const el = document.getElementById(key);
            if (!el) return;

            if (el.type === 'checkbox' || el.type === 'radio') {
              el.checked = !!val;
              return;
            }

            if (typeof val === 'string' || typeof val === 'number') {
              if (key === 'copyCodeUserSeparator') {
                el.value = sep_storageToUI(val);
              } else {
                el.value = val;
              }
            }
          };
          Object.keys(next).forEach((k) => {
            if (shortcutKeys.includes(k)) return; // shortcuts already handled by refresh
            reflectOption(k, next[k]);
          });

          // If model picker codes provided, refresh local cache/UI
          if (Array.isArray(next.modelPickerKeyCodes) && next.modelPickerKeyCodes.length === 10) {
            try {
              window.__modelPickerKeyCodes = next.modelPickerKeyCodes.slice(0, 10);
              document.dispatchEvent(new CustomEvent('modelPickerHydrated'));
            } catch (_) {}
          }

          // If model names provided, update global + UI immediately
          if (Array.isArray(next.modelNames) && next.modelNames.length >= 5) {
            const nine = next.modelNames.slice(0, 9);
            if (nine[4] && /legacy/i.test(nine[4])) {
              nine[4] = `${nine[4].replace(/→/g, '').trim()} →`;
            }
            window.MODEL_NAMES = nine.concat('Show Models');
            if (typeof window.modelPickerRender === 'function') window.modelPickerRender();
            window.dispatchEvent(
              new CustomEvent('model-names-updated', { detail: { source: 'import' } }),
            );
          }

          showToast(t('toast_import_complete'));
        });
      });
    }

    function importSettingsFromFile() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(String(reader.result || '{}'));
            const src = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
            importSettingsObj(src);
          } catch (e) {
            console.error('Import parse error:', e);
            showToast(t('toast_import_invalid'));
          }
        };
        reader.readAsText(file);
      });
      input.click();
    }

    // JS — updated to rely on external CSS only
    // JS — updated to rely on external CSS only, now localized.
    // === Backup & Restore (Export/Import) tile: event listeners for static HTML ===
    function attachBackupTileHandlers() {
      const exportBtn = document.getElementById('btnExportSettings');
      const importBtn = document.getElementById('btnImportSettings');

      if (exportBtn) exportBtn.addEventListener('click', exportSettingsToFile);
      if (importBtn) importBtn.addEventListener('click', importSettingsFromFile);

      // Optionally hydrate tooltips and labels if needed (for i18n, etc.)
      if (typeof initTooltips === 'function') initTooltips();
      if (typeof balanceWrappedLabels === 'function') balanceWrappedLabels();
    }

    attachBackupTileHandlers();
    window.importSettingsObj = importSettingsObj;
  })();

  // ===================== Fade Slim Sidebar =====================

  const fadeSlimSidebarEnabled = document.getElementById('fadeSlimSidebarEnabled');
  const slimSidebarSlider = document.getElementById('popupSlimSidebarOpacityValue');
  const slimSidebarSliderValueDisplay = document.getElementById('slimSidebarOpacityValue');
  const slimSidebarPreviewIcon = document.getElementById('slimSidebarOpacityPreviewIcon');
  const slimSidebarTooltipContainer = document.getElementById(
    'slimSidebar-opacity-tooltip-container',
  );

  function setSlimSidebarOpacityUI(val) {
    slimSidebarSlider.value = val;
    slimSidebarSliderValueDisplay.textContent = Number(val).toFixed(2);
    slimSidebarPreviewIcon.style.opacity = val;
  }

  function toggleSlimSidebarOpacityUI(visible) {
    slimSidebarTooltipContainer.style.display = visible ? 'flex' : 'none';
  }

  // On load, sync checkbox, slider, and UI from storage, enforce "default to 0" logic
  if (fadeSlimSidebarEnabled) {
    chrome.storage.sync.get(['fadeSlimSidebarEnabled', 'popupSlimSidebarOpacityValue'], (data) => {
      const isEnabled = !!data.fadeSlimSidebarEnabled;
      let val =
        typeof data.popupSlimSidebarOpacityValue === 'number'
          ? data.popupSlimSidebarOpacityValue
          : null;
      fadeSlimSidebarEnabled.checked = isEnabled;
      toggleSlimSidebarOpacityUI(isEnabled);

      // On first enable, force to 0 unless already set
      if (isEnabled) {
        if (val === null) {
          // Set storage and UI to 0
          val = 0.0;
          chrome.storage.sync.set({ popupSlimSidebarOpacityValue: val });
        }
        setSlimSidebarOpacityUI(val);
      } else {
        // Don't touch opacity if disabled
        if (val !== null) setSlimSidebarOpacityUI(val);
        else setSlimSidebarOpacityUI(0.0);
      }
    });
  }

  // Checkbox toggles fade and ensures opacity is set to 0 if enabling for the first time
  if (fadeSlimSidebarEnabled) {
    fadeSlimSidebarEnabled.addEventListener('change', () => {
      const isChecked = fadeSlimSidebarEnabled.checked;
      toggleSlimSidebarOpacityUI(isChecked);

      if (isChecked) {
        // Check if value exists—if not, set to 0
        chrome.storage.sync.get('popupSlimSidebarOpacityValue', (data) => {
          let val =
            typeof data.popupSlimSidebarOpacityValue === 'number'
              ? data.popupSlimSidebarOpacityValue
              : null;
          if (val === null) {
            val = 0.0;
            chrome.storage.sync.set({ popupSlimSidebarOpacityValue: val });
            setSlimSidebarOpacityUI(val);
          } else {
            setSlimSidebarOpacityUI(val);
          }
          chrome.storage.sync.set({ fadeSlimSidebarEnabled: true }, () => {
            showToast('Options saved. Reload page to apply changes.');
          });
        });
      } else {
        chrome.storage.sync.set({ fadeSlimSidebarEnabled: false }, () => {
          showToast('Options saved. Reload page to apply changes.');
        });
      }
    });
  }

  // Slider logic – sync value to UI and storage
  let slimSidebarSliderTimeout;
  slimSidebarSlider.addEventListener('input', () => {
    const val = parseFloat(slimSidebarSlider.value);
    slimSidebarSliderValueDisplay.textContent = val.toFixed(2);
    slimSidebarPreviewIcon.style.opacity = val;

    clearTimeout(slimSidebarSliderTimeout);
    slimSidebarSliderTimeout = setTimeout(() => {
      let numericVal = Number(slimSidebarSlider.value);
      // Use the safe, non-coercing check to satisfy Biome: noGlobalIsNan
      if (Number.isNaN(numericVal)) numericVal = 0.0;

      chrome.storage.sync.set({ popupSlimSidebarOpacityValue: numericVal }, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage set error:', chrome.runtime.lastError);
        } else {
          showToast('Slim sidebar opacity saved. Reload page to apply changes.');
        }
      });
    }, 500);
  });

  /* === Shortcuts Presets (Clear All / Reset Defaults) Tile === */
  (function shortcutsPresetsInit() {
    // --- PRESET DATA ---
    const NBSP = '\u00A0';
    const CLEAR_PRESET_DATA = Object.assign(
      Object.fromEntries(shortcutKeys.map((k) => [k, NBSP])),
      { modelPickerKeyCodes: ['', '', '', '', '', '', '', '', '', ''] },
    );

    const DEFAULT_PRESET_DATA = window.DEFAULT_PRESET_DATA;

    // --- Button event handlers ---
    const clearBtn = document.getElementById('btnClearAllShortcuts');
    const resetBtn = document.getElementById('btnResetDefaults');

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        window.showDuplicateModal(
          `This will <strong style="color:#c00;font-weight:700;">clear all shortcut keys</strong>, but will not change any toggles or checkboxes.`,
          (yes) => {
            if (yes && typeof window.importSettingsObj === 'function') {
              window.importSettingsObj(CLEAR_PRESET_DATA, { skipBrowserConfirm: true });
            }
          },
          { proceedText: 'Clear all shortcuts?', simple: true, allowHTML: true },
        );
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        window.showDuplicateModal(
          `This will <strong style="color:#c00;font-weight:700;">restore the default values</strong> for all extension options and shortcut keys.`,
          (yes) => {
            if (yes && typeof window.importSettingsObj === 'function') {
              window.importSettingsObj(DEFAULT_PRESET_DATA, { skipBrowserConfirm: true });
            }
          },
          { proceedText: 'Reset all to defaults?', simple: true, allowHTML: true },
        );
      });
    }

    // Optionally hydrate tooltips/i18n if needed
    if (typeof initTooltips === 'function') initTooltips();
    if (typeof balanceWrappedLabels === 'function') balanceWrappedLabels();
  })();
});

function enableEditableOpacity(valueId, sliderId, previewIconId, storageKey, defaultVal) {
  const valueSpan = document.getElementById(valueId);
  const slider = document.getElementById(sliderId);
  const previewIcon = document.getElementById(previewIconId);

  if (!valueSpan || !slider || !previewIcon) return;

  valueSpan.addEventListener('click', startEdit);
  valueSpan.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') startEdit();
  });

  function startEdit() {
    valueSpan.classList.add('editing'); // <--- ADD HERE
    const currentValue = parseFloat(valueSpan.textContent);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue.toFixed(2);
    input.maxLength = 4;
    input.style.width = '2.4em';
    valueSpan.textContent = '';
    valueSpan.appendChild(input);
    input.select();
    input.setSelectionRange(2, 4);

    input.addEventListener('input', () => {
      let val = parseFloat(input.value.replace(/[^\d.]/g, ''));
      if (Number.isNaN(val)) val = '';
      else {
        if (val > 1) val = 1;
        if (val < 0) val = 0;
        val = Math.round(val * 100) / 100;
      }
      slider.value = val || 0;
      previewIcon.style.opacity = val || 0;
    });

    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (!/[0-9.]|Backspace|ArrowLeft|ArrowRight|Tab/.test(e.key) && e.key.length === 1) {
        e.preventDefault();
      }
    });
  }

  function finishEdit(e) {
    valueSpan.classList.remove('editing'); // <--- REMOVE HERE
    let val = parseFloat(e.target.value.replace(/[^\d.]/g, ''));
    if (Number.isNaN(val)) val = defaultVal;
    if (val > 1) val = 1;
    if (val < 0) val = 0;
    val = Math.round(val * 100) / 100;
    valueSpan.textContent = val.toFixed(2);
    slider.value = val;
    previewIcon.style.opacity = val;
    const obj = {};
    obj[storageKey] = val;
    chrome.storage.sync.set(obj);
  }

  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    valueSpan.textContent = val.toFixed(2);
    previewIcon.style.opacity = val;
  });
}

enableEditableOpacity(
  'opacityValue',
  'popupBottomBarOpacityValue',
  'opacityPreviewIcon',
  'popupBottomBarOpacityValue',
  0.6,
);
enableEditableOpacity(
  'slimSidebarOpacityValue',
  'popupSlimSidebarOpacityValue',
  'slimSidebarOpacityPreviewIcon',
  'popupSlimSidebarOpacityValue',
  0.0,
);

// ===================== Model Picker Keys (robust save + duplicates + clear + reset) =====================
function modelPickerInitSafe() {
  // Wait for ShortcutUtils to load (for hot reload/async)
  if (
    typeof window.ShortcutUtils !== 'object' ||
    typeof window.ShortcutUtils.getModelPickerCodesCache !== 'function'
  ) {
    if (!modelPickerInitSafe._tries) modelPickerInitSafe._tries = 0;
    if (modelPickerInitSafe._tries++ > 30) return;
    return setTimeout(modelPickerInitSafe, 16);
  }

  const chips = Array.from(document.querySelectorAll('.mp-key'));
  if (!chips.length) return;

  // Always use current codes + current MODEL_NAMES
  // Re-render every chip after cache change, reset, etc.
  function render() {
    const codes = window.ShortcutUtils.getModelPickerCodesCache();
    const NAMES = window.MODEL_NAMES || [];

    chips.forEach((chip, i) => {
      // Clear any “listening…” state
      chip.classList.remove('listening');

      // Human-readable key text inside the chip
      chip.textContent = window.ShortcutUtils.displayFromCode(codes[i] || '');

      // Tooltip & accessibility label use model name from JS, never hard-coded HTML
      const prettyName = NAMES[i] || `Slot ${i + 1}`;
      const tipText = `Set shortcut for\n${prettyName}`;

      chip.setAttribute('data-tooltip', tipText);
      chip.setAttribute('aria-label', `Set shortcut for ${prettyName}`);

      // Ensure required classes/attrs are present (safe idempotent)
      chip.classList.add('custom-tooltip');
      if (!chip.hasAttribute('role')) chip.setAttribute('role', 'button');
      if (!chip.hasAttribute('tabindex')) chip.setAttribute('tabindex', '0');
    });
  }
  window.modelPickerRender = render; // <-- add this line to allow global instant re-render

  // Reset button (always triggers full rerender after update)
  (function wireResetButton() {
    let resetEl = document.getElementById('mp-reset-keys');
    if (!resetEl) {
      resetEl = Array.from(document.querySelectorAll('.mp-icons .material-symbols-outlined')).find(
        (el) => (el.textContent || '').trim() === 'reset_wrench',
      );
      if (resetEl) {
        resetEl.setAttribute('role', 'button');
        resetEl.setAttribute('tabindex', '0');
        resetEl.setAttribute('aria-label', 'Reset model keys to defaults');
        resetEl.classList.add('tooltip');
        if (!resetEl.getAttribute('data-tooltip')) {
          resetEl.setAttribute('data-tooltip', 'Reset model keys to defaults');
        }
      }
    }
    if (!resetEl || resetEl.dataset.mpResetWired) return;

    function showConfirmReset(cb) {
      let overlay = document.getElementById('dup-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'dup-overlay';
        overlay.style.display = 'none';
        overlay.innerHTML = `
        <div id="dup-box">
          <h2 id="dup-h2" style="margin:0 0 6px 0; font-size:14px; font-weight:400;"></h2>
          <p id="dup-msg" style="margin:0 0 10px 0; font-size:14px; font-weight:400;"></p>
          <label id="dup-dont-wrap" style="display:none;"><input id="dup-dont" type="checkbox"> Don’t ask me again</label>
          <div class="dup-btns" style="display:flex;gap:.5em;margin-top:10px;">
            <button id="dup-no">Cancel</button>
            <button id="dup-yes">Yes</button>
          </div>
        </div>`;
        document.body.appendChild(overlay);
      }
      const h2 = overlay.querySelector('#dup-h2');
      const msg = overlay.querySelector('#dup-msg');
      const dontWrap = overlay.querySelector('#dup-dont-wrap');
      const oldCancel = overlay.querySelector('#dup-no');
      const oldYes = overlay.querySelector('#dup-yes');
      if (h2) h2.textContent = 'Reset all model keys to defaults?';
      if (msg) msg.textContent = 'This will replace your custom keys.';
      if (dontWrap) dontWrap.style.display = 'none';
      const newCancel = oldCancel.cloneNode(true);
      const newYes = oldYes.cloneNode(true);
      oldCancel.parentNode.replaceChild(newCancel, oldCancel);
      oldYes.parentNode.replaceChild(newYes, oldYes);
      newCancel.addEventListener('click', () => {
        overlay.style.display = 'none';
        cb(false);
      });
      newYes.addEventListener('click', () => {
        overlay.style.display = 'none';
        cb(true);
      });
      overlay.style.display = 'flex';
    }

    function triggerReset() {
      showConfirmReset((yes) => {
        if (!yes) return;
        const defaults = [
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
        window.saveModelPickerKeyCodes(defaults, (ok) => {
          if (typeof window.showToast === 'function') {
            window.showToast(
              ok ? 'Model keys reset to defaults.' : 'Reset attempted; please reopen the popup.',
            );
          }
          render();
        });
      });
    }
    resetEl.style.cursor = 'pointer';
    resetEl.addEventListener('click', triggerReset);
    resetEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerReset();
      }
    });
    resetEl.dataset.mpResetWired = '1';
  })();

  let activeChip = null;
  let activeKeyHandler = null;

  // Helper: track whether focus came from keyboard Tab (vs mouse)
  function makeTabFocusHelper() {
    let tabIntent = false;
    let t = null;
    const arm = () => {
      tabIntent = true;
      clearTimeout(t);
      t = setTimeout(() => {
        tabIntent = false;
      }, 400);
    };
    const disarm = () => {
      tabIntent = false;
      clearTimeout(t);
      t = null;
    };
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Tab') arm();
      },
      true,
    );
    ['mousedown', 'pointerdown', 'touchstart'].forEach((ev) => {
      window.addEventListener(ev, disarm, true);
    });
    return {
      shouldAutoSetOnFocus() {
        return tabIntent;
      },
      clear() {
        disarm();
      },
    };
  }
  const tabFocusHelper = makeTabFocusHelper();

  function cancelActiveCapture() {
    if (!activeChip || !activeKeyHandler) return;
    activeChip.removeEventListener('keydown', activeKeyHandler, true);
    activeChip.classList.remove('listening');
    activeChip.setAttribute('aria-pressed', 'false');
    activeChip = null;
    activeKeyHandler = null;
    render();
  }

  chips.forEach((chip, idx) => {
    // Minimal helper: Focus and start set mode on given chip index, if valid
    function focusAndStartNextChip(nextIdx) {
      if (typeof nextIdx !== 'number' || nextIdx < 0 || nextIdx >= chips.length) return;
      const nextChip = chips[nextIdx];
      // Prevent recursion: only call startCapture if not already listening
      if (!nextChip.classList.contains('listening')) {
        nextChip.focus();
        setTimeout(() => {
          // Ensure focus is visible before starting capture
          if (document.activeElement === nextChip) startCaptureOnIdx(nextIdx);
        }, 0);
      }
    }

    // The main capture routine (moved out for re-use)
    function startCaptureOnIdx(setIdx) {
      const currentChip = chips[setIdx];
      if (activeChip && activeChip !== currentChip) cancelActiveCapture();
      if (activeChip === currentChip) return;

      currentChip.classList.add('listening');
      currentChip.setAttribute('aria-pressed', 'true');
      currentChip.textContent = 'Set';
      const onKey = (e) => {
        // Tab navigation: move to next/prev chip, and enter set mode on that chip
        if (e.key === 'Tab') {
          cancelActiveCapture();
          // Handle Shift+Tab for backwards navigation
          const dir = e.shiftKey ? -1 : 1;
          let nextIdx = setIdx + dir;
          // Loop around if at ends
          if (nextIdx < 0) nextIdx = chips.length - 1;
          if (nextIdx >= chips.length) nextIdx = 0;
          e.preventDefault();
          e.stopPropagation();
          focusAndStartNextChip(nextIdx);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const code = e.code;
        if (code === 'Escape') {
          cancelActiveCapture();
          return;
        }
        if (code === 'Backspace' || code === 'Delete') {
          const codes = window.ShortcutUtils.getModelPickerCodesCache().slice();
          codes[setIdx] = '';
          window.saveModelPickerKeyCodes(codes, () => {
            cancelActiveCapture();
            if (typeof window.showToast === 'function') {
              window.showToast(`Cleared key for slot ${setIdx + 1}.`);
            }
            render();
            // Auto-hop to next chip, unless we're at the last chip
            focusAndStartNextChip(setIdx + 1);
          });
          return;
        }
        // Ignore pure modifier keys
        if (/^(Shift|Alt|Control|Meta)(Left|Right)$/.test(code)) return;

        const modelMod =
          typeof getModelPickerModifier === 'function' ? getModelPickerModifier() : 'alt';
        const selfOwner = { type: 'model', idx: setIdx, modifier: modelMod };
        const conflicts = window.ShortcutUtils.buildConflictsForCode
          ? window.ShortcutUtils.buildConflictsForCode(code, selfOwner)
          : [];

        const proceedAssign = () => {
          window.ShortcutUtils.clearOwners?.(conflicts, () => {
            const codes = window.ShortcutUtils.getModelPickerCodesCache().slice();
            codes[setIdx] = code;
            window.saveModelPickerKeyCodes(codes, () => {
              cancelActiveCapture();
              render();
              // After setting, auto-hop to next chip if not on last
              focusAndStartNextChip(setIdx + 1);
            });
          });
        };

        if (conflicts.length) {
          if (window.prefs?.autoOverwrite) {
            proceedAssign();
          } else {
            const keyLabel = window.ShortcutUtils.displayFromCode
              ? window.ShortcutUtils.displayFromCode(code)
              : code;
            const MODEL_NAMES = window.MODEL_NAMES || [];
            const toLabel = MODEL_NAMES[setIdx] || `Model slot ${setIdx + 1}`;
            if (conflicts.length === 1) {
              const owners = [conflicts[0].label];
              window.showDuplicateModal(
                owners,
                (yes, remember) => {
                  if (yes) {
                    if (remember) {
                      window.prefs = window.prefs || {};
                      window.prefs.autoOverwrite = true;
                      chrome.storage.sync.set({ autoOverwrite: true });
                    }
                    proceedAssign();
                  } else {
                    cancelActiveCapture();
                  }
                },
                { keyLabel, targetLabel: toLabel },
              );
            } else {
              const currentCodes = window.ShortcutUtils.getModelPickerCodesCache();
              const lines = conflicts.map((c) => {
                let k = '';
                if (c.type === 'shortcut') {
                  const el = document.getElementById(c.id);
                  const ch = el?.value?.trim() || '';
                  k = ch || '?';
                } else if (c.type === 'model') {
                  const cur = currentCodes[c.idx];
                  k = window.ShortcutUtils.displayFromCode
                    ? window.ShortcutUtils.displayFromCode(cur)
                    : cur || '?';
                }
                return { key: k, from: c.label, to: toLabel };
              });
              const names = conflicts.map((c) => c.label).join(', ');
              window.showDuplicateModal(
                names,
                (yes, remember) => {
                  if (yes) {
                    if (remember) {
                      window.prefs = window.prefs || {};
                      window.prefs.autoOverwrite = true;
                      chrome.storage.sync.set({ autoOverwrite: true });
                    }
                    proceedAssign();
                  } else {
                    cancelActiveCapture();
                  }
                },
                { lines, proceedText: 'Proceed with changes?' },
              );
            }
          }
        } else {
          proceedAssign();
        }
      };
      currentChip.addEventListener('keydown', onKey, true);
      activeChip = currentChip;
      activeKeyHandler = onKey;
      currentChip.focus();
    }

    // For event handlers below, always call startCaptureOnIdx(idx) instead of inlining logic
    // Mouse/touch click starts capture
    chip.addEventListener('click', () => startCaptureOnIdx(idx));

    // Keyboard: Enter/Space starts capture when focused
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') startCaptureOnIdx(idx);
    });

    // Keyboard: If focus arrives via Tab, auto-enter capture.
    chip.addEventListener('focus', () => {
      // Avoid recursion when we programmatically focus() inside startCaptureOnIdx
      if (chip.classList.contains('listening')) return;
      if (tabFocusHelper.shouldAutoSetOnFocus()) startCaptureOnIdx(idx);
    });
  });

  document.addEventListener('mousedown', (evt) => {
    if (!activeChip) return;
    if (!evt.target.closest('.mp-icons')) {
      cancelActiveCapture();
    }
  });

  // Stay perfectly in sync with changes (after delete/reset/dup/modal etc)
  document.addEventListener('modelPickerHydrated', render);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.modelPickerKeyCodes) {
      render();
    }
  });
  render();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', modelPickerInitSafe, {
    once: true,
  });
} else {
  modelPickerInitSafe();
}

// Search Filter IIFE

(() => {
  let container,
    bar,
    input,
    idx = [],
    altTables;
  const qSel = (s) => Array.from((container || document).querySelectorAll(s));
  const tok = (s) =>
    (s || '')
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .split(/[^a-z0-9]+/g)
      .filter(Boolean);
  const loadAlt = () => {
    if (altTables) return altTables;
    altTables = [];
    const guesses = [
      window.APP_LOCALE_MESSAGES,
      window.I18N_MESSAGES,
      window.localeMessages,
      window.messages,
    ];
    // Avoid returning a value from forEach callback (Biome: useIterableCallbackReturn)
    guesses.forEach((t) => {
      if (t) altTables.push(t);
    });
    try {
      const el = document.getElementById('i18n-messages');
      if (el?.textContent) altTables.push(JSON.parse(el.textContent));
    } catch {}
    return altTables;
  };

  const getMsg = (key) => {
    if (!key) return '';
    try {
      if (chrome?.i18n?.getMessage) {
        const s = chrome.i18n.getMessage(key);
        if (s) return s;
      }
    } catch {}
    for (const tbl of loadAlt()) {
      if (!tbl) continue;
      if (typeof tbl[key] === 'string') return tbl[key];
      if (tbl[key]?.message) return String(tbl[key].message);
    }
    return '';
  };
  const resolveMSG = (v) => {
    const m = /^__MSG_([A-Za-z0-9_]+)__$/.exec(v || '');
    return m ? getMsg(m[1]) : v || '';
  };

  const collect = (tile) => {
    const out = [];

    // Visible strings and inline text
    tile.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.getAttribute('data-i18n');
      const msg = getMsg(k);
      if (msg) out.push(msg);

      const txt = (el.textContent || '').trim();
      if (txt) out.push(txt);
    });

    // Tooltips (avoid returning from forEach)
    tile.querySelectorAll('[data-tooltip]').forEach((el) => {
      const tooltip = resolveMSG(el.getAttribute('data-tooltip') || '');
      if (tooltip) out.push(tooltip);
    });

    // Common ARIA/title/placeholder attributes
    ['aria-label', 'title', 'placeholder'].forEach((attr) => {
      const raw = tile.getAttribute(attr);
      if (raw) {
        const val = resolveMSG(raw);
        if (val) out.push(val);
      }
    });

    // Shortcut key labels/inputs
    tile
      .querySelectorAll('.shortcut-keys .key-text, .shortcut-keys input.key-input')
      .forEach((el) => {
        const val = (el.value || el.textContent || '').trim();
        if (val) out.push(val);
      });

    return out.filter(Boolean);
  };

  const build = () => {
    const tiles = qSel('.shortcut-item');
    idx = tiles.map((el, i) => {
      el.dataset.tileId ||= `tile-${i}`;
      const words = new Set(collect(el).flatMap(tok));
      return { el, words };
    });
  };

  const match = (set, t) => {
    if (set.has(t)) return true; // exact token match
    for (const w of set) {
      // partial, anywhere in the word
      if (w.includes(t)) return true;
    }
    return false;
  };

  const apply = (q) => {
    const tokens = tok(q),
      all = tokens.length === 0;
    idx.forEach(({ el, words }) => {
      const ok = all || tokens.every((t) => match(words, t));
      el.style.display = ok ? '' : 'none';
    });
    bar?.classList.toggle('active', !all);
    container?.classList.toggle('filtering-active', !all);
  };

  const injectBar = () => {
    if (container.querySelector('.ios-searchbar')) return;
    const title = container.querySelector('h1.i18n[data-i18n="popup_title"]');
    const grid = container.querySelector('.shortcut-grid');
    bar = document.createElement('div');
    bar.className = 'ios-searchbar';
    bar.innerHTML = `<div class="ios-searchbar-inner">
  <input type="search" class="ios-search-input" placeholder="Search" aria-label="Filter shortcuts by keyword">
  <button type="button" class="ios-search-cancel" aria-label="Cancel search">Cancel</button></div>`;
    const parent = grid?.parentNode ?? title?.parentNode ?? container;
    const refNode = grid ?? title?.nextSibling ?? container.firstChild;
    parent.insertBefore(bar, refNode);
    input = bar.querySelector('.ios-search-input');
    const cancel = bar.querySelector('.ios-search-cancel');
    input.addEventListener('input', () => apply(input.value));
    input.addEventListener('search', () => apply(input.value));
    input.addEventListener('focus', () => bar.classList.add('focused'));
    input.addEventListener('blur', () => {
      if (!input.value) bar.classList.remove('focused');
    });
    cancel.addEventListener('click', () => {
      input.value = '';
      apply('');
      input.blur();
    });

    // Focus the input when bar is injected
    setTimeout(() => {
      input.focus();
      // Optionally select all text if needed:
      // input.select();
    }, 0);
  };

  const observe = () => {
    let t;
    const deb = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        build();
        apply(input?.value || '');
      }, 80);
    };
    const mo = new MutationObserver(() => deb());
    mo.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-i18n', 'data-tooltip', 'title', 'aria-label', 'placeholder'],
    });
  };

  const run = () => {
    container = document.querySelector('.shortcut-container');
    if (!container) return;
    injectBar();
    build();
    observe();
    // Start with an empty query; input may not be wired yet.
    apply('');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();

// ===== @note Model Picker 5×2 Inputs Grid (unified: build + capture + save + react) =====
(function modelPickerInputsGridInitV2() {
  let tries = 0;

  const onReady = (fn) =>
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', fn, { once: true })
      : fn();

  function waitForDeps(cb) {
    const ok =
      typeof window.ShortcutUtils?.getModelPickerCodesCache === 'function' &&
      typeof window.saveModelPickerKeyCodes === 'function';
    if (ok) return cb();
    if (tries++ > 120) return; // ~2s max
    setTimeout(() => waitForDeps(cb), 16);
  }

  function buildGridSection() {
    if (document.getElementById('model-picker-grid')) return;

    const anchor =
      document.getElementById('mp-grid-anchor') || document.querySelector('.shortcut-grid');
    if (!anchor) return;
    const insideShortcutGrid = anchor.id === 'mp-grid-anchor' && !!anchor.closest('.shortcut-grid');

    const section = document.createElement('section');
    section.id = 'model-picker-grid';
    section.setAttribute('aria-label', 'Model Shortcuts');
    section.style.cssText = insideShortcutGrid
      ? 'margin:0px 0 0px 0;grid-column:1 / -1;width:100%;'
      : 'margin:0px 0 0px 0;';

    const head = document.createElement('div');
    head.className = 'mp-head';
    head.style.cssText = 'display:flex;align-items:center;gap:8px;margin:0 0 8px 0;';
    head.innerHTML = `
    `;

    const grid = document.createElement('div');
    grid.className = 'shortcut-grid';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;';

    for (let i = 0; i < 10; i++) {
      const item = document.createElement('div');
      item.className = 'shortcut-item';
      item.style.cssText =
        'display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;';

      const label = document.createElement('div');
      label.className = 'shortcut-label';
      label.style.cssText = 'margin:0 0 14px 0;';
      label.innerHTML = `<span class="mp-label" style="font-weight:400;" data-idx="${i}">Slot ${i + 1}</span>`;

      const keys = document.createElement('div');
      keys.className = 'shortcut-keys';
      keys.style.cssText = 'justify-content:center;gap:6px;';

      const mod = document.createElement('span');
      mod.className = 'key-text mp-modifier-text';
      mod.textContent = 'Alt + ';

      const input = document.createElement('input');
      input.className = 'key-input mp-input custom-tooltip';
      input.id = `mpKeyInput${i}`;
      input.setAttribute('data-idx', String(i));
      input.setAttribute('maxlength', '12');
      input.type = 'text';
      input.autocomplete = 'off';
      input.autocapitalize = 'off';
      input.spellcheck = false;
      input.style.cssText = 'width:3rem;text-align:center;';

      keys.append(mod, input);
      item.append(label, keys);
      grid.appendChild(item);
    }

    section.append(head, grid);
    anchor.parentNode.insertBefore(section, anchor);
    if (anchor.id === 'mp-grid-anchor') anchor.style.display = 'none';
  }

  const getCodes = () => (window.ShortcutUtils.getModelPickerCodesCache() || []).slice();
  const setCodes = (codes, cb) =>
    window.saveModelPickerKeyCodes(codes, () => {
      renderInputs();
      cb?.();
    });
  const displayFrom = (c) => window.ShortcutUtils.displayFromCode?.(c) || c || '';

  // Live mode cache ('alt' | 'ctrl'); kept in sync with storage
  let mpModeCache = 'alt';
  function initModelModeFromStorage() {
    try {
      chrome.storage.sync.get(
        ['useControlForModelSwitcherRadio', 'useAltForModelSwitcherRadio'],
        (d) => {
          mpModeCache = d?.useControlForModelSwitcherRadio ? 'ctrl' : 'alt';
          syncModifierText();
        },
      );
    } catch (_) {
      mpModeCache = 'alt';
      syncModifierText();
    }
  }
  function modifierLabel() {
    // Match your global labels (above): Mac → Command, Windows → Control
    const isMac = (() => {
      const ua = navigator.userAgent || '';
      const plat = navigator.platform || '';
      const uaDataPlat = navigator.userAgentData?.platform ?? '';
      return /Mac/i.test(plat) || /Mac/i.test(ua) || /mac/i.test(uaDataPlat);
    })();
    if (mpModeCache === 'ctrl') {
      return isMac ? 'Command + ' : 'Control + ';
    }
    return isMac ? 'Opt ⌥ ' : 'Alt + ';
  }
  function syncModifierText() {
    const text = modifierLabel();
    document.querySelectorAll('#model-picker-grid .mp-modifier-text').forEach((el) => {
      el.textContent = text;
    });
  }

  function syncModelNames() {
    const NAMES = window.MODEL_NAMES || [];
    document.querySelectorAll('#model-picker-grid .mp-label').forEach((el) => {
      const idx = Number(el.getAttribute('data-idx') || '0');
      el.textContent = NAMES[idx] || `Slot ${idx + 1}`;
    });
  }
  function renderInputs() {
    const codes = getCodes();
    document.querySelectorAll('#model-picker-grid .mp-input').forEach((inp) => {
      const idx = Number(inp.getAttribute('data-idx') || '0');
      const code = codes[idx] || '';
      const name = (window.MODEL_NAMES || [])[idx] || `Slot ${idx + 1}`;

      // Never render NBSP for inputs; show empty when cleared
      let display = '';
      if (code && code !== '\u00A0') {
        display = displayFrom(code) || '';
      }

      inp.dataset.keyCode = code || '';
      inp.value = display; // empty string when cleared
      inp.setAttribute('aria-label', `Set shortcut for ${name}`);
      if (!inp.getAttribute('data-tooltip')) {
        inp.setAttribute('data-tooltip', `Set shortcut for\n${name}`);
      }
    });
  }
  function renderAll() {
    syncModelNames();
    syncModifierText();
    renderInputs();
  }

  function assignAt(idx, code) {
    const selfOwner = { type: 'model', idx, modifier: mpModeCache }; // 'alt' | 'ctrl'
    const conflicts = window.ShortcutUtils.buildConflictsForCode?.(code, selfOwner) || [];

    const proceed = () =>
      window.ShortcutUtils.clearOwners?.(conflicts, () => {
        const codes = getCodes();
        codes[idx] = code;
        setCodes(codes, () => {
          // Toast on save
          window.toast.show('Options saved. Reload page to apply changes.');
          focusNext(idx);
        });
      });

    if (!conflicts.length || window.prefs?.autoOverwrite) return proceed();

    const keyLabel = displayFrom(code);
    const MODEL_NAMES = window.MODEL_NAMES || [];
    const toLabel = MODEL_NAMES[idx] || `Model slot ${idx + 1}`;

    if (typeof window.showDuplicateModal === 'function') {
      if (conflicts.length === 1) {
        window.showDuplicateModal(
          [conflicts[0].label],
          (yes, remember) => {
            if (!yes) return;
            if (remember) {
              window.prefs = window.prefs || {};
              window.prefs.autoOverwrite = true;
              chrome.storage?.sync?.set({ autoOverwrite: true });
            }
            proceed();
          },
          { keyLabel, targetLabel: toLabel },
        );
      } else {
        const currentCodes = window.ShortcutUtils.getModelPickerCodesCache();
        const lines = conflicts.map((c) => {
          let k = '';
          if (c.type === 'shortcut') {
            const el = document.getElementById(c.id);
            k = el?.value?.trim() || '?';
          } else if (c.type === 'model') {
            const cur = currentCodes[c.idx];
            k = displayFrom(cur) || '?';
          }
          return { key: k, from: c.label, to: toLabel };
        });
        window.showDuplicateModal(
          conflicts.map((c) => c.label).join(', '),
          (yes, remember) => {
            if (!yes) return;
            if (remember) {
              window.prefs = window.prefs || {};
              window.prefs.autoOverwrite = true;
              chrome.storage?.sync?.set({ autoOverwrite: true });
            }
            proceed();
          },
          { lines, proceedText: 'Proceed with changes?' },
        );
      }
    } else if (
      confirm(
        `${keyLabel} is already used by: ${conflicts.map((c) => c.label).join(', ')}\nAssign to ${toLabel}?`,
      )
    ) {
      proceed();
    }
  }

  function focusNext(fromIdx) {
    const next = document.getElementById(`mpKeyInput${Math.min(9, fromIdx + 1)}`);
    if (next) next.focus();
  }

  function clearAt(idx) {
    const codes = getCodes();
    codes[idx] = '';
    setCodes(codes, () => {
      // Toast on clear
      window.toast.show('Shortcut cleared. Reload page to apply changes.');
    });
  }

  // Light parser for typed labels/chars → code, reusing your helpers when available
  function parseInputToCode(raw) {
    const r = (raw || '').trim();
    if (!r) return '';
    // Prefer your util
    let code = window.ShortcutUtils?.charToCode?.(r) || '';
    // Try reverse map built by your 111 wiring (if present)
    if (!code && window.__revShortcutLabelMap) {
      const { exact, lower } = window.__revShortcutLabelMap;
      code = exact?.[r] || lower?.[r.toLowerCase()] || '';
    }
    // Common fallbacks
    if (!code && /^[A-Za-z]$/.test(r)) return `Key${r.toUpperCase()}`;
    if (!code && /^[0-9]$/.test(r)) return `Digit${r}`;
    const alias = {
      '/': 'Slash',
      ';': 'Semicolon',
      ':': 'Semicolon',
      "'": 'Quote',
      '"': 'Quote',
      ',': 'Comma',
      '.': 'Period',
      '-': 'Minus',
      _: 'Minus',
      '=': 'Equal',
      '+': 'Equal',
      '`': 'Backquote',
      '[': 'BracketLeft',
      ']': 'BracketRight',
      '\\': 'Backslash',
      space: 'Space',
      Space: 'Space',
      Enter: 'Enter',
      Return: 'Enter',
      Bksp: 'Backspace',
      Backspace: 'Backspace',
      Del: 'Delete',
      Delete: 'Delete',
      Esc: 'Escape',
      Escape: 'Escape',
      Tab: 'Tab',
      Up: 'ArrowUp',
      Down: 'ArrowDown',
      Left: 'ArrowLeft',
      Right: 'ArrowRight',
    };
    return code || alias[r] || alias[r.toLowerCase()] || '';
  }

  function onKeyDown(e) {
    const inp = e.currentTarget;
    const idx = Number(inp.getAttribute('data-idx') || '0');

    if (e.key === 'Tab' || e.key.startsWith('Arrow')) return;
    e.preventDefault();
    e.stopPropagation();

    // Mirror your 111 guard to avoid input-flicker
    inp.dataset.justHandled = '1';
    setTimeout(() => {
      inp.dataset.justHandled = '';
    }, 60);

    const code = e.code;

    if (code === 'Escape') {
      const current = inp.dataset.keyCode || '';
      inp.value = current ? displayFrom(current) : '';
      return;
    }
    if (code === 'Backspace' || code === 'Delete') {
      return clearAt(idx);
    }
    if (/^(Shift|Alt|Control|Meta|Fn)(Left|Right)?$/.test(code)) return;

    assignAt(idx, code);
  }

  function wireInputsAndReset() {
    document.querySelectorAll('#model-picker-grid .mp-input').forEach((inp) => {
      if (inp.dataset.wired) return;
      inp.dataset.wired = '1';

      inp.addEventListener('keydown', onKeyDown, true);

      // Support typed labels/paste like your 111 wiring
      inp.addEventListener('input', (e) => {
        const el = e.currentTarget;
        const idx = Number(el.getAttribute('data-idx') || '0');

        // If keydown just handled it, restore current pretty text and ignore
        if (el.dataset.justHandled === '1') {
          const cur = el.dataset.keyCode || '';
          el.value = cur ? displayFrom(cur) : '';
          el.dataset.justHandled = '';
          return;
        }
        const raw = (el.value || '').trim();
        if (!raw) return clearAt(idx);

        const code = parseInputToCode(raw);
        if (!code) {
          const cur = el.dataset.keyCode || '';
          el.value = cur ? displayFrom(cur) : '';
          // Toast on unsupported
          window.toast.show('Unsupported key. Press a key or enter a valid shortcut label.');
          return;
        }
        assignAt(idx, code);
      });

      // Let paste fall into input handler
      inp.addEventListener('paste', () => {});
      inp.autocomplete = 'off';
      inp.autocapitalize = 'off';
      inp.spellcheck = false;
    });

    // Optional reset icon (if present)
    const el = document.getElementById('mp-reset-keys');
    if (el && !el.dataset.wired) {
      const doReset = () => {
        const yes = confirm('Reset all model keys to defaults?');
        if (!yes) return;
        const defaults = [
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
        window.saveModelPickerKeyCodes(defaults, () => {
          // Toast on reset
          window.toast.show('Model keys reset to defaults.');
          renderInputs();
        });
      };
      el.style.cursor = 'pointer';
      el.addEventListener('click', doReset);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          doReset();
        }
      });
      el.dataset.wired = '1';
    }
  }

  function wireReactivity() {
    // Rehydrate model codes from storage
    document.addEventListener('modelPickerHydrated', renderAll);

    // Radios (listen by ID so HTML name changes don't matter)
    const altRadio = document.getElementById('useAltForModelSwitcherRadio');
    const ctrlRadio = document.getElementById('useControlForModelSwitcherRadio');

    const onRadioChange = () => {
      // Update cached mode and refresh "Alt/Ctrl +" label
      mpModeCache = ctrlRadio?.checked ? 'ctrl' : 'alt';
      syncModifierText();
    };
    [altRadio, ctrlRadio].forEach((r) => {
      if (r) r.addEventListener('change', onRadioChange);
    });

    // Storage changes from elsewhere
    chrome?.storage?.onChanged?.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (changes.modelPickerKeyCodes) renderInputs();
      if (changes.useControlForModelSwitcherRadio || changes.useAltForModelSwitcherRadio) {
        mpModeCache = changes.useControlForModelSwitcherRadio?.newValue ? 'ctrl' : 'alt';
        syncModifierText();
      }
    });
  }

  // (removed) duplicate onChanged listener and stray brace — already handled inside wireReactivity()

  onReady(() =>
    waitForDeps(() => {
      buildGridSection();
      initModelModeFromStorage(); // ← initialize mode cache from storage
      renderAll();
      wireInputsAndReset();
      wireReactivity();
    }),
  );

  // Expose renderer for external triggers
  window.modelPickerInputsRender = renderAll;
})();

// Segmented Controls JS
(() => {
  function initModelSwitcherToggle() {
    const segmentedControl = document.querySelector('.p-segmented-controls');
    const altRadio = document.getElementById('useAltForModelSwitcherRadio');
    const controlRadio = document.getElementById('useControlForModelSwitcherRadio');

    if (!segmentedControl || !altRadio || !controlRadio) return;

    const segments = Array.from(segmentedControl.querySelectorAll('a[data-target]'));

    // Single source of truth: reflect whichever radio is checked
    function syncFromRadios() {
      const activeId = controlRadio.checked
        ? 'useControlForModelSwitcherRadio'
        : 'useAltForModelSwitcherRadio';
      segments.forEach((s) => {
        s.classList.toggle('active', s.dataset.target === activeId);
      });
    }

    // Click → toggle radio → dispatch change (lets existing logic run)
    segments.forEach((segment) => {
      segment.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = segment.getAttribute('data-target');
        const targetRadio = document.getElementById(targetId);
        if (!targetRadio) return;

        // UI optimism: set pill active immediately
        segments.forEach((s) => {
          s.classList.remove('active');
        });

        segment.classList.add('active');

        // Update radios (same name group handles mutual exclusion)
        targetRadio.checked = true;

        // Fire change so: storage save, conflict modal, mp labels update, etc.
        targetRadio.dispatchEvent(new Event('change', { bubbles: true }));

        // After any async revert (duplicate modal cancel), re-sync pills
        setTimeout(syncFromRadios, 0);
      });
    });

    // Programmatic radio changes (including revert after duplicate modal)
    [altRadio, controlRadio].forEach((radio) => {
      radio.addEventListener('change', () => {
        if (radio.checked) syncFromRadios();
      });
    });

    // Initial paint: match pills to current radio state (which may come from storage)
    syncFromRadios();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModelSwitcherToggle, { once: true });
  } else {
    initModelSwitcherToggle();
  }
})();

//≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡
// @note top of Sync Settings to Google IIFE
//≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡
(() => {
  // Utilities
  const domReady = () =>
    new Promise((r) =>
      document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', r, { once: true })
        : r(),
    );

  const els = () => ({
    signinRow: document.getElementById('signinRow'),
    syncRow: document.getElementById('syncRow'),
    btnLogin: document.getElementById('btnGoogleLogin'),
    btnSave: document.getElementById('btnSyncToCloud'),
    btnRestore: document.getElementById('btnRestoreFromCloud'),
    btnLogout: document.getElementById('btnCloudLogout'),
    statusEl: document.getElementById('syncStatus'),
  });

  const setStatus = (msg, tone = '') => {
    const { statusEl } = els();
    if (statusEl) {
      statusEl.textContent = msg || '';
      statusEl.dataset.tone = tone;
    }
  };

  const renderUI = (state, email = '') => {
    const { signinRow, syncRow } = els();
    if (state === 'in') {
      if (signinRow) signinRow.style.display = 'none';
      if (syncRow) syncRow.style.display = 'contents'; // flatten so its children order with label/status
      setStatus(email ? `Linked to ${email}` : 'Linked');
    } else {
      if (signinRow) signinRow.style.display = 'flex';
      if (syncRow) syncRow.style.display = 'none';
      setStatus(chrome.i18n.getMessage('status_not_linked'));
    }
  };

  async function hydrateAuth() {
    try {
      const res = await window.CloudAuth?.getSavedAuth?.();
      if (res?.profile) {
        renderUI('in'); // no email UI per least-privilege plan
      } else {
        renderUI('out');
      }
    } catch {
      renderUI('out');
    }
  }

  // Requests optional perms + token only when needed.
  // Returns true if connected (or successfully connected), false if user denied/canceled.
  async function ensureConnected(interactive = true) {
    try {
      const res = await window.CloudAuth?.getSavedAuth?.();
      if (res?.profile) return true; // previously linked

      if (!interactive) return false;
      await window.CloudAuth?.googleLogin?.(); // triggers optional perms + token
      renderUI('in');
      return true;
    } catch (e) {
      console.warn('ensureConnected:', e?.message || e);
      setStatus(chrome.i18n.getMessage('status_signin_failed') || 'Sign-in canceled', 'error');
      renderUI('out');
      return false;
    }
  }

  (async () => {
    await domReady();
    renderUI('out');
    await hydrateAuth();

    const { btnLogin, btnSave, btnRestore, btnLogout } = els();

    // Connect (request optional perms + mint token only on click)
    if (btnLogin && !btnLogin.dataset.wired) {
      btnLogin.dataset.wired = '1';
      const label = btnLogin.querySelector('.gsi-material-button-contents');
      btnLogin.addEventListener('click', async () => {
        btnLogin.disabled = true;
        if (label) label.textContent = 'Connecting…';
        try {
          const ok = await ensureConnected(true);
          if (ok) {
            setStatus(chrome.i18n.getMessage('status_linked') || 'Linked', 'success');
          }
        } finally {
          btnLogin.disabled = false;
          if (label) label.textContent = 'Continue with Google';
        }
      });
    }

    // Save to Cloud (perm request on demand; transient token per action)
    if (btnSave && !btnSave.dataset.wired) {
      btnSave.dataset.wired = '1';
      btnSave.addEventListener('click', async () => {
        const store = window.CloudStorage;
        if (!store) return setStatus(chrome.i18n.getMessage('status_sync_unavailable'), 'error');

        // Ensure optional perms and token at point-of-use
        const ok = await ensureConnected(true);
        if (!ok) return;

        window.busy?.(btnSave, true);
        try {
          setStatus(chrome.i18n.getMessage('status_saving') || 'Saving…');
          const local = await store.loadLocalSettings();
          await store.saveSyncedSettings(local);
          window.successFlash?.(btnSave);
          setStatus(chrome.i18n.getMessage('status_saved') || 'Saved to Cloud', 'success');
        } catch (e) {
          console.error(e);
          setStatus(
            e?.message || chrome.i18n.getMessage('status_save_failed') || 'Save failed',
            'error',
          );
        } finally {
          window.busy?.(btnSave, false);
        }
      });
    }

    // Restore from Cloud (full rehydrate, including model picker)
    if (btnRestore && !btnRestore.dataset.wired) {
      btnRestore.dataset.wired = '1';

      const rehydrateSettingsUI = async (settings) => {
        try {
          // 1) Shortcuts — let your existing helper repaint labels/codes
          if (typeof window.refreshShortcutInputsFromStorage === 'function') {
            try {
              window.refreshShortcutInputsFromStorage();
            } catch (_) {}
          }

          // 2) Non-shortcut inputs (checkboxes/radios/text) — mirror import’s reflect behavior
          const sep_storageToUI = window.sep_storageToUI || ((s) => s);
          const reflectOption = (key, val) => {
            const el = document.getElementById(key);
            if (!el) return;
            if (el.type === 'checkbox' || el.type === 'radio') {
              el.checked = !!val;
              return;
            }
            if (typeof val === 'string' || typeof val === 'number') {
              el.value = key === 'copyCodeUserSeparator' ? sep_storageToUI(val) : val;
            }
          };
          Object.keys(settings || {}).forEach((k) => {
            if (/^shortcutKey/.test(k)) return; // shortcuts handled above
            reflectOption(k, settings[k]);
          });

          // 3) Model picker key codes — set cache + broadcast like import flow
          if (
            Array.isArray(settings?.modelPickerKeyCodes) &&
            settings.modelPickerKeyCodes.length === 10
          ) {
            try {
              window.__modelPickerKeyCodes = settings.modelPickerKeyCodes.slice(0, 10);
              document.dispatchEvent(new CustomEvent('modelPickerHydrated'));
            } catch (_) {}
          }

          // 4) Model names — update globals + re-render picker UI + broadcast like import flow
          if (Array.isArray(settings?.modelNames) && settings.modelNames.length >= 5) {
            const nine = settings.modelNames.slice(0, 9);
            if (nine[4] && /legacy/i.test(nine[4]))
              nine[4] = `${nine[4].replace(/→/g, '').trim()} →`;
            window.MODEL_NAMES = nine.concat('Show Models');
            if (typeof window.modelPickerRender === 'function') {
              try {
                window.modelPickerRender();
              } catch (_) {}
            }
            window.dispatchEvent(
              new CustomEvent('model-names-updated', { detail: { source: 'cloud-restore' } }),
            );
          }

          // 5) Any tooltips/i18n that presets also rehydrate
          if (typeof window.initTooltips === 'function')
            try {
              window.initTooltips();
            } catch (_) {}
          if (typeof window.balanceWrappedLabels === 'function')
            try {
              window.balanceWrappedLabels();
            } catch (_) {}
        } catch (e) {
          console.warn('rehydrateSettingsUI failed:', e);
        }
      };

      btnRestore.addEventListener('click', async () => {
        const store = window.CloudStorage;
        if (!store) return setStatus(chrome.i18n.getMessage('status_restore_unavailable'), 'error');

        // Ensure optional perms + token on demand
        const ok = await ensureConnected(true);
        if (!ok) return;

        window.busy?.(btnRestore, true);
        try {
          setStatus(chrome.i18n.getMessage('status_restoring') || 'Restoring…');
          const remote = await store.loadSyncedSettings();
          if (!remote || Object.keys(remote).length === 0) {
            setStatus(chrome.i18n.getMessage('status_no_backup') || 'No backup found', 'error');
            return;
          }

          // Persist first, then repaint UI so subsequent reads come from storage-backed state
          await store.saveLocalSettings(remote);
          await rehydrateSettingsUI(remote);

          window.successFlash?.(btnRestore);
          setStatus(chrome.i18n.getMessage('status_restored') || 'Restored', 'success');
        } catch (e) {
          console.error(e);
          setStatus(
            e?.message || chrome.i18n.getMessage('status_restore_failed') || 'Restore failed',
            'error',
          );
        } finally {
          window.busy?.(btnRestore, false);
        }
      });
    }

    // Logout
    if (btnLogout && !btnLogout.dataset.wired) {
      btnLogout.dataset.wired = '1';
      btnLogout.addEventListener('click', async () => {
        try {
          await window.CloudAuth.googleLogout();
        } finally {
          renderUI('out');
        }
      });
    }
  })();
})();

/* Sync Settings Button js IIFE */
(() => {
  const getIcon = (btn) => btn?.querySelector('.msr, .material-icons-outlined');

  // Remove any in-progress flash and restore spinner visibility if needed
  const cleanupFlash = (btn) => {
    if (!btn) return;
    if (btn.dataset.flashTimer) {
      clearTimeout(Number(btn.dataset.flashTimer));
      delete btn.dataset.flashTimer;
    }
    const flash = btn.querySelector('[data-ephemeral="check-flash"]');
    if (flash) flash.remove();
    const sp = btn.querySelector('.spinner');
    if (sp && btn.dataset.prevSpinnerDisplay !== undefined) {
      sp.style.display = btn.dataset.prevSpinnerDisplay || '';
      delete btn.dataset.prevSpinnerDisplay;
    }
  };

  const busy = (btn, isBusy) => {
    if (!btn) return;
    const icon = getIcon(btn);
    if (isBusy) {
      if (icon) {
        // Capture current icon state so we can restore later
        btn.dataset.prevIconText = icon.textContent || '';
        btn.dataset.prevIconClass = icon.className || 'msr';
        const sp = document.createElement('span');
        sp.className = 'spinner';
        sp.setAttribute('aria-hidden', 'true');
        icon.replaceWith(sp);
      }
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
    } else {
      // Ensure any temporary flash is cleaned up before restoring icon
      cleanupFlash(btn);
      const sp = btn.querySelector('.spinner');
      if (sp) {
        const i = document.createElement('span');
        i.className = btn.dataset.prevIconClass || 'msr';
        i.textContent =
          btn.dataset.prevIconText || btn.getAttribute('data-default-icon') || 'check_circle';
        sp.replaceWith(i);
      }
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
    }
  };

  const successFlash = (btn, duration = 1200) => {
    if (!btn) return;

    // Clear any previous flash timer
    if (btn.dataset.flashTimer) {
      clearTimeout(Number(btn.dataset.flashTimer));
      delete btn.dataset.flashTimer;
    }

    const sp = btn.querySelector('.spinner');

    if (sp) {
      // While busy: temporarily hide the spinner and show a check in its place
      const check = document.createElement('span');
      check.className = btn.dataset.prevIconClass || 'msr';
      check.textContent = 'check_circle';
      check.setAttribute('aria-hidden', 'true');
      check.setAttribute('data-ephemeral', 'check-flash');

      btn.dataset.prevSpinnerDisplay = sp.style.display || '';
      sp.style.display = 'none';
      sp.insertAdjacentElement('beforebegin', check);

      const tid = setTimeout(() => {
        if (check.isConnected) check.remove();
        if (sp?.isConnected) {
          sp.style.display = btn.dataset.prevSpinnerDisplay || '';
        }
        delete btn.dataset.prevSpinnerDisplay;
        delete btn.dataset.flashTimer;
      }, duration);
      btn.dataset.flashTimer = String(tid);
      return;
    }

    // Not busy: flash by swapping the icon text temporarily
    const icon = getIcon(btn);
    if (!icon) return;
    const prev = icon.textContent;
    icon.textContent = 'check_circle';
    const tid = setTimeout(() => {
      if (icon.isConnected) icon.textContent = prev;
      delete btn.dataset.flashTimer;
    }, duration);
    btn.dataset.flashTimer = String(tid);
  };

  window.busy = busy;
  window.successFlash = successFlash;
})();
