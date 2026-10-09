import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import shortcutActionMetadata from '../extension/shared/shortcut-action-metadata.js';
import { loadDevScrapeWideContract } from './playwright/lib/devscrape-wide-core.mjs';
import {
  buildShortcutValidationInventory,
  getExpectedKeyboardListenerContracts,
  getExpectedSourceKeyboardContracts,
  parseModelPickerLabelsSource,
  parseOptionsDefaultsFromSource,
  parseSettingsSchemaSource,
} from './playwright/lib/shortcut-target-inventory.mjs';
import { evaluateTargetPresence } from './playwright/lib/shortcut-target-presence.mjs';

const [
  contentSource,
  optionsSource,
  modelLabelsSource,
  settingsSchemaSource,
  localeSource,
  contract,
] = await Promise.all([
  readFile(new URL('../extension/content.js', import.meta.url), 'utf8'),
  readFile(new URL('../extension/options-storage.js', import.meta.url), 'utf8'),
  readFile(new URL('../extension/shared/model-picker-labels.js', import.meta.url), 'utf8'),
  readFile(new URL('../extension/settings-schema.js', import.meta.url), 'utf8'),
  readFile(new URL('../extension/_locales/en/messages.json', import.meta.url), 'utf8'),
  loadDevScrapeWideContract(),
]);

const scrapeStateRegistry = [
  ...(contract.exports.DUMP_REGISTRY || []),
  ...(contract.exports.DEFERRED_ARTIFACTS || []),
];
const inventory = buildShortcutValidationInventory({
  contentSource,
  optionsDefaults: parseOptionsDefaultsFromSource(optionsSource),
  modelLabels: parseModelPickerLabelsSource(modelLabelsSource),
  settingsSchema: parseSettingsSchemaSource(settingsSchemaSource),
  localeMessages: JSON.parse(localeSource),
  scrapeStateRegistry,
});

const requiredHandlerIds = shortcutActionMetadata.SHORTCUT_ACTIONS.filter(
  (action) => action.requiresHandler !== false,
).map((action) => action.actionId);
assert.deepEqual(
  requiredHandlerIds.filter((actionId) => !inventory.handlerActionIds.includes(actionId)),
  [],
  'every handler-backed shortcut should be found in the named runtime registry',
);
assert.deepEqual(
  inventory.allRuntimeActionIds.filter(
    (actionId) =>
      !shortcutActionMetadata.SHORTCUT_ACTIONS.some((action) => action.actionId === actionId),
  ),
  [],
  'every default or handler action should have explicit shortcut metadata',
);
assert.deepEqual(
  inventory.inventoryIssues,
  [],
  `shortcut inventory should be coherent: ${JSON.stringify(inventory.inventoryIssues, null, 2)}`,
);
function assertInventoryCoverageRelationships() {
  const statesById = new Map(scrapeStateRegistry.map((entry) => [entry.stateId, entry]));
  const statesByFilename = new Map(scrapeStateRegistry.map((entry) => [entry.filename, entry]));
  const targetsById = new Map(inventory.targets.map((target) => [target.targetId, target]));
  const shortcutsById = new Map(
    inventory.shortcuts.map((shortcut) => [shortcut.actionId, shortcut]),
  );

  assert.equal(statesById.size, scrapeStateRegistry.length, 'scrape state ids should be unique');
  assert.equal(
    statesByFilename.size,
    scrapeStateRegistry.length,
    'scrape state filenames should be unique',
  );
  assert.equal(targetsById.size, inventory.targets.length, 'target ids should be unique');

  const uncoveredTargets = [];
  const orphanTargets = [];
  for (const target of inventory.targets) {
    for (const stateId of target.expectedUiStateRefs) {
      const state = statesById.get(stateId);
      assert.ok(state, `${target.targetId} references registered state ${stateId}`);
      assert.ok(
        target.expectedFiles.includes(state.filename),
        `${target.targetId} maps ${stateId} to ${state.filename}`,
      );
    }
    for (const filename of target.expectedFiles) {
      assert.ok(
        statesByFilename.has(filename),
        `${target.targetId} uses registered file ${filename}`,
      );
    }
    for (const actionId of target.usedByActionIds) {
      const shortcut = shortcutsById.get(actionId);
      assert.ok(shortcut, `${target.targetId} is linked to registered action ${actionId}`);
      assert.ok(shortcut.targetRefs.includes(target.targetId));
    }

    const hasScrapeAction = target.usedByActionIds.some(
      (actionId) => shortcutsById.get(actionId)?.validationMode === 'scrape-targets',
    );
    if (hasScrapeAction && (target.expectedFiles.length === 0 || target.matchGroups.length === 0)) {
      uncoveredTargets.push(target.targetId);
    }
    if (target.expectedFiles.length === 0 && target.usedByActionIds.length === 0) {
      orphanTargets.push(target.targetId);
    }
  }

  assert.deepEqual(uncoveredTargets, [], 'every scrape-target action has registered file coverage');
  assert.deepEqual(orphanTargets, [], 'every target has an action or registered file relationship');
}

