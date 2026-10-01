# Plan 0089: Shortcut target catalog and live click audit

## Goal

- [x] Refresh the existing shortcut target catalog from the shared metadata registry and record a current CDP click audit for every applicable target.

## Scope

- [x] Update `specs/chatgpt-shortcut-target-catalog-2026-09-27.md` with every registered target's locator, structural match groups, required UI states, dependent shortcut actions, and live click result.
- [x] Use the documented `CodexCleanProfile` CDP session and audit-owned conversation state for live checks.
- [x] Record non-click targets and state-gated targets explicitly; distinguish unavailable or unsafe states from selector misses.
- [x] Use a temporary window-capture interceptor for side-effectful target probes; record state-preparation clicks and label synthetic DOM-click fallbacks.

## Validation

- [x] Compare the catalog inventory count and target/action references against `extension/shared/shortcut-action-metadata.js`.
- [x] Confirm each reported click result is backed by the CDP event record and state the limits of that proof.
- [x] Reread the edited catalog and this plan's completion status; do not modify runtime source or extension permissions.

## Related specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] `specs/0006-runtime-scrape-selector-validator-spec.md`
