# Scroll Boundary Shortcut Reliability Plan

## Goal

- [x] Make the Scroll to Top and Scroll to Bottom shortcuts consistently land on the real conversation scroll bounds in ChatGPT's current `data-scroll-root` layout.

## Investigation findings

- [x] The inspector dump shows the conversation is inside a dedicated `[data-scroll-root]` element with `not-print:overflow-y-auto`, sticky `#page-header`, and sticky `#thread-bottom-container`.
- [x] `extension/content.js` already resolves that scroll root through `getScrollableContainer()` and disables overflow anchoring on it.
- [x] The top/bottom shortcut handlers use GSAP `scrollTo` without `autoKill: false`, so the global ScrollToPlugin `autoKill: true` can abort when ChatGPT's sticky composer/header or layout settling changes scroll position during the tween.
- [x] The bottom handler uses `y: 'max'`, which is calculated when the tween starts and can be stale if the scroll height changes while the sticky bottom area settles.

## Scope

- [x] Touch only `extension/content.js` unless validation exposes a direct test or metadata dependency.
- [x] Do not change shortcut defaults, popup settings, manifest permissions, or DevScrape capture behavior.

## Implementation plan

- [x] Add a small boundary-scroll helper near the existing message-scroll helpers.
- [x] Force boundary tweens to use `autoKill: false`.
- [x] Recompute and reapply the exact top or bottom boundary on completion and a few short post-layout ticks so sticky/dynamic ChatGPT layout changes cannot leave the viewport short.
- [x] Route `shortcutKeyScrollToTop` and `shortcutKeyClickNativeScrollToBottom` through the shared helper.

## Validation

- [x] Run `node --check extension/content.js`.
- [x] Run `npx biome check extension/content.js`.
- [x] Run `npm run validate:keys`.

## Done when

- [x] Scroll top ends at `scrollTop === 0`.
- [x] Scroll bottom ends at the current `scrollHeight - clientHeight`, not the stale max from tween start.
- [x] Existing shortcut wiring validation still passes.

## Related specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