function assertProbeOnlyCoverageRelationships() {
  const probeOnlyStates = scrapeStateRegistry.filter((entry) => entry.probeOnly === true);
  const probeOnlyStateIds = new Set(probeOnlyStates.map((entry) => entry.stateId));
  const targetsById = new Map(inventory.targets.map((target) => [target.targetId, target]));
  const shortcutsById = new Map(
    inventory.shortcuts.map((shortcut) => [shortcut.actionId, shortcut]),
  );

  for (const state of probeOnlyStates) {
    assert.equal(state.capture?.type, 'probe-target', `${state.stateId} declares its probe target`);
    const relatedTargets = inventory.targets.filter((target) =>
      target.expectedUiStateRefs.includes(state.stateId),
    );
    assert.ok(relatedTargets.length > 0, `${state.stateId} is required by a target`);
    const captureTarget = targetsById.get(state.capture.targetRef);
    assert.ok(captureTarget, `${state.stateId} points to a registered target`);
    assert.ok(
      relatedTargets.some((target) => target.targetId === captureTarget.targetId),
      `${state.stateId} capture target consumes its registered state`,
    );

    for (const target of relatedTargets) {
      assert.ok(target.expectedFiles.includes(state.filename));
      for (const actionId of target.usedByActionIds) {
        const shortcut = shortcutsById.get(actionId);
        assert.ok(shortcut, `${actionId} consumes ${target.targetId}`);
        assert.ok(shortcut.targetRefs.includes(target.targetId));
        assert.ok(shortcut.requiredUiStateRefs.includes(state.stateId));
        assert.ok(shortcut.requiredFiles.includes(state.filename));
      }
    }
  }

  for (const target of inventory.targets.filter((candidate) => candidate.probeOnly === true)) {
    assert.ok(
      target.expectedUiStateRefs.some((stateId) => probeOnlyStateIds.has(stateId)),
      `${target.targetId} maps to a registered probe-only state`,
    );
  }
}

assertInventoryCoverageRelationships();
assertProbeOnlyCoverageRelationships();

