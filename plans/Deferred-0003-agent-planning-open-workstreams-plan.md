## Goal
Make adding new toggles/shortcuts require fewer “wire it here too” edits, while keeping behavior stable and avoiding fragile refactors (model picker grid logic stays as-is).

---

## Planned Feature — Library “Hide Pasted Files” Toggle
Reference: follow `AGENTS.md` for the new-setting wiring map, popup placement rules, and the extension reload requirement after shipped-file edits. This section is plan-only for now and is intentionally split into two implementation passes.

### Feature intent / done-when
- [x] Add a new popup toggle as the last item in the `UI Tweaks` section, backed by one storage key and defaulting to off.
- [x] Use the storage key `hidePastedLibraryFilesEnabled` unless implementation uncovers a naming conflict before code edits begin.
- [x] On the ChatGPT Files Library page, inject an on-page toggle even when the feature is off; only the hide/filter behavior is gated by the setting.
- [x] Place the injected Library toggle about `1em` to the left of the existing filters button, with a small localized label that reads `Hide Pasted Files` in English.
- [x] Keep selector strategy language-agnostic for injection and filtering; do not depend on localized `Library`, `Open filters`, `Grid view`, or `List view` text for the primary anchors.
- [x] When enabled, hide only Library items whose filename contains `Pasted` or `pasted` in both grid and list view.
- [x] When disabled, restore the already-rendered hidden items immediately without rebuilding or refetching the Library DOM.
- [x] Preserve the setting across reloads and ChatGPT SPA navigation, including moving from a conversation into `/library`.

### Pass 1 — Setting wiring + smallest correct Library implementation
Plain language: wire the setting end-to-end, inject the on-page control, and hide/show matching Library items with the lowest-risk DOM approach.

- [x] `options-storage.js`: add `hidePastedLibraryFilesEnabled: false` to `OPTIONS_DEFAULTS`.
- [x] `settings-schema.js`: add `hidePastedLibraryFilesEnabled: false` to `content.visibilityDefaults` so `window.hidePastedLibraryFilesEnabled` is hydrated automatically in `content.js`.
- [x] `popup.html`: append one new final row under `UI Tweaks` (after the current last toggle) using `data-sync="hidePastedLibraryFilesEnabled"` and the standard popup switch markup.
- [x] `popup.html`: use new i18n keys for the popup row label and tooltip instead of hardcoded text.
- [x] `_locales/en/messages.json`: add `label_hide_pasted_library_files` with `Hide Pasted Files` plus a tooltip key explaining that Library items whose filenames contain `Pasted` are hidden until the toggle is turned off.
- [x] `_locales/es/messages.json`, `_locales/hi/messages.json`, `_locales/ja/messages.json`, `_locales/ru/messages.json`, `_locales/uk/messages.json`: add matching entries for the same new i18n keys.
- [x] `popup.js`: expect no bespoke wiring change because `data-sync` checkbox handling is already automatic; only touch `popup.js` if the new row exposes a real layout or guardrail issue.
- [x] `popup.css`: expect no change unless the new last row needs a small spacing correction in the popup.
- [x] `manifest.json`: no planned change; `settings-schema.js` already loads before `content.js`.
- [x] `content.js`: implement the feature as a self-contained end-of-file IIFE, following the pattern used by other isolated feature modules so the whole block can stay inert when the setting is off.
- [x] `content.js`: keep the IIFE’s startup path cheap when `hidePastedLibraryFilesEnabled` is false:
  - [x] allow the injected on-page toggle to appear on `/library`
  - [x] avoid attaching ongoing Library result-filtering observers or repeated rescans until the setting is enabled
- [x] `content.js`: reuse existing shared helpers where it stays clean (`createDebounce`), and keep the Library feature self-contained instead of cloning or lifting extra helpers unnecessarily.
- [x] `content.js`: avoid expanding the shared/global helper surface unless a helper is clearly reusable outside the Library feature block.
- [x] `content.js`: keep any shared helper usage narrow and purpose-driven so the shared helper area does not become a dumping ground.
- [x] `content.js`: add a route helper that treats both exact `/library` and nested `/library/...` as Library routes; do not rely on helpers that only match `/library/`.
- [x] `content.js`: attach only when the Library top-controls surface is present, preferably via `observeMountedSelector(...)` or an equally narrow route-aware attachment helper.
- [x] `content.js`: anchor injection from stable structure such as `data-testid="artifacts-surface-top-controls"` and its trailing actions cluster, not localized button labels.
- [x] `content.js`: insert one extension-owned wrapper immediately before the existing filter/view controls so the new toggle sits just left of Filters with controlled spacing instead of brittle absolute positioning.
- [x] `content.js`: use a tiny content-owned style block for the injected control; do not assume popup classes alone will style it on the webpage.
- [x] `content.js`: localize the on-page label with `chrome.i18n.getMessage(...)` so popup and webpage text stay aligned.
- [x] `content.js`: mark the injected node(s) with extension-owned ids/data attributes so reinjection is idempotent and duplicate toggles are impossible.
- [x] `content.js`: wire the on-page toggle to `chrome.storage.sync` so clicking it updates the stored setting and the popup remains the same source of truth.
- [x] `content.js`: also listen for storage changes so flipping the popup toggle while `/library` is open updates the page immediately.
- [x] `content.js`: keep the on-page control compact and native-looking to the Library top-controls row instead of reusing the popup switch styling directly.
- [x] `content.js`: enumerate only the currently rendered Library items in the active view instead of walking the full document:
  - [x] grid view: card roots under the artifacts results grid
  - [x] list view: row roots under the artifacts list surface
