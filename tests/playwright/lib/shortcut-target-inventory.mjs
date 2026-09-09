import shortcutActionMetadata from '../../../extension/shared/shortcut-action-metadata.js';

const SHORTCUT_DEFAULTS_PATTERN = /const shortcutDefaults = \{([\s\S]*?)\n\s*\};/;
const OPTIONS_DEFAULTS_PATTERN = /const OPTIONS_DEFAULTS = \{([\s\S]*?)\n\};/;
const ALT_SHORTCUT_ACTIONS_PATTERN =
  /const altShortcutActions = \{([\s\S]*?)\n\s*\};\s*\/\/ Close altShortcutActions registry/;
const COMPUTED_SHORTCUT_HANDLER_KEY_PATTERN = /^\s*\[shortcuts\.(\w+)\]:/gm;
const NAMED_SHORTCUT_HANDLER_KEY_PATTERN = /^ {6}([A-Za-z][A-Za-z0-9_]*):/gm;
const KEYDOWN_LISTENER_PATTERN = /\b(document|window)\.addEventListener\(\s*['"]keydown['"]/g;

const MODEL_PICKER_PROFILE_NAMES = Object.freeze(['legacy', 'latest']);
const MODEL_PICKER_PROFILE_STORAGE_KEYS = Object.freeze({
  latest: 'modelPickerKeyCodesLatest',
  legacy: 'modelPickerKeyCodesLegacy',
});
const MODEL_PICKER_PROFILE_NAME_STORAGE_KEYS = Object.freeze({
  latest: 'modelNamesLatest',
  legacy: 'modelNamesLegacy',
});
const MODEL_PICKER_PROFILE_CATALOG_STORAGE_KEYS = Object.freeze({
  latest: 'modelCatalogLatest',
  legacy: 'modelCatalogLegacy',
});
const EXPECTED_KEYBOARD_LISTENER_CONTRACTS = Object.freeze([
  Object.freeze({
    contractId: 'runtime-shortcut-dispatch',
    owner: 'document',
    handlerRef: 'shouldIgnoreShortcutEvent',
    classification: 'shortcut-dispatch',
  }),
  Object.freeze({
    contractId: 'page-up-down-takeover',
    owner: 'document',
    handlerRef: 'handleKeyDown',
    classification: 'page-scroll-takeover',
  }),
  Object.freeze({
    contractId: 'model-picker-slot-dispatch',
    owner: 'window',
    handlerRef: 'modPressed',
    classification: 'model-picker-slot-dispatch',
  }),
  Object.freeze({
    contractId: 'model-picker-refresh-support',
    owner: 'document',
    handlerRef: 'scheduleInteractionRefresh',
    classification: 'model-picker-refresh-support',
  }),
  Object.freeze({
    contractId: 'shortcut-overlay-dismissal',
    owner: 'document',
    handlerRef: 'onEsc',
    classification: 'overlay-dismissal',
  }),
  Object.freeze({
    contractId: 'shortcut-overlay-opener',
    owner: 'document',
    handlerRef: 'onKeyDown',
    classification: 'overlay-opener',
  }),
]);
const EXPECTED_SOURCE_KEYBOARD_CONTRACTS = Object.freeze([
  Object.freeze({
    contractId: 'alt-modifier-isolation',
    classification: 'modifier-isolation',
    sourceNeedles: Object.freeze([
      'const hasUnexpectedAltShortcutModifier =',
      'if (hasUnexpectedAltShortcutModifier(event)) return false;',
    ]),
  }),
  Object.freeze({
    contractId: 'response-navigation-preview',
    classification: 'response-navigation-preview',
    sourceNeedles: Object.freeze([
      'const runPreviewThreadShortcut =',
      "runPreviewThreadShortcut('shortcutKeyPreviousThread', event)",
      "runPreviewThreadShortcut('shortcutKeyNextThread', event)",
    ]),
  }),
  Object.freeze({
    contractId: 'ctrl-send-gate',
    classification: 'ctrl-send-gate',
    sourceNeedles: Object.freeze([
      'enableSendWithControlEnterCheckbox',
      "recordShortcutUsage('shortcutKeyClickSendButton')",
    ]),
  }),
  Object.freeze({
    contractId: 'ctrl-stop-gate',
    classification: 'ctrl-stop-gate',
    sourceNeedles: Object.freeze([
      'enableStopWithControlBackspaceCheckbox',
      "recordShortcutUsage('shortcutKeyClickStopButton')",
      'Only intercept if a visible Stop button exists',
    ]),
  }),
  Object.freeze({
    contractId: 'page-up-down-enable-gate',
    classification: 'page-scroll-enable-gate',
    sourceNeedles: Object.freeze([
      "chrome.storage.sync.get(['pageUpDownTakeover']",
      'toggleEventListener(enabled)',
    ]),
  }),
  Object.freeze({
    contractId: 'overlay-alt-only-capture',
    classification: 'overlay-alt-only-gate',
    sourceNeedles: Object.freeze([
      'const altOnly = e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;',
      'const onKeyDown = (e) => {',
    ]),
  }),
]);

const { ACTIVATION_PROBE_MODES, SHORTCUT_ACTIONS, TARGET_DESCRIPTORS } = shortcutActionMetadata;
const EXECUTABLE_ACTIVATION_PROBE_MODES = Object.freeze([
  'click-target',
  'focus-target',
  'opens-target',
  'direct-menu-target',
  'viewport-target',
  'clipboard-text',
  'dom-state',
]);

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function humanizeActionId(actionId) {
  return String(actionId || '')
    .replace(/^shortcutKey/, '')
    .replace(/^selectThenCopy$/, 'Select Then Copy')
    .replace(/^selectThenCopyAllMessages$/, 'Select Then Copy All Messages')
    .replace(/^altPageUp$/, 'Alt Page Up')
    .replace(/^altPageDown$/, 'Alt Page Down')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .trim();
}

export function parseSettingsSchemaSource(source) {
  const windowObj = {};
  const factory = new Function('window', `${source}\nreturn window.CSP_SETTINGS_SCHEMA;`);
  return factory(windowObj);
}

export function parseShortcutDefaultsFromContent(contentSource) {
  const match = SHORTCUT_DEFAULTS_PATTERN.exec(String(contentSource || ''));
  if (!match) {
    throw new Error('Could not locate shortcutDefaults in content.js');
  }
  const objectLiteral = `({${match[1]}})`;
  const factory = new Function('getSchemaShortcutDefaultCode', `return ${objectLiteral};`);
  return factory((_, fallback) => fallback);
}

export function parseOptionsDefaultsFromSource(optionsSource) {
  const match = OPTIONS_DEFAULTS_PATTERN.exec(String(optionsSource || ''));
  if (!match) {
    throw new Error('Could not locate OPTIONS_DEFAULTS in options-storage.js');
  }
  const factory = new Function(`return ({${match[1]}});`);
  return factory();
}

export function parseModelPickerLabelsSource(modelPickerLabelsSource) {
  const windowObj = {};
  const factory = new Function('window', String(modelPickerLabelsSource || ''));
  factory(windowObj);
  if (!windowObj.ModelLabels) {
    throw new Error('Could not initialize ModelLabels from model-picker-labels.js');
  }
  return windowObj.ModelLabels;
}

export function parseRuntimeHandlerActionIds(contentSource) {
  const source = String(contentSource || '');
  const handlerActionIds = [
    ...source.matchAll(COMPUTED_SHORTCUT_HANDLER_KEY_PATTERN),
  ].map((match) => match[1]);
  const registryMatch = ALT_SHORTCUT_ACTIONS_PATTERN.exec(source);
  if (registryMatch) {
    handlerActionIds.push(
      ...[...registryMatch[1].matchAll(NAMED_SHORTCUT_HANDLER_KEY_PATTERN)].map(
        (match) => match[1],
      ),
    );
  }
  return uniqueSorted(handlerActionIds);
}

function getLineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function classifyKeyboardListener(source, match) {
  const tail = source.slice(match.index, match.index + 700);
  const expected = EXPECTED_KEYBOARD_LISTENER_CONTRACTS.find(
    (contract) =>
      contract.owner === match[1] &&
      tail.includes(contract.handlerRef),
  );
  if (expected) {
    return {
      ...expected,
      line: getLineNumber(source, match.index),
      sourceExcerpt: tail.split('\n').slice(0, 8).join('\n').trim(),
    };
  }
  return {
    contractId: `unknown-${match[1]}-${getLineNumber(source, match.index)}`,
    owner: match[1],
    handlerRef: '',
    classification: 'unknown',
    line: getLineNumber(source, match.index),
    sourceExcerpt: tail.split('\n').slice(0, 8).join('\n').trim(),
  };
}

export function parseKeyboardListenerContracts(contentSource) {
  const source = String(contentSource || '');
  return [...source.matchAll(KEYDOWN_LISTENER_PATTERN)].map((match) =>
    classifyKeyboardListener(source, match),
  );
}

export function getExpectedKeyboardListenerContracts() {
  return EXPECTED_KEYBOARD_LISTENER_CONTRACTS.map((contract) => ({ ...contract }));
}

export function getExpectedSourceKeyboardContracts() {
  return EXPECTED_SOURCE_KEYBOARD_CONTRACTS.map(({ sourceNeedles, ...contract }) => ({
    ...contract,
  }));
}

function buildSourceKeyboardContractInventory(contentSource) {
  const source = String(contentSource || '');
  const contracts = EXPECTED_SOURCE_KEYBOARD_CONTRACTS.map((expected) => {
    const positions = expected.sourceNeedles.map((needle) => source.indexOf(needle));
    const missingNeedles = expected.sourceNeedles.filter((needle) => !source.includes(needle));
    const firstPosition = positions.find((position) => position >= 0) ?? -1;
    const { sourceNeedles, ...descriptor } = expected;
    return {
      ...descriptor,
      line: firstPosition >= 0 ? getLineNumber(source, firstPosition) : null,
      sourceExcerpt:
        firstPosition >= 0
          ? source
              .slice(firstPosition, firstPosition + 500)
              .split('\n')
              .slice(0, 8)
              .join('\n')
              .trim()
          : '',
      missingNeedles,
      status: missingNeedles.length ? 'missing' : 'present',
    };
  });
  const issues = contracts
    .filter((contract) => contract.status === 'missing')
    .map((contract) => ({
      type: 'missing-keyboard-source-contract',
      contractId: contract.contractId,
      line: contract.line,
      missingNeedles: contract.missingNeedles,
      message: `Keyboard source contract ${contract.contractId} is missing: ${contract.missingNeedles.join(', ')}.`,
    }));
  return { contracts, issues };
}

function getSectionInfoByActionId(settingsSchema) {
  const overlaySections = settingsSchema?.shortcuts?.overlaySections || [];
  const entries = [];
  overlaySections.forEach((section, sectionIndex) => {
    (section.keys || []).forEach((actionId, itemIndex) => {
      entries.push({
        actionId,
        sectionHeader: section.header || section.headerI18nKey || 'Other',
        sectionHeaderI18nKey: section.headerI18nKey || null,
        sectionIndex,
        itemIndex,
      });
    });
  });
  return Object.fromEntries(entries.map((entry) => [entry.actionId, entry]));
}

function resolveShortcutLabel(actionId, settingsSchema, localeMessages) {
  const labelKey = settingsSchema?.shortcuts?.labelI18nByKey?.[actionId] || null;
  const localized =
    labelKey && localeMessages && localeMessages[labelKey]?.message
      ? localeMessages[labelKey].message
      : null;
  return {
    labelKey,
    label: localized || humanizeActionId(actionId),
  };
}

function buildScrapeStateInfoById(scrapeStateRegistry) {
  const entries = (scrapeStateRegistry || [])
    .filter((item) => item && typeof item.stateId === 'string' && item.stateId)
    .map((item) => [
      item.stateId,
      {
        stateId: item.stateId,
        filename: item.filename || '',
        label: item.label || item.stateId,
      },
    ]);
  return Object.fromEntries(entries);
}

function resolveFilesForStateRefs(uiStateRefs, scrapeStateInfoById) {
  return uniqueSorted(
    (uiStateRefs || [])
      .map((stateId) => scrapeStateInfoById[stateId]?.filename)
      .filter(Boolean),
  );
}

function findUnknownStateRefs(uiStateRefs, scrapeStateInfoById) {
  return uniqueSorted((uiStateRefs || []).filter((stateId) => !scrapeStateInfoById[stateId]));
}

function normalizeModelPickerCodes(codes, slotCount) {
  const normalized = Array.isArray(codes) ? codes.slice(0, slotCount) : [];
  while (normalized.length < slotCount) normalized.push('');
  return normalized.map((code) => (typeof code === 'string' ? code : ''));
}

function getModelPickerPresentationGroups({
  modelLabels,
  profile,
  optionsDefaults,
  catalogsByProfile,
  namesByProfile,
  activeConfigId,
}) {
  if (typeof modelLabels?.getPopupPresentationGroups !== 'function') return [];

  const namesKey = MODEL_PICKER_PROFILE_NAME_STORAGE_KEYS[profile];
  const catalogKey = MODEL_PICKER_PROFILE_CATALOG_STORAGE_KEYS[profile];
  const configuredNames = namesByProfile?.[profile] ?? optionsDefaults?.[namesKey];
  const names = Array.isArray(configuredNames)
    ? configuredNames
    : profile === 'legacy'
      ? modelLabels.defaultLegacyNames?.() || []
      : modelLabels.defaultNames?.() || [];
  const configuredCatalog = catalogsByProfile?.[profile] ?? optionsDefaults?.[catalogKey];
  const catalog =
    profile === 'legacy' &&
    (!configuredCatalog || typeof configuredCatalog !== 'object') &&
    typeof modelLabels.getDefaultLegacyCatalog === 'function'
      ? modelLabels.getDefaultLegacyCatalog()
      : configuredCatalog;

  try {
    return modelLabels.getPopupPresentationGroups(
      activeConfigId || modelLabels.DEFAULT_ACTIVE_CONFIG_ID || 'configure-latest',
      names,
      catalog,
    );
  } catch {
    return [];
  }
}

export function buildModelPickerSlotInventory({
  optionsDefaults = {},
  modelLabels,
  catalogsByProfile = {},
  namesByProfile = {},
  activeConfigId = '',
} = {}) {
  const slotCount =
    Number.isInteger(modelLabels?.MAX_SLOTS) && modelLabels.MAX_SLOTS > 0
      ? modelLabels.MAX_SLOTS
      : 15;
  const rows = [];
  const issues = [];
  const profiles = {};

  MODEL_PICKER_PROFILE_NAMES.forEach((profile) => {
    const storageKey = MODEL_PICKER_PROFILE_STORAGE_KEYS[profile];
    const codes = normalizeModelPickerCodes(optionsDefaults?.[storageKey], slotCount);
    const groups = getModelPickerPresentationGroups({
      modelLabels,
      profile,
      optionsDefaults,
      catalogsByProfile,
      namesByProfile,
      activeConfigId,
    });
    const actionsBySlot = new Map();
    groups.forEach((group) => {
      (group?.actions || []).forEach((action) => {
        const slot = Number(action?.slot);
        if (!Number.isInteger(slot) || slot < 0 || slot >= slotCount) return;
        const existing = actionsBySlot.get(slot) || [];
        if (!existing.some((item) => item.id === action.id)) existing.push({ ...action });
        actionsBySlot.set(slot, existing);
      });
    });

    const profileRows = [];
    for (let slot = 0; slot < slotCount; slot += 1) {
      const actions = actionsBySlot.get(slot) || [];
      const canonicalAction =
        typeof modelLabels?.getActionBySlot === 'function'
          ? modelLabels.getActionBySlot(slot)
          : null;
      const actionIds = actions.map((action) => action.id).filter(Boolean);
      const code = codes[slot];
      const hasAssignment = Boolean(code && code !== '\u00a0');
      const availability = actionIds.length
        ? 'presented'
        : canonicalAction || hasAssignment
          ? 'unavailable'
          : 'empty';
      const row = {
        rowId: `model:${profile}:${slot}:${actionIds.join('+') || 'empty'}`,
        profile,
        slot,
        storageKey,
        code,
        assigned: hasAssignment,
        availability,
        actionId: actionIds[0] || '',
        actionIds,
        labels: actions.map((action) => action.label || action.id).filter(Boolean),
        actionKinds: actions.map((action) => action.actionKind || '').filter(Boolean),
        canonicalActionId: canonicalAction?.id || '',
      };
      profileRows.push(row);
      rows.push(row);
    }
    profiles[profile] = {
      profile,
      storageKey,
      slotCount,
      assignedCount: profileRows.filter((row) => row.assigned).length,
      presentedCount: profileRows.filter((row) => row.availability === 'presented').length,
      unavailableCount: profileRows.filter((row) => row.availability === 'unavailable').length,
      emptyCount: profileRows.filter((row) => row.availability === 'empty').length,
      rows: profileRows,
    };
  });

  if (!modelLabels) {
    issues.push({
      type: 'missing-model-label-source',
      message: 'Model picker slot inventory could not load ModelLabels.',
    });
  }

  return {
    slotCount,
    rows,
    profiles,
    issues,
  };
}

function buildKeyboardListenerInventory(contentSource) {
  const listeners = parseKeyboardListenerContracts(contentSource);
  const observedById = Object.fromEntries(
    listeners
      .filter((listener) => listener.classification !== 'unknown')
      .map((listener) => [listener.contractId, listener]),
  );
  const contracts = EXPECTED_KEYBOARD_LISTENER_CONTRACTS.map((expected) => ({
    ...expected,
    observed: observedById[expected.contractId] || null,
    status: observedById[expected.contractId] ? 'present' : 'missing',
  }));
  const issues = [];
  const seenIds = new Set();
  listeners.forEach((listener) => {
    if (listener.classification === 'unknown') {
      issues.push({
        type: 'unclassified-keyboard-listener',
        listenerId: listener.contractId,
        line: listener.line,
        message: `Keyboard listener at line ${listener.line} is not classified: ${listener.sourceExcerpt}`,
      });
      return;
    }
    if (seenIds.has(listener.contractId)) {
      issues.push({
        type: 'duplicate-keyboard-listener-contract',
        listenerId: listener.contractId,
        line: listener.line,
        message: `Keyboard listener contract ${listener.contractId} appears more than once.`,
      });
    }
    seenIds.add(listener.contractId);
  });
  contracts
    .filter((contract) => contract.status === 'missing')
    .forEach((contract) => {
      issues.push({
        type: 'missing-keyboard-listener-contract',
        listenerId: contract.contractId,
        message: `Keyboard listener contract ${contract.contractId} is missing from content.js.`,
      });
    });

  const sourceContractInventory = buildSourceKeyboardContractInventory(contentSource);

  return {
    listeners,
    contracts: [...contracts, ...sourceContractInventory.contracts],
    issues: [...issues, ...sourceContractInventory.issues],
  };
}

function buildShortcutRow({
  definition,
  defaults,
  handlerActionIds,
  settingsSchema,
  localeMessages,
  sectionInfoByActionId,
  scrapeStateInfoById,
  missingMetadata = false,
  unknownTargetRefs = [],
}) {
  const labelInfo = resolveShortcutLabel(definition.actionId, settingsSchema, localeMessages);
  const sectionInfo = sectionInfoByActionId[definition.actionId] || null;
  const requiredUiStateRefs = definition.uiStateRefs || [];
  const activationProbe = definition.activationProbe || {
    mode: missingMetadata ? 'missing-metadata' : 'missing',
    expectedTargetRef: '',
    uiStateRefs: [],
    safe: false,
    notes: missingMetadata
      ? 'Runtime shortcut is missing explicit validation metadata.'
      : 'Shortcut is missing explicit activation probe metadata.',
  };
  return {
    actionId: definition.actionId,
    label: labelInfo.label,
    labelKey: labelInfo.labelKey,
    defaultCode: Object.hasOwn(defaults, definition.actionId) ? defaults[definition.actionId] : '',
    validationMode: missingMetadata ? 'missing-metadata' : definition.validationMode,
    targetIds: definition.targetRefs || [],
    targetRefs: definition.targetRefs || [],
    requiredUiStateRefs,
    requiredFiles: resolveFilesForStateRefs(requiredUiStateRefs, scrapeStateInfoById),
    activationProbe,
    activationProbeMode: activationProbe.mode || '',
    activationProbeExpectedTargetRef: activationProbe.expectedTargetRef || '',
    activationProbeUiStateRefs: activationProbe.uiStateRefs || [],
    activationProbeSetup: activationProbe.setup || '',
    activationProbeUrl: activationProbe.url || '',
    activationProbeRequiredFiles: resolveFilesForStateRefs(
      activationProbe.uiStateRefs || [],
      scrapeStateInfoById,
    ),
    activationProbeSafe: activationProbe.safe === true,
    unknownTargetRefs,
    unknownUiStateRefs: findUnknownStateRefs(requiredUiStateRefs, scrapeStateInfoById),
    unknownActivationProbeUiStateRefs: findUnknownStateRefs(
      activationProbe.uiStateRefs || [],
      scrapeStateInfoById,
    ),
    notes: definition.notes || '',
    handlerRef: definition.handlerRef || '',
    requiresHandler: definition.requiresHandler !== false,
    requiresDefault: definition.requiresDefault !== false,
    handlerPresent: handlerActionIds.includes(definition.actionId),
    defaultPresent: Object.hasOwn(defaults, definition.actionId),
    missingMetadata,
    sectionHeader: sectionInfo?.sectionHeader || 'Other',
    sectionHeaderI18nKey: sectionInfo?.sectionHeaderI18nKey || null,
    sectionIndex: typeof sectionInfo?.sectionIndex === 'number' ? sectionInfo.sectionIndex : 999,
    itemIndex: typeof sectionInfo?.itemIndex === 'number' ? sectionInfo.itemIndex : 999,
  };
}

export function buildShortcutValidationInventory({
  contentSource,
  settingsSchema,
  localeMessages = null,
  scrapeStateRegistry = [],
  optionsDefaults = {},
  modelLabels = null,
  modelPickerCatalogs = {},
  modelPickerNames = {},
  activeModelConfigId = '',
} = {}) {
  const defaults = parseShortcutDefaultsFromContent(contentSource);
  const handlerActionIds = parseRuntimeHandlerActionIds(contentSource);
  const defaultActionIds = uniqueSorted(Object.keys(defaults));
  const allRuntimeActionIds = uniqueSorted([...defaultActionIds, ...handlerActionIds]);
  const scrapeStateInfoById = buildScrapeStateInfoById(scrapeStateRegistry);
  const keyboardListenerInventory = buildKeyboardListenerInventory(contentSource);
  const modelPickerInventory = buildModelPickerSlotInventory({
    optionsDefaults,
    modelLabels,
    catalogsByProfile: modelPickerCatalogs,
    namesByProfile: modelPickerNames,
    activeConfigId: activeModelConfigId,
  });

  const shortcutDefinitionById = Object.fromEntries(
    SHORTCUT_ACTIONS.map((definition) => [definition.actionId, definition]),
  );
  const targetDefinitionById = Object.fromEntries(
    TARGET_DESCRIPTORS.map((definition) => [definition.targetId, definition]),
  );

  const duplicateShortcutActionIds = uniqueSorted(
    SHORTCUT_ACTIONS.map((definition) => definition.actionId).filter(
      (actionId, index, actionIds) => actionIds.indexOf(actionId) !== index,
    ),
  );
  const duplicateTargetIds = uniqueSorted(
    TARGET_DESCRIPTORS.map((definition) => definition.targetId).filter(
      (targetId, index, targetIds) => targetIds.indexOf(targetId) !== index,
    ),
  );

  const missingShortcutMetadataActionIds = allRuntimeActionIds.filter(
    (actionId) => !shortcutDefinitionById[actionId],
  );
  const unknownShortcutMetadataActionIds = Object.keys(shortcutDefinitionById).filter(
    (actionId) => {
      if (allRuntimeActionIds.includes(actionId)) return false;
      const definition = shortcutDefinitionById[actionId];
      return definition.requiresHandler !== false || definition.requiresDefault !== false;
    },
  );
  const missingTargetRefsByAction = Object.fromEntries(
    SHORTCUT_ACTIONS.map((definition) => [
      definition.actionId,
      uniqueSorted(
        (definition.targetRefs || []).filter((targetRef) => !targetDefinitionById[targetRef]),
      ),
    ]).filter(([, targetRefs]) => targetRefs.length > 0),
  );
  const unknownActivationProbeModesByAction = Object.fromEntries(
    SHORTCUT_ACTIONS.map((definition) => [
      definition.actionId,
      definition.activationProbe?.mode && !ACTIVATION_PROBE_MODES.includes(definition.activationProbe.mode)
        ? [definition.activationProbe.mode]
        : [],
    ]).filter(([, modes]) => modes.length > 0),
  );
  const missingActivationProbeActionIds = SHORTCUT_ACTIONS.filter(
    (definition) => definition.validationMode === 'scrape-targets' && !definition.activationProbe,
  ).map((definition) => definition.actionId);
  const unknownActivationProbeTargetRefsByAction = Object.fromEntries(
    SHORTCUT_ACTIONS.map((definition) => {
      const expectedTargetRef = definition.activationProbe?.expectedTargetRef || '';
      return [
        definition.actionId,
        expectedTargetRef && !targetDefinitionById[expectedTargetRef] ? [expectedTargetRef] : [],
      ];
    }).filter(([, targetRefs]) => targetRefs.length > 0),
  );
  const missingActivationProbeTargetActionIds = SHORTCUT_ACTIONS.filter(
    (definition) =>
      EXECUTABLE_ACTIVATION_PROBE_MODES.includes(definition.activationProbe?.mode) &&
      !definition.activationProbe?.expectedTargetRef,
  ).map((definition) => definition.actionId);
  const executableProbeOnNonTargetActionIds = SHORTCUT_ACTIONS.filter(
    (definition) =>
      EXECUTABLE_ACTIVATION_PROBE_MODES.includes(definition.activationProbe?.mode) &&
      definition.validationMode !== 'scrape-targets',
  ).map((definition) => definition.actionId);
  const unknownActionUiStateRefsByAction = Object.fromEntries(
    SHORTCUT_ACTIONS.map((definition) => [
      definition.actionId,
      findUnknownStateRefs(definition.uiStateRefs || [], scrapeStateInfoById),
    ]).filter(([, uiStateRefs]) => uiStateRefs.length > 0),
  );
  const unknownActivationProbeUiStateRefsByAction = Object.fromEntries(
    SHORTCUT_ACTIONS.map((definition) => [
      definition.actionId,
      findUnknownStateRefs(definition.activationProbe?.uiStateRefs || [], scrapeStateInfoById),
    ]).filter(([, uiStateRefs]) => uiStateRefs.length > 0),
  );
  const unknownTargetUiStateRefsByTarget = Object.fromEntries(
    TARGET_DESCRIPTORS.map((definition) => [
      definition.targetId,
      findUnknownStateRefs(definition.uiStateRefs || [], scrapeStateInfoById),
    ]).filter(([, uiStateRefs]) => uiStateRefs.length > 0),
  );
  const targetIdsMissingMatchGroups = uniqueSorted(
    TARGET_DESCRIPTORS.filter(
      (definition) =>
        (definition.uiStateRefs || []).length > 0 &&
        (!Array.isArray(definition.matchGroups) || definition.matchGroups.length === 0),
    ).map((definition) => definition.targetId),
  );

  const sectionInfoByActionId = getSectionInfoByActionId(settingsSchema);

  const declaredShortcutRows = SHORTCUT_ACTIONS.map((definition) =>
    buildShortcutRow({
      definition,
      defaults,
      handlerActionIds,
      settingsSchema,
      localeMessages,
      sectionInfoByActionId,
      scrapeStateInfoById,
      unknownTargetRefs: missingTargetRefsByAction[definition.actionId] || [],
    }),
  );
  const missingMetadataRows = missingShortcutMetadataActionIds.map((actionId) =>
    buildShortcutRow({
      definition: {
        actionId,
        validationMode: 'missing-metadata',
        targetRefs: [],
        uiStateRefs: [],
        notes: 'Runtime shortcut is missing explicit validation metadata.',
      },
      defaults,
      handlerActionIds,
      settingsSchema,
      localeMessages,
      sectionInfoByActionId,
      scrapeStateInfoById,
      missingMetadata: true,
    }),
  );

  const shortcuts = [...declaredShortcutRows, ...missingMetadataRows].sort((left, right) => {
    if (left.sectionIndex !== right.sectionIndex) return left.sectionIndex - right.sectionIndex;
    if (left.itemIndex !== right.itemIndex) return left.itemIndex - right.itemIndex;
    return left.actionId.localeCompare(right.actionId);
  });

  const targets = TARGET_DESCRIPTORS.map((definition) => ({
    ...definition,
    expectedUiStateRefs: definition.uiStateRefs || [],
    expectedFiles: resolveFilesForStateRefs(definition.uiStateRefs || [], scrapeStateInfoById),
    unknownUiStateRefs: unknownTargetUiStateRefsByTarget[definition.targetId] || [],
    missingMatchGroups: targetIdsMissingMatchGroups.includes(definition.targetId),
    usedByActionIds: SHORTCUT_ACTIONS.filter((shortcut) =>
      (shortcut.targetRefs || []).includes(definition.targetId),
    )
      .map((shortcut) => shortcut.actionId)
      .sort(),
  }));

  const inventoryIssues = [];
  keyboardListenerInventory.issues.forEach((issue) => inventoryIssues.push(issue));
  modelPickerInventory.issues.forEach((issue) => inventoryIssues.push(issue));
  duplicateShortcutActionIds.forEach((actionId) => {
    inventoryIssues.push({
      type: 'duplicate-shortcut-metadata',
      actionId,
      message: `Shortcut metadata action ${actionId} is declared more than once.`,
    });
  });
  duplicateTargetIds.forEach((targetId) => {
    inventoryIssues.push({
      type: 'duplicate-target-metadata',
      targetId,
      message: `Target metadata ${targetId} is declared more than once.`,
    });
  });
  missingShortcutMetadataActionIds.forEach((actionId) => {
    inventoryIssues.push({
      type: 'missing-shortcut-metadata',
      actionId,
      message: `Runtime shortcut ${actionId} is missing explicit validation metadata.`,
    });
  });
  unknownShortcutMetadataActionIds.forEach((actionId) => {
    inventoryIssues.push({
      type: 'unknown-shortcut-metadata',
      actionId,
      message: `Shortcut metadata ${actionId} does not match the current runtime shortcut set.`,
    });
  });
  Object.entries(missingTargetRefsByAction).forEach(([actionId, targetRefs]) => {
    inventoryIssues.push({
      type: 'unknown-target-ref',
      actionId,
      targetRefs,
      message: `Shortcut metadata ${actionId} references unknown target(s): ${targetRefs.join(', ')}.`,
    });
  });
  missingActivationProbeActionIds.forEach((actionId) => {
    inventoryIssues.push({
      type: 'missing-activation-probe-metadata',
      actionId,
      message: `Shortcut metadata ${actionId} is missing explicit activation probe metadata.`,
    });
  });
  Object.entries(unknownActivationProbeModesByAction).forEach(([actionId, modes]) => {
    inventoryIssues.push({
      type: 'unknown-activation-probe-mode',
      actionId,
      modes,
      message: `Shortcut metadata ${actionId} references unknown activation probe mode(s): ${modes.join(', ')}.`,
    });
  });
  Object.entries(unknownActivationProbeTargetRefsByAction).forEach(([actionId, targetRefs]) => {
    inventoryIssues.push({
      type: 'unknown-activation-probe-target-ref',
      actionId,
      targetRefs,
      message: `Shortcut metadata ${actionId} references unknown activation probe target(s): ${targetRefs.join(', ')}.`,
    });
  });
  missingActivationProbeTargetActionIds.forEach((actionId) => {
    inventoryIssues.push({
      type: 'missing-activation-probe-target-ref',
      actionId,
      message: `Shortcut metadata ${actionId} has an executable activation probe without an expected target ref.`,
    });
  });
  executableProbeOnNonTargetActionIds.forEach((actionId) => {
    inventoryIssues.push({
      type: 'executable-probe-on-non-target-shortcut',
      actionId,
      message: `Shortcut metadata ${actionId} has an executable activation probe but is not classified for scrape-target validation.`,
    });
  });
  Object.entries(unknownActionUiStateRefsByAction).forEach(([actionId, uiStateRefs]) => {
    inventoryIssues.push({
      type: 'unknown-action-ui-state-ref',
      actionId,
      uiStateRefs,
      message: `Shortcut metadata ${actionId} references unknown scrape state(s): ${uiStateRefs.join(', ')}.`,
    });
  });
  Object.entries(unknownActivationProbeUiStateRefsByAction).forEach(([actionId, uiStateRefs]) => {
    inventoryIssues.push({
      type: 'unknown-activation-probe-ui-state-ref',
      actionId,
      uiStateRefs,
      message: `Shortcut metadata ${actionId} activation probe references unknown scrape state(s): ${uiStateRefs.join(', ')}.`,
    });
  });
  Object.entries(unknownTargetUiStateRefsByTarget).forEach(([targetId, uiStateRefs]) => {
    inventoryIssues.push({
      type: 'unknown-target-ui-state-ref',
      targetId,
      uiStateRefs,
      message: `Target metadata ${targetId} references unknown scrape state(s): ${uiStateRefs.join(', ')}.`,
    });
  });
  targetIdsMissingMatchGroups.forEach((targetId) => {
    inventoryIssues.push({
      type: 'missing-target-match-groups',
      targetId,
      message: `Target metadata ${targetId} has scrape state coverage but no deterministic match group.`,
    });
  });

  shortcuts.forEach((shortcut) => {
    if (shortcut.missingMetadata) return;
    if (shortcut.requiresHandler && !shortcut.handlerPresent) {
      inventoryIssues.push({
        type: 'missing-runtime-handler',
        actionId: shortcut.actionId,
        message: `Shortcut ${shortcut.actionId} is expected to have a runtime handler but none was found.`,
      });
    }
    if (shortcut.requiresDefault && !shortcut.defaultPresent) {
      inventoryIssues.push({
        type: 'missing-runtime-default',
        actionId: shortcut.actionId,
        message: `Shortcut ${shortcut.actionId} is expected to have a default shortcut code but none was found.`,
      });
    }
  });

  return {
    defaults,
    handlerActionIds,
    allRuntimeActionIds,
    scrapeStateInfoById,
    keyboardListeners: keyboardListenerInventory.listeners,
    fixedKeyboardContracts: keyboardListenerInventory.contracts,
    modelPickerSlotRows: modelPickerInventory.rows,
    modelPickerProfiles: modelPickerInventory.profiles,
    modelPickerSlotCount: modelPickerInventory.slotCount,
    shortcuts,
    targets,
    inventoryIssues,
  };
}
