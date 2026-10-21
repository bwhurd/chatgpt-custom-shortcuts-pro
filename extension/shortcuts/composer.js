// Passive composer actions; the existing content-script dispatcher owns bindings.
(function initComposerShortcuts(root, factory) {
  const api = Object.freeze({ ...factory(), sourceSignature: factory.toString() });
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CSPShortcuts ||= {};
  root.CSPShortcuts.composer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const OWNER = 'extension/shortcuts/composer.js';
  const INPUT_SELECTORS = Object.freeze([
    'form[data-thread-find-composer="true"] div.ProseMirror[contenteditable="true"][role="textbox"]',
    'form[data-chatgpt-composer] [data-composer-markdown][contenteditable="true"][role="textbox"]',
  ]);
  const OPENER_SELECTORS = Object.freeze([
    'form[data-thread-find-composer="true"] button[data-composer-navigation-target="add-context"]',
    'form[data-chatgpt-composer] button[data-composer-navigation-target="add-context"]',
  ]);
  const STUDY_ICON_TOKENS = Object.freeze(['#book-open-light-20', '#book-open-light-16']);
  const targets = Object.freeze({
    'prompt-textarea': {
      owner: OWNER,
      selectors: INPUT_SELECTORS,
      rules: ['active-editor', 'active-form', 'one-visible-composer'],
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
    },
    'composer-plus-button': {
      owner: OWNER,
      selectors: OPENER_SELECTORS,
      rules: ['active-form-plus-button'],
      matchGroups: [
        ['data-thread-find-composer="true"', 'data-composer-navigation-target="add-context"'],
        ['data-chatgpt-composer', 'data-composer-navigation-target="add-context"'],
      ],
    },
    'composer-study-action': {
      owner: OWNER,
      iconTokens: STUDY_ICON_TOKENS,
      rules: ['selected-tool', 'visible-study-menu-item'],
      matchGroups: STUDY_ICON_TOKENS.map((token) => [token]),
    },
  });

  function create({
    document,
    isVisible,
    click,
    findToolItems,
    findSelectedTool,
    removeTool,
    isToolMenuOpen,
    waitFor,
    sleep,
    delays,
  }) {
    const view = document.defaultView;
    let studyInFlight = false;
    const eligible = (element) =>
      !!element?.isConnected &&
      !element.disabled &&
      element.getAttribute('aria-disabled') !== 'true' &&
      isVisible(element);
    const diagnostic = (actionId, targetId) => ({
      actionId,
      targetId,
      owner: OWNER,
      implementation: 'shared-resolver',
      surface: 'composer',
      scope: 'active composer form and its tool menu',
      prerequisites:
        targetId === 'prompt-textarea'
          ? ['rendered composer']
          : ['rendered composer; Plus menu and Study query may be required'],
      status: 'missing',
      reason: 'no-eligible-composer',
      candidateCount: 0,
      eligibleCount: 0,
      matchingRule: null,
      selected: null,
    });

    function resolveComposer() {
      const candidates = [
        ...new Set(INPUT_SELECTORS.flatMap((selector) => [...document.querySelectorAll(selector)])),
      ];
      const usable = candidates.filter(eligible);
      const active = document.activeElement;
      const activeEditor = usable.find((input) => input === active || input.contains(active));
      const activeForm = active?.closest?.('form');
      const scoped = activeEditor
        ? [activeEditor]
        : usable.filter((input) => activeForm && input.closest('form') === activeForm);
      const choices = scoped.length ? scoped : usable;
      const rule = activeEditor
        ? 'active-editor'
        : scoped.length
          ? 'active-form'
          : 'one-visible-composer';
      const record = diagnostic('shortcutKeyActivateInput', 'prompt-textarea');
      Object.assign(record, {
        candidateCount: candidates.length,
        eligibleCount: choices.length,
        matchingRule: rule,
        status: choices.length === 1 ? 'ready' : choices.length > 1 ? 'ambiguous' : 'missing',
        reason:
          choices.length === 1
            ? 'one-eligible-composer'
            : choices.length > 1
              ? 'multiple-composers-without-active-owner'
              : 'no-eligible-composer',
      });
      const element = choices.length === 1 ? choices[0] : null;
      if (element) record.selected = { tag: element.tagName.toLowerCase(), role: 'textbox', rule };
      return { element, diagnostic: record };
    }

    function inspect(targetId = 'prompt-textarea') {
      const composer = resolveComposer();
      if (targetId === 'prompt-textarea') return composer;
      const record = {
        ...diagnostic('shortcutKeyStudy', targetId),
        candidateCount: composer.diagnostic.candidateCount,
        eligibleCount: composer.diagnostic.eligibleCount,
      };
      if (targetId !== 'composer-study-action')
        return {
          element: null,
          diagnostic: { ...record, status: 'unavailable', reason: 'unknown-target' },
        };
      if (!composer.element)
        return {
          element: null,
          diagnostic: {
            ...record,
            status: composer.diagnostic.status,
            reason: composer.diagnostic.reason,
          },
        };
      const input = composer.element;
      let selected = findSelectedTool(input, STUDY_ICON_TOKENS);
      if (selected?.element && !eligible(selected.element)) selected = null;
      if (selected) {
        const ambiguous = selected.kind === 'ambiguous';
        return {
          element: selected.element,
          composer: input,
          selected,
          diagnostic: {
            ...record,
            candidateCount: ambiguous ? 2 : 1,
            eligibleCount: ambiguous ? 2 : 1,
            status: ambiguous ? 'ambiguous' : 'ready',
            reason: ambiguous ? 'multiple-selected-study-controls' : 'study-selected',
            matchingRule: 'selected-tool',
            selected: ambiguous
              ? null
              : {
                  tag: selected.element.tagName.toLowerCase(),
                  kind: selected.kind,
                  rule: 'selected-tool',
                },
          },
        };
      }
      const form = input.closest('form');
      const openers = [
        ...new Set(
          OPENER_SELECTORS.flatMap((selector) => [...document.querySelectorAll(selector)]),
        ),
      ].filter((element) => eligible(element) && element.closest('form') === form);
      const controlled =
        openers.length === 1
          ? document.getElementById(openers[0].getAttribute('aria-controls'))
          : null;
      const candidates = findToolItems(STUDY_ICON_TOKENS).filter(
        (element) => !controlled || controlled.contains(element),
      );
      const usable = candidates.filter(eligible);
      const status =
        usable.length > 1 || openers.length > 1
          ? 'ambiguous'
          : usable.length === 1
            ? 'ready'
            : openers.length === 1
              ? 'needs-state'
              : 'missing';
      const element = status === 'ready' ? usable[0] : null;
      return {
        element,
        composer: input,
        opener: openers.length === 1 ? openers[0] : null,
        diagnostic: {
          ...record,
          candidateCount: candidates.length,
          eligibleCount: usable.length,
          status,
          reason:
            status === 'ready'
              ? 'one-eligible-study-item'
              : status === 'needs-state'
                ? 'study-menu-or-query-not-ready'
                : status === 'ambiguous'
                  ? 'multiple-study-controls'
                  : 'study-opener-unavailable',
          matchingRule: 'visible-study-menu-item',
          selected: element
            ? {
                tag: element.tagName.toLowerCase(),
                role: 'menuitem',
                rule: 'visible-study-menu-item',
              }
            : null,
        },
      };
    }

    function focus() {
      const { element: input } = resolveComposer();
      if (!input) return false;
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
      if (input.isContentEditable) {
        try {
          const selection = view.getSelection?.();
          const range = document.createRange();
          range.selectNodeContents(input);
          range.collapse(false);
          selection?.removeAllRanges();
          selection?.addRange(range);
        } catch {}
      }
      return document.activeElement === input || input.contains(document.activeElement);
    }

    async function study() {
      if (studyInFlight) return { ok: false, status: 'busy' };
      studyInFlight = true;
      let owned = null;
      let activated = false;
      try {
        let result = inspect('composer-study-action');
        if (!['ready', 'needs-state'].includes(result.diagnostic.status))
          return { ok: false, status: result.diagnostic.status };
        const input = result.composer;
        if (result.selected) {
          await removeTool(
            STUDY_ICON_TOKENS,
            delays,
            { rejectAmbiguous: true },
            { composer: input },
          );
          return { ok: true, status: 'activated' };
        }
        if (!result.element) {
          if (!isToolMenuOpen() && click(result.opener) !== true)
            return { ok: false, status: 'activation-failed' };
          focus();
          const previousHtml = input.innerHTML;
          const previousText = input.innerText;
          document.execCommand('insertText', false, previousText.trim() ? ' study' : 'study');
          if (input.innerText === previousText) return { ok: false, status: 'query-not-inserted' };
          owned = { input, previousHtml, insertedHtml: input.innerHTML };
          result = await waitFor(
            () => {
              const current = inspect('composer-study-action');
              return current.diagnostic.status === 'ready' ||
                current.diagnostic.status === 'ambiguous'
                ? current
                : null;
            },
            { timeout: Math.min(delays.waitActionItem, 300) },
          );
          if (!result) return { ok: false, status: 'timeout' };
        }
        await sleep(delays.beforeFinalClick);
        result = inspect('composer-study-action');
        if (result.diagnostic.status !== 'ready' || result.composer !== input || result.selected)
          return { ok: false, status: result.diagnostic.status };
        activated = click(result.element) === true;
        return { ok: activated, status: activated ? 'activated' : 'activation-failed' };
      } catch {
        return { ok: false, status: 'activation-failed' };
      } finally {
        if (
          !activated &&
          owned?.input.isConnected &&
          owned.input.innerHTML === owned.insertedHtml
        ) {
          owned.input.innerHTML = owned.previousHtml;
          owned.input.dispatchEvent(
            new view.InputEvent('input', { bubbles: true, inputType: 'deleteContent' }),
          );
        }
        studyInFlight = false;
      }
    }
    return Object.freeze({ inspect, focus, study });
  }
  return { OWNER, INPUT_SELECTORS, OPENER_SELECTORS, STUDY_ICON_TOKENS, targets, create };
});
