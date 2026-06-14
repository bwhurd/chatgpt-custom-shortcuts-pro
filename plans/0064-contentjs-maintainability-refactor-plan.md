# Content.js Maintainability Refactor Plan

## Goal

- [ ] Keep `extension/content.js` IIFE-based and `window`-bridged, but reduce repetition enough that future edits stay organized, reusable, and easy to review.

## Investigation findings

- [ ] `extension/content.js` is about 15k lines long, with 53 section markers and 58 `window.*` exports, so the file only stays maintainable if each section owns one clear concern.
- [x] Two stale authoring markers were shipped in the runtime file at `extension/content.js:13518` and `extension/content.js:14029`; this pass removed them.
- [ ] The same helper family is defined in multiple distant sections instead of once: `toTokenArray`, `safeEsc`, `smartClick`, `isVisible`, and `openRadixMenuIfNeeded` appear in more than one content block.
- [x] `window.toggleModelSelector` was a large orchestration block with nested local helpers for key events, hover/click fallback, and submenu recovery; this pass moved those helpers into named local functions.
- [ ] `extension/shared/model-picker-selectors.js` already exists and owns shared selector/visibility/menu helpers, so content-side model-picker code should reuse that surface before adding more local DOM heuristics.
- [ ] `extension/shared/model-picker-labels.js` and `window.ShortcutUtils` already exist, so shared label/code/selector logic should stay out of ad hoc content-local copies unless a fallback is truly feature-local.

## Audit criteria

- [ ] Flag any helper that is referenced in 2+ places as a candidate for one canonical definition.
- [ ] When multiple helpers do the same task, pick the most robust and simplest implementation as the canonical helper, then replace the weaker versions instead of layering more wrappers around them.
- [ ] If a helper can cover multiple repeated call sites cleanly, prefer one reusable helper over several near-duplicate variants unless the variants truly encode different feature behavior.
- [ ] Flag any function that mixes DOM querying, event dispatch, storage, and state mutation for more than one feature as too broad.
- [ ] Flag any `window.*` export that does not have a clear cross-IIFE or external consumer.
- [ ] Flag any selector or label logic duplicated between content, popup, or tests when a shared module already exists.
- [ ] Flag any function that uses more than one fallback strategy for the same DOM task as a candidate for smaller helpers.
- [ ] Flag any shipped runtime file that still contains paste markers, temporary notes, or authoring artifacts.
- [ ] Flag any animation or visual cue path that is at risk of changing timing, easing, opacity, or flashing behavior as high-risk and keep it behavior-preserving unless the user explicitly wants a visual change.
- [ ] Flag any function, helper, or selector name that is ambiguous, overloaded, or feature-blurred as a rename candidate so the final code reads as simple, obvious, and consistently scoped to where it operates.
- [ ] Preserve IIFEs and intentional `window` bridging, but require those bridges to be named and grouped.
- [ ] Prefer stable selectors, shared selector modules, and shared label helpers before ad hoc DOM heuristics.
- [ ] Keep helper names action-led and one-purpose: find, open, click, resolve, persist, or render.

## Audit order

- [x] First audit `extension/content.js:12599-14287`, the model selector toggle and shortcuts overlay blocks, because they own the largest orchestration path and the highest concentration of `window` bridging.
- [ ] Second audit `extension/content.js:1726-1761` and `extension/content.js:3128-3197`, because those duplicated helper families are the clearest candidates for canonical helpers or shared local reuse.
- [ ] Third audit `extension/content.js:1307-1393` and `extension/content.js:1142-1160`, because those shared visual cue and animation helpers are small enough to normalize safely but must keep timing and cues intact.
- [ ] Fourth audit the nearby feature blocks that consume those helpers, starting with `extension/content.js:6070-7175` and `extension/content.js:9292-12360`, so any renames stay consistent across runtime call sites.
- [ ] Fifth audit `extension/content.js:13518` and `extension/content.js:14029` again after the helper work, to confirm no paste markers or authoring seams remain.

## First implementation pass - model selector and overlay

### Goals

- [x] Complete the first audit-order section only: the model selector toggle at the end of the model-picker IIFE and the shortcuts overlay IIFE.
- [x] Preserve current model-picker behavior, including current single-level menus and older submenu layouts.
- [x] Preserve overlay layout, close-button placement, keyboard handling, and visual behavior.