const unusedTopbarEnabledState = {
  filename: '1c_TopbarToBottomEnabled_ThreadBottom.txt',
  stateId: 'topbar-bottom-enabled-thread-bottom',
};
assert.equal(
  scrapeStateRegistry.some(
    (entry) =>
      entry.filename === unusedTopbarEnabledState.filename ||
      entry.stateId === unusedTopbarEnabledState.stateId,
  ),
  false,
  'the unused top-bar-enabled state is absent from the active scrape registry',
);
assert.equal(
  inventory.targets.some((target) =>
    target.expectedFiles.includes(unusedTopbarEnabledState.filename),
  ),
  false,
  'no required target depends on the removed top-bar-enabled state',
);
const removedUnconsumedCaptureFiles = [
  {
    filename: '2e_ModelSwitcher_ConfigureDialog_CurrentSelection.txt',
    stateId: 'model-switcher-configure-dialog',
  },
  {
    filename: '2f_ModelSwitcher_ConfigureDialog_ModelSelectionListbox.txt',
    stateId: 'model-switcher-configure-listbox',
  },
  {
    filename: '2g_ModelSwitcher_ConfigureDialog_ConfigureLatest_FrontendRows.txt',
    stateId: 'model-switcher-configure-latest-dialog',
  },
  {
    filename: '2h_ModelSwitcher_ConfigureDialog_Configure5-2_FrontendRows.txt',
    stateId: 'model-switcher-configure-5-2-dialog',
  },
  {
    filename: '2i_ModelSwitcher_ConfigureDialog_Configure5-4_FrontendRows.txt',
    stateId: 'model-switcher-configure-5-4-dialog',
  },
  {
    filename: '2j_ModelSwitcher_ConfigureDialog_ConfigureO3_FrontendRows.txt',
    stateId: 'model-switcher-configure-o3-dialog',
  },
  {
    filename: '2l_Composer_AddFilesAndMore_More_Submenu.txt',
    stateId: 'composer-add-files-and-more-more-submenu',
  },
  {
    filename: '2m_Header_ConversationOptions_Menu.txt',
    stateId: 'header-conversation-options-menu',
  },
];
for (const removed of removedUnconsumedCaptureFiles) {
  assert.equal(
    scrapeStateRegistry.some(
      (entry) => entry.filename === removed.filename || entry.stateId === removed.stateId,
    ),
    false,
    `${removed.filename} should be absent from the active scrape registry`,
  );
  assert.equal(
    inventory.targets.some((target) => target.expectedFiles.includes(removed.filename)),
    false,
    `no current target should depend on ${removed.filename}`,
  );
}
for (const filename of [
  '1d_TopbarToBottomDisabled_ThreadBottom.txt',
  '2b_AgentOrUserTurn_SubmenuRegenerate_AfterWebSearchResponse_RegenerateSubmenu - Copy.txt',
  '2d_SubmenuForModelSwitcher_data-testid_model-switcher-dropdown-button.txt',
  '2k_Composer_AddFilesAndMore_Menu.txt',
]) {
  assert.ok(
    scrapeStateRegistry.some((entry) => entry.filename === filename),
    `${filename} remains in the active scrape registry`,
  );
}
for (const targetId of [
  'model-switcher-configure-dialog',
  'model-switcher-configure-model-listbox',
  'model-switcher-configure-pro-row',
]) {
  assert.equal(
    shortcutActionMetadata.TARGET_DESCRIPTORS.some((target) => target.targetId === targetId),
    false,
    `${targetId} is removed because no active shortcut consumes it`,
  );
  assert.equal(
    inventory.targets.some((target) => target.targetId === targetId),
    false,
    `${targetId} does not remain in the computed target inventory`,
  );
  assert.equal(
    shortcutActionMetadata.SHORTCUT_ACTIONS.some((action) => action.targetRefs.includes(targetId)),
    false,
    `${targetId} is not referenced by a canonical shortcut action`,
  );
}
const requiredThreadBottomTarget = inventory.targets.find(
  (target) => target.targetId === 'thread-bottom',
);
assert.deepEqual(
  requiredThreadBottomTarget?.expectedFiles,
  ['1d_TopbarToBottomDisabled_ThreadBottom.txt'],
  'required thread-bottom coverage continues to use the disabled layout capture',
);

for (const targetId of ['previous-response-button', 'next-response-button']) {
  assert.equal(
    shortcutActionMetadata.TARGET_DESCRIPTORS.some((target) => target.targetId === targetId),
    false,
    `${targetId} should not remain as a retired response navigation descriptor`,
  );
  assert.equal(
    inventory.targets.some((target) => target.targetId === targetId),
    false,
    `${targetId} should not remain in the computed target inventory`,
  );
  assert.equal(
    shortcutActionMetadata.SHORTCUT_ACTIONS.some((action) => action.targetRefs.includes(targetId)),
    false,
    `${targetId} should not be referenced by a canonical shortcut action`,
  );
}
for (const actionId of ['shortcutKeyPreviousThread', 'shortcutKeyNextThread']) {
  assert.equal(
    shortcutActionMetadata.SHORTCUT_ACTIONS.some((action) => action.actionId === actionId),
    false,
    `${actionId} should not remain as a retired response navigation action`,
  );
  assert.equal(inventory.allRuntimeActionIds.includes(actionId), false);
  assert.equal(inventory.handlerActionIds.includes(actionId), false);
  assert.equal(
    inventory.shortcuts.some((action) => action.actionId === actionId),
    false,
  );
}

