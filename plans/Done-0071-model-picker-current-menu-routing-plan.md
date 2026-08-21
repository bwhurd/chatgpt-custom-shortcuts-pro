# Model Picker Current-Menu Routing Plan

## Investigation findings

- [x] Work model shortcuts succeed across Sol, Terra, Luna, and GPT-5.5 in the live signed-in tab.
- [x] Chat model shortcuts succeed from the compact GPT menu, but switching from the integrated o3 menu leaves the picker open and keeps o3 selected.
- [x] The integrated o3 menu exposes a native model submenu containing GPT-5.6 Sol, GPT-5.5, and o3; the cached Chat catalog's `pillMenu: true` currently forces the wrong pill-only route.
- [x] Work GPT-5.5 exposes four effort rows; Max is legitimately unavailable for that model and should not be treated as a routing failure.
- [x] The integrated o3 menu exposes its model submenu only after opening the direct `role="menuitem"[aria-haspopup="menu"]` trigger; the failure was caused before that trigger was reached.
- [x] The signed-in profile had both the Web Store and unpacked extension copies attached; disabling the Web Store copy left only the dev runtime handling shortcuts.
- [x] Rapid visible shortcuts could begin while the prior picker was still closing; the action runner now waits for menu settlement and closes cleanly when a model lacks a requested effort row.

## Scope

- [x] Route model actions by the currently open menu shape, not only by cached catalog capability.
- [x] Preserve compact Chat/Work pill routing and integrated o3 submenu routing.
- [x] Add a regression fixture for integrated-to-pill and pill-to-integrated model transitions.

## Implementation plan

- [x] Update the model action runner to detect an open pill menu before using the pill route; otherwise use the integrated model submenu.
- [x] Add focused source/structural assertions for both routes and menu cleanup.
- [x] Validate the live signed-in Chrome tab across Chat and Work model, effort, and speed shortcuts.

## Validation

- [x] Run focused model-picker fixtures, syntax checks, Biome, settings validation, and `git diff --check`.
- [x] Reload the extension and verify o3 → GPT and GPT → o3 transitions leave no menu open.

## Done when

- [x] Chat model shortcuts work from both compact GPT and integrated o3 states.
- [x] Work model, effort, and speed shortcuts continue to work from collapsed and expanded menus.
- [x] Tight Work model/effort bursts resolve to the last valid action, and GPT-5.5 Max (unavailable) leaves the picker closed.
- [x] The final live page is usable with no picker left open.

## Related specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] `specs/0006-runtime-scrape-selector-validator-spec.md`