- [x] `content.js`: derive each filename from stable DOM text near the item, preferring visible title text or raw file-label attributes over localized action text.
- [x] `content.js`: treat `Pasted` matching as a case-insensitive filename check.
- [x] `content.js`: hide matches by toggling an extension-owned class/attribute on the existing item root; do not remove matching nodes from the DOM.
- [x] `content.js`: restore hidden items by removing that class/attribute so repopulation is immediate when the setting turns off.
- [x] `content.js`: keep the results watcher low-resource by observing only the Library results subtree and coalescing bursts into one scheduled rescan.
- [x] `content.js`: only create or reconnect the Library results watcher while the stored setting is enabled; disconnect or idle it when the setting is off after restoring hidden items.
- [x] `content.js`: avoid running Library filtering work at all on non-Library routes.
- [x] `content.js`: reapply the hide/show pass after Library-specific rerenders such as:
  - [x] switching between grid and list view
  - [x] changing Library filters/search
  - [x] uploads, deletions, or other result-surface rerenders
  - [x] navigating into Library from another ChatGPT route
- [x] `content.js`: add one short code comment explaining why the feature hides existing nodes instead of removing/recreating them.

Acceptance checks:
- [ ] Popup shows the new last `UI Tweaks` toggle and it defaults to off.
- [ ] `/library` shows the injected toggle to the left of Filters with stable spacing and localized text.
- [ ] Grid view hides only matching `Pasted` items when enabled.
- [ ] List view hides only matching `Pasted` items when enabled.
- [ ] Turning the toggle off restores hidden items immediately.
- [ ] Reloading the Library page preserves the setting and re-applies the correct state.
- [ ] Navigating from a conversation to Library reinjects the control once and preserves behavior.

### Pass 2 — Hardening, QA, and cleanup
Plain language: tighten the selectors and observer scope only after the first working version exists, then validate in the real extension context.

- [x] Re-check the first-pass selectors against the saved Library HTML snapshots and tighten them to the smallest stable language-agnostic anchors actually required.
- [x] Use stable filename/title extraction in both views and avoid localized action-text fallbacks.
- [x] Ensure the injected toggle survives Library surface rerenders without duplicates, stale references, or broken spacing.
- [x] Ensure route changes away from Library clean up or idle any Library-specific observers cleanly.
- [x] Ensure disabling the feature stops meaningful filtering work and restores any hidden nodes before the next Library render pass.
- [x] Confirm the feature behaves cleanly when there are zero `Pasted` items or zero Library results.
- [x] Fix the hard-reload `/library` case so the injected `Hide Pasted Files` control waits for the final Library controls row to settle before it inserts, instead of landing early and then getting replaced during route hydration.
- [x] `CHANGELOG.md`: add one brief user-visible note once the feature is implemented.
- [ ] Reload the unpacked extension in `chrome://extensions` after the shipped-file edit batch.
- [ ] Validate in the real extension-enabled ChatGPT browser on `/library`, not by inspecting `popup.html` alone.
- [ ] Check both grid and list view in the same validation pass.
- [ ] Verify at least one conversation -> Library navigation path with the extension already loaded.
- [ ] Capture one screenshot of the final Library control placement if the UI spacing is subtle enough to be worth preserving for future reference.
- [ ] Only run popup preview/screenshot steps if the popup row layout itself changed in a way that needs confirmation; otherwise keep QA focused on the live Library page.

Acceptance checks:
- [ ] No duplicate injected toggle appears after route changes, result rerenders, or view switches.
- [ ] No non-Library route gets the injected toggle or Library filtering observer work.
- [ ] Search/filter/view changes preserve the expected hide/show behavior.
- [ ] Matching items return without lag or manual refresh when the toggle is turned off.
- [ ] The feature remains stable after extension reload plus one ChatGPT tab refresh.

### Post-implementation doc follow-up (defer until the feature is finished)
- [ ] Write a short dedicated spec file for the Library toggle behavior, selector strategy, and low-resource hide/show approach after implementation settles.
- [ ] Add one very short bullet to `AGENTS.md` that points to that spec file instead of duplicating the behavior details there.

---

## Planned Next Pass — Popup Model Refresh Clarity + First-Load Model Defaults
Reference: within the current scoped files, `AGENTS.md` plus `popup.js`, `popup.html`, `popup.css`, `options-storage.js`, and `shared/model-picker-labels.js` are the effective spec for this work. No separate deeper spec file surfaced in the allowed read set.

