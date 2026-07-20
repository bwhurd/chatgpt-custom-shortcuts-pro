# Two-Level Model Picker Scrape Plan

## Goal

- [ ] Phase 2: support ChatGPT's pill menu with separate `Model`, `Effort`, and `Speed` submenus while retaining the current integrated/two-level scraper as a fallback.
- [ ] Prove the live menu state for every exposed model, including each model's available effort and speed choices, then persist enough catalog metadata for popup and overlay parity.
- [ ] Add `Toggle Speed (Normal / Fast)` and `Reset to default` as the two far-right actions on the second six-column grid row.
- [ ] Generate pristine/fallback model-picker shortcut assignments from the same latest grouped catalog layout used to render the first and second rows.
- [x] Add a popup `Latest` / `Legacy` segmented view beside the Effort heading; route pill-menu refreshes to the Latest snapshot and integrated/two-level refreshes to the Legacy snapshot without changing either scraper.
- [x] Keep one mirrored shortcut layout across both catalog views: effort positions default to `F1`-`F5`, and model/utility positions default to `1`-`9`.
- [x] Phase 1: make the popup `Refresh Models` button hydrate the new two-row model picker data from the current ChatGPT composer picker.
- [x] Populate the first popup row from the first-level integrated options (`Instant`, `Medium`, `High`, varying by selected model) and the second popup row from the second-level model list (`5.5`, `5.4`, `5.3`, `o3`, etc.).
- [x] Keep persisted `modelCatalog`, `modelNames`, and popup rendering contracts stable enough for manual testing before shortcut activation is updated.
- [x] Add a free-account/no-model-switching refresh outcome that replaces the model shortcut grid with a short Plus/Pro prompt when the refresh flow cannot access a configurable model list.

## Investigation findings

