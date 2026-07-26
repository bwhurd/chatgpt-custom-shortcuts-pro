const MODEL_PICKER_MAX_SLOTS = window.ModelLabels?.MAX_SLOTS || 15;
const FALLBACK_MODEL_ACTION_GROUPS = [
  {
    id: 'primary',
    label: '',
    labelI18nKey: '',
    compactLabel: false,
    actions: [
      { slot: 0, id: 'instant', group: 'primary', label: 'Light', actionKind: 'pill-effort', mainIndex: 0 },
      { slot: 1, id: 'thinking', group: 'primary', label: 'Medium', actionKind: 'pill-effort', mainIndex: 1 },
      {
        slot: 7,
        id: 'pro',
        group: 'primary-extra',
        label: 'High',
        actionKind: 'pill-effort',
        requiredConfigId: 'configure-latest',
        mainIndex: 2,
      },
      { slot: 11, id: 'effort-extra-high', group: 'primary-extra', label: 'Extra High', actionKind: 'pill-effort', mainIndex: 3 },
      { slot: 12, id: 'effort-max', group: 'primary-extra', label: 'Max', actionKind: 'pill-effort', mainIndex: 4 },
    ],
  },
  {
    id: 'configure',
    label: 'Pick Model',
    labelI18nKey: 'label_configureModelsCompact',
    compactLabel: true,
    actions: [
      { slot: 3, id: 'configure-latest', group: 'configure', label: 'GPT-5.6 Sol', actionKind: 'configure-option', optionKind: 'first' },
      { slot: 8, id: 'configure-dynamic-gpt-5-6-terra', group: 'configure', label: 'GPT-5.6 Terra', actionKind: 'configure-option', optionKind: 'value', optionValue: 'GPT-5.6 Terra' },
      {
        slot: 9,
        id: 'configure-dynamic-gpt-5-6-luna',
        group: 'configure',
        label: 'GPT-5.6 Luna',
        actionKind: 'configure-option',
        optionKind: 'value',
        optionValue: 'GPT-5.6 Luna',
      },
      { slot: 10, id: 'configure-dynamic-gpt-5-5', group: 'configure', label: 'GPT-5.5', actionKind: 'configure-option', optionKind: 'value', optionValue: 'GPT-5.5' },
    ],
  },
  {
    id: 'model-toggles',
    label: 'Model Toggles',
    labelI18nKey: 'label_modelTogglesCompact',
    compactLabel: true,
    actions: [
      {
        id: 'toggle-chat-work',
        group: 'shortcut-setting',
        label: 'Toggle Chat / Work',
        labelI18nKey: 'label_toggleChatWork',
        actionKind: 'shortcut-setting',
        storageKey: 'shortcutKeyToggleChatWork',
      },
      { slot: 13, id: 'toggle-speed', group: 'pill-utility', label: 'Toggle Speed', actionKind: 'pill-speed-toggle' },
      { slot: 14, id: 'reset-default', group: 'pill-utility', label: 'Reset to default', actionKind: 'pill-reset' },
    ],
  },
];
const cloneModelActionGroups = (groups) =>
  (Array.isArray(groups) ? groups : []).map((group) => ({
    ...group,
    actions: Array.isArray(group?.actions) ? group.actions.map((action) => ({ ...action })) : [],
  }));
const getModelActionSlots = () =>
  typeof window.ModelLabels?.getActionSlots === 'function'
    ? window.ModelLabels.getActionSlots()
    : cloneModelActionGroups(FALLBACK_MODEL_ACTION_GROUPS).flatMap((group) => group.actions);
const resolveModelActionableNames = (incoming) =>
  typeof window.ModelLabels?.resolveActionableNames === 'function'
    ? window.ModelLabels.resolveActionableNames(incoming)
    : [
        'Light',
        'Medium',
        '',
        'GPT-5.6 Sol',
        '',
        '',
        '',
        'High',
        'GPT-5.6 Terra',
        'GPT-5.6 Luna',
        'GPT-5.5',
        'Extra High',
        'Max',
        'Toggle Speed',
        'Reset to default',
      ];
const FALLBACK_LEGACY_MODEL_NAMES = [
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
  '',
  '',
  '',
  '',
  '',
];
const MODEL_CATALOG_PROFILE_LATEST = 'latest';
const MODEL_CATALOG_PROFILE_LEGACY = 'legacy';
const MODEL_CATALOG_SELECTED_PROFILE_STORAGE_KEY = 'modelCatalogSelectedProfile';
const MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE = Object.freeze({
  [MODEL_CATALOG_PROFILE_LATEST]: 'modelPickerKeyCodesLatest',
  [MODEL_CATALOG_PROFILE_LEGACY]: 'modelPickerKeyCodesLegacy',
});
const MODEL_PICKER_KEY_CODE_PROFILES_VERSION_KEY = 'modelPickerKeyCodeProfilesVersion';
const MODEL_PICKER_KEY_CODE_PROFILES_VERSION = 1;
const normalizeModelCatalogProfile = (profile) =>
  profile === MODEL_CATALOG_PROFILE_LATEST
    ? MODEL_CATALOG_PROFILE_LATEST
    : MODEL_CATALOG_PROFILE_LEGACY;
const getModelCatalogProfileForCatalog = (catalog) => {
  if (!catalog || typeof catalog !== 'object') return '';
  return catalog.pillMenu === true || catalog.selectorShape === 'pill-three-submenu'
    ? MODEL_CATALOG_PROFILE_LATEST
    : MODEL_CATALOG_PROFILE_LEGACY;
};
const DEFAULT_ACTIVE_MODEL_CONFIG_ID =
  typeof window.ModelLabels?.DEFAULT_ACTIVE_CONFIG_ID === 'string'
    ? window.ModelLabels.DEFAULT_ACTIVE_CONFIG_ID
    : 'configure-latest';
const normalizeActiveModelConfigId = (value) =>
  typeof window.ModelLabels?.normalizeActiveConfigId === 'function'
    ? window.ModelLabels.normalizeActiveConfigId(value)
    : (/^configure-dynamic-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || '').trim()) ||
        ['configure-latest', 'configure-5-2', 'configure-5-0-thinking-mini', 'configure-o3'].includes(
          String(value || '').trim(),
        ))
      ? String(value || '').trim()
      : DEFAULT_ACTIVE_MODEL_CONFIG_ID;
const getModelPresentationGroups = (activeConfigId, incomingNames) =>
  typeof window.ModelLabels?.getPresentationGroups === 'function'
    ? window.ModelLabels.getPresentationGroups(activeConfigId, incomingNames)
    : cloneModelActionGroups(FALLBACK_MODEL_ACTION_GROUPS);
const getPopupModelPresentationGroups = (activeConfigId, incomingNames, catalog) =>
  typeof window.ModelLabels?.getPopupPresentationGroups === 'function'
    ? window.ModelLabels.getPopupPresentationGroups(activeConfigId, incomingNames, catalog)
    : getModelPresentationGroups(activeConfigId, incomingNames);
const buildDefaultModelPickerCodes = ({
  profile = MODEL_CATALOG_PROFILE_LATEST,
  useCurrentCatalog = false,
  catalog,
  activeConfigId = DEFAULT_ACTIVE_MODEL_CONFIG_ID,
  incomingNames,
} = {}) => {
  const normalizedProfile = normalizeModelCatalogProfile(profile);
  const profileCatalog =
    window.__modelCatalogProfiles?.[normalizedProfile] ||
    getDefaultModelCatalogForProfile(normalizedProfile);
  const profileNames =
    window.__modelNamesProfiles?.[normalizedProfile] ||
    getDefaultModelNamesForProfile(normalizedProfile);
  if (
    (useCurrentCatalog || catalog !== undefined) &&
    typeof window.ModelLabels?.buildDefaultKeyCodesFromPresentationGroups === 'function'
  ) {
    const normalizedActiveConfigId = normalizeActiveModelConfigId(activeConfigId);
    const groups = getPopupModelPresentationGroups(
      normalizedActiveConfigId,
      Array.isArray(incomingNames) ? incomingNames : profileNames,
      catalog === undefined ? profileCatalog : catalog,
    );
    const next = window.ModelLabels.buildDefaultKeyCodesFromPresentationGroups(groups);
    if (Array.isArray(next) && next.length) {
      const out = next.slice(0, MODEL_PICKER_MAX_SLOTS);
      while (out.length < MODEL_PICKER_MAX_SLOTS) out.push('');
      return out;
    }
  }

  if (typeof window.ModelLabels?.defaultKeyCodesForProfile === 'function') {
    const out = window.ModelLabels
      .defaultKeyCodesForProfile(normalizedProfile)
      .slice(0, MODEL_PICKER_MAX_SLOTS);
    while (out.length < MODEL_PICKER_MAX_SLOTS) out.push('');
    return out;
  }

  const out = new Array(MODEL_PICKER_MAX_SLOTS).fill('');
  out[0] = 'F1';
  out[1] = 'F2';
  out[3] = 'Digit1';
  if (normalizedProfile === MODEL_CATALOG_PROFILE_LEGACY) out[6] = 'Digit4';
  out[7] = 'F3';
  out[8] = 'Digit2';
  out[9] = 'Digit3';
  if (normalizedProfile === MODEL_CATALOG_PROFILE_LATEST) {
    out[10] = 'Digit4';
    out[11] = 'F4';
    out[12] = 'F5';
    out[13] = 'Digit6';
    out[14] = 'Digit0';
  }
  return out;
};
const MODEL_CATALOG_SCRAPE_STATE_KEYS = new Set([
  'modelCatalog',
  'modelCatalogLatest',
  'modelCatalogLegacy',
  'modelNames',
  'modelNamesAt',
  'modelNamesLatest',
  'modelNamesLatestAt',
  'modelNamesLegacy',
  'modelNamesLegacyAt',
]);
const AUTO_MANAGED_SYNC_KEYS = new Set([
  'activeModelConfigId',
  ...MODEL_CATALOG_SCRAPE_STATE_KEYS,
  'modelCatalogRefreshPromptDay',
  'modelCatalogRefreshPromptWeek',
  MODEL_PICKER_KEY_CODE_PROFILES_VERSION_KEY,
]);
const MODEL_CONFIG_VISUAL_SETTLE_MS = 1100;
const MODEL_SCRAPE_OVERLAY_TRANSITION_MS = 180;
const MODEL_SCRAPE_OVERLAY_TRANSITION_FALLBACK_MS = MODEL_SCRAPE_OVERLAY_TRANSITION_MS + 180;
const MODEL_SCRAPE_OVERLAY_MIN_VISIBLE_MS = 1500;
const MODEL_CATALOG_REFRESH_PROMPT_WEEK_KEY = 'modelCatalogRefreshPromptWeek';
const POPUP_SOURCE_TAB_ID = Number(new URLSearchParams(window.location.search).get('sourceTabId') || 0) || 0;
const isExternalActiveConfigSource = (source = '') =>
  source === 'bootstrap' || source === 'storage:onChanged' || source === 'cloud-restore';
const getPendingModelConfigTargetId = () => {
  const raw = String(window.__pendingModelConfigTargetId || '').trim();
  return raw ? normalizeActiveModelConfigId(raw) : '';
};
const getVisualActiveModelConfigId = () =>
  normalizeActiveModelConfigId(getPendingModelConfigTargetId() || window.__activeModelConfigId);
const setActiveModelConfigIdCache = (value, source = 'storage') => {
  const next = normalizeActiveModelConfigId(value);
  const pending = getPendingModelConfigTargetId();
  if (pending && isExternalActiveConfigSource(source) && next !== pending) {
    return getVisualActiveModelConfigId();
  }
  if (window.__activeModelConfigId === next) return next;
  window.__activeModelConfigId = next;
  document.dispatchEvent(
    new CustomEvent('modelPickerActiveConfigChanged', { detail: { activeModelConfigId: next, source } }),
  );
  return next;
};
const normalizeModelPickerCodesForComparison = (codes) => {
  const out = Array.isArray(codes) ? codes.slice(0, MODEL_PICKER_MAX_SLOTS) : [];
  while (out.length < MODEL_PICKER_MAX_SLOTS) out.push('');
  return out;
};
const hasDefaultModelPickerCodes = (codes) => {
  const normalized = normalizeModelPickerCodesForComparison(codes);
  const defaults = normalizeModelPickerCodesForComparison(
    buildDefaultModelPickerCodes({ profile: MODEL_CATALOG_PROFILE_LATEST }),
  );
  return normalized.every((value, index) => value === defaults[index]);
};
const isPristineUserSettingsSnapshot = (snapshot) =>
  !Object.keys(snapshot || {}).some(
    (key) =>
      snapshot?.[key] !== undefined &&
      !AUTO_MANAGED_SYNC_KEYS.has(key) &&
      !(key === 'modelPickerKeyCodes' && hasDefaultModelPickerCodes(snapshot[key])),
  );
const isChatGptUrl = (url) => /^https?:\/\/([^.]+\.)?chatgpt\.com\//i.test(String(url || ''));
const queryTabsAsync = (queryInfo) =>
  new Promise((resolve) => {
    try {
      chrome.tabs.query(queryInfo, (tabs) => {
        resolve(Array.isArray(tabs) ? tabs : []);
      });
    } catch {
      resolve([]);
    }
  });
const pickBestChatGptTab = (tabs) => {
  const list = Array.isArray(tabs) ? tabs.filter((tab) => tab?.id) : [];
  if (!list.length) return null;
  const explicitMatch = list.find((tab) => isChatGptUrl(tab.url));
  if (explicitMatch) return explicitMatch;
  return list[0] || null;
};
const queryCurrentChatGptTab = async () => {
  const activeCurrentWindow = pickBestChatGptTab(
    await queryTabsAsync({ active: true, currentWindow: true }),
  );
  if (activeCurrentWindow) return activeCurrentWindow;

  return pickBestChatGptTab(await queryTabsAsync({ active: true, lastFocusedWindow: true }));
};
const sendModelMessageToTab = async (message) => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const markDeliveredResponse = (response) =>
    response && typeof response === 'object'
      ? { ...response, fromChatGptTab: true }
      : { ok: false, error: 'EMPTY_RESPONSE', fromChatGptTab: true };
  const trySendToTab = async (tabId) => {
    if (!tabId) return { ok: false, error: 'NO_CHATGPT_TAB' };
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return markDeliveredResponse(response);
    } catch (error) {
      if (/Receiving end does not exist/i.test(String(error?.message || ''))) {
        try {
          await wait(250);
          const retry = await chrome.tabs.sendMessage(tabId, message);
          return markDeliveredResponse(retry);
        } catch (retryError) {
          return { ok: false, error: retryError?.message || error?.message || 'SEND_FAILED' };
        }
      }
      return { ok: false, error: error?.message || 'SEND_FAILED' };
    }
  };

  if (!POPUP_SOURCE_TAB_ID) {
    const tab = await queryCurrentChatGptTab();
    const direct = await trySendToTab(tab?.id || 0);
    if (direct?.fromChatGptTab) return direct;
  }
  if (POPUP_SOURCE_TAB_ID > 0) {
    const direct = await trySendToTab(POPUP_SOURCE_TAB_ID);
    if (direct?.fromChatGptTab) return direct;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'csp.relayToChatGptTab',
      targetTabId: POPUP_SOURCE_TAB_ID,
      payload: message,
    });
    return response && typeof response === 'object' ? response : { ok: false };
  } catch (error) {
    return { ok: false, error: error?.message || 'SEND_FAILED' };
  }
};
const getDynamicModelNameSlotStart = () => {
  const sharedStart = Number(window.ModelLabels?.MODEL_NAME_DYNAMIC_SLOT_START);
  if (Number.isInteger(sharedStart) && sharedStart >= 0) return sharedStart;
  const slots = getModelActionSlots()
    .map((action) => Number(action?.slot))
    .filter((slot) => Number.isInteger(slot) && slot >= 0 && slot < MODEL_PICKER_MAX_SLOTS);
  return Math.min(MODEL_PICKER_MAX_SLOTS, Math.max(-1, ...slots) + 1);
};
const toValidModelPickerSlot = (value) => {
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 0 && slot < MODEL_PICKER_MAX_SLOTS ? slot : -1;
};
const isDynamicModelNameActionId = (value) =>
  /^configure-dynamic-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || '').trim());
