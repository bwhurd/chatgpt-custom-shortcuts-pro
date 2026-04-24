import shortcutActionMetadata from '../../../extension/shared/shortcut-action-metadata.js';

const SHORTCUT_DEFAULTS_PATTERN = /const shortcutDefaults = \{([\s\S]*?)\n\s*\};/;
const SHORTCUT_HANDLER_KEY_PATTERN = /^\s*\[shortcuts\.(\w+)\]:/gm;

const { ACTIVATION_PROBE_MODES, SHORTCUT_ACTIONS, TARGET_DESCRIPTORS } = shortcutActionMetadata;
const EXECUTABLE_ACTIVATION_PROBE_MODES = Object.freeze(['click-target', 'focus-target']);

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

export function parseRuntimeHandlerActionIds(contentSource) {
  return uniqueSorted(
    [...String(contentSource || '').matchAll(SHORTCUT_HANDLER_KEY_PATTERN)].map(
      (match) => match[1],
    ),
  );
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
} = {}) {
  const defaults = parseShortcutDefaultsFromContent(contentSource);
  const handlerActionIds = parseRuntimeHandlerActionIds(contentSource);
  const defaultActionIds = uniqueSorted(Object.keys(defaults));
  const allRuntimeActionIds = uniqueSorted([...defaultActionIds, ...handlerActionIds]);
  const scrapeStateInfoById = buildScrapeStateInfoById(scrapeStateRegistry);

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
    shortcuts,
    targets,
    inventoryIssues,
  };
}