- [x] Live Chrome inspection on 2026-07-20 found an expanded `5.6 Luna Light` composer pill whose main Radix menu contains a power slider, a native `Reset to default` menu item, and three structural submenu triggers: `Model 5.6 Luna`, `Effort Light`, and `Speed Standard`.
- [x] User manual testing confirmed on 2026-07-20 that both the pill-menu scraper and the older integrated/two-level scraper work; the remaining scope is popup profile persistence/view switching and shortcut defaults, not scraper traversal.
- [ ] Capture the complete live `Model` / `Effort` / `Speed` state matrix before locking selectors or catalog rules.
- [x] Post-refresh duplicate detection used `getModelActionSlots().length` as a contiguous array boundary even though refreshed model actions use sparse persisted slots; a displayed second-row action at slot 8, 9, or 10 could therefore be omitted from a prefix scan of `modelPickerKeyCodes`.
- [x] Live refresh on 2026-07-10 confirmed that ChatGPT now renders the first-level Instant row as `Instant` plus a separate `5.5` badge in the same `menuitemradio`; the shared extractor's `textContent` concatenated the adjacent spans as `Instant5.5`, and its older tertiary-text selector did not remove the badge, so the exact frontend-label mapper discarded Instant while still accepting `Medium` and `High`.
- [x] The new first-level scrape is `data-testid="composer-intelligence-picker-content"` inside the same open Radix menu shape already used by the extension.
- [x] The first-level menu contains thinking effort radio rows (`Instant`, `Medium`, `High`) and one submenu trigger row with `aria-haspopup="menu"` / `data-has-submenu` for `GPT-5.5`.
- [x] The new second-level scrape is a sibling open Radix `role="menu"` controlled by that submenu trigger and contains model `menuitemradio` rows such as `5.5`, `5.4`, `5.3`, and `o3`.
- [x] First-level options are model-dependent: examples from manual observation are `5.3` only exposes `Instant`, and `o3` only exposes `Medium`.
- [x] Current refresh logic in `extension/content.js` still requires `data-testid="model-configure-modal"`, opens a configure dialog/listbox, and derives `configureOptions` plus `frontendByConfig` from that dialog.
- [x] Current `window.toggleModelSelector` opens the main menu and forces a legacy submenu, which is close to the new interaction but still has old naming and old menu detection assumptions.
- [ ] Devscrape/manual capture registry still includes configure-dialog captures that are no longer present in the current ChatGPT UI.
- [x] Live check on 2026-07-05 first reached the target ChatGPT URL in a positive-control Plus state: profile text included `Brian HurdPlus` and the composer `button.__composer-pill[aria-haspopup="menu"]` was visible with `High`.
- [x] Follow-up free-session check on 2026-07-05 reached the target conversation with `mweb_fallback=1`; the shared composer-pill selector found zero visible model switcher pills.
- [x] Final free-session check on 2026-07-05 reached `https://chatgpt.com/c/6a4adb0e-6af8-83ea-9954-4602a684ec03`; profile text included `B HurdFreeUpgrade` and the shared composer-pill selector found zero visible model switcher pills.
- [x] Live monitor on the free tab later showed a visible composer `model-switcher-dropdown-button`, but its opened menu was upgrade-only (`ChatGPT Plus` / `Upgrade` / basic `ChatGPT`) and did not expose a configurable model submenu or Configure entry.
- [x] Follow-up user test still reached the generic retry prompt, which led to the message plumbing fix and then the structural no-switching detector; localized profile or upsell text no longer gates the typed no-switcher result.
- [x] Root cause for the unchanged popup state: `sendModelMessageToTab` discarded direct content-script responses unless `ok: true`, so typed `ok: false` no-switcher results could fall through to the background relay and become the generic `Open a ChatGPT tab` path.
- [x] Live 120-second watch after sending `this is codex message` proved the popup did reach the watched free ChatGPT tab: the model selector opened and showed the upgrade-only `ChatGPT Plus` menu. Added content-script debug logs and relaxed the free upgrade-only detector so it no longer requires ChatGPT's internal composer-content marker.
- [x] Language-agnostic follow-up: replaced free/upsell/profile text checks with structural detection: no Configure target, no enabled model submenu trigger, no direct model-version rows, and no open model-version submenu.
- [x] Follow-up for persistent tab-missing toast: after the refresh flow has already attempted and failed to open/read model submenu options, allow the structural no-switcher detector to ignore a dangling submenu trigger, and make the popup treat delivered model-menu scrape failures from a ChatGPT tab as no-switcher instead of tab-missing.
- [x] `extension/shared/model-picker-selectors.js` already owns the composer pill selector through `COMPOSER_MODEL_MENU_BUTTON_SELECTOR` and `getModelMenuButton`.
- [x] `extension/popup.js` previously treated every non-`ok` scrape result as the weekly retry prompt plus `Open a ChatGPT tab to pick models.`, so it had no distinct free-account guidance.

## Scope

- [ ] Preserve the current `scrapeIntegratedModelCatalogOnce()` and legacy Configure path as ordered fallbacks when the three-submenu pill shape is absent or incomplete.
- [ ] Reuse structural Radix relationships and semantic roles/attributes observed in the live page; do not bind the new primary scraper to localized labels alone.
- [ ] Keep popup and shortcuts overlay model grids sourced from the same catalog/action helpers, including the two new synthetic actions and default key assignments.
- [ ] Touch only model-picker selector, scrape, action, devscrape, and focused test files unless validation exposes a direct dependency.
- [ ] Preserve the persisted `modelCatalog.configureOptions`, `modelCatalog.frontendByConfig`, `modelNames`, and `activeModelConfigId` contracts so popup and overlay rendering continue to use shared metadata.
- [ ] Keep older configure-dialog helper functions as fallback where cheap and already isolated, but stop requiring that route for the current refresh flow.
- [ ] Do not change Chrome permissions, shortcut storage shape, or model-picker slot count.
- [ ] Preserve the generic `modelCatalog` / `modelNames` current-page keys for content-script shortcut execution while adding Latest/Legacy popup snapshots.
- [ ] Do not complete runtime shortcut activation in phase 1; prove refresh and popup row hydration first.
- [ ] Do not collapse generic paid-user scrape failures into the free prompt; the prompt is gated by an explicit content-script result for either a missing composer pill or a language-agnostic model menu with no switching surface.

## Likely owning files

