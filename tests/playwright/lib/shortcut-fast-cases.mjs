import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import {
  buildCurrentShortcutInventory,
  loadDevScrapeWideContract,
} from './devscrape-wide-core.mjs';
import { DEFAULT_TAB_LIMIT, settleTabPool } from './shortcut-tab-pool.mjs';

export const RESULT_PATH = new URL('../shortcut-fast-results.local.json', import.meta.url);
export const CATALOGUE_RESULT_PATH = new URL(
  '../shortcut-fast-catalogue.local.json',
  import.meta.url,
);
export const LIVE_RESULT_PATH = new URL(
  '../shortcut-fast-live-results.local.json',
  import.meta.url,
);
export const REGISTRY_PATH = new URL('../shortcut-fast-conversations.local.json', import.meta.url);
export const FAST_CASES = [
  ...[
    'shortcutKeyToggleModelSelector',
    'shortcutKeyThinkingLight',
    'shortcutKeyThinkingHeavy',
    'shortcutKeyProStandard',
    'shortcutKeyProExtended',
  ].map((actionId) => ({
    actionId,
    type: 'model-control',
    fixtureCode: 'KeyQ',
    parallelSafe: true,
  })),
  {
    actionId: 'selectThenCopyAllMessages',
    type: 'clipboard-all',
    fixture: 'response',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyCopyLowest',
    type: 'clipboard-lowest',
    fixture: 'response',
    parallelSafe: true,
  },
  {
    actionId: 'selectThenCopy',
    type: 'clipboard-message',
    fixture: 'response',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyNewGptConversation',
    type: 'gpt-menu',
    fixture: 'gpt',
    fixtureCode: 'KeyG',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyAddPhotosFiles',
    type: 'menu-cascade',
    fixture: 'composer-tools',
    fixtureCode: 'KeyU',
    fixtureIcon: '<svg><path d="M7.99994 14.6888" /><path d="M9.9998 18.3614" /></svg>',
    parallelSafe: true,
  },
  ...[
    'shortcutKeyToggleDictate',
    'shortcutKeyStopAndTranscribeDictation',
    'shortcutKeyCancelDictation',
    'shortcutKeyMoreDotsReadAloud',
  ].map((actionId, index) => ({
    actionId,
    type: 'media-control',
    fixture: 'composer',
    fixtureCode: ['KeyY', 'KeyH', 'KeyK', 'KeyL'][index],
    parallelSafe: true,
  })),
  {
    actionId: 'shortcutKeyCopyAllCodeBlocks',
    type: 'clipboard-code',
    fixture: 'code',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyRegenerateTryAgain',
    type: 'response-menu',
    fixture: 'response',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyRegenerateAskToChangeResponse',
    type: 'response-menu',
    fixture: 'response',
    fixtureCode: 'KeyD',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyMoreDotsBranchInNewChat',
    type: 'response-menu',
    fixture: 'response',
    fixtureCode: 'KeyB',
    parallelSafe: true,
  },
  { actionId: 'shortcutKeyShowOverlay', type: 'overlay', fixture: 'blank', parallelSafe: true },
  {
    actionId: 'fixed:page-up-down-takeover',
    contractId: 'page-up-down-takeover',
    type: 'scroll-page',
    fixture: 'scroll-and-code',
    fixtureCode: 'PageDown',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyNewConversationInNewTab',
    type: 'new-tab',
    fixture: 'blank',
    fixtureCode: 'KeyB',
    parallelSafe: false,
  },
  ...[
    ['shortcutKeyScrollUpOneMessage', 575],
    ['shortcutKeyScrollUpTwoMessages', 275],
    ['shortcutKeyScrollDownOneMessage', 875],
    ['shortcutKeyScrollDownTwoMessages', 1175],
  ].map(([actionId, expectedScrollTop]) => ({
    actionId,
    type: 'scroll-message',
    fixture: 'scroll-and-code',
    expectedScrollTop,
    parallelSafe: true,
  })),
  {
    actionId: 'shortcutKeySendEdit',
    type: 'edit-submit',
    fixture: 'response-variants',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyShare',
    type: 'header-share',
    fixture: 'response-variants',
    fixtureCode: 'KeyH',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyToggleChatWork',
    type: 'blank-mode',
    fixture: 'blank',
    parallelSafe: false,
  },
  {
    actionId: 'shortcutKeyNewConversation',
    type: 'new-conversation',
    fixture: 'existing-conversation',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeySearchConversationHistory',
    type: 'direct-control',
    fixture: 'sidebar',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyClickStopButton',
    type: 'control-gate',
    fixture: 'composer',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyCreateImage',
    type: 'menu-cascade',
    fixture: 'composer-tools',
    fixtureCode: 'KeyI',
    fixtureIcon: '<svg><path d="M7 21.005" /></svg>',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyDeepResearch',
    type: 'menu-cascade',
    fixture: 'composer-tools',
    fixtureCode: 'KeyD',
    fixtureIcon: '<img src="https://chatgpt.com/deep_research_app/icon.png" />',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyClickNativeScrollToBottom',
    type: 'scroll-dom',
    fixture: 'scroll-and-code',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyScrollToTop',
    type: 'scroll-dom',
    fixture: 'scroll-and-code',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyEdit',
    type: 'message-edit',
    fixture: 'response-variants',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyToggleCodeboxWrap',
    type: 'code-dom',
    fixture: 'scroll-and-code',
    fixtureCode: 'KeyV',
    parallelSafe: false,
  },
  {
    actionId: 'shortcutKeySearchWeb',
    type: 'menu-cascade',
    fixture: 'composer-tools',
    fixtureIcon: '<svg><path d="M12 2c5.522" /></svg>',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyStudy',
    type: 'menu-cascade',
    fixture: 'composer-tools',
    fixtureCode: 'KeyS',
    fixtureQuery: 'study',
    fixturePillIconId: 'book-open-light-20',
    fixtureIcon: '<svg><use href="#book-open-light-20"></use></svg>',
    parallelSafe: true,
  },
  {
    actionId: 'shortcutKeyClickSendButton',
    type: 'control-gate',
    fixture: 'composer',
    parallelSafe: true,
  },
  { actionId: 'shortcutKeyActivateInput', type: 'focus', fixture: 'blank', parallelSafe: true },
  { actionId: 'shortcutKeyToggleSidebar', type: 'toggle', fixture: 'sidebar', parallelSafe: false },
  {
    actionId: 'shortcutKeyTemporaryChat',
    type: 'before-first-message',
    fixture: 'blank',
    parallelSafe: false,
  },
];
export const fingerprint = (text) => createHash('sha256').update(text).digest('hex');
export class FastAdapterUnavailableError extends Error {}

export const FAST_ADAPTER_TYPES = new Set([
  'model-slot',
  'model-unassigned',
  'model-control',
  'media-control',
  'clipboard-code',
  'clipboard-message',
  'clipboard-lowest',
  'clipboard-all',
  'response-menu',
  'gpt-menu',
  'overlay',
  'scroll-page',
  'new-tab',
  'scroll-message',
  'edit-submit',
  'header-share',
  'blank-mode',
  'direct-control',
  'new-conversation',
  'control-gate',
  'menu-cascade',
  'scroll-dom',
  'message-edit',
  'code-dom',
  'focus',
  'toggle',
  'before-first-message',
]);

