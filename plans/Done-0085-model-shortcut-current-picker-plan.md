# Plan 0085: Restore Chat and Work model shortcuts

## Goal and evidence

- [x] Restore assigned model and effort shortcuts on both current picker surfaces without changing assignments.
- [x] Consult OpenAI's ChatGPT Work support article and model-shortcut community discussion; neither supplies a site DOM contract. Use `specs/model-picker-live-catalog-2026-09-25.md` for recorded structural evidence.
- [x] Confirm runtime shortcut routes still depend on removed Advanced-panel markers while refresh uses the current `data-model-picker-view` structure. Plan 0082 explicitly excludes shortcut dispatch, so this repair has separate ownership.

## Implementation

- [x] Add current-picker dispatch before legacy hint/submenu routes in `extension/content.js`. Resolve model identity from the active profile's catalog, read active rows only, click once, and verify the commit before persisting selection.
- [x] Route effort keys through the current Simple panel's operable reasoning control, using the selected model's catalog mapping and bounded commit waits. Retain old-menu fallbacks only for unsupported shells.
- [x] Add an executable Node fixture for Chat and Work model commits, Simple/Advanced picker states, effort changes, Work Default, and unavailable targets.
- [x] Document the runtime contract in spec 0004, run focused fixtures, syntax checks and Biome.

## Boundaries and acceptance

- [x] Preserve existing uncommitted changes, catalog-refresh work, settings, permissions and unrelated audit work.
- [x] No live browser testing, reload, publication or deployment. User performs extension reload and live acceptance after this static/automated repair.

## Related specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] `specs/model-picker-live-catalog-2026-09-25.md`
