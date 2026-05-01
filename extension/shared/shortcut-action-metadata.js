(function initShortcutActionMetadata(root, factory) {
  const metadata = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = metadata;
  }
  root.CSPShortcutActionMetadata = metadata;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const VALIDATION_MODES = Object.freeze(['scrape-targets', 'manual-only', 'not-applicable']);
  const ACTIVATION_PROBE_MODES = Object.freeze([
    'click-target',
    'focus-target',
    'opens-target',
    'direct-menu-target',
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

  const TARGET_DESCRIPTORS = Object.freeze([
    byTestId('close-sidebar-button', 'close-sidebar-button', {
      uiStateRefs: ['sidebar-collapsed-body', 'sidebar-expanded-body'],
    }),
    byAriaControls('stage-slideover-sidebar-control', 'stage-slideover-sidebar', {
      uiStateRefs: ['sidebar-collapsed-body', 'sidebar-expanded-body'],
    }),
    byAriaControls('stage-popover-sidebar-control', 'stage-popover-sidebar', {
      uiStateRefs: ['topbar-bottom-disabled-header-area'],
    }),
    byId('page-header', 'page-header', {
      uiStateRefs: ['topbar-bottom-disabled-header-area'],
    }),
    byId('thread-bottom', 'thread-bottom', {
      uiStateRefs: ['topbar-bottom-disabled-thread-bottom'],
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
      notes: 'Requires an active edit state that is not yet part of the scrape dump family.',
    }),
    manualTarget('send-button', 'data-testid=send-button|id=composer-submit-button', {
      searchNeedles: ['data-testid="send-button"', 'id="composer-submit-button"'],
      notes:
        'Only available when the composer already has draft content, so the no-token baseline scrape does not expose it.',
    }),
    manualTarget('stop-button', 'visible-stop-button-during-generation', {
      notes:
        'Only rendered while ChatGPT is actively generating, so it is intentionally outside the no-token scrape path.',
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
    byTestId('model-switcher-button', 'model-switcher-dropdown-button', {
      uiStateRefs: [
        'sidebar-collapsed-body',
        'sidebar-expanded-body',
        'topbar-bottom-disabled-header-area',
        'model-switcher-menu',
      ],
    }),
    byMenuChain('model-switcher-menu', 'data-radix-menu-content', {
      uiStateRefs: ['model-switcher-menu'],
    }),
    byTestId('model-switcher-latest-option', 'model-switcher-gpt-5-3', {
      matchGroups: [['data-testid="model-switcher-gpt-5-3"']],
      uiStateRefs: ['model-switcher-menu'],
      notes: 'Current account Latest model entry used before testing Thinking options.',
    }),
    byTestId('model-switcher-thinking-option', 'model-switcher-gpt-5-5-thinking', {
      matchGroups: [['data-testid="model-switcher-gpt-5-5-thinking"']],
      uiStateRefs: ['model-switcher-menu'],
      notes: 'Current account Thinking model entry used before testing Thinking shortcuts.',
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
    byIconToken('composer-web-search-action', '#6b0d8c', {
      uiStateRefs: ['composer-add-files-and-more-menu'],
    }),
    byIconToken('composer-study-action', '#1fa93b', {
      uiStateRefs: ['composer-add-files-and-more-menu', 'composer-add-files-and-more-more-submenu'],
    }),
    byIconToken('composer-create-image-action', '#266724', {
      uiStateRefs: ['composer-add-files-and-more-menu'],
    }),
    byIconToken('composer-canvas-action', '#cf3864', {
      uiStateRefs: ['composer-add-files-and-more-more-submenu'],
    }),
    byIconToken('dictate-start-button', ['#29f921', 'aria-label="Dictate button"'], {
      identifier: 'svg-token=#29f921|aria-label=Dictate button',
      matchGroups: [['#29f921'], ['aria-label="Dictate button"']],
      uiStateRefs: ['topbar-bottom-disabled-thread-bottom'],
    }),
    manualTarget('dictate-submit-button', 'svg-token=#fa1dbd|aria-label=Submit dictation', {
      searchNeedles: ['#fa1dbd', 'aria-label="Submit dictation"'],
      notes: 'Only available after dictation has already started.',
    }),
    manualTarget('cancel-dictation-button', 'svg-token=#85f94b|aria-label=Stop dictation', {
      searchNeedles: ['#85f94b', 'aria-label="Stop dictation"'],
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
    notApplicable('shortcutKeyScrollUpOneMessage', {
      notes: 'Internal extension scroll helper.',
    }),
    notApplicable('shortcutKeyScrollDownOneMessage', {
      notes: 'Internal extension scroll helper.',
    }),
    notApplicable('shortcutKeyScrollUpTwoMessages', {
      notes: 'Internal extension scroll helper.',
    }),
    notApplicable('shortcutKeyScrollDownTwoMessages', {
      notes: 'Internal extension scroll helper.',
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
      activationProbe: notLiveProbed(
        'Editing opens a stateful draft card and needs a dedicated cleanup path.',
      ),
    }),
    manualOnly('shortcutKeySendEdit', {
      targetRefs: ['edit-send-button'],
      uiStateRefs: [],
      notes: 'Needs an active edit card state.',
    }),
    notApplicable('shortcutKeyCopyAllCodeBlocks', {
      notes: 'Clipboard transformation helper with no ChatGPT click target.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyClickNativeScrollToBottom',
      targetRefs: ['thread-bottom', 'composer-plus-button'],
      uiStateRefs: targetStateRefs('thread-bottom', 'composer-plus-button'),
      activationProbe: notLiveProbed(
        'Scroll position behavior needs a viewport assertion, not a click/focus target probe.',
      ),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyScrollToTop',
      targetRefs: ['page-header'],
      uiStateRefs: targetStateRefs('page-header'),
      activationProbe: notLiveProbed(
        'Scroll position behavior needs a viewport assertion, not a click/focus target probe.',
      ),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyNewConversation',
      targetRefs: ['create-new-chat-button'],
      uiStateRefs: targetStateRefs('create-new-chat-button'),
      activationProbe: notLiveProbed(
        'Navigates away from the fixture and needs an explicit restore contract.',
      ),
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
      activationProbe: clickTargetProbe('close-sidebar-button', {
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
        setup: 'previous-thread-after-next-thread',
        uiStateRefs: ['assistant-turn-non-web-buttons-exposed'],
        notes: 'Requires a prior Next Thread activation, then a 1500ms settle delay.',
      }),
      notes: 'Response-navigation heuristic using prior thread buttons.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyNextThread',
      targetRefs: ['next-response-button'],
      uiStateRefs: targetStateRefs('next-response-button'),
      activationProbe: clickTargetProbe('next-response-button', {
        uiStateRefs: ['assistant-turn-non-web-buttons-exposed'],
      }),
      notes: 'Response-navigation heuristic using next thread buttons.',
    }),
    notApplicable('selectThenCopy', {
      notes: 'Clipboard selection helper with no stable ChatGPT click target.',
    }),
    manualOnly('shortcutKeyClickSendButton', {
      targetRefs: ['send-button'],
      uiStateRefs: [],
      requiresHandler: false,
      handlerRef: 'keyFunctionMappingCtrl.Enter',
      notes:
        'Handled in the shared keydown path and only meaningful when the composer already has draft content.',
    }),
    manualOnly('shortcutKeyClickStopButton', {
      targetRefs: ['stop-button'],
      uiStateRefs: [],
      requiresHandler: false,
      handlerRef: 'keyFunctionMappingCtrl.Backspace',
      notes: 'Handled in the shared keydown path and only available during an in-flight response.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyToggleModelSelector',
      targetRefs: ['model-switcher-button', 'model-switcher-menu'],
      uiStateRefs: targetStateRefs('model-switcher-button', 'model-switcher-menu'),
      activationProbe: notLiveProbed(
        'Opens the model menu and needs an open-menu assertion probe.',
      ),
    }),
    notApplicable('shortcutKeyShowOverlay', {
      requiresHandler: false,
      handlerRef: 'standalone shortcut overlay listener',
      notes: 'Internal extension overlay, not a ChatGPT target.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyRegenerateTryAgain',
      targetRefs: ['assistant-web-regenerate-trigger', 'assistant-web-regenerate-item-try-again'],
      uiStateRefs: targetStateRefs(
        'assistant-web-regenerate-trigger',
        'assistant-web-regenerate-item-try-again',
      ),
      activationProbe: notLiveProbed(
        'Regenerate actions can spend tokens and must not run in routine live probes.',
      ),
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
      activationProbe: notLiveProbed(
        'Regenerate actions can spend tokens and must not run in routine live probes.',
      ),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyRegenerateAskToChangeResponse',
      targetRefs: ['assistant-web-regenerate-trigger', 'assistant-web-regenerate-input'],
      uiStateRefs: targetStateRefs(
        'assistant-web-regenerate-trigger',
        'assistant-web-regenerate-input',
      ),
      activationProbe: notLiveProbed(
        'Regenerate menu entry needs a text-input probe that does not submit.',
      ),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyMoreDotsReadAloud',
      targetRefs: ['assistant-more-actions-trigger', 'assistant-more-actions-read-aloud'],
      uiStateRefs: targetStateRefs(
        'assistant-more-actions-trigger',
        'assistant-more-actions-read-aloud',
      ),
      activationProbe: notLiveProbed(
        'Read-aloud can trigger audio side effects and needs a muted/manual-safe probe.',
      ),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyMoreDotsBranchInNewChat',
      targetRefs: ['assistant-more-actions-trigger', 'assistant-more-actions-branch'],
      uiStateRefs: targetStateRefs(
        'assistant-more-actions-trigger',
        'assistant-more-actions-branch',
      ),
      activationProbe: notLiveProbed(
        'Branch-in-new-chat can navigate/create state and needs an explicit restore contract.',
      ),
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
    defineShortcutAction({
      actionId: 'shortcutKeyToggleCanvas',
      targetRefs: [
        'composer-plus-button',
        'composer-more-submenu-trigger',
        'composer-canvas-action',
      ],
      uiStateRefs: targetStateRefs(
        'composer-plus-button',
        'composer-more-submenu-trigger',
        'composer-canvas-action',
      ),
      activationProbe: directMenuTargetProbe('composer-canvas-action', {
        setup: 'composer-more-submenu',
        uiStateRefs: ['composer-add-files-and-more-more-submenu'],
        notes: 'No-token direct submenu target click used when no shortcut key is assigned.',
      }),
    }),
    manualOnly('shortcutKeyToggleDictate', {
      targetRefs: ['dictate-start-button', 'dictate-submit-button'],
      uiStateRefs: targetStateRefs('dictate-start-button'),
      notes: 'Dual-state behavior that changes targets when dictation is active.',
    }),
    manualOnly('shortcutKeyCancelDictation', {
      targetRefs: ['cancel-dictation-button'],
      uiStateRefs: [],
      notes: 'Only available while dictation is active.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyShare',
      targetRefs: ['share-chat-button'],
      uiStateRefs: targetStateRefs('share-chat-button'),
      activationProbe: notLiveProbed(
        'No default key is currently assigned, so there is no runtime shortcut to dispatch.',
      ),
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
    notApplicable('selectThenCopyAllMessages', {
      notes: 'Clipboard selection helper with no stable ChatGPT click target.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyThinkingExtended',
      targetRefs: [
        'model-switcher-button',
        'model-switcher-latest-option',
        'model-switcher-thinking-option',
      ],
      uiStateRefs: targetStateRefs(
        'model-switcher-button',
        'model-switcher-latest-option',
        'model-switcher-thinking-option',
      ),
      activationProbe: notLiveProbed(
        'Requires selecting Latest, then Thinking, then the Extended thinking option.',
      ),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyThinkingStandard',
      targetRefs: [
        'model-switcher-button',
        'model-switcher-latest-option',
        'model-switcher-thinking-option',
      ],
      uiStateRefs: targetStateRefs(
        'model-switcher-button',
        'model-switcher-latest-option',
        'model-switcher-thinking-option',
      ),
      activationProbe: notLiveProbed(
        'Requires selecting Latest, then Thinking, then the Standard thinking option.',
      ),
    }),
    notApplicable('shortcutKeyThinkingLight', {
      notes: 'Pro-tier thinking effort option is unavailable on this account.',
    }),
    notApplicable('shortcutKeyThinkingHeavy', {
      notes: 'Pro-tier thinking effort option is unavailable on this account.',
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
