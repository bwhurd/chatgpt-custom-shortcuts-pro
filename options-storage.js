// options-storage.js
/* global OptionsSync */

// Single source of truth for ALL defaults used across SW, popup, and content.
const OPTIONS_DEFAULTS = {
  // === Shortcuts (text inputs) ===
  shortcutKeyScrollUpOneMessage: 'a',
  shortcutKeyScrollDownOneMessage: 'f',
  shortcutKeyScrollUpTwoMessages: 'ArrowUp', // normalize from ↑
  shortcutKeyScrollDownTwoMessages: 'ArrowDown', // normalize from ↓
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
  shortcutKeySearchConversationHistory: 'k',
  shortcutKeyTemporaryChat: 'p',
  shortcutKeyToggleDictate: 'y',
  shortcutKeyCancelDictation: '',
  shortcutKeyShare: '',
  shortcutKeySearchWeb: 'q',
  shortcutKeyStudy: '',
  shortcutKeyCreateImage: '',
  shortcutKeyToggleCanvas: '',
  shortcutKeyAddPhotosFiles: '',
  shortcutKeyThinkLonger: '',
  copyAllUserSeparator: ' \n  \n --- --- --- \n \n',
  shortcutKeyCopyAllCodeBlocks: ']',
  copyCodeUserSeparator: ' \n  \n --- --- --- \n \n',
  altPageUp: 'PageUp',
  altPageDown: 'PageDown',

  // === Additional keys from 222s ===
  shortcutKeyRegenerateTryAgain: 'r',
  shortcutKeyRegenerateMoreConcise: '',
  shortcutKeyRegenerateAddDetails: '',
  shortcutKeyRegenerateWithDifferentModel: '',
  shortcutKeyRegenerateAskToChangeResponse: '',
  shortcutKeyMoreDotsReadAloud: '',
  shortcutKeyMoreDotsBranchInNewChat: '',
  shortcutKeyThinkingExtended: '',
  shortcutKeyThinkingStandard: '',
  shortcutKeyNewGptConversation: '',
  shortcutKeyShowShortcuts: 'Slash',
  selectThenCopyAllMessages: '[',

  // Legacy naming variants (back-compat; no longer shown in popup.html)
  selectAndCopyEntireConversationBothUserAndChatGpt: false,
  selectAndCopyEntireConversationOnlyAssistant: false,
  selectAndCopyEntireConversationOnlyUser: false,
  selectThenCopyAllMessagesBothUserAndChatGpt: true,
  selectThenCopyAllMessagesOnlyAssistant: false,
  selectThenCopyAllMessagesOnlyUser: false,
  doNotIncludeLabelsCheckbox: false,
  modelNames: [
    'Instant',
    'Thinking',
    'Configure...',
    'Latest',
    '5.2',
    '5.0 Thinking Mini',
    'o3',
  ],
  showLegacyArrowButtonsCheckbox: false,

  // === Toggles / sliders ===
  pageUpDownTakeover: true,
  popupBottomBarOpacityValue: '0.6', // range -> string
  moveTopBarToBottomCheckbox: false,
  removeMarkdownOnCopyCheckbox: true,
  clickToCopyInlineCodeEnabled: false,
  fadeMessageButtonsCheckbox: false,
  colorBoldTextEnabled: false,
  colorBoldTextLightColor: '#2037e6',
  colorBoldTextDarkColor: '#4da3ff',
  rememberSidebarScrollPositionCheckbox: false,
  popupSlimSidebarOpacityValue: '0.0',
  fadeSlimSidebarEnabled: false,
  enableSendWithControlEnterCheckbox: true,
  enableStopWithControlBackspaceCheckbox: true,
  hideArrowButtonsCheckbox: true,
  hideCornerButtonsCheckbox: true,

  // Copy behavior
  disableCopyAfterSelectCheckbox: false,

  // Model picker — up to 15 slots.
  // Only the current top-row actions ship with defaults; newly surfaced configure actions start blank.
  modelPickerKeyCodes: [
    'Digit1',
    'Digit2',
    'Digit3',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],

  // === Radios ===
  useAltForModelSwitcherRadio: true,
  useControlForModelSwitcherRadio: false,

  // Duplicate modal + overwrite helper flags (kept in defaults so migrations don't drop them)
  autoOverwrite: false,
  dontAskDuplicateShortcutModal: false, // intentionally defaults to false; popup may re-enable per session

  // Legacy booleans still read by content.js
  selectMessagesSentByUserOrChatGptCheckbox: true,
  onlySelectAssistantCheckbox: false,
  onlySelectUserCheckbox: false,

  // Consolidated key (populated from legacy flags in migration)
  messageSelection: 'user_or_assistant',

  // Timestamp for scraped model names; default empty to preserve across migrations
  modelNamesAt: '',
};

