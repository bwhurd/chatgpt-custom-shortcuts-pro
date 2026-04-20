# Plan: Model Selector Menu Robustness

## Goal

- Make model-selector labels and keyboard selection work after both:
  - a full page reload
  - a sidebar conversation switch
- Remove the new long pause before the final model click.
- Keep support for both current single-menu HTML and older main-menu-plus-submenu HTML.

## Critical Findings

- `content.js` has two different model-menu detectors, and they do not agree.
- `window.toggleModelSelector()` recognizes the current lowercase ChatGPT ids like `data-testid="model-switcher-gpt-5-3"` (`content.js:6887-6907`).
- The label/hotkey IIFE uses `isPrimaryModelMenu()` / `getOpenModelMenus()`, but that detector only checks the old mixed-case selector `[data-testid^="Model-switCher-"]`, GPT-style headers, or an `aria-labelledby === trigger.id` fallback (`content.js:6349-6386`).
- Your current reload HTML has:
  - lowercase `data-testid="model-switcher-*"`
  - header text `Latest`
  - no legacy submenu trigger
- That means the menu can open successfully via `toggleModelSelector()`, while the label/hotkey code still fails to recognize the same open menu. When that happens, hints are not applied and the target row list is empty, so the shortcut opens the menu but does not select anything.

- The delay is caused by the keydown path always waiting for a second menu.
- In the hotkey flow, `openBothMenus()` calls `window.toggleModelSelector()` and then polls until `getOpenModelMenus().length > 1`, with a hard timeout of about `60 * 30ms ~= 1.8s` (`content.js:6770-6789`).
- Your current working HTML is a single-level menu with `Instant`, `Thinking`, and `Configure...`; there is no submenu trigger.
- So when detection succeeds, the code still waits out that full submenu timeout before continuing, then waits another `DELAY_ACTIVATE_TARGET_MS = 375ms` before the final click (`content.js:6231`, `content.js:6801-6804`).
- That is the new sluggishness you are seeing.

## Plan

### Phase 1: Unify model-menu detection

- Replace the split detection logic with one shared helper used by both:
  - label application / hotkey selection
  - `window.toggleModelSelector()`
- Make the primary detection row-based, not header-based:
  - current ids: `data-testid^="model-switcher-"`
  - legacy ids/casing if still present
  - `data-testid="model-configure-modal"`
  - submenu triggers only as an optional extension, not a requirement
- Keep `aria-labelledby` and text/header checks only as fallback signals, not the main detector.

### Phase 2: Unify row extraction

- Build one helper that returns the visible actionable rows in shortcut order.
- For single-level menus:
  - return main rows directly (`Instant`, `Thinking`, `Configure...`, etc.)
- For legacy submenu layouts:
  - return main actionable rows first
  - skip the submenu trigger itself
  - append submenu rows only when that submenu is actually open
- Reuse the shared `window.ModelLabels` helpers for text cleanup and canonicalization so storage scraping and popup labels stay aligned.

### Phase 3: Fix label application

- Make `applyHints()` operate on the unified visible-row helper instead of the old `getOpenModelMenus()` assumptions.
- Run hint application after:
  - main menu open
  - submenu open, if one exists
  - relevant menu mount/unmount mutations
  - `modelPickerKeyCodes` storage updates
- Scope label removal/application to the current model-selector rows so the logic is not relying on stale global state.

### Phase 4: Fix hotkey selection timing

- Replace `openBothMenus()` with a target-driven flow:
  - open the main menu
  - read visible actionable rows immediately
  - if the requested index is already visible, click it immediately after the small visual-feedback delay
  - only try to open a submenu if:
    - a submenu trigger actually exists, and
    - the requested index is beyond the currently visible rows
- If no submenu trigger exists, do not poll for a second menu.
- Keep the visual flash behavior, but the large wait should disappear once the unnecessary submenu polling is removed.

### Phase 5: Keep model-name persistence working

- Preserve the current model-name scraping behavior, but make it use the same unified row/menu state.
- A single-level menu should count as complete immediately.
- A submenu layout should remain partial until submenu rows are actually available, so existing merge behavior for `modelNames` stays intact.

### Phase 6: Validation

- Manual checks after implementation:
  - reload current conversation, open model selector: labels should appear
  - reload current conversation, press assigned model shortcut: menu opens and target is pressed without the long pause
  - switch conversations from the sidebar, repeat the same checks
  - verify `Configure...` still receives its label and shortcut
  - verify any legacy submenu layout still works if ChatGPT serves it on another account/session
- Repo checks after code edits:
  - run `npm test`
  - if popup-facing changes are touched, also run the popup validation flow from `AGENTS.md`

## Implementation Order

1. Refactor the model-selector helpers in `content.js` so menu detection and row extraction are shared.
2. Update label application to use the shared row extractor.
3. Replace the unconditional two-menu wait with target-driven submenu opening.
4. Retest the two failure scenarios from your notes first, then broader regression checks.