- [ ] `extension/content.js` owns runtime menu detection, model scrape refresh, shortcut activation, and hint application.
- [ ] `extension/shared/model-picker-selectors.js` owns shared opener/menu match groups used by content, metadata, and Playwright devscrape.
- [ ] `extension/shared/model-picker-labels.js` owns catalog action mapping, slot preservation, and active-config inference.
- [ ] `extension/popup.js`, `extension/popup.css`, and `extension/_locales/en/messages.json` own the no-switcher prompt state, copy, and compact grid presentation.
- [ ] `extension/lib/DevScrapeWide.js` and `tests/playwright/lib/devscrape-wide-core.mjs` own manual/dev scrape captures for the model-picker UI.
- [ ] `tests/model-picker-slot-uniqueness.mjs` or a nearby focused fixture test should cover the new second-level menu catalog mapping.

## Implementation plan

- [ ] Capture and normalize the current three-submenu pill contract:
  - Inventory every visible model row and, for each selected model, its available effort and speed rows plus checked/disabled/default state.
  - Restore the conversation's initial model, effort, and speed after the inspection.
  - Add a focused fixture/matrix that preserves the observed structural attributes without relying on localized model-menu prose as the selector contract.
- [ ] Add a primary three-submenu catalog scrape in `extension/content.js`:
  - Detect the main pill menu structurally, resolve its `Model`, `Effort`, and `Speed` submenu triggers, and associate each controlled Radix menu with its trigger.
  - Select each available model, rescan effort and speed choices, and persist normalized per-model state without breaking existing `configureOptions`, `frontendByConfig`, `modelNames`, or active-config consumers.
  - Fall through to the existing integrated/two-level and Configure-dialog paths only when the new shape is unavailable or cannot produce a complete catalog.
- [ ] Extend shared model-action metadata and both grid renderers:
  - Place `Toggle Speed (Normal / Fast)` and `Reset to default` in columns 5 and 6 of the second six-column row.
  - Route the actions through the live pill menu's speed and reset controls, with current menu automation as the only DOM owner.
  - Keep popup and shortcuts overlay labels, ordering, visibility, and slot identity in parity.
- [ ] Derive pristine/fallback `modelPickerKeyCodes` from the shared grouped action layout so installed defaults automatically mirror the latest first- and second-row catalog, while preserving user-customized assignments and duplicate safeguards.
- [x] Build the conflict-check slot set from the current catalog-backed presentation groups and iterate those exact sparse slot indices in both direct assignment checks and Alt-mode collision checks.
- [x] Strip ChatGPT's current generic tertiary-text badge class during shared menu-label extraction and normalize a trailing numeric/GPT model-version badge—with or without DOM-inserted whitespace—before mapping first-level integrated effort labels, so refresh extraction and exposed-menu shortcut labeling both recognize every available row.
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
- [x] Keep the shortcut overlay and live-menu hints in profile parity:
  - Add the popup's ephemeral `Latest | Legacy` view selector to the shortcut overlay, defaulting to Latest on each open and rendering both profiles from their stored catalog snapshots.
  - Resolve displayed overlay key assignments by the same mirrored visual grid positions used by the popup.
  - Add structural, language-agnostic shortcut hints to open pill Effort and Speed submenus while preserving the legacy menu hint path.
  - Keep `Toggle Speed (Normal / Fast)` in its existing utility-grid position; this follow-up does not move it.
  - Align both segmented controls' active text treatment, enlarge their labels/pills, and nudge the Latest/Legacy control upward another 3 px.
  - Treat a unique visible shortcut hint as authoritative across Chat and Work menu shapes: one keypress first invokes the existing `Show Model Picker` route, opens model/effort submenu triggers to expose their hints, activates the exact hinted ARIA item, and otherwise preserves the dedicated speed-toggle and legacy fallbacks.
  - Resolve model submenu hints and keypresses from the canonical Latest-grid position used by the popup before consulting current-catalog action slots, so reordered Chat/Legacy actions cannot reuse another row's displayed key.
  - Mirror the popup's complete Latest/Legacy segmented-control CSS inside the shortcut overlay shadow-root style block, including grid-left alignment, 14 px typography, 11 px horizontal padding, 22 px height, and `#003f7a` border/active fill.