const retiredSidebarTargetIds = [
  'close-sidebar-button',
  'stage-slideover-sidebar-control',
  'stage-popover-sidebar-control',
];
for (const targetId of retiredSidebarTargetIds) {
  assert.equal(
    shortcutActionMetadata.TARGET_DESCRIPTORS.some((target) => target.targetId === targetId),
    false,
    `${targetId} should not remain as a parallel legacy descriptor`,
  );
  assert.equal(
    inventory.targets.some((target) => target.targetId === targetId),
    false,
    `${targetId} should not remain in the computed target inventory`,
  );
}

const retiredGeneralThinkingEffortTargetIds = [
  'model-switcher-thinking-effort-standard',
  'model-switcher-thinking-effort-extended',
];
for (const targetId of retiredGeneralThinkingEffortTargetIds) {
  assert.equal(
    shortcutActionMetadata.TARGET_DESCRIPTORS.some((target) => target.targetId === targetId),
    false,
    `${targetId} should not remain as an unreferenced canonical descriptor`,
  );
  assert.equal(
    inventory.targets.some((target) => target.targetId === targetId),
    false,
    `${targetId} should not remain in the computed target inventory`,
  );
}
const retiredUnusedIconFallbackTargetIds = [
  'assistant-thinking-trigger',
  'composer-think-longer-action',
  'composer-more-submenu-trigger',
];
for (const targetId of retiredUnusedIconFallbackTargetIds) {
  assert.equal(
    shortcutActionMetadata.TARGET_DESCRIPTORS.some((target) => target.targetId === targetId),
    false,
    `${targetId} should not remain as an unreferenced canonical descriptor`,
  );
  assert.equal(
    inventory.targets.some((target) => target.targetId === targetId),
    false,
    `${targetId} should not remain in the computed target inventory`,
  );
  assert.equal(
    shortcutActionMetadata.SHORTCUT_ACTIONS.some((action) => action.targetRefs.includes(targetId)),
    false,
    `${targetId} should not be referenced by a canonical shortcut action`,
  );
}
for (const [actionId, targetId] of [
  ['shortcutKeyProStandard', 'model-switcher-pro-thinking-effort-standard'],
  ['shortcutKeyProExtended', 'model-switcher-pro-thinking-effort-extended'],
]) {
  assert.ok(
    shortcutActionMetadata.SHORTCUT_ACTIONS.find(
      (action) => action.actionId === actionId,
    )?.targetRefs.includes(targetId),
    `${actionId} should retain its canonical Pro target reference`,
  );
}

const sidebarToggleAction = shortcutActionMetadata.SHORTCUT_ACTIONS.find(
  (action) => action.actionId === 'shortcutKeyToggleSidebar',
);
const sidebarToggleTarget = shortcutActionMetadata.TARGET_DESCRIPTORS.find(
  (target) => target.targetId === 'native-sidebar-toggle-control',
);
const sidebarToggleInventoryTarget = inventory.targets.find(
  (target) => target.targetId === 'native-sidebar-toggle-control',
);
const expectedSidebarUiStateCoverage = [
  'sidebar-expanded-body',
  'sidebar-collapsed-body',
  'narrow-header-sidebar-popover-control',
];
assert.deepEqual(sidebarToggleAction?.targetRefs, ['native-sidebar-toggle-control']);
assert.deepEqual(sidebarToggleAction?.uiStateRefs, expectedSidebarUiStateCoverage);
assert.deepEqual(sidebarToggleTarget?.uiStateRefs, expectedSidebarUiStateCoverage);
assert.deepEqual(sidebarToggleInventoryTarget?.expectedUiStateRefs, expectedSidebarUiStateCoverage);
assert.deepEqual(sidebarToggleInventoryTarget?.usedByActionIds, ['shortcutKeyToggleSidebar']);
assert.deepEqual(sidebarToggleInventoryTarget?.expectedFiles, [
  '1a_SideBarCollapsed_body.txt',
  '1b_SidebarExpaneded_body.txt',
  '1e2_NarrowViewport_HeaderArea_StagePopoverSidebarControl.txt',
]);

