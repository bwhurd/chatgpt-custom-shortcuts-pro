# Model Picker Composer Selector Repair Plan

## Goal

- [x] Restore the `Show Model Picker` shortcut against ChatGPT's current composer-hosted model picker.
- [x] Repair the full model-picker system against the current DOM: model extraction, shortcut labels, model action execution, thinking-effort shortcuts, refresh-models scraping, selector validation, and dependent TopBarToBottom behavior.

## Investigation findings

- [x] Old opener method: `extension/content.js` expects a top/header button at `button[data-testid="model-switcher-dropdown-button"]`, then derives the open Radix menu from that button's `id` / `aria-labelledby`.
- [x] New inspector capture: the picker opener is a composer trailing pill under `[data-composer-surface="true"]`, shaped as `button.__composer-pill[aria-haspopup="menu"][id^="radix-"]`; its visible label is the current mode, such as `Extended`, and it no longer carries the old `data-testid`.
- [x] Manual confirmation: the first-batch resolver restored the `Show Model Picker` shortcut against the new composer pill.
- [x] Configure popup capture: the current configure surface is a `role="dialog"` titled `Intelligence`, with a `#model-selection-label` combobox for model choice and a separate `#thinking-effort-selection-label` combobox for thinking effort.
- [x] Model chooser listbox capture: the model combobox opens a `role="listbox"` with `role="option"` rows such as `Latest`, `5.4`, `5.3`, `5.2`, and `o3`.
- [x] Thinking effort listbox capture: Standard and Extended now live in the Configure dialog's second `role="listbox"` as `role="option"` rows, not in the older assistant thinking icon menu.
- [x] Dynamic configure slot failure from the 2026-05-08 capture:
  - The dropdown capture shows `5.4` and newly added `5.3` both labeled with the same injected hint (`Alt+7` in the capture), confirming duplicate shortcut-slot assignment after refresh.
  - `extension/content.js` assigns unique slots to dynamic configure options while scraping, but `catalog.configureOptions` currently persists only `id` and `label`, dropping the assigned `slot`.
  - `extension/shared/model-picker-labels.js` re-derives dynamic slots from option index when no slot is persisted; with `Latest`, `5.4`, `5.3`, `5.2`, `o3`, both dynamic entries can collapse onto the same slot.
  - `extension/popup.js` renders and saves model-picker shortcut inputs by `data-slot`, so duplicate slots make two visible inputs mirror the same `modelPickerKeyCodes` entry.
  - `extension/content.js` resolves runtime model shortcuts by the first action matching the assigned slot, so the shared key activates the first duplicated action (`5.4`) instead of the later one (`5.3`).
- [x] Current correction surface from targeted search:
  - `extension/content.js` model-picker runtime block: one selector constant plus seven direct resolver/dereference sites.
  - `extension/content.js` TopBarToBottom block: `SELECTORS.MODEL_SWITCHER_BUTTON` still identifies only the old header/top-bar button.
  - `extension/shared/shortcut-action-metadata.js`: `model-switcher-button` still maps only to the old `data-testid`.
  - `extension/content.js` thinking shortcut handlers still use the old icon-path flow at `shortcutKeyThinkingStandard` / `shortcutKeyThinkingExtended`.
  - `extension/content.js` model-catalog scrape has a preserved but unwired `collectThinkingEffortIdsDuringScrape()` helper that still expects a `role="menu"` / `role="menuitemradio"` thinking menu.
  - `extension/content.js` hinting and name extraction still center on open Radix model menus via `getVisibleModelMenuState()`, `applyHints()`, `__cspCollectModelNamesN()`, and `__cspSaveModelNames()`.
  - `extension/popup.js` refresh flow already routes through `triggerManualCatalogRefresh()` -> `window.__startModelCatalogScrape()` -> `CSP_SCRAPE_MODEL_CATALOG`, so content-side catalog scraping is the key repair point.
  - `extension/lib/DevScrapeWide.js` and `tests/playwright/lib/devscrape-wide-core.mjs`: `open-model-switcher-menu` still opens only the old `data-testid` button.
  - Playwright profiler/scenario helpers and captured fixtures still contain the old selector; update only the live validation paths that still execute.

