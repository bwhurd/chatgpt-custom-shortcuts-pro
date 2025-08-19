document.addEventListener('DOMContentLoaded', function () {
    // Localize the title dynamically
    const titleElement = document.querySelector('title');
    const localizedTitle = chrome.i18n.getMessage('popup_title');
    if (titleElement && localizedTitle) {
        titleElement.textContent = localizedTitle;
    }


    // === Unified shortcut helpers (REPLACES 555) ================================



    // Source of truth for the 10 model-picker slots if storage is empty
    const DEFAULT_MODEL_PICKER_KEY_CODES = [
        'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'
    ];

    // Preference: auto-overwrite on duplicate?
    let prefs = { autoOverwrite: false };
    chrome.storage.sync.get('autoOverwrite', d => { prefs.autoOverwrite = !!d.autoOverwrite; });
    // expose to 333
    window.prefs = prefs;

    // Display helper used by chips and hints (platform-aware)
    function displayFromCode(code) {
        if (!code || code === '' || code === '\u00A0') return '\u00A0';

        // Robust Mac detection (works in Chrome extensions)
        const isMac = (() => {
            const ua = navigator.userAgent || '';
            const plat = navigator.platform || '';
            const uaDataPlat = (navigator.userAgentData && navigator.userAgentData.platform) || '';
            return /Mac/i.test(plat) || /Mac/i.test(ua) || /mac/i.test(uaDataPlat);
        })();

        // Letters (UI chips in this section show uppercase)
        if (/^Key([A-Z])$/.test(code)) return code.slice(-1);

        // Numbers (row + numpad)
        if (/^Digit([0-9])$/.test(code)) return code.slice(-1);
        if (/^Numpad([0-9])$/.test(code)) return code.slice(-1);

        // Function keys F1–F24
        if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;

        // Punctuation / common physical keys
        const baseMap = {
            Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
            Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',',
            Period: '.', Slash: '/', Backquote: '`',

            // Navigation / whitespace
            Space: 'Space', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab',
            Backspace: 'Bksp', Delete: 'Del',
            ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',

            // International (safe English approximations)
            IntlBackslash: '\\', IntlYen: '¥', IntlRo: 'ro',
            Lang1: 'lang1', Lang2: 'lang2', Lang3: 'lang3', Lang4: 'lang4', Lang5: 'lang5',

            // Media
            VolumeMute: 'Mute', VolumeDown: 'Vol–', VolumeUp: 'Vol+',
            MediaPlayPause: 'Play/Pause', MediaTrackNext: 'Next', MediaTrackPrevious: 'Prev'
        };

        // Modifiers, platform-accurate labels
        const mods = isMac
            ? { MetaLeft: '⌘', MetaRight: '⌘', AltLeft: '⌥', AltRight: '⌥', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', ShiftLeft: '⇧', ShiftRight: '⇧', Fn: 'fn' }
            : { MetaLeft: 'Win', MetaRight: 'Win', AltLeft: 'Alt', AltRight: 'Alt', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', ShiftLeft: 'Shift', ShiftRight: 'Shift', Fn: 'Fn' };

        if (code in baseMap) return baseMap[code];
        if (code in mods) return mods[code];

        // Fallback: humanize the raw code (e.g., "IntlBackslash" → "Intl Backslash")
        return code.replace(/([a-z])([A-Z])/g, '$1 $2');
    }





    // Treat DigitX and NumpadX as equivalent
    function codeEquals(a, b) {
        if (a === b) return true;
        const A = a && a.match(/^(Digit|Numpad)([0-9])$/);
        const B = b && b.match(/^(Digit|Numpad)([0-9])$/);
        return !!(A && B && A[2] === B[2]);
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
            case '-': return 'Minus';
            case '=': return 'Equal';
            case '[': return 'BracketLeft';
            case ']': return 'BracketRight';
            case '\\': return 'Backslash';
            case ';': return 'Semicolon';
            case "'": return 'Quote';
            case ',': return 'Comma';
            case '.': return 'Period';
            case '/': return 'Slash';
            case '`': return 'Backquote';
            case ' ': return 'Space';
            default: return ''; // unsupported single char here
        }
    }

    // ---------- Existing helpers (kept) ----------
    function refreshShortcutKeyValuesFromInputs() {
        shortcutKeys.forEach(id => {
            const inp = document.getElementById(id);
            if (inp) {
                shortcutKeyValues[id] = inp.value.trim() === '' ? '\u00A0' : inp.value.trim();
            }
        });
    }

    // Get current value for every shortcut input (raw chars, '' if empty)
    function getCurrentShortcutValues() {
        const map = {};
        shortcutKeys.forEach(id => {
            const inp = document.getElementById(id);
            map[id] = (inp && inp.value.trim()) ? inp.value.trim() : '';
        });
        return map;
    }

    // Overwrite the old slot with NBSP and clear UI field
    function overwriteOld(duplicateId) {
        shortcutKeyValues[duplicateId] = '\u00A0';
        chrome.storage.sync.set({ [duplicateId]: '\u00A0' });
        const oldInput = document.getElementById(duplicateId);
        if (oldInput) {
            oldInput.value = '';
            oldInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    // Save a popup input value (char or ''), mirror to DOM, optionally fire input
    function saveShortcutValue(id, value, fireInput = false) {
        const valToSave = value === '' ? '\u00A0' : value;

        // Attempt the write
        chrome.storage.sync.set({ [id]: valToSave }, function () {
            if (chrome.runtime && chrome.runtime.lastError) {
                console.error('[saveShortcutValue] set error:', chrome.runtime.lastError);
                if (typeof showToast === 'function') {
                    showToast(`Save failed: ${chrome.runtime.lastError.message || 'storage error'}`);
                }
                return;
            }

            // Mirror to UI
            const inp = document.getElementById(id);
            if (inp) {
                inp.value = (valToSave === '\u00A0' ? '' : valToSave);
                if (fireInput) {
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }

            // Verify write to avoid silent drops (e.g., popup closing fast)
            chrome.storage.sync.get(id, (data) => {
                const persisted = data && Object.prototype.hasOwnProperty.call(data, id) ? data[id] : undefined;
                if (persisted !== valToSave) {
                    console.warn('[saveShortcutValue] verification mismatch', { expected: valToSave, got: persisted });
                    if (typeof showToast === 'function') {
                        showToast('Save did not persist. Trying again…');
                    }
                    // Retry once
                    chrome.storage.sync.set({ [id]: valToSave }, () => {
                        if (chrome.runtime && chrome.runtime.lastError) {
                            console.error('[saveShortcutValue] retry error:', chrome.runtime.lastError);
                            if (typeof showToast === 'function') {
                                showToast(`Save failed: ${chrome.runtime.lastError.message || 'storage error'}`);
                            }
                        }
                    });
                }
            });
        });
    }

    // expose for 333
    window.saveShortcutValue = saveShortcutValue;

    // ---------- Unified registry for model-picker codes ----------
    function getModelPickerCodesCache() {
        const arr = Array.isArray(window.__modelPickerKeyCodes) ? window.__modelPickerKeyCodes : null;
        return (arr && arr.length === 10) ? arr.slice(0, 10) : DEFAULT_MODEL_PICKER_KEY_CODES.slice();
    }

    function saveModelPickerKeyCodes(codes, cb) {
        window.__modelPickerKeyCodes = codes.slice(0, 10); // update cache first for snappy UI
        chrome.storage.sync.set({ modelPickerKeyCodes: window.__modelPickerKeyCodes }, function () {
            if (chrome.runtime && chrome.runtime.lastError) {
                console.error('[saveModelPickerKeyCodes] set error:', chrome.runtime.lastError);
                if (typeof showToast === 'function') {
                    showToast(`Save failed: ${chrome.runtime.lastError.message || 'storage error'}`);
                }
                if (typeof cb === 'function') cb(false);
                return;
            }
            if (typeof cb === 'function') cb(true);
            // no need to fire onChanged here; we already updated local cache and UI calls render()
        });
    }

    /** Hydrate cache from storage and notify listeners once */
    function initModelPickerCodesCache() {
        if (window.__modelPickerHydrating) return window.__modelPickerHydrating;
        window.__modelPickerHydrating = new Promise((resolve) => {
            chrome.storage.sync.get('modelPickerKeyCodes', ({ modelPickerKeyCodes }) => {
                window.__modelPickerKeyCodes =
                    (Array.isArray(modelPickerKeyCodes) && modelPickerKeyCodes.length === 10)
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
        const label = el.closest('.shortcut-item')?.querySelector('.shortcut-label .i18n')?.textContent?.trim();
        return label || id;
    }

    /**
     * Build list of owners that conflict with `code`.
     * @param {string} code - KeyboardEvent.code (e.g., 'KeyM', 'Digit5', 'Slash')
     * @param {object} selfOwner - { type: 'shortcut', id } OR { type: 'model', idx }
     * @returns {Array<{type:'shortcut', id, label} | {type:'model', idx, label}>}
     */
    function buildConflictsForCode(code, selfOwner) {
        const conflicts = [];
        const modelMod = getModelPickerModifier(); // 'alt' or 'ctrl'

        // Model slots (these belong to the model-picker domain)
        const modelCodes = getModelPickerCodesCache();
        modelCodes.forEach((c, i) => {
            if (!c) return;
            const isSelf = selfOwner && selfOwner.type === 'model' && selfOwner.idx === i;
            if (!isSelf && codeEquals(c, code)) {
                const pretty = (window.MODEL_NAMES && window.MODEL_NAMES[i]) ? window.MODEL_NAMES[i] : `Pick Model ${i + 1}`;
                // If the self owner is a popup shortcut (Alt domain) and model picker uses CTRL, ignore this "conflict"
                if (selfOwner && selfOwner.type === 'shortcut' && modelMod === 'ctrl') {
                    // no-op, not a real conflict
                } else {
                    conflicts.push({ type: 'model', idx: i, label: pretty });
                }
            }
        });

        // Other popup single-char shortcuts (Alt domain)
        const map = getCurrentShortcutValues();
        Object.keys(map).forEach(id => {
            const ch = map[id];
            const c2 = charToCode(ch);
            if (!c2) return;
            const isSelf = selfOwner && selfOwner.type === 'shortcut' && selfOwner.id === id;
            if (!isSelf && codeEquals(c2, code)) {
                // If the self owner is a model slot and model picker uses CTRL, ignore "conflicts" against popup (Alt) shortcuts
                if (selfOwner && selfOwner.type === 'model' && modelMod === 'ctrl') {
                    // no-op, not a real conflict
                } else {
                    conflicts.push({ type: 'shortcut', id, label: getShortcutLabelById(id) });
                }
            }
        });

        return conflicts;
    }


    /**
     * Clears owners (both sides) that currently hold a conflicting assignment.
     * Calls `done` after model codes are persisted.
     */
    function clearOwners(owners, done) {
        const codes = getModelPickerCodesCache();
        let modelTouched = false;

        owners.forEach(o => {
            if (o.type === 'shortcut') {
                // clear popup input + storage
                saveShortcutValue(o.id, '', true);
            } else if (o.type === 'model') {
                codes[o.idx] = '';
                modelTouched = true;
            }
        });

        if (modelTouched) {
            saveModelPickerKeyCodes(codes, () => { if (typeof done === 'function') done(); });
        } else {
            if (typeof done === 'function') done();
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
        saveModelPickerKeyCodes
    };



    // Robust Mac detection (Chrome, Chromium, extension context)
    const isMac = (() => {
        const ua = navigator.userAgent || '';
        const plat = navigator.platform || '';
        const uaDataPlat = (navigator.userAgentData && navigator.userAgentData.platform) || '';
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
    const altLabel = isMac ? "Opt ⌥" : "Alt +";
    const ctrlLabel = isMac ? "Command + " : "Control + ";
    document.querySelectorAll(".shortcut span, .key-text.platform-alt-label").forEach(span => {
        if (span.textContent.includes("Alt +")) {
            span.textContent = altLabel;
        }
        if (span.textContent.includes("Ctrl +")) {
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
                pointerEvents: 'none'
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
            pointerEvents: 'auto'
        });

        toast.innerHTML = message;
        toastContainer.appendChild(toast);

        // Fade in
        if (window.gsap && window.gsap.to) {
            window.gsap.to(toast, { opacity: 1, duration: 0.28, ease: "power2.out" });
        } else {
            toast.style.transition = 'opacity 0.28s';
            requestAnimationFrame(() => { toast.style.opacity = '1'; });
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
        if (!toast || !toast.isConnected) {
            activeToast = null;
            if (toastContainer && toastContainer.childElementCount === 0 && toastContainer.isConnected) {
                toastContainer.remove();
            }
            return;
        }

        // Prevent double-fades on the same node
        if (toast.dataset.fading === '1') return;
        toast.dataset.fading = '1';

        const cleanup = () => {
            if (toast && toast.isConnected) toast.remove();
            if (toastContainer && toastContainer.childElementCount === 0 && toastContainer.isConnected) {
                toastContainer.remove();
            }
            activeToast = null;
        };

        if (window.gsap && window.gsap.to) {
            window.gsap.to(toast, {
                opacity: 0,
                duration: 0.28,
                ease: "power2.in",
                onComplete: cleanup
            });
        } else {
            // Node may get removed mid-flight; recheck before touching style
            if (!toast || !toast.style) { cleanup(); return; }
            // Ensure a transition exists for smooth fade
            if (!toast.style.transition) toast.style.transition = 'opacity 0.28s';
            // Trigger fade
            requestAnimationFrame(() => {
                if (!toast || !toast.style) { cleanup(); return; }
                toast.style.opacity = '0';
            });
            toast.addEventListener('transitionend', cleanup, { once: true });
        }
    }



    // --- END TOAST QUEUE WITH GSAP SUPPORT ---






    // If label forced on to two lines, balance the line break
    /* Balance any label that *actually* wraps */
    function balanceWrappedLabels() {
        const labels = document.querySelectorAll('.shortcut-label .i18n');

        labels.forEach(label => {
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
            let breakIdx = cumLen.findIndex(len => len >= half);
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
        const MIN_FILL_FRAC = 0.72;     // target ≥72% of max on non-last lines
        const UNDERFILL_WEIGHT = 6;     // penalty per char below the target
        const SHORT_BREAK_WORDS = 2;    // avoid lines with ≤2 words (non-last)
        const SHORT_BREAK_PENALTY = 80; // strong penalty for short non-last lines
        const LAST_LINE_SLACK_MULT = 0.6; // last line can be looser
        const LINECOUNT_PENALTY = 8;    // bias toward fewer lines
        // -----------------

        // compute length of words[i..j] including spaces between
        const lens = words.map(w => w.length);
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
                let l = L, j = n;
                while (l > 0) {
                    const i = prev[l][j];
                    breaks.push([i, j - 1]);
                    j = i; l--;
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
        const maxCh = getTooltipMaxCh();  // stays in sync with CSS

        document.querySelectorAll('.info-icon-tooltip[data-tooltip]').forEach(el => {
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
    document.querySelectorAll('[data-i18n]').forEach(el => {
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
            'text-wrap:balance',              // <-- add this
            'overflow-wrap:normal',
            'word-break:keep-all',
            'hyphens:auto',
            // Match the tooltip width rule
            'inline-size:clamp(28ch, calc(var(--tooltip-max-ch) * 1ch), 95vw)', // <-- add this
            'max-inline-size:calc(var(--tooltip-max-ch) * 1ch)',
            'box-sizing:border-box',
            'line-height:1.45'
        ].join(';');

        document.body.appendChild(el);
        getTooltipMeasureEl._el = el;
        return el;
    }

    /**
     * Compute horizontal offset so tooltip stays within container edges (±padding).
     * Applies CSS var --tooltip-offset-x on the trigger element.
     */
    function nudgeTooltipIntoBounds(triggerEl, { gap = 6 } = {}) {
        const boundary = document.querySelector('[data-tooltip-boundary]') || document.body;
        const text = triggerEl.getAttribute('data-tooltip') || '';
        if (!text) {
            triggerEl.style.removeProperty('--tooltip-offset-x');
            triggerEl.style.removeProperty('--tooltip-max-fit');
            return;
        }

        /* ---------- 1. figure out the usable area ---------- */
        const cRect = boundary.getBoundingClientRect();
        const usableLeft = cRect.left + gap;
        const usableRight = cRect.right - gap;
        const usableWidth = Math.max(0, usableRight - usableLeft);

        /* ---------- 2. measure bubble *after* width cap ---------- */
        const meas = getTooltipMeasureEl();      // your hidden measuring div
        meas.style.maxInlineSize = usableWidth + 'px';  // cap first
        meas.textContent = text;
        const bubbleWidth = meas.offsetWidth;    // actual width with wrapping

        /* expose this cap so CSS matches real width */
        triggerEl.style.setProperty('--tooltip-max-fit', bubbleWidth + 'px');

        /* ---------- 3. compute minimal X-offset ---------- */
        const tRect = triggerEl.getBoundingClientRect();
        const bubbleLeft = tRect.left + tRect.width / 2 - bubbleWidth / 2;
        const bubbleRight = bubbleLeft + bubbleWidth;

        let offset = 0;
        if (bubbleLeft < usableLeft) offset += usableLeft - bubbleLeft;
        else if (bubbleRight > usableRight) offset -= bubbleRight - usableRight;

        triggerEl.style.setProperty('--tooltip-offset-x', Math.round(offset) + 'px');
    }



    /**
     * Hook up listeners to recompute on show / hide / resize.
     * Add data-tooltip-boundary to your main container (e.g., <main data-tooltip-boundary>…)
     */
    function setupTooltipBoundary() {
        const boundary = getTooltipBoundary();
        const items = Array.from(document.querySelectorAll('.info-icon-tooltip[data-tooltip]'));
        const opts = { padding: 6 };

        function onShow(e) {
            const el = e.currentTarget;
            // (Optional) mirror any width change you made in CSS:
            // getTooltipMeasureEl().style.inlineSize = `clamp(28ch, calc(${getTooltipMaxCh()} * 1ch), 95vw)`;
            nudgeTooltipIntoBounds(el, opts);
        }
        function onHide(e) {
            e.currentTarget.style.removeProperty('--tooltip-offset-x');
        }
        function onResize() {
            // Reflow any currently "active" tooltip (hovered/focused)
            const active = items.filter(el => el.matches(':hover, :focus'));
            active.forEach(el => nudgeTooltipIntoBounds(el, opts));
        }

        items.forEach(el => {
            el.addEventListener('mouseenter', onShow);
            el.addEventListener('focus', onShow);
            el.addEventListener('mouseleave', onHide);
            el.addEventListener('blur', onHide);
        });

        // Recompute on viewport resize (debounced)
        let rid = 0;
        window.addEventListener('resize', () => {
            cancelAnimationFrame(rid);
            rid = requestAnimationFrame(onResize);
        }, { passive: true });

        // Recompute if the boundary scrolls horizontally
        boundary.addEventListener('scroll', () => {
            cancelAnimationFrame(rid);
            rid = requestAnimationFrame(onResize);
        }, { passive: true });
    }

    // Call this once after your initTooltips()
    /* initTooltips(); */
    setupTooltipBoundary();

    // --- end boundary hack -----------------------------------------



    function showDuplicateModal(message, cb) {
        const DONT_ASK_SHORTCUT_KEY = 'dontAskDuplicateShortcutModal';

        // HTML-escape helper to avoid injecting raw labels
        function esc(s) {
            return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
        }

        chrome.storage.sync.get(DONT_ASK_SHORTCUT_KEY, data => {
            if (data[DONT_ASK_SHORTCUT_KEY]) {
                cb(true, true);
                return;
            }

            let overlay = document.getElementById('dup-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'dup-overlay';
                overlay.style.display = 'none'; // will show as flex below
                overlay.innerHTML = `
        <div id="dup-box">
          <!-- Two lines, same font/size/weight via inline style on both .dup-line -->
          <p id="dup-line1" class="dup-line" style="margin:0 0 6px 0; font-size:14px; font-weight:400;"></p>
          <p id="dup-line2" class="dup-line" style="margin:0 0 10px 0; font-size:14px; font-weight:400;">Assign here instead?</p>

          <label style="display:flex;gap:.5em;align-items:center;margin-top:2px;">
            <input id="dup-dont" type="checkbox"> Don’t ask me again
          </label>

          <div class="dup-btns" style="display:flex;gap:.5em;margin-top:10px;">
            <button id="dup-no">Cancel</button>
            <button id="dup-yes">Yes</button>
          </div>
        </div>
      `;
                document.body.appendChild(overlay);
            }

            // Re-bind handlers each time with the current `cb`
            const dontChk = overlay.querySelector('#dup-dont');
            const oldCancel = overlay.querySelector('#dup-no');
            const oldYes = overlay.querySelector('#dup-yes');
            const newCancel = oldCancel.cloneNode(true);
            const newYes = oldYes.cloneNode(true);
            oldCancel.parentNode.replaceChild(newCancel, oldCancel);
            oldYes.parentNode.replaceChild(newYes, oldYes);

            newCancel.addEventListener('click', () => {
                overlay.style.display = 'none';
                cb(false, false);
            });
            newYes.addEventListener('click', () => {
                const skip = dontChk.checked;
                overlay.style.display = 'none';
                if (skip) {
                    chrome.storage.sync.set({ [DONT_ASK_SHORTCUT_KEY]: true }, () => cb(true, true));
                } else {
                    cb(true, false);
                }
            });

            // Build line 1 with inline-highlighted owners.
            const line1 = overlay.querySelector('#dup-line1');
            const yesBtn = overlay.querySelector('#dup-yes');
            const yesColor = yesBtn ? getComputedStyle(yesBtn).color : '#1a73e8'; // fallback blue

            // message is a comma-separated string of owner labels (e.g., "Model slot 1, Scroll to Bottom")
            const owners = String(message || '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);

            // Wrap each owner in a colored, bold span; join with ", "
            const ownersHTML = owners
                .map(name => `<span class="dup-key" style="font-weight:700; color:${esc(yesColor)};">${esc(name)}</span>`)
                .join(', ');

            line1.innerHTML = `This key is assigned to ${ownersHTML}.`;

            overlay.style.display = 'flex';
        });
    }



    window.showDuplicateModal = window.showDuplicateModal || showDuplicateModal;


    // End of Utility Functions

    /**
     * Initializes default settings if not present in Chrome storage.
     * Sets the radio button and checkbox states and stores them if they haven't been defined yet.
     */
    chrome.storage.sync.get(
        [
            'hideArrowButtonsCheckbox',
            'hideCornerButtonsCheckbox',
            'removeMarkdownOnCopyCheckbox',
            'moveTopBarToBottomCheckbox',
            'pageUpDownTakeover',
            'selectMessagesSentByUserOrChatGptCheckbox',
            'onlySelectUserCheckbox',
            'onlySelectAssistantCheckbox',
            'disableCopyAfterSelectCheckbox',
            'enableSendWithControlEnterCheckbox',
            'enableStopWithControlBackspaceCheckbox',
            'useAltForModelSwitcherRadio',
            'useControlForModelSwitcherRadio',
            'rememberSidebarScrollPositionCheckbox'
        ],
        function (data) {
            const defaults = {
                hideArrowButtonsCheckbox: data.hideArrowButtonsCheckbox !== undefined ? data.hideArrowButtonsCheckbox : true, // hide arrows by default
                hideCornerButtonsCheckbox: data.hideCornerButtonsCheckbox === undefined ? true : data.hideCornerButtonsCheckbox,
                removeMarkdownOnCopyCheckbox: data.removeMarkdownOnCopyCheckbox !== undefined ? data.removeMarkdownOnCopyCheckbox : true, // Default to true
                moveTopBarToBottomCheckbox: data.moveTopBarToBottomCheckbox !== undefined ? data.moveTopBarToBottomCheckbox : false, // Default to false
                pageUpDownTakeover: data.pageUpDownTakeover !== undefined ? data.pageUpDownTakeover : true, // Default to true
                selectMessagesSentByUserOrChatGptCheckbox: data.selectMessagesSentByUserOrChatGptCheckbox !== undefined ? data.selectMessagesSentByUserOrChatGptCheckbox : true, // Default to true
                onlySelectUserCheckbox: data.onlySelectUserCheckbox !== undefined ? data.onlySelectUserCheckbox : false, // Default to false
                onlySelectAssistantCheckbox: data.onlySelectAssistantCheckbox !== undefined ? data.onlySelectAssistantCheckbox : false, // Default to false
                disableCopyAfterSelectCheckbox: data.disableCopyAfterSelectCheckbox !== undefined ? data.disableCopyAfterSelectCheckbox : false, // Default to false
                enableSendWithControlEnterCheckbox: data.enableSendWithControlEnterCheckbox !== undefined ? data.enableSendWithControlEnterCheckbox : true, // Default to true
                enableStopWithControlBackspaceCheckbox: data.enableStopWithControlBackspaceCheckbox !== undefined ? data.enableStopWithControlBackspaceCheckbox : true, // Default to true
                useAltForModelSwitcherRadio: data.useAltForModelSwitcherRadio !== undefined ? data.useAltForModelSwitcherRadio : true, // Default to true
                useControlForModelSwitcherRadio: data.useControlForModelSwitcherRadio !== undefined ? data.useControlForModelSwitcherRadio : false, // Default to false
                rememberSidebarScrollPositionCheckbox: data.rememberSidebarScrollPositionCheckbox !== undefined ? data.rememberSidebarScrollPositionCheckbox : false, // Default to false
            };

            // Update the checkbox and radio button states in the popup based on stored or default values
            document.getElementById('hideArrowButtonsCheckbox').checked = defaults.hideArrowButtonsCheckbox;
            document.getElementById('hideCornerButtonsCheckbox').checked = defaults.hideCornerButtonsCheckbox;
            document.getElementById('removeMarkdownOnCopyCheckbox').checked = defaults.removeMarkdownOnCopyCheckbox;
            document.getElementById('moveTopBarToBottomCheckbox').checked = defaults.moveTopBarToBottomCheckbox;
            document.getElementById('pageUpDownTakeover').checked = defaults.pageUpDownTakeover;
            document.getElementById('selectMessagesSentByUserOrChatGptCheckbox').checked = defaults.selectMessagesSentByUserOrChatGptCheckbox;
            document.getElementById('onlySelectUserCheckbox').checked = defaults.onlySelectUserCheckbox;
            document.getElementById('onlySelectAssistantCheckbox').checked = defaults.onlySelectAssistantCheckbox;
            document.getElementById('disableCopyAfterSelectCheckbox').checked = defaults.disableCopyAfterSelectCheckbox;
            document.getElementById('enableSendWithControlEnterCheckbox').checked = defaults.enableSendWithControlEnterCheckbox;
            document.getElementById('enableStopWithControlBackspaceCheckbox').checked = defaults.enableStopWithControlBackspaceCheckbox;
            document.getElementById('useAltForModelSwitcherRadio').checked = defaults.useAltForModelSwitcherRadio;
            document.getElementById('useControlForModelSwitcherRadio').checked = defaults.useControlForModelSwitcherRadio;
            document.getElementById('rememberSidebarScrollPositionCheckbox').checked = defaults.rememberSidebarScrollPositionCheckbox;
            // Store the defaults if the values are missing
            chrome.storage.sync.set(defaults);
        }
    );

    /**
     * Handles checkbox or radio button state changes by saving to Chrome storage and showing a toast.
     * Prevents attaching multiple event listeners.
     * @param {string} elementId - The ID of the checkbox or radio button element.
     * @param {string} storageKey - The key to store the state in Chrome storage.
     */
    function handleStateChange(elementId, storageKey) {
        const element = document.getElementById(elementId);
        if (element && !element.dataset.listenerAttached) {
            element.addEventListener('change', function () {
                const isChecked = this.checked;
                let obj = {};

                if ([
                    'selectMessagesSentByUserOrChatGptCheckbox',
                    'onlySelectUserCheckbox',
                    'onlySelectAssistantCheckbox'
                ].includes(storageKey)) {
                    obj = {
                        selectMessagesSentByUserOrChatGptCheckbox: false,
                        onlySelectUserCheckbox: false,
                        onlySelectAssistantCheckbox: false
                    };
                    obj[storageKey] = isChecked;
                } else if ([
                    'useAltForModelSwitcherRadio',
                    'useControlForModelSwitcherRadio'
                ].includes(storageKey)) {
                    obj = {
                        useAltForModelSwitcherRadio: false,
                        useControlForModelSwitcherRadio: false
                    };
                    obj[storageKey] = isChecked;
                } else {
                    obj[storageKey] = isChecked;
                }


                chrome.storage.sync.set(obj, function () {
                    if (chrome.runtime.lastError) {
                        console.error(`Error saving "${storageKey}":`, chrome.runtime.lastError);
                        showToast(`Error saving option: ${chrome.runtime.lastError.message}`);
                        return;
                    }
                    console.log(`The value of "${storageKey}" is set to ` + isChecked);
                    showToast('Options saved. Reload page to apply changes.');
                });
            });
            element.dataset.listenerAttached = 'true';
        }
    }

    // Apply the handler to each checkbox and radio button
    handleStateChange('hideArrowButtonsCheckbox', 'hideArrowButtonsCheckbox');
    handleStateChange('hideCornerButtonsCheckbox', 'hideCornerButtonsCheckbox');
    handleStateChange('removeMarkdownOnCopyCheckbox', 'removeMarkdownOnCopyCheckbox');
    handleStateChange('moveTopBarToBottomCheckbox', 'moveTopBarToBottomCheckbox');
    handleStateChange('pageUpDownTakeover', 'pageUpDownTakeover');
    handleStateChange('selectMessagesSentByUserOrChatGptCheckbox', 'selectMessagesSentByUserOrChatGptCheckbox');
    handleStateChange('onlySelectUserCheckbox', 'onlySelectUserCheckbox');
    handleStateChange('onlySelectAssistantCheckbox', 'onlySelectAssistantCheckbox');
    handleStateChange('disableCopyAfterSelectCheckbox', 'disableCopyAfterSelectCheckbox');
    handleStateChange('enableSendWithControlEnterCheckbox', 'enableSendWithControlEnterCheckbox');
    handleStateChange('enableStopWithControlBackspaceCheckbox', 'enableStopWithControlBackspaceCheckbox');
    handleStateChange('useAltForModelSwitcherRadio', 'useAltForModelSwitcherRadio');
    handleStateChange('useControlForModelSwitcherRadio', 'useControlForModelSwitcherRadio');
    handleStateChange('rememberSidebarScrollPositionCheckbox', 'rememberSidebarScrollPositionCheckbox');

    const shortcutKeys = [
        'shortcutKeyScrollUpOneMessage',
        'shortcutKeyScrollDownOneMessage',
        'shortcutKeyCopyLowest',
        'shortcutKeyEdit',
        'shortcutKeySendEdit',
        'shortcutKeyCopyAllResponses',
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
        'shortcutKeyToggleSidebarFoldersButton',
        'shortcutKeyToggleModelSelector',
        'shortcutKeyRegenerate',
        'shortcutKeyTemporaryChat',
        'shortcutKeyStudy',
        'shortcutKeyCreateImage',
        'shortcutKeyToggleCanvas',
        'shortcutKeyToggleDictate',
        'shortcutKeyCancelDictation',
        'shortcutKeyShare',
        'shortcutKeyThinkLonger',
    ];
    const shortcutKeyValues = {};

    // Get the stored shortcut keys from chrome storage
    chrome.storage.sync.get(shortcutKeys, function (data) {
        shortcutKeys.forEach(id => {
            const inputElement = document.getElementById(id);
            if (inputElement) {
                const storedValue = data[id]; // Value from storage
                const defaultValue = inputElement.getAttribute('value') || ''; // Default from HTML

                // Case 1: Use stored value if it exists
                // Case 2: Treat non-breaking space as blank
                // Case 3: Fallback to default value
                const value = storedValue === '\u00A0' ? '' : (storedValue !== undefined ? storedValue : defaultValue);

                inputElement.value = value; // Set input field
                shortcutKeyValues[id] = value; // Update in-memory map
                console.log(`Loaded ${id}: "${value}"`); // Debug log
            }
        });
    });

    // Use unified conflict resolution against ALL shortcuts (popup inputs + model slots)
    shortcutKeys.forEach(id => {
        const inputElement = document.getElementById(id);
        if (!inputElement) return;

        inputElement.addEventListener('input', function () {
            let value = this.value.trim();

            // Allow clearing
            if (value === '') {
                saveShortcutValue(id, '');
                showToast('Shortcut updated. Reload page to apply changes.');
                return;
            }

            // Convert to KeyboardEvent.code for cross-system comparison
            const code = window.ShortcutUtils.charToCode(value);
            if (!code) {
                // invalid single-char for our supported map
                saveShortcutValue(id, '');
                this.value = '';
                showToast('Unsupported key. Choose a letter, digit, or supported symbol.');
                return;
            }

            const selfOwner = { type: 'shortcut', id };
            const conflicts = window.ShortcutUtils.buildConflictsForCode(code, selfOwner);

            const proceed = () => {
                // Clear any owners first
                window.ShortcutUtils.clearOwners(conflicts, () => {
                    // Now assign this input's value
                    saveShortcutValue(id, value);
                    showToast('Options saved. Reload page to apply changes.');
                });
            };

            if (conflicts.length) {
                if (prefs.autoOverwrite) {
                    proceed();
                    return;
                }
                const names = conflicts.map(c => c.label).join(', ');
                window.showDuplicateModal(names, (yes, remember) => {
                    if (yes) {
                        if (remember) {
                            prefs.autoOverwrite = true;
                            chrome.storage.sync.set({ autoOverwrite: true });
                        }
                        proceed();
                    } else {
                        // Revert to the previously stored value
                        chrome.storage.sync.get(id, data => {
                            const prev = (data && data[id] && data[id] !== '\u00A0') ? data[id] : '';
                            inputElement.value = prev;
                        });
                    }
                });
            } else {
                // No conflicts
                saveShortcutValue(id, value);
                showToast('Options saved. Reload page to apply changes.');
            }
        });
    });



    // Handling separator keys
    const separatorKeys = ['copyCode-userSeparator', 'copyAll-userSeparator'];

    // Get the stored values and set them in the inputs
    chrome.storage.sync.get(separatorKeys, function (data) {
        separatorKeys.forEach(id => {
            const value = data[id] !== undefined ? data[id] : document.getElementById(id).value;
            document.getElementById(id).value = value;
        });
    });

    // Save separators without trimming or alteration
    separatorKeys.forEach(id => {
        const inputField = document.getElementById(id);
        if (inputField && !inputField.dataset.listenerAttached) {
            inputField.addEventListener('blur', function () {
                const separatorValue = this.value; // Use exact user input
                chrome.storage.sync.set({ [id]: separatorValue }, function () {
                    showToast('Separator saved. Reload page to apply changes.');
                });
            });
            inputField.dataset.listenerAttached = 'true';
        }
    });

    const moveTopBarCheckbox = document.getElementById('moveTopBarToBottomCheckbox');
    const slider = document.getElementById('opacitySlider');
    const sliderValueDisplay = document.getElementById('opacityValue');
    const previewIcon = document.getElementById('opacityPreviewIcon');
    const tooltipContainer = document.getElementById('opacity-tooltip-container');


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
        const isVisible = moveTopBarToBottomCheckbox !== undefined ? moveTopBarToBottomCheckbox : false;
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
            if (isNaN(numericVal)) numericVal = 0.6;

            chrome.storage.sync.set({ popupBottomBarOpacityValue: numericVal }, function () {
                if (chrome.runtime.lastError) {
                    console.error('Storage set error:', chrome.runtime.lastError);
                } else {
                    console.log('popupBottomBarOpacityValue set to', numericVal);
                    showToast('Opacity saved. Reload page to apply changes.');
                }
            });
        }, 500);
    });

    setTimeout(() => {
        balanceWrappedLabels();
    }, 50); // delay lets i18n/localization update labels first





    // ===================== Fade Slim Sidebar =====================

    const fadeSlimSidebarCheckbox = document.getElementById('FadeSlimSidebarCheckbox');
    const slimSidebarSlider = document.getElementById('slimSidebarOpacitySlider');
    const slimSidebarSliderValueDisplay = document.getElementById('slimSidebarOpacityValue');
    const slimSidebarPreviewIcon = document.getElementById('slimSidebarOpacityPreviewIcon');
    const slimSidebarTooltipContainer = document.getElementById('slimSidebar-opacity-tooltip-container');

    function setSlimSidebarOpacityUI(val) {
        slimSidebarSlider.value = val;
        slimSidebarSliderValueDisplay.textContent = Number(val).toFixed(2);
        slimSidebarPreviewIcon.style.opacity = val;
    }

    function toggleSlimSidebarOpacityUI(visible) {
        slimSidebarTooltipContainer.style.display = visible ? 'flex' : 'none';
    }

    // On load, sync checkbox, slider, and UI from storage, enforce "default to 0" logic
    chrome.storage.sync.get(['fadeSlimSidebarEnabled', 'popupSlimSidebarOpacityValue'], (data) => {
        const isEnabled = !!data.fadeSlimSidebarEnabled;
        let val = typeof data.popupSlimSidebarOpacityValue === 'number' ? data.popupSlimSidebarOpacityValue : null;
        fadeSlimSidebarCheckbox.checked = isEnabled;
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

    // Checkbox toggles fade and ensures opacity is set to 0 if enabling for the first time
    fadeSlimSidebarCheckbox.addEventListener('change', () => {
        const isChecked = fadeSlimSidebarCheckbox.checked;
        toggleSlimSidebarOpacityUI(isChecked);

        if (isChecked) {
            // Check if value exists—if not, set to 0
            chrome.storage.sync.get('popupSlimSidebarOpacityValue', (data) => {
                let val = typeof data.popupSlimSidebarOpacityValue === 'number' ? data.popupSlimSidebarOpacityValue : null;
                if (val === null) {
                    val = 0.0;
                    chrome.storage.sync.set({ popupSlimSidebarOpacityValue: val });
                    setSlimSidebarOpacityUI(val);
                } else {
                    setSlimSidebarOpacityUI(val);
                }
                chrome.storage.sync.set({ fadeSlimSidebarEnabled: true }, function () {
                    showToast('Options saved. Reload page to apply changes.');
                });
            });
        } else {
            chrome.storage.sync.set({ fadeSlimSidebarEnabled: false }, function () {
                showToast('Options saved. Reload page to apply changes.');
            });
        }
    });

    // Slider logic – sync value to UI and storage
    let slimSidebarSliderTimeout;
    slimSidebarSlider.addEventListener('input', () => {
        const val = parseFloat(slimSidebarSlider.value);
        slimSidebarSliderValueDisplay.textContent = val.toFixed(2);
        slimSidebarPreviewIcon.style.opacity = val;

        clearTimeout(slimSidebarSliderTimeout);
        slimSidebarSliderTimeout = setTimeout(() => {
            let numericVal = Number(slimSidebarSlider.value);
            if (isNaN(numericVal)) numericVal = 0.0;
            chrome.storage.sync.set({ popupSlimSidebarOpacityValue: numericVal }, function () {
                if (chrome.runtime.lastError) {
                    console.error('Storage set error:', chrome.runtime.lastError);
                } else {
                    showToast('Slim sidebar opacity saved. Reload page to apply changes.');
                }
            });
        }, 500);
    });


});


function enableEditableOpacity(valueId, sliderId, previewIconId, storageKey, defaultVal) {
    const valueSpan = document.getElementById(valueId);
    const slider = document.getElementById(sliderId);
    const previewIcon = document.getElementById(previewIconId);

    valueSpan.addEventListener('click', startEdit);
    valueSpan.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') startEdit(); });

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
            if (isNaN(val)) val = '';
            else {
                if (val > 1) val = 1;
                if (val < 0) val = 0;
                val = Math.round(val * 100) / 100;
            }
            slider.value = val || 0;
            previewIcon.style.opacity = val || 0;
        });

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') input.blur();
            if (!/[0-9.]|Backspace|ArrowLeft|ArrowRight|Tab/.test(e.key) && e.key.length === 1) {
                e.preventDefault();
            }
        });
    }

    function finishEdit(e) {
        valueSpan.classList.remove('editing'); // <--- REMOVE HERE
        let val = parseFloat(e.target.value.replace(/[^\d.]/g, ''));
        if (isNaN(val)) val = defaultVal;
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




enableEditableOpacity('opacityValue', 'opacitySlider', 'opacityPreviewIcon', 'popupBottomBarOpacityValue', 0.6);
enableEditableOpacity('slimSidebarOpacityValue', 'slimSidebarOpacitySlider', 'slimSidebarOpacityPreviewIcon', 'popupSlimSidebarOpacityValue', 0.0);



// ===================== Model Picker Keys (robust save + duplicates + clear + reset) =====================
(function () {
    // Local defaults
    const DEFAULT_MODEL_PICKER_KEY_CODES = [
        'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'
    ];


    function getModelPickerModifier() {
        // Prefer DOM state (instant), fallback to storage defaults if needed
        const ctrlEl = document.getElementById('useControlForModelSwitcherRadio');
        const altEl = document.getElementById('useAltForModelSwitcherRadio');
        if (ctrlEl && ctrlEl.checked) return 'ctrl';
        if (altEl && altEl.checked) return 'alt';
        // Fallback: assume alt if radios not present yet
        return 'alt';
    }
    // Model-picker chip labeler (platform-aware; lowercase output)
    function displayFromCode(code) {
        if (!code || code === '' || code === '\u00A0') return '\u00A0';

        // Robust Mac detection
        const isMac = (() => {
            const ua = navigator.userAgent || '';
            const plat = navigator.platform || '';
            const uaDataPlat = (navigator.userAgentData && navigator.userAgentData.platform) || '';
            return /Mac/i.test(plat) || /Mac/i.test(ua) || /mac/i.test(uaDataPlat);
        })();

        // Letters → lowercase
        if (/^Key([A-Z])$/.test(code)) return code.slice(-1).toLowerCase();

        // Numbers
        if (/^Digit([0-9])$/.test(code)) return code.slice(-1);
        if (/^Numpad([0-9])$/.test(code)) return code.slice(-1);

        // Function keys → "f1"…"f24"
        if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code.toLowerCase();

        // Punctuation / common physical keys
        const baseMap = {
            Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
            Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',',
            Period: '.', Slash: '/', Backquote: '`',
            Space: 'space', Enter: 'enter', Escape: 'esc', Tab: 'tab',
            Backspace: 'bksp', Delete: 'del',
            ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
            IntlBackslash: '\\', IntlYen: '¥', IntlRo: 'ro',
            Lang1: 'lang1', Lang2: 'lang2', Lang3: 'lang3', Lang4: 'lang4', Lang5: 'lang5',
            VolumeMute: 'mute', VolumeDown: 'vol–', VolumeUp: 'vol+',
            MediaPlayPause: 'play/pause', MediaTrackNext: 'next', MediaTrackPrevious: 'prev'
        };

        const mods = isMac
            ? { MetaLeft: '⌘', MetaRight: '⌘', AltLeft: '⌥', AltRight: '⌥', ControlLeft: 'ctrl', ControlRight: 'ctrl', ShiftLeft: '⇧', ShiftRight: '⇧', Fn: 'fn' }
            : { MetaLeft: 'win', MetaRight: 'win', AltLeft: 'alt', AltRight: 'alt', ControlLeft: 'ctrl', ControlRight: 'ctrl', ShiftLeft: 'shift', ShiftRight: 'shift', Fn: 'fn' };

        if (code in baseMap) return baseMap[code];
        if (code in mods) return mods[code];

        // Fallback: humanize + lowercase
        return code.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    }



    function codeEquals(a, b) {
        if (a === b) return true;
        const A = a && a.match(/^(Digit|Numpad)([0-9])$/);
        const B = b && b.match(/^(Digit|Numpad)([0-9])$/);
        return !!(A && B && A[2] === B[2]);
    }
    function charToCode(ch) {
        if (!ch) return '';
        const raw = ch.trim();
        if (!raw) return '';
        const upper = raw.toUpperCase();
        if (/^[A-Z]$/.test(upper)) return `Key${upper}`;
        if (/^[0-9]$/.test(raw)) return `Digit${raw}`;
        switch (raw) {
            case '-': return 'Minus';
            case '=': return 'Equal';
            case '[': return 'BracketLeft';
            case ']': return 'BracketRight';
            case '\\': return 'Backslash';
            case ';': return 'Semicolon';
            case "'": return 'Quote';
            case ',': return 'Comma';
            case '.': return 'Period';
            case '/': return 'Slash';
            case '`': return 'Backquote';
            case ' ': return 'Space';
            default: return '';
        }
    }
    function getShortcutLabelById(id) {
        const el = document.getElementById(id);
        if (!el) return id;
        const label = el.closest('.shortcut-item')?.querySelector('.shortcut-label .i18n')?.textContent?.trim();
        return label || id;
    }

    // Build global-unique conflicts: model slots + popup inputs
    function buildConflictsForCode(code, selfOwner, currentCodes) {
        const conflicts = [];
        const modelMod = getModelPickerModifier(); // 'alt' or 'ctrl'

        // Model slots (same domain; always check)
        currentCodes.forEach((c, i) => {
            if (!c) return;
            const isSelf = selfOwner && selfOwner.type === 'model' && selfOwner.idx === i;
            if (!isSelf && codeEquals(c, code)) {
                const pretty = (window.MODEL_NAMES && window.MODEL_NAMES[i]) ? window.MODEL_NAMES[i] : `Model slot ${i + 1}`;
                conflicts.push({ type: 'model', idx: i, label: pretty });
            }
        });

        // Popup inputs (Alt domain)
        document.querySelectorAll('.key-input[id]').forEach(inp => {
            const id = inp.id;
            const val = inp.value.trim();
            if (!val) return;
            const c2 = charToCode(val);
            if (!c2) return;
            const isSelf = selfOwner && selfOwner.type === 'shortcut' && selfOwner.id === id;
            if (!isSelf && codeEquals(c2, code)) {
                // If we are assigning a model key and the model picker is CTRL, ignore popup "conflicts"
                if (selfOwner && selfOwner.type === 'model' && modelMod === 'ctrl') {
                    return;
                }
                // If we are assigning a popup key and the model picker is CTRL, ignore model vs popup "conflicts"
                if (selfOwner && selfOwner.type === 'shortcut' && modelMod === 'ctrl') {
                    return;
                }
                conflicts.push({ type: 'shortcut', id, label: getShortcutLabelById(id) });
            }
        });

        return conflicts;
    }



    // Clear owners: for shortcuts, clear input and trigger its input handler;
    // for model entries, blank that slot in currentCodes (caller will save).
    function clearOwners(conflicts, currentCodes) {
        let touchedModel = false;
        conflicts.forEach(o => {
            if (o.type === 'shortcut') {
                const target = document.getElementById(o.id);
                if (target) {
                    target.value = '';
                    target.dispatchEvent(new Event('input', { bubbles: true }));
                }
            } else if (o.type === 'model') {
                currentCodes[o.idx] = '';
                touchedModel = true;
            }
        });
        return touchedModel;
    }

    // Robust storage ops with write token so late gets don’t clobber newer writes
    let writeToken = 0;
    function loadCodes(cb) {
        chrome.storage.sync.get('modelPickerKeyCodes', ({ modelPickerKeyCodes }) => {
            const arr = Array.isArray(modelPickerKeyCodes) ? modelPickerKeyCodes.slice(0, 10) : [];
            const normalized = new Array(10).fill('').map((_, i) => (typeof arr[i] === 'string' ? arr[i] : ''));
            cb(normalized);
        });
    }
    function saveCodes(nextCodes, cb) {
        const token = ++writeToken;
        const payload = nextCodes.slice(0, 10);
        chrome.storage.sync.set({ modelPickerKeyCodes: payload }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                console.error('[modelPicker] save error:', chrome.runtime.lastError);
                if (typeof window.showToast === 'function') {
                    window.showToast(`Save failed: ${chrome.runtime.lastError.message || 'storage error'}`);
                }
                if (cb) cb(false);
                return;
            }
            // Verify; ignore late gets if another write happened since
            chrome.storage.sync.get('modelPickerKeyCodes', ({ modelPickerKeyCodes }) => {
                if (token !== writeToken) return; // a newer save happened; ignore
                const ok = Array.isArray(modelPickerKeyCodes)
                    && modelPickerKeyCodes.length === 10
                    && modelPickerKeyCodes.every((v, i) => v === payload[i]);
                if (!ok) {
                    console.warn('[modelPicker] verify mismatch, retrying once');
                    chrome.storage.sync.set({ modelPickerKeyCodes: payload }, () => cb && cb(true));
                    return;
                }
                cb && cb(true);
            });
        });
    }

    function initModelPickerKeysEditor() {
        const chips = Array.from(document.querySelectorAll('.mp-key'));
        if (!chips.length) return;

        // === RESET button (delegated; reuses dup modal if present; verifies save; re-renders) ===
        (function wireResetButton() {
            // Find a reset control (button preferred; fallback to icon text)
            let resetEl = document.getElementById('mp-reset-keys');
            if (!resetEl) {
                resetEl = Array.from(document.querySelectorAll('.mp-icons .material-symbols-outlined'))
                    .find(el => (el.textContent || '').trim() === 'reset_wrench');
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

            // Show a confirm using the existing dup overlay if available, else create a small one
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

                const h2 = overlay.querySelector('#dup-h2') || overlay.querySelector('h2');
                const msg = overlay.querySelector('#dup-msg') || overlay.querySelector('#dup-line2');
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

            // Save defaults and update cache
            function commitDefaults(done) {
                const defaults = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
                if (typeof window.saveModelPickerKeyCodes === 'function') {
                    window.saveModelPickerKeyCodes(defaults, ok => {
                        window.__modelPickerKeyCodes = defaults.slice();
                        document.dispatchEvent(new CustomEvent('modelPickerHydrated'));
                        done(ok, defaults);
                    });
                } else {
                    chrome.storage.sync.set({ modelPickerKeyCodes: defaults }, () => {
                        if (chrome.runtime && chrome.runtime.lastError) {
                            console.error('[reset] save error:', chrome.runtime.lastError);
                            if (typeof window.showToast === 'function') {
                                window.showToast(`Save failed: ${chrome.runtime.lastError.message || 'storage error'}`);
                            }
                            return done(false, defaults);
                        }
                        window.__modelPickerKeyCodes = defaults.slice();
                        document.dispatchEvent(new CustomEvent('modelPickerHydrated'));
                        done(true, defaults);
                    });
                }
            }

            function triggerReset() {
                showConfirmReset((yes) => {
                    if (!yes) return;
                    commitDefaults((ok, next) => {
                        if (typeof loadCodes === 'function') {
                            loadCodes((fresh) => {
                                try { codes = fresh.slice(0, 10); } catch (_) { }
                                if (typeof render === 'function') render();
                                if (typeof window.showToast === 'function') {
                                    window.showToast(ok ? 'Model keys reset to defaults.' : 'Reset attempted; please reopen the popup.');
                                }
                            });
                        } else {
                            codes = next.slice(0, 10);
                            if (typeof render === 'function') render();
                            if (typeof window.showToast === 'function') {
                                window.showToast(ok ? 'Model keys reset to defaults.' : 'Reset attempted; please reopen the popup.');
                            }
                        }
                    });
                });
            }

            resetEl.style.cursor = 'pointer';
            resetEl.addEventListener('click', triggerReset);
            resetEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerReset(); }
            });
            resetEl.dataset.mpResetWired = '1';
        })();




        // Current in-memory set; seed with whatever storage has (or blanks on first load)
        let codes = new Array(10).fill('');

        // Static model names for tooltips and picker UI
        const MODEL_NAMES = [
            'GPT-5 Auto',         // Slot 1
            'GPT-5 Fast',         // Slot 2
            'GPT-5 Thinking Mini',// Slot 3
            'GPT-5 Thinking',     // Slot 4
            'GPT-5 Pro',          // Slot 5
            'Legacy Models  →',   // Slot 6
            '4o',                 // Slot 7
            '4.1',                // Slot 8
            'o3',                 // Slot 9
            'o4-mini'             // Slot 0
        ];
        // Expose globally so other scopes (conflict builders) can read it
        window.MODEL_NAMES = MODEL_NAMES;


        // Apply tooltips to chips: "Set shortcut for\n<ModelName>"
        function applyTooltips() {
            chips.forEach((chip, i) => {
                const model = MODEL_NAMES && MODEL_NAMES[i] ? MODEL_NAMES[i] : `Slot ${i + 1}`;
                const text = `Set shortcut for\n${model}`;
                chip.setAttribute('data-tooltip', text);
                chip.classList.add('custom-tooltip'); // ensures new styling
            });
        }



        function render(src) {
            const arr = Array.isArray(src) ? src : codes;
            chips.forEach((chip, i) => {
                chip.classList.remove('listening');
                chip.textContent = displayFromCode(arr[i] || '');
            });
            applyTooltips();
        }

        // Bootstrap tooltips once at init (static list)
        applyTooltips();



        // Initial load, then render
        // Initial load, with defaults if none exist, then render
        chrome.storage.sync.get(['modelPickerKeyCodes'], data => {
            let stored = Array.isArray(data.modelPickerKeyCodes) && data.modelPickerKeyCodes.length === 10
                ? data.modelPickerKeyCodes.slice(0, 10)
                : DEFAULT_MODEL_PICKER_KEY_CODES.slice();

            codes = stored;
            render();

            // Ensure defaults are saved if no stored config
            if (!Array.isArray(data.modelPickerKeyCodes) || data.modelPickerKeyCodes.length !== 10) {
                chrome.storage.sync.set({ modelPickerKeyCodes: DEFAULT_MODEL_PICKER_KEY_CODES.slice() });
            }
        });


        // Stay in sync if another context updates storage
        // Bootstrap & stay in sync: model keys + autoOverwrite
        // Bootstrap & stay in sync: model keys + autoOverwrite + modelPickerLabels
        (function bootstrapPrefs() {
            chrome.storage.sync.get(['autoOverwrite'], ({ autoOverwrite }) => {
                if (!window.prefs) window.prefs = {};
                window.prefs.autoOverwrite = !!autoOverwrite;
            });
        })();

        const onStorageChange = (changes, area) => {
            // Only care about sync: key codes and autoOverwrite
            if (area === 'sync') {
                if (changes.modelPickerKeyCodes) {
                    const nv = changes.modelPickerKeyCodes.newValue;
                    const arr = Array.isArray(nv) ? nv.slice(0, 10) : new Array(10).fill('');
                    codes = new Array(10).fill('').map((_, i) => (typeof arr[i] === 'string' ? arr[i] : ''));
                    render();
                }
                if (changes.autoOverwrite) {
                    if (!window.prefs) window.prefs = {};
                    window.prefs.autoOverwrite = !!changes.autoOverwrite.newValue;
                }
            }
        };


        chrome.storage.onChanged.addEventListener?.call
            ? chrome.storage.onChanged.addEventListener(onStorageChange)
            : chrome.storage.onChanged.addListener(onStorageChange);


        // Chip capture
        // Single-active capture state for chips
        let activeChip = null;
        let activeKeyHandler = null;

        function cancelActiveCapture() {
            if (!activeChip || !activeKeyHandler) return;
            activeChip.removeEventListener('keydown', activeKeyHandler, true);
            activeChip.classList.remove('listening');
            activeChip = null;
            activeKeyHandler = null;
            render(); // restore label from saved codes
        }

        chips.forEach((chip, idx) => {
            const startCapture = () => {
                // If another chip is in "Set" mode, cancel it first
                if (activeChip && activeChip !== chip) cancelActiveCapture();
                if (activeChip === chip) return; // already active on this chip

                chip.classList.add('listening');
                chip.textContent = 'Set';

                const onKey = (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const code = e.code;

                    // Esc = cancel (no change)
                    if (code === 'Escape') {
                        cancelActiveCapture();
                        return;
                    }

                    // Backspace/Delete = clear this slot
                    if (code === 'Backspace' || code === 'Delete') {
                        const next = codes.slice();
                        next[idx] = '';
                        saveCodes(next, () => {
                            codes = next;
                            cancelActiveCapture();
                            if (typeof window.showToast === 'function') {
                                window.showToast(`Cleared key for slot ${idx + 1}.`);
                            }
                        });
                        return;
                    }

                    // Ignore pure modifiers
                    if (
                        code === 'ShiftLeft' || code === 'ShiftRight' ||
                        code === 'AltLeft' || code === 'AltRight' ||
                        code === 'ControlLeft' || code === 'ControlRight' ||
                        code === 'MetaLeft' || code === 'MetaRight'
                    ) return;

                    const selfOwner = { type: 'model', idx };
                    const conflicts = buildConflictsForCode(code, selfOwner, codes.slice());

                    const proceedAssign = () => {
                        const next = codes.slice();
                        clearOwners(conflicts, next); // clears other owners in inputs/next
                        next[idx] = code;
                        saveCodes(next, () => {
                            codes = next;
                            cancelActiveCapture();
                        });
                    };

                    if (conflicts.length) {
                        const autoOverwrite = !!(window.prefs && window.prefs.autoOverwrite);
                        if (autoOverwrite) {
                            proceedAssign();
                        } else {
                            const names = conflicts.map(c => c.label).join(', ');
                            const ask = typeof window.showDuplicateModal === 'function'
                                ? window.showDuplicateModal
                                : (msg, cb) => {
                                    // Map "Model slot N" → hard-coded MODEL_NAMES[N-1], with 10 → index 9 ("Slot 0")
                                    const prettyMsg = msg
                                        .split(',')
                                        .map(part => {
                                            const t = part.trim();
                                            const m = t.match(/^Model slot\s+(\d+)$/i);
                                            if (!m) return t;
                                            const n = parseInt(m[1], 10);
                                            const idx = (n === 10) ? 9 : (n - 1); // 1..9,10 → 0..8,9
                                            return (Array.isArray(MODEL_NAMES) && MODEL_NAMES[idx]) ? MODEL_NAMES[idx] : t;
                                        })
                                        .join(', ');
                                    cb(window.confirm(`This key is assigned to ${prettyMsg}. Assign here instead?`), false);
                                };

                            ask(names, (yes, remember) => {
                                if (yes) {
                                    if (remember) {
                                        if (!window.prefs) window.prefs = {};
                                        window.prefs.autoOverwrite = true;
                                        chrome.storage.sync.set({ autoOverwrite: true });
                                    }
                                    proceedAssign();
                                } else {
                                    cancelActiveCapture();
                                }

                            });
                        }
                    } else {
                        proceedAssign();
                    }
                };

                chip.addEventListener('keydown', onKey, true);
                activeChip = chip;
                activeKeyHandler = onKey;
                chip.focus();
            };

            chip.addEventListener('click', startCapture);
            chip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') startCapture(); });
        });

        // Optional: clicking outside the chip row cancels active capture
        document.addEventListener('mousedown', (evt) => {
            if (!activeChip) return;
            if (!evt.target.closest('.mp-icons')) {
                cancelActiveCapture();
            }
        });

    }

    document.addEventListener('DOMContentLoaded', initModelPickerKeysEditor);
})();



// Search Filter IIFE

(() => {
    let container, bar, input, idx = [], altTables;
    const qSel = s => Array.from((container || document).querySelectorAll(s));
    const tok = s => (s || '').toLowerCase().replace(/[_\-]+/g, ' ').split(/[^a-z0-9]+/g).filter(Boolean);
    const loadAlt = () => {
        if (altTables) return altTables;
        altTables = [];
        const guesses = [window.APP_LOCALE_MESSAGES, window.I18N_MESSAGES, window.localeMessages, window.messages];
        guesses.forEach(t => t && altTables.push(t));
        try { const el = document.getElementById('i18n-messages'); if (el?.textContent) altTables.push(JSON.parse(el.textContent)); } catch { }
        return altTables;
    };
    const getMsg = key => {
        if (!key) return '';
        try { if (chrome?.i18n?.getMessage) { const s = chrome.i18n.getMessage(key); if (s) return s; } } catch { }
        for (const tbl of loadAlt()) {
            if (!tbl) continue;
            if (typeof tbl[key] === 'string') return tbl[key];
            if (tbl[key]?.message) return String(tbl[key].message);
        }
        return '';
    };
    const resolveMSG = v => { const m = /^__MSG_([A-Za-z0-9_]+)__$/.exec(v || ''); return m ? getMsg(m[1]) : (v || ''); };

    const collect = tile => {
        const out = [];
        tile.querySelectorAll('[data-i18n]').forEach(el => {
            const k = el.getAttribute('data-i18n'); const msg = getMsg(k); if (msg) out.push(msg);
            const txt = (el.textContent || '').trim(); if (txt) out.push(txt);
        });
        tile.querySelectorAll('[data-tooltip]').forEach(el => out.push(resolveMSG(el.getAttribute('data-tooltip'))));
        ['aria-label', 'title', 'placeholder'].forEach(a => { const v = tile.getAttribute(a); if (v) out.push(resolveMSG(v)); });
        tile.querySelectorAll('.shortcut-keys .key-text, .shortcut-keys input.key-input').forEach(x => out.push((x.value || x.textContent || '').trim()));
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
        if (set.has(t)) return true;          // exact token match
        for (const w of set) {                // partial, anywhere in the word
            if (w.includes(t)) return true;
        }
        return false;
    };


    const apply = q => {
        const tokens = tok(q), all = tokens.length === 0;
        idx.forEach(({ el, words }) => { const ok = all || tokens.every(t => match(words, t)); el.style.display = ok ? '' : 'none'; });
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
        (grid && grid.parentNode ? grid.parentNode : title?.parentNode || container)
            .insertBefore(bar, grid || title?.nextSibling || container.firstChild);
        input = bar.querySelector('.ios-search-input');
        const cancel = bar.querySelector('.ios-search-cancel');
        input.addEventListener('input', () => apply(input.value));
        input.addEventListener('search', () => apply(input.value));
        input.addEventListener('focus', () => bar.classList.add('focused'));
        input.addEventListener('blur', () => { if (!input.value) bar.classList.remove('focused'); });
        cancel.addEventListener('click', () => { input.value = ''; apply(''); input.blur(); });

        // Focus the input when bar is injected
        setTimeout(() => {
            input.focus();
            // Optionally select all text if needed:
            // input.select();
        }, 0);
    };

    const observe = () => {
        let t; const deb = () => { clearTimeout(t); t = setTimeout(() => { build(); apply(input?.value || ''); }, 80); };
        const mo = new MutationObserver(() => deb());
        mo.observe(container, {
            subtree: true, childList: true, attributes: true,
            attributeFilter: ['data-i18n', 'data-tooltip', 'title', 'aria-label', 'placeholder']
        });
    };

    const run = () => {
        container = document.querySelector('.shortcut-container'); if (!container) return;
        injectBar(); build(); observe(); apply('');
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
})();