function assertRequiredCapabilities(rows, key, expectedAnnotations) {
  for (const [id, requiredCapabilities] of Object.entries(expectedAnnotations)) {
    const row = rows.find((candidate) => candidate[key] === id);
    assert.ok(row, `${id} should be registered`);
    assert.deepEqual(
      row.requiredCapabilities,
      requiredCapabilities,
      `${id} should declare only its required capabilities`,
    );
  }
}

assertRequiredCapabilities(scrapeStateRegistry, 'stateId', {
  'model-switcher-pro-thinking-effort-menu': ['proEffort', 'dedicatedEffortControls'],
});
assertRequiredCapabilities(shortcutActionMetadata.TARGET_DESCRIPTORS, 'targetId', {
  'model-switcher-thinking-effort-action': ['dedicatedEffortControls'],
  'model-switcher-thinking-effort-menu': ['dedicatedEffortControls'],
  'model-switcher-thinking-effort-light': ['dedicatedEffortControls'],
  'model-switcher-thinking-effort-heavy': ['dedicatedEffortControls'],
  'model-switcher-pro-thinking-effort-action': ['proEffort', 'dedicatedEffortControls'],
  'model-switcher-pro-thinking-effort-menu': ['proEffort', 'dedicatedEffortControls'],
  'model-switcher-pro-thinking-effort-standard': ['proEffort', 'dedicatedEffortControls'],
  'model-switcher-pro-thinking-effort-extended': ['proEffort', 'dedicatedEffortControls'],
});
assertRequiredCapabilities(shortcutActionMetadata.SHORTCUT_ACTIONS, 'actionId', {
  shortcutKeyProStandard: ['proEffort', 'dedicatedEffortControls'],
  shortcutKeyProExtended: ['proEffort', 'dedicatedEffortControls'],
  shortcutKeyThinkingLight: ['dedicatedEffortControls'],
  shortcutKeyThinkingHeavy: ['dedicatedEffortControls'],
});
assertRequiredCapabilities(inventory.shortcuts, 'actionId', {
  shortcutKeyProStandard: ['proEffort', 'dedicatedEffortControls'],
  shortcutKeyProExtended: ['proEffort', 'dedicatedEffortControls'],
  shortcutKeyThinkingLight: ['dedicatedEffortControls'],
  shortcutKeyThinkingHeavy: ['dedicatedEffortControls'],
});

for (const [targetId, expectedFiles] of [
  [
    'model-switcher-pro-thinking-effort-action',
    ['2d_SubmenuForModelSwitcher_data-testid_model-switcher-dropdown-button.txt'],
  ],
  ['model-switcher-pro-thinking-effort-menu', ['2d2_ModelSwitcher_ProThinkingEffort_Submenu.txt']],
  [
    'model-switcher-pro-thinking-effort-standard',
    ['2d2_ModelSwitcher_ProThinkingEffort_Submenu.txt'],
  ],
  [
    'model-switcher-pro-thinking-effort-extended',
    ['2d2_ModelSwitcher_ProThinkingEffort_Submenu.txt'],
  ],
]) {
  assert.deepEqual(
    inventory.targets.find((target) => target.targetId === targetId)?.expectedFiles,
    expectedFiles,
    `${targetId} expected capture files should remain unchanged`,
  );
}
const searchConversationTarget = shortcutActionMetadata.TARGET_DESCRIPTORS.find(
  (target) => target.targetId === 'search-conversation-button',
);
assert.ok(
  searchConversationTarget?.matchGroups[0]?.includes('M9.16211 2.37976'),
  'Search Conversations should prefer the current language-independent sidebar Search SVG path',
);
const searchConversationAction = shortcutActionMetadata.SHORTCUT_ACTIONS.find(
  (action) => action.actionId === 'shortcutKeySearchConversationHistory',
);
assert.ok(
  searchConversationAction.targetRefs.includes(
    searchConversationAction.activationProbe.expectedTargetRef,
  ),
  'the search action must explicitly associate its opened dialog as well as its trigger',
);
assert.deepEqual(
  inventory.targets.find((target) => target.targetId === 'search-chats-dialog').usedByActionIds,
  ['shortcutKeySearchConversationHistory'],
  'the opened search dialog must be attributed to the search shortcut in target reports',
);
function readRuntimeSelector(source, name) {
  const match = source.match(new RegExp(`const ${name}\\s*=\\s*'([^']+)';`));
  assert.ok(match, `content.js should define ${name}`);
  return match[1];
}