## Scope

- [x] First batch: touch only the `Show Model Picker` opener path in `extension/content.js` so manual testing can confirm that `/` opens the picker again.
- [x] Next batch may touch `extension/content.js`, `extension/shared/model-picker-labels.js`, `extension/shared/shortcut-action-metadata.js`, `extension/lib/DevScrapeWide.js`, `tests/playwright/lib/devscrape-wide-core.mjs`, and popup refresh/render code only where the catalog contract requires it.
- [x] Keep popup storage keys and default shortcut values stable unless the repair proves a migration is required.
- [x] Do not add permissions or rely on localized visible text for the new selector.

## Implementation batches

- [x] Add a small runtime model-picker button resolver that prefers visible matches and supports both:
  - old: `button[data-testid="model-switcher-dropdown-button"]`
  - new: `[data-composer-surface="true"] button.__composer-pill[aria-haspopup="menu"][id^="radix-"]`
- [x] Replace direct `document.querySelector(MENU_BTN_SELECTOR)` reads in the runtime model-picker block with the resolver.
- [x] Keep the existing menu-state helpers intact for this batch, but let `window.toggleModelSelector()` treat an expanded opener as a successful open state so the shortcut is not blocked by stale menu-item detection.
- [x] Promote the confirmed resolver pattern to all cleanup/validation entry points:
  - `extension/content.js` TopBarToBottom model button detection.
  - `extension/shared/shortcut-action-metadata.js` `model-switcher-button` target metadata.
  - DevScrape browser/runtime open steps in `extension/lib/DevScrapeWide.js` and `tests/playwright/lib/devscrape-wide-core.mjs`.
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
- [x] Add the new model-selector thinking-effort submenu route:
  - Keep the Configure-dialog thinking-effort route and old icon-token fallback intact.
  - Detect the composer model selector's `data-model-picker-thinking-effort-action` trailing button and right-side menu of `menuitemradio` options.
  - Let refresh collect Standard/Extended from either Configure dialog or the model-selector submenu.
  - Route `shortcutKeyThinkingStandard` and `shortcutKeyThinkingExtended` to the model-selector submenu when present, then fall back to Configure and old icon paths.
  - Add shortcut hinting and runtime validation metadata for the new submenu without relying on the old assistant icon target.
- [x] Repair shortcut labeling beyond the opener:
  - Primary model menu rows are still labeled with `modelPickerKeyCodes`.
  - Configure model options are labeled with their configured model-picker slots when their listbox is open.
  - Thinking effort options are labeled with `shortcutKeyThinkingStandard`, `shortcutKeyThinkingExtended`, and optional Light/Heavy shortcuts when their listbox is open.
  - Labels remain decorative only; extension-injected label text is not used as a selector source.
- [x] Finish the Refresh Models flow end to end:
  - Popup entry points (`mp-refresh-models-button`, loading overlay prompt, `triggerManualCatalogRefresh()`) are unchanged.
  - The content scrape behind `CSP_SCRAPE_MODEL_CATALOG` now captures configure options, frontend rows, thinking-effort options, `activeModelConfigId`, `modelCatalog`, and derived `modelNames`.
  - The scrape restores the initial configure selection and frontend row when possible after collecting thinking-effort availability.
  - Failed refreshes keep using the existing retry prompt path.
  - Persist each scraped configure option's canonical `slot` in `modelCatalog.configureOptions` before deriving `modelNames`.
  - Keep `modelNames` derivation slot-based, and ensure it consumes persisted slots instead of re-deriving dynamic slots from list position.
  - In `extension/shared/model-picker-labels.js`, preserve valid catalog `option.slot` values and add a uniqueness fallback so catalog-driven configure actions cannot silently reuse a dynamic slot.
  - In `extension/popup.js`, keep `normalizeModelCatalog()` strict about valid slot numbers and guard against duplicate `data-slot` rendering from catalog options.
  - Preserve existing static slots for `Latest`, `5.2`, `5.0`, and `o3`; do not migrate user shortcut storage unless validation proves a one-time cleanup is required for already-bad duplicated catalogs.