### Intent / done-when
- [x] Keep the header `Refresh Models` button visible during the first-load weekly `Click to refresh models` prompt state so both affordances are visible at once.
- [x] Give both clickable refresh areas a subtle hover/focus treatment so the prompt card and header button read as interactive without looking louder than the surrounding popup UI.
- [x] Keep `Configure...` wired to `Alt + 0` by default in the model picker grid for pristine/default users.
- [x] Seed the rest of the model picker grid defaults from the shared model-action source of truth, while respecting visible top-row ordering when that shared presentation data is available.
- [x] After the first successful manual `Refresh Models` hydration, if `Alt + 8` and `Alt + 9` are still available, assign them by default to:
  - [x] `Switch model to Thinking Standard` → `Alt + 8`
  - [x] `Switch model to Thinking Extended` → `Alt + 9`
- [x] Do not overwrite existing customized shortcuts, imported settings, restored cloud settings, or already-migrated `modelPickerKeyCodes` for updating users.

### Small read set that won this routing pass
- [x] `AGENTS.md`: confirms popup-open model-catalog refresh stays manual-only and that the popup/overlay share the grouped model-action source of truth.
- [x] `popup.js`: `syncCatalogLoadingUi`, `ensureCatalogLoadingOverlay`, `triggerManualCatalogRefresh`, `buildGridSection`, and the `window.__modelPickerKeyCodes` cache are the live wiring points.
- [x] `popup.css`: `.mp-refresh-models-button`, `.mp-grid-refresh-prompt`, and the model-grid loading overlay classes control the clickable affordances.
- [x] `popup.html`: `.mp-refresh-controls` owns the header button placement next to the Alt/Control segmented control.
- [x] `shared/model-picker-labels.js`: `defaultKeyCodes()`, `getPopupPresentationGroups()`, and `mapFrontendLabelToActionId()` define the model-picker action/default shape.
- [x] `options-storage.js`: `OPTIONS_DEFAULTS` plus the existing model-picker migrations are the safe place to preserve updater behavior.
- [x] `settings-schema.js`: already contains the user-facing labels for `shortcutKeyThinkingStandard` and `shortcutKeyThinkingExtended`.

### Implementation checklist for the next pass
- [x] `popup.js`: in `syncCatalogLoadingUi`, stop hiding `#mp-refresh-models-button` during the prompt-visible state and only disable it while an actual refresh is running.
- [x] `popup.js`: keep the header button and the overlay prompt wired to the same `triggerManualCatalogRefresh(...)` path so there is still only one refresh behavior.
- [x] `popup.css`: add a very subtle hover/focus-visible state to `.mp-refresh-models-button` that fits the current popup tone.
- [x] `popup.css`: add a matching subtle hover/focus-visible state to `.mp-grid-refresh-prompt` so the prompt block reads as clickable before the user hovers the text.
- [ ] `popup.js` + `popup.css`: verify the overlay prompt and header button can be visible together without awkward overlap, spacing jumps, or tooltip collisions.
- [x] `shared/model-picker-labels.js`: review `defaultKeyCodes()` and keep `Configure...` on `Digit0`.
- [x] `shared/model-picker-labels.js` + `popup.js`: use one shared default-model-key source of truth, and when shared popup presentation data is available, derive default ordering from that instead of hardcoding a second parallel ordering table.
- [x] `options-storage.js`: keep `shortcutKeyThinkingStandard` / `shortcutKeyThinkingExtended` empty at the raw defaults layer so updating users are not backfilled just by loading defaults.
- [x] `popup.js`: seed `shortcutKeyThinkingStandard` / `shortcutKeyThinkingExtended` only after the first successful manual model refresh has hydrated the grid once, and only when those keys are still free.
- [x] `content.js`: keep these two shortcuts unseeded in content bootstrap defaults so the popup refresh path remains the only hydrator.
- [x] Updater guardrails:
  - [x] only fill untouched/blank values during that first successful manual refresh pass
  - [x] never replace nonblank user assignments
  - [x] never reshuffle nondefault `modelPickerKeyCodes`
- [x] `popup.js` / duplicate guardrails: only seed `Alt + 8` / `Alt + 9` when those keys are still free across popup shortcuts and model-picker bindings.
- [x] `popup.js` / import-cloud guardrails: imported files, Drive restore data, and existing synced settings remain authoritative and must not be silently rewritten by the new default-seeding logic.

### Acceptance checks for the next pass
- [ ] Weekly first-open prompt state shows both `Refresh Models` and the `Click to refresh models` prompt at the same time.
- [ ] Both refresh affordances have a subtle but noticeable hover/focus cue.
- [ ] A pristine/default profile still shows `Configure...` on `Alt + 0`.
- [ ] The remaining first-load model-picker defaults follow the intended visible order without introducing a second conflicting source of truth.
- [ ] After the first successful manual refresh hydration, if those keys are free, `Thinking Standard` defaults to `Alt + 8` and `Thinking Extended` defaults to `Alt + 9`.
- [ ] Existing customized/updating users keep their current assignments after upgrade.
- [ ] Import/restore/cloud-sync flows do not regress or silently rewrite user choices.

