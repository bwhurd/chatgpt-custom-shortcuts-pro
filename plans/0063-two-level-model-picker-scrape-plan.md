# Two-Level Model Picker Scrape Plan

## Goal

- [x] Phase 1: make the popup `Refresh Models` button hydrate the new two-row model picker data from the current ChatGPT composer picker.
- [x] Populate the first popup row from the first-level integrated options (`Instant`, `Medium`, `High`, varying by selected model) and the second popup row from the second-level model list (`5.5`, `5.4`, `5.3`, `o3`, etc.).
- [x] Keep persisted `modelCatalog`, `modelNames`, and popup rendering contracts stable enough for manual testing before shortcut activation is updated.

## Investigation findings

- [x] The new first-level scrape is `data-testid="composer-intelligence-picker-content"` inside the same open Radix menu shape already used by the extension.
- [x] The first-level menu contains thinking effort radio rows (`Instant`, `Medium`, `High`) and one submenu trigger row with `aria-haspopup="menu"` / `data-has-submenu` for `GPT-5.5`.
- [x] The new second-level scrape is a sibling open Radix `role="menu"` controlled by that submenu trigger and contains model `menuitemradio` rows such as `5.5`, `5.4`, `5.3`, and `o3`.
- [x] First-level options are model-dependent: examples from manual observation are `5.3` only exposes `Instant`, and `o3` only exposes `Medium`.
- [x] Current refresh logic in `extension/content.js` still requires `data-testid="model-configure-modal"`, opens a configure dialog/listbox, and derives `configureOptions` plus `frontendByConfig` from that dialog.
- [x] Current `window.toggleModelSelector` opens the main menu and forces a legacy submenu, which is close to the new interaction but still has old naming and old menu detection assumptions.
- [ ] Devscrape/manual capture registry still includes configure-dialog captures that are no longer present in the current ChatGPT UI.

## Scope

- [ ] Touch only model-picker selector, scrape, action, devscrape, and focused test files unless validation exposes a direct dependency.
- [ ] Preserve the persisted `modelCatalog.configureOptions`, `modelCatalog.frontendByConfig`, `modelNames`, and `activeModelConfigId` contracts so popup and overlay rendering continue to use shared metadata.
- [ ] Keep older configure-dialog helper functions as fallback where cheap and already isolated, but stop requiring that route for the current refresh flow.
- [ ] Do not change Chrome permissions, shortcut storage shape, or model-picker slot count.
- [ ] Do not complete runtime shortcut activation in phase 1; prove refresh and popup row hydration first.

## Likely owning files

- [ ] `extension/content.js` owns runtime menu detection, model scrape refresh, shortcut activation, and hint application.
- [ ] `extension/shared/model-picker-selectors.js` owns shared opener/menu match groups used by content, metadata, and Playwright devscrape.
- [ ] `extension/shared/model-picker-labels.js` owns catalog action mapping, slot preservation, and active-config inference.
- [ ] `extension/lib/DevScrapeWide.js` and `tests/playwright/lib/devscrape-wide-core.mjs` own manual/dev scrape captures for the model-picker UI.
- [ ] `tests/model-picker-slot-uniqueness.mjs` or a nearby focused fixture test should cover the new second-level menu catalog mapping.

## Implementation plan

- [x] Add selectors/helpers for the composer intelligence menu and its model submenu trigger:
  - Recognize `data-testid="composer-intelligence-picker-content"` as the current primary model menu.
  - Recognize visible first-level `aria-haspopup="menu"` / `data-has-submenu` rows as model submenu triggers even without `data-testid`.
  - Recognize second-level Radix menus controlled by that trigger as model submenu menus even without `data-testid`.
- [x] Build a current-UI catalog refresh path:
  - Open the composer pill menu.
  - Open the second-level model submenu.
  - Convert second-level `menuitemradio` labels into stored `configureOptions` using current `ModelLabels.getCatalogModelNameActionForLabel` / `getModelNameActionForLabel` slot rules.
  - Treat the highest numeric visible model label as `configure-latest` (`5.6` beats `5.5` even if it is not first); fall back to the old first-option rule only when no numeric model labels are present.
  - Select each available second-level model row and rescan the first-level menu to collect that model's available `Instant` / `Medium` / `High` options into `frontendByConfig[modelAction.id]`.
  - Persist `modelCatalog`, `modelNames`, and `activeModelConfigId` through the existing storage keys.
  - Current code naming uses `modelName` for the second-level pick-model path and `effort` for first-level rows; persisted `configureOptions`, `configure-*` action IDs, and legacy configure-dialog helpers remain for compatibility.
