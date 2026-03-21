/* shared/model-picker-labels.js
   Single source of truth for model-picker labels and defaults.
   Safe in both popup (extension page) and content script isolated world.
*/
(() => {
  const MAX_SLOTS = 15;
  const PRIMARY_ACTIONS = Object.freeze([
    Object.freeze({
      slot: 0,
      id: 'instant',
      group: 'primary',
      label: 'Instant',
      actionKind: 'main-row',
      mainIndex: 0,
    }),
    Object.freeze({
      slot: 1,
      id: 'thinking',
      group: 'primary',
      label: 'Thinking',
      actionKind: 'main-row',
      mainIndex: 1,
    }),
    Object.freeze({
      slot: 2,
      id: 'configure',
      group: 'primary',
      label: 'Configure...',
      actionKind: 'configure-open',
      testId: 'model-configure-modal',
      mainIndex: 2,
    }),
  ]);
  const CONFIGURE_ACTIONS = Object.freeze([
    Object.freeze({
      slot: 3,
      id: 'configure-latest',
      group: 'configure',
      label: 'Latest',
      actionKind: 'configure-option',
      optionKind: 'first',
    }),
    Object.freeze({
      slot: 4,
      id: 'configure-5-2',
      group: 'configure',
      label: '5.2',
      actionKind: 'configure-option',
      optionKind: 'value',
      optionValue: '5.2',
    }),
    Object.freeze({
      slot: 5,
      id: 'configure-5-0-thinking-mini',
      group: 'configure',
      label: '5.0 Thinking Mini',
      actionKind: 'configure-option',
      optionKind: 'value',
      optionValue: '5.0',
    }),
    Object.freeze({
      slot: 6,
      id: 'configure-o3',
      group: 'configure',
      label: 'o3',
      actionKind: 'configure-option',
      optionKind: 'value',
      optionValue: 'o3',
    }),
  ]);
  const ACTION_GROUPS = Object.freeze([
    Object.freeze({
      id: 'primary',
      label: '',
      labelI18nKey: '',
      compactLabel: false,
      actions: PRIMARY_ACTIONS,
    }),
    Object.freeze({
      id: 'configure',
      label: 'Configure Models',
      labelI18nKey: 'label_configureModelsCompact',
      compactLabel: true,
      actions: CONFIGURE_ACTIONS,
    }),
  ]);
  const ACTION_SLOTS = Object.freeze(
    ACTION_GROUPS.flatMap((group) => group.actions.map((action) => Object.freeze({ ...action }))),
  );
  const ACTION_SLOT_COUNT = ACTION_SLOTS.length;

  // Canonical mapping based on current HTML (use sparingly; prefer parsing testids)
  const TESTID_CANON = Object.freeze({
    // Stable non-GPT-5 ids
    'model-switcher-gpt-4o': '4o',
    'model-switcher-gpt-4-1': '4.1',
    'model-switcher-o3': 'o3',
    'model-switcher-o4-mini': 'o4-mini',
  });

  // Keep index fallback intentionally empty. Main-menu rows now change labels more often
  // than their test ids, so guessing by position causes stale labels like "Auto".
  const MAIN_CANON_BY_INDEX = [];

  const normTid = (tid) => (tid || '').toLowerCase().trim();

  const capitalizeWord = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

  // Canonical labels from data-testid (language/format resilient).
  // This is intentionally conservative: return '' when unsure so callers can fall back to DOM text.
  const canonFromTid = (tid) => {
    const t = normTid(tid);
    if (!t) return '';

    // 1) Known stable ids first
    if (TESTID_CANON[t]) return TESTID_CANON[t];

    // 2) Bare GPT-5.x ids are no longer safe to label from the tid alone.
    // Current menus may show "Instant" or other copy while reusing the same id.
    // Return empty so callers can prefer the visible primary label.
    if (/^model-switcher-gpt-5-\d+$/.test(t)) return '';

    // 3) GPT-x.y Instant/Thinking (e.g., model-switcher-gpt-5-3-instant)
    let m = t.match(/^model-switcher-gpt-(\d+)-(\d+)-(instant|thinking)$/);
    if (m) return `GPT-${m[1]}.${m[2]} ${capitalizeWord(m[3])}`;

    // 4) GPT-x Instant/Thinking (e.g., model-switcher-gpt-5-thinking)
    m = t.match(/^model-switcher-gpt-(\d+)-(instant|thinking)$/);
    if (m) return `GPT-${m[1]} ${capitalizeWord(m[2])}`;

    // 5) GPT-x mini variants (legacy tid)
    m = t.match(/^model-switcher-gpt-(\d+)-t-mini$/);
    if (m) return `GPT-${m[1]} mini`;

    return '';
  };

  const isSubmenuTrigger = (el) =>
    !!el &&
    (el.hasAttribute('data-has-submenu') ||
      el.getAttribute('aria-haspopup') === 'menu' ||
      el.hasAttribute('aria-controls'));

  // Strip hints and tertiary text
  const textNoHint = (el) => {
    if (!el) return '';
    const primary =
      el.querySelector('.flex.items-center.gap-1') ||
      el.querySelector('.flex.items-center') ||
      el.querySelector('.flex.min-w-0.grow.items-center .truncate') ||
      el.querySelector('.truncate') ||
      el;

    const node = primary.cloneNode(true);
    node
      .querySelectorAll('.alt-hint, .text-xs, .not-group-data-disabled\\:text-token-text-tertiary')
      .forEach((n) => {
        n.remove();
      });

    const txt = (node.textContent || '').replace(/\s+/g, ' ').trim();
    return txt
      .replace(/\s*(?:Alt|Ctrl|Control|⌘|Cmd|Meta|Win|Option|Opt|Shift)\s*\+\s*\S+$/, '')
      .trim();
  };

  // Normalize submenu labels (language/format resilient)
  const mapSubmenuLabel = (s) => {
    const t = (s || '').normalize('NFKD');

    // “GPT-5 Thinking mini”, “GPT 5 mini”, etc. → “GPT-5 mini”
    if (/\bgpt[\s.-]*5(?:\.\d+)?\s+(?:thinking\s+)?mini\b/i.test(t)) return 'GPT-5 mini';

    // Other knowns
    if (/\bo4\s*-\s*mini\b/i.test(t) || /\bo4\s*mini\b/i.test(t) || /\bo4-?mini\b/i.test(t))
      return 'o4-mini';
    if (/\bo3\b/i.test(t)) return 'o3';
    if (/\b4\.?1\b/i.test(t)) return '4.1';
    if (/\b4o\b/i.test(t) || /\bgpt[-\s]?4o\b/i.test(t)) return '4o';
    return '';
  };

  const defaultActionNames = () => ACTION_SLOTS.map((action) => action.label);

  const defaultKeyCodes = () => {
    const arr = new Array(MAX_SLOTS).fill('');
    arr[0] = 'Digit1';
    arr[1] = 'Digit2';
    arr[2] = 'Digit3';
    return arr;
  };

  const normalizeStoredActionName = (slot, value) => {
    const text = (value ?? '').toString().trim();
    if (!text) return '';
    if (slot === 5 && text === '5.0') return '5.0 Thinking Mini';
    return text;
  };

  const isLegacyArrow = (s) => {
    const t = (s ?? '').toString().trim();
    if (!t) return false;
    if (t === '→') return true;
    if (/^legacy\s*models?/i.test(t)) return true;
    return /legacy/i.test(t) && t.includes('→');
  };

  const resolveActionableNames = (incoming) => {
    const out = defaultActionNames();
    const inArr = Array.isArray(incoming) ? incoming.slice(0, MAX_SLOTS) : [];
    for (let i = 0; i < ACTION_SLOT_COUNT; i++) {
      const value = normalizeStoredActionName(i, inArr[i]);
      if (value && !isLegacyArrow(value)) out[i] = value;
    }
    return out.slice(0, ACTION_SLOT_COUNT);
  };

  // Best-guess defaults for initial UI (before scrape). Arrow is canonical “→”.
  const defaultNames = () => {
    const arr = defaultActionNames();
    while (arr.length < MAX_SLOTS) arr.push('');
    return arr;
  };

  // Only for popup display aesthetics: replace bare “→” with “Legacy Models →”
  const prettifyForPopup = (names) => {
    const cap = Math.min(MAX_SLOTS, Array.isArray(names) ? names.length : 0);
    const out = (Array.isArray(names) ? names.slice(0, cap) : []).concat();
    const idx = out.indexOf('→');
    if (idx !== -1) out[idx] = 'Legacy Models →';
    while (out.length < MAX_SLOTS) out.push('');
    return out;
  };

  const getActionGroups = () => ACTION_GROUPS.map((group) => ({ ...group, actions: group.actions.slice() }));
  const getActionSlots = () => ACTION_SLOTS.slice();
  const getActionBySlot = (slot) =>
    Number.isInteger(slot) && slot >= 0 && slot < ACTION_SLOTS.length ? ACTION_SLOTS[slot] : null;

  window.ModelLabels = Object.freeze({
    MAX_SLOTS,
    ACTION_SLOT_COUNT,
    TESTID_CANON,
    MAIN_CANON_BY_INDEX,
    normTid,
    canonFromTid,
    isSubmenuTrigger,
    textNoHint,
    mapSubmenuLabel,
    getActionGroups,
    getActionSlots,
    getActionBySlot,
    defaultKeyCodes,
    normalizeStoredActionName,
    resolveActionableNames,
    defaultNames,
    prettifyForPopup,
  });
})();
