# Composer Tool Shortcuts Repair Plan

## Goal

- [x] Restore composer-plus shortcuts for Add Photos & Files, Create Image, Web Search, and Deep Research against ChatGPT's current tool popover.
- [x] Retire Canvas as a user-facing/runtime shortcut while preserving its existing storage key as inert legacy data.

## Investigation findings

- [x] The live `Add files and more` popover no longer exposes a Radix `role="menu"` container or `role="menuitem"` action rows; current rows are focusable `div.__menu-item[tabindex="0"]` elements grouped under `role="group"`.
- [x] Current sprite tokens are `#712359` for Add Photos & Files, `#ccfd18` for Create Image, `#6d72eb` for Web Search, and `#46f45a` for Deep Research.
- [x] `content.js` still waits on `getOpenMenus()` and searches role-based rows with older Create Image/Web Search tokens, so it never resolves the current actions.

## Scope

- [x] Update only composer-tool shortcut runtime wiring, explicit shortcut metadata, popup/storage/schema/locale surfaces required for Deep Research and Canvas retirement, focused validator support, and the owning shortcut spec.
- [x] Do not add Chrome permissions, localized-text DOM targeting, or revive the removed More submenu actions.

## Implementation

- [x] Add a current/legacy composer tool row selector in `extension/content.js`, open the plus popover by its stable test id, and resolve action rows by inspector-confirmed icon tokens without localized text.
- [x] Add blank-default `shortcutKeyDeepResearch` wiring across storage, popup, schema, runtime, locales, fixture data, analytics inventory, and deterministic shortcut metadata.
- [x] Remove Canvas from popup, overlay/schema labels, locale strings, live icon targeting, and active handler ownership; keep its default/storage/import key plus explicit `not-applicable` metadata for existing installs.
- [x] Update focused Playwright/devscrape target resolution so current `.__menu-item` composer rows remain probeable.
- [x] Update `specs/0004-model-picker-and-shortcuts-spec.md` so Canvas is documented with the other removed inert legacy shortcuts.

## Validation

- [x] Run `node --check` on changed JavaScript files.
- [x] Run `npx biome check` on changed files; lint passed with formatting disabled after the normal check reported only pre-existing formatter drift in `tests/lib/settings-wiring-validator.js`.
- [x] Run `node tests/validate-keys.js`.
- [x] Run `node tests/playwright/devscrape-wide.mjs --action check-wide`; the June 11 saved scrape remains broadly stale (43 shortcut failures and 8 missing/failed dumps), separate from the focused wiring checks.
- [x] Re-check the live composer popover selectors against the observed Chrome DOM; each of the four current action tokens resolved to exactly one visible `div.__menu-item` row.
- [x] Regenerate the intentional popup screenshot baseline and rerun `npm run test:popup-visual` successfully.

## Done when

- [x] All four current composer tools have complete shortcut wiring and current DOM targets.
- [x] Canvas is absent from user-facing and active runtime surfaces, with only deliberate legacy storage/default and `not-applicable` references remaining.
- [x] Focused static validation passes and any live/manual reload requirement is reported clearly.

## Related specs

- [x] `specs/0001-adding-new-settings-spec.md`
- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] `specs/0005-popup-settings-validator-spec.md`
- [x] `specs/0007-anonymous-usage-analytics-spec.md`
