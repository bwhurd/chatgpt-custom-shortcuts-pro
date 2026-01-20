(function () {
    // Minimal shared schema for wiring/maintenance.
    // Keep this file dependency-free so it can be loaded early (popup + content).
    window.CSP_SETTINGS_SCHEMA = window.CSP_SETTINGS_SCHEMA || {};
    window.CSP_SETTINGS_SCHEMA.schemaVersion = 1;

    window.CSP_SETTINGS_SCHEMA.excludeDefaultsKeys = [
        // Keep current behavior: popup should not seed these on first run.
        'modelNames',
        'hideArrowButtonsCheckbox',
        'hideCornerButtonsCheckbox',
    ];

    window.CSP_SETTINGS_SCHEMA.popup = {
        // Inputs that have specialized behavior and should NOT use the generic data-sync checkbox/radio handler.
        excludedStateWiringKeys: [
            'useAltForModelSwitcherRadio',
            'useControlForModelSwitcherRadio',
            'fadeSlimSidebarEnabled',
            'moveTopBarToBottomCheckbox',
        ],

        // Radio-group definitions used by popup.js for mutually-exclusive options.
        // Keeping these here reduces the number of places you must update when adding
        // new grouped toggles.
        radioGroups: [
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
                    // Legacy naming variants (kept for back-compat)
                    'selectAndCopyEntireConversationBothUserAndChatGpt',
                    'selectAndCopyEntireConversationOnlyAssistant',
                    'selectAndCopyEntireConversationOnlyUser',
                    // Current naming (popup.html)
                    'selectThenCopyAllMessagesBothUserAndChatGpt',
                    'selectThenCopyAllMessagesOnlyAssistant',
                    'selectThenCopyAllMessagesOnlyUser',
                ],
            },
            {
                name: 'modelSwitcherModifier',
                keys: ['useAltForModelSwitcherRadio', 'useControlForModelSwitcherRadio'],
            },
        ],

        // Opt-in selectors for generic wiring / discovery.
        stateInputSelector: 'input[type="checkbox"][data-sync], input[type="radio"][data-sync]',
        shortcutInputSelector: 'input.key-input',
    };

    // Shortcut key conventions shared across popup + content:
    // - Most shortcuts are stored under keys starting with "shortcutKey"
    // - A small number of legacy/utility shortcuts don't follow that prefix
    window.CSP_SETTINGS_SCHEMA.shortcuts = {
        keyPrefix: 'shortcutKey',
        extraShortcutKeys: ['selectThenCopy', 'selectThenCopyAllMessages'],
        // Popup shortcut keys that use Ctrl/Cmd instead of Alt.
        // Used for modifier-aware duplicate detection in popup.js.
        ctrlShortcutKeys: ['shortcutKeyShowShortcuts'],

        // Overlay label source of truth: storage key -> i18n message key.
        // Keep this aligned with popup.html shortcut labels so Ctrl+/ overlay matches across locales.
        labelI18nByKey: {
            shortcutKeyToggleModelSelector: 'label_showModelPicker',
            shortcutKeyThinkingStandard: 'label_switchToThinkingStandard',
            shortcutKeyThinkingExtended: 'label_switchToThinkingExtended',

            shortcutKeyNewConversation: 'label_new_chat',
            shortcutKeyActivateInput: 'label_focus_input',
            shortcutKeyToggleSidebar: 'label_toggle_sidebar',
            shortcutKeyPreviousThread: 'label_prev_thread',
            shortcutKeyNextThread: 'label_next_thread',
            shortcutKeySearchConversationHistory: 'label_search_chats',
            shortcutKeyShare: 'label_share',
            shortcutKeyNewGptConversation: 'label_NewGptConversation',

            shortcutKeyScrollToTop: 'label_scroll_top',
            shortcutKeyClickNativeScrollToBottom: 'label_scroll_bottom',
            shortcutKeyScrollUpOneMessage: 'label_scroll_up_one',
            shortcutKeyScrollDownOneMessage: 'label_scroll_down_one',
            shortcutKeyScrollUpTwoMessages: 'label_scroll_up_two',
            shortcutKeyScrollDownTwoMessages: 'label_scroll_down_two',

            shortcutKeyCopyLowest: 'label_copy',
            selectThenCopy: 'label_select_copy',
            selectThenCopyAllMessages: 'label_selectThenCopyAllMessages',
            shortcutKeyCopyAllCodeBlocks: 'label_join_code',

            shortcutKeyEdit: 'label_edit_msg',
            shortcutKeySendEdit: 'label_send_edit',
            shortcutKeyMoreDotsBranchInNewChat: 'label_BranchInNewChat',
            shortcutKeyTemporaryChat: 'label_temp_chat',
            shortcutKeyToggleDictate: 'label_toggle_dictate',
            shortcutKeyCancelDictation: 'label_cancel_dictation',
            shortcutKeyMoreDotsReadAloud: 'label_ReadAloud',

            shortcutKeyRegenerateTryAgain: 'label_regenerate',
            shortcutKeyRegenerateWithDifferentModel: 'label_RegenerateWithDifferentModel',
            shortcutKeyRegenerateMoreConcise: 'label_MoreConcise',
            shortcutKeyRegenerateAddDetails: 'label_AddDetails',
            shortcutKeyRegenerateAskToChangeResponse: 'label_RegenerateAskToChangeResponse',

            shortcutKeySearchWeb: 'label_search_web',
            shortcutKeyStudy: 'label_study',
            shortcutKeyCreateImage: 'label_toggle_create_image',
            shortcutKeyToggleCanvas: 'label_toggle_canvas',
            shortcutKeyAddPhotosFiles: 'label_add_photos_files',
            shortcutKeyThinkLonger: 'label_think_longer',
        },

        // Used by content.js Ctrl+/ overlay section grouping (model picker grid stays separate).
        overlaySections: [
            {
                headerI18nKey: 'section_model_picker_tweaks',
                header: 'Model Picker',
                keys: [
                    'shortcutKeyToggleModelSelector',
                    'shortcutKeyThinkingStandard',
                    'shortcutKeyThinkingExtended',
                ],
            },
            {
                headerI18nKey: 'section_quick_clicks',
                header: 'Quick Clicks',
                keys: [
                    'shortcutKeyNewConversation',
                    'shortcutKeyActivateInput',
                    'shortcutKeyToggleSidebar',
                    'shortcutKeyPreviousThread',
                    'shortcutKeyNextThread',
                    'shortcutKeySearchConversationHistory',
                    'shortcutKeyShare',
                    'shortcutKeyNewGptConversation',
                ],
            },
            {
                headerI18nKey: 'section_scroll',
                header: 'Scroll',
                keys: [
                    'shortcutKeyScrollToTop',
                    'shortcutKeyClickNativeScrollToBottom',
                    'shortcutKeyScrollUpOneMessage',
                    'shortcutKeyScrollDownOneMessage',
                    'shortcutKeyScrollUpTwoMessages',
                    'shortcutKeyScrollDownTwoMessages',
                ],
            },
            {
                headerI18nKey: 'section_clipboard',
                header: 'Clipboard',
                keys: [
                    'shortcutKeyCopyLowest',
                    'selectThenCopy',
                    'selectThenCopyAllMessages',
                    'shortcutKeyCopyAllCodeBlocks',
                ],
            },
            {
                headerI18nKey: 'section_compose_send',
                header: 'Compose + Send',
                keys: [
                    'shortcutKeyEdit',
                    'shortcutKeySendEdit',
                    'shortcutKeyMoreDotsBranchInNewChat',
                    'shortcutKeyTemporaryChat',
                    'shortcutKeyToggleDictate',
                    'shortcutKeyCancelDictation',
                    'shortcutKeyMoreDotsReadAloud',
                ],
            },
            {
                headerI18nKey: 'section_regenerate',
                header: 'Regenerate Response',
                keys: [
                    'shortcutKeyRegenerateTryAgain',
                    'shortcutKeyRegenerateMoreConcise',
                    'shortcutKeyRegenerateAddDetails',
                    'shortcutKeyRegenerateWithDifferentModel',
                    'shortcutKeyRegenerateAskToChangeResponse',
                ],
            },
            {
                headerI18nKey: 'section_message_tools',
                header: 'Message Tools',
                keys: [
                    'shortcutKeySearchWeb',
                    'shortcutKeyStudy',
                    'shortcutKeyCreateImage',
                    'shortcutKeyToggleCanvas',
                    'shortcutKeyAddPhotosFiles',
                    'shortcutKeyThinkLonger',
                ],
            },
        ],
    };

    window.CSP_SETTINGS_SCHEMA.content = {
        // Single source of truth for boolean UI-tweak toggles consumed by content.js.
        // content.js will fall back to its internal map if this is missing.
        visibilityDefaults: {
            moveTopBarToBottomCheckbox: false,
            pageUpDownTakeover: true,
            showLegacyArrowButtonsCheckbox: false,
            removeMarkdownOnCopyCheckbox: true,
            selectMessagesSentByUserOrChatGptCheckbox: true,
            onlySelectUserCheckbox: false,
            onlySelectAssistantCheckbox: false,
            disableCopyAfterSelectCheckbox: false,
            enableSendWithControlEnterCheckbox: true,
            enableStopWithControlBackspaceCheckbox: true,
            useAltForModelSwitcherRadio: true,
            useControlForModelSwitcherRadio: false,
            rememberSidebarScrollPositionCheckbox: false,
            selectThenCopyAllMessagesBothUserAndChatGpt: true,
            selectThenCopyAllMessagesOnlyAssistant: false,
            selectThenCopyAllMessagesOnlyUser: false,
            doNotIncludeLabelsCheckbox: false,
            clickToCopyInlineCodeEnabled: false,
        },

        // Extra keys fetched with visibility settings (non-boolean or legacy).
        // Toggles should live in content.js's VISIBILITY_DEFAULTS; those keys auto-load.
        visibilityExtraKeys: [
            'hideArrowButtonsCheckbox',
            'popupBottomBarOpacityValue',
            'fadeSlimSidebarEnabled',
            'popupSlimSidebarOpacityValue',
            'colorBoldTextEnabled',
            'colorBoldTextLightColor',
            'colorBoldTextDarkColor',
        ],
    };
})();
