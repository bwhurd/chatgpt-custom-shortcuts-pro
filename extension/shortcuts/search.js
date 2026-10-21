// Native Search Chats only. Importing this file installs no listeners or observers.
(function initNativeSearch(root, factory) {
  const api = Object.freeze({ ...factory(), sourceSignature: factory.toString() });
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CSPShortcuts ||= {};
  root.CSPShortcuts.search = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const ACTION_ID = 'shortcutKeySearchConversationHistory';
  const TARGET_ID = 'search-conversation-button';
  const OWNER = 'extension/shortcuts/search.js';
  const spriteRule = (id, fragments, legacy = false) => ({
    id,
    kind: 'selector',
    selectors: fragments.map((fragment) =>
      legacy
        ? `button[data-sidebar-item="true"]:has(use[href*="${fragment}"])`
        : `button:has(svg use[href$="${fragment}"])`,
    ),
    matchGroups: fragments.map((fragment) => ['<button', fragment]),
  });
  const pathFragments = ['M9.16211 2.37976', 'M7.32849 1.91016'];
  const rules = [
    spriteRule('named-search-sprites', [
      '#magnifying-glass-lg-light-16',
      '#magnifying-glass-lg-light-20',
    ]),
    {
      id: 'observed-titlebar-paths',
      kind: 'selector',
      selectors: pathFragments.map((path) => `button:has(svg path[d^="${path}"])`),
      matchGroups: pathFragments.map((path) => ['<button', path]),
    },
    {
      id: 'legacy-search-test-id',
      kind: 'selector',
      selectors: ['button[data-testid="search-conversation-button"]'],
      matchGroups: [['data-testid="search-conversation-button"']],
    },
    {
      id: 'expanded-sidebar-adjacency',
      kind: 'previous-button',
      selectors: ['#sidebar-header button[data-testid="close-sidebar-button"]'],
      matchGroups: [['id="sidebar-header"', 'data-testid="close-sidebar-button"']],
    },
    ...['stage-sidebar-tiny-bar', 'stage-popover-sidebar'].map((id) => ({
      id: `${id}-adjacency`,
      kind: 'sidebar-adjacent-button',
      selectors: [`#${id} [data-testid="create-new-chat-button"]`],
      matchGroups: [
        [`id="${id}"`, 'data-testid="create-new-chat-button"', 'data-sidebar-item="true"'],
      ],
    })),
    spriteRule('legacy-search-sprites', ['#sidebar-search', '#ac6d36'], true),
  ].map((rule) =>
    Object.freeze({
      ...rule,
      selectors: Object.freeze(rule.selectors),
      matchGroups: Object.freeze(rule.matchGroups.map((group) => Object.freeze(group))),
    }),
  );
  const popoverSelectors = Object.freeze([
    'button[data-testid="open-sidebar-button"][aria-controls="stage-popover-sidebar"]',
  ]);
  const target = Object.freeze({
    targetId: TARGET_ID,
    owner: OWNER,
    surface: 'native-navigation',
    scope: 'document navigation controls identified by observed structure',
    prerequisites: Object.freeze(['navigation rendered; narrow sidebar popover may need opening']),
    rules: Object.freeze(rules),
    matchGroups: Object.freeze(rules.flatMap((rule) => rule.matchGroups)),
  });
  const targets = Object.freeze({ [TARGET_ID]: target });

  function create({ document, click, isVisible }) {
    if (typeof click !== 'function' || typeof isVisible !== 'function')
      throw new TypeError('Native Search needs explicit click and visibility helpers');

    function eligible(element) {
      return (
        !!element?.isConnected &&
        !element.disabled &&
        element.getAttribute('aria-disabled') !== 'true' &&
        isVisible(element)
      );
    }

    function collect(rule, root) {
      const candidates = rule.selectors.flatMap((selector) =>
        Array.from(root.querySelectorAll(selector)),
      );
      if (rule.kind === 'previous-button')
        return candidates
          .map((anchor) => anchor.previousElementSibling)
          .filter((element) => element?.matches('button'));
      if (rule.kind === 'sidebar-adjacent-button')
        return candidates.flatMap((anchor) =>
          Array.from(
            anchor.parentElement?.nextElementSibling?.querySelectorAll(
              'button[data-sidebar-item="true"]',
            ) || [],
          ),
        );
      return candidates;
    }

    function inspect(targetId = TARGET_ID, { root = document } = {}) {
      const diagnostic = {
        actionId: ACTION_ID,
        targetId,
        owner: OWNER,
        implementation: 'shared-resolver',
        surface: target.surface,
        scope: target.scope,
        prerequisites: target.prerequisites,
        status: 'unavailable',
        reason: 'unknown-target',
        candidateCount: 0,
        eligibleCount: 0,
        matchingRule: null,
        selected: null,
        rules: [],
      };
      if (targetId !== TARGET_ID) return { element: null, diagnostic };
      if (!root?.querySelectorAll)
        return { element: null, diagnostic: { ...diagnostic, reason: 'document-unavailable' } };
      const all = new Set();
      const allEligible = new Set();
      let decision = null;
      for (const rule of rules) {
        const candidates = [...new Set(collect(rule, root))];
        const usable = candidates.filter(eligible);
        for (const element of candidates) all.add(element);
        for (const element of usable) allEligible.add(element);
        diagnostic.rules.push({
          id: rule.id,
          candidateCount: candidates.length,
          eligibleCount: usable.length,
        });
        if (!decision && usable.length) decision = { rule, usable };
      }
      diagnostic.candidateCount = all.size;
      diagnostic.eligibleCount = allEligible.size;
      if (decision) {
        diagnostic.matchingRule = decision.rule.id;
        diagnostic.status = decision.usable.length === 1 ? 'ready' : 'ambiguous';
        diagnostic.reason =
          decision.usable.length === 1
            ? 'one-eligible-candidate'
            : 'multiple-equal-priority-candidates';
        const element = decision.usable.length === 1 ? decision.usable[0] : null;
        if (element)
          diagnostic.selected = {
            tag: element.tagName.toLowerCase(),
            role: 'button',
            rule: decision.rule.id,
          };
        return { element, diagnostic };
      }
      const openers = [
        ...new Set(
          popoverSelectors.flatMap((selector) => Array.from(root.querySelectorAll(selector))),
        ),
      ].filter(eligible);
      diagnostic.preparation = {
        targetId: 'narrow-sidebar-popover',
        eligibleCount: openers.length,
      };
      diagnostic.status =
        openers.length > 1 ? 'ambiguous' : openers.length === 1 ? 'needs-state' : 'missing';
      diagnostic.reason =
        openers.length > 1
          ? 'ambiguous-sidebar-popover-opener'
          : openers.length === 1
            ? 'sidebar-popover-not-ready'
            : 'no-eligible-native-search-control';
      return {
        element: null,
        preparationElement: openers.length === 1 ? openers[0] : null,
        diagnostic,
      };
    }

    function activate(element) {
      return click(element) === true;
    }

    function waitForTarget({ root, timeoutMs, signal }) {
      return new Promise((resolve) => {
        let observer;
        let timer;
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          observer?.disconnect();
          document.defaultView.clearTimeout(timer);
          signal?.removeEventListener('abort', cancel);
          resolve(result);
        };
        const cancel = () =>
          finish({
            diagnostic: {
              ...inspect(TARGET_ID, { root }).diagnostic,
              status: 'unavailable',
              reason: 'cancelled',
            },
          });
        const check = () => {
          const result = inspect(TARGET_ID, { root });
          if (result.diagnostic.status === 'ready' || result.diagnostic.status === 'ambiguous')
            finish(result);
        };
        if (signal?.aborted) {
          cancel();
          return;
        }
        observer = new document.defaultView.MutationObserver(check);
        observer.observe(root.nodeType === 9 ? root.documentElement : root, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: [
            'aria-expanded',
            'aria-hidden',
            'aria-disabled',
            'hidden',
            'disabled',
            'style',
            'class',
            'href',
            'd',
          ],
        });
        signal?.addEventListener('abort', cancel, { once: true });
        timer = document.defaultView.setTimeout(
          () =>
            finish({
              diagnostic: {
                ...inspect(TARGET_ID, { root }).diagnostic,
                status: 'missing',
                reason: 'target-render-timeout',
              },
            }),
          timeoutMs,
        );
        check();
      });
    }

    async function run({ root = document, timeoutMs = 800, signal } = {}) {
      let result = inspect(TARGET_ID, { root });
      if (signal?.aborted)
        return {
          ok: false,
          status: 'cancelled',
          diagnostic: { ...result.diagnostic, status: 'unavailable', reason: 'cancelled' },
        };
      try {
        if (result.diagnostic.status === 'needs-state') {
          const opener = result.preparationElement;
          if (opener.getAttribute('aria-expanded') !== 'true' && !activate(opener))
            return { ok: false, status: 'activation-failed', diagnostic: result.diagnostic };
          result = await waitForTarget({
            root,
            timeoutMs: Math.max(0, Math.min(timeoutMs, 2000)),
            signal,
          });
        }
        if (result.diagnostic.status !== 'ready')
          return {
            ok: false,
            status:
              result.diagnostic.reason === 'target-render-timeout'
                ? 'timeout'
                : result.diagnostic.reason === 'cancelled'
                  ? 'cancelled'
                  : result.diagnostic.status,
            diagnostic: result.diagnostic,
          };
        const ok = activate(result.element);
        return {
          ok,
          status: ok ? 'activated' : 'activation-failed',
          diagnostic: result.diagnostic,
        };
      } catch {
        return {
          ok: false,
          status: 'activation-failed',
          diagnostic: { ...result.diagnostic, reason: 'native-activation-error' },
        };
      }
    }

    return Object.freeze({ inspect, run });
  }
  return { ACTION_ID, TARGET_ID, OWNER, targets, create };
});