const normalizeModelCatalog = (catalog) => {
  if (!catalog || typeof catalog !== 'object') return null;
  const frontendByConfig = {};
  const speedByConfig = {};
  const thinkingEffortIds =
    typeof window.ModelLabels?.sortThinkingEffortIds === 'function'
      ? window.ModelLabels.sortThinkingEffortIds(catalog.thinkingEffortIds)
      : [];
  const rawFrontend = catalog.frontendByConfig && typeof catalog.frontendByConfig === 'object'
    ? catalog.frontendByConfig
    : {};
  Object.keys(rawFrontend).forEach((configId) => {
    const normalizedConfigId = normalizeActiveModelConfigId(configId);
    const rows = Array.isArray(rawFrontend[configId]) ? rawFrontend[configId] : [];
    frontendByConfig[normalizedConfigId] = rows
      .map((row) => {
        const storedActionId = String(row?.id || '').trim();
        const baseFromStoredId =
          storedActionId && typeof window.ModelLabels?.getCatalogActionById === 'function'
            ? window.ModelLabels.getCatalogActionById(storedActionId, catalog, [])
            : storedActionId && typeof window.ModelLabels?.getActionById === 'function'
              ? window.ModelLabels.getActionById(storedActionId)
              : null;
        const actionId =
          baseFromStoredId?.id ||
          (typeof window.ModelLabels?.mapFrontendLabelToActionId === 'function'
            ? window.ModelLabels.mapFrontendLabelToActionId(row?.label || '', normalizedConfigId)
            : '');
        if (!actionId) return null;
        if (actionId === 'pro' && row?.available !== true) return null;
        const base =
          typeof window.ModelLabels?.getCatalogActionById === 'function'
            ? window.ModelLabels.getCatalogActionById(actionId, catalog, [])
            : typeof window.ModelLabels?.getActionById === 'function'
              ? window.ModelLabels.getActionById(actionId)
            : null;
        if (!base) return null;
        return {
          id: actionId,
          slot: base.slot,
          available: row?.available === true,
          label: String(row?.label || base.label || '').trim(),
          selected: row?.selected === true,
        };
      })
      .filter(Boolean);
  });
  const rawSpeed =
    catalog.speedByConfig && typeof catalog.speedByConfig === 'object'
      ? catalog.speedByConfig
      : {};
  Object.keys(rawSpeed).forEach((configId) => {
    const normalizedConfigId = normalizeActiveModelConfigId(configId);
    const rows = Array.isArray(rawSpeed[configId]) ? rawSpeed[configId] : [];
    speedByConfig[normalizedConfigId] = rows
      .map((row) => {
        const label = String(row?.label || '').trim();
        const id =
          typeof window.ModelLabels?.mapSpeedLabelToId === 'function'
            ? window.ModelLabels.mapSpeedLabelToId(row?.id || label)
            : String(row?.id || '').trim();
        if (!id || !label) return null;
        return {
          id,
          label,
          available: row?.available === true,
          selected: row?.selected === true,
        };
      })
      .filter(Boolean);
  });
  const usedModelNameSlots = new Set();
  let nextDynamicModelNameSlot = getDynamicModelNameSlotStart();
  const sharedDynamicEnd = Number(window.ModelLabels?.MODEL_NAME_DYNAMIC_SLOT_END);
  const dynamicModelNameSlotEnd =
    Number.isInteger(sharedDynamicEnd) && sharedDynamicEnd >= nextDynamicModelNameSlot
      ? sharedDynamicEnd
      : MODEL_PICKER_MAX_SLOTS - 1;
  const takeModelNameSlot = (action, option) => {
    const actionId = String(action?.id || option?.id || '').trim();
    const isDynamic = isDynamicModelNameActionId(actionId);
    let slot = toValidModelPickerSlot(option?.slot);
    if (slot < 0) slot = toValidModelPickerSlot(action?.slot);
    if (isDynamic && slot < nextDynamicModelNameSlot) slot = -1;
    if (slot >= 0 && !usedModelNameSlots.has(slot)) {
      usedModelNameSlots.add(slot);
      return slot;
    }
    if (!isDynamic) return -1;
    while (
      nextDynamicModelNameSlot <= dynamicModelNameSlotEnd &&
      usedModelNameSlots.has(nextDynamicModelNameSlot)
    ) {
      nextDynamicModelNameSlot += 1;
    }
    if (nextDynamicModelNameSlot > dynamicModelNameSlotEnd) return -1;
    slot = nextDynamicModelNameSlot;
    usedModelNameSlots.add(slot);
    nextDynamicModelNameSlot += 1;
    return slot;
  };

  return {
    version: Number(catalog.version) || 1,
    scrapedAt: Number(catalog.scrapedAt) || 0,
    selectorShape: String(catalog.selectorShape || '').trim(),
    pillMenu: catalog.pillMenu === true,
    integratedEffort: catalog.integratedEffort === true,
    configureOptions: Array.isArray(catalog.configureOptions)
      ? catalog.configureOptions
          .map((option, optionIndex) => {
            const action =
              typeof window.ModelLabels?.getModelNameActionForLabel === 'function'
                ? window.ModelLabels.getModelNameActionForLabel(
                    option?.label || '',
                    optionIndex,
                    option?.slot,
                  )
                : null;
            const id = action?.id || normalizeActiveModelConfigId(option?.id);
            const slot = takeModelNameSlot(action, option);
            return {
              id,
              label: String(option?.label || action?.label || '').trim(),
              slot,
            };
          })
          .filter((option) => option.slot >= 0)
      : [],
    thinkingEffortIds,
    frontendByConfig,
    speedByConfig,
  };
};
const getDefaultModelCatalogForProfile = (profile) =>
  profile === MODEL_CATALOG_PROFILE_LEGACY &&
  typeof window.ModelLabels?.getDefaultLegacyCatalog === 'function'
    ? window.ModelLabels.getDefaultLegacyCatalog()
    : null;
const getDefaultModelNamesForProfile = (profile) => {
  const source =
    profile === MODEL_CATALOG_PROFILE_LEGACY
      ? typeof window.ModelLabels?.defaultLegacyNames === 'function'
        ? window.ModelLabels.defaultLegacyNames()
        : FALLBACK_LEGACY_MODEL_NAMES
      : typeof window.ModelLabels?.defaultNames === 'function'
        ? window.ModelLabels.defaultNames()
        : resolveModelActionableNames([]);
  const out = Array.isArray(source) ? source.slice(0, MODEL_PICKER_MAX_SLOTS) : [];
  while (out.length < MODEL_PICKER_MAX_SLOTS) out.push('');
  return out;
};
const normalizeModelNamesForProfile = (incoming, profile) => {
  if (!Array.isArray(incoming)) return getDefaultModelNamesForProfile(profile);
  const out = incoming.slice(0, MODEL_PICKER_MAX_SLOTS).map((value) =>
    typeof value === 'string' ? value : '',
  );
  while (out.length < MODEL_PICKER_MAX_SLOTS) out.push('');
  return out;
};
const getSelectedModelCatalogProfile = () =>
  window.__modelCatalogProfile === MODEL_CATALOG_PROFILE_LATEST
    ? MODEL_CATALOG_PROFILE_LATEST
    : MODEL_CATALOG_PROFILE_LEGACY;
const syncModelCatalogProfileSelector = () => {
  const selected = getSelectedModelCatalogProfile();
  document.querySelectorAll('[data-model-catalog-profile]').forEach((button) => {
    const active = button.getAttribute('data-model-catalog-profile') === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.setAttribute('tabindex', active ? '0' : '-1');
  });
};
const applySelectedModelCatalogProfile = (source = 'popup') => {
  const profile = getSelectedModelCatalogProfile();
  const profileCodes = window.__modelPickerKeyCodesProfiles?.[profile];
  if (Array.isArray(profileCodes)) window.__modelPickerKeyCodes = profileCodes;
  window.__modelCatalog =
    window.__modelCatalogProfiles?.[profile] || getDefaultModelCatalogForProfile(profile);
  window.MODEL_NAMES = normalizeModelNamesForProfile(
    window.__modelNamesProfiles?.[profile],
    profile,
  );
  window.MODEL_NAMES_META = { arrowIndex: -1, rawCount: window.MODEL_NAMES.length };
  syncModelCatalogProfileSelector();
  window.dispatchEvent(
    new CustomEvent('model-catalog-updated', {
      detail: { source, profile, catalog: window.__modelCatalog },
    }),
  );
  window.dispatchEvent(new CustomEvent('model-names-updated', { detail: { source, profile } }));
  window.dispatchEvent(
    new CustomEvent('model-catalog-profile-changed', { detail: { source, profile } }),
  );
  return profile;
};
const selectModelCatalogProfile = (profile, source = 'popup') => {
  const next = normalizeModelCatalogProfile(profile);
  if (source === 'popup:profile') {
    try {
      chrome.storage.sync.set({ [MODEL_CATALOG_SELECTED_PROFILE_STORAGE_KEY]: next });
    } catch {}
  }
  if (window.__modelCatalogProfile === next) {
    syncModelCatalogProfileSelector();
    return next;
  }
  window.__modelCatalogProfile = next;
  applySelectedModelCatalogProfile(source);
  return next;
};
const setModelNamesProfileCache = (names, profile, source = 'storage') => {
  const targetProfile =
    profile === MODEL_CATALOG_PROFILE_LEGACY
      ? MODEL_CATALOG_PROFILE_LEGACY
      : MODEL_CATALOG_PROFILE_LATEST;
  window.__modelNamesProfiles[targetProfile] = normalizeModelNamesForProfile(names, targetProfile);
  if (getSelectedModelCatalogProfile() === targetProfile) {
    window.MODEL_NAMES = window.__modelNamesProfiles[targetProfile].slice();
    window.MODEL_NAMES_META = { arrowIndex: -1, rawCount: window.MODEL_NAMES.length };
    window.dispatchEvent(
      new CustomEvent('model-names-updated', { detail: { source, profile: targetProfile } }),
    );
  }
  return window.__modelNamesProfiles[targetProfile];
};
const setModelCatalogCache = (catalog, source = 'storage', profileHint = '') => {
  const nextCatalog = normalizeModelCatalog(catalog);
  const profile = profileHint || (nextCatalog ? getModelCatalogProfileForCatalog(nextCatalog) : '');
  if (!profile) return null;
  window.__modelCatalogProfiles[profile] = nextCatalog;
  if (getSelectedModelCatalogProfile() === profile) {
    window.__modelCatalog = nextCatalog || getDefaultModelCatalogForProfile(profile);
    window.dispatchEvent(
      new CustomEvent('model-catalog-updated', {
        detail: { source, profile, catalog: window.__modelCatalog },
      }),
    );
  }
  window.dispatchEvent(
    new CustomEvent('model-catalog-profile-updated', {
      detail: { source, profile, catalog: nextCatalog },
    }),
  );
  return nextCatalog;
};
const MODEL_CATALOG_NO_SWITCHER_ERROR = 'MODEL_SWITCHER_PILL_NOT_FOUND';
const getModelCatalogScrapeState = () => String(window.__modelCatalogScrapeState || 'idle').trim() || 'idle';
const isModelCatalogScrapeLoading = () => getModelCatalogScrapeState() === 'loading';
const isModelCatalogNoSwitcherVisible = () => getModelCatalogScrapeState() === 'no-switcher';
const isModelCatalogRefreshPromptVisible = () => !!window.__modelCatalogRefreshPromptVisible;
const hasSuccessfulModelCatalogProfile = (result) =>
  Object.values(result?.profiles && typeof result.profiles === 'object' ? result.profiles : {}).some(
    (profileResult) => profileResult?.ok === true,
  );
const isModelCatalogNoSwitcherResult = (result) =>
  !!result &&
  !hasSuccessfulModelCatalogProfile(result) &&
  (result.noModelSwitcher === true ||
    result.error === MODEL_CATALOG_NO_SWITCHER_ERROR);
const isDeliveredModelCatalogUnavailableResult = (result) => {
  if (!result?.fromChatGptTab) return false;
  if (hasSuccessfulModelCatalogProfile(result)) return false;
  return [
    'MODEL_SUBMENU_NOT_FOUND',
    'MODEL_SUBMENU_OPTIONS_NOT_FOUND',
    'MODEL_OPTIONS_UNRESOLVED',
    'CONFIGURE_ITEM_NOT_FOUND',
  ].includes(String(result.error || '').trim());
};
const getModelCatalogRefreshOutcome = (result) => {
  if (
    isModelCatalogNoSwitcherResult(result) ||
    isDeliveredModelCatalogUnavailableResult(result)
  ) {
    return 'no-switcher';
  }
  if (hasSuccessfulModelCatalogProfile(result)) {
    return result?.ok ? 'ready' : 'partial';
  }
  return result?.ok ? 'ready' : 'failed';
};
const setModelCatalogScrapeState = (value, source = 'popup') => {
  const next = ['loading', 'ready', 'failed', 'no-switcher'].includes(String(value || '').trim())
    ? String(value || '').trim()
    : 'idle';
  if (window.__modelCatalogScrapeState === next) return next;
  window.__modelCatalogScrapeState = next;
  window.dispatchEvent(
    new CustomEvent('model-catalog-scrape-state-changed', {
      detail: { source, state: next },
    }),
  );
  return next;
};
window.__modelCatalogProfile = MODEL_CATALOG_PROFILE_LEGACY;
window.__modelCatalogProfiles = {
  [MODEL_CATALOG_PROFILE_LATEST]: null,
  [MODEL_CATALOG_PROFILE_LEGACY]: null,
};
window.__modelNamesProfiles = {
  [MODEL_CATALOG_PROFILE_LATEST]: getDefaultModelNamesForProfile(MODEL_CATALOG_PROFILE_LATEST),
  [MODEL_CATALOG_PROFILE_LEGACY]: getDefaultModelNamesForProfile(MODEL_CATALOG_PROFILE_LEGACY),
};
window.__modelCatalog = null;
window.MODEL_NAMES = window.__modelNamesProfiles[MODEL_CATALOG_PROFILE_LEGACY].slice();
window.__activeModelConfigId = DEFAULT_ACTIVE_MODEL_CONFIG_ID;
window.__pendingModelConfigTargetId = '';
window.__modelCatalogScrapeState = 'idle';
window.__modelCatalogRefreshPromptVisible = false;

try {
  chrome.storage.sync.get(
    [
      'activeModelConfigId',
      'modelCatalog',
      'modelNames',
      'modelCatalogLatest',
      'modelNamesLatest',
      'modelCatalogLegacy',
      'modelNamesLegacy',
      MODEL_CATALOG_SELECTED_PROFILE_STORAGE_KEY,
    ],
    (stored = {}) => {
      window.__modelCatalogProfile = normalizeModelCatalogProfile(
        stored[MODEL_CATALOG_SELECTED_PROFILE_STORAGE_KEY],
      );
      setActiveModelConfigIdCache(stored.activeModelConfigId, 'bootstrap');
      const genericProfile = stored.modelCatalog
        ? getModelCatalogProfileForCatalog(stored.modelCatalog)
        : '';
      setModelCatalogCache(
        stored.modelCatalogLatest ||
          (genericProfile === MODEL_CATALOG_PROFILE_LATEST ? stored.modelCatalog : null),
        'bootstrap',
        MODEL_CATALOG_PROFILE_LATEST,
      );
      setModelCatalogCache(
        stored.modelCatalogLegacy ||
          (genericProfile === MODEL_CATALOG_PROFILE_LEGACY ? stored.modelCatalog : null),
        'bootstrap',
        MODEL_CATALOG_PROFILE_LEGACY,
      );
      setModelNamesProfileCache(
        stored.modelNamesLatest ||
          (genericProfile === MODEL_CATALOG_PROFILE_LATEST ? stored.modelNames : null),
        MODEL_CATALOG_PROFILE_LATEST,
        'bootstrap',
      );
      setModelNamesProfileCache(
        stored.modelNamesLegacy ||
          (genericProfile === MODEL_CATALOG_PROFILE_LEGACY ? stored.modelNames : null),
        MODEL_CATALOG_PROFILE_LEGACY,
        'bootstrap',
      );
      applySelectedModelCatalogProfile('bootstrap');
    },
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes[MODEL_CATALOG_SELECTED_PROFILE_STORAGE_KEY]) {
      selectModelCatalogProfile(
        changes[MODEL_CATALOG_SELECTED_PROFILE_STORAGE_KEY].newValue,
        'storage:onChanged',
      );
    }
    if (changes.activeModelConfigId) {
      setActiveModelConfigIdCache(changes.activeModelConfigId.newValue, 'storage:onChanged');
    }
    if (changes.modelCatalogLatest)
      setModelCatalogCache(
        changes.modelCatalogLatest.newValue,
        'storage:onChanged',
        MODEL_CATALOG_PROFILE_LATEST,
      );
    if (changes.modelCatalogLegacy)
      setModelCatalogCache(
        changes.modelCatalogLegacy.newValue,
        'storage:onChanged',
        MODEL_CATALOG_PROFILE_LEGACY,
      );
    if (changes.modelNamesLatest)
      setModelNamesProfileCache(
        changes.modelNamesLatest.newValue,
        MODEL_CATALOG_PROFILE_LATEST,
        'storage:onChanged',
      );
    if (changes.modelNamesLegacy)
      setModelNamesProfileCache(
        changes.modelNamesLegacy.newValue,
        MODEL_CATALOG_PROFILE_LEGACY,
        'storage:onChanged',
      );
    if (changes.modelCatalog) {
      const profile = getModelCatalogProfileForCatalog(changes.modelCatalog.newValue);
      const explicitProfileChange =
        profile === MODEL_CATALOG_PROFILE_LATEST
          ? changes.modelCatalogLatest
          : changes.modelCatalogLegacy;
      if (!explicitProfileChange)
        setModelCatalogCache(changes.modelCatalog.newValue, 'storage:onChanged', profile);
    }
  });
} catch {}

window.__selectModelCatalogProfile = selectModelCatalogProfile;

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-model-catalog-profile]').forEach((button) => {
    if (button.dataset.modelCatalogProfileWired === '1') return;
    button.dataset.modelCatalogProfileWired = '1';
    button.addEventListener('click', () => {
      selectModelCatalogProfile(button.getAttribute('data-model-catalog-profile'), 'popup:profile');
    });
  });
  syncModelCatalogProfileSelector();
});