export async function preflightFastCases(report, selected, extract) {
  const extracted = new Map();
  for (let index = selected.length - 1; index >= 0; index--) {
    const item = selected[index];
    try {
      if (!FAST_ADAPTER_TYPES.has(item.type))
        throw new FastAdapterUnavailableError(`No adapter for case type ${item.type}`);
      extracted.set(item.actionId, await extract(item));
    } catch (error) {
      if (error instanceof FastAdapterUnavailableError)
        report.warnings.push({
          actionId: item.actionId,
          owner: 'fast-fixture-adapter',
          reason: error.message,
        });
      else
        report.issues.push({
          actionId: item.actionId,
          fatal: true,
          message: `Source preflight failed: ${error.message}`,
        });
      selected.splice(index, 1);
    }
  }
  return extracted;
}
const FIXED_FAST_PROOFS = {
  'model-picker-slot-dispatch': ['model:legacy:3:configure-latest'],
  'shortcut-overlay-opener': ['shortcutKeyShowOverlay'],
  'shortcut-overlay-dismissal': ['shortcutKeyShowOverlay'],
  'overlay-alt-only-capture': ['shortcutKeyShowOverlay'],
  'page-up-down-takeover': ['fixed:page-up-down-takeover'],
  'page-up-down-enable-gate': ['fixed:page-up-down-takeover'],
  'runtime-shortcut-dispatch': ['shortcutKeyActivateInput'],
  'alt-modifier-isolation': ['shortcutKeyActivateInput'],
  'ctrl-send-gate': ['shortcutKeyClickSendButton'],
  'ctrl-stop-gate': ['shortcutKeyClickStopButton'],
};
const FIXED_DEFERRED_POLICIES = {
  'model-picker-slot-dispatch': {
    category: 'model-profile-queue',
    reason:
      'Separate window slot listener/profile/action queue requires the deferred model adapter; global document digit dispatch does not establish its selected-model effect.',
    unblock:
      'Use real window slot dispatch, profile assignments and action queue in one bounded current-picker page per profile.',
  },
  ...Object.fromEntries(
    ['shortcut-overlay-opener', 'shortcut-overlay-dismissal', 'overlay-alt-only-capture'].map(
      (id) => [
        id,
        {
          category: 'overlay-hydration',
          reason:
            'The real overlay has a separate listener, asynchronous settings/model hydration and renderer. A fake overlay or global dispatcher proof cannot establish opening, dismissal or capture behavior.',
          unblock:
            'Provide in-memory storage/model inputs to the real overlay listener/render path, then assert Alt-only open, Escape dismissal and capture together on one page.',
        },
      ],
    ),
  ),
};
const DEFERRED_FAMILIES = [
  {
    ids: [
      'shortcutKeyToggleModelSelector',
      'shortcutKeyThinkingLight',
      'shortcutKeyThinkingHeavy',
      'shortcutKeyProStandard',
      'shortcutKeyProExtended',
    ],
    category: 'model-profile-queue',
    reason:
      'Real picker opening/effort actions depend on profile hints, menu preparation and the action queue. A global listener or fake window callback would not prove the model target/effect; the 5000 ms recovery path is omitted from the fast fixture.',
    unblock:
      'Build one bounded structural current-picker adapter with real picker helpers/queue and selected-model or effort assertions for each profile, then admit individual actions.',
  },
  {
    ids: ['shortcutKeyShowOverlay'],
    category: 'overlay-hydration',
    reason:
      'The separate overlay listener awaits settings and model-data hydration before rendering. Its storage lifecycle and full overlay renderer are outside the tiny global dispatcher fixture; calling a fake opener would not prove it.',
    unblock:
      'Extract the real overlay listener/render path with in-memory settings/model data, then assert opening, Escape dismissal and Alt-only capture on one page.',
  },
  {
    ids: [
      'shortcutKeyCopyLowest',
      'selectThenCopy',
      'selectThenCopyAllMessages',
      'shortcutKeyCopyAllCodeBlocks',
    ],
    category: 'clipboard-omitted',
    reason:
      'Clipboard content/MIME, permission recovery and selection restoration are explicitly omitted from the default fast fixture. Native clipboard permission/content must not be changed for this audit.',
    unblock:
      'Add an opt-in isolated clipboard substitute fixture that runs the real copy/selection handlers and asserts payload/restoration without native permission writes.',
  },
  {
    ids: [
      'shortcutKeyToggleDictate',
      'shortcutKeyStopAndTranscribeDictation',
      'shortcutKeyCancelDictation',
      'shortcutKeyMoreDotsReadAloud',
    ],
    category: 'audio-omitted',
    reason:
      'Microphone, transcription and audio effects are omitted by request. A button click alone cannot prove recording, recognized text submission or playback.',
    unblock:
      'Use a separate opt-in media fixture with isolated recording/transcript/playback substitutes and explicit external-effect scope; preserve the source target inventory here.',
  },
  {
    ids: [
      'shortcutKeyRegenerateTryAgain',
      'shortcutKeyRegenerateAskToChangeResponse',
      'shortcutKeyMoreDotsBranchInNewChat',
      'shortcutKeyNewGptConversation',
    ],
    category: 'response-or-gpt-menu',
    reason:
      'These use distinct response/GPT-header menu helpers, delayed menu readiness and generation/branch/navigation effects. The composer Tools adapter does not establish their target scope or resulting lineage; repeated live scaffolding is omitted.',
    unblock:
      'Reuse the prepared response URL for optional live state; add one bounded native response/GPT menu adapter with the real helper and per-action effect before admitting siblings. Keep generation/lineage separate.',
  },
  {
    ids: ['shortcutKeyAddPhotosFiles'],
    category: 'native-upload-omitted',
    reason:
      'File upload invokes native file selection and account upload state; native dialogs/upload setup are excluded from this fast fixture.',
    unblock:
      'Add an opt-in isolated upload chooser fixture with real menu routing and explicit selection/result assertions, without touching user files.',
  },
];

