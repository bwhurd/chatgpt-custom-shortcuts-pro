# Model Refresh Routing and Picker Repair

## Goal

- [x] Make popup model refresh reliably locate the authenticated ChatGPT tab even when the popup/action window is the active window, then adapt scraping to ChatGPT's current integrated Select model view.

## Investigation findings

- [x] `extension/popup.js` fell back to the active popup tab because `pickBestChatGptTab` returned the first tab even when no tab matched `chatgpt.com`; MV3 URL visibility also means the active tab ID must remain usable when `tab.url` is unavailable.
- [x] The current model picker keeps the advanced model rows in the same integrated menu and exposes the model-view trigger as `role="menuitem" aria-label="Select model"`, without the older submenu attributes.
- [x] The current integrated menu exposes Fast mode as a structural `role="menuitemcheckbox"[data-fast-mode-enabled]` and Reset to default as the existing structural reset row; neither was included in the integrated catalog result.
- [x] The live Work picker confirms the second click target is the dynamic central model/effort menuitem under `[data-model-selection-view="true"]`; its visible label must never be used as a selector.
- [x] The live Advanced panel confirms the native `Default` row precedes five real Work models. The native row keeps ChatGPT's `Alt+F5`; the five model rows are catalog-backed extension actions with independent ids/slots.
- [x] The first dynamic Work row no longer inherits the static latest action identity when a refreshed catalog is rebuilt.
- [x] ChatGPT keeps the simple and advanced slider panels mounted; the active panel is identified by its own `data-active` attribute, and the central trigger is not a model row.
- [x] Effort shortcuts target the live simple Power slider; if Advanced is active, the runtime closes and reopens the composer picker before activating the matching structural tick (with a bounded keyboard fallback).

## Scope

- [x] Prefer real ChatGPT URLs, then probe the active tab ID when URL visibility is restricted, with an all-ChatGPT fallback when the popup window is active.
- [x] Recognize and scrape the current same-menu Select model view while preserving Advanced-first behavior and legacy fallbacks.
- [x] Persist the current 1.5x speed capability and Reset to default capability, route both runtime actions through their live integrated controls, and center their shortcut hints below the controls.
- [x] Keep the integrated effort slider free of extension/native shortcut labels and replace the reset row's native hint with the configured utility hint using scoped structural CSS and DOM cleanup.
- [x] Route Instant/Medium/High/Extra High/Max actions through the integrated Power slider while retaining the legacy pill/configure fallbacks.
- [x] Make the Advanced-first scraper resolve the in-place Advanced panel from the structural central trigger, with a language-agnostic fallback when state discovery omits the trigger.
- [x] Read the active Advanced panel directly for both scraping and live hinting, reschedule after its structural trigger toggles, and persist the observed native row order.
- [x] Add focused fixtures for popup tab routing and the current picker shape, update the concise changelog, and validate through the live extension.

## Out of scope

- [ ] Do not add permissions, broaden host access, or rewrite unrelated shortcut behavior.
- [ ] Do not remove legacy picker paths while current and legacy surfaces remain supported.

## Likely owning files

- [x] `extension/popup.js`
- [x] `extension/content.js`
- [x] `extension/shared/model-picker-selectors.js`
- [x] `tests/`
- [x] `CHANGELOG.md`

## Validation

- [x] Run focused fixture tests, syntax checks, Biome, `npm run validate:keys`, and `git diff --check`.
- [x] Reload the extension in Chrome, run Update Model List, and verify the authenticated tab and current-menu routing live.

## Done when

- [x] The popup never reports a missing ChatGPT tab merely because its own popup window is focused.
- [x] Current integrated model rows scrape successfully after the model view is opened, with Advanced-first gating preserved.
- [x] Live refresh completes with populated catalogs and no stale popup error.

## Related specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] `specs/0006-runtime-scrape-selector-validator-spec.md`