- [x] Update popup presentation:
  - Render catalog-backed first-row options from `frontendByConfig[activeModelConfigId]`.
  - Render catalog-backed second-row options from `configureOptions`.
  - Stale model rows are removed on refresh because popup groups are rebuilt from the normalized current `modelCatalog.configureOptions`; missing model names have no rendered row or action after the refresh catalog replaces `window.__modelCatalog`.
  - Hide or bypass the old separate effort row when the catalog marks first-level effort as integrated.
  - Remove the old `Configure` fallback from the integrated first row; `5.5` falls back to `Instant`, `Medium`, `High` if live row capture misses.
  - Done for manual retest: first-load and no-catalog fallback names/key defaults now mirror the live scraped two-level catalog (`Instant`, `Medium`, `High`; `5.5`, `5.4`, `5.3`, `o3`) and ignore stale stored `Thinking` / `Configure...` / `Latest` labels.
- [x] Leave shortcut activation follow-up explicit:
  - Later: first-row shortcut actions should select the visible first-level option for the active model.
  - Done for manual test: second-row shortcut actions select the matching second-level model row directly before falling back to the old Configure dialog path.
- [x] Label the second-level model menu:
  - Apply popup-assigned slot labels to visible second-level model rows.
  - Keep active model config in sync when second-level model rows are clicked manually or by shortcut.
- [x] Add integrated effort fallback behavior:
  - If the active model does not expose a requested baseline effort (`Instant`, `Medium`, `High`), route the shortcut through the default/latest model and then select that effort there.
  - Current expected behavior: `o3 + Instant` and `o3 + High` switch to `5.5` with the requested effort; `o3 + Medium` stays on `o3`; `5.4` keeps all three effort shortcuts in-model.
  - Simplified runtime decision: first open the live picker for the requested effort; if that effort row is missing while other baseline effort rows are visible, treat that as “current model lacks this effort” and fall back to latest.
  - Smoothed edge-case activation: fallback resolves the latest-model slot, runs that slot through the same `runModelPickerShortcutSlot` path as a real shortcut, waits for completion, waits 100 ms, then replays the original effort slot through the same slot path with fallback recursion disabled.
  - Current fix target: preserve the original model-picker slot index and replay the slot path (`runModelPickerShortcutSlot(slot)` -> `getModelActionBySlot(slot)` -> `executeModelAction`) after the latest-model slot finishes; do not infer the active model from storage for runtime shortcut execution.
  - Fixed stale-menu interference: before replaying the source slot, clear any still-open model picker/submenu with Escape so the replay opens a fresh `5.5` effort menu instead of reading stale `o3` rows.
  - Removed missing-row timeout from the edge path: when the first open menu state proves the scraped active model lacks the requested effort, start the latest-model slot sequence immediately instead of polling for a row that cannot appear.
- [ ] Follow-up: update devscrape posture:
  - Rename or replace current model-switcher capture expectations so the required model-picker states are first-level menu and second-level model submenu.
  - Defer or remove configure-dialog capture requirements from the current validation path if the UI no longer exposes them.

## Validation

- [x] Run `npx biome check` on changed JS files.
- [x] Run `node tests/model-picker-slot-uniqueness.mjs`.
- [x] Run or add a focused fixture test proving a two-level catalog renders first-row `Instant` / `Medium` / `High` and second-row model labels.
- [x] Add/run focused fixture coverage proving a higher numeric model such as `5.6` becomes `configure-latest` even when it is not the first visible submenu row.
- [x] Add/run focused coverage for integrated catalog rendering/defaults; runtime missing-effort fallback is now live-menu driven in `content.js`.
- [x] Attached to the live Chrome/CDP target and inspected the extension isolated-world in-memory catalog; `chrome.storage.sync` had no persisted catalog in that context, so fallback defaults were set from the in-memory scraped catalog.
- [ ] Run the smallest devscrape/selector validation that covers model-picker menu states, or document why it needs a live ChatGPT session.

## Done when

- [ ] Manual model refresh succeeds against the new two-level menu without `CONFIGURE_ITEM_NOT_FOUND`.
- [x] Popup model picker renders the refreshed first two rows from shared catalog metadata.
- [x] The old separate effort row does not show for an integrated-effort catalog.
- [ ] Current model-picker devscrape states no longer fail solely because the Configure dialog route disappeared.