function selectorPresenceNeedle(selector) {
  const testIdPrefix = selector.match(/\[data-testid\^="([^"]+)"\]/);
  if (testIdPrefix) return testIdPrefix[1];

  const attributeValue = selector.match(/\[([a-z][\w-]*)="([^"]+)"\]/);
  if (attributeValue) return `${attributeValue[1]}="${attributeValue[2]}"`;

  const attribute = selector.match(/\[([a-z][\w-]*)\]/);
  assert.ok(attribute, `runtime selector should expose a static attribute token: ${selector}`);
  return attribute[1];
}

const runtimeMessageSelectorAlternatives = [
  readRuntimeSelector(contentSource, 'CHATGPT_MESSAGE_UNIT_SELECTOR'),
  ...readRuntimeSelector(contentSource, 'CHATGPT_ROLE_MESSAGE_SELECTOR').split(', '),
  ...readRuntimeSelector(contentSource, 'CONVERSATION_TURN_SELECTOR').split(', '),
];
const runtimeMessageSelectorGroups = runtimeMessageSelectorAlternatives.map((selector) => [
  selectorPresenceNeedle(selector),
]);
const scrollAnchorStateIds = [
  'user-turn-buttons-exposed',
  'assistant-turn-non-web-buttons-exposed',
  'assistant-turn-web-buttons-exposed',
];
const scrollAnchorStateFiles = scrapeStateRegistry
  .filter((entry) => scrollAnchorStateIds.includes(entry.stateId))
  .map((entry) => entry.filename)
  .sort();

for (const [targetId, actionIds] of [
  ['message-scroll-up-delta', ['shortcutKeyScrollUpOneMessage', 'shortcutKeyScrollUpTwoMessages']],
  [
    'message-scroll-down-delta',
    ['shortcutKeyScrollDownOneMessage', 'shortcutKeyScrollDownTwoMessages'],
  ],
]) {
  const target = inventory.targets.find((row) => row.targetId === targetId);
  assert.ok(target, `${targetId} should have explicit static anchor metadata`);
  assert.equal(target.kind, 'selector-list');
  assert.match(target.identifier, /static message-scroll anchor presence only/);
  assert.match(target.notes, /does not prove scrolling or shortcut activation/);
  assert.deepEqual(target.expectedUiStateRefs.slice().sort(), scrollAnchorStateIds.slice().sort());
  assert.deepEqual(target.expectedFiles.slice().sort(), scrollAnchorStateFiles);
  assert.deepEqual(
    target.matchGroups,
    runtimeMessageSelectorGroups,
    `${targetId} match groups should derive from the runtime selector alternatives, with OR fallback semantics`,
  );
  assert.ok(
    target.matchGroups.every((group) => group.length === 1),
    `${targetId} selector alternatives should remain OR groups rather than a combined selector requirement`,
  );

  for (const selectorGroup of target.matchGroups) {
    const [needle] = selectorGroup;
    const matchedFile = target.expectedFiles[0];
    const syntheticFiles = Object.fromEntries(
      target.expectedFiles.map((file) => [file, '<div data-unrelated="fixture"></div>']),
    );
    syntheticFiles[matchedFile] =
      needle === 'conversation-turn-'
        ? '<section data-testid="conversation-turn-0"></section>'
        : `<div ${needle}></div>`;
    const staticPresence = evaluateTargetPresence(target, syntheticFiles);
    assert.equal(
      staticPresence.status,
      'pass',
      `${targetId} synthetic selector-presence evidence should pass the static target check for ${needle} only`,
    );
    assert.deepEqual(staticPresence.matchedExpectedFiles, [matchedFile]);
  }

  for (const actionId of actionIds) {
    const action = shortcutActionMetadata.SHORTCUT_ACTIONS.find((row) => row.actionId === actionId);
    assert.deepEqual(action.targetRefs, [targetId]);
    assert.equal(action.activationProbe.mode, 'dom-state');
    assert.equal(action.activationProbe.expectedTargetRef, targetId);
    assert.equal(
      action.activationProbe.setup,
      targetId === 'message-scroll-up-delta'
        ? 'message-scroll-from-bottom'
        : 'message-scroll-from-top',
    );
    assert.match(action.activationProbe.notes, /scroll position/);
  }
}

