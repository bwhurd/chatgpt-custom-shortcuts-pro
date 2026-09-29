# Plan 0089: Shortcut target catalog and live click audit

## Goal

- [ ] Refresh the existing shortcut target catalog from the shared metadata registry and record a current CDP click audit for every applicable target.

## Scope

- [ ] Update `specs/chatgpt-shortcut-target-catalog-2026-09-27.md` with every registered target's locator, structural match groups, required UI states, dependent shortcut actions, and live click result.
- [ ] Use the documented `CodexCleanProfile` CDP session and audit-owned conversation state for live checks.
- [ ] Record non-click targets and state-gated targets explicitly; distinguish unavailable or unsafe states from selector misses.
- [ ] Stop each test click at the document capture boundary so the report proves the target received a click event without carrying out the page action.

## Validation

- [ ] Compare the catalog inventory count and target/action references against `extension/shared/shortcut-action-metadata.js`.
- [ ] Confirm each reported click result is backed by the CDP event record and state the limits of that proof.
- [ ] Reread the edited catalog and this plan's completion status; do not modify runtime source or extension permissions.

## Related specs

- [ ] `specs/0004-model-picker-and-shortcuts-spec.md`
- [ ] `specs/0006-runtime-scrape-selector-validator-spec.md`
