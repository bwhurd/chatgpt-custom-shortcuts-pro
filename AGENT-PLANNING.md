## Goal
Make adding new toggles/shortcuts require fewer “wire it here too” edits, while keeping behavior stable and avoiding fragile refactors (model picker grid logic stays as-is).

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
- Ctrl+/ overlay section groupings in `content.js` are now schema-driven via `shortcuts.overlaySections` (model picker grid remains separate and unchanged).
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
