# Content.js Maintainability Refactor Completed Passes

## Archive note

- [x] Archived from `plans/0064-contentjs-maintainability-refactor-plan.md` on 2026-06-14 so the active plan keeps only remaining work.
- [x] Work stayed scoped to `extension/content.js` and the active plan unless noted by later passes.

## Completed investigation findings

- [x] Two stale authoring markers were shipped in the runtime file at `extension/content.js:13518` and `extension/content.js:14029`; the first implementation pass removed them.
- [x] The same helper family was defined in multiple distant sections; the second implementation pass canonicalized equivalent token, selector, and click helpers, and kept different visibility/open-menu variants local because their behavior differs.
- [x] `window.toggleModelSelector` was a large orchestration block with nested local helpers for key events, hover/click fallback, and submenu recovery; the first implementation pass moved those helpers into named local functions.
- [x] Visual cue and runtime bridge helpers are intentionally cross-cutting; the third implementation pass made exports and local variants clearly named instead of moving feature-specific references far away from their owners.

## Completed audit order

- [x] First audit `extension/content.js:12599-14287`, the model selector toggle and shortcuts overlay blocks.
- [x] Second audit `extension/content.js:1726-1761` and `extension/content.js:3128-3197`, the duplicated helper families for token escaping, click dispatch, visibility, and menu opening.
- [x] Third audit `extension/content.js:1307-1393` and `extension/content.js:1142-1160`, the visual cue and animation bridge helpers.

## First implementation pass - model selector and overlay

### Goals

- [x] Completed the model selector toggle at the end of the model-picker IIFE and the shortcuts overlay IIFE.
- [x] Preserved current model-picker behavior, including current single-level menus and older submenu layouts.
- [x] Preserved overlay layout, close-button placement, keyboard handling, and visual behavior.

### Detailed changes

- [x] Replaced nested helper definitions inside `window.toggleModelSelector` with named helper functions in the same model-picker IIFE:
  - `pressModelMenuKey`
  - `hoverModelMenuElement`
  - `clickModelMenuElement`
  - `waitForModelMenuOpen`
  - `openModelVersionSubmenuFromState`
- [x] Kept `window.toggleModelSelector` as the bridge export, but made it read as orchestration only.
- [x] Removed stale `// ====== content.js (NEW SECTION TO PASTE IN) ======` markers from the overlay IIFE.
- [x] Renamed overlay builders so their scope is obvious:
  - `buildModelSwitcherGrid` -> `buildShortcutOverlayModelPickerGrid`
  - `buildOverlayHtml` -> `buildShortcutOverlayHtml`
- [x] Reused the overlay IIFE's existing `escapeHtml` helper instead of keeping a local `esc` duplicate inside the model-picker grid builder.
- [x] Extracted overlay helpers for model slot limit, model names, model codes, action groups, and shortcut rows.

### Validation

- [x] Ran `node --check extension/content.js`.
- [x] Ran `npx biome check extension/content.js`.

## Second implementation pass - menu helper canonicalization

### Goals

- [x] Completed the duplicated menu helper families around `extension/content.js:1726-1761` and `extension/content.js:3128-3197`.
- [x] Preserved menu timing, flash behavior, Radix open behavior, and click behavior.
- [x] Made the duplicate helper decision explicit: canonicalize equivalent helpers, keep visibility local where behavior differs.

### Detailed changes

- [x] Added one shared helper block before the menu utility IIFEs for:
  - icon-token array normalization
  - CSS selector escaping
  - SVG `path[d^=...]` / `use[href*=...]` selector construction
  - synthetic pointer/mouse click dispatch
- [x] Replaced the Custom GPT menu utility's local `toTokenArray`, `safeEsc`, `svgSelectorForTokensLocal`, and `smartClick` implementations with shared helpers.
- [x] Replaced the main IIFE's local `smartClick`, `safeEsc`, `toTokenArray`, `svgSelectorForTokens`, and related icon selector duplication with shared-helper aliases.
- [x] Kept the Custom GPT visibility helper local and renamed it to show it accepts partly visible elements above the composer.
- [x] Kept the lowest-menu visibility helper local because it intentionally requires full viewport containment.
- [x] Kept the two `openRadixMenuIfNeeded` implementations local because one pointer-clicks non-button menu triggers and the other uses Space for lowest visible Radix buttons.

