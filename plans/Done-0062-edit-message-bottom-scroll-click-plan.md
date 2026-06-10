# Edit Message Bottom Scroll Click Plan

## Goal

- [x] Make `Alt + E` reliably open the last sent message edit card when the conversation starts scrolled all the way to the bottom.

## Investigation findings

- [x] `extension/content.js` resolves the edit button before scrolling, scrolls it toward center, then clicks the same captured node after a timeout.
- [x] Live CDP tracing showed the first post-reload bottom-of-thread failure selected the correct icon button and started scrolling, but GSAP `ScrollToPlugin` did not call the completion path when ChatGPT's bottom-thread layout shifted during the scroll.
- [x] Re-triggering succeeds because the target is already centered, so the second invocation does not depend on the interrupted scroll completion path.

## Scope

- [x] Touch only the `shortcutKeyEdit` runtime handler unless validation exposes a direct dependency.
- [x] Preserve existing selectors and shortcut defaults.
- [x] Do not add permissions, popup changes, or broad selector rewrites.

## Implementation plan

- [x] Extract small local helpers inside the edit shortcut handler to collect and rank edit buttons from current DOM geometry.
- [x] After scrolling completes, re-resolve the target from the current viewport/final geometry instead of clicking only the originally captured element.
- [x] Make the scroll completion path one-shot and resilient to interruption, then dispatch a pointer-style click plus native `button.click()` against the final icon button.
- [x] If the edit field is not visible after 100 ms and the same button is still connected, send one second click and then fail silently.

## Validation

- [x] Run `node --check extension/content.js`.
- [x] Run `npx biome check extension/content.js` or the project-equivalent targeted check.
- [x] Reload the unpacked extension in the CDP Chrome profile, reload the target ChatGPT conversation, and verify the first `Alt + E` activation opens the edit field.

## Done when

- [x] The handler clicks the final centered edit button from a fresh DOM read.
- [x] Targeted syntax/lint validation passes or any remaining issue is documented.

## Related specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
