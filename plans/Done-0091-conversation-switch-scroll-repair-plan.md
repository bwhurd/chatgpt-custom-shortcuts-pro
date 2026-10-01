# Plan 0091: Restore Scroll Shortcuts After Conversation Switches

## Goal

- [x] Keep all conversation scroll shortcuts working across conversation switches without requiring a page reload.

## Current evidence

- [x] User reproduction: reload the extension, open a conversation, and reload the page; scrolling works. Switch conversations within that page; none of the scroll shortcuts work.
- [x] The earlier selector update in `extension/content.js` did not resolve this reproduction. Biome and whitespace checks passed; they did not prove navigation behavior.
- [x] Configurable Alt actions use a document capture listener. Message stepping and top/bottom actions share `getScrollableContainer()`, which queries current message nodes and finds their common scrollable ancestor. PageUp/PageDown takeover uses the same resolver through a separate bubbling listener.
- [x] Message and boundary animations retain tween/frame/timer state. The conversation observer attaches to an initial container, but its example callback does no work; its stale attachment alone is not evidence of the reported failure.
- [x] `tests/conversation-scroll-target-fixture.mjs` covers geometry and boundaries. Its selector mock returns the same nodes for every selector and does not model replacing a conversation or its scroller.
- [x] Active plan 0076 explicitly assigns scrolling to a separate workstream; plan 0090 owns pending PR integration. This plan owns this repair.
- [x] Confirmed live root cause: ChatGPT retains hidden, connected conversation panels. The failing page had hidden messages plus the visible conversation's messages, so global lookup combined their ancestors and fell back to the non-scrolling document root. After reload, Alt+T moved the sole visible scroller from 0 to -1430; switching conversations recreated the hidden panel and Alt+T left the visible scroller at 0.

## Scope and owning files

- [x] Repair `extension/content.js`, extend `tests/conversation-scroll-target-fixture.mjs`, and document confirmed ownership in `specs/0004-model-picker-and-shortcuts-spec.md`.
- [x] Cover one/two messages up/down, conversation top/bottom, and enabled PageUp/PageDown takeover. Preserve existing shortcut assignments and unrelated working-tree edits.
- [x] Keep response-variant navigation, settings migrations, manifest permissions, release packaging, and other audit work outside this repair.

## Execution batches

### 1. Locate the failing boundary

- [x] Reproduce trusted Alt+T on the failing page, after reload, and after switching to a second scrollable conversation; record scroll metrics without reading message bodies.
- [x] Capture native scrollers and ancestors: one hidden panel had zero layout dimensions; the active panel had a real scroll range; the document root had `scrollHeight === clientHeight === 1118`. Current message units were distributed across both panels.
- [x] Trace shared container resolution against the observed DOM. The same trusted Alt+T works immediately after reload and fails once the hidden panel exists; the resolver's global common ancestor explains the no-op before animation.
- [x] Confirm retained hidden trees rather than detached-only targets. Guard pending animation/settle work against hidden or detached containers.

### 2. Repair the confirmed cause

- [x] Scope message discovery to the rendered native scroller; keep rendered legacy fallbacks and reject a document root without scroll range. Empty mounting states resolve safely to no target.
- [x] Resolve the current root on each action and stop animations/settling when their target is hidden or detached. The confirmed cause requires no new navigation observer or polling.
- [x] Preserve existing shortcut dispatch and modifier handling. Correct PageUp/PageDown bounds and GSAP targets for the live `column-reverse` scroller's negative positions.
- [x] Keep message stepping and boundary actions on the same active root; retain current message-unit selectors within that scope.

### 3. Prove navigation behavior

- [x] Make fixture selectors distinct and model retained hidden A alongside visible B, B → A, detached A, scoped selector fallbacks, and stale boundary/page callbacks.
- [x] Retain geometry/nested-scroll/boundary cases; add reverse-scroll boundaries and actual PageUp/PageDown handler assertions for ordinary and negative coordinates.
- [x] `node tests/conversation-scroll-target-fixture.mjs`, Biome on `extension/content.js`, and scoped `git diff --check` pass. Biome's configured file includes omit `.mjs`; the fixture is executed directly.
- [x] After the user reloaded the extension and one page refresh, complete A → B → A without further reloads: all eight scroll actions move correctly in each stage. Switching immediately after starting B's top animation leaves A's position stable.
- [x] Record observed results, add navigation ownership/troubleshooting guidance to the shortcut spec, and rename the plan after live acceptance.

## Done when

- [x] The user's reload-versus-switch reproduction passes in both directions without a page reload, all covered scroll actions use the active conversation, and the focused regression checks pass.
- [x] The diagnosis and repair are supported by observed before/after behavior; formatter success alone is not recorded as functional proof.

## Execution status — 2026-09-30

- [x] Source repair, focused regression fixture, and durable spec guidance are implemented.
- [x] The user clicked the extension's Reload control; the page was refreshed once and the updated resolver was verified in the extension's isolated runtime.
- [x] Discard the initial wider matrix because the user was also navigating during it. The clean rerun records route identity before and after every key and passes all 24 cases: Alt+A/F, Alt+ArrowUp/Down, Alt+T/Z, and enabled PageUp/PageDown in A, B, and returned A. Each key keeps the same route.
- [x] In B, the active scroll range is 5156 px. From midpoint -2578, one/two up land at -3109/-3195, both downward actions reach the remaining-message boundary at 0, top/bottom reach -5156/0, and PageUp/PageDown move 894 px in their respective directions. Hidden panels remain excluded.
- [x] In A and returned A, the active range is 1378 px. From midpoint -689, one/two up land at -989/-1337; downward actions, bottom, and PageDown reach 0; top and PageUp reach -1378. A remains at 0 through the delayed-work interval after switching away from B's active top animation.

## Related specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md` owns runtime shortcut behavior and selector rules.
- [x] `PROJECT_SPEC.md` → Validation and tooling posture owns extension reload requirements and the choice of focused/manual checks.
