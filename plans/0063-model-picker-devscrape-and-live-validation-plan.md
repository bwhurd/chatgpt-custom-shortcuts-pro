# Model Picker DevScrape and Live Validation Plan

## Goal

- [ ] Prove the current paid-account Work pill exposes the complete Model, Effort, and Speed matrix and restores its initial selection after refresh.
- [ ] Align DevScrape's required model-picker artifacts with the current main-menu and controlled-submenu structure.

## Remaining work

- [ ] Capture a paid Work refresh covering every exposed Model, Effort, and Speed choice, then confirm the initial model, effort, and speed are restored.
- [ ] Update DevScrape expectations so main, Model, Effort, and Speed states are primary; retain integrated/two-level and Configure captures only when those compatibility fallbacks are reachable.
- [ ] Run a paid dual-surface popup refresh and verify Chat and Work snapshots are both stored, the initial surface is restored, and scraper-opened menus are closed.
- [ ] Run the focused model-picker fixtures and the smallest runtime selector/DevScrape validation that covers the current model-picker family.

## Constraints

- [ ] Keep selectors structural and language-agnostic.
- [ ] Preserve the existing primary pill scraper and ordered integrated/two-level and Configure fallbacks.
- [ ] Do not mutate either independent 15-slot shortcut profile during refresh.

## Done when

- [ ] Current model-picker DevScrape validation does not fail solely because Configure is absent.
- [ ] The live paid refresh proves complete per-model metadata, dual-surface persistence, initial-state restoration, and menu cleanup.
