# Model Picker Composer Selector Repair Plan

## Goal

- [x] Restore the `Show Model Picker` shortcut against ChatGPT's current composer-hosted model picker.
- [ ] Repair the full model-picker system against the current DOM: model extraction, shortcut labels, model action execution, thinking-effort shortcuts, refresh-models scraping, selector validation, and dependent TopBarToBottom behavior.

## Investigation findings

- [x] Old opener method: `extension/content.js` expects a top/header button at `button[data-testid="model-switcher-dropdown-button"]`, then derives the open Radix menu from that button's `id` / `aria-labelledby`.
- [x] New inspector capture: the picker opener is a composer trailing pill under `[data-composer-surface="true"]`, shaped as `button.__composer-pill[aria-haspopup="menu"][id^="radix-"]`; its visible label is the current mode, such as `Extended`, and it no longer carries the old `data-testid`.
- [x] Manual confirmation: the first-batch resolver restored the `Show Model Picker` shortcut against the new composer pill.
- [x] Configure popup capture: the current configure surface is a `role="dialog"` titled `Intelligence`, with a `#model-selection-label` combobox for model choice and a separate `#thinking-effort-selection-label` combobox for thinking effort.
- [x] Model chooser listbox capture: the model combobox opens a `role="listbox"` with `role="option"` rows such as `Latest`, `5.4`, `5.2`, and `o3`.
- [x] Thinking effort listbox capture: Standard and Extended now live in the Configure dialog's second `role="listbox"` as `role="option"` rows, not in the older assistant thinking icon menu.
- [x] Current correction surface from targeted search:
  - `extension/content.js` model-picker runtime block: one selector constant plus seven direct resolver/dereference sites.
  - `extension/content.js` TopBarToBottom block: `SELECTORS.MODEL_SWITCHER_BUTTON` still identifies only the old header/top-bar button.
  - `extension/shared/shortcut-action-metadata.js`: `model-switcher-button` still maps only to the old `data-testid`.
  - `extension/content.js` thinking shortcut handlers still use the old icon-path flow at `shortcutKeyThinkingStandard` / `shortcutKeyThinkingExtended`.
  - `extension/content.js` model-catalog scrape has a preserved but unwired `collectThinkingEffortIdsDuringScrape()` helper that still expects a `role="menu"` / `role="menuitemradio"` thinking menu.
  - `extension/content.js` hinting and name extraction still center on open Radix model menus via `getVisibleModelMenuState()`, `applyHints()`, `__cspCollectModelNamesN()`, and `__cspSaveModelNames()`.
  - `extension/popup.js` refresh flow already routes through `triggerManualCatalogRefresh()` -> `window.__startModelCatalogScrape()` -> `CSP_SCRAPE_MODEL_CATALOG`, so content-side catalog scraping is the key repair point.
  - `extension/lib/DevScrapeWide.js`, `tests/tampermonkey-dev-scrape/chatgpt-devscrape-wide.user.js`, and `tests/playwright/lib/devscrape-wide-core.mjs`: `open-model-switcher-menu` still opens only the old `data-testid` button.
  - Playwright profiler/scenario helpers and captured fixtures still contain the old selector; update only the live validation paths that still execute.

## Scope

- [x] First batch: touch only the `Show Model Picker` opener path in `extension/content.js` so manual testing can confirm that `/` opens the picker again.
- [ ] Next batch may touch `extension/content.js`, `extension/shared/model-picker-labels.js`, `extension/shared/shortcut-action-metadata.js`, `extension/lib/DevScrapeWide.js`, `tests/tampermonkey-dev-scrape/chatgpt-devscrape-wide.user.js`, `tests/playwright/lib/devscrape-wide-core.mjs`, and popup refresh/render code only where the catalog contract requires it.
- [ ] Keep popup storage keys and default shortcut values stable unless the repair proves a migration is required.
- [ ] Do not add permissions or rely on localized visible text for the new selector.

## Implementation batches

- [x] Add a small runtime model-picker button resolver that prefers visible matches and supports both:
  - old: `button[data-testid="model-switcher-dropdown-button"]`
  - new: `[data-composer-surface="true"] button.__composer-pill[aria-haspopup="menu"][id^="radix-"]`
- [x] Replace direct `document.querySelector(MENU_BTN_SELECTOR)` reads in the runtime model-picker block with the resolver.
- [x] Keep the existing menu-state helpers intact for this batch, but let `window.toggleModelSelector()` treat an expanded opener as a successful open state so the shortcut is not blocked by stale menu-item detection.
- [ ] Promote the confirmed resolver pattern to all cleanup/validation entry points:
  - `extension/content.js` TopBarToBottom model button detection.
  - `extension/shared/shortcut-action-metadata.js` `model-switcher-button` target metadata.
  - DevScrape browser/runtime open steps in `extension/lib/DevScrapeWide.js`, `tests/tampermonkey-dev-scrape/chatgpt-devscrape-wide.user.js`, and `tests/playwright/lib/devscrape-wide-core.mjs`.