document.addEventListener('DOMContentLoaded', () => {
  const isActionWindowPopup = new URLSearchParams(window.location.search).get('actionWindow') === '1';
  if (isActionWindowPopup) {
    document.documentElement.classList.add('action-window-popup');
    document.body?.classList.add('action-window-popup');
    let closeOnBlurTimer = 0;
    const clearCloseOnBlurTimer = () => {
      if (!closeOnBlurTimer) return;
      clearTimeout(closeOnBlurTimer);
      closeOnBlurTimer = 0;
    };
    const queueCloseOnBlur = () => {
      clearCloseOnBlurTimer();
      closeOnBlurTimer = setTimeout(() => {
        if (document.hasFocus()) return;
        try {
          window.close();
        } catch {}
      }, 120);
    };
    window.addEventListener('focus', clearCloseOnBlurTimer);
    window.addEventListener('blur', queueCloseOnBlur);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') queueCloseOnBlur();
    });
  }

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

  const DEFAULT_SEPARATOR_CANONICAL = '\n\n--- --- ---\n\n';

  function normalizeDefaultSeparatorValue(str) {
    if (typeof str !== 'string') return str;
    const realNewlines = str.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');
    return realNewlines.trim() === '--- --- ---' ? DEFAULT_SEPARATOR_CANONICAL : str;
  }

  function sep_storageToUI(str) {
    // Converts real newlines to literal \n for display in the input
    const normalized = normalizeDefaultSeparatorValue(str);
    return typeof normalized === 'string' ? normalized.replace(/\n/g, '\\n') : normalized;
  }
  function sep_UItoStorage(str) {
    // Converts displayed literal \n back to real newlines for storage/export
    const storage = typeof str === 'string' ? str.replace(/\\n/g, '\n') : str;
    return normalizeDefaultSeparatorValue(storage);
  }

  // Source of truth for independent profile slots if storage is empty.
  const DEFAULT_MODEL_PICKER_KEY_CODES_LATEST = buildDefaultModelPickerCodes({
    profile: MODEL_CATALOG_PROFILE_LATEST,
  });
  const DEFAULT_MODEL_PICKER_KEY_CODES_LEGACY = buildDefaultModelPickerCodes({
    profile: MODEL_CATALOG_PROFILE_LEGACY,
  });
  const DEFAULT_MODEL_PICKER_KEY_CODES = DEFAULT_MODEL_PICKER_KEY_CODES_LATEST;

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

    const modelProfiles = [
      MODEL_CATALOG_PROFILE_LEGACY,
      MODEL_CATALOG_PROFILE_LATEST,
    ].map((profile) => ({
      profile,
      codes: window.ShortcutUtils.getModelPickerCodesCache(profile),
    }));

    // Prefer codes from dataset; fallback to char->code
    const popupCodes = {};
    shortcutKeys.forEach((id) => {
      if (getPopupShortcutModifier(id) !== 'alt') return;
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
      let collision = null;
      for (const candidate of modelProfiles) {
        for (const [slot, mc] of candidate.codes.entries()) {
          if (mc && window.ShortcutUtils.codeEquals(mc, c2)) {
            collision = { profile: candidate.profile, slot };
            break;
          }
        }
        if (collision) break;
      }
      if (!collision) return;

      const profileLabel =
        collision.profile === MODEL_CATALOG_PROFILE_LATEST ? 'Work' : 'Chat';
      const toLabel = `${profileLabel} model slot ${collision.slot + 1}`;
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

  // ---------- Profile-aware model names for tooltips and picker UI ----------
  (() => {
    function setAndRender(list, source = 'bootstrap', profile = getSelectedModelCatalogProfile()) {
      setModelNamesProfileCache(list, profile, source);
      if (getSelectedModelCatalogProfile() !== profile) return;
      if (typeof window.modelPickerRender === 'function') window.modelPickerRender();
      if (typeof window.modelPickerInputsRender === 'function') window.modelPickerInputsRender();
    }
    window.__setPopupModelNames = setAndRender;
  })();

  // ---------- Manual model catalog scrape ----------
  (() => {
    let inFlight = null;
    let released = false;

    const waitForPopupGridReady = () =>
      new Promise((resolve) => {
        const tick = () => {
          if (document.getElementById('model-picker-grid')) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      });

    const waitForLoadingOverlayReady = () =>
      new Promise((resolve) => {
        const tick = () => {
          const overlay = document.querySelector('#model-picker-grid .mp-grid-loading-overlay');
          if (overlay) {
            resolve(overlay);
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      });

    const forceOverlayLayoutFlush = (overlay) => {
      if (!(overlay instanceof Element)) return;
      overlay.getBoundingClientRect();
      overlay.closest('#model-picker-grid')?.getBoundingClientRect();
    };

    const waitForOverlayTransitionIn = (overlay) =>
      new Promise((resolve) => {
        if (!(overlay instanceof Element)) {
          resolve();
          return;
        }

        let timer = 0;
        const finish = () => {
          if (timer) clearTimeout(timer);
          overlay.removeEventListener('transitionend', onEnd);
          overlay.removeEventListener('transitioncancel', onCancel);
          overlay.dataset.visualReady = '1';
          resolve();
        };

        const onEnd = (event) => {
          if (event.target !== overlay || event.propertyName !== 'opacity') return;
          finish();
        };
        const onCancel = (event) => {
          if (event.target !== overlay || event.propertyName !== 'opacity') return;
          finish();
        };

        if (
          overlay.dataset.visualReady === '1' ||
          (overlay.classList.contains('mp-grid-loading-overlay-visible') &&
            Number.parseFloat(getComputedStyle(overlay).opacity || '0') >= 0.98)
        ) {
          finish();
          return;
        }

        overlay.addEventListener('transitionend', onEnd);
        overlay.addEventListener('transitioncancel', onCancel);
        overlay.dataset.visualReady = 'arming';

        timer = setTimeout(finish, MODEL_SCRAPE_OVERLAY_TRANSITION_FALLBACK_MS);

        requestAnimationFrame(() => {
          overlay.classList.add('mp-grid-loading-overlay-visible');
          forceOverlayLayoutFlush(overlay);
        });
      });

    const waitForOverlayPaintGate = async () => {
      await waitForPopupGridReady();
      const overlay = await waitForLoadingOverlayReady();
      forceOverlayLayoutFlush(overlay);
      await waitForOverlayTransitionIn(overlay);
    };

    const releasePreparedSession = () => {
      if (released) return;
      released = true;
      void sendModelMessageToTab({ type: 'CSP_RELEASE_MODEL_CONFIG_SESSION' });
    };

    window.addEventListener('pagehide', releasePreparedSession, { once: true });
    window.addEventListener('unload', releasePreparedSession, { once: true });

    const runScrape = async () => {
      if (inFlight) return inFlight;
      setModelCatalogScrapeState('loading', 'popup:catalog-scrape:start');

      inFlight = (async () => {
        try {
          await waitForOverlayPaintGate();
          const result = await sendModelMessageToTab({
            type: 'CSP_REFRESH_CHAT_WORK_MODEL_CATALOGS',
            hideUi: true,
          });
          const scrapedProfiles =
            result?.profiles && typeof result.profiles === 'object'
              ? result.profiles
              : {};
          const hasScrapedProfiles = Object.keys(scrapedProfiles).length > 0;
          [
            ['chat', MODEL_CATALOG_PROFILE_LEGACY],
            ['work', MODEL_CATALOG_PROFILE_LATEST],
          ].forEach(([mode, profile]) => {
            const profileResult = scrapedProfiles[mode];
            if (profileResult?.modelCatalog) {
              setModelCatalogCache(
                profileResult.modelCatalog,
                `popup:catalog-scrape:${mode}`,
                profile,
              );
            }
            if (
              Array.isArray(profileResult?.modelNames) &&
              typeof window.__setPopupModelNames === 'function'
            ) {
              window.__setPopupModelNames(
                profileResult.modelNames,
                `popup:catalog-scrape:${mode}`,
                profile,
              );
            }
          });
          if (!result?.ok) {
            if (
              isModelCatalogNoSwitcherResult(result) ||
              isDeliveredModelCatalogUnavailableResult(result)
            ) {
              setModelCatalogScrapeState('no-switcher', 'popup:catalog-scrape:no-switcher');
              return result;
            }
            setModelCatalogScrapeState('failed', 'popup:catalog-scrape:failed');
            return result || null;
          }

          if (typeof result.activeModelConfigId === 'string') {
            setActiveModelConfigIdCache(result.activeModelConfigId, 'popup:catalog-scrape');
          }
          if (!hasScrapedProfiles) {
            const scrapedProfile = getModelCatalogProfileForCatalog(result.modelCatalog);
            if (result.modelCatalog) {
              setModelCatalogCache(result.modelCatalog, 'popup:catalog-scrape', scrapedProfile);
            }
            if (
              Array.isArray(result.modelNames) &&
              typeof window.__setPopupModelNames === 'function'
            ) {
              window.__setPopupModelNames(
                result.modelNames,
                'popup:catalog-scrape',
                scrapedProfile,
              );
            }
          }
          setModelCatalogScrapeState('ready', 'popup:catalog-scrape:ready');
          return result;
        } catch {
          setModelCatalogScrapeState('failed', 'popup:catalog-scrape:error');
          return null;
        } finally {
          inFlight = null;
          window.__modelCatalogHydrating = null;
        }
      })();

      window.__modelCatalogHydrating = inFlight;
      return inFlight;
    };
    window.__startModelCatalogScrape = runScrape;
  })();

  // ---------- Independent Chat/Work model-picker shortcut registry ----------
  const normalizeModelPickerCodes = (codes, profile) => {
    const hasArray = Array.isArray(codes);
    const out = hasArray ? codes.slice(0, MODEL_PICKER_MAX_SLOTS) : [];
    while (out.length < MODEL_PICKER_MAX_SLOTS) out.push('');
    return hasArray
      ? out
      : buildDefaultModelPickerCodes({
          profile: normalizeModelCatalogProfile(profile),
        });
  };

  const setModelPickerCodesCache = (profile, codes) => {
    const normalizedProfile = normalizeModelCatalogProfile(profile);
    const normalized = normalizeModelPickerCodes(codes, normalizedProfile);
    window.__modelPickerKeyCodesProfiles ||= {};
    window.__modelPickerKeyCodesProfiles[normalizedProfile] = normalized;
    if (getSelectedModelCatalogProfile() === normalizedProfile) {
      window.__modelPickerKeyCodes = normalized;
    }
    return normalized;
  };

  function getModelPickerCodesCache(profile = getSelectedModelCatalogProfile()) {
    const normalizedProfile = normalizeModelCatalogProfile(profile);
    const cached = window.__modelPickerKeyCodesProfiles?.[normalizedProfile];
    return normalizeModelPickerCodes(cached, normalizedProfile);
  }

  function saveModelPickerKeyCodes(
    codes,
    cb,
    profile = getSelectedModelCatalogProfile(),
  ) {
    const normalizedProfile = normalizeModelCatalogProfile(profile);
    const storageKey = MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE[normalizedProfile];
    const out = setModelPickerCodesCache(normalizedProfile, codes);
    chrome.storage.sync.set({ [storageKey]: out }, () => {
      const err = chrome.runtime?.lastError;
      if (err) {
        console.error(`[saveModelPickerKeyCodes:${normalizedProfile}] set error:`, err);
        if (typeof showToast === 'function') {
          showToast(`Save failed: ${err.message || 'storage error'}`);
        }
        cb?.(false);
        return;
      }
      cb?.(true);
    });
  }

  const getMigrationGroups = (profile) =>
    getPopupModelPresentationGroups(
      DEFAULT_ACTIVE_MODEL_CONFIG_ID,
      window.__modelNamesProfiles?.[profile] || getDefaultModelNamesForProfile(profile),
      window.__modelCatalogProfiles?.[profile] || getDefaultModelCatalogForProfile(profile),
    );

  /** Hydrate both profile caches and migrate the old shared array exactly once. */
  function initModelPickerCodesCache() {
    if (window.__modelPickerHydrating) return window.__modelPickerHydrating;

    const latestKey = MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE[MODEL_CATALOG_PROFILE_LATEST];
    const legacyKey = MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE[MODEL_CATALOG_PROFILE_LEGACY];
    window.__modelPickerHydrating = new Promise((resolve) => {
      chrome.storage.sync.get(
        [
          'modelPickerKeyCodes',
          latestKey,
          legacyKey,
          MODEL_PICKER_KEY_CODE_PROFILES_VERSION_KEY,
        ],
        (stored = {}) => {
          let latestCodes = normalizeModelPickerCodes(
            stored[latestKey],
            MODEL_CATALOG_PROFILE_LATEST,
          );
          let legacyCodes = normalizeModelPickerCodes(
            stored[legacyKey],
            MODEL_CATALOG_PROFILE_LEGACY,
          );
          const patch = {};

          if (
            Number(stored[MODEL_PICKER_KEY_CODE_PROFILES_VERSION_KEY] || 0) <
            MODEL_PICKER_KEY_CODE_PROFILES_VERSION
          ) {
            const sharedCodes = Array.isArray(stored.modelPickerKeyCodes)
              ? stored.modelPickerKeyCodes
              : buildDefaultModelPickerCodes({
                  profile: MODEL_CATALOG_PROFILE_LATEST,
                });
            const migrated =
              typeof window.ModelLabels?.migrateSharedKeyCodesToProfiles === 'function'
                ? window.ModelLabels.migrateSharedKeyCodesToProfiles({
                    codes: sharedCodes,
                    latestGroups: getMigrationGroups(MODEL_CATALOG_PROFILE_LATEST),
                    legacyGroups: getMigrationGroups(MODEL_CATALOG_PROFILE_LEGACY),
                  })
                : null;
            latestCodes = normalizeModelPickerCodes(
              migrated?.[MODEL_CATALOG_PROFILE_LATEST],
              MODEL_CATALOG_PROFILE_LATEST,
            );
            legacyCodes = normalizeModelPickerCodes(
              migrated?.[MODEL_CATALOG_PROFILE_LEGACY],
              MODEL_CATALOG_PROFILE_LEGACY,
            );
            patch[latestKey] = latestCodes;
            patch[legacyKey] = legacyCodes;
            patch[MODEL_PICKER_KEY_CODE_PROFILES_VERSION_KEY] =
              MODEL_PICKER_KEY_CODE_PROFILES_VERSION;
          } else {
            if (
              !Array.isArray(stored[latestKey]) ||
              stored[latestKey].length !== MODEL_PICKER_MAX_SLOTS
            ) {
              patch[latestKey] = latestCodes;
            }
            if (
              !Array.isArray(stored[legacyKey]) ||
              stored[legacyKey].length !== MODEL_PICKER_MAX_SLOTS
            ) {
              patch[legacyKey] = legacyCodes;
            }
          }

          setModelPickerCodesCache(MODEL_CATALOG_PROFILE_LATEST, latestCodes);
          setModelPickerCodesCache(MODEL_CATALOG_PROFILE_LEGACY, legacyCodes);

          const done = () => {
            document.dispatchEvent(new CustomEvent('modelPickerHydrated'));
            resolve({
              [MODEL_CATALOG_PROFILE_LATEST]: latestCodes,
              [MODEL_CATALOG_PROFILE_LEGACY]: legacyCodes,
            });
          };

          if (Object.keys(patch).length) chrome.storage.sync.set(patch, done);
          else done();
        },
      );
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

  function getPopupShortcutModifier(id) {
    const ctrlKeys = window.CSP_SETTINGS_SCHEMA?.shortcuts?.ctrlShortcutKeys;
    if (Array.isArray(ctrlKeys) && ctrlKeys.includes(id)) return 'ctrl';
    return 'alt';
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
    const modelMod =
      typeof getModelPickerModifier === 'function' ? getModelPickerModifier() : 'alt';
    const ownerType = selfOwner?.type ?? null;
    const selfMod = ownerType === 'shortcut' ? getPopupShortcutModifier(selfOwner?.id) : null;
    const selfProfile = normalizeModelCatalogProfile(
      selfOwner?.profile || getSelectedModelCatalogProfile(),
    );
    const profiles =
      ownerType === 'shortcut'
        ? [MODEL_CATALOG_PROFILE_LEGACY, MODEL_CATALOG_PROFILE_LATEST]
        : [selfProfile];

    // 1) Model slots
    profiles.forEach((profile) => {
      const modelCodes = getModelPickerCodesCache(profile);
      const groups = getPopupModelPresentationGroups(
        getVisualActiveModelConfigId(),
        window.__modelNamesProfiles?.[profile] || getDefaultModelNamesForProfile(profile),
        window.__modelCatalogProfiles?.[profile] || getDefaultModelCatalogForProfile(profile),
      );
      const labelsBySlot = Object.fromEntries(
        groups
          .flatMap((group) => (Array.isArray(group?.actions) ? group.actions : []))
          .filter((action) => Number.isInteger(Number(action?.slot)))
          .map((action) => [
            Number(action.slot),
            (action?.labelI18nKey && chrome.i18n?.getMessage?.(action.labelI18nKey)) ||
              action?.label ||
              '',
          ]),
      );
      modelCodes.forEach((c, i) => {
        if (!c) return;
        const isSelfModel =
          ownerType === 'model' && selfOwner.idx === i && selfProfile === profile;
        if (isSelfModel) return;

        if (codeEquals(c, code)) {
          if (ownerType === 'shortcut' && selfMod && selfMod !== modelMod) return;
          const profileLabel =
            profile === MODEL_CATALOG_PROFILE_LATEST ? 'Work' : 'Chat';
          conflicts.push({
            type: 'model',
            profile,
            idx: i,
            label: `${profileLabel}: ${labelsBySlot[i] || `Model slot ${i + 1}`}`,
          });
        }
      });
    });

    // 2) Popup inputs (read actual saved codes from dataset; fallback to char→code)
    const compareMod = ownerType === 'model' ? modelMod : ownerType === 'shortcut' ? selfMod : null;
    shortcutKeys.forEach((id) => {
      if (!isCatalogGatedShortcutAvailable(id)) return;
      if (compareMod && getPopupShortcutModifier(id) !== compareMod) return;

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

    return conflicts;
  }

  /**
   * Clear all conflicting owners immediately in the UI and persist.
   * - Clears popup inputs without re-triggering their input handlers (avoids races)
   * - Clears model slots and saves the array if touched
   */
  function clearOwners(owners, done) {
    const codesByProfile = {};
    const touchedProfiles = new Set();

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
        const profile = normalizeModelCatalogProfile(
          o.profile || getSelectedModelCatalogProfile(),
        );
        if (!codesByProfile[profile]) {
          codesByProfile[profile] = getModelPickerCodesCache(profile);
        }
        const codes = codesByProfile[profile];
        if (o.idx >= 0 && o.idx < codes.length) {
          codes[o.idx] = '';
          touchedProfiles.add(profile);
        }
      }
    });

    const finish = () => {
      // Immediately re-render model chips after clearing, for instant UI update
      if (typeof window.modelPickerRender === 'function') window.modelPickerRender();
      if (typeof done === 'function') done();
    };

    if (!touchedProfiles.size) return finish();

    const values = {};
    touchedProfiles.forEach((profile) => {
      const codes = codesByProfile[profile];
      setModelPickerCodesCache(profile, codes);
      values[MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE[profile]] = codes;
    });
    chrome.storage.sync.set(values, finish);
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
  window.__setModelPickerCodesCache = setModelPickerCodesCache;

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
  document
    .querySelectorAll('.shortcut span, .key-text.platform-alt-label, .key-text.platform-ctrl-label')
    .forEach((span) => {
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
    if (message) {
      // Use innerHTML for messages containing <br> tags, textContent otherwise
      if (message.includes('<br>')) {
        el.innerHTML = message;
      } else {
        el.textContent = message;
      }
    }
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
      document.querySelectorAll('.info-icon-tooltip[data-tooltip]'),
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
  const EXPLICIT_PRESET_OVERRIDES = {
    // UI settings
    showLegacyArrowButtonsCheckbox: false,
    removeMarkdownOnCopyCheckbox: true,
    clickToCopyInlineCodeEnabled: false,
    moveTopBarToBottomCheckbox: false,
    pageUpDownTakeover: true,
    selectMessagesSentByUserOrChatGptCheckbox: true,
    onlySelectUserCheckbox: false,
    onlySelectAssistantCheckbox: false,
    disableCopyAfterSelectCheckbox: false,
    fadeSlimSidebarEnabled: false,
    selectThenCopyAllMessagesBothUserAndChatGpt: true,
    selectThenCopyAllMessagesOnlyAssistant: false,
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

    // Helper flags stored in sync (kept in defaults to avoid being pruned)
    autoOverwrite: false,
    dontAskDuplicateShortcutModal: false, // default false; intended to be re-enabled per session

    // Shortcuts (KeyboardEvent.code values)
    shortcutKeyScrollUpOneMessage: 'KeyA',
    shortcutKeyScrollDownOneMessage: 'KeyF',
    shortcutKeyScrollUpTwoMessages: 'ArrowUp',
    shortcutKeyScrollDownTwoMessages: 'ArrowDown',
    shortcutKeyCopyLowest: 'KeyC',
    shortcutKeyEdit: 'KeyE',
    shortcutKeySendEdit: 'KeyD',
    shortcutKeyCopyAllCodeBlocks: 'BracketRight',
    copyCodeUserSeparator: '\n\n--- --- ---\n\n',
    shortcutKeyNewConversation: 'KeyN',
    shortcutKeyToggleChatWork: 'Digit5',
    shortcutKeySearchConversationHistory: 'Comma',
    shortcutKeyClickNativeScrollToBottom: 'KeyZ',
    shortcutKeyToggleSidebar: 'KeyS',
    shortcutKeyActivateInput: 'KeyW',
    shortcutKeySearchWeb: 'KeyQ',
    shortcutKeyScrollToTop: 'KeyT',
    shortcutKeyPreviousThread: 'KeyJ',
    shortcutKeyNextThread: 'Semicolon',
    selectThenCopy: 'KeyX',
    shortcutKeyToggleModelSelector: 'Slash',
    shortcutKeyShowOverlay: 'Period',
    shortcutKeyToggleCodeboxWrap: NBSP,
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
    shortcutKeyDeepResearch: NBSP,
    shortcutKeyToggleDictate: 'KeyY',
    shortcutKeyCancelDictation: NBSP,
    shortcutKeyShare: NBSP,
    shortcutKeyThinkLonger: NBSP,
    shortcutKeyAddPhotosFiles: NBSP,
    selectThenCopyAllMessages: 'BracketLeft',
    shortcutKeyThinkingExtended: NBSP,
    shortcutKeyThinkingStandard: NBSP,
    shortcutKeyThinkingLight: NBSP,
    shortcutKeyThinkingHeavy: NBSP,
    shortcutKeyProStandard: NBSP,
    shortcutKeyProExtended: NBSP,
    shortcutKeyNewGptConversation: NBSP,

    // Other options

    // Model picker keys (number row, 0-9). The legacy shared array remains
    // import-compatible; live Chat and Work assignments are independent.
    modelPickerKeyCodes: DEFAULT_MODEL_PICKER_KEY_CODES.slice(),
    modelPickerKeyCodesLatest: DEFAULT_MODEL_PICKER_KEY_CODES_LATEST.slice(),
    modelPickerKeyCodesLegacy: DEFAULT_MODEL_PICKER_KEY_CODES_LEGACY.slice(),

  };
  const DEFAULT_PRESET_DATA = (() => {
    const schema = window.CSP_SETTINGS_SCHEMA || {};
    const excludedKeys = new Set([
      // Keep current behavior: popup doesn't seed these by default.
      ...MODEL_CATALOG_SCRAPE_STATE_KEYS,
      'hideArrowButtonsCheckbox',
      'hideCornerButtonsCheckbox',
      ...(Array.isArray(schema?.excludeDefaultsKeys) ? schema.excludeDefaultsKeys : []),
    ]);

    const shortcutSchema = window.CSP_SETTINGS_SCHEMA?.shortcuts || {};
    const prefix =
      typeof shortcutSchema.keyPrefix === 'string' && shortcutSchema.keyPrefix
        ? shortcutSchema.keyPrefix
        : 'shortcutKey';
    const extras = Array.isArray(shortcutSchema.extraShortcutKeys)
      ? shortcutSchema.extraShortcutKeys
      : ['selectThenCopy', 'selectThenCopyAllMessages'];

    const isShortcutLikeKey = (k) => k.startsWith(prefix) || extras.includes(k);

    const coerceForPopup = (k, v) => {
      if (k === 'popupBottomBarOpacityValue' || k === 'popupSlimSidebarOpacityValue') {
        if (typeof v === 'number') return v;
        const n = Number(v);
        return Number.isNaN(n) ? 0 : n;
      }

      if (isShortcutLikeKey(k)) {
        if (v == null) return NBSP;
        const s = String(v).trim();
        if (!s) return NBSP;
        if (s.length === 1) return (window.ShortcutUtils?.charToCode || charToCode)(s) || NBSP;
        return s; // already a KeyboardEvent.code (or legacy label handled elsewhere)
      }

      return v;
    };

    const out = {};
    const base = globalThis.OPTIONS_DEFAULTS || {};
    if (base && typeof base === 'object') {
      for (const [k, v] of Object.entries(base)) {
        if (excludedKeys.has(k)) continue;
        out[k] = coerceForPopup(k, v);
      }
    }

    // Preserve existing popup behavior by overriding base defaults explicitly.
    Object.assign(out, EXPLICIT_PRESET_OVERRIDES);

    [
      ['modelPickerKeyCodes', DEFAULT_MODEL_PICKER_KEY_CODES],
      ['modelPickerKeyCodesLatest', DEFAULT_MODEL_PICKER_KEY_CODES_LATEST],
      ['modelPickerKeyCodesLegacy', DEFAULT_MODEL_PICKER_KEY_CODES_LEGACY],
    ].forEach(([key, defaults]) => {
      out[key] = Array.isArray(out[key]) ? out[key].slice() : defaults.slice();
    });

    return out;
  })();

  // Make available everywhere
  window.DEFAULT_PRESET_DATA = DEFAULT_PRESET_DATA;

  // === Robust First-Run Defaults Loader for All Options, Shortcuts, Separators ===
  (function robustFirstRunDefaultsInit() {
    const DEFAULT_PRESET_DATA = window.DEFAULT_PRESET_DATA;
    const allKeys = Object.keys(DEFAULT_PRESET_DATA);

    // Dev-style guardrail: warn if popup.html references a data-sync key that
    // doesn't exist in OPTIONS_DEFAULTS nor in DEFAULT_PRESET_DATA.
    // This helps catch forgotten wiring when adding new features.
    (function warnOnMissingDataSyncKeys() {
      const allowed = new Set(allKeys);
      const base = globalThis.OPTIONS_DEFAULTS || {};
      if (base && typeof base === 'object') {
        Object.keys(base).forEach((k) => {
          allowed.add(k);
        });
      }

      const missing = new Set();
      document.querySelectorAll('[data-sync]').forEach((el) => {
        const k = el.getAttribute('data-sync');
        if (!k) return;
        if (!allowed.has(k)) missing.add(k);
      });

      if (missing.size) {
        console.warn(
          '[csp] popup.html has data-sync keys missing from OPTIONS_DEFAULTS/DEFAULT_PRESET_DATA:',
          Array.from(missing).sort(),
        );
      }

      const radioGroups = window.CSP_SETTINGS_SCHEMA?.popup?.radioGroups;
      if (Array.isArray(radioGroups)) {
        const bad = new Set();
        radioGroups.forEach((g) => {
          (g?.keys || []).forEach((k) => {
            if (typeof k === 'string' && k && !allowed.has(k)) bad.add(k);
          });
        });
        if (bad.size) {
          console.warn(
            '[csp] settings-schema.js popup.radioGroups contains unknown keys:',
            Array.from(bad).sort(),
          );
        }
      }
    })();

    chrome.storage.sync.get(null, (fullData) => {
      const data = Object.fromEntries(allKeys.map((key) => [key, fullData?.[key]]));
      const patch = {};
      const isPristineInstall = isPristineUserSettingsSnapshot(fullData);
      const freshModelPickerDefaults = buildDefaultModelPickerCodes();
      const modelPickerProfileKeys = new Set([
        ...Object.values(MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE),
        MODEL_PICKER_KEY_CODE_PROFILES_VERSION_KEY,
      ]);

      allKeys.forEach((key) => {
        // initModelPickerCodesCache owns the atomic legacy split. Letting the
        // generic first-run seeder write these keys in parallel can overwrite a
        // just-migrated profile with pristine defaults.
        if (modelPickerProfileKeys.has(key)) return;
        if (data[key] === undefined) {
          patch[key] =
            key === 'modelPickerKeyCodes' && isPristineInstall
              ? freshModelPickerDefaults.slice()
              : DEFAULT_PRESET_DATA[key];
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

        const schemaGroups = window.CSP_SETTINGS_SCHEMA?.popup?.radioGroups;
        const fallbackGroups = [
          {
            name: 'messageSelection',
            keys: [
              'selectMessagesSentByUserOrChatGptCheckbox',
              'onlySelectUserCheckbox',
              'onlySelectAssistantCheckbox',
            ],
          },
          {
            name: 'selectThenCopyAllMessages',
            keys: [
              'selectAndCopyEntireConversationBothUserAndChatGpt',
              'selectAndCopyEntireConversationOnlyAssistant',
              'selectAndCopyEntireConversationOnlyUser',
              'selectThenCopyAllMessagesBothUserAndChatGpt',
              'selectThenCopyAllMessagesOnlyAssistant',
              'selectThenCopyAllMessagesOnlyUser',
            ],
          },
          {
            name: 'modelSwitcherModifier',
            keys: ['useAltForModelSwitcherRadio', 'useControlForModelSwitcherRadio'],
          },
        ];

        const radioGroups = Array.isArray(schemaGroups) ? schemaGroups : fallbackGroups;
        const group = radioGroups.find(
          (g) => Array.isArray(g?.keys) && g.keys.includes(storageKey),
        );

        const isRadioGroupKey = Boolean(group);

        // For radio groups, ignore "unchecked" events to avoid clearing storage
        if (isRadioGroupKey && !isChecked) return;

        if (group) {
          obj = group.keys.reduce((acc, key) => {
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
  (() => {
    // Auto-wire all checkbox/radio options that opt-in via `data-sync`.
    // Exclude inputs with specialized, non-generic behavior handled elsewhere.
    const schema = window.CSP_SETTINGS_SCHEMA?.popup || {};
    const EXCLUDED_STATE_WIRING = new Set(
      Array.isArray(schema.excludedStateWiringKeys) ? schema.excludedStateWiringKeys : [],
    );

    // Defaults (in case schema is missing)
    if (!EXCLUDED_STATE_WIRING.size) {
      [
        'useAltForModelSwitcherRadio',
        'useControlForModelSwitcherRadio',
        'fadeSlimSidebarEnabled',
        'moveTopBarToBottomCheckbox',
        'colorBoldTextEnabled',
      ].forEach((k) => {
        EXCLUDED_STATE_WIRING.add(k);
      });
    }

    const selector =
      typeof schema.stateInputSelector === 'string' && schema.stateInputSelector.trim()
        ? schema.stateInputSelector
        : 'input[type="checkbox"][data-sync], input[type="radio"][data-sync]';

    document
      .querySelectorAll(selector)
      .forEach((el) => {
        const elementId = el.id;
        const storageKey = el.getAttribute('data-sync') || elementId;
        if (!elementId || !storageKey) return;
        if (EXCLUDED_STATE_WIRING.has(elementId) || EXCLUDED_STATE_WIRING.has(storageKey)) return;
        handleStateChange(elementId, storageKey);
      });
  })();

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
            // Ensure segmented UI + compact model-grid labels resync immediately
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

  const shortcutInputSelector =
    typeof window.CSP_SETTINGS_SCHEMA?.popup?.shortcutInputSelector === 'string' &&
    window.CSP_SETTINGS_SCHEMA.popup.shortcutInputSelector.trim()
      ? window.CSP_SETTINGS_SCHEMA.popup.shortcutInputSelector
      : 'input.key-input';

  const shortcutKeys = Array.from(document.querySelectorAll(shortcutInputSelector))
    .filter((el) => !el.classList.contains('mp-input'))
    .map((el) => el.getAttribute('data-sync') || el.id)
    .filter(Boolean);
  const shortcutKeyValues = {};
  const isCatalogGatedShortcutAvailable = (storageKey) => {
    const option =
      typeof window.ModelLabels?.getThinkingShortcutByStorageKey === 'function'
        ? window.ModelLabels.getThinkingShortcutByStorageKey(storageKey)
        : null;
    if (option?.optional) {
      return typeof window.ModelLabels?.hasThinkingEffortOption === 'function'
        ? window.ModelLabels.hasThinkingEffortOption(window.__modelCatalog || null, option.id)
        : false;
    }
    const proOption =
      typeof window.ModelLabels?.getProThinkingShortcutByStorageKey === 'function'
        ? window.ModelLabels.getProThinkingShortcutByStorageKey(storageKey)
        : null;
    if (proOption?.optional) {
      return typeof window.ModelLabels?.hasProFrontendOption === 'function'
        ? window.ModelLabels.hasProFrontendOption(window.__modelCatalog || null)
        : false;
    }
    return true;
  };
  const syncCatalogGatedShortcutVisibility = () => {
    const integratedEffort = window.__modelCatalog?.integratedEffort === true;
    const effortGrid = document.getElementById('mp-effort-grid');
    if (effortGrid) {
      effortGrid.hidden = integratedEffort;
      effortGrid.setAttribute('aria-hidden', integratedEffort ? 'true' : 'false');
      effortGrid.classList.toggle('mp-effort-grid-integrated-hidden', integratedEffort);
    }
    if (integratedEffort) return;

    document
      .querySelectorAll('.shortcut-item[data-thinking-option-id], .shortcut-item[data-pro-option-id]')
      .forEach((item) => {
        const optionId = item.getAttribute('data-thinking-option-id') || '';
        const proOptionId = item.getAttribute('data-pro-option-id') || '';
        let shouldShow = false;
        if (optionId) {
          shouldShow =
            typeof window.ModelLabels?.hasThinkingEffortOption === 'function'
              ? window.ModelLabels.hasThinkingEffortOption(window.__modelCatalog || null, optionId)
              : false;
        } else if (proOptionId) {
          shouldShow =
            typeof window.ModelLabels?.hasProFrontendOption === 'function'
              ? window.ModelLabels.hasProFrontendOption(window.__modelCatalog || null)
              : false;
        }
        const input = item.querySelector('input.key-input');
        item.style.display = shouldShow ? '' : 'none';
        item.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
        if (shouldShow) item.removeAttribute('data-filter-locked');
        else item.setAttribute('data-filter-locked', '1');
        if (input instanceof HTMLInputElement) input.disabled = !shouldShow;
      });

    const proEffortHeading = document.getElementById('mp-pro-effort-heading');
    if (proEffortHeading) {
      const hasVisibleProEffort = Array.from(
        document.querySelectorAll('.shortcut-item[data-pro-option-id]'),
      ).some((item) => item.dataset.filterLocked !== '1' && item.style.display !== 'none');
      proEffortHeading.hidden = !hasVisibleProEffort;
      proEffortHeading.setAttribute('aria-hidden', hasVisibleProEffort ? 'false' : 'true');
      effortGrid?.classList.toggle('mp-pro-effort-visible', hasVisibleProEffort);
    }

    const hasVisibleEffortShortcut = Array.from(
      document.querySelectorAll('#mp-effort-grid .shortcut-item'),
    ).some((item) => item.dataset.filterLocked !== '1' && item.style.display !== 'none');
    if (effortGrid) {
      effortGrid.hidden = !hasVisibleEffortShortcut;
      effortGrid.setAttribute('aria-hidden', hasVisibleEffortShortcut ? 'false' : 'true');
    }

    const searchInput = document.querySelector('.ios-search-input');
    if (searchInput instanceof HTMLInputElement) {
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (typeof window.balanceWrappedLabels === 'function') {
      try {
        window.balanceWrappedLabels();
      } catch {}
    }
    if (typeof window.initTooltips === 'function') {
      try {
        window.initTooltips();
      } catch {}
    }
  };
  window.addEventListener('model-catalog-updated', syncCatalogGatedShortcutVisibility);
  syncCatalogGatedShortcutVisibility();

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
    // Show Shortcut Overlay default "."
    shortcutKeyShowOverlay: 'Period',
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
    const schemaShortcutConfig = window.CSP_SETTINGS_SCHEMA?.shortcuts || {};
    const legacyShortcutKeys = Array.isArray(schemaShortcutConfig.deprecatedShortcutKeys)
      ? schemaShortcutConfig.deprecatedShortcutKeys.slice()
      : [];

    // DRY whitelist: all default keys minus visible or legacy shortcut keys
    const OPTION_KEYS = Object.keys(DEFAULT_PRESET_DATA).filter(
      (key) => !shortcutKeys.includes(key) && !legacyShortcutKeys.includes(key),
    );
    function getExportKeySet() {
      return new Set([...shortcutKeys, ...legacyShortcutKeys, ...OPTION_KEYS]);
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

      // Normalize a single model-picker entry to a code or '' (model grid uses '' for empty; not NBSP)
      function normalizeMpVal(v) {
        const s = normalizeShortcutVal(v); // returns code or NBSP
        return s === '\u00A0' ? '' : s;
      }

      // Profile arrays save immediately, so storage/cache is authoritative.
      function readModelPickerCodes(all, profile) {
        const normalizedProfile = normalizeModelCatalogProfile(profile);
        const storageKey = MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE[normalizedProfile];
        const storageRaw = Array.isArray(all?.[storageKey]) ? all[storageKey] : null;
        const cacheRaw =
          typeof window.ShortcutUtils?.getModelPickerCodesCache === 'function'
            ? window.ShortcutUtils.getModelPickerCodesCache(normalizedProfile)
            : null;
        const defaults = buildDefaultModelPickerCodes({
          profile: normalizedProfile,
        }).slice(0, MODEL_PICKER_MAX_SLOTS);
        const source = storageRaw || cacheRaw || defaults;
        const out = [];
        for (let i = 0; i < MODEL_PICKER_MAX_SLOTS; i++) out.push(normalizeMpVal(source[i] || ''));
        return out;
      }

      // Derive a robust value for each single-key shortcut input by DOM ID
      function effectiveShortcutCode(id, stored) {
        // 0) Preserve explicit clear
        if (stored === '\u00A0') return '\u00A0';

        // 1) If storage holds a real value, export it (normalize in case it's a label/char).
        if (typeof stored === 'string' && stored.trim()) {
          return normalizeShortcutVal(stored);
        }

        // 2) Only for truly "unset" keys (no storage record), derive from UI/defaults.
        const el = document.getElementById(id);

        // Prefer dataset (already a KeyboardEvent.code)
        const ds = el?.dataset?.keyCode || '';
        if (ds && ds !== '\u00A0') return ds;

        // Try the visible label/character in the input
        const visible = el?.value?.trim() || '';
        if (visible) {
          const toCode =
            window.ShortcutUtils?.charToCode ??
            (typeof charToCode === 'function' ? charToCode : null);
          if (toCode) {
            const k = toCode(visible) || '';
            if (k) return k;
          }
          const map = getReverseMap();
          const code = map.exact[visible] || map.lower[visible.toLowerCase()] || '';
          if (code) return code;
        }

        // HTML default attribute (single character) → code
        const defAttr = el?.getAttribute('value')?.trim() || '';
        if (defAttr) {
          const toCode =
            window.ShortcutUtils?.charToCode ??
            (typeof charToCode === 'function' ? charToCode : null);
          const c = toCode ? toCode(defAttr) : '';
          if (c) return c;
        }

        // Final fallback for known edge cases
        const fallback = DEFAULT_SHORTCUT_CODE_FALLBACKS?.[id] || '';
        return fallback || '\u00A0';
      }

      chrome.storage.sync.get(null, (all) => {
        const out = {};

        // Include all known keys present in storage (options, toggles, etc.)
        keySet.forEach((k) => {
          if (Object.hasOwn(all, k)) out[k] = all[k];
        });

        // Ensure EVERY shortcut key is present using "effective" value
        shortcutKeys.forEach((k) => {
          const stored = Object.hasOwn(all, k) ? all[k] : undefined;
          out[k] = effectiveShortcutCode(k, stored);
        });

        legacyShortcutKeys.forEach((k) => {
          if (!Object.hasOwn(all, k) && !Object.hasOwn(DEFAULT_PRESET_DATA, k)) return;
          const stored = Object.hasOwn(all, k) ? all[k] : DEFAULT_PRESET_DATA[k];
          out[k] = normalizeShortcutVal(stored);
        });

        // Export both independent profile arrays. Keep the legacy shared field
        // aligned with Chat for backward-compatible imports into older builds.
        out.modelPickerKeyCodesLatest = readModelPickerCodes(
          all,
          MODEL_CATALOG_PROFILE_LATEST,
        );
        out.modelPickerKeyCodesLegacy = readModelPickerCodes(
          all,
          MODEL_CATALOG_PROFILE_LEGACY,
        );
        out.modelPickerKeyCodes = out.modelPickerKeyCodesLegacy.slice();
        out[MODEL_PICKER_KEY_CODE_PROFILES_VERSION_KEY] =
          MODEL_PICKER_KEY_CODE_PROFILES_VERSION;

        // Scraped catalog snapshots belong to the current ChatGPT account/session.
        MODEL_CATALOG_SCRAPE_STATE_KEYS.forEach((key) => {
          delete out[key];
        });

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
      // Scraped catalog snapshots are nonportable; ignore any provided in older files.
      if (src && typeof src === 'object') {
        MODEL_CATALOG_SCRAPE_STATE_KEYS.forEach((key) => {
          delete src[key];
        });
      }

      const keySet = getExportKeySet();
      const next = {};

      Object.keys(src || {}).forEach((k) => {
        if (!keySet.has(k)) return;
        let v = src[k];
        if (shortcutKeys.includes(k) || legacyShortcutKeys.includes(k)) {
          v = normalizeShortcutVal(v);
        }
        next[k] = v;
      });

      const normalizeImportedProfileCodes = (codes, profile) => {
        const normalizedProfile = normalizeModelCatalogProfile(profile);
        const padded = Array.isArray(codes)
          ? codes.slice(0, MODEL_PICKER_MAX_SLOTS).map((value) => {
              const normalized = normalizeShortcutVal(value);
              return normalized === '\u00A0' ? '' : normalized;
            })
          : buildDefaultModelPickerCodes({ profile: normalizedProfile });
        while (padded.length < MODEL_PICKER_MAX_SLOTS) padded.push('');
        const groups = getPopupModelPresentationGroups(
          DEFAULT_ACTIVE_MODEL_CONFIG_ID,
          window.__modelNamesProfiles?.[normalizedProfile] ||
            getDefaultModelNamesForProfile(normalizedProfile),
          window.__modelCatalogProfiles?.[normalizedProfile] ||
            getDefaultModelCatalogForProfile(normalizedProfile),
        );
        return typeof window.ModelLabels?.normalizeProfileKeyCodes === 'function'
          ? window.ModelLabels.normalizeProfileKeyCodes(padded, groups)
          : padded;
      };
      const latestKey =
        MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE[MODEL_CATALOG_PROFILE_LATEST];
      const legacyKey =
        MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE[MODEL_CATALOG_PROFILE_LEGACY];
      const sharedImport = Array.isArray(next.modelPickerKeyCodes)
        ? next.modelPickerKeyCodes
        : null;
      if (Array.isArray(next[latestKey]) || sharedImport) {
        next[latestKey] = normalizeImportedProfileCodes(
          Array.isArray(next[latestKey]) ? next[latestKey] : sharedImport,
          MODEL_CATALOG_PROFILE_LATEST,
        );
      }
      if (Array.isArray(next[legacyKey]) || sharedImport) {
        next[legacyKey] = normalizeImportedProfileCodes(
          Array.isArray(next[legacyKey]) ? next[legacyKey] : sharedImport,
          MODEL_CATALOG_PROFILE_LEGACY,
        );
      }
      if (next[latestKey] || next[legacyKey]) {
        next[MODEL_PICKER_KEY_CODE_PROFILES_VERSION_KEY] =
          MODEL_PICKER_KEY_CODE_PROFILES_VERSION;
      }

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

          // Refresh both independent profile caches immediately.
          if (Array.isArray(next[latestKey]) || Array.isArray(next[legacyKey])) {
            try {
              if (Array.isArray(next[latestKey])) {
                window.__setModelPickerCodesCache?.(
                  MODEL_CATALOG_PROFILE_LATEST,
                  next[latestKey],
                );
              }
              if (Array.isArray(next[legacyKey])) {
                window.__setModelPickerCodesCache?.(
                  MODEL_CATALOG_PROFILE_LEGACY,
                  next[legacyKey],
                );
              }
              document.dispatchEvent(new CustomEvent('modelPickerHydrated'));
              if (typeof window.modelPickerRender === 'function') window.modelPickerRender();
              if (typeof window.modelPickerInputsRender === 'function')
                window.modelPickerInputsRender();
            } catch (_) {}
          }

          // modelNames are intentionally ignored on import to preserve local names and migrations.

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

  // ===================== Highlight Bold Text Color Picker =====================

  const colorBoldTextEnabled = document.getElementById('colorBoldTextEnabled');
  const colorBoldTextLightColorInput = document.getElementById('colorBoldTextLightColor');
  const colorBoldTextDarkColorInput = document.getElementById('colorBoldTextDarkColor');
  const colorBoldTextPickerContainer = document.getElementById('colorBoldText-picker-container');
  const colorBoldTextResetColors = document.getElementById('colorBoldTextResetColors');

  const COLOR_BOLD_LIGHT_DEFAULT = '#2037e6';
  const COLOR_BOLD_DARK_DEFAULT = '#4da3ff';

  function setColorBoldTextUI(lightColor, darkColor) {
    if (colorBoldTextLightColorInput) {
      colorBoldTextLightColorInput.value = lightColor || COLOR_BOLD_LIGHT_DEFAULT;
    }
    if (colorBoldTextDarkColorInput) {
      colorBoldTextDarkColorInput.value = darkColor || COLOR_BOLD_DARK_DEFAULT;
    }
  }

  function toggleColorBoldTextUI(visible) {
    if (colorBoldTextPickerContainer) {
      colorBoldTextPickerContainer.style.display = visible ? 'flex' : 'none';
    }
  }

  // On load: sync checkbox and color pickers from storage
  if (colorBoldTextEnabled) {
    chrome.storage.sync.get(
      ['colorBoldTextEnabled', 'colorBoldTextLightColor', 'colorBoldTextDarkColor'],
      (data) => {
        const isEnabled = !!data.colorBoldTextEnabled;
        const lightColor = data.colorBoldTextLightColor || COLOR_BOLD_LIGHT_DEFAULT;
        const darkColor = data.colorBoldTextDarkColor || COLOR_BOLD_DARK_DEFAULT;

        colorBoldTextEnabled.checked = isEnabled;
        toggleColorBoldTextUI(isEnabled);
        setColorBoldTextUI(lightColor, darkColor);
      },
    );
  }

  // Checkbox toggles color picker visibility
  if (colorBoldTextEnabled) {
    colorBoldTextEnabled.addEventListener('change', () => {
      const isChecked = colorBoldTextEnabled.checked;
      toggleColorBoldTextUI(isChecked);

      chrome.storage.sync.set({ colorBoldTextEnabled: isChecked }, () => {
        showToast('Options saved. Reload page to apply changes.');
      });
    });
  }

  // Color input change handlers with debounce
  let colorBoldTextLightTimeout;
  if (colorBoldTextLightColorInput) {
    colorBoldTextLightColorInput.addEventListener('input', () => {
      clearTimeout(colorBoldTextLightTimeout);
      colorBoldTextLightTimeout = setTimeout(() => {
        const color = colorBoldTextLightColorInput.value;
        chrome.storage.sync.set({ colorBoldTextLightColor: color }, () => {
          if (chrome.runtime.lastError) {
            console.error('Storage set error:', chrome.runtime.lastError);
          } else {
            showToast('Light mode color saved. Reload page to apply changes.');
          }
        });
      }, 300);
    });
  }

  let colorBoldTextDarkTimeout;
  if (colorBoldTextDarkColorInput) {
    colorBoldTextDarkColorInput.addEventListener('input', () => {
      clearTimeout(colorBoldTextDarkTimeout);
      colorBoldTextDarkTimeout = setTimeout(() => {
        const color = colorBoldTextDarkColorInput.value;
        chrome.storage.sync.set({ colorBoldTextDarkColor: color }, () => {
          if (chrome.runtime.lastError) {
            console.error('Storage set error:', chrome.runtime.lastError);
          } else {
            showToast('Dark mode color saved. Reload page to apply changes.');
          }
        });
      }, 300);
    });
  }

  // Reset colors to defaults
  if (colorBoldTextResetColors) {
    const reset = () => {
      clearTimeout(colorBoldTextLightTimeout);
      clearTimeout(colorBoldTextDarkTimeout);

      setColorBoldTextUI(COLOR_BOLD_LIGHT_DEFAULT, COLOR_BOLD_DARK_DEFAULT);

      chrome.storage.sync.set(
        {
          colorBoldTextLightColor: COLOR_BOLD_LIGHT_DEFAULT,
          colorBoldTextDarkColor: COLOR_BOLD_DARK_DEFAULT,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error('Storage set error:', chrome.runtime.lastError);
          } else {
            showToast('Bold text colors reset. Reload page to apply changes.');
          }
        },
      );
    };

    colorBoldTextResetColors.addEventListener('click', reset);
    colorBoldTextResetColors.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        reset();
      }
    });
  }

  /* === Shortcuts Presets (Clear All / Reset Defaults) Tile === */
  (function shortcutsPresetsInit() {
    // --- constants ---
    const NBSP = '\u00A0';
    const EMPTY_MODEL_PICKER = Array(MODEL_PICKER_MAX_SLOTS).fill('');
    const getDefaultModelPickerProfiles = () => ({
      [MODEL_CATALOG_PROFILE_LATEST]: buildDefaultModelPickerCodes({
        profile: MODEL_CATALOG_PROFILE_LATEST,
      }),
      [MODEL_CATALOG_PROFILE_LEGACY]: buildDefaultModelPickerCodes({
        profile: MODEL_CATALOG_PROFILE_LEGACY,
      }),
    });

    const DEFAULT_PRESET_DATA = window.DEFAULT_PRESET_DATA;

    // Persist both profile arrays in one atomic storage update.
    function applyModelPickerCodeProfiles(codesByProfile, toastMsg) {
      const latest = (codesByProfile?.[MODEL_CATALOG_PROFILE_LATEST] || []).slice(
        0,
        MODEL_PICKER_MAX_SLOTS,
      );
      const legacy = (codesByProfile?.[MODEL_CATALOG_PROFILE_LEGACY] || []).slice(
        0,
        MODEL_PICKER_MAX_SLOTS,
      );
      while (latest.length < MODEL_PICKER_MAX_SLOTS) latest.push('');
      while (legacy.length < MODEL_PICKER_MAX_SLOTS) legacy.push('');

      const finish = () => {
        try {
          window.__setModelPickerCodesCache?.(MODEL_CATALOG_PROFILE_LATEST, latest);
          window.__setModelPickerCodesCache?.(MODEL_CATALOG_PROFILE_LEGACY, legacy);
          document.dispatchEvent(new CustomEvent('modelPickerHydrated'));
          if (typeof window.modelPickerInputsRender === 'function') {
            window.modelPickerInputsRender();
          }
        } catch (_) {}
        window.toast?.show?.(toastMsg || 'Model picker updated. Reload page to apply changes.');
      };

      chrome.storage.sync.set({
        [MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE[MODEL_CATALOG_PROFILE_LATEST]]:
          latest,
        [MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE[MODEL_CATALOG_PROFILE_LEGACY]]:
          legacy,
        [MODEL_PICKER_KEY_CODE_PROFILES_VERSION_KEY]:
          MODEL_PICKER_KEY_CODE_PROFILES_VERSION,
      }, () => {
        if (chrome.runtime?.lastError) {
          window.toast?.show?.('Model shortcut update failed. Please reopen the popup.');
        } else {
          finish();
        }
      });
    }

    // --- Button event handlers ---
    const clearBtn = document.getElementById('btnClearAllShortcuts');
    const resetBtn = document.getElementById('btnResetDefaults');

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        window.showDuplicateModal(
          `This will <strong style="color:#c00;font-weight:700;">clear all shortcut keys</strong>, but will not change any toggles or checkboxes.`,
          async (yes) => {
            if (!yes) return;

            // 1) Persist NBSP for all single‑key shortcuts in one write
            const clearedShortcuts = Object.fromEntries(shortcutKeys.map((k) => [k, NBSP]));
            try {
              await chrome.storage.sync.set(clearedShortcuts);
            } catch (e) {
              console.error('clear all: failed to set shortcuts', e);
            }

            // 1b) Immediately refresh visible shortcut inputs to reflect the cleared state
            if (typeof window.refreshShortcutInputsFromStorage === 'function') {
              try {
                window.refreshShortcutInputsFromStorage();
              } catch (_) {}
            }

            // 2) Persistently clear both independent model-picker profiles.
            applyModelPickerCodeProfiles(
              {
                [MODEL_CATALOG_PROFILE_LATEST]: EMPTY_MODEL_PICKER,
                [MODEL_CATALOG_PROFILE_LEGACY]: EMPTY_MODEL_PICKER,
              },
              'All model shortcuts cleared. Reload page to apply changes.',
            );
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
            if (!yes) return;

            // 1) Restore all options/shortcuts from your defaults object
            if (typeof window.importSettingsObj === 'function') {
              window.importSettingsObj(DEFAULT_PRESET_DATA, { skipBrowserConfirm: true });
            }

            // 2) Repopulate both profiles with their independent defaults.
            applyModelPickerCodeProfiles(
              getDefaultModelPickerProfiles(),
              'Model shortcuts restored to defaults.',
            );
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

// ===== @note Model Picker Inputs Grid (unified: build + capture + save + react) =====
(function modelPickerInputsGridInitV2() {
  let tries = 0;
  const MAX_SLOTS = MODEL_PICKER_MAX_SLOTS;
  let lastViewSignature = '';
  let pendingVisualSettleTimer = 0;

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

  const querySection = () => document.getElementById('model-picker-grid');
  const queryVisibleInputs = () =>
    Array.from(document.querySelectorAll('#model-picker-grid .mp-input')).filter(
      (inp) => inp instanceof HTMLElement && inp.offsetParent !== null,
    );
  const sanitizeViewKey = (value) => String(value || '').replace(/[^a-z0-9_-]+/gi, '-');
  const resolveActionLabel = (action) => {
    const key = action?.labelI18nKey || '';
    if (key && chrome?.i18n?.getMessage) {
      const localized = chrome.i18n.getMessage(key);
      if (localized) return localized;
    }
    return action?.label || '';
  };
  const getProfileViewGroups = (profile) =>
    getPopupModelPresentationGroups(
      getVisualActiveModelConfigId(),
      window.__modelNamesProfiles?.[profile] || getDefaultModelNamesForProfile(profile),
      window.__modelCatalogProfiles?.[profile] || getDefaultModelCatalogForProfile(profile),
    );
  const getViewGroups = () => getProfileViewGroups(getSelectedModelCatalogProfile());
  const getViewSignature = (groups) =>
    JSON.stringify({
      profile: getSelectedModelCatalogProfile(),
      activeModelConfigId: getVisualActiveModelConfigId(),
      groups: (groups || []).map((group) => ({
        id: group.id || '',
        actions: (group.actions || []).map((action) => ({
          viewKey: action.viewKey || `${group.id || 'group'}:${action.id || action.slot || ''}`,
          slot: Number.isInteger(Number(action.slot)) ? Number(action.slot) : null,
          storageKey: action.storageKey || '',
          label: resolveActionLabel(action),
          active: !!action.active,
        })),
      })),
    });
  const getPrimaryGroupElement = () =>
    querySection()?.querySelector('.mp-grid-group[data-group="primary"]') || null;
  const getModelCatalogLoadingText = () =>
    chrome?.i18n?.getMessage?.('label_modelPickerLoadingAvailableModels') || 'Loading available models...';
  const getModelCatalogRefreshPromptText = () =>
    chrome?.i18n?.getMessage?.('label_modelPickerManualRefreshPrompt') ||
    'Click to update the model list.\n\nNote: Model menus on the webpage may briefly flash in the background. This is normal.';
  const getModelCatalogNoSwitcherPromptText = () =>
    chrome?.i18n?.getMessage?.('label_modelPickerNoSwitcherPrompt') ||
    'Log in with Plus or Pro to show model switching shortcuts. Open ChatGPT, then click here to refresh.';
  const getModelCatalogRefreshTooltipText = () =>
    chrome?.i18n?.getMessage?.('label_modelPickerManualRefreshTooltip') ||
    'Click to update the model list.\n\nThe model menus will briefly \nflash in the background. \nThis is normal and expected.';
  const getModelCatalogGridRefreshButtonText = () => 'Click to Refresh\nModel List';
  const getModelCatalogGridRefreshAriaLabel = () => 'Click to Refresh Model List';
  const getCurrentWeekKey = () => {
    const d = new Date();
    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
    return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  };
  const setModelCatalogRefreshPromptVisible = (value, source = 'popup') => {
    const next = !!value;
    if (window.__modelCatalogRefreshPromptVisible === next) return next;
    window.__modelCatalogRefreshPromptVisible = next;
    window.dispatchEvent(
      new CustomEvent('model-catalog-refresh-prompt-changed', {
        detail: { source, visible: next },
      }),
    );
    return next;
  };
  const clearPendingVisualSettle = () => {
    if (pendingVisualSettleTimer) {
      clearTimeout(pendingVisualSettleTimer);
      pendingVisualSettleTimer = 0;
    }
  };
  const clearPendingModelConfigTarget = (expected = '') => {
    const pending = getPendingModelConfigTargetId();
    if (!pending) return false;
    const normalizedExpected = expected ? normalizeActiveModelConfigId(expected) : '';
    if (normalizedExpected && pending !== normalizedExpected) return false;
    clearPendingVisualSettle();
    window.__pendingModelConfigTargetId = '';
    return true;
  };
  const schedulePendingModelConfigSettle = (expected) => {
    const normalizedExpected = normalizeActiveModelConfigId(expected);
    clearPendingVisualSettle();
    pendingVisualSettleTimer = setTimeout(() => {
      const cleared = clearPendingModelConfigTarget(normalizedExpected);
      if (cleared) renderAll({ allowPendingRebuild: true });
    }, MODEL_CONFIG_VISUAL_SETTLE_MS);
  };

  const resolveGroupLabel = (group) => {
    const key = group?.labelI18nKey || '';
    if (key && chrome?.i18n?.getMessage) {
      const localized = chrome.i18n.getMessage(key);
      if (localized) return localized;
    }
    return group?.label || '';
  };

  const standaloneShortcutInputs = {
    shortcutKeyToggleChatWork: document.getElementById('shortcutKeyToggleChatWork'),
  };

  const createShortcutItem = (action, groupId, groupIndex) => {
    const storageKey = String(action?.storageKey || '');
    const isStandaloneShortcut =
      action?.actionKind === 'shortcut-setting' && storageKey.length > 0;
    const slot = isStandaloneShortcut ? -1 : Number(action?.slot || 0);
    const viewKey = action?.viewKey || `${groupId || 'group'}:${action?.id || slot}`;
    const labelText = resolveActionLabel(action);
    const isModelNameAction =
      groupId === 'configure' && action?.actionKind === 'configure-option';
    const item = document.createElement('div');
    item.className = 'shortcut-item mp-model-shortcut-item';
    if (isModelNameAction) item.classList.add('mp-configure-item');
    if (action?.group === 'pill-utility') item.classList.add('mp-pill-utility-item');
    if (isStandaloneShortcut) item.classList.add('mp-standalone-shortcut-item');
    if (isModelNameAction && action?.active) item.classList.add('mp-configure-item-active');
    if (!isStandaloneShortcut) item.setAttribute('data-slot', String(slot));
    item.setAttribute('data-group', groupId || '');
    item.setAttribute('data-group-index', String(groupIndex));
    item.setAttribute('data-action-id', action?.id || '');
    item.setAttribute('data-view-key', viewKey);
    if (isStandaloneShortcut) item.setAttribute('data-shortcut-key', storageKey);
    item.style.cssText =
      'display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;';
    if (isModelNameAction) {
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-pressed', action?.active ? 'true' : 'false');
    }

    const label = document.createElement('div');
    label.className = 'shortcut-label';
    label.style.cssText = 'margin:0 0 10px 0;';
    label.innerHTML = `<span class="mp-label" style="font-weight:400;" data-view-key="${viewKey}"></span>`;
    const labelSpan = label.querySelector('.mp-label');
    labelSpan.textContent = labelText;
    if (isStandaloneShortcut && action?.labelI18nKey) {
      labelSpan.classList.add('i18n');
      labelSpan.setAttribute('data-i18n', action.labelI18nKey);
    }

    const keys = document.createElement('div');
    keys.className = 'shortcut-keys';
    keys.style.cssText = 'justify-content:center;gap:4px;';

    const mod = document.createElement('span');
    mod.className = isStandaloneShortcut
      ? 'key-text platform-alt-label'
      : 'key-text mp-modifier-text';
    mod.textContent = 'Alt + ';

    const input = isStandaloneShortcut
      ? standaloneShortcutInputs[storageKey]
      : document.createElement('input');
    if (!(input instanceof HTMLInputElement)) return item;
    input.hidden = false;
    input.className = isStandaloneShortcut
      ? 'key-input custom-tooltip mp-standalone-shortcut-input'
      : 'key-input mp-input custom-tooltip';
    input.id = isStandaloneShortcut ? storageKey : `mpKeyInput-${sanitizeViewKey(viewKey)}`;
    if (isStandaloneShortcut) {
      input.setAttribute('data-sync', storageKey);
      input.setAttribute('name', storageKey);
      input.removeAttribute('data-slot');
    } else {
      input.setAttribute('data-slot', String(slot));
    }
    input.setAttribute('data-group', groupId || '');
    input.setAttribute('data-group-index', String(groupIndex));
    input.setAttribute('data-view-key', viewKey);
    input.setAttribute('maxlength', '12');
    input.type = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.style.cssText = 'width:2.55rem;text-align:center;';
    if (isStandaloneShortcut && labelText) {
      input.setAttribute('aria-label', `Set shortcut for ${labelText}`);
      input.setAttribute('data-tooltip', `Set shortcut for\n${labelText}`);
    }

    keys.append(mod, input);
    item.append(label, keys);
    return item;
  };

  const createRefreshModelsButton = () => {
    const button = document.createElement('button');
    button.id = 'mp-refresh-models-button';
    button.type = 'button';
    button.className = 'shortcut-item mp-model-shortcut-item mp-refresh-models-button';
    button.setAttribute('data-tooltip', getModelCatalogRefreshTooltipText());
    button.setAttribute('aria-label', getModelCatalogGridRefreshAriaLabel());

    const label = document.createElement('span');
    label.className = 'mp-refresh-models-button-label';
    label.textContent = getModelCatalogGridRefreshButtonText();
    button.appendChild(label);
    return button;
  };

  let refreshButtonTooltip = null;
  const getRefreshButtonTooltip = () => {
    if (refreshButtonTooltip?.isConnected) return refreshButtonTooltip;
    refreshButtonTooltip = document.createElement('div');
    refreshButtonTooltip.className = 'mp-refresh-models-tooltip';
    refreshButtonTooltip.setAttribute('role', 'tooltip');
    refreshButtonTooltip.hidden = true;
    document.body.appendChild(refreshButtonTooltip);
    return refreshButtonTooltip;
  };

  const positionRefreshButtonTooltip = (button) => {
    const tooltip = getRefreshButtonTooltip();
    const tooltipText = button.getAttribute('data-tooltip') || '';
    if (!tooltipText) return;
    tooltip.textContent = tooltipText;
    tooltip.hidden = false;

    const gap = 6;
    const minEdge = 8;
    const buttonRect = button.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;

    const buttonCenterY = buttonRect.top + buttonRect.height / 2;
    const left = Math.min(
      Math.max(minEdge, buttonRect.left - tooltipRect.width - gap),
      Math.max(minEdge, viewportWidth - tooltipRect.width - minEdge),
    );
    const top = Math.min(
      Math.max(minEdge, buttonCenterY - tooltipRect.height / 2),
      Math.max(minEdge, viewportHeight - tooltipRect.height - minEdge),
    );
    const caretY = Math.min(
      Math.max(12, buttonCenterY - top),
      Math.max(12, tooltipRect.height - 12),
    );

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.setProperty('--mp-refresh-tooltip-caret-y', `${Math.round(caretY)}px`);
  };

  const hideRefreshButtonTooltip = () => {
    if (!refreshButtonTooltip) return;
    refreshButtonTooltip.hidden = true;
  };

  const wireRefreshButtonTooltip = (button) => {
    if (!(button instanceof HTMLElement) || button.dataset.tooltipWired === '1') return;
    button.dataset.tooltipWired = '1';

    const show = () => {
      requestAnimationFrame(() => positionRefreshButtonTooltip(button));
    };
    button.addEventListener('mouseenter', show);
    button.addEventListener('focus', show);
    button.addEventListener('mouseleave', hideRefreshButtonTooltip);
    button.addEventListener('blur', hideRefreshButtonTooltip);
    window.addEventListener('resize', hideRefreshButtonTooltip, { passive: true });
    window.addEventListener('scroll', hideRefreshButtonTooltip, { passive: true });
  };

  const appendGroupActions = (grid, group) => {
    const actions = Array.isArray(group?.actions) ? group.actions : [];
    const shouldIncludeRefreshButton = group?.id === 'primary';
    let refreshButtonAppended = false;

    actions.forEach((action, index) => {
      if (shouldIncludeRefreshButton && index === 5) {
        grid.appendChild(createRefreshModelsButton());
        refreshButtonAppended = true;
      }
      grid.appendChild(createShortcutItem(action, group.id || '', index));
    });

    if (shouldIncludeRefreshButton && !refreshButtonAppended) {
      grid.appendChild(createRefreshModelsButton());
    }
  };

  const attachEffortGrid = (section, effortGrid = document.getElementById('mp-effort-grid')) => {
    if (!(section instanceof Element) || !(effortGrid instanceof Element)) return;
    const overlay = Array.from(section.children).find((child) =>
      child.classList?.contains('mp-grid-loading-overlay'),
    );
    section.insertBefore(effortGrid, overlay || null);
  };

  const buildGroupWrapper = (group) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'mp-grid-group';
    wrapper.setAttribute('data-group', group.id || '');

    const labelText = resolveGroupLabel(group);
    if (group.compactLabel && labelText) {
      const heading = document.createElement('div');
      heading.className = 'mp-subsection-label';
      heading.setAttribute('role', 'heading');
      heading.setAttribute('aria-level', '3');
      heading.textContent = labelText;
      wrapper.appendChild(heading);
    }

    const grid = document.createElement('div');
    grid.className = 'shortcut-grid mp-shortcut-grid-row';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;';

    appendGroupActions(grid, group);

    wrapper.appendChild(grid);
    return wrapper;
  };

  let modelCatalogLoadingVisibleSince = 0;
  let modelCatalogLoadingHideTimer = 0;
  let modelCatalogLoadingRemoveTimer = 0;

  const clearCatalogLoadingVisualTimers = () => {
    if (modelCatalogLoadingHideTimer) {
      clearTimeout(modelCatalogLoadingHideTimer);
      modelCatalogLoadingHideTimer = 0;
    }
    if (modelCatalogLoadingRemoveTimer) {
      clearTimeout(modelCatalogLoadingRemoveTimer);
      modelCatalogLoadingRemoveTimer = 0;
    }
  };

  const ensureCatalogLoadingOverlay = (section) => {
    let overlay = section.querySelector('.mp-grid-loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'mp-grid-loading-overlay';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      overlay.dataset.visualReady = '0';

      const chip = document.createElement('div');
      chip.className = 'mp-grid-loading-chip';

      const spinner = document.createElement('span');
      spinner.className = 'spinner mp-grid-loading-spinner';
      spinner.setAttribute('aria-hidden', 'true');

      const text = document.createElement('span');
      text.className = 'mp-grid-loading-text';

      const promptButton = document.createElement('button');
      promptButton.type = 'button';
      promptButton.className = 'mp-grid-refresh-prompt';

      chip.append(spinner, text);
      overlay.append(chip, promptButton);
      section.appendChild(overlay);
    }
    const textEl = overlay.querySelector('.mp-grid-loading-text');
    if (textEl) textEl.textContent = getModelCatalogLoadingText();
    const promptButton = overlay.querySelector('.mp-grid-refresh-prompt');
    if (promptButton) promptButton.textContent = getModelCatalogRefreshPromptText();
    return overlay;
  };

  const triggerManualCatalogRefresh = async (source = 'manual') => {
    const startScrape = window.__startModelCatalogScrape;
    if (typeof startScrape !== 'function' || isModelCatalogScrapeLoading()) return null;
    setModelCatalogRefreshPromptVisible(false, `${source}:hide-prompt`);
    renderAll({ allowPendingRebuild: true });
    const result = await startScrape();
    const outcome = getModelCatalogRefreshOutcome(result);
    if (outcome === 'no-switcher') {
      setModelCatalogRefreshPromptVisible(false, `${source}:no-switcher`);
      renderAll({ allowPendingRebuild: true });
      return result;
    }
    if (outcome === 'partial') {
      setModelCatalogRefreshPromptVisible(false, `${source}:partial`);
      setModelCatalogScrapeState('ready', `${source}:partial`);
      renderAll({ allowPendingRebuild: true });
      return result;
    }
    if (outcome === 'failed') {
      setModelCatalogRefreshPromptVisible(true, `${source}:retry-prompt`);
      renderAll({ allowPendingRebuild: true });
      const msg =
        chrome.i18n?.getMessage?.('toast_modelPickerOpenChatGptTab') ||
        'Open a ChatGPT tab to pick models.';
      window.toast?.show?.(msg);
      return null;
    }
    renderAll({ allowPendingRebuild: true });
    return result;
  };

  const syncCatalogLoadingUi = () => {
    const section = querySection();
    if (!section) return;
    const overlay = ensureCatalogLoadingOverlay(section);
    const promptButton = overlay.querySelector('.mp-grid-refresh-prompt');
    if (promptButton && promptButton.dataset.wired !== '1') {
      promptButton.addEventListener('click', () => {
        void triggerManualCatalogRefresh('overlay');
      });
      promptButton.dataset.wired = '1';
    }

    const isLoading = isModelCatalogScrapeLoading();
    const isPromptVisible = isModelCatalogRefreshPromptVisible();
    const isNoSwitcherVisible = isModelCatalogNoSwitcherVisible();
    const headerButton = document.getElementById('mp-refresh-models-button');
    if (headerButton) {
      headerButton.disabled = isLoading;
      headerButton.setAttribute('aria-disabled', isLoading ? 'true' : 'false');
    }
    overlay.classList.toggle(
      'mp-grid-loading-overlay-prompt',
      (isPromptVisible || isNoSwitcherVisible) && !isLoading,
    );
    overlay.classList.toggle('mp-grid-loading-overlay-loading', isLoading);
    overlay.classList.toggle('mp-grid-loading-overlay-no-switcher', isNoSwitcherVisible && !isLoading);
    section.classList.toggle('mp-grid-no-switcher-state', isNoSwitcherVisible && !isLoading);
    if (promptButton) {
      promptButton.textContent = isNoSwitcherVisible
        ? getModelCatalogNoSwitcherPromptText()
        : getModelCatalogRefreshPromptText();
      promptButton.disabled = isLoading;
    }
    if (isLoading) {
      clearCatalogLoadingVisualTimers();
      section.classList.add('mp-grid-loading-state');
      section.setAttribute('aria-busy', 'true');
      if (!modelCatalogLoadingVisibleSince) modelCatalogLoadingVisibleSince = Date.now();
      if (overlay.dataset.visualReady === '0') {
        overlay.classList.remove('mp-grid-loading-overlay-visible');
      }
      return;
    }
    if (isPromptVisible || isNoSwitcherVisible) {
      clearCatalogLoadingVisualTimers();
      modelCatalogLoadingVisibleSince = 0;
      section.classList.add('mp-grid-loading-state');
      section.removeAttribute('aria-busy');
      overlay.dataset.visualReady = '1';
      overlay.classList.add('mp-grid-loading-overlay-visible');
      return;
    }
    if (!overlay) {
      section.classList.remove('mp-grid-loading-state');
      section.removeAttribute('aria-busy');
      modelCatalogLoadingVisibleSince = 0;
      clearCatalogLoadingVisualTimers();
      return;
    }

    if (modelCatalogLoadingHideTimer || modelCatalogLoadingRemoveTimer) return;

    const elapsed = modelCatalogLoadingVisibleSince
      ? Date.now() - modelCatalogLoadingVisibleSince
      : MODEL_SCRAPE_OVERLAY_MIN_VISIBLE_MS;
    const remaining = Math.max(0, MODEL_SCRAPE_OVERLAY_MIN_VISIBLE_MS - elapsed);

    modelCatalogLoadingHideTimer = setTimeout(() => {
      modelCatalogLoadingHideTimer = 0;
      overlay.dataset.visualReady = '0';
      overlay.classList.remove('mp-grid-loading-overlay-visible');
      modelCatalogLoadingRemoveTimer = setTimeout(() => {
        modelCatalogLoadingRemoveTimer = 0;
        if (isModelCatalogScrapeLoading() || isModelCatalogRefreshPromptVisible()) return;
        overlay.remove();
        section.classList.remove('mp-grid-loading-state');
        section.removeAttribute('aria-busy');
        modelCatalogLoadingVisibleSince = 0;
      }, MODEL_SCRAPE_OVERLAY_TRANSITION_MS);
    }, remaining);
  };

  function buildGridSection() {
    const anchor =
      document.getElementById('mp-grid-anchor') || document.querySelector('.shortcut-grid');
    if (!anchor) return;
    const insideShortcutGrid = anchor.id === 'mp-grid-anchor' && !!anchor.closest('.shortcut-grid');
    const actionGroups = getViewGroups();
    const viewSignature = getViewSignature(actionGroups);
    const existing = querySection();

    if (existing && existing.dataset.viewSignature === viewSignature) {
      attachEffortGrid(existing);
      wireManualRefreshButton();
      return existing;
    }

    Object.values(standaloneShortcutInputs).forEach((input) => {
      if (input instanceof HTMLInputElement && existing?.contains(input)) input.remove();
    });
    const effortGrid = existing?.querySelector('#mp-effort-grid') || document.getElementById('mp-effort-grid');
    if (existing) existing.remove();

    const section = document.createElement('section');
    section.id = 'model-picker-grid';
    section.setAttribute('aria-label', 'Model Shortcuts');
    section.dataset.viewSignature = viewSignature;
    section.style.cssText = insideShortcutGrid
      ? 'margin:0px 0 0px 0;grid-column:1 / -1;width:100%;'
      : 'margin:0px 0 0px 0;';

    actionGroups.forEach((group) => {
      section.appendChild(buildGroupWrapper(group));
    });

    attachEffortGrid(section, effortGrid);
    anchor.parentNode.insertBefore(section, anchor);
    if (anchor.id === 'mp-grid-anchor') anchor.style.display = 'none';
    syncCatalogLoadingUi();
    wireManualRefreshButton();
    return section;
  }

  const getCodes = (profile = getSelectedModelCatalogProfile()) => {
    const normalizedProfile = normalizeModelCatalogProfile(profile);
    const src =
      typeof window.ShortcutUtils?.getModelPickerCodesCache === 'function'
        ? window.ShortcutUtils.getModelPickerCodesCache(normalizedProfile)
        : buildDefaultModelPickerCodes({ profile: normalizedProfile });
    const raw = (Array.isArray(src) ? src : []).slice(0, MAX_SLOTS);
    while (raw.length < MAX_SLOTS) raw.push('');
    return raw;
  };
  const setCodes = (
    codes,
    cb,
    profile = getSelectedModelCatalogProfile(),
  ) => {
    const normalizedProfile = normalizeModelCatalogProfile(profile);
    const out = (codes || []).slice(0, MAX_SLOTS);
    while (out.length < MAX_SLOTS) out.push('');
    window.saveModelPickerKeyCodes(out, () => {
      renderInputs();
      cb?.();
    }, normalizedProfile);
  };
  const displayFrom = (c) =>
    window.ShortcutUtils && typeof window.ShortcutUtils.displayFromCode === 'function'
      ? window.ShortcutUtils.displayFromCode(c)
      : c || '';

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
  function syncActiveState() {
    const activeModelConfigId = getVisualActiveModelConfigId();
    document.querySelectorAll('#model-picker-grid .mp-configure-item').forEach((item) => {
      const isActive = item.getAttribute('data-action-id') === activeModelConfigId;
      item.classList.toggle('mp-configure-item-active', isActive);
      item.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  const swapPrimaryGroupWithTween = (groups, signature) => {
    const section = querySection();
    const currentPrimary = getPrimaryGroupElement();
    const nextPrimaryGroup = buildGroupWrapper(
      (groups || []).find((group) => group.id === 'primary') || {
        id: 'primary',
        actions: [],
      },
    );

    if (!(section && currentPrimary && nextPrimaryGroup)) {
      buildGridSection();
      lastViewSignature = signature;
      wireInputsAndReset();
      syncModifierText();
      syncActiveState();
      renderInputs();
      return;
    }

    syncActiveState();

    const finalize = () => {
      currentPrimary.replaceWith(nextPrimaryGroup);
      section.dataset.viewSignature = signature;
      lastViewSignature = signature;
      wireInputsAndReset();
      wireManualRefreshButton();
      syncModifierText();
      renderInputs();

      if (window.gsap?.set) {
        window.gsap.set(nextPrimaryGroup, { opacity: 0, y: 6 });
      } else {
        nextPrimaryGroup.style.opacity = '0';
      }

      if (window.gsap?.to) {
        window.gsap.to(nextPrimaryGroup, {
          opacity: 1,
          y: 0,
          duration: 0.22,
          ease: 'power2.out',
          clearProps: 'opacity,transform',
        });
      } else {
        nextPrimaryGroup.style.opacity = '1';
      }
    };

    if (window.gsap?.killTweensOf) window.gsap.killTweensOf(currentPrimary);
    if (window.gsap?.to) {
      window.gsap.to(currentPrimary, {
        opacity: 0,
        y: -6,
        duration: 0.16,
        ease: 'power2.out',
        onComplete: finalize,
      });
      return;
    }

    finalize();
  };

  function renderInputs() {
    const profile = getSelectedModelCatalogProfile();
    const codes = getCodes(profile);

    document.querySelectorAll('#model-picker-grid .mp-input').forEach((inp) => {
      const slot = Number(inp.getAttribute('data-slot') || '0');
      const item = inp.closest('.shortcut-item');
      const label = item?.querySelector('.mp-label')?.textContent?.trim() || '';
      const code = codes[slot] || '';

      // Never render NBSP for inputs; show empty when cleared
      let display = '';
      if (code && code !== '\u00A0') {
        display = displayFrom(code) || '';
      }

      inp.dataset.keyCode = code || '';
      inp.value = display; // empty string when cleared
      if (label) {
        inp.setAttribute('aria-label', `Set shortcut for ${label}`);
        inp.setAttribute('data-tooltip', `Set shortcut for\n${label}`);
      } else {
        inp.removeAttribute('aria-label');
        inp.removeAttribute('data-tooltip');
      }
    });
  }

  function renderAll({ animatePrimary = false, allowPendingRebuild = false } = {}) {
    const groups = getViewGroups();
    const signature = getViewSignature(groups);
    const pendingTarget = getPendingModelConfigTargetId();
    const needsRebuild = signature !== lastViewSignature || !querySection();
    const isLoading = isModelCatalogScrapeLoading();

    if (needsRebuild) {
      if (isLoading && querySection()) {
        syncModifierText();
        syncActiveState();
        renderInputs();
        syncCatalogLoadingUi();
        return;
      }

      if (pendingTarget && !allowPendingRebuild) {
        syncModifierText();
        syncActiveState();
        renderInputs();
        syncCatalogLoadingUi();
        return;
      }

      if (animatePrimary && querySection()) {
        swapPrimaryGroupWithTween(groups, signature);
        wireModelNameGridActions();
        return;
      }

      buildGridSection();
      lastViewSignature = signature;
      wireInputsAndReset();
      wireManualRefreshButton();
      wireModelNameGridActions();
    }
    syncModifierText();
    syncActiveState();
    renderInputs();
    wireManualRefreshButton();
    syncCatalogLoadingUi();
  }

  function assignAt(slot, code, targetLabel, viewKey) {
    const profile = getSelectedModelCatalogProfile();
    const selfOwner = { type: 'model', profile, idx: slot, modifier: mpModeCache };
    const conflicts = window.ShortcutUtils.buildConflictsForCode?.(code, selfOwner) || [];

    const proceed = () =>
      window.ShortcutUtils.clearOwners?.(conflicts, () => {
        const codes = getCodes(profile);
        codes[slot] = code;
        setCodes(codes, () => {
          // Toast on save
          window.toast.show('Options saved. Reload page to apply changes.');
          focusNext(viewKey);
        }, profile);
      });

    if (!conflicts.length || window.prefs?.autoOverwrite) return proceed();

    const keyLabel = displayFrom(code);
    const toLabel = targetLabel || `Model slot ${slot + 1}`;

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
        const lines = conflicts.map((c) => {
          let k = '';
          if (c.type === 'shortcut') {
            const el = document.getElementById(c.id);
            k = el?.value?.trim() || '?';
          } else if (c.type === 'model') {
            const cur =
              window.ShortcutUtils.getModelPickerCodesCache(c.profile || profile)[c.idx];
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

  function focusNext(fromViewKey) {
    const inputs = queryVisibleInputs();
    if (!inputs.length) return;
    const idx = inputs.findIndex((input) => input.getAttribute('data-view-key') === fromViewKey);
    const nextIdx = idx === -1 ? 0 : Math.min(inputs.length - 1, idx + 1);
    inputs[nextIdx]?.focus();
  }

  function clearAt(slot) {
    const profile = getSelectedModelCatalogProfile();
    const codes = getCodes(profile);
    codes[slot] = '';
    setCodes(codes, () => {
      // Toast on clear
      window.toast.show('Shortcut cleared. Reload page to apply changes.');
    }, profile);
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

  // Normalize a few legacy/edge cases and provide a fallback when e.code is missing/unidentified
  function normalizeCode(e) {
    const code = e.code && e.code !== 'Unidentified' ? e.code : keyToCode(e.key);

    // Map legacy/alias forms
    switch (code) {
      case 'OSLeft':
        return 'MetaLeft';
      case 'OSRight':
        return 'MetaRight';
      case 'Spacebar':
        return 'Space';
      case 'Left':
        return 'ArrowLeft';
      case 'Right':
        return 'ArrowRight';
      case 'Up':
        return 'ArrowUp';
      case 'Down':
        return 'ArrowDown';
      case 'Del':
        return 'Delete';
      case 'Esc':
        return 'Escape';
      default:
        return code || 'Unidentified';
    }
  }

  // Fallback from key -> code for older/odd browsers (best‑effort common cases)
  function keyToCode(key) {
    switch (key) {
      case ' ':
      case 'Spacebar':
        return 'Space';
      case 'Esc':
        return 'Escape';
      case 'Del':
        return 'Delete';
      case 'Left':
        return 'ArrowLeft';
      case 'Right':
        return 'ArrowRight';
      case 'Up':
        return 'ArrowUp';
      case 'Down':
        return 'ArrowDown';
      default:
        return key || '';
    }
  }

  function onKeyDown(e) {
    const inp = e.currentTarget;
    const slot = Number(inp.getAttribute('data-slot') || '0');
    const viewKey = inp.getAttribute('data-view-key') || '';
    const targetLabel = inp.closest('.shortcut-item')?.querySelector('.mp-label')?.textContent?.trim() || '';

    // Treat Tab/Enter as navigation only – never assign them as shortcuts
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const dir = e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : 1; // Enter => forward
      const inputs = queryVisibleInputs();
      const currentIdx = inputs.indexOf(inp);
      const maxIdx = Math.max(0, inputs.length - 1);
      let next = currentIdx + dir;
      if (next < 0) next = maxIdx;
      if (next > maxIdx) next = 0;
      const nextEl = inputs[next];
      if (nextEl) nextEl.focus();
      return;
    }

    // Ignore pure modifier-only presses or auto-repeat holds
    const c = e.code || '';
    if (
      /^(Shift|Alt|Control|Meta|OS|Fn)(Left|Right)?$/.test(c) ||
      e.key === 'AltGraph' ||
      e.repeat
    ) {
      return;
    }

    // Capture everything else (Arrow*, Home/End/Page*, Insert, PrintScreen, etc.)
    e.preventDefault();
    e.stopPropagation();

    // Avoid input-flicker
    inp.dataset.justHandled = '1';
    setTimeout(() => {
      inp.dataset.justHandled = '';
    }, 60);

    const code = normalizeCode(e);

    if (code === 'Escape') {
      const current = inp.dataset.keyCode || '';
      inp.value = current ? displayFrom(current) : '';
      return;
    }
    if (code === 'Backspace' || code === 'Delete') {
      return clearAt(slot);
    }

    assignAt(slot, code, targetLabel, viewKey);
  }

  function selectInputText(el) {
    if (!el) return;
    const run = () => {
      try {
        el.select();
      } catch (_) {}
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  }

  function wireInputsAndReset() {
    document.querySelectorAll('#model-picker-grid .mp-input').forEach((inp) => {
      if (inp.dataset.wired) return;
      inp.dataset.wired = '1';

      inp.addEventListener('focus', () => selectInputText(inp));
      inp.addEventListener('keydown', onKeyDown, true);

      // Support typed labels/paste like your 111 wiring
      inp.addEventListener('input', (e) => {
        const el = e.currentTarget;
        const slot = Number(el.getAttribute('data-slot') || '0');
        const viewKey = el.getAttribute('data-view-key') || '';
        const targetLabel =
          el.closest('.shortcut-item')?.querySelector('.mp-label')?.textContent?.trim() || '';

        // If keydown just handled it, restore current pretty text and ignore
        if (el.dataset.justHandled === '1') {
          const cur = el.dataset.keyCode || '';
          el.value = cur ? displayFrom(cur) : '';
          el.dataset.justHandled = '';
          return;
        }
        const raw = (el.value || '').trim();
        if (!raw) return clearAt(slot);

        const code = parseInputToCode(raw);
        if (!code) {
          const cur = el.dataset.keyCode || '';
          el.value = cur ? displayFrom(cur) : '';
          // Toast on unsupported
          window.toast.show('Unsupported key. Press a key or enter a valid shortcut label.');
          return;
        }
        assignAt(slot, code, targetLabel, viewKey);
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
        const profile = getSelectedModelCatalogProfile();
        const defaults = buildDefaultModelPickerCodes({ profile }).slice(0, MAX_SLOTS);
        window.saveModelPickerKeyCodes(defaults, () => {
          // Toast on reset
          window.toast.show('Model keys reset to defaults.');
          renderInputs();
        }, profile);
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

  function wireModelNameGridActions() {
    document.querySelectorAll('#model-picker-grid .mp-configure-item').forEach((item) => {
      if (item.dataset.actionWired === '1') return;
      item.dataset.actionWired = '1';

      const trigger = async () => {
        if (isModelCatalogScrapeLoading()) return;
        const actionId = item.getAttribute('data-action-id') || '';
        if (!actionId) return;
        if (normalizeActiveModelConfigId(actionId) === getVisualActiveModelConfigId()) return;
        const nextActionId = normalizeActiveModelConfigId(actionId);
        clearPendingVisualSettle();
        clearPendingModelConfigTarget();
        setActiveModelConfigIdCache(nextActionId, 'popup:model-name-click');
        renderAll({ animatePrimary: true, allowPendingRebuild: true });
        try {
          chrome.storage.sync.set({ activeModelConfigId: nextActionId });
        } catch {}
      };

      item.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('.mp-input')) return;
        void trigger();
      });
      item.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.target instanceof Element && event.target.closest('.mp-input')) return;
        event.preventDefault();
        void trigger();
      });
    });
  }

  function wireReactivity() {
    document.addEventListener('modelPickerHydrated', renderAll);
    document.addEventListener('modelPickerActiveConfigChanged', renderAll);
    window.addEventListener('model-names-updated', renderAll);
    window.addEventListener('model-catalog-updated', renderAll);
    window.addEventListener('model-catalog-profile-updated', renderAll);
    window.addEventListener('model-catalog-scrape-state-changed', renderAll);
    window.addEventListener('model-catalog-refresh-prompt-changed', renderAll);

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
      [
        MODEL_CATALOG_PROFILE_LATEST,
        MODEL_CATALOG_PROFILE_LEGACY,
      ].forEach((profile) => {
        const storageKey = MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE[profile];
        if (!changes[storageKey]) return;
        window.__setModelPickerCodesCache?.(profile, changes[storageKey].newValue);
      });
      if (
        changes[MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE[MODEL_CATALOG_PROFILE_LATEST]] ||
        changes[MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE[MODEL_CATALOG_PROFILE_LEGACY]]
      ) {
        renderInputs();
      }
      if (changes.activeModelConfigId) {
        const changedValue = normalizeActiveModelConfigId(changes.activeModelConfigId.newValue);
        if (getPendingModelConfigTargetId() && changedValue === getPendingModelConfigTargetId()) {
          schedulePendingModelConfigSettle(changedValue);
        }
        renderAll();
      }
      if (changes.useControlForModelSwitcherRadio || changes.useAltForModelSwitcherRadio) {
        mpModeCache = changes.useControlForModelSwitcherRadio?.newValue ? 'ctrl' : 'alt';
        syncModifierText();
      }
    });
  }

  function wireManualRefreshButton() {
    const button = document.getElementById('mp-refresh-models-button');
    if (!button || button.dataset.wired === '1') return;
    button.dataset.wired = '1';
    button.setAttribute('data-tooltip', getModelCatalogRefreshTooltipText());
    button.setAttribute('aria-label', getModelCatalogGridRefreshAriaLabel());
    const label = button.querySelector('.mp-refresh-models-button-label') || button;
    label.textContent = getModelCatalogGridRefreshButtonText();
    wireRefreshButtonTooltip(button);
    button.addEventListener('click', () => {
      void triggerManualCatalogRefresh('header-button');
    });
  }

  const primeManualCatalogRefreshPrompt = () => {
    try {
      chrome.storage.sync.get([MODEL_CATALOG_REFRESH_PROMPT_WEEK_KEY], (stored) => {
        const currentWeek = getCurrentWeekKey();
        const seenWeek = String(stored?.[MODEL_CATALOG_REFRESH_PROMPT_WEEK_KEY] || '').trim();
        const shouldPrompt = seenWeek !== currentWeek;
        setModelCatalogRefreshPromptVisible(shouldPrompt, 'popup:weekly-check');
        if (shouldPrompt) {
          chrome.storage.sync.set({ [MODEL_CATALOG_REFRESH_PROMPT_WEEK_KEY]: currentWeek });
        }
        renderAll({ allowPendingRebuild: true });
      });
    } catch {
      setModelCatalogRefreshPromptVisible(true, 'popup:weekly-check:fallback');
      renderAll({ allowPendingRebuild: true });
    }
  };

  onReady(() =>
    waitForDeps(() => {
      buildGridSection();
      initModelModeFromStorage(); // ← initialize mode cache from storage
      wireInputsAndReset();
      wireModelNameGridActions();
      wireReactivity();
      wireManualRefreshButton();
      // Render after codes hydrate so names/codes are aligned on first paint
      if (window.__modelPickerHydrating?.then) {
        window.__modelPickerHydrating.then(() => {
          renderAll();
          primeManualCatalogRefreshPrompt();
        });
      } else {
        renderAll();
        primeManualCatalogRefreshPrompt();
      }
    }),
  );

  // Expose renderer for external triggers
  window.modelPickerInputsRender = renderAll;
})();

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
      if (el.dataset.filterLocked === '1') {
        el.style.display = 'none';
        return;
      }
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

// Segmented Controls JS
(() => {
  function initModelSwitcherToggle() {
    const segmentedControl = document.getElementById('mp-model-switcher-modifier-selector');
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

  // Request optional permissions ONLY from the popup (user gesture).
  const contains = (o) => new Promise((r) => chrome.permissions.contains(o, r));
  const request = (o) => new Promise((r) => chrome.permissions.request(o, r));
  // Only request 'identity' — do NOT request 'identity.email' unless user explicitly opts in.
  const ensureIdentity = async () => {
    const id = { permissions: ['identity'] };
    if (!(await contains(id))) {
      const ok = await request(id); // must run inside the click handler call stack
      if (!ok) return false;
    }
    return true;
  };
  // Drive access uses bearer tokens; 'identity' is sufficient for OAuth.
  const ensureDriveAuth = async () => ensureIdentity();

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
      res?.profile ? renderUI('in', res.profile.email) : renderUI('out');
    } catch {
      renderUI('out');
    }
  }

  (async () => {
    await domReady();
    renderUI('out');
    await hydrateAuth();

    const { btnLogin, btnSave, btnRestore, btnLogout } = els();

    // Login// Login (requests 'identity' and forces chooser via launchWebAuthFlow)
    if (btnLogin && !btnLogin.dataset.wired) {
      btnLogin.dataset.wired = '1';
      const label = btnLogin.querySelector('.gsi-material-button-contents');
      btnLogin.addEventListener('click', async () => {
        btnLogin.disabled = true;
        if (label) label.textContent = 'Logging in…';
        try {
          const granted = await ensureIdentity();
          if (!granted) {
            setStatus('Permission required to sign in.', 'error');
            return;
          }
          const { profile } = await window.CloudAuth.googleLogin();
          renderUI('in', profile?.email);
        } catch {
          setStatus(chrome.i18n.getMessage('status_signin_failed') || 'Sign-in failed.', 'error');
        } finally {
          btnLogin.disabled = false;
          if (label) label.textContent = 'Continue with Google';
        }
      });
    }

    // Save to Cloud (single permission bubble: identity + googleapis)
    if (btnSave && !btnSave.dataset.wired) {
      btnSave.dataset.wired = '1';
      btnSave.addEventListener('click', async () => {
        const store = window.CloudStorage;
        if (!store)
          return setStatus(
            chrome.i18n.getMessage('status_sync_unavailable') || 'Cloud sync unavailable.',
            'error',
          );

        const granted = await ensureDriveAuth();
        if (!granted) {
          setStatus('Permission required to save to cloud.', 'error');
          return;
        }

        window.busy?.(btnSave, true);
        try {
          setStatus(chrome.i18n.getMessage('status_saving') || 'Saving…');
          const local = await store.loadLocalSettings();
          await store.saveSyncedSettings(local);
          window.successFlash?.(btnSave);
          setStatus(chrome.i18n.getMessage('status_saved') || 'Saved to cloud.', 'success');
        } catch (e) {
          console.error(e);
          setStatus(
            e?.message || chrome.i18n.getMessage('status_save_failed') || 'Save failed.',
            'error',
          );
        } finally {
          window.busy?.(btnSave, false);
        }
      });
    }

    // Restore from Cloud (requests perms just-in-time)
    if (btnRestore && !btnRestore.dataset.wired) {
      btnRestore.dataset.wired = '1';

      const rehydrateSettingsUI = async (settings) => {
        try {
          if (typeof window.refreshShortcutInputsFromStorage === 'function') {
            try {
              window.refreshShortcutInputsFromStorage();
            } catch (_) {}
          }
          const sep_storageToUI = window.sep_storageToUI || ((s) => s);
          const reflectOption = (key, val) => {
            const el = document.getElementById(key);
            if (!el) return;
            if (el.type === 'checkbox' || el.type === 'radio') {
              el.checked = !!val;
              return;
            }
            if (typeof val === 'string' || typeof val === 'number')
              el.value = key === 'copyCodeUserSeparator' ? sep_storageToUI(val) : val;
          };
          Object.keys(settings || {}).forEach((k) => {
            if (!/^shortcutKey/.test(k)) reflectOption(k, settings[k]);
          });
          const latestKey =
            MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE[MODEL_CATALOG_PROFILE_LATEST];
          const legacyKey =
            MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE[MODEL_CATALOG_PROFILE_LEGACY];
          const sharedCodes = Array.isArray(settings?.modelPickerKeyCodes)
            ? settings.modelPickerKeyCodes
            : null;
          const hasModelPickerCodes =
            Array.isArray(settings?.[latestKey]) ||
            Array.isArray(settings?.[legacyKey]) ||
            !!sharedCodes;
          if (hasModelPickerCodes) {
            try {
              const getGroups = (profile) =>
                getPopupModelPresentationGroups(
                  DEFAULT_ACTIVE_MODEL_CONFIG_ID,
                  window.__modelNamesProfiles?.[profile] ||
                    getDefaultModelNamesForProfile(profile),
                  window.__modelCatalogProfiles?.[profile] ||
                    getDefaultModelCatalogForProfile(profile),
                );
              const migrateShared =
                sharedCodes &&
                typeof window.ModelLabels?.migrateSharedKeyCodesToProfiles === 'function'
                  ? window.ModelLabels.migrateSharedKeyCodesToProfiles({
                      codes: sharedCodes,
                      latestGroups: getGroups(MODEL_CATALOG_PROFILE_LATEST),
                      legacyGroups: getGroups(MODEL_CATALOG_PROFILE_LEGACY),
                    })
                  : null;
              const normalizeProfile = (profile, codes) => {
                const padded = Array.isArray(codes)
                  ? codes.slice(0, MODEL_PICKER_MAX_SLOTS)
                  : buildDefaultModelPickerCodes({ profile });
                while (padded.length < MODEL_PICKER_MAX_SLOTS) padded.push('');
                return typeof window.ModelLabels?.normalizeProfileKeyCodes === 'function'
                  ? window.ModelLabels.normalizeProfileKeyCodes(padded, getGroups(profile))
                  : padded;
              };
              const latest = normalizeProfile(
                MODEL_CATALOG_PROFILE_LATEST,
                settings?.[latestKey] || migrateShared?.[MODEL_CATALOG_PROFILE_LATEST],
              );
              const legacy = normalizeProfile(
                MODEL_CATALOG_PROFILE_LEGACY,
                settings?.[legacyKey] || migrateShared?.[MODEL_CATALOG_PROFILE_LEGACY],
              );
              window.__setModelPickerCodesCache?.(MODEL_CATALOG_PROFILE_LATEST, latest);
              window.__setModelPickerCodesCache?.(MODEL_CATALOG_PROFILE_LEGACY, legacy);
              chrome.storage.sync.set({
                [latestKey]: latest,
                [legacyKey]: legacy,
                [MODEL_PICKER_KEY_CODE_PROFILES_VERSION_KEY]:
                  MODEL_PICKER_KEY_CODE_PROFILES_VERSION,
              });
              document.dispatchEvent(new CustomEvent('modelPickerHydrated'));
              if (typeof window.modelPickerRender === 'function') window.modelPickerRender();
              if (typeof window.modelPickerInputsRender === 'function')
                window.modelPickerInputsRender();
            } catch (_) {}
          }
          if (typeof settings?.activeModelConfigId === 'string') {
            setActiveModelConfigIdCache(settings.activeModelConfigId, 'cloud-restore');
          }
          if (Array.isArray(settings?.modelNames) && settings.modelNames.length >= 5) {
            window.MODEL_NAMES = resolveModelActionableNames(settings.modelNames).slice(
              0,
              MODEL_PICKER_MAX_SLOTS,
            );
            if (typeof window.modelPickerRender === 'function') {
              try {
                window.modelPickerRender();
              } catch (_) {}
            }
            window.dispatchEvent(
              new CustomEvent('model-names-updated', { detail: { source: 'cloud-restore' } }),
            );
          }
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
        if (!store)
          return setStatus(
            chrome.i18n.getMessage('status_restore_unavailable') || 'Cloud restore unavailable.',
            'error',
          );

        // One combined prompt for identity + googleapis
        const granted = await ensureDriveAuth();
        if (!granted) {
          setStatus('Permission required to restore from cloud.', 'error');
          return;
        }

        window.busy?.(btnRestore, true);
        try {
          setStatus(chrome.i18n.getMessage('status_restoring') || 'Restoring…');
          const remote = await store.loadSyncedSettings();
          if (!remote || Object.keys(remote).length === 0) {
            setStatus(chrome.i18n.getMessage('status_no_backup') || 'No backup found.', 'error');
            return;
          }
          await store.saveLocalSettings(remote);
          await rehydrateSettingsUI(remote);
          setStatus(chrome.i18n.getMessage('status_restored') || 'Restored.', 'success');
        } catch (e) {
          console.error(e);
          setStatus(
            e?.message || chrome.i18n.getMessage('status_restore_failed') || 'Restore failed.',
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

  // If popup remains open through login, refresh UI on success
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'cloudAuth.loggedIn') {
      try {
        (async () => {
          await hydrateAuth();
        })();
      } catch (_) {}
    }
  });
})();

/* Sync Settings Button js IIFE */
(() => {
  const getIcon = (btn) =>
    btn.querySelector('.msr, .material-icons-outlined, .material-symbols-outlined');

  const busy = (btn, isBusy) => {
    if (!btn) return;
    const icon = getIcon(btn);
    if (isBusy) {
      if (icon) {
        btn.dataset.prevIconText = icon.textContent || '';
        btn.dataset.prevIconClass = icon.className || 'msr';
        btn.dataset.prevIconAriaHidden = icon.getAttribute('aria-hidden') || '';
        btn.dataset.prevIconDefault = icon.getAttribute('data-default-icon') || '';
        const sp = document.createElement('span');
        sp.className = 'spinner';
        sp.setAttribute('aria-hidden', 'true');
        icon.replaceWith(sp);
      }
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
    } else {
      const sp = btn.querySelector('.spinner');
      if (sp) {
        const restoredIcon = document.createElement('span');
        restoredIcon.className = btn.dataset.prevIconClass || 'msr';
        restoredIcon.textContent =
          btn.dataset.prevIconText || btn.dataset.prevIconDefault || 'check_circle';
        if (btn.dataset.prevIconAriaHidden) {
          restoredIcon.setAttribute('aria-hidden', btn.dataset.prevIconAriaHidden);
        }
        if (btn.dataset.prevIconDefault) {
          restoredIcon.setAttribute('data-default-icon', btn.dataset.prevIconDefault);
        }
        sp.replaceWith(restoredIcon);
      }
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
    }
  };

  const successFlash = (btn) => {
    const icon = getIcon(btn);
    if (!icon) return;
    const prev = icon.textContent;
    if (!prev) return;
    icon.textContent = 'check_circle';
    setTimeout(() => {
      if (icon.isConnected) icon.textContent = prev;
    }, 1200);
  };

  window.busy = busy;
  window.successFlash = successFlash;
})();