- [x] Finish segmented-header and menu-dismiss behavior:
  - Translate `Latest Models` and `Legacy Models` in every shipped locale, keeping each translated label at 15 Unicode characters or fewer.
  - Move the Effort heading and model-grid top edge down 18 px while leaving both segmented selectors on the upper header line; mirror the header spacing in the shortcut overlay.
  - Restore Alt/Control clicks by targeting its explicit control rather than the first `.p-segmented-controls`, which now resolves to Latest/Legacy.
  - After successful model, effort, speed, reset, and legacy selection actions, refocus the composer so the picker closes; also refocus in the catalog-refresh cleanup path on success or failure.
- [x] Add integrated effort fallback behavior:
  - If the active model does not expose a requested baseline effort (`Instant`, `Medium`, `High`), route the shortcut through the default/latest model and then select that effort there.
  - Current expected behavior: `o3 + Instant` and `o3 + High` switch to `5.5` with the requested effort; `o3 + Medium` stays on `o3`; `5.4` keeps all three effort shortcuts in-model.
  - Simplified runtime decision: first open the live picker for the requested effort; if that effort row is missing while other baseline effort rows are visible, treat that as “current model lacks this effort” and fall back to latest.
  - Smoothed edge-case activation: fallback resolves the latest-model slot, runs that slot through the same `runModelPickerShortcutSlot` path as a real shortcut, waits for completion, waits 100 ms, then replays the original effort slot through the same slot path with fallback recursion disabled.
  - Current fix target: preserve the original model-picker slot index and replay the slot path (`runModelPickerShortcutSlot(slot)` -> `getModelActionBySlot(slot)` -> `executeModelAction`) after the latest-model slot finishes; do not infer the active model from storage for runtime shortcut execution.
  - Fixed stale-menu interference: before replaying the source slot, clear any still-open model picker/submenu with Escape so the replay opens a fresh `5.5` effort menu instead of reading stale `o3` rows.
  - Removed missing-row timeout from the edge path: when the first open menu state proves the scraped active model lacks the requested effort, start the latest-model slot sequence immediately instead of polling for a row that cannot appear.
- [x] Follow-up: add the free/no-switcher refresh UX:
  - In `extension/content.js`, detect the missing composer model-switcher pill before attempting menu open/scrape work and return a typed result such as `{ ok: false, error: 'MODEL_SWITCHER_PILL_NOT_FOUND', noModelSwitcher: true }`.
  - Gate popup behavior only on that typed result. Keep generic scrape failures on the existing retry prompt and toast path.
  - In `extension/popup.js`, track a distinct no-switcher state separate from `failed` so paid accounts with a visible pill continue through the existing scrape flow.
  - Replace or cover the model shortcut grid with short copy: `Use a Plus or Pro account, then refresh to show model shortcuts.`
  - Keep the header `Refresh Models` / `Click to Refresh Model List` control available so a user can switch accounts and rerun refresh without reopening the popup.
  - Add any needed English locale key and compact CSS state under the existing `mp-grid-loading-overlay` / prompt styling instead of creating a second visual system.
  - Preserve existing `modelCatalog`, `modelNames`, `activeModelConfigId`, and shortcut key storage when this no-switcher result appears; do not clear paid-user data just because the current account cannot expose the picker.
  - Done follow-up: preserve failed scrape result details in `popup.js`, classify typed missing-pill or language-agnostic no-switching-menu scrape results as no-switcher, and collapse `#model-picker-grid` with `mp-grid-no-switcher-state`.
- [ ] Follow-up: update devscrape posture:
  - Rename or replace current model-switcher capture expectations so the required model-picker states are first-level menu and second-level model submenu.
  - Defer or remove configure-dialog capture requirements from the current validation path if the UI no longer exposes them.

## Validation

