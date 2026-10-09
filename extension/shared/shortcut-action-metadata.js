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
      ...(definition.requiredCapabilities
        ? { requiredCapabilities: Object.freeze(unique(definition.requiredCapabilities)) }
        : {}),
      ...(definition.probeOnly === true ? { probeOnly: true } : {}),
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
      probeOnly: options.probeOnly,
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
      requiredCapabilities: options.requiredCapabilities,
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
      probeOnly: options.probeOnly,
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
          ['data-codex-intelligence-trigger="true"', 'aria-haspopup="menu"'],
          ['__composer-pill', 'aria-haspopup="menu"', 'id="radix-'],
        ];
  const chatWorkSurfaceToggleSelectors = Object.freeze(
    unique(
      typeof modelPickerSelectors.getChatWorkSurfaceToggleSelectors === 'function'
        ? modelPickerSelectors.getChatWorkSurfaceToggleSelectors()
        : [
            'header [role="radiogroup"] button[role="radio"][aria-checked]',
            'header [role="group"] button[role="radio"][aria-checked]',
          ],
    ),
  );
  const chatWorkSurfaceToggleMatchGroups =
    typeof modelPickerSelectors.getChatWorkSurfaceToggleMatchGroups === 'function'
      ? modelPickerSelectors.getChatWorkSurfaceToggleMatchGroups()
      : [
          ['role="radiogroup"', 'role="radio"', 'aria-checked='],
          ['role="group"', 'role="radio"', 'aria-checked='],
        ];
  const modelSwitcherMenuMatchGroups =
    typeof modelPickerSelectors.getModelSwitcherMenuMatchGroups === 'function'
      ? modelPickerSelectors.getModelSwitcherMenuMatchGroups()
      : [['data-radix-menu-content', 'role="menu"', 'data-state="open"']];
  const modelThinkingEffortActionMatchGroups =
    typeof modelPickerSelectors.getModelThinkingEffortActionMatchGroups === 'function'
      ? modelPickerSelectors.getModelThinkingEffortActionMatchGroups()
      : [['data-model-picker-thinking-effort-action="true"', 'aria-haspopup="menu"']];
  const modelThinkingEffortMenuMatchGroups =
    typeof modelPickerSelectors.getModelThinkingEffortMenuMatchGroups === 'function'
      ? modelPickerSelectors.getModelThinkingEffortMenuMatchGroups()
      : [['role="menu"', 'role="menuitemradio"', 'Standard', 'Extended']];
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
  const messageScrollAnchorSelectors = [
    '[data-chatgpt-search-unit-key]',
    '[data-message-author-role="assistant"]',
    '[data-message-author-role="user"]',
    '[data-turn-key]',
    'article[data-turn]',
    '[data-testid^="conversation-turn-"]',
  ];
  const messageScrollAnchorNeedles = [
    'data-chatgpt-search-unit-key',
    'data-message-author-role="assistant"',
    'data-message-author-role="user"',
    'data-turn-key',
    'data-turn',
    'conversation-turn-',
  ];
  const messageScrollAnchorStateRefs = [
    'user-turn-buttons-exposed',
    'assistant-turn-non-web-buttons-exposed',
    'assistant-turn-web-buttons-exposed',
  ];
  const messageScrollAnchorNotes =
    'Static message-node anchor presence only, using the runtime selector fallback alternatives in registered current-turn dumps. This does not prove scrolling or shortcut activation; the existing live domStateProbe measures the scroll-position delta.';
  function messageScrollAnchorTarget(targetId) {
    return bySelectorList(targetId, messageScrollAnchorSelectors, {
      identifier: 'static message-scroll anchor presence only; no scroll-delta claim',
      searchNeedles: messageScrollAnchorNeedles,
      matchGroups: messageScrollAnchorNeedles.map((needle) => [needle]),
      uiStateRefs: messageScrollAnchorStateRefs,
      notes: messageScrollAnchorNotes,
    });
  }

  const TARGET_DESCRIPTORS = Object.freeze([
    byMenuChain('native-sidebar-toggle-control', 'native-sidebar-toggle-control', {
      matchGroups: [
        ['data-app-shell-sidebar-trigger="true"'],
        ['aria-controls="app-shell-sidebar"'],
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
        'Responsive native sidebar toggle may use the current app-shell aria-controls marker, legacy close, desktop open, or narrow popover open control.',
    }),
    byId('page-header', 'page-header', {
      matchGroups: [['id="page-header"'], ['<header']],
      uiStateRefs: ['topbar-bottom-disabled-header-area'],
    }),
    bySelectorList(
      'thread-bottom',
      ['.thread-scroll-container', '#thread-bottom', '#thread-bottom-container'],
      {
        matchGroups: [
          ['thread-scroll-container'],
          ['id="thread-bottom"'],
          ['id="thread-bottom-container"'],
        ],
        uiStateRefs: ['topbar-bottom-disabled-thread-bottom'],
      },
    ),
    messageScrollAnchorTarget('message-scroll-up-delta'),
    messageScrollAnchorTarget('message-scroll-down-delta'),
    manualTarget('code-block-content', 'pre code', {
      searchNeedles: ['<pre', '<code'],
      matchGroups: [['<pre'], ['<code']],
      uiStateRefs: ['probe-code-block-content'],
      probeOnly: true,
      notes:
        'Validated from a disposable live-probe codebox conversation rather than the fixed no-token scrape fixture.',
    }),
    manualTarget('codebox-wrap-enabled', 'html.csp-codebox-wrap-enabled', {
      searchNeedles: ['csp-codebox-wrap-enabled', '<pre', '<code'],
      matchGroups: [
        ['csp-codebox-wrap-enabled', '<pre'],
        ['csp-codebox-wrap-enabled', '<code'],
      ],
      uiStateRefs: ['probe-codebox-wrap-enabled'],
      probeOnly: true,
      notes:
        'Validated by asserting the actual extension root class and assistant codebox content after toggling wrapping.',
    }),
    manualTarget('shortcut-overlay', 'id=csp-shortcut-overlay', {
      searchNeedles: ['id="csp-shortcut-overlay"'],
      matchGroups: [['id="csp-shortcut-overlay"']],
      uiStateRefs: ['shortcut-overlay'],
      notes: 'Internal extension shortcut overlay, opened by the standalone overlay listener.',
    }),
    bySelectorList(
      'composer-plus-button',
      [
        'form[data-thread-find-composer="true"] button[data-composer-navigation-target="add-context"]',
        'form[data-chatgpt-composer] button[data-composer-navigation-target="add-context"]',
      ],
      {
        matchGroups: [
          ['data-thread-find-composer="true"', 'data-composer-navigation-target="add-context"'],
          ['data-chatgpt-composer', 'data-composer-navigation-target="add-context"'],
        ],
        notes:
          'Current Add context menu opener, scoped to the observed ChatGPT composer forms and identified by structural attributes instead of a stale test id or localized label.',
        uiStateRefs: [
          'topbar-bottom-disabled-thread-bottom',
          'topbar-bottom-disabled-header-area',
          'sidebar-collapsed-body',
          'sidebar-expanded-body',
          'composer-add-files-and-more-menu',
        ],
      },
    ),
    byIconToken('copy-turn-action-button', 'M13.468 11.1216', {
      notes:
        'Native message Copy action inside .turn-action-controls; identified by its SVG path, independent of theme color.',
      uiStateRefs: [
        'user-turn-buttons-exposed',
        'assistant-turn-non-web-buttons-exposed',
        'assistant-turn-web-buttons-exposed',
      ],
    }),
    bySelectorList(
      'edit-message-button',
      ['button[aria-label="Edit message"]', 'button:has(svg path[d^="M11.7313"])'],
      {
        identifier: 'button:has(svg path[d^="M11.7313"])',
        searchNeedles: ['M11.7313'],
        matchGroups: [['M11.7313']],
        uiStateRefs: ['probe-edit-message-button'],
        notes:
          'Native Edit button on user-message turns, identified by its language-independent SVG path prefix; the localized aria-label is a fallback.',
      },
    ),
    manualTarget('edit-send-button', 'active-edit-send-button', {
      searchNeedles: ['textarea', 'Cancel', 'Send'],
      matchGroups: [
        ['textarea', 'Cancel', 'Send'],
        ['contenteditable="true"', 'Cancel', 'Send'],
      ],
      uiStateRefs: ['probe-edit-send-button'],
      probeOnly: true,
      notes: 'Requires an active edit state created by the side-effectful live probe setup.',
    }),
    manualTarget(
      'send-button',
      'visible-composer-submit-send-glyph|data-testid=send-button|id=composer-submit-button',
      {
        searchNeedles: [
          'data-testid="send-button"',
          'id="composer-submit-button"',
          'aria-label="Send prompt"',
          'M9.33467 16.6663',
        ],
        matchGroups: [
          [
            '<form',
            'contenteditable="true"',
            'role="textbox"',
            'type="submit"',
            'M9.33467 16.6663',
          ],
          ['data-testid="send-button"'],
          ['id="composer-submit-button"'],
          ['aria-label="Send prompt"'],
        ],
        uiStateRefs: ['probe-send-button'],
        probeOnly: true,
        notes:
          'The current native Send control is a visible submit button with the captured send glyph inside the composer form; legacy test-id and id selectors remain supported.',
      },
    ),
    manualTarget(
      'stop-button',
      'visible-composer-stop-glyph|visible-stop-button-during-generation',
      {
        searchNeedles: [
          'M4.5 5.75C4.5 5.05964',
          'data-testid="stop-button"',
          'data-test-id="stop-button"',
          'aria-label="Stop"',
        ],
        matchGroups: [
          [
            '<form',
            'contenteditable="true"',
            'role="textbox"',
            'type="button"',
            'M4.5 5.75C4.5 5.05964',
          ],
          ['data-testid="stop-button"'],
          ['data-test-id="stop-button"'],
          ['aria-label="Stop"'],
        ],
        uiStateRefs: ['probe-stop-button'],
        probeOnly: true,
        notes:
          'The current native Stop control is a visible type=button with the captured Stop glyph inside the composer form; legacy stop test ids and label remain supported.',
      },
    ),
    bySelectorList(
      'create-new-chat-button',
      [
        'button:has(svg path[d^="M8.16675 2.50127"])',
        '[data-app-shell-titlebar] button:has(svg path[d^="M6.33325 1.80763"])',
        'a[data-testid="create-new-chat-button"]',
        'button[data-testid="create-new-chat-button"]',
        'button[data-testid="new-chat-button"]',
      ],
      {
        matchGroups: [
          ['<button', 'M8.16675 2.50127'],
          ['data-app-shell-titlebar', '<button', 'M6.33325 1.80763'],
          ['<a', 'data-testid="create-new-chat-button"'],
          ['<button', 'data-testid="create-new-chat-button"'],
          ['<button', 'data-testid="new-chat-button"'],
        ],
        uiStateRefs: ['sidebar-collapsed-body', 'sidebar-expanded-body'],
        notes:
          'Generic new-chat action: prefer the current SVG path, then scoped titlebar and data-testid fallbacks; excludes project-row action buttons.',
      },
    ),
    bySelectorList('chat-work-surface-toggle', chatWorkSurfaceToggleSelectors, {
      identifier: 'header-two-radio-chat-surface-toggle',
      matchGroups: chatWorkSurfaceToggleMatchGroups,
      uiStateRefs: ['topbar-bottom-disabled-header-area', 'probe-blank-chat-work-surface-toggle'],
      notes:
        'Blank-chat surface selector: one visible header group or radiogroup with exactly two button radios and reciprocal checked state; runtime matching does not depend on localized Chat/Work labels.',
    }),
    byMenuChain('search-conversation-button', 'native-search-conversation-control', {
      matchGroups: [
        ['<button', 'M9.16211 2.37976'],
        ['<button', 'M7.32849 1.91016'],
        ['data-testid="search-conversation-button"'],
        ['id="sidebar-header"', 'aria-label="Search"'],
        ['id="sidebar-header"', '#sidebar-search'],
        ['id="sidebar-header"', 'data-testid="close-sidebar-button"'],
        [
          'id="stage-sidebar-tiny-bar"',
          'data-testid="create-new-chat-button"',
          'data-sidebar-item="true"',
        ],
        [
          'id="stage-popover-sidebar"',
          'data-testid="create-new-chat-button"',
          'data-sidebar-item="true"',
        ],
        ['#ac6d36'],
      ],
      uiStateRefs: [
        'sidebar-collapsed-body',
        'sidebar-expanded-body',
        'narrow-header-sidebar-popover-control',
      ],
      notes:
        'Prefer the current language-independent titlebar Search button SVG path; otherwise use sidebar adjacency, with the old test id and sprite retained as compatibility fallbacks.',
    }),
    byMenuChain('search-chats-dialog', 'role=dialog|role=combobox|placeholder=Search…', {
      matchGroups: [
        ['role="dialog"', '<input', 'role="combobox"', 'placeholder="Search…"'],
        ['role="dialog"', 'placeholder="Search chats..."'],
      ],
      uiStateRefs: ['search-chats-dialog'],
      notes: 'Resulting dialog opened by Search Chats.',
    }),
    bySelectorList(
      'prompt-textarea',
      [
        'form[data-thread-find-composer="true"] div.ProseMirror[contenteditable="true"][role="textbox"]',
        'form[data-chatgpt-composer] [data-composer-markdown][contenteditable="true"][role="textbox"]',
      ],
      {
        identifier:
          'form[data-thread-find-composer="true"] div.ProseMirror[contenteditable=true][role=textbox] | form[data-chatgpt-composer] [data-composer-markdown][contenteditable=true][role=textbox]',
        searchNeedles: [
          'data-thread-find-composer="true"',
          'ProseMirror',
          'contenteditable="true"',
          'role="textbox"',
          'data-chatgpt-composer',
          'data-composer-markdown',
        ],
        matchGroups: [
          [
            'data-thread-find-composer="true"',
            'ProseMirror',
            'contenteditable="true"',
            'role="textbox"',
          ],
          [
            'data-chatgpt-composer',
            'data-composer-markdown',
            'contenteditable="true"',
            'role="textbox"',
          ],
        ],
        uiStateRefs: [
          'topbar-bottom-disabled-thread-bottom',
          'sidebar-collapsed-body',
          'sidebar-expanded-body',
        ],
        notes:
          'Observed composers are contenteditable textboxes scoped to form[data-thread-find-composer="true"] or form[data-chatgpt-composer]; legacy unified-composer and thread-bottom-container targets are excluded.',
      },
    ),
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
    byMenuChain(
      'model-switcher-thinking-effort-action',
      'data-model-picker-thinking-effort-action',
      {
        matchGroups: modelThinkingEffortActionMatchGroups,
        uiStateRefs: ['model-switcher-menu'],
        requiredCapabilities: ['dedicatedEffortControls'],
      },
    ),
    byMenuChain('model-switcher-thinking-effort-menu', 'role=menu|thinking-effort-options', {
      matchGroups: modelThinkingEffortMenuMatchGroups,
      uiStateRefs: ['model-switcher-thinking-effort-menu'],
      requiredCapabilities: ['dedicatedEffortControls'],
    }),
    byMenuChain('model-switcher-thinking-effort-light', 'thinking-effort-light', {
      matchGroups: modelThinkingEffortLightMatchGroups,
      uiStateRefs: ['model-switcher-thinking-effort-menu'],
      requiredCapabilities: ['dedicatedEffortControls'],
    }),
    byMenuChain('model-switcher-thinking-effort-heavy', 'thinking-effort-heavy', {
      matchGroups: modelThinkingEffortHeavyMatchGroups,
      uiStateRefs: ['model-switcher-thinking-effort-menu'],
      requiredCapabilities: ['dedicatedEffortControls'],
    }),
    byMenuChain(
      'model-switcher-pro-thinking-effort-action',
      'data-model-picker-thinking-effort-action|pro',
      {
        matchGroups: modelProThinkingEffortActionMatchGroups,
        uiStateRefs: ['model-switcher-menu'],
        requiredCapabilities: ['proEffort', 'dedicatedEffortControls'],
      },
    ),
    byMenuChain('model-switcher-pro-thinking-effort-menu', 'role=menu|pro-thinking-effort', {
      matchGroups: modelProThinkingEffortMenuMatchGroups,
      uiStateRefs: ['model-switcher-pro-thinking-effort-menu'],
      requiredCapabilities: ['proEffort', 'dedicatedEffortControls'],
    }),
    byMenuChain('model-switcher-pro-thinking-effort-standard', 'pro-thinking-effort-standard', {
      matchGroups: modelProThinkingEffortStandardMatchGroups,
      uiStateRefs: ['model-switcher-pro-thinking-effort-menu'],
      requiredCapabilities: ['proEffort', 'dedicatedEffortControls'],
    }),
    byMenuChain('model-switcher-pro-thinking-effort-extended', 'pro-thinking-effort-extended', {
      matchGroups: modelProThinkingEffortExtendedMatchGroups,
      uiStateRefs: ['model-switcher-pro-thinking-effort-menu'],
      requiredCapabilities: ['proEffort', 'dedicatedEffortControls'],
    }),
    bySelectorList(
      'assistant-web-regenerate-trigger',
      [
        '.turn-action-controls button[aria-haspopup="menu"]:has(svg use[href$="#arrows-clockwise-rotate-lg-light-16"])',
        '.turn-action-controls button[aria-haspopup="menu"]:has(svg path[d^="M14.0219 8.22363"])',
      ],
      {
        matchGroups: [
          [
            'turn-action-controls',
            '<button',
            'aria-haspopup="menu"',
            'arrows-clockwise-rotate-lg-light-16',
          ],
          ['turn-action-controls', '<button', 'aria-haspopup="menu"', 'M14.0219 8.22363'],
        ],
        uiStateRefs: ['assistant-turn-web-buttons-exposed'],
      },
    ),
    bySelectorList(
      'assistant-web-regenerate-item-try-again',
      [
        '[role="menu"] [role="menuitem"]:has(svg use[href$="#arrows-clockwise-rotate-lg-light-16"])',
        '[role="menu"] [role="menuitem"]:has(svg path[d^="M14.0219 8.22363"])',
      ],
      {
        matchGroups: [
          ['role="menu"', 'role="menuitem"', 'arrows-clockwise-rotate-lg-light-16'],
          ['role="menu"', 'role="menuitem"', 'M14.0219 8.22363'],
        ],
        uiStateRefs: ['assistant-web-regenerate-menu-copy', 'assistant-web-regenerate-menu'],
      },
    ),
    byInputName('assistant-web-regenerate-input', 'contextual-retry-feedback', {
      uiStateRefs: ['assistant-web-regenerate-menu-copy', 'assistant-web-regenerate-menu'],
    }),
    bySelectorList(
      'assistant-more-actions-trigger',
      [
        '.turn-action-controls button[aria-haspopup="menu"]:has(svg use[href$="#ellipsis-horizontal-light-16"])',
        '.turn-action-controls button[aria-haspopup="menu"]:has(svg path[d^="M3.33362 6.80811"])',
      ],
      {
        identifier:
          '.turn-action-controls button[aria-haspopup="menu"]:has(svg use[href$="#ellipsis-horizontal-light-16"]) | .turn-action-controls button[aria-haspopup="menu"]:has(svg path[d^="M3.33362 6.80811"])',
        searchNeedles: [
          '.turn-action-controls button[aria-haspopup="menu"]:has(svg use[href$="#ellipsis-horizontal-light-16"])',
          '.turn-action-controls button[aria-haspopup="menu"]:has(svg path[d^="M3.33362 6.80811"])',
        ],
        matchGroups: [
          ['turn-action-controls', 'aria-haspopup="menu"', 'ellipsis-horizontal-light-16'],
          ['turn-action-controls', 'aria-haspopup="menu"', 'M3.33362 6.80811'],
        ],
        uiStateRefs: [
          'user-turn-buttons-exposed',
          'assistant-turn-non-web-buttons-exposed',
          'assistant-turn-web-buttons-exposed',
        ],
        notes:
          'Native message overflow menu trigger scoped to .turn-action-controls and identified by the current SVG symbol fragment or legacy path prefix.',
      },
    ),
    byIconToken('assistant-read-aloud-direct-action', 'M9.75122 4.09203', {
      identifier: 'SVG path prefix=M9.75122 4.09203 (direct Read Aloud action)',
      uiStateRefs: ['assistant-turn-non-web-buttons-exposed', 'assistant-turn-web-buttons-exposed'],
    }),
    bySelectorList(
      'assistant-more-actions-branch',
      [
        '[role="menu"][data-state="open"] [role="menuitem"]:has(svg use[href$="#branch-light-16"])',
        '[role="menu"][data-state="open"] [role="menuitem"]:has(svg path[d^="M11.6672 1.97461"])',
      ],
      {
        identifier:
          '[role="menu"][data-state="open"] [role="menuitem"]:has(svg use[href$="#branch-light-16"]) | [role="menu"][data-state="open"] [role="menuitem"]:has(svg path[d^="M11.6672 1.97461"])',
        searchNeedles: [
          '[role="menu"][data-state="open"] [role="menuitem"]:has(svg use[href$="#branch-light-16"])',
          '[role="menu"][data-state="open"] [role="menuitem"]:has(svg path[d^="M11.6672 1.97461"])',
        ],
        matchGroups: [
          ['role="menu"', 'data-state="open"', 'role="menuitem"', 'branch-light-16'],
          ['role="menu"', 'data-state="open"', 'role="menuitem"', 'M11.6672 1.97461'],
        ],
        uiStateRefs: ['assistant-menu-read-aloud-branch'],
        notes:
          'Branch in new chat is the role=menuitem with this SVG symbol fragment or legacy path prefix in the open message-action menu; it has no data-testid.',
      },
    ),
    byIconToken(
      'temporary-chat-button',
      ['#chat-bubble-dashed-light-20', '#chat-bubble-checkmark-dashed-light-20'],
      {
        matchGroups: [['#chat-bubble-dashed-light-20'], ['#chat-bubble-checkmark-dashed-light-20']],
        uiStateRefs: ['probe-temporary-chat'],
        probeOnly: true,
        notes:
          'Identified by the current dashed-chat sprite in either observed toggle state on a blank new Chat conversation.',
      },
    ),
    byIconToken('composer-web-search-action', 'M12 2c5.522', {
      uiStateRefs: ['composer-add-files-and-more-menu'],
    }),
    byIconToken('composer-study-action', '#book-open-light-16', {
      uiStateRefs: ['composer-add-files-and-more-menu', 'probe-composer-study-search'],
      notes: 'Study appears in the plus menu after typing "study" in the composer search.',
    }),
    byIconToken('composer-create-image-action', 'M7 21.005', {
      uiStateRefs: ['composer-add-files-and-more-menu'],
    }),
    bySelectorList(
      'composer-deep-research-action',
      ['button[data-list-navigation-item="true"]:has(img[src*="deep_research_app/icon.png"])'],
      {
        matchGroups: [['data-list-navigation-item="true"', 'deep_research_app/icon.png']],
        uiStateRefs: ['probe-composer-deep-research-search'],
        notes:
          'The current Deep research menu row uses the observed app icon image inside a list-navigation button; matching it by the structural row and icon path avoids localized text.',
      },
    ),
    bySelectorList(
      'dictate-start-button',
      [
        'form[data-chatgpt-composer][data-thread-find-composer="true"] button:has(svg use[href$="#microphone-light-16"])',
        'form[data-chatgpt-composer][data-thread-find-composer="true"] button:has(svg use[href$="#microphone-light-20"])',
        'form[data-thread-find-composer="true"] button:has(svg path[d^="M12.4584 8.96973"])',
        'form[data-chatgpt-composer] button:has(svg path[d^="M12.4584 8.96973"])',
      ],
      {
        matchGroups: [
          [
            '<form',
            'data-chatgpt-composer',
            'data-thread-find-composer="true"',
            '<button',
            '#microphone-light-16"',
          ],
          [
            '<form',
            'data-chatgpt-composer',
            'data-thread-find-composer="true"',
            '<button',
            '#microphone-light-20"',
          ],
          ['<form', 'data-thread-find-composer="true"', '<button', 'M12.4584 8.96973'],
          ['<form', 'data-chatgpt-composer', '<button', 'M12.4584 8.96973'],
        ],
        uiStateRefs: ['probe-blank-chat-dictate-start'],
        notes:
          'The current Dictate button uses the observed microphone-light-16 or microphone-light-20 SVG symbol inside the composer form that carries both current composer markers. Older observed SVG path selectors remain as fallbacks; Start Voice and composer-send controls are excluded without localized labels.',
      },
    ),
    bySelectorList(
      'dictate-submit-button',
      [
        'form[data-chatgpt-composer][data-thread-find-composer="true"]:has(svg use[href$="#xmark-lg-light-20"]):has(svg use[href$="#stop-fill-light-20"]) button:has(svg use[href$="#arrow-up-lg-light-20"])',
        'form[data-thread-find-composer="true"] button[type="button"]:has(svg path[d^="M9.31697 3.08317"])',
        'form[data-chatgpt-composer] button[type="button"]:has(svg path[d^="M9.31697 3.08317"])',
      ],
      {
        matchGroups: [
          [
            '<form',
            'data-chatgpt-composer',
            'data-thread-find-composer="true"',
            '#xmark-lg-light-20"',
            '#stop-fill-light-20"',
            '<button',
            '#arrow-up-lg-light-20"',
          ],
          [
            '<form',
            'data-thread-find-composer="true"',
            '<button',
            'type="button"',
            'M9.31697 3.08317',
          ],
          ['<form', 'data-chatgpt-composer', '<button', 'type="button"', 'M9.31697 3.08317'],
        ],
        uiStateRefs: ['topbar-bottom-disabled-thread-bottom', 'probe-active-dictation-controls'],
        notes:
          'The active Dictation Transcribe-and-send control uses the observed arrow-up-lg-light-20 symbol only when the same current composer also contains both observed Cancel (xmark-lg-light-20) and Stop (stop-fill-light-20) symbols; this excludes the ordinary Send button. The older type=button SVG path selectors remain as fallbacks, and the current symbol selector does not require a type attribute.',
      },
    ),
    bySelectorList(
      'stop-dictation-button',
      [
        'form[data-chatgpt-composer][data-thread-find-composer="true"] button:has(svg use[href$="#stop-fill-light-20"])',
        'form[data-thread-find-composer="true"] button[type="button"]:has(svg path[d^="M13.0834 3.91846"])',
        'form[data-chatgpt-composer] button[type="button"]:has(svg path[d^="M13.0834 3.91846"])',
      ],
      {
        matchGroups: [
          [
            '<form',
            'data-chatgpt-composer',
            'data-thread-find-composer="true"',
            '<button',
            '#stop-fill-light-20"',
          ],
          [
            '<form',
            'data-thread-find-composer="true"',
            '<button',
            'type="button"',
            'M13.0834 3.91846',
          ],
          ['<form', 'data-chatgpt-composer', '<button', 'type="button"', 'M13.0834 3.91846'],
        ],
        uiStateRefs: ['probe-active-dictation-controls'],
        notes:
          'The active Dictation Stop control uses the observed stop-fill-light-20 SVG symbol inside the composer form carrying both current composer markers. The older type=button SVG path selectors remain as fallbacks; the current symbol selector does not require a type attribute.',
      },
    ),
    bySelectorList(
      'cancel-dictation-button',
      [
        'form[data-chatgpt-composer][data-thread-find-composer="true"] button:has(svg use[href$="#xmark-lg-light-20"])',
        'form[data-thread-find-composer="true"] button[type="button"]:has(svg path[d^="M14.779 4.27903"])',
        'form[data-chatgpt-composer] button[type="button"]:has(svg path[d^="M14.779 4.27903"])',
      ],
      {
        matchGroups: [
          [
            '<form',
            'data-chatgpt-composer',
            'data-thread-find-composer="true"',
            '<button',
            '#xmark-lg-light-20"',
          ],
          [
            '<form',
            'data-thread-find-composer="true"',
            '<button',
            'type="button"',
            'M14.779 4.27903',
          ],
          ['<form', 'data-chatgpt-composer', '<button', 'type="button"', 'M14.779 4.27903'],
        ],
        uiStateRefs: ['topbar-bottom-disabled-thread-bottom', 'probe-active-dictation-controls'],
        notes:
          'The active Dictation Cancel control uses the observed xmark-lg-light-20 SVG symbol inside the composer form carrying both current composer markers. The older type=button SVG path selectors remain as fallbacks; the current symbol selector does not require a type attribute.',
      },
    ),
    bySelectorList(
      'share-chat-button',
      [
        '[data-testid="app-shell-header-context-menu-surface"] > [data-app-shell-header-obstacle="true"] button:has(svg use[href$="#arrow-up-open-base-light-16"])',
        '[data-testid="app-shell-header-context-menu-surface"] > [data-app-shell-header-obstacle="true"] button:has(svg path[d^="M13.3337"])',
      ],
      {
        identifier: 'header-obstacle-icon=#arrow-up-open-base-light-16|legacy-path=M13.3337',
        matchGroups: [
          [
            'data-testid="app-shell-header-context-menu-surface"',
            'data-app-shell-header-obstacle="true"',
            '#arrow-up-open-base-light-16',
          ],
          [
            'data-testid="app-shell-header-context-menu-surface"',
            'data-app-shell-header-obstacle="true"',
            'M13.3337',
          ],
        ],
        uiStateRefs: ['topbar-bottom-disabled-header-area'],
        notes:
          'Share button inside the app-shell header obstacle, identified by the current arrow-up-open SVG symbol with the previous path prefix retained as a compatibility fallback; neither selector depends on a localized accessible name.',
      },
    ),
    byIconToken(
      'composer-add-photos-files-action',
      ['M7.99994 14.6888', 'M9.9998 18.3614', 'M6.1416 10.1663'],
      {
        identifier:
          'composer-menu-item-icon=M7.99994 14.6888|M9.9998 18.3614|legacy-path=M6.1416 10.1663',
        matchGroups: [
          ['data-list-navigation-item="true"', 'M7.99994 14.6888'],
          ['data-list-navigation-item="true"', 'M9.9998 18.3614'],
          ['data-list-navigation-item="true"', 'M6.1416 10.1663'],
        ],
        uiStateRefs: ['composer-add-files-and-more-menu'],
        notes:
          'The current Add photos and files action is a list-navigation button matched by its observed SVG path prefixes; the previous path prefix remains as a compatibility fallback, and the runtime rejects ambiguous visible matches.',
      },
    ),
    byIconToken(
      'new-gpt-conversation-item',
      ['#square-and-pencil-light-16', '#compose', '#3a5c87'],
      {
        uiStateRefs: ['probe-new-gpt-conversation'],
        probeOnly: true,
        notes:
          'The current New Chat row uses the square-and-pencil sprite; former compose tokens remain compatibility fallbacks. Validated from the GPT conversation fixture.',
      },
    ),
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
      ...(definition.requiredCapabilities
        ? { requiredCapabilities: Object.freeze(unique(definition.requiredCapabilities)) }
        : {}),
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
        setup: 'message-scroll-from-bottom',
        notes: 'Validates that the shortcut moves the conversation scroll position upward.',
      }),
      notes: 'Internal extension scroll helper verified by scroll-position delta.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyScrollDownOneMessage',
      targetRefs: ['message-scroll-down-delta'],
      uiStateRefs: [],
      activationProbe: domStateProbe('message-scroll-down-delta', {
        setup: 'message-scroll-from-top',
        notes: 'Validates that the shortcut moves the conversation scroll position downward.',
      }),
      notes: 'Internal extension scroll helper verified by scroll-position delta.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyScrollUpTwoMessages',
      targetRefs: ['message-scroll-up-delta'],
      uiStateRefs: [],
      activationProbe: domStateProbe('message-scroll-up-delta', {
        setup: 'message-scroll-from-bottom',
        notes: 'Validates that the shortcut moves the conversation scroll position upward.',
      }),
      notes: 'Internal extension scroll helper verified by scroll-position delta.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyScrollDownTwoMessages',
      targetRefs: ['message-scroll-down-delta'],
      uiStateRefs: [],
      activationProbe: domStateProbe('message-scroll-down-delta', {
        setup: 'message-scroll-from-top',
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
        notes:
          'Uses a user message in the audit-owned fixture and opens its edit card without submitting changes.',
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
      uiStateRefs: targetStateRefs('code-block-content'),
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
      uiStateRefs: targetStateRefs('codebox-wrap-enabled'),
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
      activationProbe: opensTargetProbe('prompt-textarea', {
        setup: 'new-conversation',
        uiStateRefs: [
          'topbar-bottom-disabled-thread-bottom',
          ...targetStateRefs('prompt-textarea'),
        ],
        notes:
          'New Conversation must leave the verified audit-owned conversation and open a blank root chat with a visible empty composer.',
      }),
    }),
    manualOnly('shortcutKeyNewConversationInNewTab', {
      notes: 'Opens a blank ChatGPT conversation in a new browser tab.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyToggleChatWork',
      targetRefs: ['create-new-chat-button', 'chat-work-surface-toggle'],
      uiStateRefs: targetStateRefs('create-new-chat-button', 'chat-work-surface-toggle'),
      activationProbe: notLiveProbed(
        'Stateful route-and-toggle action is validated manually: from an active conversation it opens a blank chat, waits 500 ms, then activates the unchecked header surface radio.',
      ),
      notes:
        'Uses the same native new-conversation helper as Alt+N and a language-agnostic two-radio header resolver.',
    }),
    defineShortcutAction({
      actionId: 'shortcutKeySearchConversationHistory',
      targetRefs: ['search-conversation-button', 'search-chats-dialog'],
      uiStateRefs: targetStateRefs('search-conversation-button', 'search-chats-dialog'),
      activationProbe: opensTargetProbe('search-chats-dialog', {
        uiStateRefs: ['sidebar-expanded-body'],
        notes: 'Alt+Comma should open the Search chats dialog.',
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyToggleSidebar',
      targetRefs: ['native-sidebar-toggle-control'],
      uiStateRefs: targetStateRefs('native-sidebar-toggle-control'),
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
      targetRefs: ['assistant-read-aloud-direct-action'],
      uiStateRefs: targetStateRefs('assistant-read-aloud-direct-action'),
      activationProbe: clickTargetProbe('assistant-read-aloud-direct-action', {
        uiStateRefs: [
          'assistant-turn-non-web-buttons-exposed',
          'assistant-turn-web-buttons-exposed',
        ],
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
    defineShortcutAction({
      actionId: 'shortcutKeyStudy',
      targetRefs: ['composer-plus-button', 'composer-study-action'],
      uiStateRefs: targetStateRefs('composer-plus-button', 'composer-study-action'),
      activationProbe: directMenuTargetProbe('composer-study-action', {
        setup: 'composer-plus-menu-search-study',
        uiStateRefs: ['composer-add-files-and-more-menu', 'probe-composer-study-search'],
        notes:
          'Open the plus menu and temporarily type "study" in the owned composer, matching the runtime search route; capture the visible Study icon before dispatch and clean up the known query without submitting it.',
      }),
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
      actionId: 'shortcutKeyDeepResearch',
      targetRefs: ['composer-plus-button', 'composer-deep-research-action'],
      uiStateRefs: targetStateRefs('composer-plus-button', 'composer-deep-research-action'),
      activationProbe: directMenuTargetProbe('composer-deep-research-action', {
        setup: 'composer-plus-menu-search-deep-research',
        uiStateRefs: ['probe-composer-deep-research-search'],
        notes:
          'Open the plus menu and temporarily type the owned deep research query; capture the target and clean up without submitting.',
      }),
    }),
    defineShortcutAction({
      actionId: 'shortcutKeyToggleDictate',
      targetRefs: ['dictate-start-button', 'dictate-submit-button'],
      uiStateRefs: targetStateRefs('dictate-start-button', 'dictate-submit-button'),
      activationProbe: clickTargetProbe('dictate-start-button', {
        setup: 'new-conversation',
        uiStateRefs: [],
        notes: 'Disposable blank conversation exposes the dictate start control.',
      }),
      notes: 'Dual-state behavior that changes targets when dictation is active.',
    }),
    manualOnly('shortcutKeyStopAndTranscribeDictation', {
      targetRefs: ['stop-dictation-button'],
      uiStateRefs: targetStateRefs('stop-dictation-button'),
      activationProbe: {
        notes:
          'Requires an already-active dictation recording; automated validation must not start recording or activate this stateful control.',
      },
      notes:
        'Stops active dictation and transcribes into the composer without sending; only available while recording.',
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
      actionId: 'shortcutKeyProStandard',
      requiredCapabilities: ['proEffort', 'dedicatedEffortControls'],
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
      requiredCapabilities: ['proEffort', 'dedicatedEffortControls'],
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
      requiredCapabilities: ['dedicatedEffortControls'],
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
      requiredCapabilities: ['dedicatedEffortControls'],
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
      uiStateRefs: targetStateRefs('new-gpt-conversation-item'),
      activationProbe: clickTargetProbe('new-gpt-conversation-item', {
        setup: 'gpt-conversation',
        uiStateRefs: targetStateRefs('new-gpt-conversation-item'),
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
