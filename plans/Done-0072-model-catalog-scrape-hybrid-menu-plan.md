# Model catalog scrape hybrid-menu repair (complete)

## Goal

- [x] Make manual Chat/Work model refresh observe the current ChatGPT menu shell, expand Advanced before compact-menu scraping, and capture every model/effort/speed surface across the GPT and integrated o3 transitions.

## Investigation findings

- [x] ChatGPT currently exposes a compact Power menu with an Advanced toggle for GPT models, a three-submenu Power menu in Work, and an integrated Intelligence menu after switching Chat to o3.
- [x] The shortcut runner already routes by the menu that is actually open, but the scrape model-switch helper still attempts the compact route first even when the integrated menu is already active.
- [x] The scrape path now uses structural Advanced expansion and the same live-menu route strategy as shortcuts.
- [x] The integrated fallback now rejects a catalog when one discovered model fails to yield effort rows before persistence.

## Scope

- [x] Update `extension/content.js` for hybrid scrape routing/Advanced preparation and add one concise user-facing changelog bullet.
- [x] Extend `tests/model-picker-pill-three-menu-fixture.mjs` with source assertions covering the scrape route decision.
- [x] Do not broaden permissions, change model labels, or change popup persistence semantics.

## Implementation plan

- [x] Route scrape model selection from the currently open menu: use the verified pill path only for an open pill menu, the integrated path for the Intelligence menu, and retain bounded fallbacks when no menu is open.
- [x] Keep Advanced expansion structural and awaited before compact-menu inventory or model switching.
- [x] Reject incomplete integrated catalogs instead of persisting a partial model list.
- [x] Preserve the existing two-submenu Chat hybrid fallback, three-submenu Work completeness check, and final active-model restoration.

## Validation

- [x] Run the focused pill/dual-surface fixtures, no-switcher guard, and `node --check extension/content.js`.
- [x] Run Biome, `npm run validate:keys`, and `git diff --check`.
- [x] Reconnect the signed-in Chrome tab after extension reload, run the refresh path, and verify the debug/result model counts and clean restored state.

## Done when

- [x] Refresh no longer waits on or misroutes through a stale compact-menu assumption after an integrated model transition.
- [x] Chat refresh captures GPT and o3 effort rows; Work refresh captures all visible models, effort rows, and both speed rows; the active surface/model is restored.