- [x] Repair top-level model-menu state and shortcut hinting:
  - Direct model menu items now include current direct `role="radio"` rows plus legacy Radix `menuitem*` rows.
  - Older `data-testid` and submenu paths remain as fallbacks.
  - `applyHints()` and `primaryHintsAlreadyApplied()` now tolerate listbox labels without removing or miscounting primary menu labels.
  - Live name extraction still persists flat `modelNames` through the existing `__cspCollectModelNamesN()` / `__cspSaveModelNames()` path.
- [x] Repair Configure dialog model extraction:
  - Configure dialog entry uses `data-testid="model-configure-modal"` when present, with a fallback resolver inside open model menus.
  - `#model-selection-label` plus `button[role="combobox"][aria-controls]` opens the model chooser.
  - The controlled `role="listbox"` / `role="option"` rows are scraped for configure options (`Latest`, `5.4`, `5.2`, `o3` in the provided capture).
  - `5.4` stays on the existing dynamic configure-option path for this pass; no storage migration or canonical slot reshuffle yet.
  - `deriveFlatModelNamesFromCatalog()` and popup grouped rendering stay aligned with scraped `configureOptions`.
- [x] Move thinking-effort extraction and shortcuts to the Configure dialog:
  - `shortcutKeyThinkingStandard`, `shortcutKeyThinkingExtended`, and optional Light/Heavy handlers try the Configure-dialog action path first, with old icon-token behavior retained as fallback.
  - The thinking effort combobox is resolved by `#thinking-effort-selection-label`, then its controlled `role="listbox"` option is activated by normalized effort id.
  - `collectThinkingEffortIdsDuringScrape()` now scrapes that listbox instead of a `role="menu"` with `role="menuitemradio"` items.
  - `thinkingEffortIds` is persisted in `modelCatalog` so popup visibility and default seeding for thinking-effort shortcuts are based on the current account surface.
  - `Light` and `Heavy` remain optional and hidden unless the scraped listbox exposes them.
- [x] Repair shortcut labeling beyond the opener:
  - Primary model menu rows are still labeled with `modelPickerKeyCodes`.
  - Configure model options are labeled with their configured model-picker slots when their listbox is open.
  - Thinking effort options are labeled with `shortcutKeyThinkingStandard`, `shortcutKeyThinkingExtended`, and optional Light/Heavy shortcuts when their listbox is open.
  - Labels remain decorative only; extension-injected label text is not used as a selector source.
- [x] Repair the Refresh Models flow end to end:
  - Popup entry points (`mp-refresh-models-button`, loading overlay prompt, `triggerManualCatalogRefresh()`) are unchanged.
  - The content scrape behind `CSP_SCRAPE_MODEL_CATALOG` now captures configure options, frontend rows, thinking-effort options, `activeModelConfigId`, `modelCatalog`, and derived `modelNames`.
  - The scrape restores the initial configure selection and frontend row when possible after collecting thinking-effort availability.
  - Failed refreshes keep using the existing retry prompt path.
- [ ] Cleanup after manual runtime confirmation:
  - Add or update capture steps for the composer picker opener, Configure dialog, model chooser listbox, and thinking-effort listbox.
  - Replace old assistant-thinking option target metadata with Configure-dialog thinking-effort refs.
  - Keep old fixtures only as historical references; do not make validators depend on stale `model-switcher-dropdown-button` presence.

## Validation

- [x] Run `node --check extension/content.js` after the first-batch patch.
- [x] Run `npx biome check extension/content.js plans/0048-model-picker-composer-selector-repair-plan.md`.
- [x] Ask for manual validation on ChatGPT with TopBarToBottom enabled: press the configured `Show Model Picker` shortcut (`/` by default) and confirm the composer pill opens the model picker.
- [x] After the functional repair, run `node --check extension/content.js`, `node --check extension/popup.js`, and `node --check extension/shared/model-picker-labels.js`.
- [ ] `node tests/validate-keys.js` currently fails on pre-existing fixture inventory drift for `shortcutKeyStudy` and `shortcutKeyThinkLonger`; leave for cleanup unless it blocks the runtime confirmation.
- [ ] Run the targeted DevScrape / runtime selector validator paths that cover model switcher, Configure dialog, model chooser listbox, and thinking-effort listbox captures.
- [ ] Manually confirm: `Show Model Picker`, model slot selection, Configure model shortcuts, Standard/Extended thinking shortcuts, shortcut labels on visible menus, and popup `Refresh Models`.

## Related specs

- [ ] `specs/0004-model-picker-and-shortcuts-spec.md`
- [ ] `specs/0006-runtime-scrape-selector-validator-spec.md`