export async function loadFastCatalogue() {
  // Rebuild generated profile cases on every discovery; never retain stale slots.
  for (let index = FAST_CASES.length - 1; index >= 0; index--)
    if (FAST_CASES[index].rowId?.startsWith('model:')) FAST_CASES.splice(index, 1);
  const { exports } = await loadDevScrapeWideContract();
  const inventory = await buildCurrentShortcutInventory([
    ...(exports.DUMP_REGISTRY || []),
    ...(exports.DEFERRED_ARTIFACTS || []),
  ]);
  const content = await readFile(new URL('../../../extension/content.js', import.meta.url), 'utf8');
  let temporaryKey = 0;
  for (const item of inventory.modelPickerSlotRows.filter((row) => row.availability !== 'empty')) {
    if (!FAST_CASES.some((row) => row.actionId === item.rowId)) {
      FAST_CASES.push({
        ...item,
        modelActionId: item.actionId,
        actionId: item.rowId,
        type: item.assigned ? 'model-slot' : 'model-unassigned',
        fixtureCode: item.assigned ? undefined : `F${++temporaryKey}`,
        parallelSafe: true,
      });
    } else if (!item.assigned) temporaryKey++;
  }
  const diagnosticRows = Object.values(inventory.modelPickerProfiles || {}).flatMap((profile) =>
    profile.rows
      .filter((item) => item.availability === 'empty')
      .map((item) => ({ ...item, inventoryScope: 'slot-diagnostic' })),
  );
  const admitted = new Set(FAST_CASES.map((item) => item.actionId));
  const rows = inventory.shortcuts
    .map((item) => ({
      rowId: `global:${item.actionId}`,
      actionId: item.actionId,
      code: item.defaultCode,
      targetRefs: item.targetRefs,
      type: item.activationProbeMode,
      requiredStates: item.requiredUiStateRefs,
      proofScope: 'source-contract',
      status:
        item.validationMode === 'not-applicable'
          ? 'not-applicable'
          : admitted.has(item.actionId)
            ? 'not-run'
            : 'deferred',
      admitted: admitted.has(item.actionId),
      owner: 'extension/content.js',
      deferCategory:
        !admitted.has(item.actionId) && item.validationMode !== 'not-applicable'
          ? DEFERRED_FAMILIES.find((family) => family.ids.includes(item.actionId))?.category
          : undefined,
      reason: admitted.has(item.actionId)
        ? 'Keyboard fixture is available; not yet run.'
        : item.validationMode === 'not-applicable'
          ? item.activationProbe?.notes ||
            'Authoritative inventory marks this retired/non-applicable.'
          : DEFERRED_FAMILIES.find((family) => family.ids.includes(item.actionId))?.reason ||
            'Missing explicit deferral policy.',
      unblock: admitted.has(item.actionId)
        ? ''
        : item.validationMode === 'not-applicable'
          ? ''
          : DEFERRED_FAMILIES.find((family) => family.ids.includes(item.actionId))?.unblock || '',
    }))
    .concat(
      inventory.fixedKeyboardContracts.map((item) => ({
        rowId: `fixed:${item.contractId}`,
        contractId: item.contractId,
        proofScope: 'source-contract',
        sourceStatus: item.status,
        admitted: Boolean(FIXED_FAST_PROOFS[item.contractId]),
        status: FIXED_FAST_PROOFS[item.contractId] ? 'not-run' : 'deferred',
        requiredActions: FIXED_FAST_PROOFS[item.contractId] || [],
        owner: 'extension/content.js',
        deferCategory: FIXED_DEFERRED_POLICIES[item.contractId]?.category,
        reason: FIXED_FAST_PROOFS[item.contractId]
          ? 'Derived only from explicit matching keyboard assertions in this run; source presence alone is insufficient.'
          : FIXED_DEFERRED_POLICIES[item.contractId]?.reason ||
            'Missing fixed contract deferral policy.',
        unblock: FIXED_FAST_PROOFS[item.contractId]
          ? ''
          : FIXED_DEFERRED_POLICIES[item.contractId]?.unblock || '',
      })),
      inventory.modelPickerSlotRows.map((item) => ({
        ...item,
        modelActionId: item.actionId,
        actionId: item.rowId,
        proofScope: 'source-contract',
        admitted: admitted.has(item.rowId),
        status: admitted.has(item.rowId) ? 'not-run' : 'deferred',
        owner: 'extension/content.js model runtime',
        deferCategory: 'model-profile-queue',
        reason:
          'Deferred setup bottleneck: the real profile-slot window listener feeds ModelPickerActionRunner, which owns current/legacy menu preparation and a 5000 ms queue recovery timeout. A global digit dispatch or helper-only call cannot prove the model effect.',
        unblock:
          'Add one structural current-picker page per Chat/Work profile with the real slot listener and action queue, then assert the native selected model. Keep it outside the default fixture until that adapter is bounded.',
      })),
    )
    .concat(
      diagnosticRows.map((item) => ({
        ...item,
        modelActionId: '',
        actionId: item.rowId,
        proofScope: 'source-contract',
        admitted: false,
        status: 'not-applicable',
        inventoryScope: 'slot-diagnostic',
        owner: 'extension/content.js model runtime diagnostics',
        reason: 'Empty positional slot is retained for array diagnostics, not an action.',
        unblock: '',
      })),
    );
  const issues = [...inventory.inventoryIssues];
  const manifest = JSON.parse(
    (await readFile(new URL('../../../extension/manifest.json', import.meta.url), 'utf8')).replace(
      /^\uFEFF/,
      '',
    ),
  );
  for (const [commandId, command] of Object.entries(manifest.commands || {})) {
    const target = commandId === '_execute_action' ? manifest.action?.default_popup : undefined;
    let targetExists = false;
    if (target) {
      try {
        await readFile(new URL(`../../../extension/${target}`, import.meta.url));
        targetExists = true;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    rows.push({
      rowId: `browser:${commandId}`,
      actionId: commandId,
      admitted: false,
      status: 'external',
      proofScope: 'static-wiring',
      owner: 'extension/manifest.json',
      code: command.suggested_key?.default,
      targetRefs: target ? [target] : [],
      reason: 'Browser-native activation is external and unexercised.',
      externalCoverage: {
        status: 'not-proven',
        reason: 'Browser-native activation is external and unexercised.',
      },
      wiringStatus:
        commandId === '_execute_action' ? (targetExists ? 'pass' : 'fail') : 'unverified',
    });
    if (commandId === '_execute_action' && !targetExists)
      issues.push({
        actionId: commandId,
        fatal: true,
        message: 'Declared browser command popup target is missing.',
      });
  }
  const scriptPaths = [
    ...new Set((manifest.content_scripts || []).flatMap((entry) => entry.js || [])),
    ...(manifest.background?.service_worker ? [manifest.background.service_worker] : []),
  ].filter((path) => !path.startsWith('lib/') && !path.startsWith('vendor/'));
  for (const path of scriptPaths) {
    if (path === 'content.js') continue;
    const source = await readFile(new URL(`../../../extension/${path}`, import.meta.url), 'utf8');
    if (/addEventListener\s*\(\s*['"]key(?:down|up|press)['"]/.test(source))
      rows.push({
        rowId: `listener:${path}`,
        admitted: false,
        status: 'deferred',
        owner: `extension/${path}`,
        proofScope: 'source-contract',
        reason: 'First-party keyboard listener requires explicit classification and an adapter.',
      });
  }
  for (const row of rows) {
    if (
      row.rowId.startsWith('model:') &&
      !row.assigned &&
      !row.code?.trim() &&
      row.availability === 'empty'
    ) {
      row.status = 'not-applicable';
      row.reason = 'Empty positional slot is retained for array diagnostics, not an action.';
      row.unblock = '';
      row.deferCategory = undefined;
    }
  }
  for (const row of rows.filter((item) => item.admitted && item.actionId)) {
    const family = DEFERRED_FAMILIES.find((item) => item.ids.includes(row.actionId));
    if (
      family &&
      [
        'clipboard-omitted',
        'audio-omitted',
        'native-upload-omitted',
        'response-or-gpt-menu',
      ].includes(family.category)
    ) {
      row.externalCoverage = {
        status: 'not-proven',
        lane: 'optional-external-integration',
        reason: {
          'clipboard-omitted':
            'Controlled payload and selection checks do not prove native clipboard permissions or OS clipboard integration.',
          'audio-omitted':
            'Controlled dispatch does not prove microphone access, transcription service results or native audio playback.',
          'native-upload-omitted':
            'Controlled chooser routing does not prove native file selection or account upload completion.',
          'response-or-gpt-menu':
            'Controlled response/menu effects do not prove live generation, server-side lineage or account navigation outcomes.',
        }[family.category],
        nextStep:
          'Use a targeted optional live/native diagnostic only when that external behavior needs investigation.',
      };
    }
  }
  for (const row of rows.filter((item) => item.status === 'deferred')) {
    const external = ['audio-omitted', 'native-upload-omitted'].includes(row.deferCategory);
    row.proposedLane = external ? 'split-local-and-external' : 'bounded-fixture-candidate';
    row.proofBoundary = external
      ? 'Local target/state proof only; real capture, transcription, playback or upload requires integration evidence.'
      : row.deferCategory === 'clipboard-omitted'
        ? 'Real handler selection/payload with isolated clipboard boundary; excludes OS permissions.'
        : 'Real listener/helper target and effect in controlled DOM; excludes account/network effects and recovery latency.';
    row.expectedBlocker = row.reason;
    row.nextStep = row.unblock;
    row.classificationStatus = 'provisional-unmeasured';
    if (
      row.deferCategory === 'model-profile-queue' ||
      row.deferCategory === 'source-only-lifecycle'
    ) {
      row.proofBoundary =
        row.rowId.startsWith('model:') && !(row.actionIds || []).length
          ? 'Catalogue-only slot position: current presentation exposes no action. No working hotkey or retirement claim.'
          : 'Trusted window listener, live profile activation, presentation-based slot resolution, real picker action and queue settlement must all be present in the same adapter.';
      row.expectedBlocker =
        'The bounded global dispatcher fixture cannot supply the picker profile/menu/hints lifecycle. Existing current-picker helper fixtures bypass trusted window dispatch and queue completion; success-path adapter is not yet available. Recovery retains its production 5000 ms timeout.';
      row.nextStep =
        row.deferCategory === 'source-only-lifecycle'
          ? 'When a real profile/window/queue adapter exists, add one interaction/mutation refresh assertion; this is not a keyboard action.'
          : row.rowId.startsWith('model:') && !(row.actionIds || []).length
            ? 'Keep this position catalogued; execute only if a current presentation actually exposes an assigned action.'
            : 'Opt-in picker adapter: prove one presented assigned key per current/legacy and Chat/Work route using the real listener and queue before admitting additional rows. Keep fallback/recovery outside default fast checks.';
    }
    if (!row.owner || !row.deferCategory || !row.unblock)
      issues.push({
        rowId: row.rowId,
        message: 'Every deferred row requires an explicit owner, category and unblock step.',
      });
  }
  for (const row of rows.filter(
    (item) => item.rowId?.startsWith('global:') && item.status === 'deferred',
  )) {
    if (!row.deferCategory || !row.unblock)
      issues.push({
        actionId: row.actionId,
        message: 'Deferred global requires a concrete family policy and unblock step.',
      });
  }
  const seenCases = new Set();
  for (const item of FAST_CASES) {
    if (seenCases.has(item.actionId))
      issues.push({
        actionId: item.actionId,
        fatal: true,
        message: 'Duplicate admitted keyboard case',
      });
    seenCases.add(item.actionId);
    if (item.rowId?.startsWith('model:')) {
      if (!inventory.modelPickerSlotRows.some((row) => row.rowId === item.rowId))
        issues.push({ actionId: item.actionId, message: 'Unknown model slot case' });
      continue;
    }
    if (item.contractId) {
      if (!inventory.fixedKeyboardContracts.some((row) => row.contractId === item.contractId))
        issues.push({
          actionId: item.actionId,
          message: 'Admitted fixed keyboard case is absent from authoritative inventory',
        });
      continue;
    }
    const sourceRow = inventory.shortcuts.find((row) => row.actionId === item.actionId);
    if (!sourceRow)
      issues.push({
        actionId: item.actionId,
        message: 'Admitted case is absent from authoritative inventory',
      });
    else if (sourceRow.validationMode === 'not-applicable')
      issues.push({
        actionId: item.actionId,
        message: 'Retired/non-applicable action cannot be admitted as a behavioral pass',
      });
    else if (!sourceRow.defaultCode?.trim() && !item.fixtureCode?.trim())
      issues.push({
        actionId: item.actionId,
        message: 'Blank binding requires an explicit fixture-only assignment',
      });
  }
  for (const item of inventory.shortcuts) {
    if (item.validationMode !== 'not-applicable' && !item.targetRefs.length) {
      // Manual/non-DOM actions legitimately have no selector; metadata must explain them.
      if (!item.activationProbe?.notes)
        issues.push({
          actionId: item.actionId,
          message: 'Targetless action has no explicit reason.',
        });
    }
  }
  return {
    content,
    inventory,
    report: {
      schemaVersion: 1,
      sourceFingerprint: fingerprint(content),
      catalogueFingerprint: fingerprint(
        (
          await Promise.all(
            [
              '../../../extension/manifest.json',
              '../../../extension/lib/DevScrapeWide.js',
              '../../../extension/settings-schema.js',
              '../../../extension/options-storage.js',
              '../../../extension/shared/model-picker-labels.js',
              '../../../extension/shared/shortcut-action-metadata.js',
              '../../../extension/_locales/en/messages.json',
              './shortcut-target-inventory.mjs',
              './devscrape-wide-core.mjs',
              ...scriptPaths.map((path) => `../../../extension/${path}`),
            ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
          )
        ).join('\n'),
      ),
      caseFingerprint: fingerprint(await readFile(new URL(import.meta.url), 'utf8')),
      fixtureFingerprint: fingerprint(
        (
          await Promise.all(
            [
              '../shortcut-fast-fixture.mjs',
              './shortcut-tab-pool.mjs',
              './shortcut-overlay-fixture.mjs',
              './shortcut-response-fixture.mjs',
              './shortcut-clipboard-fixture.mjs',
              './shortcut-media-fixture.mjs',
              './shortcut-model-controls-fixture.mjs',
              './shortcut-model-slots-fixture.mjs',
              './shortcut-model-unassigned-fixture.mjs',
              '../../fixtures/copy-all-formatted-conversation.html',
              '../../fixtures/copy-all-formatted-expected.txt',
            ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
          )
        ).join('\n'),
      ),
      targets: inventory.targets,
      rows,
      issues,
      observations: [],
    },
  };
}

export async function saveFastReport(report, output = RESULT_PATH) {
  const temporary = new URL(`${output.href}.tmp-${process.pid}-${randomUUID()}`);
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporary, output);
}

export function selectFastCases(report, requested = [], types = []) {
  report.warnings = [];
  for (const [values, field] of [
    [requested, 'actionId'],
    [types, 'type'],
  ])
    for (const value of values)
      if (!FAST_CASES.some((item) => item[field] === value))
        report.warnings.push({
          owner: 'command-line',
          reason: `Unknown requested ${field}: ${value}`,
        });
  const selected = FAST_CASES.filter(
    (item) =>
      (!requested.length || requested.includes(item.actionId)) &&
      (!types.length || types.includes(item.type)) &&
      !report.issues.some((issue) => issue.actionId === item.actionId),
  );
  report.selection = {
    actionIds: selected.map((item) => item.actionId),
    filtered: Boolean(requested.length || types.length),
  };
  return selected;
}

export function fastReportOutcome(report) {
  const summary = summarizeFastReport(report);
  const errors = report.issues.filter((issue) => issue.fatal);
  const selectedActionIds = new Set(report.selection?.actionIds || []);
  const unprovenDerivedContracts = report.catalogueOnly
    ? []
    : report.rows.filter((row) => {
        if (!row.admitted || !row.contractId || row.status !== 'not-run') return false;
        const requiredActions = row.requiredActions || [];
        if (!requiredActions.length) return false;
        return (
          !report.selection?.filtered ||
          requiredActions.every((actionId) => selectedActionIds.has(actionId))
        );
      });
  const warnings = [
    ...(report.warnings || []),
    ...report.issues.filter((issue) => !issue.fatal),
    ...unprovenDerivedContracts.map((row) => ({
      rowId: row.rowId,
      owner: row.owner,
      source: row.proofScope || 'source-contract',
      sourceStatus: row.sourceStatus,
      reason: `Admitted derived contract was not proven; fixture-keyboard proof is missing for: ${row.requiredActions
        .filter(
          (actionId) =>
            !report.observations.some(
              (observation) =>
                observation.actionId === actionId &&
                observation.proofScope === 'fixture-keyboard' &&
                observation.contractProofs?.includes(row.contractId),
            ),
        )
        .join(', ')}.`,
    })),
    ...report.rows
      .filter((row) => row.status === 'deferred' || row.externalCoverage)
      .map((row) => ({
        rowId: row.rowId,
        owner: row.owner,
        reason: row.externalCoverage?.reason || row.reason,
      })),
  ];
  const failed =
    summary.failed ||
    summary.environmentFailed ||
    report.issues.some((issue) => issue.fatal) ||
    report.scheduling?.serialBarrierPassed === false ||
    report.scheduling?.observedParallelTabs > DEFAULT_TAB_LIMIT;
  return {
    exitCode: failed ? 1 : 0,
    status: failed ? 'failure' : warnings.length ? 'success-with-warnings' : 'success',
    scope: report.catalogueOnly
      ? 'catalogue-only'
      : report.selection?.filtered
        ? 'filtered'
        : 'full-controlled',
    coverage: warnings.length ? 'partial' : 'complete-controlled',
    checks: summary.attempted ? `${report.observations.length} checks recorded` : 'No checks ran',
    warnings,
    errors,
  };
}

export function summarizeFastReport(report) {
  const rows = report.rows;
  for (const row of rows.filter((item) => item.admitted && item.actionId)) {
    const observations = report.observations.filter((item) => item.actionId === row.actionId);
    if (!observations.length) continue;
    row.observations = observations.map((item) => ({
      fixtureId: item.fixtureId,
      proofScope: item.proofScope,
      status: item.status,
      targetStatus: item.targetStatus,
      dispatchStatus: item.dispatchStatus,
      effectStatus: item.effectStatus,
      pathScope: item.pathScope,
      bindingScope: item.bindingScope,
      chord: item.chord,
      reason: item.reason,
    }));
    row.proofScope = observations[0].proofScope;
    row.status = observations.some((item) => item.status === 'fail')
      ? 'fail'
      : observations.some((item) => item.status === 'environment-fail')
        ? 'environment-fail'
        : observations.every((item) => item.status === 'pass')
          ? 'pass'
          : 'not-run';
    row.reason =
      observations.find((item) => item.status !== 'pass')?.reason ||
      (observations.every((item) => item.targetStatus === 'unavailable')
        ? 'Unavailable action correctly ignored: negative keyboard proof, not a working target.'
        : 'Selected keyboard observations passed; evidence scope is recorded separately.');
    row.negativeProof = observations.every((item) => item.targetStatus === 'unavailable');
  }
  for (const row of rows.filter((item) => item.admitted && item.contractId)) {
    const groups = row.requiredActions.map((actionId) =>
      report.observations.filter(
        (item) => item.actionId === actionId && item.proofScope === 'fixture-keyboard',
      ),
    );
    if (
      groups.some((items) => !items.some((item) => item.contractProofs?.includes(row.contractId)))
    )
      continue;
    const proofs = groups.flat();
    row.proofScope = 'fixture-keyboard-contract';
    row.status = proofs.every((item) => item.status === 'pass') ? 'pass' : 'fail';
    row.derivedFrom = row.requiredActions;
    row.reason =
      'Explicit fixture keyboard assertions prove this contract boundary; live behavior and other permutations are not claimed.';
  }
  return {
    catalogue: rows.length,
    admitted: rows.filter((row) => row.admitted).length,
    admittedActions: rows.filter((row) => row.admitted && row.actionId).length,
    admittedContracts: rows.filter((row) => row.admitted && row.contractId).length,
    passedRows: rows.filter((row) => row.status === 'pass').length,
    negativeRows: rows.filter((row) => row.status === 'pass' && row.negativeProof).length,
    notRun: rows.filter((row) => row.admitted && row.status === 'not-run').length,
    selected: report.observations.length,
    attempted: report.observations.filter((row) => row.attempted).length,
    passed: report.observations.filter((row) => row.status === 'pass').length,
    failed: report.observations.filter((row) => row.status === 'fail').length,
    environmentFailed: report.observations.filter((row) => row.status === 'environment-fail')
      .length,
    deferred: rows.filter((row) => row.status === 'deferred').length,
    notApplicable: rows.filter((row) => row.status === 'not-applicable').length,
    external: rows.filter((row) => row.status === 'external').length,
    inventoryIssues: report.issues.length,
  };
}

// Source-derived slices follow the existing Edit dispatch fixture. Acorn avoids
// fragile function-body regexes and runs only for behavioral (not catalogue) work.
let parsedSource;
export async function extractFastRuntime(content, actionId) {
  if (parsedSource?.content !== content) {
    const { parse } = await import('acorn');
    // Recheck after the import await: parallel cases may have populated the cache.
    if (parsedSource?.content !== content) {
      const tree = parse(content, { ecmaVersion: 'latest', sourceType: 'script' });
      const nodes = [];
      const parents = new WeakMap();
      const anchors = new Map();
      const visit = (node, parent = null) => {
        if (!node || typeof node !== 'object') return;
        if (node.type) {
          nodes.push(node);
          if (parent) parents.set(node, parent);
        }
        if (node.id?.name && ['VariableDeclarator', 'FunctionDeclaration'].includes(node.type)) {
          const key = `${node.type}:${node.id.name}`;
          if (!anchors.has(key)) anchors.set(key, []);
          anchors.get(key).push(node);
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value))
            value.forEach((child) => {
              visit(child, node);
            });
          else if (value && typeof value === 'object') visit(value, node);
        }
      };
      visit(tree);
      parsedSource = { content, nodes, parents, anchors };
    }
  }
  const { nodes, parents, anchors } = parsedSource;
  const named = (name, type) => {
    const matches = anchors.get(`${type}:${name}`) || [];
    if (!matches.length)
      throw new FastAdapterUnavailableError(`Missing runtime source anchor: ${name}`);
    if (matches.length !== 1)
      throw new Error(`Expected one runtime source anchor for ${name}; found ${matches.length}`);
    return matches[0];
  };
  const variable = (name) =>
    `const ${content.slice(named(name, 'VariableDeclarator').start, named(name, 'VariableDeclarator').end)};`;
  const func = (name) => {
    const node = named(name, 'FunctionDeclaration');
    return content.slice(node.start, node.end);
  };
  const isScriptScope = (node) => {
    let parent = parents.get(node);
    while (parent && parent.type !== 'Program') {
      if (
        [
          'ArrowFunctionExpression',
          'BlockStatement',
          'CatchClause',
          'ClassBody',
          'ForStatement',
          'FunctionDeclaration',
          'FunctionExpression',
          'SwitchCase',
        ].includes(parent.type)
      )
        return false;
      parent = parents.get(parent);
    }
    return parent?.type === 'Program';
  };
  const registry = named('altShortcutActions', 'VariableDeclarator');
  if (actionId === 'shortcutKeyShowOverlay') {
    const anchor = named('OVERLAY_ID', 'VariableDeclarator');
    const wrapper = nodes
      .filter(
        (node) =>
          node.type === 'CallExpression' &&
          node.callee.type === 'ArrowFunctionExpression' &&
          node.start < anchor.start &&
          node.end > anchor.end,
      )
      .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
    if (!wrapper) throw new FastAdapterUnavailableError('Missing real overlay IIFE');
    const codeEqualsMatches = (anchors.get('VariableDeclarator:codeEquals') || []).filter(
      (node) => node.start < wrapper.start && isScriptScope(node),
    );
    if (!codeEqualsMatches.length)
      throw new FastAdapterUnavailableError('Missing overlay code equality source anchor');
    if (codeEqualsMatches.length !== 1)
      throw new Error(
        `Ambiguous overlay code equality source anchor; found ${codeEqualsMatches.length}`,
      );
    const [codeEquals] = codeEqualsMatches;
    return {
      source: [
        variable('getSchemaShortcutDefaultCode'),
        variable('hasUsableShortcutSetting'),
        variable('LETTER_REGEX'),
        variable('DIGIT_REGEX'),
        variable('DIGIT_NUMPAD_REGEX'),
        func('charToCode'),
        `const ${content.slice(codeEquals.start, codeEquals.end)};`,
        `${content.slice(wrapper.start, wrapper.end)};`,
      ].join('\n'),
    };
  }
  const properties = registry.init.properties.filter(
    (node) => (node.key.name || node.key.value) === actionId,
  );
  if (properties.length > 1) {
    throw new Error(
      `Ambiguous real action registry entry for ${actionId}; found ${properties.length}`,
    );
  }
  const [property] = properties;
  const isControl = ['shortcutKeyClickSendButton', 'shortcutKeyClickStopButton'].includes(actionId);
  const isPageTakeover = actionId === 'fixed:page-up-down-takeover';
  if (!property && !isControl && !isPageTakeover)
    throw new FastAdapterUnavailableError(`Missing real action registry entry: ${actionId}`);
  const listeners = nodes.filter(
    (node) =>
      node.type === 'CallExpression' &&
      node.callee.object?.name === 'document' &&
      node.callee.property?.name === 'addEventListener' &&
      node.arguments[0]?.value === 'keydown' &&
      content.slice(node.start, node.end).includes('handleAltShortcutEvent'),
  );
  if (!listeners.length)
    throw new FastAdapterUnavailableError('Missing real document shortcut listener');
  if (listeners.length !== 1)
    throw new Error('Missing or ambiguous real document shortcut listener');
  const helpers = [
    'getSchemaShortcutDefaultCode',
    'hasUsableShortcutSetting',
    'COMPOSER_INPUT_SELECTORS',
    'shortcutDefaults',
    'getEffectiveShortcutSetting',
    'ALT_SHORTCUT_ACTION_KEYS',
    'isModelToggleShortcutEvent',
    'findMatchedAltShortcutActionKey',
    'runAltShortcutAction',
    'getModelPickerAssignedIndexForDigit',
    'isModelPickerAssignedShortcutEvent',
    'runModelPickerDigitShortcut',
    'runMatchedAltShortcut',
    'THINKING_EFFORT_DYNAMIC_SHORTCUTS',
    'PRO_THINKING_EFFORT_DYNAMIC_SHORTCUTS',
    'runDynamicThinkingEffortShortcut',
    'runDynamicProThinkingEffortShortcut',
    'shouldIgnoreShortcutEvent',
    'getShortcutKeyIdentifier',
    'hasUnexpectedAltShortcutModifier',
    'handleAltShortcutEvent',
    'handleCtrlShortcutEvent',
  ];
  const functions = [
    'isDirectActionVisible',
    'findFirstVisibleElement',
    'triggerDirectComposerActivation',
    'matchesShortcutKey',
    'recordShortcutUsage',
  ];
  const declarations = helpers.filter((name) => name !== 'ALT_SHORTCUT_ACTION_KEYS').map(variable);
  const extra = [];
  if (['selectThenCopy', 'shortcutKeyCopyLowest', 'selectThenCopyAllMessages'].includes(actionId)) {
    const start = named('COPY_EXPORT_FONT_STACK', 'VariableDeclarator').start;
    const end = named(
      actionId === 'selectThenCopyAllMessages'
        ? 'runSelectThenCopyAllMessagesShortcut'
        : 'runSelectThenCopyShortcut',
      'FunctionDeclaration',
    ).end;
    if (actionId === 'selectThenCopyAllMessages') {
      extra.push(
        ...[
          'CONVERSATION_TURN_SELECTOR',
          'CHATGPT_MESSAGE_UNIT_SELECTOR',
          'CHATGPT_ROLE_MESSAGE_SELECTOR',
        ].map(variable),
      );
      extra.push(
        ...[
          'isRenderedConversationElement',
          'getConversationScrollRoot',
          'getConversationTurns',
          'getConversationMessages',
          'isActiveConversationScrollContainer',
          'stabilizeConversationScrollContainer',
          'getScrollableContainer',
          'isReversedScrollContainer',
          'getScrollContainerTopEdge',
          'clampScrollTop',
          'getMaxBoundaryScrollTop',
          'getMinBoundaryScrollTop',
        ].map(func),
      );
    }
    const formatterStart = named('splitByCodeFences', 'FunctionDeclaration').start;
    const formatterEnd = content.indexOf('// Runtime bridge: sanitizeCopiedText', formatterStart);
    if (formatterEnd < formatterStart)
      throw new FastAdapterUnavailableError('Missing copy formatter boundary');
    extra.push(variable('FENCE_RE'), content.slice(formatterStart, formatterEnd));
    if (actionId === 'shortcutKeyCopyLowest') {
      extra.push(
        ...[
          'getIconTokenList',
          'escapeCssSelectorValue',
          'escapeAttributeSelectorFragment',
          'buildSvgSelectorForIconTokens',
          'svgSelectorForTokens',
          'withPrefix',
          'toTokenArray',
          'COPY_MESSAGE_ACTION_ICON_PATH_PREFIX',
        ].map(variable),
      );
      const copyStart = named('copyLowestRunToken', 'VariableDeclarator').start;
      const copyEnd = named('copyFromLowestButton', 'FunctionDeclaration').end;
      extra.push(`let ${content.slice(copyStart, copyEnd)}`, func('isAboveComposer'));
    } else extra.push('let copyMessageFromButton = null;');
    extra.push(func('getComposerTopEdge'), `const ${content.slice(start, end)}`);
  }
  if (actionId === 'shortcutKeyNewGptConversation') {
    extra.push(
      ...[
        'getIconTokenList',
        'escapeCssSelectorValue',
        'escapeAttributeSelectorFragment',
        'buildSvgSelectorForIconTokens',
        'clickElementLikeUser',
        'SHORTCUT_ICON_TOKENS',
      ].map(variable),
    );
    extra.push(
      func('getComposerTopEdge'),
      func('isAboveComposer'),
      func('runNewGptConversationShortcut'),
    );
    const anchor = named('GPT_MENU_TRIGGER_PATH_PREFIXES', 'VariableDeclarator');
    const wrapper = nodes
      .filter(
        (node) =>
          node.type === 'CallExpression' &&
          node.callee.type === 'ArrowFunctionExpression' &&
          node.start < anchor.start &&
          node.end > anchor.end,
      )
      .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
    if (!wrapper) throw new FastAdapterUnavailableError('Missing GPT menu helper IIFE');
    extra.push(`${content.slice(wrapper.start, wrapper.end)};`);
  }
  if (FAST_CASES.find((item) => item.actionId === actionId)?.type === 'media-control') {
    extra.push(
      ...[
        'getIconTokenList',
        'escapeAttributeSelectorFragment',
        'clickElementLikeUser',
        'smartClick',
        'sleep',
        'DELAYS',
      ].map(variable),
      'const flashBorder = () => {};',
    );
    if (actionId === 'shortcutKeyMoreDotsReadAloud') {
      extra.push(
        ...[
          'READ_ALOUD_TARGET_BUTTON_ATTRIBUTE',
          'READ_ALOUD_TARGET_TURN_ATTRIBUTE',
          'READ_ALOUD_TARGET_TURN_VALUE',
          'READ_ALOUD_TARGET_BUTTON_INDEX',
        ].map(variable),
      );
      extra.push(
        ...[
          'flashShortcutTarget',
          'findLatestVisibleReadAloudActionButton',
          'getReadAloudTurnLocator',
          'clearReadAloudShortcutTarget',
          'findReadAloudShortcutTarget',
          'rememberReadAloudTarget',
          'runReadAloudShortcut',
        ].map(func),
      );
    } else extra.push(variable('DictationShortcut'));
  }
  if (actionId === 'shortcutKeyCopyAllCodeBlocks') {
    extra.push(
      variable('COPY_ALL_CODE_BLOCK_SELECTOR'),
      variable('DEFAULT_COPY_CODE_SEPARATOR'),
      'let cachedCopyCodeUserSeparator = DEFAULT_COPY_CODE_SEPARATOR; const showToast = (message) => window.fixtureToasts.push(message);',
      func('getRenderedCodeText'),
      func('getAllCodeBlocks'),
      func('copyCode'),
    );
  }
  if (FAST_CASES.find((item) => item.actionId === actionId)?.type === 'response-menu') {
    extra.push(
      ...[
        'getIconTokenList',
        'escapeCssSelectorValue',
        'escapeAttributeSelectorFragment',
        'buildSvgSelectorForIconTokens',
        'svgSelectorForTokens',
        'safeEsc',
        'withPrefix',
        'SHORTCUT_ICON_TOKENS',
        'REGENERATE_MENU_TRIGGER_SELECTOR',
        'BOTTOM_BAR_CONTAINER_SELECTOR',
        'clickElementLikeUser',
        'smartClick',
      ].map(variable),
    );
    // Select the definition beside MENU_SELECTORS, not the separate GPT helper default.
    const menuAnchor = named('MENU_SELECTORS', 'VariableDeclarator');
    const roles = anchors
      .get('VariableDeclarator:MENU_ITEM_ROLES')
      .filter((node) => node.start < menuAnchor.start)
      .at(-1);
    extra.push(`const ${content.slice(roles.start, roles.end)};`);
    extra.push(variable('MENU_SELECTORS'));
    const menuDelays = anchors
      .get('VariableDeclarator:DEFAULT_MENU_DELAYS')
      .filter((node) => node.start < menuAnchor.start)
      .at(-1);
    extra.push(`const ${content.slice(menuDelays.start, menuDelays.end)};`);
    extra.push(func('getComposerTopEdge'), func('isAboveComposer'));
    const start = named('isFullyVisibleAboveComposer', 'FunctionDeclaration').start;
    const end = named('runRadixMenuActionFocusInputByName', 'FunctionDeclaration').end;
    extra.push(content.slice(start, end));
    const actionName = {
      shortcutKeyRegenerateTryAgain: 'runRegenerateTryAgainShortcut',
      shortcutKeyRegenerateAskToChangeResponse: 'runRegenerateAskToChangeResponseShortcut',
      shortcutKeyMoreDotsBranchInNewChat: 'runBranchInNewChatShortcut',
    }[actionId];
    extra.push(func(actionName));
  }
  if (actionId === 'shortcutKeySendEdit') {
    extra.push(
      variable('SendEditShortcut'),
      ...['safeClick', 'getComposerTopEdge', 'isAboveComposer', 'runSendEditShortcut'].map(func),
    );
  }
  if (actionId === 'shortcutKeyShare') {
    extra.push(
      ...['DELAYS', 'clickElementLikeUser', 'smartClick', 'clickButtonBySelector'].map(variable),
    );
  }
  if (actionId === 'shortcutKeyToggleChatWork') {
    extra.push(
      ...[
        'safeClick',
        'getNativeChatWorkSurfaceRadios',
        'rememberNativeChatWorkSurfaceMode',
        'waitForNativeChatWorkSurfaceRadios',
        'getNativeChatWorkSurfaceMode',
        'selectNativeChatWorkSurfaceMode',
        'triggerNativeChatWorkToggle',
      ].map(func),
    );
  }
  if (actionId === 'shortcutKeyNewConversation') {
    extra.push(
      variable('NEW_CHAT_SELECTORS'),
      func('safeClick'),
      func('triggerNativeNewConversationButton'),
    );
  }
  if (actionId === 'shortcutKeySearchConversationHistory') {
    extra.push(
      variable('SEARCH_CONVERSATION_SELECTORS'),
      variable('clickElementLikeUser'),
      func('safeClickSearchConversationButton'),
      func('triggerNativeSearchConversationButton'),
    );
  }
  if (FAST_CASES.find((item) => item.actionId === actionId)?.type.startsWith('scroll-')) {
    extra.push(
      ...[
        'CONVERSATION_TURN_SELECTOR',
        'CHATGPT_MESSAGE_UNIT_SELECTOR',
        'CHATGPT_ROLE_MESSAGE_SELECTOR',
        'BOUNDARY_SCROLL_SETTLE_DELAYS_MS',
      ].map(variable),
    );
    for (const name of [
      'activeMessageScrollTween',
      'activeMessageScrollSettleFrame',
      'activeBoundaryScrollSettleFrame',
      'activeBoundaryScrollSettleTimeouts',
    ]) {
      const node = named(name, 'VariableDeclarator');
      extra.push(`let ${content.slice(node.start, node.end)};`);
    }
    extra.push(
      ...[
        'isRenderedConversationElement',
        'getConversationScrollRoot',
        'getConversationTurns',
        'getConversationMessages',
        'isActiveConversationScrollContainer',
        'stabilizeConversationScrollContainer',
        'getScrollableContainer',
        'isReversedScrollContainer',
        'clearBoundaryScrollSettle',
        'getMaxBoundaryScrollTop',
        'getMinBoundaryScrollTop',
        'getBoundaryScrollTop',
        'setBoundaryScrollPosition',
        'settleBoundaryScrollTarget',
        'animateBoundaryScrollTo',
        'killActiveMessageScrollTween',
      ].map(func),
    );
    if (FAST_CASES.find((item) => item.actionId === actionId)?.type === 'scroll-message') {
      extra.push(variable('ScrollState'), variable('MESSAGE_SCROLL_SETTLE_MS'));
      extra.push(
        ...[
          'resetScrollState',
          'getConversationTurnMessages',
          'getScrollContainerTopEdge',
          'getMessageTopScrollPosition',
          'getMessageTopScrollPositions',
          'clampScrollTop',
          'getMessageScrollTarget',
          'getColorAlpha',
          'getTopHeaderScrollOffset',
          'getMessageScrollOptions',
          'stabilizeMessageScrollContainer',
          'settleMessageScrollTarget',
          'alignMessageToVisualTop',
          'animateMessageScrollTo',
          'scrollToMessageTop',
          'scrollToMessagePosition',
          'scrollUpByMessages',
          'goUpOneMessage',
          'goUpTwoMessages',
          'getNextMessagePosition',
          'goDownOneMessage',
          'scrolldownbymessages',
          'goDownTwoMessages',
        ].map(func),
      );
    }
    if (isPageTakeover) {
      extra.push(
        variable('ScrollState'),
        ...[
          'resetScrollState',
          'handleKeyDown',
          'handleUserInteraction',
          'toggleEventListener',
          'initializePageUpDownTakeover',
        ].map(func),
      );
      extra.push(
        'const chrome = {storage:{sync:{get(keys, callback){callback({pageUpDownTakeover:false});}},onChanged:{addListener(callback){window.fastPageSetting = (value, area = "sync") => callback({pageUpDownTakeover:{newValue:value}}, area);}}}}; initializePageUpDownTakeover();',
      );
    }
  }
  if (actionId === 'shortcutKeyEdit') {
    extra.push(
      ...[
        'getIconTokenList',
        'escapeCssSelectorValue',
        'escapeAttributeSelectorFragment',
        'buildSvgSelectorForIconTokens',
        'svgSelectorForTokens',
        'withPrefix',
        'clickElementLikeUser',
        'smartClick',
        'CONVERSATION_TURN_SELECTOR',
        'EditMessageShortcut',
      ].map(variable),
    );
    extra.push(...['getComposerTopEdge', 'isAboveComposer', 'runEditMessageShortcut'].map(func));
  }
  if (actionId === 'shortcutKeyToggleCodeboxWrap') {
    const anchor = named('ROOT_CLASS', 'VariableDeclarator');
    const wrapper = nodes
      .filter(
        (node) =>
          node.type === 'CallExpression' &&
          node.callee.type === 'ArrowFunctionExpression' &&
          node.start < anchor.start &&
          node.end > anchor.end,
      )
      .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
    if (!wrapper) throw new FastAdapterUnavailableError('Missing code-wrap source IIFE');
    extra.push(
      'window.fastStorageWrites = []; const chrome = {runtime:{}, storage:{sync:{set(value, callback){window.fastStorageWrites.push(value);callback?.();}}}};',
    );
    extra.push(`${content.slice(wrapper.start, wrapper.end)};`);
  }
  if (FAST_CASES.find((item) => item.actionId === actionId)?.type === 'menu-cascade') {
    extra.push(
      ...[
        'getIconTokenList',
        'escapeCssSelectorValue',
        'escapeAttributeSelectorFragment',
        'buildSvgSelectorForIconTokens',
        'clickElementLikeUser',
        'smartClick',
        'sleep',
        'waitFor',
        'COMPOSER_TOOL_MENU_OPENER_SELECTORS',
        'COMPOSER_TOOL_ITEM_SELECTOR',
        'COMPOSER_TOOL_MENU_CUE_TOKENS',
        'SHORTCUT_ICON_TOKENS',
        'DELAYS',
        'buildIconSelector',
        'findComposerToolItemByIcon',
        'findComposerToolMenuOpener',
        'runComposerToolShortcutByIcon',
        'runActionByIcon',
      ].map(variable),
    );
    extra.push(func('findSelectedComposerToolPill'));
    extra.push(func('runIconToolbarShortcut'));
    extra.push('window.__cspRunComposerToolShortcutByIcon = runComposerToolShortcutByIcon;');
    if (actionId === 'shortcutKeyStudy') extra.push(func('runStudyShortcut'));
    // Visual feedback is outside this target/keyboard fixture; action logic and delays remain real.
    extra.push('const flashBorder = () => {};');
  }
  if (isControl)
    extra.push(
      func('isVisibleEnabledComposerControl'),
      func('findUniqueVisibleComposerControl'),
      variable('getCtrlShortcutSendButton'),
      func('isCtrlShortcutEnabled'),
    );
  if (actionId === 'shortcutKeyClickStopButton') extra.push(func('getVisibleStopButton'));
  if (actionId === 'shortcutKeyToggleSidebar') {
    extra.push(variable('SIDEBAR_TOGGLE_SELECTORS'));
    extra.push(
      ...[
        'safeClick',
        'triggerNativeSidebarToggleButton',
        'getSlimSidebarHost',
        'isSlimSidebarHostOpen',
        'getVisibleAppShellSidebarToggle',
      ].map(func),
    );
  }
  if (actionId === 'shortcutKeyTemporaryChat') {
    extra.push(
      variable('clickElementLikeUser'),
      variable('smartClick'),
      func('runTemporaryChatShortcut'),
    );
  }
  const source = [
    `const isMac = false; ${isControl ? variable('keyFunctionMappingCtrl') : 'const keyFunctionMappingCtrl = {}; '}`,
    functions.map(func).join('\n'),
    declarations.join('\n'),
    extra.join('\n'),
    `const shortcuts = Object.fromEntries(Object.keys(shortcutDefaults).map(key => [key, '\\u00a0'])); shortcuts[${JSON.stringify(actionId)}] = ${JSON.stringify(FAST_CASES.find((item) => item.actionId === actionId)?.fixtureCode) || `shortcutDefaults[${JSON.stringify(actionId)}]`}; window.CSP_SHORTCUTS_EFFECTIVE = shortcuts;`,
    `const altShortcutActions = {${property ? content.slice(property.start, property.end) : ''}};`,
    variable('ALT_SHORTCUT_ACTION_KEYS'),
    `${content.slice(listeners[0].start, listeners[0].end)};`,
  ].join('\n');
  const selectors = named('COMPOSER_INPUT_SELECTORS', 'VariableDeclarator').init.elements.map(
    (node) => node.value,
  );
  return { source, selectors, activationSource: func('triggerDirectComposerActivation') };
}

export async function loadFastConversationRegistry() {
  let registry;
  try {
    registry = JSON.parse(await readFile(REGISTRY_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, fixtures: {} };
    throw error;
  }
  if (
    registry.schemaVersion !== 1 ||
    !registry.fixtures ||
    Array.isArray(registry.fixtures) ||
    typeof registry.fixtures !== 'object'
  )
    throw new Error('Invalid fast conversation registry');
  for (const [id, fixture] of Object.entries(registry.fixtures)) {
    const url = new URL(fixture.url);
    if (
      !fixture.auditOwned ||
      url.origin !== 'https://chatgpt.com' ||
      !/^\/c\/[a-zA-Z0-9-]+$/.test(url.pathname) ||
      url.pathname !== `/c/${fixture.conversationId}` ||
      url.search ||
      url.hash
    )
      throw new Error(`Invalid audit-owned fixture URL: ${id}`);
  }
  return registry;
}

export async function runFastLive(args) {
  const phaseIndex = args.indexOf('--phase');
  if (phaseIndex !== -1 && !['all', 'global'].includes(args[phaseIndex + 1])) {
    throw new Error('Only global focus has an admitted fast live case in Batch 03');
  }
  for (const flag of [
    '--fixed-contract-id',
    '--model-profile',
    '--model-slot',
    '--model-action-id',
  ]) {
    if (args.includes(flag))
      throw new Error(`${flag} has no admitted fast case yet; do not silently run focus instead`);
  }
  const started = performance.now();
  const { content, report } = await loadFastCatalogue();
  if (report.issues.length) throw new Error(JSON.stringify(report.issues));
  const values = (flag) =>
    args.flatMap((value, index) => (value === flag ? [args[index + 1]] : []));
  const requested = values('--shortcut-action-id');
  for (const id of requested)
    if (id !== 'shortcutKeyActivateInput')
      throw new Error(`No fast live implementation for ${id}; case remains deferred`);
  const registry = await loadFastConversationRegistry();
  const fixtureIds = values('--fixture-id');
  if (new Set(fixtureIds).size !== fixtureIds.length)
    throw new Error('Duplicate --fixture-id selection');
  for (const id of fixtureIds)
    if (!registry.fixtures[id])
      throw new Error(
        `Missing prepared fixture: ${id}. Prepare it once; no setup messages will be sent by this run.`,
      );
  const fixtures = fixtureIds.length
    ? fixtureIds.map((id) => ({ fixtureId: id, ...registry.fixtures[id] }))
    : [{ fixtureId: 'blank', url: 'https://chatgpt.com/' }];
  if (args.includes('--provision-fixtures')) {
    // Batch 03's admitted focus type needs a blank tab, not a durable chat.
    // Conversation-producing recipes are admitted with their type in Batch 04.
    await saveFastReport(registry, REGISTRY_PATH);
    console.log('Registry ready. Admitted focus checks need no conversation or setup message.');
    return;
  }
  if (args.includes('--inventory-only')) {
    report.summary = summarizeFastReport(report);
    await saveFastReport(report, LIVE_RESULT_PATH);
    console.log(JSON.stringify(report.summary));
    return;
  }
  const { chromium } = await import('playwright');
  let browser;
  const runPage = async (fixture, context) => {
    let page;
    let session;
    const row = {
      actionId: 'shortcutKeyActivateInput',
      proofScope: 'live-keyboard',
      attempted: false,
      status: 'environment-fail',
      fixtureId: fixture.fixtureId,
      fixtureUrl: fixture.url,
      startedMs: performance.now() - started,
      setupMessagesSent: 0,
    };
    try {
      page = await context.newPage();
      await page.goto(fixture.url, { waitUntil: 'domcontentloaded', timeout: 10000 });
      if (new URL(page.url()).pathname !== new URL(fixture.url).pathname)
        throw new Error('Prepared conversation did not open at its saved route');
      session = await context.newCDPSession(page);
      const scripts = [];
      session.on('Debugger.scriptParsed', (event) => scripts.push(event));
      await session.send('Debugger.enable');
      const loaded = scripts.filter(
        (item) => /^chrome-extension:\/\//.test(item.url) && item.url.endsWith('/content.js'),
      );
      let contentScript;
      for (const script of loaded) {
        const result = await session.send('Debugger.getScriptSource', {
          scriptId: script.scriptId,
        });
        if (fingerprint(result.scriptSource) === report.sourceFingerprint) {
          contentScript = script;
          break;
        }
      }
      if (!contentScript)
        throw new Error('Current extension content.js revision is not verified on the audit tab');
      const evaluation = await session.send('Runtime.evaluate', {
        contextId: contentScript.executionContextId,
        returnByValue: true,
        expression:
          '({ code: window.CSP_SHORTCUTS_EFFECTIVE?.shortcutKeyActivateInput, ready: typeof window.triggerDirectComposerActivation === "function" })',
      });
      const settings = evaluation.result.value;
      if (!settings?.ready || typeof settings.code !== 'string' || !settings.code.trim())
        throw new Error('Loaded extension focus binding is unavailable or unassigned');
      const runtime = focusRuntime;
      const target = await page.evaluate((selectors) => {
        const input = selectors
          .flatMap((selector) => [...document.querySelectorAll(selector)])
          .find(
            (element) =>
              element.getBoundingClientRect().width > 0 &&
              element.getBoundingClientRect().height > 0,
          );
        if (!input) return false;
        if (input.textContent.trim())
          throw new Error('Audit blank tab unexpectedly contains a draft');
        input.dataset.cspFastFocusTarget = 'true';
        input.blur();
        window.cspFastLiveKeys = [];
        document.addEventListener(
          'keydown',
          (event) =>
            window.cspFastLiveKeys.push({
              trusted: event.isTrusted,
              code: event.code,
              alt: event.altKey,
            }),
          true,
        );
        return true;
      }, runtime.selectors);
      if (!target) throw new Error('Blank authenticated composer is unavailable');
      row.attempted = true;
      row.status = 'fail';
      row.chord = `Alt+${settings.code}`;
      await page.keyboard.press(row.chord);
      await page.waitForFunction(
        () => document.activeElement?.dataset.cspFastFocusTarget === 'true',
        null,
        { timeout: 3000 },
      );
      const observed = await page.evaluate(() => ({
        focused: document.activeElement?.dataset.cspFastFocusTarget === 'true',
        keys: window.cspFastLiveKeys,
      }));
      if (!observed.keys.some((event) => event.trusted && event.alt && event.code !== 'AltLeft'))
        throw new Error('No trusted shortcut key reached audit tab');
      Object.assign(row, {
        status: 'pass',
        targetStatus: 'present',
        dispatchStatus: 'pass',
        effectStatus: 'pass',
        observed,
        loadedSourceFingerprint: report.sourceFingerprint,
      });
    } catch (error) {
      row.reason = error.message;
    } finally {
      // For an attached CDP browser, close disconnects rather than terminating Chrome.
      await session?.detach().catch(() => {});
      if (page) {
        try {
          await page.close();
        } catch (error) {
          row.status = 'fail';
          row.recoveryError = error.message;
        }
      }
    }
    row.endedMs = performance.now() - started;
    report.observations.push(row);
  };
  const focusRuntime = await extractFastRuntime(content, 'shortcutKeyActivateInput');
  report.scheduling = {
    maxParallelTabs: Math.min(DEFAULT_TAB_LIMIT, fixtures.length),
    tabLimit: DEFAULT_TAB_LIMIT,
    fixtureIds: fixtures.map((item) => item.fixtureId),
    setupMessagesSent: 0,
  };
  try {
    browser = await chromium.connectOverCDP(
      values('--cdp-endpoint')[0] || 'http://127.0.0.1:9333',
      { timeout: 10000 },
    );
    const context = browser.contexts()[0];
    if (!context) throw new Error('CDP browser has no persistent context');
    const results = await settleTabPool(fixtures, (fixture) => runPage(fixture, context));
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  } catch (error) {
    for (const fixture of fixtures.filter(
      (item) => !report.observations.some((row) => row.fixtureId === item.fixtureId),
    ))
      report.observations.push({
        actionId: 'shortcutKeyActivateInput',
        fixtureId: fixture.fixtureId,
        fixtureUrl: fixture.url,
        proofScope: 'live-keyboard',
        attempted: false,
        status: 'environment-fail',
        setupMessagesSent: 0,
        reason: error.message,
      });
  } finally {
    await browser?.close().catch(() => {});
  }
  report.timings = { executionMs: performance.now() - started };
  report.summary = summarizeFastReport(report);
  const reportingStarted = performance.now();
  await saveFastReport(report, LIVE_RESULT_PATH);
  report.timings.reportingMs = performance.now() - reportingStarted;
  report.timings.totalMs = performance.now() - started;
  console.log(
    JSON.stringify(
      { summary: report.summary, observations: report.observations, timings: report.timings },
      null,
      2,
    ),
  );
  if (report.observations.some((row) => row.status !== 'pass')) process.exitCode = 1;
}
