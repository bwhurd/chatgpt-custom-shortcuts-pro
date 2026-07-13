(() => {
  if (globalThis.CSPUsageAnalytics) return;

  const ANALYTICS_APP_KEY = 'A-SH-7581694567';
  const ANALYTICS_HOST = 'https://cgcsp.chordstash.com';
  const STORE_KEY = 'csp_usage_analytics_v1';
  const SCHEMA_VERSION = 1;
  const FLUSH_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const RETENTION_DAYS = 7;

  const SHORTCUT_DEFAULTS = Object.freeze({
    shortcutKeyScrollUpOneMessage: 'a',
    shortcutKeyScrollDownOneMessage: 'f',
    shortcutKeyScrollUpTwoMessages: 'ArrowUp',
    shortcutKeyScrollDownTwoMessages: 'ArrowDown',
    shortcutKeyScrollToTop: 't',
    shortcutKeyClickNativeScrollToBottom: 'z',
    shortcutKeyToggleModelSelector: '/',
    shortcutKeyCopyLowest: 'c',
    selectThenCopy: 'x',
    shortcutKeyNewConversation: 'n',
    shortcutKeyActivateInput: 'w',
    shortcutKeyToggleSidebar: 's',
    shortcutKeyPreviousThread: 'j',
    shortcutKeyNextThread: ';',
    shortcutKeyEdit: 'e',
    shortcutKeySendEdit: 'd',
    shortcutKeySearchConversationHistory: ',',
    shortcutKeyShowOverlay: '.',
    shortcutKeyToggleCodeboxWrap: '',
    shortcutKeyTemporaryChat: 'p',
    shortcutKeyToggleDictate: 'y',
    shortcutKeyCancelDictation: '',
    shortcutKeyShare: '',
    shortcutKeySearchWeb: 'q',
    shortcutKeyStudy: '',
    shortcutKeyCreateImage: '',
    shortcutKeyToggleCanvas: '',
    shortcutKeyDeepResearch: '',
    shortcutKeyAddPhotosFiles: '',
    shortcutKeyThinkLonger: '',
    shortcutKeyCopyAllCodeBlocks: ']',
    altPageUp: 'PageUp',
    altPageDown: 'PageDown',
    shortcutKeyRegenerateTryAgain: 'r',
    shortcutKeyRegenerateMoreConcise: '',
    shortcutKeyRegenerateAddDetails: '',
    shortcutKeyRegenerateWithDifferentModel: '',
    shortcutKeyRegenerateAskToChangeResponse: '',
    shortcutKeyMoreDotsReadAloud: '',
    shortcutKeyMoreDotsBranchInNewChat: '',
    shortcutKeyThinkingExtended: '',
    shortcutKeyThinkingStandard: '',
    shortcutKeyThinkingLight: '',
    shortcutKeyThinkingHeavy: '',
    shortcutKeyProStandard: '',
    shortcutKeyProExtended: '',
    shortcutKeyNewGptConversation: '',
    selectThenCopyAllMessages: '[',
    shortcutKeyClickSendButton: 'Enter',
    shortcutKeyClickStopButton: 'Backspace',
  });
  const MODEL_PICKER_DEFAULT_KEY_CODES = Object.freeze([
    'Digit1',
    'Digit2',
    'Digit0',
    'Digit3',
    'Digit4',
    'Digit5',
    'Digit6',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
  const MODEL_SLOT_ACTION_IDS = Object.freeze(
    Array.from({ length: 15 }, (_value, index) => `modelPickerSlot:${index + 1}`),
  );
  const SHORTCUT_ACTION_IDS = Object.freeze([
    ...Object.keys(SHORTCUT_DEFAULTS),
    ...MODEL_SLOT_ACTION_IDS,
  ]);
  const SHORTCUT_ACTION_ID_SET = new Set(SHORTCUT_ACTION_IDS);
  const SHORTCUT_GROUPS = Object.freeze({
    copy: [
      'shortcutKeyCopyLowest',
      'selectThenCopy',
      'selectThenCopyAllMessages',
      'shortcutKeyCopyAllCodeBlocks',
    ],
    scroll: [
      'shortcutKeyScrollUpOneMessage',
      'shortcutKeyScrollDownOneMessage',
      'shortcutKeyScrollUpTwoMessages',
      'shortcutKeyScrollDownTwoMessages',
      'shortcutKeyScrollToTop',
      'shortcutKeyClickNativeScrollToBottom',
      'altPageUp',
      'altPageDown',
    ],
    composer: [
      'shortcutKeyActivateInput',
      'shortcutKeyClickSendButton',
      'shortcutKeyClickStopButton',
      'shortcutKeyEdit',
      'shortcutKeySendEdit',
      'shortcutKeyAddPhotosFiles',
      'shortcutKeyToggleDictate',
      'shortcutKeyCancelDictation',
    ],
    navigation: [
      'shortcutKeyNewConversation',
      'shortcutKeySearchConversationHistory',
      'shortcutKeyToggleSidebar',
      'shortcutKeyPreviousThread',
      'shortcutKeyNextThread',
      'shortcutKeyTemporaryChat',
      'shortcutKeyShare',
      'shortcutKeyShowOverlay',
    ],
    model_picker: ['shortcutKeyToggleModelSelector', ...MODEL_SLOT_ACTION_IDS],
    regenerate: [
      'shortcutKeyRegenerateTryAgain',
      'shortcutKeyRegenerateMoreConcise',
      'shortcutKeyRegenerateAddDetails',
      'shortcutKeyRegenerateWithDifferentModel',
      'shortcutKeyRegenerateAskToChangeResponse',
      'shortcutKeyMoreDotsReadAloud',
      'shortcutKeyMoreDotsBranchInNewChat',
    ],
    thinking: [
      'shortcutKeyThinkingExtended',
      'shortcutKeyThinkingStandard',
      'shortcutKeyThinkingLight',
      'shortcutKeyThinkingHeavy',
      'shortcutKeyProStandard',
      'shortcutKeyProExtended',
      'shortcutKeyThinkLonger',
    ],
  });
  const TOGGLE_DEFAULTS = Object.freeze({
    pageUpDownTakeover: true,
    moveTopBarToBottomCheckbox: false,
    removeMarkdownOnCopyCheckbox: true,
    clickToCopyInlineCodeEnabled: false,
    hidePastedLibraryFilesEnabled: false,
    colorBoldTextEnabled: false,
    showLegacyArrowButtonsCheckbox: false,
    fadeSlimSidebarEnabled: false,
    enableSendWithControlEnterCheckbox: true,
    enableStopWithControlBackspaceCheckbox: true,
    disableCopyAfterSelectCheckbox: false,
    doNotIncludeLabelsCheckbox: false,
    selectThenCopyAllMessagesBothUserAndChatGpt: true,
    selectThenCopyAllMessagesOnlyAssistant: false,
    selectThenCopyAllMessagesOnlyUser: false,
    useAltForModelSwitcherRadio: true,
    useControlForModelSwitcherRadio: false,
  });

  let providerReady = false;
  let providerInitPromise = null;

  const hasChromeStorage = () =>
    !!globalThis.chrome?.storage?.local && !!globalThis.chrome?.storage?.sync;
  const appKeyParts = () => String(ANALYTICS_APP_KEY || '').split('-');
  const appKeyRegion = () => appKeyParts()[1] || '';
  const hasValidAppKey = () => {
    const parts = appKeyParts();
    return parts.length === 3 && parts[0] === 'A' && ['EU', 'US', 'SH'].includes(parts[1]);
  };
  const normalizedAnalyticsHost = () => String(ANALYTICS_HOST || '').replace(/\/+$/, '');
  const hasConfiguredProvider = () =>
    hasValidAppKey() &&
    (appKeyRegion() !== 'SH' || /^https:\/\/[a-z0-9.-]+$/i.test(normalizedAnalyticsHost()));
  const storageGet = (area, defaults) =>
    new Promise((resolve) => {
      area.get(defaults, (items) => resolve(items || { ...defaults }));
    });
  const storageSet = (area, value) =>
    new Promise((resolve) => {
      area.set(value, () => resolve());
    });
  const dayKey = (time = Date.now()) => new Date(time).toISOString().slice(0, 10);
  const slug = (value) =>
    String(value || '')
      .replace(/^shortcutKey/, '')
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
  const shortHash = (value) => {
    let hash = 0;
    String(value || '')
      .split('')
      .forEach((char) => {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
      });
    return hash.toString(36).slice(0, 4).padStart(4, '0');
  };
  const metricSlug = (value) =>
    slug(value)
      .replace(/_checkbox$/, '')
      .replace(/_enabled$/, '')
      .replace(/_radio$/, '')
      .replace(/^key_/, '');
  const metricKey = (prefix, value) => {
    const safePrefix =
      String(prefix || 'm')
        .replace(/[^a-z0-9]+/gi, '')
        .slice(0, 4) || 'm';
    const body = metricSlug(value) || 'unknown';
    const maxBodyLength = Math.max(1, 40 - safePrefix.length - 1);
    const safeBody =
      body.length <= maxBodyLength
        ? body
        : `${body.slice(0, Math.max(1, maxBodyLength - 5))}_${shortHash(body)}`;
    return `${safePrefix}_${safeBody}`;
  };
  const countBucket = (count) => {
    if (!count) return '0';
    if (count === 1) return '1';
    if (count <= 5) return '2_5';
    if (count <= 20) return '6_20';
    if (count <= 100) return '21_100';
    return '101_plus';
  };
  const blankShortcut = (value) =>
    value === undefined || value === null || String(value).trim() === '';
  const extensionVersion = () => globalThis.chrome?.runtime?.getManifest?.()?.version || '';
  const groupForAction = (actionId) => {
    const match = Object.entries(SHORTCUT_GROUPS).find(([, actionIds]) =>
      actionIds.includes(actionId),
    );
    return match?.[0] || 'other';
  };

  function emptyStore() {
    return {
      schemaVersion: SCHEMA_VERSION,
      buckets: {},
      lastFlushAttemptAt: 0,
      lastFlushAt: 0,
      lastFlushDay: '',
    };
  }

  function normalizeStore(raw) {
    const store = raw && typeof raw === 'object' ? raw : emptyStore();
    const buckets = store.buckets && typeof store.buckets === 'object' ? store.buckets : {};
    return {
      schemaVersion: SCHEMA_VERSION,
      buckets,
      lastFlushAttemptAt: Number(store.lastFlushAttemptAt || 0),
      lastFlushAt: Number(store.lastFlushAt || 0),
      lastFlushDay: typeof store.lastFlushDay === 'string' ? store.lastFlushDay : '',
    };
  }

  function pruneStore(store) {
    const cutoff = dayKey(Date.now() - (RETENTION_DAYS - 1) * FLUSH_INTERVAL_MS);
    Object.keys(store.buckets || {}).forEach((key) => {
      if (key < cutoff) delete store.buckets[key];
    });
    return store;
  }

  async function readStore() {
    if (!hasChromeStorage()) return emptyStore();
    const result = await storageGet(globalThis.chrome.storage.local, { [STORE_KEY]: emptyStore() });
    return pruneStore(normalizeStore(result[STORE_KEY]));
  }

  async function writeStore(store) {
    if (!hasChromeStorage()) return;
    await storageSet(globalThis.chrome.storage.local, { [STORE_KEY]: pruneStore(store) });
  }

  async function initProvider() {
    if (!hasConfiguredProvider() || !globalThis.aptabase?.init) return false;
    if (providerInitPromise) return providerInitPromise;

    providerInitPromise = (async () => {
      try {
        const manifest = globalThis.chrome?.runtime?.getManifest?.() || {};
        const installInfo = globalThis.chrome?.management?.getSelf
          ? await globalThis.chrome.management.getSelf()
          : null;
        await globalThis.aptabase.init(ANALYTICS_APP_KEY, {
          appVersion: manifest.version || '',
          host: normalizedAnalyticsHost(),
          isDebug: installInfo?.installType === 'development',
        });
        providerReady = true;
        return true;
      } catch (error) {
        console.warn('[CSP] Anonymous usage analytics provider failed to initialize.', error);
        providerReady = false;
        return false;
      }
    })();

    return providerInitPromise;
  }

  function collectUsageTotals(store) {
    const totals = Object.create(null);
    let totalShortcutUses = 0;
    let daysObserved = 0;

    Object.keys(store.buckets || {})
      .sort()
      .slice(-RETENTION_DAYS)
      .forEach((bucketDay) => {
        const bucket = store.buckets[bucketDay] || {};
        const shortcuts = bucket.shortcuts || {};
        const dayTotal = Number(bucket.totalShortcutUses || 0);
        if (dayTotal > 0 || Object.keys(shortcuts).length > 0) daysObserved += 1;
        Object.entries(shortcuts).forEach(([actionId, count]) => {
          if (!SHORTCUT_ACTION_ID_SET.has(actionId)) return;
          const safeCount = Number(count || 0);
          totals[actionId] = (totals[actionId] || 0) + safeCount;
          totalShortcutUses += safeCount;
        });
      });

    return { totals, totalShortcutUses, daysObserved };
  }

  function summarizeUsage(store, reason) {
    const { totals, totalShortcutUses, daysObserved } = collectUsageTotals(store);
    const props = {
      schema_version: SCHEMA_VERSION,
      extension_version: extensionVersion(),
      reason: String(reason || 'scheduled').slice(0, 32),
      days_observed_7d: daysObserved,
      distinct_shortcuts_used_7d: Object.keys(totals).filter((actionId) => totals[actionId] > 0)
        .length,
      total_shortcut_uses_7d_bucket: countBucket(totalShortcutUses),
    };

    Object.entries(SHORTCUT_GROUPS).forEach(([groupName, actionIds]) => {
      const groupCount = actionIds.reduce(
        (sum, actionId) => sum + Number(totals[actionId] || 0),
        0,
      );
      props[`used_${groupName}_7d`] = groupCount > 0;
      props[`use_bucket_${groupName}_7d`] = countBucket(groupCount);
    });

    SHORTCUT_ACTION_IDS.forEach((actionId) => {
      const count = totals[actionId] || 0;
      props[metricKey('u', actionId)] = count > 0;
      props[metricKey('ub', actionId)] = countBucket(count);
    });

    return props;
  }

  async function summarizeSettings(reason) {
    const defaults = {
      ...TOGGLE_DEFAULTS,
      ...SHORTCUT_DEFAULTS,
      modelPickerKeyCodes: [...MODEL_PICKER_DEFAULT_KEY_CODES],
    };
    const settings = hasChromeStorage()
      ? await storageGet(globalThis.chrome.storage.sync, defaults)
      : { ...defaults };
    const props = {
      schema_version: SCHEMA_VERSION,
      extension_version: extensionVersion(),
      reason: String(reason || 'scheduled').slice(0, 32),
    };
    let blankShortcutCount = 0;
    let defaultShortcutCount = 0;
    let customShortcutCount = 0;

    Object.keys(TOGGLE_DEFAULTS).forEach((key) => {
      props[metricKey('t', key)] = settings[key] !== false;
    });

    Object.entries(SHORTCUT_DEFAULTS).forEach(([key, defaultValue]) => {
      const value = settings[key];
      let state = 'custom';
      if (blankShortcut(value)) {
        state = 'blank';
        blankShortcutCount += 1;
      } else if (String(value) === String(defaultValue)) {
        state = 'default';
        defaultShortcutCount += 1;
      } else {
        customShortcutCount += 1;
      }
      props[metricKey('s', key)] = state;
    });

    const modelPickerCodes = Array.isArray(settings.modelPickerKeyCodes)
      ? settings.modelPickerKeyCodes
      : MODEL_PICKER_DEFAULT_KEY_CODES;
    MODEL_PICKER_DEFAULT_KEY_CODES.forEach((defaultValue, index) => {
      const value = modelPickerCodes[index];
      let state = 'custom';
      if (blankShortcut(value)) {
        state = 'blank';
        blankShortcutCount += 1;
      } else if (String(value) === String(defaultValue)) {
        state = 'default';
        defaultShortcutCount += 1;
      } else {
        customShortcutCount += 1;
      }
      props[metricKey('s', `model_slot_${index + 1}`)] = state;
    });

    props.blank_shortcut_count = blankShortcutCount;
    props.default_shortcut_count = defaultShortcutCount;
    props.custom_shortcut_count = customShortcutCount;
    return props;
  }

  async function recordShortcutUsage(actionId) {
    if (!SHORTCUT_ACTION_ID_SET.has(actionId)) return { ok: false, reason: 'unknown_action' };

    const store = await readStore();
    const currentDay = dayKey();
    const bucket = store.buckets[currentDay] || { shortcuts: {}, totalShortcutUses: 0 };
    bucket.shortcuts[actionId] = Math.min(Number(bucket.shortcuts[actionId] || 0) + 1, 9999);
    bucket.totalShortcutUses = Math.min(Number(bucket.totalShortcutUses || 0) + 1, 999999);
    store.buckets[currentDay] = bucket;
    await writeStore(store);

    await flushIfDue('shortcut');
    return { ok: true };
  }

  async function flushIfDue(reason, force = false) {
    if (!hasConfiguredProvider()) return { ok: true, skipped: 'analytics_not_configured' };

    const store = await readStore();
    const now = Date.now();
    const lastAttemptAt = Math.max(
      Number(store.lastFlushAt || 0),
      Number(store.lastFlushAttemptAt || 0),
    );
    if (!force && now - lastAttemptAt < FLUSH_INTERVAL_MS) {
      return { ok: true, skipped: 'not_due' };
    }
    store.lastFlushAttemptAt = now;
    await writeStore(store);

    if (!(await initProvider())) return { ok: false, reason: 'provider_unavailable' };

    try {
      await globalThis.aptabase.trackEvent('usage_summary_v1', summarizeUsage(store, reason));
      await globalThis.aptabase.trackEvent('settings_snapshot_v1', await summarizeSettings(reason));
      store.lastFlushAttemptAt = now;
      store.lastFlushAt = now;
      store.lastFlushDay = dayKey(now);
      await writeStore(store);
      return { ok: true, sent: 2 };
    } catch (error) {
      console.warn('[CSP] Anonymous usage analytics flush failed.', error);
      return { ok: false, reason: 'flush_failed' };
    }
  }

  async function buildReport() {
    const store = await readStore();
    const usageSummary = summarizeUsage(store, 'local-report');
    const settingsSummary = await summarizeSettings('local-report');
    const { totals, totalShortcutUses, daysObserved } = collectUsageTotals(store);
    const actionRows = SHORTCUT_ACTION_IDS.map((actionId) => {
      const count = Number(totals[actionId] || 0);
      return {
        actionId,
        group: groupForAction(actionId),
        count,
        bucket: countBucket(count),
        used: count > 0,
      };
    });
    const groupRows = Object.entries(SHORTCUT_GROUPS).map(([group, actionIds]) => {
      const count = actionIds.reduce((sum, actionId) => sum + Number(totals[actionId] || 0), 0);
      return {
        group,
        count,
        bucket: countBucket(count),
        used: count > 0,
      };
    });
    const toggleRows = Object.keys(TOGGLE_DEFAULTS).map((key) => ({
      key,
      value: Boolean(settingsSummary[metricKey('t', key)]),
    }));
    const shortcutRows = [
      ...Object.keys(SHORTCUT_DEFAULTS).map((key) => ({
        key,
        state: settingsSummary[metricKey('s', key)],
      })),
      ...MODEL_PICKER_DEFAULT_KEY_CODES.map((_value, index) => ({
        key: `modelPickerSlot:${index + 1}`,
        state: settingsSummary[metricKey('s', `model_slot_${index + 1}`)],
      })),
    ];

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      extensionVersion: extensionVersion(),
      retentionDays: RETENTION_DAYS,
      flushIntervalHours: 24,
      networkEnabled: hasConfiguredProvider(),
      analyticsHost: normalizedAnalyticsHost(),
      providerReady,
      storeKey: STORE_KEY,
      daysObserved,
      totalShortcutUses,
      distinctShortcutsUsed: Object.keys(totals).filter((actionId) => totals[actionId] > 0).length,
      lastFlushAttemptAt: Number(store.lastFlushAttemptAt || 0),
      lastFlushAt: Number(store.lastFlushAt || 0),
      lastFlushDay: store.lastFlushDay || '',
      usageSummary,
      settingsSummary,
      groupRows,
      actionRows,
      toggleRows,
      shortcutRows,
    };
  }

  async function getState() {
    const store = await readStore();
    const { totals, totalShortcutUses, daysObserved } = collectUsageTotals(store);
    return {
      ok: true,
      configured: hasConfiguredProvider(),
      providerReady,
      networkEnabled: hasConfiguredProvider(),
      analyticsHost: normalizedAnalyticsHost(),
      pendingDays: Object.keys(store.buckets || {}).length,
      daysObserved,
      totalShortcutUses,
      distinctShortcutsUsed: Object.keys(totals).filter((actionId) => totals[actionId] > 0).length,
      lastFlushAttemptAt: Number(store.lastFlushAttemptAt || 0),
      lastFlushAt: Number(store.lastFlushAt || 0),
    };
  }

  function handleMessage(message, _sender, sendResponse) {
    if (!message || typeof message !== 'object') return false;
    if (message.type === 'csp.analytics.recordShortcut') {
      recordShortcutUsage(message.actionId).then(sendResponse, (error) => {
        console.warn('[CSP] Anonymous usage analytics record failed.', error);
        sendResponse({ ok: false, reason: 'record_failed' });
      });
      return true;
    }
    if (message.type === 'csp.analytics.flush') {
      flushIfDue(message.reason, Boolean(message.force)).then(sendResponse, (error) => {
        console.warn('[CSP] Anonymous usage analytics flush failed.', error);
        sendResponse({ ok: false, reason: 'flush_failed' });
      });
      return true;
    }
    if (message.type === 'csp.analytics.getState') {
      getState().then(sendResponse, (error) => {
        console.warn('[CSP] Anonymous usage analytics state read failed.', error);
        sendResponse({ ok: false, reason: 'state_failed' });
      });
      return true;
    }
    if (message.type === 'csp.analytics.getReport') {
      buildReport().then(sendResponse, (error) => {
        console.warn('[CSP] Anonymous usage analytics report failed.', error);
        sendResponse({ ok: false, reason: 'report_failed' });
      });
      return true;
    }
    return false;
  }

  function init() {
    if (!hasChromeStorage()) return;
    flushIfDue('background-start').catch((error) => {
      console.warn('[CSP] Anonymous usage analytics startup flush failed.', error);
    });
  }

  globalThis.CSPUsageAnalytics = {
    init,
    handleMessage,
    recordShortcutUsage,
    flushIfDue,
    getState,
    buildReport,
  };
})();