### Validation

- [x] Ran `node --check extension/content.js`.
- [x] Ran `npx biome check extension/content.js`.

## Third implementation pass - visual cue and bridge traceability

### Goals

- [x] Completed visual cue helpers, global runtime bridge exports, and overloaded local visibility helpers.
- [x] Preserved flash, fade, opacity, delay, GSAP, and sidebar animation behavior.
- [x] Kept references human-traceable by clarifying nearby helper/export ownership instead of moving feature-specific helpers thousands of lines away.
- [x] Did not collapse helpers with similar names when they encode different visibility rules or menu behavior.

### Detailed changes

- [x] Documented `window.applyVisibilitySettings`, slim-sidebar bridge helpers, `window.ShortcutUtils`, `window.DELAYS`, and `window.delays` as intentional runtime bridges.
- [x] Documented the early slim-sidebar fallback versus the later feature-owned `window.flashSlimSidebarBar` override so the two implementations are not mistaken for duplicate helpers.
- [x] Kept `flashBorder` as the canonical GSAP visual cue helper and left its timeline, easing, scale, and shadow values unchanged.
- [x] Renamed local visual/visibility helpers with behavior-specific names:
  - Custom GPT `callFlash` -> `flashCustomGptMenuCue`
  - Main menu `isVisible` -> `isFullyVisibleAboveComposer`
  - Edit-send-button `isVisible` -> `isEligibleEditSendButton`
  - Slim-sidebar overlay `isVisible` -> `hasVisibleComputedStyle`
- [x] Added nearby comments where same-purpose-looking helpers intentionally differ.

### Validation

- [x] Ran `node --check extension/content.js`.
- [x] Ran `npx biome check extension/content.js`.

## Fourth implementation pass - model-picker shared source reuse

### Goals

- [x] Completed content-side model-picker selector, label, shortcut-code reuse, and nearby call-site cleanup.
- [x] Preserved model switching, thinking-effort shortcuts, Configure Models routing, catalog scraping, shortcut interception, and overlay parity behavior.
- [x] Preferred `CSPModelPickerSelectors`, `ModelLabels`, and `ShortcutUtils` before content-local fallback logic.
- [x] Kept feature-specific fallback logic local where shared helpers do not cover the behavior.

### Detailed changes

- [x] Archived completed plan items out of the active plan and kept remaining work in `plans/0064-contentjs-maintainability-refactor-plan.md`.
- [x] Added `getModelPickerAssignedIndexForDigit` so the keydown path uses `ShortcutUtils.getModelPickerCodesCache` and `ShortcutUtils.codeEquals` through one traceable helper.
- [x] Added local model-picker constants sourced from `CSPModelPickerSelectors` for Configure Models menu items, dialog selectors, and label IDs.
- [x] Routed model-menu button visibility and open-model-menu candidate detection through `CSPModelPickerSelectors` helpers first, with behavior-preserving local fallbacks.
- [x] Replaced hardcoded Configure Models selector and label-id literals in the model-picker IIFE with the shared-selector-backed constants.
- [x] Removed the now-unused `findMainItemByTestId` helper after Configure Models lookup moved to the shared selector constant.
- [x] Left generic Radix menu scanning local because it still owns nested model-version submenu behavior not covered by `CSPModelPickerSelectors.getOpenModelMenuCandidates`.

### Validation

- [x] Ran `node --check extension/content.js`.
- [x] Ran `npx biome check extension/content.js`.
- [x] Ran `node tests/model-picker-slot-uniqueness.mjs`.
- [x] Ran `node tests/model-picker-thinking-effort-menu-fixture.mjs`.