### Detailed changes

- [x] Replace the nested helper definitions inside `window.toggleModelSelector` with named helper functions in the same model-picker IIFE:
  - `pressModelMenuKey`
  - `hoverModelMenuElement`
  - `clickModelMenuElement`
  - `waitForModelMenuOpen`
  - `openModelVersionSubmenuFromState`
- [x] Keep `window.toggleModelSelector` as the bridge export, but make it read as orchestration only: find button, wait for menu, then open submenu when available.
- [x] Remove the stale `// ====== content.js (NEW SECTION TO PASTE IN) ======` markers from the overlay IIFE.
- [x] Rename the overlay builders so their scope is obvious:
  - `buildModelSwitcherGrid` -> `buildShortcutOverlayModelPickerGrid`
  - `buildOverlayHtml` -> `buildShortcutOverlayHtml`
- [x] Reuse the overlay IIFE's existing `escapeHtml` helper instead of keeping the local `esc` duplicate inside the model-picker grid builder.
- [x] Extract small overlay helpers for model slot limit, model names, model codes, action groups, and shortcut rows so repeated fallback logic has one local source.

### Validation for this pass

- [x] Run `node --check extension/content.js`.
- [x] Run `npx biome check extension/content.js`.

## Highest-impact review areas

- [x] `extension/content.js:12599-14287` model selector and overlay block, including `window.toggleModelSelector`, `buildShortcutOverlayModelPickerGrid`, and `buildShortcutOverlayHtml`.
- [ ] `extension/content.js:1726-1761` and `extension/content.js:3128-3197` duplicate helper families for token escaping, click dispatch, visibility, and menu opening.
- [ ] `extension/content.js` global export surface around `window.applyVisibilitySettings`, `window.ShortcutUtils`, `window.DELAYS`, and `window.toggleModelSelector` needs a documented grouping convention.
- [x] `extension/content.js:13518` and `extension/content.js:14029` paste markers were removed before the refactor continued.

## Pass 1 - Helper cleanup

- [x] Remove stale paste markers and other authoring artifacts from `extension/content.js`.
- [ ] Reuse `CSPModelPickerSelectors`, `ModelLabels`, and `ShortcutUtils` before keeping any local selector or label fallback.
- [ ] Consolidate repeated helper families into one canonical helper per concern; remove weaker duplicates instead of keeping multiple equivalent entry points.
- [ ] Move a helper to `extension/shared/*` only when the same canonical helper is clearly reused across IIFEs, not just because the file is large.
- [ ] Rename confusing helpers, selectors, or bridge exports while keeping call sites consistent and obvious.
- [ ] Group related `window.*` exports into one intentionally named bridge section per feature.
- [ ] Keep behavior unchanged except for helper reuse and cleanup.

## Pass 2 - Section simplification

- [ ] Split oversized orchestration code into smaller named helpers that each do one DOM job.
- [ ] Reduce nested fallback chains in model-picker and overlay logic by extracting the chooser, opener, and clicker steps.
- [ ] Make each IIFE read as one feature module with one primary responsibility and a small set of exported hooks.
- [ ] Preserve animation and visual cue behavior exactly unless a section is explicitly being simplified for equivalent timing or wording.
- [ ] Use the canonical helper from Pass 1 everywhere a later section needs the same task, rather than creating a second feature-local version.
- [ ] Leave any remaining cross-feature globals only when a later section genuinely consumes them.

## Validation

- [ ] Run `node --check extension/content.js` after the refactor pass.
- [ ] Run `npx biome check extension/content.js`.
- [ ] Re-open the extension and smoke-test the model selector and overlay paths touched by helper cleanup.
- [ ] If selector helpers move, run the narrowest relevant focused test or manual check that exercises the changed menu path.

## Done when

- [x] The stale paste markers are gone.
- [ ] Repeated helper families are canonicalized or intentionally documented as local-only.
- [ ] The model selector and overlay area reads as a small set of named helpers instead of a single mixed-purpose block.
- [ ] Future `content.js` edits have a clear place to add shared helpers without reintroducing duplicate utility code.
