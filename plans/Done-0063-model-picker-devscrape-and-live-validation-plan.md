# Chat/Work Surface and Model Refresh Repair Plan

## Goal

- [x] Restore the shared Chat/Work surface resolver so the shortcut toggle and popup model refresh work against ChatGPT's current blank-chat markup.
- [x] Refresh both Chat and Work catalogs so the popup and exposed model menus render profile-correct labels and shortcut hints.

## Investigation findings

- [x] The live blank-chat selector is now a visible header `role="radiogroup"` containing exactly two `button[role="radio"][aria-checked]` controls with one checked; the runtime and validator previously required `role="group"`.
- [x] The stale resolver made `Toggle Chat / Work` return without selecting a destination and made dual refresh stop with `CHAT_WORK_SELECTOR_NOT_FOUND` before either profile scrape.
- [x] The current Chat menu still satisfies the existing integrated scraper: it has `composer-intelligence-picker-content`, three direct effort rows, and a model submenu containing `GPT-5.6 Sol`, `GPT-5.5`, `GPT-5.3`, and `o3`.
- [x] The incorrect Chat-side `F4` hint on the model submenu trigger was stale Work-profile pairing caused by the failed refresh, not a second Chat menu selector break.

## Implementation plan

- [x] Put the accepted `group` / `radiogroup` wrapper selectors, match groups, and executable resolver in `extension/shared/model-picker-selectors.js`.
- [x] Route `extension/content.js` Chat/Work detection through the shared resolver while preserving the exact-two-visible-radios and reciprocal checked-state guards.
- [x] Derive the `chat-work-surface-toggle` runtime-validator metadata from the same shared selector contract.
- [x] Add a deterministic DOM fixture covering the legacy and current wrapper roles plus malformed radio groups, and update the stale no-switcher scrape-order assertion.
- [x] Keep the current Chat integrated scraper, Work pill scraper, per-profile persistence, initial-mode restoration, and popup hydration paths unchanged unless validation exposes another concrete defect.

## Constraints

- [x] Keep targeting structural and language-agnostic; do not depend on the localized Chat/Work label or `aria-label`.
- [x] Do not hardcode dynamic model names in `popup.html` or split label truth from `shared/model-picker-labels.js`.
- [x] Do not add permissions, URL-filtered tab queries, polling, or shortcut-profile mutation.
- [x] Preserve unrelated in-progress edits in `content.js`, shortcut metadata, tests, and specs.

## Validation

- [x] Run the new Chat/Work surface resolver fixture.
- [x] Run the dual-surface refresh, pill-menu, thinking-effort, no-switcher, slot-uniqueness, shortcut metadata, and popup profile fixtures.
- [x] Run Biome only on the changed JavaScript files.
- [x] Reload the unpacked extension and verify blank Chat → Work → Chat, popup dual refresh, restored initial mode, updated Chat/Work popup snapshots, and profile-correct visible-menu hints.

## Done when

- [x] Toggle Chat/Work succeeds from a blank page and from an existing conversation through the new-conversation path.
- [x] Refresh attempts both profiles, stores `modelCatalogLegacy` / `modelNamesLegacy` and `modelCatalogLatest` / `modelNamesLatest`, restores the starting surface, and closes scraper-opened UI.
- [x] The popup updates immediately from both stored snapshots without changing either independent 15-slot shortcut profile.
- [x] Chat's exposed menu shows effort hints only on the three direct effort rows and model-slot hints on the model submenu choices; Work remains correct.

## Related specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] `specs/0006-runtime-scrape-selector-validator-spec.md`
