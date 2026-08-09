# Model Picker Advanced Expansion Plan

## Investigation findings

- [x] Live logged-in Chrome shows Chat can use either the compact Power/Advanced menu (for current GPT models) or the integrated Intelligence menu plus a model-version submenu (for o3).
- [x] Work now opens a compact Power menu whose Advanced toggle is a direct `role="menuitem"` with `aria-expanded`; model, effort, and speed submenu triggers are visually hidden while it is collapsed.
- [x] The current Work scraper and action runners assume the three submenu triggers are ready immediately, so they can appear to work only when ChatGPT happens to remember the expanded state.
- [x] Live follow-up shows Chat now uses the same Power/Advanced shell with Model and Effort only; Work adds Speed, and neither surface currently renders the old Reset row.
- [x] The first dual refresh exposed a hybrid Chat transition: selecting o3 replaces the compact shell with the integrated Intelligence menu, causing the prior all-or-nothing pill scrape to discard already collected GPT effort rows.
- [x] The first live stability-gate attempt exposed an isolated-world scope boundary; the coordinator now reads native radios through the exported window helper used by the rest of the model-picker runtime.

## Scope

- [x] Expand the Work Power menu structurally before catalog scraping, model switching, effort switching, speed toggling, reset, and visible-hint submenu discovery.
- [x] Keep Chat integrated-menu behavior and older Work three-submenu behavior unchanged when no Advanced toggle exists.
- [x] Do not use localized `Advanced`, `Model`, `Effort`, or `Speed` text as selectors.
- [x] Persist observed Speed/Reset capabilities so Chat does not inherit Work utilities and removed Reset is not presented as working.
- [x] Make Reset capability opt-in: neither missing scrape metadata nor the popup's pre-hydration fallback may populate the retired row.
- [x] Preserve one Chat catalog across compact GPT rows and integrated o3 rows, and require a stable native surface before scraping or completing restoration.

## Implementation plan

- [x] Add a shared structural selector for the direct Advanced toggle and a bounded helper that clicks only when `aria-expanded="false"`, then waits for the expanded state.
- [x] Route every Work pill entry point through one main-menu readiness helper so scraping and switching cannot bypass expansion.
- [x] Extend the focused pill fixture with collapsed, expanded, missing-toggle, and failure cases plus guards for all action paths.
- [x] Update the model-picker spec with the Power-menu expansion contract and live menu shape.

## Validation

- [x] Run the focused model-picker selector and pill fixtures, syntax check, Biome on changed files, key validator, and `git diff --check`.
- [x] Reload the installed extension and validate live Chat and Work scraping, model/effort/speed switching, menu cleanup, and restoration of the starting Chat/Work surface.

## Done when

- [x] Work model, effort, and speed shortcuts succeed from a deliberately collapsed Advanced state and leave no picker open.
- [x] Chat switching still works through both the compact Power/Advanced menu and the integrated o3 menu.
- [x] Live catalog/profile state remains correct for both Chat and Work after a dual refresh.

## Related specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] `specs/0006-runtime-scrape-selector-validator-spec.md`
