/* shared/model-picker-labels.js
   Single source of truth for model-picker labels and defaults.
   Safe in both popup (extension page) and content script isolated world.
*/
(() => {
  const MAX_SLOTS = 15;
  const DEFAULT_ACTIVE_CONFIG_ID = 'configure-latest';
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
  const EXTRA_ACTIONS = Object.freeze([
    Object.freeze({
      slot: 7,
      id: 'pro',
      group: 'primary-extra',
      label: 'Pro',
      actionKind: 'configure-frontend-row',
      requiredConfigId: 'configure-latest',
      rowLabel: 'Pro',
    }),
  ]);
  const MODEL_NAME_ACTIONS = Object.freeze([
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
      label: 'Pick Model',
      labelI18nKey: 'label_configureModelsCompact',
      compactLabel: true,
      actions: MODEL_NAME_ACTIONS,
    }),
  ]);
  const ACTION_SLOTS = Object.freeze(
    [...PRIMARY_ACTIONS, ...MODEL_NAME_ACTIONS, ...EXTRA_ACTIONS].map((action) =>
      Object.freeze({ ...action }),
    ),
  );
  const ACTION_SLOT_COUNT = ACTION_SLOTS.length;
  const ACTION_BY_ID = Object.freeze(
    ACTION_SLOTS.reduce((acc, action) => {
      acc[action.id] = action;
      return acc;
    }, {}),
  );
  const MODEL_NAME_ACTION_IDS = Object.freeze(MODEL_NAME_ACTIONS.map((action) => action.id));
  const MODEL_NAME_DYNAMIC_SLOT_START =
    Math.max(
      ...MODEL_NAME_ACTIONS.map((action) => action.slot),
      ...EXTRA_ACTIONS.map((action) => action.slot),
    ) + 1;
  const PRIMARY_ACTION_IDS_BY_ACTIVE_CONFIG = Object.freeze({
    'configure-latest': Object.freeze(['instant', 'thinking', 'configure']),
    'configure-5-2': Object.freeze(['instant', 'thinking', 'configure-latest', 'configure']),
    'configure-5-0-thinking-mini': Object.freeze([
      'configure-5-0-thinking-mini',
      'configure-latest',
      'configure',
    ]),
    'configure-o3': Object.freeze(['configure-o3', 'configure-latest', 'configure']),
  });
  const PRIMARY_ALIAS_BY_ID = Object.freeze({
    'configure-latest': Object.freeze({
      label: 'Use latest model',
      labelI18nKey: 'label_modelPickerUseLatestModel',
    }),
    'configure-5-0-thinking-mini': Object.freeze({
      label: 'Thinking mini',
      labelI18nKey: 'label_modelPickerThinkingMini',
    }),
  });
  const POPUP_PRIMARY_FALLBACK_IDS_BY_ACTIVE_CONFIG = Object.freeze({
    'configure-latest': Object.freeze(['instant', 'thinking', 'configure']),
    'configure-5-2': Object.freeze(['instant', 'thinking', 'configure']),
    'configure-5-0-thinking-mini': Object.freeze(['configure-5-0-thinking-mini', 'configure']),
    'configure-o3': Object.freeze(['configure-o3', 'configure']),
  });
  const DEFAULT_INTEGRATED_MODEL_CATALOG = Object.freeze({
    version: 3,
    integratedEffort: true,
    scrapedAt: 0,
    thinkingEffortIds: Object.freeze([]),
    configureOptions: Object.freeze([
      Object.freeze({ id: 'configure-latest', label: '5.5', slot: 3 }),
      Object.freeze({ id: 'configure-dynamic-5-4', label: '5.4', slot: 8 }),
      Object.freeze({ id: 'configure-dynamic-5-3', label: '5.3', slot: 9 }),
      Object.freeze({ id: 'configure-o3', label: 'o3', slot: 6 }),
    ]),
    frontendByConfig: Object.freeze({
      'configure-latest': Object.freeze([
        Object.freeze({ available: true, id: 'instant', label: 'Instant', slot: 0 }),
        Object.freeze({ available: true, id: 'thinking', label: 'Medium', slot: 1 }),
        Object.freeze({ available: true, id: 'pro', label: 'High', slot: 7 }),
      ]),
      'configure-dynamic-5-4': Object.freeze([
        Object.freeze({ available: true, id: 'instant', label: 'Instant', slot: 0 }),
        Object.freeze({ available: true, id: 'thinking', label: 'Medium', slot: 1 }),
        Object.freeze({ available: true, id: 'pro', label: 'High', slot: 7 }),
      ]),
      'configure-dynamic-5-3': Object.freeze([
        Object.freeze({ available: true, id: 'instant', label: 'Instant', slot: 0 }),
      ]),
      'configure-o3': Object.freeze([
        Object.freeze({ available: true, id: 'thinking', label: 'Medium', slot: 1 }),
      ]),
    }),
  });
  const DEFAULT_INTEGRATED_MODEL_NAMES = Object.freeze([
    'Instant',
    'Medium',
    '',
    '5.5',
    '',
    '',
    'o3',
    'High',
    '5.4',
    '5.3',
  ]);
  const THINKING_EFFORT_OPTIONS = Object.freeze([
    Object.freeze({
      id: 'thinking-standard',
      storageKey: 'shortcutKeyThinkingStandard',
      label: 'Thinking Standard',
      optionLabel: 'Standard',
      iconToken: '#fec800',
      optional: false,
      order: 0,
    }),
    Object.freeze({
      id: 'thinking-extended',
      storageKey: 'shortcutKeyThinkingExtended',
      label: 'Thinking Extended',
      optionLabel: 'Extended',
      iconToken: '#143e56',
      optional: false,
      order: 1,
    }),
    Object.freeze({
      id: 'thinking-light',
      storageKey: 'shortcutKeyThinkingLight',
      label: 'Thinking Light',
      optionLabel: 'Light',
      iconToken: '#407870',
      optional: true,
      order: 2,
    }),
    Object.freeze({
      id: 'thinking-heavy',
      storageKey: 'shortcutKeyThinkingHeavy',
      label: 'Thinking Heavy',
      optionLabel: 'Heavy',
      iconToken: '#3c5754',
      optional: true,
      order: 3,
    }),
  ]);
  const THINKING_EFFORT_BY_ID = Object.freeze(
    THINKING_EFFORT_OPTIONS.reduce((acc, option) => {
      acc[option.id] = option;
      return acc;
    }, {}),
  );
  const THINKING_EFFORT_BY_STORAGE_KEY = Object.freeze(
    THINKING_EFFORT_OPTIONS.reduce((acc, option) => {
      acc[option.storageKey] = option;
      return acc;
    }, {}),
  );
  const PRO_THINKING_EFFORT_SHORTCUTS = Object.freeze([
    Object.freeze({
      id: 'pro-standard',
      storageKey: 'shortcutKeyProStandard',
      optionId: 'thinking-standard',
      label: 'Pro Standard',
      optional: true,
      order: 0,
    }),
    Object.freeze({
      id: 'pro-extended',
      storageKey: 'shortcutKeyProExtended',
      optionId: 'thinking-extended',
      label: 'Pro Extended',
      optional: true,
      order: 1,
    }),
  ]);
  const PRO_THINKING_EFFORT_BY_STORAGE_KEY = Object.freeze(
    PRO_THINKING_EFFORT_SHORTCUTS.reduce((acc, option) => {
      acc[option.storageKey] = option;
      return acc;
    }, {}),
  );

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

  const DEFAULT_SEQUENTIAL_MODEL_CODES = Object.freeze([
    'Digit1',
    'Digit2',
    'Digit3',
    'Digit4',
    'Digit5',
    'Digit6',
    'Digit7',
  ]);
  const DEFAULT_PICK_MODEL_CODE = 'Digit0';

  const buildDefaultKeyCodesFromPresentationGroups = (groups) => {
    const out = new Array(MAX_SLOTS).fill('');
    const seenSlots = new Set();
    let nextSequentialIndex = 0;

    (Array.isArray(groups) ? groups : []).forEach((group) => {
      (Array.isArray(group?.actions) ? group.actions : []).forEach((action) => {
        const base =
          getActionById(action?.id) ||
          (Number.isInteger(Number(action?.slot)) ? getActionBySlot(Number(action.slot)) : null) ||
          action;
        const slot = Number(base?.slot);
        if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS || seenSlots.has(slot)) return;

        seenSlots.add(slot);

        if (base?.id === 'configure') {
          out[slot] = DEFAULT_PICK_MODEL_CODE;
          return;
        }

        if (nextSequentialIndex < DEFAULT_SEQUENTIAL_MODEL_CODES.length) {
          out[slot] = DEFAULT_SEQUENTIAL_MODEL_CODES[nextSequentialIndex];
          nextSequentialIndex += 1;
        }
      });
    });

    return out;
  };

  const defaultKeyCodes = () => {
    return buildDefaultKeyCodesFromPresentationGroups(
      getPopupPresentationGroups(DEFAULT_ACTIVE_CONFIG_ID, defaultNames(), null),
    );
  };

  const isDynamicModelNameActionId = (value) =>
    /^configure-dynamic-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || '').trim());
  const normalizeModelNameLabel = (value) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  const isLatestModelNameLabel = (value) => {
    const text = normalizeModelNameLabel(value).toLowerCase();
    return text === 'latest' || /^latest\b/.test(text);
  };
  const parseModelNameVersion = (value) => {
    const text = normalizeModelNameLabel(value);
    const match = text.match(/(?:^|\b)(\d+(?:\.\d+)+)(?:\b|$)/);
    return match ? match[1].split('.').map((part) => Number(part)) : null;
  };
  const compareModelNameVersions = (left, right) => {
    const a = Array.isArray(left) ? left : [];
    const b = Array.isArray(right) ? right : [];
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i++) {
      const delta = (Number(a[i]) || 0) - (Number(b[i]) || 0);
      if (delta !== 0) return delta;
    }
    return 0;
  };
  const getLatestModelNameIndex = (labels) => {
    const normalizedLabels = Array.isArray(labels) ? labels : [];
    const explicitLatestIndex = normalizedLabels.findIndex(isLatestModelNameLabel);
    if (explicitLatestIndex >= 0) return explicitLatestIndex;

    let latestIndex = -1;
    let latestVersion = null;
    normalizedLabels.forEach((label, index) => {
      const version = parseModelNameVersion(label);
      if (!version) return;
      if (latestIndex < 0 || compareModelNameVersions(version, latestVersion) > 0) {
        latestIndex = index;
        latestVersion = version;
      }
    });
    return latestIndex;
  };
  const slugifyModelNameLabel = (value) => {
    const slug = normalizeModelNameLabel(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'option';
  };
  const normalizeModelNameActionId = (value) => {
    const id = String(value || '').trim();
    if (MODEL_NAME_ACTION_IDS.includes(id) || isDynamicModelNameActionId(id)) return id;
    return '';
  };
  const normalizeActiveConfigId = (value) =>
    normalizeModelNameActionId(value) || DEFAULT_ACTIVE_CONFIG_ID;
  const normalizeAvailableConfigId = (value) => {
    return normalizeModelNameActionId(value);
  };
  const toValidSlot = (value) => {
    const slot = Number(value);
    return Number.isInteger(slot) && slot >= 0 && slot < MAX_SLOTS ? slot : -1;
  };
  const toValidDynamicModelNameSlot = (value) => {
    const slot = toValidSlot(value);
    return slot >= MODEL_NAME_DYNAMIC_SLOT_START ? slot : -1;
  };
  const getDynamicModelNameFallbackSlot = (optionIndex) => {
    const index = Number.isInteger(Number(optionIndex)) ? Number(optionIndex) : 0;
    return Math.min(MAX_SLOTS - 1, MODEL_NAME_DYNAMIC_SLOT_START + Math.max(0, index - 1));
  };

  const getActionById = (id) => ACTION_BY_ID[String(id || '').trim()] || null;
  const getStaticModelNameActionForLabel = (label, optionIndex, latestIndex = -1) => {
    const text = normalizeModelNameLabel(label);
    const normalizedIndex = Number.isInteger(Number(optionIndex)) ? Number(optionIndex) : -1;
    const normalizedLatestIndex = Number.isInteger(Number(latestIndex)) ? Number(latestIndex) : -1;
    const isLatestIndex =
      normalizedLatestIndex >= 0
        ? normalizedIndex === normalizedLatestIndex
        : normalizedIndex === 0;
    if (isLatestIndex || isLatestModelNameLabel(text)) return getActionById('configure-latest');
    if (text === '5.2') return getActionById('configure-5-2');
    if (text === '5.0') return getActionById('configure-5-0-thinking-mini');
    if (text === 'o3') return getActionById('configure-o3');
    return null;
  };
  const getModelNameActionForLabel = (label, optionIndex = -1, slotHint = -1) => {
    const text = normalizeModelNameLabel(label);
    const staticAction = getStaticModelNameActionForLabel(text, optionIndex);
    if (staticAction) return { ...staticAction };
    if (!text) return null;
    const hintedSlot = toValidDynamicModelNameSlot(slotHint);
    const slot = hintedSlot >= 0 ? hintedSlot : getDynamicModelNameFallbackSlot(optionIndex);
    return {
      slot,
      id: `configure-dynamic-${slugifyModelNameLabel(text)}`,
      group: 'configure',
      label: text,
      actionKind: 'configure-option',
      optionKind: 'value',
      optionValue: text,
      optionIndex: Number(optionIndex),
    };
  };
  const getModelNameActionForLabelInList = (
    label,
    optionIndex = -1,
    labels = [],
    slotHint = -1,
  ) => {
    const latestIndex = getLatestModelNameIndex(labels);
    const text = normalizeModelNameLabel(label);
    const staticAction = getStaticModelNameActionForLabel(text, optionIndex, latestIndex);
    if (staticAction) return { ...staticAction };
    if (!text) return null;
    const hintedSlot = toValidDynamicModelNameSlot(slotHint);
    const slot = hintedSlot >= 0 ? hintedSlot : getDynamicModelNameFallbackSlot(optionIndex);
    return {
      slot,
      id: `configure-dynamic-${slugifyModelNameLabel(text)}`,
      group: 'configure',
      label: text,
      actionKind: 'configure-option',
      optionKind: 'value',
      optionValue: text,
      optionIndex: Number(optionIndex),
    };
  };
  const getCatalogModelNameActions = (catalog, incomingNames) => {
    const options = Array.isArray(catalog?.configureOptions) ? catalog.configureOptions : [];
    const seenActionIds = new Set();
    const usedSlots = new Set();
    const reservedDynamicSlots = new Set(
      options
        .map((option) => toValidDynamicModelNameSlot(option?.slot))
        .filter((slot) => slot >= 0),
    );
    let nextDynamicSlot = MODEL_NAME_DYNAMIC_SLOT_START;
    const takeNextDynamicSlot = () => {
      while (
        nextDynamicSlot < MAX_SLOTS &&
        (usedSlots.has(nextDynamicSlot) || reservedDynamicSlots.has(nextDynamicSlot))
      ) {
        nextDynamicSlot += 1;
      }
      if (nextDynamicSlot >= MAX_SLOTS) return -1;
      const slot = nextDynamicSlot;
      nextDynamicSlot += 1;
      return slot;
    };
    return options
      .map((option, index) => {
        const optionId = normalizeAvailableConfigId(option?.id);
        const base =
          getActionById(optionId) ||
          getModelNameActionForLabel(option?.label || '', index, option?.slot);
        const actionId = optionId || base?.id || '';
        if (!base || seenActionIds.has(actionId)) return null;
        const isDynamic = isDynamicModelNameActionId(actionId);
        let slot = toValidSlot(base.slot);
        if (isDynamic) {
          const optionSlot = toValidDynamicModelNameSlot(option?.slot);
          slot = optionSlot >= 0 ? optionSlot : -1;
          if (slot < MODEL_NAME_DYNAMIC_SLOT_START || usedSlots.has(slot)) {
            slot = takeNextDynamicSlot();
          }
          if (slot < 0) return null;
        } else if (slot < 0 || usedSlots.has(slot)) {
          return null;
        }
        seenActionIds.add(actionId);
        usedSlots.add(slot);
        const label =
          getCanonicalActionLabel(actionId, option?.label || '') ||
          resolveModelNameDisplayLabel(base, incomingNames);
        return {
          ...base,
          slot,
          label,
        };
      })
      .filter(Boolean);
  };
  const getCatalogActionById = (id, catalog, incomingNames = []) => {
    const actionId = String(id || '').trim();
    if (!actionId) return null;
    const staticAction = getActionById(actionId);
    if (staticAction) return { ...staticAction };
    return (
      getCatalogModelNameActions(catalog, incomingNames).find((action) => action.id === actionId) ||
      null
    );
  };
  const getCatalogModelNameActionForLabel = (label, optionIndex = -1, catalog = null) => {
    const text = normalizeModelNameLabel(label);
    const fallback = getModelNameActionForLabel(text, optionIndex);
    const catalogActions = getCatalogModelNameActions(catalog, []);
    if (catalogActions.length) {
      const byId = fallback?.id ? catalogActions.find((action) => action.id === fallback.id) : null;
      if (byId) return { ...byId, fromCatalog: true };

      const byLabel = text
        ? catalogActions.find((action) => normalizeModelNameLabel(action.label) === text)
        : null;
      if (byLabel) return { ...byLabel, fromCatalog: true };
    }
    return fallback ? { ...fallback, fromCatalog: false } : null;
  };
  const getConfigureActionForOption = getModelNameActionForLabel;
  const getConfigureActionForOptionInList = getModelNameActionForLabelInList;
  const getLatestConfigureOptionIndex = getLatestModelNameIndex;
  const getCatalogConfigureActionForOption = getCatalogModelNameActionForLabel;
  const resolveCatalogActiveConfigId = (activeConfigId, catalog) => {
    const normalizedActiveConfigId = normalizeActiveConfigId(activeConfigId);
    const availableIds = getCatalogModelNameActions(catalog, []).map((action) => action.id);
    if (!availableIds.length || availableIds.includes(normalizedActiveConfigId)) {
      return normalizedActiveConfigId;
    }
    return availableIds.includes(DEFAULT_ACTIVE_CONFIG_ID)
      ? DEFAULT_ACTIVE_CONFIG_ID
      : availableIds[0];
  };
  const getModelNamePresentationActions = (activeConfigId, incomingNames, catalog) => {
    const normalizedActiveConfigId = normalizeActiveConfigId(activeConfigId);
    const sourceActions = getCatalogModelNameActions(catalog, incomingNames);
    const actions = sourceActions.length ? sourceActions : MODEL_NAME_ACTIONS;
    return actions.map((action) => ({
      ...action,
      label: sourceActions.length
        ? action.label
        : resolveModelNameDisplayLabel(action, incomingNames),
      viewGroup: 'configure',
      viewKey: `configure:${action.id}`,
      active: action.id === normalizedActiveConfigId,
      labelI18nKey: '',
    }));
  };
  const getPrimaryActionIdsForActiveConfig = (activeConfigId) =>
    PRIMARY_ACTION_IDS_BY_ACTIVE_CONFIG[normalizeActiveConfigId(activeConfigId)] ||
    PRIMARY_ACTION_IDS_BY_ACTIVE_CONFIG[DEFAULT_ACTIVE_CONFIG_ID];
  const getPopupPrimaryFallbackIdsForActiveConfig = (activeConfigId) =>
    POPUP_PRIMARY_FALLBACK_IDS_BY_ACTIVE_CONFIG[normalizeActiveConfigId(activeConfigId)] ||
    POPUP_PRIMARY_FALLBACK_IDS_BY_ACTIVE_CONFIG[DEFAULT_ACTIVE_CONFIG_ID];

  const normalizeMenuText = (value) =>
    (value || '').toString().normalize('NFKD').replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizeThinkingEffortId = (value) => {
    const text = normalizeMenuText(value).replace(/[_-]+/g, ' ');
    if (!text) return '';
    if (THINKING_EFFORT_BY_ID[text]) return text;
    if (text === 'light' || text === 'thinking light') return 'thinking-light';
    if (text === 'standard' || text === 'thinking standard') return 'thinking-standard';
    if (text === 'extended' || text === 'thinking extended') return 'thinking-extended';
    if (text === 'heavy' || text === 'thinking heavy') return 'thinking-heavy';
    return '';
  };
  const normalizeThinkingEffortIconToken = (value) => {
    const raw = String(value || '')
      .trim()
      .toLowerCase();
    const match = raw.match(/#([a-z0-9]+)/i);
    return match ? `#${match[1].toLowerCase()}` : '';
  };
  const mapThinkingEffortLabelToId = (label) => normalizeThinkingEffortId(label);
  const getThinkingEffortOptionById = (id) =>
    THINKING_EFFORT_BY_ID[normalizeThinkingEffortId(id)] || null;
  const getThinkingEffortOptionByIconToken = (iconToken) =>
    THINKING_EFFORT_OPTIONS.find(
      (option) => option.iconToken === normalizeThinkingEffortIconToken(iconToken),
    ) || null;
  const getThinkingShortcutByStorageKey = (storageKey) =>
    THINKING_EFFORT_BY_STORAGE_KEY[String(storageKey || '').trim()] || null;
  const getProThinkingShortcutByStorageKey = (storageKey) =>
    PRO_THINKING_EFFORT_BY_STORAGE_KEY[String(storageKey || '').trim()] || null;
  const sortThinkingEffortIds = (ids) => {
    const uniqueIds = new Set(
      (Array.isArray(ids) ? ids : []).map((id) => normalizeThinkingEffortId(id)).filter(Boolean),
    );
    return THINKING_EFFORT_OPTIONS.map((option) => option.id).filter((id) => uniqueIds.has(id));
  };
  const getAvailableThinkingEffortIds = (catalog) =>
    sortThinkingEffortIds(
      Array.isArray(catalog?.thinkingEffortIds) ? catalog.thinkingEffortIds : [],
    );
  const hasThinkingEffortOption = (catalog, id) =>
    getAvailableThinkingEffortIds(catalog).includes(normalizeThinkingEffortId(id));
  const hasFrontendAction = (catalog, actionId) => {
    const targetId = String(actionId || '').trim();
    if (!targetId || !catalog || typeof catalog !== 'object') return false;
    const frontendByConfig =
      catalog.frontendByConfig && typeof catalog.frontendByConfig === 'object'
        ? catalog.frontendByConfig
        : {};
    return Object.values(frontendByConfig).some((rows) =>
      (Array.isArray(rows) ? rows : []).some(
        (row) => String(row?.id || '').trim() === targetId && row?.available === true,
      ),
    );
  };
  const hasProFrontendOption = (catalog) => hasFrontendAction(catalog, 'pro');

  const inferActiveConfigFromMenuState = ({ header = '', items = [] } = {}) => {
    const headerText = normalizeMenuText(header);
    const rows = (Array.isArray(items) ? items : []).map((item) => ({
      testId: normTid(item?.testId || item?.dataTestId || item?.tid || ''),
      text: normalizeMenuText(item?.text || item?.label || item?.name || ''),
    }));

    if (
      headerText.includes('5.2') ||
      rows.some(
        (row) =>
          row.testId === 'model-switcher-gpt-5-2-instant' ||
          row.testId === 'model-switcher-gpt-5-2-thinking',
      )
    ) {
      return 'configure-5-2';
    }

    if (
      headerText.includes('5.0') ||
      rows.some(
        (row) =>
          row.testId === 'model-switcher-gpt-5-t-mini' ||
          row.text === 'thinking mini' ||
          row.text === 'gpt-5 mini',
      )
    ) {
      return 'configure-5-0-thinking-mini';
    }

    if (
      rows.some(
        (row) =>
          row.testId === 'model-switcher-o3' ||
          row.testId === 'model-switcher-gpt-5-o3' ||
          row.text === 'o3',
      )
    ) {
      return 'configure-o3';
    }

    return DEFAULT_ACTIVE_CONFIG_ID;
  };

  const resolvePrimaryDisplayLabel = (action, incomingNames) => {
    const names = Array.isArray(incomingNames) ? incomingNames : [];
    const alias = PRIMARY_ALIAS_BY_ID[action?.id] || null;
    const slot = Number(action?.slot);
    const fromStorage =
      Number.isInteger(slot) && slot >= 0 && slot < names.length
        ? normalizeStoredActionName(slot, names[slot])
        : '';

    if (alias?.label) return alias.label;
    if (fromStorage && !isLegacyArrow(fromStorage)) return fromStorage;
    return action?.label || '';
  };

  const resolveModelNameDisplayLabel = (action, incomingNames) => {
    const names = Array.isArray(incomingNames) ? incomingNames : [];
    const slot = Number(action?.slot);
    const fromStorage =
      Number.isInteger(slot) && slot >= 0 && slot < names.length
        ? normalizeStoredActionName(slot, names[slot])
        : '';
    if (fromStorage && !isLegacyArrow(fromStorage)) return fromStorage;
    return action?.label || '';
  };
  const normalizeFrontendCatalogEntry = (entry, activeConfigId, incomingNames, catalog) => {
    const names = Array.isArray(incomingNames) ? incomingNames : [];
    const base = getCatalogActionById(entry?.id, catalog, incomingNames);
    if (!base) return null;
    const entrySlot = toValidSlot(entry?.slot);
    const slot = entrySlot >= 0 ? entrySlot : Number(base.slot);
    const fallbackName =
      Number.isInteger(slot) && slot >= 0 && slot < names.length
        ? normalizeStoredActionName(slot, names[slot])
        : '';
    const label = (entry?.label || fallbackName || base.label || '').toString().trim();
    if (!label) return null;
    return {
      ...base,
      label,
      viewGroup: 'primary',
      viewKey: `popup-primary:${normalizeActiveConfigId(activeConfigId)}:${base.id}`,
      labelI18nKey: '',
    };
  };

  const getPrimaryPresentationActions = (activeConfigId, incomingNames) =>
    getPrimaryActionIdsForActiveConfig(activeConfigId)
      .map((actionId, index) => {
        const base = getActionById(actionId);
        if (!base) return null;
        const alias = PRIMARY_ALIAS_BY_ID[base.id] || null;
        return {
          ...base,
          mainIndex: index,
          label: resolvePrimaryDisplayLabel(base, incomingNames),
          labelI18nKey: alias?.labelI18nKey || '',
          viewGroup: 'primary',
          viewKey: `primary:${base.id}`,
        };
      })
      .filter(Boolean);

  const getPresentationGroups = (activeConfigId, incomingNames) => {
    const normalizedActiveConfigId = normalizeActiveConfigId(activeConfigId);
    const primaryActions = getPrimaryPresentationActions(normalizedActiveConfigId, incomingNames);
    const modelNameActions = MODEL_NAME_ACTIONS.map((action) => ({
      ...action,
      label: resolveModelNameDisplayLabel(action, incomingNames),
      viewGroup: 'configure',
      viewKey: `configure:${action.id}`,
      active: action.id === normalizedActiveConfigId,
      labelI18nKey: '',
    }));

    return [
      {
        id: 'primary',
        label: '',
        labelI18nKey: '',
        compactLabel: false,
        actions: primaryActions,
      },
      {
        id: 'configure',
        label: 'Pick Model',
        labelI18nKey: 'label_configureModelsCompact',
        compactLabel: true,
        actions: modelNameActions,
      },
    ];
  };
  const getPopupPrimaryActions = (activeConfigId, incomingNames, catalog) => {
    const normalizedActiveConfigId = normalizeActiveConfigId(activeConfigId);
    const frontendByConfig =
      catalog &&
      typeof catalog === 'object' &&
      catalog.frontendByConfig &&
      typeof catalog.frontendByConfig === 'object'
        ? catalog.frontendByConfig
        : null;
    const catalogEntries = Array.isArray(frontendByConfig?.[normalizedActiveConfigId])
      ? frontendByConfig[normalizedActiveConfigId]
      : [];

    const fromCatalog = catalogEntries
      .map((entry) =>
        normalizeFrontendCatalogEntry(entry, normalizedActiveConfigId, incomingNames, catalog),
      )
      .filter(Boolean);
    if (fromCatalog.length) {
      const shouldAppendConfigure = catalog?.integratedEffort !== true;
      const configureAction = shouldAppendConfigure ? getActionById('configure') : null;
      if (configureAction && !fromCatalog.some((action) => action.id === configureAction.id)) {
        fromCatalog.push({
          ...configureAction,
          label: configureAction.label,
          viewGroup: 'primary',
          viewKey: `popup-primary:${normalizedActiveConfigId}:configure`,
          labelI18nKey: '',
        });
      }
      return fromCatalog;
    }

    if (catalog?.integratedEffort === true) {
      const fallbackIds =
        normalizedActiveConfigId === DEFAULT_ACTIVE_CONFIG_ID
          ? ['instant', 'thinking', 'pro']
          : getPopupPrimaryFallbackIdsForActiveConfig(normalizedActiveConfigId).filter(
              (actionId) => actionId !== 'configure',
            );
      return fallbackIds
        .map((actionId) => {
          const base = getActionById(actionId);
          if (!base) return null;
          return {
            ...base,
            label: base.id === 'thinking' ? 'Medium' : base.id === 'pro' ? 'High' : base.label,
            labelI18nKey: '',
            viewGroup: 'primary',
            viewKey: `popup-primary:${normalizedActiveConfigId}:${base.id}`,
          };
        })
        .filter(Boolean);
    }

    return getPopupPrimaryFallbackIdsForActiveConfig(normalizedActiveConfigId)
      .map((actionId) => {
        const base = getActionById(actionId);
        if (!base) return null;
        const alias = PRIMARY_ALIAS_BY_ID[base.id] || null;
        return {
          ...base,
          label:
            base.id === 'configure' ? base.label : resolvePrimaryDisplayLabel(base, incomingNames),
          labelI18nKey: alias?.labelI18nKey || '',
          viewGroup: 'primary',
          viewKey: `popup-primary:${normalizedActiveConfigId}:${base.id}`,
        };
      })
      .filter(Boolean);
  };
  const getPopupPresentationGroups = (activeConfigId, incomingNames, catalog) => {
    const effectiveCatalog =
      catalog && typeof catalog === 'object' ? catalog : DEFAULT_INTEGRATED_MODEL_CATALOG;
    const normalizedActiveConfigId = resolveCatalogActiveConfigId(activeConfigId, effectiveCatalog);
    const primaryActions = getPopupPrimaryActions(
      normalizedActiveConfigId,
      incomingNames,
      effectiveCatalog,
    );
    const modelNameActions = getModelNamePresentationActions(
      normalizedActiveConfigId,
      incomingNames,
      effectiveCatalog,
    );

    return [
      {
        id: 'primary',
        label: '',
        labelI18nKey: '',
        compactLabel: false,
        actions: primaryActions,
      },
      {
        id: 'configure',
        label: 'Pick Model',
        labelI18nKey: 'label_configureModelsCompact',
        compactLabel: true,
        actions: modelNameActions,
      },
    ];
  };
  const mapFrontendLabelToActionId = (label, activeConfigId = DEFAULT_ACTIVE_CONFIG_ID) => {
    const text = normalizeMenuText(label);
    if (!text) return '';
    if (text === 'instant') return 'instant';
    if (text === 'thinking' || text === 'medium') return 'thinking';
    if (text === 'high') return 'pro';
    if (text === 'pro')
      return normalizeActiveConfigId(activeConfigId) === 'configure-latest' ? 'pro' : '';
    if (text === 'thinking mini' || text === 'gpt-5 mini') return 'configure-5-0-thinking-mini';
    if (text === 'o3') return 'configure-o3';
    return '';
  };

  const getCanonicalActionLabel = (actionId, observedLabel = '') => {
    const action = getActionById(actionId);
    const fallback = (observedLabel ?? '').toString().trim();
    if (!action) return fallback;
    if (action.id === 'thinking')
      return fallback && !/^thinking$/i.test(fallback) ? fallback : 'Medium';
    if (action.id === 'pro') return fallback && !/^pro$/i.test(fallback) ? fallback : 'High';
    if (action.id === 'configure' && /^configure\b/i.test(fallback)) return '';
    if (action.id === 'configure-latest')
      return fallback && !/^latest$/i.test(fallback) ? fallback : '5.5';
    if (action.id === 'configure-5-0-thinking-mini') return '5.0 Thinking Mini';
    return String(action.label || fallback || '').trim();
  };

  const normalizeStoredActionName = (slot, value) => {
    const text = (value ?? '').toString().trim();
    if (!text) return '';
    const action = getActionBySlot(slot);
    if (
      (action?.id === 'configure-5-2' && /^5\.2$/i.test(text)) ||
      (action?.id === 'configure-5-0-thinking-mini' && /^5\.0\b/i.test(text))
    ) {
      return '';
    }
    if (action?.id) return getCanonicalActionLabel(action.id, text);
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
    const out = defaultNames();
    const inArr = Array.isArray(incoming) ? incoming.slice(0, MAX_SLOTS) : [];
    for (let i = 0; i < MAX_SLOTS; i++) {
      const value = normalizeStoredActionName(i, inArr[i]);
      if (value && !isLegacyArrow(value)) out[i] = value;
    }
    return out.slice(0, MAX_SLOTS);
  };

  // Current scraped defaults for initial UI before a live refresh completes.
  const defaultNames = () => {
    const arr = DEFAULT_INTEGRATED_MODEL_NAMES.slice(0, MAX_SLOTS);
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

  const getActionGroups = () =>
    ACTION_GROUPS.map((group) => ({ ...group, actions: group.actions.slice() }));
  const getActionSlots = () => ACTION_SLOTS.slice();
  const getActionBySlot = (slot) =>
    Number.isInteger(slot) && slot >= 0 && slot < ACTION_SLOTS.length ? ACTION_SLOTS[slot] : null;

  window.ModelLabels = Object.freeze({
    MAX_SLOTS,
    ACTION_SLOT_COUNT,
    DEFAULT_ACTIVE_CONFIG_ID,
    TESTID_CANON,
    MAIN_CANON_BY_INDEX,
    normTid,
    canonFromTid,
    isSubmenuTrigger,
    textNoHint,
    mapSubmenuLabel,
    normalizeActiveConfigId,
    inferActiveConfigFromMenuState,
    getActionGroups,
    getActionSlots,
    getActionBySlot,
    getActionById,
    getCatalogActionById,
    getModelNameActionForLabel,
    getModelNameActionForLabelInList,
    getLatestModelNameIndex,
    getCatalogModelNameActionForLabel,
    getCatalogModelNameActions,
    getModelNamePresentationActions,
    getConfigureActionForOption,
    getConfigureActionForOptionInList,
    getLatestConfigureOptionIndex,
    getCatalogConfigureActionForOption,
    getPrimaryActionIdsForActiveConfig,
    getPrimaryPresentationActions,
    getPresentationGroups,
    getPopupPrimaryActions,
    getPopupPresentationGroups,
    buildDefaultKeyCodesFromPresentationGroups,
    mapFrontendLabelToActionId,
    normalizeThinkingEffortId,
    normalizeThinkingEffortIconToken,
    mapThinkingEffortLabelToId,
    getThinkingEffortOptionById,
    getThinkingEffortOptionByIconToken,
    getThinkingShortcutByStorageKey,
    getProThinkingShortcutByStorageKey,
    sortThinkingEffortIds,
    getAvailableThinkingEffortIds,
    hasThinkingEffortOption,
    hasFrontendAction,
    hasProFrontendOption,
    getCanonicalActionLabel,
    defaultKeyCodes,
    normalizeStoredActionName,
    resolveActionableNames,
    defaultNames,
    prettifyForPopup,
  });
})();