---

## Planned Feature — Dynamic Thinking Effort Shortcuts (Plus vs Pro)
Reference: keep this on the same shared model-catalog path as the current model picker refresh flow. Do not add a second popup-only scrape path for effort options.

### Intent / done-when
- [x] Reuse the existing shared model-catalog refresh/source-of-truth flow to detect which thinking-effort options the current user/account can actually access.
- [x] Plus users keep the current behavior: only `Thinking Standard` and `Thinking Extended` are exposed, and nothing else appears.
- [x] Pro users gain two extra shortcut tiles beneath the existing `Thinking Standard` / `Thinking Extended` items when the catalog exposes `Light` and `Heavy`.
- [x] The extra `Light` / `Heavy` tiles should appear with blank shortcut assignments by default, so users can choose whether to bind them.
- [x] If the current catalog does not expose `Light` / `Heavy`, those two extra tiles should not appear at all.
- [x] `Thinking Standard` and `Thinking Extended` remain the stable baseline shortcuts for both Plus and Pro users.
- [x] The popup/overlay/content runtime should all derive visibility from one shared catalog shape instead of each guessing from DOM independently.

### Read set that drives this plan
- [x] `tools/plus_extended_thinking menu.txt`: confirms the Plus menu exposes a labeled thinking-effort radio group with only `Standard` and `Extended`.
- [x] `tools/pro extended thinking sub menu-pro.txt`: confirms the Pro menu exposes a labeled thinking-time radio group with `Light`, `Standard`, `Extended`, and `Heavy`.
- [x] `content.js`: the existing manual model-catalog scrape already persists `modelCatalog`, `configureOptions`, and frontend presentation rows, so this is the right place to extend the scrape.
- [x] `shared/model-picker-labels.js`: already owns canonical model-action metadata and popup presentation helpers, so this is the right place for canonical thinking-effort ids/labels too.
- [x] `popup.html`: the thinking-effort shortcut area can host hidden optional extra tiles directly beneath `Thinking Standard` / `Thinking Extended`, avoiding brittle sibling hacks.
- [x] `options-storage.js` + `settings-schema.js`: already own the two existing thinking shortcut keys and will need parallel entries if `Light` / `Heavy` become real shortcuts.

### Pass 1 — Extend the shared catalog and popup exposure
Plain language: make effort availability part of the same model-catalog data flow first, then let the popup surface optional extra tiles only when that shared data says they exist.

- [x] `content.js`: extend the existing manual model refresh/catalog scrape so it also captures the available thinking-effort options during the same hidden scrape session.
- [x] `content.js`: do not add a new automatic popup-open scrape; piggyback on the current manual refresh path and persist the result with `modelCatalog`.
- [x] `content.js`: when the thinking-effort submenu is reachable, collect the visible radio options from `role="menuitemradio"` items under the same grouped submenu.
- [x] `content.js`: treat the submenu group label (`Thinking effort` vs `Thinking time`) as descriptive only; canonicalize from the option rows themselves.
- [ ] `content.js`: map the scraped visible labels to canonical ids:
  - [x] `thinking-light`
  - [x] `thinking-standard`
  - [x] `thinking-extended`
  - [x] `thinking-heavy`
- [x] `content.js`: store that canonical effort list inside the shared `modelCatalog` object instead of a second storage key.
- [x] `popup.js`: consume the shared catalog and determine whether optional `Light` / `Heavy` effort tiles should be rendered.
- [x] `popup.html`: add the optional extra tiles directly beneath the current `Thinking Standard` / `Thinking Extended` entries and hide them until the shared catalog exposes them.
- [x] `shared/model-picker-labels.js`: add a small canonical helper for thinking-effort option ids/labels so popup/content can normalize the same scraped menu values consistently.
- [x] `popup.js`: when the catalog exposes only `Standard` / `Extended`, render no extra tiles; when it exposes `Light` / `Heavy`, render exactly those extra tiles and leave their shortcuts blank.
- [x] Keep `Light` / `Heavy` out of `modelPickerKeyCodes`; these are shortcut tiles, not model-grid slots.

### Pass 2 — Real shortcut keys, runtime handlers, and overlay wiring
Plain language: once the shared catalog and popup exposure are stable, turn `Light` / `Heavy` into real assignable shortcuts and wire the runtime behavior cleanly.

- [x] `options-storage.js`: add `shortcutKeyThinkingLight` and `shortcutKeyThinkingHeavy` with blank defaults.
- [ ] `popup.html`: either convert the thinking-effort block to a small popup-owned render surface or inject the two optional rows from `popup.js`; keep the visible order:
  - [ ] `Thinking Standard`
  - [ ] `Thinking Extended`
  - [ ] `Thinking Light` (conditional)
  - [ ] `Thinking Heavy` (conditional)