//
// Ensure OptionsSync is present in every context that loads this file
//
if (typeof OptionsSync === 'undefined') {
  console.warn(
    '[options-storage] OptionsSync not found; did you load vendor/webext-options-sync.js first?',
  );
} else {
  globalThis.optionsStorage = new OptionsSync({
    defaults: OPTIONS_DEFAULTS,
    // explicit for MV3
    storageType: 'sync',
    logging: true,
    migrations: [
      // 1) Normalize old '↑'/'↓' to 'ArrowUp'/'ArrowDown'
      (stored) => {
        if (stored.shortcutKeyScrollUpTwoMessages === '↑') {
          stored.shortcutKeyScrollUpTwoMessages = 'ArrowUp';
        }
        if (stored.shortcutKeyScrollDownTwoMessages === '↓') {
          stored.shortcutKeyScrollDownTwoMessages = 'ArrowDown';
        }
      },

      // 2) Coerce slider values to strings (range inputs serialize as strings)
      (stored) => {
        for (const k of ['popupBottomBarOpacityValue', 'popupSlimSidebarOpacityValue']) {
          if (typeof stored[k] === 'number') {
            stored[k] = String(stored[k]);
          }
        }
      },

      // 3) Sanitize modelPickerKeyCodes to a 15-slot string array (pads from old 10)
      (stored) => {
        const arr = Array.isArray(stored.modelPickerKeyCodes) ? stored.modelPickerKeyCodes : [];
        const fifteen = new Array(15).fill('');
        // Preserve existing positions; pad to 15
        arr.slice(0, 15).forEach((v, i) => {
          fifteen[i] = typeof v === 'string' ? v : '';
        });
        stored.modelPickerKeyCodes = fifteen;
      },

      // 4) Blank inherited hidden digit defaults for newly visible configure actions.
      (stored) => {
        const arr = Array.isArray(stored.modelPickerKeyCodes) ? stored.modelPickerKeyCodes : [];
        const legacyHiddenDefaults = {
          3: 'Digit4',
          4: 'Digit5',
          5: 'Digit6',
          6: 'Digit7',
          7: 'Digit8',
          8: 'Digit9',
          9: 'Digit0',
        };
        Object.entries(legacyHiddenDefaults).forEach(([idx, legacyCode]) => {
          const slot = Number(idx);
          if (arr[slot] === legacyCode) arr[slot] = '';
        });
        stored.modelPickerKeyCodes = arr;
      },

      // 5) Populate new messageSelection from legacy flags
      (stored, defaults) => {
        if (!stored.messageSelection) {
          if (stored.onlySelectAssistantCheckbox) {
            stored.messageSelection = 'assistant_only';
          } else if (stored.onlySelectUserCheckbox) {
            stored.messageSelection = 'user_only';
          } else if (stored.selectMessagesSentByUserOrChatGptCheckbox) {
            stored.messageSelection = 'user_or_assistant';
          } else {
            stored.messageSelection = defaults.messageSelection;
          }
        }
      },

      // 6) Remove deprecated legacy shortcut keys (no longer used/shown)
      (stored) => {
        delete stored.shortcutKeyRegenerate;
        delete stored.shortcutKeyCopyAllResponses;
      },

      // 7) Remove anything truly unused (keep it last)
      OptionsSync.migrations.removeUnused,
    ],
  });
}

// Helpful globals so any script can reuse the same instance/defaults
globalThis.OPTIONS_DEFAULTS = OPTIONS_DEFAULTS;
globalThis.optionsSync = globalThis.optionsStorage;
