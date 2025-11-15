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
  shortcutKeyRegenerate: 'r',
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
  shortcutKeyCopyAllResponses: '[',
  copyAllUserSeparator: ' \n  \n --- --- --- \n \n',
  shortcutKeyCopyAllCodeBlocks: ']',
  copyCodeUserSeparator: ' \n  \n --- --- --- \n \n',
  altPageUp: 'PageUp',
  altPageDown: 'PageDown',

  // === Additional keys from 222s ===
  shortcutKeyRegenerateTryAgain: '',
  shortcutKeyRegenerateMoreConcise: '',
  shortcutKeyRegenerateAddDetails: '',
  shortcutKeyRegenerateWithDifferentModel: '',
  shortcutKeyRegenerateAskToChangeResponse: '',
  shortcutKeyMoreDotsReadAloud: '',
  shortcutKeyMoreDotsBranchInNewChat: '',
  shortcutKeyThinkingExtended: '',
  shortcutKeyThinkingStandard: '',
  shortcutKeyNewGptConversation: '',
  selectThenCopyAllMessages: '',
  selectThenCopyAllMessagesBothUserAndChatGpt: false,
  selectThenCopyAllMessagesOnlyAssistant: false,
  selectThenCopyAllMessagesOnlyUser: false,
  doNotIncludeLabelsCheckbox: false,
  modelNames: [
    'GPT-5.1 Auto',
    'GPT-5.1 Instant',
    'GPT-5.1 Thinking',
    'GPT-5 Instant',
    'GPT-5 mini',
    'GPT-5 Thinking',
    '4o',
    '4.1',
    'o3',
    'o4-mini',
  ],
  showLegacyArrowButtonsCheckbox: false,

  // === Toggles / sliders ===
  pageUpDownTakeover: true,
  popupBottomBarOpacityValue: '0.6', // range -> string
  moveTopBarToBottomCheckbox: false,
  removeMarkdownOnCopyCheckbox: true,
  rememberSidebarScrollPositionCheckbox: true,
  popupSlimSidebarOpacityValue: '0.0',
  fadeSlimSidebarEnabled: false,
  enableSendWithControlEnterCheckbox: true,
  enableStopWithControlBackspaceCheckbox: true,
  hideArrowButtonsCheckbox: true,
  hideCornerButtonsCheckbox: true,

  // Copy behavior
  disableCopyAfterSelectCheckbox: false,

  // Model picker — up to 15 slots (UI shows only as many as needed)
  // First 10 use 0–9 digits; the remaining 5 start empty and can be assigned by the user.
  modelPickerKeyCodes: [
    'Digit1',
    'Digit2',
    'Digit3',
    'Digit4',
    'Digit5',
    'Digit6',
    'Digit7',
    'Digit8',
    'Digit9',
    'Digit0',
    '',
    '',
    '',
    '',
    '',
  ],

  // === Radios ===
  useAltForModelSwitcherRadio: true,
  useControlForModelSwitcherRadio: false,

  // Legacy booleans still read by content.js
  selectMessagesSentByUserOrChatGptCheckbox: true,
  onlySelectAssistantCheckbox: false,
  onlySelectUserCheckbox: false,

  // Consolidated key (populated from legacy flags in migration)
  messageSelection: 'user_or_assistant',
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

      // 4) Populate new messageSelection from legacy flags
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

      // 5) Remove anything truly unused (keep it last)
      OptionsSync.migrations.removeUnused,
    ],
  });
}

// Helpful globals so any script can reuse the same instance/defaults
globalThis.OPTIONS_DEFAULTS = OPTIONS_DEFAULTS;
globalThis.optionsSync = globalThis.optionsStorage;