- [x] `_locales/*/messages.json`: add labels/tooltips for `Thinking Light` and `Thinking Heavy`.
- [x] `settings-schema.js`: add `labelI18nByKey` entries for the new keys so shortcuts-overlay labels stay aligned with the popup.
- [x] `settings-schema.js`: add the new keys to the model-picker/shortcut overlay section ordering immediately after the current two thinking shortcuts.
- [x] `content.js`: add the `Light` / `Heavy` shortcut handlers by reusing the same thinking-effort menu-open path as the current Standard/Extended actions.
- [x] `content.js`: if a user presses `Light` / `Heavy` but the current account/catalog does not expose that option, fail safely instead of clicking the wrong item.
- [x] `popup.js`: preserve blank defaults for the optional `Light` / `Heavy` shortcuts; do not auto-seed them with Alt digits.
- [x] Import/export/cloud restore: preserve the new keys once they exist, but do not force the optional tiles visible when the current catalog does not expose those options.
- [x] If a user once had Pro-only `Light` / `Heavy` shortcuts stored and later refreshes into a Plus-only catalog, keep the stored values in storage but hide those optional tiles until the catalog exposes them again.

### Acceptance checks
- [ ] Plus catalog refresh exposes only `Standard` / `Extended`; popup shows no extra effort tiles.
- [ ] Pro catalog refresh exposes `Light` / `Standard` / `Extended` / `Heavy`; popup shows two extra effort tiles for `Light` and `Heavy`.
- [ ] The extra `Light` / `Heavy` tiles start blank and are user-assignable.
- [ ] Existing `Thinking Standard` / `Thinking Extended` behavior does not regress for Plus or Pro users.
- [ ] Shortcuts overlay includes `Light` / `Heavy` only when those shortcuts are assigned.
- [ ] Runtime clicks target the correct submenu radio option and never silently fall through to the wrong effort level.
- [ ] The shared catalog remains the only source of truth; no second popup-only scrape path exists.

---

## Next Pass — Observer / Performance Cleanup
Reference: follow `AGENTS.md` scope and Playwright workflow for every shipped-file validation pass.

### Next pass scope (keep it workmanlike)
Plain language: do only the first half of the meaningful observer cleanup in the next implementation pass, then validate once at the end.

- [ ] Next implementation pass covers only:
  - [ ] Phase 1 — Narrow the main bottom-bar observer
  - [ ] Phase 2 — Cheap-gate the dynamic UI styling observer
- [ ] Defer these to the following pass:
  - [ ] Phase 3 — Debounce and scope “remember sidebar scroll position”
  - [ ] Phase 4 — Slim sidebar fade: reduce global observation
  - [ ] Phase 5 — Low-risk cleanup
- [ ] Batch the code changes for Phases 1 and 2 together before running Playwright validation.
- [ ] Do not run repeated Playwright checks mid-pass unless a blocker forces it.

### Guardrails for this pass
- [ ] Keep the pass limited to `content.js` unless a concrete validation need forces a helper/test tweak.
- [ ] After each shipped-file edit batch, manually reload the unpacked extension in `chrome://extensions` before any Playwright confirmation.
- [ ] Validate only in the real extension-enabled ChatGPT browser (`csp-on`) plus a plain/no-extension comparison when needed.
- [ ] Do not attempt DOM virtualization or lazy-loading of ChatGPT turns; only reduce extension-added observer and reconciliation work.
- [ ] Prefer narrowing observer roots, adding cheap mutation gates, and debouncing re-entry over changing feature behavior.

### Phase 0 — Baseline capture before code changes
Plain language: record the current behavior so each optimization can be checked quickly and rolled back cleanly if needed.

- [ ] Use the extension-enabled logged-in browser scenario from `AGENTS.md`:
  - `node tests/playwright/chatgpt-session.mjs --scenario csp-on --setup-login --url about:blank`
- [ ] Use a shorter conversation and one longer conversation from the sidebar.
- [ ] For each conversation, verify:
  - [ ] bottom bar appears
  - [ ] disclaimer stays hidden
  - [ ] switching conversations from the sidebar still works
  - [ ] model switcher/header actions still appear in the bottom bar
- [ ] Save one screenshot around the composer/bottom-bar area before starting code changes.
- [ ] If the browser hits bot-check/captcha pressure again, stop automation immediately and continue from code inspection notes instead of retrying loops.

### Phase 1 — Narrow the main bottom-bar observer
Plain language: the current bottom-bar controller listens to too much of the page. Restrict it to the smallest region that can actually affect the bottom bar.

- [ ] Work in `content.js` inside `createBottomBarController()` around `installMainObserver()`.
- [ ] Add a helper that resolves the narrowest safe observation root from the current anchor snapshot:
  - [ ] prefer the composer/thread container or its stable parent
  - [ ] fall back to `document.body || document.documentElement` only if no narrower root exists