for (const [targetId, expectedFilename] of [
  ['search-chats-dialog', '2n_SearchChats_Dialog.txt'],
  ['shortcut-overlay', '2o_ShortcutOverlay_Dialog.txt'],
]) {
  assert.deepEqual(
    inventory.targets.find((target) => target.targetId === targetId).expectedFiles,
    [expectedFilename],
    'safe target captures must use their registered state files rather than unrelated dumps',
  );
}

const chatWorkAction = shortcutActionMetadata.SHORTCUT_ACTIONS.find(
  (row) => row.actionId === 'shortcutKeyToggleChatWork',
);
assert.equal(chatWorkAction.activationProbe.mode, 'not-live-probed');
assert.equal(chatWorkAction.activationProbe.safe, false);

const stopAndTranscribeDictationAction = shortcutActionMetadata.SHORTCUT_ACTIONS.find(
  (row) => row.actionId === 'shortcutKeyStopAndTranscribeDictation',
);
assert.equal(stopAndTranscribeDictationAction.validationMode, 'manual-only');
assert.equal(stopAndTranscribeDictationAction.activationProbe.mode, 'manual-only');

const newGptProbeState = scrapeStateRegistry.find(
  (entry) => entry.stateId === 'probe-new-gpt-conversation',
);
assert.deepEqual(
  newGptProbeState.steps.map((step) => step.type),
  ['open-gpt-menu'],
  'the GPT target state should open only the existing GPT menu on its fixture',
);
const newConversationAction = shortcutActionMetadata.SHORTCUT_ACTIONS.find(
  (row) => row.actionId === 'shortcutKeyNewConversation',
);
assert.equal(newConversationAction.activationProbe.expectedTargetRef, 'prompt-textarea');
assert.equal(newConversationAction.activationProbe.setup, 'new-conversation');
assert.ok(
  newConversationAction.activationProbe.uiStateRefs.includes(
    'topbar-bottom-disabled-thread-bottom',
  ),
);
assert.deepEqual(newConversationAction.targetRefs, ['create-new-chat-button']);

const codeboxWrapTarget = inventory.targets.find(
  (target) => target.targetId === 'codebox-wrap-enabled',
);
assert.deepEqual(
  codeboxWrapTarget.matchGroups,
  [
    ['csp-codebox-wrap-enabled', '<pre'],
    ['csp-codebox-wrap-enabled', '<code'],
  ],
  'codebox wrap evidence must include the enabled root-class token with code content',
);

const retiredThinkingOptionTargets = inventory.targets
  .filter((target) => target.targetId.startsWith('assistant-thinking-option-'))
  .map((target) => target.targetId);
assert.deepEqual(
  retiredThinkingOptionTargets,
  [],
  'unmapped legacy option fallbacks stay unclaimed',
);
for (const fallbackNeedle of [
  "'thinking-extended': '#143e56'",
  "'thinking-standard': '#fec800'",
  "'thinking-light': '#407870'",
  "'thinking-heavy': '#3c5754'",
]) {
  assert.ok(
    contentSource.includes(fallbackNeedle),
    `retiring an unsupported target descriptor must keep the runtime fallback ${fallbackNeedle}`,
  );
}

