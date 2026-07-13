(function initShortcutActionMetadata(root, factory) {
  const modelPickerSelectors =
    root.CSPModelPickerSelectors ||
    (typeof module === 'object' && module.exports && typeof require === 'function'
      ? require('./model-picker-selectors.js')
      : null);
  const metadata = factory(modelPickerSelectors || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = metadata;
  }
  root.CSPShortcutActionMetadata = metadata;
})(typeof globalThis !== 'undefined' ? globalThis : this, (modelPickerSelectors) => {
  const VALIDATION_MODES = Object.freeze(['scrape-targets', 'manual-only', 'not-applicable']);
  const ACTIVATION_PROBE_MODES = Object.freeze([
    'click-target',
    'focus-target',
    'opens-target',
    'direct-menu-target',
    'viewport-target',
    'clipboard-text',
    'dom-state',
    'not-live-probed',
    'manual-only',
    'not-applicable',
  ]);

  function asArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return value ? [value] : [];
  }

  function unique(values) {
    return [...new Set(asArray(values))];
  }

  function normalizeMatchGroups(matchGroups, fallbackNeedles) {
    const rawGroups =
      Array.isArray(matchGroups) && matchGroups.length
        ? matchGroups
        : asArray(fallbackNeedles).map((needle) => [needle]);
    return rawGroups.map((group) => unique(group)).filter((group) => group.length > 0);
  }

  function freezeDescriptor(definition) {
    const matchGroups = normalizeMatchGroups(definition.matchGroups, definition.searchNeedles);
    return Object.freeze({
      targetId: definition.targetId,
      kind: definition.kind,
      identifier: definition.identifier,
      searchNeedles: Object.freeze(unique(definition.searchNeedles || matchGroups.flat())),
      matchGroups: Object.freeze(matchGroups.map((group) => Object.freeze(group))),
      uiStateRefs: Object.freeze(unique(definition.uiStateRefs)),
      notes: definition.notes || '',
    });
  }

  function byTestId(targetId, testId, options = {}) {
    return freezeDescriptor({
      targetId,
      kind: 'test-id',
      identifier: options.identifier || `data-testid=${testId}`,
      searchNeedles: options.searchNeedles || `data-testid="${testId}"`,
      matchGroups: options.matchGroups,
      uiStateRefs: options.uiStateRefs,
      notes: options.notes,
    });
  }

  function byId(targetId, id, options = {}) {
    return freezeDescriptor({
      targetId,
      kind: 'id',
      identifier: options.identifier || `id=${id}`,
      searchNeedles: options.searchNeedles || `id="${id}"`,
      matchGroups: options.matchGroups,
      uiStateRefs: options.uiStateRefs,
      notes: options.notes,
    });
  }

  function byAriaControls(targetId, controlsId, options = {}) {
    return freezeDescriptor({
      targetId,
      kind: 'aria-controls',
      identifier: options.identifier || `aria-controls=${controlsId}`,
      searchNeedles: options.searchNeedles || `aria-controls="${controlsId}"`,
      matchGroups: options.matchGroups,
      uiStateRefs: options.uiStateRefs,
      notes: options.notes,
    });
  }

  function byInputName(targetId, inputName, options = {}) {
    return freezeDescriptor({
      targetId,
      kind: 'input-name',
      identifier: options.identifier || `name=${inputName}`,
      searchNeedles: options.searchNeedles || `name="${inputName}"`,
      matchGroups: options.matchGroups,
      uiStateRefs: options.uiStateRefs,
      notes: options.notes,
    });
  }

  function byIconToken(targetId, tokens, options = {}) {
    const tokenList = unique(tokens);
    return freezeDescriptor({
      targetId,
      kind: 'icon-token',
      identifier: options.identifier || `svg-token=${tokenList.join('|')}`,
      searchNeedles: options.searchNeedles || tokenList,
      matchGroups: options.matchGroups,
      uiStateRefs: options.uiStateRefs,
      notes: options.notes,
    });
  }

  function byMenuChain(targetId, identifier, options = {}) {
    return freezeDescriptor({
      targetId,
      kind: 'menu-chain',
      identifier,
      searchNeedles: options.searchNeedles || identifier,
      matchGroups: options.matchGroups,
      uiStateRefs: options.uiStateRefs,
      notes: options.notes,
    });
  }

  function bySelectorList(targetId, selectors, options = {}) {
    const selectorList = unique(selectors);
    return freezeDescriptor({
      targetId,
      kind: 'selector-list',
      identifier: options.identifier || selectorList.join(' | '),
      searchNeedles: options.searchNeedles || selectorList,
      matchGroups: options.matchGroups,
      uiStateRefs: options.uiStateRefs,
      notes: options.notes,
    });
  }

  function manualTarget(targetId, identifier, options = {}) {
    return freezeDescriptor({
      targetId,
      kind: 'manual-only',
      identifier,
      searchNeedles: options.searchNeedles || [],
      matchGroups: options.matchGroups,
      uiStateRefs: options.uiStateRefs || [],
      notes: options.notes,
    });
  }

  const modelSwitcherButtonSelectors = Object.freeze(
    unique(
      modelPickerSelectors.MODEL_MENU_BUTTON_SELECTORS || [
        'button[data-testid="model-switcher-dropdown-button"]',
        'button[data-testid="Model-switCher-dropdown-button"]',
        '[data-composer-surface="true"] button.__composer-pill[aria-haspopup="menu"][id^="radix-"]',
      ],
    ),
  );
  const modelSwitcherButtonMatchGroups =
    typeof modelPickerSelectors.getModelSwitcherButtonMatchGroups === 'function'
      ? modelPickerSelectors.getModelSwitcherButtonMatchGroups()
      : [
          ['data-testid="model-switcher-dropdown-button"'],
          ['data-testid="Model-switCher-dropdown-button"'],
          ['__composer-pill', 'aria-haspopup="menu"', 'id="radix-'],
        ];
  const modelSwitcherMenuMatchGroups =
    typeof modelPickerSelectors.getModelSwitcherMenuMatchGroups === 'function'
      ? modelPickerSelectors.getModelSwitcherMenuMatchGroups()
      : [['data-radix-menu-content', 'role="menu"', 'data-state="open"']];
  const configureDialogMatchGroups =
    typeof modelPickerSelectors.getConfigureDialogMatchGroups === 'function'
      ? modelPickerSelectors.getConfigureDialogMatchGroups()
      : [['role="dialog"', 'id="model-selection-label"']];
  const configureModelListboxMatchGroups =
    typeof modelPickerSelectors.getConfigureModelListboxMatchGroups === 'function'
      ? modelPickerSelectors.getConfigureModelListboxMatchGroups()
      : [['role="listbox"', 'role="option"']];
  const modelThinkingEffortActionMatchGroups =
    typeof modelPickerSelectors.getModelThinkingEffortActionMatchGroups === 'function'
      ? modelPickerSelectors.getModelThinkingEffortActionMatchGroups()
      : [['data-model-picker-thinking-effort-action="true"', 'aria-haspopup="menu"']];
  const modelThinkingEffortMenuMatchGroups =
    typeof modelPickerSelectors.getModelThinkingEffortMenuMatchGroups === 'function'
      ? modelPickerSelectors.getModelThinkingEffortMenuMatchGroups()
      : [['role="menu"', 'role="menuitemradio"', 'Standard', 'Extended']];
  const modelThinkingEffortStandardMatchGroups =
    typeof modelPickerSelectors.getModelThinkingEffortStandardMatchGroups === 'function'
      ? modelPickerSelectors.getModelThinkingEffortStandardMatchGroups()
      : [['role="menuitemradio"', 'Standard']];
  const modelThinkingEffortExtendedMatchGroups =
    typeof modelPickerSelectors.getModelThinkingEffortExtendedMatchGroups === 'function'
      ? modelPickerSelectors.getModelThinkingEffortExtendedMatchGroups()
      : [['role="menuitemradio"', 'Extended']];
  const modelThinkingEffortLightMatchGroups = [['role="menuitemradio"', 'Light']];
  const modelThinkingEffortHeavyMatchGroups = [['role="menuitemradio"', 'Heavy']];
  const modelProThinkingEffortActionMatchGroups = [
    ['data-model-picker-thinking-effort-action="true"', '-pro-thinking-effort'],
  ];
  const modelProThinkingEffortMenuMatchGroups =
    typeof modelPickerSelectors.getModelThinkingEffortMenuMatchGroups === 'function'
      ? modelPickerSelectors.getModelThinkingEffortMenuMatchGroups()
      : [['role="menu"', 'role="menuitemradio"', 'Standard', 'Extended']];
  const modelProThinkingEffortStandardMatchGroups =
    typeof modelPickerSelectors.getModelThinkingEffortStandardMatchGroups === 'function'
      ? modelPickerSelectors.getModelThinkingEffortStandardMatchGroups()
      : [['role="menuitemradio"', 'Standard']];
  const modelProThinkingEffortExtendedMatchGroups =
    typeof modelPickerSelectors.getModelThinkingEffortExtendedMatchGroups === 'function'
      ? modelPickerSelectors.getModelThinkingEffortExtendedMatchGroups()
      : [['role="menuitemradio"', 'Extended']];
  const configureProRowMatchGroups = [
    ['role="radio"', 'Pro'],
    ['__menu-item', 'Pro'],
    ['data-model-picker-pro-row'],
    ['data-model-picker-pro-menu-item'],
  ];
  const TARGET_DESCRIPTORS = Object.freeze([
    byTestId('close-sidebar-button', 'close-sidebar-button', {
      uiStateRefs: ['sidebar-collapsed-body', 'sidebar-expanded-body'],
    }),
    byAriaControls('stage-slideover-sidebar-control', 'stage-slideover-sidebar', {
      uiStateRefs: ['sidebar-collapsed-body', 'sidebar-expanded-body'],
    }),
    byAriaControls('stage-popover-sidebar-control', 'stage-popover-sidebar', {
      uiStateRefs: ['narrow-header-sidebar-popover-control'],
    }),
    byMenuChain('native-sidebar-toggle-control', 'native-sidebar-toggle-control', {
      matchGroups: [
        ['data-testid="close-sidebar-button"'],
        ['aria-controls="stage-slideover-sidebar"'],
        ['aria-controls="stage-popover-sidebar"'],
        ['data-testid="open-sidebar-button"'],
      ],
      uiStateRefs: [
        'sidebar-expanded-body',
        'sidebar-collapsed-body',
        'narrow-header-sidebar-popover-control',
      ],
      notes:
        'Responsive native sidebar toggle may be rendered as close, desktop open, or narrow popover open control.',
    }),
    byId('page-header', 'page-header', {
      uiStateRefs: ['topbar-bottom-disabled-header-area'],
    }),
    byId('thread-bottom', 'thread-bottom', {
      uiStateRefs: ['topbar-bottom-disabled-thread-bottom'],
    }),
    manualTarget('message-scroll-up-delta', 'message-scroll-up-delta', {
      notes:
        'Validated by live-probe scroll position delta after invoking the extension scroll helper.',
    }),
    manualTarget('message-scroll-down-delta', 'message-scroll-down-delta', {
      notes:
        'Validated by live-probe scroll position delta after invoking the extension scroll helper.',
    }),
    manualTarget('code-block-content', 'pre code', {
      searchNeedles: ['<pre', '<code'],
      matchGroups: [['<pre'], ['<code']],
      notes:
        'Validated from a disposable live-probe codebox conversation rather than the fixed no-token scrape fixture.',
    }),
    manualTarget('codebox-wrap-enabled', 'html.csp-codebox-wrap-enabled', {
      searchNeedles: ['<pre', '<code'],
      matchGroups: [['<pre'], ['<code']],
      notes: 'Validated by asserting the extension root class after toggling codebox wrapping.',
    }),
    manualTarget('shortcut-overlay', 'id=csp-shortcut-overlay', {
      searchNeedles: ['id="csp-shortcut-overlay"'],
      matchGroups: [['id="csp-shortcut-overlay"']],
      notes: 'Internal extension shortcut overlay, opened by the standalone overlay listener.',
    }),
    byTestId('composer-plus-button', 'composer-plus-btn', {
      uiStateRefs: [
        'topbar-bottom-disabled-thread-bottom',
        'topbar-bottom-disabled-header-area',
        'sidebar-collapsed-body',
        'sidebar-expanded-body',
        'composer-add-files-and-more-menu',
      ],
    }),
    byTestId('copy-turn-action-button', 'copy-turn-action-button', {
      uiStateRefs: [
        'user-turn-buttons-exposed',
        'assistant-turn-non-web-buttons-exposed',
        'assistant-turn-web-buttons-exposed',
      ],
    }),
    byIconToken('edit-message-button', ['#6d87e1', 'aria-label="Edit message"'], {
      identifier: 'svg-token=#6d87e1|aria-label=Edit message',
      uiStateRefs: ['user-turn-buttons-exposed'],
    }),
    manualTarget('edit-send-button', 'active-edit-send-button', {
      searchNeedles: ['textarea', 'Cancel', 'Send'],
      matchGroups: [
        ['textarea', 'Cancel', 'Send'],
        ['contenteditable="true"', 'Cancel', 'Send'],
      ],
      notes: 'Requires an active edit state created by the side-effectful live probe setup.',
    }),
    manualTarget('send-button', 'data-testid=send-button|id=composer-submit-button', {
      searchNeedles: ['data-testid="send-button"', 'id="composer-submit-button"'],
      notes:
        'Only available when the composer already has draft content, so the no-token baseline scrape does not expose it.',
    }),
    manualTarget('stop-button', 'visible-stop-button-during-generation', {
      searchNeedles: ['data-testid="stop-button"', 'data-test-id="stop-button"'],
      notes:
        'Only rendered while ChatGPT is actively generating; side-effectful live probe setup creates that state.',
    }),
    byTestId('create-new-chat-button', 'create-new-chat-button', {
      uiStateRefs: ['sidebar-collapsed-body', 'sidebar-expanded-body'],
    }),
    byTestId('search-conversation-button', 'search-conversation-button', {
      matchGroups: [['data-testid="search-conversation-button"'], ['#ac6d36']],
      uiStateRefs: ['sidebar-collapsed-body', 'sidebar-expanded-body'],
    }),
    byMenuChain('search-chats-dialog', 'role=dialog|placeholder=Search chats', {
      matchGroups: [['role="dialog"', 'placeholder="Search chats..."']],
      notes: 'Resulting dialog opened by Search Chats.',
    }),
    byInputName('prompt-textarea', 'prompt-textarea', {
      identifier: 'name=prompt-textarea|id=prompt-textarea',
      searchNeedles: ['name="prompt-textarea"', 'id="prompt-textarea"'],
      uiStateRefs: [
        'topbar-bottom-disabled-thread-bottom',
        'sidebar-collapsed-body',
        'sidebar-expanded-body',
      ],
    }),
    byIconToken('previous-response-button', ['#8ee2e9', 'aria-label="Previous response"'], {
      identifier: 'svg-token=#8ee2e9|aria-label=Previous response',
      uiStateRefs: ['assistant-turn-non-web-buttons-exposed', 'assistant-turn-web-buttons-exposed'],
    }),
    byIconToken('next-response-button', ['#b140e7', 'aria-label="Next response"'], {
      identifier: 'svg-token=#b140e7|aria-label=Next response',
      uiStateRefs: ['assistant-turn-non-web-buttons-exposed', 'assistant-turn-web-buttons-exposed'],
    }),
    bySelectorList('model-switcher-button', modelSwitcherButtonSelectors, {
      identifier: 'model-picker-opener',
      matchGroups: modelSwitcherButtonMatchGroups,
      uiStateRefs: [
        'sidebar-collapsed-body',
        'sidebar-expanded-body',
        'topbar-bottom-disabled-thread-bottom',
        'topbar-bottom-disabled-header-area',
        'model-switcher-menu',
      ],
    }),
    byMenuChain('model-switcher-menu', 'data-radix-menu-content', {
      matchGroups: modelSwitcherMenuMatchGroups,
      uiStateRefs: ['model-switcher-menu'],
    }),
    byMenuChain('model-switcher-configure-dialog', 'role=dialog|model-selection-label', {
      matchGroups: configureDialogMatchGroups,
      uiStateRefs: ['model-switcher-configure-dialog'],
    }),
    byMenuChain('model-switcher-configure-model-listbox', 'role=listbox|model-options', {
      matchGroups: configureModelListboxMatchGroups,
      uiStateRefs: ['model-switcher-configure-listbox'],
    }),
    byMenuChain('model-switcher-configure-pro-row', 'role=radio|Pro', {
      matchGroups: configureProRowMatchGroups,
      uiStateRefs: ['model-switcher-configure-dialog'],
    }),
    byMenuChain(
      'model-switcher-thinking-effort-action',
      'data-model-picker-thinking-effort-action',
      {
        matchGroups: modelThinkingEffortActionMatchGroups,
        uiStateRefs: ['model-switcher-menu'],
      },
    ),
    byMenuChain('model-switcher-thinking-effort-menu', 'role=menu|thinking-effort-options', {
      matchGroups: modelThinkingEffortMenuMatchGroups,
      uiStateRefs: ['model-switcher-thinking-effort-menu'],
    }),
    byMenuChain('model-switcher-thinking-effort-standard', 'thinking-effort-standard', {
      matchGroups: modelThinkingEffortStandardMatchGroups,
      uiStateRefs: ['model-switcher-thinking-effort-menu'],
    }),
    byMenuChain('model-switcher-thinking-effort-extended', 'thinking-effort-extended', {
      matchGroups: modelThinkingEffortExtendedMatchGroups,
      uiStateRefs: ['model-switcher-thinking-effort-menu'],
    }),
    byMenuChain('model-switcher-thinking-effort-light', 'thinking-effort-light', {
      matchGroups: modelThinkingEffortLightMatchGroups,
      uiStateRefs: ['model-switcher-thinking-effort-menu'],
    }),
    byMenuChain('model-switcher-thinking-effort-heavy', 'thinking-effort-heavy', {
      matchGroups: modelThinkingEffortHeavyMatchGroups,
      uiStateRefs: ['model-switcher-thinking-effort-menu'],
    }),
    byMenuChain(
      'model-switcher-pro-thinking-effort-action',
      'data-model-picker-thinking-effort-action|pro',
      {
        matchGroups: modelProThinkingEffortActionMatchGroups,
        uiStateRefs: ['model-switcher-menu'],
      },
    ),
    byMenuChain('model-switcher-pro-thinking-effort-menu', 'role=menu|pro-thinking-effort', {
      matchGroups: modelProThinkingEffortMenuMatchGroups,
      uiStateRefs: ['model-switcher-pro-thinking-effort-menu'],
    }),
    byMenuChain('model-switcher-pro-thinking-effort-standard', 'pro-thinking-effort-standard', {
      matchGroups: modelProThinkingEffortStandardMatchGroups,
      uiStateRefs: ['model-switcher-pro-thinking-effort-menu'],
    }),
    byMenuChain('model-switcher-pro-thinking-effort-extended', 'pro-thinking-effort-extended', {
      matchGroups: modelProThinkingEffortExtendedMatchGroups,
      uiStateRefs: ['model-switcher-pro-thinking-effort-menu'],
    }),
    byIconToken('assistant-web-regenerate-trigger', '#ec66f0', {
      identifier: 'svg-token=#ec66f0 (assistant regenerate trigger)',
      uiStateRefs: ['assistant-turn-web-buttons-exposed'],
    }),
    byIconToken('assistant-web-regenerate-item-try-again', '#ec66f0', {
      identifier: 'svg-token=#ec66f0 (regenerate submenu item)',
      uiStateRefs: ['assistant-web-regenerate-menu-copy', 'assistant-web-regenerate-menu'],
    }),
    byIconToken('assistant-web-regenerate-item-different-model', '#9254a2', {
      uiStateRefs: ['assistant-web-regenerate-menu-copy', 'assistant-web-regenerate-menu'],
    }),
    byInputName('assistant-web-regenerate-input', 'contextual-retry-dropdown-input', {
      uiStateRefs: ['assistant-web-regenerate-menu-copy', 'assistant-web-regenerate-menu'],
    }),
    byIconToken('assistant-more-actions-trigger', '#f6d0e2', {
      uiStateRefs: [
        'user-turn-buttons-exposed',
        'assistant-turn-non-web-buttons-exposed',
        'assistant-turn-web-buttons-exposed',
      ],
    }),
    byTestId('assistant-more-actions-read-aloud', 'voice-play-turn-action-button', {
      uiStateRefs: ['assistant-menu-read-aloud-branch'],
    }),
    byIconToken('assistant-more-actions-branch', '#03583c', {
      uiStateRefs: ['assistant-menu-read-aloud-branch'],
    }),
    byIconToken('assistant-thinking-trigger', ['#127a53', '#c9d737'], {
      matchGroups: [['#127a53', '#c9d737']],
      uiStateRefs: ['assistant-turn-non-web-buttons-exposed', 'assistant-turn-web-buttons-exposed'],
    }),
    byIconToken('assistant-thinking-option-extended', '#143e56', {
      notes: 'Thinking effort menu options are not yet part of the scrape dump family.',
    }),
    byIconToken('assistant-thinking-option-standard', '#fec800', {
      notes: 'Thinking effort menu options are not yet part of the scrape dump family.',
    }),
    byIconToken('assistant-thinking-option-light', '#407870', {
      notes: 'Thinking effort menu options are not yet part of the scrape dump family.',
    }),
    byIconToken('assistant-thinking-option-heavy', '#3c5754', {
      notes: 'Thinking effort menu options are not yet part of the scrape dump family.',
    }),
    byIconToken('temporary-chat-button', ['#28a8a0', '#6eabdf'], {
      matchGroups: [['#28a8a0'], ['#6eabdf']],
      notes: 'Only exposed on a blank new conversation, not the fixed conversation fixture.',
    }),
    byIconToken('composer-web-search-action', ['#6d72eb', '#6b0d8c'], {
      matchGroups: [['#6d72eb'], ['#6b0d8c']],
      uiStateRefs: ['composer-add-files-and-more-menu'],
    }),
    byIconToken('composer-study-action', '#1fa93b', {
      uiStateRefs: ['composer-add-files-and-more-menu', 'composer-add-files-and-more-more-submenu'],
    }),
    byIconToken('composer-create-image-action', ['#ccfd18', '#266724'], {
      matchGroups: [['#ccfd18'], ['#266724']],
      uiStateRefs: ['composer-add-files-and-more-menu'],
    }),
    byIconToken('composer-deep-research-action', '#46f45a', {
      uiStateRefs: ['composer-add-files-and-more-menu'],
    }),
    byIconToken('dictate-start-button', ['#33d595', '#29f921'], {
      identifier: 'svg-token=#33d595|#29f921',
      matchGroups: [['#33d595'], ['#29f921']],
      uiStateRefs: ['topbar-bottom-disabled-thread-bottom'],
    }),
    manualTarget('dictate-submit-button', 'svg-token=#fa1dbd', {
      searchNeedles: ['#fa1dbd'],
      notes: 'Only available after dictation has already started.',
    }),
    manualTarget('cancel-dictation-button', 'svg-token=#85f94b', {
      searchNeedles: ['#85f94b'],
      notes: 'Only available while dictation is active.',
    }),
    byTestId('share-chat-button', 'share-chat-button', {
      uiStateRefs: ['topbar-bottom-disabled-header-area'],
    }),
    byIconToken('composer-think-longer-action', '#e717cc', {
      uiStateRefs: ['composer-add-files-and-more-menu', 'composer-add-files-and-more-more-submenu'],
    }),
    byIconToken('composer-add-photos-files-action', '#712359', {
      uiStateRefs: ['composer-add-files-and-more-menu'],
    }),
    byIconToken('composer-more-submenu-trigger', '#f6d0e2', {
      identifier: 'svg-token=#f6d0e2 (composer More submenu)',
      uiStateRefs: ['composer-add-files-and-more-menu'],
    }),
    byIconToken('new-gpt-conversation-item', '#3a5c87', {
      notes:
        'Validated by live activation from the GPT conversation fixture; not part of the main scrape dump family.',
    }),
  ]);

  const TARGET_BY_ID = Object.freeze(
    Object.fromEntries(TARGET_DESCRIPTORS.map((target) => [target.targetId, target])),
  );

  function targetStateRefs(...targetRefs) {
    return unique(targetRefs.flatMap((targetRef) => TARGET_BY_ID[targetRef]?.uiStateRefs || []));
  }

  function freezeActivationProbe(definition = {}) {
    const mode = definition.mode || 'not-live-probed';
    if (!ACTIVATION_PROBE_MODES.includes(mode)) {
      throw new Error(`Unknown shortcut activation probe mode: ${mode}`);
    }
    const expectedTargetRef = definition.expectedTargetRef || definition.targetRef || '';
    return Object.freeze({
      mode,
      expectedTargetRef,
      uiStateRefs: Object.freeze(unique(definition.uiStateRefs)),
      setup: definition.setup || '',
      url: definition.url || '',
      safe: definition.safe === true,
      notes: definition.notes || '',
    });
  }

  function clickTargetProbe(expectedTargetRef, options = {}) {
    return freezeActivationProbe({
      ...options,
      mode: 'click-target',
      expectedTargetRef,
      uiStateRefs: options.uiStateRefs || targetStateRefs(expectedTargetRef),
      safe: true,
    });
  }

  function focusTargetProbe(expectedTargetRef, options = {}) {
    return freezeActivationProbe({
      ...options,
      mode: 'focus-target',
      expectedTargetRef,
      uiStateRefs: options.uiStateRefs || targetStateRefs(expectedTargetRef),
      safe: true,
    });
  }

  function opensTargetProbe(expectedTargetRef, options = {}) {
    return freezeActivationProbe({
      ...options,
      mode: 'opens-target',
      expectedTargetRef,
      uiStateRefs: options.uiStateRefs || targetStateRefs(expectedTargetRef),
      safe: true,
    });
  }

  function directMenuTargetProbe(expectedTargetRef, options = {}) {
    return freezeActivationProbe({
      ...options,
      mode: 'direct-menu-target',
      expectedTargetRef,
      uiStateRefs: options.uiStateRefs || targetStateRefs(expectedTargetRef),
      safe: true,
    });
  }

  function viewportTargetProbe(expectedTargetRef, options = {}) {
    return freezeActivationProbe({
      ...options,
      mode: 'viewport-target',
      expectedTargetRef,
      uiStateRefs: options.uiStateRefs || targetStateRefs(expectedTargetRef),
      safe: true,
    });
  }

  function clipboardTextProbe(options = {}) {
    return freezeActivationProbe({
      ...options,
      mode: 'clipboard-text',
      expectedTargetRef: options.expectedTargetRef || '',
      uiStateRefs: options.uiStateRefs || [],
      safe: true,
    });
  }

  function domStateProbe(expectedTargetRef, options = {}) {
    return freezeActivationProbe({
      ...options,
      mode: 'dom-state',
      expectedTargetRef,
      uiStateRefs: options.uiStateRefs || [],
      safe: true,
    });
  }

  function notLiveProbed(notes, options = {}) {
    return freezeActivationProbe({
      ...options,
      mode: 'not-live-probed',
      notes,
      safe: false,
    });
  }

  function defineShortcutAction(definition) {
    const validationMode = definition.validationMode || 'scrape-targets';
    if (!VALIDATION_MODES.includes(validationMode)) {
      throw new Error(`Unknown shortcut validation mode: ${validationMode}`);
    }
    if (validationMode === 'scrape-targets' && !definition.activationProbe) {
      throw new Error(`Shortcut ${definition.actionId} is missing activation probe metadata`);
    }
    return Object.freeze({
      actionId: definition.actionId,
      validationMode,
      targetRefs: Object.freeze(unique(definition.targetRefs)),
      uiStateRefs: Object.freeze(unique(definition.uiStateRefs)),
      activationProbe: freezeActivationProbe(definition.activationProbe),
      notes: definition.notes || '',
      handlerRef: definition.handlerRef || `keyFunctionMappingAlt.${definition.actionId}`,
      requiresHandler: definition.requiresHandler !== false,
      requiresDefault: definition.requiresDefault !== false,
    });
  }

  function manualOnly(actionId, options = {}) {
    return defineShortcutAction({
      ...options,
      actionId,
      validationMode: 'manual-only',
      activationProbe: freezeActivationProbe({
        mode: 'manual-only',
        notes: options.activationProbe?.notes || options.notes || 'Manual-only shortcut.',
      }),
    });
  }

  function notApplicable(actionId, options = {}) {
    return defineShortcutAction({
      ...options,
      actionId,
      validationMode: 'not-applicable',
      targetRefs: options.targetRefs || [],
      uiStateRefs: options.uiStateRefs || [],
      activationProbe: freezeActivationProbe({
        mode: 'not-applicable',
        notes:
          options.activationProbe?.notes ||
          options.notes ||
          'Shortcut is not applicable to live target activation.',
      }),
    });
  }

  const SHORTCUT_ACTIONS = Object.freeze([
    defineShortcutAction({
      actionId: 'shortcutKeyScrollUpOneMessage',
      targetRefs: ['message-scroll-up-delta'],
      uiStateRefs: [],
      activationProbe: domStateProbe('message-scroll-up-delta', {
        setup: 'message-scroll-from-middle',
        notes: 'Validates that the shortcut moves the conversation scroll position upward.',
      }),
      notes: 'Internal extension scroll helper verified by scroll-position delta.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyScrollDownOneMessage',
      targetRefs: ['message-scroll-down-delta'],
      uiStateRefs: [],
      activationProbe: domStateProbe('message-scroll-down-delta', {
        setup: 'message-scroll-from-middle',
        notes: 'Validates that the shortcut moves the conversation scroll position downward.',
      }),
      notes: 'Internal extension scroll helper verified by scroll-position delta.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyScrollUpTwoMessages',
      targetRefs: ['message-scroll-up-delta'],
      uiStateRefs: [],
      activationProbe: domStateProbe('message-scroll-up-delta', {
        setup: 'message-scroll-from-middle',
        notes: 'Validates that the shortcut moves the conversation scroll position upward.',
      }),
      notes: 'Internal extension scroll helper verified by scroll-position delta.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyScrollDownTwoMessages',
      targetRefs: ['message-scroll-down-delta'],
      uiStateRefs: [],
      activationProbe: domStateProbe('message-scroll-down-delta', {
        setup: 'message-scroll-from-middle',
        notes: 'Validates that the shortcut moves the conversation scroll position downward.',
      }),
      notes: 'Internal extension scroll helper verified by scroll-position delta.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyCopyLowest',
      targetRefs: ['copy-turn-action-button'],
      uiStateRefs: targetStateRefs('copy-turn-action-button'),
      activationProbe: clickTargetProbe('copy-turn-action-button', {
        uiStateRefs: ['assistant-turn-non-web-buttons-exposed'],
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyEdit',
      targetRefs: ['edit-message-button'],
      uiStateRefs: targetStateRefs('edit-message-button'),
      activationProbe: clickTargetProbe('edit-message-button', {
        setup: 'sent-user-message',
        notes: 'Side-effectful probe sends a disposable message and opens the user edit card.',
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeySendEdit',
      targetRefs: ['edit-send-button'],
      uiStateRefs: targetStateRefs('edit-send-button'),
      activationProbe: clickTargetProbe('edit-send-button', {
        setup: 'active-edit-card',
        uiStateRefs: [],
        notes:
          'Side-effectful probe sends a disposable message, opens its edit card, replaces the text, then dispatches Send Edit.',
      }),
      notes: 'Needs an active edit card state.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyCopyAllCodeBlocks',
      targetRefs: ['code-block-content'],
      uiStateRefs: [],
      activationProbe: clipboardTextProbe({
        expectedTargetRef: 'code-block-content',
        setup: 'clipboard-code-blocks',
        notes:
          'Creates a disposable conversation with multiple assistant codeboxes and validates that code text was written to the clipboard.',
      }),
      notes:
        'Clipboard transformation helper verified by clipboard contents from a codebox fixture.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyToggleCodeboxWrap',
      targetRefs: ['codebox-wrap-enabled'],
      uiStateRefs: [],
      activationProbe: domStateProbe('codebox-wrap-enabled', {
        setup: 'codebox-conversation',
        notes:
          'Creates a disposable conversation with an assistant codebox and asserts the wrap root class toggled on.',
      }),
      notes: 'Internal extension CSS word-wrap helper verified by DOM state.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyClickNativeScrollToBottom',
      targetRefs: ['thread-bottom', 'composer-plus-button'],
      uiStateRefs: targetStateRefs('thread-bottom', 'composer-plus-button'),
      activationProbe: viewportTargetProbe('thread-bottom', {
        setup: 'scroll-from-top',
        uiStateRefs: ['topbar-bottom-disabled-thread-bottom'],
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyScrollToTop',
      targetRefs: ['page-header'],
      uiStateRefs: targetStateRefs('page-header'),
      activationProbe: viewportTargetProbe('page-header', {
        setup: 'scroll-from-bottom',
        uiStateRefs: ['topbar-bottom-disabled-thread-bottom'],
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyNewConversation',
      targetRefs: ['create-new-chat-button'],
      uiStateRefs: targetStateRefs('create-new-chat-button'),
      activationProbe: opensTargetProbe('temporary-chat-button', {
        uiStateRefs: ['topbar-bottom-disabled-thread-bottom'],
        notes:
          'New Conversation should open a blank chat where the Temporary Chat button is available before any prompt is sent.',
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeySearchConversationHistory',
      targetRefs: ['search-conversation-button'],
      uiStateRefs: targetStateRefs('search-conversation-button'),
      activationProbe: opensTargetProbe('search-chats-dialog', {
        uiStateRefs: ['sidebar-expanded-body'],
        notes: 'Alt+Comma should open the Search chats dialog.',
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyToggleSidebar',
      targetRefs: [
        'close-sidebar-button',
        'stage-slideover-sidebar-control',
        'stage-popover-sidebar-control',
      ],
      uiStateRefs: targetStateRefs(
        'close-sidebar-button',
        'stage-slideover-sidebar-control',
        'stage-popover-sidebar-control',
      ),
      activationProbe: clickTargetProbe('native-sidebar-toggle-control', {
        uiStateRefs: ['sidebar-expanded-body'],
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyActivateInput',
      targetRefs: ['prompt-textarea'],
      uiStateRefs: targetStateRefs('prompt-textarea'),
      activationProbe: focusTargetProbe('prompt-textarea', {
        uiStateRefs: ['topbar-bottom-disabled-thread-bottom'],
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeySearchWeb',
      targetRefs: ['composer-plus-button', 'composer-web-search-action'],
      uiStateRefs: targetStateRefs('composer-plus-button', 'composer-web-search-action'),
      activationProbe: directMenuTargetProbe('composer-web-search-action', {
        setup: 'composer-plus-menu',
        uiStateRefs: ['composer-add-files-and-more-menu'],
        notes: 'No-token direct menu target click used when no shortcut key is assigned.',
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyPreviousThread',
      targetRefs: ['previous-response-button'],
      uiStateRefs: targetStateRefs('previous-response-button'),
      activationProbe: clickTargetProbe('previous-response-button', {
        setup: 'response-navigation-before-previous-thread',
        uiStateRefs: ['assistant-turn-non-web-buttons-exposed'],
        notes: 'Primes by trying Next Thread twice, then validates Previous Thread twice.',
      }),
      notes: 'Response-navigation heuristic using prior thread buttons.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyNextThread',
      targetRefs: ['next-response-button'],
      uiStateRefs: targetStateRefs('next-response-button'),
      activationProbe: clickTargetProbe('next-response-button', {
        setup: 'response-navigation-before-next-thread',
        uiStateRefs: ['assistant-turn-non-web-buttons-exposed'],
        notes: 'Primes by trying Previous Thread twice, then validates Next Thread twice.',
      }),
      notes: 'Response-navigation heuristic using next thread buttons.',
    }),
    defineShortcutAction({
      actionId: 'selectThenCopy',
      targetRefs: ['copy-turn-action-button'],
      uiStateRefs: targetStateRefs('copy-turn-action-button'),
      activationProbe: clipboardTextProbe({
        expectedTargetRef: 'copy-turn-action-button',
        setup: 'clipboard-single-message',
        uiStateRefs: ['assistant-turn-non-web-buttons-exposed'],
        notes: 'Validates that the shortcut writes non-empty message text to the clipboard.',
      }),
      notes: 'Clipboard selection helper verified by clipboard contents.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyClickSendButton',
      targetRefs: ['send-button'],
      uiStateRefs: targetStateRefs('send-button'),
      activationProbe: clickTargetProbe('send-button', {
        setup: 'composer-draft-message',
        uiStateRefs: [],
        notes: 'Side-effectful probe creates a disposable draft and dispatches Ctrl+Enter.',
      }),
      requiresHandler: false,
      handlerRef: 'keyFunctionMappingCtrl.Enter',
      notes:
        'Handled in the shared keydown path and only meaningful when the composer already has draft content.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyClickStopButton',
      targetRefs: ['stop-button'],
      uiStateRefs: targetStateRefs('stop-button'),
      activationProbe: clickTargetProbe('stop-button', {
        setup: 'in-flight-message',
        uiStateRefs: [],
        notes:
          'Side-effectful probe selects Extended thinking, sends a disposable message, waits 500ms, then dispatches Ctrl+Backspace.',
      }),
      requiresHandler: false,
      handlerRef: 'keyFunctionMappingCtrl.Backspace',
      notes: 'Handled in the shared keydown path and only available during an in-flight response.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyToggleModelSelector',
      targetRefs: ['model-switcher-button', 'model-switcher-menu'],
      uiStateRefs: targetStateRefs('model-switcher-button', 'model-switcher-menu'),
      activationProbe: opensTargetProbe('model-switcher-menu', {
        notes: 'No-token live probe dispatches the shortcut and asserts that the model menu opens.',
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyShowOverlay',
      targetRefs: ['shortcut-overlay'],
      uiStateRefs: [],
      activationProbe: opensTargetProbe('shortcut-overlay', {
        setup: 'shortcut-overlay-ready',
        uiStateRefs: [],
        notes:
          'Opens the internal extension shortcut overlay and asserts its fixed overlay id exists.',
      }),
      requiresHandler: false,
      handlerRef: 'standalone shortcut overlay listener',
      notes: 'Internal extension overlay verified by DOM presence.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyRegenerateTryAgain',
      targetRefs: ['assistant-web-regenerate-trigger', 'assistant-web-regenerate-item-try-again'],
      uiStateRefs: targetStateRefs(
        'assistant-web-regenerate-trigger',
        'assistant-web-regenerate-item-try-again',
      ),
      activationProbe: clickTargetProbe('assistant-web-regenerate-item-try-again', {
        uiStateRefs: ['assistant-web-regenerate-menu'],
        notes: 'Capture-phase observer prevents the native regenerate action after target click.',
      }),
    }),
    notApplicable('shortcutKeyRegenerateMoreConcise', {
      requiresHandler: false,
      notes: 'Deprecated/inert legacy default with no active handler.',
    }),
    notApplicable('shortcutKeyRegenerateAddDetails', {
      requiresHandler: false,
      notes: 'Deprecated/inert legacy default with no active handler.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyRegenerateWithDifferentModel',
      targetRefs: [
        'assistant-web-regenerate-trigger',
        'assistant-web-regenerate-item-different-model',
      ],
      uiStateRefs: targetStateRefs(
        'assistant-web-regenerate-trigger',
        'assistant-web-regenerate-item-different-model',
      ),
      activationProbe: clickTargetProbe('assistant-web-regenerate-item-different-model', {
        uiStateRefs: ['assistant-web-regenerate-menu'],
        notes: 'Capture-phase observer prevents the native regenerate action after target click.',
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyRegenerateAskToChangeResponse',
      targetRefs: ['assistant-web-regenerate-trigger', 'assistant-web-regenerate-input'],
      uiStateRefs: targetStateRefs(
        'assistant-web-regenerate-trigger',
        'assistant-web-regenerate-input',
      ),
      activationProbe: focusTargetProbe('assistant-web-regenerate-input', {
        uiStateRefs: ['assistant-web-regenerate-menu'],
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyMoreDotsReadAloud',
      targetRefs: ['assistant-more-actions-trigger', 'assistant-more-actions-read-aloud'],
      uiStateRefs: targetStateRefs(
        'assistant-more-actions-trigger',
        'assistant-more-actions-read-aloud',
      ),
      activationProbe: clickTargetProbe('assistant-more-actions-read-aloud', {
        uiStateRefs: ['assistant-menu-read-aloud-branch'],
        notes: 'Capture-phase observer prevents the native read-aloud action after target click.',
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyMoreDotsBranchInNewChat',
      targetRefs: ['assistant-more-actions-trigger', 'assistant-more-actions-branch'],
      uiStateRefs: targetStateRefs(
        'assistant-more-actions-trigger',
        'assistant-more-actions-branch',
      ),
      activationProbe: clickTargetProbe('assistant-more-actions-branch', {
        uiStateRefs: ['assistant-menu-read-aloud-branch'],
        notes: 'Capture-phase observer prevents branch navigation after target click.',
      }),
    }),
    notApplicable('altPageUp', {
      requiresHandler: false,
      notes: 'Legacy default with no active handler mapping in the current runtime.',
    }),
    notApplicable('altPageDown', {
      requiresHandler: false,
      notes: 'Legacy default with no active handler mapping in the current runtime.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyTemporaryChat',
      targetRefs: ['temporary-chat-button'],
      uiStateRefs: targetStateRefs('temporary-chat-button'),
      activationProbe: clickTargetProbe('temporary-chat-button', {
        setup: 'new-conversation',
        uiStateRefs: [],
        notes: 'Temporary Chat is only exposed on a blank new conversation.',
      }),
    }),
    notApplicable('shortcutKeyStudy', {
      notes: 'Removed from ChatGPT; runtime handler is intentionally inert.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyCreateImage',
      targetRefs: ['composer-plus-button', 'composer-create-image-action'],
      uiStateRefs: targetStateRefs('composer-plus-button', 'composer-create-image-action'),
      activationProbe: directMenuTargetProbe('composer-create-image-action', {
        setup: 'composer-plus-menu',
        uiStateRefs: ['composer-add-files-and-more-menu'],
        notes: 'No-token direct menu target click used when no shortcut key is assigned.',
      }),
    }),
    notApplicable('shortcutKeyToggleCanvas', {
      notes: 'Removed from ChatGPT; runtime handler is intentionally inert.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyDeepResearch',
      targetRefs: ['composer-plus-button', 'composer-deep-research-action'],
      uiStateRefs: targetStateRefs('composer-plus-button', 'composer-deep-research-action'),
      activationProbe: directMenuTargetProbe('composer-deep-research-action', {
        setup: 'composer-plus-menu',
        uiStateRefs: ['composer-add-files-and-more-menu'],
        notes: 'No-token direct menu target click used when no shortcut key is assigned.',
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyToggleDictate',
      targetRefs: ['dictate-start-button', 'dictate-submit-button'],
      uiStateRefs: targetStateRefs('dictate-start-button'),
      activationProbe: clickTargetProbe('dictate-start-button', {
        setup: 'new-conversation',
        uiStateRefs: [],
        notes: 'Disposable blank conversation exposes the dictate start control.',
      }),
      notes: 'Dual-state behavior that changes targets when dictation is active.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyCancelDictation',
      targetRefs: ['cancel-dictation-button'],
      uiStateRefs: targetStateRefs('cancel-dictation-button'),
      activationProbe: clickTargetProbe('cancel-dictation-button', {
        setup: 'dictation-active',
        uiStateRefs: [],
        notes:
          'Side-effectful probe starts dictation in a disposable blank conversation, then dispatches the cancel shortcut.',
      }),
      notes: 'Only available while dictation is active.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyShare',
      targetRefs: ['share-chat-button'],
      uiStateRefs: targetStateRefs('share-chat-button'),
      activationProbe: clickTargetProbe('share-chat-button', {
        uiStateRefs: ['topbar-bottom-disabled-header-area'],
        notes: 'Uses a temporary validation-only key when no user/default key is assigned.',
      }),
    }),
    notApplicable('shortcutKeyThinkLonger', {
      notes: 'Removed from ChatGPT; runtime handler is intentionally inert.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyAddPhotosFiles',
      targetRefs: ['composer-plus-button', 'composer-add-photos-files-action'],
      uiStateRefs: targetStateRefs('composer-plus-button', 'composer-add-photos-files-action'),
      activationProbe: directMenuTargetProbe('composer-add-photos-files-action', {
        setup: 'composer-plus-menu',
        uiStateRefs: ['composer-add-files-and-more-menu'],
        notes:
          'No-token direct menu target click; capture-phase observer prevents native file picker default behavior.',
      }),
    }),
    defineShortcutAction({
      actionId: 'selectThenCopyAllMessages',
      targetRefs: ['thread-bottom'],
      uiStateRefs: targetStateRefs('thread-bottom'),
      activationProbe: clipboardTextProbe({
        expectedTargetRef: 'thread-bottom',
        setup: 'clipboard-entire-conversation',
        uiStateRefs: ['topbar-bottom-disabled-thread-bottom'],
        notes: 'Validates that the shortcut writes conversation text to the clipboard.',
      }),
      notes: 'Clipboard selection helper verified by clipboard contents.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyThinkingExtended',
      targetRefs: [
        'model-switcher-button',
        'model-switcher-menu',
        'model-switcher-thinking-effort-action',
        'model-switcher-thinking-effort-menu',
        'model-switcher-thinking-effort-extended',
      ],
      uiStateRefs: targetStateRefs(
        'model-switcher-button',
        'model-switcher-menu',
        'model-switcher-thinking-effort-action',
        'model-switcher-thinking-effort-menu',
        'model-switcher-thinking-effort-extended',
      ),
      activationProbe: clickTargetProbe('model-switcher-thinking-effort-extended', {
        setup: 'model-effort-shortcut',
        uiStateRefs: [],
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyThinkingStandard',
      targetRefs: [
        'model-switcher-button',
        'model-switcher-menu',
        'model-switcher-thinking-effort-action',
        'model-switcher-thinking-effort-menu',
        'model-switcher-thinking-effort-standard',
      ],
      uiStateRefs: targetStateRefs(
        'model-switcher-button',
        'model-switcher-menu',
        'model-switcher-thinking-effort-action',
        'model-switcher-thinking-effort-menu',
        'model-switcher-thinking-effort-standard',
      ),
      activationProbe: clickTargetProbe('model-switcher-thinking-effort-standard', {
        setup: 'model-effort-shortcut',
        uiStateRefs: [],
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyProStandard',
      targetRefs: [
        'model-switcher-button',
        'model-switcher-menu',
        'model-switcher-pro-thinking-effort-action',
        'model-switcher-pro-thinking-effort-menu',
        'model-switcher-pro-thinking-effort-standard',
      ],
      uiStateRefs: targetStateRefs(
        'model-switcher-button',
        'model-switcher-menu',
        'model-switcher-pro-thinking-effort-action',
        'model-switcher-pro-thinking-effort-menu',
        'model-switcher-pro-thinking-effort-standard',
      ),
      activationProbe: clickTargetProbe('model-switcher-pro-thinking-effort-standard', {
        setup: 'model-effort-shortcut',
        uiStateRefs: [],
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyProExtended',
      targetRefs: [
        'model-switcher-button',
        'model-switcher-menu',
        'model-switcher-pro-thinking-effort-action',
        'model-switcher-pro-thinking-effort-menu',
        'model-switcher-pro-thinking-effort-extended',
      ],
      uiStateRefs: targetStateRefs(
        'model-switcher-button',
        'model-switcher-menu',
        'model-switcher-pro-thinking-effort-action',
        'model-switcher-pro-thinking-effort-menu',
        'model-switcher-pro-thinking-effort-extended',
      ),
      activationProbe: clickTargetProbe('model-switcher-pro-thinking-effort-extended', {
        setup: 'model-effort-shortcut',
        uiStateRefs: [],
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyThinkingLight',
      targetRefs: [
        'model-switcher-button',
        'model-switcher-menu',
        'model-switcher-thinking-effort-action',
        'model-switcher-thinking-effort-menu',
        'model-switcher-thinking-effort-light',
      ],
      uiStateRefs: targetStateRefs(
        'model-switcher-button',
        'model-switcher-menu',
        'model-switcher-thinking-effort-action',
        'model-switcher-thinking-effort-menu',
        'model-switcher-thinking-effort-light',
      ),
      activationProbe: clickTargetProbe('model-switcher-thinking-effort-light', {
        setup: 'model-effort-shortcut',
        uiStateRefs: [],
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyThinkingHeavy',
      targetRefs: [
        'model-switcher-button',
        'model-switcher-menu',
        'model-switcher-thinking-effort-action',
        'model-switcher-thinking-effort-menu',
        'model-switcher-thinking-effort-heavy',
      ],
      uiStateRefs: targetStateRefs(
        'model-switcher-button',
        'model-switcher-menu',
        'model-switcher-thinking-effort-action',
        'model-switcher-thinking-effort-menu',
        'model-switcher-thinking-effort-heavy',
      ),
      activationProbe: clickTargetProbe('model-switcher-thinking-effort-heavy', {
        setup: 'model-effort-shortcut',
        uiStateRefs: [],
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyNewGptConversation',
      targetRefs: ['new-gpt-conversation-item'],
      uiStateRefs: [],
      activationProbe: clickTargetProbe('new-gpt-conversation-item', {
        setup: 'gpt-conversation',
        uiStateRefs: [],
        url: 'https://chatgpt.com/g/g-vU0PtzgAJ-step-1-2-nbme-medical-school-question-analysis-v2/c/69eba3bf-6f18-83ea-aa31-9a995aca7bc0',
        notes: 'Only valid from the GPT conversation fixture.',
      }),
      notes: 'Only valid from the GPT conversation fixture.',
    }),
  ]);

  return Object.freeze({
    VALIDATION_MODES,
    ACTIVATION_PROBE_MODES,
    TARGET_DESCRIPTORS,
    SHORTCUT_ACTIONS,
    defineShortcutAction,
    clickTargetProbe,
    focusTargetProbe,
    viewportTargetProbe,
    clipboardTextProbe,
    domStateProbe,
    notLiveProbed,
    byTestId,
    byId,
    byAriaControls,
    byInputName,
    byIconToken,
    byMenuChain,
    manualOnly,
    notApplicable,
  });
});