- [ ] Make the observer attach to that narrower root instead of always using the whole document subtree.
- [ ] Reattach the observer if the stable anchor/root changes during reconciliation.
- [ ] Keep `isInternalBottomBarMutation()` and `isRelevantMutation()` behavior intact; only reduce how many mutations reach them.
- [ ] Preserve current repair triggers:
  - [ ] root disconnected
  - [ ] slot missing
  - [ ] mount anchor/parent disconnected
  - [ ] relevant header/composer/thread mutations
- [ ] Add one short code comment explaining why the observer root is intentionally narrow.

Acceptance checks:
- [ ] bottom bar still appears on ChatGPT home
- [ ] bottom bar still appears after opening a conversation from the sidebar
- [ ] sidebar toggle/new chat static buttons still work
- [ ] model button and header actions still repopulate after conversation switches

### Phase 2 — Cheap-gate the dynamic UI styling observer
Plain language: the dynamic styling pass should not inspect every added subtree unless it contains nodes we actually care about.

- [ ] Work in `content.js` around the observer that calls `applyDynamicUiStylingInSubtree(...)`.
- [ ] Add a fast precheck helper for added nodes:
  - [ ] return early for non-elements
  - [ ] return early when the node neither matches nor contains `DYNAMIC_UI_SELECTOR`
- [ ] Keep the initial `applyInitialTransitions()` pass unchanged.
- [ ] Keep the observer feature-on behavior unchanged; only skip irrelevant mutation subtrees.
- [ ] Avoid any document-wide `querySelectorAll(...)` inside the mutation loop.

Acceptance checks:
- [ ] message/action styling still appears on newly loaded turns
- [ ] no obvious missing styles on a conversation opened from the sidebar
- [ ] long-thread reload no longer runs styling work for obviously unrelated nodes

### Phase 3 — Debounce and scope “remember sidebar scroll position”
Plain language: the scroll-restore feature currently wakes up too often. Make it react less often and only to sidebar-relevant DOM changes.

- [ ] Work in `content.js` around the `rememberSidebarScrollPositionCheckbox` logic and `initOnce()`.
- [ ] Replace direct `initOnce()` calls from the observer/resize path with a small debounced scheduler.
- [ ] Narrow the observer target if possible:
  - [ ] prefer sidebar/overlay containers once found
  - [ ] otherwise keep the existing fallback root only until the real container is available
- [ ] Keep the final delayed restore safeguard, but do not add more timers.
- [ ] Do not change stored sessionStorage keys or rail/overlay semantics.

Acceptance checks:
- [ ] rail scroll position restores after conversation switches
- [ ] overlay/history panel scroll position restores after close/reopen
- [ ] resize across rail/overlay threshold still re-targets correctly

### Phase 4 — Slim sidebar fade: reduce global observation
Plain language: when slim-sidebar fade is enabled, it should watch the sidebar state, not the whole app forever.

- [ ] Work in `content.js` around `ensureGlobalObservers()`, `domObserver`, and `overlayObserver`.
- [ ] Keep the feature fully off when `fadeSlimSidebarEnabled` is false.
- [ ] When enabled:
  - [ ] narrow `domObserver` to the smallest root that can create/remove `#stage-sidebar-tiny-bar`
  - [ ] narrow `overlayObserver` to the specific large-sidebar / overlay state nodes if they exist
  - [ ] debounce repeated fade recalculations if multiple mutations land in one burst
- [ ] Preserve current hover/idle opacity behavior and current storage-driven opacity values.

Acceptance checks:
- [ ] slim bar still fades in/out correctly
- [ ] opening the large sidebar still suppresses the slim bar
- [ ] closing the large sidebar restores the slim bar behavior without laggy repeated fades

### Phase 5 — Low-risk cleanup if the earlier phases go smoothly
Plain language: only do these if Phases 1-4 are stable and easy.

- [ ] Review `observeMountedSelector(...)` and only keep it if the current subtree observer is still necessary after narrowing the bottom-bar path.
- [ ] Review the model-menu hint observer and confirm it is only active while the menu is likely open; do not broaden it further.
- [ ] Leave copy/selection DOM walkers alone in this pass because they are user-triggered, not always-on observers.

### Single validation sequence at end of next pass
Use the AGENTS Playwright workflow, but keep it minimal and run it once after both scoped phases are complete.

- [ ] Reload the unpacked extension in `chrome://extensions` once after the Phase 1 + Phase 2 edit batch is complete.
- [ ] Use one extension-enabled ChatGPT browser session (`csp-on`).
- [ ] Refresh one already-open ChatGPT tab once after extension reload.
- [ ] Verify only these essentials:
  - [ ] bottom bar present and ready on ChatGPT home or the currently open conversation
  - [ ] one sidebar conversation switch still repopulates the bottom bar correctly
  - [ ] disclaimer remains hidden on that checked conversation