const expectedListenerIds = getExpectedKeyboardListenerContracts().map(
  (contractRow) => contractRow.contractId,
);
assert.deepEqual(
  inventory.keyboardListeners
    .filter((listener) => listener.classification !== 'presentation-lifecycle')
    .map((listener) => listener.contractId),
  expectedListenerIds,
  'all shortcut key listeners should have explicit fixed-contract classifications',
);
assert.deepEqual(
  inventory.presentationLifecycleListeners.map((listener) => listener.lifecycleId),
  ['slim-sidebar-interaction-refresh'],
);
assert.ok(
  inventory.fixedKeyboardContracts.every((contractRow) => contractRow.status === 'present'),
  'every expected fixed keyboard contract should be present in content.js',
);
const expectedSourceContractIds = getExpectedSourceKeyboardContracts().map(
  (contractRow) => contractRow.contractId,
);
assert.deepEqual(
  inventory.fixedKeyboardContracts
    .filter((contractRow) => expectedSourceContractIds.includes(contractRow.contractId))
    .map((contractRow) => contractRow.contractId),
  expectedSourceContractIds,
  'modifier, preview, gate, overlay, and PageUp/PageDown source contracts should be represented',
);

const profileNames = ['legacy', 'latest'];
const expectedSlots = Array.from({ length: inventory.modelPickerSlotCount }, (_, slot) => slot);
assert.equal(
  inventory.modelPickerSlotRows.length,
  inventory.modelPickerSlotCount * profileNames.length - 1,
  'only actionable positions appear; a genuinely empty hole is omitted',
);
assert.ok(!inventory.modelPickerSlotRows.some((row) => row.rowId === 'model:legacy:10:empty'));
assert.equal(inventory.modelPickerProfiles.legacy.emptyCount, 1);
assert.equal(inventory.modelPickerProfiles.legacy.rows.length, inventory.modelPickerSlotCount);
assert.equal(inventory.presentationLifecycleListeners.length, 1);
assert.equal(
  inventory.presentationLifecycleListeners[0].owner,
  'extension/content.js slim-sidebar presentation lifecycle',
);
for (const profile of profileNames) {
  const rows = inventory.modelPickerProfiles[profile]?.rows || [];
  assert.deepEqual(
    rows.map((row) => row.slot),
    expectedSlots,
    `${profile} should retain exact slot order from zero through the configured maximum`,
  );
  assert.equal(
    new Set(rows.map((row) => row.rowId)).size,
    rows.length,
    `${profile} model slot row ids should be unique`,
  );
  assert.equal(
    rows.reduce((total, row) => total + (row.assigned ? 1 : 0), 0),
    inventory.modelPickerProfiles[profile].assignedCount,
    `${profile} assignment summary should reconcile with row data`,
  );
  assert.ok(
    rows.some((row) => row.availability === 'presented'),
    `${profile} should have at least one currently presented model action`,
  );
  assert.ok(
    rows.some((row) => row.availability === 'unavailable'),
    `${profile} should preserve assigned/canonical but non-presented slots for audit coverage`,
  );
}

console.log(
  JSON.stringify(
    {
      runtimeActions: inventory.allRuntimeActionIds.length,
      handlerActions: inventory.handlerActionIds.length,
      targetDescriptors: inventory.targets.length,
      fixedKeyboardContracts: inventory.fixedKeyboardContracts.length,
      modelPickerSlotRows: inventory.modelPickerSlotRows.length,
      modelPickerProfiles: Object.fromEntries(
        profileNames.map((profile) => [
          profile,
          {
            slots: inventory.modelPickerProfiles[profile].slotCount,
            assigned: inventory.modelPickerProfiles[profile].assignedCount,
            presented: inventory.modelPickerProfiles[profile].presentedCount,
            unavailable: inventory.modelPickerProfiles[profile].unavailableCount,
            empty: inventory.modelPickerProfiles[profile].emptyCount,
          },
        ]),
      ),
      inventoryIssues: inventory.inventoryIssues.length,
    },
    null,
    2,
  ),
);