- [ ] Prove the live state matrix covers every exposed model and every effort/speed option, and that the initial live selection is restored afterward.
- [ ] Add/run focused fixtures for three-submenu detection, per-model effort/speed catalog capture, fallback ordering, the two synthetic actions, and catalog-derived pristine key defaults.
- [ ] Verify popup and shortcuts overlay render identical two-row action identities with `Toggle Speed (Normal / Fast)` and `Reset to default` at second-row columns 5 and 6.
- [ ] Reload the unpacked extension and run a live refresh on the paid positive-control conversation; verify the new primary scrape completes and the legacy scraper remains reachable in focused fallback coverage.
- [x] Run `npx biome check` on changed JS files.
- [x] Run `node tests/model-picker-slot-uniqueness.mjs`.
- [x] Run `node tests/model-picker-pill-three-menu-fixture.mjs`.
- [x] Run `npx playwright test tests/playwright/model-picker-profile-selector.spec.mjs --workers=1` to prove the Latest/Legacy selector mirrors a mismatched fourth second-row slot and propagates a Legacy edit back to Latest.
- [x] Add/run focused coverage for Latest/Legacy shortcut-overlay switching and structural pill Effort/Speed hint routing; the fixture executes both overlay profiles with intentionally mismatched slots and verifies structural hint/observer wiring.
- [x] Add/run focused coverage proving the Chat-mode model submenu maps its first five rows to canonical popup keys `1`-`5` without duplicate hints when catalog action slots are reordered.
- [x] Add/run focused coverage for translated profile-label length, explicit Alt/Control control targeting, 18 px header separation, and composer refocus after selection/refresh; the Playwright control click and refreshed visual baseline both pass.
- [x] Regenerate and pass the intentional popup visual baseline with `npx playwright test tests/playwright/popup-visual.spec.mjs --workers=1 --update-snapshots`.
- [x] Run or add a focused fixture test proving a two-level catalog renders first-row `Instant` / `Medium` / `High` and second-row model labels.
- [x] Add/run focused fixture coverage proving a higher numeric model such as `5.6` becomes `configure-latest` even when it is not the first visible submenu row.
- [x] Add/run focused coverage for integrated catalog rendering/defaults; runtime missing-effort fallback is now live-menu driven in `content.js`.
- [x] Attached to the live Chrome/CDP target and inspected the extension isolated-world in-memory catalog; `chrome.storage.sync` had no persisted catalog in that context, so fallback defaults were set from the in-memory scraped catalog.
- [ ] Run the smallest devscrape/selector validation that covers model-picker menu states, or document why it needs a live ChatGPT session.
- [x] Run `npx biome check extension/content.js extension/popup.js extension/popup.css extension/_locales/en/messages.json`.
- [x] Run `node tests/model-picker-no-switcher-refresh-guard.mjs`.
- [x] Run `node tests/model-picker-slot-uniqueness.mjs`.
- [x] Add or run focused selector/fixture coverage proving generic Configure misses stay generic, missing composer pills return the typed no-switcher result, no-switching model menus return the typed no-switcher result without localized text checks, and the popup renders the Plus/Pro prompt only for typed results.
- [ ] Recheck the live paid positive-control state after the change: Plus/Pro account with a visible `__composer-pill` must still show the normal loading state and scrape flow when `Refresh Models` is clicked.

## Done when

- [ ] The live paid-account pill scrape produces a complete, test-backed model/effort/speed matrix for every exposed model without using the fallback path.
- [ ] The existing integrated/two-level and Configure scrapers remain intact as fallback paths and have focused ordering coverage.
- [ ] Popup and overlay both place `Toggle Speed (Normal / Fast)` and `Reset to default` at the far right of the second grid row, with working runtime actions.
- [ ] Pristine/fallback shortcut keys are generated from the latest shared two-row catalog layout without overwriting customized stored keys.
- [ ] Manual model refresh succeeds against the new two-level menu without `CONFIGURE_ITEM_NOT_FOUND`.
- [x] Popup model picker renders the refreshed first two rows from shared catalog metadata.
- [x] The old separate effort row does not show for an integrated-effort catalog.
- [ ] Current model-picker devscrape states no longer fail solely because the Configure dialog route disappeared.
- [ ] Free/no-switcher refresh shows only the Plus/Pro prompt in the model shortcut area, while paid accounts with the composer pill still use the existing model catalog refresh path.