- [ ] Only add a plain/no-extension comparison if the extension-enabled run shows a clear regression that needs isolation.
- [ ] If the single end-of-pass validation fails, revert the smaller of the two scoped changes first and re-run one final confirmation.

### Done definition for this next pass
- [ ] The bottom-bar path no longer relies on full-document subtree observation when a narrower root is available.
- [ ] The dynamic styling observer skips irrelevant subtrees cheaply.
- [ ] Playwright confirmation is completed once at the end of the edit batch on the extension-enabled browser, and no user-visible regression is found in the checked conversation flow.

---

## What’s already done (in this branch)
- [x] **Popup toggles/radios auto-wire**: `popup.js` now binds any `input[type=checkbox|radio][data-sync]` automatically (except a small explicit exclude list for special cases).
- [x] **Popup shortcut inputs auto-discover**: `popup.js` now derives `shortcutKeys` from `input.key-input` in `popup.html` (prefers `data-sync`, falls back to `id`) so there’s no manual `shortcutKeys = [...]` list.
- [x] **Content visibility keys de-duplicated**: `content.js` now derives the initial `chrome.storage.sync.get(...)` key list from a single `VISIBILITY_DEFAULTS` map instead of repeating the keys in multiple places.
- [x] **Model-menu toggle key matching fixed**: `content.js` now uses `matchesShortcutKey(...)` for the toggle key so it works whether the stored value is `'/'` or `'Slash'`.
- [x] **Content opacity parsing hardened**: `content.js` now tolerates slider values stored as either numbers or strings.

---

## Next steps (proposed plan) — checklist style

### Phase 1 — Reduce duplicate defaults (safe, “just works”)
**Plain language:** Use the existing master defaults (`OPTIONS_DEFAULTS`) as the source for popup defaults too, so you don’t maintain multiple default objects.

- [x] (Safer variant implemented) Auto-extend popup defaults from `OPTIONS_DEFAULTS` *only for missing keys* so adding new settings usually needs no extra popup wiring.
- [x] Decide/fix one mismatched default: `rememberSidebarScrollPositionCheckbox` now matches popup/content defaults (set to `false` in `options-storage.js`).
- [x] In `popup.js`, build `DEFAULT_PRESET_DATA` by starting from `globalThis.OPTIONS_DEFAULTS` (loaded by `popup.html`) and then layering popup-specific pieces (explicit overrides win to preserve behavior).
- [x] Add a small coercion layer in popup defaults for known “type mismatch” keys:
  - [x] Sliders: `popupBottomBarOpacityValue`, `popupSlimSidebarOpacityValue` coerce to **numbers** when auto-extending from `OPTIONS_DEFAULTS`.
  - [x] Shortcut defaults: convert legacy single chars (like `'a'`) into `KeyboardEvent.code` values (like `'KeyA'`) when auto-extending from `OPTIONS_DEFAULTS`.
  - [x] Cleared shortcut slots: keep using NBSP (`'\u00A0'`) for “empty” when auto-extending from `OPTIONS_DEFAULTS`.
- [x] Keep model picker logic unchanged (still handled via `modelPickerKeyCodes` + existing extraction/hydration logic).

**Technical notes**
- `OPTIONS_DEFAULTS` includes *both* shortcuts and toggles today, but shortcuts are mostly “single char” defaults there; popup internally works in `KeyboardEvent.code`. The plan is to convert those defaults at runtime in popup only (no storage migration required).
- The implemented approach intentionally avoids changing any existing popup defaults (it only fills in keys that weren’t present in `DEFAULT_PRESET_DATA`). This keeps behavior stable while still removing a lot of “add the key in popup.js too” work for future features.

---

### Phase 2 — Reduce duplicate shortcut defaults in `content.js` (safe, minimal churn)
**Plain language:** Make `content.js` pull shortcut keys from one list and stop repeating them.

- [x] Keep `shortcutDefaults` as a single object in `content.js` and always fetch with `Object.keys(shortcutDefaults)`.
- [x] Align `shortcutDefaults` values with popup’s stored format (`KeyboardEvent.code`) so matching is consistent and future-proof.
- [x] If any shortcut is “special” (like the model toggle), use `matchesShortcutKey(...)` instead of manual string comparisons (done for the model toggle).

---

### Phase 3 — Optional bigger simplification: shared schema file (only if you want it)
**Plain language:** Put “which settings exist” into one shared file, so adding a new setting updates even fewer places.

- [x] Add a new file (example name: `settings-schema.js`) that defines:
  - [x] The list of “visibility/toggle” keys used by `content.js` (now `content.visibilityDefaults`)
  - [x] The list of “shortcut” keys used by both popup and content (shared convention: `shortcutKey*` prefix + `extraShortcutKeys`, plus schema-driven overlay section groupings)
  - [x] Any special-case exclusions (model picker mode radios, fade slim sidebar, etc.) (centralized under schema config)
- [x] Load it in `popup.html` before `popup.js`.
- [x] (Optional) Also load it in `manifest.json` before `content.js` as a content script (now used to supply small shared config like visibility extra keys).

