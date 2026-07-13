# Thread Navigation Loop Repair

## Goal

- [x] Make Ctrl+Alt+Previous cycle upward through every response navigator and wrap from the top back to the bottom.
- [x] Make Ctrl+Alt+Next cycle downward through every response navigator and wrap from the bottom back to the top.
- [x] Keep preview shortcuts scroll-only; normal Alt shortcuts scroll to and click the lowest visible actionable direction button.

## Investigation findings

- [x] Live Chrome inspection confirms response navigation is a language-agnostic sibling group: previous button, `div.tabular-nums` counter, next button.
- [x] The current preview depends on a sub-pixel centered check and always searches toward earlier DOM entries, so it can stall at a clamped scroll boundary and cannot drive a reliable downward loop.
- [x] Normal Alt navigation can choose a disabled direction button even when an enabled match exists elsewhere in the conversation.
- [x] Reloaded-extension tracing shows ChatGPT changes the mounted navigator set by scroll position: turns 2/6 appear near the top but are absent near the bottom.
- [x] Next currently loops through mounted turns 8/10/12 and skips turns 2/6 because bottom-to-top wrapping never reaches the actual scroll boundary before rescanning.
- [x] Bottom-wrap tracing shows ChatGPT changes the scroll maximum while remounting turns; scroll-position-based cursor invalidation can therefore reselect the bottom navigator instead of wrapping.

## Implementation plan

- [x] Replace centered-position inference with a small preview cursor tied to the current navigator group and achieved scroll position; reset it after manual scrolling or DOM replacement.
- [x] Sort candidates in document order, advance by direction with modulo wraparound, and retain the existing lowest-visible choice for the first preview step.
- [x] Exclude disabled buttons only from normal Alt click actions so Ctrl+Alt can still visit every response counter.
- [x] Document the scroll-only directional loop contract in `specs/0004-model-picker-and-shortcuts-spec.md`.
- [x] Track the current navigator by stable conversation-turn identity so DOM replacement does not reset or misdirect the cursor.
- [x] Treat directional wrap as a two-stage operation: scroll to the real top/bottom boundary, allow ChatGPT to remount turns, rescan, then center the true first/last navigator.
- [x] Prevent overlapping preview animations from advancing the cursor out of sync during key repeat.
- [x] Keep traversal keyed to the last stable turn identity instead of resetting it for incidental scroll-height and scroll-position drift.

## Validation

- [x] Add a focused DOM fixture covering language-agnostic selection, disabled-button click filtering, upward/downward ordering, and wraparound.
- [x] Run the focused fixture, `node --check`, Biome on changed files, and live Chrome selector/loop checks on the supplied conversation.
- [x] Extend the fixture for dynamic mounted subsets, stable turn identity, and explicit boundary wrap decisions.
- [ ] Reload and trace both directions until each observed turn is visited once per cycle in order.

## Done when

- [ ] Repeated Ctrl+Alt+Previous and Ctrl+Alt+Next each visit all navigators in one direction and wrap indefinitely without clicking, including navigators remounted only at a scroll boundary.
- [x] Alt+Previous and Alt+Next choose the lowest visible enabled direction control and click it.

Related specs:

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