- [x] Cleanup after manual runtime confirmation:
  - Centralize the model-picker opener selectors so `extension/content.js`, DevScrape Playwright open steps, and shortcut target metadata consume the same source instead of drifting.
  - Add or update capture steps for the composer picker opener, Configure dialog, and model chooser listbox.
  - Replace old assistant-thinking option target metadata with the current Configure/model-selector routes, while keeping old icon-token activation as a last fallback.
  - Keep old fixtures only as historical references; do not make validators depend on stale `model-switcher-dropdown-button` presence.
  - Keep the tray/controller scripts thin; they should keep delegating to `run-devscrape-validation.ps1 -ProbeShortcuts` and only need syntax or process-lifetime repairs if validation exposes them.

## Validation

- [x] Run `node --check extension/content.js` after the first-batch patch.
- [x] Run `npx biome check extension/content.js plans/0048-model-picker-composer-selector-repair-plan.md`.
- [x] Ask for manual validation on ChatGPT with TopBarToBottom enabled: press the configured `Show Model Picker` shortcut (`/` by default) and confirm the composer pill opens the model picker.
- [x] After the functional repair, run `node --check extension/content.js`, `node --check extension/popup.js`, and `node --check extension/shared/model-picker-labels.js`.
- [x] Run `node tests/validate-keys.js`; legacy `shortcutKeyStudy` and `shortcutKeyThinkLonger` fixture coverage is now explicit supplemental/deprecated shortcut coverage.
- [x] Run the targeted Playwright/AHK validator paths that cover model switcher, Configure dialog, model chooser listbox, and thinking-effort routing.
- [x] Add or run a deterministic check for catalog slot uniqueness using a configure option list like `Latest`, `5.4`, `5.3`, `5.2`, `o3`; assert popup presentation groups have unique slots and unique default key assignments for each visible configure option.
- [x] Add and run a deterministic fixture check for the new model-selector thinking-effort submenu; assert the trailing action selector opens a menu whose direct option rows are `Standard` and `Extended`.
- [x] Extend the deterministic thinking-effort submenu fixture to include Pro-only `Light` and `Heavy`; assert generic submenu selectors plus `ModelLabels` normalize all four options.
- [x] Run shortcut metadata and DevScrape contract loading checks that cover the new `model-switcher-thinking-effort-menu` dump path.
- [x] Run `node tests/playwright/devscrape-wide.mjs --action validate-wide --probe-shortcuts`; the run captured `2d_ModelSwitcher_ThinkingEffort_Submenu.txt` with `Standard` and `Extended`, had no missing artifacts or inventory issues, and passed the `shortcutKeyToggleModelSelector` live probe. Residual validator noise: `shortcutKeyToggleSidebar` failed and several live probes could not use temporary assignments because the extension popup storage page was blocked.
- [x] Manually confirm after refresh: `5.4` and `5.3` show different shortcut values in the popup and Configure Models dropdown, editing one no longer edits the other, and the key assigned to `5.3` activates `5.3`.
- [x] Manually confirm: `Alt+8` selects Thinking Standard and `Alt+9` selects Thinking Extended from the model selector submenu when that route is present.
- [x] Run PowerShell syntax checks for materially edited tray/controller scripts before launch.
- [x] Manually confirm: `Show Model Picker`, model slot selection, Configure model shortcuts, Standard/Extended thinking shortcuts, shortcut labels on visible menus, and popup `Refresh Models`.

## Done when

- [x] Refreshed dynamic configure options have stable, unique slots in `modelCatalog.configureOptions`, `modelNames`, popup grid rows, injected dropdown hints, and runtime shortcut activation.
- [x] Existing user-assigned model shortcuts are preserved unless they only match the old default sequence and need reseeding for the new unique slot layout.

## Related specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] `specs/0006-runtime-scrape-selector-validator-spec.md`