**Why optional:** This touches `manifest.json` and adds another moving piece. The Phase 1/2 changes already provide most of the win without that risk.

---

## “Add a new setting” workflow after Phase 1/2
### New toggle (checkbox)
These are per-feature steps (do them each time; not a “check once” list):
- Add default key/value to `options-storage.js` (`OPTIONS_DEFAULTS`).
- Add the checkbox to `popup.html` with `id="<storageKey>"` and `data-sync="<storageKey>"`.
- Add content behavior:
  - Add the key + default to `settings-schema.js` → `content.visibilityDefaults` (so content auto-loads it).
  - Use `window.<storageKey>` in the feature logic in `content.js`.
- Add i18n strings in `_locales/*/messages.json` and use them in `popup.html`.
- Update `CHANGELOG.md` if user-visible.

### New shortcut (Alt+ key input)
These are per-feature steps (do them each time; not a “check once” list):
- Add default key/value to `options-storage.js` (`OPTIONS_DEFAULTS`).
- Add the shortcut input to `popup.html` with `class="key-input"` and `data-sync="<storageKey>"` (id may differ; `data-sync` is the key).
- Add content behavior in `content.js`:
  - Add the key to `shortcutDefaults`
  - Add the handler to `keyFunctionMappingAlt` (or the appropriate mapping)

---

## Quick “does it work” verification (no tests)
Manual QA checklist:
- Open extension popup and toggle a setting → confirm toast + it stays after closing/reopening popup.
- Reload ChatGPT tab → confirm the behavior changes.
- Change a shortcut → confirm it persists + it triggers on ChatGPT after reload.
- Verify model picker still works (Alt/Ctrl mode, digits) — unchanged code paths.

---

## Notes / plan adjustments discovered
- `content.js` had a fallback default of `0.6` for `popupSlimSidebarOpacityValue` inside the slim sidebar fade logic even though popup/`OPTIONS_DEFAULTS` default to `0.0`. This has been aligned to `0.0` to reduce surprise behavior on first enable.
- When auto-extending popup defaults from `OPTIONS_DEFAULTS`, only actual shortcut keys should be treated as “shortcut-like”. Boolean behavior flags (like the select+copy-all radio group keys) are intentionally *not* coerced to NBSP.
- Shared schema is now in `settings-schema.js` and currently covers popup wiring excludes + a small defaults exclude list. The “content.js key lists” portion is still optional/future.
- `settings-schema.js` is now also loaded as a content script (before `content.js`) so `content.js` can read small shared config safely.
- Added a popup-time console warning when `popup.html` contains a `data-sync` key that’s missing from `OPTIONS_DEFAULTS` and `DEFAULT_PRESET_DATA`. This is a low-friction way to catch forgotten wiring.
- Shortcuts-overlay section groupings in `content.js` are now schema-driven via `shortcuts.overlaySections` (model picker grid remains separate and unchanged).
- Popup radio-group definitions are now schema-driven via `popup.radioGroups` to reduce “update this array too” maintenance.

---

## Feature-Add Comparison (plain language)
- Before: add a new toggle → update `options-storage.js`, update `popup.html`, update `popup.js` in multiple places (defaults + manual event wiring), update `content.js` in multiple places (defaults map + storage get list).
- Now: add a new toggle → update `options-storage.js`, update `popup.html` (`data-sync`), update `settings-schema.js` (`content.visibilityDefaults`), then write the actual feature logic in `content.js`. Popup wiring/default seeding happens automatically.
- Before: add a new shortcut input → update `popup.html`, update a hardcoded `shortcutKeys` array in `popup.js`, update `content.js` storage key list, then add the handler.
- Now: add a new shortcut input → update `popup.html` (`class="key-input"` + `data-sync`), add a default in `options-storage.js` (popup will seed it), add the key + handler in `content.js` (`shortcutDefaults` + `keyFunctionMappingAlt`). No popup.js list updates.
- Safeguard: popup logs a warning if `popup.html` has a `data-sync` key that doesn’t exist in `OPTIONS_DEFAULTS` or popup defaults, catching “forgot to add the storage key” mistakes early.

---

## One-time TODOs (project hygiene)
- [x] Update `AGENTS.md` with a clear “wiring map” section and remove outdated instructions about manually updating many lists for each new setting/shortcut.

---

## Final polish (completed)
- [x] Make popup radio-group handling schema-driven by membership (no order-dependent arrays).
- [x] Warn if `settings-schema.js` radioGroups contain unknown keys (catches typos early).
- [x] Add `schemaVersion` to `settings-schema.js` for future evolution without guesswork.
- [x] Document `schemaVersion` usage in `AGENTS.md`.
- [x] Keep model picker logic unchanged (no edits to `modelPickerKeyCodes` flows or label extraction).

---

## Rollback plan (if something feels off)
- `git diff` to review changes
- `git checkout -- popup.js content.js` to revert just these files (or use your editor history)
